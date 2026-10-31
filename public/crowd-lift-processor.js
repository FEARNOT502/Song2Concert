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
// WHAT goes back in matters too. The side of a live recording is not only the
// audience: a K-pop show sings over AR — the recorded vocal, its doubles and
// harmonies — and those are spread wide, as are guitars and pads. Lifted with
// the crowd, they were pulled out of the voice they belong to and smeared
// around it, and the live vocal floated alone in the middle over a halo of its
// own recording. With live mode off it went away. What tells the two apart is
// pitch. An audience is noise: thousands of voices with nothing in common, and
// no part of its spectrum stands above its neighbours. A voice, a double, a
// harmony or a chord is a set of partials that do. So the side is lifted bin by
// bin in the frequency domain: a bin that stands well above the spectrum around
// it is a note and gets only a little; a bin level with its neighbours is
// noise and gets the lot. The cost is one frame of latency on the lift alone,
// FFT_N samples — about 21 ms at 48 kHz — which a crowd spread through the
// diffusers does not show.
//
// HOW MUCH does not change with the moment. It used to: the lift rode up from
// a base under the band to a peak when the audience had the room, and the
// split let go at the same time, so a cheer or a chant brought the side up by
// as much as 8 dB within half a second — heard as the side being turned up in
// the middle of a song, and artificial for it. Held steady, the lift follows
// the side as it is, and the largest such jump on the Tokyo Dome recordings is
// 4–5 dB, which is the recording's own: a line of AR stopping and the crowd
// behind it coming through.
//
// What does follow the moment, and slowly, is WHAT is lifted. When the side
// has risen to meet the centre for a second or more — the cheering between
// songs, a long chant — the audience has the room, there is no AR to protect
// and no cymbals to keep out, and the split and the top-end shaping let go. The
// reading that decides it, read in the crowd's band:
//
//   r = envSide / envMid
//   f = clamp((r − low) / (high − low), 0, 1), a second to rise
//
//   input[0] = side, the band to lift     input[1] = side, the band to read
//   input[2] = centre, the band to read
//   output[0] = [ g · AP_L(N(side)), −g · AP_R(N(side)) ]   to ADD to the mix,
//               where N keeps the side's noise and drops its notes, and g is
//               the amount, steady
//
// At amount 0 the output is exactly zero, so the chain is the chain it was.

// Where the side/centre ratio starts to say "audience" and where it is sure.
// Measured on two Tokyo Dome live recordings, through this band and these
// envelopes: under the band the side runs 0.35–0.6 of the centre, 0.7–0.9 where
// the audience sings along, and 1.0–1.25 in the cheering between songs.
const RATIO_LOW = 0.55;
const RATIO_HIGH = 1.0;
// The reading rises over a second and falls over a third of one. A cymbal
// crash is wide, loud and noise, and for a moment it sends the side up to meet
// the centre as an audience does; read raw, every crash let go of the split and
// the shaping and landed dry in front of the band. A fan chant is short too,
// and with the lift steady it does not need the reading: it is noise in the
// side, and it is lifted from its first syllable like the rest of the crowd.
const AUDIENCE_RISE_S = 1.0;
const AUDIENCE_FALL_S = 0.3;
// Below this the band is the noise floor, not an audience; lifting it would
// only raise hiss. About −80 dBFS after the input trim.
const FLOOR = 1e-4;

// The diffusers: three Schroeder all-passes an ear, with delays that share no
// factor with each other or across the ears. Short, so a clap is spread rather
// than echoed — the longest rings for well under a tenth of a second.
const DIFFUSE_MS = { left: [1.7, 3.9, 6.1], right: [2.3, 4.7, 7.3] };
const DIFFUSE_K = 0.5;

