// ─────────────────────────────────────────────────────────────────────────────
// stands built from a venue's own seating plan
//
// The data (generated offline from the official seat maps, one file per venue)
// gives each level's rows as tread outlines with their heights — straight down
// the sides, fanning round the corners, curving round the ends, exactly where
// the building has them — and every seat on them. Round that: the half steps
// up each aisle, the mouths of the tunnels the crowd comes in by, the walls
// with the doors (扉) in them, the rails where a stand drops away, the
// concourse floors behind and under the stands, and the stairs between them;
// and the concourses closed in — ceilings, walls with the doors in them, and
// lights — so that inside them it is a lit corridor, not a gap onto the night.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, TEX, V3, concreteTex, glowMat, lerp, prng, std, withRepeat } from './core.js';
import { mats } from './rig.js';

// A stadium seat, folded up: the shell's back and its seat pan as thin plates
// (seen from a stand away, that is all a seat is), eight triangles.
export function stadiumSeatGeometry() {
  const P = [], N = [];
  const quad = (a, b, c, d, n) => { for (const v of [a, b, c, a, c, d]) P.push(...v); for (let i = 0; i < 6; i++) N.push(...n); };
  const w = 0.22;
  // the back: leaning back, 0.45–0.85 m up
  quad([-w, 0.45, -0.16], [w, 0.45, -0.16], [w, 0.86, -0.24], [-w, 0.86, -0.24], [0, 0.2, 0.98]);
  quad([-w, 0.86, -0.24], [w, 0.86, -0.24], [w, 0.86, -0.28], [-w, 0.86, -0.28], [0, 1, 0]);
  // the pan, folded up against it, and its front edge
  quad([-w, 0.42, -0.1], [w, 0.42, -0.1], [w, 0.7, -0.14], [-w, 0.7, -0.14], [0, 0.15, 0.99]);
  quad([-w, 0.42, -0.1], [w, 0.42, -0.1], [w, 0.42, -0.16], [-w, 0.42, -0.16], [0, -1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}

// Close-view upholstered seats used by the balcony and field-side rows.
// One merged geometry is instanced; arms, closed cushion and supporting legs
// give the real compact silhouette without adding per-seat draw calls.
function paddedSeatGeometry() {
  const parts = [];
  const box = (w, h, d, x, y, z, tilt = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); g.rotateX(tilt); g.translate(x, y, z);
    parts.push(g.toNonIndexed());
  };
  box(0.54, 0.59, 0.105, 0, 0.72, -0.22, -0.11);
  box(0.51, 0.11, 0.38, 0, 0.46, -0.02);
  for (const x of [-0.29, 0.29]) {
    box(0.065, 0.09, 0.39, x, 0.65, -0.015);
    box(0.035, 0.38, 0.035, x, 0.25, -0.16);
    box(0.07, 0.025, 0.25, x, 0.015, -0.12);
  }
  return mergeGeometries(parts);
}

// seats come packed: little-endian int16 quads (x, z in dm or the level's
// 1/seatScale m, row, yaw°), base64
export function decodeSeats(b64) {
  if (Array.isArray(b64)) return b64;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// Where a point lies along a closed ring (its nearest point's distance round
// it), as an angle: 0..2π once round.
function alongRing(ring, every = 3) {
  // (smoothed to about one point every `every` metres, so a stepped outline
  // does not bunch the points along it)
  const pts = [];
  let acc = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, z] = ring[i], [px, pz] = ring[(i + ring.length - 1) % ring.length];
    acc += Math.hypot(x - px, z - pz);
    if (!pts.length || acc >= every) { pts.push([x, z]); acc = 0; }
  }
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len, s0: L });
    L += len;
  }
  return (x, z) => {
    let best = 0, bd = Infinity;
    for (const g of segs) {
      const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1];
      const t = g.len ? Math.max(0, Math.min(1, ((x - g.a[0]) * dx + (z - g.a[1]) * dz) / (g.len * g.len))) : 0;
      const d = (x - g.a[0] - dx * t) ** 2 + (z - g.a[1] - dz * t) ** 2;
      if (d < bd) { bd = d; best = g.s0 + g.len * t; }
    }
    return best / L * Math.PI * 2;
  };
}

// The blocks of a level, as the seats show them: a row's seats run unbroken
// between aisles, and a run belongs to the block its seats sit behind (or in
// front of) in the next row. Worked outward from the row with the most runs,
// which has every aisle; a run lying across two blocks (a front row the
// aisles don't reach) is shared out seat by seat, and a few seats missing in
// a row (a vomitory) don't split a block. Stray handfuls join the nearest
// block. Returns each seat's block, numbered by bearing from the stage.
export function seatBlocks(S, sk, ox, oz, stage, { gap = 0.85, reach = 4, minSeats = 12, anchors = null, tidy = false, wedges = null } = {}) {
  const n = S.length / 4;
  const X = new Float64Array(n), Z = new Float64Array(n), byRow = new Map();
  for (let k = 0; k < n; k++) {
    X[k] = S[k * 4] / sk + ox; Z[k] = S[k * 4 + 1] / sk + oz;
    const r = S[k * 4 + 2];
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r).push(k);
  }
  // a grid of seats, for the nearest one in a set
  const grid = (ks) => { const g = new Map(); for (const k of ks) { const key = `${Math.floor(X[k])},${Math.floor(Z[k])}`; (g.get(key) || g.set(key, []).get(key)).push(k); } return g; };
  const nearest = (g, k, rad, ok = null) => {
    let best = -1, bd = rad * rad;
    const cx = Math.floor(X[k]), cz = Math.floor(Z[k]), c = Math.ceil(rad);
    for (let dx = -c; dx <= c; dx++) for (let dz = -c; dz <= c; dz++) {
      for (const j of g.get(`${cx + dx},${cz + dz}`) || []) {
        if (ok && !ok(j)) continue;
        const d = (X[j] - X[k]) ** 2 + (Z[j] - Z[k]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
    }
    return best;
  };
  // each row's runs: its seats chained wherever the next is within `gap`
  const runOf = new Int32Array(n), rows = [...byRow.keys()].sort((a, b) => a - b), runsOf = new Map(), grids = new Map();
  for (const r of rows) {
    const ks = byRow.get(r), g = grid(ks);
    grids.set(r, g);
    const seen = new Set(), runs = [];
    for (const k of ks) {
      if (seen.has(k)) continue;
      const run = [], stack = [k]; seen.add(k);
      while (stack.length) {
        const a = stack.pop(); run.push(a);
        const cx = Math.floor(X[a]), cz = Math.floor(Z[a]);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of g.get(`${cx + dx},${cz + dz}`) || []) {
          if (!seen.has(j) && (X[j] - X[a]) ** 2 + (Z[j] - Z[a]) ** 2 <= gap * gap) { seen.add(j); stack.push(j); }
        }
      }
      for (const j of run) runOf[j] = runs.length;
      runs.push({ ks: run, b: -1 });
    }
    runsOf.set(r, runs);
  }
  // `wedges` (the bowl's middle, {x, z}): a level whose numbered entrances
  // each sit in their own block, blocks running front to back between the
  // aisles. Where a seat lies round the level is measured along the line
  // through the entrances in turn, so on a straight side a block's edges run
  // square to it, as its aisles do, and round a corner they fan out as the
  // level's own corner does. Each run of a row (its seats between two
  // aisles) goes whole to the block it lies in.
  const block = new Int32Array(n).fill(-1);
  if (wedges && anchors && anchors.length >= 4) {
    const round = anchors.map((a) => [a.x, a.z, Math.atan2(a.x - wedges.x, a.z - wedges.z)]).sort((p, q) => p[2] - q[2]);
    const bear = alongRing(round.map(([x, z]) => [x, z]), 0);
    const ids = new Map(), aIdx = anchors.map((a) => { if (!ids.has(a.label)) ids.set(a.label, ids.size); return ids.get(a.label); });
    const aAng = anchors.map((a) => bear(a.x, a.z));
    // (the entrances' own places mark their blocks' middles; a run the
    // aisles don't stop, on across two blocks, is shared out seat by seat at
    // the line half way between their entrances)
    const nearestTo = (t) => {
      let best = 0, bd = Infinity;
      aAng.forEach((a, i) => { const d = Math.abs(Math.atan2(Math.sin(a - t), Math.cos(a - t))); if (d < bd) { bd = d; best = i; } });
      return aIdx[best];
    };
    for (const r of rows) for (const run of runsOf.get(r)) {
      const own = run.ks.map((k) => nearestTo(bear(X[k], Z[k])));
      const votes = new Map();
      for (const b of own) votes.set(b, (votes.get(b) || 0) + 1);
      const [top, nv] = [...votes].sort((p, q) => q[1] - p[1])[0];
      run.ks.forEach((k, i) => { block[k] = nv >= 0.8 * run.ks.length ? top : own[i]; });
    }
    // then front to back: a run goes with the block the rows either side of
    // it hold where it sits, when they agree and it does not
    for (let pass = 0; pass < 2; pass++) {
      for (let ri = 0; ri < rows.length; ri++) {
        const nb = [rows[ri - 1], rows[ri + 1]].filter((r) => r != null).map((r) => grids.get(r));
        for (const run of runsOf.get(rows[ri])) {
          const votes = new Map();
          for (const g of nb) for (const k of run.ks) { const j = nearest(g, k, 1.6); if (j >= 0) votes.set(block[j], (votes.get(block[j]) || 0) + 1); }
          if (!votes.size) continue;
          const [top, nv] = [...votes].sort((p, q) => q[1] - p[1])[0];
          const tot = [...votes.values()].reduce((x, y) => x + y, 0);
          if (top !== block[run.ks[0]] && nv >= 0.7 * tot) for (const k of run.ks) block[k] = top;
        }
      }
    }
  } else {
    const parent = [];
    const root = (b) => { while (parent[b] !== b) b = parent[b] = parent[parent[b]]; return b; };
    const fresh = () => { parent.push(parent.length); return parent.length - 1; };
    const mid = rows.reduce((best, r) => (runsOf.get(r).length > runsOf.get(best).length ? r : best), rows[0]);
    for (const run of runsOf.get(mid)) { run.b = fresh(); for (const k of run.ks) block[k] = run.b; }
    for (const dir of [1, -1]) {
      let ref = mid;
      const order = rows.filter((r) => (dir > 0 ? r > mid : r < mid));
      if (dir < 0) order.reverse();
      for (const r of order) {
        const g = grids.get(ref);
        let clean = true;
        for (const run of runsOf.get(r)) {
          const near = run.ks.map((k) => nearest(g, k, reach));
          const votes = new Map();
          for (const j of near) if (j >= 0) { const b = root(block[j]); votes.set(b, (votes.get(b) || 0) + 1); }
          const roots = [...votes].filter(([, v]) => v >= 0.2 * run.ks.length).map(([b]) => b);
          if (roots.length === 1) { run.b = roots[0]; for (const k of run.ks) block[k] = run.b; }
          else if (roots.length === 0) { run.b = fresh(); for (const k of run.ks) block[k] = run.b; }
          else {
            // across two blocks: each seat to the one it sits by
            clean = false;
            run.ks.forEach((k, i) => { block[k] = near[i] >= 0 ? root(block[near[i]]) : roots[0]; });
          }
        }
        if (clean) ref = r;
      }
    }
    // stray handfuls to the nearest real block
    const size = new Map();
    for (let k = 0; k < n; k++) { block[k] = root(block[k]); size.set(block[k], (size.get(block[k]) || 0) + 1); }
    const big = (j) => size.get(block[j]) >= minSeats;
    const all = grid([...Array(n).keys()]);
    const moved = [];
    for (let k = 0; k < n; k++) if (!big(k)) { const j = nearest(all, k, 8, big); if (j >= 0) moved.push([k, block[j]]); }
    for (const [k, b] of moved) block[k] = b;
    // where the level's vomitories carry their block's number, the pieces of
    // one block (split by a cross-aisle, a walkway or a vomitory's flights)
    // join under the number most of their seats are nearest
    if (anchors && anchors.length >= 4) {
      const votes = new Map();
      for (let k = 0; k < n; k++) {
        let best = null, bd = Infinity;
        for (const a of anchors) { const d = (a.x - X[k]) ** 2 + (a.z - Z[k]) ** 2; if (d < bd) { bd = d; best = a.label; } }
        const v = votes.get(block[k]) || new Map(); v.set(best, (v.get(best) || 0) + 1); votes.set(block[k], v);
      }
      const byLabel = new Map(), to = new Map();
      for (const [b, v] of votes) {
        const label = [...v].sort((p, q) => q[1] - p[1])[0][0];
        if (!byLabel.has(label)) byLabel.set(label, b);
        to.set(b, byLabel.get(label));
      }
      for (let k = 0; k < n; k++) block[k] = to.get(block[k]);
    }
  }
  // tidied (a level whose aisles the seats only half show): a sliver of a
  // block left by a vomitory or a stair joins the block beside it, and a
  // block run on past an aisle the seats don't show is cut back into blocks
  // of the level's usual size, by bearing
  if (tidy && !(anchors && anchors.length >= 4)) {
    const bear = (k) => Math.atan2(X[k] - stage.x, Z[k] - stage.z);
    const sizes = () => { const m = new Map(); for (let k = 0; k < n; k++) m.set(block[k], (m.get(block[k]) || 0) + 1); return m; };
    let sz = sizes();
    const med = [...sz.values()].sort((a, b) => a - b)[sz.size >> 1];
    for (let pass = 0; pass < 3; pass++) {
      const small = new Set([...sz].filter(([, v]) => v < 0.35 * med).map(([b]) => b));
      if (!small.size) break;
      const g = grid([...Array(n).keys()].filter((k) => !small.has(block[k])));
      const to = new Map();
      for (let k = 0; k < n; k++) {
        if (!small.has(block[k])) continue;
        const j = nearest(g, k, 12);
        if (j < 0) continue;
        const v = to.get(block[k]) || new Map(); v.set(block[j], (v.get(block[j]) || 0) + 1); to.set(block[k], v);
      }
      for (const [b, v] of to) { const t = [...v].sort((p, q) => q[1] - p[1])[0][0]; for (let k = 0; k < n; k++) if (block[k] === b) block[k] = t; }
      sz = sizes();
    }
    let next = Math.max(...block) + 1;
    for (const [b, v] of sz) {
      const parts = Math.round(v / med);
      if (v < 1.8 * med || parts < 2) continue;
      const ks = []; for (let k = 0; k < n; k++) if (block[k] === b) ks.push(k);
      ks.sort((p, q) => bear(p) - bear(q));
      ks.forEach((k, i) => { const part = Math.floor(i * parts / ks.length); if (part) block[k] = next + part - 1; });
      next += parts - 1;
    }
  }
  // number them by bearing
  const sum = new Map();
  for (let k = 0; k < n; k++) { const e = sum.get(block[k]) || [0, 0]; e[0] += Math.atan2(X[k] - stage.x, Z[k] - stage.z); e[1]++; sum.set(block[k], e); }
  const ids = [...sum.keys()].sort((a, b) => sum.get(a)[0] / sum.get(a)[1] - sum.get(b)[0] / sum.get(b)[1]);
  const idx = new Map(ids.map((b, i) => [b, i]));
  for (let k = 0; k < n; k++) block[k] = idx.get(block[k]);
  return { block, count: ids.length };
}

