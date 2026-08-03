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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
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
await browser.close();
await server.close();

if (errors.length) { console.error('\npage errors:\n' + errors.join('\n')); process.exit(1); }
if (out.startsWith('ERROR')) process.exit(1);
