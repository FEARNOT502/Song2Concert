# Tokyo Dome: tidying on the finished stands, after td_excite and td_ends.
#
#   upper vomitories  The 2nd floor's upper rows (E) are entered by 14 pits from the cross aisle in front of them
#                     (y 24.0), each running up into the rows to the concourse under them. td_build.py traces each pit
#                     from the raster: its rows are cut a little ragged (notches and bites out of the rows beside
#                     it and behind it, each ringed by a rail; seats left standing on its edge), and its side walls
#                     come from the rows it found beside it, in pieces with gaps where a notch was. Here, round
#                     each pit, the rows are drawn again as the bands the rows beside it run in, the pit cut out
#                     of them square (as deep as the first row with headroom under it: the mouth's lintel), the
#                     rows under that lintel cleared over the pit's width, the rails ringing the old notches, the
#                     seats in or against the pit, the half steps in it and the concourse's walls in its way go;
#                     the pit gets `wall`, a parapet of its own round its three sides that stands.js draws as one
#                     piece: {t0: top at the front, t1: top at the back, roof: the lintel's underside}.
#   aisle columns     The outfield stand's (F) un-numbered columns at the heads of its aisles: each on its aisle's
#                     middle line (halfway between the two blocks' end seats), on the top tread, the sides mirrored.
#   screen columns    The two td_build.py stood either side of the backscreen (53, 54) taken away: no photograph has them.
#   back wall         The outfield's concourse walls, traced as raster stairs, traced again smooth.
#   columns squared   Every column turned so its faces are square to the rows (or the walls) it stands at.
#   outfield voms     A shallow vomitory at every other outfield aisle (49-52, 55-58): a pit down through rows 15-21
#                     with stairs up it to the concourse, a mouth in the back wall, the numbered column in the middle
#                     of the mouth at its front, the pit roofed from the mouth back (stands.js's vomParts `wall`;
#                     dome.js draws the soffit and the passage's green walls). The columns plain grey, the 1st
#                     floor's size and finish, no plates or banners (the user's call).
#   balcony columns   The columns standing up through the balcony (C) to carry the 2nd floor (D), where D now stops
#                     short of them (td_ends.D_CUT): ended under the balcony's rows.
import math, base64
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union
from shapely import affinity

O = np.array([0.0, -60.0])
PAR = 1.0            # the parapet over the treads (stands.js's vomParts)
WALL_T = 0.35        # the parapet's thickness (stands.js's vomParts)
HEAD = 1.85          # the headroom over the pit's floor the mouth needs (under row 15's tread: rows 11-14 are the pit, as the chart's notches)
SIDE = 2.6           # how far either side of the pit the rows are drawn again
BEHIND = 1.6         # and how far behind its mouth
SEAT_CLEAR = 0.24    # a seat's centre at least this far from the pit's side


def _frame(v):
    p = np.array(v['p'], float); u = np.array(v['u'], float); u /= np.linalg.norm(u); w = np.array([-u[1], u[0]])
    loc = lambda g: affinity.affine_transform(g, [w[0], w[1], u[0], u[1], -w @ p, -u @ p])
    wld = lambda g: affinity.affine_transform(g, [w[0], u[0], w[1], u[1], p[0], p[1]])
    st = lambda q: (float((np.asarray(q) - p) @ w), float((np.asarray(q) - p) @ u))
    return p, u, w, loc, wld, st


def _polys(g):
    if g.is_empty: return []
    return [q for q in (g.geoms if hasattr(g, 'geoms') else [g]) if isinstance(q, Polygon) and q.area > 0.004]


def _out(q):
    q = q.simplify(0.01)
    ring = lambda r: [[round(x, 2), round(z, 2)] for x, z in list(r.coords)[:-1]]
    return [ring(q.exterior)] + [ring(h) for h in q.interiors]


def _bands(rows_loc, hw, tmax):
    """each row's front and back across the pit, fitted to where it runs beside it: {row index: (f(s), b(s))}"""
    smp = {}
    for s in [sg * (hw + SIDE + d) for sg in (-1, 1) for d in (0.3, 0.9, 1.5, 2.1)]:
        ln = LineString([(s, -2.0), (s, tmax + 2.0)])
        for k, g in rows_loc.items():
            x = g.intersection(ln)
            if x.is_empty: continue
            ts = [c[1] for gg in (x.geoms if hasattr(x, 'geoms') else [x]) for c in gg.coords]
            smp.setdefault(k, []).append((s, min(ts), max(ts)))
    out = {}
    for k, a in smp.items():
        a = np.array(a)
        if len(a) < 2: continue
        deg = 2 if len(set(np.sign(a[:, 0]))) > 1 and len(a) >= 4 else (1 if np.ptp(a[:, 0]) > 0.5 else 0)
        out[k] = (np.poly1d(np.polyfit(a[:, 0], a[:, 1], deg)), np.poly1d(np.polyfit(a[:, 0], a[:, 2], deg)), len(set(np.sign(a[:, 0]))) > 1)
    return out


