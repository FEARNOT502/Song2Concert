// ─────────────────────────────────────────────────────────────────────────────
// STADIUM — Wembley: three tiers of red seats, a roof over every seat and none
// over the pitch, the arch standing over the north stand, a London sky. From
// FOH 65 m out on the pitch.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, DEG, KELVIN, V3, floorPanelTex, noise3D, prng, std, velvet, withRepeat } from '../core.js';
import { lightPoints } from '../people.js';
import { ampStack, buildBowl, drapeGeometry, drumKit, guitar, keyboardRig, latticeInto, lineArray, mats, micStand, ribbonBoards, shadowSpot, stageDeck, stageSteps, subStack, wedge } from '../rig.js';
import { bigCrowd, bigScreens, fohPosition, packFloor, runLasers, runShow } from '../show.js';

export function nightSky(u) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: u.uTime, tNoise: { value: noise3D() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      precision highp sampler3D;
      uniform float uTime; uniform sampler3D tNoise; varying vec3 vD;
      void main() {
        float y = vD.y;
        // city glow at the horizon, deep blue overhead
        vec3 horizon = vec3(0.16, 0.085, 0.05);
        vec3 zenith = vec3(0.004, 0.007, 0.02);
        vec3 c = mix(horizon, zenith, smoothstep(-0.02, 0.55, y));
        // low cloud, lit orange from below by the city and the stadium
        vec2 p = vD.xz / max(y + 0.15, 0.05);
        float n = texture(tNoise, vec3(p * 0.06 + vec2(uTime * 0.002, 0.0), 0.3)).r;
        float n2 = texture(tNoise, vec3(p * 0.17 - vec2(0.0, uTime * 0.003), 0.7)).r;
        float cl = smoothstep(0.45, 0.8, n * 0.7 + n2 * 0.45) * smoothstep(0.0, 0.25, y);
        c = mix(c, vec3(0.1, 0.06, 0.05) * (0.6 + 0.8 * n2), cl * 0.85);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10;
  return sky;
}

// The arch: 315 m, 133 m high, leaning 22 degrees north over the north stand.
// A lattice tube, floodlit white.
export function wembleyArch({ x0 = -34, zc = 64, span = 315, height = 133, lean = 22 * DEG }) {
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const s = i / 80;
    const h = height * Math.sin(Math.PI * s) ** 0.9;
    pts.push(V3(x0 - h * Math.sin(lean), h * Math.cos(lean) - 6, zc + (s - 0.5) * span));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 240, 3.7, 16, false);
  const m = std({ color: 0xe8e8ea, roughness: 0.5, metalness: 0.2, emissive: 0x9aa0aa, emissiveIntensity: 0.55, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        // lattice: a diagonal grid of tubes, the rest is air
        vec2 p = vec2(vUv.x * 520.0, vUv.y * 8.0);
        vec2 a = abs(fract(vec2(p.x + p.y, p.x - p.y) * 0.5) - 0.5);
        float bar = min(a.x, a.y);
        float ring = abs(fract(p.x * 0.5) - 0.5);
        if (bar > 0.09 && ring > 0.06) discard;
      }`);
  };
  m.defines = { USE_UV: '' };
  m.customProgramCacheKey = () => 'arch';
  const mesh = new THREE.Mesh(geo, m);
  return mesh;
}

export function buildStadium(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 3.2, ROOF = 50, RIG = 36;
  const eye = V3(0, 1.6 + 1.2, 85);
  const STAGE = V3(0, DECK, 20);
  const HX = 66, HZ = 84, ZC = 64, RC = 30;

  root.add(nightSky(cu));
  const rnd = prng(199);
  const stars = [];
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, e = 0.18 + rnd() * 1.3, r = 850;
    stars.push({ x: Math.cos(a) * Math.cos(e) * r, y: Math.sin(e) * r, z: Math.sin(a) * Math.cos(e) * r + ZC, white: true, size: 1.2 + rnd() * 1.6, phase: rnd() * 6.28 });
  }
  const starField = lightPoints(stars, cu, { maxPx: 2.2 });
  starField.material.uniforms.uGain.value = 0.25;
  starField.material.fog = false;
  root.add(starField);

  // ── pitch, covered for the show ──
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 10, HZ * 2 + 10), std({ ...withRepeat(floorPanelTex({ key: 'pitchcover', tone: 0.07, seed: 57 }), 24, 30), roughness: 0.85 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.02, ZC); pitch.receiveShadow = true; root.add(pitch);

  // ── the bowl: three tiers ──
  const bowl = buildBowl(pipe, {
    hx: HX, hz: HZ, zc: ZC, rc: RC, seatColor: 0x9a1418, concreteTone: 0.26, stage: STAGE, seed: 600, block: 14, aisle: 1.3,
    // the east stand behind the stage is built like the rest but not sold:
    // empty seats round the set, the block straight behind it tarped
    cover: (x, z) => z < 0 && Math.abs(x) < 34,
    occ: (x, z) => (z < 12 ? 0 : 1),
    occupancy: 1,
    tiers: [
      { rows: 26, rise: 0.36, riseFar: 0.46, run: 0.82, yBase: 1.0, inset: 0, crowd: true },
      { rows: 14, rise: 0.5, riseFar: 0.6, run: 0.9, yBase: 14.6, inset: 24, crowd: true, face: 3, backWall: 3 },
      { rows: 30, rise: 0.58, riseFar: 0.72, run: 0.95, yBase: 25.6, inset: 40, crowd: true, face: 3, backWall: 10 },
    ],
  });
  root.add(bowl.group);
  const ribbons = ribbonBoards(bowl, { tiers: [1, 2], height: 1.2, bright: 1.6 });
  root.add(ribbons);
  ctx.addScreen({ userData: { face: ribbons } }, 1, 'ribbon');

  // ── roof: a plate over the seats with the pitch cut out, and its steel ──
  const OX = HX + 76, OZ0 = ZC - HZ - 76, OZ1 = ZC + HZ + 76;
  const plate = new THREE.Shape();
  plate.moveTo(-OX, OZ0); plate.lineTo(OX, OZ0); plate.lineTo(OX, OZ1); plate.lineTo(-OX, OZ1); plate.lineTo(-OX, OZ0);
  const hole = new THREE.Path();
  const ax = HX - RC, az = HZ - RC;
  const holePts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const cx = Math.cos(a) >= 0 ? ax : -ax, cz = Math.sin(a) >= 0 ? az : -az;
    holePts.push(new THREE.Vector2(cx + Math.cos(a) * (RC + 6), ZC + cz + Math.sin(a) * (RC + 6)));
  }
  hole.setFromPoints(holePts);
  plate.holes.push(hole);
  const roofGeo = new THREE.ExtrudeGeometry(plate, { depth: 2.5, bevelEnabled: false, curveSegments: 4 });
  roofGeo.rotateX(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, std({ color: 0x9aa0a8, roughness: 0.7, metalness: 0.3, emissive: 0x0a0c10 }));
  roof.position.y = ROOF + 2.5;
  root.add(roof);
  // cantilever trusses under the plate, radiating in to the opening
  const steel = [];
  const P = bowl.path.pts;
  for (let k = 0; k < P.length; k += 3) {
    const inner = bowl.path.at(P[k], 6), outer = bowl.path.at(P[k], 70);
    if (inner.z < -8 && Math.abs(inner.x) < HX - 5) continue;
    latticeInto(steel, V3(outer.x, ROOF - 2, outer.z), V3(inner.x, ROOF - 0.3, inner.z), 2.2, 0.09);
  }
  const ringParts = [];
  for (let k = 0; k < P.length - 1; k++) {
    const a = bowl.path.at(P[k], 6), b = bowl.path.at(P[k + 1], 6);
    latticeInto(ringParts, V3(a.x, ROOF - 0.6, a.z), V3(b.x, ROOF - 0.6, b.z), 1.4, 0.07);
  }
  root.add(new THREE.Mesh(mergeGeometries(steel.concat(ringParts)), std({ color: 0xc4c8cc, metalness: 0.7, roughness: 0.45, emissive: 0x101216 })));
  // the gantry lights along the roof's inner edge
  const flood = [];
  for (let k = 0; k < P.length; k += 2) {
    const a = bowl.path.at(P[k], 5.5);
    flood.push(pipe.flares.add(V3(a.x, ROOF - 1.2, a.z), KELVIN(5600), 1.8, 0));
  }
  root.add(wembleyArch({}));

  // ── stage: a steel roof on four towers, a wall of LED under it ──
  // a backdrop under the stage roof, only as wide as the set, and wings
  const bv = velvet(0x040404, 'blackvel', { sheenColor: new THREE.Color(0x121212) });
  const drop = new THREE.Mesh(drapeGeometry(70, 33, 44, 0.25), bv);
  drop.position.set(0, DECK + 16.5, 6.2); root.add(drop);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(drapeGeometry(14, 22, 10, 0.2), bv);
    wing.position.set(s * 38.5, DECK + 11, 5.5); wing.rotation.y = -s * 0.2; root.add(wing);
  }
  const deck = stageDeck({ w: 72, d: 26, h: DECK, z: 20 });
  root.add(deck);
  const thrust = stageDeck({ w: 5, d: 22, h: DECK, z: 44, lip: false });
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 36.75, z: 33, h: DECK, dir: [0, -1] }));
  root.add(thrust);
  const towers = [];
  for (const x of [-34, -20, 20, 34]) for (const z of [8, 30]) latticeInto(towers, V3(x, 0, z), V3(x, RIG + 6, z), 1.8, 0.08);
  for (const z of [8, 19, 30]) latticeInto(towers, V3(-36, RIG + 5, z), V3(36, RIG + 5, z), 2.4, 0.09);
  for (const x of [-34, 34]) latticeInto(towers, V3(x, RIG + 5, 8), V3(x, RIG + 5, 30), 2, 0.08);
  root.add(new THREE.Mesh(mergeGeometries(towers), mats().black));
  const scr = bigScreens(ctx, root, { w: 46, y: DECK + 1.6 + 46 / (16 / 9) / 2, z: 8.6, imagW: 22, imagX: 47.5, imagY: 22, imagZ: 29, imagYaw: 0.32, pitch: 0.0078 });
  // no one on stage: the backline and the microphone at the end of the runway
  const star = micStand({ height: 1.6 });
  star.position.set(0, DECK, 53); root.add(star);
  for (const [x, z, col] of [[-14, 21, 0x5a1a0e], [14, 21, 0x1a1a1c]]) {
    const gt = guitar({ color: col, bass: x > 0 }); gt.scale.setScalar(0.8); gt.position.set(x, DECK + 0.5, z); gt.rotation.x = -0.28; root.add(gt);
    const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z + 1.4); m.rotation.y = Math.PI; root.add(m);
    const a = ampStack({ count: 2 }); a.position.set(x * 1.3, DECK, z - 6); root.add(a);
  }
  const keysS = keyboardRig(); keysS.position.set(-6, DECK + 1, 14); root.add(keysS);
  const drumRiser = stageDeck({ w: 8, d: 5, h: 1.0, z: 13.6, lip: false }); drumRiser.position.y = DECK; root.add(drumRiser);
  const kit = drumKit({ shell: 0x0c0c10 }); kit.position.set(0, DECK + 1, 13.6); kit.scale.setScalar(1.2); root.add(kit);
  for (let i = 0; i < 12; i++) { const w = wedge({ w: 0.9 }); w.position.set(-22 + i * 4, DECK, 32.4); w.rotation.y = Math.PI; root.add(w); }
  for (const side of [-1, 1]) for (const dz of [-2.5, 2.5]) { const sub = subStack({ count: 3, cols: 3, w: 1.5 }); sub.position.set(side * 16, 0, 35 + dz); root.add(sub); }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const side of [-1, 1]) {
    const main = lineArray({ boxes: 20, width: 1.5 }); main.position.set(side * 27, RIG + 3, 30); main.rotation.y = -side * 0.05; root.add(main);
    const out = lineArray({ boxes: 16, width: 1.4 }); out.position.set(side * 40, RIG + 2, 26); out.rotation.y = -side * 0.35; root.add(out);
    for (const [dx, dz] of [[36, 60], [44, 104]]) {
      const mast = [];
      latticeInto(mast, V3(side * dx, 0, dz), V3(side * dx, 30, dz), 1.6, 0.07);
      root.add(new THREE.Mesh(mergeGeometries(mast), mats().black));
      const d = lineArray({ boxes: 12, width: 1.4 }); d.position.set(side * dx, 29, dz - 0.9); d.rotation.y = Math.PI * 0 - side * 0.1; d.rotation.y = side * 0.1; root.add(d);
    }
  }
  const spots = [], beams = [], washes = [], ups = [], lasers = [];
  for (let i = 0; i < 16; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-32 + i * (64 / 15), RIG + 3.6, 30), length: 90, angle: 0.08 }), i, n: 16, group: 0 });
  for (let i = 0; i < 16; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-32 + i * (64 / 15), RIG + 3.6, 19), length: 140, beamGain: 1.3 }), i, n: 16, group: 1 });
  for (let i = 0; i < 12; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(-30 + i * (60 / 11), RIG + 3.6, 8), length: 45, beamGain: 0.4 }), i, n: 12, group: 2 });
  for (let i = 0; i < 14; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-33 + i * (66 / 13), DECK + 0.3, 32.6), hang: 'up', length: 220, beamGain: 1.4 }), i, n: 14, group: 3 });
  for (let i = 0; i < 6; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-12 + i * 4.8, DECK + 0.3, 32.8), body: false, length: 200, beamGain: 8, flareGain: 0.2, noise: 0.4 }), i, n: 6 });
  for (const k of [3, 7, 11, 14]) rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5 }), 30000);
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.12, penumbra: 0.7, size: q.shadowSize, far: 200, cast: q.shadows });
  front1.position.set(-10, 34, 96); front1.target.position.set(0, DECK + 1, 20);
  const follow = shadowSpot(KELVIN(5600), 0, { angle: 0.03, penumbra: 0.5, cast: false });
  follow.position.set(0, 40, 140); follow.target.position.set(0, DECK, 52);
  const followBeam = rig.add({ kind: 'follow', pos: V3(0, 40, 140), length: 110, body: false, beamGain: 0.5, color: KELVIN(5600) });
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG + 3, 8); stageWash.target.position.set(0, DECK, 24);
  for (const l of [front1, follow, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-50, 40, 60], [50, 40, 60]]) { const l = new THREE.PointLight(0xffffff, 0, 220, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  // house lights from the roof's leading edge, aimed down into the bowl rather
  // than lighting the underside of the roof they hang from
  for (const [x, z] of [[-70, 20], [70, 20], [-70, 110], [70, 110], [0, -10], [0, 150]]) {
    const l = new THREE.SpotLight(KELVIN(5600), 0, 320, 1.1, 1, 2);
    l.position.set(x, ROOF - 2, z); l.target.position.set(x * 0.7, 0, ZC + (z - ZC) * 0.7);
    root.add(l, l.target); house.push(l);
  }
  root.add(new THREE.HemisphereLight(0x10131e, 0x040406, 0.25));

  // ── people ──
  // the pitch packed from the pit barrier to the far goal, every sold seat taken
  const onPitch = (x, z) => {
    const m = 3.5;
    const dx = Math.max(Math.abs(x) - (HX - RC), 0), dz = Math.max(Math.abs(z - ZC) - (HZ - RC), 0);
    return Math.abs(x) < HX - m && Math.abs(z - ZC) < HZ - m && Math.hypot(dx, dz) < RC - m;
  };
  const avoid = (x, z) => (Math.abs(x) < 3.6 && z < 56.5) || (Math.abs(x - eye.x) < 5 && Math.abs(z - eye.z) < 4.5);
  const standing = packFloor({ x0: -HX + 3, x1: HX - 3, z0: 37, z1: ZC + HZ - 3, avoid, inside: onPitch, seed: 177 });
  bigCrowd(root, cu, q, standing.concat(bowl.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(bowl.aisleLights.map((a) => ({ ...a, white: true, size: 0.05 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.25;
  root.add(aisleField);
  root.add(lightPoints(fohPosition(pipe, root, eye, { riser: 1.2 }), cu, { maxPx: 4 }));

  // ── haze: a stadium is open, so it is thin, but the beams still carry ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  ctx.screenHaze(scr.main, offs.map(([dx, dy]) => hz.add(V3(dx * 23, scr.main.position.y + dy * scr.h * 0.5, 9.5), 0xffffff, 0)), offs);
  scr.main.userData.hazePower = 160;
  const hzWash = [hz.add(V3(-20, RIG + 2, 20), 0xffffff, 0), hz.add(V3(20, RIG + 2, 20), 0xffffff, 0), hz.add(V3(0, DECK + 5, 30), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 13.5, 10), fov: 62, near: 0.2, far: 2000 },
    background: new THREE.Color(0x020306),
    fog: new THREE.FogExp2(0x090708, 0.0019),
    hazeDensity: 0.0005, beamGain: 0.45, hazeAmb: new THREE.Color(0x060405), hazeAmbDist: 400,
    bloom: { strength: 0.7, radius: 0.7, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.38, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.005, 0.01] },
    env: { w: 300, h: 60, d: 320, eye, wall: 0x0a0a10, floor: 0x0a0a0c, ambient: 0x06070c, emitters: [
      { w: 46, h: 26, pos: V3(0, 18, 9), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: 16 / 9 },
      { w: 300, h: 300, pos: V3(0, 58, ZC), normal: V3(0, -1, 0), color: 0x18100c, power: 1 },
    ] },
    envIntensity: 0.5,
    update(f) {
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 80), stage: STAGE, span: 80 });
      runShow(rig, beams, f, { house: V3(0, 40, 120), stage: STAGE, span: 110 });
      runShow(rig, washes, f, { house: V3(0, 0, 36), stage: STAGE, span: 40, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 120, 60), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      runLasers(lasers, f);
      rig.aim(followBeam, V3(star.position.x, DECK + 0.8, star.position.z)); followBeam.intensity = 1.1 * show;
      front1.intensity = 60000 * show + 20000 * f.house;
      follow.intensity = 90000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (26000 + 30000 * f.energy + 12000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (600 + 1600 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 38000 * f.house; });
      flood.forEach((h) => { h.intensity = 0.05 + 0.7 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h) => { h.power = 260 * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 18, 16);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.3 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 10);
    },
  };
}
