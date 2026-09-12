import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('更新時に同じオリジンの別アプリのキャッシュを消さない', async () => {
  const listeners = new Map<string, (event: { waitUntil: (work: Promise<unknown>) => void }) => void>();
  const deleteCache = vi.fn(async () => true);
  const source = readFileSync('public/sw.js', 'utf8').replace('__BUILD_ID__', 'test').replace('__PRECACHE_MANIFEST__', '["./index.html"]');
  runInNewContext(source, {
    self: { addEventListener: (type: string, listener: (event: { waitUntil: (work: Promise<unknown>) => void }) => void) => listeners.set(type, listener), skipWaiting: vi.fn(), clients: { claim: async () => undefined }, location: { origin: 'https://example.com' }, registration: { scope: 'https://example.com/kidsPaint/' } },
    caches: { keys: async () => ['kidsPaint-v1', 'kidsPaint-v2-old', 'another-app-v1'], delete: deleteCache }, URL,
  });
  let completion: Promise<unknown> | undefined;
  listeners.get('activate')?.({ waitUntil: work => { completion = work; } });
  await completion;
  expect(deleteCache.mock.calls.map(call => call[0])).toEqual(['kidsPaint-v1', 'kidsPaint-v2-old']);
});
