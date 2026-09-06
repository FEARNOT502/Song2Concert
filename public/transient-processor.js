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

class TransientProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // How hard to lean on attacks. 1.0 ≈ +6 dB on a sharp hit.
      { name: 'amount', defaultValue: 1.0, minValue: 0, maxValue: 4 },
      // Ceiling on the boost, so a pathological transient cannot run away.
      { name: 'maxBoost', defaultValue: 2.0, minValue: 0, maxValue: 6 },
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
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
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    if (!input || input.length === 0) {
      for (let c = 0; c < out.length; c++) out[c].fill(0);
      return true;
    }

    // The two envelopes and the smoothed gain each carry forward, so one
    // non-finite sample would make this send emit NaN indefinitely — and it sums
    // straight into the direct path. See limiter-processor.js.
    if (!(this.envFast === this.envFast && this.envSlow === this.envSlow && this.g === this.g)) {
      this.envFast = 0; this.envSlow = 0; this.g = 0;
    }

    const frames = out[0].length;
    // Which array each output channel reads, resolved once per block.
    const srcs = this.srcs || (this.srcs = []);
    for (let c = 0; c < out.length; c++) srcs[c] = input[c] || input[0] || null;
    const amountP = parameters.amount;
    const maxP = parameters.maxBoost;
    const chans = input.length;

    for (let i = 0; i < frames; i++) {
      // Drive the detector from the loudest channel so a hard-panned hit still
      // triggers, and so both channels get the same gain — anything else would
      // wander the stereo image on every drum beat.
      let peak = 0;
      for (let c = 0; c < chans; c++) {
        const v = input[c][i];
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }

      this.envFast = peak > this.envFast
        ? this.fastAtk * this.envFast + (1 - this.fastAtk) * peak
        : this.fastRel * this.envFast + (1 - this.fastRel) * peak;
      this.envSlow = peak > this.envSlow
        ? this.slowAtk * this.envSlow + (1 - this.slowAtk) * peak
        : this.slowRel * this.envSlow + (1 - this.slowRel) * peak;

      const amount = amountP.length > 1 ? amountP[i] : amountP[0];
      const maxBoost = maxP.length > 1 ? maxP[i] : maxP[0];

      // How far the leading edge has risen above the steady state.
      let excess = this.envSlow > 1e-7 ? this.envFast / this.envSlow - 1 : 0;
      if (excess < 0) excess = 0;
      let g = amount * excess;
      if (g > maxBoost) g = maxBoost;

      this.g = this.gSm * this.g + (1 - this.gSm) * g;

      const gain = this.g;
      for (let c = 0; c < out.length; c++) {
        const src = srcs[c];
        out[c][i] = (src ? src[i] : 0) * gain;
      }
    }
    return true;
  }
}

registerProcessor('transient', TransientProcessor);
