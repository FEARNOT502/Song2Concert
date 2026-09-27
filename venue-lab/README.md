# Venue lab

The single-page prototype published as the Song2Concert venue-lab artifact.
Every venue is built here first, then ported into the app's `src/three`.

## Build and view

```sh
cd venue-lab
npm install
node build.mjs          # src/*.js + template.html -> out/venue-lab.html, out/test.html
```

Open `out/test.html` in a browser (it loads three.js from jsDelivr), e.g.
`out/test.html?inspire#inspire`. `out/venue-lab.html` is the artifact body
(the artifact host wraps it in a document).

## Files

- `src/` — the prototype, concatenated in file-name order by `build.mjs`.
  `*-data.js` are the generated stands (`i0` SSA, `j0` Tokyo Dome, `k0` Wembley,
  `g0` Lotte hall, `n0` Inspire).
- `pipeline/` — the Python that generates the stands (numpy, scipy, opencv,
  scikit-image). Run the generators from inside `pipeline/`, then
  `python3 pipeline/mkdata.py insp` (from `venue-lab/`) rewrites the data file.
  `insp_seats.py` → `insp_gen.py` regenerate Inspire from the inputs here.
  The Tokyo Dome, SSA and Wembley generators also read large intermediate
  files (`*.pkl`, plan images) that are not in the repo.
- `gen.mjs` — ports `src/` to ES modules: `node gen.mjs gen-out`, then copy the
  changed files into `../src/three/` (Inspire is lab-only and not ported).

## Checks

Uses Chromium through `playwright-core`; set the browser path in each script
(`executablePath`) to your local Chrome/Chromium.

- `node shot.mjs out/venue-lab.html shots/x inspire 1280 720 "house=1"` — screenshot
  (`cam=x,y,z,tx,ty,tz`, `retract=1`, `house=0..1`).
- `node reachtest.mjs inspire 12,60,0.5 1.0` then
  `python3 reachcheck.py inspire pipeline/insp_stands.json 36` — every seat reachable on foot.
- `node uitest.mjs` — Inspire tab and the 100s retract toggle.
