// ─────────────────────────────────────────────────────────────────────────────
// DOME — Tokyo Dome: an air-supported membrane, 1.24 million m³, its ring
// leaning 1/10 down from the infield to the outfield, from FOH 55 m out on
// the field. Blue seats in the 1st-floor stand, the balcony band and the
// steep 2nd-floor stand standing out over it under the roof; the lights and
// loudspeakers hung from the roof's cables; arena seats in
// blocks on the field; a short runway to a long stage across the field; a
// sea of lightsticks under
// central control.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, DEG, KELVIN, V3, clamp, lerp, prng, std, floorPanelTex, glowMat, ringTint } from '../core.js';
import { lightPoints } from '../people.js';
import { hoists, micStand, shadowSpot, stageDeck, stageSteps, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, crossThrust, diagonalTowers, roundBlocks, roundStage, delayTower, fixtureRow, flashOnCrowd, flashUnits, floorChairs, fohPosition, fromRow, groundRoof, paCorner, paHang, paPair, paWing, runBlinders, runShow, runStrobes, scaffoldMasking, screenHang, section, stageRing, subLine, thinRow, wallStrip } from '../show.js';
import { buildStands, decodeSeats } from '../stands.js';
import { TD_STANDS } from './td-data.js';

export function membraneMaterial() {
  // The roof from inside, as it looks: a cable net in two families, one
  // along the home–centre axis and one across it, 8.5 m apart (the plan is a
  // square set corner-on to home plate, the cables parallel to its
  // diagonals), the membrane between them held up by the air in
  // shallow pillows — each a soft bulge, lighter in its middle, a darker
  // crease along the cables — the whole a warm off-white, lit through by the
  // daylight outside (it lets about a twentieth of it through).
  const m = std({ color: 0xe9dcc4, roughness: 0.92, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBounce = { value: new THREE.Color(0) };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform vec3 uBounce;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // the pillow's bulge tilts the normal away from its middle
          vec2 p = vec2(vWP.x, vWP.z) / 8.5 + 0.5;
          vec2 d = fract(p) - 0.5;
          vec3 tx = vec3(1.0, 0.0, 0.0), tz = vec3(0.0, 0.0, 1.0);
          normal = normalize(normal + (tx * d.x + tz * d.y) * 0.9);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec2 p = vec2(vWP.x, vWP.z) / 8.5 + 0.5;
          vec2 d = abs(fract(p) - 0.5);
          vec2 w = fwidth(p);
          // the crease along each cable, soft either side
          float crease = 1.0 - min(smoothstep(0.0, 0.07 + w.x, 0.5 - d.x), smoothstep(0.0, 0.07 + w.y, 0.5 - d.y));
          float cable = 1.0 - min(smoothstep(0.0, w.x * 1.2 + 0.004, 0.5 - d.x), smoothstep(0.0, w.y * 1.2 + 0.004, 0.5 - d.y));
          // the bulge: lighter in the middle of each pillow
          float bulge = 1.0 - 0.9 * dot(d, d);
          diffuseColor.rgb *= bulge * (1.0 - 0.35 * crease) * (1.0 - 0.5 * cable);
          totalEmissiveRadiance += uBounce * bulge * (1.0 - 0.4 * crease);
        }`);
  };
  m.customProgramCacheKey = () => 'membrane3';
  return m;
}

export function buildDome(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 2.6;
  // FOH, and the listener there: at the very back of the field's seats, in
  // the middle, the blocks either side of it
  const eye = V3(0, 1.6 + 1.0, 122);
  // (the end stage's; round, the field's middle: set below)
  let STAGE = V3(0, DECK, 28);
  const round = ctx.mode === '360';
  // The ballpark as the official seating map draws it: the field is the open
  // ground inside the 1st floor's front rows; home plate is behind FOH, the
  // stage stands in front of the centre-field fence.
  const ZH = 114;                 // home plate
  const OFF = V3(0, 0, ZH);
  const fieldRing = TD_STANDS.field[0][0].map(([x, z]) => ({ x, z: z + ZH }));
  if (round) { const zs = fieldRing.map((p) => p.z); STAGE = V3(0, DECK, (Math.min(...zs) + Math.max(...zs)) / 2); }
  // the fence round the field and, along the lines, behind the excite seats
  const fenceRing = (TD_STANDS.fence ? TD_STANDS.fence[0][0] : TD_STANDS.field[0][0]).map(([x, z]) => ({ x, z: z + ZH }));
  const inRing = (ring, x, z) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const phi = (x, z) => Math.abs(Math.atan2(x, ZH - z)) / DEG;   // 0 at centre field, 45 at the poles

  // ── field ──
  const fieldShape = new THREE.Shape(fieldRing.map((p) => new THREE.Vector2(p.x, -p.z)));
  const fieldGeo = new THREE.ShapeGeometry(fieldShape, 1);
  fieldGeo.rotateX(-Math.PI / 2);
  const fuv = fieldGeo.attributes.uv; const fpos = fieldGeo.attributes.position;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / 16, fpos.getZ(i) / 16);
  const field = new THREE.Mesh(fieldGeo, std({ ...floorPanelTex({ key: 'domefloor', tone: 0.1 }), roughness: 0.8 }));
  field.position.y = 0.02; field.receiveShadow = true; root.add(field);

  // ── the roof's geometry, from the drawings of it ──
  // In plan a superellipse set corner-on to home plate: 201 m from corner to
  // corner along the home–centre axis and across it, its sides bulging out
  // (180.6 m apart across the diagonals), its centre 33 m out from home
  // plate. The compression ring round it leans 1/10 from the infield down to
  // the outfield, 44.7 m over the field at the home corner and 24.7 m at the
  // centre-field corner; the air holds the membrane 25 m over the ring's
  // plane, its crown 60.7 m up, 20 m in from the centre towards home. The
  // building's wall stands 5 m out from the ring.
  const ZC = ZH - 33, RA = 100.5, NE = 1.53, RISE = 25, DOME_WALL = 1.09;
  const ringY = (z) => 34.7 + 0.1 * (z - ZC);
  const norm = (x, z) => (Math.abs(x / RA) ** NE + Math.abs((z - ZC) / RA) ** NE) ** (1 / NE);
  const roofAt = (x, z) => ringY(z) + RISE * (1 - Math.min(1, norm(x, z)) ** 2);
  const edge = (t, rho = 1) => {
    const c = Math.cos(t), sn = Math.sin(t);
    return { x: rho * RA * Math.sign(c) * Math.abs(c) ** (2 / NE), z: ZC + rho * RA * Math.sign(sn) * Math.abs(sn) ** (2 / NE) };
  };

  // ── the stands, from the official seating map ──
  // The 1st floor: blocks A (rows 1–26) and B (27–47) round the infield with
  // the walkway between them, entered from the concourse behind by the
  // numbered passages at the back; the outfield's F blocks above the fence.
  // The balcony (C) over the back of the 1st floor, pole to pole round home.
  // The 2nd floor: D (rows 1–10) and E (11 up to 33, deepest behind home)
  // with the walkway between, the passages from its concourse opening onto
  // it; its front stands out 12 m over the 1st floor. Blue seats, the
  // balcony's (season seats) grey. Sold out as a concert sells it: every
  // seat that can see the face of the wall, the restricted-view ones beside
  // the stage and the outfield's ends past the poles included; the outfield
  // behind the set not.
  // ── the 2nd floor's box seats (the 2022 renewal) ──
  // Two rows across the 2nd floor on the 1st- and 3rd-base sides, in the
  // infield (about six of its blocks, as the photographs show it, not out
  // towards the outfield): the last two rows of D, under the walkway between
  // D and E, made into boxes of four seats. Each row has a long light-wood counter at table height in front
  // of its seats, with cup holes, on a wooden front down to the tread; light-wood
  // half-height partitions between the boxes; the seats grey, not blue. Phi is
  // the angle from the centre-field line seen from home plate (the foul lines
  // at 45). (D's last rows run ragged: the two rows are the two highest that
  // run the whole way along it, on each side, and the odd seats that stand
  // up behind them there are left out, so the boxes run as two clean rows.)
  const BOX = { level: 'D', phi: [85, 115], per: 4 };
  // the backscreen's sector of the outfield stand, either side of the
  // centre-field line (the official map's F09 and F12 begin at 8.4°)
  const BSC = 8.4;
  const inBackscreen = (x, z) => Math.abs(Math.atan2(x, -z)) / DEG < BSC;
  // (each side's top box row: the highest with a seat in at least four
  // degrees of every five along the run)
  const boxTop = new Map();
  {
    const L = TD_STANDS.levels.find((l) => l.name === BOX.level), S = decodeSeats(L.seats), sk = L.seatScale ?? 10;
    const seen = new Map();
    for (let i = 0; i < S.length; i += 4) {
      const x = S[i] / sk, z = S[i + 1] / sk, f = Math.floor(Math.abs(Math.atan2(x, -z)) / DEG);
      if (f < BOX.phi[0] || f > BOX.phi[1]) continue;
      const key = `${Math.sign(x)}:${S[i + 2]}`;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key).add(f);
    }
    const span = BOX.phi[1] - BOX.phi[0] + 1;
    for (const [key, fs] of seen) {
      const [side, row] = key.split(':').map(Number);
      if (fs.size >= 0.8 * span) boxTop.set(side, Math.max(boxTop.get(side) ?? 0, row));
    }
  }
  const inRun = (name, x, z) => {
    if (name !== BOX.level) return false;
    const f = Math.abs(Math.atan2(x, -z)) / DEG;
    return f >= BOX.phi[0] && f <= BOX.phi[1];
  };
  const inBox = (name, x, z, row) => inRun(name, x, z) && (row === boxTop.get(Math.sign(x)) || row === boxTop.get(Math.sign(x)) - 1);
  // the table seats behind the 3B side's B31-B33 (the rows past their 35th): bright blue
  const TABLES = (TD_STANDS.levels.find((l) => l.name === 'B')?.tables ?? []).map((r) => r.map(([x, z]) => ({ x, z })));
  // ── the main screen's line (built further on) ──
  // Along the curve of the outfield stand's back, over its back rows, where
  // the columns at the heads of its aisles stand: they carry it.
  const MV = (() => {
    const F = TD_STANDS.levels.find((l) => l.name === 'F');
    let ftop = 0;
    const far = new Map();                 // the stand's back, by the angle from home (0 at centre field)
    for (const r of F.rows) {
      ftop = Math.max(ftop, r.y);
      for (const p of r.polys) for (const ring of p) for (const [x, z] of ring) {
        const a = Math.round(Math.atan2(x, -z) / DEG * 2) / 2, d = Math.hypot(x, z);
        if (!(far.get(a) >= d)) far.set(a, d);
      }
    }
    const angs = [...far.keys()].filter((a) => Math.abs(a) <= 44).sort((u, v) => u - v);
    const back = angs.map((a) => { let sm = 0, w = 0; for (const b of angs) if (Math.abs(b - a) <= 3) { sm += far.get(b); w++; } return { a, d: sm / w - 3.0 }; });
    const pts = back.map(({ a, d }) => ({ x: Math.sin(a * DEG) * d, z: ZH - Math.cos(a * DEG) * d, a }));
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const mid = len[back.findIndex((b) => b.a >= 0)];
    const along = (w) => pts.filter((_, i) => Math.abs(len[i] - mid) <= w / 2);
    const band = along(125.6), lower = along(20);
    // level, its top 2 m under the floods where the ring is lowest over it
    // (room for the sign over its middle)
    const y1 = Math.min(...band.map((p) => ringY(p.z))) - 1.6 - 2.0, y0 = y1 - 7.5, yl = y0 - 5.4;
    return { F, ftop, pts, len, mid, band, lower, y0, y1, yl, a0: band[0].a, a1: band[band.length - 1].a };
  })();
  // (the columns under it end at its frame)
  const underMV = (p) => Math.hypot(p.x, p.z) > 110 && (() => { const a = Math.atan2(p.x, -p.z) / DEG; return a >= MV.a0 && a <= MV.a1; })();
  const TD = { ...TD_STANDS, pillars: TD_STANDS.pillars.map((p) => (underMV(p) ? { ...p, y1: MV.y0 - 0.4 } : p)) };
  const stands = buildStands(TD, {
    // (the lightsticks' blocks by the stands' own aisles)
    byAisle: true,
    // (one wedge across every level, cut where the 1st floor's aisles run)
    sectors: ['A', 'F'], round,
    offset: OFF, stage: STAGE, seed: 400, concreteTone: 0.28, roofY: (x, z) => ringY(z + ZH) + 0.3,
    seatColors: { A: 0x1d3c86, B: 0x1d3c86, F: 0x1d3c86, K: 0x1d3c86, G: 0x1d3c86, C: 0x5a5d63, D: 0x1d3c86, E: 0x1d3c86 },
    seatColorAt: (name, x, z, row) => (inBox(name, x, z, row) ? 0x6a6b6e : name === 'B' && TABLES.some((r) => inRing(r, x, z)) ? 0x2a4fd6 : null),
    // the backscreen: the outfield stand's middle, between F09 and F12, has
    // no seats (its steps are painted dark, below)
    seatKeep: (name, x, z, row) => !(name === 'F' && inBackscreen(x, z)) && !(inRun(name, x, z) && row > boxTop.get(Math.sign(x))),
    crowd: !!q.crowd,
    // the lightsticks' floors as the building counts them, [floor, band from
    // the front]: the 1st floor (the field-level seats, A, B behind it, and
    // the outfield's F beside them), the balcony, the 2nd floor (D, E behind)
    tiers: { G: [1, 0], A: [1, 1], B: [1, 2], F: [1, 1], C: [2, 0], D: [3, 0], E: [3, 1] },
    // (round, every seat; else those in front of the wall: face z 19.6, 66 m wide)
    sold: round ? () => true : (x, z) => z - 19.6 > Math.max(4, 0.12 * (Math.abs(x) - 33)),
    // the side walls where a stand drops away: the stands' own concrete,
    // not dark steel
    materials: { rail: std({ color: 0x77736c, roughness: 0.92, side: THREE.DoubleSide }) },
  });
  root.add(stands.group);
  {
    const L = TD_STANDS.levels.find((l) => l.name === BOX.level), S = decodeSeats(L.seats), sk = L.seatScale ?? 10;
    const rows = new Map();
    for (let i = 0; i < S.length; i += 4) {
      const x = S[i] / sk, z = S[i + 1] / sk, row = S[i + 2];
      if (!inBox(L.name, x, z, row)) continue;
      const yaw = S[i + 3] * DEG, side = Math.sign(x), key = `${side}:${row}`;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x, z: z + ZH, y: L.hs ? L.hs[row] : L.h0 + L.rise * row, fx: Math.sin(yaw), fz: Math.cos(yaw), a: Math.atan2(x, -z) });
    }
    const wood = [], holes = [];
    const piece = (out, w, h, d, x, y, z, rotY) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateY(rotY); b.translate(x, y, z); out.push(b); };
    for (const seats of rows.values()) {
      seats.sort((p, q2) => p.a - q2.a);
      seats.forEach((s, k) => {
        const rot = Math.atan2(s.fx, s.fz);
        // the counter and its front, the width of the seat (and a little over, so they run on unbroken)
        piece(wood, 0.56, 0.035, 0.34, s.x + s.fx * 0.52, s.y + 0.72, s.z + s.fz * 0.52, rot);
        piece(wood, 0.56, 0.72, 0.03, s.x + s.fx * 0.68, s.y + 0.36, s.z + s.fz * 0.68, rot);
        piece(holes, 0.08, 0.004, 0.08, s.x + s.fx * 0.52, s.y + 0.74, s.z + s.fz * 0.52, rot);
        // a partition between every fourth seat and the next, and at both ends
        // of the run (half a seat out, away from its neighbour)
        const wall = (x, z) => piece(wood, 0.04, 1.1, 0.95, x + s.fx * 0.22, s.y + 0.55, z + s.fz * 0.22, rot);
        const o = seats[k + 1];
        if (o && (k + 1) % BOX.per === 0) wall((s.x + o.x) / 2, (s.z + o.z) / 2);
        for (const [e, n] of [[0, 1], [seats.length - 1, seats.length - 2]]) {
          if (k !== e || !seats[n]) continue;
          const dx = s.x - seats[n].x, dz = s.z - seats[n].z, l = Math.hypot(dx, dz) || 1;
          wall(s.x + dx / l * 0.27, s.z + dz / l * 0.27);
        }
      });
    }
    const birch = std({ color: 0xc9a06a, roughness: 0.9, envMapIntensity: 0.3 });
    const wm = new THREE.Mesh(mergeGeometries(wood), birch); wm.receiveShadow = true; wm.castShadow = true;
    root.add(wm, new THREE.Mesh(mergeGeometries(holes), std({ color: 0x141414, roughness: 0.9 })));
  }
  // the boxes behind home at the balcony's level (S101–110 and S301–310
  // either side of the VIP box): glass fronts between mullions, lit within,
  // under the 2nd floor's front
  if (TD_STANDS.suites) {
    const { line, y, h, depth } = TD_STANDS.suites;
    const P = line.map(([x, z]) => ({ x, z: z + ZH }));
    const out = (p) => { const dx = p.x, dz = p.z - (ZH - 60), l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const glass = [], frame = [], lit = [];
    let run = 0;
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.05) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = -Math.atan2(b.z - a.z, b.x - a.x), [ux, uz] = out({ x: mx, z: mz });
      const g = new THREE.PlaneGeometry(len + 0.02, h - 0.9); g.rotateY(ang); g.translate(mx, y + 0.1 + (h - 0.9) / 2, mz); glass.push(g);
      const sill = new THREE.BoxGeometry(len + 0.04, 1.0, 0.25); sill.rotateY(ang); sill.translate(mx, y + 0.1 + h - 0.9 + 0.4, mz); frame.push(sill);
      const top = new THREE.BoxGeometry(len + 0.04, 0.4, depth); top.rotateY(ang); top.translate(mx + ux * depth / 2, y + h + 0.2, mz + uz * depth / 2); frame.push(top);
      const back = new THREE.PlaneGeometry(len + 0.02, h - 0.4); back.rotateY(ang); back.translate(mx + ux * (depth - 0.2), y + 0.1 + (h - 0.4) / 2, mz + uz * (depth - 0.2)); lit.push(back);
      run += len;
      if (run > 3.8) {
        run = 0;
        const m = new THREE.BoxGeometry(0.18, h, 0.2); m.translate(b.x, y + h / 2, b.z); frame.push(m);
        const wall = new THREE.BoxGeometry(0.12, h, depth); wall.rotateY(ang + Math.PI / 2); wall.translate(b.x + ux * depth / 2, y + h / 2, b.z + uz * depth / 2); frame.push(wall);
      }
    }
    if (frame.length) {
      root.add(new THREE.Mesh(mergeGeometries(frame.map((g) => (g.index ? g.toNonIndexed() : g))), std({ color: 0x2c2d31, roughness: 0.6 })));
      root.add(new THREE.Mesh(mergeGeometries(glass), std({ color: 0x0c0e12, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.5, side: THREE.DoubleSide })));
      root.add(new THREE.Mesh(mergeGeometries(lit), std({ color: 0x1a1612, roughness: 0.8, emissive: 0x6a4a2a, emissiveIntensity: 0.3, side: THREE.DoubleSide })));
    }
  }
  // the wall in front of the 1st floor (behind the excite seats along the
  // lines): padded 4.0 m with 0.24 m of net and the
  // yellow line in the outfield, a low padded wall along the lines (for a
  // concert the backstop net behind home plate is taken down)
  // one continuous wall round the field, its height eased along it
  const ringPts = [], ringH = [], ringOut = [], ringTop = [];
  {
    // the traced ring resampled evenly, every half metre
    const src = fenceRing.concat([fenceRing[0]]);
    let acc = 0;
    for (let k = 0; k + 1 < src.length; k++) {
      const a = src[k], b = src[k + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = acc; t < len; t += 0.5) ringPts.push({ x: a.x + (b.x - a.x) * t / len, z: a.z + (b.z - a.z) * t / len });
      acc = Math.max(0, (Math.ceil((len - acc) / 0.5) * 0.5 + acc) - len);
    }
    const n = ringPts.length;
    for (let i = 0; i < n; i++) {
      const a = ringPts[(i - 1 + n) % n], b = ringPts[(i + 1) % n], p = ringPts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len, sd = nx * p.x + nz * (p.z - (ZH - 60)) > 0 ? 1 : -1;
      // up to the front of the stand behind it (towards the poles the front
      // rows stand high, the fence having cut off the ones below)
      const top = stands.topAt(p.x + nx * sd * 0.6, p.z + nz * sd * 0.6);
      const outfield = Math.hypot(p.x, p.z - ZH) > 92 && phi(p.x, p.z) < 46;
      ringOut.push(outfield);
      ringH.push(outfield ? Math.max(4.0, top) : Math.max(1.2, top));
      ringTop.push(top);
    }
    // one height all round the outfield (its stand's front row is level), and
    // from home out to each pole only ever rising with the stands' fronts
    // (never below one, so no front's face shows over it; no dip and rise
    // past the poles), up to the outfield's height at the pole
    const outs = ringH.filter((_, i) => ringOut[i]).sort((a, b) => a - b);
    const outH = outs.length ? outs[outs.length >> 1] : 4.0;
    for (let i = 0; i < n; i++) if (ringOut[i]) ringH[i] = outH;
    let home = -1, hp = -1;
    for (let i = 0; i < n; i++) if (!ringOut[i]) { const f = phi(ringPts[i].x, ringPts[i].z); if (f > hp) { hp = f; home = i; } }
    for (const step of [1, -1]) {
      let h = 0;
      for (let k = 0; k < n; k++) {
        const j = (home + step * k + n * 4) % n;
        if (ringOut[j]) break;
        h = Math.min(outH, Math.max(h, ringH[j])); ringH[j] = h;
      }
    }
    // behind home plate (the backstop) the padded wall stands 2.2 m at the least (the stands' front
    // rows are laid level with it: td_stand1.fit_rake's fmin), easing back to the lines' height
    // between 25 and 45 degrees off the line behind the catcher
    for (let i = 0; i < n; i++) {
      if (ringOut[i]) continue;
      const off = 180 - phi(ringPts[i].x, ringPts[i].z), t = Math.min(1, Math.max(0, (45 - off) / 20)), w = t * t * (3 - 2 * t);
      if (w > 0) ringH[i] = Math.max(ringH[i], ringH[i] + w * (Math.max(2.2, ringTop[i]) - ringH[i]));
    }
    // and nowhere under the front of the stand behind it (its concrete face showed over the padding),
    // never over the outfield's height (td_stand1.fit_rake keeps the fronts under it)
    for (let i = 0; i < n; i++) ringH[i] = Math.max(ringH[i], Math.min(outH, ringTop[i]));
  }
  // (open at the mouth of the tunnel under A02: the wall stops either side of it, a swing gate between)
  const tunnels = TD_STANDS.tunnels ?? [];
  const inMouth = ringPts.map((p) => tunnels.some((t) => {
    const dx = p.x - t.p[0], dz = p.z - ZH - t.p[1], a = dx * t.u[0] + dz * t.u[1], b = -dx * t.u[1] + dz * t.u[0];
    return Math.abs(b) < t.w / 2 + 0.05 && a > -3 && a < 3;
  }));
  let padGeo;
  if (!inMouth.some(Boolean)) padGeo = wallStrip(ringPts, ringH, { thick: 0.36, closed: true, ease: 6 });
  else {
    const n = ringPts.length, s0 = inMouth.indexOf(true), parts = [];
    let run = [];
    for (let k = 1; k <= n; k++) {
      const i = (s0 + k) % n;
      if (inMouth[i]) { if (run.length > 1) parts.push(run); run = []; } else run.push(i);
    }
    if (run.length > 1) parts.push(run);
    padGeo = mergeGeometries(parts.map((r) => wallStrip(r.map((i) => ringPts[i]), r.map((i) => ringH[i]), { thick: 0.36, ease: 6 })).filter(Boolean));
  }
  for (const t of tunnels) {
    if (!t.gate) continue;
    // two padded leaves hinged at the mouth's sides, standing a little open into the tunnel
    const vx = -t.u[1], vz = t.u[0], lw = t.w / 2 - 0.03;
    for (const sg of [-1, 1]) {
      const hx = t.p[0] + vx * sg * t.w / 2, hz = t.p[1] + ZH + vz * sg * t.w / 2;
      // (as high as the padded wall beside it)
      let gh = 2.4, bd = Infinity;
      ringPts.forEach((q, i) => { if (inMouth[i]) return; const d = Math.hypot(q.x - hx, q.z - hz); if (d < bd) { bd = d; gh = ringH[i]; } });
      const ang = Math.atan2(vx, vz) + sg * 0.35;            // the leaf's run from its hinge, swung 20 degrees in
      const dx = -Math.sin(ang) * sg, dz = -Math.cos(ang) * sg;
      const leaf = new THREE.BoxGeometry(0.22, gh, lw);      // (padded, as thick as the wall's padding)
      leaf.rotateY(Math.atan2(dx, dz)); leaf.translate(hx + dx * lw / 2, gh / 2, hz + dz * lw / 2);
      root.add(new THREE.Mesh(leaf, std({ color: 0x0b2a1a, roughness: 0.8 })));
      // the cut's side padded as the wall is, from the wall back to its end, stepping up with the rows
      // beside it (no bare concrete of the stand's fronts showing either side of the mouth)
      const prof = (t.sides?.[0] ?? []).length ? t.sides[0] : [[0, gh], [t.deck ?? 1, gh]];
      const yaw = Math.atan2(t.u[0], t.u[1]), off = sg * (t.w / 2 + 0.18);
      for (let i = 0; i < prof.length; i++) {
        const a0 = i === 0 ? -0.2 : (prof[i - 1][0] + prof[i][0]) / 2, a1 = i === prof.length - 1 ? prof[i][0] + 0.15 : (prof[i][0] + prof[i + 1][0]) / 2;
        const top = Math.max(i === 0 ? gh : 0, prof[i][1]), seg = new THREE.BoxGeometry(0.36, top, a1 - a0);
        seg.rotateY(yaw); seg.translate(t.p[0] + vx * off + t.u[0] * (a0 + a1) / 2, top / 2, t.p[1] + ZH + vz * off + t.u[1] * (a0 + a1) / 2);
        root.add(new THREE.Mesh(seg, std({ color: 0x0b2a1a, roughness: 0.8 })));
      }
    }
    // a concrete slab over the mouth, level with the stand's front (the walk along the front rows carried
    // across), the cut behind it open to the roof as the real one, the tunnel proper roofed under the rows
    if (t.sides?.[0]?.length) {
      const fy = t.sides[0][0][1], sd = 1.3;
      const slab = new THREE.BoxGeometry(t.w + 0.72, 0.35, sd);
      slab.rotateY(Math.atan2(t.u[0], t.u[1]));
      slab.translate(t.p[0] + t.u[0] * (sd / 2 - 0.2), fy - 0.175, t.p[1] + ZH + t.u[1] * (sd / 2 - 0.2));
      root.add(new THREE.Mesh(slab, std({ color: 0x8a857c, roughness: 0.9 })));
    }
  }
  // steps from the field up over the low wall into the 1st floor's front
  // rows, round foul territory either side (the way the field's crowd comes
  // and goes from the stands at a concert)
  for (const want of [95, 125, 160]) for (const sd of [-1, 1]) {
    let best = -1, bd = Infinity;
    // (only where the fence stands on the field itself, not behind the excite seats)
    const onFieldEdge = (p) => { const dx = -p.x, dz = ZH - 60 - p.z, l = Math.hypot(dx, dz) || 1; return inRing(fieldRing, p.x + dx / l * 1.5, p.z + dz / l * 1.5); };
    ringPts.forEach((p, i) => { if (ringOut[i] || Math.sign(p.x) !== sd || !onFieldEdge(p)) return; const d = Math.abs(phi(p.x, p.z) - want); if (d < bd) { bd = d; best = i; } });
    if (best < 0) continue;
    const n = ringPts.length, a = ringPts[(best - 2 + n) % n], c = ringPts[(best + 2) % n], p = ringPts[best];
    let ux = -(c.z - a.z), uz = c.x - a.x; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    if (ux * p.x + uz * (p.z - (ZH - 60)) < 0) { ux = -ux; uz = -uz; }   // outwards, from the field to the stand
    const h = ringH[best], run = 0.28, len = Math.ceil(h / 0.2) * run;
    root.add(stageSteps({ x: p.x - ux * (len + 0.2), z: p.z - uz * (len + 0.2), h, dir: [ux, uz], width: 1.6 }));
  }
  root.add(new THREE.Mesh(padGeo, std({ color: 0x0b2a1a, roughness: 0.8 })));
  // the low padded fence (1.0 m) in front of the excite seats, where the
  // field's edge runs out ahead of the fence behind them
  {
    const src = fieldRing.concat([fieldRing[0]]), pts = [];
    for (let k = 0; k + 1 < src.length; k++) {
      const a = src[k], b = src[k + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0; t < len; t += 0.5) pts.push({ x: a.x + (b.x - a.x) * t / len, z: a.z + (b.z - a.z) * t / len });
    }
    const off = pts.map((p) => { let m = Infinity; for (const q of ringPts) m = Math.min(m, (q.x - p.x) ** 2 + (q.z - p.z) ** 2); return m > 1.2 * 1.2; });
    const lowMat = std({ color: 0x0b2a1a, roughness: 0.8 });
    let run = [];
    const flush = () => { if (run.length > 3) { const g = wallStrip(run, run.map(() => 1.0), { thick: 0.22, ease: 0 }); if (g) root.add(new THREE.Mesh(g, lowMat)); } run = []; };
    pts.forEach((p, i) => { if (off[i]) run.push(p); else flush(); });
    flush();
  }
  // the yellow line along the top of the outfield fence, and its net
  {
    const n = ringPts.length, eased = ringH.map((_, i) => { let s = 0, w = 0; for (let k = -6; k <= 6; k++) { const wk = 7 - Math.abs(k); s += ringH[(i + k + n) % n] * wk; w += wk; } return s / w; });
    let i0 = ringOut.findIndex((o, i) => o && !ringOut[(i - 1 + n) % n]);
    if (i0 >= 0) {
      const run = [];
      for (let k = 0; k < n && ringOut[(i0 + k) % n]; k++) run.push((i0 + k) % n);
      const pts = run.map((i) => ringPts[i]), top = run.map((i) => eased[i]);
      const lineGeo = wallStrip(pts, top.map((h) => h + 0.12), { y0: top.map((h) => h + 0.005), thick: 0.4, ease: 0 });
      if (lineGeo) root.add(new THREE.Mesh(lineGeo, std({ color: 0xc9a82a, roughness: 0.7 })));   // paint, unlit
      // the net over it, 0.24 m (the fence 4.24 m in all)
      const netGeo = wallStrip(pts, top.map((h) => h + 0.36), { y0: top.map((h) => h + 0.12), thick: 0.04, ease: 0 });
      if (netGeo) root.add(new THREE.Mesh(netGeo, std({ color: 0x1a1c1e, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false })));
      // the ribbon screens (1.28 × 53.76 m) along the top of the fence's face
      // from each pole towards left- and right-centre; off for a concert
      const inward = (p) => { const dx = -p.x, dz = ZH - 60 - p.z, l = Math.hypot(dx, dz) || 1; return { x: p.x + dx / l * 0.22, z: p.z + dz / l * 0.22 }; };
      const L = Math.round(53.76 / 0.5);
      for (const part of [run.slice(0, L), run.slice(-L)]) {
        // (level, at the outfield fence's own height: the fence's eased top dips towards the pole, where it meets the infield's)
        const lvl = top.slice().sort((a, b) => a - b)[top.length >> 1];
        const rp = part.map((i) => inward(ringPts[i])), rt = part.map(() => lvl);
        const rg = wallStrip(rp, rt.map((h) => h - 0.15), { y0: rt.map((h) => h - 1.43), thick: 0.06, ease: 0 });
        // (matt, as a screen switched off: glossy it took the room's light and read as the stand's concrete)
        if (rg) root.add(new THREE.Mesh(rg, std({ color: 0x0a0b0c, roughness: 0.85, metalness: 0, envMapIntensity: 0.1 })));
      }
    }
  }
  // the foul poles, on the lines just behind the fence: each stands in the
  // outfield stand's front rows, from its treads (not the field), up to 26 m;
  // flat paint and a net screen, lit by the room like the rest of it (no
  // shine, no glow of their own)
  for (const sd of [-1, 1]) {
    const at = (r) => [sd * r * Math.SQRT1_2, ZH - r * Math.SQRT1_2];
    let r = 98;
    while (r < 115 && stands.topAt(...at(r)) < 1) r += 0.1;
    const [x, z] = at(r + 0.6), y0 = stands.topAt(x, z), top = 26;
    const paint = { color: 0xd9b81a, roughness: 1, metalness: 0, envMapIntensity: 0 };
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, top - y0, 12), std(paint));
    pole.position.set(x, (y0 + top) / 2, z); root.add(pole);
    const fy0 = y0 + 2.5, fy1 = top - 2;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, fy1 - fy0), std({ ...paint, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    flag.position.set(x - sd * 0.8, (fy0 + fy1) / 2, z); flag.rotation.y = sd * Math.PI / 4; root.add(flag);
  }

  // ── the membrane ──
  // (its geometry, ZC, ringY, roofAt and edge, is set out before the stands)
  const membrane = membraneMaterial();
  membrane.side = THREE.DoubleSide;
  {
    const I = 160, J = 28;
    const pos = [], idx = [];
    for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) {
      const e = edge(i / I * Math.PI * 2, j / J);
      pos.push(e.x, roofAt(e.x, e.z), e.z);
    }
    for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) {
      const a = j * (I + 1) + i, b = a + 1, c = a + I + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, membrane));
  }
  // Nothing hangs from the membrane (as the photographs show it: no light
  // gondolas, no loudspeakers on it); the house light comes from round the
  // ring, over the top of the stands, aimed down and in at the field.
  const LIGHTS = [];
  for (let i = 0; i < 14; i++) {
    const { x, z } = edge((i + 0.5) / 14 * Math.PI * 2, 0.97);
    LIGHTS.push(V3(x, ringY(z) - 1.5, z));
  }
  // Since the 2022 remodel nothing is lit on the membrane: the only house
  // lights are the floods round its edge.
  // The floods themselves (LED, about 650 since the 2016 retrofit): a band
  // of box fixtures all the way round where the membrane meets the top of the
  // wall, close-packed on the ring beam just under the membrane's edge, each
  // face turned in at the field and only a little down, so from the stands
  // and the field the faces are seen square on: an almost unbroken ring of
  // lit boxes, as the photographs show it. Their faces light with the house.
  const floodM = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, side: THREE.DoubleSide });
  const floodGlow = [];
  {
    const NL = 220, TILT = 0.35, body = [], faces = [];
    for (let i = 0; i < NL; i++) {
      const { x, z } = edge((i + 0.5) / NL * Math.PI * 2, 0.988);
      const y = ringY(z) - 1.1, yaw = Math.atan2(-x, ZC - z);
      const at = (lx, ly, lz) => V3(lx, ly, lz).applyAxisAngle(V3(1, 0, 0), TILT).applyAxisAngle(V3(0, 1, 0), yaw).add(V3(x, y, z));
      const box = new THREE.BoxGeometry(2.3, 0.95, 0.5); box.rotateX(TILT); box.rotateY(yaw); box.translate(x, y, z); body.push(box.toNonIndexed());
      const face = new THREE.PlaneGeometry(2.1, 0.78); face.rotateX(TILT); face.rotateY(yaw); face.translate(...at(0, 0, 0.26).toArray()); faces.push(face);
      if (i % 2 === 0) floodGlow.push(pipe.flares.add(at(0, 0, 0.4), KELVIN(5200), 3.0, 0));
    }
    root.add(new THREE.Mesh(mergeGeometries(body), std({ color: 0x24252a, roughness: 0.6, metalness: 0.4 })));
    root.add(new THREE.Mesh(mergeGeometries(faces), floodM));
  }
  // the ring beam's support frame round the edge, 5 m deep, roofed at the
  // ring; the outer wall under it
  {
    const I = 160, R0 = 1.0, R1 = DOME_WALL;
    const pos = [], idx = [], wpos = [], widx = [];
    for (let i = 0; i <= I; i++) {
      const t = i / I * Math.PI * 2, a = edge(t, R0), b = edge(t, R1);
      pos.push(a.x, ringY(a.z) + 0.4, a.z, b.x, ringY(b.z) + 0.4, b.z);
      wpos.push(b.x, 0, b.z, b.x, ringY(b.z) + 0.5, b.z);
    }
    for (let i = 0; i < I; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const mat = std({ color: 0x0e0e12, roughness: 0.9, side: THREE.DoubleSide });
    for (const [P, X] of [[pos, idx], [wpos, widx]]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setIndex(X); g.computeVertexNormals();
      root.add(new THREE.Mesh(g, mat));
    }
    // and the floor out to it, under the stands
    const sh = new THREE.Shape(Array.from({ length: 96 }, (_, i) => { const e = edge(i / 96 * Math.PI * 2, R1); return new THREE.Vector2(e.x, -e.z); }));
    const fg = new THREE.ShapeGeometry(sh, 1); fg.rotateX(-Math.PI / 2);
    root.add(new THREE.Mesh(fg, std({ color: 0x0c0c0e, roughness: 1 })));
  }

  // The main screen (2022), as the photographs show it: LED in two parts. A
  // band 125.6 × 7.5 m across the outfield from right to left, along the
  // curve of the stand's back and level, over its back rows on the columns at
  // the heads of its aisles (the crowd sits under it), a dark frame behind it;
  // and in its middle a lower part, 20 × 5.4 m, hung under the band over the
  // backscreen (about 1,050 m² in all). Over the band's middle the TOKYO DOME sign in green;
  // over all of it, the floods on the ring. Either side of the lower part a
  // dark box stands on the backscreen's steps. Off for a concert: the set
  // stands in front of its middle.
  {
    const { F, ftop, pts, len, mid, band, lower, y0, y1, yl } = MV;
    const out = (p, k) => { const l = Math.hypot(p.x, p.z - ZH) || 1; return { x: p.x + p.x / l * k, z: p.z + (p.z - ZH) / l * k }; };
    const face = std({ color: 0x050506, roughness: 0.3, metalness: 0.2 });
    const frame = std({ color: 0x1c1d21, roughness: 0.7 });
    root.add(new THREE.Mesh(wallStrip(band, band.map(() => y1), { y0, thick: 0.25, ease: 0 }), face));
    root.add(new THREE.Mesh(wallStrip(lower, lower.map(() => y0), { y0: yl, thick: 0.25, ease: 0 }), face));
    root.add(new THREE.Mesh(wallStrip(band.map((p) => out(p, 0.7)), band.map(() => y1 + 0.4), { y0: y0 - 0.4, thick: 1.0, ease: 0 }), frame));
    root.add(new THREE.Mesh(wallStrip(lower.map((p) => out(p, 0.7)), lower.map(() => y0), { y0: yl - 0.3, thick: 1.0, ease: 0 }), frame));
    // the dark boxes either side of the lower part, on the backscreen's steps
    for (const sd of [-1, 1]) {
      const i = len.findIndex((v) => v >= mid + sd * 14), p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)];
      const yb = stands.topAt(...Object.values(out(p, -3))) || ftop;
      const bx = new THREE.Mesh(new THREE.BoxGeometry(6, y0 - 0.6 - yb, 3.4), std({ color: 0x16171a, roughness: 0.6 }));
      const o = out(p, -1.2);
      bx.position.set(o.x, (yb + y0 - 0.6) / 2, o.z); bx.rotation.y = Math.atan2(q.z - p.z, -(q.x - p.x)) + Math.PI;
      root.add(bx);
    }
    // the sign over the middle: TOKYO DOME in green on black
    {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160;
      const g = cv.getContext('2d');
      g.fillStyle = '#060807'; g.fillRect(0, 0, 1024, 160);
      g.fillStyle = '#3ddc84'; g.font = 'bold 112px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('TOKYO DOME', 512, 84);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.56), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true }));
      const i = len.findIndex((v) => v >= mid), p = pts[i], q = pts[i + 1], o = out(p, -0.2);
      sign.position.set(o.x, y1 + 1.1, o.z); sign.rotation.y = Math.atan2(-(q.z - p.z), q.x - p.x);
      root.add(sign);
    }
    // the backscreen's steps, painted dark: a strip along each of the
    // outfield stand's rows across its middle
    {
      const S = decodeSeats(F.seats), sk = F.seatScale ?? 10, rows = new Map();
      for (let i = 0; i < S.length; i += 4) {
        const x = S[i] / sk, z = S[i + 1] / sk;
        if (!inBackscreen(x, z)) continue;
        const r = S[i + 2];
        if (!rows.has(r)) rows.set(r, []);
        rows.get(r).push({ x, z: z + ZH, a: Math.atan2(x, -z) });
      }
      const strips = [];
      for (const [r, ps] of rows) {
        ps.sort((u, v) => u.a - v.a);
        const y = F.hs[Math.min(r, F.hs.length - 1)];
        const g = ps.length > 1 && wallStrip(ps, ps.map(() => y + 0.02), { y0: y + 0.002, thick: 0.72, ease: 0 });
        if (g) strips.push(g);
      }
      if (strips.length) root.add(new THREE.Mesh(mergeGeometries(strips), std({ color: 0x0e1a14, roughness: 0.95 })));
    }
  }

  if (round) return domeRound();

  // ── stage ──
  // As the dome tours set it: the stage across the outfield, its front about
  // level with the foul poles (100 m down the lines; the set's back yard
  // behind it to the centre-field stands), one LED wall across almost the
  // whole set in place of IMAG. Nothing is flown from the membrane: the show
  // brings its own roof on towers, and the PA its own wings.
  const SZ = 16;                                  // the stage's front at z 38
  const WW = 66, WH = 16, WY = DECK + 2.4 + WH / 2, WZ = 3.6 + SZ;
  const deck = stageDeck({ w: 72, d: 20, h: DECK, z: 12 + SZ, lip: false });
  root.add(deck);
  // (as the photographs from the 2nd floor show it) a runway out from the
  // stage's middle, crossed a third of the way down the field by a long
  // walkway either side, and on past it to an end stage
  // the end stage's back (and the 1.4 m kept clear round it) on the aisle
  // behind the band of floor blocks it stands in, so no strip too shallow for
  // a block is left empty behind it
  const RW0 = 22 + SZ, CZ = 57, XW = 30, XD = 5.2, RW1 = 91.2, TIP = 10, XH = DECK - 0.8;
  const cross = crossThrust(root, { z0: RW0, z1: RW1, w: 4.4, crossZ: CZ, crossD: XD, crossW: XW, tip: TIP, h: XH });
  // the stairs up either side of the deck, beside it (it is 72 m wide), 3 m wide
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 37.55, z: RW0, h: DECK, dir: [0, -1], width: 3 }));
  const ringM = stageRing(root, [{ x: 0, z: 12 + SZ, w: 72, d: 20, h: DECK, back: true }, ...cross.parts]);
  const scr = bigScreens(ctx, root, { w: WW, h: WH, y: WY, z: WZ, pitch: 0.0059 });
  // the stage's roof on its towers, the wall on chains from its back beam
  const TX = WW / 2 + 4, SR = 27, LT = 23;
  const BZ = [WZ - 0.4, 26, 32, RW0 + 0.5];
  groundRoof(root, { tx: TX, zs: BZ, y0: 0, top: SR });
  screenHang(root, { y: WY + WH / 2 + 0.3, z: WZ, w: WW, topY: SR - 0.8, n: 6, size: 0.76 });
  // Black masking right behind the LED wall, across the stage roof's back
  // from tower to tower, hung from its back beam: the stands behind the
  // stage do not show through or round the wall.
  scaffoldMasking(root, { line: [[-(TX + 1), BZ[0] - 0.9], [TX + 1, BZ[0] - 0.9]], tops: [SR + 0.6], front: [0, 100] });
  // the road cases in the yard behind the set
  {
    const rnd = prng(17), cases = [];
    for (const s of [-1, 1]) for (let i = 0; i < 14; i++) {
      const cw = 1.2 + rnd() * 0.6, ch = 0.9 + rnd() * 0.5, cd = 0.8 + rnd() * 0.3;
      const b = new THREE.BoxGeometry(cw, ch, cd);
      b.translate(s * (8 + (i % 5) * 4.5), ch / 2 + (i > 9 ? 1.2 : 0), WZ - 5 - Math.floor(i / 5) * 2.2);
      cases.push(b);
    }
    root.add(new THREE.Mesh(mergeGeometries(cases), std({ color: 0x141416, roughness: 0.5, metalness: 0.3 })));
  }
  for (let i = 0; i < 12; i++) { const w = wedge({ w: 0.8 }); w.position.set(-22 + i * 4, DECK, RW0 - 0.4); w.rotation.y = Math.PI; root.add(w); }
  // the subs in a row on the field under the barrier, the front fills on the lip
  subLine(root, { x0: -30, x1: 30, z: RW0 + 1.0, gap: 3.4, count: 2, fills: { xs: [-33, -26, -19, -12, -6, 6, 12, 19, 26, 33], y: DECK, z: RW0 - 0.35 } });

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const z of BZ.slice(1)) {
    const t = truss(2 * TX - 4, { size: 1.0, finish: 'black' }); t.position.set(0, LT, z); root.add(t);
    root.add(hoists([-30, -15, 0, 15, 30], LT, z, SR - 0.8));
  }
  // the PA: the mains from the stage roof's front corners, the flown subs
  // behind them on its side beams; the side hangs turned out to the infield
  // stands and the 270s further round, on wing towers bridged to the roof
  const PX = 47, PZ = 32, PH = 24;
  const DT = [[-24, 100], [24, 100]];           // the delay towers, two-thirds of the way back to FOH
  const towerLights = [];
  for (const side of [-1, 1]) {
    paWing(root, { x: side * PX, z: PZ, h: PH, bridge: V3(side * (TX + 0.8), SR, BZ[2]) });
    // the stage's front corner: the main to the front, two more round to
    // the side, spaced out on arms from the roof's corner tower
    paCorner(root, { px: side * TX, pz: BZ[3], r: 3.6, yaws: [0, side * 0.6, side * 1.2], boxes: [20, 16, 14], y: SR - 2.4, bar: SR - 1.2, width: 1.4 });
    paHang(root, { x: side * TX, y: SR - 2.4, z: BZ[2] + 1.5, boxes: 10, width: 1.4, depth: 1.0, splay: 0.008, roofY: SR - 0.8 });
    paPair(root, { x: side * (PX - 1.2), y: PH - 1.6, z: PZ + 1.0, boxes: 16, width: 1.3, yaw: side * 0.5, roofY: PH - 0.5 });
    paHang(root, { x: side * (PX + 2.5), y: PH - 1.6, z: PZ + 0.4, boxes: 12, width: 1.2, yaw: side * 1.15, roofY: PH - 0.4 });
    for (const dx of [-1.6, 0, 1.6]) towerLights.push(V3(side * PX + dx, PH + 1.2, PZ));
  }
  // the delay towers on the field, either side of the runway, past the
  // cross: for the back of the field and the stands behind home
  for (const [x, z] of DT) towerLights.push(...delayTower(root, { x, z, h: 26, boxes: 16, width: 1.3, from: V3(0, 0, 0) }));
  const spots = [], beams = [], washes = [], ups = [], ring2 = [], bst = [];
  spots.push(...fixtureRow(q, 14, (i) => ({ fx: rig.add({ kind: 'spot', pos: V3(-26 + i * 4, LT - 0.7, BZ[3]), length: 70, angle: 0.08 }), group: 0 })));
  beams.push(...fixtureRow(q, 14, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * 4, LT - 0.7, BZ[2]), length: 90, beamGain: 1.2 }), group: 1 })));
  washes.push(...fixtureRow(q, 10, (i) => ({ fx: rig.add({ kind: 'wash', pos: V3(-27 + i * 6, LT - 0.7, BZ[1]), length: 35, beamGain: 0.4, flareGain: 0.15 }), group: 2 })));
  // the lights on the delay towers' heads, sweeping the field and the stands
  const tw = fixtureRow(q, towerLights.length, (i) => ({ fx: rig.add({ pos: towerLights[i], kind: 'beam', length: 70, beamGain: 0.9 }), group: 5 }));
  ups.push(...fixtureRow(q, 12, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * (52 / 11), DECK, RW0 - 0.2), hang: 'up', length: 70 }), group: 3 })));
  // the ring: beams along the 2nd-floor front, pole to pole, pointing in
  {
    const edge = TD_STANDS.rim.map(([x, z]) => ({ x, z: z + ZH }));
    edge.sort((p, q2) => Math.atan2(p.x, p.z - ZH) - Math.atan2(q2.x, q2.z - ZH));
    const len = [0];
    for (let i = 1; i < edge.length; i++) len.push(len[i - 1] + Math.hypot(edge[i].x - edge[i - 1].x, edge[i].z - edge[i - 1].z));
    const N2 = (q.rig ?? 1) < 1 ? 10 : 18;
    for (let i = 0, j = 0; i < N2; i++) {
      const want = (i + 0.5) / N2 * len[len.length - 1];
      while (j < len.length - 2 && len[j + 1] < want) j++;
      const t = (want - len[j]) / (len[j + 1] - len[j]);
      const pos = V3(lerp(edge[j].x, edge[j + 1].x, t), TD_STANDS.rimY - 1.6, lerp(edge[j].z, edge[j + 1].z, t));
      const a = Math.atan2(pos.x, pos.z - ZC);
      ring2.push({ fx: rig.add({ kind: 'beam', pos, hang: 'up', length: 110, beamGain: 0.9, flareGain: 0.6 }), i, n: N2, group: 4, a });
    }
  }
  // blinders under the front truss and on the wing towers' faces; strobes
  // along the foot of the wall and under the middle truss
  const bu = [], bt = [];
  for (const x of [-28, -20, -12, -4, 4, 12, 20, 28]) bu.push({ pos: V3(x, LT - 0.9, BZ[3] + 0.12), dir: V3(x * 0.3, 1.5 - LT, 75 - BZ[3]), mount: LT - 0.5 });
  for (const side of [-1, 1]) for (const dx of [-0.52, 0.52]) {
    const pos = V3(side * PX + dx, 9, PZ + 1.15);
    bt.push({ pos, dir: V3(0, 1.5, 80).sub(pos), mount: null });
  }
  const blinders = flashUnits(rig, root, [...thinRow(q, bu), ...thinRow(q, bt)], { kind: 'blinder' });
  const su = [], st = [];
  for (let i = 0; i < 10; i++) su.push({ pos: V3(-27 + i * 6, DECK + 0.12, WZ + 0.5), dir: V3(0, 0.25, 1), mount: DECK });
  for (const x of [-20, -12, -4, 4, 12, 20]) st.push({ pos: V3(x, LT - 0.65, BZ[2] + 0.1), dir: V3(0, -0.5, 1), mount: LT - 0.5 });
  const strobes = flashUnits(rig, root, [...thinRow(q, su), ...thinRow(q, st)], { kind: 'strobe' });
  const moverLights = [];
  for (const k of [3, 6, 9, 12]) moverLights.push(rig.light(fromRow(spots, k, 14).fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5 }), 14000));
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.14, penumbra: 0.7, size: q.shadowSize, far: 140, cast: q.shadows });
  front1.position.set(-8, 30, 88); front1.target.position.set(0, DECK + 1, 15 + SZ);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, LT - 1, BZ[1]); stageWash.target.position.set(0, DECK, 16 + SZ);
  for (const l of [front1, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-40, 30, 66], [40, 30, 66], [0, 26, 100]]) { const l = new THREE.PointLight(0xffffff, 0, 160, 2); l.position.set(x, y, z); l.userData.offWhenDark = 'show'; root.add(l); fill.push(l); }
  const house = [];
  // the house lights are the ring's floods: aimed down at the field and the
  // stands, so the membrane above them only gets what bounces back up
  // (not the ones behind the set: they would shine across the stage straight
  // at the house, a glare off the decks; the set stands in front of them)
  for (let i = 0; i < 9; i++) {
    const p = LIGHTS[Math.round(i / 8 * (LIGHTS.length - 1))];
    if (p.z < 20 + SZ) continue;
    // (no fall-off with distance: a long-throw flood lights the field and the
    // stands near it alike; with it, the stands nearest a flood took a hot spot)
    const l = new THREE.SpotLight(KELVIN(5200), 0, 0, 0.8, 1, 0);
    l.position.copy(p).y -= 1.0;
    // each down at the field, just its own side of the middle: aimed across,
    // the far stands sat on its axis and took a hot spot
    l.target.position.set(p.x * 0.2, 0, ZC + (p.z - ZC) * 0.2);
    l.userData.offWhenDark = 'house'; root.add(l, l.target); house.push(l);
  }
  root.add(new THREE.HemisphereLight(0x181a24, 0x050508, 0.35));

  // ── people ──
  // arena seats on the field in blocks, the crowd standing at them; every
  // sold seat in the stands taken
  const inPoly = (poly) => (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const inField = inPoly(fieldRing);
  const edgeDist = (x, z) => {
    let m = Infinity;
    for (let i = 0; i < fieldRing.length; i++) {
      const a = fieldRing[i], b = fieldRing[(i + 1) % fieldRing.length];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2);
      m = Math.min(m, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return m;
  };
  const onField = (x, z) => inField(x, z) && edgeDist(x, z) > 3;
  // the arena: lettered blocks A (at the stage) to F (towards home), the
  // way the dome's floor plans run them — wide blocks of chairs, 16 to a row
  // and 15 rows deep, with narrow aisles between and a cross aisle between
  // the letters, laid out from the runway outwards. A block that meets the
  // runway, the cross or the desk gives up the side that
  // meets it, whole rows and columns at a time; one cut down to a sliver is
  // left out, and so is a row the field's edge cuts to a few chairs.
  const SEAT = 0.5, PITCH = 0.9, NX = 16, NZ = 15, BW = NX * SEAT, BD = NZ * PITCH, AX = 1.2, AZ = 1.6;
  // (the floor kept GAP clear of the stage, the runway and the cross, so the
  // front rows see over them to the far side)
  const GAP = 3.5;
  const bands = [];
  // (the first blocks 9 m back from the stage's front, as the photographs show it)
  for (let z = RW0 + 9; z + 4 * PITCH < CZ - GAP; z += BD + AZ) bands.push([z, Math.min(z + BD, CZ - GAP)]);
  // beside the walkway across, past its ends, a short band fills the gap
  // between the front blocks and the ones behind the cross
  bands.push([bands[bands.length - 1][1] + AZ, CZ + XD + GAP - AZ]);
  for (let z = CZ + XD + GAP; z < 136; z += BD + AZ) bands.push([z, z + BD]);
  const obst = [
    [-2.2 - GAP, 2.2 + GAP, RW0, RW1 + GAP],                     // the runway
    [-XW - GAP, XW + GAP, CZ - GAP, CZ + XD + GAP],               // the walkway across
    [-TIP / 2 - GAP, TIP / 2 + GAP, RW1 - TIP - GAP, RW1 + GAP], // the end stage
  ];
  // the desk only takes the chairs it stands on; the towers stand in aisles
  // of their own (below), TB either side of each clear of chairs
  const TB = 4.0;
  const taken = [[eye.x - 4.4, eye.x + 4.4, eye.z - 3.0, eye.z + 4.4], ...DT.map(([x, z]) => [x - TB, x + TB, z - TB, z + TB])];
  const free = (x, z) => !taken.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  // the floor ends where the dome's floor plans end it: straight across at
  // the aisle behind the desk's band, cut in towards it from the sides
  // along the diagonal the foul lines' corners leave (from the plan 정우
  // drew over the floor)
  // the field is not quite symmetric (the excite seats' fronts differ a
  // little side to side): a chair only where the field holds it on both
  // sides, so the blocks along them are mirror images
  const inBoth = (x, z) => inField(x, z) && inField(-x, z) && Math.min(edgeDist(x, z), edgeDist(-x, z)) > 2.2;
  const BACK = 123.6, DG0 = [23.5, 106], DG1 = [12, BACK];
  const inBack = (x, z) => z < BACK && (z < DG0[1] || Math.abs(x) < DG0[0] + (z - DG0[1]) * (DG1[0] - DG0[0]) / (DG1[1] - DG0[1]));
  const blocks = [];
  bands.forEach(([z0, z1], r) => {
    // past the end stage the middle is open: a block on the centre line
    const open = z0 > RW1 + GAP;
    const x0s = [];
    // a band the delay towers stand in: each tower in an aisle of its own, the
    // blocks between the centre one and the tower resized to fill that span
    // evenly (no block cut down round a tower's base), the usual ones outside
    const tower = DT.find(([, tz]) => tz + TB > z0 && tz - TB < z1);
    if (open && tower) {
      const tx = Math.abs(tower[0]);
      x0s.push([-BW / 2, BW]);
      const a = BW / 2 + AX, span = tx - TB - a;
      const n = Math.max(1, Math.round((span + AX) / (BW + AX)));
      const w = Math.floor((span - (n - 1) * AX) / n / SEAT + 1e-6) * SEAT;
      for (let k = 0; k < n; k++) { const x = a + k * (w + AX); x0s.push([x, w], [-x - w, w]); }
      // past the tower, a block the field's edge cuts down to a few chairs
      // across is left out rather than kept as a sliver beside the tower
      for (let x = tx + TB; x < 80; x += BW + AX) x0s.push([x, BW, 8], [-x - BW, BW, 8]);
    } else {
      for (let x = open ? -BW / 2 : 3.6; x < 80; x += BW + AX) { x0s.push([x, BW]); if (!open || x > 0) x0s.push([-x - BW, BW]); }
    }
    for (const [x0, bw, minCols = 3] of x0s) {
      let b = { x0, x1: x0 + bw, z0, z1 };
      for (const [ox0, ox1, oz0, oz1] of obst) {
        if (!b || ox1 <= b.x0 || ox0 >= b.x1 || oz1 <= b.z0 || oz0 >= b.z1) continue;
        const parts = [{ ...b, x1: ox0 }, { ...b, x0: ox1 }, { ...b, z1: oz0 }, { ...b, z0: oz1 }]
          .filter((p) => p.x1 - p.x0 >= 6 * SEAT && p.z1 - p.z0 >= 4 * PITCH);
        b = parts.sort((p, q2) => (q2.x1 - q2.x0) * (q2.z1 - q2.z0) - (p.x1 - p.x0) * (p.z1 - p.z0))[0] || null;
      }
      if (b) blocks.push({ ...b, minCols, name: String.fromCharCode(65 + r) });
    }
  });
  const arena = { people: [], chairs: [] };
  {
    const rnd = prng(55);
    for (const b of blocks) {
      const nx = Math.floor((b.x1 - b.x0) / SEAT + 1e-6), nz = Math.floor((b.z1 - b.z0) / PITCH + 1e-6);
      // rows from its front; out to the field's edge, a walkway along the
      // fence left clear, the blocks there as many chairs as fit
      const ox = (b.x0 + b.x1) / 2 - (nx - 1) * SEAT / 2;
      const rows = [];
      for (let j = 0; j < nz; j++) {
        const z = b.z0 + (j + 0.5) * PITCH, row = [];
        for (let i = 0; i < nx; i++) { const x = ox + i * SEAT; if (inBoth(x, z) && free(x, z) && inBack(x, z)) row.push(x); }
        if (row.length >= 3) rows.push({ z, row });
      }
      if (rows.length < 2 || (b.minCols > 3 && rows.filter((r) => r.row.length >= b.minCols).length < b.minCols)) continue;
      for (const { z, row } of rows) for (const x of row) {
        arena.chairs.push({ x, y: 0, z: z + 0.16, turn: Math.PI });
        if (rnd() < 0.97) arena.people.push({ x: x + (rnd() - 0.5) * 0.08, y: 0, z: z - 0.16 + (rnd() - 0.5) * 0.06, h: 0.92 + rnd() * 0.14, full: true, fblock: b });
      }
    }
  }
  root.add(floorChairs(arena.chairs));
  const fieldPeople = arena.people;
  bigCrowd(root, cu, q, fieldPeople.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.04 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.25;
  root.add(aisleField);
  root.add(lightPoints(fohPosition(pipe, root, eye, { riser: 1.0 }), cu, { maxPx: 4 }));

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  ctx.screenHaze(scr.main, offs.map(([dx, dy]) => hz.add(V3(dx * 32, scr.main.position.y + dy * scr.h * 0.5, WZ + 0.9), 0xffffff, 0)), offs);
  scr.main.userData.hazePower = 320;
  // (no glows of their own in the air over the stage and the cross: what
  // lights the haze there is the rig's beams)

  return {
    root, eye, seatNear: stands.seatNear,
    camera: { pos: eye, target: V3(0, DECK + 10, 6 + SZ), fov: 60, near: 0.2, far: 800 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x07070b, 0.002),
    hazeDensity: 0.0011, beamGain: 0.5, hazeAmb: new THREE.Color(0x05050a), hazeAmbDist: 260,
    bloom: { strength: 0.75, radius: 0.7, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.1, lift: [0.004, 0.004, 0.009] },
    env: { w: 236, h: 56, d: 236, eye, wall: 0x0c0c12, floor: 0x0a0a0c, emitters: [
      { w: WW, h: WH, pos: V3(0, WY, WZ + 0.4), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: WW / WH },
      { w: 200, h: 200, pos: V3(0, 55, 52), normal: V3(0, -1, 0), color: 0x202028, power: 1 },
    ] },
    envIntensity: 0.55,
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 68), stage: STAGE, span: 60 });
      runShow(rig, beams, f, { house: V3(0, 22, 95), stage: STAGE, span: 80 });
      runShow(rig, washes, f, { house: V3(0, 0, 26 + SZ), stage: STAGE, span: 30, strobe: false });
      runShow(rig, tw, f, { house: V3(0, 30, 50), stage: V3(0, XH, CZ), span: 60 });
      runShow(rig, ups, f, { house: V3(0, 40, 50), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      // the ring converges on the long stage in the chorus, spreads to the roof otherwise
      const sec = f.sec || section(f.bar);
      ring2.forEach(({ fx, i, a }) => {
        const tgt = sec === 'chorus' ? V3(Math.sin(f.t * 0.8 + i) * 22, 26, CZ + XD / 2 + Math.cos(f.t * 0.8 + i) * 3) : V3(Math.sin(a) * 30, 56, ZC + Math.cos(a) * 30);
        fx.dir.lerp(tgt.sub(fx.pos).normalize(), Math.min(1, f.dt * 2)).normalize();
        fx.color.copy(i % 2 ? f.pal.a : f.pal.c);
        fx.intensity = (sec === 'chorus' ? 0.9 + 0.4 * f.kick : sec === 'pre' ? 0.5 : 0.18) * show;
      });
      // (idle, at half what it was: it glared off the deck)
      front1.intensity = 90000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (12000 + 14000 * f.energy + 6000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (200 + 500 * f.energy) * show; });
      // (half what they were: at full the deck, the trusses and the roof threw
      // too much of them back)
      floodM.color.copy(KELVIN(5200)).multiplyScalar(0.03 + 2.6 * f.house);
      for (const g of floodGlow) g.intensity = 0.9 * f.house;
      house.forEach((l) => { l.intensity = 1.6 * f.house; });
      ringTint(ringM.color, f.pal.a).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      const sh = membrane.userData.shader;
      if (sh) {
        // the house lights wash the membrane warm; in the show it takes the stage's colour back
        sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.2, 0.16, 0.11).multiplyScalar(0.02 + 0.49 * f.house));
      }
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 14, 10 + SZ);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
      flashOnCrowd(cu.uWash.value, runBlinders(blinders, f), runStrobes(strobes, f));
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
    },
  };
  // ── the centre stage (360) ──
  // After TWICE's THIS IS FOR at the Tokyo Dome (September 2025): every seat
  // sold, a rectangular stage in the middle of the field on its own roof with
  // a box of screens under it (roundStage), the field seated round it in
  // blocks facing it, four delay towers on the diagonals, FOH towards home.
  function domeRound() {
    // (a runway 8 m wide out from each end, towards home and centre field)
    // (the deck 1.8 m, as the end stage's runways)
    const RC = roundStage(ctx, root, { c: STAGE, w: 16, d: 40, deck: 1.8, top: 27, box: [22, 11], follow: 75, followY: 26, runway: { w: 8, len: 22 } });
    const inF = (x, z) => inRing(fieldRing, x, z) && inRing(fieldRing, -x, z);
    const edgeD = (x, z) => {
      let m = Infinity;
      for (let i = 0; i < fieldRing.length; i++) {
        const a = fieldRing[i], b = fieldRing[(i + 1) % fieldRing.length];
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2);
        m = Math.min(m, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
      }
      return m;
    };
    // the delay towers on the diagonals, each aimed out, an aisle of its own
    // (on the field, 12 m clear of its edge: never into the stands)
    const DTR = diagonalTowers(STAGE, { r: 52, ax: 0.62, az: 0.78, cell: 10, ok: (x, z) => inF(x, z) && Math.min(edgeD(x, z), edgeD(-x, z)) > 12 });
    const towerLights = [];
    // (the outfield's pair as high as the outfield stand they play to; home's to the 2nd floor)
    for (const [x, z] of DTR) towerLights.push(...delayTower(root, { x, z, h: z < STAGE.z ? 20 : 30, boxes: z < STAGE.z ? 14 : 18, width: 1.3, from: STAGE }));
    const rig = ctx.rig({ finish: 'black' });
    const tw = fixtureRow(q, towerLights.length, (i) => ({ fx: rig.add({ pos: towerLights[i], kind: 'beam', length: 70, beamGain: 0.9 }), group: 5 }));
    // (well back from the runway's end, towards home)
    const feye = V3(0, 1.6 + 1.0, STAGE.z + 60);
    const skip = (x, z) => !inF(x, z) || Math.min(edgeD(x, z), edgeD(-x, z)) < 2.2 || RC.inside(x, z, 3.5)
      || DTR.some(([tx, tz]) => Math.abs(x - tx) < 5 && Math.abs(z - tz) < 5)
      || (Math.abs(x - feye.x) < 4.4 && Math.abs(z - feye.z) < 3.6);
    const seats = roundBlocks({ c: STAGE, hd: 20 + 3.5, x0: -80, x1: 80, z0: -10, z1: 140, skip, seed: 55 });
    root.add(floorChairs(seats.chairs));
    bigCrowd(root, cu, q, seats.people.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21, round: STAGE });
    const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.04 })), cu, { maxPx: 3 });
    aisleField.material.uniforms.uGain.value = 0.25;
    root.add(aisleField);
    root.add(lightPoints(fohPosition(pipe, root, feye, { riser: 1.0 }), cu, { maxPx: 4 }));
    // the house lights: the ring's floods, all round
    const house = [];
    for (let i = 0; i < 9; i++) {
      const p = LIGHTS[Math.round(i / 8 * (LIGHTS.length - 1))];
      const l = new THREE.SpotLight(KELVIN(5200), 0, 0, 0.8, 1, 0);
      l.position.copy(p).y -= 1.0;
      l.target.position.set(p.x * 0.2, 0, ZC + (p.z - ZC) * 0.2);
      l.userData.offWhenDark = 'house'; root.add(l, l.target); house.push(l);
    }
    root.add(new THREE.HemisphereLight(0x181a24, 0x050508, 0.35));
    return {
      root, eye: feye, seatNear: stands.seatNear, round: true,
      camera: { pos: feye, target: V3(0, RC.BY, STAGE.z), fov: 60, near: 0.2, far: 800 },
      background: new THREE.Color(0),
      fog: new THREE.FogExp2(0x07070b, 0.002),
      hazeDensity: 0.0011, beamGain: 0.5, hazeAmb: new THREE.Color(0x05050a), hazeAmbDist: 260,
      bloom: { strength: 0.75, radius: 0.7, threshold: 1.15 },
      grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.1, lift: [0.004, 0.004, 0.009] },
      env: { w: 236, h: 56, d: 236, eye: feye, wall: 0x0c0c12, floor: 0x0a0a0c, emitters: [
        { w: RC.BW, h: RC.BH, pos: V3(0, RC.BY, STAGE.z + RC.BW / 2), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: RC.BW / RC.BH },
        { w: 200, h: 200, pos: V3(0, 55, 52), normal: V3(0, -1, 0), color: 0x202028, power: 1 },
      ] },
      envIntensity: 0.55,
      update(f) {
        stands.update(f);
        const show = 1 - f.house;
        const [bl, sb] = RC.run(f, { follow: 90000, wash: 12000 });
        runShow(rig, tw, f, { house: V3(0, 30, STAGE.z), stage: RC.stage, span: 60 });
        floodM.color.copy(KELVIN(5200)).multiplyScalar(0.03 + 2.6 * f.house);
        for (const g of floodGlow) g.intensity = 0.9 * f.house;
        house.forEach((l) => { l.intensity = 1.6 * f.house; });
        const sh = membrane.userData.shader;
        if (sh) sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.2, 0.16, 0.11).multiplyScalar(0.02 + 0.49 * f.house));
        cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
        cu.uStage.value.set(0, 14, STAGE.z);
        cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
        flashOnCrowd(cu.uWash.value, bl, sb);
        cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
      },
    };
  }
}
