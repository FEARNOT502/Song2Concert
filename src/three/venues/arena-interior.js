import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, concreteTex, std, withRepeat } from '../core.js';
import { vomSignTexture } from '../stands.js';

// The community arena is on the positive-x side of the main arena in the
// operator's 1F and 3F plans. The joints follow the returns on that side.
const MOVING_BLOCK_JOINT = 45;

function box(parts, w, h, d, x, y, z, yaw = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (yaw) geometry.rotateY(yaw);
  geometry.translate(x, y, z);
  parts.push(geometry.toNonIndexed());
  geometry.dispose();
}

function addParts(root, name, parts, material) {
  if (!parts.length) return;
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  for (const part of parts) part.dispose();
  mesh.name = name;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

// The facets and their downlights sit on the bowl side of the structural wall.
// The 400-level door heads and the passage behind the wall stay clear.
export function arenaAcousticWalls(root, walls, frames, oz, pipe) {
  if (!walls?.length) return [];
  const positions = [], colors = [], fittings = [], lamps = [];
  const shades = [new THREE.Color(0x7c7c78), new THREE.Color(0x626563)];
  const endDoors = frames.filter((f) => f.label.startsWith('4'));
  function addFace(a, b, c, shade) {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(shade.r, shade.g, shade.b);
  }
  for (const [x0, z0, x1, z1, bottom, top] of walls) {
    const dx = x1 - x0, dz = z1 - z0, length = Math.hypot(dx, dz);
    const count = Math.max(1, Math.round(length / 2.45));
    const nx = dz / length, nz = -dx / length;
    const at = (t, y, d = 0.035) => [x0 + dx * t + nx * d, y, oz + z0 + dz * t + nz * d];
    if (top >= 29) {
      const height = Math.max(top - 5.4, 24.5), margin = Math.min(0.012 / length, 0.01);
      for (let i = 0; i < count; i++) {
        const l = i / count + margin, r = (i + 1) / count - margin;
        const a = at(l, height, 0.065), b = at(r, height, 0.065);
        const c = at(r, top - 0.035, 0.065), d = at(l, top - 0.035, 0.065);
        addFace(a, b, c, shades[1]);
        addFace(a, c, d, shades[1]);
      }
      continue;
    }
    const soffit = Math.min(top, 20.6) - 0.08;
    for (let i = 0; i < count; i++) {
      const m = (i + 0.5) / count;
      const xM = x0 + m * dx, zM = z0 + m * dz;
      let apex = Math.max(bottom + 2.95, soffit - 1.86);
      for (const door of endDoors) {
        if (Math.hypot(door.x - xM, door.z - zM) < length / count / 2 + 1.15) {
          apex = Math.max(apex, door.y + door.h + 0.24);
        }
      }
      if (soffit - apex < 0.5) continue;
      const a = at(i / count, soffit), b = at((i + 1) / count, soffit);
      const ridge = at(m, soffit, 0.4), tip = at(m, apex);
      addFace(a, tip, ridge, shades[0]);
      addFace(ridge, tip, b, shades[1]);
      const [x, y, z] = at(m, soffit, 0.56);
      box(fittings, 0.35, 0.09, 0.19, x, y, z, Math.atan2(-dz, dx));
      lamps.push(pipe.flares.add(V3(x, y - 0.075, z), KELVIN(3800), 0.28, 0));
    }
  }
  if (positions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const finish = new THREE.Mesh(geometry, std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.94 }));
    finish.name = '400 level acoustic wall facets';
    finish.receiveShadow = true;
    root.add(finish);
  }
  addParts(root, '400 level wall downlights', fittings, std({ color: 0x383b3d, roughness: 0.78 }));
  return lamps;
}