// The finishes inside: pale walls and ceilings and a floor that read as lit
// under the concourse lights whatever the show is doing out in the bowl.
export function roomMaterials(materials) {
  return {
    inMat: materials.interior ?? std({ color: 0x8f8a80, roughness: 0.92, emissive: 0x8a8376, emissiveIntensity: 0.6 }),
    ceilMat: materials.ceiling ?? std({ color: 0xd8d4cc, roughness: 0.9, emissive: 0x8a857c, emissiveIntensity: 0.55 }),
    floorLit: materials.floor ?? std({ color: 0x86817a, roughness: 0.7, emissive: 0x5b564e, emissiveIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    // the sides of a tunnel mouth: lit from the concourse behind, less so out in the bowl
    mouthMat: std({ color: 0xa9a297, roughness: 0.9, emissive: 0x5a554c, emissiveIntensity: 0.4, side: THREE.DoubleSide }),
    mouthFloor: std({ color: 0x77726b, roughness: 0.75, emissive: 0x3e3a35, emissiveIntensity: 0.45 }),
    stairMat: materials.stair ?? std({ color: 0xa8a298, roughness: 0.85, emissive: 0x5e594f, emissiveIntensity: 0.5 }),
    lampMat: glowMat(0xfff0da, 1.7, { side: THREE.DoubleSide }),
  };
}

// A level's blocks as its seats are labelled (`LB`: block, row, number a seat,
// the block an index into the data's `blockNames`): the real ones, numbered in
// order round the level's middle, so neighbours alternate.
export function labelBlocks(S, sk, ox, oz, LB) {
  const n = S.length / 4, block = new Int32Array(n);
  const mid = new Map();
  let cx = 0, cz = 0;
  for (let k = 0; k < n; k++) {
    const x = S[k * 4] / sk + ox, z = S[k * 4 + 1] / sk + oz, b = LB[k * 3];
    cx += x; cz += z;
    const m = mid.get(b) || [0, 0, 0]; m[0] += x; m[1] += z; m[2]++; mid.set(b, m);
  }
  cx /= n || 1; cz /= n || 1;
  const ids = [...mid.keys()].sort((a, b) => {
    const ma = mid.get(a), mb = mid.get(b);
    return Math.atan2(ma[0] / ma[2] - cx, ma[1] / ma[2] - cz) - Math.atan2(mb[0] / mb[2] - cx, mb[1] / mb[2] - cz);
  });
  const num = new Map(ids.map((b, i) => [b, i]));
  for (let k = 0; k < n; k++) block[k] = num.get(LB[k * 3]);
  return { block, count: ids.length, ids };
}

// A level's blocks by its aisles: the seats that hang together. A seat holds
// to the one beside it in its row (within `gap` along the row: across an
// aisle is further) and to the one straight in front or behind in the next
// row (no more than `lat` off its line, within `depth`), never across a step
// of the level's stairs (`steps`). A block is one group of seats held
// together; groups of fewer than `minSeats` join the nearest big one. Numbered in order
// round the level's middle, so neighbours alternate.
export function aisleBlocks(S, sk, ox, oz, steps = [], { gap = 0.68, lat = 0.3, depth = 1.4, minSeats = 60 } = {}) {
  const n = S.length / 4;
  const X = new Float64Array(n), Z = new Float64Array(n), R = new Int32Array(n), FX = new Float64Array(n), FZ = new Float64Array(n);
  let cx = 0, cz = 0;
  for (let k = 0; k < n; k++) {
    X[k] = S[k * 4] / sk + ox; Z[k] = S[k * 4 + 1] / sk + oz; R[k] = S[k * 4 + 2];
    const yaw = S[k * 4 + 3] * DEG; FX[k] = Math.sin(yaw); FZ[k] = Math.cos(yaw);
    cx += X[k]; cz += Z[k];
  }
  cx /= n; cz /= n;
  // the steps, for a link not to cross one: their outlines' edges in a grid
  const segs = [];
  for (const p of steps) for (const r of (typeof p[0][0] === 'number' ? [p] : p)) for (let i = 0, m = r.length - 1; i < r.length; m = i++) segs.push([r[m][0] + ox, r[m][1] + oz, r[i][0] + ox, r[i][1] + oz]);
  const sg = new Map();
  segs.forEach((e, i) => { for (const gx of [Math.floor(e[0]), Math.floor(e[2])]) for (const gz of [Math.floor(e[1]), Math.floor(e[3])]) { const key = `${gx},${gz}`; (sg.get(key) || sg.set(key, new Set()).get(key)).add(i); } });
  const cross = (ax, az, bx, bz) => {
    const near = new Set();
    for (const gx of [Math.floor(ax), Math.floor(bx)]) for (const gz of [Math.floor(az), Math.floor(bz)]) for (const i of sg.get(`${gx},${gz}`) || []) near.add(i);
    for (const i of near) {
      const [cx_, cz_, dx_, dz_] = segs[i];
      const o = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
      if (o(ax, az, bx, bz, cx_, cz_) !== o(ax, az, bx, bz, dx_, dz_) && o(cx_, cz_, dx_, dz_, ax, az) !== o(cx_, cz_, dx_, dz_, bx, bz)) return true;
    }
    return false;
  };
  // the seats in a grid a metre and a half across
  const grid = new Map();
  for (let k = 0; k < n; k++) { const key = `${Math.floor(X[k] / 1.5)},${Math.floor(Z[k] / 1.5)}`; (grid.get(key) || grid.set(key, []).get(key)).push(k); }
  const up = new Int32Array(n).map((_, i) => i);
  const find = (k) => { while (up[k] !== k) { up[k] = up[up[k]]; k = up[k]; } return k; };
  for (let k = 0; k < n; k++) {
    const gx = Math.floor(X[k] / 1.5), gz = Math.floor(Z[k] / 1.5);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(`${gx + dx},${gz + dz}`) || []) {
      if (j <= k) continue;
      const ex = X[j] - X[k], ez = Z[j] - Z[k];
      const al = Math.abs(ex * FZ[k] - ez * FX[k]), fw = Math.abs(ex * FX[k] + ez * FZ[k]);
      const dr = Math.abs(R[j] - R[k]);
      // (and facing the same way: a corner's fan, turned, is a block of its own)
      const ok = FX[j] * FX[k] + FZ[j] * FZ[k] > 0.97 && ((dr === 0 && al <= gap && fw < 0.3) || (dr === 1 && al <= lat && fw <= depth));
      if (ok && !cross(X[k], Z[k], X[j], Z[j])) up[find(j)] = find(k);
    }
  }
  // A group whose front rows run unbroken under several blocks' aisles is
  // cut along those aisles: across it (square to its seats' facing), where
  // the rows behind break in two or more of them, every seat goes to the side
  // it lies on.
  const lbl = new Int32Array(n);
  for (let k = 0; k < n; k++) lbl[k] = find(k);
  {
    const mem = new Map();
    for (let k = 0; k < n; k++) (mem.get(lbl[k]) || mem.set(lbl[k], []).get(lbl[k])).push(k);
    let next = n;
    for (const ks of mem.values()) {
      if (ks.length < 200) continue;
      let fx = 0, fz = 0;
      for (const k of ks) { fx += FX[k]; fz += FZ[k]; }
      const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
      const v = (k) => X[k] * fz - Z[k] * fx;
      const rows = new Map();
      for (const k of ks) (rows.get(R[k]) || rows.set(R[k], []).get(R[k])).push(v(k));
      const breaks = [];
      for (const r of rows.values()) { r.sort((p, q) => p - q); for (let i = 1; i < r.length; i++) if (r[i] - r[i - 1] > gap) breaks.push((r[i] + r[i - 1]) / 2); }
      breaks.sort((p, q) => p - q);
      const cuts = [];
      // (an aisle: breaks at one place in four in ten of the rows; blocks
      // at least 5 m across, so a vomitory's gap in a few rows cuts nothing)
      const all = ks.map(v).sort((p, q) => p - q), lo = all[0], hi = all[all.length - 1];
      for (let i = 0; i < breaks.length;) {
        let e = i; while (e + 1 < breaks.length && breaks[e + 1] - breaks[i] < 0.6) e++;
        const at = (breaks[i] + breaks[e]) / 2;
        if (e - i + 1 >= Math.max(3, rows.size * 0.4) && at - (cuts.length ? cuts[cuts.length - 1] : lo) >= 5 && hi - at >= 5) cuts.push(at);
        i = e + 1;
      }
      if (!cuts.length) continue;
      const base = next; next += cuts.length + 1;
      for (const k of ks) { let c = 0; while (c < cuts.length && v(k) > cuts[c]) c++; lbl[k] = base + c; }
    }
  }
  const piece = new Int32Array(n), count = new Map(), mid = new Map();
  for (let k = 0; k < n; k++) {
    const p = lbl[k]; piece[k] = p; count.set(p, (count.get(p) || 0) + 1);
    const m = mid.get(p) || [0, 0]; m[0] += X[k]; m[1] += Z[k]; mid.set(p, m);
  }
  // small groups to the nearest seat of a big one
  const big = (p) => count.get(p) >= minSeats;
  const bigSeats = [];
  for (let k = 0; k < n; k++) if (big(piece[k])) bigSeats.push(k);
  if (bigSeats.length) for (let k = 0; k < n; k++) {
    if (big(piece[k])) continue;
    let best = bigSeats[0], bd = Infinity;
    // (the nearest facing its way: a sliver beside a tunnel's mouth joins
    // the block it sits in line with, not the corner's fan)
    for (const j of bigSeats) { const d = (X[j] - X[k]) ** 2 + (Z[j] - Z[k]) ** 2 + (FX[j] * FX[k] + FZ[j] * FZ[k] > 0.97 ? 0 : 400); if (d < bd) { bd = d; best = j; } }
    piece[k] = piece[best];
  }
  // a level's cross-aisle (front to back) does not divide it: a group behind
  // another (the way their seats face) over much the same width is one block
  // with it (a group running on behind several is not)
  const mem = new Map();
  for (let k = 0; k < n; k++) (mem.get(piece[k]) || mem.set(piece[k], []).get(piece[k])).push(k);
  const grp = [...mem.keys()], top = new Map(grp.map((p) => [p, p]));
  const root = (p) => { while (top.get(p) !== p) p = top.get(p); return p; };
  const info = new Map(grp.map((p) => {
    const ks = mem.get(p); let mx = 0, mz = 0, fx = 0, fz = 0;
    for (const k of ks) { mx += X[k]; mz += Z[k]; fx += FX[k]; fz += FZ[k]; }
    const l = Math.hypot(fx, fz) || 1;
    return [p, { ks, mx: mx / ks.length, mz: mz / ks.length, fx: fx / l, fz: fz / l }];
  }));
  const across = (g, fx, fz) => { let lo = Infinity, hi = -Infinity; for (const k of g.ks) { const v = X[k] * fz - Z[k] * fx; lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo, hi]; };
  for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) {
    const A = info.get(grp[i]), B = info.get(grp[j]);
    if (A.fx * B.fx + A.fz * B.fz < 0.9) continue;
    const dx = B.mx - A.mx, dz = B.mz - A.mz, fx = A.fx, fz = A.fz;
    if (Math.abs(dx * fx + dz * fz) < 2 * Math.abs(dx * fz - dz * fx) || Math.hypot(dx, dz) > 30) continue;
    const a = across(A, fx, fz), b2 = across(B, fx, fz);
    const ov = Math.min(a[1], b2[1]) - Math.max(a[0], b2[0]);
    if (ov > 0.6 * Math.max(a[1] - a[0], b2[1] - b2[0])) top.set(root(grp[j]), root(grp[i]));
  }
  for (let k = 0; k < n; k++) piece[k] = root(piece[k]);
  for (const p of grp) { const r = root(p); if (r === p) continue; count.set(r, count.get(r) + count.get(p)); const m = mid.get(r), m2 = mid.get(p); m[0] += m2[0]; m[1] += m2[1]; }
  // a block far wider than the level's others (a stretch whose aisles the
  // data lacks) is cut into as many of their width as fit, along it
  {
    const mem2 = new Map();
    for (let k = 0; k < n; k++) (mem2.get(piece[k]) || mem2.set(piece[k], []).get(piece[k])).push(k);
    const wid = new Map();
    for (const [p, ks] of mem2) {
      const fx0 = ks.reduce((a, k) => a + FX[k], 0), fz0 = ks.reduce((a, k) => a + FZ[k], 0), l = Math.hypot(fx0, fz0) || 1;
      // (measured along its rows: the length of its longest row)
      const rows = new Map();
      for (const k of ks) (rows.get(R[k]) || rows.set(R[k], []).get(R[k])).push(k);
      let w = 0, best = null;
      for (const r of rows.values()) { let a = 0; for (let i = 1; i < r.length; i++) a = Math.max(a, Math.hypot(X[r[i]] - X[r[0]], Z[r[i]] - Z[r[0]])); if (a > w) { w = a; best = r; } }
      wid.set(p, { w, ks, fx: fx0 / l, fz: fz0 / l });
    }
    const ws = [...wid.values()].map((v) => v.w).sort((a, b) => a - b), med = ws[ws.length >> 1] || 0;
    let next = n * 4;
    for (const [p, v] of wid) {
      if (!med || v.w < 2.5 * med) continue;
      const parts = Math.round(v.w / med);
      // along the level: each seat's bearing round the middle, or along its
      // rows if it is straight
      const a = Math.abs(v.ks.reduce((m, k) => Math.max(m, Math.abs(FX[k] * v.fz - FZ[k] * v.fx)), 0)) < 0.1
        ? (k) => X[k] * v.fz - Z[k] * v.fx : (k) => Math.atan2(X[k] - cx, Z[k] - cz);
      const as = v.ks.map(a).sort((x, y) => x - y), lo = as[0], hi = as[as.length - 1];
      for (const k of v.ks) { piece[k] = next + Math.min(parts - 1, Math.floor((a(k) - lo) / (hi - lo + 1e-9) * parts)); }
      for (let i = 0; i < parts; i++) { count.set(next + i, 0); mid.set(next + i, [0, 0]); }
      for (const k of v.ks) { count.set(piece[k], count.get(piece[k]) + 1); const m = mid.get(piece[k]); m[0] += X[k]; m[1] += Z[k]; }
      next += parts;
    }
  }
  const ang = (p) => { const m = mid.get(p), c = count.get(p); return Math.atan2(m[0] / c - cx, m[1] / c - cz); };
  const ids = [...new Set(piece)].sort((p, q) => ang(p) - ang(q));
  const num = new Map(ids.map((p, i) => [p, i]));
  const block = new Int32Array(n);
  for (let k = 0; k < n; k++) block[k] = num.get(piece[k]);
  return { block, count: ids.length };
}

// The building's aisle signs (Tokyo Dome's hang black over each portal: the
// number large, 通路 AISLE under it): one plate drawn in the cell (x, y, w, h).
export function drawAisleSign(g, x, y, w, h, label, bg, fg) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${Math.round(h * 0.54)}px "Inter Tight", Arial, sans-serif`;
  g.fillText(label, x + w / 2, y + h * 0.4);
  g.font = `500 ${Math.round(h * 0.17)}px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, "Inter Tight", Arial, sans-serif`;
  g.fillText('通路 AISLE', x + w / 2, y + h * 0.83);
}

// The name over a vomitory's mouth: white on a dark plate, lit (`aisle`: a
// number, in the style of the building's aisle signs).
export function vomSignTexture(label, bg = '#15181f', fg = '#f2f2ee', aisle = false) {
  const key = `vomsign:${label}:${bg}:${fg}:${aisle}`;
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  if (aisle) drawAisleSign(g, 0, 0, 256, 96, label, bg, fg);
  else {
    g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${label.length > 4 ? 44 : 58}px "Inter Tight", Arial, sans-serif`;
    g.fillText(label, 128, 50);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true;
  TEX.set(key, t);
  return t;
}

