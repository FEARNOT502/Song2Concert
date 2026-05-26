// engine.js — the Web Audio convolution-reverb engine.
//
// Routing graph (CLAUDE_PROMPT.md §7 + technical spec §2):
//
//                                  ┌──────────────► [dryGain] ─────────────┐
//   <audio> ─► MediaElementSource ─┤                                       ├─► [master] ─► destination
//                                  └─► [preDelay] ─► [convolver] ─► [wetGain]┘                  │
//                                                                            └─► [analyser] (RMS for pulse)
//
// - Source is a streaming HTMLAudioElement (createMediaElementSource) so large
//   FLAC/WAV files are NOT decoded into a single in-memory AudioBuffer.
// - dryGain / wetGain are an equal-power crossfader driven by the wet/dry slider.
// - preDelay (DelayNode) models the seat's first-reflection time before reverb.
// - bypass mutes the wet path → 100% dry.
// - analyser taps the master bus; the UI reads RMS to animate the album-art pulse.

import { buildImpulseResponse } from './impulse.js';
import { readAudioFormat } from './bitdepth.js';

// AudioWorklet module URL. The processor lives in public/ (served verbatim, no
// bundling) so audioWorklet.addModule can fetch it as a standalone module.
// BASE_URL keeps it correct under the GitHub Pages base path.
const WET_DUCKER_URL = `${import.meta.env.BASE_URL}wet-ducker-processor.js`;
const VOCAL_DEMASK_URL = `${import.meta.env.BASE_URL}vocal-demask-processor.js`;

// Register the wet-ducker worklet on a context (idempotent per context). Returns
// true if available, false if the browser/context can't load it (→ caller skips
// the ducker and wires the wet bus straight through).
async function ensureWetDucker(ctx) {
  if (!ctx.audioWorklet) return false;
  if (ctx.__wetDuckerReady) return true;
  try {
    await ctx.audioWorklet.addModule(WET_DUCKER_URL);
    ctx.__wetDuckerReady = true;
    return true;
  } catch (e) {
    console.warn('[engine] wet-ducker worklet unavailable:', e.message);
    return false;
  }
}

// Register the vocal-demask worklet on a context (idempotent per context).
async function ensureVocalDemask(ctx) {
  if (!ctx.audioWorklet) return false;
  if (ctx.__vocalDemaskReady) return true;
  try {
    await ctx.audioWorklet.addModule(VOCAL_DEMASK_URL);
    ctx.__vocalDemaskReady = true;
    return true;
  } catch (e) {
    console.warn('[engine] vocal-demask worklet unavailable:', e.message);
    return false;
  }
}

// Map a venue's first-reflection time to an AUDIBLE wet pre-delay that stays
// fused with the dry transient.
//
// The tension: big venues model a long first-reflection time (stadium +110ms),
// and that bulk gap is the natural cue for SIZE. But before the reverb a bulk
// pre-delay inserts SILENCE after a sharp, isolated hit — so on a sparse
// kick/snare/bass intro the whole reverb arrives late as a SEPARATE echo
// ("tak…… chh"), which sounds awkward. A single flat cap (the old 25ms) fixed
// the echo but flattened every big venue to the same gap, erasing size — and on
// some sources 25ms was still enough to read as a slap.
//
// So instead of clamping, we soft-compress the pre-delay through a saturating
// curve toward a low ceiling: small venues keep their short, intimate value;
// large venues are pulled toward the ceiling but still ORDERED (arena < dome ≈
// stadium), so they read as "bigger" without crossing the echo-fusion threshold.
// The remaining sense of size is carried by the IR's own early + lateral field,
// whose timing widens for big rooms (impulse.js) but is CONTINUOUS from t≈0 — no
// silent gap to read as an echo. (The displayed firstReflection figure is
// unchanged; this only sets what's audible.)
const PREDELAY_CEIL = 0.022; // seconds — saturating asymptote (was a hard 25ms cap)
function fusedPreDelay(seconds) {
  const s = Math.max(0, seconds);
  // 1 - e^(-s/ceil): ≈ s for small s, saturating to PREDELAY_CEIL for large s.
  return PREDELAY_CEIL * (1 - Math.exp(-s / PREDELAY_CEIL));
}

