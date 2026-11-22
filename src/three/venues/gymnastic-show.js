// gymnastic-show.js — KSPO DOME's concerts on the shared production kit
// (concert-production.js): its decks, LED trims, screens, line arrays, fixture
// bodies, blinders, strobes, the deck's own lights, the equipment plot and the
// FOH. The room's own part is its rig, here: the end stage's trusses, IMAG and
// PA under the dome's roof (General), or DAY6's black grid over the round deck
// with its screens turned four ways (360); and the 360's console deck over
// section 19, with the console trimmed of its camera deck and the FOH camera
// on the landing above it.
import * as THREE from 'three';
import { KELVIN, V3, lerp, std } from '../core.js';
import { chainInto, hoists, mats } from '../rig.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floorChairs, packFloor, screenHang } from '../show.js';
import { concertProduction, showBeam } from '../concert-production.js';
import { trimmedModel } from '../concert-models.js';
import { AXES } from '../stage-plan.js';
import {
  GYM_CENTER_R, GYM_CONSOLE_DECK, GYM_FLOOR_R, GYM_FOH, GYM_PA, GYM_RAD, GYM_STANDING, gymPoint, gymStagePlan,
} from '../gymnastic-arena-plan.js';
import { gymEquipment } from './gymnastic-equipment.js';
import { gymMask } from './gymnastic-seats.js';

const ROOF = 27.4;

// The ribbon boards round the bowl the concert photographs show (the tour's
// name on them in 2025): small LED strips at the 3F concourse's rail, the
// song's sleeve and title on them here.
function ribbons(k, angles) {
  for (const deg of angles) {
    const [x, z] = gymPoint(deg, 60.55);
    k.screen({ x, z, bottom: 12.95, w: 6.2, h: 1.05, yaw: -deg * GYM_RAD, bright: 1.4 });
  }
}

