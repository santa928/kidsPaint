import type { StampId } from '../types';

export type DrawingTool = 'brush' | 'eraser' | 'stamp';

/** A position in artwork coordinates, independent of screen size or density. */
export interface Point { x: number; y: number }

/** One gesture; replaying its points preserves the original brush and hue. */
export interface StrokeOperation {
  kind: 'stroke';
  points: Point[];
  color: string;
  size: number;
  rainbow: boolean;
  erase: boolean;
  startHue: number;
}

/** A single stamp, centered at its saved artwork position. */
export interface StampOperation {
  kind: 'stamp';
  stampId: StampId;
  x: number;
  y: number;
  size: number;
  color: string;
  rainbow: boolean;
  designVersion?: 2;
}

export type DrawingOperation = StrokeOperation | StampOperation;

/** Serializable paper geometry and finalized drawing operations. */
export interface DrawingDocument {
  version: 1;
  width: number;
  height: number;
  operations: DrawingOperation[];
  coordinateSpace?: 'world';
  /** Operations created on legacy fixed paper retain that paper's original clipping. */
  legacyOperationCount?: number;
}

/** Tool state copied when a gesture starts so changes never split a stroke. */
export interface DrawingSettings {
  tool: DrawingTool;
  color: string;
  size: number;
  rainbow: boolean;
  stampId: StampId;
  /** Artwork units per CSS pixel; absent in non-visual session callers. */
  unitScale?: number;
}
