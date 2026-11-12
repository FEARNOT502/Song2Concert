# Every Wembley seat named as its ticket names it: block, row, seat.
#   python3 wb_labels.py   (after wb_gen.py; rewrites wb_stands.json in place)
# Adds to each seated level `labels` (base64 int16 (n, 3): block id, row, seat,
# in the order of its seats) and to the data `blockNames` (block id -> name),
# `blockMap` (each block's outline and centre, for the app's seating plan) —
# the form Tokyo Dome's td_labels.py gives (dome.js reads it the same way).
#
# Blocks: off the detailed seating plan, its blocks' regions (wb_blockpx.py),
# each seat taken back to the plan's frame (Level 5's move in, Level 2's
# walkway, undone: wb_masks.pkl) and on to the plan's pixels (wb_plan.py's
# transforms). A row's run of seats between two aisles is one block's: the
# block most of its seats fall in.
# Rows: the plan numbers each block's rows from 1 at its front (Level 1: 1-28,
# the walkway, then 31-44; Level 2: 1-16, the walkway after row 7 in the model;
# Level 5: 1-40 or so), the north side's blocks of Level 5 included (the model
# numbers its bands on from the corners'). So a block's row is its band less
# the block's first band, Level 1 skipping 29 and 30 past the walkway.
# Seats: the plan numbers seats clockwise (seen from above, north up), on
# from one block to the next round a quarter of the bowl. Each block's first
# seat number is read off the plan (wb_nums.py's seat numbers inside the
# block: the lowest that several rows agree on); its seats are numbered on
# from there, row by row, clockwise.
# Level 3 (the boxes' balcony): block = the box ('B' + its number), rows 1-2.
# Level 4 (the north boxes' balcony): block 'L4', rows 1-2, numbered clockwise.
import json, base64, pickle, collections, numpy as np, cv2

d = json.load(open('wb_stands.json'))
M = pickle.load(open('wb_masks.pkl', 'rb'))
PX = cv2.imread('wb/wb_blockpx.png', cv2.IMREAD_UNCHANGED)
NAMES = json.load(open('wb/wb_blockpx.json'))['names']
NUMS = json.load(open('wb/wb_nums.json'))
# wb_plan.py's transforms: world (north, east) -> the plan's pixels, per level
TF = {'L1': (14.98843, 2974.25893, 2467.93265, 0.00065, 0.00004), 'L2': (17.74268, 2974.83624, 2468.15489, 0.00015, -0.00015), 'L5': (18.73929, 2974.41226, 2476.50883, -0.00041, -0.00043)}

def to_px(name, P):
    s, cx, cy, k_, rot = TF[name]
    A, B = P[:, 1] / (1 + k_), -P[:, 0] / (1 - k_)
    return cx + s * (A * np.cos(rot) + B * np.sin(rot)), cy + s * (-A * np.sin(rot) + B * np.cos(rot))
def from_px(name, ix, iy):
    s, cx, cy, k_, rot = TF[name]
    dx, dy = (ix - cx) / s, (iy - cy) / s
    A = dx * np.cos(rot) - dy * np.sin(rot); B = dx * np.sin(rot) + dy * np.cos(rot)
    return np.c_[-B * (1 - k_), A * (1 + k_)]
def interp_bins(arr, nb, th):
    f = (np.asarray(th) + np.pi) / (2 * np.pi) * nb - 0.5
    i0 = np.floor(f).astype(int); w = f - i0
    return arr[i0 % nb] * (1 - w) + arr[(i0 + 1) % nb] * w
def unwarp(name, P):
    """the model's seats back to where the plan draws them"""
    th = np.arctan2(P[:, 0], P[:, 1]); r = np.hypot(P[:, 0], P[:, 1])
    if name == 'L5':
        r0 = r + interp_bins(M['SHIFT5'], M['NB5'], th)
    elif name == 'L2':
        dd = r - interp_bins(M['R2F'], M['NB2'], th)
        r0 = np.where(dd >= M['WD2'] + 0.25 * M['D2'] + M['W2'], r - M['W2'], r)
    else: r0 = r
    return P * (r0 / np.maximum(r, 1e-9))[:, None]
def warp(name, P):
    """the plan's frame on to the model's (for the plan's numbers)"""
    th = np.arctan2(P[:, 0], P[:, 1]); r = np.hypot(P[:, 0], P[:, 1])
    if name == 'L5': r1 = r - interp_bins(M['SHIFT5'], M['NB5'], th)
    elif name == 'L2':
        dd = r - interp_bins(M['R2F'], M['NB2'], th)
        r1 = np.where(dd >= M['WD2'] + 0.25 * M['D2'], r + M['W2'], r)
    else: r1 = r
    return P * (r1 / np.maximum(r, 1e-9))[:, None]
