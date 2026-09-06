// impulse.worker.js — synthesise a venue's response off the main thread.
//
// synthesizeIR is pure arithmetic with no Web Audio in it (that is what lets
// the verification scripts run it in Node), which also makes it the one piece of
// this engine that can leave the main thread entirely. Building a response costs
// 40–130 ms on a desktop and several times that on a phone, and it used to be
// paid on the main thread at the moment a venue was chosen — while a convolver
// and six worklets were trying to meet a deadline on the same handful of cores.
//
// The finished channels come back by transfer rather than copy: four
// Float32Arrays of up to a quarter of a million samples each, handed over in
// constant time. See impulseworker.js for the main-thread side.

import { synthesizeIRUncached } from './impulse.js';

self.onmessage = (e) => {
  const { id, venueId, sampleRate, seed } = e.data || {};
  try {
    const built = synthesizeIRUncached({ venueId, sampleRate, seed });
    self.postMessage({ id, built }, built.channels.map((c) => c.buffer));
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  }
};
