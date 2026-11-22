"""Sections and plans of the DAE ring triangles.

usage: python -I gym_dae_views.py ring.npz outdir section:DEG[:HALF] ... plan:DEG:R0:R1:Y0:Y1 ...
section: triangles whose centroid lies within HALF metres (across) of the
radial line at DEG, drawn in (r, y).
plan: triangles between heights Y0..Y1 within +-8 m of the radial line at
DEG and radii R0..R1, drawn from above in (along, across), coloured by height.
"""
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
import numpy as np

RAD = np.pi / 180


def frame(t, deg):
    # radial unit u and tangent w for the app's gymPoint convention
    u = np.array([np.sin(deg * RAD), -np.cos(deg * RAD)])
    w = np.array([np.cos(deg * RAD), np.sin(deg * RAD)])
    xz = t[..., [0, 2]]
    return xz @ u, xz @ w, t[..., 1]


def main(npz, out, *views):
    t = np.load(npz)['tris']
    for v in views:
        kind, *a = v.split(':')
        if kind == 'section':
            deg, half = float(a[0]), float(a[1]) if len(a) > 1 else .4
            along, across, y = frame(t, deg)
            keep = (np.abs(across.mean(1)) < half) & (along.mean(1) > 40)
            polys = np.stack([along[keep], y[keep]], -1)
            fig, ax = plt.subplots(figsize=(16, 7))
            ax.add_collection(PolyCollection(polys, facecolors='none', edgecolors='k', linewidths=.3))
            ax.set_xlim(42, 68); ax.set_ylim(0, 18); ax.set_aspect('equal'); ax.grid(True, lw=.3)
            ax.set_title(f'section at {deg} deg (+-{half} m)')
            fig.savefig(f'{out}/section_{deg}_{half}.png', dpi=110, bbox_inches='tight')
        else:
            deg, r0, r1, y0, y1 = map(float, a)
            along, across, y = frame(t, deg)
            cy = y.mean(1)
            keep = (cy > y0) & (cy < y1) & (np.abs(across.mean(1)) < 8) & (along.mean(1) > r0) & (along.mean(1) < r1)
            polys = np.stack([across[keep], along[keep]], -1)
            fig, ax = plt.subplots(figsize=(10, 12))
            pc = PolyCollection(polys, array=cy[keep], cmap='viridis', edgecolors='k', linewidths=.1)
            ax.add_collection(pc); fig.colorbar(pc, ax=ax, shrink=.6)
            ax.set_xlim(-8, 8); ax.set_ylim(r0, r1); ax.set_aspect('equal'); ax.grid(True, lw=.3)
            ax.set_title(f'plan at {deg} deg, y {y0}-{y1}')
            fig.savefig(f'{out}/plan_{deg}_{y0}_{y1}.png', dpi=100, bbox_inches='tight')
        plt.close('all')


if __name__ == '__main__':
    main(*sys.argv[1:])
