// songmap.js — the song's structure, worked out once from the whole track.
//
// The lighting is played in sections, the way a show is cued: the verses held
// back, the pre-chorus building, the chorus hitting on its first downbeat, a
// break pulled down. Guessing those from how loud the track is running right
// now is always late and often wrong (a loud verse is not a chorus), so the
// track is read whole when it loads, the way an operator listens through a
// song before programming it:
//
//   1. the spectrum, frame by frame: a mel spectrum for the timbre, a chroma
//      for the harmony, and an onset curve for the rhythm
//   2. the beat: the tempo from the onset curve's autocorrelation, then the
//      beats themselves by dynamic programming (Ellis 2007)
//   3. the bar: which beat is the one, from where the kick lands and where the
//      chords change, tracked with a Viterbi pass so a two-beat bar dropped
//      into a song does not throw the count off for the rest of it
//   4. the sections: every bar against every other, for harmony and for
//      timbre; boundaries where the sound changes or a repeat starts, laid on
//      the phrase grid (four, eight, sixteen bars) by dynamic programming
//   5. the names: sections that repeat are grouped, and the groups named the
//      way a pop song is built: the chorus is what comes back most and hits
//      hardest, the pre-chorus is what leads into it, the verse is what comes
//      back before it; then the intro, interlude, bridge, solo, dance break
//      and outro
//
// Pure arithmetic on a mono Float32Array; no DOM and no audio graph, so it runs
// in a worker (songmap.worker.js) and under node for the checks.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// ── spectrum ─────────────────────────────────────────────────────────────────

function fftPlan(n) {
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  return { n, rev, cos, sin, re: new Float64Array(n), im: new Float64Array(n) };
}

// in place on plan.re / plan.im
function fft(p) {
  const { n, rev, cos, sin, re, im } = p;
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half;
        const tr = re[b] * cos[k] - im[b] * sin[k];
        const ti = re[b] * sin[k] + im[b] * cos[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

const hzToMel = (f) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m) => 700 * (10 ** (m / 2595) - 1);

function melBank(nBins, sr, nMel, fmin, fmax) {
  const pts = [];
  for (let i = 0; i < nMel + 2; i++) pts.push(melToHz(hzToMel(fmin) + ((hzToMel(fmax) - hzToMel(fmin)) * i) / (nMel + 1)));
  const hz = (k) => (k * sr) / ((nBins - 1) * 2);
  const bank = [];
  for (let m = 0; m < nMel; m++) {
    const lo = pts[m], c = pts[m + 1], hi = pts[m + 2];
    const w = [];
    for (let k = 0; k < nBins; k++) {
      const f = hz(k);
      const v = f <= lo || f >= hi ? 0 : f <= c ? (f - lo) / (c - lo) : (hi - f) / (hi - c);
      if (v > 0) w.push(k, v * (2 / (hi - lo)));
    }
    if (w.length === 0) { const k = Math.round((c * (nBins - 1) * 2) / sr); w.push(Math.min(nBins - 1, k), 1); }
    bank.push(w);
  }
  return bank;
}

export const N_MEL = 48;
const N_MFCC = 13;

function spectrum(x, sr) {
  const n = sr >= 20000 ? 2048 : 1024;
  const hop = n / 4;
  const nb = n / 2 + 1;
  const nf = Math.max(0, Math.floor((x.length - n) / hop) + 1);
  const p = fftPlan(n);
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const bank = melBank(nb, sr, N_MEL, 30, Math.min(8000, sr / 2));
  const mel = new Float32Array(nf * N_MEL);
  const chroma = new Float32Array(nf * 12);
  const rms = new Float32Array(nf);
  // chroma: bins from 55 Hz to 2 kHz to their pitch class, weighted down at
  // the ends of that range
  const pc = new Int8Array(nb).fill(-1), pw = new Float32Array(nb);
  for (let k = 1; k < nb; k++) {
    const f = (k * sr) / n;
    if (f < 55 || f > 2000) continue;
    const midi = 12 * Math.log2(f / 440) + 69;
    pc[k] = ((Math.round(midi) % 12) + 12) % 12;
    const o = Math.log2(f / 330);
    pw[k] = Math.exp(-0.5 * (o / 1.3) ** 2);
  }
  const mag = new Float64Array(nb);
  for (let t = 0; t < nf; t++) {
    const o = t * hop;
    let e = 0;
    for (let i = 0; i < n; i++) { const v = x[o + i]; p.re[i] = v * win[i]; p.im[i] = 0; e += v * v; }
    rms[t] = Math.sqrt(e / n);
    fft(p);
    for (let k = 0; k < nb; k++) mag[k] = p.re[k] * p.re[k] + p.im[k] * p.im[k];
    for (let m = 0; m < N_MEL; m++) {
      const w = bank[m];
      let s = 0;
      for (let j = 0; j < w.length; j += 2) s += mag[w[j]] * w[j + 1];
      mel[t * N_MEL + m] = 10 * Math.log10(1e-10 + s);
    }
    for (let k = 0; k < nb; k++) if (pc[k] >= 0) chroma[t * 12 + pc[k]] += Math.sqrt(mag[k]) * pw[k];
  }
  // decibels against the loudest band anywhere, floored 80 dB down
  let top = -Infinity;
  for (let i = 0; i < mel.length; i++) if (mel[i] > top) top = mel[i];
  for (let i = 0; i < mel.length; i++) mel[i] = Math.max(mel[i], top - 80);
  return { n, hop, nf, fps: sr / hop, mel, chroma, rms };
}

// ── onsets ───────────────────────────────────────────────────────────────────

// spectral flux on the mel spectrum: the rise in each band, summed, over the
// whole range and over the low end (the kick) and the snare's band apart
function onsets(S) {
  const { nf, mel } = S;
  const all = new Float32Array(nf), low = new Float32Array(nf), mid = new Float32Array(nf);
  const lowTop = 7, midLo = 14, midHi = 30;   // ≈ 30–150 Hz and ≈ 400–2500 Hz
  for (let t = 1; t < nf; t++) {
    let a = 0, l = 0, m = 0;
    for (let b = 0; b < N_MEL; b++) {
      const d = mel[t * N_MEL + b] - mel[(t - 1) * N_MEL + b];
      if (d <= 0) continue;
      a += d;
      if (b < lowTop) l += d;
      else if (b >= midLo && b < midHi) m += d;
    }
    all[t] = a / N_MEL; low[t] = l / lowTop; mid[t] = m / (midHi - midLo);
  }
  return { all: detrend(all, Math.round(S.fps)), low: detrend(low, Math.round(S.fps)), mid: detrend(mid, Math.round(S.fps)) };
}

// less its local mean, floored at zero, over its own spread
function detrend(x, w) {
  const n = x.length, out = new Float32Array(n);
  let s = 0;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { s += x[i]; pre[i + 1] = s; }
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
    out[i] = Math.max(0, x[i] - (pre[b] - pre[a]) / (b - a));
    sq += out[i] * out[i];
  }
  const sd = Math.sqrt(sq / Math.max(1, n)) || 1;
  for (let i = 0; i < n; i++) out[i] /= sd;
  return out;
}

