# The Wembley generator's input (per level: seats, front line, the stand's
# footprint, row depth, in the plan's (east, south) frame) recovered from the
# stands it generated, the plan it was first read from not being kept.
import json, base64, pickle, numpy as np
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
d = json.load(open('orig/wb_stands.json'))
inv = lambda P: np.c_[np.asarray(P)[:, 1], -np.asarray(P)[:, 0]]     # world (north, east) -> (east, south)
out = {}
for L in d['levels']:
    a = np.frombuffer(base64.b64decode(L['seats']), dtype='<i2').reshape(-1, 4).astype(float)
    seats = np.c_[a[:, 0] / 10, a[:, 1] / 10]
    polys = [Polygon(p[0], p[1:]).buffer(0) for r in L['rows'] for p in r['polys']] + [Polygon(p['polys'][0], p['polys'][1:]).buffer(0) for p in L['steps']]
    U = unary_union(polys).buffer(0.25).buffer(-0.25)
    parts = list(U.geoms) if isinstance(U, MultiPolygon) else [U]
    big = max(parts, key=lambda p: p.area)
    if L['name'] == 'L1':
        front = np.array(d['field'][0][0])
    else:
        inner = min(big.interiors, key=lambda r: Polygon(r).centroid.distance(Polygon(r).centroid.__class__(0, 0)) if False else Polygon(r).distance(Polygon([(-1, -1), (1, -1), (1, 1), (-1, 1)])))
        front = np.array(inner.coords)
    foot = [np.array(big.exterior.coords)] + [np.array(p.exterior.coords) for p in parts if p is not big and p.area > 50]
    out[L['name']] = {'seats': inv(seats), 'front': inv(front), 'foot': [inv(f) for f in foot], 'D': L['D']}
    print(L['name'], len(seats), 'front pts', len(front), 'foot', [len(f) for f in foot], 'D', L['D'])
pickle.dump(out, open('wb/wb_seats.pkl', 'wb'))
