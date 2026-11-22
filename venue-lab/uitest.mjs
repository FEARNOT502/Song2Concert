import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 680, height: 460 } });
  const url = 'http://127.0.0.1:4177/venue-lab.html';
  const html = fileURLToPath(new URL('out/test.html', import.meta.url));
  await page.route('**/*', (route) => route.request().isNavigationRequest()
    ? route.fulfill({ path: html, contentType: 'text/html' })
    : route.abort());
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
  await page.goto(url + '?q=low#inspire');
  await page.waitForFunction(() => window.__ready === true || document.querySelector('#loading-name')?.textContent.startsWith('오류'), null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => window.__ready), true, await page.locator('#loading-name').textContent());
  const venues = ['club', 'theater', 'concerthall', 'gymnastic-arena', 'arena', 'dome', 'stadium'];
  assert.deepEqual(await page.locator('#tabs button').evaluateAll((tabs) => tabs.map((tab) => tab.dataset.id)), venues);
  assert.equal(await page.locator('#retract-row').count(), 0);
  assert.equal(await page.evaluate(() => window.__info().venue), 'club');
  await page.evaluate(() => { window.__app.paused = true; });

  async function check(id, mode) {
    await page.waitForFunction(({ id, mode }) => {
      const app = window.__app;
      const stats = app.stage.stats();
      return !app.building && stats.venue === id && stats.mode === mode && app.walker.root?.children.length > 0;
    }, { id, mode }, { timeout: 120000 });
    assert.equal(await page.locator('#loading').isVisible(), false);
    assert.equal(await page.locator(`#tab-${id}`).getAttribute('aria-current'), 'true');
    console.log(id, mode);
  }

  await check('club', 'general');
  for (const id of venues.slice(1)) {
    await page.locator(`#tab-${id}`).click();
    await check(id, 'general');
    const alternate = id === 'theater' ? 'op' : id === 'concerthall' ? null : '360';
    if (alternate) {
      await page.locator(`#seg-layout [data-v="${alternate}"]`).click();
      await check(id, alternate);
    }
    if (id === 'arena') {
      assert(await page.evaluate(() => {
        const root = window.__app.walker.root;
        return root.getObjectByName('Movable arena ceiling')?.userData.panelCount === 42
          && !!root.getObjectByName('3F lounge panoramic glazing');
      }));
    }
  }
  await page.locator('#lights-house').click();
  assert.equal(await page.locator('#lights-house').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
