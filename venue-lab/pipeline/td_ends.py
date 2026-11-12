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
#   upperDecks  the 2nd floor's deck carried on from where its seats stop to where the balcony's concourse stops
#               (no seats on it): {pts, y, y0}
#   levels D    the level strips between a block's top row and that wall, where the wall's line leaves one; the
#               low walls td_build.py stood behind the top rows (D, E) go
#   rimS        the 2nd floor's front band carried on with the deck
#   upperEnds   the end wall across both decks at that line: {a, b, y0, y1}
import numpy as np
from scipy.ndimage import gaussian_filter1d, minimum_filter1d, maximum_filter1d
from shapely.geometry import Polygon
from shapely.ops import unary_union
from td_upper import D_END

O = np.array([0.0, -60.0])       # the dome's centre: angles from it, 0 towards home
BIN = 0.25                       # degrees
D_CUT = 104.0                    # user photo review: remove the extra terminal D01/D51 block on both wings
E_END = 84.3                     # where the 2nd floor's upper rows (E) stop
WALL_BACK = 0.15                 # the wall behind a top row's back edge
EASE = 3.0                       # degrees: a notch in the rows' back narrower than this is closed by the wall's line
SLANT = 2.0                      # metres a degree: the fastest the wall's line comes in towards the field
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

def _cut_D(data):
    """the 2nd floor's stand stops at D_CUT: its rows, steps, low walls, seats and front band past it go"""
    import base64
    def sector(sg): return Polygon([tuple(O)] + [tuple(_xy(np.array([t * sg]), np.array([200.0]))[0]) for t in np.arange(D_CUT, 150.1, 2.0)])
    cut = unary_union([sector(-1), sector(1)])
    def th(x, z): return abs(np.degrees(np.arctan2(x - O[0], z - O[1])))
    D = dict(next(l for l in data['levels'] if l['name'] == 'D')); rows = []
    for r in D['rows']:
        g = unary_union([Polygon(p[0], p[1:]).buffer(0) for p in r['polys']]).difference(cut)
        polys = [[[[round(float(x), 2), round(float(z), 2)] for x, z in list(rg.coords)[:-1]] for rg in [q.exterior] + list(q.interiors)] for q in getattr(g, 'geoms', [g]) if q.geom_type == 'Polygon' and q.area > 0.02]
        if polys: rows.append({**r, 'polys': polys})
    D['rows'] = rows
    def first(st):
        q = st['polys'][0]
        while isinstance(q[0][0], list): q = q[0]
        return np.mean(q, axis=0)
    D['steps'] = [st for st in D['steps'] if th(*first(st)) <= D_CUT - 0.3]
    D['rails'] = [r for r in D['rails'] if th((r[0] + r[2]) / 2, (r[1] + r[3]) / 2) <= D_CUT]
    sk = D.get('seatScale', 10); S = np.frombuffer(base64.b64decode(D['seats']), '<i2').reshape(-1, 4)
    keep = np.abs(np.degrees(np.arctan2(S[:, 0] / sk - O[0], S[:, 1] / sk - O[1]))) <= D_CUT - 0.25
    D['seats'] = base64.b64encode(S[keep].tobytes()).decode('ascii'); D.pop('labels', None)
    data = dict(data); data['levels'] = [D if l['name'] == 'D' else l for l in data['levels']]
    data['rimS'] = [[q for q in rim if th(*q) <= D_CUT] for rim in data['rimS']]
    print('2nd floor cut at %.1f degrees: seats %d -> %d' % (D_CUT, len(S), int(keep.sum())))
    return data

