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
import { KELVIN, V3, glowMat, prng, std, thin, velvet } from './core.js';
import { crowdLights, silhouettes, withCells } from './people.js';
import { chainInto, drapeGeometry, latticeInto, ledScreen, lineArray, mats, rodInto, seatField, stageDeck, truss } from './rig.js';

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
// how far a pre-chorus has built: through the section when the song is
// mapped, else over its first twelve seconds
const buildOf = (f, secT) => (f.secProg != null ? 0.45 + 0.55 * f.secProg : 0.55 + 0.45 * Math.min(1, secT / 12));
// how far through its section the song is: the map's account, else sixteen
// seconds from when it began (or was called from the desk)
const progOf = (f, secT) => (f.secProg != null ? f.secProg : Math.min(1, secT / 16));

// The big rooms play every part of a song its own way; the rest, and the
// rooms' own fixtures, play the four broad states (`f.sec`). In the order the
// lighting desk lays them out.
export const PARTS = ['intro', 'verse', 'pre', 'chorus', 'post', 'break', 'bridge', 'dance', 'solo', 'outro'];
export const BASE = { intro: 'break', verse: 'verse', pre: 'pre', chorus: 'chorus', post: 'chorus', break: 'break', bridge: 'chorus', dance: 'chorus', solo: 'chorus', outro: 'break' };
// a bridge's last two bars, 0..1 through them (null before): the roll that
// carries it into what comes next. By the time to the next section when the
// song is mapped; else the last two of every eight bars.
export function rollOf(f) {
  if ((f.part || f.sec) !== 'bridge') return null;
  const bar = 4 * 60 / Math.max(60, f.bpm || 120);
  if (f.toNext != null) return f.toNext < 2 * bar ? 1 - f.toNext / (2 * bar) : null;
  const b = wrap(f.secBar ?? f.bar, 8) + wrap(f.phase ?? 0, 4) / 4;
  return b >= 6 ? (b - 6) / 2 : null;
}
const WHITE = new THREE.Color(1, 1, 1);
export function runShow(rig, list, f, opts) {
  if (f.look) return runMovers(list, f, opts);
  const { house, stage, span = 30, up = false, strobe = true, lift = 1 } = opts;
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
      const build = f.look ? buildOf(f, secT) : 1;
      const k = Math.sin(t * 0.9 * (0.7 + 0.6 * build) + ph);
      tgt.set(house.x + u * span * 1.4 + k * 4, house.y, house.z - 10 + Math.cos(t * 0.6 + ph) * 12);
      lvl = (0.55 + 0.35 * (wrap(f.beat, 2) === (i % 2) ? f.kick : 0.2)) * build;
      col = cols[(i % 2) ? 1 : 0];
    } else if (sec === 'chorus') {
      const a = t * 1.25 + ph;
      if (L.move === 1) {
        // crossing: each half of the rig throws to the far side of the house
        // (the new moves keep over the crowd's heads, into the air above them)
        tgt.set(house.x - Math.sign(u || 1) * span * (0.5 + 0.3 * Math.sin(a * 0.6)), house.y + 10, house.z + Math.cos(a * 0.8) * span * 0.4);
      } else if (L.move === 2) {
        // sweeping: all together, across and back
        const sw = Math.sin(t * 1.1);
        tgt.set(house.x + sw * span * 1.1 + u * 6, house.y + 10, house.z + Math.cos(t * 0.7) * span * 0.3);
      } else if (L.move === 3) {
        // ballyhoo: each circling its own spot out in the house
        tgt.set(house.x + u * span * 1.3 + Math.cos(a * 1.6) * 7, house.y + 8, house.z + Math.sin(a * 1.6) * 7);
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

// ── the movers in the big rooms ──
// A moving head is a yoke that pans and a head that tilts, each on a motor
// with a top speed and a limit to how hard it can start and stop, so it
// swings to a new place rather than jumping there. A programmer builds a
// song from positions (the whole row aimed somewhere at once) and effects
// laid over them (a circle, a figure of eight, a wave in tilt or in pan, a
// ballyhoo), each spread across the row: all together, chasing along it,
// mirrored from the middle, or odd against even. Positions change on the
// music (each couple of bars in a chorus), effects by the phrase.
const PAN_MAX = 2.4, TILT_MAX = 2.0, ACCEL = 9;      // rad/s, rad/s, rad/s²
const SHAPES = ['circle', 'eight', 'tiltWave', 'panWave', 'bally'];
// pan and tilt from a direction, for a head hung down (or stood up)
function panTilt(d, up) { return [Math.atan2(d.x, d.z), Math.acos(Math.max(-1, Math.min(1, up ? d.y : -d.y)))]; }
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function motor(cur, vel, want, max, dt, wrapped) {
  const err = wrapped ? angDiff(want, cur) : want - cur;
  const v = Math.max(-max, Math.min(max, err * 7));
  const dv = Math.max(-ACCEL * dt, Math.min(ACCEL * dt, v - vel));
  vel += dv;
  return [cur + vel * dt, vel];
}
// the floor's rows play the phrase's next effect, so they don't mirror the trusses
const it0 = (list) => list[0]?.fx.hang === 'up';

function runMovers(list, f, { house, stage, span = 30, up = false, strobe = true, lift = 1 }) {
  const sec = f.sec || section(f.bar);
  const part = f.part || sec;
  const show = 1 - f.house;
  const cols = [f.pal.a, f.pal.b, f.pal.c, f.pal.d];
  const L = f.look;
  const secT = f.secT ?? 10;
  const dt = Math.min(0.1, f.dt || 0.016);
  // the beat, not the clock: every move below turns over in beats, so a
  // faster song moves faster and each move lands with the music
  const beat = f.phase ?? f.t * 2;
  const cyc = (beats) => beat / beats * L.pace * Math.PI * 2;
  // the song's energy now (0.25 quiet .. 1 its loudest): brightness and size
  const E = f.energy ?? 0.5;
  const eS = 0.65 + 0.5 * E;
  // (bars counted from the section's start when the song is mapped, so the
  // positions turn over on its phrases)
  const bar = Math.floor(f.secBar ?? f.bar), phrase = Math.floor(f.bar / 8);
  const prog = progOf(f, secT);
  const roll = rollOf(f);
  // the phrase's effect and how it is spread, the position this couple of bars
  const shape = SHAPES[wrap(phrase + L.move * 2 + (it0(list) ? 1 : 0), SHAPES.length)];
  const spread = wrap(phrase + L.move, 4);
  const pos = wrap(Math.floor(bar / 2) + L.move, 4);
  const tmp = V3();
  for (const it of list) {
    const { fx, i, n } = it;
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    const side = u < 0 ? -1 : 1;
    const beam = fx.kind === 'beam' || fx.kind === 'spot';
    if (it.pan == null) { [it.pan, it.tilt] = panTilt(fx.dir, up); it.vp = 0; it.vt = 0; }
    // the base position, in pan and tilt
    const aim = (x, y, z) => panTilt(tmp.set(x, y, z).sub(fx.pos).normalize(), up);
    // the chorus's positions: fanned out over the house, crossed, all to one
    // point in the air, lifted out to the far end
    const chorusPos = (k) => {
      if (up) return [[side * Math.PI / 2, 0.55], [-side * Math.PI / 2, 0.4], [0, 0.05], [Math.PI / 2 + u * 4, 0.45]][k];
      // (each row about the point it throws to: the spots low over the
      // floor, the beams high over the far stands)
      const [hp, ht] = aim(house.x, house.y, house.z);
      return [
        [hp + u * 1.4, ht],
        [hp - side * 0.5 + u * 0.4, ht - 0.2],
        aim(house.x, house.y + 14, house.z - span * 0.3),
        [hp + u * 0.5, ht + 0.25],
      ][k];
    };
    let p0, t0, amp = 0, beats = 8, s = 'circle', lvl, col, burst = 0;
    if (part === 'intro') {
      // the room waiting: the heads parked up and dark, a few on the stage
      // coming up as the intro runs
      const lit = i % 3 === 1;
      [p0, t0] = up ? [u * 0.6, 0.15] : lit ? aim(stage.x + u * span * 0.2, stage.y, stage.z + 4) : [u * 0.6, 0.05];
      amp = 0.03; beats = 16;
      lvl = up ? 0.08 * prog : lit ? 0.5 * prog * eS : 0;
      col = cols[0];
    } else if (part === 'verse') {
      // the stage picked out, a few heads at a time, turning slowly
      [p0, t0] = up ? [u * 0.8, 0.25] : aim(stage.x + u * span * 0.35, stage.y, stage.z + 6);
      amp = 0.06; beats = 8;
      lvl = i % 2 ? 0 : 0.4 + 0.3 * E;
      col = cols[it.group % 2 ? 3 : 0];
    } else if (part === 'pre') {
      // fanned out over the house, a wave in tilt running along the row,
      // wider and quicker as it builds: a wave every four beats, then two
      const build = buildOf(f, secT);
      [p0, t0] = up ? [side * Math.PI / 2, 0.35 + Math.abs(u) * 0.5] : ((a) => [a[0] + u * 1.3, a[1]])(aim(house.x, house.y, house.z));
      amp = 0.2 + 0.15 * build; beats = 4 / (0.6 + 0.9 * build); s = 'tiltWave';
      lvl = (0.55 + 0.35 * (wrap(f.beat, 2) === (i % 2) ? f.kick : 0.2)) * build * eS;
      col = cols[(i % 2) ? 1 : 0];
    } else if (part === 'chorus') {
      // a new position every two bars, the phrase's effect over it, once
      // round every two beats (the last chorus quicker and wider)
      [p0, t0] = chorusPos(pos);
      amp = f.final ? 0.38 : 0.3; beats = f.final ? 1.5 : 2; s = shape;
      lvl = ((f.final ? 0.85 : 0.75) + 0.35 * f.kick) * eS;
      col = cols[wrap(i + Math.floor(f.beat / 4), 3)];
      const first = secT < 0.35;
      if (L.hit === 0 && strobe && (first || (f.kick > 0.85 && wrap(i + f.beat, 3) === 0))) lvl = 1.6;
      if (L.hit === 1 && (first || f.kick > 0.85)) lvl = 1.15 + 0.2 * f.kick;
    } else if (part === 'post') {
      // the chorus ringing on: lifted high over the house, a wide slow
      // circle, the colours trading every two bars; no hits
      if (up) [p0, t0] = [u * 1.4, 0.5];
      else { const [hp, ht] = aim(house.x, house.y + 18, house.z); [p0, t0] = [hp + u * 1.2, ht]; }
      amp = 0.36; beats = 8;
      lvl = (0.75 + 0.12 * f.kick) * eS;
      col = cols[wrap(i + Math.floor(bar / 2), 2)];
    } else if (part === 'dance') {
      // the hardest: a new position on every beat, odd heads mirrored against
      // even, a tilt flick each beat, two colours trading on the beat
      const k = wrap(Math.floor(beat) + L.move, 4);
      [p0, t0] = chorusPos(k);
      if (i % 2) p0 = (up ? 0 : 2 * aim(house.x, house.y, house.z)[0]) - p0;
      amp = 0.12; beats = 1; s = 'tiltWave';
      lvl = (0.9 + 0.45 * f.kick) * eS;
      col = cols[wrap(i + Math.floor(beat), 2)];
    } else if (part === 'bridge') {
      // the turn: two colours of its own, hard against each other, the halves
      // crossing the whole room and thrown back on every downbeat
      const flip = bar % 2 ? -1 : 1;
      if (up) [p0, t0] = [side * flip * 1.1, 0.45];
      else { const [hp, ht] = aim(house.x, house.y + 6, house.z); [p0, t0] = [hp + side * flip * 0.95 + u * 0.3, ht]; }
      amp = 0.16; beats = 1; s = 'tiltWave';
      lvl = (0.8 + 0.35 * f.kick) * eS;
      col = (side < 0) !== (bar % 2 === 1) ? cols[2] : cols[3];
      if (roll != null) lvl *= 0.8 + 0.4 * roll;
    } else if (part === 'solo') {
      // every head on one point, white, thrown open on each kick and drawn
      // back in
      [p0, t0] = up ? [0, 0.08] : aim(stage.x, stage.y, stage.z);
      burst = f.kick;
      lvl = (0.85 + 0.5 * f.kick) * eS;
      col = beam && i % 3 ? WHITE : cols[0];
    } else if (part === 'outro') {
      // gathering up over the middle of the stage, going out as it ends
      [p0, t0] = up ? [0, 0.05] : aim(stage.x, stage.y + 25, stage.z + 10);
      amp = 0.1; beats = 8;
      lvl = 0.8 * Math.pow(1 - prog, 1.5) * eS;
      col = cols[wrap(i + Math.floor(bar / 2), 3)];
    } else {
      // break: straight down (or up), still, one colour, a few on
      [p0, t0] = [u * 0.2, 0.08];
      lvl = i % 3 === 0 ? 0.3 * eS : 0;
      col = cols[3];
    }
    // the effect, spread across the row, wider the louder the song runs
    const ph = spread === 0 ? 0 : spread === 1 ? i / Math.max(1, n) * Math.PI * 2 : spread === 2 ? Math.abs(u) * Math.PI * 2 : (i % 2) * Math.PI;
    const mir = spread === 2 ? side : 1;
    const a = cyc(beats) + ph;
    let dp = 0, dtl = 0;
    if (s === 'circle') { dp = Math.cos(a); dtl = Math.sin(a); }
    else if (s === 'eight') { dp = Math.sin(a); dtl = 0.6 * Math.sin(2 * a); }
    else if (s === 'tiltWave') { dtl = Math.sin(a); }
    else if (s === 'panWave') { dp = Math.sin(a); }
    else { dp = Math.sin(a * 0.73 + i * 1.9) * Math.cos(a * 0.41 + i); dtl = Math.sin(a * 0.59 + i * 2.7); }
    const A = amp * (0.75 + 0.4 * E);
    const wantP = p0 + A * dp * mir * 1.4, wantT = Math.max(0, Math.min(up ? 1.2 : 2.1, t0 + A * dtl));
    [it.pan, it.vp] = motor(it.pan, it.vp, wantP, PAN_MAX, dt, true);
    [it.tilt, it.vt] = motor(it.tilt, it.vt, wantT, TILT_MAX, dt, false);
    // the solo's burst snaps open on the kick, quicker than the yoke's own
    // swing, fanned along the row
    const pp = it.pan + burst * u * 1.6, tt = Math.max(0, it.tilt + burst * 0.35);
    const st = Math.sin(tt);
    fx.dir.set(st * Math.sin(pp), (up ? 1 : -1) * Math.cos(tt), st * Math.cos(pp)).normalize();
    // the song's look recolours the sections it has always played
    if (part === 'verse' || part === 'pre' || part === 'chorus') {
      const k = part === 'chorus' ? Math.floor(f.beat / 4) : 0;
      if (L.col === 0) col = (i + k) % 5 === 0 ? cols[1] : cols[0];
      else if (L.col === 1) col = cols[wrap(i + k, 2)];
      else if (L.col === 2) col = beam ? WHITE : cols[wrap(i + k, 2)];
    }
    fx.color.copy(col);
    if (lvl > 1.2 && L.hit === 0) fx.color.lerp(WHITE, 0.7);
    fx.intensity = lvl * show * lift;
  }
}
// ── the rig on a phone ──
// A phone draws every other fixture of each row (q.rig < 1), picked from
// either end inwards so a row stays symmetric about the stage; the real
// lights, the screens and the PA stay as they are.
export function thinRow(q, list) {
  if ((q.rig ?? 1) >= 1 || list.length <= 3) return list;
  const n = list.length;
  return list.filter((_, i) => (i < n / 2 ? i : n - 1 - i) % 2 === 0);
}
// A row of fixtures: make(i) adds fixture i of the full row; each kept one
// gets its place (i) and the row's count (n) as thinned.
export function fixtureRow(q, n, make) {
  const keep = thinRow(q, Array.from({ length: n }, (_, i) => i));
  return keep.map((i, k) => ({ ...make(i), i: k, n: keep.length }));
}
// fixture k of a full row of n, in a row that may have been thinned
export const fromRow = (row, k, n) => row[Math.min(row.length - 1, Math.round(k * row.length / n))];

// ── blinders and strobes ──
// A blinder: eight warm lamps in a black box, a pair of them a 'unit' hung on
// a clamp under a truss or bolted to a tower, aimed at the house. A strobe: a
// long bar with a cold white face. Neither moves; their faces light per frame,
// and a beam each (wide, faint) catches the haze and throws the glare.
// units: [{ pos (the face's centre), dir, mount (the y of the steel it hangs
// from or stands on; null when bolted to a tower's face) }]
const WARM = KELVIN(2900), COLD = KELVIN(7500);
export function flashUnits(rig, root, units, { kind = 'blinder' } = {}) {
  const blind = kind === 'blinder';
  const W = blind ? 1.0 : 1.05, H = blind ? 0.52 : 0.2, D = blind ? 0.24 : 0.2;
  const body = [], o = new THREE.Object3D();
  const lamps = [];
  if (blind) for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const l = new THREE.CircleGeometry(0.1, 14); l.translate((c - 1.5) * 0.235, (r - 0.5) * 0.23, 0.004); lamps.push(l); }
  else { const l = new THREE.PlaneGeometry(W * 0.92, H * 0.6); l.translate(0, 0, 0.004); lamps.push(l); }
  const faceG = mergeGeometries(lamps);
  const face = new THREE.InstancedMesh(faceG, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), units.length);
  face.frustumCulled = false;
  const list = units.map((u, i) => {
    const dir = u.dir.clone().normalize();
    o.position.copy(u.pos); o.lookAt(u.pos.clone().add(dir)); o.updateMatrix();
    const b = new THREE.BoxGeometry(W, H, D); b.translate(0, 0, -D / 2 - 0.002); b.applyMatrix4(o.matrix); body.push(b);
    face.setMatrixAt(i, o.matrix);
    face.setColorAt(i, new THREE.Color(0));
    // the clamp and its pipe up (or the foot down) to the steel
    if (u.mount != null) {
      const top = u.pos.clone().addScaledVector(dir, -D / 2); top.y += Math.sign(u.mount - u.pos.y) * H * 0.45;
      const at = V3(top.x, u.mount, top.z);
      const r = [];
      rodInto(r, top, at, 0.03);
      body.push(...r);
      const c = new THREE.BoxGeometry(0.12, 0.1, 0.12); c.translate(at.x, at.y, at.z); body.push(c);
    }
    const fx = rig.add({
      kind: 'wash', pos: u.pos.clone().addScaledVector(dir, 0.05), dir, body: false, color: blind ? WARM : COLD,
      angle: blind ? 0.42 : 0.6, length: blind ? 40 : 24, beamGain: blind ? 0.1 : 0.06, flareGain: blind ? 1.6 : 1.2, soft: 0.95, noise: 0.5,
    });
    return { fx, i, n: units.length, l: 0 };
  });
  root.add(new THREE.Mesh(mergeGeometries(body.map((g) => g.index ? g.toNonIndexed() : g)), mats().cab));
  root.add(face);
  return { list, face, blind };
}