// ── tempo and beats ──────────────────────────────────────────────────────────

// beat period in frames: the onset curve's autocorrelation, weighted toward
// the tempos pop is written at (a log-normal around 115 bpm)
function tempo(raw, fps) {
  // softened by a frame either way, so a beat period that falls between two
  // whole frames is not split across them
  const env = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) env[i] = 0.25 * (raw[i - 1] ?? 0) + 0.5 * raw[i] + 0.25 * (raw[i + 1] ?? 0);
  const minLag = Math.floor((60 / 200) * fps), maxLag = Math.ceil((60 / 55) * fps);
  const n = env.length;
  const ac = new Float64Array(4 * maxLag + 2);
  for (let lag = minLag - 1; lag <= 4 * maxLag + 1 && lag < n; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
    ac[lag] = s / (n - lag);
  }
  let best = minLag, bestV = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.9) ** 2);
    // a beat period's multiples back it up; its half does not count against it
    const v = (ac[lag] + 0.5 * (ac[2 * lag] ?? 0) + 0.33 * (ac[3 * lag] ?? 0) + 0.25 * (ac[4 * lag] ?? 0) + 0.25 * (ac[Math.round(lag / 2)] ?? 0)) * prior;
    if (v > bestV) { bestV = v; best = lag; }
  }
  // very fast is usually a moderate tempo counted in eighths: halve it when
  // the half has nearly the support
  if ((60 * fps) / best > 165 && ac[2 * best] > 0.6 * ac[best]) best *= 2;
  // parabolic interpolation for the fraction of a frame
  const a = ac[best - 1], b = ac[best], c = ac[best + 1];
  const d = a - 2 * b + c;
  return best + (d < 0 ? (0.5 * (a - c)) / d : 0);
}

function beatTrack(env, period) {
  const n = env.length;
  // the onset curve smoothed over a few frames, so a beat can sit a frame off
  const sd = period / 32, r = Math.ceil(sd * 3);
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < n) s += env[j] * Math.exp(-0.5 * (k / Math.max(0.5, sd)) ** 2); }
    local[i] = s;
  }
  const tight = 100;
  const score = new Float64Array(n), back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2), hi = Math.round(period * 2);
  for (let i = 0; i < n; i++) {
    let best = 0, arg = -1;
    for (let p = i - hi; p <= i - lo; p++) {
      if (p < 0) continue;
      const v = score[p] - tight * Math.log((i - p) / period) ** 2;
      if (arg < 0 || v > best) { best = v; arg = p; }
    }
    score[i] = local[i] + (arg >= 0 ? Math.max(0, best) : 0);
    back[i] = arg >= 0 && best > 0 ? arg : -1;
  }
  // end on the last strong local maximum of the cumulative score
  let med = 0;
  { const s = Array.from(score).sort((a, b) => a - b); med = s[s.length >> 1]; }
  let end = n - 1;
  for (let i = n - 2; i > 0; i--) {
    if (score[i] >= score[i - 1] && score[i] >= score[i + 1] && score[i] > 0.5 * med) { end = i; break; }
  }
  const beats = [];
  for (let i = end; i >= 0; i = back[i]) { beats.push(i); if (back[i] < 0) break; }
  beats.reverse();
  // trim weak beats off both ends (silence, a fade)
  const th = 0.5 * Math.sqrt(beats.reduce((s, b) => s + local[b] * local[b], 0) / Math.max(1, beats.length));
  let a = 0, z = beats.length;
  while (a < z && local[beats[a]] < th) a++;
  while (z > a && local[beats[z - 1]] < th) z--;
  return beats.slice(a, z);
}

