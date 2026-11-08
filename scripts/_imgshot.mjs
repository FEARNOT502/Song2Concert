// Open an image URL in a headless browser and screenshot a region of it.
//   node imgshot.mjs <url> <out.png> [x y w h] [zoom]
// x y w h in the image's own pixels; zoom scales the capture (default 1).
import { chromium } from 'playwright';
const [url, out, x = '0', y = '0', w = '0', h = '0', zoom = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: Number(zoom) });
await page.setContent(`<html><body style="margin:0;background:#fff"><img id="i" src="${url}" style="display:block"></body></html>`);
await page.waitForFunction(() => document.getElementById('i').complete && document.getElementById('i').naturalWidth > 0, null, { timeout: 60000 });
const [nw, nh] = await page.evaluate(() => [document.getElementById('i').naturalWidth, document.getElementById('i').naturalHeight]);
await page.setViewportSize({ width: nw, height: nh });
const clip = Number(w) > 0 ? { x: Number(x), y: Number(y), width: Number(w), height: Number(h) } : { x: 0, y: 0, width: nw, height: nh };
await page.screenshot({ path: out, clip });
console.log('image', nw, nh, 'clip', JSON.stringify(clip));
await browser.close();
