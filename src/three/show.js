// ─────────────────────────────────────────────────────────────────────────────
// the show: what a big-room rig does across a song
//
// The simulated track has a shape — verse, pre-chorus, chorus, break — and so
// does the lighting: slow fans in the verse, beams stabbing out over the house
// in the pre, everything moving and flashing on the kick in the chorus, a few
// low washes in the break. Colours come from the palette (the app's by
// default, the sleeve's when asked).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V3, glowMat, prng, std, thin, velvet } from './core.js';
import { crowdLights, silhouettes, withCells } from './people.js';
import { chainInto, drapeGeometry, latticeInto, ledScreen, lineArray, mats, seatField, stageDeck, truss } from './rig.js';

// The simulated song's shape: verse, pre-chorus, chorus, break over 24 bars.
// A real track brings its own (`f.sec`, from the beat follower).
export function section(bar) {
  const b = ((bar % 24) + 24) % 24;
  return b < 8 ? 'verse' : b < 12 ? 'pre' : b < 20 ? 'chorus' : 'break';
}

// A song's look, as a lighting designer builds one per song: which colours go
// where, how the movers move, how fast, and what the chorus hits with. `f.look`
// is fixed per song by the stage (the big rooms only); without one, the rig
// plays the house style it always has.
//   col   0 one colour over all, the second only as an accent
//         1 two colours traded fixture by fixture
//         2 white beams, the colour in the washes
//         3 the palette spread across the rig (the house style)
//   move  0 fans out over the house (the house style)
//         1 crossing: each side aims across to the other
//         2 sweeping: the whole rig tilts across the room together
//         3 ballyhoo: every head circling its own spot
//   pace  how fast the moves run against the beat (0.6, 1, 1.5)
//   hit   0 white strobe, 1 a colour bump, 2 the blinders (on the rig)
export const HOUSE_LOOK = { col: 3, move: 0, pace: 1, hit: 0 };