def _vom(data, L, v):
    p, u, w, loc, wld, st = _frame(v)
    hw = v['w'] / 2
    rows = L['rows']
    rows_loc = {}
    for k, r in enumerate(rows):
        g = unary_union([Polygon(q[0], q[1:]).buffer(0) for q in r['polys']])
        g = loc(g)
        if g.distance(Point(0, v['L'] / 2)) < 15: rows_loc[k] = g
    whole = unary_union(list(rows_loc.values()))
    bands = _bands(rows_loc, hw, v['L'] + BEHIND)
    S = np.linspace(-hw - SIDE, hw + SIDE, 41)
    # the mouth: at the front of the first row (from the cross aisle up) with the headroom over the pit's floor
    ks = sorted((k for k in bands if rows[k]['y0'] - v['y'] >= HEAD), key=lambda k: bands[k][0](0))
    k_roof = ks[0]
    Lc = round(float(np.mean([bands[k_roof][0](s) for s in (-hw, 0, hw)])), 2)
    roof = rows[k_roof]['y0']
    env = box(-hw - SIDE, -2.0, hw + SIDE, Lc + BEHIND)
    # where the rows run: a row beside the pit on both sides runs on across it; one on one side only (the
    # level's ends) as far as its own outline does, its notches closed
    hull = whole.buffer(1.6, join_style=2).buffer(-1.6, join_style=2).intersection(env)
    filled = []
    pit = box(-hw, -2.0, hw, Lc)
    mouth = box(-hw, Lc - 0.01, hw, Lc + BEHIND)
    for k, g in rows_loc.items():
        new = g.difference(env)
        if k in bands:
            f, b, both = bands[k]
            band = Polygon([(s, f(s)) for s in S] + [(s, b(s)) for s in S[::-1]]).buffer(0).intersection(env if both else hull)
            filled.append(band)
            new = new.union(band)
        new = new.difference(pit)
        if rows[k]['y0'] < roof - 0.01: new = new.difference(mouth)
        rows[k]['polys'] = [_out(wld(q)) for q in _polys(new)]
    # the rows' tops beside the pit and over its mouth, for the parapet: one even slope from the front row's
    # top to the top of the row over the mouth, never less than PAR - 0.05 over a tread beside it
    fr = [k for k in bands if bands[k][0](hw) < Lc - 0.05 and bands[k][1](hw) > 0.0]
    h_front = min(rows[k]['y'] for k in fr) + PAR
    h_back = rows[k_roof]['y'] + PAR
    t0, t1 = h_front, h_back
    for k in fr:
        tf = max(0.0, float(min(bands[k][0](hw), bands[k][0](-hw))))
        need = rows[k]['y'] + PAR - 0.05
        at = t0 + (t1 - t0) * tf / Lc
        if at < need: t0 += (need - at) / max(1e-6, 1 - tf / Lc)
    sides = []
    for sg in (-1, 1):
        for k in sorted(fr, key=lambda k: bands[k][0](sg * hw)):
            a = max(0.0, float(bands[k][0](sg * hw))); nxt = [bands[j][0](sg * hw) for j in fr if bands[j][0](sg * hw) > a + 0.1]
            b = min([Lc] + nxt)
            sides.append([sg, round(a, 2), round(float(b), 2), rows[k]['y']])
    v.update({'L': Lc, 'T': 0.0, 'roof': None, 'sides': sides,
              'wall': {'t0': round(t0, 2), 't1': round(t1, 2), 'roof': roof}})
    # the half steps in the pit or under the mouth's lintel go
    keep = []
    for s_ in L['steps']:
        g = loc(Polygon(s_['polys'][0]).buffer(0))
        if g.intersects(pit.buffer(0.05)) or (g.intersects(mouth) and s_['y0'] < roof): continue
        keep.append(s_)
    L['steps'] = keep
    # the rails ringing the old notches (on the level's own edges, they stay)
    inner = unary_union(filled).buffer(-0.12)
    L['rails'] = [r for r in L['rails'] if not inner.contains(loc(Point((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)))]
    # the concourse's walls in the pit or its mouth: cut back to its sides
    clear = box(-hw, -2.0, hw, Lc + BEHIND)
    R = data['rooms']
    for key in ('walls', 'thinWalls'):
        out = []
        for wl in R[key]:
            if wl[5] <= v['y'] + 0.02 or wl[4] >= roof - 0.05:       # (the ceiling's risers over the lintel stay)
                out.append(wl); continue
            seg = loc(LineString([wl[:2], wl[2:4]]))
            if not seg.intersects(clear.buffer(0.02)):
                out.append(wl); continue
            rest = seg.difference(clear.buffer(0.02))
            for gg in (rest.geoms if hasattr(rest, 'geoms') else [rest]):
                if gg.is_empty or gg.length < 0.05: continue
                (x0, z0), (x1, z1) = list(wld(gg).coords)[0], list(wld(gg).coords)[-1]
                out.append([round(x0, 2), round(z0, 2), round(x1, 2), round(z1, 2), wl[4], wl[5]])
        R[key] = out
    # the concourse's front wall, to the mouth's sides: where it stood back from them, a piece on to each
    fronts = []
    for wl in R['walls'] + R['thinWalls']:
        if abs(wl[4] - v['y']) > 0.05: continue
        (s0, a0), (s1, a1) = st(wl[:2]), st(wl[2:4])
        if abs(a0 - Lc) < 0.6 and abs(a1 - Lc) < 0.6 and min(abs(s0), abs(s1)) < hw + SIDE: fronts.append((s0, s1, (a0 + a1) / 2, wl[5]))
    for sg in (-1, 1):
        mine = [f for f in fronts if min(sg * f[0], sg * f[1]) >= hw - 0.05]
        if not mine: continue
        near = min(mine, key=lambda f: min(sg * f[0], sg * f[1]))
        e = min(sg * near[0], sg * near[1])
        if e > hw + 0.03:
            a = wld(LineString([(sg * hw, Lc), (sg * e, Lc)]))
            (x0, z0), (x1, z1) = a.coords[0], a.coords[-1]
            R['thinWalls'].append([round(x0, 2), round(z0, 2), round(x1, 2), round(z1, 2), v['y'], near[3]])
    return pit, Lc


def _seats(L, voms):
    sc = L.get('seatScale', 10)
    a = np.frombuffer(base64.b64decode(L['seats']), '<i2').reshape(-1, 4)
    keep = np.ones(len(a), bool)
    xy = a[:, :2].astype(float) / sc
    for v, Lc in voms:
        p, u, w, *_ = _frame(v)
        q = xy - p; s = q @ w; t = q @ u
        keep &= ~((np.abs(s) < v['w'] / 2 + SEAT_CLEAR) & (t > -1.0) & (t < Lc + 0.25))
    L['seats'] = base64.b64encode(a[keep].astype('<i2').tobytes()).decode('ascii')
    return int((~keep).sum())


def _head_columns(data):
    """the outfield's columns between the vomitories' (the un-numbered ones, `color` and `aisle`): each on the middle
    line of the aisle between its two blocks (_aisle_lines: halfway between the blocks' end seats, rows 1-14), as deep
    in the stand as the vomitories' columns (its front face at the front of row 15), standing in the aisle with the way
    up it either side; its foot on the lowest tread under it; the two sides then made each other's mirror image
    (x -> -x), the pair's positions averaged. Returns each column's move (m)."""
    F = next(l for l in data['levels'] if l['name'] == 'F')
    lines = _aisle_lines()
    r15 = [(r, unary_union([Polygon(q[0], q[1:]).buffer(0) for q in r['polys']])) for r in F['rows'] if r['r'] % 22 == 14]
    cols = [c for c in data['pillars'] if c.get('aisle') and 'color' in c]
    for c in cols: c['rx'], c['rz'] = OUT_RX, OUT_RZ
    moved = []
    for c in cols:
        pc = np.array([c['x'], c['z']])
        nrm = lambda ln: np.array([-ln[2][1], ln[2][0]])
        names, m, d = min(lines, key=lambda ln: abs(float((pc - ln[1]) @ nrm(ln))))
        # (as deep in the stand as the vomitories' columns: its front face just behind the front of row 15, where
        # the pits begin, standing in the aisle (the chart's rows 15-21 stop a seat or two further short of these
        # aisles than rows 1-14 do), the way up the aisle on either side of it)
        f15 = [g for r, g in r15 if g.distance(Point(*pc)) < 14]
        x = unary_union(f15).intersection(LineString([m - d * 30, m + d * 30])) if f15 else None
        # (where the aisle is the seam between two runs of rows laid apart, the poles' blocks, row 15 may not cross
        # its line: the column's mirror image across the house stands for it, below)
        if x is None or x.is_empty: c['_q'] = pc; c['_names'] = names; c['_ok'] = False; continue
        t15 = min(float((np.array(p) - m) @ d) for gg in (x.geoms if hasattr(x, 'geoms') else [x]) for p in gg.coords)
        q = m + d * (t15 + c['rz'] + 0.05)
        c['_q'] = q; c['_names'] = names; c['_ok'] = True
    for c in cols:
        mates = sorted((o for o in cols if o is not c and o['x'] * c['x'] < 0), key=lambda o: np.hypot(o['x'] + c['x'], o['z'] - c['z']))[:1]
        mates = [o for o in mates if np.hypot(o['x'] + c['x'], o['z'] - c['z']) < 4.0]
        if not mates: q = c['_q']
        elif not c['_ok'] and mates[0]['_ok']: q = mates[0]['_q'] * [-1, 1]
        elif c['_ok'] and not mates[0]['_ok']: q = c['_q']
        else: q = np.array([np.sign(c['_q'][0]) * (abs(c['_q'][0]) + abs(mates[0]['_q'][0])) / 2, (c['_q'][1] + mates[0]['_q'][1]) / 2])
        c['_q2'] = q
    for c in cols:
        q = c.pop('_q2'); c.pop('_q'); c.pop('_ok'); names = c.pop('_names')
        moved.append(('|'.join(names), round(float(np.hypot(q[0] - c['x'], q[1] - c['z'])), 2)))
        c['x'], c['z'] = round(float(q[0]), 2), round(float(q[1]), 2); c['color'] = OUT_GREY
        # (its foot on the lowest tread under it: no gap under it where it stands across two rows)
        foot = Point(c['x'], c['z']).buffer(max(c.get('rz', c['r']), c.get('rx', c['r'])))
        ys = [r['y'] for r in F['rows'] for q_ in r['polys'] if Polygon(q_[0], q_[1:]).buffer(0).intersects(foot)]
        if ys: c['y0'] = round(min(ys), 3)
    return moved


def _aisle_columns(data):
    F = next(l for l in data['levels'] if l['name'] == 'F')
    S = np.frombuffer(base64.b64decode(F['seats']), '<i2').reshape(-1, 4).astype(float); S[:, :2] /= F.get('seatScale', 10)
    U = [Polygon(s['polys'][0]).buffer(0) for s in F['steps']]
    moved = []
    for c in data['pillars']:
        if not c.get('aisle') or 'color' in c: continue      # (the outfield's own: _head_columns)
        p = np.array([c['x'], c['z']]); R = np.linalg.norm(p - O); ur = (p - O) / R; ut = np.array([ur[1], -ur[0]])
        # the aisle's middle across a few metres either side of the column's radius: the gap between the seats
        # beside it, and the half steps' own middle, a line fitted to each
        q = S[:, :2] - p; rr = q @ ur; ss = q @ ut
        gap = []
        for b0 in np.arange(-3.0, 3.0, 0.5):
            m = (rr > b0) & (rr < b0 + 0.5) & (np.abs(ss) < 4)
            Ls = np.sort(ss[m])
            if len(Ls) < 4: continue
            g = np.diff(Ls); k = int(np.argmax(g))
            if g[k] > 1.2: gap.append((rr[m].mean(), (Ls[k] + Ls[k + 1]) / 2))
        st = unary_union([g for g in U if g.distance(Point(*p)) < 6]).buffer(0.05)
        mid = []
        for r0 in np.arange(-2.0, 2.01, 0.25):
            x = st.intersection(LineString([p + ur * r0 - ut * 4, p + ur * r0 + ut * 4]))
            if x.is_empty: continue
            c_ = np.array([xy for gg in (x.geoms if hasattr(x, 'geoms') else [x]) for xy in gg.coords]); sv = (c_ - p) @ ut
            if np.ptp(sv) > 1.2: mid.append((r0, (sv.min() + sv.max()) / 2))
        # (the half steps are the aisle as it is seen: theirs where they run full width, else the seats' gap)
        off = float(np.polyfit(*np.array(mid if len(mid) >= 3 else gap).T, 1)[1]) if (len(mid) >= 3 or len(gap) >= 2) else 0.0
        # (a column at the aisle's head, behind the last row (td_build.py: the map's aisle middle), stays there: the
        # rows behind row 14 stop short of the aisles, so the gap between their seats is no guide to the aisle)
        if 'color' in c and abs(off) > 0.6: off = 0.0
        # along the row: round the dome's centre, at the same radius
        th = math.atan2(*(p - O)) + math.atan2(off, R)
        q2 = O + R * np.array([math.sin(th), math.cos(th)])
        moved.append((round(off, 3), [round(float(q2[0]), 2), round(float(q2[1]), 2)]))
        dx, dz = float(q2[0] - c['x']), float(q2[1] - c['z'])
        c['x'], c['z'] = round(float(q2[0]), 2), round(float(q2[1]), 2)
        # (its facing turned with it)
        if 'ax' in c:
            a = math.atan2(c['ax'], c['az']) + math.atan2(off, R)
            c['ax'], c['az'] = round(math.sin(a), 3), round(math.cos(a), 3)
        # its number plate, if a sign stands on it, goes with it
        for s_ in data.get('signs', []):
            if abs(s_['x'] - (c['x'] - dx)) < 0.05 and abs(s_['z'] - (c['z'] - dz)) < 0.05: s_['x'], s_['z'] = c['x'], c['z']
    return moved


# The outfield's vomitories (photographs: the user's 6.webp of the left-field stand, Commons "Tokyo Dome (April 11,
# 2015).jpg"): at the head of every other aisle, the ones the map rings as entrances (49-52, 55-58: F02|F03, F04|F05,
# F06|F07, F08|F09 and their mirror images), a pit cut down through the top rows to a mouth in the back wall, a column
# in the middle of the mouth (two ways out, one either side of it) carrying a white plate with a number on it. The
# chart agrees: at those aisles rows 15-21 stop four or five seats short either side (rows 1-14 run full across), at
# the others one or two. So: a pit along the aisle's middle (the line between the two blocks' end seats, rows 1-14)
# from row 15's front to the back of the stand, stairs in it from row 14's tread up to the concourse's floor, walled
# round (stands.js's vomParts, `wall`), the back wall open over it to a soffit 2.6 m over the concourse, the column
# (grey concrete) in the middle of that mouth at its front, a way out either side of it (the user's 12.webp, taken
# from the concourse looking out through one: the column at the front of the mouth, stairs down either side).
OUT_VOM_W = 4.0          # the pit's width: the column and a way out 1.25 m wide either side of it (12.webp), a little over
                         # a third of the aisles' spacing (6.webp); the chart leaves 5.7 m between the seats there
OUT_GREY = 0xa9a69f      # (while laid: marks the outfield's columns; taken off at the end, _plain_columns)
OUT_RX, OUT_RZ = 0.6, 0.8  # the columns' half sizes across and along their aisle: the 1st floor's own (td_build.py PILLAR_RX, PILLAR_RZ)
OUT_PIT_HEAD = 2.4       # the mouth's height at its front, over the pit's floor (the soffit rises with the stairs behind it)
OUT_SLAB = 0.3           # the soffit's slab
OUT_HEAD = 2.1           # the doorway's height over the concourse's floor (the user's call: the back wall closed above a door's height)
# (not drawn, the user's call) the plates on the columns: the Giants' retired numbers on the six middle ones (photographs: 14, 4, 16 in left
# field from the pole in; 34, 3, 1 in right field from the middle out), the passage's own number on the two by the poles
OUT_PLATES = {50: '14', 51: '4', 52: '16', 55: '34', 56: '3', 57: '1'}


def _aisle_lines():
    """the outfield's aisles between neighbouring blocks: [(names, a point on the aisle's middle, its unit direction
    out of the stand)], from the end seats either side of each in rows 1-14 (td_seatlab.pkl: the seats as laid)"""
    import pickle, os
    pj = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'td_seatlab.pkl')
    P, LB = pickle.load(open(pj, 'rb'))['F']
    P = np.asarray(P, float)
    ends = {}
    for (b, r, s), q in zip(LB, P):
        if r > 14: continue
        e = ends.setdefault(b, {}).setdefault(r, [None, None])
        if e[0] is None or s < e[0][0]: e[0] = (s, q)
        if e[1] is None or s > e[1][0]: e[1] = (s, q)
    ang = {b: math.degrees(math.atan2(*np.mean([q for e in rs.values() for _, q in e], 0) * [1, -1])) for b, rs in ends.items()}
    order = sorted(ends, key=lambda b: ang[b])
    out = []
    for A, B in zip(order, order[1:]):
        mids = []
        for r in set(ends[A]) & set(ends[B]):
            ea, eb = ends[A][r], ends[B][r]
            qa, qb = min(((x[1], y[1]) for x in ea for y in eb), key=lambda t: np.linalg.norm(t[0] - t[1]))
            if np.linalg.norm(qa - qb) < 4.0: mids.append((qa + qb) / 2)
        if len(mids) < 6: continue
        M = np.array(mids); m = M.mean(0); _, _, vt = np.linalg.svd(M - m); d = vt[0]
        if d @ (m - O) < 0: d = -d
        out.append(((A, B), m, d / np.linalg.norm(d)))
    return out


