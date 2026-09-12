/* Build replaces both tokens with the exact files and content hash in dist. */
const CACHE_NAME = 'kidsPaint-v2-__BUILD_ID__';
const PRECACHE = __PRECACHE_MANIFEST__;
const ASSETS = new Set(PRECACHE.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...ASSETS])));
  // Let an open drawing session finish before the new worker activates.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('kidsPaint-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    // Pair this worker's HTML with its precached hashed assets, including offline starts.
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(new URL('index.html', self.registration.scope).href)) || fetch(request)));
    return;
  }
  if (!ASSETS.has(request.url)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(request)) || fetch(request)));
});
