// ─────────────────────────────────────────────────────────────────────────────
// people
//
// Near people are real geometry: a jointed body built from tapered segments,
// one instanced draw per pose, animated on the GPU (bob, sway, arms raised on
// the chorus, fists on the kick). Far people — the upper tiers of a stadium —
// are billboards cut from a silhouette atlas, which lets a 90,000-seat bowl
// actually be full.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEX, V3, clamp, glowSprite, prng } from './core.js';

// Crowd uniforms shared by every crowd material in a venue.
export function crowdUniforms() {
  return {
    uTime: { value: 0 },
    uKick: { value: 0 },
    uEnergy: { value: 0.4 },
    uRimColor: { value: new THREE.Color(0xffa060) },
    uRim: { value: 1 },
    uStage: { value: V3(0, 8, 0) },   // where the light comes from
    uWash: { value: new THREE.Color(0x000000) },
    uAmb: { value: new THREE.Color(0x101014) },
    uFlick: { value: 0 },
  };
}

// A tapered segment between two joints, with an elliptical cross-section.
export function segment(a, b, ra, rb, { sx = 1, sz = 1, radial = 7, part = 0, arm = 0 } = {}) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, radial, 1, false);
  g.scale(sx, 1, sz);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return tag(g, part, arm);
}
export function blob(c, rx, ry, rz, { part = 0, arm = 0, w = 10, h = 8, phiLen = Math.PI * 2, thetaLen = Math.PI, thetaStart = 0 } = {}) {
  const g = new THREE.SphereGeometry(1, w, h, 0, phiLen, thetaStart, thetaLen);
  g.scale(rx, ry, rz);
  g.translate(c.x, c.y, c.z);
  return tag(g, part, arm);
}
export function tag(g, part, arm) {
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  g.setAttribute('aArm', new THREE.BufferAttribute(new Float32Array(n).fill(arm), 1));
  return g;
}

// parts: 0 top (shirt), 1 skin, 2 hair, 3 legs (trousers), 4 shoes
export const SHOULDER_Y = 1.43, SHOULDER_X = 0.19;