def _outfield_voms(data):
    F = next(l for l in data['levels'] if l['name'] == 'F')
    lines = _aisle_lines()
    hw = OUT_VOM_W / 2
    rows = [(k, r, unary_union([Polygon(q[0], q[1:]).buffer(0) for q in r['polys']])) for k, r in enumerate(F['rows'])]
    sc = F.get('seatScale', 10)
    seats = np.frombuffer(base64.b64decode(F['seats']), '<i2').reshape(-1, 4)
    keep = np.ones(len(seats), bool)
    xy = seats[:, :2].astype(float) / sc
    F['voms'] = []
    done = []
    plan = []
    for c in data['pillars']:
        if 'color' not in c or c.get('aisle'): continue
        pc = np.array([c['x'], c['z']])
        a_h = abs(math.degrees(math.atan2(c['x'], -c['z'])))
        if np.hypot(*pc) < 110 or a_h < 12.5 or a_h > 41: continue      # (53, 54: the screen's two by the middle)
        # its aisle: the line passing nearest it
        dist = lambda ln: abs(float((pc - ln[1]) @ np.array([-ln[2][1], ln[2][0]])))
        names, m, u = min(lines, key=dist)
        if dist((names, m, u)) > 3.0: print('tidy: no aisle for the outfield column at', c['x'], c['z']); continue
        # (the pit square to the rows, as its column is: _square_columns)
        u = np.array([c['ax'], c['az']], float); u /= np.linalg.norm(u)
        plan.append([c, names, m, u])
    # (each pit and its mirror image across the house made one another's exact mirror: the two averaged)
    for e in plan:
        o = min(plan, key=lambda f: np.hypot(f[2][0] + e[2][0], f[2][1] - e[2][1]))
        if o is e or e[2][0] < 0 or np.hypot(o[2][0] + e[2][0], o[2][1] - e[2][1]) > 3.0: continue
        mm = np.array([(e[2][0] - o[2][0]) / 2, (e[2][1] + o[2][1]) / 2]); uu = np.array([(e[3][0] - o[3][0]) / 2, (e[3][1] + o[3][1]) / 2]); uu /= np.linalg.norm(uu)
        e[2], e[3] = mm, uu; o[2], o[3] = mm * [-1, 1], uu * [-1, 1]
    for c, names, m, u in plan:
        pc = np.array([c['x'], c['z']])
        w = np.array([-u[1], u[0]])
        st = lambda q: (float((np.asarray(q) - m) @ w), float((np.asarray(q) - m) @ u))
        # the rows beside the pit: where each crosses a line a little out from either side of it
        near = [(k, r, g) for k, r, g in rows if g.distance(Point(*pc)) < 14]
        band = {}; back13 = -np.inf
        for k, r, g in near:
            for so in (-hw - 0.4, -hw, -hw / 2, 0.0, hw / 2, hw, hw + 0.4):
                ln = LineString([m + w * so - u * 25, m + w * so + u * 25])
                x = g.intersection(ln)
                if x.is_empty: continue
                ts = [st(p)[1] for gg in (x.geoms if hasattr(x, 'geoms') else [x]) for p in gg.coords]
                if r['r'] % 22 == 13 and abs(so) <= hw: back13 = max(back13, max(ts))
                if abs(so) <= hw: continue
                b = band.setdefault(r['r'] % 22, [np.inf, -np.inf, r['y']])
                b[0] = min(b[0], min(ts)); b[1] = max(b[1], max(ts))
        if 14 not in band or 13 not in band: print('tidy: no rows 14-15 by the outfield column at', c['x'], c['z']); continue
        # (from the back of row 14 across the pit's width: rows run round the dome's centre, not square across it)
        t_f = max(band[14][0], back13)
        t_b = max(b[1] for k, b in band.items() if k >= 14)
        y_top = max(b[2] for b in band.values())
        floor = round(band[13][2], 3)
        p = m + u * t_f; Lp = round(t_b - t_f, 2)
        # (the concourse's floor behind the stand: the stairs come up to it)
        behind = Point(*(p + u * (Lp + 1.0)))
        ys = [f['y'] for f in data['floors'] if y_top - 0.5 < f['y'] < y_top + 1.5
              for q in f['polys'] if Polygon(q[0], q[1:]).buffer(0).distance(behind) < 1.5]
        y_top = max(ys) if ys else y_top
        roof = round(y_top + OUT_HEAD, 3)
        loc = lambda q: (float((np.asarray(q) - p) @ w), float((np.asarray(q) - p) @ u))
        frame = lambda s0, s1, t0, t1: Polygon([p + w * s + u * t for s, t in ((s0, t0), (s1, t0), (s1, t1), (s0, t1))])
        pit = frame(-hw, hw, -0.02, Lp)
        # the rows from row 15 back: cut over the pit
        for k, r, _ in near:
            if r['r'] % 22 < 14: continue
            g = unary_union([Polygon(q[0], q[1:]).buffer(0) for q in r['polys']])
            if g.intersects(pit): r['polys'] = [_out(q) for q in _polys(g.difference(pit))]
        # the concourse's floor: gone over the pit
        fl = []
        for f in data['floors']:
            g = unary_union([Polygon(q[0], q[1:]).buffer(0) for q in f['polys']])
            if abs(f['y'] - y_top) > 0.05 or not g.intersects(pit): fl.append(f); continue
            rest = g.difference(pit)
            if not rest.is_empty: fl.append({**f, 'polys': [_out(q) for q in _polys(rest)]})
        data['floors'] = fl
        # the stairs up the pit from row 14's tread to the concourse's floor, between its walls (12.webp: down either
        # side of the column, rails along the walls)
        # (two runs, one either side of the column standing on the pit's front lip: the steps it stands in are cut round it)
        c['rx'], c['rz'] = OUT_RX, OUT_RZ
        nst = max(1, int(round(Lp / 0.3))); dst = Lp / nst; rise = (y_top - floor) / nst; hs = hw - 0.35
        for i in range(nst):
            ta, tb = i * dst - (0.02 if i == 0 else 0.0), (i + 1) * dst + 0.01
            parts = [frame(-hs, -OUT_RX - 0.02, ta, tb), frame(OUT_RX + 0.02, hs, ta, tb)] if ta < 2 * OUT_RZ + 0.1 else [frame(-hs, hs, ta, tb)]
            for g_ in parts:
                F['steps'].append({'y0': round(floor - 0.12, 3), 'y': round(floor + rise * (i + 1), 3), 'light': False, 'polys': [_out(g_)]})
        # the concourse's walls standing in the pit; the back wall cut by the pit made one straight piece across
        # the mouth, from the soffit up as high as it stood
        inpit = frame(-hw, hw, -0.02, Lp + 0.02).buffer(0.02)
        R = data['rooms']; top = None
        for key in ('walls', 'thinWalls'):
            out = []
            for wl in R[key]:
                seg = LineString([wl[:2], wl[2:4]])
                cut = seg.intersects(inpit) and wl[5] > floor + 0.02
                if cut and wl[4] < roof + 0.6: top = max(top or 0.0, wl[5])
                if not cut: out.append(wl); continue
                rest = seg.difference(inpit)
                for gg in (rest.geoms if hasattr(rest, 'geoms') else [rest]):
                    if gg.is_empty or gg.length < 0.05: continue
                    (x0, z0), (x1, z1) = list(gg.coords)[0], list(gg.coords)[-1]
                    out.append([round(x0, 2), round(z0, 2), round(x1, 2), round(z1, 2), wl[4], wl[5]])
            R[key] = out
        if top and top > roof + 0.3:
            a_, b_ = p + w * hw + u * Lp, p + w * -hw + u * Lp      # (its room, the concourse, on its left: behind it)
            R['walls'].append([round(float(a_[0]), 2), round(float(a_[1]), 2), round(float(b_[0]), 2), round(float(b_[1]), 2), roof, top])
        # the rails ringing the old notch round the column at the stand's back
        zone = frame(-hw - 0.3, hw + 0.3, -0.3, Lp + 0.6)
        F['rails'] = [rl for rl in F['rails'] if not zone.contains(Point((rl[0] + rl[2]) / 2, (rl[1] + rl[3]) / 2))]
        # the seats in it or against its walls
        q = xy - p; s_ = q @ w; t_ = q @ u
        keep &= ~((np.abs(s_) < hw + SEAT_CLEAR) & (t_ > -0.3) & (t_ < Lp + 0.3))
        # (open to the roof, as the user asked: no slab over the pit; its side walls a parapet's height over the rows beside
        # them, from row 15's tread at the front to the concourse's floor at the back; no wall across the back, the pit
        # running straight on into the passage)
        t0 = round(float(band[14][2]) + PAR, 2); t1 = round(y_top + PAR, 2)
        F['voms'].append({'p': [round(float(p[0]), 2), round(float(p[1]), 2)], 'u': [round(float(u[0]), 4), round(float(u[1]), 4)],
                          'w': OUT_VOM_W, 'L': Lp, 'T': 0.0, 'y': floor, 'roof': roof, 'top': y_top, 'sides': [],
                          'wall': {'t0': t0, 't1': t1, 'roof': roof, 'open': True}})
        # the column in the middle of the mouth at its front (12.webp), on the pit's front lip, its front face just
        # inside the pit's front edge, square to the rows; plain (no plate: the user's call)
        q2 = p + u * (OUT_RZ + 0.05)
        x0, z0 = c['x'], c['z']
        c.update({'x': round(float(q2[0]), 2), 'z': round(float(q2[1]), 2), 'y0': floor, 'color': OUT_GREY, 'ax': round(float(u[0]), 3), 'az': round(float(u[1]), 3)})
        sg_ = [s for s in data['signs'] if abs(s['x'] - x0) < 0.05 and abs(s['z'] - z0) < 0.05]
        n_ = int(sg_[0]['label']) if sg_ and sg_[0]['label'].isdigit() else None
        for s in sg_: data['signs'].remove(s)
        c['vom'] = n_
        done.append((n_, '|'.join(names), Lp, floor, roof))
    F['seats'] = base64.b64encode(seats[keep].astype('<i2').tobytes()).decode('ascii')
    return done, int((~keep).sum())


