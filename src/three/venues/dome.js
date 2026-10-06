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
import { APP, DEG, KELVIN, V3, clamp, floorPanelTex, glowMat, lerp, prng, std } from '../core.js';
import { lightPoints } from '../people.js';
import { hoists, micStand, rodInto, shadowSpot, stageDeck, stageSteps, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, crossThrust, delayTower, floorChairs, fohPosition, groundRoof, paHang, paWing, runLasers, runShow, screenHang, section, subLine, wallStrip } from '../show.js';
import { buildStands } from '../stands.js';
import { TD_STANDS } from './td-data.js';

export function membraneMaterial({ zc = 0, diamond = 1e9 } = {}) {
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
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          // Two layers, as the real roof is built: this, the inner one, is
          // hung in panels between the cables, the panels of the middle (a
          // square set corner-on, |x| + |z - zc| < diamond) apart from those
          // of the sides, so along that line, stepping panel by panel, a
          // slit shows the outer layer; and a round opening in some panels
          // (the lights' and the air's).
          vec2 p = vec2(vWP.x, vWP.z) / 8.5 + 0.5;
          vec2 cell = floor(p), d = fract(p) - 0.5;
          float zc = ${zc.toFixed(2)}, dia = ${diamond.toFixed(2)};
          #define INSIDE(c) (abs((c).x * 8.5) + abs((c).y * 8.5 - zc) < dia)
          bool inC = INSIDE(cell);
          float sw = 0.5 - 0.022;
          if (abs(d.x) > sw && INSIDE(cell + vec2(sign(d.x), 0.0)) != inC) discard;
          if (abs(d.y) > sw && INSIDE(cell + vec2(0.0, sign(d.y))) != inC) discard;
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          if (h < 0.3 && length(d) < 0.04) discard;
        }`)
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
          {
            // outside the middle the panels are split corner to corner, the
            // cables there running along the slit: triangles
            vec2 c = floor(vec2(vWP.x, vWP.z) / 8.5 + 0.5) * 8.5;
            if (abs(c.x) + abs(c.y - ${zc.toFixed(2)}) >= ${diamond.toFixed(2)}) {
              vec2 q = fract(vec2(vWP.x, vWP.z) / 8.5 + 0.5) - 0.5;
              float s = sign(c.x + 0.01) * sign(c.y - ${zc.toFixed(2)} + 0.01);
              float dg = abs(q.x + s * q.y) * 0.7071;
              crease = max(crease, 1.0 - smoothstep(0.0, 0.05 + w.x, dg));
            }
          }
          float cable = 1.0 - min(smoothstep(0.0, w.x * 1.2 + 0.004, 0.5 - d.x), smoothstep(0.0, w.y * 1.2 + 0.004, 0.5 - d.y));
          // the bulge: lighter in the middle of each pillow
          float bulge = 1.0 - 0.9 * dot(d, d);
          diffuseColor.rgb *= bulge * (1.0 - 0.35 * crease) * (1.0 - 0.5 * cable);
          totalEmissiveRadiance += uBounce * bulge * (1.0 - 0.4 * crease);
        }`);
  };
  m.customProgramCacheKey = () => 'membrane4';
  return m;
}

