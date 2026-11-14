// StadiumBlockMap.jsx — Wembley's seating plan in the venue picker, block by
// block (venue-lab/pipeline/wb_blockmap.py draws each block round its own
// seats; BlockMap.jsx draws it): one level at a time, the stage end (west) at
// the top, the stage on the pitch.

import BlockMap, { ACCENT } from './BlockMap.jsx';
import { WB_BLOCKS } from '../three/venues/wb-blocks.js';

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

// the stage as stadium.js builds it (app z = data z + 64): across the west
// end of the pitch, a runway and a walkway across it to an end stage; or a
// round stage on the centre spot
function stage(mode) {
  const st = { fill: ACCENT, opacity: 0.85 };
  if (mode === '360') return <circle cx={0} cy={0} r={9} {...st} />;
  const Z = (z) => z - ZC;
  return (
    <g {...st}>
      <rect x={-39} y={Z(7)} width={78} height={26} />
      <rect x={-2.2} y={Z(33)} width={4.4} height={Z(84) - Z(33)} />
      <rect x={-30} y={Z(50) - 2.6} width={60} height={5.2} />
      <rect x={-5} y={Z(84)} width={10} height={10} />
    </g>
  );
}

export default function StadiumBlockMap(props) {
  return <BlockMap data={WB_BLOCKS} floors={STADIUM_FLOORS} zc={ZC} stage={stage} stageText={[0, 20 - ZC]} font={FONT} label={label} hoverText={hoverText} {...props} />;
}
