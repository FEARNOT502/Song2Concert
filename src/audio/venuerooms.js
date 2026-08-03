// venuerooms.js — the physical description of each venue: a shoebox, its
// surface materials, where the PA/stage sits, and where the "best seat" is.
//
// Everything the reverb needs is derived from THIS file plus roomacoustics.js.
// Nothing here is a reverb parameter — there is no RT60, no damping knob, no
// density. Those are OUTPUTS (see scripts/verify-acoustics.mjs), which is the
// point: change a wall material and the reverberation time, the bass ratio, the
// clarity and the early reflection pattern all move together and consistently,
// the way they do in a real building.
//
// Coordinates are metres, origin at a room corner: x across the width, y from
// the stage end toward the back, z up from the floor. The stage sits at low y;
// the audience looks back toward it.
//
// The listening position for every venue is the IDEALISED best seat:
//   · club/hall — the seat critics travel for: far enough back that the room has
//     spoken, close enough that the direct sound still leads, and deliberately
//     2–3 m off the centre line, because dead centre gets symmetric side
//     reflections that arrive as a pair and narrow the image.
//   · arena/dome/stadium — the FOH mix position. That is not a compromise: it is
//     literally the seat the show was mixed to sound correct in.

import { MATERIALS } from './roomacoustics.js';

// A large-format PA is two hangs, not a point source. Modelling them separately
// is what gives the big rooms a genuinely different reflection pattern on the
// left and the right — which is the raw material for a true-stereo impulse
// response (left channel of the mix through the left hang's room response).
const paHangs = (halfWidth, height, y) => [
  [-halfWidth, y, height],
  [halfWidth, y, height],
];

export const VENUE_ROOMS = {
  jazz: {
    dims: [12, 16, 3.5],
    // Wood everywhere; the audience sits on the floor plane close to the stage.
    surfaces: { x0: 'clubWood', x1: 'clubWood', y0: 'clubWood', y1: 'clubWood', z0: 'clubWood', z1: 'clubWood' },
    absorbers: [
      { area: 120, material: 'audience' },
      { area: 72, material: 'clubWood' },   // uncovered floor
      { area: 388, material: 'clubWood' },  // walls + ceiling
    ],
    stage: { center: [6, 1.5, 1.2], halfWidth: 1.6 },
    listener: [6.8, 5.5, 1.2],  // front table, one seat off the centre line
  },

  hall: {
    dims: [20, 45, 18],
    surfaces: { x0: 'hallMasonry', x1: 'hallMasonry', y0: 'hallMasonry', y1: 'hallMasonry', z0: 'audience', z1: 'hallMasonry' },
    absorbers: [
      // Raked stalls plus balconies: the seated area is far larger than the
      // floor's plan projection, and it is the room's dominant absorber.
      { area: 1600, material: 'audience' },
      { area: 3240, material: 'hallMasonry' },
    ],
    stage: { center: [10, 3, 1.5], halfWidth: 4 },
    listener: [12.5, 16, 1.2],  // ~13 m back, 2.5 m off centre
  },

  arena: {
    dims: [70, 110, 25],
    surfaces: { x0: 'arenaTreated', x1: 'arenaTreated', y0: 'arenaTreated', y1: 'arenaTreated', z0: 'audience', z1: 'arenaTreated' },
    absorbers: [
      { area: 9000, material: 'audience' },
      { area: 15400, material: 'arenaTreated' },
    ],
    stage: { center: [35, 8, 8], halfWidth: 10 },
    listener: [37, 45, 1.6],  // FOH, ~37 m out
  },

  dome: {
    dims: [130, 180, 55],
    // The bowl is treated, not bare concrete. Untreated, a volume this large
    // reverberates for over seven seconds and the rear wall throws back a
    // clearly audible slap — which is what real domes sound like and what an
    // idealised one would have spent the money to fix.
    surfaces: { x0: 'arenaTreated', x1: 'arenaTreated', y0: 'arenaTreated', y1: 'arenaTreated', z0: 'audience', z1: 'domeMembrane' },
    absorbers: [
      { area: 22000, material: 'audience' },
      { area: 23400, material: 'domeMembrane' },  // roof
      { area: 34100, material: 'arenaTreated' },  // bowl walls
    ],
    stage: { center: [65, 12, 12], halfWidth: 14 },
    listener: [68, 67, 1.6],  // FOH, ~55 m out
  },

  stadium: {
    dims: [130, 200, 35],
    // No roof: whatever goes up never comes back. That single material choice is
    // the entire reason an open-air show sounds thin and dry next to a dome — we
    // do not have to fake it with a density setting.
    surfaces: { x0: 'arenaTreated', x1: 'arenaTreated', y0: 'arenaTreated', y1: 'arenaTreated', z0: 'turf', z1: 'openSky' },
    absorbers: [
      { area: 30000, material: 'audience' },
      { area: 26000, material: 'openSky' },       // the sky
      { area: 23100, material: 'arenaTreated' },  // treated rear bowl
      { area: 5000, material: 'turf' },
    ],
    stage: { center: [65, 14, 14], halfWidth: 16 },
    listener: [68, 72, 1.6],  // FOH, ~58 m out
  },
};

// Volume and the absorber list, in the shape reverbTimes() wants.
export function roomAbsorption(id) {
  const r = VENUE_ROOMS[id];
  const [w, l, h] = r.dims;
  return { volume: w * l * h, surfaces: r.absorbers };
}

// Source positions for a venue: a single point for the acoustic rooms (a band on
// a small stage), a left/right pair of hangs for the PA rooms.
export function sourcePositions(id) {
  const r = VENUE_ROOMS[id];
  const [cx, cy, cz] = r.stage.center;
  const hw = r.stage.halfWidth;
  if (id === 'jazz' || id === 'hall') {
    // Acoustic stages still spread across their width; two points at ±halfWidth
    // give the left and right of the mix distinguishable room responses without
    // pretending we know where each instrument stood.
    return paHangs(hw, cz, cy).map(([x, y, z]) => [cx + x, y, z]);
  }
  return paHangs(hw, cz, cy).map(([x, y, z]) => [cx + x, y, z]);
}

export const listenerPosition = (id) => VENUE_ROOMS[id].listener;

// Straight-line distance from the stage centre to the seat — used for the air
// absorption on the direct sound, and shown in the UI.
export function listeningDistance(id) {
  const r = VENUE_ROOMS[id];
  const [sx, sy, sz] = r.stage.center;
  const [lx, ly, lz] = r.listener;
  return Math.hypot(sx - lx, sy - ly, sz - lz);
}

export { MATERIALS };
