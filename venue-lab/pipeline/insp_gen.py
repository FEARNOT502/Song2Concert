# Inspire Arena -> stand data for the renderer: the three tiers from the seats
# (insp_seats.py), the concourses behind and under them, the stairs between
# them, the doors, the concourses closed in, the retracted 100s' stacks.
import sys, json, time, numpy as np, cv2
sys.path.insert(0, '.')
from standlib import Grid, disk, contours
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under
T0 = time.time()
o = np.load('insp/insp_seats.npy', allow_pickle=True).item()
G = Grid(-72, 72, -74, 74, 0.1)
gy, gx = np.mgrid[0:G.H, 0:G.W]; GX, GZ = G.m(gx, gy)
def dil(m, r): return cv2.dilate(m.astype(np.uint8), disk(r / G.res)) > 0
tier = lambda t: np.vstack([v['seats'] for v in o.values() if v['tier'] == t])
# heights: the 100s a telescopic stand off the floor; the 200s over a fascia
# behind them; the 300s overhanging the 200s' backs
# (the rigging grid is 23 m over the floor, and from the 300s' back rows it
# is still well overhead)
H1, R1 = 0.45, 0.33
H2, R2 = 5.9, 0.40
H3, R3 = 13.8, 0.48
def fronts_of(t):
    # each section's own front edge, drawn in: the rows count back from it
    F = G.empty()
    for v in o.values():
        if v['tier'] != t: continue
        a, b = v['front']; ax, az = G.g(a[0], a[1]); bx, bz = G.g(b[0], b[1])
        cv2.line(F, (int(round(float(ax))), int(round(float(az)))), (int(round(float(bx))), int(round(float(bz)))), 1, 2)
    return F
