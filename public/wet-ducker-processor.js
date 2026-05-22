// wet-ducker-processor.js — AudioWorklet that ducks the WET reverb bus by the
// DRY signal's envelope.
//
// Problem it solves: when only drums/bass play (e.g. the Billie Jean or
// LE SSERAFIM "CRAZY" intros) each hit is followed by near-silence, so the long
// reverb tail is laid bare and sounds awkward — especially in the big venues
// (dome/stadium) with their long RT60. When a vocal/guitar fills that space the
// tail is masked and sounds natural.
//
// So: follow the DRY envelope and open the wet only as much as the dry is busy.
//   • sparse hits  → dry envelope falls between hits → wet closes toward `floor`
//                    → the exposed tail is suppressed
//   • full band    → dry stays busy → wet stays open → ambience preserved
//
// inputs[0] = wet (stereo), inputs[1] = dry sidechain (mono or stereo).
// We normalize the envelope by a slowly-decaying running peak so the behavior is
// independent of absolute track level, then clamp the resulting gain to [floor,1].

class WetDuckerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'floor', defaultValue: 0.22, minValue: 0, maxValue: 1 },
      { name: 'slope', defaultValue: 2.0, minValue: 0.1, maxValue: 8 },
    ];
  }

  constructor() {
    super();
    this.env = 0;        // dry amplitude envelope
    this.peak = 1e-6;    // slowly-decaying running peak (for normalization)
    const sr = sampleRate;
    // fast attack (~4ms), slower release (~80ms) — release sets how fast the wet
    // re-closes after a hit, which is what tames the between-hits tail.
    this.atk = Math.exp(-1 / (0.004 * sr));
    this.rel = Math.exp(-1 / (0.08 * sr));
    this.peakDecay = Math.exp(-1 / (1.5 * sr)); // running peak forgets over ~1.5s
    this.smGain = 0.22; // smoothed output gain (starts at floor-ish)
    this.gSm = Math.exp(-1 / (0.01 * sr)); // 10ms smoothing on the gain itself
  }

  process(inputs, outputs, parameters) {
    const wet = inputs[0];
    const dry = inputs[1];
    const out = outputs[0];
    if (!wet || wet.length === 0) return true;

    const floorP = parameters.floor;
    const slopeP = parameters.slope;
    const frames = out[0].length;

    for (let i = 0; i < frames; i++) {
      // dry mono level for this frame (mean of available dry channels)
      let d = 0;
      if (dry && dry.length) {
        for (let c = 0; c < dry.length; c++) d += Math.abs(dry[c][i] || 0);
        d /= dry.length;
      }
      // envelope follower
      this.env = d > this.env ? this.atk * this.env + (1 - this.atk) * d
                              : this.rel * this.env + (1 - this.rel) * d;
      // running peak for level-independent normalization
      this.peak *= this.peakDecay;
      if (this.env > this.peak) this.peak = this.env;
      const norm = this.peak > 1e-6 ? this.env / this.peak : 0;

      const floor = floorP.length > 1 ? floorP[i] : floorP[0];
      const slope = slopeP.length > 1 ? slopeP[i] : slopeP[0];
      let g = floor + (1 - floor) * Math.min(1, norm * slope);
      // smooth the gain so it doesn't zipper
      this.smGain = this.gSm * this.smGain + (1 - this.gSm) * g;
      const gain = this.smGain;

      for (let c = 0; c < out.length; c++) {
        const wc = wet[c] || wet[0];
        out[c][i] = (wc ? wc[i] : 0) * gain;
      }
    }
    return true;
  }
}

registerProcessor('wet-ducker', WetDuckerProcessor);
