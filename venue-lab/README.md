# Venue lab

The single-page prototype published as the Song2Concert venue-lab artifact.
Every venue is built here first, then ported into the app's `src/three`.

Tokyo Dome's current remodel targets the app renderer in `src/three/venues/dome.js`.
Its generated data is shared with this lab, but the lab renderer is an older
prototype. See the [Dome generation and verification notes](../docs/TOKYO_DOME_REMODEL_NOTES.ko.md)
before regenerating or copying renderer files.

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
  `g0` Lotte hall, `n0` Inspire, `o0` KSPO DOME).
- `pipeline/` — the Python that generates the stands (numpy, scipy, opencv,
  scikit-image). Run the generators from inside `pipeline/`, then
  `python3 pipeline/mkdata.py insp` (from `venue-lab/`) rewrites the data file.
  `insp_build.py` (Inspire) and `kspo_build.py` (KSPO DOME) regenerate those two
  from the inputs here; `python3 pipeline/mkdata.py insp kspo`.
  The Tokyo Dome, SSA and Wembley generators also read large intermediate
  files (`*.pkl`, plan images) that are not in the repo.
  SSA (arena mode, end stage 2) starts from the official seat map:
  `ssa_chart.py` reads it into `ssa/ssa_chart.json` (downloads go to `ssa/raw/`,
  not committed: `img-map_arena_end02.svg/.png` and `seat_list.js` from
  https://www.saitama-arena.co.jp/seat_view/). Then, from inside `pipeline/`:
  `python3 ssa_seats.py` (every seat of the official list, `ssa_rules.py`
  decoding it, placed where the map draws it: `ssa/ssa_official.json`),
  `python3 ssa_gen.py` (`ssa_blocks.py` lays the levels out from those seats,
  `ssa_tunnels.py` the floor's south corner tunnels and their funnels on the
  map's drawn outline, `ssa_outline.py` reading that outline into
  `ssa/ssa_corners.json`; writes `ssa_stands.json`), `python3 ssa_labels.py`
  (each seat's block, row and number; blocks named by their doors) and
  `python3 ssa_blockmap.py` (the picker's plan, `src/three/venues/ssa-blocks.js`).
  `python3 pipeline/mkdata.py ssa` (from `venue-lab/`) rewrites
  `src/i0-ssa-data.js` (the app's `ssa-data.js` is the same with `export`).
  `SSA_DOORS_OUT=<file>` also writes the doors' list. (`ssa_north.py`, which
  made the north end the south's mirror, is no longer run: the north end is the
  list's own.)
- `gen.mjs` — ports `src/` to ES modules: `node gen.mjs gen-out`, then copy the
  changed files into `../src/three/` (Inspire and KSPO DOME are lab-only and not ported).

## Checks

Uses Chromium through `playwright-core`; set the browser path in each script
(`executablePath`) to your local Chrome/Chromium.

- `node shot.mjs out/venue-lab.html shots/x inspire 1280 720 "house=1"` — screenshot
  (`cam=x,y,z,tx,ty,tz`, `retract=1`, `house=0..1`).
- `node reachtest.mjs inspire 12,60,0.5 1.0` then
  `python3 reachcheck.py inspire pipeline/insp_stands.json 36` — every seat reachable on foot.
- `node uitest.mjs` — Inspire tab and the 100s retract toggle.
- `node tour.mjs <venue> <outdir> '[{"name":"v","q":"house=1&cam=x,y,z,tx,ty,tz"}]'` — several
  views in one load; `node probe.mjs <venue> <cam> <px,py;…>` — what a pixel shows.
