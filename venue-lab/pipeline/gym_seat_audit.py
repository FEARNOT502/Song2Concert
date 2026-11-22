"""KSPO DOME seat audit: the app's 1F (rows 12-22) and 2F seats against the operator's seat chart.

The chart (popimg_acro_seat.zip's EPS, to PDF with Ghostscript -dEPSCrop)
draws 2F seats as small cyan arches (`cc`) and front-row squares (`qu`),
and 1F seats as cyan rounded-rect Bezier corners (`c`) in blocks B/C/D and
cyan quads (`qu`, `lll`, `llll`, `ququ`, `quququ`) in block A. Movable
rows 1-11 are folded behind curtains; fixed rows 12-22 (12-21 in 5-11) are
separated from row 11 by a >1.1 m circulation aisle and registered per
block onto the app plan. Every chart seat is paired 1-to-1 within TOL:
  missing  a chart seat with no app seat within TOL: a seat lost
  extra    an app seat with no chart seat within TOL: a seat added
Pairs that disagree on their section are listed too.

usage: python -I gym_seat_audit.py seat.pdf src/three/venues/gymnastic-data.js OUT.json
Requires numpy, scipy and PyMuPDF. The chart itself is not committed.
"""
import base64
from functools import lru_cache
import json
import re
import sys

import numpy as np
import pymupdf
from scipy.spatial import cKDTree

sys.path.insert(0, __file__.rsplit('\\', 1)[0].rsplit('/', 1)[0])
import gymnastic_arena as G  # noqa: E402

TOL = .35
CYAN = (.4, .79, .83)
LABELS = dict(zip(range(23, 53), [417, 270, 236, 217, 248, 247, 244, 259, 306, 326, 250, 245, 326, 306, 269,
                                   241, 248, 248, 219, 245, 277, 288, 329, 221, 206, 116, 104, 176, 160, 233]))
# Published 1F chart labels include movable rows 1-11; fixed rows 12-22 exclude them.
LABELS_1F_TOTAL = {
    **{n: 282 for n in range(1, 5)}, **{n: 292 for n in range(5, 12)}, **{n: 282 for n in range(12, 16)},
    16: 310, 17: 310, 18: 311, 19: 311, 20: 312, 21: 310, 22: 308,
}
LABELS_1F = {
    **{n: 168 for n in range(1, 5)}, **{n: 164 for n in range(5, 12)}, **{n: 168 for n in range(12, 16)},
    16: 182, 17: 182, 18: 183, 19: 183, 20: 184, 21: 182, 22: 182,
}
LOWER_BLOCKS = (range(1, 5), range(5, 12), range(12, 16), range(16, 23))


def _polar_chart(pts):
    u, v = pts[:, 0] - G.CHART_CENTER[0], pts[:, 1] - G.CHART_CENTER[1]
    return np.hypot(u, v) / G.CHART_POINTS_PER_METRE, np.arctan2(-v, -u) % (2 * np.pi)


def _to_plan(r, a):
    # the chart's plan in metres, in the app's frame (gymPoint: x = sin, z = -cos)
    th = a - G.CHART_ROTATION
    return np.c_[np.sin(th) * r, -np.cos(th) * r]


def _dedup(pts, radius):
    dup = {j for _, j in cKDTree(pts).query_pairs(radius)}
    return pts[[i for i in range(len(pts)) if i not in dup]]


@lru_cache(maxsize=2)
def _pdf_drawings(pdf):
    return pymupdf.open(pdf)[0].get_drawings()


def _cluster_corners(inward):
    """Collapse the 4 rounded-rect Bezier corner curves of each B/C/D 1F seat."""
    tree = cKDTree(inward[:, :2])
    visited = np.zeros(len(inward), dtype=bool)
    centers = []
    for i in range(len(inward)):
        if visited[i]:
            continue
        q, comp = [i], []
        visited[i] = True
        while q:
            u = q.pop()
            comp.append(u)
            for v in tree.query_ball_point(inward[u, :2], 0.9):
                if not visited[v]:
                    visited[v] = True
                    q.append(v)
        centers.append(inward[comp, 2:4].mean(0))
    return np.asarray(centers)


def chart_seats(pdf):
    pts = []
    for d in _pdf_drawings(pdf):
        if tuple(round(v, 2) for v in (d.get('color') or ())) != CYAN:
            continue
        sig = ''.join(it[0] for it in d['items'])
        rc = d['rect']
        size = round(max(rc.width, rc.height))
        if (sig, size) in (('cc', 2), ('qu', 3), ('qu', 4)):
            pts.append(((rc.x0 + rc.x1) / 2, (rc.y0 + rc.y1) / 2))
    # (a few seats are drawn twice, one symbol over the other: one seat)
    pts = _dedup(np.array(pts), .2 * G.CHART_POINTS_PER_METRE)
    r, a = _polar_chart(pts)
    _, bounds = G.chart_sections(pdf)
    keep = r >= 44.5
    sec = np.array([G.section_lookup(bounds[1], rr, aa) for rr, aa in zip(r[keep], a[keep])])
    return _to_plan(r[keep], a[keep]), sec


