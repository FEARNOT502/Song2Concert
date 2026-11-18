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
import { APP, DEG, KELVIN, V3, std, concreteTex, ringTint, withRepeat } from '../core.js';
import { lightPoints } from '../people.js';
import { ampStack, chainInto, drumKit, guitar, hoists, keyboardRig, ledScreen, mats, micStand, shadowSpot, stageDeck, stageSteps, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, crossThrust, fixtureRow, flashOnCrowd, flashUnits, floorBlocks, floorChairs, fohPosition, fromRow, maskingDrapes, packFloor, paCorner, paHang, paPair, runBlinders, runShow, runStrobes, screenHang, stageRing, stageSet, subLine, thinRow, wallStrip } from '../show.js';
import { buildStands, decodeSeats } from '../stands.js';
import { SSA_STANDS } from './ssa-data.js';
import { arenaAcousticWalls, arenaCeiling, arenaFloor, arenaLounge, arenaMovingBlockJoint } from './arena-interior.js';

export function buildArena(ctx) {
  return ctx.mode === '360' ? arenaRound(ctx) : arenaEnd(ctx);
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
  const stands = buildStands(SSA_STANDS, {
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
    const l = new THREE.SpotLight(KELVIN(4200), 0, 140, 1.4, 0.3, 2); l.position.set(x, H - 0.6, z); l.target.position.set(x, 0, z);
    l.userData.offWhenDark = 'house'; root.add(l, l.target); house.push(l);
  }
  return { root, stands, H, OZ, X0, X1, Z0, Z1, houseFix, house, updateInterior };
}

// The end stage (GENERAL): the set at the north end, masking behind it, a
// runway out to a cross on the seated floor.
function arenaEnd(ctx) {
  const { pipe, q, cu } = ctx;
  const DECK = 2.2, RIG = 20;
  // FOH, and the listener there: at the back of the floor's seats
  const eye = V3(0, 1.6 + 0.9, 81.4);
  // the stage set 6 m out from the end, the masking brought forward with it
  const SZ = END_SZ;
  const STAGE = V3(0, DECK, 8 + SZ);
  // the masking's line (END_MASK)
  const { MZ, MX, SX, SZF } = END_MASK;

  // nobody behind the masking
  const { root, stands, H, OZ, X0, X1, Z0, Z1, houseFix, house, updateInterior } = arenaRoom(ctx, { stage: STAGE, sold: arenaEndSold });
  // the set stands on the deck; the building's stands carry on round it
  stageSet(root, { w: 30, h: 17, z: 1.8 + SZ, deck: DECK, towerX: 15.8, backdropW: 32, backdropH: 16, wingX: 18.5, wingW: 6, wingH: 11 });
  // masking across the building behind the stage, wall to wall and floor to
  // the ceiling, over the set's own backdrop in the middle, angled forward
  // either side to the sides' fronts: the end stands and the corners' blocks
  // behind it are out of sight
  const mline = [[-76, SZF], [-SX, SZF], [-MX, MZ], [MX, MZ], [SX, SZF], [76, SZF]];
  for (let i = 0; i + 1 < mline.length; i++) maskingDrapes(root, { a: mline[i], b: mline[i + 1], top: H,
    bottomAt: (x, z) => (Math.abs(x) < 16 ? DECK + 16 : stands.topAt(x, z)) });
  // From behind, one flat black wall: a matte backing just behind the velour,
  // from the floor (or the treads it crosses) to the ceiling, wall to wall;
  // behind the set it runs straight across behind the towers' braces, at the
  // back of the backstage deck, and joins the masking either side. From the
  // north end's stands the drapes' folds, the chains, the braces and the cases
  // are out of sight, and nothing shows between the drop and the masking.
  {
    // (BZ just in front of the north end's front row)
    const BZ = 3.5, o = 0.35;
    const back = [[-76, SZF - o], [-SX, SZF - o], [-MX - 0.3, MZ - 0.2], [-MX - 0.3, BZ], [MX + 0.3, BZ], [MX + 0.3, MZ - 0.2], [SX, SZF - o], [76, SZF - o]];
    const pts = [];
    for (let i = 0; i + 1 < back.length; i++) {
      const [ax, az] = back[i], [bx, bz] = back[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
      for (let k = 0; k < n; k++) pts.push({ x: ax + (bx - ax) * k / n, z: az + (bz - az) * k / n });
    }
    pts.push({ x: back[back.length - 1][0], z: back[back.length - 1][1] });
    const wall = wallStrip(pts, pts.map(() => H), { y0: pts.map((p) => stands.topAt(p.x, p.z)), thick: 0.12, ease: 0 });
    root.add(new THREE.Mesh(wall, std({ color: 0x050506, roughness: 1 })));
  }

  // ── stage ──
  const deck = stageDeck({ w: 34, d: 15, h: DECK, z: 8.5 + SZ, lip: false });
  root.add(deck);
  // the backstage deck behind it, under the drop, the towers' braces and the
  // cases (they stood in the air off the deck's back edge)
  root.add(stageDeck({ w: 34, d: 3.4, h: DECK, z: 5.35, lip: false }));
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 17.75, z: 16 + SZ, h: DECK, dir: [0, -1] }));
  // the runway out to a cross on the floor: a walkway either side two-thirds
  // of the way, the runway on past it to a square end stage in the middle
  const RW0 = 16 + SZ, RW1 = 52, CZ = 38;
  // (lower than the stage: 1.8 m, as the dome's runways)
  const XH = 1.8;
  const cross = crossThrust(root, { z0: RW0, z1: RW1, w: 3.6, crossZ: CZ, crossD: 3.6, crossW: 12, tip: 6, h: XH });
  const ringM = stageRing(root, [{ x: 0, z: 8.5 + SZ, w: 34, d: 15, h: DECK, back: true }, ...cross.parts]);
  // one wide wall across the set (an arena tour's panoramic LED), and the
  // IMAG either side for the far end of the room
  const WW = 30, WH = 10.5;
  const scr = bigScreens(ctx, root, { w: WW, h: WH, y: DECK + 1.2 + WH / 2, z: 1.8 + SZ, imagW: 11, imagX: 23.5, imagY: 13.5, imagZ: 11 + SZ, imagYaw: 0.3 });
  // each screen flown on a header truss and chains from the roof
  screenHang(root, { y: DECK + 1.2 + WH + 0.3, z: 1.8 + SZ, w: WW, topY: H, n: 5 });
  for (const side of [-1, 1]) screenHang(root, { x: side * 23.5, y: 13.5 + 11 / (16 / 9) / 2 + 0.25, z: 11 + SZ, w: 11, yaw: -side * 0.3, topY: H, n: 2, size: 0.4 });
  const riser = stageDeck({ w: 10, d: 4, h: 1.0, z: 4.2 + SZ, lip: false }); riser.position.y = DECK; root.add(riser);
  // the backline, set and waiting; no one on stage
  for (const [x, z, col] of [[-7, 9.0 + SZ, 0x5a1a0e], [7, 9.0 + SZ, 0x1a1a1c]]) {
    const gt = guitar({ color: col, bass: x > 0 }); gt.scale.setScalar(0.8); gt.position.set(x, DECK + 0.5, z); gt.rotation.x = -0.28; root.add(gt);
    const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z + 1.2); m.rotation.y = Math.PI; root.add(m);
  }
  const keysL = keyboardRig(); keysL.position.set(-4, DECK + 1, 4.6 + SZ); keysL.rotation.y = Math.PI; root.add(keysL);
  const kit = drumKit({ shell: 0x1a1a1e }); kit.position.set(0, DECK + 1, 3.6 + SZ); kit.scale.setScalar(1.1); root.add(kit);
  for (const x of [-12, 12]) { const a = ampStack({ count: 2 }); a.position.set(x, DECK, 4.5 + SZ); root.add(a); }
  for (let i = 0; i < 8; i++) { const w = wedge(); w.position.set(-10.5 + i * 3, DECK, 15.4 + SZ); w.rotation.y = Math.PI; root.add(w); }
  const mic = micStand({ height: 1.5 }); mic.position.set(0.05, DECK, 13.6 + SZ); mic.rotation.y = Math.PI; root.add(mic);
  // the subs in a row on the floor under the barrier, the front fills on the lip
  subLine(root, { x0: -15.2, x1: 15.2, z: RW0 + 0.9, gap: 2.4, count: 2, fills: { xs: [-15, -10, -5, 5, 10, 15], y: DECK, z: RW0 - 0.35 } });

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  const trussZ = [3.2 + SZ, 9.2 + SZ, 15.2 + SZ];
  for (const z of trussZ) { const t = truss(36, { size: 0.76, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-16, -6, 6, 16], RIG, z, H)); }
  // the PA flown from the roof, all of it clear of the trusses (36 m wide):
  // at each of the stage's front corners, just past the trusses' ends, three
  // hangs, from the front round to the side, spaced out on arms from the
  // front truss's end; the side hangs turned out to the side
  // stands; the 270 hangs further round, at the stands beside and behind the
  // stage's corners; and a pair of delay hangs over the middle of the floor
  // for the far end and the 400 level, as the big arena shows hang
  const pa = [];
  for (const side of [-1, 1]) {
    pa.push(...paCorner(root, { px: side * 18, pz: 15.2 + SZ, r: 3.4, yaws: [0, side * 0.6, side * 1.2], boxes: [16, 13, 11], y: RIG - 0.6, bar: RIG }));
    paPair(root, { x: side * 29.5, y: RIG - 1.0, z: 12 + SZ, boxes: 14, width: 1.2, yaw: side * 0.5, roofY: H });
    paHang(root, { x: side * 33.5, y: RIG - 1.4, z: 15 + SZ, boxes: 10, width: 1.1, yaw: side * 1.2, roofY: H });
    paHang(root, { x: side * 13, y: RIG - 3, z: 56, boxes: 8, width: 1.1, yaw: side * 0.06, roofY: H, splay: 0.03 });
  }
  const spots = [], beams = [], washes = [], ups = [];
  spots.push(...fixtureRow(q, 12, (i) => ({ fx: rig.add({ kind: 'spot', pos: V3(-15.5 + i * (31 / 11), RIG - 0.5, 15.2 + SZ), length: 45, angle: 0.085, beamGain: 1.0 }), group: 0 })));
  beams.push(...fixtureRow(q, 12, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-15.5 + i * (31 / 11), RIG - 0.5, 9.2 + SZ), length: 60, beamGain: 1.2 }), group: 1 })));
  // (a wash's broad lens flares little: at full, the one that faced FOH hung
  // over the stage as a ball of light)
  washes.push(...fixtureRow(q, 10, (i) => ({ fx: rig.add({ kind: 'wash', pos: V3(-15 + i * (30 / 9), RIG - 0.5, 3.2 + SZ), length: 22, beamGain: 0.5, flareGain: 0.15 }), group: 2 })));
  ups.push(...fixtureRow(q, 10, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-15 + i * (30 / 9), DECK, 15.6 + SZ), hang: 'up', length: 50, beamGain: 1.0 }), group: 3 })));
  const TB = RIG - 0.38;                       // the trusses' bottom chord
  // blinders under the front truss between the spots; strobes along the foot
  // of the wall either side of the riser and under the middle truss
  const bu = [];
  for (const x of [-17.2, -14.09, -8.45, -2.82, 2.82, 8.45, 14.09, 17.2]) bu.push({ pos: V3(x, TB - 0.38, 15.2 + SZ + 0.12), dir: V3(x * 0.4, 1.2 - RIG, 50 - 15.2 - SZ), mount: TB });
  const blinders = flashUnits(rig, root, thinRow(q, bu), { kind: 'blinder' });
  const su = [], st = [];
  for (const x of [-14.5, -10.5, -6.5, 6.5, 10.5, 14.5]) su.push({ pos: V3(x, DECK + 0.12, 2.2 + SZ), dir: V3(0, 0.25, 1), mount: DECK });
  for (const x of [-11.27, -5.64, 5.64, 11.27]) st.push({ pos: V3(x, TB - 0.15, 9.2 + SZ + 0.1), dir: V3(0, -0.5, 1), mount: TB });
  const strobes = flashUnits(rig, root, [...thinRow(q, su), ...thinRow(q, st)], { kind: 'strobe' });
  // real light where the rig lands
  const moverLights = [];
  for (const k of [2, 5, 8, 10]) moverLights.push(rig.light(fromRow(spots, k, 12).fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5, decay: 2 }), 5200));
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.2, penumbra: 0.7, size: q.shadowSize, far: 80, cast: q.shadows });
  front1.position.set(-6, RIG + 2, 40 + SZ); front1.target.position.set(0, DECK + 1, 12 + SZ);
  const front2 = shadowSpot(KELVIN(5600), 0, { angle: 0.12, penumbra: 0.6, cast: false });
  front2.position.set(4, RIG + 3, 44 + SZ); front2.target.position.set(0, DECK + 1.5, 13.2 + SZ);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  // (between the back and middle trusses, clear of everything hung: at the
  // wall's header it sat a hand's width from the middle chain, which it lit
  // white, a ball of light floating over the stage)
  stageWash.position.set(0, RIG - 1, 6.2 + SZ); stageWash.target.position.set(0, DECK, 12 + SZ);
  for (const l of [front1, front2, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-20, 18, 30], [20, 18, 30], [0, 24, 60]]) { const l = new THREE.PointLight(0xffffff, 0, 90, 2); l.position.set(x, y, z); l.userData.offWhenDark = 'show'; root.add(l); fill.push(l); }
  root.add(new THREE.HemisphereLight(0x14141c, 0x050508, 0.18));

  // ── people ──
  // the floor seated in lettered blocks — A at the front to F at the back,
  // 1 to 4 across — with the runway and the desk left clear; every sold seat
  // in the stands taken
  // The 200s' telescopic front rows are put away along the sides, so the
  // floor's outer blocks run on out to 1.4 m short of the fixed stand (and
  // clear of the corners' fans)
  const clear = (x, z) => [[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    .every(([dx, dz]) => stands.topAt(x + dx, z + dz) < 0.05);
  const keep = (x, z) => Math.abs(x) < 29.2 && z < OZ + 39.5 && !cross.inside(x, z, 2.0) && !(Math.abs(x - eye.x) < 4.6 && Math.abs(z - eye.z) < 4.2) && clear(x, z);
  // The blocks laid out round the runway, not cut by it: the inner ones
  // start 2.2 m off the runway (and the end stage), none in the cross's band
  // but the outer ones; 3 m clear of the stage's front. Mirrored either side.
  const half = [
    // the outer column, the whole length
    ...[[25.0, 34.0], [35.6, 44.6], [46.2, 55.2], [56.8, 65.8], [67.4, 76.4], [78.0, 84.8]].map(([z0, z1]) => ({ x0: 14.9, x1: 29.2, z0, z1 })),
    // the inner: in front of the cross, between the cross and the end stage, and past it
    { x0: 4.0, x1: 13.5, z0: 25.0, z1: 34.0 },
    { x0: 5.4, x1: 13.5, z0: 44.4, z1: 54.4 },
    ...[[56.0, 65.8], [67.4, 76.4], [78.0, 84.8]].map(([z0, z1]) => ({ x0: 1.0, x1: 13.5, z0, z1 })),
  ];
  const floorSeats = floorBlocks(half.flatMap((b) => [b, { ...b, x0: -b.x1, x1: -b.x0 }]), { keep, seed: 3 });
  root.add(floorChairs(floorSeats.chairs));
  bigCrowd(root, cu, q, floorSeats.people.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.03 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.3;
  root.add(aisleField);
  const fohLeds = lightPoints(fohPosition(pipe, root, eye), cu, { maxPx: 4 });
  root.add(fohLeds);

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * 12, scr.main.position.y + dy * scr.h * 0.5, 2.6 + SZ), 0xffffff, 0));
  ctx.screenHaze(scr.main, hzs, offs);
  scr.main.userData.hazePower = 90;
  // (no glows of their own in the air over the stage: what lights the haze
  // there is the rig's beams)

  return {
    root, eye, seatNear: stands.seatNear,
    camera: { pos: eye, target: V3(0, DECK + 7.2, 2 + SZ), fov: 58, near: 0.15, far: 400 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x060508, 0.0045),
    hazeDensity: 0.0016, beamGain: 0.55, hazeAmb: new THREE.Color(0x040306), hazeAmbDist: 160,
    bloom: { strength: 0.7, radius: 0.65, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.004, 0.008] },
    env: { w: X1 - X0, h: H, d: Z1 - Z0, eye, wall: 0x0a0a10, floor: 0x050507, emitters: [
      { w: WW, h: WH, pos: V3(0, DECK + 1.2 + WH / 2, 2 + SZ), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: WW / WH },
      { w: 30, h: 1, pos: V3(0, RIG, 12 + SZ), normal: V3(0, -1, 0), color: APP.accent, power: 4 },
    ] },
    envIntensity: 0.6,
    update(f) {
      stands.update(f);
      updateInterior(f.house);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 42), stage: STAGE, span: 34 });
      runShow(rig, beams, f, { house: V3(0, 12, 60), stage: STAGE, span: 44 });
      runShow(rig, washes, f, { house: V3(0, 0, 18 + SZ), stage: STAGE, span: 20, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 30, 40), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      front1.intensity = 26000 * show;   // (not with the house up: it lit the runway white)
      front2.intensity = 9000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (5000 + 6000 * f.energy + 3000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (120 + 300 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 9000 * f.house; });
      houseFix.forEach((h) => { h.intensity = 1.5 * f.house; });
      ringTint(ringM.color, f.pal.a).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.22 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 10, 4 + SZ);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.2 * f.house);
      flashOnCrowd(cu.uWash.value, runBlinders(blinders, f), runStrobes(strobes, f));
      cu.uAmb.value.setRGB(0.004, 0.004, 0.006).multiplyScalar(1 + f.house * 8);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The centre stage (360), after Linkin Park's From Zero tour here (February
