# Wembley stands: seats read off the seatingplan.net plan (wb/wseats.py) ->
# stand data. World frame: x north, z east, about the pitch centre.
import sys, json, time, pickle, numpy as np, cv2
sys.path.insert(0, '.')
from standlib import Grid, disk, contours, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, trim_tunnels, front_parapet
T0 = time.time()
o = pickle.load(open('wb/wb_seats.pkl', 'rb'))
def tr(P): return np.c_[-P[:, 1], P[:, 0]]      # (east, south) -> (north, east)
G = Grid(-150, 150, -162, 162, 0.1)
STRAIGHT.update(on=True, res=G.res)
gy, gx = np.mgrid[0:G.H, 0:G.W]
GX, GZ = G.m(gx, gy)
TH = np.arctan2(GX, GZ); RR = np.hypot(GX, GZ)
def dil(m, r): return cv2.dilate(m.astype(np.uint8), disk(r / G.res)) > 0

def sightline(D0, y0, T, n, C, eye=1.2):
    D, N = D0, y0 + eye; hs = [y0]
    for _ in range(n - 1):
        N = (D + T) * (N + C) / D; D += T; hs.append(N - eye)
    return np.round(hs, 3)
# rakes from the side stands' sightlines to the near touchline
H1 = sightline(12.9, 1.5, 0.80, 46, 0.07)
H2 = sightline(40.5, 17.8, 0.90, 17, 0.06)
H5 = sightline(61.4, 29.3, 0.80, 47, 0.03)
print('rake L1', H1[[0, 28, 43]], 'L2', H2[[0, 15]], 'L5', H5[[0, 12, 23, 44]])
RISE, RUN = 0.19, 0.28

def vom_plan(H, bw, D):
    # the steps down inside a tunnel mouth, and the first row high enough to walk under
    best = None
    for n in range(4, 24):
        C = H[bw] - RISE * n
        ro = next(b for b in range(bw + 1, len(H)) if H[b] - 0.6 >= C + 2.3)
        if n * RUN <= (ro - bw - 1) * D - 0.1 and (best is None or ro < best[1]):
            best = (n, ro, round(float(C), 3))
    return best
V1 = vom_plan(H1, 29, 0.8); V5 = vom_plan(H5, 12, 0.8)
print('vom L1 (steps, open row, concourse)', V1, 'L5', V5)
C1, C2, C5 = V1[2], float(H2[15]), V5[2]

def front_raster(P):
    F = G.empty(); gx_, gz_ = G.g(P[:, 0], P[:, 1])
    cv2.polylines(F, [np.c_[gx_, gz_].round().astype(np.int32)], True, 1, 1)
    return F
def bottom_fn(kind):
    if kind == 'L1': return lambda r, top: 0.0 if r < V1[1] else top - 0.6
    if kind == 'L2': return lambda r, top: top - (1.6 if r == 0 else 0.6)
    return lambda r, top: top - (1.5 if r == 0 else 0.6)
LV = {}
for name, H, ow in (('L1', H1, 3.0), ('L2', H2, 3.0), ('L5', H5, 3.0)):
    t = o[name]
    S = tr(t['seats']); F = front_raster(tr(t['front']))
    LV[name] = Level(G, name, S, t['D'], float(H[0]), 0.0, bottom_fn(name), centre=(0, 0), rmax=160, open_w=ow, hull_close=3.0, F=F, hs=H)
    LV[name].step_eps = 0.1
    # the treads: the blocks as the plan draws them (aisles, gangways and
    # walkways included, the notches and bays left out)
    l = LV[name]; fp = G.empty()
    foot = sorted(t['foot'], key=lambda P: -abs(cv2.contourArea(P.astype(np.float32))))
    for i, P in enumerate(foot):
        q = tr(P); gx_, gz_ = G.g(q[:, 0], q[:, 1])
        cv2.fillPoly(fp, [np.c_[gx_, gz_].round().astype(np.int32)], 1 if i == 0 else 0)
    l.R = ((fp > 0) & l.behind).astype(np.uint8)
    l.band = np.where(l.R > 0, np.clip(np.floor(l.d / l.D).astype(int), 0, l.nrows - 1), -1)
    print(name, 'rows', LV[name].nrows, 'seats', len(S), round(time.time() - T0, 1))
L1, L2, L5 = LV['L1'], LV['L2'], LV['L5']
inside1 = np.zeros_like(L1.R); fr = tr(o['L1']['front']); gx_, gz_ = G.g(fr[:, 0], fr[:, 1])
cv2.fillPoly(inside1, [np.c_[gx_, gz_].round().astype(np.int32)], 1); inside1 = inside1 > 0

# ── Level 5 laid out as its blocks are ──
# Its front has bays (the two big screens at the ends, the media box on the
# south side) and, on the north side, is set 7 m further back between two
# steps at the corners. The rows run on straight behind a bay, as the plan's
# seats do, rather than wrapping round it; and the north side's rows are its
# own, parallel to its own front, meeting the corner blocks' at an aisle.
from scipy.spatial import cKDTree
def resample(P, step=0.5, closed=True):
    Q = np.r_[P, P[:1]] if closed else P
    L = np.r_[0, np.cumsum(np.hypot(*np.diff(Q, axis=0).T))]
    s = np.arange(0, L[-1] - (step * 0.5 if closed else -1e-6), step)
    return np.c_[np.interp(s, L, Q[:, 0]), np.interp(s, L, Q[:, 1])]
def corners(Q, k=4, thr=20.0, closed=True):
    n = len(Q); idx = np.arange(n)
    a = Q - Q[(idx - k) % n]; b = Q[(idx + k) % n] - Q
    ang = np.degrees(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(1)))
    if not closed: ang[:k] = 0; ang[-k:] = 0
    return [(i, float(ang[i])) for i in range(n) if abs(ang[i]) > thr and abs(ang[i]) >= np.abs(ang[(idx[i] + np.arange(-k, k + 1)) % n]).max()]
def unit(v): return v / (np.linalg.norm(v) + 1e-12)
def hermite(p0, t0, p1, t1, step=0.5):
    c = np.linalg.norm(p1 - p0); s = np.linspace(0, 1, max(3, int(c / step) + 1))[:, None]
    h00, h10, h01, h11 = 2 * s**3 - 3 * s**2 + 1, s**3 - 2 * s**2 + s, -2 * s**3 + 3 * s**2, s**3 - s**2
    return h00 * p0 + h10 * c * t0 + h01 * p1 + h11 * c * t1
