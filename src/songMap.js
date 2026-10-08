// songMap.js — the page's side of the song-structure reader (three/songmap.js).
//
// songMapFor(file) resolves to the track's map (beats, bars, sections) or null.
// The file is decoded once more, on its own, at a low rate and folded to mono:
// the structure needs nothing above 11 kHz, and this decode never goes near the
// audio graph. The arithmetic runs in a worker. One track at a time, cached by
// file, so the read-ahead of the next track serves its playback later.
//
// Nothing here is on the sound's path; a track that will not decode this way
// simply has no map, and the lighting follows the beat as it did before.

const RATE = 22050;
const cache = new WeakMap();   // File → Promise<map|null>
let worker = null;             // Worker | null (not started) | false (unusable)
let seq = 0;
const waiting = new Map();
let chain = Promise.resolve();

function getWorker() {
  if (worker !== null) return worker || null;
  if (typeof Worker !== 'function') { worker = false; return null; }
  try {
    worker = new Worker(new URL('./three/songmap.worker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    worker = false;
    return null;
  }
  worker.onmessage = (e) => {
    const { id, map } = e.data || {};
    const done = waiting.get(id);
    if (done) { waiting.delete(id); done(map || null); }
  };
  worker.onerror = (e) => {
    e?.preventDefault?.();
    try { worker.terminate(); } catch (err) { /* gone */ }
    worker = false;
    for (const done of waiting.values()) done(null);
    waiting.clear();
  };
  return worker;
}

async function analyze(file) {
  const w = getWorker();
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!w || !OAC) return null;
  let audio;
  try {
    const bytes = await file.arrayBuffer();
    // decodeAudioData resamples to the context's rate
    audio = await new OAC(1, 1, RATE).decodeAudioData(bytes);
  } catch (e) {
    return null;
  }
  const n = audio.length, ch = audio.numberOfChannels;
  const pcm = new Float32Array(audio.getChannelData(0));
  for (let c = 1; c < ch; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < n; i++) pcm[i] += d[i];
  }
  if (ch > 1) for (let i = 0; i < n; i++) pcm[i] /= ch;
  const id = ++seq;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, pcm, sampleRate: audio.sampleRate }, [pcm.buffer]);
  });
}

export function songMapFor(file) {
  if (!file || typeof file.arrayBuffer !== 'function') return Promise.resolve(null);
  let p = cache.get(file);
  if (!p) {
    p = chain.then(() => analyze(file)).catch(() => null);
    chain = p.then(() => {}, () => {});
    cache.set(file, p);
  }
  return p;
}

// a cached map, without starting one
export function hasSongMap(file) {
  return cache.has(file);
}
