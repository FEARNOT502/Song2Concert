# Lotte Concert Hall: the seats read off the hall's seating charts (1st and
# 2nd floor, lch/lstrips.py) -> terraces for the renderer, one stand level per
# terrace: the vineyard's blocks each with their own front, rake and height.
# World frame: metres, x across the hall (house right +), z from the organ
# (-) to the back of the hall (+); the stage's front edge at z = 11.5.
import sys, json, time, numpy as np, cv2
sys.path.insert(0, '.')
from standlib import Grid, disk, contours
from standgen import Level, poly_out, mask_polys
T0 = time.time()
K = 0.058; U0, V0, ZF = 352.5, 476.0, 11.5
def w(u, v): return np.c_[(np.asarray(u) - U0) * K, (np.asarray(v) - V0) * K + ZF]
PITCH = 9.25
strips = json.load(open('lch/l_strips.json'))

def seats_of(strip):
    P = np.array(strip['P'], float); n = strip['n']
    if len(P) == 1 or n == 1:
        return P.mean(0)[None, :]
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); L = np.r_[0, np.cumsum(seg)]
    tot = L[-1] + PITCH * 0.8
    t = (np.arange(n) + 0.5) * tot / n - PITCH * 0.4
    # extend straight past the ends
    d0 = (P[1] - P[0]) / max(seg[0], 1e-6); d1 = (P[-1] - P[-2]) / max(seg[-1], 1e-6)
    out = []
    for tt in t:
        if tt < 0: out.append(P[0] + d0 * tt)
        elif tt > L[-1]: out.append(P[-1] + d1 * (tt - L[-1]))
        else:
            i = min(len(seg) - 1, np.searchsorted(L, tt) - 1)
            out.append(P[i] + (P[i + 1] - P[i]) * (tt - L[i]) / max(seg[i], 1e-6))
    return np.array(out)

# ── the blocks (chart px; house left, mirrored for house right) ──
# each: floor, which seats, rows, how the rows run, and the terrace's height
def is_front(u, v, kind):    # B, C, D: gold at the sides, grey in the middle
    uu = min(u, 2 * U0 - u)
    return v >= 480 and ((kind == 'gold' and uu >= 160) or (kind == 'grey' and uu >= 270))
BLOCKS = [
    # name, floor, select(u, v, kind) on the house-left half (None: the whole
    # width), rows, kind of front, h0, rise, bottom, fascia
    ('F1', '1', lambda u, v, k: is_front(u, v, k) and v < 628, None, 8, 'line', 0.15, 0.10, 'ground', 0),
    ('F2', '1', lambda u, v, k: is_front(u, v, k) and 628 <= v < 762, None, 8, 'line', 1.45, 0.20, 'ground', 0),
    ('F3', '1', lambda u, v, k: is_front(u, v, k) and v >= 762, None, 7, 'line', 3.35, 0.30, 'ground', 0),
    ('W1', '1', lambda u, v, k: k == 'grey' and u < 270 and v >= 480 and not side_of_A(u, v), 'side', 8, 'line', 1.2, 0.30, 'ground', 0),
    ('W2', '1', lambda u, v, k: k == 'grey' and u < 270 and v >= 480 and side_of_A(u, v), 'side', 8, 'line', 3.8, 0.30, 'ground', 0),
    ('S', '1', lambda u, v, k: k == 'gold' and u < 172 and 300 < v < 640, 'side', 7, 'line', 1.9, 0.45, 'ground', 0),
    ('LP', '1', lambda u, v, k: k == 'grey' and u < 260 and 60 < v < 470, 'side', 9, 'arc', 1.9, 0.42, 'ground', 0),
    ('P1', '1', lambda u, v, k: 155 < v < 214 and k == 'gold' and min(u, 2 * U0 - u) >= 185, None, 3, 'line', 1.6, 0.45, 'ground', 0),
    ('P2', '1', lambda u, v, k: v <= 155 and k == 'gold' and min(u, 2 * U0 - u) >= 185, None, 3, 'line', 3.3, 0.45, 'ground', 0),
    ('G', '2', lambda u, v, k: v < 680, 'side', 2, 'centre', 8.4, 0.40, 0.6, 1.2),
    ('B2W', '2', lambda u, v, k: k == 'grey' and u < 270 and v >= 680, 'side', 6, 'line', 8.2, 0.42, 0.6, 1.2),
    ('B2F', '2', lambda u, v, k: v >= 680 and not (k == 'grey' and min(u, 2 * U0 - u) < 270), None, 8, 'line', 8.2, 0.42, 0.6, 1.2),
]
def side_of_A(u, v):          # below the wall between A's rows 8 and 9
    (x0, y0), (x1, y1) = (90, 650), (197, 686)
    return (u - x0) * (y1 - y0) - (v - y0) * (x1 - x0) < 0
