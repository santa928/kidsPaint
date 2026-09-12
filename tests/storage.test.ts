import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { loadArtworks, saveAndActivateArtwork, saveArtwork, type Artwork } from '../src/storage/artworks';

const first: Artwork = {
  id: 'first-paper', createdAt: 1000, updatedAt: 1000, backgroundColor: '#E6F7FF',
  drawing: { version: 1, width: 1200, height: 900, operations: [
    { kind: 'stamp', stampId: 'rabbit', x: 120, y: 200, size: 78, color: '#FF0000', rainbow: true },
  ] },
};
const second: Artwork = {
  id: 'second-paper', createdAt: 2000, updatedAt: 2000, backgroundColor: '#FFFFFF',
  drawing: { version: 1, width: 900, height: 1200, operations: [] },
};

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); });

describe('端末内の作品保存', () => {
  it('新しい紙への移動で前の絵と背景を残し、再読込時の作品を指定する', async () => {
    await saveAndActivateArtwork(null, first, { 'first-paper': null });
    await saveAndActivateArtwork(first, second, { 'first-paper': 1000, 'second-paper': null });
    const session = await loadArtworks();
    expect(session.currentId).toBe('second-paper');
    expect(session.artworks).toHaveLength(2);
    expect(session.artworks.find(art => art.id === 'first-paper')).toEqual(first);
  });

  it('遅れて保存した以前の紙が現在の紙を切り替えない', async () => {
    await saveAndActivateArtwork(null, first, { 'first-paper': null });
    await saveAndActivateArtwork(first, second, { 'first-paper': 1000, 'second-paper': null });
    await saveArtwork({ ...first, updatedAt: 3000 }, 1000);
    const session = await loadArtworks();
    expect(session.currentId).toBe('second-paper');
    expect(session.artworks.find(art => art.id === 'first-paper')?.updatedAt).toBe(3000);
  });

  it('不正な描画を保存せず、元の作品を維持する', async () => {
    await saveAndActivateArtwork(null, first, { 'first-paper': null });
    const broken = { ...first, drawing: { ...first.drawing, width: Number.NaN } };
    await expect(saveArtwork(broken, 1000)).rejects.toThrow();
    expect((await loadArtworks()).artworks).toEqual([first]);
  });

  it('読めない保存データを空の作品帳として扱わず、元データを削除しない', async () => {
    await saveAndActivateArtwork(null, first, { 'first-paper': null });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kids-paint', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('artworks', 'readwrite');
      tx.objectStore('artworks').put({ id: 'unreadable', drawing: 'broken' });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    await expect(loadArtworks()).rejects.toThrow();
    // A load failure must remain a failure on the next attempt, not erase the corrupt record.
    await expect(loadArtworks()).rejects.toThrow();
  });
});


describe('複数タブの保存競合', () => {
  it('古い版で別タブの新しい線を上書きしない', async () => {
    await saveAndActivateArtwork(null, first, { 'first-paper': null });
    const otherTab = { ...first, updatedAt: 2000, backgroundColor: '#FCE4EC' };
    await saveArtwork(otherTab, 1000);
    await expect(saveArtwork({ ...first, updatedAt: 3000 }, 1000)).rejects.toThrow('別の画面');
    expect((await loadArtworks()).artworks).toEqual([otherTab]);
  });

  it('切替先が更新済みなら切替元の書込みも同じトランザクションで取り消す', async () => {
    await saveAndActivateArtwork(null, first, { 'first-paper': null });
    await saveArtwork(second, null);
    await saveArtwork({ ...second, updatedAt: 4000 }, 2000);
    await expect(saveAndActivateArtwork({ ...first, updatedAt: 3000 }, second, { 'first-paper': 1000, 'second-paper': 2000 })).rejects.toThrow('別の画面');
    const session = await loadArtworks();
    expect(session.currentId).toBe(first.id);
    expect(session.artworks.find(art => art.id === first.id)).toEqual(first);
  });
});
