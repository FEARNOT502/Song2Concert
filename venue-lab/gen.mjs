// gen.mjs — turn the prototype's concatenated scripts into ES modules for the
// app's src/three. Every top-level declaration is exported; every identifier a
// file uses that another file declares is imported from it.
//   node gen.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const MAP = {
  'a-core.js': 'core.js',
  'b-render.js': 'render.js',
  'c-people.js': 'people.js',
  'd-rig.js': 'rig.js',
  'd3-stands.js': 'stands.js',
  'h-show.js': 'show.js',
  'x-walk.js': 'walk.js',
  'e-club.js': 'venues/club.js',
  'f-theater.js': 'venues/theater.js',
  'g-hall.js': 'venues/concerthall.js',
  'g0-lotte-data.js': 'venues/lotte-data.js',
  'g2-orchestra.js': 'venues/orchestra.js',
  'i-arena.js': 'venues/arena.js',
  'i0-ssa-data.js': 'venues/ssa-data.js',
  'j-dome.js': 'venues/dome.js',
  'j0-td-data.js': 'venues/td-data.js',
  'k-stadium.js': 'venues/stadium.js',
  'k0-wb-data.js': 'venues/wb-data.js',
};
const ADDONS = {
  EffectComposer: "three/examples/jsm/postprocessing/EffectComposer.js",
  Pass: "three/examples/jsm/postprocessing/Pass.js",
  FullScreenQuad: "three/examples/jsm/postprocessing/Pass.js",
  UnrealBloomPass: "three/examples/jsm/postprocessing/UnrealBloomPass.js",
  mergeGeometries: "three/examples/jsm/utils/BufferGeometryUtils.js",
  RectAreaLightUniformsLib: "three/examples/jsm/lights/RectAreaLightUniformsLib.js",
  RoundedBoxGeometry: "three/examples/jsm/geometries/RoundedBoxGeometry.js",
  MeshBVH: 'three-mesh-bvh',
};

// identifiers used as code: strings and comments skipped, template text
// skipped but its ${…} parts kept, property names after "." skipped
function codeIdents(src) {
  const used = new Set();
  let i = 0;
  const n = src.length;
  const stack = [];           // brace depth at which each open template resumes
  let depth = 0;
  const isId0 = (c) => /[A-Za-z_$]/.test(c), isId = (c) => /[A-Za-z0-9_$]/.test(c);
  let prevSig = '';
  const template = () => {    // scan template text from i (after `); returns at ${ or closing `
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return 'end'; }
      if (c === '$' && src[i + 1] === '{') { i += 2; return 'expr'; }
      i++;
    }
    return 'end';
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; prevSig = 'str'; continue; }
    if (c === '`') { i++; if (template() === 'expr') { stack.push(depth); depth++; } prevSig = 'str'; continue; }
    if (c === '{') { depth++; i++; prevSig = '{'; continue; }
    if (c === '}') {
      depth--; i++;
      if (stack.length && stack[stack.length - 1] === depth) { stack.pop(); if (template() === 'expr') { stack.push(depth); depth++; } }
      prevSig = '}'; continue;
    }
    if (isId0(c)) {
      let j = i; while (j < n && isId(src[j])) j++;
      const id = src.slice(i, j);
      if (prevSig !== '.') used.add(id);
      i = j; prevSig = 'id'; continue;
    }
    if (!/\s/.test(c)) prevSig = c === '.' && src[i + 1] !== '.' ? '.' : c;
    if (c === '.' && src[i + 1] === '.' && src[i + 2] === '.') { i += 3; prevSig = '...'; continue; }
    i++;
  }
  return used;
}

function topDecls(src) {
  const out = [];
  for (const m of src.matchAll(/^(?:async function|function|class|const|let) ([A-Za-z_$][A-Za-z0-9_$]*)/gm)) out.push(m[1]);
  return out;
}

const files = Object.keys(MAP).map((f) => {
  let src = fs.readFileSync(path.join('src', f), 'utf8');
  src = src.replace(/^import .*\n/gm, '');
  return { f, out: MAP[f], src, decls: topDecls(src) };
});
const owner = new Map();
for (const F of files) for (const d of F.decls) {
  if (owner.has(d)) throw new Error(`${d} declared in ${owner.get(d).f} and ${F.f}`);
  owner.set(d, F);
}
const graph = {};
for (const F of files) {
  const used = codeIdents(F.src);
  const imports = new Map();
  const addons = new Map();
  for (const id of used) {
    const o = owner.get(id);
    if (o && o !== F) { if (!imports.has(o)) imports.set(o, []); imports.get(o).push(id); }
    if (Object.hasOwn(ADDONS, id)) { if (!addons.has(ADDONS[id])) addons.set(ADDONS[id], []); addons.get(ADDONS[id]).push(id); }
  }
  graph[F.out] = [...imports.keys()].map((o) => o.out);
  const rel = (to) => { let r = path.relative(path.dirname(F.out), to); if (!r.startsWith('.')) r = './' + r; return r; };
  const lines = [];
  if (used.has('THREE')) lines.push("import * as THREE from 'three';");
  for (const [mod, ids] of [...addons].sort()) lines.push(`import { ${[...new Set(ids)].sort().join(', ')} } from '${mod}';`);
  for (const [o, ids] of [...imports].sort((a, b) => a[0].out.localeCompare(b[0].out))) lines.push(`import { ${ids.sort().join(', ')} } from '${rel(o.out)}';`);
  // exports: every top-level declaration
  let body = F.src.replace(/^(async function|function|class|const|let) /gm, 'export $1 ');
  // imports go after the file's opening comment block
  const hdr = body.match(/^(\/\/.*\n)+\n?/);
  const head = hdr ? hdr[0].replace(/\n?$/, '\n') : '';
  const rest = hdr ? body.slice(hdr[0].length) : body;
  body = head + (head ? '\n' : '') + lines.join('\n') + '\n\n' + rest.replace(/^\n+/, '');
  const dest = path.join(OUT, F.out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body.replace(/\n{3,}/g, '\n\n'));
}
// cycles
const seen = new Set();
const cyc = [];
const visit = (n, trail) => {
  if (trail.includes(n)) { cyc.push([...trail.slice(trail.indexOf(n)), n].join(' → ')); return; }
  if (seen.has(n)) return;
  seen.add(n);
  for (const m of graph[n] || []) visit(m, [...trail, n]);
};
for (const n of Object.keys(graph)) visit(n, []);
console.log('modules', Object.keys(graph).length, 'cycles', cyc.length ? cyc : 'none');
// declarations nothing else uses (candidates for dead code)
const usedAnywhere = new Set();
for (const F of files) for (const id of codeIdents(F.src)) usedAnywhere.add(`${id}`);
for (const F of files) for (const d of F.decls) {
  const others = files.filter((G) => G !== F && codeIdents(G.src).has(d)).length;
  const self = (F.src.match(new RegExp(`\\b${d.replace('$', '\\$')}\\b`, 'g')) || []).length;
  if (!others && self <= 1) console.log('unused:', F.f, d);
}
