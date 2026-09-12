import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawingDocument } from '../drawing/types';
import { loadArtworks, saveArtwork, saveAndActivateArtwork, ArtworkConflictError, type Artwork } from '../storage/artworks';

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

/** Start with the visible viewport aspect ratio and a bounded reference page. */
function createArtwork(): Artwork {
  const scale = Math.min(1200 / Math.max(window.innerWidth, window.innerHeight), Math.sqrt(1080000 / (window.innerWidth * window.innerHeight)));
  const now = Date.now();
  const id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  return { id, createdAt: now, updatedAt: now, backgroundColor: '#FFFFFF',
    drawing: { version: 1, coordinateSpace: 'world', width: Math.max(1, Math.floor(window.innerWidth * scale)), height: Math.max(1, Math.floor(window.innerHeight * scale)), operations: [] } };
}

/** Serialize saves within this tab and compare stored versions to protect work in other tabs. */
export function useArtworkSession() {
  const [current, setCurrent] = useState<Artwork | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState('');
  const [hasConflict, setHasConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentRef = useRef<Artwork | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waitingDraft = useRef<{ artwork: Artwork } | null>(null);
  const revision = useRef(0);
  const switching = useRef(false);
  const savedVersions = useRef(new Map<string, number>());

  /** Reflect an in-memory change immediately, including in the gallery thumbnail. */
  const showArtwork = useCallback((art: Artwork) => {
    currentRef.current = art;
    setCurrent(art);
    setArtworks(previous => [art, ...previous.filter(item => item.id !== art.id)]);
  }, []);

  /** Compare the last committed revision at execution time, after preceding queued writes. */
  const persist = useCallback(async (art: Artwork) => {
    await saveArtwork(art, savedVersions.current.get(art.id) ?? null);
    savedVersions.current.set(art.id, art.updatedAt);
  }, []);

  /** Commit both papers and the active ID before exposing a successful switch. */
  const persistActivation = useCallback(async (previous: Artwork | null, next: Artwork) => {
    const expected: Record<string, number | null> = { [next.id]: savedVersions.current.get(next.id) ?? null };
    if (previous) expected[previous.id] = savedVersions.current.get(previous.id) ?? null;
    await saveAndActivateArtwork(previous, next, expected);
    if (previous) savedVersions.current.set(previous.id, previous.updatedAt);
    savedVersions.current.set(next.id, next.updatedAt);
  }, []);

  /** Do not expose a new blank paper until the previous collection has actually loaded. */
  const initialize = useCallback(async (disposed: () => boolean = () => false) => {
    try {
      const session = await loadArtworks();
      if (disposed()) return;
      savedVersions.current = new Map(session.artworks.map(art => [art.id, art.updatedAt]));
      const art = session.artworks.find(item => item.id === session.currentId) ?? session.artworks[0] ?? createArtwork();
      if (session.currentId !== art.id) await persistActivation(null, art);
      if (disposed()) return;
      setArtworks(session.artworks);
      showArtwork(art);
      setStatus('saved'); setError(''); setHasConflict(false);
    } catch (cause) {
      if (disposed()) return;
      setStatus('error');
      setError(cause instanceof Error ? cause.message : '作品を開けませんでした');
    }
  }, [persistActivation, showArtwork]);

  useEffect(() => {
    let disposed = false;
    // Schedule database restoration outside the synchronous effect body.
    void Promise.resolve().then(() => initialize(() => disposed));
    return () => { disposed = true; };
  }, [initialize]);

  /** Only the newest completion can mark the current draft saved. */
  const enqueue = useCallback((operation: () => Promise<void>): Promise<boolean> => {
    const version = ++revision.current;
    setStatus('saving');
    const pending = queue.current.then(operation);
    queue.current = pending.catch(() => undefined);
    return pending.then(() => {
      if (version === revision.current) { setStatus('saved'); setError(''); setHasConflict(false); }
      return true;
    }, cause => {
      if (version === revision.current) { setStatus('error'); setHasConflict(cause instanceof ArtworkConflictError); setError(cause instanceof Error ? cause.message : '作品を保存できませんでした'); }
      return false;
    });
  }, []);

  /** Save finalized strokes and background changes while keeping failed work visible in memory. */
  const update = useCallback((change: Partial<Pick<Artwork, 'drawing' | 'backgroundColor'>>) => {
    const previous = currentRef.current;
    if (!previous || switching.current) return;
    const next = { ...previous, ...change, updatedAt: Math.max(Date.now(), previous.updatedAt + 1) };
    showArtwork(next);
    // Keep every mark, but replace an unstarted snapshot with the newest complete drawing.
    if (waitingDraft.current) { waitingDraft.current.artwork = next; return; }
    const job = { artwork: next };
    waitingDraft.current = job;
    void enqueue(async () => {
      if (waitingDraft.current === job) waitingDraft.current = null;
      await persist(job.artwork);
    });
  }, [enqueue, persist, showArtwork]);

  /** A failed transaction leaves the current paper and all its marks visible. */
  const activate = useCallback(async (next: Artwork): Promise<boolean> => {
    if (switching.current || !currentRef.current) return false;
    switching.current = true; setBusy(true);
    const previous = currentRef.current;
    const success = await enqueue(() => persistActivation(previous, next));
    if (success) showArtwork(next);
    switching.current = false; setBusy(false);
    return success;
  }, [enqueue, persistActivation, showArtwork]);

  /** Initial read failures retry restoration; write failures retry only the retained local draft. */
  const retry = useCallback(async () => {
    const art = currentRef.current;
    if (art) await enqueue(() => persist(art));
    else { setStatus('loading'); await initialize(); }
  }, [enqueue, initialize, persist]);

  return { current, artworks, status, error, hasConflict, busy, retry,
    setDrawing: useCallback((drawing: DrawingDocument) => update({ drawing }), [update]),
    setBackground: useCallback((backgroundColor: string) => update({ backgroundColor }), [update]),
    newPaper: useCallback(() => activate(createArtwork()), [activate]),
    openArtwork: useCallback((art: Artwork) => art.id === currentRef.current?.id ? Promise.resolve(true) : activate(art), [activate]),
  };
}
