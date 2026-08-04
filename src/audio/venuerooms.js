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

import { MATERIALS, BANDS, SPEED_OF_SOUND } from './roomacoustics.js';

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
  club: 0.30,
  theater: 0.55,
  concerthall: 0.18,
  arena: 0.88,
  dome: 0.88,
  stadium: 0.90,
};

// Directivity factor Q — the share of a source's power that goes where it is
// aimed, which sets how hard it drives the reverberant field.
//
// DIRECTIVITY above shapes how individual REFLECTIONS are attenuated; this is
// the integrated power figure, and the two are not the same number. It is kept
// separate rather than derived, because the reflection curve is a broad cosine
// chosen to behave well at every angle, and integrating it would understate how
// tightly a real array concentrates its output.
//
// These are BROADBAND figures, deliberately below the pattern directivity a line
// array shows at mid frequencies. Q collapses at low frequencies — a rig that
// covers 90° by 30° at 2 kHz is close to omnidirectional at 60 Hz — so the
// power-weighted average across the spectrum lands well under the number quoted
// for the coverage pattern. The frequency dependence itself is handled where it
// belongs, by the send tilt in graph.js, rather than by inflating this.
//
//   · a large-format line array, averaged across its range: about 5
//   · a small club rig plus a vocal mic, heard from four metres: about 3
//   · an orchestra inside a stage shell: only a little above omnidirectional
export const DIRECTIVITY_Q = {
  club: 3,
  theater: 4,
  concerthall: 2.2,
  arena: 5,
  dome: 5,
  stadium: 5,
};

// Where each venue's low end stops, in Hz.
//
// This was one number for every venue, and a 300-seat club reproducing 25 Hz is
// not a thing that happens. Low-frequency extension is bought with cabinet
// volume and amplifier power, so it scales with the venue: a club rig runs out
// in the mid-fifties, a stadium sub array goes into the high twenties. An
// acoustic hall's floor is set by its instruments instead — a contrabass's
// lowest string is about 41 Hz and the organ goes below, but nothing in an
// orchestra radiates the sub content a modern master carries.
export const SYSTEM_LF_HZ = {
  club: 55,
  theater: 42,
  concerthall: 38,
  arena: 32,
  dome: 30,
  stadium: 28,
};

// How much the reverberant return is widened on its way to the ears.
//
// A real diffuse field arrives from every direction at once, including behind
// and above. Two channels cannot deliver that, so a response measured as highly
// decorrelated — these run an interaural cross-correlation of 0.02 to 0.09 late,
// which is as diffuse as a great hall — still arrives narrower than the room it
// came from. Widening the side component of the RETURN is the standard partial
// compensation, and it costs the direct sound nothing: the source stays where it
// is and only the room opens up, which is the right way round.
//
// Scaled to what each venue actually feels like:
//   · club        a small room heard close: intimate, not enveloping
//   · theatre     boxes up both side walls wrap the stalls
//   · concert hall the vineyard's terraces surround every seat — the highest
//                 lateral fraction of the acoustic rooms, and the form exists
//                 for that
//   · arena/dome  large enclosed volumes, and the ones where the reverberant
//                 return is doing most of the work of conveying size; the dome
//                 is the biggest room here
//   · stadium     open above the pitch, so much of what would envelop you
//                 leaves and never comes back — it stays the narrowest of the
//                 three big rooms on purpose
export const REVERB_WIDTH = {
  club: 1.15,
  theater: 1.28,
  concerthall: 1.45,
  arena: 1.58,
  dome: 1.68,
  stadium: 1.40,
};

