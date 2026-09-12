import type { DrawingDocument, Point } from './types';
import type { DrawingRect, DrawingFit } from './geometry';

export const MAX_WORLD_COORDINATE = 1_000_000;
export interface DrawingViewport extends DrawingFit { scale: number; offsetX: number; offsetY: number }

/** Include new visible ink outside the original page, without expanding for eraser gestures. */
export function drawingBounds(drawing: DrawingDocument): DrawingRect {
  let left = 0, top = 0, right = drawing.width, bottom = drawing.height;
  if (drawing.coordinateSpace !== 'world') return { left, top, width: right, height: bottom };
  const include = (x: number, y: number, radius: number) => {
    left = Math.min(left, x - radius); top = Math.min(top, y - radius);
    right = Math.max(right, x + radius); bottom = Math.max(bottom, y + radius);
  };
  for (let index = drawing.legacyOperationCount ?? 0; index < drawing.operations.length; index += 1) {
    const operation = drawing.operations[index];
    if (operation.kind === 'stamp') include(operation.x, operation.y, operation.size * (operation.designVersion === 2 ? .5 : 1.5));
    else if (!operation.erase) for (const point of operation.points) include(point.x, point.y, operation.size / 2);
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** Fill the entire stage bitmap; fit ink uniformly inside it rather than stretching the paper. */
export function fitViewport(width: number, height: number, bounds: DrawingRect, dpr: number): DrawingViewport {
  const scale = Math.min(width / bounds.width, height / bounds.height);
  const density = Number.isFinite(dpr) ? Math.min(2, Math.max(1, dpr)) : 1;
  return { width, height, pixelWidth: Math.max(1, Math.round(width * density)), pixelHeight: Math.max(1, Math.round(height * density)), scale,
    offsetX: (width - bounds.width * scale) / 2 - bounds.left * scale,
    offsetY: (height - bounds.height * scale) / 2 - bounds.top * scale };
}

/** Invert the stable camera; captured off-screen drags stop at the visible canvas edge. */
export function pointerToWorld(clientX: number, clientY: number, rect: DrawingRect, camera: DrawingViewport): Point | null {
  if (rect.width <= 0 || rect.height <= 0 || camera.scale <= 0 || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
  const y = Math.min(rect.height, Math.max(0, clientY - rect.top));
  const bound = (value: number) => Math.max(-MAX_WORLD_COORDINATE, Math.min(MAX_WORLD_COORDINATE, value));
  return { x: bound((x * camera.width / rect.width - camera.offsetX) / camera.scale), y: bound((y * camera.height / rect.height - camera.offsetY) / camera.scale) };
}

/** Bound export memory while preserving the full artwork and its aspect ratio. */
export function outputGeometry(drawing: DrawingDocument, maxEdge = 1200, bounds = drawingBounds(drawing)): { bounds: DrawingRect; width: number; height: number; scale: number } {
  const scale = Math.min(1, maxEdge / Math.max(bounds.width, bounds.height), Math.sqrt(1080000 / (bounds.width * bounds.height)));
  const width = Math.max(1, Math.floor(bounds.width * scale)), height = Math.max(1, Math.floor(bounds.height * scale));
  return { bounds, width, height, scale: Math.min(width / bounds.width, height / bounds.height) };
}
