"""KSPO DOME seat audit: the app's seats against the operator's seat chart.

The chart (popimg_acro_seat.zip's EPS, to PDF with Ghostscript -dEPSCrop)
draws each 2F seat as a small cyan arch (a path of two curves) and the 2F
front rows' seats as small cyan squares. Every one of those is taken as a
seat, registered onto the model's plan (a similarity fitted by ICP to the
app's own seats), and paired with the nearest app seat. What does not pair:
  missing  a chart seat with no app seat within TOL: a seat lost
  extra    an app seat with no chart seat within TOL: a seat added
Pairs that disagree on their section are listed too. With nothing missing
or extra and every pair close, the aisles and the sections' splits are the
chart's own (a gap in one is a gap in the other).

usage: python -I gym_seat_audit.py seat.pdf src/three/venues/gymnastic-data.js OUT.json
Requires numpy, scipy and PyMuPDF. The chart itself is not committed.
"""
import base64
import collections
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


def chart_seats(pdf):
    page = pymupdf.open(pdf)[0]
    pts = []
    for d in page.get_drawings():
        if tuple(round(v, 2) for v in (d.get('color') or ())) != CYAN:
            continue
        sig = ''.join(it[0] for it in d['items'])
        rc = d['rect']
        size = round(max(rc.width, rc.height))
        if (sig, size) in (('cc', 2), ('qu', 3), ('qu', 4)):
            pts.append(((rc.x0 + rc.x1) / 2, (rc.y0 + rc.y1) / 2))
    pts = np.array(pts)
    # (a few seats are drawn twice, one symbol over the other: one seat)
    tree = cKDTree(pts)
    dup = {j for i, j in tree.query_pairs(.2 * G.CHART_POINTS_PER_METRE)}
    pts = pts[[i for i in range(len(pts)) if i not in dup]]
    u, v = pts[:, 0] - G.CHART_CENTER[0], pts[:, 1] - G.CHART_CENTER[1]
    r = np.hypot(u, v) / G.CHART_POINTS_PER_METRE
    a = np.arctan2(-v, -u) % (2 * np.pi)
    _, bounds = G.chart_sections(pdf)
    keep = r >= 44.5
    sec = np.array([G.section_lookup(bounds[1], rr, aa) for rr, aa in zip(r[keep], a[keep])])
    # the chart's plan in metres, in the app's frame (gymPoint: x = sin, z = -cos)
    th = a[keep] - G.CHART_ROTATION
    return np.c_[np.sin(th) * r[keep], -np.cos(th) * r[keep]], sec


def app_seats(path):
    src = open(path, encoding='utf8').read()
    raw = np.frombuffer(base64.b64decode(re.search(r'GYM_SEATS = "([^"]+)"', src)[1]), dtype='<i2').reshape(-1, 6)
    s = raw[raw[:, 3] >= 23]
    return s[:, [0, 2]] / 100, s[:, 3], s[:, 4], s[:, 5]


def fit(src, dst, rounds=30):
    # a similarity src -> dst by ICP (nearest pairs within a shrinking reach)
    s, R, t = 1.0, np.eye(2), np.zeros(2)
    tree = cKDTree(dst)
    reach = 2.0
    for _ in range(rounds):
        cur = s * src @ R.T + t
        d, j = tree.query(cur)
        k = d < reach
        a, b = src[k], dst[j[k]]
        ma, mb = a.mean(0), b.mean(0)
        A, B = a - ma, b - mb
        U, S, Vt = np.linalg.svd(B.T @ A)
        D = np.diag([1, np.sign(np.linalg.det(U @ Vt))])
        R = U @ D @ Vt
        s = (S * np.diag(D)).sum() / (A ** 2).sum()
        t = mb - s * ma @ R.T
        reach = max(.5, reach * .8)
    return s, R, t


def main(pdf, data, out):
    cxz, csec = chart_seats(pdf)
    axz, asec, arow, anum = app_seats(data)
    s, R, t = fit(cxz, axz)
    reg = s * cxz @ R.T + t
    d, j = cKDTree(axz).query(reg)
    db, jb = cKDTree(reg).query(axz)
    paired = (d < TOL) & (jb[j] == np.arange(len(reg)))
    missing = ~paired
    extra = np.ones(len(axz), bool)
    extra[j[paired]] = False
    wrong = paired & (asec[j] != csec)
    per = {}
    for n in range(23, 53):
        per[n] = {'label': LABELS[n], 'chart': int((csec == n).sum()), 'app': int((asec == n).sum()),
                  'missing': int((missing & (csec == n)).sum()), 'extra': int((extra & (asec == n)).sum()),
                  'otherSection': int((wrong & (csec == n)).sum())}
    report = {
        'tolerance_m': TOL,
        'registration': {'scale': round(float(s), 5), 'rotation_deg': round(float(np.degrees(np.arctan2(R[1, 0], R[0, 0]))), 4),
                         'offset_m': [round(float(v), 3) for v in t],
                         'pairDistance_m': {'median': round(float(np.median(d[paired])), 3), 'p95': round(float(np.percentile(d[paired], 95)), 3)}},
        'level2': {'chartSeats': int(len(reg)), 'appSeats': int(len(axz)), 'paired': int(paired.sum()),
                   'missing': int(missing.sum()), 'extra': int(extra.sum()), 'otherSection': int(wrong.sum())},
        'sections': per,
        'missingSeats': [{'section': int(csec[i]), 'x': round(float(reg[i, 0]), 2), 'z': round(float(reg[i, 1]), 2)} for i in np.flatnonzero(missing)],
        'extraSeats': [{'section': int(asec[i]), 'row': int(arow[i]), 'num': int(anum[i]), 'x': round(float(axz[i, 0]), 2), 'z': round(float(axz[i, 1]), 2)} for i in np.flatnonzero(extra)],
    }
    json.dump(report, open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    # the chart's seats on the model's plan, for scripts/verify-gym-seats.mjs
    # (which checks the app against them without the chart itself)
    ref = out.rsplit('.', 1)[0] + '-chart.json'
    json.dump({
        'source': 'popimg_acro_seat.zip (operator EPS, 2018-07-12), 2F seat symbols registered onto the app plan by gym_seat_audit.py',
        'tolerance_m': TOL, 'labels': LABELS,
        'seats': [[round(float(x), 2), round(float(z), 2), int(n)] for (x, z), n in zip(reg, csec)],
    }, open(ref, 'w', encoding='utf8'), separators=(',', ':'))
    L = report['level2']
    print(f"2F chart {L['chartSeats']} app {L['appSeats']} paired {L['paired']} missing {L['missing']} extra {L['extra']} other-section {L['otherSection']}")
    print('registration', report['registration'])
    for n, e in per.items():
        if e['missing'] or e['extra'] or e['otherSection'] or e['chart'] != e['label']:
            print(n, e)


if __name__ == '__main__':
    main(*sys.argv[1:])