def _square_columns(data, skip=()):
    """every column turned square to the rows it stands at: its front face (across ax, az) parallel to the treads
    beside it, its sides square to them. The direction is the rows' edges' within 4 m of it (the one level's whose
    tread is nearest, at or under its foot; their lengths' doubled angles averaged, so front and back edges agree);
    where those do not agree on one direction (a corner of the stand: the blocks behind home, the poles' ends) or none
    is near, the walls round it within 3 m instead (the concourse's, parallel to the stand's back). Its plates turn
    with it. Returns each column's turn in degrees."""
    segs = []
    for L in data['levels']:
        for r in L['rows']:
            for q in r['polys']:
                for ring in q:
                    a = np.array(list(ring) + [ring[0]], float)
                    for p0, p1 in zip(a[:-1], a[1:]): segs.append((p0[0], p0[1], p1[0], p1[1], r['y'], r['y'], 1, L['name']))
    for w in data['rooms']['walls'] + data['rooms']['thinWalls']: segs.append((w[0], w[1], w[2], w[3], w[4], w[5], 0, ''))
    A = np.array([s_[:7] for s_ in segs], float); LV = np.array([s_[7] for s_ in segs])
    S0, S1, Y0, Y1, K = A[:, 0:2], A[:, 2:4], A[:, 4], A[:, 5], A[:, 6] > 0
    D = S1 - S0; Ln = np.hypot(*D.T)
    turns = []
    for c in data['pillars']:
        if any(c is k for k in skip): continue
        P = np.array([c['x'], c['z']])
        t = np.clip(((P - S0) * D).sum(1) / np.maximum(Ln ** 2, 1e-9), 0, 1); dist = np.hypot(*(S0 + D * t[:, None] - P).T)
        def mean(m):
            th = np.arctan2(D[m, 1], D[m, 0]); z = (Ln[m] * np.exp(2j * th)).sum() / max(Ln[m].sum(), 1e-9)
            return np.angle(z) / 2, abs(z), Ln[m].sum()
        rows = K & (dist < 4.0) & (Ln > 0.02) & (Y0 <= c['y0'] + 0.6) & (Y0 >= c['y0'] - 3.0)
        th = None
        if rows.any():
            lv = LV[rows][np.argmin(dist[rows])]
            th, coh, W = mean(rows & (LV == lv))
            if coh < 0.8 or W < 20: th = None
        if th is None:
            walls = (~K) & (dist < 3.0) & (Ln > 0.02) & (Y0 < c['y1'] - 0.1) & (Y1 > c['y0'] + 0.1)
            if Ln[walls].sum() > 2.0: th = mean(walls)[0]
            elif rows.any(): th = mean(rows & (LV == lv))[0]
            else: turns.append(None); continue
        n = np.array([math.sin(th), -math.cos(th)])
        a = np.array([c.get('ax', 0.0), c.get('az', 1.0)])
        if n @ a < 0: n = -n
        turn = math.atan2(n[0], n[1]) - math.atan2(a[0], a[1])
        turns.append(round(math.degrees((turn + math.pi) % (2 * math.pi) - math.pi), 1))
        c['ax'], c['az'] = round(float(n[0]), 4), round(float(n[1]), 4)
        for s_ in data.get('signs', []):
            if s_.get('r') and abs(s_['x'] - c['x']) < 0.05 and abs(s_['z'] - c['z']) < 0.05: s_['yaw'] = round(s_['yaw'] + turn, 3)
    return turns


