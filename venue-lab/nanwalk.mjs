// nanwalk.mjs — walk and look round with the real keys and mouse while the app
// runs, and after every frame look for Inf, NaN or negative values in the
// scene render, the volumetrics and what goes into the final pass (scene +
// volumetrics + bloom): any of them is a black block once the bloom has it.
//   node nanwalk.mjs <venue> [q=high] [start x,z]
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, quality = 'high', start = ''] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}&q=${quality}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
await page.evaluate((start) => {
  const A = window.__app, P = A.pipe, R = P.renderer;
  if (start) { const [x, z] = start.split(',').map(Number); A.walker.feet.x = x; A.walker.feet.z = z; }
  const log = window.__nan = { frames: 0, hits: [] };
  const f16 = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 31 ? (m ? NaN : s * Infinity) : s * (e ? (1 + m / 1024) * 2 ** (e - 15) : m / 1024 * 2 ** -14); };
  const bad = (h) => (h & 0x7c00) === 0x7c00 || ((h & 0x8000) && (h & 0x7fff) > 0x1400);
  const scan = (rt, probe) => {
    const b = new Uint16Array(rt.width * rt.height * 4);
    R.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, b);
    let n = 0, first = null;
    for (let i = 0; i < b.length; i += 4) {
      if (bad(b[i]) || bad(b[i + 1]) || bad(b[i + 2])) {
        n++;
        if (!first) {
          const p = i / 4, x = p % rt.width, y = Math.floor(p / rt.width);
          first = { x, y, val: [f16(b[i]), f16(b[i + 1]), f16(b[i + 2])].map((v) => +v.toPrecision(4)) };
          if (probe) {
            const o = P.camera.position.clone();
            const d = o.clone().set((x + 0.5) / rt.width * 2 - 1, (y + 0.5) / rt.height * 2 - 1, 0.5).unproject(P.camera).sub(o).normalize();
            first.hit = window.__rayHits(A.venue.root, o.toArray(), d.toArray()).slice(0, 2);
          }
        }
      }
    }
    return n ? { n, first } : null;
  };
  const render = P.render.bind(P);
  P.render = (t) => {
    render(t);
    log.frames++;
    const s = scan(P.venuePass.sceneRT, true), v = scan(P.venuePass.volRT), c = scan(P.composer.readBuffer);
    if (s || v || c) log.hits.push({ f: log.frames, cam: P.camera.position.toArray().map((q) => +q.toFixed(4)), quat: P.camera.quaternion.toArray().map((q) => +q.toFixed(6)), s, v, c });
  };
}, start);
await page.evaluate(() => document.querySelectorAll('.top,.rail,.hint').forEach((e) => { e.style.display = 'none'; }));
await page.mouse.move(480, 270);
const plan = [['w', 1500], ['drag', 200], ['w', 1500], ['drag', -300], ['d', 800], ['w', 2000], ['drag', 400], ['s', 800], ['drag', -200], ['w', 2500], ['drag', 250], ['a', 1000], ['drag', -400], ['w', 3000], ['drag', 180], ['w', 3000]];
for (const [k, v] of plan) {
  if (k === 'drag') {
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(480 + (v * i) / 10, 270 + (i % 2 ? 30 : -30)); await page.waitForTimeout(50); }
    await page.mouse.up(); await page.mouse.move(480, 270);
  } else {
    await page.keyboard.down(k); await page.waitForTimeout(v); await page.keyboard.up(k);
  }
}
const r = await page.evaluate(() => ({ frames: window.__nan.frames, hits: window.__nan.hits.length, first: window.__nan.hits.slice(0, 6), at: window.__info().walk }));
console.log(venue, JSON.stringify(r));
await browser.close();
