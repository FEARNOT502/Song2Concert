import { decodeSeats } from '../stands.js';
import { floorBlocks } from '../show.js';
import { GYM_AISLE_R, GYM_CENTER_R, GYM_FIRST_ROW, GYM_FLOOR_R, GYM_FOH, GYM_STANDING, gymPoint, gymRing, gymSector, gymStagePlan } from '../gymnastic-arena-plan.js';
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

export function gymOpenSeat(seat, mode) {
  if (mode === '360') return seat.block !== '19';
  return seat.z > gymMask(seat.x) + 1.4;
}

const generalFloor = (() => {
  const { L } = gymStagePlan('general');
  const [fx, , fz] = GYM_FOH.general;
  const halves = [-1, 1].flatMap((side) => [[3.4, 12], [13.3, 24]].map(([lo, hi]) =>
    side < 0 ? [-hi, -lo] : [lo, hi]));
  const groups = [[L.front + 3.8, .3], [1.5, 15.5], [17, 29]];
  const blocks = groups.flatMap(([z0, z1], row) => halves.map(([x0, x1], column) => ({
    x0, x1, z0, z1, name: `F${1 + row * halves.length + column}`,
  })));
  const positions = [], people = [];
  function keep(x, z) {
    return Math.hypot(x, z) < GYM_FLOOR_R - 1.25 &&
      (Math.abs(x - fx) > 4.8 || Math.abs(z - fz) > 3.8) &&
      (z > L.tip + 1.4 || Math.abs(x) > 3.25);
  }
  for (const [index, block] of blocks.entries()) {
    const floor = floorBlocks([block], { keep, seed: 31 + index, trim: { rows: 3, cols: 4 } });
    people.push(...floor.people);
    const rows = new Map();
    for (const chair of floor.chairs) {
      if (!rows.has(chair.z)) rows.set(chair.z, []);
      rows.get(chair.z).push(chair);
    }
    let row = 0;
    for (const chairs of rows.values()) {
      row++;
      chairs.forEach((chair, i) => positions.push({ ...chair, yaw: chair.turn, block: block.name, level: 'FLOOR', row, num: i + 1 }));
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