// ── bars ─────────────────────────────────────────────────────────────────────

function cosSim(a, ao, b, bo, len) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) { const x = a[ao + i], y = b[bo + i]; d += x * y; na += x * x; nb += y * y; }
  return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : 0;
}

// per beat: the mean over its frames of a feature with `w` columns
function sync(arr, w, beats, nf) {
  const nbt = beats.length;
  const out = new Float32Array(nbt * w);
  for (let i = 0; i < nbt; i++) {
    const a = beats[i], b = i + 1 < nbt ? beats[i + 1] : Math.min(nf, a + (a - (beats[i - 1] ?? a - 20)));
    const m = Math.max(1, b - a);
    for (let t = a; t < a + m && t < nf; t++) for (let k = 0; k < w; k++) out[i * w + k] += arr[t * w + k];
    for (let k = 0; k < w; k++) out[i * w + k] /= m;
  }
  return out;
}

const z = (xs) => {
  const n = xs.length;
  const mu = xs.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mu) ** 2, 0) / Math.max(1, n)) || 1;
  return xs.map((v) => (v - mu) / sd);
};

// which beat is the one: a Viterbi pass over the position in the bar. The one
// is where the kick lands and the chords change; the backbeat (2 and 4) is
// where the snare is. A bar may come up short (two or three beats) at a cost.
function downbeats(beats, chromaB, on, fps) {
  const n = beats.length;
  if (n < 8) return beats.map((_, i) => i % 4 === 0);
  const near = (env, f) => { let m = 0; for (let k = -2; k <= 2; k++) m = Math.max(m, env[f + k] ?? 0); return m; };
  const kick = z(beats.map((f) => near(on.low, f)));
  const snare = z(beats.map((f) => near(on.mid, f)));
  const chg = z(beats.map((_, i) => (i === 0 ? 0 : 1 - cosSim(chromaB, (i - 1) * 12, chromaB, i * 12, 12))));
  // a chord held across two beats before the change also counts
  const chg2 = z(beats.map((_, i) => (i < 2 || i + 2 > n ? 0 : 1 - cosSim(sum2(chromaB, i - 2), 0, sum2(chromaB, i), 0, 12))));
  const one = beats.map((_, i) => 0.6 * kick[i] + 0.9 * chg[i] + 0.6 * chg2[i] - 0.25 * snare[i]);
  const back = beats.map((_, i) => 0.5 * snare[i] - 0.2 * kick[i]);
  const S = 4;
  let score = [0, 0, 0, 0].map((_, s) => (s === 0 ? one[0] : s % 2 ? back[0] : 0));
  const from = [];
  for (let i = 1; i < n; i++) {
    const nxt = new Array(S).fill(-Infinity), arg = new Array(S).fill(0);
    for (let s = 0; s < S; s++) {
      // the ordinary step
      const t = (s + 1) % S;
      if (score[s] > nxt[t]) { nxt[t] = score[s]; arg[t] = s; }
      // a short bar: back to the one early
      if (s === 1 || s === 2) { const v = score[s] - 6; if (v > nxt[0]) { nxt[0] = v; arg[0] = s; } }
    }
    for (let s = 0; s < S; s++) nxt[s] += s === 0 ? one[i] : s % 2 ? back[i] : 0;
    from.push(arg);
    score = nxt;
  }
  let s = score.indexOf(Math.max(...score));
  const pos = new Array(n);
  for (let i = n - 1; i >= 0; i--) { pos[i] = s; if (i > 0) s = from[i - 1][s]; }
  return pos.map((p) => p === 0);
}
function sum2(c, i) { const o = new Float32Array(12); for (let k = 0; k < 12; k++) o[k] = c[i * 12 + k] + c[(i + 1) * 12 + k]; return o; }

// ── the bar-by-bar picture ───────────────────────────────────────────────────

function mfcc(mel, nf) {
  const out = new Float32Array(nf * N_MFCC);
  for (let t = 0; t < nf; t++) {
    for (let c = 1; c <= N_MFCC; c++) {
      let s = 0;
      for (let b = 0; b < N_MEL; b++) s += mel[t * N_MEL + b] * Math.cos((Math.PI * c * (b + 0.5)) / N_MEL);
      out[t * N_MFCC + c - 1] = s / N_MEL;
    }
  }
  return out;
}

