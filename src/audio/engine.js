// engine.js — playback and transport around the shared processing graph.
//
// The signal chain itself now lives in graph.js and is built identically for
// live playback and for offline export, so the two cannot drift apart.
//
// - The source is a streaming HTMLAudioElement where the browser can decode the
//   file, and a decoded AudioBuffer where it cannot (FLAC on Chrome/Edge).
// - The analyser taps ahead of the volume control, so the artwork pulse follows
//   the music rather than the volume knob.

import { buildGraph, applyVenue, disposeGraph, wetTrimDb } from './graph.js';
import { readAudioFormat } from './bitdepth.js';
import { reverbTimes } from './roomacoustics.js';
import { roomAbsorption, VENUE_ROOMS } from './venuerooms.js';
import { synthesizeIR, venueSeed } from './impulse.js';

// AudioWorklet modules live in public/ so they are served verbatim and can be
// fetched as standalone modules. BASE_URL keeps them correct under the Pages
// base path.
const WORKLETS = {
  transient: `${import.meta.env.BASE_URL}transient-processor.js`,
  vocalAnchor: `${import.meta.env.BASE_URL}vocal-anchor-processor.js`,
  limiter: `${import.meta.env.BASE_URL}limiter-processor.js`,
  glue: `${import.meta.env.BASE_URL}glue-processor.js`,
};

// Load every worklet module onto a context and report which ones took. Each is
// an additive send, so a browser that cannot load one simply does without it
// rather than losing the audio path.
async function loadWorklets(ctx) {
  const available = {};
  if (!ctx.audioWorklet) return available;
  if (ctx.__workletsReady) return ctx.__workletsReady;
  await Promise.all(Object.entries(WORKLETS).map(async ([key, url]) => {
    try {
      await ctx.audioWorklet.addModule(url);
      available[key] = true;
    } catch (e) {
      console.warn(`[engine] worklet ${key} unavailable:`, e.message);
    }
  }));
  ctx.__workletsReady = available;
  return available;
}

// How much of an export's progress bar the decode step owns. It is one opaque
// call that cannot report anything, so it gets a share rather than a ramp.
const DECODE_SHARE = 0.12;
// How many points the offline render is suspended at to report progress. Each
// suspension costs a round trip through the event loop, so this is enough to
// look continuous and few enough to be free.
const PROGRESS_STEPS = 40;

export class ConcertEngine {
  constructor() {
    this.ctx = null;
    this.audioEl = null;
    this.source = null;
    this.graph = null;          // node map from buildGraph
    this.analyser = null;
    this._analyserBuf = null;
    this._objectUrl = null;
    this._venue = null;
    this._wetPercent = null;    // null until a venue sets its default
    this._bypass = false;
    this._volume = 0.85;        // 0..1
    this._worklets = {};
    this.ready = false;
    this._detachLifecycle = null;
    // Fired once when a track reaches its NATURAL end, from real audio events
    // rather than the UI's animation clock, so auto-advance keeps working while
    // the tab is backgrounded.
    this.onended = null;

    // Decoded-buffer fallback, used where <audio> cannot decode the file.
    this._mode = 'element';     // 'element' | 'buffer'
    this._decoded = null;
    this._bufSrc = null;
    this._bufStartedAt = 0;
    this._bufOffset = 0;
    this._bufPlaying = false;
    this._bufGen = 0;           // generation counter, to ignore stale onended
    this._ended = false;
    this._fileRef = null;       // original File, for offline export

    // The NEXT track, decoded while this one plays — see prepareNext(). One
    // track deep, deliberately: a decoded AudioBuffer is float32 per channel, so
    // five minutes of 24/96 stereo is about 230 MB, and holding a whole queue of
    // them would cost more than the gap it saves is worth.
    this._prepared = null;      // { file, buffer }
    this._preparing = null;     // File currently being decoded ahead

    // Audio-thread load, filled by _watchLoad() where the browser reports it.
    this._load = { average: 0, peak: 0, underrun: 0, supported: false };
  }

