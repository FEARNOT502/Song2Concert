# Venue lab — status after round 12

Artifact: https://claude.ai/artifact/GAJY8f6CQP3od9iFZ2c9nk

## Round 12 (done)
- UI: the side panels show only the venue name and the track; no centre chip.
- Floor crowds are full standing figures (atlas cell 5); FOH at the back of the floor in
  the three app venues, the default camera with it.
- Stand pipeline: fronts smoothed along their length (`smooth_front`), exact EDT
  depth, signed; each row traced as the zero level of a continuous field
  (`rows_out`), so rows run as clean lines and curves; `Level(front_sig, max_rows)`;
  `Level.set_depth` re-lays a level from another depth field; aisle half-steps only
  where they are an aisle's (a row's rear half, <= 3.5 m): a gangway left empty is
  flat, not a rectangle bridging the curve (that was the slab in front of Wembley's
  top tier).
- SSA (arena mode): the 300 level as VIP boxes (red seats, partitions, dark front); the
  200s and 400s laid out in blocks with straight rows (`standgen.straight_blocks`):
  each side and end one block, each corner a fan of four wedges about the corner's
  centre with an aisle between, seats laid again along the straight rows wherever
  the plan had seats; the far corners' rows carried up to the concourse (no bare
  concourse wall standing above a shallow corner); a passage at each corner of the
  floor out under the 200s (`standgen.cut_tunnels`, open as far as 10 m in, then
  roofed under the concourse's storey, side walls sloping with the rows).
- SSA follow-up: the 200s' telescopic front rows along the sides (A-H on the map,
  a walkway between them and the fixed stand) put away (`straight_blocks(retract=)`),
  the floor's outer blocks widened to 1.4 m short of the stand; corner fronts as one
  polygon (neighbouring blocks' fronts meet at a vertex); the corners' backs seated
  (`lay_seats`); the 300 and 500 balconies as whole bands per block (`fill=True`),
  their concourses only behind them (`l.extent`), their ends closed by flat cheeks
  (`edge_walls(cheek=True)`). The official map draws each level apart (no overlap);
  the model scales each level on its own, so the 400s overhang the 200s' back by
  ~8 m along the sides, the 300/400 by ~7 m at the ends.
- All venues: each tier's front parapet traced whole along the front line
  (`standgen.front_parapet`) at one height, not piece by piece off the raster; rails
  and walls joined into runs and redrawn without the raster's jogs
  (`smoothRuns` in d3-stands.js); tread sides shaded smooth along a curve (normals
  from the ring's direction over a metre), texture unbroken along it.
- Tokyo Dome: centre-field stage, runway to a symmetric cross stage 47 m out, seats
  in front of it, no B stage, outfield unsold and black; excite seats in front of the
  1st floor; daylight membrane (no lamps), house lights along the stand tops from 1B
  to 3B; continuous dark green fence (`wallStrip`) with the yellow line; the pole
  junction filled with treads; holes in the stands filled.
- Wembley: Level 5 laid out by sections (`section_depth` in wb_gen.py): the bays in
  its front bridged, so rows run straight behind them, the north side (7 m further
  back between two steps) its own section with an aisle wall at each step; the big
  screens (23.88 x 8.15 m, Daktronics 2013) in housings filling the end bays, a glazed
  media box in the south bay; the club tier's rear walkway (Level 5's front stands
  1.6-7 m beyond Level 2's back) open to the bowl, the concourse wall and doors under
  Level 5's front; the four corner tunnels (7 m x 4.5 m) and the players' tunnel on
  the north halfway line (rendered by the shared `buildTunnels`); the press box
  behind the north walkway (desks every other row); vomitories where the plan
  leaves their mouths unseated (Level 1 behind row 28, Level 2 and Level 5 a third
  of the way up); the south bay as the TV gantry (open deck level with Level 5's
  front row, glass balustrade, cameras, commentary desks, canopy); the seats the
  plan's block labels hid filled (gaps of 1.5-5 m no row either side shares). Roof
  steel as built (Kayvani, *Structural Design of the Arch and Roof of Wembley
  Stadium*): north-south underslung rafters every 15.5 m with V legs, the prismatic
  perimeter truss, the north leading-edge box girder on pyramid struts with forestays
  to the arch, backstays to the perimeter truss.

## Round 11 (done)
- Tokyo Dome: the 3B side's B blocks are the 1B side mirrored (the official map traces
  only their labels there); open walkway between the 1st floor's back and the balcony
  (rooms take a `walk` mask); balcony and 2nd-floor seats behind home restored (row
  extraction tolerance in td_gen.py) with the boxes behind home (`suites`); field wall
  up to the stands' front at the poles; the outfield's back wall up to the roof.
- SSA, Wembley regenerated with the straight-line pipeline; aisle half-steps are
  rectangles (standgen `aisles_out`).
- Inspire (lab only) rebuilt from exact section polygons: `pipeline/insp_build.py`
  (replaces insp_seats.py/insp_gen.py). Skybox terraces on the east, red 300s tunnels
  onto a 1.3 m front walkway, ribbon along the 300s' fronts and the boxes' front,
  drapes beside the stage, stage 5 m further out, steel temporary stairs when the
  100s fold away.
- KSPO DOME (lab only): `pipeline/kspo_build.py`, `src/o-kspo.js`; references in
  `refs/kspo` (official chart, Offmate plan, KCISA Sketchfab models). End stage with a
  T thrust, drapes, the 1st floor's telescopic rows (B, D) as the toggle; A's are
  folded under the stage.
- `pipeline/bowlkit.py`: stairs finder shared by the exact-plane bowls.

## Branches
- `claude/elegant-knuth-r81twm`: everything, lab-only venues included.
- `main`: the app and the lab without the Inspire/KSPO sources (the lab builds and
  hides their tabs when their files are absent).

## Next ideas
- KSPO: the 2nd floor's back corridor doors, 1st-floor wheelchair platform details.
- Re-run reach tests after any pipeline change: `node reachtest.mjs <venue> <x,z>`,
  then `python3 reachcheck.py <venue> pipeline/<x>_stands.json <offset z>`.
