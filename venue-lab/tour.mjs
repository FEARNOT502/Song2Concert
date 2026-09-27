// tour.mjs — several views of one venue in one load.
//   node tour.mjs <venue> <outdir> <views.json | inline json> [w=1280] [h=720]
// views: [{ "name": "east", "q": "house=1&cam=x,y,z,tx,ty,tz" }, …]
import fs from 'node:fs';
import path from 'node:path';
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, outDir, spec, W = '1280', H = '720'] = process.argv;
const views = JSON.parse(fs.existsSync(spec) ? fs.readFileSync(spec, 'utf8') : spec);
fs.mkdirSync(outDir, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') console.log('[console]', t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
for (const v of views) {
  const opts = { t: 33, frames: 3, pause: 1, noui: 1, ...Object.fromEntries(new URLSearchParams(v.q || '')) };
  await page.evaluate('window.__app.paused = false; window.__app.venue.root.traverse((o) => { if (o.userData.tourHidden) { o.visible = true; o.userData.tourHidden = false; } })');
  const info = await page.evaluate(`window.__set(${JSON.stringify(opts)})`);
  // "roof": 0 hides everything whose bottom is above that height (a plan view)
  if (v.roof !== undefined) {
    await page.evaluate(`(() => { const A = window.__app; A.venue.root.traverse((o) => { if (o.isMesh || o.isPoints) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (b.min.y > ${v.roof}) { o.visible = false; o.userData.tourHidden = true; } } }); A.frame(0.016, performance.now() / 1000); })()`);
  }
  if (v.js) await page.evaluate(`(() => { ${v.js}; window.__app.frame(0.016, performance.now() / 1000); })()`);
  await page.screenshot({ path: path.join(outDir, `${venue}-${v.name}.png`), timeout: 240000 });
  console.log(v.name, JSON.stringify(info));
}
await browser.close();
