// transient-processor.js — emphasise the ATTACK of a band without touching its
// sustain.
//
// This exists because the obvious way to make a kick and a snare hit harder — a
// static EQ boost at 60 Hz and 4.5 kHz — is the wrong tool for a finished
// stereo master. A boost at 60 Hz raises the bass guitar, the low piano and the
// room's own rumble along with the kick, and a boost at 4.5 kHz raises vocal
// sibilance, cymbals and guitar pick noise along with the snare crack. What made
// the mix sound thick and harsh was never the kick and snare; it was everything
// else that lives in those bands.
//
// A transient shaper separates them the way a static filter cannot: by SPEED.
// A kick and a snare have attacks measured in a couple of milliseconds; a vocal,
// a cymbal wash and a sustained bass note do not. Comparing a fast envelope with
// a slow one isolates exactly the fast-rising part of the band and leaves
// everything steady-state alone.
//
// The output is the INCREMENT — what to add — not the processed signal. With no
// transient present it is silence, so the path contributes nothing at all and
// the sound is bit-identical to having it switched out.
//
// ── ALL THREE BANDS IN ONE PROCESSOR ────────────────────────────────────────
//
// This was three AudioWorkletNodes, each fed by its own BiquadFilterNode and
// summed through its own GainNode: nine nodes doing one job. Every one of them
// costs a fixed amount per render quantum before any arithmetic happens —
// channel plumbing, parameter arrays, a JavaScript call across the audio
// thread's boundary — and on a phone that fixed cost is a real share of the
// budget. The band-splitting filters are two biquads each and cost almost
// nothing inline.
//
// Nine nodes became one, and the arithmetic is identical: the same bandpass
// coefficients, the same envelope constants, the same increment summed the same
// way. The bands are handed in through processorOptions so the table stays in
// graph.js next to the reasoning for it.

// A single 2-pole bandpass, matching BiquadFilterNode's 'bandpass' — constant
// peak gain of 1 at the centre frequency.
function bandpassCoefs(f0, Q, sr) {
  const w0 = (2 * Math.PI * f0) / sr;
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

class Band {
  constructor({ frequency, Q, amount, gain }, sr) {
    this.c = bandpassCoefs(frequency, Q, sr);
    this.amount = amount;
    this.out = gain;
    // Per-channel filter state; the detector is shared, so that both channels
    // get the same gain and a drum beat cannot wander the stereo image.
    this.x1 = [0, 0]; this.x2 = [0, 0]; this.y1 = [0, 0]; this.y2 = [0, 0];
    // Fast envelope: quick enough to ride the leading edge of a drum hit.
    this.fastAtk = Math.exp(-1 / (0.0008 * sr));
    this.fastRel = Math.exp(-1 / (0.030 * sr));
    // Slow envelope: the reference the fast one is compared against. Its attack
    // is deliberately slower than any drum's, so it represents "where the band
    // was sitting" just before the hit.
    this.slowAtk = Math.exp(-1 / (0.040 * sr));
    this.slowRel = Math.exp(-1 / (0.250 * sr));
    this.envFast = 0;
    this.envSlow = 0;
    this.g = 0;
    this.gSm = Math.exp(-1 / (0.002 * sr)); // 2 ms, fast enough not to blunt the attack
    this.filtered = [0, 0];
  }

  filter(c, x) {
    const k = this.c;
    const y = k.b0 * x + k.b1 * this.x1[c] + k.b2 * this.x2[c]
      - k.a1 * this.y1[c] - k.a2 * this.y2[c];
    this.x2[c] = this.x1[c]; this.x1[c] = x;
    this.y2[c] = this.y1[c]; this.y1[c] = y;
    this.filtered[c] = y;
    return y;
  }

  // Everything here carries forward, so one non-finite sample would make this
  // send emit NaN indefinitely — and it sums straight into the direct path. See
  // limiter-processor.js.
  sane() {
    if (this.envFast === this.envFast && this.envSlow === this.envSlow && this.g === this.g
      && this.y1[0] === this.y1[0] && this.y1[1] === this.y1[1]) return;
    this.envFast = 0; this.envSlow = 0; this.g = 0;
    this.x1 = [0, 0]; this.x2 = [0, 0]; this.y1 = [0, 0]; this.y2 = [0, 0];
  }

  step(peak, amount, maxBoost) {
    this.envFast = peak > this.envFast
      ? this.fastAtk * this.envFast + (1 - this.fastAtk) * peak
      : this.fastRel * this.envFast + (1 - this.fastRel) * peak;
    this.envSlow = peak > this.envSlow
      ? this.slowAtk * this.envSlow + (1 - this.slowAtk) * peak
      : this.slowRel * this.envSlow + (1 - this.slowRel) * peak;

    // How far the leading edge has risen above the steady state.
    let excess = this.envSlow > 1e-7 ? this.envFast / this.envSlow - 1 : 0;
    if (excess < 0) excess = 0;
    let g = amount * this.amount * excess;
    if (g > maxBoost) g = maxBoost;
    this.g = this.gSm * this.g + (1 - this.gSm) * g;
    return this.g * this.out;
  }
}

class TransientProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Overall depth, multiplying each band's own figure. 1.0 leaves the table
      // in graph.js as written.
      { name: 'amount', defaultValue: 1.0, minValue: 0, maxValue: 4 },
      // Ceiling on the boost, so a pathological transient cannot run away.
      { name: 'maxBoost', defaultValue: 2.0, minValue: 0, maxValue: 6 },
    ];
  }

  constructor(options) {
    super();
    const spec = (options && options.processorOptions && options.processorOptions.bands) || [];
    this.bands = spec.map((b) => new Band(b, sampleRate));
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    if (!input || input.length === 0 || this.bands.length === 0) {
      for (let c = 0; c < out.length; c++) out[c].fill(0);
      return true;
    }

    for (const band of this.bands) band.sane();

    const frames = out[0].length;
    const amountP = parameters.amount;
    const maxP = parameters.maxBoost;
    const chans = input.length;

    for (let i = 0; i < frames; i++) {
      const amount = amountP.length > 1 ? amountP[i] : amountP[0];
      const maxBoost = maxP.length > 1 ? maxP[i] : maxP[0];

      for (let c = 0; c < out.length; c++) out[c][i] = 0;

      for (let b = 0; b < this.bands.length; b++) {
        const band = this.bands[b];
        // Filter every channel, and drive the detector from the loudest of them
        // so a hard-panned hit still triggers.
        let peak = 0;
        for (let c = 0; c < chans; c++) {
          const v = band.filter(c, input[c][i]);
          const a = v < 0 ? -v : v;
          if (a > peak) peak = a;
        }
        const gain = band.step(peak, amount, maxBoost);
        if (gain === 0) continue;
        for (let c = 0; c < out.length; c++) {
          out[c][i] += band.filtered[c < chans ? c : 0] * gain;
        }
      }
    }
    return true;
  }
}

registerProcessor('transient', TransientProcessor);
