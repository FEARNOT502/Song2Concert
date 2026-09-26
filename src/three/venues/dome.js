// ─────────────────────────────────────────────────────────────────────────────
// DOME — Tokyo Dome: an air-supported membrane over a round bowl, 1.24 million
// m³, from FOH 55 m out on the field. Blue seats in the 1st-floor stand, the
// balcony band, the steep 2nd-floor stand under the roof; arena seats in
// blocks on the field; a catwalk to a B-stage; a sea of lightsticks under
// central control.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, DEG, KELVIN, V3, clamp, floorPanelTex, glowMat, lerp, prng, smooth, std } from '../core.js';
import { lightPoints } from '../people.js';
import { buildBowl, hoists, latticeInto, ledScreen, lineArray, mats, micStand, ribbonBoards, shadowSpot, stageDeck, stageSteps, subStack, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, fohPosition, runLasers, runShow, section, stageSet } from '../show.js';

export function membraneMaterial() {
  const m = std({ color: 0xd8d8d4, roughness: 0.95, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBounce = { value: new THREE.Color(0) };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform vec3 uBounce;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // the cable net: two families at 45 degrees, eight and a half metres apart
          vec2 p = vec2(vWP.x + vWP.z, vWP.x - vWP.z) / (8.5 * 1.4142);
          vec2 d = abs(fract(p) - 0.5);
          vec2 w = fwidth(p) * 1.2;
          float cable = 1.0 - min(smoothstep(0.0, w.x + 0.004, 0.5 - d.x), smoothstep(0.0, w.y + 0.004, 0.5 - d.y));
          diffuseColor.rgb *= 1.0 - 0.55 * cable;
          // panel seams and a soft sag between cables
          float sag = 0.9 + 0.1 * (d.x + d.y);
          diffuseColor.rgb *= sag;
          totalEmissiveRadiance += uBounce * (1.0 - 0.6 * cable) * sag;
        }`);
  };
  m.customProgramCacheKey = () => 'membrane';
  return m;
}

// The field outline: the outfield fence (100 m at the poles, 110 m to the
// alleys, 122 m to centre), the stand walls along the foul lines, closing in
// from 19 m of foul ground at home to nothing at the poles, and the backstop
// round behind home. Same interface as ringPath: `at(p, d)` is the outline
// pushed d metres outward. It runs the same way round as ringPath (up the +x
// side towards +z) so every face the bowl builds from it faces the field.
export function ballparkPath({ zH, lines = 100, centre = 122, alley = 110, backstop = 19 }) {
  // from home: angle 0 points at centre field (-z), positive towards +x
  const dir = (deg) => ({ x: Math.sin(deg * DEG), z: -Math.cos(deg * DEG) });
  const at0 = (deg, r) => { const d = dir(deg); return { x: d.x * r, z: zH + d.z * r }; };
  const k2 = 2 * (centre + lines) - 4 * alley, k1 = centre - lines + k2;   // r(u) = centre - k1 u + k2 u², through all three
  const fence = (deg) => { const u = Math.abs(deg) / 45; return centre - k1 * u + k2 * u * u; };
  const foul = (s) => backstop * (1 - s / lines);
  const raw = [];
  for (let a = 0; a <= 45; a += 0.25) raw.push(at0(a, fence(a)));
  const L = dir(45), N = dir(135);
  for (let s = lines; s >= 0; s -= 0.5) raw.push({ x: L.x * s + N.x * foul(s), z: zH + L.z * s + N.z * foul(s) });
  for (let a = 136; a <= 224; a += 1) raw.push(at0(a, backstop));
  const L2 = dir(-45), N2 = dir(-135);
  for (let s = 0; s <= lines; s += 0.5) raw.push({ x: L2.x * s + N2.x * foul(s), z: zH + L2.z * s + N2.z * foul(s) });
  for (let a = -45; a < 0; a += 0.25) raw.push(at0(a, fence(a)));
  // resample evenly, then round the corners a little (the pole corners and the
  // backstop joins are a few metres round, not knife edges)
  const dense = [];
  const STEP = 0.25;
  let carry = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = raw[(i + 1) % raw.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let t = carry;
    while (t < len) { dense.push({ x: a.x + (b.x - a.x) * t / len, z: a.z + (b.z - a.z) * t / len }); t += STEP; }
    carry = t - len;
  }
  const n = dense.length;
  let cur = dense;
  for (let pass = 0; pass < 3; pass++) {
    const W = 10;
    cur = cur.map((_, i) => {
      let x = 0, z = 0;
      for (let j = -W; j <= W; j++) { const p = cur[(i + j + n) % n]; x += p.x; z += p.z; }
      return { x: x / (2 * W + 1), z: z / (2 * W + 1) };
    });
  }
  const tangent = (i) => { const a = cur[(i - 2 + n) % n], b = cur[(i + 2) % n]; const l = Math.hypot(b.x - a.x, b.z - a.z); return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; };
  // keep a sample every couple of metres, or every two degrees round a bend,
  // so the outer rows stay smooth where the outline turns sharply
  const keep = [0];
  let arc = 0, t0 = tangent(0);
  for (let i = 1; i < n; i++) {
    arc += Math.hypot(cur[i].x - cur[i - 1].x, cur[i].z - cur[i - 1].z);
    const t = tangent(i);
    if (arc >= 2.2 || Math.acos(clamp(t.x * t0.x + t.z * t0.z, -1, 1)) >= 2 * DEG) { keep.push(i); arc = 0; t0 = t; }
  }
  const X = [], Z = [], NX = [], NZ = [];
  for (const i of keep.concat([keep[0]])) {
    const t = tangent(i);
    X.push(cur[i].x); Z.push(cur[i].z); NX.push(t.z); NZ.push(-t.x);
  }
  const pts = X.map((_, i) => i);
  const at = (i, d) => ({ x: X[i] + NX[i] * d, z: Z[i] + NZ[i] * d, nx: NX[i], nz: NZ[i] });
  const ring = (d = 0) => pts.slice(0, -1).map((i) => at(i, d));
  return { pts, at, ring };
}

export function buildDome(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 2.6, RIG = 32;
  const eye = V3(0, 1.6 + 1.0, 70);
  const STAGE = V3(0, DECK, 12);
  // The ballpark, measured: 100 m down the lines, 110 m to the alleys, 122 m to
  // centre. Home plate is behind FOH; the stage stands in front of the
  // centre-field fence.
  const ZH = 114;                 // home plate
  const ZC = 76;                  // centre of the roof and the building
  const park = ballparkPath({ zH: ZH });
  const phi = (x, z) => Math.abs(Math.atan2(x, ZH - z)) / DEG;   // 0 at centre field, 45 at the poles

  // ── field ──
  const fieldShape = new THREE.Shape(park.ring(0.5).map((p) => new THREE.Vector2(p.x, -p.z)));
  const fieldGeo = new THREE.ShapeGeometry(fieldShape, 1);
  fieldGeo.rotateX(-Math.PI / 2);
  const fuv = fieldGeo.attributes.uv; const fpos = fieldGeo.attributes.position;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / 16, fpos.getZ(i) / 16);
  const field = new THREE.Mesh(fieldGeo, std({ ...floorPanelTex({ key: 'domefloor', tone: 0.1 }), roughness: 0.8 }));
  field.position.y = 0.02; field.receiveShadow = true; root.add(field);

  // ── the stands ──
  // 1st floor all the way round: above the 4.24 m fence in the outfield,
  // just above the field along the lines and behind home, ramping between the
  // two where the outfield meets the infield at the poles. Balcony and 2nd
  // floor over the infield only.
  const ramp = (x, z) => { const a = phi(x, z); return a < 45.3 ? 3.0 : a > 48 ? 0 : 3.0 * (1 - smooth(45.3, 48, a)); };
  const bowl = buildBowl(pipe, {
    path: park, seatColor: 0x1d3c86, concreteTone: 0.28, stage: STAGE, seed: 400, block: 12, aisle: 1.2,
    // nobody behind or beside the set; the block straight behind it is tarped
    cover: (x, z) => z < 2 && Math.abs(x) < 36,
    occ: (x, z) => (z < 14 ? 0 : 1),
    occupancy: 1,
    tiers: [
      { rows: 30, rise: 0.36, riseFar: 0.44, run: 0.82, yBase: 1.3, inset: 0.4, crowd: true, lift: ramp, backWall: 5 },
      { rows: 2, rise: 0.5, run: 1.0, yBase: 17.2, inset: 27.4, crowd: true, face: 3.2, backWall: 2.8, where: (x, z) => phi(x, z) > 58 },
      { rows: 24, rise: 0.62, riseFar: 0.74, run: 0.9, yBase: 21.2, inset: 31, crowd: true, face: 2.6, backWall: 4, where: (x, z) => phi(x, z) > 58 },
    ],
  });
  root.add(bowl.group);
  // the wall in front of the 1st floor: padded 4.0 m with 0.24 m of net and the
  // yellow line in the outfield, a low padded wall along the lines, and the
  // backstop net behind home plate
  const pad = [], line = [], net = [], back = [];
  const RP = park.pts;
  for (let k = 0; k < RP.length - 1; k++) {
    const a = park.at(RP[k], 0.22), b = park.at(RP[k + 1], 0.22);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ang = -Math.atan2(b.z - a.z, b.x - a.x);
    const hA = 1.3 + ramp(a.x, a.z), hB = 1.3 + ramp(b.x, b.z), h = (hA + hB) / 2;
    const seg = (w, hh, y, list, d = 0.36) => { const g = new THREE.BoxGeometry(len + 0.04, hh, d); g.rotateY(ang); g.translate(mx, y, mz); list.push(g); };
    if (h > 3.9) {
      seg(0, 4.0, 2.0, pad);
      seg(0, 0.12, 4.02, line, 0.4);
      seg(0, 0.24, 4.16, net, 0.04);
    } else {
      seg(0, h - 0.1, (h - 0.1) / 2, pad);
      if (phi(mx, mz) > 150) seg(0, 7.5, h + 3.75, back, 0.03);
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(pad), std({ color: 0x163a78, roughness: 0.8 })));
  root.add(new THREE.Mesh(mergeGeometries(line), glowMat(0xe8c830, 0.45)));
  root.add(new THREE.Mesh(mergeGeometries(net), std({ color: 0x151515, roughness: 1, transparent: true, opacity: 0.6 })));
  if (back.length) root.add(new THREE.Mesh(mergeGeometries(back), std({ color: 0x202024, roughness: 1, transparent: true, opacity: 0.35, side: THREE.DoubleSide })));
  // the foul poles, where the lines meet the fence
  for (const sd of [-1, 1]) {
    const r = 100, x = sd * r * Math.SQRT1_2, z = ZH - r * Math.SQRT1_2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 26, 12), std({ color: 0xe8c418, roughness: 0.45, emissive: 0x3a3004 }));
    pole.position.set(x, 13, z); root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0xf2d020, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    flag.position.set(x - sd * 0.8, 14, z); flag.rotation.y = sd * Math.PI / 4; root.add(flag);
  }
  const ribbons = ribbonBoards(bowl, { tiers: [1, 2], height: 1.2, bright: 1.5 });
  root.add(ribbons);
  ctx.addScreen({ userData: { face: ribbons } }, 1, 'ribbon');

  // ── the membrane ──
  const RE = 116, YE = 42, APEX = 61.7;
  const rise = APEX - YE;
  const RS = (rise * rise + RE * RE) / (2 * rise);
  const th = Math.asin(RE / RS);
  const membrane = membraneMaterial();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(RS, 96, 24, 0, Math.PI * 2, 0, th), membrane);
  cap.position.set(0, APEX - RS, ZC); root.add(cap);
  // the ring beam the membrane is anchored to
  // what hangs from the cable net (as at the real building): a gondola at the
  // crown with the centre speaker cluster and the TV camera, 21 speaker
  // clusters round the edge of the membrane, and 14 banks of field lights
  const roofY = (r) => (APEX - RS) + Math.sqrt(RS * RS - r * r);
  const hang = [];
  const cable = (x, z, y0) => { const top = roofY(Math.hypot(x, z - ZC)); const c = new THREE.CylinderGeometry(0.03, 0.03, top - y0, 4); c.translate(x, (top + y0) / 2, z); hang.push(c); };
  const gondola = new THREE.Group();
  const gy = roofY(0) - 8;
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.8, 3.2, 24), std({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.4 }));
  pod.position.set(0, gy, ZC); gondola.add(pod);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const la = lineArray({ boxes: 4, width: 1.0, depth: 0.6, height: 0.36 });
    la.position.set(Math.sin(a) * 3.0, gy - 1.6, ZC + Math.cos(a) * 3.0); la.rotation.y = a; gondola.add(la);
  }
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.2), std({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.5 }));
  cam.position.set(0, gy - 3.4, ZC); gondola.add(cam);
  root.add(gondola);
  for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) cable(dx, ZC + dz, gy + 1.6);
  for (let i = 0; i < 21; i++) {
    const a = (i / 21) * Math.PI * 2 + 0.1;
    const r = 96, x = Math.sin(a) * r, z = ZC + Math.cos(a) * r;
    const y = roofY(r) - 6;
    const sp = lineArray({ boxes: 6, width: 1.1, depth: 0.62, height: 0.36 });
    sp.position.set(x, y, z); sp.rotation.y = Math.atan2(-x, ZC - z); root.add(sp);
    cable(x, z, y + 0.2);
  }
  const bankLamps = [];
  const bankM = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const bankFrames = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.22;
    const r = 70, x = Math.sin(a) * r, z = ZC + Math.cos(a) * r;
    const y = roofY(r) - 5;
    const yaw = Math.atan2(-x, ZC - z);
    const fr = new THREE.BoxGeometry(8, 0.3, 2.4); fr.rotateX(0.5); fr.rotateY(yaw); fr.translate(x, y, z); bankFrames.push(fr);
    for (let u = 0; u < 7; u++) for (let v = 0; v < 2; v++) {
      const lx = -3.3 + u * 1.1, lz = -0.55 + v * 1.1;
      const p = V3(lx, -0.2, lz).applyAxisAngle(V3(1, 0, 0), 0.5).applyAxisAngle(V3(0, 1, 0), yaw).add(V3(x, y, z));
      bankLamps.push(p);
    }
    cable(x - Math.cos(yaw) * 3, z + Math.sin(yaw) * 3, y);
    cable(x + Math.cos(yaw) * 3, z - Math.sin(yaw) * 3, y);
  }
  root.add(new THREE.Mesh(mergeGeometries(bankFrames), std({ color: 0x202024, roughness: 0.6, metalness: 0.4 })));
  const lampG = new THREE.CircleGeometry(0.4, 12);
  const lampI = new THREE.InstancedMesh(lampG, bankM, bankLamps.length);
  const lm4 = new THREE.Matrix4(), lq = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), V3(0, -1, 0));
  bankLamps.forEach((p, i) => { lm4.compose(p, lq, V3(1, 1, 1)); lampI.setMatrixAt(i, lm4); });
  root.add(lampI);
  root.add(new THREE.Mesh(mergeGeometries(hang), std({ color: 0x303036, roughness: 0.5, metalness: 0.6 })));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(RE, RE, YE, 96, 1, true), std({ color: 0x0e0e12, roughness: 0.9, side: THREE.BackSide }));
  drum.position.set(0, YE / 2, ZC); root.add(drum);

  // ── stage ──
  stageSet(root, { w: 38, h: 24, z: 3.6, deck: DECK, towerX: 20.4, backdropW: 50, backdropH: 23, wingX: 31, wingW: 12, wingH: 15 });
  const deck = stageDeck({ w: 62, d: 20, h: DECK, z: 12 });
  root.add(deck);
  const catwalk = stageDeck({ w: 4.4, d: 26, h: DECK - 0.8, z: 35, lip: false });
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 31.75, z: 22, h: DECK, dir: [0, -1] }));
  root.add(catwalk);
  const bstage = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.2, DECK - 0.8, 40), std({ color: 0x0a0a0c, roughness: 0.6 }));
  bstage.position.set(0, (DECK - 0.8) / 2, 51); root.add(bstage);
  const bRimM = glowMat(APP.accent, 1);
  const bRim = new THREE.Mesh(new THREE.TorusGeometry(6.05, 0.04, 6, 64), bRimM);
  bRim.rotation.x = Math.PI / 2; bRim.position.set(0, DECK - 0.8, 51); root.add(bRim);
  const scr = bigScreens(ctx, root, { w: 38, y: DECK + 1.6 + 38 / (16 / 9) / 2, z: 3.6, imagW: 17, imagX: 36, imagY: 19, imagZ: 7, imagYaw: 0.34, pitch: 0.0059 });
  // LED columns either side of the main wall
  for (const side of [-1, 1]) {
    const col = ledScreen({ w: 3.2, h: 18, tex: ctx.art.cover(), pitch: 0.012, bright: 1.2, kind: 'ribbon', frame: 0.1, light: false });
    col.position.set(side * 22.5, DECK + 9, 5); root.add(col);
    ctx.addScreen(col, 1, 'ribbon');
  }
  // an empty B-stage with its microphone, waiting
  const star = micStand({ height: 1.6 });
  star.position.set(0, DECK - 0.8, 51); root.add(star);
  for (let i = 0; i < 10; i++) { const w = wedge({ w: 0.8 }); w.position.set(-18 + i * 4, DECK, 21.6); w.rotation.y = Math.PI; root.add(w); }
  for (const side of [-1, 1]) for (const dz of [-2, 2]) { const sub = subStack({ count: 3, cols: 3, w: 1.4 }); sub.position.set(side * 14, 0, 24 + dz); root.add(sub); }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const z of [5, 13, 21]) { const t = truss(52, { size: 1.0, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-22, -8, 8, 22], RIG, z, APEX - 2)); }
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
    const edge = park.pts.map((k) => park.at(k, 30.4)).filter((p) => phi(p.x, p.z) > 62);
    edge.sort((p, q2) => Math.atan2(p.x, p.z - ZH) - Math.atan2(q2.x, q2.z - ZH));
    const len = [0];
    for (let i = 1; i < edge.length; i++) len.push(len[i - 1] + Math.hypot(edge[i].x - edge[i - 1].x, edge[i].z - edge[i - 1].z));
    const N2 = 18;
    for (let i = 0, j = 0; i < N2; i++) {
      const want = (i + 0.5) / N2 * len[len.length - 1];
      while (j < len.length - 2 && len[j + 1] < want) j++;
      const t = (want - len[j]) / (len[j + 1] - len[j]);
      const pos = V3(lerp(edge[j].x, edge[j + 1].x, t), 18.9, lerp(edge[j].z, edge[j + 1].z, t));
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
  follow.position.set(0, 36, 100); follow.target.position.set(0, DECK, 50);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, 4); stageWash.target.position.set(0, DECK, 16);
  for (const l of [front1, follow, stageWash]) root.add(l, l.target);
  const followBeam = rig.add({ kind: 'follow', pos: V3(0, 36, 100), length: 70, body: false, beamGain: 0.5, flareGain: 0.5, color: KELVIN(5600) });
  const fill = [];
  for (const [x, y, z] of [[-40, 30, 50], [40, 30, 50], [0, 40, 90]]) { const l = new THREE.PointLight(0xffffff, 0, 160, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  // the house lights are the field banks: aimed down at the field and the
  // stands, so the membrane above them only gets what bounces back up
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.22;
    const l = new THREE.SpotLight(KELVIN(5200), 0, 260, 1.05, 1, 2);
    l.position.set(Math.sin(a) * 70, 42, ZC + Math.cos(a) * 70);
    l.target.position.set(Math.sin(a) * 40, 0, ZC + Math.cos(a) * 40);
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
  const onField = inPoly(park.ring(-3));
  const rnd = prng(55);
  const fieldPeople = [];
  for (let z = 25; z < ZH + 16; z += 0.82) {
    for (let x = -80; x < 80; x += 0.54) {
      if (!onField(x, z)) continue;
      if (Math.abs(x) < 3.4 && z < 58) continue;                 // catwalk
      if (Math.hypot(x, z - 51) < 7.4) continue;                  // B-stage
      if (Math.abs(x - eye.x) < 5 && Math.abs(z - eye.z) < 4.5) continue;  // FOH
      if (Math.abs(x) < 14 && z > 20 && z < 27) continue;         // subs and the barrier
      if (((x + 60) % 9.5) < 1.1 || ((z - 25) % 11) < 1.2) continue;       // aisles
      fieldPeople.push({ x: x + (rnd() - 0.5) * 0.18, y: 0, z: z + (rnd() - 0.5) * 0.2, h: 0.92 + rnd() * 0.14 });
    }
  }
  bigCrowd(root, cu, q, fieldPeople.concat(bowl.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(bowl.aisleLights.map((a) => ({ ...a, white: true, size: 0.04 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.25;
  root.add(aisleField);
  root.add(lightPoints(fohPosition(pipe, root, eye, { riser: 1.0 }), cu, { maxPx: 4 }));

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  ctx.screenHaze(scr.main, offs.map(([dx, dy]) => hz.add(V3(dx * 19, scr.main.position.y + dy * scr.h * 0.5, 4.5), 0xffffff, 0)), offs);
  scr.main.userData.hazePower = 320;
  const hzWash = [hz.add(V3(-16, RIG - 1, 14), 0xffffff, 0), hz.add(V3(16, RIG - 1, 14), 0xffffff, 0), hz.add(V3(0, 22, 51), 0xffffff, 0)];

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
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 68), stage: STAGE, span: 60 });
      runShow(rig, beams, f, { house: V3(0, 22, 95), stage: STAGE, span: 80 });
      runShow(rig, washes, f, { house: V3(0, 0, 26), stage: STAGE, span: 30, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 40, 50), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      // the ring converges on the B-stage in the chorus, spreads to the roof otherwise
      const sec = f.sec || section(f.bar);
      ring2.forEach(({ fx, i, a }) => {
        const tgt = sec === 'chorus' ? V3(Math.sin(f.t * 0.8 + i) * 6, 26, 51 + Math.cos(f.t * 0.8 + i) * 6) : V3(Math.sin(a) * 30, 56, ZC + Math.cos(a) * 30);
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
      house.forEach((l) => { l.intensity = 12000 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h) => { h.power = 600 * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      bRimM.color.setHex(APP.accent).multiplyScalar((0.6 + 0.9 * f.kick) * show + 0.2);
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      const sh = membrane.userData.shader;
      if (sh) sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.03, 0.03, 0.032).multiplyScalar(0.4 + 1.6 * f.house));
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 14, 10);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
    },
  };
}
