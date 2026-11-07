// ─────────────────────────────────────────────────────────────────────────────
// CONCERT HALL — a vineyard after Lotte Concert Hall: pale timber, red seats,
// terraces stepping round the platform, choir seats behind the orchestra and
// the organ over them, a rippled ceiling with a canopy over the stage. The
// plan, the platform and every seat are the hall's own seating charts'.
// We sit in the 10th row of C, 10 m from the platform's edge.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, glowMat, plasterTex, std, thin, velvet, withRepeat, woodTex } from '../core.js';
import { crowd3D } from '../people.js';
import { ledScreen, mats, performer, seatField, shadowSpot } from '../rig.js';
import { buildStands, decodeSeats } from '../stands.js';
import { LOTTE_STANDS } from './lotte-data.js';
import { orchestra } from './orchestra.js';

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
  // the hall's own plan, off its seating chart
  const planXZ = LOTTE_STANDS.plan;
  const HW = Math.max(...planXZ.map(([x]) => Math.abs(x)));
  const Z0 = Math.min(...planXZ.map(([, z]) => z)), Z1 = Math.max(...planXZ.map(([, z]) => z)), HH = 20;
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

  // ── shell: a rounded plan, walls of bumped timber, a door behind each block ──
  const plan = planXZ;
  const doors = hallDoors(LOTTE_STANDS, plan);
  wallMat.side = THREE.DoubleSide;
  for (let i = 0; i < plan.length; i++) {
    const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % plan.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(len, 0); sh.lineTo(len, HH); sh.lineTo(0, HH); sh.lineTo(0, 0);
    for (const d of doors.filter((q) => q.seg === i)) {
      const u0 = d.u - DOOR_W / 2, u1 = d.u + DOOR_W / 2;
      const h = new THREE.Path(); h.moveTo(u0, d.y); h.lineTo(u1, d.y); h.lineTo(u1, d.y + DOOR_H); h.lineTo(u0, d.y + DOOR_H); h.lineTo(u0, d.y); sh.holes.push(h);
    }
    const geo = new THREE.ShapeGeometry(sh, 1);
    const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 2.4, uv.getY(k) / 2.4);
    const P = geo.attributes.position, ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    for (let k = 0; k < P.count; k++) { const u = P.getX(k), v = P.getY(k); P.setXYZ(k, x0 + ux * u, v, z0 + uz * u); }
    geo.computeVertexNormals();
    const w = new THREE.Mesh(geo, wallMat);
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

  // ── the platform, as the chart draws it ──
  const plat = new THREE.Group();
  const s = new THREE.Shape(LOTTE_STANDS.stage.map(([x, z]) => new THREE.Vector2(x, z)));
  const pg = new THREE.ExtrudeGeometry(s, { depth: DECK, bevelEnabled: false, curveSegments: 1 });
  pg.rotateX(Math.PI / 2); pg.translate(0, DECK, 0);
  const stageTop = std({ ...withRepeat(hinoki, 1 / 1.3, 1 / 2.6), roughness: 1 });
  const platMesh = new THREE.Mesh(pg, [stageTop, std({ color: 0x3a2818, roughness: 0.6 })]);
  platMesh.receiveShadow = true;
  platMesh.userData.plan = 'stage';   // for the venue picker's seat maps
  plat.add(platMesh);
  root.add(plat);

  // ── seating, by the seating plan ──
  // Lotte's own charts, seat for seat. On the 1st floor, in front of the
  // platform, the stalls — B, C and D, rows 1–23, with A and E either side of
  // them, their rows turned toward the platform — on one raked floor, as in a
  // theatre: no walls between the blocks, the aisles stepping with the rows.
  // Beside the platform L and R, the rows running out from it; round its back
  // corners LP and RP, nine rows curving with it; behind it the choir P, three
  // rows, a wall, three more, under the organ: terraces of their own. On the
  // 2nd floor, A to E across the back of the hall and two-row galleries L and
  // R down the side walls.
  const stageC = V3(0, DECK, 5);
  const stands = buildStands(LOTTE_STANDS, {
    stage: stageC, seed: 71, occupancy: 0.94,
    materials: { struct: std({ color: 0x7a5236, roughness: 0.85 }), rail: std({ color: 0xa8784c, roughness: 0.7, side: THREE.DoubleSide }), floor: std({ color: 0x7a5236, roughness: 0.85 }) },
    seatMesh: (spots) => seatField(spots, { fabric: velvet(0x8e1018, 'lotteseat'), frame: std({ color: 0x5a3c22, roughness: 0.45 }) }),
  });
  root.add(stands.group);
  // the doors' landings, the concourses round the hall behind its walls, and
  // the stair between them
  root.add(concourses(plan, doors));
  // we sit in C, the 10th row, on the centre line
  const stalls = LOTTE_STANDS.levels.find((l) => l.name === 'STALLS');
  let mine = null;
  { const S = decodeSeats(stalls.seats); for (let i = 0; i < S.length; i += 4) { const x = S[i] / 10, z = S[i + 1] / 10, d = Math.hypot(x + 0.3, z - 22.2); if (!mine || d < mine.d) mine = { x, z, y: stalls.hs[S[i + 2]], d }; } }
  const eye = V3(mine.x, mine.y + 1.2, mine.z - 0.1);
  const people = stands.people.filter((p) => Math.hypot(p.x - mine.x, p.z - mine.z) > 0.4).map((p) => ({ ...p, h: 0.93 + ((p.x * 7.3 + p.z * 3.1) % 1 + 1) % 1 * 0.12 }));
  if (q.crowd) root.add(crowd3D(thin(people, Math.round(people.length * Math.max(0.5, q.crowd))), cu, { kind: 'seated', detail: 1, seed: 17 }));

  // ── the organ ──
  const org = organ(M);
  org.position.set(0, 7.0, Z0 + 2.2);
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
    root, eye, seatNear: stands.seatNear,
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


