"""Fill the exposed seating treads beside both foul poles in the Tokyo Dome model."""
import base64
from collections import defaultdict

import numpy as np
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

# These rows have short runs even where the seating tread continues.
LOWER_ROWS = (27, 28, 30, 32, 34)


def _decode(level, key, width):
    return np.frombuffer(base64.b64decode(level[key]), '<i2').reshape(-1, width)


def _encode(rows):
    return base64.b64encode(np.asarray(rows, dtype='<i2').tobytes()).decode('ascii')


def _treads(level, ids):
    polygons = defaultdict(list)
    for row in level['rows']:
        i = row['r']
        if i not in ids:
            continue
        y = level['hs'][i] if 'hs' in level else level['h0'] + i * level['rise']
        if abs(row['y'] - y) > 0.01:
            continue
        polygons[i].extend(Polygon(p[0], p[1:]).buffer(0) for p in row['polys'])
    return {i: unary_union(parts) for i, parts in polygons.items()}


def _lower_gaps(seats, labels, blocks, scale, treads):
    for bid in blocks:
        block = labels[:, 0] == bid
        for row in LOWER_ROWS:
            indices = np.flatnonzero(block & (labels[:, 1] == row))
            if not len(indices):
                continue
            last = indices[np.argmax(labels[indices, 2])]
            _, _, i, yaw = seats[last]
            if i not in treads:
                continue
            usable = treads[i].buffer(-0.18)
            # Match the bend and spacing of the nearest complete row.
            ref_row = min((29, 31, 33, 35), key=lambda r: abs(row - r))
            ref_mask = block & (labels[:, 1] == ref_row)
            ref = dict(zip(labels[ref_mask, 2], seats[ref_mask, :2]))
            last_num = labels[last, 2]
            if last_num not in ref:
                continue
            shift = seats[last, :2].astype(float) - ref[last_num]
            for num, xy in sorted(ref.items()):
                if num <= last_num:
                    continue
                point = (xy + shift) / scale
                if not usable.covers(Point(point)):
                    break
                yield i, point, yaw, bid, row


def fill_seat_gaps(data):
    # The pole-side B blocks have incomplete runs in the detailed chart.
    level = next(level for level in data['levels'] if level['name'] == 'B')
    seats, labels = _decode(level, 'seats', 4), _decode(level, 'labels', 3)
    scale = level['seatScale']
    blocks = [bid for bid, block in enumerate(data['blockNames']) if block in ('B02', 'B48')]
    selected = np.isin(labels[:, 0], blocks)
    ids = set(seats[selected, 2])
    treads = _treads(level, ids)
    by_tread = {i: seats[seats[:, 2] == i, :2] / scale for i in ids}
    new_seats, new_labels = [], []
    next_num = defaultdict(int)
    for bid, row, num in labels[selected]:
        next_num[bid, row] = max(next_num[bid, row], num)
    for i, point, yaw, bid, row in _lower_gaps(seats, labels, blocks, scale, treads):
        packed = np.rint(point * scale).astype(int)
        point = packed / scale
        if np.any(np.linalg.norm(by_tread[i] - point, axis=1) < 0.44):
            continue
        by_tread[i] = np.vstack([by_tread[i], point])
        next_num[bid, row] += 1
        new_seats.append([*packed, i, yaw])
        new_labels.append([bid, row, next_num[bid, row]])
    if new_seats:
        level['seats'] = _encode(np.vstack([seats, new_seats]))
        level['labels'] = _encode(np.vstack([labels, new_labels]))
    print(f'B: filled {len(new_seats)} seat gaps at the foul poles')
