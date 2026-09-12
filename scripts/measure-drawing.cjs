/** Measure a synthetic long drawing on the real UI; this is not physical iPad evidence. */
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/kidsPaint/');
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).saveStatus === 'saved');
    await page.evaluate(() => new Promise((resolve, reject) => {
      const id = JSON.parse(window.render_game_to_text()).artworkId;
      const request = indexedDB.open('kids-paint', 1); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('artworks', 'readwrite'), store = tx.objectStore('artworks'), get = store.get(id);
        get.onsuccess = () => {
          const art = get.result;
          art.drawing.operations = Array.from({ length: 500 }, (_, i) => ({ kind: 'stroke', points: Array.from({ length: 120 }, (_, j) => ({ x: 30 + j * 9, y: 60 + (i % 30) * 26 + Math.sin(j / 5) * 18 })), color: ['#FF0000', '#008000', '#0000FF'][i % 3], size: 8, rainbow: i % 5 === 0, erase: false, startHue: i % 360 }));
          store.put(art);
        };
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    }));
    const reloadStarted = Date.now(); await page.reload();
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).operationCount === 500);
    const restorationMs = Date.now() - reloadStarted;
    await page.evaluate(() => {
      window.frameDeltas = []; window.longTasks = []; window.measureDrawing = true;
      let previous;
      const collect = time => { if (previous !== undefined) window.frameDeltas.push(time - previous); previous = time; if (window.measureDrawing) requestAnimationFrame(collect); };
      requestAnimationFrame(collect);
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => { window.longTasks.push(...list.getEntries().map(entry => entry.duration)); }).observe({ type: 'longtask' });
    });
    const paper = await page.getByTestId('painting-canvas').boundingBox();
    await page.mouse.move(paper.x + paper.width * .1, paper.y + paper.height * .4); await page.mouse.down();
    await page.mouse.move(paper.x + paper.width * .9, paper.y + paper.height * .6, { steps: 120 });
    const saveStarted = Date.now(); await page.mouse.up();
    await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.operationCount === 501 && s.saveStatus === 'saved'; });
    const saveMs = Date.now() - saveStarted;
    const measurement = await page.evaluate(() => { window.measureDrawing = false; const sorted = window.frameDeltas.slice().sort((a, b) => a - b); return { frames: sorted.length, frameP95Ms: sorted[Math.floor(sorted.length * .95)], frameMaxMs: sorted.at(-1), longTasksMs: window.longTasks }; });
    const burstStart = Date.now();
    for (let i = 0; i < 40; i++) await page.mouse.click(paper.x + paper.width * (.1 + (i % 10) * .08), paper.y + paper.height * (.2 + Math.floor(i / 10) * .12));
    const lastTapAt = Date.now();
    await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.operationCount === 541 && s.saveStatus === 'saved'; });
    const burst = { taps: 40, totalMs: Date.now() - burstStart, afterLastTapMs: Date.now() - lastTapAt };
    await page.reload(); await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).operationCount === 541);
    const restoredOperationCount = await page.evaluate(() => JSON.parse(window.render_game_to_text()).operationCount);
    const result = { scenario: '500 synthetic strokes / 60000 points, 20% rainbow; then 120 native pointer moves', environment: 'headless Chromium, Linux Docker, DPR 2; not an iPad', restorationMs, saveMs, burst, savedOperationCount: 541, restoredOperationCount, ...measurement };
    const output = process.env.OUTPUT_DIR || 'output/tablet-refresh'; await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'performance.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
