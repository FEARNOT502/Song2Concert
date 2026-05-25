// impulse.js — synthesize a realistic stereo impulse response (IR) per venue,
// tuned for LIVE-CONCERT sound rather than a generic room.
//
// What real concert sound (and measured IRs) taught this model:
//
//   1. FREQUENCY-DEPENDENT DECAY. Rooms publish RT60 per octave band. We model a
//      time-varying lowpass whose cutoff FALLS as the tail decays, so the reverb
//      darkens over time (highs die first) — the #1 factor in sounding real.
//   2. SHORT LOW-FREQUENCY REVERB. Live-sound's single most important rule is to
//      keep 125 Hz reverb SHORT — long bass tails sound boomy/muddy. So the tail
//      is also progressively HIGH-passed (`lfDamp`): bass energy leaves the tail
//      faster, leaving a clean mid-dominant "space". The punch stays in the dry
//      path. Net result: tight bass + wide ambience + present, un-smeared vocals.
//   3. DIRECT → EARLY → LATE structure with a smooth onset (no wall of noise).
//   4. Cosine fade-out (no truncation click) + L2-energy normalization so every
//      venue sits at a consistent, safe wet level regardless of tail length.
//
// Params per venue:
//   rt60    — mid-band (~500 Hz–1 kHz) reverberation time, seconds
//   lfDamp  — 0..1, how much faster LOWS decay than mids (tight bass = high)
//   hfDamp  — 0..1, how much faster HIGHS decay than mids (dark tail = high)
//   color   — 0..1 initial brightness of the early tail
//   density — 0..1 early-reflection build-up
//   spread  — 0..1 stereo decorrelation of the tail
//   lateral — 0..1 strength of SIDE early reflections (envelopment / "wrap")
//   slap    — optional gentle PA delay-tower cluster (arena/dome/stadium)

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

