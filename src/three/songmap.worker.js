// songmap.worker.js — reads a song's structure off the main thread.
// The page sends the track as mono samples; the map comes back as plain data.
import { analyzeSong } from './songmap.js';

self.onmessage = (e) => {
  const { id, pcm, sampleRate } = e.data || {};
  try {
    self.postMessage({ id, map: analyzeSong(pcm, sampleRate) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
