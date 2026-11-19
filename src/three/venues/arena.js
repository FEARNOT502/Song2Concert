// ─────────────────────────────────────────────────────────────────────────────
// ARENA — Saitama Super Arena in arena mode: 130 × 120 m under a ceiling
// about 30 m up, 22,500 seats, seen from FOH 35 m out on a standing floor.
// The 200 level, the three-row 300 balcony, the 400 level above it and the
// 500 level along the middle of each side; a stage set of its own with the
// seats behind it left empty; the movable ceiling's panels over a rig of
// three trusses.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, KELVIN, V3, std, concreteTex, withRepeat } from '../core.js';

import { wedge } from '../rig.js';

import { concertRoom } from '../concert-production.js';
import { STAGE_Z } from '../stage-plan.js';
import { buildStands, decodeSeats } from '../stands.js';
import { SSA_STANDS } from './ssa-data.js';
import { fitArena200 } from './arena-200.js';
import { arenaAcousticWalls, arenaCeiling, arenaFloor, arenaLounge, arenaMovingBlockJoint } from './arena-interior.js';

export function buildArena(ctx) {
  const round = ctx.mode === '360';
  const center = V3(0, 0, STAGE_Z.arena[round ? '360' : 'general']);
  const room = arenaRoom(ctx, { stage: center, sold: round ? () => true : arenaEndSold });
  return concertRoom(ctx, 'arena', { ...room, center, eye: V3(0, 2.5, 81.4), mask: endMaskZ });
}

// the floor's centre, in the room's coordinates (the data's z 0)
export const ARENA_OZ = 45;
// The end stage's masking (app z): across behind the set, then angled forward
// past the corners' blocks to the sides' fronts, and on across the sides to
// the walls. The seats in front of it are the ones an end-stage show sells.
const END_SZ = 6;
const END_MASK = { MZ: 2.2 + END_SZ, MX: 16, SX: 31, SZF: 15 };
const endMaskZ = (x) => { const { MZ, MX, SX, SZF } = END_MASK, a = Math.abs(x); return a <= MX ? MZ : a >= SX ? SZF : MZ + (SZF - MZ) * (a - MX) / (SX - MX); };
export const arenaEndSold = (x, z) => z > endMaskZ(x) + 0.8;

