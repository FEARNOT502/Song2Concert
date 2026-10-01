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
# the outfield's steep 13 m one, the fingers' heights are fitted so that the step
# across each aisle is small and the rake changes smoothly from one block to the
# next (see fit_profiles).
import numpy as np, cv2
from shapely.geometry import Polygon
from shapely.ops import unary_union
from standlib import disk, rings_field

DA, DB = 0.74, 0.748          # the rows' pitch in A (1-26) and in B (27-)
C1F = 10.6                    # the 1st-floor concourse
HIN_A = lambda r: 1.0 + 0.17 * (r - 1)
HIN_B = lambda r: 5.5 + 0.255 * (r - 27)
HW = 0.5 * (HIN_A(26) + HIN_B(27))        # the walkway between A and B
KNOT = 1.5                    # a finger's height profile has a knot every KNOT metres
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
    # B24's two outlines overlap and leave out the wide part of its L (behind home,
    # the narrow front beside B25 and the wide back beside B23): the map's own box
    # is the whole block (the box is the ink's inside, the outlines run down its
    # middle: a hair, 0.16 m, back out)
    if 'B24' in names:
        m = (BOXL == names.index('B24')).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
        B[24] = Polygon(np.c_[c[:, 0] * G.res + G.x0, c[:, 1] * G.res + G.z0]).buffer(0).buffer(0.16, join_style=2).simplify(0.15)
    return A, B, F

def mirrored(P):
    return Polygon(np.array(P.exterior.coords) * MIRROR)

class Finger:
    """One finger: its A block (rows 1-26 counted back from the walkway at
    p.f = sA, front the most forward point of the block) and its B block behind
    the walkway (rows 27 on, from the walkway's far edge sBf). Rows are the
    lines p.f = const, spaced DA in A and DB in B. Heights are linear between
    knots every KNOT metres along the finger from its front (u = 0) to its back,
    level behind the back: the building's section at first (the front's row, the
    walkway at HW, the back at the concourse's height), then whatever
    fit_profiles gives."""
    def __init__(s, key, n, f, sA, pa, pb):
        s.key = key; s.n = n; s.f = np.array(f, float); s.sA = float(sA); s.pa = pa; s.pb = pb
        PA = np.array(pa.exterior.coords)
        s.cfront = float((PA @ s.f).max())
        s.sBf = s.sA if (pb is None or n == 1) else float((np.array(pb.exterior.coords) @ s.f).max())
        allp = np.vstack([PA] + ([np.array(pb.exterior.coords)] if pb is not None else []))
        s.cback = float((allp @ s.f).min())
        s.u = np.array([-s.f[1], s.f[0]]); s.ref = None; s.w = None      # (the rows' bend: see warp_rows)
        s._lines()
    def coord(s, p):
        """The row coordinate at the points p (an (n, 2) array or one point): p.f, less the bend of the rows
        (every row is a line of this coordinate: straight, or the parabola warp_rows makes it)."""
        p = np.asarray(p, float); c = p @ s.f
        if s.w is None: return c
        lat = (p - s.ref) @ s.u
        return c - (s.w[0] + s.w[1] * lat + s.w[2] * lat * lat)
    def coord_xz(s, X, Z):
        c = X * s.f[0] + Z * s.f[1]
        if s.w is None: return c
        lat = (X - s.ref[0]) * s.u[0] + (Z - s.ref[1]) * s.u[1]
        return c - (s.w[0] + s.w[1] * lat + s.w[2] * lat * lat)
    def row_point(s, t, cc):
        """The point(s) of the row whose coordinate is `cc` at the lateral position `t` (p.u)."""
        t = np.asarray(t, float)
        c = cc if s.w is None else cc + s.w[0] + s.w[1] * (t - float(s.ref @ s.u)) + s.w[2] * (t - float(s.ref @ s.u)) ** 2
        return s.u[None, :] * np.atleast_1d(t)[:, None] + s.f[None, :] * np.atleast_1d(c)[:, None]
    def facing(s, lat):
        """The direction the rows face at lateral position `lat` (square to the row): the gradient of coord."""
        if s.w is None: return s.f
        g = s.f - (s.w[1] + 2 * s.w[2] * lat) * s.u
        return g / np.linalg.norm(g)
    def _lines(s):
        """What follows from the walkway's lines: its depth along the finger, the front row, the section."""
        s.uw = s.cfront - 0.5 * (s.sA + s.sBf); s.ub = s.cfront - s.cback
        s.rf = int(np.clip(26 - np.floor((s.cfront - s.sA) / DA), 1, 26))   # the front row
        ub = s.uw + max(s.ub - s.uw, 0.4)
        hf = HIN_A(s.rf) - 0.085
        s.ku = np.linspace(0.0, ub, max(8, int(np.ceil(ub / KNOT)) + 1))
        # the section: one curve through the front's row, the walkway and the back, the rake growing evenly along it
        # (a quadratic: no change of slope at the walkway); where that would leave the stand flat or too steep
        # (the wedges at the poles, shallow), straight between the three
        b2 = ((C1F - hf) - (HW - hf) * ub / s.uw) / (ub * (ub - s.uw)) if s.uw > 0.5 and ub > 1.05 * s.uw else None
        if b2 is not None:
            a1 = (HW - hf) / s.uw - b2 * s.uw
            if a1 >= 0.05 and a1 + 2 * b2 * ub <= 0.75 and b2 >= 0: s.kh = hf + a1 * s.ku + b2 * s.ku ** 2; return
        k5 = np.array([0.0, 0.5 * s.uw, s.uw, 0.5 * (s.uw + ub), ub])
        h5 = np.array([hf, 0.5 * (hf + HW), HW, 0.5 * (HW + C1F), C1F])
        s.kh = np.interp(s.ku, k5, h5)
    def walkway_height(s):
        return float(np.interp(s.uw, s.ku, s.kh))
    def set_walkway(s, sA, sBf):
        s.sA = float(sA); s.sBf = float(sBf); s._lines()
    def height(s, c):
        u = np.clip(s.cfront - np.asarray(c, float), 0, s.ub)
        return np.interp(u, s.ku, s.kh)
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

