import { renderDocument } from './drawing/renderer';
import type { Artwork } from './storage/artworks';
import type { DrawingDocument } from './drawing/types';
import { outputGeometry } from './drawing/viewport';
import { visibleDrawingBounds } from './drawing/visibleBounds';

/** Include all visible ink in a bounded PNG, including newly drawn margins after rotation. */
export async function drawingToPng(drawing: DrawingDocument, backgroundColor: string): Promise<Blob> {
  const output = document.createElement('canvas');
  const { width, height, scale, bounds } = outputGeometry(drawing, 1200, visibleDrawingBounds(drawing));
  output.width = width; output.height = height;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('画像を書き出せませんでした');
  ctx.setTransform(scale, 0, 0, scale, -bounds.left * scale, -bounds.top * scale);
  renderDocument(ctx, drawing);
  ctx.resetTransform();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, output.width, output.height);
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像を書き出せませんでした')), 'image/png'));
}

/** Use the same export geometry for saved gallery entries and the current canvas. */
export async function artworkToPng(artwork: Artwork): Promise<Blob> {
  return drawingToPng(artwork.drawing, artwork.backgroundColor);
}

/** Hand a local PNG to the browser's download UI and release its object URL after use. */
export function downloadPng(blob: Blob, artwork: Artwork): void {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = `おえかき-${new Date(artwork.createdAt).toISOString().slice(0, 10)}-${artwork.id.slice(0, 6)}.png`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
