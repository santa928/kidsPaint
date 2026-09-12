import { useEffect, useRef } from 'react';
import { drawStamp, renderDocument } from '../drawing/renderer';
import type { Artwork } from '../storage/artworks';
import type { StampId } from '../types';
import { outputGeometry } from '../drawing/viewport';
import { visibleDrawingBounds } from '../drawing/visibleBounds';
/** Render the same stamp geometry used on the paper, without substituting emoji. */
export function StampPreview({ stampId, color, rainbow }: { stampId: StampId; color: string; rainbow: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 160);
    drawStamp(ctx, stampId, 80, 80, 136, color, rainbow);
  }, [stampId, color, rainbow]);
  return <canvas ref={ref} width={160} height={160} className="stamp-preview" aria-hidden="true" />;
}
/** Replay saved artwork into a small thumbnail with its original paper color. */
export function ArtworkPreview({ artwork }: { artwork: Artwork }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { drawing, backgroundColor } = artwork;
  const { width, height, scale, bounds } = outputGeometry(drawing, 300, visibleDrawingBounds(drawing));
  const { left, top } = bounds;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    renderDocument(ctx, drawing);
  }, [drawing, scale, left, top]);
  return <canvas ref={ref} width={width} height={height} className="artwork-preview" style={{ backgroundColor }} aria-hidden="true" />;
}