// features per bar: the four beats' chroma in order (the harmony, as played),
// the timbre (mfcc), and how loud and how busy the bar is
function barFeatures(S, on, beats, isOne, chromaB) {
  const bars = [];
  for (let i = 0; i < beats.length; i++) if (isOne[i]) bars.push(i);
  const nb = bars.length;
  const mf = mfcc(S.mel, S.nf);
  const harm = new Float32Array(nb * 48), tim = new Float32Array(nb * N_MFCC);
  const loud = [], low = [], high = [], busy = [];
  for (let j = 0; j < nb; j++) {
    const b0 = bars[j], b1 = j + 1 < nb ? bars[j + 1] : Math.min(beats.length, b0 + 4);
    for (let k = 0; k < 4; k++) {
      const bi = Math.min(b1 - 1, b0 + k);
      let norm = 0;
      for (let c = 0; c < 12; c++) norm += chromaB[bi * 12 + c] ** 2;
      norm = Math.sqrt(norm) || 1;
      for (let c = 0; c < 12; c++) harm[j * 48 + k * 12 + c] = chromaB[bi * 12 + c] / norm;
    }
    const f0 = beats[b0], f1 = b1 < beats.length ? beats[b1] : Math.min(S.nf, f0 + 4 * (beats[b0 + 1] - beats[b0] || 20));
    let e = 0, l = 0, h = 0, o = 0;
    const m = Math.max(1, f1 - f0);
    for (let t = f0; t < f0 + m && t < S.nf; t++) {
      for (let c = 0; c < N_MFCC; c++) tim[j * N_MFCC + c] += mf[t * N_MFCC + c] / m;
      e += S.rms[t] ** 2;
      let lo = 0; for (let b = 0; b < 7; b++) lo += S.mel[t * N_MEL + b]; l += lo / 7;
      let hi = 0; for (let b = 38; b < N_MEL; b++) hi += S.mel[t * N_MEL + b]; h += hi / (N_MEL - 38);
      o += on.all[t];
    }
    loud.push(10 * Math.log10(1e-9 + e / m)); low.push(l / m); high.push(h / m); busy.push(o / m);
  }
  return { bars, nb, harm, tim, loud, low, high, busy };
}

// every bar against every other. Harmony allows the song to have moved key
// (the last chorus a step up), at a small cost; timbre is a gaussian on the
// distance between the bars' mfcc and loudness.
const P_KEY = 0.97;
function similarity(F) {
  const { nb, harm, tim } = F;
  const H = new Float32Array(nb * nb), T = new Float32Array(nb * nb);
  const rot = new Float32Array(48);
  for (let i = 0; i < nb; i++) {
    for (let j = i; j < nb; j++) {
      let best = 0;
      for (let r = 0; r < 12; r++) {
        for (let k = 0; k < 4; k++) for (let c = 0; c < 12; c++) rot[k * 12 + c] = harm[i * 48 + k * 12 + ((c + r) % 12)];
        const v = cosSim(rot, 0, harm, j * 48, 48) * (r === 0 ? 1 : P_KEY);
        if (v > best) best = v;
      }
      H[i * nb + j] = H[j * nb + i] = best;
    }
  }
  const loudZ = z(F.loud), busyZ = z(F.busy);
  const tz = [];
  for (let c = 0; c < N_MFCC; c++) tz.push(z(Array.from({ length: nb }, (_, j) => tim[j * N_MFCC + c])));
  const vec = (j) => [...tz.map((col) => col[j]), loudZ[j] * 1.5, busyZ[j]];
  const V = Array.from({ length: nb }, (_, j) => vec(j));
  const d2 = [];
  for (let i = 0; i < nb; i++) for (let j = i + 1; j < nb; j++) { let s = 0; for (let k = 0; k < V[i].length; k++) s += (V[i][k] - V[j][k]) ** 2; T[i * nb + j] = s; d2.push(s); }
  d2.sort((a, b) => a - b);
  const sig = d2[d2.length >> 1] || 1;
  for (let i = 0; i < nb; i++) { T[i * nb + i] = 1; for (let j = i + 1; j < nb; j++) T[i * nb + j] = T[j * nb + i] = Math.exp(-T[i * nb + j] / sig); }
  // harmony on its own scale: the song's median to its top few percent
  const hs = [];
  for (let i = 0; i < nb; i++) for (let j = i + 1; j < nb; j++) hs.push(H[i * nb + j]);
  hs.sort((a, b) => a - b);
  const med = hs[hs.length >> 1] ?? 0.5, top = hs[Math.floor(hs.length * 0.97)] ?? 1;
  for (let i = 0; i < H.length; i++) H[i] = clamp((H[i] - med) / Math.max(0.02, top - med), -1, 1);
  return { H, T, nb };
}

