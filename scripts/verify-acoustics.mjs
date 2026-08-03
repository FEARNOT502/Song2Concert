#!/usr/bin/env node
// verify-acoustics.mjs — measure the room model and compare it against the
// targets for a great-sounding venue.
//
// We synthesise our impulse responses rather than shipping measured ones, so
// there is no ground truth to A/B against. This script IS the ground truth: it
// computes the same quantities an acoustician measures in a real hall (RT60 per
// octave, bass ratio, initial time delay gap, lateral fraction, early
// reflection density) straight from the room model, and checks them against
// published values for the best rooms of each type.
//
//   npm run verify:acoustics

import { reverbTimes, imageSources, itdg, lateralFraction, midRT, bassRatio, mixingTime, BANDS } from '../src/audio/roomacoustics.js';
import { VENUE_ROOMS, roomAbsorption, sourcePositions, listenerPosition, listeningDistance } from '../src/audio/venuerooms.js';

// Targets. The hall's are Beranek's figures for the top-rated shoebox halls;
// the rest are what each venue type sounds like when it is done well.
//
// Two of these deserve a note, because the first run of this script contradicted
// what had been assumed and the model turned out to be right:
//
//   · LATERAL FRACTION collapses to ~0 in the arena, dome and stadium, and that
//     is correct. From the mix position of a room 70–130 m wide the side walls
//     are so far away that no lateral reflection arrives inside the 80 ms early
//     window at all. Early envelopment is a thing great halls have and big rooms
//     simply do not; theirs arrives later, from the diffuse field. Targeting a
//     hall-like 0.2 here would have meant faking it.
//
//   · DOME mid RT60 lands near 4 s, not the 3.4 s previously published. A
//     1.3 million m³ volume cannot reverberate for 3.4 s without absorption no
//     dome actually carries. The published figure was aspirational; the physics
//     is not negotiable, so the figure moved.
const TARGETS = {
  jazz:    { midRT: [0.7, 1.0],  bass: [0.60, 1.00], itdg: [0.004, 0.014], lf: [0.10, 0.25] },
  hall:    { midRT: [1.8, 2.2],  bass: [1.10, 1.30], itdg: [0.015, 0.028], lf: [0.18, 0.33] },
  arena:   { midRT: [2.0, 2.8],  bass: [0.85, 1.25], itdg: [0.012, 0.050], lf: [0.00, 0.12] },
  dome:    { midRT: [3.4, 4.5],  bass: [0.95, 1.40], itdg: [0.015, 0.090], lf: [0.00, 0.12] },
  stadium: { midRT: [2.2, 3.4],  bass: [0.80, 1.35], itdg: [0.015, 0.100], lf: [0.00, 0.12] },
};

const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
const f = (v, n = 2) => v.toFixed(n).padStart(6);

let failures = 0;
const check = (venue, label, value, range, fmt = (v) => f(v)) => {
  const ok = inRange(value, range);
  if (!ok) failures++;
  const mark = ok ? '  ok ' : ' FAIL';
  console.log(`   ${mark} ${label.padEnd(22)} ${fmt(value)}   target ${range[0]}–${range[1]}`);
};

for (const id of Object.keys(VENUE_ROOMS)) {
  const room = VENUE_ROOMS[id];
  const { volume } = roomAbsorption(id);
  const rts = reverbTimes(roomAbsorption(id));
  const sources = sourcePositions(id);
  const listener = listenerPosition(id);

  // Early reflections from both sources, merged — that is what one ear hears.
  const refl = sources
    .flatMap((s) => imageSources({ room: { dims: room.dims, surfaces: room.surfaces }, source: s, listener, maxOrder: 4, maxTime: 0.12 }))
    .sort((a, b) => a.time - b.time);

  const t = TARGETS[id];
  console.log(`\n${id.toUpperCase()}  V=${Math.round(volume).toLocaleString()} m³  seat ${listeningDistance(id).toFixed(1)} m  mixing time ${(mixingTime(volume) * 1000).toFixed(0)} ms`);
  console.log(`   RT60 by band  ${BANDS.map((b, i) => `${b}:${rts[i].toFixed(2)}`).join('  ')}`);
  check(id, 'mid RT60 (s)', midRT(rts), t.midRT);
  check(id, 'bass ratio', bassRatio(rts), t.bass);
  check(id, 'ITDG (ms)', itdg(refl), t.itdg, (v) => f(v * 1000, 1));
  check(id, 'lateral fraction', lateralFraction(refl), t.lf);

  const early = refl.filter((r) => r.time <= 0.08).length;
  console.log(`        reflections <80ms      ${String(early).padStart(6)}   (density ${Math.round(early / 0.08)}/s)`);
}

console.log(failures ? `\n${failures} target(s) out of range\n` : '\nall venues within target\n');
process.exit(failures ? 1 : 0);
