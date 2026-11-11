# Tokyo Dome: the back of the balcony (C) and the underside and ends of the 2nd floor (D) over it, on the finished
# stands (after td_ends, td_tidy, td_steps).
#
# What stands there (references):
#   THE SUITE TOKYO (official page, 2022 renewal of the 1988 "スイート倶楽部", 全28室): private suites behind the
#     backstop on the 3rd-floor balcony, "部屋とグラウンドを隔てるガラス扉はフルオープン" — each room opens onto its
#     own balcony seats through full-width glass doors; warm wood-lined rooms (the official room photographs, Kotobuki
#     Seating's photograph of the suite balcony: glass doors in black frames straight behind the top row). In the
#     data the suites are the 28 blocks S101-S114 / S301-S314, ten seats each; the balcony's low partitions (cWalls)
#     stand on the lines between them.
#   Premium Lounge (Kotobuki: 1,520 of the balcony's 1,804 seats; the suites the other 284): the rest of the balcony,
#     both sides, the lounge behind it. Kotobuki's photograph along its rows: a white back wall with openings into the
#     lounge, a light ceiling with downlights over the seats, downstand beams on the column lines.
#   How far the rooms run: in the 2019 photographs from behind home (Commons "Interior of Tokyo Dome 201904a/b",
#     full_a/full_b) the balcony's back shows as lit bays, a column apart, from home out past the poles to about
#     where the 2nd floor's front band stops; past that the balcony runs on a few blocks more in front of a plain
#     grey wall, with no lit bay behind it. Here: the rooms run from the suites to the angle where D's seats stop
#     (td_ends.D_CUT); past it the balcony has the plain wall only.
#
# What td_build.py / td_ends.py leave: the balcony's concourse as a closed box behind its top row (rooms: walls 16.2-
# 20.3, its ceiling at 20.0, lit floor at 16.2), the whole length of the balcony; the 2nd floor's rows over the
# balcony as 0.5 m slabs, each its own bottom, so the underside is a staircase whose steps cut the box's front wall
# in a jagged line; the wall behind the upper tier (upperWall) hung in front of the box from 18.1 m past D's end,
# over the top row; D's end a flat rectangle hanging below its rising underside.
#
# What is laid here:
#   rooms        the box's walls, ceiling, lit floor and lamps go where the rooms are (they are drawn as rooms, with
#                their own light, by dome.js), and its front wall goes past them (the wall behind the upper tier
#                comes down onto the balcony's top tread there)
#   D rows       the 2nd floor's deck carried on to the balcony's back wall where its rows stop short of it
#   balconyRooms {y, ceil, sides: [{suites: [[a0, a1]...], lounge: [a0, a1], front, back, pts by angle}], walls,
#                piers, glass, header, soffit}: the rooms, their glazing, the strip of wall over the glazing up to
#                the 2nd floor's underside, and that underside as one smooth surface (through the back corners of
#                the rows' slabs: never below a slab, never a step)
#   upperWall    its line flush with the balcony's back wall where it stands over it, its foot on the header (over
#                the rooms) or on the balcony's top tread (past them); over a room's plan its foot over the ceiling
#   upperEnds    D's end: one wall closing the end of the deck, from its front band to the wall behind; its top a
#                parapet over the treads, its back edge down to the glazing's top, its foot straight from there down to
#                the balcony's front rail; and along the wall's foot, where the 2nd floor's rows (E's ends, D's back rows)
#                run into it, a parapet on the treads, one smooth slope running on into D's end wall
#   back plane   the balcony's back wall, glazing and the wall over them stand clear of the top row's seats' backs
#                (td_build.py's top-row seats lean through the box's front by up to 0.15 m), the top tread carried
#                back to it (C rows)
#   D rows       also the outermost tread at each angle carried on to the wall's face where it stops short of it
import base64
import numpy as np
from scipy.ndimage import gaussian_filter1d, minimum_filter1d, maximum_filter1d
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.prepared import prep