// The blinders: dark but for the filaments' glow until the chorus lands, then
// full on and dying away as a tungsten lamp does; with a look that hits with
// them (hit 2), again on each bar's downbeat, the halves trading on the
// backbeat. Returns how much they light the house (0–1), for the crowd.
const _c = new THREE.Color(), _d = new THREE.Color();
export function runBlinders(B, f) {
  const sec = f.sec || section(f.bar);
  const show = 1 - f.house;
  const L = f.look || HOUSE_LOOK;
  const secT = f.secT ?? 10;
  const fade = Math.exp(-(f.dt || 0.016) * 5);
  let sum = 0;
  const part = f.look ? (f.part || sec) : sec;
  const bar = Math.floor(f.secBar ?? f.bar);
  for (const it of B.list) {
    let to = 0;
    if (part === 'chorus' && f.look) {
      if (secT < 0.45) to = 1;
      else if (L.hit === 2 && f.kick > 0.8) to = wrap(f.beat, 4) === 0 ? 1 : wrap(f.beat, 2) === 0 ? (it.i % 2 ? 0.7 : 0) : 0;
    } else if (part === 'bridge' && f.kick > 0.8 && wrap(f.beat, 4) === 0) {
      // the bridge: each downbeat, one half then the other
      to = it.i % 2 === bar % 2 ? 1 : 0;
    } else if (part === 'solo' && f.kick > 0.8 && wrap(f.beat, 8) === 0) {
      // the solo: all of them every other bar
      to = 1;
    }
    it.l = Math.max(to, it.l * fade) * show;
    it.fx.intensity = it.l * 1.3;
    it.fx.color.copy(WARM);
    _c.setRGB(0.05, 0.02, 0.006).multiplyScalar(0.3 + show).add(_d.copy(WARM).multiplyScalar(it.l * 12));
    B.face.setColorAt(it.i, _c);
    sum += it.l;
  }
  B.face.instanceColor.needsUpdate = true;
  return sum / Math.max(1, B.list.length);
}

