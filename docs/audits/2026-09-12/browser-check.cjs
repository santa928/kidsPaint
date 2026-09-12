/** Runs disposable browser checks against the unmodified local app; writes audit evidence only. */
const { chromium, webkit } = require('/app/node_modules/playwright');
const fs = require('node:fs/promises');
const launchedBrowsers = [];
const output = '/evidence';
const url = 'http://127.0.0.1:5173/kidsPaint/';

/** Counts visible canvas pixels and measures their bounds without changing the drawing. */
async function pixels(page) {
  return page.locator('canvas').evaluate((canvas) => {
    const { width, height } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let count = 0, left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        count++; left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { count, bounds: count ? [left, top, right - left + 1, bottom - top + 1] : null,
      bitmap: [width, height], dpr: devicePixelRatio };
  });
}

/** Draws a continuous stroke using browser pointer input. */
async function stroke(page, from, to) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 12 });
  await page.mouse.up();
}

/** Tests undo, tools, clearing, rotation, reload, and (Chromium only) overlapping touches. */
async function check(engine, browserType) {
  const browser = await browserType.launch({ headless: true });
  launchedBrowsers.push(browser);
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const result = { engine, errors: [] };
  page.on('pageerror', error => result.errors.push(error.message));
  await page.goto(url);
  console.log(`${engine}: ${await page.title()}`);
  await page.getByRole('button', { name: '赤', exact: true }).click();
  await stroke(page, [140, 320], [430, 450]);
  result.firstStroke = await pixels(page);
  await page.mouse.click(660, 320);
  result.twoMarks = await pixels(page);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  result.afterUndo = await pixels(page);
  await page.screenshot({ path: `${output}/${engine}-undo.png` });

  await page.getByRole('button', { name: 'けしゴム', exact: true }).click();
  await page.getByRole('button', { name: 'おえかきモード', exact: true }).click();
  result.activeTools = await page.locator('button.active').allTextContents();
  await stroke(page, [130, 320], [220, 355]);
  result.afterPencilOverStroke = await pixels(page);

  const clearBox = await page.getByRole('button', { name: 'ぜんぶけす', exact: true }).boundingBox();
  await page.mouse.move(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800); // Deliberately exceed the product's 600 ms hold threshold.
  await page.mouse.up();
  result.afterClear = { ...await pixels(page), undoEnabled: await page.getByRole('button', { name: 'もどす', exact: true }).isEnabled() };
  await page.screenshot({ path: `${output}/${engine}-clear.png` });

  await page.getByRole('button', { name: '赤', exact: true }).click();
  await page.getByRole('button', { name: 'スタンプ', exact: true }).click();
  await page.getByRole('button', { name: 'まる', exact: true }).click();
  await page.mouse.click(650, 320);
  result.circleBeforeRotate = await pixels(page);
  await page.screenshot({ path: `${output}/${engine}-before-rotation.png` });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 768);
  result.circleAfterRotate = await pixels(page);
  await page.screenshot({ path: `${output}/${engine}-after-rotation.png` });
  await page.reload();
  await page.getByRole('button', { name: 'スタンプ', exact: true }).waitFor();
  result.afterReload = await pixels(page);

  if (engine === 'chromium') {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await page.getByRole('button', { name: '赤', exact: true }).click();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 250, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 250, id: 1 }, { x: 600, y: 550, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 240, y: 250, id: 1 }, { x: 600, y: 550, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    result.multiTouch = await pixels(page);
    result.multiTouchCenterAlpha = await page.locator('canvas').evaluate(c => {
      const r = c.getBoundingClientRect();
      return c.getContext('2d').getImageData(420, Math.round(400 - r.y), 1, 1).data[3];
    });
    await page.screenshot({ path: `${output}/${engine}-multi-touch.png` });
    await cdp.detach();
  }
  await browser.close();
  return result;
}

(async () => {
  const results = [];
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    try { results.push(await check(engine, browserType)); }
    catch (error) { results.push({ engine, blocker: error.message }); }
  }
  await fs.writeFile(`${output}/browser-check-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await Promise.allSettled(launchedBrowsers.map(browser => browser.close()));
})();
