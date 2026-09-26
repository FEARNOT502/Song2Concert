import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// basics
// ─────────────────────────────────────────────────────────────────────────────

export const DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Every nth item, down to `cap`: thins a crowd evenly, not from one end.
export function thin(list, cap) {
  if (list.length <= cap) return list;
  const out = [];
  const stride = list.length / cap;
  for (let i = 0; i < cap; i++) out.push(list[Math.floor(i * stride)]);
  return out;
}

// mulberry32 — deterministic, so a venue's crowd is the same on every visit
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The app's lighting palette (src/three/kit.js). This is the default tone; the
// album art replaces it when the listener asks for that.
export const APP = {
  accent: 0xff9745, // oklch(0.78 0.16 55)
  magenta: 0xc86bff,
  cool: 0x7fb8ff,
  warm: 0xffd08a,
};

// Colour temperatures for the venue's own light — house lights, work light,
// tungsten. These never take the album's colour: they are the building.
export const KELVIN = (k) => {
  // Tanner Helland's fit, good to a few percent over 1,000–12,000 K
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  return new THREE.Color(clamp(r / 255), clamp(g / 255), clamp(b / 255)).convertSRGBToLinear();
};

// ─────────────────────────────────────────────────────────────────────────────
// noise for texture generation (CPU) — tileable value noise
// ─────────────────────────────────────────────────────────────────────────────

export function valueNoise(seed) {
  const r = prng(seed);
  const N = 256;
  const tbl = new Float32Array(N * N);
  for (let i = 0; i < tbl.length; i++) tbl[i] = r();
  // (x, y) in lattice cells; the pattern repeats every px × py cells
  return (x, y, px = 256, py = px) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = tbl[y0 * N + x0], b = tbl[y0 * N + x1], c = tbl[y1 * N + x0], d = tbl[y1 * N + x1];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(n, x, y, px, py, oct = 4) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += a * n(x * f, y * f, px * f, py * f);
    norm += a; a *= 0.5; f *= 2;
  }
  return s / norm;
}

// ─────────────────────────────────────────────────────────────────────────────
// texture factory
// ─────────────────────────────────────────────────────────────────────────────

export const TEX = new Map();
export let MAX_ANISO = 8;
// set once the renderer knows what the device can do
export function setMaxAniso(v) { MAX_ANISO = v; }

export function dataTex(data, w, h, srgb, repeat = [1, 1]) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = MAX_ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  t.userData.shared = true;
  return t;
}

// A PBR set built from per-pixel callbacks. `px(u, v)` returns
// [r, g, b, height, roughness] with colour in sRGB 0..1.
export function pbrSet(key, S, px, { normal = 2.5, repeat = [1, 1], H = S } = {}) {
  if (TEX.has(key)) return TEX.get(key);
  const W = S;
  const col = new Uint8Array(W * H * 4);
  const rgh = new Uint8Array(W * H * 4);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const [r, g, b, h, ro] = px(u, v);
      const i = y * W + x, k = i * 4;
      col[k] = clamp(r) * 255; col[k + 1] = clamp(g) * 255; col[k + 2] = clamp(b) * 255; col[k + 3] = 255;
      // roughness in G (three reads roughnessMap.g), metalness unused
      rgh[k] = 255; rgh[k + 1] = clamp(ro) * 255; rgh[k + 2] = 0; rgh[k + 3] = 255;
      hgt[i] = h;
    }
  }
  const nrm = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x - 1 + W) % W)];
      const dy = hgt[((y + 1) % H) * W + x] - hgt[((y - 1 + H) % H) * W + x];
      let nx = -dx * normal, ny = -dy * normal, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const k = (y * W + x) * 4;
      nrm[k] = (nx * 0.5 + 0.5) * 255; nrm[k + 1] = (ny * 0.5 + 0.5) * 255; nrm[k + 2] = (nz * 0.5 + 0.5) * 255; nrm[k + 3] = 255;
    }
  }
  const set = {
    map: dataTex(col, W, H, true, repeat),
    normalMap: dataTex(nrm, W, H, false, repeat),
    roughnessMap: dataTex(rgh, W, H, false, repeat),
  };
  TEX.set(key, set);
  return set;
}

