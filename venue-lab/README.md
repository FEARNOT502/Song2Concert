# Venue Dev Lab

The standalone Venue Dev Lab uses the same stage renderer, venue builders, and
models as Song2Concert. It shows Club, Theater, Concert Hall, Arena, Dome, and
Stadium. Arena, Dome, and Stadium offer general and 360 layouts. Theater also
offers its orchestra-pit layout.

## Build and view

Run from the repository root:

```sh
npm ci
node venue-lab/build.mjs
```

Open `venue-lab/out/test.html` over http (for example `npx serve venue-lab/out`):
the app's models are fetched from `out/assets/`, which a `file://` page cannot do. For example,
`test.html?q=low&layout=360#arena` opens Arena with the center-stage layout.
`out/venue-lab.html` is the HTML fragment for an artifact host. Both outputs
bundle the renderer and geometry with the page.

## The Lab's render pipeline (`src/rx`)

The Lab draws with its own pipeline. `build.mjs` swaps the app's
`src/three/render.js` for `src/rx/index.js` in the Lab's bundle only; the app
itself is unchanged. `RX=0 node venue-lab/build.mjs` builds the Lab with the
app's pipeline, and the Lab's **Next / Base** switch (or `?rx=0`) turns it off
at runtime. `?rxoff=gi,ao,ssr,fog,taa,probe,shadows,agx` turns parts off.

- **Baked GI** (`gi.js`, `bake-gi.mjs`): the room's indirect light, ray traced
  per light group (lights that always move together, and each LED wall) into a
  probe volume of first-order spherical harmonics. Each frame the groups are
  summed on the GPU, weighted by what their lights are doing, and every
  material reads the result in place of the environment's diffuse light and
  the room's stand-in fills (hemisphere, proscenium and ceiling area lights,
  the LED walls' area lights), which go out while it is in.
  Bake after the room changes: `node build.mjs && node bake-gi.mjs theater general`
  (and `theater op`), from `venue-lab/`; it writes `assets/<venue>-<mode>.gi`.
- **Screen space** (`passes.js`): the scene target has a second output (view
  normal, roughness, reflectance; `materials.js`). GTAO and SSR run at half
  size; the materials read last frame's AO and reflection coverage back, so AO
  darkens only indirect light and the environment's reflection steps aside
  where SSR found the real one. The environment is a box-projected probe of the
  room itself (`probe.js`), recaptured a face per frame.
- **Haze**: a froxel volume lit by every spot (through its shadow map), point
  and LED wall, with the GI as ambient, reprojected over frames; the app's
  analytic beams stay on top.
- **TAA** with variance clipping, softer and steadier shadows (eight taps
  turning every frame, 4096 maps on the key lights), a satin stage floor.
- **Output**: AgX for SDR; HDR through a WebGPU canvas in extended range
  (`hdr.js`, the Lab's **SDR / HDR** switch; needs an HDR display).

`node rxshot.mjs <venue> <outdir> '<views json>'` serves `out/` over http and
captures views; `settle=N` in a view draws the same moment N times so the
temporal passes converge. `python3 compare.py` makes side-by-side sheets.

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

The Lab with the rx pipeline is published at https://claude.ai/artifact/AGiqnC45AzUQrr7Bkwsudu (models and baked light beside the page as base64 text: an artifact host serves no binaries).
