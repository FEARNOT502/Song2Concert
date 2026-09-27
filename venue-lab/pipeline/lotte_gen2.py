# Lotte Concert Hall: the seats read off the hall's seating charts (1st and
# 2nd floor, lch/lstrips.py) -> terraces for the renderer. Every block is its
# own terrace: its rows as the chart draws them (each run of seats in the
# chart is a row, or a piece of one), numbered from the block's front, each
# row a step of its own height; a timber parapet wherever a terrace stands
# above what is next to it.
# World frame: metres, x across the hall (house right +), z from the organ
# (-) to the back of the hall (+); the stage's front edge at z = 11.5.
import sys, json, time, base64, numpy as np, cv2
sys.path.insert(0, '.')
from standlib import Grid, disk, contours, rings_px
from standgen import poly_out, mask_polys
T0 = time.time()
K = 0.058; U0, V0, ZF = 352.5, 476.0, 11.5
def w(u, v): return np.c_[(np.asarray(u) - U0) * K, (np.asarray(v) - V0) * K + ZF]
PITCH = 9.25
strips = json.load(open('lch/l_strips.json'))
def seats_of(strip):
    P = np.array(strip['P'], float); n = strip['n']
    if len(P) == 1 or n == 1: return P.mean(0)[None, :]
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); L = np.r_[0, np.cumsum(seg)]
    tot = L[-1] + PITCH * 0.8
    t = (np.arange(n) + 0.5) * tot / n - PITCH * 0.4
    d0 = (P[1] - P[0]) / max(seg[0], 1e-6); d1 = (P[-1] - P[-2]) / max(seg[-1], 1e-6)
    out = []
    for tt in t:
        if tt < 0: out.append(P[0] + d0 * tt)
        elif tt > L[-1]: out.append(P[-1] + d1 * (tt - L[-1]))
        else:
            i = min(len(seg) - 1, max(0, np.searchsorted(L, tt) - 1))
            out.append(P[i] + (P[i + 1] - P[i]) * (tt - L[i]) / max(seg[i], 1e-6))
    return np.array(out)
def side_of_A(u, v):          # below the wall between A's rows 8 and 9
    (x0, y0), (x1, y1) = (90, 650), (197, 686)
    return (u - x0) * (y1 - y0) - (v - y0) * (x1 - x0) < 0
uu = lambda u: min(u, 2 * U0 - u)
# name, floor, select (house-left half, or whole width), sided, rows, front
# kind, heights: h0, rise, first row's number offset, bottom
BLOCKS = [
    ('C1', '1', lambda u, v, k: k == 'grey' and uu(u) >= 270 and 480 <= v < 628, False, 8, 'line', 0.15, 0.10, 0, 'ground'),
    ('C2', '1', lambda u, v, k: k == 'grey' and uu(u) >= 270 and 628 <= v < 762, False, 8, 'line', 1.45, 0.20, 0, 'ground'),
    ('C3', '1', lambda u, v, k: k == 'grey' and uu(u) >= 270 and v >= 762, False, 7, 'line', 3.35, 0.30, 0, 'ground'),
    ('B1', '1', lambda u, v, k: k == 'gold' and 160 <= u < 280 and 480 <= v < 628, True, 7, 'line', 0.15, 0.10, 0, 'ground'),
    ('B2', '1', lambda u, v, k: k == 'gold' and 160 <= u < 280 and 628 <= v < 762, True, 7, 'line', 1.45, 0.20, 0, 'ground'),
    ('B3', '1', lambda u, v, k: k == 'gold' and 160 <= u < 280 and v >= 762, True, 4, 'line', 3.35, 0.30, 2, 'ground'),
    ('A1', '1', lambda u, v, k: k == 'grey' and u < 270 and v >= 480 and not side_of_A(u, v), True, 8, 'line', 1.2, 0.30, 0, 'ground'),
    ('A2', '1', lambda u, v, k: k == 'grey' and u < 270 and v >= 480 and side_of_A(u, v), True, 8, 'line', 3.8, 0.30, 0, 'ground'),
    ('L', '1', lambda u, v, k: k == 'gold' and u < 160 and 300 < v < 640, True, 7, 'line', 1.9, 0.45, 0, 'ground'),
    ('LP', '1', lambda u, v, k: k == 'grey' and u < 260 and 60 < v < 470, True, 9, 'arc', 1.9, 0.42, 0, 'ground'),
    ('P1', '1', lambda u, v, k: uu(u) >= 185 and 155 < v < 214, False, 3, 'line', 1.6, 0.45, 0, 'ground'),
    ('P2', '1', lambda u, v, k: uu(u) >= 185 and 90 < v <= 155, False, 3, 'line', 3.3, 0.45, 0, 'ground'),
    ('G', '2', lambda u, v, k: v < 680, True, 2, 'centre', 8.4, 0.40, 0, 0.6),
    ('A5', '2', lambda u, v, k: k == 'grey' and u < 270 and v >= 680, True, 6, 'line', 8.2, 0.42, 0, 0.6),
    ('B5', '2', lambda u, v, k: k == 'gold' and 150 <= u < 280 and v >= 680, True, 8, 'line', 8.2, 0.42, 0, 0.6),
    ('C5', '2', lambda u, v, k: k == 'grey' and uu(u) >= 270 and v >= 680, False, 8, 'line', 8.2, 0.42, 0, 0.6),
]
STAGE_C = np.array([0.0, float(w(U0, 345)[0, 1])])
G = Grid(-21, 21, -17, 42, 0.05)
gy, gx = np.mgrid[0:G.H, 0:G.W]
GX, GZ = G.m(gx, gy)

