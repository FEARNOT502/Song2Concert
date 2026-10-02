#!/usr/bin/env python3
"""The official seat map of the Saitama Super Arena (main arena, end stage 2) read
into plan data: every block's outline, every seat where the map draws it, each
seat's row, and the 94 doors of the seating levels.

  python3 ssa_chart.py            # fetch (if needed) and write ssa/ssa_chart.json

Sources (www.saitama-arena.co.jp/seat_view/): img/img-map_arena_end02.svg (block
outlines `highlight_<id>`, door badges `gate_<n>`, the arena floor `arena_1`),
img/img-map_arena_end02.png (the drawing: a seat is a grey outline square, or a
cyan filled square where the map numbers it; row numbers in magenta, seat
numbers in cyan), js/seat_list.js (the seat-number ranges and rows per block,
used here only to check the counts). They are fetched into ssa/raw/ (not kept in
the repository); the result, in map pixels, is ssa/ssa_chart.json.

How the seats are read: every enclosed cell of a grey outline that is a small
rectangle, plus the compact cyan squares. Seats hidden under a number label
(the 3-digit blue figures stand over the first or last seats of a row and over
the gaps between runs) are put back along the row where the outline's own
across-row edges still show (or the label's ink covers the cell between two
seats of one row). Rows follow from the seats' neighbours: the seats of a row
are the chain of seats one pitch apart along it, the next row is the chain one
row pitch across, counted from the front (the side toward the arena)."""
import os, re, sys, json, subprocess, collections, urllib.request
import numpy as np, cv2
from PIL import Image
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'ssa', 'raw')
OUT = os.path.join(HERE, 'ssa', 'ssa_chart.json')
BASE = 'https://www.saitama-arena.co.jp/seat_view/'
FILES = {'svg': 'img/img-map_arena_end02.svg', 'png': 'img/img-map_arena_end02.png', 'rules': 'js/seat_list.js'}


def fetch():
    os.makedirs(RAW, exist_ok=True)
    out = {}
    for k, rel in FILES.items():
        path = os.path.join(RAW, os.path.basename(rel))
        if not os.path.exists(path):
            print('fetch', BASE + rel)
            with urllib.request.urlopen(BASE + rel, timeout=60) as r, open(path, 'wb') as f: f.write(r.read())
        out[k] = path
    return out


# ── the SVG: blocks, doors, floor ──────────────────────────────────────────────
def path_points(d, step=12):
    """Vertices of an Illustrator path (M m L l H h V v C c S s Z z); curves
    sampled, so a rounded badge or a bowed outline is a polygon"""
    toks = re.findall(r'[MmLlHhVvCcSsZz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    pts = []; i = 0; cur = np.zeros(2); start = np.zeros(2); cmd = None; lastc = None
    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    def bez(p0, p1, p2, p3):
        t = np.linspace(0, 1, step + 1)[1:, None]
        return list((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]): cmd = toks[i]; i += 1
        rel = cmd.islower(); c = cmd.upper()
        if c == 'Z':
            cur = start.copy(); continue
        if c in 'ML':
            p = np.array([num(), num()]) + (cur if rel else 0); cur = p
            if c == 'M': start = p.copy(); cmd = 'l' if rel else 'L'
            pts.append(p.copy())
        elif c == 'H':
            x = num(); cur = np.array([x + (cur[0] if rel else 0), cur[1]]); pts.append(cur.copy())
        elif c == 'V':
            y = num(); cur = np.array([cur[0], y + (cur[1] if rel else 0)]); pts.append(cur.copy())
        elif c == 'C':
            p1 = np.array([num(), num()]) + (cur if rel else 0); p2 = np.array([num(), num()]) + (cur if rel else 0); p3 = np.array([num(), num()]) + (cur if rel else 0)
            pts += bez(cur, p1, p2, p3); lastc = p2; cur = p3
        elif c == 'S':
            p2 = np.array([num(), num()]) + (cur if rel else 0); p3 = np.array([num(), num()]) + (cur if rel else 0)
            p1 = 2 * cur - lastc if lastc is not None else cur
            pts += bez(cur, p1, p2, p3); lastc = p2; cur = p3
    return np.array(pts)


def read_svg(path):
    s = open(path, encoding='utf-8').read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    blocks = {}
    for lv in ('200', '300', '400', '500'):
        i = s.index('id="lv_x5F_%s"' % lv); j = s.index('</g>', i); g = s[i:j]
        for m in re.finditer(r'<polygon id="highlight_(\d+)"[^>]*?points="([^"]+)"', g):
            pts = np.array([[float(v) for v in p.split(',')] for p in m.group(2).split()])
            blocks[int(m.group(1))] = {'level': lv, 'poly': pts}
        for m in re.finditer(r'<rect id="highlight_(\d+)"[^>]*?>', g):
            a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(0)))
            x, y, w, h = [float(a[k]) for k in 'x y width height'.split()]
            blocks[int(m.group(1))] = {'level': lv, 'poly': np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])}
        for m in re.finditer(r'<path id="highlight_(\d+)"[^>]*?\sd="([^"]+)"', g):
            blocks[int(m.group(1))] = {'level': lv, 'poly': path_points(m.group(2))}
    gates = {}
    for m in re.finditer(r'<g id="gate_(\d+)">\s*<path class="gate_back" d="([^"]+)"', s):
        p = path_points(m.group(2)); gates[int(m.group(1))] = {'box': [*p.min(0), *p.max(0)]}
    a = dict(re.findall(r'(\w+)="([^"]*)"', re.search(r'<rect id="arena_1"[^>]*>', s).group(0)))
    arena = [float(a[k]) for k in 'x y width height'.split()]
    return vb, blocks, gates, arena