// Clone a set with its own repeat (textures share the image, so this is cheap).
export function withRepeat(set, rx, ry) {
  const out = {};
  for (const k of Object.keys(set)) {
    const t = set[k].clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    t.userData.shared = false;
    out[k] = t;
  }
  return out;
}

export const hex3 = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ── wood: planks along v ──
export function woodTex({ key, S = 1024, planks = 6, joints = 2, base = [0.42, 0.26, 0.14], tone = 0.16, grain = 0.22, rough = 0.42, seam = 0.45, seed = 3 }) {
  const n = valueNoise(seed), n2 = valueNoise(seed + 11);
  const rnd = prng(seed * 7 + 1);
  const off = Array.from({ length: planks }, () => rnd());
  const tones = Array.from({ length: planks * joints * 2 }, () => 1 + (rnd() - 0.5) * 2 * tone);
  return pbrSet(key || `wood${seed}${base}`, S, (u, v) => {
    const pu = u * planks, pi = Math.floor(pu), lu = pu - pi;
    const vv = (v + off[pi]) % 1;
    const pj = vv * joints, ji = Math.floor(pj), lj = pj - ji;
    const t = tones[(pi * joints + ji) % tones.length];
    // rings: stripes along the board that wander
    const w = fbm(n, u * planks * 2, vv * 3, planks * 2, 3, 3);
    const rings = 0.5 + 0.5 * Math.sin((lu * 5 + w * 5 + pi * 1.7) * Math.PI * 2);
    const fiber = fbm(n2, u * planks * 40, vv * 4, planks * 40, 4, 2);
    const g = 1 - grain * (0.6 * rings + 0.4 * fiber);
    let r = base[0] * t * g, gg = base[1] * t * g, b = base[2] * t * g;
    let h = 0.55 + 0.08 * rings + 0.05 * fiber;
    let ro = rough + 0.1 * (fiber - 0.5) + 0.06 * rings;
    const e = 0.006 * planks;
    if (lu < e || lu > 1 - e || lj < 0.0025 * joints || lj > 1 - 0.0025 * joints) {
      r *= seam; gg *= seam; b *= seam; h = 0.2; ro = 0.9;
    }
    return [r, gg, b, h, ro];
  }, { normal: 3 });
}

// ── velvet / upholstery ──
export function fabricTex({ key, S = 256, base = [0.4, 0.05, 0.06], seed = 9, weave = 64 }) {
  const n = valueNoise(seed);
  return pbrSet(key, S, (u, v) => {
    const f = fbm(n, u * 16, v * 16, 16, 16, 4);
    const w = 0.5 + 0.25 * Math.sin(u * weave * Math.PI * 2) * Math.sin(v * weave * Math.PI * 2);
    const t = 0.86 + 0.24 * f;
    return [base[0] * t, base[1] * t, base[2] * t, 0.5 * w + 0.3 * f, 0.92];
  }, { normal: 1.2 });
}

// ── black stage deck: masonite, scuffed, taped ──
export function stageTex({ S = 1024, seed = 21 } = {}) {
  const n = valueNoise(seed), n2 = valueNoise(seed + 1), n3 = valueNoise(seed + 2);
  const rnd = prng(seed);
  const tapes = Array.from({ length: 10 }, () => ({
    x: rnd(), y: rnd(), w: 0.012 + rnd() * 0.02, h: 0.004, rot: rnd() < 0.5,
    c: [[0.9, 0.85, 0.2], [0.92, 0.92, 0.9], [0.95, 0.3, 0.55], [0.3, 0.8, 0.95]][Math.floor(rnd() * 4)],
  }));
  return pbrSet('stage', S, (u, v) => {
    const scuffA = fbm(n, u * 3 + v * 30, v * 3, 33, 3, 4);
    const scuffB = fbm(n2, u * 28 + v * 2, v * 40 - u * 5, 30, 40, 3);
    const wear = smooth(0.58, 0.8, scuffA) * 0.7 + smooth(0.62, 0.85, scuffB) * 0.5;
    const base = 0.028 + 0.03 * fbm(n3, u * 8, v * 8, 8, 8, 3);
    let c = base + wear * 0.05;
    let ro = 0.5 + wear * 0.3;
    // 1.22 m panels: the tile is two panels square
    const su = (u * 2) % 1, sv = (v * 2) % 1;
    let h = 0.5 + wear * 0.05;
    if (su < 0.002 || sv < 0.002) { c *= 0.4; h = 0.3; ro = 0.8; }
    let col = [c, c, c * 1.05];
    for (const t of tapes) {
      const [w, hh] = t.rot ? [t.h, t.w] : [t.w, t.h];
      if (Math.abs(u - t.x) < w && Math.abs(v - t.y) < hh) { col = t.c.map((q) => q * 0.8); ro = 0.6; h = 0.56; }
    }
    return [col[0], col[1], col[2], h, ro];
  }, { normal: 1.5 });
}