def _drop_screen_columns(data):
    """the two columns td_build.py stands either side of the backscreen (the map's entrances 53 and 54, no vomitory,
    'a column carrying the screen'): no photograph shows a column there (the user's 6.webp and 11.webp, Commons
    "Tokyo Dome (April 11, 2015).jpg": the stand ends at the backscreen with the block's own last aisle, no column at
    its head), so they go, with their plates and the seats cleared for them (none: they stood behind the last row).
    The screen's band rests on the next real columns (dome.js). Returns the positions taken away."""
    gone = []
    for c in list(data['pillars']):
        a = abs(math.degrees(math.atan2(c['x'], -c['z'])))
        if 'color' in c and not c.get('aisle') and math.hypot(c['x'], c['z']) > 110 and a < 12.5:
            data['pillars'].remove(c); gone.append((c['x'], c['z']))
            data['signs'] = [s_ for s_ in data['signs'] if not (abs(s_['x'] - c['x']) < 0.05 and abs(s_['z'] - c['z']) < 0.05)]
    return gone


def _smooth_back_wall(data, a_max=50.0, r_min=95.0):
    """the concourse's walls round the back of the outfield stand (td_build.py's rooms, traced off the raster): stairs
    of 0.1-0.4 m pieces, which stands.js draws 0.5 m thick, each step its own jamb and cap, a picket of slabs of
    every shade seen along it from the stand (the user's 7.webp). Each run of them (one height, end to end) is
    traced again smooth: resampled every 0.25 m, eased over 1.5 m either way (its ends where they were), and laid
    as pieces about a metre long. Returns (runs, pieces before, after)."""
    R = data['rooms']
    key = lambda x, z: (round(x, 2), round(z, 2))
    def outf(w):
        x, z = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        return math.hypot(x, z) > r_min and abs(math.degrees(math.atan2(x, -z))) < a_max
    sel = [w for w in R['walls'] if outf(w)]
    rest = [w for w in R['walls'] if not outf(w)]
    groups = {}
    for w in sel: groups.setdefault((w[4], w[5]), []).append(w)
    out = []; nrun = 0
    for (y0, y1), ws in groups.items():
        nxt = {}; deg = {}
        for w in ws:
            nxt.setdefault(key(w[0], w[1]), []).append(w)
            deg[key(w[2], w[3])] = deg.get(key(w[2], w[3]), 0) + 1
        used = set()
        starts = [w for w in ws if deg.get(key(w[0], w[1]), 0) == 0] + ws
        for w0 in starts:
            if id(w0) in used: continue
            chain = [w0]; used.add(id(w0))
            while True:
                cand = [w for w in nxt.get(key(chain[-1][2], chain[-1][3]), []) if id(w) not in used]
                if not cand: break
                chain.append(cand[0]); used.add(id(cand[0]))
            P = np.array([[chain[0][0], chain[0][1]]] + [[w[2], w[3]] for w in chain], float)
            Lr = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
            if Lr[-1] < 3.0 or len(chain) < 4: out += chain; continue
            nrun += 1
            t = np.linspace(0, Lr[-1], max(2, int(Lr[-1] / 0.25) + 1))
            Q = np.c_[np.interp(t, Lr, P[:, 0]), np.interp(t, Lr, P[:, 1])]
            k = 6; Qs = Q.copy()
            for i in range(len(Q)):
                a, b = max(0, i - k), min(len(Q), i + k + 1); h = min(i - a, b - 1 - i)
                Qs[i] = Q[i - h:i + h + 1].mean(0)
            idx = np.unique(np.r_[np.arange(0, len(Qs), 4), len(Qs) - 1])
            for i, j in zip(idx[:-1], idx[1:]):
                out.append([round(float(Qs[i, 0]), 2), round(float(Qs[i, 1]), 2), round(float(Qs[j, 0]), 2), round(float(Qs[j, 1]), 2), y0, y1])
    R['walls'] = rest + out
    return nrun, len(sel), len(out)


