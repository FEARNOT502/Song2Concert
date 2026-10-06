# Venue lab — status after round 12

Artifact: https://claude.ai/artifact/GAJY8f6CQP3od9iFZ2c9nk

## Round 39: Wembley's Level 5 north side walked across to the corners
- **What was asked** (user, with a screenshot): something sticks out in Level 5 left of the east end's screen, so there is no
  walking past it from left to right.
- **What it was.** Level 5's north side (between the two steps in its front, `section_depth`) was raked from a front row of its
  own, set back 7 m, so where it met the corner blocks it stood 5-6 rows (2.1-2.6 m) lower than them, and `aisle_walls` closed
  the seam with a wall 1 m above the higher side, front to back, at about +-58 deg. Not the screen (Round 36).
- **What the plan draws.** The north side's rows are the corners' rows carried on: 509's rows run on across the seam, and 508
  starts at row 6 beside the 508/509 aisle, its front stepped back. So the heights carry on across it.
- **The fix** (`wb_gen.py`). The seam is the aisle the plan draws back from each step (508/509, 543/544), found as the line from
  near the step's middle that runs along most of the plan's aisle strip (both found at 99-100%). The north side's rows are
  numbered on from the corners' by the rows its front stands back (`K5` = 5, the two fields' offset along the aisles: 4.6-6.0
  rows), so across the seam the treads differ by 0 to one riser. `aisle_walls` closes a step of a row or less flush with the
  higher tread (a riser, walked across) and keeps the 1 m wall only for more. The north side's front parapet is drawn at its
  own first row (`front_parapet(..., b0=K5, within=SEC5)`). Level 5's sightline is given 54 rows, room for the north side's
  rows numbered on (it ends at row 45, as the corners do; rows 0-46 keep their heights).
- **What moved with it.** The north side stands about 2 m higher: seated from row 6 (31.9 m, was row 1 at 29.7 m) to row 45
  (48.9 m, was row 41 at 47.1 m), the corners' last row. The L5 vomitories are placed by angle on the line of row 12, scaled by that line's extent, and that line on the north
  side is now 4 m further forward, so all 52 moved: the north side's 4 m forward with their row, the rest by 0.5-2.4 m along
  their rows. They now sit closer to the plan's aisles (distance from a vomitory to the nearest aisle of the plan: median
  0.38 m and at most 1.3 m, from 0.71 and 2.5).
- **The count.** Level 5 39,214 seats (official 39,165; 39,150 before), pitch unchanged. L1 33,988 and L2 15,619 unchanged.
- **Checks.** 147 of 148 vomitories walked through from 2 m in front of the mouth; the other, 513 at the east end, from 0.8 and
  1.2 m (it opens 1.8 m behind the screen's housing, Round 36, so the 2 m start is inside the housing; the same on the data
  before this round). Every seat of every level reachable (L5 39,214 / 39,214; before, three front-row seats were not).
  `rowwalk.mjs` (new: the app's walker seat to seat along a level's rows) from 40 to 75 deg and -75 to -40 deg: 6,976 steps,
  36 blocked, all across the vomitories' pits (rows 13-16), none at the seams. (Before, the seats either side of a seam stood
  4.4-5.3 m apart, too far to count as a step along the row, so the walk never tried the seam; the wall shut it.) Two pieces of
  the 1 m wall remain, 0.3-0.5 m long, at rows 28-29 where the treads meet two risers apart; the walker passes them. The app builds
  and loads. The renderers did not change. The acoustics were not touched.
- New tools: `rowwalk.mjs` (above) and `appprobe.mjs` (what the app's walker meets at given points: the meshes there and its
  rays at knee to head height).

## Round 38: Wembley's Level 5 blocks 519 and 533 seated again
- **What was asked** (user): a whole block by the 519 entrance has no seats; fix it.
- **Why it was empty.** Seat data, not the crowd: the reseat (Round 30) seats a row only where the plan draws its line along the
  row's front (`ev`, sampled 0.35-0.85 of a row ahead of the tread's middle). In 519 and its mirror 533 (the stage end's south
  corner) the plan's lines all sit about half a row further back than the treads put them (the line found 0.1-0.2 of a row ahead
  instead of 0.6-0.7), so under a third of each row found its line and every row was dropped (`MINCOV`). The traced seats before
  Round 30 had them; nothing else hid them.
- **The fix** (`wb_reseat.py`, `_late`). Each tread also looks for its line half a row back (`ev2`, -0.35..+0.15 of a row). Over a
  6 m square (`LATE_WIN`), where under 40% of the treads find their line where it should be and over 70% find it half a row back,
  the rows there are taken from those. Judged by the block, not the row, because elsewhere a tread between two of the plan's rows
  finds the next one's line half a row back and is not a row of its own. It changes only Level 5: 519 and 533 seated throughout,
  and the rows that were missing in parts of 509 and 539 (same cause, partly). Levels 1 and 2 come out seat for seat as before.
- **The count.** Level 5's pitch goes from 0.521 to 0.547 m so it keeps its official count: 39,150 (official 39,165; 39,050
  before). L1 33,988 and L2 15,619 unchanged.
- **Checks.** 148 vomitories walked through, none failed; every L1 and L2 seat reachable, L5 39,147 / 39,150 (the same three front-row seats beside the 508 and 544 vomitories as before); the app builds and loads the stadium with no errors. The
  renderers and the crowd rule did not change. The acoustics were not touched.

## Round 38: Wembley's end screens set back into Level 5's front

- The screen used to stand on the bay mouth's chord, but the tier's front bows back from that chord by up to 1.8 m in the middle, so from Level 2 the screen read as a panel standing out over the crowd. It now stands 0.15 m behind the front's deepest point, in a niche cut into the housing. Either side of it, the housing's face follows the front's own curve.
- The housing is pale grey cladding (0x74777c), as in 정우's photograph, not the stands' dark front.
- In the app, only `src/three/venues/stadium.js` was copied over from gen. The other generated modules differ from main's app copies (edits made in the app after the lab), so they were left alone.

## Round 37: the dome's floor ends at the line 정우 drew; seats beside the cross's arms

- The floor stops at the cross aisle behind the FOH desk's band (z 123.6): the band behind the desk is gone, the desk stands at the floor's back edge. From the sides it is cut in on a diagonal from (±23.5, z 106) to (±12, z 123.6), chair by chair (`inBack` in j-dome.js), read off 정우's green line over a screenshot of the floor. An estimate from a picture, not a plan.
- The field's outline is not quite symmetric (the excite seats' fronts differ a little side to side), so the blocks along them were cut differently left and right: a chair now goes only where the field holds both it and its mirror (`inBoth`), so the floor is a mirror image.
- Block size unchanged (16 × 15). A short band (6 rows, z 56.6–62.4) fills the gap beside the walkway across, past its ends at x ±31.4.

## Round 36: the dome's floor to its edges with FOH at the back; Wembley's end screens set into the tier; the cross without z-fighting
- **Asked** (user): fill the dome's floor the way the real layout does (a photo of LE SSERAFIM at Tokyo Dome, the empty field at the
  edges marked to be filled), FOH desk at the very back; Wembley's end screens stuck out unlike the real ones; the floor of the
  cross runway flickered where the two runways overlap. (A first pass put the blocks on arcs and rebuilt the roof in two layers;
  the user asked for both to be undone, so the roof is as before.)
- Dome floor: the straight 16 x 15 blocks as before, now out to 2.2 m from the field's edge (rows down to 3 chairs, blocks down to 2
  rows, so the corners fill); the desk and the delay towers' bases take only the chairs they stand on. FOH (eye) z 104 -> 122, the
  middle of the back of the floor. The lab's info line ('56 m') is unchanged.
- `crossThrust`: the runway is built in pieces either side of the walkway and short of the end stage, so no two deck tops share a
  plane over the same floor (was z-fighting in arena, dome and stadium).
- Wembley: from the photographs (Commons "Wembley Stadium interior"), the screens sit in the front of Level 5, foot on the lip,
  face flush, rows rising behind and beside. The housing no longer hangs below the lip; the screen sits on the mouth's chord.

