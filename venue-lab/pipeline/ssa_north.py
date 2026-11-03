# Saitama Super Arena: the north end's 200 level as the south end's.
#
# The chart this was generated from is the arena's end-stage layout, which
# leaves the front of the 200 level at the north end out (the stage and its
# backstage stand there): only its back rows, and the corner fans meeting them
# differently from the south's. Round a centre stage the north end is sold and
# seen from all round, and it is built as the south end is: everything of the
# 200 level past ZC metres north of the floor's centre (its rows, the aisles'
# steps, its seats, rails and fences) is replaced by the south end's, mirrored
# north to south, and the south end's two tunnels from the concourse to the
# floor get their mirror at the north. The levels above are the same at both
# ends already (and the stands near ZC either side: the cut does not show).
# Rewrites ssa_stands.json in place (once).
#   python ssa_north.py   (from pipeline/), then python pipeline/mkdata.py ssa
import json, base64, struct
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.affinity import scale

SRC = 'ssa_stands.json'
d = json.load(open(SRC, encoding='utf-8'))
if d.get('northMirrored'): raise SystemExit('already done')
ZC = 38.0
L = next(l for l in d['levels'] if l['name'] == '200')
keep = box(-200, -ZC, 200, 200)       # everything but the north end
south = box(-200, ZC, 200, 200)

def parts(g):
    if g.is_empty: return []
    gs = g.geoms if isinstance(g, MultiPolygon) else [g] if isinstance(g, Polygon) else [x for x in getattr(g, 'geoms', []) if isinstance(x, Polygon)]
    return [p for p in gs if p.area > 0.01]

def rings(p):
    r = lambda c: [[round(x, 3), round(z, 3)] for x, z in list(c.coords)[:-1]]
    return [r(p.exterior)] + [r(h) for h in p.interiors]

def mirror(p): return scale(p, 1, -1, origin=(0, 0))

def split(poly_rings):
    """A polygon's rings -> (the part kept, the south end's part mirrored north)."""
    P = Polygon(poly_rings[0], poly_rings[1:]).buffer(0)
    return parts(P.intersection(keep)), [mirror(q) for q in parts(P.intersection(south))]

# rows: each row's polygons (lists of rings)
for r in L['rows']:
    out = []
    for p in r['polys']:
        k, m = split(p)
        out += [rings(q) for q in k + m]
    r['polys'] = out
# the aisles' steps: one ring each
steps = []
for s in L['steps']:
    k, m = split([s['polys'][0]] + s['polys'][1:] if isinstance(s['polys'][0][0], list) and isinstance(s['polys'][0][0][0], (int, float)) else s['polys'][0])
    for q in k + m: steps.append({**s, 'polys': rings(q)})
L['steps'] = steps
# rails and fences: [x0, z0, x1, z1, y0, y1]
def segs(lst):
    out = []
    for a in lst:
        x0, z0, x1, z1 = a[:4]
        if min(z0, z1) >= -ZC: out.append(a)
        if min(z0, z1) > ZC: out.append([x0, -z0, x1, -z1] + a[4:])
    return out
L['rails'] = segs(L['rails']); L['fences'] = segs(L['fences'])
# seats: int16 [x*10, z*10, row, yaw in degrees] (yaw: facing (sin, cos))
raw = base64.b64decode(L['seats'])
S = struct.unpack('<%dh' % (len(raw) // 2), raw)
seats = []
for i in range(0, len(S), 4):
    x, z, row, yaw = S[i:i + 4]
    if z / 10 >= -ZC: seats.append((x, z, row, yaw))
    if z / 10 > ZC:
        y = 180 - yaw
        if y > 180: y -= 360
        seats.append((x, -z, row, y))
L['seats'] = base64.b64encode(struct.pack('<%dh' % (len(seats) * 4), *[v for s in seats for v in s])).decode()
# the tunnels from the concourse to the floor: the south end's, mirrored
d['tunnels'] = [t for t in d['tunnels'] if t['p'][1] > 0]
# (mirrored, a tunnel's left is its right: its two sides' profiles and mouth
# heights change places)
def flip(t):
    m = {**t, 'p': [t['p'][0], -t['p'][1]], 'u': [t['u'][0], -t['u'][1]]}
    for k in ('sides', 'deck2'):
        if k in t: m[k] = list(reversed(t[k]))
    return m
d['tunnels'] += [flip(t) for t in d['tunnels']]
d['northMirrored'] = True
print('200 level seats', len(S) // 4, '->', len(seats), '; steps', len(steps), '; tunnels', len(d['tunnels']))
json.dump(d, open(SRC, 'w', encoding='utf-8'), separators=(',', ':'))
