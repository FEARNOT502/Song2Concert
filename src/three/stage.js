// stage.js — the renderer the venue scenes live in.
//
// One WebGL context for the whole app. Changing venue fades the room out,
// tears it down, builds the next one, compiles its shaders and fades it in.
// The React layer talks to it through a handful of calls: setVenue, the pulse,
// setArt, setPlaying, setCrowdLight, resize, and the two cost switches
// (setEffects, setStrain).
//
// The listener is not bolted to the seat any more. They start at it — the
// seat the room model is heard from — and can walk: W A S D, with the feet on
// whatever is underfoot, and a drag to look anywhere. The sound stays at the
// seat; only the picture moves (see walk.js).
//
// The album art is part of the room: drawn on the LED walls (see art.js), so
// it is hidden by what stands in front of it and seen at an angle from the
// side, like everything else there.

import * as THREE from 'three';
import { DEG, clamp, regionColor } from './core.js';
import { Pipeline, QUALITY, buildEnvironment } from './render.js';
import { crowdUniforms } from './people.js';
import { Rig } from './rig.js';
import { Walker } from './walk.js';
import { createArt } from './art.js';
import { BeatFollower } from './beat.js';
import { buildVenue } from './venues/index.js';

// How far a new venue's camera may widen on a portrait screen: at least ~56°
// across, so the stage is still in the room rather than a keyhole on it.
const MIN_HFOV = 56 * DEG;

