// ─────────────────────────────────────────────────────────────────────────────
// rigging, sound, screens, stage furniture
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, V3, aluminium, blackSteel, concreteTex, glowMat, grilleTex, lerp, phys, prng, seatStripTex, smooth, stageTex, std, withRepeat } from './core.js';
import { humanGeometry } from './people.js';

export const MATS = {};
export function mats() {
  if (MATS.ready) return MATS;
  MATS.ready = true;
  MATS.alu = aluminium();
  MATS.black = blackSteel();
  MATS.paint = std({ color: 0x0c0c0e, roughness: 0.55, metalness: 0.2 });
  MATS.cab = std({ color: 0x0a0a0b, roughness: 0.7, metalness: 0.1 });
  MATS.grille = std({ ...grilleTex(), color: 0xffffff, roughness: 1, metalness: 0.3 });
  MATS.rubber = std({ color: 0x050505, roughness: 0.9 });
  MATS.chrome = std({ color: 0xd8d8dc, metalness: 1, roughness: 0.18 });
  MATS.brass = std({ color: 0xc9a050, metalness: 1, roughness: 0.3 });
  MATS.drumhead = std({ color: 0xcfc8ba, roughness: 0.7 });
  MATS.pianoBlack = phys({ color: 0x050506, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
  MATS.keysWhite = std({ color: 0xf2efe6, roughness: 0.3 });
  MATS.fabric = std({ color: 0x0a0a0a, roughness: 0.95 });
  return MATS;
}

// ── truss ──
// A box truss along X, merged: four chords, square frames per bay and the
// diagonal web on each face.
export function truss(length, { size = 0.52, finish = 'alu', bays = null } = {}) {
  const M = mats();
  const parts = [];
  const r = Math.max(0.024, size * 0.048);
  const h = size / 2;
  for (const [dy, dz] of [[h, h], [h, -h], [-h, h], [-h, -h]]) {
    const c = new THREE.CylinderGeometry(r, r, length, 6, 1);
    c.rotateZ(Math.PI / 2);
    c.translate(0, dy, dz);
    parts.push(c);
  }
  const n = bays ?? Math.max(2, Math.round(length / (size * 1.9)));
  const step = length / n;
  const wr = r * 0.62;
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + i * step;
    for (const [dy, dz, vertical] of [[0, h, true], [0, -h, true], [h, 0, false], [-h, 0, false]]) {
      const c = new THREE.CylinderGeometry(wr, wr, size, 5, 1);
      if (!vertical) c.rotateX(Math.PI / 2);
      c.translate(x, dy, dz);
      parts.push(c);
    }
    if (i < n) {
      const diag = Math.hypot(size, step);
      const tilt = Math.atan2(step, size) * (i % 2 ? 1 : -1);
      for (const face of [0, 1, 2, 3]) {
        const c = new THREE.CylinderGeometry(wr, wr, diag, 5, 1);
        if (face < 2) {
          c.rotateZ(tilt);
          c.translate(x + step / 2, 0, face ? h : -h);
        } else {
          c.rotateX(Math.PI / 2);
          c.rotateY(tilt);
          c.translate(x + step / 2, face === 2 ? h : -h, 0);
        }
        parts.push(c);
      }
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), finish === 'alu' ? M.alu : M.black);
  mesh.castShadow = false;
  return mesh;
}

// Chain hoists: a motor box on the truss and a chain up to the roof.
export function hoists(xs, y, z, roofY, { finish = 'black' } = {}) {
  const parts = [];
  for (const x of xs) {
    const b = new THREE.BoxGeometry(0.3, 0.45, 0.3); b.translate(x, y + 0.6, z); parts.push(b);
    const len = roofY - (y + 0.8);
    if (len > 0.2) { const c = new THREE.CylinderGeometry(0.012, 0.012, len, 4); c.translate(x, y + 0.8 + len / 2, z); parts.push(c); }
  }
  return new THREE.Mesh(mergeGeometries(parts), finish === 'alu' ? mats().alu : mats().black);
}

// Lattice between two points (stadium roof structure, delay masts).
export function latticeInto(out, from, to, size, r) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 0.01) return;
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
  const place = new THREE.Matrix4().compose(from.clone().addScaledVector(dir, 0.5), q, V3(1, 1, 1));
  const h = size / 2;
  for (const [dx, dz] of [[h, h], [h, -h], [-h, h], [-h, -h]]) {
    const c = new THREE.CylinderGeometry(r, r, len, 5, 1);
    c.translate(dx, 0, dz); c.applyMatrix4(place); out.push(c);
  }
  const bays = Math.max(1, Math.round(len / (size * 2.2)));
  const step = len / bays;
  for (let i = 0; i < bays; i++) {
    const y = -len / 2 + i * step;
    const diag = Math.hypot(size, step);
    const tilt = Math.atan2(size, step) * (i % 2 ? 1 : -1);
    for (const dz of [h, -h]) {
      const w = new THREE.CylinderGeometry(r * 0.7, r * 0.7, diag, 4, 1);
      w.rotateZ(tilt); w.translate(0, y + step / 2, dz); w.applyMatrix4(place); out.push(w);
    }
  }
}

