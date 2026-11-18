import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = (file) => fileURLToPath(new URL(file, import.meta.url));
const [bundle] = await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    write: false,
    lib: { entry: here('src/z-app.js'), name: 'Song2ConcertVenueLab', formats: ['iife'] },
  },
});
const [file] = bundle.output;
if (bundle.output.length !== 1 || file?.type !== 'chunk') throw Error('Venue Dev Lab requires one self-contained script');

const tpl = await readFile(here('template.html'), 'utf8');
const out = tpl.replace('/*SCRIPT*/', () => file.code.replace(/<\/script/gi, '<\\/script'));
await mkdir(here('out/'), { recursive: true });
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
