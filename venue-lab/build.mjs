import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const here = (file) => fileURLToPath(new URL(file, import.meta.url));

// The Lab draws with its own render pipeline (src/rx): the app's
// src/three/render.js is swapped for it in this build only, so the app itself
// is untouched. RX=0 builds the Lab with the app's pipeline as it is.
const APP_RENDER = path.resolve(here('../src/three/render.js'));
const RX_DIR = path.resolve(here('src/rx'));
const RX_ENTRY = path.join(RX_DIR, 'index.js');
const swapRenderer = {
  name: 'venue-lab-rx',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (process.env.RX === '0' || !importer || path.resolve(importer).startsWith(RX_DIR)) return null;
    if (!/render\.js$/.test(source)) return null;
    const r = await this.resolve(source, importer, { ...options, skipSelf: true });
    return r && path.resolve(r.id) === APP_RENDER ? RX_ENTRY : null;
  },
};

const [bundle] = await build({
  configFile: false,
  // the app's models are fetched from ./assets/, next to the page
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.env.BASE_URL': JSON.stringify('./') },
  plugins: [swapRenderer],
  build: {
    write: false,
    lib: { entry: here('src/z-app.js'), name: 'Song2ConcertVenueLab', formats: ['iife'] },
  },
});
const [file] = bundle.output;
if (bundle.output.length !== 1 || file?.type !== 'chunk') throw Error('Venue Dev Lab requires one self-contained script');

const tpl = await readFile(here('template.html'), 'utf8');
const out = tpl.replace('/*SCRIPT*/', () => file.code.replace(/<\/script/gi, '<\\/script'));
await mkdir(here('out/assets/'), { recursive: true });
// the app's models (public/assets/*.glb) and the Lab's baked light (assets/*.gi)
const assets = [];
for (const [dir, test] of [[here('../public/assets/'), /\.glb$/], [here('assets/'), /\.gi$/]]) {
  let names = [];
  try { names = await readdir(dir); } catch { /* none */ }
  for (const n of names.filter((x) => test.test(x))) { await copyFile(path.join(dir, n), here(`out/assets/${n}`)); assets.push(n); }
}
await Promise.all([
  writeFile(here('out/venue-lab.html'), out),
  writeFile(here('out/test.html'), `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${out}
</body>
</html>
`),
]);
console.log('assets:', assets.join(', '));