def _plain_columns(data):
    """the outfield's columns drawn as the 1st floor's are (stands.js pillars(): the concourse's grey, no colour of
    their own): their marker taken off. Returns how many."""
    n = 0
    for c in data['pillars']:
        if c.pop('color', None) is not None: n += 1
    return n


def _balcony_columns(data):
    C = next(l for l in data['levels'] if l['name'] == 'C')
    D = next(l for l in data['levels'] if l['name'] == 'D')
    over = lambda lvl, pt: [r for r in lvl['rows'] for q in r['polys'] if Polygon(q[0], q[1:]).buffer(0).intersects(pt)]
    decks = [Polygon(dk['pts']).buffer(0) for dk in data.get('upperDecks', []) if len(dk.get('pts', [])) > 2]
    out = []
    for i, c in enumerate(data['pillars']):
        if not c.get('upC'): continue
        pt = Point(c['x'], c['z']).buffer(max(c.get('rx', c['r']), c.get('rz', c['r'])))
        if over(D, pt) or any(dk.intersects(pt) for dk in decks): continue
        rc = over(C, pt)
        if rc:
            c['y1'] = round(min(r['y0'] for r in rc), 2); out.append((i, c['y1']))
    return out


def _wall_gap(data):
    """the 1st floor's (A) front carried on to the back of the field's wall where it stops short of it, beside the
    excite seats: one strip per metre or so along the wall, each at the height of the front tread beside it (at the
    top of the excite seats' steps where they come up through the wall), a hair under the tread where they meet"""
    ring = data['fence'][0][0]
    field = Polygon(ring).buffer(0)
    A = next(l for l in data['levels'] if l['name'] == 'A')
    G = next(l for l in data['levels'] if l['name'] == 'G')
    pieces = lambda rows: [(Polygon(q[0], q[1:]).buffer(0), r['y']) for r in rows for q in r['polys']]
    a_rows = pieces(A['rows'])
    a_all = unary_union([g for g, _ in a_rows])
    span = unary_union([g for g, _ in pieces(G['rows'])]).buffer(4.0)
    other = [g for L in data['levels'] if L['name'] != 'A' for g, _ in pieces(L['rows'])]
    other += [Polygon(q[0], q[1:]).buffer(0) for f in data['floors'] for q in f['polys']]
    for t in data.get('tunnels', []):
        p = np.array(t['p']); u = np.array(t['u']); v = np.array([-u[1], u[0]]); h = t['w'] / 2 + 0.05
        # (a tunnel's mouth, its open cut, side walls and the rows over it stay as they are: nothing within 3 m)
        other.append(Polygon([p - v * h - u * 0.5, p + v * h - u * 0.5, p + v * h + u * t['L'], p - v * h + u * t['L']]).buffer(3.0))
    aisles = []
    for a in data.get('exciteAisles', []):
        ab = LineString([a['a'], a['b']]); aisles.append((ab.buffer(a['w'] / 2, cap_style=2), a))
    other += [g for g, _ in aisles]
    other = unary_union(other)
    band = field.buffer(2.5, join_style=2).difference(field).intersection(span)
    gap = band.difference(a_all).difference(other)
    edge = LineString(ring + [ring[0]])
    out = []
    for comp in _polys(gap):
        if comp.area < 0.05 or comp.distance(edge) > 0.02 or comp.distance(a_all) > 0.05: continue
        # in pieces round the dome's centre, a metre or so each
        P = np.array(comp.exterior.coords) - O
        th = np.degrees(np.arctan2(P[:, 0], P[:, 1]))
        for a0 in np.arange(np.floor(th.min() / 0.8) * 0.8, th.max(), 0.8):
            wedge = Polygon([tuple(O)] + [tuple(O + 200 * np.array([math.sin(math.radians(a)), math.cos(math.radians(a))])) for a in np.linspace(a0, a0 + 0.8, 5)])
            for c in _polys(comp.intersection(wedge)):
                ys = [a for g, a in aisles if g.distance(c) < 0.3 and Point(a['b']).distance(c) < 0.6]
                if ys: y = ys[0]['y1']
                else: y = min(a_rows, key=lambda gy: (round(gy[0].distance(c), 1), gy[1]))[1] - 0.01
                # (a few centimetres in under the tread it meets: no crack between them)
                c = c.union(c.buffer(0.04, join_style=2).intersection(a_all)).difference(other)
                out.append((c, round(y, 3)))
    for c, y in out:
        A['rows'].append({'r': 0, 'y': y, 'y0': 0.0, 'polys': [_out(q) for q in _polys(c)]})
    return [(round(c.area, 2), y, c.centroid.x) for c, y in out]


