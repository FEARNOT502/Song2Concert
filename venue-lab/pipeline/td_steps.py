# Tokyo Dome: the half steps up the 1st floor's rear aisles (B), after td_tidy.
#
# td_build.py gives the 1st floor's levels (A, B) no `steps`: their aisles are drawn as the bare treads, so
# behind home, where B's rows rise up to 0.28 m each, an aisle reads as a flight of knee-high steps. Real
# aisles there take an intermediate step per row; this lays one wherever the riser up to the next row is
# more than RISE_MIN, in the format the other levels' steps have ({y, y0, polys}, as level D's):
#
#   aisles     where a row's seats break off and the same row's seats go on again, between RISE_MIN-high
#              rows: the gap between the two end seats (within a block, or across the boundary of two blocks
#              whose rows meet), AISLE_MIN..AISLE_MAX wide between the seats' centres
#   step       across the aisle's width (the gap less a seat), on the back half of the tread, up against the
#              riser to the next row: half that riser high
#   skipped    where there is no next row behind the tread (the back row, or a walkway: rows td_build.py marks
#              r = -1), at the gates' pits and their stairs (`gateRails`), and near the rooms' walls
#
# Works on whatever rows and seats the pickle has: nothing here depends on where they are. Steps on every
# other row carry `light: False` (stands.js puts an aisle light on each step: this keeps those to hundreds).
import math, base64
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.strtree import STRtree

LEVELS = ('B',)
RISE_MIN = 0.2       # a riser over this takes a half step
AISLE_MIN = 0.75     # the gap between two seats' centres that makes an aisle (a seat pitch is ~0.5)
AISLE_MAX = 2.4
SEAT_W = 0.5         # what a seat takes of the gap
SAME_ROW = 0.12      # two blocks' rows meet across an aisle if their treads are this close in height
GATE_CLEAR = 0.9     # no step this close to a gate's partitions
ALIGN = 0.25         # an aisle's two seats at most this far apart front to back
O = np.array([0.0, -60.0])


def _seats(L):
    S = np.frombuffer(base64.b64decode(L['seats']), dtype='<i2').reshape(-1, 4).astype(float)
    sk = L.get('seatScale', 10)
    return S[:, 0] / sk, S[:, 1] / sk, S[:, 2].astype(int), S[:, 3]


def _poly(p):
    g = Polygon(p[0], p[1:])
    return g if g.is_valid else g.buffer(0)