# ── every block: its strips, rows numbered from the front ──
blocks = []
for name, fl, sel, sided, n, kind, h0, rise, off, bottom in BLOCKS:
    groups = []                      # (seats chart px, direction)
    for st in strips[fl]:
        c0 = np.array(st['P'], float).mean(0)
        if fl == '1' and st['n'] <= 2 and ((c0[1] > 840) or (495 < c0[1] < 515 and uu(c0[0]) < 220) or (355 < c0[1] < 415 and uu(c0[0]) < 90) or c0[1] < 90):
            continue
        S = seats_of(st)
        P = np.array(st['P'], float); d = P[-1] - P[0] if len(P) > 1 else np.array([1.0, 0.0])
        c = S.mean(0)
        groups.append((S, d / (np.linalg.norm(d) + 1e-9), c))
    def pick(side):
        out = []
        for S, d, c in groups:
            u, v = c
            if side == 'L' and u <= U0 and sel(u, v, None if False else _k[id(S)]): out.append((S, d))
            if side == 'R' and u > U0 and sel(2 * U0 - u, v, _k[id(S)]): out.append((np.c_[2 * U0 - S[:, 0], S[:, 1]], d * [-1, 1]))
            if side == 'A' and sel(u, v, _k[id(S)]): out.append((S, d))
        return out
    _k = {}
    kept = [st for st in strips[fl] if not (fl == '1' and st['n'] <= 2 and ((np.array(st['P'], float).mean(0)[1] > 840) or (495 < np.array(st['P'], float).mean(0)[1] < 515 and uu(np.array(st['P'], float).mean(0)[0]) < 220) or (355 < np.array(st['P'], float).mean(0)[1] < 415 and uu(np.array(st['P'], float).mean(0)[0]) < 90) or np.array(st['P'], float).mean(0)[1] < 90))]
    for (S, d, c), st in zip(groups, kept): _k[id(S)] = st['kind']
    if sided:
        Lg, Rg = pick('L'), pick('R')
        nL, nR = sum(len(S) for S, _ in Lg), sum(len(S) for S, _ in Rg)
        base = Lg if nL >= nR else Rg
        variants = [('L' + name, base, False), ('R' + name, base, True)]
        print(name, 'left', nL, 'right', nR)
    else:
        variants = [(name, pick('A'), False)]
    for nm, grp, mir in variants:
        grp = [(np.c_[2 * U0 - S[:, 0], S[:, 1]] if mir else S, d * [-1, 1] if mir else d) for S, d in grp]
        W_ = [w(S[:, 0], S[:, 1]) for S, _ in grp]
        allp = np.vstack(W_)
        # the depth of each strip from the block's front
        if kind == 'line':
            ang = np.array([np.arctan2(d[1], d[0]) for (S, d), q in zip(grp, W_) if len(q) > 2])
            ang = np.where(ang < -np.pi / 2, ang + np.pi, np.where(ang > np.pi / 2, ang - np.pi, ang))
            th = np.median(ang) if len(ang) else 0.0
            t = np.array([np.cos(th), np.sin(th)]); nv = np.array([-t[1], t[0]])
            if np.dot(STAGE_C - allp.mean(0), nv) > 0: nv = -nv          # nv: away from the stage
            depth = lambda p: p @ nv
        elif kind == 'arc':
            best = None
            for cx in np.arange(-14, 2, 0.25):
                for cz in np.arange(-8, 14, 0.25):
                    sc = sum(np.var(np.hypot(q[:, 0] - cx, q[:, 1] - cz)) * len(q) for q in W_ if len(q) > 3)
                    if best is None or sc < best[0]: best = (sc, cx, cz)
            ctr = np.array(best[1:])
            depth = lambda p, ctr=ctr: np.hypot(p[..., 0] - ctr[0], p[..., 1] - ctr[1])
        else:
            hall = np.load('lch/hall_poly.npy'); hw = w(hall[:, 0], hall[:, 1]).astype(np.float32).reshape(-1, 1, 2)
            depth = lambda p, hw=hw: -np.array([cv2.pointPolygonTest(hw, (float(x), float(z)), True) for x, z in np.atleast_2d(p)])
        ds = np.array([np.median(depth(q)) for q in W_])
        wts = np.array([len(q) for q in W_], float)
        # the rows: n clusters of strip depths (1-D k-means from an even start)
        cm = np.linspace(ds.min(), ds.max(), n)
        for _ in range(60):
            a = np.argmin(np.abs(ds[:, None] - cm[None, :]), axis=1)
            for j in range(n):
                if (a == j).any(): cm[j] = np.average(ds[a == j], weights=wts[a == j])
            cm = np.sort(cm)
        rows = np.argmin(np.abs(ds[:, None] - cm[None, :]), axis=1)
        D0 = float(np.clip((cm[-1] - cm[0]) / max(1, n - 1), 0.6, 1.4))
        seats = []; rowi = []; yaw = []
        for q, r, (S, d) in zip(W_, rows, grp):
            dd = w(S[-1:, 0], S[-1:, 1])[0] - w(S[:1, 0], S[:1, 1])[0] if len(S) > 1 else None
            for p in q:
                if dd is not None and np.linalg.norm(dd) > 0.3:
                    tt = dd / np.linalg.norm(dd); f = np.array([-tt[1], tt[0]])
                else:
                    f = STAGE_C - p
                if np.dot(STAGE_C - p, f) < 0: f = -f
                f = f / np.linalg.norm(f)
                seats.append(p); rowi.append(r); yaw.append(np.arctan2(f[0], f[1]))
        hs = [round(h0 + rise * (r + off), 3) for r in range(n)]
        blocks.append(dict(name=nm, fl=fl, seats=np.array(seats), row=np.array(rowi), yaw=np.array(yaw), hs=hs, bottom=bottom, D=D0))
        print(nm, kind, 'D', round(D0, 3), 'rows', np.bincount(rows, minlength=n).tolist(), 'seats', len(seats))
