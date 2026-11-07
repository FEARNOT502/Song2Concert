# Tokyo Dome: each stand block's rows as a detailed seating chart gives them.
#
# Source: くるみっこ (kurumicat.com), "詳細な東京ドームの座席表", one PDF per
# group of blocks, made in Excel: each block a column of filled cells (rows
# that read alike merged into one tall cell), each row's first and last seat
# numbers written at its two ends, the row numbers in columns either side of
# each block and the block's name under it (the excite seats' 1st base side:
# over it). A fan's chart, not the building's: the site says it may differ
# from the seats as they are now. The official seating map
# (td/td_labeled.json) gives only each block's rows and its first seat number;
# td_rows_check.py compares the two. The 2nd floor's chart is pictures, not
# text: its rows are typed in from the pictures (td/td_rows_2f.txt) and
# merged in here.
#
# The PDFs are read into memory, not saved. Writes td/td_rows_real.json:
#   { "A22": { "rows": { "4": [[61, 67]], ... } }, ... }
# each row a list of [first, last] runs of seat numbers (a row the chart breaks
# in two has two).
#
#   python td_rows_real.py            (from inside pipeline/)

import io, json, os, re, sys, urllib.request
from collections import defaultdict
from pypdf import PdfReader
from pypdf.generic import ContentStream

BASE = 'https://kurumicat.com/wp-content/uploads/'
# (file, where the names stand: 'below' the block, or 'nearest' either way)
FILES = [('1-01-05.pdf', 'below'), ('1-06-10.pdf', 'below'), ('1-11-17.pdf', 'below'),
         ('1-18-21.pdf', 'below'), ('1-22-25.pdf', 'below'), ('3-26-30.pdf', 'below'),
         ('3-31-36.pdf', 'below'), ('3-37-41.pdf', 'below'), ('3-42-45.pdf', 'below'),
         ('3-46-49.pdf', 'below'), ('right.pdf', 'below'), ('left.pdf', 'below'),
         ('excite.pdf', 'nearest')]
NAME = re.compile(r'^([A-G])\s?(\d{1,2})$')
# A37 row 3 reads 221-250 on the chart, every other row of A37 starting at 241
# (the official map's first seat for A37 too)
FIXES = [('A37', 3, [[241, 250]])]


def fetch(name):
    req = urllib.request.Request(BASE + name, headers={'User-Agent': 'Mozilla/5.0 (seat-map reader)'})
    return urllib.request.urlopen(req, timeout=90).read()


def page_items(page):
    """The page's text items (x, y, text) and filled rectangles (x0, y0, x1, y1)."""
    texts = []

    def vis(text, cm, tm, fd, fs):
        t = text.strip()
        if t:
            size = abs(fs * tm[3] * cm[3]) or abs(fs)
            texts.append((tm[4] * cm[0] + tm[5] * cm[2] + cm[4], tm[4] * cm[1] + tm[5] * cm[3] + cm[5], t, size))
    page.extract_text(visitor_text=vis)
    rects, fill, pend, ctm, stack = [], None, [], [1, 0, 0, 1, 0, 0], []
    for ops, op in ContentStream(page.get_contents(), page.pdf).operations:
        if op == b'q': stack.append(ctm[:])
        elif op == b'Q': ctm = stack.pop() if stack else [1, 0, 0, 1, 0, 0]
        elif op == b'cm':
            a, b, c, d, e, f = [float(v) for v in ops]
            A, B, C, D, E, F = ctm
            ctm = [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F]
        elif op == b'rg': fill = tuple(float(v) for v in ops)
        elif op == b're':
            x, y, w, h = [float(v) for v in ops]
            A, B, C, D, E, F = ctm
            x0, y0 = A * x + C * y + E, B * x + D * y + F
            x1, y1 = A * (x + w) + C * (y + h) + E, B * (x + w) + D * (y + h) + F
            pend.append((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))
        elif op in (b'f', b'f*', b'F', b'B', b'B*'):
            if fill and min(fill) < 0.99:
                rects.extend(pend)
            pend = []
        elif op in (b'n', b'S', b's'):
            pend = []
    return texts, rects


def lines_of(ys, tol=2.5):
    """Heights within `tol` of each other are one line: each y -> its line."""
    ys = sorted(set(ys))
    groups = [[ys[0]]]
    for y in ys[1:]:
        if y - groups[-1][-1] <= tol:
            groups[-1].append(y)
        else:
            groups.append([y])
    out = {}
    for g in groups:
        c = sum(g) / len(g)
        for y in g:
            out[y] = c
    return out


