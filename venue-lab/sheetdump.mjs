// sheetdump.mjs — save the dome's door-sign sheet (data.signs) as a PNG, to look at the plates themselves
//   node sheetdump.mjs <venue> <out.png>
import fs from 'node:fs';
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue = 'dome', out = 'signs.png'] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
const url = await page.evaluate(() => {
  let found = null;
  window.__app.venue.root.traverse((o) => {
    const im = o.material && !Array.isArray(o.material) && o.material.map && o.material.map.image;
    if (im && im.width === 2048 && im.getContext && !found) found = im.toDataURL('image/png');
  });
  return found;
});
if (!url) { console.log('no sign sheet found'); process.exit(1); }
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); console.log('saved', out);
await browser.close();