def _square(E):
    """each pit's axis square to the rows it cuts through: the rows' fronts beside it (a metre and a half either side,
    the rows the pit runs up through) fitted with one line, the axis turned onto that line's normal; then each pit
    and its mirror image across the house (x -> -x) made one another's exact mirror, the two halves averaged.
    Returns the turn (degrees) of each pit's axis, as td_build.py's raster gave it."""
    rows = [unary_union([Polygon(q[0], q[1:]).buffer(0) for q in r['polys']]) for r in E['rows']]
    turn = []
    for v in E['voms']:
        p, u, w, *_ = _frame(v)
        hw = v['w'] / 2
        S_, T_ = [], []
        for g in rows:
            for s in [sg * (hw + d) for sg in (-1, 1) for d in (0.4, 0.8, 1.2, 1.6)]:
                x = g.intersection(LineString([p + w * s - u * 1.0, p + w * s + u * (v['L'] + 1.0)]))
                if x.is_empty: continue
                ts = [(np.array(c) - p) @ u for gg in (x.geoms if hasattr(x, 'geoms') else [x]) for c in gg.coords]
                if 0.0 < min(ts) < v['L'] - 0.3: S_.append(s); T_.append(min(ts) - 0.8 * round((min(ts) - 0.3) / 0.8))
        # (each row's front brought down to the first's, so one line fits them all)
        b = np.polyfit(S_, T_, 1)[0] if len(S_) > 8 else 0.0
        n = u - b * w; n /= np.linalg.norm(n)
        turn.append(math.degrees(math.atan2(n[0], n[1]) - math.atan2(u[0], u[1])))
        v['u'] = [float(n[0]), float(n[1])]
    vs = E['voms']
    for v in vs:
        m = min(vs, key=lambda q: math.hypot(q['p'][0] + v['p'][0], q['p'][1] - v['p'][1]))
        if m is v or math.hypot(m['p'][0] + v['p'][0], m['p'][1] - v['p'][1]) > 1.0 or v['p'][0] < 0: continue
        th = (math.atan2(v['u'][0], v['u'][1]) - math.atan2(m['u'][0], m['u'][1])) / 2
        px, pz = (v['p'][0] - m['p'][0]) / 2, (v['p'][1] + m['p'][1]) / 2
        v['u'] = [round(math.sin(th), 4), round(math.cos(th), 4)]; m['u'] = [-v['u'][0], v['u'][1]]
        v['p'] = [round(px, 2), round(pz, 2)]; m['p'] = [-v['p'][0], v['p'][1]]
        v['w'] = m['w'] = max(v['w'], m['w'])
    return [round(t, 2) for t in turn]


