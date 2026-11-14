import { THEATER_SEATS, THEATER_HEIGHTS, THEATER_ROWS } from './theater-data.js';

export { THEATER_HEIGHTS, THEATER_ROWS };
const cache = new Map();
export function getTheaterSeatCatalog(mode = 'general') {
  const op = mode === 'op';
  if (cache.has(op)) return cache.get(op);
  const byBlock = new Map(), seats = [];
  for (const [floor, row, num, x, y, z, yaw, kind] of THEATER_SEATS) {
    if (kind === 'op' && !op) continue;
    const block = `${floor}F`;
    const seat = { floor, level: block, block, row, num, x, y, z, yaw, turn: yaw, kind };
    if (!byBlock.has(block)) byBlock.set(block, new Map());
    const rows = byBlock.get(block);
    if (!rows.has(String(row))) rows.set(String(row), new Map());
    rows.get(String(row)).set(num, seat);
    seats.push(seat);
  }
  const getRows = (f) => [...(byBlock.get(f)?.keys() || [])].sort((a,b) => {
    const rank = (v) => v.startsWith('OP ') ? -10+Number(v.slice(3)) : v === 'FAMILY' ? 100 : Number(v);
    return rank(a)-rank(b);
  }).map(r => /^\d+$/.test(r) ? Number(r) : r);
  const getNums = (f,r) => [...(byBlock.get(f)?.get(String(r))?.keys() || [])].sort((a,b)=>a-b);
  const getSeat = (f,r,n) => byBlock.get(f)?.get(String(r))?.get(Number(n)) || null;
  const catalog = { blocks: ['1F','2F','3F'], byBlock, seats, getRows, getNums, getSeat, defaultSeat: getSeat('1F',9,23) };
  cache.set(op, catalog);
  return catalog;
}
