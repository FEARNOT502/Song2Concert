// binaural.js — the two ear cues we can produce honestly, and nothing else.
//
// In-ear monitors put a driver at each ear canal, so every cue a head normally
// supplies is absent: no interaural time difference, no head shadow, and no
// acoustic crosstalk between the ears at all. That is why a stereo mix on IEMs
// images inside the head rather than in front of it.
//
// The obvious fix — a full HRTF on the direct sound — is the one that does not
// work, for three reasons worth writing down so nobody re-adds it by accident:
//
//   1. The pinna notches around 7–9 kHz that carry elevation and front/back are
//      strongly individual. Wearing someone else's produces audible colouration
//      long before it produces localisation.
//   2. Externalisation is mostly driven by the ROOM — a plausible pattern of
//      early reflections and a plausible direct-to-reverberant ratio — not by
//      HRTF fidelity. An HRTF applied to a dry signal gets the colouration
//      without the payoff.
//   3. There is no head tracking in a browser, and static binaural externalises
//      far less than head-tracked binaural does.
//
// So this module deliberately implements only what is safe:
//
//   · INTERAURAL TIME DIFFERENCE (Woodworth) and HEAD SHADOW (Brown–Duda), and
//     applies them ONLY to reflections baked into the impulse response. The
//     direct sound is never filtered, so its timbre cannot change; and the
//     reverberant field is diffuse noise, which has no recognisable timbre for a
//     mismatched head model to get wrong. This is where most of the
//     externalisation comes from anyway.
//   · CROSSFEED on the direct path, expressed as a side-signal shelf — see
//     SIDE_SHELF below for why that formulation is the safe one.
//
// No pinna model. No elevation cues. Those are the parts that sound wrong.

export const HEAD_RADIUS = 0.0875; // m
export const SPEED_OF_SOUND = 343;

// Woodworth's interaural time difference for a distant source:
//   ITD(θ) = (a/c)·(θ + sin θ)
// θ measured from straight ahead. Peaks near ±90° at about 660 µs. Elevation
// shortens the path difference by cos(elevation) — a source directly overhead
// reaches both ears at once regardless of azimuth.
export function interauralDelay(azimuth, elevation = 0) {
  let theta = Math.abs(azimuth);
  if (theta > Math.PI / 2) theta = Math.PI - theta; // behind is as lateral as in front
  const itd = (HEAD_RADIUS / SPEED_OF_SOUND) * (theta + Math.sin(theta));
  return itd * Math.cos(elevation);
}

// Brown–Duda structural head shadow: a one-pole/one-zero whose zero moves with
// the angle of incidence. Facing the source it lifts slightly; in the shadow it
// rolls the top off. ω0 = c/a ≈ 3920 rad/s is set by the size of a head, so the
// transition sits where a real head's does.
const ALPHA_MIN = 0.1;
const THETA_MIN = 150; // degrees — where the shadow is deepest

// `ear` is −1 for the left, +1 for the right.
export function headShadowCoeffs(azimuth, ear, sampleRate) {
  // Angle between this ear's axis and the source. The ear axes point at ±90°.
  const incidence = azimuth - ear * (Math.PI / 2);
  const deg = Math.abs((incidence * 180) / Math.PI) % 360;
  const theta = deg > 180 ? 360 - deg : deg;

  const alpha = (1 + ALPHA_MIN / 2) + (1 - ALPHA_MIN / 2) * Math.cos((theta * 180) / THETA_MIN * (Math.PI / 180));

  // Bilinear transform of H(s) = (1 + α·s/2ω0) / (1 + s/2ω0).
  const w0 = SPEED_OF_SOUND / HEAD_RADIUS;
  const t = 1 / sampleRate;
  const c1 = alpha / (w0 * t);
  const c2 = 1 / (w0 * t);
  const norm = 1 + c2;
  return {
    b0: (1 + c1) / norm,
    b1: (1 - c1) / norm,
    a1: (1 - c2) / norm,
  };
}

// Run a one-pole/one-zero over a buffer in place.
export function applyOnePole(buf, { b0, b1, a1 }) {
  let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 - a1 * y1;
    buf[i] = y;
    x1 = x;
    y1 = y;
  }
}

// Add `src` into `dst` at a fractional sample offset, scaled by `gain`.
export function addDelayed(dst, src, delaySamples, gain = 1) {
  const i0 = Math.floor(delaySamples);
  const frac = delaySamples - i0;
  const a = 1 - frac, b = frac;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const v = src[i] * gain;
    if (v === 0) continue;
    const j = i + i0;
    if (j >= 0 && j < dst.length) dst[j] += v * a;
    if (j + 1 >= 0 && j + 1 < dst.length) dst[j + 1] += v * b;
  }
}

// ── Crossfeed, as a side-signal shelf ───────────────────────────────────────
//
// Conventional crossfeed mixes a delayed, low-passed copy of each channel into
// the other. Written that way it also sums the two channels' low ends, so
// centred bass gains up to 4 dB and the whole balance shifts — which is the
// usual reason crossfeed gets described as "muddy" and switched off.
//
// The identical effect, without that side effect, is a shelf on the SIDE signal
// of a mid/side split: attenuate S below the corner, leave M untouched. The
// centre — where the lead vocal, kick, snare and bass live — is then
// mathematically unchanged, and the mono sum is bit-for-bit identical.
//
// It is also the more physical of the two. Below roughly 700 Hz a head is small
// compared with a wavelength and casts almost no shadow, so real ears receive
// essentially NO level difference at those frequencies. Any hard-panned low
// end in a recording is a cue that no physical source could produce, and it is
// exactly the cue that pins an image to the inside of the skull. Removing it is
// not an effect; it is a correction.
export const SIDE_SHELF = {
  frequency: 700, // Hz — below here a head produces no meaningful level difference
  gain: -5.5,     // dB of side attenuation at DC
  q: 0.6,
};