def _steps(data, L):
    rows = [r for r in L['rows']]
    geoms = [[_poly(p) for p in r['polys']] for r in rows]
    flat, owner = [], []
    for i, gs in enumerate(geoms):
        for g in gs:
            flat.append(g); owner.append(i)
    tree = STRtree(flat)
    by_r = {}
    for i, r in enumerate(rows):
        if r.get('r', -1) >= 0: by_r.setdefault(r['r'], i)
    X, Z, R, Y = _seats(L)
    yaw = np.radians(Y)
    seat_y = np.array([rows[by_r[r]]['y'] if r in by_r else np.nan for r in R])
    pts = np.stack([X, Z], 1)
    # gates: their partitions' plan lines
    gates = [LineString([(g[0], g[1]), (g[2], g[3])]) for g in L.get('gateRails', [])]
    gtree = STRtree(gates) if gates else None
    walls = [LineString([(w[0], w[1]), (w[2], w[3])]) for w in (data.get('rooms') or {}).get('walls', [])]
    wtree = STRtree(walls) if walls else None
    # each row record's seats, ordered along it
    recs = {}
    for k, r in enumerate(R):
        recs.setdefault(r, []).append(k)
    aisles = []
    seen = set()
    for r, ks in recs.items():
        if r not in by_r: continue
        ks = np.array(ks)
        c = pts[ks].mean(0)
        t = pts[ks] - c
        if len(ks) > 1:
            _, _, vt = np.linalg.svd(t, full_matrices=False); tan = vt[0]
        else:
            f = np.array([math.sin(yaw[ks[0]]), math.cos(yaw[ks[0]])]); tan = np.array([f[1], -f[0]])
        order = ks[np.argsort(t @ tan)]
        # gaps inside the record
        for a, b in zip(order[:-1], order[1:]):
            d = np.linalg.norm(pts[b] - pts[a])
            if AISLE_MIN <= d <= AISLE_MAX: aisles.append((a, b))
        # and across to the next block's same row, at each end
        for e, sgn in ((order[0], -1), (order[-1], 1)):
            dv = pts - pts[e]
            dist = np.hypot(dv[:, 0], dv[:, 1])
            ok = (R != r) & (np.abs(seat_y - seat_y[e]) < SAME_ROW) & (dist >= AISLE_MIN) & (dist <= AISLE_MAX) & ((dv @ tan) * sgn > 0.5 * dist)
            if not ok.any(): continue
            j = int(np.argmin(np.where(ok, dist, np.inf)))
            # the nearest seat of the neighbour must be its own row's end, not a seat inside a longer gap
            key = tuple(sorted((int(e), j)))
            if key in seen: continue
            seen.add(key); aisles.append((e, j))
    out = []
    used = []
    mids = np.array([(pts[a] + pts[b]) / 2 for a, b in aisles]) if aisles else np.zeros((0, 2))
    for a, b in aisles:
        pa, pb = pts[a], pts[b]
        m = (pa + pb) / 2
        gap = float(np.linalg.norm(pb - pa))
        tan = (pb - pa) / gap
        f = np.array([math.sin(yaw[a]) + math.sin(yaw[b]), math.cos(yaw[a]) + math.cos(yaw[b])])
        f /= np.linalg.norm(f) or 1
        # (the two seats side by side along the row, not a block's end and the next block's, a row apart)
        if abs((pb - pa) @ f) > ALIGN: continue
        back = np.array([tan[1], -tan[0]])
        if back @ f > 0: back = -back
        # (an aisle runs on up through the rows: the same gap on a row in front or behind, not a row's odd wide gap)
        dv = mids - m
        if not np.any((np.abs(dv @ tan) < 0.6) & (np.abs(dv @ back) > 0.4) & (np.abs(dv @ back) < 1.8)): continue
        mid = Point(m)
        # the tread the aisle crosses: the row polygon under its middle, at the height of the seats' rows
        cand = [k for k in tree.query(mid) if flat[k].covers(mid)]
        cand = [k for k in cand if rows[owner[k]].get('r', -1) >= 0 and abs(rows[owner[k]]['y'] - min(seat_y[a], seat_y[b])) < SAME_ROW + 0.01]
        if not cand: continue
        k0 = cand[0]; row = rows[owner[k0]]; y = row['y']
        # the tread's front and back along the aisle
        ln = LineString([m - 2.5 * back, m + 2.5 * back])
        x = flat[k0].intersection(ln)
        ts = [float((np.array(q) - m) @ back) for g in (x.geoms if hasattr(x, 'geoms') else [x]) for q in g.coords] if not x.is_empty else []
        if not ts: continue
        t0, t1 = min(ts), max(ts)
        # the next row behind: the first tread, higher, met going on back from this one's back edge
        probe = LineString([m + (t1 - 0.3) * back, m + (t1 + 0.9) * back])
        nxt = None
        for k in tree.query(probe):
            if owner[k] == owner[k0] or not flat[k].intersects(probe): continue
            rk = rows[owner[k]]
            if rk['y'] <= y + 0.02: continue
            xi = flat[k].intersection(probe)
            s = min(float((np.array(q) - m) @ back) for g in (xi.geoms if hasattr(xi, 'geoms') else [xi]) for q in g.coords)
            if nxt is None or s < nxt[0]: nxt = (s, rk)
        if nxt is None: continue
        s_next, rk = nxt
        if rk.get('r', -1) < 0: continue                  # a walkway, not a row
        rise = rk['y'] - y
        if rise <= RISE_MIN or rise > 0.6: continue
        back_edge = min(t1, s_next)
        depth = back_edge - t0
        if depth < 0.5: continue
        w = min(max(gap - SEAT_W, 0.6), 1.4)
        # (the gates' pits and stairs, the rooms' walls: none near)
        foot = Point(m + (back_edge - depth / 4) * back)
        if gtree is not None and any(gates[k].distance(foot) < GATE_CLEAR + w / 2 for k in gtree.query(foot.buffer(GATE_CLEAR + w))): continue
        if wtree is not None and any(walls[k].distance(foot) < 0.6 for k in wtree.query(foot.buffer(1.0))): continue
        # (one step per place: two aisle pairs can name the same gap)
        c = m + (back_edge - depth / 4) * back
        if any(abs(u[0] - y) < 0.01 and np.hypot(*(u[1] - c)) < 0.5 for u in used): continue
        used.append((y, c))
        s0, s1 = back_edge - depth / 2, back_edge - 0.02
        hw = w / 2
        quad = [m + s0 * back - hw * tan, m + s0 * back + hw * tan, m + s1 * back + hw * tan, m + s1 * back - hw * tan]
        st = {'y': round(y + rise / 2, 3), 'y0': round(y, 3), 'polys': [[[round(float(q[0]), 2), round(float(q[1]), 2)] for q in quad]]}
        out.append((row.get('r', 0), st))
    # (an aisle light on every other row's step)
    steps = []
    for r, st in out:
        if r % 2: st['light'] = False
        steps.append(st)
    return steps


def apply(data):
    for L in data['levels']:
        if L['name'] not in LEVELS: continue
        L['steps'] = list(L.get('steps', [])) + _steps(data, L)
    return data


if __name__ == '__main__':
    import pickle, sys, collections
    d = pickle.load(open('td_pre.pkl', 'rb'))
    import td_post
    for name in td_post.STAGES:
        if name == 'td_steps': continue
        d = __import__(name).apply(d)
    d = apply(d)
    for L in d['levels']:
        if L['name'] in LEVELS:
            st = L['steps']
            print(L['name'], len(st), 'steps,', sum(s.get('light', True) for s in st), 'lit;', collections.Counter(round(s['y'] - s['y0'], 2) for s in st).most_common(6))