// The noise/note split. A 1024-point frame every quarter frame, Hann in and out.
const FFT_N = 1024;
const HOP = FFT_N / 4;
// A bin is a note when it stands this many times over the floor of the bins
// around it — the knee of a soft curve, r⁶/(r⁶ + NOTE_AT⁶). The floor is their
// lower quartile, not their mean: a voice's weaker partials sit beside stronger
// ones, and against a mean that the strong ones had raised they read as noise
// and went into the lift. In a noise field a bin clears the knee about one
// frame in twenty, and never in the same place twice.
const NOTE_AT = 3.3;
const FLOOR_AT = 0.25;
// "Around": ±8 bins (±375 Hz at 48 kHz) less the bin's own ±2, so a partial's
// window does not count against itself.
const AROUND = 8;
const OWN = 2;
// What a note still gets, as a share of the crowd's lift. It was 0.1, which at
// the gain a live recording needs still put the backing's notes back in the
// side 3 dB up — dry, close and wide, in front of the singer on the stage.
const NOTE_FLOOR = 0.02;
// The split costs noise a little too — 1.8 dB of white noise through it,
// measured — so the frames are scaled to give the crowd its level back. A sung
// line with a tenth of a semitone of vibrato comes through 32 dB down.
const NOISE_MAKEUP = 1.23;
// When the audience has the room the split lets go. A real cheer is not white
// noise — screams have pitch — and splitting it took 3.5 dB off the cheering
// on a Tokyo Dome recording; but between songs there is no AR to protect. So
// the split fades out as the reading goes from this to 1: from the side at
// about 0.87 of the centre, held for a second, which under a band only a crowd
// does.
const AUDIENCE_FROM = 0.7;
// Not everything in the side without pitch is the audience. Hi-hats, cymbals
// and the noise in a synth have none either, and the split let them through:
// on the Tokyo Dome recordings the lift under a verse or chorus carried 7–12 dB
// more above 4 kHz, against its own 1–2 kHz, than the cheering between songs —
// which is the audience alone, falling 15 dB by 4–6 kHz and 22 by 6–8. That
// excess is the band's top end, and it was heard as the backing's highs
// jumping out. So while the band plays the lift takes the audience's own
// shape: from HF_FROM down to HF_DEPTH_DB at HF_TO and above, about what was
// measured in excess. In a cheer it is left alone, screams and all — but it
// lets go later than the split does, from HF_AUDIENCE_FROM: a chorus the
// audience sings along to already loosens the split, and the cymbals are still
// going.
const HF_FROM = 2000;
const HF_TO = 7000;
const HF_DEPTH_DB = -15;
const HF_AUDIENCE_FROM = 0.85;
// A note persists from frame to frame and a noise peak does not, so what counts
// is the bin's average over a few frames, not any one frame. Holding the
// loudest frame instead was tried, and every chance peak in the crowd stuck:
// the noise itself lost 6 dB.
const NOTE_SMOOTH = 0.5;

