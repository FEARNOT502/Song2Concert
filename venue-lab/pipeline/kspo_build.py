# KSPO DOME (Olympic Gymnastics Arena, Seoul): the stands from the official
# seating chart (refs/kspo/official_chart.jpg) and the KCISA 3D models of the
# building (Sketchfab, CC BY: the hall and its 1st-floor slide model).
#
# A round bowl under a 120 m cable dome. The 1st floor in four blocks with a
# stair passage at each diagonal: B (1-4) and D (12-15) on the sides, C (5-11)
# opposite the stage, A (16-22) behind it; each section numbered by the
# radial aisle through its middle. B, D and A's first eight rows telescope
# away under the rest (the slide model). A walkway round the top of the 1st
# floor (wider behind C: the wheelchair platform), the 2nd floor's tunnels
# opening onto it through its first rows. The 2nd floor all the way round in
# 32 equal wedges (23 and 44 two each), the box seats (BOX객석) over its back
# on the two sides, the top corridor behind it elsewhere.
#
# World frame: metres, x east, z south, the centre at the origin; the chart
# is turned half round so the A block (and the stage in front of it) is to
# the north (-z): x = -(px - cx)·s, z = -(py - cy)·s.
import sys, json, time, numpy as np, cv2
sys.path.insert(0, '.')
from standlib import Grid, disk, contours, seat_mask, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, trim_tunnels
from bowlkit import Flights, footprint
T0 = time.time()
G = Grid(-64, 64, -64, 64, 0.1)
STRAIGHT.update(on=True, res=G.res)
gy, gx = np.mgrid[0:G.H, 0:G.W]; GX, GZ = G.m(gx, gy)
RR = np.hypot(GX, GZ)
# the chart's angle (counter-clockwise from its right, its y up) of each cell
TH = (180.0 - np.degrees(np.arctan2(GZ, GX)) + 180.0) % 360.0 - 180.0
def dil(m, r): return cv2.dilate(m.astype(np.uint8), disk(r / G.res)) > 0
def inarc(t, a0, a1):
    # t within [a0, a1] going counter-clockwise (degrees, any range)
    return ((t - a0) % 360.0) <= ((a1 - a0) % 360.0)
S = 60.0 / 552.0                # metres a chart pixel: the outer wall's 552 px is the dome's 60 m
M = lambda px: px * S
R_FLOOR = M(186)                # the arena floor, 20.2 m round
R1F, R1B = M(200), M(378)       # the 1st floor, front and back
D1 = 0.88; H1, RI1 = 1.2, 0.36  # its tread, its front row's height, its rise
C1 = round(H1 + RI1 * 22, 2)    # the walkway round its top (and the concourse under the 2nd floor)
D2 = 0.88; H2, RI2 = round(C1 + 0.5, 2), 0.5
C2 = 16.5                       # the top corridor, behind the 2nd floor's back
R_OUT = 60.0
TELE = 8                        # the rows of B, D and A that telescope away

# ── the 1st floor: blocks, the aisles through the sections' middles ──
BLOCKS = {'B': (148.8, 204.0, [(4, 156.1), (3, 169.6), (2, 182.8), (1, 196.9)], 282),
          'C': (39.8, 139.7, [(11, 47.0), (10, 61.0), (9, 75.5), (8, 89.6), (7, 104.0), (6, 118.1), (5, 132.4)], 292),
          'D': (-23.4, 30.6, [(15, -16.5), (14, -3.0), (13, 10.3), (12, 24.0)], 282),
          'A': (-140.4, -39.2, [(22, -133.0), (21, -119.0), (20, -105.2), (19, -89.8), (18, -75.5), (17, -60.2), (16, -46.0)], None)}
A_COUNT = {16: 310, 17: 310, 18: 311, 19: 311, 20: 312, 21: 310, 22: 308}
ROWS1 = {'A': 22, 'B': 22, 'C': 20, 'D': 22}
AIS = 0.55                      # half an aisle
def polar(r, t):
    a = np.radians(180.0 - t); return np.array([r * np.cos(a), r * np.sin(a)])

