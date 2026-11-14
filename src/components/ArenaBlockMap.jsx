// ArenaBlockMap.jsx — the Saitama Super Arena's seating plan in the venue
// picker, block by block (venue-lab/pipeline/ssa_blockmap.py draws each block
// round its own seats; BlockMap.jsx draws it): one level at a time, the stage
// end (north) at the top. A block is a door's seats: its name is the door's
// number; the suites along the west side are S01-S15.

import BlockMap, { ACCENT } from './BlockMap.jsx';
import { SSA_BLOCKS } from '../three/venues/ssa-blocks.js';
import { ARENA_OZ } from '../three/venues/arena.js';

// the levels, and the data's levels on each tab (the suites are on the 300 level's floor)
export const ARENA_FLOORS = [
  { id: '200', label: '200 LV', lv: ['200'] },
  { id: '300', label: '300 LV · SUITES', lv: ['300', '300S'] },
  { id: '400', label: '400 LV', lv: ['400'] },
  { id: '500', label: '500 LV', lv: ['500'] },
];
const FONT = { 200: 2.8, 300: 1.8, '300S': 1.5, 500: 2.0, 400: 2.4 };
export const arenaBlockText = (n) => (/^S\d+$/.test(n) ? `SUITE ${Number(n.slice(1))}` : `GATE ${n}`);
// (the door's number, and under it the block's letter where the door has several)
const label = (n) => (/^S\d+$/.test(n) ? `S${Number(n.slice(1))}` : /^\d+[A-Z]$/.test(n) ? [n.slice(0, -1), n.slice(-1)] : n);

// the stage as arena.js builds it (app z = data z + 45): the end stage's deck
// (34 x 15 m), its runway to a cross and a square end stage on the floor; or
// the round layout's long stage down the middle (10 x 40 m)
function stage(mode) {
  const st = { fill: ACCENT, opacity: 0.85 };
  if (mode === '360') return <rect x={-5} y={-20} width={10} height={40} {...st} />;
  const Z = (z) => z - ARENA_OZ;
  return (
    <g {...st}>
      <rect x={-17} y={Z(7)} width={34} height={15} />
      <rect x={-1.8} y={Z(22)} width={3.6} height={Z(46) - Z(22)} />
      <rect x={-12} y={Z(38) - 1.8} width={24} height={3.6} />
      <rect x={-3} y={Z(46)} width={6} height={6} />
    </g>
  );
}

export default function ArenaBlockMap(props) {
  return <BlockMap data={SSA_BLOCKS} floors={ARENA_FLOORS} zc={ARENA_OZ} stage={stage} stageText={[0, 14.5 - ARENA_OZ]} font={FONT} label={label} hoverText={arenaBlockText} {...props} />;
}
