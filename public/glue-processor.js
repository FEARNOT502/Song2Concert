// glue-processor.js — the FOH master-bus compressor.
//
// This is the second stage written to replace a Web Audio DynamicsCompressor,
// and for the second set of reasons. As a limiter that node compressed 34 dB
// below its threshold; here the problem was latency. It runs an internal
// look-ahead delay, so a venue with no bus compression could not simply be
// blended past it — mixing the delayed compressed path against an undelayed
// bypass comb-filters the two together, and with the low end lifted the way it
// is here the first notch sat squarely in the bass. Switching venue measured an
// 8 dB dip.
//
// A serial stage with an `amount` that can be ramped removes the need for a
// bypass path at all, which is why this is a worklet rather than a routing
// trick. Two properties make that work:
//
//   · AT ZERO IT IS A WIRE. Not "transparent settings" — the samples are copied.
//     A venue with no console to glue anything gets no glue and no side effects.
//   · NO LATENCY. Output sample n depends on input sample n, so ramping `amount`
//     from 0 changes how hard it works without ever changing WHEN it works.
//
// Deliberately gentle throughout: the source is a finished master that has
// already been through a mastering engineer's bus, and a second helping of 3:1
// on top of that is what congestion sounds like.

const KNEE_DB = 12;

// The detector listens through a high-pass. Every mix-bus compressor made has
// this control, and for exactly the reason it is needed here: the low end is the
// loudest thing on the bus — more so with the loudness compensation lifting it
// 11 dB — so a broadband detector hands the bass a gain pedal for the whole mix,
// and every loud note pulls the vocal down with it. Measured, that was 3.8 dB of
// duck on the voice under a heavy low end. The AUDIO path is untouched; only
// what the compressor listens to is filtered.
const DETECTOR_HP_HZ = 120;

class GlueProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1 }];
  }

  constructor() {
    super();
    const sr = sampleRate;
    // Slow enough to let a kick and a snare through intact before it clamps,
    // and to breathe with the programme rather than with individual hits.
    this.atk = Math.exp(-1 / (0.030 * sr));
    this.rel = Math.exp(-1 / (0.250 * sr));
    this.envDb = -100;
    this.grDb = 0;
    // Two-pole high-pass on the detector, per channel.
    const w = Math.tan(Math.PI * DETECTOR_HP_HZ / sr);
    const n0 = 1 / (1 + Math.SQRT2 * w + w * w);
    this.hp = { b0: n0, b1: -2 * n0, b2: n0,
      a1: 2 * (w * w - 1) * n0, a2: (1 - Math.SQRT2 * w + w * w) * n0 };
    this.hpState = [];
  }

  detect(input, i) {
    let peak = 0;
    for (let c = 0; c < input.length; c++) {
      if (!this.hpState[c]) this.hpState[c] = { x1: 0, x2: 0, y1: 0, y2: 0 };
      const st = this.hpState[c];
      const x = input[c][i];
      const y = this.hp.b0 * x + this.hp.b1 * st.x1 + this.hp.b2 * st.x2
        - this.hp.a1 * st.y1 - this.hp.a2 * st.y2;
      st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
      const m = y < 0 ? -y : y;
      if (m > peak) peak = m;
    }
    return peak;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const frames = out[0].length;
    if (!input || input.length === 0) {
      for (let c = 0; c < out.length; c++) out[c].fill(0);
      return true;
    }

    const amountP = parameters.amount;
    const constant = amountP.length === 1;

    // Exactly a wire when there is nothing to do.
    if (constant && amountP[0] <= 0.001) {
      for (let c = 0; c < out.length; c++) {
        const src = input[c] || input[0];
        if (src) out[c].set(src); else out[c].fill(0);
      }
      this.envDb = -100;
      this.grDb = 0;
      return true;
    }

    for (let i = 0; i < frames; i++) {
      const a = constant ? amountP[0] : amountP[i];
      const thresholdDb = -12 - 6 * a;
      const ratio = 1.2 + 0.8 * a;

      const peak = this.detect(input, i);
      const peakDb = peak > 1e-7 ? 20 * Math.log10(peak) : -140;

      this.envDb = peakDb > this.envDb
        ? this.atk * this.envDb + (1 - this.atk) * peakDb
        : this.rel * this.envDb + (1 - this.rel) * peakDb;

      // Soft knee: the ratio comes in gradually over KNEE_DB around threshold.
      const over = this.envDb - thresholdDb;
      let reduction = 0;
      if (over >= KNEE_DB / 2) {
        reduction = over * (1 - 1 / ratio);
      } else if (over > -KNEE_DB / 2) {
        const x = over + KNEE_DB / 2;
        reduction = ((1 - 1 / ratio) * x * x) / (2 * KNEE_DB);
      }
      this.grDb = reduction;

      // Makeup referenced to a −6 dBFS programme peak, so engaging the stage
      // does not also change the level and read as the venue getting louder.
      const makeupDb = Math.max(0, -6 - thresholdDb) * (1 - 1 / ratio);
      const gain = Math.pow(10, (makeupDb - this.grDb) / 20);

      for (let c = 0; c < out.length; c++) {
        const src = input[c] || input[0];
        out[c][i] = (src ? src[i] : 0) * gain;
      }
    }
    return true;
  }
}

registerProcessor('glue', GlueProcessor);
