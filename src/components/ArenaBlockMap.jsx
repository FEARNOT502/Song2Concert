// ArenaBlockMap.jsx — the Saitama Super Arena's seating plan in the venue
// picker, block by block (venue-lab/pipeline/ssa_blockmap.py draws each block
// round its own seats; BlockMap.jsx draws it): one level at a time, the stage
// end (north) at the top. A block is a door's seats: its name is the door's
// number; the suites along the west side are S01-S15.

import BlockMap, { ACCENT } from './BlockMap.jsx';
import { SSA_BLOCKS } from '../three/venues/ssa-blocks.js';
import { ARENA_OZ } from '../three/venues/arena.js';
import { STAGE_Z } from '../three/stage-plan.js';
import StagePlan from './StagePlan.jsx';

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

// the stage as concert-production.js builds it (app z = data z + 45), from the same plan
const stage = (mode) => <StagePlan id="arena" mode={mode} cz={STAGE_Z.arena[mode === '360' ? '360' : 'general']} dz={ARENA_OZ} fill={ACCENT} />;

export default function ArenaBlockMap(props) {
  return <BlockMap data={SSA_BLOCKS} floors={ARENA_FLOORS} zc={ARENA_OZ} stage={stage} stageText={[0, 14.5 - ARENA_OZ]} font={FONT} label={label} hoverText={arenaBlockText} {...props} />;
}
