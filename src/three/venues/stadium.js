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
  fixture, footlights, lineArray, orientBlock, performer, rakedBlock, ribbon,
  speakerStack, stageDeck, standingCrowd, truss,
} from '../props.js';
import { frame } from './frame.js';

export default function buildStadium(u) {
  const f = frame('stadium');
  const root = new THREE.Group();
  const DECK = 3.0, RIG_Y = 34, ROOF_Y = 48, BOWL_Z = 125;
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

  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.depth), lambert(0x0a1010));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.z = f.depth / 2 - 25;
  root.add(pitch);

  // ── the roof: a plate over the seating with the pitch cut out of it ──
  const plate = new THREE.Shape();
  plate.moveTo(-f.width / 2 - 14, -30); plate.lineTo(f.width / 2 + 14, -30);
  plate.lineTo(f.width / 2 + 14, f.depth - 30); plate.lineTo(-f.width / 2 - 14, f.depth - 30);
  plate.lineTo(-f.width / 2 - 14, -30);
  const hole = new THREE.Path();
  hole.moveTo(-76, 8); hole.lineTo(76, 8); hole.lineTo(76, 178); hole.lineTo(-76, 178); hole.lineTo(-76, 8);
  plate.holes.push(hole);
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(plate, { depth: 3.5, bevelEnabled: false }),
    lambert(0x1a1a26, { emissive: 0x0c0d16 }),
  );
  roof.rotation.x = Math.PI / 2;
  roof.position.y = ROOF_Y + 3.5;
  root.add(roof);
  // soffit lighting under the roof edge — reads the ring at a glance
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 168), basic(0x2a3550));
    strip.position.set(side * 76, ROOF_Y - 0.4, 93);
    root.add(strip);
  }

  // ── stage ──
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
      for (let k = 0; k < 6; k++) {
        const fx = fixture({ color: 0xf4f0e0, beamLength: 70, spread: 8, opacity: 0.014, react: 0.4 }, u);
        fx.position.set(side * (72 + (k % 3) * 4), ROOF_Y + 1.4, z - 4 + Math.floor(k / 3) * 8);
        fx.rotation.z = -side * 0.5;
        root.add(fx);
        heads.push({ fx, i: 100 + k, flood: true });
      }
    }
  }

  // ── the bowl ──
  const people = [];
  const ribbons = [];
  people.push(...standingCrowd({ x0: -66, x1: 66, zNear: 34, zFar: f.eye.z - CLEAR, count: 2500, seed: 177 }));
  people.push(...standingCrowd({ x0: -66, x1: 66, zNear: f.eye.z + CLEAR, zFar: 150, count: 1600, seed: 181 }));

  for (const side of [-1, 1]) {
    for (const [yBase, rows, out, seed] of [[0.6, 16, 0, 600], [15, 18, 6, 630], [30, 14, 12, 660]]) {
      const stand = orientBlock(rakedBlock({
        x0: -84, x1: 84, zNear: 0, zFar: rows * 0.98, rows,
        riseFirst: 0.6, rise: 0.82, seatSpacing: 0.55, headHeight: 1.25,
        yBase, seed: seed + side, fill: 0.85, emissive: 0x252038,
      }), { rotY: side * Math.PI / 2, x: side * (72 + out), z: 88 });
      root.add(stand.mesh);
      people.push(...stand.people);
      if (yBase < 1) {
        const fascia = ribbon({ length: 168, height: 1.1 });
        fascia.position.set(side * 71.4, 1.3, 88);
        root.add(fascia);
        ribbons.push(fascia);
      }
    }
  }
  const backFascia = ribbon({ length: 156, height: 1.1, along: 'x' });
  backFascia.position.set(0, 1.3, 151.4);
  root.add(backFascia);
  ribbons.push(backFascia);
  for (const [zNear, yBase, rows, seed] of [[152, 0.6, 16, 700], [158, 15, 18, 730], [166, 30, 14, 760]]) {
    const back = rakedBlock({
      x0: -78, x1: 78, zNear, zFar: zNear + rows * 0.98, rows,
      riseFirst: 0.6, rise: 0.82, seatSpacing: 0.55, headHeight: 1.25, yBase, seed, fill: 0.85, emissive: 0x252038,
    });
    root.add(back.mesh);
    people.push(...back.people);
  }
  // the stage-end stand: treated face, no crowd (the model's `arenaTreated` wall)
  const backdrop = new THREE.Mesh(new THREE.BoxGeometry(150, 44, 2), lambert(0x0c0c14));
  backdrop.position.set(0, 22, -6);
  root.add(backdrop);

  root.add(crowdField(people, { color: 0x0e0c1a, react: 1, sway: 0.11 }, u));

  const phones = Array.from({ length: 2400 }).map(() => {
    const onPitch = rnd() < 0.38;
    return onPitch
      ? { x: (rnd() - 0.5) * 132, y: 1.7 + rnd() * 0.6, z: 34 + rnd() * 116, size: 0.22, color: 0xfff0c8, phase: rnd() * 6.283 }
      : {
          x: (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 26), y: 2 + rnd() * 40,
          z: 8 + rnd() * 170, size: 0.22, color: 0xfff0c8, phase: rnd() * 6.283,
        };
  });
  root.add(sparkField(phones.filter((p) => Math.abs(p.z - f.eye.z) > CLEAR), { react: 1.25, base: 0.2, twinkle: 4.4, maxPx: 22 }, u));

  const haze = Array.from({ length: 240 }).map(() => ({
    x: (rnd() - 0.5) * 110, y: 3 + rnd() * 30, z: rnd() * 70,
    size: 0.16 + rnd() * 0.26, color: 0xffb070, phase: rnd() * 6.283,
  }));
  root.add(sparkField(haze, { react: 0.5, base: 0.04, twinkle: 0.35, maxPx: 46 }, u));

  root.add(new THREE.AmbientLight(0x171a2a, 1.0));
  const key = new THREE.PointLight(ACCENT, 3600, 170, 2);
  key.position.set(0, 20, 22);
  root.add(key);
  const rear = new THREE.PointLight(MAGENTA, 2000, 240, 2);
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
      key.intensity = 1800 + pulse * 4600;
      ribbons.forEach((r) => r.material.color.setHex(ACCENT).multiplyScalar(0.3 + pulse * 0.8));
      rear.intensity = 1000 + pulse * 2600;
      heads.forEach(({ fx, i, flood }) => {
        if (flood) return;
        const swing = Math.sin(t * 1.2 + i * 0.62);
        fx.rotation.z = swing * (0.2 + pulse * 0.45);
        fx.rotation.x = 0.42 + Math.sin(t * 0.8 + i * 1.1) * (0.09 + pulse * 0.22);
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.22 + pulse * 0.6 * (0.5 + 0.5 * swing);
      });
    },
  };
}