export function arenaMovingBlockJoint(root, walls, oz, y) {
  const faces = [], seals = [];
  for (const [x0, z0, x1, z1, bottom, top] of walls) {
    if (top < 22.6 || Math.abs(bottom - 15.85) > 0.01 || (x0 < MOVING_BLOCK_JOINT) === (x1 < MOVING_BLOCK_JOINT)) continue;
    const dx = x1 - x0, dz = z1 - z0, length = Math.hypot(dx, dz);
    const f = (MOVING_BLOCK_JOINT - x0) / dx, x = MOVING_BLOCK_JOINT, z = z0 + f * dz + oz;
    if (Math.abs(z - oz) < 37) continue;
    const yaw = Math.atan2(-dz, dx);
    const base = 20.55, h = top - base, nx = dz / length, nz = -dx / length;
    for (const offset of [-0.155, 0.155]) {
      box(faces, 0.15, h, 0.15, x + nx * 0.12 + offset * dx / length, base + h / 2, z + nz * 0.12 + offset * dz / length, yaw);
    }
    box(seals, 0.16, h, 0.09, x + nx * 0.09, base + h / 2, z + nz * 0.09, yaw);
    if (top === y) {
      const outerZ = oz + Math.sign(z - oz) * 64;
      box(seals, 0.26, 0.12, Math.abs(outerZ - z), x, top - 0.04, (z + outerZ) / 2);
    }
  }
  addParts(root, 'Moving block joint covers', faces, std({ color: 0x555657, roughness: 0.83 }));
  addParts(root, 'Moving block seals', seals, std({ color: 0x313335, roughness: 0.92 }));
}