def blocks_of(texts, rects, how, report, tag):
    names = []
    for x, y, t, _ in texts:
        m = NAME.match(t)
        if m:
            names.append((x, y, m.group(1) + m.group(2).zfill(2)))
    # (a number set much smaller than the rest is a mark, not a seat: the
    # right field's F20 hides a tiny "539" in a row)
    sizes = sorted(sz for _, _, t, sz in texts if t.isdigit())
    med = sizes[len(sizes) // 2] if sizes else 0
    nums = [(x, y, int(t)) for x, y, t, sz in texts if t.isdigit() and sz >= 0.7 * med]
    if not nums:
        return {}
    ln = lines_of([y for _, y, _ in nums])
    cells = [r for r in rects if (r[2] - r[0]) > 4 and (r[3] - r[1]) > 5]
    inside = lambda x, y, r: r[0] - 2 <= x <= r[2] + 2 and r[1] - 1.5 <= y <= r[3] + 1.5
    # the numbers outside every cell: the row numbers, by line
    labels = defaultdict(list)
    for x, y, n in nums:
        if not any(inside(x, y, r) for r in cells):
            labels[ln[y]].append((x, n))
    # each number to one cell: the one it stands inside, else the nearest
    # (a number by a cell's edge can sit within reach of its neighbour's)
    owner = {}
    for k, (x, y, n) in enumerate(nums):
        hits = [i for i, r in enumerate(cells) if inside(x, y, r)]
        if hits:
            strict = [i for i in hits if cells[i][0] <= x <= cells[i][2]]
            owner[k] = min(strict or hits, key=lambda i: abs((cells[i][0] + cells[i][2]) / 2 - x))
    # a seat's width on this page: from the rows written with both ends
    widths = []
    for i, r in enumerate(cells):
        mine = [nums[k] for k, c in owner.items() if c == i]
        bl = defaultdict(list)
        for x, y, n in mine:
            bl[ln[y]].append(n)
        for v in bl.values():
            if len(v) == 2 and v[0] != v[1]:
                widths.append((r[2] - r[0]) / (abs(v[0] - v[1]) + 1))
    sw = sorted(widths)[len(widths) // 2] if widths else 10.0
    out = defaultdict(lambda: defaultdict(list))
    seen = set()
    lone = []   # (block, row): a cell one seat wide, too narrow for its number
    for ci, r in enumerate(cells):
        cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
        ins = [nums[k] for k, c in owner.items() if c == ci]
        if not ins and not (r[2] - r[0] < 14 and r[3] - r[1] < 14):
            continue
        # the block's name
        col = [nm for nm in names if abs(nm[0] - cx) < 70] or names
        if how == 'below':
            cand = [nm for nm in col if nm[1] < r[1] + 1]
            nm = max(cand, key=lambda t: (t[1], -abs(t[0] - cx)))[2] if cand else None
        else:
            nm = min(col, key=lambda t: (min(abs(t[1] - r[1]), abs(t[1] - r[3])), abs(t[0] - cx)))[2] if col else None
        if not nm:
            report.append(f'{tag}: no name for a cell at {cx:.0f},{cy:.0f}')
            continue
        if not ins:
            L = min(labels, key=lambda v: abs(v - (r[1] + 2.5)), default=None)
            if L is not None and abs(L - (r[1] + 2.5)) < 4:
                lone.append((nm, min(labels[L], key=lambda t: abs(t[0] - cx))[1]))
            continue
        byline = defaultdict(list)
        for x, y, n in ins:
            byline[ln[y]].append((x, n))
        for L, v in byline.items():
            key = (nm, round(L, 1), round(min(x for x, _ in v), 1))
            if key in seen:
                continue
            seen.add(key)
            # the row: the row number on this line nearest the cell
            labs = labels.get(L)
            if not labs:
                report.append(f'{tag}: {nm} no row number on the line at y {L:.0f}')
                continue
            row = min(labs, key=lambda t: abs(t[0] - cx))[1]
            ns = [n for _, n in sorted(v)]
            runs, i = [], 0
            if len(ns) == 1:
                # one number: one seat (a cell's width is the text's, not a
                # seat count: measuring it read 1-seat rows as 2 and 3)
                runs.append([ns[0], ns[0]])
            while len(ns) > 1 and i < len(ns):
                if i + 1 < len(ns):
                    runs.append([min(ns[i], ns[i + 1]), max(ns[i], ns[i + 1])]); i += 2
                else:
                    runs.append([ns[i], ns[i]]); i += 1
            out[nm][row].extend(runs)
    # the one-seat cells: the block's seat on the side its rows start from
    for nm, row in lone:
        if nm in out and row not in out[nm]:
            starts = [runs[0][0] for runs in out[nm].values()]
            base = max(set(starts), key=starts.count)
            out[nm][row].append([base, base])
    return out


def read_2f(path):
    """The 2nd floor's rows as typed in: 'D11 1-8:301-312 9-10:301-313'."""
    out = {}
    for line in open(path, encoding='utf-8'):
        line = line.split('#')[0].strip()
        if not line:
            continue
        nm, *specs = line.split()
        rows = {}
        for sp in specs:
            rr, runs = sp.split(':')
            r0, r1 = (int(v) for v in (rr.split('-') + [rr])[:2]) if '-' in rr else (int(rr), int(rr))
            rs = [[int(a), int(b)] for a, b in (run.split('-') for run in runs.split(','))]
            for r in range(r0, r1 + 1):
                rows[str(r)] = rs
        out[nm] = {'rows': rows}
    return out


def main():
    report, allb = [], {}
    for f, how in FILES:
        r = PdfReader(io.BytesIO(fetch(f)))
        for pi, page in enumerate(r.pages):
            texts, rects = page_items(page)
            got = blocks_of(texts, rects, how, report, f)
            for nm, rows in got.items():
                if nm in allb:
                    report.append(f'{nm} in two places ({f})')
                allb[nm] = {'rows': {str(k): sorted(v) for k, v in sorted(rows.items())}}
            print(f, 'page', pi, len(got), 'blocks', file=sys.stderr)
    # the chart's own slips, set right (each checked against its neighbours)
    for nm, row, runs in FIXES:
        if nm in allb and str(row) in allb[nm]['rows']:
            allb[nm]['rows'][str(row)] = runs
    for nm, b in read_2f('td/td_rows_2f.txt').items():
        allb[nm] = b
    json.dump(dict(sorted(allb.items())), open('td/td_rows_real.json', 'w'), indent=0)
    for line in report[:60]:
        print(line, file=sys.stderr)
    print(len(allb), 'blocks', file=sys.stderr)


if __name__ == '__main__':
    main()
