# Tokyo Dome: the outfield stand's seats (F01-F20) laid from the chart (td/td_rows_real.json).
#
# The stand's rows are the lines at their distance from the fence (td_build.py: every F_D metres, the poles' blocks
# straight, td_build.py's _dF2), traced round the outfield as one smooth curve each (td_lay2f.row_curves). In each
# row, each block's part of it is where the curve runs inside the map's outline of the block (pulled in a little off
# its aisles); the chart's seats are laid along it from its pole-side end, seat s at (s - s0 + 0.5) seat widths (s0 the
# block's lowest number), the width that part's length over the block's widest span of numbers in that row or any in
# front of it (so the short back rows, which the chart starts and ends short of the aisles, stand as it draws them),
# within PITCH. F10 has no chart (the backscreen); F09 and F12 are kept out of the backscreen's sector (dome.js hides
# what stands in it); F11's rows 5-10 stand in it, hidden like the rest of it.
import numpy as np, shapely
import td_lay2f as L2

PITCH = (0.44, 0.55)
BSC = 9.7                 # the backscreen's half angle about home (dome.js)


def lay(G, dist, ok, named, real, D, nrows, O, first=0.55, inset=0.18):
    """-> seats (n, 2), row index (n,), yaw (n,), labels [(block, row, seat)], report {block: (chart, laid)}"""
    O = np.asarray(O, float)
    dcs = [(r + first) * D for r in range(nrows)]
    curves = L2.row_curves(dist, None, G, O, dcs, th_lo=95.0, th_hi=265.0, dth=0.02)
    S, R, Y, LB, rep = [], [], [], [], {}
    polys = {nm: p.buffer(-inset) for nm, p in named}
    for nm, P in sorted(polys.items()):
        if nm not in real or P.is_empty: continue
        rows = {int(r): ivs for r, ivs in real[nm]['rows'].items()}
        s_min = min(lo for ivs in rows.values() for lo, _ in ivs)
        right = P.centroid.x > 0 or nm == 'F11'
        e = rep.setdefault(nm, [sum(b - a + 1 for ivs in rows.values() for a, b in ivs), 0])
        for r_num, ivs in sorted(rows.items()):
            ri = r_num - 1
            if ri >= nrows: continue
            ths, x, z, s, good = curves[dcs[ri]]
            gi, gj = G.g(np.nan_to_num(x), np.nan_to_num(z))
            gi = np.clip(np.round(gi).astype(int), 0, G.W - 1); gj = np.clip(np.round(gj).astype(int), 0, G.H - 1)
            inb = good & shapely.contains_xy(P, np.nan_to_num(x), np.nan_to_num(z)) & ok[gj, gi]
            # (from home: the backscreen's sector, either side of centre field)
            phi = np.degrees(np.abs(np.arctan2(np.nan_to_num(x), -np.nan_to_num(z))))
            if nm != 'F11': inb &= phi >= BSC + 0.3
            idx = np.nonzero(inb)[0]
            if not len(idx): continue
            run = max(np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1), key=len)
            sa, sb = s[run[0]], s[run[-1]]; Lr = sb - sa
            # (numbers from the pole: on the 1B side (x > 0) the pole is at the smaller angle round O)
            s_pole, sgn = (sa, 1.0) if right else (sb, -1.0)
            nums = [sn for lo, hi in ivs for sn in range(lo, hi + 1)]
            ids = np.array([sn - s_min for sn in nums], float)
            cap = max(hi - s_min + 1 for rk, iv in rows.items() if rk <= r_num for _, hi in iv)
            p = float(np.clip(Lr / cap, *PITCH))
            off = (Lr - cap * p) / 2 if Lr / cap > PITCH[1] else 0.0
            d = off + (ids + 0.5) * p
            fit = d + 0.5 * p <= Lr + 0.05
            ss = s_pole + sgn * d[fit]
            th_s = np.interp(ss, s, ths)
            xs, zs = np.interp(th_s, ths, x), np.interp(th_s, ths, z)
            x2, z2 = np.interp(th_s + 0.05, ths, x), np.interp(th_s + 0.05, ths, z)
            tx, tz = x2 - xs, z2 - zs; nx, nz = tz, -tx
            inward = (nx * (O[0] - xs) + nz * (O[1] - zs)) > 0
            nx = np.where(inward, nx, -nx); nz = np.where(inward, nz, -nz)
            S.append(np.c_[xs, zs]); R.append(np.full(len(xs), ri)); Y.append(np.arctan2(nx, nz))
            LB += [(nm, r_num, sn) for sn, f in zip(nums, fit) if f]
            e[1] += int(fit.sum())
    return np.vstack(S), np.concatenate(R), np.concatenate(Y), LB, rep
