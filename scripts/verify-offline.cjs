/** Production-only offline verification; uses actual service-worker caches and no request interception. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const output = process.env.OUTPUT_DIR || 'output/tablet-refresh';
/** Serve built files without the HTTP cache, so a stopped server proves SW fallback. */
async function productionServer() {
  const root = path.resolve(process.env.BUILD_DIR || 'dist');
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' };
  const server = http.createServer(async (request, response) => {
    const route = new URL(request.url, 'http://localhost').pathname;
    const relative = route.replace(/^\/kidsPaint\//, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(404).end(); return; }
    try { const body = await fs.readFile(file); response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/kidsPaint/`, stop: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
(async () => {
  const results = [];
  for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const server = await productionServer();
    const url = server.url;
    const browser = await type.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
      await context.addInitScript(() => { void caches.open('another-app-test').then(cache => cache.put('/unrelated-test', new Response('keep'))); });
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).saveStatus === 'saved');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      const cacheState = await page.evaluate(async () => {
        const keys = await caches.keys();
        const ours = keys.find(key => key.startsWith('kidsPaint-v2-'));
        const entries = await (await caches.open(ours)).keys();
        return { keys, entries: entries.map(request => request.url) };
      });
      assert(cacheState.keys.includes('another-app-test'));
      assert(cacheState.entries.some(asset => /\/assets\/.*\.js$/.test(asset)));
      assert(cacheState.entries.some(asset => asset.endsWith('/sounds/stamp-rabbit-hop.wav')));
      const id = await page.evaluate(() => JSON.parse(window.render_game_to_text()).artworkId);
      await server.stop();
      await assert.rejects(fetch(url), 'production server must actually be unreachable');
      await page.reload();
      await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).saveStatus === 'saved');
      assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).artworkId), id);
      const paper = await page.getByTestId('painting-canvas').boundingBox();
      await page.mouse.click(paper.x + paper.width * .5, paper.y + paper.height * .5);
      await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.operationCount === 1 && s.saveStatus === 'saved'; });
      const soundBytes = await page.evaluate(async () => (await (await fetch('./sounds/stamp-rabbit-hop.wav')).arrayBuffer()).byteLength);
      assert(soundBytes > 44);
      await page.reload();
      await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).operationCount === 1);
      await page.screenshot({ path: path.join(output, `${name}-offline.png`) });
      results.push({ engine: name, precachedFiles: cacheState.entries.length, offlineSoundBytes: soundBytes, checks: ['production hashed JS/CSS and sounds precached', 'foreign cache survives', 'server stopped with HTTP caching disabled; offline reload and local artwork persistence'] });

      console.log(`${name}: production offline PASS`);
    } finally { await browser.close(); await server.stop(); }
  }
  await fs.writeFile(path.join(output, 'offline-results.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
