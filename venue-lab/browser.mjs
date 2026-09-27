// The headless Chromium the checks run in, and the CDN routes that serve
// three.js from node_modules so a page loads offline.
//   CHROME=<path> overrides the browser; SWIFTSHADER=1 forces software GL.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const pw = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : path.join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (fs.existsSync(pw)) {
    const dirs = fs.readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(pw, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return '/opt/pw-browsers/chromium';
}

export function launch(extra = []) {
  const soft = process.env.SWIFTSHADER || process.platform !== 'win32';
  const gl = soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11'];
  return chromium.launch({ executablePath: chromePath(), args: [...gl, '--ignore-gpu-blocklist', '--enable-webgl', ...extra] });
}

export async function routeCdn(page) {
  for (const [pkg, ver] of [['three', '0.185.1'], ['three-mesh-bvh', '0.9.15']]) {
    await page.route(`https://cdn.jsdelivr.net/npm/${pkg}@${ver}/**`, (route) => {
      const file = path.join(path.resolve('node_modules/' + pkg), route.request().url().split(`${pkg}@${ver}/`)[1]);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
      route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(file) });
    });
  }
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

export const fileUrl = (p) => pathToFileURL(path.resolve(p)).href;
