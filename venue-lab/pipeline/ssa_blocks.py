"""Levels of the Saitama Super Arena laid out from the official seat map
(ssa/ssa_chart.json, read by ssa_chart.py): each seat where the map draws it,
the rows counted from the arena side, each block's own rows kept (so a corner's
fan of wedges, a balcony's bands and the ends' straight blocks are as the map has
them), and the level's treads, depth field and row bands made from those seats
for the shared stand code (standgen)."""
import json, os, numpy as np, cv2
from scipy.spatial import cKDTree
from standlib import disk, seat_mask
from standlib import front_from
from standgen import Level, smooth_hull, behind_mask

HERE = os.path.dirname(os.path.abspath(__file__))
# The map draws each level at its own scale about the floor's centre (a seat is
# 0.5 m wide in all of them): metres = (map pixels - centre) / K
K = {'200': 20.0, '300': 24.6, '400': 28.8, '500': 33.8}


def load_chart(path=os.path.join(HERE, 'ssa', 'ssa_chart.json')):
    d = json.load(open(path))
    d['centre'] = np.array([d['arena'][0] + d['arena'][2] / 2, d['arena'][1] + d['arena'][3] / 2])
    return d


def to_metres(d, xy, level):
    return (np.asarray(xy, float) - d['centre']) / K[level]


def row_offsets(d, fix=None):
    """Each block's first row number (0-based) over the whole stack of blocks of its
    level: from the seat-number rules' rows, unless the row numbers printed on the
    map beside the rows (all agreeing) say another within two rows; `fix` overrides"""
    off = {}
    for b, o in d['blocks'].items():
        if not o['seats'] or o['lettered'] or not o.get('rule_rows'): continue
        r0 = o['rule_rows'][0] - 1; lab = o.get('labels')
        if lab:
            offs = {v - 1 - r for v, r in lab}
            if len(offs) == 1:
                x = offs.pop()
                if abs(x - r0) <= 2 and x >= 0: r0 = x
        off[int(b)] = r0
    off.update(fix or {})
    return off


def level_seats(d, level, off):
    """-> dict of arrays for a level's seats: P (metres), yaw (radians, 0 = facing +z),
    row (over the level), block id, local row, p (seat pitch) and q (row pitch) of each
    seat's block in metres, filled/added flags"""
    P, Y, R, B, L, PP, QQ, F, A = [], [], [], [], [], [], [], [], []
    for b, o in sorted(d['blocks'].items(), key=lambda kv: int(kv[0])):
        b = int(b)
        if o['level'] != level or o['lettered'] or not o['seats'] or b not in off: continue
        s = np.array(o['seats'], float)
        P.append(to_metres(d, s[:, :2], level)); Y.append(np.radians(s[:, 3])); L.append(s[:, 2].astype(int)); R.append(s[:, 2].astype(int) + off[b])
        B.append(np.full(len(s), b)); PP.append(np.full(len(s), o['pitch'] / K[level])); QQ.append(np.full(len(s), o['row_pitch'] / K[level]))
        F.append(s[:, 4].astype(int)); A.append(s[:, 5].astype(int))
    return dict(P=np.vstack(P), yaw=np.concatenate(Y), row=np.concatenate(R), block=np.concatenate(B), local=np.concatenate(L),
                p=np.concatenate(PP), q=np.concatenate(QQ), filled=np.concatenate(F), added=np.concatenate(A))


def cells(G, S, margin=0.0):
    """The level's treads before the aisles: one cell for each seat, its pitch along the
    row and its row pitch deep (rows meet at their middles), centred on the seat"""
    m = np.zeros((G.H, G.W), np.uint8)
    f = np.c_[np.sin(S['yaw']), np.cos(S['yaw'])]; e = np.c_[-f[:, 1], f[:, 0]]
    for (x, z), fv, ev, p, q in zip(S['P'], f, e, S['p'], S['q']):
        a = ev * (p / 2 + margin); b = fv * (q / 2 + margin)
        poly = np.array([[x, z] - a - b, [x, z] + a - b, [x, z] + a + b, [x, z] - a + b])
        gx, gz = G.g(poly[:, 0], poly[:, 1])
        cv2.fillConvexPoly(m, np.round(np.c_[gx, gz] * 16).astype(np.int32), 1, shift=4)
    return m


def depth_field(G, S, R, D, reach=12.0):
    """Depth in metres counted in rows (row r's middle at (r + 0.5) D, its front edge at
    r D): each cell takes its nearest seat's row, moved by the cell's distance back (away
    from the seat's front) in rows; defined `reach` metres round the treads, -1e3 beyond"""
    tree = cKDTree(S['P'])
    near = cv2.dilate(R.astype(np.uint8), disk(reach / G.res)) > 0
    ys, xs = np.nonzero(near)
    X, Z = G.m(xs, ys); Q = np.c_[X, Z]
    dist, i = tree.query(Q)
    f = np.c_[np.sin(S['yaw'][i]), np.cos(S['yaw'][i])]
    back = -((Q - S['P'][i]) * f).sum(1)               # metres behind the seat (away from its front)
    u = S['row'][i] + back / S['q'][i]
    d = np.full((G.H, G.W), -1e3, np.float32)
    d[ys, xs] = (u + 0.5) * D
    return d