def read_rules(path):
    """seat_list.js is a JS object literal: read it with node"""
    js = open(path, encoding='utf-8').read()
    i = js.index('var seatList = {') + len('var seatList = ')
    d = 0
    for j in range(i, len(js)):
        if js[j] == '{': d += 1
        elif js[j] == '}':
            d -= 1
            if d == 0: break
    code = 'console.log(JSON.stringify(eval("(" + process.argv[1] + ")")))'
    out = subprocess.run(['node', '-e', code, js[i:j + 1]], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def expected_counts(rules, mode='arena'):
    """Seats per block id from the rules: for each run of seat numbers, the rows
    (counted from 1) belong to the block named by the first key >= the row, less
    the numbers a row leaves out ('not_need'). Level '100' counts rows by letter."""
    exp = collections.Counter(); letters = 'ABCDEFGHIJKL'
    for lv, alpha in (('100', True), ('200', False), ('300', False), ('400', False), ('500', False)):
        sep = rules[mode][lv]['separate']; prev = 0
        for bp in sorted(int(k) for k in sep):
            rule = sep[str(bp)]; nn = {str(r): set(v) for r, v in rule.get('not_need', {}).items()}
            cur = 0; assign = {}
            for k, idv in rule.get('block', {}).items():
                if alpha:
                    if k not in letters: continue
                    ub = letters.index(k)
                    for i in range(cur, ub + 1): assign[letters[i]] = idv
                    cur = ub + 1
                else:
                    ub = int(k)
                    for r in range(cur + 1, ub + 1): assign[str(r)] = idv
                    cur = ub
            for r, idv in assign.items():
                if idv == 'none': continue
                exp[int(idv)] += sum(1 for s in range(prev + 1, bp + 1) if s not in nn.get(r, set()))
            prev = bp
    return exp


def rule_rows(rules, mode='arena'):
    """The first and last row (counted from 1 across the stack of blocks) each block holds"""
    lo, hi = {}, {}
    for lv in ('200', '300', '400', '500'):
        for rule in rules[mode][lv]['separate'].values():
            cur = 0
            for k, idv in rule.get('block', {}).items():
                ub = int(k)
                if idv != 'none': b = int(idv); lo[b] = min(lo.get(b, 10 ** 9), cur + 1); hi[b] = max(hi.get(b, 0), ub)
                cur = ub
    return {b: (lo[b], hi[b]) for b in lo}


# ── the PNG: seats ─────────────────────────────────────────────────────────────
class Drawing:
    def __init__(self, path):
        a = np.array(Image.open(path).convert('RGBA')); self.H, self.W = a.shape[:2]
        alpha = a[..., 3]; rgb = a[..., :3].astype(int)
        self.ink = alpha > 60
        near = lambda c, t: (np.abs(rgb[..., 0] - c[0]) < t) & (np.abs(rgb[..., 1] - c[1]) < t) & (np.abs(rgb[..., 2] - c[2]) < t)
        self.gray = self.ink & near((110, 110, 110), 40)
        self.cyan = self.ink & near((39, 158, 182), 55)
        mag = self.ink & (rgb[..., 0] > 180) & (rgb[..., 1] < 120) & (rgb[..., 2] > 100)
        self.mag = (alpha > 100) & (rgb[..., 0] > 180) & (rgb[..., 1] < 140) & (rgb[..., 2] > 90)
        self.grayd = cv2.dilate(self.gray.astype(np.uint8), np.ones((3, 3), np.uint8))
        self.text = (self.cyan | mag).astype(np.uint8)       # number labels (the seats themselves are removed below)
        self.alpha = alpha; self.rgb = rgb

    def detect(self):
        """-> rows (cx, cy, w, h, angle, filled) of every seat the drawing shows"""
        H, W = self.H, self.W
        n, lab, st, _ = cv2.connectedComponentsWithStats((~self.ink).astype(np.uint8), connectivity=4)
        area, w, h = st[:, 4], st[:, 2], st[:, 3]; bg = int(np.argmax(area))
        cand = np.nonzero((np.arange(n) != bg) & (area >= 22) & (area <= 420) & (w >= 4) & (w <= 30) & (h >= 4) & (h <= 30))[0]
        grayu = self.gray.astype(np.uint8); rec = []
        for i in cand:
            x, y, ww, hh, _ = st[i]
            x0, y0, x1, y1 = max(0, x - 2), max(0, y - 2), min(W, x + ww + 2), min(H, y + hh + 2)
            m = (lab[y0:y1, x0:x1] == i).astype(np.uint8)
            cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            if not cs: continue
            c = max(cs, key=cv2.contourArea)
            (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
            if cv2.contourArea(c) / max(rw * rh, 1e-6) < 0.78 or max(rw, rh) / max(1e-6, min(rw, rh)) > 1.8 or min(rw, rh) < 4: continue
            ring = cv2.dilate(m, np.ones((3, 3), np.uint8)) - m
            if ring.sum() == 0 or grayu[y0:y1, x0:x1][ring > 0].sum() / ring.sum() < 0.5: continue
            rec.append((x0 + cx, y0 + cy, rw, rh, ang, 0))
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(self.cyan.astype(np.uint8), connectivity=8)
        for i in range(1, n2):
            x, y, ww, hh, ar = st2[i]
            if ar < 45 or ww > 30 or hh > 30: continue
            m = (lab2[y:y + hh, x:x + ww] == i).astype(np.uint8)
            cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=cv2.contourArea)
            (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
            if cv2.contourArea(c) / max(rw * rh, 1e-6) > 0.85 and 0.7 < rw / max(rh, 1e-6) < 1.45 and 7 <= min(rw, rh) <= 22:
                rec.append((x + cx, y + cy, rw, rh, ang, 1))
        rec = np.array(rec, float)
        # the label ink without the filled seats
        sm = np.zeros((H, W), np.uint8)
        for x, y in rec[rec[:, 5] == 1][:, :2]: cv2.circle(sm, (int(round(x)), int(round(y))), 6, 1, -1)
        self.text = self.text & (1 - sm)
        self.tint = cv2.integral(self.text)
        return rec

    def text_frac(self, x, y, r):
        x0, y0, x1, y1 = max(0, int(round(x - r))), max(0, int(round(y - r))), min(self.W, int(round(x + r)) + 1), min(self.H, int(round(y + r)) + 1)
        if x1 <= x0 or y1 <= y0: return 0.0
        t = self.tint
        return float(t[y1, x1] - t[y0, x1] - t[y1, x0] + t[y0, x0]) / ((x1 - x0) * (y1 - y0))

    def edge_gray(self, q, e, wi, di):
        """grey hits along a seat's two across-row edges (its inner size plus the outline)"""
        ex, ey = np.cos(e), np.sin(e); nx, ny = -ey, ex
        s = np.linspace(-wi / 2 + 0.5, wi / 2 - 0.5, max(3, int(round(wi)))); out = []
        for sg in (-1, 1):
            xs = q[0] + ex * s + nx * sg * (di / 2 + 1.0); ys = q[1] + ey * s + ny * sg * (di / 2 + 1.0)
            xi = np.clip(np.round(xs).astype(int), 0, self.W - 1); yi = np.clip(np.round(ys).astype(int), 0, self.H - 1)
            out.append(float(self.grayd[yi, xi].mean()))
        return out


def box_extent(rw, rh, ang, e):
    bp = cv2.boxPoints(((0, 0), (rw, rh), ang)); ex, ey = np.cos(e), np.sin(e)
    al = bp[:, 0] * ex + bp[:, 1] * ey; cr = -bp[:, 0] * ey + bp[:, 1] * ex
    return al.max() - al.min(), cr.max() - cr.min()


def local_frame(P):
    """per seat: the direction of its row (from its nearest neighbours, smoothed),
    the seat pitch along a row, the pitch across rows"""
    n = len(P); t = cKDTree(P); d, j = t.query(P, k=3); p = float(np.median(d[:, 1]))
    v = P[j[:, 1]] - P; ang = np.arctan2(v[:, 1], v[:, 0]); c2, s2 = np.cos(2 * ang), np.sin(2 * ang)
    nb = t.query_ball_point(P, 2.2 * p)
    E = np.array([0.5 * np.arctan2(s2[ii].sum(), c2[ii].sum()) for ii in nb])
    ex, ey = np.cos(E), np.sin(E); qs = []
    for i in range(n):
        ii = [k for k in nb[i] if k != i]
        if not ii: continue
        dv = P[ii] - P[i]; al = dv[:, 0] * ex[i] + dv[:, 1] * ey[i]; cr = -dv[:, 0] * ey[i] + dv[:, 1] * ex[i]
        ok = np.abs(al) <= 0.6 * p
        if ok.any(): qs.append(np.abs(cr[ok]).min())
    qq = [q for q in qs if q > 0.5 * p]
    return p, (float(np.median(qq)) if qq else 1.7 * p), E, nb


def runs_of(P, p, E, tol=22):
    """the chains of seats one pitch apart along their row"""
    n = len(P); nb = cKDTree(P).query_ball_point(P, 1.4 * p)
    ex, ey = np.cos(E), np.sin(E); edges = []
    for i, idx in enumerate(nb):
        for k in idx:
            if k <= i: continue
            dv = P[k] - P[i]; L = np.hypot(*dv)
            if not (0.7 * p <= L <= 1.35 * p): continue
            if abs(dv[0] * ex[i] + dv[1] * ey[i]) / L < np.cos(np.radians(tol)): continue
            edges.append((i, k))
    if not edges: return n, np.arange(n)
    e = np.array(edges)
    return connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)), directed=False)


