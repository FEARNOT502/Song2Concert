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
    density = 0.8, spread = 0.6, slap = false,
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

    // a few discrete early reflections for a sense of size (kept modest)
    const erTimes = [0.009, 0.017, 0.026, 0.038];
    erTimes.forEach((tt, kk) => {
      const tap = Math.floor(tt * sr * (1 + rt60 * 0.03));
      if (tap < len) {
        const sign = (kk % 2 === 0 ? 1 : -1) * (ch === 0 ? 1 : -1);
        d[tap] += sign * (0.16 - kk * 0.03) * density * Math.exp(-decay * (tap / sr));
      }
    });

    // gentle, decaying PA delay-tower slap cluster for the big rooms
    if (slap) {
      [0.075, 0.145, 0.215].forEach((s, n) => {
        const tap = Math.floor(s * sr);
        if (tap < len) d[tap] += (0.13 / (n + 1)) * (ch === 0 ? 1 : -1) * Math.exp(-decay * s);
      });
    }

    // cosine fade-out → ends in silence
    for (let i = 0; i < fadeSamp; i++) {
      const idx = len - fadeSamp + i;
      d[idx] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fadeSamp);
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