def apply(data):
    data = _cut_D(data)
    L = {l['name']: l for l in data['levels']}
    nb = int(round(360 / BIN)); TH = np.arange(nb) * BIN - 180.0
    rE, yE = _profile(L['E']['rows'], nb); rD, yD = _profile(L['D']['rows'], nb); rDn, _ = _profile(L['D']['rows'], nb, far=False)
    rCb, _ = _profile(L['C']['rows'], nb); rCf, _ = _profile(L['C']['rows'], nb, far=False)
    yD0 = min(r['y'] for r in L['D']['rows'])
    aD = float(np.nanmax(np.abs(TH[~np.isnan(rD)]))); aC = float(np.nanmax(np.abs(TH[~np.isnan(rCb)])))
    # the balcony's concourse behind it: a box as high as 20.3, its front wall (the doors) right behind the balcony's back
    # row. Where D's rows are over it they hide it; past them the wall over the deck stands in front of its face
    rBox = np.full(nb, np.nan)
    for x0, z0, x1, z1, y0, y1 in data['rooms']['walls']:
        if abs(y0 - 16.2) > 0.01 or y1 < 20.0: continue
        for t in np.linspace(0.0, 1.0, max(2, int(np.hypot(x1 - x0, z1 - z0) / 0.2) + 1)):
            dx, dz = x0 + (x1 - x0) * t - O[0], z0 + (z1 - z0) * t - O[1]; r_ = np.hypot(dx, dz); k_ = int(round((np.degrees(np.arctan2(dx, dz)) + 180.0) / BIN)) % nb
            if abs(TH[k_]) > 100.0 and not r_ >= rBox[k_]: rBox[k_] = r_
    aBox = float(np.nanmax(np.abs(TH[~np.isnan(rBox)])))
    a_end = aC          # (clear of the box's own end wall)
    box_face = data['rooms'].get('thick', 0.5) / 2 + 0.2 + 0.05           # (the box wall's half thickness, this wall's, and a little)
    out = Polygon(data['outer'][0][0]).buffer(0)
    new_rows, walls, ends, decks = [], [], [], []
    rimS = [list(r) for r in data['rimS']]; rimCS = [list(r) for r in data['rimCS']]
    for sg in (-1, 1):
        m = (TH * sg >= 0.0) & (TH * sg <= a_end)
        th = np.abs(TH[m]); o = np.argsort(th); th = th[o]
        e, ye, dd, yd, cb, cf, bx, dn = (v[m][o] for v in (rE, yE, rD, yD, rCb, rCf, rBox, rDn))
        # (the box's front as one eased line)
        # (at a door the front wall has no full-height piece and the nearest is the box's back wall: those bins opened away)
        okb = ~np.isnan(bx); bxs = np.interp(th, th[okb], bx[okb]); kb = int(2.5 / BIN) | 1
        bxs = gaussian_filter1d(maximum_filter1d(minimum_filter1d(bxs, kb, mode='nearest'), kb, mode='nearest'), 0.5 / BIN, mode='nearest')
        isE = (th <= E_END) & ~np.isnan(e)
        # the furthest tread at each angle, and its height: E's top row; past E's end D's (the wall there never in front of
        # the balcony's back wall under it); past D's end the deck carried on over the balcony
        far = np.where(isE, e, np.fmax(dd, cb - 0.25)); top = np.where(isE, ye, np.where(np.isnan(yd), yD0, yd))
        ok = ~np.isnan(far); far = np.interp(th, th[ok], far[ok]); top = np.where(ok, top, yD0)
        past = th > aD - 0.2
        far = np.where(past, bxs - box_face - WALL_BACK, far)
        # the wall's line: over every tread, eased until it turns no faster than a few degrees' run allows
        # (a block's notch closed, then the corners eased a few times over: the line keeps the stand's own sweep round
        # the pole, where an envelope eased until it stops moving would stand metres behind the rows)
        kq = int(EASE / BIN) | 1
        w = minimum_filter1d(maximum_filter1d(far + WALL_BACK, kq, mode='nearest'), kq, mode='nearest')
        # (and where the rows' back steps in, the line comes in on a slant, no faster than the stand's own sweep round
        # the pole does: a square jog in the wall shows from the house as a fin up to the ring)
        for step in (1, -1):
            for i in (range(1, len(w)) if step > 0 else range(len(w) - 2, -1, -1)): w[i] = max(w[i], w[i - step] - SLANT * BIN)
        for _ in range(3): w = np.maximum(w, gaussian_filter1d(w, 0.6 / BIN, mode='nearest'))
        w[past] = np.maximum(gaussian_filter1d(w, 0.6 / BIN, mode='nearest'), far + WALL_BACK)[past]
        # (a strip behind a top row lies no higher than the lowest top row near it: a step down behind the seats, never a kerb up)
        top = minimum_filter1d(top, int(2.0 / BIN) | 1, mode='nearest')
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
        # (the balcony's front as a line: its last bins hold only the corner of its end, so the line is carried on from just short of it)
        okf = ~np.isnan(cf) & (th < aC - 0.6); cl = np.polyfit(th[okf & (th > aC - 4.0)], cf[okf & (th > aC - 4.0)], 1)
        cfl = np.where(th < aC - 0.6, np.interp(th, th[okf], cf[okf]), np.polyval(cl, th))
        fr = cfl[th >= aD - 0.4]
        rc = data['rimCS'][0 if sg < 0 else 1]; ac0, ac1 = (abs(np.degrees(np.arctan2(q[0] - O[0], q[1] - O[1]))) for q in (rc[0], rc[-1]))
        pc = [round(float(v), 2) for v in _xy(np.array([a_end * sg]), np.array([fr[-1]]))[0]]
        rimCS[0 if sg < 0 else 1] = ([pc] + rc) if ac0 > ac1 else (rc + [pc])
        # the end walls: the balcony's at its concourse's end; the 2nd floor's where its seats stop (its deck and front
        # band stop there too: the balcony runs on alone under the wall)
        p0 = _xy(np.array([a_end * sg]), np.array([fr[-1] - 0.45]))[0]
        ends.append({'a': [round(float(v), 2) for v in p0], 'b': [round(float(v), 2) for v in pe], 'y0': END_Y0, 'y1': 16.2 + PARAPET})
        aE = aD + 0.12; okn = ~np.isnan(dn)
        rim = data['rimS'][0 if sg < 0 else 1]; re = max((rim[0], rim[-1]), key=lambda q: abs(np.degrees(np.arctan2(q[0] - O[0], q[1] - O[1]))))
        q0 = _xy(np.array([aE * sg]), np.array([np.hypot(re[0] - O[0], re[1] - O[1]) - 0.3]))[0]; q1 = _xy(np.array([aE * sg]), np.array([np.interp(aE, th, w) + 0.1]))[0]
        ends.append({'a': [round(float(v), 2) for v in q0], 'b': [round(float(v), 2) for v in q1], 'y0': round(yD0 - 1.5, 2), 'y1': round(yD0 + PARAPET, 2)})
    data = dict(data)
    D = dict(L['D']); D['rows'] = list(D['rows']) + [r for r in new_rows if r['polys']]
    # (the low walls td_build.py stood behind the top rows: the wall stands there now)
    from shapely.geometry import LineString, Point
    wl = [LineString(w_['pts']) for w_ in walls]; E = dict(L['E']); gone = 0
    for lv in (D, E):
        keep = [r_ for r_ in lv['rails'] if min(l_.distance(Point((r_[0] + r_[2]) / 2, (r_[1] + r_[3]) / 2)) for l_ in wl) > 0.7]
        gone += len(lv['rails']) - len(keep); lv['rails'] = keep
    data['levels'] = [D if l['name'] == 'D' else E if l['name'] == 'E' else l for l in data['levels']]
    data['rimS'] = rimS; data['rimCS'] = rimCS
    data['upperWall'] = walls; data['upperEnds'] = ends; data['upperDecks'] = decks; data['upperWalls'] = []
    # (td_build.py's landing at D's end, a step over the deck that now runs on past it: gone)
    data['floors'] = [f for f in data['floors'] if not (abs(f['y'] - 19.15) < 0.01 and sum(Polygon(p[0]).area for p in f['polys']) < 40)]
    print('upper tier: D\'s seats end at %.1f, the balcony at %.1f, its concourse and both decks at %.1f degrees; wall %d points a side; strips behind top rows %d, %.0f m2; low walls behind top rows gone %d'
          % (aD, aC, a_end, len(walls[0]['pts']), len(new_rows), sum(Polygon(p[0]).area for r in new_rows for p in r['polys']), gone))
    return data