// Joint sets. Height 1.75 m; facing +z.
export function skeleton(pose) {
  const J = {
    hip: V3(0, 0.95, 0), chest: V3(0, 1.3, 0), neck: V3(0, 1.49, 0.0), head: V3(0, 1.635, 0.015),
    shL: V3(-SHOULDER_X, SHOULDER_Y, 0), shR: V3(SHOULDER_X, SHOULDER_Y, 0),
    elL: V3(-0.23, 1.16, -0.01), elR: V3(0.23, 1.16, -0.01),
    haL: V3(-0.24, 0.9, 0.03), haR: V3(0.24, 0.9, 0.03),
    hiL: V3(-0.1, 0.93, 0), hiR: V3(0.1, 0.93, 0),
    knL: V3(-0.11, 0.5, 0.02), knR: V3(0.11, 0.5, 0.02),
    ftL: V3(-0.12, 0.06, 0.0), ftR: V3(0.12, 0.06, 0.0),
  };
  if (pose === 'seated') {
    J.hip.set(0, 0.47, 0); J.chest.set(0, 0.82, 0.02); J.neck.set(0, 1.0, 0.02); J.head.set(0, 1.145, 0.04);
    J.shL.set(-SHOULDER_X, 0.94, 0.02); J.shR.set(SHOULDER_X, 0.94, 0.02);
    J.elL.set(-0.24, 0.7, 0.12); J.elR.set(0.24, 0.7, 0.12);
    J.haL.set(-0.16, 0.6, 0.34); J.haR.set(0.16, 0.6, 0.34);
    J.hiL.set(-0.1, 0.47, 0.02); J.hiR.set(0.1, 0.47, 0.02);
    J.knL.set(-0.12, 0.5, 0.46); J.knR.set(0.12, 0.5, 0.46);
    J.ftL.set(-0.13, 0.06, 0.52); J.ftR.set(0.13, 0.06, 0.52);
  }
  if (pose === 'mic') { J.elR.set(0.22, 1.2, 0.14); J.haR.set(0.08, 1.34, 0.3); J.elL.set(-0.24, 1.14, 0.05); J.haL.set(-0.2, 0.95, 0.16); J.head.z += 0.03; }
  if (pose === 'pianist') {
    Object.assign(J, skeleton('seated'));
    J.chest.z = 0.07; J.neck.z = 0.1; J.head.z = 0.14; J.shL.z = J.shR.z = 0.06;
    J.elL.set(-0.25, 0.72, 0.24); J.haL.set(-0.2, 0.8, 0.48); J.elR.set(0.25, 0.72, 0.24); J.haR.set(0.18, 0.8, 0.48);
  }
  if (pose === 'guitar') { J.elL.set(-0.26, 1.18, 0.14); J.haL.set(-0.42, 1.2, 0.3); J.elR.set(0.22, 1.12, 0.1); J.haR.set(0.05, 1.02, 0.22); }
  if (pose === 'keys') { J.elL.set(-0.24, 1.14, 0.2); J.haL.set(-0.2, 1.02, 0.42); J.elR.set(0.24, 1.14, 0.2); J.haR.set(0.2, 1.02, 0.42); }
  if (pose === 'drummer') {
    Object.assign(J, skeleton('seated'));
    J.hip.y = 0.55; J.chest.y = 0.9; J.neck.y = 1.08; J.head.y = 1.225; J.shL.y = J.shR.y = 1.02;
    J.elL.set(-0.28, 0.82, 0.2); J.haL.set(-0.2, 0.86, 0.46); J.elR.set(0.28, 0.82, 0.2); J.haR.set(0.24, 0.9, 0.46);
  }
  if (pose === 'conductor') { J.elL.set(-0.36, 1.4, 0.1); J.haL.set(-0.5, 1.62, 0.18); J.elR.set(0.36, 1.36, 0.12); J.haR.set(0.46, 1.5, 0.3); }
  // the orchestra
  const seatedPose = (el, ha, er, hr) => {
    Object.assign(J, skeleton('seated'));
    J.elL.set(...el); J.haL.set(...ha); J.elR.set(...er); J.haR.set(...hr);
  };
  if (pose === 'violin') { seatedPose([-0.3, 1.0, 0.2], [-0.24, 1.07, 0.44], [0.3, 0.9, 0.14], [0.2, 0.99, 0.34]); J.head.x = -0.03; }
  if (pose === 'cello') seatedPose([-0.24, 0.98, 0.25], [-0.1, 1.08, 0.36], [0.28, 0.68, 0.22], [0.16, 0.66, 0.44]);
  if (pose === 'wind') seatedPose([-0.22, 0.84, 0.2], [-0.04, 0.9, 0.32], [0.22, 0.78, 0.22], [0.04, 0.78, 0.36]);
  if (pose === 'flute') seatedPose([-0.22, 0.95, 0.22], [-0.04, 1.09, 0.2], [0.3, 1.0, 0.1], [0.36, 1.1, 0.16]);
  if (pose === 'brass') seatedPose([-0.22, 0.95, 0.26], [-0.05, 1.03, 0.36], [0.2, 0.95, 0.26], [0.05, 1.02, 0.4]);
  if (pose === 'horn') seatedPose([-0.2, 0.86, 0.22], [0.0, 0.9, 0.28], [0.28, 0.82, 0.08], [0.24, 0.72, 0.16]);
  if (pose === 'harp') seatedPose([-0.28, 1.0, 0.24], [-0.1, 1.05, 0.46], [0.28, 1.0, 0.18], [0.1, 1.15, 0.4]);
  if (pose === 'bassist') { J.elL.set(-0.3, 1.45, 0.2); J.haL.set(-0.2, 1.62, 0.32); J.elR.set(0.26, 1.05, 0.2); J.haR.set(0.1, 1.0, 0.4); }
  if (pose === 'mallets') { J.elL.set(-0.24, 1.1, 0.2); J.haL.set(-0.16, 1.02, 0.44); J.elR.set(0.24, 1.1, 0.2); J.haR.set(0.16, 1.02, 0.44); }
  if (pose === 'armsUp') { J.elL.set(-0.26, 1.72, 0.02); J.haL.set(-0.3, 2.0, 0.04); J.elR.set(0.26, 1.72, 0.02); J.haR.set(0.3, 2.0, 0.04); }
  return J;
}

