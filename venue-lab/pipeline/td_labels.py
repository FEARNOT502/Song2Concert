import sys, os, re, json, base64, numpy as np, cv2
# (the paths from this file's folder: it runs at the end of td_build.py, or on its own)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
PJ = lambda *a: os.path.join(HERE, *a)
import td_upper as U

d = json.load(open(PJ('td_stands.json')))
from td_overrides import effective, OVERRIDES
real = effective(json.load(open(PJ('td', 'td_rows_real.json'))))
lab = json.load(open(PJ('td', 'td_labeled.json')))
vec = json.load(open(PJ('td', 'td_vec.json')))
Hm = np.array([579.2, 441.7]); s_map = 2.996; O = np.array([0.0, -60.0])

block_names = []
block_id_of = {}
def get_bid(nm):
    if nm not in block_id_of:
        block_id_of[nm] = len(block_names)
        block_names.append(nm)
    return block_id_of[nm]

# Each seat's block, row and number as it was laid (td_build.py's td_seatlab.pkl: the chart's, td_gen.py's for the
# upper deck), found by its position; a seat it has none for is named as below, from where it stands
import pickle
from scipy.spatial import cKDTree
SIDE = pickle.load(open(PJ('td_seatlab.pkl'), 'rb')) if os.path.exists(PJ('td_seatlab.pkl')) else {}
SIDE_TOL = 0.12          # m: the seats move this little at most after they are laid (int16 at 1/10 or 1/50 m)
F_NROWS = 22             # the outfield's row ids per block class (td_build.py's F_ROWS + 1, its standing aisle)
STATS = {}
USED = {}
def from_side(key, pts, labels, rows=None, tol=SIDE_TOL, tag=None, todo=None):
    """fill `labels` (n, 3) from the sidecar's labels by position (and, given `rows`, the chart row each seat stands
    in: the upper deck's seats are drawn onto their rows' lines after they are laid, up to 0.3 m), each laid seat
    given to one seat only, nearest first; -> the mask of seats it named"""
    got = np.zeros(len(pts), bool) if todo is None else ~todo
    if key not in SIDE or not len(pts): return got
    P, LB = SIDE[key]; P = np.asarray(P, float)
    if not len(P): return got
    rP = np.array([q[1] for q in LB])
    pairs = []
    free = np.ones(len(P), bool); free[list(USED.get(key, ()))] = False
    io0 = np.nonzero(~got)[0]
    groups = [(io0, np.nonzero(free)[0])] if rows is None else [(io0[rows[io0] == r], np.nonzero(free & (rP == r))[0]) for r in np.unique(rows[io0])]
    for io, js in groups:
        if not len(io) or not len(js): continue
        dd, jj = cKDTree(P[js]).query(pts[io], k=min(3, len(js)))
        dd = np.atleast_2d(dd.T).T if dd.ndim == 1 else dd; jj = np.atleast_2d(jj.T).T if jj.ndim == 1 else jj
        for a_, i in enumerate(io):
            for c in range(dd.shape[1]):
                if dd[a_, c] < tol: pairs.append((dd[a_, c], i, js[jj[a_, c]]))
    pairs.sort(); used = USED.setdefault(key, set()); far = 0.0
    for dv, i, j in pairs:
        if got[i] or j in used: continue
        got[i] = True; used.add(j); far = max(far, dv)
        nm, rr, sn = LB[j]
        labels[i] = (get_bid(nm), rr, sn)
    STATS[tag or key] = (int(got.sum()), len(pts), round(max(far, STATS.get(tag or key, (0, 0, 0))[2]), 3))
    return got

def base_seat_of(nm, fallback_idx=0):
    if nm in real and real[nm]['rows']:
        return min(lo for ivs in real[nm]['rows'].values() for lo, _ in ivs)
    return fallback_idx * 20 + 1

