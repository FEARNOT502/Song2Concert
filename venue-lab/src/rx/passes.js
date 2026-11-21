// ─────────────────────────────────────────────────────────────────────────────
// rx passes: the screen-space and volume passes between the scene and the
// bloom. All of them read the scene target's depth and its second output
// (materials.js: view normal, roughness, reflectance).
//
//   ao      ground-truth AO (horizon search), half size
//   ssr     a reflection ray per pixel (GGX-sampled, so rough floors blur
//           over frames), half size
//   pack    AO bilateral-blurred, view depth, reflection coverage: the
//           texture the materials read back next frame
//   froxel  the haze as a volume aligned to the view: every light's
//           in-scatter (spots through their shadow maps), the GI's ambient,
//           then integrated front to back
//   comp    scene + reflections, the haze over it, the beams on top
//   taa     jittered frames resolved over time (variance-clipped history)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { OCT_DECODE } from './materials.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const COMMON = /* glsl */`
  uniform sampler2D tDepth, tG;
  uniform mat4 uProj, uProjInv;
  uniform vec2 uFull;          // the scene target's size
  uniform float uFrame;
  ${OCT_DECODE}
  vec3 viewPos(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    return v.xyz / v.w;
  }
  vec3 viewPosZ(vec2 uv, float z) {
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    return v.xyz / v.w;
  }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  // the surface normal: the material's, or (where a shader did not say) the depth's
  vec3 viewNormal(vec2 uv, vec3 P) {
    vec4 g = texture2D(tG, uv);
    if (g.a > -0.5 && dot(g.xy, g.xy) > 0.0) return rxOctDecode(g.xy);
    vec2 px = 1.0 / uFull;
    vec3 r = viewPos(uv + vec2(px.x, 0.0)) - P, l = P - viewPos(uv - vec2(px.x, 0.0));
    vec3 u = viewPos(uv + vec2(0.0, px.y)) - P, d = P - viewPos(uv - vec2(0.0, px.y));
    vec3 h = abs(r.z) < abs(l.z) ? r : l, v = abs(u.z) < abs(d.z) ? u : d;
    return normalize(cross(h, v));
  }