def bridge_bays(Q):
    # a bay: the front turning out, back, and in again (-,+,+,-) within 60 m
    cs = corners(Q, closed=False); bays = []; out = []; last = 0
    i = 0
    while i + 3 < len(cs):
        sg = [np.sign(c[1]) for c in cs[i:i + 4]]
        if sg == [-1, 1, 1, -1] and cs[i + 3][0] - cs[i][0] < 120:
            i0, i1 = cs[i][0], cs[i + 3][0]
            t0 = unit(Q[i0] - Q[i0 - 8]); t1 = unit(Q[i1 + 8] - Q[i1])
            H = hermite(Q[i0], t0, Q[i1], t1)
            out += [Q[last:i0], H]; last = i1 + 1
            bays.append({'actual': Q[i0:i1 + 1], 'bridge': H})
            i += 4
        else: i += 1
    out.append(Q[last:])
    return np.concatenate(out), bays
def smooth_line(Q, sig=3.0):
    # gently, along its length, the ends fixed (the plan's trace wobbles)
    s = sig / 0.5; h = int(3 * s); w = np.exp(-0.5 * (np.arange(-h, h + 1) / s) ** 2); w /= w.sum()
    ext = np.r_[2 * Q[0] - Q[h:0:-1], Q, 2 * Q[-1] - Q[-2:-h - 2:-1]]
    return np.c_[np.convolve(ext[:, 0], w, 'valid'), np.convolve(ext[:, 1], w, 'valid')]
def extend(Q, L=45.0):
    t0 = unit(Q[0] - Q[10]); t1 = unit(Q[-1] - Q[-11]); s = np.arange(L, 0, -0.5)[:, None]
    return np.r_[Q[0] + t0 * s, Q, Q[-1] + t1 * s[::-1]]
