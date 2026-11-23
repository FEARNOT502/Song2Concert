import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const here = (file) => fileURLToPath(new URL(file, import.meta.url));

const bundlePage = async (entry, name) => {
  const [bundle] = await build({
    configFile: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.env.BASE_URL': JSON.stringify('./') },
    build: {
      write: false,
      lib: { entry: here(entry), name, formats: ['iife'] },
    },
  });
  const [file] = bundle.output;
  if (bundle.output.length !== 1 || file?.type !== 'chunk') throw Error('Venue Dev Lab requires one self-contained script');
  return file.code.replace(/<\/script/gi, '<\\/script');
};
const appCode = await bundlePage('src/z-app.js', 'Song2ConcertVenueLab');
const domeSeatCode = await bundlePage('src/dome-seat-inspection.js', 'TokyoDomeSeatInspection');

const tpl = await readFile(here('template.html'), 'utf8');
const out = tpl.replace('/*SCRIPT*/', () => appCode);
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
  writeFile(here('out/dome-seats.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>도쿄돔 좌석 · Venue Lab</title>
<style>
body { margin: 0; background: #11171d; color: white; font: 14px system-ui; overflow: hidden; }
canvas { display: block; }
nav, [role=status] { position: fixed; top: 12px; left: 12px; padding: 10px; border-radius: 8px; background: #11171ded; }
nav a { display: inline-block; color: #fff; padding: 6px 8px; }
</style>
</head>
<body>
<nav aria-label="도쿄돔 좌석 보기"><a href="#dome">전경</a><a href="#general">일반석</a><a href="#terrace">스카이테라스</a><a href="#balcony">발코니석</a></nav>
<p role="status">도쿄돔을 불러오는 중입니다.</p>
<script>${domeSeatCode}</script>
</body>
</html>
`),
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