// fixtures: [{ fx, i, n, group }]. `house` is a point out in the room the rig
// throws toward (the crowd centre); `stage` the performer area.
// an index round a list that holds for a negative count too (the clock can
// start a little before zero)
export const wrap = (k, n) => ((k % n) + n) % n;
const WHITE = new THREE.Color(1, 1, 1);
export function runShow(rig, list, f, { house, stage, span = 30, up = false, strobe = true, lift = 1 }) {
  const sec = f.sec || section(f.bar);
  const show = 1 - f.house;
  const cols = [f.pal.a, f.pal.b, f.pal.c, f.pal.d];
  const L = f.look || HOUSE_LOOK;
  const t = f.t * L.pace;
  const secT = f.secT ?? 10;
  const tgt = V3();
  // the colour a fixture takes in this look; `k` turns it over with the music
  const colour = (it, k, beam) => {
    const { i } = it;
    if (L.col === 0) return (i + k) % 5 === 0 ? cols[1] : cols[0];
    if (L.col === 1) return cols[wrap(i + k, 2)];
    if (L.col === 2) return beam ? WHITE : cols[wrap(i + k, 2)];
    return null;
  };
  for (const it of list) {
    const { fx, i, n } = it;
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;   // -0.5 .. 0.5 across the truss
    const ph = i * 0.61 + (it.group || 0) * 1.7;
    const beam = fx.kind === 'beam' || fx.kind === 'spot';
    let lvl = 0, col = cols[0];
    if (up) {
      // floor fixtures: beams up and out into the room
      const swing = sec === 'chorus' ? 0.55 : sec === 'pre' ? 0.35 : 0.2;
      const sway = L.move === 2 ? Math.sin(t * (sec === 'chorus' ? 1.6 : 0.5)) * swing * 1.4 : Math.sin(t * (sec === 'chorus' ? 1.6 : 0.5) + ph) * swing;
      const lean = L.move === 1 ? -u * 1.4 : u * 1.2;
      fx.dir.set(lean + sway, 1, (sec === 'break' ? 0.1 : 0.35) + 0.2 * Math.cos(t * 0.7 + ph)).normalize();
      lvl = sec === 'break' ? 0.1 : sec === 'verse' ? 0.35 : 0.6 + 0.4 * f.kick;
      col = cols[wrap(i + (sec === 'chorus' ? Math.floor(f.beat / 2) : 0), 2)];
    } else if (sec === 'verse') {
      // a few heads on the stage, slow; the rest dark, so the chorus has
      // somewhere to go
      tgt.set(stage.x + u * span * 0.5 + Math.sin(t * 0.35 + ph) * 3, 0, stage.z + 6 + Math.cos(t * 0.3 + ph) * 4);
      lvl = (f.look && i % 2) ? 0 : 0.5 + 0.15 * f.energy;
      col = cols[it.group % 2 ? 3 : 0];
    } else if (sec === 'pre') {
      // the build: brighter and quicker as the section runs on
      const build = f.look ? 0.55 + 0.45 * Math.min(1, secT / 12) : 1;
      const k = Math.sin(t * 0.9 * (0.7 + 0.6 * build) + ph);
      tgt.set(house.x + u * span * 1.4 + k * 4, house.y, house.z - 10 + Math.cos(t * 0.6 + ph) * 12);
      lvl = (0.55 + 0.35 * (wrap(f.beat, 2) === (i % 2) ? f.kick : 0.2)) * build;
      col = cols[(i % 2) ? 1 : 0];
    } else if (sec === 'chorus') {
      const a = t * 1.25 + ph;
      if (L.move === 1) {
        // crossing: each half of the rig throws to the far side of the house
        tgt.set(house.x - Math.sign(u || 1) * span * (0.5 + 0.3 * Math.sin(a * 0.6)), house.y + 2, house.z + Math.cos(a * 0.8) * span * 0.4);
      } else if (L.move === 2) {
        // sweeping: all together, across and back
        const sw = Math.sin(t * 1.1);
        tgt.set(house.x + sw * span * 1.1 + u * 6, house.y + 3, house.z + Math.cos(t * 0.7) * span * 0.3);
      } else if (L.move === 3) {
        // ballyhoo: each circling its own spot out in the house
        tgt.set(house.x + u * span * 1.3 + Math.cos(a * 1.6) * 7, house.y + 2, house.z + Math.sin(a * 1.6) * 7);
      } else {
        tgt.set(house.x + u * span * 1.2 + Math.sin(a) * span * 0.45, house.y + Math.abs(Math.cos(a * 0.7)) * 4, house.z + Math.cos(a) * span * 0.6);
      }
      lvl = 0.75 + 0.35 * f.kick;
      col = cols[wrap(i + Math.floor(f.beat / 4), 3)];
      // the hit: the first moments of the chorus, then on the kick
      const first = f.look && secT < 0.35;
      if (L.hit === 0 && strobe && (first || (f.kick > 0.85 && wrap(i + f.beat, 3) === 0))) lvl = 1.6;
      if (L.hit === 1 && (first || f.kick > 0.85)) lvl = 1.15 + 0.2 * f.kick;
    } else {
      // break: a handful of heads straight down, one colour
      tgt.set(stage.x + u * span * 0.3, 0, stage.z + 2);
      lvl = i % 3 === 0 ? 0.3 : 0;
      col = cols[3];
    }
    if (!up && sec !== 'break') col = colour(it, sec === 'chorus' ? Math.floor(f.beat / 4) : 0, beam) || col;
    if (!up) fx.dir.lerp(tgt.clone().sub(fx.pos).normalize(), Math.min(1, f.dt * (sec === 'chorus' ? 5 : 2) * (L.pace > 1 ? 1.3 : 1))).normalize();
    fx.color.copy(col);
    if (lvl > 1.2 && L.hit === 0) fx.color.lerp(WHITE, 0.7);
    fx.intensity = lvl * show * lift;
  }
}

