"""The 200 level's corner passages at floor level. The official map leaves a corridor
of open floor at each of the floor's south corners, between the end stand's last
column and the corner fan of blocks: it flares out at the floor into a bowl and narrows
to a throat, a good 7 m across where the map's blocks stand clear of it. Here the
corridor becomes a straight trench like a stadium's corner tunnel: 7 m wide, two
parallel walls with a thick body, their tops raked with the rows beside them, the
rows ending flush against them, an open cut into the stand and on, covered, under
the concourse to the building's wall. The trench is laid along the map's own
corridor (the way the doors at its head, 240 and 211, face), as near the bowl's
sides as it can be so that no seat is cut; what the bowl has beyond the trench is
given back to the stand (the rows that go on into it, bare)."""
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


def corner_trenches(G, l, floor_half=(25.9, 41.3), front=41.5, width=7.0, theta=25.0, wmin=7.4):
    """The trenches at the floor's south corners (the north corners lie behind the stage). Each is a strip `width` wide,
    its middle line leaning `theta` degrees outward from the end stand's line, as the doors at the corridor's head face.
    Its place across is where the least is cut of the stand (a seat low enough to be under the trench's roof counts three,
    a square metre of the bowl left outside it one: that is given back to the stand), halfway across the places that tie.
    -> a list of {'name', 'sx', 'o' (the middle of its front, on the end stand's front line `front`), 'u' (along it),
    'v' (across it, outward), 'w', 'am' (how far in the bowl's own throat is: where the concourse begins), 'strip' (its mask
    from the front on), 'pocket' (the bowl outside it), 'bowl', 'cuts' (seats cut)}"""
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    floor, hull = floor_void(G, l)
    hx, hz = floor_half; out = []
    th = np.radians(theta)
    for name, sx in (('SE', 1), ('SW', -1)):
        corner = np.array([sx * hx, hz]); bowl, u0 = bowl_axis(G, floor, corner, hx, hz)
        if bowl is None: continue
        last, _ = trace_bowl(G, floor, corner, u0, wmin=wmin)
        if last is None: continue
        pold = last[0] - u0 * 0.3                                  # (the throat, where the concourse's floor begins)
        bowl = bowl & ((X - pold[0]) * u0[0] + (Z - pold[1]) * u0[1] <= 0.3) & (Z >= front)
        u = np.array([sx * np.sin(th), np.cos(th)]); v = np.array([u[1], -u[0]]) * sx
        low = l.h(l.row) < 5.6                                     # a seat on a row under the roof's height
        res = []
        for xc in np.arange(17.5, 26.0, 0.25) * sx:
            o = np.array([xc, front])
            al = (X - o[0]) * u[0] + (Z - o[1]) * u[1]; la = (X - o[0]) * v[0] + (Z - o[1]) * v[1]
            strip = (np.abs(la) <= width / 2) & (Z >= front) & (al >= -2.0)
            q = l.seats - o
            cut = (np.abs(q @ v) < width / 2 + 0.3) & ((q @ u) > -2.0) & low & (l.seats[:, 1] >= front)
            pocket = bowl & ~strip
            res.append((3 * int(cut.sum()) + float(pocket.sum() * G.res ** 2), xc, int(cut.sum())))
        best = min(r[0] for r in res)
        tie = [r for r in res if r[0] <= best + 1.0]
        xc = float(np.median([r[1] for r in tie])); xc = min((r[1] for r in tie), key=lambda c: abs(c - xc))
        o = np.array([xc, front])
        al = (X - o[0]) * u[0] + (Z - o[1]) * u[1]; la = (X - o[0]) * v[0] + (Z - o[1]) * v[1]
        strip = (np.abs(la) <= width / 2) & (Z >= front) & (al >= -2.0)
        am = float((pold - o) @ u)
        out.append({'name': name, 'sx': sx, 'o': o, 'u': u, 'v': v, 'w': width, 'am': am, 'pold': pold, 'strip': strip,
                    'pocket': bowl & ~strip, 'bowl': bowl, 'cuts': [r[2] for r in res if r[1] == xc][0]})
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
