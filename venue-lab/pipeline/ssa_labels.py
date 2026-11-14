# Saitama Super Arena: every seat labelled as its ticket names it.
#   python3 ssa_labels.py   (after ssa_gen.py; rewrites ssa_stands.json in place)
# Adds to each seated level `labels` (base64 int16 (n, 3): block id, row, seat,
# in the order of its seats) and to the data `blockNames` (block id -> name), in
# the form Tokyo Dome's and Wembley's labels take (the app reads them the same
# way).
#
# The seats are the official list's (ssa_seats.py: every one of them, where the
# map draws it): each output seat is matched to its numbered seat by position.
# Row and seat number are the list's. The list has no block names (its blocks
# are the map's areas, each its own block here); a block is named by its door
# (扉): the door badge on the map nearest its middle, the level's own doors
# (2xx, 3xx, 4xx, 5xx), with a letter where a door serves several (front rows
# first). The suites along the west side (not in the list)
# are S01-S15 from the south end, as the numbers run round the levels, their
# seats numbered from 1 in each row the same way.
import json, base64, os, collections
import numpy as np
from scipy.spatial import cKDTree
import ssa_blocks as SB
import ssa_seats as SS

SRC = 'ssa_stands.json'
d = json.load(open(SRC))
CH = SB.load_chart()
O = json.load(open(SS.OUT))['levels']
names = []; nid = {}
def bid(name):
    if name not in nid: nid[name] = len(names); names.append(name)
    return nid[name]

report = {}
for L in d['levels']:
    a = np.frombuffer(base64.b64decode(L['seats']), '<i2').reshape(-1, 4).astype(float)
    sk = L.get('seatScale', 10)
    P = a[:, :2] / sk; row = a[:, 2].astype(int)
    lab = np.zeros((len(P), 3), '<i2')
    if L['name'] in O:
        lv = L['name']; o = O[lv]
        op = np.array(o['P']); orow = np.array(o['row']); onum = np.array(o['num']); orb = np.array(o['rblock'])
        dd, ii = cKDTree(op).query(P)
        assert (dd < 0.12).all() and (orow[ii] == row).all() and len(set(ii)) == len(P), f'{lv}: seats not one to one'
        # each list block's door: the level's door badge nearest its middle
        doors = {int(g): np.array(SB.to_metres(CH, v['centre'], lv)) for g, v in CH['gates'].items() if str(v['level']) == lv[0]}
        gi = np.array(sorted(doors)); gp = np.array([doors[g] for g in gi])
        door = {}
        for b in np.unique(orb):
            c = op[orb == b].mean(0)
            door[int(b)] = int(gi[np.argmin(np.linalg.norm(gp - c, axis=1))])
        # each of the list's blocks its own: a door with several gets a letter on its number for each, from its
        # front rows back, then the way the numbers run (236A, 236B, ...)
        bname = {}
        for g in sorted(set(door.values())):
            bs = [b for b in door if door[b] == g]
            bs.sort(key=lambda b: (orow[orb == b].min(), onum[orb == b].min()))
            for i, b in enumerate(bs): bname[b] = str(g) if len(bs) == 1 else f'{g}{chr(65 + i)}'
        for k in range(len(P)):
            j = ii[k]
            lab[k] = (bid(bname[int(orb[j])]), orow[j] + 1, onum[j])
        report[lv] = {'seats': len(P), 'blocks': len(bname), 'doors': len(set(door.values())), 'nameOf': {str(b): n for b, n in sorted(bname.items())}}
    elif L['name'] == '300S':
        boxes = d['suites']['boxes']
        bx = np.array([[b[0], b[1]] for b in boxes])
        order = np.argsort(-bx[:, 0])                     # S01 at the south end (z largest)
        sname = {int(i): f'S{n + 1:02d}' for n, i in enumerate(order)}
        box = np.array([int(np.nonzero((bx[:, 0] <= z + 1e-6) & (z <= bx[:, 1] + 1e-6))[0][0]) for z in P[:, 1]])
        for i in np.unique(box):
            for r in np.unique(row[box == i]):
                m = np.nonzero((box == i) & (row == r))[0]
                m = m[np.argsort(-P[m, 1])]
                for n, k in enumerate(m): lab[k] = (bid(sname[int(i)]), r + 1, n + 1)
        report['300S'] = {'seats': len(P), 'suites': len(np.unique(box))}
    else:
        continue
    L['labels'] = base64.b64encode(lab.tobytes()).decode('ascii')

d['blockNames'] = names
json.dump(d, open(SRC, 'w'), separators=(',', ':'))
json.dump(report, open('ssa/ssa_labels_report.json', 'w'), indent=1)
print('blockNames', len(names), {k: {kk: vv for kk, vv in v.items() if kk != 'nameOf'} for k, v in report.items()})
