# Lotte Concert Hall: close the terraces up and set the platform right, as the
# hall is built (checked against its own seating charts, lotteconcerthall.com
# 시설안내 → 객석안내, 1st and 2nd floor, 2026-11-02, and photographs).
#
# lotte_gen2.py laid every block out as a terrace of its own and left what lies
# between them at the hall's floor, and its `stage` came out as the hall's
# whole outline (the platform was drawn over the whole floor, 1 m up). So:
#   the platform: the open middle of the hall that no 1st-floor block reaches
#     (kept 0.8 m clear of them, for the walkway round it);
#   1st floor: every gap between blocks (closing them up by an aisle's width,
#     never onto the platform or past the walls) filled to the height of the
#     row nearest it, solid to the floor: the aisles stepped with the rows;
#   2nd floor, rear (A to E): from the blocks' front back to the wall, one tier;
#   2nd floor, sides (L, R): each gallery out to its side wall.
# The seats are not touched. Rewrites lotte_stands.json in place (once).
#   python lotte_fill.py   (from pipeline/), then python pipeline/mkdata.py lotte
import json, numpy as np, cv2
from scipy import ndimage
from shapely.geometry import Polygon
from standlib import Grid, disk
from standgen import mask_polys

SRC = 'lotte_stands.json'
d = json.load(open(SRC, encoding='utf-8'))
if d.get('filled'): raise SystemExit('already filled')
RES = 0.05
G = Grid(-21, 21, -18, 40, RES)
gy, gx = np.mgrid[0:G.H, 0:G.W]
GX, GZ = G.m(gx, gy)

def raster(polys_list):
    m = G.empty()
    for polys in polys_list:
        rings = [np.round(np.c_[G.g(np.array(r)[:, 0], np.array(r)[:, 1])]).astype(np.int32) for r in polys]
        cv2.fillPoly(m, [rings[0]], 1)
        for h in rings[1:]: cv2.fillPoly(m, [h], 0)
    return m.astype(bool)

plan = raster([[d['plan']]])
inside = cv2.erode(plan.astype(np.uint8), disk(0.15 / RES)) > 0

def tiers(names):
    H = np.full((G.H, G.W), -1.0); M = np.zeros((G.H, G.W), bool); y0 = None
    for L in d['levels']:
        if L['name'] not in names: continue
        for r in L['rows']:
            m = raster(r['polys']); H[m] = np.maximum(H[m], r['y']); M |= m
            y0 = r['y0'] if y0 is None else min(y0, r['y0'])
    return H, M, y0

def fill(H, M, region):
    gap = region & ~M
    _, (iy, ix) = ndimage.distance_transform_edt(~M, return_indices=True)
    return gap, np.where(gap, H[iy, ix], -1.0)

def emit(F, gap, y0, minarea=0.08):
    out = []
    for y in np.unique(F[gap]):
        m = (gap & (np.abs(F - y) < 1e-6)).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        for polys in mask_polys(G, m.astype(bool), minarea=minarea):
            out.append({'y': round(float(y), 3), 'y0': round(float(y0), 3), 'polys': polys})
    return out

# ── the platform ──
F1 = [L['name'] for L in d['levels'] if L['rows'][0]['y0'] < 1]
H1, M1, _ = tiers(F1)
free = inside & ~(cv2.dilate(M1.astype(np.uint8), disk(0.8 / RES)) > 0)
lab, _ = ndimage.label(free)
i0, j0 = [int(round(float(c))) for c in G.g(0.0, 3.0)][::-1]
plat = lab == lab[i0, j0]
plat = cv2.morphologyEx(plat.astype(np.uint8), cv2.MORPH_OPEN, disk(0.6 / RES)) > 0
pp = mask_polys(G, plat, minarea=20.0)
pp = max(pp, key=lambda p: Polygon(p[0]).area)
d['stage'] = pp[0]
stage = cv2.dilate(plat.astype(np.uint8), disk(0.3 / RES)) > 0
print('platform', [round(v, 1) for v in Polygon(pp[0]).bounds], round(Polygon(pp[0]).area, 1), 'm2')

# ── the 1st floor's aisles ──
env1 = cv2.morphologyEx(M1.astype(np.uint8), cv2.MORPH_CLOSE, disk(1.4 / RES)) > 0
gap1, Fh1 = fill(H1, M1, env1 & inside & ~stage)
steps1 = emit(Fh1, gap1, 0.0)

# ── the 2nd floor, rear: from the blocks' front back to the wall ──
REAR = ['LA5', 'RA5', 'LB5', 'RB5', 'C5']
H2, M2, y02 = tiers(REAR)
cols = np.where(M2.any(0))[0]
front = np.full(G.W, np.nan)
for j in cols: front[j] = GZ[np.where(M2[:, j])[0].min(), j]
idx = np.arange(G.W); ok = ~np.isnan(front)
front = np.interp(idx, idx[ok], front[ok])
front = ndimage.uniform_filter1d(front, 9, mode='nearest')
back = np.zeros((G.H, G.W), bool)
for j in range(cols.min(), cols.max() + 1): back[:, j] = GZ[:, j] >= front[j] - 0.02
gap2, Fh2 = fill(H2, M2, back & plan)
steps2 = emit(Fh2, gap2, y02)

# ── the 2nd floor, sides: each gallery out to its wall ──
steps3 = {}
for nm, side in (('LG', -1), ('RG', 1)):
    H3, M3, y03 = tiers([nm])
    reg = np.zeros((G.H, G.W), bool)
    for i in np.where(M3.any(1))[0]:
        js = np.where(M3[i])[0]
        if side < 0: reg[i, :js.max() + 1] = True
        else: reg[i, js.min():] = True
    gap3, Fh3 = fill(H3, M3, reg & plan)
    steps3[nm] = emit(Fh3, gap3, y03)

def add(name, steps):
    next(L for L in d['levels'] if L['name'] == name).setdefault('steps', []).extend(steps)
add('STALLS', steps1); add('C5', steps2); add('LG', steps3['LG']); add('RG', steps3['RG'])
d['filled'] = True
for nm, s in (('1st floor', steps1), ('rear balcony', steps2), ('galleries', steps3['LG'] + steps3['RG'])):
    print(nm, len(s), 'pieces', round(sum(Polygon(p['polys'][0]).area for p in s), 1), 'm2')
json.dump(d, open(SRC, 'w', encoding='utf-8'), separators=(',', ':'))
