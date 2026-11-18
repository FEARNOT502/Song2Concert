"""Fit the Level 200 treads and ceiling lining to the finished wall faces."""

import json
import math
from pathlib import Path

from shapely.geometry import LineString, Polygon
from shapely.ops import linemerge, unary_union

from ssa_tunnels import clip_rows


def polygon_rings(geometry):
    def ring(coords):
        return [[round(x, 2), round(z, 2)] for x, z in list(coords)[:-1]]

    return [[ring(p.exterior.coords), *[ring(h.coords) for h in p.interiors]]
            for p in getattr(geometry, 'geoms', [geometry]) if p.geom_type == 'Polygon' and p.area > 0.02]


def clear_ceiling_lips(data):
    # The raster ceiling used to extend into the bowl at the splayed walls.
    # Trim it against the same path used to build the inside face in the app.
    plan = json.loads(Path(__file__).with_name('ssa-200-wall-plan.json').read_text())
    frames = {int(f['label']): f for f in data['frames']}
    trims = []
    for run in plan['ends']:
        line = [point[:2] for point in plan['wings'][str(run[0])]]
        for p in run:
            if isinstance(p, list):
                if tuple(p[:2]) != tuple(line[-1]):
                    line.append(p[:2])
                continue
            f = frames[p]
            ux, uz = math.sin(f['yaw']), math.cos(f['yaw'])
            half = 1.6 if str(p) in plan['wings'] else f['w'] / 2 + 0.15
            x, z = f['x'] - ux * 0.15, f['z'] - uz * 0.15
            line.extend([(x + uz * s, z - ux * s) for s in (half, -half)])
        line.extend(point[:2] for point in plan['wings'][str(run[-1])])
        bore = LineString(line).offset_curve(-0.035, join_style='mitre')
        trim = bore.buffer(2.0, single_sided=True, join_style='mitre')
        trims.append(list(trim.exterior.coords)[:-1])

    rooms = data['rooms']
    def is_level200(piece):
        return 6.2 < piece['y'] <= 10.2

    for kind in ('soffits', 'ceils'):
        trimmed = iter(clip_rows([p for p in rooms[kind] if is_level200(p)], trims))
        rooms[kind] = [next(trimmed) if is_level200(p) else p for p in rooms[kind]]


def join_portal_ceilings(rooms, lids):
    # One coplanar ceiling from the lintel to the inside of the concourse.
    ceiling = next(piece for piece in rooms['ceils'] if piece['y'] == 10.2)
    parts = [Polygon(p[0], p[1:]).buffer(0) for p in ceiling['polys']]
    ceiling['polys'] = polygon_rings(unary_union(parts + [Polygon(lid) for lid in lids]))


def join_balcony_soffits(data):
    rows = next(level['rows'] for level in data['levels'] if level['name'] == '500')
    underside = min(r['y0'] for r in rows)
    deck = unary_union([Polygon(p[0], p[1:]).buffer(0) for r in rows for p in r['polys']])
    # Trace only the rear 400 wall underneath the 500 balconies. The liner
    # overlaps the balcony underside and seats against its supporting wall.
    wall_lines = [LineString([(x, z), (xx, zz)]) for x, z, xx, zz, _, top in data['rooms']['acousticWalls']
                  if abs(z) > 40 and abs(zz) > 40 and underside <= top < 24]
    runs = linemerge(wall_lines, directed=True)
    strips = [line.offset_curve(0.04).buffer(-3.1, single_sided=True, join_style='mitre')
              for line in getattr(runs, 'geoms', [runs])]
    liner = unary_union(strips).buffer(0.65).buffer(-0.65).intersection(deck.buffer(3.0))
    data['rooms']['soffits'].append({'y': round(underside - 0.018, 3), 'polys': polygon_rings(liner)})


def clear_corner_passages(data):
    frames = [f for f in data['frames'] if f['label'] in ('212', '219', '232', '239')]
    openings, lids = [], []
    for f in frames:
        ux, uz = math.sin(f['yaw']), math.cos(f['yaw'])
        # The data places the frame at the centre of a 0.3 m wall.
        x, z = f['x'] - 0.15 * ux, f['z'] - 0.15 * uz
        half = f['w'] / 2 + 0.04
        def rect(half_width, front, back):
            return [[x + uz * s + ux * t, z - ux * s + uz * t]
                    for s, t in [(-half_width, front), (half_width, front),
                                 (half_width, back), (-half_width, back)]]

        openings.append(rect(half, -0.52, 3.75))
        lids.append(rect(f['w'] / 2 + 0.025, 0.30, 3.32))

    level = next(level for level in data['levels'] if level['name'] == '200')
    level['rows'] = clip_rows(level['rows'], openings)
    steps = clip_rows([{**step, 'polys': [step['polys']]} for step in level['steps']], openings)
    level['steps'] = [{**step, 'polys': part, **({'light': False} if i else {})}
                      for step in steps for i, part in enumerate(step['polys'])]
    rooms = data['rooms']

    def crosses_headroom(piece):
        return 7.5 < piece['y'] < 10.2

    for kind in ('soffits', 'ceils'):
        trimmed = iter(clip_rows([p for p in rooms[kind] if crosses_headroom(p)], openings))
        rooms[kind] = [next(trimmed) if crosses_headroom(p) else p for p in rooms[kind]]
    clear_ceiling_lips(data)
    join_portal_ceilings(rooms, lids)
    join_balcony_soffits(data)
