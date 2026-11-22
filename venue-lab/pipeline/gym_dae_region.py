"""Pull every triangle of the operator's DAE in the bowl's ring (r 40-70 m,
height 0-18 m) into an npz, in the app's frame (x, y up, z), with the
material name of each. Chairs are skipped.

usage: python -I gym_dae_region.py kspodome_dae.zip out.npz
"""
import sys
from zipfile import ZipFile

import numpy as np
from lxml import etree

ORIGIN = np.array([105.44, 71.935, 0])
M = .0254
NS = '{http://www.collada.org/2005/11/COLLADASchema}'
CHAIRS = {(430, 0, 430), (0, 341, 390), (500, 450, 441), (525, 455, 503)}


def main(zip_path, out):
    transforms, owners, tris, mats = [], {}, [], []
    tags = tuple(NS + n for n in ('node', 'matrix', 'instance_geometry', 'geometry'))
    with ZipFile(zip_path) as archive:
        dae = next(n for n in archive.namelist() if n.endswith('.dae'))
        with archive.open(dae) as src:
            for event, el in etree.iterparse(src, events=('start', 'end'), tag=tags, huge_tree=True):
                tag = el.tag.removeprefix(NS)
                if event == 'start':
                    if tag == 'node':
                        transforms.append(transforms[-1].copy() if transforms else np.eye(4))
                    continue
                if tag == 'matrix':
                    transforms[-1] = transforms[-1] @ np.fromstring(el.text, sep=' ').reshape(4, 4)
                elif tag == 'instance_geometry':
                    owners.setdefault(el.get('url')[1:], []).append(transforms[-1])
                    continue
                elif tag == 'node':
                    transforms.pop()
                else:
                    gid = el.get('id')
                    mesh = el.find(NS + 'mesh')
                    if mesh is not None and gid in owners:
                        vid = mesh.find(NS + 'vertices').find(NS + 'input').get('source')[1:]
                        arr = next(s for s in mesh.findall(NS + 'source') if s.get('id') == vid).find(NS + 'float_array')
                        local = np.fromstring(arr.text, sep=' ').reshape(-1, 3)
                        dims = tuple(np.rint((local.max(0) - local.min(0)) * M * 1000).astype(int))
                        if dims not in CHAIRS:
                            for T in owners[gid]:
                                world = (local @ T[:3, :3].T + T[:3, 3]) * M - ORIGIN
                                xz = np.hypot(world[:, 0], world[:, 1])
                                if xz.max() < 40 or xz.min() > 70 or world[:, 2].min() > 18:
                                    continue
                                for t in mesh.findall(NS + 'triangles'):
                                    inputs = t.findall(NS + 'input')
                                    stride = max(int(i.get('offset')) for i in inputs) + 1
                                    vi = next(int(i.get('offset')) for i in inputs if i.get('semantic') == 'VERTEX')
                                    p = t.find(NS + 'p')
                                    if p is None:
                                        continue
                                    order = np.fromstring(p.text, dtype=int, sep=' ').reshape(-1, stride)[:, vi]
                                    pts = world[order].reshape(-1, 3, 3)
                                    c = pts.mean(1)
                                    r = np.hypot(c[:, 0], c[:, 1])
                                    keep = (r > 40) & (r < 70) & (c[:, 2] > -1) & (c[:, 2] < 18)
                                    if keep.any():
                                        # Z-up source to x, y up, z
                                        tris.append(pts[keep][:, :, [0, 2, 1]].astype(np.float32))
                                        mats.extend([t.get('material') or ''] * int(keep.sum()))
                el.clear()
                while el.getprevious() is not None:
                    del el.getparent()[0]
    tris = np.concatenate(tris)
    np.savez_compressed(out, tris=tris, mats=np.array(mats))
    print(len(tris), 'triangles')


if __name__ == '__main__':
    main(*sys.argv[1:])
