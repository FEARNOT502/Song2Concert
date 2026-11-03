# Lotte Concert Hall: fill the pits lotte_fill.py left in the 1st floor.
#
# lotte_fill.py closed the gaps between the 1st floor's blocks up by an aisle's
# width. Wider ones were left, and two holes inside the stalls' back blocks:
# places no tread covers, dropping to the hall's floor between the walls of the
# blocks round them (beside the side terraces L and R, behind the stalls' side
# blocks, and in the stalls' back rows either side of the centre). They are
# found on the floor's height (rows, steps and the platform):
#   a slot: where the height closed over 3 m (a max, then a min) stands 0.3 m
#     above it;
#   a hole: a patch at the floor's own level with treads all round it, reaching
#     neither a wall nor the platform.
# The walkway round the platform (the 0.8 m lotte_fill.py left) is kept; the
# notches in the terraces' fronts along it are filled. Each pit is filled
# solid to the height of the tread nearest it, so the terraces run on into it,
# and added to the stalls' steps. Rewrites lotte_stands.json in place (once).
#   python lotte_pits.py   (from pipeline/), then python pipeline/mkdata.py lotte
import json, numpy as np, cv2
from scipy import ndimage
from shapely.geometry import Polygon
from standlib import Grid, disk
from standgen import mask_polys

SRC = 'lotte_stands.json'
d = json.load(open(SRC, encoding='utf-8'))
if not d.get('filled'): raise SystemExit('run lotte_fill.py first')
if d.get('pitsFilled'): raise SystemExit('already filled')
RES, DECK = 0.05, 1.0
G = Grid(-21, 21, -18, 40, RES)

def raster(polys_list):
    m = G.empty()
    for polys in polys_list:
        rings = [np.round(np.c_[G.g(np.array(r)[:, 0], np.array(r)[:, 1])]).astype(np.int32) for r in polys]
        cv2.fillPoly(m, [rings[0]], 1)
        for h in rings[1:]: cv2.fillPoly(m, [h], 0)
    return m.astype(bool)

plan = raster([[d['plan']]])
inside = cv2.erode(plan.astype(np.uint8), disk(0.15 / RES)) > 0
stage = raster([[d['stage']]])

# the 1st floor's treads: every row and step of the levels that stand on the floor
F1 = [L['name'] for L in d['levels'] if L['rows'][0]['y0'] < 1]
H = np.zeros((G.H, G.W)); M = np.zeros((G.H, G.W), bool); rows = np.zeros((G.H, G.W), bool)
for L in d['levels']:
    if L['name'] not in F1: continue
    for r in L['rows']:
        m = raster(r['polys']); H[m] = np.maximum(H[m], r['y']); M |= m; rows |= m
    for s in L.get('steps', []):
        m = raster([s['polys']]); H[m] = np.maximum(H[m], s['y']); M |= m
Hs = np.where(stage, np.maximum(H, DECK), H)

# outside the walls takes the height just inside them, so the walls count for nothing
_, (iy, ix) = ndimage.distance_transform_edt(~inside, return_indices=True)
He = Hs[iy, ix]
R = int(round(1.5 / RES))
C = ndimage.grey_closing(He, size=(2 * R + 1, 2 * R + 1))
# (a slot may lie on a low step lotte_fill.py laid, never on a row of seats)
slot = inside & ~rows & ~stage & (C - Hs > 0.3)
low = inside & ~M & ~stage & (Hs < 0.3) & ~slot
lab, n = ndimage.label(low)
edge = cv2.dilate((~inside | stage).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
hole = np.zeros_like(low)
for i in range(1, n + 1):
    c = lab == i
    if not (c & edge).any(): hole |= c
walk = cv2.dilate(stage.astype(np.uint8), disk(0.85 / RES)) > 0
pit = (slot | hole) & ~walk

# each pit's point to the tread nearest it (outside the pits), where that is
# higher than what is there now
_, (ty, tx) = ndimage.distance_transform_edt(~(M & ~pit), return_indices=True)
F = np.where(pit, H[ty, tx], -1.0)
pit &= F > H + 0.05
out = []
for y in np.unique(F[pit]):
    m = (pit & (np.abs(F - y) < 1e-6)).astype(np.uint8)
    # (a cell over into the treads round it, under which it is hidden, so no
    # sliver opens along its edge)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    m = (cv2.dilate(m, np.ones((3, 3), np.uint8)) > 0) & (pit | (M & (H >= y - 1e-6)))
    for polys in mask_polys(G, m, minarea=0.08):
        out.append({'y': round(float(y), 3), 'y0': 0.0, 'polys': polys})
next(L for L in d['levels'] if L['name'] == 'STALLS').setdefault('steps', []).extend(out)
d['pitsFilled'] = True
print('pits', len(out), 'pieces', round(sum(Polygon(p['polys'][0]).area for p in out), 1), 'm2')
for x0, x1 in ((-21, -10), (-10, 0), (0, 10), (10, 21)):
    a = sum(Polygon(p['polys'][0]).area for p in out if x0 <= Polygon(p['polys'][0]).centroid.x < x1)
    print('  x %d..%d: %.1f m2' % (x0, x1, a))
json.dump(d, open(SRC, 'w', encoding='utf-8'), separators=(',', ':'))