// The aisle numbers (data.signs: {x, y, z, yaw, w, label}, a plate facing (sin yaw,
// cos yaw); with `r` it is on a pillar of that half-width about (x, z), on the
// face it looks out of), every plate of them on one sheet and in one mesh.
export function signSheet(list, ox, oz, bg = '#15181f', fg = '#f2f2ee') {
  const labels = [...new Set(list.map((s) => s.label))];
  const cols = 8, cw = 256, ch = 96, rows = Math.ceil(labels.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
  const g2 = c.getContext('2d');
  g2.fillStyle = bg; g2.fillRect(0, 0, c.width, c.height);
  labels.forEach((label, i) => drawAisleSign(g2, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, label, bg, fg));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const P = [], U = [];
  for (const s of list) {
    const i = labels.indexOf(s.label);
    const u0 = ((i % cols) * cw) / c.width, u1 = u0 + cw / c.width;
    const v1 = 1 - (Math.floor(i / cols) * ch) / c.height, v0 = v1 - ch / c.height;
    // (on a pillar, flat on the face of it the plate looks out of, as wide as
    // the face at the most)
    const w = s.r ? Math.min(s.w, 2 * s.r) : s.w, off = s.r ? s.r + 0.012 : 0;
    const hh = (w * ch / cw) / 2;
    const rx = Math.cos(s.yaw) * w / 2, rz = -Math.sin(s.yaw) * w / 2;
    const x = s.x + ox + Math.sin(s.yaw) * off, z = s.z + oz + Math.cos(s.yaw) * off;
    const q = [[x - rx, s.y - hh, z - rz, u0, v0], [x + rx, s.y - hh, z + rz, u1, v0], [x + rx, s.y + hh, z + rz, u1, v1], [x - rx, s.y + hh, z - rz, u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { P.push(q[k][0], q[k][1], q[k][2]); U.push(q[k][3], q[k][4]); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d8d8 }));
  m.userData.noCollide = true;
  return m;
}

// The columns at the heads of the 1st floor's aisles (data.pillars: {x, z, r,
// y0, y1, and the aisle's direction ax, az}): square-cornered, as the building's
// are, 2rx across their aisle and 2rz along it (or 2r each way); in one mesh.
// (a column with its own `color` is drawn in that colour, the rest in `mat`; its own material marked `userData.houseLit`,
// its glow the full value: a venue that dims its house lights can take the glow down with them)
export function pillars(list, ox, oz, mat) {
  const groups = new Map();
  for (const p of list) {
    const k = p.color ?? null;
    if (!groups.has(k)) groups.set(k, []);
    for (const section of p.sections ?? [p]) {
      const g = new THREE.BoxGeometry(2 * (section.rx ?? p.rx ?? p.r), section.y1 - section.y0, 2 * (section.rz ?? p.rz ?? p.r));
      g.rotateY(Math.atan2(p.ax ?? 0, p.az ?? 1));
      const offset = section.offsetAlong ?? 0;
      g.translate(p.x + (p.ax ?? 0) * offset + ox, (section.y0 + section.y1) / 2, p.z + (p.az ?? 1) * offset + oz);
      groups.get(k).push(g.toNonIndexed());
    }
  }
  const out = new THREE.Group();
  for (const [k, parts] of groups) {
    let mm = mat;
    if (k !== null) { mm = mat.clone(); mm.color = new THREE.Color(k); if (mm.emissive) { mm.emissive = new THREE.Color(k).multiplyScalar(0.25); mm.emissiveIntensity = 1; } if (mm.map) mm.map = null; mm.needsUpdate = true; mm.userData.houseLit = 1; }
    const m = new THREE.Mesh(mergeGeometries(parts), mm);
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

// The doors' frames (data.frames: {x, z, yaw, w, h, y}): a post each side and a lintel across, as deep as the
// wall is thick; the frame faces (sin yaw, cos yaw), `w` the opening, `h` its height over the floor `y`.
export function doorFrames(list, ox, oz, mat) {
  const parts = [];
  const T = 0.16, D = 0.34;
  for (const f of list) {
    const box = (bw, bh, bd, lx, ly) => {
      const b = new THREE.BoxGeometry(bw, bh, bd);
      b.translate(lx, ly, 0); b.rotateY(f.yaw); b.translate(f.x + ox, 0, f.z + oz);
      parts.push(b.toNonIndexed());
    };
    for (const s of [-1, 1]) box(T, f.h + 0.2, D, s * (f.w / 2 + T / 2), f.y + (f.h + 0.2) / 2);
    box(f.w + 2 * T, 0.2, D, 0, f.y + f.h + 0.1);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.receiveShadow = true;
  return m;
}

// The walls round a bowl of open floor where it meets the stand (data.cutWalls: [{pts: [[x, z, top], ...], inner, back,
// caps}]): each stands from the floor and its top is raked with the rows beside it. Along the polyline `pts` (the stand's
// edge) the wall's body reaches out into the open space to `inner` (a point for each, its face there; or `n`, the unit
// vector out, and `T`, how far): a solid, its two faces, its top and its ends (`caps`: whether the start and the end of
// the piece show, [true, true] by default, a piece that runs on into the next hiding its end), each face and the top
// flat or smooth along its length as the polyline is, the texture running on with it. A pale coping runs along its top
// (`coping` high on both faces, and the top between `inner` and `back`, a strip of one width all along it; the rest of
// the top, out to the stand's edge, is the wall's own concrete). With neither `inner` nor `T` it is a ribbon, one face.
export function cutWalls(list, ox, oz, mat, coping = 0) {
  const body = { p: [], u: [], i: [] }, cap = { p: [], u: [], i: [] };
  // a strip between two lines of points [x, y, z, u, v] of equal length (a face), into `acc`
  const strip = (acc, A, B) => {
    const base = acc.p.length / 3;
    for (let i = 0; i < A.length; i++) { acc.p.push(A[i][0], A[i][1], A[i][2], B[i][0], B[i][1], B[i][2]); acc.u.push(A[i][3], A[i][4], B[i][3], B[i][4]); }
    for (let i = 0; i + 1 < A.length; i++) { const a = base + 2 * i, b = a + 1, c = a + 2, d = a + 3; acc.i.push(a, c, d, a, d, b); }
  };
  for (const w of list) {
    const q = w.pts, T = w.T ?? 0;
    const inner = w.inner ?? (w.n && T > 0 ? q.map((p, i) => [p[0] + w.n[i][0] * T, p[1] + w.n[i][1] * T]) : null);
    const back = w.back ?? q;                                    // the coping's other edge (default: the stand's edge)
    const s = [0];
    for (let i = 1; i < q.length; i++) s.push(s[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
    const lineOf = (k) => (k === 1 && inner ? inner : q);
    const at = (i, k, y, u, v, ln = lineOf(k)) => [ln[i][0] + ox, y, ln[i][1] + oz, u, v];
    const tops = q.map((pt) => pt[2]);
    const wid = (i) => (inner ? Math.hypot(inner[i][0] - q[i][0], inner[i][1] - q[i][1]) : 0);
    for (const k of inner ? [0, 1] : [0]) {
      strip(body, q.map((_, i) => at(i, k, 0, s[i], 0)), q.map((_, i) => at(i, k, tops[i] - coping, s[i], tops[i] - coping)));
      if (coping > 0) strip(cap, q.map((_, i) => at(i, k, tops[i] - coping, s[i], 0)), q.map((_, i) => at(i, k, tops[i], s[i], coping)));
    }
    if (inner) {
      strip(body, q.map((_, i) => at(i, 0, tops[i], s[i], 0)), q.map((_, i) => at(i, 0, tops[i], s[i], 0, back)));         // the top, out to the coping
      strip(cap, q.map((_, i) => at(i, 0, tops[i], s[i], 0, back)), q.map((_, i) => at(i, 1, tops[i], s[i], wid(i))));      // the coping's top
      const caps = w.caps ?? [true, true];
      [[0, caps[0]], [q.length - 1, caps[1]]].forEach(([i, show]) => {                                                  // its ends
        if (!show) return;
        strip(body, [at(i, 0, 0, 0, 0), at(i, 1, 0, wid(i), 0)], [at(i, 0, tops[i] - coping, 0, tops[i] - coping), at(i, 1, tops[i] - coping, wid(i), tops[i] - coping)]);
        if (coping > 0) strip(cap, [at(i, 0, tops[i] - coping, 0, 0), at(i, 1, tops[i] - coping, wid(i), 0)], [at(i, 0, tops[i], 0, coping), at(i, 1, tops[i], wid(i), coping)]);
      });
    }
  }
  const geo = (acc) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(acc.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.u, 2));
    g.setIndex(acc.i);
    g.computeVertexNormals();
    return g;
  };
  const grp = new THREE.Group();
  const m = new THREE.Mesh(geo(body), mat);
  m.receiveShadow = true;
  grp.add(m);
  if (cap.p.length) {
    const cm = mat.clone(); cm.color.setScalar(1.0);
    grp.add(new THREE.Mesh(geo(cap), cm));
  }
  return grp;
}

// A vomitory as its own solid: a straight pit through the rows too low to
// walk under, walled either side up past the treads beside it (each wall one
// solid, its top raked with the rows, capped; the walls sit inside the pit, so
// the treads' own sides are behind them, never in the same plane), the mouth
// framed (a post each side, a lintel over it, as deep as the walls are thick),
// a tunnel on under the rows above to the concourse, ceiled and lit from
// within, and the section's name over the mouth.
export function vomParts(v, ox, oz, stepped = false) {
  const [ux, uz] = v.u, vx = -uz, vz = ux;
  const yaw = Math.atan2(ux, uz);
  const at = (t, s) => [v.p[0] + ox + ux * t + vx * s, v.p[1] + oz + uz * t + vz * s];
  const box = (t0, t1, s0, s1, y0, y1) => {
    if (t1 - t0 < 0.01 || y1 - y0 < 0.01) return null;
    const g = new THREE.BoxGeometry(Math.abs(s1 - s0), y1 - y0, t1 - t0);
    g.rotateY(yaw);
    const [x, z] = at((t0 + t1) / 2, (s0 + s1) / 2);
    g.translate(x, (y0 + y1) / 2, z);
    return g.toNonIndexed();
  };
  // a wall along the pit, a profile (t, y) of its own extruded across s0..s1
  const wall = (pts, s0, s1) => {
    if (pts.length < 3) return null;
    const ex = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([t, y]) => new THREE.Vector2(t, y))), { depth: s1 - s0, bevelEnabled: false });
    const [x, z] = at(0, s0);
    ex.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(vx, 0, vz)).setPosition(x, 0, z));
    return ex.toNonIndexed();
  };
  const T = 0.35, hw = v.w / 2, PAR = 1.0;
  const pit = [], cap = [], tunnel = [], floor = [], ceil = [], lamps = [], signs = [];
  // (v.wall) a pit squared off in the data, its mouth under the row at its back: one parapet round its three
  // sides, the sides' tops one even slope from t0 at the front to t1 at the back wall, the back wall across the
  // mouth from the lintel's underside (roof) up to t1; the caps meet end to end, never overlapping
  if (v.wall) {
    const { t0, t1, roof } = v.wall, L = v.L, C = 0.03, H = 0.06;
    for (const sg of [-1, 1]) {
      const a = Math.min(sg * (hw - T), sg * hw), b = Math.max(sg * (hw - T), sg * hw);
      pit.push(wall([[0, v.y], [L, v.y], [L, t1], [L - T, t1], [0, t0]], a, b));
      cap.push(wall([[0, t0], [L - T, t1], [L + C, t1], [L + C, t1 + H], [L - T, t1 + H], [0, t0 + H]], a - C, b + C));
    }
    // (an open pit runs straight on into its passage: no wall across its back)
    if (!v.wall.open) {
      pit.push(box(L - T, L, -hw + T, hw - T, roof, t1));
      cap.push(box(L - T - C, L + C, -hw + T + C, hw - T - C, t1, t1 + H));
    }
  }
  for (const sg of v.wall ? [] : [-1, 1]) {
    // the rows' treads beside the pit, the wall's top a rail's height over each, raked from one row's middle to the next's
    const rows = v.sides.filter((sd) => sd[0] === sg).sort((p, q) => p[1] - q[1]);
    if (!rows.length) continue;
    const top = rows.map(([, t0, t1, h]) => [(t0 + t1) / 2, h + PAR]);
    const prof = [[rows[0][1], top[0][1]], ...top, [rows[rows.length - 1][2], top[top.length - 1][1]]];
    // only where the wall stands up over the pit's floor
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const lo = v.y, t0 = run[0][0], t1 = run[run.length - 1][0];
        const s0 = sg * (hw - T), s1 = sg * hw, a = Math.min(s0, s1), b = Math.max(s0, s1);
        pit.push(wall([[t0, lo], [t1, lo], ...run.slice().reverse().map(([t, y]) => [t, y])], a, b));
        cap.push(wall([...run.map(([t, y]) => [t, y]), ...run.slice().reverse().map(([t, y]) => [t, y + 0.06])], a - 0.03, b + 0.03));
      }
      run = [];
    };
    for (let i = 0; i < prof.length; i++) {
      if (prof[i][1] - v.y > 0.02) run.push(prof[i]);
      else flush();
    }
    flush();
  }
  // a guard across the front where the rows in front fall away
  if (v.front != null && v.front < v.y - 0.3) pit.push(box(-T, 0, -hw, hw, v.front, v.y + PAR));
  // where the rows at the mouth stand well below the concourse, steps up
  // inside the pit to its floor
  const mouth = Math.min(...v.sides.filter((sd) => sd[1] < 0.3).map((sd) => sd[3])) - 0.17;
  let t0f = 0;
  if (Number.isFinite(mouth) && v.y - mouth > 0.5) {
    const n = Math.ceil((v.y - mouth) / 0.18), rise = (v.y - mouth) / n;
    for (let i = 0; i < n; i++) floor.push(box(i * 0.3, (i + 1) * 0.3, -hw + T, hw - T, mouth - 0.3, mouth + rise * (i + 1)));
    t0f = n * 0.3;
  }
  // (over a floor of the data's own at v.y, where there is one, clear of it)
  floor.push(box(t0f, v.L + v.T, -hw, hw, v.y - 0.12, v.y + (v.wall ? 0.02 : 0.005)));
  if (stepped && v.wall?.open && v.top > v.y + 0.1) {
    const n=Math.ceil((v.top-v.y)/0.18),run=v.L/n;
    for (let i=0;i<n;i++) floor.push(box(i*run,(i+1)*run+(i===n-1?.05:.015),-hw+T,hw-T,v.y-0.12,v.y+(v.top-v.y)*(i+1)/n));
  }
  // (v.bridge) a plate under the mouth's edge, out over the treads' end (a traced pit can stand a hand's breadth off the
  // last tread, a crack to walk into): just under the floor's first step
  if (v.bridge) {
    const top = (t0f > 0 ? mouth + (v.y - mouth) / Math.ceil((v.y - mouth) / 0.18) : v.y) - 0.01;
    floor.push(box(-0.35, 0.02, -hw + T, hw - T, top - 0.4, top));
  }
  if (v.T > 0 && v.roof != null) {
    // the mouth's frame: posts as thick as the pit's walls, a lintel between them, deep enough to read as the wall's thickness
    const D = Math.max(v.T, 0.6);
    for (const sg of [-1, 1]) tunnel.push(box(v.L, v.L + D, sg * (hw - T), sg * hw, v.y, v.roof + 0.45));
    tunnel.push(box(v.L, v.L + D, -hw, hw, v.roof, v.roof + 0.45));
    // a tunnel to a concourse not drawn here ends at its doors
    if (v.end) tunnel.push(box(v.L + v.T - T, v.L + v.T, -hw, hw, v.y, v.roof));
    ceil.push(box(v.L, v.L + D, -hw + T, hw - T, v.roof - 0.05, v.roof - 0.01));
    for (let t = v.L + 1.2; t < v.L + v.T - 0.6; t += 3) {
      const [x, z] = at(t, 0);
      lamps.push([x, v.roof - 0.06, z, yaw]);
    }
    if (v.label) {
      const [x, z] = at(v.L - 0.03, 0);
      const w = Math.min(1.6, v.w - 0.3);
      signs.push({ x, y: v.roof + 0.32, z, yaw: yaw + Math.PI, w, ...(v.sign != null ? { h: w * 0.375, aisle: true } : {}), label: v.sign ?? v.label });
    }
  }
  const clean = (a) => a.filter(Boolean);
  return { pit: clean(pit), cap: clean(cap), tunnel: clean(tunnel), floor: clean(floor), ceil: clean(ceil), lamps, signs };
}