// Lasers: thin, very bright, sweeping fans on the chorus.
export function runLasers(list, f) {
  const sec = f.sec || section(f.bar);
  const show = 1 - f.house;
  const on = sec === 'chorus' ? 1 : sec === 'pre' ? 0.4 : 0;
  list.forEach(({ fx, i, n }) => {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    const a = Math.sin(f.t * 2.2 + i * 0.4) * 0.9;
    fx.dir.set(u * 1.6 + a * 0.6, 0.12 + 0.1 * Math.sin(f.t * 1.3 + i), 1).normalize();
    fx.color.copy(i % 2 ? f.pal.b : f.pal.c);
    fx.intensity = on * show * (0.6 + 0.4 * f.kick);
  });
}

// The lasers' own housings, sat on the deck: the beam leaves the front face
// rather than the air above the boards.
export function laserUnits(root, list, deck) {
  const g = [];
  for (const { fx } of list) { const b = new THREE.BoxGeometry(0.34, 0.2, 0.42); b.translate(fx.pos.x, deck + 0.1, fx.pos.z - 0.22); g.push(b); }
  if (g.length) root.add(new THREE.Mesh(mergeGeometries(g), mats().cab));
}

// The FOH position: a riser, a desk, the barrier round it. The camera stands on
// the riser, so the desk is just under the frame.
export function fohPosition(pipe, root, eye, { riser = 0.9 } = {}) {
  const M = mats();
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7, riser, 5), std({ color: 0x0a0a0b, roughness: 0.8 }));
  deck.position.set(eye.x, riser / 2, eye.z + 0.6); g.add(deck);
  // the desk: a long console with its screens and a thousand small lights
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.9), std({ color: 0x151517, roughness: 0.4, metalness: 0.3 }));
  desk.rotation.x = -0.18; desk.position.set(eye.x + 0.3, riser + 0.82, eye.z - 0.62); g.add(desk);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.78, 0.7), M.cab); legs.position.set(eye.x + 0.3, riser + 0.39, eye.z - 0.6); g.add(legs);
  for (const dx of [-0.55, 0.3, 1.1]) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), glowMat(0x2a4a7a, 0.22));
    scr.rotation.x = -0.6; scr.position.set(eye.x + dx, riser + 1.0, eye.z - 0.86); g.add(scr);
  }
  const leds = [];
  for (let i = 0; i < 48; i++) leds.push({ x: eye.x - 0.8 + (i % 24) * 0.09, y: riser + 0.89 + (i < 24 ? 0 : 0.02), z: eye.z - 0.5 - (i < 24 ? 0 : 0.18), white: false, hue: i % 4, size: 0.006 });
  // barrier
  const bar = [];
  for (const [x0, z0, x1, z1] of [[-3.8, -2.4, 3.8, -2.4], [-3.8, -2.4, -3.8, 3.4], [3.8, -2.4, 3.8, 3.4]]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (const y of [0.35, 1.05]) { const b = new THREE.BoxGeometry(len, 0.04, 0.04); b.rotateY(-Math.atan2(z1 - z0, x1 - x0)); b.translate(eye.x + (x0 + x1) / 2, y, eye.z + (z0 + z1) / 2); bar.push(b); }
    const nPost = Math.round(len / 0.3);
    for (let k = 0; k <= nPost; k++) { const t = k / nPost; const b = new THREE.BoxGeometry(0.02, 0.7, 0.02); b.translate(eye.x + x0 + (x1 - x0) * t, 0.7, eye.z + z0 + (z1 - z0) * t); bar.push(b); }
  }
  g.add(new THREE.Mesh(mergeGeometries(bar), M.alu));
  root.add(g);
  return leds;
}

