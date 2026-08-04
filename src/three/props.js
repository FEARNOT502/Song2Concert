// props.js — the things that stand in the rooms: structure, rigging, seating,
// and the instruments on stage.
//
// Coordinates are metres in a stage-centred frame: X across the room with 0 on
// the stage centre line, Y up from the floor, Z from the stage end (0) toward
// the back of the house. That is `venuerooms.js`'s frame with x recentred and y
// and z swapped for three.js — see `src/three/venues/index.js`.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ACCENT, WARM, basic, lambert, flare, makeBeam, prng, seatTexture } from './kit.js';

// ── room shell ──────────────────────────────────────────────────────────────

// An inside-out box. `faces` gives materials in BoxGeometry order — right, left,
// ceiling, floor, back wall (behind the audience), stage-end wall.
export function roomShell({ width, depth, height, faces }) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geo, [
    faces.right, faces.left, faces.ceiling, faces.floor, faces.back, faces.stageEnd,
  ].map((m) => { m.side = THREE.BackSide; return m; }));
  mesh.position.set(0, height / 2, depth / 2);
  return mesh;
}

// ── rigging ─────────────────────────────────────────────────────────────────

// A box truss, merged into one geometry: four chords and a zig-zag web. Built
// along X, centred on the origin.
export function truss(length, { size = 0.5, color = 0x2a2118, bays = null } = {}) {
  const parts = [];
  const r = size * 0.06;
  const h = size / 2;
  for (const [dy, dz] of [[h, h], [h, -h], [-h, h], [-h, -h]]) {
    const chord = new THREE.CylinderGeometry(r, r, length, 5, 1);
    chord.rotateZ(Math.PI / 2);
    chord.translate(0, dy, dz);
    parts.push(chord);
  }
  const n = bays ?? Math.max(2, Math.round(length / (size * 1.6)));
  const step = length / n;
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + i * step;
    for (const dz of [h, -h]) {
      const web = new THREE.BoxGeometry(r * 1.6, size, r * 1.6);
      web.translate(x, 0, dz);
      parts.push(web);
    }
  }
  return new THREE.Mesh(mergeGeometries(parts), lambert(color));
}

// A lighting fixture: yoke, lens, flare and the shaft it throws. Returns the
// group plus its beam so a venue can aim and re-colour it per frame.
export function fixture({ color = ACCENT, beamLength = 14, spread = 2.4, opacity = 0.13, lit = true, react = 1 }, u) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.42, 8), lambert(0x171009));
  body.position.y = -0.18;
  g.add(body);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), basic(lit ? color : 0x120c06));
  lens.rotation.x = -Math.PI / 2;
  lens.position.y = -0.4;
  g.add(lens);

  let beam = null, glare = null;
  if (lit) {
    glare = flare(1.5, color, 0.55);
    glare.position.y = -0.4;
    g.add(glare);
    beam = makeBeam({ color, length: beamLength, top: 0.12, spread, opacity, react }, u);
    beam.position.y = -0.4;
    g.add(beam);
  }
  g.userData = { beam, glare, lens };
  return g;
}

// A flown line-array hang: cabinets fanning downward, tighter at the top.
export function lineArray({ boxes = 12, width = 1.1, color = 0x120d08 } = {}) {
  const parts = [];
  let y = 0, angle = 0;
  for (let i = 0; i < boxes; i++) {
    const box = new THREE.BoxGeometry(width, 0.34, 0.62);
    const m = new THREE.Matrix4()
      .makeRotationX(angle)
      .setPosition(0, y, Math.sin(angle) * 0.16);
    box.applyMatrix4(m);
    parts.push(box);
    angle += 0.035 + i * 0.012;
    y -= 0.36;
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), lambert(color));
  mesh.userData.height = -y;
  return mesh;
}

// Ground-stacked subs / side-fill.
export function speakerStack({ w = 1.2, h = 0.7, d = 0.9, count = 3, color = 0x120d08 } = {}) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const box = new THREE.BoxGeometry(w, h, d);
    box.translate(0, h / 2 + i * h, 0);
    parts.push(box);
  }
  return new THREE.Mesh(mergeGeometries(parts), lambert(color));
}

// ── seating ─────────────────────────────────────────────────────────────────

