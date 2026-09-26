// ─────────────────────────────────────────────────────────────────────────────
// the bowl: tiers of rows following an outline, divided into the blocks of the
// building's seating plan — aisles where the plan has them, the tunnels the
// crowd comes in by (vomitories) opening onto cross-aisles, doors in the back
// walls, and enclosed stairs from one tier up to the next
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V3, clamp, concreteTex, lerp, prng, seatStripTex, std, withRepeat } from './core.js';
import { ledMaterial } from './rig.js';

// A rounded-rectangle ring around the field. `at(k, d)` gives the point for
// parameter sample k at outward offset d; the sample list is shared by every
// offset, so row n and row n+1 always line up quad for quad.
export function ringPath({ hx, hz, zc, rc }) {
  const ax = hx - rc, az = hz - rc;
  const pts = [];
  const CORNER = 12, STRAIGHT = 16;
  for (let seg = 0; seg < 8; seg++) {
    const n = seg % 2 ? CORNER : STRAIGHT;
    for (let i = seg === 0 ? 0 : 1; i <= n; i++) pts.push({ seg, t: i / n });
  }
  const at = (p, d) => {
    const R = rc + d;
    const { seg, t } = p;
    const arc = (cx, cz, a0) => { const a = a0 + t * Math.PI / 2; return { x: cx + R * Math.cos(a), z: zc + cz + R * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) }; };
    switch (seg) {
      case 0: return { x: ax + R, z: zc - az + t * 2 * az, nx: 1, nz: 0 };
      case 1: return arc(ax, az, 0);
      case 2: return { x: ax - t * 2 * ax, z: zc + az + R, nx: 0, nz: 1 };
      case 3: return arc(-ax, az, Math.PI / 2);
      case 4: return { x: -ax - R, z: zc + az - t * 2 * az, nx: -1, nz: 0 };
      case 5: return arc(-ax, -az, Math.PI);
      case 6: return { x: -ax + t * 2 * ax, z: zc - az - R, nx: 0, nz: -1 };
      default: return arc(ax, -az, Math.PI * 1.5);
    }
  };
  return { pts, at };
}

// The outline measured: arc length at offset 0 (`s`), and a way to find the
// point at any s and outward offset d. Aisles and tunnels are placed by s, so
// they run straight up the rake and fan out round the corners, as they do.
export function bowlOutline(path) {
  const P = path.pts;
  const s0 = [0];
  for (let k = 1; k < P.length; k++) { const a = path.at(P[k - 1], 0), b = path.at(P[k], 0); s0.push(s0[k - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const total = s0[P.length - 1];
  const A = path.at(P[0], 0), B = path.at(P[P.length - 1], 0);
  const closed = Math.hypot(A.x - B.x, A.z - B.z) < 1e-3;
  const wrap = (s) => (closed ? ((s % total) + total) % total : clamp(s, 0, total));
  const loc = (s) => {
    s = wrap(s);
    let lo = 0, hi = P.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s0[m] <= s) lo = m; else hi = m - 1; }
    return { k: lo, f: clamp((s - s0[lo]) / Math.max(1e-6, s0[lo + 1] - s0[lo])) };
  };
  const pt = (s, d) => {
    const { k, f } = loc(s);
    const a = path.at(P[k], d), b = path.at(P[k + 1], d);
    const nx = lerp(a.nx, b.nx, f), nz = lerp(a.nz, b.nz, f), l = Math.hypot(nx, nz) || 1;
    return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), nx: nx / l, nz: nz / l, k, f };
  };
  // the stretches of the outline where pred(x, z) holds at offset d
  const ranges = (pred, d = 0, step = 0.5) => {
    const out = [];
    let start = null;
    for (let s = 0; s <= total + 1e-6; s += step) {
      const p = pt(Math.min(s, total - 1e-6), d);
      const on = pred(p.x, p.z);
      if (on && start === null) start = s;
      if (!on && start !== null) { out.push([start, s - step]); start = null; }
    }
    if (start !== null) out.push([start, total]);
    // a stretch running through the seam of a closed outline is one stretch
    if (closed && out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] >= total - step) {
      const last = out.pop();
      out[0] = [last[0] - total, out[0][1]];
    }
    return out;
  };
  // the arc range of each of the ring's eight pieces (sides, ends, corners)
  const pieces = () => {
    const out = {};
    P.forEach((p, k) => { if (p.seg === undefined || k === P.length - 1) return; const r = out[p.seg] || (out[p.seg] = [s0[k], s0[k + 1]]); r[1] = s0[k + 1]; });
    return out;
  };
  return { path, P, s0, total, closed, wrap, loc, pt, ranges, pieces };
}

// helpers for laying a plan out along the outline
export const spread = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 0.5) / n);   // centres of n equal parts
export const divide = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);      // their n + 1 boundaries

