# Wembley's seats laid out again, row by row, the way the plan draws them: a
# row's seats one pitch apart from one end of it to the other, between the
# aisles, rather than wherever the tracing of the plan's image found a dash of
# row line (which left gaps wherever a number or the watermark is printed
# over the rows, and seats crowded or spread where it wobbled).
# What the plan draws comes from wb/wb_plan.png (wb_plan.py): its aisles, its
# rows' lines and its lettering, in the stand's frame.
import numpy as np, cv2
from skimage import measure
from scipy.spatial import cKDTree
from standlib import seat_mask

STEP = 0.05             # along a row, the samples' spacing
BRIDGE = 3.0            # a break in a row's line this long or less is lettering or a seat number's gap: seated
BRIDGE_TEXT = 6.0       # ... and this long, if it is mostly lettering (a block's number)
MINCOV = 0.5            # a row the plan only dots (a walkway's rail, a stray of the tracing) is not seated
AISLE_MIN = 0.2         # an aisle across a row: at least this wide
AISLE_MAX = 2.0         # (wider: a tunnel's mouth, a bay; left as the plan draws it)

def plan_bits(G, path='wb/wb_plan.png'):
    P = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    assert P.shape == (G.H, G.W), P.shape
    return {name: tuple(((P >> (3 * k + b)) & 1).astype(bool) for b in range(3)) for k, name in enumerate(('L1', 'L2', 'L5'))}

def _runs(m):
    d = np.diff(np.r_[0, m.astype(np.int8), 0])
    return list(zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]))

def _resample(P, step):
    L = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    s = np.arange(0, L[-1], step)
    return np.c_[np.interp(s, L, P[:, 0]), np.interp(s, L, P[:, 1])]

