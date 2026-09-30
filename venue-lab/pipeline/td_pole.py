# Tokyo Dome: the corner at each foul pole, laid out block by block as the
# seating map draws it.
#
# The map draws the 1st floor as a fan of blocks ("fingers"), each with
# straight rows square to its own axis: A02..A08 with their B blocks behind the
# walkway, the wedge A01 (rows 15-40) at the pole, and the outfield's F blocks
# beyond it. From the map's outlines and the building's sections come the
# rows, in every block, and the heights of the treads; nothing here is traced
# off a raster.
#
# The infield's stand is shallow and 37 m deep, the outfield's steep and 13 m,
# and at the pole the blocks' depth falls from 32 m to 14 in three blocks. So
# the fingers at the pole (A01, A02+B02, A03+B03) each climb from the fence to
# the concourse over their own depth, at heights (front, walkway, back) that
# make the step across each aisle between one block and the next no more than
# about a metre, and across the aisle to the outfield's F20 the same (the
# values were fitted for the smallest such step, with the fronts, where the
# fence stands, rising smoothly from the lines to the outfield's).
import numpy as np, cv2
from shapely.geometry import Polygon
from standlib import disk, rings_field

DA, DB = 0.74, 0.748          # the rows' pitch in A (1-26) and in B (27-)
C1F = 10.6                    # the 1st-floor concourse
# (front, walkway, back) of each finger of the pole's corner, on the 1B side
# (the 3B side is its mirror image)
ANCH = {1: (3.90, 7.42, 10.60), 2: (3.25, 7.78, 9.44), 3: (2.44, 6.46, 10.60)}
KFINGERS = (1, 2, 3)

def _toR(poly, Hm=np.array([579.2, 441.7]), s=2.996):
    a = np.array(poly)
    return np.c_[(a[:, 0] - Hm[0]) / s, (a[:, 1] - Hm[1]) / s]

def chart_blocks(lab, BOXL, BOXN, G):
    """Every A, B and F block of the 1B side (x > 0) as a convex polygon, by
    (letter, number); B02, which the labelled outlines lack, from the map's
    flood-filled boxes."""
    out = {}
    for o in lab:
        if o['L'] not in 'ABF' or len(o['nums']) > 6: continue
        P = _toR(o['poly'])
        if P[:, 0].mean() <= 0: continue
        n = o['nums'][0]
        if o['L'] == 'F' and n > 20: continue
        out[(o['L'], n)] = Polygon(P).buffer(0).convex_hull
    if 'B02' in [str(b) for b in BOXN]:
        m = (BOXL == [str(b) for b in BOXN].index('B02')).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
        out[('B', 2)] = Polygon(np.c_[c[:, 0] * G.res + G.x0, c[:, 1] * G.res + G.z0]).buffer(0).simplify(0.05).convex_hull
    return out

class Finger:
    """One block's frame: `f` the unit vector towards the field along its
    axis, rows the lines p.f = const, spaced DA in A (rows 1-26, counted back
    from the walkway at p.f = sA) and DB in B (27 on, behind the walkway's
    far edge sBf), the front the most forward point of its A block."""
    def __init__(s, n, f, sA, pa, pb, anch):
        s.n = n; s.f = np.array(f, float); s.sA = float(sA); s.pa = pa; s.pb = pb
        PA = np.array(pa.exterior.coords)
        s.cfront = float((PA @ s.f).max())
        s.sBf = s.sA if (pb is None or n == 1) else float((np.array(pb.exterior.coords) @ s.f).max())
        allp = np.vstack([PA] + ([np.array(pb.exterior.coords)] if pb is not None else []))
        s.cback = float((allp @ s.f).min())
        s.uw = s.cfront - 0.5 * (s.sA + s.sBf); s.ub = s.cfront - s.cback
        s.hf, s.hw, s.hb = anch
    def height(s, c):
        """Tread height at coordinate c: linear from the front to the walkway to the back, level behind."""
        u = np.clip(s.cfront - np.asarray(c, float), 0, s.ub)
        return np.where(u <= s.uw, s.hf + (s.hw - s.hf) * u / s.uw, s.hw + (s.hb - s.hw) * (u - s.uw) / max(s.ub - s.uw, 1e-6))
    def row_of(s, c):
        """(kind, r): 'A' rows 1-26, 'W' the walkway, 'B' rows 27 on."""
        if c >= s.sA: return ('A', int(np.clip(26 - np.floor((c - s.sA) / DA), 1, 26)))
        if c >= s.sBf: return ('W', 26)
        if c < s.cback: return ('K', 99)
        return ('B', int(27 + np.floor((s.sBf - c) / DB)))
    def row_centre(s, kind, r):
        if kind == 'A': return s.sA + (26 - r + 0.5) * DA
        if kind == 'W': return 0.5 * (s.sA + s.sBf)
        if kind == 'B': return s.sBf - (r - 27 + 0.5) * DB
        return s.cback - 0.3
    def row_span(s, kind, r):
        if kind == 'A': c = s.row_centre(kind, r); return c - DA / 2, c + DA / 2
        if kind == 'W': return s.sBf, s.sA
        if kind == 'B': c = s.row_centre(kind, r); return c - DB / 2, c + DB / 2
        return -1e3, s.cback

