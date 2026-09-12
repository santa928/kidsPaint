/** Verify legacy stamp pixels and clipping survive a UI-created V2 stamp and reload. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/kidsPaint/';
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'output/full-canvas';
const ARTWORK_ID = 'legacy-seven-stamps';
const LEGACY_STAMPS = [
  { name: 'circle', stampId: 'circle', x: 180, y: 180, size: 120, color: '#FF0000', rainbow: false, region: [70, 70, 290, 290] },
  { name: 'square', stampId: 'square', x: 450, y: 180, size: 120, color: '#008000', rainbow: false, region: [340, 70, 560, 290] },
  { name: 'triangle', stampId: 'triangle', x: 700, y: 180, size: 120, color: '#0000FF', rainbow: false, region: [590, 70, 810, 290] },
  { name: 'rabbit-top-crop', stampId: 'rabbit', x: 960, y: 100, size: 180, color: '#800080', rainbow: false, region: [830, 0, 1090, 260] },
  { name: 'cross-left-crop', stampId: 'cross', x: 30, y: 450, size: 160, color: '#FFA500', rainbow: false, region: [0, 320, 170, 580] },
  { name: 'bird-right-crop', stampId: 'bird', x: 1160, y: 500, size: 180, color: '#FF69B4', rainbow: false, region: [1010, 350, 1200, 650] },
  { name: 'train-bottom-crop', stampId: 'train', x: 650, y: 850, size: 180, color: '#000000', rainbow: false, region: [500, 700, 810, 900] },
];

const legacyArtwork = {
  id: ARTWORK_ID,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  backgroundColor: '#FFFFFF',
  drawing: {
    version: 1,
    width: 1200,
    height: 900,
    operations: LEGACY_STAMPS.map(({ stampId, x, y, size, color, rainbow }) => ({ kind: 'stamp', stampId, x, y, size, color, rainbow })),
  },
};

async function waitForArtwork(page, operationCount) {
  await page.waitForFunction(({ id, count }) => {
    if (!window.render_game_to_text) return false;
    const value = JSON.parse(window.render_game_to_text());
    return value.artworkId === id && value.operationCount === count && value.saveStatus === 'saved';
  }, { id: ARTWORK_ID, count: operationCount });
}

async function seedLegacyArtwork(page) {
  await page.evaluate(artwork => new Promise((resolve, reject) => {
    const open = indexedDB.open('kids-paint', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['artworks', 'meta'], 'readwrite');
      const artworks = tx.objectStore('artworks');
      const meta = tx.objectStore('meta');
      artworks.clear();
      meta.clear();
      artworks.put(artwork);
      meta.put({ id: 'current', artworkId: artwork.id });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), legacyArtwork);
}

async function readArtwork(page) {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const open = indexedDB.open('kids-paint', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('artworks', 'readonly');
      const read = tx.objectStore('artworks').get(id);
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), ARTWORK_ID);
}

/** Hash world-coordinate regions after mapping them through the app's active camera. */
async function pixelEvidence(page, storeBaseline = false) {
  return page.getByTestId('painting-canvas').evaluate(async (canvas, payload) => {
    const { stampRegions, storeBaseline } = payload;
    const context = canvas.getContext('2d');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    if (storeBaseline) window.__legacyBaselinePixels = new Uint8ClampedArray(pixels.data);
    const camera = JSON.parse(canvas.dataset.camera);
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const toPixelRect = ([left, top, right, bottom]) => {
      const x1 = Math.max(0, Math.floor((left * camera.scale + camera.offsetX) * scaleX));
      const y1 = Math.max(0, Math.floor((top * camera.scale + camera.offsetY) * scaleY));
      const x2 = Math.min(canvas.width, Math.ceil((right * camera.scale + camera.offsetX) * scaleX));
      const y2 = Math.min(canvas.height, Math.ceil((bottom * camera.scale + camera.offsetY) * scaleY));
      return [x1, y1, x2, y2];
    };
    const digestRect = async rect => {
      const [x1, y1, x2, y2] = rect;
      const bytes = context.getImageData(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1)).data;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    };
    const countAlpha = rect => {
      const [x1, y1, x2, y2] = rect;
      const bytes = context.getImageData(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1)).data;
      let count = 0;
      for (let index = 3; index < bytes.length; index += 4) if (bytes[index]) count++;
      return count;
    };
    const regions = {};
    for (const stamp of stampRegions) {
      const rect = toPixelRect(stamp.region);
      regions[stamp.name] = { rect, hash: await digestRect(rect), alphaPixels: countAlpha(rect) };
    }
    const bands = {
      top: [0, 0, canvas.width, Math.min(4, canvas.height)],
      left: [0, 0, Math.min(4, canvas.width), canvas.height],
      right: [Math.max(0, canvas.width - 4), 0, canvas.width, canvas.height],
      bottom: [0, Math.max(0, canvas.height - 4), canvas.width, canvas.height],
    };
    const edgeBands = {};
    for (const [name, rect] of Object.entries(bands)) edgeBands[name] = { hash: await digestRect(rect), alphaPixels: countAlpha(rect) };
    return {
      bitmap: [canvas.width, canvas.height],
      camera: { scale: camera.scale, offsetX: camera.offsetX, offsetY: camera.offsetY },
      regions,
      edgeBands,
    };
  }, { stampRegions: LEGACY_STAMPS.map(({ name, region }) => ({ name, region })), storeBaseline });
}