// hair: 0 short, 1 long, 2 bun, 3 cap-like crop
export function humanGeometry(pose = 'stand', { hair = 0, detail = 1, legs = true, dress = false, jacket = false } = {}) {
  const J = skeleton(pose);
  const r = detail > 1.5 ? 14 : detail > 0.5 ? 8 : 6;
  const parts = [];
  // legs
  if (legs) {
    for (const [hi, kn, ft] of [[J.hiL, J.knL, J.ftL], [J.hiR, J.knR, J.ftR]]) {
      if (dress) {
        parts.push(segment(hi, kn, 0.09, 0.055, { radial: r, part: 3 }));
      } else {
        parts.push(segment(hi, kn, 0.085, 0.06, { radial: r, part: 3 }));
      }
      parts.push(segment(kn, ft, 0.058, 0.042, { radial: r, part: 3 }));
      parts.push(blob(ft.clone().add(V3(0, -0.02, 0.05)), 0.05, 0.035, 0.12, { part: 4, w: 6, h: 4 }));
    }
  }
  if (dress) parts.push(segment(J.hip.clone().add(V3(0, 0.05, 0)), V3(J.hip.x, J.knL.y + 0.02, J.hip.z), 0.17, 0.26, { radial: 10, part: 0 }));
  // pelvis and torso
  parts.push(segment(J.hip.clone().add(V3(0, -0.07, 0)), J.chest, 0.15, 0.17, { sz: 0.62, radial: Math.max(10, r), part: 0 }));
  if (jacket) parts.push(segment(J.hip.clone().add(V3(0, -0.16, 0.004)), J.chest.clone().add(V3(0, 0.06, 0)), 0.185, 0.19, { sz: 0.66, radial: Math.max(12, r), part: 0 }));
  parts.push(segment(J.chest, J.neck.clone().add(V3(0, -0.04, 0)), 0.17, 0.12, { sz: 0.6, radial: 10, part: 0 }));
  // shoulders: a flattened capsule across
  parts.push(segment(J.shL.clone().add(V3(0.02, 0, 0)), J.shR.clone().add(V3(-0.02, 0, 0)), 0.07, 0.07, { sz: 0.9, radial: 8, part: 0 }));
  parts.push(blob(J.shL, 0.075, 0.075, 0.07, { part: 0, w: 7, h: 5 }));
  parts.push(blob(J.shR, 0.075, 0.075, 0.07, { part: 0, w: 7, h: 5 }));
  // neck, head
  parts.push(segment(J.neck.clone().add(V3(0, -0.05, 0)), J.head.clone().add(V3(0, -0.06, -0.01)), 0.052, 0.048, { radial: r, part: 1 }));
  const hw = detail > 1.5 ? 24 : detail > 0.5 ? 14 : 9, hh = detail > 1.5 ? 16 : detail > 0.5 ? 10 : 7;
  parts.push(blob(J.head, 0.078, 0.108, 0.098, { part: 1, w: hw, h: hh }));
  // hair
  const hc = J.head.clone().add(V3(0, 0.012, -0.014));
  {
    // the cap is tilted back so it covers the crown and the whole back of the
    // head down to the nape, and leaves the face open
    const cap = new THREE.SphereGeometry(1, hw, hh, 0, Math.PI * 2, 0, Math.PI * 0.62);
    cap.rotateX(-0.62);
    cap.scale(0.087, 0.11, 0.106);
    cap.translate(hc.x, hc.y, hc.z);
    parts.push(tag(cap, 2, 0));
  }
  if (hair === 1) {
    parts.push(segment(J.head.clone().add(V3(0, 0.02, -0.06)), J.head.clone().add(V3(0, -0.2, -0.085)), 0.085, 0.07, { sz: 0.55, radial: r, part: 2 }));
  } else if (hair === 2) {
    parts.push(blob(J.head.clone().add(V3(0, 0.06, -0.1)), 0.055, 0.05, 0.05, { part: 2, w: 8, h: 6 }));
  } else if (hair === 3) {
    parts.push(blob(hc.clone().add(V3(0, 0.01, 0)), 0.09, 0.09, 0.108, { part: 0, w: hw, h: hh, thetaLen: Math.PI * 0.45 }));
  }
  // arms, tagged so the shader can raise them
  for (const [sh, el, ha, arm] of [[J.shL, J.elL, J.haL, -1], [J.shR, J.elR, J.haR, 1]]) {
    parts.push(segment(sh, el, 0.052, 0.042, { radial: r - 1, part: 0, arm }));
    parts.push(segment(el, ha, 0.04, 0.032, { radial: r - 1, part: 1, arm }));
    parts.push(blob(ha, 0.036, 0.045, 0.028, { part: 1, arm, w: 6, h: 4 }));
  }
  return mergeGeometries(parts);
}

