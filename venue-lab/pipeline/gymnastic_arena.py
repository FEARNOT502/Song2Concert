"""Extract a lightweight seat survey from the operator's COLLADA and EPS.

Usage: python gymnastic_arena.py kspodome_dae.zip chart-eps.pdf OUTPUT
Convert the operator's EPS to PDF with Ghostscript -dEPSCrop -sDEVICE=pdfwrite.
Numbered positions in the exported grid are estimates, pending a ticket ledger.
Requires numpy, lxml and PyMuPDF.
"""

import argparse
import base64
from bisect import bisect_right
from collections import defaultdict
import json
import re
from zipfile import ZipFile

import fitz
from lxml import etree
import numpy as np


# Survey registration against the two rings of the official seat chart.
ORIGIN = np.array([105.44, 71.935, 0])
CHART_CENTER = np.array([388.73, 422.79])
CHART_POINTS_PER_METRE = 5.9865
CHART_ROTATION = .0033
METRES_PER_INCH = .0254
NS = '{http://www.collada.org/2005/11/COLLADASchema}'
# Local geometry dimensions of a lower seat shell, narrow lower back, regular
# upper seat and alternate upper seat, respectively.
CHAIRS = {(430, 0, 430): 'lower', (0, 341, 390): 'lowerSide', (500, 450, 441): 'upper', (525, 455, 503): 'upperAlt'}
# Upper treads and their overlapping concourse. Geometry IDs are from the
# operator's 2023-01-17 SketchUp export.
SURFACES = {'ID8778', 'ID8792', 'ID152209', 'ID152222'}


def scan_model(zip_path):
    transforms = []
    geometry_owners = {}
    seats = defaultdict(list)
    surfaces = []
    tags = tuple(NS + name for name in ('node', 'matrix', 'instance_geometry', 'geometry'))
    with ZipFile(zip_path) as archive:
        dae = next(name for name in archive.namelist() if name.endswith('.dae'))
        with archive.open(dae) as source:
            for event, element in etree.iterparse(source, events=('start', 'end'), tag=tags, huge_tree=True):
                tag = element.tag.removeprefix(NS)
                if event == 'start':
                    if tag == 'node':
                        transforms.append(transforms[-1].copy() if transforms else np.eye(4))
                    continue
                if tag == 'matrix':
                    transforms[-1] = transforms[-1] @ np.fromstring(element.text, sep=' ').reshape(4, 4)
                elif tag == 'instance_geometry':
                    geometry_owners[element.get('url')[1:]] = transforms[-1]
                elif tag == 'node':
                    transforms.pop()
                else:
                    geom_id = element.get('id')
                    mesh = element.find(NS + 'mesh')
                    vertices = mesh.find(NS + 'vertices').find(NS + 'input').get('source')[1:]
                    xyz = next(s for s in mesh.findall(NS + 'source') if s.get('id') == vertices).find(NS + 'float_array')
                    local = np.fromstring(xyz.text, sep=' ').reshape(-1, 3)
                    low, high = local.min(0), local.max(0)
                    kind = CHAIRS.get(tuple(np.rint((high - low) * METRES_PER_INCH * 1000).astype(int)))
                    if kind or geom_id in SURFACES:
                        transform = geometry_owners[geom_id]
                        world = lambda pts: (pts @ transform[:3, :3].T + transform[:3, 3]) * METRES_PER_INCH - ORIGIN
                        if kind:
                            seats[kind].append(world((low + high) / 2))
                        if geom_id in SURFACES:
                            for tris in mesh.findall(NS + 'triangles'):
                                inputs = tris.findall(NS + 'input')
                                stride = max(int(node.get('offset')) for node in inputs) + 1
                                index = next(int(node.get('offset')) for node in inputs if node.get('semantic') == 'VERTEX')
                                order = np.fromstring(tris.find(NS + 'p').text, dtype=int, sep=' ').reshape(-1, stride)
                                points = world(local[order[:, index]])
                                # Z-up source to X-right/Y-up/Z-away. Reverse winding.
                                surfaces.extend(points.reshape(-1, 3, 3)[:, [0, 2, 1], :][:, :, [0, 2, 1]].reshape(-1, 3))
                element.clear()
                while element.getprevious() is not None:
                    del element.getparent()[0]
    return seats, np.asarray(surfaces)


