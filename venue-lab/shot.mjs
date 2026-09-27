// shot.mjs — render the prototype headless and screenshot each venue.
// usage: node shot.mjs <html> <outprefix> [venues=club,...] [w=1280] [h=720] [extra query]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const [,, html, outPrefix, venuesArg = 'club,theater,concerthall,arena,dome,stadium', W = '1280', H = '720', extra = ''] = process.argv;
const threeRoot = path.resolve('node_modules/three');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall')) console.log('[console]', m.type(), t.slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack||'').split('\n').slice(0,4).join(' | ')));
await page.route('https://cdn.jsdelivr.net/npm/three@0.185.1/**', (route) => {
  const rel = route.request().url().split('three@0.185.1/')[1];
  const file = path.join(threeRoot, rel);
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
  route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(file) });
});
await page.route('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.15/**', (route) => {
  const rel = route.request().url().split('three-mesh-bvh@0.9.15/')[1];
  route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(path.resolve('node_modules/three-mesh-bvh'), rel)) });
});
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const url = 'file://' + path.resolve(html);
for (const v of venuesArg.split(',')) {
  const t0 = Date.now();
  await page.goto("about:blank");
  await page.goto(`${url}?${v}#${v}`);
  try {
    await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
  } catch (e) { console.log('timeout waiting ready for', v); }
  const opts = Object.fromEntries(new URLSearchParams(extra));
  const info = await page.evaluate(`window.__set(${JSON.stringify({ t: 33, frames: 3, pause: 1, ...opts })})`).catch((e) => String(e));
  await page.screenshot({ path: `${outPrefix}-${v}.png`, timeout: 240000 });
  console.log(v, 'ms', Date.now() - t0, JSON.stringify(info));
}
await browser.close();
