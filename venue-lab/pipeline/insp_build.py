# Inspire Arena, Incheon: the stands as exact planes. A very angular bowl —
# straight sides, 45-degree corners — so every section is laid out here as
# a polygon of straight lines: its front on the tier's front line, its back
# its own rows deep, its sides the aisles (between two sections facing the
# same way, the middle of the gap between them on the plan; round a corner,
# the line where the two sections' rows meet at equal depth, so the treads
# either side of it are at the same heights). The sections, their facings
# and their widths come from the ticketing plan (insp/svg_secs.json, a
# schematic to about 0.31 m a unit), the rows and seats of each from the
# ticketing database (insp/offmate_seats.json).
#
# World frame: metres, x east, z south, the floor's centre at the origin, the
# stage end to the north (-z). The skyboxes are on the east (the 201-205
# side), over the 200s' backs, where the other three sides have the 300s.
import sys, json, time, numpy as np, cv2
sys.path.insert(0, '.')
from shapely.geometry import Polygon, box as sbox
from shapely.ops import unary_union
from standlib import Grid, disk, contours, seat_mask, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, trim_tunnels
T0 = time.time()
G = Grid(-80, 80, -80, 80, 0.1)
STRAIGHT.update(on=True, res=G.res)
gy, gx = np.mgrid[0:G.H, 0:G.W]; GX, GZ = G.m(gx, gy)
def dil(m, r): return cv2.dilate(m.astype(np.uint8), disk(r / G.res)) > 0

# ── the plan ──
S = 0.31; C0 = np.array([179.0, 196.0])
secs = json.load(open('insp/svg_secs.json')); rowsdb = json.load(open('insp/offmate_seats.json'))
ORDER = {1: [115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101],
         2: [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 210, 209, 208, 207, 206, 205, 204, 203, 202, 201],
         3: [320, 319, 318, 317, 316, 315, 314, 313, 312, 311, 310, 309, 308]}
it = {t: iter(v) for t, v in ORDER.items()}
FACE = {}
for n in (101, 102, 103, 104, 105, 201, 202, 203, 204, 205): FACE[n] = 180
for n in (111, 112, 113, 114, 115, 211, 212, 213, 214, 215, 311, 312, 313, 314, 315): FACE[n] = 0
for n in (107, 108, 109, 207, 208, 209, 308, 309): FACE[n] = 270
for n in (217, 218, 219, 317, 318, 319): FACE[n] = 90
FACE.update({106: 225, 206: 225, 110: 315, 210: 315, 310: 315, 216: 45, 316: 45, 220: 135, 320: 135})
# the tiers: row depth, the front row's height, the rise per row
TP = {1: dict(name='100', D=0.85, H=0.45, R=0.33),
      2: dict(name='200', D=0.80, H=5.14, R=0.40),
      3: dict(name='300', D=0.88, H=13.8, R=0.48)}
# each tier's front line, as the distance in from its facing: the 100s off
# the floor's edge on three sides; the 200s a walkway behind them (on the
# north, at the stage end, straight off the floor); the 300s on the backs of
# the 200s' ten-row sections (their deeper corner sections run on under them)
FRONT = {1: {0: 20.8, 180: 20.8, 270: 27.3, 315: 31.1, 225: 31.1},
         2: {0: 33.9, 180: 33.9, 270: 40.4, 90: 38.1, 315: 45.0, 225: 45.0, 45: 42.1, 135: 42.1},
         3: {0: 41.9, 270: 48.4, 90: 48.5, 315: 53.0, 45: 48.5, 135: 50.9, 180: 40.3, 225: 53.0}}
