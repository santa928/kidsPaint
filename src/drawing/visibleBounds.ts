import type { DrawingDocument } from './types';
import type { DrawingRect } from './geometry';
import { drawingBounds, outputGeometry } from './viewport';
import { renderDocument } from './renderer';

const cache = new WeakMap<DrawingDocument, DrawingRect>();

/** Trim erased outer margins only when a bounded alpha raster can resolve every mark safely. */
export function visibleDrawingBounds(drawing: DrawingDocument): DrawingRect {
  const cached = cache.get(drawing);
  if (cached) return cached;
  const rough = drawingBounds(drawing);
  if ((rough.left === 0 && rough.top === 0 && rough.width === drawing.width && rough.height === drawing.height)
    || !drawing.operations.some(operation => operation.kind === 'stroke' && operation.erase)) { cache.set(drawing, rough); return rough; }
  const { width, height, scale } = outputGeometry(drawing);
  // Preserve tiny old marks rather than treating undersampled pixels as erased ink.
  if (drawing.operations.some(operation => (operation.kind === 'stamp' || !operation.erase) && operation.size * scale < 2)) { cache.set(drawing, rough); return rough; }
  const bitmap = document.createElement('canvas');
  bitmap.width = width; bitmap.height = height;
  const ctx = bitmap.getContext('2d', { willReadFrequently: true });
  if (!ctx) return rough;
  ctx.setTransform(scale, 0, 0, scale, -rough.left * scale, -rough.top * scale);
  renderDocument(ctx, drawing);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (pixels[(y * width + x) * 4 + 3] === 0) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  let left = 0, top = 0, right = drawing.width, bottom = drawing.height;
  if (maxX >= 0) {
    // One raster pixel of margin retains antialiased caps and stamp contours.
    left = Math.min(left, Math.max(rough.left, rough.left + (minX - 1) / scale));
    top = Math.min(top, Math.max(rough.top, rough.top + (minY - 1) / scale));
    right = Math.max(right, Math.min(rough.left + rough.width, rough.left + (maxX + 2) / scale));
    bottom = Math.max(bottom, Math.min(rough.top + rough.height, rough.top + (maxY + 2) / scale));
  }
  const bounds = { left, top, width: right - left, height: bottom - top };
  cache.set(drawing, bounds);
  return bounds;
}
