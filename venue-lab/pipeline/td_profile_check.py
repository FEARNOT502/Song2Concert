# Tokyo Dome: the 1st floor's rake, block by block, from td_stands.json.
# Each tread (a row of one block) is put in its block by where it lies (the
# official map's block outlines, td/td_labeled.json) and numbered by height
# from the block's front (its first row the official one). Reports, per block,
# the riser between each two rows (a rake that flattens towards the back has
# them shrinking), and per row number the spread of heights across the
# blocks (steps that do not line up across an aisle).
#
#   python td_profile_check.py [td_stands.json]      (from inside pipeline/)

import json, sys
import numpy as np
from collections import defaultdict
from matplotlib.path import Path

src = sys.argv[1] if len(sys.argv) > 1 else 'td_stands.json'
d = json.load(open(src))
lab = json.load(open('td/td_labeled.json'))
Hm, s = np.array([579.2, 441.7]), 2.996
toR = lambda p: np.c_[(np.array(p)[:, 0] - Hm[0]) / s, (np.array(p)[:, 1] - Hm[1]) / s]

blocks = {}
for o in lab:
    if o['L'] in 'AB' and 1 <= len(o['nums']) <= 6 and o['nums'][0] < 60:
        nm = f"{o['L']}{o['nums'][0]:02d}"
        P = toR(o['poly'])
        blocks.setdefault(nm, []).append(Path(P))
# the 3B side's B outlines are the 1B side's mirrored where the map has none
for nm in list(blocks):
    if nm[0] == 'B':
        m = f'B{50 - int(nm[1:]):02d}'
        if m not in blocks:
            blocks[m] = [Path(np.c_[-p.vertices[:, 0], p.vertices[:, 1]]) for p in blocks[nm]]

first = {}
real = json.load(open('td/td_rows_real.json'))
for nm, b in real.items():
    first[nm] = min(int(r) for r in b['rows'])

prof = defaultdict(list)   # block -> [(y, centroid)]
for L in d['levels']:
    if L['name'] not in 'AB':
        continue
    for row in L['rows']:
        pts = np.array([p for poly in row['polys'] for ring in poly[:1] for p in ring], dtype=float).reshape(-1, 2)
        if not len(pts):
            continue
        c = pts.mean(0)
        hit = [nm for nm, ps in blocks.items() if nm[0] == L['name'] and any(p.contains_point(c) for p in ps)]
        if not hit:
            # nearest outline
            hit = [min((nm for nm in blocks if nm[0] == L['name']), key=lambda nm: min(np.min(np.hypot(*(p.vertices - c).T)) for p in blocks[nm]))]
        prof[hit[0]].append(row['y'])

flat, byrow = [], defaultdict(list)
for nm in sorted(prof):
    ys = sorted(set(round(y, 3) for y in prof[nm]))
    r0 = first.get(nm, 1 if nm[0] == 'A' else 27)
    risers = np.diff(ys)
    for i, y in enumerate(ys):
        byrow[(nm[0], r0 + i)].append((y, nm))
    shrink = [(r0 + i + 1, round(risers[i - 1], 3), round(risers[i], 3)) for i in range(1, len(risers)) if risers[i] < risers[i - 1] - 0.03]
    if shrink:
        flat.append((nm, len(ys), [round(v, 2) for v in (ys[0], ys[-1])], shrink[:4]))
print('blocks whose riser shrinks going up (row, riser below, riser above):')
for f in flat:
    print(' ', f)
print('\nheight spread across blocks at the same row number (max - min, m):')
for key in sorted(byrow):
    v = byrow[key]
    if len(v) >= 3:
        ys = [y for y, _ in v]
        lo, hi = min(v), max(v)
        if hi[0] - lo[0] > 0.25:
            print(f'  {key[0]} row {key[1]:2d}: {hi[0] - lo[0]:.2f} ({lo[1]} {lo[0]:.2f} .. {hi[1]} {hi[0]:.2f}), {len(v)} blocks')