def label_nearest(G, polys, shape):
    """For every cell, the key of the nearest polygon (by distance)."""
    keys = list(polys.keys()); seed = np.ones(shape, np.uint8); ids = np.zeros(shape, np.int32)
    for i, k in enumerate(keys):
        m = np.zeros(shape, np.uint8)
        P = np.array(polys[k].exterior.coords)
        gx, gz = G.g(P[:, 0], P[:, 1])
        cv2.fillPoly(m, [np.c_[gx, gz].round().astype(np.int32)], 1)
        seed[m > 0] = 0; ids[m > 0] = i + 1
    _, lab = cv2.distanceTransformWithLabels(seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(seed == 0)
    of_label = np.zeros(lab.max() + 1, np.int32); of_label[lab[zy, zx]] = ids[zy, zx]
    return of_label[lab], keys

def sdf(mask, res):
    from scipy.ndimage import distance_transform_edt
    m = mask > 0
    return (np.where(m, distance_transform_edt(m) - 0.5, -(distance_transform_edt(~m) - 0.5)) * res).astype(np.float32)

def fkey(side, n): return n + (0 if side > 0 else 10)

def build(G, blocks, frames, domain, dom_f, sides=(1, -1)):
    """The corners of both poles. `blocks`: the 1B side's block polygons by
    (letter, number); `frames`: {n: (f, sA)} for the A blocks; `domain`: the
    cells the corners may take (the old 1st-floor stand there), `dom_f` those
    of them that the outfield's stand (F) had. The 3B side is
    the 1B side's mirror image (the building is symmetric), laid on the cells
    of its own side. Returns a dict."""
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    band = np.full(domain.shape, -1, np.int64)
    zone = np.zeros(domain.shape, bool)
    hs = []; meta = []; fingers = {}; polys_by_key = {}
    for side in sides:
        mir = (lambda P: np.c_[-P[:, 0], P[:, 1]]) if side < 0 else (lambda P: P)
        poly = lambda k: Polygon(mir(np.array(blocks[k].exterior.coords)))
        F = {}
        for n in KFINGERS:
            f, sA = frames[n]
            f = np.array(f, float) * (np.array([-1.0, 1.0]) if side < 0 else 1.0)
            pb = poly(('B', n)) if ('B', n) in blocks and n > 1 else None
            F[n] = Finger(n, f, sA, poly(('A', n)), pb, ANCH[n])
        # every block on this side, to part the cells between the corner and its neighbours
        polys = {k: poly(k) for k in blocks}
        lab, keys = label_nearest(G, polys, domain.shape)
        kid = {k: i + 1 for i, k in enumerate(keys)}
        finger_of = np.zeros(domain.shape, np.int8)
        for n in KFINGERS:
            for L in 'AB':
                if (L, n) in kid: finger_of[lab == kid[(L, n)]] = n
        m_side = domain & (finger_of > 0) & (X * side > 0)
        # scraps of the infield's treads the outfield's block F20 lies nearest
        # (a sliver behind its back corner) are the corner's too, not a
        # low patch standing against it
        from scipy.ndimage import distance_transform_edt
        near = distance_transform_edt(~m_side) * G.res <= 3.0
        isF = np.isin(lab, [kid[k] for k in kid if k[0] == 'F'])
        extra = domain & ~dom_f & isF & near & (X * side > 0) & ~m_side
        if extra.any():
            kpolys = {k: polys[k] for k in kid if k[1] in KFINGERS and k[0] in 'AB' and not (k[0] == 'B' and k[1] == 1)}
            lab2, keys2 = label_nearest(G, kpolys, domain.shape)
            fo = np.zeros(domain.shape, np.int8)
            for i, k in enumerate(keys2): fo[lab2 == i + 1] = k[1]
            finger_of = np.where(extra, fo, finger_of)
            m_side = m_side | extra
        zone |= m_side
        ids = {}
        for n in KFINGERS:
            fg = F[n]; m = m_side & (finger_of == n)
            if not m.any(): continue
            c = X[m] * fg.f[0] + Z[m] * fg.f[1]
            rc = [fg.row_of(ci) for ci in c]
            idx = np.zeros(len(c), np.int64)
            for key in sorted(set(rc), key=lambda t: -fg.row_centre(*t)):
                c0, c1 = fg.row_span(*key)
                ids[key] = len(hs)
                hs.append(float(fg.height(fg.row_centre(*key))))
                meta.append((fkey(side, n), key[0], key[1], c0, c1, hs[-1]))
            for i, key in enumerate(rc): idx[i] = ids[key]
            band[m] = idx
            fingers[fkey(side, n)] = fg
            polys_by_key[fkey(side, n)] = [F[n].pa] + ([F[n].pb] if F[n].pb is not None else [])
            ids = {}
    return dict(zone=zone, band=band, hs=np.array(hs), meta=meta, fingers=fingers, polys_by_key=polys_by_key)

def rows_out(G, band, meta, fingers, hs, extend=0.3, eps=0.03):
    """The corner's rows as the renderer wants them: for each row, the strip
    of its block between two exact lines (square to the block's axis), cut to
    the block's outline, reaching `extend` under the next row up so the
    treads meet with no crack."""
    idf = np.array([m[0] for m in meta], np.int16)
    fid = np.where(band >= 0, idf[np.clip(band, 0, None)], 0)
    out = []
    for i, (n, kind, r, c0, c1, h) in enumerate(meta):
        m = band == i
        if not m.any(): continue
        fg = fingers[n]
        ys, xs = np.nonzero(m); pad = 10
        box = (max(0, ys.min() - pad), min(G.H, ys.max() + pad + 1), max(0, xs.min() - pad), min(G.W, xs.max() + pad + 1))
        sl = (slice(box[0], box[1]), slice(box[2], box[3]))
        sd = sdf(fid[sl] == n, G.res)
        gy, gx = np.mgrid[box[0]:box[1], box[2]:box[3]]; X, Z = G.m(gx, gy)
        c = X * fg.f[0] + Z * fg.f[1]
        lo = c - (c0 - extend) if kind != 'K' else np.full(c.shape, 1e3, np.float32)
        f = np.minimum(np.minimum(lo, c1 - c), sd).astype(np.float32)
        full = np.full((G.H, G.W), -1.0, np.float32); full[sl] = f
        polys = []
        for o, hh in rings_field(full, eps / G.res, 0.2 / G.res ** 2, box=box):
            ring = lambda q: [[round(float(a), 2), round(float(b), 2)] for a, b in np.c_[G.m(q[:, 0], q[:, 1])]]
            polys.append([ring(o)] + [ring(hq) for hq in hh])
        out.append({'r': i, 'y': round(float(hs[i]), 3), 'y0': 0.0, 'polys': polys})
    return out

def lay_seats(G, band, meta, fingers, polys_by_key, pitch=0.5, inset=0.18):
    """Seats along every row of every block, `pitch` apart, in the block's
    outline pulled in by `inset`, facing the field; none on the walkway or
    behind the last row."""
    S, R, Y = [], [], []
    for n, fg in fingers.items():
        # the seats' ground: the finger's blocks (A and B), each pulled in a little
        ok = np.zeros(band.shape, np.uint8)
        for P in polys_by_key[n]:
            m = np.zeros(band.shape, np.uint8); gx, gz = G.g(*np.array(P.exterior.coords).T)
            cv2.fillPoly(m, [np.c_[gx, gz].round().astype(np.int32)], 1)
            ok |= cv2.erode(m, disk(inset / G.res))
        ok = ok > 0
        u = np.array([-fg.f[1], fg.f[0]])
        for i, (nn, kind, r, c0, c1, h) in enumerate(meta):
            if nn != n or kind not in 'AB': continue
            m = ok & (band == i)
            if not m.any(): continue
            ys, xs = np.nonzero(m); X, Z = G.m(xs, ys); P = np.c_[X, Z]
            us = np.arange((P @ u).min() - 0.1, (P @ u).max() + 0.1, 0.05)
            cc = fg.row_centre(kind, r)
            C = u[None, :] * us[:, None] + fg.f[None, :] * cc
            gxx, gzz = G.g(C[:, 0], C[:, 1])
            ii = np.clip(np.round(gxx).astype(int), 0, G.W - 1); jj = np.clip(np.round(gzz).astype(int), 0, G.H - 1)
            idx = np.nonzero(m[jj, ii])[0]
            if not len(idx): continue
            for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
                L = us[run[-1]] - us[run[0]] + 0.05; k = int(L // pitch)
                if k < 1: continue
                t0 = us[run[0]] - 0.025 + (L - k * pitch) / 2 + pitch / 2
                for kk in range(k):
                    S.append(u * (t0 + kk * pitch) + fg.f * cc); R.append(i); Y.append(np.arctan2(fg.f[0], fg.f[1]))
    return np.array(S).reshape(-1, 2), np.array(R, int), np.array(Y)