async function diffOutsideNewStamp(page, operation) {
  return page.getByTestId('painting-canvas').evaluate((canvas, operation) => {
    const context = canvas.getContext('2d');
    const current = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const baselinePixels = window.__legacyBaselinePixels;
    if (!(baselinePixels instanceof Uint8ClampedArray) || baselinePixels.length !== current.length) throw new Error('baseline pixels unavailable');
    const camera = JSON.parse(canvas.dataset.camera);
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const padding = operation.size * 0.55;
    const x1 = Math.max(0, Math.floor(((operation.x - padding) * camera.scale + camera.offsetX) * scaleX));
    const y1 = Math.max(0, Math.floor(((operation.y - padding) * camera.scale + camera.offsetY) * scaleY));
    const x2 = Math.min(canvas.width, Math.ceil(((operation.x + padding) * camera.scale + camera.offsetX) * scaleX));
    const y2 = Math.min(canvas.height, Math.ceil(((operation.y + padding) * camera.scale + camera.offsetY) * scaleY));
    let changedOutside = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (x >= x1 && x < x2 && y >= y1 && y < y2) continue;
      const offset = (y * canvas.width + x) * 4;
      if (current[offset] !== baselinePixels[offset] || current[offset + 1] !== baselinePixels[offset + 1]
        || current[offset + 2] !== baselinePixels[offset + 2] || current[offset + 3] !== baselinePixels[offset + 3]) changedOutside++;
    }
    return { changedOutside, excludedPixelRect: [x1, y1, x2, y2] };
  }, operation);
}

function assertLegacyEvidence(engine, baseline, candidate, phase) {
  assert.deepEqual(candidate.bitmap, baseline.bitmap, `${engine}: ${phase} bitmap changed`);
  assert.deepEqual(candidate.camera, baseline.camera, `${engine}: ${phase} camera changed`);
  for (const stamp of LEGACY_STAMPS) {
    assert.equal(candidate.regions[stamp.name].hash, baseline.regions[stamp.name].hash,
      `${engine}: ${phase} changed legacy ${stamp.name} pixels`);
    assert(baseline.regions[stamp.name].alphaPixels > 0, `${engine}: ${stamp.name} was not rendered`);
  }
  for (const edge of ['top', 'left', 'right', 'bottom']) {
    assert(baseline.edgeBands[edge].alphaPixels > 0, `${engine}: seeded ${edge} crop does not touch the paper edge`);
    assert.equal(candidate.edgeBands[edge].hash, baseline.edgeBands[edge].hash,
      `${engine}: ${phase} changed the ${edge} crop band`);
  }
}

