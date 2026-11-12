// StadiumBlockMap.jsx — Wembley's seating plan in the venue picker, block by
// block (venue-lab/pipeline/wb_blockmap.py draws each block round its own
// seats): one level at a time (the levels lie over one another in plan), the
// stage end (west) at the top, the stage on the pitch. The chosen block is lit
// in the accent and the chosen seat marked in it; a block is chosen by
// clicking it. Blocks not sold for the layout (behind an end stage) are dim
// and cannot be chosen.

import { useEffect, useMemo, useState } from 'react';
import { WB_BLOCKS } from '../three/venues/wb-blocks.js';

const ACCENT = '#ff9745';
const ZC = 64;               // the app's z of the centre spot (data z 0)
// the levels, and the data's levels on each tab
export const STADIUM_FLOORS = [
  { id: 'L1', label: 'LEVEL 1', lv: ['L1'] },
  { id: 'L2', label: 'LEVEL 2', lv: ['L2'] },
  { id: 'BOX', label: 'BOXES', lv: ['L3', 'L4'] },
  { id: 'L5', label: 'LEVEL 5', lv: ['L5'] },
];
const floorOf = (lv) => STADIUM_FLOORS.find((f) => f.lv.includes(lv))?.id ?? 'L1';
// type size (m) by level: the boxes are small
const FONT = { L3: 1.4, L4: 1.8 };
const label = (n) => (n === 'L4' ? 'L4' : n.startsWith('B') ? String(Number(n.slice(1))) : n);

const path = (p) => `M${p.map(([x, z]) => `${x} ${z}`).join('L')}Z`;
const box = (() => {
  const pts = WB_BLOCKS.blocks.flatMap((b) => b.p.flat());          // (the blocks, not the building round them: the bowl fills the plan)
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, z0 = Math.min(...zs) - 2, z1 = Math.max(...zs) + 2;
  return { x0, z0, w: x1 - x0, h: z1 - z0 };
})();

// the stage as stadium.js builds it (app z = data z + 64): across the west
// end of the pitch, a runway and a walkway across it to an end stage; or a
// round stage on the centre spot
function Stage({ mode }) {
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

export default function StadiumBlockMap({ mode = 'general', selected = null, seat = null, sellable = null, onPick = null }) {
  const sel = WB_BLOCKS.blocks.find((b) => b.n === selected);
  const [floor, setFloor] = useState(sel ? floorOf(sel.lv) : 'L1');
  useEffect(() => { if (sel) setFloor(floorOf(sel.lv)); }, [sel]);
  const [hover, setHover] = useState(null);
  const lvs = STADIUM_FLOORS.find((f) => f.id === floor).lv;
  const shown = useMemo(() => WB_BLOCKS.blocks.filter((b) => lvs.includes(b.lv)), [lvs]);
  const canPick = (b) => !sellable || sellable.has(b.n);

  return (
    <div className="absolute inset-0">
      <svg viewBox={`${box.x0} ${box.z0} ${box.w} ${box.h}`} className="absolute inset-0 w-full h-full p-2" preserveAspectRatio="xMidYMid meet">
        <path d={path(WB_BLOCKS.outer)} fill="#111114" stroke="#3a3a40" strokeWidth={0.6} />
        <path d={path(WB_BLOCKS.field)} fill="#16201a" stroke="#2c3d31" strokeWidth={0.6} />
        <Stage mode={mode} />
        {shown.map((b, i) => {
          const on = b.n === selected, hov = b.n === hover, ok = canPick(b);
          return (
            <g
              key={`${b.n}-${i}`}
              data-block={b.n}
              onClick={onPick && ok ? (e) => { e.stopPropagation(); onPick(b.n); } : undefined}
              onPointerEnter={() => setHover(b.n)}
              onPointerLeave={() => setHover((h) => (h === b.n ? null : h))}
              className={onPick && ok ? 'cursor-pointer' : undefined}
            >
              {b.p.map((p, j) => (
                <path
                  key={j}
                  d={path(p)}
                  fill={on ? ACCENT : !ok ? '#161619' : hov ? '#4a4a52' : '#26262b'}
                  fillOpacity={on ? 0.9 : 1}
                  stroke={on ? '#ffd2b0' : ok ? '#5c5c66' : '#2c2c32'}
                  strokeWidth={on ? 0.7 : 0.4}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
        <g pointerEvents="none" fontFamily="ui-monospace, monospace" textAnchor="middle" dominantBaseline="central">
          {shown.map((b) => (
            <text key={b.n} x={b.c[0]} y={b.c[1]} fontSize={FONT[b.lv] ?? 3.4} fill={b.n === selected ? '#000' : canPick(b) ? '#b9b9c2' : '#4a4a52'} fontWeight={b.n === selected ? 700 : 400}>
              {label(b.n)}
            </text>
          ))}
          {mode !== '360' && <text x={0} y={20 - ZC} fontSize={5} fill="#000" fontWeight={700}>STAGE</text>}
        </g>
        {seat && floorOf(seat.level) === floor && (
          <circle cx={seat.x} cy={seat.z - ZC} r={1.4} fill="#fff" stroke="#000" strokeWidth={0.5} pointerEvents="none" />
        )}
      </svg>
      <div className="absolute left-2 top-2 flex border border-white/15 bg-black/70 text-[9px] tracking-[0.2em]" onDoubleClick={(e) => e.stopPropagation()}>
        {STADIUM_FLOORS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={floor === f.id}
            onClick={(e) => { e.stopPropagation(); setFloor(f.id); }}
            className={`px-2 py-1 transition-colors ${floor === f.id ? 'bg-[oklch(0.78_0.16_55)]/25 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {hover && hover !== selected && (
        <div className="absolute left-2 bottom-2 border border-white/15 bg-black/70 px-2 py-1 text-[10px] tracking-[0.15em] text-neutral-300 pointer-events-none">
          {hover.startsWith('B') ? `BOX ${Number(hover.slice(1))}` : hover === 'L4' ? 'LEVEL 4 BALCONY' : `BLOCK ${hover}`}
        </div>
      )}
    </div>
  );
}
