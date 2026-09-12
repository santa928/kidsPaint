import { describe, expect, it } from 'vitest';
import { drawingBounds, fitViewport, pointerToWorld, outputGeometry } from '../src/drawing/viewport';
import { DrawingSession } from '../src/drawing/session';
import { isDrawingDocument } from '../src/drawing/validation';
import type { DrawingDocument } from '../src/drawing/types';

const blank: DrawingDocument = { version: 1, width: 1200, height: 900, operations: [] };
const brush = { tool: 'brush' as const, size: 16, color: '#ff0000', rainbow: false, stampId: 'circle' as const };

describe('full viewport paper', () => {
  it('uses every pixel while keeping a uniform camera after rotation', () => {
    const landscape = fitViewport(1024, 768, drawingBounds(blank), 3);
    const portrait = fitViewport(768, 1024, drawingBounds(blank), 2);
    expect(landscape).toMatchObject({ width: 1024, height: 768, pixelWidth: 2048, pixelHeight: 1536 });
    expect(portrait.scale).toBe(.64);
    expect(pointerToWorld(384, 512, { left: 0, top: 0, width: 768, height: 1024 }, portrait)).toEqual({ x: 600, y: 450 });
    expect(pointerToWorld(384, 0, { left: 0, top: 0, width: 768, height: 1024 }, portrait)?.y).toBe(-350);
  });

  it('persists strokes outside the original paper and includes their full extent in exports', () => {
    const session = new DrawingSession(blank);
    session.begin({ pointerId: 1, isPrimary: true, button: 0, point: { x: -100, y: -200 } }, brush);
    const next = session.finish()!;
    expect(isDrawingDocument(next)).toBe(true);
    expect(drawingBounds(next)).toEqual({ left: -108, top: -208, width: 1308, height: 1108 });
    const output = outputGeometry(next);
    expect(output.width).toBeLessThanOrEqual(1200);
    expect(output.width * output.height).toBeLessThanOrEqual(1080000);
    expect(session.undo()).toBe(blank);
  });

  it('retains the original crop of legacy artwork and ignores eraser-only margins', () => {
    const legacy: DrawingDocument = { ...blank, operations: [{ kind: 'stamp', stampId: 'rabbit', x: 0, y: 0, size: 100, color: '#f00', rainbow: false }] };
    const session = new DrawingSession(legacy);
    session.begin({ pointerId: 1, isPrimary: true, button: 0, point: { x: -100, y: -200 } }, { ...brush, tool: 'eraser' });
    const next = session.finish()!;
    expect(next.legacyOperationCount).toBe(1);
    expect(drawingBounds(next)).toEqual({ left: 0, top: 0, width: 1200, height: 900 });
    expect(session.clear()?.legacyOperationCount).toBe(0);
    expect(session.undo()).toBe(next);
  });

  it('does not accumulate empty margins across repeated rotations', () => {
    const bounds = drawingBounds(blank);
    for (let i = 0; i < 10; i += 1) {
      fitViewport(768, 1024, bounds, 2);
      expect(fitViewport(1024, 768, drawingBounds(blank), 2).scale).toBe(1024 / 1200);
    }
  });

  it('rejects unbounded coordinates, unsupported designs and invalid legacy boundaries', () => {
    const session = new DrawingSession(blank);
    session.begin({ pointerId: 1, isPrimary: true, button: 0, point: { x: -20, y: 10 } }, { ...brush, tool: 'stamp', unitScale: 2 });
    const next = session.finish()!;
    expect(next.operations[0]).toMatchObject({ designVersion: 2, size: 224 });
    expect(isDrawingDocument(next)).toBe(true);
    expect(isDrawingDocument({ ...next, legacyOperationCount: 2 })).toBe(false);
    expect(isDrawingDocument({ ...next, operations: [{ ...next.operations[0], x: -Infinity }] })).toBe(false);
    expect(isDrawingDocument({ ...next, operations: [{ ...next.operations[0], designVersion: 3 }] })).toBe(false);
  });
});
