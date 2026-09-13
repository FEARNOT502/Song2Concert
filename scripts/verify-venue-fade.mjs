#!/usr/bin/env node
// verify-venue-fade.mjs — the convolver slot handover, under a stalled main thread.
//
// applyVenue cross-fades between two convolver slots and frees the one it left
// on a timer. The audio clock and that timer are different clocks, and the whole
// class of fault this guards against is what happens when they disagree: a main
// thread busy decoding the next track runs the release late, while
// ctx.currentTime carries on regardless.
//
// The Web Audio surface applyVenue touches is small and entirely mockable, so
// this runs in plain node with no browser: the point is the state machine, not
// the DSP.
import { applyVenue } from '../src/audio/graph.js';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// ── the mock ────────────────────────────────────────────────────────────────
// Timers are held rather than run, so a test can decide when the main thread
// gets round to them. That is the whole experiment.
const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; };
const runTimers = () => {
  // A timer may schedule another; run until quiet, newest state first.
  for (let i = 0; i < timers.length; i++) {
    const t = timers[i];
    if (t.done || t.cancelled) continue;
    t.done = true;
    t.fn();
  }
};

const param = (v = 0) => ({
  value: v,
  cancelScheduledValues() {}, setValueAtTime() {},
  linearRampToValueAtTime(x) { this.value = x; },
  setValueCurveAtTime() {},
});

function mockGraph() {
  const conv = (name) => ({ name, buffer: null });
  const connected = new Set();
  const n = {
    air4k: { gain: param() }, air10k: { gain: param() },
    sendLF: { gain: param() }, sendMud: { gain: param() },
    sendVocalDip: { gain: param() },
    subCut: { frequency: param(80) },
    rigLow: { gain: param() }, wWidth: { gain: param(1) },
    sendHF: {
      gain: param(), frequency: param(2000),
      connect(x) { connected.add(x.name); },
      disconnect(x) { connected.delete(x.name); },
    },
    glue: null,
    sat: { curve: null },
    convA: conv('A'), convB: conv('B'),
    convGainA: { gain: param(0) }, convGainB: { gain: param(0) },
    active: null,
  };
  return { n, connected };
}

let now = 0;
const ctx = {
  get currentTime() { return now; },
  sampleRate: 48000,
  createBuffer: (channels, length, sampleRate) => ({
    numberOfChannels: channels, length, sampleRate,
    getChannelData: () => new Float32Array(length),
    copyToChannel() {},
  }),
};

const V = (id) => ({ id, pa: { glue: 0.15, drive: 0.1 }, position: { wet: 40 } });

// ── the scenario ────────────────────────────────────────────────────────────
console.log('\nvenue handover with the release timer stalled\n');

timers.length = 0;
now = 0;
const { n, connected } = mockGraph();
const FADE = { fadeIn: 0.25, fadeOut: 1.2 };

// 1. first venue: nothing to fade from, comes straight up
applyVenue(ctx, n, V('club'), FADE);
check('first venue takes a slot', n.active === 'A', `active=${n.active}`);
check('no release pending yet', !n.releaseIdle);

// 2. second venue: a real cross-fade, and a release is scheduled
now = 10;
applyVenue(ctx, n, V('arena'), FADE);
check('second venue takes the other slot', n.active === 'B', `active=${n.active}`);
check('release scheduled for the slot left behind', !!n.releaseIdle);
const liveAfterSecond = n.active;

// 3. the main thread stalls — a long decode, a backgrounded tab — so the
//    release does NOT run, but the audio clock keeps going well past its
//    deadline. A third venue arrives in that window.
now = 10 + FADE.fadeOut + 5;      // audio clock is five seconds past the deadline
applyVenue(ctx, n, V('stadium'), FADE);

check('the live slot is not swapped out from under the stalled release',
  n.active === liveAfterSecond, `active=${n.active}, expected ${liveAfterSecond}`);
check('the third venue is queued instead',
  n.pendingVenue && n.pendingVenue.id === 'stadium',
  `pending=${n.pendingVenue && n.pendingVenue.id}`);
check('only one release is outstanding',
  timers.filter((t) => !t.done && !t.cancelled).length === 1,
  `${timers.filter((t) => !t.done && !t.cancelled).length} outstanding`);

// 4. the main thread catches up. The release frees the slot it was always
//    meant to free, then the queued venue is applied.
runTimers();

check('the queued venue is applied once the release runs',
  n.active === 'A', `active=${n.active}`);
check('the live convolver still holds a response',
  n[`conv${n.active}`].buffer !== null);
check('the live convolver is still connected to the send',
  connected.has(n.active), `connected={${[...connected]}}`);
check('the slot that was left is silent and empty',
  n[n.active === 'A' ? 'convB' : 'convA'].buffer === null
  && !connected.has(n.active === 'A' ? 'B' : 'A'));
check('exactly one room is connected',
  connected.size === 1, `${connected.size} connected: {${[...connected]}}`);

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