`;

const mat = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
const U = (v) => ({ value: v });

// ── ground-truth ambient occlusion ──────────────────────────────────────────
export function aoMaterial() {
  return mat(/* glsl */`
    ${COMMON}
    uniform float uRadius, uPower;
    varying vec2 vUv;
    const float PI = 3.14159265;
    void main() {
      float z = texture2D(tDepth, vUv).x;
      if (z >= 0.99999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
      vec3 P = viewPos(vUv);
      vec3 V = normalize(-P);
      vec3 N = viewNormal(vUv, P);
      float rPix = clamp(uRadius * uProj[1][1] / -P.z * 0.5 * uFull.y, 3.0, 160.0);
      float noise = ign(gl_FragCoord.xy + vec2(uFrame * 7.31, uFrame * 3.17));
      float jit = fract(noise * 1.618 + uFrame * 0.618);
      const int SLICES = 3, STEPS = 7;
      float vis = 0.0;
      for (int s = 0; s < SLICES; s++) {
        float phi = (float(s) + noise) / float(SLICES) * PI;
        vec2 dir = vec2(cos(phi), sin(phi));
        vec3 d3 = vec3(dir, 0.0);
        vec3 ortho = d3 - dot(d3, V) * V;
        vec3 axis = normalize(cross(d3, V));
        vec3 pN = N - axis * dot(N, axis);
        float pLen = max(length(pN), 1e-4);
        float sgn = sign(dot(ortho, pN));
        float cn = clamp(dot(pN, V) / pLen, 0.0, 1.0);
        float n = sgn * acos(cn);
        float hc[2];
        for (int side = 0; side < 2; side++) {
          float sd = side == 0 ? -1.0 : 1.0;
          float h = -1.0;
          for (int j = 0; j < STEPS; j++) {
            float t = (float(j) + jit) / float(STEPS);
            t = t * t;
            vec2 suv = vUv + dir * sd * max(t * rPix, 1.5) / uFull;
            if (any(lessThan(suv, vec2(0.0))) || any(greaterThan(suv, vec2(1.0)))) break;
            vec3 D = viewPos(suv) - P;
            float L = length(D);
            float c = dot(D / L, V);
            float w = clamp(1.0 - (L * L) / (uRadius * uRadius), 0.0, 1.0);
            h = max(h, mix(-1.0, c, w));
          }
          hc[side] = h;
        }
        float h0 = -acos(clamp(hc[0], -1.0, 1.0)), h1 = acos(clamp(hc[1], -1.0, 1.0));
        h0 = n + max(h0 - n, -PI * 0.5);
        h1 = n + min(h1 - n, PI * 0.5);
        float a = 0.25 * (-cos(2.0 * h0 - n) + cn + 2.0 * h0 * sin(n)) + 0.25 * (-cos(2.0 * h1 - n) + cn + 2.0 * h1 * sin(n));
        vis += pLen * a;
      }
      float ao = clamp(vis / float(SLICES), 0.0, 1.0);
      gl_FragColor = vec4(pow(ao, uPower), -P.z, 0.0, 1.0);
    }`, {
    tDepth: U(null), tG: U(null), uProj: U(new THREE.Matrix4()), uProjInv: U(new THREE.Matrix4()), uFull: U(new THREE.Vector2(1, 1)),
    uFrame: U(0), uRadius: U(1.1), uPower: U(1.25),
  });
}

// ── screen-space reflections ────────────────────────────────────────────────
export function ssrMaterial() {
  return mat(/* glsl */`
    ${COMMON}
    uniform sampler2D tColor;
    uniform float uMaxDist, uThick;
    varying vec2 vUv;
    const float PI = 3.14159265;
    vec2 toUv(vec3 p) { vec4 c = uProj * vec4(p, 1.0); return c.xy / c.w * 0.5 + 0.5; }
    // a GGX microfacet normal about N
    vec3 ggx(vec3 N, float a, vec2 xi) {
      float phi = 2.0 * PI * xi.x;
      float ct = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
      float st = sqrt(1.0 - ct * ct);
      vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 T = normalize(cross(up, N)), B = cross(N, T);
      return normalize(T * cos(phi) * st + B * sin(phi) * st + N * ct);
    }
    void main() {
      vec4 g = texture2D(tG, vUv);
      float z = texture2D(tDepth, vUv).x;
      if (z >= 0.99999 || g.a <= 0.002 || g.z > 0.75) { gl_FragColor = vec4(0.0); return; }
      vec3 P = viewPos(vUv);
      vec3 V = normalize(-P);
      vec3 N = rxOctDecode(g.xy);
      float rough = g.z;
      float n1 = ign(gl_FragCoord.xy + uFrame * 5.588), n2 = ign(gl_FragCoord.yx * 1.37 + uFrame * 3.71);
      vec3 H = rough < 0.03 ? N : ggx(N, max(rough * rough, 1e-3), vec2(n1, n2 * 0.9));
      vec3 R = reflect(-V, H);
      if (dot(R, N) <= 0.0) { gl_FragColor = vec4(0.0); return; }
      vec3 O = P + N * (0.015 - P.z * 0.002);
      float len = uMaxDist;
      // stop the ray at the near plane
      if (R.z > 0.0) len = min(len, (-0.15 - O.z) / R.z);
      vec3 E = O + R * len;
      vec2 a = toUv(O), b = toUv(E);
      float pxLen = length((b - a) * uFull);
      const int STEPS = 40;
      float stepN = 1.0 / float(STEPS);
      float jit = fract(n1 + uFrame * 0.618);
      float ia = 1.0 / O.z, ib = 1.0 / E.z;
      float hitT = -1.0;
      float lo = 0.0, hi = 0.0;
      for (int i = 1; i <= STEPS; i++) {
        float t = (float(i) - jit) * stepN;
        t = t * t;
        vec2 uv = mix(a, b, t);
        if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
        float rz = 1.0 / mix(ia, ib, t);
        float sz = viewPos(uv).z;
        float dz = sz - rz;              // > 0: the ray is behind the surface
        if (dz > 0.0 && dz < uThick + abs(rz) * 0.02) { hitT = t; hi = t; break; }
        lo = t;
      }
      if (hitT < 0.0) { gl_FragColor = vec4(0.0); return; }
      for (int k = 0; k < 5; k++) {
        float m = 0.5 * (lo + hi);
        vec2 uv = mix(a, b, m);
        float rz = 1.0 / mix(ia, ib, m);
        if (viewPos(uv).z - rz > 0.0) hi = m; else lo = m;
      }
      vec2 huv = mix(a, b, hi);
      vec3 HN = viewNormal(huv, viewPos(huv));
      float face = smoothstep(0.0, 0.15, -dot(HN, R));
      vec2 e = smoothstep(0.0, 0.08, huv) * smoothstep(1.0, 0.92, huv);
      float fade = e.x * e.y * face * (1.0 - hi * hi) * smoothstep(0.75, 0.45, rough);
      vec3 col = texture2D(tColor, huv).rgb;
      col = min(col, vec3(64.0));
      gl_FragColor = vec4(col, fade);
    }`, {
    tDepth: U(null), tG: U(null), tColor: U(null), uProj: U(new THREE.Matrix4()), uProjInv: U(new THREE.Matrix4()), uFull: U(new THREE.Vector2(1, 1)),
    uFrame: U(0), uMaxDist: U(24), uThick: U(0.35),
  });
}

// ── the texture the materials read back: AO denoised, depth, coverage ──────
export function packMaterial() {
  return mat(/* glsl */`
    uniform sampler2D tAO, tSSR;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec2 c = texture2D(tAO, vUv).rg;
      float sum = c.r, wsum = 1.0;
      for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
        if (x == 0 && y == 0) continue;
        vec2 s = texture2D(tAO, vUv + vec2(float(x), float(y)) * uTexel * 1.5).rg;
        float w = exp(-abs(s.g - c.g) / (0.02 * c.g + 0.02) * 2.0) * exp(-float(x * x + y * y) * 0.18);
        sum += s.r * w; wsum += w;
      }
      gl_FragColor = vec4(sum / wsum, c.g, texture2D(tSSR, vUv).a, 1.0);
    }`, { tAO: U(null), tSSR: U(null), uTexel: U(new THREE.Vector2()) });
}

// ── the froxel haze ─────────────────────────────────────────────────────────
// The volume is FX × FY × FZ, its slices tiled across a 2D atlas COLS wide.
export const FROXEL = { FX: 160, FY: 90, FZ: 64, COLS: 8 };
export const MAX_FOG_LIGHTS = 32, MAX_FOG_SHADOWS = 4;

const FROXEL_COMMON = /* glsl */`
  uniform vec3 uDims;          // FX, FY, FZ
  uniform float uCols, uNear, uFar;
  // the atlas texel's froxel: (x, y, slice)
  vec3 froxelOf(vec2 px) {
    float tx = floor(px.x / uDims.x), ty = floor(px.y / uDims.y);
    return vec3(px.x - tx * uDims.x, px.y - ty * uDims.y, ty * uCols + tx);
  }
  vec2 atlasUv(vec2 uvIn, float slice) {
    float tx = mod(slice, uCols), ty = floor(slice / uCols);
    vec2 c = clamp(uvIn * uDims.xy, vec2(0.5), uDims.xy - 0.5);
    return (vec2(tx, ty) * uDims.xy + c) / (vec2(uCols, ceil(uDims.z / uCols)) * uDims.xy);
  }
  float sliceDist(float k) { return uNear * pow(uFar / uNear, k / uDims.z); }
  float distSlice(float d) { return log(max(d, uNear) / uNear) / log(uFar / uNear) * uDims.z; }