// ── boundaries ───────────────────────────────────────────────────────────────

// Foote's checkerboard: how much the bars before b resemble each other and the
// bars after it, against how much they resemble across b
function checker(M, nb, w) {
  const out = new Float32Array(nb + 1);
  for (let b = 1; b < nb; b++) {
    let s = 0, n = 0;
    for (let i = -w; i < w; i++) {
      for (let j = -w; j < w; j++) {
        const x = b + i, y = b + j;
        if (x < 0 || y < 0 || x >= nb || y >= nb) continue;
        const g = Math.exp(-0.5 * (((i + 0.5) / w) ** 2 + ((j + 0.5) / w) ** 2) * 2);
        s += ((i < 0) === (j < 0) ? 1 : -1) * g * M[x * nb + y];
        n += g;
      }
    }
    out[b] = n ? s / n : 0;
  }
  return out;
}

// where the pattern of repeats changes (Serra et al. 2014): each bar's row of
// the recurrence plot, read as lags (which bars back and ahead it repeats
// at), smoothed; a boundary is where that row changes
function repeatEdges(H, nb) {
  const out = new Float32Array(nb + 1);
  if (nb < 6) return out;
  // each bar's nearest few in harmony, kept where the liking is mutual
  const k = Math.max(3, Math.round(nb * 0.08));
  const nn = [];
  for (let i = 0; i < nb; i++) {
    const row = [];
    for (let j = 0; j < nb; j++) if (Math.abs(i - j) > 1) row.push([H[i * nb + j], j]);
    row.sort((a, b) => b[0] - a[0]);
    nn.push(new Set(row.slice(0, k).filter((r) => r[0] > 0).map((r) => r[1])));
  }
  const R = new Float32Array(nb * nb);
  for (let i = 0; i < nb; i++) for (const j of nn[i]) if (nn[j].has(i)) R[i * nb + j] = 1;
  // lag rows, smoothed over a bar either way in time and a lag either way
  const L = new Float32Array(nb * nb);
  for (let i = 0; i < nb; i++) for (let l = 0; l < nb; l++) {
    let s = 0, w = 0;
    for (let di = -1; di <= 1; di++) for (let dl = -1; dl <= 1; dl++) {
      const ii = i + di, ll = (l + dl + nb) % nb;
      if (ii < 0 || ii >= nb) continue;
      const g = (di ? 0.6 : 1) * (dl ? 0.5 : 1);
      s += g * R[ii * nb + ((ii + ll) % nb)]; w += g;
    }
    L[i * nb + l] = s / w;
  }
  for (let b = 1; b < nb; b++) {
    let d = 0;
    for (let l = 0; l < nb; l++) {
      const after = (L[b * nb + l] + (b + 1 < nb ? L[(b + 1) * nb + l] : L[b * nb + l])) / 2;
      const before = (L[(b - 1) * nb + l] + (b - 2 >= 0 ? L[(b - 2) * nb + l] : L[(b - 1) * nb + l])) / 2;
      d += (after - before) ** 2;
    }
    out[b] = Math.sqrt(d);
  }
  return out;
}

function boundaries(F, M, nb, P) {
  const loudZ = z(F.loud), lowZ = z(F.low), highZ = z(F.high), busyZ = z(F.busy);
  const energy = loudZ.map((v, j) => 0.45 * v + 0.2 * lowZ[j] + 0.15 * highZ[j] + 0.2 * busyZ[j]);
  const cT = checker(M.T, nb, 4), cT2 = checker(M.T, nb, 2), cH = checker(M.H, nb, 4);
  const rep = repeatEdges(M.H, nb);
  const jump = new Float32Array(nb + 1);
  for (let b = 1; b < nb; b++) {
    const mean = (a, c) => { let s = 0, n = 0; for (let j = a; j < c; j++) if (j >= 0 && j < nb) { s += energy[j]; n++; } return n ? s / n : 0; };
    jump[b] = Math.abs(mean(b, b + 2) - mean(b - 2, b));
  }
  const norm = (a) => { const s = Array.from(a).slice(1, nb).sort((x, y) => x - y); const hi = s[Math.floor(s.length * 0.95)] || 1; return Array.from(a, (v) => Math.max(0, v) / hi); };
  const nT = norm(cT), nT2 = norm(cT2), nH = norm(cH), nR = norm(rep), nJ = norm(jump);
  const nov = new Float32Array(nb + 1);
  for (let b = 1; b < nb; b++) nov[b] = 0.3 * nT[b] + 0.1 * nT2[b] + 0.15 * nH[b] + 0.3 * nR[b] + 0.15 * nJ[b];

  // the phrase grid: pop is written in fours, so one offset of the four-bar
  // grid carries most of the change; boundaries on it come cheaper
  let off = 0, offV = -1;
  for (let o = 0; o < 4; o++) { let s = 0; for (let b = o; b < nb; b += 4) s += nov[b]; if (s > offV) { offV = s; off = o; } }
  const lenPrior = (L) => P.len * (L === 8 ? 0.35 : L === 16 ? 0.3 : L === 4 ? 0.1 : L === 12 ? 0.1 : L === 6 ? -0.15 : L === 2 ? -0.35 : L > 16 ? -0.2 - 0.04 * (L - 16) : -0.3);
  const grid = (b) => (((b - off) % 4) + 4) % 4 === 0 ? 0.12 : ((b - off) % 2 === 0 ? -0.02 : -0.12);
  const cost = P.cost;
  const best = new Float64Array(nb + 1).fill(-Infinity), from = new Int32Array(nb + 1).fill(-1);
  best[0] = 0;
  for (let b = 1; b <= nb; b++) {
    for (let L = 1; L <= Math.min(b, 32); L++) {
      const a = b - L;
      if (best[a] === -Infinity) continue;
      // the first and last segments may be any length (pickups, fades)
      const edge = a === 0 || b === nb;
      const pr = edge ? Math.max(-0.1, lenPrior(L)) : lenPrior(L);
      const gain = b === nb ? 0 : nov[b] - cost + grid(b);
      const v = best[a] + pr + gain;
      if (v > best[b]) { best[b] = v; from[b] = a; }
    }
  }
  const cuts = [];
  for (let b = nb; b > 0; b = from[b]) cuts.push(b);
  cuts.push(0);
  cuts.reverse();
  return { cuts, energy, nov };
}

