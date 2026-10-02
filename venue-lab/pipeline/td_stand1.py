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
# next (see fit_profiles); the blocks beside the poles are then each given one
# straight slope (fit_straight).
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
                 rake=(0.08, 0.65, 0.0), seam_w=None, front_w=(5, 10.0), step=2, verbose=True, uniform=(0.27, 0.0, 1), flat=(0.0, 0.0), w_hold=30.0):
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
    (weight front_w[1]). Every segment climbs by a rake of `rake` m/m: (A least, most, B least).
    `uniform` = (rake, weight, first finger): from that finger on every segment is pulled to the one
    rake (A and B alike), `flat` = (weight, between fingers): every segment of a finger is pulled to
    the finger's own single rake (a straight slope), `w_hold` the weight of a back held at the
    concourse once it comes out over it."""
    from scipy.optimize import lsq_linear
    from scipy.sparse import coo_matrix
    F = res['fingers']; NP = 25
    NK = [len(F[n].ku) for n in range(1, NP + 1)]
    off = np.r_[0, np.cumsum(NK)]; ncol = int(off[-1]) + NP                  # (and one more each: the finger's own rake, for `flat`)
    col = lambda n, m: int(off[n - 1]) + m                                   # unknown m of finger n: its front's height, then its rises
    rcol = lambda n: int(off[-1]) + n - 1                                    # the finger's own rake
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
        if uniform[1] > 0 and n >= uniform[2]:      # the same rake all round: every segment's pulled to uniform[0] m/m (from finger uniform[2] on)
            for m in range(1, K): add([(col(n, m), 1.0 / seg[m - 1])], uniform[0], uniform[1])
        if flat[0] > 0:                   # one rake along the finger (its own): every segment's pulled to it; and the fingers' to their neighbours'
            for m in range(1, K): add([(col(n, m), 1.0 / seg[m - 1]), (rcol(n), -1.0)], 0.0, flat[0])
            if flat[1] > 0 and 1 < n < NP: add([(rcol(n - 1), 1.0), (rcol(n), -2.0), (rcol(n + 1), 1.0)], 0.0, flat[1])
    lo = np.zeros(ncol); hi = np.zeros(ncol)
    for n in range(1, NP + 1):
        K = NK[n - 1]; ku = F[n].ku; seg = np.diff(ku)
        lo[col(n, 0)], hi[col(n, 0)] = 0.5, 9.5; lo[rcol(n)], hi[rcol(n)] = 0.05, 0.7
        for m in range(1, K):
            r0 = rake[0] if ku[m] <= F[n].uw + 1e-6 else rake[2]
            lo[col(n, m)], hi[col(n, m)] = r0 * seg[m - 1], rake[1] * seg[m - 1]
    # the backs at the concourse's height, none over it (a finger that comes out over it is held to it and the fit run again)
    held = set()
    for it in range(4):
        r_, c_, v_, b_ = list(rows), list(cols), list(vals), list(rhs); n_ = nrow[0]
        for n in range(1, NP + 1):
            wb = w_hold if n in held else w_back.get(n, w_back_other)
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

def fit_straight(G, res, Fh, profs, free=range(1, 9), lam_F=1.0, over=(2.1, 1.0), under=(0.3, 8.0), front=(0.5, 4.8),
                 rake=(0.26, 0.5), smooth=(0.3, 3.0), step=2, verbose=True):
    """The fingers `free` (their mirror images with them) each ONE straight slope, h = hw + r (u - uw)
    (u from the front, uw the walkway's depth), the other fingers' profiles in `profs` held as they are.
    The rows run on across every aisle, so the distance from the walkway is the same on both sides of
    it and the step across an aisle is the plain difference of two such lines: linear in (hw, r). What the
    corner's blocks cannot give each other without a wall at the aisle (their backs are 6.7 m, 11 m,
    16.6 m behind the walkway, the outfield stand's rows climb 0.46 m/m) comes out as the wall, so this finds
    the (hw, r) that keep the LARGEST wall across any aisle between fingers (T) and `lam_F` times the
    largest across the aisle into the outfield stand (TF) as small as they can be (a linear program), with
      - the back of a finger at the concourse: a finger whose line would pass it by more than `over[0]` m
        costs `over[1]` per metre of it (the rows reach the concourse and run level to the back, the height
        capped at C1F: a landing), one that stops more than `under[0]` m short of it `under[1]` per metre
        (a step up at the entrance),
      - the front row between `front` m (the outfield's fence is 4.6 m),
      - a rake of at least `rake[0]` (the one rake of the real rows: no easing off towards the outfield) and
        neither the walkway's height nor the rake rising from the pole towards the middle,
      - hw and r changing smoothly from finger to finger (`smooth`: the weights of their second differences).
    Returns `profs` with the free fingers' heights (at the finger's knots, as apply_profiles takes them)."""
    from scipy.optimize import linprog
    from scipy.sparse import csr_matrix
    F = res['fingers']; NP = 25; free = sorted(free); NC = max(free)
    fold = lambda k: k if k <= NP else 50 - k
    # a pinned finger's own (hw, r) for the smoothness terms; its heights by interpolation for the steps
    pin_hw = {n: float(np.interp(F[n].uw, F[n].ku, profs[n])) for n in range(1, NP + 1)}
    pin_r = {n: float((profs[n][-1] - pin_hw[n]) / (F[n].ku[-1] - F[n].uw)) for n in range(1, NP + 1)}
    ka, kb, pa, pb, fa, fb = seam_pairs(G, res, Fh, step=step)
    def side(k, p, fh):
        """per cell: the finger n it belongs to (0 for the outfield stand), the distance from the walkway
        and the height the cell has already (pinned fingers', the outfield's)"""
        n = np.zeros(len(k), int); rho = np.zeros(len(k)); h = np.array(fh, float)
        for key in np.unique(k):
            if key < 0: continue
            m = k == key; fg = F[int(key)]; nn = fold(int(key)); u = np.clip(fg.cfront - fg.coord(p[m]), 0, fg.ku[-1])
            n[m] = nn; rho[m] = u - fg.uw
            h[m] = np.interp(u, fg.ku, profs[nn])
        return n, rho, h
    na, ra, ha = side(ka, pa, fa); nb, rb, hb = side(kb, pb, fb)
    # the unknowns: hw[1..25], r[1..25] (the free fingers' are the free ones), T, TF, each back's shortfall and
    # overshoot, the bounds of the second differences
    iw = lambda n: n - 1; ir = lambda n: NP + n - 1; iT, iTF = 2 * NP, 2 * NP + 1
    isb = lambda n: 2 * NP + 2 + n - 1; iso = lambda n: 3 * NP + 2 + n - 1
    ish = lambda n: 4 * NP + 2 + (n - 2); isr = lambda n: 4 * NP + 2 + (NP - 2) + (n - 2)
    nv = 4 * NP + 2 + 2 * (NP - 2)
    rows, cols, vals, ub = [], [], [], []
    def add(ent, rhs):                                          # ent . x <= rhs
        for c, v in ent: rows.append(len(ub)); cols.append(c); vals.append(v)
        ub.append(rhs)
    isfree = np.isin(np.arange(NP + 1), free)
    for q in np.nonzero(isfree[na] | isfree[nb])[0]:
        isF = ka[q] < 0 or kb[q] < 0
        ent = []; c = 0.0                                       # the step a - b = ent . x + c
        for sgn, n, rho, h in ((1.0, na[q], ra[q], ha[q]), (-1.0, nb[q], rb[q], hb[q])):
            if n > 0 and isfree[n]: ent += [(iw(n), sgn), (ir(n), sgn * rho)]
            else: c += sgn * h
        t = iTF if isF else iT
        add(ent + [(t, -1.0)], -c); add([(j, -v) for j, v in ent] + [(t, -1.0)], c)
    for n in free:
        ub_ = F[n].ku[-1] - F[n].uw
        add([(iw(n), -1.0), (ir(n), -ub_), (isb(n), -1.0)], -(C1F - under[0]))        # the back short of the concourse
        add([(iw(n), 1.0), (ir(n), ub_), (iso(n), -1.0)], C1F + over[0])               # the back over it
        add([(iw(n), -1.0), (ir(n), F[n].uw)], -front[0]); add([(iw(n), 1.0), (ir(n), -F[n].uw)], front[1])
    def cvar(n, col, pin):        # finger n's unknown, or its pinned value: ([(index, 1)], 0) or ([], value)
        return ([(col(n), 1.0)], 0.0) if isfree[n] else ([], pin[n])
    for n in range(2, NC + 2):                                  # |second difference of hw, of r| <= its bound
        for col, pin, sm in ((iw, pin_hw, ish), (ir, pin_r, isr)):
            es, cs = [], 0.0
            for m, w in ((n - 1, 1.0), (n, -2.0), (n + 1, 1.0)):
                if m > NP: continue
                e, v = cvar(m, col, pin); es += [(j, w * x) for j, x in e]; cs += w * v
            if not es or n + 1 > NP: continue
            add(es + [(sm(n), -1.0)], -cs); add([(j, -x) for j, x in es] + [(sm(n), -1.0)], cs)
    for n in free:                # from the pole towards the middle neither hw nor r rises
        for col, pin in ((iw, pin_hw), (ir, pin_r)):
            e, v = cvar(n + 1, col, pin)
            add(e + [(col(n), -1.0)], -v)                       # (finger n+1's value) - (finger n's) <= 0
    A = csr_matrix((vals, (rows, cols)), shape=(len(ub), nv))
    cost = np.zeros(nv); cost[iT] = 1.0; cost[iTF] = lam_F
    for n in range(1, NP + 1): cost[isb(n)] = under[1]; cost[iso(n)] = over[1]
    for n in range(2, NP): cost[ish(n)] = smooth[0]; cost[isr(n)] = smooth[1]
    lo, hi = np.zeros(nv), np.full(nv, np.inf)
    for n in range(1, NP + 1):
        if isfree[n]: lo[iw(n)], hi[iw(n)], lo[ir(n)], hi[ir(n)] = 3.0, 11.5, rake[0], rake[1]
        else: lo[iw(n)] = hi[iw(n)] = pin_hw[n]; lo[ir(n)] = hi[ir(n)] = pin_r[n]
    sol = linprog(cost, A_ub=A, b_ub=np.array(ub), bounds=list(zip(lo, hi)), method='highs')
    if sol.status != 0: raise RuntimeError('fit_straight: ' + sol.message)
    x = sol.x; out = dict(profs)
    for n in free:
        fg = F[n]; hw, r = float(x[iw(n)]), float(x[ir(n)])
        out[n] = np.minimum(C1F, hw + r * (fg.ku - fg.uw))
        if verbose:
            bk = hw + r * (fg.ku[-1] - fg.uw)
            print('  straight finger %d: walkway %.2f m, rake %.3f, front %.2f m, back %+.2f m%s' % (
                n, hw, r, hw - r * fg.uw, bk - C1F, (', level for the last %.1f m' % ((bk - C1F) / r)) if bk > C1F + 0.05 else ''))
    if verbose: print('fit_straight: the largest wall across an aisle between fingers %.2f m, into the outfield stand %.2f m' % (x[iT], x[iTF]))
    return out

# ── the gates ──
# The map widens the aisle between two B blocks, every third aisle (B11|12, 14|15,
# 17|18, 20|21, and B23|24 behind home, the 3B side's mirror: 10 in all), from
# 1.6 m to 3.4 m (4.5 behind home) for the first 8-9 rows behind the walkway. Those
# rows stand too low to walk under (as the 2nd floor's first rows at its
# vomitories), so the widening is the mouth of a gate: a pit open to the walkway,
# then a short tunnel at the pit's floor under the rows (their own slab its roof)
# into a lower concourse dug under the back of the stand: one long corridor along
# each side of the field (1B, 3B) and one behind home, 5 m wide, lit, with a stair
# at each end up to the 1st floor's concourse (an open cut through its floor).
GATE_PAIRS = (11, 14, 17, 20, 23)       # the aisle between B n and B n+1 on the 1B side
GATE_SLAB, GATE_CLEAR, GATE_W, GATE_PAR = 0.25, 2.1, 1.8, 1.0
STAIR_RISE, STAIR_RUN = 0.19, 0.27
CORR_FRONT, CORR_W = 4.0, 5.0           # the corridor's front wall at most this far under the stand (m from its back edge), and its width
CORR_HEAD, GATE_HEAD = 2.8, 1.95        # the ceiling over the floor: in the corridor, in a gate's tunnel
CORR_END = 6.0                          # the corridor runs on this far past its outermost gate
RAIL_T = 0.25                           # the partitions beside a gate stand this thick
WALL_IN = 0.05                          # the corridors' walls stand this far inside the outline the solids round them are cut to
GATE_LAP = 0.03                         # a roof slab reaches this far under the next row's, so that the two meet with no crack

def _pieces(g):
    return [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if p.geom_type == 'Polygon' and not p.is_empty]

def _tbox(a, u, t0, t1, s0, s1):
    """The rectangle t0..t1 along a, s0..s1 across (u), as a polygon in metres."""
    return Polygon([a * t0 + u * s0, a * t1 + u * s0, a * t1 + u * s1, a * t0 + u * s1])

def _side_rails(poly, a, floor_at, top_at, drop=0.35, par=GATE_PAR):
    """The partitions along the sides of a pit or cut (the edges running along `a`): 1 m
    over the tread beside each, where that stands `drop` or more over the floor
    (`floor_at(point)`) of the pit; [x0, z0, x1, z1, y0, y1] each, a piece per row, each
    running so that the side away from the pit is on its right (the way the partition is thick)."""
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
            if not ccw: q0, q1 = q1, q0
            rails.append([round(float(q0[0]), 2), round(float(q0[1]), 2), round(float(q1[0]), 2), round(float(q1[1]), 2), round(float(ha), 2), round(float(ha + par), 2)])
    return rails

def gate_sites(B, F, inside, r_open=1.2, pitch=DB):
    """The gates, from the chart's block outlines `B` (the 1B side's, B[n]) and the
    fingers `F`: per gate a dict with the pit (open to the walkway), the row edge
    `t_end` where a roof over a flat floor at the walkway's height has 2.1 m of room,
    `t_wall` where the stand ends, the partitions beside the pit and the numbers
    needed to draw them. `inside(p)`: whether the point p (metres) is on the stand
    (its rows, landing included). gate_corridors then digs what they lead to."""
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
            # the pit: the gap's cells in the first rows (slivers along the blocks' slanted fronts off)
            pit = _tbox(a, u, t_front - 0.1, t_end, s_c - 3.6, s_c + 3.6).intersection(g.buffer(0.02)).buffer(0)
            pit = pit.buffer(-0.45, join_style=2).buffer(0.45, join_style=2)
            # (the gap narrows to the aisle's own width where the widening ends, short of the tunnel's start
            # on the row's edge: the pit runs on as wide as the tunnel)
            pit = unary_union([pit, _tbox(a, u, t_front - 0.1, t_end, s_c - GATE_W / 2, s_c + GATE_W / 2)]).buffer(0)
            pit = max(_pieces(pit), key=lambda q: q.area) if _pieces(pit) else None
            if pit is None: continue
            rails = _side_rails(pit, a, lambda p: h0, top_at)
            sites.append(dict(pair=(n, n + 1), side=side, kA=kA, kB=kB, a=a, u=u, s_c=s_c, t_front=float(t_front), t_end=float(t_end),
                              t_wall=float(t_wall), h0=float(h0), h_back=float(top_at(a * (t_wall - 0.3) + u * s_c)), pit=pit, rec=rec, rails=rails, tunnel=None))
    return sites

def gate_corridors(G, sites, stand, c1, O, avoid=(), blocked=None):
    """The lower concourses the gates lead into: per side of the field (1B, 3B) and behind
    home one corridor `CORR_W` m wide under the back of the stand and the concourse's edge, its front
    wall as far in under the stand as the rows' slab leaves the head room (`CORR_FRONT` at most; a stand that ends
    lower, behind home, leaves it 0.6 m out under the concourse),
    from the first gate's axis
    to the last's and `CORR_END` m past each; the gates' tunnels run to it at the pit's floor
    (the lowest of the side's); at each end of it a stair climbs through the concourse's
    floor (an open cut) to the 1st floor's concourse. `stand` the B stand's cells, `c1` the
    concourse's, `O` the field's centre, `avoid` [(x, z, r)] the columns a stair keeps 0.9 m
    off, `blocked` a shapely geometry (the balcony's stairs) it keeps clear of. Sets each
    site's `tunnel` and returns the corridors."""
    from shapely.geometry import LineString, Point
    from shapely.geometry.polygon import orient
    d_in = cv2.distanceTransform((~c1).astype(np.uint8), cv2.DIST_L2, 5) * G.res
    d_out = cv2.distanceTransform((~stand).astype(np.uint8), cv2.DIST_L2, 5) * G.res
    sd = cv2.GaussianBlur(np.where(stand, d_in, -d_out).astype(np.float32), (0, 0), 1.5 / G.res)       # (eased: the stand's edge wobbles by a decimetre)
    pits = unary_union([s['pit'] for s in sites])
    groups = {'1B': [], '3B': [], 'H': []}
    for i, s in enumerate(sites):
        groups['H' if s['pair'][0] == GATE_PAIRS[-1] else ('1B' if s['side'] > 0 else '3B')].append(i)
    corrs = []
    for name, idx in groups.items():
        if not idx: continue
        floor = min(sites[i]['h0'] for i in idx)
        # the front wall as far in as the rows' slab over it leaves CORR_HEAD (the rows climb ~0.27 m a metre)
        front = float(np.clip((min(sites[i]['h_back'] for i in idx) - GATE_SLAB - 0.1 - (floor + CORR_HEAD)) / 0.30, -0.6, CORR_FRONT))
        band = (sd >= front - CORR_W) & (sd <= front) & (stand | c1)
        pts = {i: sites[i]['a'] * (sites[i]['t_wall'] - 1.5) + sites[i]['u'] * sites[i]['s_c'] for i in idx}
        idx = sorted(idx, key=lambda i: np.arctan2(pts[i][0] - O[0], pts[i][1] - O[1]))
        P = [pts[i] for i in idx]
        d_first = (P[1] - P[0]) if len(P) > 1 else np.array([-(P[0][1] - O[1]), P[0][0] - O[0]])
        d_last = (P[-1] - P[-2]) if len(P) > 1 else d_first
        e0 = d_first / np.linalg.norm(d_first); e1 = d_last / np.linalg.norm(d_last)
        line = LineString([P[0] - e0 * CORR_END] + P + [P[-1] + e1 * CORR_END])
        win = line.buffer(6.5, cap_style=2)
        m = np.zeros(band.shape, np.uint8)
        gx_, gz_ = G.g(*np.array(win.exterior.coords).T)
        cv2.fillPoly(m, [np.c_[gx_, gz_].round().astype(np.int32)], 1)
        cm = (band & (m > 0)).astype(np.uint8)
        n_, lab_, st_, _ = cv2.connectedComponentsWithStats(cm, connectivity=4)
        cm = (lab_ == 1 + int(np.argmax(st_[1:, 4]))).astype(np.uint8)
        cm = cv2.morphologyEx(cm, cv2.MORPH_CLOSE, disk(0.5 / G.res))
        cm = cv2.morphologyEx(cm, cv2.MORPH_OPEN, disk(0.8 / G.res))
        cs, _ = cv2.findContours(cm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
        X, Z = G.m(c[:, 0], c[:, 1])
        poly = Polygon(np.c_[X, Z]).buffer(0).simplify(0.12)
        poly = poly.difference(pits.buffer(0.3))
        poly = max(_pieces(poly), key=lambda q: q.area)
        poly = orient(poly, 1.0)
        for i in idx:               # the tunnel: from the pit's end to where the gate's axis enters the corridor
            s = sites[i]
            ax = LineString([s['a'] * s['t_end'] + s['u'] * s['s_c'], s['a'] * (s['t_wall'] + 6) + s['u'] * s['s_c']])
            inter = ax.intersection(poly)
            if inter.is_empty: continue
            cc = np.array([q for g_ in (inter.geoms if hasattr(inter, 'geoms') else [inter]) for q in g_.coords])
            t_in = float((cc @ s['a']).min())
            if t_in - s['t_end'] > 0.3:
                s['tunnel'] = _tbox(s['a'], s['u'], s['t_end'], t_in + 0.4, s['s_c'] - GATE_W / 2, s['s_c'] + GATE_W / 2)
                s['t_in'] = t_in
        # the corridor's own centre line: the gates' line moved to the middle of the band (the distance field's level)
        q = np.array([np.array(line.interpolate(d).coords[0]) for d in np.arange(0.0, line.length, 1.0)] + [np.array(line.coords[-1])])
        mid = front - CORR_W / 2; gz_, gx_ = np.gradient(sd)
        for _ in range(8):
            ix, iz = G.g(q[:, 0], q[:, 1]); ix = np.clip(np.round(ix).astype(int), 0, G.W - 1); iz = np.clip(np.round(iz).astype(int), 0, G.H - 1)
            v = sd[iz, ix]; gv = np.c_[gx_[iz, ix], gz_[iz, ix]]; gn = np.maximum(np.hypot(gv[:, 0], gv[:, 1]), 1e-6)
            q = q + gv / gn[:, None] / G.res * 0 + (gv / gn[:, None]) * ((mid - v) / 1.0)[:, None] * 0.7
        k = 3
        qs = np.array([q[max(0, i - k):i + k + 1].mean(0) for i in range(len(q))]); qs[0], qs[-1] = q[0], q[-1]
        corrs.append(dict(name=name, gates=idx, poly=poly, floor=float(floor), line=LineString(qs), stairs=[]))
    # the stairs: the first place from each end of the corridor where the cut and its stair's run
    # out through the concourse clear every column and the balcony's stairs
    for cr in corrs:
        Lcl = cr['line'].intersection(cr['poly'].buffer(0.5))
        Lc = Lcl if Lcl.geom_type == 'LineString' else max(Lcl.geoms, key=lambda g_: g_.length)
        length = Lc.length
        for end in (0, 1):
            found = None; why = []
            # out through the back wall at 1.5 m from the end on (radially), else on from the very end of the corridor (along it)
            e_end = np.array(Lc.interpolate(0.0 if end == 0 else length).coords[0]); e_in = np.array(Lc.interpolate(1.0 if end == 0 else length - 1.0).coords[0])
            tang = (e_end - e_in) / np.linalg.norm(e_end - e_in); nrm_t = np.array([-tang[1], tang[0]])
            cands = [(np.array(Lc.interpolate(off if end == 0 else length - off).coords[0]), None) for off in np.arange(1.5, min(length / 2 + 0.01, 14.0), 0.5)]
            for rot in (0.0, 0.26, -0.26, 0.52, -0.52):                  # along the corridor from its very end, a little aside or turned
                rv = tang * np.cos(rot) + nrm_t * np.sin(rot)
                for sh in (0.0, 0.8, -0.8, 1.6, -1.6): cands.append((e_end - tang * 1.0 + nrm_t * sh, rv))
            # (and from anywhere along the last 10 m, turned from the radial out by up to 60 degrees either way)
            for off in np.arange(1.0, min(length / 2 + 0.01, 10.0), 1.0):
                q = np.array(Lc.interpolate(off if end == 0 else length - off).coords[0]); rr = q - np.array(O); rr /= np.linalg.norm(rr)
                for rot in (0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05):
                    cands.append((q, rr * np.cos(rot) + np.array([-rr[1], rr[0]]) * np.sin(rot)))
            for rise, run in ((STAIR_RISE, STAIR_RUN), (0.20, 0.25), (0.21, 0.23)):      # (a steeper stair where the room is short)
                n_st = int(np.ceil(max(0.0, C1F - cr['floor']) / rise - 1e-6))
                for q, ra in cands:
                    if ra is None: ra = q - np.array(O); ra /= np.linalg.norm(ra)
                    ua = np.array([-ra[1], ra[0]])
                    tx = 0.0                                           # out along ra to the corridor's wall
                    for t in np.arange(0.0, 8.0, 0.05):
                        if not cr['poly'].contains(Point(*(q + ra * t))): break
                        tx = float(t)
                    S0 = q + ra * tx; t0 = float(S0 @ ra); s0 = float(S0 @ ua)
                    trench = _tbox(ra, ua, t0 - 0.15, t0 + n_st * run + 0.25, s0 - GATE_W / 2, s0 + GATE_W / 2)
                    if not cr['poly'].buffer(0.45).contains(_tbox(ra, ua, t0 - 0.4, t0 - 0.05, s0 - GATE_W / 2, s0 + GATE_W / 2)): why.append('corridor too narrow here'); continue
                    # the stair's run out through the concourse and 2 m of floor to step off onto, all the concourse's
                    run_part = _tbox(ra, ua, t0, t0 + n_st * run + 2.0, s0 - GATE_W / 2 - 0.3, s0 + GATE_W / 2 + 0.3).difference(cr['poly'])
                    mm = np.zeros(c1.shape, np.uint8)
                    for pp in _pieces(run_part):
                        gx2, gz2 = G.g(*np.array(pp.exterior.coords).T); cv2.fillPoly(mm, [np.c_[gx2, gz2].round().astype(np.int32)], 1)
                    if not mm.any() or float(c1[mm > 0].mean()) < 0.995: why.append('run leaves the concourse'); continue
                    landing = _tbox(ra, ua, t0, t0 + n_st * run + 2.0, s0 - GATE_W / 2, s0 + GATE_W / 2)
                    if any(landing.distance(Point(px, pz)) < pr + 0.9 for px, pz, pr in avoid): why.append('column'); continue
                    if blocked is not None and not blocked.is_empty and landing.buffer(0.9).intersects(blocked): why.append('balcony stair'); continue
                    if any(trench.distance(o['trench']) < 2.0 for o in cr['stairs']): why.append('other stair'); continue
                    found = (trench, ra, ua, S0, rise, run, n_st); break
                if found: break
            assert found is not None, ('no room for a stair', cr['name'], end, __import__('collections').Counter(why))
            trench, ra, ua, S0, rise, run, n_st = found
            t0 = float(S0 @ ra)
            treads = [(t0 + i * run, t0 + (i + 1) * run + (0.25 if i == n_st - 1 else 0.0), float(min(C1F, cr['floor'] + rise * (i + 1)))) for i in range(n_st)]
            def stair_at(p, t0=t0, treads=treads, fl=cr['floor'], ra=ra):
                t = float(p @ ra)
                for a0, a1, h in treads:
                    if a0 <= t <= a1: return h
                return fl if t < t0 else C1F
            rails = _side_rails(trench, ra, stair_at, lambda p: C1F)
            # a landing at the foot of the stair, 1.5 m back, taken into the corridor: where the corridor's wall runs
            # across the stair slantwise the floor, the ceiling and the walls then reach the first tread all across it
            s0 = float(S0 @ ua)
            cr['poly'] = orient(unary_union([cr['poly'], _tbox(ra, ua, t0 - 1.5, t0 + 0.02, s0 - GATE_W / 2, s0 + GATE_W / 2)]).buffer(0), 1.0)
            cr['stairs'].append(dict(trench=trench, a=ra, u=ua, S0=S0, t0=t0, treads=treads, rails=rails))
    return corrs

def carve_gates(rows, sites, corrs, nxt):
    """The level's rows with the gates cut in: the pit's cells gone, over each tunnel and the
    corridor each row's own strip kept as a roof slab (the row's top, GATE_SLAB thick, in
    place of the solid prism), the stairs' cuts out of the landing; the floors of the
    pit, the tunnels, the corridor and the stairs' treads (solid from the ground). `nxt[row
    id]` = the row up from it in its finger, the one its polygon reaches under: the slab keeps
    what its own tread covers, up to the next row's polygon (the curve the next tread starts
    on), and GATE_LAP of it under, so the slabs meet with no crack for a foot to fall through.
    Returns the new rows (the carved ones, then the floors)."""
    out = []
    cut = [s['pit'] for s in sites]
    roof = [s['tunnel'] for s in sites if s['tunnel'] is not None] + [c['poly'] for c in corrs]
    trench = [st['trench'] for c in corrs for st in c['stairs']]
    zone = unary_union(cut + roof + trench).buffer(0.05)
    roofU = unary_union(roof)
    cutU = unary_union(cut + trench)
    by_r = {row['r']: row for row in rows}
    for row in rows:
        g = _geom_of(row['polys'])
        if not g.intersects(zone): out.append(row); continue
        rg = g.intersection(roofU)
        if not rg.is_empty and row['r'] in nxt:
            rg = rg.difference(_geom_of(by_r[nxt[row['r']]]['polys']).buffer(-GATE_LAP, join_style=2))
        g = g.difference(cutU).difference(roofU)
        if not g.is_empty:
            ps = _polys_of(g)
            if ps: out.append({**row, 'polys': ps})
        ps = _polys_of(rg)
        if ps: out.append({'r': row['r'], 'y': row['y'], 'y0': round(row['y'] - GATE_SLAB, 3), 'polys': ps})
    for s in sites:
        # (the pit's floor a hair under the walkway's treads it runs on from, which
        # reach a little into it: no two surfaces in one plane)
        out.append({'r': -1, 'y': round(s['h0'] - 0.004, 3), 'y0': 0.0, 'polys': _polys_of(s['pit'])})
    for c in corrs:
        fl = unary_union([c['poly']] + [sites[i]['tunnel'] for i in c['gates'] if sites[i]['tunnel'] is not None])
        out.append({'r': -1, 'y': round(c['floor'] - 0.004, 3), 'y0': 0.0, 'polys': _polys_of(fl)})
        for st in c['stairs']:
            for t0, t1, h in st['treads']:
                ps = _polys_of(_tbox(st['a'], st['u'], t0, t1, float(st['S0'] @ st['u']) - GATE_W / 2, float(st['S0'] @ st['u']) + GATE_W / 2))
                if ps: out.append({'r': -1, 'y': round(h, 3), 'y0': 0.0, 'polys': ps})
    return out

def corridor_rooms(corrs, sites):
    """What closes the corridors and the gates' tunnels in, as the renderer's concourse data:
    the walls (panels [x0, z0, x1, z1, y0, y1] whose front faces the room), the ceilings and the
    lit floors ([{y, polys}]) and the lamps ([x, y, z, yaw])."""
    from shapely.geometry import LineString, MultiLineString
    from shapely.geometry.polygon import orient
    walls, ceils, lit, lamps = [], [], [], []
    def run(line, y0, y1, flip=False):
        """panels along a line (its left the room's side)"""
        parts = line.geoms if hasattr(line, 'geoms') else [line]
        for part in parts:
            if part.geom_type != 'LineString' or part.length < 0.05: continue
            cc = list(part.coords)
            for p, q in zip(cc[:-1], cc[1:]):
                if np.hypot(q[0] - p[0], q[1] - p[1]) < 0.02: continue
                walls.append([round(p[0], 2), round(p[1], 2), round(q[0], 2), round(q[1], 2), round(y0, 3), round(y1, 3)])
    for c in corrs:
        fl, hc = c['floor'], c['floor'] + CORR_HEAD
        # (the walls stand 5 cm inside the outline the solids are cut to: no two faces in one plane)
        inner = c['poly'].buffer(-WALL_IN, join_style=2); inner = max(_pieces(inner), key=lambda q: q.area) if _pieces(inner) else c['poly']
        ring = LineString(orient(inner, 1.0).exterior.coords)            # (counter-clockwise, the room on the left of every panel: a buffer comes out clockwise)
        tun = [sites[i]['tunnel'] for i in c['gates'] if sites[i]['tunnel'] is not None]
        pit = unary_union([sites[i]['pit'] for i in c['gates']])
        trn = [st['trench'] for st in c['stairs']]
        # the long walls, but where a tunnel, a pit or a stair opens into it; over a tunnel's mouth a lintel
        opening = unary_union([t.buffer(0.1) for t in tun] + [pit.buffer(0.2)] + [t.buffer(0.1) for t in trn])
        run(ring.difference(opening), fl, hc)
        for t in tun:
            run(ring.intersection(t.buffer(0.1)), fl + GATE_HEAD, hc)
        ceils.append({'y': round(hc, 3), 'polys': _polys_of(c['poly'])})
        for i in c['gates']:
            s = sites[i]
            if s['tunnel'] is None: continue
            a, u, s_c, t_end, t_in = s['a'], s['u'], s['s_c'], s['t_end'], s['t_in']
            # the tunnel's sides (the left of each faces in) and its ceiling
            wl = GATE_W / 2 - WALL_IN
            walls.append([round(float(v), 2) for v in np.r_[a * t_end + u * (s_c - wl), a * t_in + u * (s_c - wl)]] + [round(fl, 3), round(fl + GATE_HEAD, 3)])
            walls.append([round(float(v), 2) for v in np.r_[a * t_in + u * (s_c + wl), a * t_end + u * (s_c + wl)]] + [round(fl, 3), round(fl + GATE_HEAD, 3)])
            ceils.append({'y': round(fl + GATE_HEAD, 3), 'polys': _polys_of(_tbox(a, u, t_end, t_in, s_c - GATE_W / 2, s_c + GATE_W / 2))})
            p = a * (0.5 * (t_end + t_in)) + u * s_c
            lamps.append([round(float(p[0]), 2), round(fl + GATE_HEAD - 0.04, 3), round(float(p[1]), 2), round(float(np.arctan2(u[0], u[1])), 3)])
        fu = unary_union([c['poly']] + tun)
        lit.append({'y': round(fl, 3), 'polys': _polys_of(fu)})
        # the lamps along the corridor
        Lc = c['line'].intersection(c['poly'].buffer(0.5)); Lc = Lc if Lc.geom_type == 'LineString' else max(Lc.geoms, key=lambda g_: g_.length)
        for off in np.arange(2.0, Lc.length - 1.0, 5.0):
            p0 = np.array(Lc.interpolate(off).coords[0]); p1 = np.array(Lc.interpolate(min(Lc.length, off + 0.5)).coords[0]); e = p1 - p0; e /= (np.linalg.norm(e) + 1e-9)
            lamps.append([round(float(p0[0]), 2), round(hc - 0.04, 3), round(float(p0[1]), 2), round(float(np.arctan2(-e[1], e[0])), 3)])
    return dict(walls=walls, ceils=ceils, lit=lit, lamps=lamps)

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

def rows_out(G, res, lv, extend=0.3, eps=0.03, sites=None, corrs=()):
    """A level's rows as the renderer wants them: for each row, the strip of
    its block between two exact lines (square to the block's axis), cut to the
    block's cells, reaching `extend` under the next row up so the treads meet
    with no crack. `lv` the level's split (split_levels)."""
    meta = res['meta']; F = res['fingers']; band_g = res['band']; finger_of = res['finger_of']
    by = {}
    for j, i in enumerate(lv['ids']): by.setdefault(meta[i][0], []).append((j, i))
    out = {}; nxt = {}
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
        # (the rows of a finger run from the front to the back: the next row up is the one this row reaches under)
        for (a, _), (b, _) in zip(rows[:-1], rows[1:]):
            if a in out and b in out: nxt[a] = b
    rows = [out[j] for j in sorted(out)]
    return carve_gates(rows, sites, corrs, nxt) if sites else rows

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
