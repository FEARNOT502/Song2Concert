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
import { drapeGeometry, latticeInto, ledScreen, mats } from './rig.js';

// The simulated song's shape: verse, pre-chorus, chorus, break over 24 bars.
// A real track brings its own (`f.sec`, from the beat follower).
export function section(bar) {
  const b = ((bar % 24) + 24) % 24;
  return b < 8 ? 'verse' : b < 12 ? 'pre' : b < 20 ? 'chorus' : 'break';
}

// fixtures: [{ fx, i, n, group }]. `house` is a point out in the room the rig
// throws toward (the crowd centre); `stage` the performer area.
export function runShow(rig, list, f, { house, stage, span = 30, up = false, strobe = true, lift = 1 }) {
  const sec = f.sec || section(f.bar);
  const show = 1 - f.house;
  const cols = [f.pal.a, f.pal.b, f.pal.c, f.pal.d];
  const t = f.t;
  const tgt = V3();
  for (const it of list) {
    const { fx, i, n } = it;
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;   // -0.5 .. 0.5 across the truss
    const ph = i * 0.61 + (it.group || 0) * 1.7;
    let lvl = 0, col = cols[0];
    if (up) {
      // floor fixtures: beams up and out into the room
      const spread = sec === 'chorus' ? 0.55 : sec === 'pre' ? 0.35 : 0.2;
      const sway = Math.sin(t * (sec === 'chorus' ? 1.6 : 0.5) + ph) * spread;
      fx.dir.set(u * 1.2 + sway, 1, (sec === 'break' ? 0.1 : 0.35) + 0.2 * Math.cos(t * 0.7 + ph)).normalize();
      lvl = sec === 'break' ? 0.1 : sec === 'verse' ? 0.35 : 0.6 + 0.4 * f.kick;
      col = cols[(i + (sec === 'chorus' ? Math.floor(f.beat / 2) : 0)) % 2];
    } else if (sec === 'verse') {
      tgt.set(stage.x + u * span * 0.5 + Math.sin(t * 0.35 + ph) * 3, 0, stage.z + 6 + Math.cos(t * 0.3 + ph) * 4);
      lvl = 0.5 + 0.15 * f.energy;
      col = cols[it.group % 2 ? 3 : 0];
    } else if (sec === 'pre') {
      const k = Math.sin(t * 0.9 + ph);
      tgt.set(house.x + u * span * 1.4 + k * 4, house.y, house.z - 10 + Math.cos(t * 0.6 + ph) * 12);
      lvl = 0.55 + 0.35 * ((f.beat % 2) === (i % 2) ? f.kick : 0.2);
      col = cols[(i % 2) ? 1 : 0];
    } else if (sec === 'chorus') {
      const a = t * 1.25 + ph;
      tgt.set(house.x + u * span * 1.2 + Math.sin(a) * span * 0.45, house.y + Math.abs(Math.cos(a * 0.7)) * 4, house.z + Math.cos(a) * span * 0.6);
      lvl = 0.75 + 0.35 * f.kick;
      col = cols[(i + Math.floor(f.beat / 4)) % 3];
      if (strobe && f.kick > 0.85 && (i + f.beat) % 3 === 0) { lvl = 1.6; }
    } else {
      tgt.set(stage.x + u * span * 0.3, 0, stage.z + 2);
      lvl = i % 3 === 0 ? 0.3 : 0;
      col = cols[3];
    }
    if (!up) fx.dir.lerp(tgt.clone().sub(fx.pos).normalize(), Math.min(1, f.dt * (sec === 'chorus' ? 5 : 2))).normalize();
    fx.color.copy(col);
    if (lvl > 1.2) fx.color.lerp(new THREE.Color(1, 1, 1), 0.7);
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

// Main LED and two IMAG screens on a big stage, plus the RectAreaLights.
export function bigScreens(ctx, root, { w, y, z, imagW, imagX, imagY, imagZ, imagYaw, pitch = 0.0039, bright = 1.3 }) {
  const aspect = 16 / 9;
  const h = w / aspect;
  const main = ledScreen({ w, h, tex: ctx.art.texture(aspect), pitch, bright, frame: 0.3, lightPower: 1.2 });
  main.position.set(0, y, z);
  root.add(main);
  ctx.addScreen(main, aspect, 'main');
  const imags = [];
  for (const side of [-1, 1]) {
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

// A ground-supported set for a big stage: two lattice towers carrying a header
// truss that holds the LED wall, a black backdrop only as wide as the set, wings
// either side to hide backstage, and the road cases that live back there. The
// building's own stands stay visible round it.
export function stageSet(root, { w, h, z, deck, towerX, backdropW, backdropH, wingX, wingW = 10, wingH = 12 }) {
  const M = mats();
  const parts = [];
  for (const x of [-towerX, towerX]) latticeInto(parts, V3(x, deck, z - 0.6), V3(x, deck + h, z - 0.6), 1.0, 0.05);
  latticeInto(parts, V3(-towerX, deck + h - 0.5, z - 0.6), V3(towerX, deck + h - 0.5, z - 0.6), 1.0, 0.05);
  // raked braces back to the deck
  for (const x of [-towerX, towerX]) latticeInto(parts, V3(x, deck, z - 4.5), V3(x, deck + h * 0.6, z - 0.9), 0.5, 0.03);
  root.add(new THREE.Mesh(mergeGeometries(parts), M.black));
  const bv = velvet(0x040404, 'blackvel', { sheenColor: new THREE.Color(0x121212) });
  const drop = new THREE.Mesh(drapeGeometry(backdropW, backdropH, Math.round(backdropW / 1.6), 0.18), bv);
  drop.position.set(0, deck + backdropH / 2, z - 1.4); root.add(drop);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(drapeGeometry(wingW, wingH, Math.round(wingW / 1.4), 0.16), bv);
    wing.position.set(s * wingX, deck + wingH / 2, z + 0.6); wing.rotation.y = -s * 0.25; root.add(wing);
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
      out.push({ x: px, y: 0, z: pz, h: 0.92 + rnd() * 0.14 });
    }
  }
  return out;
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