// Create a configured wet-ducker node: 2 inputs (wet stereo, dry sidechain),
// stereo out. Feed the wet bus into input 0 and the dry tap into input 1.
function createWetDucker(ctx) {
  return new AudioWorkletNode(ctx, 'wet-ducker', {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
}

// Create the vocal-demask node: 2 mono inputs (Mid presence, Side presence),
// 1 mono output (the presence to add back to the center).
function createVocalDemask(ctx) {
  return new AudioWorkletNode(ctx, 'vocal-demask', {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
}

export class ConcertEngine {
  constructor() {
    this.ctx = null;
    this.audioEl = null;
    this.source = null;
    this.dryGain = null;
    this.wetGain = null;
    this.preDelay = null;
    this.convolver = null;
    this.master = null;
    this.analyser = null;
    this._analyserBuf = null;
    this._objectUrl = null;
    this._irCache = new Map(); // venueId -> AudioBuffer
    this._wetDry = 0.78;
    this._bypass = false;
    this._volume = 0.85; // master output volume, 0..1
    this.ready = false;

    // decoded-buffer fallback (used when <audio> can't decode the file, e.g.
    // FLAC on Chrome/Edge). When active, playback runs off an
    // AudioBufferSourceNode instead of the MediaElementSource.
    this._mode = 'element';        // 'element' | 'buffer'
    this._decoded = null;          // AudioBuffer
    this._bufSrc = null;           // current AudioBufferSourceNode
    this._inGain = null;           // shared input the source feeds into
    this._bufStartedAt = 0;        // ctx.currentTime when source started
    this._bufOffset = 0;           // play offset within the buffer
    this._bufPlaying = false;
    this._bufGen = 0;              // generation counter to ignore stale onended
    this._ended = false;           // true only on a real end-of-track
    this._fileRef = null;          // original File (for offline export)
    this._wetDucker = null;        // AudioWorkletNode spliced into the wet bus
    this._vocalDemask = null;      // AudioWorkletNode lifting the masked vocal
  }

  // Build the AudioContext + node graph. Idempotent; called on first interaction.
  _ensureGraph() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    this.audioEl = new Audio();
    this.audioEl.preload = 'auto';
    // Some Chromium builds only drive a MediaElementSource reliably when the
    // element is actually attached to the document. Mount it hidden.
    this.audioEl.style.display = 'none';
    document.body.appendChild(this.audioEl);

    this.source = this.ctx.createMediaElementSource(this.audioEl);

    // shared input bus — both the <audio> source and the buffer-fallback source
    // connect here, so the dry/wet graph downstream is identical for both modes.
    this._inGain = this.ctx.createGain();

    // Low-end body, the way a real concert PA presents bass: big subwoofer
    // weight on the DIRECT sound. This low-shelf sits on the shared input bus so
    // it lifts both the dry and the wet feed BEFORE the split. The reverb tail
    // stays tight because the wet path still has its mud cut (~300 Hz) + lfDamp
    // in the IR — so we get more bass *body*, not a boomy tail.
    this.bassShelf = this.ctx.createBiquadFilter();
    this.bassShelf.type = 'lowshelf';
    this.bassShelf.frequency.value = 120;  // overall low-end weight (sub..low-bass)
    this.bassShelf.gain.value = 7;         // dB — bigger low-end weight (concert sub feel)
    // ── Kick vs. bass frequency separation (live-FOH "carve" approach) ──
    // The kick and the bass guitar fight in the 60–120 Hz region. A FOH engineer
    // un-masks them by giving each its OWN pocket instead of boosting the shared
    // band: the kick keeps the very-low chest THUMP (~60 Hz), while the bass owns
    // the fundamental/BODY just above it (~110 Hz). We also dip the kick's filter
    // band slightly where it would otherwise smother the bass fundamental.
    //
    // kickPunch: narrow lift on the kick's chest-thump fundamental (~60 Hz).
    this.kickPeak = this.ctx.createBiquadFilter();
    this.kickPeak.type = 'peaking';
    this.kickPeak.frequency.value = 60;    // lower than before → out of the bass's way
    this.kickPeak.Q.value = 1.6;           // narrower → only the thump, not the bass
    this.kickPeak.gain.value = 3.5;        // dB — more chest thump
    // bassBody: lift the bass guitar's fundamental/body pocket so it sits ABOVE
    // the kick instead of under it — this is the main fix for "bass buried in kick".
    this.bassBody = this.ctx.createBiquadFilter();
    this.bassBody.type = 'peaking';
    this.bassBody.frequency.value = 110;   // bass fundamental / "round" body
    this.bassBody.Q.value = 1.3;
    this.bassBody.gain.value = 5;          // dB — fuller bass fundamental/body
    // bassDef: a small lift in the bass's note-definition/growl region so the
    // pitch of each bass note stays legible through a dense mix (separation).
    this.bassDef = this.ctx.createBiquadFilter();
    this.bassDef.type = 'peaking';
    this.bassDef.frequency.value = 800;    // string growl / where the note "reads"
    this.bassDef.Q.value = 1.0;
    this.bassDef.gain.value = 1.5;         // dB
    this.source.connect(this.bassShelf);
    this.bassShelf.connect(this.kickPeak);
    this.kickPeak.connect(this.bassBody);
    this.bassBody.connect(this.bassDef);
    this.bassDef.connect(this._inGain);

    this.dryGain = this.ctx.createGain();
    // Vocal presence lift on the DRY (direct) path only. When the bass body is
    // strong it masks the vocal's intelligibility band; a real FOH engineer
    // answers that by nudging the vocal's presence/consonant region forward so
    // the lead stays legible over the low end. A wide, gentle peak at ~2.5 kHz
    // (Q 0.8 covers ~1.5–4 kHz) keeps it musical rather than harsh/sibilant.
    // It lives on the dry feed, NOT the wet bus — boosting it in the reverb
    // would only smear the vocal, so the tail keeps its existing 3.2 kHz cut.
    this.vocalPresence = this.ctx.createBiquadFilter();
    this.vocalPresence.type = 'peaking';
    this.vocalPresence.frequency.value = 2800; // toward the consonant/articulation band for intelligibility
    this.vocalPresence.Q.value = 0.8;
    this.vocalPresence.gain.value = 4.5; // dB — vocal pushed a little further forward for clarity
    // Snare "crack"/attack lift on the DRY path. The snare's snap reads ~4–5 kHz,
    // just ABOVE the vocal presence band, so a narrowish peak here makes the snare
    // pop out crisply without dragging the vocal up with it. Kept tight (Q 1.2) so
    // it doesn't bleed into the vocal's ~2.5 kHz or the hat's air above.
    this.snareCrack = this.ctx.createBiquadFilter();
    this.snareCrack.type = 'peaking';
    this.snareCrack.frequency.value = 4500;
    this.snareCrack.Q.value = 1.6;     // tighter so it doesn't bleed down into the vocal
    this.snareCrack.gain.value = 4.5; // dB — snare pops harder
    // Hi-hat / cymbal sparkle: a high shelf well above the vocal/snare so only the
    // hats' shimmer lifts. The other instruments have little energy this high, so
    // this brightens the hats specifically rather than the whole mix.
    this.hatAir = this.ctx.createBiquadFilter();
    this.hatAir.type = 'highshelf';
    this.hatAir.frequency.value = 10000;
    this.hatAir.gain.value = 3; // dB
    // ── Direct-sound stereo width (mid/side) ─────────────────────────────
    // A big-venue PA is essentially mono/LCR: both line arrays carry largely the
    // same signal, so across the house the DIRECT sound images centered/narrow —
    // the wide stereo lives in the room's reflections, not the PA. We model that
    // with a mid/side matrix on the dry path whose Side gain = `dryWidth`
    // (1 = original studio stereo, 0 = mono):
    //   outL = a·L + b·R,  outR = b·L + a·R,  a = (1+w)/2,  b = (1−w)/2
    // Per venue: full width for the intimate club / natural hall, progressively
    // narrower for arena→dome→stadium. The wide LATERAL reverb (impulse.js) then
    // supplies the envelopment → "centered PA up front, space wrapped around you".
    // A speakers-mode stereoizer first guarantees a true 2-ch feed so a MONO
    // source passes through unchanged (L=R → Side=0 → no level loss).
    this._wIn = this.ctx.createGain();
    this._wIn.channelCount = 2;
    this._wIn.channelCountMode = 'explicit';
    this._wIn.channelInterpretation = 'speakers';
    this._wSplit = this.ctx.createChannelSplitter(2);
    this._wMerge = this.ctx.createChannelMerger(2);
    this._wLL = this.ctx.createGain(); // L→L (a)
    this._wRR = this.ctx.createGain(); // R→R (a)
    this._wLR = this.ctx.createGain(); // L→R (b)
    this._wRL = this.ctx.createGain(); // R→L (b)
    this._wIn.connect(this._wSplit);
    this._wSplit.connect(this._wLL, 0); this._wSplit.connect(this._wLR, 0); // L
    this._wSplit.connect(this._wRL, 1); this._wSplit.connect(this._wRR, 1); // R
    this._wLL.connect(this._wMerge, 0, 0); this._wRL.connect(this._wMerge, 0, 0); // → out L
    this._wLR.connect(this._wMerge, 0, 1); this._wRR.connect(this._wMerge, 0, 1); // → out R
    this.setDryWidth(1); // full width until a venue sets it
    // ── Vocal de-mask (keep the centered vocal cutting through dense mixes) ──
    // Tap the dry tone, split it into Mid (vocal) and Side (masker) presence
    // bands; a worklet lifts the Mid presence ONLY in proportion to how much the
    // Side competes, and adds it back to the center. No Side competition → no
    // boost → the sound is unchanged from baseline. The worklet itself is spliced
    // in asynchronously by _installVocalDemask once its module loads.
    this._vdMid = this.ctx.createGain(); // stereo→mono downmix = Mid = 0.5(L+R)
    this._vdMid.channelCount = 1; this._vdMid.channelCountMode = 'explicit'; this._vdMid.channelInterpretation = 'speakers';
    this._vdSplit = this.ctx.createChannelSplitter(2);
    this._vdSideL = this.ctx.createGain(); this._vdSideL.gain.value = 0.5;
    this._vdSideR = this.ctx.createGain(); this._vdSideR.gain.value = -0.5;
    this._vdSideSum = this.ctx.createGain(); // 0.5L − 0.5R = Side
    this._vdVocalBP = this.ctx.createBiquadFilter();
    this._vdVocalBP.type = 'bandpass'; this._vdVocalBP.frequency.value = 2800; this._vdVocalBP.Q.value = 0.8;
    this._vdMaskBP = this.ctx.createBiquadFilter();
    this._vdMaskBP.type = 'bandpass'; this._vdMaskBP.frequency.value = 2800; this._vdMaskBP.Q.value = 0.8;
    this._vdAdd = this.ctx.createGain(); // boost return summed into the dry center
    this.hatAir.connect(this._vdMid); this._vdMid.connect(this._vdVocalBP);
    this.hatAir.connect(this._vdSplit);
    this._vdSplit.connect(this._vdSideL, 0); this._vdSplit.connect(this._vdSideR, 1);
    this._vdSideL.connect(this._vdSideSum); this._vdSideR.connect(this._vdSideSum);
    this._vdSideSum.connect(this._vdMaskBP);
    this._vdAdd.connect(this.dryGain); // mono → up-mixed to center, summed into dry
    this.wetGain = this.ctx.createGain();
    this.wetTrim = this.ctx.createGain();
    this.wetTrim.gain.value = 0.5; // more reverb than original (0.45) but dialed back from 0.55 to keep clarity
    this.preDelay = this.ctx.createDelay(1.0); // up to 1s of pre-delay
    this.convolver = this.ctx.createConvolver();
    // We energy-normalize our IRs ourselves (impulse.js), so disable the
    // Convolver's own normalization which otherwise rescales by RT60.
    this.convolver.normalize = false;

    // Vocal-band EQ on the WET path only. Voice presence/sibilance lives ~2–6 kHz;
    // cutting that band in the reverb tail makes vocals sound far less "washed"
    // while instrument body (low-mids) keeps its natural ambience. This mirrors
    // how real halls roll off high-frequency RT60 (4 kHz RT60 ≈ 0.6–0.75× mid).
    // Mud cut (~300 Hz) on the WET path: the low-mid region is where bass body,
    // guitar body and vocal chest all pile up and fuse together. Dipping it in
    // the reverb (not the dry signal) is the single biggest win for hearing each
    // instrument SEPARATELY — it un-glues the mix the way a live FOH engineer does.
    this.wetMudCut = this.ctx.createBiquadFilter();
    this.wetMudCut.type = 'peaking';
    this.wetMudCut.frequency.value = 300;
    this.wetMudCut.Q.value = 0.85; // wider (covers ~190–500Hz) — un-glues bass/guitar/vocal bodies
    this.wetMudCut.gain.value = -8; // dB — deeper low-mid dip = clearer instrument separation
    // Keep the reverb tail from re-muddying the low end we just separated on the
    // dry path: high-pass the WET feed so sub/kick energy doesn't smear into the
    // tail. The dry path keeps the full low-end body; the ambience stays clean.
    this.wetLowCut = this.ctx.createBiquadFilter();
    this.wetLowCut.type = 'highpass';
    // 170 Hz (raised from 140): a live PA keeps the kick THUMP and bass BODY in
    // the direct/dry path and high-passes the reverb send hard, so the low end
    // stays punchy and felt instead of being smeared by the room. This is the
    // main fix for "kick/bass body buried" — the reverb no longer fills the
    // ~140–170 Hz weight band that the rhythm section lives in.
    this.wetLowCut.frequency.value = 170;
    this.wetLowCut.Q.value = 0.7;
    this.wetVocalCut = this.ctx.createBiquadFilter();
    this.wetVocalCut.type = 'peaking';
    // 3.6 kHz (shifted up from 3.2): a wide dip here covers BOTH the vocal
    // sibilance AND the snare "crack" (~4–5 kHz) in the tail, so the snare's
    // attack cuts through the direct path instead of being haloed by reverb.
    this.wetVocalCut.frequency.value = 3600;
    this.wetVocalCut.Q.value = 0.9;
    this.wetVocalCut.gain.value = -7.0; // dB — let a little more reverb sit on the vocal (more concert-like, less artificially dry)
    this.wetAirCut = this.ctx.createBiquadFilter();
    this.wetAirCut.type = 'highshelf';
    this.wetAirCut.frequency.value = 6000;
    this.wetAirCut.gain.value = -6; // dB — tame sibilant tail / "shhh"
    this.master = this.ctx.createGain();
    this.master.gain.value = this._volume; // user volume (0..1)

    // brickwall-ish limiter as the final safety net so nothing tears, no matter
    // the venue / wet mix / source level.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;   // dBFS
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;       // hard limiting
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this._analyserBuf = new Float32Array(this.analyser.fftSize);

    // dry path:  in -> vocalPresence -> snareCrack -> hatAir -> dryGain -> master
    // (presence/crack/air lifts live on the direct sound only, so the vocal,
    //  snare and hats read clearly without smearing the reverb tail)
    this._inGain.connect(this.vocalPresence);
    this.vocalPresence.connect(this.snareCrack);
    this.snareCrack.connect(this.hatAir);
    this.hatAir.connect(this._wIn);        // → mid/side width matrix
    this._wMerge.connect(this.dryGain);
    this.dryGain.connect(this.master);

    // wet path: in -> preDelay -> convolver -> lowCut -> mudCut -> vocalCut -> airCut -> wetGain -> wetTrim -> master
    // The sidechain ducker is inserted between wetGain and wetTrim once its
    // AudioWorklet module finishes loading (see _installWetDucker). Until then
    // the wet bus runs straight through (no audible glitch on insertion).
    this._inGain.connect(this.preDelay);
    this.preDelay.connect(this.convolver);
    this.convolver.connect(this.wetLowCut);
    this.wetLowCut.connect(this.wetMudCut);
    this.wetMudCut.connect(this.wetVocalCut);
    this.wetVocalCut.connect(this.wetAirCut);
    this.wetAirCut.connect(this.wetGain);
    this.wetGain.connect(this.wetTrim);
    this.wetTrim.connect(this.master);

    // master -> limiter -> destination, and tap the analyser pre-limiter
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
    this.master.connect(this.analyser);

    this._applyCrossfade();
    this._installWetDucker(); // async; inserts the ducker when ready
    this._installVocalDemask(); // async; inserts the vocal de-mask when ready
  }

  // Load the worklet, then splice the ducker into the wet bus:
  //   wetGain -> [ducker] -> wetTrim   (dry tap = _inGain drives input 1)
  async _installWetDucker() {
    if (this._wetDucker) return;
    const ok = await ensureWetDucker(this.ctx);
    if (!ok || !this.ctx || !this.wetGain) return; // unsupported → leave as-is
    try {
      const ducker = createWetDucker(this.ctx);
      this.wetGain.disconnect(this.wetTrim);
      this.wetGain.connect(ducker, 0, 0);   // wet → input 0
      this._inGain.connect(ducker, 0, 1);   // dry sidechain → input 1
      ducker.connect(this.wetTrim);
      this._wetDucker = ducker;
    } catch (e) {
      console.warn('[engine] failed to insert wet ducker:', e.message);
      // ensure the wet bus stays connected if insertion threw mid-way
      try { this.wetGain.connect(this.wetTrim); } catch (_) { /* noop */ }
    }
  }

  // Load the worklet, then splice the vocal de-mask in:
  //   Mid presence  → input 0 (carrier)   Side presence → input 1 (sidechain)
  //   output (mono) → _vdAdd → dryGain (added to the center)
  async _installVocalDemask() {
    if (this._vocalDemask) return;
    const ok = await ensureVocalDemask(this.ctx);
    if (!ok || !this.ctx || !this._vdVocalBP) return; // unsupported → no boost (baseline)
    try {
      const node = createVocalDemask(this.ctx);
      this._vdVocalBP.connect(node, 0, 0); // Mid presence → input 0
      this._vdMaskBP.connect(node, 0, 1);  // Side presence → input 1
      node.connect(this._vdAdd);
      this._vocalDemask = node;
    } catch (e) {
      console.warn('[engine] failed to insert vocal de-mask:', e.message);
    }
  }

  // Browser autoplay policy: must resume() inside a user gesture.
  async resume() {
    this._ensureGraph();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  // Does this browser's <audio> decoder claim to support the file's type?
  // Chrome/Edge often report '' (no) for FLAC; Firefox/Safari report 'probably'.
  static canPlayType(file) {
    const a = document.createElement('audio');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = file.type || ({ flac: 'audio/flac', wav: 'audio/wav', aiff: 'audio/aiff', aif: 'audio/aiff', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4' }[ext] || '');
    if (!mime) return 'maybe';
    return a.canPlayType(mime) || ''; // '', 'maybe', 'probably'
  }

  // Load a File. Prefer streaming via <audio> (keeps hi-res files out of one big
  // AudioBuffer). If the element can't decode it (common for FLAC on Chrome/Edge),
  // fall back to decodeAudioData so it still plays.
  async loadFile(file) {
    this._ensureGraph();
    this._teardownBufferSource();
    this._mode = 'element';
    this._decoded = null;
    this._ended = false;
    this._bufOffset = 0;
    if (this._objectUrl) { URL.revokeObjectURL(this._objectUrl); this._objectUrl = null; }
    this._fileRef = file;

    // Lossless files (FLAC/WAV/AIFF) go straight to buffer decoding. Chrome's
    // <audio> reports `canPlayType('audio/flac') === 'probably'` even for 24-bit
    // / hi-res files it then FAILS to play ("no supported sources" at play()),
    // so trusting the element is unreliable. decodeAudioData (→ WASM fallback)
    // handles them properly. Streaming via <audio> is kept for compressed codecs.
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isLossless = ext === 'flac' || ext === 'aiff' || ext === 'aif' || ext === 'wav';
    if (isLossless) {
      try { return await this._loadDecoded(file); } catch (e) {
        console.warn('[engine] decode failed, trying <audio> anyway:', e.message);
      }
    }

    this._objectUrl = URL.createObjectURL(file);
    try {
      const p = this._whenLoaded();      // attach listeners BEFORE setting src
      this.audioEl.src = this._objectUrl;
      this.audioEl.load();
      const dur = await p;
      this.ready = true;
      return dur;
    } catch (e) {
      console.warn('[engine] <audio> decode failed, falling back to decodeAudioData:', e.message);
      return this._loadDecoded(file);
    }
  }

  async _loadDecoded(file) {
    const arr = await file.arrayBuffer();
    try {
      this._decoded = await this.ctx.decodeAudioData(arr.slice(0));
    } catch (e) {
      // decodeAudioData can't handle some FLAC (e.g. 24-bit / hi-res on Chrome).
      // Last resort: decode with the WASM FLAC decoder, then wrap as AudioBuffer.
      console.warn('[engine] decodeAudioData failed, trying WASM FLAC decoder:', e.message);
      this._decoded = await this._decodeFlacWasm(arr);
    }
    this._mode = 'buffer';
    this._bufOffset = 0;
    this._bufPlaying = false;
    this.ready = true;
    return this._decoded.duration;
  }

  // WASM FLAC fallback → AudioBuffer (handles 16/24-bit, any sample rate).
  async _decodeFlacWasm(arrayBuffer) {
    const { FLACDecoder } = await import('@wasm-audio-decoders/flac');
    const decoder = new FLACDecoder();
    await decoder.ready;
    try {
      const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(new Uint8Array(arrayBuffer));
      if (!samplesDecoded) throw new Error('FLAC decoder produced no samples');
      const ch = channelData.length;
      const buf = this.ctx.createBuffer(ch, samplesDecoded, sampleRate);
      for (let c = 0; c < ch; c++) buf.copyToChannel(channelData[c], c);
      return buf;
    } finally {
      decoder.free();
    }
  }

  async loadUrl(url) {
    this._ensureGraph();
    const p = this._whenLoaded();
    this.audioEl.src = url;
    this.audioEl.load();
    this.ready = true;
    return p;
  }

  _whenLoaded() {
    return new Promise((resolve, reject) => {
      const el = this.audioEl;
      if (!el) return reject(new Error('no audio element'));

      // already have metadata? resolve immediately (avoids missing the event)
      if (el.readyState >= 1 && Number.isFinite(el.duration) && el.duration > 0) {
        return resolve(el.duration);
      }

      let done = false;
      const finish = (fn, arg) => { if (done) return; done = true; cleanup(); fn(arg); };
      const ok = () => finish(resolve, el.duration);
      const err = () => {
        const code = el.error && el.error.code;
        const reason = code === 4
          ? 'this browser cannot decode this file (FLAC/hi-res often unsupported in <audio> on Chrome/Edge)'
          : `media error code ${code}`;
        finish(reject, new Error(reason));
      };
      // safety net: if nothing fires in 15s, surface a clear timeout
      const timer = setTimeout(() => finish(reject, new Error('load timed out (no metadata)')), 15000);

      const cleanup = () => {
        clearTimeout(timer);
        el.removeEventListener('loadedmetadata', ok);
        el.removeEventListener('canplay', ok);
        el.removeEventListener('error', err);
      };
      el.addEventListener('loadedmetadata', ok);
      el.addEventListener('canplay', ok);
      el.addEventListener('error', err);
    });
  }

  // Select the venue's impulse response (cached per venue) + pre-delay.
  setVenue(venue) {
    this._ensureGraph();
    let ir = this._irCache.get(venue.id);
    if (!ir) {
      const seed = venue.id.split('').reduce((a, c) => a + c.charCodeAt(0), 1);
      ir = buildImpulseResponse(this.ctx, venue.ir, seed);
      this._irCache.set(venue.id, ir);
    }
    this.convolver.buffer = ir;
    // pre-delay = the venue's listening-position first-reflection time if given,
    // else the IR's own predelay.
    const ms = venue.position && venue.position.firstReflection
      ? parseFloat(String(venue.position.firstReflection).replace(/[^0-9.]/g, ''))
      : null;
    this.setPreDelay(fusedPreDelay(Number.isFinite(ms) ? ms / 1000 : (venue.ir.predelay ?? 0.02)));
    // direct-sound width: mono-ish for big PA venues, full for club/hall
    this.setDryWidth(venue.dryWidth ?? 1);
  }

  setPreDelay(seconds) {
    if (!this.preDelay) return;
    const t = Math.max(0, Math.min(1, seconds));
    this.preDelay.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.01);
  }

  // Direct-path stereo width via the mid/side matrix. w: 1 = original studio
  // stereo, 0 = mono. Big-venue PA images narrow → small w; club/hall → 1.
  setDryWidth(w) {
    if (!this._wLL) return;
    const width = Math.max(0, Math.min(1, w));
    const a = (1 + width) / 2; // direct (L→L, R→R)
    const b = (1 - width) / 2; // cross  (L→R, R→L)
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._wLL.gain.setTargetAtTime(a, t, 0.02);
    this._wRR.gain.setTargetAtTime(a, t, 0.02);
    this._wLR.gain.setTargetAtTime(b, t, 0.02);
    this._wRL.gain.setTargetAtTime(b, t, 0.02);
  }

  // wet 0..100 → equal-power crossfade between dry and wet busses.
  setWetDry(percent) {
    this._wetDry = Math.max(0, Math.min(100, percent)) / 100;
    this._applyCrossfade();
  }

  setBypass(on) {
    this._bypass = !!on;
    this._applyCrossfade();
  }

  // master output volume, 0..100 (percent)
  setVolume(percent) {
    this._volume = Math.max(0, Math.min(100, percent)) / 100;
    if (this.master) {
      this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
    }
  }

  _applyCrossfade() {
    if (!this.dryGain) return;
    const w = this._bypass ? 0 : this._wetDry;
    // equal-power crossfade keeps perceived loudness ~constant across the sweep
    const dry = Math.cos(w * 0.5 * Math.PI);
    const wet = Math.cos((1 - w) * 0.5 * Math.PI);
    const t = this.ctx.currentTime;
    this.dryGain.gain.setTargetAtTime(dry, t, 0.02);
    this.wetGain.gain.setTargetAtTime(wet, t, 0.02);
  }

  // ── buffer-fallback source management ──────────────────────────────
  _teardownBufferSource() {
    if (this._bufSrc) {
      try { this._bufSrc.onended = null; this._bufSrc.stop(); } catch (e) { /* already stopped */ }
      try { this._bufSrc.disconnect(); } catch (e) { /* noop */ }
      this._bufSrc = null;
    }
    this._bufPlaying = false;
  }

  _startBufferSource(offset) {
    this._teardownBufferSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this._decoded;
    // route through the same bass shelf as the streaming source so both playback
    // modes share the identical low-end + dry/wet graph
    src.connect(this.bassShelf);
    // tag this source so a stale onended from a previous source can't fire late
    const myId = ++this._bufGen;
    src.onended = () => {
      if (myId !== this._bufGen) return;        // superseded by a newer source
      if (!this._bufPlaying) return;            // we stopped it ourselves (pause/seek)
      // ran to the natural end of the buffer
      this._bufPlaying = false;
      this._bufOffset = 0;
      this._ended = true;
    };
    const off = Math.max(0, Math.min(this._decoded.duration, offset));
    src.start(0, off);
    this._bufSrc = src;
    this._bufStartedAt = this.ctx.currentTime;
    this._bufOffset = off;
    this._bufPlaying = true;
  }

  async play() {
    await this.resume();
    this._ended = false;
    if (this._mode === 'buffer') {
      if (!this._decoded) return;
      // if we're at (or past) the end, restart from the top
      if (this._bufOffset >= this._decoded.duration - 0.05) this._bufOffset = 0;
      this._startBufferSource(this._bufOffset);
      return;
    }
    if (this.audioEl) {
      // restart from the top if the element finished
      if (this.audioEl.ended || this.audioEl.currentTime >= (this.audioEl.duration || Infinity) - 0.05) {
        try { this.audioEl.currentTime = 0; } catch (e) { /* not seekable yet */ }
      }
      try {
        await this.audioEl.play();
      } catch (e) {
        // element can't actually play this file → decode it ourselves and retry
        console.warn('[engine] play() rejected, decoding to buffer:', e.message);
        if (this._fileRef) {
          try {
            await this._loadDecoded(this._fileRef);
            this._startBufferSource(0);
          } catch (e2) {
            console.error('[engine] buffer fallback also failed:', e2.message);
          }
        }
      }
    }
  }

  pause() {
    if (this._mode === 'buffer') {
      if (this._bufPlaying) {
        this._bufOffset = this.currentTime; // remember position
        this._bufPlaying = false;           // mark first so onended is a no-op
        this._teardownBufferSource();
      }
      return;
    }
    if (this.audioEl) this.audioEl.pause();
  }

  seek(seconds) {
    this._ended = false;
    if (this._mode === 'buffer') {
      if (!this._decoded) return;
      const t = Math.max(0, Math.min(this._decoded.duration, seconds));
      if (this._bufPlaying) this._startBufferSource(t);
      else this._bufOffset = t;
      return;
    }
    if (this.audioEl && Number.isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = Math.max(0, Math.min(this.audioEl.duration, seconds));
    }
  }

  get isEnded() {
    if (this._mode === 'buffer') return this._ended;
    return this.audioEl ? this.audioEl.ended : false;
  }

  get currentTime() {
    if (this._mode === 'buffer') {
      if (!this._decoded) return 0;
      if (this._bufPlaying) {
        const t = this.ctx.currentTime - this._bufStartedAt + this._bufOffset;
        return Math.min(t, this._decoded.duration);
      }
      return this._bufOffset;
    }
    return this.audioEl ? this.audioEl.currentTime : 0;
  }
  get duration() {
    if (this._mode === 'buffer') return this._decoded ? this._decoded.duration : 0;
    const d = this.audioEl ? this.audioEl.duration : 0;
    return Number.isFinite(d) ? d : 0;
  }

  // Root-mean-square of the master bus → 0..~1, for the album-art pulse.
  getRMS() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this._analyserBuf);
    let sum = 0;
    const buf = this._analyserBuf;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  // Offline render of the current file through the current venue.
  // Mirrors the live graph so the export matches what's heard. Returns the
  // rendered AudioBuffer plus the source's original bit depth (16 or 24) and
  // sample rate, both read from the file header, so the export can preserve them.
  async renderOffline(venue) {
    if (!this._fileRef && !this._decoded) {
      throw new Error('no file loaded');
    }
    // Web Audio loses the source bit depth and resamples to the decoding
    // context's rate, so read both from the file header. No file ref (e.g. demo
    // URL) → assume 16-bit and let the decoded buffer dictate the rate.
    let bitDepth = 16;
    let srcRate = null;
    if (this._fileRef) {
      // Header chunks live at the start; reading 64KB is plenty and avoids
      // pulling a multi-MB hi-res file into memory just to peek at the header.
      const head = await this._fileRef.slice(0, 65536).arrayBuffer();
      const fmt = readAudioFormat(head);
      if (fmt) { bitDepth = fmt.bitDepth; srcRate = fmt.sampleRate; }
    }

    // decode the whole file for offline rendering (export is opt-in).
    // decodeAudioData resamples to the decoding context's rate, so the live
    // playback buffer (decoded at the system context's rate, often 48k) may not
    // match the source. Reuse it only when its rate already matches the source;
    // otherwise re-decode at the source's own rate to preserve hi-res files.
    let decoded = this._decoded;
    const wantRate = srcRate || (decoded ? decoded.sampleRate : 44100);
    if (!decoded || (this._fileRef && decoded.sampleRate !== wantRate)) {
      const arr = await this._fileRef.arrayBuffer();
      const tmp = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, wantRate, wantRate);
      decoded = await tmp.decodeAudioData(arr.slice(0));
    }

    const len = decoded.length;
    const sr = decoded.sampleRate;
    const offline = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, len + sr * Math.ceil(venue.ir.rt60 + 1), sr);
    // load the wet-ducker worklet on this offline context so export matches live
    const duckerOk = await ensureWetDucker(offline);
    const vdOk = await ensureVocalDemask(offline);

    const src = offline.createBufferSource();
    src.buffer = decoded;

    // match the live graph's low-end shaping so the export sounds identical
    const bassShelf = offline.createBiquadFilter();
    bassShelf.type = 'lowshelf';
    bassShelf.frequency.value = 120;
    bassShelf.gain.value = 7;
    const kickPeak = offline.createBiquadFilter();
    kickPeak.type = 'peaking';
    kickPeak.frequency.value = 60;
    kickPeak.Q.value = 1.6;
    kickPeak.gain.value = 3.5;
    const bassBody = offline.createBiquadFilter();
    bassBody.type = 'peaking';
    bassBody.frequency.value = 110;
    bassBody.Q.value = 1.3;
    bassBody.gain.value = 5;
    const bassDef = offline.createBiquadFilter();
    bassDef.type = 'peaking';
    bassDef.frequency.value = 800;
    bassDef.Q.value = 1.0;
    bassDef.gain.value = 1.5;
    // vocal presence lift on the dry path (match live graph) — keeps the lead
    // legible when the bass body is heavy
    const vocalPresence = offline.createBiquadFilter();
    vocalPresence.type = 'peaking';
    vocalPresence.frequency.value = 2800;
    vocalPresence.Q.value = 0.8;
    vocalPresence.gain.value = 4.5;
    // snare crack + hi-hat air on the dry path (match live graph)
    const snareCrack = offline.createBiquadFilter();
    snareCrack.type = 'peaking';
    snareCrack.frequency.value = 4500;
    snareCrack.Q.value = 1.6;
    snareCrack.gain.value = 4.5;
    const hatAir = offline.createBiquadFilter();
    hatAir.type = 'highshelf';
    hatAir.frequency.value = 10000;
    hatAir.gain.value = 3;
    // direct-sound width (mid/side) — match the live graph
    const width = venue.dryWidth ?? 1;
    const wa = (1 + width) / 2, wb = (1 - width) / 2;
    const wIn = offline.createGain();
    wIn.channelCount = 2; wIn.channelCountMode = 'explicit'; wIn.channelInterpretation = 'speakers';
    const wSplit = offline.createChannelSplitter(2);
    const wMerge = offline.createChannelMerger(2);
    const wLL = offline.createGain(); wLL.gain.value = wa;
    const wRR = offline.createGain(); wRR.gain.value = wa;
    const wLR = offline.createGain(); wLR.gain.value = wb;
    const wRL = offline.createGain(); wRL.gain.value = wb;
    wIn.connect(wSplit);
    wSplit.connect(wLL, 0); wSplit.connect(wLR, 0);
    wSplit.connect(wRL, 1); wSplit.connect(wRR, 1);
    wLL.connect(wMerge, 0, 0); wRL.connect(wMerge, 0, 0);
    wLR.connect(wMerge, 0, 1); wRR.connect(wMerge, 0, 1);

    const dry = offline.createGain();
    const wet = offline.createGain();
    const wetTrim = offline.createGain();
    wetTrim.gain.value = 0.5; // match live graph (more reverb than original, dialed for clarity)
    const pre = offline.createDelay(1.0);
    const conv = offline.createConvolver();
    conv.normalize = false; // match the live graph
    conv.buffer = buildImpulseResponse(offline, venue.ir, venue.id.split('').reduce((a, c) => a + c.charCodeAt(0), 1));
    // wet-path EQ (match live graph): low cut + mud cut + vocal cut + air cut
    const wLow = offline.createBiquadFilter();
    wLow.type = 'highpass'; wLow.frequency.value = 170; wLow.Q.value = 0.7; // keep kick/bass body in the dry path (match live)
    const mCut = offline.createBiquadFilter();
    mCut.type = 'peaking'; mCut.frequency.value = 300; mCut.Q.value = 0.85; mCut.gain.value = -8; // wider+deeper un-glue (match live)
    const vCut = offline.createBiquadFilter();
    vCut.type = 'peaking'; vCut.frequency.value = 3600; vCut.Q.value = 0.9; vCut.gain.value = -7.0; // covers snare crack halo (match live)
    const aCut = offline.createBiquadFilter();
    aCut.type = 'highshelf'; aCut.frequency.value = 6000; aCut.gain.value = -6;
    const out = offline.createGain();
    out.gain.value = this._volume;
    const limiter = offline.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.12;

    const w = this._bypass ? 0 : this._wetDry;
    dry.gain.value = Math.cos(w * 0.5 * Math.PI);
    wet.gain.value = Math.cos((1 - w) * 0.5 * Math.PI);
    const ms = venue.position ? parseFloat(String(venue.position.firstReflection).replace(/[^0-9.]/g, '')) : 20;
    pre.delayTime.value = fusedPreDelay((Number.isNaN(ms) ? 20 : ms) / 1000); // match live: glue tail to transient

    src.connect(bassShelf); bassShelf.connect(kickPeak); kickPeak.connect(bassBody); bassBody.connect(bassDef);
    bassDef.connect(vocalPresence); vocalPresence.connect(snareCrack); snareCrack.connect(hatAir);
    hatAir.connect(wIn); wMerge.connect(dry); dry.connect(out); // dry path through the width matrix
    // vocal de-mask (match live): lift the centered vocal presence when wide
    // instruments mask it, added back to the dry center
    if (vdOk) {
      const vdMid = offline.createGain();
      vdMid.channelCount = 1; vdMid.channelCountMode = 'explicit'; vdMid.channelInterpretation = 'speakers';
      const vdSplit = offline.createChannelSplitter(2);
      const vdSideL = offline.createGain(); vdSideL.gain.value = 0.5;
      const vdSideR = offline.createGain(); vdSideR.gain.value = -0.5;
      const vdSideSum = offline.createGain();
      const vdVocalBP = offline.createBiquadFilter(); vdVocalBP.type = 'bandpass'; vdVocalBP.frequency.value = 2800; vdVocalBP.Q.value = 0.8;
      const vdMaskBP = offline.createBiquadFilter(); vdMaskBP.type = 'bandpass'; vdMaskBP.frequency.value = 2800; vdMaskBP.Q.value = 0.8;
      const vd = createVocalDemask(offline);
      hatAir.connect(vdMid); vdMid.connect(vdVocalBP); vdVocalBP.connect(vd, 0, 0);
      hatAir.connect(vdSplit); vdSplit.connect(vdSideL, 0); vdSplit.connect(vdSideR, 1);
      vdSideL.connect(vdSideSum); vdSideR.connect(vdSideSum); vdSideSum.connect(vdMaskBP); vdMaskBP.connect(vd, 0, 1);
      vd.connect(dry);
    }
    bassDef.connect(pre); pre.connect(conv); conv.connect(wLow); wLow.connect(mCut); mCut.connect(vCut); vCut.connect(aCut); aCut.connect(wet);
    // sidechain ducker (match live graph): dry (bassDef) drives it, wet passes
    // through. If the worklet isn't available, run the wet bus straight through.
    if (duckerOk) {
      const ducker = createWetDucker(offline);
      wet.connect(ducker, 0, 0);      // wet → input 0
      bassDef.connect(ducker, 0, 1);  // dry sidechain → input 1
      ducker.connect(wetTrim);
    } else {
      wet.connect(wetTrim);
    }
    wetTrim.connect(out);
    out.connect(limiter); limiter.connect(offline.destination);

    src.start(0);
    const buffer = await offline.startRendering();
    return { buffer, bitDepth, sampleRate: buffer.sampleRate };
  }

  destroy() {
    if (this._objectUrl) { URL.revokeObjectURL(this._objectUrl); this._objectUrl = null; }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
      if (this.audioEl.parentNode) this.audioEl.parentNode.removeChild(this.audioEl);
    }
    // Guard against double-close (React StrictMode mounts effects twice in dev).
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
  }
}
