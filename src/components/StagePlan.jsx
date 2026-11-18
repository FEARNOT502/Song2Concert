// StagePlan.jsx — the concert stage on a seating map, drawn from the same plan
// the 3D production builds (src/three/stage-plan.js): every deck, the stairs
// down from it, and the round stages' roof masts. In the map's data metres:
// `dz` is subtracted from the app's z.

import { useMemo } from 'react';
import { stagePlan } from '../three/stage-plan.js';

const path = (p, dz) => `M${p.map(([x, z]) => `${x.toFixed(2)} ${(z - dz).toFixed(2)}`).join('L')}Z`;

export default function StagePlan({ id, mode, cz, dz, fill = '#ff9745' }) {
  const plan = useMemo(() => stagePlan(id, mode, cz), [id, mode, cz]);
  return (
    <g pointerEvents="none">
      {plan.decks.map((d, i) => <path key={`d${i}`} d={path(d.ring, dz)} fill={fill} fillOpacity={0.85} stroke={fill} strokeWidth={0.15} strokeLinejoin="round" />)}
      {plan.steps.map((s, i) => <path key={`s${i}`} d={path(s.ring, dz)} fill={fill} fillOpacity={0.5} />)}
      {plan.masts.map(([x, z], i) => <rect key={`m${i}`} x={x - 0.9} y={z - dz - 0.9} width={1.8} height={1.8} fill="#0b0b0d" stroke={fill} strokeWidth={0.35} />)}
    </g>
  );
}
