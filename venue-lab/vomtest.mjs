// vomtest.mjs — walk through each vomitory of a venue, stand side to concourse
// and back, and report which let the walker through.
//   node vomtest.mjs <venue> <data module> <offsetZ> [level]
//   e.g. node vomtest.mjs stadium ../src/three/venues/wb-data.js 64
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, dataFile, offZ = '0', only = ''] = process.argv;
const mod = await import(new URL(dataFile, import.meta.url));
const DATA = Object.values(mod)[0];
const slim = { levels: DATA.levels.map((l) => ({ name: l.name, voms: l.voms })) };
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 200, height: 120 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
const out = await page.evaluate(([D, oz, only]) => {
  const A = window.__app; A.paused = true;
  const W = A.walker, cam = A.pipe.camera;
  W.ensureIndex();
  const place = (x, y, z) => { W.feet.set(x, y, z); W.gy = y; W.grounded = true; W.seated = null; W.vy = 0; };
  const walk = (tx, tz, n = 400) => {
    for (let i = 0; i < n; i++) {
      const dx = tx - W.feet.x, dz = tz - W.feet.z, d = Math.hypot(dx, dz);
      if (d < 0.15) break;
      W.yaw = Math.atan2(dx, -dz); W.held.add('w');
      W.update(1 / 30, cam);
    }
    W.held.clear(); for (let i = 0; i < 10; i++) W.update(1 / 30, cam);
    return Math.hypot(tx - W.feet.x, tz - W.feet.z);
  };
  const res = [];
  for (const L of D.levels) {
    if (only && L.name !== only) continue;
    for (const v of L.voms || []) {
      const [px, pz] = v.p, [ux, uz] = v.u;
      // the stand side: 2 m back from the mouth; the concourse side: past its far end
      const sx = px - ux * 2.0, sz = pz - uz * 2.0 + oz, ex = px + ux * (v.L + 2.5), ez = pz + uz * (v.L + 2.5) + oz;
      const gs = W.ground(sx, sz, v.y + 6);
      if (gs === null) { res.push([L.name, v.label, 'no ground at stand side']); continue; }
      place(sx, gs, sz);
      const d1 = walk(ex, ez);
      const f1 = [W.feet.x, W.feet.y, W.feet.z].map((a) => +a.toFixed(1));
      res.push([L.name, v.label, d1 < 0.5 ? 'out ok' : `out stuck ${d1.toFixed(1)} at ${f1}`, 'from y', +gs.toFixed(2), 'conc', v.y]);
    }
  }
  return res;
}, [slim, +offZ, only]);
for (const r of out) console.log(r.join(' '));
await browser.close();
