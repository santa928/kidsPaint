import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

interface CanvasProps {
    color: string;
    brushSize: number;
    isEraser: boolean;
    isRainbow: boolean;
    onHistoryChange: (canUndo: boolean) => void;
    onDrawStart?: () => void;
    onDrawEnd?: () => void;
}

export interface CanvasHandle {
    undo: () => void;
    clear: () => void;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({
    color,
    brushSize,
    isEraser,
    isRainbow,
    onHistoryChange,
    onDrawStart,
    onDrawEnd,
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const undoStackRef = useRef<ImageData[]>([]);
    const lastPosRef = useRef<{ x: number, y: number } | null>(null);
    const rainbowHueRef = useRef<number>(0);
    const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const baseSizeRef = useRef<{ width: number, height: number } | null>(null);

    const ensureSourceCanvas = (displayWidth: number, displayHeight: number) => {
        if (displayWidth <= 0 || displayHeight <= 0) return null;
        if (!baseSizeRef.current) {
            baseSizeRef.current = { width: displayWidth, height: displayHeight };
        }
        let source = sourceCanvasRef.current;
        if (!source) {
            source = document.createElement('canvas');
            sourceCanvasRef.current = source;
        }
        const base = baseSizeRef.current;
        if (source.width !== base.width || source.height !== base.height) {
            source.width = base.width;
            source.height = base.height;
        }
        return source;
    };

    const renderFromSource = (displayCanvas: HTMLCanvasElement) => {
        const source = ensureSourceCanvas(displayCanvas.width, displayCanvas.height);
        if (!source) return;
        const ctx = displayCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
        ctx.drawImage(source, 0, 0, displayCanvas.width, displayCanvas.height);
    };

    // Initialize canvas size
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const nextWidth = parent.clientWidth;
                const nextHeight = parent.clientHeight;
                if (nextWidth <= 0 || nextHeight <= 0) return;
                if (canvas.width === nextWidth && canvas.height === nextHeight) return;

                canvas.width = nextWidth;
                canvas.height = nextHeight;
                renderFromSource(canvas);
                // Fill white initially or just rely on CSS background? 
                // If we want to save/export, we might need actual white pixels, 
                // but for now CSS background is sufficient for display.
                // However, for eraser (destination-out) to work visually, CSS background is key.
            }
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    // Expose methods
    useImperativeHandle(ref, () => ({
        undo: () => {
            const canvas = canvasRef.current;
            if (!canvas || undoStackRef.current.length === 0) return;
            const source = ensureSourceCanvas(canvas.width, canvas.height);
            const sourceCtx = source?.getContext('2d');
            if (!source || !sourceCtx) return;

            const previous = undoStackRef.current.pop();
            if (previous) {
                sourceCtx.clearRect(0, 0, source.width, source.height);
                sourceCtx.putImageData(previous, 0, 0);
                renderFromSource(canvas);
            }
            onHistoryChange(undoStackRef.current.length > 0);
        },
        clear: () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const source = ensureSourceCanvas(canvas.width, canvas.height);
            const sourceCtx = source?.getContext('2d');
            if (!source || !sourceCtx) return;

            saveState(); // Save before clear? Issue says "MVP: Can't undo clear". 
            // But implementation note said "Clear stack after clear" in one option.
            // Wait, issue "8. ぜんぶけす" > "MVP案：クリア後は戻せない（誤操作防止を優先）"
            // So we clear stack.
            undoStackRef.current = [];
            onHistoryChange(false);

            sourceCtx.clearRect(0, 0, source.width, source.height);
            renderFromSource(canvas);
        }
    }));

    const saveState = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const source = ensureSourceCanvas(canvas.width, canvas.height);
        const sourceCtx = source?.getContext('2d');
        if (!source || !sourceCtx) return;
        if (source.width <= 0 || source.height <= 0) return;

        if (undoStackRef.current.length >= 20) {
            undoStackRef.current.shift(); // Remove oldest
        }
        undoStackRef.current.push(sourceCtx.getImageData(0, 0, source.width, source.height));
        onHistoryChange(true);
    };

    const getPoint = (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const source = ensureSourceCanvas(canvas.width, canvas.height);
        if (!source) return { x: 0, y: 0 };
        if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
        const scaleX = source.width / rect.width;
        const scaleY = source.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDrawing(true);
        lastPosRef.current = getPoint(e);

        saveState(); // Save state BEFORE drawing starts? 
        // Usually undo restores to state BEFORE the stroke. 
        // So yes, push current state to stack now.

        onDrawStart?.();

        // Draw a dot if just tapped?
        const canvas = canvasRef.current;
        if (canvas && lastPosRef.current) {
            const source = ensureSourceCanvas(canvas.width, canvas.height);
            const ctx = source?.getContext('2d');
            if (!source || !ctx) return;
            const scaleX = source.width / canvas.width;
            const scaleY = source.height / canvas.height;
            const brushScale = (scaleX + scaleY) / 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.arc(lastPosRef.current.x, lastPosRef.current.y, (brushSize / 2) * brushScale, 0, Math.PI * 2);
            ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : (isRainbow ? `hsl(${rainbowHueRef.current}, 100%, 50%)` : color);
            ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
            ctx.fill();
            renderFromSource(canvas);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDrawing || !lastPosRef.current) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const source = ensureSourceCanvas(canvas.width, canvas.height);
        const ctx = source?.getContext('2d');
        if (!source || !ctx) return;

        const currentPos = getPoint(e);
        const dist = Math.hypot(currentPos.x - lastPosRef.current.x, currentPos.y - lastPosRef.current.y);

        const scaleX = source.width / canvas.width;
        const scaleY = source.height / canvas.height;
        const brushScale = (scaleX + scaleY) / 2;
        ctx.lineWidth = brushSize * brushScale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';

        ctx.beginPath();
        ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        ctx.lineTo(currentPos.x, currentPos.y);

        if (isRainbow && !isEraser) {
            // Update hue based on distance
            rainbowHueRef.current = (rainbowHueRef.current + dist * 0.5) % 360;
            ctx.strokeStyle = `hsl(${rainbowHueRef.current}, 100%, 50%)`;
        } else {
            ctx.strokeStyle = color;
        }

        ctx.stroke();
        lastPosRef.current = currentPos;
        renderFromSource(canvas);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDrawing) {
            setIsDrawing(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
            onDrawEnd?.();
        }
    };

    return (
        <canvas
            ref={canvasRef}
            style={{ touchAction: 'none', display: 'block', width: '100%', height: '100%' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerOut={handlePointerUp}
            onPointerCancel={handlePointerUp}
        />
    );
});