// ── names ────────────────────────────────────────────────────────────────────

// how alike two segments are: their bars side by side, the shorter slid along
// the longer, harmony mostly and timbre some
function segSim(M, nb, A, B) {
  const la = A[1] - A[0], lb = B[1] - B[0];
  const [S, L] = la <= lb ? [A, B] : [B, A];
  const ls = S[1] - S[0], ll = L[1] - L[0];
  let best = -1;
  for (let o = 0; o <= ll - ls; o++) {
    let h = 0, t = 0;
    for (let d = 0; d < ls; d++) { const i = S[0] + d, j = L[0] + o + d; h += M.H[i * nb + j]; t += M.T[i * nb + j]; }
    const v = (0.7 * h + 0.3 * t) / ls;
    if (v > best) best = v;
  }
  // a big difference in length counts against
  return best - 0.15 * Math.abs(Math.log2(ll / ls));
}

function cluster(M, nb, segs, th) {
  const n = segs.length;
  const sim = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) sim[i][j] = sim[j][i] = segSim(M, nb, segs[i], segs[j]);
  let groups = segs.map((_, i) => [i]);
  for (;;) {
    let bi = -1, bj = -1, bv = th;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      let s = 0;
      for (const a of groups[i]) for (const b of groups[j]) s += sim[a][b];
      s /= groups[i].length * groups[j].length;
      if (s > bv) { bv = s; bi = i; bj = j; }
    }
    if (bi < 0) break;
    groups[bi] = groups[bi].concat(groups[bj]);
    groups.splice(bj, 1);
  }
  const label = new Array(n);
  groups.sort((a, b) => Math.min(...a) - Math.min(...b)).forEach((g, k) => g.forEach((i) => { label[i] = k; }));
  return { label, sim };
}