// In-place radix-2 FFT. `inverse` runs it backwards, unscaled.
function makeFft(n) {
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i, y = 0;
    for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; }
    rev[i] = y;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  return (re, im, inverse) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step], wi = inverse ? sin[k * step] : -sin[k * step];
          const a = start + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  };
}

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
      // The send gain, steady. 1.0 adds the crowd's side again at its own level.
      { name: 'amount', defaultValue: 0, minValue: 0, maxValue: 8 },
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.atk = Math.exp(-1 / (0.040 * sr));
    this.rel = Math.exp(-1 / (0.400 * sr));
    this.glide = Math.exp(-1 / (0.250 * sr));
    this.rise = Math.exp(-1 / (AUDIENCE_RISE_S * sr));
    this.fall = Math.exp(-1 / (AUDIENCE_FALL_S * sr));
    this.envS = 0;
    this.envM = 0;
    this.g = 0;
    const chain = (ms) => ms.map((t) => new AllPass(Math.round((t / 1000) * sr)));
    this.apL = chain(DIFFUSE_MS.left);
    this.apR = chain(DIFFUSE_MS.right);

    this.fft = makeFft(FFT_N);
    this.win = new Float64Array(FFT_N);
    for (let j = 0; j < FFT_N; j++) this.win[j] = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / FFT_N);
    this.ring = new Float32Array(FFT_N);   // the last FFT_N input samples
    this.ringPos = 0;                      // the next write, and so the oldest sample
    this.ola = new Float64Array(FFT_N);    // the frames, overlap-added, read as they play
    this.olaPos = 0;
    this.hop = 0;
    this.re = new Float64Array(FFT_N);
    this.im = new Float64Array(FFT_N);
    const bins = FFT_N / 2 + 1;
    this.mag = new Float64Array(bins);
    this.near = new Float64Array(2 * AROUND);
    this.note = new Float64Array(bins);    // how much each bin is a note, 0..1, held
    this.keep = new Float64Array(bins);
    this.idle = true;
    this.audience = 0;                     // f, the reading, for the frames
    // the audience's top end, per bin, as a gain: 1 to HF_FROM, then down
    this.hf = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      const hz = (k * sr) / FFT_N;
      const t = Math.min(1, Math.max(0, Math.log2(hz / HF_FROM) / Math.log2(HF_TO / HF_FROM)));
      this.hf[k] = Math.pow(10, (HF_DEPTH_DB * t) / 20);
    }
  }

  // One frame: keep the side's noise, drop its notes, and add the result into
  // the overlap-add buffer from the sample about to play.
  frame() {
    const { re, im, win, ring, mag, near, note, keep } = this;
    for (let j = 0; j < FFT_N; j++) {
      re[j] = ring[(this.ringPos + j) % FFT_N] * win[j];
      im[j] = 0;
    }
    this.fft(re, im, false);
    const bins = FFT_N / 2 + 1;
    for (let k = 0; k < bins; k++) mag[k] = Math.hypot(re[k], im[k]);
    const at6 = NOTE_AT ** 6;
    for (let k = 0; k < bins; k++) {
      // the lower quartile of the bins around, by insertion into a short list
      let count = 0;
      for (let j = k - AROUND; j <= k + AROUND; j++) {
        if (j < 0 || j >= bins || Math.abs(j - k) <= OWN) continue;
        const v = mag[j];
        let at = count++;
        while (at > 0 && near[at - 1] > v) { near[at] = near[at - 1]; at--; }
        near[at] = v;
      }
      const floor = count ? near[Math.floor(count * FLOOR_AT)] : 0;
      const r = mag[k] / (floor + 1e-12);
      const r6 = r * r * r * r * r * r;
      note[k] = NOTE_SMOOTH * note[k] + (1 - NOTE_SMOOTH) * (r6 / (r6 + at6));
    }
    // A partial's window spreads it over its neighbours, and so does vibrato, so
    // a note also claims the bins beside it — less the further out they are.
    const at = (k) => (k >= 0 && k < bins ? note[k] : 0);
    const u = Math.min(1, Math.max(0, (this.audience - AUDIENCE_FROM) / (1 - AUDIENCE_FROM)));
    const holding = 1 - u * u * (3 - 2 * u);   // 1 under the band, 0 in a cheer
    const split = (1 - NOTE_FLOOR) * holding;
    const { hf } = this;
    const v = Math.min(1, Math.max(0, (this.audience - HF_AUDIENCE_FROM) / (1 - HF_AUDIENCE_FROM)));
    const shaping = 1 - v * v * (3 - 2 * v);   // 1 while the band plays, 0 in a cheer
    for (let k = 0; k < bins; k++) {
      const m = Math.max(at(k), 0.8 * Math.max(at(k - 1), at(k + 1)), 0.5 * Math.max(at(k - 2), at(k + 2)));
      keep[k] = (1 - split * m) * (1 - shaping * (1 - hf[k]));
    }
    for (let k = 0; k < bins; k++) {
      re[k] *= keep[k]; im[k] *= keep[k];
      if (k > 0 && k < FFT_N / 2) { re[FFT_N - k] *= keep[k]; im[FFT_N - k] *= keep[k]; }
    }
    this.fft(re, im, true);
    // Hann in and Hann out at a quarter-frame hop sum to 1.5. The makeup is for
    // what the split takes, so it lets go with it.
    const scale = (1 + (NOISE_MAKEUP - 1) * holding) / (FFT_N * 1.5);
    for (let j = 0; j < FFT_N; j++) this.ola[(this.olaPos + j) % FFT_N] += re[j] * win[j] * scale;
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
    const { atk, rel, glide, apL, apR } = this;
    let { envS, envM, g } = this;
    for (let i = 0; i < outL.length; i++) {
      const s = Math.abs(side[i]);
      const m = mid ? Math.abs(mid[i]) : 0;
      envS = s > envS ? atk * envS + (1 - atk) * s : rel * envS + (1 - rel) * s;
      envM = m > envM ? atk * envM + (1 - atk) * m : rel * envM + (1 - rel) * m;
      const amount = amountP.length > 1 ? amountP[i] : amountP[0];
      let target = 0;
      let f = 0;
      if (amount > 0 && envS + envM > FLOOR) {
        const r = envS / Math.max(envM, 1e-9);
        f = Math.min(1, Math.max(0, (r - RATIO_LOW) / (RATIO_HIGH - RATIO_LOW)));
        target = amount;
      }
      const a = this.audience;
      this.audience = f > a ? this.rise * a + (1 - this.rise) * f : this.fall * a + (1 - this.fall) * f;
      // Glide even on the way to zero — switching off is a fade, not a cut —
      // and land on exactly zero, so an idle lift adds nothing at all.
      g = glide * g + (1 - glide) * target;
      if (target === 0 && g < 1e-6) g = 0;
      // The input always goes into the frame, so the split has the recent past
      // to work from the moment the lift comes up; the frames themselves only
      // run while it is up.
      this.ring[this.ringPos] = lift[i];
      this.ringPos = (this.ringPos + 1) % FFT_N;
      if (++this.hop === HOP) {
        this.hop = 0;
        if (g > 0 || target > 0) {
          this.idle = false;
          this.frame();
        } else if (!this.idle) {
          this.idle = true;
          this.ola.fill(0);
          this.note.fill(0);
        }
      }
      const y = this.ola[this.olaPos];
      this.ola[this.olaPos] = 0;
      this.olaPos = (this.olaPos + 1) % FFT_N;
      // The diffusers run whether or not anything is being added, so their
      // state is warm when the lift comes up.
      let l = y, r = y;
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