# (on the east, 40.3 m out, the skyboxes' front: the 300s' line, with no 300s)
C2 = round(TP[2]['H'] + TP[2]['R'] * 9, 2)     # the 2nd-floor concourse: level with the ten-row backs
C3 = TP[3]['H']                                  # the 3rd floor's: the 300s' tunnels come out at the front row's level
LANDING = {202, 203, 204}                       # the east 200s' eight rows end a step short of the concourse
WALK3 = 1.3                                      # the walkway along the 300s' front, behind the ribbon, their tunnels opening onto it
WALK1 = 1.2                                      # the walkway behind the 100s' back row
fv = lambda a: np.array([np.cos(np.radians(a)), np.sin(np.radians(a))])
SEC = {}
for q in secs:
    if q['tier'] == 0: continue
    n = next(it[q['tier']])
    P = (np.array(q['pts'], float) - C0) * S
    t = q['tier']; a = FACE[n]; f = fv(a); u = np.array([-f[1], f[0]])
    rows = list(rowsdb[str(n)]['rows'].items())
    SEC[n] = dict(n=n, tier=t, face=a, f=f, u=u, P=P, dF=FRONT[t][a], rows=[len(v) for _, v in rows],
                  labels=[k for k, _ in rows], cen=P.mean(0))

def halfplane(p0, d, n, L=400.0):
    # the half-plane on the n side of the line through p0 along d
    d = d / np.linalg.norm(d); n = n / np.linalg.norm(n)
    return Polygon([p0 - d * L, p0 + d * L, p0 + d * L + n * L, p0 - d * L + n * L])

def schematic_extent(s, side, t):
    # the section's extent across at depth t behind its front on the plan
    P = s['P']; f, u = s['f'], s['u']
    s0 = (P @ f).max(); c = s0 - t; xs = []
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        pa, pb = a @ f - c, b @ f - c
        if (pa >= 0) != (pb >= 0) and abs(pb - pa) > 1e-9:
            xs.append((a + (b - a) * (pa / (pa - pb))) @ u)
    if not xs: return None
    return max(xs) if side > 0 else min(xs)

def territory(s, left, right):
    """The section's polygon: its front line, its back its rows deep (and for
    the 100s the walkway behind), its two sides."""
    f, u, dF = s['f'], s['u'], s['dF']
    depth = len(s['rows']) * TP[s['tier']]['D'] + (WALK3 if s['tier'] == 3 else 0.0) + (WALK1 if s['tier'] == 1 and len(s['rows']) >= 14 else 0.0) + (0.9 if s['n'] in LANDING else 0.0)
    poly = halfplane(-f * dF, u, -f).intersection(halfplane(-f * (dF + depth), u, f))
    for hp in (left, right): poly = poly.intersection(hp)
    return poly, depth

# neighbours round each tier, and the boundary between each pair
def boundary(si, sj):
    """The half-plane of si against its neighbour sj."""
    if si['face'] == sj['face']:
        u = si['u']
        hi_i = max(schematic_extent(si, 1, 0.5), schematic_extent(si, 1, 2.0))
        lo_i = min(schematic_extent(si, -1, 0.5), schematic_extent(si, -1, 2.0))
        side = 1 if (sj['cen'] @ u) > (si['cen'] @ u) else -1
        if side > 0: c = (hi_i + min(schematic_extent(sj, -1, 0.5), schematic_extent(sj, -1, 2.0))) / 2
        else: c = (lo_i + max(schematic_extent(sj, 1, 0.5), schematic_extent(sj, 1, 2.0))) / 2
        return halfplane(u * c, si['f'], -u * side)
    # round a corner: where the two sections' rows are at equal depth. Behind
    # a convex front each point belongs to the front it is deepest behind:
    #   t_i(p) = -dF_i - p.f_i ;  si's side: t_i > t_j, p.(f_j - f_i) > dF_i - dF_j
    w = sj['f'] - si['f']; k = si['dF'] - sj['dF']
    p0 = w * k / (w @ w)
    d = np.array([-w[1], w[0]])
    return halfplane(p0, d, w)

def end_cut(s, side):
    """A tier's end: the section's own side on the plan, squared off to a
    multiple of 22.5 degrees."""
    f, u = s['f'], s['u']
    dep = (s['P'] @ f).max() - (s['P'] @ f).min()
    a = schematic_extent(s, side, 0.3); b = schematic_extent(s, side, max(0.6, dep - 0.3))
    ang = np.arctan2(b - a, dep - 0.6)
    ang = np.round(ang / np.radians(22.5)) * np.radians(22.5)
    p0 = -f * s['dF'] + u * a + (-f) * 0.3
    d = (-f) * np.cos(ang) + u * np.sin(ang)       # along the side, going back
    n = u * side                                   # outwards
    nn = n - d * (n @ d); nn /= np.linalg.norm(nn)
    return halfplane(p0, d, -nn)