class Reseat:
    def __init__(s, G, l, bits):
        s.G, s.l = G, l
        s.aisle, s.line, s.text = bits
        gz, gx = l._grad if getattr(l, '_grad', None) is not None else np.gradient(cv2.GaussianBlur(l.d.astype(np.float32), (9, 9), 0))
        s.gx, s.gz = gx, gz
        s.rows = []
        for r in range(l.nrows):
            for C in measure.find_contours(l.d, (r + 0.55) * l.D):
                if len(C) < 20: continue
                Q = _resample(np.c_[C[:, 1] * G.res + G.x0, C[:, 0] * G.res + G.z0], STEP)
                if len(Q) < 10: continue
                g = np.c_[s.at(gx, Q), s.at(gz, Q)]; g /= np.linalg.norm(g, axis=1)[:, None] + 1e-9
                okt = s.at(l.band, Q) == r
                # the plan draws a row as a line along its front
                ev = np.zeros(len(Q), bool)
                for o in np.arange(-0.85 * l.D, -0.35 * l.D + 1e-6, 0.05): ev |= s.at(s.line, Q + g * o)
                s.rows.append(dict(r=r, Q=Q, g=g, okt=okt, ev=ev & okt, ais=s.at(s.aisle, Q) & okt,
                                   txt=s.at(s.text, Q), tree=cKDTree(Q)))
        s.byr = {}
        for i, row in enumerate(s.rows): s.byr.setdefault(row['r'], []).append(i)
    def at(s, A, Q):
        G = s.G
        i = np.clip(np.round((Q[:, 0] - G.x0) / G.res).astype(int), 0, G.W - 1)
        j = np.clip(np.round((Q[:, 1] - G.z0) / G.res).astype(int), 0, G.H - 1)
        return A[j, i]
    def find(s, r, q, tol=0.5):
        best = None
        for ii in s.byr.get(r, []):
            dd, c = s.rows[ii]['tree'].query(q)
            if dd < tol and (best is None or dd < best[0]): best = (dd, ii, c)
        return best
    def aisle_runs(s, row):
        return [(a, b) for a, b in _runs(row['ais']) if (b - a) * STEP >= AISLE_MIN]
    def chains(s):
        # each aisle crossing a row, linked to the one it meets in the next
        # row up (along the depth's gradient, the two overlapping)
        ivs = [(i, a, b) for i, row in enumerate(s.rows) for a, b in s.aisle_runs(row)]
        par = list(range(len(ivs)))
        def root(k):
            while par[k] != k: par[k] = par[par[k]]; k = par[k]
            return k
        at = {}
        for k, (i, a, b) in enumerate(ivs): at.setdefault(i, []).append(k)
        D = s.l.D
        for k, (i, a, b) in enumerate(ivs):
            row = s.rows[i]
            for c in (a, (a + b) // 2, b - 1):
                f = s.find(row['r'] + 1, row['Q'][c] + row['g'][c] * D)
                if f is None: continue
                for k2 in at.get(f[1], []):
                    _, a2, b2 = ivs[k2]
                    if a2 - 2 <= f[2] < b2 + 2: par[root(k)] = root(k2)
        out = {}
        for k in range(len(ivs)): out.setdefault(root(k), []).append(ivs[k])
        return list(out.values())
    def clean_aisles(s):
        # a fleck of the aisles' colour on one row only (an edge of the
        # watermark, the white line along the front) is not an aisle
        n = 0
        for ch in s.chains():
            if len({s.rows[i]['r'] for i, _, _ in ch}) >= 2: continue
            for i, a, b in ch: s.rows[i]['ais'][a:b] = False; n += 1
        return n
    def extend_aisles(s, minlen=3, maxn=40, strays=2):
        # The plan's aisles are straight, front to back; where the watermark
        # hides one for some rows it is carried on along its line for as long
        # as the plan's rows' lines do not cross it (a stray of the tracing in
        # a row or two aside).
        D = s.l.D; tt = np.arange(0.0, 3.0, 0.05); n_ = int(round(0.3 / STEP)); added = 0
        for ch in s.chains():
            rs = np.array([s.rows[i]['r'] for i, _, _ in ch])
            if len(np.unique(rs)) < minlen: continue
            if max((b - a) * STEP for _, a, b in ch) > AISLE_MAX: continue
            C = np.array([s.rows[i]['Q'][(a + b) // 2] for i, a, b in ch])
            u = np.linalg.svd(C - C.mean(0))[2][0]
            hw = int(np.median([(b - a) // 2 for _, a, b in ch]))
            for sg in (1, -1):
                k0 = int(np.argmax(rs * sg)); i0, a0, b0 = ch[k0]; q = s.rows[i0]['Q'][(a0 + b0) // 2]
                v = u if (s.rows[i0]['g'][(a0 + b0) // 2] @ u) * sg > 0 else -u
                r = rs[k0]; pend = []
                for _ in range(maxn):
                    r += sg; want = (r + 0.55) * D
                    cand = q[None, :] + tt[:, None] * v[None, :]
                    dv = s.at(s.l.d, cand); t_ = int(np.argmin(np.abs(dv - want)))
                    if abs(dv[t_] - want) > 0.2: break
                    f = s.find(r, cand[t_])
                    if f is None: break
                    _, ii, c = f; rw = s.rows[ii]
                    if rw['ais'][c] or not rw['okt'][c]: break
                    q = cand[t_]
                    if rw['ev'][max(0, c - n_):c + n_ + 1].any():
                        pend.append((ii, c))
                        if len(pend) > strays: break
                        continue
                    for jj, cc in pend + [(ii, c)]:
                        s.rows[jj]['ais'][max(0, cc - hw):cc + hw + 1] = True; added += 1
                    pend = []
        return added
    def place(s, pitch, end):
        out = []
        for row in s.rows:
            brk = np.zeros(len(row['Q']), bool)
            for a, b in s.aisle_runs(row): brk[a:b] = True
            for a, b in _runs(row['okt'] & ~brk):
                ev = np.nonzero(row['ev'][a:b])[0]
                if not len(ev): continue
                # the row's line, its breaks bridged unless long and plain
                spans = []; s0 = prev = ev[0]
                for e in ev[1:]:
                    gap = (e - prev) * STEP
                    if gap > BRIDGE and not (gap <= BRIDGE_TEXT and row['txt'][a + prev:a + e].mean() > 0.3):
                        spans.append([s0, prev]); s0 = e
                    prev = e
                spans.append([s0, prev])
                spans = [sp for sp in spans if row['ev'][a + sp[0]:a + sp[1] + 1].mean() >= MINCOV]
                if not spans: continue
                # on to the aisle (or the tread's end) where the line stops short of it by a little
                n_ = b - a; e_ = int(round(end / STEP))
                if spans[0][0] * STEP <= BRIDGE: spans[0][0] = min(spans[0][0], e_)
                if (n_ - 1 - spans[-1][1]) * STEP <= BRIDGE: spans[-1][1] = max(spans[-1][1], n_ - 1 - e_)
                for s0, s1 in spans:
                    L = (s1 - s0) * STEP
                    if L < 0: continue
                    n = int(np.floor(L / pitch + 1e-6)) + 1
                    t0 = s0 * STEP + (L - (n - 1) * pitch) / 2
                    for k in range(n):
                        t = (t0 + k * pitch) / STEP + a
                        i0 = int(np.floor(t)); f = t - i0; i1 = min(i0 + 1, len(row['Q']) - 1)
                        q = row['Q'][i0] * (1 - f) + row['Q'][i1] * f; g = row['g'][i0]
                        out.append((q[0], q[1], row['r'], np.arctan2(-g[0], -g[1])))
        return np.array(out)

def reseat(G, l, bits, pitch, end=0.35):
    """Level l's seats laid out again along its rows (l.seats, l.row, l.yaw,
    l.seatmask). Returns (seats, aisles cleaned, aisles carried on)."""
    R = Reseat(G, l, bits)
    nc = R.clean_aisles(); ne = R.extend_aisles()
    S = R.place(pitch, end)
    l.seats, l.row, l.yaw = S[:, :2].copy(), S[:, 2].astype(int), S[:, 3].copy()
    l.seatmask = seat_mask(G, l.seats)
    return len(S), nc, ne