// 2025): the house sold all round, the floor one standing crowd with no pens,
// and in the floor's very middle a low, long stage down the room, an LED strip
// round its edge, two great LED cubes hung over its two halves, a frame of
// truss over it all with the rig on its four sides, the PA hung on all four.
// ─────────────────────────────────────────────────────────────────────────────
function arenaRound(ctx) {
  const { pipe, q, cu } = ctx;
  const DECK = 1.5, RIG = 24;
  const OZ = 45;
  const C = V3(0, DECK, OZ);                    // the stage's middle: the floor's
  const SW = 10, SD = 40;                       // the stage, its long side down the room
  const { root, stands, H, X0, X1, Z0, Z1, houseFix, house, updateInterior } = arenaRoom(ctx, { stage: C, sold: () => true });
  // FOH, and the listener there: out on the floor to the south
  const eye = V3(0, 1.6 + 0.9, OZ + 34);

  // ── the stage ──
  root.add(stageDeck({ w: SW, d: SD, h: DECK, z: OZ, lip: false }));
  // the LED strip round all four edges, in the sleeve's colour
  const ringM = stageRing(root, [{ x: 0, z: OZ, w: SW, d: SD, h: DECK }]);
  // steps up at each end
  for (const s of [-1, 1]) root.add(stageSteps({ x: 2.5, z: OZ + s * (SD / 2 + 8 * 0.28 + 0.05), h: DECK, dir: [0, -s], width: 1.6 }));
  // the barrier round it, 2.5 m out: the crowd up against it on every side
  const PIT = 2.5, BX = SW / 2 + PIT, BZ = SD / 2 + PIT;
  {
    const bar = [], M = mats();
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = -Math.atan2(z1 - z0, x1 - x0);
      for (const y of [0.25, 1.1]) { const b = new THREE.BoxGeometry(len, 0.05, 0.05); b.rotateY(yaw); b.translate((x0 + x1) / 2, y, OZ + (z0 + z1) / 2); bar.push(b); }
      const n = Math.round(len / 0.5);
      for (let k = 0; k <= n; k++) { const b = new THREE.BoxGeometry(0.03, 0.85, 0.03); b.translate(x0 + (x1 - x0) * k / n, 0.68, OZ + z0 + (z1 - z0) * k / n); bar.push(b); }
    };
    run(-BX, -BZ, BX, -BZ); run(BX, -BZ, BX, BZ); run(BX, BZ, -BX, BZ); run(-BX, BZ, -BX, -BZ);
    root.add(new THREE.Mesh(mergeGeometries(bar), M.alu));
  }
  // the backline: the drums on a riser in the middle, keys either side, the
  // guitars and the singers' mics out towards the four edges
  {
    const riser = stageDeck({ w: 4, d: 3, h: 0.6, z: OZ, lip: false }); riser.position.y = DECK; root.add(riser);
    const kit = drumKit({ shell: 0x1a1a1e }); kit.position.set(0, DECK + 0.6, OZ); kit.scale.setScalar(1.05); root.add(kit);
    for (const [z, rot] of [[OZ - 6, Math.PI], [OZ + 6, 0]]) { const k = keyboardRig(); k.position.set(-1.5, DECK, z); k.rotation.y = rot; root.add(k); }
    for (const [x, z, col, bass] of [[2.5, OZ - 12, 0x5a1a0e, false], [-2.5, OZ + 12, 0x1a1a1c, true]]) {
      const gt = guitar({ color: col, bass }); gt.scale.setScalar(0.8); gt.position.set(x, DECK + 0.5, z); gt.rotation.x = -0.28; root.add(gt);
    }
    for (const [x, z, rot] of [[0, OZ + SD / 2 - 1, 0], [0, OZ - SD / 2 + 1, Math.PI], [-SW / 2 + 1.5, OZ, -Math.PI / 2], [SW / 2 - 1.5, OZ, Math.PI / 2]]) {
      const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z); m.rotation.y = rot + Math.PI; root.add(m);
    }
    for (const [x, z, rot] of [[-2, OZ + SD / 2 - 0.3, Math.PI], [2, OZ + SD / 2 - 0.3, Math.PI], [-2, OZ - SD / 2 + 0.3, 0], [2, OZ - SD / 2 + 0.3, 0]]) {
      const w = wedge(); w.position.set(x, DECK, z); w.rotation.y = rot; root.add(w);
    }
  }

  // ── the cubes ──
  // two LED boxes over the stage's two halves, long the way the stage runs
  // (16 m), 9 m across and 6.5 m deep, hung level and square to the stage on
  // chains from the truss. Screens on their long sides (wide: the art on the
  // left, the track on the right) and on their outer ends (the art over the
  // track); none underneath or on the ends that face each other
  const BW = 9, BH = 6.5, BL = 16, CY = 16;
  const cubes = [];
  for (const cz of [-9.5, 9.5]) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(BW - 0.1, BH - 0.1, BL - 0.1), std({ color: 0x050506, roughness: 0.6 }));
    core.userData.beamStop = true; g.add(core);
    // [w, h, rotation y, out]: the long sides, the outer end
    for (const [w, h, ay, out] of [[BL, BH, Math.PI / 2, BW / 2], [BL, BH, -Math.PI / 2, BW / 2], [BW, BH, cz < 0 ? Math.PI : 0, BL / 2]]) {
      const sc = ledScreen({ w, h, tex: ctx.art.texture(w / h), pitch: 0.006, bright: 1.3, frame: 0, light: false });
      const pv = new THREE.Group(); pv.rotation.y = ay; sc.position.z = out; pv.add(sc); g.add(pv);
      ctx.addScreen(sc, w / h, 'main');
    }
    g.position.set(0, CY, OZ + cz);
    root.add(g); cubes.push(g);
    // a chain from each top corner up to the truss
    const ch = [];
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) chainInto(ch, dx * BW / 2 * 0.9, CY + BH / 2, OZ + cz + dz * BL / 2 * 0.9, RIG - 0.4, { motor: false });
    root.add(new THREE.Mesh(mergeGeometries(ch), mats().chain));
  }

  // ── rig ──
  // a frame of truss over the stage, 22 × 50 m, a truss across its middle
  // between the cubes, on hoists to the steel
  const rig = ctx.rig({ finish: 'black' });
  const TX = 11, TZ = 25;
  for (const x of [-TX, TX]) { const t = truss(2 * TZ + 0.8, { size: 0.76, finish: 'black' }); t.rotation.y = Math.PI / 2; t.position.set(x, RIG, OZ); root.add(t); for (const z of [-TZ, -TZ / 2, 0, TZ / 2, TZ]) root.add(hoists([x], RIG, OZ + z, H)); }
  for (const z of [-TZ, 0, TZ]) { const t = truss(2 * TX - 0.8, { size: 0.76, finish: 'black' }); t.position.set(0, RIG, OZ + z); root.add(t); }
  // the rig on the square's four sides, each row lighting its own side of the
  // house (`out`, the way its side looks)
  const sides = [
    { out: [0, 1], at: (u) => V3(u * (2 * TX - 3), RIG - 0.5, OZ + TZ), n: 8 },
    { out: [0, -1], at: (u) => V3(-u * (2 * TX - 3), RIG - 0.5, OZ - TZ), n: 8 },
    { out: [1, 0], at: (u) => V3(TX, RIG - 0.5, OZ - u * (2 * TZ - 3)), n: 14 },
    { out: [-1, 0], at: (u) => V3(-TX, RIG - 0.5, OZ + u * (2 * TZ - 3)), n: 14 },
  ];
  for (const sd of sides) {
    const [ox, oz] = sd.out;
    sd.spots = fixtureRow(q, sd.n, (i) => ({ fx: rig.add({ kind: 'spot', pos: sd.at(i / (sd.n - 1) - 0.5).add(V3(-ox * 0.6, 0, -oz * 0.6)), length: 45, angle: 0.085, beamGain: 1.0 }), group: 0 }));
    sd.beams = fixtureRow(q, sd.n, (i) => ({ fx: rig.add({ kind: 'beam', pos: sd.at((i + 0.5) / sd.n - 0.5).add(V3(ox * 0.6, 0, oz * 0.6)), length: 60, beamGain: 1.2 }), group: 1 }));
    // the house each row plays to: low over its floor, high over its stands
    sd.low = V3(ox * 40, 1, OZ + oz * 40);
    sd.high = V3(ox * 60, 14, OZ + oz * 60);
  }
  // washes over the stage, either side of the cross truss
  const washes = fixtureRow(q, 10, (i) => ({ fx: rig.add({ kind: 'wash', pos: V3(i < 5 ? -4 : 4, RIG - 0.5, OZ + (i % 5 - 2) * 8), length: 22, beamGain: 0.5, flareGain: 0.15 }), group: 2 }));
  // the deck's edge: beams standing up out of it all round
  const ups = [];
  for (const [x, z, n, dx, dz] of [[0, OZ + SD / 2 - 0.3, 3, 1, 0], [0, OZ - SD / 2 + 0.3, 3, 1, 0], [SW / 2 - 0.3, OZ, 8, 0, 1], [-SW / 2 + 0.3, OZ, 8, 0, 1]]) {
    const span = dx ? SW - 4 : SD - 3;
    ups.push(...fixtureRow(q, n, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(x + dx * (i / (n - 1) - 0.5) * span, DECK, z + dz * (i / (n - 1) - 0.5) * span), hang: 'up', length: 50, beamGain: 1.0 }), group: 3 })));
  }
  const TB = RIG - 0.38;
  // blinders on each side of the square, facing out; strobes under it
  const bu = [], st = [];
  for (const sd of sides) {
    const [ox, oz] = sd.out;
    for (const u of [-0.4, -0.13, 0.13, 0.4]) { const p = sd.at(u); bu.push({ pos: V3(p.x + ox * 0.5, TB - 0.38, p.z + oz * 0.5), dir: V3(ox * 30, 2 - RIG, oz * 30), mount: TB }); }
    for (const u of [-0.25, 0.25]) { const p = sd.at(u); st.push({ pos: V3(p.x, TB - 0.15, p.z), dir: V3(ox, -0.5, oz), mount: TB }); }
  }
  const blinders = flashUnits(rig, root, thinRow(q, bu), { kind: 'blinder' });
  const strobes = flashUnits(rig, root, thinRow(q, st), { kind: 'strobe' });
  // real light where the rig lands
  for (const sd of sides) rig.light(fromRow(sd.spots, 3, 8).fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5, decay: 2 }), 4200);
  // followspots from all four sides, high in the stands
  const follows = [];
  for (const [x, z, cast] of [[0, OZ + 55, true], [0, OZ - 55, false], [50, OZ, false], [-50, OZ, false]]) {
    const l = shadowSpot(KELVIN(5600), 0, { angle: 0.1, penumbra: 0.6, size: q.shadowSize, far: 90, cast: cast && q.shadows });
    l.position.set(x, 21, z); l.target.position.set(0, DECK + 1, OZ);
    root.add(l, l.target); follows.push(l);
  }
  // the wash from straight over the stage, between the cubes
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.75, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, OZ); stageWash.target.position.set(0, DECK, OZ);
  root.add(stageWash, stageWash.target);
  const fill = [];
  for (const [x, y, z] of [[-26, 18, OZ], [26, 18, OZ], [0, 18, OZ - 30], [0, 18, OZ + 30]]) { const l = new THREE.PointLight(0xffffff, 0, 90, 2); l.position.set(x, y, z); l.userData.offWhenDark = 'show'; root.add(l); fill.push(l); }
  root.add(new THREE.HemisphereLight(0x14141c, 0x050508, 0.18));
  // the PA, hung all round and clear of the truss frame: a hang over each
  // end of the stage, two down each side and one between them; at each
  // corner three, from one side round to the other, spaced out on arms from
  // the frame's corner
  for (const [x, z, yaw] of [[0, OZ + TZ + 1.6, 0], [0, OZ - TZ - 1.6, Math.PI],
    [TX + 1.6, OZ - 12, Math.PI / 2], [TX + 1.6, OZ + 12, Math.PI / 2], [-TX - 1.6, OZ - 12, -Math.PI / 2], [-TX - 1.6, OZ + 12, -Math.PI / 2]]) {
    paPair(root, { x, y: RIG - 1, z, boxes: 14, width: 1.2, yaw, roofY: H });
  }
  for (const s of [-1, 1]) paHang(root, { x: s * (TX + 1.6), y: RIG - 1, z: OZ, boxes: 12, width: 1.2, yaw: s * Math.PI / 2, roofY: H });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const yaw = Math.atan2(sx, sz);
    paCorner(root, { px: sx * TX, pz: OZ + sz * TZ, r: 3.4, yaws: [yaw - 0.7, yaw, yaw + 0.7], boxes: [10, 12, 10], y: RIG - 1, bar: RIG, width: 1.2 });
  }

  // ── people ──
  // the floor one standing crowd, from the barrier out to the stands' fronts,
  // the FOH riser kept clear; every seat in the stands taken
  const clear = (x, z) => [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].every(([dx, dz]) => stands.topAt(x + dx, z + dz) < 0.05);
  const avoid = (x, z) => (Math.abs(x) < BX + 0.4 && Math.abs(z - OZ) < BZ + 0.4) || (Math.abs(x - eye.x) < 4.4 && Math.abs(z - eye.z) < 3.6);
  // (kept to the floor itself, as the seated layout is: none out into the
  // tunnels' mouths at the corners)
  const standing = packFloor({ x0: -29.2, x1: 29.2, z0: OZ - 39.5, z1: OZ + 39.5, avoid, inside: clear, seed: 245 });
  bigCrowd(root, cu, q, standing.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21, round: C });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.03 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.3;
  root.add(aisleField);
  root.add(lightPoints(fohPosition(pipe, root, eye), cu, { maxPx: 4 }));

  return {
    root, eye, seatNear: stands.seatNear, round: true,
    camera: { pos: eye, target: V3(0, 9, OZ), fov: 58, near: 0.15, far: 400 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x060508, 0.0045),
    hazeDensity: 0.0016, beamGain: 0.55, hazeAmb: new THREE.Color(0x040306), hazeAmbDist: 160,
    bloom: { strength: 0.7, radius: 0.65, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.004, 0.008] },
    env: { w: X1 - X0, h: H, d: Z1 - Z0, eye, wall: 0x0a0a10, floor: 0x050507, emitters: cubes.map((g) => (
      { w: BL, h: BH, pos: V3(BW / 2, CY, g.position.z), normal: V3(1, 0, 0), screen: true, power: 1.2, aspect: BL / BH })) },
    envIntensity: 0.6,
    update(f) {
      stands.update(f);
      updateInterior(f.house);
      const show = 1 - f.house;
      for (const sd of sides) {
        runShow(rig, sd.spots, f, { house: sd.low, stage: C, span: 30 });
        runShow(rig, sd.beams, f, { house: sd.high, stage: C, span: 40 });
      }
      runShow(rig, washes, f, { house: V3(0, 0, OZ + 8), stage: C, span: 14, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 30, OZ), stage: C, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      follows.forEach((l, i) => { l.intensity = (i ? 9000 : 16000) * show; });
      stageWash.color.copy(f.pal.a); stageWash.intensity = (4000 + 5000 * f.energy + 2500 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i % 2 ? f.pal.b : f.pal.a); l.intensity = (120 + 300 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 9000 * f.house; });
      houseFix.forEach((h) => { h.intensity = 1.5 * f.house; });
      ringTint(ringM.color, f.pal.a).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.22 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 10, OZ);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.2 * f.house);
      flashOnCrowd(cu.uWash.value, runBlinders(blinders, f), runStrobes(strobes, f));
      cu.uAmb.value.setRGB(0.004, 0.004, 0.006).multiplyScalar(1 + f.house * 8);
    },
  };
}
