/** Browser acceptance against the running app. Run only in the documented Docker browser image. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const url = process.env.APP_URL || 'http://127.0.0.1:5173/kidsPaint/';
const output = process.env.OUTPUT_DIR || 'output/tablet-refresh';
const results = [];

/** Wait until React and the committed IndexedDB write both describe the same settled session. */
async function settled(page) {
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).saveStatus === 'saved');
  return state(page);
}
async function state(page) { return page.evaluate(() => JSON.parse(window.render_game_to_text())); }
async function box(page) { return page.getByTestId('painting-canvas').boundingBox(); }
async function choose(page, name) { await page.getByRole('button', { name, exact: true }).click(); }
async function frame(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
/** Draw using native browser pointer input, in fractions of the actual fitted paper. */
async function stroke(page, start = [.2, .3], end = [.65, .6], steps = 16) {
  const b = await box(page);
  await page.mouse.move(b.x + b.width * start[0], b.y + b.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * end[0], b.y + b.height * end[1], { steps });
  await page.mouse.up();
}
async function tapPaper(page, x = .5, y = .5) {
  const b = await box(page); await page.mouse.click(b.x + b.width * x, b.y + b.height * y);
}
/** Read real stored records, without substituting an app test double for IndexedDB. */
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('kids-paint', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('artworks'), read = tx.objectStore('artworks').getAll();
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}
async function currentRecord(page) { const s = await state(page); return (await records(page)).find(art => art.id === s.artworkId); }
async function pixels(page) {
  return page.getByTestId('painting-canvas').evaluate(canvas => {
    const { width, height } = canvas, data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let count = 0, left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]) {
      count++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { count, bounds: count ? [left, top, right - left + 1, bottom - top + 1] : null, bitmap: [width, height] };
  });
}
/** Decode an actual downloaded PNG in the browser and inspect its opaque paper color. */
async function inspectPng(page, download, filename) {
  const pngPath = path.join(output, filename); await download.saveAs(pngPath);
  const base64 = (await fs.readFile(pngPath)).toString('base64');
  return page.evaluate(data => new Promise((resolve, reject) => {
    const image = new Image(); image.onerror = reject;
    image.onload = () => { const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); resolve({ width: image.width, height: image.height, corner: [...ctx.getImageData(0, 0, 1, 1).data] }); };
    image.src = `data:image/png;base64,${data}`;
  }), base64);
}
/** Measure button containment and target sizes rather than trusting screenshots alone. */
async function layout(page, name, tablet = true) {
  await frame(page);
  const data = await page.evaluate(() => {
    const modal = document.querySelector('dialog[open]');
    const buttons = [...(modal || document).querySelectorAll('button')].filter(el => el.getClientRects().length);
    return { viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth,
      buttons: buttons.map(el => { const b = el.getBoundingClientRect(); return { name: el.ariaLabel || el.textContent.trim(), x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; }),
      paper: document.querySelector('[data-testid="painting-canvas"]')?.getBoundingClientRect().toJSON() };
  });
  assert.equal(data.overflow, false, `${name}: document must not overflow horizontally`);
  for (const b of data.buttons) {
    assert(b.x >= -.5 && b.right <= data.viewport[0] + .5, `${name}: ${b.name} must fit horizontally`);
    if (!name.includes('settings')) assert(b.y >= 0 && b.bottom <= data.viewport[1] + .5, `${name}: ${b.name} must fit vertically`);
    if (tablet && !name.includes('settings')) assert(b.width >= 55.5 && b.height >= 55.5, `${name}: ${b.name} must be at least 56px`);
  }
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  return data;
}
async function newPaper(page) { const id = (await state(page)).artworkId; await choose(page, 'あたらしいかみ'); await page.waitForFunction(old => JSON.parse(window.render_game_to_text()).artworkId !== old, id); return settled(page); }

/** Verify core drawing and persistence in Chromium and Safari's WebKit engine independently. */
async function check(name, type) {
  const browser = await type.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true });
    const page = await context.newPage();
    const result = { engine: name, errors: [], checks: [], layouts: [] };
    results.push(result);
    page.on('pageerror', error => result.errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(url); await settled(page);
    assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
    assert.equal(await page.getByRole('group', { name: 'いろ', exact: true }).getByRole('button').count(), 10);
    result.layouts.push(await layout(page, `${name}-landscape`));
    console.log(`${name}: drawing, undo, tools`);
    await stroke(page); await settled(page);
    const one = await pixels(page); assert(one.count > 100);
    await tapPaper(page, .8, .7); await settled(page);
    assert((await pixels(page)).count > one.count);
    await choose(page, 'ひとつもどす'); await settled(page);
    assert.deepEqual(await pixels(page), one);
    await choose(page, 'にじいろ'); await choose(page, 'けしゴム'); await choose(page, 'クレヨン');
    assert.equal((await state(page)).tool, 'brush'); assert.equal((await state(page)).rainbow, true);
    await stroke(page, [.2, .7], [.65, .3]); await settled(page);
    const drawn = await currentRecord(page);
    assert.equal(drawn.drawing.operations.at(-1).erase, false); assert.equal(drawn.drawing.operations.at(-1).rainbow, true);
    for (const width of ['ほそい', 'ふつう', 'ふとい']) { await choose(page, width); assert.equal(await page.getByRole('button', { name: width, exact: true }).getAttribute('aria-pressed'), 'true'); }
    result.checks.push('native drawing, exact undo pixels, eraser-to-crayon, retained rainbow, three sizes');

    console.log(`${name}: stamp preview, rotation, reload`);
    await newPaper(page); await choose(page, 'あか'); await choose(page, 'ふつう'); await choose(page, 'スタンプ');
    assert.equal(await page.locator('dialog').count(), 1);
    result.layouts.push(await layout(page, `${name}-stamps`));
    assert.equal(await page.locator('.stamp-choice').count(), 7);
    await choose(page, 'まる'); await tapPaper(page); await settled(page);
    const circle = await currentRecord(page), initialPixels = await pixels(page);
    assert(Math.abs(initialPixels.bounds[2] / initialPixels.bounds[3] - 1) < .04);
    await page.setViewportSize({ width: 768, height: 1024 }); await frame(page);
    const rotated = await pixels(page);
    assert(Math.abs(rotated.bounds[2] / rotated.bounds[3] - 1) < .04);
    assert.equal((await state(page)).width, circle.drawing.width);
    result.layouts.push(await layout(page, `${name}-portrait`));
    await page.reload(); await settled(page); await frame(page);
    assert.deepEqual((await currentRecord(page)).drawing, circle.drawing);
    assert((await pixels(page)).count > 100);
    result.checks.push('matching seven stamp previews, circular geometry after rotation, IndexedDB reload restoration');

    console.log(`${name}: gallery, background, export, recoverable clear`);
    const newState = await newPaper(page); assert.equal(newState.width, 900); assert.equal(newState.height, 1200);
    await stroke(page); await settled(page);
    await choose(page, 'さくひん');
    result.layouts.push(await layout(page, `${name}-gallery`));
    const savedPapers = await records(page); assert.equal(savedPapers.length, 3);
    const galleryCurrent = (await state(page)).artworkId;
    const galleryDownload = page.waitForEvent('download'); await page.locator('.artwork-download').nth(1).click();
    assert.deepEqual(await inspectPng(page, await galleryDownload, `${name}-gallery-export.png`), { width: 1200, height: 900, corner: [255, 255, 255, 255] });
    assert.equal((await state(page)).artworkId, galleryCurrent);
    result.checks.push('gallery exports a non-current paper without changing the active artwork');
    // The circle is the second card, following the newly active paper.
    await page.locator('.artwork-open').nth(1).click(); await settled(page);
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).artworkId === id, circle.id);
    await choose(page, 'かみのいろ'); assert.equal(await page.locator('.background-grid button').count(), 8);
    await choose(page, 'かみ そら'); await settled(page);
    await choose(page, 'おうちの方へ');
    const downloadPromise = page.waitForEvent('download'); await choose(page, '画像を保存'); const download = await downloadPromise;
    const exported = await inspectPng(page, download, `${name}-export.png`);
    assert.deepEqual(exported, { width: 1200, height: 900, corner: [230, 247, 255, 255] });
    await choose(page, 'この紙をまっさらにする'); await settled(page); assert.equal((await pixels(page)).count, 0);
    await choose(page, 'ひとつもどす'); await settled(page); assert((await pixels(page)).count > 100);
    await page.reload(); await settled(page); assert.equal((await state(page)).backgroundColor, '#E6F7FF');
    result.checks.push('safe new paper, gallery reopens original, PNG dimensions and opaque background, clear undo and reload');

    // Each stamp is placed through its visible UI, not an injected drawing model.
    await choose(page, 'にじいろ');
    for (const [index, stampName] of ['ばつ', 'しかく', 'さんかく', 'うさぎ', 'とり', 'でんしゃ'].entries()) {
      await choose(page, 'スタンプ'); await choose(page, stampName); await tapPaper(page, .2 + (index % 3) * .3, index < 3 ? .25 : .75); await settled(page);
    }
    assert.equal((await currentRecord(page)).drawing.operations.length, 7);
    await page.screenshot({ path: path.join(output, `${name}-artwork.png`) });
    await choose(page, 'おうちの方へ'); await choose(page, 'おとをオン');
    assert.equal(await page.getByRole('button', { name: 'おとをオフ', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('slider').fill('60'); await choose(page, 'とじる');
    await page.reload(); await settled(page); await choose(page, 'おうちの方へ');
    assert.equal(await page.getByRole('slider').inputValue(), '60'); await choose(page, 'おとをオフ'); await choose(page, 'とじる');
    await page.setViewportSize({ width: 390, height: 844 });
    result.layouts.push(await layout(page, `${name}-phone`, false));
    await choose(page, 'スタンプ'); result.layouts.push(await layout(page, `${name}-phone-stamps`, false)); await choose(page, 'とじる');
    assert.equal(await page.getByRole('button', { name: 'スタンプ', exact: true }).evaluate(el => el === document.activeElement), true);
    result.checks.push('all seven stamp marks, sound setting persistence, 390px fallback, modal focus return');

    if (name === 'chromium') {
      console.log(`${name}: multitouch, cancellation, rotation during a stroke`);
      await page.setViewportSize({ width: 1024, height: 768 }); await newPaper(page); await choose(page, 'クレヨン'); await choose(page, 'あお');
      const b = await box(page), cdp = await context.newCDPSession(page);
      const first = { x: b.x + b.width * .2, y: b.y + b.height * .25, id: 1 };
      const second = { x: b.x + b.width * .8, y: b.y + b.height * .8, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x + 20 }, second] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settled(page);
      const op = (await currentRecord(page)).drawing.operations;
      assert.equal(op.length, 1); assert(op[0].points.every(p => p.x < 400 && p.y < 300));
      await page.screenshot({ path: path.join(output, 'chromium-multitouch.png') });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await settled(page);
      await tapPaper(page, .6, .6); await settled(page); assert.equal((await state(page)).operationCount, 3);
      await newPaper(page); const r = await box(page);
      await page.mouse.move(r.x + r.width * .2, r.y + r.height * .3); await page.mouse.down();
      await page.mouse.move(r.x + r.width * .3, r.y + r.height * .35);
      await page.setViewportSize({ width: 768, height: 1024 }); await frame(page);
      await page.mouse.move(600, 600); await page.mouse.up(); await settled(page);
      const interrupted = (await currentRecord(page)).drawing.operations;
      assert.equal(interrupted.length, 1); assert(interrupted[0].points.every(p => p.x < 400));
      // Browser chrome changes viewport height without changing width: finish before camera shift.
      const beforeShift = await box(page);
      await page.mouse.move(beforeShift.x + beforeShift.width * .4, beforeShift.y + beforeShift.height * .4); await page.mouse.down();
      await page.mouse.move(beforeShift.x + beforeShift.width * .5, beforeShift.y + beforeShift.height * .4);
      await page.setViewportSize({ width: 768, height: 944 }); await frame(page);
      const afterShift = await box(page);
      assert(Math.abs(afterShift.width - beforeShift.width) < 1); assert.equal(beforeShift.height - afterShift.height, 80);
      await page.mouse.move(beforeShift.x + beforeShift.width * .5, beforeShift.y + beforeShift.height * .4 + 80); await page.mouse.up(); await settled(page);
      const shiftedOperation = (await currentRecord(page)).drawing.operations.at(-1);
      assert(shiftedOperation.points.every(p => Math.abs(p.y - shiftedOperation.points[0].y) < 3));
      result.checks.push('CDP native overlapping fingers ignore secondary contact; pointercancel, held-finger rotation, and browser-height change stop ownership');
      await cdp.detach();
    }
    assert.deepEqual(result.errors, []);
    return result;
  } finally { await browser.close(); }
}

