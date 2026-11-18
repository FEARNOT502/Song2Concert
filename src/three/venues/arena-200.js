import { ARENA_LOUNGE } from './arena-interior.js';
import WALL_PLAN from '../../../venue-lab/pipeline/ssa-200-wall-plan.json' with { type: 'json' };

// The level-200 bowl face follows the back of the seating, with returns at
// its end gates. The concourse is one storey below the top of the long stands.
const CORNER_GATES = [212, 219, 232, 239];
const FLOOR = 6.2;
const SILL_BASE = 6.05;
const WALL = 0.3;

function doorAxes(frame) {
  const ux = Math.sin(frame.yaw), uz = Math.cos(frame.yaw);
  const x = frame.x - ux * WALL / 2, z = frame.z - uz * WALL / 2;
  return {
    ux, uz,
    at: (s, t = 0) => [x + uz * s + ux * t, z - ux * s + uz * t],
    local: (px, pz) => [(px - x) * uz - (pz - z) * ux, (px - x) * ux + (pz - z) * uz],
  };
}

function removeWallSpan(wall, local, bounds) {
  const [x, z, xx, zz, ...heights] = wall;
  const a = local(x, z), b = local(xx, zz);
  let start = 0, end = 1;
  for (let i = 0; i < 2; i++) {
    const [min, max] = bounds[i], delta = b[i] - a[i];
    if (Math.abs(delta) < 0.00001) {
      if (a[i] < min || a[i] > max) return [wall];
      continue;
    }
    const first = (min - a[i]) / delta, last = (max - a[i]) / delta;
    start = Math.max(start, Math.min(first, last));
    end = Math.min(end, Math.max(first, last));
  }
  if (end <= start) return [wall];
  const at = (f) => [x + (xx - x) * f, z + (zz - z) * f];
  return [[0, start], [end, 1]].filter(([a, b]) => (b - a) * Math.hypot(xx - x, zz - z) > 0.02)
    .map(([a, b]) => [...at(a), ...at(b), ...heights]);
}