## Round 35: the stands sold as a concert sells them
- **Asked** (user): fill the dome's and the stadium's stands as a sold-out show sells them, restricted-view seats included; the
  stadium's crowd went too far back, the dome's should reach a little into the outfield.
- Both now sell a seat when it can see the wall's face: `z - WZ > max(m, 0.12 * (|x| - WW/2))` (about 7 degrees past the wall's
  edge; m = 2 m stadium, 4 m dome). Stadium (face z 8, 62 m): no more corner seats behind the wall's line. Dome (face z 19.6,
  66 m): the outfield's F stands past the poles are sold, the stand behind the set is not.

## Round 34: the dome's show on its own steel, its stage forward, its floor in wide blocks
- **Asked** (user): nothing can hang from the dome's membrane, so build a structure; the stage is too far back, place it from real
  references; lay the floor blocks out as the real plans run them (no one-row leftovers) and bigger, filling the gaps.
- **References**: the 2nd-floor photos in stage-references/dome (01, 02) show the stage's front about level with the foul poles
  (100 m down the lines, z ~43 here), the set's yard behind it; ticket-site guides give the floor as lettered blocks A (front) to
  E/F, numbered across (up to 19-20 across), about 12 seats x 15 rows each with narrow aisles.
- Stage moved 16 m forward (`SZ`): deck z 18-38, wall face z 19.6, runway from 38, cross walkway at z 57 (+-30 m), end stage to
  z 88, delay towers (+-24, z 78). Stands sold from z > 28.
- New in `h-show.js`: `groundRoof` (corner towers, roof grid, skin; everything else on chains under it) and `paWing` (side PA
  tower on ballast with head truss, bridged to the roof). The dome: roof at 27 m, trusses at 23 m, mains off its front corners,
  wings at +-47 (24 m). The stadium uses the same two helpers now (no visual change). The dome's own gondolas and house speakers
  (venue equipment) still hang from the cables.
- Floor: 16 seats x 15 rows (8 x 13.5 m), aisles 1.2 m, cross aisles 1.6 m, laid from the runway out, a centre block once past
  the end stage. A block meeting the runway/cross/towers/desk gives up that whole side; slivers (< 6 seats or < 4 rows) and rows
  the field edge cuts to < 6 chairs are dropped.
- Checked: venue-lab top, side and FOH shots; `npm run build`; app draws dome, arena, stadium with no errors.

## Round 33: the stadium's big LED wall, and rigging that hangs from something
- **Asked** (user): the stadium should get the same big LED wall as the dome and the arena, and the lighting and speaker trusses
  should stop looking like they float. **Acoustics untouched** as before.
- `d-rig.js`: `chainInto` (a chain from a pick point up to the steel, with its motor just over the load and a clamp on the beam);
  `hoists` draws those chains (0.028 m, not 0.012) and takes `roofY` as a number or a function of x, so a curved roof gets the
  right length. `h-show.js`: `paHang` hangs its array on two of them (`roofY`), `screenHang` puts a header truss along a screen's
  top edge with chains from it up to the roof.
- Arena and dome: the main wall and the arena's IMAG now hang on `screenHang`; the dome's trusses chain up to the membrane at each
  pick (`roofAt(x, z)`), the delay towers' arrays hang under their head truss.
- Stadium: the Love On Tour three-piece wall is gone. One 62 x 21 m wall (`bigScreens`, no IMAG, like the dome), a cross runway
  (walkway at z 50, +-30 m, 10 m end stage at z 84), and, since the pitch has no roof to fly from, a ground-supported stage roof:
  four lattice towers at +-35, a roof grid at 33 m with a black skin, the wall on chains from its back beam, three lighting
  trusses at 28.5 m on hoists under it, the mains from its front corners. The side PA stands on its own towers at +-44 (31 m),
  bridged back to the roof; the two pitch delay towers are unchanged.
- Checked: venue-lab renders all three (house and show), app `npm run build`, app draws arena, dome and stadium with no errors.

## Round 32: stages and PA as the big tours build them (arena, dome, stadium)
- References: /mnt/project-files/stage-references (photos + README with sources). Asked for: dome and arena a big LED wall and a
  cross-shaped runway, IMAG only in the arena; the stadium like Harry Styles' Love On Tour at Wembley (2023); speakers and delay
  towers placed as real shows place them. **Acoustics untouched**: `src/audio/venuerooms.js` keeps its own hang/tower positions.
- New in `h-show.js`: `crossThrust` (runway, a walkway across it, an end stage; `inside(x, z, pad)` for the crowd), `paHang`
  (a line array with bridles to the roof; yaw positive turns it towards +x), `subLine` (floor subs under the barrier + front fills
  on the lip), `delayTower` (lattice mast on ballast, outriggers, head truss, array, returns light positions). `bigScreens` takes
  `h` (a wide wall) and `imagW: 0` (no side screens).
- Arena: 30 x 10.5 m wall + IMAG; cross (runway to z 52, walkway at z 38, +-12 m); mains +-17.6, flown subs, side hangs +-29.5
  turned out, 270s +-33.5, delay hangs +-13 at z 56.
- Dome: 66 x 16 m wall, no IMAG, no ribbon columns; deck 72 m; cross (runway to z 82, walkway at z 47, +-30 m, 10 m end stage);
  mains +-36.4, side +-44.5, 270 +-51.5 from the roof; two field delay towers (+-24, z 66, 20 m) with lights.
- Stadium: no stage roof; LED in three pieces (middle 30 x 19 m with a triangle cut at its foot and a light grid behind; wings
  20 m, 18 m high inside sloping to 10 m outside, IMAG-style content), black header over the middle; mains from the header's
  ends, side and 270 hangs on lattice towers at +-41.5; runway to a 9 m B-stage (z 59); two pitch delay towers (+-22, z 80, 26 m).
- Checked: venue-lab renders (FOH, show mode, aerial), app `npm run build`, app draws all three without errors.

## Round 31: Wembley's Level 1 in two sections, the back one on a wall up from the walkway
- **What was asked** (user): find out how the real Wembley's Level 1 is built and rework it; there should be a step between its two
  blocks of rows.