O = np.array([0.0, -60.0])
BIN = 0.25
GLASS = 2.5          # the glazing's height over the top tread (the suites' glass doors)
FRAME = 0.15         # the dark frame band over it
PARAPET = 1.05
STEP = 0.5           # degrees between the underside's sections


def _xy(th, r):
    t = np.radians(th); return np.c_[O[0] + np.sin(t) * r, O[1] + np.cos(t) * r]


def _th(x, z): return np.degrees(np.arctan2(np.asarray(x) - O[0], np.asarray(z) - O[1]))


def _r(x, z): return np.hypot(np.asarray(x) - O[0], np.asarray(z) - O[1])


def _R2(v): return round(float(v), 2)


def _profile(rows, nb, far=True):
    r = np.full(nb, np.nan)
    for row in rows:
        for poly in row['polys']:
            a = np.asarray(poly[0], float); b = np.roll(a, -1, axis=0)
            for p, q in zip(a, b):
                n = max(1, int(np.ceil(np.hypot(*(q - p)) / 0.2))); P = p + (q - p) * (np.arange(n)[:, None] / n)
                k = np.round((_th(P[:, 0], P[:, 1]) + 180.0) / BIN).astype(int) % nb; rr = _r(P[:, 0], P[:, 1])
                for kk, rv in zip(k, rr):
                    if np.isnan(r[kk]) or (rv > r[kk] if far else rv < r[kk]): r[kk] = rv
    return r


def _ease(TH, v, sg, span):
    """a profile on one side, gaps filled and eased: a door's gap (a bin with nothing) or a notch narrower than 2.5 degrees closed"""
    m = (TH * sg >= 0) & (TH * sg <= span); th = np.abs(TH[m]); o = np.argsort(th); th = th[o]; x = v[m][o]
    ok = ~np.isnan(x)
    if ok.sum() < 2: return th, np.full_like(th, np.nan)
    x = np.interp(th, th[ok], x[ok]); k = int(2.5 / BIN) | 1
    x = gaussian_filter1d(maximum_filter1d(minimum_filter1d(x, k, mode='nearest'), k, mode='nearest'), 0.5 / BIN, mode='nearest')
    return th, x


class _Sect:
    """a level's rows cut along rays from the dome's centre: (r0, r1, y0, y) per piece"""
    def __init__(self, rows):
        self.g = []
        for row in rows:
            for p in row['polys']:
                q = Polygon(p[0], p[1:]).buffer(0)
                if not q.is_empty: self.g.append((prep(q), q, row['y0'], row['y']))

    def at(self, a, rmax=200.0):
        t = np.radians(a); ray = LineString([tuple(O), (O[0] + np.sin(t) * rmax, O[1] + np.cos(t) * rmax)]); out = []
        for pg, q, y0, y in self.g:
            if not pg.intersects(ray): continue
            i = q.intersection(ray)
            for s in getattr(i, 'geoms', [i]):
                if s.geom_type != 'LineString' or s.length < 0.02: continue
                c = np.asarray(s.coords); rr = _r(c[:, 0], c[:, 1]); out.append((float(rr.min()), float(rr.max()), y0, y))
        return sorted(out)


def _underside(segs, rB):
    """the smooth underside of a stack of slabs from the back of the front one to rB: [(r, y)], or None.
    Through the back corner of each step of the slabs' bottoms (the bottoms made non-decreasing from the back), so
    it is never below a slab and never steps; past the last slab on to rB at its height"""
    if not segs: return None
    r0 = segs[0][0]; R = np.arange(r0, max(rB, r0) + 0.05, 0.05); U = np.full(len(R), np.inf)
    for a, b, y0, y in segs:
        sel = (R >= a - 1e-6) & (R <= b + 1e-6); U[sel] = np.minimum(U[sel], y0)
    if not np.isfinite(U).any(): return None
    last = U[np.isfinite(U)][-1]; U[~np.isfinite(U)] = np.inf
    S = np.minimum.accumulate(U[::-1])[::-1]; S[~np.isfinite(S)] = last
    pts = []; i = 0; n = len(R)
    while i < n:
        j = i
        while j + 1 < n and abs(S[j + 1] - S[i]) < 1e-6: j += 1
        pts.append((float(R[j]), float(S[i]))); i = j + 1
    # (the first point: the front slab's own bottom covers it up to there)
    if pts[-1][0] < rB: pts.append((float(rB), pts[-1][1]))
    pts[-1] = (float(rB), pts[-1][1])
    return pts


