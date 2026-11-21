// bake-gi.mjs — bake a room's indirect light (A1) into venue-lab/assets/<venue>-<mode>.gi
//
// usage (from venue-lab/, after `node build.mjs`):
//   node bake-gi.mjs <venue> <mode> [cell=1.0] [rays=128]
//
// The Lab is opened headless (its room built exactly as the app builds it);
// its surfaces and lights are sent here (src/rx/bake-export.js), the BVH is
// built once in shared memory and the probes are ray traced by one worker per
// core (bake-worker.mjs): a first bounce with every light group's direct
// light shadow-tested, then a second bounce from the first. The result is
// read by the Lab's pipeline (src/rx/gi.js). Rebake when the room changes.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { launch } from './browser.mjs';

const [,, venue = 'theater', mode = 'general', cellArg = '1.0', raysArg = '128'] = process.argv;
const CELL = +cellArg, RAYS = +raysArg;
const root = path.resolve('out');
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// ── the room, from the Lab ──
let gotBody;
const body = new Promise((r) => { gotBody = r; });
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__bake') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { gotBody(Buffer.concat(chunks)); res.writeHead(200); res.end('received'); });
    return;
  }
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => log('[pageerror]', e.message));
// (rx=0: the room as built, with none of the rx pipeline's light changes)
await page.goto(`http://127.0.0.1:${server.address().port}/test.html?${venue}&layout=${mode}&rx=0#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 900000 });
log('room built');
const sent = await page.evaluate('window.__rxExport({ url: "/__bake" })');
const buf = await body;
await browser.close();
server.close();
log('received', (buf.length / 1e6).toFixed(1), 'MB', JSON.stringify(sent).slice(0, 300));

let o = buf.byteOffset;
const ab = buf.buffer;
const u32 = (n) => { const a = new Uint32Array(ab.slice(o, o + n * 4)); o += n * 4; return a; };
const hl = u32(1)[0];
const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, o, hl)));
o += hl; o += (4 - ((4 + hl) % 4)) % 4;
const [nv, nt] = u32(2);
const shared = (Ctor, n) => { const s = new SharedArrayBuffer(n * Ctor.BYTES_PER_ELEMENT); const a = new Ctor(s); a.set(new Ctor(ab.slice(o, o + n * Ctor.BYTES_PER_ELEMENT))); o += n * Ctor.BYTES_PER_ELEMENT; return a; };
const pos = shared(Float32Array, nv * 3);
const idx = shared(Uint32Array, nt * 3);
const alb = shared(Uint8Array, nt * 3);
const flags = shared(Uint8Array, nt);
const egrp = shared(Uint8Array, nt);
log(`${nt} triangles, ${header.groups.length} groups:`, header.groups.map((g) => `${g.name}×${g.members.length}`).join(', '));

// per-triangle normals
const nrm = new Float32Array(new SharedArrayBuffer(nt * 12));
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
for (let t = 0; t < nt; t++) {
  a.fromArray(pos, idx[t * 3] * 3); b.fromArray(pos, idx[t * 3 + 1] * 3); c.fromArray(pos, idx[t * 3 + 2] * 3);
  c.sub(b); b.sub(a); c.cross(b).normalize().negate();
  nrm[t * 3] = c.x; nrm[t * 3 + 1] = c.y; nrm[t * 3 + 2] = c.z;
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setIndex(new THREE.BufferAttribute(idx, 1));
const bvh = new MeshBVH(geo, { indirect: true, useSharedArrayBuffer: true, maxLeafSize: 8 });
const ser = MeshBVH.serialize(bvh, { cloneBuffers: false });
if (ser.indirectBuffer && !(ser.indirectBuffer.buffer instanceof SharedArrayBuffer)) {
  const s = new (ser.indirectBuffer.constructor)(new SharedArrayBuffer(ser.indirectBuffer.byteLength));
  s.set(ser.indirectBuffer); ser.indirectBuffer = s;
}
log('BVH built');

// ── the probes: a grid over the room's box (and the stage house) ──
const env = header.env, bb = header.bbox;
const lo = env ? [-env.w / 2 + 0.3, 0.3, Math.max(bb[0][2], -22) + 0.3] : bb[0].map((v) => v + 0.3);
const hi = env ? [env.w / 2 - 0.3, env.h - 0.3, env.d - 0.3] : bb[1].map((v) => v - 0.3);
const dims = lo.map((l, i) => Math.max(2, Math.round((hi[i] - l) / CELL) + 1));
const cell = lo.map((l, i) => (hi[i] - l) / (dims[i] - 1));
const P = dims[0] * dims[1] * dims[2];
const G = header.groups.length;
const STRIDE = G * 24 + 1;
const grid = { dims, origin: lo, cell, offset: Math.min(...cell) * 0.45 };
log(`grid ${dims.join('×')} = ${P} probes, cell ${cell.map((v) => v.toFixed(2)).join('×')} m`);

async function runPass(pass, rays, vol1) {
  const out = new SharedArrayBuffer(P * STRIDE * 4);
  const W = Math.max(1, os.cpus().length);
  // interleaved slabs, so each worker gets some of every part of the room
  const slab = Math.ceil(P / (W * 16));
  const jobs = [];
  for (let s = 0; s * slab < P; s++) jobs.push([s * slab, Math.min(P, (s + 1) * slab)]);
  let done = 0, next = 0;
  await Promise.all(Array.from({ length: W }, (_, wi) => (async () => {
    while (next < jobs.length) {
      const range = jobs[next++];
      await new Promise((res, rej) => {
        const w = new Worker(new URL('./bake-worker.mjs', import.meta.url), {
          workerData: { pos: pos.buffer, idx: idx.buffer, nrm: nrm.buffer, alb: alb.buffer, flags: flags.buffer, egrp: egrp.buffer, bvhData: ser, groups: header.groups, grid, pass, rays, range, out, vol1, seed: (range[0] * 2654435761 + pass) >>> 0 },
        });
        w.on('message', (m) => { if (m.done) { done += range[1] - range[0]; res(); } });
        w.on('error', rej);
      });
      if (wi === 0) log(`pass ${pass}: ${(done / P * 100).toFixed(0)}%`);
    }
  })()));
  return new Float32Array(out);
}

// probes inside something (most rays met a back face) take their valid
// neighbours' light, so a surface between them does not read the dark
function dilate(V) {
  const bad = new Uint8Array(P);
  for (let i = 0; i < P; i++) bad[i] = V[i * STRIDE + G * 24] > 0.2 ? 1 : 0;
  const [nx, ny, nz] = dims;
  for (let it = 0; it < 6; it++) {
    const fixed = [];
    for (let i = 0; i < P; i++) {
      if (!bad[i]) continue;
      const x = i % nx, y = Math.floor(i / nx) % ny, z = Math.floor(i / (nx * ny));
      const nb = [];
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const X = x + dx, Y = y + dy, Z = z + dz;
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const j = (Z * ny + Y) * nx + X;
        if (!bad[j]) nb.push(j);
      }
      if (!nb.length) continue;
      for (let k = 0; k < G * 24; k++) V[i * STRIDE + k] = nb.reduce((s, j) => s + V[j * STRIDE + k], 0) / nb.length;
      fixed.push(i);
    }
    for (const i of fixed) bad[i] = 0;
    if (!fixed.length) break;
  }
  let left = 0;
  for (let i = 0; i < P; i++) if (bad[i]) { left++; for (let k = 0; k < G * 24; k++) V[i * STRIDE + k] = 0; }
  return left;
}

const v1 = await runPass(1, RAYS);
const inside = v1.reduce((s, _, i) => s + (i % STRIDE === G * 24 && v1[i] > 0.2 ? 1 : 0), 0);
const left = dilate(v1);
log(`pass 1 done; ${inside} probes inside geometry, ${left} left dark`);
const v1s = new SharedArrayBuffer(v1.byteLength); new Float32Array(v1s).set(v1);
const v2 = await runPass(2, Math.max(32, RAYS >> 1), v1s);
dilate(v2);
log('pass 2 done');

// ── write: indirect (both bounces) + the walls' direct light, half floats ──
const toHalf = (() => {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  return (v) => {
    f[0] = v; const x = u[0];
    const s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 127 + 15; let m = x & 0x7fffff;
    if (e <= 0) { if (e < -10) return s; m = (m | 0x800000) >> (1 - e); return s | ((m + 0x1000) >> 13); }
    if (e >= 31) return s | 0x7bff;
    const h = s | (e << 10) | ((m + 0x1000) >> 13);
    return h;
  };
})();
const [nx, ny, nz] = dims;
const data = new Uint16Array(G * 3 * P * 4);
let maxA = 0;
for (let g = 0; g < G; g++) for (let ch = 0; ch < 3; ch++) for (let i = 0; i < P; i++) {
  for (let k = 0; k < 4; k++) {
    const oi = g * 12 + ch * 4 + k;
    const v = v1[i * STRIDE + oi] + v1[i * STRIDE + G * 12 + oi] + v2[i * STRIDE + oi];
    if (k === 0) maxA = Math.max(maxA, v);
    data[(((g * 3 + ch) * nz) * ny * nx + i) * 4 + k] = toHalf(v);
  }
}
const outHeader = {
  version: 1, venue, mode, dims, origin: lo, cell, offset: grid.offset, rays: RAYS,
  groups: header.groups.map((g) => ({ kind: g.kind, name: g.name, rep: { type: g.rep.type, pos: g.rep.pos }, members: g.members.length })),
  baked: new Date().toISOString(),
};
const hj = new TextEncoder().encode(JSON.stringify(outHeader));
const pad = (4 - ((8 + hj.length) % 4)) % 4;
const file = Buffer.concat([Buffer.from('RXGI'), Buffer.from(new Uint32Array([hj.length]).buffer), Buffer.from(hj), Buffer.alloc(pad), Buffer.from(data.buffer)]);
fs.mkdirSync('assets', { recursive: true });
const outPath = path.join('assets', `${venue}-${mode}.gi`);
fs.writeFileSync(outPath, file);
log(`wrote ${outPath} (${(file.length / 1e6).toFixed(1)} MB), max irradiance term ${maxA.toFixed(3)}`);
