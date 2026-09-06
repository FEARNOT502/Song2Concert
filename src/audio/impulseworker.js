// impulseworker.js — the main-thread side of impulse.worker.js.
//
// One call: ensureImpulseResponse(spec). When it resolves, synthesizeIR for
// that spec is a cache lookup, and buildImpulseResponse — which the graph uses
// to load a convolver — costs a buffer copy and nothing else.
//
// Three outcomes, in order of preference:
//   · already cached      → resolves at once
//   · a worker is usable  → built there, transferred back, cached
//   · no worker           → built here, synchronously, as it always was
//
// The last is the fallback for a browser without module workers or a page
// served in a way that cannot load one; the sound is identical on every path,
// since it is the same function producing the same numbers.

import {
  hasImpulseResponse, storeImpulseResponse, synthesizeIR, impulseKey,
} from './impulse.js';

let worker = null;        // Worker | null (not started) | false (unusable)
let seq = 0;
const inflight = new Map(); // id → { resolve, reject, key }
const byKey = new Map();    // key → Promise, so one build serves every caller

function fail(reason) {
  const err = new Error(reason);
  for (const p of inflight.values()) p.reject(err);
  inflight.clear();
  byKey.clear();
}

function getWorker() {
  if (worker !== null) return worker || null;
  if (typeof Worker !== 'function') { worker = false; return null; }
  try {
    worker = new Worker(new URL('./impulse.worker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    worker = false;
    return null;
  }
  worker.onmessage = (e) => {
    const { id, built, error } = e.data || {};
    const p = inflight.get(id);
    if (!p) return;
    inflight.delete(id);
    byKey.delete(p.key);
    if (built) p.resolve(storeImpulseResponse(built));
    else p.reject(new Error(error || 'impulse worker failed'));
  };
  // A worker that cannot start (no module-worker support, a blocked script)
  // reports it here, asynchronously. From then on everything is built inline.
  worker.onerror = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    try { worker.terminate(); } catch (err) { /* already gone */ }
    worker = false;
    fail('impulse worker unavailable');
  };
  return worker;
}

// Is there somewhere other than the main thread to build a response? Reported
// honestly: true until a worker has actually failed.
export function impulseWorkerAvailable() {
  return worker !== false && typeof Worker === 'function';
}

export function ensureImpulseResponse(spec) {
  if (hasImpulseResponse(spec)) return Promise.resolve(synthesizeIR(spec));
  const key = impulseKey(spec);
  const pending = byKey.get(key);
  if (pending) return pending;

  const w = getWorker();
  if (!w) return Promise.resolve(synthesizeIR(spec));

  const id = ++seq;
  const promise = new Promise((resolve, reject) => {
    inflight.set(id, { resolve, reject, key });
    w.postMessage({ id, venueId: spec.venueId, sampleRate: spec.sampleRate, seed: spec.seed ?? 1 });
  }).catch(() => {
    // Whatever went wrong in the worker, the response can still be built here.
    return synthesizeIR(spec);
  });
  byKey.set(key, promise);
  return promise;
}
