# Venue lab — status after round 12

Artifact: https://claude.ai/artifact/GAJY8f6CQP3od9iFZ2c9nk

## Round 18: Tokyo Dome's gates, the pillars, the junction of the infield and the outfield stands
- **B24** was only half drawn (its two outlines in `td_labeled.json` overlap and leave out the wide part of its L behind
  home): `chart_blocks` takes it from the map's flood-filled box (`BOXL`, the ink's inside; 0.16 m back out).
- **Gates** (`td_stand1.gate_sites`, `carve_gates`). The map widens the aisle between two B blocks every third aisle
  (B11|12, 14|15, 17|18, 20|21 on each side of the field, and B23|24 / B26|27 behind home: 10 gates in all, the entrances
  12 15 18 21 24 | 25 28 31 34 37) from 1.6 m to 3.4 m wide (4.5 behind home) for 8-9 rows behind the walkway. Photographs
  of the real dome show a gate at each, so the widening is a **pit** open to the walkway (the rows there stand too low to
  walk under), then a **tunnel** 1.8 m wide under the rows (their own slab its roof, 0.25 m, the floor a stair a tread to a
  row that climbs as the rows do, 2.1 m of headroom), and where the rows leave too little height over the floor an **open
  stair cut** up through the back of the stand to the door in the concourse's wall (the aisle's). The tunnels come out
  short (1-3 m): the B rows next to the walkway rise 0.19-0.20 m a row (the fitted section, below), so it takes 12-14 rows
  of pit before a floor that climbs a tread a row has 2.1 m under the next slab, and the rest of the way is the open cut. Behind home the stand is
  too shallow for that and the stair runs on out through the wall into the concourse (up to 4.5 m, as long as no column is
  in the way). Rails 1 m high along the pit's and the cut's sides; lamps in the tunnels (`data.gateLamps`). The pit's cells
  are cut out of the B level's rows (`rows_out(..., sites=)`), the stair's out of the concourse floor (the `floors` entry
  and the walkable `encl['lit']` sheet both: a floor sheet left over the stair stopped the walker at the wall); 85 seats
  over them go. The door of the aisle stands on the gate's axis (the gate defines it). Checked on foot (`x-walk.js`'s
  walker, started in the pit of each gate and sent along the gate's own waypoints): all 10 stairs climb to the concourse
  (y 10.61); on 5 of them the last waypoint, on the straight line to the door, is 0.4-0.5 m short because a column stands
  on that line.
- **Pillars instead of door plates.** The map's 58 numbered circles on the 1st floor are columns (the reference photographs
  show a column at the head of each aisle with its number on it; the aisle's end is an open entrance): `data.pillars`, one
  round pillar of 0.55 m radius at each circle (moved at most 1.15 m out where it stood closer than 0.8 m to the wall in
  front of the door), 4 m high under the concourse's ceiling and 5.4 m where it is open to the dome, the number on a plate
  bent round it on each side (`signSheet` with `r`; the plates on the wall and the outfield's door leaves are gone).
- **The junction of the infield and the outfield stands, and every aisle between blocks.** The rows are now the same
  continuous curve across every aisle: `warp_rows` bends each finger's rows (a parabola in its lateral coordinate) so that
  the row coordinate and its direction run on across every seam, and into the outfield's rows (level with the fence),
  instead of the map's straight rows with a kink of 4-7 degrees at each aisle (position mismatch 0.28 -> 0.05 m, direction
  0.6 degrees rms). The wedge at each pole (A01, A49) counted its rows from a walkway line 5 rows off its neighbour's: moved
  (`build`). No rail where two blocks of the 1st floor meet within 0.9 m (they were tan panels 1 m high standing on every
  step of 0.6-0.75 m: the "odd polygons" at the junction).
