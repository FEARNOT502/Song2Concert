# Tokyo Dome: the seat chart (td/td_rows_real.json, a fan's transcription of the block charts) as the stands are
# laid from it, with the few rows the transcription could not read filled in.
#
# The wedges at the poles, A01 and A49, run from row 15 to row 40 in one block (no cross aisle). Their chart prints
# a row label for every row, but no end number at rows 20, 22, 23, 28, 30, 32 and 34, and at row 18 only a stray
# "484" beside the first seat's number (where the other rows print the last number at the row's far end): the
# transcription has 20 = 481 only, 18 = 481-484, and no 22, 23, 28, 30, 32, 34. Those eight rows are taken as
# ordinary rows here, each from 481 to the number halfway between its neighbours' last (FILLED).
#
# The seats the chart leaves out and the stands carry anyway are listed with their evidence where they are laid:
# the 3rd Platinum Box and the press seats behind B30-B39 on the 3B side (td_boxes.py), B22/B28 rows 41-46
# (td_stand1.EXTRA, the official map), the Sky Terrace boxes (D rows 8-9, in the chart).
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
POLE_ROWS = (15, 40)
POLE_FILL = (18, 20, 22, 23, 28, 30, 32, 34)


def _fill_pole(rows):
    have = {int(r): ivs for r, ivs in rows.items() if int(r) not in POLE_FILL}
    out = dict(have); filled = []
    for r in range(POLE_ROWS[0], POLE_ROWS[1] + 1):
        if r in have: continue
        lo = max(q for q in have if q < r); hi = min(q for q in have if q > r)
        a, b = have[lo][-1][1], have[hi][-1][1]
        end = int(a + (b - a) * (r - lo) / (hi - lo) + 0.5)
        out[r] = [[have[lo][0][0], end]]; filled.append(r)
    return {str(r): out[r] for r in sorted(out)}, filled


def load(path=None):
    real = json.load(open(path or os.path.join(HERE, 'td', 'td_rows_real.json')))
    FILLED = {}
    for nm in ('A01', 'A49'):
        real[nm] = dict(real[nm]); real[nm]['rows'], FILLED[nm] = _fill_pole(real[nm]['rows'])
    return real


if __name__ == '__main__':
    r = load()
    for nm in ('A01', 'A49'): print(nm, {k: v for k, v in r[nm]['rows'].items()})
