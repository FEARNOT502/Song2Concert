import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { V3 } from './core.js';

export const CONCERT_VENUES = new Set(['arena', 'dome', 'stadium']);
let modelsPromise;

export function loadConcertModels() {
  if (!modelsPromise) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    modelsPromise = loader.loadAsync(import.meta.env.BASE_URL + 'assets/concert-equipment.glb').then(({ scene }) => {
      const models = new Map();
      scene.updateMatrixWorld(true);
      for (const model of scene.children) {
        const parts = [];
        model.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const { geometry, material, matrixWorld } = mesh;
          geometry.userData.shared = material.userData.shared = true;
          for (const value of Object.values(material)) if (value?.isTexture) value.userData.shared = true;
          geometry.computeBoundingBox();
          parts.push({ geometry, material, matrix: matrixWorld.clone() });
        });
        const bounds = new THREE.Box3().setFromObject(model);
        models.set(model.name, { parts, bounds, size: bounds.getSize(V3()), center: bounds.getCenter(V3()) });
      }
      return models;
    }).catch((error) => {
      modelsPromise = null;
      throw error;
    });
  }
  return modelsPromise;
}

export const heading = ([x, z] = [0, 1]) => Math.atan2(x, z);
const UP = V3(0, 1, 0);
export function placement(x, y, z, yaw = 0, scale = V3(1, 1, 1)) {
  return new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), scale);
}

// One instanced draw per material, even for a whole PA, perimeter or console.
export class ConcertModels {
  constructor(models, root) {
    this.models = models;
    this.root = root;
    this.static = new Map();
  }

  add(name, matrix, material) {
    const key = material || name;
    if (!this.static.has(key)) this.static.set(key, { name, material, matrices: [] });
    this.static.get(key).matrices.push(matrix);
  }

  bank(name, count, material) {
    const items = this.models.get(name).parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, material || part.material, count);
      mesh.name = name;
      mesh.userData.noCollide = true;
      this.root.add(mesh);
      return { mesh, matrix: part.matrix };
    });
    const m = new THREE.Matrix4();
    return {
      items,
      set(i, matrix) {
        for (const part of items) part.mesh.setMatrixAt(i, m.multiplyMatrices(matrix, part.matrix));
      },
      dirty() {
        for (const { mesh } of items) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      },
    };
  }

  flush() {
    for (const { name, material, matrices } of this.static.values()) {
      const bank = this.bank(name, matrices.length, material);
      matrices.forEach((matrix, i) => bank.set(i, matrix));
      bank.dirty();
    }
    this.static.clear();
  }
}

const BODIES = {
  beam: { pivot: .461, lens: .251, radius: .084 },
  spot: { pivot: .461, lens: .288, radius: .108 },
  wash: { pivot: .473, lens: .145, radius: .041 },
  par: { pivot: .245, lens: .140, radius: .112 },
};

// The authored moving heads have their mount at y=0, and their pan and tilt
// parts are exported in separate local frames. +Z is the optical axis.
export function concertFixtureBodies(models, root, fixtures) {
  const batches = new ConcertModels(models, root);
  const lensMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const color = new THREE.Color(), matrix = new THREE.Matrix4(), scale = V3(), origin = V3();
  const pan = new THREE.Quaternion(), tilt = new THREE.Quaternion(), rotation = new THREE.Quaternion();
  const X = V3(1), Z = V3(0, 0, 1);
  const inverted = new THREE.Quaternion().setFromAxisAngle(Z, Math.PI);
  const upright = new THREE.Quaternion();
  const banks = [];
  for (const [kind, { pivot, lens, radius }] of Object.entries(BODIES)) {
    const group = fixtures.filter((f) => f.body && f.kind === kind);
    if (!group.length) continue;
    const base = batches.bank(kind + '-base', group.length);
    const yoke = kind === 'par' ? null : batches.bank(kind + '-yoke', group.length);
    const head = batches.bank(kind + '-head', group.length);
    const lensGeo = new THREE.CircleGeometry(radius, 16);
    const optic = kind === 'wash' ? [
      [0, 0], ...Array.from({ length: 6 }, (_, i) => [.097 * Math.cos(i * Math.PI / 3), .097 * Math.sin(i * Math.PI / 3)]),
    ] : [[0, 0]];
    const lenses = new THREE.InstancedMesh(lensGeo, lensMat, group.length * optic.length);
    lenses.frustumCulled = false;
    lenses.setColorAt(0, new THREE.Color(0));
    root.add(lenses);
    for (const bank of [base, yoke, head]) for (const { mesh } of bank?.items ?? []) mesh.frustumCulled = false;
    group.forEach((f, i) => {
      f._lens = V3();
      base.set(i, matrix.compose(f.pos, f.hang === 'up' ? upright : inverted, scale.setScalar(f.scale)));
    });
    base.dirty();
    banks.push({ group, base, yoke, head, lenses, optic, pivot, lens });
  }
  return (master) => {
    for (const { group, base, yoke, head, lenses, optic, pivot, lens } of banks) {
      group.forEach((f, i) => {
        const floor = f.hang === 'up';
        const mount = floor ? upright : inverted;
        const x = floor ? f.dir.x : -f.dir.x, y = floor ? f.dir.y : -f.dir.y, z = f.dir.z;
        const panAngle = Math.atan2(x, z);
        const tiltAngle = -Math.atan2(y, Math.hypot(x, z));
        scale.setScalar(f.scale);
        rotation.copy(mount).multiply(pan.setFromAxisAngle(UP, panAngle));
        (yoke || base).set(i, matrix.compose(f.pos, rotation, scale));
        origin.copy(f.pos).y += (floor ? 1 : -1) * pivot * f.scale;
        rotation.multiply(tilt.setFromAxisAngle(X, tiltAngle));
        head.set(i, matrix.compose(origin, rotation, scale));
        f._lens.copy(origin).addScaledVector(f.dir, lens * f.scale);
        color.copy(f.color).multiplyScalar(.018 + f.intensity * f.level * master * 6);
        optic.forEach(([dx, dy], j) => {
          const p = V3(dx, dy, lens).multiplyScalar(f.scale).applyQuaternion(rotation).add(origin);
          lenses.setMatrixAt(i * optic.length + j, matrix.compose(p, rotation, scale));
          lenses.setColorAt(i * optic.length + j, color);
        });
      });
      (yoke || base).dirty();
      head.dirty();
      lenses.instanceMatrix.needsUpdate = lenses.instanceColor.needsUpdate = true;
    }
  };
}
