// engine.js — playback and transport around the shared processing graph.
//
// The signal chain itself now lives in graph.js and is built identically for
// live playback and for offline export, so the two cannot drift apart.
//
// - The source is a streaming HTMLAudioElement where the browser can decode the
//   file, and a decoded AudioBuffer where it cannot (FLAC on Chrome/Edge).
// - The analyser taps ahead of the volume control, so the artwork pulse follows
//   the music rather than the volume knob.

import { buildGraph, wetTrimDb } from './graph.js';
import { readAudioFormat } from './bitdepth.js';
import { reverbTimes } from './roomacoustics.js';
import { roomAbsorption } from './venuerooms.js';

// AudioWorklet modules live in public/ so they are served verbatim and can be
// fetched as standalone modules. BASE_URL keeps them correct under the Pages
// base path.
const WORKLETS = {
  transient: `${import.meta.env.BASE_URL}transient-processor.js`,
  vocalAnchor: `${import.meta.env.BASE_URL}vocal-anchor-processor.js`,
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
  }

  // Build the AudioContext and the graph. Idempotent; called on first gesture.
  _ensureGraph() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

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

  // (Re)build the processing chain and reconnect the source to it.
  _buildChain() {
    const venue = this._venue;
    if (!venue) return;
    const old = this.graph;
    const wetDb = wetTrimDb(
      this._bypass ? -1000 : (this._wetPercent ?? venue.position.wet),
      venue.position.wet,
    );
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
    if (old) {
      try { old.limiter.disconnect(); old.out.disconnect(this.analyser); } catch (e) { /* noop */ }
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

  // Select the venue. The impulse response, the reverberant level, the air
  // absorption and the PA character all follow from the venue's room model, so
  // this rebuilds the chain rather than poking individual parameters.
  setVenue(venue) {
    this._ensureGraph();
    const changed = !this._venue || this._venue.id !== venue.id;
    this._venue = venue;
    if (changed) this._wetPercent = venue.position.wet;
    this._buildChain();
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
    const db = this._bypass ? -1000 : wetTrimDb(this._wetPercent ?? def, def);
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
  async renderOffline(venue) {
    if (!this._fileRef && !this._decoded) throw new Error('no file loaded');

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
      wetDb: this._bypass ? -1000 : wetTrimDb(this._wetPercent ?? def, def),
      worklets,
    });
    graph.limiter.connect(offline.destination);

    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(graph.trim);
    src.start(0);

    const buffer = await offline.startRendering();
    return { buffer, bitDepth, sampleRate: buffer.sampleRate };
  }

  // How long the venue's response rings for, so an export is not truncated.
  _responseSeconds(venue) {
    const rts = reverbTimes(roomAbsorption(venue.id));
    return Math.min(Math.max(...rts) * 1.05 + 0.05, 5);
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
