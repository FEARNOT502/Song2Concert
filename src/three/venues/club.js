// club.js — 300 seats, 12 × 16 × 3.5 m of wood, and a combo four metres away.
//
// The room is small enough that everything reads: the pipe over the stage is a
// single scaff bar with six cans on it, the back wall is close enough to see the
// brick course, and the ceiling is low enough to be in frame. That low ceiling is
// the whole point of the room — it is what puts the first reflection at +6 ms.

import * as THREE from 'three';
import { ACCENT, WARM, brickTexture, crowdField, lambert, makeScreen, prng, sparkField } from '../kit.js';
import { drumKit, fixture, footlights, grandPiano, micStand, performer, roomShell, stageDeck, truss, uprightBass } from '../props.js';
import { frame } from './frame.js';

export default function buildClub(u) {
  const f = frame('club');
  const root = new THREE.Group();
  const DECK = 0.5;
  const PLAYER = 0x241c1c;

  // ── the room ──
  const brick = brickTexture([Math.round(f.depth / 1.6), Math.round(f.height / 1.6)]);
  root.add(roomShell({
    width: f.width, depth: f.depth, height: f.height,
    faces: {
      right: lambert(0x3a2a18, { map: brick }),
      left: lambert(0x3a2a18, { map: brick }),
      ceiling: lambert(0x0a0708),
      floor: lambert(0x120c0a),
      back: lambert(0x140e0a),
      stageEnd: lambert(0x100b08),
    },
  }));

  // ── stage ──
  const deck = stageDeck({ width: 8.4, depth: 3.2, height: DECK, z: 1.7 });
  root.add(deck);
  root.add(footlights({ width: 8.0, count: 14, y: DECK + 0.04, z: 3.32 }));

  // the album art, mounted on the lit back wall behind the combo
  const screen = makeScreen({ w: 2.9, h: 2.0, pixels: false }, u);
  screen.position.set(0, 2.15, 0.14);
  root.add(screen);

  // ── the combo. Centre stage stays clear so the art is never masked. ──
  const kit = drumKit();
  kit.position.set(-1.35, DECK, 1.4);
  kit.rotation.y = 0.22;
  root.add(kit);
  const drummer = performer({ height: 1.35, color: PLAYER });
  drummer.position.set(-1.4, DECK, 0.9);
  root.add(drummer);

  const piano = grandPiano();
  piano.position.set(-2.6, DECK, 2.4);
  piano.rotation.y = 0.95;
  piano.scale.setScalar(0.82);
  root.add(piano);
  const pianist = performer({ height: 1.4, color: PLAYER });
  pianist.position.set(-2.05, DECK, 2.9);
  root.add(pianist);

  const bass = uprightBass();
  bass.position.set(3.3, DECK, 0.85);
  root.add(bass);
  const bassist = performer({ height: 1.78, color: PLAYER });
  bassist.position.set(3.55, DECK, 1.05);
  root.add(bassist);

  // downstage right, well clear of the sight line to the back wall
  const singer = performer({ height: 1.72, arms: true, color: PLAYER });
  singer.position.set(2.05, DECK, 1.8);
  root.add(singer);
  const mic = micStand({ height: 1.48 });
  mic.position.set(1.8, DECK, 1.85);
  root.add(mic);

  // ── the pipe, and the six cans on it ──
  const bar = truss(9.6, { size: 0.26, color: 0x241a10, bays: 12 });
  bar.position.set(0, f.height - 0.42, 2.6);
  root.add(bar);

  const cans = [];
  for (let i = 0; i < 6; i++) {
    const x = -3.75 + i * 1.5;
    const lit = i % 2 === 0;
    const fx = fixture({
      color: i % 4 === 0 ? WARM : ACCENT,
      beamLength: 4.2, spread: 0.85, opacity: 0.085, lit, react: 1,
    }, u);
    fx.position.set(x, f.height - 0.5, 2.6);
    fx.rotation.x = 0.42;
    root.add(fx);
    if (lit) cans.push(fx);
  }

  // ── the room in front of us: low tables, candles, the backs of a few heads ──
  const rnd = prng(7);
  const people = [];
  const candles = [];
  for (let row = 0; row < 5; row++) {
    const z = 4.1 + row * 1.9;
    const seats = 5 + row;
    for (let s = 0; s < seats; s++) {
      const x = (s + 0.5) / seats * (f.width - 1.4) + f.xMin + 0.7 + (rnd() - 0.5) * 0.4;
      // the two seats dead ahead are ours and our neighbour's — leave the sight
      // line to the stage open
      if (row === 0 && Math.abs(x - f.eye.x) < 1.6) continue;
      people.push({ x, y: 0, z, height: 1.28 + rnd() * 0.12, turn: (rnd() - 0.5) * 0.7 });
    }
    for (let t = 0; t < 3; t++) {
      const x = f.xMin + 1.4 + t * ((f.width - 2.8) / 2) + (rnd() - 0.5) * 0.6;
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.72, 10), lambert(0x150e09));
      table.position.set(x, 0.36, z + 0.75);
      root.add(table);
      candles.push({ x, y: 0.8, z: z + 0.75, size: 0.16, color: 0xffb45c, phase: rnd() * 6.283 });
    }
  }
  root.add(crowdField(people, { color: 0x030308, react: 0.5, sway: 0.05 }, u));
  root.add(sparkField(candles, { react: 0.15, base: 0.75, twinkle: 1.6, maxPx: 26 }, u));

  // haze in the light
  const dust = Array.from({ length: 90 }).map(() => ({
    x: (rnd() - 0.5) * 9, y: 0.6 + rnd() * 2.6, z: rnd() * 7,
    size: 0.018 + rnd() * 0.03, color: 0xffc48a, phase: rnd() * 6.283,
  }));
  root.add(sparkField(dust, { react: 0.4, base: 0.16, twinkle: 0.7, maxPx: 18 }, u));

  // ── light ──
  root.add(new THREE.AmbientLight(0x2a2230, 1.1));
  const key = new THREE.PointLight(0xffb877, 26, 16, 2);
  key.position.set(0, 3.0, 3.2);
  root.add(key);
  const wash = new THREE.PointLight(ACCENT, 14, 14, 2);
  wash.position.set(0, 2.3, 0.9);
  root.add(wash);
  const house = new THREE.PointLight(0x60507a, 10, 20, 2);
  house.position.set(0, 3.2, 10);
  root.add(house);

  return {
    root,
    screen,
    camera: { position: f.eye.clone(), target: new THREE.Vector3(0, 1.95, 0.6), fov: 58 },
    background: new THREE.Color(0x05040a),
    fog: new THREE.Fog(0x0a0709, 5, 26),
    bloom: { strength: 0.42, radius: 0.75, threshold: 0.5 },
    update(t, pulse) {
      screen.userData.update(pulse);
      key.intensity = 30 + pulse * 8;
      wash.intensity = 18 + pulse * 7;
      deck.userData.lip.material.color.setHex(ACCENT).multiplyScalar(0.6 + pulse * 0.5);
      cans.forEach((fx, i) => {
        const sway = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 0.9);
        fx.rotation.z = Math.sin(t * 0.6 + i) * 0.09;
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.34 + pulse * 0.18 * sway;
      });
    },
  };
}