- **What the real one is.** The detailed plan dots two barriers round the bowl (white dots at depth ~28.0 and ~30.5 rows): the front
  of the walkway behind row 27, and the top of a wall behind row 28; the row numbers skip 29 and 30. Photos (geograph, divisare) show
  the front section, the walkway the vomitories open on to (row 28's companion places on it) and the back section, rows 31 on, on a
  wall of about a metre.
- **The rake** (`wb_gen.py`, `stepped`). Bands up to 30 keep the plain sightline rake (`H1r`); from band 31 (`STEP1`) it starts again,
  its first row's eye clearing a 1.8 m person standing on band 30 (C 0.07). The wall is 0.927 m; the back rows stand ~0.6 m higher
  than before (row 44 at 15.6 m), so L2's rows stand at least 2.6 m over them (3.3 before).
- **The vomitories** keep the steps, concourse floor (8.34) and cut rows they had on the plain rake (`vom_plan(H1r, ...)`: open row
  34), so their pits and the seat count around them are as reviewed.
- **The way up.** The plan's aisles up the back section meet the walkway where the vomitories are, so each pit gets a flight up each
  side of it (`flight`, 0.7 m wide, 11 risers from the walkway to row 34 over the tunnel's roof), the rows' treads cut away under it
  (`NOTCH1`) and the seats packed against the pit's walls making way: 78 flights (the press box's and two corners' sides left out),
  296 seats, so L1 has 33,988 (official 34,303). A search for other aisles crossing the wall (`row_gaps`) finds none left once these
  are in.
- **The barriers** (`fence_runs`, `L.fences`, the same see-through posts and bars as the arena's corners): along the top of the wall
  (not over the press box's desks), and along the walkway's front where row 27 is seated in front and the walkway clear behind,
  open at each vomitory's mouth (`at_mouth`) and the aisles; 355 pieces.
- **Checks.** 148 vomitories walked through, none failed; L1 33,988 / 33,988 seats reachable (L2 all, L5 39,047 / 39,050 as before);
  the app builds and loads the stadium with no errors. The renderers did not change. The acoustics were not touched.
- **To know.** Row 28's seats still run across the front of a vomitory's mouth where the plan draws them there (as before this round).

## Round 30: Wembley seated row by row from what the plan draws, the corner portals' heads along the row over them
- **What was asked** (user): the tunnel's top is crooked, the seats have gaps in them and the spacing along the rows is odd, so lay
  the seating out exactly as the real Wembley's.
- **Why it was wrong.** The seats came from a tracing of the plan's image (`wb/wb_seats.pkl`), so a row lost its seats wherever a
  block's, a row's or a seat's number, or the watermark, is printed over it, and kept them crowded or spread wherever the tracing
  wobbled; and they were stored to a decimetre, which left 0.36-0.5 m between neighbours in one row.
- **What the plan draws** (`wb_plan.py` -> `wb/wb_plan.png`, 16-bit, three bits a level): its aisles (the pale cyan strips and their
  white edges), its rows' lines (a black-hat of the block's grey) and its lettering. Each level is registered to the stand by its own
  scale, centre, stretch and turn, fitted so the lines fall on the rows' fronts (Nelder-Mead on the circular mean of the depth
  modulo the row; the fit moved L5 by 0.5 m and halved the scatter).
- **The seats** (`wb_reseat.py`). Each row's middle is traced through the depth field; the plan's aisles across it are kept where they
  are drawn, carried on along their own straight line where the watermark hides them (and a fleck on one row alone dropped); the row's
  line decides where it is seated, breaks under lettering bridged; then the seats go in end to end, one pitch apart. Pitches 0.551,
  0.5 and 0.521 m give 34,284 / 15,619 / 39,050 against the official 34,303 / 16,532 / 39,165. The press box is seated the same way.
  Seats are stored to a centimetre now: `seats_out(scale=100)` and `seatScale` on the level, read by both renderers and reachcheck.
- **The corner portals.** The plan's way through the rows is up to 12 degrees off square to them at the north corners, so a portal cut
  square to the tunnel cut the rows across at an angle: its head looked crooked. The tunnel still runs where the plan puts it, but its
  mouth now ends on the front of the first row over it (`deck2`, the depth at each wall), and the roof is laid in strips between the
  two, so the rows run straight across the head.
- **Checks.** Every vomitory on all three levels walked through (148 ok, none failed); the app builds and loads the stadium with no
  errors. `stands.js` and `d3-stands.js` stay identical bar their imports.
- **To know.** Row and seat numbers are not read off the plan; only where a row is and how wide. The acoustics were not touched.

## Round 29: Wembley's vomitories on every level where the official maps put them; the four corner tunnels as wide, deep and high as the plan leaves them
- **What was asked** (user): the Level 1 corner tunnels' size and position as the real stadium's, and the seating and the entrances
  where they really are; then the vomitories on every level, and the corner tunnels' size and shape exactly as the real ones. Answers
  to the questions put first: find the references on the web; the four pitch-corner tunnels; size and position estimated from the
  Level 1 seating plan; all three tiers; the building's outside and the west-end stage left as they are; the acoustics not touched.
- **Vomitories.** `wb/wb_blocks.json` holds the official Level 1, 2 and 5 maps' block boundaries; `wb_gen.py` puts a vomitory at each:
  Level 1 44 (was 21), Level 2 52 (was 13), Level 5 52 (was 27), each labelled with its two blocks; the plan's own gaps where none
  stands now are seated. Their steps run on 0.2 m under the walkway's edge (a crack the walker fell into at 105, 117 and 130). One
  may stand over a corner tunnel's covered run, as the real 138/139 does; none in its open cut.
- **The corner tunnels.** Aimed along the middle of the corner blocks 107, 116, 129 and 138, then fitted (`plan_cut`) to the corridor
  the plan leaves unseated there (the recovered `wb_seats.pkl` predates any tunnel, so its corner gaps are the plan's): the seats'
  lower envelope either side, a straight line each, robust to the odd seat. The open cut runs from the front to where the plan's
  seats close over it; its walls stand 0.4 m out from the seats' middles (a row's end), 0.3 m thick, their tops a rail's height over
  the rows beside them (`data.cutWalls`, drawn light: `data.cutWallTone` 0.85, default 0.4 elsewhere); the portal is as wide as the
  cut there and its clear height is the plan's first row over it less a 1.0 m lintel. North (138, 107): 6.9 m clear at the front,
  8.6-8.7 m at the portal, the cut 15.4-15.5 m long, 5.3 m high. South (129, 116): 4.6-5.4 m to 6.6-6.7 m, 10.8-10.9 m, 3.9 m. The
  tunnel's own side walls begin at the portal (`sidesAsWalls`). Was: 7.0 x 4.5 m each, off the plan's corridor.
- **Rows at the portal.** A row too low to stand on the tunnel's roof reaches back a little under the next one up; that sliver stood on
  the ground inside the portal like a pillar. `tunnel_rows` now cuts every such row at the covered tunnel's outline (`t['void']`).
- **Checks.** Seats: Level 1 28,578, Level 2 13,487, Level 5 35,977. Every vomitory walked through on all three levels (44 + 52 + 52;
  108, 109, 115, 138/139 and 203, 207 among them); every seat reachable on foot from the pitch (100% on each level) and all
  five tunnels walked to their ends. The app builds and loads the stadium without errors; `stands.js`
  changes by the one tone line, `wb-data.js` is regenerated.
- **To know.** The tunnels' sizes are estimates from the seating plan and photos, not drawings. The total is still short of the
  official 90,000 (the plan's seat spacing is kept). The acoustics were not touched.

## Round 28: the Saitama Super Arena's corner funnels bounded by the stands' own end faces on the map's drawn outline, a thin steel fence on top
- **What was asked** (user, with the map crop and a red triangle drawn on it): work the funnel as that picture has it; the real tunnel is
  the two corner blocks' end faces with a fence on top, so take the thick wall bodies out, work the blocks' faces and put a thin steel
  fence along their tops. Answers to the questions put first: the face stepped with the rows (no wall of its own); the fence see-through
  (posts and bars); each corner as its own map has it (not mirror images); the back along the map's line, with the fence on it too.
- **The outline.** The thin white line the map draws round the stands is the only white in the image (seats grey, labels coloured):
  `ssa_outline.py` fits straight lines to its pixels (RANSAC) and writes `ssa/ssa_corners.json`. SE: the end stand's side one line
  (13.8 degrees off upright), the fan's one line (45), the back (the line blocks 127+126's front rows lie on, 25.2 degrees); SW: the end
  stand's side two lines (12.6 then 25.2, bend (-19.7, 49.0)), the fan's two (45 then 64.8, bend (-29.1, 44.5)), the back 24.8. The SW's
  two later pieces are parallel and square to its back, SE's are not: the two corners are not mirror images, and are not made so.
- **The faces.** `ssa_tunnels.corner_funnels`: each line is the face; it moves into the funnel only as far as keeps every seat 0.3 m
  behind it (SE none, SW 0.13 m on one piece); pieces meet at their lines' crossings; the front ends are where the stand begins along
  the line. The treads in the funnel are cut (SE 0.5 m2, SW 6.1 m2: a door's aisle beside block 26's end, no seat), the gaps between the
  faces and the stand's own edge are given to it (25 m2: bare treads, the rows going on to the line) and `clip_rows` trims every row's
  outline along the faces' exact lines, so the faces are planar, stepped with the rows, not the raster's ripple. No `cutWalls` any more
  (`[]`); `trench_wall`'s successors `corner_funnels` walls, `mouth_rails`, `Outlines`, `edge_chain` are gone.
- **The back.** The funnel runs on to the map's back line: the open cut is now 12.29 m from the cut start (was 11.04: the portal
  moves in 1.25 m); `standgen.cut_tunnels` takes `along_margin` (default 0.3, unchanged for other venues; 0 here), so the seats just
  behind the portal stay (10,824, as the map has).
- **The fence.** `ssa_tunnels.funnel_fences` lays segments [x0, z0, x1, z1, y0, y1] along the faces' path (a step every 0.25 m, from the
  nearest tread behind the face up 1.1 m; over a face with the concourse behind it, from the slab's top), the data's level-200 `fences`;
  `d3-stands.js` `fenceRun` draws each `slopedRuns` run as posts (every 1.5 m, 5 cm square, 15 cm into the tread) and three bars
  along its slope (heights 0.36, 0.68, 0.97 of the fence), in the rail's dark steel, see-through. The solid rails along the faces'
  tread edges are not drawn there (`WALLZONE`). Nothing else uses `fences`, so the other venues draw as before (`stands.js` is the one
  generated module that changes, by added code only).
- **Checks.** Every level reachable on foot, 100% (200 10,824, 300 642, 400 5,870, 500 754, 300S 124, the counts unchanged); 92 of 96
  gates walked (221-224 behind the stage as before) and both corner tunnels to their ends; each of 20 test points on the faces higher than
  1.6 m stops the walker; the app builds and loads the arena without errors; the app's other modules are byte for byte as before.
- **To know.** The faces' lowest stretch (under 1.6 m, at the front ends) can be climbed like any front row (the walker's rule:
  up to 1.5 m onto something broad; a fence does not stop it, its rays pass over); the portal is not a face, so the walker goes in
  there. SW's door 211 aisle is cut where it ran into the funnel. The back face between the end stand's face and block 127 has the
  podium behind it (no stand: the fence stands on the slab's top, 6.2 m).

## Round 27: the Saitama Super Arena's two corner funnels mirror images, the SW step gone; the end stand's back wall straight
*(Round 28 replaced the funnels' walls by the stands' own end faces with a fence, each corner as its map has it, not mirror images; the end stand's back wall straightening (`back_notches`) stays.)*
- **What was asked** ("fix the SW step; SE and SW tunnels symmetric; work the corner walls from the official image; and straighten the
  bumpy wall behind the rear seats"). The front-end line was asked for as the extension of the front line of the middle block between the
  rear and the side seats; the lab keeps round 26's mouth plane (square to the tunnel's line through the fan's front corner: the
  extension of blocks 127+126's front line, 24 degrees, closes the funnel's back, not its mouth, so it was not taken for the mouth).
- **Symmetric funnels.** `corner_funnels` reads the stand's edge off the block outlines of *both* corners together (`Outlines(sym=True)`: a
  point is stand if it is inside an outline or its mirror image is), so the edge, the pieces and the front plane come out the same on
  both sides; each piece's clearance is the larger of the two corners' (`guard`), and each wall's top the higher of the two corners' rake
  (`heights`). Result: the walls of SE and SW are mirror images to the millimetre (rear wall 2 pieces, 12 degrees then about 26, to
  (+-23.1, 54.5); fan wall 2 pieces, 45 degrees to (+-27.9, 44.0) then about 64 to (+-30.7, 49.7)); open floor 107.7 m2 each; 5.7 m between
  the walls' faces at the mouth. SW's own outline (block 26's tongue, block 24's nose) sets where the clearance is wider than SE's own
  stand needs: those 0.5-1 m show as bare steps behind the SE walls (the bowl outside the walls is 16.0 m2 SE, 7.1 m2 SW).
- **The SW step.** The model's treads beside block 26's end (door 211's aisle) are no part of an end face: only treads inside an outline
  (0.3 m dilated) hold a wall off (`guard`); the others in the open space between the walls are cut (`'cut'` in the funnel's dict;
  `ssa_gen.py` sets `L2.R`, `L2.band` there, 3.2 m2 SW, none SE, no seat among them) - they stood as a curtain of bare risers beside the
  tunnel's frame once the wall no longer hid them.
- **The back wall.** `ssa_tunnels.back_notches` finds where a level's last rows fall short of the end stand's straight back for a stretch
  of a block's end or more (200: the middle block's 7 m x 2.7 m notch, wall at z 55.1 against 57.8; 400: 2.4 m2 at the middle) and
  `fill_pocket` goes the rows on into it, bare (the map has no seats there), so the wall behind is one straight wall. Levels 300 and 500
  are left (no notch; the 500's waves are the doors' aisles, where the doors stand).
- **Checks.** Reachable on foot 100% (200 10,824 / 300 642 / 400 5,870 / 500 754 / 300S 124), 92 of 96 gates walked (221-224 behind the
  stage as before) and both corner tunnels to their ends, every funnel wall stops the walker (39 tests), the app builds and loads the
  arena; the app's other modules are byte for byte as before (`src/three/venues/ssa-data.js` the only difference).
- **To know.** If the front end should lie elsewhere (further out, or along another line), it is `a_m` in `corner_funnels` (the argmin
  of the fan-side edge near the cut start): a different plane is one line.

## Round 26: the Saitama Super Arena's corner walls fitted to the map's block ends (not parallel), their front ends on one plane
*(Round 27 made the two funnels mirror images and took the door-aisle step out; the walls here are otherwise as built.)*
- **What was wrong** (user: "fit the tunnel walls to the side seats' end face and the rear seats' end face of the official layout, and
  only match the front ends of the two walls; and the walls are not parallel to each other"): rounds 24-25 made the corner a 7 m strip
  between two parallel walls, bare steps filling what the map leaves beside it. The map's void is a funnel between the end stand's
  last block and the fan's blocks, its two sides at an angle: the rear block's end (128 SE, 24 SW) about 12 degrees off the end stand's
  line, the fan's blocks (124+125 SE, 27+28 SW) at 45 (the block outlines, `poly` in `ssa_chart.json`).
- **The funnel.** `ssa_tunnels.corner_funnels`: on each side of the tunnel's line (round 25's, 32 degrees, x = +-21.5: kept) the stand's
  edge is read off the block outlines and the treads the model adds beside a block's end for a door (`edge_scan`: out from the line
  every 2 cm), cut into straight pieces (`edge_chain`: Douglas-Peucker within 0.15 m, a piece under 1.5 m taken out, its neighbours
  meeting where their lines do, the block end that stands before the front left out). SE: rear wall 2 pieces (block 128's end, 12
  degrees, then upright), fan wall 1 piece (blocks 124+125, 45 degrees, 11 m). SW: rear wall 2 pieces (block 24's end: 12.5, then
  26 degrees), fan wall 3 pieces (block 27's 45 degrees, then a 0.8 m step where the aisle beside block 26's end begins). The map draws
  the two corners differently, so the two funnels are not mirror images; the covered tunnels (strip, lean, length) still are.
