# Venue lab — status after round 12

Artifact: https://claude.ai/artifact/GAJY8f6CQP3od9iFZ2c9nk

## Round 16: Tokyo Dome's pole corners laid out block by block; the balcony and 2nd floor on past the poles
- **The corner at each foul pole** is no longer a stepped surface traced off a
  raster (round 15's harmonic height field, cut into 0.333 m contours and seated
  along them: terraces, wavy rows, a fence top that jogged). `td_pole.py` lays
  it out as the seating map draws it: the map's 1st floor is a fan of blocks
  ("fingers") with straight rows square to their own axes, so the wedge A01,
  A02 with B02 behind the walkway and A03 with B03 are each that. Rows are
  `td_rowsA.py`'s lines (0.74 m pitch in A, 0.748 in B, counted from the walkway),
  the walkway between A and B a strip of its own, the aisle between two blocks
  the seam where one block's rows end and the next's begin (each block's rows run
  to the middle of the gap the map leaves, seats stop at its outline). The row
  polygons are exact strips (two lines square to the block's axis, cut to its
  outline: `td_pole.rows_out`), the seats laid along the row lines
  (`td_pole.lay_seats`). Both poles are built from the 1B side's map blocks (the
  building is symmetric; the 3B side is its mirror image, on its own cells).
  A02's rows run the whole 10.6 m of its outline (13-26; the map's label says 20).
  Nothing else changes in the 1st floor: A04.. and B04.., the outfield's F
  blocks and the excite seats are the raster levels as before, and the corner
  takes the cells of the old stand nearest its blocks (scraps of the infield's
  treads beside F20 too).
- **Heights.** The infield's stand is 37 m deep and shallow, the outfield's 13 m
  and steep; at the pole the blocks' depth falls from 32 m to 14 in three blocks. So
  each of the three blocks climbs from the fence to the concourse over its own
  depth, its (front, walkway, back) heights fitted (a linear programme: the
  smallest step across every aisle between one block and the next, and to F20,
  with the fronts, where the fence stands, pinned to rise smoothly from the
  lines' to the outfield's): A01 3.90 / 7.42 / 10.60, A02+B02 3.25 / 7.78 / 9.44,
  A03+B03 2.44 / 6.46 / 10.60 (`ANCH` in `td_pole.py`; linear between them, level
  behind the back). Measured on the built rows (heights either side of the
  corner's outline), the steps across the aisles to the neighbouring A, B and F
  stands are 0.54 m on average, 1.04 at the 90th percentile and 1.26 m at most
  (1B side; 3B 0.52 / 1.04 / 1.25). The old corner's were smaller (0.23 m, 0.84
  at most) because its surface was made to meet its neighbours, at the price of
  its terraces and wavy rows; the new one keeps every block's rows straight and
  lets the aisle between two blocks take the difference (no photographs of the
  real corner were to hand to check the heights against; the map has none).
  A rail stands where a step is over 0.6 m. The stair flights the old corner had
  (two 1.2 m aisles either side of A01) are gone: the rows and the aisle seams
  climb to the concourse. The corner has 196 rows, 940 m² of tread and 1389
  seats (661 before), both poles.
- **The balcony (C) runs on past the poles** to the map's last blocks, C01 and
  C97, at 130.4 degrees from the dome's centre (it stopped at the poles, 98.5),
  and **the 2nd floor** on past D04 (89.7-93.7) through D03, D02 and D01 to 112
  (D49, D50, D51 on the 3B side; 3 rows each, the map's blocks taper D05 8, D04
  5, D03 3), and E past E09 through E08, E07 and E06 to 84 degrees (8, 5 and 3
  rows; E44, E45, E46). `td_upper.py` has the blocks' angles. Behind the poles
  the 1st floor's stand is the outfield's, 13.5 m deep with 4 m to the wall
  (25-37 m at the lines), so the balcony's and the 2nd floor's fronts, which
  stand out 9 and 12.3 m from its back, move back over its rear beyond the
  poles (up to 3.2 and 6.5 m: `tau_c`, `tau_d`), or the tiers would hang over
  the fence. How far is read off the edge of `td_gen.py`'s 6 m rule (a tier's
  first row stays 6 m off the field) at each angle: the tables in `td_upper.py`
  stand 0.25-0.5 m clear of it. (A first version eased them in over 10 degrees;
  that left the balcony's first two rows and D03's first two out of the rule and
  D03 almost empty: 11 seats where it now has 26.) D04's rows move with them,
  so its block runs into D03. The balcony's and the 2nd floor's concourses
  follow (`cb`, `c2` in `td_build.py`). Seats: balcony 1455 -> 2039, D 4453 ->
  4684, E 8850 -> 9186 (the 3B side included).
