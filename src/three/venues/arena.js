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
  fixture, footlights, lineArray, orientBlock, performer, rakedBlock,
  roomShell, speakerStack, stageDeck, standingCrowd, truss,
} from '../props.js';
import { frame } from './frame.js';

export default function buildArena(u) {
  const f = frame('arena');
  const root = new THREE.Group();
  const DECK = 2.2, RIG_Y = 19, CLEAR = 9;

  root.add(roomShell({
    width: f.width, depth: f.depth, height: f.height,
    faces: {
      right: lambert(0x0d0c12), left: lambert(0x0d0c12),
      ceiling: lambert(0x0a0910), floor: lambert(0x0c0b10),
      back: lambert(0x0b0a10), stageEnd: lambert(0x070610),
    },
  }));

  // roof structure — girders across the ceiling give the volume a scale
  for (let i = 0; i < 7; i++) {
    const g = truss(f.width - 8, { size: 1.4, color: 0x161520 });
    g.position.set(0, f.height - 1.6, 8 + i * 17);
    root.add(g);
  }

  // ── stage ──
  root.add(stageDeck({ width: 30, depth: 16, height: DECK, z: 7 }));
  root.add(footlights({ width: 28, count: 34, y: DECK + 0.06, z: 15.05 }));

  const screen = makeScreen({ w: 26, h: 12 }, u);
  screen.position.set(0, DECK + 7.4, 1.6);
  root.add(screen);

  // side LED wings
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = makeScreen({ w: 6, h: 11, halo: MAGENTA, bezel: 0x8a4a2a, content: COOL }, u);
    wing.position.set(side * 17.5, DECK + 7.2, 2.4);
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
  const people = [];
  people.push(...standingCrowd({ x0: -32, x1: 32, zNear: 16, zFar: f.seat.z - CLEAR, count: 1500, seed: 3 }));
  people.push(...standingCrowd({ x0: -32, x1: 32, zNear: f.seat.z + CLEAR, zFar: 70, count: 700, seed: 8 }));

  for (const side of [-1, 1]) {
    // lower side stand: raked away from the floor, so it is built along z and
    // then turned a quarter turn
    const lower = orientBlock(rakedBlock({
      x0: -32, x1: 32, zNear: 0, zFar: 13, rows: 16,
      riseFirst: 0.6, rise: 0.72, seatSpacing: 0.55, headHeight: 1.25, seed: 200 + side, fill: 0.9, emissive: 0x14101c,
    }), { rotY: side * Math.PI / 2, x: side * 34, z: 38 });
    root.add(lower.mesh);
    people.push(...lower.people);

    const upper = orientBlock(rakedBlock({
      x0: -34, x1: 34, zNear: 0, zFar: 15, rows: 16,
      riseFirst: 0.6, rise: 0.8, seatSpacing: 0.55, headHeight: 1.25, yBase: 14, seed: 260 + side, fill: 0.88, emissive: 0x14101c,
    }), { rotY: side * Math.PI / 2, x: side * 40, z: 38 });
    root.add(upper.mesh);
    people.push(...upper.people);
  }

  for (const [zNear, yBase, rows, seed] of [[72, 0, 16, 300], [76, 14, 16, 330]]) {
    const back = rakedBlock({
      x0: -40, x1: 40, zNear, zFar: zNear + 14, rows,
      riseFirst: 0.6, rise: 0.78, seatSpacing: 0.55, headHeight: 1.25, yBase, seed, fill: 0.88, emissive: 0x14101c,
    });
    root.add(back.mesh);
    people.push(...back.people);
  }

  root.add(crowdField(people, { color: 0x0d0b18, react: 1, sway: 0.11 }, u));

  // phone torches over the floor and the near stands
  const rnd = prng(33);
  const phones = Array.from({ length: 900 }).map(() => {
    const inStand = rnd() < 0.45;
    return inStand
      ? { x: (rnd() < 0.5 ? -1 : 1) * (34 + rnd() * 10), y: 2 + rnd() * 16, z: 12 + rnd() * 56, size: 0.11, color: 0xfff0c8, phase: rnd() * 6.283 }
      : { x: (rnd() - 0.5) * 62, y: 1.5 + rnd() * 0.5, z: 16 + rnd() * 48, size: 0.1, color: 0xfff0c8, phase: rnd() * 6.283 };
  });
  root.add(sparkField(phones.filter((p) => Math.abs(p.z - f.seat.z) > CLEAR), { react: 1.2, base: 0.18, twinkle: 4.2, maxPx: 20 }, u));

  const haze = Array.from({ length: 200 }).map(() => ({
    x: (rnd() - 0.5) * 60, y: 2 + rnd() * 16, z: rnd() * 34,
    size: 0.09 + rnd() * 0.14, color: 0xffb070, phase: rnd() * 6.283,
  }));
  root.add(sparkField(haze, { react: 0.5, base: 0.05, twinkle: 0.4, maxPx: 40 }, u));

  root.add(new THREE.AmbientLight(0x1c1a28, 1.0));
  const key = new THREE.PointLight(ACCENT, 900, 90, 2);
  key.position.set(0, 14, 12);
  root.add(key);
  const rear = new THREE.PointLight(MAGENTA, 500, 120, 2);
  rear.position.set(0, 18, 40);
  root.add(rear);
  // grazes the top of the floor crowd so the heads read as heads
  const floorFill = new THREE.PointLight(ACCENT, 260, 46, 2);
  floorFill.position.set(0, 6, 22);
  root.add(floorFill);

  return {
    root,
    screen,
    camera: { position: f.seat.clone(), target: new THREE.Vector3(0, DECK + 7.0, 2), fov: 52 },
    background: new THREE.Color(0x05040b),
    fog: new THREE.Fog(0x0a0812, 30, 190),
    bloom: { strength: 0.72, radius: 0.75, threshold: 0.38 },
    update(t, pulse) {
      screen.userData.update(pulse);
      wings.forEach((w) => w.userData.update(pulse));
      key.intensity = 500 + pulse * 1400;
      rear.intensity = 260 + pulse * 700;
      heads.forEach(({ fx, i }) => {
        // the rig dances: each head on its own phase, swinging harder as the
        // track pushes
        const swing = Math.sin(t * 1.35 + i * 0.7);
        fx.rotation.z = swing * (0.18 + pulse * 0.42);
        fx.rotation.x = 0.24 + Math.sin(t * 0.9 + i * 1.3) * (0.08 + pulse * 0.2);
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.25 + pulse * 0.6 * (0.5 + 0.5 * swing);
      });
    },
  };
}
