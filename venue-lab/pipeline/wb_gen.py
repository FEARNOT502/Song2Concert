# Wembley stands: seats read off the seatingplan.net plan (wb/wseats.py) ->
# stand data. World frame: x north, z east, about the pitch centre.
import sys, json, time, pickle, numpy as np, cv2
sys.path.insert(0, '.')
from standlib import Grid, disk, contours, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, trim_tunnels
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
flights = []; holes_mask = {'L1': np.zeros_like(inside1), 'L5': np.zeros_like(inside1)}; vom_masks = {'L1': [], 'L5': []}
extra_walls = {'L1': [], 'L5': []}
def add_vom(n_, l, P, bw, V, width):
    nsteps, ro, C = V
    m, keep, nv = cut_tunnel(n_, l, P, bw, ro, width)
    l.seats, l.row, l.yaw = l.seats[keep], l.row[keep], l.yaw[keep]
    holes_mask[n_] |= m; vom_masks[n_].append(m)
    # the steps: from the concourse at the back of the mouth up to the walkway
    Pf = P + nv * ((bw + 1 - (bw + 0.55)) * l.D)          # the walkway's back edge
    L_ = nsteps * RUN
    x0, z0 = Pf + nv * L_
    flights.append(dict(x=round(float(x0), 2), z=round(float(z0), 2), dx=round(float(-nv[0]), 4), dz=round(float(-nv[1]), 4), n=nsteps, L=round(L_, 3), y0=C, y1=float(l.h(bw)), w=min(1.8, width - 0.4)))
    # under a slab walkway, close the face below it
    if l.bottom(bw, float(l.h(bw))) > C + 0.05:
        t = np.array([-nv[1], nv[0]]) * width / 2
        a, b = Pf + t, Pf - t
        extra_walls[n_].append([round(float(a[0]), 2), round(float(a[1]), 2), round(float(b[0]), 2), round(float(b[1]), 2), round(C, 2), round(float(l.bottom(bw, float(l.h(bw)))), 2)])
# L1: a tunnel into each stretch of the walkway behind row 28 (every 14 m of it)
runs1 = seat_free_runs(L1, 29, 3.5, 60)
n1 = 0
for c, L_, a, b in runs1:
    k = max(1, int(round(L_ / 14)))
    for i in range(k):
        P = a + (b - a) * (i + 0.5) / k
        add_vom('L1', L1, P, 29, V1, 2.4); n1 += 1
# L5: in every other aisle, a third of the way up
runs5 = seat_free_runs(L5, 12, 1.0, 3.0)
n5 = 0
for i, (c, L_, a, b) in enumerate(runs5):
    if i % 2: continue
    add_vom('L5', L5, c, 12, V5, 2.2); n5 += 1
print('vomitories L1', n1, 'L5', n5, round(time.time() - T0, 1))
# made straight: a rectangle each, the rows too low to walk under cut away
# over it, the ones above left as the tunnel's roof
VOMS = {'L1': L1.make_voms(C1, head=2.2, cands=vom_masks['L1'], detect=False), 'L5': L5.make_voms(C5, head=2.2, cands=vom_masks['L5'], detect=False)}
print('voms', {k: len(v) for k, v in VOMS.items()})

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
# ── the concourses closed in ──
t_ = time.time()
rooms = [{'name': 'L1', 'mask': c1, 'y': C1, 'cl': 4.0, 'own': [L1], 'doors': [], 'open': L1.pits},
         {'name': 'L2', 'mask': c2, 'y': C2, 'cl': 4.0, 'own': [L2], 'doors': L2.aisle_doors()},
         {'name': 'L5', 'mask': c5, 'y': C5, 'cl': 4.0, 'own': [L5], 'doors': [], 'open': L5.pits}]
trim_tunnels(G, VOMS['L1'], c1); trim_tunnels(G, VOMS['L5'], c5)
# numbered round each level from the north, as Wembley's blocks are
for name, vs in VOMS.items():
    vs.sort(key=lambda v: np.arctan2(v['p'][1], v['p'][0]) % (2 * np.pi))
    for i, v in enumerate(vs): v['label'] = f"{name[1]}{i + 1:02d}"
encl, roomtop = enclose(G, rooms, [L1, L2, L5], slabs, flights)
print('enclose', round(time.time() - t_, 1), {k: len(v) for k, v in encl.items()})
skip = lambda ox, oy, h: roomtop[oy, ox] >= h + 1.0
fronts = {'L2': ('tread', 0.8), 'L5': ('tread', 0.8)}
levels = []
spec = {'L1': ((inside1, 0.0), (c1, C1)), 'L2': ((c2, C2),), 'L5': ((c5, C5),)}
flushmode = {'L1': 'open', 'L2': 'doors', 'L5': 'open'}
for name, l in LV.items():
    rails, walls = edge_walls(G, l, outside_fn(spec[name]), l.aisle_doors() if name == 'L2' else (), flush=flushmode[name], skip=skip, front=fronts.get(name))
    holes = []
    levels.append({'name': name, 'D': l.D, 'h0': float(l.h(0)), 'rise': 0, 'hs': [round(float(v), 3) for v in l.hs],
                   'rows': l.rows_out(), 'steps': l.aisles_out(), 'holes': holes, 'voms': VOMS.get(name, []),
                   'seats': l.seats_out(), 'rails': rails, 'walls': walls + extra_walls.get(name, [])})
    print(name, 'rows', len(levels[-1]['rows']), 'steps', len(levels[-1]['steps']), 'holes', len(holes), 'rails', len(rails), 'walls', len(walls), 'seats', len(l.seats))
floors = [{'y': y, 'y0': y0, 'polys': mask_polys(G, m)} for m, y0, y in slabs]
ow = contours(G, outer.astype(np.uint8), eps=0.03, minarea=100)
fw = contours(G, inside1.astype(np.uint8), eps=0.03, minarea=100)
# the roof: over every seat, open over the pitch a few rows in from the front
roof_in = contours(G, dil(inside1, 5.0).astype(np.uint8), eps=0.04, minarea=100)
data = {'levels': levels, 'floors': floors, 'flights': flights, 'outer': [poly_out(p) for p in ow],
        'field': [poly_out(p) for p in fw], 'roofIn': [poly_out(p) for p in roof_in],
        'concourse': {'L1': C1, 'L2': C2, 'L5': C5}, 'rooms': encl}
json.dump(data, open('wb_stands.json', 'w'), separators=(',', ':'))
import os; print('json KB', os.path.getsize('wb_stands.json') // 1024, round(time.time() - T0, 1))
pickle.dump({'c1': c1, 'c2': c2, 'c5': c5, 'inside1': inside1, 'outer': outer}, open('wb_masks.pkl', 'wb'))