/** Force a real IndexedDB write failure and verify visible unsaved work never disappears. */
async function failures() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(url); const original = await settled(page);
    await page.evaluate(() => { window.restoreArtworkPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'artworks') throw new DOMException('Test quota exhausted', 'QuotaExceededError'); return window.restoreArtworkPut.apply(this, args); }; });
    await stroke(page); await page.getByRole('alert').waitFor();
    await choose(page, 'あたらしいかみ'); await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.saveStatus === 'error' && !s.busy; });
    assert.equal((await state(page)).artworkId, original.artworkId); assert.equal((await state(page)).operationCount, 1); assert((await pixels(page)).count > 100);
    await page.screenshot({ path: path.join(output, 'storage-failure.png') });
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.restoreArtworkPut; });
    await choose(page, '再試行'); await settled(page); await page.reload(); await settled(page); assert.equal((await state(page)).operationCount, 1);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('kids-paint', 1); open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, tx = db.transaction('artworks', 'readwrite'); tx.objectStore('artworks').put({ id: 'corrupt-record', drawing: 'invalid' }); tx.oncomplete = () => { db.close(); resolve(); }; };
    }));
    await page.reload(); await page.getByRole('alert').waitFor();
    assert.equal(await page.getByTestId('painting-canvas').count(), 0);
    const raw = await records(page); assert.equal(raw.length, 2); assert(raw.some(art => art.id === original.artworkId && art.drawing.operations.length === 1));
    results.push({ engine: 'chromium-failure', checks: ['quota failure retains current paper and stroke; retry restores persisted work', 'corrupt saved collection remains intact and is never treated as empty'] });
  } finally { await browser.close(); }
}
/** Exercise initial read recovery and competing tabs through actual IndexedDB and UI input. */
async function recoveryAndConflict() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const first = await context.newPage(); await first.goto(url); await settled(first);
    await stroke(first); const original = await settled(first);
    await first.addInitScript(() => {
      const open = IDBFactory.prototype.open;
      // Both StrictMode initialization effects fail; retry uses the real implementation.
      let remaining = 2;
      IDBFactory.prototype.open = function (...args) { if (remaining-- > 0) throw new Error('Temporary read failure'); return open.apply(this, args); };
    });
    await first.reload(); await first.getByRole('alert').waitFor();
    assert.equal(await first.getByTestId('painting-canvas').count(), 0);
    await choose(first, '再試行'); await settled(first);
    assert.equal((await state(first)).artworkId, original.artworkId);
    assert.equal((await state(first)).operationCount, 1);
    assert.equal((await records(first)).length, 1);
    const second = await context.newPage(); await second.goto(url); await settled(second);
    await choose(second, 'あお'); await stroke(second, [.2, .7], [.8, .7]); await settled(second);
    const otherVersion = await currentRecord(second);
    await choose(first, 'みどり'); await stroke(first, [.2, .2], [.8, .2]);
    await first.getByRole('alert').waitFor();
    assert((await first.getByRole('alert').innerText()).includes('別の画面'));
    assert.deepEqual((await records(first)).find(art => art.id === original.artworkId), otherVersion);
    assert.equal((await state(first)).operationCount, 2);
    assert((await pixels(first)).count > 100);
    await choose(first, 'あたらしいかみ');
    await first.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return !s.busy && s.saveStatus === 'error'; });
    assert.equal((await state(first)).artworkId, original.artworkId);
    results.push({ engine: 'chromium-recovery', checks: ['initial read failure retries the original artwork, without creating a blank', 'competing tabs cannot overwrite newer persisted strokes; local marks remain visible and exportable'] });
  } finally { await browser.close(); }
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  try {
    if (process.env.CHECK === 'recovery') await recoveryAndConflict();
    else { await check('chromium', chromium); await check('webkit', webkit); await failures(); await recoveryAndConflict(); }
  }
  finally { await fs.writeFile(path.join(output, process.env.CHECK ? `browser-${process.env.CHECK}-results.json` : 'browser-results.json'), JSON.stringify(results, null, 2)); }
  console.log(`PASS: ${process.env.CHECK || 'all'} tablet drawing acceptance checks`);
})().catch(error => { console.error(error); process.exitCode = 1; });
