// Screenshot a web page (full page) and list its images, in a headless browser.
//   node pageshot.mjs <url> <out.png>
import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);
const imgs = await page.evaluate(() => [...document.images].filter((i) => i.naturalWidth > 300).map((i) => `${i.naturalWidth}x${i.naturalHeight} ${i.currentSrc || i.src}`));
console.log(imgs.join('\n'));
console.log('TEXT', (await page.evaluate(() => document.body.innerText)).slice(0, 2500));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
