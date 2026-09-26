// ─────────────────────────────────────────────────────────────────────────────
// THEATER — a musical house after Blue Square's Shinhan Card Hall: three
// levels (1,066 / 430 / 270 at the real one), the stalls 27 m deep from the
// stage edge to the back row, the first balcony 18.5 m from the stage. A black
// portal, the house curtain gathered up, a pit, box booms, and a show running.
// Room model: 26 × 40 × 16 m, mid stalls, 14 m from the source.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, KELVIN, V3, carpetTex, glowMat, prng, std, velvet, withRepeat, woodTex } from '../core.js';
import { crowd3D, lightPoints } from '../people.js';
import { drapeGeometry, ledScreen, lineArray, mats, performer, seatField, shadowSpot, stageDeck, stageSteps } from '../rig.js';

export function buildTheater(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const W = 26, D = 40, H = 16, X = W / 2;
  const PZ = 4.0, PT = 0.7;            // proscenium wall: audience face at PZ + PT
  const OW = 15.2, OB = 1.1, OT = 10.4; // opening width, sill (deck), head
  const DECK = 1.1;
  const APRON = 5.9;                    // stage edge
  const PIT0 = APRON, PIT1 = 8.3;       // orchestra pit
  const ROW0 = 8.9, ROWD = 0.95, ROWS = 28;
  const rowY = (r) => 0.12 + r * 0.075 + r * r * 0.0032;
  const eyeRow = Math.round((17 - ROW0) / ROWD);
  const eye = V3(0, rowY(eyeRow) + 1.2, 17);
  const tung = KELVIN(3200);

  // ── materials ──
  const walnut = woodTex({ key: 'walnut', planks: 8, joints: 1, base: [0.2, 0.11, 0.06], tone: 0.12, grain: 0.35, rough: 0.5, seed: 12 });
  const wallMat = std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), roughness: 1 });
  const black = std({ color: 0x050506, roughness: 0.9 });
  const carpet = std({ ...withRepeat(carpetTex({ key: 'theatercarpet', base: [0.16, 0.035, 0.04] }), 16, 20), roughness: 1 });
  const seatVel = velvet(0x7a0c16, 'seatred');

  // ── the house ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D - PIT1), carpet);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, (PIT1 + D) / 2); floor.receiveShadow = true;
  root.add(floor);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(D - PZ, H), wallMat.clone());
    wall.material.map = walnut.map.clone(); wall.material.map.repeat.set((D - PZ) / 1.2, H / 4);
    wall.material.normalMap = walnut.normalMap.clone(); wall.material.normalMap.repeat.copy(wall.material.map.repeat);
    wall.rotation.y = -side * Math.PI / 2;
    wall.position.set(side * X, H / 2, (D + PZ) / 2);
    wall.receiveShadow = true;
    root.add(wall);
    // acoustic fins down the side walls, catching the light edge-on
    const fins = [];
    for (let z = PZ + 3; z < D - 1; z += 1.4) { const f = new THREE.BoxGeometry(0.22, H - 1, 0.06); f.translate(side * (X - 0.11), H / 2 + 0.5, z); fins.push(f); }
    root.add(new THREE.Mesh(mergeGeometries(fins), std({ color: 0x2a1a10, roughness: 0.6 })));
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ color: 0x08080a, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, D / 2); root.add(ceil);
  const backW = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); backW.rotation.y = Math.PI; backW.position.set(0, H / 2, D); root.add(backW);
  // FOH bridges: slots across the ceiling
  for (const z of [11, 19]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 1.2, 1.6), std({ color: 0x030304, roughness: 1 }));
    slot.position.set(0, H - 0.6, z); root.add(slot);
  }

  // ── proscenium wall with the opening ──
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-X, 0); wallShape.lineTo(X, 0); wallShape.lineTo(X, H); wallShape.lineTo(-X, H); wallShape.lineTo(-X, 0);
  const hole = new THREE.Path();
  hole.moveTo(-OW / 2, OB); hole.lineTo(OW / 2, OB); hole.lineTo(OW / 2, OT); hole.lineTo(-OW / 2, OT); hole.lineTo(-OW / 2, OB);
  wallShape.holes.push(hole);
  const pros = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: PT, bevelEnabled: false }), std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), roughness: 1 }));
  pros.position.z = PZ;
  pros.receiveShadow = true;
  root.add(pros);
  // the black portal frame inside the opening
  const portal = [];
  for (const [w, h, x, y] of [[OW + 1.2, 0.6, 0, OT + 0.3], [0.6, OT - OB, -OW / 2 - 0.3, (OT + OB) / 2], [0.6, OT - OB, OW / 2 + 0.3, (OT + OB) / 2]]) {
    const b = new THREE.BoxGeometry(w, h, 0.3); b.translate(x, y, PZ + PT + 0.16); portal.push(b);
  }
  root.add(new THREE.Mesh(mergeGeometries(portal), black));

  // house curtain: a gathered valance and two tabs
  const houseVel = velvet(0x5a0710, 'housecurtain');
  const valance = new THREE.Mesh(drapeGeometry(OW + 0.4, 1.7, 34, 0.12), houseVel);
  valance.position.set(0, OT - 0.85, PZ + 0.35); root.add(valance);
  for (const side of [-1, 1]) {
    const tab = new THREE.Mesh(drapeGeometry(1.5, OT - OB, 9, 0.16), houseVel);
    tab.position.set(side * (OW / 2 - 0.55), (OT + OB) / 2, PZ + 0.3); root.add(tab);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), std({ color: 0x8a6a2a, metalness: 0.8, roughness: 0.35 }));
    tie.rotation.x = Math.PI / 2; tie.position.set(side * (OW / 2 - 0.55), 4.2, PZ + 0.3); root.add(tie);
  }

  // ── stage house ──
  const deck = stageDeck({ w: 24, d: 18, h: DECK, z: -14 + 9, lip: false, fascia: 0x050505 });
  root.add(deck);
  // apron, curved, out to the pit
  const apron = stageDeck({ w: OW + 2, d: APRON - PZ - PT + 1, h: DECK, z: (PZ + PT + APRON) / 2 - 0.5, round: 0.8, fascia: 0x050505 });
  root.add(apron);
  // side steps from the house floor up to the apron, either side of the pit
  for (const s of [-1, 1]) {
    root.add(stageSteps({ x: s * 9.95, z: 8.45, h: DECK, dir: [0, -1], width: 1.4 }));
    // a landing at the top, and a step across to the apron clear of the pit
    const lm = std({ color: 0x0c0c0e, roughness: 0.8 });
    const landing = new THREE.Mesh(new THREE.BoxGeometry(1.5, DECK, 2.15), lm);
    landing.position.set(s * 9.9, DECK / 2, 5.775); root.add(landing);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.3, DECK, 1.15), lm);
    bridge.position.set(s * 8.55, DECK / 2, 5.275); root.add(bridge);
  }
  const lipM = glowMat(APP.accent, 0.35);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(OW + 1.8, 0.02, 0.02), lipM);
  lip.position.set(0, DECK - 0.01, APRON + 0.62); root.add(lip);
  const stageBack = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), black);
  stageBack.position.set(0, 8, -14); root.add(stageBack);
  // legs and borders: the black masking that makes wings
  const maskMat = velvet(0x050505, 'blackvel', { sheenColor: new THREE.Color(0x151515) });
  for (const z of [2.6, -1.0, -4.6]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(drapeGeometry(2.4, 11, 6, 0.1), maskMat);
      leg.position.set(side * (OW / 2 + 0.2 - (z < 0 ? 0.6 : 0)), DECK + 5.5, z); root.add(leg);
    }
    const border = new THREE.Mesh(drapeGeometry(OW + 2, 1.8, 10, 0.06), maskMat);
    border.position.set(0, OT - 0.4 - (z < 0 ? 0.3 : 0), z); root.add(border);
  }

  // the set: an LED wall upstage, framed by two steel towers
  const aspect = 16 / 9;
  const SW = 12.4, SH = SW / aspect;
  const screen = ledScreen({ w: SW, h: SH, tex: ctx.art.texture(aspect), pitch: 0.0039, bright: 1.3, frame: 0.2, lightPower: 1.7 });
  screen.position.set(0, DECK + 1.2 + SH / 2, -6.2);
  root.add(screen);
  ctx.addScreen(screen, aspect, 'main');
  const steel = std({ color: 0x1b1a1c, metalness: 0.8, roughness: 0.45 });
  const practical = new THREE.MeshBasicMaterial({ color: KELVIN(2600).clone().multiplyScalar(6), toneMapped: false });
  const practicals = [];
  for (const side of [-1, 1]) {
    const tw = [];
    const x0 = side * 5.2;
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) { const p = new THREE.BoxGeometry(0.12, 6.4, 0.12); p.translate(x0 + dx, DECK + 3.2, -2.6 + dz); tw.push(p); }
    for (const y of [3.0, 5.6]) {
      const pl = new THREE.BoxGeometry(2.0, 0.12, 2.0); pl.translate(x0, DECK + y, -2.6); tw.push(pl);
      for (const dz of [-0.95, 0.95]) { const r = new THREE.BoxGeometry(2.0, 0.05, 0.05); r.translate(x0, DECK + y + 1.0, -2.6 + dz); tw.push(r); }
      const r2 = new THREE.BoxGeometry(0.05, 0.05, 2.0); r2.translate(x0 - side * 0.95, DECK + y + 1.0, -2.6); tw.push(r2);
    }
    for (let k = 0; k < 8; k++) { const st = new THREE.BoxGeometry(1.1, 0.08, 0.34); st.translate(x0 - side * 1.6, DECK + 0.37 * (k + 1), -2.6 + 1.2 - k * 0.3); tw.push(st); }
    const tower = new THREE.Mesh(mergeGeometries(tw), steel);
    tower.castShadow = true; tower.receiveShadow = true;
    root.add(tower);
    for (const y of [3.4, 6.0]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), practical);
      lamp.position.set(x0 - side * 0.8, DECK + y, -1.75); root.add(lamp);
      practicals.push(pipe.flares.add(lamp.position, KELVIN(2600), 0.5, 0.6));
    }
  }

  // the stage stands empty between numbers: the lead's mark is a pool of
  // followspot on the deck
  const lead = { position: V3(-0.9, DECK, 3.3) };

  // ── the pit ──
  const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(OW + 3, PIT1 - PIT0), std({ color: 0x080808, roughness: 1 }));
  pitFloor.rotation.x = -Math.PI / 2; pitFloor.position.set(0, -2.2, (PIT0 + PIT1) / 2); root.add(pitFloor);
  const pitWall = new THREE.Mesh(new THREE.BoxGeometry(OW + 3, 3.2, 0.2), std({ ...withRepeat(walnut, 3, 1), roughness: 1 }));
  pitWall.position.set(0, -0.6, PIT1); root.add(pitWall);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, OW + 3, 8), std({ color: 0xb08a40, metalness: 1, roughness: 0.3 }));
  rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.02, PIT1); root.add(rail);
  const pitLight = new THREE.PointLight(KELVIN(3000), 0, 9, 2);
  pitLight.position.set(0, -0.6, (PIT0 + PIT1) / 2); root.add(pitLight);
  // the players' way out, a flight at each end of the pit
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 6.0, z: (PIT0 + PIT1) / 2, y0: -2.2, h: 0, dir: [s, 0], width: 1.4 }));
  const standLights = [];
  for (let i = 0; i < 16; i++) {
    const x = -7 + i * 0.95, z = PIT0 + 0.6 + (i % 2) * 0.9;
    standLights.push(pipe.flares.add(V3(x, -0.95, z), KELVIN(3000), 0.28, 0.45));
  }
  const conductorHead = performer('conductor', { top: 0x050505, skin: 0.3, cast: false });
  conductorHead.position.set(0.3, -1.4, PIT1 - 0.5); conductorHead.rotation.y = Math.PI; root.add(conductorHead);

  // ── PA: centre cluster and left/right columns ──
  const cluster = lineArray({ boxes: 6, width: 1.1, depth: 0.6, height: 0.34, splay: 0.05 });
  cluster.position.set(0, OT + 2.4, PZ + PT + 0.7); root.add(cluster);
  for (const side of [-1, 1]) {
    const col = lineArray({ boxes: 12, width: 0.7, depth: 0.5, height: 0.3, splay: 0.012 });
    col.position.set(side * (OW / 2 + 1.35), OT - 0.4, PZ + PT + 0.5); col.rotation.y = -side * 0.25; root.add(col);
  }

  // ── seats and people, by the seating plan ──
  // The 1st floor: 27 rows in three blocks — the side blocks run to the walls —
  // with two aisles and a cross-aisle after row 13, the rows curved, and each
  // row's seats set half a seat over from the row in front (the staggered
  // seating the house is known for), so every seat looks between two heads.
  // The 2nd floor: a balcony across the back, nine rows in three blocks,
  // wrapping down the side walls as two-row slips. The 3rd floor: eight rows
  // across the back above it, three blocks.
  const spots = [], people = [];
  const rnd = prng(23);
  const SEAT = 0.54, CROSS = 13, CROSSW = 1.2;
  const aisles = [-4.6, 4.6];
  const curve = (x) => x * x * 0.006;
  const rowZ = (r) => ROW0 + r * ROWD + (r >= CROSS ? CROSSW : 0);
  const facing = (x, z) => Math.PI + Math.atan2(x, z - 2) * 0.35;
  const sit = (x, y, z, turn) => {
    spots.push({ x, y, z, turn });
    const mine = Math.abs(z - eye.z) < 0.5 && Math.abs(x - eye.x) < 0.8;
    if (!mine && rnd() < 0.94) people.push({ x, y: y + 0.02, z: z - 0.05, turn: turn + (rnd() - 0.5) * 0.2, h: 0.93 + rnd() * 0.12 });
  };
  for (let r = 0; r < ROWS; r++) {
    const z = rowZ(r), y = rowY(r);
    const half = Math.min(X - 1.4, 8.5 + r * 0.14);
    for (let x = -half + (r % 2) * SEAT / 2; x <= half; x += SEAT) {
      if (aisles.some((a) => Math.abs(x - a) < 0.6)) continue;
      const zc = z + curve(x);
      sit(x, y, zc, facing(x, zc));
    }
  }
  // raked floor under the stalls, and the cross-aisle level with row 13
  const rake = [];
  for (let r = 0; r < ROWS; r++) {
    const b = new THREE.BoxGeometry(W - 0.2, rowY(r) + 0.01, ROWD); b.translate(0, rowY(r) / 2, rowZ(r) + ROWD * 0.3); rake.push(b);
  }
  { const yc = rowY(CROSS - 1), z0 = rowZ(CROSS - 1) + ROWD * 0.8, b = new THREE.BoxGeometry(W - 0.2, yc + 0.01, CROSSW); b.translate(0, yc / 2, z0 + CROSSW / 2); rake.push(b); }
  const rakeMesh = new THREE.Mesh(mergeGeometries(rake), carpet); rakeMesh.receiveShadow = true; root.add(rakeMesh);
  const seatFrame = std({ color: 0x140c08, roughness: 0.5 });
  const balconyFront = std({ ...withRepeat(walnut, 3, 1), roughness: 1 });
  const slabMat = std({ color: 0x0c0806, roughness: 1 });
  // a balcony across the back: curved stepped treads, a curved front, seats
  // staggered row to row, and a walkway behind the last row to the back wall
  const balcony = ({ z0, y0, rows, run, rise, half, gaps }) => {
    const parts = [], front = [];
    const N = 18;
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * run, y = y0 + r * rise;
      for (let i = 0; i < N; i++) {
        const xa = -half + 2 * half * i / N, xb = -half + 2 * half * (i + 1) / N, xm = (xa + xb) / 2;
        const b = new THREE.BoxGeometry(xb - xa + 0.02, y - y0 + 0.4, run + 0.02);
        b.translate(xm, (y + y0 - 0.4) / 2, z + run / 2 + curve(xm));
        parts.push(b);
      }
      for (let x = -half + 0.45 + (r % 2) * SEAT / 2; x <= half - 0.45; x += SEAT) {
        if (gaps.some((a) => Math.abs(x - a) < 0.6)) continue;
        const zc = z + run * 0.55 + curve(x);
        sit(x, y, zc, facing(x, zc));
      }
    }
    const yl = y0 + (rows - 1) * rise, zl = z0 + rows * run;
    const back = new THREE.BoxGeometry(2 * half, yl - y0 + 0.4, D - zl); back.translate(0, (yl + y0 - 0.4) / 2, (zl + D) / 2); parts.push(back);
    root.add(new THREE.Mesh(mergeGeometries(parts), slabMat));
    for (let i = 0; i < N; i++) {
      const xa = -half + 2 * half * i / N, xb = -half + 2 * half * (i + 1) / N;
      const f = new THREE.BoxGeometry(Math.hypot(xb - xa, curve(xb) - curve(xa)) + 0.02, 1.05, 0.16);
      f.rotateY(-Math.atan2(curve(xb) - curve(xa), xb - xa));
      f.translate((xa + xb) / 2, y0 + 0.5, z0 - 0.08 + (curve(xa) + curve(xb)) / 2);
      front.push(f);
    }
    root.add(new THREE.Mesh(mergeGeometries(front), balconyFront));
  };
  balcony({ z0: 24.2, y0: 5.2, rows: 9, run: 0.9, rise: 0.3, half: X - 3.2, gaps: [-3.6, 3.6] });
  balcony({ z0: 29.0, y0: 10.6, rows: 8, run: 0.9, rise: 0.36, half: X - 0.2, gaps: [-4.2, 4.2] });
  // the 2nd floor's slips down the side walls, two rows each
  const underGlow = [];
  for (const side of [-1, 1]) {
    const y = 5.2, x0 = side * (X - 1.6);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 15.2), slabMat);
    slab.position.set(x0, y - 0.18, 16.6); root.add(slab);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 15.2), balconyFront);
    front.position.set(x0 - side * 1.5, y + 0.5, 16.6); root.add(front);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 14.8), glowMat(KELVIN(2700), 1.5));
    glow.position.set(x0 - side * 1.56, y - 0.38, 16.6); root.add(glow); underGlow.push(glow);
    for (let k = 0; k < 2; k++) for (let z = 9.6 + k * 0.28; z < 23.6; z += 0.56) {
      const sx = x0 - side * (0.7 - k * 0.9), sy = y + k * 0.35;
      spots.push({ x: sx, y: sy, z, turn: -side * Math.PI / 2 - side * 0.35 });
      if (rnd() < 0.9) people.push({ x: sx, y: sy + 0.02, z, turn: -side * Math.PI / 2 - side * 0.35, h: 0.95 + rnd() * 0.1 });
    }
  }
  root.add(seatField(spots, { fabric: seatVel, frame: seatFrame }));
  if (q.crowd) root.add(crowd3D(people, cu, { kind: 'seated', detail: 1, seed: 5 }));
  // aisle step lights
  const stepPts = [];
  for (const a of aisles) for (let r = 0; r < ROWS; r++) stepPts.push({ x: a + 0.5, y: rowY(r) + 0.06, z: rowZ(r) + curve(a + 0.5), white: true, size: 0.02, phase: 0 });
  const steps = lightPoints(stepPts, cu, { maxPx: 5 });
  steps.material.uniforms.uGain.value = 0.35;
  root.add(steps);
  // exit signs
  for (const side of [-1, 1]) for (const z of [9.5, 30]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), glowMat(0x19c26a, 2.2));
    sign.position.set(side * (X - 0.03), 2.6, z); sign.rotation.y = -side * Math.PI / 2; root.add(sign);
  }

  // ── lighting rig ──
  const rig = ctx.rig({ finish: 'black' });
  // box booms on the side walls, near the stage
  const booms = [];
  for (const side of [-1, 1]) {
    const pipeM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 6), mats().black);
    pipeM.position.set(side * (X - 0.5), 7, 9.6); root.add(pipeM);
    for (let i = 0; i < 5; i++) {
      const f = rig.add({ kind: 'profile', pos: V3(side * (X - 0.8), 4 + i * 1.4, 9.6), color: KELVIN(3400), length: 24, scale: 0.7, beamGain: 0.06, flareGain: 0.6 });
      rig.aim(f, V3(-side * 1.5 + side * i * 0.4, DECK + 1.2, 1.5 - i * 0.8));
      booms.push(f);
    }
  }
  // overhead backlight: moving heads on the upstage electric, above the border
  const backs = [];
  for (let i = 0; i < 8; i++) {
    const f = rig.add({ kind: 'spot', pos: V3(-6.3 + i * 1.8, OT + 0.6, -3.4), color: 0xffffff, length: 18, scale: 0.8, beamGain: 1.0, flareGain: 0.4, angle: 0.07 });
    backs.push(f);
  }
  // side light from the wings (dance booms)
  const sides = [];
  for (const side of [-1, 1]) for (const [y, z] of [[2.2, 0.8], [3.6, -2.8]]) {
    const f = rig.add({ kind: 'profile', pos: V3(side * (OW / 2 + 1.0), DECK + y, z), color: 0xffffff, length: 18, scale: 0.7, beamGain: 0.3, flareGain: 0.2, angle: 0.13, body: true });
    rig.aim(f, V3(-side * 4, DECK + 1.2, z + 0.4));
    sides.push(f);
  }
  // followspots from the booth at the back
  const follows = [];
  for (const side of [-1, 1]) {
    const f = rig.add({ kind: 'follow', pos: V3(side * 3.5, 14.8, D - 1.2), color: KELVIN(5600), length: 44, scale: 1.2, beamGain: 0.35, flareGain: 0.6, body: false, soft: 0.2 });
    follows.push(f);
  }
  // FOH front light from the ceiling bridges (above frame; their beams cross it)
  const fohs = [];
  for (const z of [11, 19]) for (let i = 0; i < 6; i++) {
    const f = rig.add({ kind: 'profile', pos: V3(-6 + i * 2.4, H - 1.3, z), color: KELVIN(3200), length: 26, scale: 0.7, beamGain: 0.02, flareGain: 0.4 });
    rig.aim(f, V3(-4 + i * 1.6, DECK + 1.3, 2.2 - (z - 11) * 0.1));
    fohs.push(f);
  }

  // real light: two shadowed front lights, a colour wash, a backlight, the pit
  const front1 = shadowSpot(tung, 0, { angle: 0.32, penumbra: 0.6, size: q.shadowSize, far: 40, cast: q.shadows });
  front1.position.set(-5, H - 1.3, 12); front1.target.position.set(-0.5, DECK, 1.5);
  const front2 = shadowSpot(tung, 0, { angle: 0.32, penumbra: 0.6, size: q.shadowSize, far: 40, cast: q.shadows });
  front2.position.set(6, H - 1.3, 14); front2.target.position.set(0.5, DECK, 0.5);
  const washA = shadowSpot(0xffffff, 0, { angle: 0.6, penumbra: 1, cast: false });
  washA.position.set(0, OT + 1, -2); washA.target.position.set(0, DECK, 2);
  const backC = shadowSpot(0xffffff, 0, { angle: 0.7, penumbra: 1, cast: false });
  backC.position.set(0, OT + 0.8, -5); backC.target.position.set(0, DECK, 3);
  const followL = shadowSpot(KELVIN(5600), 0, { angle: 0.035, penumbra: 0.4, cast: false });
  for (const s of [front1, front2, washA, backC, followL]) { root.add(s); root.add(s.target); }
  const houseLights = [];
  for (const [x, z] of [[-6, 12], [6, 12], [-6, 24], [6, 24], [0, 32]]) {
    const l = new THREE.PointLight(KELVIN(2800), 0, 30, 2);
    l.position.set(x, H - 1, z); root.add(l); houseLights.push(l);
  }
  root.add(new THREE.HemisphereLight(0x1a1418, 0x080506, 0.12));
  // what the stage throws back into the house: a broad soft source in the
  // opening, coloured by the show
  const bounce = new THREE.RectAreaLight(0xffffff, 0, OW, OT - OB);
  bounce.position.set(0, (OT + OB) / 2, PZ + PT + 1.2); bounce.lookAt(0, (OT + OB) / 2, 30);
  root.add(bounce);
  // curtain warmers from the first bridge onto the valance and tabs
  const warmers = [];
  for (const side of [-1, 1]) {
    const w = shadowSpot(KELVIN(2900), 0, { angle: 0.5, penumbra: 1, cast: false });
    w.position.set(side * 4, H - 1.2, 11); w.target.position.set(side * 5, OT - 1.5, PZ + 0.5);
    root.add(w, w.target); warmers.push(w);
  }
  // little shaded lamps along the balcony fronts
  const lampFl = [];
  const lampMat = glowMat(KELVIN(2500), 3.5);
  for (const [y] of [[5.6], [9.4]]) for (const side of [-1, 1]) for (let z = 10; z <= 24; z += 2.8) {
    const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 10, 1, true), lampMat);
    lp.position.set(side * (X - 3.18), y + 1.1, z); root.add(lp);
    lampFl.push(pipe.flares.add(lp.position, KELVIN(2500), 0.35, 0.5));
  }
  // grazers at the foot of the proscenium wall, up the walnut
  const grazers = [];
  for (const side of [-1, 1]) for (const x of [9.2, 11.6]) {
    const gz = shadowSpot(KELVIN(2700), 0, { angle: 0.5, penumbra: 1, cast: false });
    gz.position.set(side * x, 0.4, PZ + PT + 0.35); gz.target.position.set(side * x, 9, PZ + PT - 0.2);
    root.add(gz, gz.target); grazers.push(gz);
  }
  const wallWash = [];
  for (const side of [-1, 1]) for (const z of [12, 21]) {
    const l = new THREE.PointLight(KELVIN(2500), 0, 9, 2);
    l.position.set(side * (X - 3.3), 7.4, z); root.add(l); wallWash.push(l);
  }

  // haze points: the screen, the practicals, the followspot booth
  const hz = pipe.haze;
  const offs = [[-0.6, 0.4], [0.6, 0.4], [-0.6, -0.4], [0.6, -0.4], [0, 0]];
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * SW * 0.5, screen.position.y + dy * SH * 0.5, -5.8), 0xffffff, 0));
  ctx.screenHaze(screen, hzs, offs);
  screen.userData.hazePower = 26;
  const hzBooth = [-1, 1].map((s) => hz.add(V3(s * 3.5, 14.8, D - 1.3), KELVIN(5600), 0));
  const hzStage = hz.add(V3(0, DECK + 3, 1), tung, 0);

  let aimT = 0;
  return {
    root, eye,
    camera: { pos: eye, target: V3(0, 5.3, 0), fov: 54, near: 0.1, far: 120 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x050304, 0.008),
    hazeDensity: 0.0014, beamGain: 0.3, hazeAmb: new THREE.Color(0x030202), hazeAmbDist: 90,
    bloom: { strength: 0.55, radius: 0.6, threshold: 1.1 },
    grade: { exposure: 1.25, vignette: 0.42, ca: 0.004, grain: 0.04, sat: 1.06, lift: [0.01, 0.006, 0.006] },
    env: { w: W, h: H, d: D, eye, wall: 0x1a0d08, floor: 0x0c0405, emitters: [
      { w: SW, h: SH, pos: V3(0, screen.position.y, -6), normal: V3(0, 0, 1), screen: true, power: 1.4, aspect },
      { w: 12, h: 3, pos: V3(0, DECK + 0.5, 1), normal: V3(0, 1, 0), color: tung, power: 3 },
    ] },
    envIntensity: 0.55,
    update(f) {
      const show = 1 - f.house;
      const { a, b, c, d } = f.pal;
      aimT += f.dt * (0.4 + f.energy * 0.6);
      const leadPos = V3(lead.position.x, DECK + 1.3, lead.position.z);
      front1.intensity = (170 + f.energy * 60) * show + 60 * f.house;
      front2.intensity = (140 + f.energy * 50) * show + 50 * f.house;
      washA.color.copy(a); washA.intensity = (120 + f.energy * 200 + f.kick * 80) * show;
      backC.color.copy(b); backC.intensity = (140 + f.energy * 220 + f.snare * 90) * show;
      followL.position.set(3.5, 14.8, D - 1.2); followL.target.position.copy(leadPos); followL.target.updateMatrixWorld();
      followL.intensity = 900 * show;
      booms.forEach((fx) => { fx.color.copy(tung); fx.intensity = 0.8 * show + 0.1 * f.house; });
      fohs.forEach((fx) => { fx.intensity = 0.9 * show + 0.15 * f.house; });
      backs.forEach((fx, i) => {
        const sw = Math.sin(aimT * 1.3 + i * 0.8);
        fx.color.copy(i % 2 ? b : a);
        rig.aim(fx, V3(-6.3 + i * 1.8 + sw * 2.2, DECK, 1.8 + Math.cos(aimT + i) * 1.5));
        fx.intensity = (0.25 + 0.55 * f.energy + (i % 2 ? f.snare : f.kick) * 0.4) * show;
      });
      sides.forEach((fx, i) => { fx.color.copy(i % 2 ? c : d); fx.intensity = (0.35 + 0.45 * f.energy) * show; });
      follows.forEach((fx) => { rig.aim(fx, leadPos); fx.intensity = 1.4 * show; });
      practicals.forEach((p, i) => { p.intensity = (0.45 + 0.1 * Math.sin(f.t * 2 + i)) * (0.6 + 0.4 * show); });
      standLights.forEach((p) => { p.intensity = 0.4 * show + 0.25 * f.house; });
      pitLight.intensity = 3 * show + 1 * f.house;
      houseLights.forEach((l) => { l.intensity = 420 * f.house; });
      bounce.color.copy(tung).lerp(a, 0.4).lerp(b, 0.2);
      bounce.intensity = (0.9 + f.energy * 0.6 + f.kick * 0.2) * show + 0.3 * f.house;
      warmers.forEach((w) => { w.intensity = 60 * show + 120 * f.house; });
      wallWash.forEach((l) => { l.intensity = 6 + 20 * f.house; });
      grazers.forEach((g) => { g.intensity = 18 + 40 * f.house; });
      underGlow.forEach((g) => g.material.color.copy(KELVIN(2700)).multiplyScalar(0.6 + 1.6 * f.house));
      steps.material.uniforms.uGain.value = 0.3 + 0.2 * f.house;
      lipM.color.setHex(APP.accent).multiplyScalar(0.25 + 0.3 * f.kick * show);
      hzBooth.forEach((h) => { h.power = 30 * show; });
      hzStage.power = (20 + f.energy * 20) * show + 6 * f.house;
      cu.uRimColor.value.copy(tung).lerp(a, 0.35).multiplyScalar(0.05 * show + 0.01);
      cu.uStage.value.set(0, 5, 0);
      cu.uWash.value.copy(tung).multiplyScalar(0.02 * show);
      cu.uAmb.value.setRGB(0.008, 0.006, 0.005).multiplyScalar(1 + f.house * 6);
    },
  };
}
