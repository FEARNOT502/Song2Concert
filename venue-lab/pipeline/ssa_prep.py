# The SSA generator's input (each level's seats, metres, about the floor's
# centre) recovered from the stands it generated, the official map it was
# first read from not being kept: the seats as placed on their rows.
import json, base64, numpy as np
d = json.load(open('orig/ssa_stands.json'))
S = []
for name in ['200', '300', '400', '500']:
    L = next(l for l in d['levels'] if l['name'] == name)
    a = np.frombuffer(base64.b64decode(L['seats']), dtype='<i2').reshape(-1, 4).astype(float)
    S.append(np.c_[a[:, 0] / 10, a[:, 1] / 10])
    print(name, len(a))
np.save('ssa_real.npy', np.array(S, dtype=object), allow_pickle=True)
