// vocal-demask-processor.js — AudioWorklet that keeps the centered vocal cutting
// through dense mixes WITHOUT changing its baseline level/clarity.
//
// The uploaded file is a finished stereo mix (no separate vocal stem), but the
// lead vocal almost always sits in the CENTER (Mid = L+R) within the presence
// band (~1.5–5 kHz). It gets "buried" when WIDE instruments (Side = L−R) fill
// that same band. So:
//
//   input[0] = Mid presence band  (the vocal carrier — also what we boost)
//   input[1] = Side presence band (the masker — sidechain only)
//   output[0] = input[0] * g      (the extra presence to ADD back to the center)
//
//   g rises with how much the SIDE competes with the vocal in this band:
//     f = envSide / (envVocal + envSide)        // 0..1, "fraction that is masker"
//     g = min(maxAdd, maxAdd * f * sens)
//
// - No wide instruments → envSide≈0 → f≈0 → g≈0 → nothing added → sound is
//   IDENTICAL to baseline (the "same size & clarity as now" requirement).
// - Centered instruments (snare, center gtr) live in the Mid, so they RAISE
//   envVocal and LOWER f → they don't trigger a boost (and a transient snare,
//   with the slow-ish release, can't pump it). Only wide masking lifts the vocal.
// - The carrier is the real Mid presence, so when the center is empty (pure
//   instrumental on the sides) there's nothing to boost → no artifact.

class VocalDemaskProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // max extra presence added at full masking (0.8 ≈ +5 dB in-band)
      { name: 'maxAdd', defaultValue: 0.8, minValue: 0, maxValue: 2 },
      // how quickly the boost reaches max as the side fraction grows
      { name: 'sens', defaultValue: 1.8, minValue: 0.1, maxValue: 6 },
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.envV = 0;   // vocal (Mid) presence envelope
    this.envM = 0;   // masker (Side) presence envelope
    this.g = 0;      // smoothed boost gain
    this.atk = Math.exp(-1 / (0.015 * sr)); // 15ms envelope attack
    this.rel = Math.exp(-1 / (0.20 * sr));  // 200ms release → rides density, not hits
    this.gSm = Math.exp(-1 / (0.03 * sr));  // 30ms smoothing on the gain (no zipper)
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const o = out[0];
    const voc = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const msk = inputs[1] && inputs[1][0] ? inputs[1][0] : null;
    const frames = o.length;

    const maxAddP = parameters.maxAdd;
    const sensP = parameters.sens;

    for (let i = 0; i < frames; i++) {
      const vs = voc ? voc[i] : 0;
      const ms = msk ? msk[i] : 0;
      const av = vs < 0 ? -vs : vs;
      const am = ms < 0 ? -ms : ms;

      // envelope followers (fast-ish attack, slow release)
      this.envV = av > this.envV ? this.atk * this.envV + (1 - this.atk) * av
                                 : this.rel * this.envV + (1 - this.rel) * av;
      this.envM = am > this.envM ? this.atk * this.envM + (1 - this.atk) * am
                                 : this.rel * this.envM + (1 - this.rel) * am;

      // fraction of presence-band energy coming from the wide instruments
      const f = this.envM / (this.envV + this.envM + 1e-6);

      const maxAdd = maxAddP.length > 1 ? maxAddP[i] : maxAddP[0];
      const sens = sensP.length > 1 ? sensP[i] : sensP[0];
      let g = maxAdd * f * sens;
      if (g > maxAdd) g = maxAdd;
      if (g < 0) g = 0;

      // smooth the gain so it doesn't zipper / pump on transients
      this.g = this.gSm * this.g + (1 - this.gSm) * g;

      o[i] = vs * this.g; // the presence to ADD back to the center
    }
    return true;
  }
}

registerProcessor('vocal-demask', VocalDemaskProcessor);
