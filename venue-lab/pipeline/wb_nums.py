# Every number printed on Wembley's detailed seating plan, read one by one:
# the plan's numbers are cut out by their colour (the row numbers teal, the
# seat numbers dark grey, the block numbers big and black), grouped into
# words, and each word read on its own (RapidOCR's recogniser only, on a
# clean black-on-white crop). Reading the whole plan at once (wb_ocr.py) runs
# the stacked row numbers together and misses most of them.
#   python3 wb_nums.py  ->  wb/wb_nums.json  [{t, c: [x, y] px, h px, kind: row|seat|block, conf}]
# The plan: seatingplan.net's detailed Wembley plan, 5949 x 4936 (wb_ocr.py).
import json, re, numpy as np, cv2
from rapidocr_onnxruntime import RapidOCR

SRC = 'wb/ref/wembley-stadium-seating-plan-detailed-rows-seat-numbers.webp'
im = cv2.imread(SRC).astype(int)
b, g, r = im[..., 0], im[..., 1], im[..., 2]
# ink: how much of each colour a pixel holds (the crops are read in grey, not cut to black and white: the plan's
# digits are 9 px tall and thin, and a threshold breaks them); the masks find the words
NEUT = (np.abs(g - r) < 25) & (np.abs(b - r) < 25)
LUM = (r + g + b) / 3
INK = {'row': np.clip((g - r - 10) * 4.0, 0, 255), 'seat': np.where(NEUT, np.clip((200 - LUM) * 3.0, 0, 255), 0)}
INK['block'] = INK['seat']
TEAL = cv2.morphologyEx(((g - r > 30) & (b - r > 25)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
DARK = cv2.morphologyEx(((LUM < 175) & NEUT).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8)) > 0
eng = RapidOCR()

def words(mask, hmin, hmax, join):
    """the mask's glyphs (components hmin..hmax px tall) grouped into words: glyphs side by side, overlapping in height,
    less than `join` x their height apart"""
    n, lab, st, cen = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    G = [i for i in range(1, n) if hmin <= st[i, 3] <= hmax and st[i, 2] <= 2.2 * st[i, 3] and st[i, 4] >= 6]
    G.sort(key=lambda i: (st[i, 0]))
    par = {i: i for i in G}
    def root(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    # neighbours: within a band of x
    xs = np.array([st[i, 0] for i in G])
    for a, i in enumerate(G):
        x0, y0, w0, h0 = st[i, :4]
        for k in range(a + 1, len(G)):
            j = G[k]; x1, y1, w1, h1 = st[j, :4]
            if x1 > x0 + w0 + join * max(h0, h1): break
            ov = min(y0 + h0, y1 + h1) - max(y0, y1)
            if ov >= 0.5 * min(h0, h1) and abs(h0 - h1) <= 0.45 * max(h0, h1): par[root(j)] = root(i)
    grp = {}
    for i in G: grp.setdefault(root(i), []).append(i)
    out = []
    for m in grp.values():
        x0 = min(st[i, 0] for i in m); y0 = min(st[i, 1] for i in m)
        x1 = max(st[i, 0] + st[i, 2] for i in m); y1 = max(st[i, 1] + st[i, 3] for i in m)
        out.append((x0, y0, x1, y1, m))
    return out, lab

def crop(lab, box, up, ink):
    x0, y0, x1, y1, m = box
    p = 4
    sub = cv2.dilate(np.isin(lab[y0 - 1:y1 + 1, x0 - 1:x1 + 1], m).astype(np.uint8), np.ones((3, 3), np.uint8))[1:-1, 1:-1] > 0
    img = np.full((y1 - y0 + 2 * p, x1 - x0 + 2 * p), 255, np.uint8)
    img[p:p + y1 - y0, p:p + x1 - x0] = np.where(sub, 255 - ink[y0:y1, x0:x1], 255).astype(np.uint8)
    img = cv2.resize(img, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
    img = cv2.copyMakeBorder(img, 12, 12, 24, 24, cv2.BORDER_CONSTANT, value=255)
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

import unicodedata
def clean(t):
    t = unicodedata.normalize('NFKC', t)
    return re.sub(r'[^0-9]', '', t.replace('O', '0').replace('o', '0').replace('l', '1').replace('I', '1'))

out = []
for kind, mask, hmin, hmax, join, up in (('row', TEAL, 6, 16, 0.5, 4), ('seat', DARK, 6, 16, 0.45, 4), ('block', DARK, 28, 60, 0.4, 1.5)):
    ws, lab = words(mask, hmin, hmax, join)
    print(kind, 'words', len(ws), flush=True)
    for k0 in range(0, len(ws), 256):
        part = ws[k0:k0 + 256]
        res = eng.text_recognizer([crop(lab, wd, up, INK[kind]) for wd in part])
        res = res[0] if isinstance(res, tuple) else res
        for wd, (t, c) in zip(part, res):
            x0, y0, x1, y1, _ = wd
            out.append(dict(t=clean(t), raw=t, c=[round((x0 + x1) / 2, 1), round((y0 + y1) / 2, 1)], box=[int(x0), int(y0), int(x1), int(y1)],
                            h=int(y1 - y0), kind=kind, conf=round(float(c), 3)))
json.dump(out, open('wb/wb_nums.json', 'w'))
import collections
print(collections.Counter(o['kind'] for o in out), 'unread', sum(1 for o in out if not o['t']))
