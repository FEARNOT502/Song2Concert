"""The 200 level's corner passages at floor level. The official map leaves a bowl of
open floor at each corner of the floor, funnelling in between the fan's blocks to a
throat: there the passage goes on as a wide tunnel (an open cut, then under the
rows), out to the building. Here the bowl is found from the stand's treads, its
middle line followed in to the throat where it is no wider than the tunnel (the
tunnel's mouth), and the bowl's sides given thick walls whose tops are raked with
the rows."""
import numpy as np, cv2
from standlib import disk
from scipy.ndimage import gaussian_filter1d, maximum_filter1d


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


def flank_heights(G, l, x, u, w):
    """the treads' height each side of the open space at x (the nearest tread beyond a half width)"""
    n_ = np.array([-u[1], u[0]]); out = []
    for sg in (1, -1):
        h = 0.0
        for t in np.arange(max(0.5, w / 2 - 0.5), w / 2 + 3.5, 0.1):
            q = x + n_ * sg * t; a, b = [int(round(float(c))) for c in G.g(q[0], q[1])]
            if 0 <= a < G.W and 0 <= b < G.H and l.R[b, a] and l.band[b, a] >= 0: h = float(l.h(l.band[b, a])); break
        out.append(h)
    return out


def corner_tunnels(G, l, floor_half=(25.9, 41.3), roof=5.0, wmin=7.4, tw=(7.0, 8.0)):
    """The tunnels at the floor's south corners (the north corners lie behind the stage): for each, its mouth `p`
    (where the bowl of open floor in the corner has narrowed to a tunnel's width, `wmin`: a wide one, like a
    stadium's corner tunnels, running on straight out under the rows and the concourse), `u` out, width `w`"""
    floor, hull = floor_void(G, l)
    hx, hz = floor_half; out = []
    for name, sx in (('SE', 1), ('SW', -1)):
        corner = np.array([sx * hx, hz]); bowl, u = bowl_axis(G, floor, corner, hx, hz)
        if bowl is None: continue
        last, pts = trace_bowl(G, floor, corner, u, wmin=wmin)
        if last is None: continue
        p, w = last; p = p - u * 0.3
        out.append({'name': name, 'corner': corner, 'p': p, 'u': u, 'w': float(np.clip(round(w, 1), *tw)), 'bowl': bowl, 'axis': pts, 'floor': floor})
    return out


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


def facets(P, nrm, top, tol=0.8, T0=0.5, off=0.03, minlen=2.5):
    """A run of an outline as straight walls. `P` (N x 2): points along the stand's edge, `nrm`: the unit vectors out into
    the open space there, `top`: each point's wall height. The outline is simplified within `tol` to a few straight
    pieces (none shorter than `minlen`); each piece's wall stands on a line pushed out into the open space just far enough
    that the stand is never cut (at least the line through the piece's ends), is `T0` thick beyond that line, and its body
    fills whatever lies between the line and the stand's edge. The pieces meet at mitred corners. -> [{'pts': [(x, z, top),
    ...] along the stand's edge, 'inner': [(x, z), ...] the wall's face in the open space (a point for each), 'back':
    [(x, z), ...] the line `T0` behind that face (the width of the coping), 'caps': [start, end] whether the piece's end
    shows}]"""
    idx = dp_indices(P, tol)
    while len(idx) > 2:                                   # a piece too short is merged into its neighbour
        ln = [float(np.hypot(*(P[idx[k + 1]] - P[idx[k]]))) for k in range(len(idx) - 1)]
        k = int(np.argmin(ln))
        if ln[k] >= minlen: break
        idx = np.delete(idx, k + 1 if k + 1 < len(idx) - 1 else k)
    m = len(idx) - 1
    A, nv, c = [], [], []
    for k in range(m):
        a, b = idx[k], idx[k + 1]
        d = (P[b] - P[a]) / (np.hypot(*(P[b] - P[a])) + 1e-12)
        n_ = np.array([-d[1], d[0]])
        if (nrm[a:b + 1] @ n_).mean() < 0: n_ = -n_
        A.append(P[a]); nv.append(n_)
        c.append(max(0.0, float(((P[a:b + 1] - P[a]) @ n_).max())))      # how far out the face stands from the piece's chord
    def corners(dist):
        """the face's corners at `dist` beyond the chords: where two of its lines meet (the ends: straight out from the stand's edge)"""
        V = []
        for k in range(m + 1):
            if k == 0: V.append(P[idx[0]] + nv[0] * (c[0] + dist - (P[idx[0]] - A[0]) @ nv[0]))
            elif k == m: V.append(P[idx[m]] + nv[m - 1] * (c[m - 1] + dist - (P[idx[m]] - A[m - 1]) @ nv[m - 1]))
            else:
                n1, n2 = nv[k - 1], nv[k]; M = np.array([n1, n2]); q = None
                if abs(float(np.linalg.det(M))) > 0.25:
                    q = np.linalg.solve(M, np.array([c[k - 1] + dist + n1 @ A[k - 1], c[k] + dist + n2 @ A[k]]))
                    if np.hypot(*(q - P[idx[k]])) > 2.5 + dist: q = None
                if q is None:                              # (nearly straight on, or too sharp to mitre)
                    q1 = P[idx[k]] + n1 * (c[k - 1] + dist - (P[idx[k]] - A[k - 1]) @ n1); q2 = P[idx[k]] + n2 * (c[k] + dist - (P[idx[k]] - A[k]) @ n2)
                    q = (q1 + q2) / 2
                V.append(q)
        return V
    V, W = corners(T0), corners(0.0)
    out = []
    for k in range(m):
        a, b = idx[k], idx[k + 1]
        def along(e0, e1):
            L2_ = float((e1 - e0) @ (e1 - e0)) + 1e-9
            q = [e0 + (e1 - e0) * float(np.clip(((P[i] - e0) @ (e1 - e0)) / L2_, 0, 1)) for i in range(a, b + 1)]
            q[0], q[-1] = e0, e1
            return np.array(q)
        out.append({'pts': np.c_[[P[i] + nv[k] * off for i in range(a, b + 1)], top[a:b + 1]], 'inner': along(V[k], V[k + 1]),
                    'back': along(W[k], W[k + 1]), 'caps': [k == 0, k == m - 1]})
    return out


