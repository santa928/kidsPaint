import type { DrawingDocument } from './types';
import { MAX_WORLD_COORDINATE } from './viewport';

const stampIds = new Set(['circle', 'cross', 'square', 'triangle', 'rabbit', 'bird', 'train']);
const hexColor = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

/** Narrow JSON objects without trusting their prototype or value types. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Bound finite numeric fields before they can allocate a bitmap or render geometry. */
function isNumberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Validate persisted drawings before allowing them to reach the canvas renderer. */
export function isDrawingDocument(value: unknown): value is DrawingDocument {
  if (!isRecord(value) || value.version !== 1
    || !isNumberBetween(value.width, 1, 1200) || !Number.isInteger(value.width)
    || !isNumberBetween(value.height, 1, 1200) || !Number.isInteger(value.height)
    || value.width * value.height > 1080000
    || !Array.isArray(value.operations) || value.operations.length > 100000) return false;
  if (value.coordinateSpace !== undefined && value.coordinateSpace !== 'world') return false;
  if (value.legacyOperationCount !== undefined && (!isNumberBetween(value.legacyOperationCount, 0, value.operations.length) || !Number.isInteger(value.legacyOperationCount))) return false;
  const min = value.coordinateSpace === 'world' ? -MAX_WORLD_COORDINATE : 0;
  const maxX = value.coordinateSpace === 'world' ? MAX_WORLD_COORDINATE : value.width;
  const maxY = value.coordinateSpace === 'world' ? MAX_WORLD_COORDINATE : value.height;
  let pointCount = 0;
  for (const operation of value.operations) {
    if (!isRecord(operation) || !isNumberBetween(operation.size, 0.1, 8192)
      || typeof operation.color !== 'string' || !hexColor.test(operation.color)
      || typeof operation.rainbow !== 'boolean') return false;
    if (operation.kind === 'stamp') {
      if (typeof operation.stampId !== 'string' || !stampIds.has(operation.stampId)
        || (operation.designVersion !== undefined && operation.designVersion !== 2)
        || !isNumberBetween(operation.x, min, maxX) || !isNumberBetween(operation.y, min, maxY)) return false;
    } else if (operation.kind === 'stroke') {
      if (typeof operation.erase !== 'boolean' || !isNumberBetween(operation.startHue, 0, 360)
        || !Array.isArray(operation.points) || operation.points.length < 1) return false;
      pointCount += operation.points.length;
      if (pointCount > 2000000) return false;
      for (const point of operation.points) {
        if (!isRecord(point) || !isNumberBetween(point.x, min, maxX) || !isNumberBetween(point.y, min, maxY)) return false;
      }
    } else return false;
  }
  return true;
}
