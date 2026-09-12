import type { DrawingDocument } from '../drawing/types';
import { isDrawingDocument } from '../drawing/validation';

export interface Artwork {
  id: string;
  createdAt: number;
  updatedAt: number;
  backgroundColor: string;
  drawing: DrawingDocument;
}

export interface ArtworkSession {
  artworks: Artwork[];
  currentId: string | null;
}

/** A stale tab must preserve its local drawing instead of overwriting another tab. */
export class ArtworkConflictError extends Error {
  constructor() { super('別の画面で作品が更新されました。この絵を画像で保存してから、画面を開き直してください。'); this.name = 'ArtworkConflictError'; }
}

/** Reject malformed records without changing the original stored data. */
function isArtwork(value: unknown): value is Artwork {
  if (typeof value !== 'object' || value === null) return false;
  const art = value as Record<string, unknown>;
  return typeof art.id === 'string' && art.id.length > 0
    && typeof art.createdAt === 'number' && Number.isFinite(art.createdAt)
    && typeof art.updatedAt === 'number' && Number.isFinite(art.updatedAt)
    && typeof art.backgroundColor === 'string' && /^#[\da-f]{6}$/i.test(art.backgroundColor)
    && isDrawingDocument(art.drawing);
}

/** Open the local collection; upgrades only add this app's stores. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kids-paint', 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('artworks', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error ?? new Error('保存場所を開けません'));
    request.onblocked = () => { blocked = true; reject(new Error('ほかの画面を閉じてから、もう一度お試しください')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

/** Resolve only when the entire transaction has committed, including metadata. */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('作品を保存できませんでした'));
    tx.onerror = () => { /* The abort event reports the final transaction failure. */ };
  });
}

/** Reads the persisted artwork collection. */
export async function loadArtworks(): Promise<ArtworkSession> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['artworks', 'meta'], 'readonly');
    const done = transactionDone(tx);
    const records = tx.objectStore('artworks').getAll();
    const active = tx.objectStore('meta').get('current');
    await done;
    const raw: unknown[] = records.result;
    if (!raw.every(isArtwork)) throw new Error('保存された作品を読み込めませんでした。元のデータは残しています。');
    const meta: unknown = active.result;
    let currentId: string | null = null;
    if (meta !== undefined) {
      if (typeof meta !== 'object' || meta === null || !('artworkId' in meta)
        || typeof meta.artworkId !== 'string' || !raw.some(art => art.id === meta.artworkId)) {
        throw new Error('前回の作品を読み込めませんでした。元のデータは残しています。');
      }
      currentId = meta.artworkId;
    }
    return { artworks: raw.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), currentId };
  } finally { db.close(); }
}

/** Saves a draft without changing the active artwork. */
export async function saveArtwork(artwork: Artwork, expectedUpdatedAt: number | null): Promise<void> {
  await writeArtworks([artwork], { [artwork.id]: expectedUpdatedAt });
}

/** Atomically preserves the previous artwork and changes the active paper. */
export async function saveAndActivateArtwork(current: Artwork | null, next: Artwork, expectedVersions: Readonly<Record<string, number | null>>): Promise<void> {
  await writeArtworks(current ? [current, next] : [next], expectedVersions, next.id);
}

/** Preserve both papers atomically; a quota error cannot leave a half-finished switch. */
async function writeArtworks(artworks: Artwork[], expectedVersions: Readonly<Record<string, number | null>>, activeId?: string): Promise<void> {
  if (!artworks.every(isArtwork)) throw new Error('保存できない作品データです');
  const db = await openDatabase();
  try {
    const tx = db.transaction(['artworks', 'meta'], 'readwrite');
    const done = transactionDone(tx);
    let conflict: Error | null = null;
    try {
      for (const art of artworks) {
        const store = tx.objectStore('artworks');
        const read = store.get(art.id);
        read.onsuccess = () => {
          const stored: unknown = read.result;
          const expected = expectedVersions[art.id];
          if (expected === undefined || (stored === undefined ? expected !== null : !isArtwork(stored) || stored.updatedAt !== expected)) {
            conflict = new ArtworkConflictError();
            tx.abort();
            return;
          }
          try { store.put(art); }
          catch (cause) { conflict = cause instanceof Error ? cause : new Error('作品を保存できませんでした'); tx.abort(); }
        };
      }
      if (activeId) tx.objectStore('meta').put({ id: 'current', artworkId: activeId });
    } catch (error) {
      tx.abort();
      await done.catch(() => undefined);
      throw error;
    }
    try { await done; } catch (cause) { throw conflict ?? cause; }
  } finally { db.close(); }
}