def complete_block(dr, P, R, poly, gthr=0.55, gthr2=0.3, tthr=0.08, maxk=6):
    """Seats hidden under labels: inside one row (between two seats of it) wherever a
    label's ink or an outline's edge shows in the cell; at a row's ends only where an
    outline's across-row edge shows (or half of one and some ink), with a seat in the
    next row beside it"""
    P = P.copy(); n0 = len(P)
    if n0 < 4: return P, np.zeros(n0, bool)
    p, qd, E, _ = local_frame(P)
    ext = np.array([box_extent(R[i, 2], R[i, 3], R[i, 4], E[i]) for i in range(n0) if R[i, 5] == 0])
    wi, di = (float(np.median(ext[:, 0])), float(np.median(ext[:, 1]))) if len(ext) else (0.7 * p, 0.7 * p)
    pc = poly.reshape(-1, 1, 2).astype(np.float32)
    inside = lambda q: cv2.pointPolygonTest(pc, (float(q[0]), float(q[1])), True) >= -0.8 * p
    def support(q, e, tree, PP):
        ii = tree.query_ball_point(q, 1.6 * qd); ex, ey = np.cos(e), np.sin(e); c = 0
        for k in ii:
            dv = PP[k] - q; al = dv[0] * ex + dv[1] * ey; cr = -dv[0] * ey + dv[1] * ex
            if abs(al) <= 0.6 * p and 0.55 * qd <= abs(cr) <= 1.5 * qd: c += 1
        return c
    allP = P.copy(); allE = E.copy(); changed = True; it = 0
    while changed and it < 4:
        changed = False; it += 1
        tree = cKDTree(allP); nc, lab = runs_of(allP, p, allE)
        for r in range(nc):
            mem = np.nonzero(lab == r)[0]
            if len(mem) < 2: continue
            Q = allP[mem]; c = Q.mean(0); e1 = np.linalg.svd(Q - c)[2][0]; Q = Q[np.argsort((Q - c) @ e1)]
            for end, sg in ((Q[-1], 1.0), (Q[0], -1.0)):
                if len(Q) >= 3: dirv = (Q[-1] - Q[-3]) / np.linalg.norm(Q[-1] - Q[-3]) if sg > 0 else (Q[0] - Q[2]) / np.linalg.norm(Q[0] - Q[2])
                else: dirv = sg * e1
                ang = np.arctan2(dirv[1], dirv[0]); kend = None
                for k in range(1, maxk + 2):
                    dd, jj = tree.query(end + dirv * p * k)
                    if dd < 0.45 * p:
                        vv = allP[jj] - end
                        if abs(-vv[0] * dirv[1] + vv[1] * dirv[0]) < 0.3 * p: kend = k
                        break
                if kend is not None and kend >= 2:
                    cand = [end + dirv * p * kk for kk in range(1, kend)]
                    if all(inside(q) and (max(dr.edge_gray(q, ang, wi, di)) >= gthr2 or dr.text_frac(q[0], q[1], 0.35 * p) >= 0.03) for q in cand):
                        for q in cand: allP = np.vstack([allP, q]); allE = np.r_[allE, ang]; changed = True
                        tree = cKDTree(allP)
                    continue
                for k in range(1, maxk + 1):
                    q = end + dirv * p * k
                    if tree.query(q)[0] < 0.5 * p or not inside(q): break
                    eg = max(dr.edge_gray(q, ang, wi, di)); tf = dr.text_frac(q[0], q[1], 0.35 * p)
                    if not (eg >= gthr or (eg >= gthr2 and tf >= tthr)) or support(q, ang, tree, allP) < 1: break
                    allP = np.vstack([allP, q]); allE = np.r_[allE, ang]; changed = True; tree = cKDTree(allP)
    am = np.zeros(len(allP), bool); am[n0:] = True
    return allP, am