def bowl_walls(G, l, tunnels, rail=1.0, off=0.03, step=0.3, gap=1.0, T=0.5, tol=0.8, minlen=2.5):
    """Walls round each bowl of open floor where it meets treads, full height from the floor, each of a few straight
    pieces (see `facets`) `T` thick or more, the whole run's top one raked line over the treads' (a metre over them: see
    `raked_top`). -> [{'name', 'pts': [(x, z, top), ...], 'inner': [(x, z), ...], 'back': [(x, z), ...], 'caps': [start,
    end]}], masks"""
    from scipy.ndimage import distance_transform_edt
    R = (l.R > 0); out = []; masks = []
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    for t in tunnels:
        u = t['u']; al = (X - t['p'][0]) * u[0] + (Z - t['p'][1]) * u[1]
        bowl = t['bowl'] & (al <= 0.3)
        bowl = cv2.morphologyEx(bowl.astype(np.uint8), cv2.MORPH_CLOSE, disk(0.6 / G.res)) > 0
        masks.append(bowl)
        sd = distance_transform_edt(bowl) - distance_transform_edt(~bowl)       # + inside the open space
        gz_, gx_ = np.gradient(cv2.GaussianBlur(sd.astype(np.float32), (0, 0), 3))
        cs, _ = cv2.findContours(bowl.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if not cs: continue
        c = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float64)
        d = np.r_[0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))] * G.res
        n = max(8, int(d[-1] / step)); s = np.linspace(0, d[-1], n)
        px = np.interp(s, d, c[:, 0]); py = np.interp(s, d, c[:, 1])
        P = np.c_[G.m(px, py)]
        # the traced outline wobbles by a pixel or two: eased along its length (the straight pieces are fitted to it)
        P = np.c_[gaussian_filter1d(P[:, 0], 1.0, mode='wrap'), gaussian_filter1d(P[:, 1], 1.0, mode='wrap')]
        hts = np.full(len(P), np.nan); nrm = np.zeros_like(P)
        nv = np.array([-u[1], u[0]])
        for i, (x, z) in enumerate(P):
            a, b = [int(round(float(v))) for v in G.g(x, z)]
            g_ = np.array([gx_[b, a], gz_[b, a]]); nrm[i] = g_ / (np.linalg.norm(g_) + 1e-9)
            # the tunnel's mouth is left open: no wall across it
            if abs((np.array([x, z]) - t['p']) @ nv) < t['w'] / 2 + 0.12 and (np.array([x, z]) - t['p']) @ u > -0.6: continue
            # the tread the open space ends against: the nearest tread cell within `gap`
            best = None
            for r in np.arange(0.1, gap + 0.01, 0.1):
                for ang in np.radians(np.arange(0, 360, 20)):
                    qx, qz = x + r * np.cos(ang), z + r * np.sin(ang); a, b = [int(round(float(v))) for v in G.g(qx, qz)]
                    if 0 <= a < G.W and 0 <= b < G.H and R[b, a] and l.band[b, a] >= 0: best = float(l.h(l.band[b, a])); break
                if best is not None: break
            if best is not None: hts[i] = best
        ag = ~np.isnan(hts)
        # runs of points against treads (the outline's other parts are the open floor's edge: no wall)
        idx = np.nonzero(ag)[0]
        if not len(idx): continue
        runs = np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1)
        # join a run across the wrap-around
        if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == len(P) - 1: runs[0] = np.r_[runs[-1], runs[0]]; runs = runs[:-1]
        for run in runs:
            if len(run) < 3: continue
            q = P[run]; sl = np.r_[0, np.cumsum(np.hypot(*np.diff(q, axis=0).T))]
            # the height to clear: a metre over the treads (the highest within a couple of metres along the wall), the wall's
            # top one straight rake over that
            env = maximum_filter1d(hts[run] + rail, size=max(3, int(2.4 / step)), mode='nearest')
            top = raked_top(sl, env)
            for f in facets(q, nrm[run], top, tol=tol, T0=T, off=off, minlen=minlen):
                r2 = lambda v: [round(float(c), 2) for c in v]
                out.append({'name': t['name'], 'pts': [r2(p) for p in f['pts']], 'inner': [r2(p) for p in f['inner']], 'back': [r2(p) for p in f['back']], 'caps': f['caps']})
    return out, masks