// ── the ways in ──
//
// In the hall every terrace is entered from behind: a door in the wall at the
// height of its back row, onto a concourse that runs round the hall outside
// its walls. Here: a door behind every block, a short landing from its back
// row to the door, and two concourses round the outside of the walls, one for
// the 1st floor's terraces (its floor rising and falling round the hall from
// door to door, about 4-5 m up) and one over it for the 2nd floor (the side
// galleries and the rear balcony, 8.8-11.1 m), joined by a stair behind the
// back wall. Everything is walkable from the seat we start in.
const DOOR_W = 1.6, DOOR_H = 2.3, RING_W = 3.0;

// For each block: its back row's height and the point of the wall behind it
// (the segment, how far along it). Pieces of a level whose back rows lie
// apart (the stalls' back blocks) get a door each.
function hallDoors(data, plan) {
  const near = (x, z) => {
    let best = null;
    for (let i = 0; i < plan.length; i++) {
      const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % plan.length];
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz, len = Math.sqrt(L2);
      if (len < DOOR_W + 0.3) continue;
      const lo = (DOOR_W / 2 + 0.1) / len, t = Math.max(lo, Math.min(1 - lo, ((x - x0) * dx + (z - z0) * dz) / L2));
      const px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, seg: i, u: t * len, x: px, z: pz };
    }
    return best;
  };
  const out = [];
  for (const L of data.levels) {
    const top = L.rows.reduce((a, r) => (r.y > a.y ? r : a), L.rows[0]);
    for (const polys of top.polys) {
      const ring = polys[0];
      const c = ring.reduce((a, [x, z]) => [a[0] + x / ring.length, a[1] + z / ring.length], [0, 0]);
      const w = near(c[0], c[1]);
      if (!w) continue;
      // the row's point nearest the door: where the landing starts
      let from = ring[0], fd = Infinity;
      for (const [x, z] of ring) { const d = Math.hypot(x - w.x, z - w.z); if (d < fd) { fd = d; from = [x, z]; } }
      // (only where the row comes to the wall: a front block's top row stands
      // clear of it and is reached up the block behind; none behind the organ)
      if (fd > 3.5 || (Math.abs(w.x) < 9.5 && w.z < -12)) continue;
      if (out.some((q) => q.seg === w.seg && Math.abs(q.u - w.u) < DOOR_W + 0.6 && Math.abs(q.y - top.y) < DOOR_H)) continue;
      out.push({ level: L.name, ring: top.y > 7 ? 2 : 1, y: top.y, seg: w.seg, u: w.u, x: w.x, z: w.z, from });
    }
  }
  return out;
}

