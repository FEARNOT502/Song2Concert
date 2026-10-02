"""The 200 level's corner passages at floor level. The official map leaves a bowl of
open floor at each corner of the floor, funnelling in between the fan's blocks to a
throat where the rows beside it rise past a tunnel's height: there the passage
goes on as a tunnel under the rows, out to the building. Here the bowl is found
from the stand's treads, its middle line followed in to the throat (the tunnel's
mouth), and the bowl's sides given walls whose tops are raked with the rows."""
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


def corner_tunnels(G, l, floor_half=(25.9, 41.3), roof=5.0, tw=(3.0, 5.0)):
    """The tunnels at the floor's south corners (the north corners lie behind the stage): for each, its mouth `p`
    (the throat of the bowl of open floor in the corner, where the rows each side stand past a tunnel's height),
    `u` out, width `w`"""
    floor, hull = floor_void(G, l)
    hx, hz = floor_half; out = []
    for name, sx in (('SE', 1), ('SW', -1)):
        corner = np.array([sx * hx, hz]); bowl, u = bowl_axis(G, floor, corner, hx, hz)
        if bowl is None: continue
        last, pts = trace_bowl(G, floor, corner, u)
        if last is None: continue
        p, w = last; p = p - u * 0.3
        out.append({'name': name, 'corner': corner, 'p': p, 'u': u, 'w': float(np.clip(round(w - 0.2, 1), *tw)), 'bowl': bowl, 'axis': pts, 'floor': floor})
    return out


def bowl_walls(G, l, tunnels, rail=1.0, off=0.05, step=0.3, gap=1.0):
    """Walls round each bowl of open floor where it meets treads, full height from the floor, each top following the
    treads' (a metre over them) but eased along the wall, so that it rakes with the rows instead of stepping with
    them. -> [{'name', 'pts': [(x, z, top), ...]}] (each point `off` out into the open space)"""
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
        # the traced outline wobbles by a pixel or two: eased along its length (a wall, not a ragged edge)
        P = np.c_[gaussian_filter1d(P[:, 0], 2.0, mode='wrap'), gaussian_filter1d(P[:, 1], 2.0, mode='wrap')]
        hts = np.full(len(P), np.nan)
        for i, (x, z) in enumerate(P):
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
            if len(run) < 4: continue
            q = P[run]; h = hts[run] + rail
            # eased: the top a metre over the treads' envelope, smoothed along the wall (a rake, not steps)
            env = maximum_filter1d(h, size=max(3, int(2.4 / step)), mode='nearest')
            top = gaussian_filter1d(env, sigma=max(1.0, 0.9 / step), mode='nearest')
            top = np.maximum(top, h - 0.1)
            # out into the open space
            pts = []
            for (x, z), tp in zip(q, top):
                a, b = [int(round(float(v))) for v in G.g(x, z)]
                gn = np.array([gx_[b, a], gz_[b, a]]); gn /= np.linalg.norm(gn) + 1e-9
                pts.append([round(float(x + gn[0] * off), 2), round(float(z + gn[1] * off), 2), round(float(tp), 2)])
            out.append({'name': t['name'], 'pts': pts})
    return out, masks
