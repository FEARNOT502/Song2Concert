# What the seating plan draws, read off it into the stand's own frame, for
# wb_reseat.py: per level, where its aisles are (the pale cyan strips across
# the rows and their white edges), where a row's line is drawn, and where
# lettering (block, row and seat numbers, the watermark) is printed over the
# rows. The plan is seatingplan.net's detailed Wembley plan (5949 x 4936);
# each level is drawn to its own scale about the pitch's centre, fitted to the
# plan's seats in wb/wb_seats.pkl.
#   python3 wb_plan.py <plan.png>  ->  wb/wb_plan.png
# (16-bit: bits 3k, 3k+1, 3k+2 the aisle, line and lettering of level k,
# L1, L2, L5; x north and z east on the generator's 0.1 m grid)
import sys, pickle, numpy as np, cv2
sys.path.insert(0, '.')
from standlib import Grid
G = Grid(-150, 150, -162, 162, 0.1)
# each level's scale (px/m), the pitch centre's pixel, a stretch (east-west
# over north-south) and a turn: fitted so that the plan's rows' lines fall
# on the fronts of the stand's rows
TF = {'L1': (14.98843, 2974.25893, 2467.93265, 0.00065, 0.00004), 'L2': (17.74268, 2974.83624, 2468.15489, 0.00015, -0.00015), 'L5': (18.73929, 2974.41226, 2476.50883, -0.00041, -0.00043)}

im = cv2.imread(sys.argv[1]).astype(np.int16)
b, g, r = im[..., 0], im[..., 1], im[..., 2]
mn = np.minimum(np.minimum(r, g), b)
lum = cv2.cvtColor(im.astype(np.uint8), cv2.COLOR_BGR2GRAY)
# a row's line: thin and a little darker than the block's grey
bh = cv2.morphologyEx(lum, cv2.MORPH_BLACKHAT, np.ones((7, 7), np.uint8))
aisle = ((g - r >= 12) & (g >= 225) & (b - g <= 8)) | (mn >= 240)
mark = (b - g >= 5) & (g - r >= 6) & ~aisle                  # the watermark's blue
text = ((mn < 140) & ~aisle & ~mark) | mark
line = (bh >= 6) & (lum <= 216) & ~aisle & ~(mn < 140)
o = pickle.load(open('wb/wb_seats.pkl', 'rb'))
gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
out = np.zeros((G.H, G.W), np.uint16)
for k, name in enumerate(('L1', 'L2', 'L5')):
    s, cx, cy, k_, rot = TF[name]
    A_, B_ = Z / (1 + k_), -X / (1 - k_)
    ix = np.clip(np.round(cx + s * (A_ * np.cos(rot) + B_ * np.sin(rot))).astype(int), 0, im.shape[1] - 1)
    iy = np.clip(np.round(cy + s * (-A_ * np.sin(rot) + B_ * np.cos(rot))).astype(int), 0, im.shape[0] - 1)
    # only over the level's blocks (and a little round them)
    near = G.empty()
    for P in o[name]['foot']:
        q = np.c_[-P[:, 1], P[:, 0]]; fx, fz = G.g(q[:, 0], q[:, 1])
        cv2.fillPoly(near, [np.c_[fx, fz].round().astype(np.int32)], 1)
    near = cv2.dilate(near, np.ones((11, 11), np.uint8)) > 0
    for bit, m in enumerate((aisle, line, text)):
        out |= (m[iy, ix] & near).astype(np.uint16) << (3 * k + bit)
cv2.imwrite('wb/wb_plan.png', out, [cv2.IMWRITE_PNG_COMPRESSION, 9])
print('wb/wb_plan.png', [int(((out >> i) & 1).sum()) for i in range(9)])
