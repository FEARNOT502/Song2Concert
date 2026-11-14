"""The Saitama Super Arena's seats as the official seat list numbers them.

The map (ssa/ssa_chart.json) draws where the seats are; the seat list
(seat_list.js, decoded by ssa_rules.py) says which seats there are: for every
row of every level, its seat numbers, and the map block each belongs to. The
two disagree here and there: a row the map's labels hid, a seat or two short at
a row's end, a stray mark read as a seat, and blocks whose outlines on the map
are cut differently from the list's (the map's 49 holds the list's 49 and the
side of its 46). So nothing is taken from the map's blocks but where the seats
stand:

1. each map block's drawn rows are matched to the list's rows (by depth, a row
   pitch apart, and by how many seats they hold), so a missing row is a gap and
   a stray row is dropped;
2. each level's row, all the way round, is aligned with that row's numbers in
   order (numbers run round every level the same way: from the south end's
   middle, west, north, east), seat to number, the gaps between the seats
   agreeing with the gaps between the numbers within a run of the list (a run is
   the stretch of numbers between two of its keys: across a run's end may be an
   aisle); a number with no seat drawn gets one, between its neighbours or, in a
   row the map left out, behind or in front of the same number in the next row;
   a drawn seat with no number is dropped.

-> per level: dict like ssa_blocks.level_seats (P, yaw, row, block (the map
   block the seat is in, for the stand's geometry), local, p, q, filled, added)
   plus num (seat number) and rblock (the list's block)."""
import os, json, math, collections
import numpy as np
from scipy.spatial import cKDTree
import ssa_blocks as SB
from ssa_rules import decode
from ssa_chart import read_rules

HERE = os.path.dirname(os.path.abspath(__file__))
PITCH = 0.5
# the north end's front blocks (under the stage on the map) and the south end's they mirror
NORTH_FRONT = {61: 22, 63: 20, 303: 301}


def load_rules():
    return read_rules(os.path.join(HERE, 'ssa', 'raw', 'seat_list.js'))


def runs_of(rules, lv, mode='arena'):
    """seat number -> index of the run (the stretch of numbers up to a key) it is in"""
    keys = sorted(int(k) for k in rules[mode][lv]['separate'])
    run = {}; prev = 0
    for i, k in enumerate(keys):
        for n in range(prev + 1, k + 1): run[n] = i
        prev = k
    return run


def official_rows(R, lv):
    """{row: [(number, list block)]} for a level (the telescopic rows left out)"""
    out = collections.defaultdict(list)
    for b, o in R.items():
        if o['level'] != lv or o['lettered']: continue
        for r, nums in o['rows'].items():
            out[r] += [(n, b) for n in nums]
    return {r: sorted(v) for r, v in out.items()}


def ring_cut(R, d, lv):
    """the angle (atan2(x, z), degrees) where a level's numbering wraps: between the
    block that holds its last number and the one that holds its first"""
    lo = hi = None
    for b, o in R.items():
        if o['level'] != lv or o['lettered'] or str(b) not in d['blocks']: continue
        nums = [n for v in o['rows'].values() for n in v]
        p = SB.to_metres(d, np.array(d['blocks'][str(b)]['poly']), lv).mean(0)
        a = math.degrees(math.atan2(p[0], p[1]))
        if lo is None or min(nums) < lo[0]: lo = (min(nums), a)
        if hi is None or max(nums) > hi[0]: hi = (max(nums), a)
    a0, a1 = lo[1], hi[1]
    dlt = ((a1 - a0 + 180) % 360) - 180
    return a0 + dlt / 2


def ring_t(P, cut):
    """position round the ring in the numbering's direction (angle decreasing), 0 at the cut"""
    a = np.degrees(np.arctan2(P[:, 0], P[:, 1]))
    return (cut - a) % 360.0


