"""The Saitama Super Arena map's drawn outline round each floor corner's open funnel, read off the map image: the thin white
line the map draws round the stands (the seats' squares are grey, the labels coloured, so the line is the only white). Each
side of the funnel is a straight line or two (the end stand's last block, the fan's, and the line the middle blocks' front
rows lie on); a robust line fit to the white pixels beside the line's approximate place gives each. -> ssa/ssa_corners.json:
{corner: {'rear': [lines], 'fan': [lines], 'back': line, 'verts': {...}}}, a line {'p': a point, 'd': its unit direction}
in metres (the level's frame: out from the front, the rear lines and the fan's running to the back; the back line from the
rear side to the fan's), 'verts' the corners where they meet. Run from this folder: python3 ssa_outline.py"""
import json, numpy as np
from PIL import Image
import ssa_blocks as SB

IMG = 'ssa/raw/img-map_arena_end02.png'
# where each side lies, roughly (metres): [points along it], how many straight lines it is
ROI = {'SE': {'rear': ([(18.05, 41.0), (21.55, 54.9)], 1), 'fan': ([(23.8, 39.2), (33.8, 49.3)], 1), 'back': ([(21.6, 54.8), (33.0, 49.2)], 1)},
       'SW': {'rear': ([(-17.9, 41.0), (-19.7, 49.0), (-22.3, 54.4)], 2), 'fan': ([(-23.9, 39.3), (-29.0, 44.8), (-31.6, 50.0)], 2), 'back': ([(-22.1, 54.5), (-31.6, 50.0)], 1)}}


def white_points(im, centre, x0, x1, z0, z1):
    """the metres of the white pixels in a box"""
    ys, xs = np.mgrid[int(centre[1] + z0 * 20):int(centre[1] + z1 * 20), int(centre[0] + x0 * 20):int(centre[0] + x1 * 20)]
    p = im[ys, xs]; mn, mx = p.min(2), p.max(2); m = (mn >= 150) & ((mx - mn) <= 25)
    return np.c_[(xs[m] - centre[0]) / 20.0, (ys[m] - centre[1]) / 20.0]


def near_path(P, approx, w):
    """the points within `w` of the polyline `approx` (and along it)"""
    A = np.asarray(approx, float); keep = np.zeros(len(P), bool)
    for k in range(len(A) - 1):
        a, d = A[k], A[k + 1] - A[k]; L = float(np.hypot(*d)); d = d / L; n = np.array([-d[1], d[0]]); q = P - a
        keep |= (np.abs(q @ n) <= w) & (q @ d >= -0.2) & (q @ d <= L + 0.2)
    return P[keep]


def best_line(P, rng, thr=0.05, tries=1500):
    """RANSAC: the line with most points within `thr` (two points at least 1.5 m apart), refitted to them -> (point, direction
    with a positive z, inlier mask)"""
    best = None
    for _ in range(tries):
        i, j = rng.choice(len(P), 2, replace=False); a, d = P[i], P[j] - P[i]; L = float(np.hypot(*d))
        if L < 1.5: continue
        inl = np.abs((P - a) @ (np.array([-d[1], d[0]]) / L)) < thr
        if best is None or inl.sum() > best.sum(): best = inl
    c = P[best].mean(0); d = np.linalg.svd(P[best] - c)[2][0]
    if d[1] < 0: d = -d
    return c, d, np.abs((P - c) @ np.array([-d[1], d[0]])) < thr


def meet(l0, l1):
    den = l0['d'][0] * l1['d'][1] - l0['d'][1] * l1['d'][0]
    t = ((l1['p'][0] - l0['p'][0]) * l1['d'][1] - (l1['p'][1] - l0['p'][1]) * l1['d'][0]) / den
    return [l0['p'][0] + l0['d'][0] * t, l0['p'][1] + l0['d'][1] * t]


def main():
    ch = SB.load_chart(); im = np.array(Image.open(IMG).convert('RGB')).astype(int); rng = np.random.default_rng(1)
    out = {}
    for name, sides in ROI.items():
        out[name] = {}
        for side, (approx, k) in sides.items():
            xs, zs = [a[0] for a in approx], [a[1] for a in approx]
            P = near_path(white_points(im, ch['centre'], min(xs) - 1.5, max(xs) + 1.5, min(zs) - 1.5, max(zs) + 1.5), approx, 0.7)
            lines = []
            for _ in range(k):
                c, d, inl = best_line(P, rng); P = P[~inl]
                lines.append({'p': c, 'd': d})
            lines.sort(key=lambda l: float(np.hypot(*(l['p'] - np.array(approx[0])))))      # (from the front end along the side)
            out[name][side] = lines
        back = out[name]['back'][0]
        if np.sign(back['d'][0]) != np.sign(out[name]['fan'][-1]['p'][0] - out[name]['rear'][-1]['p'][0]): back['d'] = -back['d']   # (rear side to fan side)
        rear, fan = out[name]['rear'], out[name]['fan']
        out[name]['verts'] = {'B': meet(rear[-1], back), 'C': meet(fan[-1], back)}
        if len(rear) > 1: out[name]['verts']['rear_bend'] = meet(rear[0], rear[1])
        if len(fan) > 1: out[name]['verts']['fan_bend'] = meet(fan[0], fan[1])
        print(name, {k: np.round(v, 2).tolist() for k, v in out[name]['verts'].items()}, 'rear', len(rear), 'fan', len(fan))
    r = lambda v: [round(float(c), 4) for c in v]
    ser = lambda o: {k: ([{'p': r(l['p']), 'd': r(l['d'])} for l in v] if k in ('rear', 'fan') else {'p': r(v[0]['p']), 'd': r(v[0]['d'])} if k == 'back' else {a: r(b) for a, b in v.items()})
                     for k, v in o.items()}
    json.dump({n: ser(o) for n, o in out.items()}, open('ssa/ssa_corners.json', 'w'), indent=1)


if __name__ == '__main__': main()
