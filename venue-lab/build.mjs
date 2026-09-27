import fs from 'node:fs';
const files = fs.readdirSync('src').filter((f) => f.endsWith('.js')).sort();
const js = files.map((f) => `// ==== ${f} ====\n` + fs.readFileSync('src/' + f, 'utf8')).join('\n');
fs.mkdirSync('out', { recursive: true });
const tpl = fs.readFileSync('template.html', 'utf8');
const out = tpl.replace('/*SCRIPT*/', () => js);
fs.writeFileSync('out/venue-lab.html', out);
// a full document for local testing (the artifact host wraps the page itself)
fs.writeFileSync('out/test.html', `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${out}</body></html>`);
console.log('built', files.join(' '), (out.length / 1024).toFixed(0) + 'KB');
