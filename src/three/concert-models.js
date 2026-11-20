import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { V3 } from './core.js';

export const CONCERT_VENUES = new Set(['arena', 'dome', 'stadium']);
let modelsPromise, theaterModelsPromise, theaterLabPromise;
const SHADOW_CASTERS = new Set([
  'drums', 'keyboard', 'mic', 'wedge', 'fender', 'vox', 'fender-extension', 'vox-extension',
  'touring-rack', 'flight-case', 'prompter', 'foh', 'camera', 'jib', 'jib-head',
  'theater-guitar', 'theater-bass', 'theater-amp-isolator', 'theater-pedalboard', 'theater-di',
]);

function satinInstrument(material) {
  const satin = new THREE.MeshPhysicalMaterial();
  const defines = satin.defines;
  THREE.MeshStandardMaterial.prototype.copy.call(satin, material);
  satin.defines = defines;
  satin.roughness = Math.max(.74, material.roughness);
  satin.metalness = Math.min(.12, material.metalness);
  satin.specularIntensity = .20;
  if (Math.max(satin.color.r, satin.color.g, satin.color.b) > .3) satin.color.multiplyScalar(.75);
  return satin;
}

async function loadScene(asset) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const { scene } = await loader.loadAsync(import.meta.env.BASE_URL + 'assets/' + asset);
  return scene;
}

async function loadModels(asset) {
  const scene = await loadScene(asset);
  const models = new Map();
  scene.updateMatrixWorld(true);
  for (const model of scene.children) {
    const parts = [];
    const instrument = model.name === 'drums' || model.name === 'keyboard';
    model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const { geometry, matrixWorld } = mesh;
      const material = instrument && mesh.material.isMeshStandardMaterial ? satinInstrument(mesh.material) : mesh.material;
      geometry.userData.shared = material.userData.shared = true;
      for (const value of Object.values(material)) if (value?.isTexture) value.userData.shared = true;
      geometry.computeBoundingBox();
      parts.push({ geometry, material, matrix: matrixWorld.clone() });
    });
    const bounds = new THREE.Box3().setFromObject(model);
    models.set(model.name, { parts, bounds, size: bounds.getSize(V3()), center: bounds.getCenter(V3()) });
  }
  return models;
}

export function loadConcertModels() {
  if (!modelsPromise) {
    modelsPromise = loadModels('concert-equipment.glb?v=2').catch((error) => {
      modelsPromise = null;
      throw error;
    });
  }
  return modelsPromise;
}

export function loadTheaterModels() {
  if (!theaterModelsPromise) {
    theaterModelsPromise = loadModels('theater-backline.glb').catch((error) => {
      theaterModelsPromise = null;
      throw error;
    });
  }
  return Promise.all([loadConcertModels(), theaterModelsPromise]).then(([shared, theater]) => new Map([...shared, ...theater]));
}

export function loadTheaterLab() {
  if (!theaterLabPromise) {
    theaterLabPromise = loadScene('theater-lab.glb').then((scene) => {
      scene.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.userData.noCollide = true;
        mesh.geometry.userData.shared = mesh.material.userData.shared = true;
        mesh.receiveShadow = true;
      });
      return scene;
    }).catch((error) => {
      theaterLabPromise = null;
      throw error;
    });
  }
  return theaterLabPromise;
}

export const heading = ([x, z] = [0, 1]) => Math.atan2(x, z);
const UP = V3(0, 1, 0);
export function placement(x, y, z, yaw = 0, scale = V3(1, 1, 1)) {
  return new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), scale);
}

export function addModelArray(batch, { x, y, z, boxes, width = 1.3, yaw = 0, splay = .035, depth = .7, height = .38 }, key = 'line-array') {
  const model = batch.models.get(key);
  const scale = V3(width / model.size.x, height * .985 / model.size.y, depth / model.size.z);
  const raw = (boxes - 1) * splay + splay * .22 * (boxes - 1) * (boxes - 2) / 2;
  const cap = Math.min(1, .85 / Math.max(raw, .001));
  const holder = placement(x, y, z, yaw);
  const rotation = new THREE.Quaternion(), axis = V3(1);
  let down = 0, angle = 0, back = 0;
  for (let i = 0; i < boxes; i++) {
    rotation.setFromAxisAngle(axis, angle);
    const offset = V3(0, -height - model.bounds.min.y * scale.y).applyQuaternion(rotation);
    const part = new THREE.Matrix4().compose(offset.add(V3(0, down, back)), rotation, scale);
    batch.add(key, part.premultiply(holder));
    down -= Math.cos(angle) * height;
    back -= Math.sin(angle) * height;
    angle += (splay + i * splay * .22) * cap;
  }
  batch.add(key + '-bar', placement(x, y + .013, z, yaw, V3(scale.x, 1, scale.z)));
}

// The authored capsule points towards the singer, with the grille 1.48 m high.
const MIC_AXIS = V3(.31, .20, .93).normalize();
const MIC_GRILLE = V3(.286, 1.725, .389).addScaledVector(MIC_AXIS, .095);
export function wirelessMicMount(facing) {
  const yaw = facing + Math.PI - Math.atan2(MIC_AXIS.x, MIC_AXIS.z);
  return {
    yaw,
    scale: V3(1, 1.48 / MIC_GRILLE.y, 1),
    singer: MIC_GRILLE.clone().addScaledVector(MIC_AXIS, .24).applyAxisAngle(UP, yaw),
  };
}

export function mountEquipmentContactShadows(group, footprints) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `
      varying vec2 footprint;
      void main() {
        footprint = abs(uv * 2.0 - 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 footprint;
      void main() {
        vec2 rounded = max(footprint - 0.26, 0.0) / 0.74;
        float shade = 1.0 - smoothstep(0.22, 1.0, length(rounded));
        gl_FragColor = vec4(0.005, 0.005, 0.007, shade * 0.47);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, footprints.length);
  mesh.name = 'Equipment contact shadows';
  mesh.userData.noCollide = true;
  footprints.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  group.add(mesh);
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
      mesh.receiveShadow = mesh.material.isMeshStandardMaterial;
      mesh.castShadow = mesh.receiveShadow && SHADOW_CASTERS.has(name);
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
