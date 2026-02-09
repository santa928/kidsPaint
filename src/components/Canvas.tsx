import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import type { StampId } from '../types';

interface CanvasProps {
    color: string;
    brushSize: number;
    isEraser: boolean;
    isRainbow: boolean;
    isStampMode: boolean;
    stampId: StampId;
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
    isStampMode,
    stampId,
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
        if (isStampMode) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const source = ensureSourceCanvas(canvas.width, canvas.height);
            const ctx = source?.getContext('2d');
            if (!source || !ctx) return;

            const point = getPoint(e);
            const scaleX = source.width / canvas.width;
            const scaleY = source.height / canvas.height;
            const stampScale = (scaleX + scaleY) / 2;
            const stampSize = getStampBaseSize(brushSize) * stampScale;

            saveState();
            onDrawStart?.();
            drawStamp(ctx, stampId, point.x, point.y, stampSize, color, isRainbow && !isEraser);
            renderFromSource(canvas);
            onDrawEnd?.();
            return;
        }

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
        if (isStampMode) return;
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

const drawStamp = (
    ctx: CanvasRenderingContext2D,
    stampId: StampId,
    x: number,
    y: number,
    size: number,
    color: string,
    useRainbowGradient: boolean
) => {
    const shapeLine = Math.max(2, size * 0.12);
    const creatureLine = Math.max(1.2, size * 0.045);
    const creatureDetail = Math.max(0.8, size * 0.022);
    const stampStyle: string | CanvasGradient = useRainbowGradient
        ? createRainbowStampGradient(ctx, x, y, size)
        : color;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = stampStyle;
    ctx.strokeStyle = stampStyle;
    ctx.lineWidth = shapeLine;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (stampId) {
        case 'circle': {
            ctx.beginPath();
            ctx.arc(x, y, size * 0.38, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'cross': {
            const len = size * 0.42;
            ctx.beginPath();
            ctx.moveTo(x - len, y - len);
            ctx.lineTo(x + len, y + len);
            ctx.moveTo(x + len, y - len);
            ctx.lineTo(x - len, y + len);
            ctx.stroke();
            break;
        }
        case 'square': {
            const s = size * 0.7;
            ctx.beginPath();
            ctx.rect(x - s / 2, y - s / 2, s, s);
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'triangle': {
            const h = size * 0.7;
            const w = size * 0.7;
            ctx.beginPath();
            ctx.moveTo(x, y - h / 2);
            ctx.lineTo(x + w / 2, y + h / 2);
            ctx.lineTo(x - w / 2, y + h / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'rabbit': {
            const thick = creatureLine * 1.1;
            const detail = creatureDetail;
            ctx.lineWidth = thick;

            const headR = size * 0.3;
            const headY = y + size * 0.08;
            const earW = size * 0.1;
            const earH = size * 0.32;
            const earGap = -size * 0.02;
            const earY = headY - headR - earH - earGap;
            const earOffset = size * 0.11;

            // Ears (kept above head to avoid overlap)
            ctx.beginPath();
            ctx.ellipse(x - earOffset, earY, earW, earH, 0, 0, Math.PI * 2);
            ctx.ellipse(x + earOffset, earY, earW, earH, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Head
            ctx.beginPath();
            ctx.arc(x, headY, headR, 0, Math.PI * 2);
            ctx.stroke();

            // Eyes
            ctx.lineWidth = Math.max(detail * 1.8, 1.4);
            ctx.beginPath();
            ctx.moveTo(x - size * 0.095, headY - size * 0.05);
            ctx.lineTo(x - size * 0.094, headY - size * 0.05);
            ctx.moveTo(x + size * 0.095, headY - size * 0.05);
            ctx.lineTo(x + size * 0.094, headY - size * 0.05);
            ctx.stroke();

            // Mouth (simple smile)
            ctx.beginPath();
            ctx.moveTo(x - size * 0.045, headY + size * 0.055);
            ctx.quadraticCurveTo(x, headY + size * 0.085, x + size * 0.045, headY + size * 0.055);
            ctx.stroke();

            break;
        }
        case 'bird': {
            const thick = creatureLine * 1.1;
            const detail = creatureDetail;
            ctx.lineWidth = thick;

            const bodyR = size * 0.28;
            const bodyY = y + size * 0.06;

            // Body
            ctx.beginPath();
            ctx.arc(x, bodyY, bodyR, 0, Math.PI * 2);
            ctx.stroke();

            // Wing (single curve inside body)
            ctx.lineWidth = detail;
            ctx.beginPath();
            ctx.arc(x - size * 0.02, bodyY + size * 0.02, size * 0.16, Math.PI * 0.9, Math.PI * 1.8);
            ctx.stroke();

            // Eye
            ctx.beginPath();
            ctx.lineWidth = Math.max(detail * 1.8, 1.4);
            ctx.moveTo(x + size * 0.1, bodyY - size * 0.04);
            ctx.lineTo(x + size * 0.101, bodyY - size * 0.04);
            ctx.stroke();

            // Beak
            ctx.lineWidth = thick;
            ctx.beginPath();
            ctx.moveTo(x + bodyR - size * 0.01, bodyY - size * 0.01);
            ctx.lineTo(x + bodyR + size * 0.08, bodyY + size * 0.02);
            ctx.lineTo(x + bodyR - size * 0.01, bodyY + size * 0.05);
            ctx.closePath();
            ctx.stroke();

            // Tail (two short lines)
            ctx.lineWidth = detail;
            ctx.beginPath();
            ctx.moveTo(x - bodyR, bodyY + size * 0.02);
            ctx.lineTo(x - bodyR - size * 0.1, bodyY - size * 0.02);
            ctx.moveTo(x - bodyR, bodyY + size * 0.06);
            ctx.lineTo(x - bodyR - size * 0.1, bodyY + size * 0.12);
            ctx.stroke();

            // Cheek + tiny crest
            ctx.beginPath();
            ctx.arc(x + size * 0.05, bodyY + size * 0.02, size * 0.02, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x + size * 0.02, bodyY - bodyR - size * 0.02);
            ctx.lineTo(x + size * 0.06, bodyY - bodyR - size * 0.12);
            ctx.stroke();
            break;
        }
        case 'train': {
            const bodyW = size * 0.8;
            const bodyH = size * 0.38;
            const bodyX = x - bodyW / 2;
            const bodyY = y - bodyH / 2;

            ctx.lineWidth = creatureLine * 1.1;
            ctx.beginPath();
            ctx.rect(bodyX, bodyY, bodyW, bodyH);
            ctx.stroke();

            const cabinW = size * 0.28;
            const cabinH = size * 0.22;
            ctx.beginPath();
            ctx.rect(x - size * 0.12, y - bodyH / 2 - cabinH * 0.6, cabinW, cabinH);
            ctx.stroke();

            ctx.beginPath();
            ctx.rect(x - size * 0.42, y - bodyH / 2 - size * 0.2, size * 0.12, size * 0.2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(x - size * 0.28, y + bodyH / 2 + size * 0.06, size * 0.12, 0, Math.PI * 2);
            ctx.arc(x + size * 0.02, y + bodyH / 2 + size * 0.06, size * 0.12, 0, Math.PI * 2);
            ctx.arc(x + size * 0.32, y + bodyH / 2 + size * 0.06, size * 0.12, 0, Math.PI * 2);
            ctx.stroke();

            const detail = creatureDetail;
            ctx.lineWidth = detail;
            ctx.beginPath();
            ctx.rect(x - size * 0.06, y - size * 0.12, size * 0.18, size * 0.12);
            ctx.rect(x + size * 0.18, y - size * 0.12, size * 0.18, size * 0.12);
            ctx.stroke();
            break;
        }
        default:
            break;
    }

    ctx.restore();
};

const createRainbowStampGradient = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
) => {
    const gradient = ctx.createLinearGradient(
        x - size * 0.55,
        y - size * 0.55,
        x + size * 0.55,
        y + size * 0.55
    );
    gradient.addColorStop(0.0, 'hsl(0, 100%, 50%)');
    gradient.addColorStop(0.17, 'hsl(35, 100%, 50%)');
    gradient.addColorStop(0.34, 'hsl(60, 100%, 50%)');
    gradient.addColorStop(0.51, 'hsl(130, 100%, 45%)');
    gradient.addColorStop(0.68, 'hsl(210, 100%, 50%)');
    gradient.addColorStop(0.85, 'hsl(265, 100%, 55%)');
    gradient.addColorStop(1.0, 'hsl(320, 100%, 55%)');
    return gradient;
};

const getStampBaseSize = (brushSize: number) => {
    if (brushSize <= 4) return 52;
    if (brushSize <= 8) return 78;
    return 110;
};
