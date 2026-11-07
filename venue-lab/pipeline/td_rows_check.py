# Tokyo Dome: td/td_rows_real.json (the detailed chart's rows) against the
# official seating map's block labels (td/td_labeled.json: each block's first
# and last row and its first seat number), and against itself (rows missing
# inside a block, a seat number out of line, the 1st and 3rd base sides'
# mirror blocks). Prints what disagrees and each stand's totals.
#
#   python td_rows_check.py            (from inside pipeline/)

import json
from collections import defaultdict

real = json.load(open('td/td_rows_real.json'))
lab = json.load(open('td/td_labeled.json'))

# the official labels: A [block, row0, row1, first seat]; B [block, row0, row1];
# D [block, row0, row1, first seat] (one of them the other way round); E [block, row0, row1]
off = {}
for o in lab:
    n, L = o['nums'], o['L']
    if L in 'AD' and len(n) == 4:
        b = n[0] if n[0] < 60 else None
        rest = [v for v in n[1:]]
        seat = max(rest) if max(rest) > 60 or rest[-1] == 1 else rest[-1]
        rows = sorted(v for v in rest if v != seat)
        if b is not None and len(rows) == 2:
            off.setdefault(f'{L}{b:02d}', (rows[0], rows[1], seat))
    elif L in 'BE' and len(n) == 3:
        off.setdefault(f'{L}{n[0]:02d}', (n[1], n[2], None))

mirror = {}
for i in range(1, 50):
    mirror[f'A{i:02d}'] = f'A{50 - i:02d}'
    mirror[f'B{i:02d}'] = f'B{50 - i:02d}'

seats = lambda b: sum(e - s + 1 for runs in b['rows'].values() for s, e in runs)
issues = []
for nm, b in sorted(real.items()):
    rs = sorted(int(r) for r in b['rows'])
    gaps = [r for r in range(rs[0], rs[-1] + 1) if r not in rs]
    if gaps:
        issues.append(f'{nm}: rows missing {gaps}')
    o = off.get(nm)
    if o:
        if (o[0], o[1]) != (rs[0], rs[-1]):
            issues.append(f'{nm}: rows {rs[0]}-{rs[-1]}, official {o[0]}-{o[1]}')
        if o[2] is not None:
            first = min(s for runs in b['rows'].values() for s, _ in runs)
            if first != o[2]:
                issues.append(f'{nm}: first seat {first}, official {o[2]}')
    # a row's run reaching past the block's 20 numbers, or starting off its line
    starts = [runs[0][0] for runs in b['rows'].values()]
    lo = min(starts)
    for r, runs in b['rows'].items():
        for s, e in runs:
            if e - lo >= 20 and nm[0] in 'ABDE':
                issues.append(f'{nm} row {r}: {s}-{e} runs past {lo}+19')
    m = mirror.get(nm)
    if m and m in real and nm < m:
        a, c = b['rows'], real[m]['rows']
        da = {r: sum(e - s + 1 for s, e in v) for r, v in a.items()}
        dc = {r: sum(e - s + 1 for s, e in v) for r, v in c.items()}
        if da != dc:
            diff = [r for r in sorted(set(da) | set(dc), key=int) if da.get(r) != dc.get(r)]
            issues.append(f'{nm}/{m} (mirrors) differ in rows {diff[:10]}{"..." if len(diff) > 10 else ""}')

print(len(issues), 'issues')
print('\n'.join(issues))
tot = defaultdict(int)
for nm, b in real.items():
    tot[nm[0]] += seats(b)
print('seats by stand:', dict(sorted(tot.items())), 'total', sum(tot.values()))
print('blocks by stand:', {L: sum(1 for k in real if k[0] == L) for L in sorted(tot)})