def relay_blocks(S, R, lv, OFF):
    """A straight block the map drew with a row short (its rows read a pitch too far apart, so one is
    lost) laid out again: each of the list's rows at the depth the level's other blocks facing the same
    way have that row at, with the seats of the drawn row nearest it in order"""
    f_all = np.c_[np.sin(S['yaw']), np.cos(S['yaw'])]
    grow = S['local'] + np.array([OFF.get(int(b), 0) for b in S['block']]) + 1
    fixed = []
    keep = np.ones(len(S['P']), bool); add = []
    for b in np.unique(S['block']):
        o = R.get(int(b))
        if not o or o['lettered'] or int(b) in STRIPS: continue        # (the strips: fix_strips)
        m = np.nonzero(S['block'] == b)[0]
        f = f_all[m].mean(0); f /= np.linalg.norm(f)
        if max(abs(f[0]), abs(f[1])) < 0.995: continue          # straight blocks only (the sides and ends)
        nd = len(np.unique(S['local'][m])); orow = sorted(o['rows'])
        if nd >= len(orow): continue
        # the depth of each row on the level, from the other blocks facing this way
        good = np.array([len(np.unique(S['local'][S['block'] == bb])) == len(R[int(bb)]['rows']) if int(bb) in R else False
                         for bb in S['block']]) if 'good' not in locals() else good
        same = (f_all @ f > 0.995) & (S['block'] != b) & good
        v_all = -(S['P'] @ f)
        depth = {}
        for r in orow:
            mm = same & (grow == r)
            if mm.sum() >= 10: depth[r] = float(np.median(v_all[mm]))
        if len(depth) < len(orow): continue
        loc = S['local'][m]; vb = -(S['P'][m] @ f)
        drows = sorted(np.unique(loc), key=lambda i: vb[loc == i].mean())
        for j, r in enumerate(orow):
            i = drows[min(len(drows) - 1, int(round(j * (len(drows) - 1) / max(1, len(orow) - 1))))]
            src = m[loc == i]
            for k in src:
                P = S['P'][k] - f * (depth[r] - vb[np.nonzero(m == k)[0][0]])
                add.append((k, P, j))
        keep[m] = False; fixed.append((int(b), float(np.median(np.diff([depth[r] for r in orow])))))
    if not fixed: return S, fixed
    ks = np.array([a[0] for a in add])
    out = {k: np.r_[v[keep], v[ks]] for k, v in S.items()}
    for b, q in fixed: out['q'][(out['block'] == b)] = q
    fixed = [b for b, _ in fixed]
    out['P'] = np.r_[S['P'][keep], np.array([a[1] for a in add])]
    out['local'] = np.r_[S['local'][keep], np.array([a[2] for a in add])]
    return out, fixed


# the thin wedges between the 200 level's straight blocks and its corner fans: rows 4-19, a seat at the front
# widening to six or seven at the back, each row on the line of the straight block beside it (the sides' 32, 51,
# 97, 119 and the ends' 24, 60, 89, 128). The map's seats for them were read turned through a right angle, or
# not at all; they are laid out from the list instead (strip_seats)
STRIPS = (24, 32, 51, 60, 89, 97, 119, 128)


