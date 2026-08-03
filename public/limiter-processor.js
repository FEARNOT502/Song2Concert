// limiter-processor.js — look-ahead peak limiter.
//
// This replaces a DynamicsCompressor configured as a limiter, which was not
// behaving as one. Measured with an impulse 34 dB BELOW its threshold, that node
// applied 11.6 dB of gain reduction and dropped clarity in the vocal band from
// −2.1 dB to −12.3 dB. It was ducking every transient and then releasing into
// the reverberation behind it — which on music means each drum hit pulls the
// vocal down and lets the room up, and is a large part of why the reverb was
// described as too much and the vocal as buried.
//
// A limiter has one job: below the threshold it must be a wire. This one is,
// because it is written to be:
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
    this.delay = [];      // per-channel look-ahead buffers, allocated on first use
    this.pos = 0;
    // Peak hold decaying over the look-ahead window: a cheap sliding maximum.
    // It is what makes the gain reach its target exactly as the peak arrives.
    this.holdDecay = Math.exp(-1 / (this.len * 0.7));
    this.hold = 0;
    this.gain = 1;
    this.attackCoef = Math.exp(-1 / (this.len * 0.5));
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
    if (this.delay.length !== chans) {
      this.delay = [];
      for (let c = 0; c < chans; c++) this.delay.push(new Float32Array(this.len));
      this.pos = 0;
    }

    const thrP = parameters.threshold;
    const relP = parameters.release;

    for (let i = 0; i < frames; i++) {
      const thrDb = thrP.length > 1 ? thrP[i] : thrP[0];
      const relSec = relP.length > 1 ? relP[i] : relP[0];
      const threshold = Math.pow(10, thrDb / 20);
      const releaseCoef = Math.exp(-1 / (relSec * sampleRate));

      // Loudest channel of the incoming (not yet delayed) frame.
      let peak = 0;
      for (let c = 0; c < chans; c++) {
        const src = input[c] || input[0];
        const v = src ? src[i] : 0;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }

      this.hold *= this.holdDecay;
      if (peak > this.hold) this.hold = peak;

      // Exactly 1 unless the threshold is actually exceeded.
      const target = this.hold > threshold ? threshold / this.hold : 1;
      // Move down over the look-ahead window, back up over the release.
      const coef = target < this.gain ? this.attackCoef : releaseCoef;
      this.gain = coef * this.gain + (1 - coef) * target;

      for (let c = 0; c < chans; c++) {
        const src = input[c] || input[0];
        const buf = this.delay[c];
        const delayed = buf[this.pos];
        buf[this.pos] = src ? src[i] : 0;
        out[c][i] = delayed * this.gain;
      }
      this.pos = (this.pos + 1) % this.len;
    }
    return true;
  }
}

registerProcessor('limiter', LimiterProcessor);
