# Tokyo Dome: the excite seats (エキサイトシート), laid on td_build.py's finished stands.
#
# What they are (the official seating map, td/td_vec.json; photographs from the 2nd floor behind home,
# Commons "Interior of Tokyo Dome 201904a/b.jpg"): on each side a low stand of its own on the field, in
# foul territory in front of the 1st floor's wall from about A03 to A15 (A35 to A47), blocks G03-G15 and
# G35-G47. Its rows stand a few low steps one over the next, a padded fence about chest high to a seated
# row along its front, a square end wall at the home end. The front is not one line: along the six blocks
# nearest home it runs parallel to the stand, then a diagonal out to the three deepest blocks (G08-G06,
# G42-G44), then one long diagonal straight back in to the 1st floor's wall short of the pole (the map dots that
# part in as steps: G05, G04, G03, whose first rows the chart gives one seat each, cut by the diagonal).
# The 1st floor's own wall goes on behind it; between the back row and that wall is a walkway (the map's
# blocks are 6.4 to 10.3 m deep for four to six rows), with steps up through the wall to the stand's aisles.
#
# What is laid here, replacing what td_build.py made of them (a strip against the stand, its footprint
# still what the 1st floor's wall is drawn round):
#   levels G    rows (treads), seats, each seat's block and height
#   field       the ground inside the 1st floor's wall less the two stands
#   exciteFence the fence along each stand's front and round its ends: {pts, h}
#   exciteAisles, exciteGates   the steps up to the 1st floor's aisles and the gaps in its wall for them
import json, base64, numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

# The 1B side's blocks as the map draws them (metres: home plate at 0,0, centre field towards -z), read off
# td/td_vec.json: G05-G15 its closed outlines; G04 and G03 from the dotted line of their fronts and the two
# lines between them. The 3B side (G35-G47) is the same mirrored (the map's own differ by under 0.2 m).
MAP_1B = {
    'G15': [[32.37, -13.31], [30.03, -10.41], [35.98, -5.57], [38.43, -8.58]],
    'G14': [[34.81, -16.26], [32.59, -13.36], [38.65, -8.63], [40.88, -11.36]],
    'G13': [[38.10, -20.65], [34.92, -16.31], [39.88, -12.36], [43.49, -17.09]],
    'G12': [[41.21, -24.88], [38.26, -20.76], [43.66, -17.20], [46.72, -21.48]],
    'G11': [[44.49, -29.38], [41.38, -24.93], [46.88, -21.54], [50.00, -25.99]],
    'G10': [[47.72, -33.78], [44.66, -29.44], [50.17, -26.05], [53.28, -30.61]],
    'G09': [[48.28, -38.84], [45.88, -35.17], [53.45, -30.66], [56.01, -34.45]],
    'G08': [[49.55, -43.46], [47.00, -39.62], [56.17, -34.56], [58.79, -38.51]],
    'G07': [[52.23, -47.35], [49.67, -43.51], [58.90, -38.56], [61.63, -42.85]],
    'G06': [[54.95, -51.47], [52.34, -47.35], [61.74, -42.90], [64.41, -47.35]],
    'G05': [[59.23, -54.70], [56.73, -50.80], [64.52, -47.41], [67.02, -51.69]],
    'G04': [[64.21, -57.80], [61.62, -53.87], [67.21, -51.62], [69.70, -56.11]],
    'G03': [[67.80, -61.72], [65.63, -57.46], [69.70, -56.11], [71.75, -61.03]],
}
ORDER = ['G%02d' % k for k in range(15, 2, -1)]          # home to pole
DIAG_OUT = ('G10', 'G08')        # the fence runs straight from the first's pole-side corner to the second's home-side corner (across G09)
DIAG_IN = ('G06', 'G03')         # and from the first's pole-side corner straight to the 1st floor's wall (across G05, G04, G03)
END_GAP = 0.7                    # along that wall, between the diagonal's end and the tunnel mouth's jamb
ROW0, PITCH = 0.85, 1.00         # the first row's seats behind the block's front line, and a row's depth (wide seats with room to pass)
STEP_BACK = 0.45                 # a row's tread ends this far behind its seats' middles
Y0, RISE = 0.30, 0.20            # the first row's floor over the field, and a row's step
SEAT_W = 0.58
SEAT_MIN = 0.44
FENCE_H = 1.15                   # over the field: a padded fence about 0.85 m over the first row's floor
FENCE_CLEAR, WALL_CLEAR = 0.55, 0.45
GATES = (('G14', 'G13'), ('G12', 'G11'), ('G10', 'G09'), ('G08', 'G07'), ('G06', 'G05'))   # steps up to the stand's aisle between these
STAIR_W, STAIR_GO, STAIR_RISE = 1.0, 0.28, 0.19
MAX_CLIMB = 2.6                  # no steps where the stand's front stands higher than this over the walkway

