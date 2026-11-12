# Tokyo Dome: the upper deck's seats (D rows 1-10, E rows 11-33) laid from the chart (td/td_rows_real.json).
#
# Each row is the line at its distance from the 1st floor's hull (td_gen.py's dOut, moved back past the poles:
# td_upper.tau_d), traced round the dome as one smooth curve (where the distance crosses the row's value along
# each ray from the dome's centre). Each block's two aisles are the map's block edges at the level's front row
# (td_gen.py's aisle sectors), carried up the rake square to the rows (along the rows' normal), so that an
# aisle's steps run square to the rows they climb, as the real ones do; behind home they fan out with the rows'
# curve, along the lines they run parallel.
#
# In each row the chart's seats are laid from the block's home-side aisle: seat s at (s - s0 + 0.5) seat widths
# (s0 the block's lowest number in any row, so a row the chart starts later starts later here), the width the
# row's length between its aisles over the block's widest span of numbers in that row or any row in front of it
# (so a block's short rows at the outfield end run ragged, as the chart draws them), kept within PITCH; a block too
# narrow for its seats at PITCH[0] spills evenly into its two aisles, one too wide is centred in it. The Sky
# Terrace boxes (two runs in a row, D14-D18 / D32-D38 rows 8-9: 4 + 4 seats) are spread over the whole row, a
# box's width between the two runs. The chart's single-row end blocks (D01/D51, D02/D50, E06/E46) get that one
# row only.
#
# The vomitories through E's front rows stand on aisles: the chart's E rows 11-14 stop three seats short of the
# aisle on either side of 14 of them (one block's home end, its neighbour's outfield end): the vomitory is that
# aisle. `vom_aisles` returns them: the aisle's middle at the front row and the rows' normal there.
import numpy as np

PITCH = (0.44, 0.55)          # (0.44: the seats' centres are stored to 2 cm, so never under 0.42 apart as stored)
BOX_PITCH = (0.44, 0.70)


def row_curves(dfield, TH, G, O, dcs, th_lo=-118.0, th_hi=118.0, dth=0.02):
    """{row value: (th, x, z, s)}: each row's line at dfield == value, sampled every `dth` degrees round O
    (s the length along it from th_lo)."""
    ths = np.arange(th_lo, th_hi + 1e-9, dth)
    rs = np.arange(30.0, 190.0, 0.05)
    t = np.radians(ths)[:, None]
    xs = O[0] + rs[None, :] * np.sin(t); zs = O[1] + rs[None, :] * np.cos(t)
    gi, gj = G.g(xs, zs)
    from scipy.ndimage import map_coordinates
    # Nearest-cell sampling makes a smooth curve jog by 10 cm at cell
    # boundaries. Bilinear sampling retains the continuous distance field.
    V = map_coordinates(dfield, [gj, gi], order=1, mode='nearest').astype(np.float32)
    out = {}
    for dc in dcs:
        hit = V >= dc
        k = np.argmax(hit, axis=1); ok = hit[np.arange(len(ths)), k] & (k > 0)
        k1 = np.maximum(k, 1); v0 = V[np.arange(len(ths)), k1 - 1]; v1 = V[np.arange(len(ths)), k1]
        f = np.clip((dc - v0) / np.maximum(v1 - v0, 1e-6), 0, 1)
        r = rs[k1 - 1] + f * (rs[1] - rs[0])
        r = np.where(ok, r, np.nan)
        # (a light smoothing along the row: the raster's steps)
        good = ~np.isnan(r)
        if good.sum() > 10:
            rr = np.interp(np.arange(len(r)), np.nonzero(good)[0], r[good])
            ker = np.ones(15) / 15; rp = np.r_[np.full(7, rr[0]), rr, np.full(7, rr[-1])]
            r = np.where(good, np.convolve(rp, ker, 'valid'), np.nan)
        x = O[0] + r * np.sin(np.radians(ths)); z = O[1] + r * np.cos(np.radians(ths))
        ds = np.hypot(np.diff(np.nan_to_num(x)), np.diff(np.nan_to_num(z))); ds[np.isnan(np.diff(r))] = 0
        out[dc] = (ths, x, z, np.r_[0.0, np.cumsum(ds)], good)
    return out


def _at(curve, th):
    ths, x, z, s, good = curve
    return np.interp(th, ths, x), np.interp(th, ths, z), np.interp(th, ths, s)


def _cross(curve, p, n):
    """where the line p + t n crosses the curve: its angle round O"""
    ths, x, z, s, good = curve
    q = np.c_[x, z] - p; c = q[:, 0] * n[1] - q[:, 1] * n[0]        # signed distance from the line
    c = np.where(good, c, np.nan)
    sg = np.sign(c); k = np.nonzero((sg[:-1] * sg[1:] <= 0) & ~np.isnan(c[:-1]) & ~np.isnan(c[1:]))[0]
    if not len(k): return None
    # (the crossing on the line's own side, nearest p)
    best = None
    for i in k:
        f = c[i] / (c[i] - c[i + 1]) if c[i] != c[i + 1] else 0.0
        th = ths[i] + f * (ths[i + 1] - ths[i]); xx, zz, _ = _at(curve, th)
        t = (xx - p[0]) * n[0] + (zz - p[1]) * n[1]
        if t >= -0.5 and (best is None or t < best[0]): best = (t, th)
    return None if best is None else best[1]


