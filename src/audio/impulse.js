// impulse.js — synthesise a venue's impulse response from its room model.
//
// The response has two halves, built by different methods because a real one
// genuinely has two halves:
//
//   EARLY (to the mixing time) — individual reflections from roomacoustics.js's
//   image-source solver. Each has a physical delay, a 1/r level, per-band
//   absorption from the surfaces it bounced off, and an arrival DIRECTION, which
//   is rendered with the interaural time difference and head shadow that
//   direction implies. This is the part the ear uses to size the room and to
//   place it around you, and it is the part a noise generator cannot produce.
//
//   LATE (from the mixing time) — decaying noise, but with a genuinely
//   per-octave decay rate taken from the room's absorption. The bands come from
//   differences of cascaded one-pole lowpasses, which sum back to unity exactly,
//   so the tail starts spectrally flat and then darkens at whatever rate each
//   band's reverberation time dictates. A hall's 125 Hz band outlasting its
//   1 kHz band is not a setting here; it is what the absorption tables produce.
//
// The output is FOUR channels, for true-stereo convolution: the left of the mix
// gets the room response of the left source position and the right gets the
// right's. With a two-channel response the two halves of the mix are effectively
// in separate rooms that never talk to each other.
//
// Levels are physical throughout and are NOT normalised afterwards. A reflection
// at 0.5 really is 6 dB below the direct sound as heard from that seat, and the
// late field is scaled to the statistical reverberant level for the room and
// distance. That is what makes clarity (C80) and the direct-to-reverberant
// ratio come out of the model rather than being dialed in — and what makes a
// big room actually sound bigger instead of merely longer.

import {
  reverbTimes, imageSources, itdg, mixingTime, reverberantRatio, BANDS,
} from './roomacoustics.js';
import {
  VENUE_ROOMS, roomAbsorption, sourcePositions, listenerPosition, listeningDistance, DIRECTIVITY,
} from './venuerooms.js';
import {
  interauralDelay, headShadowCoeffs, applyOnePole,
} from './binaural.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One-pole lowpass coefficient for a corner frequency — derived from the sample
// rate, so a response rendered at 96 kHz for export sounds like the one played
// at 48 kHz. (It previously did not: the coefficients were hard-coded, which
// put every corner an octave high on a hi-res export.)
const onePoleA = (hz, sampleRate) => 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);

// Deposit a single reflection at a fractional sample position.
function depositTap(buf, position, gain) {
  const i = Math.floor(position);
  if (i < 0 || i + 1 >= buf.length) return;
  const frac = position - i;
  buf[i] += gain * (1 - frac);
  buf[i + 1] += gain * frac;
}

// Reflections are grouped before filtering: by arrival direction, and by how
// much high frequency their surfaces took out. One filter pass per group rather
// than per reflection keeps this cheap enough to stay exact.
const AZIMUTH_BINS = 16;
const BRIGHTNESS = [
  { max: Infinity, cutoff: 14000 }, // barely absorbed — concrete, masonry
  { max: 0.70, cutoff: 5500 },      // moderately absorbed
  { max: 0.35, cutoff: 2000 },      // heavily absorbed — audience, treatment
];

function brightnessBin(band) {
  const ratio = band[2] > 0 ? band[5] / band[2] : 1; // 4 kHz vs 500 Hz survival
  for (let i = BRIGHTNESS.length - 1; i >= 0; i--) {
    if (ratio <= BRIGHTNESS[i].max) return i;
  }
  return 0;
}

// Render one source position's early reflections into a pair of ear signals.
function renderEarly(reflections, length, sampleRate) {
  const earL = new Float32Array(length);
  const earR = new Float32Array(length);

  // group[azBin][brightBin] = { taps, elevationSum, weight }
  const groups = new Map();
  for (const r of reflections) {
    const az = Math.round(((r.azimuth + Math.PI) / (2 * Math.PI)) * AZIMUTH_BINS) % AZIMUTH_BINS;
    const br = brightnessBin(r.band);
    const key = az * BRIGHTNESS.length + br;
    let g = groups.get(key);
    if (!g) { g = { az, br, taps: [], elevation: 0, weight: 0 }; groups.set(key, g); }
    g.taps.push(r);
    g.elevation += r.elevation * r.gain;
    g.weight += r.gain;
  }

  const scratch = new Float32Array(length);
  const tmpL = new Float32Array(length);
  const tmpR = new Float32Array(length);

  for (const g of groups.values()) {
    scratch.fill(0);
    for (const r of g.taps) depositTap(scratch, r.time * sampleRate, r.gain);

    // The surfaces' absorption, as a single rolloff for the whole group.
    const a = onePoleA(BRIGHTNESS[g.br].cutoff, sampleRate);
    let lp = 0;
    for (let i = 0; i < length; i++) { lp += a * (scratch[i] - lp); scratch[i] = lp; }

    // This group's direction, at the centre of its bin.
    const azimuth = ((g.az + 0.5) / AZIMUTH_BINS) * 2 * Math.PI - Math.PI;
    const elevation = g.weight > 0 ? g.elevation / g.weight : 0;

    tmpL.set(scratch);
    tmpR.set(scratch);
    applyOnePole(tmpL, headShadowCoeffs(azimuth, -1, sampleRate));
    applyOnePole(tmpR, headShadowCoeffs(azimuth, +1, sampleRate));

    // Whichever ear is on the far side hears it later.
    const itd = interauralDelay(azimuth, elevation) * sampleRate;
    const delayL = azimuth > 0 ? itd : 0;
    const delayR = azimuth > 0 ? 0 : itd;
    accumulate(earL, tmpL, delayL);
    accumulate(earR, tmpR, delayR);
  }
  return { earL, earR };
}

