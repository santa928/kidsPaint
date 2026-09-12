/** Real browser acceptance for full paper coverage, rotation, legacy compatibility, and PNG margins. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const url = process.env.APP_URL || 'http://127.0.0.1:5173/kidsPaint/';
const output = process.env.OUTPUT_DIR || 'output/full-canvas';
const results = [];
async function settled(page) { await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).saveStatus === 'saved'); }
async function choose(page, name) { await page.getByRole('button', { name, exact: true }).click(); }
async function frame(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function record(page) {
  return page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('kids-paint', 1);
    open.onsuccess = () => { const db = open.result, tx = db.transaction('artworks'), read = tx.objectStore('artworks').get(JSON.parse(window.render_game_to_text()).artworkId); tx.oncomplete = () => { db.close(); resolve(read.result); }; };
  }));
}
/** Hit-test the rendered surface; transparent ancestors must not intercept pointer input. */
async function measure(page, filename) {
  const result = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="painting-canvas"]'), bounds = c.getBoundingClientRect();
    let hit = 0, total = 0;
    for (let y = 2; y < innerHeight; y += 4) for (let x = 2; x < innerWidth; x += 4) { total++; if (document.elementFromPoint(x, y) === c) hit++; }
    const buttons = [...document.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => ({ name: b.ariaLabel || b.textContent, ...b.getBoundingClientRect().toJSON() }));
    return { viewport: [innerWidth, innerHeight], paper: bounds.toJSON(), paperPercent: bounds.width * bounds.height / (innerWidth * innerHeight) * 100, drawablePercent: hit / total * 100, buttons };
  });
  assert(Math.abs(result.paperPercent - 100) < .01, 'paper fills viewport within browser subpixel rounding');
  for (const b of result.buttons) {
    assert(b.x >= 0 && b.y >= 0 && b.right <= result.viewport[0] && b.bottom <= result.viewport[1], `${filename}: ${b.name} fits`);
    if (result.viewport[0] >= 768) assert(b.width >= 56 && b.height >= 56, `${b.name} is 56px`);
  }
  await page.screenshot({ path: `${output}/${filename}.png` });
  return result;
}
async function ink(page) {
  return page.getByTestId('painting-canvas').evaluate(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let count = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) count++;
    return count;
  });
}
async function check(name, engine) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await settled(page);
    const layouts = [await measure(page, `${name}-full-landscape`)];
    await choose(page, 'どうぐをかたづける');
    layouts.push(await measure(page, `${name}-full-landscape-hidden`));
    assert(layouts.at(-1).drawablePercent >= 97);
    // Four corners really accept input. Their stamps/brush caps may cross the visible edge.
    for (const [x, y] of [[5, 5], [1019, 5], [5, 763], [1019, 763]]) { await page.mouse.click(x, y); await settled(page); }
    const four = await record(page); assert.equal(four.drawing.operations.length, 4);
    await page.setViewportSize({ width: 768, height: 1024 }); await frame(page);
    layouts.push(await measure(page, `${name}-full-portrait-hidden`));
    assert(layouts.at(-1).drawablePercent >= 97);
    await page.mouse.click(200, 100); await settled(page);
    const expanded = await record(page);
    assert(expanded.drawing.operations.at(-1).points[0].y < 0, 'portrait margin has its own world coordinates');
    const beforeReload = await ink(page);
    assert(beforeReload > 0);
    await page.reload(); await settled(page); await frame(page);
    assert.deepEqual((await record(page)).drawing, expanded.drawing);
    assert(await ink(page) > 0);
    layouts.push(await measure(page, `${name}-full-portrait`));
    await choose(page, 'おうちの方へ');
    const download = page.waitForEvent('download'); await choose(page, '画像を保存');
    const saved = await download; await saved.saveAs(`${output}/${name}-expanded.png`);
    const png = (await fs.readFile(`${output}/${name}-expanded.png`)).toString('base64');
    const pngInfo = await page.evaluate(data => new Promise(resolve => {
      const img = new Image(); img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        const bytes = ctx.getImageData(0, 0, c.width, c.height).data; let topInk = 0;
        for (let y = 0; y < 60; y++) for (let x = 0; x < c.width; x++) if (bytes[(y * c.width + x) * 4 + 1] < 120) topInk++;
        resolve({ width: c.width, height: c.height, topInk });
      }; img.src = `data:image/png;base64,${data}`;
    }), png);
    assert(pngInfo.topInk > 5, 'new margin is present in the actual PNG');
    assert(pngInfo.width <= 1200 && pngInfo.height <= 1200 && pngInfo.width * pngInfo.height <= 1080000);
    await choose(page, 'とじる');
    const beforeClearInk = await ink(page);
    const beforeClearCamera = await page.getByTestId('painting-canvas').getAttribute('data-camera');
    await choose(page, 'おうちの方へ'); await choose(page, 'この紙をまっさらにする'); await settled(page);
    assert.equal(await ink(page), 0);
    const blankCamera = JSON.parse(await page.getByTestId('painting-canvas').getAttribute('data-camera'));
    assert.equal(blankCamera.scale, .64, 'clear resets the camera to the reference paper');
    await choose(page, 'ひとつもどす'); await settled(page);
    assert.equal(await ink(page), beforeClearInk, 'undo clear restores the exact prior view');
    const restoredCamera = JSON.parse(await page.getByTestId('painting-canvas').getAttribute('data-camera'));
    for (const key of ['scale', 'offsetX', 'offsetY']) assert.equal(restoredCamera[key], JSON.parse(beforeClearCamera)[key]);
    await choose(page, 'スタンプ'); await page.screenshot({ path: `${output}/${name}-new-stamp-picker.png` }); await choose(page, 'とじる');
    // Fullscreen either enters through a native user click or offers the documented home-screen path.
    await choose(page, 'ぜんがめん'); await frame(page);
    const full = await page.evaluate(() => Boolean(document.fullscreenElement));
    if (full) { await choose(page, 'ぜんがめんをやめる'); await frame(page); }
    else { await page.getByRole('heading', { name: '画面いっぱいで遊ぶ' }).waitFor(); await choose(page, 'とじる'); }
    // Undo must clear the entire viewport bitmap, including pixels outside the original page.
    await choose(page, 'クレヨン'); await choose(page, 'どうぐをかたづける');
    const oldInk = await ink(page); await page.mouse.click(600, 90); await settled(page); assert(await ink(page) > oldInk);
    await choose(page, 'どうぐをひらく'); await choose(page, 'ひとつもどす'); await settled(page);
    assert.equal(await ink(page), oldInk);
    await page.setViewportSize({ width: 390, height: 844 }); await frame(page);
    layouts.push(await measure(page, `${name}-full-phone`));
    // Completely erasing an outer mark must not leave an invisible, expanding page margin.
    await page.setViewportSize({ width: 1024, height: 768 }); await frame(page);
    const previousId = (await record(page)).id;
    await choose(page, 'あたらしいかみ');
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).artworkId !== id, previousId); await settled(page);
    await choose(page, 'クレヨン'); await choose(page, 'ほそい');
    await page.mouse.click(512, 384); await settled(page);
    await page.setViewportSize({ width: 768, height: 1024 }); await frame(page);
    const anchorInk = await ink(page);
    await page.mouse.click(200, 120); await settled(page);
    assert((await record(page)).drawing.operations.at(-1).points[0].y < 0);
    await choose(page, 'けしゴム'); await choose(page, 'ふとい'); await page.mouse.click(200, 120); await settled(page);
    assert.equal(await ink(page), anchorInk, 'the margin mark is fully erased');
    await page.reload(); await settled(page); await frame(page);
    const erasedCamera = JSON.parse(await page.getByTestId('painting-canvas').getAttribute('data-camera'));
    assert.equal(erasedCamera.scale, .64); assert.equal(erasedCamera.offsetY, 224);
    assert.equal(await ink(page), anchorInk, 'erased margin does not move the remaining drawing after reload');
    await choose(page, 'おうちの方へ');
    const erasedDownload = page.waitForEvent('download'); await choose(page, '画像を保存');
    await (await erasedDownload).saveAs(`${output}/${name}-erased-margin.png`);
    const erasedPng = await fs.readFile(`${output}/${name}-erased-margin.png`);
    assert.equal(erasedPng.readUInt32BE(16), 1200); assert.equal(erasedPng.readUInt32BE(20), 900);
    await choose(page, 'とじる');
    assert.deepEqual(errors, []);
    results.push({ engine: name, layouts, pngInfo, fullscreen: full ? 'native entry and exit' : 'home-screen guidance', checks: ['native pointer input in four corners', 'outside-reference-paper margin saved/reloaded/exported', 'viewport unchanged while toggling controls', 'outside-paper undo clears pixels', 'clear resets camera and undo restores exact prior view', 'erased outer margin neither shrinks remaining ink on reload nor leaves an empty PNG band', 'all buttons contained'], errors });
    console.log(`${name}: full viewport and saved margins passed`);
  } finally { await browser.close(); }
}
(async () => { await fs.mkdir(output, { recursive: true }); await check('chromium', chromium); await check('webkit', webkit); await fs.writeFile(`${output}/full-canvas-results.json`, JSON.stringify(results, null, 2)); })().catch(error => { console.error(error); process.exitCode = 1; });
