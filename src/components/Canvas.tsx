import { useCallback, useRef, useLayoutEffect, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { StampId } from '../types';
import type { DrawingDocument, DrawingTool } from '../drawing/types';
import { DrawingSession } from '../drawing/session';
import { fitViewport, pointerToWorld, type DrawingViewport } from '../drawing/viewport';
import { visibleDrawingBounds } from '../drawing/visibleBounds';
import type { DrawingRect } from '../drawing/geometry';
import { drawStrokePoint, renderDocument, renderOperation } from '../drawing/renderer';
import { drawingToPng } from '../artworkExport';

interface CanvasProps {
    document: DrawingDocument;
    tool: DrawingTool;
    color: string;
    brushSize: number;
    isRainbow: boolean;
    stampId: StampId;
    backgroundColor: string;
    onChange: (drawing: DrawingDocument) => void;
    onHistoryChange: (canUndo: boolean) => void;
    onStrokeStart?: () => void;
    onStrokeEnd?: () => void;
    onStampPlaced?: (stampId: StampId) => void;
}

/** Parent actions always finalize a current gesture before changing or exporting it. */
export interface CanvasHandle {
    undo: () => void;
    clear: () => void;
    finishStroke: () => void;
    exportPng: (backgroundColor: string) => Promise<Blob>;
}

/** A full-viewport drawing surface with a stable, uniform artwork camera. */
export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas({
    document: drawing,
    tool,
    color,
    brushSize,
    isRainbow,
    stampId,
    backgroundColor,
    onChange,
    onHistoryChange,
    onStrokeStart,
    onStrokeEnd,
    onStampPlaced,
}, ref) {
    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appliedLayoutRef = useRef<{ fit: DrawingViewport; bounds: DrawingRect } | null>(null);
    const clearViewsRef = useRef(new WeakMap<DrawingDocument, { previous: DrawingDocument; fit: DrawingViewport; bounds: DrawingRect }>());
    const sessionRef = useRef(new DrawingSession(drawing));
    const callbacksRef = useRef({ onChange, onHistoryChange, onStrokeStart, onStrokeEnd, onStampPlaced });

    useLayoutEffect(() => {
        callbacksRef.current = { onChange, onHistoryChange, onStrokeStart, onStrokeEnd, onStampPlaced };
    }, [onChange, onHistoryChange, onStrokeStart, onStrokeEnd, onStampPlaced]);

    /** Restore finalized and in-flight content after resizing or undoing. */
    const repaint = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const camera = appliedLayoutRef.current?.fit;
        if (!canvas || !ctx || !camera) return;
        const session = sessionRef.current;
        const dx = canvas.width / camera.width, dy = canvas.height / camera.height;
        ctx.setTransform(dx * camera.scale, 0, 0, dy * camera.scale, dx * camera.offsetX, dy * camera.offsetY);
        renderDocument(ctx, session.document);
        if (session.activeOperation) renderOperation(ctx, session.activeOperation);
    }, []);

    /** Emit only finalized changes and their corresponding undo availability. */
    const publish = useCallback((next: DrawingDocument | null) => {
        if (!next) return;
        callbacksRef.current.onChange(next);
        callbacksRef.current.onHistoryChange(sessionRef.current.canUndo);
    }, []);

    /** Release ownership before capture callbacks can fire and commit at most once. */
    const finish = useCallback((pointerId?: number) => {
        const session = sessionRef.current;
        const ownedPointer = session.activePointerId;
        const wasStroke = session.activeOperation?.kind === 'stroke';
        const next = session.finish(pointerId);
        if (!next) return;
        const canvas = canvasRef.current;
        if (canvas && ownedPointer !== null && canvas.hasPointerCapture(ownedPointer)) {
            canvas.releasePointerCapture(ownedPointer);
        }
        if (wasStroke) callbacksRef.current.onStrokeEnd?.();
        publish(next);
    }, [publish]);

    /** Consume coalesced samples without replaying the entire document per pointer move. */
    const appendPointerSamples = useCallback((event: PointerEvent) => {
        const canvas = canvasRef.current;
        const session = sessionRef.current;
        if (!canvas || event.pointerId !== session.activePointerId || session.activeOperation?.kind !== 'stroke') return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const camera = appliedLayoutRef.current?.fit;
        if (!camera) return;
        const coalesced = event.getCoalescedEvents?.() ?? [];
        const samples = coalesced.length > 0 ? coalesced : [event];
        for (const sample of samples) {
            const point = pointerToWorld(sample.clientX, sample.clientY, rect, camera);
            if (!point || !session.move(event.pointerId, point)) continue;
            if (ctx) drawStrokePoint(ctx, session.activeOperation, session.activeOperation.points.length - 1, session.hue);
        }
    }, []);

    useLayoutEffect(() => {
        // Local publications already match this reference; external replacements start a new history.
        if (drawing !== sessionRef.current.document) {
            sessionRef.current = new DrawingSession(drawing);
            const layout = appliedLayoutRef.current;
            if (layout) layout.fit = fitViewport(layout.bounds.width, layout.bounds.height, visibleDrawingBounds(drawing), window.devicePixelRatio);
            callbacksRef.current.onHistoryChange(false);
            repaint();
        }
    }, [drawing, repaint]);

    useLayoutEffect(() => {
        const stage = stageRef.current;
        const canvas = canvasRef.current;
        if (!stage || !canvas) return;
        /** Finalize the old coordinate sequence before changing the full-stage camera. */
        const resize = () => {
            const bounds = stage.getBoundingClientRect();
            if (bounds.width <= 0 || bounds.height <= 0) return;
            const previous = appliedLayoutRef.current;
            const density = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
            if (previous && previous.fit.pixelWidth === Math.round(bounds.width * density) && previous.fit.pixelHeight === Math.round(bounds.height * density)
                && previous.bounds.left === bounds.left && previous.bounds.top === bounds.top
                && previous.bounds.width === bounds.width && previous.bounds.height === bounds.height) return;
            finish();
            const fit = fitViewport(bounds.width, bounds.height, visibleDrawingBounds(sessionRef.current.document), window.devicePixelRatio);
            appliedLayoutRef.current = { fit, bounds };
            canvas.dataset.camera = JSON.stringify({ scale: fit.scale, offsetX: fit.offsetX, offsetY: fit.offsetY });
            canvas.style.width = `${fit.width}px`;
            canvas.style.height = `${fit.height}px`;
            if (canvas.width !== fit.pixelWidth || canvas.height !== fit.pixelHeight) {
                canvas.width = fit.pixelWidth;
                canvas.height = fit.pixelHeight;
            }
            repaint();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(stage);
        window.addEventListener('resize', resize);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', resize);
        };
    }, [finish, repaint]);

    useEffect(() => {
        callbacksRef.current.onHistoryChange(sessionRef.current.canUndo);
        const handleBlur = () => finish();
        const handleVisibility = () => { if (document.visibilityState === 'hidden') finish(); };
        const handlePointerUp = (event: PointerEvent) => { appendPointerSamples(event); finish(event.pointerId); };
        const handlePointerCancel = (event: PointerEvent) => finish(event.pointerId);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
            document.removeEventListener('visibilitychange', handleVisibility);
            finish();
        };
    }, [appendPointerSamples, finish]);

    useImperativeHandle(ref, () => ({
        undo: () => {
            finish();
            const clearedView = clearViewsRef.current.get(sessionRef.current.document);
            const next = sessionRef.current.undo();
            const layout = appliedLayoutRef.current;
            // A clear resets the view; undoing that clear restores the previous view as well.
            // Other undos keep the paper stationary, so removing a dot never moves the remaining ink.
            if (next && clearedView?.previous === next && layout) {
                layout.fit = layout.bounds.width === clearedView.bounds.width && layout.bounds.height === clearedView.bounds.height
                    ? clearedView.fit : fitViewport(layout.bounds.width, layout.bounds.height, visibleDrawingBounds(next), window.devicePixelRatio);
                if (canvasRef.current) canvasRef.current.dataset.camera = JSON.stringify(layout.fit);
            }
            publish(next); repaint();
        },
        clear: () => {
            finish();
            const previous = sessionRef.current.document;
            const next = sessionRef.current.clear();
            const layout = appliedLayoutRef.current;
            if (next && layout) {
                clearViewsRef.current.set(next, { previous, ...layout });
                layout.fit = fitViewport(layout.bounds.width, layout.bounds.height, visibleDrawingBounds(next), window.devicePixelRatio);
                if (canvasRef.current) canvasRef.current.dataset.camera = JSON.stringify(layout.fit);
            }
            publish(next); repaint();
        },
        finishStroke: () => finish(),
        exportPng: async (paperColor: string) => {
            finish();
            return drawingToPng(sessionRef.current.document, paperColor);
        },
    }), [finish, publish, repaint]);

    /** Claim only the first primary contact and draw its initial dot or stamp immediately. */
    const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const canvas = event.currentTarget;
        const session = sessionRef.current;
        const camera = appliedLayoutRef.current?.fit;
        if (!camera) return;
        const point = pointerToWorld(event.clientX, event.clientY, canvas.getBoundingClientRect(), camera);
        if (!point || !session.begin({ pointerId: event.pointerId, isPrimary: event.isPrimary, button: event.button, point }, {
            tool, color, size: brushSize, rainbow: isRainbow, stampId, unitScale: 1 / camera.scale,
        })) return;
        // A lost native contact may reject capture; window up/cancel listeners still finish the gesture.
        try { canvas.setPointerCapture(event.pointerId); } catch { /* No native contact remains to capture. */ }
        const ctx = canvas.getContext('2d');
        const operation = session.activeOperation;
        if (operation && ctx) renderOperation(ctx, operation);
        if (operation?.kind === 'stamp') callbacksRef.current.onStampPlaced?.(operation.stampId);
        else callbacksRef.current.onStrokeStart?.();
    };

    return (
        <div ref={stageRef} className="paper-stage" style={{
            width: '100%', height: '100%', minWidth: 0, minHeight: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <canvas
                ref={canvasRef}
                className="drawing-paper"
                data-testid="painting-canvas"
                aria-label="おえかきする かみ"
                style={{ touchAction: 'none', display: 'block', flex: 'none', backgroundColor, maxWidth: '100%', maxHeight: '100%' }}
                onPointerDown={handlePointerDown}
                onPointerMove={(event) => appendPointerSamples(event.nativeEvent)}
                onPointerUp={(event) => { appendPointerSamples(event.nativeEvent); finish(event.pointerId); }}
                onPointerCancel={(event) => finish(event.pointerId)}
                onLostPointerCapture={(event) => finish(event.pointerId)}
                onContextMenu={(event) => event.preventDefault()}
            />
        </div>
    );
});
