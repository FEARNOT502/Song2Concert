#!/usr/bin/env node
// audio-smoke.mjs — render every venue through the real chain in a real browser.
//
// The build passing proves the modules parse. It does not prove the graph is
// connected, that the worklets load, that the four-channel response is accepted
// by the convolver, or that anything comes out the other end. This does.
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
// The pinned Chromium in this environment lives at a fixed path; let the
// project's playwright version use it rather than downloading its own.
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  // The lifecycle checks below need a context that actually starts, and there is
  // no user gesture in a headless run.
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  // Resource 404s are the dev server's own favicon request, not our problem.
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
});

await page.goto('http://localhost:5199/Song2Concert/scripts/smoke/index.html');
try {
  await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
} catch (e) {
  console.error('timed out; page said:\n' + (await page.content()).slice(0, 2000));
  console.error('errors:\n' + errors.join('\n'));
  await browser.close(); await server.close(); process.exit(1);
}
const out = await page.textContent('#out');
console.log(out);

// ── page lifecycle ──────────────────────────────────────────────────────────
//
// Everything above runs in an OfflineAudioContext, which has no page lifecycle
// at all. These checks need a live AudioContext and a real document, because
// what they are testing is what happens to one when the page is backgrounded —
// which on a phone is every tab switch and every trip out to the file picker.
//
// Three separate faults are covered, all of which were live:
//   · `pagehide` closing the AudioContext. It is not the page going away; it is
//     usually the page being cached to be restored a moment later.
//   · nothing suspending the graph while hidden, so a convolver and six worklets
//     kept running on a CPU that had just been moved to its small cores, with no
//     output device pacing them.
//   · no way back from a context whose output device changed underneath it.
const life = await page.evaluate(async () => {
  const { ConcertEngine } = await import('/Song2Concert/src/audio/engine.js');
  const { VENUES } = await import('/Song2Concert/src/data.js');
  const engine = new ConcertEngine();
  engine.setVenue(VENUES.find((v) => v.id === 'arena'));
  engine.attachPageLifecycle();
  await engine.resume();

  // A silent decoded buffer stands in for a dropped file; what is under test is
  // transport and context state, not the audio.
  engine._decoded = engine.ctx.createBuffer(2, engine.ctx.sampleRate * 10, engine.ctx.sampleRate);
  engine._mode = 'buffer';
  engine.ready = true;
  await engine.play();

  const setVisibility = (v) => {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const r = {};

  setVisibility('hidden');
  await new Promise((res) => setTimeout(res, 300));
  r.suspendsWhenHidden = engine.ctx.state === 'suspended';
  const frozenAt = engine.ctx.currentTime;
  await new Promise((res) => setTimeout(res, 400));
  // The clock stopping with it is why no position bookkeeping is needed.
  r.clockStopsWhileHidden = engine.ctx.currentTime - frozenAt < 0.05;

  setVisibility('visible');
  await new Promise((res) => setTimeout(res, 700));
  r.resumesWhenVisible = engine.ctx.state === 'running';
  r.stillPlayingAfterResume = engine._bufPlaying;

  const c0 = engine.ctx.currentTime;
  const w0 = performance.now();
  await new Promise((res) => setTimeout(res, 400));
  r.clockVsWallClock = +((engine.ctx.currentTime - c0) / ((performance.now() - w0) / 1000)).toFixed(3);

  // A cached page-hide must leave everything standing.
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  await new Promise((res) => setTimeout(res, 200));
  r.survivesCachedPagehide = engine.ctx.state !== 'closed';

  // And the last resort has to actually work: a new context, the old one gone,
  // playback carrying on from the same place through a connected graph.
  const before = engine.currentTime;
  const oldCtx = engine.ctx;
  await engine._rebuildContext();
  r.rebuildMakesNewContext = engine.ctx !== oldCtx;
  r.rebuildClosesOldContext = oldCtx.state === 'closed';
  r.rebuildLeavesItRunning = engine.ctx.state === 'running';
  r.rebuildKeepsPlaying = engine._bufPlaying;
  r.rebuildPositionDrift_s = +Math.abs(engine.currentTime - before).toFixed(2);
  r.rebuildGraphConnected = !!(engine.graph && engine.graph.limiter && engine.graph.wet);
  engine.destroy();
  return r;
});
console.log('\npage lifecycle:\n' + JSON.stringify(life, null, 1));

const lifeFailures = Object.entries(life).filter(([k, v]) => (
  typeof v === 'boolean' ? !v
    : k === 'clockVsWallClock' ? (v < 0.7 || v > 1.3)
      : k === 'rebuildPositionDrift_s' ? v > 0.5 : false
));

await browser.close();
await server.close();

if (lifeFailures.length) {
  console.error('\nlifecycle failures:\n' + lifeFailures.map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  process.exit(1);
}
if (errors.length) { console.error('\npage errors:\n' + errors.join('\n')); process.exit(1); }
if (out.startsWith('ERROR')) process.exit(1);