function accumulate(dst, src, delaySamples) {
  const i0 = Math.floor(delaySamples);
  const frac = delaySamples - i0;
  const a = 1 - frac;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v === 0) continue;
    const j = i + i0;
    if (j < dst.length) dst[j] += v * a;
    if (frac > 0 && j + 1 < dst.length) dst[j + 1] += v * frac;
  }
}

// The late field: noise whose every octave decays at its own rate.
//
// Bands are differences of lowpasses at the octave crossovers —
//   band_b = LP_b(x) − LP_(b−1)(x),   band_last = x − LP_last(x)
// — a telescoping sum, so they reconstruct the input EXACTLY no matter what the
// filters are. The tail therefore starts spectrally flat and darkens only
// because the bands run out at different times.
//
// The filters have to be steep, and one-poles are not. At 6 dB per octave a
// lowpass at 177 Hz is only 9 dB down at 500 Hz, so the band carrying the
// 125 Hz decay rate also carries a great deal of midrange — and hands it that
// rate. In Tokyo Dome, where the low band outlasts the mid band by better than
// five to one, that dragged the synthesised mid-band reverberation time to 4.9 s
// against the 3.6 s the room model called for. Cascading three poles per
// crossover puts the bleed far enough down for each band to decay at its own
// rate. Perfect reconstruction is untouched: it follows from the telescoping,
// not from the filter shape.
//
// Going beyond three poles buys almost nothing, because what remains is bleed
// between ADJACENT octaves rather than across the spectrum, and that is partly
// honest: real rooms have smooth reverberation-time curves, not steps. It does
// mean the top octave measures longer than its own figure — it is sitting next
// to a louder, slower neighbour — so the checks in verify-ir test the claims
// that matter (mid-band time, bass ratio, a tail that darkens) rather than
// demanding each octave hit its number in isolation.
const BAND_ORDER = 3;
// Cascaded identical one-poles pull the composite corner down, so each stage is
// placed above the crossover to put the −3 dB point back on it.
const CASCADE_CORRECTION = 1 / Math.sqrt(Math.pow(2, 1 / BAND_ORDER) - 1);

function renderLate(rts, length, sampleRate, rng, fadeIn, fadeFull) {
  const out = new Float32Array(length);
  const nBands = BANDS.length;
  const crossovers = [];
  for (let b = 0; b < nBands - 1; b++) crossovers.push(Math.sqrt(BANDS[b] * BANDS[b + 1]));
  const coefs = crossovers.map((f) => onePoleA(Math.min(f * CASCADE_CORRECTION, sampleRate * 0.45), sampleRate));
  const state = new Float64Array(crossovers.length * BAND_ORDER);

  // Envelopes are stepped by multiplication rather than recomputed with exp()
  // every sample and band — same values, a great deal less arithmetic.
  const env = new Float64Array(nBands).fill(1);
  const step = rts.map((rt) => Math.exp(-Math.log(1000) / Math.max(rt, 0.05) / sampleRate));

  const inStart = Math.floor(fadeIn * sampleRate);
  const inEnd = Math.max(inStart + 1, Math.floor(fadeFull * sampleRate));

  for (let i = 0; i < length; i++) {
    const x = rng() * 2 - 1;
    let sum = 0;
    let lower = 0;
    for (let b = 0; b < crossovers.length; b++) {
      let v = x;
      const a = coefs[b];
      for (let k = 0; k < BAND_ORDER; k++) {
        const idx = b * BAND_ORDER + k;
        state[idx] += a * (v - state[idx]);
        v = state[idx];
      }
      sum += (v - lower) * env[b];
      lower = v;
    }
    sum += (x - lower) * env[nBands - 1];
    for (let b = 0; b < nBands; b++) env[b] *= step[b];

    // Reverberant build-up starts with the first reflection, not at t = 0.
    // Filling the initial gap would erase the sense of distance that the gap is
    // the entire cue for — most of all in the big rooms, where it is tens of
    // milliseconds long.
    let ramp = 1;
    if (i < inStart) ramp = 0;
    else if (i < inEnd) ramp = 0.5 - 0.5 * Math.cos((Math.PI * (i - inStart)) / (inEnd - inStart));
    out[i] = sum * ramp;
  }
  return out;
}

const energyOf = (buf) => {
  let e = 0;
  for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
  return e;
};