function concourses(plan, doors) {
  const g = new THREE.Group();
  const slab = [], rails = [], frames = [], lamps = [];
  const N = plan.length;
  // the outline's length round to each vertex, and the outward normals
  const cx = plan.reduce((a, p) => a + p[0], 0) / N, cz = plan.reduce((a, p) => a + p[1], 0) / N;
  const S = [0];
  for (let i = 1; i <= N; i++) { const [x0, z0] = plan[i - 1], [x1, z1] = plan[i % N]; S.push(S[i - 1] + Math.hypot(x1 - x0, z1 - z0)); }
  const TOT = S[N];
  const segN = (i) => {
    const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % N];
    let nx = z1 - z0, nz = -(x1 - x0); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  };
  const vN = plan.map((_, i) => { const a = segN((i - 1 + N) % N), b = segN(i); const x = a[0] + b[0], z = a[1] + b[1], l = Math.hypot(x, z) || 1; return [x / l, z / l]; });
  // a ring's floor height round the loop: through its doors, straight between them
  const heights = (rg) => {
    const ctl = doors.filter((d) => d.ring === rg).map((d) => ({ s: S[d.seg] + d.u, y: d.y })).sort((a, b) => a.s - b.s);
    return (s) => {
      if (ctl.length < 2) return ctl.length ? ctl[0].y : 0;
      for (let k = 0; k < ctl.length; k++) {
        const a = ctl[k], b = ctl[(k + 1) % ctl.length];
        const sb = b.s + (k + 1 === ctl.length ? TOT : 0), ss = s < a.s ? s + TOT : s;
        if (ss >= a.s && ss <= sb) return a.y + (b.y - a.y) * (ss - a.s) / (sb - a.s);
      }
      return ctl[0].y;
    };
  };
  const box = (out, x0, x1, y0, y1, z0, z1, rot = 0, px = 0, pz = 0) => {
    const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (rot) b.rotateY(rot);
    b.translate(px, 0, pz);
    const nb = b.toNonIndexed(); nb.deleteAttribute('uv'); out.push(nb);   // (the rings carry none)
  };
  // a ring: a slab from the wall's outside out RING_W, its floor at h(s), in
  // pieces of at most a metre along the outline; a rail along its outer edge
  // the stair's place, behind the middle of the back wall (the rails stay
  // open where it meets the rings)
  const zb = Math.max(...plan.map((p) => p[1])), SW = 1.6, SX0 = -7, SX1 = 7;
  const gaps = { 1: [SX0 - SW - 0.1, SX0 + 0.1], 2: [SX0 - SW - 2.1, SX0 - SW + 0.1] };
  const ring = (h, rg) => {
    const pos = [], idx = [], pts = [];
    for (let i = 0; i < N; i++) {
      const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % N], len = S[i + 1] - S[i], n = Math.max(1, Math.ceil(len));
      for (let k = 0; k < n; k++) {
        const t = k / n, a = vN[i], b = vN[(i + 1) % N];
        const nx = a[0] + (b[0] - a[0]) * t, nz = a[1] + (b[1] - a[1]) * t, nl = Math.hypot(nx, nz) || 1;
        pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, nx: nx / nl, nz: nz / nl, y: h(S[i] + len * t) });
      }
    }
    for (const p of pts) {
      const ix = p.x + p.nx * 0.02, iz = p.z + p.nz * 0.02, ox = p.x + p.nx * RING_W, oz = p.z + p.nz * RING_W;
      pos.push(ix, p.y, iz, ox, p.y, oz, ix, p.y - 0.3, iz, ox, p.y - 0.3, oz);
    }
    const M = pts.length;
    for (let k = 0; k < M; k++) {
      const a = k * 4, b = ((k + 1) % M) * 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
      const p = pts[k], q = pts[(k + 1) % M];
      const rx0 = p.x + p.nx * (RING_W - 0.05), rz0 = p.z + p.nz * (RING_W - 0.05), rx1 = q.x + q.nx * (RING_W - 0.05), rz1 = q.z + q.nz * (RING_W - 0.05);
      const l = Math.hypot(rx1 - rx0, rz1 - rz0);
      const gx = (rx0 + rx1) / 2, gp = gaps[rg];
      if (l > 0.01 && !((rz0 + rz1) / 2 > zb + 1 && gx > gp[0] && gx < gp[1])) { const r = new THREE.BoxGeometry(0.06, 1.05, l); r.rotateY(Math.atan2(rx1 - rx0, rz1 - rz0)); r.translate((rx0 + rx1) / 2, (p.y + q.y) / 2 + 0.52, (rz0 + rz1) / 2); rails.push(r.toNonIndexed()); }
      if (k % 6 === 0) { const lm = new THREE.BoxGeometry(0.5, 0.06, 0.5); lm.translate(p.x + p.nx * RING_W * 0.5, p.y + 2.9, p.z + p.nz * RING_W * 0.5); lamps.push(lm.toNonIndexed()); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    slab.push(geo.toNonIndexed());
    return pts;
  };
  const h1 = heights(1), h2 = heights(2);
  const r1 = ring(h1, 1), r2 = ring(h2, 2);
  // each door: its frame, and a landing from the block's back row through it
  // onto the concourse (the ring's floor is at the row's height at its door)
  for (const d of doors) {
    const [nx, nz] = segN(d.seg);
    const fx = d.from[0], fz = d.from[1], tx = d.x + nx * 0.8, tz = d.z + nz * 0.8;
    const L = Math.hypot(tx - fx, tz - fz);
    if (L > 0.05) box(slab, -DOOR_W / 2, DOOR_W / 2, d.y - 0.3, d.y, -L / 2, L / 2, Math.atan2(tx - fx, tz - fz), (fx + tx) / 2, (fz + tz) / 2);
    // (turned to face out of the wall: its x along the wall, so the jambs
    // stand either side of the opening; a quarter-turn more had stood them
    // one inside and one outside the wall, a post in the middle of the door)
    const facing = Math.atan2(nx, nz);
    for (const s of [-1, 1]) box(frames, s * DOOR_W / 2 - 0.06, s * DOOR_W / 2 + 0.06, d.y, d.y + DOOR_H + 0.08, -0.12, 0.12, facing, d.x, d.z);
    box(frames, -DOOR_W / 2 - 0.06, DOOR_W / 2 + 0.06, d.y + DOOR_H, d.y + DOOR_H + 0.1, -0.12, 0.12, facing, d.x, d.z);
  }
  // the stair between them, behind the back wall: off the rings' outer edge,
  // up along the wall, a turn, and back up onto the 2nd floor's ring
  {
    let k1 = 0;
    r1.forEach((p, k) => { if (Math.abs(p.x) + Math.abs(p.z - zb) * 4 < Math.abs(r1[k1].x) + Math.abs(r1[k1].z - zb) * 4) k1 = k; });
    const y0 = r1[k1].y, y1 = r2[k1].y, mid = (y0 + y1) / 2;
    const oz = zb + RING_W;
    const W = SW, X0 = SX0, X1 = SX1;
    const run = (yA, yB, xFrom, xTo, zA, zB) => {
      const n = Math.ceil(Math.abs(yB - yA) / 0.18), dx = (xTo - xFrom) / n;
      for (let i = 0; i < n; i++) { const a = xFrom + dx * i, b = xFrom + dx * (i + 1); box(slab, Math.min(a, b), Math.max(a, b), yA - 0.25, yA + (yB - yA) * (i + 1) / n, zA, zB); }
    };
    box(slab, X0 - W, X0, y0 - 0.3, y0, oz - 0.3, oz + W);               // the foot, off the 1st floor's ring
    run(y0, mid, X0, X1, oz, oz + W);                                      // up along the wall
    box(slab, X1, X1 + W, mid - 0.3, mid, oz, oz + 2 * W + 0.2);           // the turn
    run(mid, y1, X1, X0 - W, oz + W + 0.2, oz + 2 * W + 0.2);              // and back, up to the 2nd floor's height
    box(slab, X0 - W - 2, X0 - W, y1 - 0.3, y1, oz - RING_W + 0.1, oz + 2 * W + 0.2);   // the head, onto its ring
    box(rails, X0 - W, X1 + W, mid + 1.0, mid + 1.06, oz + 2 * W + 0.2, oz + 2 * W + 0.26);
  }
  for (const q of [...slab, ...rails, ...frames, ...lamps]) if (q.attributes.uv) q.deleteAttribute('uv');
  const m = new THREE.Mesh(mergeGeometries(slab), std({ color: 0x6a4630, roughness: 0.85 })); m.receiveShadow = true;
  g.add(m);
  g.add(new THREE.Mesh(mergeGeometries(rails), std({ color: 0x3a2818, roughness: 0.6 })));
  g.add(new THREE.Mesh(mergeGeometries(frames), std({ color: 0x2a1a10, roughness: 0.6 })));
  g.add(new THREE.Mesh(mergeGeometries(lamps), std({ color: 0x1a1612, emissive: 0xc79a6a, emissiveIntensity: 0.8 })));
  return g;
}
