import BlockMap, { ACCENT } from './BlockMap.jsx';
import StagePlan from './StagePlan.jsx';
import { GYM_FOH, GYM_ID } from '../three/gymnastic-arena-plan.js';
import { gymBlockMap } from '../three/venues/gymnastic-seats.js';

export const GYM_LEVELS = ['FLOOR', '1F', '2F'];
const FLOORS = GYM_LEVELS.map((level) => ({ id: level, label: level, lv: [level] }));
const FONTS = { '1F': 2.8, '2F': 2.7, FLOOR: 3.0 };

function production(mode) {
  const [x, , z] = GYM_FOH[mode];
  return (
    <g pointerEvents="none">
      <StagePlan id={GYM_ID} mode={mode} cz={0} dz={0} fill={ACCENT} />
      <rect x={x - 3.6} y={z - 2.4} width={7.2} height={4.8} fill="#171719" stroke="#77777c" strokeWidth=".28" />
      {mode === '360' && <text x={x} y={z + .55} textAnchor="middle" fontSize="1.45" fill="#ddd">FOH</text>}
    </g>
  );
}

export default function GymnasticBlockMap({ mode, ...props }) {
  return <BlockMap data={gymBlockMap(mode)} floors={FLOORS} zc={0} mode={mode} stage={production}
    stageText={[0, -19]} font={FONTS} label={(n) => mode === '360' && n === '19' ? ['19', 'FOH'] : n} hoverText={(n) => n.startsWith('S') ? `STANDING ${n}` : `BLOCK ${n}`} {...props} />;
}