// A raked block: the physical steps, plus the seated crowd that fills them.
// Returns { mesh, people } — `people` feeds crowdField().
export function rakedBlock({
  x0, x1, zNear, zFar, rows, riseFirst = 0.32, rise = 0.36, yBase = 0,
  seatSpacing = 0.62, headHeight = 1.22, seed = 1, fill = 1, color = 0x0d0a08, tint = '#1b1408',
  emissive = 0x000000,
}) {
  const depth = (zFar - zNear) / rows;
  const width = x1 - x0;
  const parts = [];
  const people = [];
  const rnd = prng(seed);
  for (let r = 0; r < rows; r++) {
    const y = yBase + riseFirst + r * rise;
    const z = zNear + r * depth;
    const step = new THREE.BoxGeometry(width, y - yBase + 0.001, depth);
    step.translate((x0 + x1) / 2, yBase + (y - yBase) / 2, z + depth / 2);
    parts.push(step);
    const seats = Math.max(1, Math.floor(width / seatSpacing));
    for (let s = 0; s < seats; s++) {
      if (rnd() > fill) continue;
      people.push({
        x: x0 + (s + 0.5) * (width / seats) + (rnd() - 0.5) * 0.14,
        y,
        z: z + depth * 0.55,
        height: headHeight * (0.92 + rnd() * 0.16),
        turn: (rnd() - 0.5) * 0.5,
      });
    }
  }
  const mat = lambert(color, { map: seatTexture([Math.max(1, Math.round(width / 3)), rows], tint), emissive });
  return { mesh: new THREE.Mesh(mergeGeometries(parts), mat), people };
}

// `rakedBlock` always rakes toward +z, which is what a block facing the stage
// wants. A bowl also needs stands down the sides, so this rotates a finished
// block — mesh and people together, which is the part that is easy to get wrong.
export function orientBlock(block, { rotY = 0, x = 0, y = 0, z = 0 }) {
  const m = new THREE.Matrix4()
    .makeRotationY(rotY)
    .premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
  block.mesh.applyMatrix4(m);
  const v = new THREE.Vector3();
  block.people = block.people.map((p) => {
    v.set(p.x, p.y, p.z).applyMatrix4(m);
    return { ...p, x: v.x, y: v.y, z: v.z, turn: (p.turn ?? 0) + rotY };
  });
  return block;
}

// A standing floor crowd: no steps, just people on flat ground getting denser
// toward the stage.
export function standingCrowd({ x0, x1, zNear, zFar, count, y = 0, seed = 3, height = 1.7 }) {
  const rnd = prng(seed);
  const people = [];
  for (let i = 0; i < count; i++) {
    const t = rnd();
    people.push({
      x: x0 + rnd() * (x1 - x0),
      y,
      z: zNear + t * t * (zFar - zNear),
      height: height * (0.9 + rnd() * 0.2),
      turn: (rnd() - 0.5) * 0.6,
    });
  }
  return people;
}

// ── stage furniture ─────────────────────────────────────────────────────────

// A performer silhouette, 1.75 m by default. Cheap: three primitives merged.
export function performer({ height = 1.75, arms = false, color = 0x030308 } = {}) {
  const s = height / 1.75;
  const parts = [];
  const torso = new THREE.CapsuleGeometry(0.17 * s, 0.5 * s, 4, 8);
  torso.translate(0, 1.05 * s, 0);
  parts.push(torso);
  const legs = new THREE.CapsuleGeometry(0.15 * s, 0.5 * s, 4, 8);
  legs.translate(0, 0.5 * s, 0);
  parts.push(legs);
  const head = new THREE.SphereGeometry(0.13 * s, 8, 6);
  head.translate(0, 1.56 * s, 0);
  parts.push(head);
  if (arms) {
    const arm = new THREE.CapsuleGeometry(0.06 * s, 0.5 * s, 3, 6);
    arm.rotateZ(-0.5);
    arm.translate(0.34 * s, 1.5 * s, 0);
    parts.push(arm);
  }
  return new THREE.Mesh(mergeGeometries(parts), lambert(color));
}

// A mic on a stand, with the little emissive bead that says "vocal".
export function micStand({ height = 1.5 } = {}) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, height, 6), lambert(0x1a1208));
  pole.position.y = height / 2;
  g.add(pole);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 6), lambert(0x1a1208));
  boom.rotation.z = Math.PI / 2;
  boom.position.set(0.16, height, 0);
  g.add(boom);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), basic(0x2a2018));
  cap.position.set(0.34, height, 0);
  g.add(cap);
  return g;
}

// A jazz kit, seen from the front: kick, two toms, snare, hats and a ride.
export function drumKit() {
  const g = new THREE.Group();
  const shell = lambert(0x1a1208);
  const skin = basic(0x0a0812);
  const brass = lambert(0xa8823a);

  const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.42, 20, 1, true), shell);
  kick.rotation.x = Math.PI / 2;
  kick.position.set(0, 0.33, 0);
  g.add(kick);
  const kickHead = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20), skin);
  kickHead.position.set(0, 0.33, 0.212);
  g.add(kickHead);
  const port = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), basic(ACCENT, { transparent: true, opacity: 0.22 }));
  port.position.set(0.07, 0.3, 0.215);
  g.add(port);

  for (const [x, y, r] of [[-0.24, 0.72, 0.15], [0.2, 0.74, 0.17]]) {
    const tom = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 14), shell);
    tom.rotation.x = 0.35;
    tom.position.set(x, y, 0.02);
    g.add(tom);
  }
  const snare = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 16), shell);
  snare.position.set(-0.42, 0.6, 0.24);
  snare.rotation.x = 0.16;
  g.add(snare);

  for (const [x, y, r] of [[-0.66, 0.98, 0.19], [0.62, 1.02, 0.24]]) {
    const cym = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.008, 18), brass);
    cym.rotation.z = 0.16;
    cym.position.set(x, y, 0.12);
    g.add(cym);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, y, 5), lambert(0x1a1208));
    stand.position.set(x, y / 2, 0.12);
    g.add(stand);
  }
  return g;
}