function generalRig(k) {
  const { production, L, center, row, bar, screen, hang, drape } = k;
  const r = L.w / 2, [mainW, mainH, bottom] = L.wall;
  screen({ z: L.wallZ, bottom, w: mainW, h: mainH, bright: 1.65, light: true });
  screenHang(production, { y: bottom + mainH, z: L.wallZ, w: mainW, topY: ROOF, size: .7, n: 5 });
  // the IMAG columns either side, portrait, turned in to the house
  const wings = { x: 25.4, z: -15.2, bottom: 4.9, w: 7.4, h: 9.9, yaw: .3 };
  for (const side of [-1, 1]) {
    screen({ ...wings, x: side * wings.x, yaw: side * wings.yaw });
    screenHang(production, { x: side * wings.x, y: wings.bottom + wings.h, z: wings.z, w: wings.w, yaw: side * wings.yaw, topY: ROOF, size: .48, n: 3 });
  }
  // three trusses over the deck: washes upstage over the band, beams in the
  // middle, spots downstage; a par line on the front one
  const fy = L.rig - .35;
  const trussZ = [L.wallZ - .45, lerp(L.back, L.front, .58), L.front - .8];
  trussZ.forEach((z, i) => {
    showBeam(production, V3(-r, fy, z), V3(r, fy, z), .7);
    production.add(hoists([-r + 2, -r * .36, r * .36, r - 2], fy, z, ROOF));
    row(V3(-r + 1, fy - .35, z), V3(r - 1, fy - .35, z), 12 + i * 2, ['wash', 'beam', 'spot'][i], 0, center);
    bar(V3(-r + .8, fy - .25, z + .38), V3(r - .8, fy - .25, z + .38), .09);
  });
  row(V3(-r + 2, fy - .36, L.front - .64), V3(r - 2, fy - .36, L.front - .64), 10, 'par', 0, center, { gain: .12, lift: .72 });
  // the fans: a truss each side, from over the deck's corner out and down
  // over the side stands, its beams for the 1F and 2F sides
  for (const side of [-1, 1]) {
    for (const [z0, z1, drop] of [[-21.5, -9.5, 2.4], [-18.0, -3.5, 3.6]]) {
      const a = V3(side * (r - 3), fy + .2, z0), b = V3(side * (r + 7.5), fy - drop, z1);
      showBeam(production, a, b, .52);
      production.add(hoists([a.x], a.y, a.z, ROOF), hoists([b.x], b.y, b.z, ROOF));
      row(a.clone().lerp(b, .08).add(V3(0, -.32, 0)), a.clone().lerp(b, .95).add(V3(0, -.32, 0)), 7, 'beam', side * Math.PI / 2, center, { gain: .5 });
      bar(a.clone().add(V3(0, -.24, .3)), b.clone().add(V3(0, -.24, .3)), .08);
    }
  }
  // over the runway a spine of washes, over the T's walkway its own truss of spots
  const tz = L.cross + L.crossD / 2;
  showBeam(production, V3(0, fy - .55, L.front + .4), V3(0, fy - .55, L.cross - .6), .52);
  production.add(hoists([0], fy - .55, L.front + 2, ROOF), hoists([0], fy - .55, L.cross - 2, ROOF));
  row(V3(0, fy - .9, L.front + 1.5), V3(0, fy - .9, L.cross - 1.5), 6, 'wash', 0, V3(0, L.runway, (L.front + L.cross) / 2), { gain: .3 });
  showBeam(production, V3(-L.wing - 1.5, fy - .6, tz), V3(L.wing + 1.5, fy - .6, tz), .6);
  production.add(hoists([-L.wing, 0, L.wing], fy - .6, tz, ROOF));
  row(V3(-L.wing, fy - .95, tz), V3(L.wing, fy - .95, tz), 10, 'spot', 0, V3(0, L.runway, tz));
  bar(V3(-L.wing - 1.2, fy - .85, tz + .4), V3(L.wing + 1.2, fy - .85, tz + .4), .09);
  // the PA: the mains off the downstage corners, the flown subs behind them,
  // the side hangs to the 1F/2F sides, a delay pair over the floor's back
  for (const [i, { x, z, top, yaw }] of GYM_PA.general.entries()) {
    const name = i < 2 ? 'Main line array' : i < 4 ? 'Side fill' : 'Rear delay hang';
    hang(production, { x, y: top, z, boxes: i < 2 ? 16 : i < 4 ? 13 : 9, width: i < 2 ? 1.23 : 1.1, yaw, roofY: ROOF }, name);
  }
  for (const side of [-1, 1]) {
    hang(production, { x: side * 21.9, y: L.rig - 1.1, z: -16.4, boxes: 8, depth: 1.04, roofY: ROOF, splay: .006 }, 'Flown subwoofer array');
  }
  // the masking behind the deck, round to the stands' fronts
  const curtain = [[-59, gymMask(-59)], [-19, gymMask(-19)], [19, gymMask(19)], [59, gymMask(59)]];
  for (let i = 1; i < curtain.length; i++) {
    drape({
      a: curtain[i - 1], b: curtain[i], top: 17.5, matte: true,
      bottomAt: (x, z) => {
        const rr = Math.hypot(x, z);
        return rr >= 44.4 ? Math.min(10.6, 4.85 + (rr - 44.4) * .42) : rr >= 33 ? Math.min(4.76, 2.6 + (rr - 33) * .22) : 0;
      },
    });
  }
  // (the ribbons last: the room's reflections take the first screens, the big ones)
  ribbons(k, [70, 125, 180, 235, 290]);
  return V3(0, L.runway + .55, L.tip - 2.4);
}