seatsP = {fl: [] for fl in ('1', '2')}   # (u, v, kind, row direction)
for fl in ('1', '2'):
    for sid, st in enumerate(strips[fl]):
        P = np.array(st['P'], float)
        d = P[-1] - P[0] if len(P) > 1 else np.array([1.0, 0.0])
        d = d / (np.linalg.norm(d) + 1e-9)
        for u, v in seats_of(st): seatsP[fl].append((u, v, st['kind'], d, len(P) > 1 and st['n'] > 2, sid))
mirror = lambda P: np.c_[2 * U0 - P[:, 0], P[:, 1]]
G = Grid(-21, 21, -17, 42, 0.05)
STAGE_C = (0.0, float(w(U0, 345)[0, 1]))
def front_line(Pc, dirs, n):
    # rows run along the median direction; the front is the first row's line,
    # half a row ahead of it, facing the stage
    ang = np.arctan2(dirs[:, 1], dirs[:, 0]); ang = np.where(ang < -np.pi / 2, ang + np.pi, np.where(ang > np.pi / 2, ang - np.pi, ang))
    th = np.median(ang); t = np.array([np.cos(th), np.sin(th)]); nv = np.array([-t[1], t[0]])
    c = Pc.mean(0)
    sc = np.array(STAGE_C)
    if np.dot(sc - c, nv) < 0: nv = -nv                  # nv points toward the stage
    p = (Pc - c) @ (-nv)                                  # depth, away from the stage
    D = (np.percentile(p, 99.5) - np.percentile(p, 0.5)) / max(1, n - 1)
    p0 = np.percentile(p, 0.5) - D * 0.5
    return c - nv * p0, t, nv, D
def raster_line(o, t, L=40):
    F = G.empty(); a = o - t * L; b = o + t * L
    ga = G.g(a[0], a[1]); gb = G.g(b[0], b[1])
    cv2.line(F, (int(round(ga[0])), int(round(ga[1]))), (int(round(gb[0])), int(round(gb[1]))), 1, 1)
    return F
def fit_arc(Pc, rows_px):
    # a common centre for concentric rows: least squares on |p - c| per strip
    best = None
    for cx in np.arange(-12, 4, 0.25):
        for cz in np.arange(-6, 12, 0.25):
            r = np.hypot(Pc[:, 0] - cx, Pc[:, 1] - cz)
            sc = sum(np.var(r[g]) for g in rows_px if len(g) > 3)
            if best is None or sc < best[0]: best = (sc, cx, cz)
    return np.array(best[1:])
LV = {}
for name, fl, sel, sided, n, kind, h0, rise, bottom, fascia in BLOCKS:
    pts = list(seatsP[fl])
    if sided:
        Lh = [(u, v, k, d, ok, sid) for u, v, k, d, ok, sid in pts if u <= U0 and sel(u, v, k)]
        Rh = [(2 * U0 - u, v, k, d * [-1, 1], ok, sid) for u, v, k, d, ok, sid in pts if u > U0 and sel(2 * U0 - u, v, k)]
        base = Lh if len(Lh) >= len(Rh) else Rh
        print(name, 'left', len(Lh), 'right', len(Rh))
        sides = [('L' + name, base, False), ('R' + name, base, True)]
    else:
        sides = [(name, [p for p in pts if sel(p[0], p[1], p[2])], False)]
    for nm, S_, mir in sides:
        UV = np.array([(u, v) for u, v, *_ in S_]); dirs = np.array([d for *_, d, ok, sid in S_ if ok]); sids = np.array([sid for *_, sid in S_])
        if mir: UV = mirror(UV); dirs = dirs * [-1, 1]
        Pc = w(UV[:, 0], UV[:, 1])
        dirs = dirs * [1, 1]              # chart and world axes are both x right, z down the chart
        if kind == 'line':
            o, t, nv, D = front_line(Pc, dirs, n)
            F = raster_line(o, t); centre = tuple(o + nv * 60)
            rmax = 110
        elif kind == 'arc':
            # rows: the strips' own points, grouped by strip, for the fit
            cxz = fit_arc(Pc, [np.nonzero(sids == q)[0] for q in np.unique(sids)])
            r = np.hypot(Pc[:, 0] - cxz[0], Pc[:, 1] - cxz[1])
            D = (np.percentile(r, 99.5) - np.percentile(r, 0.5)) / (n - 1); r0 = np.percentile(r, 0.5) - D * 0.5
            F = G.empty(); gc = G.g(cxz[0], cxz[1]); cv2.circle(F, (int(round(gc[0])), int(round(gc[1]))), int(round(r0 / G.res)), 1, 1)
            centre = tuple(cxz); rmax = 45
        else:
            F = None; centre = (0.0, 14.0); rmax = 45
            D = 0.9
        l = Level(G, nm, Pc, D, h0, rise, bottom, fascia=fascia or 2.6, centre=centre, rmax=rmax, open_w=2.4, hull_close=1.5, F=F)
        l.nrows = min(l.nrows, n)
        l.band = np.where(l.band >= 0, np.minimum(l.band, n - 1), -1); l.row = np.minimum(l.row, n - 1)
        LV[nm] = l
        print(nm, kind, 'D', round(D, 3), 'rows', l.nrows, np.bincount(l.row).tolist(), 'seats', len(Pc), round(time.time() - T0, 1))
