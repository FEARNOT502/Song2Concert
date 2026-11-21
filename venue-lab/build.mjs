import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const here = (file) => fileURLToPath(new URL(file, import.meta.url));

const [bundle] = await build({
  configFile: false,
  // the app's models are fetched from ./assets/, next to the page
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.env.BASE_URL': JSON.stringify('./') },
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
// the app's models and baked light (public/assets/*.glb, *.gi)
const assets = [];
for (const [dir, test] of [[here('../public/assets/'), /\.(glb|gi)$/]]) {
  let names = [];
  try { names = await readdir(dir); } catch { /* none */ }
  for (const n of names.filter((x) => test.test(x))) {
    await copyFile(path.join(dir, n), here(`out/assets/${n}`));
    // (an artifact host serves no binaries: a base64 twin the Lab decodes)
    await writeFile(here(`out/assets/${n}.b64.txt`), (await readFile(path.join(dir, n))).toString('base64'));
    assets.push(n);
  }
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