// The stretches of arc a tier covers, as { a, b } in s; a tier that goes all
// the way round a closed outline is one stretch with `ring` set.
export function stretches(O, D) {
  const K = O.P.length - 1;
  const runs = [];
  for (let k = 0; k < K; k++) {
    if (!D.incl[k]) continue;
    const last = runs[runs.length - 1];
    if (last && last.k1 === k - 1) last.k1 = k; else runs.push({ k0: k, k1: k });
  }
  if (!runs.length) return [];
  if (runs.length === 1 && runs[0].k0 === 0 && runs[0].k1 === K - 1) return [{ a: 0, b: O.total, ring: O.closed }];
  const out = runs.map((r) => ({ a: O.s0[r.k0], b: O.s0[r.k1 + 1] }));
  // a stretch through the seam of a closed outline is one stretch
  if (O.closed && out.length > 1 && runs[0].k0 === 0 && runs[runs.length - 1].k1 === K - 1) {
    const last = out.pop();
    out[0] = { a: last.a - O.total, b: out[0].b };
  }
  return out;
}

// A tier's plan by blocks: each stretch divided into blocks about `step` metres
// wide (or the counts in `counts`, one per stretch), an aisle between blocks,
// and per block a tunnel (`vom`) and a door in the back wall (`door`), at the
// block's middle or at its aisles. `skip(x, z)` leaves a block's tunnel and
// door out (the blocks behind a stage).
export function planBlocks(O, D, { step = 11, counts = null, cuts = null, vom = null, door = null, skip = null } = {}) {
  const aisles = [], voms = [], doors = [];
  stretches(O, D).forEach((st, i) => {
    const bounds = cuts ? cuts(st) : divide(st.a, st.b, counts ? counts[i % counts.length] : Math.max(1, Math.round((st.b - st.a) / step)));
    const inner = st.ring ? bounds.slice(1) : bounds.slice(1, -1);
    aisles.push(...inner);
    const mids = bounds.slice(0, -1).map((a, j) => (a + bounds[j + 1]) / 2);
    const put = (spec, sink) => {
      if (!spec) return;
      (spec.at === 'aisle' ? inner : mids).forEach((s, j) => {
        if (j % (spec.every || 1) !== (spec.phase || 0)) return;
        const p = O.pt(s, D.inner);
        if (skip && skip(p.x, p.z)) return;
        sink.push({ s, w: spec.w, row: spec.row });
      });
    };
    put(vom, voms); put(door, doors);
  });
  return { aisles, voms, doors };
}

