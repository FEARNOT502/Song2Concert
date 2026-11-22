// gymnastic-equipment.js — KSPO DOME's equipment plot, in the shape of
// data/concert-equipment.json (concert-equipment.js reads either), worked out
// from the stage plan rather than typed in: the fences follow the decks'
// outlines and the 360's standing pens, the band and the mics stand where the
// decks are.
//
// General: the end stage at A, the band upstage in the middle (drums on their
// riser, bass and a guitar to its left, a guitar and the keys to its right,
// the amps on a line behind them), the vocal mics and prompters along the
// deck's front and out on the T's walkway. 360: DAY6's round deck, the drums
// on the raised middle, guitar, keys and bass round it.
import { GYM_CENTER_R, GYM_CONSOLE_DECK, GYM_FLOOR_R, GYM_FOH, GYM_RAD, GYM_STANDING, gymPoint, gymRing, gymStagePlan } from '../gymnastic-arena-plan.js';

const r2 = (v) => Math.round(v * 1000) / 1000;
const P = (x, z) => [r2(x), r2(z)];

function generalPlot() {
  const plan = gymStagePlan('general');
  const { L } = plan;
  const h = L.deck, r = L.w / 2;
  const F = L.front + L.gap, rx = L.runHalf + L.thrustGap;
  const cz = L.cross - L.thrustGap, wx = L.wing + L.thrustGap, bz = L.cross + L.crossD + L.thrustGap;
  // the pit closed at its ends, a gate either side for the crew, then round the T
  const fences = [
    [P(-r - 1.8, L.front), P(-r - 1.8, F), P(-r + .8, F)],
    [P(-r + 3.2, F), P(-rx, F), P(-rx, cz), P(-wx, cz), P(-wx, bz), P(wx, bz), P(wx, cz), P(rx, cz), P(rx, F), P(r - 3.2, F)],
    [P(r - .8, F), P(r + 1.8, F), P(r + 1.8, L.front)],
  ];
  // the seated floor's edge, between its last seats and the drape over the
  // folded rows: a line of barrier round it, open where the aisles come out
  const edge = GYM_FLOOR_R - .8, gaps = [100, 140, 180, 220, 260];
  const ends = [66, ...gaps.flatMap((g) => [g - 1.8, g + 1.8]), 294];
  for (let i = 0; i < ends.length; i += 2) {
    fences.push({
      points: gymRing(ends[i], ends[i + 1], edge, Math.max(2, Math.ceil((ends[i + 1] - ends[i]) / 3))).map(([x, z]) => P(x, z)),
      face: 'origin',
    });
  }
  const stage = [];
  const prop = (kind, x, z, facing = [0, 1], extra = {}) => stage.push({ kind, p: P(x, z), facing, ...extra });
  // the band: drums on their riser in the middle, amps on a line behind
  const bz0 = L.back + 4.6;
  prop('drums', 0, bz0 + .2);
  prop('keyboard', 8.3, bz0 + 1.6, [-.18, 1]);
  for (const [x, kind, stack] of [[-8.6, 'fender', 2], [-4.9, 'fender', 3], [4.7, 'vox', 2]]) {
    prop(kind, x, bz0 - 1.55, [0, 1], { stack, wall: true });
    prop('signal-coil', x + (x < 0 ? .78 : -.78), bz0 - .8);
  }
  // the strings on their stands, each with its pedalboard (the bass a DI)
  for (const [x, kind] of [[-8.6, 'theater-guitar'], [-4.6, 'theater-bass'], [4.6, 'theater-guitar']]) {
    prop(kind, x + .55, bz0 + 1.35, [x < 0 ? .2 : -.2, 1]);
    prop(kind === 'theater-bass' ? 'theater-di' : 'theater-pedalboard', x - .1, bz0 + 2.1, [0, -1]);
    prop('mic', x - .35, bz0 + 1.7, [0, 1]);
  }
  for (const x of [-8.6, -4.6, 4.6, 8.3]) prop('wedge', x, bz0 + 2.95, [0, -1]);
  prop('wedge', 1.9, bz0 + 1.25, [-.6, -1]);
  // racks and cases at the deck's back corners and either side of the riser
  for (const s of [-1, 1]) {
    prop('touring-rack', s * 12.6, L.back + 2.1, [0, 1], { coil: false });
    prop('touring-rack', s * 13.4, L.back + 2.1, [0, 1], { coil: false });
    prop('signal-coil', s * 13.0, L.back + 2.95);
    prop('flight-case', s * 15.0, L.back + 2.1, [0, 1], { stack: 2 });
    prop('flight-case', s * 16.5, L.back + 2.1, [0, 1], { stack: 2 });
    prop('flight-case', s * 18.3, L.back + 1.4);
    prop('touring-rack', s * 2.9, L.back + 2.0, [0, 1], { coil: false });
  }
  // the vocal line along the deck's front, and two more out on the walkway
  const line = L.front - 1.4;
  for (const x of [-12.2, -5.8, 5.8, 12.2]) {
    prop('prompter', x, line, [0, -1]);
    prop('wedge', x - 1.11, line + .07, [0, -1]);
    prop('wedge', x + 1.11, line + .07, [0, -1]);
    if (Math.abs(x) < 9) prop('mic', x, line - 1.4);
  }
  prop('mic', 0, line - .9);
  const walk = L.cross + L.crossD - 1.3;
  for (const x of [-8.4, 8.4]) {
    prop('prompter', x, walk, [0, -1]);
    prop('wedge', x - 1.11, walk + .07, [0, -1]);
    prop('wedge', x + 1.11, walk + .07, [0, -1]);
    prop('mic', x, walk - 1.4);
  }
  const [fx, , fz] = GYM_FOH.general;
  const floor = [
    { kind: 'touring-rack', p: P(fx - 4.3, fz + 3.6), facing: [0, 1], size: [.7, .68] },
    { kind: 'touring-rack', p: P(fx - 4.3, fz + 4.4), facing: [0, 1], size: [.7, .68] },
    { kind: 'cable-guard', p: P(fx - 4.3, fz - 3.9) },
  ];
  const subs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) subs.push([r2(s * (5.2 + i * 1.7)), 0, r2(L.front + .95), 0, 1, 2]);
  const fills = [3.6, 8.2, 12.8, 16.6].flatMap((x) => [-x, x]).map((x) => [x, r2(h + .17), r2(L.front - .3), 0, 1, .55]);
  // the deck's own lights: a row a couple of metres in from its front, the
  // kinds in turn, beams up and out, washes back onto the band; two more each
  // side out on the walkway; blinders on the deck's front corners
  const lights = [];
  const kinds = ['beam', 'wash', 'spot', 'par'];
  for (let i = 0; i < 12; i++) {
    const x = -16.5 + i * 3, kind = kinds[i % 4], z = L.front - (i % 2 ? 2.6 : 4.4);
    const aim = kind === 'wash' || kind === 'par' ? [x, h + 1.8, L.back + 3] : [x * 1.2, h + 6.5, z + 4];
    lights.push({ p: [r2(x), h, r2(z)], aim: aim.map(r2), facing: [0, 1], kind, ground: false });
  }
  for (const x of [-11, -6, 6, 11]) {
    const z = L.cross + 1.1;
    lights.push({ p: [x, L.runway, r2(z)], aim: [r2(x * 1.4), L.runway + 7, r2(z + 3)], facing: [0, 1], kind: Math.abs(x) > 8 ? 'beam' : 'spot', ground: false });
  }
  for (const s of [-1, 1]) lights.push({ p: [r2(s * (r - 1.2)), h, r2(L.front - .9)], aim: [0, 0, 0], facing: [-s * .25, 1], kind: 'blinder4', ground: false });
  for (const x of [-1.2, 1.2]) lights.push({ p: [x, L.runway, r2(L.front + .45)], aim: [0, 0, 0], facing: [0, 1], kind: 'footlight', ground: false });
  return { fences, stage, floor, subs, fills, lights };
}