// The reverberant level each venue arrives at, in dB relative to the level its
// impulse response already carries. The wet slider trims ±12 dB around this.
//
// This used to be one number — +2.5 dB — for every venue, with the slider's
// centre also pinned at 50 everywhere, which meant the venue default could not
// express venue character at all. That was easy to miss because the slider
// LOOKED like it was per venue: it reads its centre from `position.wet`, but the
// trim is computed from the DIFFERENCE between the slider and that centre, so
// moving the centre moved nothing. All six rooms arrived at +2.5 dB.
//
// The measurement that says this needed to be per venue: direct-to-reverberant
// at the listening position runs −1.8 dB in the club and −1.9 in the hall, and
// +6.5 / +7.2 / +5.8 dB in the arena, dome and stadium. That eight-decibel split
// is physically right — a directional rig at the mix position is why big-venue
// sound works — but two things it does not account for both push the same way:
//
//   · LEVEL. A concert runs at 100–105 dB SPL and headphones at perhaps 75. The
//     reverberant tail of a big room sits far enough below the direct sound that
//     25 dB down it falls under what you can hear at all, while in a hall, where
//     the room is already level with the direct sound, it does not. This is the
//     same argument the loudness compensation makes for the low end, applied to
//     the reverberant field.
//   · THE RIG. A stadium show is not one pair of hangs. Side hangs and delay
//     towers put a great deal of power into the building from positions spread
//     through the audience — see FILL_HANGS — and a model with only the main
//     hangs understates how much of the room is excited.
//
// The stadium stays the driest of the three, because an open roof genuinely is.
// These are deliberately short of what the eight-decibel split would suggest,
// because two other things close most of it first, and both are physical rather
// than a gain: the delay rings in FILL_HANGS, and the rig power in RIG_POWER.
// Between them the arena's direct-to-reverberant goes from +6.5 dB to about
// +1 without anything here moving. What is left is the level argument, and only
// that — so the big rooms get a decibel over the acoustic ones, not four.
export const VENUE_WET_DB = {
  club: 2.0,
  theater: 2.5,
  concerthall: 3.0,
  arena: 3.5,
  dome: 3.5,
  stadium: 3.5,
};

// How much acoustic power the whole rig puts into the building, relative to the
// main hangs on their own.
//
// The statistical reverberant level comes from reverberantRatio(), which is a
// formula about ONE source: total absorption, one directivity factor, one
// distance. Give it the main hangs and it tells you what a room does when a
// single pair of arrays is driving it — and that is not what is driving any of
// these rooms. The delay rings in FILL_HANGS cover thousands of seats each and
// run at a level comparable to the mains inside their own zone, so their
// radiated power is comparable too. All of it ends up in the same reverberant
// field.
//
// It cannot be read off their arrival level at the mix position, which is the
// only thing FILL_HANGS states: a tower is quiet at FOH precisely because it is
// aimed at the seats behind it. Computing the reverberant contribution from that
// figure gives half a decibel and is wrong for the same reason it looks
// convincing.
//
// This is also what makes the towers help rather than hurt REVERBERANCE. Early
// decay time is measured over the first 10 dB, so early arrivals steepen it:
// adding the rings on their own took the dome's EDT from 0.60 of its
// reverberation time to 0.40, which is a room that sounds DRIER than its tail
// really is — the exact complaint. A rig that excites the room in proportion to
// its size puts that back where it belongs.
export const RIG_POWER = {
  club: 1,
  theater: 1,
  concerthall: 1,
  arena: 2.0,
  dome: 2.4,
  stadium: 2.2,
};

// A low shelf on the DIRECT path, by how much low-frequency system the venue
// has. Not a taste control: a stadium sub array is dozens of cabinets of
// horn-loaded or cardioid sub and it is deployed to be felt, where a club has a
// pair of eighteens in a corner. SYSTEM_LF_HZ already says where each rig stops;
// this says how hard it pushes above that point.
//
// It sits at 70 Hz, below the loudness compensation's 90 Hz shelf, so it adds
// depth rather than another helping of the same thickness — and it is on the
// direct path only, so none of it drives the room's low-frequency reverberation.
// Weight goes up, booming does not.
export const RIG_LOW_LIFT = {
  club: 0,
  theater: 0,
  concerthall: 0,
  arena: 1.6,
  dome: 1.6,
  stadium: 2.2,
};