export function buildDome(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 2.6;
  // FOH, and the listener there: at the very back of the field's seats,
  // in front of the stands behind home
  const eye = V3(0, 1.6 + 1.0, 121);
  const STAGE = V3(0, DECK, 28);
  // The ballpark as the official seating map draws it: the field is the open
  // ground inside the 1st floor's front rows; home plate is behind FOH, the
  // stage stands in front of the centre-field fence.
  const ZH = 114;                 // home plate
  const OFF = V3(0, 0, ZH);
  const fieldRing = TD_STANDS.field[0][0].map(([x, z]) => ({ x, z: z + ZH }));
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
  const stands = buildStands(TD_STANDS, {
    offset: OFF, stage: STAGE, seed: 400, concreteTone: 0.28, roofY: (x, z) => ringY(z + ZH) + 0.3,
    seatColors: { A: 0x1d3c86, B: 0x1d3c86, F: 0x1d3c86, K: 0x1d3c86, G: 0x1d3c86, C: 0x5a5d63, D: 0x1d3c86, E: 0x1d3c86 },
    crowd: !!q.crowd,
    sold: (x, z) => z - 19.6 > Math.max(4, 0.12 * (Math.abs(x) - 33)),   // in front of the wall (face z 19.6, 66 m wide)
    // the side walls where a stand drops away: the stands' own concrete,
    // not dark steel
    materials: { rail: std({ color: 0x77736c, roughness: 0.92, side: THREE.DoubleSide }) },
  });
  root.add(stands.group);
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
  const ringPts = [], ringH = [], ringOut = [];
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
  }
  const padGeo = wallStrip(ringPts, ringH, { thick: 0.36, closed: true, ease: 6 });
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
        const rp = part.map((i) => inward(ringPts[i])), rt = part.map((i) => eased[i]);
        const rg = wallStrip(rp, rt.map((h) => h - 0.15), { y0: rt.map((h) => h - 1.43), thick: 0.06, ease: 0 });
        if (rg) root.add(new THREE.Mesh(rg, std({ color: 0x060607, roughness: 0.35, metalness: 0.2 })));
      }
    }
  }
  // the foul poles, where the lines meet the fence
  for (const sd of [-1, 1]) {
    const r = 100, x = sd * r * Math.SQRT1_2, z = ZH - r * Math.SQRT1_2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 26, 12), std({ color: 0xe8c418, roughness: 0.45, emissive: 0x3a3004 }));
    pole.position.set(x, 13, z); root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0xf2d020, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    flag.position.set(x - sd * 0.8, 14, z); flag.rotation.y = sd * Math.PI / 4; root.add(flag);
  }

  // ── the membrane ──
  // (its geometry, ZC, ringY, roofAt and edge, is set out before the stands)
  const membrane = membraneMaterial({ zc: ZC, diamond: 0.88 * RA });
  membrane.side = THREE.DoubleSide;
  // the outer layer, 1.5 m over the inner: what the slits and the openings
  // show, lit through from outside (and by the house lights)
  const outerMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false, fog: false });
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
    const og = g.clone(); og.translate(0, 1.5, 0);
    const outer = new THREE.Mesh(og, outerMat); outer.userData.noCollide = true;
    root.add(outer);
  }
  // Hung from the cables: the lights at 14 places round over the field
  // (the LED floodlights, about 700, in 14 gondolas), 21 loudspeakers round
  // the membrane's edge and one in the middle, and the TV camera there.
  const hangY = (x, z, d) => roofAt(x, z) - d;
  const bankM = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const hungSteel = [], hungBlack = [], hangers = [], bankLamps = [];
  const LIGHTS = [];
  for (let i = 0; i < 14; i++) {
    const { x, z } = edge((i + 0.5) / 14 * Math.PI * 2, 0.72);
    const y = hangY(x, z, 4.0), yaw = Math.atan2(-x, ZC - z);
    LIGHTS.push(V3(x, y, z));
    // a gondola of floods, its face tipped down and in towards the field
    const fr = new THREE.BoxGeometry(8, 1.0, 2.6); fr.rotateX(0.45); fr.rotateY(yaw); fr.translate(x, y, z); hungSteel.push(fr.toNonIndexed());
    for (const u of [-3.4, 3.4]) {
      const top = V3(u, 0, 0).applyAxisAngle(V3(0, 1, 0), yaw).add(V3(x, 0, z));
      rodInto(hangers, V3(top.x, y + 0.4, top.z), V3(top.x, roofAt(top.x, top.z), top.z), 0.04, 0.04, 4);
    }
    for (let u = 0; u < 7; u++) for (let v = 0; v < 3; v++) {
      const p = V3(-3.3 + u * 1.1, -0.55, -0.8 + v * 0.8).applyAxisAngle(V3(1, 0, 0), 0.45).applyAxisAngle(V3(0, 1, 0), yaw).add(V3(x, y, z));
      bankLamps.push(p);
    }
  }
  for (let i = 0; i < 21; i++) {
    const { x, z } = edge((i + 0.25) / 21 * Math.PI * 2, 0.9);
    const y = hangY(x, z, 5.5), yaw = Math.atan2(-x, ZC - z);
    const b = new THREE.BoxGeometry(1.3, 2.4, 1.1); b.rotateX(-0.3); b.rotateY(yaw); b.translate(x, y, z); hungBlack.push(b.toNonIndexed());
    rodInto(hangers, V3(x, y + 1.2, z), V3(x, roofAt(x, z), z), 0.04, 0.04, 4);
  }
  {
    const x = 0, z = ZC, y = hangY(x, z, 7.0);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.BoxGeometry(1.4, 3.2, 1.2); b.translate(0, 0, 0.9); b.rotateY(k * Math.PI / 2); b.translate(x, y, z); hungBlack.push(b.toNonIndexed());
    }
    const cam = new THREE.BoxGeometry(0.7, 0.6, 1.0); cam.translate(x, y - 2.3, z); hungBlack.push(cam.toNonIndexed());
    const lens = new THREE.CylinderGeometry(0.16, 0.2, 0.6, 12); lens.rotateX(Math.PI / 2); lens.translate(x, y - 2.3, z + 0.75); hungBlack.push(lens.toNonIndexed());
    rodInto(hangers, V3(x, y + 1.6, z), V3(x, roofAt(x, z), z), 0.06, 0.06, 4);
  }
  root.add(new THREE.Mesh(mergeGeometries(hungSteel), std({ color: 0x2a2b30, roughness: 0.6, metalness: 0.4 })));
  root.add(new THREE.Mesh(mergeGeometries(hungBlack), std({ color: 0x111114, roughness: 0.7 })));
  root.add(new THREE.Mesh(mergeGeometries(hangers), std({ color: 0x8a8d92, roughness: 0.4, metalness: 0.7 })));
  const lampG = new THREE.CircleGeometry(0.3, 12);
  const lampI = new THREE.InstancedMesh(lampG, bankM, bankLamps.length);
  const lm4 = new THREE.Matrix4(), lq = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), V3(0, -1, 0));
  bankLamps.forEach((p, i) => { lm4.compose(p, lq, V3(1, 1, 1)); lampI.setMatrixAt(i, lm4); });
  root.add(lampI);
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

  // The main screen (2022): LED, 125.6 m wide and about 1,050 m², over the
  // outfield stands from the old backscreen out across nearly all of them,
  // along the curve of their back; off for a concert, the set standing in
  // front of its middle.
  {
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
    const back = angs.map((a) => { let sm = 0, w = 0; for (const b of angs) if (Math.abs(b - a) <= 3) { sm += far.get(b); w++; } return { a, d: sm / w + 1.0 }; });
    const pts = back.map(({ a, d }) => ({ x: Math.sin(a * DEG) * d, z: ZH - Math.cos(a * DEG) * d }));
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const mid = len[back.findIndex((b) => b.a >= 0)];
    const on = pts.filter((_, i) => Math.abs(len[i] - mid) <= 125.6 / 2);
    const y0 = ftop + 1.6, y1 = y0 + 1050 / 125.6;
    const scrG = wallStrip(on, on.map(() => y1), { y0, thick: 0.25, ease: 0 });
    const boxG = wallStrip(on.map((p) => { const l = Math.hypot(p.x, p.z - ZH) || 1; return { x: p.x + p.x / l * 0.7, z: p.z + (p.z - ZH) / l * 0.7 }; }), on.map(() => y1 + 0.5), { y0: y0 - 0.6, thick: 1.0, ease: 0 });
    if (scrG) root.add(new THREE.Mesh(scrG, std({ color: 0x050506, roughness: 0.3, metalness: 0.2 })));
    if (boxG) root.add(new THREE.Mesh(boxG, std({ color: 0x1c1d21, roughness: 0.7 })));
  }

  // ── stage ──
  // As the dome tours set it: the stage across the outfield, its front about
  // level with the foul poles (100 m down the lines; the set's back yard
  // behind it to the centre-field stands), one LED wall across almost the
  // whole set in place of IMAG. Nothing is flown from the membrane: the show
  // brings its own roof on towers, and the PA its own wings.
  const SZ = 16;                                  // the stage's front at z 38
  const WW = 66, WH = 16, WY = DECK + 2.4 + WH / 2, WZ = 3.6 + SZ;
  const deck = stageDeck({ w: 72, d: 20, h: DECK, z: 12 + SZ });
  root.add(deck);
  // (as the photographs from the 2nd floor show it) a runway out from the
  // stage's middle, crossed a third of the way down the field by a long
  // walkway either side, and on past it to an end stage
  const RW0 = 22 + SZ, CZ = 57, XW = 30, XD = 5.2, RW1 = 88, TIP = 10, XH = DECK - 0.8;
  const cross = crossThrust(root, { z0: RW0, z1: RW1, w: 4.4, crossZ: CZ, crossD: XD, crossW: XW, tip: TIP, h: XH });
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 35.75, z: RW0, h: DECK, dir: [0, -1] }));
  const bRimM = glowMat(APP.accent, 1);
  {
    const g = new THREE.BoxGeometry(XW * 2 + 0.1, 0.05, 0.05); g.translate(0, XH, CZ + XD + 0.02);
    const g2 = new THREE.BoxGeometry(TIP + 0.1, 0.05, 0.05); g2.translate(0, XH, RW1 + 0.02);
    const bRim = new THREE.Mesh(mergeGeometries([g, g2]), bRimM); root.add(bRim);
  }
  const scr = bigScreens(ctx, root, { w: WW, h: WH, y: WY, z: WZ, pitch: 0.0059 });
  // the stage's roof on its towers, the wall on chains from its back beam
  const TX = WW / 2 + 4, SR = 27, LT = 23;
  const BZ = [WZ - 0.4, 26, 32, RW0 + 0.5];
  groundRoof(root, { tx: TX, zs: BZ, y0: 0, top: SR });
  screenHang(root, { y: WY + WH / 2 + 0.3, z: WZ, w: WW, topY: SR - 0.8, n: 6, size: 0.76 });
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
  // a microphone waiting at the end of the runway
  const star = micStand({ height: 1.6 });
  star.position.set(0, XH, RW1 - 1.2); root.add(star);
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
  const DT = [[-21, 77], [21, 77]];             // the delay towers, past the cross
  const towerLights = [];
  for (const side of [-1, 1]) {
    paWing(root, { x: side * PX, z: PZ, h: PH, bridge: V3(side * (TX + 0.8), SR, BZ[2]) });
    paHang(root, { x: side * (WW / 2 + 2.6), y: SR - 2.4, z: BZ[3] + 0.2, boxes: 20, width: 1.4, yaw: -side * 0.05, roofY: SR - 0.8 });
    paHang(root, { x: side * TX, y: SR - 2.4, z: BZ[2] + 1.5, boxes: 10, width: 1.4, depth: 1.0, splay: 0.008, roofY: SR - 0.8 });
    paHang(root, { x: side * (PX - 1.2), y: PH - 1.6, z: PZ + 1.0, boxes: 16, width: 1.3, yaw: side * 0.5, roofY: PH - 0.5 });
    paHang(root, { x: side * (PX + 2.5), y: PH - 1.6, z: PZ + 0.4, boxes: 12, width: 1.2, yaw: side * 1.15, roofY: PH - 0.4 });
    for (const dx of [-1.6, 0, 1.6]) towerLights.push(V3(side * PX + dx, PH + 1.2, PZ));
  }
  // the delay towers on the field, either side of the runway, past the
  // cross: for the back of the field and the stands behind home
  for (const [x, z] of DT) towerLights.push(...delayTower(root, { x, z, h: 20, boxes: 16, width: 1.3, yaw: -Math.sign(x) * 0.04 }));
  const spots = [], beams = [], washes = [], ups = [], ring2 = [], lasers = [], bst = [];
  for (let i = 0; i < 14; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-26 + i * 4, LT - 0.7, BZ[3]), length: 70, angle: 0.08 }), i, n: 14, group: 0 });
  for (let i = 0; i < 14; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * 4, LT - 0.7, BZ[2]), length: 90, beamGain: 1.2 }), i, n: 14, group: 1 });
  for (let i = 0; i < 10; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(-27 + i * 6, LT - 0.7, BZ[1]), length: 35, beamGain: 0.4 }), i, n: 10, group: 2 });
  // the lights on the delay towers' heads, sweeping the field and the stands
  const tw = towerLights.map((pos, i) => ({ fx: rig.add({ kind: 'beam', pos, length: 70, beamGain: 0.9 }), i, n: towerLights.length, group: 5 }));
  for (let i = 0; i < 12; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * (52 / 11), DECK + 0.3, RW0 - 0.2), hang: 'up', length: 70 }), i, n: 12, group: 3 });
  // the ring: beams along the 2nd-floor front, pole to pole, pointing in
  {
    const edge = TD_STANDS.rim.map(([x, z]) => ({ x, z: z + ZH }));
    edge.sort((p, q2) => Math.atan2(p.x, p.z - ZH) - Math.atan2(q2.x, q2.z - ZH));
    const len = [0];
    for (let i = 1; i < edge.length; i++) len.push(len[i - 1] + Math.hypot(edge[i].x - edge[i - 1].x, edge[i].z - edge[i - 1].z));
    const N2 = 18;
    for (let i = 0, j = 0; i < N2; i++) {
      const want = (i + 0.5) / N2 * len[len.length - 1];
      while (j < len.length - 2 && len[j + 1] < want) j++;
      const t = (want - len[j]) / (len[j + 1] - len[j]);
      const pos = V3(lerp(edge[j].x, edge[j + 1].x, t), TD_STANDS.rimY - 1.6, lerp(edge[j].z, edge[j + 1].z, t));
      const a = Math.atan2(pos.x, pos.z - ZC);
      ring2.push({ fx: rig.add({ kind: 'beam', pos, hang: 'up', length: 110, beamGain: 0.9, flareGain: 0.6 }), i, n: N2, group: 4, a });
    }
  }
  for (let i = 0; i < 6; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-10 + i * 4, DECK + 0.3, RW0 - 0.1), body: false, length: 150, beamGain: 7, flareGain: 0.2, noise: 0.4 }), i, n: 6 });
  const moverLights = [];
  for (const k of [3, 6, 9, 12]) moverLights.push(rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5 }), 14000));
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.14, penumbra: 0.7, size: q.shadowSize, far: 140, cast: q.shadows });
  front1.position.set(-8, 30, 88); front1.target.position.set(0, DECK + 1, 15 + SZ);
  const follow = shadowSpot(KELVIN(5600), 0, { angle: 0.035, penumbra: 0.5, cast: false });
  follow.position.set(0, 36, 112); follow.target.position.set(0, XH, RW1 - TIP / 2);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, LT - 1, BZ[1]); stageWash.target.position.set(0, DECK, 16 + SZ);
  for (const l of [front1, follow, stageWash]) root.add(l, l.target);
  const followBeam = rig.add({ kind: 'follow', pos: V3(0, 36, 112), length: 70, body: false, beamGain: 0.5, flareGain: 0.5, color: KELVIN(5600) });
  const fill = [];
  for (const [x, y, z] of [[-40, 30, 66], [40, 30, 66], [0, 40, 100]]) { const l = new THREE.PointLight(0xffffff, 0, 160, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  // the house lights are the hung gondolas' floods: aimed down at the field
  // and the stands, so the membrane above them only gets what bounces back up
  for (let i = 0; i < 9; i++) {
    const p = LIGHTS[Math.round(i / 8 * (LIGHTS.length - 1))];
    const l = new THREE.SpotLight(KELVIN(5200), 0, 300, 1.2, 1, 2);
    l.position.copy(p).y -= 1.0;
    l.target.position.set(p.x * 0.2, 0, ZC + (p.z - ZC) * 0.2);
    root.add(l, l.target); house.push(l);
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
  // the arena: wide blocks of chairs, 16 to a row and 15 rows deep, narrow
  // aisles between. Between the stage and the cross a straight band (A);
  // behind the cross the blocks curve round it in bands (B on), the rows on
  // arcs about the cross's middle, each chair turned to the stage, swinging
  // forward at the sides towards the poles. Rows the runway, a tower, the
  // desk or the field's edge cut to a few chairs are left out, and so is a
  // block left with only a few rows.
  const SEAT = 0.5, PITCH = 0.9, NX = 16, NZ = 15, BW = NX * SEAT, BD = NZ * PITCH, AX = 1.2, AZ = 1.6;
  const obst = [
    [-2.2 - 1.4, 2.2 + 1.4, RW0, RW1 + 1.4],                     // the runway
    [-XW - 1.4, XW + 1.4, CZ - 1.4, CZ + XD + 1.4],               // the walkway across
    [-TIP / 2 - 1.4, TIP / 2 + 1.4, RW1 - TIP - 1.4, RW1 + 1.4], // the end stage
    [eye.x - 5.5, eye.x + 5.5, eye.z - 4.5, eye.z + 5.5],         // the desk
    ...DT.map(([x, z]) => [x - 4.4, x + 4.4, z - 4.4, z + 4.4]), // the delay towers
  ];
  const clear = (x, z) => onField(x, z) && !obst.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  const face = V3(0, 0, RW0);                    // what every chair turns to
  const arena = { people: [], chairs: [] };
  const rnd = prng(55);
  // a block: its rows, each a list of [x, z]; kept whole or not at all
  const place = (rows) => {
    const kept = rows.map((r) => r.filter(([x, z]) => clear(x, z))).filter((r) => r.length >= 6);
    if (kept.length < 4) return;
    for (const r of kept) for (const [x, z] of r) {
      const dx = face.x - x, dz = face.z - z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      arena.chairs.push({ x: x - ux * 0.16, y: 0, z: z - uz * 0.16, turn: Math.atan2(ux, uz) });
      if (rnd() < 0.97) arena.people.push({ x: x + ux * 0.16 + (rnd() - 0.5) * 0.08, y: 0, z: z + uz * 0.16 + (rnd() - 0.5) * 0.06, h: 0.92 + rnd() * 0.14, full: true });
    }
  };
  // A: straight, from the runway out, between the pit and the cross
  {
    const z0 = RW0 + 3.5, nz = Math.min(NZ, Math.floor((CZ - 1.6 - z0) / PITCH));
    for (let x0 = 3.6; x0 < 80; x0 += BW + AX) for (const sd of [-1, 1]) {
      const rows = [];
      for (let j = 0; j < nz; j++) { const row = []; for (let i = 0; i < NX; i++) row.push([sd * (x0 + (i + 0.5) * SEAT), z0 + (j + 0.5) * PITCH]); rows.push(row); }
      place(rows);
    }
  }
  // B on: on arcs about the cross's middle
  {
    const C = V3(0, 0, CZ + XD / 2), TH = 105 * DEG;
    for (let r0 = 8; r0 < 90; r0 += BD + AZ) {
      const rm = r0 + BD / 2;
      let n = Math.max(2, Math.round(2 * TH * rm / (BW + AX)));
      // a centre aisle while the runway runs through the band, a centre block past it
      const runway = r0 < RW1 + 1.4 - C.z;
      if (runway === (n % 2 === 1)) n++;
      const step = 2 * TH / n;
      for (let k = 0; k < n; k++) {
        const t0 = -TH + k * step, t1 = t0 + step, rows = [];
        for (let j = 0; j < NZ; j++) {
          const r = r0 + (j + 0.5) * PITCH, gap = (AX / 2) / r;
          const a0 = t0 + gap, a1 = t1 - gap, m = Math.floor((a1 - a0) * r / SEAT);
          const row = [];
          for (let i = 0; i < m; i++) {
            const a = a0 + ((a1 - a0) - (m - 1) * SEAT / r) / 2 + i * SEAT / r;
            const x = C.x + Math.sin(a) * r, z = C.z + Math.cos(a) * r;
            if (z > CZ - 0.4) row.push([x, z]);
          }
          rows.push(row);
        }
        place(rows);
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
  const hzWash = [hz.add(V3(-16, LT - 1, 14 + SZ), 0xffffff, 0), hz.add(V3(16, LT - 1, 14 + SZ), 0xffffff, 0), hz.add(V3(0, 22, CZ + XD / 2), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 10, 6 + SZ), fov: 60, near: 0.2, far: 800 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x07070b, 0.0026),
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
      bankM.color.copy(KELVIN(5200)).multiplyScalar(0.02 + 2.2 * f.house);
      runLasers(lasers, f);
      rig.aim(followBeam, V3(star.position.x, DECK + 0.6, star.position.z)); followBeam.intensity = 1.2 * show;
      front1.intensity = 90000 * show + 9000 * f.house;
      follow.intensity = 50000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (12000 + 14000 * f.energy + 6000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (200 + 500 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 30000 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h) => { h.power = 600 * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      bRimM.color.setHex(APP.accent).multiplyScalar((0.6 + 0.9 * f.kick) * show + 0.2);
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      // daylight through the outer layer, faint in the show
      outerMat.color.setRGB(0.95, 0.9, 0.8).multiplyScalar(0.035 + 0.75 * f.house);
      const sh = membrane.userData.shader;
      if (sh) {
        // the house lights wash the membrane warm; in the show it takes the stage's colour back
        sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.2, 0.16, 0.11).multiplyScalar(0.02 + 0.98 * f.house));
      }
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 14, 10 + SZ);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
    },
  };
}
