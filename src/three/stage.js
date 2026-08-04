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
  const maxRatio = quality === 'low' ? 1.25 : 1.75;

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
  let raf = 0;
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

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!venue || document.hidden) return;
    const t = clock.getElapsedTime();
    u.uTime.value = t;
    u.uPulse.value = pulse;
    venue.update(t, pulse);
    composer.render();
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  function resize(w, h) {
    size = { w: Math.max(1, w), h: Math.max(1, h) };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
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
    resize,
    onLayout(fn) { onLayout = fn; if (layoutRect) fn({ ...layoutRect }); },
    start() { if (!running) { running = true; clock.start(); raf = requestAnimationFrame(frame); } },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      if (venue) { scene.remove(venue.root); disposeTree(venue.root); venue = null; }
      composer.dispose();
      renderer.dispose();
    },
  };
}