// Main LED and two IMAG screens on a big stage, plus the RectAreaLights. The
// main wall is 16:9 unless given its own height (a wide wall); `imagW: 0`
// leaves the side screens out.
export function bigScreens(ctx, root, { w, h: wallH = 0, y, z, imagW = 0, imagX, imagY, imagZ, imagYaw, pitch = 0.0039, bright = 1.3 }) {
  const aspect = 16 / 9;
  const h = wallH || w / aspect;
  const main = ledScreen({ w, h, tex: ctx.art.texture(w / h), pitch, bright, frame: 0.3, lightPower: 1.2 });
  main.position.set(0, y, z);
  root.add(main);
  ctx.addScreen(main, w / h, 'main');
  const imags = [];
  for (const side of imagW ? [-1, 1] : []) {
    // the side screens carry the same content as the main wall
    const s = ledScreen({ w: imagW, h: imagW / aspect, tex: ctx.art.texture(aspect), pitch: pitch * 1.5, bright: bright * 0.9, kind: 'main', frame: 0.25, light: false });
    s.userData.bezel?.color.setScalar(0);
    s.position.set(side * imagX, imagY, imagZ); s.rotation.y = -side * imagYaw;
    root.add(s);
    ctx.addScreen(s, aspect, 'main');
    imags.push(s);
  }
  return { main, imags, h };
}

// ── the stage's runways and the PA, as the big tours build them ──

// A runway out from the middle of the stage's front, crossed part way by a
// walkway either side (a cross on the floor), the runway running on past it to
// a square end stage. `inside(x, z, pad)` says whether a point of the floor is
// under any of it, for the crowd and the seats to keep clear.
export function crossThrust(root, { z0, z1, w, crossZ, crossD, crossW, tip = 0, h }) {
  // the runway in pieces either side of the walkway and short of the end
  // stage, so no two decks lie in one plane over the same floor (their tops
  // would fight for the pixels as the view turns)
  const run = (a, b) => (b - a > 0.01 ? [{ x: 0, z: (a + b) / 2, w, d: b - a, lip: false }] : []);
  const end = tip ? z1 - tip : z1;
  const parts = [
    ...run(z0, crossZ),
    { x: 0, z: crossZ + crossD / 2, w: crossW * 2, d: crossD, lip: true },
    ...run(crossZ + crossD, end),
  ];
  if (tip) parts.push({ x: 0, z: z1 - tip / 2, w: tip, d: tip, lip: true });
  const decks = parts.map((p) => {
    const d = stageDeck({ w: p.w, d: p.d, h, z: p.z, lip: p.lip });
    root.add(d);
    return d;
  });
  const inside = (x, z, pad = 0) => parts.some((p) => Math.abs(x - p.x) < p.w / 2 + pad && Math.abs(z - p.z) < p.d / 2 + pad);
  return { decks, inside };
}

// A flown hang with its bridle chains up to the roof (or the stage's own
// steel): a line array of `boxes` cabinets whose top is at `y`, turned `yaw`
// from facing the room (+z), positive towards +x.
export function paHang(root, { x, y, z, boxes, width = 1.3, yaw = 0, roofY = 0, splay = 0.035, depth = 0.7 }) {
  const a = lineArray({ boxes, width, splay, depth });
  a.position.set(x, y, z); a.rotation.y = yaw;
  root.add(a);
  if (roofY > y + 0.2) {
    // a chain at either end of the fly bar, its motor over it, up to the steel
    const c = [];
    for (const s of [-1, 1]) chainInto(c, x + s * Math.cos(yaw) * width * 0.42, y + 0.2, z - s * Math.sin(yaw) * width * 0.42, roofY);
    root.add(new THREE.Mesh(mergeGeometries(c), mats().chain));
  }
  return a;
}

