// Flood the room on foot from a start point with the walker's own movement,
// then report how many seats of each level are within reach.
//   node reachtest.mjs <venue> <x,z> [step]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const [,, venue, start = '0,50', step = '1.0'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 200, height: 120 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const [pkg, ver] of [['three', '0.185.1'], ['three-mesh-bvh', '0.9.15']]) {
  await page.route(`https://cdn.jsdelivr.net/npm/${pkg}@${ver}/**`, (route) => {
    const rel = route.request().url().split(`${pkg}@${ver}/`)[1];
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(path.resolve('node_modules/' + pkg), rel)) });
  });
}
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto('file://' + path.resolve('out/test.html') + `?${venue}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
const out = await page.evaluate(([start, step]) => {
  const A = window.__app; A.paused = true;
  const W = A.walker, cam = A.pipe.camera;
  W.ensureIndex();
  const [sx, sz, sy = 3] = start.split(',').map(Number);
  const S = +step;
  const key = (x, z, y) => `${Math.round(x / S)},${Math.round(z / S)},${Math.round(y / 0.7)}`;
  const place = (x, y, z) => { W.feet.set(x, y, z); W.gy = y; W.grounded = true; W.seated = null; W.vy = 0; };
  const move = (x, y, z, tx, tz) => {
    place(x, y, z);
    for (let i = 0; i < 30; i++) {
      const dx = tx - W.feet.x, dz = tz - W.feet.z, d = Math.hypot(dx, dz);
      if (d < 0.08) break;
      W.yaw = Math.atan2(dx, -dz); W.held.add('w');
      const bx = W.feet.x, bz = W.feet.z;
      W.update(Math.min(1 / 30, d / 3.2 + 0.001), cam);
      if (Math.hypot(W.feet.x - bx, W.feet.z - bz) < 1e-4) break;
    }
    W.held.clear();
    for (let i = 0; i < 20; i++) W.update(1 / 30, cam);
    return Math.hypot(tx - W.feet.x, tz - W.feet.z) < 0.35 ? [W.feet.x, W.feet.y, W.feet.z] : null;
  };
  const g0 = W.ground(sx, sz, sy);
  const seen = new Map();
  const q = [[sx, g0, sz]];
  seen.set(key(sx, sz, g0), [sx, g0, sz, -1]);
  const order = [key(sx, sz, g0)];
  const t0 = performance.now();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length && performance.now() - t0 < 1500000) {
    const [x, y, z] = q.shift();
    for (const [dx, dz] of dirs) {
      const tx = Math.round(x / S) * S + dx * S, tz = Math.round(z / S) * S + dz * S;
      const r = move(x, y, z, tx, tz);
      if (r === null) continue;
      const [ax, ny, az] = r;
      const k = key(tx, tz, ny);
      if (seen.has(k)) continue;
      seen.set(k, [ax, ny, az, 0, key(x, z, y)]); order.push(k); q.push([ax, ny, az]);
    }
  }
  const nodes = [...seen.entries()];
  const idx = new Map(nodes.map(([k], i) => [k, i]));
  return { n: nodes.length, ms: Math.round(performance.now() - t0), left: q.length, nodes: nodes.map(([k, p]) => [+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(2), p[4] !== undefined ? idx.get(p[4]) : -1]) };
}, [start, step]);
console.log(venue, 'reached', out.n, 'nodes in', out.ms, 'ms; queue left', out.left);
fs.writeFileSync(`reach-${venue}.json`, JSON.stringify(out.nodes));
await browser.close();
