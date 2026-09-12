import type { DrawingDocument, DrawingOperation, DrawingSettings, Point } from './types';
import { getStampBaseSize } from './renderer';

export interface DrawingPointer { pointerId: number; isPrimary: boolean; button: number; point: Point }

/** Owns one active gesture and a bounded history of finalized document references. */
export class DrawingSession {
  document: DrawingDocument;
  activeOperation: DrawingOperation | null = null;
  activePointerId: number | null = null;
  hue = 0;
  private history: DrawingDocument[] = [];

  /** Start a session from an already validated document; operation objects are shared. */
  constructor(drawing: DrawingDocument) { this.document = drawing; }

  /** Whether one of the bounded previous document states is available. */
  get canUndo(): boolean { return this.history.length > 0; }

  /** Acquire a primary pointer and copy its tool settings for the whole gesture. */
  begin(pointer: DrawingPointer, settings: DrawingSettings): boolean {
    if (this.activePointerId !== null || !pointer.isPrimary || pointer.button !== 0) return false;
    this.activePointerId = pointer.pointerId;
    const { x, y } = pointer.point;
    const unitScale = Math.min(8192 / 156, settings.unitScale ?? 1);
    this.activeOperation = settings.tool === 'stamp'
      ? { kind: 'stamp', designVersion: 2, stampId: settings.stampId, x, y, size: getStampBaseSize(settings.size) * unitScale, color: settings.color, rainbow: settings.rainbow }
      : { kind: 'stroke', points: [{ x, y }], size: settings.size * unitScale, color: settings.color, rainbow: settings.rainbow && settings.tool !== 'eraser', erase: settings.tool === 'eraser', startHue: this.hue };
    return true;
  }

  /** Append movement only for the owning brush pointer, avoiding duplicate points. */
  move(pointerId: number, point: Point): boolean {
    const operation = this.activeOperation;
    if (pointerId !== this.activePointerId || operation?.kind !== 'stroke') return false;
    const previous = operation.points[operation.points.length - 1];
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (distance === 0) return false;
    if (operation.rainbow) this.hue = (this.hue + distance * 0.5) % 360;
    operation.points.push({ ...point });
    return true;
  }

  /** Commit a gesture once; omitting the ID also finishes blur/cancel/navigation. */
  finish(pointerId?: number): DrawingDocument | null {
    if (!this.activeOperation || (pointerId !== undefined && pointerId !== this.activePointerId)) return null;
    const operation = this.activeOperation;
    this.activeOperation = null;
    this.activePointerId = null;
    return this.commit({ ...this.document, coordinateSpace: 'world',
      legacyOperationCount: this.document.coordinateSpace === 'world' ? this.document.legacyOperationCount ?? 0 : this.document.operations.length,
      operations: [...this.document.operations, operation] });
  }

  /** Restore the previous document reference after the UI has finished any gesture. */
  undo(): DrawingDocument | null {
    const previous = this.history.pop();
    if (!previous) return null;
    this.document = previous;
    return previous;
  }

  /** Clear nonempty paper while retaining its complete previous operations for undo. */
  clear(): DrawingDocument | null {
    if (this.document.operations.length === 0) return null;
    return this.commit({ ...this.document, legacyOperationCount: 0, operations: [] });
  }

  /** Retain twenty document references rather than copying full bitmap buffers. */
  private commit(next: DrawingDocument): DrawingDocument {
    this.history.push(this.document);
    if (this.history.length > 20) this.history.shift();
    this.document = next;
    return next;
  }
}