// ── concrete ──
export function concreteTex({ key = 'concrete', S = 512, tone = 0.32, seed = 31, warm = 0 } = {}) {
  const n = valueNoise(seed), n2 = valueNoise(seed + 5);
  return pbrSet(key, S, (u, v) => {
    const a = fbm(n, u * 8, v * 8, 8, 8, 5);
    const b = fbm(n2, u * 40, v * 40, 40, 40, 2);
    const stain = smooth(0.55, 0.75, fbm(n2, u * 3, v * 5, 3, 5, 4));
    const c = tone * (0.8 + 0.35 * a + 0.1 * b) * (1 - 0.25 * stain);
    return [c * (1 + warm), c, c * (1 - warm), 0.5 + 0.2 * a + 0.1 * b, 0.86 + 0.1 * b];
  }, { normal: 1.5 });
}

// ── carpet ──
export function carpetTex({ key, S = 256, base = [0.2, 0.05, 0.06], seed = 41 }) {
  const n = valueNoise(seed);
  return pbrSet(key, S, (u, v) => {
    const f = fbm(n, u * 64, v * 64, 64, 64, 2);
    const pat = (Math.sin(u * Math.PI * 16) * Math.sin(v * Math.PI * 16) > 0.6) ? 0.85 : 1;
    const t = (0.8 + 0.4 * f) * pat;
    return [base[0] * t, base[1] * t, base[2] * t, f, 0.97];
  }, { normal: 1 });
}

// ── a row of stadium seat backs: u = metres along the row (2 seats per tile),
// v = up the back ──
export function seatStripTex(hexColor) {
  const key = `strip${hexColor}`;
  if (TEX.has(key)) return TEX.get(key);
  const [R, G, B] = hex3(hexColor).map((x) => Math.pow(x, 1 / 2.2));
  const n = valueNoise(77);
  return pbrSet(key, 256, (u, v) => {
    const s = (u * 2) % 1;               // one seat
    const gap = s < 0.07 || s > 0.93;
    const f = fbm(n, u * 16, v * 8, 16, 8, 2);
    if (gap || v > 0.94) return [0.03, 0.03, 0.035, 0.1, 0.9];
    // moulded back: lit top, shadowed bottom, rounded sides
    const side = Math.min(s - 0.07, 0.93 - s) / 0.08;
    const shade = (0.55 + 0.45 * smooth(0.0, 0.9, v)) * (0.6 + 0.4 * clamp(side));
    const lip = v > 0.84 ? 1.25 : 1;
    const t = shade * lip * (0.92 + 0.12 * f);
    return [R * t, G * t, B * t, 0.5 + 0.4 * clamp(side), 0.55];
  }, { normal: 2, H: 128 });
}

// ── speaker grille ──
export function grilleTex() {
  return pbrSet('grille', 256, (u, v) => {
    const cu = (u * 32) % 1 - 0.5, cv = (v * 32) % 1 - 0.5;
    const hole = Math.hypot(cu, cv) < 0.3;
    const c = hole ? 0.008 : 0.05;
    return [c, c, c, hole ? 0.2 : 0.6, hole ? 1 : 0.55];
  }, { normal: 2 });
}