// A grand piano with the lid up — mostly read as the lid's silhouette.
export function grandPiano() {
  const g = new THREE.Group();
  const black = lambert(0x0d0a10);
  const shape = new THREE.Shape();
  shape.moveTo(-0.75, 0);
  shape.lineTo(0.75, 0);
  shape.quadraticCurveTo(0.95, 1.3, 0.35, 2.1);
  shape.lineTo(-0.75, 2.1);
  shape.lineTo(-0.75, 0);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: false }), black);
  body.rotation.x = -Math.PI / 2;
  body.position.y = 0.98;
  g.add(body);

  const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), black);
  lid.rotation.x = -Math.PI / 2;
  lid.rotation.y = 0;
  lid.position.set(0, 1.28, 0);
  lid.rotation.z = 0;
  g.add(lid);

  for (const x of [-0.62, 0.62, 0.1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.98, 6), black);
    leg.position.set(x, 0.49, x === 0.1 ? -1.6 : -0.1);
    g.add(leg);
  }
  const keys = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.03, 0.16), basic(0xd8cfb8));
  keys.position.set(0, 1.0, 0.08);
  g.add(keys);
  return g;
}

// A double bass, leaning on its endpin.
export function uprightBass() {
  const g = new THREE.Group();
  const wood = lambert(0x2a1a0e);
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), wood);
  lower.scale.set(1, 1.15, 0.42);
  lower.position.y = 0.72;
  g.add(lower);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), wood);
  upper.scale.set(1, 1.05, 0.42);
  upper.position.y = 1.24;
  g.add(upper);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.06), wood);
  neck.position.y = 1.85;
  g.add(neck);
  g.rotation.z = 0.14;
  return g;
}

// A pipe-organ facade — the back wall of a concert hall, one instanced draw.
export function organFacade({ width, height, count = 46, color = 0x241a10 }) {
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true);
  const mesh = new THREE.InstancedMesh(geo, lambert(color, { side: THREE.DoubleSide }), count);
  const m = new THREE.Matrix4();
  const rnd = prng(19);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const h = height * (0.42 + 0.58 * Math.abs(Math.sin(t * Math.PI * 2.4 + 0.6)) * (0.7 + rnd() * 0.3));
    const r = (width / count) * 0.42;
    m.compose(
      new THREE.Vector3(-width / 2 + t * width, h / 2, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(r * 2, h, r * 2),
    );
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// A suspended reflector — the "cloud" a vineyard hall hangs over its platform.
export function reflectorCloud({ width, depth, y, ceiling, tilt = 0 }) {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.12, depth),
    lambert(0x53401f, { emissive: 0x160f07 }),
  );
  panel.rotation.z = tilt;
  g.add(panel);
  const wire = lambert(0x2e2418);
  for (const [dx, dz] of [[-width * 0.35, -depth * 0.3], [width * 0.35, -depth * 0.3], [-width * 0.35, depth * 0.3], [width * 0.35, depth * 0.3]]) {
    const run = ceiling - y;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, run, 4), wire);
    w.position.set(dx, run / 2, dz);
    g.add(w);
  }
  g.position.y = y;
  g.userData.panel = panel;
  return g;
}

// A drape: a soft vertical fold, used down both sides of a proscenium.
export function drape({ width, height, folds = 9, color = 0x2a0d0b }) {
  const geo = new THREE.PlaneGeometry(width, height, folds * 2, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.cos((x / width) * Math.PI * folds * 2) * width * 0.035);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, lambert(color, { side: THREE.DoubleSide }));
}

// The stage deck: a slab with the emissive lip that every one of these rooms has.
export function stageDeck({ width, depth, height, z, lipColor = ACCENT }) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), lambert(0x0f0b07));
  deck.position.set(0, height / 2, z);
  g.add(deck);
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(width, Math.max(0.03, height * 0.05), 0.04),
    basic(lipColor),
  );
  lip.position.set(0, height, z + depth / 2 + 0.02);
  g.add(lip);
  g.userData.lip = lip;
  return g;
}

// Footlight beads along the front of a deck.
export function footlights({ width, count, y, z, color = WARM }) {
  const geo = new THREE.SphereGeometry(0.05, 6, 5);
  const mesh = new THREE.InstancedMesh(geo, basic(color), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.setPosition(-width / 2 + (i + 0.5) * (width / count), y, z);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
