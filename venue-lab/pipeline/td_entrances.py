# Tokyo Dome: the entrances as the official seating map marks them (the
# numbered circles, td/entrances.json, in the map's own points). Numbered
# clockwise from the right-field foul pole, on tickets "通路" (aisle): the 1st
# floor 1-58 (1-24 down the 1B side to home, 25-48 up the 3B side, 49-58 across
# the outfield), the upper deck 1-14. The number is the digit word drawn inside
# each circle (td/td_vec.json), under 1 pt from its centre.
#
# On the 1st floor each circle stands at the head of the aisle between two
# blocks, a metre and a half from the back of each; on the upper deck it marks
# the notch in one E block's front edge where the vomitory comes through, the
# deck drawn out of scale, so only its angle about the dome's centre is used.
import json, numpy as np

HM = np.array([579.2, 441.7]); S = 2.996        # the map's home plate and scale (points per metre)
UPPER_R = 125.0                                 # further than this from the dome's centre: the upper deck's

def load(O, path='td/entrances.json', vec='td/td_vec.json'):
    """-> (f1, f2): f1 = [(number, (x, z) in metres)] for the 1st floor's 58,
    sorted by number; f2 = [(number, angle in degrees about O, 0 towards home,
    + towards 1B)] for the upper deck's 14, sorted by angle."""
    ent = json.load(open(path)); words = json.load(open(vec))['words']
    wc = np.array([[(w[0] + w[2]) / 2, (w[1] + w[3]) / 2] for w in words]); txt = [w[4] for w in words]
    O = np.asarray(O, float); f1, f2 = [], []
    for e in ent:
        c = np.array(e['c']); d = np.hypot(*(wc - c).T); j = int(np.argmin(d))
        assert d[j] < 3.0 and txt[j].isdigit(), ('no number in the circle', e)
        m = (c - HM) / S; n = int(txt[j])
        if np.hypot(*(m - O)) < UPPER_R: f1.append((n, (float(m[0]), float(m[1]))))
        else: f2.append((n, float(np.degrees(np.arctan2(m[0] - O[0], m[1] - O[1])))))
    f1.sort(); f2.sort(key=lambda t: t[1])
    assert [n for n, _ in f1] == list(range(1, 59)) and sorted(n for n, _ in f2) == list(range(1, 15))
    return f1, f2
