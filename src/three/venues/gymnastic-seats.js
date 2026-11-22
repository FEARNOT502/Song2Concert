import { decodeSeats } from '../stands.js';
import { floorBlocks } from '../show.js';
import { GYM_AISLE_R, GYM_CENTER_R, GYM_CONSOLE_DECK, GYM_FIRST_ROW, GYM_FLOOR_R, GYM_FOH, GYM_STANDING, gymPoint, gymRing, gymSector, gymStagePlan } from '../gymnastic-arena-plan.js';
import { GYM_SEATS, GYM_SECTION_ANGLES } from './gymnastic-data.js';

const packed = decodeSeats(GYM_SEATS);
const stands = [];
for (let i = 0; i < packed.length; i += 6) {
  const [xp, yp, zp, n, row, num] = packed.subarray(i, i + 6);
  if (n < 23 && row < GYM_FIRST_ROW) continue;
  const x = xp / 100, y = yp / 100, z = zp / 100;
  stands.push({ x, y, z, block: String(n), row, num, level: n < 23 ? '1F' : '2F', yaw: Math.atan2(-x, -z), estimated: true });
}

export const gymMask = (x) => -25.5 + Math.min(10, Math.max(0, Math.abs(x) - 19) * .6);

// Under the 360 console's scaffold (section 19, its rows' radii and its width).
export function underConsole(seat) {
  const { r0, r1, half } = GYM_CONSOLE_DECK;
  const r = Math.hypot(seat.x, seat.z);
  return seat.z < 0 && r > r0 - .35 && r < r1 + .35 && Math.abs(seat.x - GYM_FOH['360'][0]) < half + .3;
}

export function gymOpenSeat(seat, mode) {
  // (360: section 19 is the CONSOLE on DAY6's map, not sold)
  if (mode === '360') return seat.block !== '19';
  return seat.z > gymMask(seat.x) + 1.4;
}

// General: the floor seated round the T, in blocks either side of the runway,
// beside the walkway, and behind it to the floor's back, clear of the pit's
// fences and FOH.
const generalFloor = (() => {
  const plan = gymStagePlan('general');
  const { L } = plan;
  const [fx, , fz] = GYM_FOH.general;
  const box = (ring) => {
    const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  };
  const clear = [...plan.decks.map((d) => [box(d.ring), d.gap + .85]), ...plan.steps.map((st) => [box(st.ring), .9])];
  function keep(x, z) {
    return Math.hypot(x, z) < GYM_FLOOR_R - 2.0 &&
      clear.every(([[x0, x1, z0, z1], pad]) => x < x0 - pad || x > x1 + pad || z < z0 - pad || z > z1 + pad) &&
      (Math.abs(x - fx) > 4.9 || Math.abs(z - fz) > 4.45);
  }
  const F = L.front + L.gap + .9, cz = L.cross - L.thrustGap - .8, bz = L.cross + L.crossD + L.thrustGap + .8;
  const wx = L.wing + L.thrustGap + .8;
  const mirror = (spans) => spans.flatMap(([a, b]) => [[-b, -a], [a, b]]);
  const bands = [
    [F, cz, mirror([[L.runHalf + L.thrustGap + .8, 13.4], [14.6, 29]])],
    [cz + 1.2, bz - .4, mirror([[wx, 30]])],
    [bz, 19.8, mirror([[1.0, 11.6], [12.8, 28]])],
    [21.0, 31.5, mirror([[1.0, 11.6], [12.8, 25]])],
  ];
  const blocks = bands.flatMap(([z0, z1, spans]) => spans.map(([x0, x1]) => ({ x0, x1, z0, z1 })))
    .sort((a, b) => a.z0 - b.z0 || a.x0 - b.x0)
    .map((b, i) => ({ ...b, name: `F${i + 1}` }));
  const positions = [], people = [];
  for (const [index, block] of blocks.entries()) {
    const floor = floorBlocks([block], { keep, seed: 31 + index, occupancy: 1, trim: { rows: 3, cols: 4 } });
    if (!floor.chairs.length) continue;
    people.push(...floor.people);
    const rows = new Map();
    for (const chair of floor.chairs) {
      if (!rows.has(chair.z)) rows.set(chair.z, []);
      rows.get(chair.z).push(chair);
    }
    let row = 0;
    for (const z of [...rows.keys()].sort((a, b) => a - b)) {
      row++;
      rows.get(z).sort((a, b) => a.x - b.x).forEach((chair, i) => positions.push({ ...chair, yaw: chair.turn, block: block.name, level: 'FLOOR', row, num: i + 1 }));
    }
  }
  return { positions, people };
})();