// the functions, the way a pop song is built
function name(segs, label, E, nb, F = null) {
  const n = segs.length;
  const segE = segs.map(([a, b]) => { let s = 0; for (let j = a; j < b; j++) s += E[j]; return s / (b - a); });
  // how much of the sound is the low end (kick and bass), against the whole,
  // in dB: a solo carries the tune over a band that has pulled its bottom back
  const segLow = segs.map(([a, b]) => { if (!F) return 0; let s = 0; for (let j = a; j < b; j++) s += F.low[j] - F.loud[j]; return s / (b - a); });
  const k = Math.max(...label) + 1;
  const groups = Array.from({ length: k }, () => []);
  label.forEach((l, i) => groups[l].push(i));
  const role = new Array(n).fill(null);
  const mid = (i) => (segs[i][0] + segs[i][1]) / 2 / nb;
  const sorted = [...segE].sort((a, b) => a - b);
  const eMed = sorted[n >> 1];

  // the chorus: comes back, and hits hardest
  let chorus = -1, cv = -Infinity;
  for (let g = 0; g < k; g++) {
    const m = groups[g];
    if (m.length < 2) continue;
    const e = m.reduce((s, i) => s + segE[i], 0) / m.length;
    const bars = m.reduce((s, i) => s + segs[i][1] - segs[i][0], 0);
    const late = m.filter((i) => mid(i) > 0.3).length / m.length;
    const v = 1.3 * e + 0.35 * Math.log2(m.length) + 0.15 * Math.log2(bars / 8 + 1) + 0.3 * late;
    if (v > cv) { cv = v; chorus = g; }
  }
  if (chorus >= 0) {
    const e = groups[chorus].reduce((s, i) => s + segE[i], 0) / groups[chorus].length;
    // a repeat that is not loud is a verse, not a chorus; the loudest stretches
    // carry it then
    if (e < eMed) chorus = -1;
  }
  if (chorus >= 0) for (const i of groups[chorus]) role[i] = 'chorus';
  else {
    const th = sorted[Math.floor(n * 0.7)];
    segE.forEach((e, i) => { if (e >= th && e > 0.3) role[i] = 'chorus'; });
  }
  const chE = (() => { const c = segE.filter((_, i) => role[i] === 'chorus'); return c.length ? c.reduce((s, v) => s + v, 0) / c.length : 1; })();

  // a loud stretch straight after a chorus and as loud as it: the chorus's
  // second half, or a post-chorus drop; played as chorus
  for (let i = 1; i < n; i++) {
    if (!role[i] && role[i - 1] === 'chorus' && segE[i] > chE - 0.35 && segs[i][1] - segs[i][0] <= 8) role[i] = 'post';
  }

  // the pre-chorus: what leads into a chorus, if it is not a verse running
  // straight into it
  const into = [];
  for (let i = 1; i < n; i++) if ((role[i] === 'chorus') && role[i - 1] !== 'chorus' && role[i - 1] !== 'post') into.push(i - 1);
  const preCount = {};
  for (const p of into) if (!role[p]) preCount[label[p]] = (preCount[label[p]] || 0) + 1;
  for (const p of into) {
    if (role[p]) continue;
    const g = label[p];
    const len = segs[p][1] - segs[p][0];
    // its group turns up only in front of choruses, or it is short and rising
    const elsewhere = groups[g].filter((i) => !into.includes(i) && !role[i]).length;
    const rise = E[segs[p][1] - 1] - E[segs[p][0]];
    if ((elsewhere === 0 && (preCount[g] >= 2 || len <= 8)) || (len <= 8 && rise > 0.4)) role[p] = 'pre';
  }

  // the verse: what keeps coming back that is neither
  let verse = -1, vv = -Infinity;
  for (let g = 0; g < k; g++) {
    if (g === chorus) continue;
    const m = groups[g].filter((i) => !role[i]);
    if (!m.length) continue;
    const v = m.length + 0.5 * m.filter((i) => mid(i) < 0.6).length - (m.length === 1 ? 1 : 0);
    if (v > vv) { vv = v; verse = g; }
  }
  if (verse >= 0 && groups[verse].filter((i) => !role[i]).length >= 2) for (const i of groups[verse]) if (!role[i]) role[i] = 'verse';

  // an interlude: the band on its own for a few bars after a chorus, before
  // the song goes on: not quiet, not as loud as the chorus, and either the
  // opening riff come back (the song's first section again) or only a bar
  // or four (a new stretch of eight after a chorus is more often a bridge)
  for (let i = 1; i < n - 1; i++) {
    if (role[i] || (role[i - 1] !== 'chorus' && role[i - 1] !== 'post')) continue;
    const len = segs[i][1] - segs[i][0];
    if (segE[i] >= eMed - 0.3 && segE[i] < chE - 0.25 && ((label[i] === label[0] && len <= 8) || len <= 4)) role[i] = 'interlude';
  }

  // the ends
  // the intro: what comes before all that, within the opening stretch
  const firstMain = role.findIndex((r) => r === 'verse' || r === 'chorus' || r === 'pre');
  for (let i = 0; i < (firstMain < 0 ? n : firstMain); i++) {
    if (role[i] || segs[i][1] > Math.max(16, nb * 0.15)) break;
    role[i] = 'intro';
  }
  let lastCh = -1;
  for (let i = n - 1; i >= 0; i--) if (role[i] === 'chorus' || role[i] === 'post') { lastCh = i; break; }
  if (lastCh >= 0) for (let i = lastCh + 1; i < n; i++) if (!role[i] && segs[i][0] / nb > 0.8 && (segE[i] < chE - 0.3 || i === n - 1)) role[i] = 'outro';

  // the rest: by how hard it plays
  const chLow = (() => { const c = segLow.filter((_, i) => role[i] === 'chorus'); return c.length ? c.reduce((s, v) => s + v, 0) / c.length : null; })();
  for (let i = 0; i < n; i++) {
    if (role[i]) continue;
    if (segE[i] < Math.min(-0.5, eMed - 0.6)) role[i] = 'break';
    // a solo: once only, past the middle, not quiet, the low end well back of
    // the chorus's (a dance break keeps its kick)
    else if (F && chLow != null && mid(i) > 0.45 && groups[label[i]].length === 1 && segE[i] >= eMed - 0.2 && segLow[i] < chLow - 2.5) role[i] = 'solo';
    else if (segE[i] > chE - 0.25 && mid(i) > 0.45) role[i] = 'dance';
    else if (mid(i) > 0.45 && groups[label[i]].length === 1) role[i] = 'bridge';
    else role[i] = 'verse';
  }
  // a last segment that is only a bar or two of ringing out
  return { role, segE };
}

