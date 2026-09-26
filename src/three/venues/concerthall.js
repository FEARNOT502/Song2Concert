// ─────────────────────────────────────────────────────────────────────────────
// CONCERT HALL — a vineyard after Lotte Concert Hall: pale timber, red seats,
// terraces stepping round a rounded platform, choir seats behind the orchestra
// and the organ over them, a rippled ceiling with a canopy over the stage.
// The model's block is the listener's terrace (18 m wide): we sit 13 m out.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, glowMat, plasterTex, prng, std, thin, velvet, withRepeat, woodTex } from '../core.js';
import { crowd3D } from '../people.js';
import { ledScreen, mats, performer, seatField, shadowSpot } from '../rig.js';
import { orchestra } from './orchestra.js';

// A terrace of seats in its own frame: rows run along local x, depth runs along
// local +z away from the stage, and the front parapet is at z = 0. The block is
// placed with `at` (front centre) and `yaw` (0 = facing -z, toward a stage at
// smaller z).
export function terrace(ctx, out, { at, yaw = 0, width, rows, rowD = 0.92, rise = 0.16, jump = [], parapet = 1.0, seat = 0.54, curve = 0.012, fill = 0.94, seed = 1, mats: M, stage, empty = null, grow = 0.3, gaps = [] }) {
  const g = new THREE.Group();
  g.position.copy(at); g.rotation.y = yaw;
  const steps = [];
  let y = 0.08;
  const tops = [];
  for (let r = 0; r < rows; r++) {
    if (jump.includes(r)) y += 0.55;
    y += r === 0 ? 0 : typeof rise === 'function' ? rise(r) : rise;
    tops.push(y);
    // solid down to the hall floor, so a raised block is a mass, not a shelf
    const b = new THREE.BoxGeometry(width + r * grow, y + at.y, rowD);
    b.translate(0, (y - at.y) / 2, 0.2 + r * rowD + rowD / 2);
    steps.push(b);
    // the side walls: a low timber wall up each edge of the block, stepping
    // with the rake, so the ends are closed as the front is
    for (const sd of [-1, 1]) {
      const sw = new THREE.BoxGeometry(0.18, 1.0, rowD + 0.02);
      sw.translate(sd * ((width + r * grow) / 2 + 0.09), y + 0.5, 0.2 + r * rowD + rowD / 2);
      sw.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); sw.translate(at.x, at.y, at.z);
      out.parapets.push(sw);
    }
    // a step wall where a section jumps: the low wall the vineyard is for
    if (jump.includes(r)) {
      const w = new THREE.BoxGeometry(width + r * grow, 0.95, 0.14); w.translate(0, y - 0.1, 0.2 + r * rowD - 0.07);
      out.parapets.push(w.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(at.x, at.y, at.z));
    }
  }
  const stepGeo = mergeGeometries(steps);
  stepGeo.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); stepGeo.translate(at.x, at.y, at.z);
  out.steps.push(stepGeo);
  // front parapet, curved in plan
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const x0 = -width / 2 + (i / segs) * width, x1 = x0 + width / segs;
    const zc = (x) => x * x * curve;
    const len = Math.hypot(x1 - x0, zc(x1) - zc(x0));
    const w = new THREE.BoxGeometry(len + 0.02, parapet + at.y, 0.18);
    w.rotateY(-Math.atan2(zc(x1) - zc(x0), x1 - x0));
    w.translate((x0 + x1) / 2, (parapet - at.y) / 2, (zc(x0) + zc(x1)) / 2);
    w.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); w.translate(at.x, at.y, at.z);
    out.parapets.push(w);
    const c = new THREE.BoxGeometry(len + 0.02, 0.05, 0.26);
    c.rotateY(-Math.atan2(zc(x1) - zc(x0), x1 - x0));
    c.translate((x0 + x1) / 2, parapet + 0.025, (zc(x0) + zc(x1)) / 2);
    c.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); c.translate(at.x, at.y, at.z);
    out.copings.push(c);
  }
  const rnd = prng(seed);
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(at);
  for (let r = 0; r < rows; r++) {
    const wr = width + r * grow - 0.8;
    const n = Math.floor(wr / seat);
    for (let i = 0; i < n; i++) {
      const lx = -wr / 2 + (i + 0.5) * (wr / n);
      if (gaps.some((a) => Math.abs(lx - a) < 0.55)) continue;
      const lz = 0.2 + r * rowD + rowD * 0.5 + lx * lx * curve * 0.5;
      const p = V3(lx, tops[r], lz).applyMatrix4(m);
      const turn = Math.atan2(stage.x - p.x, stage.z - p.z);
      out.seats.push({ x: p.x, y: p.y, z: p.z, turn });
      if (empty && empty(p)) continue;
      if (rnd() < fill) out.people.push({ x: p.x, y: p.y + 0.02, z: p.z, turn: turn + (rnd() - 0.5) * 0.15, h: 0.93 + rnd() * 0.12 });
    }
  }
  return tops;
}