// tiers: [{ rows, rise, riseFar, run, yBase, inset, face, backWall, crowd, where, lift, cutZ,
//           cross: [row…]          walkways across the tier before these rows
//           blocks: (O, tier) → { aisles: [s…], voms: [{ s, w, row }], doors: [{ s, w }] }
//           soffit: bool           close the underside (a tier that overhangs)
//           stairs: [s…] | n       flights up to this tier from the one below }]
export function buildBowl(pipe, {
  hx, hz, zc, rc, tiers, seatColor = 0x2a2e3a, seatSpacing = 0.5, block = 14, aisle = 1.2,
  crowdCut = -Infinity, stage = V3(0, 8, 0), seed = 7, occupancy = 0.95, concreteTone = 0.22,
  cover = null,        // (x, z) => true where the seats are sold off and tarped
  occ = null,          // (x, z) => occupancy multiplier
  path: givenPath = null, // any outline with the ringPath interface (open or closed)
  caps = false,        // close the ends of an open outline with walls
  stairEvery = 40,     // metres round the bowl between flights, where a tier gives none
}) {
  const path = givenPath || ringPath({ hx, hz, zc, rc });
  const O = bowlOutline(path);
  const { P, s0, total, pt } = O;
  const rnd = prng(seed);
  // geometry sinks: the concrete, the seat backs, the tarps, the dark insides of tunnels
  const G = { struct: [[], [], []], seats: [[], [], []], tarp: [[], [], []], dark: [[], [], []] };
  const quad = (A, B, C, D, n, u0, u1, v0, v1, sink = G.struct) => {
    const [po, no, uv] = sink;
    for (const [p, u, v] of [[A, u0, v0], [B, u1, v0], [C, u1, v1], [A, u0, v0], [C, u1, v1], [D, u0, v1]]) {
      po.push(p.x, p.y, p.z); no.push(n.x, n.y, n.z); uv.push(u, v);
    }
  };
  const people = [];
  const aisleLights = [];
  const fascias = [];
  const stairGeos = [];
  const flights = [];

  // ── every tier's rows, extent and plan first ──
  const TD = tiers.map((T) => {
    const rows = [];
    let d = T.inset, y = T.yBase;
    for (let r = 0; r < T.rows; r++) {
      if (T.cross?.includes(r)) { const cr = T.crossRun ?? 1.4; rows.push({ d0: d, d1: d + cr, top: y, below: y, seat: false }); d += cr; }
      const t = T.rows === 1 ? 0 : r / (T.rows - 1);
      const rise = T.rise + ((T.riseFar ?? T.rise) - T.rise) * t;
      rows.push({ d0: d, d1: d + T.run, top: y + rise, below: y, seat: true, r });
      y += rise; d += T.run;
    }
    const cut = T.cutZ ?? -Infinity;
    // `lift` raises a tier where the building does: an outfield stand starts
    // above its fence, an infield one just above the field
    const lift = P.map((p) => { if (!T.lift) return 0; const a = path.at(p, T.inset); return T.lift(a.x, a.z); });
    const incl = P.map((_, k) => {
      if (k >= P.length - 1) return false;
      const a = path.at(P[k], T.inset), b = path.at(P[k + 1], T.inset);
      return !(Math.min(a.z, b.z) < cut || (T.where && !T.where((a.x + b.x) / 2, (a.z + b.z) / 2)));
    });
    const D = { T, rows, inner: T.inset, back: d, first: rows.find((w) => w.seat).top, entry: rows[0].top, last: rows[rows.length - 1].top, lift, incl, cut };
    const plan = T.blocks ? T.blocks(O, D) : { aisles: Array.from({ length: Math.floor(total / block) + 1 }, (_, i) => i * block + aisle / 2) };
    D.aisles = plan.aisles || [];
    // a tunnel's `row` is the seat row it opens in front of (0 = the first)
    D.voms = (plan.voms || []).map((v) => ({ ...v, w: v.w ?? 2.2, row: Math.max(0, rows.findIndex((w) => w.seat && w.r === (v.row ?? 0))) }));
    D.doors = (plan.doors || []).map((v) => ({ ...v, w: v.w ?? 1.8 }));
    D.aisleW = T.aisle ?? aisle;
    return D;
  });
  const inclAt = (D, s) => D.incl[O.loc(s).k];
  const liftAt = (D, s) => { const { k, f } = O.loc(s); return lerp(D.lift[k], D.lift[k + 1], f); };

  // ── the stairs between tiers: along the concourse between two tiers, from a
  // door in the lower tier's back wall, a landing, then up to the upper tier's
  // front row; walls at both ends, so the flight is a stairwell ──
  const RISE = 0.2, RUN_M = 0.3;
  // metres per unit of arc at offset d (more than one outside a bend)
  const perS = (sv, d) => { const a = pt(sv - 0.5, d), b = pt(sv + 0.5, d); return Math.max(0.2, Math.hypot(b.x - a.x, b.z - a.z)); };
  const stairsAt = (D, phase) => {
    const st = D.T.stairs;
    if (typeof st === 'function') return st(O, D);
    if (Array.isArray(st)) return st;
    return Array.from({ length: Math.floor(total / stairEvery) }, (_, i) => (i + 0.5 + phase * 0.5) * stairEvery);
  };
  TD.forEach((D, ti) => {
    if (ti === 0) {
      // a stand that starts too high to step onto from the floor gets flights
      // along the wall in front of it
      const where = stairsAt(D, 0);
      for (const sTop of where) {
        if (!inclAt(D, sTop)) continue;
        const top = D.entry + liftAt(D, sTop);
        if (top <= 1.4) continue;
        const n = Math.ceil(top / RISE);
        const d0 = D.inner - 1.3, d1 = D.inner;
        const RUN = RUN_M / perS(sTop, (d0 + d1) / 2);
        if (!inclAt(D, sTop - n * RUN)) continue;
        for (let i = 0; i < n; i++) stepBox(sTop - (n - i) * RUN, sTop - (n - i - 1) * RUN, d0, d1, top * (i + 1) / n, 0);
        // a rail wall on the field side and across the top
        wallAlong(sTop - n * RUN, sTop, d0 - 0.02, 0, (s) => clamp((s - (sTop - n * RUN)) / (n * RUN)) * top + 1.0);
        wallAcross(sTop + 0.02, d0, d1, top - 0.2, top + 1.0);
        flights.push({ tier: 0, from: pt(sTop - n * RUN - 1.2, d0 - 0.6), start: pt(sTop - n * RUN + RUN, (d0 + d1) / 2), end: pt(sTop - RUN / 2, (d0 + d1) / 2), to: pt(sTop - RUN / 2, d1 + 0.45), y: top });
      }
      return;
    }
    const B = TD[ti - 1];
    if (D.inner - B.back < 0.8) return;
    const where = stairsAt(D, ti % 2);
    for (const sTop of where) {
      const low = B.last + liftAt(B, sTop);
      const top = D.entry + liftAt(D, sTop);
      const n = Math.max(1, Math.ceil((top - low) / RISE));
      const d0 = B.back, d1 = D.inner;
      // runs measured along the middle of the flight, not the outline
      const k = perS(sTop, (d0 + d1) / 2);
      const RUN = RUN_M / k, LAND = 1.6 / k;
      const L = n * RUN;
      const sLand = sTop - L - LAND;
      if (![sTop, sTop - L, sLand].every((s) => inclAt(B, s) && inclAt(D, s))) continue;
      // landing, level with the lower tier's back row, then the steps
      stepBox(sLand, sTop - L, d0, d1, low, low - 0.4);
      for (let i = 0; i < n; i++) stepBox(sTop - (n - i) * RUN, sTop - (n - i - 1) * RUN, d0, d1, low + (top - low) * (i + 1) / n, Math.max(low - 0.4, low + (top - low) * (i + 1) / n - 1.6));
      // the door in the lower tier's back wall onto the landing (and no other
      // door opening into the stairwell)
      B.doors = B.doors.filter((dr) => dr.stair || dr.s + dr.w / 2 < sLand - 0.6 || dr.s - dr.w / 2 > sTop + 0.6);
      B.doors.push({ s: sLand + LAND / 2, w: 1.2 / perS(sLand + LAND / 2, d0), stair: true });
      // the stairwell's ends, and the side under the upper tier's front
      wallAcross(sLand - 0.02, d0, d1, low - 0.4, low + 2.6);
      wallAcross(sTop + 0.02, d0, d1, top - 0.4, top + 1.1);
      const f0 = D.T.yBase - (D.T.face ?? 2.6);
      if (f0 > low) wallAlong(sLand, sTop, d1 + 0.02, low - 0.4, () => f0 + liftAt(D, sTop), -1);
      // and a wall to shoulder height on the lower tier's side, over its back wall
      const wallTop = low + (B.T.backWall ?? 4);
      const stepTop = (s) => low + (top - low) * clamp(Math.ceil((s - (sTop - L)) / RUN) / n);
      if (top + 1.1 > wallTop) wallAlong(sTop - L, sTop, d0 + 0.12, low - 0.4, (s) => Math.max(wallTop, stepTop(s) + 1.1));
      const dm = (d0 + d1) / 2;
      // (for the checks: the way there from the lower tier's front, up its
      // nearest aisle and along its back row to the door)
      const sA = B.aisles.reduce((m, a) => (Math.abs(a - sLand) < Math.abs(m - sLand) ? a : m), Infinity);
      const route = isFinite(sA) ? [pt(sA, B.inner + 0.3), pt(sA, B.back - 0.35), pt(sLand + LAND / 2, B.back - 0.35)] : [];
      flights.push({ tier: ti, route, from: pt(sLand + LAND / 2, d0 - 0.7), start: pt(sLand + LAND / 2, dm), end: pt(sTop - RUN / 2, dm), to: pt(sTop - RUN / 2, d1 + 0.45), y: top, low });
    }
  });

  function stepBox(sa, sb, d0, d1, top, bottom) {
    const a = pt(sa, (d0 + d1) / 2), b = pt(sb, (d0 + d1) / 2);
    const tx = b.x - a.x, tz = b.z - a.z;
    const g = new THREE.BoxGeometry(d1 - d0, Math.max(0.05, top - bottom), Math.hypot(tx, tz) + 0.02);
    g.rotateY(Math.atan2(tx, tz));
    g.translate((a.x + b.x) / 2, (top + bottom) / 2, (a.z + b.z) / 2);
    stairGeos.push(g);
  }
  // a wall across the outline at arc s, between offsets d0 and d1
  function wallAcross(s, d0, d1, y0, y1) {
    const a = pt(s, d0), b = pt(s, d1);
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz);
    const g = new THREE.BoxGeometry(0.2, y1 - y0, l);
    g.rotateY(Math.atan2(tx, tz));
    g.translate((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2);
    stairGeos.push(g);
  }
  // a wall along the outline at offset d, from arc sa to sb, height by arc
  function wallAlong(sa, sb, d, y0, y1At) {
    const n = Math.max(1, Math.ceil((sb - sa) / 0.6));
    for (let i = 0; i < n; i++) {
      const s1 = sa + (sb - sa) * i / n, s2 = sa + (sb - sa) * (i + 1) / n;
      const a = pt(s1, d), b = pt(s2, d);
      const tx = b.x - a.x, tz = b.z - a.z;
      const y1 = y1At((s1 + s2) / 2);
      const g = new THREE.BoxGeometry(0.2, Math.max(0.05, y1 - y0), Math.hypot(tx, tz) + 0.02);
      g.rotateY(Math.atan2(tx, tz));
      g.translate((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2);
      stairGeos.push(g);
    }
  }

  // spans of arc to leave out: [sa, sb] lists, wrapped round a closed outline
  const spansOf = (list, half) => {
    const out = [];
    for (const c of list) {
      const s = typeof c === 'number' ? c : c.s;
      const h = typeof c === 'number' ? half : c.w / 2;
      out.push([s - h, s + h]);
      if (O.closed) { out.push([s - h - total, s + h - total]); out.push([s - h + total, s + h + total]); }
    }
    return out;
  };
  // the parts of path segment k (as fractions) left once `spans` are taken out
  const piecesOf = (k, spans) => {
    const a = s0[k], b = s0[k + 1], len = b - a;
    let parts = [[0, 1]];
    for (const [sa, sb] of spans) {
      if (sb <= a || sa >= b) continue;
      const fa = (sa - a) / len, fb = (sb - a) / len;
      parts = parts.flatMap(([p0, p1]) => {
        if (fb <= p0 || fa >= p1) return [[p0, p1]];
        const o = [];
        if (fa > p0) o.push([p0, fa]);
        if (fb < p1) o.push([fb, p1]);
        return o;
      });
    }
    return parts.filter(([p0, p1]) => p1 - p0 > 1e-4);
  };
  const lp = (A, B, f) => ({ x: lerp(A.x, B.x, f), z: lerp(A.z, B.z, f) });

  // ── the tiers ──
  TD.forEach((D, ti) => {
    const { T, rows, inner, lift, incl, cut } = D;
    const aisleSpans = spansOf(D.aisles, D.aisleW / 2);
    // which rows each tunnel cuts: from the row it opens at, up to the first row
    // high enough to pass over its roof
    const CLEAR = 2.3;
    for (const v of D.voms) {
      const i0 = v.row ?? 0;
      v.yF = rows[i0].below;
      v.i0 = i0;
      let i1 = i0;
      while (i1 < rows.length && rows[i1].below < v.yF + CLEAR + 0.3) i1++;
      v.i1 = i1;                                     // rows i0 … i1-1 are cut
      v.dEnd = Math.min(D.back, (rows[Math.min(i1, rows.length - 1)].d0) + 4);
      v.span = [[v.s - v.w / 2, v.s + v.w / 2], ...(O.closed ? [[v.s - v.w / 2 - total, v.s + v.w / 2 - total], [v.s - v.w / 2 + total, v.s + v.w / 2 + total]] : [])];
    }
    const vomSpans = (i) => D.voms.filter((v) => i >= v.i0 && i < v.i1).flatMap((v) => v.span);

    // tier front face (the fascia/balcony front), from below the tier to its first tread
    const f0 = ti === 0 ? 0 : T.yBase - (T.face ?? 2.6);
    for (let k = 0; k < P.length - 1; k++) {
      if (!incl[k]) continue;
      const a = path.at(P[k], inner), b = path.at(P[k + 1], inner);
      const n = V3(-(a.nx + b.nx) / 2, 0, -(a.nz + b.nz) / 2).normalize();
      const fa = ti === 0 ? 0 : f0 + lift[k], fb = ti === 0 ? 0 : f0 + lift[k + 1];
      quad(V3(a.x, fa, a.z), V3(b.x, fb, b.z), V3(b.x, T.yBase + lift[k + 1], b.z), V3(a.x, T.yBase + lift[k], a.z), n, s0[k], s0[k + 1], f0, T.yBase);
    }
    fascias.push({ inset: inner, y0: f0, y1: T.yBase, cut, incl });

    rows.forEach((w, i) => {
      const cutSpans = vomSpans(i);
      const seatSpans = aisleSpans.concat(cutSpans);
      for (let k = 0; k < P.length - 1; k++) {
        if (!incl[k]) continue;
        const a0 = path.at(P[k], w.d0), b0 = path.at(P[k + 1], w.d0);
        const a1 = path.at(P[k], w.d1), b1 = path.at(P[k + 1], w.d1);
        const la = lift[k], lb = lift[k + 1];
        const nIn = V3(-(a0.nx + b0.nx) / 2, 0, -(a0.nz + b0.nz) / 2).normalize();
        for (const [p0, p1] of piecesOf(k, cutSpans)) {
          const A0 = lp(a0, b0, p0), B0 = lp(a0, b0, p1), A1 = lp(a1, b1, p0), B1 = lp(a1, b1, p1);
          const lA = lerp(la, lb, p0), lB = lerp(la, lb, p1);
          const sA = lerp(s0[k], s0[k + 1], p0), sB = lerp(s0[k], s0[k + 1], p1);
          // riser, facing the field, and the tread
          if (w.top > w.below) quad(V3(A0.x, w.below + lA, A0.z), V3(B0.x, w.below + lB, B0.z), V3(B0.x, w.top + lB, B0.z), V3(A0.x, w.top + lA, A0.z), nIn, sA, sB, w.below, w.top);
          quad(V3(A0.x, w.top + lA, A0.z), V3(B0.x, w.top + lB, B0.z), V3(B1.x, w.top + lB, B1.z), V3(A1.x, w.top + lA, A1.z), V3(0, 1, 0), sA, sB, w.d0, w.d1);
        }
        if (!w.seat) continue;
        // sold off behind the stage: a black tarp over the rows, nobody in them
        const midX = (a0.x + b0.x) / 2, midZ = (a0.z + b0.z) / 2;
        const tarped = cover && cover(midX, midZ);
        // seat backs, leaning back from the tread, and the people in them
        const dB = w.d0 + T.run * 0.5, dT = w.d0 + T.run * 0.62;
        const aB = path.at(P[k], dB), bB = path.at(P[k + 1], dB), aT = path.at(P[k], dT), bT = path.at(P[k + 1], dT);
        const sn = nIn.clone().multiplyScalar(0.95).add(V3(0, 0.3, 0)).normalize();
        for (const [p0, p1] of piecesOf(k, seatSpans)) {
          const lA = lerp(la, lb, p0), lB = lerp(la, lb, p1);
          if (tarped) {
            const A0 = lp(a0, b0, p0), B0 = lp(a0, b0, p1), A1 = lp(a1, b1, p0), B1 = lp(a1, b1, p1);
            quad(V3(A0.x, w.top + lA + 0.06, A0.z), V3(B0.x, w.top + lB + 0.06, B0.z), V3(B1.x, w.top + lB + 0.9, B1.z), V3(A1.x, w.top + lA + 0.9, A1.z),
              nIn.clone().multiplyScalar(0.7).add(V3(0, 0.7, 0)).normalize(), 0, 1, 0, 1, G.tarp);
            continue;
          }
          const AB = lp(aB, bB, p0), BB = lp(aB, bB, p1), AT = lp(aT, bT, p0), BT = lp(aT, bT, p1);
          quad(V3(AB.x, w.top + lA + 0.34, AB.z), V3(BB.x, w.top + lB + 0.34, BB.z), V3(BT.x, w.top + lB + 0.82, BT.z), V3(AT.x, w.top + lA + 0.82, AT.z), sn, 0, 1, 0, 1, G.seats);
          if (!T.crowd) continue;
          const len = Math.hypot(BB.x - AB.x, BB.z - AB.z);
          const n = Math.floor(len / seatSpacing);
          for (let j = 0; j < n; j++) {
            const t = (j + 0.5) / n;
            const x = lerp(AB.x, BB.x, t), z = lerp(AB.z, BB.z, t);
            if (z < crowdCut) continue;
            if (rnd() > occupancy * (occ ? occ(x, z) : 1)) continue;
            people.push({ x: x - nIn.x * 0.12, y: w.top + lerp(lA, lB, t), z: z - nIn.z * 0.12, turn: Math.atan2(stage.x - x, stage.z - z) });
          }
        }
      }
      // up each aisle, a step halfway up every riser, and a light on the tread
      const nxt = rows[i + 1];
      const half = w.seat && nxt && nxt.top - w.top > 0.3 ? (nxt.top - w.top) / 2 : 0;
      const blocked = half ? vomSpans(i).concat(vomSpans(i + 1)) : [];
      if (w.seat) for (const s of D.aisles) {
        if (!inclAt(D, s)) continue;
        const l = liftAt(D, s);
        const p = pt(s, w.d0 + 0.05);
        aisleLights.push({ x: p.x, y: w.top + l + 0.05, z: p.z });
        if (!half || blocked.some(([a, b]) => s > a - D.aisleW / 2 && s < b + D.aisleW / 2)) continue;
        const sa = s - D.aisleW / 2, sb = s + D.aisleW / 2, dm = (w.d0 + w.d1) / 2;
        const A0 = pt(sa, dm), B0 = pt(sb, dm), A1 = pt(sa, w.d1), B1 = pt(sb, w.d1);
        const y0 = w.top + l, y1 = y0 + half;
        const v = (q, y) => V3(q.x, y, q.z);
        const nIn = V3(-A0.nx, 0, -A0.nz);
        quad(v(A0, y0), v(B0, y0), v(B0, y1), v(A0, y1), nIn, 0, 1, 0, 1);
        quad(v(A0, y1), v(B0, y1), v(B1, y1), v(A1, y1), V3(0, 1, 0), 0, 1, 0, 1);
        const tn = V3(A0.nz, 0, -A0.nx);
        quad(v(A0, y0), v(A1, y0), v(A1, y1), v(A0, y1), tn, 0, 1, 0, 1);
        quad(v(B1, y0), v(B0, y0), v(B0, y1), v(B1, y1), tn.clone().negate(), 0, 1, 0, 1);
      }
    });

    // back wall of the tier (the concourse behind the last row), with its doors
    const dB = D.back;
    const topY = D.last;
    const wallH = T.backWall ?? 4;
    const doorSpans = spansOf(D.doors, 0.9);
    for (let k = 0; k < P.length - 1; k++) {
      if (!incl[k]) continue;
      const a = path.at(P[k], dB), b = path.at(P[k + 1], dB);
      const n = V3(-(a.nx + b.nx) / 2, 0, -(a.nz + b.nz) / 2).normalize();
      const pieces = piecesOf(k, doorSpans);
      const draw = (p0, p1, yLow) => {
        const A = lp(a, b, p0), B = lp(a, b, p1);
        const lA = lerp(lift[k], lift[k + 1], p0), lB = lerp(lift[k], lift[k + 1], p1);
        quad(V3(A.x, topY + lA + yLow, A.z), V3(B.x, topY + lB + yLow, B.z), V3(B.x, topY + lB + wallH, B.z), V3(A.x, topY + lA + wallH, A.z), n, 0, 1, 0, 1);
      };
      for (const [p0, p1] of pieces) draw(p0, p1, 0);
      // over each door, the lintel
      for (const [p0, p1] of piecesOf(k, [[-1e9, s0[k]], [s0[k + 1], 1e9]].concat(pieces.map(([q0, q1]) => [lerp(s0[k], s0[k + 1], q0), lerp(s0[k], s0[k + 1], q1)])))) draw(p0, p1, 2.3);
    }
    // behind each door, a short dark passage (a stair door opens onto its landing instead)
    const next = TD[ti + 1];
    const depth = next && next.inner > dB ? clamp(next.inner - dB - 0.1, 0.6, 3.5) : 3.5;
    for (const dr of D.doors) {
      if (dr.stair || !inclAt(D, dr.s)) continue;
      const y = topY + liftAt(D, dr.s);
      tunnelBox(dr.s, dr.w, dB, dB + depth, y, y + 2.3);
    }

    // the tunnels: floor, parapet walls stepping with the rows beside the cut,
    // and a roof once the rows rise over it
    for (const v of D.voms) {
      if (!inclAt(D, v.s)) continue;
      const l = liftAt(D, v.s);
      const yF = v.yF + l, yC = yF + CLEAR;
      const sa = v.s - v.w / 2, sb = v.s + v.w / 2;
      const d0 = rows[v.i0].d0, dCut = v.i1 < rows.length ? rows[v.i1].d0 : D.back;
      // floor through the mouth
      const fa = pt(sa, d0), fb = pt(sb, d0), fc = pt(sb, dCut), fd = pt(sa, dCut);
      quad(V3(fa.x, yF, fa.z), V3(fb.x, yF, fb.z), V3(fc.x, yF, fc.z), V3(fd.x, yF, fd.z), V3(0, 1, 0), 0, 1, 0, 1);
      // parapets either side, stepping up with the cut rows
      for (let i = v.i0; i < v.i1; i++) {
        const w = rows[i];
        for (const [s, sign] of [[sa, 1], [sb, -1]]) {
          const p0 = pt(s, w.d0), p1 = pt(s, w.d1);
          const tn = V3(p0.nz, 0, -p0.nx).multiplyScalar(sign * (O.closed ? 1 : 1));
          quad(V3(p0.x, yF, p0.z), V3(p1.x, yF, p1.z), V3(p1.x, w.top + l + 0.95, p1.z), V3(p0.x, w.top + l + 0.95, p0.z), tn, 0, 1, 0, 1);
        }
      }
      // beyond the mouth, under the rows: a dark passage to the concourse
      if (dCut < D.back) {
        tunnelBox(v.s, v.w, dCut, v.dEnd, yF, yC);
        // the face over the passage, from its roof up to the row above
        const ya = rows[v.i1].below + l;
        const la = pt(sa, dCut), lb = pt(sb, dCut);
        const nf = V3(-la.nx, 0, -la.nz);
        quad(V3(la.x, yC, la.z), V3(lb.x, yC, lb.z), V3(lb.x, ya, lb.z), V3(la.x, ya, la.z), nf, 0, 1, 0, 1);
      }
    }

    // where a tier stops part-way round (an upper deck that only covers the
    // infield), close the end with a wall rather than leave it cut open
    for (let k = 1; k < P.length - 1; k++) {
      if (incl[k] === incl[k - 1]) continue;
      const a = path.at(P[k], inner), b = path.at(P[k], dB);
      const nb = path.at(P[incl[k] ? k + 1 : k - 1], inner);
      const n = V3(a.x - nb.x, 0, a.z - nb.z).normalize();
      const y0 = f0 + lift[k], y1 = topY + wallH + lift[k];
      quad(V3(a.x, y0, a.z), V3(b.x, y0, b.z), V3(b.x, y1, b.z), V3(a.x, y1, a.z), n, 0, 1, y0, y1);
    }
    // an overhanging tier's underside, from the foot of its front to the back
    if (T.soffit) {
      for (let k = 0; k < P.length - 1; k++) {
        if (!incl[k]) continue;
        const a0 = path.at(P[k], inner), b0 = path.at(P[k + 1], inner), a1 = path.at(P[k], dB), b1 = path.at(P[k + 1], dB);
        const yb = topY - 1.4;
        quad(V3(a0.x, f0 + lift[k], a0.z), V3(a1.x, yb + lift[k], a1.z), V3(b1.x, yb + lift[k + 1], b1.z), V3(b0.x, f0 + lift[k + 1], b0.z), V3(0, -1, 0), 0, 1, 0, 1);
      }
    }
    // an open outline's ends: a wall from the floor to the top of the tier
    if (caps) {
      const top = topY + wallH;
      for (const [k, sgn] of [[0, 1], [P.length - 1, -1]]) {
        const a = path.at(P[k], inner), b = path.at(P[k], dB);
        const t = path.at(P[k + sgn] || P[k], inner);
        const n = V3(a.x - t.x, 0, a.z - t.z).normalize();
        quad(V3(a.x, 0, a.z), V3(b.x, 0, b.z), V3(b.x, top, b.z), V3(a.x, top, a.z), n, 0, 1, 0, top);
      }
    }
  });

  // a dark passage: floor, two walls, roof and a closed end
  function tunnelBox(s, w, d0, d1, y0, y1) {
    const sa = s - w / 2, sb = s + w / 2;
    const A0 = pt(sa, d0), B0 = pt(sb, d0), A1 = pt(sa, d1), B1 = pt(sb, d1);
    const v = (p, y) => V3(p.x, y, p.z);
    quad(v(A0, y0 + 0.01), v(B0, y0 + 0.01), v(B1, y0 + 0.01), v(A1, y0 + 0.01), V3(0, 1, 0), 0, 1, 0, 1, G.dark);
    quad(v(A0, y1), v(A1, y1), v(B1, y1), v(B0, y1), V3(0, -1, 0), 0, 1, 0, 1, G.dark);
    const tn = V3(A0.nz, 0, -A0.nx);
    quad(v(A0, y0), v(A1, y0), v(A1, y1), v(A0, y1), tn, 0, 1, 0, 1, G.dark);
    quad(v(B1, y0), v(B0, y0), v(B0, y1), v(B1, y1), tn.clone().negate(), 0, 1, 0, 1, G.dark);
    quad(v(B1, y0), v(A1, y0), v(A1, y1), v(B1, y1), V3(-A1.nx, 0, -A1.nz), 0, 1, 0, 1, G.dark);
  }

  const mk = ([p, n, u]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); return g; };
  const conc = withRepeat(concreteTex({ key: `bowlconc${concreteTone}`, tone: concreteTone }), 1 / 4, 1 / 4);
  const structMat = std({ ...conc, color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const struct = new THREE.Mesh(mk(G.struct), structMat);
  struct.receiveShadow = true;
  g.add(struct);
  const seats = new THREE.Mesh(mk(G.seats), std({ ...seatStripTex(seatColor), roughness: 0.6, side: THREE.DoubleSide }));
  seats.userData.noCollide = true;
  g.add(seats);
  if (G.tarp[0].length) g.add(new THREE.Mesh(mk(G.tarp), std({ color: 0x050506, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide })));
  if (G.dark[0].length) g.add(new THREE.Mesh(mk(G.dark), std({ color: 0x0a0a0c, roughness: 1, side: THREE.DoubleSide })));
  if (stairGeos.length) {
    const stairs = new THREE.Mesh(mergeGeometries(stairGeos), structMat);
    stairs.receiveShadow = true;
    stairs.userData.flights = flights;
    g.add(stairs);
  }
  return { group: g, people, aisleLights, fascias, path, outline: O, tiers: TD };
}

// LED ribbon boards along the tier fronts.
export function ribbonBoards(bowl, { height = 0.9, tiers = [0], bright = 1.4 } = {}) {
  const pos = [], uv = [];
  const P = bowl.path.pts;
  let total = 0;
  for (const ti of tiers) {
    const F = bowl.fascias[ti];
    if (!F) continue;
    const y1 = F.y1 - 0.25, y0 = y1 - height;
    const d = F.inset - 0.04;
    for (let k = 0; k < P.length - 1; k++) {
      if (!F.incl[k]) continue;
      const a = bowl.path.at(P[k], d), b = bowl.path.at(P[k + 1], d);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (const [p, u, v] of [[[a.x, y0, a.z], total, 0], [[b.x, y0, b.z], total + len, 0], [[b.x, y1, b.z], total + len, 1], [[a.x, y0, a.z], total, 0], [[b.x, y1, b.z], total + len, 1], [[a.x, y1, a.z], total, 1]]) {
        pos.push(...p); uv.push(u / 60, v);
      }
      total += len;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = ledMaterial({ tex: null, pitch: 0.012, w: total / 60 * 60, h: height, bright, kind: 'ribbon' });
  mat.uniforms.uPix.value.set(60 / 0.02, height / 0.02);
  mat.side = THREE.DoubleSide;
  return new THREE.Mesh(geo, mat);
}
