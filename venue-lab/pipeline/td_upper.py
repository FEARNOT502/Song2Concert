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
# The fronts those tables give run as an S round each pole: in from the lines' arc, a
# stretch nearly straight along the pole's corner (the front stood up to 3 m nearer the
# field than a smooth curve at 90-98 degrees: a bulge towards the field between the
# balcony's run along the lines and its run along the outfield), then in again along the
# outfield wall. These amounts (metres, added to the table's) put each front on the
# smoothest curve, r(theta) from the dome's centre, that stays 6.5 m off the field (the
# least bending of r(theta) above that limit, the lines' arc and the outfield's run
# held): the balcony up to 2.1 m back, the 2nd floor up to 2.5 m, and both 1.3 m forward at
# 84 degrees (they stand 20 m off the field there).
_FC = ((80.0, 0.00), (81.0, -0.18), (82.0, -0.51), (83.0, -0.92), (84.0, -1.26), (85.0, -1.22),
      (86.0, -0.64), (87.0, -0.14), (88.0, 0.29), (89.0, 0.66), (90.0, 0.97), (91.0, 1.24),
      (92.0, 1.47), (93.0, 1.69), (94.0, 1.88), (95.0, 2.06), (96.0, 2.13), (97.0, 2.00),
      (98.0, 1.61), (99.0, 1.13), (100.0, 0.67), (101.0, 0.29), (102.0, 0.05), (103.0, -0.03),
      (104.0, 0.00))
_FD = ((80.0, 0.00), (81.0, -0.19), (82.0, -0.49), (83.0, -0.83), (84.0, -0.95), (85.0, -0.29),
      (86.0, 0.30), (87.0, 0.83), (88.0, 1.32), (89.0, 1.77), (90.0, 2.19), (91.0, 2.50),
      (92.0, 2.52), (93.0, 2.41), (94.0, 2.15), (95.0, 1.88), (96.0, 1.62), (97.0, 1.39),
      (98.0, 1.14), (99.0, 0.79), (100.0, 0.48), (101.0, 0.23), (102.0, 0.04), (103.0, 0.06),
      (104.0, 0.00))
def _ease(table, fix=()):
    xs, ys = zip(*table); f = PchipInterpolator(xs, ys)
    if not fix: return lambda th: f(np.clip(np.abs(th), xs[0], xs[-1]))
    cx, cy = zip(*fix); g = PchipInterpolator(cx, cy)
    return lambda th: f(np.clip(np.abs(th), xs[0], xs[-1])) + g(np.clip(np.abs(th), cx[0], cx[-1]))
tau_c = _ease(_TC, _FC)   # the balcony's front
tau_d = _ease(_TD, _FD)   # the 2nd floor's D rows

# (from, to degrees on the 1B side, rows): D03, D02, D01; E08, E07, E06
DX = [(94.3, 98.2, 3), (98.7, 104.1, 3), (104.0, 112.0, 3)]
EX = [(71.0, 74.9, 8), (75.6, 79.6, 5), (80.5, 84.1, 3)]
def both_sides(blocks):
    return [(-t1, -t0, r) for t0, t1, r in blocks] + list(blocks)