// Synthesis costs 30–170 ms depending on the venue, which is several frames, so
// selecting a venue would visibly stutter without this — and the chain is
// rebuilt more than once per venue (again when the worklets finish loading).
// Small and bounded: entries are a few megabytes each and a handful of venues,
// plus the odd export at a different sample rate, is all that ever accumulates.
const IR_CACHE = new Map();
const IR_CACHE_MAX = 6;

// Build the four-channel response for a venue. Pure: no Web Audio, so the
// verification script can measure it in Node.
export function synthesizeIR({ venueId, sampleRate, seed = 1 }) {
  const key = `${venueId}@${sampleRate}#${seed}`;
  const hit = IR_CACHE.get(key);
  if (hit) {
    IR_CACHE.delete(key);   // reinsert, so the Map's order is least-recent-first
    IR_CACHE.set(key, hit);
    return hit;
  }
  const built = synthesize({ venueId, sampleRate, seed });
  IR_CACHE.set(key, built);
  if (IR_CACHE.size > IR_CACHE_MAX) IR_CACHE.delete(IR_CACHE.keys().next().value);
  return built;
}

function synthesize({ venueId, sampleRate, seed }) {
  const room = VENUE_ROOMS[venueId];
  if (!room) throw new Error(`unknown venue: ${venueId}`);

  const { volume } = roomAbsorption(venueId);
  const rts = reverbTimes(roomAbsorption(venueId));
  const listener = listenerPosition(venueId);
  const sources = sourcePositions(venueId);

  const maxRT = Math.max(...rts);
  const seconds = Math.min(maxRT * 1.05 + 0.05, 5);
  const length = Math.max(1, Math.floor(sampleRate * seconds));

  // How far the enumerated reflections carry before the statistical tail takes
  // over. Beyond the mixing time individual images stop being meaningful.
  const tMix = Math.min(0.15, Math.max(0.06, mixingTime(volume)));

  const channels = [];
  const rng = mulberry32(seed * 7919 + 13);

  for (let s = 0; s < 2; s++) {
    const refl = imageSources({
      room: { dims: room.dims, surfaces: room.surfaces },
      source: sources[s],
      listener,
      maxOrder: 4,
      maxTime: tMix,
      directivity: DIRECTIVITY[venueId] ?? 0,
    });
    const erLen = Math.min(length, Math.floor((tMix + 0.02) * sampleRate));
    const { earL, earR } = renderEarly(refl, erLen, sampleRate);

    const gap = Math.max(0.004, itdg(refl));
    for (const ear of [earL, earR]) {
      // taper the enumerated field out as the statistical one takes over
      const from = Math.floor(erLen * 0.75);
      for (let i = from; i < erLen; i++) {
        ear[i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i - from)) / (erLen - from));
      }
    }

    for (const ear of [earL, earR]) {
      const full = new Float32Array(length);
      full.set(ear);
      channels.push({ buf: full, gap });
    }
  }

  // Scale the late field so the total reverberant energy matches the room's
  // statistical value at this distance, with what the enumerated reflections
  // already contribute taken off.
  const targetRev = reverberantRatio({ ...roomAbsorption(venueId), distance: listeningDistance(venueId) });
  const gap = channels[0].gap;
  const lateFull = gap + tMix;
  const lates = [];
  let lateEnergy = 0;
  for (let c = 0; c < 4; c++) {
    const late = renderLate(rts, length, sampleRate, mulberry32(seed * 2654435761 + c * 40503 + 7), gap, lateFull);
    lates.push(late);
    lateEnergy += energyOf(late);
  }
  // The diffuse field is scaled to the room's statistical reverberant energy.
  // The enumerated reflections sit ON TOP of it rather than inside it: Sabine
  // describes the diffuse field, and a few dominant specular paths are extra.
  // Subtracting them was tried and collapses in the stadium, where one return
  // off the far stand outweighs the entire statistical estimate.
  //
  // The four responses are independent and a centred source drives two of them
  // into each ear, so an ear receives half the four-channel total.
  const wantLate = targetRev * 2;
  const lateGain = lateEnergy > 0 ? Math.sqrt(wantLate / lateEnergy) : 0;

  const fadeSamp = Math.floor(length * 0.08);
  const out = [];
  for (let c = 0; c < 4; c++) {
    const buf = channels[c].buf;
    const late = lates[c];
    for (let i = 0; i < length; i++) buf[i] += late[i] * lateGain;
    // end in silence rather than a truncation step
    for (let i = 0; i < fadeSamp; i++) {
      const idx = length - fadeSamp + i;
      buf[idx] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fadeSamp);
    }
    out.push(buf);
  }

  return {
    channels: out,
    sampleRate,
    length,
    metrics: { rts, tMix, gap, targetRev, seconds },
  };
}

// Web Audio wrapper: a four-channel AudioBuffer for true-stereo convolution.
export function buildImpulseResponse(ctx, venueId, seed = 1) {
  const { channels, length } = synthesizeIR({ venueId, sampleRate: ctx.sampleRate, seed });
  const ir = ctx.createBuffer(4, length, ctx.sampleRate);
  for (let c = 0; c < 4; c++) ir.copyToChannel(channels[c], c);
  return ir;
}

export const venueSeed = (id) => id.split('').reduce((a, c) => a + c.charCodeAt(0), 1);