`;

export function froxelLightMaterial() {
  const S = MAX_FOG_SHADOWS;
  return mat(/* glsl */`
    precision highp sampler2DShadow;
    precision highp sampler3D;
    ${FROXEL_COMMON}
    uniform mat4 uProjInv, uCamWorld;
    uniform float uFrame, uDensity, uNoiseAmt, uAniso, uTime, uAmbGain, uFloorY, uFloorFall;
    uniform sampler3D tNoise;
    uniform int uCount;
    uniform vec3 uLPos[${MAX_FOG_LIGHTS}], uLDir[${MAX_FOG_LIGHTS}], uLCol[${MAX_FOG_LIGHTS}];
    uniform vec4 uLPar[${MAX_FOG_LIGHTS}];        // cos outer, cos inner, cutoff, decay
    uniform float uLSh[${MAX_FOG_LIGHTS}];        // shadow slot, -1 none
    uniform vec4 uLArea[${MAX_FOG_LIGHTS}];       // area light: half w, half h (0: punctual)
    uniform vec3 uLRight[${MAX_FOG_LIGHTS}];
    ${Array.from({ length: S }, (_, i) => `uniform sampler2DShadow tSh${i}; uniform mat4 uShM${i}; uniform float uShB${i};`).join('\n')}
    uniform float uGIOn;
    uniform highp sampler3D rxGI0, rxGI1, rxGI2;
    uniform vec3 rxGIOrigin, rxGISize;
    uniform sampler2D tPrev;
    uniform mat4 uPrevVP;
    uniform float uHasPrev, uBlend;
    varying vec2 vUv;
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    float shadowAt(int i, vec3 w) {
      vec4 c; float v = 1.0;
      ${Array.from({ length: S }, (_, i) => `if (i == ${i}) { c = uShM${i} * vec4(w, 1.0); c.xyz /= c.w; c.z += uShB${i}; if (c.w > 0.0 && all(greaterThan(c.xyz, vec3(0.0))) && all(lessThan(c.xyz, vec3(1.0)))) v = texture(tSh${i}, c.xyz); }`).join('\n      ')}
      return v;
    }
    float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.5663706 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
    void main() {
      vec3 f = froxelOf(floor(gl_FragCoord.xy));
      if (f.z >= uDims.z) { gl_FragColor = vec4(0.0); return; }
      float jit = fract(ign(gl_FragCoord.xy) + uFrame * 0.618034);
      // a different point inside the froxel every frame; the history averages them
      vec2 jxy = vec2(fract(jit * 7.13 + uFrame * 0.7548777), fract(jit * 3.71 + uFrame * 0.5698403)) - 0.5;
      vec2 uv = (f.xy + 0.5 + jxy * 0.95) / uDims.xy;
      float d = sliceDist(f.z + jit);
      vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      vec3 ray = normalize(v.xyz / v.w);
      vec3 vp = ray * (d / max(-ray.z, 1e-3));
      vec3 w = (uCamWorld * vec4(vp, 1.0)).xyz;
      // the froxel's centre, for finding it in last frame's volume
      vec2 uvc = (f.xy + 0.5) / uDims.xy;
      vec4 vc = uProjInv * vec4(uvc * 2.0 - 1.0, 1.0, 1.0);
      vec3 rc = normalize(vc.xyz / vc.w);
      vec3 wc = (uCamWorld * vec4(rc * (sliceDist(f.z + 0.5) / max(-rc.z, 1e-3)), 1.0)).xyz;
      vec3 toCam = normalize(cameraPosition - w);
      // the haze: denser low down (it settles), stirred by noise
      float n = texture(tNoise, w * 0.06 + vec3(uTime * 0.01, uTime * 0.015, -uTime * 0.007)).r;
      float n2 = texture(tNoise, w * 0.21 - vec3(0.0, uTime * 0.02, 0.0)).r;
      float dens = uDensity * mix(1.0, (n * 1.4 + n2 * 0.6) * 0.95, uNoiseAmt);
      dens *= mix(1.0, 0.45, smoothstep(uFloorY, uFloorY + uFloorFall, w.y));
      vec3 L = vec3(0.0);
      for (int i = 0; i < ${MAX_FOG_LIGHTS}; i++) {
        if (i >= uCount) break;
        vec3 pl = uLPos[i];
        vec3 dl = pl - w;
        float r = length(dl);
        vec3 ld = dl / r;
        float att;
        vec4 par = uLPar[i];
        if (uLArea[i].x > 0.0) {
          // a lit rectangle (an LED wall): its solid angle from here, one-sided
          vec3 nrm = uLDir[i];
          float cs = dot(-ld, nrm);
          if (cs <= 0.0) continue;
          float A = 4.0 * uLArea[i].x * uLArea[i].y;
          att = A * cs / (r * r + A * 0.25);
          L += uLCol[i] * att / 12.5663706;
          continue;
        }
        att = 1.0 / max(pow(r, par.w), 0.01);
        if (par.z > 0.0) { float q = clamp(1.0 - pow(r / par.z, 4.0), 0.0, 1.0); att *= q * q; }
        if (par.x > -1.5) att *= smoothstep(par.x, par.y, dot(-ld, uLDir[i]));
        if (att <= 1e-6) continue;
        if (uLSh[i] > -0.5) att *= shadowAt(int(uLSh[i] + 0.5), w);
        L += uLCol[i] * att * hg(dot(-ld, -toCam), uAniso);
      }
      if (uGIOn > 0.5) {
        vec3 g = (w - rxGIOrigin) / rxGISize;
        if (all(greaterThan(g, vec3(0.0))) && all(lessThan(g, vec3(1.0))))
          L += vec3(texture(rxGI0, g).x, texture(rxGI1, g).x, texture(rxGI2, g).x) / 3.14159265 * uAmbGain;
      }
      vec4 cur = vec4(L * dens, dens);
      if (any(isnan(cur)) || any(isinf(cur))) cur = vec4(0.0, 0.0, 0.0, dens);
      if (uHasPrev > 0.5) {
        vec4 pc = uPrevVP * vec4(wc, 1.0);
        if (pc.w > 0.0) {
          vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
          float pk = distSlice(pc.w) - 0.5;
          if (all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0))) && pk > 0.0 && pk < uDims.z - 1.0) {
            float k0 = floor(pk);
            vec4 prev = mix(texture2D(tPrev, atlasUv(puv, k0)), texture2D(tPrev, atlasUv(puv, k0 + 1.0)), pk - k0);
            cur = mix(prev, cur, uBlend);
          }
        }
      }
      gl_FragColor = cur;
    }`, {
    uDims: U(new THREE.Vector3()), uCols: U(8), uNear: U(0.3), uFar: U(80),
    uProjInv: U(new THREE.Matrix4()), uCamWorld: U(new THREE.Matrix4()), uFrame: U(0), uDensity: U(0.01), uNoiseAmt: U(0.6), uAniso: U(0.45), uTime: U(0),
    uAmbGain: U(1), uFloorY: U(0), uFloorFall: U(14),
    tNoise: U(null), uCount: U(0),
    uLPos: U(Array.from({ length: MAX_FOG_LIGHTS }, () => new THREE.Vector3())),
    uLDir: U(Array.from({ length: MAX_FOG_LIGHTS }, () => new THREE.Vector3())),
    uLCol: U(Array.from({ length: MAX_FOG_LIGHTS }, () => new THREE.Vector3())),
    uLPar: U(Array.from({ length: MAX_FOG_LIGHTS }, () => new THREE.Vector4())),
    uLSh: U(new Array(MAX_FOG_LIGHTS).fill(-1)),
    uLArea: U(Array.from({ length: MAX_FOG_LIGHTS }, () => new THREE.Vector4())),
    uLRight: U(Array.from({ length: MAX_FOG_LIGHTS }, () => new THREE.Vector3())),
    ...Object.fromEntries(Array.from({ length: S }, (_, i) => [[`tSh${i}`, U(null)], [`uShM${i}`, U(new THREE.Matrix4())], [`uShB${i}`, U(0)]]).flat()),
    uGIOn: U(0), rxGI0: U(null), rxGI1: U(null), rxGI2: U(null), rxGIOrigin: U(new THREE.Vector3()), rxGISize: U(new THREE.Vector3(1, 1, 1)),
    tPrev: U(null), uPrevVP: U(new THREE.Matrix4()), uHasPrev: U(0), uBlend: U(0.12),
  });
}

// front to back along each froxel column: (in-scattered light, transmittance)
export function froxelIntegrateMaterial() {
  return mat(/* glsl */`
    ${FROXEL_COMMON}
    uniform sampler2D tIn;
    uniform mat4 uProjInv;
    varying vec2 vUv;
    void main() {
      vec3 f = froxelOf(floor(gl_FragCoord.xy));
      if (f.z >= uDims.z) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec2 uv = (f.xy + 0.5) / uDims.xy;
      // the slices are depth; the ray through this column is longer than that
      vec4 rv = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      vec3 rd = normalize(rv.xyz / rv.w);
      float stretch = 1.0 / max(-rd.z, 0.2);
      vec3 S = vec3(0.0); float T = 1.0;
      float prev = 0.0;
      for (int k = 0; k < 128; k++) {
        if (float(k) > f.z) break;
        vec4 s = texture2D(tIn, atlasUv(uv, float(k)));
        float d1 = sliceDist(float(k) + 1.0);
        float dt = (d1 - prev) * stretch; prev = d1;
        float sig = max(s.a, 1e-6);
        float tr = exp(-sig * dt);
        S += T * s.rgb / sig * (1.0 - tr);
        T *= tr;
      }
      gl_FragColor = vec4(S, T);
    }`, { uDims: U(new THREE.Vector3()), uCols: U(8), uNear: U(0.3), uFar: U(80), tIn: U(null), uProjInv: U(new THREE.Matrix4()) });
}

// ── composite: scene + reflections, haze, beams ─────────────────────────────
export function compMaterial() {
  return mat(/* glsl */`
    ${COMMON}
    ${FROXEL_COMMON}
    uniform sampler2D tScene, tVol, tSSR, tFog;
    uniform vec2 uVolTexel;
    uniform float uVolShoulder, uSSROn, uFogOn, uSSRGain;
    varying vec2 vUv;
    vec3 sane(vec3 c) {
      return vec3(c.r < 4096.0 ? max(c.r, 0.0) : (c.r > 0.0 ? 4096.0 : 0.0),
                  c.g < 4096.0 ? max(c.g, 0.0) : (c.g > 0.0 ? 4096.0 : 0.0),
                  c.b < 4096.0 ? max(c.b, 0.0) : (c.b > 0.0 ? 4096.0 : 0.0));
    }
    vec2 envBRDF(float rough, float nv) {
      const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
      const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
      vec4 r = rough * c0 + c1;
      float a004 = min(r.x * r.x, exp2(-9.28 * nv)) * r.x + r.y;
      return vec2(-1.04, 1.04) * a004 + r.zw;
    }
    void main() {
      vec3 s = sane(texture2D(tScene, vUv).rgb);
      float z = texture2D(tDepth, vUv).x;
      vec3 P = viewPosZ(vUv, z);
      if (uSSROn > 0.5) {
        vec4 g = texture2D(tG, vUv);
        if (g.a > 0.002 && z < 0.99999) {
          vec4 r = texture2D(tSSR, vUv);
          vec3 N = rxOctDecode(g.xy);
          float nv = clamp(dot(N, normalize(-P)), 0.0, 1.0);
          vec2 ab = envBRDF(g.z, nv);
          float F = g.a * ab.x + min(1.0, g.a * 25.0) * ab.y;
          s += sane(r.rgb) * r.a * F * uSSRGain;
        }
      }
      if (uFogOn > 0.5) {
        float d = z >= 0.99999 ? uFar : -P.z;
        float k = clamp(distSlice(d) - 0.5, 0.0, uDims.z - 1.0);
        float k0 = floor(k), k1 = min(k0 + 1.0, uDims.z - 1.0);
        vec4 f = mix(texture2D(tFog, atlasUv(vUv, k0)), texture2D(tFog, atlasUv(vUv, k1)), k - k0);
        s = s * f.a + f.rgb;
      }
      vec2 o = uVolTexel * 0.75;
      vec3 v = texture2D(tVol, vUv).rgb * 0.36
             + (texture2D(tVol, vUv + vec2(o.x, o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, o.y)).rgb
             +  texture2D(tVol, vUv + vec2(o.x, -o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, -o.y)).rgb) * 0.16;
      v = sane(v);
      v /= 1.0 + max(v.r, max(v.g, v.b)) * uVolShoulder;
      gl_FragColor = vec4(min(s + v, vec3(4096.0)), 1.0);
    }`, {
    tDepth: U(null), tG: U(null), uProj: U(new THREE.Matrix4()), uProjInv: U(new THREE.Matrix4()), uFull: U(new THREE.Vector2(1, 1)), uFrame: U(0),
    uDims: U(new THREE.Vector3()), uCols: U(8), uNear: U(0.3), uFar: U(80),
    tScene: U(null), tVol: U(null), tSSR: U(null), tFog: U(null), uVolTexel: U(new THREE.Vector2()), uVolShoulder: U(0),
    uSSROn: U(1), uFogOn: U(1), uSSRGain: U(1),
  });
}

// ── temporal resolve ────────────────────────────────────────────────────────
export function taaMaterial() {
  return mat(/* glsl */`
    uniform sampler2D tCur, tHist, tDepth;
    uniform mat4 uProjInv, uCamWorld, uPrevVP;
    uniform vec2 uTexel;
    uniform float uAlpha, uReset;
    varying vec2 vUv;
    vec3 toY(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
    vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
    // tone-weighted, so a hot pixel does not dominate its neighbours
    vec3 tw(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
    vec3 itw(vec3 c) { return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-3); }
    vec3 cmr(sampler2D t, vec2 uv) {
      // Catmull-Rom in five bilinear taps
      vec2 sz = 1.0 / uTexel;
      vec2 p = uv * sz - 0.5, f = fract(p), c = floor(p) + 0.5;
      vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
      vec2 w12 = w1 + w2, o12 = w2 / w12;
      vec2 t0 = (c - 1.0) * uTexel, t3 = (c + 2.0) * uTexel, t12 = (c + o12) * uTexel;
      vec3 r = texture2D(t, vec2(t12.x, t0.y)).rgb * w12.x * w0.y
             + texture2D(t, vec2(t0.x, t12.y)).rgb * w0.x * w12.y
             + texture2D(t, t12).rgb * w12.x * w12.y
             + texture2D(t, vec2(t3.x, t12.y)).rgb * w3.x * w12.y
             + texture2D(t, vec2(t12.x, t3.y)).rgb * w12.x * w3.y;
      float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
      return max(r / wsum, 0.0);
    }
    void main() {
      vec3 cur = texture2D(tCur, vUv).rgb;
      if (uReset > 0.5) { gl_FragColor = vec4(cur, 1.0); return; }
      vec3 m1 = vec3(0.0), m2 = vec3(0.0);
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 c = toY(tw(texture2D(tCur, vUv + vec2(float(x), float(y)) * uTexel).rgb));
        m1 += c; m2 += c * c;
      }
      m1 /= 9.0; m2 /= 9.0;
      vec3 sd = sqrt(max(m2 - m1 * m1, 0.0));
      float z = texture2D(tDepth, vUv).x;
      vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
      vec3 w = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
      vec4 pc = uPrevVP * vec4(w, 1.0);
      vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
      bool off = any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)));
      if (off) { gl_FragColor = vec4(cur, 1.0); return; }
      vec3 h = toY(tw(cmr(tHist, puv)));
      // clip the history toward the neighbourhood's mean, inside its spread
      vec3 lo = m1 - sd * 1.1, hi = m1 + sd * 1.1;
      vec3 c0 = 0.5 * (hi + lo), e = 0.5 * (hi - lo) + 1e-5;
      vec3 vv = h - c0, a = abs(vv / e);
      float ma = max(a.x, max(a.y, a.z));
      if (ma > 1.0) h = c0 + vv / ma;
      float speed = length((puv - vUv) / uTexel);
      float alpha = mix(uAlpha, 0.25, clamp(speed / 8.0, 0.0, 1.0));
      vec3 res = mix(h, toY(tw(cur)), alpha);
      gl_FragColor = vec4(itw(fromY(res)), 1.0);
    }`, {
    tCur: U(null), tHist: U(null), tDepth: U(null), uProjInv: U(new THREE.Matrix4()), uCamWorld: U(new THREE.Matrix4()), uPrevVP: U(new THREE.Matrix4()),
    uTexel: U(new THREE.Vector2()), uAlpha: U(0.1), uReset: U(1),
  });
}

export function copyMaterial() {
  return mat('uniform sampler2D tIn; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tIn, vUv).rgb, 1.0); }', { tIn: U(null) });
}

// ── the final grade: AgX for SDR, an extended curve for HDR ─────────────────
// uOut: 0 SDR, 1 HDR (the high byte of each channel), 2 HDR (the low byte).
// uTone: 0 the app's ACES fit, 1 AgX.
export const FINAL_RX = {
  uniforms: {
    tDiffuse: U(null), uExposure: U(1), uTime: U(0), uVignette: U(0.35),
    uCA: U(0.002), uGrain: U(0.035), uSat: U(1.05), uRes: U(new THREE.Vector2(1, 1)),
    uLift: U(new THREE.Color(0, 0, 0)), uGain: U(new THREE.Color(1, 1, 1)), uFade: U(1),
    uTone: U(1), uOut: U(0), uPeak: U(4), uExpRx: U(1), uContrast: U(1.08), uSharpen: U(0), toneMappingExposure: U(1),
  },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uExposure, uTime, uVignette, uCA, uGrain, uSat, uFade, uTone, uOut, uPeak, uExpRx, uContrast, uSharpen;
    uniform vec2 uRes; uniform vec3 uLift, uGain;
    varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    vec3 rxRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c) {
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= 1.0 / 0.6;
      c = IN * c; c = rxRRT(c); c = OUT * c;
      return clamp(c, 0.0, 1.0);
    }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    // HDR: linear through the mid-tones, rolling off to the display's peak,
    // and the hottest colours running to white the way a sensor's do
    vec3 hdrCurve(vec3 c) {
      float m = max(c.r, max(c.g, c.b));
      float y = m / (1.0 + m / uPeak);
      vec3 o = c * (y / max(m, 1e-6));
      return mix(o, vec3(y), smoothstep(0.35, 1.0, y / uPeak) * 0.6);
    }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uCA;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + off).b;
      if (uSharpen > 0.0) {
        // contrast-adaptive sharpening (the temporal resolve softens a little)
        vec2 px = 1.0 / uRes;
        vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, s = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
        vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
        vec3 tm = c / (1.0 + c), tn = n / (1.0 + n), ts = s / (1.0 + s), te = e / (1.0 + e), tw = w / (1.0 + w);
        vec3 mn = min(tm, min(min(tn, ts), min(te, tw))), mx = max(tm, max(max(tn, ts), max(te, tw)));
        vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
        vec3 wgt = -amp * uSharpen * 0.2;
        vec3 sh = (tm + (tn + ts + te + tw) * wgt) / (1.0 + 4.0 * wgt);
        sh = clamp(sh, 0.0, 0.999);
        c = sh / (1.0 - sh);
      }
      c *= uExposure * (uTone > 0.5 ? uExpRx : 1.0);
      float vig = smoothstep(0.95, 0.2, length(d * vec2(1.0, 0.85)) * 1.15);
      c *= mix(1.0, vig, uVignette);
      if (uOut > 0.5) {
        c = hdrCurve(c);
        c = c * uGain + uLift * (1.0 - min(c, 1.0));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(mix(vec3(l), c, uSat), 0.0) * uFade;
        // 16 bits per channel across two 8-bit halves of the canvas, perceptual
        vec3 e = pow(clamp(c / 16.0, 0.0, 1.0), vec3(1.0 / 2.4));
        float n = (hash(vUv * uRes + fract(uTime * 13.7) * 311.0) - 0.5) / 65535.0;
        vec3 q = floor(clamp(e + n, 0.0, 1.0) * 65535.0 + 0.5);
        vec3 hiB = floor(q / 256.0), loB = q - hiB * 256.0;
        gl_FragColor = vec4((uOut < 1.5 ? hiB : loB) / 255.0, 1.0);
        return;
      }
      if (uTone > 0.5) {
        c = AgXToneMapping(c);
        // a little more bite than AgX's base look
        c = clamp(mix(vec3(0.18), c, uContrast), 0.0, 1.0);
      } else c = aces(c);
      c = c * uGain + uLift * (1.0 - c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = toSRGB(clamp(c, 0.0, 1.0));
      float g = hash(vUv * uRes + fract(uTime * 13.7) * 311.0) - 0.5;
      c += g * uGrain * (0.5 + 0.5 * (1.0 - l));
      c += (hash(vUv * uRes * 1.3 + 7.0) - 0.5) / 255.0;
      gl_FragColor = vec4(c * uFade, 1.0);
    }`,
};

export function fsq(material) { return new FullScreenQuad(material); }
