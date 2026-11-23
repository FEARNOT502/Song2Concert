import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { gymPoint } from '../src/three/gymnastic-arena-plan.js';
import { decodeSeats } from '../src/three/stands.js';
import { C2, CROSS_R, LOWER_VOMS, buildBowl, cutRake } from '../src/three/venues/gymnastic-bowl.js';
import { GYM_UPPER } from '../src/three/venues/gymnastic-data.js';
import { getGymnasticSeatCatalog } from '../src/three/venues/gymnastic-seats.js';

function position(angle, radius, y) {
  const [x, z] = gymPoint(angle, radius);
  return new THREE.Vector3(x, y, z);
}

const root = new THREE.Group();
const bowl = buildBowl(root);
const source = new THREE.BufferGeometry();
source.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(decodeSeats(GYM_UPPER), (value) => value / 100), 3));
const rake = cutRake(source);
const treads = root.getObjectByName('Vomitory floors and stairs');
const walls = root.getObjectByName('Vomitory walls');
const positions = [rake, treads.geometry, walls.geometry].map((geometry) => (
  new THREE.BufferGeometry().setAttribute('position', geometry.getAttribute('position'))
));
const deck = new MeshBVH(mergeGeometries(positions));

const above = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
const below = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
let covered = 0;
for (let angle = 0; angle < 360; angle += .25) {
  for (let i = 0; i <= 49; i++) {
    const radius = CROSS_R - .04 + i * .05;
    above.origin.copy(position(angle, radius, 8));
    below.origin.copy(position(angle, radius, 3.6));
    const hit = deck.raycastFirst(above, THREE.DoubleSide);
    assert(hit && hit.point.y >= C2.y - .01, `open floor at ${angle}°, radius ${radius.toFixed(2)} m`);
    assert(deck.raycastFirst(below, THREE.DoubleSide, 0, hit.point.y - 3.6 + .001),
      `open underside at ${angle}°, radius ${radius.toFixed(2)} m`);
    covered++;
  }
}

// Check the faces from the aisle, as well as the top surfaces above.
for (let angle = -9; angle <= 9; angle += .5) {
  for (const y of [4.85, 5.47, 6.05, 6.60, 7.06]) {
    const ray = new THREE.Ray(position(angle, CROSS_R + .01, y), position(angle, 1, 0));
    assert(deck.raycastFirst(ray, THREE.DoubleSide, 0, 6.4), `open 2F riser behind FOH at ${angle}°, height ${y} m`);
  }
}

const concourseWalls = root.getObjectByName('Concourse walls');
const isLit = (cam) => {
  bowl.update({ cam, dt: 1 });
  return concourseWalls.material.emissiveIntensity > 0;
};
const wallBvh = new MeshBVH(concourseWalls.geometry.clone());
for (const [angle] of LOWER_VOMS) {
  const floorEye = position(angle, 48, C2.y + 1.6);
  const ray = new THREE.Ray(floorEye, position(angle, 1, 0));
  assert(!wallBvh.raycastFirst(ray, THREE.DoubleSide, 0, 2.4), `blocked lower tunnel at ${angle}°`);
  assert(isLit(floorEye), `dark lower tunnel at ${angle}°`);
  assert(!isLit(position(angle, 48, 7.9)), `light activated above lower tunnel at ${angle}°`);
}
assert(!isLit(position(180.01, 53.9, 8.12)), 'light activated in the open upper pit');
assert(isLit(position(180.01, 54.25, 8.09)), 'dark behind the upper doorway');
assert(isLit(position(0, 55, C2.y + 1.6)), 'dark inside the concourse');
assert(!isLit(position(0, 43.8, 6.37)), 'light stayed on after leaving the concourse');

let seatViews = 0;
for (const mode of ['general', '360']) {
  const seats = getGymnasticSeatCatalog(mode).seats.filter((seat) => Number(seat.block) >= 23);
  for (const seat of seats) {
    const eye = new THREE.Vector3(seat.x - Math.sin(seat.yaw) * .12, seat.y + 1.2, seat.z - Math.cos(seat.yaw) * .12);
    assert(!isLit(eye), `light activated from 2F seat ${seat.block}-${seat.row}-${seat.num} (${mode})`);
    seatViews++;
  }
}

console.log(`PASS: ${covered} floor and underside samples, 2F faces behind FOH, ${LOWER_VOMS.length} open tunnels, and indoor-only lighting from ${seatViews} 2F seat views.`);
