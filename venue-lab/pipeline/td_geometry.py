"""Tokyo Dome's continuous plan geometry, before openings are cut from it.

The 10 cm occupancy grid determines ownership, not the shape of a row's nose.
Trace analytic row lines and retain the intentional A01/A02 diagonal crease.
"""
import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter
from shapely.geometry import Polygon
from shapely.ops import unary_union
import cv2


def distance(mask, resolution, soften=0.16):
    """Euclidean metres; remove pixel-size ripples without chamfer octagons."""
    field = distance_transform_edt(mask).astype(np.float32) * resolution
    if soften:
        field = gaussian_filter(field, soften / resolution, mode='nearest')
    return field.astype(np.float32)


def domain(mask, grid, x0=0, z0=0):
    contours, tree = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if tree is None:
        return Polygon()
    def ring(c):
        q = c[:, 0, :]
        return np.c_[grid.m(q[:, 0] + x0, q[:, 1] + z0)]
    polys = []
    for i, c in enumerate(contours):
        if tree[0, i, 3] >= 0 or len(c) < 3:
            continue
        holes = [ring(contours[j]) for j in range(len(contours))
                 if tree[0, j, 3] == i and len(contours[j]) >= 3]
        p = Polygon(ring(c), holes).buffer(0).simplify(grid.res * 1.1, preserve_topology=True)
        if not p.is_empty:
            polys.append(p)
    return unary_union(polys)


def row_strip(finger, lo, hi, shape, overlap=0.03):
    """Exact straight/parabolic row band clipped to its own block domain.

    A crease is a vertex, never an averaged normal or a smoothed height field.
    The same row_point/coord functions also place seats and calculate heights.
    """
    if shape.is_empty:
        return shape
    x0, z0, x1, z1 = shape.bounds
    box = np.array([[x0, z0], [x1, z0], [x1, z1], [x0, z1]])
    ts = box @ finger.u
    cs = finger.coord(box)
    lo = float(cs.min() - 5) if lo < -100 else lo - overlap
    hi = float(cs.max() + 5) if hi > 100 else hi
    lateral = list(np.arange(ts.min() - 2, ts.max() + 2.25, 0.25))
    if finger.kink is not None:
        lateral.append(finger.kink[0])
    if finger.kinkR is not None:
        q0, q1 = finger.kinkR[:2]
        dc = float(finger.coord(q1) - finger.coord(q0))
        if abs(dc) > 1e-9:
            for c in (lo, hi):
                q = q0 + (q1 - q0) * ((c - float(finger.coord(q0))) / dc)
                lateral.append(float(q @ finger.u))
    t = np.array(sorted(set(q for q in lateral if ts.min() - 2 <= q <= ts.max() + 2)))
    band = Polygon(np.vstack([finger.row_point(t, lo), finger.row_point(t[::-1], hi)])).buffer(0)
    return shape.intersection(band)
