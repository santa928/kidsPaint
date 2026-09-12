import type { StampId } from '../types';
import type { DrawingDocument, DrawingOperation, StrokeOperation } from './types';
import { drawStampV2 } from './stamps-v2';
export { drawStampV2 as drawStamp } from './stamps-v2';

/** Draw just the newest segment; hue is the saved/replayed hue at that point. */
export function drawStrokePoint(ctx: CanvasRenderingContext2D, stroke: StrokeOperation, index: number, hue: number): void {
    const point = stroke.points[index];
    if (!point) return;
    ctx.save();
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    const color = stroke.erase ? '#000000' : stroke.rainbow ? `hsl(${hue}, 100%, 50%)` : stroke.color;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (index === 0) {
        ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        const previous = stroke.points[index - 1];
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }
    ctx.restore();
}

/** Replay a single operation while preserving the caller's context transform. */
export function renderOperation(ctx: CanvasRenderingContext2D, operation: DrawingOperation): void {
    if (operation.kind === 'stamp') {
        const draw = operation.designVersion === 2 ? drawStampV2 : drawLegacyStamp;
        draw(ctx, operation.stampId, operation.x, operation.y, operation.size, operation.color, operation.rainbow);
        return;
    }
    let hue = operation.startHue;
    for (let index = 0; index < operation.points.length; index += 1) {
        if (index > 0 && operation.rainbow) {
            const current = operation.points[index];
            const previous = operation.points[index - 1];
            hue = (hue + Math.hypot(current.x - previous.x, current.y - previous.y) * 0.5) % 360;
        }
        drawStrokePoint(ctx, operation, index, hue);
    }
}

/** Clear and replay transparent artwork; caller supplies scaling and paper color. */
export function renderDocument(ctx: CanvasRenderingContext2D, drawing: DrawingDocument): void {
    ctx.save();
    ctx.resetTransform();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    const legacyCount = drawing.coordinateSpace === 'world' ? drawing.legacyOperationCount ?? 0 : drawing.operations.length;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, drawing.width, drawing.height); ctx.clip();
    for (let index = 0; index < legacyCount; index += 1) renderOperation(ctx, drawing.operations[index]);
    ctx.restore();
    for (let index = legacyCount; index < drawing.operations.length; index += 1) renderOperation(ctx, drawing.operations[index]);
}

/** Draw one of the seven original stamp shapes in document coordinates. */
const drawLegacyStamp = (
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

/** Create the shared rainbow fill used by every stamp shape. */
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

/** Keep the new toy stamps comfortably visible at each of the three tool sizes. */
export const getStampBaseSize = (brushSize: number): number => {
    if (brushSize <= 8) return 80;
    if (brushSize <= 16) return 112;
    return 156;
};
