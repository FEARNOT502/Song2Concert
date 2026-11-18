# Venue Lab

The standalone Venue Lab uses the same stage renderer, venue builders, and
models as Song2Concert. It shows Club, Theater, Concert Hall, Arena, Dome, and
Stadium. Arena, Dome, and Stadium offer general and 360 layouts. Theater also
offers its orchestra-pit layout.

## Build and view

Run from the repository root:

```sh
npm ci
node venue-lab/build.mjs
```

Open `venue-lab/out/test.html` directly in a WebGL-capable browser. For example,
`test.html?q=low&layout=360#arena` opens Arena with the center-stage layout.
`out/venue-lab.html` is the HTML fragment for an artifact host. Both outputs
bundle the renderer and geometry with the page.

## Files

- `template.html` defines the Lab controls. `src/z-app.js` connects them to
  `../src/three/stage.js`. The venue list comes from the app's builder registry.
- `src/` also holds archived prototype renderers used by the data tooling.
- `pipeline/` — the Python that generates the stands (numpy, scipy, opencv,
  scikit-image). Run the generators from inside `pipeline/`.
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
  the archived `src/i0-ssa-data.js`. The Lab renders the app's
  `../src/three/venues/ssa-data.js`.
  `SSA_DOORS_OUT=<file>` also writes the doors' list. (`ssa_north.py`, which
  made the north end the south's mirror, is no longer run: the north end is the
  list's own.)
- `gen.mjs` is the archived prototype-to-module converter.

## Checks

Run from `venue-lab/` after building. Set `CHROME` to the path to Chromium.

- `node uitest.mjs` opens the standalone HTML offline and verifies all six
  venues and their optional layouts.
- `node shot.mjs out/venue-lab.html shots/x arena 1280 720 "house=1&layout=360"`
  captures a screenshot. Use `cam=x,y,z,tx,ty,tz` to set the view.
- `node tour.mjs <venue> <outdir> '[{"name":"v","q":"house=1&cam=x,y,z,tx,ty,tz"}]'`
  captures several views in one load.
