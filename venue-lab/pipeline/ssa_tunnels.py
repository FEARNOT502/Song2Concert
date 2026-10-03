"""The 200 level's corner passages at floor level. The official map leaves a bowl of
open floor at each of the floor's south corners, between the end stand's last block
and the corner fan of blocks: a funnel, narrow at the floor and wider further in.
Here it is the open part of a corner tunnel like a stadium's: walled on the two
blocks' end faces as the map draws them (so the walls are not parallel), both
walls beginning on one plane square to the tunnel, thick, their tops raked with the
rows beside them; at the funnel's back the tunnel goes on, 7 m wide, covered, under
the concourse to the building's wall. The tunnel's line leans out along the diagonal
the bowl lies on, as near the bowl's sides as it can be so that no seat is cut, the
pair mirror images of each other (`corner_trenches`); the walls follow the blocks
(`corner_funnels`), so each is as the map has it; what the bowl has outside the walls
is given back to the stand (the rows that go on into it, bare)."""
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
    funnel's walls come from `corner_funnels`; the strip is the covered tunnel's width and line, and the frame the funnel is
    laid in (its front plane, its back plane `open`).
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


def raked_top(s, env):
    """The top of a wall that must clear `env` (the height of whatever it guards, at each point along it, `s` the
    distance along): one straight rake, the line over every point of `env` that lies lowest over them on the whole (the
    least total room: a linear programme in its height and its slope), and level where the rake reaches the highest of
    them. A trapezoid, as the stadium's cuts have, not a staircase that follows the rows."""
    from scipy.optimize import linprog
    s = np.asarray(s, float); env = np.asarray(env, float); s0 = s.mean()
    r = linprog([len(s), float((s - s0).sum())], A_ub=np.c_[-np.ones(len(s)), -(s - s0)], b_ub=-env, bounds=[(None, None), (None, None)], method='highs')
    if not r.success: return np.full(len(s), env.max())
    a, b = r.x
    return np.minimum(env.max(), a + b * (s - s0))


# ── the funnel: the corner's walls fitted to the map's own block ends ──
class Outlines:
    """The blocks' outlines as the map draws them (metres), as a fine mask: calling it with points (x, z) tells which are inside
    some block's outline (`sym`: or its mirror image across the arena's middle line, the stand taken as the two sides' together,
    so that what is laid on one side is as well laid on the other); `near` the same within `r` metres."""
    def __init__(self, polys, box=(-50.0, 30.0, 50.0, 70.0), res=0.02, sym=True, r=0.3):
        self.x0, self.z0, self.res, self.sym = box[0], box[1], res, sym
        self.W, self.H = int((box[2] - box[0]) / res), int((box[3] - box[1]) / res)
        self.m = np.zeros((self.H, self.W), np.uint8)
        for P in polys:
            cv2.fillPoly(self.m, [np.round((np.asarray(P, float) - [self.x0, self.z0]) / res * 16).astype(np.int32)], 1, shift=4)
        self.md = cv2.dilate(self.m, disk(r / res))

    def _at(self, m, x, z):
        i = np.round((np.asarray(x) - self.x0) / self.res).astype(int); j = np.round((np.asarray(z) - self.z0) / self.res).astype(int)
        ok = (i >= 0) & (i < self.W) & (j >= 0) & (j < self.H); out = np.ones(np.shape(x), bool)
        out[ok] = m[j[ok], i[ok]] > 0
        return out

    def __call__(self, x, z):
        out = self._at(self.m, x, z)
        return out | self._at(self.m, -np.asarray(x), z) if self.sym else out

    def near(self, x, z):
        out = self._at(self.md, x, z)
        return out | self._at(self.md, -np.asarray(x), z) if self.sym else out


