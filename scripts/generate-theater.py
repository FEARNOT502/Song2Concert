"""Read the operator's 2025 PDF chair outlines (PyMuPDF), not a schematic grid.
Usage: python3 scripts/generate-theater.py /path/to/musical_hall_2025.pdf
The official numbered charts supply the labels; section page 4 supplies heights.
"""
import collections
import json
import math
import sys
from pathlib import Path
import fitz

PDF = fitz.open(sys.argv[1])
SCALE = 15.2  # PDF points / metre, from dimension extension endpoints
CENTRES = [441.30, 442.38, 443.40]
STAGE_EDGES = [558.84, 661.56, 661.56]
HEIGHTS = [
    [0, .039, .095, .158, .237, .316, .418, .647, .774, .908, 1.05,
     1.192, 1.334, 1.492, 1.65, 1.808, 1.974, 2.147, 2.329, 2.511, 2.692, 2.882],
    [6.324, 6.663, 7.003, 7.342, 7.682, 8.021, 8.424, 8.826, 9.221, 9.624],
    [12.418, 12.924, 13.571, 14.068, 14.574, 15.071],
]


def chairs(page):
    out = []
    for d in page.get_drawings():
        if d['type'] != 's':
            continue
        items, edges = d['items'], []
        if len(items) in (3, 4) and all(i[0] == 'l' for i in items):
            edges = [(i[1], i[2]) for i in items]
        elif len(items) == 1 and items[0][0] in ('qu', 're'):
            q = items[0][1]
            points = [q.ul, q.ur, q.lr, q.ll] if items[0][0] == 'qu' else [q.tl, q.tr, q.br, q.bl]
            edges = list(zip(points, points[1:] + points[:1]))
        lengths = [math.dist(a, b) for a, b in edges]
        if not (lengths and all(6.4 < n < 6.95 or 3.15 < n < 3.65 for n in lengths)
                and min(lengths) < 4 and max(lengths) > 6):
            continue
        r = d['rect']
        # The pan is an open U or a rectangle. Its centroid is the seat origin.
        long_edge = next((a, b) for a, b in edges if math.dist(a, b) > 6)
        a, b = long_edge
        angle = math.atan2(b.y - a.y, b.x - a.x)
        angle = (angle + math.pi / 2) % math.pi - math.pi / 2
        out.append({'px': (r.x0+r.x1)/2, 'py': (r.y0+r.y1)/2,
                    'angle': angle, 'op': d['color'] != (0., 0., 0.)})
    return out


def clusters(items, key, tolerance=1):
    groups = []
    for item in sorted(items, key=key, reverse=True):
        if not groups or abs(key(item)-sum(key(v) for v in groups[-1])/len(groups[-1])) > tolerance:
            groups.append([])
        groups[-1].append(item)
    return groups


