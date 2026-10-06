// appprobe.mjs — what solid in the real app is in the way at given points:
// the meshes whose bounds hold each point, and what a walker's ray from
// `from` towards `to` (data coordinates, Wembley's z without the 64) hits.
//   cd <repo> && PORT=5193 node <this> '[{"from":[x,y,z],"to":[x,z]}]'
import { chromium } from 'playwright';
import { createServer } from 'vite';
const Q = JSON.parse(process.argv[2]);
const port = +(process.env.PORT || 5193);
const server = await createServer({ server: { port }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto(`http://localhost:${port}/Song2Concert/`);
await page.waitForFunction(() => window.__stage?.stats().drawn > 0, null, { timeout: 300000 });
const out = await page.evaluate((Q) => {
  const W = window.__stage.debug.walker, root = W.root, ZC = 64;
  const res = [];
  const path = (o) => { const n = []; for (let p = o; p && p !== root; p = p.parent) n.push(p.name || p.type); return n.join('<'); };
  for (const q of Q) {
    const [x, y, z] = q.from; const P = { x, y: y + 1.0, z: z + ZC };
    const hits = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const m = 1.2;
      if (P.x > b.min.x - m && P.x < b.max.x + m && P.z > b.min.z - m && P.z < b.max.z + m && P.y > b.min.y - 1.5 && P.y < b.max.y + 0.5) {
        const sz = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +v.toFixed(1));
        if (sz[0] < 60 || sz[2] < 60) hits.push({ path: path(o), nc: o.userData.noCollide || false, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, min: [+b.min.x.toFixed(1), +b.min.y.toFixed(1), +(b.min.z - ZC).toFixed(1)], size: sz, color: o.material?.color?.getHexString?.() });
      }
    });
    // the ray a walker casts, at knee and chest height
    W.ensureIndex();
    const dx = q.to[0] - x, dz = q.to[1] - z, l = Math.hypot(dx, dz);
    const rays = [];
    for (const h of [0.3, 0.9, 1.55, 1.9]) {
      W.ray.origin.set(x, y + h, z + ZC); W.ray.direction.set(dx / l, 0, dz / l);
      const r = W.bvh.raycastFirst(W.ray, 2, 0, 3);
      rays.push(r ? { h, d: +r.distance.toFixed(2), p: [+r.point.x.toFixed(2), +r.point.y.toFixed(2), +(r.point.z - ZC).toFixed(2)], n: [+r.face.normal.x.toFixed(2), +r.face.normal.y.toFixed(2), +r.face.normal.z.toFixed(2)] } : { h, d: null });
    }
    res.push({ q, rays, ground: W.ground(x, z + ZC, y + 1.5), hits: hits.slice(0, 25) });
  }
  return res;
}, Q);
for (const r of out) console.log(JSON.stringify(r, null, 1));
await browser.close();
await server.close();