// what the rig plays for each function
// (the four broad states every room plays; the big rooms play each `role` as
// its own part, see show.js PARTS)
export const LIGHT = { intro: 'break', verse: 'verse', pre: 'pre', chorus: 'chorus', post: 'chorus', interlude: 'verse', dance: 'chorus', bridge: 'chorus', solo: 'chorus', break: 'break', outro: 'break' };

// ── all of it ────────────────────────────────────────────────────────────────

export const DEFAULTS = { cost: 0.7, len: 1, th: 0.5 };

export function analyzeSong(x, sr, opts = {}) {
  const P = { ...DEFAULTS, ...opts };
  const S = spectrum(x, sr);
  const dur = x.length / sr;
  const empty = { version: 1, dur, bpm: 0, beats: [], downbeats: [], kicks: [], sections: [{ start: 0, end: dur, role: 'verse', light: 'verse', group: 0, energy: 0.5 }], energy: [] };
  if (S.nf < 64) return empty;
  const on = onsets(S);
  const period = tempo(on.all, S.fps);
  const beatF = beatTrack(on.all, period);
  if (beatF.length < 16) return empty;
  const chromaB = sync(S.chroma, 12, beatF, S.nf);
  const isOne = downbeats(beatF, chromaB, on, S.fps);
  const F = barFeatures(S, on, beatF, isOne, chromaB);
  if (F.nb < 8) return empty;
  const M = similarity(F);
  const { cuts, energy } = boundaries(F, M, F.nb, P);
  const segs0 = [];
  for (let i = 0; i + 1 < cuts.length; i++) segs0.push([cuts[i], cuts[i + 1]]);
  let { label } = cluster(M, F.nb, segs0, P.th);
  // neighbours in the same group are one section
  const segs = [];
  const lab = [];
  segs0.forEach((s, i) => {
    if (lab.length && lab[lab.length - 1] === label[i]) segs[segs.length - 1] = [segs[segs.length - 1][0], s[1]];
    else { segs.push(s); lab.push(label[i]); }
  });
  label = lab;
  const { role, segE } = name(segs, label, energy, F.nb, F);

  // neighbours with the same name are one section (two intro groups, a verse
  // in two halves); a chorus straight after a chorus stays its own, for the hit
  for (let i = segs.length - 1; i > 0; i--) {
    if (role[i] === role[i - 1] && role[i] !== 'chorus') {
      segE[i - 1] = (segE[i - 1] * (segs[i - 1][1] - segs[i - 1][0]) + segE[i] * (segs[i][1] - segs[i][0])) / (segs[i][1] - segs[i - 1][0]);
      segs[i - 1] = [segs[i - 1][0], segs[i][1]];
      segs.splice(i, 1); role.splice(i, 1); label.splice(i, 1); segE.splice(i, 1);
    }
  }
  const t = (f) => f / S.fps;
  const barT = F.bars.map((bi) => t(beatF[bi]));
  const sections = segs.map(([a, b], i) => ({
    start: i === 0 ? 0 : barT[a],
    end: i === segs.length - 1 ? dur : barT[b],
    bar: a, bars: b - a,
    role: role[i], light: LIGHT[role[i]], group: label[i],
    energy: +clamp(0.5 + 0.25 * segE[i], 0, 1).toFixed(3),
  }));
  // the last chorus is the biggest
  for (let i = sections.length - 1; i >= 0; i--) if (sections[i].role === 'chorus') { sections[i].final = true; break; }

  // kicks: low-end onsets standing well above their neighbours
  const kicks = [];
  const lo = on.low;
  const w = Math.round(S.fps * 0.1);
  let last = -1e9;
  for (let f = 1; f < lo.length - 1; f++) {
    if (lo[f] < 1.2 || lo[f] < lo[f - 1] || lo[f] < lo[f + 1]) continue;
    let mx = 0; for (let k = -w; k <= w; k++) mx = Math.max(mx, lo[f + k] ?? 0);
    if (lo[f] < mx) continue;
    if (f - last < S.fps * 0.18) continue;
    kicks.push(+t(f).toFixed(3)); last = f;
  }
  // loudness per beat, 0..1 against the song's own range
  const eb = beatF.map((f, i) => {
    const g = i + 1 < beatF.length ? beatF[i + 1] : f + Math.round(period);
    let s = 0, n = 0; for (let k = f; k < g && k < S.nf; k++) { s += S.rms[k] ** 2; n++; }
    return 10 * Math.log10(1e-9 + s / Math.max(1, n));
  });
  const es = [...eb].sort((a, b) => a - b);
  const e10 = es[Math.floor(es.length * 0.1)], e95 = es[Math.floor(es.length * 0.95)];
  return {
    version: 1,
    dur,
    bpm: +((60 * S.fps) / period).toFixed(2),
    beats: beatF.map((f) => +t(f).toFixed(3)),
    downbeats: barT.map((v) => +v.toFixed(3)),
    kicks,
    energy: eb.map((v) => +clamp((v - e10) / Math.max(1, e95 - e10)).toFixed(3)),
    sections,
  };
}