// A screen's rigging: a truss along its top edge (`y` the top, `z` its face,
// `w` its width, turned `yaw`) and chains from that truss up to the steel at
// `topY` (a height, or a function of x and z), `n` of them.
export function screenHang(root, { x = 0, y, z, w, yaw = 0, topY, n = 4, size = 0.52 }) {
  const t = truss(w + 0.6, { size, finish: 'black' });
  t.position.set(x, y + size / 2, z - 0.3); t.rotation.y = yaw; root.add(t);
  const top = typeof topY === 'function' ? topY : () => topY;
  const c = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? (i / (n - 1) - 0.5) * (w - 0.8) : 0;
    const px = x + Math.cos(yaw) * u, pz = z - 0.3 - Math.sin(yaw) * u;
    chainInto(c, px, y + size, pz, top(px, pz));
  }
  root.add(new THREE.Mesh(mergeGeometries(c), mats().chain));
}

// A ground-supported stage roof, for a room whose own roof can't take the
// show's weight (an open stadium, an air-supported dome): lattice towers at
// the corners (+-tx at the first and last of `zs`) standing on `y0`, a roof
// grid at `top` with a beam across at every z of `zs` and along each side, a
// black skin over it, the front towers raked back. Everything else hangs from
// it on chains to `top - 0.8`.
export function groundRoof(root, { tx, zs, y0 = 0, top }) {
  const steel = [];
  const z0 = zs[0], z1 = zs[zs.length - 1];
  for (const sx of [-tx, tx]) {
    for (const z of [z0, z1]) latticeInto(steel, V3(sx, y0, z), V3(sx, top + 0.8, z), 1.8, 0.08);
    latticeInto(steel, V3(sx, y0, z1 - 6), V3(sx, y0 + 12, z1 - 0.9), 0.6, 0.035);
    latticeInto(steel, V3(sx, top, z0), V3(sx, top, z1), 1.6, 0.07);
  }
  for (const z of zs) latticeInto(steel, V3(-tx, top, z), V3(tx, top, z), 1.6, 0.07);
  root.add(new THREE.Mesh(mergeGeometries(steel), mats().trussBlack));
  const skin = new THREE.Mesh(new THREE.BoxGeometry(2 * tx + 3, 0.25, z1 - z0 + 3), std({ color: 0x0a0a0c, roughness: 0.85 }));
  skin.position.set(0, top + 1.0, (z0 + z1) / 2); root.add(skin);
}

// A PA wing: a lattice tower on its own ballast at (x, z), `h` high, a head
// truss across its top for the side and 270 hangs, outriggers to the base,
// and a bridge back to the stage roof at `bridge` (a point on its side beam).
export function paWing(root, { x, z, h, bridge = null }) {
  const steel = [];
  const sd = Math.sign(x) || 1;
  latticeInto(steel, V3(x, 0, z), V3(x, h + 0.6, z), 1.8, 0.08);
  latticeInto(steel, V3(x - sd * 2.5, h, z), V3(x + sd * 3, h, z), 1.0, 0.05);
  latticeInto(steel, V3(x + sd * 2.5, h, z - 1), V3(x + sd * 2.5, h, z + 2), 0.8, 0.05);
  if (bridge) latticeInto(steel, V3(x - sd * 0.9, h, z), bridge, 1.0, 0.05);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) latticeInto(steel, V3(x + dx * 3.4, 0.3, z + dz * 3.4), V3(x + dx * 0.7, h * 0.3, z + dz * 0.7), 0.45, 0.03);
  root.add(new THREE.Mesh(mergeGeometries(steel), mats().trussBlack));
  const base = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 7.6), std({ color: 0x1a1b1e, roughness: 0.8 }));
  base.position.set(x, 0.15, z); root.add(base);
}