def _u(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
def _x(p, d, q, e):
    """where the line p + t d meets the line q + s e"""
    A = np.array([[d[0], -e[0]], [d[1], -e[1]]]); t, _ = np.linalg.solve(A, np.asarray(q, float) - np.asarray(p, float)); return np.asarray(p, float) + t * np.asarray(d, float)
def _geom(polys): return unary_union([Polygon(p[0], p[1:]).buffer(0) for p in polys])
def _polys(g):
    out = []
    for q in getattr(g, 'geoms', [g]):
        if q.geom_type != 'Polygon' or q.area < 0.01: continue
        q = q.simplify(0.01)
        out.append([[[round(float(x), 2), round(float(z), 2)] for x, z in list(r.coords)[:-1]] for r in [q.exterior] + list(q.interiors)])
    return out

def _side(sg, chart, FN, standY, mouth=None):
    """one side's stand: sg +1 the 1B side (x > 0), -1 the 3B side"""
    name = (lambda n: n) if sg > 0 else (lambda n: 'G%02d' % (50 - int(n[1:])))
    B = {}
    for n in ORDER:
        P = np.array(MAP_1B[n], float) * [sg, 1.0]
        # the front edge: the one nearest the foul line (|x| + z least); f0 its home-side end
        e = min(range(4), key=lambda i: (abs(P[i][0]) + P[i][1] + abs(P[(i + 1) % 4][0]) + P[(i + 1) % 4][1]))
        f = [P[e], P[(e + 1) % 4]]; b = [P[(e + 3) % 4], P[(e + 2) % 4]]
        if f[0][1] < f[1][1]: f, b = f[::-1], b[::-1]
        al = _u(f[1] - f[0]); nb = np.array([-al[1], al[0]])
        if nb @ (b[0] - f[0]) < 0: nb = -nb
        B[n] = dict(f0=f[0], f1=f[1], b0=b[0], b1=b[1], al=al, nb=nb, rows=[len(q) for q in chart[name(n)]], nums=chart[name(n)])
    # the lines between the blocks (and at the two ends): a point on each and its direction back to the stand
    L = [(B[ORDER[0]]['f0'], _u(B[ORDER[0]]['b0'] - B[ORDER[0]]['f0']))]
    for p, c in zip(ORDER, ORDER[1:]):
        L.append(((B[p]['b1'] + B[c]['b0']) / 2, _u(_u(B[p]['b1'] - B[p]['f1']) + _u(B[c]['b0'] - B[c]['f0']))))
    L.append((B[ORDER[-1]]['f1'], _u(B[ORDER[-1]]['b1'] - B[ORDER[-1]]['f1'])))
    for i, n in enumerate(ORDER):
        b = B[n]; b['c0'] = _x(b['f0'], b['al'], *L[i]); b['c1'] = _x(b['f0'], b['al'], *L[i + 1]); b['i'] = i
    # the fence's line: block front to block front, the two diagonals straight across what lies between
    chain = []; skip = set()
    for a, z in (DIAG_OUT, DIAG_IN):
        ia, iz = ORDER.index(a), ORDER.index(z)
        skip |= set(ORDER[ia + 1:iz + (1 if (a, z) == DIAG_IN else 0)])
    for n in ORDER:
        if n in skip: continue
        chain += [B[n]['c0'], B[n]['c1']]
    # (the long diagonal runs straight on into the 1st floor's wall, no return at its end: it meets the wall just on the
    # home side of the tunnel mouth under A02, the same place on the 3B side, where there is no tunnel)
    wallE = FN.exterior
    Wp = np.array(MAP_1B['G03'][3], float) * [sg, 1.0]
    if mouth is not None:
        mp, mu, mw = np.array(mouth['p'], float) * [sg, 1.0], np.array(mouth['u'], float) * [sg, 1.0], float(mouth['w'])
        mv = np.array([-mu[1], mu[0]]); e = max((mp + mv * mw / 2, mp - mv * mw / 2), key=lambda q: q[1])      # (the mouth's home-side jamb)
        s0 = wallE.project(Point(*e))
        Wp = max((np.array(wallE.interpolate((s0 + ds) % wallE.length).coords[0]) for ds in (-END_GAP, END_GAP)), key=lambda q: q[1])
    Wq = wallE.interpolate(wallE.project(Point(*Wp))); W = np.array([Wq.x, Wq.y])
    chain.append(W)
    ch = [chain[0]]
    for p in chain[1:]:
        if np.hypot(*(p - ch[-1])) > 0.3: ch.append(p)
        else: ch[-1] = (ch[-1] + p) / 2             # (two fronts that meet within a foot's length: one corner)
    chain = ch
    # the stand's ground: behind that line, between the end lines, inside the 1st floor's wall
    back = [W + L[-1][1] * 16.0] + [p + d * 16.0 for p, d in L[-2:0:-1]] + [L[0][0] + L[0][1] * 16.0]
    X = Polygon([tuple(p) for p in chain] + [tuple(p) for p in back]).buffer(0).intersection(FN)
    X = max(getattr(X, 'geoms', [X]), key=lambda g: g.area)
    def to_wall(p, d):
        ip = LineString([p, p + d * 16.0]).intersection(wallE)
        pts = [np.array(q.coords[0]) for q in getattr(ip, 'geoms', [ip]) if not q.is_empty and q.geom_type == 'Point']
        return min(pts, key=lambda q: np.hypot(*(q - p))) if pts else p + d * 6.0
    fence = [to_wall(chain[0], L[0][1]) + L[0][1] * 0.15] + chain[:-1] + [W + _u(W - chain[-2]) * 0.15]
    fenceL = LineString(fence)
    rows, seats, cells = [], [], {}
    for i, n in enumerate(ORDER):
        b = B[n]; (p0, d0), (p1, d1) = L[i], L[i + 1]
        cell = Polygon([p0 - d0 * 24.0, p1 - d1 * 24.0, p1 + d1 * 16.0, p0 + d0 * 16.0]).buffer(0).intersection(X)
        if cell.is_empty: continue
        cells[n] = cell; nr = len(b['rows']); ys = [Y0 + RISE * r for r in range(nr)]; b['ys'] = ys
        al, nb, o = b['al'], b['nb'], b['c0']
        def strip(d_lo, d_hi):
            return Polygon([o + al * -30 + nb * d_lo, o + al * 30 + nb * d_lo, o + al * 30 + nb * d_hi, o + al * -30 + nb * d_hi])
        for r in range(nr):
            lo = -30.0 if r == 0 else ROW0 + (r - 1) * PITCH + STEP_BACK
            hi = ROW0 + r * PITCH + STEP_BACK if r < nr - 1 else 30.0
            g = cell.intersection(strip(lo, hi))
            if not g.is_empty: rows.append({'r': r, 'y': round(ys[r], 3), 'y0': 0.0, 'polys': _polys(g)})
        b['lines'] = (p0, d0, p1, d1)
    # the steps up to the stand's aisles, through gaps in its wall
    def deckY(q):
        pt = Point(*q)
        for n, cell in cells.items():
            if cell.buffer(0.05).contains(pt):
                b = B[n]; d = float((np.asarray(q) - b['c0']) @ b['nb'])
                r = int(np.clip(np.floor((d - ROW0 - STEP_BACK) / PITCH) + 1, 0, len(b['ys']) - 1)); return b['ys'][r]
        return None
    aisles, gates = [], []
    for a, c in GATES:
        i = ORDER.index(c); p, d = L[i]; T = to_wall(p - d * 3.0, d)
        y1 = standY(T, d)
        if y1 is None: continue
        v = np.array([-d[1], d[0]])
        best = None
        for nst in range(2, 20):
            foot = T - d * (nst * STAIR_GO)
            ya = [y for y in (deckY(foot + v * s * 0.3 - d * 0.1) for s in (-1, 1)) if y is not None]
            if not ya: break
            y0 = min(ya)
            if y1 - y0 <= nst * STAIR_RISE + 0.02: best = (foot, y0); break
        if best is None or y1 - best[1] > MAX_CLIMB: continue
        foot, y0 = best
        aisles.append({'a': [round(float(x), 2) for x in foot], 'b': [round(float(x), 2) for x in T + d * 0.25], 'w': STAIR_W, 'y0': round(float(y0), 2), 'y1': round(float(y1), 2)})
        gates.append({'p': [round(float(x), 2) for x in T], 'u': [round(float(d[0]), 4), round(float(d[1]), 4)], 'w': STAIR_W + 0.15})
    st = unary_union([LineString([s['a'], s['b']]).buffer(STAIR_W / 2 + 0.3, cap_style=2) for s in aisles]) if aisles else Polygon()
    # the seats: each row along the block's own front, between the lines either side, the chart's seats in it from
    # the home-side end (its numbers rise away from home; a short row is the field end's, cut by the fence's
    # diagonal), a seat the block's widest row's share of the room (SEAT_W at most); where the fence, the wall or the
    # steps up to the stand take the row's room, its seats close up (to SEAT_MIN) on what is left of it
    for n in ORDER:
        if n not in cells: continue
        b = B[n]; cell = cells[n]; al, nb, o = b['al'], b['nb'], b['c0']; p0, d0, p1, d1 = b['lines']
        nmax = max(b['rows'])
        for r in range(len(b['rows'])):
            d = ROW0 + r * PITCH
            ta = float((_x(o + nb * d, al, p0, d0) - o) @ al); tb = float((_x(o + nb * d, al, p1, d1) - o) @ al)
            w = min(SEAT_W, (abs(tb - ta) - 1.0) / nmax); mid = (ta + tb) / 2
            lo, hi = min(ta, tb), max(ta, tb)
            ok = [t for t in np.arange(lo, hi, 0.05) if (lambda pt: cell.buffer(-0.2).contains(pt) and fenceL.distance(pt) >= FENCE_CLEAR
                  and wallE.distance(pt) >= WALL_CLEAR and st.distance(pt) > 0.25)(Point(*(o + nb * d + al * t)))]
            if not ok: continue
            t0 = max(mid - (nmax - 1) / 2 * w, ok[0] + 0.0); t1 = ok[-1]
            nn = len(b['nums'][r]); ww = w if (t1 - t0) >= (nn - 1) * w - 1e-6 else max(SEAT_MIN, (t1 - t0) / max(nn - 1, 1))
            for k, sn in enumerate(b['nums'][r]):
                t = t0 + k * ww
                if t > t1 + 0.02: break
                q = o + nb * d + al * t
                seats.append((q[0], q[1], r, float(np.degrees(np.arctan2(-nb[0], -nb[1]))), name(n), b['ys'][r], sn))
    # (no block of one seat: what the diagonal leaves of G03)
    cnt = {}
    for s in seats: cnt[s[4]] = cnt.get(s[4], 0) + 1
    seats = [s for s in seats if cnt[s[4]] > 1]
    return dict(X=X, rows=rows, seats=seats, fence=[[round(float(x), 2) for x in p] for p in fence], aisles=aisles, gates=gates)

def apply(data, chart_path='td/td_rows_real.json'):
    real = json.load(open(chart_path))
    # each block's rows as the chart numbers them, its own (the two sides differ a little: G15 one seat a row, G35 four)
    chart = {k: [[sn for lo, hi in v['rows'][str(r + 1)] for sn in range(lo, hi + 1)] for r in range(len(v['rows']))] for k, v in real.items() if k[0] == 'G'}
    FN = Polygon(data['fence'][0][0]).buffer(0)
    LA = next(l for l in data['levels'] if l['name'] == 'A')
    Ar = [(_geom(r['polys']), float(r['y'])) for r in LA['rows']]; tree = STRtree([g for g, _ in Ar])
    def standY(T, d):
        """the 1st floor's tread just behind its wall at T, going back along d"""
        for t in np.arange(0.3, 4.0, 0.15):
            q = Point(*(np.asarray(T, float) + d * t))
            ys = [Ar[int(i)][1] for i in tree.query(q) if Ar[int(i)][0].contains(q)]
            if ys: return min(ys)
        return None
    mouth = next((t for t in data.get('tunnels', []) if t.get('gate')), None)
    if mouth is not None: mouth = {**mouth, 'p': [abs(mouth['p'][0]), mouth['p'][1]], 'u': [abs(mouth['u'][0]), mouth['u'][1]]}
    sides = [_side(sg, chart, FN, standY, mouth) for sg in (1, -1)]
    seats = [s for sd in sides for s in sd['seats']]
    S = np.array([[round(s[0] * 50), round(s[1] * 50), s[2], round(s[3])] for s in seats], '<i2')
    G = {'name': 'G', 'D': PITCH, 'h0': Y0, 'rise': RISE, 'hs': [round(Y0 + RISE * k, 3) for k in range(8)],
         'rows': [r for sd in sides for r in sd['rows']], 'steps': [], 'holes': [], 'voms': [],
         'seats': base64.b64encode(S.tobytes()).decode('ascii'), 'seatScale': 50, 'gblocks': [s[4] for s in seats], 'gnums': [s[6] for s in seats], 'seatY': [round(s[5], 3) for s in seats],
         'rails': [], 'walls': []}
    data = dict(data)
    data['levels'] = [G if l['name'] == 'G' else l for l in data['levels']]
    field = FN.difference(unary_union([sd['X'] for sd in sides]).buffer(0.02))
    field = max(getattr(field, 'geoms', [field]), key=lambda g: g.area).simplify(0.02)
    data['field'] = [[[[round(float(x), 2), round(float(z), 2)] for x, z in list(field.exterior.coords)[:-1]]]]
    data['exciteFence'] = [{'pts': sd['fence'], 'h': FENCE_H} for sd in sides]
    data['exciteAisles'] = [a for sd in sides for a in sd['aisles']]
    data['exciteGates'] = [g for sd in sides for g in sd['gates']]
    for k in ('exciteOpen', 'exciteFront'): data.pop(k, None)
    by = {}
    for s in seats: by[s[4]] = by.get(s[4], 0) + 1
    print('excite seats', len(seats), 'of the chart\'s', sum(len(q) for v in chart.values() for q in v), {k: (by.get(k, 0), sum(len(q) for q in chart[k])) for k in sorted(chart)})
    print('excite stands: %.0f m2 each, fence %d points, steps up to the stand' % (sides[0]['X'].area, len(sides[0]['fence'])), [(a['y0'], a['y1']) for a in data['exciteAisles']])
    return data
