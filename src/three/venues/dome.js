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
  ampStack, bowl, fixture, footlights, lineArray, monitorWedge, performer,
  ribbonRing, seatBank, thin, speakerStack, stageDeck, standingCrowd, truss,
} from '../props.js';
import { frame } from './frame.js';

export default function buildDome(u) {
  const f = frame('dome');
  const root = new THREE.Group();
  const DECK = 2.6, RIG_Y = 30, STAND_TOP = 27, CLEAR = 12;
  // the bowl's inner edge; it runs behind the stage too, so the field is drawn
  // longer than the acoustic box, which stops at the stage-end wall
  const BOWL_X = 52, BOWL_Z0 = -16, BOWL_Z1 = 104;

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

  const turf = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.depth + 60), lambert(0x0b0d10));
  turf.rotation.x = -Math.PI / 2;
  turf.position.z = f.depth / 2 - 46;
  root.add(turf);

  // ── stage ──
  const mask = new THREE.Mesh(new THREE.BoxGeometry(62, 17, 0.8), lambert(0x0a0a12));
  mask.position.set(0, 8.5, -1.6);
  root.add(mask);
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
  for (const [x, z] of [[-15, 7], [15, 7]]) {
    const amp = ampStack({ count: 3, w: 0.9, h: 0.55 });
    amp.position.set(x, DECK, z);
    root.add(amp);
  }
  for (let i = 0; i < 9; i++) {
    const wedge = monitorWedge({ w: 0.8 });
    wedge.position.set(-16 + i * 4, DECK, 20.4);
    wedge.rotation.y = Math.PI;
    root.add(wedge);
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

  // ── the crowd: field, then the bowl ──
  // One unbroken ring of seating, first row to last, wrapping behind the stage
  // as well. The block behind the stage is real and empty: at a dome show it is
  // curtained off, which is exactly the treated face the room model puts there.
  const people = [];
  people.push(...standingCrowd({ x0: -52, x1: 52, zNear: 26, zFar: f.eye.z - CLEAR, count: 1300, seed: 55 }));
  people.push(...standingCrowd({ x0: -52, x1: 52, zNear: f.eye.z + CLEAR, zFar: 110, count: 560, seed: 57 }));

  const near = (x, z) => Math.hypot(x - f.eye.x, z - f.eye.z);
  const ring = bowl({
    halfWidth: BOWL_X, zFront: BOWL_Z0, zBack: BOWL_Z1,
    tiers: [
      { rows: 15, rise: 0.62, riseFar: 0.80, run: 0.85, yBase: 0.5, inset0: 0 },
      { rows: 14, rise: 0.85, riseFar: 1.02, run: 0.90, yBase: 15.0, inset0: 13.6 },
    ],
    seatSpacing: 0.56, headHeight: 1.25, seed: 400, blockLength: 13,
    crowdFrom: 8,
    density: (x, y, z) => (near(x, z) < 55 ? 0.8 : near(x, z) < 110 ? 0.4 : 0.16),
    maxPeople: 2800, emissive: 0x181524,
  });
  root.add(ring.mesh);
  root.add(ring.blocks);
  people.push(...ring.people);
  root.add(seatBank(thin(ring.treads.filter((s) => near(s.x, s.z) < 55), 2800)));

  const ribbons = [];
  for (const { inset, yTop } of ring.fascias.slice(0, 1)) {
    const r = ribbonRing({
      halfWidth: BOWL_X + inset, zFront: BOWL_Z0 - inset, zBack: BOWL_Z1 + inset,
      y: yTop + 1.7, height: 0.85, thickness: 0.3,
    });
    root.add(r);
    ribbons.push(r);
  }

  root.add(crowdField(people, { color: 0x0d0b18, react: 1, sway: 0.1 }, u));

  // ── the sea of lightsticks ──
  const rnd = prng(77);
  const HUES = [MAGENTA, ACCENT, COOL, 0xff5f9e, 0x8affd0];
  const sticks = Array.from({ length: 1900 }).map(() => {
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

  const haze = Array.from({ length: 150 }).map(() => ({
    x: (rnd() - 0.5) * 90, y: 3 + rnd() * 26, z: rnd() * 60,
    size: 0.14 + rnd() * 0.22, color: 0xd8a0ff, phase: rnd() * 6.283,
  }));
  root.add(sparkField(haze, { react: 0.5, base: 0.045, twinkle: 0.35, maxPx: 42 }, u));

  root.add(new THREE.AmbientLight(0x1e1e30, 1.25));
  const key = new THREE.PointLight(ACCENT, 2600, 80, 2);
  key.position.set(0, 18, 16);
  root.add(key);
  const rear = new THREE.PointLight(MAGENTA, 1600, 110, 2);
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
      key.intensity = 2800 + pulse * 1000;
      ribbons.forEach((r) => r.material.color.setHex(ACCENT).multiplyScalar(0.10 + pulse * 0.3));
      rear.intensity = 1600 + pulse * 600;
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