seats, rows_meta = [], []
for f in range(3):
    all_chairs = chairs(PDF[f])
    fixed = [s for s in all_chairs if not s['op']]
    assert len(fixed) == [958, 430, 270][f]
    # The central rows establish row depth; angled sides are fitted to those rows.
    centre = [s for s in fixed if abs(s['px']-CENTRES[f]) < 73]
    central_rows = clusters(centre, lambda s: s['py'])
    assert len(central_rows) == [22, 10, 6][f]
    row_depths = [sum(s['py'] for s in r)/len(r) for r in central_rows]
    parts = collections.defaultdict(list)
    for s in fixed:
        side = -1 if s['px'] < CENTRES[f]-73 else 1 if s['px'] > CENTRES[f]+73 else 0
        # Project an angled row back to the centre block's aisle edge.
        py = s['py'] - math.tan(s['angle']) * (s['px']-(CENTRES[f]+side*73)) if side else s['py']
        row = min(range(len(row_depths)), key=lambda i: abs(row_depths[i]-py))
        parts[row, side].append(s)
    for row in range(len(row_depths)):
        for side in [-1, 0, 1]:
            items = sorted(parts[row, side], key=lambda s: s['px'])
            expected = ([8,9,10,10,11,12,13][row] if f == 0 and row < 7 and side else
                        15 if f == 0 and side else None)
            if expected is not None:
                assert len(items) == expected, (f,row,side,len(items),expected)
            if f == 0:
                nums = list(range(16-len(items),16)) if side < 0 else list(range(34,34+len(items))) if side > 0 else list(range(16,16+len(items)))
            elif f == 1:
                nums = list(range(16-len(items),16)) if side < 0 else list(range(32,32+len(items))) if side > 0 else list(range(16,16+len(items)))
            else:
                nums = list(range(17-len(items),17)) if side < 0 else list(range(33,33+len(items))) if side > 0 else list(range(17,33)) if row < 5 else [17,18,19,20,21,22,23,24,25,26,27,28,29,30]
            assert len(nums) == len(items), (f,row,side,len(items),len(nums))
            row_seats=[]
            for s,n in zip(items,nums):
                # Positive x is audience right, positive z is away from stage.
                value=[f+1,row+1,n,round((s['px']-CENTRES[f])/SCALE,4),HEIGHTS[f][row],
                       round(5.9+(STAGE_EDGES[f]-s['py'])/SCALE,4),round(math.pi+s['angle'],5),'standard']
                seats.append(value);row_seats.append(len(seats)-1)
            rows_meta.append({'floor':f+1,'row':row+1,'side':side,'seats':row_seats})
    if f == 0:
        op = [s for s in all_chairs if s['op']]
        assert len(op) == 76
        # OP rows on the technical drawing are unnumbered. Labels are explicitly
        # local identifiers, never presented as the operator's ticket numbers.
        op_depths = [sum(s['py'] for s in g)/len(g) for g in clusters([s for s in op if abs(s['px']-CENTRES[f])<73], lambda s:s['py'])]
        op_rows = collections.defaultdict(list)
        for s in op:
            side = -1 if s['px']<CENTRES[f]-73 else 1 if s['px']>CENTRES[f]+73 else 0
            py=s['py']-math.tan(s['angle'])*(s['px']-(CENTRES[f]+side*73))
            op_rows[min(range(3),key=lambda i:abs(op_depths[i]-py))].append(s)
        for ri, group in sorted(op_rows.items()):
            for n,s in enumerate(sorted(group,key=lambda s:s['px']),1):
                seats.append([1,f'OP {ri+1}',n,round((s['px']-CENTRES[f])/SCALE,4),0,
                              round(5.9+(STAGE_EDGES[f]-s['py'])/SCALE,4),round(math.pi+s['angle'],5),'op'])

# The official numbered map supplies these 18 bays and 14 family-room places.
# Their spacing is fitted to the back rooms on the plan, not a fixed chair grid.
for side in [-1,1]:
    for i in range(9):
        x=side*(5.9+i*.66)
        n=(9-i) if side<0 else 10+i
        seats.append([1,23,n,round(x,3),2.882,round(32.9-(abs(x)-5.9)*.215,3),math.pi+side*.21,'wheelchair'])
    for i in range(7):
        x=side*(6.1+i*.61)
        n=(7-i) if side<0 else 8+i
        seats.append([1,'FAMILY',n,round(x,3),2.882,round(34.5-(abs(x)-6.1)*.215,3),math.pi+side*.21,'family'])

assert len(seats)==1766
root=Path(__file__).resolve().parents[1]
target=root/'src/three/venues/theater-data.js'
target.write_text('// Generated from official 2025 technical drawings + numbered floor charts.\n'
                  '// See docs/THEATER_REMODEL.ko.md for sources and reconstruction limits.\n'
                  '// [floor, row, number, x, floorHeight, z, yaw, type]\n'
                  +'export const THEATER_SEATS = '+json.dumps(seats,separators=(',',':'))+';\n'
                  +'export const THEATER_ROWS = '+json.dumps(rows_meta,separators=(',',':'))+';\n'
                  +'export const THEATER_HEIGHTS = '+json.dumps(HEIGHTS,separators=(',',':'))+';\n')
print('Generated',target,len(seats),'seats')
