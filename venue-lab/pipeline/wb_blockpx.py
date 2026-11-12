# Wembley's blocks on the detailed seating plan, as regions of its pixels:
# the plan draws each block as a pale grey shape with a white border, on a
# pale cyan ground; each is grown (a watershed over the plan) from its number
# (wb_nums.py's block words), so a block's region is the grey shape round it.
#   python3 wb_blockpx.py  ->  wb/wb_blockpx.png (uint8: 0 none, k+1 block k), wb/wb_blockpx.json ({names: [...]})
# The plan: wb/ref/wembley-stadium-seating-plan-detailed-rows-seat-numbers.webp (see wb_nums.py).
import json, numpy as np, cv2

im = cv2.imread('wb/ref/wembley-stadium-seating-plan-detailed-rows-seat-numbers.webp')
b, g, r = [im[..., i].astype(int) for i in range(3)]
ground = (g - r > 18) & (g > 225)                    # the pale cyan round the blocks
# the blocks' borders, and the dotted lines across Level 1's walkway with them (anti-aliased: a pixel wider)
white = cv2.dilate((np.minimum(np.minimum(r, g), b) >= 234).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
fill = ~ground & ~white
fill = cv2.morphologyEx(fill.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
words = [w for w in json.load(open('wb/wb_nums.json')) if w['kind'] == 'block' and len(w['t']) == 3 and w['t'][0] in '125']
names = sorted({w['t'] for w in words})
markers = np.zeros(im.shape[:2], np.int32)
for w in words:
    x0, y0, x1, y1 = w['box']; k = names.index(w['t']) + 1
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    markers[cy - 6:cy + 7, cx - 12:cx + 13] = k
# each block's number grown out over the grey, never across the ground or a
# border (where two meet with no border between, the nearer number's)
lab = markers.astype(np.uint8); F = fill.astype(bool)
for it in range(400):
    grown = cv2.dilate(lab, np.ones((5, 5), np.uint8))
    new = (lab == 0) & F & (grown > 0)
    if not new.any(): break
    lab[new] = grown[new]
print('grown in', it, 'steps')
# (what that leaves, Level 1's rows below its walkway cut off by the dotted
# lines, is left unnamed here: wb_labels.py names those seats by the block
# of the seats straight up the rake from them, past the walkway)
cv2.imwrite('wb/wb_blockpx.png', lab, [cv2.IMWRITE_PNG_COMPRESSION, 9])
json.dump({'names': names, 'size': list(im.shape[:2])}, open('wb/wb_blockpx.json', 'w'))
area = np.bincount(lab.ravel(), minlength=len(names) + 1)[1:]
print('blocks', len(names), 'area px min/median/max', area.min(), int(np.median(area)), area.max())
print('smallest', [(names[i], int(area[i])) for i in np.argsort(area)[:6]])
# a picture to check by eye
rng = np.random.default_rng(3); col = rng.integers(60, 255, (len(names) + 1, 3)).astype(np.uint8); col[0] = 255
cv2.imwrite('/tmp/wb_blockpx_check.png', cv2.resize(col[lab], None, fx=0.25, fy=0.25, interpolation=cv2.INTER_NEAREST))
