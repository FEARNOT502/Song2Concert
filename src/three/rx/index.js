// ─────────────────────────────────────────────────────────────────────────────
// rx — the Venue Dev Lab's render pipeline.
//
// The Lab's build swaps the app's src/three/render.js for this module
// (build.mjs): everything it exports is the app's, except Pipeline, which is
// the app's with more on it. Nothing in the app changes; ?rx=0 (or the Lab's
// RENDER switch) turns all of it off and the frame is the app's own.
//
//   A1  baked GI per light group, weighted live (gi.js)
//   A2  MRT scene, GTAO, SSR + a box-projected probe of the room, froxel haze
//       through the spots' shadow maps, temporal AA, softer, steadier shadows
//   A3  AgX for SDR; HDR through a WebGPU canvas in extended range (hdr.js)
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { Pipeline as AppPipeline, VenuePass as AppVenuePass } from '../render.js';
import { RXU, patchChunks, patchTree } from './materials.js';
import { FINAL_RX, FROXEL, MAX_FOG_LIGHTS, MAX_FOG_SHADOWS, aoMaterial, compMaterial, copyMaterial, froxelIntegrateMaterial, froxelLightMaterial, fsq, packMaterial, ssrMaterial, taaMaterial } from './passes.js';
import { ReflectionProbe } from './probe.js';
import { GIVolume, loadGI } from './gi.js';
import { HDRPresenter } from './hdr.js';

export * from '../render.js';

const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: false, ...o });

// what each venue's haze and look are, under rx: haze density (per metre),
// how far the haze volume reaches, the probe's place
const LOOK = {
  club: { general: { fog: 0.005, fogAmb: 0.4, floorY: 0.5, expRx: 1.2, fogFar: 40, led: 0.4, giGain: 0.35, envI: 0.35 } },
  concerthall: { general: { fog: 0.0006, fogAmb: 0.4, floorY: 0, expRx: 1.1, fogFar: 90, led: 0.3, giGain: 0.55 } },
  arena: {
    general: { fog: 0.003, fogAmb: 0.35, floorY: 0, expRx: 1.45, fogFar: 200, led: 0.25 },
    360: { fog: 0.003, fogAmb: 0.35, floorY: 0, expRx: 1.5, fogFar: 200, led: 0.3 },
  },
  // (KSPO DOME: smaller than the arena under a lower roof; its haze reaches across the bowl)
  'gymnastic-arena': {
    general: { fog: 0.0022, fogAmb: 0.18, floorY: 0, expRx: 1.4, fogFar: 140, led: 0.25, box: [[-62, 0, -62], [62, 27, 62]], probe: [0, 9, 8] },
    360: { fog: 0.0018, fogAmb: 0.18, floorY: 0, expRx: 1.45, fogFar: 140, led: 0.3, box: [[-62, 0, -62], [62, 27, 62]], probe: [0, 7, 20] },
  },
  dome: {
    general: { fog: 0.0016, fogAmb: 0.3, floorY: 0, expRx: 1.45, fogFar: 240, led: 0.2 },
    360: { fog: 0.0016, fogAmb: 0.3, floorY: 0, expRx: 1.5, fogFar: 240, led: 0.3 },
  },
  stadium: {
    general: { fog: 0.001, fogAmb: 0.3, floorY: 0, expRx: 1.45, fogFar: 260, led: 0.2 },
    360: { fog: 0.001, fogAmb: 0.3, floorY: 0, expRx: 1.5, fogFar: 260, led: 0.3 },
  },
  theater: {
    general: { fog: 0.0055, fogAmb: 0.9, floorY: 1, expRx: 1.55, probe: [0, 4.5, 6], led: 0.4 },
    op: { fog: 0.006, fogAmb: 0.9, floorY: 1, expRx: 1.55, probe: [0, 4.5, 6], led: 0.35 },
  },
};
// A few of the room's surfaces as they really finish: a stage floor is painted
// satin, not chalk, and shows a soft reflection of what is lit above it.
// (Lab only; put back when rx is off.)
const SURFACES = [
  { name: /stage deck/i, mat: 0, set: { roughness: 0.58, normalScale: new THREE.Vector2(0.35, 0.35) } },
  { name: /stage deck/i, mat: 1, set: { roughness: 0.55 } },
];
const lookOf = (id, mode) => LOOK[id]?.[mode] ?? LOOK[id]?.general ?? { fog: 0.012, fogAmb: 0.8, floorY: 0, expRx: 1.5 };

