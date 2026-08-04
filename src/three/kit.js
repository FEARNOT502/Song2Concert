// kit.js — the shared vocabulary the six 3D venues are built out of.
//
// Everything here is deliberately cheap: silhouette crowds are one InstancedMesh
// per venue, light shafts are hollow cylinders with an additive shader instead of
// real volumetrics, and the seas of phone torches / lightsticks are a single
// THREE.Points draw. A venue scene is a few dozen draw calls, which is what lets
// all six run at 60fps next to a Web Audio convolution engine.
//
// Two uniforms are threaded through every reactive material: `uTime` (seconds)
// and `uPulse` (0..1 RMS, the same figure that drove the old SVG). Both live in
// one object per scene — see `reactive()` — so a venue only has to write to it
// once per frame.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The console accent, oklch(0.78 0.16 55), resolved to sRGB.
export const ACCENT = 0xff9745;
export const MAGENTA = 0xc86bff;
export const COOL = 0x7fb8ff;
export const WARM = 0xffd08a;

// deterministic RNG — same generator the SVG scenes used, so a venue's crowd
// scatter is identical between reloads.
export function prng(seed) {
  let x = seed;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

// The two uniforms every reactive material shares. One object per scene.
export function reactive() {
  return {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    // Set by the stage on resize: converts a world-space radius to gl_PointSize.
    uScale: { value: 600 },
  };
}

// ── textures ────────────────────────────────────────────────────────────────

let glowTex = null;
// Soft radial sprite. Every point light, lamp glow and screen halo uses it.
export function glowTexture() {
  if (glowTex) return glowTex;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0.00, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.62)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// A tiling canvas texture. `draw(ctx, size)` paints one tile.
export function tileTexture(key, size, draw, repeat = [1, 1]) {
  const cache = tileTexture._cache || (tileTexture._cache = new Map());
  const id = `${key}:${size}:${repeat[0]}x${repeat[1]}`;
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(id, t);
  return t;
}

// LED pixel grid — the texture that makes a dark plane read as a video wall.
export const ledTexture = (repeat) => tileTexture('led', 32, (g, s) => {
  g.fillStyle = '#04030a';
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,151,69,0.34)';
  for (let y = 2; y < s; y += 4) for (let x = 2; x < s; x += 4) g.fillRect(x, y, 1.4, 1.4);
}, repeat);

// Brick, for the club's side walls.
export const brickTexture = (repeat) => tileTexture('brick', 64, (g, s) => {
  g.fillStyle = '#171009';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#2a1d10';
  g.lineWidth = 1.5;
  for (let r = 0; r < 4; r++) {
    const y = (r + 1) * (s / 4);
    g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
    const off = r % 2 ? 0 : s / 4;
    for (let k = 0; k < 2; k++) {
      const x = off + k * (s / 2);
      g.beginPath(); g.moveTo(x, y - s / 4); g.lineTo(x, y); g.stroke();
    }
  }
}, repeat);

// Raked seating, seen edge-on from a distance: rows of seatbacks.
export const seatTexture = (repeat, tint = '#1b1408') => tileTexture(`seat${tint}`, 32, (g, s) => {
  g.fillStyle = '#08060a';
  g.fillRect(0, 0, s, s);
  g.fillStyle = tint;
  for (let y = 0; y < s; y += 8) g.fillRect(0, y, s, 5);
}, repeat);

// ── light shafts ────────────────────────────────────────────────────────────

