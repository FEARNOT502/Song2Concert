// concerthall.js — a vineyard hall: terraced blocks stepping down around a
// central platform, audience wrapping behind the orchestra as well as in front.
//
// The low wall at the front of every block is the thing to look at. It is what
// makes the form work: each seat gets a lateral reflection off a surface a few
// metres away, where a shoebox has to send it twenty metres across the room. The
// blocks are drawn with those parapets proud of the seating for that reason.
//
// `dims` in the room model describes the listener's BLOCK, not the building — the
// image-source solver needs the local geometry. So the block below is the modelled
// 18 m wide, and the hall around it is drawn larger.

import * as THREE from 'three';
import { WARM, basic, crowdField, lambert, makeScreen, prng, sparkField } from '../kit.js';
import { fixture, organFacade, performer, rakedBlock, reflectorCloud } from '../props.js';
import { frame } from './frame.js';

// A terrace: raked seats behind a low reflecting wall, with a lit coping.
function terrace(opts, root, people) {
  const block = rakedBlock(opts);
  root.add(block.mesh);
  const w = opts.x1 - opts.x0;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, opts.parapet ?? 1.05, 0.32), lambert(0x3a2c1c, { emissive: 0x0c0805 }));
  wall.position.set((opts.x0 + opts.x1) / 2, (opts.yBase ?? 0) + (opts.parapet ?? 1.05) / 2, opts.zNear - 0.16);
  root.add(wall);
  const coping = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.38), basic(0x8a6428));
  coping.position.set((opts.x0 + opts.x1) / 2, (opts.yBase ?? 0) + (opts.parapet ?? 1.05), opts.zNear - 0.16);
  root.add(coping);
  people.push(...block.people);
  return block;
}