def lay_rows(n_total, rows, rF, D, spans):
    """Seats along concentric rows. `spans` [(a0, a1, c0, c1)]: an arc of
    the section in degrees (counter-clockwise a0 to a1) and the clearance (m)
    kept at each end (half an aisle, or the block's end). The count per row
    grows with the row's length; the section's total is kept."""
    def avail(r): return [max(0.0, np.radians((a1 - a0) % 360) * r - c0 - c1) for a0, a1, c0, c1 in spans]
    lens = np.array([sum(avail(rF + (k + 0.55) * D)) for k in range(rows)])
    w = lens / lens.sum()
    n = np.floor(w * n_total).astype(int)
    for i in np.argsort(-(w * n_total - n))[: n_total - n.sum()]: n[i] += 1
    out = []
    for k in range(rows):
        r = rF + (k + 0.55) * D
        L = avail(r); nk = min(n[k], int(sum(L) // 0.45))
        sh = np.floor(np.array(L) / max(1e-6, sum(L)) * nk).astype(int)
        if len(sh): sh[np.argmax(L)] += nk - sh.sum()
        for (a0, a1, c0, c1), m, l in zip(spans, sh, L):
            if m <= 0: continue
            pitch = min(0.55, l / m)
            # the arc's clear middle, in metres along it from a0
            mid = (c0 + (np.radians((a1 - a0) % 360) * r - c1)) / 2
            for j in range(m):
                t = a0 + np.degrees((mid + (j - (m - 1) / 2) * pitch) / r)
                out.append((polar(r, t), k))
    return out

SEATS1 = []   # (xz, row, block)
SEC1 = {}
for b, (a0, a1, aisles, cnt) in BLOCKS.items():
    rows = ROWS1[b]
    cuts = [a0] + [(aisles[i][1] + aisles[i + 1][1]) / 2 for i in range(len(aisles) - 1)] + [a1]
    for i, (n, ta) in enumerate(aisles):
        lo, hi = cuts[i], cuts[i + 1]
        # the aisle through the middle; the rows run on across to the next
        # section, clear of the block's own ends
        spans = [(lo, ta, 0.35 if i == 0 else 0.0, AIS), (ta, hi, AIS, 0.35 if i == len(aisles) - 1 else 0.0)]
        tot = A_COUNT[n] if b == 'A' else cnt
        pl = lay_rows(tot, rows, R1F, D1, spans)
        SEC1[n] = (b, lo, hi, ta)
        SEATS1 += [(p, k, b) for p, k in pl]
print('1F seats', len(SEATS1), round(time.time() - T0, 1))

# ── the 2nd floor: 32 wedges of 11.25 degrees, each section on its own ──
W0 = -180.0
WEDGES = [(W0 + i * 11.25, W0 + (i + 1) * 11.25) for i in range(32)]
CIRC2 = {23: -147.2, 24: -163.4, 25: -174.9, 26: 173.7, 27: 162.7, 28: 151.8, 29: 140.1, 30: 129.7, 31: 117.3, 32: 106.5,
         33: 95.4, 34: 83.4, 35: 72.3, 36: 61.8, 37: 49.1, 38: 39.0, 39: 28.2, 40: 17.0, 41: 6.3, 42: -5.4, 43: -16.5,
         44: -31.2, 45: -46.8, 46: -61.5, 47: -72.6, 48: -85.0, 49: -96.5, 50: -107.8, 51: -118.1, 52: -133.4}
COUNT2 = {23: 417, 24: 270, 25: 236, 26: 217, 27: 248, 28: 247, 29: 244, 30: 259, 31: 306, 32: 326, 33: 250, 34: 245, 35: 326,
          36: 306, 37: 269, 38: 241, 39: 248, 40: 248, 41: 219, 42: 245, 43: 277, 44: 288, 45: 329, 46: 221, 47: 206, 48: 116,
          49: 104, 50: 176, 51: 160, 52: 233}
# the wedges measured on the chart (a few degrees off a 32-way split): the
# chart's own boundaries
BOUND = [-180.0, -169.1, -158.0, -146.7, -135.2, -123.8, -112.4, -101.1, -90.1, -78.4, -67.0, -56.3, -44.7, -33.5, -22.2, -10.8,
         0.2, 11.5, 22.7, 33.95, 44.85, 55.9, 67.1, 78.7, 89.75, 101.1, 111.95, 123.25, 134.35, 145.9, 157.35, 168.1, 180.0]
SEC2 = {}
for i in range(32):
    lo, hi = BOUND[i], BOUND[i + 1]
    c = (lo + hi) / 2
    n = min(CIRC2, key=lambda k: min(abs(((CIRC2[k] - c) + 180) % 360 - 180), 99))
    SEC2.setdefault(n, []).append((lo, hi))
# (behind the stage the chart's colours part the wedges otherwise: 44 from
# -39.0 to -22.2, 45 from -55.8 to -39.0, each with an aisle through it)
SEC2[44] = [(-39.0, -33.5), (-33.5, -22.2)]
SEC2[45] = [(-55.8, -44.7), (-44.7, -39.0)]
SEC2[23] = [(-157.8, -146.7), (-146.7, -135.2)]
F2 = {n: (M(397) if 29 <= n <= 38 else M(392)) for n in COUNT2}
F2.update({48: M(420), 49: M(420)})
ROWS2 = {n: 14 for n in COUNT2}
ROWS2.update({31: 16, 32: 16, 35: 16, 36: 16, 48: 10, 49: 10})
print('2F wedges', {n: [(round(a, 1), round(b, 1)) for a, b in v] for n, v in sorted(SEC2.items())})
SEATS2 = []
for n, wl in SEC2.items():
    SEATS2 += [(p, k, n) for p, k in lay_rows(COUNT2[n], ROWS2[n], F2[n], D2, [(a0, a1, AIS, AIS) for a0, a1 in wl])]
print('2F seats', len(SEATS2), 'of', sum(COUNT2.values()))

# ── the levels on the grid ──
class PolarLevel(Level):
    def __init__(s, name, R, d, top, seats, rows, h0, rise, D, bottom, fascia, nrows):
        s.G, s.name, s.D, s.h0, s.rise = G, name, D, h0, rise
        s.hs = None; s.bottom = bottom; s.fascia = fascia; s.centre = (0.0, 0.0); s.F = None
        s.R = R.astype(np.uint8); s.d = d.astype(np.float32); s.nrows = nrows
        s.band = np.where(R, np.clip(np.floor(d / D).astype(int), 0, top), -1)
        s.hull = s.R.copy(); s.behind = d > -0.05
        s.seats = np.array([p for p, _ in seats]); s.row = np.array([k for _, k in seats])
        s.yaw = np.arctan2(-s.seats[:, 0], -s.seats[:, 1])       # facing the centre
        s.seatmask = seat_mask(G, s.seats); s.pits = np.zeros(R.shape, bool)
d1 = RR - R1F
blk = np.full(RR.shape, '', dtype='<U1')
for b, (a0, a1, _, _) in BLOCKS.items(): blk[inarc(TH, a0, a1)] = b
on1 = (RR >= R1F) & (RR <= R1B) & (blk != '')
top1 = np.where(blk == 'C', 21, 21)
band1 = np.clip(np.floor(d1 / D1).astype(int), 0, 21)
# C: twenty rows, then the wheelchair platform at the back row's height
isC = blk == 'C'
d1c = np.where(isC & (d1 >= 20 * D1), 21 * D1 + 0.01, d1)
tele = on1 & ((blk == 'B') | (blk == 'D')) & (d1 < TELE * D1)
teleA = on1 & (blk == 'A') & (d1 < TELE * D1)       # (under the stage: always folded away for an end stage)
fixed = on1 & ~tele & ~teleA
S1 = np.array([p for p, _, _ in SEATS1]); K1 = np.array([k for _, k, _ in SEATS1]); B1 = np.array([b for _, _, b in SEATS1])
st = (B1 != 'C') & (K1 < TELE)
L1f = PolarLevel('1F', fixed, d1c, 21, [(p, k) for p, k, b in SEATS1 if not (b != 'C' and k < TELE)], None, H1, RI1, D1, 'ground', 0.0, 22)
L1t = PolarLevel('1FT', tele, d1c, TELE - 1, [(p, k) for p, k, b in SEATS1 if (b in 'BD' and k < TELE)], None, H1, RI1, D1, 'ground', 0.0, TELE)
L1a = PolarLevel('1FA', teleA, d1c, TELE - 1, [(p, k) for p, k, b in SEATS1 if (b == 'A' and k < TELE)], None, H1, RI1, D1, 'ground', 0.0, TELE)
# the 2nd floor
sec2 = np.zeros(RR.shape, np.int32); f2 = np.zeros(RR.shape, np.float32); nr2 = np.zeros(RR.shape, np.int32)
for n, spans in SEC2.items():
    for a0, a1 in spans:
        m = inarc(TH, a0, a1)
        sec2[m] = n; f2[m] = F2[n]; nr2[m] = ROWS2[n]
d2 = RR - f2
on2 = (sec2 > 0) & (d2 >= 0) & (d2 < nr2 * D2)
L2 = PolarLevel('2F', on2, d2, 15, [(p, k) for p, k, n in SEATS2], None, H2, RI2, D2, 0.5, 1.1, 16)
L2.band = np.where(on2, np.clip(np.floor(d2 / D2).astype(int), 0, nr2 - 1), -1)
L2.secof = sec2
print('levels', round(time.time() - T0, 1), {l.name: (l.nrows, len(l.seats)) for l in (L1f, L1t, L1a, L2)})

# ── the 2nd floor's tunnels: out onto the walkway through its first rows, at
# every other aisle (the wedges' edges) ──
cands = []
for i, a in enumerate(BOUND[:-1]):
    if i % 2 or -140 < a < -40: continue            # (none behind the stage's masking)
    t = np.radians(180.0 - a)
    u = np.array([np.cos(t), np.sin(t)])
    m = (np.abs(-GX * u[1] + GZ * u[0]) <= 1.05) & (GX * u[0] + GZ * u[1] > 0) & on2 & (d2 < 1.5)
    if m.sum() > 50: cands.append(m)
VOMS2 = L2.make_voms(C1, head=1.95, wmin=2.1, wmax=2.1, cands=cands, detect=False)
for v in VOMS2:
    a = (180.0 - np.degrees(np.arctan2(v['p'][1], v['p'][0])) + 180) % 360 - 180
    near = min(CIRC2, key=lambda k: abs(((CIRC2[k] - a) + 180) % 360 - 180))
    v['label'] = str(near)
keep = ~dil(L2.pits, 0.3)[np.clip(np.round(G.g(L2.seats[:, 0], L2.seats[:, 1])[1]).astype(int), 0, G.H - 1),
                         np.clip(np.round(G.g(L2.seats[:, 0], L2.seats[:, 1])[0]).astype(int), 0, G.W - 1)]
L2.seats, L2.row, L2.yaw = L2.seats[keep], L2.row[keep], L2.yaw[keep]
print('voms', len(VOMS2), 'seats in the pits', int((~keep).sum()))

# ── floors ──
back2 = np.where(sec2 > 0, f2 + nr2 * D2, 0)
walk = (RR >= R1B - 0.02) & (RR < f2 + 0.02) & (sec2 > 0)              # the walkway round the top of the 1st floor
under2 = on2 & (L2.band >= 4)                                           # the concourse under the 2nd floor
behind2 = (RR >= back2) & (RR < R_OUT) & (sec2 > 0)
BOX = [(-10.9, 56.1), (123.4, 179.6)]
boxm = behind2 & (inarc(TH, *BOX[0]) | inarc(TH, *BOX[1])) & (back2 < M(510))
c2 = behind2 & ~boxm
c1 = walk | under2 | (behind2 & (RR < R_OUT))
# the diagonal passages: a stair from the floor up to the walkway
GAPS = [(30.6, 39.8), (139.7, 148.8), (204.0, 219.6), (-39.2, -23.4)]
FL = Flights(G, [L1f, L1t, L1a, L2])
flights = []
for a0, a1 in GAPS:
    ac = (a0 + a1) / 2 if a1 > a0 else (a0 + a1 + 360) / 2
    t = np.radians(180.0 - ac); u = np.array([np.cos(t), np.sin(t)])
    n = int(np.ceil(C1 / 0.19)); L = n * 0.28
    r0 = R1F + 0.4
    p = u * r0
    flights.append({'x': round(float(p[0]), 2), 'z': round(float(p[1]), 2), 'dx': round(float(u[0]), 4), 'dz': round(float(u[1]), 4),
                    'n': n, 'L': round(L, 2), 'y0': 0.0, 'y1': C1, 'w': 2.0, 'open': True})
    gap = inarc(TH, a0, a1) & (RR >= r0 + L - 0.05) & (RR <= R1B + 0.05)
    c1 |= gap
FL.out = flights[:]
for f in flights: FL.mark(f)
for near in (polar(57.5, 90.0), polar(57.5, -90.0), polar(57.5, 70.0), polar(57.5, 110.0)):
    f = FL.find(c1 & behind2 & ~boxm, c2, C1, C2, tuple(near), rmax=10)
    print('flight up', np.round(near, 1), f and {k: round(v, 1) for k, v in f.items()})
FL.cut([(c2, C2), (boxm, C2)])
slabs = [(grow_under(c1, C1, [L1f, L1t, L1a, L2]), 0.0, C1), (grow_under(c2 | boxm, C2, [L1f, L1t, L1a, L2]), C2 - 0.35, C2)]

# ── the rooms ──
rooms = [{'name': '1F', 'mask': c1, 'y': C1, 'cl': 4.0, 'own': [L1f, L2], 'doors': [], 'open': L2.pits},
         {'name': '2F', 'mask': c2, 'y': C2, 'cl': 4.0, 'own': [L2], 'doors': L2.aisle_doors(), 'open': boxm}]
trim_tunnels(G, VOMS2, c1)
encl, roomtop = enclose(G, rooms, [L1f, L1t, L1a, L2], slabs, FL.out)
print('enclose', round(time.time() - T0, 1), {k: len(v) for k, v in encl.items()})
# the corridor's wall on the bowl side runs on up to the dome's edge
RIM = 24.0
high = []
for w in encl['walls']:
    mx, mz = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
    r_ = np.hypot(mx, mz)
    if abs(w[5] - (C2 + 4.0)) > 0.45 or w[4] > C2 + 3.0: continue
    gx_, gz_ = G.g(mx, mz); i_, j_ = int(round(float(gz_))), int(round(float(gx_)))
    if not (0 <= i_ < G.H and 0 <= j_ < G.W) or r_ > R_OUT - 1.0: continue
    high.append([w[0], w[1], w[2], w[3], round(w[5] - 0.05, 2), RIM])
print('walls up to the dome', len(high))

def outside_fn(pairs):
    def f(ox, oy):
        for m, y in pairs:
            if m[oy, ox]: return y
        return None
    return f
TOPT = np.where(L1t.band >= 0, H1 + RI1 * L1t.band, 0)
skip_all = lambda ox, oy, h: roomtop[oy, ox] >= h + 1.0
skip_f_ext = lambda ox, oy, h: skip_all(ox, oy, h) or (L1t.R[oy, ox] > 0) or (L1a.R[oy, ox] > 0)
skip_t = lambda ox, oy, h: skip_all(ox, oy, h) or (L1f.R[oy, ox] > 0)
levels = []
for l, pairs, front, sk, flush in ((L1f, [(c1, C1)], (0.0, 0.9), skip_f_ext, 'open'), (L1t, [], (0.0, 0.9), skip_t, 'open'), (L1a, [], (0.0, 0.9), skip_t, 'open'),
                                   (L2, [(c2, C2), (boxm, C2), (walk, C1)], ('tread', 0.9), skip_all, 'doors')):
    rails, walls = edge_walls(G, l, outside_fn(pairs), l.aisle_doors(), skip=sk, front=front, flush=flush)
    extra = {}
    if l is L1f:
        # folded away, the rows left stand behind a wall up from the floor
        r2, _ = edge_walls(G, l, outside_fn(pairs), [], skip=skip_all, front=front, flush=flush)
        ex = set(map(tuple, rails))
        new = [r[:4] + [0.0, r[5]] for r in r2 if tuple(r) not in ex]
        inA = lambda r: bool(inarc((180.0 - np.degrees(np.arctan2((r[1] + r[3]) / 2, (r[0] + r[2]) / 2)) + 180) % 360 - 180, -140.4, -39.2))
        extra['railsRetract'] = [r for r in new if not inA(r)]
        extra['railsA'] = [r for r in new if inA(r)]
    if l is L2: walls = walls + high
    levels.append({'name': l.name, 'D': l.D, 'h0': l.h0, 'rise': l.rise, 'rows': l.rows_out(), 'steps': l.aisles_out(), 'holes': [],
                   'voms': VOMS2 if l is L2 else [], 'seats': l.seats_out(), 'rails': rails, 'walls': walls, **extra})
    print(l.name, 'rows', len(levels[-1]['rows']), 'steps', len(levels[-1]['steps']), 'rails', len(rails), 'walls', len(walls), {k: len(v) for k, v in extra.items()})
floors = [{'y': y, 'y0': y0, 'polys': mask_polys(G, m)} for m, y0, y in slabs]
# the telescoped rows folded against the rows left: a stack 2.2 m deep
stackm = on1 & ((blk == 'B') | (blk == 'D')) & (d1 >= TELE * D1 - 2.2) & (d1 < TELE * D1)
stackA = on1 & (blk == 'A') & (d1 >= TELE * D1 - 2.2) & (d1 < TELE * D1)
ring = [[round(float(R_OUT * np.cos(t)), 2), round(float(R_OUT * np.sin(t)), 2)] for t in np.linspace(0, 2 * np.pi, 97)[:-1]]
data = {'levels': levels, 'floors': floors, 'flights': FL.out, 'outer': [[ring]],
        'stacks': [poly_out(p, 2) for p in contours(G, stackm.astype(np.uint8), eps=0.03, minarea=1.0)],
        'stacksA': [poly_out(p, 2) for p in contours(G, stackA.astype(np.uint8), eps=0.03, minarea=1.0)],
        'tele': {'rows': TELE, 'front': round(R1F + TELE * D1, 2)},
        'box': {'arcs': [[a0, a1] for a0, a1 in BOX], 'r0': round(M(505), 2), 'r1': round(R_OUT - 0.4, 2), 'y': C2},
        'floorR': round(R_FLOOR, 2), 'front1': round(R1F, 2), 'rim': RIM, 'concourse': {'1F': C1, '2F': C2}, 'rooms': encl}
json.dump(data, open('kspo_stands.json', 'w'), separators=(',', ':'))
import os; print('json KB', os.path.getsize('kspo_stands.json') // 1024, round(time.time() - T0, 1))
