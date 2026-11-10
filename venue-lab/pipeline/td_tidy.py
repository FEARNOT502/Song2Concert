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
#   aisle columns     The outfield stand's (F) un-numbered columns at the heads of its aisles: each set across onto
#                     its aisle's centre line, at the same distance from the dome's centre.
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
HEAD = 2.0           # the headroom over the pit's floor the mouth needs
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


def _aisle_columns(data):
    F = next(l for l in data['levels'] if l['name'] == 'F')
    S = np.frombuffer(base64.b64decode(F['seats']), '<i2').reshape(-1, 4).astype(float); S[:, :2] /= F.get('seatScale', 10)
    U = [Polygon(s['polys'][0]).buffer(0) for s in F['steps']]
    moved = []
    for c in data['pillars']:
        if not c.get('aisle'): continue
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
        off = float(np.polyfit(*np.array(mid if len(mid) >= 3 else gap).T, 1)[1])
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


def apply(data):
    E = next(l for l in data['levels'] if l['name'] == 'E')
    done = [(v,) + _vom(data, E, v)[1:] for v in E['voms']]
    n = _seats(E, done)
    moved = _aisle_columns(data)
    cut = _balcony_columns(data)
    print('tidy: E vomitories %d (mouths at %s m), seats cleared %d; aisle columns set across %s; balcony columns ended %s'
          % (len(done), sorted({round(Lc, 1) for _, Lc in done}), n, [m[0] for m in moved], cut))
    return data
