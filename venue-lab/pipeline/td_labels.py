import sys, re, json, base64, numpy as np, cv2
sys.path.insert(0, 'Song2Concert/venue-lab/pipeline')
import td_upper as U

d = json.load(open('Song2Concert/venue-lab/pipeline/td_stands.json'))
real = json.load(open('Song2Concert/venue-lab/pipeline/td/td_rows_real.json'))
lab = json.load(open('Song2Concert/venue-lab/pipeline/td/td_labeled.json'))
vec = json.load(open('Song2Concert/venue-lab/pipeline/td/td_vec.json'))
Hm = np.array([579.2, 441.7]); s_map = 2.996; O = np.array([0.0, -60.0])

block_names = []
block_id_of = {}
def get_bid(nm):
    if nm not in block_id_of:
        block_id_of[nm] = len(block_names)
        block_names.append(nm)
    return block_id_of[nm]

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
        pts_blk = S[m_blk, :2].astype(float) / 10.0
        c_blk = pts_blk.mean(0)
        # vector along row from home side to outfield side:
        # home plate is at (0, 0); for k==25 (behind home), +x (1B side) is lower seat numbers
        for j in js:
            idx = np.where(S[:, 2] == j)[0]
            rr = int(26 - (js[-1] - j)) if nm == 'A' else int(27 + (j - js[0]))
            pts = S[idx, :2].astype(float) / 10.0
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
    L['labels'] = base64.b64encode(labels.tobytes()).decode('ascii')

# 2. Level F (F01..F20)
# Build 20 F block centroids ordered by angle from left-field pole (-45 deg) to right-field pole (+45 deg)
L_F = next(l for l in d['levels'] if l['name'] == 'F')
S_F = np.frombuffer(base64.b64decode(L_F['seats']), dtype=np.int16).reshape(-1, 4)
pts_F = S_F[:, :2].astype(float) / 10.0
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
F_named = []
for idx_l, p in enumerate(F_Left): F_named.append((f'F{idx_l + 1:02d}', p))
for idx_r, p in enumerate(F_Right): F_named.append((f'F{12 + idx_r:02d}', p))

labels_F = np.zeros((len(S_F), 3), dtype=np.int16)
from shapely.geometry import Point as _Pt
f_owner = []
for pt in pts_F:
    p_geom = _Pt(pt[0], pt[1])
    best_nm = min(F_named, key=lambda item: item[1].distance(p_geom))[0]
    f_owner.append(best_nm)
f_owner = np.array(f_owner)
r_F = (S_F[:, 2] % 19) + 1
for bnm in sorted(set(f_owner)):
    bid = get_bid(bnm)
    k_num = int(bnm[1:])
    for rr in range(1, 20):
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
L_F['labels'] = base64.b64encode(labels_F.tobytes()).decode('ascii')

# 3. Level G (Excite Seats G05..G15 on 1B, G35..G45 on 3B)
L_G = next(l for l in d['levels'] if l['name'] == 'G')
S_G = np.frombuffer(base64.b64decode(L_G['seats']), dtype=np.int16).reshape(-1, 4)
pts_G = S_G[:, :2].astype(float) / 10.0
g_centers = []
for _w in vec['words']:
    if re.fullmatch(r'G\d\d', _w[4]) and _w[4] not in ('G03', 'G04', 'G46', 'G47'):
        cx_, cy_ = (_w[0] + _w[2]) / 2, (_w[1] + _w[3]) / 2
        pt_m = (np.array([cx_, cy_]) - Hm) / s_map
        g_centers.append((_w[4], pt_m))
labels_G = np.zeros((len(S_G), 3), dtype=np.int16)
g_owner = np.array([min(g_centers, key=lambda item: np.hypot(pt[0] - item[1][0], pt[1] - item[1][1]))[0] for pt in pts_G])
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
        nums = nums_for(bnm, rr, len(idx_ord))
        for pos, sn in zip(idx_ord, nums):
            labels_G[pos] = (bid, rr, sn)
L_G['labels'] = base64.b64encode(labels_G.tobytes()).decode('ascii')

# 4. Level C (2F Balcony C01..C48 on 1B, C51..C97 on 3B)
L_C = next(l for l in d['levels'] if l['name'] == 'C')
S_C = np.frombuffer(base64.b64decode(L_C['seats']), dtype=np.int16).reshape(-1, 4)
pts_C = S_C[:, :2].astype(float) / 10.0
th_C = np.degrees(np.arctan2(pts_C[:, 0] - O[0], pts_C[:, 1] - O[1]))
_wds = vec['words']
_cth = []
for _i, _w in enumerate(_wds):
    if _w[4] == 'C' and _i + 1 < len(_wds) and _wds[_i + 1][4].isdigit():
        _n = int(_wds[_i + 1][4])
        if 1 <= _n <= 48:
            _p = (np.array([(_w[0] + _wds[_i + 1][2]) / 2, (_w[1] + _wds[_i + 1][3]) / 2]) - Hm) / s_map - O
            _cth.append((_n, float(np.degrees(np.arctan2(_p[0], _p[1])))))
_cth.sort()
# Pair boundaries for C blocks (24 sectors per side -> C02..C48 even/odd pairs)
c_angles = sorted([t for _, t in _cth])
c_bounds = [0.5 * (c_angles[i] + c_angles[i + 1]) for i in range(len(c_angles) - 1)]
labels_C = np.zeros((len(S_C), 3), dtype=np.int16)
c_owner = []
for th in th_C:
    ath = abs(th)
    sec_i = int(np.searchsorted(c_bounds, ath)) # 0 (near home) .. 47 (near pole)
    if th > 0:
        blk_n = max(1, min(48, 48 - sec_i))
    else:
        blk_n = max(51, min(97, 51 + sec_i))
    c_owner.append(f'C{blk_n:02d}')
c_owner = np.array(c_owner)
for bnm in sorted(set(c_owner)):
    bid = get_bid(bnm)
    k_num = int(bnm[1:])
    s0 = ((48 - k_num) if k_num <= 48 else (k_num - 51)) * 6 + 1
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
    pts = S[:, :2].astype(float) / 10.0
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
    L['labels'] = base64.b64encode(labels.tobytes()).decode('ascii')

d['blockNames'] = block_names
s_json = json.dumps(d, separators=(',', ':'))
open('Song2Concert/venue-lab/pipeline/td_stands.json', 'w').write(s_json)
chunks = [repr(s_json[i:i+4000]) for i in range(0, len(s_json), 4000)]
out = 'export const TD_STANDS = JSON.parse([\n  ' + ',\n  '.join(chunks) + '\n].join(\'\'));\n'
for js in ('Song2Concert/venue-lab/src/j0-td-data.js', 'Song2Concert/src/three/venues/td-data.js'):
    open(js, 'w').write(out)

print('Total blockNames:', len(block_names))
for l in d['levels']:
    lab_arr = np.frombuffer(base64.b64decode(l['labels']), dtype=np.int16).reshape(-1, 3)
    print(l['name'], 'labeled seats:', len(lab_arr), 'sample:', block_names[lab_arr[0, 0]], f'{lab_arr[0, 1]}열', f'{lab_arr[0, 2]}번', '->', block_names[lab_arr[-1, 0]], f'{lab_arr[-1, 1]}열', f'{lab_arr[-1, 2]}번')