export default function buildConcertHall(u) {
  const f = frame('concerthall');
  const root = new THREE.Group();
  const HALL_W = 46, HALL_D = 44, HALL_H = f.height;
  const PLATFORM_Z = f.source.z;   // 6 m from the stage end — the model's stage
  const DECK = 1.0;

  // ── shell: no ceiling box, a masonry vault instead ──
  const shellMat = lambert(0x2c2115, { side: THREE.BackSide, emissive: 0x080604 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, HALL_H, HALL_D), shellMat);
  shell.position.set(0, HALL_H / 2, HALL_D / 2 - 4);
  root.add(shell);
  const vault = new THREE.Mesh(
    new THREE.SphereGeometry(30, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.34),
    lambert(0x2a2016, { side: THREE.BackSide, emissive: 0x0a0705 }),
  );
  vault.position.set(0, HALL_H - 8, 14);
  root.add(vault);

  // ── the platform ──
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.6, DECK, 40), lambert(0x2f2416, { emissive: 0x0c0804 }));
  podium.scale.z = 0.72;
  podium.position.set(0, DECK / 2, PLATFORM_Z);
  root.add(podium);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.05, 6, 44), basic(0x9a7030));
  rim.rotation.x = Math.PI / 2;
  rim.scale.y = 0.72;
  rim.position.set(0, DECK, PLATFORM_Z);
  root.add(rim);
  // risers for the back desks
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(13 - i * 3, 0.32, 2.2), lambert(0x1a120c));
    r.position.set(0, DECK + 0.16 + i * 0.32, PLATFORM_Z - 2.4 - i * 2.2);
    root.add(r);
  }

  // ── the organ, and the choir terrace under it ──
  const organ = organFacade({ width: 17, height: 9, color: 0x33281a });
  organ.position.set(0, 6.4, -1.6);
  root.add(organ);

  // the album art, hung over the platform as a discreet projection panel
  const screen = makeScreen({ w: 7.2, h: 5.0, pixels: false, halo: WARM }, u);
  screen.position.set(0, 7.8, 1.4);
  root.add(screen);

  const people = [];
  const rnd = prng(71);

  // choir/rear block, behind the orchestra, facing us
  const rear = rakedBlock({
    x0: -9, x1: 9, zNear: -3.6, zFar: 0.4, rows: 4,
    riseFirst: 1.2, rise: 0.45, seatSpacing: 0.95, headHeight: 1.2, fill: 0.55,
    seed: 12, color: 0x2e2115, tint: '#4a331a', emissive: 0x0a0705,
  });
  root.add(rear.mesh);
  people.push(...rear.people.map((p) => ({ ...p, turn: Math.PI })));

  // ── terraced blocks ──
  // ours: the modelled 18 m block, stepping up away from the platform
  const own = terrace({
    x0: f.xMin, x1: f.xMax, zNear: 11.5, zFar: 30, rows: 14,
    riseFirst: 0.55, rise: 0.42, seatSpacing: 0.6, headHeight: 1.26,
    seed: 71, fill: 0.95, color: 0x2e2115, tint: '#4a331a', emissive: 0x0e0a06,
  }, root, people);
  const ownRowDepth = (30 - 11.5) / 14;
  const seatFloor = 0.55 + Math.floor((f.seat.z - 11.5) / ownRowDepth) * 0.42;

  // side blocks, stepping down toward the platform
  for (const side of [-1, 1]) {
    terrace({
      x0: side > 0 ? 11 : -21, x1: side > 0 ? 21 : -11,
      zNear: 2.5, zFar: 13, rows: 8, yBase: 3.4,
      riseFirst: 0.5, rise: 0.46, seatSpacing: 0.62, headHeight: 1.24,
      seed: 91 + side, fill: 0.9, parapet: 1.2, color: 0x2a1e13, tint: '#452f18', emissive: 0x0e0a06,
    }, root, people);
    terrace({
      x0: side > 0 ? 10 : -22, x1: side > 0 ? 22 : -10,
      zNear: 14, zFar: 26, rows: 9, yBase: 1.4,
      riseFirst: 0.5, rise: 0.44, seatSpacing: 0.62, headHeight: 1.24,
      seed: 131 + side, fill: 0.9, parapet: 1.1, color: 0x2a1e13, tint: '#452f18', emissive: 0x0e0a06,
    }, root, people);
  }

  // ── the orchestra ──
  const players = [];
  const desks = [];
  const arcs = [
    { r: 7.0, n: 15, dz: 0.6 },
    { r: 5.4, n: 12, dz: 0.2 },
    { r: 3.6, n: 8, dz: -0.2 },
  ];
  arcs.forEach((arc, ai) => {
    for (let i = 0; i < arc.n; i++) {
      const t = arc.n === 1 ? 0.5 : i / (arc.n - 1);
      const a = Math.PI * (0.1 + t * 0.8);
      const x = -Math.cos(a) * arc.r;
      const z = PLATFORM_Z - Math.sin(a) * arc.r * 0.55 + arc.dz;
      players.push({ x, y: DECK + (ai === 2 ? 0.32 : 0), z, height: 1.28, turn: Math.atan2(-x, PLATFORM_Z + 3 - z) });
      desks.push([x, DECK + 0.7, z + 0.5, Math.atan2(-x, PLATFORM_Z + 3 - z)]);
    }
  });
  root.add(crowdField(players, { color: 0x08060c, react: 0.5, sway: 0.03 }, u));

  const standGeo = new THREE.BoxGeometry(0.42, 0.3, 0.02);
  const stands = new THREE.InstancedMesh(standGeo, lambert(0x2a2018), desks.length);
  const m = new THREE.Matrix4();
  desks.forEach(([x, y, z, ry], i) => {
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    stands.setMatrixAt(i, m);
  });
  stands.instanceMatrix.needsUpdate = true;
  root.add(stands);

  const conductor = performer({ height: 1.8, arms: true, color: 0x05050a });
  conductor.position.set(0, DECK + 0.3, PLATFORM_Z + 4.6);
  conductor.rotation.y = Math.PI;
  root.add(conductor);
  const rostrum = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.3, 16), lambert(0x1a120c));
  rostrum.position.set(0, DECK + 0.15, PLATFORM_Z + 4.6);
  root.add(rostrum);

  root.add(crowdField(people, { color: 0x050409, react: 0.3, sway: 0.03 }, u));

  // ── reflectors overhead ──
  const clouds = [];
  for (const c of [
    { x: -7.5, z: 3.2, w: 8.5, d: 5, tilt: -0.1 },
    { x: 0.5, z: 6.5, w: 11, d: 6, tilt: 0.03 },
    { x: 8.2, z: 3.8, w: 8, d: 5, tilt: 0.11 },
    { x: -3.5, z: 11.5, w: 9, d: 4.5, tilt: -0.06 },
    { x: 5.5, z: 12.5, w: 9, d: 4.5, tilt: 0.07 },
  ]) {
    const cloud = reflectorCloud({ width: c.w, depth: c.d, y: 12.2, ceiling: HALL_H, tilt: c.tilt });
    cloud.position.x = c.x;
    cloud.position.z = c.z;
    root.add(cloud);
    clouds.push(cloud);
  }

  // soft downlights from the clouds — a hall is lit, not rigged
  const lamps = [];
  for (const [x, z] of [[-5, 5], [0, 7], [5, 5], [0, 2]]) {
    const fx = fixture({ color: 0xffd9a8, beamLength: 12, spread: 3.0, opacity: 0.022, react: 0.35 }, u);
    fx.position.set(x, 12, z);
    root.add(fx);
    lamps.push(fx);
  }

  const dust = Array.from({ length: 110 }).map(() => ({
    x: (rnd() - 0.5) * 28, y: 1.5 + rnd() * 11, z: rnd() * 20,
    size: 0.03 + rnd() * 0.04, color: 0xffd9a8, phase: rnd() * 6.283,
  }));
  root.add(sparkField(dust, { react: 0.25, base: 0.12, twinkle: 0.5, maxPx: 18 }, u));

  root.add(new THREE.AmbientLight(0x3a3028, 1.5));
  const key = new THREE.PointLight(0xffd2a0, 300, 46, 2);
  key.position.set(0, 10, PLATFORM_Z + 1);
  root.add(key);
  // house light: four soft sources over the terraces. Without them the seats
  // read as a void, and a hall lit like a rock show is the wrong room entirely.
  for (const [x, y, z] of [[-14, 15, 12], [14, 15, 12], [0, 16, 24], [0, 13, 1]]) {
    const l = new THREE.PointLight(0xc8a67e, 380, 55, 2);
    l.position.set(x, y, z);
    root.add(l);
  }

  return {
    root,
    screen,
    camera: {
      position: new THREE.Vector3(f.seat.x, seatFloor + f.seat.y, f.seat.z),
      target: new THREE.Vector3(0, 5.6, PLATFORM_Z - 3),
      fov: 50,
    },
    background: new THREE.Color(0x07050a),
    fog: new THREE.Fog(0x120d0b, 16, 78),
    bloom: { strength: 0.34, radius: 0.8, threshold: 0.58 },
    update(t, pulse) {
      screen.userData.update(pulse);
      key.intensity = 260 + pulse * 180;
      clouds.forEach((c, i) => {
        c.position.y = 12.2 + Math.sin(t * 0.35 + i) * 0.05;
        c.userData.panel.material.emissive.setHex(0x120a04).multiplyScalar(0.5 + pulse * 1.6);
      });
      lamps.forEach((fx) => {
        if (fx.userData.glare) fx.userData.glare.material.opacity = 0.18 + pulse * 0.2;
      });
    },
  };
}