print('seats', sum(len(l.seats) for l in LV.values()))
import colorsys
vis = {fl: cv2.imread(f'lch/img_seating_chart030{fl}.jpg') for fl in ('1', '2')}
for i, (nm, l) in enumerate(LV.items()):
    fl = '2' if nm in ('LG', 'RG', 'LB2W', 'RB2W', 'B2F') else '1'
    for (x, z), r in zip(l.seats, l.row):
        u = x / K + U0; v = (z - ZF) / K + V0
        c = tuple(int(255 * q) for q in colorsys.hsv_to_rgb((i * 0.17) % 1, 0.9, 0.9 if r % 2 else 0.5))
        cv2.circle(vis[fl], (int(round(u)), int(round(v))), 2, c, -1)
for fl in vis: cv2.imwrite(f'lch/levels{fl}.png', cv2.resize(vis[fl], None, fx=1.4, fy=1.4))

# ── out: treads, half steps, a timber parapet along every front and a rail
# wherever a terrace drops more than 0.6 m to what is beside it ──
def height_at(ox, oy, skip):
    best = 0.0
    for n_, l in LV.items():
        if n_ == skip or l.band[oy, ox] < 0: continue
        best = max(best, float(l.h(l.band[oy, ox])))
    return best
def edges(l, name):
    R = l.R.astype(np.uint8)
    cs, _ = cv2.findContours(R, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    bandd = cv2.dilate((l.band + 1).astype(np.float32), np.ones((5, 5), np.uint8))
    rails = []
    for c in cs:
        if cv2.contourArea(c) * G.res ** 2 < 0.5: continue
        ring = cv2.approxPolyDP(c, 0.06 / G.res, True)[:, 0, :]
        for i in range(len(ring)):
            a = ring[i]; b = ring[(i + 1) % len(ring)]
            m = (a + b) / 2; t = b - a; Lt = np.hypot(*t)
            if Lt < 1e-6: continue
            nrm = np.array([t[1], -t[0]]) / Lt
            def inR(p):
                x, y = int(round(p[0])), int(round(p[1]))
                return 0 <= x < G.W and 0 <= y < G.H and R[y, x] > 0
            p1 = m + nrm * 6; p2 = m - nrm * 6
            out = p1 if not inR(p1) else p2
            if inR(out): continue
            ox, oy = [int(np.clip(round(v), 0, n - 1)) for v, n in ((out[0], G.W), (out[1], G.H))]
            ix, iy = [int(np.clip(round(v), 0, n - 1)) for v, n in (((2 * m - out)[0], G.W), ((2 * m - out)[1], G.H))]
            r = int(bandd[iy, ix]) - 1
            if r < 0: continue
            h = float(l.h(r)); below = height_at(ox, oy, name)
            A = G.m(a[0] + 0.5, a[1] + 0.5); B = G.m(b[0] + 0.5, b[1] + 0.5)
            seg = [round(float(A[0]), 2), round(float(A[1]), 2), round(float(B[0]), 2), round(float(B[1]), 2)]
            front = l.d[oy, ox] < 0.6
            if front: rails.append(seg + [round(min(below, h), 2), round(h + 0.85, 2)])
            elif h - below > 0.6: rails.append(seg + [round(below if l.bottom == 'ground' else h - 0.6, 2), round(h + 0.95, 2)])
    return rails
levels = []
for name, l in LV.items():
    rails = edges(l, name)
    levels.append({'name': name, 'D': l.D, 'h0': l.h0, 'rise': l.rise, 'rows': l.rows_out(), 'steps': l.aisles_out(), 'holes': [],
                   'seats': l.seats_out(), 'rails': rails, 'walls': []})
    print(name, 'rows', len(levels[-1]['rows']), 'steps', len(levels[-1]['steps']), 'rails', len(rails))
hall = np.load('lch/hall_poly.npy')
st = np.load('lch/stage_mask.npy')
cs, _ = cv2.findContours(st, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
stage = cv2.approxPolyDP(max(cs, key=cv2.contourArea), 1.0, True)[:, 0, :]
r1 = lambda P: [[round(float(x), 2), round(float(z), 2)] for x, z in w(P[:, 0], P[:, 1])]
data = {'levels': levels, 'floors': [], 'flights': [], 'outer': [], 'plan': r1(hall), 'stage': r1(stage)}
json.dump(data, open('lotte_stands.json', 'w'), separators=(',', ':'))
import os; print('json KB', os.path.getsize('lotte_stands.json') // 1024, round(time.time() - T0, 1))