- **Heights: one smooth section along every finger, and the steps between blocks shared out evenly.** A knot every 1.5 m
  along each finger (`Finger`, `KNOT`), fitted (`fit_profiles`) for the smallest step across every aisle and into the
  outfield's rows, with
  * **no change of slope along a finger**: the building's section is now one curve through the front row, the walkway
    (5.4 m) and the back (10.6 m), a quadratic whose rake grows evenly (0.17 -> 0.37 m/m), not two straight pieces
    (A 0.23 m/m, B 0.32) with a kink at the walkway (`Finger._lines`); and the fit keeps the rake smooth (`w_smooth` 100: it
    changes by 0.04 m/m at the most between two 1.5 m segments of any finger, 0.36 before, 0.01 on the average; the A and B
    parts' rakes at the walkway now differ by 0.03 on the average, 0.10 at the most);
  * **the change from the outfield's steep rows to the infield's section shared out** over the twelve aisles nearest each
    pole (`fit_profiles_balanced`: the weight of each seam raised in proportion to its step, ten times over, until all
    twelve have the same mean, 0.16-0.18 m; it was 0.46, 0.38, 0.24 ... 0.04 along them, concentrated at the pole's few short
    ones): mean step across all aisles 0.10 m, 0.40 m at the most (between fingers); into the outfield's rows 0.11 m, 0.50
    at the most (`w_F` 10);
  * the price: the walkway stands 6.2-6.4 m up along fingers 12-24 (5.4 m in the building's section; the A rows' rake
    0.27 m/m, the B rows' the same), 8-9 m at the poles, the first rows of fingers 1-4 4.6-3.0 m (the outfield fence's
    4.6 m, then down to the section's 0.9 m by finger 8); the backs held at the concourse's height.
- **Fence** colour darker (`0x0b2a1a`, `j-dome.js`).
- Checked: walk-flood A, B, F, C, D, E, G 100 % (`reachtest.mjs dome 0,104 1.0`, `reachcheck.py`); 14/14 vomitories
  (`vomtest.mjs`); the walker climbs all 10 gates' stairs to the concourse; renders of the poles' aisles, the gates, the
  pillars, the fence and the stand's slope from the front row and from the back.
- Outfield: the map has no gate-pattern blocks there (the outfield's F blocks have only the pillar notches at circles
  52-58).
- Regenerate: `cd pipeline && python3 td_build.py` (5 minutes), `python3 pipeline/mkdata.py td && node build.mjs`, and to the
  app `node gen.mjs <dir>`, copying `stands.js`, `venues/td-data.js` and `venues/dome.js` to `src/three/`.

## Round 17: Tokyo Dome's whole 1st floor block by block; the entrances where the map puts them; the upper decks' aisles
- **Every A, B and F block of the 1st floor is laid out as the map draws it**, not
  only the poles' (round 16's corner method for the whole floor: `td_stand1.py`
  replaces `td_pole.py`, and the raster A and B levels, the redepth, the pole
  aisles, notches and wells, the corner K and the pockets are gone from
  `td_build.py`). Each A block is a finger with the B block behind its walkway:
  the rows straight and square to the finger's own axis (A rows 1-26 counted back
  from the walkway, the walkway strip, B rows 27 on, the landing behind the last
  row), the aisle between two blocks the seam where one block's rows end and the
  next's begin (each block's rows run to the middle of the gap the map leaves,
  seats stop at its outline). Heights are the building's section, linear between
  a finger's front, walkway and back (A 1.0 m + 0.17 a row, B 5.5 m + 0.255 a row,
  every back meeting the 10.6 m concourse); the three corner fingers keep round
  16's fitted anchors. The 3B side is the 1B side mirrored; the centre blocks
  (A25, B25 ...) are built from their own outlines. The outfield's F blocks keep
  the raster's treads from the fence (4.6 m + 0.344 a row up to 10.6) cut to the
  map's F outlines, and their seats (`td_stand1.lay_curved`) are laid along those
  rows inside the outlines (5496; the old ones, laid from another front and re-rowed
  from the fence, stood 255 pairs on top of each other). 1203 rows / 7944 seats in
  A, 1028 / 8565 in B; no two seats within 0.3 m.
- **B02** (the corner's middle block) was too shallow (0.113 m a row, its back 9.44
  m under the concourse): its anchors are now 3.25 / 7.70 / 10.60 m (front,
  walkway, back), 0.197 m a row and flush with the concourse; the price is a step
  across the B02 | B03 aisle of 1.26 m on average.
- **Entrances** (`td_entrances.py`): the map's 72 numbered circles, read with the
  digit word inside each (under 1 pt from its centre). Numbers run clockwise from
  the right-field foul pole and are the ticket's aisle number (通路): the 1st floor
  1-58 (1-24 down the 1B side, 25-48 up the 3B side, 49-58 across the outfield),
  the upper deck 1-14. On the 1st floor every circle stands at the head of the
  aisle between two blocks, a metre and a half from the back of each (measured on
  the map's outlines, all 58). `td_build.py` puts each door where that aisle's axis
  (the mean of the two blocks' finger axes, `td_stand1.aisle_axes`; in the outfield
  the way the distance from the field climbs) meets the concourse wall, so the
  doors stand on their aisles (0.10 m median off the seam between the two blocks,
  0.85 m at most, `proto/door_check.py`), 2.0 m wide as the circle is. Behind home
  (24-27) the circles stand 4-7 m behind the blocks (the map's concourse is deeper
  there): the doors are in the wall at the aisles' heads, the furthest 8 m from its
  circle. Over each door the number on a plate in the style of the building's own
  aisle signs (black, the number large, 通路 AISLE under it; a photograph of aisle
  10 was the model), on both faces of the wall, hung on the line of the wall's own
  panels over the opening (`data.signs`, all 116 plates one mesh, `signSheet` in
  `d3-stands.js`; seven doors, 5 and 51-56, have no such panel and take the aisle's
  axis). `sheetdump.mjs` saves the plates' sheet as a picture.
- **Upper-deck entrances.** The 14 vomitories through E's front rows are at the
  circles' angles (each in the notch of one E block's front edge on the map) as
  before, but `td_gen.py` had left the seat-free notches at every other gap
  between D blocks (22 of them), so 13 of the 14 pits had 8-29 seats standing in
  them and eight notches had nothing. `td_gen.py` now takes its notches from the
  same 14 angles (`td_entrances.py`) and `td_build.py` drops any seat left over a
  pit (136). The signs over them read the map's aisle numbers 1-14, in the same
  plate style (`sign` in the vomitory's data; `label` still names the E block for
  the tools). The stair flights between the balcony and the 2nd floor keep 2.5 m
  off the vomitories' pits and look 46 m out for room (E25's was walled in by the
  flight at 6.6 degrees, the last stuck vomitory of round 16; the flight now
  stands at x = 6.5, 5 m from the pit).
