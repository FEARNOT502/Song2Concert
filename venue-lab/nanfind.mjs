// nanfind.mjs — from a pose where the scene render has NaN in it, hide the
// venue's objects one at a time and report which one the NaN comes from.
//   node nanfind.mjs <venue> <x,y,z> <qx,qy,qz,qw> [t]
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, pos, quat, t = '30'] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
const r = await page.evaluate(([pos, quat, t]) => {
  const A = window.__app, P = A.pipe, R = P.renderer; A.paused = true;
  const cam = P.camera;
  const setPose = () => { cam.position.set(...pos.split(',').map(Number)); cam.quaternion.set(...quat.split(',').map(Number)); cam.updateMatrixWorld(); };
  A.applyCamera = setPose;
  const count = () => {
    A.beat.clock = +t; A.frame(0.016, +t); setPose(); P.render(+t);
    const rt = P.venuePass.sceneRT, b = new Uint16Array(rt.width * rt.height * 4);
    R.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, b);
    let n = 0; for (let i = 0; i < b.length; i += 4) if ((b[i] & 0x7c00) === 0x7c00 && (b[i] & 0x3ff)) n++;
    return n;
  };
  const base = count();
  const out = { base, culprits: [] };
  const all = [];
  P.scene.traverse((o) => { if ((o.isMesh || o.isPoints) && o.visible) all.push(o); });
  for (const o of all) {
    o.visible = false;
    const n = count();
    o.visible = true;
    if (n < base) {
      const g = o.geometry; g.computeBoundingBox();
      const N = g.attributes.normal?.array, Pp = g.attributes.position.array;
      let zeroN = 0, nanN = 0, nanP = 0, degen = 0;
      if (N) for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]); if (!(l === l)) nanN++; else if (l < 1e-6) zeroN++; }
      for (let i = 0; i < Pp.length; i++) if (!(Pp[i] === Pp[i])) nanP++;
      const m = o.material;
      const tris = [];
      if (N) for (let i = 0; i < N.length; i += 9) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]); if (l < 1e-6) tris.push([0, 1, 2].map((k) => [Pp[i + k * 3], Pp[i + k * 3 + 1], Pp[i + k * 3 + 2]].map((v) => +v.toFixed(4)))); }
      // and, with those triangles taken out, does the NaN go?
      const keep = []; for (let i = 0; i < N.length; i += 9) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]); if (l >= 1e-6) keep.push(i / 9); }
      const g2 = g.clone(); for (const k of Object.keys(g2.attributes)) { const a = g2.attributes[k], sz = a.itemSize, src = a.array, dst = new src.constructor(keep.length * 3 * sz); keep.forEach((t, j) => dst.set(src.subarray(t * 3 * sz, t * 3 * sz + 3 * sz), j * 3 * sz)); g2.setAttribute(k, new a.constructor(dst, sz)); }
      const g0 = o.geometry; o.geometry = g2; const nAfter = count(); o.geometry = g0;
      out.culprits.push({ tris: tris.slice(0, 6), nAfter, type: o.type, verts: g.attributes.position.count, indexed: !!g.index, attrs: Object.keys(g.attributes), n, zeroN, nanN, nanP,
        bbox: [g.boundingBox.min.toArray().map((v) => +v.toFixed(1)), g.boundingBox.max.toArray().map((v) => +v.toFixed(1))],
        mat: { type: m.type, color: m.color?.getHexString(), map: !!m.map, normalMap: !!m.normalMap, rough: m.roughness, metal: m.metalness, side: m.side, emissive: m.emissive?.getHexString() } });
    }
  }
  return out;
}, [pos, quat, t]);
console.log(JSON.stringify(r));
await browser.close();
