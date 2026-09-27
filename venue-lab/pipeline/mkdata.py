# ref/<x>_stands.json -> dev/src/<x>-data.js, keeping the file's header comment
import sys, json
MAP = {'ssa': ('pipeline/ssa_stands.json', 'src/i0-ssa-data.js', 'SSA_STANDS'),
       'td': ('pipeline/td_stands.json', 'src/j0-td-data.js', 'TD_STANDS'),
       'wb': ('pipeline/wb_stands.json', 'src/k0-wb-data.js', 'WB_STANDS'),
       'lotte': ('pipeline/lotte_stands.json', 'src/g0-lotte-data.js', 'LOTTE_STANDS'),
       'insp': ('pipeline/insp_stands.json', 'src/n0-insp-data.js', 'INSP_STANDS'),
       'kspo': ('pipeline/kspo_stands.json', 'src/o0-kspo-data.js', 'KSPO_STANDS')}
for k in sys.argv[1:]:
    src, dst, name = MAP[k]
    head = []
    import os
    if not os.path.exists(dst):
        open(dst, 'w').write('// Inspire Arena: the stands as generated from the seating plan (see\n// d3-stands.js). Metres, centred on the floor, -z towards the stage end.\n')
    for line in open(dst):
        if line.startswith('//'): head.append(line)
        else: break
    body = json.dumps(json.load(open(src)), separators=(',', ':'))
    assert "'" not in body and '\\' not in body
    N = 4000
    parts = [body[i:i + N] for i in range(0, len(body), N)]
    js = ''.join(head) + f"const {name} = JSON.parse([\n" + ",\n".join("  '%s'" % p for p in parts) + "\n].join(''));\n"
    open(dst, 'w').write(js)
    print(dst, len(js) // 1024, 'KB', len(parts), 'lines')
