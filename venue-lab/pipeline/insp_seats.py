# Inspire Arena: every seat, from the section plan (Offmate's overview, a
# schematic to scale within a few percent) and each section's rows and seat
# numbers (Offmate's seat database). World frame: metres, x east, z south, the
# stage end to the north (-z), the floor's centre at the origin.
import json, numpy as np
S = 0.31                                   # metres per plan unit
C0 = np.array([179.0, 196.0])              # the floor's centre on the plan
secs = json.load(open('insp/svg_secs.json'))
data = json.load(open('insp/offmate_seats.json'))
T1 = [115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101]
T2 = [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 210, 209, 208, 207, 206, 205, 204, 203, 202, 201]
T3 = [320, 319, 318, 317, 316, 315, 314, 313, 312, 311, 310, 309, 308]
names = {1: iter(T1), 2: iter(T2), 3: iter(T3), 0: iter(['F1', 'F2', 'F3', 'F4', 'F5', 'F6'])}
for q in secs:
    q['name'] = str(next(names[q['tier']]))
    q['P'] = (np.array(q['pts'], float) - C0) * S
D = {1: 0.85, 2: 0.80, 3: 0.88}            # tread depth per tier
PITCH = 0.5

def facing(P):
    # toward the floor: the normal of the polygon's edge nearest the centre,
    # snapped to the eight directions of the rectangular bowl
    n = len(P); best = None
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        L = np.linalg.norm(b - a)
        if L < 1.0: continue
        m = (a + b) / 2; d = np.linalg.norm(m)
        if best is None or d < best[0]: best = (d, a, b)
    _, a, b = best
    t = (b - a) / np.linalg.norm(b - a); nv = np.array([-t[1], t[0]])
    if np.dot(nv, -(a + b) / 2) < 0: nv = -nv
    ang = np.round(np.arctan2(nv[1], nv[0]) / (np.pi / 4)) * (np.pi / 4)
    return np.array([np.cos(ang), np.sin(ang)])

def extent(P, f, u, t):
    # the section's width across, at depth t behind its front (extrapolated
    # past the plan's back edge along the section's own sides)
    s0 = (P @ f).max()
    def at(tt):
        c = s0 - tt; xs = []
        n = len(P)
        for i in range(n):
            a, b = P[i], P[(i + 1) % n]
            pa, pb = a @ f - c, b @ f - c
            if (pa >= 0) != (pb >= 0) and abs(pb - pa) > 1e-9:
                q = a + (b - a) * (pa / (pa - pb)); xs.append(q @ u)
        return (min(xs), max(xs)) if len(xs) >= 2 else None
    depth = s0 - (P @ f).min()
    if t < depth - 0.05:
        r = at(max(0.05, t))
        if r: return r
    r0 = at(max(0.05, depth * 0.5)); r1 = at(depth - 0.05)
    if r0 is None or r1 is None: return at(depth * 0.5)
    k = (t - depth * 0.5) / max(1e-6, (depth - 0.05) - depth * 0.5)
    return (r0[0] + (r1[0] - r0[0]) * k, r0[1] + (r1[1] - r0[1]) * k)

def rowkey(r):
    return int(r) if r.isdigit() else r

# which way each section faces (degrees; 0 east, 90 south, 180 west, 270 north)
FACE = {}
for n in (101, 102, 103, 104, 105, 201, 202, 203, 204, 205): FACE[str(n)] = 180
for n in (111, 112, 113, 114, 115, 211, 212, 213, 214, 215, 311, 312, 313, 314, 315): FACE[str(n)] = 0
for n in (107, 108, 109, 207, 208, 209, 308, 309): FACE[str(n)] = 270
for n in (217, 218, 219, 317, 318, 319): FACE[str(n)] = 90
FACE.update({'106': 225, '206': 225, '110': 315, '210': 315, '310': 315, '216': 45, '316': 45, '220': 135, '320': 135})
def fvec(nm):
    a = np.radians(FACE[nm]); return np.array([np.cos(a), np.sin(a)])
by = {q['name']: q for q in secs}
def back_of(tier, f, P):
    # the back of the tier in front of P (same facing, across P's width)
    u = np.array([-f[1], f[0]]); lo, hi = (P @ u).min(), (P @ u).max(); best = None
    for q in secs:
        if q['tier'] != tier or q['tier'] == 0: continue
        if abs(np.dot(fvec(q['name']), f) - 1) > 1e-3: continue
        Q = q['P']
        if (Q @ u).max() < lo + 1 or (Q @ u).min() > hi - 1: continue
        n = len(data[q['name']]['rows'])
        b = (Q @ f).max() - n * D[tier]
        best = b if best is None else min(best, b)
    return best
# the 200s stand a walkway behind the 100s; the 300s rise straight up from
# the wall at the 200s' back (the ribbon board runs along the join)
for tier, gap in ((2, 1.3), (3, 0.0)):
    for q in secs:
        if q['tier'] != tier: continue
        f = fvec(q['name']); b = back_of(tier - 1, f, q['P'])
        if b is None: continue
        s0 = (q['P'] @ f).max()
        if s0 > b - gap:
            q['P'] = q['P'] + f * ((b - gap) - s0)
            print('moved', q['name'], round((b - gap) - s0, 2))
out = {}
for q in secs:
    if q['tier'] == 0: continue
    nm = q['name']; P = q['P']; tier = q['tier']
    rows = data[nm]['rows']
    f = fvec(nm); u = np.array([-f[1], f[0]])
    s0 = (P @ f).max()
    seats = []; rowi = []
    for i, (lab, nums) in enumerate(rows.items()):
        n = len(nums)
        t = (i + 0.55) * D[tier]
        e = extent(P, f, u, t)
        w = e[1] - e[0]
        pitch = min(PITCH, max(0.44, (w - 0.3) / max(1, n)))
        uc = (e[0] + e[1]) / 2
        for k in range(n):
            uu = uc + (k - (n - 1) / 2) * pitch
            p = u * uu + f * (s0 - t)
            seats.append(p); rowi.append(i)
    SA = np.array(seats); us = SA @ u
    front = [u * (us.min() - 0.3) + f * s0, u * (us.max() + 0.3) + f * s0]
    out[nm] = {'tier': tier, 'seats': np.array(seats), 'row': np.array(rowi), 'facing': f, 'poly': P, 'front': front}
    print(nm, 'facing', np.round(f, 2), 'rows', len(rows), 'seats', len(seats))
np.save('insp/insp_seats.npy', out, allow_pickle=True)
print('total', sum(len(v['seats']) for v in out.values()))