// The concourse lights are on for whoever is in there: seen from the bowl —
// a seat, the floor, the stage — the doors and tunnel mouths stay dark, as
// they read in a show; step into a concourse, a tunnel or onto its stairs and
// they come up. `update(f)` follows the camera and fades between the two.
export function roomLights(data, { ox, oz, lit }) {
  const R = data.rooms;
  const zones = [];
  const add = (polys, y0, y1) => {
    const rings = polys.map((r) => r.map(([x, z]) => [x + ox, z + oz]));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    zones.push({ rings, x0, x1, z0, z1, y0, y1 });
  };
  for (const f of R.lit) for (const polys of f.polys) add(polys, f.y + 0.2, f.y + 4.6);
  for (const L of data.levels) for (const h of L.holes) add([h.ring], h.floor + 0.2, h.floor + 5.5);
  for (const L of data.levels) for (const v of L.voms || []) {
    const [ux, uz] = v.u, vx = -uz, vz = ux, hw = v.w / 2, t1 = v.L + v.T + 0.5;
    add([[[0, -hw], [t1, -hw], [t1, hw], [0, hw]].map(([t, s]) => [v.p[0] + ux * t + vx * s, v.p[1] + uz * t + vz * s])], v.y - 0.3, v.y + 3.2);
  }
  for (const f of data.flights) {
    const w = (f.w ?? 1.6) / 2 + 0.4, ux = f.dx, uz = f.dz, vx = -uz, vz = ux;
    const c = [[-0.8, -w], [f.L + 0.8, -w], [f.L + 0.8, w], [-0.8, w]].map(([a, b]) => [f.x + ux * a + vx * b, f.z + uz * a + vz * b]);
    add([c], f.y0 + 0.2, f.y1 + 2.4);
  }
  const inRing = (r, x, z) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const inZones = (list, { x, y, z }) => list.some((q) => y > q.y0 && y < q.y1 && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1
    && inRing(q.rings[0], x, z) && !q.rings.slice(1).some((h) => inRing(h, x, z)));
  // while the show runs ('공연 중', house 0) the concourses stay dark: the lights come up only for someone who has stepped
  // in at an entrance, between the wall's line and a couple of metres past the pillar
  const showZones = (data.pillars || []).map((p) => {
    const ax = p.ax ?? 0, az = p.az ?? 1, vx = -az, vz = ax;
    const ring = [[-1.8, -2.4], [2.8, -2.4], [2.8, 2.4], [-1.8, 2.4]].map(([a, b]) => [p.x + ox + ax * a + vx * b, p.z + oz + az * a + vz * b]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { rings: [ring], x0, x1, z0, z1, y0: p.y0 + 0.2, y1: p.y1 + 0.2 };
  });
  // ...and once someone is in, they stay up for as long as they are anywhere
  // in the concourse, not only while they stand in that entrance
  let on = false;
  const inside = (c, house) => {
    const show = house < 0.5 && showZones.length;
    on = (show && inZones(showZones, c)) || ((on || !show) && inZones(zones, c));
    return on;
  };
  const mats = ['inMat', 'ceilMat', 'floorLit', 'mouthMat', 'mouthFloor', 'stairMat'].map((k) => [lit[k], lit[k].emissiveIntensity]);
  const lamp = lit.lampMat.color.clone();
  let k = -1;
  const set = (v) => {
    k = v;
    for (const [m, e] of mats) m.emissiveIntensity = e * v;
    lit.lampMat.color.copy(lamp).multiplyScalar(v);
  };
  set(0);
  return {
    update(f) {
      if (!f.cam) return;
      const want = inside(f.cam, f.house ?? 1) ? 1 : 0;
      if (want === k) return;
      const step = Math.min(1, (f.dt ?? 1 / 60) * 5);
      set(Math.abs(want - k) < 0.02 ? want : k + (want - k) * step);
    },
  };
}

// The concourses and the tunnels to them, closed in and lit: the walls round
// them (pale and lit on the inside, the building's own on the outside), the
// ceilings, the underside of the stands over them lined, the floors under the
// lights, and the lights themselves in lines along the way.
// Rails and walls come from a raster's outline: along a slanted or curved
// edge they run as a staircase, long runs joined by jogs a cell long, each
// jog a panel of its own facing another way. Join the segments that meet end
// to end at the same heights into runs, and draw each run again within
// `tol` of it (Douglas-Peucker), so a straight edge is one panel and a
// curve a chain of chords, with no jog left in it.
export function smoothRuns(segs, tol = 0.14) {
  const key = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
  const hk = (s) => `${Math.round(s[4] * 50)},${Math.round(s[5] * 50)}`;
  const from = new Map(), to = new Map();
  segs.forEach((s, i) => { from.set(`${hk(s)}|${key(s[0], s[1])}`, i); to.set(`${hk(s)}|${key(s[2], s[3])}`, i); });
  const used = new Uint8Array(segs.length), out = [];
  const dp = (P) => {
    if (P.length < 3) return P;
    const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
    const st = [[0, P.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); const [ax, az] = P[a], [bx, bz] = P[b];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1e-9;
      let m = -1, md = tol;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i][0] - ax) * dz - (P[i][1] - az) * dx) / l; if (d > md) { md = d; m = i; } }
      if (m >= 0) { keep[m] = 1; st.push([a, m], [m, b]); }
    }
    return P.filter((_, i) => keep[i]);
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    // walk back to the start of this run, then forward along it
    let s0 = i, guard = 0;
    while (guard++ < segs.length) { const j = to.get(`${hk(segs[s0])}|${key(segs[s0][0], segs[s0][1])}`); if (j === undefined || used[j] || j === i) break; s0 = j; if (s0 === i) break; }
    const P = [[segs[s0][0], segs[s0][1]]]; let c = s0; const h = [segs[s0][4], segs[s0][5]];
    while (c !== undefined && !used[c]) {
      used[c] = 1; P.push([segs[c][2], segs[c][3]]);
      c = from.get(`${hk(segs[c])}|${key(segs[c][2], segs[c][3])}`);
    }
    const Q = dp(P);
    for (let k = 0; k + 1 < Q.length; k++) out.push([Q[k][0], Q[k][1], Q[k + 1][0], Q[k + 1][1], h[0], h[1]]);
  }
  return out;
}

// A stand's rails climb its raked edges row by row: one flat piece per row,
// each a step up from the last — a staircase along what is one sloping
// rail. Chain the pieces that meet end to end (a step of a row or two
// between them), give each point along the chain its own height, and draw
// the chain again as straight sloping runs: [x0, z0, x1, z1, bottom0, top0,
// bottom1, top1] each.
export function slopedRuns(segs, { step = 0.75, tol = 0.14, ytol = 0.12 } = {}) {
  const key = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
  const from = new Map(), to = new Map();
  segs.forEach((s, i) => {
    const kf = key(s[0], s[1]), kt = key(s[2], s[3]);
    if (!from.has(kf)) from.set(kf, []); from.get(kf).push(i);
    if (!to.has(kt)) to.set(kt, []); to.get(kt).push(i);
  });
  // pieces at one height chain round any bend; pieces a step apart only
  // straight on (a raked edge), not round a notch
  const near = (a, b) => {
    const same = Math.abs(a[4] - b[4]) < 1e-3 && Math.abs(a[5] - b[5]) < 1e-3;
    if (same) return true;
    if (Math.abs(a[4] - b[4]) > step || Math.abs(a[5] - b[5]) > step) return false;
    const ax = a[2] - a[0], az = a[3] - a[1], bx = b[2] - b[0], bz = b[3] - b[1];
    return (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1) > 0.9;
  };
  const used = new Uint8Array(segs.length), out = [];
  const nextOf = (i) => (from.get(key(segs[i][2], segs[i][3])) || []).find((j) => !used[j] && near(segs[i], segs[j]));
  const prevOf = (i) => (to.get(key(segs[i][0], segs[i][1])) || []).find((j) => !used[j] && near(segs[i], segs[j]));
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    let s0 = i, g = 0;
    while (g++ < segs.length) { const j = prevOf(s0); if (j === undefined || j === i) break; used[s0] = 1; s0 = j; }
    for (let k = 0; k < segs.length; k++) if (used[k] === 1 && k !== i) { /* reset the walk-back marks */ }
    // walk forward from the chain's start
    const chain = []; let c = s0; const seen = new Set();
    used[s0] = 0;
    while (c !== undefined && !seen.has(c)) { seen.add(c); used[c] = 2; chain.push(segs[c]); c = nextOf(c); }
    // points with heights: each segment's middle carries its own; the
    // chain's ends and joints take their neighbours'
    const P = [[chain[0][0], chain[0][1]]];
    let L = 0; const T = [0], Y = [];
    for (const sg of chain) { L += Math.hypot(sg[2] - sg[0], sg[3] - sg[1]); P.push([sg[2], sg[3]]); T.push(L); }
    const flat = chain.every((sg) => Math.abs(sg[4] - chain[0][4]) < 1e-3 && Math.abs(sg[5] - chain[0][5]) < 1e-3);
    // heights at the segments' middles, eased along the chain
    const mids = chain.map((sg, k) => [(T[k] + T[k + 1]) / 2, sg[4], sg[5]]);
    const at = (t) => {
      if (flat || mids.length === 1) return [chain[0][4], chain[0][5]];
      if (t <= mids[0][0]) return [mids[0][1], mids[0][2]];
      if (t >= mids[mids.length - 1][0]) return [mids[mids.length - 1][1], mids[mids.length - 1][2]];
      let k = 0; while (mids[k + 1][0] < t) k++;
      const f = (t - mids[k][0]) / (mids[k + 1][0] - mids[k][0] || 1);
      return [mids[k][1] + (mids[k + 1][1] - mids[k][1]) * f, mids[k][2] + (mids[k + 1][2] - mids[k][2]) * f];
    };
    for (const t of T) Y.push(at(t));
    // Douglas-Peucker over plan and height together
    const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
    const st = [[0, P.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let m = -1, md = 0;
      for (let j = a + 1; j < b; j++) {
        const f = (T[j] - T[a]) / (T[b] - T[a] || 1);
        const px = P[a][0] + (P[b][0] - P[a][0]) * f, pz = P[a][1] + (P[b][1] - P[a][1]) * f;
        const dxy = Math.hypot(P[j][0] - px, P[j][1] - pz) / tol;
        const dy = Math.abs(Y[j][1] - (Y[a][1] + (Y[b][1] - Y[a][1]) * f)) / ytol;
        const dd = Math.max(dxy, dy);
        if (dd > 1 && dd > md) { md = dd; m = j; }
      }
      if (m >= 0) { keep[m] = 1; st.push([a, m], [m, b]); }
    }
    const idx = []; for (let j = 0; j < P.length; j++) if (keep[j]) idx.push(j);
    for (let k = 0; k + 1 < idx.length; k++) {
      const a = idx[k], b = idx[k + 1];
      out.push([P[a][0], P[a][1], P[b][0], P[b][1], Y[a][0], Y[a][1], Y[b][0], Y[b][1]]);
    }
  }
  return out;
}

// A closed outline traced off a raster (a building's outer wall) carries the
// raster's jitter: smooth it along its length (a Gaussian over `sig` metres,
// resampled every 0.5 m) and draw it again within `tol` of the smoothed line.
export function smoothRing(ring, { sig = 2.5, tol = 0.08 } = {}) {
  const n = ring.length;
  if (n < 8) return ring;
  const T = [0];
  for (let i = 0; i < n; i++) { const [a, b] = [ring[i], ring[(i + 1) % n]]; T.push(T[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = T[n], m = Math.max(16, Math.round(L / 0.5)), P = [];
  let k = 0;
  for (let j = 0; j < m; j++) {
    const t = (j / m) * L; while (T[k + 1] < t) k++;
    const f = (t - T[k]) / (T[k + 1] - T[k] || 1), a = ring[k], b = ring[(k + 1) % n];
    P.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  const h = Math.max(1, Math.round((sig / 0.5) * 3)), w = [];
  for (let d = -h; d <= h; d++) w.push(Math.exp(-0.5 * (d * 0.5 / sig) ** 2));
  const ws = w.reduce((a, b) => a + b, 0);
  const S = P.map((_, j) => { let x = 0, z = 0; for (let d = -h; d <= h; d++) { const q = P[(j + d + m) % m]; x += q[0] * w[d + h]; z += q[1] * w[d + h]; } return [x / ws, z / ws]; });
  // Douglas-Peucker, closed: split at the two farthest-apart points
  const dp = (Q) => {
    const keep = new Uint8Array(Q.length); keep[0] = keep[Q.length - 1] = 1; const st = [[0, Q.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); const [ax, az] = Q[a], [bx, bz] = Q[b]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1e-9;
      let mi = -1, md = tol;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((Q[i][0] - ax) * dz - (Q[i][1] - az) * dx) / l; if (d > md) { md = d; mi = i; } }
      if (mi >= 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return Q.filter((_, i) => keep[i]);
  };
  const half = Math.floor(m / 2);
  const A = dp(S.slice(0, half + 1)), B = dp(S.slice(half).concat([S[0]]));
  return A.slice(0, -1).concat(B.slice(0, -1));
}

// A partition with thickness: the panel [x0, z0, x1, z1, ya0, ya1, yb0, yb1] (its bottom and top at each end)
// as a solid box `T` thick towards its right (running x0,z0 -> x1,z1), a face each side, the top and the two ends
// (every face its own flat normal).
export function thickPanel(P, N, [x0, z0, x1, z1, ya0, ya1, yb0, yb1], T) {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
  const nx = (dz / l) * T, nz = (-dx / l) * T;
  const a0 = [x0, ya0, z0], a1 = [x0, ya1, z0], b0 = [x1, yb0, z1], b1 = [x1, yb1, z1];
  const o = (v) => [v[0] + nx, v[1], v[2] + nz];
  const quad = (p, q, r, s_) => {
    // flat normal facing away from the box's middle (the outer face's normal is the panel's right, the inner its left)
    const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [s_[0] - p[0], s_[1] - p[1], s_[2] - p[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = [(p[0] + r[0]) / 2 - (x0 + x1 + nx) / 2, (p[1] + r[1]) / 2 - (ya0 + ya1 + yb0 + yb1) / 4, (p[2] + r[2]) / 2 - (z0 + z1 + nz) / 2];
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) { n = n.map((v) => -v); [q, s_] = [s_, q]; }
    const m = Math.hypot(...n) || 1;
    for (const v of [p, q, r, p, r, s_]) { P.push(...v); N.push(n[0] / m, n[1] / m, n[2] / m); }
  };
  quad(a0, b0, b1, a1);                              // the face towards the pit
  quad(o(a0), o(b0), o(b1), o(a1));                  // the outer face
  quad(a1, b1, o(b1), o(a1));                        // the top
  quad(a0, a1, o(a1), o(a0));                        // the ends
  quad(b0, b1, o(b1), o(b0));
}

// A thin steel fence along a run [x0, z0, x1, z1, ya0, ya1, yb0, yb1] (its bottom and its top at each end, as `slopedRuns` lays
// a raked edge): square posts about every `gap` metres (standing `sink` into the tread) and three bars along it, parallel to
// its slope, see-through between. Every face its own flat normal.
export function fenceRun(P, N, [x0, z0, x1, z1, ya0, ya1, yb0, yb1], { gap = 1.5, post = 0.05, bar = 0.032, sink = 0.15, at = [0.36, 0.68, 0.97] } = {}) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 0.05) return;
  const u = [-dz / L, 0, dx / L];                                   // across the run, level
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const beam = (a, b, wu, wv) => {
    const d = sub(b, a);
    let v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]; const vl = Math.hypot(...v) || 1; v = v.map((c) => c / vl);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ring = (c) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([su, sv]) => [c[0] + u[0] * su * wu / 2 + v[0] * sv * wv / 2, c[1] + u[1] * su * wu / 2 + v[1] * sv * wv / 2, c[2] + u[2] * su * wu / 2 + v[2] * sv * wv / 2]);
    const A = ring(a), B = ring(b);
    const quad = (p, q, r, s_) => {
      const e1 = sub(q, p), e2 = sub(s_, p);
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const c = [(p[0] + r[0]) / 2 - mid[0], (p[1] + r[1]) / 2 - mid[1], (p[2] + r[2]) / 2 - mid[2]];
      if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) n = n.map((c_) => -c_);
      const m = Math.hypot(...n) || 1;
      for (const w of [p, q, r, p, r, s_]) { P.push(...w); N.push(n[0] / m, n[1] / m, n[2] / m); }
    };
    for (let i = 0; i < 4; i++) quad(A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i]);
    quad(A[0], A[1], A[2], A[3]); quad(B[0], B[1], B[2], B[3]);
  };
  const k = Math.max(1, Math.ceil(L / gap));
  for (let i = 0; i <= k; i++) {
    const t = i / k, x = x0 + dx * t, z = z0 + dz * t;
    beam([x, ya0 + (yb0 - ya0) * t - sink, z], [x, ya1 + (yb1 - ya1) * t, z], post, post);
  }
  for (const f of at) beam([x0, ya0 + (ya1 - ya0) * f, z0], [x1, yb0 + (yb1 - yb0) * f, z1], f > 0.9 ? post : bar, f > 0.9 ? 0.04 : bar);
}

// Thin vertical panels laid end to end (a rail, a wall round a curve) each
// carry their own facing; where two meet at a gentle bend they share one, so
// the run shades as one smooth surface rather than a row of facets.
export function weldNormals(P, N, crease = 35) {
  const c = Math.cos(crease * DEG), groups = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const k = `${Math.round(P[i] * 50)},${Math.round(P[i + 1] * 50)},${Math.round(P[i + 2] * 50)}`;
    let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(i);
  }
  const out = N.slice();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    for (const i of idx) {
      let x = 0, z = 0;
      for (const j of idx) if (N[i] * N[j] + N[i + 2] * N[j + 2] > c) { x += N[j]; z += N[j + 2]; }
      const l = Math.hypot(x, z) || 1; out[i] = x / l; out[i + 2] = z / l;
    }
  }
  return out;
}