export function fitArena200(data) {
  const corners = new Set(CORNER_GATES);
  const concourseCeiling = data.rooms.ceils.find((ceiling) => ceiling.y === 10.2).y;
  const frames = data.frames.map((f) => corners.has(+f.label) ? { ...f, h: concourseCeiling - f.y } : f);
  const gates = new Map(frames.filter((f) => +f.label < 300).map((f) => [+f.label, f]));
  const axes = new Map([...gates].map(([id, frame]) => [id, doorAxes(frame)]));
  const rim = [];
  const slabUnder = (y) => data.floors.find((floor) => floor.y === y).y0;
  const endHead = slabUnder(11.44) + 0.02;
  const cornerHead = slabUnder(16.2) + 0.02;
  const panel = (a, b, loA = a[2], loB = b[2]) => {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.001) return;
    rim.push([a[0], a[1], b[0], b[1], loA, a[3], loB, b[3], WALL, 'front']);
  };
  const cheek = (id, sign) => [...axes.get(id).at(sign * 1.6), SILL_BASE, cornerHead];
  const jamb = (id, sign) => {
    const f = gates.get(id);
    return [...axes.get(id).at(sign * (f.w / 2 + 0.15)), SILL_BASE, corners.has(id) ? cornerHead : endHead];
  };
  // The 300-level slab ends partway along each splay. Continue up to the
  // 400-level slab where the 300-level balcony ends.
  for (const path of WALL_PLAN.ends) {
    let last;
    for (const point of path) {
      const isGate = typeof point === 'number';
      const a = isGate ? jamb(point, 1) : [point[0], point[1], SILL_BASE, point[2] === 'corner' ? cornerHead : endHead];
      const shoulder = corners.has(point) ? cheek(point, 1) : a;
      if (last) panel(last, shoulder);
      panel(shoulder, a);
      last = a;
      if (!isGate) continue;
      const b = jamb(point, -1), f = gates.get(point);
      panel(a, b, f.y + f.h + 0.18, f.y + f.h + 0.18);
      last = b;
      if (corners.has(point)) {
        last = cheek(point, -1);
        panel(b, last);
      }
    }
  }
  const { suites } = data;
  const suiteEnd = suites.boxes.at(-1)[1], loungeEnd = ARENA_LOUNGE.half;
  const wing = (id) => WALL_PLAN.wings[id].map((point) => [...point, cornerHead]);
  const east = [cheek(232, -1), ...wing(232),
    [53.75, -37.6, 10.4, cornerHead], [53.75, -loungeEnd, 10.4, cornerHead], [53.75, -loungeEnd, 10.4, 11.02],
    [53.75, loungeEnd, 10.4, 11.02], [53.75, loungeEnd, 10.4, cornerHead], [53.75, 37.6, 10.4, cornerHead],
    ...wing(239), cheek(239, 1)];
  const west = [cheek(212, -1), ...wing(212),
    [-53.75, 37.6, 10.36, cornerHead], [-53.75, suiteEnd, 10.36, cornerHead], [-53.75, suiteEnd, 10.36, 10.72],
    [-53.75, 25.55, 10.36, 10.72], [-49.38, 24.4, 8.8, 10.62], [-49.38, -24.4, 8.8, 10.62],
    [-53.75, -25.55, 10.36, 10.72], [-53.75, -suiteEnd, 10.36, 10.72], [-53.75, -suiteEnd, 10.36, cornerHead],
    [-53.75, -37.6, 10.36, cornerHead], ...wing(219), cheek(219, 1)];
  for (const path of [east, west]) {
    for (let i = 1; i < path.length; i++) panel(path[i - 1], path[i]);
  }
  // Clear the old 2F walls and ceiling risers from the new splayed faces.
  const endCuts = rim.filter((r) => Math.min(Math.abs(r[1]), Math.abs(r[3])) > 40).map(([x, z, xx, zz]) => {
    const len = Math.hypot(xx - x, zz - z);
    const dx = (xx - x) / len, dz = (zz - z) / len;
    return { local: (px, pz) => [(px - x) * dx + (pz - z) * dz, (px - x) * dz - (pz - z) * dx],
      bounds: [[-0.07, len + 0.07], [-2.0, 0.48]] };
  });

  // The 3F facades form part of the enclosure. Close over their ceilings and
  // return to their ends above the 200 wall, leaving the glazing in the face.
  const loungeFront = ARENA_LOUNGE.front - 0.1;
  const loungeHead = suites.y + ARENA_LOUNGE.ceiling + ARENA_LOUNGE.cap - 0.02;
  panel([loungeFront, -loungeEnd, loungeHead, cornerHead], [loungeFront, loungeEnd, loungeHead, cornerHead]);
  panel([suites.xf, suiteEnd, suites.yc + 0.48, cornerHead], [suites.xf, -suiteEnd, suites.yc + 0.48, cornerHead]);
  panel([53.75, -loungeEnd, 11, cornerHead], [loungeFront, -loungeEnd, 11, cornerHead]);
  panel([loungeFront, loungeEnd, 11, cornerHead], [53.75, loungeEnd, 11, cornerHead]);
  panel([suites.xf, -suiteEnd, 10.6, cornerHead], [-53.75, -suiteEnd, 10.6, cornerHead]);
  panel([-53.75, suiteEnd, 10.6, cornerHead], [suites.xf, suiteEnd, 10.6, cornerHead]);

  // Strip the traced wall near the new end face, and clear the four existing
  // corner porches so their backing walls cannot cross the new thresholds.
  const cornerCuts = CORNER_GATES.map((id) => ({ local: axes.get(id).local, bounds: [[-2.35, 2.35], [-1.45, 3.5]] }));
  const trimRoomWalls = (walls) => walls.flatMap((wall) => {
    if (wall[4] < FLOOR - 0.1 || wall[5] > 10.28) return [wall];
    return [...endCuts, ...cornerCuts].reduce((pieces, { local, bounds }) =>
      pieces.flatMap((piece) => removeWallSpan(piece, local, bounds)), [wall]);
  });

  const flights = data.flights.slice(), floors = data.floors.slice();
  const walls = trimRoomWalls(data.rooms.walls), lamps = data.rooms.lamps.slice();
  for (const id of CORNER_GATES) {
    const f = gates.get(id), { ux, uz, at } = axes.get(id);
    const i = flights.findIndex((flight) => flight.y0 === FLOOR && Math.abs(flight.y1 - f.y) < 0.02
      && Math.hypot(flight.x + flight.dx * flight.L - f.x, flight.z + flight.dz * flight.L - f.z) < 0.3);
    const flight = flights[i];
    const landingDepth = 0.44, hall = flight.L + landingDepth, half = f.w / 2;
    const [x, z] = at(0, hall);
    const head = f.y + f.h;
    flights[i] = { ...flight, x, z, dx: -ux, dz: -uz, w: f.w, sideWalls: false };
    const rect = (s0, s1, t0, t1) => [[[at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)]]];
    // The solid threshold overlaps the top tread slightly. The landing at
    // the foot stays level with the 2F concourse across the entire opening.
    floors.push({ y: f.y, y0: f.y - 0.24, polys: rect(-half - 0.16, half + 0.16, -0.53, landingDepth + 0.02) });
    floors.push({ y: FLOOR - 0.006, y0: FLOOR - 0.22, polys: rect(-half, half, landingDepth, hall + 0.55) });
    const outer = half + WALL;
    walls.push([...at(-outer, hall + 0.05), ...at(-outer, 0.31), FLOOR - 0.04, head + 0.12]);
    walls.push([...at(outer, 0.31), ...at(outer, hall + 0.05), FLOOR - 0.04, head + 0.12]);
    const [lx, lz] = at(0, (hall + 0.31) / 2);
    lamps.push([lx, head - 0.035, lz, f.yaw - Math.PI / 2]);
  }

  // Close the gap behind the long-side walls at the suite and lounge floors.
  const slab = (ring, y) => ({ y, y0: y - 0.18, polys: [[ring]] });
  floors.push(slab([[suites.xf, -suiteEnd], [-53.75, -suiteEnd], [-53.75, -25.55], [-49.38, -24.4],
    [-49.38, 24.4], [-53.75, 25.55], [-53.75, suiteEnd], [suites.xf, suiteEnd]], 10.6));
  floors.push(slab([[53.75, -loungeEnd], [ARENA_LOUNGE.front, -loungeEnd],
    [ARENA_LOUNGE.front, loungeEnd], [53.75, loungeEnd]], 11));

  const [level, ...levels] = data.levels;
  return {
    ...data, floors, flights, frames,
    levels: [{ ...level, walls: [], slopeWalls: [...level.slopeWalls, ...rim] }, ...levels],
    rooms: { ...data.rooms, walls, lamps, ceilingWalls: trimRoomWalls(data.rooms.ceilingWalls) },
  };
}
