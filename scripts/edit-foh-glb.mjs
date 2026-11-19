// edit-foh-glb.mjs — the FOH's lighting monitors, edited in place in
// public/assets/concert-equipment.glb (run once; it refuses a file it has
// already edited):
//
//   node scripts/edit-foh-glb.mjs
//
// - The lighting console's monitor moves left along the desk, and a 4:3 copy
//   of it stands to its right for the fan-light map ("Fan map display").
// - The left camera's viewfinder and tally lamp on the FOH's upper deck get
//   their own materials ("Camera viewfinder live", "CAM 1 tally lamp"), so the
//   app can show the programme feed there when CAM 1 is taken.
//
// Geometry is picked by region in the FOH's own frame (metres; +x right, -z
// towards the stage, the operator looking down -z), so the monitor's bezel,
// stand and screen move together even though the exporter merged them with the
// desk by material. Picked triangles get their own copies of their vertices
// before they move, so nothing outside the region is dragged with them.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const FILE = new URL('../public/assets/concert-equipment.glb', import.meta.url).pathname;

// the lighting monitor (bezel, stand, screen), clear of the desk and its neighbours
const MONITOR = { x: [0.5, 1.8], y: [1.70, 2.25], z: [-1.05, -0.78] };
const MONITOR_CX = 1.157;               // its screen's centre
const LEFT_DX = 0.88 - MONITOR_CX;      // moved left along the desk
const MAP_CX = 1.85;                    // the new monitor's centre
const MAP_SX = 0.455;                   // its width as a share of the old: a 4:3 screen at the same height

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(FILE);
const root = doc.getRoot();
if (root.listMaterials().some((m) => m.getName() === 'Fan map display')) {
  console.error('already edited: Fan map display exists');
  process.exit(1);
}
await doc.transform(dequantize());

const foh = root.getDefaultScene().listChildren().find((n) => n.getName() === 'foh');
const node = foh.listChildren()[0];
const prims = node.getMesh().listPrimitives();
const M = node.getWorldMatrix();
const s = M[0], tx = M[12], ty = M[13], tz = M[14];   // uniform scale, no rotation (checked below)
if (Math.abs(M[5] - s) > 1e-9 || Math.abs(M[10] - s) > 1e-9 || M[1] || M[2] || M[4] || M[6] || M[8] || M[9]) {
  throw new Error('the FOH mesh node is expected to be scale + translation only');
}
const toWorld = ([x, y, z]) => [x * s + tx, y * s + ty, z * s + tz];
const toLocal = ([x, y, z]) => [(x - tx) / s, (y - ty) / s, (z - tz) / s];
const inside = (box, [x, y, z]) => x >= box.x[0] && x <= box.x[1] && y >= box.y[0] && y <= box.y[1] && z >= box.z[0] && z <= box.z[1];

// The triangles of `prim` whose three corners pass `test` (world positions).
function pick(prim, test) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
  const tris = [];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const v = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
    if (v.every((i) => test(toWorld(pos.getElement(i, []))))) tris.push(t);
  }
  return tris;
}

// Appends copies of the picked triangles' vertices, mapped through `move`
// (world position → world position, with the x scale for the normals), and
// either re-points those triangles at them (move) or adds new triangles (copy).
function relocate(prim, tris, move, { copy = false, sx = 1 } = {}) {
  const idx = prim.getIndices();
  const sems = prim.listSemantics();
  const remap = new Map();
  const add = (i) => {
    if (remap.has(i)) return remap.get(i);
    const n = prim.getAttribute('POSITION').getCount();
    for (const sem of sems) {
      const a = prim.getAttribute(sem);
      const arr = a.getArray();
      const size = a.getElementSize();
      const out = new arr.constructor(arr.length + size);
      out.set(arr);
      const el = a.getElement(i, []);
      if (sem === 'POSITION') el.splice(0, 3, ...toLocal(move(toWorld(el))));
      if (sem === 'NORMAL') {
        const nx = el[0] / sx, ny = el[1], nz = el[2], l = Math.hypot(nx, ny, nz) || 1;
        el.splice(0, 3, nx / l, ny / l, nz / l);
      }
      out.set(el, n * size);
      a.setArray(out);
    }
    remap.set(i, n);
    return n;
  };
  // (always 32-bit while editing: the copies can run the count past 65535;
  // the encoder packs it down again)
  const next = Uint32Array.from(idx.getArray());
  const added = [];
  for (const t of tris) {
    const v = [next[t], next[t + 1], next[t + 2]].map(add);
    if (copy) added.push(...v);
    else { next[t] = v[0]; next[t + 1] = v[1]; next[t + 2] = v[2]; }
  }
  const out = new Uint32Array(next.length + added.length);
  out.set(next);
  out.set(added, next.length);
  idx.setArray(out);
}

// Splits the picked triangles off into a new primitive with its own material.
function split(prim, tris, material) {
  const next = prim.clone();
  next.setIndices(prim.getIndices().clone().setArray(new Uint32Array(tris.flatMap((t) => [0, 1, 2].map((k) => prim.getIndices().getScalar(t + k))))));
  next.setMaterial(material);
  const keep = [];
  const idx = prim.getIndices();
  const picked = new Set(tris);
  for (let t = 0; t < idx.getCount(); t += 3) if (!picked.has(t)) keep.push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
  idx.setArray(new Uint32Array(keep));
  node.getMesh().addPrimitive(next);
  return next;
}

// ── the lighting monitors ──
let moved = 0, copied = 0, mapPrim = null;
for (const prim of prims) {
  const tris = pick(prim, (p) => inside(MONITOR, p));
  if (!tris.length) continue;
  const name = prim.getMaterial().getName();
  if (name === 'Cue stack monitor') {
    // the new monitor's screen is a primitive of its own, with its own material
    const screen = prim.clone();
    for (const sem of screen.listSemantics()) screen.setAttribute(sem, prim.getAttribute(sem).clone());
    screen.setIndices(prim.getIndices().clone());
    const mat = prim.getMaterial().clone().setName('Fan map display')
      .setBaseColorTexture(null).setEmissiveTexture(null)
      .setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([0, 0, 0]);
    screen.setMaterial(mat);
    node.getMesh().addPrimitive(screen);
    relocate(screen, pick(screen, () => true), ([x, y, z]) => [MAP_CX + (x - MONITOR_CX) * MAP_SX, y, z], { sx: MAP_SX });
    mapPrim = screen;
  } else {
    relocate(prim, tris, ([x, y, z]) => [MAP_CX + (x - MONITOR_CX) * MAP_SX, y, z], { copy: true, sx: MAP_SX });
    copied += tris.length;
  }
  relocate(prim, tris, ([x, y, z]) => [x + LEFT_DX, y, z]);
  moved += tris.length;
}
if (!mapPrim) throw new Error('no Cue stack monitor found');

// ── CAM 1 (the left camera on the upper deck): its own viewfinder and tally ──
for (const [matName, newName] of [['Camera viewfinder preview', 'Camera viewfinder live'], ['Live red tally lamp', 'CAM 1 tally lamp']]) {
  const prim = prims.find((p) => p.getMaterial().getName() === matName);
  const tris = pick(prim, ([x, y]) => x < 0 && y > 4);
  if (!tris.length) throw new Error('nothing left of centre for ' + matName);
  split(prim, tris, prim.getMaterial().clone().setName(newName));
  console.log(`${newName}: ${tris.length} triangles`);
}

console.log(`monitor: ${moved} triangles moved left, ${copied} copied for the map monitor`);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(FILE, doc);
console.log('written', FILE);