// ── grey floor protection panels (dome field, stadium pitch) ──
export function floorPanelTex({ key, S = 512, tone = 0.3, seed = 51 }) {
  const n = valueNoise(seed);
  const rnd = prng(seed);
  const shades = Array.from({ length: 64 }, () => 0.85 + rnd() * 0.3);
  return pbrSet(key, S, (u, v) => {
    const cu = u * 8, cv = v * 8;
    const i = Math.floor(cu) + Math.floor(cv) * 8;
    const f = fbm(n, u * 32, v * 32, 32, 32, 3);
    const seam = (cu % 1) < 0.03 || (cv % 1) < 0.03;
    const t = tone * shades[i % 64] * (0.85 + 0.3 * f);
    return seam ? [t * 0.5, t * 0.5, t * 0.5, 0.2, 0.9] : [t, t, t * 1.02, 0.5 + 0.1 * f, 0.7 + 0.2 * f];
  }, { normal: 1.5 });
}

// ── plaster / painted wall ──
export function plasterTex({ key, S = 512, base = [0.8, 0.76, 0.7], seed = 61, bumps = 0 }) {
  const n = valueNoise(seed);
  return pbrSet(key, S, (u, v) => {
    const f = fbm(n, u * 12, v * 12, 12, 12, 5);
    let h = 0.5 + 0.1 * f;
    if (bumps) {
      // convex diffusion bumps, as on a hall's side walls
      const bu = (u * bumps) % 1 - 0.5, bv = (v * bumps) % 1 - 0.5;
      const d = Math.hypot(bu, bv * 1.4);
      h += 0.6 * Math.max(0, 1 - d / 0.42) ** 1.5;
    }
    const t = 0.92 + 0.12 * f;
    return [base[0] * t, base[1] * t, base[2] * t, h, 0.82];
  }, { normal: 3 });
}

