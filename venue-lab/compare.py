# compare.py — side-by-side (or stacked) before/after sheets for the render shots.
# usage: python3 compare.py out.png "label A" a.png "label B" b.png [--stack] [--crop x0,y0,x1,y1]
import sys
from PIL import Image, ImageDraw, ImageFont
args = sys.argv[1:]
stack = '--stack' in args
crop = None
if '--crop' in args:
    i = args.index('--crop'); crop = tuple(float(v) for v in args[i + 1].split(',')); del args[i:i + 2]
args = [a for a in args if a != '--stack']
out, pairs = args[0], list(zip(args[1::2], args[2::2]))
imgs = []
for label, path in pairs:
    im = Image.open(path).convert('RGB')
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    imgs.append((label, im))
w = max(i.size[0] for _, i in imgs); h = max(i.size[1] for _, i in imgs)
pad, bar = 8, 34
W = w if stack else w * len(imgs) + pad * (len(imgs) - 1)
H = (h + bar) * len(imgs) + pad * (len(imgs) - 1) if stack else h + bar
sheet = Image.new('RGB', (W, H), (12, 12, 14))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
except Exception:
    font = ImageFont.load_default()
for k, (label, im) in enumerate(imgs):
    x = 0 if stack else k * (w + pad)
    y = k * (h + bar + pad) if stack else 0
    d.text((x + 10, y + 6), label, fill=(235, 225, 210), font=font)
    sheet.paste(im, (x, y + bar))
sheet.save(out)
print(out, sheet.size)
