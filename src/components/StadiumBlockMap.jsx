// StadiumBlockMap.jsx — Wembley's seating plan in the venue picker, block by
// block (venue-lab/pipeline/wb_blockmap.py draws each block round its own
// seats; BlockMap.jsx draws it): one level at a time, the stage end (west) at
// the top, the stage on the pitch.

import BlockMap, { ACCENT } from './BlockMap.jsx';
import { WB_BLOCKS } from '../three/venues/wb-blocks.js';
import { STAGE_Z } from '../three/stage-plan.js';
import StagePlan from './StagePlan.jsx';

const ZC = 64;               // the app's z of the centre spot (data z 0)
// the levels, and the data's levels on each tab
export const STADIUM_FLOORS = [
  { id: 'L1', label: 'LEVEL 1', lv: ['L1'] },
  { id: 'L2', label: 'LEVEL 2', lv: ['L2'] },
  { id: 'BOX', label: 'BOXES', lv: ['L3', 'L4'] },
  { id: 'L5', label: 'LEVEL 5', lv: ['L5'] },
];
// type size (m) by level: the boxes are small
const FONT = { L3: 1.4, L4: 1.8 };
const label = (n) => (n === 'L4' ? 'L4' : n.startsWith('B') ? String(Number(n.slice(1))) : n);
const hoverText = (n) => (n.startsWith('B') ? `BOX ${Number(n.slice(1))}` : n === 'L4' ? 'LEVEL 4 BALCONY' : `BLOCK ${n}`);

// the stage as concert-production.js builds it (app z = data z + 64), from the same plan
const stage = (mode) => <StagePlan id="stadium" mode={mode} cz={STAGE_Z.stadium[mode === '360' ? '360' : 'general']} dz={ZC} fill={ACCENT} />;

export default function StadiumBlockMap(props) {
  return <BlockMap data={WB_BLOCKS} floors={STADIUM_FLOORS} zc={ZC} stage={stage} stageText={[0, 20 - ZC]} font={FONT} label={label} hoverText={hoverText} {...props} />;
}
