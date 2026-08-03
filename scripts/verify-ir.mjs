#!/usr/bin/env node
// verify-ir.mjs — synthesise each venue's impulse response and measure it.
//
// verify-acoustics.mjs checks the ROOM MODEL. This checks that the response we
// actually generate has the properties the room model said it would — that the
// reverberation time survived synthesis, that clarity landed where the
// direct-to-reverberant ratio implies, and that the two ears are decorrelated
// enough late in the tail for the room to wrap around the listener.
//
//   npm run verify:ir

import { synthesizeIR } from '../src/audio/impulse.js';
import { reverbTime, earlyDecayTime, clarity, iacc, energy, reverbTimeByBand } from '../src/audio/iranalysis.js';
import { reverbTimes, midRT, bassRatio } from '../src/audio/roomacoustics.js';
import { VENUE_ROOMS, roomAbsorption } from '../src/audio/venuerooms.js';
import { venueSeed } from '../src/audio/impulse.js';

const SR = 48000;

// What a great seat measures.
//
// Clarity climbs steeply across this list, and that is the finding rather than a
// tuning failure. A line array at the mix position is directional and aimed at
// the audience, so it delivers a great deal of direct sound and excites the room
// comparatively little — which is precisely WHY the mix position is the best
// seat in an arena. Open air is the extreme: with most of the overhead surface
// missing and eighty thousand people absorbing, a stadium is genuinely the
// driest venue here, not the wettest.
//
// The upper bounds for the arena and dome were raised once the source directivity
// factor was corrected. They had been fitted while every venue used Q = 2 — the
// figure for a source radiating into a half space — which had a line array
// putting several times more power into the building than one actually does.
// They were describing a rig nobody deploys. Its early decay time also runs at about
// half its reverberation time, which is the same fact from the other side: what
// a listener perceives as reverberance there is far shorter than the tail
// actually is, because the tail sits so far below the direct sound.
const TARGETS = {
  jazz:    { c80: [2, 12],   edtRatio: [0.7, 1.25], lateIacc: [0, 0.55] },
  hall:    { c80: [-1, 5],   edtRatio: [0.7, 1.15], lateIacc: [0, 0.40] },
  arena:   { c80: [-2, 9],   edtRatio: [0.6, 1.25], lateIacc: [0, 0.45] },
  dome:    { c80: [-2, 9],   edtRatio: [0.6, 1.25], lateIacc: [0, 0.45] },
  stadium: { c80: [0, 12],   edtRatio: [0.4, 1.25], lateIacc: [0, 0.45] },
};

const f = (v, n = 2) => v.toFixed(n).padStart(7);
let failures = 0;
const check = (label, value, range, fmt = (v) => f(v)) => {
  const ok = value >= range[0] && value <= range[1];
  if (!ok) failures++;
  console.log(`   ${ok ? '  ok ' : ' FAIL'} ${label.padEnd(24)} ${fmt(value)}   target ${range[0]}–${range[1]}`);
};

for (const id of Object.keys(VENUE_ROOMS)) {
  const ir = synthesizeIR({ venueId: id, sampleRate: SR, seed: venueSeed(id) });
  const [ll, lr, rl, rr] = ir.channels;
  // What one ear receives from a centred (mono) source: both hangs sum into it.
  const left = new Float32Array(ir.length);
  const right = new Float32Array(ir.length);
  for (let i = 0; i < ir.length; i++) { left[i] = ll[i] + rl[i]; right[i] = lr[i] + rr[i]; }

  const modelRT = midRT(reverbTimes(roomAbsorption(id)));
  // Measure the MID band, because that is what the model figure is. A broadband
  // decay in a room with a bass ratio of 1.5 reads long — the low end is still
  // going when the mids have finished — so comparing broadband against mid-band
  // reported the Tokyo Dome response as 16 % out when it was correct.
  // Fit past the reverberant build-up — see reverbTime().
  const settled = ir.metrics.gap + ir.metrics.tMix;
  const bandsL = reverbTimeByBand(left, SR, settled);
  const bandsR = reverbTimeByBand(right, SR, settled);
  const measured = (bandsL[2] + bandsL[3] + bandsR[2] + bandsR[3]) / 4;
  const band = bandsL.map((v, i) => (v + bandsR[i]) / 2);
  // Bass ratio is the claim this whole model rests on — a great hall's low end
  // outlasting its mids — so it is checked on what was SYNTHESISED, not just on
  // what the absorption tables predicted.
  const measuredBass = (band[0] + band[1]) / (band[2] + band[3]);
  const modelBass = bassRatio(reverbTimes(roomAbsorption(id)));
  // And the tail has to actually darken: 4 kHz must not outlast the mids.
  const hfRatio = band[5] / measured;
  const edt = (earlyDecayTime(left, SR) + earlyDecayTime(right, SR)) / 2;
  void settled;
  // The dry path carries the direct sound at unity into both ears.
  const c80 = (clarity(left, SR, 80, 1) + clarity(right, SR, 80, 1)) / 2;
  const lateIacc = iacc(left, right, SR, 80, 500);
  const earlyIacc = iacc(left, right, SR, 0, 80);
  const dr = 10 * Math.log10(2 / (energy(left) + energy(right)));

  const t = TARGETS[id];
  console.log(`\n${id.toUpperCase()}   ${ir.metrics.seconds.toFixed(2)} s response   gap ${(ir.metrics.gap * 1000).toFixed(1)} ms   mixing ${(ir.metrics.tMix * 1000).toFixed(0)} ms`);
  console.log(`   model RT60 ${modelRT.toFixed(2)} s  →  measured ${measured.toFixed(2)} s   (${((measured / modelRT - 1) * 100).toFixed(0)}%)`);
  console.log(`   direct/reverberant ${dr.toFixed(1)} dB    early IACC ${earlyIacc.toFixed(2)}`);
  check('RT60 vs model (ratio)', measured / modelRT, [0.85, 1.15]);
  check('bass ratio vs model', measuredBass - modelBass, [-0.15, 0.15]);
  check('4 kHz / mid (tail darkens)', hfRatio, [0.4, 1.0]);
  check('C80 (dB)', c80, t.c80);
  check('EDT / RT60', edt / measured, t.edtRatio);
  check('late IACC', lateIacc, t.lateIacc);
}

console.log(failures ? `\n${failures} measurement(s) out of range\n` : '\nresponses match the room model\n');
process.exit(failures ? 1 : 0);
