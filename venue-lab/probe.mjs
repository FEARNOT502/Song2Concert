// probe.mjs — what is at these pixels of a view: the first things a ray from
// the camera through each one hits, with their materials.
//   node probe.mjs <venue> <cam x,y,z,tx,ty,tz> <px,py;px,py…> [w=1280] [h=720]
import { launch, routeCdn, fileUrl } from './browser.mjs';
const [,, venue, cam, pix, W = '1280', H = '720'] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
await routeCdn(page);
await page.goto(fileUrl('out/test.html') + `?${venue}#${venue}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
await page.evaluate(`window.__set({ house: 1, cam: '${cam}', pause: 1, frames: 2 })`);
const out = await page.evaluate(([pix, W, H]) => {
  const A = window.__app, C = A.pipe.camera, root = A.venue.root;
  root.updateMatrixWorld(true);
  return pix.split(';').map((s) => {
    const [px, py] = s.split(',').map(Number);
    const o = C.position.clone();
    const d = o.clone().set(px / W * 2 - 1, -(py / H * 2 - 1), 0.5).unproject(C).sub(o).normalize();
    return { px, py, hits: window.__rayHits(root, o.toArray(), d.toArray(), 400) };
  });
}, [pix, +W, +H]);
console.log(JSON.stringify(out));
await browser.close();