def _column_seats(data):
    """the seats a column stands on (the outfield's aisle columns, set across onto their aisles' middles above, and any
    other column through a level's treads): taken away, with a hand's breadth round the column"""
    out = {}
    for L in data['levels']:
        sc = L.get('seatScale', 10)
        a = np.frombuffer(base64.b64decode(L['seats']), '<i2').reshape(-1, 4)
        xy = a[:, :2].astype(float) / sc
        hs = np.array(L['hs']) if 'hs' in L else None
        y = hs[np.clip(a[:, 2].astype(int), 0, len(hs) - 1)] if hs is not None else L['h0'] + L.get('rise', 0) * a[:, 2]
        keep = np.ones(len(a), bool)
        for c in data['pillars']:
            r = max(c.get('rx', c['r']), c.get('rz', c['r'])) + 0.15
            keep &= ~((np.hypot(xy[:, 0] - c['x'], xy[:, 1] - c['z']) < r) & (y + 0.4 > c['y0']) & (y < c['y1']))
        if (~keep).any():
            L['seats'] = base64.b64encode(a[keep].astype('<i2').tobytes()).decode('ascii')
            for k in ('gblocks', 'gnums', 'seatY'):
                if k in L: L[k] = [v for v, kk in zip(L[k], keep) if kk]
            out[L['name']] = int((~keep).sum())
    return out


def apply(data):
    E = next(l for l in data['levels'] if l['name'] == 'E')
    turned = _square(E)
    print('tidy: E vomitories squared to their rows, turned', turned)
    done = [(v,) + _vom(data, E, v)[1:] for v in E['voms']]
    n = _seats(E, done)
    moved = _aisle_columns(data)
    heads = _head_columns(data)
    print('tidy: the outfield\'s columns between the vomitories onto their aisles\' middles (aisle, moved m)', heads)
    print('tidy: the screen\'s two columns by the backscreen taken away', _drop_screen_columns(data))
    sw = _smooth_back_wall(data)
    print('tidy: the walls round the back of the outfield stand traced smooth: %d runs, %d pieces -> %d' % sw)
    sq = _square_columns(data)
    fv, fn = _outfield_voms(data)
    print('tidy: outfield vomitories (passage, aisle, pit length, floor, lintel)', fv, '; seats cleared', fn)
    cut = _balcony_columns(data)
    gaps = _wall_gap(data)
    print('tidy: columns turned square to their rows (degrees)', sq)
    print('tidy: the outfield\'s columns made plain grey, the 1st floor\'s size:', _plain_columns(data))
    print('tidy: seats under a column taken away', _column_seats(data))
    print('tidy: E vomitories %d (mouths at %s m), seats cleared %d; aisle columns set across %s; balcony columns ended %s'
          % (len(done), sorted({round(Lc, 1) for _, Lc in done}), n, [m[0] for m in moved], cut))
    print('tidy: the 1st floor\'s front carried on to the field\'s wall: %d strips, %.1f m2 on the 1B side, %.1f m2 on the 3B side'
          % (len(gaps), sum(a for a, y, x in gaps if x > 0), sum(a for a, y, x in gaps if x < 0)))
    return data