// The floor's subwoofers: a row of cabinets along the front of the stage,
// under the barrier line, broken where the runway leaves the stage; and the
// front fills on the deck's lip, small boxes every few metres.
export function subLine(root, { x0, x1, z, gap = 0, pitch = 1.6, count = 2, fills = null }) {
  const M = mats();
  const cab = [], front = [];
  const w = 1.3, hh = 0.55, d = 1.0;
  for (let x = x0; x <= x1 + 1e-6; x += pitch) {
    if (Math.abs(x) < gap) continue;
    for (let i = 0; i < count; i++) {
      const b = new THREE.BoxGeometry(w * 0.98, hh * 0.98, d); b.translate(x, hh / 2 + i * hh, z); cab.push(b);
      const f = new THREE.PlaneGeometry(w * 0.9, hh * 0.82); f.translate(x, hh / 2 + i * hh, z + d / 2 + 0.003); front.push(f);
    }
  }
  if (fills) {
    for (const x of fills.xs) {
      const b = new THREE.BoxGeometry(0.55, 0.32, 0.4); b.rotateX(-0.25); b.translate(x, fills.y + 0.17, fills.z); cab.push(b);
      const f = new THREE.PlaneGeometry(0.5, 0.26); f.rotateX(-0.25); f.translate(x, fills.y + 0.17 + 0.05, fills.z + 0.21); front.push(f);
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(cab), M.cab));
  root.add(new THREE.Mesh(mergeGeometries(front), M.grille));
}

// A delay tower on the floor: a lattice mast on a ballasted base, braced, a
// head frame at the top carrying a line array aimed down the room (+z) at the
// crowd behind it, and a pod of lights over it. Returns where the lights are.
export function delayTower(root, { x, z, h, boxes = 16, width = 1.3, yaw = 0 }) {
  const M = mats();
  const steel = [];
  latticeInto(steel, V3(x, 0, z), V3(x, h, z), 1.6, 0.07);
  // the outriggers to the ballast, four ways
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) latticeInto(steel, V3(x + dx * 3.2, 0.3, z + dz * 3.2), V3(x + dx * 0.6, h * 0.3, z + dz * 0.6), 0.4, 0.03);
  // the head: a short truss across the top, the array hung from its front
  latticeInto(steel, V3(x - 2, h, z), V3(x + 2, h, z), 0.8, 0.05);
  latticeInto(steel, V3(x, h, z - 0.8), V3(x, h, z + 1.8), 0.8, 0.05);
  root.add(new THREE.Mesh(mergeGeometries(steel), M.trussBlack));
  const base = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 7.2), std({ color: 0x1a1b1e, roughness: 0.8 }));
  base.position.set(x, 0.15, z); root.add(base);
  paHang(root, { x, y: h - 1.1, z: z + 1.4, boxes, width, yaw, splay: 0.025, roofY: h - 0.4 });
  return [-1.6, -0.55, 0.55, 1.6].map((dx) => V3(x + dx, h + 0.7, z + 0.2));
}

// A ground-supported set for a big stage: two lattice towers carrying a header
// truss that holds the LED wall, a black backdrop only as wide as the set, wings
// either side to hide backstage, and the road cases that live back there. The
// building's own stands stay visible round it.
export function stageSet(root, { w, h, z, deck, towerX, backdropW, backdropH, wingX, wingW = 10, wingH = 12, drapes = true }) {
  const M = mats();
  const parts = [];
  for (const x of [-towerX, towerX]) latticeInto(parts, V3(x, deck, z - 0.6), V3(x, deck + h, z - 0.6), 1.0, 0.05);
  latticeInto(parts, V3(-towerX, deck + h - 0.5, z - 0.6), V3(towerX, deck + h - 0.5, z - 0.6), 1.0, 0.05);
  // raked braces back to the deck
  for (const x of [-towerX, towerX]) latticeInto(parts, V3(x, deck, z - 4.5), V3(x, deck + h * 0.6, z - 0.9), 0.5, 0.03);
  root.add(new THREE.Mesh(mergeGeometries(parts), M.trussBlack));
  // the black drop behind the set and the wings either side (a stage out in
  // the open of a ballpark has none)
  if (drapes) {
    const bv = velvet(0x040404, 'blackvel', { sheenColor: new THREE.Color(0x121212) });
    const drop = new THREE.Mesh(drapeGeometry(backdropW, backdropH, Math.round(backdropW / 1.6), 0.18), bv);
    drop.position.set(0, deck + backdropH / 2, z - 1.4); root.add(drop);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(drapeGeometry(wingW, wingH, Math.round(wingW / 1.4), 0.16), bv);
      wing.position.set(s * wingX, deck + wingH / 2, z + 0.6); wing.rotation.y = -s * 0.25; root.add(wing);
    }
  }
  // road cases stacked backstage, just visible past the wings
  const rnd = prng(17);
  const cases = [];
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) {
    const cw = 1.2 + rnd() * 0.6, ch = 0.9 + rnd() * 0.5, cd = 0.8 + rnd() * 0.3;
    const b = new THREE.BoxGeometry(cw, ch, cd);
    b.translate(s * (wingX + 1.5 + (i % 3) * 1.6), deck + ch / 2 + (i > 5 ? 1.2 : 0), z - 1 - Math.floor(i / 3) * 1.1);
    cases.push(b);
  }
  root.add(new THREE.Mesh(mergeGeometries(cases), std({ color: 0x141416, roughness: 0.5, metalness: 0.3 })));
}

