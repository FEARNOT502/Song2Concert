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
import { APP, KELVIN, V3, concreteTex, std, withRepeat } from '../core.js';
import { lightPoints } from '../people.js';
import { ampStack, drumKit, guitar, hoists, keyboardRig, micStand, shadowSpot, stageDeck, stageSteps, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, blockGrid, crossThrust, floorBlocks, floorChairs, fixtureRow, flashOnCrowd, flashUnits, fohPosition, fromRow, laser, laserUnits, maskingDrapes, paHang, runBlinders, runLasers, runShow, runStrobes, screenHang, stageSet, subLine, thinRow } from '../show.js';
import { buildStands } from '../stands.js';
import { SSA_STANDS } from './ssa-data.js';

export function buildArena(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const H = 30;                        // the movable ceiling, lowered for arena mode
  const DECK = 2.2, RIG = 20;
  // FOH, and the listener there: at the back of the floor's seats
  const eye = V3(0, 1.6 + 0.9, 81.4);
  // the stage set 6 m out from the end, the masking brought forward with it
  const SZ = 6;
  const STAGE = V3(0, DECK, 8 + SZ);
  // the masking's line: across behind the set, then angled forward past the
  // corners' blocks to the sides' fronts, and on across the sides to the walls
  const MZ = 2.2 + SZ, MX = 16, SX = 31, SZF = 15;
  const maskZ = (x) => { const a = Math.abs(x); return a <= MX ? MZ : a >= SX ? SZF : MZ + (SZF - MZ) * (a - MX) / (SX - MX); };

  // ── the stands, from the official seat map ──
  // Arena mode, end stage 2 (the layout nearly every concert uses): the floor
  // 51 × 82 m between the 200 level's front rows, the stage at its north end.
  // The 200 level all round (32 rows down the sides, 19 at the ends, fans at
  // the corners, the tunnels in from the concourse at rows 18–27 of the
  // sides); the 300 level's three-row balconies round the ends; the 400 level
  // — its great crescents down the sides, 24 rows at the middle and under ten
  // at the ends where the wall curves in, and five-row balconies round the
  // ends; the 500 level's three rows over them. The centre of the north end
  // 200 level is where the stage and backstage stand.
  const OZ = 45;                       // the floor's centre, in this room's coordinates
  const stands = buildStands(SSA_STANDS, {
    offset: V3(0, 0, OZ), stage: STAGE, seed: 200, concreteTone: 0.2, roofY: H,
    seatColors: { 200: 0x1c1d22, 300: 0xc8341e, 400: 0x1c1d22, 500: 0x1c1d22, '300S': 0x2a1d17 },
    // the 300 level, the VIP balcony: red seats in boxes behind a dark mesh
    // front; the suites' balconies behind glass
    materials: { levelRail: {
      300: std({ color: 0x141518, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
      '300S': new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    } },
    crowd: !!q.crowd,
    // nobody behind the masking
    sold: (x, z) => z > maskZ(x) + 0.8,
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
    const g = [], glassG = [], lit = [], ox = 0, oz = OZ;
    const box = (out, x0, x1, y0, y1, z0, z1) => { const b = new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0)); b.translate((x0 + x1) / 2 + ox, (y0 + y1) / 2, (z0 + z1) / 2 + oz); out.push(b.toNonIndexed()); };
    const z0 = SU.boxes[0][0], z1 = SU.boxes[SU.boxes.length - 1][1];
    const zc = SU.boxes.map((b) => (b[0] + b[1]) / 2);       // each room's door, at its middle
    const dw = SU.doorW / 2, dh = SU.doorH;
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
    // the glass fronts (a door to each balcony), their mullions, the lit back wall of each room, the corridor's lamps
    wall(glassG, SU.xg - 0.02, SU.xg + 0.02, SU.y, SU.yc, SU.y);
    for (const [za, zb, n] of SU.boxes) {
      const c = (za + zb) / 2, m = n > 8 ? 4 : 3;
      for (let k = 1; k < m; k++) {
        const zz = za + (zb - za) * k / m;
        if (Math.abs(zz - c) < dw + 0.15) continue;
        box(g, SU.xg - 0.06, SU.xg + 0.06, SU.y, SU.yc, zz - 0.04, zz + 0.04);
      }
      box(lit, SU.xr + 0.02, SU.xr + 0.06, SU.y + 0.4, SU.yc - 0.3, za + 0.3, c - dw - 0.2);
      box(lit, SU.xr + 0.02, SU.xr + 0.06, SU.y + 0.4, SU.yc - 0.3, c + dw + 0.2, zb - 0.3);
    }
    for (let z = z0 + 3; z < z1 - 2; z += 6) box(lit, SU.xc0 + 0.5, SU.xc1 - 0.5, SU.yc - 0.04, SU.yc, z - 0.6, z + 0.6);
    for (const c of zc) box(lit, SU.xc1 - 0.05, SU.xc1, SU.y + dh + 0.1, SU.y + dh + 0.3, c - dw, c + dw);   // a lit panel over each room's door
    root.add(new THREE.Mesh(mergeGeometries(g), std({ color: 0x2c2d31, roughness: 0.7 })));
    root.add(new THREE.Mesh(mergeGeometries(glassG), new THREE.MeshPhysicalMaterial({ color: 0x3e4c55, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })));
    root.add(new THREE.Mesh(mergeGeometries(lit), std({ color: 0x1a1612, emissive: 0xc79a6a, emissiveIntensity: 0.35 })));
  }

  // ── the building: floor, roof and its steel ──
  const X0 = -76, X1 = 76, Z0 = OZ - 70, Z1 = OZ + 70;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), std({ ...withRepeat(concreteTex({ key: 'arenafloor', tone: 0.1 }), (X1 - X0) / 4, (Z1 - Z0) / 4), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true;
  root.add(floor);
  // The ceiling: the arena's movable one, lowered for arena mode to about
  // 30 m over the floor (43 m in stadium mode). It is in panels, each raised
  // and lowered on its own, with the hooks the shows rig from along the seams
  // between them; the dark void over the seams, the downlights in the panels.
  const roofPlane = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), std({ color: 0x08080a, roughness: 0.95, side: THREE.DoubleSide }));
  roofPlane.rotation.x = Math.PI / 2; roofPlane.position.set(0, H + 3, (Z0 + Z1) / 2); root.add(roofPlane);
  const roofParts = [], hooks = [];
  const PX = 8, PZ = 8, GAP = 0.8;
  for (let i = 0; i < PX; i++) for (let j = 0; j < PZ; j++) {
    const x0 = X0 + (X1 - X0) * i / PX, x1 = X0 + (X1 - X0) * (i + 1) / PX, z0 = Z0 + (Z1 - Z0) * j / PZ, z1 = Z0 + (Z1 - Z0) * (j + 1) / PZ;
    const b = new THREE.BoxGeometry(x1 - x0 - GAP, 0.5, z1 - z0 - GAP); b.translate((x0 + x1) / 2, H + 0.25, (z0 + z1) / 2); roofParts.push(b.toNonIndexed());
  }
  for (let i = 1; i < PX; i++) for (let j = 0; j <= PZ * 3; j++) {
    const x = X0 + (X1 - X0) * i / PX, z = Z0 + (Z1 - Z0) * j / (PZ * 3);
    const b = new THREE.BoxGeometry(0.25, 0.7, 0.25); b.translate(x, H - 0.1, z); hooks.push(b.toNonIndexed());
  }
  root.add(new THREE.Mesh(mergeGeometries(roofParts), std({ color: 0x1a1b1f, roughness: 0.85 })));
  root.add(new THREE.Mesh(mergeGeometries(hooks), std({ color: 0x2a2c32, metalness: 0.6, roughness: 0.5 })));
  // the downlights in the ceiling's panels, in rows over the floor and stands
  const houseFix = [];
  for (let z = Z0 + 8; z <= Z1 - 6; z += 9) for (let x = -63; x <= 63; x += 9) {
    houseFix.push(pipe.flares.add(V3(x, H - 0.05, z), KELVIN(4200), 0.9, 0));
  }
  // the set stands on the deck; the building's stands carry on round it
  stageSet(root, { w: 30, h: 17, z: 1.8 + SZ, deck: DECK, towerX: 15.8, backdropW: 32, backdropH: 16, wingX: 18.5, wingW: 6, wingH: 11 });
  // masking across the building behind the stage, wall to wall and floor to
  // the ceiling, over the set's own backdrop in the middle, angled forward
  // either side to the sides' fronts: the end stands and the corners' blocks
  // behind it are out of sight
  const mline = [[-76, SZF], [-SX, SZF], [-MX, MZ], [MX, MZ], [SX, SZF], [76, SZF]];
  for (let i = 0; i + 1 < mline.length; i++) maskingDrapes(root, { a: mline[i], b: mline[i + 1], top: H,
    bottomAt: (x, z) => (Math.abs(x) < 16 ? DECK + 16 : stands.topAt(x, z)) });

  // ── stage ──
  const deck = stageDeck({ w: 34, d: 15, h: DECK, z: 8.5 + SZ });
  root.add(deck);
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 17.75, z: 16 + SZ, h: DECK, dir: [0, -1] }));
  // the runway out to a cross on the floor: a walkway either side two-thirds
  // of the way, the runway on past it to a square end stage in the middle
  const RW0 = 16 + SZ, RW1 = 52, CZ = 38;
  const cross = crossThrust(root, { z0: RW0, z1: RW1, w: 3.6, crossZ: CZ, crossD: 3.6, crossW: 12, tip: 6, h: DECK });
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
  const keysL = keyboardRig(); keysL.position.set(-4, DECK + 1, 4.6 + SZ); root.add(keysL);
  const kit = drumKit({ shell: 0x1a1a1e }); kit.position.set(0, DECK + 1, 3.6 + SZ); kit.scale.setScalar(1.1); root.add(kit);
  for (const x of [-12, 12]) { const a = ampStack({ count: 2 }); a.position.set(x, DECK, 4.5 + SZ); root.add(a); }
  for (let i = 0; i < 8; i++) { const w = wedge(); w.position.set(-10.5 + i * 3, DECK, 15.4 + SZ); w.rotation.y = Math.PI; root.add(w); }
  const mic = micStand({ height: 1.5 }); mic.position.set(0.05, DECK, 13.6 + SZ); root.add(mic);
  // the subs in a row on the floor under the barrier, the front fills on the lip
  subLine(root, { x0: -15.2, x1: 15.2, z: RW0 + 0.9, gap: 2.4, count: 2, fills: { xs: [-15, -10, -5, 5, 10, 15], y: DECK, z: RW0 - 0.35 } });

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  const trussZ = [3.2 + SZ, 9.2 + SZ, 15.2 + SZ];
  for (const z of trussZ) { const t = truss(36, { size: 0.76, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-16, -6, 6, 16], RIG, z, H)); }
  // the PA flown from the roof: the mains just outside the wall, toed in a
  // little; the side hangs turned out to the side stands; the 270 hangs
  // further round, at the stands beside and behind the stage's corners; the
  // flown subs behind the mains; and a pair of delay hangs over the middle of
  // the floor for the far end and the 400 level, as the big arena shows hang
  const pa = [];
  for (const side of [-1, 1]) {
    pa.push(paHang(root, { x: side * 17.6, y: RIG - 0.6, z: 16.5 + SZ, boxes: 16, yaw: -side * 0.06, roofY: H }));
    paHang(root, { x: side * 15.6, y: RIG - 0.6, z: 15.4 + SZ, boxes: 8, depth: 1.0, splay: 0.008, roofY: H });
    paHang(root, { x: side * 29.5, y: RIG - 1.0, z: 12 + SZ, boxes: 14, width: 1.2, yaw: side * 0.5, roofY: H });
    paHang(root, { x: side * 33.5, y: RIG - 1.4, z: 15 + SZ, boxes: 10, width: 1.1, yaw: side * 1.2, roofY: H });
    paHang(root, { x: side * 13, y: RIG - 3, z: 56, boxes: 8, width: 1.1, yaw: side * 0.06, roofY: H, splay: 0.03 });
  }
  const spots = [], beams = [], washes = [], ups = [], lasers = [];
  spots.push(...fixtureRow(q, 12, (i) => ({ fx: rig.add({ kind: 'spot', pos: V3(-15.5 + i * (31 / 11), RIG - 0.5, 15.2 + SZ), length: 45, angle: 0.085, beamGain: 1.0 }), group: 0 })));
  beams.push(...fixtureRow(q, 12, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-15.5 + i * (31 / 11), RIG - 0.5, 9.2 + SZ), length: 60, beamGain: 1.2 }), group: 1 })));
  washes.push(...fixtureRow(q, 10, (i) => ({ fx: rig.add({ kind: 'wash', pos: V3(-15 + i * (30 / 9), RIG - 0.5, 3.2 + SZ), length: 22, beamGain: 0.5 }), group: 2 })));
  ups.push(...fixtureRow(q, 10, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-15 + i * (30 / 9), DECK, 15.6 + SZ), hang: 'up', length: 50, beamGain: 1.0 }), group: 3 })));
  // lasers: four on the deck's lip, two hung under the front truss
  const TB = RIG - 0.38;                       // the trusses' bottom chord
  lasers.push(...fixtureRow(q, 4, (i) => laser(rig, V3(-6 + i * 4, DECK + 0.12, 15.8 + SZ), V3(0, 0.2, 1), { length: 90, gain: 6, minSlope: 0.16 })));
  for (const x of [-5.64, 5.64]) lasers.push(laser(rig, V3(x, TB - 0.12, 15.2 + SZ + 0.2), V3(x * 0.05, -0.1, 1), { length: 90, gain: 6, minSlope: -0.15, hung: true }));
  laserUnits(root, lasers);
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
  stageWash.position.set(0, RIG - 1, 2 + SZ); stageWash.target.position.set(0, DECK, 12 + SZ);
  for (const l of [front1, front2, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-20, 18, 30], [20, 18, 30], [0, 24, 60]]) { const l = new THREE.PointLight(0xffffff, 0, 90, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  // the house lights: the ceiling's downlights, shining down, not onto it
  for (const [x, z] of [[-24, 20], [24, 20], [-24, 60], [24, 60], [0, 40], [0, 80]]) {
    const l = new THREE.SpotLight(KELVIN(4200), 0, 140, 1.4, 0.3, 2); l.position.set(x, H - 0.6, z); l.target.position.set(x, 0, z);
    root.add(l, l.target); house.push(l);
  }
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
  const keep = (x, z) => Math.abs(x) < 29.2 && z < OZ + 39.5 && !cross.inside(x, z, 1.4) && !(Math.abs(x - eye.x) < 4.6 && Math.abs(z - eye.z) < 4.2) && clear(x, z);
  const floorSeats = floorBlocks(blockGrid(
    [[19.5 + SZ, 29.4], [31.0, 41.8], [43.4, 54.2], [55.8, 66.6], [68.2, 79.0], [80.6, 84.8]],
    [[-29.2, -14.9], [-13.5, -1.0], [1.0, 13.5], [14.9, 29.2]],
  ), { keep, seed: 3 });
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
  const hzWash = [hz.add(V3(-10, RIG - 1, 10 + SZ), 0xffffff, 0), hz.add(V3(10, RIG - 1, 10 + SZ), 0xffffff, 0), hz.add(V3(0, DECK + 3, 12 + SZ), 0xffffff, 0)];

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
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 42), stage: STAGE, span: 34 });
      runShow(rig, beams, f, { house: V3(0, 12, 60), stage: STAGE, span: 44 });
      runShow(rig, washes, f, { house: V3(0, 0, 18 + SZ), stage: STAGE, span: 20, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 30, 40), stage: STAGE, up: true });
      runLasers(lasers, f);
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      front1.intensity = 26000 * show + 4000 * f.house;
      front2.intensity = 9000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (5000 + 6000 * f.energy + 3000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (120 + 300 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 9000 * f.house; });
      houseFix.forEach((h) => { h.intensity = 1.5 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h, i) => { h.power = (i < 2 ? 260 : 120) * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.22 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 10, 4 + SZ);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.2 * f.house);
      flashOnCrowd(cu.uWash.value, runBlinders(blinders, f), runStrobes(strobes, f));
      cu.uAmb.value.setRGB(0.004, 0.004, 0.006).multiplyScalar(1 + f.house * 8);
    },
  };
}