def dp_indices(P, eps):
    """Douglas-Peucker on an open polyline (N x 2): the indices of the points kept"""
    keep = np.zeros(len(P), bool); keep[0] = keep[-1] = True
    stack = [(0, len(P) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1: continue
        A, B = P[a], P[b]; d = B - A; L = float(np.hypot(*d))
        seg = P[a + 1:b] - A
        dist = np.hypot(*seg.T) if L < 1e-9 else np.abs(seg @ np.array([-d[1], d[0]])) / L
        i = int(np.argmax(dist))
        if dist[i] > eps: m = a + 1 + i; keep[m] = True; stack += [(a, m), (m, b)]
    return np.nonzero(keep)[0]


def edge_scan(inside, o, u, v, side, a, reach=20.0, step=0.02):
    """How far across the middle line (through `o` along `u`, `v` across) the open space reaches, on `side` (-1 the end
    stand's, +1 the fan's), at each distance `a` along it: the first point `inside(x, z)` says is the stand's.
    -> the signed distances"""
    s = np.arange(0.0, reach, step); out = np.empty(len(a))
    for k, a_ in enumerate(a):
        p = o[None, :] + u[None, :] * a_ + v[None, :] * (side * s)[:, None]
        hit = inside(p[:, 0], p[:, 1])
        out[k] = side * (s[int(np.argmax(hit))] if hit.any() else reach)
    return out


def _meet(p0, d0, p1, d1):
    """where the line p0 + t d0 meets p1 + s d1 (None if they run alike)"""
    den = d0[0] * d1[1] - d0[1] * d1[0]
    if abs(den) < 1e-6 * np.hypot(*d0) * np.hypot(*d1): return None
    t = ((p1[0] - p0[0]) * d1[1] - (p1[1] - p0[1]) * d1[0]) / den
    return p0 + d0 * t


def edge_chain(a, l, a_front, a_back, tol=0.15, minlen=1.5, slope_max=1.0, short=0.8, zone=2.0):
    """The straight pieces of an edge (`l` across at each `a` along) that run with the middle line, from the front plane
    `a_front` to the back plane `a_back`: the edge is cut into pieces (Douglas-Peucker within `tol`); going in from the back,
    the pieces are taken up to the first that begins within `zone` of the front plane and runs across the line's direction
    (further than `slope_max` off it: the end of the block that stands before the front, seen edge-on; a piece under `short`
    is noise and never ends the chain); a piece shorter than `minlen` is taken out, its neighbours meeting where their lines
    do; the first and last pieces are run on to the two planes. -> vertices (n x 2) of (a, l)"""
    P = np.c_[a, l]; V = P[dp_indices(P, tol)]
    first = len(V) - 1
    for k in range(len(V) - 2, -1, -1):
        p, q = V[k], V[k + 1]
        if p[0] < a_front + zone and np.hypot(*(q - p)) >= short and abs((q[1] - p[1]) / (q[0] - p[0] + 1e-9)) > slope_max: break
        first = k
    V = V[first:]
    while len(V) > 2:
        Ls = np.hypot(*np.diff(V, axis=0).T); k = int(np.argmin(Ls))
        if Ls[k] >= minlen: break
        if k == 0: V = V[1:]
        elif k == len(Ls) - 1: V = V[:-1]
        else:
            m = _meet(V[k - 1], V[k] - V[k - 1], V[k + 1], V[k + 2] - V[k + 1])
            mid = (V[k] + V[k + 1]) / 2
            if m is None or np.hypot(*(m - mid)) > 2.5: m = mid
            V = np.vstack([V[:k], m, V[k + 2:]])
    i = 1
    while i < len(V) - 1:                                                  # (a vertex the line goes straight on through)
        d1, d2 = V[i] - V[i - 1], V[i + 1] - V[i]
        cs = (d1 @ d2) / (np.hypot(*d1) * np.hypot(*d2) + 1e-12)
        if cs > np.cos(np.radians(3.0)): V = np.delete(V, i, 0)
        else: i += 1
    s0 = (V[1, 1] - V[0, 1]) / (V[1, 0] - V[0, 0] + 1e-9); V[0] = [a_front, V[0, 1] + s0 * (a_front - V[0, 0])]
    s1 = (V[-1, 1] - V[-2, 1]) / (V[-1, 0] - V[-2, 0] + 1e-9); V[-1] = [a_back, V[-1, 1] + s1 * (a_back - V[-1, 0])]
    return V


def _offset_chain(V, ns, offs):
    """A polyline's lines each moved `offs[i]` along their unit normals `ns[i]`, the pieces meeting where their lines do"""
    k = len(V) - 1
    lines = [(V[i] + ns[i] * offs[i], V[i + 1] - V[i]) for i in range(k)]
    W = [lines[0][0]]
    for i in range(1, k):
        m = _meet(lines[i - 1][0], lines[i - 1][1], lines[i][0], lines[i][1])
        if m is None or np.hypot(*(m - V[i])) > 3.0: m = V[i] + (ns[i - 1] * offs[i - 1] + ns[i] * offs[i]) / 2
        W.append(m)
    W.append(lines[-1][0] + lines[-1][1])
    return np.array(W)


def _clip(W, o, u, a0, a1):
    """a polyline's first and last pieces run to the planes a = a0 and a = a1 (a measured from `o` along `u`)"""
    W = W.copy(); A = (W - o) @ u
    W[0] = W[0] + (W[1] - W[0]) * ((a0 - A[0]) / (A[1] - A[0]))
    W[-1] = W[-2] + (W[-1] - W[-2]) * ((a1 - A[-2]) / (A[-1] - A[-2]))
    return W


def _along(W, o, u, a):
    """the point of a polyline (a increasing along it) at distance `a` along `u` from `o`"""
    A = (W - o) @ u; i = int(np.clip(np.searchsorted(A, a) - 1, 0, len(W) - 2))
    t = (a - A[i]) / (A[i + 1] - A[i] + 1e-12)
    return W[i] + (W[i + 1] - W[i]) * t, i


def corner_funnels(G, l, trenches, polys, T=0.5, cap=6.1, back=0.9, tol=0.15, minlen=1.5, step=0.5, reach=2.0, fence_z=41.4):
    """Each trench's open part as the map draws it: a funnel between the end stand's block and the fan's, its two walls
    fitted to those blocks' end faces (`polys`: the blocks' outlines, metres), so they are not parallel, and begin on one
    plane square to the trench (through the fan's front corner), the front end of both. The two corners are read together (the
    stand is what is a block's outline at either, mirrored), each piece standing as far out and each top as high as either needs:
    the pair are mirror images of each other. A wall is a few straight pieces
    (`edge_chain`), its back against the stand (no tread of the stand is cut), `T` thick into the open space, its top one
    straight rake over a metre above the highest tread within `reach` beyond its back (`raked_top`, no higher than `cap`),
    running `back` metres on past the trench's open cut, into the concourse's slab.
    -> a list, one for each trench, of {'name', 'a_m' (the front plane, from the trench's `o`), 'walls' (cutWalls pieces),
    'mask' (the open floor between the walls), 'cut' (the treads in it, to go), 'pocket' (what is left of the bowl outside them: given back to the stand),
    'zone' (where the stand's edge has the walls: no rail), 'notch' ([(p, q, e)]: the stand's edge between the front fence
    and a wall's front end, e the unit vector into the stand), 'S', 'F' (each wall's back and face lines, world)}"""
    outline = Outlines(polys)
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    tread = (l.R > 0) & (l.band >= 0)
    guard = tread & outline.near(X, Z)                              # (the treads of the blocks themselves: a door's aisle beside a block's end is no part of its end face)
    def inside(x, z):
        """the stand: the blocks as the map draws them (both sides' together)"""
        return outline(x, z)
    pre = []
    for t in trenches:
        o, u, v = (np.asarray(t[k], float) for k in ('o', 'u', 'v'))
        a_p = float(t['open']); a_end = a_p + back
        a = np.arange(-2.0, a_p + 1e-9, 0.02)
        E = {-1: edge_scan(inside, o, u, v, -1, a), 1: edge_scan(inside, o, u, v, 1, a)}
        mm = (a >= -1.5) & (a <= 1.5)
        a_m = float(a[mm][np.argmin(E[1][mm])])                      # (the fan's front corner: the nearest the fan's block comes)
        P_ = {}
        for side in (-1, 1):
            Va = edge_chain(a, E[side], a_m, a_p, tol=tol, minlen=minlen)
            V = o[None, :] + u[None, :] * Va[:, :1] + v[None, :] * Va[:, 1:]
            ns = []
            for i in range(len(V) - 1):
                d = (V[i + 1] - V[i]) / np.hypot(*(V[i + 1] - V[i])); n = np.array([-d[1], d[0]])
                ns.append(n if np.sign(n @ v) == -side else -n)      # (toward the middle line)
            offs = []
            for i in range(len(V) - 1):
                p, q = V[i], V[i + 1]; L = float(np.hypot(*(q - p))); e = (q - p) / L
                c0 = [int(c) for c in G.g(min(p[0], q[0]) - 1.5, min(p[1], q[1]) - 1.5)]; c1 = [int(c) for c in G.g(max(p[0], q[0]) + 1.5, max(p[1], q[1]) + 1.5)]
                sl = (slice(max(min(c0[1], c1[1]), 0), max(c0[1], c1[1]) + 1), slice(max(min(c0[0], c1[0]), 0), max(c0[0], c1[0]) + 1))
                Xs, Zs, Ts = X[sl], Z[sl], guard[sl]
                along = (Xs - p[0]) * e[0] + (Zs - p[1]) * e[1]; dist = (Xs - p[0]) * ns[i][0] + (Zs - p[1]) * ns[i][1]
                m = Ts & (along > 0.2) & (along < L - 0.2) & (dist > -1.0) & (dist < 2.0)
                offs.append(max((float(dist[m].max()) if m.any() else -9.0) + G.res / 2, -0.05))       # (the back 5 cm into the stand)
            P_[side] = (V, ns, offs)
        pre.append((a_m, P_))
    for side in (-1, 1):                                             # (the two corners' walls are alike: each piece as far out as either corner's stand needs)
        if len({len(p[1][side][2]) for p in pre}) == 1:
            mx = np.max([p[1][side][2] for p in pre], axis=0)
            for p in pre: p[1][side] = (p[1][side][0], p[1][side][1], [float(m_) for m_ in mx])
    def lines(t, a_m, P_):
        o, u, v = (np.asarray(t[k], float) for k in ('o', 'u', 'v'))
        a_p = float(t['open']); a_end = a_p + back
        S, F, N = {}, {}, {}
        for side in (-1, 1):
            V, ns, offs = P_[side]
            S[side] = _clip(_offset_chain(V, ns, offs), o, u, a_m, a_end)
            F[side] = _clip(_offset_chain(V, ns, [d_ + T for d_ in offs]), o, u, a_m, a_end)
            N[side] = ns
        return o, u, v, a_p, a_end, S, F, N
    def heights(S, N, o, u, AA):
        """what a wall must clear at each station `AA` along it: a metre over the highest tread within `reach` behind its back"""
        env = []
        for a_ in AA:
            P, i = _along(S, o, u, a_); n = N[min(i, len(N) - 1)]
            best = float(l.h(0)) + 1.0
            for s_ in np.arange(0.05, reach + 0.01, 0.15):
                q = P - n * s_; ii, jj = [int(round(float(c))) for c in G.g(q[0], q[1])]
                if 0 <= ii < G.W and 0 <= jj < G.H and tread[jj, ii]: best = max(best, float(l.h(l.band[jj, ii])) + 1.0)
            env.append(min(best, cap))
        return np.array(env)
    built = [lines(t, a_m, P_) for t, (a_m, P_) in zip(trenches, pre)]
    envs = [{side: heights(b_[5][side], b_[7][side], b_[0], b_[1], np.r_[np.arange(a_m, b_[4], step), b_[4]]) for side in (-1, 1)} for b_, (a_m, _) in zip(built, pre)]
    if len({len(e[1]) for e in envs}) == 1:                          # (alike: each wall as high as either corner's stand asks)
        envs = [{side: np.max([e[side] for e in envs], axis=0) for side in (-1, 1)}] * len(envs)
    out = []
    for t, (a_m, P_), (o, u, v, a_p, a_end, S, F, N), ENV in zip(trenches, pre, built, envs):
        # the open floor and what the bowl has outside the walls
        al = (X - o[0]) * u[0] + (Z - o[1]) * u[1]; la = (X - o[0]) * v[0] + (Z - o[1]) * v[1]
        def lat(W):
            A, Lw = (W - o) @ u, (W - o) @ v
            s0, s1 = (Lw[1] - Lw[0]) / (A[1] - A[0]), (Lw[-1] - Lw[-2]) / (A[-1] - A[-2])
            r = np.interp(al, A, Lw); r = np.where(al < A[0], Lw[0] + s0 * (al - A[0]), r); return np.where(al > A[-1], Lw[-1] + s1 * (al - A[-1]), r)
        lL, lR = lat(S[-1]), lat(S[1])
        between = (la >= lL) & (la <= lR)
        ahead = between & (al >= a_m - 0.3) & (al <= a_p + 0.3)
        mask = ahead.copy()
        cut = ahead & (l.R > 0)                                     # (what treads the model has in the open space besides the blocks' own, a door's aisle beside a block's end: gone, as the walls stand on the blocks' ends)
        pocket = t['bowl'] & (al <= a_p + 0.3) & ~between
        zone = (((la >= lL - 1.0) & (la <= lL + T + 0.3)) | ((la >= lR - T - 0.3) & (la <= lR + 1.0))) & (al >= a_m - 0.2) & (al <= a_end + 0.2)
        # the walls' tops: one rake over each wall's treads
        AA = np.arange(a_m, a_end, step); AA = np.r_[AA, a_end]
        walls, notch = [], []
        for side in (-1, 1):
            env = ENV[side]
            top = np.minimum(raked_top(AA, env), cap)
            br = cv2.approxPolyDP(np.c_[AA, top].astype(np.float32).reshape(-1, 1, 2), 0.02, False)[:, 0, :]
            # the stations along the wall: (a, back point, face point, top, kink?)
            st = []
            As = (S[side] - o) @ u
            for k in range(len(S[side])):
                st.append((float(As[k]), S[side][k], F[side][k], float(np.interp(As[k], AA, top)), k not in (0, len(S[side]) - 1)))
            for ab in br[1:-1, 0]:
                st.append((float(ab), _along(S[side], o, u, ab)[0], _along(F[side], o, u, ab)[0], float(np.interp(ab, AA, top)), False))
            st.sort(key=lambda s: s[0])
            kinks = [i for i, s in enumerate(st) if s[4]]
            cuts = [0] + kinks + [len(st) - 1]
            r3 = lambda w: [round(float(c), 3) for c in w]
            for pi in range(len(cuts) - 1):
                seg = st[cuts[pi]:cuts[pi + 1] + 1]
                walls.append({'name': t['name'], 'pts': [r3([*s[1], s[3]]) for s in seg], 'inner': [r3(s[2]) for s in seg], 'back': [r3(s[1]) for s in seg],
                              'caps': [pi == 0, False]})
            # the stand's edge between the front fence and the wall's front end
            d0 = (S[side][1] - S[side][0]) / np.hypot(*(S[side][1] - S[side][0]))
            if d0[1] > 0.2:
                tf = (S[side][0][1] - fence_z) / d0[1]
                if tf > 0.3: notch.append((S[side][0] - d0 * tf, S[side][0], -N[side][0]))
        out.append({'name': t['name'], 'a_m': a_m, 'walls': walls, 'mask': mask, 'cut': cut, 'pocket': pocket, 'zone': zone, 'notch': notch, 'S': S, 'F': F})
    return out