def row_coord(fg, p):
    """The row number's continuous counterpart at the points `p` (an (n, 2) array):
    rows counted from the walkway, positive towards the field."""
    c = p @ fg.f
    return np.where(c >= fg.sA, (c - fg.sA) / DA, np.where(c >= fg.sBf, 0.0, -(fg.sBf - c) / DB))

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

def fingers_of(A, B, frames):
    """Every finger of both sides: {key: Finger}, key = the A block's number
    (1-24 the 1B side, 25 the centre, 26-49 the 3B side, 50 - n mirrored)."""
    out = {}
    for n in sorted(A):
        f, sA = frames[n]
        if n == 25: f = (0.0, -1.0)           # (the centre block's axis is the building's own, along the line from home to centre field: the map's rows there stand 1.7 degrees off it)
        for side in ((1,) if n == 25 else (1, -1)):
            k = n if side > 0 else 50 - n
            ff = np.array(f, float) * (MIRROR if side < 0 else 1.0)
            pa = A[n] if side > 0 else mirrored(A[n])
            pb = B.get(n); pb = (pb if side > 0 else mirrored(pb)) if pb is not None else None
            out[k] = Finger(k, n, ff, sA, pa, pb)
    return out

def warp_rows(G, F, finger_of, zoneF, blocked, w_pos=4.0, w_dir=60.0, w_dirF=30.0, reg=(15.0, 1.0, 20.0)):
    """Bend every finger's rows (a parabola: a shift a, a tilt b, a curvature g in the
    finger's lateral coordinate, coord = p.f - (a + b s + g s^2)) so that they run on
    across every seam between two fingers, and across the one into the outfield stand
    (rows level with the fence), with the same direction and, as far as that allows
    without moving the walkway more than a few decimetres off the map's, the same
    place. The map draws each block's rows straight, in a fan: a kink of 4-7 degrees at
    every aisle round the poles. Sets each finger's `ref` and `w`."""
    from scipy.sparse import coo_matrix
    keys = sorted(F); idx = {k: i for i, k in enumerate(keys)}; N = 3 * len(keys)
    gy, gx = np.mgrid[0:G.H:4, 0:G.W:4]; X, Z = G.m(gx, gy); fo = finger_of[::4, ::4]
    for k in keys:
        m = fo == k
        F[k].ref = np.array([X[m].mean(), Z[m].mean()]); F[k].w = None
    W = {k: 0.5 * (F[k].sA + F[k].sBf) for k in keys}
    lat = lambda k, p: (np.asarray(p, float) - F[k].ref) @ F[k].u
    # the outfield stand's rows: level sets of the distance from the field's edge; which way they face
    dfe = cv2.GaussianBlur((cv2.distanceTransform((~blocked).astype(np.uint8), cv2.DIST_L2, 5) * G.res).astype(np.float32), (0, 0), 10)
    gz_, gx_ = np.gradient(dfe)
    ka, kb, pa, pb, _, _ = seam_pairs(G, dict(finger_of=finger_of, zoneF=zoneF), np.zeros(finger_of.shape, np.float32), step=3)
    rows, cols, vals, rhs = [], [], [], []; nr = [0]
    def eq(entries, b, w):
        for c, v in entries: rows.append(nr[0]); cols.append(c); vals.append(v * w)
        rhs.append(b * w); nr[0] += 1
    for a_, b_ in sorted(set(zip(ka.tolist(), kb.tolist()))):
        m = (ka == a_) & (kb == b_); P = 0.5 * (pa[m] + pb[m])
        if len(P) > 40: P = P[np.linspace(0, len(P) - 1, 40).astype(int)]
        if a_ > 0 and b_ > 0:
            fa_, fb_ = F[a_].f, F[b_].f; ua, ub = F[a_].u, F[b_].u; um = ua + ub; um = um / np.linalg.norm(um)
            for p in P:
                sa, sb = lat(a_, p), lat(b_, p)
                r0 = (p @ fa_ - W[a_]) - (p @ fb_ - W[b_])                 # the walkway-relative row coordinate's step across the seam
                eq([(3 * idx[a_] + j, -v) for j, v in enumerate((1.0, sa, sa * sa))] + [(3 * idx[b_] + j, v) for j, v in enumerate((1.0, sb, sb * sb))], -r0, w_pos)
                eq([(3 * idx[a_] + 1, -(ua @ um)), (3 * idx[a_] + 2, -2 * sa * (ua @ um)), (3 * idx[b_] + 1, ub @ um), (3 * idx[b_] + 2, 2 * sb * (ub @ um))], -float((fa_ - fb_) @ um), w_dir)
        elif (a_ < 0) != (b_ < 0):
            k = b_ if a_ < 0 else a_
            for p in P:
                i, j = [int(round(float(c))) for c in G.g(p[0], p[1])]
                g = -np.array([gx_[j, i], gz_[j, i]]); g = g / (np.linalg.norm(g) + 1e-9); um = np.array([-g[1], g[0]])
                s = lat(k, p)
                eq([(3 * idx[k] + 1, -(F[k].u @ um)), (3 * idx[k] + 2, -2 * s * (F[k].u @ um))], -float((F[k].f - g) @ um), w_dirF)
    for k in keys:
        for j in range(3): eq([(3 * idx[k] + j, 1.0)], 0.0, reg[j])
    M = coo_matrix((vals, (rows, cols)), shape=(nr[0], N)).tocsr()
    x = np.linalg.lstsq(M.toarray(), np.array(rhs), rcond=None)[0].reshape(-1, 3)
    for k in keys: F[k].w = x[idx[k]]
    return x

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
    kind_of = np.array([0] + [1 if o[0] in 'AB' else 2 for o in owner_of], np.int8)     # 1 A/B block, 2 F block
    # (further than the gap from any block, a cell nearer an F block than any A or
    # B block is the notch at the back of an F block, where the pillar stands, or
    # the strip behind it: floor, not tread; it was the nearest A block's, 40 m
    # off, 4.0 m up, islands of tread in the outfield's back wall)
    dom = dom & (d_all <= near_far) & ~((d_all > gap_near) & (kind_of[lab_all] == 2))
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
    # The wedge at each pole (A01, A49) counts its rows from a walkway line of its own,
    # five rows off its neighbour's (the map has it run on past the walkway to row 40):
    # move that line so that its rows run on across the seam between them, as the rows
    # of every other pair of blocks do
    for a_, b_ in ((1, 2), (49, 48)):
        ma = (finger_of == a_) & (cv2.dilate((finger_of == b_).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)
        mb = (finger_of == b_) & (cv2.dilate((finger_of == a_).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)
        if not (ma.any() and mb.any()): continue
        d = float(row_coord(F[a_], np.c_[X[ma], Z[ma]]).mean() - row_coord(F[b_], np.c_[X[mb], Z[mb]]).mean())
        fa = F[a_]; fa.set_walkway(fa.sA + d * DA, fa.sA + d * DA)
    warp_rows(G, F, finger_of, zoneF, blocked)
    band = np.full(shape, -1, np.int64)
    hs, meta = [], []
    for k, fg in F.items():
        m = zoneAB & (finger_of == k)
        if not m.any(): continue
        c = fg.coord_xz(X[m], Z[m])
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

def apply_profiles(res, profs):
    """Give every finger the five-knot profile of its A block's number in `profs`
    ({n: five heights}; the 3B side takes its mirror's) and the rows their new
    heights (res['hs'], res['meta'])."""
    F = res['fingers']
    for k, fg in F.items():
        if fg.n in profs: fg.kh = np.array(profs[fg.n], float)
    hs, meta = res['hs'], res['meta']
    for i, (k, kind, r, c0, c1, h) in enumerate(meta):
        fg = F[k]; hh = float(fg.height(fg.row_centre(kind, r))); hs[i] = hh; meta[i] = (k, kind, r, c0, c1, hh)
    return res

def seam_pairs(G, res, Fh, step=2):
    """The cells either side of every seam between two fingers (and between a
    finger and the outfield's F stand): per pair the two sides' finger keys (-1
    the outfield, whose height `Fh` gives), cell positions in metres."""
    fo = res['finger_of']; zf = res['zoneF']
    ids = np.where(zf, -1, fo).astype(np.int32)
    out = []
    for dy, dx in ((0, 1), (1, 0)):
        a = ids[:ids.shape[0] - dy, :ids.shape[1] - dx]; b = ids[dy:, dx:]
        m = (a != b) & (a != 0) & (b != 0)
        ys, xs = np.nonzero(m); sel = np.arange(0, len(ys), step); ys, xs = ys[sel], xs[sel]
        ax, az = G.m(xs, ys); bx, bz = G.m(xs + dx, ys + dy)
        out.append((a[ys, xs], b[ys, xs], np.c_[ax, az], np.c_[bx, bz], Fh[ys, xs], Fh[ys + dy, xs + dx]))
    return [np.concatenate([o[i] for o in out]) for i in range(6)]

def seam_steps(res, pairs):
    """The step across each seam, by finger pair: {(a, b): (cells, mean, p90, max)}."""
    F = res['fingers']; ka, kb, pa, pb, fa, fb = pairs
    def h(k, p, fh):
        out = np.array(fh, float)
        for key in np.unique(k):
            if key < 0: continue
            m = k == key; fg = F[int(key)]; out[m] = fg.height(fg.coord(p[m]))
        return out
    d = np.abs(h(ka, pa, fa) - h(kb, pb, fb)); r = {}
    for key in set(zip(np.minimum(ka, kb).tolist(), np.maximum(ka, kb).tolist())):
        m = (np.minimum(ka, kb) == key[0]) & (np.maximum(ka, kb) == key[1])
        r[key] = (int(m.sum()), float(d[m].mean()), float(np.percentile(d[m], 90)), float(d[m].max()))
    return r

POLE_BACK = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.3, 5: 1.0, 6: 2.0}      # (the pull of a back to the concourse's height: a pole finger's back is set by its neighbours)

def fit_profiles(G, res, Fh, nom_ramp=(4, 14, 0.1, 1.0), w_back=POLE_BACK, w_back_other=3.0, w_smooth=100.0, w_F=10.0,
                 rake=(0.08, 0.65, 0.0), seam_w=None, front_w=(5, 10.0), step=2, verbose=True):
    """The height profiles of the fingers 1..25 (the 3B side is their mirror image):
    a height at every knot, that make the stand continuous across the aisles between
    blocks and into the outfield stand (the heights `Fh` given): the least squares of
    the step across every seam (the cells either side of it, `step` apart; those
    against the outfield stand `w_F` times as heavy, those between fingers `seam_w[(n, m)]`
    times, 1 if not given), with a pull to the building's section that is weak at the
    poles and firm from finger n1 on (`nom_ramp` = n0, n1, w0, w1: the weight w0 up to
    finger n0, w1 from n1, linear between), a pull to the concourse's height at each
    finger's back (`w_back`, `w_back_other`; the back kept from rising over it), and a
    rake that changes smoothly along the finger (`w_smooth`: its change from one segment
    to the next), the front row's height held to the section's from finger front_w[0] on
    (weight front_w[1]). Every segment climbs by a rake of `rake` m/m: (A least, most, B least)."""
    from scipy.optimize import lsq_linear
    from scipy.sparse import coo_matrix
    F = res['fingers']; NP = 25
    NK = [len(F[n].ku) for n in range(1, NP + 1)]
    off = np.r_[0, np.cumsum(NK)]; ncol = int(off[-1])
    col = lambda n, m: int(off[n - 1]) + m                                   # unknown m of finger n: its front's height, then its rises
    nom = {n: F[n].kh.copy() for n in range(1, NP + 1)}                      # (the building's section: nothing is fitted yet)
    rows, cols, vals, rhs = [], [], [], []
    nrow = [0]
    def add(entries, b, wgt=1.0):
        for c, v in entries: rows.append(nrow[0]); cols.append(c); vals.append(v * wgt)
        rhs.append(b * wgt); nrow[0] += 1
    # the seams
    ka, kb, pa, pb, fa, fb = seam_pairs(G, res, Fh, step=step)
    def side(k, p):
        """per cell: the finger's parameters n, the knot interval, the fraction along it"""
        n = np.where(k > NP, 50 - k, k); out = np.zeros(len(k), int); idx = np.zeros(len(k), int); t = np.zeros(len(k))
        for key in np.unique(k):
            if key < 0: continue
            m = k == key; fg = F[int(key)]
            u = np.clip(fg.cfront - fg.coord(p[m]), 0, fg.ku[-1])
            i = np.clip(np.searchsorted(fg.ku, u, side='right') - 1, 0, len(fg.ku) - 2)
            out[m] = n[m]; idx[m] = i; t[m] = (u - fg.ku[i]) / (fg.ku[i + 1] - fg.ku[i])
        return out, idx, t
    na, ia, ta = side(ka, pa); nb, ib, tb = side(kb, pb)
    def zcoef(n, idx, t):
        # the coefficients of the front's height and the rises in the height at knot interval idx, fraction t:
        # h = (1-t) h_idx + t h_idx+1, h_k = z0 + z1 + .. + z_k
        e = [(col(n, 0), 1.0)]
        for m in range(1, NK[n - 1]):
            c = 1.0 if m <= idx else (t if m == idx + 1 else 0.0)
            if c: e.append((col(n, m), c))
        return e
    for q in range(len(ka)):
        ent = []; b = 0.0
        if ka[q] >= 0: ent += zcoef(na[q], ia[q], ta[q])
        else: b -= fa[q]
        if kb[q] >= 0: ent += [(c, -v) for c, v in zcoef(nb[q], ib[q], tb[q])]
        else: b += fb[q]
        wq = w_F if (ka[q] < 0 or kb[q] < 0) else (seam_w or {}).get((min(na[q], nb[q]), max(na[q], nb[q])), 1.0)
        add(ent, b, wq)
    nseam = nrow[0]
    # the pull to the building's section (firm away from the poles), the smooth rake
    for n in range(1, NP + 1):
        K = NK[n - 1]
        wn = np.interp(n, [nom_ramp[0], nom_ramp[1]], [nom_ramp[2], nom_ramp[3]])
        wk = wn * np.sqrt(4.0 / K)
        for m in range(K - 1):
            add([(col(n, j), 1.0) for j in range(m + 1)], nom[n][m], wk)
        if n >= front_w[0] and front_w[1] > 0: add([(col(n, 0), 1.0)], nom[n][0], front_w[1])
        seg = np.diff(F[n].ku)
        for m in range(1, K - 1):
            add([(col(n, m), 1.0 / seg[m - 1]), (col(n, m + 1), -1.0 / seg[m])], 0.0, w_smooth)
    lo = np.zeros(ncol); hi = np.zeros(ncol)
    for n in range(1, NP + 1):
        K = NK[n - 1]; ku = F[n].ku; seg = np.diff(ku)
        lo[col(n, 0)], hi[col(n, 0)] = 0.5, 9.5
        for m in range(1, K):
            r0 = rake[0] if ku[m] <= F[n].uw + 1e-6 else rake[2]
            lo[col(n, m)], hi[col(n, m)] = r0 * seg[m - 1], rake[1] * seg[m - 1]
    # the backs at the concourse's height, none over it (a finger that comes out over it is held to it and the fit run again)
    held = set()
    for it in range(4):
        r_, c_, v_, b_ = list(rows), list(cols), list(vals), list(rhs); n_ = nrow[0]
        for n in range(1, NP + 1):
            wb = 30.0 if n in held else w_back.get(n, w_back_other)
            if wb <= 0: continue
            for c, v in [(col(n, j), 1.0) for j in range(NK[n - 1])]: r_.append(n_); c_.append(c); v_.append(v * wb)
            b_.append(C1F * wb); n_ += 1
        M = coo_matrix((v_, (r_, c_)), shape=(n_, ncol)).tocsr()
        sol = lsq_linear(M, np.array(b_), bounds=(lo, hi), max_iter=3000)
        z = sol.x
        over = {n for n in range(1, NP + 1) if float(z[int(off[n - 1]):int(off[n])].sum()) > C1F + 0.02} - held
        if not over: break
        held |= over
    profs = {n: np.cumsum(z[int(off[n - 1]):int(off[n])]) for n in range(1, NP + 1)}
    if verbose:
        print('fit: %d seam equations, %d unknowns, cost %.1f, backs held at the concourse: %s' % (nseam, ncol, sol.cost, sorted(held)))
    return profs

def seam_pair_means(G, res, Fh, step=2):
    """The mean step across the aisle between finger n and n+1, {(n, n+1): metres}, both sides of the field together
    (and (-1, n) against the outfield stand), for the profiles the fingers hold now."""
    st = seam_steps(res, seam_pairs(G, res, Fh, step=step))
    fold = lambda k: k if k < 0 or k <= 25 else 50 - k
    acc = {}
    for (a, b), v in st.items():
        key = (min(fold(a), fold(b)), max(fold(a), fold(b))); c, t = acc.get(key, (0, 0.0)); acc[key] = (c + v[0], t + v[0] * v[1])
    return {k: t / c for k, (c, t) in acc.items()}

def fit_profiles_balanced(G, res, Fh, zone=12, iters=10, gamma=0.6, lo=0.2, hi=25.0, step=3, verbose=True, **kw):
    """fit_profiles with the weight of the seam between each two of the first `zone` fingers adjusted, again and
    again (`iters` fits at `step`, the weight of a seam raised in proportion to its mean step to the power
    `gamma`, damped, the weights' geometric mean kept at 1), until every one of those seams has the same mean step:
    the change from the outfield's steep rows to the infield's section is shared out evenly across the fingers
    between, not left to the poles' few short seams (steps of 0.2-0.46 m there) with none beyond. The last fit
    is at fit_profiles's own step."""
    F = res['fingers']; sw = {}
    for it in range(iters):
        for fg in F.values(): fg._lines()
        profs = fit_profiles(G, res, Fh, seam_w=sw, step=step, verbose=False, **kw)
        apply_profiles(res, profs)
        pm = seam_pair_means(G, res, Fh)
        zp = [k for k in pm if k[0] >= 1 and k[1] == k[0] + 1 and k[1] <= zone + 1]
        m = np.array([pm[k] for k in zp]); tgt = float(m.mean())
        if verbose: print('  balance %d: the seams of the first %d fingers: mean step %.3f m, the largest %.3f (%d|%d), the least %.3f' % (it, zone, tgt, m.max(), *zp[int(np.argmax(m))], m.min()))
        new = {k: sw.get(k, 1.0) * (pm[k] / tgt) ** gamma for k in zp}
        gm = float(np.exp(np.mean(np.log(list(new.values())))))
        for k in zp: sw[k] = float(np.clip(0.5 * sw.get(k, 1.0) + 0.5 * new[k] / gm, lo, hi))
    for fg in F.values(): fg._lines()
    return fit_profiles(G, res, Fh, seam_w=sw, verbose=verbose, **kw)

# ── the gates ──
# The map widens the aisle between two B blocks, every third aisle (B11|12, 14|15,
# 17|18, 20|21, and B23|24 behind home, the 3B side's mirror: 10 in all), from
# 1.6 m to 3.4 m (4.5 behind home) for the first 8-9 rows behind the walkway. Those
# rows stand too low to walk under (as the 2nd floor's first rows at its
# vomitories), so the widening is the mouth of a gate: a pit open to the walkway,
# then a tunnel under the rows (its roof the rows' own slab, its floor stairs that
# climb under them as they climb), and at the stand's back, where the rows stand
# too low over the floor for a roof, an open stair cut through them to the door
# in the concourse's wall (the aisle's: the gate is the aisle's way out).
GATE_PAIRS = (11, 14, 17, 20, 23)       # the aisle between B n and B n+1 on the 1B side
GATE_SLAB, GATE_CLEAR, GATE_W, GATE_PAR = 0.25, 2.1, 1.8, 1.0
STAIR_RISE, STAIR_RUN = 0.19, 0.28

def _pieces(g):
    return [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if p.geom_type == 'Polygon' and not p.is_empty]

def _tbox(a, u, t0, t1, s0, s1):
    """The rectangle t0..t1 along a, s0..s1 across (u), as a polygon in metres."""
    return Polygon([a * t0 + u * s0, a * t1 + u * s0, a * t1 + u * s1, a * t0 + u * s1])

def _strip(f, c0, c1, centre, half=80.0):
    """The strip c0 <= p.f <= c1 (a row's own, square to the finger's axis `f`) as
    a long rectangle about `centre`."""
    nf = np.array([-f[1], f[0]]); c0 = max(c0, -1e3); c1 = min(c1, 1e3)
    base = centre - f * float(centre @ f)
    p = lambda c, s: base + f * c + nf * s
    return Polygon([p(c0, -half), p(c1, -half), p(c1, half), p(c0, half)])

def _side_rails(poly, a, floor_at, top_at, drop=0.35, par=GATE_PAR):
    """The rails along the sides of a pit or cut (the edges running along `a`): 1 m
    over the tread beside each, where that stands `drop` or more over the floor
    (`floor_at(point)`) of the pit; [x0, z0, x1, z1, y0, y1] each, a piece per row."""
    rails = []
    P = np.array(poly.exterior.coords); ccw = poly.exterior.is_ccw
    for p0, p1 in zip(P[:-1], P[1:]):
        e = p1 - p0; L = float(np.hypot(*e))
        if L < 0.3 or abs(float(e @ a)) < 0.5 * L: continue            # across the pit, not along it
        nout = np.array([e[1], -e[0]]) / L if ccw else np.array([-e[1], e[0]]) / L
        k = max(1, int(np.ceil(L / 0.75)))
        for j in range(k):
            q0 = p0 + e * j / k; q1 = p0 + e * (j + 1) / k; m = 0.5 * (q0 + q1)
            ha = top_at(m + nout * 0.3)
            if ha - floor_at(m) < drop: continue
            o = nout * 0.04
            rails.append([round(float(q0[0] + o[0]), 2), round(float(q0[1] + o[1]), 2), round(float(q1[0] + o[0]), 2), round(float(q1[1] + o[1]), 2), round(float(ha), 2), round(float(ha + par), 2)])
    return rails

def gate_sites(B, F, inside, avoid=(), r_open=1.2, pitch=DB):
    """The gates, from the chart's block outlines `B` (the 1B side's, B[n]) and the
    fingers `F`: per gate a dict with the pit, the tunnel, the cut with its stairs,
    the stairs' treads, the rails, the lamps and the numbers needed to draw them.
    `inside(p)`: whether the point p (metres) is on the stand (its rows, landing
    included), the way out at the stand's back being where it is not; `avoid` the
    columns [(x, z, radius)] the stairs keep clear of when they run on out into the
    concourse."""
    sites = []
    for n in GATE_PAIRS:
        for side in (1, -1):
            P1, P2 = (B[n], B[n + 1]) if side > 0 else (mirrored(B[n]), mirrored(B[n + 1]))
            kA, kB = (n, n + 1) if side > 0 else (50 - n, 49 - n)
            fA, fB = F[kA], F[kB]
            both = unary_union([P1, P2])
            g = both.convex_hull.difference(both.buffer(0.001))
            op = g.buffer(-r_open).buffer(r_open)
            pcs = _pieces(op)
            if not pcs: continue
            rec = max(pcs, key=lambda q: q.area)
            if rec.area < 8.0: continue
            a = -(fA.f + fB.f); a = a / np.linalg.norm(a); u = np.array([-a[1], a[0]])
            R = np.array(rec.exterior.coords)
            cen = np.array(rec.centroid.coords[0]); s_c = float(cen @ u)
            # the mouth: the walkway's back edge, where B's first row begins
            def t_at(fg, c):          # the axis coordinate t at which the centre line has the finger's coordinate c
                return (c - float(fg.f @ (u * s_c))) / float(fg.f @ a)
            t_front = 0.5 * (t_at(fA, fA.sBf) + t_at(fB, fB.sBf))
            t_rec_end = float((R @ a).max())
            h0 = 0.5 * (fA.walkway_height() + fB.walkway_height())
            def top_at(p):
                out = []
                for fg in (fA, fB):
                    kind, r = fg.row_of(float(fg.coord(p))); out.append(float(fg.height(fg.row_centre(kind, r))))
                return min(out)
            ss = (s_c - GATE_W / 2, s_c, s_c + GATE_W / 2)
            # where there is room for a roof over a flat floor at the walkway's height
            t_s = t_front
            for t in np.arange(t_front, t_front + 30, 0.05):
                if all(top_at(a * t + u * s) - GATE_SLAB - h0 >= GATE_CLEAR - 0.15 for s in ss): t_s = float(t); break
            t_end = max(t_rec_end, t_s)
            t_end = t_front + np.ceil((t_end - t_front) / pitch - 1e-6) * pitch          # on a row's edge
            # where the stand ends: the way out of it, in the wall behind it
            t_wall = t_end
            for t in np.arange(t_end, t_end + 40, 0.05):
                if not inside(a * t + u * s_c): break
                t_wall = float(t) + 0.05
            # the floor: a stair under the rows, a tread to a row, its top GATE_CLEAR under the roof slab
            treads = []; fl = h0; t = t_end
            while t < t_wall - 1e-6:
                t1 = min(t + pitch, t_wall)
                ymin = min(top_at(a * tt + u * s) for tt in np.linspace(t + 0.02, t1 - 0.02, 3) for s in ss)
                fl = max(fl, ymin - GATE_SLAB - GATE_CLEAR)
                treads.append((float(t), float(t1), float(fl))); t = t1
            # where the roof ends and the rows are cut away, over an open stair that
            # climbs on to the wall's door: the last row's edge with the room for it
            # (in a shallow stand, behind home, the stair runs on out through the wall
            # into the concourse, as far as no column stands in its way)
            e_max = 4.5
            for px, pz, pr in avoid:
                p = np.array([px, pz]); tp = float(p @ a); sp = float(p @ u)
                if abs(sp - s_c) < GATE_W / 2 + pr + 0.9 and tp > t_wall - 1.0: e_max = min(e_max, max(0.0, tp - pr - 0.9 - t_wall))
            kc = 1
            for k in range(len(treads) - 1, 0, -1):
                nst = int(np.ceil(max(0.0, C1F - treads[k - 1][2]) / STAIR_RISE - 1e-6))
                if t_wall - treads[k][0] + e_max >= nst * 0.26: kc = k; break
            t_cut = treads[kc][0]; h_exit = treads[kc - 1][2]
            treads = treads[:kc]
            n_tr = max(1, int(np.ceil(max(0.0, C1F - h_exit) / STAIR_RISE - 1e-6)))
            extra = float(min(e_max, max(0.0, n_tr * STAIR_RUN - (t_wall - t_cut)))); t_top = t_wall + extra
            run = (t_top - t_cut) / n_tr
            trench_treads = []
            for i in range(n_tr):
                t0 = t_cut + i * run; t1 = t_cut + (i + 1) * run + (0.25 if i == n_tr - 1 else 0.0)      # (the last on past the stair's end a hair)
                trench_treads.append((float(t0), float(t1), float(min(C1F, h_exit + STAIR_RISE * (i + 1)))))
            # the pit: the gap's cells in the first rows (slivers along the blocks' slanted fronts off)
            pit = _tbox(a, u, t_front - 0.1, t_end, s_c - 3.6, s_c + 3.6).intersection(g.buffer(0.02)).buffer(0)
            pit = pit.buffer(-0.45, join_style=2).buffer(0.45, join_style=2)
            # (the gap narrows to the aisle's own width where the widening ends, short of the tunnel's start
            # on the row's edge: the pit runs on as wide as the tunnel)
            pit = unary_union([pit, _tbox(a, u, t_front - 0.1, t_end, s_c - GATE_W / 2, s_c + GATE_W / 2)]).buffer(0)
            pit = max(_pieces(pit), key=lambda q: q.area) if _pieces(pit) else None
            if pit is None: continue
            tunnel = _tbox(a, u, t_end, t_cut, s_c - GATE_W / 2, s_c + GATE_W / 2)
            trench = _tbox(a, u, t_cut, t_top + 0.25, s_c - GATE_W / 2, s_c + GATE_W / 2)
            def stair_at(p):
                t = float(p @ a)
                for t0, t1, h in trench_treads:
                    if t0 <= t <= t1: return h
                return h_exit if t < t_cut else C1F
            rails = _side_rails(pit, a, lambda p: h0, top_at) + _side_rails(trench, a, stair_at, top_at)
            # the lamps along the tunnel's roof
            lamps = []
            yaw = float(np.arctan2(a[0], a[1]))
            for t in np.arange(t_end + 1.2, t_cut - 0.6, 3.0):
                p = a * t + u * s_c
                lamps.append((round(float(p[0]), 2), round(float(top_at(p) - GATE_SLAB - 0.06), 2), round(float(p[1]), 2), round(yaw, 3)))
            sites.append(dict(pair=(n, n + 1), side=side, kA=kA, kB=kB, a=a, u=u, s_c=s_c, t_front=float(t_front), t_end=float(t_end),
                              t_cut=float(t_cut), t_wall=float(t_wall), t_top=float(t_top), h0=float(h0), pit=pit, rec=rec, treads=treads, h_exit=float(h_exit),
                              n_trench=n_tr, trench_treads=trench_treads, rails=rails, lamps=lamps, tunnel=tunnel, trench=trench))
    return sites

def _ring(r): return [[round(float(x), 2), round(float(z), 2)] for x, z in r]
def _polys_of(g, min_area=0.02):
    """A shapely geometry as the renderer's polygon lists: [[outer, hole..], ..]."""
    out = []
    for q in _pieces(g):
        if q.area < min_area: continue
        out.append([_ring(q.exterior.coords)[:-1]] + [_ring(h.coords)[:-1] for h in q.interiors])
    return out
def _geom_of(polys):
    gs = [Polygon(p[0], p[1:]).buffer(0) for p in polys if len(p[0]) >= 3]
    return unary_union(gs) if gs else Polygon()

def carve_gates(rows, sites, spans):
    """The level's rows with the gates cut in: the pit's cells gone, over the tunnel
    each row's own strip kept as a roof slab (the row's top, GATE_SLAB thick, in
    place of the solid prism) with the stair under it (a tread a row, solid from the
    ground), the trench behind the stand cut out of its landing and its stairs
    built in it; the pit's floor likewise. `spans[row id]` = (axis, c0, c1) of a
    row's strip. Returns the new rows (the carved ones, then the floors)."""
    out = []
    zone = [unary_union([s['pit'], s['tunnel']] + ([s['trench']] if s['trench'] is not None else [])).buffer(0.05) for s in sites]
    for row in rows:
        g = _geom_of(row['polys'])
        hit = [i for i, z in enumerate(zone) if g.intersects(z)]
        if not hit: out.append(row); continue
        roofs = []
        for i in hit:
            s = sites[i]
            rg = g.intersection(s['tunnel'])
            if not rg.is_empty and row['r'] in spans:
                f, c0, c1 = spans[row['r']]
                rg = rg.intersection(_strip(f, c0, c1, np.array(s['tunnel'].centroid.coords[0])))
            roofs.append(rg)
            g = g.difference(s['pit']).difference(s['tunnel'])
            if s['trench'] is not None: g = g.difference(s['trench'])
        if not g.is_empty:
            ps = _polys_of(g)
            if ps: out.append({**row, 'polys': ps})
        for rg in roofs:
            ps = _polys_of(rg)
            if ps: out.append({'r': row['r'], 'y': row['y'], 'y0': round(row['y'] - GATE_SLAB, 3), 'polys': ps})
    for s in sites:
        # (the pit's floor a hair under the walkway's treads it runs on from, which
        # reach a little into it: no two surfaces in one plane)
        out.append({'r': -1, 'y': round(s['h0'] - 0.004, 3), 'y0': 0.0, 'polys': _polys_of(s['pit'])})
        for t0, t1, h in s['treads']:
            ps = _polys_of(s['tunnel'].intersection(_tbox(s['a'], s['u'], t0, t1, s['s_c'] - 3, s['s_c'] + 3)))
            if ps: out.append({'r': -1, 'y': round(h, 3), 'y0': 0.0, 'polys': ps})
        for t0, t1, h in s['trench_treads']:
            ps = _polys_of(_tbox(s['a'], s['u'], t0, t1, s['s_c'] - GATE_W / 2, s['s_c'] + GATE_W / 2))
            if ps: out.append({'r': -1, 'y': round(h, 3), 'y0': 0.0, 'polys': ps})
    return out

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

def rows_out(G, res, lv, extend=0.3, eps=0.03, sites=None):
    """A level's rows as the renderer wants them: for each row, the strip of
    its block between two exact lines (square to the block's axis), cut to the
    block's cells, reaching `extend` under the next row up so the treads meet
    with no crack. `lv` the level's split (split_levels)."""
    meta = res['meta']; F = res['fingers']; band_g = res['band']; finger_of = res['finger_of']
    by = {}
    for j, i in enumerate(lv['ids']): by.setdefault(meta[i][0], []).append((j, i))
    out = {}; spans = {}
    for k, rows in by.items():
        fg = F[k]; sl = fg.sl
        band_c = band_g[sl]
        sd = sdf((finger_of[sl] == k) & (band_c >= 0), G.res)
        gy, gx = np.mgrid[sl[0], sl[1]]; X, Z = G.m(gx, gy)
        c = fg.coord_xz(X, Z)
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
            spans[j] = (fg.f, c0, c1)
    rows = [out[j] for j in sorted(out)]
    return carve_gates(rows, sites, spans) if sites else rows

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
            C = fg.row_point(us, cc)
            gxx, gzz = G.g(C[:, 0], C[:, 1])
            ii = np.clip(np.round(gxx).astype(int) - sl[1].start, 0, m.shape[1] - 1); jj = np.clip(np.round(gzz).astype(int) - sl[0].start, 0, m.shape[0] - 1)
            idx = np.nonzero(m[jj, ii])[0]
            if not len(idx): continue
            for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
                L = us[run[-1]] - us[run[0]] + 0.05; kk = int(L // pitch)
                if kk < 1: continue
                t0 = us[run[0]] - 0.025 + (L - kk * pitch) / 2 + pitch / 2
                for q in range(kk):
                    t = t0 + q * pitch; g = fg.facing(t - float(fg.ref @ u) if fg.w is not None else 0.0)
                    S.append(fg.row_point(t, cc)[0]); R.append(i); Y.append(np.arctan2(g[0], g[1]))
    return np.array(S).reshape(-1, 2), np.array(R, int), np.array(Y)