TERR = {}
ALONE = {310, 316, 320}
for t, order in ORDER.items():
    ring = [SEC[n] for n in order]
    closed = t == 2
    for i, s in enumerate(ring):
        hp = []
        for j in (i - 1, i + 1):
            if not (0 <= j < len(ring) or closed): continue
            sj = ring[j % len(ring)]
            # the 300s' corner blocks stand on their own, gaps (their ways in) either side
            if {s['n'], sj['n']} & ALONE: continue
            if Polygon(s['P']).distance(Polygon(sj['P'])) < 4.5: hp.append((sj, boundary(s, sj)))
        sides_done = set()
        for sj, h in hp:
            sides_done.add(1 if (sj['cen'] - s['cen']) @ s['u'] > 0 else -1)
        for side in (-1, 1):
            if side not in sides_done: hp.append((None, end_cut(s, side)))
        if s['n'] in ALONE:
            # a block across the middle of its corner, as wide as its rows
            nb = {315: (0, 270), 45: (0, 90), 135: (90, 180), 225: (180, 270)}[s['face']]
            ends = [np.linalg.solve(np.array([s['f'], fv(b_)]), [-s['dF'], -FRONT[3][b_]]) for b_ in nb]
            c = ((ends[0] + ends[1]) / 2) @ s['u']; hw = max(s['rows']) * 0.55 / 2 + 0.6
            hp = [(None, halfplane(s['u'] * (c - hw), s['f'], s['u'])), (None, halfplane(s['u'] * (c + hw), s['f'], -s['u']))]
        poly, depth = territory(s, hp[0][1], hp[1][1])
        for _, h in hp[2:]: poly = poly.intersection(h)
        s['poly'] = poly; s['depth'] = depth
        TERR[s['n']] = poly
print('territories', round(time.time() - T0, 1), {n: round(TERR[n].area, 1) for n in sorted(TERR)})


