# Tokyo Dome: the 1st floor's stands block by block, as the seating map draws them.
#
# The map draws the infield's 1st floor as a fan of blocks ("fingers"): each an
# A block (rows 1-26 from the field back to the walkway) with its B block behind
# the walkway (rows 27 on), the rows straight and square to the finger's own
# axis; A01 and A49, the wedges at the poles, run on past the walkway to row 40.
# The outfield's F blocks are curved rows from the fence. Every block's outline
# is the map's; the aisle between two blocks is the seam where one block's rows
# end and the next's begin (each block's rows run to the middle of the gap the
# map leaves, seats stop at its outline). The 3B side is the 1B side's mirror
# image (the building is symmetric; the map's 3B B blocks are traced only as far
# as their labels).
#
# Heights: the rows climb by the building's section (A 0.17 m a row from 1.0 m at
# row 1, B 0.255 m a row from 5.5 m at row 27), each block's back meeting the
# concourse (10.6 m). At the poles, where the infield's shallow 37 m stand meets
# the outfield's steep 13 m one, the three corner fingers' (front, walkway, back)
# heights are fitted so that the step across each aisle is small (see PIN).
import numpy as np, cv2
from shapely.geometry import Polygon
from shapely.ops import unary_union
from standlib import disk, rings_field

DA, DB = 0.74, 0.748          # the rows' pitch in A (1-26) and in B (27-)
C1F = 10.6                    # the 1st-floor concourse
HIN_A = lambda r: 1.0 + 0.17 * (r - 1)
HIN_B = lambda r: 5.5 + 0.255 * (r - 27)
HW = 0.5 * (HIN_A(26) + HIN_B(27))        # the walkway between A and B
# (front, walkway, back) heights of the three corner fingers, on the 1B side
# (the 3B side is its mirror image), fitted by linear programme for the smallest
# step across every aisle, with the fronts (where the fence stands) rising
# smoothly from the lines' to the outfield's
PIN = {1: (3.90, 7.42, 10.60), 2: (3.25, 7.70, 10.60), 3: (2.44, 6.46, 10.60)}
MIRROR = np.array([-1.0, 1.0])

def _toR(poly, Hm=np.array([579.2, 441.7]), s=2.996):
    a = np.array(poly)
    return np.c_[(a[:, 0] - Hm[0]) / s, (a[:, 1] - Hm[1]) / s]

def _outline(ps):
    """One block's outline, in metres: the map's own (the outlines drawn for it
    joined, a hair simplified), or its hull if they do not meet."""
    u = unary_union([Polygon(p).buffer(0) for p in ps])
    if u.geom_type != 'Polygon': u = u.convex_hull
    return u.simplify(0.03)

def chart_blocks(lab, BOXL, BOXN, G):
    """The chart's blocks of the +x (1B) side and the centre, as polygons in
    metres: A[n] (n = 1..25, 25 the centre), B[n] (n = 2..25; B02 from the
    map's flood-filled boxes, B12 and B24 drawn as two outlines each: joined),
    and F: every F outline of both sides (F10-F11 the centre-field block)."""
    A, B, F = {}, {}, []
    for o in lab:
        if len(o['nums']) > 6: continue
        P = _toR(o['poly'])
        if o['L'] == 'F':
            F.append(_outline([P])); continue
        if o['L'] not in 'AB': continue
        n = o['nums'][0]; x = P[:, 0].mean()
        side_ok = (x > 2.0) or (abs(x) <= 2.0 and n == 25)
        if not side_ok: continue
        d = A if o['L'] == 'A' else B
        d.setdefault(n, []).append(P)
    A = {n: _outline(ps) for n, ps in A.items()}
    B = {n: _outline(ps) for n, ps in B.items()}
    names = [str(b) for b in BOXN]
    if 'B02' in names:
        m = (BOXL == names.index('B02')).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
        B[2] = _outline([np.c_[c[:, 0] * G.res + G.x0, c[:, 1] * G.res + G.z0]])
    return A, B, F

def mirrored(P):
    return Polygon(np.array(P.exterior.coords) * MIRROR)