export const VENUE_ROOMS = {
  club: {
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

  // ── Theatre ──────────────────────────────────────────────────────────────
  //
  // A 3,000-seat proscenium house. Built for sightlines and for speech, so it is
  // drier and flatter than a concert hall of similar size: heavier upholstery,
  // drapes, light framed construction that flexes at low frequencies, and a
  // stage house behind the arch that swallows whatever goes into it.
  theater: {
    dims: [26, 40, 16],
    volume: 15000,
    surfaces: { x0: 'theaterFinish', x1: 'theaterFinish', y0: 'stageHouse', y1: 'theaterFinish', z0: 'theaterSeating', z1: 'theaterFinish' },
    absorbers: [
      { area: 1600, material: 'theaterSeating' },  // stalls plus balconies
      { area: 2800, material: 'theaterFinish' },
      { area: 180, material: 'stageHouse' },       // the proscenium opening
    ],
    stage: { center: [13, 3, 1.6], halfWidth: 5 },
    listener: [14.5, 17, 1.2],  // mid stalls, a seat off the centre line
  },

  // ── Concert hall, vineyard ───────────────────────────────────────────────
  //
  // Terraced blocks of seating stepping down around a central stage, as at the
  // Berlin Philharmonie or Suntory Hall. What makes the form work acoustically
  // is that every block is bounded by its own low wall, so each seat gets a
  // strong lateral reflection from a surface a few metres away — a shoebox gets
  // that from side walls twenty metres apart, and only in the stalls.
  //
  // That is also why `dims` describes the listener's BLOCK rather than the whole
  // building. The room the image-source solver needs is the local geometry, the
  // terrace walls that actually return early sound; the hall's true volume and
  // surface area are stated separately, and Sabine only wants those. Modelling
  // the outer shell instead would put every early reflection tens of
  // milliseconds late and lose the very thing a vineyard is for.
  concerthall: {
    dims: [18, 34, 19],
    volume: 22000,
    surfaces: { x0: 'vineyardTerrace', x1: 'vineyardTerrace', y0: 'vineyardTerrace', y1: 'vineyardTerrace', z0: 'audience', z1: 'hallMasonry' },
    absorbers: [
      { area: 2050, material: 'audience' },         // ~2,000 seats over terraces
      { area: 3200, material: 'vineyardTerrace' },
    ],
    stage: { center: [9, 6, 1.5], halfWidth: 4 },
    listener: [6.5, 19, 1.4],  // 13 m out, 6.5 m from the terrace wall beside it
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
  if (id === 'club' || id === 'theater' || id === 'concerthall') {
    // Acoustic stages still spread across their width; two points at ±halfWidth
    // give the left and right of the mix distinguishable room responses without
    // pretending we know where each instrument stood.
    return paHangs(hw, cz, cy).map(([x, y, z]) => [cx + x, y, z]);
  }
  return paHangs(hw, cz, cy).map(([x, y, z]) => [cx + x, y, z]);
}

// ── Delay towers and side hangs ─────────────────────────────────────────────
//
// The large venues were modelled as two hangs at the stage end and nothing else,
// and that is not what any of these shows is. Past thirty or forty metres a
// single hang cannot both cover the far seats and stay under the level the front
// rows can bear, so the coverage is split: extra arrays are flown or towered out
// in the audience, fed the same programme, and delayed so the stage still sounds
// like where the music is coming from.
//
// Leaving them out was measurable and it was exactly the complaint. Early
// LATERAL energy is what makes a room feel like it is around you rather than in
// front of you, and with only the main hangs the arena's lateral fraction inside
// the first 80 ms was essentially zero: the side stands are fifty-five metres
// away, so nothing from the sides can arrive early. The note in data.js said as
// much and declined to invent any — correctly, because inventing reflections a
// building cannot produce is faking it. A delay tower is not invented. It is
// equipment standing in the audience at every show of this size, and it delivers
// a strong arrival from ninety degrees off-axis about ten milliseconds late,
// which is the single most enveloping thing in the building.
//
//   side     which channel of the true-stereo response it feeds, 0 = left
//   x, y, z  position in room coordinates, for the arrival DIRECTION
//   gain     arrival amplitude at the mix position, relative to the main hangs'
//            direct sound. These run well down at FOH: the towers are aimed
//            downstream at the seats behind them, so the mix position sits off
//            their axis, and they exist to reinforce the mains rather than to
//            compete with them.
//   alignMs  when it arrives, measured from the mains' direct sound. This is a
//            SETTING and not a time of flight, which is the whole point of a
//            delay ring: the system engineer measures the propagation and dials
//            it out, then adds ten to twenty milliseconds on top so the
//            precedence effect keeps the image on the stage instead of on
//            whichever tower is nearest.
//
// TWO RINGS, AND NO TWO ARRIVING TOGETHER. Both details are the difference
// between this helping and hurting, and the first attempt had neither: one
// symmetric pair at a single delay took the early interaural cross-correlation
// from 0.06 to 0.75. A mirror-image pair firing at the same instant reaches the
// two ears as near copies of each other, and highly correlated ears are a NARROW
// image — precisely the opposite of the thing being asked for. It is the same
// reason every listening position in this file sits two or three metres off the
// centre line.
//
// So the sides are staggered in distance and in delay, and there is an outer
// ring behind the mix position as well as an inner one beside it. Both are true
// of any real deployment: the towers ring the audience, the mix position is not
// at the centre of that ring, and each tower is aligned to its own zone.
export const FILL_HANGS = {
  arena: [
    { side: 0, x: 27, y: 38, z: 7, gain: 0.30, alignMs: 9 },
    { side: 1, x: 83, y: 45, z: 7, gain: 0.30, alignMs: 14 },
    { side: 0, x: 21, y: 66, z: 9, gain: 0.19, alignMs: 23 },
    { side: 1, x: 89, y: 59, z: 9, gain: 0.19, alignMs: 29 },
  ],
  dome: [
    { side: 0, x: 55, y: 63, z: 9, gain: 0.31, alignMs: 11 },
    { side: 1, x: 126, y: 77, z: 9, gain: 0.31, alignMs: 16 },
    { side: 0, x: 47, y: 106, z: 12, gain: 0.21, alignMs: 27 },
    { side: 1, x: 134, y: 95, z: 12, gain: 0.21, alignMs: 34 },
  ],
  stadium: [
    { side: 0, x: 73, y: 77, z: 10, gain: 0.30, alignMs: 12 },
    { side: 1, x: 164, y: 92, z: 10, gain: 0.30, alignMs: 17 },
    { side: 0, x: 62, y: 130, z: 13, gain: 0.20, alignMs: 31 },
    { side: 1, x: 174, y: 117, z: 13, gain: 0.20, alignMs: 38 },
  ],
};

// The fills' arrivals at the listening position, in the shape imageSources()
// returns so the renderer can treat them as ordinary early arrivals.
//
// Only the DIRECT arrival of each fill is enumerated. What a tower sends into
// the room afterwards is reverberation, and the late field is already scaled to
// the room's statistical reverberant energy rather than summed per source — so
// running a full image-source solve per tower would cost several times the
// synthesis budget to re-derive a tail that is being set another way. What only
// the towers can supply is the early lateral arrival, and that is this.
//
// `direct: true` marks them as loudspeakers rather than boundaries, so the
// initial time delay gap — a measure of when the ROOM first answers — skips
// them. Lateral fraction does not skip them: the energy is lateral, early, and
// really there.
export function fillArrivals(id) {
  const hangs = FILL_HANGS[id];
  if (!hangs) return [[], []];
  const listener = VENUE_ROOMS[id].listener;
  const mains = sourcePositions(id);
  const out = [[], []];

  for (const hang of hangs) {
    const side = hang.side ? 1 : 0;
    const main = mains[side];
    // The listener faces the stage; the same frame imageSources() derives, so
    // the azimuths of the fills and of the room's own reflections agree.
    const fx0 = main[0] - listener[0], fy0 = main[1] - listener[1];
    const fLen = Math.hypot(fx0, fy0) || 1e-6;
    const fx = fx0 / fLen, fy = fy0 / fLen;
    const rx = fy, ry = -fx;

    const dx = hang.x - listener[0], dy = hang.y - listener[1], dz = hang.z - listener[2];
    const dist = Math.hypot(dx, dy, dz) || 1e-6;
    const azimuth = Math.atan2(dx * rx + dy * ry, dx * fx + dy * fy);
    const elevation = Math.asin(Math.max(-1, Math.min(1, dz / dist)));

    // A little more top gone than the mains lose, because the mix position is
    // off the tower's axis and a line array's pattern narrows with frequency.
    const band = BANDS.map((__, b) => hang.gain * (b >= 4 ? 0.72 : b === 3 ? 0.88 : 1));
    out[side].push({
      time: hang.alignMs / 1000,
      gain: (band[2] + band[3]) / 2,
      band,
      azimuth,
      elevation,
      order: 0,
      floorOnly: false,
      direct: true,
      // Not spread in time, unlike a reflection off a stand. Smearing these was
      // tried on the reasoning that a tower is several metres of array rather
      // than a point, and it cost 3 dB of reverberant level for no measurable
      // return: staggering the ring is what decorrelates the ears, and the
      // spread had been doing the decorrelating by throwing energy away instead.
      // depositTap normalises a cluster on amplitude rather than on energy, by
      // design, so splitting a coherent arrival across nine taps loses most of
      // its power. A tower is also the one arrival in the building that is
      // deliberately coherent — the alignment exists to make it so.
      scatter: 0,
    });
  }
  return out;
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
