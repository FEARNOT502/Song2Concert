# Tokyo Dome: where the upper tiers end at the foul poles, from the seating map.
#
# The map's C blocks (the balcony: C01 on the 1B side round to C97 on the 3B
# side) run on past the foul poles, along the outfield stand's sides, to 130.4
# degrees from the dome's centre (0 towards home). The 2nd floor's D blocks
# run on past D04 (89.7-93.7 degrees) through D03, D02 and D01 to 112 degrees,
# each with fewer rows than the last (D04 5, D03 3), and the E blocks past E09
# (66-70 degrees) through E08, E07 and E06 to 84 degrees (8, 5 and 3 rows).
# The 3B side is the same, mirrored: D49, D50, D51; E44, E45, E46.
#
# Behind the poles the 1st floor's stand is the outfield's, 13.5 m deep with
# 4 m between it and the building's wall, where at the lines it was 25-37 m
# with a passage behind. The balcony and the 2nd floor, which stand out over
# the lines' stand by 9 and 12.3 m from its back, would end up hanging over
# the outfield's fence (td_gen.py keeps them 6 m off the field). So beyond the
# poles their fronts move back over the outfield stand's rear.
#
# How far is read off the edge of that 6 m rule: along each ray from the
# dome's centre, the smallest distance from the 1st floor's hull (td_gen.py's
# dOut, negative inside the hull) that is more than 6 m from the field is
# -15.4 at 90 degrees, -11.4 at 94, -8.7 at 98, -6.4 at 102, and between -6.3
# and -7.4 from there to 130. A tier whose front stands at `front` (-9.0 the
# balcony, -12.3 the 2nd floor) has to move back by that less `front`, and
# a quarter metre more, to have its first row on the right side of the line.
# The tables below are those amounts with a little to spare (0.3-0.5 m), a
# monotone cubic run through their points. (Easing the fronts in over 10
# degrees, as a first version did, left the balcony's first two rows and D03's
# first two out of the rule: D03 nearly empty, the balcony's front rows
# missing from 99 to 105 degrees.)
import numpy as np
from scipy.interpolate import PchipInterpolator

C_END = 130.4        # the balcony's last block, C01 / C97
D_END = 112.0        # the 2nd floor's last block, D01 / D51

# degrees from the dome's centre (either side) -> metres the front has moved back
_TC = ((95.0, 0.0), (96.0, 0.1), (97.0, 0.4), (98.0, 0.95), (99.0, 1.6), (100.0, 2.2), (101.0, 2.7),
       (102.0, 3.05), (103.0, 3.2), (104.0, 3.2), (112.0, 3.2), (124.0, 2.8), (130.4, 2.6))
_TD = ((89.7, 0.0), (91.0, 0.1), (92.0, 0.5), (93.0, 1.0), (94.0, 1.65), (95.0, 2.3), (96.0, 2.95),
       (97.0, 3.55), (98.0, 4.15), (99.0, 4.85), (100.0, 5.45), (101.0, 5.95), (102.0, 6.35),
       (103.0, 6.45), (104.0, 6.5), (112.0, 6.5))
def _ease(table):
    xs, ys = zip(*table); f = PchipInterpolator(xs, ys)
    return lambda th: f(np.clip(np.abs(th), xs[0], xs[-1]))
tau_c = _ease(_TC)   # the balcony's front
tau_d = _ease(_TD)   # the 2nd floor's D rows

# (from, to degrees on the 1B side, rows): D03, D02, D01; E08, E07, E06
DX = [(94.3, 98.2, 3), (98.7, 104.1, 3), (104.0, 112.0, 3)]
EX = [(71.0, 74.9, 8), (75.6, 79.6, 5), (80.5, 84.1, 3)]
def both_sides(blocks):
    return [(-t1, -t0, r) for t0, t1, r in blocks] + list(blocks)