def _interp(pts, r):
    a = np.asarray(pts); return float(np.interp(r, a[:, 0], a[:, 1]))


def apply(data):
    data = dict(data)
    L = {l['name']: l for l in data['levels']}
    C, D = L['C'], L['D']
    nb = int(round(360 / BIN)); TH = np.arange(nb) * BIN - 180.0
    yT = max(r['y'] for r in C['rows'])                     # the balcony's top tread
    rooms = data['rooms']
    ceil = min((c['y'] for c in rooms['ceils'] if yT + 2.0 < c['y'] < yT + 5.0), default=yT + 3.8)
    # the balcony's back row, and the box's front (its outer face) and back walls, by angle
    rCb = _profile(C['rows'], nb)
    rF = np.full(nb, np.nan); rK = np.full(nb, np.nan)
    box = [w for w in rooms['walls'] if abs(w[4] - yT) < 0.05 and w[5] >= ceil]
    for x0, z0, x1, z1, y0, y1 in box:
        n = max(2, int(np.hypot(x1 - x0, z1 - z0) / 0.2) + 1); t = np.linspace(0, 1, n)
        X, Z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t; k = np.round((_th(X, Z) + 180.0) / BIN).astype(int) % nb; rr = _r(X, Z)
        for kk, rv in zip(k, rr):
            if np.isnan(rCb[kk]): continue
            if rCb[kk] - 1.0 <= rv <= rCb[kk] + 2.0 and not rv >= rF[kk]: rF[kk] = rv
            if rCb[kk] + 4.0 <= rv <= rCb[kk] + 12.0 and not rv <= rK[kk]: rK[kk] = rv
    aC = float(np.nanmax(np.abs(TH[~np.isnan(rCb)])))
    # the top row's seats: the furthest seat a bin (a seat's back leans 0.28 m behind its point; the back wall, the
    # glazing and the wall over them have to stand clear of it, or the backs come through them as a row of shards)
    _S = np.frombuffer(base64.b64decode(C['seats']), '<i2').reshape(-1, 4) / C.get('seatScale', 10)
    _k = np.round((_th(_S[:, 0], _S[:, 1]) + 180.0) / BIN).astype(int) % nb; _rr = _r(_S[:, 0], _S[:, 1])
    rSeat = np.full(nb, np.nan)
    for kk, rv in zip(_k, _rr):
        if not np.isnan(rCb[kk]) and rv > rCb[kk] - 1.2 and not rv <= rSeat[kk]: rSeat[kk] = rv
    SEAT_BACK = 0.36
    secE = _Sect(L['E']['rows'])
    Crows = []
    # where the rooms run: from the first suite to where the 2nd floor's seats stop
    S = np.frombuffer(base64.b64decode(C['seats']), '<i2').reshape(-1, 4) / C.get('seatScale', 10)
    aSeat = np.abs(_th(S[:, 0], S[:, 1]))
    Dseats = np.frombuffer(base64.b64decode(D['seats']), '<i2').reshape(-1, 4) / D.get('seatScale', 10)
    aD = float(np.abs(_th(Dseats[:, 0], Dseats[:, 1])).max())
    # (D's rows run to the cut a little past its last seat)
    aDr = float(np.nanmax(np.abs(TH[~np.isnan(_profile(D['rows'], nb))])))
    aD = max(aD, aDr)
    secD = _Sect(D['rows'])
    sides, walls_out, piers, fills = [], [], [], []
    cut_R, cut_N = [], []
    upper = [dict(w) for w in data.get('upperWall', [])]
    ends = [dict(e) for e in data.get('upperEnds', [])]
    for sg in (-1, 1):
        th, B = _ease(TH, rF, sg, aC + 1.0)
        _, K = _ease(TH, rK, sg, aC + 1.0)
        # (the back plane: the box's front, or clear of the top row's seats' backs where they would come through it)
        m = (TH * sg >= 0) & (TH * sg <= aC + 1.0); o = np.argsort(np.abs(TH[m])); sv = rSeat[m][o]; cv = rCb[m][o]; ok = ~np.isnan(sv)
        if ok.sum() > 2:
            sv = np.interp(th, th[ok], sv[ok]); sv = gaussian_filter1d(maximum_filter1d(sv, int(2.0 / BIN) | 1, mode='nearest'), 0.5 / BIN, mode='nearest')
            sv = np.where((th >= th[ok][0] - 1.0) & (th <= th[ok][-1] + 1.0), sv + SEAT_BACK, -np.inf)
            B = np.maximum(B, sv)
            # (and the top tread carried back to it)
            okc = ~np.isnan(cv); cvi = np.interp(th, th[okc], cv[okc]); gap = (B - cvi > 0.03) & ~np.isinf(sv)
            i = 0
            while i < len(th):
                if not gap[i]: i += 1; continue
                j = i
                while j + 1 < len(th) and gap[j + 1]: j += 1
                if j > i:
                    a_ = th[i:j + 1]; g = Polygon(np.vstack([_xy(a_ * sg, cvi[i:j + 1] - 0.05), _xy(a_[::-1] * sg, B[i:j + 1][::-1] + 0.3)])).buffer(0)
                    if g.area > 0.05: Crows.append({'r': 0, 'y': round(yT - 0.003, 3), 'y0': round(yT - 0.4, 3), 'polys': [[[[_R2(x), _R2(z)] for x, z in list(q.exterior.coords)[:-1]]] for q in getattr(g, 'geoms', [g]) if q.geom_type == 'Polygon']})
                i = j + 1
        # (the suites: the stretch nearest home holding 284 of the balcony's 1,804 seats (Kotobuki), divided on the
        # lines of the balcony's partitions there, td_build.py's cWalls, evenly a suite apart)
        mine = np.sort(aSeat[np.sign(S[:, 0]) == sg])
        if not len(mine): continue
        lim = float(mine[int(len(mine) * 284 / 1804)])
        cw = sorted(abs(float(_th(w['x'], w['z']))) for w in data.get('cWalls', []) if np.sign(w['x']) == sg)
        lines = []
        for a in cw:
            if lines and a - lines[-1][-1] < 0.3: lines[-1].append(a)
            else: lines.append([a])
        lines = [float(np.mean(l)) for l in lines]
        if len(lines) < 3: continue
        pitch = float(np.median(np.diff(lines[:6])))
        mids = [lines[0]]
        for b in lines[1:]:
            if abs(b - mids[-1] - pitch) < 0.3 * pitch and b < lim + 0.25 * pitch: mids.append(b)
            else: break
        edges = [mids[0] - pitch] + mids
        aS, aL = edges[0], edges[-1]
        Bf = lambda a: float(np.interp(a, th, B)); Kf = lambda a: float(np.interp(a, th, K))
        # the 2nd floor's deck carried on to the balcony's back wall, where its rows stop short of it
        for a in np.arange(aS, aD - 0.01, BIN):
            segs = secD.at(a * sg)
            if not segs: continue
            r1 = max(s[1] for s in segs); top = max(segs, key=lambda s: s[1])
            if Bf(a) - r1 > 0.15 and top[3] < ceil + 2.5:
                fills.append((sg, a, r1 - 0.05, Bf(a) + 0.2, top[3]))
        # the underside, section by section
        A = list(np.arange(aS, aD, STEP)) + [aD - 0.05]; secs = []
        for a in A:
            segs = secD.at(a * sg) + [(f[2], f[3], f[4] - 0.5, f[4]) for f in fills if f[0] == sg and abs(f[1] - a) < BIN / 2 + 1e-6]
            segs.sort()
            u = _underside(segs, Bf(a))
            if u and len(u) >= 2: secs.append((a, u))
        # resampled to the same count a section, so the surface runs on in strips; then eased along the angle (a row
        # stopping short, or the row under the back wall changing, would step it): never above its neighbours a degree
        # either side, so never above a slab
        NS = 16
        sa = np.array([q[0] for q in secs])
        RR = np.array([np.linspace(u[0][0], u[-1][0], NS) for _, u in secs])
        YY = np.array([[_interp(u, v) for v in rr] for (_, u), rr in zip(secs, RR)])
        k = int(round(1.0 / STEP)) * 2 + 1
        YY = minimum_filter1d(YY, k, axis=0, mode='nearest')
        # (and where it still steps, a ramp: it comes down no faster than 0.3 m a degree, from either side)
        for i in range(1, len(YY)): YY[i] = np.minimum(YY[i], YY[i - 1] + 0.3 * STEP)
        for i in range(len(YY) - 2, -1, -1): YY[i] = np.minimum(YY[i], YY[i + 1] + 0.3 * STEP)
        soff = []
        for a, rr, yy in zip(sa, RR, YY):
            P = _xy(np.full(NS, a * sg), rr); soff.append([[_R2(x), _R2(z), _R2(y - 0.02)] for (x, z), y in zip(P, yy)])
        sy = YY[:, -1]
        def sB(a): return float(np.interp(a, sa, sy))
        # the glazing along the back wall, the frame band over it, the header up to the underside
        GA = np.arange(aS, aD + 1e-6, BIN); GA[-1] = aD
        gl, hd = [], []
        for a in GA:
            s = sB(a); g = min(yT + GLASS, s - 0.3); (x, z), = _xy(np.array([a * sg]), np.array([Bf(a)]))
            gl.append([_R2(x), _R2(z), _R2(g)]); hd.append([_R2(x), _R2(z), _R2(g + FRAME), _R2(max(s, g + FRAME))])
        # the rooms' lines: front at the glazing, back the box's back wall's inner face
        def line(fn, off):
            P = _xy(GA * sg, np.array([fn(a) + off for a in GA])); return [[_R2(x), _R2(z)] for x, z in P]
        # partitions: between suites, the suites' and the lounge's ends
        for a in edges:
            p0, p1 = _xy(np.array([a * sg] * 2), np.array([Bf(a) + 0.05, Kf(a) - 0.5]))
            walls_out.append([_R2(p0[0]), _R2(p0[1]), _R2(p1[0]), _R2(p1[1])])
        p0, p1 = _xy(np.array([aD * sg] * 2), np.array([Bf(aD) + 0.05, Kf(aD) - 0.5]))
        walls_out.append([_R2(p0[0]), _R2(p0[1]), _R2(p1[0]), _R2(p1[1])])
        # the lounge's piers: on the column lines (the balcony's partitions' lines, td_build.py's cWalls)
        for w in data.get('cWalls', []):
            a = abs(float(_th(w['x'], w['z'])))
            if np.sign(w['x']) == sg and aL + 1.0 < a < aD - 1.0 and not any(abs(a - b) < 1.5 for b in [q[2] for q in piers if q[3] == sg]):
                (x, z), = _xy(np.array([a * sg]), np.array([Bf(a)])); piers.append([_R2(x), _R2(z), a, sg])
        sides.append({'sg': sg, 'suites': [[_R2(edges[i]), _R2(edges[i + 1])] for i in range(len(edges) - 1)], 'lounge': [_R2(aL), _R2(aD)],
                      'front': line(Bf, 0.0), 'back': line(Kf, -0.5), 'ang': [_R2(a) for a in GA], 'glass': gl, 'header': hd, 'soffit': soff})
        # what goes from the box: all of it where the rooms are, its front past them
        ring = lambda a0, a1, f0, f1: Polygon(np.vstack([_xy(np.arange(a0, a1 + 1e-6, BIN) * sg, np.array([f0(a) for a in np.arange(a0, a1 + 1e-6, BIN)])),
                                                         _xy(np.arange(a0, a1 + 1e-6, BIN)[::-1] * sg, np.array([f1(a) for a in np.arange(a0, a1 + 1e-6, BIN)[::-1]]))])).buffer(0)
        cut_R.append(ring(aS, aD, lambda a: Bf(a) - 1.5, lambda a: Kf(a) + 0.3))
        cut_N.append(ring(aD + 0.02, th[-1], lambda a: Bf(a) - 1.5, lambda a: Bf(a) + 1.0))
        # the wall behind the upper tier: flush with the balcony's back wall where it stands over it
        for w in upper:
            P = np.asarray(w['pts'], float)
            if np.sign(P[-1][0]) != sg: continue
            a = np.abs(_th(P[:, 0], P[:, 1])); r = _r(P[:, 0], P[:, 1]); y0 = np.asarray(w['y0'], float)
            Bp = np.array([Bf(v) for v in a]); Kp = np.array([Kf(v) for v in a])
            tail = len(P)
            while tail > 0 and r[tail - 1] - Bp[tail - 1] < 0.6: tail -= 1
            for i in range(len(P)):
                if i >= tail:
                    r[i] = max(r[i], Bp[i] + 0.2)
                    y0[i] = (sB(a[i]) if a[i] <= aD else yT) if a[i] >= aS else y0[i]
                elif aS <= a[i] <= aD and Bp[i] < r[i] < Kp[i] + 0.2:
                    y0[i] = max(y0[i], ceil + 0.02)
            P = _xy(a * sg, r)
            w['pts'] = [[_R2(x), _R2(z)] for x, z in P]; w['y0'] = [_R2(v) for v in y0]
            pe = w['pts'][-1]; w['ret'] = [pe, w['ret'][1]]
            for e in ends:
                if 'b' in e and np.sign(e['b'][0]) == sg and abs(e['y0'] - 13.6) < 0.5: e['b'] = pe
        # D's end: one wall closing the end of the deck, from the deck's front band to the wall behind; its top a parapet
        # over the treads, its back edge down to the glazing's top, its foot a straight line from there down to the
        # balcony's front rail (as the balcony slopes), so it meets the wall, the header and the balcony's front with
        # no gap
        segs = secD.at((aD - 0.05) * sg)
        if segs and secs:
            rc = data['rimCS'][0 if sg < 0 else 1]; ac = np.abs(_th(np.array([q[0] for q in rc]), np.array([q[1] for q in rc])))
            rCrim = float(np.interp(aD, *zip(*sorted(zip(ac, _r(np.array([q[0] for q in rc]), np.array([q[1] for q in rc]))))))) if len(rc) > 1 else 1e9
            u = secs[-1][1]; rim = min(min(s[0] for s in segs), rCrim) - 0.3; rw = Bf(aD) + 0.2
            yRail = data.get('rimCY', yT - 1.2) + 0.95; gB = gl[-1][2]
            yb = segs[0][2]; tf = max(s[3] for s in segs if s[0] < segs[0][0] + 0.3)
            tb = max(s[3] for s in segs) if segs else tf
            near = [f[4] for f in fills if f[0] == sg and abs(f[1] - aD) < 1.0]
            if near: tb = max(tb, max(near))
            RR = np.unique(np.r_[np.linspace(rim, rw, 24), [p[0] for p in u]]); RR = RR[(RR >= rim) & (RR <= rw)]
            y0s = [min(yRail + (gB - yRail) * (v - rim) / (rw - 0.2 - rim), yb if v <= u[0][0] else _interp(u, v)) if v < rw - 0.2 else gB for v in RR]
            y1s = [tf + 0.85 + (tb + PARAPET - tf - 0.85) * (v - rim) / (rw - rim) for v in RR]
            off = 0.17 / np.mean(RR); ae = aD + np.degrees(off)
            P = _xy(np.full(len(RR), ae * sg), RR)
            ends = [e for e in ends if not ('b' in e and np.sign(e['b'][0]) == sg and abs(e['y0'] - 13.6) >= 0.5)]
            pass   # (D's end wall down to the balcony's front band: taken away at the user's request)
            yEndTop = y1s[-1]
        else:
            yEndTop = None
        # the wall's foot where the 2nd floor's rows run into it (E's ends against it out to its end, D's back rows, the
        # deck to D's end): a parapet on the treads along the wall's face, its top one smooth slope a little over the
        # highest tread there, so the rows' ends and the strips behind them read as one clean wall, running on into
        # D's end wall
        # (first each row carried on to the wall where it stops short of it: the outermost tread a bin runs into the
        # wall's face, so the treads meet the wall stair by stair, with no strip or block left between)
        for w in upper:
            P = np.asarray(w['pts'], float)
            if np.sign(P[-1][0]) != sg: continue
            aw = np.abs(_th(P[:, 0], P[:, 1])); rw_ = _r(P[:, 0], P[:, 1]); o = np.argsort(aw)
            for a in np.arange(BIN, aD - 0.01, BIN):
                face = float(np.interp(a, aw[o], rw_[o])) - 0.2
                fq = [(f[2], f[3], f[4] - 0.5, f[4]) for f in fills if f[0] == sg and abs(f[1] - a) < BIN / 2 + 1e-6]
                seg = secD.at(a * sg) + secE.at(a * sg) + fq
                if not seg: continue
                last = max(seg, key=lambda q: q[1])
                if 0.05 < face - last[1] < 3.0 and last[3] > yT + 2.0:
                    fills.append((sg, a, last[1] - 0.05, face + 0.15, last[3]))
        for w in upper:
            P = np.asarray(w['pts'], float)
            if np.sign(P[-1][0]) != sg: continue
            a = np.abs(_th(P[:, 0], P[:, 1])); r = _r(P[:, 0], P[:, 1]); t = np.full(len(P), np.nan)
            for i in range(0, len(P)):
                if a[i] > aD: continue
                fq = [(f[2], f[3], f[4] - 0.5, f[4]) for f in fills if f[0] == sg and abs(f[1] - a[i]) <= BIN / 2 + 1e-6]
                seg = [q for q in secD.at(a[i] * sg) + secE.at(a[i] * sg) + fq if r[i] - 2.0 <= q[1] <= r[i] + 0.4]
                if seg: t[i] = max(q[3] for q in seg)
            ok = ~np.isnan(t)
            if ok.sum() < 4: continue
            i0, i1 = np.where(ok)[0][[0, -1]]; idx = np.arange(i0, i1 + 1)
            tt = np.interp(idx, np.where(ok)[0], t[ok]); kk = max(3, int(2.0 / max(1e-3, np.median(np.abs(np.diff(a))))) | 1)
            top = maximum_filter1d(tt, kk, mode='nearest'); top = np.maximum(gaussian_filter1d(top, kk / 3, mode='nearest'), tt) + PARAPET
            if yEndTop is not None and a[i1] > aD - 1.0: top[-1] = max(top[-1], yEndTop)
            bot = minimum_filter1d(tt, kk, mode='nearest') - 0.6
            Q = _xy(a[idx] * sg, r[idx] - 0.2 - 0.14)
            ends.append({'pts': [[_R2(x), _R2(z)] for x, z in Q], 'y0': [_R2(v) for v in bot], 'y1': [_R2(v) for v in top], 'thick': 0.3})
    # the deck carried on: as D's own rows, one strip a run of consecutive bins at one height
    fills.sort(key=lambda f: (f[0], f[1]))
    runs, cur = [], []
    for f in fills:
        if cur and (f[0] != cur[-1][0] or abs(f[1] - cur[-1][1] - BIN) > 1e-6 or abs(f[4] - cur[-1][4]) > 0.01): runs.append(cur); cur = []
        cur.append(f)
    if cur: runs.append(cur)
    D = dict(D); D['rows'] = list(D['rows'])
    for run in runs:
        sg = run[0][0]
        a = np.array([f[1] for f in run]); lo = np.array([f[2] for f in run]); hi = np.array([f[3] for f in run])
        a = np.r_[a[0] - BIN / 2, a, a[-1] + BIN / 2]; lo = np.r_[lo[0], lo, lo[-1]]; hi = np.r_[hi[0], hi, hi[-1]]
        g = Polygon(np.vstack([_xy(a * sg, lo), _xy(a[::-1] * sg, hi[::-1])])).buffer(0)
        if g.area > 0.05:
            D['rows'].append({'r': 0, 'y': round(run[0][4] - 0.003, 3), 'y0': round(run[0][4] - 0.5, 3),
                              'polys': [[[[_R2(x), _R2(z)] for x, z in list(q.exterior.coords)[:-1]]] for q in getattr(g, 'geoms', [g]) if q.geom_type == 'Polygon']})
    Cl = dict(C); Cl['rows'] = list(C['rows']) + Crows
    data['levels'] = [D if l['name'] == 'D' else Cl if l['name'] == 'C' else l for l in data['levels']]
    # the box: gone where the rooms are, its front gone past them
    R = dict(rooms); cR = unary_union(cut_R); cN = unary_union(cut_N); pR, pN = prep(cR), prep(cN)
    cRN = unary_union([cR, cN])        # (the box's ceiling and floor reached to its front face: in the wall's, past the rooms)
    def gone(w, deep=True):
        x0, z0, x1, z1, y0, y1 = w[:6]
        if not (yT - 0.05 <= y0 <= ceil + 0.05 and y1 <= ceil + 0.6): return False
        # (any piece reaching into it: a box wall crossing the back plane would stand out over the top row)
        m = LineString([(x0, z0), (x1, z1)]) if (x0, z0) != (x1, z1) else Point(x0, z0)
        return pR.intersects(m) or pN.intersects(m)
    n0 = len(R['walls']); R['walls'] = [w for w in R['walls'] if not gone(w)]
    R['thinWalls'] = [w for w in R.get('thinWalls', []) if not gone(w)]
    def carve(lst, y):
        out = []
        for c in lst:
            if abs(c['y'] - y) > 0.05: out.append(c); continue
            polys = []
            for p in c['polys']:
                g = Polygon(p[0], p[1:]).buffer(0).difference(cRN)
                for q in getattr(g, 'geoms', [g]):
                    if q.geom_type == 'Polygon' and q.area > 0.5:
                        polys.append([[[_R2(x), _R2(z)] for x, z in list(q.exterior.coords)[:-1]]] + [[[_R2(x), _R2(z)] for x, z in list(h.coords)[:-1]] for h in q.interiors])
            if polys: out.append({**c, 'polys': polys})
        return out
    R['ceils'] = carve(R['ceils'], ceil); R['lit'] = carve(R['lit'], yT)
    # (and a soffit between the tread and the ceiling, td_build.py's landing at D's old end, poking out over the top row)
    for sf in {round(c['y'], 3) for c in R.get('soffits', []) if yT < c['y'] < ceil}: R['soffits'] = carve(R['soffits'], sf)
    R['lamps'] = [l for l in R['lamps'] if not (abs(l[1] - ceil) < 0.5 and pR.contains(Point(l[0], l[2])))]
    data['rooms'] = R
    data['upperWall'] = upper; data['upperEnds'] = ends
    data['balconyRooms'] = {'y': yT, 'ceil': ceil, 'sides': sides, 'walls': walls_out, 'piers': [p[:2] for p in piers]}
    print('balcony rooms: suites %s, lounge to %.1f degrees (D\'s end); box walls %d -> %d; deck carried on %d bins; underside %d sections'
          % (' / '.join('%.1f-%.1f' % (s['suites'][0][0], s['suites'][-1][1]) for s in sides), aD, n0, len(R['walls']), len(fills), sum(len(s['soffit']) for s in sides)))
    return data
