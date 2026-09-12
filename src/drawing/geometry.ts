import type { DrawingDocument, Point } from './types';

export interface DrawingFit { width: number; height: number; pixelWidth: number; pixelHeight: number }
export interface DrawingRect { left: number; top: number; width: number; height: number }

/** Fit a paper inside the available stage with bounded bitmap density. */
export function fitDrawing(width: number, height: number, paperWidth: number, paperHeight: number, dpr: number): DrawingFit {
  if (![width, height, paperWidth, paperHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { width: 0, height: 0, pixelWidth: 0, pixelHeight: 0 };
  }
  const scale = Math.min(width / paperWidth, height / paperHeight);
  const density = Number.isFinite(dpr) ? Math.min(2, Math.max(1, dpr)) : 1;
  const fittedWidth = paperWidth * scale;
  const fittedHeight = paperHeight * scale;
  return {
    width: fittedWidth,
    height: fittedHeight,
    pixelWidth: Math.max(1, Math.round(fittedWidth * density)),
    pixelHeight: Math.max(1, Math.round(fittedHeight * density)),
  };
}

/** Convert a pointer position to document coordinates, including captured drags. */
export function toDocumentPoint(clientX: number, clientY: number, rect: DrawingRect, drawing: DrawingDocument): Point | null {
  if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return {
    x: Math.max(0, Math.min(drawing.width, (clientX - rect.left) * drawing.width / rect.width)),
    y: Math.max(0, Math.min(drawing.height, (clientY - rect.top) * drawing.height / rect.height)),
  };
}
