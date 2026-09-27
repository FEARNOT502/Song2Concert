import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, cam] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
await page.evaluate(`window.__set({house:1, cam:'${cam}', pause:1, frames:3})`);
const r = await page.evaluate(() => {
  const A = window.__app, P = A.pipe, R = P.renderer, rt = P.venuePass.sceneRT;
  const b = new Uint16Array(rt.width * rt.height * 4); R.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, b);
  let nan = 0, zero = 0, mid = 0; for (let i = 0; i < b.length; i += 4) { if ((b[i] & 0x7c00) === 0x7c00) nan++; else if (b[i] === 0 && b[i + 1] === 0) zero++; }
  const c = rt.width * (rt.height * 0.92 | 0) * 4 + (rt.width * 0.5 | 0) * 4;
  return { nan, zero, total: b.length / 4, centre: [b[c], b[c + 1], b[c + 2]] };
});
console.log(JSON.stringify(r));
await browser.close();
