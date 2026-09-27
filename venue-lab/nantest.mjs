// nantest.mjs — sweep the view round a venue and count the pixels of the HDR
// scene render that are Inf or NaN (what the bloom turns into black blocks).
//   node nantest.mjs <venue> [x,y,z;x,y,z…] [q=high]
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, spots = '', quality = 'high'] = process.argv;
process.env.ALL &&= '1';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}&q=${quality}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
const res = await page.evaluate(async ([spots, ALL]) => { const process = { env: { ALL } }; {
  const A = window.__app; A.paused = true;
  const P = A.pipe, R = P.renderer, rt = P.venuePass.sceneRT;
  const buf = new Uint16Array(rt.width * rt.height * 4);
  const pts = spots ? spots.split(';').map((s) => s.split(',').map(Number)) : [[A.walker.feet.x, A.walker.feet.y + 1.6, A.walker.feet.z]];
  const out = [];
  let t = 30;
  for (const [x, y, z] of pts) {
    for (let k = 0; k < 12; k++) for (const pitch of [-0.4, 0.1, 0.6]) {
      const a = (k / 12) * Math.PI * 2;
      const v0 = P.camera.position.clone(); A.debugCam = { pos: v0.clone().set(x, y, z), tgt: v0.clone().set(x + Math.sin(a), y + pitch, z - Math.cos(a)) };
      A.beat.clock = t; t += 0.37;
      A.frame(0.016, t);
      R.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
      let bad = 0, vbad = 0;
      for (let i = 0; i < buf.length; i += 4) {
        if ((buf[i] & 0x7c00) === 0x7c00 || (buf[i + 1] & 0x7c00) === 0x7c00 || (buf[i + 2] & 0x7c00) === 0x7c00) bad++;
      }
      const vrt = P.venuePass.volRT, vb = new Uint16Array(vrt.width * vrt.height * 4);
      R.readRenderTargetPixels(vrt, 0, 0, vrt.width, vrt.height, vb);
      for (let i = 0; i < vb.length; i += 4) if ((vb[i] & 0x7c00) === 0x7c00 || (vb[i + 1] & 0x7c00) === 0x7c00 || (vb[i + 2] & 0x7c00) === 0x7c00) vbad++;
      let nz = 0, mx = 0; for (let i = 0; i < buf.length; i += 4) { const e = (buf[i + 1] >> 10) & 31; if (buf[i + 1]) nz++; if (e > mx && e < 31) mx = e; }
      if (bad || vbad || process.env.ALL) out.push({ at: [x, y, z], yaw: +(a / Math.PI * 180).toFixed(0), pitch, bad, vbad, nz, maxExp: mx });
    }
  }
  return out;
}}, [spots, process.env.ALL || ""]);
console.log(venue, 'views with Inf/NaN:', res.length, JSON.stringify(res.slice(0, 12)));
await browser.close();
