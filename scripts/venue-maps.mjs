#!/usr/bin/env node
// venue-maps.mjs — the venue picker's seat maps, drawn from the rooms themselves.
//
// Each venue is built in the running dev app (npm run dev) with the scene
// effects off (no crowd), and the room is read back from the scene graph: the
// floors and treads (faces that look up, below the roof) shaded by height, every
// seat as a dot in its own colour, and the stage in the app's accent. The
// result is turned so the stage is at the top, as seating charts are drawn, and
// written to public/venue-maps/<id>.webp. Run it again when a room changes.
//
//   node scripts/venue-maps.mjs [http://localhost:5173/Song2Concert/]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:5173/Song2Concert/';
const OUT = path.resolve('public/venue-maps');
const VENUES = (process.env.ONLY ? process.env.ONLY.split(',') : ['club', 'theater', 'concerthall', 'arena', 'dome', 'stadium']);
// the plan is cut here (metres): the roof, the ceiling and what hangs from them
// are above it
const CUT = { club: 2.6, theater: 24, concerthall: 12, arena: 28, dome: 33, stadium: 40 };
// rooms whose floor is a standing floor, up to this height: it is tinted as an
// audience area where it lies inside the seats (the pitch's cover is 1.5 m up)
const STANDING = { club: 0.3, stadium: 2 };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL);
await page.waitForFunction(() => window.__stage && document.querySelector('.s2c-load.is-done'), null, { timeout: 120000 });
await page.evaluate(() => window.__stage.setEffects(false));

