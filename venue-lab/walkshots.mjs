// walkshots.mjs — walk and look round with the real keys and mouse while the
// app runs, capturing frames, and stitch them into a contact sheet.
//   node walkshots.mjs <venue> <out.png> [q=high]
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, out, quality = 'high'] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}&q=${quality}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelectorAll('.top,.rail,.hint').forEach((e) => { e.style.display = 'none'; }));
const frames = [];
const grab = async () => frames.push((await page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'));
await page.mouse.move(480, 270);
const plan = [['w', 900], ['drag', 160], ['w', 700], ['drag', -260], ['d', 600], ['w', 900], ['drag', 300], ['s', 500], ['drag', -120], ['w', 1200], ['drag', 200], ['a', 700]];
for (const [k, v] of plan) {
  if (k === 'drag') {
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(480 + (v * i) / 6, 270 + (i % 2 ? 8 : -8)); await page.waitForTimeout(40); if (i % 3 === 0) await grab(); }
    await page.mouse.up(); await page.mouse.move(480, 270);
  } else {
    await page.keyboard.down(k);
    for (let t = 0; t < v; t += 150) { await page.waitForTimeout(150); await grab(); }
    await page.keyboard.up(k);
  }
}
console.log('frames', frames.length, JSON.stringify(await page.evaluate(() => window.__info())));
// the sheet, drawn in the page
await page.setContent('<canvas id=c></canvas>');
const cols = 6, w = 320, h = 180;
await page.evaluate(async ({ frames, cols, w, h }) => {
  const c = document.getElementById('c'); const rows = Math.ceil(frames.length / cols);
  c.width = cols * w; c.height = rows * h; const g = c.getContext('2d');
  await Promise.all(frames.map((b, i) => new Promise((res) => { const im = new Image(); im.onload = () => { g.drawImage(im, (i % cols) * w, Math.floor(i / cols) * h, w, h); g.fillStyle = '#ff0'; g.fillText(String(i), (i % cols) * w + 4, Math.floor(i / cols) * h + 12); res(); }; im.src = 'data:image/jpeg;base64,' + b; })));
}, { frames, cols, w, h });
await page.setViewportSize({ width: cols * w, height: Math.ceil(frames.length / cols) * h });
await (await page.$('#c')).screenshot({ path: out });
await browser.close();