// ── moving lights ──
//
// A rig of fixtures: bodies are instanced (base, yoke, head, lens), beams go to
// the BeamField, flares to the FlareField, and a few real SpotLights can be
// slaved to chosen fixtures so the floor and the crowd actually get lit where
// the beams land.
export class Rig {
  constructor(pipe, { finish = 'black' } = {}) {
    this.pipe = pipe;
    this.fx = [];
    this.lights = [];
    this.finish = finish;
    this.group = new THREE.Group();
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = V3(1, 1, 1); this._p = V3();
  }
  // kind: 'spot' (moving head spot), 'beam' (tight beam), 'wash', 'profile'
  // (static ellipsoidal), 'par'. hang: 'down' (under a truss) or 'up' (floor).
  add(o) {
    const kind = o.kind || 'spot';
    const angle = o.angle ?? ({ beam: 0.025, spot: 0.1, wash: 0.22, profile: 0.09, par: 0.2, follow: 0.035, laser: 0.0012 }[kind]);
    const f = {
      kind, pos: o.pos.clone(), hang: o.hang || 'down', dir: (o.dir || V3(0, -1, 0.3)).clone().normalize(),
      color: new THREE.Color(o.color ?? 0xffffff), intensity: o.intensity ?? 1, level: 1, angle,
      length: o.length ?? 40, body: o.body !== false, scale: o.scale ?? 1, beamGain: o.beamGain ?? 1,
      flareGain: o.flareGain ?? 1, soft: o.soft ?? ({ wash: 0.9, par: 0.8, spot: 0.25, beam: 0.05, profile: 0.15, follow: 0.35, laser: 0 }[kind]),
      noise: o.noise ?? 0.7, fall: o.fall ?? 1.3,
    };
    const lensR = { beam: 0.07, spot: 0.12, wash: 0.16, profile: 0.08, par: 0.1, follow: 0.1, laser: 0.004 }[kind] * f.scale;
    f.beam = this.pipe.beams.add({ pos: f.pos, dir: f.dir, angle, length: f.length, color: f.color, intensity: 0, soft: f.soft, noise: f.noise, fall: f.fall, lens: lensR });
    f.flare = this.pipe.flares.add(f.pos, f.color, 1, 0);
    this.fx.push(f);
    return f;
  }
  // slave a SpotLight to a fixture
  light(f, spot, gain = 1) {
    spot.userData.fx = f; spot.userData.gain = gain;
    this.lights.push(spot);
    this.group.add(spot); this.group.add(spot.target);
    return spot;
  }
  aim(f, target) { f.dir.copy(target).sub(f.pos).normalize(); }
  build() {
    const M = mats();
    const withBody = this.fx.filter((f) => f.body);
    this.bodied = withBody;
    const n = Math.max(1, withBody.length);
    const baseG = new THREE.BoxGeometry(0.46, 0.16, 0.34); baseG.translate(0, -0.08, 0);
    const yoke = [];
    for (const s of [-1, 1]) { const a = new THREE.BoxGeometry(0.05, 0.36, 0.14); a.translate(s * 0.2, -0.32, 0); yoke.push(a); }
    const yb = new THREE.BoxGeometry(0.46, 0.05, 0.14); yb.translate(0, -0.16, 0); yoke.push(yb);
    const yokeG = mergeGeometries(yoke);
    const headG = new THREE.CylinderGeometry(0.15, 0.17, 0.44, 14);   // along +Y, lens at +0.22
    const lensG = new THREE.CircleGeometry(0.135, 18); lensG.rotateX(-Math.PI / 2); lensG.translate(0, 0.222, 0);
    const finishMat = this.finish === 'alu' ? M.alu : M.paint;
    this.iBase = new THREE.InstancedMesh(baseG, finishMat, n);
    this.iYoke = new THREE.InstancedMesh(yokeG, finishMat, n);
    this.iHead = new THREE.InstancedMesh(headG, M.paint, n);
    this.iLens = new THREE.InstancedMesh(lensG, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
    for (const m of [this.iBase, this.iYoke, this.iHead, this.iLens]) { m.frustumCulled = false; this.group.add(m); }
    this.iLens.setColorAt(0, new THREE.Color(0));
    this.iBase.count = this.iYoke.count = this.iHead.count = this.iLens.count = withBody.length;
    return this.group;
  }
  // Called every frame after the venue has set dir / colour / intensity.
  update(master = 1, camPos = null) {
    const m = this._m, q = this._q, s = this._s, p = this._p;
    const Y = V3(0, 1, 0), tmp = V3(), toCam = V3();
    const col = new THREE.Color();
    this.bodied?.forEach((f, i) => {
      const sc = f.scale;
      s.setScalar(sc);
      const flip = f.hang === 'up' ? -1 : 1;
      // base: fixed, upright (or inverted on the floor)
      q.setFromAxisAngle(V3(1, 0, 0), f.hang === 'up' ? Math.PI : 0);
      m.compose(f.pos, q, s); this.iBase.setMatrixAt(i, m);
      // yoke: pans to the horizontal heading of the beam
      const pan = Math.atan2(f.dir.x, f.dir.z);
      q.setFromAxisAngle(Y, pan);
      if (f.hang === 'up') q.premultiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), Math.PI));
      m.compose(f.pos, q, s); this.iYoke.setMatrixAt(i, m);
      // head: centred between the yoke arms, pointing down the beam
      p.copy(f.pos).addScaledVector(V3(0, -0.34 * flip, 0), sc);
      q.setFromUnitVectors(Y, f.dir);
      m.compose(p, q, s); this.iHead.setMatrixAt(i, m);
      this.iLens.setMatrixAt(i, m);
      const lvl = f.intensity * f.level * master;
      col.copy(f.color).multiplyScalar(0.02 + lvl * 9);
      this.iLens.setColorAt(i, col);
      f._lens = p.clone().addScaledVector(f.dir, 0.23 * sc);
    });
    for (const f of this.fx) {
      const lvl = f.intensity * f.level * master;
      const origin = f._lens || f.pos;
      f.beam.pos.copy(origin);
      f.beam.dir.copy(f.dir);
      f.beam.color.copy(f.color);
      f.beam.intensity = lvl * f.beamGain;
      f.beam.angle = f.angle;
      f.beam.length = f.length;
      f.flare.pos.copy(origin).addScaledVector(f.dir, 0.05);
      f.flare.color.copy(f.color);
      if (camPos) {
        toCam.copy(camPos).sub(origin);
        const dist = toCam.length();
        toCam.divideScalar(dist);
        const facing = Math.max(0, f.dir.dot(toCam));
        const cone = Math.cos(Math.min(1.2, f.angle * 3.2 + 0.08));
        const into = smooth(cone, 1, facing);
        f.flare.intensity = lvl * f.flareGain * (0.1 + 3.2 * into * into);
        f.flare.size = (0.7 + dist * 0.03) * f.scale * (0.5 + 1.1 * into);
      }
    }
    for (const L of this.lights) {
      const f = L.userData.fx;
      L.position.copy(f._lens || f.pos);
      tmp.copy(L.position).addScaledVector(f.dir, 30);
      L.target.position.copy(tmp);
      L.target.updateMatrixWorld();
      L.color.copy(f.color);
      L.intensity = f.intensity * f.level * master * L.userData.gain;
      L.angle = Math.min(1.0, f.angle * 1.15 + 0.02);
    }
    for (const m of [this.iBase, this.iYoke, this.iHead, this.iLens]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

// ── PA ──
// A flown line array: cabinets fanning into a J, grille on the front, rigging
// frames down the sides and a fly bar on top.
export function lineArray({ boxes = 12, width = 1.3, depth = 0.7, height = 0.38, splay = 0.035 } = {}) {
  const M = mats();
  const cab = [], front = [], rig = [];
  let y = 0, angle = 0, z = 0;
  const bar = new THREE.BoxGeometry(width * 1.1, 0.12, depth * 1.2); bar.translate(0, 0.15, 0); rig.push(bar);
  for (let i = 0; i < boxes; i++) {
    const m = new THREE.Matrix4().makeRotationX(angle).setPosition(0, y - height / 2, z);
    const b = new THREE.BoxGeometry(width, height * 0.97, depth); b.applyMatrix4(m); cab.push(b);
    const f = new THREE.PlaneGeometry(width * 0.96, height * 0.86); f.translate(0, 0, depth / 2 + 0.003); f.applyMatrix4(m); front.push(f);
    for (const s of [-1, 1]) { const r = new THREE.BoxGeometry(0.03, height * 0.9, depth * 0.8); r.translate(s * (width / 2 + 0.015), 0, -0.05); r.applyMatrix4(m); rig.push(r); }
    y -= Math.cos(angle) * height;
    z -= Math.sin(angle) * height;
    angle += splay + i * splay * 0.22;
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(cab), M.cab));
  g.add(new THREE.Mesh(mergeGeometries(front), M.grille));
  g.add(new THREE.Mesh(mergeGeometries(rig), M.alu));
  g.userData.height = -y;
  return g;
}

