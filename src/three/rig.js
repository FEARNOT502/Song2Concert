// ─────────────────────────────────────────────────────────────────────────────
// rigging, sound, screens, stage furniture
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, V3, aluminium, blackSteel, glowMat, grilleTex, phys, smooth, stageTex, std, withRepeat } from './core.js';
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
  if (style === 'folding') {
    // the arena floor's folding chair: a plastic shell on a steel frame
    const pan = new THREE.BoxGeometry(0.42, 0.03, 0.38); pan.translate(0, 0.45, 0.02);
    const back = new THREE.BoxGeometry(0.42, 0.26, 0.03); back.rotateX(-0.12); back.translate(0, 0.74, -0.2);
    const fabric = mergeGeometries([pan, back]);
    const legs = [];
    for (const s of [-1, 1]) {
      const f = new THREE.BoxGeometry(0.025, 0.46, 0.025); f.translate(s * 0.19, 0.23, 0.17); legs.push(f);
      const r = new THREE.BoxGeometry(0.025, 0.88, 0.025); r.rotateX(-0.08); r.translate(s * 0.19, 0.44, -0.18); legs.push(r);
    }
    const bar = new THREE.BoxGeometry(0.4, 0.02, 0.02); bar.translate(0, 0.08, 0.17); legs.push(bar);
    return { fabric, frame: mergeGeometries(legs) };
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

