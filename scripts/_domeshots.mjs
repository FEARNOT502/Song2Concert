// debug: render the dome from set camera poses (no walker), to look at the
// stands' geometry. node scripts/_domeshots.mjs <outdir> <views.json> [venue] [effects]
// views.json: [{ "name": "a01", "pos": [x, y, z], "at": [x, y, z], "fov": 60 }, ...]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const [outDir, viewsFile, venue = 'dome', effects = 'off'] = process.argv.slice(2);
const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5173/Song2Concert/');
await page.waitForFunction(() => window.__stage && document.querySelector('.s2c-load.is-done'), null, { timeout: 180000 });
await page.evaluate((fx) => window.__stage.setEffects(fx === 'on'), effects);
await page.evaluate((v) => window.__stage.setVenue(v, 'general'), venue);
await page.waitForTimeout(500);
await page.waitForFunction((v) => window.__stage.stats().venue === v && document.querySelector('.s2c-load.is-done'), venue, { timeout: 300000 });
await page.evaluate(() => {
  document.querySelectorAll('header, footer, aside, .s2c-load').forEach((e) => { e.style.visibility = 'hidden'; });
  const w = window.__stage.debug.walker;
  w.update = (dt, cam) => { const p = window.__pose; if (!p) return; cam.position.set(...p.pos); cam.lookAt(...p.at); if (p.fov && cam.fov !== p.fov) { cam.fov = p.fov; cam.updateProjectionMatrix(); } };
});
for (const v of views) {
  await page.evaluate((p) => { window.__pose = p; }, v);
  await page.waitForTimeout(1800);
  const canvas = await page.$('canvas');
  await canvas.screenshot({ path: path.join(outDir, `${v.name}.png`) });
  console.log('shot', v.name);
}
await browser.close();