def _specs(L, real, k, r_base, nrows):
    """the chart's rows of block k: [(row index, row number, seat numbers, ids along the row, cap, pitch limits)]"""
    nm = f'{L}{k:02d}'
    if nm not in real: return []
    rows = {int(r): ivs for r, ivs in real[nm]['rows'].items()}
    s_min = min(lo for ivs in rows.values() for lo, _ in ivs)
    out = []
    for r_num, ivs in sorted(rows.items()):
        ri = r_num - r_base
        if ri < 0 or ri >= nrows: continue
        nums = [sn for lo, hi in ivs for sn in range(lo, hi + 1)]
        if len(ivs) == 2 and L == 'D':
            # Sky Terrace: two boxes of four (five) in the row, a box's gap between the runs
            ids = np.array([sn - s_min for sn in range(ivs[0][0], ivs[0][1] + 1)] + [sn - s_min + 0.6 for sn in range(ivs[1][0], ivs[1][1] + 1)], float)
            cap = ids[-1] + 1.0; lim = BOX_PITCH
        else:
            ids = np.array([sn - s_min for sn in nums], float)
            ref = max(r_num, r_base + 5) if L == 'E' else r_num
            cap = max(hi - s_min + 1 for rk, iv in rows.items() if rk <= ref and len(iv) == 1 for _, hi in iv)
            cap = max(cap, ids[-1] + 1); lim = PITCH
        out.append((ri, r_num, nums, ids, float(cap), lim))
    return out


def _normal(curve, th, O, win=2.0):
    """the point on the row at th and the row's normal there, away from the field (the tangent taken over `win`
    metres either side: the traced line's small steps are no guide to its direction)"""
    x0, z0, _ = _at(curve, th)
    r = np.hypot(x0 - O[0], z0 - O[1]); dt = np.degrees(win / r)
    xa, za, _ = _at(curve, th - dt); xb, zb, _ = _at(curve, th + dt)
    t = np.array([xb - xa, zb - za]); t /= np.linalg.norm(t)
    n = np.array([t[1], -t[0]]); p = np.array([x0, z0])
    if (p - O) @ n < 0: n = -n                                 # (away from the field)
    return p, n


def _edges(b_nums, secs, curves, dcs, O, need=None):
    """each block's two aisle edges, row by row (angles round O): an aisle's two edges parallel, square to the
    front row at the aisle's middle"""
    front = curves[dcs[0]]; edges = {}
    sec = dict(zip(b_nums, secs))
    # (block k's smaller-angle edge and block k+1's larger-angle edge make one aisle)
    nrm = {}
    for k in b_nums:
        a, b = sec[k]
        j = k + 1
        if j in sec: nrm[(k, 0)] = nrm[(j, 1)] = _normal(front, 0.5 * (a + sec[j][1]), O)[1]
    for k in b_nums:
        rows = range(len(dcs)) if need is None else need.get(k, ())
        ea, eb = {}, {}
        for side, th0, out in ((0, sec[k][0], ea), (1, sec[k][1], eb)):
            p, n = _normal(front, th0, O)
            n = nrm.get((k, side), n)
            for ri in rows:
                th = _cross(curves[dcs[ri]], p, n); out[ri] = th0 if th is None else th
        edges[k] = (ea, eb)
    return edges


def balance(L, real, b_nums, secs, curves, dcs, r_base, O, target=0.45, iters=30, rate=0.6):
    """the aisles moved round the level (each keeping its width) so that every block has the same room to spare
    for its seats at `target` apart in its tightest row, and the two sides made each other's mirror image"""
    secs = [list(s) for s in secs]
    spec = {k: _specs(L, real, k, r_base, len(dcs)) for k in b_nums}
    need = {k: [q[0] for q in spec[k]] for k in b_nums}
    r0 = float(np.nanmedian(np.hypot(curves[dcs[0]][1] - O[0], curves[dcs[0]][2] - O[1])))
    for it in range(iters):
        ed = _edges(b_nums, secs, curves, dcs, O, need)
        slack = {}
        for k in b_nums:
            sl = []
            for ri, r_num, nums, ids, cap, lim in spec[k]:
                if lim is BOX_PITCH: continue
                cv = curves[dcs[ri]]; sa = _at(cv, ed[k][0][ri])[2]; sb = _at(cv, ed[k][1][ri])[2]
                sl.append(abs(sb - sa) - cap * target)
            slack[k] = min(sl) if sl else 0.0
        if it == iters - 1: break
        idx = {k: i for i, k in enumerate(b_nums)}
        for k in b_nums[:-1]:
            j = k + 1
            # The aisles beside the single-row end blocks stay where the map has them.
            if k == b_nums[0] or j == b_nums[-1]: continue
            dm = rate * (slack[k] - slack[j]) / 2
            dd = np.degrees(dm / r0)
            secs[idx[k]][0] += dd; secs[idx[j]][1] += dd
        # (the two sides each other's mirror: block k and block n+1-k)
        n1 = b_nums[0] + b_nums[-1]
        for k in b_nums:
            m = n1 - k
            if m < k: continue
            a, b = secs[idx[k]]; am, bm = secs[idx[m]]
            na, nb = (a - bm) / 2, (b - am) / 2
            secs[idx[k]] = [na, nb]; secs[idx[m]] = [-nb, -na]
    return [tuple(s) for s in secs], slack