- The map's D and E outlines beyond D04 and E09 are not in `td_labeled.json`
  (its labeller skipped them); their angles and rows are read off the map
  (`td/td_vec.json`) into `td_upper.py`.
- Regenerate: `cd pipeline && python3 td_gen.py && python3 td_build.py` (about 4
  and 4 minutes), then `python3 pipeline/mkdata.py td && node build.mjs`, and to
  the app `node gen.mjs <dir>` and copy `venues/td-data.js` to
  `src/three/venues/` (`dome.js` did not change).
- Checks (whole dome flooded on foot from the infield, `reachtest.mjs dome
  0,104 1.0`, then `reachcheck.py dome pipeline/td_stands.json 114`): A, B, F, K
  and D 100 %, C 2038 of 2039, E 9153 of 9186, G 1753 of 1759; at the start of
  the round C 1454 of 1455, E 8822 of 8850, G 1753 of 1759. The few that are
  missed are of the kinds there were: E rows 1-4 beside a vomitory mouth (33
  now, 28 then), a balcony seat, six excite seats. Local floods
  from a back-row K seat and from a balcony seat past the pole reach every seat
  of A, B, F, K and of C, D, E in the ends of the tiers, on both sides.
  `vomtest.mjs dome`: 13 of 14 vomitories, E25 stuck, as at the start. The app
  builds and draws the Dome without errors (`apptest.mjs`).

## Round 15: the three big rooms checked against the buildings
Sources: the Japan Membrane Structures Association's 2016 lecture on Tokyo Dome
(its sections and roof plan), Nikken Sekkei's project page, ja.wikipedia (Tokyo
Dome, Saitama Super Arena), Wembley's own stats page, Kayvani's *Structural
Design of the Arch and Roof of Wembley Stadium*. The acoustics were left alone.
- Tokyo Dome: the roof as drawn — a superellipse set corner-on to home plate
  (201 m corner to corner, 180.6 m across the diagonals, n ≈ 1.53), centred 33 m
  out from home; the compression ring leaning 1/10 from 44.7 m over the field at
  the home corner to 24.7 m at centre field; the membrane 25 m over the ring's
  plane, crown 60.7 m; the cables along and across the home–centre axis, 8.5 m
  apart. The balcony and the 2nd floor stand out over the 1st floor (their
  fronts 9 m and 12.3 m in from its back: `td_gen.py`'s distances are signed),
  and the heights come from the infield section (the 1st floor up to 10.6 m, the
  balcony 15-16.2 m, the 2nd floor 18.6-35.4 m); the concourses and the outer
  wall end at the building's line, 7 % out from the ring. Hung from the cables:
  the 14 light gondolas (the house lights), 21 loudspeakers round the edge and
  one in the middle with the TV camera. The 2022 main screen (125.6 m, 1,050 m²)
  over the outfield stands and the two ribbon screens along the outfield fence,
  both off; the fence's 0.24 m net. Balcony seats grey (season seats).
- SSA: the ceiling at 30 m (arena mode; 43 m in stadium mode), the movable
  ceiling's panels with the rigging hooks along their seams and downlights in
  them, in place of the exposed trusses at 38 m. The seat count stays 22,500.
- Wembley: the arch's top 133 m over the pitch (it had been 133 m along the
  leaning plane, 117 m high); the cladding's top at 52 m; the south roof's
  leading edge as the bowstring truss (five spans, the central one 140 m long and
  15 m deep, a cable bottom chord, the services gantry), the four primary trusses
  from the south perimeter to the north roof's leading edge with their pyramid
  struts and forestays, the twin catenary cables over the north roof's southern
  edge, and the translucent band (25 m) along it.