// What the blinders and strobes throw on the crowd, added to its wash.
export function flashOnCrowd(wash, bl, st) {
  wash.r += WARM.r * bl * 0.45 + COLD.r * st * 0.22;
  wash.g += WARM.g * bl * 0.45 + COLD.g * st * 0.22;
  wash.b += WARM.b * bl * 0.45 + COLD.b * st * 0.22;
}

// The strobes: a burst as the chorus opens, then with a look that hits white
// (hit 0) a scatter of bars on the kick, and with a colour hit (hit 1) all of
// them in the song's colour on the kick. Returns how much they light the house.
export function runStrobes(S, f) {
  const sec = f.sec || section(f.bar);
  const show = 1 - f.house;
  const L = f.look || HOUSE_LOOK;
  const secT = f.secT ?? 10;
  const fade = Math.exp(-(f.dt || 0.016) * 30);
  const tint = L.hit === 1 ? f.pal.a : null;
  const part = f.look ? (f.part || sec) : sec;
  const roll = f.look ? rollOf(f) : null;
  let sum = 0;
  for (const it of S.list) {
    let to = 0;
    if (part === 'chorus' && f.look) {
      if (secT < 0.6) to = wrap(Math.floor(secT * 20), 2) === 0 ? 1 : 0;
      else if (L.hit === 0 && f.kick > 0.85) to = ((it.i * 7 + f.beat * 3) % 5) < 2 ? 1 : 0;
      else if (L.hit === 1 && f.kick > 0.85) to = 0.8;
    } else if ((part === 'dance' || part === 'solo') && f.kick > 0.85) {
      // the dance break and the solo: every bar on every kick
      to = 1;
    } else if (roll != null) {
      // the bridge's roll: eighths, then sixteenths, then thirty-seconds,
      // locked to the beat
      const k = 2 ** (1 + Math.min(2, Math.floor(roll * 3)));
      to = ((f.phase ?? f.t * 2) * k) % 1 < 0.5 ? 0.6 + 0.4 * roll : 0;
    }
    it.l = Math.max(to, it.l * fade) * show;
    it.fx.intensity = it.l * 1.5;
    it.fx.color.copy(tint && part === 'chorus' && secT >= 0.6 ? tint : COLD);
    _c.setRGB(0.02, 0.022, 0.026).add(_d.copy(it.fx.color).multiplyScalar(it.l * 16));
    S.face.setColorAt(it.i, _c);
    sum += it.l;
  }
  S.face.instanceColor.needsUpdate = true;
  return sum / Math.max(1, S.list.length);
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

export function maskingDrapes(root, { a, b, top, bottomAt = () => 0, skip = null, panel = 2.4, matte = false }) {
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
  const m = new THREE.Mesh(mergeGeometries(parts), matte ? std({ color: 0x030303, roughness: 1, side: THREE.DoubleSide }) : velvet(0x020202, 'maskvel', { sheenColor: new THREE.Color(0x060606), sheenRoughness: 0.6, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  root.add(m);
  root.add(new THREE.Mesh(mergeGeometries(pipes), std({ color: 0x111113, roughness: 0.6, metalness: 0.5 })));
}

// Masking that stands on its own feet, where nothing may hang from the
// building: the drapes along `line` ([x, z] points), each run up to its own
// height (`tops`, one per run), their hems on whatever is under them
// (`bottomAt`), hung from a lattice header carried on scaffold towers set
// behind them (away from `front`, a point the audience side) every `bay`
// metres.
export function scaffoldMasking(root, { line, tops, bottomAt = () => 0, front = [0, 100], bay = 12 }) {
  const steel = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], top = tops[i];
    maskingDrapes(root, { a, b, top, bottomAt, matte: true });
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    let nx = -dz / L, nz = dx / L;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (nx * (front[0] - mx) + nz * (front[1] - mz) > 0) { nx = -nx; nz = -nz; }
    const off = 0.9, n = Math.max(1, Math.round(L / bay));
    const pa = V3(a[0] + nx * off, top + 0.4, a[1] + nz * off), pb = V3(b[0] + nx * off, top + 0.4, b[1] + nz * off);
    latticeInto(steel, pa, pb, 0.6, 0.035);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = a[0] + dx * t + nx * off, z = a[1] + dz * t + nz * off;
      const y0 = bottomAt(x, z);
      if (top + 0.7 - y0 < 1) continue;
      latticeInto(steel, V3(x, y0, z), V3(x, top + 0.7, z), 0.8, 0.045);
      // a raking brace back to the ground (or the step) behind it
      const y1 = bottomAt(x + nx * 4, z + nz * 4);
      if (top - y1 > 6) latticeInto(steel, V3(x + nx * 4, y1, z + nz * 4), V3(x, y0 + (top - y0) * 0.55, z), 0.4, 0.03);
    }
  }
  if (steel.length) root.add(new THREE.Mesh(mergeGeometries(steel), mats().trussBlack));
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
      if (rnd() < occupancy) people.push({ x: x + (rnd() - 0.5) * 0.08, y: 0, z: z - 0.16 + (rnd() - 0.5) * 0.06, h: 0.92 + rnd() * 0.14, full: true, fblock: b });
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
// The floor's blocks for the lightstick control: a seated floor's own blocks
// (`p.fblock`), a standing floor cut into pens about as big; numbered across
// the floor from one side to the other and in rows from the stage back.
export function floorZones(people) {
  const floor = people.filter((p) => !p.zone);
  if (!floor.length) return;
  const key = (p) => (p.fblock ? [(p.fblock.x0 + p.fblock.x1) / 2, p.fblock.z0] : [Math.round(p.x / 10) * 10, Math.floor(p.z / 15) * 15]);
  const xs = [...new Set(floor.map((p) => Math.round(key(p)[0] * 2) / 2))].sort((a, b) => a - b);
  const zs = [...new Set(floor.map((p) => Math.round(key(p)[1] * 2) / 2))].sort((a, b) => a - b);
  for (const p of floor) {
    const [kx, kz] = key(p);
    const c = xs.indexOf(Math.round(kx * 2) / 2), r = zs.indexOf(Math.round(kz * 2) / 2);
    p.zone = { lv: 0, u: xs.length > 1 ? c / (xs.length - 1) : 0.5, block: r * 64 + c, row: r };
  }
}

export function bigCrowd(root, cu, q, people, { seed = 21 } = {}) {
  if (!q.crowd) return 0;
  floorZones(people);
  const all = withCells(people, seed);
  const shown = q.crowd < 1 ? thin(all, Math.round(all.length * 0.7)) : all;
  root.add(silhouettes(shown, cu, { seed }));
  root.add(crowdLights(shown, cu));
  return shown.length;
}