def strip_seats(S, R, OFF):
    """{(row, number): (position, yaw)} for the strips: each row on the depth the straight blocks facing the same
    way have that row at; the number every row has (the wedge's narrow edge) where the map's seats keep their
    edge, the others a pitch apart from it, the way the map's seats spread"""
    f_all = np.c_[np.sin(S['yaw']), np.cos(S['yaw'])]
    grow = S['local'] + np.array([OFF.get(int(b), 0) for b in S['block']]) + 1
    good = np.array([int(bb) in R and len(np.unique(S['local'][S['block'] == bb])) == len(R[int(bb)]['rows']) for bb in S['block']])
    axis = np.abs(f_all).max(1) > 0.995
    out = {}; meta = {}
    for b in STRIPS:
        m = np.nonzero(S['block'] == b)[0]
        if not len(m) or b not in R: continue
        c = S['P'][m].mean(0)
        cand = np.nonzero(axis & good & ~np.isin(S['block'], STRIPS))[0]
        j = cand[np.argmin(np.linalg.norm(S['P'][cand] - c, axis=1))]
        f = np.round(f_all[j]); e = np.array([-f[1], f[0]])
        same = axis & good & (np.abs(f_all @ f - 1) < 0.01)
        v_all = -(S['P'] @ f)
        rows = R[b]['rows']
        depth = {}
        for r in rows:
            mm = same & (grow == r)
            if mm.sum() >= 5: depth[r] = float(np.median(v_all[mm]))
        rs = sorted(depth)
        for r in rows:                                      # (a row the straight blocks lack: a pitch on)
            if r not in depth:
                k = min(rs, key=lambda x: abs(x - r)); dq = np.median(np.diff([depth[x] for x in rs]))
                depth[r] = depth[k] + (r - k) * dq
        # the narrow edge: the side of the map's seats whose extreme is the same row after row
        u = S['P'][m] @ e; lr = S['local'][m]
        lo = np.array([u[lr == i].min() for i in np.unique(lr)]); hi = np.array([u[lr == i].max() for i in np.unique(lr)])
        if lo.std() <= hi.std(): e0, sg = float(np.median(lo)), 1.0
        else: e0, sg = float(np.median(hi)), -1.0
        fixed = set.intersection(*[set(v) for v in rows.values()]).pop()
        yaw = math.atan2(f[0], f[1])
        order = {r: sorted(nums, key=lambda x: abs(x - fixed)) for r, nums in rows.items()}
        for r, nums in order.items():
            for k, n_ in enumerate(nums):                   # (side by side: a number the list skips is no gap)
                out[(r, n_)] = (-f * depth[r] + e * (e0 + sg * PITCH * k), yaw, int(m[0]))
        meta[b] = dict(f=f, e=e, e0=e0, sg=sg, depth=depth, order=order, yaw=yaw, ref=int(m[0]))
    return out, meta


def even_strips(placed, meta):
    """The aisle between each strip's wide side and the corner fan beside it one width all the way up: row by row the
    fan's seat nearest the strip along the row's line; the strip's last seat that width inside it, the row's seats
    spread evenly from the narrow edge to there, a pitch of 0.46-0.62 m; a row too short to reach (near the tip) moved
    over, off the narrow edge. The width: the widest every row of two seats or more can keep. A strip with no fan beside it (the
    ends' strips facing the south's funnels) keeps its pitch. -> {strip: the aisle's clear width}"""
    done = {}
    keys = list(placed)
    P = np.array([placed[k][0] for k in keys])
    for b, M in meta.items():
        own = {(r, n_) for r, nums in M['order'].items() for n_ in nums}
        others = np.array([k not in own for k in keys])
        f, e, e0, sg = M['f'], M['e'], M['e0'], M['sg']
        v = -(P @ f); u = sg * (P @ e - e0)
        fe = {}
        for r, nums in M['order'].items():
            near = others & (np.abs(v - M['depth'][r]) < 0.45) & (u > 0.2) & (u < 0.5 * len(nums) + 3.0)
            if near.any(): fe[r] = float(u[near].min())
        rows2 = [r for r, nums in M['order'].items() if len(nums) >= 2 and r in fe]
        if len(rows2) < 6: continue
        g = min(fe[r] - PITCH - 0.46 * (len(M['order'][r]) - 1) for r in rows2)
        g = float(np.clip(g, 0.45, 1.2))
        for r, nums in M['order'].items():
            if r not in fe: continue
            n = len(nums); last = fe[r] - g - PITCH          # where the row's last seat stands (from the narrow edge)
            pitch = float(np.clip(last / (n - 1), 0.46, 0.62)) if n > 1 else 0.0
            # (a row too short to reach it, near the tip: moved over to it, off the narrow edge)
            start = max(0.0, last - pitch * (n - 1))
            for k, n_ in enumerate(nums):
                placed[(r, n_)] = (-f * M['depth'][r] + e * (e0 + sg * (start + pitch * k)), M['yaw'], M['ref'])
        done[b] = round(g, 2)
    return done


