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
    const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const drawImageDataScaled = (
        ctx: CanvasRenderingContext2D,
        imageData: ImageData,
        destWidth: number,
        destHeight: number
    ) => {
        if (destWidth <= 0 || destHeight <= 0) return;
        const buffer = bufferCanvasRef.current ?? document.createElement('canvas');
        bufferCanvasRef.current = buffer;
        buffer.width = imageData.width;
        buffer.height = imageData.height;
        const bufferCtx = buffer.getContext('2d');
        if (!bufferCtx) return;
        bufferCtx.putImageData(imageData, 0, 0);
        ctx.clearRect(0, 0, destWidth, destHeight);
        ctx.drawImage(buffer, 0, 0, destWidth, destHeight);
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

                const ctx = canvas.getContext('2d');
                let snapshot: ImageData | null = null;
                if (ctx && canvas.width > 0 && canvas.height > 0) {
                    try {
                        snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    } catch {
                        snapshot = null;
                    }
                }

                canvas.width = nextWidth;
                canvas.height = nextHeight;

                const nextCtx = canvas.getContext('2d');
                if (!nextCtx || !snapshot) return;
                if (snapshot.width === nextWidth && snapshot.height === nextHeight) {
                    nextCtx.putImageData(snapshot, 0, 0);
                } else {
                    drawImageDataScaled(nextCtx, snapshot, nextWidth, nextHeight);
                }
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
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx || undoStackRef.current.length === 0) return;

            const previous = undoStackRef.current.pop();
            if (previous) {
                if (previous.width === canvas.width && previous.height === canvas.height) {
                    ctx.putImageData(previous, 0, 0);
                } else {
                    drawImageDataScaled(ctx, previous, canvas.width, canvas.height);
                }
            }
            onHistoryChange(undoStackRef.current.length > 0);
        },
        clear: () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return;

            saveState(); // Save before clear? Issue says "MVP: Can't undo clear". 
            // But implementation note said "Clear stack after clear" in one option.
            // Wait, issue "8. ぜんぶけす" > "MVP案：クリア後は戻せない（誤操作防止を優先）"
            // So we clear stack.
            undoStackRef.current = [];
            onHistoryChange(false);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }));

    const saveState = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        if (canvas.width <= 0 || canvas.height <= 0) return;

        if (undoStackRef.current.length >= 20) {
            undoStackRef.current.shift(); // Remove oldest
        }
        undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        onHistoryChange(true);
    };

    const getPoint = (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
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
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && lastPosRef.current) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.arc(lastPosRef.current.x, lastPosRef.current.y, brushSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : (isRainbow ? `hsl(${rainbowHueRef.current}, 100%, 50%)` : color);
            ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
            ctx.fill();
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDrawing || !lastPosRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const currentPos = getPoint(e);
        const dist = Math.hypot(currentPos.x - lastPosRef.current.x, currentPos.y - lastPosRef.current.y);

        ctx.lineWidth = brushSize;
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
