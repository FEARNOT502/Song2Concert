import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildStands } from '../src/three/stands.js';
import { Walker } from '../src/three/walk.js';
import { fitArena200 } from '../src/three/venues/arena-200.js';
import { ARENA_OZ } from '../src/three/venues/arena.js';
import { SSA_STANDS } from '../src/three/venues/ssa-data.js';

// Geometry, collision and seat checks do not need to draw the sign textures.
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };

const data = fitArena200(SSA_STANDS);
const model = buildStands(data, { offset: new THREE.Vector3(0, 0, ARENA_OZ), crowd: false });
const canvas = new EventTarget();
canvas.style = {};
const walker = new Walker(canvas, { keys: false });
walker.root = model.group;
walker.ensureIndex();

const ray = new THREE.Ray();
const ceiling = model.group.getObjectByName('Concourse ceilings');
function hit(x, y, z, dx, dz, far) {
  ray.origin.set(x, y, z);
  ray.direction.set(dx, 0, dz);
  return walker.bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
}

function walk([x, z], y, dx, dz, distance) {
  const ground = walker.ground(x, z, y + 0.13);
  assert(ground !== null && Math.abs(ground - y) < 0.55);
  walker.feet.set(x, ground, z);
  walker.gy = ground;
  walker.grounded = true;
  walker.vy = 0;
  walker.seated = null;
  walker.eyeH = 1.6;
  walker.yaw = Math.atan2(dx, -dz);
  walker.held.add('w');
  const ticks = Math.floor(distance * 30 / 3.2);
  for (let i = 0; i < ticks; i++) walker.update(1 / 30, null);
  walker.held.clear();
  const walked = (walker.feet.x - x) * dx + (walker.feet.z - z) * dz;
  assert(walked > distance - 0.14, `Walk stopped at ${walked.toFixed(2)} m of ${distance.toFixed(2)} m`);
  return walker.feet.y;
}

const corners = ['212', '219', '232', '239'];
for (const f of data.frames.filter((frame) => +frame.label < 300)) {
  const dx = Math.sin(f.yaw), dz = Math.cos(f.yaw);
  const at = (s, t) => [f.x + dz * s + dx * (t - 0.15), f.z + ARENA_OZ - dx * s + dz * (t - 0.15)];
  for (const s of [-0.66, 0, 0.66]) {
    const [x, z] = at(s, -0.44);
    assert(!hit(x, f.y + 1.45, z, dx, dz, 0.92), `Gate ${f.label} has an obstruction in its frame`);
  }
  if (!corners.includes(f.label)) continue;
  const flight = data.flights.find((a) => a.sideWalls === false && Math.hypot(a.x - f.x, a.z - f.z) < 4);
  const approach = -0.85, concourse = flight.L + 0.9;
  for (const s of [-1.22, 1.22]) {
    const [x, z] = at(s, -0.65);
    assert(hit(x, f.y + 1.45, z, dx, dz, 1.0), `Gate ${f.label} has a gap beside the frame`);
  }
  {
    const [x, z] = at(0, -0.45);
    assert(hit(x, 15.82, z, dx, dz, 0.5), `Gate ${f.label} wall does not reach the 400 slab`);
    const [xx, zz] = at(0, 0.15);
    ray.origin.set(xx, 15.7, zz);
    ray.direction.set(0, 1, 0);
    assert(walker.bvh.raycastFirst(ray, THREE.DoubleSide, 0, 0.2), `Gate ${f.label} does not join the slab underside`);
  }
  for (const s of [-0.38, 0, 0.38]) {
    const limit = concourse - approach - 0.015;
    assert(Math.abs(walk(at(s, approach), f.y, dx, dz, limit) - 6.2) < 0.06, `Gate ${f.label} concourse landing`);
    assert(Math.abs(walk(at(s, concourse), 6.2, -dx, -dz, limit) - f.y) < 0.38, `Gate ${f.label} stand landing`);
  }
  for (const s of [-1.45, -0.65, 0.65, 1.45]) {
    const [x, z] = at(s, -0.44);
    const above = new THREE.Raycaster(new THREE.Vector3(x, 9.92, z), new THREE.Vector3(0, 1, 0), 0, 0.32);
    assert.equal(above.intersectObject(ceiling).length, 0, `Gate ${f.label} ceiling projects through the wall`);
  }
  for (const t of [0.48, 1.2, flight.L + 0.4]) {
    for (const s of [-0.76, 0.76]) {
      const [x, z] = at(s, t);
      const above = new THREE.Raycaster(new THREE.Vector3(x, f.y + f.h - 0.05, z), new THREE.Vector3(0, 1, 0), 0, 0.1);
      assert(above.intersectObject(ceiling).length, `Gate ${f.label} ceiling does not meet its jamb`);
    }
  }
}

for (const v of data.levels[0].voms) {
  const [x, z] = v.p, [dx, dz] = v.u, start = v.L - 0.8;
  walk([x + dx * start, z + dz * start + ARENA_OZ], v.y, dx, dz, 2.6);
}

// Check the bowl-facing wall on each side between the gate openings.
for (const [x, y, z, dx, dz, distance] of [
  [52.8, 10.88, 0, 1, 0, 0.95], [-48.8, 9.7, 0, -1, 0, 0.58],
  [0, 11.07, -56.8, 0, -1, 0.92], [0, 11.07, 57, 0, 1, 0.94],
  [53.75, 15.82, 0, 1, 0, 1.25], [-53.25, 15.82, 0, -1, 0, 0.75],
]) {
  const wall = hit(x, y, z + ARENA_OZ, dx, dz, 1.4);
  assert(wall && Math.abs(wall.distance - distance) < 0.15, `Level 200 wall at ${x}, ${z}`);
}

for (const z of [-54.25, 54.25]) {
  for (let x = -18; x <= 18; x += 2) {
    const above = new THREE.Raycaster(new THREE.Vector3(x, 20.52, z + ARENA_OZ), new THREE.Vector3(0, 1, 0), 0, 0.08);
    assert(above.intersectObject(ceiling).length, `500 balcony soffit is interrupted at ${x}, ${z}`);
  }
}

const gate217 = model.seats.filter((p) => p.block.startsWith('217'));
assert.equal(gate217.length, 842);
for (const p of gate217) assert(Math.abs(p.y - walker.ground(p.x, p.z, p.y + 0.16)) < 0.025, `${p.block} row ${p.row} seat ${p.num}`);
walker.dispose();
console.log('Level 200 walls, 28 portals and 842 Gate 217 seats verified.');