# ── seats: each row's count along its row, centred in the section, the
# aisles either side clear ──
AISLE = 0.6          # half an aisle, kept clear inside each side of a section
for n, s_ in SEC.items():
    tp = TP[s_['tier']]; f, u, dF = s_['f'], s_['u'], s_['dF']
    poly = s_['poly']; seats = []; rowi = []
    inner = poly.buffer(-AISLE, join_style=2)
    for r, cnt in enumerate(s_['rows']):
        t = (r + 0.55) * tp['D'] + (WALK3 if s_['tier'] == 3 else 0.0)
        c = -f * (dF + t)
        line = Polygon([c - u * 200 - f * 0.01, c + u * 200 - f * 0.01, c + u * 200 + f * 0.01, c - u * 200 + f * 0.01])
        seg = inner.intersection(line)
        if seg.is_empty: seg = poly.intersection(line)
        if seg.is_empty: continue
        us = [np.array(p_) @ u for p_ in np.array(seg.exterior.coords if hasattr(seg, 'exterior') else [])] if hasattr(seg, 'exterior') else [np.array(q.exterior.coords) @ u for q in seg.geoms]
        us = np.hstack(us) if isinstance(us, list) else us
        a, b = float(np.min(us)), float(np.max(us)); L = b - a
        pitch = min(0.55, max(0.46, L / max(1, cnt)))
        k = min(cnt, int(L // pitch)) if L > 0.3 else 0
        mid = (a + b) / 2
        for j in range(k):
            seats.append(c + u * (mid + (j - (k - 1) / 2) * pitch)); rowi.append(r)
    s_['seats'] = np.array(seats).reshape(-1, 2); s_['row'] = np.array(rowi, int)
print('seats', {t: int(sum(len(SEC[n]['seats']) for n in o)) for t, o in ORDER.items()}, 'of', {t: int(sum(sum(SEC[n]['rows']) for n in o)) for t, o in ORDER.items()})

# ── the tiers as levels on the grid ──
class ExactLevel(Level):
    """A level from exact section polygons: each cell's depth is measured from
    its own section's front, so its rows run parallel to that front."""
    def __init__(s, t, names, bottom, fascia, landing=None):
        tp = TP[t]
        s.G, s.name, s.D, s.h0, s.rise = G, tp['name'], tp['D'], tp['H'], tp['R']
        s.hs = None; s.bottom = bottom; s.fascia = fascia; s.centre = (0.0, 0.0); s.F = None
        lab = np.zeros((G.H, G.W), np.int32)
        for k, n in enumerate(names):
            g = SEC[n]['poly']
            for pg in (g.geoms if hasattr(g, 'geoms') else [g]):
                P = np.array(pg.exterior.coords); gx_, gz_ = G.g(P[:, 0], P[:, 1])
                cv2.fillPoly(lab, [np.c_[gx_, gz_].round().astype(np.int32)], k + 1)
        s.R = (lab > 0).astype(np.uint8)
        # every cell measured from its nearest section's front
        seed = (lab == 0).astype(np.uint8)
        _, lp = cv2.distanceTransformWithLabels(seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        zy, zx = np.nonzero(seed == 0); near = np.r_[0, lab[zy, zx]][lp] - 1
        fx = np.array([SEC[n]['f'][0] for n in names]); fz = np.array([SEC[n]['f'][1] for n in names])
        dF = np.array([SEC[n]['dF'] for n in names]); nr = np.array([len(SEC[n]['rows']) for n in names])
        s.sec = near; s.names = names
        # (measured from the first row: a walkway in front of it is at its level)
        s.walk = WALK3 if t == 3 else 0.0
        s.d = (-dF[near] - (GX * fx[near] + GZ * fz[near]) - s.walk).astype(np.float32)
        s.nrows = int(nr.max()) + (1 if landing else 0)
        top = nr[near] - 1
        if landing is not None: top = np.where(np.isin(np.array(names)[near], landing), top + 1, top)
        s.band = np.where(s.R > 0, np.clip(np.floor(s.d / s.D).astype(int), 0, top), -1)
        s.hull = s.R.copy(); s.behind = s.d > -s.walk - 0.05
        S_ = [SEC[n]['seats'] for n in names]; s.seats = np.vstack(S_)
        s.row = np.concatenate([SEC[n]['row'] for n in names])
        s.seatsec = np.concatenate([[k] * len(SEC[n]['seats']) for k, n in enumerate(names)]).astype(int)
        s.yaw = np.array([np.arctan2(SEC[names[k]]['f'][0], SEC[names[k]]['f'][1]) for k in s.seatsec])
        s.seatmask = seat_mask(G, s.seats)
        s.pits = np.zeros(s.R.shape, bool)
L1 = ExactLevel(1, ORDER[1], 'ground', 0.0)
# the east 200s' eight rows end a step short of the concourse: a landing
L2 = ExactLevel(2, ORDER[2], 0.5, 1.6, landing=sorted(LANDING))
L3 = ExactLevel(3, ORDER[3], 0.5, 1.6)
print('levels', round(time.time() - T0, 1), {l.name: (l.nrows, len(l.seats)) for l in (L1, L2, L3)})

from bowlkit import Flights, front_segments
ROOF = 31.0
# ── the 300s' tunnels: in from the concourse under their back rows, out
# through the front rows between two blocks of seats, red-walled; about one
# every eleven metres ──
cands = []
for n in ORDER[3]:
    s_ = SEC[n]; f, u = s_['f'], s_['u']
    P = np.array(s_['poly'].exterior.coords); us = P @ u
    a, b = us.min() + AISLE, us.max() - AISLE; L = b - a
    k = 0 if L < 9 else (1 if L < 18 else 2)
    if n in ALONE: k = 1                         # a corner block has its own
    for j in range(k):
        c = a + L * (j + 1) / (k + 1)
        m = (np.abs(GX * u[0] + GZ * u[1] - c) <= 1.0) & (L3.sec == ORDER[3].index(n)) & (L3.d > 0.3) & (L3.d < 1.6) & (L3.R > 0)
        if m.any(): cands.append(m)
VOMS3 = L3.make_voms(C3, head=1.95, wmin=2.0, wmax=2.2, cands=cands, detect=False)
for i, v in enumerate(VOMS3):
    v['label'] = ''
# no seats in the pits
keep = ~dil(L3.pits, 0.25)[np.clip(np.round(G.g(L3.seats[:, 0], L3.seats[:, 1])[1]).astype(int), 0, G.H - 1), np.clip(np.round(G.g(L3.seats[:, 0], L3.seats[:, 1])[0]).astype(int), 0, G.W - 1)]
L3.seats, L3.row, L3.yaw, L3.seatsec = L3.seats[keep], L3.row[keep], L3.yaw[keep], L3.seatsec[keep]
print('voms', len(VOMS3), 'seats in the pits taken out', int((~keep).sum()))

# ── the building ──
SKY = dict(x=40.3, z0=-22.8, z1=22.8, n=12, y=C3, terrace=2.9, box=3.3, h=2.8)
skystrip = sbox(SKY['x'], SKY['z0'], SKY['x'] + SKY['terrace'] + SKY['box'], SKY['z1'])
hullp = unary_union([SEC[n]['poly'] for n in ORDER[2] + ORDER[3]] + [skystrip]).convex_hull.buffer(6.5, join_style=2)
outer = np.zeros((G.H, G.W), np.uint8)
P = np.array(hullp.exterior.coords); gx_, gz_ = G.g(P[:, 0], P[:, 1]); cv2.fillPoly(outer, [np.c_[gx_, gz_].round().astype(np.int32)], 1)
outer = outer > 0
# the 2nd-floor concourse: everything behind the 200s, under the 300s and the boxes
c2 = outer & (L2.d > 0.0) & (L2.R == 0)
# the 3rd floor's: under the 300s' rows high enough to walk under, and behind them
near3 = cv2.distanceTransform((L3.R == 0).astype(np.uint8), cv2.DIST_L2, 5) * G.res
# (under the rows from the seventh up, which clear it by a head: the 300s'
# tunnels come out into it there)
c3 = outer & (L3.d >= 6 * TP[3]['D'] - 0.05) & (near3 < 9.0) & ~((L3.R > 0) & (L3.band < 6))
# ── stairs between them ──
FL = Flights(G, [L1, L2, L3])
for near in ((-52, 0), (0, 58), (0, -58), (-47, 40)):
    f = FL.find(c2 & ~(L3.R > 0), c3, C2, C3, near, rmax=16)
    print('flight', near, f and {k: round(v, 1) for k, v in f.items()})
FL.cut([(c3, C3)])
slabs = [(grow_under(c2, C2, [L1, L2, L3]), 0.0, C2), (grow_under(c3, C3, [L1, L2, L3]), C3 - 0.35, C3)]
# ── the concourses closed in ──
rooms = [{'name': '2F', 'mask': c2, 'y': C2, 'cl': 3.6, 'own': [L2], 'doors': L2.aisle_doors()},
         {'name': '3F', 'mask': c3, 'y': C3, 'cl': 3.4, 'own': [L3], 'doors': L3.aisle_doors(), 'open': L3.pits}]
trim_tunnels(G, VOMS3, c3)
encl, roomtop = enclose(G, rooms, [L1, L2, L3], slabs, FL.out)
print('enclose', round(time.time() - T0, 1), {k: len(v) for k, v in encl.items()})
# over the concourse where no tier stands on it (the corners with no 300s), the
# wall behind the 200s runs on up to the roof
high = []
for w in encl['walls']:
    mx, mz = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
    gx_, gz_ = G.g(mx, mz); i_, j_ = int(round(float(gz_))), int(round(float(gx_)))
    if not (0 <= i_ < G.H and 0 <= j_ < G.W): continue
    if w[5] < C2 + 3.0 or w[4] > C2 + 3.0: continue
    if not dil(L2.R > 0, 1.5)[i_, j_] or near3[i_, j_] < 3.0 or skystrip.buffer(3).contains(Polygon([(mx - .1, mz - .1), (mx + .1, mz - .1), (mx + .1, mz + .1)])): continue
    high.append([w[0], w[1], w[2], w[3], round(w[5] - 0.05, 2), ROOF])
print('walls up to the roof', len(high))
# ── the stands' own edges ──
def outside_fn(pairs):
    def f(ox, oy):
        for m, y in pairs:
            if m[oy, ox]: return y
        return None
    return f
skip_all = lambda ox, oy, h: roomtop[oy, ox] >= h + 1.0
skip1 = lambda ox, oy, h: L2.R[oy, ox] > 0 or skip_all(ox, oy, h)
levels = []
for l, pairs, front, sk in ((L1, [], None, skip1), (L2, [(c2, C2)], (0.0, 0.9), skip_all), (L3, [(c3, C3)], ('tread', 0.9), skip_all)):
    rails, walls = edge_walls(G, l, outside_fn(pairs), l.aisle_doors(), skip=sk, front=front)
    if l is L3:
        # along the 300s' backs, the building's wall, up to the roof
        back = [r for r in rails if r[4] > TP[3]['H'] + TP[3]['R'] * 9]
        rails = [r for r in rails if r[4] <= TP[3]['H'] + TP[3]['R'] * 9]
        walls = walls + [r[:4] + [r[4] - 0.05, ROOF] for r in back]
    if l is L2: walls = walls + high
    levels.append({'name': l.name, 'D': l.D, 'h0': l.h0, 'rise': l.rise, 'rows': l.rows_out(), 'steps': l.aisles_out(), 'holes': [],
                   'voms': VOMS3 if l is L3 else [], 'seats': l.seats_out(), 'rails': rails, 'walls': walls})
    print(l.name, 'rows', len(levels[-1]['rows']), 'steps', len(levels[-1]['steps']), 'rails', len(rails), 'walls', len(walls))
floors = [{'y': y, 'y0': y0, 'polys': mask_polys(G, m)} for m, y0, y in slabs]
# the 100s folded away: each section's stack against the 200s' front
stacks = []
for n in ORDER[1]:
    s_ = SEC[n]; f = s_['f']
    st = s_['poly'].intersection(Polygon([(-f * (s_['dF'] + s_['depth'] - 2.3) + np.array([-f[1], f[0]]) * k) for k in (-300, 300)] + [(-f * (s_['dF'] + s_['depth'] + 0.1) + np.array([-f[1], f[0]]) * k) for k in (300, -300)]))
    if not st.is_empty: stacks.append(poly_out([np.array(st.exterior.coords)[:-1]], 2))
# the ribbon board along the 300s' fronts (and on the east the boxes' front);
# the name along the 200s' front
ribbon = front_segments([(SEC[n]['poly'], SEC[n]['f'], SEC[n]['dF']) for n in ORDER[3]], None)
ribbon.append([[SKY['x'], SKY['z1']], [SKY['x'], SKY['z0']]])
rim = front_segments([(SEC[n]['poly'], SEC[n]['f'], SEC[n]['dF']) for n in ORDER[2]], None)
data = {'levels': levels, 'floors': floors, 'flights': FL.out, 'outer': [poly_out([np.array(hullp.exterior.coords)[:-1]])],
        'stacks': stacks, 'ribbon': ribbon, 'ribbonY': round(TP[3]['H'] - 1.45, 2), 'rim': rim, 'rimY': TP[2]['H'],
        'sky': SKY, 'concourse': {'2F': C2, '3F': C3}, 'rooms': encl, 'roof': ROOF}
json.dump(data, open('insp_stands.json', 'w'), separators=(',', ':'))
import os; print('json KB', os.path.getsize('insp_stands.json') // 1024, round(time.time() - T0, 1))
if __name__ == '__main__' and 'plot' in sys.argv:
    img = np.full((1000, 1000, 3), 255, np.uint8); sc = 6
    t_ = lambda P: np.c_[np.asarray(P)[:, 0] * sc + 500, np.asarray(P)[:, 1] * sc + 500].round().astype(np.int32)
    col = {1: (40, 160, 230), 2: (200, 90, 190), 3: (120, 120, 240)}
    for n, s in SEC.items():
        cv2.polylines(img, [t_(s['P'])], True, (190, 190, 190), 1)
        g = s['poly']
        for pg in (g.geoms if hasattr(g, 'geoms') else [g]):
            cv2.fillPoly(img, [t_(np.array(pg.exterior.coords))], col[s['tier']]); cv2.polylines(img, [t_(np.array(pg.exterior.coords))], True, (0, 0, 0), 1)
        c = t_(np.array(g.centroid.coords))[0]; cv2.putText(img, str(n), (int(c[0]) - 10, int(c[1]) + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 0), 1)
    cv2.imwrite('/tmp/insp_terr.png', img)
