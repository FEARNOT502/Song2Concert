// apppick.mjs — the real app's venue picker on a room with named seats: the
// plan, a block chosen on it, a row and seat, and in.
//   cd <repo> && node venue-lab/apppick.mjs <outdir> <venue> <block> [row] [seat] [tab]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
const [OUT, VENUE = 'stadium', BLOCK = '524', ROW, SEAT, TAB] = process.argv.slice(2);
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto('http://localhost:5198/Song2Concert/');
await page.waitForFunction(() => window.__stage?.stats().drawn > 0, null, { timeout: 300000 });
await page.screenshot({ path: path.join(OUT, 'load.png'), timeout: 240000 });
console.log('buttons', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 30))));
await page.locator('button', { hasText: 'Venue' }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, 'open.png') });
// the room
const names = { stadium: 'Stadium', dome: 'Dome' };
await page.locator('[role="option"]', { hasText: names[VENUE] ?? VENUE }).first().click();
await page.waitForTimeout(1500);
if (TAB) { await page.locator('button', { hasText: TAB }).first().click(); await page.waitForTimeout(300); }
await page.screenshot({ path: path.join(OUT, 'picker.png') });
// the block, on the plan
await page.locator(`[data-block="${BLOCK}"]`).first().click({ force: true });
await page.waitForTimeout(500);
if (ROW) await page.selectOption('select[aria-label="Row"]', String(ROW));
if (SEAT) await page.selectOption('select[aria-label="Seat"]', String(SEAT));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'picked.png') });
const chosen = await page.evaluate(() => [...document.querySelectorAll('select')].map((s) => s.value));
console.log('selects', JSON.stringify(chosen));
await page.locator('button', { hasText: 'ENTER' }).first().click();
await page.waitForFunction((v) => window.__stage.stats().venue === v, VENUE, { timeout: 300000 });
const d0 = await page.evaluate(() => window.__stage.stats().drawn);
await page.waitForFunction((d) => window.__stage.stats().drawn > d + 5, d0, { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(8000);
console.log('stats', JSON.stringify(await page.evaluate(() => window.__stage.stats())));
await page.screenshot({ path: path.join(OUT, 'seat.png'), timeout: 240000 });
await browser.close();
await server.close();
