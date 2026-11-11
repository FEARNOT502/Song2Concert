# Tokyo Dome: what stands in the 3B side's 1st-floor rows the seat chart leaves out (B31-B33 past row 35, B35-B39
# past row 38/39; the 1B side's B11-B19 run on to rows 45-47 there).
#
# Evidence (2026-11; td_chart.py lists the rest):
#  - THE 3rd PLATINUM BOX: "1階席3塁側スタンドに設置された4人掛けソファタイプのグループ席 ... 座席の合計は72席、延べ18組"
#    (Kotobuki, 2022); "1階席3塁側スタンド内にあり ... 新たに12区画分（48席）増設" (Travel Watch, 2023): 30 boxes of
#    four, white leather sofas set in an L, a table, in the 1st floor's 3B stand. No source gives its blocks or rows.
#  - The press seats (記者席) moved from behind home to the 3B side in 2016 (Wikipedia; nobilog). A fan's notes on the
#    seats they block from view (buronson): B30's seats 111-115 from rows 38-41 to 47, B34's 181-183 at rows 39-45
#    ("記者席横"), so the press seats stand between them: behind B31-B33, from about row 38 to the back.
#  - THE 3rd PLATINUM BOX, as built (Travel Watch 2023, https://www.watch.impress.co.jp/docs/news/1465255.html, its
#    photographs 04 and 05): the plan of the boxes, against the concourse at the back of five blocks of the 3B stand
#    (the 2023 boxes the two at one end), each block three rows of two boxes, the ordinary rows in front of them; a
#    box an L of white leather sofa, black partitions and tables (Kotobuki: "イスの白いレザー張地と、ダークトーンで
#    仕上げたテーブルや仕切り").
# Assumed: the five blocks are B35-B39 (the plan names none; they are the 3B blocks whose rows the chart leaves out
# at the back), the box rows 47, 45 and 43 (a box with its table two rows deep, the back one against the concourse), two boxes a row, 0.5 m a seat; the
# press seats desks in B31-B33's spare rows, every other row (39, 41, 43, 45, 47), a seat every 0.6 m. The other
# spare treads stay bare. The seats are numbered on from the block's own first number, row by row.
import numpy as np

PRESS = {'B31', 'B32', 'B33'}
PRESS_ROWS = (39, 41, 43, 45, 47)
PRESS_W = 0.60
BOX_ROWS = (47, 45, 43, 41)        # from the back, against the concourse (the fourth only if a row takes one box)
BOX_N, BOX_PER, BOX_W, BOX_GAP = 30, 4, 0.50, 0.30
END = 0.25                      # clear of the aisle at either end of a row


def lay(spare, real):
    """-> seats (n, 2), row ids (n,), yaw (n,), labels [(block, row, seat)], box rows [{block, row, per, kind}]"""
    S, R, Y, LB, rows_out = [], [], [], [], []
    def put(fg, cc, t, i, nm, rr, sn):
        pt = fg.row_point(t, cc)[0]; u = np.array([-fg.f[1], fg.f[0]])
        g = fg.facing(t - float(fg.ref @ u) if fg.w is not None else 0.0, t, True, pt)
        S.append(pt); R.append(i); Y.append(np.arctan2(g[0], g[1])); LB.append((nm, rr, sn))
    def longest(runs): return max(runs, key=lambda q: q[1] - q[0])
    s0 = {nm: min(lo for ivs in real[nm]['rows'].values() for lo, _ in ivs) for nm in spare}
    # the press desks
    for nm in sorted(PRESS & set(spare)):
        n = 0
        for rr, i, runs, fg, cc, home_hi in sorted(spare[nm], key=lambda q: q[0]):
            if rr not in PRESS_ROWS: continue
            a, b = longest(runs); L = b - a - 2 * END; k = int(L // PRESS_W)
            if k < 1: continue
            for q in range(k):
                d = END + (L - k * PRESS_W) / 2 + (q + 0.5) * PRESS_W
                put(fg, cc, b - d if home_hi else a + d, i, nm, rr, s0[nm] + n); n += 1
            rows_out.append({'block': nm, 'row': rr, 'per': 0, 'kind': 'press'})
    # the Platinum Box: row by row from the back, block by block, as many boxes as a row takes, until 30
    boxes = 0
    cand = sorted(((rr, nm, i, runs, fg, cc, home_hi) for nm in set(spare) - PRESS for rr, i, runs, fg, cc, home_hi in spare[nm] if rr in BOX_ROWS), key=lambda q: (-q[0], q[1]))
    nb = {}
    for rr, nm, i, runs, fg, cc, home_hi in cand:
        if boxes >= BOX_N: break
        a, b = longest(runs); L = b - a - 2 * END
        w = BOX_PER * BOX_W
        k = int((L + BOX_GAP) // (w + BOX_GAP)); k = min(k, BOX_N - boxes)
        if k < 1: continue
        tot = k * w + (k - 1) * BOX_GAP; d0 = END + (L - tot) / 2
        n = nb.get(nm, 0)
        for bx in range(k):
            for q in range(BOX_PER):
                d = d0 + bx * (w + BOX_GAP) + (q + 0.5) * BOX_W
                put(fg, cc, b - d if home_hi else a + d, i, nm, rr, s0[nm] + n); n += 1
        nb[nm] = n; boxes += k
        rows_out.append({'block': nm, 'row': rr, 'per': BOX_PER, 'kind': 'platinum'})
    print('3B rear: press seats %d in %s; 3rd Platinum Box %d boxes (%d seats) in %s' % (
        sum(1 for q in LB if q[0] in PRESS), sorted(PRESS & set(spare)), boxes, boxes * BOX_PER, sorted(nb)))
    return np.array(S).reshape(-1, 2), np.array(R, int), np.array(Y), LB, rows_out