L1 = Level(G, '100', tier(1), 0.85, H1, R1, 'ground', centre=(0, 0), rmax=90, hull_close=2.0, open_w=6.0, F=fronts_of(1))
L2 = Level(G, '200', tier(2), 0.80, H2, R2, 0.5, 1.6, centre=(0, 0), rmax=90, hull_close=2.5, open_w=6.0, F=fronts_of(2))
L3 = Level(G, '300', tier(3), 0.88, H3, R3, 0.5, 2.2, centre=(0, 0), rmax=90, hull_close=2.5, open_w=6.0, F=fronts_of(3))
from standlib import sample
def redepth(l, t):
    # depth straight back from each section's own front, so every section's
    # rows run parallel to its front and count as the plan counts them
    secs = [v for v in o.values() if v['tier'] == t]
    S = np.vstack([v['seats'] for v in secs]); k = np.concatenate([[i] * len(v['seats']) for i, v in enumerate(secs)])
    fx = np.array([v['facing'][0] for v in secs]); fz = np.array([v['facing'][1] for v in secs])
    s0 = np.array([max(v['front'][0] @ v['facing'], v['front'][1] @ v['facing']) for v in secs])
    seed = np.ones((G.H, G.W), np.uint8); lab_of = np.zeros((G.H, G.W), np.int32)
    gx_, gz_ = G.g(S[:, 0], S[:, 1]); gx_ = np.clip(np.round(gx_).astype(int), 0, G.W - 1); gz_ = np.clip(np.round(gz_).astype(int), 0, G.H - 1)
    seed[gz_, gx_] = 0; lab_of[gz_, gx_] = k
    _, lab = cv2.distanceTransformWithLabels(seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(seed == 0); sec_of_label = np.r_[0, lab_of[zy, zx]]
    sec = sec_of_label[lab]
    l.d = (s0[sec] - (GX * fx[sec] + GZ * fz[sec])).astype(np.float32)
    l.row = np.concatenate([v['row'] for v in secs]).astype(int)      # the rows as the plan numbers them
    l.nrows = int(l.row.max()) + 1
    l.band = np.where(l.R > 0, np.clip(np.floor(l.d / l.D).astype(int), 0, l.nrows - 1), -1)
    # each seat by its own section's front (a seat on the line between two
    # sections must not take its neighbour's)
    f = np.c_[fx[k], fz[k]]
    ds = s0[k] - (l.seats * f).sum(1)
    l.seats = l.seats - f * ((l.row * l.D + l.D * 0.55) - ds)[:, None]
    l.yaw = np.arctan2(f[:, 0], f[:, 1])
for l, t in ((L1, 1), (L2, 2), (L3, 3)): redepth(l, t)
print('levels', round(time.time() - T0, 1), {l.name: (l.nrows, len(l.seats)) for l in (L1, L2, L3)})
C2 = round(H2 + R2 * 9, 2)            # level with the backs of the ten-row sections
C3 = round(H3 + R3 * 10, 2)           # the 300s' back row
print('concourses', C2, C3)

# ── the building ──
allm = (L1.R | L2.R | L3.R) > 0
# the building: the bowl's outline, made square to its axes (the east side,
# with the boxes over its 200s, as deep as the west), 6 m out
ys_, xs_ = np.nonzero(allm)
X_, Z_ = G.m(xs_, ys_)
pts = np.r_[np.c_[X_, Z_], np.c_[-X_, Z_]]
hp = cv2.convexHull(np.c_[G.g(pts[:, 0], pts[:, 1])].astype(np.float32))
hull = G.empty(); cv2.fillPoly(hull, [np.round(hp).astype(np.int32)], 1); hull = hull > 0
outer = dil(hull, 6.0)
# the floor: inside the 100s' fronts, and on to the stage end
floor = ~L1.behind & ~L2.behind & ~L3.behind & outer

# ── concourses ──
# ground: under the 200s and out to the wall, behind a wall under their front
c1 = outer & L2.behind & (L1.R == 0) & ~dil(L1.R > 0, 1.2) & (L2.d > 0.0)
# 2nd floor: behind the 200s' backs, under the 300s, out to the wall
c2 = outer & L2.behind & (L2.R == 0) & (L2.d > 2.0) & ~((L2.hull > 0) & (L2.d < 6.0))
# 3rd floor: behind the 300s
c3 = outer & L3.behind & (L3.R == 0) & (L3.d > 2.0) & ~((L3.hull > 0) & (L3.d < 6.0))
def tidy(c, w=1.0, minarea=40):
    op = cv2.morphologyEx(c.astype(np.uint8), cv2.MORPH_OPEN, disk(w / 2 / G.res))
    n, lab, st, _ = cv2.connectedComponentsWithStats(op, connectivity=8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] * G.res ** 2 >= minarea
    return keep[lab]
c1, c2, c3 = tidy(c1), tidy(c2), tidy(c3)
print('masks', round(time.time() - T0, 1), [int(c.sum() * G.res ** 2) for c in (c1, c2, c3)])

# ── stairs between the concourses, in the corners ──
RISE, RUN, WID = 0.19, 0.28, 1.6
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
    r = np.maximum(l.band, 0); top = l.h0 + l.rise * r
    if l.bottom == 'ground': bot = np.zeros_like(top)
    else: bot = top - np.where(r == 0, l.fascia, l.bottom)
    return (l.band >= 0), bot, top
ZL = [level_z(l) for l in (L1, L2, L3)]
def clear(pts, y0, y1):
    gx_, gz_, ok = idx(pts)
    if not ok.all(): return False
    for on, bot, top in ZL:
        o_ = on[gz_, gx_]
        if not o_.any(): continue
        b = bot[gz_, gx_][o_]; t = top[gz_, gx_][o_]
        if ((b < y1 + 2.2) & (t > y0 - 0.2)).any(): return False
    return True
used = np.zeros_like(allm)
def mark(f):
    for fp in (footprint(f['x'], f['z'], f['dx'], f['dz'], f['L'], WID + 1.2, 0.1), footprint(f['x'] + f['dx'] * f['L'], f['z'] + f['dz'] * f['L'], f['dx'], f['dz'], 2.2, WID + 1.2, 0.1), footprint(f['x'] - f['dx'] * 2, f['z'] - f['dz'] * 2, f['dx'], f['dz'], 2.2, WID + 1.2, 0.1)):
        gx_, gz_, ok = idx(fp); used[gz_[ok], gx_[ok]] = True
def find_flight(lower, upper, y0, y1, near):
    n = int(np.ceil((y1 - y0) / RISE)); L = n * RUN
    dirs = [(np.cos(t), np.sin(t)) for t in np.linspace(0, 2 * np.pi, 16, endpoint=False)]
    for r in np.arange(0, 22, 0.8):
        for a in np.linspace(0, 2 * np.pi, max(8, int(r * 4)), endpoint=False):
            x0 = near[0] + r * np.cos(a); z0 = near[1] + r * np.sin(a)
            for dx, dz in dirs:
                fp = footprint(x0, z0, dx, dz, L, WID); top = footprint(x0 + dx * L, z0 + dz * L, dx, dz, 1.8, WID)
                bot = footprint(x0 - dx * 1.8, z0 - dz * 1.8, dx, dz, 1.8, WID)
                if fits(lower, fp) and fits(lower, bot) and fits(upper, top) and fits(~used, fp) and fits(~used, top) and clear(fp, y0, y1) and clear(top, y1, y1):
                    return dict(x=round(float(x0), 2), z=round(float(z0), 2), dx=round(float(dx), 4), dz=round(float(dz), 4), n=n, L=round(L, 3), y0=y0, y1=y1, w=WID)
flights = []
for sx in (1, -1):
    for sz in (1, -1):
        for lo, up, y0, y1, near in ((c1, c2, 0.0, C2, (sx * 45, sz * 52)), (c2, c3, C2, C3, (sx * 40, sz * 58))):
            f = find_flight(lo, up, y0, y1, near)
            print('flight', sx, sz, y0, y1, f and (f['x'], f['z']))
            if f: flights.append(f); mark(f)
for f in flights:
    fp = footprint(f['x'], f['z'], f['dx'], f['dz'], f['L'] - 0.3, WID + 0.4, step=0.05)
    gx_, gz_, ok = idx(fp)
    for c, y in ((c2, C2), (c3, C3)):
        if f['y0'] < y <= f['y1'] + 0.01: c[gz_[ok], gx_[ok]] = False
print('stairs', len(flights), round(time.time() - T0, 1))

# ── doors ──
# ground floor: in the wall under the 200s' front, where the 100s leave a gap
# (between sections, at their ends) and every 14 m along it
front2 = (L2.F > 0) & ~dil(L1.R > 0, 0.8)
ys, xs = np.nonzero(front2)
FX, FZ = G.m(xs, ys)
d1 = []
ang = np.arctan2(FZ, FX); order = np.argsort(ang); last = None
for i in order:
    p = np.array([FX[i], FZ[i]])
    if last is None or np.linalg.norm(p - last) > 14: d1.append((float(p[0]), float(p[1]))); last = p
print('ground doors', len(d1))

# a door at the back of every section, on its centre line (the 扉 the plan's
# numbers are posted over), besides those at the heads of the aisles
def back_doors(t):
    out = []
    for v in o.values():
        if v['tier'] != t: continue
        f = v['facing']; u = np.array([-f[1], f[0]])
        s0 = max(v['front'][0] @ f, v['front'][1] @ f)
        uc = float(np.mean(v['seats'] @ u)); n = int(v['row'].max()) + 1
        p = u * uc + f * (s0 - n * {1: 0.85, 2: 0.80, 3: 0.88}[t])
        out.append((float(p[0]), float(p[1])))
    return out
# ── the concourses closed in ──
slabs = [(grow_under(c2, C2, [L1, L2, L3]), C2 - 0.35, C2), (grow_under(c3, C3, [L1, L2, L3]), C3 - 0.35, C3)]
t_ = time.time()
rooms = [{'name': 'G', 'mask': c1, 'y': 0.0, 'cl': 4.9, 'own': [L2], 'doors': d1},
         {'name': '2F', 'mask': c2, 'y': C2, 'cl': 3.8, 'own': [L2], 'doors': L2.aisle_doors() + back_doors(2)},
         {'name': '3F', 'mask': c3, 'y': C3, 'cl': 3.6, 'own': [L3], 'doors': L3.aisle_doors() + back_doors(3)}]
encl, roomtop = enclose(G, rooms, [L1, L2, L3], slabs, flights)
print('enclose', round(time.time() - t_, 1), {k: len(v) for k, v in encl.items()})
skip = lambda ox, oy, h: roomtop[oy, ox] >= h + 1.0
def outside_fn(pairs):
    def f(ox, oy):
        for m, y in pairs:
            if m[oy, ox]: return y
        return None
    return f
spec = {'100': ((floor, 0.0),), '200': ((c2, C2),), '300': ((c3, C3),)}
fronts = {'100': (0.0, 0.7), '200': ('tread', 0.9), '300': ('tread', 0.9)}
levels = []
for l in (L1, L2, L3):
    rails, walls = edge_walls(G, l, outside_fn(spec[l.name]), l.aisle_doors(), skip=skip, front=fronts[l.name])
    levels.append({'name': l.name, 'D': l.D, 'h0': l.h0, 'rise': l.rise, 'rows': l.rows_out(), 'steps': l.aisles_out(), 'holes': [],
                   'seats': l.seats_out(), 'rails': rails, 'walls': walls})
    print(l.name, 'rows', len(levels[-1]['rows']), 'steps', len(levels[-1]['steps']), 'rails', len(rails), 'walls', len(walls))
floors = [{'y': y, 'y0': y0, 'polys': mask_polys(G, m)} for m, y0, y in slabs]
ow = contours(G, outer.astype(np.uint8), eps=0.03, minarea=100)
# the 100s folded away: each section's stack against the wall behind it
stack = (L1.R > 0) & (L1.d >= (L1.nrows - 2.2) * L1.D)
# the 200s' front all the way round, for the ribbon board along it
bowl2 = (~L2.behind & outer & ~dil(L2.R > 0, 0.3)).astype(np.uint8)
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(bowl2, connectivity=4)
big = 1 + int(np.argmax(st_[1:, 4]))
rr = contours(G, (lab_ == big).astype(np.uint8), eps=0.05, minarea=100)
rim = [[round(float(x), 2), round(float(z), 2)] for x, z in rr[0][0]]
# the ribbon board: round the join of the 200s and the tier over them — the
# 300s' front, and on the east, where the boxes are, the wall under them
over = L3.behind | (c2 & ~L3.behind)
bowl3 = (outer & ~over & ~dil(over, 0.3)).astype(np.uint8)
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(bowl3, connectivity=4)
big = 1 + int(np.argmax(st_[1:, 4]))
rr = contours(G, (lab_ == big).astype(np.uint8), eps=0.05, minarea=100)
ribbon = [[round(float(x), 2), round(float(z), 2)] for x, z in rr[0][0]]
data = {'levels': levels, 'floors': floors, 'flights': flights, 'outer': [poly_out(p) for p in ow],
        'stacks': [poly_out(p, 2) for p in contours(G, stack, eps=0.03, minarea=1.0)],
        'rim': rim, 'rimY': round(H2 - 1.6 + 0.5, 2), 'ribbon': ribbon, 'ribbonY': round(H3 - 1.4, 2),
        'concourse': {'2F': C2, '3F': C3}, 'rooms': encl}
json.dump(data, open('insp_stands.json', 'w'), separators=(',', ':'))
import os; print('json KB', os.path.getsize('insp_stands.json') // 1024, round(time.time() - T0, 1))
