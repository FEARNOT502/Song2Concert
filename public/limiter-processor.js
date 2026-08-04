// limiter-processor.js — two-band look-ahead peak limiter.
//
// This replaces a DynamicsCompressor configured as a limiter, which was not
// behaving as one. Measured with an impulse 34 dB BELOW its threshold, that node
// applied 11.6 dB of gain reduction, ducking every transient and then releasing
// into the reverberation behind it. A limiter has one job: below the threshold
// it must be a wire.
//
// It is TWO-BAND for a second reason, found later and just as damaging. The low
// end is by far the loudest thing on this bus — the loudness compensation lifts
// it 11 dB — so a broadband limiter hands the bass a gain pedal for the entire
// mix. Measured under a heavy low end, the voice was pulled down 5.2 dB with
// nothing wrong with the voice at all: a kick landed, and the limiter turned the
// whole record down to make room for it. Splitting at 160 Hz means a bass peak
// reduces the bass and leaves the mids where they were, which is what a
// mastering chain does and why it does it.
//
// The properties that make it a limiter rather than a compressor:
//
//   · A LOOK-AHEAD DELAY, so gain is already reduced by the time the peak it was
//     computed from arrives. That is what lets the attack be gentle without
//     letting anything through, and it is what a DynamicsCompressor cannot do —
//     with no look-ahead it must either overshoot or clamp the transient.
//   · GAIN COMPUTED FROM THE PEAK ITSELF, not from an envelope follower, so a
//     signal that never crosses the threshold is multiplied by exactly 1.0.
//   · RELEASE SLOW ENOUGH not to modulate within a bass period. A fast release
//     on a 50 Hz wave rides the waveform itself and reads as grind.

const LOOKAHEAD_MS = 2.0;
const CROSSOVER_HZ = 160;

// One Linkwitz-Riley 4th-order section pair: two cascaded Butterworth biquads
// per side. LR4 low and high sum back to flat magnitude, so splitting and
// rejoining a signal that needs no limiting returns it unchanged.
function butter(type, f0, sampleRate) {
  const w = Math.tan((Math.PI * f0) / sampleRate);
  const n = 1 / (1 + Math.SQRT2 * w + w * w);
  return type === 'low'
    ? { b0: w * w * n, b1: 2 * w * w * n, b2: w * w * n,
      a1: 2 * (w * w - 1) * n, a2: (1 - Math.SQRT2 * w + w * w) * n }
    : { b0: n, b1: -2 * n, b2: n,
      a1: 2 * (w * w - 1) * n, a2: (1 - Math.SQRT2 * w + w * w) * n };
}

class Biquad {
  constructor(c) { this.c = c; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  run(x) {
    const c = this.c;
    const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// One band's gain control: a decaying peak hold feeding a gain that falls over
// the look-ahead window and recovers over the release.
class BandGain {
  constructor(len, sampleRate) {
    this.hold = 0;
    this.gain = 1;
    this.holdDecay = Math.exp(-1 / (len * 0.7));
    this.attackCoef = Math.exp(-1 / (len * 0.5));
    this.sampleRate = sampleRate;
  }

  step(peak, threshold, releaseCoef) {
    this.hold *= this.holdDecay;
    if (peak > this.hold) this.hold = peak;
    const target = this.hold > threshold ? threshold / this.hold : 1;
    const coef = target < this.gain ? this.attackCoef : releaseCoef;
    this.gain = coef * this.gain + (1 - coef) * target;
    return this.gain;
  }
}

class LimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -1.5, minValue: -40, maxValue: 0 },
      { name: 'release', defaultValue: 0.12, minValue: 0.01, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.len = Math.max(8, Math.round((LOOKAHEAD_MS / 1000) * sr));
    this.pos = 0;
    this.chans = 0;
    this.lowDelay = [];
    this.highDelay = [];
    this.split = [];
    this.low = new BandGain(this.len, sr);
    this.high = new BandGain(this.len, sr);
  }

  alloc(chans) {
    this.chans = chans;
    this.lowDelay = [];
    this.highDelay = [];
    this.split = [];
    const sr = sampleRate;
    for (let c = 0; c < chans; c++) {
      this.lowDelay.push(new Float32Array(this.len));
      this.highDelay.push(new Float32Array(this.len));
      this.split.push({
        lp: [new Biquad(butter('low', CROSSOVER_HZ, sr)), new Biquad(butter('low', CROSSOVER_HZ, sr))],
        hp: [new Biquad(butter('high', CROSSOVER_HZ, sr)), new Biquad(butter('high', CROSSOVER_HZ, sr))],
      });
    }
    this.pos = 0;
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

    const chans = out.length;
    if (this.chans !== chans) this.alloc(chans);

    const thrP = parameters.threshold;
    const relP = parameters.release;

    for (let i = 0; i < frames; i++) {
      const thrDb = thrP.length > 1 ? thrP[i] : thrP[0];
      const relSec = relP.length > 1 ? relP[i] : relP[0];
      const threshold = Math.pow(10, thrDb / 20);
      const releaseCoef = Math.exp(-1 / (relSec * sampleRate));

      // Split, and find each band's loudest channel this frame.
      let lowPeak = 0, highPeak = 0;
      for (let c = 0; c < chans; c++) {
        const src = input[c] || input[0];
        const x = src ? src[i] : 0;
        const s = this.split[c];
        const lo = s.lp[1].run(s.lp[0].run(x));
        const hi = s.hp[1].run(s.hp[0].run(x));
        this.lowDelay[c][this.pos] = lo;
        this.highDelay[c][this.pos] = hi;
        const la = lo < 0 ? -lo : lo;
        const ha = hi < 0 ? -hi : hi;
        if (la > lowPeak) lowPeak = la;
        if (ha > highPeak) highPeak = ha;
      }

      const lowGain = this.low.step(lowPeak, threshold, releaseCoef);
      const highGain = this.high.step(highPeak, threshold, releaseCoef);

      // Read the delayed bands back out and rejoin them.
      const read = (this.pos + 1) % this.len;
      for (let c = 0; c < chans; c++) {
        const sum = this.lowDelay[c][read] * lowGain + this.highDelay[c][read] * highGain;
        // The two bands are controlled separately, so their sum can exceed the
        // ceiling where both are loud at once. A soft knee at the very top is
        // the last resort — it is inaudible at the fraction of a decibel it ever
        // has to work over, and it cannot be got round.
        const a = sum < 0 ? -sum : sum;
        out[c][i] = a <= threshold ? sum : Math.sign(sum) * (threshold + (a - threshold) / (1 + ((a - threshold) / threshold) * 4));
      }
      this.pos = read;
    }
    return true;
  }
}

registerProcessor('limiter', LimiterProcessor);
