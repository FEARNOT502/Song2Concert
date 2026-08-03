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
//
// `startAfter` excludes the reverberant BUILD-UP from the fit, and is not
// optional in a large room. The diffuse field rises over roughly the mixing
// time, and in Tokyo Dome that rise is a sizeable fraction of how long the high
// bands take to decay at all — so the −5 dB point lands while the field is still
// growing, the fitted slope comes out nearly flat, and the 8 kHz band reports
// almost three times its actual reverberation time. Fitting only where the decay
// is actually a decay is what an acoustician does with a real measurement of a
// room like that, for the same reason.
export function reverbTime(ir, sampleRate, from = -5, to = -25, startAfter = 0) {
  const edc = decayCurve(ir);
  const skip = Math.floor(startAfter * sampleRate);
  let i0 = -1, i1 = -1;
  for (let i = skip; i < edc.length; i++) {
    if (i0 < 0 && edc[i] <= from) i0 = i;
    if (i0 >= 0 && edc[i] <= to) { i1 = i; break; }
  }
  // With the build-up excluded the level may already be past `from`; start at
  // the first usable sample rather than reporting nothing.
  if (i0 < 0 && i1 < 0 && skip < edc.length - 2) { i0 = skip; i1 = edc.length - 1; }
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
export const earlyDecayTime = (ir, sampleRate, startAfter = 0) => reverbTime(ir, sampleRate, 0, -10, startAfter);

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

// Biquad section, run over a buffer in place. Direct form I.
function biquad(buf, { b0, b1, b2, a1, a2 }) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    buf[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }
}

// RBJ cookbook lowpass / highpass coefficients.
function rbj(type, f0, q, sampleRate) {
  const w = (2 * Math.PI * f0) / sampleRate;
  const cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const a0 = 1 + alpha;
  if (type === 'lowpass') {
    return { b0: ((1 - cw) / 2) / a0, b1: (1 - cw) / a0, b2: ((1 - cw) / 2) / a0, a1: (-2 * cw) / a0, a2: (1 - alpha) / a0 };
  }
  return { b0: ((1 + cw) / 2) / a0, b1: (-(1 + cw)) / a0, b2: ((1 + cw) / 2) / a0, a1: (-2 * cw) / a0, a2: (1 - alpha) / a0 };
}

// Fourth-order Butterworth needs these two section Qs.
const BUTTER_Q = [0.54119610, 1.30656296];

// Per-octave reverberation time.
//
// The filters have to be steep. An earlier version used gentle one-pole slopes
// and reported Tokyo Dome's mid band as decaying 45 % slower than the model
// said. Nothing was wrong with the response: with a bass ratio of 1.5 its
// 125 Hz band outlasts its mid band by seconds, so whatever low end leaks
// through a shallow filter dominates the tail of the measurement and flattens
// the fitted slope. Fourth-order Butterworth sections either side of each octave
// put the leakage far enough down to measure what is actually there.
export function reverbTimeByBand(ir, sampleRate, startAfter = 0) {
  return BANDS.map((f) => {
    const band = Float32Array.from(ir);
    const lo = f / Math.SQRT2, hi = Math.min(f * Math.SQRT2, sampleRate * 0.45);
    for (const q of BUTTER_Q) biquad(band, rbj('lowpass', hi, q, sampleRate));
    for (const q of BUTTER_Q) biquad(band, rbj('highpass', lo, q, sampleRate));
    return reverbTime(band, sampleRate, -5, -25, startAfter);
  });
}

// Isolate one octave band of a response, for band-limited clarity measures.
export function octaveBand(ir, sampleRate, centerHz) {
  const band = Float32Array.from(ir);
  const lo = centerHz / Math.SQRT2, hi = Math.min(centerHz * Math.SQRT2, sampleRate * 0.45);
  for (const q of BUTTER_Q) biquad(band, rbj('lowpass', hi, q, sampleRate));
  for (const q of BUTTER_Q) biquad(band, rbj('highpass', lo, q, sampleRate));
  return band;
}

// Total energy of a response, for direct-to-reverberant bookkeeping.
export function energy(ir) {
  let e = 0;
  for (let i = 0; i < ir.length; i++) e += ir[i] * ir[i];
  return e;
}