def decode(L):
    a = np.frombuffer(base64.b64decode(L['seats']), '<i2').reshape(-1, 4).astype(float)
    return a[:, :2] / L.get('seatScale', 10), a[:, 2].astype(int)
def block_at_px(ix, iy):
    ix = np.clip(np.round(ix).astype(int), 0, PX.shape[1] - 1); iy = np.clip(np.round(iy).astype(int), 0, PX.shape[0] - 1)
    return PX[iy, ix].astype(int) - 1          # -1: none
# clockwise from north, seen from above (x north, z east)
phi = lambda P: np.mod(np.arctan2(P[:, 1], P[:, 0]), 2 * np.pi)

names = list(NAMES); nid = {n: i for i, n in enumerate(names)}
def bid(n):
    if n not in nid: nid[n] = len(names); names.append(n)
    return nid[n]
report = {}
# ── the seated levels ──
for L in d['levels']:
    if L['name'] not in ('L1', 'L2', 'L5'): continue
    name = L['name']; S, R = decode(L)
    ix, iy = to_px(name, unwarp(name, S))
    b0 = block_at_px(ix, iy)
    # (only this level's blocks)
    lvl = str(name[1])
    b0 = np.where((b0 >= 0) & np.array([NAMES[k][0] == lvl if k >= 0 else False for k in b0]), b0, -1)
    # a row's runs of seats (between two aisles), and the runs stacked over
    # one another between the same aisles (a column: the plan's diagonal
    # mistakes where two blocks meet with no border drawn between them stay
    # in a few rows of it): each column one block, the most of its seats'
    blk = np.full(len(S), -1)
    ph = phi(S)
    runs = []                                  # (row, seats, angle from, angle to)
    for r in np.unique(R):
        idx = np.nonzero(R == r)[0]; o = idx[np.argsort(ph[idx])]
        P = S[o]; gap = np.r_[np.inf, np.linalg.norm(np.diff(P, axis=0), axis=1)]
        starts = np.nonzero(gap > 1.0)[0]
        rr = [o[a:b] for a, b in zip(starts, np.r_[starts[1:], len(o)])]
        if len(rr) > 1 and np.linalg.norm(S[rr[0][0]] - S[rr[-1][-1]]) <= 1.0:
            rr = [np.r_[rr[-1], rr[0]]] + rr[1:-1]
        for run in rr:
            a_ = ph[run[0]]; b_ = ph[run[-1]]
            if b_ < a_: b_ += 2 * np.pi
            runs.append((r, run, a_, b_))
    par = list(range(len(runs)))
    def root(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    byrow = collections.defaultdict(list)
    for i, (r, run, a_, b_) in enumerate(runs): byrow[r].append(i)
    for r in byrow:
        for i in byrow[r]:
            _, _, a1, b1 = runs[i]
            for j in byrow.get(r + 1, []):
                _, _, a2, b2 = runs[j]
                for sh in (0, 2 * np.pi, -2 * np.pi):
                    ov = min(b1, b2 + sh) - max(a1, a2 + sh)
                    if ov > 0 and ov >= 0.7 * min(b1 - a1, b2 - a2) and ov >= 0.6 * max(b1 - a1, b2 - a2):
                        par[root(i)] = root(j); break
    cols = collections.defaultdict(list)
    for i in range(len(runs)): cols[root(i)].append(i)
    if name != 'L1':
        for c, ii in cols.items():
            seats = np.concatenate([runs[i][1] for i in ii]); v = b0[seats]; v = v[v >= 0]
            if len(v): blk[seats] = collections.Counter(v.tolist()).most_common(1)[0][0]
    else:
        # Level 1's blocks meet with no aisle between them (a line on the
        # plan between two seats; the stairs are inside the blocks): seat by
        # seat, above the walkway, each row's run smoothed (a seat takes the
        # block most of the seven round it have)
        for (r, run, a_, b_) in runs:
            if r < 30: continue
            v = b0[run].copy()
            for j in range(len(run)):
                w = v[max(0, j - 3):j + 4]; w = w[w >= 0]
                if len(w): blk[run[j]] = collections.Counter(w.tolist()).most_common(1)[0][0]
    # Level 1 below its walkway: the block of the seats straight up the rake
    # from them, past the walkway (its aisles square to the rows: a block's
    # rows below and above the walkway are one column)
    if name == 'L1':
        from scipy.spatial import cKDTree as _T
        up = (R >= 34) & (blk >= 0)
        tu = _T(S[up]); low = np.nonzero(R <= 30)[0]
        yaw = np.radians(np.frombuffer(base64.b64decode(L['seats']), '<i2').reshape(-1, 4)[:, 3].astype(float))
        back = -np.c_[np.sin(yaw), np.cos(yaw)]            # up the rake (a seat faces down it)
        for steps in (36, 38, 40):
            Q = S[low] + back[low] * ((steps - R[low]) * 0.8)[:, None]
            dd, ii = tu.query(Q)
            ok = dd < 1.0
            blk[low[ok]] = blk[np.nonzero(up)[0][ii[ok]]]
            low = low[~ok]
            if not len(low): break
    # seats in no block (a run off the plan's blocks): the block of the nearest seat in a block
    from scipy.spatial import cKDTree
    bad = blk < 0
    if bad.any() and (~bad).any():
        t = cKDTree(S[~bad]); blk[bad] = blk[~bad][t.query(S[bad])[1]]
    # rows, as the plan's row numbers stand on the model's bands (wb_nums.py's
    # row numbers, taken on to the model): Level 1 band b is row b, past its
    # walkway row b + 1 (its rows 29 and 30 are the walkway's); Level 2 bands
    # 0-6 are rows 1-7, 9-17 rows 8-16 (7 and 8 the walkway); Level 5 band b is
    # row b + 1, but its north side's blocks (the model numbers their bands on
    # from the corners') count from 1 at their own front
    row = np.zeros(len(S), int)
    first = {}
    for k in np.unique(blk):
        m = blk == k; bc = np.bincount(R[m]); b_first = int(np.nonzero(bc >= 3)[0][0]) if (bc >= 3).any() else int(R[m].min())
        first[NAMES[k]] = b_first
        if name == 'L1': rr = R[m]                     # (bands 1-44: rows 1-44, as the plan's back row)
        elif name == 'L2': rr = np.where(R[m] >= 9, R[m] - 1, R[m] + 1)
        else:
            north = S[m, 0].mean() > 30 and b_first >= 5
            rr = R[m] - b_first + 1 if north else R[m] + 1
        row[m] = np.maximum(rr, 1)
    # seats: numbered clockwise along each row, on from one block to the
    # next round a quarter of the bowl, from 1 again at the quarter's first
    # block (the plan: 501 1-30, 502 31-60, ... 513 to 391, 514 from 1; the
    # blocks where the plan prints seat 1, wb_nums.py's seat numbers)
    RESET = {'L1': ('101', '112', '123', '134'), 'L2': ('202', '214', '227', '240'), 'L5': ('501', '514', '527', '540')}[name]
    ks = [k for k in np.unique(blk)]
    mid = {k: np.angle(np.exp(1j * ph[blk == k]).mean()) % (2 * np.pi) for k in ks}
    order = sorted(ks, key=lambda k: mid[k])
    i0 = next(i for i, k in enumerate(order) if NAMES[k] == RESET[0]); order = order[i0:] + order[:i0]
    num = np.zeros(len(S), int)
    for r in np.unique(row):
        nxt = 1
        for k in order:
            if NAMES[k] in RESET: nxt = 1
            idx = np.nonzero((blk == k) & (row == r))[0]
            if not len(idx): continue
            o = idx[np.argsort(np.angle(np.exp(1j * (ph[idx] - mid[k]))))]
            num[o] = nxt + np.arange(len(o)); nxt += len(o)
    starts_used = {NAMES[k]: int(num[(blk == k)].min()) for k in ks}
    lab = np.c_[np.array([bid(NAMES[k]) for k in blk]), row, num].astype('<i2')
    L['labels'] = base64.b64encode(lab.tobytes()).decode('ascii')
    report[name] = dict(seats=len(S), blocks=len(np.unique(blk)), unplaced=int(bad.sum()),
                        rows=(int(row.min()), int(row.max())), starts=starts_used, first=first)
    print(name, 'seats', len(S), 'blocks', len(np.unique(blk)), 'unplaced', int(bad.sum()), 'rows', row.min(), row.max())
# ── Level 3: the boxes' balcony seats, by box ──
for L in d['levels']:
    if L['name'] == 'L3':
        S, R = decode(L); B = np.array(L['boxes'])
        num = np.zeros(len(S), int); ph = phi(S)
        for k in np.unique(B):
            m = np.nonzero(B == k)[0]
            for r in (0, 1):
                idx = m[R[m] == r]; o = idx[np.argsort(np.angle(np.exp(1j * (ph[idx] - ph[m].mean()))))]
                num[o] = np.arange(1, len(o) + 1)
        lab = np.c_[[bid('B%03d' % k) for k in B], R + 1, num].astype('<i2')
        L['labels'] = base64.b64encode(lab.tobytes()).decode('ascii')
        print('L3 boxes', len(np.unique(B)), 'seats', len(S))
    if L['name'] == 'L4':
        S, R = decode(L); ph = phi(S); num = np.zeros(len(S), int)
        for r in (0, 1):
            idx = np.nonzero(R == r)[0]; o = idx[np.argsort(np.angle(np.exp(1j * (ph[idx] - np.pi * 0))))]
            num[o] = np.arange(1, len(o) + 1)
        lab = np.c_[np.full(len(S), bid('L4')), R + 1, num].astype('<i2')
        L['labels'] = base64.b64encode(lab.tobytes()).decode('ascii')
        print('L4 seats', len(S))
d['blockNames'] = names
json.dump(d, open('wb_stands.json', 'w'), separators=(',', ':'))
json.dump(report, open('wb/wb_labels_report.json', 'w'), indent=1)
print('blockNames', len(names))
# ── the lightsticks' lines: Level 1's aisles, straight ──
# Every aisle of Level 1 is a run of gaps between its rows' seats, one a row:
# the gaps' middles within 1.4 m of one another, row to row, eight rows or
# more, are one aisle; each aisle a straight line fitted through them (the
# strays dropped), and an aisle's pieces either side of the walkway that
# run on in one line made one. The app cuts every level by these lines
# (stands.js `data.sectorLines`), the boxes' balconies and the Royal Box too.
from scipy.spatial import cKDTree as _KD
L1d = next(L for L in d['levels'] if L['name'] == 'L1')
S1, R1 = decode(L1d)
# each row's gaps between seats (an aisle: 1.0-3.0 m; wider, a vomitory's mouth or a tunnel), their middles
ph1 = phi(S1); C, CR = [], []
for r in np.unique(R1):
    idx = np.nonzero(R1 == r)[0]; o = idx[np.argsort(ph1[idx])]
    P = S1[o]; g = np.linalg.norm(np.diff(P, axis=0), axis=1)
    for k in np.nonzero((g > 1.0) & (g < 3.0))[0]: C.append((P[k] + P[k + 1]) / 2); CR.append(r)
C = np.array(C); CR = np.array(CR)
# an aisle: the middles row to row (the next row's within 1.4 m)
par = list(range(len(C)))
def _r(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for i, j in _KD(C).query_pairs(1.4):
    if abs(CR[i] - CR[j]) == 1: par[_r(i)] = _r(j)
groups = collections.defaultdict(list)
for i in range(len(C)): groups[_r(i)].append(i)
groups = {k: v for k, v in groups.items() if len(set(CR[v])) >= 8}
def fit(P):
    keep = np.ones(len(P), bool)
    for _ in range(5):
        m = P[keep].mean(0); u = np.linalg.svd(P[keep] - m)[2][0]
        dd = np.abs((P - m) @ np.array([-u[1], u[0]]))
        nk = dd <= max(0.4, 2.5 * np.median(dd))
        if nk.sum() < 4 or (nk == keep).all(): break
        keep = nk
    m = P[keep].mean(0); u = np.linalg.svd(P[keep] - m)[2][0]
    if u @ m < 0: u = -u                       # (pointing out from the middle)
    return m, u, P[keep]
lines = [fit(C[g]) for g in groups.values()]
# (two pieces of one aisle, either side of the walkway: in one line, within 1.5 m of each other's line and 6 degrees)
merged = True
while merged:
    merged = False
    for a in range(len(lines)):
        for b in range(a + 1, len(lines)):
            ma, ua, Pa = lines[a]; mb, ub, Pb = lines[b]
            if abs(ua @ ub) < np.cos(np.radians(6)): continue
            if abs((mb - ma) @ np.array([-ua[1], ua[0]])) > 1.5 or abs((ma - mb) @ np.array([-ub[1], ub[0]])) > 1.5: continue
            # (and end to end: not two aisles that happen to lie in one line at the two ends of the bowl)
            ta, tb = Pa @ ua, Pb @ ua
            if max(tb.min() - ta.max(), ta.min() - tb.max()) > 15: continue
            lines[a] = fit(np.r_[Pa, Pb]); lines.pop(b); merged = True; break
        if merged: break
# (the corner tunnels, the widest aisles of all, through the middle of a
# corner's seats: their two side walls (cutWalls), each a line, where no
# aisle's runs alongside)
for w in d.get('cutWalls', []):
    P = np.array(w['pts'], float)[:, :2]
    m0 = P.mean(0); u = np.linalg.svd(P - m0)[2][0]
    if u @ m0 < 0: u = -u
    if any(abs(u @ ul) > np.cos(np.radians(8)) and abs((ml - m0) @ np.array([-u[1], u[0]])) < 1.5 for ml, ul, _ in lines): continue
    lines.append((m0, u, None))
d['sectorLines'] = [[round(float(m[0]), 3), round(float(m[1]), 3), round(float(u[0]), 5), round(float(u[1]), 5)] for m, u, _ in sorted(lines, key=lambda t: np.arctan2(t[0][0], t[0][1]))]
json.dump(d, open('wb_stands.json', 'w'), separators=(',', ':'))
print('Level 1 aisles (lightsticks\' lines)', len(d['sectorLines']), 'from', len(groups), 'runs of gaps')