export function createStage(canvas, { quality = 'high', effects = true } = {}) {
  let pipe;
  try {
    pipe = new Pipeline(canvas);
  } catch {
    return null; // no WebGL — Scene falls back to a plain backdrop
  }
  const qName = quality === 'low' ? 'low' : 'high';
  // Device pixel ratio is the single biggest lever on GPU cost, and this scene
  // shares a machine with a convolution reverb and five audio worklets.
  const baseDpr = qName === 'low' ? 1 : 1.35;
  let fx = !!effects;
  let strain = 0;

  const walker = new Walker(canvas);
  const beat = new BeatFollower();
  const art = createArt(() => { if (venue) applyArt(); });

  let venue = null, ctx = null, venueId = null, envRT = null;
  let buildGen = 0;
  let pulse = 0, pulseRef = null, analyser = null;
  let playing = false;
  // Before anything plays the house lights are up — the room as you find it
  // walking in — and they go down when the music starts.
  let house = 1, houseTarget = 1;
  let crowdLight = 'stick';
  const pal = art.palette ? clonePal(art.palette) : null;
  let size = { w: 1, h: 1 };
  let raf = 0, running = false;
  const clock = new THREE.Clock();
  // per-venue lists, collected once rather than found by a traversal each frame
  let pointMats = [], lightMats = [], fogMats = [];

  function clonePal(p) { return { a: p.a.clone(), b: p.b.clone(), c: p.c.clone(), d: p.d.clone() }; }

  // ── quality ────────────────────────────────────────────────────────────────

  function applyQuality() {
    pipe.setQuality(qName);
    pipe.q = { ...QUALITY[qName], dpr: strain >= 2 ? 1 : baseDpr };
    pipe.resize(size.w, size.h);
    applyPasses();
  }
  // Two independent reasons to drop the costly passes — the listener asked for
  // a lighter scene, or the audio thread is underrunning — and either is enough.
  function applyPasses() {
    const on = fx && strain < 2;
    pipe.bloom.enabled = on && pipe.q.bloom;
    pipe.volOn = on;
  }

  // ── venue ──────────────────────────────────────────────────────────────────

  function fade(to, ms) {
    const U = pipe.final.material.uniforms.uFade;
    const from = U.value, t0 = performance.now();
    return new Promise((resolve) => {
      if (ms <= 0) { U.value = to; resolve(); return; }
      const step = () => {
        const k = clamp((performance.now() - t0) / ms);
        U.value = from + (to - from) * k * k * (3 - 2 * k);
        if (k < 1 && running) requestAnimationFrame(step); else { U.value = to; resolve(); }
      };
      step();
    });
  }

  function makeCtx() {
    const screens = [], rigs = [];
    const cu = crowdUniforms();
    return {
      pipe, cu, screens, rigs,
      // the crowd is decided at build time: off, it is not built at all
      q: fx ? pipe.q : { ...pipe.q, crowd: 0 },
      art: { texture: (aspect) => art.texture(aspect), cover: () => art.cover() },
      addScreen: (group, aspect, kind = 'main') => {
        screens.push({ group, aspect, kind, haze: [] });
        if (kind !== 'ribbon' && group.userData.face) pipe.mask.add(group.userData.face);
      },
      screenHaze: (group, items, offsets) => { const s = screens.find((x) => x.group === group); if (s) s.haze.push(...items.map((h, i) => ({ h, o: offsets[i] }))); },
      rig: (opts) => { const r = new Rig(pipe, opts); rigs.push(r); return r; },
    };
  }

  function teardown() {
    if (venue) {
      pipe.scene.remove(venue.root);
      disposeTree(venue.root);
      venue = null; ctx = null;
    }
    envRT?.dispose(); envRT = null;
    pipe.beams.clear(); pipe.haze.clear(); pipe.flares.clear(); pipe.mask.clear();
    pipe.scene.remove(pipe.flares.mesh);
    pointMats = []; lightMats = []; fogMats = [];
  }

  async function setVenue(id) {
    venueId = id;
    const gen = ++buildGen;
    await fade(0, venue ? 180 : 0);
    if (gen !== buildGen || !running) return;
    teardown();
    // a frame for the fade to land before the build takes the thread
    await new Promise((r) => setTimeout(r, 16));
    if (gen !== buildGen || !running) return;
    const c = makeCtx();
    const v = buildVenue(id, c);
    for (const r of c.rigs) v.root.add(r.build());
    pipe.scene.add(v.root);
    pipe.scene.add(pipe.flares.mesh);
    pipe.scene.background = v.background || new THREE.Color(0);
    pipe.scene.fog = v.fog || null;
    const cam = pipe.camera;
    cam.fov = v.camera.fov; cam.near = v.camera.near ?? 0.1; cam.far = v.camera.far ?? 2000;
    cam.updateProjectionMatrix();
    venue = v; ctx = c;
    walker.setVenue(v.root, v.camera.pos, v.camera.target);
    const b = v.bloom || {};
    pipe.bloom.strength = b.strength ?? 0.6; pipe.bloom.radius = b.radius ?? 0.6; pipe.bloom.threshold = b.threshold ?? 0.9;
    const G = pipe.final.material.uniforms, g = v.grade || {};
    G.uExposure.value = g.exposure ?? 1; G.uVignette.value = g.vignette ?? 0.35; G.uCA.value = g.ca ?? 0.004;
    G.uGrain.value = pipe.q.grain ? (g.grain ?? 0.035) : 0; G.uSat.value = g.sat ?? 1.05;
    G.uLift.value.setRGB(...(g.lift || [0, 0, 0]));
    pipe.haze.uniforms.uDensity.value = v.hazeDensity ?? 0.02;
    pipe.beams.uniforms.uGain.value = v.beamGain ?? 1;
    pipe.haze.uniforms.uAmb.value.copy(v.hazeAmb || new THREE.Color(0));
    pipe.haze.uniforms.uAmbDist.value = v.hazeAmbDist ?? 80;
    v.root.traverse((o) => {
      const U = o.material?.uniforms;
      if (!U) return;
      if (o.isPoints && U.uPal) pointMats.push(U);
      if (o.userData.crowdLights) lightMats.push(U);
      if (U.fogDensity) fogMats.push(U);
    });
    applyArt();
    applyCamera(0);
    try { await pipe.renderer.compileAsync(pipe.scene, cam); } catch { /* compiles on the first frame instead */ }
    if (gen !== buildGen || !running) return;
    frame(0.016, clock.getElapsedTime());
    fade(1, 420);
  }

  // screens, their light, their haze, and the reflections, from the current art
  function applyArt() {
    if (!venue) return;
    for (const s of ctx.screens) {
      const face = s.group.userData.face;
      const tex = s.kind === 'main' ? art.texture(s.aspect) : art.cover();
      if (face) face.material.uniforms.tArt.value = tex;
      const img = s.kind === 'main' ? tex.image : art.canvas;
      const avg = regionColor(img, 0, 0, 1, 1);
      if (s.group.userData.rect) s.group.userData.rect.color.copy(avg).multiplyScalar(1 / Math.max(0.05, Math.max(avg.r, avg.g, avg.b)));
      s.lum = Math.max(avg.r, avg.g, avg.b);
      for (const { h, o } of s.haze) h.color.copy(regionColor(img, 0.5 + o[0] * 0.5 - 0.2, 0.5 - o[1] * 0.5 - 0.2, 0.5 + o[0] * 0.5 + 0.2, 0.5 - o[1] * 0.5 + 0.2));
    }
    if (venue.env) {
      const spec = { ...venue.env, emitters: (venue.env.emitters || []).map((e) => (e.screen ? { ...e, map: art.texture(e.aspect || 16 / 9) } : e)) };
      envRT?.dispose();
      envRT = buildEnvironment(pipe, spec);
      pipe.scene.environment = envRT.texture;
      pipe.scene.environmentIntensity = venue.envIntensity ?? 0.6;
    }
  }

  // ── camera ─────────────────────────────────────────────────────────────────

  function applyCamera(dt) {
    const cam = pipe.camera;
    const fov = Math.min(100, Math.max(venue.camera.fov, 2 * Math.atan(Math.tan(MIN_HFOV / 2) / cam.aspect) / DEG));
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    walker.update(dt, cam);
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  function frame(dt, t) {
    const level = pulseRef ? (pulseRef.current || 0) : pulse;
    beat.update(dt, { level, analyser: playing ? analyser?.() : null, playing });
    house += (houseTarget - house) * Math.min(1, dt * 1.4);
    const target = art.palette;
    for (const k of ['a', 'b', 'c', 'd']) pal[k].lerp(target[k], Math.min(1, dt * 2.2));
    applyCamera(dt);
    const B = beat;
    const f = { t, dt, kick: B.kick, snare: 0, hat: 0, energy: B.energy, bar: B.bar, beat: B.beat, sec: playing ? B.sec : null, house, pal, cam: pipe.camera.position };
    const cu = ctx.cu;
    cu.uTime.value = t; cu.uKick.value = B.kick * (1 - house); cu.uEnergy.value = B.energy * (1 - house * 0.8);
    cu.uFlick.value = B.kick * (1 - house);
    venue.update(f);
    for (const r of ctx.rigs) r.update(1, pipe.camera.position);
    const glow = clamp(B.kick * 0.6 + B.energy * 0.3) * (1 - house);
    for (const s of ctx.screens) {
      const face = s.group.userData.face;
      if (face) {
        const U = face.material.uniforms;
        U.uTime.value = t; U.uPulse.value = glow; U.uHouse.value = house;
        if (U.uTint) U.uTint.value.copy(pal.a);
        if (U.uTint2) U.uTint2.value.copy(pal.b);
      }
      const rect = s.group.userData.rect;
      if (rect) rect.intensity = (s.lum ?? 0.3) * (face?.material.uniforms.uBright.value ?? 1) * (s.group.userData.lightPower ?? 1) * (0.9 + 0.2 * glow) * (1 - 0.45 * house) * 1.6;
      for (const { h } of s.haze) h.power = (s.group.userData.hazePower ?? 20) * (0.85 + 0.3 * glow) * (1 - 0.6 * house);
      if (s.group.userData.bezel) s.group.userData.bezel.color.setHex(0xff9745).multiplyScalar(0.7 + glow * 0.6);
    }
    // the lightsticks and phones take the palette; the crowd's own lights follow
    // the stick/torch switch and dim when the house lights come up
    const scale = (pipe.size.h * pipe.renderer.getPixelRatio() * 0.5) / Math.tan(pipe.camera.fov * 0.5 * DEG);
    for (const U of pointMats) {
      ['a', 'b', 'c', 'd'].forEach((k, i) => U.uPal.value[i].set(pal[k].r, pal[k].g, pal[k].b));
      U.uScale.value = scale;
    }
    const mode = crowdLight === 'flash' ? 1 : 0;
    for (const U of lightMats) { U.uMode.value = mode; U.uHouse.value = house; }
    if (pipe.scene.fog) for (const U of fogMats) { U.fogDensity.value = pipe.scene.fog.density ?? 0; U.fogColor.value.copy(pipe.scene.fog.color); }
    pipe.render(t);
  }

  // ── how often to draw ──────────────────────────────────────────────────────
  //
  // A phone is capped at 30: nothing here moves fast enough to need sixty, and
  // the frames are drawn on the cores the audio thread is trying to meet a
  // deadline on. If a frame still costs too much the interval doubles, and it
  // doubles again under strain reported from the audio thread (setStrain) —
  // which takes precedence, because a dropped frame is a frame and a dropped
  // audio quantum is a click.
  const targetMs = 1000 / (qName === 'low' ? 30 : 60);
  let heavy = false, lastDrawn = -1e9, drawn = 0, frameBudget = 0, lastT = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!venue || document.hidden) return;
    // walking is not throttled with the show: a halved rate reads as lag
    const interval = (heavy || strain > 0) && !walker.moving && !walker.drag ? targetMs * 2 : targetMs;
    if (now - lastDrawn < interval - 1) return;
    lastDrawn = now;
    drawn++;
    const started = performance.now();
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    frame(dt, t);
    frameBudget += ((performance.now() - started) - frameBudget) * 0.05;
    if (!heavy && frameBudget > targetMs * 0.78) heavy = true;
    else if (heavy && frameBudget < targetMs * 0.42) heavy = false;
  }

  function disposeTree(root) {
    const keep = new Set([art.coverTex, ...art.cache.values()]);
    root.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      o.geometry?.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture && !v.userData.shared && !keep.has(v)) v.dispose(); }
        if (m.uniforms) for (const u of Object.values(m.uniforms)) { const v = u?.value; if (v && v.isTexture && !v.userData?.shared && !keep.has(v)) v.dispose(); }
        m.dispose();
      }
      if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
    });
  }

  applyQuality();
  // the drawn sleeves use the app's fonts; draw them again once those load
  document.fonts?.ready?.then(() => { if (running) art.refresh(); });

  return {
    setVenue(id) { if (id !== venueId || !venue) setVenue(id); },
    setPulse: (p) => { pulse = p; },
    setPulseRef: (ref) => { pulseRef = ref || null; },
    // () => AnalyserNode | null — read for the kick, never connected to
    setAnalyser: (get) => { analyser = typeof get === 'function' ? get : null; },
    setArt: (want) => { art.set(want); },
    setPlaying: (on) => { playing = !!on; houseTarget = playing ? 0 : 1; },
    setCrowdLight: (mode) => { crowdLight = mode === 'flash' ? 'flash' : 'stick'; },
    setStrain(level) {
      const next = Math.max(0, Math.min(2, level | 0));
      if (next === strain) return;
      const severe = (next >= 2) !== (strain >= 2);
      strain = next;
      if (severe) applyQuality();
    },
    // The crowd is decided when the room is built, so switching rebuilds it;
    // the light shafts and bloom go at once.
    setEffects(on) {
      const next = !!on;
      if (next === fx) return;
      fx = next;
      applyPasses();
      if (venueId) setVenue(venueId);
    },
    resize(w, h) {
      size = { w: Math.max(1, w), h: Math.max(1, h) };
      pipe.resize(size.w, size.h);
      if (venue) applyCamera(0);
    },
    start() {
      if (running) return;
      running = true;
      clock.start();
      raf = requestAnimationFrame(tick);
      if (venueId && !venue) setVenue(venueId);
    },
    stats: () => ({ drawn, heavy, strain, effects: fx, frameMs: +frameBudget.toFixed(2), venue: venueId, walker: walker.feet.toArray().map((v) => +v.toFixed(2)) }),
    // for tests and the walk-through: the walker and the pipeline
    debug: { walker, pipe, art, beat },
    dispose() {
      running = false;
      buildGen++;
      cancelAnimationFrame(raf);
      teardown();
      walker.dispose();
      art.dispose();
      pipe.dispose();
    },
  };
}