export function buildImpulseResponse(ctx, params, seed = 1) {
  const {
    rt60, lfDamp = 0.4, hfDamp = 0.6, color = 0.45,
    density = 0.8, spread = 0.6, lateral = 0, slap = false,
  } = params;
  const sr = ctx.sampleRate;

  const seconds = Math.min(Math.max(rt60 * 1.05 + 0.05, 0.1), 10);
  const len = Math.max(1, Math.floor(sr * seconds));
  const ir = ctx.createBuffer(2, len, sr);

  const decay = Math.log(1000) / Math.max(rt60, 0.05); // per-second, ~-60dB at rt60

  // time-varying lowpass coefficient: bright onset → dark tail (HF damping)
  const aStart = 0.10 + color * 0.5;
  const aEnd = aStart * (1 - hfDamp * 0.92);

  // time-varying highpass amount: how much low end is removed from the tail.
  // hpStart ≈ 0 (full bass at the onset transient), rising to hpEnd by the tail.
  // The highpass is implemented as (signal - slowLowpass); `hpAmt` scales it in.
  const hpEnd = lfDamp; // 0..1 fraction of low end removed by end of tail
  const hpCoef = 0.0016; // ~120 Hz corner for the bass-tracking lowpass

  const earlyDur = Math.min(0.018 + rt60 * 0.012, 0.1);
  const earlySamp = Math.floor(earlyDur * sr);
  const fadeSamp = Math.floor(len * 0.1);

  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    const rndInd = mulberry32(seed * 7919 + ch * 104729);
    const rndShared = mulberry32(seed * 7919 + 555);
    let lp = 0;       // lowpass state (HF damping)
    let bass = 0;     // slow lowpass state (tracks the low band, for HF subtract)

    for (let i = 0; i < len; i++) {
      const tSec = i / sr;
      // Tighter late decay (steeper after the early window) raises clarity (C80)
      // so vocal / bass / guitar / drums stay distinct instead of smearing.
      const env = Math.exp(-decay * 1.18 * tSec);
      const k = env; // 1 at onset → 0 at floor

      // decorrelated noise (spread blends toward a shared mono noise)
      const wMono = rndShared() * 2 - 1;
      const wInd = rndInd() * 2 - 1;
      const white = wMono * (1 - spread) + wInd * spread;

      // HF damping: lowpass whose corner falls over the tail
      const a = aEnd + (aStart - aEnd) * k;
      lp += a * (white - lp);

      // LF damping: progressively subtract the low band as the tail decays.
      // bass = slow lowpass of the (HF-damped) signal; hpAmt grows from 0→hpEnd.
      bass += hpCoef * (lp - bass);
      const hpAmt = hpEnd * (1 - k); // 0 at onset → hpEnd at the tail
      const shaped = lp - hpAmt * bass;

      // smooth early-reflection build-up
      let earlyGain = 1;
      if (i < earlySamp) {
        const r = i / earlySamp;
        earlyGain = (0.5 - 0.5 * Math.cos(Math.PI * r)) * (0.35 + density * 0.65);
      }

      d[i] = shaped * env * earlyGain;
    }

    // Early reflections. A snare (or any sharp transient) convolved with only a
    // few DISCRETE taps rings/flutters — the ear hears each tap as a separate
    // echo, which is the "awkward snare reverb" problem. We instead lay down a
    // DENSER, time-jittered cluster of early reflections so the transient gets a
    // smooth diffuse response. Each tap gets a randomized time + gain so no taps
    // line up into a periodic comb (flutter echo).
    //
    // Crucially the cluster must START RIGHT AFTER the direct sound and stay
    // CONTINUOUS into the late tail. Big rooms have low `density`, which used to
    // leave the first ~40ms nearly empty; combined with the pre-delay that made
    // the reverb arrive as a separate, late "chh" after the kick/snare "tak".
    // So the early field now begins at ~2ms and its tap COUNT has a floor that is
    // independent of density (density only scales late build-up / level), filling
    // the gap so the tail fuses onto the transient.
    const erRnd = mulberry32(seed * 2654435761 + ch * 40503 + 17);
    const erCount = Math.round(26 + density * 16); // was 10–18; floor raised so big rooms aren't sparse
    const erWindow = Math.min(0.05 + rt60 * 0.02, 0.12); // seconds of early field
    for (let kk = 0; kk < erCount; kk++) {
      // spread taps across the early window, denser toward the start
      const frac = Math.pow((kk + 0.5) / erCount, 1.3);
      const tt = (0.002 + frac * erWindow) * (1 + rt60 * 0.03); // start ~2ms (was 6ms)
      const jitter = Math.floor((erRnd() - 0.5) * 0.0020 * sr); // ±~1ms
      const tap = Math.floor(tt * sr) + jitter;
      if (tap > 0 && tap < len) {
        const sign = erRnd() < 0.5 ? -1 : 1;
        // level keeps a density-independent base so the gap is always filled,
        // plus a density-scaled part for room character.
        const g = (0.05 + 0.07 * density) * (1 - 0.6 * frac) * (0.6 + erRnd() * 0.4);
        d[tap] += sign * g * Math.exp(-decay * (tap / sr));
      }
    }

    // PA delay-tower energy for the big rooms (arena/dome/stadium). The towers
    // re-emit the sound tens of ms late and add to the venue's sense of SIZE.
    // But in a well-run show the towers are TIME-ALIGNED to the main PA, so from
    // a GOOD seat you do NOT hear them as discrete "tk… tk… tk" slap-back echoes
    // — that periodic cluster was the awkward kick/snare artifact on sparse
    // intros. So we KEEP the energy the towers contribute (the reverb/ambience is
    // NOT reduced) but render it as a CONTINUOUS, decorrelated diffuse cluster
    // spread across ~60–240ms instead of 3 discrete bursts: many jittered,
    // smoothly-enveloped taps with no regular spacing → a spacious wash that
    // thickens the tail, never a flutter or a separate echo.
    if (slap) {
      const slapRnd = mulberry32(seed * 1597334677 + ch * 19349663 + 71);
      const regionStart = 0.06;                          // ~60ms in
      const regionEnd = Math.min(0.24, seconds * 0.9);   // out to ~240ms
      const towerTaps = 28;
      for (let s = 0; s < towerTaps; s++) {
        // jittered position across the region (no regular spacing → no comb)
        const frac = (s + slapRnd()) / towerTaps;
        const tt = regionStart + frac * (regionEnd - regionStart);
        const center = Math.floor(tt * sr);
        const burst = Math.max(3, Math.floor((0.003 + slapRnd() * 0.004) * sr)); // 3–7ms smear
        // level fades across the region; total energy comparable to the old
        // slaps so the big-space body is preserved (the ambience isn't reduced)
        const peak = 0.030 * (1 - 0.5 * frac) * (0.6 + slapRnd() * 0.4) * Math.exp(-decay * tt);
        const pol = slapRnd() < 0.5 ? -1 : 1; // random polarity → decorrelated, not hard L/R inverse
        for (let b = 0; b < burst; b++) {
          const idx = center + b;
          if (idx > 0 && idx < len) {
            const w = 0.5 - 0.5 * Math.cos((Math.PI * b) / burst); // soft attack/decay
            d[idx] += peak * w * (slapRnd() * 2 - 1) * pol;
          }
        }
      }
    }

    // cosine fade-out → ends in silence
    for (let i = 0; i < fadeSamp; i++) {
      const idx = len - fadeSamp + i;
      d[idx] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fadeSamp);
    }
  }

  // ── Lateral (side) reflections → "wrapped from the sides" spaciousness ──
  // Apparent source width (ASW) and listener envelopment (LEV) — the concert
  // hall's signature "sound arrives from the sides and surrounds you" — come
  // almost entirely from reflections that arrive LATERALLY. A lateral arrival
  // reaches the two ears with an inter-aural TIME difference (~0.3–0.7ms ≈ a
  // source near 90° off-axis); that inter-channel decorrelation is the cue the
  // ear reads as width/envelopment. The random L/R tail (via `spread`) gives
  // diffuse decorrelation but no directional EARLY structure, so we add it
  // explicitly here: each lateral reflection is written to BOTH channels with a
  // small inter-channel time offset (and an alternating leading ear), plus a
  // slight level difference (ILD). It stays mono-safe — a time offset, not a
  // phase inversion, so it doesn't cancel when summed to mono. Scaled by
  // `lateral`: strong in the hall, present-but-subtle in the intimate club.
  if (lateral > 0) {
    const L = ir.getChannelData(0);
    const R = ir.getChannelData(1);
    const latRnd = mulberry32(seed * 2246822519 + 9176);
    const count = Math.round(8 + lateral * 8);              // 8..16 lateral taps
    const winStart = 0.012;                                 // ~12ms after direct
    const winEnd = Math.min(0.02 + rt60 * 0.035, 0.095);    // out to ~95ms (bigger = wider)
    for (let n = 0; n < count; n++) {
      const frac = Math.max(0, Math.min(1, (n + 0.5 + (latRnd() - 0.5) * 0.7) / count));
      const t = winStart + frac * (winEnd - winStart);
      const near = Math.floor(t * sr);
      const itd = Math.max(1, Math.floor((0.0003 + latRnd() * 0.0004) * sr)); // 0.3–0.7ms ITD
      const far = near + itd;
      const sign = latRnd() < 0.5 ? -1 : 1;
      // prominent early, fading across the window; overall level set by `lateral`
      const g = lateral * 0.12 * (1 - 0.7 * frac) * (0.6 + latRnd() * 0.4) * Math.exp(-decay * t);
      if (near > 0 && far < len) {
        if (latRnd() < 0.5) {            // left ear leads → image pulls left
          L[near] += sign * g;
          R[far] += sign * g * 0.92;     // 0.92 = small ILD
        } else {                          // right ear leads → image pulls right
          R[near] += sign * g;
          L[far] += sign * g * 0.92;
        }
      }
    }
  }

  // ── L2 (energy) normalization ───────────────────────────────────────
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) energy += d[i] * d[i];
  }
  const l2 = Math.sqrt(energy);
  if (l2 > 0) {
    const target = 1.15;
    const g = target / l2;
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }

  return ir;
}
