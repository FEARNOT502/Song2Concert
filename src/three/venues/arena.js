// ─────────────────────────────────────────────────────────────────────────────
// ARENA — Saitama Super Arena in arena mode: 110 × 130 × 37 m, 22,500 seats,
// seen from FOH 35 m out on a standing floor. The 200 level, the three-row
// 300 balcony, the 400 level above it and the 500 level along the middle of
// each side; a stage set of its own with the seats behind it left empty; a
// roof of deep steel over a rig of three trusses.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, KELVIN, V3, concreteTex, std, withRepeat } from '../core.js';
import { lightPoints } from '../people.js';
import { ampStack, buildBowl, drumKit, guitar, hoists, keyboardRig, latticeInto, lineArray, micStand, ribbonBoards, shadowSpot, stageDeck, stageSteps, subStack, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, fohPosition, packFloor, runLasers, runShow, stageSet } from '../show.js';

export function buildArena(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const W = 110, D = 130, H = 37;
  const DECK = 2.2, RIG = 20;
  const eye = V3(0, 1.6 + 0.9, 43);
  const STAGE = V3(0, DECK, 8);

  // ── the building ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ ...withRepeat(concreteTex({ key: 'arenafloor', tone: 0.1 }), W / 4, D / 4), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, D / 2 - 10); floor.receiveShadow = true;
  root.add(floor);
  // the building's walls stand behind the last row of every level
  const SX = 68, SZ0 = -42, SZ1 = 116;
  const shellMat = std({ color: 0x0b0b0e, roughness: 0.95, side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(SX * 2, H, SZ1 - SZ0), shellMat);
  shell.position.set(0, H / 2, (SZ0 + SZ1) / 2); root.add(shell);
  // roof: deep trusses both ways, a space-frame grid
  const roofParts = [];
  for (let z = SZ0 + 4; z <= SZ1 - 4; z += 12) latticeInto(roofParts, V3(-SX, H - 2.2, z), V3(SX, H - 2.2, z), 2.6, 0.08);
  for (let x = -64; x <= 64; x += 16) latticeInto(roofParts, V3(x, H - 1.2, SZ0), V3(x, H - 1.2, SZ1), 1.6, 0.06);
  root.add(new THREE.Mesh(mergeGeometries(roofParts), std({ color: 0x2a2c32, metalness: 0.6, roughness: 0.5 })));
  // catwalks and the house lights on them
  const houseFix = [];
  for (let z = 12; z <= 96; z += 21) for (let x = -36; x <= 36; x += 18) {
    houseFix.push(pipe.flares.add(V3(x, H - 4.2, z), KELVIN(4200), 1.2, 0));
  }

  // ── the bowl ──
  const bowl = buildBowl(pipe, {
    hx: 27, hz: 41, zc: 36, rc: 11,
    seatColor: 0x243044, concreteTone: 0.2, stage: STAGE, seed: 200, block: 13, aisle: 1.3,
    // nobody behind the stage: those seats are empty, the block straight
    // behind the set is tarped; every other seat is sold
    cover: (x, z) => z < 2 && Math.abs(x) < 23,
    occ: (x, z) => (z < 4 ? 0 : 1),
    occupancy: 1,
    tiers: [
      { rows: 16, rise: 0.36, riseFar: 0.46, run: 0.84, yBase: 0.9, inset: 0, crowd: true },   // 200 level
      { rows: 3, rise: 0.46, run: 0.9, yBase: 10.2, inset: 15.4, crowd: true, face: 2.8, backWall: 2.6 }, // 300 balcony
      { rows: 15, rise: 0.54, riseFar: 0.66, run: 0.9, yBase: 14.9, inset: 19.3, crowd: true, face: 2.6, backWall: 2.4 }, // 400 level
      // 500 level: the top balcony, along the middle of the long sides only
      { rows: 6, rise: 0.6, run: 0.9, yBase: 27.2, inset: 35.2, crowd: true, face: 3.2, backWall: 2.4,
        where: (x, z) => Math.abs(x) > 26 && z > 8 && z < 66 },
    ],
  });
  root.add(bowl.group);
  const ribbons = ribbonBoards(bowl, { tiers: [1, 2], height: 0.95, bright: 1.6 });
  root.add(ribbons);
  ctx.addScreen({ userData: { face: ribbons } }, 1, 'ribbon');
  // the set stands on the deck; the building's stands carry on round it
  stageSet(root, { w: 24, h: 17, z: 1.8, deck: DECK, towerX: 13.6, backdropW: 32, backdropH: 16, wingX: 19.5, wingW: 8, wingH: 11 });

  // ── stage ──
  const deck = stageDeck({ w: 34, d: 15, h: DECK, z: 8.5 });
  root.add(deck);
  const thrust = stageDeck({ w: 3.6, d: 9, h: DECK, z: 20.5, lip: false });
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 17.75, z: 16, h: DECK, dir: [0, -1] }));
  root.add(thrust);
  const scr = bigScreens(ctx, root, { w: 24, y: DECK + 1.4 + 24 / (16 / 9) / 2, z: 1.8, imagW: 11, imagX: 22.5, imagY: 13.5, imagZ: 5, imagYaw: 0.3 });
  const riser = stageDeck({ w: 10, d: 4, h: 1.0, z: 4.2, lip: false }); riser.position.y = DECK; root.add(riser);
  // the backline, set and waiting; no one on stage
  for (const [x, z, col] of [[-7, 9.0, 0x5a1a0e], [7, 9.0, 0x1a1a1c]]) {
    const gt = guitar({ color: col, bass: x > 0 }); gt.scale.setScalar(0.8); gt.position.set(x, DECK + 0.5, z); gt.rotation.x = -0.28; root.add(gt);
    const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z + 1.2); m.rotation.y = Math.PI; root.add(m);
  }
  const keysL = keyboardRig(); keysL.position.set(-4, DECK + 1, 4.6); root.add(keysL);
  const kit = drumKit({ shell: 0x1a1a1e }); kit.position.set(0, DECK + 1, 3.6); kit.scale.setScalar(1.1); root.add(kit);
  for (const x of [-12, 12]) { const a = ampStack({ count: 2 }); a.position.set(x, DECK, 4.5); root.add(a); }
  for (let i = 0; i < 8; i++) { const w = wedge(); w.position.set(-10.5 + i * 3, DECK, 15.4); w.rotation.y = Math.PI; root.add(w); }
  const mic = micStand({ height: 1.5 }); mic.position.set(0.05, DECK, 13.6); root.add(mic);
  for (const side of [-1, 1]) for (const dz of [-1.2, 1.2]) {
    const sub = subStack({ count: 3, cols: 2 }); sub.position.set(side * 10, 0, 17.5 + dz); root.add(sub);
  }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  const trussZ = [3.2, 9.2, 15.2];
  for (const z of trussZ) { const t = truss(36, { size: 0.76, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-16, -6, 6, 16], RIG, z, H - 2.2)); }
  const pa = [];
  for (const side of [-1, 1]) {
    const main = lineArray({ boxes: 16, width: 1.3 }); main.position.set(side * 15.5, RIG - 0.6, 16.5); main.rotation.y = -side * 0.08; root.add(main); pa.push(main);
    const out = lineArray({ boxes: 12, width: 1.1 }); out.position.set(side * 23.5, RIG - 1.2, 15); out.rotation.y = -side * 0.4; root.add(out);
    const subs = lineArray({ boxes: 8, width: 1.3, depth: 1.0, splay: 0.01 }); subs.position.set(side * 13.4, RIG - 0.6, 15.8); root.add(subs);
  }
  const spots = [], beams = [], washes = [], ups = [], lasers = [];
  for (let i = 0; i < 12; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-15.5 + i * (31 / 11), RIG - 0.5, 15.2), length: 45, angle: 0.085, beamGain: 1.0 }), i, n: 12, group: 0 });
  for (let i = 0; i < 12; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-15.5 + i * (31 / 11), RIG - 0.5, 9.2), length: 60, beamGain: 1.2 }), i, n: 12, group: 1 });
  for (let i = 0; i < 10; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(-15 + i * (30 / 9), RIG - 0.5, 3.2), length: 22, beamGain: 0.5 }), i, n: 10, group: 2 });
  for (let i = 0; i < 10; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-15 + i * (30 / 9), DECK + 0.25, 15.6), hang: 'up', length: 50, beamGain: 1.0 }), i, n: 10, group: 3 });
  for (let i = 0; i < 4; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-6 + i * 4, DECK + 0.3, 15.8), body: false, length: 90, beamGain: 6, flareGain: 0.2, noise: 0.4 }), i, n: 4 });
  // real light where the rig lands
  const moverLights = [];
  for (const k of [2, 5, 8, 10]) moverLights.push(rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5, decay: 2 }), 5200));
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.2, penumbra: 0.7, size: q.shadowSize, far: 80, cast: q.shadows });
  front1.position.set(-6, RIG + 2, 40); front1.target.position.set(0, DECK + 1, 12);
  const front2 = shadowSpot(KELVIN(5600), 0, { angle: 0.12, penumbra: 0.6, cast: false });
  front2.position.set(4, RIG + 3, 44); front2.target.position.set(0, DECK + 1.5, 13.2);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, 2); stageWash.target.position.set(0, DECK, 12);
  for (const l of [front1, front2, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-20, 18, 30], [20, 18, 30], [0, 24, 60]]) { const l = new THREE.PointLight(0xffffff, 0, 90, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  for (const [x, z] of [[-24, 20], [24, 20], [-24, 60], [24, 60], [0, 40], [0, 80]]) { const l = new THREE.PointLight(KELVIN(4200), 0, 120, 2); l.position.set(x, H - 4.5, z); root.add(l); house.push(l); }
  root.add(new THREE.HemisphereLight(0x14141c, 0x050508, 0.18));

  // ── people ──
  // a packed standing floor, and every sold seat taken
  const avoidFoh = (x, z) => (Math.abs(x - eye.x) < 4.6 && Math.abs(z - eye.z) < 4.2) || (Math.abs(x) < 2.2 && z < 25.5);
  const standing = packFloor({ x0: -25.5, x1: 25.5, z0: 17.4, z1: 76, avoid: avoidFoh, seed: 3 });
  bigCrowd(root, cu, q, standing.concat(bowl.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(bowl.aisleLights.map((a) => ({ ...a, white: true, size: 0.03 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.3;
  root.add(aisleField);
  const fohLeds = lightPoints(fohPosition(pipe, root, eye), cu, { maxPx: 4 });
  root.add(fohLeds);

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * 12, scr.main.position.y + dy * scr.h * 0.5, 2.6), 0xffffff, 0));
  ctx.screenHaze(scr.main, hzs, offs);
  scr.main.userData.hazePower = 90;
  const hzWash = [hz.add(V3(-10, RIG - 1, 10), 0xffffff, 0), hz.add(V3(10, RIG - 1, 10), 0xffffff, 0), hz.add(V3(0, DECK + 3, 12), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 7.2, 2), fov: 58, near: 0.15, far: 400 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x060508, 0.0045),
    hazeDensity: 0.0016, beamGain: 0.55, hazeAmb: new THREE.Color(0x040306), hazeAmbDist: 160,
    bloom: { strength: 0.7, radius: 0.65, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.004, 0.008] },
    env: { w: W, h: H, d: D, eye, wall: 0x0a0a10, floor: 0x050507, emitters: [
      { w: 24, h: 13.5, pos: V3(0, 10.35, 2), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: 16 / 9 },
      { w: 30, h: 1, pos: V3(0, RIG, 12), normal: V3(0, -1, 0), color: APP.accent, power: 4 },
    ] },
    envIntensity: 0.6,
    update(f) {
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 42), stage: STAGE, span: 34 });
      runShow(rig, beams, f, { house: V3(0, 12, 60), stage: STAGE, span: 44 });
      runShow(rig, washes, f, { house: V3(0, 0, 18), stage: STAGE, span: 20, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 30, 40), stage: STAGE, up: true });
      runLasers(lasers, f);
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      front1.intensity = 26000 * show + 4000 * f.house;
      front2.intensity = 9000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (5000 + 6000 * f.energy + 3000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (120 + 300 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 9000 * f.house; });
      houseFix.forEach((h) => { h.intensity = 1.5 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h, i) => { h.power = (i < 2 ? 260 : 120) * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.22 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 10, 4);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.2 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.006).multiplyScalar(1 + f.house * 8);
    },
  };
}