- Follow-up: Tokyo Dome's outfield seats blue again; the balcony (and its
  concourse) ends at the foul poles; at the poles the infield's and outfield's
  stands climb on up to the concourse (no wall of it between them); steps from
  the field over its low wall into the 1st floor's front rows (six, round foul
  territory). SSA: blocks part along the bisectors of their fronts (mitred), so
  rows meet across the aisles; each corner faces as the side does, then the
  diagonal, then as the end does (a chamfered octagon), and every seat faces its
  block's front; the floor's corner tunnels open off the diagonal front; the 300
  and 500 balconies keep their angled ends (seat footprint, `straight_blocks`
  fill). All venues: a vomitory's pit runs 0.4 m past its last low row (its
  traced outline had left a solid sliver across Wembley's Level 1 tunnels), and
  a pit whose mouth stands well below the concourse gets steps up inside it.
  `node vomtest.mjs <venue> <data module> <offset z>` walks every vomitory.
- Tokyo Dome against the seating map: the pole stand is gone. Each block is
  the map's again, each its own: A01-A49 in the A stand (A01/A49, the wedges
  at the poles, rows 15-26 in A and 27-40 in B), B up to B02/B48, and the
  outfield (F) a stand of its own beside them. F's rows are counted from the
  fence (distance from the field), so its front row and the fence are level
  along it. Where one stand's tread ran on under another's seats, the cell
  goes to the nearer seats. The corner at each pole (F20/F01, A01/A49,
  A02/B02 and their neighbours near the join) is one stepped surface
  (level `K`): its height laid smoothly between the treads round it, the
  concourse behind and the fronts along the fence, then stepped in 0.333 m
  risers, so the heights run on across the blocks' edges. Its seats are laid
  block by block inside the map's own boxes (`BOXL`/`BOXN`, flood-filled from
  each label in `td_vec.json`), each box pulled in 0.55 m, so the gaps between
  blocks are seatless. The two aisles either side of A01 (A49) are set out
  first as straight lines (the A01|F20 and A01|A02-B02 boundaries), from the
  stand's front up to the concourse. Each is one straight flight 1.2 m wide
  with equal treads and 0.333 m risers, on a solid base, with a handrail each
  side and a landing at its head at the concourse's level. The surface is
  laid to meet it (`flights` with `open`). Near the poles B's rows are counted
  from the walkway behind row 26 (on the 1B side its outline had run 2.5 m
  astray, B02 having had no seats traced); the bare B02/B48 boxes are seated.
  No rail stands along an edge facing the field or the excite seats (the
  fence is the barrier there). The dome's rails are grey concrete. The excite seats are
  the map's own G05-G15/G35-G45 boxes, flood-filled from `td_vec.json`, their
  rows running
  back to the A blocks' front (level past the sixth). The excite strip runs
  on from G05's corner to the A02/A03 line; the floor behind it (G03/G04) is open.
  The green fence (`fence` in the data, its outline smoothed) runs behind the
  excite seats along the A blocks' front: one height round the outfield, and
  from home out to each pole only rising with the stands' fronts, never below
  one; a low (1.0 m) padded fence in front of the excite seats. The yellow line is
  paint, not lit. The floor blocks run on behind home plate. B
  behind home is re-laid in straight rows (`standgen.relay_columns`). The
  wells through the 1st floor (under the 2nd floor's overhang) are treads now.
  Lightsticks in the stands are held at sitting height.

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
- Round 14: SSA's 200s laid out whole block by block (`straight_blocks(full_corners=)`):
  sides and ends to their plan depth, each corner a fan of four wedges from a smooth
  arc of fronts to one continuous back line; the floor's four corner tunnels as at
  Wembley (7 x 4.4 m, an open cut with the same straight-raked wall either side to a
  portal the rows run on over, `cut_tunnels(trapezoid=True)`); the 400s and 500s 2.5 m
  lower; the suites (3rd floor, glass fronts, two-row balconies, the VIP room in the
  middle) along the left side behind the 200s (level `300S`); balcony ends closed down
  to what stands under them. Tokyo Dome: the 72 entrances from the official seating
  map (`td/entrances.json`, the numbered circles of dome_seating-map.pdf): 58 doors
  onto the 1st-floor concourse, 14 vomitories through E. Renderer: rails along raked
  edges drawn as sloping runs (`slopedRuns`), the building's outer wall smoothed
  (`smoothRing`).
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
