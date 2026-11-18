// ─────────────────────────────────────────────────────────────────────────────
// STADIUM — Wembley: three tiers of red seats, a roof over every seat and none
// over the pitch, the arch standing over the north stand, a London sky. From
// FOH 65 m out on the pitch.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, KELVIN, V3, concreteTex, prng, std, floorPanelTex, noise3D, withRepeat } from '../core.js';
import { lightPoints } from '../people.js';
import { holdAtDistance, ledScreen, prismInto, rodInto, truss, wedge } from '../rig.js';

import { concertRoom } from '../concert-production.js';
import { buildStands, decodeSeats } from '../stands.js';
import { WB_STANDS } from './wb-data.js';

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

// The arch: 315 m, its top 133 m above the pitch, leaning 22 degrees north
// over the north stand (so in its own plane it rises further, 133 m over the
// cosine of the lean). A lattice tube, floodlit white. Its feet stand on
// their own bases outside the building, past each end, 50 m north of the
// centre spot; from there it climbs steeply enough to clear the roof
// everywhere it passes over it.
export function archCurve({ x0 = 50, zc = 64, span = 315, height = 133, lean = 22 * DEG, leg = 0.45 } = {}) {
  const rise = (height + 6) / Math.cos(lean);
  // a point on the arch's axis at s (0..1, foot to foot)
  return (s) => {
    const h = rise * Math.sin(Math.PI * s) ** leg;
    return V3(x0 + h * Math.sin(lean), h * Math.cos(lean) - 6, zc + (s - 0.5) * span);
  };
}
export function wembleyArch({ x0 = 50, zc = 64, span = 315 } = {}) {
  const at = archCurve({ x0, zc, span });
  const pts = [];
  for (let i = 0; i <= 120; i++) pts.push(at(i / 120));
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 240, 3.7, 16, false);
  // (floodlit white, but not a glare from inside the bowl: round 41)
  const m = std({ color: 0xc9cbce, roughness: 0.75, metalness: 0.1, emissive: 0x9aa0aa, emissiveIntensity: 0.18, side: THREE.DoubleSide });
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
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m));
  // the concrete bases the hinges sit on
  for (const e of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 14), std({ color: 0x3a3a3e, roughness: 0.9 }));
    base.position.set(x0, 2, zc + e * span / 2); g.add(base);
  }
  return g;
}