  // Build the AudioContext and the graph. Idempotent; called on first gesture.
  _ensureGraph() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    // `playback`, not the default `interactive`.
    //
    // The default asks the browser for the smallest output buffer it can manage,
    // because the default assumes something is waiting on the sound — an
    // instrument, a game, a call. Nothing here is: this is a file being played
    // back, and the only thing a small buffer buys is a shorter delay between
    // pressing play and hearing it, which nobody can perceive and nobody is
    // measuring.
    //
    // What it COSTS is the entire margin. A render quantum is 128 samples either
    // way, but the buffer downstream is what decides how many quanta may run late
    // before the gap is audible, and `interactive` leaves room for almost none.
    // This graph is a four-channel convolver with responses up to five seconds,
    // six worklets and some seventy nodes; it is not a light load, and it does
    // not need to be low-latency to be correct.
    //
    // The symptom this fixes is specific and was diagnosed from it: crackle on
    // battery that disappears when the laptop is plugged in. Nothing about the
    // audio changes when the power does — what changes is the clock the cores
    // run at, and a graph with no margin left is one governor step away from
    // missing its deadline. Not a sample of the signal path differs; there is
    // simply somewhere for a late quantum to go.
    this.ctx = new AC({ latencyHint: 'playback' });
    this._watchLoad();

    this.audioEl = new Audio();
    this.audioEl.preload = 'auto';
    // Some Chromium builds only drive a MediaElementSource reliably when the
    // element is attached to the document. Mount it hidden.
    this.audioEl.style.display = 'none';
    document.body.appendChild(this.audioEl);
    this.audioEl.addEventListener('ended', () => this._emitEnded());
    this.source = this.ctx.createMediaElementSource(this.audioEl);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this._analyserBuf = new Float32Array(this.analyser.fftSize);

