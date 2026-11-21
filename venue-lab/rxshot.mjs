// rxshot.mjs — the Lab served over http (so the GLBs load), several views of
// one venue in one load.
// usage: node rxshot.mjs <venue> <outdir> '<views json>' [w=1600] [h=900]
//   views: [{ "name": "a", "q": "layout=op&house=0&cam=x,y,z,tx,ty,tz&settle=24&rx=1" }, ...]
//   q goes to window.__set; `settle` draws that many frames of the same moment
//   (the temporal passes converge); `page` (in the first view) is the page's
//   own query, e.g. "rx=0" for the app's pipeline.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, routeCdn } from './browser.mjs';

const [,, venue, outDir, viewsArg = '[{"name":"v","q":""}]', W = '1600', H = '900'] = process.argv;
const views = JSON.parse(viewsArg);
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(process.env.OUT || 'out');
const types = { '.html': 'text/html', '.glb': 'model/gltf-binary', '.gi': 'application/octet-stream', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await launch(['--enable-unsafe-webgpu']);
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('GL Driver') && (m.type() !== 'warning' || /WebGL|INVALID/.test(t))) console.log('[console]', m.type(), t.slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')));
await routeCdn(page);
const t0 = Date.now();
const pq = views[0].page ? `&${views[0].page}` : '';
await page.goto(`http://127.0.0.1:${port}/test.html?${venue}${pq}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 600000 });
console.log('ready', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const v of views) {
  const t1 = Date.now();
  const opts = { t: 33, frames: 3, pause: 1, noui: 1, ...Object.fromEntries(new URLSearchParams(v.q || '')) };
  const info = await page.evaluate(`window.__set(${JSON.stringify(opts)})`).catch((e) => String(e));
  if (opts.settle) await page.evaluate(`window.__settle?.(${+opts.settle})`).catch((e) => console.log('settle', String(e)));
  if (process.env.EVAL) console.log('EVAL', JSON.stringify(await page.evaluate(process.env.EVAL).catch((e) => String(e))));
  await page.screenshot({ path: path.join(outDir, `${v.name}.png`), timeout: 600000 });
  console.log(v.name, ((Date.now() - t1) / 1000).toFixed(1), 's', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 300));
}
await browser.close();
server.close();
