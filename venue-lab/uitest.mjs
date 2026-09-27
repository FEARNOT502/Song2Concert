// click the Inspire tab and the 100s toggle in the prototype; screenshot with the UI
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
for (const [pkg, ver] of [['three', '0.185.1'], ['three-mesh-bvh', '0.9.15']]) {
  await p.route(`https://cdn.jsdelivr.net/npm/${pkg}@${ver}/**`, (route) => {
    const rel = route.request().url().split(`${pkg}@${ver}/`)[1];
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(path.resolve('node_modules/' + pkg), rel)) });
  });
}
await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await p.goto('file://' + path.resolve('out/test.html'));
await p.waitForFunction('window.__ready === true', null, { timeout: 300000 });
await p.click('#tab-inspire');
await p.waitForFunction("window.__info().venue === 'inspire' && !window.__app.building", null, { timeout: 300000 }).catch(() => {});
await p.waitForTimeout(3000);
console.log('retract row visible', await p.isVisible('#retract-row'));
await p.screenshot({ path: 'shots/r9/ui-inspire-out.png' });
await p.click('#seg-retract button[data-v="in"]');
await p.waitForTimeout(1500);
await p.waitForFunction('!window.__app.building', null, { timeout: 300000 }).catch(() => {});
await p.waitForTimeout(3000);
console.log('pressed', await p.getAttribute('#seg-retract button[data-v="in"]', 'aria-pressed'), 'retract', await p.evaluate('window.__app.retract'));
await p.screenshot({ path: 'shots/r9/ui-inspire-in.png' });
console.log('errors', errs.length ? errs : 'none');
await b.close();
