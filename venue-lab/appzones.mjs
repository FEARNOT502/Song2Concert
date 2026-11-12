// appzones.mjs — the real app's lightstick blocks at Wembley (or another room
// whose root keeps userData.standsPeople): every sitter's level, block (the
// lightsticks' control), x and z, written as JSON for a plan of them.
//   cd <repo> && node venue-lab/appzones.mjs <out.json> [venue] [mode]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
const [OUT, VENUE = 'stadium', MODE = 'general'] = process.argv.slice(2);
const server = await createServer({ server: { port: 5197, open: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.setDefaultTimeout(300000);
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto('http://localhost:5197/Song2Concert/');
await page.waitForFunction(() => window.__stage?.stats().drawn > 0, null, { timeout: 300000 });
await page.evaluate(([v, m]) => window.__stage.setVenue(v, m), [VENUE, MODE]);
await page.waitForFunction((v) => window.__stage.stats().venue === v, VENUE);
await page.waitForFunction(() => { let f = false; window.__stage.debug.pipe.scene.traverse((o) => { if (o.userData?.standsPeople) f = true; }); return f; });
const data = await page.evaluate(() => {
  let ps = null; window.__stage.debug.pipe.scene.traverse((o) => { if (o.userData?.standsPeople) ps = o.userData.standsPeople; });
  return ps.filter((p) => p.zone).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, p.zone.lv, p.zone.block]);
});
fs.writeFileSync(OUT, JSON.stringify(data));
console.log('sitters', data.length);
await browser.close();
await server.close();