print('seats 1F', sum(len(b['seats']) for b in blocks if b['fl'] == '1'), '2F', sum(len(b['seats']) for b in blocks if b['fl'] == '2'), round(time.time() - T0, 1))

# ── the stalls in front of the platform, A to E, as one rake ──
# One raked floor under all five blocks, as in a theatre: no terrace walls
# between them or across them. Every row's height comes from how far back it
# is from the platform's front (for A and E, turned toward the platform, where
# the row meets B and D), on one curve that rises gently at the front and
# more steeply to the back; the aisles between the blocks step with the rows
# on either side.
STALLS = ('C1', 'C2', 'C3', 'LB1', 'LB2', 'LB3', 'RB1', 'RB2', 'RB3', 'LA1', 'LA2', 'RA1', 'RA2')
def rake(z):
    t = max(0.0, z - 13.2)
    return 0.15 + 0.0927 * t + 0.00675 * t * t
sb = [b for b in blocks if b['name'] in STALLS]
ms, mr, my, mh, md = [], [], [], [], []
for b in sb:
    for r in np.unique(b['row']):
        k = b['row'] == r
        P = b['seats'][k]
        zin = float(P[np.argmin(np.abs(P[:, 0])), 1])
        mr += [len(mh)] * int(k.sum()); ms.append(P); my.append(b['yaw'][k])
        mh.append(round(rake(zin), 3))
    md.append(b['D'])