export function subStack({ w = 1.3, h = 0.6, d = 1.0, count = 3, cols = 1 } = {}) {
  const M = mats();
  const cab = [], front = [];
  for (let c = 0; c < cols; c++) for (let i = 0; i < count; i++) {
    const x = (c - (cols - 1) / 2) * w;
    const b = new THREE.BoxGeometry(w * 0.98, h * 0.98, d); b.translate(x, h / 2 + i * h, 0); cab.push(b);
    const f = new THREE.PlaneGeometry(w * 0.9, h * 0.84); f.translate(x, h / 2 + i * h, d / 2 + 0.003); front.push(f);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(cab), M.cab));
  g.add(new THREE.Mesh(mergeGeometries(front), M.grille));
  return g;
}

// ── LED ──
// The wall that carries the album art. Pixel-accurate up close (you can see
// the diodes from the front table of a club), filtered to the image at a
// distance, with module seams and the faint grey of unlit LEDs.
export function ledMaterial({ tex, pitch = 0.0039, w, h, bright = 2.2, grid = 1, kind = 'main' }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tArt: { value: tex }, uPix: { value: new THREE.Vector2(w / pitch, h / pitch) }, uBright: { value: bright },
      uPulse: { value: 0 }, uGrid: { value: grid }, uTime: { value: 0 }, uModule: { value: 128 },
      uKind: { value: kind === 'main' ? 0 : kind === 'imag' ? 1 : 2 }, uTint: { value: new THREE.Color(1, 1, 1) },
      uTint2: { value: new THREE.Color(1, 1, 1) }, uHouse: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tArt; uniform vec2 uPix; uniform float uBright, uPulse, uGrid, uTime, uModule, uKind, uHouse;
      uniform vec3 uTint, uTint2;
      varying vec2 vUv;
      vec3 content(vec2 uv, vec2 gx, vec2 gy) {
        if (uKind < 0.5) return textureGrad(tArt, uv, gx, gy).rgb;
        if (uKind < 1.5) {
          // IMAG-style: the sleeve fitted to the height, a slow drift, graded
          // like camera content, black either side
          float z = 0.86 + 0.05 * sin(uTime * 0.07);
          vec2 q = vec2(0.5 + (uv.x - 0.5) * z * (16.0 / 9.0) + 0.02 * sin(uTime * 0.05), 0.5 + (uv.y - 0.5) * z);
          if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec3(0.0);
          vec3 col = textureGrad(tArt, q, gx * z, gy * z).rgb;
          float l = dot(col, vec3(0.3, 0.6, 0.1));
          col = mix(vec3(l), col, 0.85) * (0.85 + 0.3 * uPulse);
          return col;
        }
        // ribbon / fascia: bars of the palette sweeping round the house
        float s = fract(uv.x * 6.0 - uTime * 0.12);
        float band = smoothstep(0.0, 0.05, s) * smoothstep(0.55, 0.45, s);
        vec3 col = mix(uTint, uTint2, 0.5 + 0.5 * sin(uv.x * 20.0 + uTime * 0.8));
        return col * (0.25 + 0.75 * band) * (0.6 + 0.6 * uPulse);
      }
      void main() {
        vec2 cell = vUv * uPix;
        vec2 id = floor(cell);
        vec2 f = fract(cell) - 0.5;
        vec2 suv = (id + 0.5) / uPix;
        vec2 gx = dFdx(vUv), gy = dFdy(vUv);
        vec3 c = content(suv, gx, gy);
        float fw = max(length(dFdx(cell)), length(dFdy(cell)));
        float diode = 1.0 - smoothstep(0.26, 0.4, length(f));
        float mask = mix(diode * 2.4, 1.0, smoothstep(0.35, 1.2, fw));
        vec2 mcell = fract(cell / uModule);
        float seam = 1.0 - 0.35 * (step(mcell.x, 0.5 / uModule) + step(mcell.y, 0.5 / uModule)) * (1.0 - smoothstep(0.5, 2.0, fw));
        vec3 col = c * mask * seam * uBright * (0.92 + 0.12 * uPulse);
        col += vec3(0.004) * (1.0 - mask * 0.5);
        gl_FragColor = vec4(col * (1.0 - uHouse * 0.45), 1.0);
      }`,
  });
}

// A screen: black frame, the LED face, and a RectAreaLight on the face so the
// wall lights the stage and the people in front of it.
export function ledScreen({ w, h, tex, pitch, bright = 2.2, kind = 'main', frame = 0.25, light = true, lightPower = 1 }) {
  const g = new THREE.Group();
  const M = mats();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ledMaterial({ tex, pitch, w, h, bright, kind }));
  face.position.z = 0.06;
  g.add(face);
  if (frame > 0) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + frame * 2, h + frame * 2, 0.12), M.paint);
    back.position.z = -0.02;
    g.add(back);
    // the app's accent: a hairline bezel around the art wall
    if (kind === 'main') {
      const bz = glowMat(APP.accent, 0.9);
      const t = Math.max(0.012, Math.min(w, h) * 0.004);
      for (const [bw, bh, x, y] of [[w + t * 2, t, 0, h / 2 + t], [w + t * 2, t, 0, -h / 2 - t], [t, h, -w / 2 - t, 0], [t, h, w / 2 + t, 0]]) {
        const e = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bz);
        e.position.set(x, y, 0.061); g.add(e);
      }
      g.userData.bezel = bz;
    }
  }
  let rect = null;
  if (light) {
    rect = new THREE.RectAreaLight(0xffffff, 1, w, h);
    rect.position.set(0, 0, 0.1);
    rect.lookAt(0, 0, 10);
    g.add(rect);
  }
  g.userData = { ...g.userData, face, rect, w, h, lightPower };
  return g;
}

// ── stage ──
export function stageDeck({ w, d, h, z, x = 0, lip = true, fascia = 0x060607, round = 0 }) {
  const g = new THREE.Group();
  const set = withRepeat(stageTex(), w / 2.44, d / 2.44);
  const top = std({ ...set, roughness: 1, metalness: 0 });
  let body;
  if (round > 0) {
    // a deck with a curved front, as a concert platform or an apron
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2 - round);
    s.quadraticCurveTo(w / 2, d / 2, 0, d / 2 + round * 0.25); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - round);
    s.lineTo(-w / 2, -d / 2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 24 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, h, 0);
    body = new THREE.Mesh(geo, [top, std({ color: fascia, roughness: 0.7 })]);
    body.userData.round = true;
  } else {
    body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      std({ color: fascia, roughness: 0.7 }), std({ color: fascia, roughness: 0.7 }), top,
      std({ color: fascia }), std({ color: fascia, roughness: 0.6, metalness: 0.1 }), std({ color: fascia }),
    ]);
    body.position.y = h / 2;
  }
  body.position.x = x; body.position.z = z;
  body.receiveShadow = true;
  g.add(body);
  if (lip && !round) {
    const lm = glowMat(APP.accent, 1.2);
    const lt = Math.max(0.01, Math.min(0.04, w * 0.0012));
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, lt, lt), lm);
    l.position.set(x, h - lt, z + d / 2 + lt / 2);
    g.add(l);
    g.userData.lip = lm;
  }
  return g;
}

// A flight of stage steps, so the deck can be walked onto: from `y0` at
// (x, z) up to `h`, climbing along `dir` (a unit vector on the floor). Risers
// at most `riseMax`, 0.28 m treads, `width` across.
export function stageSteps({ x, z, h, dir = [0, -1], width = 1.4, y0 = 0, riseMax = 0.2, run = 0.28 }) {
  const n = Math.max(1, Math.ceil((h - y0) / riseMax - 1e-6)), rise = (h - y0) / n;
  const geos = [];
  for (let i = 0; i < n; i++) {
    const top = y0 + rise * (i + 1);
    const b = new THREE.BoxGeometry(width, top - y0, run);
    b.translate(0, y0 + (top - y0) / 2, -(i + 0.5) * run);
    geos.push(b);
  }
  const g = mergeGeometries(geos);
  g.rotateY(Math.atan2(-dir[0], -dir[1]));
  g.translate(x, 0, z);
  const m = new THREE.Mesh(g, std({ color: 0x0c0c0e, roughness: 0.8 }));
  m.receiveShadow = true;
  return m;
}

// A drape: vertical folds, hung from a track.
export function drapeGeometry(w, h, folds, depth = 0.08, seg = 6) {
  const g = new THREE.PlaneGeometry(w, h, Math.max(8, folds * seg), 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const k = (x / w + 0.5) * folds * Math.PI * 2;
    const flare = 0.7 + 0.3 * (0.5 - y / h);   // fuller at the hem
    p.setZ(i, Math.sin(k) * depth * flare + Math.sin(k * 2.3 + 1) * depth * 0.15);
  }
  g.computeVertexNormals();
  return g;
}

export function shadowSpot(color, intensity, { angle = 0.4, penumbra = 0.6, decay = 2, distance = 0, size = 1024, near = 0.5, far = 30, bias = -0.0004, cast = true } = {}) {
  const s = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
  s.castShadow = cast;
  if (cast) {
    s.shadow.mapSize.set(size, size);
    s.shadow.camera.near = near;
    s.shadow.camera.far = far;
    s.shadow.bias = bias;
    s.shadow.normalBias = 0.02;
    s.shadow.radius = 3;
  }
  return s;
}

// ── instruments ──
export function drumKit({ shell = 0x5a1414 } = {}) {
  const M = mats();
  const g = new THREE.Group();
  const shellM = phys({ color: shell, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 28, 1, true), shellM, 0, 0.3, 0, Math.PI / 2);
  // the kick's front head is black, as most house kits' are
  add(new THREE.CircleGeometry(0.28, 28), std({ color: 0x0b0b0c, roughness: 0.45 }), 0, 0.3, 0.2);
  add(new THREE.TorusGeometry(0.28, 0.012, 6, 28), M.chrome, 0, 0.3, 0.2);
  for (const [x, y, r] of [[-0.18, 0.7, 0.13], [0.18, 0.72, 0.15]]) {
    add(new THREE.CylinderGeometry(r, r, 0.2, 22), shellM, x, y, 0.02, 0.4);
    add(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.005, 22), M.drumhead, x, y + 0.1 * Math.cos(0.4), 0.02 + 0.1 * Math.sin(0.4), 0.4);
  }
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 22), shellM, 0.55, 0.42, -0.15, 0.08);
  add(new THREE.CylinderGeometry(0.175, 0.175, 0.14, 22), M.chrome, -0.42, 0.62, -0.18, 0.12);
  add(new THREE.CylinderGeometry(0.176, 0.176, 0.005, 22), M.drumhead, -0.42, 0.695, -0.17, 0.12);
  for (const [x, y, z, r, rz] of [[-0.66, 0.92, -0.2, 0.18, 0.05], [-0.5, 1.28, 0.05, 0.22, 0.28], [0.62, 1.12, 0.0, 0.26, -0.22], [0.2, 1.36, 0.12, 0.2, -0.1]]) {
    add(new THREE.CylinderGeometry(r, r * 0.98, 0.006, 32), M.brass, x, y, z, 0.18, rz);
    add(new THREE.CylinderGeometry(0.01, 0.012, y, 6), M.chrome, x, y / 2, z);
  }
  return g;
}

export function guitar({ color = 0x9a1a1a, bass = false } = {}) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -0.24); s.bezierCurveTo(0.24, -0.26, 0.2, 0.0, 0.13, 0.04); s.bezierCurveTo(0.2, 0.12, 0.17, 0.22, 0.05, 0.22);
  s.lineTo(-0.05, 0.22); s.bezierCurveTo(-0.17, 0.22, -0.2, 0.12, -0.13, 0.04); s.bezierCurveTo(-0.2, 0.0, -0.24, -0.26, 0, -0.24);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008 }), phys({ color, roughness: 0.2, clearcoat: 1 }));
  g.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.045, bass ? 0.8 : 0.6, 0.025), std({ color: 0x1a0f08 }));
  neck.position.set(0, 0.22 + (bass ? 0.4 : 0.3), 0.03); g.add(neck);
  return g;
}

export function micStand({ height = 1.5, boom = 0.3 } = {}) {
  const M = mats();
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, height, 6), M.black); pole.position.y = height / 2; g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.02, 16), M.black); base.position.y = 0.01; g.add(base);
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.17, 10), M.black); mic.rotation.x = 1.3; mic.position.set(0, height + 0.02, 0.08); g.add(mic);
  const grill = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), M.chrome); grill.position.set(0, height + 0.04, 0.17); g.add(grill);
  return g;
}

export function ampStack({ w = 0.75, h = 0.75, d = 0.36, count = 2 } = {}) {
  const M = mats();
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.98, d), M.cab); c.position.y = h / 2 + i * h; c.castShadow = true; g.add(c);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.88, h * 0.8), M.fabric); f.position.set(0, h / 2 + i * h, d / 2 + 0.003); g.add(f);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.24, d * 0.85), M.cab); head.position.y = count * h + 0.12; g.add(head);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, 0.08), mats().chrome); panel.position.set(0, count * h + 0.14, d * 0.43); g.add(panel);
  return g;
}

export function wedge({ w = 0.6 } = {}) {
  const s = new THREE.Shape(); s.moveTo(-0.26, 0); s.lineTo(0.26, 0); s.lineTo(0.26, 0.14); s.lineTo(-0.26, 0.36); s.lineTo(-0.26, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); geo.translate(-w / 2, 0, 0);
  const m = new THREE.Mesh(geo, mats().cab); m.castShadow = true;
  return m;
}

export function keyboardRig() {
  const M = mats();
  const g = new THREE.Group();
  for (const [y, z] of [[0.92, 0], [1.1, -0.15]]) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.34), M.cab); k.position.set(0, y, z); g.add(k);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.14), M.keysWhite); keys.position.set(0, y + 0.055, z + 0.08); g.add(keys);
  }
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), M.black); st.position.set(0, 0.45, 0); g.add(st);
  const ft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.05), M.black); ft.position.set(0, 0.02, 0); g.add(ft);
  return g;
}

// A performer: the same jointed body as the crowd, dressed for the stage.
export function performer(pose = 'stand', { top = 0x101012, height = 1.78, hair = 0, skin = 0.3, cast = true, jacket = true, detail = 2 } = {}) {
  const geo = humanGeometry(pose, { hair, detail, jacket });
  const cols = new Float32Array(geo.attributes.position.count * 3);
  const topC = new THREE.Color(top);
  const skinC = new THREE.Color().setRGB(0.66, 0.36, 0.22).lerp(new THREE.Color(0.14, 0.06, 0.03), skin);
  const hairC = new THREE.Color(0x0c0a09);
  const pants = new THREE.Color(0x0b0b0d);
  const shoe = new THREE.Color(0x050505);
  const part = geo.attributes.aPart.array;
  for (let i = 0; i < part.length; i++) {
    const c = part[i] < 0.5 ? topC : part[i] < 1.5 ? skinC : part[i] < 2.5 ? hairC : part[i] < 3.5 ? pants : shoe;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, phys({ vertexColors: true, roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x303030) }));
  m.scale.setScalar(height / 1.75);
  m.castShadow = cast;
  return m;
}

// ── seating for rooms (club chairs, theatre and hall seats) ──
export function seatGeometry({ style = 'theatre' } = {}) {
  if (style === 'theatre') {
    const back = new RoundedBoxGeometry(0.5, 0.62, 0.1, 1, 0.04); back.rotateX(-0.2); back.translate(0, 0.72, -0.2);
    const pan = new RoundedBoxGeometry(0.48, 0.1, 0.46, 1, 0.04); pan.translate(0, 0.44, 0.02);
    const fabric = mergeGeometries([back, pan]);
    const shell = new RoundedBoxGeometry(0.52, 0.64, 0.04, 1, 0.015); shell.rotateX(-0.2); shell.translate(0, 0.72, -0.265);
    const arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.BoxGeometry(0.05, 0.05, 0.42).toNonIndexed(); a.translate(s * 0.27, 0.64, 0.0); arms.push(a);
      const l = new THREE.BoxGeometry(0.05, 0.62, 0.08).toNonIndexed(); l.translate(s * 0.27, 0.31, -0.08); arms.push(l);
    }
    return { fabric, frame: mergeGeometries([shell, ...arms]) };
  }
  // bentwood club chair
  const seat = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16); seat.translate(0, 0.46, 0);
  const legs = [];
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) { const l = new THREE.CylinderGeometry(0.014, 0.012, 0.46, 6); l.translate(x, 0.23, z); legs.push(l); }
  const hoop = new THREE.TorusGeometry(0.2, 0.014, 6, 16, Math.PI); hoop.translate(0, 0.72, -0.17);
  const s1 = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5); s1.translate(-0.2, 0.6, -0.17);
  const s2 = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5); s2.translate(0.2, 0.6, -0.17);
  return { fabric: seat, frame: mergeGeometries([...legs, hoop, s1, s2]) };
}

// spots: [{ x, y, z, turn }] — turn = heading of the seat (0 faces +z).
export function seatField(spots, { fabric, frame, style = 'theatre' }) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const geo = seatGeometry({ style });
  const a = new THREE.InstancedMesh(geo.fabric, fabric, spots.length);
  const b = new THREE.InstancedMesh(geo.frame, frame, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(V3(0, 1, 0), s.turn ?? Math.PI);
    m.compose(V3(s.x, s.y, s.z), q, V3(1, 1, 1));
    a.setMatrixAt(i, m); b.setMatrixAt(i, m);
  });
  a.receiveShadow = b.receiveShadow = true;
  g.add(a, b);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// the bowl: tiers of rows following a rounded rectangle
// ─────────────────────────────────────────────────────────────────────────────

// A rounded-rectangle ring around the field. `at(k, d)` gives the point for
// parameter sample k at outward offset d; the sample list is shared by every
// offset, so row n and row n+1 always line up quad for quad.
export function ringPath({ hx, hz, zc, rc }) {
  const ax = hx - rc, az = hz - rc;
  const pts = [];
  const CORNER = 12, STRAIGHT = 16;
  for (let seg = 0; seg < 8; seg++) {
    const n = seg % 2 ? CORNER : STRAIGHT;
    for (let i = seg === 0 ? 0 : 1; i <= n; i++) pts.push({ seg, t: i / n });
  }
  const at = (p, d) => {
    const R = rc + d;
    const { seg, t } = p;
    const arc = (cx, cz, a0) => { const a = a0 + t * Math.PI / 2; return { x: cx + R * Math.cos(a), z: zc + cz + R * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) }; };
    switch (seg) {
      case 0: return { x: ax + R, z: zc - az + t * 2 * az, nx: 1, nz: 0 };
      case 1: return arc(ax, az, 0);
      case 2: return { x: ax - t * 2 * ax, z: zc + az + R, nx: 0, nz: 1 };
      case 3: return arc(-ax, az, Math.PI / 2);
      case 4: return { x: -ax - R, z: zc + az - t * 2 * az, nx: -1, nz: 0 };
      case 5: return arc(-ax, -az, Math.PI);
      case 6: return { x: -ax + t * 2 * ax, z: zc - az - R, nx: 0, nz: -1 };
      default: return arc(ax, -az, Math.PI * 1.5);
    }
  };
  return { pts, at };
}

// tiers: [{ rows, rise, riseFar, run, yBase, inset, cutZ, crowd: bool, ribbon: bool, face }]
export function buildBowl(pipe, {
  hx, hz, zc, rc, tiers, seatColor = 0x2a2e3a, seatSpacing = 0.5, block = 14, aisle = 1.3,
  crowdCut = -Infinity, stage = V3(0, 8, 0), seed = 7, occupancy = 0.95, concreteTone = 0.22,
  cover = null,        // (x, z) => true where the seats are sold off and tarped
  occ = null,          // (x, z) => occupancy multiplier
  path: givenPath = null, // any outline with the ringPath interface (open or closed)
  caps = false,        // close the ends of an open outline with walls
}) {
  const path = givenPath || ringPath({ hx, hz, zc, rc });
  const P = path.pts;
  const pos = [], nor = [], uvs = [];
  const sPos = [], sNor = [], sUv = [], sUv2 = [];
  const tPos = [], tNor = [], tUv = [];
  const people = [];
  const aisleLights = [];
  const fascias = [];
  const rnd = prng(seed);
  const quad = (A, B, C, D, n, u0, u1, v0, v1, arr = [pos, nor, uvs]) => {
    const [po, no, uv] = arr;
    for (const [p, u, v] of [[A, u0, v0], [B, u1, v0], [C, u1, v1], [A, u0, v0], [C, u1, v1], [D, u0, v1]]) {
      po.push(p.x, p.y, p.z); no.push(n.x, n.y, n.z); uv.push(u, v);
    }
  };
  // arc length at offset 0 for aisles, so aisles run straight up the rake
  const s0 = [0];
  for (let k = 1; k < P.length; k++) { const a = path.at(P[k - 1], 0), b = path.at(P[k], 0); s0.push(s0[k - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const inAisle = (s) => { const m = s % block; return m < aisle; };
  tiers.forEach((T, ti) => {
    const cut = T.cutZ ?? -Infinity;
    let y = T.yBase;
    const tops = [];
    for (let r = 0; r < T.rows; r++) { const t = T.rows === 1 ? 0 : r / (T.rows - 1); y += T.rise + ((T.riseFar ?? T.rise) - T.rise) * t; tops.push(y); }
    const inner = T.inset;
    // `lift` raises a tier where the building does: an outfield stand starts
    // above its fence, an infield one just above the field
    const lift = P.map((pt) => { if (!T.lift) return 0; const a = path.at(pt, inner); return T.lift(a.x, a.z); });
    const incl = P.map((_, k) => {
      if (k >= P.length - 1) return false;
      const a = path.at(P[k], inner), b = path.at(P[k + 1], inner);
      return !(Math.min(a.z, b.z) < cut || (T.where && !T.where((a.x + b.x) / 2, (a.z + b.z) / 2)));
    });
    // tier front face (the fascia/balcony front), from below the tier to its first tread
    const f0 = ti === 0 ? 0 : T.yBase - (T.face ?? 2.6);
    for (let k = 0; k < P.length - 1; k++) {
      const a = path.at(P[k], inner), b = path.at(P[k + 1], inner);
      if (!incl[k]) continue;
      const la = lift[k], lb = lift[k + 1];
      const n = V3(-(a.nx + b.nx) / 2, 0, -(a.nz + b.nz) / 2).normalize();
      const fa = ti === 0 ? 0 : f0 + la, fb = ti === 0 ? 0 : f0 + lb;
      quad(V3(a.x, fa, a.z), V3(b.x, fb, b.z), V3(b.x, tops[0] - T.rise + lb, b.z), V3(a.x, tops[0] - T.rise + la, a.z), n, s0[k], s0[k + 1], f0, tops[0]);
    }
    fascias.push({ inset: inner, y0: f0, y1: tops[0] - T.rise, cut, ribbon: T.ribbon });
    for (let r = 0; r < T.rows; r++) {
      const d0 = inner + r * T.run, d1 = d0 + T.run;
      const top = tops[r], below = r === 0 ? tops[0] - T.rise : tops[r - 1];
      let arc = 0;
      for (let k = 0; k < P.length - 1; k++) {
        const a0 = path.at(P[k], d0), b0 = path.at(P[k + 1], d0);
        const a1 = path.at(P[k], d1), b1 = path.at(P[k + 1], d1);
        const segLen = Math.hypot(b0.x - a0.x, b0.z - a0.z);
        if (!incl[k]) { arc += segLen; continue; }
        const la = lift[k], lb = lift[k + 1];
        const nIn = V3(-(a0.nx + b0.nx) / 2, 0, -(a0.nz + b0.nz) / 2).normalize();
        // riser, facing the field
        quad(V3(a0.x, below + la, a0.z), V3(b0.x, below + lb, b0.z), V3(b0.x, top + lb, b0.z), V3(a0.x, top + la, a0.z), nIn, arc, arc + segLen, below, top);
        // tread
        quad(V3(a0.x, top + la, a0.z), V3(b0.x, top + lb, b0.z), V3(b1.x, top + lb, b1.z), V3(a1.x, top + la, a1.z), V3(0, 1, 0), arc, arc + segLen, d0, d1);
        // sold off behind the stage: a black tarp over the rows, nobody in them
        const midX = (a0.x + b0.x) / 2, midZ = (a0.z + b0.z) / 2;
        if (cover && cover(midX, midZ)) {
          quad(V3(a0.x, top + la + 0.06, a0.z), V3(b0.x, top + lb + 0.06, b0.z), V3(b1.x, top + lb + 0.9, b1.z), V3(a1.x, top + la + 0.9, a1.z),
            nIn.clone().multiplyScalar(0.7).add(V3(0, 0.7, 0)).normalize(), arc, arc + segLen, 0, 1, [tPos, tNor, tUv]);
          arc += segLen;
          continue;
        }
        // seat backs: a strip leaning back from the tread
        const dB = d0 + T.run * 0.5, dT = d0 + T.run * 0.62;
        const aB = path.at(P[k], dB), bB = path.at(P[k + 1], dB), aT = path.at(P[k], dT), bT = path.at(P[k + 1], dT);
        const sn = nIn.clone().multiplyScalar(0.95).add(V3(0, 0.3, 0)).normalize();
        quad(V3(aB.x, top + la + 0.34, aB.z), V3(bB.x, top + lb + 0.34, bB.z), V3(bT.x, top + lb + 0.82, bT.z), V3(aT.x, top + la + 0.82, aT.z), sn, arc, arc + segLen, 0, 1, [sPos, sNor, sUv]);
        sUv2.push(s0[k], 0, s0[k + 1], 0, s0[k + 1], 0, s0[k], 0, s0[k + 1], 0, s0[k], 0);
        // people and aisle lights along this piece
        const n = Math.max(1, Math.floor(segLen / seatSpacing));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const sAt = s0[k] + (s0[k + 1] - s0[k]) * t;
          const x = lerp(aB.x, bB.x, t), z = lerp(aB.z, bB.z, t);
          if (inAisle(sAt)) {
            if (i === 0 || !inAisle(s0[k] + (s0[k + 1] - s0[k]) * ((i - 0.5) / n))) aisleLights.push({ x: lerp(a0.x, b0.x, t), y: top + lerp(la, lb, t) + 0.05, z: lerp(a0.z, b0.z, t) });
            continue;
          }
          if (z < crowdCut || !T.crowd) continue;
          if (rnd() > occupancy * (occ ? occ(x, z) : 1)) continue;
          people.push({ x: x - nIn.x * 0.12, y: top + lerp(la, lb, t), z: z - nIn.z * 0.12, turn: Math.atan2(stage.x - x, stage.z - z) });
        }
        arc += segLen;
      }
    }
    // back wall of the tier (the concourse behind the last row)
    const dB = inner + T.rows * T.run;
    for (let k = 0; k < P.length - 1; k++) {
      const a = path.at(P[k], dB), b = path.at(P[k + 1], dB);
      if (!incl[k]) continue;
      const n = V3(-(a.nx + b.nx) / 2, 0, -(a.nz + b.nz) / 2).normalize();
      const topY = tops[T.rows - 1];
      const ta = topY + lift[k], tb = topY + lift[k + 1];
      quad(V3(a.x, ta, a.z), V3(b.x, tb, b.z), V3(b.x, tb + (T.backWall ?? 4), b.z), V3(a.x, ta + (T.backWall ?? 4), a.z), n, s0[k], s0[k + 1], topY, topY + 4);
    }
    // where a tier stops part-way round (an upper deck that only covers the
    // infield), close the end with a wall rather than leave it cut open
    for (let k = 1; k < P.length - 1; k++) {
      if (incl[k] === incl[k - 1]) continue;
      const a = path.at(P[k], inner), b = path.at(P[k], dB);
      const nb = path.at(P[incl[k] ? k + 1 : k - 1], inner);
      const n = V3(a.x - nb.x, 0, a.z - nb.z).normalize();
      const y0 = (ti === 0 ? 0 : f0) + lift[k], y1 = tops[T.rows - 1] + (T.backWall ?? 4) + lift[k];
      quad(V3(a.x, y0, a.z), V3(b.x, y0, b.z), V3(b.x, y1, b.z), V3(a.x, y1, a.z), n, 0, T.rows * T.run, y0, y1);
    }
    T._tops = tops;
    // an open outline's ends: a wall from the floor to the top of the tier
    if (caps) {
      const topY = tops[T.rows - 1] + (T.backWall ?? 4);
      for (const [k, sgn] of [[0, 1], [P.length - 1, -1]]) {
        const a = path.at(P[k], inner), b = path.at(P[k], inner + T.rows * T.run);
        const t = path.at(P[k + sgn] || P[k], inner);
        const n = V3(a.x - t.x, 0, a.z - t.z).normalize();
        quad(V3(a.x, 0, a.z), V3(b.x, 0, b.z), V3(b.x, topY, b.z), V3(a.x, topY, a.z), n, 0, T.rows * T.run, 0, topY);
      }
    }
  });
  const mk = (p, n, u) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); return g; };
  const conc = withRepeat(concreteTex({ key: `bowlconc${concreteTone}`, tone: concreteTone }), 1 / 4, 1 / 4);
  const struct = new THREE.Mesh(mk(pos, nor, uvs), std({ ...conc, color: 0xffffff, roughness: 0.95 }));
  struct.receiveShadow = true;
  const sg = mk(sPos, sNor, sUv);
  sg.setAttribute('uv1', new THREE.Float32BufferAttribute(sUv2, 2));
  const stripSet = seatStripTex(seatColor);
  const seatMat = std({ ...stripSet, roughness: 0.6, side: THREE.DoubleSide });
  seatMat.onBeforeCompile = (sh) => {
    sh.uniforms.uBlock = { value: block }; sh.uniforms.uAisle = { value: aisle };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 uv1; varying float vS0;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvS0 = uv1.x;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vS0; uniform float uBlock, uAisle;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (mod(vS0, uBlock) < uAisle) discard;');
  };
  seatMat.customProgramCacheKey = () => 'seatstrip';
  const seats = new THREE.Mesh(sg, seatMat);
  seats.userData.noCollide = true;
  const g = new THREE.Group();
  g.add(struct, seats);
  if (tPos.length) {
    const tarp = new THREE.Mesh(mk(tPos, tNor, tUv), std({ color: 0x050506, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }));
    g.add(tarp);
  }
  return { group: g, people, aisleLights, fascias, path, tiers };
}

// LED ribbon boards along the tier fronts.
export function ribbonBoards(bowl, { height = 0.9, tiers = [0], bright = 1.4 } = {}) {
  const pos = [], uv = [];
  const P = bowl.path.pts;
  let total = 0;
  for (const ti of tiers) {
    const F = bowl.fascias[ti];
    if (!F) continue;
    const y1 = F.y1 - 0.25, y0 = y1 - height;
    const d = F.inset - 0.04;
    for (let k = 0; k < P.length - 1; k++) {
      const a = bowl.path.at(P[k], d), b = bowl.path.at(P[k + 1], d);
      if (Math.min(a.z, b.z) < F.cut) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (const [p, u, v] of [[[a.x, y0, a.z], total, 0], [[b.x, y0, b.z], total + len, 0], [[b.x, y1, b.z], total + len, 1], [[a.x, y0, a.z], total, 0], [[b.x, y1, b.z], total + len, 1], [[a.x, y1, a.z], total, 1]]) {
        pos.push(...p); uv.push(u / 60, v);
      }
      total += len;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = ledMaterial({ tex: null, pitch: 0.012, w: total / 60 * 60, h: height, bright, kind: 'ribbon' });
  mat.uniforms.uPix.value.set(60 / 0.02, height / 0.02);
  mat.side = THREE.DoubleSide;
  return new THREE.Mesh(geo, mat);
}
