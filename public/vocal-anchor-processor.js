// vocal-anchor-processor.js — hold the lead vocal at a CONSTANT level relative
// to the rest of the mix, whatever the arrangement is doing.
//
// This replaces a de-masker that boosted the vocal in proportion to how much
// wide instrumentation competed with it. That design had the flaw its own
// mechanism guarantees: in a dense chorus the boost ran to its +3.8 dB ceiling
// and in a sparse verse it sat at zero, so the vocal audibly jumped in level
// every time a section changed. It was creating the very problem it was named
// after solving.
//
// The fix is to anchor rather than to compensate. The processor learns what
// share of the programme this particular song's vocal normally occupies, over a
// window long enough to span sections, and then lifts only the moments that fall
// below that song's own norm:
//
//   r      = envVocal / envProgramme        the vocal's current share
//   rLong  = a very slow average of r       this song's normal share
//   g      = clamp(rLong / r, 1, ceiling)   restore it when it drops
//
// So the reference is the track itself, not a fixed target. A song mixed with a
// quiet, buried vocal keeps its quiet vocal; what it does not get is a vocal
// that is quiet in one section and forward in the next. And where the vocal is
// already at or above its norm, g is exactly 1 and nothing is added.
//
// Two things keep it from misfiring:
//
//   · The time constants are in SECONDS, not milliseconds. The processor rides
//     arrangement density, not syllables, so it cannot pump on individual words.
//   · A gate freezes both the gain and the learned norm whenever the centre
//     presence band falls away. Without a vocal stem there is no way to tell a
//     quiet vocal from no vocal, so during an instrumental break the ratio would
//     collapse and the processor would try to boost the backing track into the
//     hole where the singer used to be. Frozen, it does nothing and waits.
//
//   input[0] = centre (Mid) presence band     input[1] = full programme (stereo)
//   output[0] = the presence to ADD to the centre

class VocalAnchorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Ceiling on the correction. 0.63 ≈ +4.2 dB.
      //
      // Raising this only affects dense passages, which is the point. The
      // correction is rlong/r − 1, proportional to how far the vocal has fallen
      // below its own norm, so a verse where the vocal already sits at or above
      // that norm asks for nothing and gets nothing no matter what the ceiling
      // is. Only the sections where the arrangement piles up — where the deficit
      // is largest and the old ceiling was the binding constraint — move.
      { name: 'maxBoost', defaultValue: 0.63, minValue: 0, maxValue: 2 },
      // How far below its running peak the centre band may fall before the
      // processor decides the singer has stopped and freezes.
      { name: 'gate', defaultValue: 0.12, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.envV = 0;
    this.envP = 0;
    // Envelope followers slow enough to describe a section rather than a note.
    this.atk = Math.exp(-1 / (0.10 * sr));
    this.rel = Math.exp(-1 / (0.80 * sr));
    // The learned norm: a 15-second average, so a whole verse cannot drag it.
    this.longCoef = Math.exp(-1 / (15.0 * sr));
    this.rLong = 0;
    this.primed = 0;      // ramps in over the first seconds, before rLong means anything
    this.peakV = 1e-6;
    this.peakDecay = Math.exp(-1 / (8.0 * sr));
    this.g = 0;
    // Asymmetric smoothing on the correction: come in over a fifth of a second,
    // let go over a second and a half. Anything faster is audible as the vocal
    // being ridden; much slower and a chorus is half over before the correction
    // has arrived.
    this.gUp = Math.exp(-1 / (0.20 * sr));
    this.gDown = Math.exp(-1 / (1.50 * sr));
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const o = out[0];
    const voc = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const prog = inputs[1] && inputs[1].length ? inputs[1] : null;
    const progChans = prog ? prog.length : 0;
    if (!voc) { o.fill(0); return true; }

    const frames = o.length;
    const maxP = parameters.maxBoost;
    const gateP = parameters.gate;

    for (let i = 0; i < frames; i++) {
      const maxBoost = maxP.length > 1 ? maxP[i] : maxP[0];
      const gateRatio = gateP.length > 1 ? gateP[i] : gateP[0];
      const vs = voc[i];
      const av = vs < 0 ? -vs : vs;
      // Loudest channel, not the average of the two: a downmix lets wide
      // material cancel itself out of the reference.
      let ap = 0;
      for (let c = 0; c < progChans; c++) {
        const v = prog[c][i];
        const m = v < 0 ? -v : v;
        if (m > ap) ap = m;
      }

      this.envV = av > this.envV ? this.atk * this.envV + (1 - this.atk) * av
                                 : this.rel * this.envV + (1 - this.rel) * av;
      this.envP = ap > this.envP ? this.atk * this.envP + (1 - this.atk) * ap
                                 : this.rel * this.envP + (1 - this.rel) * ap;

      this.peakV *= this.peakDecay;
      if (this.envV > this.peakV) this.peakV = this.envV;

      // Is the singer present at all? If not, hold everything as it stands.
      const singing = this.envV > this.peakV * gateRatio && this.envP > 1e-5;

      let target = 0;
      if (singing) {
        const r = this.envV / (this.envP + 1e-9);
        this.rLong = this.longCoef * this.rLong + (1 - this.longCoef) * r;
        if (this.primed < 1) this.primed = Math.min(1, this.primed + 1 / (8.0 * sampleRate));
        const want = r > 1e-9 ? this.rLong / r - 1 : 0;
        target = Math.max(0, Math.min(maxBoost, want)) * this.primed;
      } else {
        target = this.g; // frozen
      }

      const coef = target > this.g ? this.gUp : this.gDown;
      this.g = coef * this.g + (1 - coef) * target;

      o[i] = vs * this.g;
    }
    return true;
  }
}

registerProcessor('vocal-anchor', VocalAnchorProcessor);