class Rx {
  constructor(pipe) {
    this.pipe = pipe;
    // ?rx=0 turns it off for the page (and the Lab's Base switch at runtime)
    this.allowed = query.get('rx') !== '0';
    this.on = this.allowed;
    const off = new Set((query.get('rxoff') || '').split(',').filter(Boolean));
    this.f = { gi: !off.has('gi'), ao: !off.has('ao'), ssr: !off.has('ssr'), fog: !off.has('fog'), taa: !off.has('taa'), probe: !off.has('probe'), shadows: !off.has('shadows'), agx: !off.has('agx') };
    this.frame = 0;
    this.root = null;
    this.venue = null; this.venueId = null; this.mode = 'general';
    this.look = lookOf(null);
    this.prevVP = new THREE.Matrix4();
    this.havePrev = false;
    this.unjittered = new THREE.Matrix4();
    this.unjitteredInv = new THREE.Matrix4();
    this.probe = new ReflectionProbe(pipe.renderer, pipe.pmrem, 256);
    this.gi = new GIVolume(pipe.renderer);
    this.giStatus = 'none';
    this.hidden = [];          // fake fill lights put out while rx is on
    this.shadowSaved = [];
    this.appEnv = null; this.appEnvI = 1;
    this.fogSaved = null;
    this.lights = [];
    this.hdr = null;
    this.out = 'sdr';
    // a compare-mode depth texture for the haze's unused shadow slots
    this.dummyShadow = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.dummyShadow.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.dummyShadow.depthTexture.compareFunction = THREE.LessEqualCompare;
    this.dummyShadow.depthTexture.minFilter = this.dummyShadow.depthTexture.magFilter = THREE.LinearFilter;
  }