blocks = [b for b in blocks if b['name'] not in STALLS]
blocks.append(dict(name='STALLS', fl='1', seats=np.vstack(ms), row=np.array(mr), yaw=np.concatenate(my), hs=mh, bottom='ground', D=float(np.mean(md)), close=1.4))
print('stalls rows', len(mh), 'seats', len(mr), 'h', min(mh), max(mh))

# ── treads: each block's outline, cut into its rows by the nearest seat ──
def raster_pts(P, r):
    M = G.empty(); gx_, gz_ = G.g(P[:, 0], P[:, 1])
    for x, z in zip(gx_, gz_): cv2.circle(M, (int(round(x)), int(round(z))), int(round(r / G.res)), 1, -1)
    return M
for b in blocks:
    M = raster_pts(b['seats'], 0.3)
    R = cv2.morphologyEx(M, cv2.MORPH_CLOSE, disk(b.get('close', 1.1) / G.res))
    R = (cv2.dilate(R, disk(0.45 / G.res)) > 0).astype(np.uint8)
    # nearest seat -> its row
    pts = G.empty(np.uint8); lab_of = {}
    gx_, gz_ = G.g(b['seats'][:, 0], b['seats'][:, 1])
    seedimg = np.ones((G.H, G.W), np.uint8)
    for i, (x, z) in enumerate(zip(gx_, gz_)):
        seedimg[int(round(z)), int(round(x))] = 0
    dist, lab = cv2.distanceTransformWithLabels(seedimg, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    # labels are numbered in scan order of the zero pixels
    zy, zx = np.nonzero(seedimg == 0)
    order = {(int(y), int(x)): k + 1 for k, (y, x) in enumerate(zip(zy, zx))}
    lrow = np.zeros(len(zy) + 1, int)
    for i, (x, z) in enumerate(zip(gx_, gz_)):
        lrow[order[(int(round(z)), int(round(x)))]] = b['row'][i]
    rowf = np.where(R > 0, lrow[lab], -1)
    b['R'] = R; b['rowf'] = rowf
    b['top'] = np.where(rowf >= 0, np.array(b['hs'])[np.maximum(rowf, 0)], -1.0)
print('treads', round(time.time() - T0, 1))
def other_top(ox, oy, me):
    t = 0.0
    for b in blocks:
        if b is me: continue
        if b['top'][oy, ox] > t: t = b['top'][oy, ox]
    return t
levels = []
for b in blocks:
    rows_out = []
    for r in range(len(b['hs'])):
        m = (b['rowf'] == r).astype(np.uint8)
        if not m.any(): continue
        m = (m | (cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=2) & (b['rowf'] > r))).astype(np.uint8)
        top = b['hs'][r]; bot = 0.0 if b['bottom'] == 'ground' else b['hs'][0] - b['bottom']     # a balcony: one flat soffit under it
        rows_out.append({'r': r, 'y': top, 'y0': round(bot, 3), 'polys': [poly_out(p, 2) for p in contours(G, m, eps=0.012, minarea=0.05, sigma=0.8)]})
    # parapets: along the outline wherever the terrace stands 0.3 m or more above what is beside it
    rails = []
    for ring, _h in rings_px(b['R'], 0.015 / G.res, sigma=0.8, minarea_px=4):
        for i in range(len(ring)):
            a = ring[i]; e = ring[(i + 1) % len(ring)]
            m = (a + e) / 2; t = e - a; Lt = np.hypot(*t)
            if Lt < 1e-6: continue
            nrm = np.array([t[1], -t[0]]) / Lt
            p1 = m + nrm * 5; p2 = m - nrm * 5
            inside = lambda p: 0 <= int(round(p[0])) < G.W and 0 <= int(round(p[1])) < G.H and b['R'][int(round(p[1])), int(round(p[0]))] > 0
            out, inn = (p1, p2) if not inside(p1) else (p2, p1)
            if inside(out) or not inside(inn): continue
            ox, oy = int(round(out[0])), int(round(out[1])); ix, iy = int(round(inn[0])), int(round(inn[1]))
            h = float(b['top'][iy, ix]); below = float(other_top(ox, oy, b))
            if h - below < 0.3: continue
            # just proud of the terrace's face, so the two never fight
            so = (out - m) / np.linalg.norm(out - m) * (0.04 / G.res)
            A = G.m(a[0] + so[0], a[1] + so[1]); B_ = G.m(e[0] + so[0], e[1] + so[1])
            y0 = below if b['bottom'] == 'ground' else b['hs'][0] - b['bottom'] - 0.35
            rails.append([round(float(A[0]), 2), round(float(A[1]), 2), round(float(B_[0]), 2), round(float(B_[1]), 2), round(y0, 2), round(h + 0.85, 2)])
    arr = np.c_[np.round(b['seats'][:, 0] * 10), np.round(b['seats'][:, 1] * 10), b['row'], np.round(np.degrees(b['yaw']))].astype('<i2')
    levels.append({'name': b['name'], 'D': round(b['D'], 3), 'h0': b['hs'][0], 'rise': 0, 'hs': b['hs'], 'rows': rows_out, 'steps': [], 'holes': [],
                   'seats': base64.b64encode(arr.tobytes()).decode('ascii'), 'rails': rails, 'walls': []})
    print(b['name'], 'rows', len(rows_out), 'rails', len(rails))