def match_rows(S, R, rows_of_block):
    """For each map block, its drawn local rows -> the list's row numbers.
    rows_of_block: {map block: {row: count}} (the list's rows the block holds).
    -> global row (1-based) per seat, -1 for a seat of a dropped row"""
    out = np.full(len(S['P']), -1, int)
    for b in np.unique(S['block']):
        m = np.nonzero(S['block'] == b)[0]
        rc = rows_of_block.get(int(b))
        if not rc: continue
        f = np.c_[np.sin(S['yaw'][m]), np.cos(S['yaw'][m])].mean(0); f /= np.linalg.norm(f)
        v = -(S['P'][m] @ f)                                  # depth, back positive
        q = float(S['q'][m][0])
        loc = S['local'][m]
        drawn = {i: (v[loc == i].mean(), int((loc == i).sum())) for i in np.unique(loc)}
        orow = sorted(rc)
        di = sorted(drawn, key=lambda i: drawn[i][0])
        best = None
        for j0 in range(-3, len(orow)):
            v0 = drawn[di[0]][0]
            asg = {}
            for i in di:
                j = j0 + int(round((drawn[i][0] - v0) / q))
                if 0 <= j < len(orow): asg.setdefault(j, []).append(i)
            cost = 0.0; keep = {}
            for j, ii in asg.items():
                c = rc[orow[j]]
                ii.sort(key=lambda i: abs(drawn[i][1] - c))
                keep[ii[0]] = orow[j]
                cost += abs(drawn[ii[0]][1] - c) / max(c, 1)
                cost += sum(1.0 for i in ii[1:])          # a stray row
            cost += sum(1.0 for i in di if all(i not in ii for ii in asg.values()))
            cost += 0.5 * (len(orow) - len(asg))           # a row left out
            if best is None or cost < best[0]: best = (cost, keep)
        for i, r in best[1].items(): out[m[loc == i]] = r
    return out


def align(t, P, nums, runs, band=40, sb=None, nb=None):
    """Seats along a row (sorted by t) against the row's numbers (sorted): a monotone
    matching. -> list of (seat index or None, number index or None) pairs in order"""
    m, n = len(t), len(nums)
    if m == 0: return [(None, k) for k in range(n)]
    if n == 0: return [(i, None) for i in range(m)]
    CD, CI = 1.6, 1.3                                     # a stray seat; a number with no seat
    INF = 1e18
    D = np.full((m, n), INF); back = {}
    run = [runs[x] for x in nums]
    def geo(i0, i1, k0, k1):
        d = float(np.linalg.norm(P[i1] - P[i0])) / PITCH
        if all(run[k] == run[k0] for k in range(k0, k1 + 1)):
            e = nums[k1] - nums[k0]
            return min(abs(d - e), abs(d - (k1 - k0))) * 1.2
        return max(0.0, 0.8 - d) * 3.0                    # across a run's end: an aisle or not, but not on top
    # where in the numbers each seat should be: among its map block's numbers (where the row has any), else
    # between its neighbours'; never going back
    cen = np.full(m, np.nan)
    if sb is not None:
        pos = collections.defaultdict(list)
        for k, b in enumerate(nb): pos[b].append(k)
        cnt = collections.Counter(sb); seen = collections.Counter()
        for i in range(m):
            ks = pos.get(sb[i])
            if ks:
                fr = seen[sb[i]] / max(1, cnt[sb[i]] - 1); seen[sb[i]] += 1
                cen[i] = ks[0] + fr * (ks[-1] - ks[0])
    if np.isnan(cen).all(): cen = np.arange(m) * n / m
    else:
        ok = ~np.isnan(cen); cen = np.interp(np.arange(m), np.nonzero(ok)[0], cen[ok])
    # (a long skip, of seats or of numbers or both, from the best cell anywhere above and to the left: the
    # prefix minimum of D less what the skips there would have cost)
    PM = np.full((m, n), INF); PA = np.zeros((m, n, 2), int)
    for i in range(m):
        lo = max(0, int(cen[i]) - band); hi = min(n, int(cen[i]) + band + 1)
        for k in range(lo, hi):
            best = CD * i + CI * k; arg = None
            pri = 2.0 if sb is not None and sb[i] != nb[k] else 0.0
            for i0 in range(max(0, i - 4), i):
                for k0 in range(max(0, k - 6), k):
                    if D[i0, k0] >= INF: continue
                    c = D[i0, k0] + CD * (i - i0 - 1) + CI * (k - k0 - 1) + geo(i0, i, k0, k) + pri
                    if c < best: best, arg = c, (i0, k0)
            if i > 0 and k > 0 and PM[i - 1, k - 1] < INF:
                c = PM[i - 1, k - 1] + CD * (i - 1) + CI * (k - 1) + 0.4 + pri
                if c < best: best, arg = c, tuple(PA[i - 1, k - 1])
            D[i, k] = best; back[(i, k)] = arg
        # the prefix minimum through this row
        q = np.where(D[i] < INF, D[i] - CD * i - CI * np.arange(n), INF)
        prev = PM[i - 1] if i > 0 else np.full(n, INF); pa = PA[i - 1] if i > 0 else np.zeros((n, 2), int)
        cur = INF; ca = (0, 0)
        for k in range(n):
            if prev[k] < cur: cur, ca = prev[k], tuple(pa[k])
            if q[k] < cur: cur, ca = q[k], (i, k)
            PM[i, k] = cur; PA[i, k] = ca
    tot = D + CD * (m - 1 - np.arange(m))[:, None] + CI * (n - 1 - np.arange(n))[None, :]
    i, k = np.unravel_index(np.argmin(tot), tot.shape)
    pairs = []
    ti, tk = m - 1, n - 1
    path = []
    while (i, k) is not None and i is not None:
        path.append((i, k))
        a = back.get((i, k))
        if a is None: break
        i, k = a
    path.reverse()
    out = []; pi, pk = -1, -1
    for (i, k) in path:
        out += [(ii, None) for ii in range(pi + 1, i)] + [(None, kk) for kk in range(pk + 1, k)]
        out.append((i, k)); pi, pk = i, k
    out += [(ii, None) for ii in range(pi + 1, m)] + [(None, kk) for kk in range(pk + 1, n)]
    return out


