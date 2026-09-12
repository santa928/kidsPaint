/** Real Canvas visual review; run in the existing Docker Playwright image. */
const { chromium, webkit } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const output = process.env.OUTPUT_DIR || 'output/full-canvas';

(async () => {
  await fs.mkdir(output, { recursive: true });
  const results = [];
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1040, height: 1250 }, deviceScaleFactor: 1 });
      await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/kidsPaint/');
      const result = await page.evaluate(async () => {
        const { drawStampV2 } = await import('/kidsPaint/src/drawing/stamps-v2.ts');
        const { renderOperation } = await import('/kidsPaint/src/drawing/renderer.ts');
        const ids = ['circle', 'cross', 'square', 'triangle', 'rabbit', 'bird', 'train'];
        const colors = ['#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#800080', '#FF69B4', '#000000', '#FFFFFF'];
        const modes = [...colors.map(color => ({ color, rainbow: false })), { color: '#FFFFFF', rainbow: true }];
        const measurements = [];
        for (const stampId of ids) for (const size of [80, 112, 156]) for (const mode of modes) {
          const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 160;
          const ctx = canvas.getContext('2d');
          drawStampV2(ctx, stampId, 80, 80, size, mode.color, mode.rainbow);
          const before = ctx.getImageData(0, 0, 160, 160).data;
          let left = 160, top = 160, right = -1, bottom = -1, pixels = 0, primaryPixels = 0;
          const rgb = [1, 3, 5].map(index => parseInt(mode.color.slice(index, index + 2), 16));
          for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
            const index = (y * 160 + x) * 4;
            if (before[index + 3]) {
              left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); pixels++;
              if (rgb.every((channel, offset) => channel === before[index + offset]) && before[index + 3] === 255) primaryPixels++;
            }
          }
          ctx.clearRect(0, 0, 160, 160);
          drawStampV2(ctx, stampId, 80, 80, size, mode.color, mode.rainbow);
          const after = ctx.getImageData(0, 0, 160, 160).data;
          measurements.push({ stampId, size, ...mode, bounds: [left, top, right + 1, bottom + 1], pixels, primaryPixels,
            inside: left >= 80 - size / 2 && top >= 80 - size / 2 && right + 1 <= 80 + size / 2 && bottom + 1 <= 80 + size / 2,
            deterministic: before.every((value, index) => value === after[index]) });
        }
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;background:#f5f0e5';
        const canvas = document.createElement('canvas'); canvas.width = 1040; canvas.height = 1190;
        canvas.id = 'stamp-sheet'; document.body.append(canvas);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f5f0e5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#543d35'; ctx.font = 'bold 26px sans-serif'; ctx.fillText('Picture-book stamps / V2', 28, 38);
        ctx.font = '15px sans-serif'; ctx.fillText('Solid silhouettes, warm contours, selectable body colors', 28, 67);
        ctx.textAlign = 'center';
        ids.forEach((id, index) => ctx.fillText(id, 105 + index * 142, 101));
        const rows = [modes[0], modes[2], modes[4], modes[6], modes[8], modes[7], modes[9]];
        rows.forEach((mode, row) => {
          const y = 184 + row * 140;
          ids.forEach((id, column) => {
            const x = 105 + column * 142;
            ctx.fillStyle = '#fffdf7'; ctx.beginPath(); ctx.roundRect(x - 66, y - 66, 132, 132, 15); ctx.fill();
            drawStampV2(ctx, id, x, y, 110, mode.color, mode.rainbow);
          });
        });
        ctx.fillStyle = '#543d35'; ctx.textAlign = 'left'; ctx.font = '14px sans-serif';
        ctx.fillText('Small stamps at native 52 px', 28, 1122);
        ids.forEach((id, index) => drawStampV2(ctx, id, 105 + index * 142, 1161, 52, '#008000', false));
        const compare = document.createElement('canvas'); compare.width = 1040; compare.height = 440;
        compare.id = 'stamp-before-after'; document.body.append(compare);
        const comparison = compare.getContext('2d'); comparison.fillStyle = '#fffdf7'; comparison.fillRect(0, 0, 1040, 440);
        comparison.fillStyle = '#543d35'; comparison.font = 'bold 22px sans-serif'; comparison.fillText('Original / redesigned', 28, 36);
        comparison.font = '14px sans-serif'; comparison.fillText('Original', 28, 70); comparison.fillText('V2', 28, 268);
        ids.forEach((id, index) => {
          const x = 105 + index * 142;
          renderOperation(comparison, { kind: 'stamp', stampId: id, x, y: 170, size: 110, color: '#FF0000', rainbow: false });
          drawStampV2(comparison, id, x, 349, 110, '#FF0000', false);
        });
        // The renderer must preserve the surrounding canvas state, including transforms.
        const stateCanvas = document.createElement('canvas'), state = stateCanvas.getContext('2d');
        state.translate(3, 5); state.scale(1.5, 2); state.fillStyle = '#123456'; state.strokeStyle = '#abcdef';
        state.lineWidth = 11; state.globalCompositeOperation = 'multiply';
        const snapshot = () => ({ transform: state.getTransform().toString(), fill: state.fillStyle, stroke: state.strokeStyle, line: state.lineWidth, composite: state.globalCompositeOperation });
        const saved = snapshot(); drawStampV2(state, 'train', 30, 30, 52, '#000000', false);
        return { measurements, statePreserved: JSON.stringify(saved) === JSON.stringify(snapshot()) };
      });
      for (const test of result.measurements) {
        assert(test.inside, `${engine}: ${JSON.stringify(test)} leaves the size square`);
        assert(test.deterministic, `${engine}: replay differs for ${test.stampId}`);
        assert(test.pixels > test.size * test.size * .18, `${engine}: ${test.stampId} is not a substantial silhouette`);
        if (!test.rainbow) assert(test.primaryPixels > test.pixels * .15, `${engine}: selected body color missing in ${test.stampId}`);
      }
      assert(result.statePreserved, `${engine}: caller state changed`);
      await page.locator('#stamp-sheet').screenshot({ path: `${output}/stamp-v2-contact-sheet-${engine}.png` });
      await page.locator('#stamp-before-after').screenshot({ path: `${output}/stamp-v2-before-after-${engine}.png` });
      await page.evaluate(async () => {
        const { drawStampV2 } = await import('/kidsPaint/src/drawing/stamps-v2.ts');
        const canvas = document.createElement('canvas'); canvas.width = 1040; canvas.height = 200; canvas.id = 'stamp-summary';
        canvas.style.cssText = 'position:fixed;top:0;left:0'; document.body.append(canvas);
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, 1040, 200);
        const ids = ['circle', 'cross', 'square', 'triangle', 'rabbit', 'bird', 'train'];
        const colors = ['#FF0000', '#008000', '#800080', '#FFA500', '#FF69B4', '#FFFF00', '#0000FF'];
        const labels = ['まる', 'ばつ', 'しかく', 'さんかく', 'うさぎ', 'とり', 'でんしゃ'];
        ctx.textAlign = 'center'; ctx.font = '18px sans-serif';
        ids.forEach((id, index) => { drawStampV2(ctx, id, 90 + index * 143, 84, 120, colors[index], false); ctx.fillStyle = '#584739'; ctx.fillText(labels[index], 90 + index * 143, 170); });
      });
      await page.locator('#stamp-summary').screenshot({ path: `${output}/stamp-v2-summary-${engine}.png` });
      results.push({ engine, ...result });
      console.log(`${engine}: ${result.measurements.length} real Canvas renders pass size, selected color, deterministic replay and state restoration checks`);
    } finally { await browser.close(); }
  }
  await fs.writeFile(`${output}/stamp-v2-render-results.json`, JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
