// appcam.mjs — the real app (vite dev server) seen from given eyes.
//   cd <repo> && node <this> <outdir> '[{"name":..,"eye":[x,y,z],"target":[x,y,z]}]'
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
const OUT = process.argv[2];
const views = JSON.parse(process.argv[3] || '[]');
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto('http://localhost:5199/Song2Concert/');
await page.waitForFunction(() => window.__stage?.stats().drawn > 0, null, { timeout: 300000 });
const frames = async (n) => { const d0 = await page.evaluate(() => window.__stage.stats().drawn); await page.waitForFunction((d) => window.__stage.stats().drawn > d + n, d0, { timeout: 300000 }).catch(() => {}); };
await frames(3);
await page.screenshot({ path: path.join(OUT, 'idle.png'), timeout: 240000 });
for (const v of views) {
  await page.evaluate(({ eye, target }) => {
    const w = window.__stage.debug.walker, E = w.home.eye.clone();
    w.home = { eye: E.set(...eye), target: E.clone().set(...target) };
    w.reset();
  }, v);
  await page.waitForTimeout(v.wait || 15000); await frames(3);
  console.log(v.name, JSON.stringify(await page.evaluate(() => window.__stage.stats())));
  await page.screenshot({ path: path.join(OUT, v.name + '.png'), timeout: 240000 });
}
await browser.close();
await server.close();
