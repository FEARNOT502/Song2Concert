# Tokyo Dome: the upper tiers' outfield ends and the wall behind them, on td_build.py's finished stands.
#
# What stands there (photographs from the 2nd floor behind home, Commons "Interior of Tokyo Dome 201904a/b.jpg",
# the left pole's corner): the 2nd floor's stand gets shallower block by block out to the poles, a plain wall
# straight up from behind its top rows to the ring; past the pole its last three rows and the balcony under them
# run on over the back of the outfield stand, and both decks, each with its own front band, stop on one line at
# a column. There the wall over them turns square out to the building's own wall, which goes on round the
# outfield a few metres further back.
#
# What td_build.py leaves: the 2nd floor's rows stop at one column (49, 58) and the balcony goes on to the next
# (the aisle column between 49 and 50) under nothing, its concourse standing behind it as a box with its roof
# in the open; the wall behind the upper tier is drawn by the viewer from each block's own back edge, in steps,
# with a fin from it at each end of E.
#
# What is laid here:
#   upperWall   one wall each side of the house behind the 2nd floor's top rows, a smooth line in plan that is
#               never in front of a row, from behind home out to where the balcony ends, then square out to the
#               building: {pts, y0 (a foot for each point)}; it stands to the ring
#   levels D    the deck carried on from where its seats stop to where the balcony stops (no seats on it), and
#               the level strips between a block's top row and that wall, where the wall's line leaves one
#   rimS        the 2nd floor's front band carried on with the deck
#   upperEnds   the end wall across both decks at that line: {a, b, y0, y1}
import numpy as np
from scipy.ndimage import gaussian_filter1d, minimum_filter1d, maximum_filter1d
from shapely.geometry import Polygon
from shapely.ops import unary_union

O = np.array([0.0, -60.0])       # the dome's centre: angles from it, 0 towards home
BIN = 0.25                       # degrees
E_END = 84.3                     # where the 2nd floor's upper rows (E) stop
WALL_BACK = 0.15                 # the wall behind a top row's back edge
EASE = 3.0                       # degrees: a notch in the rows' back narrower than this is closed by the wall's line
D_FOOT = 18.1                    # the wall's foot past E's end: under the deck (as td_build.py's)
END_Y0 = 13.6                    # the end wall across the decks: from under the balcony's front band
PARAPET = 1.05

def _ring_pts(ring, step=0.2):
    a = np.asarray(ring, float); b = np.roll(a, -1, axis=0); out = []
    for p, q in zip(a, b):
        n = max(1, int(np.ceil(np.hypot(*(q - p)) / step))); t = np.arange(n)[:, None] / n; out.append(p + (q - p) * t)
    return np.vstack(out)
def _profile(rows, nb, far=True):
    """over the rows' outlines: for each angle's bin the furthest (or nearest) radius, and the height of the row it is on"""
    r = np.full(nb, np.nan); y = np.full(nb, np.nan)
    for row in rows:
        for poly in row['polys']:
            P = _ring_pts(poly[0]); d = P - O
            th = np.degrees(np.arctan2(d[:, 0], d[:, 1])); rr = np.hypot(d[:, 0], d[:, 1])
            k = np.round((th + 180.0) / BIN).astype(int) % nb
            for kk, rv in zip(k, rr):
                if np.isnan(r[kk]) or (rv > r[kk] if far else rv < r[kk]) or (abs(rv - r[kk]) < 0.02 and row['y'] > y[kk]): r[kk] = rv; y[kk] = row['y']
    return r, y
def _xy(th, r): t = np.radians(th); return np.c_[O[0] + np.sin(t) * r, O[1] + np.cos(t) * r]
def _poly_out(P): return [[[round(float(x), 2), round(float(z), 2)] for x, z in P]]