    this._buildChain();
    this._prewarmResponses();
    // The worklets arrive asynchronously; rebuild once they are ready so their
    // sends are present. Both are additive, so the chain is correct either way
    // and the rebuild is inaudible.
    loadWorklets(this.ctx).then((available) => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      if (!Object.keys(available).length) return;
      this._worklets = available;
      this._buildChain();
    });
  }

  // ── how close to the deadline is the audio thread running? ─────────────────
  //
  // `underrunRatio` is the share of render quanta that missed their deadline —
  // which is not a proxy for the crackle, it IS the crackle. Everything else
  // about a dropout is guesswork; this is the browser reporting the event.
  //
  // Nothing in the audio path reacts to it. It is read by the scene, which gives
  // frames back when the audio thread is struggling — the drawing is what yields,
  // never the sound. Chrome and Edge implement it; where it is absent the load
  // reads zero and the scene simply keeps its own frame-cost governor.
  _watchLoad() {
    this._load = { average: 0, peak: 0, underrun: 0, supported: false };
    const cap = this.ctx.renderCapacity;
    if (!cap) return;
    this._load.supported = true;
    cap.onupdate = (e) => {
      this._load.average = e.averageLoad;
      this._load.peak = e.peakLoad;
      this._load.underrun = e.underrunRatio;
    };
    try { cap.start({ updateInterval: 1 }); } catch (e) { this._load.supported = false; }
  }

  // { average, peak, underrun, supported } — see _watchLoad.
  getLoad() {
    return this._load || { average: 0, peak: 0, underrun: 0, supported: false };
  }

  // Synthesise every venue's response ahead of time, one per idle slot.
  //
  // Building one costs 40–200 ms, and doing it at the moment a venue is chosen
  // put that on the main thread while audio was playing. They are cached, so
  // this is paid once, quietly, and only the first change to a venue would ever
  // have been slow anyway.
  // Synthesising one is 30–170 ms of straight-line arithmetic on the main thread
  // — several frames on a desktop and a good deal worse on a phone — so it only
  // ever runs when nothing is playing and the page is on screen. It used to run
  // regardless, on an idle callback, and idle callbacks do not fire in a
  // backgrounded tab: they queue up and then all land at once on the way back,
  // which is the worst possible moment. A blocked main thread does not stop the
  // audio thread, but on a phone the two are not independent — they contend for
  // the same little cores, and an audio callback that misses its deadline is
  // heard, not measured.
  _prewarmResponses() {
    const ids = Object.keys(VENUE_ROOMS);
    const rate = this.ctx.sampleRate;
    const busy = () => this._bufPlaying
      || (this.audioEl && !this.audioEl.paused)
      || (typeof document !== 'undefined' && document.visibilityState === 'hidden');
    const next = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      if (busy()) { schedule(1500); return; }   // come back when it is free
      const id = ids.shift();
      if (!id) return;
      try { synthesizeIR({ venueId: id, sampleRate: rate, seed: venueSeed(id) }); } catch (e) { /* not fatal */ }
      schedule();
    };
    const schedule = (delay = 200) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(next, { timeout: 2000 });
      else setTimeout(next, delay);
    };
    schedule();
  }

  // ── page lifecycle ────────────────────────────────────────────────────────
  //
  // Two separate failures live here, and on Android they compound into the same
  // symptom: playback that comes back from a backgrounded tab running at many
  // times speed with loud noise over it.
  //
  //   THE CONTEXT WAS BEING DESTROYED. The teardown was wired to `pagehide`, on
  //   the assumption that it means the page is going away. On mobile it does not:
  //   it fires every time the tab is backgrounded, because the page is being put
  //   into the back/forward cache to be restored. So switching tabs, or opening
  //   the file picker, closed the AudioContext out from under a running graph.
  //
  //   NOTHING CHECKED THE CONTEXT ON THE WAY BACK. If the output device is
  //   reinitialised underneath a context — a route change, a sample-rate change —
  //   the context is left rendering against a sink that does not match it, and
  //   no amount of correct application code fixes that from the inside. It IS
  //   measurable, though: the context clock stops tracking the wall clock, and
  //   the ratio between them is exactly how fast playback sounds. When it
  //   diverges the context is rebuilt at the same position.
  //
  // PLAYBACK IS NOT PAUSED WHILE HIDDEN. Suspending the context on the way out
  // was tried, and it does reduce the load: a convolver and six worklets stop
  // rendering on a CPU the phone has just moved to its small cores. But leaving
  // a tab is not asking for the music to stop, and a player that goes quiet when
  // you look at something else is a worse thing to be than one that occasionally
  // glitches. The load is dealt with by costing less, not by doing nothing — see
  // the impulse response trimming in impulse.js and the merged transient stage.
  attachPageLifecycle() {
    if (typeof document === 'undefined') return () => {};
    const onVisibility = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      if (document.visibilityState !== 'visible') return;
      // Some browsers suspend a backgrounded context on their own account even
      // though we did not ask them to. Undo that, then check the clock.
      const resumed = this.ctx.state === 'suspended'
        ? this.ctx.resume().catch(() => {})
        : Promise.resolve();
      resumed.then(() => this._verifyClock());
    };
    document.addEventListener('visibilitychange', onVisibility);
    this._detachLifecycle = () => document.removeEventListener('visibilitychange', onVisibility);
    return this._detachLifecycle;
  }

  // Does the context clock still advance at the rate of the wall clock? A
  // context rendering into a mismatched sink does not, and that ratio is exactly
  // how fast playback sounds.
  async _verifyClock() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const c0 = ctx.currentTime;
    const w0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    await new Promise((r) => setTimeout(r, 400));
    if (this.ctx !== ctx || ctx.state !== 'running') return;
    const wall = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - w0) / 1000;
    if (wall < 0.2) return;             // the timer itself was throttled; no verdict
    const ratio = (ctx.currentTime - c0) / wall;
    // Generous either way. Timer jitter on a loaded phone is worth a few per
    // cent; the failure being caught here is not subtle.
    if (ratio > 1.3 || ratio < 0.7) {
      console.warn(`[engine] audio clock running at ${ratio.toFixed(2)}× wall clock; rebuilding`);
      await this._rebuildContext();
    }
  }

  // Last resort: throw the AudioContext away and build a new one, putting
  // playback back where it was. Nothing else recovers a context whose output
  // device has changed underneath it.
  async _rebuildContext() {
    const wasPlaying = this._mode === 'buffer' ? this._bufPlaying : !!(this.audioEl && !this.audioEl.paused);
    const at = this.currentTime;
    const file = this._fileRef;
    const decoded = this._decoded;
    const mode = this._mode;

    if (this._detachLifecycle) this._detachLifecycle();
    this._teardownBufferSource();
    const old = this.ctx;
    this.ctx = null;
    this.graph = null;
    this.source = null;
    if (this.audioEl && this.audioEl.parentNode) this.audioEl.parentNode.removeChild(this.audioEl);
    this.audioEl = null;
    if (old && old.state !== 'closed') { try { await old.close(); } catch (e) { /* already gone */ } }

    // Worklet modules are registered per context, so the new one has none until
    // it loads them. Claiming otherwise would have _buildChain construct
    // AudioWorkletNodes for processors this context has never heard of.
    this._worklets = {};
    // Same reasoning for the read-ahead buffer: it was resampled to the old
    // context's rate, and a rate change is one of the things being recovered
    // from here. Decode it again on the new context if it is still wanted.
    this._prepared = null;
    this._preparing = null;
    this._ensureGraph();
    this.attachPageLifecycle();
    this._applyWet();
    if (this.graph) this.graph.volume.gain.value = this._volume;

    this._mode = mode;
    if (mode === 'buffer') {
      // An AudioBuffer decoded against the old context was resampled to ITS
      // rate. If the new context runs at a different one, reusing it is the very
      // fault being recovered from, so decode again where the file allows.
      this._decoded = decoded;
      if (file && decoded && decoded.sampleRate !== this.ctx.sampleRate) {
        try { await this._loadDecoded(file); } catch (e) { /* keep what we have */ }
      }
      this._bufOffset = at;
      if (wasPlaying) this._startBufferSource(at);
    } else if (this.audioEl && this._objectUrl) {
      this.audioEl.src = this._objectUrl;
      this.audioEl.load();
      try { this.audioEl.currentTime = at; } catch (e) { /* not seekable yet */ }
      if (wasPlaying) this.audioEl.play().catch(() => {});
    }
  }

  // (Re)build the processing chain and reconnect the source to it.
  _buildChain() {
    const venue = this._venue;
    if (!venue) return;
    const old = this.graph;
    const wetDb = this._bypass
      ? -1000
      : wetTrimDb(this._wetPercent ?? venue.position.wet, venue);
    const graph = buildGraph(this.ctx, {
      venue,
      volume: this._volume,
      wetDb,
      worklets: this._worklets,
    });
    graph.out.connect(this.analyser); // ahead of the volume control
    graph.limiter.connect(this.ctx.destination);
    this.graph = graph;

    this.source.disconnect();
    this.source.connect(graph.trim);
    if (this._bufSrc) {
      try { this._bufSrc.disconnect(); } catch (e) { /* already gone */ }
      this._bufSrc.connect(graph.trim);
    }
    if (old) disposeGraph(old);
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

  // Decode a File to an AudioBuffer without touching playback state, so the same
  // path serves both the track being loaded and the one being read ahead.
  async _decodeToBuffer(file) {
    const arr = await file.arrayBuffer();
    try {
      // Hand decodeAudioData the buffer itself rather than a copy of it.
      //
      // It detaches its input, so `arr` is unusable afterwards either way, and
      // the copy existed only so the WASM fallback below would still have
      // something to read. That doubled the peak allocation of the largest
      // thing this app ever holds — tens of megabytes for a hi-res file, while
      // audio is playing — to insure against the rare path. The fallback reads
      // the file again instead, which costs nothing until it is needed.
      return await this.ctx.decodeAudioData(arr);
    } catch (e) {
      // decodeAudioData can't handle some FLAC (e.g. 24-bit / hi-res on Chrome).
      // Last resort: decode with the WASM FLAC decoder, then wrap as AudioBuffer.
      console.warn('[engine] decodeAudioData failed, trying WASM FLAC decoder:', e.message);
      return this._decodeFlacWasm(await file.arrayBuffer());
    }
  }

  async _loadDecoded(file) {
    // Already read ahead? Then the gap between tracks is the cost of assigning a
    // variable, which is the whole point of prepareNext().
    const ahead = this._takePrepared(file);
    this._decoded = ahead || await this._decodeToBuffer(file);
    this._mode = 'buffer';
    this._bufOffset = 0;
    this._bufPlaying = false;
    this.ready = true;
    return this._decoded.duration;
  }

  // ── reading ahead ──────────────────────────────────────────────────────────
  //
  // Decoding is the whole of the gap between tracks. A lossless file is decoded
  // in full before it can start — that is not a shortcut, it is the only way
  // Chrome plays hi-res FLAC at all (see loadFile) — and for a long 24-bit track
  // that is a second or more of silence at exactly the moment the next song
  // should have begun.
  //
  // So it happens during the previous track instead. decodeAudioData does its
  // work off the main thread, so the decode does not compete with the audio
  // callback the way synthesising an impulse response would; what it does spend
  // is memory, which is why only one track is ever held.
  //
  // The reverberation tail is not interrupted by any of this. The convolver is
  // never rebuilt between tracks — only the source feeding it is replaced — so
  // the last chord of one song is still ringing in the room when the next
  // starts, which is what a room does and what a concert sounds like.
  async prepareNext(file) {
    if (!file) return;
    if (this._prepared && this._prepared.file === file) return;
    if (this._preparing === file) return;
    // Only the decoded path benefits. A file that streams through <audio> has no
    // decode step to move.
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!(ext === 'flac' || ext === 'aiff' || ext === 'aif' || ext === 'wav')) return;
    this._ensureGraph();

    this._preparing = file;
    const rate = this.ctx.sampleRate;
    try {
      const buffer = await this._decodeToBuffer(file);
      // The context may have been rebuilt underneath us (a device change), in
      // which case this buffer was resampled to a rate that is no longer the
      // output's and reusing it is the very fault _rebuildContext recovers from.
      if (!this.ctx || this.ctx.state === 'closed' || this.ctx.sampleRate !== rate) return;
      if (this._preparing !== file) return;   // superseded while decoding
      this._prepared = { file, buffer };
    } catch (e) {
      // Not fatal, and not worth reporting: the track will be decoded the normal
      // way when it is reached, and fail there if it is going to.
      console.warn('[engine] read-ahead decode failed:', e.message);
    } finally {
      if (this._preparing === file) this._preparing = null;
    }
  }

  // Hand over the read-ahead buffer if it is the file being asked for, and clear
  // it either way — a track that is not the one we guessed makes the guess dead
  // weight, and it is the largest allocation in the app.
  _takePrepared(file) {
    const hit = this._prepared && this._prepared.file === file ? this._prepared.buffer : null;
    this._prepared = null;
    return hit;
  }

  // Is `file` already decoded and waiting? Used by the UI to show that the next
  // track will start without a gap.
  isPrepared(file) {
    return !!(file && this._prepared && this._prepared.file === file);
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

  // Select the venue. The impulse response, the reverberant level, the air
  // absorption and the PA character all follow from the venue's room model, so
  // this rebuilds the chain rather than poking individual parameters.
  setVenue(venue) {
    this._ensureGraph();
    const changed = !this._venue || this._venue.id !== venue.id;
    this._venue = venue;
    if (changed) this._wetPercent = venue.position.wet;
    if (!this.graph) {
      this._buildChain();
      return;
    }
    // A venue that has not changed has nothing to cross-fade TO.
    //
    // applyVenue always swaps convolver slots, so calling it for the venue
    // already playing rebuilds the room it is already in: two identical
    // responses overlap for the length of the fade, and the incoming one starts
    // from a cleared state and takes the whole response to fill. In the dome
    // that is five seconds. What it sounds like is the reverberation changing
    // about a second after nothing happened — the outgoing slot is released on
    // a 1.25 s timer, which is where the second event comes from.
    //
    // React StrictMode mounts effects twice in development, and the venue
    // effect has no cleanup, so this was called twice on every load and the
    // second call did exactly that. `changed` was already being computed here
    // and simply was not being used for it.
    if (!changed) {
      this._applyWet();
      return;
    }
    // Parameters only — the graph is never rebuilt for a venue change.
    applyVenue(this.ctx, this.graph, venue);
    this._applyWet();
  }

  // 0..100. The venue's own default is the physically correct reverberant level
  // for that seat; the slider trims ±12 dB around it. The direct level does not
  // move — a room does not turn its direct sound down when you add reverberation.
  setWetDry(percent) {
    this._wetPercent = Math.max(0, Math.min(100, percent));
    this._applyWet();
  }

  setBypass(on) {
    this._bypass = !!on;
    this._applyWet();
  }

  _applyWet() {
    if (!this.graph || !this._venue) return;
    const def = this._venue.position.wet;
    const db = this._bypass ? -1000 : wetTrimDb(this._wetPercent ?? def, this._venue);
    const g = db <= -100 ? 0 : Math.pow(10, db / 20);
    this.graph.wet.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
  }

  // master output volume, 0..100 (percent)
  setVolume(percent) {
    this._volume = Math.max(0, Math.min(100, percent)) / 100;
    if (this.graph) {
      this.graph.volume.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
    }
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
    // Both playback modes feed the same chain input.
    src.connect(this.graph.trim);
    // tag this source so a stale onended from a previous source can't fire late
    const myId = ++this._bufGen;
    src.onended = () => {
      if (myId !== this._bufGen) return;        // superseded by a newer source
      if (!this._bufPlaying) return;            // we stopped it ourselves (pause/seek)
      // ran to the natural end of the buffer
      this._bufPlaying = false;
      this._bufOffset = 0;
      this._ended = true;
      this._emitEnded();
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

  // Notify the app that the current track reached its natural end. Fired from
  // real audio events (element 'ended' / buffer-source onended), so auto-advance
  // works even while backgrounded (where the UI's rAF clock is paused).
  _emitEnded() {
    if (typeof this.onended === 'function') {
      try { this.onended(); } catch (e) { /* ignore listener errors */ }
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

  // Root-mean-square at the analyser tap → 0..~1, for the artwork pulse. The
  // tap sits ahead of the volume control, so the pulse follows the music rather
  // than growing and shrinking with the volume knob.
  getRMS() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this._analyserBuf);
    let sum = 0;
    const buf = this._analyserBuf;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  // Offline render of the current file through the current venue.
  //
  // Builds the SAME graph as playback via buildGraph, so the export is what was
  // heard by construction rather than by two hand-maintained copies agreeing.
  // Returns the rendered buffer plus the source's original bit depth and sample
  // rate, read from the file header, so the export can preserve both.
  //
  // `onProgress(fraction)` is called as the render advances, 0 → 1. An
  // OfflineAudioContext reports nothing on its own, so the progress is real
  // rather than estimated: the render is suspended at a series of known points
  // and resumed, and each suspension is the render telling us where it has got
  // to. Where suspend() is unavailable the render still runs, silently.
  async renderOffline(venue, { onProgress } = {}) {
    if (!this._fileRef && !this._decoded) throw new Error('no file loaded');
    const report = typeof onProgress === 'function' ? onProgress : () => {};

    // Web Audio discards the source bit depth and resamples to the decoding
    // context's rate, so both are read from the header. No file reference (a
    // demo URL) means assuming 16-bit and taking the rate from the buffer.
    let bitDepth = 16;
    let srcRate = null;
    if (this._fileRef) {
      // Header chunks live at the start; 64 KB is plenty, and avoids pulling a
      // multi-megabyte hi-res file into memory to peek at its header.
      const head = await this._fileRef.slice(0, 65536).arrayBuffer();
      const fmt = readAudioFormat(head);
      if (fmt) { bitDepth = fmt.bitDepth; srcRate = fmt.sampleRate; }
    }

    // decodeAudioData resamples to the decoding context's rate, so the playback
    // buffer may not match the source. Reuse it only when the rates agree.
    let decoded = this._decoded;
    const wantRate = srcRate || (decoded ? decoded.sampleRate : 44100);
    if (!decoded || (this._fileRef && decoded.sampleRate !== wantRate)) {
      const arr = await this._fileRef.arrayBuffer();
      const tmp = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, wantRate, wantRate);
      decoded = await tmp.decodeAudioData(arr.slice(0));
    }
    // Decoding is a single opaque call with no progress of its own, so it gets a
    // fixed slice of the bar rather than a fake ramp across it.
    report(DECODE_SHARE);

    const sr = decoded.sampleRate;
    // Leave room for the response to ring out past the end of the music.
    const tail = Math.ceil(this._responseSeconds(venue) + 1);
    const offline = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
      2, decoded.length + sr * tail, sr,
    );
    const worklets = await loadWorklets(offline);

    const def = venue.position.wet;
    const graph = buildGraph(offline, {
      venue,
      // Render at unity. The playback volume knob is a monitoring control, and
      // baking it into the file meant listening quietly produced a quiet export.
      volume: 1,
      wetDb: this._bypass ? -1000 : wetTrimDb(this._wetPercent ?? def, venue),
      worklets,
    });
    graph.limiter.connect(offline.destination);

    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(graph.trim);
    src.start(0);

    // Suspend the render at a series of points and resume it. Each suspension
    // resolves when the render reaches that frame, so the bar moves with the
    // work rather than with a timer. Suspension times must land on a render
    // quantum, so they are rounded down to one.
    const total = offline.length;
    for (let i = 1; i < PROGRESS_STEPS; i++) {
      const at = Math.floor((total * i) / PROGRESS_STEPS / 128) * 128;
      if (at <= 0 || at >= total) continue;
      try {
        offline.suspend(at / sr).then(() => {
          report(DECODE_SHARE + (1 - DECODE_SHARE) * (i / PROGRESS_STEPS));
          offline.resume();
        }).catch(() => {});
      } catch (e) {
        break; // no suspend() on this browser — render straight through
      }
    }

    const buffer = await offline.startRendering();
    report(1);
    return { buffer, bitDepth, sampleRate: buffer.sampleRate };
  }

  // How long the venue's response rings for, so an export is not truncated.
  _responseSeconds(venue) {
    const rts = reverbTimes(roomAbsorption(venue.id));
    return Math.min(Math.max(...rts) * 1.05 + 0.05, 5);
  }

  destroy() {
    this._prepared = null;
    this._preparing = null;
    if (this.ctx && this.ctx.renderCapacity) {
      try { this.ctx.renderCapacity.stop(); } catch (e) { /* never started */ }
    }
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
