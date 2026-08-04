// stadium.js — Wembley: a 1,139,100 m³ bowl, 90,000 seats, and a roof that
// covers every seat but deliberately leaves the pitch open. From FOH, 65 m out.
//
// That opening is drawn as an actual hole in the roof plate rather than implied,
// because it is the single fact that makes this the driest of the six venues:
// whatever radiates up over the pitch does not come back. Look up and you are
// looking at the sky, which is the point.

import * as THREE from 'three';
import { ACCENT, COOL, MAGENTA, WARM, basic, crowdField, lambert, makeScreen, prng, sparkField } from '../kit.js';
import {
  ampStack, bowl, fixture, footlights, lineArray, monitorWedge, performer,
  ribbonRing, seatBank, thin, speakerStack, stageDeck, standingCrowd, truss,
} from '../props.js';
import { frame } from './frame.js';

export default function buildStadium(u) {
  const f = frame('stadium');
  const root = new THREE.Group();
  const DECK = 3.0, RIG_Y = 34, ROOF_Y = 48, BOWL_Z = 125;
  // the bowl's inner edge — the boundary between the open pitch and the seating,
  // and therefore also the edge of the hole in the roof
  const BOWL_X = 66, BOWL_Z0 = -20, BOWL_Z1 = 148;
  // nothing stands closer than this to the camera: at FOH you are in a pocket
  const CLEAR = 14;

  // ── night sky ──
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying float vY;
        void main() {
          // city glow low down, deep night overhead
          vec3 horizon = vec3(0.13, 0.10, 0.20);
          vec3 zenith  = vec3(0.015, 0.018, 0.055);
          gl_FragColor = vec4(mix(horizon, zenith, smoothstep(-0.05, 0.75, vY)), 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  root.add(sky);
  const rnd = prng(199);
  const stars = Array.from({ length: 420 }).map(() => {
    const a = rnd() * Math.PI * 2, e = 0.25 + rnd() * 1.1, r = 480;
    return {
      x: Math.cos(a) * Math.cos(e) * r, y: Math.sin(e) * r, z: Math.sin(a) * Math.cos(e) * r + BOWL_Z,
      size: 3.2 + rnd() * 5.0, color: rnd() < 0.8 ? 0xdce8ff : 0xffe6c0, phase: rnd() * 6.283,
    };
  });
  root.add(sparkField(stars, { react: 0.05, base: 0.9, twinkle: 0.5, maxPx: 5 }, u));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(11, 24), basic(0xf2eddc, { fog: false }));
  moon.position.set(-210, 190, -330);
  moon.lookAt(0, 3, BOWL_Z);
  root.add(moon);

  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.depth + 80), lambert(0x0a1010));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.z = f.depth / 2 - 60;
  root.add(pitch);

  // ── the roof: a plate over the seating with the pitch cut out of it ──
  // The front edge reaches −82 rather than −66: the third tier steps back 52 m
  // from the pitch boundary, and a roof that stopped where the two-tier bowl
  // ended would have left the back of the upper deck standing out in the open.
  const plate = new THREE.Shape();
  plate.moveTo(-f.width / 2 - 14, -82); plate.lineTo(f.width / 2 + 14, -82);
  plate.lineTo(f.width / 2 + 14, f.depth - 30); plate.lineTo(-f.width / 2 - 14, f.depth - 30);
  plate.lineTo(-f.width / 2 - 14, -82);
  const hole = new THREE.Path();
  hole.moveTo(-BOWL_X, BOWL_Z0); hole.lineTo(BOWL_X, BOWL_Z0);
  hole.lineTo(BOWL_X, BOWL_Z1); hole.lineTo(-BOWL_X, BOWL_Z1); hole.lineTo(-BOWL_X, BOWL_Z0);
  plate.holes.push(hole);
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(plate, { depth: 3.5, bevelEnabled: false }),
    lambert(0x121219, { emissive: 0x08090f }),
  );
  roof.rotation.x = Math.PI / 2;
  roof.position.y = ROOF_Y + 3.5;
  root.add(roof);
  // soffit lighting under the roof edge — reads the ring at a glance
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, BOWL_Z1 - BOWL_Z0), basic(0x1c2437));
    strip.position.set(side * BOWL_X, ROOF_Y - 0.4, (BOWL_Z0 + BOWL_Z1) / 2);
    root.add(strip);
  }

  // ── stage ──
  const mask = new THREE.Mesh(new THREE.BoxGeometry(78, 24, 1.2), lambert(0x0b0b12));
  mask.position.set(0, 12, 6.4);
  root.add(mask);
  root.add(stageDeck({ width: 46, depth: 24, height: DECK, z: 20 }));
  root.add(footlights({ width: 44, count: 50, y: DECK + 0.06, z: 32.05 }));

  const screen = makeScreen({ w: 40, h: 20 }, u);
  screen.position.set(0, DECK + 12.2, 8.4);
  root.add(screen);

  const wings = [];
  for (const side of [-1, 1]) {
    const wing = makeScreen({ w: 11, h: 16, halo: MAGENTA, bezel: 0x8a4a2a, content: COOL }, u);
    wing.position.set(side * 31.5, DECK + 10.4, 10.5);
    wing.rotation.y = -side * 0.34;
    root.add(wing);
    wings.push(wing);
  }

  const thrust = new THREE.Mesh(new THREE.BoxGeometry(5, DECK, 26), lambert(0x110e14));
  thrust.position.set(0, DECK / 2, 44);
  root.add(thrust);
  const star = performer({ height: 1.84, arms: true });
  star.position.set(0, DECK, 54);
  root.add(star);
  for (const [x, z] of [[-14, 22], [14, 22], [-7, 16], [7, 16], [0, 13]]) {
    const p = performer({ height: 1.78 });
    p.position.set(x, DECK, z);
    root.add(p);
  }
  for (const [x, z] of [[-18, 13], [18, 13]]) {
    const amp = ampStack({ count: 3, w: 1.0, h: 0.6 });
    amp.position.set(x, DECK, z);
    root.add(amp);
  }
  for (let i = 0; i < 11; i++) {
    const wedge = monitorWedge({ w: 0.9 });
    wedge.position.set(-20 + i * 4, DECK, 30.4);
    wedge.rotation.y = Math.PI;
    root.add(wedge);
  }

  // ── rig ──
  for (const z of [10, 20, 30]) {
    const t = truss(56, { size: 1.6, color: 0x1a1a26 });
    t.position.set(0, RIG_Y, z);
    root.add(t);
  }
  for (const side of [-1, 1]) {
    const hang = lineArray({ boxes: 20, width: 1.8 });
    hang.position.set(side * 23, RIG_Y - 1.4, 13);
    root.add(hang);
    for (const [dx, dz] of [[40, 62], [46, 96]]) {
      const delay = lineArray({ boxes: 12, width: 1.5 });
      delay.position.set(side * dx, 28, dz);
      root.add(delay);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 28, 8), lambert(0x1a1a26));
      mast.position.set(side * dx, 14, dz + 1.4);
      root.add(mast);
    }
    for (const dz of [-3, 3]) {
      const subs = speakerStack({ w: 3.4, h: 1.1, d: 1.5, count: 3 });
      subs.position.set(side * 15, 0, 31 + dz);
      root.add(subs);
    }
  }

  const heads = [];
  const PALETTE = [ACCENT, MAGENTA, COOL, WARM];
  for (let i = 0; i < 18; i++) {
    const fx = fixture({ color: PALETTE[i % PALETTE.length], beamLength: 60, spread: 4.0, opacity: 0.04, react: 1.2 }, u);
    fx.position.set(-26 + (i % 9) * 6.5, RIG_Y - 1.2, i < 9 ? 10 : 30);
    root.add(fx);
    heads.push({ fx, i });
  }

  // ── floodlight masts on the roof edge ──
  for (const side of [-1, 1]) {
    for (const z of [46, 104]) {
      const rigTruss = truss(14, { size: 1.2, color: 0x1c1c28 });
      rigTruss.position.set(side * 78, ROOF_Y + 2, z);
      root.add(rigTruss);
      for (let k = 0; k < 3; k++) {
        const fx = fixture({ color: 0xf4f0e0, beamLength: 62, spread: 5, opacity: 0.005, react: 0.35 }, u);
        fx.position.set(side * (72 + k * 5), ROOF_Y + 1.4, z - 2 + (k % 2) * 6);
        fx.rotation.z = -side * 0.5;
        root.add(fx);
        heads.push({ fx, i: 100 + k, flood: true });
      }
    }
  }

  // ── the bowl ──
  // 90,000 seats as one continuous rake, all the way round. The block behind the
  // stage carries no crowd: at a stadium show it is sold off and masked, and the
  // room model treats that end as structure rather than as people.
  const people = [];
  people.push(...standingCrowd({ x0: -66, x1: 66, zNear: 34, zFar: f.eye.z - CLEAR, count: 2600, seed: 177 }));
  people.push(...standingCrowd({ x0: -66, x1: 66, zNear: f.eye.z + CLEAR, zFar: 150, count: 1400, seed: 181 }));

  const near = (x, z) => Math.hypot(x - f.eye.x, z - f.eye.z);
  // THREE TIERS, not two. Wembley is a three-tier bowl — a deep lower rake, a
  // shallow middle deck of club seating, and an upper tier that carries most of
  // the ninety thousand — and drawing it with two made the biggest venue here
  // read as no taller than the arena. The arena and the dome keep two, which is
  // what those buildings have.
  //
  // The tiers stack: each starts above the last and steps back by its predecessor's
  // full depth, so the face between them is the concourse wall. The top row of
  // the upper tier lands at about 36 m against a roof at 48, which leaves the
  // headroom a stadium roof actually has over its back row.
  const ring = bowl({
    halfWidth: BOWL_X, zFront: BOWL_Z0, zBack: BOWL_Z1,
    tiers: [
      { rows: 18, rise: 0.42, riseFar: 0.50, run: 0.92, yBase: 0.6, inset0: 0 },
      { rows: 13, rise: 0.52, riseFar: 0.62, run: 0.94, yBase: 11.8, inset0: 18.6 },
      { rows: 20, rise: 0.60, riseFar: 0.74, run: 0.98, yBase: 22.6, inset0: 33.0 },
    ],
    seatSpacing: 0.56, headHeight: 1.25, seed: 600, blockLength: 14,
    crowdFrom: 14,
    density: () => 1,
    // Raised with the seat count so the house stays as full as it looked: the
    // crowd is thinned to this cap, so leaving it where it was would have spread
    // the same people over half again as many rows.
    maxPeople: 8500, emissive: 0x131120,
  });
  root.add(ring.mesh);
  root.add(ring.blocks);
  root.add(seatBank(thin(ring.treads.filter((s) => near(s.x, s.z) < 48), 2000)));

  // A lit fascia on each of the two lower tiers. In a room this size the ribbons
  // are what tell you there is a stand out there at all, and with three tiers
  // they are also what tells you how many there are.
  const ribbons = [];
  for (const { inset, yTop } of ring.fascias.slice(0, 2)) {
    const r = ribbonRing({
      halfWidth: BOWL_X + inset, zFront: BOWL_Z0 - inset, zBack: BOWL_Z1 + inset,
      y: yTop + 1.9, height: 0.95, thickness: 0.32,
    });
    root.add(r);
    ribbons.push(r);
  }

  root.add(crowdField(ring.people, { color: 0x2d283c, react: 1, sway: 0.066 }, u));
  root.add(crowdField(people, { color: 0x0d0c16, react: 1, sway: 0.11 }, u));

  const phones = Array.from({ length: 1700 }).map(() => {
    const onPitch = rnd() < 0.38;
    return onPitch
      ? { x: (rnd() - 0.5) * 132, y: 1.7 + rnd() * 0.6, z: 34 + rnd() * 116, size: 0.22, color: 0xfff0c8, phase: rnd() * 6.283 }
      : {
          x: (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 26), y: 2 + rnd() * 40,
          z: 8 + rnd() * 170, size: 0.22, color: 0xfff0c8, phase: rnd() * 6.283,
        };
  });
  root.add(sparkField(phones.filter((p) => Math.abs(p.z - f.eye.z) > CLEAR), { react: 1.25, base: 0.2, twinkle: 4.4, maxPx: 22 }, u));

  const haze = Array.from({ length: 140 }).map(() => ({
    x: (rnd() - 0.5) * 110, y: 3 + rnd() * 30, z: rnd() * 70,
    size: 0.16 + rnd() * 0.26, color: 0xffb070, phase: rnd() * 6.283,
  }));
  root.add(sparkField(haze, { react: 0.5, base: 0.04, twinkle: 0.35, maxPx: 46 }, u));

  root.add(new THREE.AmbientLight(0x171a2a, 1.0));
  const key = new THREE.PointLight(ACCENT, 3600, 96, 2);
  key.position.set(0, 20, 22);
  root.add(key);
  const rear = new THREE.PointLight(MAGENTA, 2000, 120, 2);
  rear.position.set(0, 34, 80);
  root.add(rear);
  const floorFill = new THREE.PointLight(ACCENT, 1500, 80, 2);
  floorFill.position.set(0, 9, 40);
  root.add(floorFill);

  return {
    root,
    screen,
    camera: { position: f.eye.clone(), target: new THREE.Vector3(0, DECK + 11.2, 10), fov: 64 },
    background: new THREE.Color(0x06060f),
    fog: new THREE.Fog(0x0b0b18, 60, 420),
    bloom: { strength: 0.68, radius: 0.85, threshold: 0.4 },
    update(t, pulse) {
      screen.userData.update(pulse);
      wings.forEach((w) => w.userData.update(pulse));
      key.intensity = 3800 + pulse * 1300;
      ribbons.forEach((r) => r.material.color.setHex(ACCENT).multiplyScalar(0.10 + pulse * 0.3));
      rear.intensity = 2100 + pulse * 700;
      heads.forEach(({ fx, i, flood }) => {
        if (flood) return;
        const swing = Math.sin(t * 0.95 + i * 0.62);
        fx.rotation.z = swing * 0.36;
        fx.rotation.x = 0.42 + Math.sin(t * 0.66 + i * 1.1) * 0.17;
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.3 + pulse * 0.2 * (0.5 + 0.5 * swing);
      });
    },
  };
}
