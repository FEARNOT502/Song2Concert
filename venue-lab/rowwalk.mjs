// rowwalk.mjs — walk the real app's walker along a stand's rows, seat to
// seat, and report where it cannot get through.
//   cd <repo> && node <this> <level> <angle from> <angle to> [out.json]
// (Wembley; angles in degrees about the centre spot, atan2(z, x).)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
const [,, LV = 'L5', A0 = '30', A1 = '150', OUT = ''] = process.argv;
const { WB_STANDS } = await import('../src/three/venues/wb-data.js');
const L = WB_STANDS.levels.find((l) => l.name === LV);
const raw = Buffer.from(L.seats, 'base64');
const S = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
const rows = new Map();
for (let i = 0; i < S.length; i += 4) {
  const x = S[i] / L.seatScale, z = S[i + 1] / L.seatScale, r = S[i + 2];
  const a = Math.atan2(z, x) * 180 / Math.PI;
  if (a < +A0 || a > +A1) continue;
  if (!rows.has(r)) rows.set(r, []);
  rows.get(r).push([x, z, a]);
}
const edges = [];
for (const [r, P] of rows) {
  P.sort((p, q) => p[2] - q[2]);
  const y = L.hs[Math.min(r, L.hs.length - 1)];
  for (let i = 1; i < P.length; i++) {
    const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (d < 3.5) edges.push([r, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1], +P[i][2].toFixed(2), +d.toFixed(2)]);
  }
}
console.log(LV, 'rows', rows.size, 'steps', edges.length);
const server = await createServer({ server: { port: +(process.env.PORT || 5197) }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto(`http://localhost:${process.env.PORT || 5197}/Song2Concert/`);
await page.waitForFunction(() => window.__stage?.stats().drawn > 0, null, { timeout: 300000 });
const bad = await page.evaluate((edges) => {
  const W = window.__stage.debug.walker, cam = window.__stage.debug.pipe.camera, ZC = 64;
  W.ensureIndex();
  const place = (x, y, z) => { W.feet.set(x, y, z); W.gy = y; W.grounded = true; W.seated = null; W.vy = 0; };
  const move = (x, y, z, tx, tz) => {
    const g = W.ground(x, z, y + 0.5); place(x, g ?? y, z);
    for (let i = 0; i < 60; i++) {
      const dx = tx - W.feet.x, dz = tz - W.feet.z, d = Math.hypot(dx, dz);
      if (d < 0.08) break;
      W.yaw = Math.atan2(dx, -dz); W.held.add('w');
      const bx = W.feet.x, bz = W.feet.z;
      W.update(Math.min(1 / 30, d / 3.2 + 0.001), cam);
      if (Math.hypot(W.feet.x - bx, W.feet.z - bz) < 1e-4) break;
    }
    W.held.clear();
    return Math.hypot(tx - W.feet.x, tz - W.feet.z);
  };
  const out = [];
  for (const [r, y, x0, z0, x1, z1, a, d] of edges) {
    const miss = move(x0, y, z0 + ZC, x1, z1 + ZC);
    if (miss > 0.35) out.push({ r, a, d, miss: +miss.toFixed(2), from: [+x0.toFixed(2), +z0.toFixed(2)], to: [+x1.toFixed(2), +z1.toFixed(2)], at: [+W.feet.x.toFixed(2), +W.feet.y.toFixed(2), +(W.feet.z - ZC).toFixed(2)] });
  }
  return out;
}, edges);
console.log('blocked', bad.length);
for (const b of bad.slice(0, 80)) console.log(JSON.stringify(b));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(bad));
await browser.close();
await server.close();