async function runEngine(engine, browserType) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).saveStatus === 'saved');
    await seedLegacyArtwork(page);
    await page.reload();
    await waitForArtwork(page, 7);

    const seeded = await readArtwork(page);
    assert.equal(seeded.drawing.coordinateSpace, undefined, `${engine}: seed is not legacy format`);
    assert.equal(seeded.drawing.legacyOperationCount, undefined, `${engine}: seed unexpectedly has a migration boundary`);
    assert(seeded.drawing.operations.every(operation => operation.kind === 'stamp' && operation.designVersion === undefined),
      `${engine}: seed unexpectedly contains a V2 stamp`);

    const before = await pixelEvidence(page, true);
    await page.screenshot({ path: `${OUTPUT_DIR}/legacy-${engine}-before.png` });
    await page.getByRole('button', { name: 'スタンプ', exact: true }).click();
    await page.getByRole('button', { name: 'まる', exact: true }).click();

    const canvas = page.getByTestId('painting-canvas');
    const target = await canvas.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const camera = JSON.parse(element.dataset.camera);
      return {
        x: rect.left + 600 * camera.scale + camera.offsetX,
        y: rect.top + 450 * camera.scale + camera.offsetY,
      };
    });
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), target),
      'painting-canvas', 'UI overlay intercepts the intended V2 stamp point');
    await page.mouse.click(target.x, target.y);
    await waitForArtwork(page, 8);

    const migrated = await readArtwork(page);
    assert.equal(migrated.drawing.coordinateSpace, 'world', `${engine}: migrated coordinate space missing`);
    assert.equal(migrated.drawing.legacyOperationCount, 7, `${engine}: legacy boundary changed`);
    assert.deepEqual(migrated.drawing.operations.slice(0, 7), legacyArtwork.drawing.operations,
      `${engine}: a legacy operation changed during migration`);
    const newOperation = migrated.drawing.operations[7];
    assert.equal(newOperation.kind, 'stamp');
    assert.equal(newOperation.stampId, 'circle');
    assert.equal(newOperation.designVersion, 2, `${engine}: UI-created stamp is not V2`);

    const afterAdd = await pixelEvidence(page);
    assertLegacyEvidence(engine, before, afterAdd, 'after V2 append');
    const pixelDiff = await diffOutsideNewStamp(page, newOperation);
    assert.equal(pixelDiff.changedOutside, 0, `${engine}: adding V2 changed pixels outside its own square`);
    await page.screenshot({ path: `${OUTPUT_DIR}/legacy-${engine}-after-v2.png` });

    await page.reload();
    await waitForArtwork(page, 8);
    const reloaded = await readArtwork(page);
    assert.deepEqual(reloaded.drawing, migrated.drawing, `${engine}: saved drawing changed after reload`);
    assert.equal(reloaded.drawing.operations[7].designVersion, 2, `${engine}: V2 design version was not retained`);
    const afterReload = await pixelEvidence(page);
    assertLegacyEvidence(engine, before, afterReload, 'after reload');
    await page.screenshot({ path: `${OUTPUT_DIR}/legacy-${engine}-reloaded.png` });
    assert.deepEqual(errors, [], `${engine}: browser emitted page errors`);

    return {
      engine,
      status: 'PASS',
      seed: { format: 'legacy coordinateSpace absent', operations: 7, stampIds: LEGACY_STAMPS.map(stamp => stamp.stampId) },
      migration: { coordinateSpace: migrated.drawing.coordinateSpace, legacyOperationCount: migrated.drawing.legacyOperationCount,
        operationCount: migrated.drawing.operations.length, newStamp: newOperation },
      pixelDiff,
      before,
      afterAdd,
      afterReload,
      checks: [
        'actual IndexedDB legacy record loaded without pre-migration',
        'one V2 circle placed through visible stamp picker and canvas pointer input',
        'all seven legacy stamp regions remain pixel-identical after append and reload',
        'top rabbit, left cross, right bird, and bottom train crop bands remain pixel-identical',
        'saved drawing retains the seven legacy operations and the new designVersion 2 stamp',
      ],
      errors,
    };
  } finally {
    await browser.close();
  }
}

(async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const results = [];
  let failed = false;
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    try {
      const result = await runEngine(engine, browserType);
      results.push(result);
      console.log(`${engine}: legacy seven-stamp migration and pixel preservation PASS`);
    } catch (error) {
      failed = true;
      results.push({ engine, status: 'FAIL', error: error.message, stack: error.stack });
      console.error(`${engine}: ${error.stack}`);
    }
  }
  await fs.writeFile(`${OUTPUT_DIR}/legacy-results.json`, `${JSON.stringify(results, null, 2)}\n`);
  if (failed) process.exitCode = 1;
})();