# the 2nd floor's walkways: behind the back blocks to the back wall, and
# behind the galleries to the side walls
hall = np.load('lch/hall_poly.npy'); Hm = G.empty()
hw = w(hall[:, 0], hall[:, 1]); gx_, gz_ = G.g(hw[:, 0], hw[:, 1])
cv2.fillPoly(Hm, [np.c_[gx_, gz_].round().astype(np.int32)], 1)
back = [b for b in blocks if b['fl'] == '2' and b['name'] in ('C5', 'LB5', 'RB5', 'LA5', 'RA5')]
floors = []
if back:
    Rb = np.zeros_like(Hm)
    for b in back: Rb |= b['R']
    last = max(b['hs'][-1] for b in back)
    zmax = max(b['seats'][:, 1].max() for b in back) + 0.5
    xs = np.vstack([b['seats'] for b in back])[:, 0]
    walk = (Hm > 0) & (GZ > zmax) & (GX > xs.min() - 1) & (GX < xs.max() + 1)
    floors.append({'y': round(last, 3), 'y0': round(last - 0.35, 3), 'polys': mask_polys(G, walk, eps=0.02, minarea=1.0)})
for s_ in ('L', 'R'):
    gb = [b for b in blocks if b['name'] == s_ + 'G'][0]
    Rg = gb['R'] > 0
    # out to the wall, beside the gallery
    Mw = cv2.dilate(Rg.astype(np.uint8), disk(2.5 / G.res)) > 0
    side = (GX < 0) if s_ == 'L' else (GX > 0)
    ctr = np.array([0.0, 14.0])
    rg = np.hypot(GX - ctr[0], GZ - ctr[1])
    rmin = np.hypot(gb['seats'][:, 0] - ctr[0], gb['seats'][:, 1] - ctr[1]).max()
    walk = Mw & ~Rg & (Hm > 0) & side & (rg > rmin)
    floors.append({'y': gb['hs'][-1], 'y0': round(gb['hs'][-1] - 0.35, 3), 'polys': mask_polys(G, walk, eps=0.02, minarea=0.5)})
st = np.load('lch/stage_mask.npy')
stage = max(rings_px(st, 0.4, sigma=1.0), key=lambda r: cv2.contourArea(r[0]))[0]
r2 = lambda P: [[round(float(x), 2), round(float(z), 2)] for x, z in w(P[:, 0], P[:, 1])]
data = {'levels': levels, 'floors': floors, 'flights': [], 'outer': [], 'plan': r2(hall), 'stage': r2(stage)}
json.dump(data, open('lotte_stands.json', 'w'), separators=(',', ':'))
import os; print('json KB', os.path.getsize('lotte_stands.json') // 1024, round(time.time() - T0, 1))
import colorsys
vis = {fl: cv2.imread(f'lch/img_seating_chart030{fl}.jpg') for fl in ('1', '2')}
for i, b in enumerate(blocks):
    for (x, z), r in zip(b['seats'], b['row']):
        u = x / K + U0; v = (z - ZF) / K + V0
        c = tuple(int(255 * q) for q in colorsys.hsv_to_rgb((i * 0.17) % 1, 0.9, 0.95 if r % 2 else 0.45))
        cv2.circle(vis[b['fl']], (int(round(u)), int(round(v))), 2, c, -1)
for fl in vis: cv2.imwrite(f'lch/levels{fl}.png', cv2.resize(vis[fl], None, fx=1.4, fy=1.4))