export function buildRooms(R, { ox, oz, shapeOf, structMat, wallMat, lit: M }) {
  const g = new THREE.Group();
  const { inMat, ceilMat, floorLit } = M;
  const outMat = wallMat.clone(); outMat.side = THREE.FrontSide;
  // walls: the front of each faces the room
  const inP = [], inN = [], outP = [], outN = [];
  const quad = (P, N, x0, z0, x1, z1, y0, y1) => {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y0, z0], [x1, y1, z1], [x0, y1, z0]]) { P.push(x + ox, y, z + oz); N.push(nx, 0, nz); }
  };
  // A flat cap across a wall's thickness, at height y, facing up or down.
  const cap = (P, N, a, b, c, d, y, ny) => {
    for (const [x, z] of ny > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d]) { P.push(x + ox, y, z + oz); N.push(0, ny, 0); }
  };
  // `R.thick` (m): the concourse walls stand this thick, into the room, their
  // outer faces where they were. Each run's inner face is mitred where it meets
  // the next, and a run's free ends (the jambs of the openings), its top and its
  // underside (a lintel's) are closed. Too short a panel (the risers lining the
  // stands over the room) stays a sheet, as does `R.thinWalls`, the walls of
  // the narrow tunnels and the stairs' shafts.
  const T = R.thick ?? 0, MIN_THICK = 1.2;
  const runs = smoothRuns(R.walls, 0.1);
  const hk = (s) => `${Math.round(s[4] * 50)},${Math.round(s[5] * 50)}`;
  const pk = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
  const nOf = (s) => { const dx = s[2] - s[0], dz = s[3] - s[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
  const starts = new Map(), ends = new Map();
  runs.forEach((s) => { starts.set(`${hk(s)}|${pk(s[0], s[1])}`, s); ends.set(`${hk(s)}|${pk(s[2], s[3])}`, s); });
  // the offset at a join: along the bisector, or null where there is no join to mitre (a free end, or a corner too sharp)
  const mitre = (n, o) => {
    if (!o) return null;
    const m = nOf(o), dot = n[0] * m[0] + n[1] * m[1];
    if (dot < 0.2) return null;
    const bx = n[0] + m[0], bz = n[1] + m[1], bl = Math.hypot(bx, bz) || 1, k = 1 / Math.max(0.5, (bx / bl) * n[0] + (bz / bl) * n[1]);
    return [(bx / bl) * k, (bz / bl) * k];
  };
  for (const s of runs) {
    const [x0, z0, x1, z1, y0, y1] = s;
    if (!(T > 0) || y1 - y0 < MIN_THICK) {
      quad(inP, inN, x0, z0, x1, z1, y0, y1);
      quad(outP, outN, x1, z1, x0, z0, y0, y1);
      continue;
    }
    const n = nOf(s), h = hk(s);
    const m0 = mitre(n, ends.get(`${h}|${pk(x0, z0)}`)), m1 = mitre(n, starts.get(`${h}|${pk(x1, z1)}`));
    const [ax, az] = m0 ?? n, [bx, bz] = m1 ?? n;
    const ix0 = x0 + ax * T, iz0 = z0 + az * T, ix1 = x1 + bx * T, iz1 = z1 + bz * T;
    quad(inP, inN, ix0, iz0, ix1, iz1, y0, y1);
    quad(outP, outN, x1, z1, x0, z0, y0, y1);
    if (!m0) quad(inP, inN, x0, z0, ix0, iz0, y0, y1);
    if (!m1) quad(inP, inN, ix1, iz1, x1, z1, y0, y1);
    const A = [x0, z0], B = [x1, z1], C = [ix1, iz1], D = [ix0, iz0];
    cap(outP, outN, A, B, C, D, y1, 1);
    cap(inP, inN, A, B, C, D, y0, -1);
  }
  for (const [x0, z0, x1, z1, y0, y1] of smoothRuns(R.thinWalls ?? [], 0.1)) {
    quad(inP, inN, x0, z0, x1, z1, y0, y1);
    quad(outP, outN, x1, z1, x0, z0, y0, y1);
  }
  const mk = (P, N) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N.length === P.length && N !== P ? weldNormals(P, N) : N, 3)); return geo; };
  if (inP.length) { g.add(new THREE.Mesh(mk(inP, inN), inMat)); g.add(new THREE.Mesh(mk(outP, outN), outMat)); }
  // horizontal sheets, facing up or down
  const sheet = (polys, y, down) => {
    const geo = new THREE.ShapeGeometry(shapeOf(polys), 1);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    const f = geo.index ? geo.toNonIndexed() : geo;
    if (down) {
      const p = f.attributes.position.array, n = f.attributes.normal.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      for (let i = 1; i < n.length; i += 3) n[i] = -1;
    }
    return f;
  };
  const under = [], over = [], litF = [];
  for (const c of R.ceils) for (const polys of c.polys) { under.push(sheet(polys, c.y, true)); over.push(sheet(polys, c.y + 0.02, false)); }
  for (const s of R.soffits) for (const polys of s.polys) under.push(sheet(polys, s.y, true));
  for (const f of R.lit) for (const polys of f.polys) litF.push(sheet(polys, f.y + 0.012, false));
  if (under.length) { const m = new THREE.Mesh(mergeGeometries(under), ceilMat); m.userData.noCollide = true; g.add(m); }
  if (over.length) { const m = new THREE.Mesh(mergeGeometries(over), structMat); m.userData.noCollide = true; g.add(m); }
  if (litF.length) { const m = new THREE.Mesh(mergeGeometries(litF), floorLit); m.receiveShadow = true; g.add(m); }
  // the lights: long fittings, along the way
  if (R.lamps.length) {
    const P = [], N = [];
    for (const [x, y, z, yaw] of R.lamps) {
      const ux = Math.cos(yaw), uz = -Math.sin(yaw);       // along the corridor
      const vx = Math.sin(yaw), vz = Math.cos(yaw);        // across it
      const a = 0.9, b = 0.14;
      const c = [[-a, -b], [a, -b], [a, b], [-a, b]].map(([s, t]) => [x + ox + ux * s + vx * t, z + oz + uz * s + vz * t]);
      for (const k of [0, 2, 1, 0, 3, 2]) { P.push(c[k][0], y, c[k][1]); N.push(0, -1, 0); }
    }
    const m = new THREE.Mesh(mk(P, N), M.lampMat);
    m.userData.noCollide = true;
    g.add(m);
  }
  return g;
}

// Tunnels at floor level out under a stand (a stadium's corner tunnels, an
// arena floor's corner passages): an open cut through the rows too low to
// pass under, walled either side a rail's height above the rows beside it,
// then on under the rows above, walled, roofed and lit; closed at its end
// by doors when it leads to rooms not drawn here.
export function buildTunnels(data, ox, oz) {
  const g = new THREE.Group();
  const tunnelGeo = { wall: [], floor: [], lamp: [], metal: [] }, wire = [];
  const h1 = data.levels[0].h0;
  for (const t of data.tunnels || []) {
    const [ux, uz] = t.u, vx = -uz, vz = ux, yaw = Math.atan2(ux, uz);
    const at = (a, b) => [t.p[0] + ox + ux * a + vx * b, t.p[1] + oz + uz * a + vz * b];
    const box = (out, a0, a1, b0, b1, y0, y1) => {
      const bx = new THREE.BoxGeometry(Math.abs(b1 - b0), y1 - y0, a1 - a0);
      bx.rotateY(yaw); const [x, z] = at((a0 + a1) / 2, (b0 + b1) / 2); bx.translate(x, (y0 + y1) / 2, z); out.push(bx.toNonIndexed());
    };
    // a wall along the cut, its top raked with the rows: (a, y) extruded across
    const raked = (s0, s1, pts) => {
      const ex = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a_, y]) => new THREE.Vector2(a_, y))), { depth: s1 - s0, bevelEnabled: false });
      const [ox_, oz_] = at(0, s0);
      ex.applyMatrix4(new THREE.Matrix4().makeBasis(V3(ux, 0, uz), V3(0, 1, 0), V3(vx, 0, vz)).setPosition(ox_, 0, oz_));
      tunnelGeo.wall.push(ex.toNonIndexed());
    };
    const hw = t.w / 2, T = t.T ?? 0.3;
    if (t.covered) {
      // covered from its mouth: the same wall either side, the whole way, a
      // flat roof under the deck and the rows over it
      for (const sg of [-1, 1]) box(tunnelGeo.wall, -0.3, t.L, sg > 0 ? hw - T : -hw - 0.12, sg > 0 ? hw + 0.12 : -hw + T, 0, t.h + 0.02);
      box(tunnelGeo.wall, -0.3, t.L, -hw - 0.12, hw + 0.12, t.h - 0.02, t.h + 0.12);
    } else {
      // the cut's side walls: a rail's height over the rows beside them
      const cut = (prof) => (prof?.length > 1
        ? [[prof[0][0], 0], [prof[prof.length - 1][0], 0], ...prof.slice().reverse()]
        : [[-0.4, 0], [t.deck, 0], [t.deck, t.deckY + 1.0], [-0.4, h1 + 1.0]]);
      // (or a venue draws them itself, thick and coped like its bowls' walls: data.cutWalls)
      if (!t.sidesAsWalls) { raked(hw - T, hw + 0.12, cut(t.sides?.[1])); raked(-hw - 0.12, -hw + T, cut(t.sides?.[0])); }
      // (the walls drawn by the venue end in a face of their own at `deck`: the side walls on under the rows begin a hair beyond it)
      // `deck2`: the mouth's two sides, where the row over it crosses each
      // wall, so that the portal's head follows that row rather than cutting
      // square across it; the roof is laid in strips between them
      const [d0, d1] = t.deck2 ?? [t.deck, t.deck];
      for (const sg of [-1, 1]) box(tunnelGeo.wall, (sg > 0 ? d1 : d0) + (t.sidesAsWalls ? 0.02 : 0), t.L, sg > 0 ? hw - T : -hw - 0.12, sg > 0 ? hw + 0.12 : -hw + T, 0, t.h + 0.02);
      for (let k = 0; k < 24; k++) {
        const b0 = -hw + (2 * hw * k) / 24, b1 = -hw + (2 * hw * (k + 1)) / 24;
        box(tunnelGeo.wall, d0 + (d1 - d0) * ((b0 + b1) / 2 + hw) / (2 * hw) - 0.05, t.L, b0, b1, t.h - 0.02, t.h + 0.12);   // the roof on under the rows
      }
    }
    box(tunnelGeo.floor, -0.4, t.L + (t.closed ? 0 : 12), -hw - 0.3, hw + 0.3, -0.02, 0.04);
    if (t.closed) box(tunnelGeo.wall, t.L - 0.3, t.L, -hw, hw, 0, t.h);      // its doors, shut
    for (let a = (t.covered ? 1.0 : Math.max(t.deck2?.[0] ?? t.deck, t.deck2?.[1] ?? t.deck) + 1.5); a < t.L; a += 6) box(tunnelGeo.lamp, a, a + 1.4, -0.12, 0.12, t.h - 0.08, t.h - 0.02);
    if (t.upperFence) {
      const { height = 1.05, postPitch = 1.4, meshPitch = 0.12 } = t.upperFence;
      const point = ([a, y, b]) => { const [x,z] = at(a,b); return V3(x,y,z); };
      const pipe = (a,b,r = 0.022) => {
        const pa=point(a),pb=point(b),d=pb.clone().sub(pa),len=d.length();
        if (len<0.001) return;
        const m=new THREE.CylinderGeometry(r,r,len,6);
        m.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0,1,0),d.normalize()));
        m.translate(...pa.add(pb).multiplyScalar(0.5).toArray()); tunnelGeo.metal.push(m.toNonIndexed());
      };
      const grid = (path) => {
        let distance = 0, nextPost = 0, nextWire = 0;
        for (let k=1;k<path.length;k++) {
          const a=path[k-1],b=path[k],len=Math.hypot(b[0]-a[0],b[2]-a[2]);
          const atDistance = (d,h=0) => { const f=Math.min(1,Math.max(0,(d-distance)/len));return [lerp(a[0],b[0],f),lerp(a[1],b[1],f)+h,lerp(a[2],b[2],f)]; };
          pipe(a,b,0.018); pipe([a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]]);
          for (;nextPost<=distance+len;nextPost+=postPitch) pipe(atDistance(nextPost),atDistance(nextPost,height),0.026);
          for (;nextWire<=distance+len;nextWire+=meshPitch) wire.push(...point(atDistance(nextWire)).toArray(),...point(atDistance(nextWire,height)).toArray());
          for (let h=meshPitch;h<height;h+=meshPitch) wire.push(...point([a[0],a[1]+h,a[2]]).toArray(),...point([b[0],b[1]+h,b[2]]).toArray());
          distance+=len;
        }
        const last=path[path.length-1];pipe(last,[last[0],last[1]+height,last[2]],0.026);
      };
      const paths=t.sides.map((profile,i) => profile.map(([a,y]) => [a,y,(i===0?-1:1)*(hw+0.02)]));
      paths.forEach(grid);
      if (!t.upperFence.openFront) grid([paths[0][0],paths[1][0]]);
      grid([paths[0][paths[0].length-1],paths[1][paths[1].length-1]]);
    }
  }
  if (tunnelGeo.wall.length) g.add(new THREE.Mesh(mergeGeometries(tunnelGeo.wall), std({ color: data.tunnelFinish?.wall ?? 0x4c4a47, roughness: 0.92 })));
  if (tunnelGeo.floor.length) g.add(new THREE.Mesh(mergeGeometries(tunnelGeo.floor), std({ color: data.tunnelFinish?.floor ?? 0x2c2c2e, roughness: 0.95 })));
  if (tunnelGeo.metal.length) g.add(new THREE.Mesh(mergeGeometries(tunnelGeo.metal), std({ color: 0x959a99, roughness: 0.96, metalness: 0.04, envMapIntensity: 0.08 })));
  if (wire.length) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(wire,3));
    const mesh=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x929b9d}));mesh.userData.noCollide=true;g.add(mesh);
  }
  if (tunnelGeo.lamp.length) g.add(new THREE.Mesh(mergeGeometries(tunnelGeo.lamp), new THREE.MeshBasicMaterial({ color: 0xfff2dc })));
  return g;
}

