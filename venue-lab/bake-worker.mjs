// One worker of the GI bake (bake-gi.mjs): a share of the probes, ray traced
// against the room's BVH (shared memory, built once by the main thread).
//
// pass 1: each probe sends `rays` rays out; where one meets a surface, that
//         surface's light toward the probe is its albedo/π × what each group's
//         lights put on it directly (shadow-tested; an LED wall sampled over
//         its area). A ray that meets an LED wall's face sees the wall itself
//         (kept apart: the wall's direct light). Rays that meet the back of a
//         one-sided surface mark the probe as inside something.
// pass 2: the same, a bounce on: the surface's light is its albedo/π × the
//         pass-1 volume's irradiance there.
// Every probe's result is first-order spherical harmonics of the light coming
// in, per group, per channel, convolved to irradiance: E(n) = a + b·n.
import { parentPort, workerData } from 'node:worker_threads';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const { pos, idx, nrm, alb, flags, egrp, bvhData, groups, grid, pass, rays, range, out, vol1, seed } = workerData;
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
const bvh = MeshBVH.deserialize(bvhData, geo, { setIndex: false });
const N = new Float32Array(nrm), A = new Uint8Array(alb), F = new Uint8Array(flags), EG = new Uint8Array(egrp);
const OUT = new Float32Array(out);
const V1 = vol1 ? new Float32Array(vol1) : null;
const G = groups.length;
const [nx, ny, nz] = grid.dims, [ox, oy, oz] = grid.origin, [cx, cy, cz] = grid.cell;
// per probe: indirect (groups × rgb × 4), the LED walls' direct light (the
// same), then the share of rays that met a back face
const STRIDE = G * 24 + 1;

let s0 = seed >>> 0 || 1;
const rnd = () => { s0 ^= s0 << 13; s0 >>>= 0; s0 ^= s0 >>> 17; s0 ^= s0 << 5; s0 >>>= 0; return s0 / 4294967296; };

// the ray directions: a Fibonacci sphere, turned at random for each probe
const fib = [];
for (let i = 0; i < rays; i++) {
  const y = 1 - (2 * (i + 0.5)) / rays, r = Math.sqrt(1 - y * y), t = i * 2.399963229728653;
  fib.push([Math.cos(t) * r, y, Math.sin(t) * r]);
}
const albedo = (t, c) => { const v = A[t * 3 + c] / 255; return v * v; };

const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
const sray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
function blocked(x, y, z, dx, dy, dz, far) {
  if (far <= 0.02) return false;
  sray.origin.set(x, y, z); sray.direction.set(dx, dy, dz);
  return !!bvh.raycastFirst(sray, THREE.DoubleSide, 0.002, far);
}

// a group's direct irradiance at a point (white light; the members at their
// strengths relative to the group's own)
const lightGroups = groups.map((g) => g.members.map((m) => ({
  ...m,
  cosO: m.angle != null ? Math.cos(m.angle) : -2,
  cosI: m.angle != null ? Math.cos(m.angle * (1 - (m.penumbra ?? 0))) : -2,
})));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function directE(gi, x, y, z, n0, n1, n2) {
  const g = groups[gi];
  let E = 0;
  if (g.kind === 'screen') {
    const m = g.rep, [px, py, pz] = m.pos, [nX, nY, nZ] = m.normal, [rX, rY, rZ] = m.right, [uX, uY, uZ] = m.up;
    const area = m.w * m.h, S = 3;
    for (let s = 0; s < S; s++) {
      const u = rnd() - 0.5, v = rnd() - 0.5;
      const sx = px + rX * u * m.w + uX * v * m.h, sy = py + rY * u * m.w + uY * v * m.h, sz = pz + rZ * u * m.w + uZ * v * m.h;
      let dx = sx - x, dy = sy - y, dz = sz - z;
      const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
      dx /= d; dy /= d; dz /= d;
      const cx_ = dx * n0 + dy * n1 + dz * n2, cs = -(dx * nX + dy * nY + dz * nZ);
      if (cx_ <= 0 || cs <= 0) continue;
      const e = area * cx_ * cs / Math.max(d2, area * 0.05) / S;
      if (e < 1e-6) continue;
      if (!blocked(x, y, z, dx, dy, dz, d - 0.08)) E += e;
    }
    return E;
  }
  for (const m of lightGroups[gi]) {
    let dx = m.pos[0] - x, dy = m.pos[1] - y, dz = m.pos[2] - z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (r < 1e-3) continue;
    dx /= r; dy /= r; dz /= r;
    const ndl = dx * n0 + dy * n1 + dz * n2;
    if (ndl <= 0) continue;
    let att = 1 / Math.max(Math.pow(r, m.decay ?? 2), 0.01);
    if (m.distance > 0) { const q = Math.min(1, Math.max(0, 1 - Math.pow(r / m.distance, 4))); att *= q * q; }
    if (m.dir) att *= smooth(m.cosO, m.cosI, -(dx * m.dir[0] + dy * m.dir[1] + dz * m.dir[2]));
    const u = (m.k ?? 1) * att * ndl;
    if (u < 1e-6) continue;
    // stop short of the fixture the light hangs in
    if (!blocked(x, y, z, dx, dy, dz, r - 0.3)) E += u;
  }
  return E;
}