// A beam is a hollow cone drawn additively. `body` peaks where the view ray
// travels furthest through the cone, `fade` keeps it brightest at the lamp — the
// two together read as haze in a lit volume without any volumetric integration.
export function beamMaterial(color, opacity, u) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uReact: { value: 1 },
      uPhase: { value: Math.random() * 6.283 },
      uTime: u.uTime,
      uPulse: u.uPulse,
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW; varying vec3 vViewW; varying float vH;
      void main() {
        vH = uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uReact, uPhase, uTime, uPulse;
      varying vec3 vNormalW; varying vec3 vViewW; varying float vH;
      void main() {
        float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
        // the shaft is thickest where the view ray travels furthest through it,
        // and it thins out as it gets away from the lamp and spreads
        float body = pow(facing, 2.2);
        float fade = pow(clamp(vH, 0.0, 1.0), 1.7);
        float sway = 0.55 + 0.45 * sin(uTime * 2.4 + uPhase);
        float a = uOpacity * body * fade * (0.42 + uPulse * uReact * 1.2 * sway);
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// A shaft hanging from a fixture. The pivot is the lamp, so rotating the fixture
// swings the shaft about it the way a moving head does.
export function makeBeam({ color = ACCENT, length = 12, top = 0.1, spread = 2.4, opacity = 0.13, react = 1 }, u) {
  const geo = new THREE.CylinderGeometry(top, spread, length, 18, 1, true);
  geo.translate(0, -length / 2, 0);
  const mesh = new THREE.Mesh(geo, beamMaterial(color, opacity, u));
  mesh.material.uniforms.uReact.value = react;
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  return mesh;
}

// ── point fields: phone torches, lightsticks, stars, haze ───────────────────

// One draw call for thousands of lights. Each point carries its own phase, so
// the field shimmers rather than flashing in unison, and its own colour.
export function sparkField(points, { react = 1, base = 0.3, twinkle = 3.6, additive = true, maxPx = 34 }, u) {
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const c = new THREE.Color();
  points.forEach((p, i) => {
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    c.set(p.color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = p.size;
    phase[i] = p.phase ?? Math.random() * 6.283;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: glowTexture() },
      uReact: { value: react },
      uBase: { value: base },
      uTwinkle: { value: twinkle },
      uMax: { value: maxPx },
      uTime: u.uTime,
      uPulse: u.uPulse,
      uScale: u.uScale,
      fogColor: { value: new THREE.Color(0) },
      fogNear: { value: 1 },
      fogFar: { value: 1e6 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      uniform float uTime, uPulse, uScale, uReact, uBase, uTwinkle, uMax;
      varying vec3 vColor; varying float vAlpha; varying float vDepth;
      void main() {
        float beat = 0.5 + 0.5 * sin(uTime * uTwinkle + aPhase);
        float lit = uBase + uPulse * uReact * 1.15 * beat;
        vAlpha = clamp(lit, 0.0, 1.0);
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        // Clamped: a torch a metre from the camera is still a torch, not a
        // dinner plate. Without this the nearest points in a stadium crowd blow
        // up to hundreds of pixels and swallow the picture.
        float px = aSize * (1.0 + uPulse * uReact * 1.1 * beat) * uScale / max(vDepth, 0.001);
        gl_PointSize = clamp(px, 1.0, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 fogColor; uniform float fogNear, fogFar;
      varying vec3 vColor; varying float vAlpha; varying float vDepth;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        float haze = 1.0 - smoothstep(fogNear, fogFar, vDepth);
        gl_FragColor = vec4(vColor, t.a * vAlpha * haze);
      }`,
    transparent: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

// ── crowd ───────────────────────────────────────────────────────────────────

let personGeo = null;
// One low-poly body, ~90 triangles, normalised to 1 m tall so an instance's
// uniform scale IS the person's height.
function personGeometry() {
  if (personGeo) return personGeo;
  const torso = new THREE.CapsuleGeometry(0.15, 0.34, 3, 7);
  torso.translate(0, 0.52, 0);
  const head = new THREE.SphereGeometry(0.115, 7, 5);
  head.translate(0, 0.92, 0);
  personGeo = mergeGeometries([torso, head]);
  return personGeo;
}

// A crowd. `people` is [{ x, y, z, height }] in world space; the field bobs and
// sways with the music entirely on the GPU, so 5,000 of them cost one draw call
// and no per-frame CPU work.
export function crowdField(people, { color = 0x05040a, react = 1, sway = 0.09 }, u) {
  const geo = personGeometry();
  const mat = new THREE.MeshLambertMaterial({ color, emissive: 0x000000 });
  const phase = new Float32Array(people.length);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uPulse = u.uPulse;
    shader.uniforms.uReact = { value: react };
    shader.uniforms.uSway = { value: sway };
    shader.vertexShader = `
      attribute float aPhase;
      uniform float uTime, uPulse, uReact, uSway;
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float beat = sin(uTime * 5.4 + aPhase);
       transformed.y += beat * uPulse * uReact * uSway;
       transformed.x += sin(uTime * 2.7 + aPhase * 1.7) * uPulse * uReact * uSway * 0.55;`
    );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, people.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  people.forEach((person, i) => {
    p.set(person.x, person.y, person.z);
    s.setScalar(person.height);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), person.turn ?? 0);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    phase[i] = Math.random() * 6.283;
  });
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ── small helpers ───────────────────────────────────────────────────────────

export const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
export const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

// A glow billboard. Used for lamp flares and the halo around a screen.
export function flare(size, color, opacity = 0.6) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity,
    }),
  );
  m.renderOrder = 6;
  return m;
}

// ── the screen the album art mounts into ────────────────────────────────────

// Every venue has one, and it is the only object the React layer needs to know
// about: `Scene` projects its four corners each frame and parks the HTML overlay
// (album art + title) on the result, so the art tracks the 3D screen exactly.
//
// The panel itself stays dark — the art is DOM, drawn over the canvas — and what
// the 3D provides is the frame, the pixel grid around the art, and the light the
// screen throws into the room.
export function makeScreen({ w, h, bezel = ACCENT, halo = ACCENT, pixels = true, frame = 0.9, content = null }, u) {
  const g = new THREE.Group();

  const panelMat = pixels
    ? new THREE.MeshBasicMaterial({ map: ledTexture([Math.round(w * 2.2), Math.round(h * 2.2)]) })
    : new THREE.MeshBasicMaterial({ color: 0x04030a });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panelMat);
  g.add(panel);

  // Side screens carry the show rather than the artwork, so they get a running
  // LED pattern: columns rising and falling on the beat, which is what an IMAG
  // wing wall mostly looks like from the floor at this distance.
  if (content) {
    const feed = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.94), new THREE.ShaderMaterial({
      uniforms: { uA: { value: new THREE.Color(content) }, uB: { value: new THREE.Color(halo) }, uTime: u.uTime, uPulse: u.uPulse },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uA, uB; uniform float uTime, uPulse; varying vec2 vUv;
        float bar(float x, float seed) {
          return 0.18 + 0.82 * abs(sin(x * 9.0 + seed + uTime * 1.7)) * (0.25 + uPulse * 1.1);
        }
        void main() {
          float col = floor(vUv.x * 22.0);
          float level = bar(col, col * 1.7);
          float lit = step(vUv.y, level);
          float grid = step(0.18, fract(vUv.x * 22.0)) * step(0.2, fract(vUv.y * 26.0));
          vec3 c = mix(uA, uB, vUv.y);
          gl_FragColor = vec4(c * lit * grid, (0.10 + uPulse * 0.5) * lit * grid);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    feed.position.z = 0.02;
    g.add(feed);
  }

  // bezel — four emissive edges, the amber outline the SVG scenes had
  const t = Math.max(0.02, Math.min(w, h) * 0.012) * frame;
  const bm = new THREE.MeshBasicMaterial({ color: bezel });
  const edges = [
    [w + t * 2, t, 0, h / 2 + t / 2],
    [w + t * 2, t, 0, -h / 2 - t / 2],
    [t, h, -w / 2 - t / 2, 0],
    [t, h, w / 2 + t / 2, 0],
  ];
  for (const [ew, eh, ex, ey] of edges) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(ew, eh), bm);
    e.position.set(ex, ey, 0.01);
    g.add(e);
  }

  // the light the wall throws forward — swells with the music
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.9, h * 2.4),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: halo, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3,
    }),
  );
  glow.position.z = 0.05;
  glow.renderOrder = 2;
  g.add(glow);

  g.userData.size = { w, h };
  g.userData.update = (pulse) => {
    glow.material.opacity = 0.16 + pulse * 0.34;
    bm.color.setHex(bezel);
    bm.color.multiplyScalar(0.75 + pulse * 0.35);
  };
  // keep the reactive uniforms reachable for venues that want to drive more
  g.userData.u = u;
  return g;
}

// ── disposal ────────────────────────────────────────────────────────────────

// Scenes are rebuilt on every venue change, so nothing may outlive its group.
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();   // instance matrix / colour buffers
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture && v.userData.shared !== true) {
          // shared cache textures (tileTexture/glowTexture) are never disposed;
          // they are keyed and reused across venues.
          if (v !== glowTex && !isCached(v)) v.dispose();
        }
      }
      m.dispose();
    }
  });
}

function isCached(tex) {
  const cache = tileTexture._cache;
  if (!cache) return false;
  for (const v of cache.values()) if (v === tex) return true;
  return false;
}