// Every seat by its ticket (ssa_labels.py's labels: the official seat list's
// rows and numbers, the block named by its door; the suites S01-S15), and
// where it is in the room (x, z with the stage end north, the floor's centre at
// z ARENA_OZ; y its tread). `mode` 'general': only the seats an end-stage show
// sells (in front of the masking); '360': all.
const _arenaCatalogs = new Map();
export function getArenaSeatCatalog(mode = 'general') {
  const key = mode === '360' ? '360' : 'general';
  if (_arenaCatalogs.has(key)) return _arenaCatalogs.get(key);
  const bNames = SSA_STANDS.blockNames || [];
  const byBlock = new Map(), levelOf = new Map();
  for (const L of SSA_STANDS.levels) {
    if (!L.labels) continue;
    const S = decodeSeats(L.seats), sk = L.seatScale ?? 10, LB = decodeSeats(L.labels);
    for (let i = 0; i < S.length; i += 4) {
      const x = S[i] / sk, z = S[i + 1] / sk + ARENA_OZ, rIdx = S[i + 2], yaw = S[i + 3] * DEG;
      if (key === 'general' && !arenaEndSold(x, z)) continue;
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
  _arenaCatalogs.set(key, cat);
  return cat;
}

// The building, the same for either layout: the stands (the seats turned to
// `stage`, the crowd in those `sold` says), the 300 level's ends, the suites,
// the floor, the movable ceiling with its downlights, and the house lights.
// the levels' fronts: white panels (the photograph's bands)
// (matt, as precast panels and concrete are: no sheen for the ceiling's downlights to stand in)
const matt = (color, o = {}) => std({ color, roughness: 1, metalness: 0, envMapIntensity: 0.2, ...o });
const FRONT = matt(0xa4a4a1, { side: THREE.DoubleSide });
const ARENA_STANDS = fitArena200(SSA_STANDS);

function arenaRoom(ctx, { stage, sold }) {
  const { pipe, q } = ctx;
  const root = new THREE.Group();
  const H = 30;                        // the movable ceiling, lowered for arena mode
  // ── the stands, from the official seat map ──
  // Arena mode, end stage 2 (the layout nearly every concert uses): the floor
  // 51 × 82 m between the 200 level's front rows, the stage at its north end.
  // The 200 level all round (32 rows down the sides, 19 at the ends, fans at
  // the corners, the tunnels in from the concourse at rows 18–27 of the
  // sides); the 300 level's three-row balconies round the ends; the 400 level
  // — its great crescents down the sides, 24 rows at the middle and under ten
  // at the ends where the wall curves in, and five-row balconies round the
  // ends; the 500 level's three rows over them. Every seat of the official
  // seat list (18,759, the telescopic rows folded away), each where the map
  // draws it, labelled with its row and number and its block by its door
  // (pipeline/ssa_seats.py, ssa_labels.py); the north end's front blocks,
  // under the stage on the map, as the south end's turned round.
  const OZ = ARENA_OZ;                 // the floor's centre, in this room's coordinates
  const stands = buildStands(ARENA_STANDS, {
    // (the lightsticks' blocks by the stands' own aisles)
    byAisle: true,
    // (by the aisles even now the seats are labelled with their doors' blocks: a door's seats are not one block)
    aisleFirst: true,
    // (one wedge across every level, cut where the 200 level's aisles run)
    sectors: ['200'],
    // (each corner's fan one block, however many aisles cut it, with the
    // stub of the side behind the tunnel's mouth beside it; the end's short
    // block by the fan its own)
    sectorJoin: (a, b) => {
      const fan = (f) => Math.abs(Math.asin(Math.sin(2 * f * DEG)) / 2) / DEG > 20;
      const stub = (k) => k.n < 200 && Math.abs(k.x) > 43;
      return (fan(a.face) && fan(b.face) && Math.abs(Math.atan2(Math.sin((a.face - b.face) * DEG), Math.cos((a.face - b.face) * DEG))) < 12 * DEG)
        || (stub(a) && fan(b.face)) || (stub(b) && fan(a.face));
    },
    sectorMin: 0.2, sectorWhole: 0.12, round: ctx.mode === '360',
    offset: V3(0, 0, OZ), stage, seed: 200, roofY: H,
    // The house-light photographs show grey concrete, blue-grey seats, wine-red
    // seats at level 300, yellow aisle handrails and green door frames.
    concreteTone: 0.38, concreteEven: 0.6,
    seatColors: { 200: 0x30343e, 300: 0x7a2b35, 400: 0x30343e, 500: 0x30343e, '300S': 0x2a1d17 },
    materials: {
      struct: matt(0xffffff, { ...withRepeat(concreteTex({ key: 'ssaconc', tone: 0.38, even: 0.6 }), 1 / 3, 1 / 3), roughnessMap: null, roughness: 1 }),
      step: matt(0x828381),
      rail: matt(0x9d9d9a, { side: THREE.DoubleSide }),
      fence: std({ color: 0xc29a2e, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
      frontGuard: std({ color: 0x303436, roughness: 0.72, metalness: 0.2, side: THREE.DoubleSide }),
      wall: matt(0x8a8c92, { side: THREE.DoubleSide }),
      interior: matt(0x928e86, { emissive: 0x76726b, emissiveIntensity: 0.52 }),
      ceiling: matt(0x48494b, { emissive: 0x454647, emissiveIntensity: 0.43 }),
      doorFrame: std({ color: 0x3f6b53, roughness: 0.6, metalness: 0.1 }),
      levelFront: Object.fromEntries(['200', '300', '400', '500'].map((lv) => [lv, FRONT])),
      // the suites' balconies behind glass
      // (a soft sheen, not a mirror: glossy, the ceiling's downlights stood in it as two suns)
      levelRail: { '300S': new THREE.MeshPhysicalMaterial({ color: 0x8b9aa2, roughness: 0.28, metalness: 0.02, specularIntensity: 0.52, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }) },
    },
    crowd: !!q.crowd,
    sold,
  });
  root.add(stands.group);

  // ── the suites on the 3rd floor, along the left side ──
  // behind the 200s' back: a row of rooms, each behind a glass front with its
  // balcony in front of it, the VIP room in the middle; lit warm within. A
  // door in each room's glass front opens onto its balcony, one in its back
  // wall onto the corridor behind the rooms, which has a stair down to the
  // 200 concourse at each end (the data's flights and floor)
  const SU = SSA_STANDS.suites;
  if (SU) {
    const g = [], glassG = [], lit = [], trim = [], fascia = [];
    const box = (out, x0, x1, y0, y1, z0, z1) => {
      if (y1 - y0 < 0.001 || Math.abs(z1 - z0) < 0.001) return;
      const b = new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0));
      b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2 + OZ);
      out.push(b.toNonIndexed());
      b.dispose();
    };
    const z0 = SU.boxes[0][0], z1 = SU.boxes[SU.boxes.length - 1][1];
    const zc = SU.boxes.map((b) => (b[0] + b[1]) / 2);       // each room's door, at its middle
    const dw = SU.doorW / 2, dh = SU.doorH;
    const yFront = SSA_STANDS.levels.find((l) => l.name === '300S').h0, railY = yFront + 1.1;
    // a wall across x from y0 to y1 along z0..z1, with the doors' openings (from `sill` up, `dh` high) left in it
    const wall = (out, xa, xb, y0, y1, sill) => {
      let z = z0 - 0.3;
      for (const c of zc) {
        if (c - dw > z) box(out, xa, xb, y0, y1, z, c - dw);
        box(out, xa, xb, y0, sill, c - dw, c + dw);              // under the door (its sill)
        box(out, xa, xb, sill + dh, y1, c - dw, c + dw);          // over it
        z = c + dw;
      }
      if (z1 + 0.3 > z) box(out, xa, xb, y0, y1, z, z1 + 0.3);
    };
    box(g, SU.xr, SU.xg, SU.y - 0.45, SU.y, z0, z1);                   // the rooms' floor
    box(g, SU.xc1, SU.xr, SU.y - 0.45, SU.y, z0, z1);                  // under the back wall: the sill of its doors
    box(g, SU.xc0, SU.xf, SU.yc, SU.yc + 0.5, z0, z1);                  // the corridor's and the rooms' ceiling, on over the balconies
    wall(g, SU.xc1, SU.xr, SU.y, SU.yc + 0.5, SU.y);                    // the back wall, a door to each room
    box(g, SU.xc0 - 0.25, SU.xc0, SU.y - 0.45, SU.yc + 0.5, z0 - 0.3, z1 + 0.3);   // the corridor's outer wall
    for (const zz of [z0, ...SU.boxes.map((b) => b[1])]) box(g, SU.xr, SU.xg, SU.y, SU.yc, zz - 0.1, zz + 0.1);   // walls between the rooms
    for (const [za, zb] of [[z0 - 0.3, z0], [z1, z1 + 0.3]]) box(g, SU.xr - 0.3, SU.xf, SU.y - 0.45, SU.yc + 0.5, za, zb);   // the run's ends
    // Continuous concrete fascia and dark rail profiles under the house lights.
    box(fascia, SU.xf - 0.025, SU.xf + 0.055, yFront - 0.45, yFront + 0.035, z0, z1);
    box(fascia, SU.xf - 0.16, SU.xf + 0.035, SU.yc - 0.13, SU.yc + 0.23, z0, z1);
    for (const y of [yFront + 0.04, railY]) box(trim, SU.xf - 0.088, SU.xf - 0.012, y - 0.03, y + 0.03, z0, z1);
    wall(glassG, SU.xg - 0.02, SU.xg + 0.02, SU.y, SU.yc, SU.y);
    for (const [za, zb, n] of SU.boxes) {
      const c = (za + zb) / 2, m = n > 8 ? 4 : 3;
      box(trim, SU.xg - 0.05, SU.xg + 0.05, SU.y + dh, SU.y + dh + 0.055, c - dw, c + dw);
      for (const z of [c - dw, c + dw]) box(trim, SU.xg - 0.06, SU.xg + 0.06, SU.y, SU.yc, z - 0.025, z + 0.025);
      for (const [a, b] of [[za, c - dw], [c + dw, zb]]) {
        box(trim, SU.xg - 0.045, SU.xg + 0.045, SU.y, SU.y + 0.18, a, b);
      }
      box(trim, SU.xg - 0.055, SU.xg + 0.055, SU.yc - 0.11, SU.yc, za, zb);
      for (const z of [za, c]) {
        box(trim, SU.xf - 0.084, SU.xf - 0.015, yFront, railY, z - 0.025, z + 0.025);
      }
      for (let k = 1; k < m; k++) {
        const zz = za + (zb - za) * k / m;
        if (Math.abs(zz - c) < dw + 0.15) continue;
        box(g, SU.xg - 0.06, SU.xg + 0.06, SU.y, SU.yc, zz - 0.04, zz + 0.04);
      }
      box(lit, SU.xr + 0.02, SU.xr + 0.06, SU.y + 0.4, SU.yc - 0.3, za + 0.3, c - dw - 0.2);
      box(lit, SU.xr + 0.02, SU.xr + 0.06, SU.y + 0.4, SU.yc - 0.3, c + dw + 0.2, zb - 0.3);
      box(lit, SU.xg + 0.48, SU.xg + 0.70, SU.yc - 0.058, SU.yc, c - 0.12, c + 0.12);
    }
    box(trim, SU.xf - 0.084, SU.xf - 0.015, yFront, railY, z1 - 0.025, z1 + 0.025);
    for (let z = z0 + 3; z < z1 - 2; z += 6) box(lit, SU.xc0 + 0.5, SU.xc1 - 0.5, SU.yc - 0.04, SU.yc, z - 0.6, z + 0.6);
    for (const c of zc) box(lit, SU.xc1 - 0.05, SU.xc1, SU.y + dh + 0.1, SU.y + dh + 0.3, c - dw, c + dw);   // a lit panel over each room's door
    for (const [name, parts, material] of [
      ['Suite structure', g, matt(0x3c3a36)],
      ['Suite concrete fascia', fascia, FRONT],
      ['Suite mullions and rail caps', trim, std({ color: 0x303439, roughness: 0.53, metalness: 0.21 })],
      ['Suite glazing', glassG, new THREE.MeshPhysicalMaterial({ color: 0x495861, roughness: 0.31, specularIntensity: 0.62, transparent: true, opacity: 0.67, side: THREE.DoubleSide, depthWrite: false })],
      ['Suite interior lighting', lit, std({ color: 0x241d15, emissive: 0xc79a6a, emissiveIntensity: 0.35 })],
    ]) {
      const mesh = new THREE.Mesh(mergeGeometries(parts), material);
      mesh.name = name;
      root.add(mesh);
      for (const part of parts) part.dispose();
    }
  }

  const X0 = -76, X1 = 76, Z0 = OZ - 70, Z1 = OZ + 70;
  const envelope = { x0: X0, x1: X1, z0: Z0, z1: Z1, oz: OZ, y: H };
  arenaFloor(root, SSA_STANDS.tunnels, envelope);
  const ceiling = arenaCeiling(root, pipe, envelope);
  const houseFix = ceiling.lights;
  houseFix.push(...arenaAcousticWalls(root, SSA_STANDS.rooms.acousticWalls, SSA_STANDS.frames, OZ, pipe));
  arenaMovingBlockJoint(root, SSA_STANDS.rooms.walls, OZ, H);
  const updateLounge = arenaLounge(root, OZ, SU.y);
  const updateInterior = (house) => { ceiling.update(house); updateLounge(house); };
  const house = [];
  // the house lights: the ceiling's downlights, shining down, not onto it
  for (const [x, z] of [[-24, 20], [24, 20], [-24, 60], [24, 60], [0, 40], [0, 80]]) {
    // (a recessed fitting's spread: full straight down, soft to nothing by 69°
    // off the vertical. At 80° with a hard edge they threw light sideways along
    // the ceiling: the hangs, their chains and the 400 level's fronts near
    // them lit up white)
    const l = new THREE.SpotLight(KELVIN(4200), 0, 140, 1.2, 0.6, 2); l.position.set(x, H - 0.6, z); l.target.position.set(x, 0, z);
    l.userData.offWhenDark = 'house'; root.add(l, l.target); house.push(l);
  }
  return { root, stands, H, OZ, X0, X1, Z0, Z1, houseFix, house, updateInterior };
}

// The end stage (GENERAL): the set at the north end, masking behind it, a
// runway out to a cross on the seated floor.
