// ─────────────────────────────────────────────────────────────────────────────
// volumetric light
//
// Every beam is an analytic cone. Its fragment shader intersects the view ray
// with the cone, clips the segment against the scene's depth — so a beam stops
// on the crowd, on the deck, on a truss — and integrates in-scattered light
// along what is left, with 3D noise for the haze. All beams are ONE instanced
// draw. The haze glow around lamps and screens is the closed-form airlight
// integral for a point source, one full-screen pass.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { V3, noise3D, setMaxAniso, starSprite } from './core.js';

export const VOL_COMMON = /* glsl */`
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform mat4 uProjInv;
  uniform float uFar;
  float sceneDist(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    if (z >= 0.99999) return uFar;
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    return length(v.xyz / v.w);
  }
`;

export class BeamField {
  constructor(max = 200) {
    this.max = max;
    this.items = [];
    const base = new THREE.ConeGeometry(1, 1, 20, 1, false);
    base.translate(0, -0.5, 0);
    base.rotateX(Math.PI);        // apex at the origin, base at y = +1
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aApex = mk(3); this.aDir = mk(3); this.aP = mk(4); this.aQ = mk(4); this.aColor = mk(3);
    geo.setAttribute('iApex', this.aApex);
    geo.setAttribute('iDir', this.aDir);
    geo.setAttribute('iP', this.aP);
    geo.setAttribute('iQ', this.aQ);
    geo.setAttribute('iColor', this.aColor);
    geo.instanceCount = 0;
    this.geo = geo;
    this.uniforms = {
      tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uProjInv: { value: new THREE.Matrix4() },
      uFar: { value: 2000 }, uTime: { value: 0 }, tNoise: { value: null }, uGain: { value: 1 },
    };
    this.mesh = new THREE.Mesh(geo, this.material(12));
    this.mesh.frustumCulled = false;
  }
  material(steps) {
    return new THREE.ShaderMaterial({
      defines: { STEPS: steps },
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec3 iApex; attribute vec3 iDir; attribute vec4 iP; attribute vec4 iQ; attribute vec3 iColor;
        varying vec3 vWorld; varying vec3 vApex; varying vec3 vDir; varying vec4 vP; varying vec4 vQ; varying vec3 vColor;
        void main() {
          vec3 d = normalize(iDir);
          vec3 up = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 t = normalize(cross(up, d));
          vec3 b = cross(d, t);
          float L = iP.y;
          float R = iP.x * L * 1.1 + 0.05;
          vec3 w = iApex + d * (position.y * L * 1.02) + (t * position.x + b * position.z) * R;
          vWorld = w; vApex = iApex; vDir = d; vP = iP; vQ = iQ; vColor = iColor;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        precision highp sampler3D;
        ${VOL_COMMON}
        uniform float uTime, uGain;
        uniform sampler3D tNoise;
        varying vec3 vWorld; varying vec3 vApex; varying vec3 vDir; varying vec4 vP; varying vec4 vQ; varying vec3 vColor;
        void main() {
          vec2 uv = gl_FragCoord.xy / uRes;
          vec3 ro = cameraPosition;
          vec3 rd = normalize(vWorld - ro);
          float tScene = sceneDist(uv);
          float tanA = vP.x, L = vP.y, hMin = vP.w;
          float c2 = 1.0 / (1.0 + tanA * tanA);
          vec3 co = ro - vApex;
          float dv = dot(rd, vDir), cv = dot(co, vDir);
          float a = dv * dv - c2;
          float b = 2.0 * (dv * cv - dot(rd, co) * c2);
          float c = cv * cv - dot(co, co) * c2;
          float disc = b * b - 4.0 * a * c;
          if (disc < 0.0 || abs(a) < 1e-7) discard;
          float sq = sqrt(disc);
          float r1 = (-b - sq) / (2.0 * a), r2 = (-b + sq) / (2.0 * a);
          float lo = min(r1, r2), hi = max(r1, r2);
          float t0, t1;
          if (a < 0.0) {
            t0 = lo; t1 = hi;
            if (cv + dv * 0.5 * (lo + hi) < 0.0) discard;
          } else if (dv > 0.0) {
            t0 = hi; t1 = 1e5;
            if (cv + dv * hi < 0.0) discard;
          } else {
            t0 = -1e5; t1 = lo;
            if (cv + dv * lo < 0.0) discard;
          }
          if (abs(dv) > 1e-5) {
            float tL = (L - cv) / dv, tM = (hMin - cv) / dv;
            if (dv > 0.0) { t1 = min(t1, tL); t0 = max(t0, tM); }
            else { t0 = max(t0, tL); t1 = min(t1, tM); }
          } else if (cv > L || cv < hMin) discard;
          t0 = max(t0, 0.0);
          t1 = min(t1, tScene);
          if (t1 <= t0) discard;
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uTime * 7.31);
          float dt = (t1 - t0) / float(STEPS);
          float soft = vQ.x, nAmt = vQ.y, fallExp = vQ.z;
          float acc = 0.0;
          for (int i = 0; i < STEPS; i++) {
            float t = t0 + (float(i) + dither) * dt;
            vec3 pw = ro + rd * t;
            vec3 p = pw - vApex;
            float h = dot(p, vDir);
            float rr = max(dot(p, p) - h * h, 0.0);
            float R = max(h * tanA, 1e-3);
            float x = rr / (R * R);
            float hard = 1.0 - smoothstep(0.55, 1.0, x);
            float prof = mix(hard * (0.55 + 0.45 * (1.0 - x)), exp(-3.2 * x) * step(x, 1.0), soft);
            float fall = pow(1.0 + h * 0.25, -fallExp);
            float n = texture(tNoise, pw * 0.045 + vec3(uTime * 0.012, uTime * 0.02, -uTime * 0.008)).r;
            float n2 = texture(tNoise, pw * 0.16 - vec3(0.0, uTime * 0.03, 0.0)).r;
            float haze = mix(1.0, (n * 1.5 + n2 * 0.5) * 0.9, nAmt);
            acc += prof * fall * haze;
          }
          acc *= dt;
          gl_FragColor = vec4(vColor * vP.z * acc * uGain, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.BackSide,
    });
  }
  setSteps(n) { this.mesh.material.dispose(); this.mesh.material = this.material(n); }
  clear() { this.items.length = 0; }
  // opts: pos, dir, angle (half-angle, rad), length, color, intensity, soft,
  // noise, fall, lens (aperture radius, m)
  add(o) {
    const b = {
      pos: o.pos ? o.pos.clone() : V3(), dir: (o.dir || V3(0, -1, 0)).clone().normalize(),
      angle: o.angle ?? 0.1, length: o.length ?? 20, color: new THREE.Color(o.color ?? 0xffffff),
      intensity: o.intensity ?? 1, soft: o.soft ?? 0.3, noise: o.noise ?? 0.7, fall: o.fall ?? 1.3, lens: o.lens ?? 0.1,
    };
    this.items.push(b);
    return b;
  }
  sync() {
    let n = 0;
    const A = this.aApex.array, D = this.aDir.array, P = this.aP.array, Q = this.aQ.array, C = this.aColor.array;
    for (const b of this.items) {
      if (b.intensity <= 1e-4 || n >= this.max) continue;
      const tanA = Math.tan(b.angle);
      // pull the apex back behind the lens so the beam leaves the lens at its
      // real aperture rather than from a point
      const back = b.lens / Math.max(tanA, 1e-3);
      A[n * 3] = b.pos.x - b.dir.x * back; A[n * 3 + 1] = b.pos.y - b.dir.y * back; A[n * 3 + 2] = b.pos.z - b.dir.z * back;
      D[n * 3] = b.dir.x; D[n * 3 + 1] = b.dir.y; D[n * 3 + 2] = b.dir.z;
      P[n * 4] = tanA; P[n * 4 + 1] = b.length + back; P[n * 4 + 2] = b.intensity; P[n * 4 + 3] = back;
      Q[n * 4] = b.soft; Q[n * 4 + 1] = b.noise; Q[n * 4 + 2] = b.fall; Q[n * 4 + 3] = 0;
      C[n * 3] = b.color.r; C[n * 3 + 1] = b.color.g; C[n * 3 + 2] = b.color.b;
      n++;
    }
    this.geo.instanceCount = n;
    for (const a of [this.aApex, this.aDir, this.aP, this.aQ, this.aColor]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
}

// Airlight: in-scatter from point sources along each view ray, closed form.
export class HazeField {
  constructor() {
    this.MAX = 16;
    this.items = [];
    this.uniforms = {
      tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() }, uFar: { value: 2000 },
      uPos: { value: Array.from({ length: this.MAX }, () => V3()) },
      uCol: { value: Array.from({ length: this.MAX }, () => V3()) },
      uCount: { value: 0 },
      uDensity: { value: 0.02 },
      uAmb: { value: new THREE.Color(0) },
      uAmbDist: { value: 60 },
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        precision highp float;
        ${VOL_COMMON}
        uniform mat4 uCamWorld;
        uniform vec3 uPos[${this.MAX}];
        uniform vec3 uCol[${this.MAX}];
        uniform int uCount;
        uniform float uDensity, uAmbDist;
        uniform vec3 uAmb;
        varying vec2 vUv;
        void main() {
          vec2 uv = gl_FragCoord.xy / uRes;
          vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
          vec3 rd = normalize(mat3(uCamWorld) * (v.xyz / v.w));
          vec3 ro = cameraPosition;
          float tMax = min(sceneDist(uv), uFar);
          vec3 sum = vec3(0.0);
          for (int i = 0; i < ${this.MAX}; i++) {
            if (i >= uCount) break;
            vec3 P = uPos[i];
            float tc = dot(P - ro, rd);
            float h = max(length(ro + rd * tc - P), 0.35);
            float F = (atan((tMax - tc) / h) - atan(-tc / h)) / h;
            sum += uCol[i] * F;
          }
          vec3 amb = uAmb * (1.0 - exp(-tMax / uAmbDist));
          gl_FragColor = vec4(sum * uDensity + amb, 1.0);
        }`,
      depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }
  clear() { this.items.length = 0; }
  // A point that glows in the haze. `power` scales `color`.
  add(pos, color, power = 1) { const h = { pos: pos.clone(), color: new THREE.Color(color), power }; this.items.push(h); return h; }
  sync() {
    const U = this.uniforms;
    let n = 0;
    for (const h of this.items) {
      if (n >= this.MAX || h.power <= 1e-4) continue;
      U.uPos.value[n].copy(h.pos);
      U.uCol.value[n].set(h.color.r * h.power, h.color.g * h.power, h.color.b * h.power);
      n++;
    }
    U.uCount.value = n;
  }
}

// Lamp flares: a billboard at every lens, bright when the lamp points at you.
export class FlareField {
  constructor(max = 256) {
    this.max = max;
    this.items = [];
    const geo = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    geo.index = q.index;
    geo.setAttribute('position', q.attributes.position);
    geo.setAttribute('uv', q.attributes.uv);
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(3); this.aCol = mk(4);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { tMap: { value: starSprite() } },
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec4 iCol;
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          vUv = uv; vCol = iCol.rgb;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iCol.a;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap; varying vec2 vUv; varying vec3 vCol;
        void main() { gl_FragColor = vec4(vCol * texture2D(tMap, vUv).a, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }
  clear() { this.items.length = 0; }
  add(pos, color, size = 1, intensity = 1) { const f = { pos: pos.clone(), color: new THREE.Color(color), size, intensity }; this.items.push(f); return f; }
  sync() {
    let n = 0;
    const P = this.aPos.array, C = this.aCol.array;
    for (const f of this.items) {
      if (f.intensity <= 1e-3 || n >= this.max) continue;
      P[n * 3] = f.pos.x; P[n * 3 + 1] = f.pos.y; P[n * 3 + 2] = f.pos.z;
      C[n * 4] = f.color.r * f.intensity; C[n * 4 + 1] = f.color.g * f.intensity; C[n * 4 + 2] = f.color.b * f.intensity; C[n * 4 + 3] = f.size;
      n++;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
  }
}

// The art has to read. Haze and beams in front of a screen are physically
// right and look wrong: the sleeve goes milky behind a wash of coloured air. So
// after the volumetrics are drawn, every screen face is drawn once more into
// that buffer with a multiply blend, thinning the air in front of it. Not to a
// trace: a wall with no air in front of it, in a room full of haze, reads as
// pasted on over the room. Somewhat under half is kept, and the art still
// reads through it. The scene's own depth decides which pixels of the face
// are visible, so a head or a truss in front of the screen keeps its haze.
export class ScreenMask {
  constructor() {
    this.scene = new THREE.Scene();
    this.uniforms = { tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uKeep: { value: 0.45 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDepth; uniform vec2 uRes; uniform float uKeep;
        void main() {
          float d = texture2D(tDepth, gl_FragCoord.xy / uRes).x;
          float hidden = step(d, gl_FragCoord.z - 0.00003);
          gl_FragColor = vec4(vec3(mix(uKeep, 1.0, hidden)), 1.0);
        }`,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
  }
  add(face) {
    const m = new THREE.Mesh(face.geometry, this.mat);
    m.matrixAutoUpdate = false;
    m.frustumCulled = false;
    m.userData.src = face;
    this.scene.add(m);
  }
  clear() { for (const m of [...this.scene.children]) this.scene.remove(m); }
  // The mask lives directly under its own scene, so its LOCAL matrix is its
  // world matrix. Writing matrixWorld alone does not survive the render: the
  // scene's update recomputes it from the local one.
  sync() { for (const m of this.scene.children) { m.userData.src.updateWorldMatrix(true, false); m.matrix.copy(m.userData.src.matrixWorld); m.matrixWorld.copy(m.matrix); } }
}

// ─────────────────────────────────────────────────────────────────────────────
// the pipeline: scene → (MSAA HDR + depth) → volumetrics at reduced res →
// composite → bloom → lens + tone → screen (no film grain: it read as noise)
// ─────────────────────────────────────────────────────────────────────────────

// the i-th term of the Halton sequence in base b (0..1): TAA's jitter
function halton(i, b) {
  let f = 1, r = 0;
  while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
  return r;
}

export const QUALITY = {
  // taa: temporal anti-aliasing (TAAPass; the scene is then drawn without
  // MSAA, the jitter does its work); ao: screen-space ambient occlusion
  high: { dpr: 3, msaa: 4, vol: 0.5, steps: 12, shadows: true, shadowSize: 2048, crowd: 1, rig: 1, bloom: true, grain: false, taa: true, ao: true },
  low: { dpr: 1, msaa: 0, vol: 0.33, steps: 6, shadows: false, shadowSize: 512, crowd: 0.4, rig: 0.5, bloom: true, grain: false, taa: false, ao: false },
};

// Screen-space ambient occlusion from the scene's own depth (no second draw of
// the scene): each pixel's position and normal are rebuilt from the depth, and
// a few points around it within `uRadius` metres are tested for whether they
// stand above its surface. The sample pattern turns every frame, so with TAA
// the noise of eight samples averages out; a depth-aware blur in the
// composite takes the rest. Far off, where the radius is under a pixel, it
// does nothing.
const AO_SHADER = {
  uniforms: {
    tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
    uDepthTexel: { value: new THREE.Vector2(1, 1) }, uRes: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 0.9 }, uIntensity: { value: 1.25 }, uFrame: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDepth; uniform mat4 uProjInv, uProj; uniform vec2 uDepthTexel, uRes;
    uniform float uRadius, uIntensity, uFrame;
    varying vec2 vUv;
    vec3 viewPos(vec2 uv) {
      float d = texture2D(tDepth, uv).r;
      vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return v.xyz / v.w;
    }
    void main() {
      float d = texture2D(tDepth, vUv).r;
      if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 p = viewPos(vUv);
      // the normal from the nearer neighbour on each axis, so an edge does not
      // bend it towards the surface behind
      vec3 l = viewPos(vUv - vec2(uDepthTexel.x, 0.0)), r = viewPos(vUv + vec2(uDepthTexel.x, 0.0));
      vec3 b = viewPos(vUv - vec2(0.0, uDepthTexel.y)), t = viewPos(vUv + vec2(0.0, uDepthTexel.y));
      vec3 dx = abs(r.z - p.z) < abs(p.z - l.z) ? r - p : p - l;
      vec3 dy = abs(t.z - p.z) < abs(p.z - b.z) ? t - p : p - b;
      vec3 n = normalize(cross(dx, dy));
      if (dot(n, p) > 0.0) n = -n;
      // the radius on screen, in AO pixels: nothing to do when it is under one
      float rpx = uRadius * uProj[1][1] * 0.5 * uRes.y / max(0.1, -p.z);
      if (rpx < 1.0) { gl_FragColor = vec4(1.0); return; }
      rpx = min(rpx, 48.0);
      // interleaved gradient noise, turned a little each frame
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 5.588238 * uFrame, vec2(0.06711056, 0.00583715))));
      float occ = 0.0;
      const int N = 8;
      for (int i = 0; i < N; i++) {
        float fi = float(i);
        float a = (fi + ign) * 2.39996323;
        float rr = sqrt((fi + 0.5) / float(N)) * rpx;
        vec2 suv = vUv + vec2(cos(a), sin(a)) * rr / uRes;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
        vec3 v = viewPos(suv) - p;
        float dist = length(v);
        float fall = 1.0 - smoothstep(0.5 * uRadius, uRadius, dist);
        occ += max(0.0, dot(n, v) / max(dist, 1e-3) - 0.12) * fall;
      }
      float ao = clamp(1.0 - occ / float(N) * uIntensity, 0.0, 1.0);
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`,
};

export class VenuePass extends Pass {
  constructor(pipe) {
    super();
    this.pipe = pipe;
    this.needsSwap = true;
    this.sceneRT = null;
    this.volRT = null;
    this.aoRT = null;
    this.ao = new FullScreenQuad(new THREE.ShaderMaterial({ ...AO_SHADER, uniforms: THREE.UniformsUtils.clone(AO_SHADER.uniforms), depthTest: false, depthWrite: false }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tVol: { value: null }, uVolTexel: { value: new THREE.Vector2() },
        tAO: { value: null }, tDepth: { value: null }, uAOTexel: { value: new THREE.Vector2(1, 1) }, uAO: { value: 0 },
        uNear: { value: 0.1 }, uFar: { value: 2000 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // A glint off a glossy surface under a stage light can overflow a half
      // float to Inf (or a degenerate normal give NaN); the bloom's blur would
      // spread it into a black block per mip. Stop it here: NaN to black, the
      // rest held far above white but well inside half-float range.
      fragmentShader: /* glsl */`
        uniform sampler2D tScene, tVol, tAO, tDepth; uniform vec2 uVolTexel, uAOTexel; uniform float uAO;
        uniform float uNear, uFar;
        varying vec2 vUv;
        vec3 sane(vec3 c) {
          return vec3(c.r < 4096.0 ? max(c.r, 0.0) : (c.r > 0.0 ? 4096.0 : 0.0),
                      c.g < 4096.0 ? max(c.g, 0.0) : (c.g > 0.0 ? 4096.0 : 0.0),
                      c.b < 4096.0 ? max(c.b, 0.0) : (c.b > 0.0 ? 4096.0 : 0.0));
        }
        float linz(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
        // the occlusion, blurred across the surface but not across an edge
        float occlusion() {
          float z0 = linz(texture2D(tDepth, vUv).r);
          float sum = texture2D(tAO, vUv).r, ws = 1.0;
          for (int i = 0; i < 4; i++) {
            vec2 o = vec2(i < 2 ? -1.5 : 1.5, (i == 0 || i == 2) ? -1.5 : 1.5) * uAOTexel;
            float z = linz(texture2D(tDepth, vUv + o).r);
            float w = max(0.0, 1.0 - abs(z - z0) / (0.04 * z0 + 0.05));
            sum += texture2D(tAO, vUv + o).r * w; ws += w;
          }
          return sum / ws;
        }
        void main() {
          vec3 s = sane(texture2D(tScene, vUv).rgb);
          // ambient occlusion darkens the lit surfaces, not what gives light:
          // the screens, the sticks and the lamps (over 1) keep their level
          if (uAO > 0.5) {
            float lum = max(s.r, max(s.g, s.b));
            s *= mix(occlusion(), 1.0, smoothstep(0.8, 2.5, lum));
          }
          vec2 o = uVolTexel * 0.75;
          vec3 v = texture2D(tVol, vUv).rgb * 0.36
                 + (texture2D(tVol, vUv + vec2(o.x, o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, o.y)).rgb
                 +  texture2D(tVol, vUv + vec2(o.x, -o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, -o.y)).rgb) * 0.16;
          gl_FragColor = vec4(min(s + sane(v), vec3(4096.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  // The scene is drawn at the dynamic resolution's share of the screen and
  // brought up to the screen's own size in the composite; the bloom, the tone
  // and the dither after it run at full size, so a lowered scale reads as a
  // little softer rather than as coarse, crawling pixels.
  alloc(fw, fh) {
    const q = this.pipe.q;
    this.full = { w: fw, h: fh };
    const w = Math.max(1, Math.round(fw * this.pipe.scale)), h = Math.max(1, Math.round(fh * this.pipe.scale));
    this.sceneRT?.dispose(); this.volRT?.dispose(); this.aoRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.taa && this.pipe.taaOn ? 0 : q.msaa });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    const vw = Math.max(1, Math.round(w * q.vol)), vh = Math.max(1, Math.round(h * q.vol));
    this.volRT = new THREE.WebGLRenderTarget(vw, vh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.comp.material.uniforms.uVolTexel.value.set(1 / vw, 1 / vh);
    // the occlusion at half the scene's resolution
    const aw = Math.max(1, Math.round(w / 2)), ah = Math.max(1, Math.round(h / 2));
    this.aoRT = new THREE.WebGLRenderTarget(aw, ah, { type: THREE.UnsignedByteType, depthBuffer: false });
    const A = this.ao.material.uniforms;
    A.uRes.value.set(aw, ah); A.uDepthTexel.value.set(1 / w, 1 / h);
    this.comp.material.uniforms.uAOTexel.value.set(1 / aw, 1 / ah);
    this.pipe.taa?.reset();
  }
  // the occlusion for this frame into aoRT (when it is on), and the composite
  // told whether to use it
  renderAO(renderer) {
    const p = this.pipe, C = this.comp.material.uniforms;
    const on = p.aoOn && p.q.ao;
    C.uAO.value = on ? 1 : 0;
    if (!on) return;
    const A = this.ao.material.uniforms;
    A.tDepth.value = this.sceneRT.depthTexture;
    A.uProj.value.copy(p.camera.projectionMatrix);
    A.uProjInv.value.copy(p.camera.projectionMatrixInverse);
    A.uFrame.value = p.taaOn && p.q.taa ? p.frameIdx % 64 : 0;
    renderer.setRenderTarget(this.aoRT);
    this.ao.render(renderer);
    C.tAO.value = this.aoRT.texture;
    C.tDepth.value = this.sceneRT.depthTexture;
    C.uNear.value = p.camera.near; C.uFar.value = p.camera.far;
  }
  setSize(w, h) { this.alloc(w, h); }
  render(renderer, writeBuffer) {
    const p = this.pipe;
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(p.scene, p.camera);
    this.renderAO(renderer);
    // light shafts and haze off: the volume target stays black and adds nothing
    if (!p.volOn) {
      const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
      renderer.setRenderTarget(this.volRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
      renderer.setClearColor(cc, ca);
      this.comp.material.uniforms.tScene.value = this.sceneRT.texture;
      this.comp.material.uniforms.tVol.value = this.volRT.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.comp.render(renderer);
      return;
    }

    const vw = this.volRT.width, vh = this.volRT.height;
    for (const U of [p.beams.uniforms, p.haze.uniforms]) {
      U.tDepth.value = this.sceneRT.depthTexture;
      U.uRes.value.set(vw, vh);
      U.uProjInv.value.copy(p.camera.projectionMatrixInverse);
      U.uFar.value = p.camera.far * 0.98;
    }
    p.haze.uniforms.uCamWorld.value.copy(p.camera.matrixWorld);
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(this.volRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(p.volScene, p.camera);
    if (p.mask.scene.children.length) {
      p.mask.sync();
      p.mask.uniforms.tDepth.value = this.sceneRT.depthTexture;
      p.mask.uniforms.uRes.value.set(vw, vh);
      const ac = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(p.mask.scene, p.camera);
      renderer.autoClear = ac;
    }
    renderer.setClearColor(cc, ca);

    this.comp.material.uniforms.tScene.value = this.sceneRT.texture;
    this.comp.material.uniforms.tVol.value = this.volRT.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }
  dispose() { this.sceneRT?.dispose(); this.volRT?.dispose(); this.aoRT?.dispose(); this.comp.dispose(); this.ao.dispose(); this.ao.material.dispose(); }
}

// Temporal anti-aliasing. The scene is drawn with the projection nudged by a
// sub-pixel each frame (Pipeline.render); this pass takes each pixel back to
// where it was last frame through the depth and the camera's last matrices,
// and blends the new frame into that history. The history is held to the
// colours around the pixel now (a variance box in YCoCg), so a crowd that
// moves or a light that changes does not leave a ghost; it is read with a
// Catmull-Rom filter and the result lightly sharpened, so the averaging
// smooths edges without softening the picture. The blend is done on a
// tonemapped copy, so a bright highlight does not dominate its neighbours.
export class TAAPass extends Pass {
  constructor(pipe) {
    super();
    this.pipe = pipe;
    this.needsSwap = true;
    this.hist = [null, null];
    this.valid = false;
    this.prevVP = new THREE.Matrix4();
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.resolve = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tCur: { value: null }, tHist: { value: null }, tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1, 1) }, uValid: { value: 0 },
      },
      vertexShader: vs,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tCur, tHist, tDepth; uniform mat4 uInvProj, uCamWorld, uPrevVP;
        uniform vec2 uTexel; uniform float uValid;
        varying vec2 vUv;
        vec3 tm(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
        vec3 toY(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
        vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
        vec3 history(vec2 uv) {
          // Catmull-Rom in five taps (the corners dropped)
          vec2 sp = uv / uTexel, tc = floor(sp - 0.5) + 0.5, f = sp - tc;
          vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
          vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
          vec2 w12 = w1 + w2, t12 = (tc + w2 / w12) * uTexel, t0 = (tc - 1.0) * uTexel, t3 = (tc + 2.0) * uTexel;
          vec3 r = texture2D(tHist, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y)
                 + texture2D(tHist, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
                 + texture2D(tHist, t12).rgb * (w12.x * w12.y)
                 + texture2D(tHist, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
                 + texture2D(tHist, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
          float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
          return max(r / ws, vec3(0.0));
        }
        vec3 clipBox(vec3 lo, vec3 hi, vec3 p) {
          vec3 c = 0.5 * (hi + lo), e = 0.5 * (hi - lo) + 1e-4, v = p - c;
          vec3 u = abs(v / e);
          float m = max(u.x, max(u.y, u.z));
          return m > 1.0 ? c + v / m : p;
        }
        void main() {
          vec3 cur = toY(tm(texture2D(tCur, vUv).rgb));
          vec3 m1 = vec3(0.0), m2 = vec3(0.0), lo = vec3(1e9), hi = vec3(-1e9);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec3 c = toY(tm(texture2D(tCur, vUv + vec2(float(x), float(y)) * uTexel).rgb));
            m1 += c; m2 += c * c; lo = min(lo, c); hi = max(hi, c);
          }
          vec3 mean = m1 / 9.0, sd = sqrt(max(m2 / 9.0 - mean * mean, 0.0));
          vec3 vlo = max(lo, mean - sd * 1.25), vhi = min(hi, mean + sd * 1.25);
          float d = texture2D(tDepth, vUv).r;
          vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 w = uCamWorld * vec4(v.xyz / v.w, 1.0);
          vec4 pc = uPrevVP * w;
          vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
          if (uValid < 0.5 || pc.w <= 0.0 || puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0) {
            gl_FragColor = vec4(fromY(cur), 1.0);
            return;
          }
          vec3 h = clipBox(vlo, vhi, toY(history(puv)));
          // the new frame's share: a tenth when still, more as the pixel moves
          float moved = length((puv - vUv) / uTexel);
          float a = mix(0.1, 0.4, clamp(moved / 24.0, 0.0, 1.0));
          gl_FragColor = vec4(fromY(mix(h, cur, a)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
    // out of the tonemapped history, lightly sharpened, back to linear
    this.out = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tHist: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uSharp: { value: 0.22 } },
      vertexShader: vs,
      fragmentShader: /* glsl */`
        uniform sampler2D tHist; uniform vec2 uTexel; uniform float uSharp; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tHist, vUv).rgb;
          vec3 n = texture2D(tHist, vUv + vec2(0.0, uTexel.y)).rgb, s = texture2D(tHist, vUv - vec2(0.0, uTexel.y)).rgb;
          vec3 e = texture2D(tHist, vUv + vec2(uTexel.x, 0.0)).rgb, w = texture2D(tHist, vUv - vec2(uTexel.x, 0.0)).rgb;
          vec3 lo = min(c, min(min(n, s), min(e, w))), hi = max(c, max(max(n, s), max(e, w)));
          c = clamp(c + (c - 0.25 * (n + s + e + w)) * uSharp, lo, hi);
          float m = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c / max(1e-4, 1.0 - min(m, 0.9995)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  reset() { this.valid = false; }
  setSize(w, h) {
    for (const t of this.hist) t?.dispose();
    this.hist = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.resolve.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.out.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.valid = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    const p = this.pipe, R = this.resolve.material.uniforms;
    const [prev, next] = this.hist;
    R.tCur.value = readBuffer.texture;
    R.tHist.value = prev.texture;
    R.tDepth.value = p.venuePass.sceneRT.depthTexture;
    R.uInvProj.value.copy(p.camera.projectionMatrixInverse);
    R.uCamWorld.value.copy(p.camera.matrixWorld);
    R.uPrevVP.value.copy(this.prevVP);
    R.uValid.value = this.valid ? 1 : 0;
    renderer.setRenderTarget(next);
    this.resolve.render(renderer);
    this.out.material.uniforms.tHist.value = next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.out.render(renderer);
    this.hist = [next, prev];
    this.valid = true;
  }
  dispose() { for (const t of this.hist) t?.dispose(); for (const q of [this.resolve, this.out]) { q.material.dispose(); q.dispose(); } }
}

export const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uExposure: { value: 1 }, uTime: { value: 0 }, uVignette: { value: 0.35 },
    uCA: { value: 0.002 }, uGrain: { value: 0.035 }, uSat: { value: 1.05 }, uRes: { value: new THREE.Vector2(1, 1) },
    uLift: { value: new THREE.Color(0, 0, 0) }, uGain: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uExposure, uTime, uVignette, uCA, uGrain, uSat, uFade;
    uniform vec2 uRes; uniform vec3 uLift, uGain;
    varying vec2 vUv;
    // ACES fitted (Stephen Hill), as three.js uses
    vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c) {
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= 1.0 / 0.6;
      c = IN * c; c = RRTAndODTFit(c); c = OUT * c;
      return clamp(c, 0.0, 1.0);
    }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uCA;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + off).b;
      c *= uExposure;
      float vig = smoothstep(0.95, 0.2, length(d * vec2(1.0, 0.85)) * 1.15);
      c *= mix(1.0, vig, uVignette);
      c = aces(c);
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

export class FinalPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({ ...FINAL_SHADER, uniforms: THREE.UniformsUtils.clone(FINAL_SHADER.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }
  setSize(w, h) { this.material.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// How long the GPU takes over a frame, from the timer query extension where
// the browser offers it (desktop Chrome and Edge do). The answer comes back a
// frame or two late; a query begun before a resize is thrown away.
class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.free = []; this.pending = []; this.active = null; this.gen = 0;
    this.samples = [];
  }
  get ok() { return !!this.ext; }
  begin() {
    if (!this.ext || this.active || this.pending.length > 6) return;
    const q = this.free.pop() || this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = { q, gen: this.gen };
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  poll() {
    if (!this.pending.length) return;
    const gl = this.gl;
    const done = [];
    while (this.pending.length && gl.getQueryParameter(this.pending[0].q, gl.QUERY_RESULT_AVAILABLE)) done.push(this.pending.shift());
    if (!done.length) return;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    for (const { q, gen } of done) {
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      this.free.push(q);
      if (!disjoint && gen === this.gen) this.samples.push(ns / 1e6);
    }
  }
  // the frames measured so far belong to the old size
  reset() { this.gen++; this.samples.length = 0; }
  dispose() { for (const { q } of this.pending) this.gl.deleteQuery(q); for (const q of this.free) this.gl.deleteQuery(q); }
}

export class Pipeline {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer = r;
    setMaxAniso(Math.min(16, r.capabilities.getMaxAnisotropy()));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    RectAreaLightUniformsLib.init();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this.scene = new THREE.Scene();
    this.volScene = new THREE.Scene();
    this.beams = new BeamField(220);
    this.haze = new HazeField();
    this.flares = new FlareField(320);
    this.mask = new ScreenMask();
    this.beams.uniforms.tNoise.value = noise3D();
    this.volScene.add(this.haze.mesh);
    this.volScene.add(this.beams.mesh);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.q = QUALITY.high;
    this.qName = 'high';
    this.volOn = true;          // the light shafts and the haze
    this.size = { w: 1, h: 1 };
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    // the costly passes the stage can drop (with volOn): TAA and the occlusion
    this.taaOn = true;
    this.aoOn = true;
    this.venuePass = new VenuePass(this);
    this.taa = new TAAPass(this);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.6, 0.9);
    this.final = new FinalPass();
    this.frameIdx = 0;
    this._lastCam = new THREE.Vector3(1e9, 0, 0);
    this._proj = new THREE.Matrix4();
    this.composer.addPass(this.venuePass);
    this.composer.addPass(this.taa);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.final);
    // dynamic resolution: the share of the screen's own density drawn
    this.scale = 1;
    this.scaleMin = 0.7;
    this.sceneDpr = 1;          // drawn pixels per CSS pixel in the scene target
    this.gpu = new GpuTimer(r.getContext());
    this.gpuMs = NaN;
    this.adaptAt = 0; this.changedAt = 0; this.lastFrame = 0; this.intervalMs = NaN; this.calm = 0;
  }
  // TAA on or off (the stage's effects switch); without it the scene goes back
  // to MSAA, so its target is made again
  setTaa(on) {
    if (this.taaOn === on) return;
    this.taaOn = on;
    if (this.venuePass.full) this.venuePass.alloc(this.venuePass.full.w, this.venuePass.full.h);
  }
  setQuality(name) {
    this.qName = name;
    this.q = QUALITY[name];
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.beams.setSteps(this.q.steps);
    this.resize(this.size.w, this.size.h);
  }
  resize(w, h) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    // the screen's own density, as many pixels drawn as it shows, less only
    // what the dynamic resolution takes off when the GPU is pressed (adapt)
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    this.sceneDpr = dpr * this.scale;
    this.renderer.setPixelRatio(dpr);
    this.gpu.reset();
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(this.size.w, this.size.h);
    this.camera.aspect = this.size.w / this.size.h;
    this.camera.updateProjectionMatrix();
  }
  render(t) {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.beams.uniforms.uTime.value = t;
    this.final.material.uniforms.uTime.value = t;
    this.beams.sync();
    this.haze.sync();
    this.flares.sync();
    this.gpu.poll();
    this.gpu.begin();
    this.frameIdx++;
    const cam = this.camera;
    const taa = this.taaOn && this.q.taa;
    this.taa.enabled = taa;
    if (taa) {
      // a jump (a new seat, a new room) starts the history over
      cam.updateMatrixWorld();
      if (cam.position.distanceToSquared(this._lastCam) > 16) this.taa.reset();
      this._lastCam.copy(cam.position);
      // the sub-pixel nudge: Halton (2, 3) over eight frames, in the scene
      // target's own pixels, taken out again once the frame is drawn
      const i = (this.frameIdx % 8) + 1;
      const jx = halton(i, 2) - 0.5, jy = halton(i, 3) - 0.5;
      const rt = this.venuePass.sceneRT;
      this._proj.copy(cam.projectionMatrix);
      cam.projectionMatrix.elements[8] += (jx * 2) / rt.width;
      cam.projectionMatrix.elements[9] += (jy * 2) / rt.height;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
    this.composer.render();
    if (taa) {
      cam.projectionMatrix.copy(this._proj);
      cam.projectionMatrixInverse.copy(this._proj).invert();
      this.taa.prevVP.multiplyMatrices(this._proj, cam.matrixWorldInverse);
    }
    this.gpu.end();
  }
  // Dynamic resolution. Called after each drawn frame with the frame time the
  // GPU should keep under (`budget`, ms) and the interval frames are meant to
  // come at (`interval`, ms). With the timer query the GPU's own time decides:
  // over budget, the scale drops at once to what should fit; well under, it
  // climbs back a step at a time. Without it, frames arriving late are the
  // only sign, and the scale steps down on those.
  adapt(now, budget, interval) {
    const STEP = 0.05;
    const set = (k) => {
      k = Math.min(1, Math.max(this.scaleMin, Math.round(k / STEP) * STEP));
      if (Math.abs(k - this.scale) < 1e-3) return;
      this.scale = k; this.changedAt = now; this.calm = 0;
      // only the scene's own targets change size; the canvas stays as it is
      this.sceneDpr = this.renderer.getPixelRatio() * k;
      if (this.venuePass.full) this.venuePass.alloc(this.venuePass.full.w, this.venuePass.full.h);
      this.gpu.reset();
    };
    const gap = now - this.lastFrame;
    this.lastFrame = now;
    if (gap > 0 && gap < 500) this.intervalMs = Number.isFinite(this.intervalMs) ? this.intervalMs + (gap - this.intervalMs) * 0.1 : gap;
    if (now - this.adaptAt < 500) return;
    this.adaptAt = now;
    if (this.gpu.ok) {
      const S = this.gpu.samples;
      if (S.length < 6) return;
      const ms = S.reduce((a, b) => a + b, 0) / S.length;
      S.length = 0;
      this.gpuMs = ms;
      if (ms > budget * 1.08) set(this.scale * Math.sqrt(budget / ms) - STEP * 0.5);
      else if (ms < budget * 0.72 && this.scale < 1 && now - this.changedAt > 2000) set(this.scale + STEP);
      return;
    }
    if (!Number.isFinite(this.intervalMs) || now - this.changedAt < 1500) return;
    if (this.intervalMs > interval * 1.35) set(this.scale - STEP * 2);
    else if (this.intervalMs < interval * 1.1) { if (this.scale < 1 && ++this.calm >= 8) set(this.scale + STEP); }
    else this.calm = 0;
  }
  dispose() {
    this.gpu.dispose();
    this.venuePass.dispose();
    this.taa.dispose();
    this.bloom.dispose();
    this.composer.dispose();
    for (const f of [this.beams, this.haze, this.flares]) { f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}

// An environment for reflections: the room's big emitters in a dark box,
// prefiltered. Rebuilt when the art or the palette changes, never per frame.
export function buildEnvironment(pipe, spec) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(spec.ambient ?? 0x020203);
  const box = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), new THREE.MeshBasicMaterial({ color: spec.wall ?? 0x040405, side: THREE.BackSide }));
  box.position.set(0, spec.h / 2, spec.d / 2);
  s.add(box);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.d), new THREE.MeshBasicMaterial({ color: spec.floor ?? 0x020202 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, spec.d / 2);
  s.add(floor);
  for (const e of spec.emitters || []) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h), new THREE.MeshBasicMaterial({ map: e.map || null, color: new THREE.Color(e.color ?? 0xffffff).multiplyScalar(e.power ?? 1) }));
    m.position.copy(e.pos);
    if (e.normal) m.lookAt(e.pos.clone().add(e.normal)); else m.lookAt(spec.eye);
    s.add(m);
  }
  const rt = pipe.pmrem.fromScene(s, 0.02, 0.1, Math.max(spec.w, spec.d) * 2, { position: spec.eye });
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt;
}