  // ── the room ──────────────────────────────────────────────────────────────
  setVenue(venue, id, mode) {
    this.venue = venue; this.venueId = id; this.mode = mode;
    this.look = lookOf(id, mode);
    this.root = venue?.root ?? null;
    this.restoreLights();
    this.shadowSaved = [];
    this.lights = [];
    this.havePrev = false;
    this.pipe.venuePass.resetHistory?.();
    if (!this.root) return;
    this.root.traverse((o) => { if (o.isLight) this.lights.push(o); });
    this.surfaces = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const s of SURFACES) {
        if (!s.name.test(o.name)) continue;
        const m = Array.isArray(o.material) ? o.material[s.mat] : o.material;
        if (!m) continue;
        this.surfaces.push({ m, set: s.set, was: Object.fromEntries(Object.keys(s.set).map((k) => [k, m[k]?.clone ? m[k].clone() : m[k]])) });
      }
    });
    this.surfacesOn = false;
    // the probe: in the house, the box the room's walls (and the stage house)
    const env = venue.env;
    const bb = new THREE.Box3().setFromObject(this.root);
    // (a room centred on its own middle gives its box in LOOK: the default
    // runs from just behind the stage out along +z, as the arena does)
    const box = this.look.box;
    const min = box ? new THREE.Vector3(...box[0]) : env ? new THREE.Vector3(-env.w / 2, 0, Math.max(bb.min.z, -16)) : bb.min.clone();
    const max = box ? new THREE.Vector3(...box[1]) : env ? new THREE.Vector3(env.w / 2, env.h, env.d) : bb.max.clone();
    const pp = this.look.probe ? new THREE.Vector3(...this.look.probe) : min.clone().lerp(max, 0.5);
    this.probe.place(pp, min, max);
    RXU.rxBoxMin.value.copy(min); RXU.rxBoxMax.value.copy(max); RXU.rxProbePos.value.copy(pp);
    // the baked light, if there is one for this room
    this.gi.dispose();
    this.giStatus = 'loading';
    const url = `${import.meta.env.BASE_URL}assets/${id}-${mode}.gi`;
    const root = this.root;
    loadGI(url).then((d) => {
      if (this.root !== root) return;
      this.gi.set(d, root);
      this.giStatus = this.gi.missing.length ? `ok (${this.gi.missing.length} groups unmatched)` : 'ok';
      if (this.gi.missing.length) console.warn('GI groups without their light:', this.gi.missing.join(', '));
      this.applyLights();
    }).catch((e) => { if (this.root === root) { this.giStatus = 'none'; console.info('No baked GI:', e.message); } });
  }

  get giOn() { return this.on && this.f.gi && this.gi.ready; }

  // The room's stand-ins for indirect light (a hemisphere fill, area lights
  // in the proscenium and on the ceiling, the screens' own area lights) go out
  // when the baked light, which has all of them properly, is in.
  applyLights() {
    this.restoreLights();
    if (!this.root || !this.giOn) return;
    const screenRects = new Set(this.gi.groups.filter((g) => g.kind === 'screen').map((g) => g.light));
    this.root.traverse((o) => {
      if (!o.isLight) return;
      const fake = o.isHemisphereLight || o.isAmbientLight || (o.isRectAreaLight && (screenRects.has(o) || !this.isScreenRect(o)));
      if (fake && o.visible) { o.visible = false; o.userData.rxHidden = true; this.hidden.push(o); }
    });
  }
  isScreenRect(l) { return !!l.parent?.userData?.rect && l.parent.userData.rect === l; }
  restoreLights() {
    for (const o of this.hidden) { o.visible = true; delete o.userData.rxHidden; }
    this.hidden = [];
  }

  // Sharper, steadier shadows for the lights that already throw them; the
  // stage's wash and backlight throw them too.
  applyShadows(on) {
    if (on && !this.shadowSaved.length && this.root) {
      for (const l of this.lights) {
        if (!l.isSpotLight || l.userData.fx) continue;
        const rec = { l, cast: l.castShadow, size: l.shadow.mapSize.x, radius: l.shadow.radius, bias: l.shadow.bias, nb: l.shadow.normalBias };
        const stage = /wash|front|back/i.test(l.name) || l.castShadow;
        if (!stage) continue;
        this.shadowSaved.push(rec);
        // (a few: every shadowed light draws the room again)
        const casters = this.shadowSaved.filter((r) => r.l.castShadow).length;
        if (!l.castShadow && (l.angle > 0.65 || casters >= 4)) continue;
        const key = rec.cast && this.shadowSaved.length <= 3;
        l.castShadow = true;
        l.shadow.mapSize.set(key ? 4096 : 2048, key ? 4096 : 2048);
        l.shadow.radius = 2.5;
        l.shadow.bias = -0.00012;
        l.shadow.normalBias = 0.012;
        l.shadow.map?.dispose(); l.shadow.map = null;
      }
    } else if (!on && this.shadowSaved.length) {
      for (const r of this.shadowSaved) {
        r.l.castShadow = r.cast; r.l.shadow.mapSize.set(r.size, r.size); r.l.shadow.radius = r.radius; r.l.shadow.bias = r.bias; r.l.shadow.normalBias = r.nb;
        r.l.shadow.map?.dispose(); r.l.shadow.map = null;
      }
      this.shadowSaved = [];
    }
  }

  // ── the frame ─────────────────────────────────────────────────────────────
  begin(t) {
    const p = this.pipe, cam = p.camera;
    this.t = t;
    this.frame++;
    patchTree(p.scene);
    RXU.rxOn.value = this.on ? 1 : 0;
    const sc = p.scene;
    const surf = this.on;
    if (this.surfaces && surf !== this.surfacesOn) {
      for (const r of this.surfaces) Object.assign(r.m, surf ? r.set : r.was);
      this.surfacesOn = surf;
    }
    if (!this.on) {
      this.restoreLights();
      this.applyShadows(false);
      if (this.appEnv && sc.environment !== this.appEnv) { sc.environment = this.appEnv; sc.environmentIntensity = this.appEnvI; }
      if (this.fogSaved != null && sc.fog) { sc.fog.density = this.fogSaved; this.fogSaved = null; }
      RXU.rxGIOn.value = 0;
      p.final.material.uniforms.uTone.value = 0;
      p.final.material.uniforms.uSharpen.value = 0;
      return;
    }
    if (this.giOn && !this.hidden.length) this.applyLights();
    if (!this.giOn && this.hidden.length) this.restoreLights();
    this.applyShadows(this.f.shadows);
    p.renderer.shadowMap.type = THREE.PCFShadowMap;
    // the room's distance fog: the froxel haze does that job now
    if (sc.fog && this.f.fog) { if (this.fogSaved == null) this.fogSaved = sc.fog.density; sc.fog.density = 0; }
    p.final.material.uniforms.uTone.value = this.f.agx ? 1 : 0;
    p.final.material.uniforms.uExpRx.value = this.look.expRx ?? 1.5;
    p.final.material.uniforms.uSharpen.value = this.f.taa ? 0.6 : 0;
    // the environment: the probe of the room (or the app's, until it is in)
    if (sc.environment && sc.environment !== this.probe.texture) { this.appEnv = sc.environment; this.appEnvI = sc.environmentIntensity; }
    if (this.f.probe && this.root) {
      // (the shadow maps as they are: not drawn again for each face)
      const sm = p.renderer.shadowMap;
      let au = sm.autoUpdate;
      // (unless a light's map is not made yet: a material would sample nothing)
      const mapsReady = this.lights.every((l) => !l.castShadow || !GIVolume.visible(l) || l.shadow?.map);
      const cap = () => { RXU.rxPrevOn.value = 0; au = sm.autoUpdate; if (mapsReady) sm.autoUpdate = false; };
      this.probe.step(sc, this.settling ? 6 : 1, cap, () => { sm.autoUpdate = au; });
      if (this.probe.ready) { sc.environment = this.probe.texture; sc.environmentIntensity = this.look.envI ?? 1; RXU.rxBoxOn.value = 1; }
    } else if (this.appEnv) { sc.environment = this.appEnv; sc.environmentIntensity = this.appEnvI; RXU.rxBoxOn.value = 0; }
    RXU.rxGIOn.value = this.giOn ? 1 : 0;
    // (where the room keeps fills of its own, the GI comes in under them)
    RXU.rxGIGain.value = this.look.giGain ?? 1;
    if (this.giOn) this.gi.update();
    RXU.rxShadowSeed.value = this.frame % 64;
    RXU.rxPrevOn.value = this.havePrev && (this.f.ao || this.f.ssr) ? 1 : 0;
    RXU.rxPrevVP.value.copy(this.prevVP);
    RXU.rxAOStrength.value = this.f.ao ? 1 : 0;
    // temporal jitter, a pixel's sub-sample, cycling over sixteen
    cam.updateMatrixWorld();
    this.unjittered.copy(cam.projectionMatrix);
    this.unjitteredInv.copy(cam.projectionMatrixInverse);
    if (this.f.taa) {
      const vp = p.venuePass, w = vp.sceneRT?.width || 1, h = vp.sceneRT?.height || 1;
      const i = (this.frame % 16) + 1;
      const jx = (halton(i, 2) - 0.5) * 2 / w, jy = (halton(i, 3) - 0.5) * 2 / h;
      cam.projectionMatrix.elements[8] -= jx;
      cam.projectionMatrix.elements[9] -= jy;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
  }

  end() {
    const cam = this.pipe.camera;
    if (!this.on) { this.havePrev = false; return; }
    cam.projectionMatrix.copy(this.unjittered);
    cam.projectionMatrixInverse.copy(this.unjitteredInv);
    this.prevVP.multiplyMatrices(this.unjittered, cam.matrixWorldInverse);
    this.havePrev = true;
    // renders between frames (the FOH desks' camera feeds) are from other
    // views: last frame's screen-space AO is not theirs
    RXU.rxPrevOn.value = 0;
  }

  // the lights the haze is lit by, this frame
  fogLights(U) {
    const wp = new THREE.Vector3(), tp = new THREE.Vector3(), q = new THREE.Quaternion();
    let n = 0, sh = 0;
    this.fogNames = [];
    // (the spare shadow slots' depth texture has to exist on the GPU, or the
    // haze's draw is refused for a sampler with nothing valid bound)
    if (!this.dummyReady) {
      const r = this.pipe.renderer, cur = r.getRenderTarget();
      r.setRenderTarget(this.dummyShadow); r.clear(true, true, false); r.setRenderTarget(cur);
      this.dummyReady = true;
    }
    for (let i = 0; i < MAX_FOG_SHADOWS; i++) { U[`tSh${i}`].value = this.dummyShadow.depthTexture; }
    for (const l of this.lights) {
      if (n >= MAX_FOG_LIGHTS) break;
      if (l.userData.fx || !(l.isSpotLight || l.isPointLight || l.isRectAreaLight)) continue;
      if (l.isRectAreaLight && !this.isScreenRect(l)) continue;
      // (a light may light the haze less than the room: `fogGain`, e.g. house lights)
      const fogGain = l.userData.fogGain ?? 1;
      if (!GIVolume.visible(l) || l.intensity <= 1e-4 || fogGain <= 0) continue;
      l.getWorldPosition(wp);
      this.fogNames.push(`${l.type}:${l.name}`);
      U.uLPos.value[n].copy(wp);
      U.uLCol.value[n].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * fogGain * (l.isRectAreaLight ? (this.look.led ?? 0.4) : 1));
      U.uLArea.value[n].set(0, 0, 0, 0);
      U.uLSh.value[n] = -1;
      if (l.isRectAreaLight) {
        l.getWorldQuaternion(q);
        U.uLDir.value[n].set(0, 0, -1).applyQuaternion(q);
        const s = l.getWorldScale(tp);
        U.uLArea.value[n].set(l.width * s.x / 2, l.height * s.y / 2, 0, 0);
        U.uLPar.value[n].set(-2, 0, 0, 2);
      } else if (l.isSpotLight) {
        l.target.getWorldPosition(tp);
        U.uLDir.value[n].copy(tp).sub(wp).normalize();
        U.uLPar.value[n].set(Math.cos(l.angle), Math.cos(l.angle * (1 - l.penumbra)), l.distance, l.decay);
        const dt = l.shadow?.map?.depthTexture;
        if (l.castShadow && dt && sh < MAX_FOG_SHADOWS) {
          U[`tSh${sh}`].value = dt; U[`uShM${sh}`].value.copy(l.shadow.matrix); U[`uShB${sh}`].value = l.shadow.bias;
          U.uLSh.value[n] = sh++;
        }
      } else {
        U.uLDir.value[n].set(0, -1, 0);
        U.uLPar.value[n].set(-2, 0, l.distance, l.decay);
      }
      n++;
    }
    U.uCount.value = n;
    this.fogDbg = this.fogNames.map((name, i) => ({ name, p: U.uLPos.value[i].toArray().map((v) => +v.toFixed(1)), c: U.uLCol.value[i].toArray().map((v) => +v.toFixed(1)), par: U.uLPar.value[i].toArray().map((v) => +v.toFixed(3)), sh: U.uLSh.value[i], area: +U.uLArea.value[i].x.toFixed(2) }));
  }

  setOutput(mode) {
    this.out = mode === 'hdr' ? 'hdr' : 'sdr';
    if (this.out === 'hdr' && !this.hdr) this.hdr = new HDRPresenter(this.pipe.renderer.domElement);
    this.hdr?.enable(this.out === 'hdr');
    this.pipe.resize(this.pipe.size.w, this.pipe.size.h);
  }

  // debugging: pixels of the pipeline's targets, and the haze's lights
  peek(points = [[0.5, 0.5], [0.5, 0.42], [0.2, 0.3], [0.5, 0.85]]) {
    const r = this.pipe.renderer, vp = this.pipe.venuePass;
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    const h2f = (h) => { const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, m = h & 0x3ff; return (s ? -1 : 1) * (e === 0 ? 6.1035e-5 * (m / 1024) : e === 31 ? (m ? NaN : Infinity) : Math.pow(2, e - 15) * (1 + m / 1024)); };
    const rd = (rt, x, y, i = 0) => { const b = new Uint16Array(4); try { r.readRenderTargetPixels(rt, Math.floor(x * rt.width), Math.floor(y * rt.height), 1, 1, b, undefined, i); } catch (e) { return String(e); } return [...b].map((v) => +h2f(v).toFixed(4)); };
    const out = {};
    for (const [x, y] of points) {
      out[`${x},${y}`] = { scene: rd(vp.sceneRT, x, 1 - y, 0), g: rd(vp.sceneRT, x, 1 - y, 1), ao: rd(vp.aoRT, x, 1 - y), ssr: rd(vp.ssrRT, x, 1 - y), comp: rd(vp.compRT, x, 1 - y), hist: rd(vp.hist[1 - vp.histI], x, 1 - y), fog: rd(vp.fogRT, x * 0.125, (1 - y) * 0.125 + 0.75), frox: [0, 9, 30].map((k) => rd(vp.froxRT, ((k % 8) + x) / 8, (Math.floor(k / 8) + 1 - y) / 8)) };
    }
    out.fogLights = this.fogDbg;
    return out;
  }

  info() {
    return { on: this.on, f: this.f, gi: this.giStatus, giGroups: this.gi.groups?.length ?? 0, probe: this.probe.ready, out: this.out, hdr: this.hdr?.status ?? 'off', frame: this.frame };
  }
}

