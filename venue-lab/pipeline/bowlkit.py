# Shared helpers for the bowls laid out as exact planes (insp_build.py,
# kspo_build.py): stairs between concourses, found where they fit, and the
# lines along the fronts of the tiers.
import numpy as np, cv2

RISE, RUN, WID = 0.19, 0.28, 1.6

def footprint(x0, z0, dx, dz, L, w, step=0.2):
    ts = np.arange(0, L + 1e-6, step); ws = np.arange(-w / 2, w / 2 + 1e-6, step)
    T, Wd = np.meshgrid(ts, ws)
    return np.c_[(x0 + dx * T - dz * Wd).ravel(), (z0 + dz * T + dx * Wd).ravel()]

class Flights:
    """Straight flights between concourse floors, clear of every stand."""
    def __init__(s, G, levels):
        s.G = G; s.used = np.zeros((G.H, G.W), bool); s.out = []
        s.ZL = []
        for l in levels:
            r = np.maximum(l.band, 0); top = l.h0 + l.rise * r
            if callable(l.bottom): bot = np.vectorize(lambda rr, hh: l.bottom(rr, hh))(r, top)
            elif l.bottom == 'ground': bot = np.zeros_like(top)
            else: bot = top - np.where(r == 0, l.fascia, l.bottom)
            s.ZL.append((l.band >= 0, bot, top))
    def _idx(s, pts):
        G = s.G; gx, gz = G.g(pts[:, 0], pts[:, 1])
        return np.round(gx).astype(int), np.round(gz).astype(int)
    def fits(s, mask, pts):
        gx, gz = s._idx(pts); G = s.G
        ok = (gx >= 0) & (gx < G.W) & (gz >= 0) & (gz < G.H)
        return ok.all() and mask[gz, gx].all()
    def clear(s, pts, y0, y1):
        gx, gz = s._idx(pts); G = s.G
        if not ((gx >= 0) & (gx < G.W) & (gz >= 0) & (gz < G.H)).all(): return False
        for on, bot, top in s.ZL:
            o = on[gz, gx]
            if not o.any(): continue
            if ((bot[gz, gx][o] < y1 + 2.2) & (top[gz, gx][o] > y0 - 0.2)).any(): return False
        return True
    def find(s, lower, upper, y0, y1, near, dirs=None, rmax=30):
        n = int(np.ceil((y1 - y0) / RISE)); L = n * RUN
        dirs = dirs or [(np.cos(t), np.sin(t)) for t in np.linspace(0, 2 * np.pi, 24, endpoint=False)]
        free = ~s.used
        for r in np.arange(0, rmax, 0.8):
            for a in np.linspace(0, 2 * np.pi, max(8, int(r * 4)), endpoint=False):
                x0 = near[0] + r * np.cos(a); z0 = near[1] + r * np.sin(a)
                for dx, dz in dirs:
                    fp = footprint(x0, z0, dx, dz, L, WID); top = footprint(x0 + dx * L, z0 + dz * L, dx, dz, 1.8, WID)
                    if s.fits(lower, fp) and s.fits(upper, top) and s.fits(free, fp) and s.fits(free, top) \
                            and s.clear(fp, y0, y1) and s.clear(top, y1, y1):
                        f = dict(x=float(x0), z=float(z0), dx=float(dx), dz=float(dz), n=n, L=L, y0=y0, y1=y1)
                        s.mark(f); s.out.append(f)
                        return f
        return None
    def mark(s, f):
        G = s.G
        for fp in (footprint(f['x'], f['z'], f['dx'], f['dz'], f['L'], WID + 1.2, 0.1),
                   footprint(f['x'] + f['dx'] * f['L'], f['z'] + f['dz'] * f['L'], f['dx'], f['dz'], 2.2, WID + 1.2, 0.1),
                   footprint(f['x'] - f['dx'] * 2, f['z'] - f['dz'] * 2, f['dx'], f['dz'], 2.2, WID + 1.2, 0.1)):
            gx, gz = s._idx(fp); gx = np.clip(gx, 0, G.W - 1); gz = np.clip(gz, 0, G.H - 1)
            s.used[gz, gx] = True
    def cut(s, floors):
        """Each floor the flights rise through is cut away over them, leaving
        the top landing. `floors`: [(mask, y)]."""
        G = s.G
        for f in s.out:
            fp = footprint(f['x'], f['z'], f['dx'], f['dz'], f['L'] - 0.3, WID + 0.4, step=0.05)
            gx, gz = s._idx(fp); gx = np.clip(gx, 0, G.W - 1); gz = np.clip(gz, 0, G.H - 1)
            for m, y in floors:
                # the floor the flight rises through, and the one it arrives on
                # (over its run; its landing, beyond, is kept)
                if f['y0'] < y <= f['y1'] + 0.01: m[gz, gx] = False
        return s.out

def front_segments(polys_by_face, lines):
    """The front edge of each polygon on its own front line, as segments."""
    out = []
    for poly, f, dF in polys_by_face:
        P = np.array(poly.exterior.coords)[:-1]
        on = np.abs(P @ f + dF) < 0.05
        idx = np.nonzero(on)[0]
        if len(idx) >= 2:
            pts = P[idx]; u = np.array([-f[1], f[0]]); s_ = pts @ u
            a, b = pts[np.argmin(s_)], pts[np.argmax(s_)]
            out.append([[round(float(a[0]), 2), round(float(a[1]), 2)], [round(float(b[0]), 2), round(float(b[1]), 2)]])
    return out