def chart_lower_seats(pdf):
    """Extract 1F fixed-row seats (rows 12-22) from the chart PDF as (xz, sec, row)."""
    inward, quads = [], []
    for d in _pdf_drawings(pdf):
        if tuple(round(v, 2) for v in (d.get('color') or ())) != CYAN:
            continue
        rc = d['rect']
        cx, cy = (rc.x0 + rc.x1) / 2, (rc.y0 + rc.y1) / 2
        rad = np.hypot(cx - G.CHART_CENTER[0], cy - G.CHART_CENTER[1]) / G.CHART_POINTS_PER_METRE
        if not (20.0 <= rad < 46.0):
            continue
        sig = ''.join(it[0] for it in d['items'])
        if sig == 'c' and max(rc.width, rc.height) <= 0.6:
            _, p0, p1, p2, p3 = d['items'][0]
            mx, my = (p0.x + p3.x) / 2, (p0.y + p3.y) / 2
            bx = 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x
            by = 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y
            dx, dy = mx - bx, my - by
            norm = np.hypot(dx, dy)
            if norm > 1e-4:
                inward.append((mx + 1.8 * dx / norm, my + 1.8 * dy / norm, mx, my))
        elif sig in ('qu', 'lll', 'llll') and 2.2 <= max(rc.width, rc.height) <= 5.5 and 2.2 <= min(rc.width, rc.height) <= 5.5:
            quads.append((cx, cy))
        elif sig in ('ququ', 'quququ'):
            for it in d['items']:
                q = it[1]
                quads.append(((q.ul.x + q.ur.x + q.lr.x + q.ll.x) / 4, (q.ul.y + q.ur.y + q.lr.y + q.ll.y) / 4))
    pts = _dedup(np.vstack([_cluster_corners(np.asarray(inward)), np.asarray(quads)]), .25 * G.CHART_POINTS_PER_METRE)
    r, a = _polar_chart(pts)
    _, bounds = G.chart_sections(pdf)
    keep = r < 44.5
    r, a = r[keep], a[keep]
    sec = np.array([G.section_lookup(bounds[0], float(rr), float(aa)) for rr, aa in zip(r, a)])
    fixed = np.zeros(len(sec), dtype=bool)
    row = np.zeros(len(sec), dtype=int)
    for n in range(1, 23):
        idx = np.flatnonzero(sec == n)
        order = idx[np.argsort(r[idx])]
        rs = r[order]
        gap = np.flatnonzero(np.diff(rs) > 1.1)
        if len(gap) != 1:
            raise ValueError(f'Section {n} expected 1 movable-fixed aisle gap, found {gap}')
        fixed[order[gap[0] + 1:]] = True
        cur, prev_r = 1, rs[0]
        for k, gi in enumerate(order):
            if k > 0 and r[gi] - prev_r > 0.35:
                cur += 1
            row[gi] = cur
            prev_r = r[gi]
    return _to_plan(r[fixed], a[fixed]), sec[fixed], row[fixed]


def app_seats(path, sec_min=23, sec_max=52):
    src = open(path, encoding='utf8').read()
    raw = np.frombuffer(base64.b64decode(re.search(r'GYM_SEATS = "([^"]+)"', src)[1]), dtype='<i2').reshape(-1, 6)
    s = raw[(raw[:, 3] >= sec_min) & (raw[:, 3] <= sec_max)]
    return s[:, [0, 2]] / 100, s[:, 3], s[:, 4], s[:, 5]