// DAY6's rig as the May 2025 photographs show it: a big black grid of truss
// over the floor, a four-faced LED box hung under its middle (one picture on
// all four sides), a line array at each of the box's corners splayed two
// ways, a column of fixtures down through the box's middle, the grid's edges
// and lines full of fixtures.
function roundRig(k) {
  const { production, L, center, row, bar, screen, hang } = k;
  const top = L.rig, e = 15.5, lines = [-e, -e * 2 / 3, -e / 3, 0, e / 3, e * 2 / 3, e];
  for (const v of lines) {
    showBeam(production, V3(v, top, -e), V3(v, top, e), .6);
    showBeam(production, V3(-e, top, v), V3(e, top, v), .6);
  }
  for (const x of [-e, -e / 3, e / 3, e]) production.add(hoists([-e, -e / 3, e / 3, e], top + .1, x, ROOF));
  // the box: four faces, its bottom over the deck at the height the photographs show
  const [bw, bh, bottom] = L.wall;
  for (const yaw of AXES) {
    screen({ x: Math.sin(yaw) * (bw / 2 + .25), z: Math.cos(yaw) * (bw / 2 + .25), bottom, w: bw, h: bh, yaw, bright: 1.6, light: true });
  }
  const chains = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chainInto(chains, sx * (bw / 2 - .6), bottom + bh, sz * (bw / 2 - .6), top - .2, { motor: false });
  production.add(new THREE.Mesh(mergeGeometries(chains), mats().chain));
  for (const yaw of AXES) {
    const along = (d, across) => V3(Math.sin(yaw) * d + Math.cos(yaw) * across, 0, Math.cos(yaw) * d - Math.sin(yaw) * across);
    // the grid's edge: beams out to the house, an LED bar under them
    row(along(e, -e + 1.2).setY(top - .4), along(e, e - 1.2).setY(top - .4), 11, 'beam', yaw, center);
    bar(along(e + .38, -e).setY(top - .25), along(e + .38, e).setY(top - .25), .09);
    // the lines in from it: spots on the deck, washes nearer the middle
    row(along(e * 2 / 3, -e * 2 / 3).setY(top - .4), along(e * 2 / 3, e * 2 / 3).setY(top - .4), 9, 'spot', yaw, center);
    row(along(e / 3, -e / 3).setY(top - .4), along(e / 3, e / 3).setY(top - .4), 6, 'wash', yaw, center, { gain: .3 });
  }
  // the column of fixtures down through the box
  row(V3(0, top - .6, 0), V3(0, bottom + bh + .4, 0), 7, 'beam', 0, center, { gain: .5 });
  for (const [i, { x, z, top: y, yaw }] of GYM_PA['360'].entries()) {
    hang(production, { x, y, z, boxes: 12, width: 1.2, yaw, roofY: top - .1 }, i % 2 ? 'Main sector array' : 'Side sector array');
  }
  // the deck's side white (a fascia round it, its LED trim on the lip above)
  const fascia = new THREE.Mesh(new THREE.CylinderGeometry(GYM_CENTER_R + .012, GYM_CENTER_R + .012, L.deck - .12, 96, 1, true),
    std({ color: 0xe9ecef, roughness: .82, metalness: .05 }));
  fascia.position.y = (L.deck - .12) / 2 + .02;
  fascia.name = 'Round deck fascia';
  fascia.userData.noCollide = true;
  production.add(fascia);
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(L.riser[0] + .01, L.riser[0] + .01, L.riser[1] - .04, 64, 1, true),
    std({ color: 0xf1f3f5, roughness: .82, metalness: .05 }));
  riser.position.y = L.deck + (L.riser[1] - .04) / 2;
  riser.name = 'Drum riser fascia';
  riser.userData.noCollide = true;
  production.add(riser);
  // the drums' clear shields, a half ring on the riser's back
  const shields = std({ color: 0x9dbed8, transparent: true, opacity: .16, roughness: .1, side: THREE.DoubleSide, depthWrite: false });
  for (const deg of [150, 172, 194, 216]) {
    const [x, z] = gymPoint(deg, 1.95);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(.66, 1.25, .016), shields);
    panel.position.set(x, L.deck + L.riser[1] + .64, z);
    panel.rotation.y = -deg * GYM_RAD;
    panel.userData.noCollide = true;
    production.add(panel);
  }
  ribbons(k, [20, 85, 150, 215, 280, 340]);
  return center;
}

// The scaffold under the 360 console: a deck over section 19's rows, black
// cloth round its open sides, a rail on its edges, a flight up from the aisle.
function consoleDeck(root) {
  const { r0, r1, half, top } = GYM_CONSOLE_DECK;
  const [fx, , fz] = GYM_FOH['360'];
  const g = new THREE.Group();
  g.name = 'Console scaffold';
  const depth = r1 - r0, mid = -(r0 + r1) / 2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(half * 2, .12, depth), std({ color: 0x1b1c1e, roughness: .9 }));
  deck.position.set(fx, top - .06, mid);
  deck.receiveShadow = true;
  const cloth = std({ color: 0x030303, roughness: 1, side: THREE.DoubleSide });
  const skirt = (w, h, x, y, z, yaw) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cloth);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.userData.noCollide = true;
    g.add(m);
  };
  // the front: from the row under it up to the deck; the sides, raked with the rows
  skirt(half * 2, top - 2.95, fx, (top + 2.95) / 2 - .06, -r0, 0);
  for (const s of [-1, 1]) {
    const h0 = top - 2.95, h1 = .25;
    const shape = new THREE.Shape([new THREE.Vector2(-depth / 2, -h0 / 2), new THREE.Vector2(depth / 2, h1 - h0 / 2), new THREE.Vector2(depth / 2, h0 / 2), new THREE.Vector2(-depth / 2, h0 / 2)]);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), cloth);
    m.position.set(fx + s * half, (top + 2.95) / 2 - .06, mid);
    m.rotation.y = -s * Math.PI / 2;
    m.userData.noCollide = true;
    g.add(m);
  }
  const rail = std({ color: 0x2c2e31, roughness: .82, metalness: .4 });
  const bar = (w, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, .045, d), rail);
    m.position.set(x, y, z);
    m.userData.noCollide = true;
    g.add(m);
  };
  for (const y of [top + .5, top + 1.0]) {
    bar(half * 2, .045, fx, y, -r0 + .03);
    for (const s of [-1, 1]) bar(.045, depth, fx + s * (half - .03), y, mid);
  }
  for (let i = 0; i <= 8; i++) bar(.045, .045, fx - half + .03 + i * (half * 2 - .06) / 8, top + .52, -r0 + .03);
  g.add(deck);
  root.add(g);
}