export function organ(M) {
  const g = new THREE.Group();
  const pipes = [];
  const add = (x, h, r, y0 = 0) => pipes.push({ x, h, r, y0 });
  // towers and flats, symmetric: a tall centre tower, flats, side towers
  const tower = (cx, n, hMax, r, curve = 0.5) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      add(cx + t * (n - 1) * r * 1.1, hMax * (1 - curve * 0.12 * Math.abs(t)), r);
    }
  };
  const flat = (x0, x1, n, h0, h1, r) => {
    for (let i = 0; i < n; i++) { const t = i / (n - 1); add(x0 + (x1 - x0) * t, h0 + (h1 - h0) * t, r, 0.6); }
  };
  tower(0, 7, 9.6, 0.21);
  for (const s of [-1, 1]) {
    flat(s * 1.9, s * 4.1, 9, 7.0, 5.4, 0.12);
    tower(s * 5.2, 5, 8.2, 0.18);
    flat(s * 6.4, s * 7.7, 6, 5.6, 4.4, 0.1);
  }
  const bodyG = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false);
  bodyG.translate(0, 0.5, 0);
  const footG = new THREE.ConeGeometry(1, 1, 18, 1, true); footG.rotateX(Math.PI); footG.translate(0, 0.5, 0);
  const mouthG = new THREE.PlaneGeometry(1, 1);
  const tin = std({ color: 0xd8d9dc, metalness: 1, roughness: 0.2 });
  const bI = new THREE.InstancedMesh(bodyG, tin, pipes.length);
  const fI = new THREE.InstancedMesh(footG, tin, pipes.length);
  const mI = new THREE.InstancedMesh(mouthG, std({ color: 0x050505, roughness: 1 }), pipes.length);
  const m4 = new THREE.Matrix4();
  pipes.forEach((p, i) => {
    const foot = Math.min(1.2, p.h * 0.16);
    m4.compose(V3(p.x, p.y0 + foot, 0), new THREE.Quaternion(), V3(p.r, p.h - foot, p.r)); bI.setMatrixAt(i, m4);
    m4.compose(V3(p.x, p.y0, 0), new THREE.Quaternion(), V3(p.r, foot, p.r)); fI.setMatrixAt(i, m4);
    m4.compose(V3(p.x, p.y0 + foot + p.r * 1.4, p.r * 1.001), new THREE.Quaternion(), V3(p.r * 1.1, p.r * 1.8, 1)); mI.setMatrixAt(i, m4);
  });
  g.add(bI, fI, mI);
  // the case: stiles between the towers, cornices over them, the impost below
  const wood = M.lightWood;
  const cs = [];
  const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); cs.push(b); };
  box(17.2, 0.9, 1.4, 0, -0.45, -0.3);
  box(17.6, 0.18, 1.6, 0, 0.02, -0.2);
  for (const s of [-1, 1]) {
    for (const x of [1.75, 4.35, 6.1, 8.2]) box(0.3, x === 8.2 ? 6.2 : 9.2 - x * 0.35, 0.9, s * x, (x === 8.2 ? 6.2 : 9.2 - x * 0.35) / 2, -0.25);
    box(1.3, 0.35, 1.0, s * 5.2, 8.5, -0.2);
  }
  box(3.4, 0.4, 1.1, 0, 10.0, -0.2);
  box(17, 11, 0.3, 0, 5, -0.9);
  const caseM = new THREE.Mesh(mergeGeometries(cs), wood);
  g.add(caseM);
  return g;
}

