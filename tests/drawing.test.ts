import { describe, expect, it } from 'vitest';
import { fitDrawing, toDocumentPoint } from '../src/drawing/geometry';
import { DrawingSession } from '../src/drawing/session';
import { isDrawingDocument } from '../src/drawing/validation';
import type { DrawingDocument } from '../src/drawing/types';

const blank: DrawingDocument = { version: 1, width: 1200, height: 900, operations: [] };
const brush = { tool: 'brush' as const, color: '#ff0000', size: 8, rainbow: false, stampId: 'circle' as const };

describe('document geometry', () => {
  it('fits the paper after rotation without stretching its content and caps bitmap density', () => {
    expect(fitDrawing(900, 600, 1200, 900, 3)).toEqual({ width: 800, height: 600, pixelWidth: 1600, pixelHeight: 1200 });
    expect(fitDrawing(600, 900, 1200, 900, 2)).toEqual({ width: 600, height: 450, pixelWidth: 1200, pixelHeight: 900 });
  });

  it('maps CSS positions into the same document position at different sizes', () => {
    expect(toDocumentPoint(410, 320, { left: 10, top: 20, width: 800, height: 600 }, blank)).toEqual({ x: 600, y: 450 });
    expect(toDocumentPoint(310, 245, { left: 10, top: 20, width: 600, height: 450 }, blank)).toEqual({ x: 600, y: 450 });
    expect(toDocumentPoint(-20, 1000, { left: 10, top: 20, width: 600, height: 450 }, blank)).toEqual({ x: 0, y: 900 });
    expect(toDocumentPoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }, blank)).toBeNull();
  });
});

describe('drawing session', () => {
  it('ignores a second touch and its release without connecting two pointers', () => {
    const session = new DrawingSession(blank);
    expect(session.begin({ pointerId: 1, isPrimary: true, button: 0, point: { x: 10, y: 20 } }, brush)).toBe(true);
    expect(session.begin({ pointerId: 2, isPrimary: false, button: 0, point: { x: 800, y: 800 } }, brush)).toBe(false);
    expect(session.move(2, { x: 700, y: 700 })).toBe(false);
    expect(session.finish(2)).toBeNull();
    expect(session.move(1, { x: 30, y: 40 })).toBe(true);
    expect(session.finish(1)?.operations).toEqual([{ kind: 'stroke', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], color: '#ff0000', size: 8, rainbow: false, erase: false, startHue: 0 }]);
  });

  it('finishes cancellation once and admits the next primary gesture', () => {
    const session = new DrawingSession(blank);
    session.begin({ pointerId: 1, isPrimary: true, button: 0, point: { x: 10, y: 20 } }, brush);
    expect(session.document.operations).toHaveLength(0);
    expect(session.finish()?.operations).toHaveLength(1);
    expect(session.finish()).toBeNull();
    expect(session.begin({ pointerId: 2, isPrimary: true, button: 0, point: { x: 40, y: 50 } }, brush)).toBe(true);
    expect(session.finish(2)?.operations).toHaveLength(2);
  });

  it('rejects secondary and right-button starts even while idle', () => {
    const session = new DrawingSession(blank);
    expect(session.begin({ pointerId: 2, isPrimary: false, button: 0, point: { x: 10, y: 20 } }, brush)).toBe(false);
    expect(session.begin({ pointerId: 3, isPrimary: true, button: 2, point: { x: 10, y: 20 } }, brush)).toBe(false);
    expect(session.document.operations).toHaveLength(0);
  });

  it('keeps a stroke style stable and preserves a tap as a single point', () => {
    const session = new DrawingSession(blank);
    const settings = { ...brush, rainbow: true, tool: 'eraser' as const };
    session.begin({ pointerId: 1, isPrimary: true, button: 0, point: { x: 10, y: 20 } }, settings);
    settings.color = '#000000';
    expect(session.finish()?.operations[0]).toMatchObject({ color: '#ff0000', erase: true, rainbow: false, points: [{ x: 10, y: 20 }] });
  });

  it('undoes clearing and retains at most twenty previous document states', () => {
    const session = new DrawingSession(blank);
    for (let i = 0; i < 22; i += 1) {
      session.begin({ pointerId: i, isPrimary: true, button: 0, point: { x: i, y: i } }, brush);
      session.finish(i);
    }
    const completed = session.document;
    expect(session.clear()?.operations).toHaveLength(0);
    expect(session.undo()).toBe(completed);
    for (let i = 0; i < 19; i += 1) session.undo();
    expect(session.document.operations).toHaveLength(3);
    expect(session.canUndo).toBe(false);
    expect(session.undo()).toBeNull();
  });

  it('places exactly one stamp and ignores dragging it', () => {
    const session = new DrawingSession(blank);
    session.begin({ pointerId: 1, isPrimary: true, button: 0, point: { x: 20, y: 30 } }, { ...brush, tool: 'stamp', stampId: 'train', rainbow: true, size: 16 });
    expect(session.move(1, { x: 100, y: 200 })).toBe(false);
    expect(session.finish()?.operations).toEqual([{ kind: 'stamp', designVersion: 2, stampId: 'train', x: 20, y: 30, size: 112, color: '#ff0000', rainbow: true }]);
  });
});

describe('saved document validation', () => {
  it.each([
    { width: 1200, height: 900, valid: true },
    { width: 900, height: 1200, valid: true },
    { width: 1200, height: 901, valid: false },
    { width: 901, height: 1200, valid: false },
    { width: 1201, height: 899, valid: false },
    { width: 899, height: 1201, valid: false },
    { width: 8192, height: 8192, valid: false },
  ])('bounds export allocation for paper $width by $height', ({ width, height, valid }) => {
    expect(isDrawingDocument({ ...blank, width, height })).toBe(valid);
  });

  it('accepts replayable brush and stamp operations', () => {
    expect(isDrawingDocument({ ...blank, operations: [
      { kind: 'stroke', points: [{ x: 0, y: 900 }], color: '#FF0000', size: 8, rainbow: true, erase: false, startHue: 10 },
      { kind: 'stamp', stampId: 'rabbit', x: 1200, y: 0, size: 110, color: '#000', rainbow: false },
    ] })).toBe(true);
  });

  it.each([
    { ...blank, width: 0 },
    { ...blank, height: Infinity },
    { ...blank, width: 100000 },
    { ...blank, version: 2 },
    { ...blank, operations: [{ kind: 'stroke', points: [], color: '#ff0000', size: 8, rainbow: false, erase: false, startHue: 0 }] },
    { ...blank, operations: [{ kind: 'stroke', points: [{ x: NaN, y: 0 }], color: '#ff0000', size: 8, rainbow: false, erase: false, startHue: 0 }] },
    { ...blank, operations: [{ kind: 'stroke', points: [{ x: 0, y: 0 }], color: '#ff0000', size: -1, rainbow: false, erase: false, startHue: 0 }] },
    { ...blank, operations: [{ kind: 'stamp', stampId: 'unknown', x: 0, y: 0, size: 8, color: '#ff0000', rainbow: false }] },
    { ...blank, operations: [{ kind: 'stamp', stampId: 'circle', x: 0, y: 0, size: 8, color: 'url(example)', rainbow: false }] },
    { ...blank, operations: [{ kind: 'stamp', stampId: 'circle', x: 1300, y: 0, size: 8, color: '#ff0000', rainbow: false }] },
  ])('rejects malformed or unsafe drawing data %#', (value) => {
    expect(isDrawingDocument(value)).toBe(false);
  });
});