- **E's aisles.** The blocks' angles (`spans('E')`) are the map's polygons' extremes,
  which overlap their neighbours' by up to 3 degrees where the map draws its blocks
  as slanted parallelograms, and td_gen.py pulled 1.2 m off each block at 85 m out,
  not out on E's ring at 110-145 m: aisles 3-3.7 m wide (or none where the blocks
  overlapped, their seats standing on each other: 859 pairs), too wide for the
  tread's 2.2 m opening rule, so bare gaps between the blocks all the way up.
  `aisle_sectors` (td_gen.py) pulls the overlaps apart to an aisle of 1.3 m at
  least, and leaves the map's own gap where it is wider: E has 8356 seats (9194)
  and every aisle has its tread and half steps (326 of them) but the 14 pits.
- **Rows of the upper tiers** are counted from the distance field each ring of seats
  was laid along (`set_depth` in `td_build.py`: the hull's distance, the balcony's
  and the 2nd floor's fronts moved back beyond the poles), not from the front the
  level found for itself from its seats: the balcony's ends had run their four rows
  into one (row 0 had 42 seats to the others' 15 at 120-135 degrees, 456 pairs on
  top of each other; each row now has 22). A last pass drops any seat within 0.3 m of
  another (D 45, the excite seats 246).
- **Behind the outfield (doors 51-56)** the walkway runs on to the building's outer wall
  and the concourse has no wall of its own, so there is no opening to cut: each door
  is a dark leaf with a light frame (2.0 x 2.5 m, `data.leaves`, `doorLeaves` in
  `d3-stands.js`) on the outer wall facing the stand, the plate over it. The wall as
  drawn is the ring smoothed (`smoothRing`, 2.5 m) and simplified, up to 0.1 m off
  the raw ring, so `td_build.py` fits the line to that smoothed ring (`_smooth_ring`)
  and hangs the plates 0.14 m, the leaves 0.10 m, proud of it (at 0.05 m half of a
  leaf and its plate were buried in the wall). Doors 49, 50, 57, 58 (near the poles,
  where the concourse has walls) are real openings with lintels, as the infield's.
- **Excite seats (G)** are laid block by block: each of the map's 22 solid G outlines
  is a strip whose rows (the "1-6" beside its name, as the A blocks' "15-40") run
  along its long axis from the field's end, square to it, a seat every 0.5 m across
  (1053 seats; the raster's rows parallel to the fence, 1692 with stacked doubles,
  are gone). G03, G04, G46, G47 (drawn dotted) stay unseated. All reachable.
- B20|B21 (and B17|B18, B12, B24 ...): the map's aisle jogs wider mid-block there; the
  circles at its ends (entrances 20 and 21) have their doors, the jog itself is
  plain stairs (open question: whether it is a gate).
- Not changed: the balcony's aisles (every 12 m: the map draws its C01-C97 as a
  ring of 2-degree cells with no gaps, so there is nothing to read the real ones
  off), D as sectors between the map's block angles.
- Regenerate: `cd pipeline && python3 td_gen.py && python3 td_build.py`
  (2.5 and 3 minutes; `td_gen.py` rewrites `td_seats1F.npy`, which nothing reads
  any more: `git checkout` it), `python3 pipeline/mkdata.py td && node build.mjs`,
  and to the app `node gen.mjs <dir>`, copying `venues/td-data.js` and
  `stands.js` to `src/three/`.

## Round 16: Tokyo Dome's pole corners laid out block by block; the balcony and 2nd floor on past the poles
(`td_pole.py`, named below, is gone: round 17's `td_stand1.py` is the same method for the whole 1st floor.)
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
