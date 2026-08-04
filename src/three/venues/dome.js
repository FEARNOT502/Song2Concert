// dome.js — Tokyo Dome: 1,240,000 m³ under an air-supported double membrane,
// from FOH 55 m out on the field.
//
// The roof is the venue. It is drawn as the shallow spherical cap it is — a
// ~200 m span rising about 22 m over the top of the stands — with its meridians
// picked out, because that membrane is why this room has the longest
// reverberation and the heaviest bass ratio of the six: it is light, so it
// reflects almost all of the low end straight back down.

import * as THREE from 'three';
import { ACCENT, COOL, MAGENTA, WARM, basic, crowdField, lambert, makeScreen, prng, sparkField } from '../kit.js';
import {
  fixture, footlights, lineArray, orientBlock, performer, rakedBlock, ribbon,
  speakerStack, stageDeck, standingCrowd, truss,
} from '../props.js';
import { frame } from './frame.js';

export default function buildDome(u) {
  const f = frame('dome');
  const root = new THREE.Group();
  const DECK = 2.6, RIG_Y = 30, STAND_TOP = 27, CLEAR = 12;

  // ── the membrane roof ──
  // cap radius from the span it covers and the rise over the stands
  const a = f.width / 2, rise = f.height - STAND_TOP;
  const R = (rise * rise + a * a) / (2 * rise);
  const centerY = f.height - R;
  const phi = Math.acos(Math.min(1, (STAND_TOP - centerY) / R));
  const capGeo = new THREE.SphereGeometry(R, 56, 22, 0, Math.PI * 2, 0, phi);
  const cap = new THREE.Mesh(capGeo, lambert(0x121218, { side: THREE.BackSide }));
  cap.position.set(0, centerY, f.depth / 2 - 20);
  root.add(cap);
  const ribs = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 0.998, 26, 8, 0, Math.PI * 2, 0, phi)),
    new THREE.LineBasicMaterial({ color: 0x2a2a3a, transparent: true, opacity: 0.5 }),
  );
  ribs.position.copy(cap.position);
  root.add(ribs);

  const turf = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.depth), lambert(0x0b0d10));
  turf.rotation.x = -Math.PI / 2;
  turf.position.z = f.depth / 2 - 20;
  root.add(turf);

  // ── stage ──
  root.add(stageDeck({ width: 40, depth: 20, height: DECK, z: 12 }));
  root.add(footlights({ width: 38, count: 44, y: DECK + 0.06, z: 22.05 }));

  const screen = makeScreen({ w: 33, h: 17.5 }, u);
  screen.position.set(0, DECK + 10.2, 3.4);
  root.add(screen);

  const wings = [];
  for (const side of [-1, 1]) {
    const wing = makeScreen({ w: 9, h: 14, halo: MAGENTA, bezel: 0x8a4a2a, content: COOL }, u);
    wing.position.set(side * 26, DECK + 8.8, 5);
    wing.rotation.y = -side * 0.36;
    root.add(wing);
    wings.push(wing);
  }

  // catwalk / thrust into the field, the way a dome show gets closer to the back
  const thrust = new THREE.Mesh(new THREE.BoxGeometry(4.5, DECK, 22), lambert(0x110e14));
  thrust.position.set(0, DECK / 2, 32);
  root.add(thrust);
  const bhead = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, DECK, 28), lambert(0x110e14));
  bhead.position.set(0, DECK / 2, 44);
  root.add(bhead);
  const bRim = new THREE.Mesh(new THREE.TorusGeometry(5, 0.06, 6, 32), basic(ACCENT));
  bRim.rotation.x = Math.PI / 2;
  bRim.position.set(0, DECK, 44);
  root.add(bRim);

  const star = performer({ height: 1.82, arms: true });
  star.position.set(0, DECK, 44);
  root.add(star);
  for (const [x, z] of [[-12, 14], [12, 14], [-6, 9], [6, 9], [0, 7]]) {
    const p = performer({ height: 1.78 });
    p.position.set(x, DECK, z);
    root.add(p);
  }

  // ── rig ──
  for (const z of [5, 13, 21]) {
    const t = truss(48, { size: 1.4, color: 0x1a1a26 });
    t.position.set(0, RIG_Y, z);
    root.add(t);
  }
  for (const side of [-1, 1]) {
    const hang = lineArray({ boxes: 18, width: 1.6 });
    hang.position.set(side * 19, RIG_Y - 1.2, 9);
    root.add(hang);
    const delay = lineArray({ boxes: 10, width: 1.3 });
    delay.position.set(side * 30, RIG_Y - 3, 30);
    root.add(delay);
    for (const dz of [-2, 2]) {
      const subs = speakerStack({ w: 3, h: 1, d: 1.4, count: 3 });
      subs.position.set(side * 13, 0, 23 + dz);
      root.add(subs);
    }
  }

  // a ring of beams around the dome, the signature dome-show look
  const heads = [];
  const PALETTE = [ACCENT, MAGENTA, COOL, WARM];
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const fx = fixture({
      color: PALETTE[i % PALETTE.length], beamLength: 70, spread: 3.4, opacity: 0.035, react: 1.2,
    }, u);
    fx.position.set(Math.sin(ang) * 62, RIG_Y + 4, 28 + Math.cos(ang) * 62);
    root.add(fx);
    heads.push({ fx, i, ang });
  }
  for (let i = 0; i < 14; i++) {
    const fx = fixture({ color: PALETTE[(i + 2) % PALETTE.length], beamLength: 40, spread: 2.4, opacity: 0.05, react: 1.2 }, u);
    fx.position.set(-24 + i * 3.7, RIG_Y - 1, i % 2 ? 5 : 21);
    root.add(fx);
    heads.push({ fx, i: i + 24, ang: i });
  }

  // ── the crowd: field, then the tiers ──
  const people = [];
  const ribbons = [];
  people.push(...standingCrowd({ x0: -52, x1: 52, zNear: 26, zFar: f.eye.z - CLEAR, count: 2100, seed: 55 }));
  people.push(...standingCrowd({ x0: -52, x1: 52, zNear: f.eye.z + CLEAR, zFar: 110, count: 1100, seed: 57 }));

  for (const side of [-1, 1]) {
    for (const [yBase, rows, seed] of [[0.5, 14, 400], [13, 16, 430], [24, 12, 460]]) {
      const stand = orientBlock(rakedBlock({
        x0: -62, x1: 62, zNear: 0, zFar: rows * 0.95, rows,
        riseFirst: 0.6, rise: 0.78, seatSpacing: 0.55, headHeight: 1.25,
        yBase, seed: seed + side, fill: 0.85, emissive: 0x241e36,
      }), { rotY: side * Math.PI / 2, x: side * (56 + (yBase > 20 ? 8 : yBase > 10 ? 4 : 0)), z: 62 });
      root.add(stand.mesh);
      people.push(...stand.people);
      if (yBase < 1) {
        const fascia = ribbon({ length: 124, height: 0.9 });
        fascia.position.set(side * 55.5, 1.1, 62);
        root.add(fascia);
        ribbons.push(fascia);
      }
    }
  }
  const backFascia = ribbon({ length: 120, height: 0.9, along: 'x' });
  backFascia.position.set(0, 1.1, 111.4);
  root.add(backFascia);
  ribbons.push(backFascia);
  for (const [zNear, yBase, rows, seed] of [[112, 0.5, 14, 500], [118, 13, 16, 530], [126, 24, 12, 560]]) {
    const back = rakedBlock({
      x0: -60, x1: 60, zNear, zFar: zNear + rows * 0.95, rows,
      riseFirst: 0.6, rise: 0.78, seatSpacing: 0.55, headHeight: 1.25, yBase, seed, fill: 0.85, emissive: 0x241e36,
    });
    root.add(back.mesh);
    people.push(...back.people);
  }
  root.add(crowdField(people, { color: 0x0d0b18, react: 1, sway: 0.1 }, u));

  // ── the sea of lightsticks ──
  const rnd = prng(77);
  const HUES = [MAGENTA, ACCENT, COOL, 0xff5f9e, 0x8affd0];
  const sticks = Array.from({ length: 2600 }).map(() => {
    const onField = rnd() < 0.4;
    const color = HUES[Math.floor(rnd() * HUES.length)];
    return onField
      ? { x: (rnd() - 0.5) * 104, y: 1.7 + rnd() * 0.7, z: 26 + rnd() * 78, size: 0.2, color, phase: rnd() * 6.283 }
      : {
          x: (rnd() < 0.5 ? -1 : 1) * (54 + rnd() * 22), y: 2 + rnd() * 30,
          z: 6 + rnd() * 130, size: 0.2, color, phase: rnd() * 6.283,
        };
  });
  root.add(sparkField(sticks.filter((p) => Math.abs(p.z - f.eye.z) > CLEAR), { react: 1.35, base: 0.14, twinkle: 5.0, maxPx: 20 }, u));

  const haze = Array.from({ length: 260 }).map(() => ({
    x: (rnd() - 0.5) * 90, y: 3 + rnd() * 26, z: rnd() * 60,
    size: 0.14 + rnd() * 0.22, color: 0xd8a0ff, phase: rnd() * 6.283,
  }));
  root.add(sparkField(haze, { react: 0.5, base: 0.045, twinkle: 0.35, maxPx: 42 }, u));

  root.add(new THREE.AmbientLight(0x181828, 1.0));
  const key = new THREE.PointLight(ACCENT, 2600, 140, 2);
  key.position.set(0, 18, 16);
  root.add(key);
  const rear = new THREE.PointLight(MAGENTA, 1600, 200, 2);
  rear.position.set(0, 26, 60);
  root.add(rear);
  const floorFill = new THREE.PointLight(ACCENT, 1100, 70, 2);
  floorFill.position.set(0, 8, 34);
  root.add(floorFill);

  return {
    root,
    screen,
    camera: { position: f.eye.clone(), target: new THREE.Vector3(0, DECK + 9.6, 6), fov: 62 },
    background: new THREE.Color(0x04040a),
    fog: new THREE.Fog(0x0a0a14, 40, 300),
    bloom: { strength: 0.8, radius: 0.8, threshold: 0.34 },
    update(t, pulse) {
      screen.userData.update(pulse);
      wings.forEach((w) => w.userData.update(pulse));
      key.intensity = 1400 + pulse * 3600;
      ribbons.forEach((r) => r.material.color.setHex(ACCENT).multiplyScalar(0.3 + pulse * 0.8));
      rear.intensity = 800 + pulse * 2200;
      bRim.material.color.setHex(ACCENT).multiplyScalar(0.5 + pulse * 0.7);
      heads.forEach(({ fx, i }) => {
        const swing = Math.sin(t * 1.15 + i * 0.55);
        fx.rotation.z = swing * (0.2 + pulse * 0.5);
        fx.rotation.x = 0.5 + Math.sin(t * 0.7 + i) * (0.1 + pulse * 0.24);
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.2 + pulse * 0.6 * (0.5 + 0.5 * swing);
      });
    },
  };
}
