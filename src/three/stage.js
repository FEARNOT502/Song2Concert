// stage.js — the renderer the venue scenes live in.
//
// One WebGL context for the whole app. Changing venue tears the old group down
// and builds the new one; nothing else is recreated. The React layer talks to it
// through four calls: setVenue, setPulse, resize and attachOverlay.
//
// The album art and title are still DOM — keeping them as HTML is what keeps the
// type crisp at any size and lets the existing <Cover> components render
// unchanged — but they have to sit exactly on the screen inside the 3D room. So
// on every venue change and every resize the stage projects that screen's four
// corners through the camera and hands the rectangle to React, which lays the
// overlay out on it.
//
// The camera does not move. It stands at the seat and stays there, which is what
// a seat does; the room in front of it is what moves.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { disposeTree, reactive } from './kit.js';
import { buildVenue } from './venues/index.js';

const DEG = Math.PI / 180;

export function createStage(canvas, { quality = 'high' } = {}) {
  const bloomOn = quality !== 'low';
  // Device pixel ratio is the single biggest lever on GPU cost — 1.75 on a
  // retina panel is three times the pixels of 1.0 — and this scene shares a
  // machine with a convolution reverb and five audio worklets. 1.35 keeps the
  // LED bezels and the type crisp without spending the audio's headroom.
  const maxRatio = quality === 'low' ? 1 : 1.35;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: quality !== 'low', powerPreference: 'high-performance',
      alpha: false, stencil: false,
    });
  } catch {
    return null; // no WebGL — Scene falls back to a plain backdrop
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 2000);
  const u = reactive();

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = bloomOn ? new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.75, 0.4) : null;
  composer.addPass(renderPass);
  if (bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let venue = null;
  let size = { w: 1, h: 1 };
  let pulse = 0;
  let pulseRef = null;
  let raf = 0;
  let frameBudget = 0;      // ms of headroom; see the adaptive skip in frame()
  let running = false;
  let onLayout = null;
  const clock = new THREE.Clock();
  const corner = new THREE.Vector3();

  // ── venue ──────────────────────────────────────────────────────────────────

  function setVenue(id) {
    if (venue) {
      scene.remove(venue.root);
      disposeTree(venue.root);
      venue = null;
    }
    venue = buildVenue(id, u);
    scene.add(venue.root);
    scene.background = venue.background;
    scene.fog = venue.fog;
    camera.fov = venue.camera.fov;
    camera.position.copy(venue.camera.position);
    camera.lookAt(venue.camera.target);
    camera.updateProjectionMatrix();
    if (bloom && venue.bloom) {
      bloom.strength = venue.bloom.strength;
      bloom.radius = venue.bloom.radius;
      bloom.threshold = venue.bloom.threshold;
    }
    // point fields fade into the same fog the meshes do
    if (venue.fog) {
      venue.root.traverse((o) => {
        const m = o.material;
        if (m && m.uniforms && m.uniforms.fogFar) {
          m.uniforms.fogColor.value.copy(venue.fog.color);
          m.uniforms.fogNear.value = venue.fog.far * 0.75;
          m.uniforms.fogFar.value = venue.fog.far * 1.25;
        }
      });
    }
    applyPointScale();
    publishLayout();
  }

  // ── projection of the on-stage screen ──────────────────────────────────────

  // The screen's four corners in CSS pixels relative to the canvas. Returns an
  // axis-aligned box: every venue's screen faces the camera, so the projected
  // quad is a rectangle to well under a pixel.
  function projectScreen() {
    if (!venue) return null;
    const { w, h } = venue.screen.userData.size;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [cx, cy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
      corner.set(cx, cy, 0).applyMatrix4(venue.screen.matrixWorld).project(camera);
      const px = (corner.x * 0.5 + 0.5) * size.w;
      const py = (-corner.y * 0.5 + 0.5) * size.h;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // Where the overlay goes. Recomputed when the venue or the viewport changes,
  // which is the only time it can move.
  let layoutRect = null;
  function publishLayout() {
    if (!venue) return;
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    layoutRect = projectScreen();
    if (onLayout && layoutRect) onLayout({ ...layoutRect });
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  function applyPointScale() {
    const pr = renderer.getPixelRatio();
    u.uScale.value = (size.h * pr * 0.5) / Math.tan(camera.fov * 0.5 * DEG);
  }

  // ── how often to draw ──────────────────────────────────────────────────────
  //
  // A PHONE IS CAPPED AT 30. Nothing in this scene moves fast — lights swing over
  // seconds, the screen pulses with the music — so the second thirty frames buy
  // almost nothing to look at, and they are drawn on the same small cores the
  // audio thread is trying to meet a deadline on. Halving the work here is the
  // largest single saving available on mobile, and it is larger than anything
  // left in the audio graph.
  //
  // The gate is on ELAPSED TIME rather than on frame parity. Parity assumes the
  // panel runs at 60: on a 120 Hz phone — which is most of them now — skipping
  // every other frame still leaves 60, and the saving never happened. On a panel
  // already struggling at 40 it gives 20.
  //
  // If a rendered frame still costs too much, the interval doubles. A steady 30
  // looks like a choice; a wobbling 45 looks like a fault, and the frames it
  // drops come out of the audio thread.
  const targetMs = 1000 / (quality === 'low' ? 30 : 60);
  let heavy = false;
  let lastDrawn = -1e9;
  let drawn = 0;

  // ── the drawing yields to the sound, never the other way round ─────────────
  //
  // `heavy` above measures what a frame costs US. That is the wrong question on
  // a machine where the frame is affordable and the audio callback is not — a
  // laptop on battery, most obviously, where the governor drops the clock and
  // the scene carries on hitting sixty while the convolver starts missing its
  // deadline. The frame-cost governor never fires, because nothing about the
  // frame got slower; what got slower is everything.
  //
  // So strain is reported from outside, from the audio thread's own underrun
  // count, and it takes precedence. Level 1 halves the frame rate. Level 2 also
  // drops the pixel ratio and switches the bloom pass off, which together are
  // most of what a frame costs.
  //
  // The scene looks worse. That is the correct trade: a dropped frame is a
  // frame, and a dropped audio quantum is a click.
  let strain = 0;
  function setStrain(level) {
    const next = Math.max(0, Math.min(2, level | 0));
    if (next === strain) return;
    const wasSevere = strain >= 2;
    strain = next;
    const severe = strain >= 2;
    if (severe === wasSevere) return;
    if (bloom) bloom.enabled = !severe;
    renderer.setPixelRatio(severe ? 1 : Math.min(window.devicePixelRatio || 1, maxRatio));
    renderer.setSize(size.w, size.h, false);
    composer.setSize(size.w, size.h);
    applyPointScale();
    publishLayout();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!venue || document.hidden) return;
    // A millisecond of slack, so a frame arriving a hair early is not held back
    // to the one after it — which would halve the rate rather than cap it.
    if (now - lastDrawn < ((heavy || strain > 0) ? targetMs * 2 : targetMs) - 1) return;
    lastDrawn = now;
    drawn++;

    const started = performance.now();
    const t = clock.getElapsedTime();
    const p = pulseRef ? pulseRef.current : pulse;
    u.uTime.value = t;
    u.uPulse.value = p;
    venue.update(t, p);
    composer.render();

    // rolling average of how long a rendered frame costs us, against the
    // interval we are actually trying to hold
    frameBudget += ((performance.now() - started) - frameBudget) * 0.05;
    if (!heavy && frameBudget > targetMs * 0.78) heavy = true;
    else if (heavy && frameBudget < targetMs * 0.42) heavy = false;
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  function resize(w, h) {
    size = { w: Math.max(1, w), h: Math.max(1, h) };
    // Keep whatever strain has decided; a resize is not a reason to hand the
    // pixels back to a machine that could not afford them a moment ago.
    renderer.setPixelRatio(strain >= 2 ? 1 : Math.min(window.devicePixelRatio || 1, maxRatio));
    renderer.setSize(size.w, size.h, false);
    composer.setSize(size.w, size.h);
    bloom?.setSize(size.w, size.h);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    applyPointScale();
    publishLayout();
  }

  return {
    setVenue,
    setPulse: (p) => { pulse = p; },
    setPulseRef: (ref) => { pulseRef = ref || null; },
    setStrain,
    resize,
    onLayout(fn) { onLayout = fn; if (layoutRect) fn({ ...layoutRect }); },
    start() { if (!running) { running = true; clock.start(); raf = requestAnimationFrame(frame); } },
    // Frames actually drawn, for the frame-rate check in scripts/audio-smoke.mjs.
    // Nothing in the app reads it.
    stats: () => ({ drawn, heavy, strain, frameMs: +frameBudget.toFixed(2) }),
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      if (venue) { scene.remove(venue.root); disposeTree(venue.root); venue = null; }
      composer.dispose();
      renderer.dispose();
    },
  };
}
