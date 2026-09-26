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
// that buffer with a multiply blend, keeping only a trace of the air in front of
// it. The scene's own depth decides which pixels of the face are visible, so a
// head or a truss in front of the screen keeps its haze.
export class ScreenMask {
  constructor() {
    this.scene = new THREE.Scene();
    this.uniforms = { tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uKeep: { value: 0.14 } };
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
// composite → bloom → lens + tone + grain → screen
// ─────────────────────────────────────────────────────────────────────────────

export const QUALITY = {
  high: { dpr: 1.5, msaa: 4, vol: 0.5, steps: 12, shadows: true, shadowSize: 2048, crowd: 1, bloom: true, grain: true },
  low: { dpr: 1, msaa: 0, vol: 0.33, steps: 6, shadows: false, shadowSize: 512, crowd: 0.4, bloom: true, grain: false },
};

export class VenuePass extends Pass {
  constructor(pipe) {
    super();
    this.pipe = pipe;
    this.needsSwap = true;
    this.sceneRT = null;
    this.volRT = null;
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tVol: { value: null }, uVolTexel: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tScene, tVol; uniform vec2 uVolTexel; varying vec2 vUv;
        void main() {
          vec3 s = texture2D(tScene, vUv).rgb;
          vec2 o = uVolTexel * 0.75;
          vec3 v = texture2D(tVol, vUv).rgb * 0.36
                 + (texture2D(tVol, vUv + vec2(o.x, o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, o.y)).rgb
                 +  texture2D(tVol, vUv + vec2(o.x, -o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, -o.y)).rgb) * 0.16;
          gl_FragColor = vec4(s + v, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
  }
  alloc(w, h) {
    const q = this.pipe.q;
    this.sceneRT?.dispose(); this.volRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    const vw = Math.max(1, Math.round(w * q.vol)), vh = Math.max(1, Math.round(h * q.vol));
    this.volRT = new THREE.WebGLRenderTarget(vw, vh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.comp.material.uniforms.uVolTexel.value.set(1 / vw, 1 / vh);
  }
  setSize(w, h) { this.alloc(w, h); }
  render(renderer, writeBuffer) {
    const p = this.pipe;
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(p.scene, p.camera);
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
  dispose() { this.sceneRT?.dispose(); this.volRT?.dispose(); this.comp.dispose(); }
}

export const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uExposure: { value: 1 }, uTime: { value: 0 }, uVignette: { value: 0.35 },
    uCA: { value: 0.004 }, uGrain: { value: 0.035 }, uSat: { value: 1.05 }, uRes: { value: new THREE.Vector2(1, 1) },
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

export class Pipeline {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer = r;
    setMaxAniso(Math.min(8, r.capabilities.getMaxAnisotropy()));
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
    this.venuePass = new VenuePass(this);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.6, 0.9);
    this.final = new FinalPass();
    this.composer.addPass(this.venuePass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.final);
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
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    this.renderer.setPixelRatio(dpr);
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
    this.composer.render();
  }
  dispose() {
    this.venuePass.dispose();
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
