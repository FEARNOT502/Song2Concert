// iranalysis.js — measure a synthesised impulse response the way an acoustician
// measures a real one.
//
// This exists because we generate our responses instead of shipping measured
// ones, so there is nothing to A/B against. Without measurement, "tune a
// constant, listen, tune another" is the only available method, and it does not
// converge: every change silently moves everything else. These functions close
// that loop — the room model claims a reverberation time and a clarity, and
// this checks whether the response it produced actually has them.
//
// All pure; runs in Node.

import { BANDS } from './roomacoustics.js';

// Backward (Schroeder) integration of the energy decay curve, in dB.
export function decayCurve(ir) {
  const n = ir.length;
  const edc = new Float64Array(n);
  let sum = 0;
  for (let i = n - 1; i >= 0; i--) {
    sum += ir[i] * ir[i];
    edc[i] = sum;
  }
  const total = edc[0] || 1e-30;
  for (let i = 0; i < n; i++) edc[i] = 10 * Math.log10(Math.max(edc[i] / total, 1e-30));
  return edc;
}

// Reverberation time by least-squares fit over a decay range, extrapolated to
// 60 dB. T20 (−5 → −25 dB) is used in practice because the last part of a decay
// is buried in noise; here it also avoids the synthetic tail's end fade.
export function reverbTime(ir, sampleRate, from = -5, to = -25) {
  const edc = decayCurve(ir);
  let i0 = -1, i1 = -1;
  for (let i = 0; i < edc.length; i++) {
    if (i0 < 0 && edc[i] <= from) i0 = i;
    if (edc[i] <= to) { i1 = i; break; }
  }
  if (i0 < 0 || i1 < 0 || i1 <= i0) return 0;
  // least squares on the segment
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const n = i1 - i0;
  for (let i = i0; i < i1; i++) {
    const x = (i - i0) / sampleRate;
    const y = edc[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx); // dB per second
  return slope < 0 ? -60 / slope : 0;
}

// Early decay time: the same fit over 0 → −10 dB. EDT tracks what a listener
// actually perceives as reverberance far better than RT60 does; in a good seat
// EDT/RT60 sits near 0.9–1.0.
export const earlyDecayTime = (ir, sampleRate) => reverbTime(ir, sampleRate, 0, -10);

// Clarity: the ratio of energy arriving in the first `ms` to everything after,
// in dB. C80 is the music figure. Positive means the direct and early sound
// dominate — detail and separation; negative means the tail does — wash.
//
// `directEnergy` matters: our impulse response carries only reflections, since
// the engine's dry path carries the direct sound. Passing the direct sound's
// energy in is what makes this comparable with a measured C80.
export function clarity(ir, sampleRate, ms = 80, directEnergy = 0) {
  const split = Math.floor((ms / 1000) * sampleRate);
  let early = directEnergy, late = 0;
  for (let i = 0; i < ir.length; i++) {
    const e = ir[i] * ir[i];
    if (i < split) early += e; else late += e;
  }
  return 10 * Math.log10(Math.max(early, 1e-30) / Math.max(late, 1e-30));
}

// Interaural cross-correlation over a time window: how similar the two ears'
// signals are. Low late IACC is what makes a room feel like it surrounds you
// rather than sitting in front of you; a great hall runs below 0.2 late.
export function iacc(left, right, sampleRate, fromMs, toMs, maxLagMs = 1) {
  const a = Math.floor((fromMs / 1000) * sampleRate);
  const b = Math.min(left.length, Math.floor((toMs / 1000) * sampleRate));
  const maxLag = Math.floor((maxLagMs / 1000) * sampleRate);
  let el = 0, er = 0;
  for (let i = a; i < b; i++) { el += left[i] * left[i]; er += right[i] * right[i]; }
  const norm = Math.sqrt(el * er);
  if (norm < 1e-30) return 0;
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = a; i < b; i++) {
      const j = i + lag;
      if (j >= 0 && j < right.length) acc += left[i] * right[j];
    }
    best = Math.max(best, Math.abs(acc / norm));
  }
  return best;
}

// Per-octave reverberation time, via one-pole bandpass isolation. Coarse
// filters, but they are the same ones the synthesiser used to build the bands,
// so this reports what was actually produced.
export function reverbTimeByBand(ir, sampleRate) {
  return BANDS.map((f) => {
    const lo = f / Math.SQRT2, hi = f * Math.SQRT2;
    const aLo = 1 - Math.exp((-2 * Math.PI * hi) / sampleRate);
    const aHi = 1 - Math.exp((-2 * Math.PI * lo) / sampleRate);
    const band = new Float32Array(ir.length);
    let l1 = 0, l2 = 0, h1 = 0, h2 = 0;
    for (let i = 0; i < ir.length; i++) {
      l1 += aLo * (ir[i] - l1); l2 += aLo * (l1 - l2);   // 2-pole lowpass at hi
      h1 += aHi * (l2 - h1); h2 += aHi * (h1 - h2);      // subtract lowpass at lo
      band[i] = l2 - h2;
    }
    return reverbTime(band, sampleRate);
  });
}

// Total energy of a response, for direct-to-reverberant bookkeeping.
export function energy(ir) {
  let e = 0;
  for (let i = 0; i < ir.length; i++) e += ir[i] * ir[i];
  return e;
}
