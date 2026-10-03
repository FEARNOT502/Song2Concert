"""The 200 level's corner passages at floor level. The official map leaves a corridor
of open floor at each of the floor's south corners, between the end stand's last
column and the corner fan of blocks: it flares out at the floor into a bowl and narrows
to a throat, a good 7 m across where the map's blocks stand clear of it. Here the
corridor becomes a straight trench like a stadium's corner tunnel: 7 m wide, two
parallel walls with a thick body, their tops raked with the rows beside them, the
rows ending flush against them, an open cut into the stand and on, covered, under
the concourse to the building's wall. The trench leans out along the diagonal the
bowl lies on, as near the bowl's sides as it can be so that next to no seat is cut,
the pair mirror images of each other, each trench's two walls alike; what the bowl
has beyond the trench is given back to the stand (the rows that go on into it, bare)."""
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
    """The trenches at the floor's south corners (the north corners lie behind the stage), parallel and symmetric: the
    pair are mirror images of each other about the arena's middle line, and each is a strip `width` wide with two
    identical walls, symmetric about its own middle line, its mouth square across it. The middle line leans `theta` degrees
    outward from the end stand's line, a diagonal as the old model's tunnels (45) ran; 0 would be straight back, a rectangle
    in plan. The map's void at the corner (the bowl) is a funnel whose fan-side edge is a diagonal of 44 degrees and whose
    end-stand side stands near upright; a strip leaning about 32 lies along it, between the two.
    Across, the strip stands where it costs least, the two corners together (a seat cut counts three, a square metre of the
    bowl left outside the strip one, that being given back to the stand, a metre of stand standing in the way of the mouth
    sixty, a metre that a wall begins later than the stand beside it does one), the middle of the places that tie.
    The walls begin on one plane square to the strip (`a0`): the later of the four places where a stand begins beside a
    wall; what the stand has ahead of the plane on the other side goes on as a step edge along the wall's line. Both open
    cuts run as far as the longer needs (the treads under the roof's height, or the bowl's own length).
    -> a list of {'name', 'sx', 'o' (the middle line's point where the open cut begins), 'u' (along it), 'v' (across it,
    outward), 'w', 'open' (the open cut's length from `o`), 'a0' (where the walls begin, from `o`), 'strip' (its mask),
    'pocket' (the bowl outside it), 'bowl', 'cuts' (seats cut), 'xc' (where its middle line meets the front line)}"""
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
        m = part & (d_new >= 0.0)
        l.d[m] = d_new[m]; l.R[m] = 1
        l.band[m] = np.clip(np.floor(d_new[m] / l.D).astype(int), 0, l.nrows - 1)
        filled |= m
    return filled


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