def build_level(G, name, S, D, h0, rise, bottom='ground', fascia=2.6, aisle=1.3, hull_close=3.0, open_w=3.0, keep_hole=3.0, centre=(0, 0), strips=(), fills=()):
    """A `Level` (see standgen) for chart seats `S`: treads = the seats' cells with the
    aisles between blocks and the small gaps closed, depth from the rows themselves"""
    l = Level.__new__(Level)
    l.G, l.name, l.D, l.h0, l.rise, l.hs, l.bottom, l.fascia, l.centre = G, name, D, h0, rise, None, bottom, fascia, centre
    M = seat_mask(G, S['P']); l.seatmask = M
    cm = cells(G, S)
    for poly in strips:        # extra treads: the aisles beside a block's end where there is no block beyond
        gx, gz = G.g(poly[:, 0], poly[:, 1]); cv2.fillConvexPoly(cm, np.round(np.c_[gx, gz] * 16).astype(np.int32), 1, shift=4)
    # aisles between blocks and gaps of a seat or two: closed; a tunnel's mouth (wider) stays open
    for m in fills: cm[m] = 1   # gaps given back to the treads (an entrance bay at a stand's back: a landing)
    R = cv2.morphologyEx(cm, cv2.MORPH_CLOSE, disk(aisle / G.res))
    R = cv2.morphologyEx(R, cv2.MORPH_CLOSE, disk(0.5 / G.res))
    l.hull = smooth_hull(G, M, close=hull_close)
    inv = (1 - R).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for i in range(1, n):
        if st[i, 4] * G.res * G.res < keep_hole: R[lab == i] = 1
    R = cv2.morphologyEx(R, cv2.MORPH_OPEN, disk(0.5 / G.res))
    l.R = R
    d = depth_field(G, S, R > 0, D)
    # in front of the stand / behind it, as the rays from the arena's centre meet its first row
    l.F = front_from(G, l.hull, centre, rmax=90)
    l.behind = behind_mask(G, l.F, centre)
    # (the depth counted back from the front: negative in front of a block whose rows begin at the
    # front; a corner wedge that begins at its 5th row has a front of its own, not "the stand's")
    tree = cKDTree(S['P']); ys, xs = np.nonzero(d > -1e2); X, Z = G.m(xs, ys)
    _, i = tree.query(np.c_[X, Z])
    first = np.zeros(len(S['P']), bool)
    for b in np.unique(S['block']):
        m = S['block'] == b; first[m] = S['row'][m].min() == 0
    flip = ~l.behind[ys, xs] & first[i]
    d[ys[flip], xs[flip]] = -np.abs(d[ys[flip], xs[flip]])
    l.d = d
    l.row = S['row'].copy(); l.nrows = int(l.row.max()) + 1
    l.band = np.where(R > 0, np.clip(np.floor(l.d / D).astype(int), 0, l.nrows - 1), -1)
    l.seats = S['P'].copy(); l.yaw = S['yaw'].copy(); l.raw = l.seats.copy()
    l.block = S['block'].copy()
    # which block's seat is nearest (the sections of standgen: edge_walls' cheeks), each block's facing, and
    # the lateral reach of each block along its rows (its ends, for a balcony's concourse to end square with)
    sec = np.full((G.H, G.W), -1, np.int32); sec[ys, xs] = S['block'][i]
    fin = np.zeros((int(S['block'].max()) + 1, 2))
    for b in np.unique(S['block']):
        m = S['block'] == b; v = np.c_[np.sin(S['yaw'][m]), np.cos(S['yaw'][m])].mean(0); fin[b] = v / (np.linalg.norm(v) + 1e-9)
    f = np.c_[np.sin(S['yaw'][i]), np.cos(S['yaw'][i])]; lat = np.abs(-(np.c_[X, Z] - S['P'][i])[:, 0] * f[:, 1] + (np.c_[X, Z] - S['P'][i])[:, 1] * f[:, 0])
    ext = np.zeros((G.H, G.W), bool); ext[ys, xs] = lat <= S['p'][i] / 2 + 0.3
    l.extent = ext
    l._blk = {'sec': sec, 'fin': fin, 'pitch': 0.5}
    return l


def end_aisles(S, points, width=1.3, gap=0.9, maxdist=3.6):
    """For each door point (a gate's badge), the aisle beside the block end it stands at, on the side the point is on:
    along each row of the block, a cell `width` wide beside that row's last seat (so the strip follows the block's own
    end, a wedge's slanted one too, and never reaches out past its rows), unless a block stands beyond that row's end
    within `gap` of the seat's edge. -> polygons (4 x 2), one for each row"""
    tree = cKDTree(S['P']); out = []
    for q in points:
        dist, i = tree.query(q); b = S['block'][i]
        if dist > maxdist: continue
        f = np.array([np.sin(S['yaw'][i]), np.cos(S['yaw'][i])]); e = np.array([-f[1], f[0]])
        sgn = 1.0 if (np.asarray(q) - S['P'][i]) @ e > 0 else -1.0
        m = np.nonzero(S['block'] == b)[0]
        for r in np.unique(S['row'][m]):
            idx = m[S['row'][m] == r]
            j = idx[np.argmax(S['P'][idx] @ (e * sgn))]               # the row's last seat on that side
            fj = np.array([np.sin(S['yaw'][j]), np.cos(S['yaw'][j])]); ej = np.array([-fj[1], fj[0]]) * sgn
            p, qd = S['p'][j], S['q'][j]
            # a block beyond the end: no strip (the gap is its aisle)
            d2, k = tree.query(S['P'][j] + ej * (p / 2 + gap))
            if d2 < 0.9 and S['block'][k] != b: continue
            a0 = S['P'][j] + ej * (p / 2 + 0.05); a1 = a0 + ej * width
            out.append(np.array([a0 + fj * qd / 2, a1 + fj * qd / 2, a1 - fj * qd / 2, a0 - fj * qd / 2]))
    return out
