"""The official seat-number rules (seat_list.js, arena mode) decoded seat by
seat: for every map block, its rows and each row's seat numbers.

The rules run round each level by seat number: each key of `separate` closes a
run of numbers (the run is the numbers after the previous key up to it); within
a run, `block` gives, for the rows up to each key (rows counted from 1 at the
front; the '100' level, the telescopic rows, by letter A-L), the map block they
belong to ('none': no seats there), and `not_need` the numbers a row leaves out.
-> {block id: {'level', 'rows': {row: [numbers]}}} (row: int, or a letter)"""
import collections
from ssa_chart import read_rules

LETTERS = 'ABCDEFGHIJKL'


def decode(rules, mode='arena'):
    out = {}
    for lv in ('100', '200', '300', '400', '500'):
        alpha = lv == '100'
        sep = rules[mode][lv]['separate']; prev = 0
        for bp in sorted(int(k) for k in sep):
            rule = sep[str(bp)]
            nn = {str(r): set(v) for r, v in rule.get('not_need', {}).items()}
            cur = 0; assign = {}
            for k, idv in rule.get('block', {}).items():
                if alpha:
                    if k not in LETTERS: continue
                    ub = LETTERS.index(k)
                    for i in range(cur, ub + 1): assign[LETTERS[i]] = idv
                    cur = ub + 1
                else:
                    ub = int(k)
                    for r in range(cur + 1, ub + 1): assign[str(r)] = idv
                    cur = ub
            for r, idv in assign.items():
                if idv == 'none': continue
                nums = [s for s in range(prev + 1, bp + 1) if s not in nn.get(r, set())]
                if not nums: continue
                b = out.setdefault(int(idv), {'level': '200' if alpha else lv, 'lettered': alpha, 'rows': collections.defaultdict(list)})
                b['rows'][r if alpha else int(r)] += nums
            prev = bp
    for b in out.values():
        b['rows'] = {r: sorted(v) for r, v in b['rows'].items()}
    return out


if __name__ == '__main__':
    import os, json
    R = decode(read_rules(os.path.join(os.path.dirname(__file__), 'ssa', 'raw', 'seat_list.js')))
    tot = collections.Counter()
    for b, o in R.items():
        tot['lettered' if o['lettered'] else o['level']] += sum(len(v) for v in o['rows'].values())
    print(len(R), 'blocks', dict(tot), sum(v for k, v in tot.items() if k != 'lettered'))