// Every seat by its ticket: block, row, seat (wb_labels.py's labels), and
// where it is in the room (x, z with the stage end west, the centre spot at
// z 64; y its tread). `mode` 'general': only the seats sold for an end-stage
// show (in front of the stage's wall), as the stands sell them; '360': all.
const _stadiumCatalogs = new Map();
export const STADIUM_ZC = 64;
export const stadiumSold = (x, z) => z - 8 > Math.max(2, 0.12 * (Math.abs(x) - 31));
export function getStadiumSeatCatalog(mode = 'general') {
  const key = mode === '360' ? '360' : 'general';
  if (_stadiumCatalogs.has(key)) return _stadiumCatalogs.get(key);
  const bNames = WB_STANDS.blockNames || [];
  const byBlock = new Map(), levelOf = new Map();
  for (const L of WB_STANDS.levels) {
    if (!L.labels) continue;
    const S = decodeSeats(L.seats), sk = L.seatScale ?? 10, LB = decodeSeats(L.labels);
    for (let i = 0; i < S.length; i += 4) {
      const x = S[i] / sk, z = S[i + 1] / sk + STADIUM_ZC, rIdx = S[i + 2], yaw = S[i + 3] * DEG;
      if (key === 'general' && !stadiumSold(x, z)) continue;
      const y = L.hs ? L.hs[Math.min(rIdx, L.hs.length - 1)] : L.h0 + L.rise * rIdx;
      const lk = (i >> 2) * 3, block = bNames[LB[lk]] ?? L.name, row = LB[lk + 1], num = LB[lk + 2];
      let rm = byBlock.get(block);
      if (!rm) { rm = new Map(); byBlock.set(block, rm); levelOf.set(block, L.name); }
      let nm = rm.get(row);
      if (!nm) { nm = new Map(); rm.set(row, nm); }
      nm.set(num, { x, y, z, yaw, block, row, num, level: L.name });
    }
  }
  const blocks = [...byBlock.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const getRows = (block) => { const rm = byBlock.get(block); return rm ? [...rm.keys()].sort((a, b) => a - b) : []; };
  const getNums = (block, row) => { const nm = byBlock.get(block)?.get(Number(row)); return nm ? [...nm.keys()].sort((a, b) => a - b) : []; };
  const getSeat = (block, row, num) => byBlock.get(block)?.get(Number(row))?.get(Number(num)) || null;
  const cat = { blocks, byBlock, levelOf, getRows, getNums, getSeat };
  _stadiumCatalogs.set(key, cat);
  return cat;
}

export function buildStadium(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 3.2, ROOF = 52;
  // FOH, and the listener there: at the back of the pitch's crowd
  const eye = V3(0, 1.6 + 1.2, 126);
  // the centre spot, on the long axis; the stage end is west (-z), north is +x
  const ZC = 64;
  // (round, the stage on the centre spot)
  const round = ctx.mode === '360';
  const STAGE = round ? V3(0, DECK, ZC) : V3(0, DECK, 20);
  const OFF = V3(0, 0, ZC);
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

  // ── the bowl, by the seating plan ──
  // Three tiers all the way round, as the detailed plan draws them: Level 1
  // (blocks 101-144, 44 rows, a walkway behind row 28 with the tunnels up
  // from the Level 1 concourse, the players' tunnel and the four corner
  // tunnels cut into its front: an open cut walled either side to a portal
  // under the rows, as wide and as deep as the plan leaves each corner
  // unseated), the Club Wembley tier (201-252, entered
  // through the doors at the back from the club concourse and the boxes) and
  // Level 5 (501-552, up to 45 rows down the sides, 24 at the ends where the
  // two big screens stand in bays in its front, tunnels a third of the way
  // up). Sold out as a concert sells it: every seat that can see the face of
  // the wall, the restricted-view ones beside the stage included; the stand
  // behind it and the corners behind the wall's line are not sold.
  // The end screens (Daktronics, 2013: 23.88 m by 8.15 m). Each stands in a
  // notch cut through Level 5's front, as the photographs from the pitch show
  // it: the board right behind Level 2's last row, its foot just over that
  // row, in the plane of the box level's glass, set back behind the blocks
  // either side (Level 5 stands out over Level 2's back rows, so their
  // undersides show beside it); Level 5's fascia runs on in the board's
  // plane to its edges, its top under the first
  // full row behind the notch (so those rows see over it), and the blocks'
  // rows either side end along the notch's slanting sides, stepping down to
  // the tier's front, no wall between them and the board.
  const SCREEN_W = 23.88, SCREEN_H = 8.15;
  const screenBays = WB_STANDS.bays.filter((b) => b.kind === 'screen').map((b) => {
    const f = b.front, mid = f[Math.floor(f.length / 2)];
    const [a0, a1] = b.mouth;
    const tx = a1[0] - a0[0], tz = a1[1] - a0[1], tl = Math.hypot(tx, tz);
    let nx = -tz / tl, nz = tx / tl;
    if (nx * (0 - mid[0]) + nz * (0 - mid[1]) < 0) { nx = -nx; nz = -nz; }
    const cx = (a0[0] + a1[0]) / 2, cz = (a0[1] + a1[1]) / 2, ux = tx / tl, uz = tz / tl;
    const T = ([x, z]) => (x - cx) * ux + (z - cz) * uz, D = ([x, z]) => -((x - cx) * nx + (z - cz) * nz);
    const Sf = Math.max(...f.map(D)) + 0.3;                             // the screen's face
    const side = (sg) => Math.max(...b.ring.filter((p) => sg * T(p) > 0 && Math.abs(D(p) - Sf) < 0.6).map((p) => sg * T(p))) - 0.1;
    const wl = side(-1), wr = side(1), Db = Math.max(...b.ring.map(D)) + 0.1;
    return { b, nx, nz, cx, cz, ux, uz, T, D, Sf, wl, wr, Db, yaw: Math.atan2(nx, nz) };
  });
  // The finishes, off the photographs in daylight (geograph 2952295, 8222730):
  // the precast concrete a pale warm grey, the aisles' steps the same a shade
  // darker and warmer (worn, their nosings), the boxes' glass dark and the
  // balustrades in front of them glass. (round 41: the concrete was a dark grey)
  const aisleConc = withRepeat(concreteTex({ key: 'wbaisle', tone: 0.42, warm: 0.05, seed: 37 }), 1 / 2, 1 / 2);
  const wallConc = withRepeat(concreteTex({ key: 'wbwall', tone: 0.56, warm: 0.03, seed: 43 }), 1 / 3, 1 / 3);
  const floorConc = withRepeat(concreteTex({ key: 'wbtread', tone: 0.44, warm: 0.03, seed: 47 }), 1 / 3, 1 / 3);
  // (matt: precast concrete has no sheen; without the texture's roughness map,
  // which took it down to 0.8, and with little of the sky's reflection, the
  // treads no longer glare where the show's light falls on them)
  const matt = (set, color) => std({ ...set, roughnessMap: null, color, roughness: 1, metalness: 0, envMapIntensity: 0.25 });
  const boxGlass = std({ color: 0x10141a, roughness: 0.12, metalness: 0.65, side: THREE.DoubleSide });
  const balGlass = new THREE.MeshPhysicalMaterial({ color: 0xa8bcc8, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const stands = buildStands(WB_STANDS, {
    // (the lightsticks' blocks by the stands' own aisles, not the seats'
    // labelled blocks: Level 1's real blocks meet between two seats)
    byAisle: true, aisleFirst: ['L1', 'L2', 'L5'],     // (the boxes' balconies, with no aisle, box by box)
    // (one wedge across every level, cut where Level 1's aisles run, drawn on
    // straight through the tiers over it: a seat goes by the wedge it is in,
    // whatever its level, its own level's blocks not kept whole)
    sectors: ['L1'],
    // (the lines: Level 1's aisles' middle lines, straight, as wb_labels.py
    // fits them (WB_STANDS.sectorLines); every seat of every level, the
    // boxes' balconies and the Royal Box too, by the wedge between two of
    // them it is in, its own level's blocks not kept whole)
    sectorWhole: 0, sectorSplitEnds: true, sectorSplitWide: 1.6, round,
    // (a thin wedge, the corner tunnel's between its walls or beside one, run in with the thinner beside it)
    sectorMin: 0.4,
    offset: OFF, stage: STAGE, seatColor: 0x9a1418, concreteTone: 0.58, concreteWarm: 0.03, seed: 600, roofY: ROOF,
    // Club Wembley's padded seats (Level 2) a deeper red, the boxes' balcony
    // seats (Levels 3 and 4) claret, the Royal Box (Level 2's middle on the
    // north side, blocks 252 and 201: data x over 70, |z| under 11.5) darker
    seatColors: { L2: 0x8a1018, L3: 0x5e0d15, L4: 0x5e0d15 },
    seatColorAt: (name, x, z) => (name === 'L2' && x > 70 && Math.abs(z) < 11.5 ? 0x4a0a10 : null),
    materials: {
      struct: matt(floorConc, 0xffffff),
      step: matt(aisleConc, 0xffffff),
      wall: Object.assign(matt(wallConc, 0x9c9890), { side: THREE.DoubleSide }),   // (the walls stand in the tiers' shade: Level 1's back wall under Level 2)
      levelWall: { L3: boxGlass, L4: boxGlass },
      levelRail: { L3: balGlass, L4: balGlass },
      partition: balGlass,
    },
    // the lightsticks' blocks: each level's numbered blocks, run front to
    // back between the aisles, round the bowl from its middle
    wedges: { x: 0, z: 0 },
    // (round, every seat; else those in front of the wall: face z 8, 62 m wide)
    sold: round ? () => true : stadiumSold,
  });
  root.add(stands.group);
  const ring = (poly) => poly[0].map(([x, z]) => ({ x, z: z + ZC }));
  const field = ring(WB_STANDS.field[0]);
  const outerRing = ring(WB_STANDS.outer[0]);
  const roofIn = ring(WB_STANDS.roofIn[0]);

  // ── the pitch inside the Level 1 front, covered for the show ──
  const pitchShape = new THREE.Shape(field.map((p) => new THREE.Vector2(p.x, -p.z)));
  const pitchGeo = new THREE.ShapeGeometry(pitchShape, 1); pitchGeo.rotateX(-Math.PI / 2);
  const pitch = new THREE.Mesh(pitchGeo, std({ ...withRepeat(floorPanelTex({ key: 'pitchcover', tone: 0.07, seed: 57 }), 20, 28), roughness: 0.85 }));
  pitch.position.y = 0.02; pitch.receiveShadow = true; root.add(pitch);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(700, 48), std({ color: 0x0b0b0c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, ZC); ground.userData.noCollide = true;
  root.add(ground);

  // ── the bays in Level 5's front ──
  // At either end a bay holds a big screen (`screenBays` above: set into the
  // tier, filling its notch side to side, not a box standing out). On the
  // south side a bay holds the TV gantry (Level 4):
  // an open platform level with the tier's front row, a glass balustrade
  // along its front, the cameras along it, the commentary desks along its
  // back, under a light canopy.
  const housingMat = std({ color: 0x2a2c30, roughness: 0.7, metalness: 0.3 });
  const cladMat = std({ color: 0x74777c, roughness: 0.75, metalness: 0.2 });
  const soffitMat = matt(wallConc, 0xffffff);   // the notch's sides: the stand's own concrete
  const panelMat = matt(wallConc, 0xe4e2de);       // the panelled wall set back in the notch, beside the board
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb2bf, roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const steelDark = std({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.5 });
  const L5h0 = WB_STANDS.levels.find((l) => l.name === 'L5').h0;
  const extrude = (ring, y0, y1, mat) => {
    const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, z + ZC)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.position.y = y1; root.add(m); return m;
  };
  // a wall along a polyline (x, z), from y0 to y1
  const strip = (P, y0, y1, out, off = 0) => {
    for (let i = 0; i + 1 < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], l = Math.hypot(bx - ax, bz - az);
      if (l < 1e-3) continue;
      const g = new THREE.PlaneGeometry(l, y1 - y0);
      g.rotateY(Math.atan2(-(bz - az), bx - ax)); g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2 + ZC); out.push(g);
    }
  };
  for (const b of WB_STANDS.bays) {
    const screen = b.kind === 'screen';
    const f = b.front, mid = f[Math.floor(f.length / 2)];
    const [a0, a1] = b.mouth;
    const tx = a1[0] - a0[0], tz = a1[1] - a0[1], tl = Math.hypot(tx, tz);
    let nx = -tz / tl, nz = tx / tl;
    if (nx * (0 - mid[0]) + nz * (0 - mid[1]) < 0) { nx = -nx; nz = -nz; }
    const yaw = Math.atan2(nx, nz);
    if (screen) {
      const q = screenBays.find((g) => g.b === b);
      const at = (t, d) => [q.cx + q.ux * t - q.nx * d, q.cz + q.uz * t - q.nz * d];
      const L5 = WB_STANDS.levels.find((l) => l.name === 'L5'), L2top = Math.max(...WB_STANDS.levels.find((l) => l.name === 'L2').rows.map((r) => r.y));   // (Level 2's last row's tread)
      const hw = SCREEN_W / 2 + 0.3;
      // The board stands right behind Level 2's last row (`board`: its plane,
      // from the mouth, given by the generator, which leaves the box level's
      // wall out in front of it), its foot half a metre over that row's
      // tread: as the photographs from the pitch show it, the last rows of
      // the 2xx blocks under it with nothing between.
      const Sb = b.board;
      // its top under the eyes of the first row that runs on unbroken
      // behind the notch (so those rows see over it)
      const kBack = Math.ceil((q.Db - Math.max(...b.front.map(q.D))) / L5.D);
      const foot = L2top + 0.5, top = foot + SCREEN_H;
      if (top > L5.hs[Math.min(kBack, L5.hs.length - 1)] + 0.6) console.warn('wembley screen: top over the eyes of the rows behind', top, L5.hs[kBack]);
      // the notch behind it, under the rows behind
      extrude([at(-q.wl, Sb), at(q.wr, Sb), at(q.wr, q.Db), at(-q.wl, q.Db)], L2top, L5.h0 - 0.3, housingMat);
      // Either side of the board, in its plane: the box level's glass from
      // Level 2's back up to Level 5's front, Level 5's fascia carried on
      // across the notch to the board's edges at the height of the tier's
      // front, and over it a wall whose top runs down from the board's top
      // corner along the ends of the rows over it (the side blocks' rows end
      // on it, nothing stands up between them and the board).
      // (the notch's own outline: its ring is that, then the front across its mouth)
      const sides = b.ring.slice(0, b.ring.length - f.length + 2);
      const rowAt = (sg, t) => {
        const ds = sides.filter((p) => sg * q.T(p) > 0 && q.D(p) > Sb && sg * q.T(p) <= t).map(q.D);
        const d = ds.length ? Math.min(...ds) : Sb;
        const k = Math.max(0, Math.ceil((d - q.Sf + 0.3) / L5.D));
        return Math.min(top + 0.3, Math.max(L5.h0, L5.hs[Math.min(k, L5.hs.length - 1)] - 0.15));
      };
      const sideW = (sg) => Math.max(hw, ...sides.filter((p) => sg * q.T(p) > 0 && Math.abs(q.D(p) - Sb) < 0.8).map((p) => sg * q.T(p) + 0.4));
      // (where the rows behind come down to the board's top, out to the
      // ends of those rows, the board's dark housing makes up the width)
      const prof = (sg, w) => {
        const pts = []; let h = L5.h0, t = w;
        for (; t > hw && h < top + 0.3; t -= 0.25) { h = Math.max(h, rowAt(sg, t)); pts.push([sg * t, h]); }
        return { pts, wb: Math.max(hw, t + 0.25) };
      };
      const wR = sideW(1), wL = sideW(-1);
      const pr = prof(1, wR), pl = prof(-1, wL);
      const sgn = Math.sign(q.ux * Math.cos(q.yaw) - q.uz * Math.sin(q.yaw)) || 1;
      const inPlane = (pts, mat, d0 = 0, depth = 1.2) => {
        const m = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([t, y]) => new THREE.Vector2(sgn * t, y))), { depth, bevelEnabled: false }), mat);
        const [wx, wz] = at(0, Sb + d0 + depth);
        m.position.set(wx, 0, wz + ZC); m.rotation.y = q.yaw; root.add(m); return m;
      };
      // (round 41, off the photograph of the board from the pitch, geograph
      // 2952295: either side of the board the flanking blocks' rows end on
      // their own side faces, pale concrete, a diagonal from Level 5's fascia
      // up to the board's top corner; under that diagonal a pale panelled wall
      // set back in the notch, with a railed ledge at the board's foot; Level
      // 5's fascia and the boxes' glass stop where the notch begins, and the
      // board has only a thin frame of its own, no dark housing beside it)
      for (const [sg, w, P] of [[1, wR, pr], [-1, wL, pl]]) {
        const up = P.pts.filter(([, y]) => y > L5.h0 - 1.5 + 0.02);
        inPlane([[sg * hw, L2top], [sg * w, L2top], ...up, [sg * hw, top + 0.3]], panelMat, 1.4, 0.6);
        // the ledge at the board's foot, a rail along it
        inPlane([[sg * hw, L2top], [sg * Math.min(w, hw + 6), L2top], [sg * Math.min(w, hw + 6), L2top + 0.25], [sg * hw, L2top + 0.25]], soffitMat, 0, 1.4);
        const [rx0, rz0] = at(sg * hw, Sb + 0.1), [rx1, rz1] = at(sg * Math.min(w, hw + 6), Sb + 0.1);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(rx1 - rx0, rz1 - rz0), 0.05, 0.05), steelDark);
        rail.position.set((rx0 + rx1) / 2, L2top + 1.25, (rz0 + rz1) / 2 + ZC); rail.rotation.y = Math.atan2(-(rz1 - rz0), rx1 - rx0); root.add(rail);
      }
      // the board's own frame behind it, as wide as it is, back to the rows behind
      extrude([at(-hw, Sb), at(hw, Sb), at(hw, q.Db), at(-hw, q.Db)], L2top, top + 0.3, housingMat);
      const [sx, sz] = at(0, Sb - 0.1);
      // the board behind the stage is switched off for a concert: its face
      // dark, the set's own wall in front of it does the showing
      if (sz + ZC < 0) {
        const off = new THREE.Group();
        const face = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), std({ color: 0x050506, roughness: 0.35, metalness: 0.2 }));
        face.position.z = 0.06;
        const back = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.5, SCREEN_H + 0.5, 0.12), housingMat);
        back.position.z = -0.02;
        off.add(face, back);
        off.position.set(sx, foot + SCREEN_H / 2, sz + ZC); off.rotation.y = q.yaw;
        root.add(off);
        continue;
      }
      const scr = ledScreen({ w: SCREEN_W, h: SCREEN_H, tex: ctx.art.texture(SCREEN_W / SCREEN_H), pitch: 0.012, bright: 1.3, kind: 'main', frame: 0.25, light: false });
      for (const c of scr.children) if (c.material && c.material === scr.userData.bezel) c.visible = false;   // a plain black frame, as the real boards
      scr.position.set(sx, foot + SCREEN_H / 2, sz + ZC); scr.rotation.y = q.yaw;
      root.add(scr); ctx.addScreen(scr, SCREEN_W / SCREEN_H, 'main');
      continue;
    }
    // the gantry
    const deckY = L5h0, top = b.y1 + 0.05;
    const nA = b.ring.length - f.length + 2, A = b.ring.slice(0, nA);
    extrude(b.ring, b.y0, deckY, housingMat);                     // under it, the tier's front carried across
    extrude(b.ring, top - 0.3, top, housingMat);                  // the canopy
    const back = [], rail = [], glassG = [];
    strip(A, deckY, top - 0.3, back);
    strip(f, deckY, deckY + 1.1, glassG);
    for (let i = 0; i + 1 < f.length; i++) {
      const [ax, az] = f[i], [bx, bz] = f[i + 1];
      const d = V3(bx - ax, 0, bz - az), l = d.length();
      const h = new THREE.BoxGeometry(0.08, 0.08, l); h.rotateY(Math.atan2(d.x, d.z)); h.translate((ax + bx) / 2, deckY + 1.12, (az + bz) / 2 + ZC); rail.push(h.toNonIndexed());
    }
    root.add(new THREE.Mesh(mergeGeometries(back.map((g) => g.toNonIndexed())), std({ color: 0x2a2b30, roughness: 0.8, emissive: 0x3a3226, emissiveIntensity: 1, side: THREE.DoubleSide })));   // lit by the gantry's own lights
    root.add(new THREE.Mesh(mergeGeometries(glassG.map((g) => g.toNonIndexed())), glassMat));
    root.add(new THREE.Mesh(mergeGeometries(rail), steelDark));
    // lights under the canopy
    const lamps = [];
    for (let i = 0; i < f.length; i += 3) {
      const [x, z] = f[i], r = Math.hypot(x, z) || 1, off = 2.2;
      const lg = new THREE.BoxGeometry(2.4, 0.04, 0.3); lg.rotateY(Math.atan2(x, z)); lg.translate(x + (x / r) * off, top - 0.33, z + ZC + (z / r) * off); lamps.push(lg.toNonIndexed());
    }
    root.add(new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshBasicMaterial({ color: 0xfff1d8 })));
    // the commentary desks along the back, and the cameras along the front
    const desks = [], cams = [], legs = [];
    for (let i = 0; i + 1 < A.length; i++) {
      const [ax, az] = A[i], [bx, bz] = A[i + 1], l = Math.hypot(bx - ax, bz - az);
      if (l < 0.2) continue;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, r = Math.hypot(cx, cz) || 1;
      const dg = new THREE.BoxGeometry(0.7, 0.06, l); dg.rotateY(Math.atan2(bx - ax, bz - az));
      dg.translate(cx - (cx / r) * 0.5, deckY + 0.74, cz + ZC - (cz / r) * 0.5); desks.push(dg.toNonIndexed());
    }
    let run = 0;
    for (let i = 0; i + 1 < f.length; i++) {
      const [ax, az] = f[i], [bx, bz] = f[i + 1], l = Math.hypot(bx - ax, bz - az);
      run += l;
      if (run < 3.5) continue;
      run = 0;
      const r = Math.hypot(bx, bz) || 1, x = bx + (bx / r) * 1.3, z = bz + (bz / r) * 1.3;
      const body = new THREE.BoxGeometry(0.34, 0.36, 0.7); body.rotateY(Math.atan2(-bx, -bz)); body.translate(x, deckY + 1.55, z + ZC); cams.push(body.toNonIndexed());
      const lens = new THREE.CylinderGeometry(0.1, 0.12, 0.5, 10); lens.rotateX(Math.PI / 2); lens.rotateY(Math.atan2(-bx, -bz));
      lens.translate(x - (bx / r) * 0.55, deckY + 1.58, z + ZC - (bz / r) * 0.55); cams.push(lens.toNonIndexed());
      const post = new THREE.CylinderGeometry(0.06, 0.1, 1.35, 8); post.translate(x, deckY + 0.68, z + ZC); legs.push(post.toNonIndexed());
    }
    root.add(new THREE.Mesh(mergeGeometries(desks), std({ color: 0x2e3036, roughness: 0.6, emissive: 0x1c2430, emissiveIntensity: 1 })));
    if (cams.length) root.add(new THREE.Mesh(mergeGeometries(cams), std({ color: 0x0c0d10, roughness: 0.4, metalness: 0.4 })));
    if (legs.length) root.add(new THREE.Mesh(mergeGeometries(legs), steelDark));
  }

  // ── the roof, as it is built ──
  // Over every seat, open over the pitch. Its steel is white: parallel
  // rafters running north-south every 15.5 m, each an underslung beam (a
  // top chord under the roof, V-shaped legs down to a cable), a prismatic
  // truss round its perimeter above the back of the top tier, a box girder
  // along the north roof's leading edge hung from the arch by forestay
  // cables on pyramid struts, backstays from the arch to the perimeter
  // truss behind it, and the floodlight gantry round the opening. The south
  // roof's leading edge is a bowstring truss hung between four primary
  // trusses that run from the south perimeter to the north roof's leading
  // edge; along the southern edge of the north roof the cladding is
  // translucent, 25 m wide (Kayvani, Structural Design of the Arch and Roof
  // of Wembley Stadium). The cladding rises to 52 m above the pitch.
  const BAND = 25;
  const northEdge = (p) => p.x > 30;
  // the opening, and the translucent band beside it: one hole in the cladding
  const holeRing = roofIn.map((p) => (northEdge(p) ? { x: p.x + BAND, z: p.z } : p));
  const plate = new THREE.Shape(outerRing.map((p) => new THREE.Vector2(p.x, p.z)));
  plate.holes.push(new THREE.Path(holeRing.map((p) => new THREE.Vector2(p.x, p.z))));
  const roofGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.3, bevelEnabled: false, curveSegments: 1 });
  roofGeo.rotateX(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, std({ color: 0x5e6268, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide }));
  roof.position.y = ROOF;
  root.add(roof);
  {
    const run = roofIn.filter(northEdge).sort((a, b) => a.z - b.z);
    const pos = [], idx = [];
    run.forEach((p, i) => {
      pos.push(p.x, ROOF - 0.15, p.z, p.x + BAND, ROOF - 0.15, p.z);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const band = new THREE.Mesh(g, std({ color: 0xa9adb3, roughness: 0.9, emissive: 0x1c1d20, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    root.add(band);
  }
  const inRing = (poly) => (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const inOuter = inRing(outerRing), inOpen = inRing(roofIn);
  const steel = [], cables = [];
  const TOP = ROOF - 0.35;
  // the rafters, and the purlins' lines across them
  for (let k = -11; k <= 11; k++) {
    const z = ZC + k * 15.5;
    const runs = []; let a = null;
    for (let x = -170; x <= 170; x += 0.25) {
      const on = inOuter(x, z) && !inOpen(x, z);
      if (on && a === null) a = x;
      if (!on && a !== null) { runs.push([a, x - 0.25]); a = null; }
    }
    if (a !== null) runs.push([a, 170]);
    for (const [xa0, xb0] of runs) {
      const xa = xa0 + 0.6, xb = xb0 - 0.6, L = xb - xa;
      if (L < 8) continue;
      // the top chord: a fabricated beam just under the cladding
      const beam = new THREE.BoxGeometry(L, 0.9, 0.45); beam.translate((xa + xb) / 2, TOP - 0.45, z); steel.push(beam.toNonIndexed());
      const spans = Math.max(1, Math.round(L / 48));
      for (let sp = 0; sp < spans; sp++) {
        const s0 = xa + (L * sp) / spans, s1 = xa + (L * (sp + 1)) / spans, l = s1 - s0;
        const depth = Math.min(5.5, 1.4 + l * 0.085);
        const nv = Math.max(2, Math.round(l / 7));
        const node = (j) => { const t = (j + 0.5) / nv; return V3(s0 + t * l, TOP - 0.9 - depth * Math.sin(Math.PI * t) ** 0.8, z); };
        let prev = V3(s0, TOP - 0.9, z);
        for (let j = 0; j < nv; j++) {
          const n = node(j), half = Math.min(1.6, l / nv * 0.3);
          // the vee: two legs from the top chord to a node on the cable
          rodInto(steel, V3(n.x - half, TOP - 0.9, z), n, 0.2, 0.09);
          rodInto(steel, V3(n.x + half, TOP - 0.9, z), n, 0.2, 0.09);
          rodInto(cables, prev, n, 0.07);
          prev = n;
        }
        rodInto(cables, prev, V3(s1, TOP - 0.9, z), 0.07);
      }
    }
  }
  // the perimeter truss, over the back of the top tier
  const back = [];
  for (let k = 0; k < outerRing.length; k += Math.max(1, Math.round(outerRing.length / 110))) back.push(outerRing[k]);
  const inward = (p, d) => { const r = Math.hypot(p.x, p.z - ZC) || 1; return V3(p.x - (p.x / r) * d, 0, p.z - ((p.z - ZC) / r) * d); };
  for (let k = 0; k < back.length; k++) {
    const a = inward(back[k], 3.5), b = inward(back[(k + 1) % back.length], 3.5);
    prismInto(steel, V3(a.x, TOP - 0.2, a.z), V3(b.x, TOP - 0.2, b.z), 3.2, 4.2, 0.16);
  }
  // round the opening: the leading edge — a box girder on the north side,
  // a truss elsewhere — with the floodlight gantry under it
  const edge = [];
  for (let k = 0; k < roofIn.length; k += Math.max(1, Math.round(roofIn.length / 140))) edge.push(roofIn[k]);
  const leb = [];
  for (let k = 0; k < edge.length; k++) {
    const a = edge[k], b = edge[(k + 1) % edge.length];
    const north = a.x > 44 && b.x > 44;
    if (north) {
      const d = Math.hypot(b.x - a.x, b.z - a.z), g = new THREE.BoxGeometry(2.6, 3.0, d + 0.05);
      g.rotateY(Math.atan2(b.x - a.x, b.z - a.z)); g.translate((a.x + b.x) / 2, TOP - 1.5, (a.z + b.z) / 2); steel.push(g.toNonIndexed());
      leb.push(a);
    } else prismInto(steel, V3(a.x, TOP - 0.3, a.z), V3(b.x, TOP - 0.3, b.z), 2.4, 2.6, 0.12);
  }
  // the pyramid struts on the north roof's leading edge, and the forestays
  // from them up to the arch, crossing as a Warren truss
  const arch = archCurve({ zc: ZC });
  const archAtZ = (z) => { let s0 = 0, s1 = 1; for (let i = 0; i < 30; i++) { const m = (s0 + s1) / 2; if (arch(m).z < z) s0 = m; else s1 = m; } return arch((s0 + s1) / 2); };
  leb.sort((p, q) => p.z - q.z);
  const apexes = [];
  if (leb.length > 2) {
    const z0 = leb[0].z, z1 = leb[leb.length - 1].z, n = Math.max(2, Math.round((z1 - z0) / 21));
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      let p = leb[0]; for (const q of leb) if (Math.abs(q.z - z) < Math.abs(p.z - z)) p = q;
      const apex = V3(p.x + 2.5, ROOF + 7.5, p.z);
      for (const [dx, dz] of [[-0.8, -3.5], [-0.8, 3.5], [5.5, -3.5], [5.5, 3.5]]) rodInto(steel, V3(p.x + dx, ROOF, p.z + dz), apex, 0.28, 0.18);
      apexes.push(apex);
    }
    for (const ap of apexes) for (const dz of [-24, 24]) {
      const q = archAtZ(ap.z + dz);
      if (q.y > ap.y + 10) rodInto(cables, ap, q, 0.09, 0.09, 4);
    }
  }
  // the backstays, from the arch down to the perimeter truss behind it
  const northBack = back.filter((p) => p.x > 60);
  for (let i = 0; i <= 16; i++) {
    const q = arch(0.2 + (0.6 * i) / 16);
    for (const dz of [-18, 18]) {
      let p = null, bd = Infinity;
      for (const c of northBack) { const d = Math.abs(c.z - (q.z + dz)); if (d < bd) { bd = d; p = c; } }
      if (p && bd < 8) { const b = inward(p, 3.5); rodInto(cables, q, V3(b.x, TOP + 0.3, b.z), 0.09, 0.09, 4); }
    }
  }
  // The south roof's leading edge: an east-west bowstring truss, curved in
  // plan along the opening, five spans between the perimeter truss at either
  // end and the four primary trusses; the central span 140 m long and 15 m
  // deep, a cable bottom chord sagging under a steel top chord, the services
  // gantry along it.
  const southX = (() => {
    // the opening's south edge, eased into one curve and run on east and
    // west over the roof to the perimeter truss
    const pts = roofIn.filter((p) => p.x < -20 && Math.abs(p.z - ZC) < 62);
    let c = 0, x0 = 0;
    { let sxx = 0, sx = 0, sy = 0, sxy = 0; for (const p of pts) { const u = (p.z - ZC) ** 2; sxx += u * u; sx += u; sy += p.x; sxy += u * p.x; } const n = pts.length; c = (n * sxy - sx * sy) / (n * sxx - sx * sx); x0 = (sy - c * sx) / n; }
    return (z) => x0 + c * (z - ZC) ** 2;
  })();
  const PT = [-102, -70, 70, 102];            // the primary trusses, east-west from the centre spot
  // the south perimeter truss's line at z
  const southPerim = (z) => { for (let x = southX(z); x > -200; x -= 0.5) if (!inOuter(x, z)) return x + 3.5; return -130; };
  // the ends of the bowstring: where its curve meets the perimeter truss
  const endZ = (sd) => { for (let d = 74; d < 170; d += 0.5) { const z = ZC + sd * d; if (!inOuter(southX(z), z + sd * 3.5)) return d; } return 150; };
  const ends = [-endZ(-1), endZ(1)];
  const supports = [ends[0], ...PT, ends[1]];
  const chordY = TOP - 0.6;
  const bow = [];                              // the bottom chord, sampled
  for (let k = 0; k + 1 < supports.length; k++) {
    const a = supports[k], b = supports[k + 1], span = b - a, depth = 15 * span / 140;
    const n = Math.max(3, Math.round(span / 7));
    for (let i = 0; i <= n; i++) {
      if (k && !i) continue;
      const t = i / n, z = ZC + a + span * t;
      bow.push({ z, top: V3(southX(z), chordY, z), bot: V3(southX(z), chordY - 1.2 - depth * 4 * t * (1 - t), z) });
    }
  }
  for (let i = 0; i + 1 < bow.length; i++) {
    const p = bow[i], q = bow[i + 1];
    // the top chord: a box girder; the bottom chord: twin cables
    const d = p.top.distanceTo(q.top), g = new THREE.BoxGeometry(1.6, 1.2, d + 0.05);
    g.rotateY(Math.atan2(q.top.x - p.top.x, q.top.z - p.top.z)); g.translate((p.top.x + q.top.x) / 2, chordY, (p.top.z + q.top.z) / 2); steel.push(g.toNonIndexed());
    for (const dx of [-0.6, 0.6]) rodInto(cables, V3(p.bot.x + dx, p.bot.y, p.bot.z), V3(q.bot.x + dx, q.bot.y, q.bot.z), 0.11, 0.11, 5);
    // the struts down to it, and crossed diagonals between
    rodInto(steel, p.top, p.bot, 0.18, 0.14);
    rodInto(cables, p.top, q.bot, 0.05, 0.05, 4); rodInto(cables, q.top, p.bot, 0.05, 0.05, 4);
  }
  if (bow.length) rodInto(steel, bow[bow.length - 1].top, bow[bow.length - 1].bot, 0.18, 0.14);
  // the services gantry, a walkway along the central span inside the truss
  for (let i = 0; i + 1 < bow.length; i++) {
    const p = bow[i], q = bow[i + 1];
    if (Math.abs(p.z - ZC) > 70 || Math.abs(q.z - ZC) > 70) continue;
    const y = chordY - 4.2, d = Math.hypot(q.top.x - p.top.x, q.top.z - p.top.z);
    const g = new THREE.BoxGeometry(1.4, 0.12, d + 0.05);
    g.rotateY(Math.atan2(q.top.x - p.top.x, q.top.z - p.top.z)); g.translate((p.top.x + q.top.x) / 2 + 1.0, y, (p.top.z + q.top.z) / 2); steel.push(g.toNonIndexed());
  }
  // the four primary trusses, north-south from the south perimeter truss to
  // the north roof's leading edge (up to 180 m), where pyramid struts hang
  // them from the arch by forestays; their top chords carry the moving roof
  // panels' bogies
  const NLE = 46;
  for (const dz of PT) {
    const z = ZC + dz, xs = southPerim(z);
    prismInto(steel, V3(xs, TOP - 0.3, z), V3(NLE, TOP - 0.3, z), 3.0, 5.0, 0.2);
    const apex = V3(NLE + 2.5, ROOF + 7.5, z);
    for (const [ddx, ddz] of [[-0.8, -3.5], [-0.8, 3.5], [5.5, -3.5], [5.5, 3.5]]) rodInto(steel, V3(NLE + ddx, ROOF, z + ddz), apex, 0.3, 0.2);
    apexes.push(apex);
    for (const off of [-24, 24]) { const q = archAtZ(z + off); if (q.y > apex.y + 10) rodInto(cables, apex, q, 0.1, 0.1, 4); }
  }
  // the twin catenary cables over the southern edge of the north roof, 300 m
  // from foot to foot of the arch through the struts' heads
  {
    const heads = apexes.slice().sort((a, b) => a.z - b.z);
    const feet = [arch(0.012), arch(0.988)];
    const path = [feet[0], ...heads, feet[1]];
    for (const off of [-0.8, 0.8]) for (let i = 0; i + 1 < path.length; i++) {
      rodInto(cables, V3(path[i].x + off, path[i].y + 0.4, path[i].z), V3(path[i + 1].x + off, path[i + 1].y + 0.4, path[i + 1].z), 0.07, 0.07, 4);
    }
  }
  // (painted steel, a light grey but not white, and dull: round 41, it glared
  // white under the house lights and their own glow)
  const steelMat = holdAtDistance(std({ color: 0x6a6d72, roughness: 0.85, metalness: 0.1, emissive: 0x2c2e32, emissiveIntensity: 0.06 }));
  root.add(new THREE.Mesh(mergeGeometries(steel), steelMat));
  root.add(new THREE.Mesh(mergeGeometries(cables), holdAtDistance(std({ color: 0x8e9196, roughness: 0.6, metalness: 0.4, emissive: 0x202226, emissiveIntensity: 0.08 }))));
  // the gantry lights along the roof's inner edge
  const flood = [];
  for (let k = 0; k < edge.length; k += 1) flood.push(pipe.flares.add(V3(edge[k].x, ROOF - 3.4, edge[k].z), KELVIN(5600), 1.0, 0));   // (round 41: smaller, dimmer glows)
  root.add(wembleyArch({ zc: ZC }));

  // the press box: desks in front of every other row, a screen between
  // every two places
  const deskGeo = [], deskScr = [];
  for (const dk of WB_STANDS.desks || []) {
    const sh = new THREE.Shape(dk.polys[0].map(([x, z]) => new THREE.Vector2(x, z + ZC)));
    for (const hole of dk.polys.slice(1)) sh.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z + ZC))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: dk.y - dk.y0, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, dk.y, 0); deskGeo.push(g.toNonIndexed());
    const ring = dk.polys[0];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let z = z0 + 0.6; z < z1 - 0.4; z += 1.2) {
      // (a laptop-height screen sitting on the desk, leaning back a little: round 41, they stood too tall over it)
      const m = new THREE.BoxGeometry(0.03, 0.22, 0.42); m.translate(0, 0.11, 0); m.rotateZ(0.18); m.translate((x0 + x1) / 2, dk.y + 0.005, z + ZC); deskScr.push(m.toNonIndexed());
    }
  }
  if (deskGeo.length) {
    root.add(new THREE.Mesh(mergeGeometries(deskGeo), std({ color: 0x33353a, roughness: 0.6 })));
    root.add(new THREE.Mesh(mergeGeometries(deskScr), std({ color: 0x0a0b0d, roughness: 0.3, emissive: 0x28364a, emissiveIntensity: 1 })));
  }

  return concertRoom(ctx, 'stadium', {
    root, center: STAGE, eye, stands, field, roofY: ROOF,
    houseUpdate(f) {
      flood.forEach((lamp) => { lamp.intensity = .05 + .7 * f.house; });
      steelMat.emissiveIntensity = .06 + .25 * f.house;
    },
  });
}
