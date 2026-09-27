# Tokyo Dome, the 1st floor's A seats, row by row as the building has them:
# in each block the rows run parallel to the block's back (the walkway behind
# row 26), numbered back from it, and the field fence cuts across them — so
# towards the poles a block's front row is a higher-numbered row (A45 from
# row 6, A47 from 10, A48 from 14), and the blocks at the poles, A01 and A49,
# run from row 15 on past the walkway to row 40.
import json, pickle, numpy as np, cv2
import sys; sys.path.insert(0, '.')
from standlib import Grid, disk
lab = json.load(open('td/td_labeled.json'))
Hm = np.array([579.2, 441.7]); s = 2.996
toR = lambda poly: np.c_[(np.array(poly)[:, 0] - Hm[0]) / s, (np.array(poly)[:, 1] - Hm[1]) / s]
G = Grid(-140, 140, -200, 110, 0.1)
O = np.array([0.0, -60.0])
DA, DB = 0.74, 0.748
A = [o for o in lab if o['L'] == 'A' and len(o['nums']) <= 6]
def rows_of(o):
    blk = o['nums'][0]
    n = [v for v in o['nums'][1:] if v < 60]
    r1 = 40 if 40 in n else 26
    r0 = min([v for v in n if v != r1] or [1])
    return blk, r0, r1
def back_edge(P):
    # a block runs from the field back to the walkway: its long axis, turned
    # toward the field, is the way the rows face; its back is its far end
    m = G.empty(); gx, gz = G.g(P[:, 0], P[:, 1]); cv2.fillPoly(m, [np.c_[gx, gz].round().astype(np.int32)], 1)
    ys, xs = np.nonzero(m); X, Z = G.m(xs, ys); Q = np.c_[X, Z]
    c = Q.mean(0); w, v = np.linalg.eigh(np.cov((Q - c).T)); f = v[:, np.argmax(w)]
    if np.dot(f, O - c) < 0: f = -f
    sb = float((P @ f).min())
    return sb, f
blocks = []
seatsA, rowA, secA, seatsB, rowB = [], [], [], [], []
for o in A:
    blk, r0, r1 = rows_of(o)
    P = toR(o['poly'])
    sb, f = back_edge(P)
    u = np.array([-f[1], f[0]])
    # for A01/A49 the polygon's back is row 40's; A's walkway line is 14 rows in
    sA = sb + ((r1 - 26) * DB if r1 > 26 else 0.0)
    m = G.empty(); gx, gz = G.g(P[:, 0], P[:, 1]); cv2.fillPoly(m, [np.c_[gx, gz].round().astype(np.int32)], 1)
    m = cv2.erode(m, disk(0.18 / G.res)) > 0
    lo, hi = (P @ u).min() - 1, (P @ u).max() + 1
    k = len(blocks)
    blocks.append({'blk': blk, 'f': f, 'sA': sA, 'rows': (r0, r1), 'poly': P})
    for r in range(r0, r1 + 1):
        off = (26 - r + 0.5) * DA if r <= 26 else -(r - 27 + 0.5) * DB
        c = sA + off                                    # the row's line: p·f = c
        us = np.arange(lo, hi, 0.05)
        C = u[None, :] * us[:, None] + f[None, :] * c
        gx, gz = G.g(C[:, 0], C[:, 1]); gx = np.clip(np.round(gx).astype(int), 0, G.W - 1); gz = np.clip(np.round(gz).astype(int), 0, G.H - 1)
        inside = m[gz, gx]
        if not inside.any(): continue
        idx = np.nonzero(inside)[0]
        for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
            u0, u1 = us[run[0]], us[run[-1]]; L = u1 - u0
            n = int(L // 0.5)
            if n < 1: continue
            t0 = u0 + (L - n * 0.5) / 2 + 0.25
            for kk in range(n):
                p = u * (t0 + kk * 0.5) + f * c
                if r <= 26: seatsA.append(p); rowA.append(r - 1); secA.append(k)
                else: seatsB.append(p); rowB.append(r - 27)
seatsA, rowA, secA, seatsB, rowB = map(np.array, (seatsA, rowA, secA, seatsB, rowB))
print('A seats', len(seatsA), 'rows', rowA.min() + 1, '-', rowA.max() + 1, '; the pole blocks past the walkway', len(seatsB))
pickle.dump({'SA': seatsA, 'rowA': rowA, 'secA': secA, 'blocks': blocks, 'SBx': seatsB, 'rowBx': rowB}, open('td_rowsA.pkl', 'wb'))