// Black masking, as a production hangs it: velour from the roof steel down to
// whatever is under it — the floor, or the treads of the stands it crosses —
// in a line from `a` to `b` ([x, z]), so the seats behind it (not sold) are
// out of sight. `skip(x, z)` leaves a gap (the stage and its set).
// A wall along a line as one continuous piece: its face, its back and its
// top a single strip each, the height given per point and eased along the
// line, so a curve is a curve and a change of height a slope — no seams, no
// steps where one segment's box would end and the next begin.
//   pts [{x, z}], hs [top per point], { y0 = 0 (or a list), thick, closed }
export function wallStrip(pts, hs, { y0 = 0, thick = 0.3, closed = false, ease = 2 } = {}) {
  const n = pts.length;
  if (n < 2) return null;
  // ease the heights: a moving average over `ease` points either side
  const H = hs.map((_, i) => {
    let s = 0, w = 0;
    for (let k = -ease; k <= ease; k++) {
      const j = closed ? (i + k + n) % n : Math.min(n - 1, Math.max(0, i + k));
      const wk = 1 + ease - Math.abs(k); s += hs[j] * wk; w += wk;
    }
    return s / w;
  });
  const B = Array.isArray(y0) ? y0 : pts.map(() => y0);
  // the offset either side: the mitred normal at each point
  const nrm = pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return [-dz / l * thick / 2, dx / l * thick / 2];
  });
  const P = [];
  const quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n, a = pts[i], b = pts[j], na = nrm[i], nb = nrm[j];
    const fa = [a.x + na[0], a.z + na[1]], fb = [b.x + nb[0], b.z + nb[1]], ba = [a.x - na[0], a.z - na[1]], bb = [b.x - nb[0], b.z - nb[1]];
    quad([fa[0], B[i], fa[1]], [fb[0], B[j], fb[1]], [fb[0], H[j], fb[1]], [fa[0], H[i], fa[1]]);
    quad([bb[0], B[j], bb[1]], [ba[0], B[i], ba[1]], [ba[0], H[i], ba[1]], [bb[0], H[j], bb[1]]);
    quad([fa[0], H[i], fa[1]], [fb[0], H[j], fb[1]], [bb[0], H[j], bb[1]], [ba[0], H[i], ba[1]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

export function maskingDrapes(root, { a, b, top, bottomAt = () => 0, skip = null, panel = 2.4 }) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const yaw = Math.atan2(-uz, ux);
  const parts = [], pipes = [];
  const n = Math.ceil(L / panel), w = L / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * w, x = a[0] + ux * t, z = a[1] + uz * t;
    if (skip && skip(x, z)) continue;
    let bot = 0;
    for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) bot = Math.max(bot, bottomAt(x + ux * w * k, z + uz * w * k));
    const h = top - bot;
    if (h < 0.5) continue;
    const g = drapeGeometry(w + 0.08, h, Math.max(2, Math.round(w / 0.5)), 0.16);
    g.rotateY(yaw); g.translate(x, bot + h / 2, z);
    parts.push(g);
    const p = new THREE.CylinderGeometry(0.03, 0.03, w, 6); p.rotateZ(Math.PI / 2); p.rotateY(yaw); p.translate(x, top + 0.05, z);
    pipes.push(p);
  }
  if (!parts.length) return;
  const m = new THREE.Mesh(mergeGeometries(parts), velvet(0x020202, 'maskvel', { sheenColor: new THREE.Color(0x060606), sheenRoughness: 0.6, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  root.add(m);
  root.add(new THREE.Mesh(mergeGeometries(pipes), std({ color: 0x111113, roughness: 0.6, metalness: 0.5 })));
}

// A standing floor packed the way a sold-out floor is: a jittered grid, about
// 2.5 people a square metre, nobody inside `avoid`.
export function packFloor({ x0, x1, z0, z1, spacing = 0.62, avoid = null, seed = 3, inside = null }) {
  const rnd = prng(seed);
  const out = [];
  for (let z = z0; z < z1; z += spacing * 0.92) {
    for (let x = x0; x < x1; x += spacing) {
      const px = x + (rnd() - 0.5) * spacing * 0.8, pz = z + (rnd() - 0.5) * spacing * 0.7;
      if (avoid && avoid(px, pz)) continue;
      if (inside && !inside(px, pz)) continue;
      out.push({ x: px, y: 0, z: pz, h: 0.92 + rnd() * 0.14, full: true });
    }
  }
  return out;
}

// Arena seats on the floor, in the lettered blocks of the seating plan: each
// block { x0, x1, z0, z1 } filled with rows `pitch` apart and chairs `seat`
// apart, all facing the stage (towards -z). The crowd stands at the chairs.
// `keep(x, z)` drops chairs where something else stands (a runway, the desk).
export function floorBlocks(blocks, { seat = 0.5, pitch = 0.9, seed = 5, occupancy = 0.97, keep = null } = {}) {
  const rnd = prng(seed);
  const people = [], chairs = [];
  for (const b of blocks) {
    const nx = Math.floor((b.x1 - b.x0) / seat), nz = Math.floor((b.z1 - b.z0) / pitch);
    const ox = b.x0 + (b.x1 - b.x0 - nx * seat) / 2 + seat / 2;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = ox + i * seat, z = b.z0 + (j + 0.5) * pitch;
      if (keep && !keep(x, z)) continue;
      chairs.push({ x, y: 0, z: z + 0.16, turn: Math.PI });
      if (rnd() < occupancy) people.push({ x: x + (rnd() - 0.5) * 0.08, y: 0, z: z - 0.16 + (rnd() - 0.5) * 0.06, h: 0.92 + rnd() * 0.14, full: true });
    }
  }
  return { people, chairs };
}

// A grid of lettered blocks: `rows` of z ranges (front to back) by `cols` of
// x ranges, each clipped to what `inside` allows.
export function blockGrid(zs, xs) {
  const out = [];
  zs.forEach(([z0, z1], r) => xs.forEach(([x0, x1], c) => out.push({ x0, x1, z0, z1, name: String.fromCharCode(65 + r) + (c + 1) })));
  return out;
}

// The chairs themselves, instanced; they are not in the way of a walk.
export function floorChairs(chairs, { color = 0x1a1c22 } = {}) {
  return seatField(chairs, { style: 'folding', fabric: std({ color, roughness: 0.6, side: THREE.DoubleSide }), frame: std({ color: 0x3a3c40, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }) });
}

// The crowd of a big room: silhouettes and their lights, thinned on Low.
export function bigCrowd(root, cu, q, people, { seed = 21 } = {}) {
  if (!q.crowd) return 0;
  const all = withCells(people, seed);
  const shown = q.crowd < 1 ? thin(all, Math.round(all.length * 0.7)) : all;
  root.add(silhouettes(shown, cu, { seed }));
  root.add(crowdLights(shown, cu));
  return shown.length;
}