def level_official(d, R, rules, lv, OFF, skip=None):
    """The level's seats, numbered from the list (see the module's comment).
    skip(x, z): where no seat is added (the north end's front, rebuilt later)"""
    S = SB.level_seats(d, lv, OFF)
    S, fixed = relay_blocks(S, R, lv, OFF)
    orows = official_rows(R, lv)
    runs = runs_of(rules, lv)
    # the list's rows each map block holds (its own id, as the map and the list mostly agree)
    rob = {b: {r: len(v) for r, v in o['rows'].items()} for b, o in R.items() if o['level'] == lv and not o['lettered']}
    # where the map's outline holds seats the list gives another block: the map's 49 is the list's 49 (348-352)
    # and its 46's numbers 353-363, rows 21-27 (the rest of the list's 46 is the map's 46)
    if lv == '200':
        for b, keepn in ((46, lambda n: not 353 <= n <= 363), (49, None)):
            pass
        m46 = {r: [n for n in v if 353 <= n <= 363] for r, v in R[46]['rows'].items()}
        rob[49] = {r: len(R[49]['rows'].get(r, [])) + len(m46.get(r, [])) for r in sorted(set(R[49]['rows']) | {r for r, v in m46.items() if v})}
        rob[46] = {r: len(v) - len(m46.get(r, [])) for r, v in R[46]['rows'].items() if len(v) - len(m46.get(r, []))}
    grow = match_rows(S, R, rob)
    strips, smeta = strip_seats(S, R, OFF) if lv == '200' else ({}, {})
    sblk = set(STRIPS) if lv == '200' else set()
    # where the numbering wraps: between the seats of the map blocks that hold the level's last numbers and those
    # that hold its first (the numbers run the way the angle falls)
    allnums = sorted(n for v in orows.values() for n, _ in v)
    first = {b for v in orows.values() for n, b in v if n <= allnums[0] + 10}
    last = {b for v in orows.values() for n, b in v if n >= allnums[-1] - 10}
    ang = np.degrees(np.arctan2(S['P'][:, 0], S['P'][:, 1]))
    a0 = ring_cut(R, d, lv)
    rel = ((ang - a0 + 180) % 360) - 180
    fm = np.isin(S['block'], list(first)); lm = np.isin(S['block'], list(last))
    cut = a0 + (rel[fm].max() + rel[lm].min()) / 2 if fm.any() and lm.any() else a0
    t = ring_t(S['P'], cut)
    out = collections.defaultdict(list)
    stats = collections.Counter()
    placed = {}                                            # (row, number) -> position, yaw, seat index
    rows = sorted(orows)
    for r in rows:
        idx = np.nonzero((grow == r) & ~np.isin(S['block'], list(sblk)))[0]
        # (the cut for this row: its own first and last blocks' seats either side; the boundary is not on a ray)
        rn = [n_ for n_, _ in orows[r]]
        fb = {b for n_, b in orows[r] if n_ <= rn[0] + 6}; lb = {b for n_, b in orows[r] if n_ >= rn[-1] - 6}
        fr, lr = idx[np.isin(S['block'][idx], list(fb))], idx[np.isin(S['block'][idx], list(lb))]
        if len(fr) and len(lr):
            cr = a0 + (rel[fr].max() + rel[lr].min()) / 2
            if rel[fr].max() < rel[lr].min(): t = ring_t(S['P'], cr)
            else: t = ring_t(S['P'], cut)
        else: t = ring_t(S['P'], cut)
        idx = idx[np.argsort(t[idx])]
        nums = [x[0] for x in orows[r] if x[1] not in sblk]
        blk = {x[0]: x[1] for x in orows[r]}
        pairs = align(t[idx], S['P'][idx], nums, runs, sb=S['block'][idx], nb=[blk[x] for x in nums])
        for i, k in pairs:
            if i is not None and k is not None:
                placed[(r, nums[k])] = (S['P'][idx[i]], S['yaw'][idx[i]], idx[i]); stats['matched'] += 1
            elif i is not None: stats['dropped'] += 1
        stats['missing'] += sum(1 for i, k in pairs if i is None)
    # each row's runs laid out again: the seats a run has in a row stand evenly along the line its matched seats
    # draw (a pitch a seat, or a pitch a number where the numbers it skips are gaps the map shows too), so a seat
    # the map left out takes its place in the run; where the matched seats are not even (an aisle inside a run),
    # they stay and the missing go between them
    def on_line(Pm, sm, s_):
        """the point at arc length s_ along the polyline Pm (arc lengths sm), straight on past its ends"""
        if s_ <= sm[0]:
            u = (Pm[1] - Pm[0]) / max(1e-6, sm[1] - sm[0]); return Pm[0] + u * (s_ - sm[0])
        if s_ >= sm[-1]:
            u = (Pm[-1] - Pm[-2]) / max(1e-6, sm[-1] - sm[-2]); return Pm[-1] + u * (s_ - sm[-1])
        return np.array([np.interp(s_, sm, Pm[:, 0]), np.interp(s_, sm, Pm[:, 1])])
    added = {}; lay = collections.Counter()
    for r in rows:
        byrun = collections.defaultdict(list)
        for n_, b_ in orows[r]:
            if b_ not in sblk: byrun[runs[n_]].append(n_)
        for g, gn in byrun.items():
            gn = sorted(gn)
            mt = [n_ for n_ in gn if (r, n_) in placed]
            if len(mt) == len(gn) and len(gn) < 2: continue
            if len(mt) >= 2:
                Pm = np.array([placed[(r, n_)][0] for n_ in mt])
                sm = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Pm, axis=0), axis=1))]
                best = None
                for kind in ('idx', 'num'):
                    u = np.array([gn.index(n_) for n_ in mt]) if kind == 'idx' else np.array(mt, float)
                    if np.ptp(u) == 0: continue
                    A = np.c_[np.ones(len(u)), u]; coef = np.linalg.lstsq(A, sm, rcond=None)[0]
                    res = float(np.abs(A @ coef - sm).max())
                    if best is None or res < best[0]: best = (res, kind, coef)
                if best and best[0] < 0.22 and 0.42 <= best[2][1] <= 0.62:
                    _, kind, (s0, pp) = best
                    for j, n_ in enumerate(gn):
                        u = j if kind == 'idx' else n_
                        near = min(mt, key=lambda m_: abs(m_ - n_))
                        added[(r, n_)] = (on_line(Pm, sm, s0 + pp * u), placed[(r, near)][1], placed[(r, near)][2])
                    lay['even'] += 1
                    continue
                lay['kept'] += 1
                for n_ in gn:
                    if (r, n_) in placed: continue
                    lo = [m_ for m_ in mt if m_ < n_]; hi = [m_ for m_ in mt if m_ > n_]
                    if lo and hi:
                        a, b = lo[-1], hi[0]; w = (gn.index(n_) - gn.index(a)) / (gn.index(b) - gn.index(a))
                        pos = placed[(r, a)][0] * (1 - w) + placed[(r, b)][0] * w; ref = placed[(r, a)]
                    else:
                        a, b = (mt[-2], mt[-1]) if lo else (mt[1], mt[0])
                        u = (placed[(r, b)][0] - placed[(r, a)][0]) / (gn.index(b) - gn.index(a))
                        pos = placed[(r, b)][0] + u * (gn.index(n_) - gn.index(b)); ref = placed[(r, b)]
                    added[(r, n_)] = (pos, ref[1], ref[2])
            elif len(mt) == 1:
                p0, y0, ref = placed[(r, mt[0])]
                f = np.array([np.sin(y0), np.cos(y0)]); e = np.array([-f[1], f[0]])
                tang = np.array([-p0[1], p0[0]])                 # the way the numbers run (the angle falling)
                if e @ tang < 0: e = -e
                for j, n_ in enumerate(gn):
                    if n_ != mt[0]: added[(r, n_)] = (p0 + e * PITCH * (j - gn.index(mt[0])), y0, ref)
                lay['one'] += 1
    for k, v in added.items():
        if not (skip and k not in placed and skip(v[0][0], v[0][1])): placed[k] = v
    # a run with no seat drawn in a row (a row the map left out): behind or in front of the same numbers
    for it in range(3):
        added = {}
        for r in rows:
            for n_, b_ in orows[r]:
                if (r, n_) in placed or b_ in sblk: continue
                for rr in (r - 1, r + 1, r - 2, r + 2):
                    if (rr, n_) in placed:
                        p0, y0, ref = placed[(rr, n_)]
                        f = np.array([np.sin(y0), np.cos(y0)])
                        pos = p0 - f * (r - rr) * S['q'][ref]
                        if not (skip and skip(pos[0], pos[1])): added[(r, n_)] = (pos, y0, ref)
                        break
        placed.update(added)
    stats.update({'lay_' + k: v for k, v in lay.items()})
    placed.update(strips); stats['strips'] = len(strips)
    ev = even_strips(placed, smeta); stats['strips_evened'] = len(ev); print('   strips evened (aisle m):', ev)
    # the 200 level's north end in front of the stage: the map draws the stage over its front blocks (61, 63 and
    # the list's 303), whose rows 1-10 are the south end's front blocks (22, 20, 301) turned north to south, seat
    # for seat; numbered along each row the way the numbers run there (west to east)
    if lv == '200':
        for nb_, sb_ in NORTH_FRONT.items():
            for r, nums_ in R[nb_]['rows'].items():
                for n_ in nums_: placed.pop((r, n_), None)
                src = sorted([k for k in placed if k[0] == r and dict(orows[r]).get(k[1]) == sb_], key=lambda k: placed[k][0][0])
                if len(src) != len(nums_): stats['north_mismatch'] += 1; continue
                for k, n_ in zip(src, sorted(nums_)):
                    p0, y0, ref = placed[k]
                    placed[(r, n_)] = (np.array([p0[0], -p0[1]]), np.pi - y0, ref)
                stats['north_front'] += len(nums_)
        keys = sorted(placed)
    # a seat still standing on another (the corner fans' small rows, where a run's line is short): moved to the
    # nearest seat the map draws that no number took, if one is free near it
    keys = sorted(placed)
    # first, within a row: seats next to each other in number standing too close (two runs' ends meeting, a
    # run's line extended onto the next) spread out to a pitch apart along the row, about their middle
    for r in rows:
        ks = [k for k in keys if k[0] == r]
        for it in range(6):
            P = np.array([placed[k][0] for k in ks])
            gaps = np.linalg.norm(np.diff(P, axis=0), axis=1)
            pr = sorted((min(a_, b_), max(a_, b_)) for a_, b_ in cKDTree(P).query_pairs(0.42)) if len(P) > 1 else []
            if not pr: break
            i0, j0 = pr[0]
            for a_, b_ in pr:
                if a_ <= j0: j0 = max(j0, b_)
            i1 = j0 - 1
            while i0 > 0 and gaps[i0 - 1] < 0.6: i0 -= 1
            while i1 + 1 < len(gaps) and gaps[i1 + 1] < 0.6: i1 += 1
            seg = list(range(i0, i1 + 2))
            a, b = P[seg[0]], P[seg[-1]]
            u = b - a
            if np.linalg.norm(u) < 1e-3:
                y0 = placed[ks[seg[0]]][1]; f = np.array([np.sin(y0), np.cos(y0)]); u = np.array([-f[1], f[0]])
                if u @ np.array([-a[1], a[0]]) < 0: u = -u
            u = u / np.linalg.norm(u); c = P[seg].mean(0)
            for j, ix in enumerate(seg):
                k = ks[ix]; placed[k] = (c + u * PITCH * (j - (len(seg) - 1) / 2), placed[k][1], placed[k][2])
            stats['spread'] += 1
    for it in range(4):
        P = np.array([placed[k][0] for k in keys]); tr = cKDTree(P)
        dd, ii = tr.query(P, k=2)
        bad = [keys[i] for i in np.nonzero(dd[:, 1] < 0.4)[0]]
        if not bad: break
        used = cKDTree(P)
        free = [i for i in range(len(S['P'])) if used.query(S['P'][i])[0] > 0.4]
        if not free: break
        ft = cKDTree(S['P'][free]); taken = set(); moved = 0
        for k in bad:
            pk = placed[k][0]
            for dist, j in zip(*ft.query(pk, k=6)):
                if dist > 2.0 or j in taken: continue
                q = S['P'][free[j]]
                if used.query(q, k=2)[0][0] < 0.4: continue
                placed[k] = (q, S['yaw'][free[j]], free[j]); taken.add(j); moved += 1; break
        stats['moved'] += moved
        if not moved: break
    P = np.array([placed[k][0] for k in keys]); dd, _ = cKDTree(P).query(P, k=2)
    stats['still_close'] = int((dd[:, 1] < 0.35).sum())
    # the result, in the form level_seats gives (plus the numbers)
    P = np.array([placed[k][0] for k in keys]); ref = np.array([placed[k][2] for k in keys])
    res = dict(P=P, yaw=np.array([placed[k][1] for k in keys]), row=np.array([k[0] - 1 for k in keys]),
               block=S['block'][ref], local=S['local'][ref], p=S['p'][ref], q=S['q'][ref], filled=S['filled'][ref],
               added=np.array([0 if np.allclose(placed[k][0], S['P'][placed[k][2]]) else 1 for k in keys]),
               num=np.array([k[1] for k in keys]), rblock=np.array([dict(orows[k[0]])[k[1]] for k in keys]))
    stats['relaid'] = len(fixed)
    stats['seats'] = len(keys); stats['official'] = sum(len(v) for v in orows.values())
    stats['unplaced'] = stats['official'] - len(keys)
    return res, stats


OUT = os.path.join(HERE, 'ssa', 'ssa_official.json')
KEYS = ('P', 'yaw', 'row', 'block', 'local', 'p', 'q', 'filled', 'added', 'num', 'rblock')


def load_level(lv, path=OUT):
    """a level's numbered seats as written by this module (see the module's comment)"""
    L = json.load(open(path))['levels'][lv]
    return {k: np.array(L[k]) for k in KEYS}


if __name__ == '__main__':
    import time
    d = SB.load_chart(); OFF = SB.row_offsets(d)
    rules = load_rules(); R = decode(rules)
    out = {'source': 'seat_list.js (arena mode) + img-map_arena_end02 (ssa_chart.json)', 'levels': {}, 'stats': {}}
    for lv in ('200', '300', '400', '500'):
        t0 = time.time()
        S, st = level_official(d, R, rules, lv, OFF)
        print(lv, dict(st), round(time.time() - t0, 1), 's')
        out['levels'][lv] = {k: (np.round(S[k], 3).tolist() if S[k].dtype.kind == 'f' else S[k].astype(int).tolist()) for k in KEYS}
        out['stats'][lv] = {k: int(v) for k, v in st.items()}
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