class Finger:
    """One finger: its A block (rows 1-26 counted back from the walkway at
    p.f = sA, front the most forward point of the block) and its B block behind
    the walkway (rows 27 on, from the walkway's far edge sBf). Rows are the
    lines p.f = const, spaced DA in A and DB in B. Heights are linear between
    the (front, walkway, back) anchors, level behind the back."""
    def __init__(s, key, n, f, sA, pa, pb, anch=None):
        s.key = key; s.n = n; s.f = np.array(f, float); s.sA = float(sA); s.pa = pa; s.pb = pb
        PA = np.array(pa.exterior.coords)
        s.cfront = float((PA @ s.f).max())
        s.sBf = s.sA if (pb is None or n == 1) else float((np.array(pb.exterior.coords) @ s.f).max())
        allp = np.vstack([PA] + ([np.array(pb.exterior.coords)] if pb is not None else []))
        s.cback = float((allp @ s.f).min())
        s.uw = s.cfront - 0.5 * (s.sA + s.sBf); s.ub = s.cfront - s.cback
        s.rf = int(np.clip(26 - np.floor((s.cfront - s.sA) / DA), 1, 26))   # the front row
        s.hf, s.hw, s.hb = anch if anch is not None else (HIN_A(s.rf) - 0.085, HW, C1F)
    def height(s, c):
        u = np.clip(s.cfront - np.asarray(c, float), 0, s.ub)
        return np.where(u <= s.uw, s.hf + (s.hw - s.hf) * u / s.uw, s.hw + (s.hb - s.hw) * (u - s.uw) / max(s.ub - s.uw, 1e-6))
    def row_of(s, c):
        """(kind, r): 'A' rows rf-26, 'W' the walkway, 'B' rows 27 on, 'K' the
        landing behind the last row."""
        if c >= s.sA:
            return ('A', int(np.clip(26 - np.floor((min(c, s.cfront) - s.sA) / DA), s.rf, 26)))
        if c >= s.sBf: return ('W', 26)
        if c < s.cback: return ('K', 99)
        return ('B', int(27 + np.floor((s.sBf - c) / DB)))
    def row_centre(s, kind, r):
        if kind == 'A': return s.sA + (26 - r + 0.5) * DA
        if kind == 'W': return 0.5 * (s.sA + s.sBf)
        if kind == 'B': return s.sBf - (r - 27 + 0.5) * DB
        return s.cback - 0.3
    def row_span(s, kind, r):
        """The row's strip along the axis (from, to): the front row on to the
        field, the landing on to the back."""
        if kind == 'A':
            c = s.row_centre(kind, r)
            return c - DA / 2, (1e3 if r == s.rf else c + DA / 2)
        if kind == 'W': return s.sBf, s.sA
        if kind == 'B': c = s.row_centre(kind, r); return c - DB / 2, c + DB / 2
        return -1e3, s.cback