export function arenaLounge(root, oz, level) {
  const shell = [], trim = [], glass = [], shades = [], lights = [];
  // The operator's 3F plan places the continuous window opposite the suites,
  // along the main-arena face of the moving block.
  const xf = 55.1, xb = 61.8, half = 35.5, ceiling = level + 2.56;
  const sill = level + 0.83, head = ceiling - 0.48;
  box(shell, xb - xf, 0.27, 2 * half, (xf + xb) / 2, level - 0.135, oz);
  box(shell, xb - xf, 0.21, 2 * half, (xf + xb) / 2, ceiling + 0.105, oz);
  box(shell, 0.19, ceiling - level, 2 * half, xb, (ceiling + level) / 2, oz);
  for (const side of [-1, 1]) box(shell, xb - xf, ceiling - level, 0.19, (xf + xb) / 2, (ceiling + level) / 2, oz + side * half);
  box(shell, 0.23, sill - level, 2 * half, xf, (sill + level) / 2, oz);
  box(shell, 0.23, ceiling - head, 2 * half, xf, (ceiling + head) / 2, oz);
  const bays = 14, pitch = 2 * half / bays;
  for (let i = 0; i < bays; i++) {
    const z = oz - half + (i + 0.5) * pitch;
    box(glass, 0.02, head - sill, pitch - 0.09, xf, (sill + head) / 2, z);
    box(shades, 0.012, head - sill, pitch - 0.07, xf + 0.12, (sill + head) / 2, z);
    box(trim, 0.16, head - sill, 0.09, xf, (sill + head) / 2, z - pitch / 2);
    box(lights, 0.23, 0.037, 0.13, xf + 0.88, ceiling - 0.025, z);
  }
  box(trim, 0.16, head - sill, 0.09, xf, (sill + head) / 2, oz + half);
  for (const y of [sill, head]) box(trim, 0.25, 0.071, 2 * half, xf, y, oz);
  addParts(root, '3F lounge shell', shell, std({ color: 0x89816f, roughness: 0.92 }));
  addParts(root, '3F lounge window frames', trim, std({ color: 0x303337, roughness: 0.61, metalness: 0.24 }));
  addParts(root, '3F lounge panoramic glazing', glass, new THREE.MeshPhysicalMaterial({
    color: 0x536269, roughness: 0.3, specularIntensity: 0.6, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  const roller = addParts(root, '3F lounge roller shades', shades, std({ color: 0x232426, roughness: 1 }));
  roller.userData.noCollide = true;
  roller.visible = false;
  const lighting = addParts(root, '3F lounge downlights', lights, std({ color: 0x6e644b, emissive: 0xe0b36c, emissiveIntensity: 0.56 }));
  return (house) => {
    roller.visible = house < 0.35;
    lighting.material.emissiveIntensity = 0.56 * house;
  };
}

export function arenaCeiling(root, pipe, { x0, x1, z0, z1, oz, y }) {
  const panels = [], fixed = [], steel = [], hooks = [], lights = [];
  // MHI lists 42 suspended units. This six-by-seven layout follows the
  // rectangular central field in the section and house-light photographs.
  const across = 6, along = 7, halfWidth = 39, halfLength = 44;
  const dx = 2 * halfWidth / across, dz = 2 * halfLength / along;
  const za = oz - halfLength, zb = oz + halfLength;
  const seam = 0.42;
  const rim = (a, b, c, d) => box(fixed, b - a, 0.42, d - c, (a + b) / 2, y + 0.21, (c + d) / 2);
  rim(x0, -halfWidth, z0, z1);
  rim(halfWidth, x1, z0, z1);
  rim(-halfWidth, halfWidth, z0, za);
  rim(-halfWidth, halfWidth, zb, z1);

  for (let i = 0; i < across; i++) {
    const x = -halfWidth + (i + 0.5) * dx;
    for (let j = 0; j < along; j++) {
      const z = za + (j + 0.5) * dz;
      box(panels, dx - seam, 0.36, dz - seam, x, y + 0.18, z);
      for (const side of [-1, 1]) {
        const xL = x + side * 0.32 * dx;
        box(steel, 0.28, 0.10, dz - seam, xL, y + 0.015, z);
        for (const offset of [-0.27, 0.27]) {
          lights.push(pipe.flares.add(V3(xL, y - 0.08, z + offset * dz), KELVIN(4200), 0.64, 0));
        }
      }
    }
  }
  for (let i = 0; i <= across; i++) {
    const x = -halfWidth + i * dx;
    box(steel, 0.23, 0.18, zb - za, x, y + 0.26, oz);
    for (let j = 0; j < along; j++) {
      const z = za + (j + 0.5) * dz;
      for (const offset of [-0.26, 0.26]) box(hooks, 0.14, 0.42, 0.16, x, y - 0.08, z + offset * dz);
    }
  }
  for (let j = 0; j <= along; j++) {
    box(steel, 2 * halfWidth, 0.20, 0.22, 0, y + 0.25, za + j * dz);
  }
  for (const side of [-1, 1]) {
    for (const x of [side * 46, side * 57, side * 65]) {
      box(steel, 0.2, 0.23, z1 - z0, x, y + 0.03, oz);
      for (let z = z0 + 11; z < z1 - 4; z += 10) {
        lights.push(pipe.flares.add(V3(x, y - 0.11, z), KELVIN(4200), 0.56, 0));
      }
    }
    const z = oz + side * 55;
    box(steel, 2 * halfWidth, 0.23, 0.22, 0, y + 0.025, z);
    for (let x = -33; x <= 33; x += 8.25) lights.push(pipe.flares.add(V3(x, y - 0.11, z), KELVIN(4200), 0.56, 0));
  }

  const panelMat = std({ color: 0x21252a, roughness: 0.87, emissive: 0x434a50, emissiveIntensity: 0.17 });
  const fixedMat = std({ color: 0x29292a, roughness: 0.92, emissive: 0x3e4145, emissiveIntensity: 0.1 });
  const steelMat = std({ color: 0x363b41, roughness: 0.66, metalness: 0.44, emissive: 0x4c5560, emissiveIntensity: 0.19 });
  const slab = addParts(root, 'Movable arena ceiling', panels, panelMat);
  slab.userData.beamStop = true;
  slab.userData.panelCount = across * along;
  addParts(root, 'Fixed seating ceiling', fixed, fixedMat);
  const above = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std({ color: 0x0b0c0e, roughness: 1, side: THREE.DoubleSide }));
  above.name = 'Arena ceiling plenum';
  above.rotation.x = Math.PI / 2;
  above.position.set(0, y + 3.05, oz);
  root.add(above);
  addParts(root, 'Ceiling suspension rails', steel, steelMat);
  addParts(root, 'Arena rigging points', hooks, std({ color: 0x434851, roughness: 0.54, metalness: 0.62 }));
  return { lights, update(house) {
    panelMat.emissiveIntensity = 0.018 + 0.15 * house;
    fixedMat.emissiveIntensity = 0.013 + 0.085 * house;
    steelMat.emissiveIntensity = 0.022 + 0.167 * house;
  } };
}

export function arenaFloor(root, tunnels, { x0, x1, z0, z1, oz }) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std({
    ...withRepeat(concreteTex({ key: 'arenafloor', tone: 0.1, even: 0.8 }), (x1 - x0) / 4, (z1 - z0) / 4),
    color: 0x55575c, roughness: 0.92,
  }));
  floor.name = 'Continuous arena floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, oz);
  floor.receiveShadow = true;
  root.add(floor);

  // The lowered Lambda pit is closed for these concert layouts. Its join
  // line is flush with the surrounding arena floor and corner approaches.
  const skin = new THREE.Mesh(new THREE.PlaneGeometry(51.6, 81.9), std({
    ...withRepeat(concreteTex({ key: 'arenafloor', tone: 0.1, even: 0.8 }), 12.9, 20.5),
    color: 0x626568, roughness: 0.92,
  }));
  skin.name = 'Lambda floor in concert position';
  skin.rotation.x = -Math.PI / 2;
  skin.position.set(0, 0.012, oz);
  skin.receiveShadow = true;
  skin.userData.noCollide = true;
  root.add(skin);
  const joints = [], collars = [], leaves = [];
  for (const x of [-25.8, 25.8]) box(joints, 0.045, 0.007, 82, x, 0.016, oz);
  for (const z of [oz - 40.95, oz + 40.95]) box(joints, 51.6, 0.007, 0.045, 0, 0.016, z);
  for (const t of tunnels.filter((item) => item.covered)) {
    const [ux, uz] = t.u, yaw = Math.atan2(ux, uz);
    const width = t.w - 2 * (t.T ?? 0.3);
    const at = (along, side) => [t.p[0] + ux * along - uz * side, oz + t.p[1] + uz * along + ux * side];
    const across = (parts, w, h, d, along, side, y) => {
      const [x, z] = at(along, side);
      box(parts, w, h, d, x, y, z, yaw);
    };
    for (const side of [-1, 1]) {
      across(collars, 0.15, t.h, 0.20, -0.34, side * (width / 2 + 0.075), t.h / 2);
    }
    across(collars, width + 0.3, 0.16, 0.2, -0.34, 0, t.h + 0.06);
    across(joints, width, 0.006, 0.12, -0.57, 0, 0.008);
    if (t.closed) {
      // The interior landings stop at their paired leaves. The wayfinding
      // signs name the public approaches on the other side of the passage.
      const end = t.L - 0.36;
      for (const side of [-1, 1]) {
        across(leaves, width / 2 - 0.07, t.h - 0.16, 0.08, end, side * width / 4, (t.h - 0.16) / 2);
        across(collars, 0.09, t.h, 0.12, end - 0.035, side * width / 2, t.h / 2);
      }
      across(collars, width, 0.13, 0.12, end - 0.035, 0, t.h - 0.055);
      const gate = t.p[0] > 0 ? (t.p[1] < 0 ? 'S1' : 'S2') : (t.p[1] > 0 ? 'W' : null);
      if (gate) {
        const [x, z] = at(end - 0.10, 0);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.36), new THREE.MeshBasicMaterial({
          map: vomSignTexture(`${gate} GATE`), side: THREE.FrontSide,
        }));
        sign.position.set(x, t.h - 0.26, z);
        sign.rotation.y = yaw + Math.PI;
        sign.userData.noCollide = true;
        root.add(sign);
      }
    }
  }
  const joint = addParts(root, 'Floor movement joints', joints, std({ color: 0x3e4141, roughness: 0.74 }));
  joint.userData.noCollide = true;
  addParts(root, 'Arena floor portal frames', collars, std({ color: 0x666a68, roughness: 0.86 }));
  addParts(root, 'Arena floor gate leaves', leaves, std({ color: 0x474b49, roughness: 0.85 }));
}