function roundPlot() {
  const plan = gymStagePlan('360');
  const { L } = plan;
  const h = L.deck, top = h + L.riser[1];
  const inner = GYM_CENTER_R + L.gap, outer = GYM_FLOOR_R - 2.0;
  // each standing pen fenced round: its inner arc on the pit, its sides along
  // the aisles, the outer arc open in its middle (the pen's gate)
  const fences = [];
  for (const [a, b] of GYM_STANDING) {
    const lo = a + 2.4, hi = b - 2.4, mid = (a + b) / 2, gate = 1.4 / outer / GYM_RAD;
    // (straight runs, as the photographs show them: one along the pit, so the
    // six make a hexagon round the stage, and one either side of the gate)
    const arc = (from, to, radius, n) => gymRing(from, to, radius, n).map(([x, z]) => P(x, z));
    fences.push([...arc(mid - gate, lo, outer, 1), ...arc(lo, hi, inner, 1), ...arc(hi, mid + gate, outer, 1)]);
  }
  const stage = [];
  const at = (deg, rad) => gymPoint(deg, rad);
  const toward = (x, z, tx = 0, tz = 0) => { const d = Math.hypot(tx - x, tz - z) || 1; return [r2((tx - x) / d), r2((tz - z) / d)]; };
  const out = (x, z) => { const d = Math.hypot(x, z) || 1; return [r2(x / d), r2(z / d)]; };
  stage.push({ kind: 'drums', p: P(0, .15), facing: [0, 1], y: top });
  // the three out front of the riser, each with a mic, a wedge and a pedalboard
  for (const [deg, kind] of [[61, 'guitar'], [186, 'keyboard'], [303, 'bass']]) {
    const [x, z] = at(deg, 4.6);
    const face = out(x, z);
    if (kind === 'keyboard') stage.push({ kind, p: P(x, z), facing: face });
    const [mx, mz] = at(deg, 5.45);
    stage.push({ kind: 'mic', p: P(mx, mz), facing: face });
    const [wx, wz] = at(deg, 6.7);
    stage.push({ kind: 'wedge', p: P(wx, wz), facing: toward(wx, wz) });
    if (kind === 'keyboard') continue;
    // the instrument on its stand beside the mic, the pedalboard at the mic's foot
    const [gx, gz] = at(deg + 9, 4.5);
    stage.push({ kind: kind === 'bass' ? 'theater-bass' : 'theater-guitar', p: P(gx, gz), facing: face });
    const [px, pz] = at(deg - 3, 5.95);
    stage.push({ kind: 'theater-pedalboard', p: P(px, pz), facing: toward(px, pz) });
  }
  for (const deg of [0, 120, 240]) {
    const [x, z] = at(deg, 6.9);
    stage.push({ kind: 'wedge', p: P(x, z), facing: toward(x, z) });
  }
  const subs = [], fills = [], lights = [];
  for (let i = 0; i < 8; i++) {
    const [x, z] = at(22.5 + i * 45, GYM_CENTER_R + .75);
    subs.push([r2(x), 0, r2(z), ...out(x, z), 2]);
  }
  for (let i = 0; i < 12; i++) {
    const [x, z] = at(15 + i * 30, GYM_CENTER_R - .3);
    fills.push([r2(x), r2(h + .17), r2(z), ...out(x, z), .55]);
  }
  const kinds = ['beam', 'spot', 'wash'];
  for (let i = 0; i < 12; i++) {
    const deg = i * 30 + 15, [x, z] = at(deg, GYM_CENTER_R - 1.0), [ox, oz] = out(x, z);
    const kind = kinds[i % 3];
    const aim = kind === 'wash' ? [0, top + 1.2, 0] : [x + ox * 6, h + 8, z + oz * 6];
    lights.push({ p: [r2(x), h, r2(z)], aim: aim.map(r2), facing: [ox, oz], kind, ground: false });
  }
  for (const deg of [45, 135, 225, 315]) {
    const [x, z] = at(deg, GYM_CENTER_R - .55);
    lights.push({ p: [r2(x), h, r2(z)], aim: [0, 0, 0], facing: out(x, z), kind: 'blinder4', ground: false });
  }
  // moving lights on the floor round its edge, outside the pens' fences
  for (let i = 0; i < 18; i++) {
    const deg = i * 20 + 10, [x, z] = at(deg, GYM_FLOOR_R - 1.1);
    const kind = i % 2 ? 'beam' : 'spot';
    lights.push({ p: [r2(x), 0, r2(z)], aim: [r2(x * .55), 12, r2(z * .55)], facing: toward(x, z), kind, ground: true });
  }
  const [fx, fy, fz] = GYM_FOH['360'];
  return {
    fences, stage, floor: [], subs, fills, lights,
    foh: { y: r2(fy - .81), yaw: Math.PI },
    consoleDeck: { ...GYM_CONSOLE_DECK, x: fx, z: fz },
  };
}

const plots = {};
export const gymEquipment = (mode) => (plots[mode] ??= mode === '360' ? roundPlot() : generalPlot());
