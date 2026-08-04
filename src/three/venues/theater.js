// theater.js — a 3,000-seat proscenium house, 26 × 40 × 16 m.
//
// The arch is the room's defining object and the reason it sounds the way it
// does: the stage house behind it is, acoustically, a hole in the wall, and a
// good deal of what goes into it never comes back. So it is modelled as an
// actual aperture in a full-height wall rather than painted on — you are looking
// through a 14 m opening into a darker volume.

import * as THREE from 'three';
import { ACCENT, WARM, basic, crowdField, lambert, makeScreen, prng, sparkField } from '../kit.js';
import { drape, fixture, footlights, performer, rakedBlock, roomShell, seatBank, stageDeck, truss } from '../props.js';
import { frame } from './frame.js';

// The proscenium opening, as a closed 2D path. Both the wall's hole and the gilt
// trim around it are cut from this, so they can never drift apart.
function openingPath(halfWidth, sill, springing, crown) {
  const p = new THREE.Path();
  p.moveTo(-halfWidth, sill);
  p.lineTo(-halfWidth, springing);
  p.quadraticCurveTo(0, crown, halfWidth, springing);
  p.lineTo(halfWidth, sill);
  p.lineTo(-halfWidth, sill);
  return p;
}

export default function buildTheater(u) {
  const f = frame('theater');
  const root = new THREE.Group();

  const ARCH_Z = 5.4, ARCH_D = 1.0;
  const OPEN_HW = 7, SILL = 1.3, SPRING = 8.4, CROWN = 10.4;
  const DECK = 1.15;

  // ── the room ──
  root.add(roomShell({
    width: f.width, depth: f.depth, height: f.height,
    faces: {
      right: lambert(0x2c1e14, { emissive: 0x0a0705 }), left: lambert(0x2c1e14, { emissive: 0x0a0705 }),
      ceiling: lambert(0x16100c), floor: lambert(0x14100c),
      back: lambert(0x1e1610), stageEnd: lambert(0x050406),
    },
  }));

  // ── stage house behind the arch ──
  root.add(stageDeck({ width: 18, depth: 9, height: DECK, z: 1.6 }));
  root.add(footlights({ width: 13, count: 22, y: DECK + 0.05, z: 6.02 }));

  const screen = makeScreen({ w: 6.4, h: 4.5, pixels: false }, u);
  screen.position.set(0, 5.4, 2.9);
  root.add(screen);

  // a shallow back-of-house wall, so the opening reads as depth rather than void
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), lambert(0x0b0910));
  rear.position.set(0, 7, 0.4);
  root.add(rear);

  // ── the proscenium wall, with the opening cut out of it ──
  const wall = new THREE.Shape();
  wall.moveTo(f.xMin, 0); wall.lineTo(f.xMax, 0);
  wall.lineTo(f.xMax, f.height); wall.lineTo(f.xMin, f.height);
  wall.lineTo(f.xMin, 0);
  wall.holes.push(openingPath(OPEN_HW, SILL, SPRING, CROWN));
  const arch = new THREE.Mesh(
    new THREE.ExtrudeGeometry(wall, { depth: ARCH_D, bevelEnabled: false }),
    lambert(0x2e2118, { emissive: 0x0d0906 }),
  );
  arch.position.z = ARCH_Z;
  root.add(arch);

  // gilt trim: the same opening, 0.3 m proud, extruded thin
  const trimOuter = new THREE.Shape();
  const outer = openingPath(OPEN_HW + 0.34, SILL - 0.34, SPRING + 0.2, CROWN + 0.42);
  trimOuter.curves = outer.curves;
  trimOuter.holes.push(openingPath(OPEN_HW, SILL, SPRING, CROWN));
  const trim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(trimOuter, { depth: 0.16, bevelEnabled: false }),
    basic(0x3e2b12),
  );
  trim.position.z = ARCH_Z + ARCH_D;
  root.add(trim);

  // ── drapes: legs either side of the opening, a border across the top ──
  for (const side of [-1, 1]) {
    const leg = drape({ width: 2.6, height: SPRING + 1.4, folds: 6 });
    leg.position.set(side * (OPEN_HW - 1.2), (SPRING + 1.4) / 2 + SILL - 0.6, ARCH_Z - 0.2);
    root.add(leg);
  }
  const border = drape({ width: OPEN_HW * 2, height: 1.9, folds: 5, color: 0x1e0a09 });
  border.position.set(0, CROWN - 0.6, ARCH_Z - 0.2);
  root.add(border);

  // ── boxes up the side walls ──
  const rnd = prng(23);
  const boxPeople = [];
  for (let tier = 0; tier < 3; tier++) {
    const y = 3.6 + tier * 3.1;
    for (const side of [-1, 1]) {
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 17), lambert(0x3a2812, { emissive: 0x0e0904 }));
      front.position.set(side * (f.width / 2 - 2.6), y + 0.5, 17.5);
      root.add(front);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 17), basic(0x7a5624));
      rail.position.set(side * (f.width / 2 - 2.6), y + 1.05, 17.5);
      root.add(rail);
      const floorSlab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 17), lambert(0x140e0a));
      floorSlab.position.set(side * (f.width / 2 - 1.3), y - 0.15, 17.5);
      root.add(floorSlab);
      for (let k = 0; k < 14; k++) {
        boxPeople.push({
          x: side * (f.width / 2 - 1.9) + (rnd() - 0.5) * 0.5,
          y, z: 9.5 + k * 1.2 + (rnd() - 0.5) * 0.3,
          height: 1.24 + rnd() * 0.1, turn: side * 1.4,
        });
      }
    }
  }

  // ── raked stalls ──
  const stalls = rakedBlock({
    x0: f.xMin + 2.4, x1: f.xMax - 2.4, zNear: 8.5, zFar: 36,
    rows: 28, riseFirst: 0.12, rise: 0.13, seatSpacing: 0.58,
    headHeight: 1.26, seed: 41, fill: 0.94, color: 0x120c0a, tint: '#241708',
  });
  root.add(stalls.mesh);
  // real seats in the rows you can actually resolve from mid-stalls
  root.add(seatBank(stalls.treads.filter((s) => s.z < f.eye.z + 6), { color: 0x2a1a12 }));
  // our own seat, and the one beside it, stay empty
  const seated = stalls.people.filter((p) => !(Math.abs(p.z - f.eye.z) < 1.1 && Math.abs(p.x - f.eye.x) < 1.4));
  root.add(crowdField(seated.concat(boxPeople), { color: 0x040409, react: 0.35, sway: 0.035 }, u));

  // the rake under our feet decides the eye height, not a guess
  const seatFloor = 0.12 + Math.floor((f.eye.z - 8.5) / ((36 - 8.5) / 28)) * 0.13;

  // ── front-of-house bar + the bridge over the apron ──
  const bar = truss(16, { size: 0.42, color: 0x231a12 });
  bar.position.set(0, 12.4, 11);
  root.add(bar);

  const lamps = [];
  for (let i = 0; i < 7; i++) {
    const x = -6 + i * 2;
    const fx = fixture({
      color: i % 3 === 1 ? WARM : ACCENT,
      beamLength: 13, spread: 1.4, opacity: 0.045, react: 0.8,
    }, u);
    fx.position.set(x, 12.1, 11);
    fx.rotation.x = 0.62;
    root.add(fx);
    lamps.push(fx);
  }
  // a second bar just inside the arch, washing the deck
  for (let i = 0; i < 5; i++) {
    const x = -4.8 + i * 2.4;
    const fx = fixture({ color: ACCENT, beamLength: 8, spread: 1.0, opacity: 0.05 }, u);
    fx.position.set(x, SPRING + 0.6, 4.2);
    fx.rotation.x = 0.2;
    root.add(fx);
    lamps.push(fx);
  }

  // ── performers downstage ──
  for (const dx of [-3.2, -1.1, 1.1, 3.2]) {
    const p = performer({ height: 1.74, arms: Math.abs(dx) > 2 });
    p.position.set(dx, DECK, 4.6);
    root.add(p);
  }

  // house dust in the FOH beams
  const dust = Array.from({ length: 120 }).map(() => ({
    x: (rnd() - 0.5) * 18, y: 2 + rnd() * 9, z: 2 + rnd() * 14,
    size: 0.025 + rnd() * 0.035, color: 0xffca94, phase: rnd() * 6.283,
  }));
  root.add(sparkField(dust, { react: 0.3, base: 0.1, twinkle: 0.6, maxPx: 20 }, u));

  root.add(new THREE.AmbientLight(0x2a2230, 1.25));
  const key = new THREE.PointLight(0xffb87a, 90, 40, 2);
  key.position.set(0, 8, 7.5);
  root.add(key);
  const house = new THREE.PointLight(0x6a5880, 110, 46, 2);
  house.position.set(0, 12, 14);
  root.add(house);

  return {
    root,
    screen,
    camera: {
      position: new THREE.Vector3(0, seatFloor + f.eye.y, f.eye.z),
      target: new THREE.Vector3(0, 5.2, 3.4),
      fov: 54,
    },
    background: new THREE.Color(0x040308),
    fog: new THREE.Fog(0x0a0709, 12, 62),
    bloom: { strength: 0.5, radius: 0.7, threshold: 0.48 },
    update(t, pulse) {
      screen.userData.update(pulse);
      key.intensity = 70 + pulse * 90;
      lamps.forEach((fx, i) => {
        fx.rotation.z = Math.sin(t * 0.5 + i * 1.3) * 0.06 * (0.4 + pulse);
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.2 + pulse * 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + i));
      });
    },
  };
}