def lay_tier(L, real, b_nums, secs, curves, dcs, r_base, O):
    """the level's seats: positions (n, 2), labels [(block, row, seat)], yaw towards the field (n,), the blocks'
    aisle lines {block: ({row: th}, {row: th})} and each row's seat width [(block, row, width, length, cap)]"""
    edges = _edges(b_nums, secs, curves, dcs, O)
    P, LAB, YAW, PITCHES = [], [], [], []
    for k in b_nums:
        nm = f'{L}{k:02d}'
        ea, eb = edges[k]
        home_lo = k <= 26           # (the 1B side: the home-side aisle the smaller angle)
        for ri, r_num, nums, ids, cap, lim in _specs(L, real, k, r_base, len(dcs)):
            cv = curves[dcs[ri]]
            _, _, sa = _at(cv, ea[ri]); _, _, sb = _at(cv, eb[ri])
            Lr = abs(sb - sa)
            s_home = sa if home_lo else sb; sgn = 1.0 if home_lo else -1.0
            if k == 26: s_home, sgn = (sb, -1.0)       # (behind home: numbered from the 1B side, +x)
            p = float(np.clip(Lr / cap, *lim))
            off = (Lr - cap * p) / 2 if (Lr / cap > lim[1] or Lr / cap < lim[0]) else 0.0
            if k in (b_nums[0], b_nums[-1]) and off > 0: off = 0.0       # number the end blocks from the home-side aisle
            ss = s_home + sgn * (off + (ids + 0.5) * p)
            ths, x, z, s, good = cv
            th_s = np.interp(ss, s, ths)
            xs, zs = np.interp(th_s, ths, x), np.interp(th_s, ths, z)
            # facing: square to the row, towards the field
            x2, z2 = np.interp(th_s + 0.05, ths, x), np.interp(th_s + 0.05, ths, z)
            tx, tz = x2 - xs, z2 - zs; nx, nz = tz, -tx
            inward = (nx * (O[0] - xs) + nz * (O[1] - zs)) > 0
            nx = np.where(inward, nx, -nx); nz = np.where(inward, nz, -nz)
            P.append(np.c_[xs, zs]); YAW.append(np.arctan2(nx, nz))
            LAB += [(nm, r_num, sn) for sn in nums]
            PITCHES.append((nm, r_num, p, Lr, cap))
    return np.vstack(P), LAB, np.concatenate(YAW), edges, PITCHES


def phantoms(L, real, P, LAB, curves, dcs, r_base, O):
    """for the blocks the chart gives one row (D01/D51, D02/D50, E06/E46): the same seats one row further back,
    which td_build.py lays a tread under with the rest and then takes away (a level's rows are built round its
    seats, and one row on its own gets none: its seats stood on nothing)"""
    out = []
    one = {nm for nm, v in real.items() if nm[0] == L and len(v['rows']) == 1}
    for i, (nm, rr, sn) in enumerate(LAB):
        if nm not in one: continue
        ri = rr - r_base + 1
        if ri >= len(dcs): continue
        th = np.degrees(np.arctan2(P[i, 0] - O[0], P[i, 1] - O[1]))
        ths, x, z, s, good = curves[dcs[ri]]
        out.append((np.interp(th, ths, x), np.interp(th, ths, z)))
    return np.array(out).reshape(-1, 2)


def vom_aisles(real, edges, curves, dcs, O, nums_angles):
    """the E vomitories' aisles: [(number, p, n, th)]: the aisle's middle on the front row, the rows' normal there"""
    out = []
    ks = sorted(edges)
    for k in ks:
        nm = f'E{k:02d}'
        rows = real[nm]['rows']; s_min = min(lo for ivs in rows.values() for lo, _ in ivs)
        if rows['11'][0][0] - s_min <= 0: continue
        j = k + 1 if k < 26 else k - 1                 # its home-side neighbour
        if j not in edges: continue
        # the aisle between k and j on the front row: k's home edge, j's far edge
        tk = edges[k][0][0] if k < 26 else edges[k][1][0]
        tj = edges[j][1][0] if k < 26 else edges[j][0][0]
        th = 0.5 * (tk + tj)
        p, n = _normal(curves[dcs[0]], th, O)
        num = min(nums_angles, key=lambda q: abs(q[1] - th))[0]
        out.append((num, p, n, float(th), (j, k)))
    return out
