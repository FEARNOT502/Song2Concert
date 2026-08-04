// arena.js — Saitama Super Arena in arena mode: 110 × 130 × 33 m, 22,500 seats,
// seen from the FOH position 35 m out on the floor.
//
// The sight line is the honest one. FOH is on a riser in the middle of a standing
// floor, so the bottom of the frame is the back of the crowd's heads and the show
// is above them. The rig overhead is what a room this size needs: two trusses of
// moving heads, two line-array hangs, and a wall of LED big enough to be seen
// from the back of the upper bowl.

import * as THREE from 'three';
import { ACCENT, COOL, MAGENTA, crowdField, lambert, makeScreen, prng, sparkField } from '../kit.js';
import {
  ampStack, bowl, fixture, footlights, lineArray, monitorWedge, performer,
  ribbonRing, roomShell, seatBank, thin, speakerStack, stageDeck, standingCrowd, truss,
} from '../props.js';
import { frame } from './frame.js';

export default function buildArena(u) {
  const f = frame('arena');
  const root = new THREE.Group();
  const DECK = 2.2, RIG_Y = 19, CLEAR = 9;
  // The bowl's inner edge. It runs behind the stage as well, so the building is
  // drawn longer than the acoustic box, which stops at the stage-end wall — the
  // block behind the stage is part of the arena, just not part of the room the
  // reverb is computed in.
  const BOWL_X = 26, BOWL_Z0 = 2, BOWL_Z1 = 64, BACKSTAGE = 30;

  const shell = roomShell({
    width: f.width, depth: f.depth + BACKSTAGE, height: f.height,
    faces: {
      right: lambert(0x0d0c12), left: lambert(0x0d0c12),
      ceiling: lambert(0x0a0910), floor: lambert(0x0c0b10),
      back: lambert(0x0b0a10), stageEnd: lambert(0x070610),
    },
  });
  shell.position.z -= BACKSTAGE;
  root.add(shell);

  // roof structure — girders across the ceiling give the volume a scale
  for (let i = 0; i < 7; i++) {
    const g = truss(f.width - 8, { size: 1.4, color: 0x161520 });
    g.position.set(0, f.height - 1.6, 8 + i * 17);
    root.add(g);
  }

  // ── stage ──
  // No seats behind or beside the stage: the stage end is closed off with flat
  // masking, the way an end-stage production actually does it. One wall across
  // the back, two returns out to the side stands.
  const maskMat = lambert(0x0b0a11);
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(f.width, 21, 0.6), maskMat);
  backWall.position.set(0, 10.5, -2.4);
  root.add(backWall);
  // the returns fill only the gap between the stage edge and the side stands;
  // running them the full width would put a wall in front of the seating
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(BOWL_X - 15, 13, 0.6), maskMat);
    wing.position.set(side * (15 + (BOWL_X - 15) / 2), 6.5, BOWL_Z0 - 0.6);
    root.add(wing);
  }
  root.add(stageDeck({ width: 30, depth: 16, height: DECK, z: 7 }));
  root.add(footlights({ width: 28, count: 34, y: DECK + 0.06, z: 15.05 }));

  const screen = makeScreen({ w: 28, h: 13 }, u);
  screen.position.set(0, DECK + 7.8, 1.6);
  root.add(screen);

  // side LED wings
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = makeScreen({ w: 6, h: 11, halo: MAGENTA, bezel: 0x8a4a2a, content: COOL }, u);
    wing.position.set(side * 18.6, DECK + 7.4, 2.4);
    wing.rotation.y = -side * 0.32;
    root.add(wing);
    wings.push(wing);
  }

  // upstage riser + band
  const riser = new THREE.Mesh(new THREE.BoxGeometry(9, 1.1, 5), lambert(0x110e14));
  riser.position.set(0, DECK + 0.55, 4.5);
  root.add(riser);
  const front = performer({ height: 1.8, arms: true });
  front.position.set(0, DECK, 12.5);
  root.add(front);
  for (const [x, z] of [[-8, 9], [8, 9], [-4.5, 5.5], [4.5, 5.5]]) {
    const p = performer({ height: 1.78 });
    p.position.set(x, DECK, z);
    root.add(p);
  }
  // backline and wedges — the floor of a stage this size is never empty
  for (const [x, z] of [[-10.5, 5.2], [10.5, 5.2]]) {
    const amp = ampStack({ count: 2 });
    amp.position.set(x, DECK, z);
    root.add(amp);
  }
  for (let i = 0; i < 7; i++) {
    const wedge = monitorWedge();
    wedge.position.set(-12 + i * 4, DECK, 13.4);
    wedge.rotation.y = Math.PI;
    root.add(wedge);
  }

  // ── rig ──
  for (const z of [3.5, 9.5, 15.5]) {
    const t = truss(34, { size: 1.0, color: 0x1c1a24 });
    t.position.set(0, RIG_Y, z);
    root.add(t);
  }
  for (const side of [-1, 1]) {
    const hang = lineArray({ boxes: 14, width: 1.3 });
    hang.position.set(side * 14, RIG_Y - 0.8, 6);
    root.add(hang);
    const outfill = lineArray({ boxes: 8, width: 1.0 });
    outfill.position.set(side * 22, RIG_Y - 1.6, 8);
    root.add(outfill);
    for (const dz of [-1.2, 1.2]) {
      const subs = speakerStack({ w: 2.2, h: 0.8, d: 1.2, count: 3 });
      subs.position.set(side * 9, 0, 16.5 + dz);
      root.add(subs);
    }
  }

  const heads = [];
  const PALETTE = [ACCENT, MAGENTA, COOL, 0xffd08a];
  for (let i = 0; i < 16; i++) {
    const x = -16 + (i % 8) * 4.6;
    const z = i < 8 ? 3.5 : 15.5;
    const color = PALETTE[i % PALETTE.length];
    const fx = fixture({ color, beamLength: 34, spread: 3.0, opacity: 0.05, react: 1.1 }, u);
    fx.position.set(x, RIG_Y - 0.9, z);
    root.add(fx);
    heads.push({ fx, i, x, z });
  }

  // ── the bowl ──
  // One ring, first row to last, all the way round including behind the stage.
  // The seats behind the stage are real and empty — that block is sold off, and
  // its treated face is the `arenaTreated` surface the room model puts there.
  const people = [];
  people.push(...standingCrowd({ x0: -25, x1: 25, zNear: 16, zFar: f.eye.z - CLEAR, count: 1700, seed: 3 }));
  people.push(...standingCrowd({ x0: -25, x1: 25, zNear: f.eye.z + CLEAR, zFar: 70, count: 700, seed: 8 }));

  const near = (x, z) => Math.hypot(x - f.eye.x, z - f.eye.z);
  const ring = bowl({
    halfWidth: BOWL_X, zFront: BOWL_Z0, zBack: BOWL_Z1,
    // ~25° lower, ~31° upper. A bowl is a shallow thing; the steep rake it had
    // was closer to a ski jump than to seating.
    tiers: [
      { rows: 14, rise: 0.38, riseFar: 0.44, run: 0.82, yBase: 0.5, inset0: 0, sides: { front: false } },
      { rows: 12, rise: 0.50, riseFar: 0.60, run: 0.86, yBase: 8.7, inset0: 12.9, sides: { front: false } },
    ],
    seatSpacing: 0.56, headHeight: 1.25, seed: 200, blockLength: 11,
    density: () => 1,                     // the house is full
    maxPeople: 5200, emissive: 0x241f31,
  });
  root.add(ring.mesh);
  root.add(ring.blocks);
  // the rows close enough that a bare block would read as wrong get real seats
  root.add(seatBank(thin(ring.treads.filter((s) => near(s.x, s.z) < 34), 1800)));

  const ribbons = [];
  for (const { inset, yTop } of ring.fascias.slice(0, 1)) {
    const r = ribbonRing({
      halfWidth: BOWL_X + inset, zFront: BOWL_Z0 - inset, zBack: BOWL_Z1 + inset,
      y: yTop + 1.4, height: 0.7, thickness: 0.24,
    });
    root.add(r);
    ribbons.push(r);
  }

  root.add(crowdField(ring.people, { color: 0x2e2a3e, react: 1, sway: 0.066 }, u));
  root.add(crowdField(people, { color: 0x0c0b14, react: 1, sway: 0.11 }, u));

  // phone torches over the floor and the near stands
  const rnd = prng(33);
  const phones = Array.from({ length: 620 }).map(() => {
    const inStand = rnd() < 0.62;
    return inStand
      ? { x: (rnd() < 0.5 ? -1 : 1) * (27 + rnd() * 20), y: 2 + rnd() * 14, z: 4 + rnd() * 68, size: 0.11, color: 0xfff0c8, phase: rnd() * 6.283 }
      : { x: (rnd() - 0.5) * 50, y: 1.5 + rnd() * 0.5, z: 16 + rnd() * 48, size: 0.1, color: 0xfff0c8, phase: rnd() * 6.283 };
  });
  root.add(sparkField(phones.filter((p) => Math.abs(p.z - f.eye.z) > CLEAR), { react: 1.2, base: 0.18, twinkle: 4.2, maxPx: 20 }, u));

  const haze = Array.from({ length: 130 }).map(() => ({
    x: (rnd() - 0.5) * 60, y: 2 + rnd() * 16, z: rnd() * 34,
    size: 0.09 + rnd() * 0.14, color: 0xffb070, phase: rnd() * 6.283,
  }));
  root.add(sparkField(haze, { react: 0.5, base: 0.05, twinkle: 0.4, maxPx: 40 }, u));

  root.add(new THREE.AmbientLight(0x24222f, 1.3));
  const key = new THREE.PointLight(ACCENT, 900, 78, 2);
  key.position.set(0, 14, 12);
  root.add(key);
  const rear = new THREE.PointLight(MAGENTA, 500, 80, 2);
  rear.position.set(0, 18, 40);
  root.add(rear);
  // grazes the top of the floor crowd so the heads read as heads
  const floorFill = new THREE.PointLight(ACCENT, 260, 46, 2);
  floorFill.position.set(0, 6, 22);
  root.add(floorFill);

  return {
    root,
    screen,
    camera: { position: f.eye.clone(), target: new THREE.Vector3(0, DECK + 7.4, 2), fov: 60 },
    background: new THREE.Color(0x05040b),
    fog: new THREE.Fog(0x0a0812, 30, 190),
    bloom: { strength: 0.72, radius: 0.75, threshold: 0.38 },
    update(t, pulse) {
      screen.userData.update(pulse);
      wings.forEach((w) => w.userData.update(pulse));
      key.intensity = 1000 + pulse * 380;
      ribbons.forEach((r) => r.material.color.setHex(ACCENT).multiplyScalar(0.10 + pulse * 0.3));
      rear.intensity = 500 + pulse * 190;
      heads.forEach(({ fx, i }) => {
        // the rig dances: each head on its own phase, swinging harder as the
        // track pushes
        const swing = Math.sin(t * 1.05 + i * 0.7);
        fx.rotation.z = swing * 0.34;
        fx.rotation.x = 0.24 + Math.sin(t * 0.72 + i * 1.3) * 0.15;
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.34 + pulse * 0.2 * (0.5 + 0.5 * swing);
      });
    },
  };
}
