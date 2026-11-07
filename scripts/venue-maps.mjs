#!/usr/bin/env node
// venue-maps.mjs — the venue picker's seat maps, drawn from the rooms themselves.
//
// Each venue is built in the running dev app (npm run dev) with the scene
// effects off (no crowd), and the room is read back from the scene graph: the
// floors and treads (faces that look up, below the roof) shaded by height, every
// seat as a dot in its own colour, and the stage in the app's accent. The
// result is turned so the stage is at the top, as seating charts are drawn, and
// written to public/venue-maps/<id>.svg (each seat a square, the floors as
// their triangles), so it stays sharp when the picker zooms in. Run it again
// when a room changes.
//
//   node scripts/venue-maps.mjs [http://localhost:5173/Song2Concert/]
//   (CHANNEL=msedge: a system browser, when Playwright's own is not installed)

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:5173/Song2Concert/';
const OUT = path.resolve('public/venue-maps');
// (`<id>-360`: the big rooms laid out round a centre stage)
const VENUES = (process.env.ONLY ? process.env.ONLY.split(',') : ['club', 'theater', 'concerthall', 'arena', 'dome', 'stadium', 'arena-360', 'dome-360', 'stadium-360']);
// the plan is cut here (metres): the roof, the ceiling and what hangs from them
// are above it
const CUT = { club: 2.6, theater: 24, concerthall: 12, arena: 28, dome: 33, stadium: 40 };
// rooms whose floor is a standing floor, up to this height: it is tinted as an
// audience area where it lies inside the seats (the pitch's cover is 1.5 m up)
const STANDING = { club: 0.3, stadium: 2, 'arena-360': 0.3 };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CHANNEL, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL);
await page.waitForFunction(() => window.__stage && document.querySelector('.s2c-load.is-done'), null, { timeout: 120000 });
await page.evaluate(() => window.__stage.setEffects(false));