def _similarity(a, b):
    ma, mb = a.mean(0), b.mean(0)
    A, B = a - ma, b - mb
    U, S, Vt = np.linalg.svd(B.T @ A)
    D = np.diag([1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ D @ Vt
    s = (S * np.diag(D)).sum() / (A ** 2).sum()
    return float(s), R, mb - s * ma @ R.T


def fit(src, dst, rounds=30, init=None, reach=2.0):
    # a similarity src -> dst by ICP (nearest pairs within a shrinking reach)
    s, R, t = init if init is not None else (1.0, np.eye(2), np.zeros(2))
    tree = cKDTree(dst)
    for _ in range(rounds):
        cur = s * src @ R.T + t
        d, j = tree.query(cur)
        k = d < reach
        s, R, t = _similarity(src[k], dst[j[k]])
        reach = max(.5, reach * .8)
    return s, R, t


def _reg_summary(s, R, t, d=None):
    info = {
        'scale': round(float(s), 5),
        'rotation_deg': round(float(np.degrees(np.arctan2(R[1, 0], R[0, 0]))), 4),
        'offset_m': [round(float(v), 3) for v in t],
    }
    if d is not None:
        info['pairDistance_m'] = {'median': round(float(np.median(d)), 3), 'p95': round(float(np.percentile(d, 95)), 3)}
    return info


def fit_lower_blocks(src, src_sec, dst, dst_sec):
    """Register each 1F chart block separately onto dst via section-centroid init so chart-layout shifts cancel out."""
    reg = np.zeros_like(src)
    blocks = {}
    for srange in LOWER_BLOCKS:
        secs = list(srange)
        mc = np.isin(src_sec, secs)
        ma = np.isin(dst_sec, secs)
        src_c = np.array([src[src_sec == n].mean(0) for n in secs])
        dst_c = np.array([dst[dst_sec == n].mean(0) for n in secs])
        s, R, t = fit(src[mc], dst[ma], init=_similarity(src_c, dst_c), reach=.6)
        reg[mc] = s * src[mc] @ R.T + t
        blocks[f'{srange.start}-{srange.stop - 1}'] = _reg_summary(s, R, t)
    return reg, blocks


def _audit_level(reg, csec, axz, asec, arow, anum, sec_range, labels, extra_fields=None):
    d, j = cKDTree(axz).query(reg)
    db, jb = cKDTree(reg).query(axz)
    paired = (d < TOL) & (jb[j] == np.arange(len(reg)))
    missing = ~paired
    extra = np.ones(len(axz), bool)
    extra[j[paired]] = False
    wrong = paired & (asec[j] != csec)
    per = {}
    for n in sec_range:
        entry = {'label': labels[n], 'chart': int((csec == n).sum()), 'app': int((asec == n).sum()),
                 'missing': int((missing & (csec == n)).sum()), 'extra': int((extra & (asec == n)).sum()),
                 'otherSection': int((wrong & (csec == n)).sum())}
        if extra_fields and n in extra_fields:
            entry.update(extra_fields[n])
        per[n] = entry
    summary = {'chartSeats': int(len(reg)), 'appSeats': int(len(axz)), 'paired': int(paired.sum()),
               'missing': int(missing.sum()), 'extra': int(extra.sum()), 'otherSection': int(wrong.sum())}
    miss_list = [{'section': int(csec[i]), 'x': round(float(reg[i, 0]), 2), 'z': round(float(reg[i, 1]), 2)} for i in np.flatnonzero(missing)]
    ext_list = [{'section': int(asec[i]), 'row': int(arow[i]), 'num': int(anum[i]), 'x': round(float(axz[i, 0]), 2), 'z': round(float(axz[i, 1]), 2)} for i in np.flatnonzero(extra)]
    return summary, per, miss_list, ext_list, d[paired]


def main(pdf, data, out):
    cxz1, csec1, _ = chart_lower_seats(pdf)
    axz1, asec1, arow1, anum1 = app_seats(data, 1, 22)
    reg1, blocks1 = fit_lower_blocks(cxz1, csec1, axz1, asec1)
    lvl1, per1, miss1, ext1, d1 = _audit_level(
        reg1, csec1, axz1, asec1, arow1, anum1, range(1, 23), LABELS_1F,
        {n: {'labelTotal': LABELS_1F_TOTAL[n]} for n in range(1, 23)},
    )

    cxz2, csec2 = chart_seats(pdf)
    axz2, asec2, arow2, anum2 = app_seats(data, 23, 52)
    s2, R2, t2 = fit(cxz2, axz2)
    reg2 = s2 * cxz2 @ R2.T + t2
    lvl2, per2, miss2, ext2, d2 = _audit_level(reg2, csec2, axz2, asec2, arow2, anum2, range(23, 53), LABELS)

    report = {
        'tolerance_m': TOL,
        'registration1f': {'blocks': blocks1, 'pairDistance_m': {'median': round(float(np.median(d1)), 3), 'p95': round(float(np.percentile(d1, 95)), 3)}},
        'registration': _reg_summary(s2, R2, t2, d2),
        'level1': lvl1,
        'level2': lvl2,
        'sections': {**per1, **per2},
        'missingSeats1f': miss1,
        'extraSeats1f': ext1,
        'missingSeats': miss2,
        'extraSeats': ext2,
    }
    json.dump(report, open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    # the chart's seats on the model's plan, for scripts/verify-gym-seats.mjs
    # (which checks the app against them without the chart itself)
    ref = out.rsplit('.', 1)[0] + '-chart.json'
    json.dump({
        'source': 'popimg_acro_seat.zip (operator EPS, 2018-07-12), 1F (rows 12-22) + 2F seat symbols registered onto the app plan by gym_seat_audit.py',
        'tolerance_m': TOL,
        'labels1f': LABELS_1F,
        'labels1fTotal': LABELS_1F_TOTAL,
        'labels': LABELS,
        'seats1f': [[round(float(x), 2), round(float(z), 2), int(n)] for (x, z), n in zip(reg1, csec1)],
        'seats': [[round(float(x), 2), round(float(z), 2), int(n)] for (x, z), n in zip(reg2, csec2)],
    }, open(ref, 'w', encoding='utf8'), separators=(',', ':'))
    for tag, L, per in (('1F', lvl1, per1), ('2F', lvl2, per2)):
        print(f"{tag} chart {L['chartSeats']} app {L['appSeats']} paired {L['paired']} missing {L['missing']} extra {L['extra']} other-section {L['otherSection']}")
        for n, e in per.items():
            if e['missing'] or e['extra'] or e['otherSection'] or e['chart'] != e['label']:
                print(n, e)
    print('registration1f', report['registration1f'])
    print('registration', report['registration'])


if __name__ == '__main__':
    main(*sys.argv[1:])