def nums_for(nm, r_num, count, fallback_s0=1):
    if nm in real and str(r_num) in real[nm]['rows']:
        ivs = real[nm]['rows'][str(r_num)]
        nums = [sn for a, b in ivs for sn in range(a, b + 1)]
    elif nm == 'A02' and 'A48' in real and str(r_num) in real['A48']['rows']:
        ivs = real['A48']['rows'][str(r_num)]
        nums = [sn for a, b in ivs for sn in range(a, b + 1)]
    else:
        s0 = base_seat_of(nm) if nm in real else fallback_s0
        nums = list(range(s0, s0 + count))
    if len(nums) < count:
        last = nums[-1] if nums else fallback_s0 - 1
        nums.extend(range(last + 1, last + 1 + (count - len(nums))))
    return nums[:count]

# 1. Levels A and B
for nm in ('A', 'B'):
    L = next(l for l in d['levels'] if l['name'] == nm)
    hs = np.array(L['hs'])
    splits = [0] + list(np.where(np.diff(hs) < -1.0)[0] + 1) + [len(hs)]
    S = np.frombuffer(base64.b64decode(L['seats']), dtype=np.int16).reshape(-1, 4)
    labels = np.zeros((len(S), 3), dtype=np.int16)
    for i, (a, b) in enumerate(zip(splits[:-1], splits[1:])):
        k = (i // 2) + 1 if i % 2 == 0 else 49 - (i // 2)
        bnm = ('A01' if k == 1 else 'A49') if k in (1, 49) else f'{nm}{k:02d}'
        bid = get_bid(bnm)
        m_blk = (S[:, 2] >= a) & (S[:, 2] < b)
        js = np.unique(S[m_blk, 2])
        if not len(js): continue
        # Order seats within each row from home-plate side toward outfield side
        pts_blk = S[m_blk, :2].astype(float) / L.get('seatScale', 10)
        c_blk = pts_blk.mean(0)
        # vector along row from home side to outfield side:
        # home plate is at (0, 0); for k==25 (behind home), +x (1B side) is lower seat numbers
        for j in js:
            idx = np.where(S[:, 2] == j)[0]
            rr = int(26 - (js[-1] - j)) if nm == 'A' else int(27 + (j - js[0]))
            pts = S[idx, :2].astype(float) / L.get('seatScale', 10)
            if k == 25:
                order = np.argsort(-pts[:, 0])
            else:
                # distance along arc away from home plate (0, 0)
                ang = np.abs(np.arctan2(pts[:, 0], -pts[:, 1]))
                order = np.argsort(ang)
            idx_ord = idx[order]
            nums = nums_for(bnm, rr, len(idx_ord))
            for pos, sn in zip(idx_ord, nums):
                labels[pos] = (bid, rr, sn)
    from_side('AB', S[:, :2].astype(float) / L.get('seatScale', 10), labels, tag=nm)
    L['labels'] = base64.b64encode(labels.tobytes()).decode('ascii')

# 2. Level F (F01..F20)
# Build 20 F block centroids ordered by angle from left-field pole (-45 deg) to right-field pole (+45 deg)
L_F = next(l for l in d['levels'] if l['name'] == 'F')
S_F = np.frombuffer(base64.b64decode(L_F['seats']), dtype=np.int16).reshape(-1, 4)
pts_F = S_F[:, :2].astype(float) / L_F.get('seatScale', 10)
# Use chart_blocks F polygons from td_stand1
_K = 6.0
_ink = np.zeros((int(900 * _K), int(1200 * _K)), np.uint8)
for _p in vec['polys']:
    cv2.polylines(_ink, [(np.array(_p['pts'], float) * _K).round().astype(np.int32)], bool(_p['closed']), 255, 2)
BOXN = ['']; _lk = np.zeros(_ink.shape, np.int16)
for _w in vec['words']:
    cx_, cy_ = (_w[0] + _w[2]) / 2, (_w[1] + _w[3]) / 2
    if re.fullmatch(r'[ABF]\d\d', _w[4]): _w = list(_w); _num = _w[4][1:]; _w[4] = _w[4][0]
    elif _w[4] in ('A', 'B', 'F'):
        _nn = [w for w in vec['words'] if re.fullmatch(r'\d\d', w[4]) and abs((w[0] + w[2]) / 2 - cx_) < 14 and abs((w[1] + w[3]) / 2 - cy_) < 14]
        if not _nn: continue
        _num = min(_nn, key=lambda w: np.hypot((w[0] + w[2]) / 2 - cx_, (w[1] + w[3]) / 2 - cy_))[4]
    else: continue
    _m = np.zeros((_ink.shape[0] + 2, _ink.shape[1] + 2), np.uint8)
    _n = cv2.floodFill(_ink.copy(), _m, (int(cx_ * _K), int(cy_ * _K)), 128, flags=4)[0]
    if _n / _K**2 / s_map**2 > 400: continue
    BOXN.append(_w[4] + _num); _lk[(_m[1:-1, 1:-1] > 0) & (_lk == 0)] = len(BOXN) - 1
from standlib import Grid
import td_stand1 as T1
G = Grid(-140, 140, -200, 110, 0.1)
_Xg, _Zg = G.m(*np.meshgrid(np.arange(G.W), np.arange(G.H)))
_pxb = ((_Xg * s_map + Hm[0]) * _K).astype(np.float32)
_pyb = ((_Zg * s_map + Hm[1]) * _K).astype(np.float32)
BOXL = cv2.remap(_lk, _pxb, _pyb, cv2.INTER_NEAREST, borderValue=0)
_, _, F_ch = T1.chart_blocks(lab, BOXL, BOXN, G)
# Sort the 20 F polygons from left field (-x, F01) to right field (+x, F20)
F_sorted = sorted(F_ch, key=lambda p: np.arctan2(p.centroid.x, -p.centroid.y))
# Wait: there are 18 polygons in F_ch (9 on LF, 9 on RF: F01..F09 and F12..F20, with F10/F11 in the backscreen)
# Filter out backscreen polygons (|angle| < 8.4 deg) so the 9 LF polygons are F01..F09 and 9 RF polygons are F12..F20
F_Left = [p for p in F_sorted if np.degrees(np.arctan2(p.centroid.x, -p.centroid.y)) < -8.0][:9]
F_Right = [p for p in F_sorted if np.degrees(np.arctan2(p.centroid.x, -p.centroid.y)) > 8.0][-9:]
# (named by the block number the chart prints in each: the chart has F06's outline twice, so
# naming them in order round the field put every name past it one block out)
F_named = {}
for o in lab:
    if o['L'] != 'F' or len(o['nums']) > 6: continue
    k = next((v for v in o['nums'][:2] if 1 <= v <= 20), None)
    if k is None: continue
    F_named.setdefault(f'F{k:02d}', T1._outline([T1._toR(o['poly'])]))
F_named = sorted(F_named.items())
labels_F = np.zeros((len(S_F), 3), dtype=np.int16)
from shapely.geometry import Point as _Pt
f_owner = []
for pt in pts_F:
    p_geom = _Pt(pt[0], pt[1])
    best_nm = min(F_named, key=lambda item: item[1].distance(p_geom))[0]
    # (the chart draws F10 and F11 as one box at centre field: F11 its 1B side)
    if best_nm == 'F10' and pt[0] > 0: best_nm = 'F11'
    f_owner.append(best_nm)
f_owner = np.array(f_owner)
r_F = (S_F[:, 2] % F_NROWS) + 1
# (no chart, no name: F10 is the backscreen's, F11 has rows 5-10 only)
f_owner = np.where((f_owner == 'F10') | ((f_owner == 'F11') & ((r_F < 5) | (r_F > 10))), np.where(pts_F[:, 0] > 0, 'F12', 'F09'), f_owner)
for bnm in sorted(set(f_owner)):
    bid = get_bid(bnm)
    k_num = int(bnm[1:])
    for rr in range(1, F_NROWS + 1):
        idx = np.where((f_owner == bnm) & (r_F == rr))[0]
        if not len(idx): continue
        pts = pts_F[idx]
        # On RF (k >= 11), seat numbers increase from pole (+x) toward center; on LF (k <= 10), from pole (-x) toward center
        ang = np.abs(np.arctan2(pts[:, 0], -pts[:, 1]))
        order = np.argsort(-ang)
        idx_ord = idx[order]
        nums = nums_for(bnm, rr, len(idx_ord))
        for pos, sn in zip(idx_ord, nums):
            labels_F[pos] = (bid, rr, sn)
from_side('F', pts_F, labels_F, rows=r_F)
L_F['labels'] = base64.b64encode(labels_F.tobytes()).decode('ascii')

# 3. Level G (Excite Seats G05..G15 on 1B, G35..G45 on 3B)
L_G = next(l for l in d['levels'] if l['name'] == 'G')
S_G = np.frombuffer(base64.b64decode(L_G['seats']), dtype=np.int16).reshape(-1, 4)
pts_G = S_G[:, :2].astype(float) / L_G.get('seatScale', 10)
g_centers = []
for _w in vec['words']:
    if re.fullmatch(r'G\d\d', _w[4]) and _w[4] not in ('G03', 'G04', 'G46', 'G47'):
        cx_, cy_ = (_w[0] + _w[2]) / 2, (_w[1] + _w[3]) / 2
        pt_m = (np.array([cx_, cy_]) - Hm) / s_map
        g_centers.append((_w[4], pt_m))
labels_G = np.zeros((len(S_G), 3), dtype=np.int16)
# (td_build.py names each seat's block as it lays them from the chart)
g_nums = np.array(L_G.pop('gnums')) if 'gnums' in L_G else None
g_owner = np.array(L_G.pop('gblocks')) if 'gblocks' in L_G else np.array([min(g_centers, key=lambda item: np.hypot(pt[0] - item[1][0], pt[1] - item[1][1]))[0] for pt in pts_G])
for bnm in sorted(set(g_owner)):
    bid = get_bid(bnm)
    for r0 in range(6):
        rr = r0 + 1
        idx = np.where((g_owner == bnm) & (S_G[:, 2] == r0))[0]
        if not len(idx): continue
        pts = pts_G[idx]
        ang = np.abs(np.arctan2(pts[:, 0], -pts[:, 1]))
        order = np.argsort(ang)
        idx_ord = idx[order]
        nums = nums_for(bnm, rr, len(idx_ord)) if g_nums is None else g_nums[idx_ord]
        for pos, sn in zip(idx_ord, nums):
            labels_G[pos] = (bid, rr, sn)
L_G['labels'] = base64.b64encode(labels_G.tobytes()).decode('ascii')
# (each block its own heights: the seat's third field becomes an index into a fine table of them)
if 'seatY' in L_G:
    _sy = np.array(L_G.pop('seatY')); S_G = S_G.copy()
    S_G[:, 2] = np.round(_sy / 0.02).astype(np.int16)
    L_G['hs'] = [round(k * 0.02, 3) for k in range(300)]
    L_G['seats'] = base64.b64encode(S_G.astype('<i2').tobytes()).decode('ascii')

# 4. Level C (2F Balcony C01..C48 on 1B, C51..C97 on 3B)
L_C = next(l for l in d['levels'] if l['name'] == 'C')
S_C = np.frombuffer(base64.b64decode(L_C['seats']), dtype=np.int16).reshape(-1, 4)
pts_C = S_C[:, :2].astype(float) / L_C.get('seatScale', 10)
th_C = np.degrees(np.arctan2(pts_C[:, 0] - O[0], pts_C[:, 1] - O[1]))
_wds = vec['words']
_cth = []
for _i, _w in enumerate(_wds):
    if _w[4] == 'C' and _i + 1 < len(_wds) and _wds[_i + 1][4].isdigit():
        _n = int(_wds[_i + 1][4])
        if 1 <= _n <= 48 or 51 <= _n <= 97:
            _p = (np.array([(_w[0] + _wds[_i + 1][2]) / 2, (_w[1] + _wds[_i + 1][3]) / 2]) - Hm) / s_map - O
            import td_upper as _U; _cth.append((_n, float(_U.c_squeeze(abs(np.degrees(np.arctan2(_p[0], _p[1])))))))
# (C50, the mirror of C48, has no label on the map: td_build.py lays it there)
_cth.append((50, min(t for n, t in _cth if n <= 48)))
_cth.sort()
# Pair boundaries for C blocks (24 sectors per side -> C02..C48 even/odd pairs)
c_angles = sorted([abs(t) for n, t in _cth if n <= 48])
c_bounds = [0.5 * (c_angles[i] + c_angles[i + 1]) for i in range(len(c_angles) - 1)]
c_angles3 = sorted([abs(t) for n, t in _cth if n >= 50])
c_bounds3 = [0.5 * (c_angles3[i] + c_angles3[i + 1]) for i in range(len(c_angles3) - 1)]
labels_C = np.zeros((len(S_C), 3), dtype=np.int16)
c_owner = []
for th in th_C:
    ath = abs(th)
    sec_i = int(np.searchsorted(c_bounds if th > 0 else c_bounds3, ath)) # 0 (near home) .. near the pole
    if th > 0:
        blk_n = max(1, min(48, 48 - sec_i))
    else:
        blk_n = max(50, min(97, 50 + sec_i))
    # (behind home, the S blocks, 14 a side, out from the VIP box)
    if ath < 33.7:
        k_s = max(0, min(13, int((ath - 2.6) / ((33.7 - 2.6) / 14))))
        c_owner.append(f'S{(101 if th > 0 else 301) + k_s}')
        continue
    c_owner.append(f'C{blk_n:02d}')
c_owner = np.array(c_owner)
for bnm in sorted(set(c_owner)):
    bid = get_bid(bnm)
    k_num = int(bnm[1:])
    s0 = 1 if bnm[0] == 'S' else ((48 - k_num) if k_num <= 48 else (k_num - 50)) * 16 + 1
    for r0 in range(4):
        rr = r0 + 1
        idx = np.where((c_owner == bnm) & (S_C[:, 2] == r0))[0]
        if not len(idx): continue
        order = np.argsort( np.abs(th_C[idx]) )
        idx_ord = idx[order]
        for q, pos in enumerate(idx_ord):
            labels_C[pos] = (bid, rr, s0 + q)
L_C['labels'] = base64.b64encode(labels_C.tobytes()).decode('ascii')

# 5. Levels D (D01..D51) and E (E06..E46)
def spans(L_ch):
    out = []
    for o in lab:
        if o['L'] != L_ch or len(o['nums']) > 6: continue
        a = (np.array(o['poly']) - Hm) / s_map - O
        t = np.degrees(np.arctan2(a[:, 0], a[:, 1]))
        n = [v for v in o['nums'] if v < 60]
        out.append((t.min(), t.max(), n))
    return sorted(out)
def aisle_sectors(blocks, r, amin=1.3):
    order = sorted(range(len(blocks)), key=lambda i: blocks[i][0]); dmin = np.degrees(amin / r)
    a = [blk[0] for blk in blocks]; b = [blk[1] for blk in blocks]
    for i, j in zip(order[:-1], order[1:]):
        gap = blocks[j][0] - blocks[i][1]
        if gap < dmin: b[i] -= (dmin - gap) / 2; a[j] += (dmin - gap) / 2
    a[order[0]] += dmin / 2; b[order[-1]] -= dmin / 2
    return list(zip(a, b))
Dsp = [x for x in spans('D') if len(x[2]) >= 3]; Esp = spans('E')
allD = sorted([(t0, t1) for t0, t1, _ in Dsp] + [(t0, t1) for t0, t1, _ in U.both_sides(U.DX)], reverse=True)
allE = sorted([(t0, t1) for t0, t1, _ in Esp] + [(t0, t1) for t0, t1, _ in U.both_sides(U.EX)], reverse=True)
secD = list(zip(range(1, 52), aisle_sectors(allD, 85.0, 1.3)))
secE = list(zip(range(6, 47), aisle_sectors(allE, 110.0, 1.3)))

for nm, secs, r_base in (('D', secD, 1), ('E', secE, 11)):
    L = next(l for l in d['levels'] if l['name'] == nm)
    S = np.frombuffer(base64.b64decode(L['seats']), dtype=np.int16).reshape(-1, 4)
    pts = S[:, :2].astype(float) / L.get('seatScale', 10)
    th = np.degrees(np.arctan2(pts[:, 0] - O[0], pts[:, 1] - O[1]))
    labels = np.zeros((len(S), 3), dtype=np.int16)
    owner = []
    for t in th:
        best_k = min(secs, key=lambda item: 0.0 if item[1][0] <= t <= item[1][1] else min(abs(t - item[1][0]), abs(t - item[1][1])))[0]
        owner.append(f'{nm}{best_k:02d}')
    owner = np.array(owner)
    for bnm in sorted(set(owner)):
        bid = get_bid(bnm)
        k_num = int(bnm[1:])
        for r0 in np.unique(S[owner == bnm, 2]):
            rr = int(r0 + r_base)
            idx = np.where((owner == bnm) & (S[:, 2] == r0))[0]
            if not len(idx): continue
            if k_num == 26:
                order = np.argsort(-pts[idx, 0])
            else:
                order = np.argsort(np.abs(th[idx]))
            idx_ord = idx[order]
            nums = nums_for(bnm, rr, len(idx_ord))
            for pos, sn in zip(idx_ord, nums):
                labels[pos] = (bid, rr, sn)
    _g = from_side(nm, pts, labels, rows=S[:, 2].astype(int) + r_base, tol=0.45)
    # (where the level draws a seat onto the next row's tread, near the poles: by position alone)
    from_side(nm, pts, labels, tol=0.9, todo=~_g)
    L['labels'] = base64.b64encode(labels.tobytes()).decode('ascii')

# the box rows the renderer gives counters (dome.js): the Sky Terrace (D rows 8-9 where the chart has two boxes a row)
# and the 3B side's press seats and 3rd Platinum Box (td_boxes.py, carried in B's `boxRows`)
_box = [{'level': 'D', 'block': nm, 'row': int(r), 'per': 4, 'kind': 'terrace'} for nm, v in sorted(real.items()) if nm[0] == 'D' for r, ivs in v['rows'].items() if len(ivs) == 2]
_LB = next(l for l in d['levels'] if l['name'] == 'B')
_box += [dict(level='B', **q) for q in _LB.pop('boxRows', d.get('boxRows', [])) if 'level' not in q] + [q for q in d.get('boxRows', []) if 'level' in q and q['level'] == 'B']
d['boxRows'] = _box
_LB.pop('tables', None)

# every seat's name once, numbers along each row in order
_seen = {}; _dups = 0
for l in d['levels']:
    lab_arr = np.frombuffer(base64.b64decode(l['labels']), dtype=np.int16).reshape(-1, 3)
    for q in map(tuple, lab_arr):
        if q in _seen: _dups += 1
        _seen[q] = 1
print('labels from the lay (matched / seats / furthest m):', STATS, ' duplicate names:', _dups)

d['blockNames'] = block_names
import td_review
d=td_review.labelled(d)
d['seatOverrides']=[{'block':k,'reason':v} for k,v in OVERRIDES.items()]
import td_seatfit
d=td_seatfit.apply(d,real,SIDE)
s_json = json.dumps(d, separators=(',', ':'))
open(PJ('td_stands.json'), 'w').write(s_json)
chunks = [repr(s_json[i:i+4000]) for i in range(0, len(s_json), 4000)]
out = 'export const TD_STANDS = JSON.parse([\n  ' + ',\n  '.join(chunks) + '\n].join(\'\'));\n'
for js in (PJ('..', 'src', 'j0-td-data.js'), os.environ.get('TD_APP_DATA', PJ('..', '..', 'src', 'three', 'venues', 'td-data.js'))):
    os.makedirs(os.path.dirname(js), exist_ok=True)
    open(js, 'w').write(out if js.endswith('td-data.js') and not js.endswith('j0-td-data.js') else out.replace('export const ', 'const ', 1))

print('Total blockNames:', len(block_names))
for l in d['levels']:
    lab_arr = np.frombuffer(base64.b64decode(l['labels']), dtype=np.int16).reshape(-1, 3)
    print(l['name'], 'labeled seats:', len(lab_arr), 'sample:', block_names[lab_arr[0, 0]], f'{lab_arr[0, 1]}열', f'{lab_arr[0, 2]}번', '->', block_names[lab_arr[-1, 0]], f'{lab_arr[-1, 1]}열', f'{lab_arr[-1, 2]}번')
