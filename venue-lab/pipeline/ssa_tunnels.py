"""The 200 level's corner passages at floor level. The official map leaves a bowl of
open floor at each of the floor's south corners, between the end stand's last block
and the corner fan of blocks: a funnel, narrow at the floor and wider further in,
bounded by the stands' own end faces on the outline the map draws (read off its image,
`ssa_outline.py`): no wall of its own, the rows end on the line, their sides the face
(stepped with the rows), a thin steel fence along its top (`funnel_fences`). At the
funnel's back, the line the middle blocks' front rows lie on, the tunnel goes on, 7 m
wide, covered, under the concourse to the building's wall. The tunnel's line leans out
along the diagonal the bowl lies on, as near the bowl's sides as it can be so that no
seat is cut, the pair mirror images of each other (`corner_trenches`); each funnel is
as its own corner's map has it (`corner_funnels`), the treads in it cut, the gaps
beside its faces given to the stand (the rows going on into them, bare)."""
import numpy as np, cv2
from standlib import disk


def floor_void(G, l):
    """the open floor and everything open that runs into it, inside the stand's outline"""
    R = (l.R > 0).astype(np.uint8)
    cs, _ = cv2.findContours(R, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hull = np.zeros_like(R); cv2.fillPoly(hull, [cv2.convexHull(np.vstack(cs))], 1)
    void = ((R == 0) & (hull > 0)).astype(np.uint8)
    n, lab, _, _ = cv2.connectedComponentsWithStats(void, connectivity=4)
    gx, gz = G.g(0, 0)
    return lab == lab[int(gz), int(gx)], hull > 0


def bowl_axis(G, floor, corner, hx, hz):
    """The bowl at a floor corner: the open space beyond the floor's rectangle near `corner`, its centroid, and the
    axis out from the corner through it. -> (mask, axis unit vector)"""
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    sx = np.sign(corner[0])
    near = (np.hypot(X - corner[0], Z - corner[1]) < 22.0) & (np.sign(X) == sx) & (Z > hz - 3.0)
    bowl = floor & near & ((np.abs(X) > hx + 0.3) | (Z > hz + 0.3))
    n, lab, st, _ = cv2.connectedComponentsWithStats(bowl.astype(np.uint8), connectivity=4)
    if n < 2: return None, None
    k = 1 + int(np.argmax(st[1:, 4])); bowl = lab == k
    c = np.array([X[bowl].mean(), Z[bowl].mean()]); u = c - corner; u /= np.linalg.norm(u)
    return bowl, u


def trace_bowl(G, floor, corner, u0, wmin=3.6, max_len=40.0):
    """Along the axis from the floor corner: where the open space (the bowl, funnelling) is no wider than `wmin`:
    the throat, with the bowl's width there. -> (throat point, width, [(point, width)] along the way)"""
    def free(x, v, maxd):
        t = 0.0
        while t < maxd:
            q = x + v * t; a, b = [int(round(float(c))) for c in G.g(q[0], q[1])]
            if not (0 <= a < G.W and 0 <= b < G.H) or not floor[b, a]: break
            t += 0.1
        return t
    u = u0; n_ = np.array([-u[1], u[0]]); pts = []; last = None
    for a in np.arange(2.0, max_len, 0.25):
        x = np.array(corner, float) + u * a
        gx_, gz_ = [int(round(float(c))) for c in G.g(x[0], x[1])]
        if not floor[gz_, gx_]: break
        w = free(x, n_, 12.0) + free(x, -n_, 12.0); pts.append((x.copy(), w)); last = (x.copy(), w)
        if w <= wmin and a > 6.0: break
    return last, pts


def trench_cut(l, o, u, v, width, a0=0.0, open_=None, roof=5.01, along=30.0, margin=0.3):
    """What a trench with its middle line through `o` along `u` (`v` across it) cuts, as `standgen.cut_tunnels` reckons it:
    from `margin` before its mouth `a0` (the walls begin there) its open cut runs to the last tread in its strip under the
    roof's height (or `open_`, if that is longer), and takes the seats in the strip as far as that, with a margin either
    side. -> (the open length the treads need, measured from the cut's start, the number of seats cut when it is `open_`
    long)"""
    G = l.G
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    o = np.asarray(o, float) + np.asarray(u, float) * (a0 - margin)
    al = (X - o[0]) * u[0] + (Z - o[1]) * u[1]; la = np.abs((X - o[0]) * v[0] + (Z - o[1]) * v[1])
    on = (la < width / 2) & (al > 0) & (al < along) & (l.band >= 0)
    low = on & (l.h(np.maximum(l.band, 0)) < roof)
    need = float(al[low].max()) + 0.05 if low.any() else 0.0
    deck = max(need, open_ or 0.0)
    q = l.seats - o
    cut = (np.abs(q @ v) < width / 2 + 0.3) & ((q @ u) > 0) & ((q @ u) < deck + 0.3)
    return need, int(cut.sum())


def corner_trenches(G, l, floor_half=(25.9, 41.3), front=41.5, width=7.0, theta=32.0, wmin=7.4):
    """The tunnels' lines at the floor's south corners (the north corners lie behind the stage), parallel and symmetric: the
    pair are mirror images of each other about the arena's middle line, and each is a strip `width` wide, its mouth square
    across it. The middle line leans `theta` degrees outward from the end stand's line, a diagonal as the old model's tunnels
    (45) ran; 0 would be straight back. The map's void at the corner (the bowl) is a funnel whose fan-side edge is a diagonal
    of 44 degrees and whose end-stand side stands near upright; a strip leaning about 32 lies along it, between the two. The
    funnel's faces come from `corner_funnels`; the strip is the covered tunnel's width and line (its `open`, the open cut's
    length, is set to where the back faces cross it).
    Across, the strip stands where it costs least, the two corners together (a seat cut counts three, a square metre of the
    bowl left outside the strip one, a metre of stand standing in the way of the mouth sixty, a metre that a wall would begin
    later than the stand beside it does one), the middle of the places that tie. Its mouth plane is the later of the four
    places where a stand begins beside it (`a0`). Both open cuts run as far as the longer needs (the treads under the roof's
    height, or the bowl's own length).
    -> a list of {'name', 'sx', 'o' (the middle line's point where the open cut begins), 'u' (along it), 'v' (across it,
    outward), 'w', 'open' (the open cut's length from `o`), 'a0' (where the strip's walls would begin, from `o`), 'strip'
    (its mask), 'pocket' (the bowl outside it), 'bowl', 'cuts' (seats cut), 'xc' (where its middle line meets the front line)}"""
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    floor, _ = floor_void(G, l)
    hx, hz = floor_half
    th = np.radians(theta)
    bowls = {}
    for name, sx in (('SE', 1), ('SW', -1)):
        corner = np.array([sx * hx, hz]); bowl, u0 = bowl_axis(G, floor, corner, hx, hz)
        if bowl is None: continue
        last, _ = trace_bowl(G, floor, corner, u0, wmin=wmin)
        if last is None: continue
        pold = last[0] - u0 * 0.3                                  # (the throat, where the concourse's floor begins)
        bowls[name] = (sx, bowl & ((X - pold[0]) * u0[0] + (Z - pold[1]) * u0[1] <= 0.3) & (Z >= front), pold)
    tread = (l.R > 0) & (l.band >= 0) & (l.d >= 0)
    def frame(sx, xc):
        o = np.array([sx * xc, front]); u = np.array([sx * np.sin(th), np.cos(th)]); v = np.array([u[1], -u[0]]) * sx
        return o, u, v
    def coords(o, u, v):
        return (X - o[0]) * u[0] + (Z - o[1]) * u[1], (X - o[0]) * v[0] + (Z - o[1]) * v[1]
    def side_start(o, u, v, bowl, side):
        """how far along the middle line (from `o`) a stand first stands beside the strip's edge on `side` (-1 the end
        stand's, +1 the fan's): a metre of it with the band just outside the edge (0.2 to 1.4 m) stand or bowl that is given
        back to it"""
        a = np.arange(-8.0, 20.0, 0.1); sh = np.array([0.2, 0.6, 1.0, 1.4])
        pts = o[None, None, :] + u[None, None, :] * a[:, None, None] + v[None, None, :] * side * (width / 2 + sh)[None, :, None]
        gi, gj = [np.round(c).astype(int) for c in G.g(pts[..., 0], pts[..., 1])]
        ok = (gi >= 0) & (gi < G.W) & (gj >= 0) & (gj < G.H)
        gi = np.where(ok, gi, 0); gj = np.where(ok, gj, 0)
        has = ((tread[gj, gi] | bowl[gj, gi]) & ok).mean(axis=1) >= 0.75
        run = np.convolve(has.astype(int), np.ones(10, int), 'valid') == 10
        return float(a[np.argmax(run)]) if run.any() else 20.0
    def lateral(o, u, v):
        return np.abs(coords(o, u, v)[1]) <= width / 2
    def stands_in_the_way(o, u, v, a0):
        al, la = coords(o, u, v)
        return float((tread & (np.abs(la) <= width / 2 - 0.5) & (al > a0 - 3.0) & (al < a0 - 0.3)).sum() * G.res * G.res / 3.0)
    res = []
    for x_ in np.arange(14.0, 27.01, 0.25):
        fr = {n: frame(sx, x_) for n, (sx, _, _) in bowls.items()}
        st = {n: [side_start(*fr[n], bowls[n][1] & ~lateral(*fr[n]), s) for s in (-1, 1)] for n in fr}
        a0 = max(max(v_) for v_ in st.values())
        late = sum(a0 - s for v_ in st.values() for s in v_)
        need = {n: max(trench_cut(l, *fr[n], width, a0=a0)[0], float((bowls[n][2] - fr[n][0]) @ fr[n][1]) - (a0 - 0.3)) for n in bowls}
        common = max(need.values()); cost, cuts = late, {}
        for n, (sx, bowl, _) in bowls.items():
            cuts[n] = trench_cut(l, *fr[n], width, a0=a0, open_=common)[1]
            pocket = float((bowl & ~lateral(*fr[n])).sum() * G.res ** 2)
            cost += 3 * cuts[n] + pocket + 60.0 * stands_in_the_way(*fr[n], a0)
        res.append((cost, float(x_), round(a0, 2), round(common, 2), cuts))
    best = min(r[0] for r in res)
    tie = [r for r in res if r[0] <= best + 1.0]
    mid = float(np.median([r[1] for r in tie]))
    _, xc, a0, open_, cuts = min(tie, key=lambda r: abs(r[1] - mid))
    out = []
    for name, (sx, bowl, _) in bowls.items():
        o, u, v = frame(sx, xc); strip = lateral(o, u, v) & (Z >= front)
        out.append({'name': name, 'sx': sx, 'o': o + u * (a0 - 0.3), 'u': u, 'v': v, 'w': width, 'open': open_, 'a0': 0.3, 'strip': strip,
                    'pocket': bowl & ~strip, 'bowl': bowl, 'cuts': cuts[name], 'xc': xc})
    return out


def fill_pocket(G, l, pocket, reach=2.5, lam=1.5):
    """Give the part of a bowl outside the trench back to the stand: the rows go on into it, straight on from the rows
    beside it, as far as there is stand (bare treads, no seats: the map has none there). Each connected part of the pocket
    takes the depth of one plane, fitted to the stand's within `reach` metres of it (rows parallel and straight, as the
    block beside it has them), pulled to the stand's own depth at the stand's edge by a correction that dies away in `lam`
    metres, so no row has a step where it leaves the stand. (The depth field the level has over the void is each nearest
    seat's own, kinked wherever two seats' reaches meet: it is not used.) -> the mask filled"""
    from scipy.ndimage import distance_transform_edt, label
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    stand = (l.R > 0) & (l.d >= 0.0) & ~pocket
    dist, (iy, ix) = distance_transform_edt(~stand, return_indices=True)
    dist = dist * G.res
    lab, n = label(pocket, structure=np.ones((3, 3)))
    filled = np.zeros_like(pocket)
    for i in range(1, n + 1):
        part = lab == i
        if part.sum() * G.res ** 2 < 1.0: continue
        near = stand & (distance_transform_edt(~part) * G.res < reach)
        A = np.c_[X[near], Z[near], np.ones(near.sum())]; b = l.d[near]
        w = np.ones(len(b))
        for _ in range(3):                                           # (a few outliers, the kinks of the stand's own field, out)
            c = np.linalg.lstsq(A * w[:, None], b * w, rcond=None)[0]
            r = np.abs(A @ c - b); w = (r < max(0.3, 2.0 * np.median(r))).astype(float) + 1e-3
        plane = c[0] * X + c[1] * Z + c[2]
        corr = (l.d[iy, ix] - plane[iy, ix]) * np.exp(-dist / lam)
        d_new = plane + corr
        m = part & (d_new >= -0.35)                                  # (the first row's front edge: a hair short of the front is the front)
        d_new = np.maximum(d_new, 0.0)
        l.d[m] = d_new[m]; l.R[m] = 1
        l.band[m] = np.clip(np.floor(d_new[m] / l.D).astype(int), 0, l.nrows - 1)
        filled |= m
    return filled


def back_notches(G, l, xr=19.5, depth=0.6, width=1.6, wmax=9.0, zmin=30.0):
    """Where the end stand's last row falls short of its straight back, for a stretch of the width of a block's end or more
    (a block with a notch in its back, a bay the rows leave): the cells between the rows' end and the line the neighbours'
    rows end on. -> the mask (the wall behind them is then one straight wall once the rows go on into it, `fill_pocket`)"""
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    R = (l.R > 0) & (Z > zmin)
    cols = np.nonzero(np.abs(G.m(np.arange(G.W), 0)[0]) <= xr)[0]
    zmax = np.full(G.W, np.nan)
    for i in cols:
        zs = Z[R[:, i], i]
        if len(zs): zmax[i] = zs.max()
    ref = float(np.nanpercentile(zmax[cols], 85))
    short = np.zeros(G.W, bool); short[cols] = np.nan_to_num(zmax[cols], nan=ref) < ref - depth
    out = np.zeros(l.R.shape, bool)
    i = 0
    while i < G.W:
        if not short[i]: i += 1; continue
        j = i
        while j + 1 < G.W and short[j + 1]: j += 1
        if width <= (j - i + 1) * G.res <= wmax:
            for c in range(i, j + 1): out[:, c] = (Z[:, c] > zmax[c]) & (Z[:, c] <= ref) & (l.R[:, c] == 0)
        i = j + 1
    return out, ref


# ── the funnel: the corner's open floor bounded by the stands' own end faces, on the map's drawn outline ──
def _line(p, d):
    d = np.asarray(d, float)
    return {'p': np.asarray(p, float), 'd': d / np.hypot(*d)}


def _meet(l0, l1):
    """where two lines {'p', 'd'} meet"""
    den = l0['d'][0] * l1['d'][1] - l0['d'][1] * l1['d'][0]
    t = ((l1['p'][0] - l0['p'][0]) * l1['d'][1] - (l1['p'][1] - l0['p'][1]) * l1['d'][0]) / den
    return l0['p'] + l0['d'] * t


def _poly_mask(G, P):
    m = np.zeros((G.H, G.W), np.uint8)
    gx, gz = G.g(np.asarray(P)[:, 0], np.asarray(P)[:, 1])
    cv2.fillPoly(m, [np.round(np.c_[gx, gz] * 16).astype(np.int32)], 1, shift=4)
    return m > 0


def corner_funnels(G, l, trenches, corners, clear=0.3, shift_max=1.0, band=1.6, near=1.5, zone_w=0.6, reach_out=0.15):
    """Each corner's open floor as the map draws it, a funnel between the end stand's last block, the fan's blocks and the line
    the middle blocks' front rows lie on (`corners`: ssa_corners.json, the outline's lines read off the map's image), bounded
    by the stands' own end faces: no wall stands between. Each side is its line (or its two) moved into the funnel only as far
    as keeps every seat `clear` metres behind it; the pieces meet at their lines' crossings; the front ends are where the
    stand begins along its line. The treads in the funnel are cut (a door's aisle beside a block's end is no part of an end
    face), and the gaps between the lines and the stand's own edge (a block's rows end short of its outline) are the stand's:
    bare treads, the rows going on (to a hair beyond the face, `reach_out`, which `clip_rows` takes off along the face's own straight
    line). -> a list, one for each trench, of {'name', 'poly' (the open floor's outline: n x 2), 'path' (the faces' lines from the end stand's
    front end round to the fan's: n x 2), 'normals' (into the funnel, one for each piece of the path), 'mask' (the open
    floor), 'cut' (the treads in it, to go), 'pocket' (the gaps, to be given to the stand), 'zone' (where the stand's edge has
    the faces' own fence: no rail), 'a_back' (how far along the trench's line the back face crosses it, from its `o`)}"""
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    S = l.seats
    stand = l.R > 0
    from scipy.ndimage import distance_transform_edt
    dR, (iy, ix) = distance_transform_edt(~stand, return_indices=True); dR *= G.res
    out = []
    for t in trenches:
        C = corners[t['name']]
        o, u = np.asarray(t['o'], float), np.asarray(t['u'], float)
        mid = o + u * 6.0
        rear = [_line(c['p'], c['d']) for c in C['rear']]
        fan = [_line(c['p'], c['d']) for c in C['fan']]                    # (from the front to the back)
        ring = rear + [_line(C['back']['p'], C['back']['d'])] + [_line(c['p'], -np.asarray(c['d'])) for c in fan[::-1]]
        for ln in ring:
            n = np.array([-ln['d'][1], ln['d'][0]]); ln['n'] = n if (mid - ln['p']) @ n > 0 else -n
        # each line moved into the funnel as far as the seats beside it ask
        V = [_meet(ring[k], ring[k + 1]) for k in range(len(ring) - 1)]
        shifts = []
        for k, ln in enumerate(ring):
            t0 = (V[k - 1] - ln['p']) @ ln['d'] if k else None; t1 = (V[k] - ln['p']) @ ln['d'] if k < len(V) else None
            if t0 is None: t0 = t1 - 16.0                                        # (the first and the last run out to the front)
            if t1 is None: t1 = t0 + 16.0
            lo, hi = min(t0, t1), max(t0, t1)
            q = S - ln['p']; al = q @ ln['d']; s = q @ ln['n']
            sel = (al >= lo) & (al <= hi) & (s > -1.5) & (s <= shift_max - clear)
            shifts.append(float(max(0.0, s[sel].max() + clear)) if sel.any() else 0.0)
        for ln, sh in zip(ring, shifts): ln['p'] = ln['p'] + ln['n'] * sh
        V = [_meet(ring[k], ring[k + 1]) for k in range(len(ring) - 1)]
        # where the stand begins along each front line: the first stretch (going back) with stand within a metre behind it
        def front_end(ln, end):
            """the line's point where the stand begins, going from its back end `end` along -d"""
            tb = (end - ln['p']) @ ln['d']; first = tb
            for tt in np.arange(tb, tb - 22.0, -0.05):
                P = ln['p'] + ln['d'] * tt - ln['n'] * 0.6; i, j = [int(round(float(c))) for c in G.g(P[0], P[1])]
                if 0 <= i < G.W and 0 <= j < G.H and dR[j, i] <= 0.75: first = tt
                elif first - tt > 0.6: break
            return ln['p'] + ln['d'] * first
        r_front = front_end(ring[0], V[0])
        f_line = _line(ring[-1]['p'], -ring[-1]['d'])                        # (the fan's front piece, running back again)
        f_line['n'] = ring[-1]['n']
        f_front = front_end(f_line, V[-1])
        # the funnel: A (the end stand's front end), the bends, B and C, round to D (the mouth is the line from D back to A)
        poly = [r_front] + V + [f_front]
        mask = _poly_mask(G, poly)
        cut = (cv2.erode(mask.astype(np.uint8), disk(reach_out / G.res)) > 0) & stand            # (a hair of tread beside each face stays: `clip_rows` trims it)
        # the gaps: cells behind a face (within `band` of it, between its ends) the stand's edge leaves, with stand behind them
        pocket = np.zeros_like(mask)
        pieces = [(ring[k], V[k - 1] if k else r_front, V[k] if k < len(V) else f_front) for k in range(len(ring))]
        for ln, p0, p1 in pieces:
            q_x, q_z = X - ln['p'][0], Z - ln['p'][1]
            al, s = q_x * ln['d'][0] + q_z * ln['d'][1], q_x * ln['n'][0] + q_z * ln['n'][1]
            a0, a1 = sorted(((p0 - ln['p']) @ ln['d'], (p1 - ln['p']) @ ln['d']))
            band_ = (al >= a0) & (al <= a1) & (s <= reach_out) & (s >= -band) & ~stand
            sn = (X[iy, ix] - ln['p'][0]) * ln['n'][0] + (Z[iy, ix] - ln['p'][1]) * ln['n'][1]       # (the nearest stand cell's side)
            pocket |= band_ & (dR <= near) & (sn < s - 0.05)
        # no rail along the faces: their fence is their own
        path = np.array([r_front] + V + [f_front])
        zone = np.zeros((G.H, G.W), np.uint8)
        gxp, gzp = G.g(path[:, 0], path[:, 1])
        cv2.polylines(zone, [np.round(np.c_[gxp, gzp]).astype(np.int32)], False, 1, thickness=int(round(2 * zone_w / G.res)))
        axis = ring[len(rear)]                                                     # (the back face)
        a_back = float(((axis['p'] - o) @ axis['n']) / (u @ axis['n']))
        norm = [ln['n'] for ln in ring]
        out.append({'name': t['name'], 'poly': np.array(poly), 'path': path, 'normals': norm, 'mask': mask, 'cut': cut, 'pocket': pocket, 'zone': zone > 0, 'a_back': a_back,
                    'shifts': [round(s_, 2) for s_ in shifts]})
    return out


def funnel_fences(G, l, f, floor=None, height=1.1, ds=0.25, depths=(0.15, 0.3, 0.5, 0.8, 1.2, 1.6)):
    """The fence along a funnel's end faces (`f` from `corner_funnels`, the stand's treads as they are by now): segments
    [x0, z0, x1, z1, y0, y1], each from the tread level of the stand's edge beside it (the nearest tread behind the face, within
    `depths`) up `height`, one every `ds` along the faces' path; where no tread is near (a face with the concourse behind it) the
    concourse's floor `floor`, or the nearest height known along the piece."""
    segs = []
    path, norms = f['path'], f['normals']
    for k in range(len(path) - 1):
        a, b = path[k], path[k + 1]; n = norms[k]
        m = max(1, int(np.ceil(float(np.hypot(*(b - a))) / ds)))
        hs = []
        for i in range(m):
            c = a + (b - a) * (i + 0.5) / m; h = None
            for dd in depths:
                P = c - n * dd; ii, jj = [int(round(float(v))) for v in G.g(P[0], P[1])]
                if 0 <= ii < G.W and 0 <= jj < G.H and l.band[jj, ii] >= 0: h = float(l.h(l.band[jj, ii])); break
            hs.append(h)
        known = [i for i, h in enumerate(hs) if h is not None]
        if floor is not None: hs = [h if h is not None else floor for h in hs]
        elif not known: continue
        else: hs = [h if h is not None else hs[min(known, key=lambda j: abs(j - i))] for i, h in enumerate(hs)]
        for i in range(m):
            p0, p1 = a + (b - a) * i / m, a + (b - a) * (i + 1) / m
            segs.append([round(float(v), 3) for v in (*p0, *p1)] + [round(hs[i], 3), round(hs[i] + height, 3)])
    return segs


def clip_rows(rows, polys):
    """The rows' outlines (`Level.rows_out`) with the funnels' open floor (`polys`: their outlines) taken out: the stand's edge there
    is the face's own straight line, not the raster's steps."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    hole = unary_union([Polygon(p) for p in polys])
    rd = lambda c: [[round(float(x), 2), round(float(z), 2)] for x, z in c]
    out = []
    for r in rows:
        keep, touched = [], False
        for rings in r['polys']:
            g = Polygon(rings[0], rings[1:]).buffer(0)
            if g.intersects(hole): g = g.difference(hole); touched = True
            keep.append(g)
        if not touched: out.append(r); continue
        ps = []
        for g in keep:
            for q in (g.geoms if hasattr(g, 'geoms') else [g]):
                if q.geom_type == 'Polygon' and q.area >= 0.02: ps.append([rd(list(q.exterior.coords)[:-1])] + [rd(list(h.coords)[:-1]) for h in q.interiors])
        out.append({**r, 'polys': ps})
    return out