// The seat nearest (x, z) among `spots` ({ x, y, z }, y the tread it stands
// on), within `r` across, on the tread `y` is standing on or one a little
// below it (the next row down, from an aisle's half step), or null: what the
// walker sits down in. `below` is how far under its tread one may stand and
// still sit in it: next to nothing for a stand, so the floor in front of its
// first row is not a seat; more in a hall that is seats wall to wall, whose
// aisles step down beside the rows. Indexed in 2 m cells the first time it is
// asked, not when it is built.
export function seatFinder(spots, { below = 0.05 } = {}) {
  let cells = null;
  return (x, z, y, r = 0.9) => {
    if (!cells) {
      cells = new Map();
      for (const sp of spots) {
        const k = `${Math.floor(sp.x / 2)},${Math.floor(sp.z / 2)}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(sp);
      }
    }
    const cx = Math.floor(x / 2), cz = Math.floor(z / 2);
    let best = null, bd = r;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const sp of cells.get(`${cx + i},${cz + j}`) ?? []) {
        if (y < sp.y - below || y > sp.y + 0.5) continue;
        const d = Math.hypot(sp.x - x, sp.z - z);
        if (d < bd) { bd = d; best = sp; }
      }
    }
    return best;
  };
}

export function buildStands(data, {
  offset = V3(0, 0, 0), stage = V3(0, 2, 0), seatColors = {}, seatColor = 0x22262e,
  concreteTone = 0.22, concreteWarm = 0, concreteEven = 0, sold = () => true, occupancy = 0.97, seed = 5, roofY = 36, crowd = true,
  materials = {}, seatMesh = null, seatColorAt = null, tiers = null, wedges = null,
  seatKeep = null, byAisle = false, aisleFirst = false, sectors = null, sectorEven = 0, sectorFacing = 0, sectorJoin = null, sectorMin = 0.5, sectorWhole = 0.35, sectorBlocks = false, sectorPair = null, sectorOver = null, sectorSplitEnds = false, round = false,
}) {
  const g = new THREE.Group();
  const ox = offset.x, oz = offset.z;
  const edgeSeats = [];
  const rnd = prng(seed);
  const conc = withRepeat(concreteTex({ key: `standconc${concreteTone}:${concreteWarm}:${concreteEven}`, tone: concreteTone, warm: concreteWarm, even: concreteEven }), 1 / 3, 1 / 3);
  // a venue can dress it in its own materials (a hall's carpet and timber)
  const structMat = materials.struct ?? std({ ...conc, color: 0xffffff, roughness: 0.95 });
  const floorMat = materials.floor ?? std({ color: 0x3a3b3e, roughness: 0.9 });
  const wallMat = materials.wall ?? std({ color: 0x2a2b30, roughness: 0.85, side: THREE.DoubleSide });
  const railMat = materials.rail ?? std({ color: 0x15161a, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  // where the concourses are closed in, they and the ways to them are lit
  const lit = data.rooms ? roomMaterials(materials) : null;

  // a prism: an outline (with holes) standing from y0 to y1
  const shapeOf = (polys) => {
    const s = new THREE.Shape(polys[0].map(([x, z]) => new THREE.Vector2(x + ox, -(z + oz))));
    for (const h of polys.slice(1)) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x + ox, -(z + oz)))));
    return s;
  };
  // Its top and underside are the outline's triangulation; its sides a strip
  // round each ring, shaded smooth along a curve and sharp at a corner, the
  // texture running on unbroken along it (faces shaded one by one, the
  // texture starting afresh on each, show a curved front as a row of facets).
  const prism = (polys, y0, y1, out) => {
    if (y1 - y0 < 0.01) return;
    const cap = new THREE.ShapeGeometry(shapeOf(polys), 1);
    cap.rotateX(-Math.PI / 2);
    const top = cap.toNonIndexed(); top.translate(0, y1, 0);
    const bot = cap.toNonIndexed(); bot.translate(0, y0, 0);
    {
      const p = bot.attributes.position.array, n = bot.attributes.normal.array, u = bot.attributes.uv.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      for (let i = 0; i < u.length; i += 6) for (let k = 0; k < 2; k++) { const t = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = t; }
      for (let i = 1; i < n.length; i += 3) n[i] = -1;
    }
    out.push(top, bot);
    const P = [], N = [], U = [];
    const cosCrease = Math.cos(35 * DEG);
    polys.forEach((ring0, ri) => {
      let ring = ring0.map(([x, z]) => [x + ox, z + oz]);
      if (ring.length > 2 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1e-6) ring = ring.slice(0, -1);
      const n = ring.length;
      if (n < 3) return;
      let A = 0;
      for (let i = 0; i < n; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n]; A += x0 * z1 - x1 * z0; }
      // the side of each edge away from the solid: out of the outline, into a hole
      const sg = (ri === 0 ? 1 : -1) * (A > 0 ? 1 : -1);
      const en = [], el = [];
      for (let i = 0; i < n; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1e-9;
        en.push([sg * dz / l, -sg * dx / l]); el.push(l);
      }
      // each corner's normal from the ring's direction over a metre either
      // side of it (the traced outline wobbles by a few centimetres, which
      // shaded edge by edge shows as stripes); where the ring turns within
      // that metre, a corner, each face keeps its own side's direction
      const cum = [0]; for (let i = 0; i < n; i++) cum.push(cum[i] + el[i]);
      const per = cum[n];
      const at = (t) => {
        t = ((t % per) + per) % per;
        let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= t) lo = m; else hi = m; }
        const f = el[lo] > 0 ? (t - cum[lo]) / el[lo] : 0, [x0, z0] = ring[lo], [x1, z1] = ring[(lo + 1) % n];
        return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
      };
      const W = Math.min(1.0, per / 8);
      const nrm = (dx, dz) => { const l = Math.hypot(dx, dz) || 1e-9; return [sg * dz / l, -sg * dx / l]; };
      const vnB = [], vnA = [];
      for (let i = 0; i < n; i++) {
        const p = ring[i], a = at(cum[i] - W), b = at(cum[i] + W);
        const ta = [p[0] - a[0], p[1] - a[1]], tb = [b[0] - p[0], b[1] - p[1]];
        const la = Math.hypot(...ta) || 1e-9, lb = Math.hypot(...tb) || 1e-9;
        if ((ta[0] * tb[0] + ta[1] * tb[1]) / (la * lb) < cosCrease) { vnB.push(nrm(...ta)); vnA.push(nrm(...tb)); }
        else { const q = nrm(b[0] - a[0], b[1] - a[1]); vnB.push(q); vnA.push(q); }
      }
      // the face after corner i takes vnA[i]; the face before corner j, vnB[j]
      const vn = (i, e) => (e === i ? vnA[i] : vnB[i]);
      let s0 = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [ax, az] = ring[i], [bx, bz] = ring[j];
        const na = vn(i, i), nb = vn(j, i), s1 = s0 + el[i];
        const a0 = [ax, y0, az, na, s0], a1 = [ax, y1, az, na, s0], b0 = [bx, y0, bz, nb, s1], b1 = [bx, y1, bz, nb, s1];
        const tri = sg > 0 ? [a0, b1, b0, a0, a1, b1] : [a0, b0, b1, a0, b1, a1];
        for (const [x, y, z, nn, uu] of tri) { P.push(x, y, z); N.push(nn[0], 0, nn[1]); U.push(uu, y); }
        s0 = s1;
      }
    });
    if (P.length) {
      const side = new THREE.BufferGeometry();
      side.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      side.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      side.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      out.push(side);
    }
  };
  const flat = (polys, y, out) => {
    const geo = new THREE.ShapeGeometry(shapeOf(polys), 1);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    out.push(geo.index ? geo.toNonIndexed() : geo);
  };
  // thin vertical panels, merged: rails, walls, tunnel sides
  const panels = { rail: [[], []], wall: [[], []], mouth: [[], []], own: [[], []] };
  const panel4 = (kind, x0, z0, x1, z1, ya0, ya1, yb0, yb1) => {
    const [p, n] = panels[kind];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const a = [x0 + ox, z0 + oz], b = [x1 + ox, z1 + oz];
    for (const [x, y, z] of [[a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], ya0, a[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]]]) { p.push(x, y, z); n.push(nx, 0, nz); }
  };
  const panel = (kind, x0, z0, x1, z1, y0, y1) => {
    const [p, n] = panels[kind];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;            // the triangles' own facing, so both sides light true
    const a = [x0 + ox, z0 + oz], b = [x1 + ox, z1 + oz];
    for (const [x, y, z] of [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]]) { p.push(x, y, z); n.push(nx, 0, nz); }
  };
  const mkPanels = ([p, n]) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(weldNormals(p, n), 3)); return geo; };

  const people = [], aisleLights = [], seatSpots = [];
  const levelBlocks = [];
  const fenceP = [], fenceN = [];
  const solid = [], floors = [], stairs = [], mouthFloors = [];
  const voms = { pit: [], cap: [], tunnel: [], floor: [], ceil: [], lamps: [], signs: [] };
  for (const L of data.levels) {
    const levelGeo = [], stepGeo = materials.step ? [] : levelGeo;     // (a venue's aisles in their own finish: materials.step)
    for (const row of L.rows) for (const polys of row.polys) prism(polys, row.y0, row.y, levelGeo);
    // the half steps up the aisles
    for (const st of L.steps) {
      prism(st.polys, st.y0, st.y, stepGeo);
      const c = st.polys[0].reduce((a, [x, z]) => [a[0] + x, a[1] + z], [0, 0]).map((v) => v / st.polys[0].length);
      // (a step can go unlit: `light: false`, to keep a level's many half steps to a reasonable count of lights)
      if (st.light !== false) aisleLights.push({ x: c[0] + ox, y: st.y0 + 0.04, z: c[1] + oz });
    }
    // tunnel mouths: a floor, and walls up past the treads round them, left
    // open where the rows above leave headroom (the way through to the concourse)
    for (const h of L.holes) {
      flat([h.ring], h.floor, lit ? mouthFloors : floors);
      const n = h.ring.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (h.open[i] && h.open[j]) continue;
        const [x0, z0] = h.ring[i], [x1, z1] = h.ring[j];
        panel(lit ? 'mouth' : 'wall', x0, z0, x1, z1, h.floor, Math.max(h.tops[i], h.tops[j]) + 0.95);
      }
    }
    for (const l of L.name === 'B' ? data.gateLamps || [] : []) voms.lamps.push([l.x + ox, l.y, l.z + oz, l.yaw]);
    for (const v of L.voms || []) {
      const p = vomParts(v, ox, oz, !!data.structureRevision);
      voms.pit.push(...p.pit); voms.cap.push(...p.cap); voms.tunnel.push(...p.tunnel);
      voms.floor.push(...p.floor); voms.ceil.push(...p.ceil); voms.lamps.push(...p.lamps); voms.signs.push(...p.signs);
    }
    // a level can have its own front (a VIP balcony's dark mesh), and the
    // low partitions between its boxes
    const own = materials.levelRail?.[L.name];
    for (const [x0, z0, x1, z1, ya0, ya1, yb0, yb1] of slopedRuns(L.rails)) panel4(own ? 'own' : 'rail', x0, z0, x1, z1, ya0, ya1, yb0, yb1);
    // thin steel fences (the end faces of a floor corner's funnel): posts and bars, see-through
    for (const [x0, z0, x1, z1, ya0, ya1, yb0, yb1] of slopedRuns(L.fences ?? [])) fenceRun(fenceP, fenceN, [x0 + ox, z0 + oz, x1 + ox, z1 + oz, ya0, ya1, yb0, yb1]);
    if (own && panels.own[0].length) { g.add(new THREE.Mesh(mkPanels(panels.own), own)); panels.own = [[], []]; }
    // the partitions beside a gate's pit and its stairs' cuts: solid, `gateRailT` thick
    if (L.gateRails?.length) {
      const gp = [], gn = [];
      const r6 = [];
      for (const r of L.gateRails) {
        if (r.length === 8) thickPanel(gp, gn, [r[0] + ox, r[1] + oz, r[2] + ox, r[3] + oz, r[4], r[5], r[6], r[7]], L.gateRailT ?? 0.25);
        else r6.push([r[0] + ox, r[1] + oz, r[2] + ox, r[3] + oz, r[4], r[5]]);
      }
      for (const r of slopedRuns(r6)) thickPanel(gp, gn, r, L.gateRailT ?? 0.25);
      if (gp.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3));
        const m = new THREE.Mesh(geo, railMat); m.receiveShadow = true; g.add(m);
      }
    }
    if (L.partitions?.length) {
      const pp = [];
      for (const [x0, z0, x1, z1, y0, y1] of L.partitions) {
        const len = Math.hypot(x1 - x0, z1 - z0), b = new THREE.BoxGeometry(0.06, y1 - y0, len);
        b.rotateY(Math.atan2(x1 - x0, z1 - z0)); b.translate((x0 + x1) / 2 + ox, (y0 + y1) / 2, (z0 + z1) / 2 + oz); pp.push(b.toNonIndexed());
      }
      g.add(new THREE.Mesh(mergeGeometries(pp), materials.partition ?? std({ color: 0x1a1b1f, roughness: 0.6, metalness: 0.3 })));
    }
    // A venue can finish its box walls, steps and tier structure separately.
    const ownWall = materials.levelWall?.[L.name];
    for (const [x0, z0, x1, z1, y0, y1] of smoothRuns(L.walls)) panel(ownWall ? 'own' : 'wall', x0, z0, x1, z1, y0, y1);
    if (ownWall && panels.own[0].length) { g.add(new THREE.Mesh(mkPanels(panels.own), ownWall)); panels.own = [[], []]; }
    if (stepGeo !== levelGeo && stepGeo.length) { const sm = new THREE.Mesh(mergeGeometries(stepGeo), materials.step); sm.receiveShadow = true; g.add(sm); }
    const mesh = new THREE.Mesh(mergeGeometries(levelGeo), materials.levelStruct?.[L.name] ?? structMat);
    mesh.receiveShadow = true;
    g.add(mesh);
    // the seats, and the crowd in the sold ones
    const col = seatColors[L.name] ?? seatColor;
    const spots = [], odd = new Map();
    const S = decodeSeats(L.seats), sk = L.seatScale ?? 10;      // (x, z in dm, or 1/seatScale m)
    const LB = L.labels ? decodeSeats(L.labels) : null;
    const bNames = data.blockNames || null;
    // the level's blocks, for the lightsticks' control
    const anchors = (L.voms || []).filter((v) => v.label).map((v) => ({ x: v.p[0] + ox, z: v.p[1] + oz, label: v.label }));
    // (the real blocks, where the seats are labelled with them)
    // (`aisleFirst`: the lightsticks' blocks by the aisles even where the seats are labelled with their real
    // blocks, whose edges are not always aisles: Wembley's Level 1 blocks meet between two seats)
    const blocks = !crowd ? null : LB && bNames && !aisleFirst ? labelBlocks(S, sk, ox, oz, LB) : byAisle ? aisleBlocks(S, sk, ox, oz, L.steps.map((st) => st.polys)) : seatBlocks(S, sk, ox, oz, stage, { anchors, tidy: !!tiers, wedges: wedges && { x: wedges.x + ox, z: wedges.z + oz } });
    if (blocks) levelBlocks.push({ count: blocks.count, ySum: 0, n: 0, name: L.name, at: new Map(), names: blocks.ids && bNames ? blocks.ids.map((b) => bNames[b]) : null });
    // (the seats of the levels that set the wedges: where each block's rows end)
    if (blocks && sectors?.includes(L.name)) for (let i = 0; i < S.length; i += 4) edgeSeats.push({ x: S[i] / sk + ox, z: S[i + 1] / sk + oz, row: S[i + 2], yaw: S[i + 3] * DEG, k: levelBlocks.length * 4096 + blocks.block[i / 4] });
    const lvRaw = levelBlocks.length - 1;
    for (let i = 0; i < S.length; i += 4) {
      const x = S[i] / sk + ox, z = S[i + 1] / sk + oz, yaw = S[i + 3] * DEG;
      const y = L.hs ? L.hs[Math.min(S[i + 2], L.hs.length - 1)] : L.h0 + L.rise * S[i + 2];
      // a venue can leave seats out (their treads stay)
      if (seatKeep && !seatKeep(L.name, x - ox, z - oz, S[i + 2])) continue;
      const lk = (i >> 2) * 3;
      const block = LB && bNames ? (bNames[LB[lk]] ?? L.name) : L.name;
      const row = LB ? LB[lk + 1] : S[i + 2] + 1;
      const num = LB ? LB[lk + 2] : (i >> 2) + 1;
      // a venue can pick out a row in another colour
      const c = seatColorAt ? seatColorAt(L.name, x - ox, z - oz, S[i + 2]) : null;
      if (c != null && c !== col) { if (!odd.has(c)) odd.set(c, []); odd.get(c).push({ x, y, z, yaw, block, row, num, level: L.name }); }
      else spots.push({ x, y, z, yaw, block, row, num, level: L.name });
      if (crowd && sold(x, z, L.name) && rnd() < occupancy) {
        const lb = levelBlocks[lvRaw]; lb.ySum += y; lb.n++;
        // (each block's middle, for its place round a floor made of several levels)
        const bk = blocks.block[i / 4], ba = lb.at.get(bk) || { x: 0, z: 0, n: 0 }; ba.x += x; ba.z += z; ba.n++; lb.at.set(bk, ba);
        people.push({ x: x - Math.sin(yaw) * 0.12, y, z: z - Math.cos(yaw) * 0.12, turn: Math.atan2(stage.x - x, stage.z - z), seat: true, lvRaw, block: blocks.block[i / 4] });
      }
    }
    seatSpots.push({ spots, col, padded: L.name === 'G' || L.name === 'C' });
    for (const [c, sp] of odd) seatSpots.push({ spots: sp, col: c, padded: L.name === 'G' || L.name === 'C' });
  }
  // concourses
  for (const f of data.floors) for (const polys of f.polys) {
    if (f.y0 <= 0.01) prism(polys, 0, f.y, solid);
    else { prism(polys, f.y0, f.y, solid); }
  }
  // stairs between them: a solid flight with a rail each side
  const openRails = [];
  for (const f of data.flights) {
    const { x, z, dx, dz, n, L, y0, y1 } = f;
    const run = L / n, w = f.w ?? 1.6;
    for (let i = 0; i < n; i++) {
      const b = new THREE.BoxGeometry(w, y0 + (y1 - y0) * (i + 1) / n - y0 + 0.01, run + (i === n - 1 && data.structureRevision ? 0.08 : 0.02));
      b.rotateY(Math.atan2(dx, dz));
      const cx = x + dx * run * (i + 0.5), cz = z + dz * run * (i + 0.5);
      b.translate(cx + ox, (y0 + (y0 + (y1 - y0) * (i + 1) / n)) / 2, cz + oz);
      (f.open ? solid : stairs).push(b.toNonIndexed());
    }
    for (const s of [-1, 1]) {
      const px = -dz * s * (w / 2 + 0.02), pz = dx * s * (w / 2 + 0.02);
      if (!f.open) {
        if (data.structureRevision) panel4('rail', x+px, z+pz, x+dx*L+px, z+dz*L+pz, y0, y0+1, y1, y1+1);
        else panel('rail', x+px, z+pz, x+dx*L+px, z+dz*L+pz, y0, y1+1);
        continue;
      }
      // out in the open (not in a concourse): a handrail up the slope
      const len = Math.hypot(L, y1 - y0), g = new THREE.BoxGeometry(0.05, 0.05, len);
      g.rotateX(-Math.atan2(y1 - y0, L)); g.rotateY(Math.atan2(dx, dz));
      g.translate(x + dx * L / 2 + px + ox, (y0 + y1) / 2 + 0.95, z + dz * L / 2 + pz + oz); openRails.push(g);
    }
  }
  if (openRails.length) g.add(new THREE.Mesh(mergeGeometries(openRails), std({ color: 0xa8acb2, roughness: 0.4, metalness: 0.7 })));
  if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid), structMat); m.receiveShadow = true; g.add(m); }
  // the stairs stand in the lit concourses: lit with them
  if (stairs.length) { const m = new THREE.Mesh(mergeGeometries(stairs), lit ? lit.stairMat : structMat); m.receiveShadow = true; g.add(m); }
  if (mouthFloors.length) g.add(new THREE.Mesh(mergeGeometries(mouthFloors), lit.mouthFloor));
  if (floors.length) g.add(new THREE.Mesh(mergeGeometries(floors), floorMat));
  // the building's outer wall, up to the roof (roofY a height, or the height
  // at a point of the stands' plan where the roof is not level)
  const roofAtXZ = typeof roofY === 'function' ? roofY : () => roofY;
  for (const polys of data.outer) {
    const ring = smoothRing(polys[0]);
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
      panel('wall', x0, z0, x1, z1, 0, roofAtXZ((x0 + x1) / 2, (z0 + z1) / 2));
    }
  }
  if (panels.wall[0].length) g.add(new THREE.Mesh(mkPanels(panels.wall), wallMat));
  if (panels.rail[0].length) g.add(new THREE.Mesh(mkPanels(panels.rail), railMat));
  if (fenceP.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(fenceP, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(fenceN, 3));
    const m = new THREE.Mesh(geo, railMat); m.receiveShadow = true; g.add(m);
  }
  if (panels.mouth[0].length) g.add(new THREE.Mesh(mkPanels(panels.mouth), lit.mouthMat));
  if (data.rooms) g.add(buildRooms(data.rooms, { ox, oz, shapeOf, structMat, wallMat, lit }));
  if (data.tunnels?.length) g.add(buildTunnels(data, ox, oz));
  // the vomitories
  const addMerged = (list, mat, collide = true) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.receiveShadow = true; if (!collide) m.userData.noCollide = true;
    g.add(m);
  };
  addMerged(voms.pit, materials.vom ?? structMat);
  addMerged(voms.cap, railMat);
  addMerged(voms.tunnel, lit ? lit.mouthMat : wallMat);
  addMerged(voms.floor, lit ? lit.mouthFloor : floorMat);
  addMerged(voms.ceil, lit ? lit.ceilMat : structMat, false);
  if (voms.lamps.length && lit) {
    const P = [], N = [];
    for (const [x, y, z, yaw] of voms.lamps) {
      const ux = Math.sin(yaw), uz = Math.cos(yaw), vx = -uz, vz = ux;
      const c = [[-0.8, -0.1], [0.8, -0.1], [0.8, 0.1], [-0.8, 0.1]].map(([s, t]) => [x + ux * s + vx * t, z + uz * s + vz * t]);
      for (const k of [0, 2, 1, 0, 3, 2]) { P.push(c[k][0], y, c[k][1]); N.push(0, -1, 0); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    const m = new THREE.Mesh(geo, lit.lampMat); m.userData.noCollide = true; g.add(m);
  }
  for (const s of voms.signs) {
    const geo = new THREE.PlaneGeometry(s.w, s.h ?? 0.42);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: vomSignTexture(s.label, materials.signBg, materials.signFg, !!s.aisle), color: 0xd8d8d8 }));
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.yaw; m.userData.noCollide = true;
    g.add(m);
  }
  if (data.signs?.length) g.add(signSheet(data.signs, ox, oz, materials.signBg, materials.signFg));
  if (data.pillars?.length) g.add(pillars(data.pillars, ox, oz, lit ? lit.inMat : wallMat));
  if (data.cutWalls?.length) {
    const cw = (materials.cutWall ?? structMat).clone(); cw.side = THREE.DoubleSide;
    if (!materials.cutWall) cw.color.setScalar(data.cutWallTone ?? 0.4);        // dark concrete: the bowls' walls are the stands' fronts, not light panels (a venue's own: data.cutWallTone)
    g.add(cutWalls(data.cutWalls, ox, oz, cw, 0.3));
  }
  if (data.frames?.length) g.add(doorFrames(data.frames, ox, oz, materials.doorFrame ?? std({ color: 0x1b1d22, roughness: 0.55, metalness: 0.35 })));
  // seats: instanced per colour, or handed to the venue's own seat
  const lights = lit ? roomLights(data, { ox, oz, lit }) : null;
  const update = (f) => lights?.update(f);
  // the top of whatever stands at (x, z): a row's tread or a concourse floor
  const tops = [];
  const addTop = (polys, y) => {
    const ring = polys[0].map(([x, z]) => [x + ox, z + oz]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    tops.push({ ring, holes: polys.slice(1).map((h) => h.map(([x, z]) => [x + ox, z + oz])), y, x0, x1, z0, z1 });
  };
  for (const L of data.levels) for (const row of L.rows) for (const polys of row.polys) addTop(polys, row.y);
  for (const f of data.floors) for (const polys of f.polys) addTop(polys, f.y);
  const inRing = (r, x, z) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const topAt = (x, z) => {
    let y = 0;
    for (const t of tops) {
      if (t.y <= y || x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1) continue;
      if (inRing(t.ring, x, z) && !t.holes.some((h) => inRing(h, x, z))) y = t.y;
    }
    return y;
  };
  // each sitter's place in the lightstick control: the level (1 the lowest,
  // counted by height; the floor is 0), the block, and the block's place
  // across its level from one end to the other (0..1)
  // `tiers` ({ level name: [floor number, band] }) puts levels a building
  // counts as one floor under one: a lower and upper half of a tier, or an
  // outfield's stand on the 1st floor beside the infield's. Each block is
  // placed across its floor by its angle round the stage, and its number for
  // the chequerboard is its place along its level plus its band (front to
  // back within the floor), so the block behind another is the other colour.
  const tierOf = (name) => (tiers?.[name] == null ? null : [].concat(tiers[name]));
  if (tiers) {
    const byTier = new Map();
    levelBlocks.forEach((l, i) => { const t = tierOf(l.name)?.[0]; if (t != null) { if (!byTier.has(t)) byTier.set(t, []); byTier.get(t).push(i); } });
    const place = new Map();   // lvRaw → { u: Map(block → 0..1) }
    for (const [, ids] of byTier) {
      const ang = [];
      for (const i of ids) {
        const u = new Map();
        for (const [b, a] of levelBlocks[i].at) { const t = Math.atan2(a.x / a.n - stage.x, a.z / a.n - stage.z); ang.push(t); u.set(b, t); }
        place.set(i, { u });
      }
      const lo = Math.min(...ang), hi = Math.max(...ang);
      for (const i of ids) for (const [b, t] of place.get(i).u) place.get(i).u.set(b, hi > lo ? (t - lo) / (hi - lo) : 0.5);
    }
    for (const p of people) {
      if (p.lvRaw == null) continue;
      const t = tierOf(levelBlocks[p.lvRaw].name), pl = place.get(p.lvRaw);
      if (t == null || !pl) continue;
      p.zone = { lv: t[0], block: p.block + (t[1] ?? 0), u: pl.u.get(p.block) ?? 0.5 };
    }
  }
  const rank = levelBlocks.map((l, i) => [i, l.n ? l.ySum / l.n : 0]).sort((a, b) => a[1] - b[1]).map(([i]) => i);
  const lvOf = new Map(rank.map((i, r) => [i, r + 1]));
  for (const p of people) {
    if (p.lvRaw == null || p.zone) continue;
    const nb = levelBlocks[p.lvRaw].count;
    p.zone = { lv: lvOf.get(p.lvRaw), block: p.block, u: nb > 1 ? p.block / (nb - 1) : 0.5 };
  }
  // `sectors` (the names of the levels that set them): the house run as
  // wedges, every level as one, cut along the aisles between those levels'
  // blocks. Each aisle is found where it really runs, the middle of the gap
  // between the two blocks' end seats row by row, and drawn on as a straight
  // line through every tier above and below it. `sectorEven`: a block of
  // those levels more than that many times the usual width (two run
  // together where an aisle went unseen) is cut across its rows into pieces
  // of the usual width first. `sectorJoin(a, b)` (two blocks side by side, each
  // { x, z (from the bowl's middle), face (degrees), n }): no line between
  // them. Then a block of another level lying almost all in one wedge goes
  // whole to it (`sectorWhole`: the share of it over a line that stays where
  // it falls), and a wedge left with only a scrap of the house (under
  // `sectorMin` of the usual) goes in with the smaller beside it.
  // Numbered round the bowl, and placed (u, 0..1) as the floor's blocks are:
  // round a centre stage (`round`) by the bearing from the stage, else from
  // one side of the house across to the other.
  if (sectors && edgeSeats.length) {
    const seated = people.filter((p) => p.lvRaw != null);
    const dA = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    const xs = edgeSeats.map((e) => e.x), zs = edgeSeats.map((e) => e.z);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2, mz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const bear = (x, z) => Math.atan2(x - mx, z - mz);
    const by = new Map();
    for (const e of edgeSeats) { if (!by.has(e.k)) by.set(e.k, []); by.get(e.k).push(e); }
    // blocks one behind another (a walkway across the stand between them)
    // are one: those that take up much the same run of bearings
    {
      const sp = [...by].map(([k, es]) => {
        const m = Math.atan2(es.reduce((q, e) => q + Math.sin(bear(e.x, e.z)), 0), es.reduce((q, e) => q + Math.cos(bear(e.x, e.z)), 0));
        const d = es.map((e) => dA(bear(e.x, e.z), m)).sort((x, y) => x - y);
        return { k, es, lo: m + d[Math.floor(d.length * 0.05)], hi: m + d[Math.ceil(d.length * 0.95) - 1], m };
      }).sort((a, b) => a.m - b.m);
      const out = [];
      for (const b of sp) {
        const a = out[out.length - 1];
        if (a && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 0.5 * Math.min(a.hi - a.lo, b.hi - b.lo)) { a.es.push(...b.es); a.lo = Math.min(a.lo, b.lo); a.hi = Math.max(a.hi, b.hi); }
        else out.push(b);
      }
      by.clear();
      for (const b of out) by.set(b.k, b.es);
    }
    // (`sectorEven`: measured by width across its rows, against the usual
    // width of the blocks, and cut into equal widths)
    if (sectorEven) {
      const list = [...by].map(([k, es]) => {
        const fx = es.reduce((q, e) => q + Math.sin(e.yaw), 0), fz = es.reduce((q, e) => q + Math.cos(e.yaw), 0);
        const along = (e) => e.x * fz - e.z * fx, l = Math.hypot(fx, fz) || 1;
        const v = es.map((e) => along(e) / l).sort((x, y) => x - y);
        return { k, es, along: (e) => along(e) / l, lo: v[Math.floor(v.length * 0.03)], hi: v[Math.ceil(v.length * 0.97) - 1] };
      });
      const nMed = list.map((b) => b.es.length).sort((x, y) => x - y)[list.length >> 1] || 1;
      const ws = list.filter((b) => b.es.length >= 0.5 * nMed).map((b) => b.hi - b.lo).sort((x, y) => x - y);
      const usual = ws[ws.length >> 1] || 1;
      for (const b of list) {
        const w = b.hi - b.lo, parts = w > usual * sectorEven ? Math.round(w / usual) : 1;
        if (parts < 2) continue;
        by.delete(b.k);
        const piece = Array.from({ length: parts }, () => []);
        for (const e of b.es) piece[Math.max(0, Math.min(parts - 1, Math.floor((b.along(e) - b.lo) / (w / parts))))].push(e);
        piece.forEach((es, j) => by.set(`${b.k}:${j}`, es));
      }
    }
    // each block: its middle, its bearing, which way it faces, and each row's
    // two end seats (the one furthest round each way)
    const blocks = [...by.values()].filter((es) => es.length >= 4).map((es) => {
      let sx = 0, sz = 0, fs = 0, fc = 0;
      const rows = new Map();
      const cx0 = es.reduce((q, e) => q + e.x, 0) / es.length, cz0 = es.reduce((q, e) => q + e.z, 0) / es.length, m0 = bear(cx0, cz0);
      for (const e of es) {
        sx += e.x; sz += e.z; fs += Math.sin(e.yaw); fc += Math.cos(e.yaw);
        const rk = `${Math.floor(Number(String(e.k).split(':')[0]) / 4096)}:${e.row}`, t = dA(bear(e.x, e.z), m0), R = rows.get(rk);
        if (!R) rows.set(rk, { lo: e, hi: e, tl: t, th: t });
        else { if (t < R.tl) { R.lo = e; R.tl = t; } if (t > R.th) { R.hi = e; R.th = t; } }
      }
      const x = sx / es.length, z = sz / es.length;
      return { x: x - mx, z: z - mz, m: bear(x, z), face: Math.atan2(fs, fc) / DEG, fx: fs / es.length, fz: fc / es.length, n: es.length, rows };
    }).sort((a, b) => a.m - b.m);
    // the aisle between two blocks side by side: through the middles of the
    // gap, row by row, fitted as a line (along its longest way, pointed out
    // from the middle); with too few rows in common, or (`sectorFacing`) a
    // fit more than that many degrees off it, straight back the way the
    // seats face
    const aisle = (A, B) => {
      const pts = [];
      for (const [r, a] of A.rows) { const b = B.rows.get(r); if (b) pts.push([(a.hi.x + b.lo.x) / 2, (a.hi.z + b.lo.z) / 2]); }
      if (pts.length < 2) for (const [P, Q] of [[A, 'hi'], [B, 'lo']]) for (const R of P.rows.values()) pts.push([R[Q].x, R[Q].z]);
      const cx = pts.reduce((q, p) => q + p[0], 0) / pts.length, cz = pts.reduce((q, p) => q + p[1], 0) / pts.length;
      let sxx = 0, sxz = 0, szz = 0;
      for (const [x, z] of pts) { sxx += (x - cx) ** 2; sxz += (x - cx) * (z - cz); szz += (z - cz) ** 2; }
      // (the way the seats face, back: what an aisle runs along, and what it
      // keeps to where the gap's middles stray, a block's back rows set off
      // to one side behind a vomitory)
      let fx2 = -(A.fx + B.fx), fz2 = -(A.fz + B.fz);
      const fl = Math.hypot(fx2, fz2) || 1; fx2 /= fl; fz2 /= fl;
      let ux = fx2, uz = fz2;
      if (pts.length >= 3 && sxx + szz > 1) {
        const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
        const px = Math.cos(th), pz = Math.sin(th);
        if (!sectorFacing || Math.abs(px * fx2 + pz * fz2) > Math.cos(sectorFacing * DEG)) { ux = px; uz = pz; }
      }
      if (ux * (cx - mx) + uz * (cz - mz) < 0) { ux = -ux; uz = -uz; }
      return { m: bear(cx, cz), cx, cz, ux, uz };
    };
    // (no line across the open end of a house: the widest gap round it, if
    // it is far wider than the rest)
    const gaps = blocks.map((b, i) => (dA(blocks[(i + 1) % blocks.length].m, b.m) + 2 * Math.PI) % (2 * Math.PI));
    const gmed = [...gaps].sort((x, y) => x - y)[gaps.length >> 1] || 0;
    const gi = gaps.indexOf(Math.max(...gaps));
    const lines = [];
    blocks.forEach((A, i) => {
      const B = blocks[(i + 1) % blocks.length];
      if (blocks.length < 2 || (i === gi && gaps[i] > 3 * gmed) || sectorJoin?.(A, B)) return;
      lines.push(aisle(A, B));
    });
    lines.sort((x, y) => x.m - y.m);
    // where a line crosses the circle a seat sits on round the middle (its
    // own bearing if it never gets there), unwrapped about its own bearing;
    // a seat's run is the first line round from it (one that crosses its
    // neighbour nearer the middle held at it, so the wedge closes rather than
    // turns over)
    const cross = (L2, r) => {
      const ox2 = L2.cx - mx, oz2 = L2.cz - mz;
      const bq = ox2 * L2.ux + oz2 * L2.uz, D = bq * bq - (ox2 * ox2 + oz2 * oz2 - r * r);
      const tk = D < 0 ? L2.m : Math.atan2(ox2 + L2.ux * (-bq + Math.sqrt(D)), oz2 + L2.uz * (-bq + Math.sqrt(D)));
      return L2.m + dA(tk, L2.m);
    };
    const cut = (p) => {
      const r = Math.hypot(p.x - mx, p.z - mz), t = bear(p.x, p.z);
      let last = -Infinity;
      for (let k = 0; k < lines.length; k++) { last = Math.max(last, cross(lines[k], r)); if (last >= t) return k; }
      // (past the last line: round to the first, unless `sectorSplitEnds`: the wedge round the back of the
      // house, behind an end stage, parted there, each side of it its own)
      return sectorSplitEnds ? lines.length : 0;
    };
    const wk = new Map();
    for (const p of seated) wk.set(p, cut(p));
    // (`sectorBlocks`, the seats labelled with their real blocks: no lines.
    // Each block of those levels its own wedge, by its name; a block of
    // another floor to the one whose run of bearings round the bowl it lies
    // in, or lies nearest)
    let byBear = null;
    if (sectorBlocks && levelBlocks.some((l) => l.names)) {
      const run = new Map();
      for (const p of seated) {
        const lb = levelBlocks[p.lvRaw];
        if (!sectors.includes(lb.name) || !lb.names) continue;
        const k = `#${lb.names[p.block]}`;
        wk.set(p, k);
        if (!run.has(k)) run.set(k, []);
        run.get(k).push(bear(p.x, p.z));
      }
      const runs = [...run].map(([k, ts]) => {
        const m = Math.atan2(ts.reduce((q, t) => q + Math.sin(t), 0), ts.reduce((q, t) => q + Math.cos(t), 0));
        const d = ts.map((t) => dA(t, m)).sort((x, y) => x - y);
        return { k, m, lo: d[Math.floor(d.length * 0.03)], hi: d[Math.ceil(d.length * 0.97) - 1] };
      });
      byBear = (p) => {
        const t = bear(p.x, p.z);
        let best = null, bd = Infinity;
        for (const r of runs) {
          const d = dA(t, r.m), off = d < r.lo ? r.lo - d : d > r.hi ? d - r.hi : 0;
          const score = off * 100 + Math.abs(d);       // (inside a run first, then the nearest middle)
          if (score < bd) { bd = score; best = r.k; }
        }
        return best;
      };
    }
    // a block of another level almost all in one wedge goes whole to it
    // (`sectorBlocks`: every block, of every level, whole to the wedge most of
    // it lies in: the stands' real blocks, never cut, so the wedges' edges run
    // up the house along the blocks' own aisles, from one tier to the next)
    const groups = new Map();
    for (const p of seated) { if (!sectorBlocks && sectors.includes(levelBlocks[p.lvRaw].name)) continue; const g = p.lvRaw * 4096 + p.block; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
    // (`sectorBlocks`: a block on the same floor as those levels, the excite
    // seats in front of them or the blocks behind their walkway, goes by the
    // seats of theirs nearest it, the block straight behind or in front, not
    // by where the lines run across it at a slant)
    const near = (() => {
      if (!sectorBlocks) return null;
      const fl = (p) => tierOf(levelBlocks[p.lvRaw].name)?.[0];
      const own = seated.filter((p) => sectors.includes(levelBlocks[p.lvRaw].name));
      const floors = new Set(own.map(fl));
      const cell = new Map(), key = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
      for (const p of own) { const k = key(p.x, p.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); }
      return (p) => {
        if (!floors.has(fl(p))) return null;
        const cx = Math.floor(p.x / 4), cz = Math.floor(p.z / 4);
        let best = null, bd = Infinity;
        for (let r = 1; r <= 4 && !best; r++) {
          for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
            for (const q of cell.get(`${cx + i},${cz + j}`) ?? []) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = q; } }
          }
        }
        return best ? wk.get(best) : null;
      };
    })();
    // (`sectorPair(name)`: the block of those levels a named block shares its
    // aisles with, one in front across a walkway: the wedge it is the most of)
    const pairOf = new Map();
    if (sectorPair) {
      for (const p of seated) {
        const lb = levelBlocks[p.lvRaw];
        if (!sectors.includes(lb.name) || !lb.names) continue;
        const nm = lb.names[p.block], c = pairOf.get(nm) || new Map();
        c.set(wk.get(p), (c.get(wk.get(p)) || 0) + 1); pairOf.set(nm, c);
      }
      for (const [nm, c] of pairOf) pairOf.set(nm, [...c].sort((x, y) => y[1] - x[1])[0][0]);
    }
    // (a block paired with one of another level, not those levels': that
    // one's wedge, once it has one, after the rest)
    const later = [], upper = [];
    const flOf = (p) => tierOf(levelBlocks[p.lvRaw].name)?.[0];
    const baseFl = new Set(seated.filter((p) => sectors.includes(levelBlocks[p.lvRaw].name)).map(flOf));
    for (const ps of groups.values()) {
      const c = new Map();
      const lb = levelBlocks[ps[0].lvRaw], pr = sectorPair && lb.names ? sectorPair(lb.names[ps[0].block]) : null;
      if (pr != null && pairOf.has(pr)) { for (const p of ps) wk.set(p, pairOf.get(pr)); continue; }
      if (pr != null) { later.push([ps, pr]); continue; }
      // (`sectorBlocks`: a block of a floor over theirs, once theirs are all placed)
      if (byBear && !baseFl.has(flOf(ps[0]))) { upper.push(ps); continue; }
      if (near && !sectors.includes(lb.name)) {
        for (const p of ps) { const w = near(p) ?? byBear?.(p); if (w != null) wk.set(p, w); }
      }
      for (const p of ps) c.set(wk.get(p), (c.get(wk.get(p)) || 0) + 1);
      const [top] = [...c].sort((x, y) => y[1] - x[1])[0];
      for (const p of ps) if (sectorBlocks || c.get(wk.get(p)) < sectorWhole * ps.length) wk.set(p, top);
    }
    // (a block of a floor over those levels' takes the wedge of the seats of
    // their floor straight under it in plan, the floor over overhanging the
    // back of theirs: not its bearing round the bowl, which drifts a block off
    // where the floors' blocks are not as wide)
    if (upper.length) {
      const cell = new Map(), key = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
      for (const p of seated) { if (!baseFl.has(flOf(p))) continue; const k = key(p.x, p.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); }
      const under = (p) => {
        const cx = Math.floor(p.x / 4), cz = Math.floor(p.z / 4);
        let best = null, bd = Infinity;
        for (let r = 0; r <= 8 && !best; r++) {
          for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
            for (const q of cell.get(`${cx + i},${cz + j}`) ?? []) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = q; } }
          }
          // (one ring further, in case a nearer seat lies just over the cell's edge)
          if (best && r < 8) for (let i = -r - 1; i <= r + 1; i++) for (let j = -r - 1; j <= r + 1; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r + 1) continue;
            for (const q of cell.get(`${cx + i},${cz + j}`) ?? []) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = q; } }
          }
        }
        return best ? wk.get(best) : null;
      };
      // A block over two of theirs is cut between them by one straight line
      // up its rows (a run of bearings round the bowl each side), so it takes
      // both their colours, its edge run on from the aisle under it, never a
      // ragged one seat by seat; a scrap of under a twelfth stays with the rest.
      // (`sectorOver` {level: level}: a level whose blocks follow those of the
      // level in front of it on its floor, not the floor under: E behind D)
      const cutUp = (ps, lab) => {
        const ts = ps.map((p) => bear(p.x, p.z));
        const m0 = Math.atan2(ts.reduce((q, t) => q + Math.sin(t), 0), ts.reduce((q, t) => q + Math.cos(t), 0));
        const tt = ts.map((t) => dA(t, m0));
        const cnt = new Map();
        lab.forEach((w) => cnt.set(w, (cnt.get(w) || 0) + 1));
        const keep = [...cnt].filter(([, n]) => n >= Math.max(6, ps.length / 12)).map(([w]) => w);
        if (!keep.length) keep.push([...cnt].sort((x, y) => y[1] - x[1])[0][0]);
        const med = (w) => { const v = tt.filter((_, i) => lab[i] === w).sort((x, y) => x - y); return v[v.length >> 1]; };
        keep.sort((a, b) => med(a) - med(b));
        const cuts = [];
        for (let j = 0; j + 1 < keep.length; j++) {
          const a = keep[j], b = keep[j + 1];
          const cand = tt.filter((_, i) => lab[i] === a || lab[i] === b).sort((x, y) => x - y);
          let best = cand[0], be = Infinity;
          for (const th of cand) {
            let e = 0;
            tt.forEach((t, i) => { if ((lab[i] === a && t > th) || (lab[i] === b && t <= th)) e++; });
            if (e < be) { be = e; best = th; }
          }
          cuts.push(Math.max(best, cuts[cuts.length - 1] ?? -Infinity));
        }
        ps.forEach((p, i) => { let j = 0; while (j < cuts.length && tt[i] > cuts[j]) j++; wk.set(p, keep[j]); });
      };
      const overOf = (ps) => sectorOver?.[levelBlocks[ps[0].lvRaw].name];
      const first = upper.filter((ps) => !overOf(ps)), next = upper.filter((ps) => overOf(ps));
      for (const ps of first) cutUp(ps, ps.map((p) => under(p) ?? byBear(p)));
      if (next.length) {
        const front = new Map();
        for (const ps of next) {
          const src = overOf(ps);
          if (!front.has(src)) {
            const c2 = new Map(), k2 = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
            for (const q of seated) { if (levelBlocks[q.lvRaw].name !== src) continue; const k = k2(q.x, q.z); if (!c2.has(k)) c2.set(k, []); c2.get(k).push(q); }
            front.set(src, (p) => {
              const cx = Math.floor(p.x / 4), cz = Math.floor(p.z / 4);
              let best = null, bd = Infinity;
              for (let r = 0; r <= 6 && !best; r++) for (let i = -r - 1; i <= r + 1; i++) for (let j = -r - 1; j <= r + 1; j++) {
                for (const q of c2.get(`${cx + i},${cz + j}`) ?? []) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = q; } }
              }
              return best ? wk.get(best) : null;
            });
          }
          const f = front.get(src);
          cutUp(ps, ps.map((p) => f(p) ?? under(p) ?? byBear(p)));
        }
      }
    }
    if (later.length) {
      const of = new Map();
      for (const p of seated) {
        const lb = levelBlocks[p.lvRaw];
        if (!lb.names) continue;
        const nm = lb.names[p.block], c = of.get(nm) || new Map();
        c.set(wk.get(p), (c.get(wk.get(p)) || 0) + 1); of.set(nm, c);
      }
      for (const [ps, pr] of later) {
        const c = of.get(pr);
        if (c) { const [top] = [...c].sort((x, y) => y[1] - x[1])[0]; for (const p of ps) wk.set(p, top); }
      }
    }
    // the wedges round in order; a scrap goes in with the smaller beside it
    const ms = new Map();
    for (const p of seated) { const k = wk.get(p), m = ms.get(k) || { s: 0, c: 0, x: 0, z: 0, n: 0 }; const t = bear(p.x, p.z); m.s += Math.sin(t); m.c += Math.cos(t); m.x += p.x; m.z += p.z; m.n++; ms.set(k, m); }
    const order = [...ms].map(([k, m]) => ({ k, t: Math.atan2(m.s, m.c), m })).sort((x, y) => x.t - y.t);
    const med = order.map((o) => o.m.n).sort((x, y) => x - y)[order.length >> 1] || 1;
    const into = new Map();
    for (let i = 0; i < order.length && order.length > 1;) {
      // (none with the real blocks: each of them a wedge however small)
      if (byBear || order[i].m.n >= med * sectorMin) { i++; continue; }
      const L2 = order[(i - 1 + order.length) % order.length], R2 = order[(i + 1) % order.length];
      // (never across the open end, `sectorSplitEnds`: a scrap at either end of the house goes in with its own neighbour)
      const ends = sectorSplitEnds;
      const to = ends && i === 0 ? R2 : ends && i === order.length - 1 ? L2 : L2.m.n < R2.m.n ? L2 : R2;
      into.set(order[i].k, to.k);
      for (const f of ['x', 'z', 'n', 's', 'c']) to.m[f] += order[i].m[f];
      order.splice(i, 1);
    }
    const root = (k) => { while (into.has(k)) k = into.get(k); return k; };
    // each wedge's place: round a centre stage, its bearing from the stage
    // (as the floor's blocks take theirs); else across the house from one
    // side to the other, by its bearing from the bowl's middle turned so the
    // stage lies behind, the low end on the side with the lower x
    const n = order.length;
    const place = new Map();
    if (round) {
      for (const o of order) place.set(o.k, (Math.atan2(o.m.x / o.m.n - stage.x, o.m.z / o.m.n - stage.z) + Math.PI) / (2 * Math.PI));
    } else {
      const back = Math.atan2(mx - stage.x, mz - stage.z);
      const rel = order.map((o) => dA(Math.atan2(o.m.x / o.m.n - mx, o.m.z / o.m.n - mz), back));
      const lo = Math.min(...rel), hi = Math.max(...rel);
      const lx = order[rel.indexOf(lo)].m.x / order[rel.indexOf(lo)].m.n, hx = order[rel.indexOf(hi)].m.x / order[rel.indexOf(hi)].m.n;
      order.forEach((o, i) => { const v = hi > lo ? (rel[i] - lo) / (hi - lo) : 0.5; place.set(o.k, lx <= hx ? v : 1 - v); });
    }
    // (numbered by that place, so the stripes and the place agree)
    const num = new Map([...place].sort((a, b) => a[1] - b[1]).map(([k], i) => [k, i]));
    for (const p of seated) { const k = root(wk.get(p)); p.zone = { ...p.zone, block: num.get(k), u: place.get(k) }; }
    if (n) g.userData.sectorLines = lines.map((L2) => [L2.cx, L2.cz, L2.ux, L2.uz]);
  }
  // what the walker sits down in
  const allSpots = seatSpots.flatMap(({ spots }) => spots);
  const seatNear = seatFinder(allSpots);
  if (seatMesh) {
    g.add(seatMesh(allSpots.map((sp) => ({ x: sp.x, y: sp.y, z: sp.z, turn: sp.yaw }))));
    return { group: g, people, aisleLights, update, topAt, seatNear, seats: allSpots };
  }
  const seatGeo = stadiumSeatGeometry(), paddedGeo = paddedSeatGeometry();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (const { spots, col, padded } of seatSpots) {
    const inst = new THREE.InstancedMesh(padded ? paddedGeo : seatGeo, std({ color: col, roughness: padded ? 0.94 : 0.65, metalness: 0, side: THREE.DoubleSide }), spots.length);
    spots.forEach((s, i) => { q.setFromAxisAngle(V3(0, 1, 0), s.yaw); m4.compose(V3(s.x, s.y, s.z), q, V3(1, 1, 1)); inst.setMatrixAt(i, m4); });
    inst.receiveShadow = true;
    g.add(inst);
  }
  return { group: g, people, aisleLights, update, topAt, seatNear, seats: allSpots };
}
