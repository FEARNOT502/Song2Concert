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
import { APP, DEG, KELVIN, V3, clamp, floorPanelTex, glowMat, lerp, std } from '../core.js';
import { lightPoints } from '../people.js';
import { hoists, latticeInto, ledScreen, lineArray, mats, micStand, rodInto, shadowSpot, stageDeck, stageSteps, subStack, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, blockGrid, floorBlocks, floorChairs, fohPosition, runLasers, runShow, section, stageSet, wallStrip } from '../show.js';
import { buildStands } from '../stands.js';
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
  const DECK = 2.6, RIG = 32;
  // FOH, and the listener there: at the back of the field's seats
  const eye = V3(0, 1.6 + 1.0, 104);
  const STAGE = V3(0, DECK, 12);
  // The ballpark as the official seating map draws it: the field is the open
  // ground inside the 1st floor's front rows; home plate is behind FOH, the
  // stage stands in front of the centre-field fence.
  const ZH = 114;                 // home plate
  const OFF = V3(0, 0, ZH);
  const fieldRing = TD_STANDS.field[0][0].map(([x, z]) => ({ x, z: z + ZH }));
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
  // balcony's (season seats) grey; the outfield unsold.
  const stands = buildStands(TD_STANDS, {
    offset: OFF, stage: STAGE, seed: 400, concreteTone: 0.28, roofY: (x, z) => ringY(z + ZH) + 0.3,
    seatColors: { A: 0x1d3c86, B: 0x1d3c86, F: 0x1d3c86, G: 0x1d3c86, C: 0x5a5d63, D: 0x1d3c86, E: 0x1d3c86 },
    crowd: !!q.crowd,
    // nobody behind or beside the set, nor out in the outfield stands
    sold: (x, z, name) => z > 14 && name !== 'F',
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
  // the wall in front of the 1st floor: padded 4.0 m with 0.24 m of net and the
  // yellow line in the outfield, a low padded wall along the lines (for a
  // concert the backstop net behind home plate is taken down)
  // one continuous wall round the field, its height eased along it
  const ringPts = [], ringH = [], ringOut = [];
  {
    // the traced ring resampled evenly, every half metre
    const src = fieldRing.concat([fieldRing[0]]);
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
  }
  const padGeo = wallStrip(ringPts, ringH, { thick: 0.36, closed: true, ease: 6 });
  // steps from the field up over the low wall into the 1st floor's front
  // rows, round foul territory either side (the way the field's crowd comes
  // and goes from the stands at a concert)
  for (const want of [95, 125, 160]) for (const sd of [-1, 1]) {
    let best = -1, bd = Infinity;
    ringPts.forEach((p, i) => { if (ringOut[i] || Math.sign(p.x) !== sd) return; const d = Math.abs(phi(p.x, p.z) - want); if (d < bd) { bd = d; best = i; } });
    if (best < 0) continue;
    const n = ringPts.length, a = ringPts[(best - 2 + n) % n], c = ringPts[(best + 2) % n], p = ringPts[best];
    let ux = -(c.z - a.z), uz = c.x - a.x; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    if (ux * p.x + uz * (p.z - (ZH - 60)) < 0) { ux = -ux; uz = -uz; }   // outwards, from the field to the stand
    const h = ringH[best], run = 0.28, len = Math.ceil(h / 0.2) * run;
    root.add(stageSteps({ x: p.x - ux * (len + 0.2), z: p.z - uz * (len + 0.2), h, dir: [ux, uz], width: 1.6 }));
  }
  root.add(new THREE.Mesh(padGeo, std({ color: 0x0f3a24, roughness: 0.8 })));
  // the yellow line along the top of the outfield fence, and its net
  {
    const n = ringPts.length, eased = ringH.map((_, i) => { let s = 0, w = 0; for (let k = -6; k <= 6; k++) { const wk = 7 - Math.abs(k); s += ringH[(i + k + n) % n] * wk; w += wk; } return s / w; });
    let i0 = ringOut.findIndex((o, i) => o && !ringOut[(i - 1 + n) % n]);
    if (i0 >= 0) {
      const run = [];
      for (let k = 0; k < n && ringOut[(i0 + k) % n]; k++) run.push((i0 + k) % n);
      const pts = run.map((i) => ringPts[i]), top = run.map((i) => eased[i]);
      const lineGeo = wallStrip(pts, top.map((h) => h + 0.12), { y0: top.map((h) => h + 0.005), thick: 0.4, ease: 0 });
      if (lineGeo) root.add(new THREE.Mesh(lineGeo, glowMat(0xe8c830, 0.45)));
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
  stageSet(root, { w: 38, h: 24, z: 3.6, deck: DECK, towerX: 20.4, backdropW: 50, backdropH: 23, wingX: 31, wingW: 12, wingH: 15, drapes: false });
  const deck = stageDeck({ w: 62, d: 20, h: DECK, z: 12 });
  root.add(deck);
  // (as the photographs from the 2nd floor show it) a short runway out from
  // the stage's middle to a long stage across the field, parallel to the
  // main stage and symmetric about the middle
  const RW0 = 22, RW1 = 47, XW = 30, XD = 5.2, XH = DECK - 0.8;
  const catwalk = stageDeck({ w: 4.4, d: RW1 - RW0, h: XH, z: (RW0 + RW1) / 2, lip: false });
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 31.75, z: 22, h: DECK, dir: [0, -1] }));
  root.add(catwalk);
  const crossDeck = stageDeck({ w: XW * 2, d: XD, h: XH, z: RW1 + XD / 2 });
  root.add(crossDeck);
  const bRimM = glowMat(APP.accent, 1);
  {
    const g = new THREE.BoxGeometry(XW * 2 + 0.1, 0.05, 0.05); g.translate(0, XH, RW1 + XD + 0.02);
    const bRim = new THREE.Mesh(g, bRimM); root.add(bRim);
  }
  const scr = bigScreens(ctx, root, { w: 38, y: DECK + 1.6 + 38 / (16 / 9) / 2, z: 3.6, imagW: 17, imagX: 36, imagY: 19, imagZ: 7, imagYaw: 0.34, pitch: 0.0059 });
  // LED columns either side of the main wall
  for (const side of [-1, 1]) {
    const col = ledScreen({ w: 3.2, h: 18, tex: ctx.art.cover(), pitch: 0.012, bright: 1.2, kind: 'ribbon', frame: 0.1, light: false });
    col.position.set(side * 22.5, DECK + 9, 5); root.add(col);
    ctx.addScreen(col, 1, 'ribbon');
  }
  // a microphone waiting at the front of the long stage
  const star = micStand({ height: 1.6 });
  star.position.set(0, XH, RW1 + XD - 0.8); root.add(star);
  for (let i = 0; i < 10; i++) { const w = wedge({ w: 0.8 }); w.position.set(-18 + i * 4, DECK, 21.6); w.rotation.y = Math.PI; root.add(w); }
  for (const side of [-1, 1]) for (const dz of [-2, 2]) { const sub = subStack({ count: 3, cols: 3, w: 1.4 }); sub.position.set(side * 14, 0, 24 + dz); root.add(sub); }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const z of [5, 13, 21]) { const t = truss(52, { size: 1.0, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-22, -8, 8, 22], RIG, z, Math.min(...[-22, -8, 8, 22].map((x) => roofAt(x, z))) - 0.5)); }
  for (const side of [-1, 1]) {
    const main = lineArray({ boxes: 18, width: 1.4 }); main.position.set(side * 20, RIG - 0.8, 22); main.rotation.y = -side * 0.06; root.add(main);
    const out = lineArray({ boxes: 14, width: 1.3 }); out.position.set(side * 30, RIG - 1.2, 20); out.rotation.y = -side * 0.35; root.add(out);
    // delay towers on the field
    const mast = [];
    latticeInto(mast, V3(side * 34, 0, 58), V3(side * 34, 22, 58), 1.2, 0.05);
    root.add(new THREE.Mesh(mergeGeometries(mast), mats().black));
    const delay = lineArray({ boxes: 10, width: 1.2 }); delay.position.set(side * 34, 22, 57.2); delay.rotation.y = Math.PI - side * 0.1; root.add(delay);
  }
  const spots = [], beams = [], washes = [], ups = [], ring2 = [], lasers = [], bst = [];
  for (let i = 0; i < 14; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-24 + i * (48 / 13), RIG - 0.6, 21), length: 70, angle: 0.08 }), i, n: 14, group: 0 });
  for (let i = 0; i < 14; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-24 + i * (48 / 13), RIG - 0.6, 13), length: 90, beamGain: 1.2 }), i, n: 14, group: 1 });
  for (let i = 0; i < 10; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(-22 + i * (44 / 9), RIG - 0.6, 5), length: 35, beamGain: 0.4 }), i, n: 10, group: 2 });
  for (let i = 0; i < 12; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * (52 / 11), DECK + 0.3, 21.8), hang: 'up', length: 70 }), i, n: 12, group: 3 });
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
  for (let i = 0; i < 6; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-10 + i * 4, DECK + 0.3, 21.9), body: false, length: 150, beamGain: 7, flareGain: 0.2, noise: 0.4 }), i, n: 6 });
  const moverLights = [];
  for (const k of [3, 6, 9, 12]) moverLights.push(rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5 }), 14000));
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.14, penumbra: 0.7, size: q.shadowSize, far: 140, cast: q.shadows });
  front1.position.set(-8, 30, 72); front1.target.position.set(0, DECK + 1, 15);
  const follow = shadowSpot(KELVIN(5600), 0, { angle: 0.035, penumbra: 0.5, cast: false });
  follow.position.set(0, 36, 100); follow.target.position.set(0, XH, RW1 + XD / 2);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, 4); stageWash.target.position.set(0, DECK, 16);
  for (const l of [front1, follow, stageWash]) root.add(l, l.target);
  const followBeam = rig.add({ kind: 'follow', pos: V3(0, 36, 100), length: 70, body: false, beamGain: 0.5, flareGain: 0.5, color: KELVIN(5600) });
  const fill = [];
  for (const [x, y, z] of [[-40, 30, 50], [40, 30, 50], [0, 40, 90]]) { const l = new THREE.PointLight(0xffffff, 0, 160, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
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
  // the arena: lettered blocks A (at the stage) to F (at home plate), numbered
  // across, 13 seats wide and 15 rows deep, clipped to the field and cleared
  // for the runway, the B-stage, the delay towers and the desk
  const xs = [];
  for (let i = 0; i < 8; i++) { const x0 = 1.0 + i * 8.2; xs.unshift([-x0 - 7, -x0]); xs.push([x0, x0 + 7]); }
  const keep = (x, z) => onField(x, z)
    && z > RW0 + 2.4                                                     // the pit in front of the stage
    && !(Math.abs(x) < 3.6 && z < RW1)                                   // the runway
    && !(Math.abs(x) < XW + 1.6 && z > RW1 - 1.8 && z < RW1 + XD + 1.8)  // the long stage, seats either side of it
    && !(Math.abs(x - eye.x) < 5.5 && Math.abs(z - eye.z) < 4.5)         // the desk
    && z < eye.z + 3.0                                                   // nobody behind the desk
    && Math.hypot(Math.abs(x) - 34, z - 58) > 1.6;
  const arena = floorBlocks(blockGrid([[25, 39], [41, 55], [57, 71], [73, 87], [89, 103], [105, 119]], xs), { keep, seed: 55 });
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
  ctx.screenHaze(scr.main, offs.map(([dx, dy]) => hz.add(V3(dx * 19, scr.main.position.y + dy * scr.h * 0.5, 4.5), 0xffffff, 0)), offs);
  scr.main.userData.hazePower = 320;
  const hzWash = [hz.add(V3(-16, RIG - 1, 14), 0xffffff, 0), hz.add(V3(16, RIG - 1, 14), 0xffffff, 0), hz.add(V3(0, 22, RW1 + XD / 2), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 10, 6), fov: 60, near: 0.2, far: 800 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x07070b, 0.0026),
    hazeDensity: 0.0011, beamGain: 0.5, hazeAmb: new THREE.Color(0x05050a), hazeAmbDist: 260,
    bloom: { strength: 0.75, radius: 0.7, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.1, lift: [0.004, 0.004, 0.009] },
    env: { w: 236, h: 56, d: 236, eye, wall: 0x0c0c12, floor: 0x0a0a0c, emitters: [
      { w: 38, h: 21, pos: V3(0, 14.9, 4), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: 16 / 9 },
      { w: 200, h: 200, pos: V3(0, 55, 52), normal: V3(0, -1, 0), color: 0x202028, power: 1 },
    ] },
    envIntensity: 0.55,
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 68), stage: STAGE, span: 60 });
      runShow(rig, beams, f, { house: V3(0, 22, 95), stage: STAGE, span: 80 });
      runShow(rig, washes, f, { house: V3(0, 0, 26), stage: STAGE, span: 30, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 40, 50), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      // the ring converges on the long stage in the chorus, spreads to the roof otherwise
      const sec = f.sec || section(f.bar);
      ring2.forEach(({ fx, i, a }) => {
        const tgt = sec === 'chorus' ? V3(Math.sin(f.t * 0.8 + i) * 22, 26, RW1 + XD / 2 + Math.cos(f.t * 0.8 + i) * 3) : V3(Math.sin(a) * 30, 56, ZC + Math.cos(a) * 30);
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
      const sh = membrane.userData.shader;
      if (sh) {
        // the house lights wash the membrane warm; in the show it takes the stage's colour back
        sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.2, 0.16, 0.11).multiplyScalar(0.02 + 0.98 * f.house));
      }
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 14, 10);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
    },
  };
}