def rows_of(P, centre):
    """Row index per seat (0 = the row nearest the arena) and the direction the
    seat faces: along-row neighbours share a row, the nearest seat across the row
    toward the arena is one row less, away from it one more"""
    n = len(P); p, qd, E, nb = local_frame(P); ex, ey = np.cos(E), np.sin(E)
    nx, ny = -ey, ex; tc = centre[None, :] - P
    sg = np.where(nx * tc[:, 0] + ny * tc[:, 1] >= 0, 1.0, -1.0); fx, fy = nx * sg, ny * sg      # toward the arena
    adj = [[] for _ in range(n)]
    ncr, labr = runs_of(P, p, E)
    for r in range(ncr):
        mem = np.nonzero(labr == r)[0]
        for a, b in zip(mem[:-1], mem[1:]): adj[a].append((b, 0)); adj[b].append((a, 0))
    nb2 = cKDTree(P).query_ball_point(P, 1.7 * qd)
    for i in range(n):
        bf = bb = None
        for k in nb2[i]:
            if k == i: continue
            dv = P[k] - P[i]; al = dv[0] * ex[i] + dv[1] * ey[i]; cr = dv[0] * fx[i] + dv[1] * fy[i]
            if abs(al) > 0.6 * p: continue
            if 0.55 * qd <= cr <= 1.5 * qd and (bf is None or abs(al) < bf[0]): bf = (abs(al), k)
            elif -1.5 * qd <= cr <= -0.55 * qd and (bb is None or abs(al) < bb[0]): bb = (abs(al), k)
        if bf: adj[i].append((bf[1], -1)); adj[bf[1]].append((i, 1))
        if bb: adj[i].append((bb[1], 1)); adj[bb[1]].append((i, -1))
    row = np.full(n, 0); comp = np.full(n, -1); nc = 0
    for s in range(n):
        if comp[s] >= 0: continue
        comp[s] = nc; st = [s]
        while st:
            i = st.pop()
            for k, dl in adj[i]:
                if comp[k] < 0: comp[k] = nc; row[k] = row[i] + dl; st.append(k)
        nc += 1
    cnt = np.bincount(comp); main = int(np.argmax(cnt))
    if nc > 1:
        # the bits cut off from the main chain (a narrow wedge's last rows): the row of the nearest
        # seat of the main chain, moved by the rows between them across their rows
        mi = np.nonzero(comp == main)[0]; mt = cKDTree(P[mi])
        for i in np.nonzero(comp != main)[0]:
            _, jn = mt.query(P[i]); j = mi[jn]; dv = P[i] - P[j]
            row[i] = row[j] - int(round((dv[0] * fx[j] + dv[1] * fy[j]) / qd))
    row -= row.min()
    return row, np.degrees(np.arctan2(fx, fy)), p, qd, nc    # yaw: 0 = facing +y (the map's down is +y)


