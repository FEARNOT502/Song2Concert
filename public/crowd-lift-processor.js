// crowd-lift-processor.js — bring a live recording's audience forward.
//
// An audience is thousands of voices with nothing in common, so it reaches the
// two microphones as two different signals: it lives in the SIDE of a live mix
// at least as much as in its centre. The lead vocal, the kick and the bass are
// centred and have almost no side at all. Lifting the crowd out of the side
// therefore lifts the crowd and leaves the centre where it was.
//
// HOW it goes back in matters as much as how much. The first version returned
// it as side — +x on the left, −x on the right — and at the gain a live
// recording needs that turned the whole output anti-correlated: an L/R
// correlation of −0.71 in the dome, against the source's +0.44. On headphones
// anti-correlated sound is heard inside the head, and the crowd sounded both
// artificial and piled into the middle. An audience in a room reaches the two
// ears uncorrelated, not opposed. So each ear's share is passed through its own
// short all-pass diffuser before it is added: every frequency at the same
// level, the phase scrambled differently either side, the crowd spread over a
// few milliseconds the way a room spreads it.
//
// How much depends on what is happening. Over the full band, with the singer in
// front, the side carries the wide instruments as much as the audience. When
// the audience IS the programme — between songs, a chant, a call and response —
// the side rises to meet the centre, because uncorrelated sound is as much side
// as centre. So the lift follows that ratio, read in the crowd's band:
//
//   r = envSide / envMid
//   f = clamp((r − low) / (high − low), 0, 1)
//   g = amount · (base + (1 − base) · f)
//
//   input[0] = side, the band to lift     input[1] = side, the band to read
//   input[2] = centre, the band to read
//   output[0] = [ g · AP_L(side), −g · AP_R(side) ]   to ADD to the mix
//
// At amount 0 the output is exactly zero, so the chain is the chain it was.
// The time constants are slow on purpose: the lift should rise with a cheer and
// fall back as the band comes in, not flutter on every clap.

// Where the side/centre ratio starts to say "audience" and where it is sure.
// Measured on two Tokyo Dome live recordings, through this band and these
// envelopes: under the band the side runs 0.35–0.6 of the centre, 0.7–0.9 where
// the audience sings along, and 1.0–1.25 in the cheering between songs.
const RATIO_LOW = 0.55;
const RATIO_HIGH = 1.0;
// Below this the band is the noise floor, not an audience; lifting it would
// only raise hiss. About −80 dBFS after the input trim.
const FLOOR = 1e-4;

// The diffusers: three Schroeder all-passes an ear, with delays that share no
// factor with each other or across the ears. Short, so a clap is spread rather
// than echoed — the longest rings for well under a tenth of a second.
const DIFFUSE_MS = { left: [1.7, 3.9, 6.1], right: [2.3, 4.7, 7.3] };
const DIFFUSE_K = 0.5;

class AllPass {
  constructor(samples) {
    this.buf = new Float32Array(Math.max(1, samples));
    this.i = 0;
  }

  // v[n] = x[n] + k·v[n−D];  y[n] = −k·v[n] + v[n−D]
  run(x, k) {
    const vD = this.buf[this.i];
    const v = x + k * vD;
    this.buf[this.i] = v;
    this.i = this.i + 1 === this.buf.length ? 0 : this.i + 1;
    return vD - k * v;
  }
}

class CrowdLiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Peak send gain, reached when the audience has the room. 1.0 adds the
      // crowd's side again at its own level.
      { name: 'amount', defaultValue: 0, minValue: 0, maxValue: 8 },
      // The share of it that is always on, under the band.
      { name: 'base', defaultValue: 0.4, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.atk = Math.exp(-1 / (0.040 * sr));
    this.rel = Math.exp(-1 / (0.400 * sr));
    this.glide = Math.exp(-1 / (0.250 * sr));
    this.envS = 0;
    this.envM = 0;
    this.g = 0;
    const chain = (ms) => ms.map((t) => new AllPass(Math.round((t / 1000) * sr)));
    this.apL = chain(DIFFUSE_MS.left);
    this.apR = chain(DIFFUSE_MS.right);
  }

  process(inputs, outputs, params) {
    const lift = inputs[0] && inputs[0][0];
    const side = inputs[1] && inputs[1][0];
    const mid = inputs[2] && inputs[2][0];
    const outL = outputs[0][0];
    const outR = outputs[0][1];
    if (!outL) return true;
    if (!lift || !side) {
      outL.fill(0);
      if (outR) outR.fill(0);
      return true;
    }
    const amountP = params.amount;
    const baseP = params.base;
    const { atk, rel, glide, apL, apR } = this;
    let { envS, envM, g } = this;
    for (let i = 0; i < outL.length; i++) {
      const s = Math.abs(side[i]);
      const m = mid ? Math.abs(mid[i]) : 0;
      envS = s > envS ? atk * envS + (1 - atk) * s : rel * envS + (1 - rel) * s;
      envM = m > envM ? atk * envM + (1 - atk) * m : rel * envM + (1 - rel) * m;
      const amount = amountP.length > 1 ? amountP[i] : amountP[0];
      const base = baseP.length > 1 ? baseP[i] : baseP[0];
      let target = 0;
      if (amount > 0 && envS + envM > FLOOR) {
        const r = envS / Math.max(envM, 1e-9);
        const f = Math.min(1, Math.max(0, (r - RATIO_LOW) / (RATIO_HIGH - RATIO_LOW)));
        target = amount * (base + (1 - base) * f);
      }
      // Glide even on the way to zero — switching off is a fade, not a cut —
      // and land on exactly zero, so an idle lift adds nothing at all.
      g = glide * g + (1 - glide) * target;
      if (target === 0 && g < 1e-6) g = 0;
      // The diffusers run whether or not anything is being added, so their
      // state is warm when the lift comes up.
      let l = lift[i], r = lift[i];
      for (let k = 0; k < apL.length; k++) l = apL[k].run(l, DIFFUSE_K);
      for (let k = 0; k < apR.length; k++) r = apR[k].run(r, DIFFUSE_K);
      outL[i] = g * l;
      if (outR) outR[i] = -g * r;
    }
    this.envS = envS;
    this.envM = envM;
    this.g = g;
    return true;
  }
}

registerProcessor('crowd-lift', CrowdLiftProcessor);
