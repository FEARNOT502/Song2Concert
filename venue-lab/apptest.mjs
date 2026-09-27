// apptest.mjs — drive the real app (vite dev server) in headless Chromium.
//   cd <repo> && node <this> <outdir> [steps json]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
const OUT = process.argv[2];
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text().slice(0, 300)); });
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto('http://localhost:5198/Song2Concert/');
const settle = async (ms = 25000) => {
  const t0 = Date.now();
  await page.waitForFunction(() => window.__stage?.stats().drawn > 0, null, { timeout: 300000 });
  const d0 = await page.evaluate(() => window.__stage.stats().drawn);
  await page.waitForFunction((d) => window.__stage.stats().drawn > d + 3, d0, { timeout: ms * 10 }).catch(() => {});
  return Date.now() - t0;
};
const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 240000 }); };
const stats = () => page.evaluate(() => window.__stage.stats());
console.log('first', await settle(), JSON.stringify(await stats()));
await shot('app-stadium-idle');
const steps = JSON.parse(process.argv[3] || '[]');
for (const s of steps) {
  if (s.venue) {
    await page.keyboard.press('v');
    await page.getByRole('button', { name: new RegExp('^' + s.venue) }).first().click();
    await page.waitForTimeout(500);
    await page.waitForFunction((id) => window.__stage.stats().venue === id, s.id).catch(() => {});
    // wait for the new room to be built and drawn
    const d0 = await page.evaluate(() => window.__stage.stats().drawn);
    await page.waitForFunction((d) => window.__stage.stats().drawn > d + 4, d0, { timeout: 300000 }).catch(() => {});
  }
  if (s.upload) {
    await page.keyboard.press('f');
    await page.setInputFiles('input[type=file]', s.upload);
    await page.waitForTimeout(s.wait || 8000);
  }
  if (s.click) { await page.getByRole('button', { name: s.click }).first().click(); await page.waitForTimeout(800); }
  if (s.keys) {
    await page.mouse.click(700, 400);
    for (const [k, ms] of s.keys) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); }
    await page.waitForTimeout(600);
  }
  if (s.drag) { await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(700 + s.drag[0], 400 + s.drag[1], { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(600); }
  if (s.wait && !s.upload) await page.waitForTimeout(s.wait);
  console.log(JSON.stringify(s), JSON.stringify(await stats()));
  if (s.shot) await shot(s.shot);
}
console.log('errors', errors.length ? errors : 'none');
await browser.close();
await server.close();