for (const id of VENUES) {
  const [vid, mode = 'general'] = id.split('-');
  await page.evaluate(([v, m]) => window.__stage.setVenue(v, m === '360' ? '360' : 'general'), [vid, mode]);
  await page.waitForTimeout(300);
  await page.waitForFunction(([v, m]) => window.__stage.stats().venue === v && window.__stage.stats().mode === (m === '360' ? '360' : 'general') && document.querySelector('.s2c-load.is-done'), [vid, mode], { timeout: 180000 });
  const { svg, note } = await page.evaluate(drawPlan, { cut: CUT[vid], standing: STANDING[id] ?? STANDING[vid] ?? 0 });
  if (process.env.DEBUG) console.log(note);
  const file = path.join(OUT, `${id}.svg`);
  fs.writeFileSync(file, svg);
  console.log(id, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
await browser.close();

// ── in the page ────────────────────────────────────────────────────────────
function drawPlan({ cut, standing }) {
  const W = 1920, H = 1080, PAD = 0.06;
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
      // (a long sliver, a cable's run or a road's edge, is not the plan)
      const e = Math.max(Math.hypot(b.x - a.x, b.z - a.z), Math.hypot(c.x - b.x, c.z - b.z), Math.hypot(a.x - c.x, a.z - c.z));
      if (e > 25 && (len / 2) / (e * e) < 0.01) continue;
      tris.push([a.x, a.z, b.x, b.z, c.x, c.z, y, stage]);
    }
  });

  // the frame: the seats and the stage, so a car park or the outer wall does not
  // set the scale; a room with no seats (all standing) by its floor
  const xs = [], zs = [], sxs = [], szs = [];
  const audience = seats.length >= 20
    ? seats.map((s) => [s[0], s[1]])
    : tris.filter((t) => !t[7] && t[6] < 0.3).map((t) => [(t[0] + t[2] + t[4]) / 3, (t[1] + t[3] + t[5]) / 3]);
  for (const [x, z] of audience) { xs.push(x); zs.push(z); }
  let sx = 0, sz = 0, sn = 0;
  for (const t of tris) if (t[7]) { for (const k of [0, 2, 4]) { sxs.push(t[k]); szs.push(t[k + 1]); } sx += t[0]; sz += t[1]; sn++; }
  const mean = (v) => v.reduce((p, q) => p + q, 0) / Math.max(1, v.length);
  const seatC = [mean(audience.map((s) => s[0])), mean(audience.map((s) => s[1]))];
  const stageC = sn ? [sx / sn, sz / sn] : seatC;
  // turned so the stage is up (the audience's centre → the stage points to
  // -y), to the nearest quarter turn: the rooms are laid out on their axes
  const dx = stageC[0] - seatC[0], dz = stageC[1] - seatC[1];
  const ang = Math.hypot(dx, dz) > 2 ? Math.round(Math.atan2(dx, -dz) / (Math.PI / 2)) * (Math.PI / 2) : 0;
  const cs = Math.cos(-ang), sn2 = Math.sin(-ang);
  const rot = (x, z) => [x * cs - z * sn2, x * sn2 + z * cs];
  // the audience's 0.1–99.9 % range, so a stray seat far off does not shrink
  // the map, and all of the stage
  const R = xs.map((x, i) => rot(x, zs[i]));
  const q = (v, f) => { const s = [...v].sort((p, r) => p - r); return s[Math.floor(f * (s.length - 1))]; };
  const rx = R.map((p) => p[0]), rz = R.map((p) => p[1]);
  let x0 = q(rx, 0.001), x1 = q(rx, 0.999), z0 = q(rz, 0.001), z1 = q(rz, 0.999);
  for (let i = 0; i < sxs.length; i++) { const [u, v] = rot(sxs[i], szs[i]); x0 = Math.min(x0, u); x1 = Math.max(x1, u); z0 = Math.min(z0, v); z1 = Math.max(z1, v); }
  const mx = (x1 - x0) * PAD, mz = (z1 - z0) * PAD;
  x0 -= mx; x1 += mx; z0 -= mz; z1 += mz;
  const sc = Math.min(W / (x1 - x0), H / (z1 - z0));
  const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
  const P = (x, z) => { const [u, v] = rot(x, z); return [ox + (u - x0) * sc, oz + (v - z0) * sc]; };

  // the SVG, in whole pixels of a 1920 × 1080 plan: each band's triangles
  // merged into the outlines round them (merge), the seats as short strokes
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  // (the floors on a grid of half that, drawn at twice the size: flat
  // shading needs no finer, and it halves them)
  const tri = (t) => [...P(t[0], t[1]), ...P(t[2], t[3]), ...P(t[4], t[5])].map((v) => Math.round(v / 2));
  // floors and treads, darker low and lighter high, in eight bands
  const ys = tris.filter((t) => !t[7]).map((t) => t[6]);
  const yLo = ys.length ? q(ys, 0.02) : 0, yHi = ys.length ? q(ys, 0.98) : 1;
  // a standing floor: under the standing height, and inside the ring of seats
  // where there are seats round it (by angle round their centre, the nearest
  // seat); drawn clipped to that ring, since one of the floor's triangles can
  // reach right across it
  const BINS = 120, ring = new Float32Array(BINS).fill(Infinity);
  const ringed = seats.length >= 20;
  if (ringed) for (const s of seats) {
    const k = Math.floor(((Math.atan2(s[1] - seatC[1], s[0] - seatC[0]) / (2 * Math.PI)) + 1) % 1 * BINS);
    ring[k] = Math.min(ring[k], Math.hypot(s[0] - seatC[0], s[1] - seatC[1]));
  }
  // (every face under the standing height goes to it, the clip keeping only
  // what lies inside the ring)
  const standingAt = (t) => !!standing && !t[7] && t[6] <= standing;
  const BANDS = 8, paths = Array.from({ length: BANDS }, () => []), stageP = [], standP = [];
  for (const t of tris) {
    const p = t[7] ? stageP
      : standingAt(t) ? standP
        : paths[Math.max(0, Math.min(BANDS - 1, Math.floor(((t[6] - yLo) / Math.max(1e-3, yHi - yLo)) * BANDS)))];
    p.push(tri(t));
  }
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`];
  out.push('<g transform="scale(2)" stroke-width="0.6" stroke-linejoin="round">');
  paths.forEach((p, i) => {
    if (!p.length) return;
    const l = 20 + i * 5, c = `rgb(${l},${l},${l + 2})`;
    out.push(`<path fill="${c}" stroke="${c}" d="${merge(p)}"/>`);
  });
  // a standing floor, in a dim tint of the accent
  if (standP.length) {
    let clip = '';
    if (ringed) {
      const finite = [...ring].filter(Number.isFinite), far = finite.length ? Math.max(...finite) : 0;
      // (each bin the nearest seat over it and two either side: one bin's
      // gap, a tunnel's mouth, would otherwise draw a spike)
      const near = [...ring].map((_, k) => Math.min(...[-2, -1, 0, 1, 2].map((dk) => ring[(k + dk + BINS) % BINS])));
      const pts = near.map((rr, k) => { const an = (k + 0.5) / BINS * 2 * Math.PI, d = (Number.isFinite(rr) ? rr : far) - 0.5; return P(seatC[0] + d * Math.cos(an), seatC[1] + d * Math.sin(an)); });
      out.push(`<clipPath id="ring"><path d="M${pts.map(([u, v]) => `${f1(u / 2)} ${f1(v / 2)}`).join('L')}Z"/></clipPath>`);
      clip = ' clip-path="url(#ring)"';
    }
    out.push(`<path${clip} fill="rgb(74,52,34)" stroke="rgb(74,52,34)" d="${merge(standP)}"/>`);
  }
  out.push('</g>');
  // the seats, in their own colours lifted to read on the dark plan: each a
  // square (a stroke as wide as it is long)
  const r = Math.max(1, Math.round(0.42 * sc));
  const byCol = new Map();
  for (const s of seats) {
    const [x, y] = P(s[0], s[1]).map(Math.round);
    let [cr, cg, cb] = [s[2], s[3], s[4]].map((v) => Math.pow(v, 1 / 2.2));
    const L = 0.3 * cr + 0.59 * cg + 0.11 * cb, lift = Math.max(0, 0.5 - L);
    [cr, cg, cb] = [cr, cg, cb].map((v) => Math.min(1, v + lift * 1.1));
    const col = `rgb(${cr * 255 | 0},${cg * 255 | 0},${cb * 255 | 0})`;
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col).push([x - r, y]);
  }
  // (each seat a move from the last one's end and a stroke 2r long: "m3 -1h4")
  for (const [col, list] of byCol) {
    list.sort((p2, q2) => p2[1] - q2[1] || p2[0] - q2[0]);
    let d = `M${list[0][0]} ${list[0][1]}h${2 * r}`, cx = list[0][0] + 2 * r, cy = list[0][1];
    for (let i = 1; i < list.length; i++) { const [x, y] = list[i]; d += `m${x - cx} ${y - cy}h${2 * r}`; cx = x + 2 * r; cy = y; }
    out.push(`<path fill="none" stroke="${col}" stroke-width="${2 * r}" d="${d}"/>`);
  }
  if (stageP.length) out.push(`<path transform="scale(2)" fill="#ff9745" stroke="#ff9745" stroke-width="0.6" stroke-linejoin="round" d="${merge(stageP)}"/>`);
  out.push('</svg>');
  return { svg: out.join(''), note: `${tris.length} faces, ${seats.length} seats` };

  // Triangles (whole pixels) to the outlines round them: each turned the same
  // way, the same triangle twice taken once (a slab's top and underside), an
  // edge two neighbours share dropped, and what is left chained into loops,
  // straight runs as one segment. Filled nonzero, overlapping pieces add up.
  function merge(T) {
    const seen = new Set(), edges = new Map();
    const add = (a, b) => {
      const back = `${b}>${a}`;
      const n = edges.get(back);
      if (n) { if (n > 1) edges.set(back, n - 1); else edges.delete(back); return; }
      const k = `${a}>${b}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    };
    for (const t of T) {
      let [ax, ay, bx, by, cx, cy] = t;
      const cr = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (cr === 0) continue;
      if (cr < 0) [bx, by, cx, cy] = [cx, cy, bx, by];
      const A = `${ax},${ay}`, B = `${bx},${by}`, C = `${cx},${cy}`;
      const id = [A, B, C].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      add(A, B); add(B, C); add(C, A);
    }
    const next = new Map();
    for (const [k, n] of edges) { const [a, b] = k.split('>'); if (!next.has(a)) next.set(a, []); for (let i = 0; i < n; i++) next.get(a).push(b); }
    let d = '';
    for (const start of [...next.keys()]) {
      while (next.get(start)?.length) {
        const loop = [start];
        let cur = start;
        for (let guard = 0; guard < 1e6; guard++) {
          const outs = next.get(cur);
          if (!outs?.length) break;
          const to = outs.pop();
          if (to === start) break;
          loop.push(to); cur = to;
        }
        const pts = loop.map((k) => k.split(',').map(Number));
        // (a point on the straight line between its neighbours is not needed)
        const keep = pts.filter((pt, i) => {
          const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
          return (pt[0] - a[0]) * (b[1] - a[1]) - (pt[1] - a[1]) * (b[0] - a[0]) !== 0;
        });
        if (keep.length < 3) continue;
        d += `M${keep[0][0]} ${keep[0][1]}l${keep.slice(1).map((pt, i) => `${pt[0] - keep[i][0]} ${pt[1] - keep[i][1]}`).join(' ')}z`;
      }
    }
    return d;
  }
}