def label_nearest(G, polys, shape):
    """For every cell, the index (1-based, in `polys`' order) of the nearest polygon, and the distance to it (m)."""
    seed = np.ones(shape, np.uint8); ids = np.zeros(shape, np.int32)
    for i, p in enumerate(polys):
        m = np.zeros(shape, np.uint8)
        P = np.array(p.exterior.coords)
        gx, gz = G.g(P[:, 0], P[:, 1])
        cv2.fillPoly(m, [np.c_[gx, gz].round().astype(np.int32)], 1)
        seed[m > 0] = 0; ids[m > 0] = i + 1
    dist, lab = cv2.distanceTransformWithLabels(seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(seed == 0)
    of_label = np.zeros(lab.max() + 1, np.int32); of_label[lab[zy, zx]] = ids[zy, zx]
    return of_label[lab], dist * G.res

def sdf(mask, res):
    from scipy.ndimage import distance_transform_edt
    m = mask > 0
    return (np.where(m, distance_transform_edt(m) - 0.5, -(distance_transform_edt(~m) - 0.5)) * res).astype(np.float32)

def fingers_of(A, B, frames, pins=PIN):
    """Every finger of both sides: {key: Finger}, key = the A block's number
    (1-24 the 1B side, 25 the centre, 26-49 the 3B side, 50 - n mirrored)."""
    out = {}
    for n in sorted(A):
        f, sA = frames[n]
        anch = pins.get(n)
        for side in ((1,) if n == 25 else (1, -1)):
            k = n if side > 0 else 50 - n
            ff = np.array(f, float) * (MIRROR if side < 0 else 1.0)
            pa = A[n] if side > 0 else mirrored(A[n])
            pb = B.get(n); pb = (pb if side > 0 else mirrored(pb)) if pb is not None else None
            out[k] = Finger(k, n, ff, sA, pa, pb, anch)
    return out

def build(G, A, B, Fpolys, frames, hull, blocked, near_far=6.0, gap_near=1.6, close=1.0):
    """The 1st floor's A and B stands, finger by finger. The stands may take the
    cells inside `hull` (the 1st floor's hull) and the blocks' outlines closed
    by `close` metres (the gaps between blocks, the blocks the hull was drawn
    without), off `blocked` (the field, the excite seats). Cells within
    `gap_near` of a block's outline belong to the nearest block of any kind,
    further ones to the nearest A or B block; cells further than `near_far`
    from every block are left out. Returns a dict: zoneF, zoneAB (masks), band
    (a row id per cell of A and B), hs, meta (finger, kind, row, c0, c1,
    height), fingers, finger_of."""
    shape = hull.shape
    F = fingers_of(A, B, frames)
    polys, owner_of = [], []
    for k, fg in F.items():
        polys.append(fg.pa); owner_of.append(('A', k))
        if fg.pb is not None: polys.append(fg.pb); owner_of.append(('B', k))
    nAB = len(polys)
    for i, p in enumerate(Fpolys): polys.append(p); owner_of.append(('F', i))
    lab_all, d_all = label_nearest(G, polys, shape)
    lab_ab, d_ab = label_nearest(G, polys[:nAB], shape)
    pm = (d_all <= 0).astype(np.uint8)
    dom = ((hull > 0) | (cv2.morphologyEx(pm, cv2.MORPH_CLOSE, disk(close / G.res)) > 0)) & ~blocked
    lab = np.where(d_all <= gap_near, lab_all, lab_ab)
    dom = dom & (d_all <= near_far)
    kind_of = np.array([0] + [1 if o[0] in 'AB' else 2 for o in owner_of], np.int8)     # 1 A/B block, 2 F block
    finger_of = np.zeros(shape, np.int16)
    for i, (t, k) in enumerate(owner_of):
        if t in 'AB': finger_of[lab == i + 1] = k
    zoneF = dom & (kind_of[lab] == 2)
    zoneAB = dom & (finger_of > 0)
    finger_of = np.where(zoneAB, finger_of, 0).astype(np.int16)
    from scipy.ndimage import find_objects
    pad = 12
    for k, sl in enumerate(find_objects(finger_of), 1):
        if sl is not None and k in F:
            F[k].sl = (slice(max(0, sl[0].start - pad), min(G.H, sl[0].stop + pad)), slice(max(0, sl[1].start - pad), min(G.W, sl[1].stop + pad)))
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    band = np.full(shape, -1, np.int64)
    hs, meta = [], []
    for k, fg in F.items():
        m = zoneAB & (finger_of == k)
        if not m.any(): continue
        c = X[m] * fg.f[0] + Z[m] * fg.f[1]
        rc = [fg.row_of(ci) for ci in c]
        ids = {}
        for key in sorted(set(rc), key=lambda t: -fg.row_centre(*t)):
            c0, c1 = fg.row_span(*key)
            ids[key] = len(hs)
            hs.append(float(fg.height(fg.row_centre(*key))))
            meta.append((k, key[0], key[1], c0, c1, hs[-1]))
        idx = np.fromiter((ids[key] for key in rc), np.int64, len(rc))
        band[m] = idx
    return dict(zoneF=zoneF, zoneAB=zoneAB, band=band, hs=np.array(hs), meta=meta, fingers=F, finger_of=finger_of)

def aisle_axes(res, ENT, dfield, G, reach=3.0):
    """The way each entrance's aisle runs out from the field, a unit vector per
    circle (x, z) of `ENT`: the mean of the axes of the (up to two) A and B
    blocks within `reach` metres of the circle, which stand either side of the
    aisle it is at the head of; where there are fewer, the way the distance
    from the field (`dfield`, metres) climbs, which is how the outfield's
    aisles between its curved F blocks run."""
    from shapely.geometry import Point
    F = res['fingers']
    gz, gx = np.gradient(cv2.GaussianBlur(dfield.astype(np.float32), (0, 0), 8))
    out = []
    for q in ENT:
        p = Point(*q); near = {}
        for k, fg in F.items():
            d = min(fg.pa.distance(p), fg.pb.distance(p) if fg.pb is not None else 1e9)
            if d <= reach: near[k] = d
        keys = sorted(near, key=near.get)[:2]
        v = -sum((F[k].f for k in keys), np.zeros(2))         # a finger's f points to the field
        i, j = [int(round(float(c))) for c in G.g(q[0], q[1])]
        gd = np.array([gx[j, i], gz[j, i]]); gd /= np.linalg.norm(gd) + 1e-9
        v = v + gd * (2 - len(keys))
        out.append(v / np.linalg.norm(v))
    return np.array(out)

def lay_curved(G, mask, dist, D, nrows, O, first=0.55, pitch=0.5):
    """Seats along curved rows that are level sets of `dist` (metres: the
    outfield's rows, each at its distance from the fence): row r on the line
    dist = (r + first) * D, a seat every `pitch` metres, inside `mask`, facing
    down the gradient of `dist`. Returns (positions, row, yaw)."""
    from scipy.spatial import cKDTree
    gz, gx = np.gradient(cv2.GaussianBlur(dist.astype(np.float32), (9, 9), 0))
    S, R, Y = [], [], []
    for r in range(nrows):
        dc = (r + first) * D
        ys, xs = np.nonzero((np.abs(dist - dc) < 0.5 * G.res) & mask)
        if not len(xs): continue
        X, Z = G.m(xs, ys); P = np.c_[X, Z]
        tree = cKDTree(P); taken = np.zeros(len(P), bool)
        for i in np.argsort(np.arctan2(X - O[0], Z - O[1])):
            if taken[i]: continue
            S.append(P[i]); R.append(r); Y.append(np.arctan2(-gx[ys[i], xs[i]], -gz[ys[i], xs[i]]))
            for j in tree.query_ball_point(P[i], pitch * 0.95): taken[j] = True
    return np.array(S).reshape(-1, 2), np.array(R, int), np.array(Y)

def split_levels(res):
    """The rows of the A level (kinds A and the walkway W) and of the B level
    (B and the landing K): per level the row ids (into `meta`), the band raster
    in the level's own ids, its heights."""
    meta = res['meta']; band = res['band']
    out = {}
    for lv, kinds in (('A', 'AW'), ('B', 'BK')):
        sel = [i for i, m in enumerate(meta) if m[1] in kinds]
        remap = np.full(len(meta) + 1, -1, np.int64)
        for j, i in enumerate(sel): remap[i] = j
        b = np.where(band >= 0, remap[np.clip(band, 0, None)], -1)
        out[lv] = dict(ids=sel, band=b, hs=np.array([meta[i][5] for i in sel]), remap=remap)
    return out

def rows_out(G, res, lv, extend=0.3, eps=0.03):
    """A level's rows as the renderer wants them: for each row, the strip of
    its block between two exact lines (square to the block's axis), cut to the
    block's cells, reaching `extend` under the next row up so the treads meet
    with no crack. `lv` the level's split (split_levels)."""
    meta = res['meta']; F = res['fingers']; band_g = res['band']; finger_of = res['finger_of']
    by = {}
    for j, i in enumerate(lv['ids']): by.setdefault(meta[i][0], []).append((j, i))
    out = {}
    for k, rows in by.items():
        fg = F[k]; sl = fg.sl
        band_c = band_g[sl]
        sd = sdf((finger_of[sl] == k) & (band_c >= 0), G.res)
        gy, gx = np.mgrid[sl[0], sl[1]]; X, Z = G.m(gx, gy)
        c = X * fg.f[0] + Z * fg.f[1]
        for j, i in rows:
            _, kind, r, c0, c1, h = meta[i]
            m = band_c == i
            if not m.any(): continue
            lo = c - (c0 - extend) if c0 > -1e2 else np.full(c.shape, 1e3, np.float32)
            hi = (c1 - c) if c1 < 1e2 else np.full(c.shape, 1e3, np.float32)
            f = np.minimum(np.minimum(lo, hi), sd).astype(np.float32)
            ys, xs = np.nonzero(m); pad = 8
            by0, by1 = max(0, ys.min() - pad), min(m.shape[0], ys.max() + pad + 1)
            bx0, bx1 = max(0, xs.min() - pad), min(m.shape[1], xs.max() + pad + 1)
            fs = f[by0:by1, bx0:bx1]
            gx0, gy0 = sl[1].start + bx0, sl[0].start + by0
            polys = []
            for o, hh in rings_field(fs, eps / G.res, 0.2 / G.res ** 2):
                ring = lambda q: [[round(float(a), 2), round(float(b), 2)] for a, b in np.c_[G.m(q[:, 0] + gx0, q[:, 1] + gy0)]]
                polys.append([ring(o)] + [ring(hq) for hq in hh])
            out[j] = {'r': j, 'y': round(float(h), 3), 'y0': 0.0, 'polys': polys}
    return [out[j] for j in sorted(out)]

def lay_seats(G, res, pitch=0.5, inset=0.18):
    """Seats along every row of every A and B block, `pitch` apart, in the
    block's outline pulled in by `inset`, facing the field; none on the
    walkway or behind the last row. Returns (positions, row id into `meta`,
    yaw)."""
    meta = res['meta']; F = res['fingers']; band_g = res['band']
    S, R, Y = [], [], []
    rows_of = {}
    for i, m in enumerate(meta):
        if m[1] in 'AB': rows_of.setdefault(m[0], []).append(i)
    for k, fg in F.items():
        sl = fg.sl; band_c = band_g[sl]
        ok = np.zeros(band_c.shape, np.uint8)
        for P in [fg.pa] + ([fg.pb] if fg.pb is not None else []):
            m = np.zeros(band_c.shape, np.uint8); gx, gz = G.g(*np.array(P.exterior.coords).T)
            cv2.fillPoly(m, [np.c_[gx - sl[1].start, gz - sl[0].start].round().astype(np.int32)], 1)
            ok |= cv2.erode(m, disk(inset / G.res))
        ok = ok > 0
        u = np.array([-fg.f[1], fg.f[0]])
        for i in rows_of.get(k, []):
            _, kind, r, c0, c1, h = meta[i]
            m = ok & (band_c == i)
            if not m.any(): continue
            ys, xs = np.nonzero(m); X, Zz = G.m(xs + sl[1].start, ys + sl[0].start); P = np.c_[X, Zz]
            us = np.arange((P @ u).min() - 0.1, (P @ u).max() + 0.1, 0.05)
            cc = fg.row_centre(kind, r)
            C = u[None, :] * us[:, None] + fg.f[None, :] * cc
            gxx, gzz = G.g(C[:, 0], C[:, 1])
            ii = np.clip(np.round(gxx).astype(int) - sl[1].start, 0, m.shape[1] - 1); jj = np.clip(np.round(gzz).astype(int) - sl[0].start, 0, m.shape[0] - 1)
            idx = np.nonzero(m[jj, ii])[0]
            if not len(idx): continue
            for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
                L = us[run[-1]] - us[run[0]] + 0.05; kk = int(L // pitch)
                if kk < 1: continue
                t0 = us[run[0]] - 0.025 + (L - kk * pitch) / 2 + pitch / 2
                for q in range(kk):
                    S.append(u * (t0 + q * pitch) + fg.f * cc); R.append(i); Y.append(np.arctan2(fg.f[0], fg.f[1]))
    return np.array(S).reshape(-1, 2), np.array(R, int), np.array(Y)