def apply(data):
    L = {l['name']: l for l in data['levels']}
    nb = int(round(360 / BIN)); TH = np.arange(nb) * BIN - 180.0
    rE, yE = _profile(L['E']['rows'], nb); rD, yD = _profile(L['D']['rows'], nb)
    rCb, _ = _profile(L['C']['rows'], nb); rCf, _ = _profile(L['C']['rows'], nb, far=False)
    yD0 = min(r['y'] for r in L['D']['rows'])
    aD = float(np.nanmax(np.abs(TH[~np.isnan(rD)]))); aC = float(np.nanmax(np.abs(TH[~np.isnan(rCb)])))
    a_end = aC + 0.15
    out = Polygon(data['outer'][0][0]).buffer(0)
    new_rows, walls, ends = [], [], []
    rimS = [list(r) for r in data['rimS']]
    for sg in (-1, 1):
        m = (TH * sg >= 0.0) & (TH * sg <= a_end)
        th = np.abs(TH[m]); o = np.argsort(th); th = th[o]
        e, ye, dd, yd, cb, cf = (v[m][o] for v in (rE, yE, rD, yD, rCb, rCf))
        isE = (th <= E_END) & ~np.isnan(e)
        # the furthest tread at each angle, and its height: E's top row; past E's end D's (the wall there never in front of
        # the balcony's back wall under it); past D's end the deck carried on over the balcony
        far = np.where(isE, e, np.fmax(dd, cb - 0.25)); top = np.where(isE, ye, np.where(np.isnan(yd), yD0, yd))
        ok = ~np.isnan(far); far = np.interp(th, th[ok], far[ok]); top = np.where(ok, top, yD0)
        # the wall's line: over every tread, eased until it turns no faster than a few degrees' run allows
        # (a block's notch closed, then the corners eased a few times over: the line keeps the stand's own sweep round
        # the pole, where an envelope eased until it stops moving would stand metres behind the rows)
        kq = int(EASE / BIN) | 1
        w = minimum_filter1d(maximum_filter1d(far + WALL_BACK, kq, mode='nearest'), kq, mode='nearest')
        for _ in range(3): w = np.maximum(w, gaussian_filter1d(w, 0.8 / BIN, mode='nearest'))
        foot = np.where(isE, top - 1.2, D_FOOT); foot = minimum_filter1d(foot, int(3.0 / BIN) | 1, mode='nearest')
        P = _xy(th * sg, w)
        # (square out to the building's wall where the decks end)
        pe = _xy(np.array([a_end * sg]), np.array([w[-1]]))[0]; u = (pe - O) / np.hypot(*(pe - O))
        t = 0.0
        while t < 30.0 and out.contains(Polygon([pe + u * t + d for d in ((0.05, 0), (0, 0.05), (-0.05, 0))])): t += 0.1
        walls.append({'pts': [[round(float(x), 2), round(float(z), 2)] for x, z in P], 'y0': [round(float(v), 2) for v in foot],
                      'ret': [[round(float(v), 2) for v in pe], [round(float(v), 2) for v in pe + u * (t + 0.3)]]})
        # the level strips between a top row and the wall, one for each run of the same height
        gap = w - far; i = 0; n = len(th)
        while i < n:
            if th[i] > aD or gap[i] < 0.3: i += 1; continue
            j = i
            while j + 1 < n and th[j + 1] <= aD and gap[j + 1] >= 0.2 and abs(top[j + 1] - top[i]) < 0.01: j += 1
            if j > i:
                a = _xy(th[i:j + 1] * sg, far[i:j + 1] - 0.3); b = _xy(th[i:j + 1] * sg, w[i:j + 1] + 0.05)
                g = Polygon(np.vstack([a, b[::-1]])).buffer(0)
                if g.area > 0.3: new_rows.append({'r': 0, 'y': round(float(top[i]), 3), 'y0': round(float(top[i]) - 0.6, 3), 'polys': [_poly_out(np.array(q.exterior.coords)[:-1])[0:1] for q in getattr(g, 'geoms', [g]) if q.area > 0.05]})
            i = j + 1
        # the deck on from D's last seats to the balcony's end, from the balcony's front line to the wall
        k = (th >= aD - 0.4) & ~np.isnan(cf)
        fr = np.interp(th[k], th[~np.isnan(cf)], cf[~np.isnan(cf)])
        a = _xy(th[k] * sg, fr - 0.05); b = _xy(th[k] * sg, w[k] + 0.05)
        a = np.vstack([a, _xy(np.array([a_end * sg]), np.array([fr[-1] - 0.05]))]); b = np.vstack([b, _xy(np.array([a_end * sg]), np.array([w[-1] + 0.05]))])
        g = Polygon(np.vstack([a, b[::-1]])).buffer(0)
        new_rows.append({'r': 0, 'y': round(yD0, 3), 'y0': round(yD0 - 0.5, 3), 'polys': [_poly_out(np.array(q.exterior.coords)[:-1])[0:1] for q in getattr(g, 'geoms', [g]) if q.area > 0.05]})
        # the 2nd floor's front band with it: on along the balcony's front, to the same end
        rim = rimS[0 if sg < 0 else 1]; ends_ = (rim[0], rim[-1]); at_end = 0 if np.hypot(*(np.array(rim[0]) - O)) > 0 and abs(np.degrees(np.arctan2(rim[0][0] - O[0], rim[0][1] - O[1]))) > 60 else -1
        a_rim = abs(np.degrees(np.arctan2(rim[at_end][0] - O[0], rim[at_end][1] - O[1])))
        kk = (th > a_rim + 0.3) & ~np.isnan(cf)
        ext = _xy(np.append(th[kk], a_end) * sg, np.append(np.interp(th[kk], th[~np.isnan(cf)], cf[~np.isnan(cf)]), fr[-1]))
        ext = [[round(float(x), 2), round(float(z), 2)] for x, z in ext[::8].tolist() + [ext[-1].tolist()]]
        rimS[0 if sg < 0 else 1] = (ext[::-1] + rim) if at_end == 0 else (rim + ext)
        # the end wall across the two decks
        p0 = _xy(np.array([a_end * sg]), np.array([fr[-1] - 0.45]))[0]
        ends.append({'a': [round(float(v), 2) for v in p0], 'b': [round(float(v), 2) for v in pe], 'y0': END_Y0, 'y1': round(yD0 + PARAPET, 2)})
    data = dict(data)
    D = dict(L['D']); D['rows'] = list(D['rows']) + [r for r in new_rows if r['polys']]
    data['levels'] = [D if l['name'] == 'D' else l for l in data['levels']]
    data['rimS'] = rimS
    data['upperWall'] = walls; data['upperEnds'] = ends; data['upperWalls'] = []
    # (td_build.py's landing at D's end, a step over the deck that now runs on past it: gone)
    data['floors'] = [f for f in data['floors'] if not (abs(f['y'] - 19.15) < 0.01 and sum(Polygon(p[0]).area for p in f['polys']) < 40)]
    print('upper tier: D\'s seats end at %.1f, the balcony and both decks at %.1f degrees; wall %d points a side, level strips behind top rows %d (%.0f m2), deck carried on %.0f m2 a side'
          % (aD, a_end, len(walls[0]['pts']), len(new_rows) - 2, sum(Polygon(p[0]).area for r in new_rows[:-1] for p in r['polys'] if r is not new_rows[len(new_rows) // 2 - 1]), Polygon(new_rows[-1]['polys'][0][0]).area))
    return data