// pass 1's volume, sampled (trilinear) for pass 2: a group's irradiance at a
// point for a surface facing n, per channel
function volE(gi, c, x, y, z, n0, n1, n2) {
  let fx = (x - ox) / cx, fy = (y - oy) / cy, fz = (z - oz) / cz;
  if (fx < 0 || fy < 0 || fz < 0 || fx > nx - 1 || fy > ny - 1 || fz > nz - 1) return 0;
  const x0 = Math.min(nx - 2, Math.floor(fx)), y0 = Math.min(ny - 2, Math.floor(fy)), z0 = Math.min(nz - 2, Math.floor(fz));
  const tx = fx - x0, ty = fy - y0, tz = fz - z0;
  let e = 0;
  for (let k = 0; k < 8; k++) {
    const ix = x0 + (k & 1), iy = y0 + ((k >> 1) & 1), iz = z0 + ((k >> 2) & 1);
    const w = ((k & 1) ? tx : 1 - tx) * (((k >> 1) & 1) ? ty : 1 - ty) * (((k >> 2) & 1) ? tz : 1 - tz);
    if (w === 0) continue;
    const o = ((iz * ny + iy) * nx + ix) * STRIDE + gi * 12 + c * 4;
    e += w * Math.max(0, V1[o] + V1[o + 1] * n0 + V1[o + 2] * n1 + V1[o + 3] * n2);
  }
  return e;
}

const Y0 = 0.282095, Y1 = 0.488603;
const acc = new Float64Array(G * 24);
const m3 = new THREE.Matrix4(), q = new THREE.Quaternion(), dv = new THREE.Vector3();
const t0 = Date.now();
for (let pi = range[0]; pi < range[1]; pi++) {
  const ix = pi % nx, iy = Math.floor(pi / nx) % ny, iz = Math.floor(pi / (nx * ny));
  const px = ox + ix * cx, py = oy + iy * cy, pz = oz + iz * cz;
  acc.fill(0);
  let back = 0;
  q.setFromEuler(new THREE.Euler(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283));
  m3.makeRotationFromQuaternion(q);
  for (let ri = 0; ri < rays; ri++) {
    dv.set(...fib[ri]).applyMatrix4(m3);
    const dx = dv.x, dy = dv.y, dz = dv.z;
    ray.origin.set(px, py, pz); ray.direction.set(dx, dy, dz);
    const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 200);
    if (!h) continue;
    const t = h.faceIndex;
    const fl = F[t];
    let n0 = N[t * 3], n1 = N[t * 3 + 1], n2 = N[t * 3 + 2];
    if (fl & 4) { n0 = -n0; n1 = -n1; n2 = -n2; }
    const cosd = n0 * dx + n1 * dy + n2 * dz;
    if (cosd > 0) {
      if (!(fl & 1)) { back++; continue; }
      n0 = -n0; n1 = -n1; n2 = -n2;
    }
    const sh0 = Y0, shx = Y1 * dx, shy = Y1 * dy, shz = Y1 * dz;
    if (fl & 2) {
      // an LED wall's face, seen directly: its own light (pass 1 only)
      if (pass === 1 && cosd < 0) {
        const g = EG[t];
        for (let c = 0; c < 3; c++) { const o = G * 12 + g * 12 + c * 4; acc[o] += sh0; acc[o + 1] += shx; acc[o + 2] += shy; acc[o + 3] += shz; }
      }
      continue;
    }
    const x = h.point.x + n0 * 0.004, y = h.point.y + n1 * 0.004, z = h.point.z + n2 * 0.004;
    const a0 = albedo(t, 0), a1 = albedo(t, 1), a2 = albedo(t, 2);
    if (a0 + a1 + a2 < 1e-4) continue;
    for (let g = 0; g < G; g++) {
      if (pass === 1) {
        const E = directE(g, x, y, z, n0, n1, n2);
        if (E <= 0) continue;
        for (let c = 0; c < 3; c++) {
          const L = (c === 0 ? a0 : c === 1 ? a1 : a2) / Math.PI * E;
          const o = g * 12 + c * 4;
          acc[o] += L * sh0; acc[o + 1] += L * shx; acc[o + 2] += L * shy; acc[o + 3] += L * shz;
        }
      } else {
        for (let c = 0; c < 3; c++) {
          const E = volE(g, c, x + n0 * grid.offset, y + n1 * grid.offset, z + n2 * grid.offset, n0, n1, n2);
          if (E <= 0) continue;
          const L = (c === 0 ? a0 : c === 1 ? a1 : a2) / Math.PI * E;
          const o = g * 12 + c * 4;
          acc[o] += L * sh0; acc[o + 1] += L * shx; acc[o + 2] += L * shy; acc[o + 3] += L * shz;
        }
      }
    }
  }
  // to irradiance: E(n) = π·Y0·L00 + (2π/3)·Y1·(L1 · n)
  const k = 4 * Math.PI / rays;
  const base = pi * STRIDE;
  for (let i = 0; i < G * 6; i++) {
    OUT[base + i * 4] = Math.PI * Y0 * acc[i * 4] * k;
    OUT[base + i * 4 + 1] = (2 * Math.PI / 3) * Y1 * acc[i * 4 + 1] * k;
    OUT[base + i * 4 + 2] = (2 * Math.PI / 3) * Y1 * acc[i * 4 + 2] * k;
    OUT[base + i * 4 + 3] = (2 * Math.PI / 3) * Y1 * acc[i * 4 + 3] * k;
  }
  OUT[base + G * 24] = back / rays;
  if ((pi - range[0]) % 200 === 199) parentPort.postMessage({ progress: pi - range[0] + 1 });
}
parentPort.postMessage({ done: true, ms: Date.now() - t0 });