def signed_dist(Q, pts):
    # distance to the polyline, positive on the stand's side (Q runs with
    # the pitch on its left)
    D = resample(Q, 0.1, closed=False); T = np.gradient(D, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-12
    dist, j = cKDTree(D).query(pts, k=1)
    q = pts - D[j]; cr = T[j, 0] * q[:, 1] - T[j, 1] * q[:, 0]
    return np.where(cr > 0, -dist, dist)
def section_depth(l, P):
    Q = resample(P)
    if np.sum(Q[:, 0] * np.roll(Q[:, 1], -1) - Q[:, 1] * np.roll(Q[:, 0], -1)) < 0: Q = Q[::-1].copy()
    cs = corners(Q)
    # the steps: a turn out and straight on again (-,+) within 15 m, not part of a bay
    steps = [(cs[i][0], cs[(i + 1) % len(cs)][0]) for i in range(len(cs))
             if np.sign(cs[i][1]) != np.sign(cs[(i + 1) % len(cs)][1]) and (cs[(i + 1) % len(cs)][0] - cs[i][0]) % len(Q) < 30
             and abs(cs[i][1]) < 45 and abs(cs[(i + 1) % len(cs)][1]) < 45]
    region = cv2.dilate(((l.R > 0) | (l.hull > 0)).astype(np.uint8), disk(4.0 / G.res)) > 0
    ry, rx = np.nonzero(region); pts = np.c_[G.m(rx, ry)]
    polys = []
    if len(steps) == 2:
        (a1, a2), (b1, b2) = sorted(steps)
        N = Q[a2:b1 + 1]; Rr = np.r_[Q[b2:], Q[:a1 + 1]]
        polys = [('N', N), ('R', Rr)]
    else: polys = [('R', np.r_[Q, Q[:1]])]
    fields, bays = {}, []
    for name, P_ in polys:
        P_, b = bridge_bays(P_); bays += b
        P_ = extend(smooth_line(P_))
        fields[name] = signed_dist(P_, pts)
    d = l.d.copy(); sec = np.zeros(l.d.shape, bool)
    if 'N' in fields:
        # the aisles at the steps: square to the front, from the step's middle
        def side(i0, i1):
            M = (Q[i0] + Q[i1]) / 2; t = unit(Q[(i1 + 6) % len(Q)] - Q[i0 - 6]); return M, t
        (Ma, ta), (Mb, tb) = side(*sorted(steps)[0]), side(*sorted(steps)[1])
        inN = ((pts - Ma) @ ta > 0) & ((pts - Mb) @ tb < 0) & (pts[:, 0] > 20)
        dv = np.where(inN, fields['N'], fields['R']); sec[ry, rx] = inN
        # the seats' facing: each section's own smooth field
        fa = np.full(l.d.shape, np.nan, np.float32); fb = fa.copy()
        fa[ry, rx] = fields['N']; fb[ry, rx] = fields['R']
        fa = np.where(np.isnan(fa), l.d, fa); fb = np.where(np.isnan(fb), l.d, fb)
        ga = np.gradient(cv2.GaussianBlur(fa.astype(np.float32), (9, 9), 0)); gb = np.gradient(cv2.GaussianBlur(fb.astype(np.float32), (9, 9), 0))
        grad = (np.where(sec, ga[0], gb[0]), np.where(sec, ga[1], gb[1]))
        aisles = [(Ma, ta), (Mb, tb)]
    else:
        dv = fields['R']; grad = None; aisles = []
    d[ry, rx] = dv
    l.set_depth(d, grad); l._grad = grad
    if aisles: l.secmap = sec.astype(np.int32)
    return bays, aisles, sec
BAYS5, AISLES5, SEC5 = section_depth(L5, tr(o['L5']['front']))
print('L5 bays', [round(float(np.linalg.norm(b['bridge'][-1] - b['bridge'][0])), 1) for b in BAYS5], 'aisles', len(AISLES5), 'rows', L5.nrows)

# ── the seats, row by row ──
# The plan's seats were traced off an image of it, which left a row without
# seats wherever a block's, a row's or a seat's number is printed over it (or
# the watermark), and its seats crowded or spread wherever the tracing
# wobbled. Laid out again from what the plan draws (wb_plan.py): each row of
# each block seated end to end, one pitch apart, from aisle to aisle; the
# aisles where the plan draws them, carried on along their lines where the
# watermark hides them; a row only where the plan draws its line. The
# pitches give each level its official count once the vomitories, tunnels
# and press box are cut (34,303, 16,532 and 39,165 seats).
from wb_reseat import plan_bits, reseat
PITCH = {'L1': 0.551, 'L2': 0.5, 'L5': 0.521}
PLAN = plan_bits(G)
for name_, l_ in LV.items():
    print('reseat', name_, reseat(G, l_, PLAN[name_], PITCH[name_]), round(time.time() - T0, 1))

# ── the four corner tunnels ──
# At each corner of the pitch the Level 1 front is cut square across, and
# from there a tunnel runs straight out under the stand and the concourse to
# the service road round the building, flat-roofed. In front of its portal it
# is an open cut through the rows too low to pass under, a wall either side;
# past the portal the rows run on over its roof. Cut and portal are as wide,
# and the cut as long, as the plan leaves the corner unseated (fitted below,
# once the tunnels are aimed): 6.9 m clear at the front widening to 8.6-8.7 m
# at the portal and 15.5 m long at the north corners, 4.6-5.4 m to 6.6-6.7 m
# and 10.8-10.9 m at the south ones, as the rows either side fan out round the
# corner. The portal's clear height is the plan's first row over it, a lintel
# down: 5.3 m at the north corners, 3.9 m at the south.
TUN_W, TUN_H, DECK_T = 7.0, 4.5, 0.6
LINTEL, WALL_T, ROW_END = 1.0, 0.3, 0.4      # the portal's head; the cut's walls; a seat's middle to its row's end
def chamfers(P):
    Q = resample(P); T = np.roll(Q, -3, 0) - np.roll(Q, 3, 0)
    if np.sum(Q[:, 0] * np.roll(Q[:, 1], -1) - Q[:, 1] * np.roll(Q[:, 0], -1)) < 0: Q = Q[::-1].copy(); T = -T[::-1]
    ang = np.degrees(np.arctan2(T[:, 1], T[:, 0])) % 90
    cand = (np.abs(ang - 45) < 14) & (np.abs(Q[:, 0]) > 25) & (np.abs(Q[:, 1]) > 45)
    out = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            idx = np.nonzero(cand & (np.sign(Q[:, 0]) == sx) & (np.sign(Q[:, 1]) == sz))[0]
            runs, cur = [], [idx[0]]
            for i in idx[1:]:
                if i == cur[-1] + 1: cur.append(i)
                else: runs.append(cur); cur = [i]
            runs.append(cur); r = max(runs, key=len)
            a, b = Q[r[0]], Q[r[-1]]; t = unit(b - a)
            u = np.array([t[1], -t[0]])            # the right of the way round: out, into the stand
            if u @ (a + b) < 0: u = -u
            out.append({'p': (a + b) / 2, 'u': u})
    return out
TUNNELS = chamfers(tr(o['L1']['front']))
for t in TUNNELS: t.update(w=TUN_W, h=TUN_H, Lmax=90.0, closed=False)
# the players' tunnel: out of the north stand on to the halfway line, from
# the dressing rooms under it (the plan leaves its mouth unseated)
from shapely.geometry import Polygon as _Poly, LineString as _Line
PT = np.array([max(c[0] for c in _Poly(tr(o['L1']['front'])).exterior.intersection(_Line([(0, 0), (120, 0)])).coords), 0.0]) \
    if _Poly(tr(o['L1']['front'])).exterior.intersection(_Line([(0, 0), (120, 0)])).geom_type == 'Point' else \
    np.array([max(g.x for g in _Poly(tr(o['L1']['front'])).exterior.intersection(_Line([(0, 0), (120, 0)])).geoms), 0.0])
TUNNELS.append({'p': PT, 'u': np.array([1.0, 0.0]), 'w': 4.2, 'h': 3.0, 'Lmax': 24.0, 'closed': True})
def near_tunnel(ts, P, pad):
    return any(abs(float((P - t['p']) @ np.array([-t['u'][1], t['u'][0]]))) < t['w'] / 2 + pad and (P - t['p']) @ t['u'] > -2 for t in ts)
print('corner tunnels', [(t['p'].round(1).tolist(), t['u'].round(2).tolist()) for t in TUNNELS])

# ── vomitories ──
def band_line(l, b, frac=0.55):
    # points along the middle of band b, with the outward direction there
    m = ((l.d >= (b + frac) * l.D - 0.05) & (l.d < (b + frac) * l.D + 0.05) & l.behind)
    ys, xs = np.nonzero(m); X, Z = G.m(xs, ys)
    a = np.arctan2(X, Z); o_ = np.argsort(a)
    return np.c_[X[o_], Z[o_]], a[o_]
gz_d, gx_d = {}, {}
for n_, l in LV.items():
    sm = cv2.GaussianBlur(l.d.astype(np.float32), (9, 9), 0)
    gz_d[n_], gx_d[n_] = np.gradient(sm)
def outward(n_, x, z):
    i, j = G.g(x, z); i = int(round(float(i))); j = int(round(float(j)))
    v = np.array([gx_d[n_][j, i], gz_d[n_][j, i]]); return v / (np.linalg.norm(v) + 1e-9)
def seat_free_runs(l, b, minlen, maxlen):
    P, a = band_line(l, b)
    seats = l.seats[l.row == b]
    from scipy.spatial import cKDTree
    free = cKDTree(seats).query(P, k=1)[0] > 0.45 if len(seats) else np.ones(len(P), bool)
    # walk round in angle; runs of free points, measured along the line
    step = np.r_[0, np.linalg.norm(np.diff(P, axis=0), axis=1)]
    runs, cur = [], None
    for i in range(len(P)):
        if free[i] and step[i] < 0.6:
            if cur is None: cur = [i, i, 0.0]
            cur[1] = i; cur[2] += step[i]
        else:
            if cur is not None: runs.append(cur)
            cur = [i, i, 0.0] if free[i] else None
    if cur is not None: runs.append(cur)
    return [(P[(r0 + r1) // 2], L_, P[r0], P[r1]) for r0, r1, L_ in runs if minlen <= L_ <= maxlen]
def cut_tunnel(n_, l, P, bw, ro, width):
    nv = outward(n_, *P)
    # from the back of the walkway band to just past the first open row
    Q = np.c_[GX.ravel() - P[0], GZ.ravel() - P[1]]
    along = (Q @ nv).reshape(G.H, G.W); lat = np.abs(Q @ np.array([-nv[1], nv[0]])).reshape(G.H, G.W)
    m = (lat < width / 2) & (l.d >= (bw + 1) * l.D) & (l.d < ro * l.D + 0.15) & (along > -4) & (along < 12)
    l.R[m] = 0; l.band[m] = -1
    keep = np.ones(len(l.seats), bool)
    q = l.seats - P; al = q @ nv; la = np.abs(q @ np.array([-nv[1], nv[0]]))
    keep &= ~((la < width / 2 + 0.2) & (l.row > bw) & (l.row < ro) & (al > -4) & (al < 12))
    return m, keep, nv
flights = []; holes_mask = {k: np.zeros_like(inside1) for k in ('L1', 'L2', 'L5')}; vom_masks = {'L1': [], 'L2': [], 'L5': []}
extra_walls = {'L1': [], 'L2': [], 'L5': []}
FL2 = []          # Level 2's vomitories' steps: kept out of the concourses' reckoning
def add_vom(n_, l, P, bw, V, width, fl=None):
    nsteps, ro, C = V
    m, keep, nv = cut_tunnel(n_, l, P, bw, ro, width)
    l.seats, l.row, l.yaw = l.seats[keep], l.row[keep], l.yaw[keep]
    holes_mask[n_] |= m; vom_masks[n_].append(m)
    # the steps: from the concourse at the back of the mouth up to the walkway
    Pf = P + nv * ((bw + 1 - (bw + 0.55)) * l.D)          # the walkway's back edge
    L_ = nsteps * RUN
    x0, z0 = Pf + nv * L_
    # (the top step runs 0.2 m on under the walkway's edge: traced off the
    # grid, that edge can stop a cell short and leave a crack to fall into)
    (flights if fl is None else fl).append(dict(x=round(float(x0), 2), z=round(float(z0), 2), dx=round(float(-nv[0]), 4), dz=round(float(-nv[1]), 4), n=nsteps, L=round(L_ + 0.2, 3), y0=C, y1=float(l.h(bw)), w=min(1.8, width - 0.4)))
    # under a slab walkway, close the face below it
    if l.bottom(bw, float(l.h(bw))) > C + 0.05:
        t = np.array([-nv[1], nv[0]]) * width / 2
        a, b = Pf + t, Pf - t
        extra_walls[n_].append([round(float(a[0]), 2), round(float(a[1]), 2), round(float(b[0]), 2), round(float(b[1]), 2), round(C, 2), round(float(l.bottom(bw, float(l.h(bw)))), 2)])
# The vomitories as the official level maps draw them (wb/wb_blocks.json):
# one at each boundary between two blocks, 44 round Level 1 (101-144) and 52
# round Level 2 (201-252) and Level 5 (501-552), each on the row in front of
# its mouth (Level 1's walkway behind row 28; a third of the way up Level 2
# and Level 5), square to the rows. The maps are diagrams, so each is placed
# by its angle about the centre, the map's ring and the row's line each
# scaled to a unit circle.
BLK = json.load(open('wb/wb_blocks.json'))
VOM_ROW = {'L1': 29, 'L2': 4, 'L5': 12}
def official_pts(n_):
    Pl, _ = band_line(LV[n_], VOM_ROW[n_])
    phi = np.arctan2(Pl[:, 0] / np.abs(Pl[:, 0]).max(), Pl[:, 1] / np.abs(Pl[:, 1]).max())
    r = BLK['levels'][n_]['ring']; out = []
    for v in BLK['levels'][n_]['voms']:
        x, y = v['px']; psi = np.arctan2((r['cy'] - y) / r['b'], (x - r['cx']) / r['a'])
        out.append(Pl[np.argmin(np.abs(np.angle(np.exp(1j * (phi - psi)))))])
    return np.array(out)
VOMP = {n_: official_pts(n_) for n_ in LV}
# the corner tunnels: from their mouths in the corners of the pitch, each
# along the middle of its corner block (107, 116, 129, 138), between the
# vomitories either side of it, as the map's tunnel mouths point
lab1 = [v['after'] for v in BLK['levels']['L1']['voms']]
for t in TUNNELS[:4]:
    best = None
    for blk in BLK['tunnels']['blocks'].values():
        i = lab1.index(blk); j = (i - 1) % len(lab1)       # the vomitories at its two ends
        T_ = (VOMP['L1'][i] + VOMP['L1'][j]) / 2
        if best is None or np.linalg.norm(T_ - t['p']) < np.linalg.norm(best[1] - t['p']): best = (blk, T_)
    t['u'] = unit(best[1] - t['p']); t['block'] = best[0]
print('corner tunnels re-aimed', [(t['block'], t['u'].round(3).tolist()) for t in TUNNELS[:4]])
# Each one's cut, off the plan: its sides straight along the ends of the rows
# either side (the innermost seats, every 0.4 m out from the front), its far
# end where the plan's seats run on across it (an aisle up the middle), the
# tunnel's axis down the middle between the sides
S1p = tr(o['L1']['seats'])
def plan_cut(p, u):
    v = np.array([-u[1], u[0]]); q = S1p - p; a = q @ u; b = q @ v
    def end(c):
        return next(a0 for a0 in np.arange(3.0, 30.0, 0.1) if ((a > a0) & (a < a0 + 0.3) & (np.abs(b - c) < 2.2)).any())
    def side(sg, a_end, c):
        m = (a > 0.8) & (a < a_end - 0.2) & (sg * (b - c) > 0) & (np.abs(b - c) < 9)
        A, B = a[m], np.abs(b[m] - c); xs, ys = [], []
        for a0 in np.arange(0.8, a_end - 0.2, 0.4):
            s = (A >= a0) & (A < a0 + 0.4)
            if s.any(): xs.append(A[s].mean()); ys.append(B[s].min())
        xs, ys = np.array(xs), np.array(ys); keep = np.ones(len(xs), bool)
        for _ in range(20):
            f = np.polyfit(xs[keep], ys[keep], 1); nk = ys - np.polyval(f, xs) < 0.4
            if (nk == keep).all(): break
            keep = nk
        # (moved in to the innermost of them: no seat of the plan's inside the line)
        return f - [0.0, max(0.0, float((np.polyval(f, xs[keep]) - ys[keep]).max()))]
    c = 0.0
    for _ in range(3):
        a_end = end(c); fl, fr = side(-1, a_end, c), side(1, a_end, c)
        c = c + float((np.polyval(fr, a_end / 2) - np.polyval(fl, a_end / 2)) / 2)
    a_end = end(c); fl, fr = side(-1, a_end, c), side(1, a_end, c)
    return a_end, c, fl, fr
for t in TUNNELS[:4]:
    for _ in range(2):
        a_end, c, fl, fr = plan_cut(t['p'], t['u'])
        v = np.array([-t['u'][1], t['u'][0]])
        mid = lambda a_: c + (np.polyval(fr, a_) - np.polyval(fl, a_)) / 2
        t['p'] = t['p'] + v * mid(0.0); t['u'] = unit(t['u'] + v * (mid(1.0) - mid(0.0)))
    # the half-gap between the seats either side, along the axis
    t['gap'] = ((fl + fr) / 2).tolist(); t['gaps'] = (t['gap'], t['gap']); t['a_end'] = float(a_end)
    g_end = float(np.polyval(t['gap'], a_end))
    t['w'] = round(2 * (g_end - ROW_END), 2)          # the portal: the cut's walls run on into it
def gap_at(t, a, b):
    # the gap from the axis to the plan's seats on b's side of it, a along it
    return np.where(b < 0, np.polyval(t['gaps'][0], a), np.polyval(t['gaps'][1], a))
print('corner tunnel cuts', [(t['block'], t['p'].round(2).tolist(), t['u'].round(4).tolist(), round(t['a_end'], 1),
                              round(float(gap_at(t, 1.0, -1) + gap_at(t, 1.0, 1)) - 2 * (ROW_END + WALL_T), 2), round(t['w'] - 2 * WALL_T, 2)) for t in TUNNELS[:4]])
H2v = np.r_[H2]
V2 = vom_plan(H2v, 4, 0.9)
print('vom L2 (steps, open row, concourse)', V2)
VOM_LABEL = {n_: [] for n_ in LV}
VPLAN = {'L1': (V1, 2.5, None), 'L2': (V2, 2.4, FL2), 'L5': (V5, 2.4, None)}
for n_ in LV:
    V_, w_, fl_ = VPLAN[n_]
    for P, v in zip(VOMP[n_], BLK['levels'][n_]['voms']):
        # (none in a corner tunnel's open cut: one may stand over its covered
        # run, as over the real ones; the players' tunnel stops short of the walkway)
        if n_ == 'L1' and near_tunnel([t for t in TUNNELS[:4] if (P - t['p']) @ t['u'] < t['a_end'] + 1.0], P, 0.5): print('vom by a tunnel', v['label']); continue
        add_vom(n_, LV[n_], P, VOM_ROW[n_], V_, w_, fl=fl_); VOM_LABEL[n_].append((P, str(v['after'])))
n1, n2, n5 = (len(VOM_LABEL[k]) for k in ('L1', 'L2', 'L5'))
print('vomitories L1', n1, 'L2', n2, 'L5', n5, round(time.time() - T0, 1))

# made straight: a rectangle each, the rows too low to walk under cut away
# over it, the ones above left as the tunnel's roof
VOMS = {'L1': L1.make_voms(C1, head=2.2, cands=vom_masks['L1'], detect=False), 'L5': L5.make_voms(C5, head=2.2, cands=vom_masks['L5'], detect=False),
        'L2': L2.make_voms(V2[2], head=2.2, cands=vom_masks['L2'], detect=False)}
for v in VOMS['L2']: v['end'] = True           # to the club concourse under the tier, through doors
print('voms', {k: len(v) for k, v in VOMS.items()})

# ── the press box ──
# On Level 1 in the north stand, behind the walkway either side of the middle
# (Wembley's media guide: 186 places, a desk and a screen between every two):
# the plan leaves it unseated. Desks on every other row, seats behind them.
PRESS_Z = (14.0, 47.0); PRESS_ROWS = (31, 33, 35, 37, 39, 41)
def press_box(l):
    inreg = lambda P: (P[:, 0] > 40) & (np.abs(P[:, 1]) > PRESS_Z[0]) & (np.abs(P[:, 1]) < PRESS_Z[1])
    drop = inreg(l.seats) & (l.row >= PRESS_ROWS[0] - 1) & (l.row <= PRESS_ROWS[-1] + 1)
    l.seats, l.row, l.yaw = l.seats[~drop], l.row[~drop], l.yaw[~drop]
    gz, gx = np.gradient(cv2.GaussianBlur(l.d, (9, 9), 0))
    X_, Z_ = GX, GZ
    reg = (X_ > 40) & (np.abs(Z_) > PRESS_Z[0]) & (np.abs(Z_) < PRESS_Z[1])
    add, desks = [], []
    from skimage import measure
    for r in PRESS_ROWS:
        # along the row's middle, 0.6 m apart, end to end of each run of it
        # in the box (not over a gap in the tread: a vomitory's pit)
        for C in measure.find_contours(l.d, (r + 0.55) * l.D):
            Q = resample(np.c_[C[:, 1] * G.res + G.x0, C[:, 0] * G.res + G.z0], 0.05, closed=False)
            gi, gj = [np.round(c).astype(int) for c in G.g(Q[:, 0], Q[:, 1])]
            ok = inreg(Q) & (l.band[np.clip(gj, 0, G.H - 1), np.clip(gi, 0, G.W - 1)] == r)
            for a, b in zip(*[np.nonzero(np.diff(np.r_[0, ok.astype(np.int8), 0]) == k)[0] for k in (1, -1)]):
                L_ = (b - a - 1) * 0.05 - 0.6
                if L_ < 0: continue
                n = int(L_ / 0.6 + 1e-6) + 1; t0 = a * 0.05 + 0.3 + (L_ - (n - 1) * 0.6) / 2
                for k in range(n):
                    q = Q[min(int(round((t0 + k * 0.6) / 0.05)), len(Q) - 1)]; add.append((q[0], q[1], r))
        dm = ((l.band == r - 1) & reg & (l.d >= (r - 1) * l.D + 0.3)).astype(np.uint8)
        for poly in mask_polys(G, dm, eps=0.03, minarea=0.5):
            desks.append({'y0': round(float(l.h(r - 1)), 3), 'y': round(float(l.h(r)) + 0.72, 3), 'polys': poly})
    A_ = np.array(add); P_ = A_[:, :2]; R_ = A_[:, 2].astype(int)
    ii = np.clip(np.round(G.g(P_[:, 0], P_[:, 1])).astype(int), 0, [[G.W - 1], [G.H - 1]])
    g = np.c_[gx[ii[1], ii[0]], gz[ii[1], ii[0]]]; g /= np.linalg.norm(g, axis=1)[:, None] + 1e-9
    l.seats = np.r_[l.seats, P_]; l.row = np.r_[l.row, R_]; l.yaw = np.r_[l.yaw, np.arctan2(-g[:, 0], -g[:, 1])]
    return len(P_), desks
n_press, DESKS = press_box(L1)
print('press box seats', n_press, 'desks', len(DESKS))

# ── concourses ──
foot = cv2.morphologyEx(((L1.R | L2.R | L5.R) > 0).astype(np.uint8) | inside1.astype(np.uint8), cv2.MORPH_CLOSE, disk(60))
k_, lab_, st_, _ = cv2.connectedComponentsWithStats((1 - foot).astype(np.uint8), connectivity=4)
for i in range(1, k_):
    if st_[i, 4] < 0.5 * G.W * G.H and not (st_[i, 0] == 0 or st_[i, 1] == 0): foot[lab_ == i] = 1
outer = dil(foot, 6.0)
def rback(l):
    # per angle, the furthest out the stand reaches
    nb = 3600; bi = ((TH + np.pi) / (2 * np.pi) * nb).astype(int) % nb
    on = l.R > 0; rb = np.zeros(nb); np.maximum.at(rb, bi[on], RR[on])
    return rb[bi]
c1 = outer & ~inside1 & (L1.d >= V1[1] * L1.D) & L1.behind
c1 |= holes_mask['L1']
c2 = outer & (RR > rback(L2) + 0.05) & ~(L2.R > 0)
c5 = outer & (L5.d >= V5[1] * L5.D) & L5.behind
c5 |= holes_mask['L5']
print('masks', round(time.time() - T0, 1))

# the corner tunnels cut: the deck over each mouth, and how far each runs
TUNM = np.zeros_like(inside1)
body1 = (L1.hull > 0) | (L1.R > 0) | cv2.dilate(c1.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=3) > 0
CUT_WALLS = []
for t in TUNNELS:
    p, u = t['p'], t['u']; v = np.array([-u[1], u[0]])
    L_ = 2.0
    while L_ < t['Lmax']:
        q = p + u * L_; i_, j_ = [int(round(float(c))) for c in G.g(q[0], q[1])]
        if not body1[j_, i_]: break
        L_ += 0.2
    t['L'] = round(float(L_ + (0.0 if t['closed'] else 1.5)), 2)
    Q_ = np.c_[GX.ravel() - p[0], GZ.ravel() - p[1]]
    al = (Q_ @ u).reshape(G.H, G.W); lb = (Q_ @ v).reshape(G.H, G.W); la = np.abs(lb)
    m = (la < t['w'] / 2) & (al > -3.0) & (al < t['L'])
    TUNM |= m; t['mask'] = m
    corner = 'gap' in t
    if corner:
        # its clear height: the plan's first row over it stands a lintel above
        q = L1.seats - p; sa = q @ u; sb = np.abs(q @ v)
        over = (sa > t['a_end']) & (sa < t['a_end'] + 1.0) & (sb < t['w'] / 2)
        r_end = int(L1.row[over].min()) if over.any() else int(np.searchsorted(L1.hs, TUN_H + LINTEL))
        t['lintel'] = LINTEL; t['h'] = round(float(L1.h(r_end)) - LINTEL, 2)
        # the cut: out to the walls, which stand a row's end out from the seats
        e_ = np.minimum(gap_at(t, al, lb) - ROW_END - 0.12, t['w'] / 2)
        cut = (la < e_) & (al > -3.0) & (al < t['L'])
    else:
        t['lintel'] = DECK_T; cut = m
    # the deck: the rows over the mouth too low to roof it
    low = cut & (L1.band >= 0) & (L1.h(np.maximum(L1.band, 0)) < t['h'] + t['lintel'] - 0.01)
    t['deck'] = round(float(al[low].max()) + 0.05, 2) if low.any() else 0.0
    t['deck2'] = (t['deck'], t['deck'])
    if corner:
        # The portal's head is the front of the first row over it, so that
        # the rows run straight across it: the plan's way through the rows
        # is up to 12 degrees off square to them at the north corners, so
        # the portal is too (its two sides as deep as that row's front is
        # where it meets each wall), not the rows cut square to the tunnel.
        def front_at(sg):
            for a_ in np.arange(0.0, t['L'], 0.05):
                pr = p + u * a_ + v * sg * (t['w'] / 2 - 0.05)
                i_, j_ = [int(round(float(c))) for c in G.g(pr[0], pr[1])]
                if L1.d[j_, i_] >= r_end * L1.D: return round(float(a_), 2)
        t['deck2'] = (front_at(-1), front_at(1)); t['deck'] = round(sum(t['deck2']) / 2, 2)
        low = cut & (L1.band >= 0) & (L1.band < r_end)
    L1.R[low] = 0; L1.band[low] = -1; TUNM |= low
    q = L1.seats - p; sa = q @ u; sb = np.abs(q @ v)
    edge = np.minimum(gap_at(t, sa, q @ v) - ROW_END - 0.12, t['w'] / 2) if corner else t['w'] / 2 + 0.3 - 0.25
    keep = ~((sb < edge + 0.25) & (sa > -3) & ((L1.row < r_end) & (sa < t['L']) if corner else (sa < t['deck'] + 0.3)))
    L1.seats, L1.row, L1.yaw = L1.seats[keep], L1.row[keep], L1.yaw[keep]
    t['rect'] = [(p + u * a + v * b).round(3).tolist() for a, b in ((-3.0, -t['w'] / 2), (t['L'], -t['w'] / 2), (t['L'], t['w'] / 2), (-3.0, t['w'] / 2))]
    t['void'] = [(p + u * a + v * b).round(3).tolist() for a, b in ((t['deck2'][0], -t['w'] / 2), (t['L'], -t['w'] / 2), (t['L'], t['w'] / 2), (t['deck2'][1], t['w'] / 2))]
    if not corner: continue
    print('corner tunnel', t['block'], 'cut seats', int((~keep).sum()), 'portal row', r_end, 'clear', t['h'], 'portal sides at', t['deck2'])
    # its walls: from where the stand begins beside the cut to the portal, a
    # wall's thickness in from the treads, their tops a rail's height over the
    # rows beside them, straight
    for sg in (-1, 1):
        A, H, P0, P1 = [], [], [], []
        dk = t['deck2'][0 if sg < 0 else 1]
        for a_ in list(np.arange(-3.0, dk, 0.25)) + [dk]:
            gg = float(gap_at(t, a_, sg))
            pr = p + u * a_ + v * sg * (gg - ROW_END + 0.3)
            i_, j_ = [int(round(float(c))) for c in G.g(pr[0], pr[1])]
            r = L1.band[j_, i_]
            if r < 0 and not A: continue
            A.append(a_); H.append(float(L1.h(r)) if r >= 0 else H[-1])
            P0.append(p + u * a_ + v * sg * (gg - ROW_END)); P1.append(p + u * a_ + v * sg * (gg - ROW_END - WALL_T))
        A, H = np.array(A), np.array(H)
        top = H[0] + 1.0 + (H[-1] - H[0]) / max(A[-1] - A[0], 1e-6) * (A - A[0])
        top += max(0.0, float((H + 1.0 - top).max()))
        CUT_WALLS.append({'pts': [[round(float(x), 3), round(float(z), 3), round(float(y), 2)] for (x, z), y in zip(P0, top)],
                          'inner': [[round(float(x), 3), round(float(z), 3)] for x, z in P1]})
print('tunnels', [(t['L'], t['deck'], t['h']) for t in TUNNELS])

# ── stairs between the concourses, out in the ring behind the stands ──
WID = 1.6
def footprint(x0, z0, dx, dz, L, w, step=0.2):
    ts = np.arange(0, L + 1e-6, step); ws = np.arange(-w / 2, w / 2 + 1e-6, step)
    T, Wd = np.meshgrid(ts, ws); return np.c_[(x0 + dx * T - dz * Wd).ravel(), (z0 + dz * T + dx * Wd).ravel()]
def idx(pts):
    gx_, gz_ = G.g(pts[:, 0], pts[:, 1]); gx_ = np.round(gx_).astype(int); gz_ = np.round(gz_).astype(int)
    ok = (gx_ >= 0) & (gx_ < G.W) & (gz_ >= 0) & (gz_ < G.H)
    return gx_, gz_, ok
def fits(mask, pts):
    gx_, gz_, ok = idx(pts)
    return ok.all() and mask[gz_, gx_].all()
def level_z(l):
    r = np.maximum(l.band, 0); top = l.h(r)
    bot = np.vectorize(lambda rr, hh: l.bottom(int(rr), float(hh)))(r, top)
    return (l.band >= 0), bot, top
ZL = [level_z(l) for l in LV.values()]
def clear(pts, y0, y1):
    gx_, gz_, ok = idx(pts)
    if not ok.all(): return False
    for on, bot, top in ZL:
        o_ = on[gz_, gx_]
        if not o_.any(): continue
        b = bot[gz_, gx_][o_]; t = top[gz_, gx_][o_]
        if ((b < y1 + 2.2) & (t > y0 - 0.2)).any(): return False
    return True
used = np.zeros_like(inside1)
for f in flights:
    fp = footprint(f['x'], f['z'], f['dx'], f['dz'], f['L'], 2.6, 0.1)
    gx_, gz_, ok = idx(fp); used[gz_[ok], gx_[ok]] = True
def mark(f):
    for fp in (footprint(f['x'], f['z'], f['dx'], f['dz'], f['L'], WID + 1.2, 0.1), footprint(f['x'] + f['dx'] * f['L'], f['z'] + f['dz'] * f['L'], f['dx'], f['dz'], 2.2, WID + 1.2, 0.1), footprint(f['x'] - f['dx'] * 2, f['z'] - f['dz'] * 2, f['dx'], f['dz'], 2.2, WID + 1.2, 0.1)):
        gx_, gz_, ok = idx(fp); used[gz_[ok], gx_[ok]] = True
def find_flight(lower, upper, y0, y1, near):
    n = int(np.ceil((y1 - y0) / RISE)); L = n * RUN
    for r in np.arange(0, 24, 0.8):
        for a in np.linspace(0, 2 * np.pi, max(8, int(r * 4)), endpoint=False):
            x0 = near[0] + r * np.cos(a); z0 = near[1] + r * np.sin(a)
            # run along the ring, either way
            th = np.arctan2(x0, z0)
            for s in (1, -1):
                dx, dz = s * np.cos(th), -s * np.sin(th)
                fp = footprint(x0, z0, dx, dz, L, WID); top = footprint(x0 + dx * L, z0 + dz * L, dx, dz, 1.8, WID)
                bot = footprint(x0 - dx * 1.8, z0 - dz * 1.8, dx, dz, 1.8, WID)
                if fits(lower, fp) and fits(lower, bot) and fits(upper, top) and fits(~used, fp) and fits(~used, top) and clear(fp, y0, y1) and clear(top, y1, y1):
                    return dict(x=round(float(x0), 2), z=round(float(z0), 2), dx=round(float(dx), 4), dz=round(float(dz), 4), n=n, L=round(L, 3), y0=y0, y1=y1, w=WID)
def ring_pt(ang, l, off):
    # a point off metres beyond the back of stand l, at angle ang (deg, about the centre)
    a = np.radians(ang); rb = rback(l)
    m = (np.abs(np.degrees(np.arctan2(np.sin(TH - a), np.cos(TH - a)))) < 0.3) & (l.R > 0)
    r = RR[m].max() if m.any() else 120
    return (float(np.sin(a) * (r + off)), float(np.cos(a) * (r + off)))
stairs = []
for ang in (25, 65, 115, 155, 205, 245, 295, 335):
    for lo, up, y0, y1 in ((c1, c2, C1, C2), (c2, c5, C2, C5)):
        p = ring_pt(ang, L5, 3.0)
        f = find_flight(lo, up, y0, y1, p)
        print('flight', ang, y0, y1, f and {k: v for k, v in f.items() if k in ('x', 'z', 'n')})
        if f: stairs.append(f); mark(f)
for f in stairs:
    fp = footprint(f['x'], f['z'], f['dx'], f['dz'], f['L'] - 0.3, WID + 0.4, step=0.05)
    gx_, gz_, ok = idx(fp)
    for c, y in ((c1, C1), (c2, C2), (c5, C5)):
        if f['y0'] < y <= f['y1'] + 0.01: c[gz_[ok], gx_[ok]] = False
flights += stairs
print('stairs', len(stairs), round(time.time() - T0, 1))

# ── out ──
def outside_fn(pairs):
    def f(ox, oy):
        for m, y in pairs:
            if m[oy, ox]: return y
        return None
    return f
grow = lambda c: cv2.dilate(c.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=3) > 0
slabs = [(grow_under(c, y, [L1, L2, L5]), y0, y) for c, y0, y in ((c1, 0.0, C1), (c2, C2 - 0.35, C2), (c5, C5 - 0.35, C5))]
# the corner tunnels on under the concourse: its floor over them is a slab
# from the tunnel's roof up
s1_ = slabs[0][0]; slabs[0] = (s1_ & ~TUNM, 0.0, C1)
for t in TUNNELS:
    if (s1_ & t['mask']).any(): slabs.insert(1, (s1_ & t['mask'], t['h'], C1))
# ── the concourses closed in ──
t_ = time.time()
# the club tier's rear walkway: between the back of Level 2 and the front of
# Level 5 above (which stands 1.6-7 m further out), open to the bowl, with the
# boxes' and the concourse's wall and doors behind it under Level 5's front
WALK2 = c2 & (L5.d < 0.4) & dil(L2.R > 0, 9.0)
def door_out(p):
    q = np.array(p, float); u = q / (np.linalg.norm(q) + 1e-9)
    for _ in range(120):
        i_, j_ = [int(round(float(c))) for c in G.g(q[0], q[1])]
        if not WALK2[j_, i_] and not (L2.R[j_, i_] > 0): break
        q = q + u * 0.1
    return [round(float(q[0]), 2), round(float(q[1]), 2)]
doors2 = [door_out(p) for p in L2.aisle_doors()]
print('walkway L2', int(WALK2.sum() * G.res ** 2), 'm2; doors', len(doors2))
rooms = [{'name': 'L1', 'mask': c1, 'y': C1, 'cl': 4.0, 'own': [L1], 'doors': [], 'open': L1.pits},
         {'name': 'L2', 'mask': c2, 'y': C2, 'cl': 4.0, 'own': [L2], 'doors': doors2, 'walk': WALK2},
         {'name': 'L5', 'mask': c5, 'y': C5, 'cl': 4.0, 'own': [L5], 'doors': [], 'open': L5.pits}]
trim_tunnels(G, VOMS['L1'], c1); trim_tunnels(G, VOMS['L5'], c5)
# numbered round each level from the north, as Wembley's blocks are
for name, vs in VOMS.items():
    vs.sort(key=lambda v: np.arctan2(v['p'][1], v['p'][0]) % (2 * np.pi))
    # each carries the block it serves, as the official maps number them
    for v in vs: v['label'] = min(VOM_LABEL[name], key=lambda q: np.hypot(*(q[0] - v['p'])))[1]
encl, roomtop = enclose(G, rooms, [L1, L2, L5], slabs, flights)
flights += FL2
print('enclose', round(time.time() - t_, 1), {k: len(v) for k, v in encl.items()})
skip = lambda ox, oy, h: roomtop[oy, ox] >= h + 1.0 or (WALK2[oy, ox] and abs(h - C2) <= 0.6)
fronts = {'L2': ('tread', 0.8), 'L5': ('tread', 0.8)}
from shapely.geometry import Polygon, MultiPolygon
def tunnel_rows(rows):
    # over a corner tunnel the rows stand on its flat roof, not the ground; a
    # row too low for that, which reaches back a little under the next one up,
    # stops at the tunnel's mouth rather than standing in it
    rects = [(Polygon(t['rect']), t['h'], t['lintel'], Polygon(t['void'])) for t in TUNNELS]
    hmax = max(th for _, th, _, _ in rects)
    out = []
    for r in rows:
        if r['y0'] >= hmax: out.append(r); continue
        keep, over = [], {}
        for polys in r['polys']:
            g = Polygon(polys[0], polys[1:]).buffer(0)
            for rc, th, lt, vd in rects:
                if r['y0'] >= th: continue
                if r['y'] < th + lt: g = g.difference(vd); continue
                i_ = g.intersection(rc)
                if not i_.is_empty: over.setdefault(th, []).append(i_)
                g = g.difference(rc)
            keep.append(g)
        def emit(geoms):
            ps = []
            for g in geoms:
                for q in (g.geoms if hasattr(g, 'geoms') else [g]):
                    if q.geom_type != 'Polygon' or q.area < 0.05: continue
                    ps.append([[[round(float(x), 2), round(float(z), 2)] for x, z in list(q.exterior.coords)[:-1]]] +
                              [[[round(float(x), 2), round(float(z), 2)] for x, z in list(h.coords)[:-1]] for h in q.interiors])
            return ps
        out.append({**r, 'polys': emit(keep)})
        for th, gs in over.items():
            ov = emit(gs)
            if ov: out.append({**r, 'y0': th, 'polys': ov})
    return out
levels = []
spec = {'L1': ((inside1, 0.0), (c1, C1)), 'L2': ((c2, C2),), 'L5': ((c5, C5),)}
flushmode = {'L1': 'open', 'L2': 'doors', 'L5': 'open'}
for name, l in LV.items():
    rails, walls = edge_walls(G, l, outside_fn(spec[name]), l.aisle_doors() if name == 'L2' else (), flush=flushmode[name], skip=skip, front=fronts.get(name))
    if fronts.get(name): rails += front_parapet(G, l, fronts[name])
    holes = []
    rows_ = l.rows_out()
    if name == 'L1': rows_ = tunnel_rows(rows_)
    levels.append({'name': name, 'D': l.D, 'h0': float(l.h(0)), 'rise': 0, 'hs': [round(float(v), 3) for v in l.hs],
                   'rows': rows_, 'steps': l.aisles_out(), 'holes': holes, 'voms': VOMS.get(name, []),
                   'seats': l.seats_out(scale=100), 'seatScale': 100, 'rails': rails, 'walls': walls + extra_walls.get(name, [])})
    print(name, 'rows', len(levels[-1]['rows']), 'steps', len(levels[-1]['steps']), 'holes', len(holes), 'rails', len(rails), 'walls', len(walls), 'seats', len(l.seats))
# Level 5's aisles at the north side's steps: where the corner blocks' rows
# and the north side's meet at different heights, a wall with a rail on it
def aisle_walls(l, aisles):
    out = []
    bots = np.array([l.bot(r) for r in range(l.nrows)])
    def at(q):
        i_, j_ = [int(round(float(c))) for c in G.g(q[0], q[1])]
        b = l.band[j_, i_]
        return (float(l.h(b)), float(bots[b])) if b >= 0 else None
    for M, t in aisles:
        n = np.array([t[1], -t[0]]); cur = None
        for u in np.arange(0.0, 60.0, 0.25):
            q = M + n * u; a, b = at(q - t * 0.35), at(q + t * 0.35)
            seg = None
            if a and b and abs(a[0] - b[0]) > 0.05:
                seg = (round(min(a[1], b[1]), 2), round(max(a[0], b[0]) + 1.0, 2))
            if cur and seg and abs(seg[0] - cur[2][0]) < 0.02 and abs(seg[1] - cur[2][1]) < 0.02: cur[1] = u + 0.25; continue
            if cur: out.append(cur)
            cur = [u, u + 0.25, seg] if seg else None
        if cur: out.append(cur)
        out = [c for c in out if c]
        yield from ([*(M + n * c[0]).round(2).tolist(), *(M + n * c[1]).round(2).tolist(), c[2][0], c[2][1]] for c in out)
        out = []
for lv in levels:
    if lv['name'] == 'L5': lv['walls'] += list(aisle_walls(L5, AISLES5))
# the bays in Level 5's front: the big screens' housings at the ends, the
# media box on the south side, filling each up to the rows behind it
bays_out = []
for b in BAYS5:
    A, B = b['actual'], b['bridge']
    dep = float(cKDTree(resample(B, 0.1, closed=False)).query(A)[0].max())
    top = float(L5.h(int(np.ceil(dep / L5.D))))
    mid = (A[0] + A[-1]) / 2
    bays_out.append({'ring': poly_out([np.r_[A, B[::-1][1:-1]]], 2)[0], 'mouth': [B[0].round(2).tolist(), B[-1].round(2).tolist()],
                     'front': poly_out([B], 2)[0], 'depth': round(dep, 2), 'y1': round(top, 2), 'y0': round(float(L5.h(0)) - 1.5, 2),
                     'kind': 'screen' if abs(mid[1]) > 90 else 'box'})
print('bays', [(b['kind'], b['depth'], b['y1']) for b in bays_out])
tunnels_out = [{'p': t['p'].round(3).tolist(), 'u': t['u'].round(4).tolist(), 'w': t['w'], 'h': t['h'], 'L': t['L'], 'deck': t['deck'], 'deckY': round(t['h'] + t['lintel'], 2), 'closed': t['closed'],
                **({'sidesAsWalls': True, 'deck2': list(t['deck2'])} if 'gap' in t else {})} for t in TUNNELS]
floors = [{'y': y, 'y0': y0, 'polys': mask_polys(G, m)} for m, y0, y in slabs]
ow = contours(G, outer.astype(np.uint8), eps=0.03, minarea=100)
fw = contours(G, inside1.astype(np.uint8), eps=0.03, minarea=100)
# the roof: over every seat, open over the pitch a few rows in from the front
roof_in = contours(G, dil(inside1, 5.0).astype(np.uint8), eps=0.04, minarea=100)
data = {'levels': levels, 'floors': floors, 'flights': flights, 'outer': [poly_out(p) for p in ow],
        'field': [poly_out(p) for p in fw], 'roofIn': [poly_out(p) for p in roof_in],
        'concourse': {'L1': C1, 'L2': C2, 'L5': C5}, 'rooms': encl, 'bays': bays_out, 'tunnels': tunnels_out, 'desks': DESKS, 'cutWalls': CUT_WALLS, 'cutWallTone': 0.85}
json.dump(data, open('wb_stands.json', 'w'), separators=(',', ':'))
import os; print('json KB', os.path.getsize('wb_stands.json') // 1024, round(time.time() - T0, 1))
pickle.dump({'c1': c1, 'c2': c2, 'c5': c5, 'inside1': inside1, 'outer': outer}, open('wb_masks.pkl', 'wb'))