- **Front ends.** Both walls begin on one plane square to the tunnel's line, through the fan's front corner (block 124's (24.3, 39.3),
  27's (-24.2, 39.5)): 6.9 m (SE) / 6.5 m (SW) between the walls' backs, 5.9 / 5.4 between their faces. The rear wall's line runs on
  about 1 m past its block's front to reach it; between that and the front fence the stand's edge (the notch, bare steps by `fill_pocket`)
  has one straight rail (`mouth_rails`) and the fence runs on to it.
- **Walls.** Each piece stands with its back on the stand's edge (the outline, or the treads where they stand further out: no seat is
  cut, checked: none inside a wall's body, and 0.04 m2 (SE) / 0.7 m2 (SW) of tread under one, all at a wall's kinks and ends where it runs
  into the stand's corner or the slab), `WALL_T` (0.5 m) thick into the funnel,
  its top one straight rake over a metre above the highest tread within 2 m (`raked_top`, no higher than 6.1 m, the concourse slab being
  6.2), running 0.9 m on into the slab; `cutWalls` pieces, one for each straight piece (mitred at the kinks), caps at the front end only.
- **Open floor and bare steps.** The funnels' floor (SE 121 m2, SW 103 m2) is kept clear of the concourse (`BOWLMASKS`); the covered tunnel
  begins at the funnel's back plane (11.0 m from the cut start), the slab's front face behind the funnel the back wall with the portal in it.
  The bowl outside the walls is 8 m2 each (the notch and slivers; round 25 had 38 and 22 m2 of bare steps); `fill_pocket` now takes a cell
  a hair short of the first row's front as the front.
- **Gone from round 25:** `trench_wall`, `wall_env`, the common `TOP` and the parallel cut walls; the mirror check of the walls no longer
  applies (the tunnels' `p`, `u`, `w`, `L`, `deck` are still exact mirrors).
- **Checks.** Every level reachable on foot, 100% (200 10,824 / 10,824, 300 642, 400 5,870, 500 754, 300S 124); 92 of 96 gates walked, both
  corner tunnels to their ends (221-224 behind the stage as before); the app builds and loads the arena without errors; the app's other
  modules are byte for byte as before (`src/three/venues/ssa-data.js` is the only file that differs).
- **To know.** The walls follow the map's outlines, so a different map would give other pieces; the 32 degree lean, the 7 m tunnel width and
  the 0.5 m thickness are choices; `SSA_TRENCH_THETA` still moves the tunnel's line (the funnel follows it).

## Round 25: the Saitama Super Arena's corner trenches on the diagonal, mirror images, each with two alike walls
*(Round 26 replaced this round's parallel cut walls and bare steps by walls fitted to the block ends: the covered tunnel, its 32 degree lean and its place here stay.)*
- **What was wrong** (user: "make the corner trench completely parallel and symmetric"; on a version that ran straight back, "no,
  symmetric in this form", two diagonals drawn over it; then a plan of the void with the region outlined, "go with this feel"):
  round 24's two trenches were not alike (the walls began at different points on the front line, their tops differed, the bare
  steps beside them were lopsided), and a trench straight back was not wanted: it leans out, as the void does.
- **The trench.** `ssa_tunnels.corner_trenches(theta=32)`: still a 7.0 m strip, its middle line leaning 32 degrees out from the
  end stand's line (the mean of the two drawn lines, 44 along the fan's edge and about 19 on the end stand's side; the void's
  own edges are 44 and near upright). `SSA_TRENCH_THETA=<deg>` changes it (0 straight back, 45 the old model's diagonal).
  Across, it stands where it costs least, the two corners together (3 per seat cut, 1 per m2 of the bowl left outside it, 60 for
  stand standing in the way of its mouth, 1 per metre a wall begins later than the stand beside it does): SE x = 21.5, SW
  x = -21.5 on the front line, **no seat cut** (200 level: all 10,824 seats). Its mouth is square across it: both walls begin on one
  plane (`a0`), the later of the four places where a stand begins beside a wall (the fan's front corner; the end stand begins
  2.5 m before it, that stretch's steps ending along the wall's line); both open cuts run the same 11.0 m (the treads under the
  roof, or the bowl's length), then the covered tunnel on to the building's wall, 22.9 m in all.
- **Alike.** The four walls take one start, one end and **one raked top** (`TOP`, `raked_top` over the highest of the four
  envelopes from `wall_env`); their coordinates go in to the millimetre. The pair are mirror images (`p`, `u`, `w`, `h`, `L`, `deck`
  equal), the two walls of a trench mirror images about its axis; checked to 1 mm by a throwaway script (pair and wall mirror
  tests; not in the repo).
- **Beside the trench** the bare steps are SE 38 m2, SW 22 m2 (the map's two corners differ), as in round 24 (`fill_pocket`). Ahead of the
  walls' plane, on the end stand's side, their edge goes on along the wall's line down to the front fence; the zigzag of short rails
  the raster edge left there is one straight run now (`mouth_rails`: a rail a metre over each tread beside it), the same both sides.
- **Checks.** Every level reachable on foot, 100% (200 10,824 / 10,824, 300 642, 400 5,870, 500 754, 300S 124); 92 of 96 gates walked,
  the corner tunnels to their ends (221-224 are behind the stage's masking, as before); the app builds and loads the arena without
  errors; the app's other modules and venues' data are byte for byte as in round 24 (`src/three/venues/ssa-data.js` is the only file
  that differs). `standgen.cut_tunnels` has an `open` option (the cut runs at least that far); only SSA sets it.
- **To know.** The 32 degree lean and the 7 m width are choices, not figures from the arena's drawings; the bare steps stand in for
  what the map leaves void (seating them would add about 150 seats the map does not have); `SSA_TRENCH_THETA` re-runs it at another lean.

## Round 24: the Saitama Super Arena's corners as parallel 7 m trenches, like Wembley's
*(Round 25 leaned the trench 32 degrees and made the pair and the walls alike: its lean, place and wall starts here are superseded.)*
- **What was wrong** (user: "straighten it into a parallel trench like Wembley"): round 23's corner was still the map's bowl, a
  funnel 14-16 m across at the floor narrowing to the 7 m tunnel, its sides two straight faces at an angle to each other.
- **The trench.** `ssa_tunnels.corner_trenches`: a strip 7.0 m wide (6.0 m clear between the wall faces; Wembley's is 7.0 / 6.4),
  its middle line leaning 25 degrees out from the end stand's line (the way doors 240 and 211 at the corridor's head face),
  starting on the end stand's front line (z 41.5). Across, it stands where it costs least (3 for each seat under the roof's
  height it cuts, 1 per m2 of the bowl left outside it, the middle of the places that tie): SE x = 21.75, SW x = -21.75, **no
  seat cut**: the 200 level has all of the map's 10,824 seats (rounds 22-23 had lost 72 to the tunnel). An open cut through the
  rows too low to pass under (9.8 m SE, 8.6 m SW from the front), then on under the rows and the concourse to the building's
  outer wall, 22.3 m in all, shut there by its doors (`cut_tunnels`, `Lmin` from the outline, `open` from the bowl's own throat).
- **The walls.** `trench_wall` (ssa_gen.py): a wall each side of the strip, the face `WALL_T` (0.5 m) in from its edge, the
  rows ending flush against the back; the top one straight rake (`raked_top`: the line with the least room over a metre above
  the highest tread within 2 m beyond the edge, level at the roof's parapet), two or three points each. Same `data.cutWalls`
  form as round 23 (`pts`, `inner`, `back`, `caps`), drawn by `cutWalls()`. The covered tunnel's side walls begin 0.02 m beyond
  the open cut's end face (`buildTunnels`, `sidesAsWalls`) so no two faces share a plane.
- **What the bowl had beyond the strip** (SE 42 m2, SW 24 m2, 1.5 m slivers and wedges up to 5 m across) is **given back to the
  stand as bare treads** (the map has no seats there): `fill_pocket` fits one plane to the depth of the stand within 2.5 m of
  each part and pulls it to the stand's own depth at the stand's edge (1.5 m falloff), so the rows run on straight and even
  against the walls. (The level's own depth over a void is each nearest seat's, kinked where two reaches meet: steps with ragged
  edges, 1-3 rows off the neighbouring rows' plane; not used.) Seating them would add about 150 seats the map does not have.
- **Gone from round 22-23:** `corner_tunnels`, `bowl_walls`, `facets`, `dp_indices` (the bowls' own walls), the throat-width
  tunnel. Kept: `raked_top`, the `cutWalls` data and renderer, `floor_void`, `bowl_axis`, `trace_bowl`.
- **Checks.** Every level reachable on foot, 100% (200 10824 / 10824, 300 642, 400 5870, 500 754, 300S 124); 92 of 96 gates
  walked, the corner tunnels to their ends (221-224 are behind the stage's masking, as before); shared code touched: two lines in
  `d3-stands.js` `buildTunnels` (only for a tunnel with `sidesAsWalls`); the app builds and loads the arena without errors.
- **To know.** The bare steps beside each trench are a stand-in for what the map leaves void; the 25 degree lean and the 7 m width
  are choices (the doors' direction; the stadium tunnels' width), not figures from the arena's drawings.

## Round 23: the Saitama Super Arena's corner walls: straight faces, thick, one raked top
*(Round 24 replaced the bowls' own walls by a parallel trench: `bowl_walls` and `facets` are gone; `raked_top` and the `cutWalls` form stay.)*
- **What was wrong** (user's report on round 22: "tidy the end faces of the corner's rear and side stands as thick raked walls, like
  Wembley's tunnel"): the walls round each corner bowl followed the map's void as it is, a wavy outline (each row's end a step,
  smoothed), 0.5 m thick, their tops following the treads' staircase eased along (a hump, a dip), the coping a band of
  whatever width the body happened to be. Wembley's cut has straight faces, a top that is one straight line and a coping of one width.
- **Straight faces.** `ssa_tunnels.facets`: the outline of each run of wall (the stand's edge along the bowl) is simplified within
  0.8 m (Douglas-Peucker, no piece shorter than 2.5 m) to 2-3 straight pieces (SE 3 + 2, SW 3 + 2, one per face of the bowl's two
  sides); each piece's face stands on a line pushed out into the open space just far enough that no seat or tread is cut (never
  nearer than the chord), 0.5 m of wall beyond it; the pieces meet at mitred corners. Nothing is taken from the stands (seats
  10,752 as in round 22): the body fills whatever lies between the face and the stand's edge.
- **One raked top.** `ssa_tunnels.raked_top`: each run's top is a single straight line over the treads' heights (a metre over
  them), the one with the least room over them (a linear programme in height and slope, `scipy.optimize.linprog`), level where it
  reaches the highest of them (a trapezoid, as in the stadium's cuts) instead of a staircase. The cut's own walls (`cut_side` in
  ssa_gen.py) begin at the height the bowl's wall ends at, the least straight rake that clears the treads, level at the roof's
  parapet (or at the bowl wall's end, if that is higher): the top runs on without a step.
- **Coping.** `data.cutWalls` entries now carry `inner` (the face, a point for each), `back` (the line 0.5 m behind it) and `caps`
  (whether a piece's two ends show: a piece that runs on into the next hides its end); `cutWalls()` in d3-stands.js draws the pale
  coping (the top between `inner` and `back` and a 0.3 m band down each face) one width along the whole wall, the rest of the top out
  to the stand's edge in the wall's own concrete. Where a bowl's wall reaches the tunnel's mouth its face, coping line and outer end
  are those of the cut's wall.
- **Checks.** Every level reachable on foot, 100% (200 10752 / 10752, 300 642, 400 5870, 500 754, 300S 124); 92 of 96 gates
  walked (221-224 behind the stage as before; the corner tunnels walked to their ends); Wembley, the dome and the concert hall render
  as before (pixel for pixel but a handful of antialiased edge pixels), the app builds and loads the arena without errors.
- **To know.** The bowl's two sides are still the map's: the floor opening is 7.6 m wide and the bowl 14 m at its widest before it
  narrows to the 7 m tunnel, so the corner is a funnel with a pocket, not Wembley's parallel trench (that would take out the seats of
  the blocks round it). Faces are never cut into the stands: the body is thicker than 0.5 m (up to 1.9 m, at the two or three places where the stand's edge
  recedes furthest behind its face) and the coping 0.5 m (0.8 at a mitred corner); only the face and the coping are straight and even.

## Round 22: the Saitama Super Arena's corner tunnels as wide, deep cuts with thick walls; the 400 level's corner seams closed
*(Round 24 laid the tunnels parallel from the end stand's front line: `corner_tunnels` is now `corner_trenches`; the 400 level's seams stay as here.)*
- **What was wrong** (user's report on round 21): the corner passage was a 3.2 m wide closet, 9-13 m long, behind walls that
  were one sheet thick; the old model's and Wembley's corner tunnels are 7 m wide, run on out to the building's wall, and have
  walls with a body. And the 400 level's front rail and the band under it broke at all four corners, where the end stand
  meets the side stand.
- **The tunnel.** `corner_tunnels` takes the mouth where the bowl of open floor has narrowed to 7.4 m (`wmin`) and makes the
  tunnel as wide as the bowl there (SE 7.0 m, SW 7.2 m, 4.4 m clear): SE from (23.6, 51.5), 13.6 m long, SW from
  (-22.5, 50.6), 14.9 m, each out to the building's outer wall (`to_wall` -> `Lmin`) and shut there by its doors. It is the
  stadium kind again (`cut_tunnels` without `covered`): an open cut through the rows too low to pass under (3.7 / 5.1 m),
  then on under the rows and the concourse. The cut takes the ends of the rows it passes through: 55 seats fewer on the
  200 level (10,807 -> 10,752).
- **Thick walls.** `data.cutWalls` entries carry `n` (the unit vector out into the open space at each point) and `T` (0.5 m):
  `cutWalls()` in d3-stands.js then builds a solid (two faces, a cap, two ends, a pale coping on top), a ribbon as before
  where there is no `T`. The cut's own side walls are made the same way (`cut_side` in ssa_gen.py: along the cut, each top
  a metre over the highest tread within 2 m beyond its edge; the tunnel's `sidesAsWalls` keeps `buildTunnels` from drawing
  them again, its `T` thickens the walls under the rows), so a bowl's wall runs on into the cut's without a step. Walls stand
  against the stand's edge and are thick into the open space: the tunnel's clear width is 6.0 m. `tunnels_out` passes `T`
  and `sidesAsWalls` on only where a venue sets them (Wembley's and the dome's data are as they were). (Round 23 redid the bowls' walls as
  straight faces with one raked top: see above.)
- **The 400 level's seams.** Where the end stand's last block and the side stand's first stand apart (a diamond of 9-10 m^2,
  wider than the aisles' closing takes) the gap is given back to the treads (`corner_seams` -> `fills`: an aisle between the
  stands), so row 0, the band under it and the parapet run on round each corner: no free rail ends left in the seams.
- **Checks.** Every level reachable on foot, 100% (200 10752 / 10752, 300 642, 400 5870, 500 754, 300S 124); 92 of 96 gates
  walked (the corner tunnels now through to their ends; the four left are 221-224 behind the stage's masking, as before).
  Shared code: `d3-stands.js` (`cutWalls`, `buildTunnels`), `standgen.tunnels_out`; Wembley, the dome, the concert hall,
  Inspire and KSPO rendered again without errors.
- **To know.** The bowls' own walls still follow the map's void (curved, 2-8 m high): only the tunnel is straight.
  The north corners' seams are filled too, but lie behind the stage's backdrop.

## Round 21: the Saitama Super Arena laid out from the official seat map; doors, corner tunnels, suites
Arena mode, end stage 2. The seats, rows and doors are read off the official map (not drawn by hand), the structure round
them is rebuilt on that, and every level and every door is checked on foot.
- **The map as data.** `pipeline/ssa_chart.py` fetches the map (SVG `highlight_<id>` blocks, `gate_<n>` badges, `arena_1`,
  the PNG with its seat squares and the magenta row numbers) and the seat-number rules (`seat_list.js`: per block its seat
  numbers and rows), and writes `pipeline/ssa/ssa_chart.json` (224 blocks, 20,125 seats, 94 gates; the raw downloads stay
  in `pipeline/ssa/raw/`, not committed). Seats the row labels hid are completed from the lattice (the gray across-row
  edge evidence); rows are counted per block, the first row of each from the rules (the printed row numbers override
  when they all agree within two rows). 152 of the 224 blocks have exactly their rule count (20,125 seats against 20,887).
  The others: the blocks the stage stands on (61, 63, 305), the lettered A-H blocks (put away anyway), a few blocks
  22-23 seats short (seats under the map's labels), and blocks 46 and 49, which trade seats (196 between them, as the
  rules say). Each level is drawn at its own
  scale about the floor's centre: metres = (px - C) / K, C = (1978.6, 1906.95), K = 20 / 24.6 / 28.8 / 33.8 for the 200 /
  300 / 400 / 500 level (a seat is 0.5 m wide on all of them). The retracted telescopic rows (the lettered A-H blocks) stay
  out, the floor stays wide.
- **The levels.** `pipeline/ssa_blocks.py`: `build_level` makes a standgen `Level` (treads = each seat's cell, the
  aisles between blocks closed to 2.6 m, depth from the rows themselves, row bands) from the chart's seats; heights as
  before (200: 0.45 + 0.33 per row, 300: 10.6 + 0.42, 400: 14.5 + 0.42, 500: 22 + 0.5; concourses 6.2 / 11.44 / 16.2 /
  23.0). A door stands at its block's end: `end_aisles` lays the aisle beside each row's last seat (a wedge block's slanted
  end too, so nothing reaches out into the open floor). `ssa_gen.py` does the rest (concourses, stairs, vomitories, walls).
- **The 94 doors** (200: 28, 300: 16, 400: 32, 500: 18): 24 of them are the side vomitories' mouths (labelled with the
  gate's number), the other 70 are cut in the wall at the head of their aisle (`snap_doors`: the aisle's cell nearest the
  badge, out along the rake), each with a frame (`doorFrames` in d3-stands.js) and its number plate on both faces. A door
  whose aisle stands more than 0.3 m above the concourse (the 200 corner bays, a few 400 doors) has its sill up at the
  aisle and a short stair down. Stairs keep clear of every door's and vomitory's exit (`keepclear`).
- **The floor's south corners** are tunnels with raked walls (the north ones are behind the masking). The map leaves a
  bowl of open floor in each corner; `pipeline/ssa_tunnels.py` finds it from the treads, follows its middle line in to
  the throat (where it is no wider than 3.6 m) and puts a covered tunnel there (3.0-3.2 m wide, 4.4 m high, closed
  at its end, `cut_tunnels(covered=True)`); the concourse's block is taken out of the bowl, and the bowl's sides get walls
  whose tops rake with the rows beside them: `data.cutWalls`, one concrete ribbon per wall run, shaded smooth along its
  length (`cutWalls()` in d3-stands.js), the tunnel's mouth left open. (Round 22 made the tunnel wide and deep and the walls thick.)
- **The 300 level** (the VIP balcony, 642 seats) and **the suites** (the 300S level: 15 rooms and 124 seats along the left
  side): the balcony's blocks are boxes with a low partition at each end; the suites have a corridor behind them over the
  200 concourse's ceiling (`xc0`..`xc1`), a stair down to the concourse at each end (found like the others, the
  corridor's floor runs out over their landings), a door in each room's back wall onto the corridor and one in its glass
  front onto its balcony (`src/i-arena.js`).
- **Checks** (all in the lab; the throwaway scripts were kept out of the repo): the walker's flood fill from the floor
  (`node reachtest.mjs arena 0,50 1.0`, then `python3 reachcheck.py arena pipeline/ssa_stands.json 45`): 200 10807 / 10807,
  300 642 / 642, 400 5870 / 5870, 500 754 / 754, 300S 124 / 124 seats. Every door walked on foot (door, vomitory, corner
  tunnel: the walker from a point in the aisle through the opening to the concourse): 92 of 96; the other four (221-224)
  are the north end's, behind the stage's masking, and open on the backstage, which has no concourse here.
  Shared code that changed: `d3-stands.js` (`doorFrames`, `cutWalls`, a plate under a vomitory's mouth when `v.bridge`),
  `standgen.tunnel_rows` (a row lower than the roof is clipped off the tunnel's whole footprint: the rows' overlap under
  the next row up used to leave a sliver across a tunnel). The other venues' data are as they were.
- **To know.** The two south corners' bowls are 120-150 m2 each: the map has no seats there (block 127 has 9, block 25
  has 37) and the walls round them are 2-8 m high because the rows beside them stand at their own heights. The
  north end (blocks and doors behind the masking: 61, 63, 305, 221-224) is laid out like the rest but never seen.

## Round 20: the corner blocks beside the poles, one straight slope each
- **What was wrong** (the 3B stand beside the pole, the outfield stand to the right): a band of wall faces across the crowd, and a
  change of slope in the middle of the blocks nearest the pole. Round 19's corner gave blocks 1 and 2 a steep A and a flat B
  (0.43 / 0.20 and 0.32 / 0.26 m/m: a bend at the walkway of every block) and walls of 1.2 m (1.73 at the worst point) across the
  aisles B01|B02 and B02|B03 (the walkway stepping 9.3, 7.7, 6.4 m). Photos (the aisle-by-aisle photos of the 1st floor on aoimahiroblog, 通路1, 2, 46-49 towards
  centre and home; Wikimedia Commons interiors) show the opposite: one bank running round the corner across the blocks, the same
  rake all the way up each block, the front barrier stepping down towards home, a pole at the foot of the junction.
- **Why there are walls at all.** The rows run on across every aisle (`warp_rows`), so the distance from the walkway is the same on both
  sides of it and the step across an aisle is `dhw + dr * rho` for two straight slopes (walkway height hw, rake r). The corner blocks'
  backs are 6.7 m (block 1), 11 m, 16.6 m behind their walkways, the outfield's rows climb 0.46 m/m and the concourse is level at
  10.6 m: with every back flush with it no set of slopes can have no walls. The sum of the mean steps across the aisles of the corner
  is about the same (2.7-2.9 m) whatever is chosen; the choice is where it goes (two big walls, or a regular small step at every aisle)
  and what is given up for it.
- **`fit_straight`** (td_stand1.py, called in `td_build.py` after `fit_profiles_balanced`, which still gives blocks 9-25 exactly
  what they had): fingers 1-8 (either side) each ONE straight slope `h = hw + r (u - uw)`, capped at the concourse's 10.6 m. A
  linear program (steps are linear in hw and r: `scipy.optimize.linprog`, 0.6 s) keeps the largest step across any aisle between
  them (T) and `lam_F` (1.0) times the largest into the outfield stand (TF) as small as it can be, with: the back not more than
  `over[0]` (2.1 m) over the concourse (what is over costs 1.0 per metre: the block reaches 10.6 m before its back and runs level,
  a *landing*) nor more than 0.3 m under it; the front row between 0.5 and 4.8 m (the fence is 4.6 m); a rake of at least 0.26
  and neither hw nor r rising from the pole towards the middle; hw and r changing smoothly from block to block. Result (block: walkway m,
  rake m/m, front m, landing m): 1: 9.06, 0.387, 4.80, 2.7 | 2: 8.57, 0.322, 4.80, 4.7 | 3: 8.23, 0.269, 4.62, 7.8 | 4: 7.88, 0.269, 3.78, 7.2 |
  5: 7.53, 0.269, 2.98, 5.8 | 6: 7.18, 0.269, 2.22, 4.8 | 7: 6.84, 0.269, 1.56, 3.3 | 8: 6.49, 0.269, 1.01, 1.4 (block 9 on: as before, 6.14, 0.269).
- **Numbers.** Steps across the aisles of blocks 1-9: 0.33 0.26 0.26 0.27 0.29 0.31 0.32 0.34 m on the average (1.18, 1.09, 0.38 ... before),
  0.80 m at the worst point (1.73); into the outfield stand 0.26 m on the average, 0.67 at the most (0.13, 0.59 before: the price of
  the corner's walls going down); every block's A and B climb at the same rake. Mean step across all aisles 0.186 m (0.174).
  Renders from standing height in the 3B stand beside the pole (and the mirror on 1B) next to the old build: the band of
  wall faces across the crowd is gone, the rows run round the pole as one bank.
- **What it costs / to know.**
  * The blocks that now stand higher reach the concourse's height before their back and run level to it: a landing 1.4-7.8 m deep on
    blocks 2-8 (block 3, A47, the deepest), seats still laid on it at one height. Not visible from the stand, but the walker finds
    it at the top. Capping it at 3 m (`over=(0.9, 3.0)`, `lam_F` 0.7, blocks 1-6: tried, rendered) gives walls of 0.55 m at four aisles
    and 1.7 m at the outfield junction instead; the walls were plainly visible as grey slabs in the same views.
  * The front barrier along the foul line stays high longer (fronts 4.8, 4.8, 4.6, 3.8, 3.0, 2.2, 1.6, 1.0 m for blocks 1-8, 4.5, 3.9, 2.9,
    1.9, 1.4, 0.9, 0.6, 0.6 before): `edge_walls`/the fence ring follow it.
  * What the row counts in the aisle photos' captions hint at (41 rows at A49/A48/A01/A02, 46 at A47, 47 in the middle, 35-39 behind home) is a corner
    whose stands end LOWER than the concourse, with the same rows and the same walkway all round: no walls between blocks but 1.4-2.8 m
    short backs at blocks 1-2 (stairs up at the aisles' heads) and a 3-4 m cliff to the outfield stand's steep rows. Not built.
- Checked: walk-flood on foot (`reachtest.mjs dome 0,104 1.0`, 50 690 nodes, 150 s; `reachcheck.py`) A 8042, B 8449, F 5496, C 1995, D 4611,
  E 8356, G 1053: all 100 %; `vomtest.mjs` 14/14; `gatewalk` 10/10 (the gates are blocks 11-24: unchanged); `npm run build`.
- Regenerate: `cd pipeline && python3 td_build.py` (5 minutes; `git checkout -- td_seats1F.npy` if it was rewritten),
  `python3 pipeline/mkdata.py td && node build.mjs`, `node gen.mjs <dir>` and copy `venues/td-data.js` to `src/three/venues/`
  (`stands.js` and `venues/dome.js` did not change), `npm run build`.

## Round 19: Tokyo Dome's gates dug in under the stand, the entrances left open, one rake along every block
- **One rake on every block** (`fit_profiles`: `uniform`, `flat`, `w_hold`, `w_back`). Round 18's section grew its rake along
  each finger (0.17 -> 0.37 m/m), so the upper blocks looked gentler towards the outfield. Now A and B of every block from the
  3rd (counted from each pole) on climb at the one 0.270 m/m of the real rows (the walkway 5.9-6.5 m up along fingers 4-22).
  What that costs where the stand is not the section's:
  * blocks 1 and 2, beside the outfield stand (its rows climb 0.46 m/m, 13 m deep), take one straight slope each (`flat`: block 1
    A 0.43 / B 0.20, block 2 0.32 / 0.26) that meets the outfield's rows (`w_F` 100) and the concourse (`w_hold`); the two aisles
    B01|B02 and B02|B03 carry steps of about 1.2 m (1.73 at the worst point), drawn as steps and wall faces, no rail;
  * the five blocks behind home (21-25) are shallower (31 m, the rest 34-37): at 0.27 their backs stood 0.2-1.3 m under the
    concourse, a wall across every entrance there, so their backs are pulled up to it (`w_back` 100) and their front rows stand
    2.1-2.2 m up (0.5-1.5 elsewhere, the walkway 7.0-7.6 m); the aisles 22|23 and 23|24 step 0.65 and 0.50 m;
  * mean step across all aisles 0.174 m (0.10 in round 18, with its growing rake), the largest 1.73 m (between fingers); into the
    outfield's rows 0.13 m on the average, 0.58 at the most.
- **Gates dug in under the stand** (`gate_sites`, `gate_corridors`, `carve_gates`, `corridor_rooms`). The gates no longer end in
  an open stair cut up to the 1st floor's concourse. The pit (open to the walkway) runs into a short tunnel, flat at the pit's
  floor under the rows (their own slab its roof, 0.25 m), and the tunnels meet one lower corridor per side: 1B and 3B along the
  back of the stand (359 m2 each, floor 6.13, 4 gates) and H behind home (129 m2, floor 7.27, 2 gates). Each corridor is 5 m wide,
  2.8 m from floor to ceiling (its floor the lowest of its gates' walkway heights), runs 6 m past its outermost gate, and has two
  stairs (rise 0.19, run 0.27; 24 treads, 18 behind home) climbing through the 1st floor's concourse floor (an open cut with a
  1.5 m landing at the foot and 2 m of floor at the head) to the concourse. The corridor is cut from a raster: the signed distance
  `sd` to the stand's back edge (+ into the stand, - into the concourse; smoothed 1.5 m), the band `front - 5 .. front` of it (the
  front wall as far in under the stand as the rows' slab leaves 2.8 m of head room, 4 m at most), outlined and simplified (0.12).
  The rows over a tunnel or the corridor stay as roof slabs (`y0 = y - 0.25`), the 1st floor's slab prism over it is hollowed
  (`floors` entries with `y0`) and its walls (`corridor_rooms`: zero-thickness panels whose left side faces the room, 5 cm inside
  the outline the solids are cut to; the ring is turned counter-clockwise first (`orient`), a buffer comes out clockwise and
  the corridor showed its dark outside material on every wall), ceilings, lit floors and lamps join `rooms`; the old gate lamps and the open stair cuts
  are gone. 33 seats over the gates go (27 before), none over the stairs. Walk test (`gatewalk`, the walker started in the pit of
  each gate and sent along pit, tunnel, corridor, stair): 10/10 climb to the concourse (y 10.61).
- **Roof slabs meet with no crack.** Each row's slab used to be clipped to a straight strip square to the finger's axis while the
  rows are bent (`warp_rows`): 0.1 m cracks along every riser over the corridors, which the walker's step could not cross
  (20 seats of B unreachable, and thin black lines in the render). `carve_gates` now cuts a row's slab at the next row's own
  polygon, 3 cm (`GATE_LAP`) under it (`rows_out` hands over `nxt`, the next row up of each row of a finger).
- **Partitions with thickness.** The tan panels beside the pits and the stairs' cuts (`gateRails`) are solid, `gateRailT` 0.25 m
  (`thickPanel` in `d3-stands.js`: a face each side, the top and the two ends, each its own flat normal; the right side of a panel
  is the thick side, `_side_rails` runs them so that it faces away from the pit).
- **The 1st floor's entrances open.** There is no wall between the concourse and the 1st floor's stands any more
  (`enclose`: rooms[0] `open_stand`, `edge_walls(open_stand=True)`; the 4.5 m opening of the first try is gone too, as is the
  frame): the pillar stands free at the head of each aisle. Where a stand ends lower than the concourse by 0.4 m or more
  `edge_walls` leaves a wall 1 m over the concourse's floor on the step (with the present heights there is none).
- **Lights in '공연 중' (house 0)** (`roomLights`): the concourses, corridors, tunnels and stairs stay dark; the lights come up
  only for someone inside an entrance (`showZones`: 1.8 m on the stand's side of the pillar's line to 2.8 m past it, 4.8 m wide).
  '입장 전' (house 1) as before: they come up on entering any concourse, tunnel, stair or corridor. (A tour that renders several
  views in one page load shows the fade of the previous view for a few frames: take a show view first, or on its own.)
- **2nd-floor (E) entrances.** Each vomitory's pit walls are one continuous solid 0.35 m thick with a cap, raked with the rows
  (`vomParts`), the mouth framed by a post each side and a lintel over it, as deep as the wall is thick (0.6 m at least), the
  panels' seams gone. 14/14 walk through (`vomtest`).
- Checked: walk-flood on foot (`reachtest.mjs dome 0,104 1.0`, 50 743 nodes, 140 s; `reachcheck.py`) A, B, F, C, D, E, G 100 %;
  `vomtest.mjs` 14/14; `gatewalk` 10/10; renders of the pits, tunnel mouths, corridors, stairs (foot and head, from above), the
  pillars from the stand and from the concourse, the show-mode lights out and in, behind home.
- Not done / to know: the horizontal soffit seams on the E concourse wall are thin and left; the corner aisles' and the aisles
  behind home's steps (above) are what the one rake leaves.
- Regenerate as in round 18: `cd pipeline && python3 td_build.py` (5 minutes), `python3 pipeline/mkdata.py td && node build.mjs`, and to the
  app `node gen.mjs <dir>`, copying `stands.js` and `venues/td-data.js` (and `venues/dome.js` when it changed) to `src/three/`, `npm run build`.

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
- **The balcony's and the 2nd floor's fronts round each pole** (`td_upper.py`): the fronts (an iso-line of the hull
  distance less `tau`) ran as an S, in from the lines' arc, a stretch nearly straight along the pole's corner, in again
  along the outfield wall: a bulge up to 3 m towards the field at 90-98 degrees. `_FC`, `_FD` add to `tau` what moves each
  front onto the smoothest curve r(theta) that stays 6.5 m off the field (the balcony up to 2.1 m back, the 2nd floor 2.5 m,
  both 1.3 m forward at 84 degrees, nothing before 80 or after 104). The rings are laid by `td_gen.py`, so it runs again
  (3 minutes; it rewrites the tracked `td_seats1F.npy`: restore that with git): seats C 2016 (2044), D 4656 (4688).
- **Fence** colour darker (`0x0b2a1a`, `j-dome.js`).
- Checked: walk-flood A, B, F, C, D, E, G 100 % (`reachtest.mjs dome 0,104 1.0`, `reachcheck.py`); 14/14 vomitories
  (`vomtest.mjs`); the walker climbs all 10 gates' stairs to the concourse; renders of the poles' aisles, the gates, the
  pillars, the fence and the stand's slope from the front row and from the back.
- Outfield: the map has no gate-pattern blocks there (the outfield's F blocks have only the pillar notches at circles
  52-58).
- Regenerate: `cd pipeline && python3 td_gen.py` (only if `td_upper.py` changed), `python3 td_build.py` (5 minutes), `python3 pipeline/mkdata.py td && node build.mjs`, and to the
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
