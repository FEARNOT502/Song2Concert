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

// How forward-facing each venue's sources are, 0 = omnidirectional. An acoustic
// stage radiates nearly everywhere and a hall wants it to; a line array is aimed
// at the audience and rejects its rear hard, which is both why big rooms stay
// intelligible and why the structure behind a stage does not answer back.
export const DIRECTIVITY = {
  jazz: 0.30,
  hall: 0.20,
  arena: 0.88,
  dome: 0.88,
  stadium: 0.90,
};

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

  // ── Saitama Super Arena, arena mode ──────────────────────────────────────
  //
  // The 15,000-tonne movable stand is slid in, closing off the stadium-mode
  // volume and bringing capacity to about 22,500. Even closed it is a very large
  // room for an arena, which is most of why it is a demanding one to mix in.
  //
  // Interior dimensions and volume here are estimated from the published
  // capacity and the building's footprint, not measured — see the note in
  // scripts/verify-acoustics.mjs about which figures are which.
  arena: {
    reference: 'Saitama Super Arena (arena mode)',
    dims: [110, 130, 33],
    volume: 400000,
    // Side and rear walls of a bowl are not walls, they are raked stands full of
    // people. Behind the stage the movable block presents a treated face.
    surfaces: { x0: 'audience', x1: 'audience', y0: 'arenaTreated', y1: 'audience', z0: 'audience', z1: 'arenaTreated' },
    absorbers: [
      { area: 20000, material: 'audience' },      // ~22,500 raked seats plus floor
      { area: 22000, material: 'arenaTreated' },  // roof deck, walls, block face
    ],
    stage: { center: [55, 8, 8], halfWidth: 11 },
    listener: [57, 43, 1.6],  // FOH, ~35 m out on the floor
  },

  // ── Tokyo Dome ───────────────────────────────────────────────────────────
  //
  // 1,240,000 m³ under an air-supported double membrane — the volume is the
  // published figure, and a well enough known one to be a unit of measurement in
  // Japan. The roof spans roughly 201 m, so the box below is the equal-plan-area
  // square; volume and surface area are stated directly rather than taken from
  // it.
  //
  // Tokyo Dome's reputation for difficult concert sound is not modelled in as a
  // penalty; it falls out. A light membrane is nearly transparent at low
  // frequencies, so the roof absorbs little of what matters most, and 1.24
  // million m³ is simply an enormous room. The result is the longest
  // reverberation and the heaviest bass ratio of any venue here.
  dome: {
    reference: 'Tokyo Dome',
    dims: [178, 178, 50],
    volume: 1240000,
    surfaces: { x0: 'audience', x1: 'audience', y0: 'arenaTreated', y1: 'audience', z0: 'audience', z1: 'domeMembrane' },
    absorbers: [
      { area: 25000, material: 'audience' },      // ~45,000 at a concert
      { area: 35000, material: 'domeMembrane' },  // the air-supported roof
      { area: 13000, material: 'turf' },          // field not under the crowd
      { area: 8000, material: 'concrete' },       // structure
    ],
    stage: { center: [89, 15, 11], halfWidth: 14 },
    listener: [92, 70, 1.6],  // FOH, ~55 m out on the field
  },

  // ── Wembley Stadium ──────────────────────────────────────────────────────
  //
  // 1,139,100 m³ inside the bowl, 90,000 seats, and a 40,000 m² roof that covers
  // every seat but deliberately leaves the pitch open — which is exactly the
  // 60/40 split of sky and structure the previous generic stadium was guessing
  // at, now taken from the actual building.
  //
  // That open pitch is why a stadium is the driest venue here and not the
  // wettest: whatever radiates upward over the pitch never returns.
  stadium: {
    reference: 'Wembley Stadium',
    dims: [230, 250, 52],
    volume: 1139100,
    // Overhead is roughly 63 % roof over the seating and 37 % open sky above the
    // pitch, blended into one surface.
    surfaces: { x0: 'audience', x1: 'audience', y0: 'arenaTreated', y1: 'audience', z0: 'audience', z1: [0.41, 0.41, 0.41, 0.41, 0.42, 0.42, 0.42] },
    absorbers: [
      { area: 50000, material: 'audience' },      // 90,000 raked seats
      { area: 7000, material: 'audience' },       // standing crowd on the pitch
      { area: 24000, material: 'openSky' },       // open above the pitch
      { area: 40000, material: 'arenaTreated' },  // roof soffit over the seating
      { area: 15000, material: 'concrete' },      // structure and stage end
    ],
    stage: { center: [115, 20, 14], halfWidth: 16 },
    listener: [118, 85, 1.6],  // FOH, ~65 m out on the pitch
  },
};

// Volume and the absorber list, in the shape reverbTimes() wants.
//
// `volume` may be given explicitly, and for the real buildings it is. A dome is
// not a box and a stadium bowl is not a box, so the rectangular room the
// image-source solver needs is only an approximation of their shape — matching
// their true volume AND their true surface area with one set of box dimensions
// is generally impossible. Sabine only cares about volume and surface area, and
// both are published for these venues, so they are stated directly; `dims` is
// left free to be whatever rectangle best reproduces the reflection geometry.
export function roomAbsorption(id) {
  const r = VENUE_ROOMS[id];
  const [w, l, h] = r.dims;
  return { volume: r.volume ?? w * l * h, surfaces: r.absorbers };
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