export function buildConcertHall(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const HW = 23, Z0 = -15, Z1 = 42, HH = 20;
  const STAGE = V3(0, 1.0, 6);
  const DECK = 1.0;
  const hinoki = woodTex({ key: 'hinoki', planks: 7, joints: 2, base: [0.74, 0.57, 0.39], tone: 0.08, grain: 0.18, rough: 0.35, seed: 31 });
  const oak = woodTex({ key: 'lightoak', planks: 5, joints: 1, base: [0.62, 0.45, 0.3], tone: 0.1, grain: 0.25, rough: 0.5, seed: 33 });
  const M = {
    lightWood: std({ ...withRepeat(oak, 1 / 1.5, 1 / 1.5), roughness: 1 }),
    parapet: std({ ...withRepeat(oak, 1 / 1.2, 1 / 1.2), roughness: 1 }),
  };
  const bumps = plasterTex({ key: 'hallbumps', base: [0.7, 0.58, 0.45], bumps: 5 });
  const wallMat = std({ ...withRepeat(bumps, 1 / 2.4, 1 / 2.4), roughness: 1, normalScale: new THREE.Vector2(1.6, 1.6) });

  // ── shell: a rounded plan, walls of bumped timber ──
  const plan = [[-HW, Z1], [HW, Z1], [HW, 6], [18, -9], [8, Z0], [-8, Z0], [-18, -9], [-HW, 6]];
  for (let i = 0; i < plan.length; i++) {
    const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % plan.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const geo = new THREE.PlaneGeometry(len, HH);
    const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len / 2.4, uv.getY(k) * HH / 2.4);
    const w = new THREE.Mesh(geo, wallMat);
    w.position.set((x0 + x1) / 2, HH / 2, (z0 + z1) / 2);
    w.rotation.y = Math.atan2(x0 - x1, z0 - z1) + Math.PI / 2;
    w.material.side = THREE.DoubleSide;
    w.receiveShadow = true;
    root.add(w);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, Z1 - Z0), std({ color: 0x1a120c, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z0 + Z1) / 2); root.add(floor);
  // the ceiling: a shallow dome with ripples, cream plaster
  const cg = new THREE.PlaneGeometry(HW * 2, Z1 - Z0, 60, 70);
  cg.rotateX(Math.PI / 2);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i);
    const r2 = (x / HW) ** 2 + (z / ((Z1 - Z0) / 2)) ** 2;
    cp.setY(i, HH + 2.5 * (1 - r2) + 0.45 * Math.sin(x * 0.45 + z * 0.12) * Math.cos(z * 0.33));
  }
  cg.computeVertexNormals();
  const ceil = new THREE.Mesh(cg, std({ ...withRepeat(plasterTex({ key: 'ceilplaster', base: [0.86, 0.82, 0.76] }), 8, 10), roughness: 1, side: THREE.DoubleSide }));
  ceil.position.z = (Z0 + Z1) / 2; root.add(ceil);
  // the canopy over the platform
  const can = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 18, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22), std({ color: 0xd9cbb4, roughness: 0.7, side: THREE.DoubleSide }));
  can.scale.set(9, 2.4, 6); can.position.set(0, 16.2, 4.5); root.add(can);
  const canFill = new THREE.PointLight(KELVIN(3600), 0, 16, 2);
  canFill.position.set(0, 10.5, 7); root.add(canFill);
  const canRim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 60), glowMat(KELVIN(3000), 2.5));
  canRim.rotation.x = Math.PI / 2; canRim.scale.set(9 * Math.sin(Math.PI * 0.22), 6 * Math.sin(Math.PI * 0.22), 1); canRim.position.set(0, 16.2 - 2.4 * Math.cos(Math.PI * 0.22), 4.5); root.add(canRim);
  // downlights in the ceiling and a cove along the top of the walls
  const dl = [];
  for (let x = -16; x <= 16; x += 4) for (let z = -8; z <= 34; z += 4.5) {
    if (Math.abs(x) < 9 && z > -1 && z < 10) continue;
    dl.push(pipe.flares.add(V3(x, HH + 2.5 * (1 - (x / HW) ** 2 - ((z - (Z0 + Z1) / 2) / ((Z1 - Z0) / 2)) ** 2) - 0.2, z), KELVIN(3000), 0.5, 0.4));
  }
  const coveM = glowMat(KELVIN(2700), 1.2);
  for (let i = 0; i < plan.length; i++) {
    const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % plan.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), coveM);
    s.position.set((x0 + x1) / 2 * 0.985, HH - 0.3, (z0 + z1) / 2 * 0.985 + 0.2);
    s.rotation.y = Math.atan2(z0 - z1, x1 - x0);
    root.add(s);
  }

  // ── the platform ──
  const plat = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-10, -7); s.lineTo(10, -7); s.lineTo(10, 1.5);
  s.bezierCurveTo(10, 4.8, 5.5, 6.3, 0, 6.3); s.bezierCurveTo(-5.5, 6.3, -10, 4.8, -10, 1.5); s.lineTo(-10, -7);
  const pg = new THREE.ExtrudeGeometry(s, { depth: DECK, bevelEnabled: false, curveSegments: 32 });
  pg.rotateX(Math.PI / 2); pg.translate(0, DECK, 0);
  const stageTop = std({ ...withRepeat(hinoki, 1 / 1.3, 1 / 2.6), roughness: 1 });
  // top faces carry UVs in extrude units; scale them to metres
  const platMesh = new THREE.Mesh(pg, [stageTop, std({ color: 0x3a2818, roughness: 0.6 })]);
  platMesh.position.set(0, 0, 5.2); platMesh.receiveShadow = true;
  plat.add(platMesh);
  root.add(plat);

  // ── seating, by the seating plan ──
  // In front of the platform, the 1st floor's five blocks A to E across the
  // hall, each 23 rows in three terraces: rows 1–8 nearly flat, a wall, rows
  // 9–16, another wall, rows 17–23 climbing to the height of the 2nd floor.
  // Beside the platform L and R, behind it on either side LP and RP, and the
  // choir seats P behind the orchestra under the organ. On the 2nd floor, A to
  // E across the back of the hall, and L and R above the platform's sides.
  const out = { steps: [], parapets: [], copings: [], seats: [], people: [] };
  const eyeZ = 19;
  const stageC = V3(0, DECK, 5);
  const notMine = (p) => Math.abs(p.z - eyeZ) < 0.55 && Math.abs(p.x) < 0.8;
  const rake = (r) => (r < 8 ? 0.1 : r < 16 ? 0.2 : 0.36);
  const front = { rows: 23, rowD: 0.9, rise: rake, jump: [8, 16], parapet: 0.95, stage: stageC };
  const ours = terrace(ctx, out, { ...front, at: V3(0, 0, 12.6), width: 7.6, grow: 0.12, curve: 0.01, seed: 71, empty: notMine });         // C
  for (const sd of [-1, 1]) {
    terrace(ctx, out, { ...front, at: V3(sd * 8.9, 0, 12.3), yaw: sd * 0.08, width: 7.4, grow: 0.1, curve: 0.008, seed: 72 + sd });       // B, D
    terrace(ctx, out, { ...front, at: V3(sd * 16.6, 0, 11.6), yaw: sd * 0.1, width: 5.8, grow: 0.06, curve: 0.006, seed: 75 + sd });      // A, E
    terrace(ctx, out, { at: V3(sd * 14.2, 3.4, 2.0), yaw: sd * 1.22, width: 9, rows: 6, rise: 0.36, parapet: 1.1, curve: 0.02, seed: 91 + sd, stage: stageC });   // L, R
    terrace(ctx, out, { at: V3(sd * 12.0, 3.2, -6.2), yaw: sd * 2.1, width: 7, rows: 5, rise: 0.4, parapet: 1.1, curve: 0.02, seed: 95 + sd, stage: stageC });   // LP, RP
    terrace(ctx, out, { at: V3(sd * 15.6, 7.8, -3.5), yaw: sd * 1.9, width: 8, rows: 4, rise: 0.45, parapet: 1.05, curve: 0.01, seed: 103 + sd, stage: stageC }); // 2F L, R
  }
  terrace(ctx, out, { at: V3(0, 2.0, -2.8), yaw: Math.PI, width: 15, rows: 7, rise: 0.46, parapet: 1.0, curve: 0.01, seed: 111, stage: stageC });                // P
  terrace(ctx, out, { at: V3(0, 7.6, 34.2), width: 38, rows: 6, rise: 0.4, parapet: 1.05, curve: 0.002, grow: 0.2, gaps: [-13, -5.2, 5.2, 13], seed: 121, stage: stageC }); // 2F A–E
  const eyeRow = Math.floor((eyeZ - 12.8) / 0.9);
  const eye = V3(0, ours[Math.min(ours.length - 1, eyeRow)] + 1.4, eyeZ);
  const stepsMesh = new THREE.Mesh(mergeGeometries(out.steps), std({ color: 0x2a1a12, roughness: 0.95 }));
  stepsMesh.receiveShadow = true;
  root.add(stepsMesh);
  root.add(new THREE.Mesh(mergeGeometries(out.parapets), M.parapet));
  root.add(new THREE.Mesh(mergeGeometries(out.copings), std({ color: 0xc9a878, roughness: 0.35 })));
  root.add(seatField(out.seats, { fabric: velvet(0x8e1018, 'lotteseat'), frame: std({ color: 0x5a3c22, roughness: 0.45 }) }));
  if (q.crowd) root.add(crowd3D(thin(out.people, Math.round(out.people.length * Math.max(0.5, q.crowd))), cu, { kind: 'seated', detail: 1, seed: 17 }));

  // ── the organ ──
  const org = organ(M);
  org.position.set(0, 7.0, Z0 + 1.6);
  root.add(org);

  // ── the orchestra: a four-wind orchestra in American seating ──
  const cond = V3(0, DECK + 0.25, 10.2);
  orchestra(root, cu, { DECK, cond, q });
  const conductor = performer('conductor', { top: 0x050507, skin: 0.3, cast: true });
  conductor.position.copy(cond); conductor.rotation.y = Math.PI; root.add(conductor);
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 24), std({ color: 0x2a1c12 }));
  podium.position.set(cond.x, DECK + 0.125, cond.z); root.add(podium);

  // ── the art: a projection screen hung over the choir, below the pipes ──
  const aspect = 16 / 9;
  const SW = 7.4, SH = SW / aspect;
  const screen = ledScreen({ w: SW, h: SH, tex: ctx.art.texture(aspect), pitch: 0.0012, bright: 1.1, frame: 0.06, light: true, lightPower: 0.6 });
  screen.position.set(0, 9.7, -8.2);
  root.add(screen);
  ctx.addScreen(screen, aspect, 'main');
  for (const sx of [-SW / 2 + 0.3, SW / 2 - 0.3]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 10, 4), mats().black);
    cable.position.set(sx, 9.7 + SH / 2 + 5, -8.2); root.add(cable);
  }

  // ── light: the platform is lit, the house is warm and low ──
  const warm = KELVIN(3900);
  const key1 = shadowSpot(warm, 0, { angle: 0.42, penumbra: 0.8, size: q.shadowSize, far: 60, cast: q.shadows });
  key1.position.set(-7, 18.5, 17); key1.target.position.set(0, DECK, 4);
  const key2 = shadowSpot(warm, 0, { angle: 0.42, penumbra: 0.8, size: q.shadowSize, far: 60, cast: q.shadows });
  key2.position.set(7, 18.5, 15); key2.target.position.set(0, DECK, 3);
  const organLight = shadowSpot(KELVIN(3100), 0, { angle: 0.36, penumbra: 0.9, cast: false });
  organLight.position.set(0, 19, 8); organLight.target.position.set(0, 12, Z0 + 1.5);
  const choirWash = shadowSpot(warm, 0, { angle: 0.5, penumbra: 1, cast: false });
  choirWash.position.set(0, 18, 12); choirWash.target.position.set(0, 4, -5);
  for (const l of [key1, key2, organLight, choirWash]) { root.add(l, l.target); }
  const top = new THREE.RectAreaLight(warm, 0, 14, 9);
  top.position.set(0, 14.4, 4.5); top.lookAt(0, 0, 4.5); root.add(top);
  const house = [];
  for (const [x, y, z] of [[-12, 17, 10], [12, 17, 10], [0, 19, 24], [-10, 16, 28], [10, 16, 28], [0, 18, -6]]) {
    const l = new THREE.PointLight(KELVIN(2900), 0, 40, 2); l.position.set(x, y, z); root.add(l); house.push(l);
  }
  root.add(new THREE.HemisphereLight(0x3a2c22, 0x140c08, 0.2));
  const hz = pipe.haze;
  const offs = [[-0.5, 0.3], [0.5, 0.3], [0, -0.3]];
  ctx.screenHaze(screen, offs.map(([dx, dy]) => hz.add(V3(dx * SW * 0.5, 9.7 + dy * SH * 0.5, -7.9), 0xffffff, 0)), offs);
  screen.userData.hazePower = 6;
  const hzStage = hz.add(V3(0, DECK + 2, 4), warm, 0);

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, 6.4, -3), fov: 54, near: 0.1, far: 200 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x0a0706, 0.004),
    hazeDensity: 0.0008, beamGain: 0.2, hazeAmb: new THREE.Color(0x020201),
    bloom: { strength: 0.35, radius: 0.5, threshold: 1.1 },
    grade: { exposure: 1.15, vignette: 0.32, ca: 0.003, grain: 0.03, sat: 0.96, lift: [0.008, 0.006, 0.004] },
    env: { w: HW * 2, h: HH, d: Z1 - Z0, eye, wall: 0x3a2818, floor: 0x3a2014, ambient: 0x0c0806, emitters: [
      { w: 18, h: 10, pos: V3(0, DECK + 0.1, 3), normal: V3(0, 1, 0), color: KELVIN(3400), power: 2.2 },
      { w: SW, h: SH, pos: V3(0, 9.7, -8), normal: V3(0, 0, 1), screen: true, power: 1, aspect },
      { w: 30, h: 30, pos: V3(0, HH + 2, 10), normal: V3(0, -1, 0), color: KELVIN(3000), power: 0.35 },
    ] },
    envIntensity: 0.9,
    update(f) {
      const show = 1 - f.house;
      const lift = 0.9 + 0.1 * f.energy;
      key1.intensity = 2600 * lift; key2.intensity = 2200 * lift;
      canFill.intensity = 40 + 20 * f.house;
      top.intensity = 5 * lift;
      organLight.intensity = 1600 + 300 * f.house;
      choirWash.intensity = 700 + 400 * f.house;
      house.forEach((l) => { l.intensity = 90 + 420 * f.house; });
      dl.forEach((d) => { d.intensity = 0.2 + 0.6 * f.house; });
      coveM.color.copy(KELVIN(2700)).lerp(f.pal.a, 0.75 * show).multiplyScalar(0.9 + 1.4 * f.house);
      canRim.material.color.copy(KELVIN(3000)).lerp(f.pal.d, 0.8 * show).multiplyScalar(1.6 + 1.3 * f.house);
      hzStage.power = 10 * lift;
      // the only nod to the palette here: a faint tint in the canopy's light
      top.color.copy(warm).lerp(f.pal.d, 0.35 * show);
      organLight.color.copy(KELVIN(3100)).lerp(f.pal.c, 0.35 * show);
      choirWash.color.copy(warm).lerp(f.pal.a, 0.25 * show);
      cu.uRimColor.value.copy(warm).multiplyScalar(0.05);
      cu.uStage.value.set(0, 6, 4);
      cu.uWash.value.copy(warm).multiplyScalar(0.015 + 0.03 * f.house);
      cu.uAmb.value.setRGB(0.01, 0.008, 0.006).multiplyScalar(1 + f.house * 3);
    },
  };
}
