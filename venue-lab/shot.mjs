// shot.mjs — render the prototype headless and screenshot each venue.
// usage: node shot.mjs <html> <outprefix> [venues=club,...] [w=1280] [h=720] [extra query]
//   extra: house=0..1, cam=x,y,z,tx,ty,tz, retract=1, walk=…; EVAL=<js> logs its value
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, html, outPrefix, venuesArg = 'club,theater,concerthall,arena,dome,stadium', W = '1280', H = '720', extra = ''] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall') && m.type() !== 'warning') console.log('[console]', m.type(), t.slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')));
await routeCdn(page);
const url = fileUrl(html);
for (const v of venuesArg.split(',')) {
  const t0 = Date.now();
  await page.goto('about:blank');
  await page.goto(`${url}?${v}#${v}`);
  try {
    await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
  } catch (e) { console.log('timeout waiting ready for', v); }
  const opts = Object.fromEntries(new URLSearchParams(extra));
  const info = await page.evaluate(`window.__set(${JSON.stringify({ t: 33, frames: 3, pause: 1, ...opts })})`).catch((e) => String(e));
  if (process.env.EVAL) console.log('EVAL', JSON.stringify(await page.evaluate(process.env.EVAL).catch((e) => String(e))));
  await page.screenshot({ path: `${outPrefix}-${v}.png`, timeout: 240000 });
  console.log(v, 'ms', Date.now() - t0, JSON.stringify(info));
}
await browser.close();