def chart_sections(pdf_path):
    with fitz.open(pdf_path) as doc:
        centers = {}
        for block in doc[0].get_text('dict')['blocks']:
            for line in block.get('lines', []):
                label = ''.join(span['text'] for span in line['spans']).replace(' ', '')
                match = re.fullmatch(r'(\d+)구역\d*', label)
                if match:
                    left, top, right, bottom = line['bbox']
                    u, v = np.array([(left + right) / 2, (top + bottom) / 2]) - CHART_CENTER
                    centers[int(match[1])] = np.arctan2(-v, -u)
        lines = [[], []]
        for path in doc[0].get_drawings():
            color = path.get('color')
            if not color or tuple(round(v, 2) for v in color) != (.65, .36, .64):
                continue
            for item in path['items']:
                if item[0] != 'l' or item[2].distance_to(item[1]) < 22:
                    continue
                coords = np.array([tuple(item[1]), tuple(item[2])]) - CHART_CENTER
                radius = np.linalg.norm(coords, axis=1) / CHART_POINTS_PER_METRE
                angles = np.arctan2(-coords[:, 1], -coords[:, 0]) % (2 * np.pi)
                if abs(np.angle(np.exp(1j * (angles[0] - angles[1])))) > .125:
                    continue
                lines[int(radius.min() >= 44.5)].append((radius, angles))
    if set(centers) != set(range(1, 53)):
        raise ValueError('Seat chart does not contain all 52 section landmarks')
    def partition(sections, boundary_lines):
        points = sorted((centers[n] % (2 * np.pi), n) for n in sections)
        crossings = []
        for (start, n), (end, _) in zip(points, points[1:] + [(points[0][0] + 2 * np.pi, points[0][1])]):
            midpoint = (start + end) / 2
            matched = []
            for radii, ang in boundary_lines:
                center = np.angle(np.exp(1j * ang).mean())
                shifted_center = midpoint + np.angle(np.exp(1j * (center - midpoint)))
                shifted = shifted_center + np.angle(np.exp(1j * (ang - center)))
                if not (start < shifted_center < end):
                    continue
                order = np.argsort(radii)
                matched.append((radii[order], shifted[order]))
            crossings.append((n, midpoint, matched))
        return crossings

    bounds = [partition(range(1, 23), lines[0]), partition(range(23, 53), lines[1])]
    return centers, bounds


def section_lookup(partition, radius, angle):
    edge = []
    for n, midpoint, lines in partition:
        if lines:
            radii, angles = min(lines, key=lambda pair: max(pair[0][0] - radius, radius - pair[0][1], 0))
            midpoint = np.interp(radius, radii, angles)
        edge.append((midpoint, n))
    index = bisect_right(edge, (angle, 0)) % len(edge)
    return edge[index][1]


def make_grid(raw, sections, partitions):
    seats = defaultdict(list)
    for kind, points in raw.items():
        lower = kind.startswith('lower')
        for x, z, h in points:
            angle = (np.arctan2(x, -z) + CHART_ROTATION) % (2 * np.pi)
            section = section_lookup(partitions[int(not lower)], np.hypot(x, z), angle)
            if lower:
                sample = .812 if kind == 'lower' else .838
                physical_row = round((h - sample) / .20) + 1
                # There is a tread-width circulation aisle between rows 11 and 12.
                if physical_row <= 12:
                    continue
                row = physical_row - 1
                y = .4 + .2 * (physical_row - 1)
            else:
                y = h - (.52 if kind == 'upperAlt' else .56)
                row = 0
            seats[section].append((x, y, z, row))
    packed = []
    for section, positions in sorted(seats.items()):
        if section >= 23:
            # Determine the local order of rows by increasing tread elevation.
            # Keep adjacent runs of the same tread together across short gaps.
            sorted_points = sorted(positions, key=lambda pt: pt[1])
            last_y = -1
            positions = []
            row = 0
            for x, y, z, _ in sorted_points:
                if y - last_y > .12:
                    row += 1
                last_y = y
                positions.append((x, y, z, row))
        for row in sorted({pt[3] for pt in positions}):
            points = [pt for pt in positions if pt[3] == row]
            angle = sections[section]
            tangent = np.array([np.cos(angle), np.sin(angle)])
            for num, (x, y, z, _) in enumerate(sorted(points, key=lambda pt: np.dot(tangent, [pt[0], pt[2]])), 1):
                packed.append([round(x * 100), round(y * 100), round(z * 100), section, row, num])
    return packed


def encoded(values):
    return base64.b64encode(np.asarray(values, dtype='<i2').tobytes()).decode('ascii')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ('dae_zip', 'seat_chart_pdf', 'output'):
        parser.add_argument(arg)
    args = parser.parse_args()
    raw, surfaces = scan_model(args.dae_zip)
    if not len(surfaces):
        raise ValueError('No upper stand geometry in source')
    sections, boundaries = chart_sections(args.seat_chart_pdf)
    grid = make_grid(raw, sections, boundaries)
    with open(args.output, 'w', encoding='utf8') as out:
        out.write('// Generated by venue-lab/pipeline/gymnastic_arena.py. Positions in centimetres.\n')
        out.write(f'export const GYM_SEATS = {json.dumps(encoded(grid))};\n')
        out.write(f'export const GYM_UPPER = {json.dumps(encoded(np.rint(surfaces * 100)))};\n')
        out.write(f'export const GYM_SECTION_ANGLES = {json.dumps([round(sections[n], 5) for n in range(1, 53)])};\n')
    print(f'{len(grid)} surveyed positions, {len(surfaces) // 3} upper stand triangles')


if __name__ == '__main__':
    main()
