// mainshot.mjs — the app itself (its production build, dist/) headless: one
// venue's scene with the app's own UI over it.
// usage: node mainshot.mjs <out.png> [venue] [w] [h]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.mjs';
const [,, out, venue = '', W = '1440', H = '810'] = process.argv;
const root = path.resolve('../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/Song2Concert/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const b = await launch(['--enable-unsafe-webgpu']);
const page = await b.newPage({ viewport: { width: +W, height: +H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:${server.address().port}/Song2Concert/?debug`);
await page.waitForFunction('window.__stage && window.__stage.stats().venue && window.__stage.debug.venue', null, { timeout: 1800000 });
if (venue) await page.evaluate(`window.__stage.setVenue(${JSON.stringify(venue)})`);
await page.waitForFunction(`window.__stage.stats().venue === ${JSON.stringify(venue || 'stadium')} && !!window.__stage.debug.venue`, null, { timeout: 1800000 });
const d0 = await page.evaluate('window.__stage.stats().drawn');
await page.waitForFunction(`window.__stage.stats().drawn > ${d0 + 12}`, null, { timeout: 1800000 });
console.log(JSON.stringify(await page.evaluate('({ stats: window.__stage.stats(), rx: window.__stage.debug.pipe.rx?.info() })')));
await page.screenshot({ path: out, timeout: 900000 });
await b.close(); server.close();
