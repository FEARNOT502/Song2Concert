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
LATE_WIN = 6.0          # a block's rows drawn half a row back: judged over this square,
LATE_LO, LATE_HI = 0.4, 0.7   # by the share of its treads finding their line where it should be (less) and half a row back (more)

def plan_bits(G, path='wb/wb_plan.png'):
    P = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    assert P.shape == (G.H, G.W), P.shape
    # (aisle, line, lettering, and the big lettering over the rows: a block's number, the watermark)
    return {name: tuple(((P >> (3 * k + b)) & 1).astype(bool) for b in range(3)) + (((P >> (9 + k)) & 1).astype(bool),)
            for k, name in enumerate(('L1', 'L2', 'L5'))}

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
        s.aisle, s.line, s.text, s.big = bits
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
                # the plan draws a row as a line along its front (and, in a few
                # blocks, half a row further back: ev2, see _late)
                ev, ev2 = np.zeros(len(Q), bool), np.zeros(len(Q), bool)
                for o in np.arange(-0.85 * l.D, -0.35 * l.D + 1e-6, 0.05): ev |= s.at(s.line, Q + g * o)
                for o in np.arange(-0.35 * l.D, 0.15 * l.D + 1e-6, 0.05): ev2 |= s.at(s.line, Q + g * o)
                s.rows.append(dict(r=r, Q=Q, g=g, okt=okt, ev=ev & okt, ev2=ev2 & okt, ais=s.at(s.aisle, Q) & okt,
                                   txt=s.at(s.text, Q), tree=cKDTree(Q)))
        s.byr = {}
        for i, row in enumerate(s.rows): s.byr.setdefault(row['r'], []).append(i)
        s._late()
    def _late(s):
        # Where a whole block's rows find their lines half a row further back
        # than the treads put them (Level 5's 519 and 533 throughout, and
        # parts of 509 and 539: the plan's rows there are drawn off by that
        # much), its rows are taken from those; before, none of them was
        # seated. By the block, not the row: elsewhere a tread between two
        # of the plan's rows finds the next one's line there, and is not one.
        G = s.G; n, e1, e2 = (np.zeros((G.H, G.W), np.float32) for _ in range(3))
        for row in s.rows:
            m = row['okt']; Q = row['Q'][m]
            i = np.clip(np.round((Q[:, 0] - G.x0) / G.res).astype(int), 0, G.W - 1)
            j = np.clip(np.round((Q[:, 1] - G.z0) / G.res).astype(int), 0, G.H - 1)
            np.add.at(n, (j, i), 1); np.add.at(e1, (j, i), row['ev'][m]); np.add.at(e2, (j, i), row['ev2'][m])
        k = int(round(LATE_WIN / G.res)) | 1
        n, e1, e2 = (cv2.blur(a, (k, k)) for a in (n, e1, e2))
        late = (n > 0) & (e1 < LATE_LO * n) & (e2 > LATE_HI * n)
        for row in s.rows:
            lt = s.at(late, row['Q']); row['ev'] = np.where(lt, row['ev2'], row['ev'])
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
    def neighbours(s, row, dr):
        # for each of the row's samples, the sample of row r+dr straight up
        # (or down) the rake from it, and whether there is one
        D = s.l.D; idx = np.full(len(row['Q']), -1); which = np.full(len(row['Q']), -1)
        cands = s.byr.get(row['r'] + dr, [])
        if not cands: return idx, which
        P = row['Q'] + row['g'] * (dr * D)
        best = np.full(len(P), np.inf)
        for ii in cands:
            d_, c_ = s.rows[ii]['tree'].query(P)
            take = (d_ < 0.35) & (d_ < best)
            best[take] = d_[take]; idx[take] = c_[take]; which[take] = ii
        return idx, which
    def vote(s, passes=3):
        """What the plan hides under its lettering, read off the rows either side:
        - a stair aisle whose row numbers (teal, printed over the aisle) or
          the watermark hide it in a row or two: where the rows below and
          above both have the aisle, so does this one (else a seat or two
          stood in the aisle);
        - a row whose line a block's number or the watermark covers: where
          the rows below and above both have their line, so does this one
          (else the row stood empty across the block's middle).
        Only between the two: an aisle that starts or a row that ends is
        left as the plan draws it."""
        nf = na = 0
        for _ in range(passes):
            new_ais, new_ev = [], []
            for row in s.rows:
                okt = row['okt']
                up = [s.neighbours(row, d) for d in (1, 2, 3, 4, 5)]; dn = [s.neighbours(row, -d) for d in (1, 2, 3, 4, 5)]
                def has(nb, key):
                    i, w = nb; out = np.zeros(len(i), bool)
                    for ii in np.unique(w[w >= 0]):
                        m = w == ii; out[m] = s.rows[ii][key][i[m]]
                    return out
                a_up = has(up[0], 'ais') | has(up[1], 'ais'); a_dn = has(dn[0], 'ais') | has(dn[1], 'ais')
                # (Level 1's block numbers cover up to five rows: a line is looked for up to five rows away)
                e_up = np.logical_or.reduce([has(n_, 'ev') for n_ in up]); e_dn = np.logical_or.reduce([has(n_, 'ev') for n_ in dn])
                ais = row['ais'] | (a_up & a_dn & okt)
                # (only lines the plan's lettering or its watermark could hide)
                # (the rows' own lines under the lettering: see fill_holes, on the seats once laid)
                ev = row['ev'] | (e_up & e_dn & okt & ~ais & s.near_text(row) & s.bounded(row, ais, 2.5))
                na += int((ais & ~row['ais']).sum()); nf += int((ev & ~row['ev']).sum())
                new_ais.append(ais); new_ev.append(ev)
            for row, a, e in zip(s.rows, new_ais, new_ev): row['ais'] = a; row['ev'] = e
        return na, nf
    def near_text(s, row):
        if 'txtn' not in row:
            t = np.zeros(len(row['Q']), bool)
            for o in np.arange(-1.5, 1.51, 0.25) * s.l.D: t |= s.at(s.text, row['Q'] + row['g'] * o)
            # (a word's letters are apart: a run of lettering, bridged across its gaps)
            k = int(round(3.0 / STEP)); t = np.convolve(t.astype(float), np.ones(k), 'full')[k // 2:k // 2 + len(t)] > 0
            row['txtn'] = t
        return row['txtn']
    def near_big(s, row):
        if 'bign' not in row:
            t = np.zeros(len(row['Q']), bool)
            for o in np.arange(-1.0, 1.01, 0.25) * s.l.D: t |= s.at(s.big, row['Q'] + row['g'] * o)
            row['bign'] = t
        return row['bign']
    def bounded(s, row, ais, maxlen=7.0):
        # samples in a hole in the row's own line, the line drawn on both sides
        # of it within the same stretch between aisles, the hole no longer than
        # maxlen (a block's number; not a walkway, which has no line at all, nor
        # a stretch the plan leaves unseated across a block)
        ev = row['ev']; ok = row['okt'] & ~ais; out = np.zeros(len(ev), bool)
        for a, b in _runs(ok):
            e = np.nonzero(ev[a:b])[0]
            if len(e) < 2: continue
            for i, j in zip(e[:-1], e[1:]):
                if 1 < j - i <= maxlen / STEP: out[a + i + 1:a + j] = True
        return out
    def fill_holes(s, S, pitch, maxlen=7.0, reach=3, tol=0.45):
        """Holes in a row's seats that the rows round it do not have, seated:
        where the plan's lettering (a block's number, the watermark) hides a
        row's line, or its rows are drawn a row or two off the stand's, a row
        stood empty across the middle of a block. A hole (1.2 m to maxlen
        long) is seated when, within `reach` rows up and down, a row is seated
        all the way across it (so a vomitory's mouth, a walkway or an aisle,
        empty in the rows round it too, is left). And a seat or two standing
        alone where the rows either side have an aisle is taken out (the plan's
        row numbers printed over a stair hid its aisle in that row).
        S: (x, z, r, yaw) -> S with the holes seated and the strays gone."""
        D = s.l.D; R_ = S[:, 2].astype(int)
        trees = {r: cKDTree(S[R_ == r, :2]) for r in np.unique(R_)}
        def seated(r, P):
            t = trees.get(r)
            return t is not None and (t.query(P)[0] < tol).all()
        add, drop = [], np.zeros(len(S), bool)
        for ii, row in enumerate(s.rows):
            r = row['r']
            m = np.nonzero(R_ == r)[0]
            if not len(m): continue
            d_, c_ = row['tree'].query(S[m, :2]); on = d_ < 0.3
            m, c_ = m[on], c_[on]
            if len(m) < 2: continue
            o = np.argsort(c_); m, c_ = m[o], c_[o]
            for k in range(len(m) - 1):
                L_ = (c_[k + 1] - c_[k]) * STEP
                if not (2.0 * pitch < L_ <= maxlen): continue
                ts = np.linspace(c_[k], c_[k + 1], max(3, int(L_ / 0.5)))[1:-1].round().astype(int)
                Q, g = row['Q'][ts], row['g'][ts]
                up = any(seated(r + j, Q + g * (j * D)) for j in range(1, reach + 1))
                dn = any(seated(r - j, Q - g * (j * D)) for j in range(1, reach + 1))
                if not (up and dn): continue
                n = int(round(L_ / pitch)) - 1
                for j in range(1, n + 1):
                    t = c_[k] + (c_[k + 1] - c_[k]) * j / (n + 1)
                    i0 = int(np.floor(t)); f = t - i0; i1 = min(i0 + 1, len(row['Q']) - 1)
                    q = row['Q'][i0] * (1 - f) + row['Q'][i1] * f; gg = row['g'][i0]
                    add.append((q[0], q[1], r, np.arctan2(-gg[0], -gg[1])))
            # strays: a run of one or two seats, the rows either side empty there
            gaps = np.r_[np.inf, np.diff(c_) * STEP, np.inf]
            k = 0
            while k < len(m):
                j = k
                while j + 1 < len(m) and gaps[j + 1] < 1.6 * pitch: j += 1
                if j - k <= 1 and gaps[k] > 1.0 and gaps[j + 1] > 1.0:
                    P = S[m[k:j + 1], :2]; gg = row['g'][c_[k:j + 1]]
                    empty = lambda rr, Pq: rr not in trees or (trees[rr].query(Pq)[0] > 0.45).all()
                    if empty(r - 1, P - gg * D) and empty(r + 1, P + gg * D): drop[m[k:j + 1]] = True
                k = j + 1
        out = S[~drop]
        if add: out = np.r_[out, np.array(add)]
        return out, len(add), int(drop.sum())
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
    nv = R.vote()
    print('  vote: aisle samples opened', nv[0], 'line samples filled', nv[1])
    S = R.place(pitch, end)
    for _ in range(2):
        S, na_, nd_ = R.fill_holes(S, pitch)
        print('  holes seated', na_, 'strays taken out', nd_)
    l.seats, l.row, l.yaw = S[:, :2].copy(), S[:, 2].astype(int), S[:, 3].copy()
    l.seatmask = seat_mask(G, l.seats)
    return len(S), nc, ne