// Clothing: mostly dark, as a crowd at a show is, with a scatter of colour and
// the occasional white tee that catches the light.
export const TOPS = [0x121214, 0x16161a, 0x1c1c22, 0x0e0e10, 0x24242a, 0x2a2622, 0x3a3a40, 0x1f2a3a, 0x3a1c1c, 0x2e3a2a, 0x8a8a88, 0xbdbab2, 0x5a2a2a, 0x2a3450, 0x6a5a40];
export const HAIR = [0x0c0a09, 0x16110d, 0x221a14, 0x3a2a1e, 0x5a4230, 0x8a6a4a, 0x2a2a2a];

// The material every 3D person shares. `stand` controls the kind of motion:
// 'floor' (standing crowd: bob, sway, arms), 'seated' (small motion), 'still'.
export function personMaterial(cu, kind = 'floor') {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: 0.3 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cu);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart; attribute float aArm;
        attribute vec4 iLook;   // x: phase, y: raise propensity, z: which arm (-1, 1, 2 both), w: skin
        attribute vec3 iHair;
        uniform float uTime, uKick, uEnergy;
        varying vec3 vPC; varying vec3 vWorldN; varying vec3 vWorldP;
        vec3 skinRamp(float s) {
          vec3 a = vec3(0.72, 0.42, 0.28), b = vec3(0.5, 0.24, 0.12), c = vec3(0.14, 0.06, 0.03);
          return s < 0.5 ? mix(a, b, s * 2.0) : mix(b, c, s * 2.0 - 1.0);
        }
        float armAngle(float side) {
          ${kind === 'floor' ? `
          float up = step(1.0 - uEnergy * 0.75, iLook.y);
          float mine = (iLook.z > 1.5 || abs(iLook.z - side) < 0.1) ? 1.0 : 0.0;
          float pump = step(0.45, iLook.y) * uKick;
          float wave = 0.5 + 0.5 * sin(uTime * 2.2 + iLook.x * 3.0);
          return mine * (up * (2.35 + 0.35 * wave + 0.25 * uKick) + (1.0 - up) * pump * 1.1);
          ` : 'return 0.0;'}
        }
        mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
        mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
        mat3 armRot(float side, float ang) { return rotZ(-side * ang * 0.18) * rotX(-ang); }
      `)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (aArm != 0.0) { objectNormal = armRot(aArm, armAngle(aArm)) * objectNormal; }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (aArm != 0.0) {
          vec3 sh = vec3(aArm * ${SHOULDER_X.toFixed(3)}, ${kind === 'seated' ? '0.94' : SHOULDER_Y.toFixed(3)}, 0.0);
          transformed = armRot(aArm, armAngle(aArm)) * (transformed - sh) + sh;
        }
        ${kind === 'floor' ? `
        float bob = max(0.0, sin(uTime * 7.6 + iLook.x)) * uKick;
        transformed.y += (bob * 0.05 + uEnergy * 0.012 * sin(uTime * 3.8 + iLook.x)) * step(0.25, iLook.y);
        transformed.x += sin(uTime * 1.9 + iLook.x * 2.0) * 0.02 * uEnergy;` : ''}
        ${kind === 'seated' ? 'transformed.x += sin(uTime * 0.6 + iLook.x * 5.0) * 0.006 * step(0.9, position.y);' : ''}
        vec3 top = instanceColor;
        vec3 skin = skinRamp(iLook.w);
        vec3 pants = top * 0.35 + vec3(0.02, 0.02, 0.025);
        vPC = aPart < 0.5 ? top : aPart < 1.5 ? skin : aPart < 2.5 ? iHair : aPart < 3.5 ? pants : vec3(0.02);
      `)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWorldP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vWorldN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRimColor, uStage, uWash, uAmb; uniform float uRim, uFlick;
        varying vec3 vPC; varying vec3 vWorldN; varying vec3 vWorldP;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vPC, opacity );')
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // backlight from the stage: the crowd between you and the show is a
          // row of lit edges, not a black wall
          vec3 V = normalize(cameraPosition - vWorldP);
          vec3 L = normalize(uStage - vWorldP);
          vec3 N = normalize(vWorldN);
          float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
          float back = clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0);
          float lit = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
          totalEmissiveRadiance += uRimColor * rim * back * back * uRim;
          totalEmissiveRadiance += (uWash * lit * lit + uAmb) * diffuseColor.rgb;
        }`);
  };
  m.customProgramCacheKey = () => `person-${kind}`;
  return m;
}

// people: [{ x, y, z, h (scale, 1 = 1.75 m), turn, top, skin, hair, raise, arm }]
// Returns a Group of instanced meshes, one per (pose, hair) variant.
export function crowd3D(people, cu, { kind = 'floor', pose = kind === 'seated' ? 'seated' : 'stand', detail = 1, castShadow = false, seed = 1, legs = true } = {}) {
  const g = new THREE.Group();
  if (!people.length) return g;
  const rnd = prng(seed);
  const mat = personMaterial(cu, kind);
  const variants = [0, 1, 2, 3].map((hair) => ({ hair, list: [] }));
  for (const p of people) variants[p.hairStyle ?? Math.floor(rnd() * 4)].list.push(p);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(), pos = V3(), Y = V3(0, 1, 0);
  const col = new THREE.Color();
  for (const v of variants) {
    if (!v.list.length) continue;
    const geo = humanGeometry(pose, { hair: v.hair, detail, legs, dress: false });
    const mesh = new THREE.InstancedMesh(geo, mat, v.list.length);
    const look = new Float32Array(v.list.length * 4);
    const hairC = new Float32Array(v.list.length * 3);
    v.list.forEach((p, i) => {
      pos.set(p.x, p.y, p.z);
      s.setScalar(p.h ?? 1);
      q.setFromAxisAngle(Y, p.turn ?? Math.PI);
      m4.compose(pos, q, s);
      mesh.setMatrixAt(i, m4);
      col.setHex(p.top ?? TOPS[Math.floor(rnd() * TOPS.length)]);
      mesh.setColorAt(i, col);
      look[i * 4] = rnd() * 6.283;
      look[i * 4 + 1] = p.raise ?? rnd();
      look[i * 4 + 2] = p.arm ?? (rnd() < 0.4 ? 2 : rnd() < 0.5 ? -1 : 1);
      look[i * 4 + 3] = p.skin ?? rnd();
      col.setHex(p.hair ?? HAIR[Math.floor(rnd() * HAIR.length)]);
      hairC[i * 3] = col.r; hairC[i * 3 + 1] = col.g; hairC[i * 3 + 2] = col.b;
    });
    geo.setAttribute('iLook', new THREE.InstancedBufferAttribute(look, 4));
    geo.setAttribute('iHair', new THREE.InstancedBufferAttribute(hairC, 3));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  return g;
}

// ── billboards for the far stands ──

export function personAtlas() {
  if (TEX.has('atlas')) return TEX.get('atlas');
  // five cells: relaxed, one arm up, both up, phone up, and standing to
  // attention (arms straight down at the sides). R alpha, G rim, B skin.
  const CW = 96, CH = 256, N = 5;
  const c = document.createElement('canvas'); c.width = CW * N; c.height = CH;
  const g = c.getContext('2d');
  const body = (ctx, i, fill) => {
    ctx.save(); ctx.translate(i * CW + CW / 2, 0); ctx.fillStyle = fill; ctx.strokeStyle = fill;
    const base = CH, sh = CH - 118, headY = CH - 150;
    ctx.beginPath();
    ctx.moveTo(-26, base); ctx.lineTo(-30, sh + 16); ctx.quadraticCurveTo(-30, sh, -14, sh - 4);
    ctx.lineTo(14, sh - 4); ctx.quadraticCurveTo(30, sh, 30, sh + 16); ctx.lineTo(26, base); ctx.closePath(); ctx.fill();
    ctx.fillRect(-7, headY + 14, 14, 24);
    ctx.beginPath(); ctx.ellipse(0, headY, 15, 19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineWidth = 12;
    const arm = (x0, x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x0, sh + 6); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    if (i === 0) { arm(-26, -32, sh + 50, -30, sh + 92); arm(26, 32, sh + 50, 30, sh + 92); }
    if (i === 1) { arm(-26, -32, sh + 50, -30, sh + 92); arm(24, 34, sh - 48, 36, sh - 96); }
    if (i === 2) { arm(-24, -34, sh - 46, -38, sh - 94); arm(24, 34, sh - 46, 38, sh - 94); }
    if (i === 3) { arm(-26, -32, sh + 50, -30, sh + 92); arm(24, 30, sh - 40, 20, sh - 82); ctx.fillRect(12, sh - 104, 16, 24); }
    if (i === 4) { arm(-25, -28, sh + 52, -27, sh + 98); arm(25, 28, sh + 52, 27, sh + 98); }
    ctx.restore();
  };
  const alpha = document.createElement('canvas'); alpha.width = c.width; alpha.height = CH;
  const ag = alpha.getContext('2d');
  for (let i = 0; i < N; i++) body(ag, i, '#fff');
  const blur = document.createElement('canvas'); blur.width = c.width; blur.height = CH;
  const bg = blur.getContext('2d');
  // a tight blur, so the rim is a thin edge line even on a raised arm
  bg.filter = 'blur(2.5px)'; bg.drawImage(alpha, 0, 0);
  const A = ag.getImageData(0, 0, c.width, CH).data;
  const B = bg.getImageData(0, 0, c.width, CH).data;
  const out = g.createImageData(c.width, CH);
  for (let i = 0; i < A.length; i += 4) {
    const a = A[i + 3] / 255;
    const inner = B[i + 3] / 255;
    const y = Math.floor(i / 4 / c.width);
    const rim = clamp((1 - inner) * 2.4) * a;
    const skin = y > CH - 172 && y < CH - 128 ? 1 : 0;
    out.data[i] = a * 255; out.data[i + 1] = rim * 255; out.data[i + 2] = skin * a * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.userData.shared = true;
  TEX.set('atlas', t);
  return t;
}

// Phone torches and lightsticks: one point draw, twinkling in the shader.
export function lightPoints(points, cu, { size = 0.06, maxPx = 18, palette = null, sync = false } = {}) {
  const n = points.length;
  const pos = new Float32Array(n * 3), look = new Float32Array(n * 4);
  points.forEach((p, i) => {
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    look[i * 4] = p.phase ?? Math.random() * 6.28; look[i * 4 + 1] = p.hue ?? 0; look[i * 4 + 2] = p.size ?? size; look[i * 4 + 3] = p.white ? 1 : 0;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: cu.uTime, uKick: cu.uKick, uEnergy: cu.uEnergy,
      uScale: { value: 800 }, uMax: { value: maxPx }, uGain: { value: 1 }, uSync: { value: sync ? 1 : 0 },
      uPal: { value: [V3(1, 0.6, 0.3), V3(0.8, 0.4, 1), V3(0.5, 0.7, 1), V3(1, 0.85, 0.55)] },
      tGlow: { value: glowSprite() },
    },
    vertexShader: /* glsl */`
      attribute vec4 aLook;
      uniform float uTime, uKick, uEnergy, uScale, uMax, uSync;
      uniform vec3 uPal[4];
      varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        float tw = 0.65 + 0.35 * sin(uTime * 3.0 + aLook.x);
        // lightsticks under central control run in waves across the house
        float wave = sin(position.x * 0.05 + position.z * 0.03 - uTime * 1.6);
        int k = int(mod(floor(aLook.y + (uSync > 0.5 ? (wave > 0.0 ? 1.0 : 0.0) + floor(uTime * 0.25) : 0.0)), 4.0));
        vec3 c = aLook.w > 0.5 ? vec3(1.0, 0.95, 0.85) : uPal[k];
        float lvl = aLook.w > 0.5 ? tw : (0.55 + 0.45 * uKick * (0.5 + 0.5 * wave)) * (0.6 + 0.4 * uEnergy);
        vC = c * lvl;
        gl_PointSize = clamp(aLook.z * uScale / max(d, 0.1), 1.2, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tGlow; uniform float uGain; varying vec3 vC;
      void main() { float a = texture2D(tGlow, gl_PointCoord).a; gl_FragColor = vec4(vC * a * uGain * 3.0, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  return pts;
}

// ── the big rooms: a still crowd of silhouettes, each holding a light ──
//
// Tens of thousands of people cannot be bodies at sixty frames a second, and
// from FOH they are not bodies anyway: they are heads and shoulders against the
// stage and one light each. So each person is a flat, camera-facing cut-out
// that does not move, and the light is the part that is alive.
// people: [{ x, y, z, h, cell }] — y is what they stand on; cell 0 relaxed,
// 1 one arm up, 2 both up, 3 phone up.
export function silhouettes(people, cu, { seed = 5 } = {}) {
  const n = people.length;
  const geo = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  q.translate(0, 0.5, 0);
  geo.index = q.index;
  geo.setAttribute('position', q.attributes.position);
  geo.setAttribute('uv', q.attributes.uv);
  const P = new Float32Array(n * 4), L = new Float32Array(n * 4);
  const rnd = prng(seed);
  people.forEach((p, i) => {
    P[i * 4] = p.x; P[i * 4 + 1] = p.y; P[i * 4 + 2] = p.z; P[i * 4 + 3] = p.h ?? 1;
    // everyone stands to attention; `cell` still says whose light is held up
    L[i * 4] = 4;
    L[i * 4 + 1] = Math.floor(rnd() * TOPS.length);
    L[i * 4 + 2] = rnd();
    L[i * 4 + 3] = rnd();
  });
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 4));
  geo.setAttribute('iLook', new THREE.InstancedBufferAttribute(L, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uRimColor: cu.uRimColor, uWash: cu.uWash, uAmb: cu.uAmb, uStage: cu.uStage, uRim: cu.uRim,
      tAtlas: { value: personAtlas() }, uTops: { value: TOPS.map((h) => { const c = new THREE.Color(h); return V3(c.r, c.g, c.b); }) },
      fogColor: { value: new THREE.Color(0) }, fogDensity: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec4 iPos; attribute vec4 iLook;
      uniform vec3 uTops[${TOPS.length}];
      uniform vec3 uStage;
      varying vec2 vUv; varying vec3 vTop; varying float vFront; varying float vFog; varying float vSkinT;
      void main() {
        vec3 base = iPos.xyz;
        vec3 toCam = cameraPosition - base; toCam.y = 0.0;
        vec3 fwd = normalize(toCam);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
        float h = 1.72 * iPos.w;
        float w = h * (96.0 / 256.0);
        vec3 p = base + right * (position.x * w) + vec3(0.0, position.y * h, 0.0);
        vUv = vec2((uv.x + iLook.x) / 5.0, uv.y);
        vTop = uTops[int(iLook.y)] * 0.6;
        vec3 facing = normalize(vec3(uStage.x - base.x, 0.0, uStage.z - base.z));
        vFront = dot(facing, fwd);
        vSkinT = iLook.w;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tAtlas; uniform vec3 uRimColor, uWash, uAmb, fogColor; uniform float uRim, fogDensity;
      varying vec2 vUv; varying vec3 vTop; varying float vFront; varying float vFog; varying float vSkinT;
      void main() {
        vec4 a = texture2D(tAtlas, vUv);
        if (a.r < 0.5) discard;
        vec3 skin = mix(vec3(0.5, 0.28, 0.17), vec3(0.12, 0.05, 0.03), vSkinT);
        vec3 base = mix(vTop, skin, a.b * 0.5) * 0.5;
        float front = clamp(vFront * 0.5 + 0.5, 0.0, 1.0);
        // backlit: only the very edge of a head or shoulder catches the stage
        float edge = pow(a.g, 3.0);
        vec3 c = base * (uAmb * 4.0 + uWash * front) + uRimColor * edge * uRim * (1.0 - front) * 0.45;
        float f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog);
        gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// One light per person: a lightstick under central control (the palette,
// running in waves round the house) or a phone's torch, switched from the UI.
export function crowdLights(people, cu, { sync = true, size = 0.07, maxPx = 7 } = {}) {
  const n = people.length;
  const pos = new Float32Array(n * 3), look = new Float32Array(n * 4);
  const rnd = prng(911);
  people.forEach((p, i) => {
    const up = (p.cell ?? 0) > 0;
    const hs = p.h ?? 1;
    pos[i * 3] = p.x + (rnd() - 0.5) * 0.3; pos[i * 3 + 1] = p.y + (up ? 1.95 : 1.3) * hs; pos[i * 3 + 2] = p.z + (rnd() - 0.5) * 0.2;
    look[i * 4] = rnd() * 6.283; look[i * 4 + 1] = Math.floor(rnd() * 4); look[i * 4 + 2] = size * (0.8 + rnd() * 0.4); look[i * 4 + 3] = rnd();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: cu.uTime, uKick: cu.uKick, uEnergy: cu.uEnergy,
      uScale: { value: 800 }, uMax: { value: maxPx }, uGain: { value: 1 }, uSync: { value: sync ? 1 : 0 },
      uMode: { value: 0 }, uHouse: { value: 0 },
      uPal: { value: [V3(1, 0.6, 0.3), V3(0.8, 0.4, 1), V3(0.5, 0.7, 1), V3(1, 0.85, 0.55)] },
      tGlow: { value: glowSprite() },
    },
    vertexShader: /* glsl */`
      attribute vec4 aLook;
      uniform float uTime, uKick, uEnergy, uScale, uMax, uSync, uMode, uHouse;
      uniform vec3 uPal[4];
      varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        float wave = sin(position.x * 0.05 + position.z * 0.035 - uTime * 1.6);
        int k = int(mod(aLook.y + (uSync > 0.5 ? step(0.0, wave) + floor(uTime * 0.25) : 0.0), 4.0));
        vec3 stick = uPal[k] * (0.6 + 0.4 * uKick * (0.5 + 0.5 * wave)) * (0.65 + 0.35 * uEnergy);
        float tw = 0.75 + 0.25 * sin(uTime * 2.3 + aLook.x);
        vec3 flash = vec3(1.0, 0.95, 0.88) * tw * 1.25;
        // most hold a stick; fewer have a phone up at any moment
        float on = uMode > 0.5 ? step(aLook.w, 0.62) : step(aLook.w, 0.93);
        vC = mix(stick, flash, uMode) * on * (1.0 - 0.75 * uHouse);
        float sz = aLook.z * (uMode > 0.5 ? 0.75 : 1.0);
        gl_PointSize = clamp(sz * uScale / max(d, 0.1), 1.3, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tGlow; uniform float uGain; varying vec3 vC;
      void main() { float a = texture2D(tGlow, gl_PointCoord).a; gl_FragColor = vec4(vC * a * uGain * 3.0, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  pts.userData.crowdLights = true;
  return pts;
}

// Fill a crowd list with cells: most relaxed, a share with an arm up.
export function withCells(list, seed = 3) {
  const rnd = prng(seed);
  return list.map((p) => { const r = rnd(); return { ...p, cell: r < 0.58 ? 0 : r < 0.86 ? 1 : r < 0.95 ? 2 : 3 }; });
}