export function buildGymnasticShow(ctx, root, eye, stands, floor, houseUpdate = null) {
  const mode = ctx.mode, round = mode === '360';
  const data = gymEquipment(mode);
  const models = ctx.concertModels;
  if (models && round) {
    // the console without its camera deck: the deck, its posts and its stair
    // over the console's own floor (the 0.81 m lower deck's landing stays)
    trimmedModel(models, 'foh', 'foh-console', (a, b, c) => {
      const y = Math.max(a.y, b.y, c.y), cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
      return y > 2.45 || (cx > 3.35 && cz > -1.62 && y > .95);
    });
  }
  if (round) consoleDeck(root);
  const center = V3(0, gymStagePlan(mode).L.deck, round ? 0 : -17);
  const onFloor = (x, z) => Math.hypot(x, z) < GYM_FLOOR_R - 1.2;
  // the house lights' banks on the roof's trusses: an inner ring for the
  // floor and the 1F rows, an outer one for the 2F rake
  const houseSources = [
    // (the inner ring at less of the power: the floor is near it; the outer
    // ring twelve, each modest, so no one hangs a hot spot on the rake under it)
    ...Array.from({ length: 6 }, (_, i) => { const [x, z] = gymPoint(i * 60 + 30, 18); return Object.assign(V3(x, 25.6, z), { k: .4 }); }),
    ...Array.from({ length: 12 }, (_, i) => { const [x, z] = gymPoint(i * 30, 40); return V3(x, 23.4, z); }),
  ];
  const floorOf = (keep) => {
    if (!round) {
      root.add(floorChairs(floor.positions.map((s) => ({ x: s.x, y: 0, z: s.z, turn: s.yaw ?? Math.PI }))));
      return floor.people;
    }
    return packFloor({
      x0: -32, z0: -32, x1: 32, z1: 32, spacing: .62, seed: 38,
      inside: (x, z) => {
        const rr = Math.hypot(x, z);
        if (rr > GYM_FLOOR_R - 2.45 || rr < GYM_CENTER_R + 3.2 || !keep(x, z)) return false;
        const angle = (Math.atan2(x, -z) / GYM_RAD + 360) % 360;
        return GYM_STANDING.some(([a, b]) => angle > a + 2.9 && angle < b - 2.9);
      },
    });
  };
  const show = concertProduction(ctx, root, 'gymnastic-arena', {
    center, eye, stands, ceiling: ROOF, onFloor,
    floorBounds: { x0: -GYM_FLOOR_R, x1: GYM_FLOOR_R, z0: -GYM_FLOOR_R, z1: GYM_FLOOR_R },
    houseSources, houseUpdate,
    // (the inner ring straight down on the floor, the outer out on the rake)
    houseTarget: (p) => (Math.hypot(p.x, p.z) > 30 ? V3(p.x * 1.32, 6.5, p.z * 1.32) : V3(p.x * .55, 0, p.z * .55)),
    fill: { sky: KELVIN(4600).multiplyScalar(.5), ground: new THREE.Color(0x2a2826) }, masking: [],
    rigOf: round ? roundRig : generalRig, floorOf, equipmentData: data,
  });
  // (the house lights through the haze: a glow, not a white-out; the haze
  // is thinned with them up, but these hang right over the rows)
  root.traverse((o) => { if (o.isLight && o.userData.offWhenDark === 'house') o.userData.fogGain = .08; });
  // the decks' tops without the grid texture's roughness map: under it the
  // screen-space reflections traced the panels' grain and sparkled
  root.traverse((o) => {
    if (!o.isMesh || !Array.isArray(o.material) || !o.geometry?.type?.startsWith('Extrude')) return;
    const top = o.material[0];
    if (top?.roughnessMap) { top.roughnessMap = null; top.roughness = .86; top.needsUpdate = true; }
  });
  return show;
}