// ── the scene pass, with everything between the scene and the bloom ─────────
class RxVenuePass extends AppVenuePass {
  constructor(pipe) {
    super(pipe);
    this.ao = fsq(aoMaterial());
    this.ssr = fsq(ssrMaterial());
    this.pack = fsq(packMaterial());
    this.fxl = fsq(froxelLightMaterial());
    this.fxi = fsq(froxelIntegrateMaterial());
    this.cmp = fsq(compMaterial());
    this.taa = fsq(taaMaterial());
    this.copy = fsq(copyMaterial());
    this.histI = 0;
    this.reset = true;
  }
  resetHistory() { this.reset = true; this.fogWarm = false; }
  alloc(fw, fh) {
    super.alloc(fw, fh);
    const q = this.pipe.q;
    const w = this.sceneRT.width, h = this.sceneRT.height;
    this.sceneRT.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa, count: 2 });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    for (const t of this.sceneRT.textures) { t.minFilter = t.magFilter = THREE.LinearFilter; }
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    for (const k of ['aoRT', 'ssrRT', 'compRT', 'fogRT']) this[k]?.dispose();
    this.prevRT?.forEach((r) => r.dispose()); this.hist?.forEach((r) => r.dispose()); this.froxRTs?.forEach((r) => r.dispose());
    this.aoRT = rt(hw, hh);
    this.ssrRT = rt(hw, hh);
    this.prevRT = [rt(hw, hh), rt(hw, hh)];
    this.prevI = 0;
    const { FX, FY, FZ, COLS } = FROXEL;
    const fx = q.msaa ? FX : 96, fy = q.msaa ? FY : 54, fz = q.msaa ? FZ : 40;
    this.fdims = [fx, fy, fz];
    const rows = Math.ceil(fz / COLS);
    this.froxRTs = [0, 1].map(() => rt(fx * COLS, fy * rows, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
    this.froxI = 0;
    this.froxRT = this.froxRTs[0];
    this.fogRT = rt(fx * COLS, fy * rows, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.compRT = rt(w, h);
    this.hist = [rt(w, h), rt(w, h)];
    this.reset = true;
  }

  render(renderer, writeBuffer) {
    const p = this.pipe, rx = p.rx;
    if (!rx.on) { super.render(renderer, writeBuffer); return; }
    const cam = p.camera;
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(p.scene, cam);
    const w = this.sceneRT.width, h = this.sceneRT.height;
    const depth = this.sceneRT.depthTexture, gbuf = this.sceneRT.textures[1], color = this.sceneRT.textures[0];
    const frame = rx.frame % 1024;
    const setCommon = (U) => {
      if (U.tDepth) U.tDepth.value = depth;
      if (U.tG) U.tG.value = gbuf;
      if (U.uProj) U.uProj.value.copy(cam.projectionMatrix);
      if (U.uProjInv) U.uProjInv.value.copy(cam.projectionMatrixInverse);
      if (U.uFull) U.uFull.value.set(w, h);
      if (U.uFrame) U.uFrame.value = frame;
    };
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();

    // the beams and the airlight, as the app draws them
    const vw = this.volRT.width, vh = this.volRT.height;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(this.volRT);
    renderer.clear(true, false, false);
    if (p.volOn) {
      for (const U of [p.beams.uniforms, p.haze.uniforms]) {
        U.tDepth.value = depth; U.uRes.value.set(vw, vh);
        U.uProjInv.value.copy(cam.projectionMatrixInverse); U.uFar.value = cam.far * 0.98;
      }
      p.haze.uniforms.uCamWorld.value.copy(cam.matrixWorld);
      renderer.render(p.volScene, cam);
      if (p.mask.scene.children.length) {
        p.mask.sync();
        p.mask.uniforms.tDepth.value = depth; p.mask.uniforms.uRes.value.set(vw, vh);
        const ac = renderer.autoClear; renderer.autoClear = false;
        renderer.render(p.mask.scene, cam);
        renderer.autoClear = ac;
      }
    }

    // AO and reflections, then what the materials read back next frame
    const prevOut = this.prevRT[1 - this.prevI];
    if (rx.f.ao) {
      setCommon(this.ao.material.uniforms);
      renderer.setRenderTarget(this.aoRT); this.ao.render(renderer);
    } else { renderer.setRenderTarget(this.aoRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.setClearColor(0, 1); }
    if (rx.f.ssr) {
      const U = this.ssr.material.uniforms; setCommon(U); U.tColor.value = color;
      renderer.setRenderTarget(this.ssrRT); this.ssr.render(renderer);
    } else { renderer.setRenderTarget(this.ssrRT); renderer.clear(); }
    {
      const U = this.pack.material.uniforms;
      U.tAO.value = this.aoRT.texture; U.tSSR.value = this.ssrRT.texture; U.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
      renderer.setRenderTarget(prevOut); this.pack.render(renderer);
      RXU.rxPrev.value = prevOut.texture;
      this.prevI = 1 - this.prevI;
    }

    // the haze, as a volume
    const near = Math.max(cam.near, 0.2), far = Math.min(cam.far, rx.look.fogFar ?? 90);
    const [fx, fy, fz] = this.fdims;
    if (rx.f.fog && p.volOn) {
      const L = this.fxl.material.uniforms;
      L.uDims.value.set(fx, fy, fz); L.uCols.value = FROXEL.COLS; L.uNear.value = near; L.uFar.value = far;
      L.uProjInv.value.copy(cam.projectionMatrixInverse); L.uCamWorld.value.copy(cam.matrixWorld);
      L.uFrame.value = frame; L.uTime.value = rx.t ?? 0;
      L.uDensity.value = rx.look.fog * (1 - 0.9 * (rx.house ?? 0)); L.uAmbGain.value = rx.look.fogAmb * (1 - 0.8 * (rx.house ?? 0)); L.uFloorY.value = rx.look.floorY ?? 0;
      L.tNoise.value = p.beams.uniforms.tNoise.value;
      L.uGIOn.value = rx.giOn ? 1 : 0;
      for (const k of ['rxGI0', 'rxGI1', 'rxGI2', 'rxGIOrigin', 'rxGISize']) L[k].value = RXU[k].value;
      rx.fogLights(L);
      const prevF = this.froxRTs[this.froxI], curF = this.froxRTs[1 - this.froxI];
      L.tPrev.value = prevF.texture; L.uPrevVP.value.copy(rx.prevVP);
      L.uHasPrev.value = rx.havePrev && !this.reset && this.fogWarm ? 1 : 0;
      L.uBlend.value = rx.settling ? 0.08 : 0.15;
      renderer.setRenderTarget(curF); this.fxl.render(renderer);
      this.froxI = 1 - this.froxI; this.froxRT = curF; this.fogWarm = true;
      const I = this.fxi.material.uniforms;
      I.uDims.value.set(fx, fy, fz); I.uCols.value = FROXEL.COLS; I.uNear.value = near; I.uFar.value = far; I.tIn.value = this.froxRT.texture; I.uProjInv.value.copy(cam.projectionMatrixInverse);
      renderer.setRenderTarget(this.fogRT); this.fxi.render(renderer);
    }

    // the composite
    {
      const U = this.cmp.material.uniforms; setCommon(U);
      U.uDims.value.set(fx, fy, fz); U.uCols.value = FROXEL.COLS; U.uNear.value = near; U.uFar.value = far;
      U.tScene.value = color; U.tVol.value = this.volRT.texture; U.tSSR.value = this.ssrRT.texture; U.tFog.value = this.fogRT.texture;
      U.uVolTexel.value.set(1 / vw, 1 / vh); U.uVolShoulder.value = this.comp.material.uniforms.uVolShoulder.value;
      U.uSSROn.value = rx.f.ssr ? 1 : 0; U.uFogOn.value = rx.f.fog && p.volOn ? 1 : 0;
      renderer.setRenderTarget(this.compRT); this.cmp.render(renderer);
    }

    // the temporal resolve
    let out = this.compRT;
    if (rx.f.taa) {
      const U = this.taa.material.uniforms;
      const src = this.hist[this.histI], dst = this.hist[1 - this.histI];
      U.tCur.value = this.compRT.texture; U.tHist.value = src.texture; U.tDepth.value = depth;
      U.uProjInv.value.copy(cam.projectionMatrixInverse); U.uCamWorld.value.copy(cam.matrixWorld);
      U.uPrevVP.value.copy(rx.prevVP); U.uTexel.value.set(1 / w, 1 / h);
      U.uReset.value = this.reset || !rx.havePrev ? 1 : 0;
      U.uAlpha.value = rx.settling ? 0.06 : 0.1;
      renderer.setRenderTarget(dst); this.taa.render(renderer);
      this.histI = 1 - this.histI;
      this.reset = false;
      out = dst;
    }
    renderer.setClearColor(cc, ca);
    this.copy.material.uniforms.tIn.value = out.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
  }
  dispose() {
    super.dispose();
    for (const k of ['aoRT', 'ssrRT', 'compRT', 'fogRT']) this[k]?.dispose();
    this.prevRT?.forEach((r) => r.dispose()); this.hist?.forEach((r) => r.dispose()); this.froxRTs?.forEach((r) => r.dispose());
  }
}

export class Pipeline extends AppPipeline {
  constructor(canvas) {
    super(canvas);
    patchChunks();
    this.rx = new Rx(this);
    // the scene pass and the grade, replaced in the composer
    const old = this.venuePass;
    this.venuePass = new RxVenuePass(this);
    this.composer.passes[this.composer.passes.indexOf(old)] = this.venuePass;
    old.dispose();
    const fm = new THREE.ShaderMaterial({ ...FINAL_RX, uniforms: THREE.UniformsUtils.clone(FINAL_RX.uniforms), depthTest: false, depthWrite: false });
    this.final.material.dispose();
    this.final.material = fm;
    this.final.quad.material = fm;
    const final = this.final, rx = this.rx;
    final.render = function (renderer, writeBuffer, readBuffer) {
      const U = this.material.uniforms;
      U.tDiffuse.value = readBuffer.texture;
      const hdr = rx.on && rx.out === 'hdr' && rx.hdr?.active;
      if (!hdr || !this.renderToScreen) {
        U.uOut.value = 0;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.quad.render(renderer);
        return;
      }
      // HDR: the canvas is twice as wide, high bytes left, low bytes right
      const { w, h } = rx.pipe.size;
      renderer.setRenderTarget(null);
      U.uPeak.value = rx.hdr.peak;
      // (one clear: the second half's draw must not wipe the first's)
      const ac = renderer.autoClear;
      renderer.autoClear = false;
      for (const [k, x] of [[1, 0], [2, w]]) {
        U.uOut.value = k;
        renderer.setViewport(x, 0, w, h);
        this.quad.render(renderer);
      }
      renderer.autoClear = ac;
      renderer.setViewport(0, 0, w, h);
      rx.hdr.present(renderer.domElement);
    };
    if (typeof window !== 'undefined') window.__rx = this.rx;
  }
  resize(w, h) {
    // the temporal resolve does the supersampling: the scene is drawn at no
    // more than 1.5 pixels per CSS pixel
    if (this.rx?.on && this.q.dpr > 1.5) this.q = { ...this.q, dpr: 1.5 };
    super.resize(w, h);
    if (this.rx?.on && this.rx.out === 'hdr' && this.rx.hdr?.active) {
      this.renderer.setSize(this.size.w * 2, this.size.h, false);
      this.rx.hdr.resize(this.size.w, this.size.h, this.renderer.getPixelRatio());
    }
  }
  render(t) {
    this.rx.begin(t);
    try { super.render(t); } finally { this.rx.end(); }
    this.lastT = t;
  }
  dispose() { this.rx.probe.dispose(); this.rx.gi.dispose(); this.rx.hdr?.dispose(); super.dispose(); }
}
