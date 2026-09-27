# Round 11 — work in progress (handoff)

Branch `wip/venue-lab-round11`. Artifact: https://claude.ai/artifact/GAJY8f6CQP3od9iFZ2c9nk

## Done
- Black flickering blocks: zero-area triangles (collinear decimetre-rounded points) → zero normals → NaN → bloom. Fixed by `dropDegenerateTriangles` (a-core, called in z-app and src/three/stage.js) + NaN/Inf/negative clamp in the composite shader (b-render).
- Pipeline: `STRAIGHT` mode in standlib (no blur/chain smoothing, DP 0.12 m); edge_walls judged in 0.5 m pieces then merged (`merge_runs`); `Level.make_voms` builds rectangular vomitories (pit + roofed tunnel), `trim_tunnels`, rooms accept `open` masks.
- Renderer: `vomParts` in d3-stands (walls inside the pit, parapet, tunnel, lit ceiling, section sign); `topAt` returned by buildStands; `maskingDrapes` in h-show (used in i-arena).
- TD: upper tiers/outer wall from the 1F convex hull; E tunnels labelled by block; backstop net removed. SSA/WB inputs recovered (ssa_prep.py, wb_prep.py) and regenerated with the new pipeline (WB gen may need a rerun).

## To do
- TD: the 3B side still shows something sticking out — real TD has nothing there, same as 1B (user, 2026-09-27). Re-check against pipeline/td/td_labeled.json and make it symmetric. The gap between the 1F back and the balcony shows the 1F concourse roof: make it an open walkway (room `open`). Pole junction still awkward.
- Run `python pipeline/mkdata.py ssa wb td`, render-check vomitories and drapes, tune SSA vom width (wmax=3.0 set, not yet rerun).
- Inspire: rebuild from scratch as an exact angular plan. References in refs/insp (chart_boundee = 2F 201-220, 3F 308-320, skyboxes on the 201-205 side; offmate_seats.json rows/seat counts; froma_5 official interior; tw/ seat views). Keep T-stage + 100s toggle; drapes beside stage.
- KSPO DOME: new venue, lab only, end stage + T runway, drapes.
- Re-check all venues vs reality; port non-lab changes via gen.mjs; commit/push to branch + main (Inspire/KSPO lab-only are allowed on this WIP branch per user); republish the artifact.