for (const id of VENUES) {
  await page.evaluate((v) => window.__stage.setVenue(v), id);
  await page.waitForTimeout(300);
  await page.waitForFunction((v) => window.__stage.stats().venue === v && document.querySelector('.s2c-load.is-done'), id, { timeout: 120000 });
  const { url, note } = await page.evaluate(drawPlan, { cut: CUT[id], standing: STANDING[id] || 0 });
  if (process.env.DEBUG) console.log(note);
  const file = path.join(OUT, `${id}.webp`);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(id, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
await browser.close();

// ── in the page ────────────────────────────────────────────────────────────
function drawPlan({ cut, standing }) {
  const W = 960, H = 540, PAD = 0.06;
  const scene = window.__stage.debug.pipe.scene;
  scene.updateMatrixWorld(true);
  const V = scene.children[0].position.constructor;   // THREE.Vector3, without importing three
  const a = new V(), b = new V(), c = new V(), ab = new V(), ac = new V(), n = new V();

  const tris = [];       // [x0,z0,x1,z1,x2,z2, y, stage]
  const seats = [];      // [x, z, r, g, b]
  const skip = (o) => { for (let p = o; p; p = p.parent) { if (p.userData.plan === 'rig' || p.visible === false) return true; } return false; };
  const isStage = (o) => { for (let p = o; p; p = p.parent) if (p.userData.plan === 'stage') return true; return false; };

  scene.traverse((o) => {
    if (!o.isMesh || skip(o) || !o.geometry?.attributes?.position) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => m.transparent && m.opacity < 0.5)) return;   // glass
    const geo = o.geometry;
    if (o.isInstancedMesh) {
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (o.count < 20 || bb.max.y - bb.min.y > 1.6) return;   // seats and chairs, not fixtures or people
      const col = mats[0].color;
      const m = o.matrixWorld.clone(), mi = m.clone();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, mi);
        mi.premultiply(m);
        a.setFromMatrixPosition(mi);
        if (a.y > cut) continue;
        seats.push([a.x, a.z, col.r, col.g, col.b]);
      }
      return;
    }
    const pos = geo.attributes.position, idx = geo.index;
    const stage = isStage(o);
    const N = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < N; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      const y = (a.y + b.y + c.y) / 3;
      if (y > cut || y < -4) continue;   // the sky and the land round the building are not the plan
      n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const len = n.length();
      if (len < 1e-6) continue;
      // faces that look up (either winding: some are drawn double-sided)
      if (Math.abs(n.y) / len < 0.55) continue;
      tris.push([a.x, a.z, b.x, b.z, c.x, c.z, y, stage]);
    }
  });

  // the frame: the seats and the stage, so a car park or the outer wall does not
  // set the scale; a room with no seats (all standing) by its floor
  const xs = [], zs = [];
  const audience = seats.length >= 20
    ? seats.map((s) => [s[0], s[1]])
    : tris.filter((t) => !t[7] && t[6] < 0.3).map((t) => [(t[0] + t[2] + t[4]) / 3, (t[1] + t[3] + t[5]) / 3]);
  for (const [x, z] of audience) { xs.push(x); zs.push(z); }
  let sx = 0, sz = 0, sn = 0;
  for (const t of tris) if (t[7]) { for (const k of [0, 2, 4]) { xs.push(t[k]); zs.push(t[k + 1]); } sx += t[0]; sz += t[1]; sn++; }
  const mean = (v) => v.reduce((p, q) => p + q, 0) / Math.max(1, v.length);
  const seatC = [mean(audience.map((s) => s[0])), mean(audience.map((s) => s[1]))];
  const stageC = sn ? [sx / sn, sz / sn] : seatC;
  // turned so the stage is up (the audience's centre → the stage points to
  // -y), to the nearest quarter turn: the rooms are laid out on their axes
  const dx = stageC[0] - seatC[0], dz = stageC[1] - seatC[1];
  const ang = Math.hypot(dx, dz) > 2 ? Math.round(Math.atan2(dx, -dz) / (Math.PI / 2)) * (Math.PI / 2) : 0;
  const cs = Math.cos(-ang), sn2 = Math.sin(-ang);
  const rot = (x, z) => [x * cs - z * sn2, x * sn2 + z * cs];
  // a 1–99 % range, so a stray seat far off does not shrink the map
  const R = xs.map((x, i) => rot(x, zs[i]));
  const q = (v, f) => { const s = [...v].sort((p, r) => p - r); return s[Math.floor(f * (s.length - 1))]; };
  const rx = R.map((p) => p[0]), rz = R.map((p) => p[1]);
  let x0 = q(rx, 0.005), x1 = q(rx, 0.995), z0 = q(rz, 0.005), z1 = q(rz, 0.995);
  const mx = (x1 - x0) * PAD, mz = (z1 - z0) * PAD;
  x0 -= mx; x1 += mx; z0 -= mz; z1 += mz;
  const sc = Math.min(W / (x1 - x0), H / (z1 - z0));
  const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
  const P = (x, z) => { const [u, v] = rot(x, z); return [ox + (u - x0) * sc, oz + (v - z0) * sc]; };

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  // floors and treads, darker low and lighter high, in eight bands
  const ys = tris.filter((t) => !t[7]).map((t) => t[6]);
  const yLo = ys.length ? q(ys, 0.02) : 0, yHi = ys.length ? q(ys, 0.98) : 1;
  // a standing floor: under the standing height, and inside the ring of seats
  // where there are seats round it (by angle round their centre, the nearest seat)
  const BINS = 120, ring = new Float32Array(BINS).fill(Infinity);
  if (seats.length >= 20) for (const s of seats) {
    const k = Math.floor(((Math.atan2(s[1] - seatC[1], s[0] - seatC[0]) / (2 * Math.PI)) + 1) % 1 * BINS);
    ring[k] = Math.min(ring[k], Math.hypot(s[0] - seatC[0], s[1] - seatC[1]));
  }
  const standingAt = (t) => {
    if (!standing || t[7] || t[6] > standing) return false;
    const x = (t[0] + t[2] + t[4]) / 3 - seatC[0], z = (t[1] + t[3] + t[5]) / 3 - seatC[1];
    const k = Math.floor(((Math.atan2(z, x) / (2 * Math.PI)) + 1) % 1 * BINS);
    return Math.hypot(x, z) < ring[k] - 0.5;
  };
  const BANDS = 8, paths = Array.from({ length: BANDS }, () => new Path2D()), stageP = new Path2D(), standP = new Path2D();
  for (const t of tris) {
    const p = t[7] ? stageP
      : standingAt(t) ? standP
        : paths[Math.max(0, Math.min(BANDS - 1, Math.floor(((t[6] - yLo) / Math.max(1e-3, yHi - yLo)) * BANDS)))];
    const [ax, ay] = P(t[0], t[1]);
    let [bx, by] = P(t[2], t[3]), [cx, cy] = P(t[4], t[5]);
    // one winding for every triangle, so a face and the one under it do not cancel
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) [bx, by, cx, cy] = [cx, cy, bx, by];
    p.moveTo(ax, ay); p.lineTo(bx, by); p.lineTo(cx, cy); p.closePath();
  }
  paths.forEach((p, i) => {
    const l = 20 + i * 5;
    g.fillStyle = `rgb(${l},${l},${l + 2})`; g.strokeStyle = g.fillStyle; g.lineWidth = 0.6;
    g.fill(p); g.stroke(p);
  });
  // a standing floor, in a dim tint of the accent
  g.fillStyle = 'rgb(74,52,34)'; g.strokeStyle = g.fillStyle;
  g.fill(standP); g.stroke(standP);
  // the seats, in their own colours lifted to read on the dark plan
  const r = Math.max(0.8, 0.42 * sc);
  for (const s of seats) {
    const [x, y] = P(s[0], s[1]);
    let [cr, cg, cb] = [s[2], s[3], s[4]].map((v) => Math.pow(v, 1 / 2.2));
    const L = 0.3 * cr + 0.59 * cg + 0.11 * cb, lift = Math.max(0, 0.5 - L);
    [cr, cg, cb] = [cr, cg, cb].map((v) => Math.min(1, v + lift * 1.1));
    g.fillStyle = `rgb(${cr * 255 | 0},${cg * 255 | 0},${cb * 255 | 0})`;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = '#ff9745'; g.strokeStyle = '#ff9745'; g.lineWidth = 0.6;
  g.fill(stageP); g.stroke(stageP);
  return { url: cv.toDataURL('image/webp', 0.86), note: `${tris.length} faces, ${seats.length} seats` };
}