const standingSpots = GYM_STANDING.map(([a, b], i) => {
  const [x, z] = gymPoint((a + b) / 2, 17);
  return { x, y: 0, z, yaw: Math.atan2(-x, -z), block: `S${i + 1}`, row: 1, num: 1, level: 'FLOOR', standing: true };
});

export const gymFloor = (mode) => mode === '360'
  ? { positions: standingSpots, people: [] }
  : generalFloor;

export const gymStands = () => stands;

const catalogs = new Map();
export function getGymnasticSeatCatalog(mode = 'general') {
  mode = mode === '360' ? '360' : 'general';
  if (catalogs.has(mode)) return catalogs.get(mode);
  const seats = [...stands.filter((s) => gymOpenSeat(s, mode)), ...gymFloor(mode).positions];
  const byBlock = new Map(), levelOf = new Map();
  for (const seat of seats) {
    if (!byBlock.has(seat.block)) {
      byBlock.set(seat.block, new Map());
      levelOf.set(seat.block, seat.level);
    }
    const rows = byBlock.get(seat.block);
    if (!rows.has(seat.row)) rows.set(seat.row, new Map());
    rows.get(seat.row).set(seat.num, seat);
  }
  const blocks = [...byBlock.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const cat = {
    seats, blocks, byBlock, levelOf,
    getRows: (block) => [...(byBlock.get(block)?.keys() ?? [])].sort((a, b) => a - b),
    getNums: (block, row) => [...(byBlock.get(block)?.get(Number(row))?.keys() ?? [])].sort((a, b) => a - b),
    getSeat: (block, row, num) => byBlock.get(block)?.get(Number(row))?.get(Number(num)) ?? null,
  };
  catalogs.set(mode, cat);
  return cat;
}

function mapWedge(n, points) {
  const angle = GYM_SECTION_ANGLES[n - 1] * 180 / Math.PI;
  const offsets = points.map((s) => ((Math.atan2(s.x, -s.z) * 180 / Math.PI - angle + 540) % 360) - 180);
  const radius = points.map((s) => Math.hypot(s.x, s.z));
  const near = Math.min(...radius) - .34, far = Math.max(...radius) + .34;
  return { c: gymPoint(angle, (near + far) / 2), p: [gymSector(angle + Math.min(...offsets) - .15, angle + Math.max(...offsets) + .15, near, far)] };
}

const maps = new Map();
export function gymBlockMap(mode) {
  if (maps.has(mode)) return maps.get(mode);
  const sections = new Map(), out = [];
  for (const s of [...stands, ...gymFloor(mode).positions]) {
    if (!sections.has(s.block)) sections.set(s.block, []);
    sections.get(s.block).push(s);
  }
  for (const [n, points] of sections) {
    let shape;
    if (n.startsWith('S')) {
      const [a, b] = GYM_STANDING[Number(n.slice(1)) - 1];
      shape = { c: gymPoint((a + b) / 2, 19), p: [gymSector(a + 2, b - 2, GYM_CENTER_R + 2.5, GYM_FLOOR_R - 2)] };
    } else if (n.startsWith('F')) {
      const xs = points.map((s) => s.x), zs = points.map((s) => s.z);
      const l = Math.min(...xs) - .24, r = Math.max(...xs) + .24, t = Math.min(...zs) - .38, b = Math.max(...zs) + .38;
      shape = { c: [(l + r) / 2, (t + b) / 2], p: [[[l, t], [r, t], [r, b], [l, b]]] };
    } else {
      shape = mapWedge(Number(n), points);
    }
    out.push({ n, lv: points[0].level, ...shape });
  }
  const map = { blocks: out, field: gymRing(0, 360, GYM_AISLE_R), outer: gymRing(0, 360, 62) };
  maps.set(mode, map);
  return map;
}