// Radial glow sprite and a four-point star, for lamp flares.
export function glowSprite() {
  if (TEX.has('glow')) return TEX.get('glow');
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.userData.shared = true;
  TEX.set('glow', t);
  return t;
}
export function starSprite() {
  if (TEX.has('star')) return TEX.get('star');
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.06, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  // streaks: a long horizontal one (lens), a shorter vertical
  for (const [w, h, a] of [[S, 4, 0.3], [S * 0.55, 3, 0.22], [4, S * 0.5, 0.18]]) {
    const lg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, Math.max(w, h) / 2);
    lg.addColorStop(0, `rgba(255,255,255,${a})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.translate(S / 2, S / 2); g.scale(w / Math.max(w, h), h / Math.max(w, h));
    g.fillStyle = lg; g.beginPath(); g.arc(0, 0, Math.max(w, h) / 2, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.userData.shared = true;
  TEX.set('star', t);
  return t;
}

// 3D noise for the haze inside beams — one fetch per march step instead of
// eight hashes.
export function noise3D() {
  if (TEX.has('n3d')) return TEX.get('n3d');
  const S = 48;
  const r = prng(1234);
  const lat = new Float32Array(S * S * S).map(() => r());
  const at = (x, y, z) => lat[((z % S) * S + (y % S)) * S + (x % S)];
  const data = new Uint8Array(S * S * S);
  const sample = (x, y, z, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const m = (a) => ((a % p) + p) % p;
    const q = (dx, dy, dz) => at(m(xi + dx) * (S / p), m(yi + dy) * (S / p), m(zi + dz) * (S / p));
    const x00 = lerp(q(0, 0, 0), q(1, 0, 0), u), x10 = lerp(q(0, 1, 0), q(1, 1, 0), u);
    const x01 = lerp(q(0, 0, 1), q(1, 0, 1), u), x11 = lerp(q(0, 1, 1), q(1, 1, 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  };
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0, a = 0.55, norm = 0;
    for (const p of [6, 12, 24]) {
      s += a * sample((x / S) * p, (y / S) * p, (z / S) * p, p);
      norm += a; a *= 0.5;
    }
    data[(z * S + y) * S + x] = clamp(s / norm) * 255;
  }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RedFormat;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  t.userData.shared = true;
  TEX.set('n3d', t);
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// materials
// ─────────────────────────────────────────────────────────────────────────────

export const std = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });
export const phys = (o = {}) => new THREE.MeshPhysicalMaterial({ roughness: 0.8, metalness: 0, ...o });
export const glowMat = (color, intensity = 1, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false, ...o });

// Velvet: sheen is what separates it from felt under a grazing light.
export function velvet(hexColor, key, o = {}) {
  const [r, g, b] = hex3(hexColor).map((x) => Math.pow(x, 1 / 2.2));
  const set = fabricTex({ key: key || `vel${hexColor}`, base: [r, g, b] });
  return phys({
    ...set, normalScale: new THREE.Vector2(0.6, 0.6),
    sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(hexColor).lerp(new THREE.Color(0xffffff), 0.35),
    roughness: 0.9, ...o,
  });
}

export const aluminium = () => std({ color: 0xa9adb3, metalness: 0.9, roughness: 0.38 });
export const blackSteel = () => std({ color: 0x141418, metalness: 0.6, roughness: 0.5 });

// ─────────────────────────────────────────────────────────────────────────────
// album art: the covers, the palette they give, and what the screens show
// ─────────────────────────────────────────────────────────────────────────────

// The four covers the app ships (src/components/Cover.jsx), redrawn to canvas
// so the screens can show them and the palette can be read out of them.
export const COVERS = {
  blueRoom: { title: 'blue room sessions.', artist: 'EUNJI HAN', label: 'SIDE A · BLR 024' },
  symphony: { title: 'Mahler — Symphony № 2', artist: 'ABBADO · BERLINER PHIL', label: 'DG · 138 815' },
  future: { title: 'FUTURE present.', artist: 'DIM SUN', label: 'LP · 087' },
  neon: { title: 'NEON shrine.', artist: 'KASAI', label: 'NS · 014' },
};

export function drawCover(id, S = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const serif = '"Instrument Serif", Georgia, serif';
  const mono = '"JetBrains Mono", ui-monospace, monospace';
  const sans = '"Inter Tight", system-ui, sans-serif';
  if (id === 'blueRoom') {
    const lg = g.createLinearGradient(0, 0, S * 0.3, S);
    lg.addColorStop(0, '#1c3a47'); lg.addColorStop(1, '#0e2229');
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    const cx = S * 0.605, cy = S * 0.495, r = S * 0.275;
    const glow = g.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.7);
    glow.addColorStop(0, 'rgba(255,151,69,0.35)'); glow.addColorStop(1, 'rgba(255,151,69,0)');
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    const sun = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 0, cx, cy, r);
    sun.addColorStop(0, '#ffb266'); sun.addColorStop(1, '#c2502a');
    g.fillStyle = sun; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f3ecdc';
    g.font = `${S * 0.11}px ${serif}`; g.fillText('blue room', S * 0.05, S * 0.83);
    g.font = `italic ${S * 0.11}px ${serif}`; g.fillText('sessions.', S * 0.05, S * 0.93);
    g.fillStyle = '#ffbf85'; g.font = `${S * 0.025}px ${mono}`;
    g.fillText('S I D E   A', S * 0.05, S * 0.08); g.fillText('B L R · 0 2 4', S * 0.74, S * 0.08);
  } else if (id === 'symphony') {
    g.fillStyle = '#ede4d3'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#1a1408'; g.font = `${S * 0.028}px ${mono}`; g.fillText('D G  ·  1 3 8  8 1 5', S * 0.08, S * 0.11);
    g.font = `500 ${S * 0.22}px ${serif}`; g.fillText('MAHLER', S * 0.08, S * 0.52);
    g.fillStyle = '#5a4a28'; g.font = `italic ${S * 0.085}px ${serif}`; g.fillText('Symphony № 2', S * 0.08, S * 0.62);
    g.fillStyle = '#1a1408'; g.font = `${S * 0.05}px ${serif}`; g.fillText('Resurrection.', S * 0.08, S * 0.7);
    g.fillStyle = '#5a4a28'; g.font = `${S * 0.026}px ${mono}`; g.fillText('ABBADO · BERLINER PHIL · 2003', S * 0.08, S * 0.93);
    g.fillStyle = '#b3342a'; g.fillRect(S * 0.08, S * 0.18, S * 0.18, S * 0.012);
  } else if (id === 'future') {
    const rg = g.createRadialGradient(S * 0.5, S * 0.6, 0, S * 0.5, S * 0.6, S * 0.75);
    rg.addColorStop(0, '#b93aa4'); rg.addColorStop(0.5, '#3a1670'); rg.addColorStop(1, '#0a0420');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI;
      const h = 30 + i * 4;
      g.strokeStyle = `hsla(${h},90%,68%,0.7)`; g.lineWidth = S * 0.0035;
      g.beginPath(); g.moveTo(S * 0.5, S * 0.8); g.lineTo(S * 0.5 + Math.cos(a) * S, S * 0.8 - Math.sin(a) * S); g.stroke();
    }
    g.fillStyle = '#ffc75a'; g.beginPath(); g.arc(S * 0.5, S * 0.8, S * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f8e8b8';
    g.font = `800 ${S * 0.13}px ${sans}`; g.fillText('FUTURE', S * 0.05, S * 0.2);
    g.font = `italic 300 ${S * 0.13}px ${sans}`; g.fillText('present.', S * 0.05, S * 0.32);
  } else {
    const lg = g.createLinearGradient(0, 0, 0, S);
    lg.addColorStop(0, '#0a0610'); lg.addColorStop(0.6, '#2a0820'); lg.addColorStop(1, '#8a2a7a');
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(235,130,230,0.6)'; g.lineWidth = S * 0.003;
    for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(i * S / 10, S * 0.62); g.lineTo((i / 10 - 0.5) * 6 * S + S / 2, S); g.stroke(); }
    for (let i = 0; i < 6; i++) { const y = S * (0.62 + (i + 1) * (i + 1) * 0.012); g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    g.fillStyle = '#ffd98a'; g.globalAlpha = 0.9; g.beginPath(); g.arc(S * 0.5, S * 0.36, S * 0.12, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.fillStyle = '#0a0610'; g.strokeStyle = '#ffd98a'; g.lineWidth = S * 0.005;
    for (const [x, y, w, h] of [[0.34, 0.4, 0.32, 0.03], [0.38, 0.43, 0.24, 0.01], [0.4, 0.43, 0.03, 0.22], [0.57, 0.43, 0.03, 0.22]]) {
      g.fillRect(x * S, y * S, w * S, h * S); g.strokeRect(x * S, y * S, w * S, h * S);
    }
    g.fillStyle = '#fff8e8'; g.textAlign = 'center';
    g.font = `900 ${S * 0.14}px ${sans}`; g.fillText('NEON', S * 0.5, S * 0.84);
    g.fillStyle = '#ffd98a'; g.font = `italic 200 ${S * 0.14}px ${sans}`; g.fillText('shrine.', S * 0.5, S * 0.95);
    g.textAlign = 'left';
  }
  return c;
}

// ── colour science for the palette ──
export function srgbToOklab(r, g, b) {
  const L = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  r = L(r); g = L(g); b = L(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// The palette a lighting designer would pull off the sleeve.
//
// Every pixel votes for its hue, weighted by how coloured it is (chroma), so a
// small saturated sun outvotes a large grey sky. The histogram's peaks are the
// sleeve's colours; the strongest is the key, the next distinct one the
// counter. Each is then turned into what an LED fixture can make at that hue:
// full chroma at a bright level, gamut-clipped by chroma rather than clamped,
// so the hue survives. A sleeve with one colour gets analogous shades of it,
// not an invented complement; a sleeve with almost none gets warm and cool
// white, plus its one accent if it has one.
export function inGamut(L, C, h) {
  const [r, g, b] = oklabToLinear(L, C * Math.cos(h), C * Math.sin(h));
  return r >= -1e-4 && g >= -1e-4 && b >= -1e-4 && r <= 1.0001 && g <= 1.0001 && b <= 1.0001;
}
export function maxChroma(L, h) {
  let lo = 0, hi = 0.37;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (inGamut(L, m, h)) lo = m; else hi = m; }
  return lo;
}
// Where a hue is most colourful: yellow peaks near white, blue deep down. A
// light is set part of the way toward it so a gold stays gold, not mustard.
export function cuspL(h) {
  let best = 0.7, bc = 0;
  for (let L = 0.35; L <= 0.97; L += 0.02) { const c = maxChroma(L, h); if (c > bc) { bc = c; best = L; } }
  return best;
}
export function ledColor(L0, h, sat, pull = 0.65) {
  const L = pull > 0 ? clamp(lerp(L0, cuspL(h), pull), 0.55, 0.92) : L0;
  const c = maxChroma(L, h) * sat;
  const [r, g, b] = oklabToLinear(L, c * Math.cos(h), c * Math.sin(h));
  return new THREE.Color(clamp(r), clamp(g), clamp(b));
}
export function extractPalette(canvas) {
  const T = 72;
  const c = document.createElement('canvas'); c.width = c.height = T;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, T, T);
  const px = g.getImageData(0, 0, T, T).data;
  const BINS = 48;
  const hist = new Float64Array(BINS), hx = new Float64Array(BINS), hy = new Float64Array(BINS), hc = new Float64Array(BINS);
  let sumC = 0;
  const N = T * T;
  for (let i = 0; i < px.length; i += 4) {
    const [L, a, b] = srgbToOklab(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    const C = Math.hypot(a, b);
    sumC += C;
    if (C < 0.012) continue;
    const h = Math.atan2(b, a);
    const w = Math.pow(C, 1.3) * smooth(0.1, 0.35, L) * (1 - smooth(0.93, 1.0, L));
    const k = Math.floor(((h / (Math.PI * 2) + 1) % 1) * BINS) % BINS;
    hist[k] += w; hx[k] += Math.cos(h) * w; hy[k] += Math.sin(h) * w; hc[k] += C * w;
  }
  const meanC = sumC / N;
  const sm = new Float64Array(BINS);
  for (let k = 0; k < BINS; k++) for (let d = -2; d <= 2; d++) sm[k] += hist[(k + d + BINS) % BINS] * [1, 2, 3, 2, 1][d + 2];
  const peaks = [];
  for (let k = 0; k < BINS; k++) {
    const l = sm[(k - 1 + BINS) % BINS], r = sm[(k + 1) % BINS];
    if (sm[k] > 0 && sm[k] >= l && sm[k] > r) {
      let x = 0, y = 0, cw = 0, ww = 0;
      for (let d = -2; d <= 2; d++) { const j = (k + d + BINS) % BINS; x += hx[j]; y += hy[j]; cw += hc[j]; ww += hist[j]; }
      peaks.push({ v: sm[k], h: Math.atan2(y, x), C: ww > 0 ? cw / ww : 0 });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const dist = (a, b) => { const d = Math.abs(a - b) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); };
  const total = hist.reduce((s, v) => s + v, 0) / N;
  const sat = 0.62 + 0.38 * clamp(meanC / 0.08);
  let a, b, c2, d, kind;
  const accent = peaks.find((p) => p.C > 0.09);
  if (!peaks.length || total < 0.0015 || meanC < 0.03) {
    // a sleeve with next to no colour: tungsten and daylight, and its accent
    kind = 'neutral';
    const warmHue = peaks.length ? peaks[0].h : 1.2;
    a = ledColor(0.82, warmHue, 0.45).lerp(KELVIN(3000), 0.4);
    b = KELVIN(5200);
    c2 = accent ? ledColor(0.66, accent.h, 0.95) : KELVIN(2600);
    d = KELVIN(3800);
  } else {
    const p = peaks[0];
    const q = peaks.find((x) => x !== p && dist(x.h, p.h) > 0.6 && x.v > p.v * 0.1);
    const r = peaks.find((x) => x !== p && x !== q && dist(x.h, p.h) > 0.6 && (!q || dist(x.h, q.h) > 0.6) && x.v > p.v * 0.06);
    kind = q ? 'duo' : 'mono';
    const h2 = q ? q.h : p.h + 0.45;
    const h3 = r ? r.h : q ? (p.h + (q.h - p.h) * 0.5) : p.h - 0.4;
    a = ledColor(0.72, p.h, sat);
    b = ledColor(0.66, h2, sat);
    c2 = ledColor(0.78, h3, sat * 0.9);
    d = ledColor(0.9, p.h, 0.3, 0);
  }
  return { a, b, c: c2, d, kind, swatches: [a, b, c2, d] };
}

export const appPalette = () => ({
  a: new THREE.Color(APP.accent), b: new THREE.Color(APP.magenta),
  c: new THREE.Color(APP.cool), d: new THREE.Color(APP.warm),
  swatches: [APP.accent, APP.warm, APP.magenta, APP.cool].map((h) => new THREE.Color(h)),
});

// What a screen shows: the art on a field made from itself, the way a show's
// content team frames a sleeve on a wide wall, with the same label/title/artist
// block the app puts under it.
export function screenContent(cover, meta, aspect, { W = 2048, frame = true } = {}) {
  const H = Math.round(W / aspect);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // blurred bleed of the art across the whole wall
  g.save();
  g.filter = `blur(${Math.round(W * 0.03)}px) saturate(1.3)`;
  const big = Math.max(W, H) * 1.25;
  g.globalAlpha = 0.55;
  g.drawImage(cover, (W - big) / 2, (H - big) / 2, big, big);
  g.restore();
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0.15)'); vg.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // the art: centred on an ordinary wall; on a letterbox-wide wall (a club's
  // LED behind the drums) it sits high and large, with the type beside it
  const wide = aspect >= 2.4;
  const s = wide ? H * 0.8 : Math.min(H * 0.64, W * 0.6);
  // wide: the art left of centre and the type right of it, so a drum kit in
  // front of the middle of the wall covers neither
  const x = wide ? W / 2 - s - H * 0.22 : (W - s) / 2, y = wide ? H * 0.05 : H * 0.14;
  if (frame) {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - s * 0.02, y - s * 0.02 + s * 0.02, s * 1.04, s * 1.04);
  }
  g.drawImage(cover, x, y, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = Math.max(1, s * 0.004);
  g.strokeRect(x, y, s, s);
  // type
  if (wide) {
    const tx = W / 2 + H * 0.22;
    g.textAlign = 'left';
    g.fillStyle = '#ffae6e';
    g.font = `${Math.round(s * 0.05)}px "JetBrains Mono", ui-monospace, monospace`;
    g.fillText((meta.label || '').split('').join(' '), tx, y + s * 0.38, W - tx - s * 0.1);
    g.fillStyle = '#f2ede4';
    g.font = `300 ${Math.round(s * 0.11)}px "Inter Tight", system-ui, sans-serif`;
    g.fillText(meta.title || '', tx, y + s * 0.53, W - tx - s * 0.1);
    g.fillStyle = 'rgba(242,237,228,0.6)';
    g.font = `${Math.round(s * 0.05)}px "JetBrains Mono", ui-monospace, monospace`;
    g.fillText((meta.artist || '').split('').join(' '), tx, y + s * 0.64, W - tx - s * 0.1);
    const tw = new THREE.CanvasTexture(c);
    tw.colorSpace = THREE.SRGBColorSpace; tw.anisotropy = MAX_ANISO; tw.generateMipmaps = true; tw.minFilter = THREE.LinearMipmapLinearFilter;
    return tw;
  }
  g.textAlign = 'center';
  g.fillStyle = '#ffae6e';
  g.font = `${Math.round(s * 0.032)}px "JetBrains Mono", ui-monospace, monospace`;
  g.fillText((meta.label || '').split('').join(' '), W / 2, y - s * 0.045, W * 0.9);
  g.fillStyle = '#f2ede4';
  g.font = `300 ${Math.round(s * 0.085)}px "Inter Tight", system-ui, sans-serif`;
  g.fillText(meta.title || '', W / 2, y + s + s * 0.12, W * 0.9);
  g.fillStyle = 'rgba(242,237,228,0.6)';
  g.font = `${Math.round(s * 0.036)}px "JetBrains Mono", ui-monospace, monospace`;
  g.fillText((meta.artist || '').split('').join(' '), W / 2, y + s + s * 0.19, W * 0.9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Average colour of a canvas region, linear — what the screen throws into the
// room from that part of the wall.
export function regionColor(canvas, x0, y0, x1, y1) {
  const T = 8;
  const c = document.createElement('canvas'); c.width = c.height = T;
  const g = c.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  g.drawImage(canvas, x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H, 0, 0, T, T);
  const d = g.getImageData(0, 0, T, T).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color(r / n / 255, gg / n / 255, b / n / 255).convertSRGBToLinear();
}