def read_row_labels(dr):
    """The magenta row numbers drawn at the ends of rows, read by comparing each glyph
    with the templates (ssa/glyph_templates.json, 14 x 12 bitmaps of the map's font):
    -> [(text, x0, y0, x1, y1)] for the numbers (letters mark the movable A-K rows)"""
    tp = json.load(open(os.path.join(HERE, 'ssa', 'glyph_templates.json')))
    T = np.array([[int(c) for c in t['bits']] for t in tp['templates']], float); chars = [t['ch'] for t in tp['templates']]
    n, lab, st, _ = cv2.connectedComponentsWithStats(dr.mag.astype(np.uint8), connectivity=8)
    gl = []
    for i in range(1, n):
        x, y, w, h, _ = st[i]
        if h < 11: continue
        can = np.zeros((14, 12), float); can[:min(14, h), :min(12, w)] = (lab[y:y + h, x:x + w] == i)[:14, :12]
        gl.append((chars[int(np.argmin(((T - can.ravel()) ** 2).sum(1)))], int(x), int(y), int(x + w), int(y + h)))
    used = [False] * len(gl); toks = []
    for i in sorted(range(len(gl)), key=lambda i: (gl[i][2] // 5, gl[i][1])):
        if used[i]: continue
        cur = [gl[i]]; used[i] = True; more = True
        while more:
            more = False
            for j in range(len(gl)):
                if used[j]: continue
                last = max(cur, key=lambda q: q[3])
                if abs(gl[j][2] - last[2]) <= 3 and 0 <= gl[j][1] - last[3] <= 5: cur.append(gl[j]); used[j] = True; more = True
        cur.sort(key=lambda q: q[1])
        toks.append((''.join(c[0] for c in cur), min(c[1] for c in cur), min(c[2] for c in cur), max(c[3] for c in cur), max(c[4] for c in cur)))
    return [t for t in toks if t[0].isdigit()]


def main():
    src = fetch()
    vb, blocks, gates, arena = read_svg(src['svg'])
    rules = read_rules(src['rules']); exp = expected_counts(rules); rrows = rule_rows(rules)
    lettered = set(int(v) for r in rules['arena']['100']['separate'].values() for v in r.get('block', {}).values() if v != 'none')
    dr = Drawing(src['png']); rec = dr.detect(); print('detected', len(rec), 'seats')
    H, W = dr.H, dr.W
    idmap = np.zeros((H, W), np.int32)
    for b, o in sorted(blocks.items(), key=lambda kv: -cv2.contourArea(kv[1]['poly'].astype(np.float32))): cv2.fillPoly(idmap, [o['poly'].astype(np.int32)], b)
    xy = rec[:, :2]
    bid = idmap[np.clip(np.round(xy[:, 1]).astype(int), 0, H - 1), np.clip(np.round(xy[:, 0]).astype(int), 0, W - 1)].copy()
    for i in np.nonzero(bid == 0)[0]:       # on a block's outline: the nearest outline
        best = min(((-cv2.pointPolygonTest(o['poly'].reshape(-1, 1, 2).astype(np.float32), (float(xy[i, 0]), float(xy[i, 1])), True), b) for b, o in blocks.items()))
        if best[0] <= 14: bid[i] = best[1]
    centre = np.array([arena[0] + arena[2] / 2, arena[1] + arena[3] / 2])
    out = {'blocks': {}}; tot = collections.defaultdict(lambda: [0, 0])
    for b in sorted(blocks):
        idx = np.nonzero(bid == b)[0]; o = blocks[b]
        if len(idx) < 4:
            out['blocks'][b] = {'level': o['level'], 'poly': np.round(o['poly'], 1).tolist(), 'seats': [], 'rules': exp.get(b, 0), 'rule_rows': rrows.get(b), 'lettered': b in lettered}
            continue
        P, am = complete_block(dr, xy[idx], rec[idx], o['poly'])
        row, yaw, p, qd, nc = rows_of(P, centre)
        fl = np.r_[rec[idx, 5].astype(int), np.zeros(len(P) - len(idx), int)]
        order = np.lexsort((np.round(P[:, 0]), row))
        out['blocks'][b] = {'level': o['level'], 'poly': np.round(o['poly'], 1).tolist(), 'lettered': b in lettered, 'rules': exp.get(b, 0), 'rule_rows': rrows.get(b),
                            'pitch': round(p, 2), 'row_pitch': round(qd, 2), 'rows': int(row.max()) + 1, 'chains': int(nc),
                            'seats': [[round(float(P[i, 0]), 1), round(float(P[i, 1]), 1), int(row[i]), int(round(yaw[i])), int(fl[i]), int(am[i])] for i in order]}
        if b not in lettered: tot[o['level']][0] += exp.get(b, 0); tot[o['level']][1] += len(P)
    # the row numbers on the map, each at the end of its row: which seat's row it names
    allp = [(b, i) for b in out['blocks'] for i in range(len(out['blocks'][b]['seats'])) if not out['blocks'][b]['lettered']]
    PP = np.array([out['blocks'][b]['seats'][i][:2] for b, i in allp]); tr = cKDTree(PP)
    for val, x0, y0, x1, y1 in read_row_labels(dr):
        c = np.array([(x0 + x1) / 2, (y0 + y1) / 2]); best = None
        for k in tr.query_ball_point(c, 34):
            b, i = allp[k]; s_ = out['blocks'][b]['seats'][i]; yw = np.radians(s_[3]); f = np.array([np.sin(yw), np.cos(yw)])
            v = c - PP[k]; al, cr = v @ np.array([-f[1], f[0]]), v @ f       # along the row, across it
            if abs(cr) < 9 and (best is None or abs(cr) * 3 + abs(al) < best[0]): best = (abs(cr) * 3 + abs(al), b, s_[2])
        if best: out['blocks'][best[1]].setdefault('labels', []).append([int(val), best[2]])
    for gid, g in gates.items():
        b = g['box']; out.setdefault('gates', {})[gid] = {'level': gid // 100, 'centre': [round((b[0] + b[2]) / 2, 1), round((b[1] + b[3]) / 2, 1)], 'size': [round(b[2] - b[0], 1), round(b[3] - b[1], 1)]}
    out['arena'] = [round(v, 1) for v in arena]; out['viewBox'] = vb
    # the stage's overlay on the drawing (a pale rectangle: alpha 229, grey 230)
    m = ((dr.alpha >= 225) & (dr.alpha <= 232) & (np.abs(dr.rgb[..., 0] - 230) <= 2)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    k = 1 + int(np.argmax(st[1:, 4])); out['stage'] = [int(v) for v in st[k, :4]]
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
    print('seats per level (rules, read), the lettered blocks left out:', {k: tuple(v) for k, v in sorted(tot.items())})
    bad = [(b, o['rules'], len(o['seats'])) for b, o in out['blocks'].items() if not o['lettered'] and o['seats'] and abs(len(o['seats']) - o['rules']) > 3]
    print('blocks more than 3 seats off the rules:', bad)


if __name__ == '__main__':
    main()
