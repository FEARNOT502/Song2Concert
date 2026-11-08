// DomeBlockMap.jsx — the Tokyo Dome's seating plan in the venue picker, block by
// block (venue-lab/pipeline/td_blockmap.py draws each block round its own seats):
// one floor at a time (the stands of the 1st floor, the balcony and the 2nd
// floor lie over one another in plan), the outfield at the top as the dome's
// charts are drawn, the stage on the field. The chosen block is lit in the
// accent and the chosen seat marked in it; a block is chosen by clicking it.

import { useEffect, useMemo, useState } from 'react';
import { TD_BLOCKS } from '../three/venues/td-blocks.js';

const ACCENT = '#ff9745';
// the floors, and the levels of the stands on each
const FLOORS = [
  { id: '1F', label: '1F', lv: ['G', 'A', 'B', 'F'] },
  { id: 'BAL', label: 'BALCONY', lv: ['C'] },
  { id: '2F', label: '2F', lv: ['D', 'E'] },
];
const floorOf = (lv) => FLOORS.find((f) => f.lv.includes(lv))?.id ?? '1F';
// type size (m) by level: the balcony's and the excite seats' blocks are small
const FONT = { C: 1.5, G: 1.7 };

const path = (p) => `M${p.map(([x, z]) => `${x} ${z}`).join('L')}Z`;

// the frame: every block of every floor with a little room round them (data
// metres, home plate at 0, 0, the outfield towards -z)
const box = (() => {
  const pts = TD_BLOCKS.blocks.flatMap((b) => b.p.flat());
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3, z0 = Math.min(...zs) - 3, z1 = Math.max(...zs) + 3;
  return { x0, z0, w: x1 - x0, h: z1 - z0 };
})();
const fieldZ = (() => { const zs = TD_BLOCKS.field.map((p) => p[1]); return (Math.min(...zs) + Math.max(...zs)) / 2; })();

// the stage as dome.js builds it (app z = data z + 114): across the outfield
// with a runway down the field, crossed by a walkway, to an end stage; or a
// centre stage in the middle of the field
function Stage({ mode }) {
  const st = { fill: ACCENT, opacity: 0.85 };
  if (mode === '360') return <rect x={-8} y={fieldZ - 20} width={16} height={40} {...st} />;
  const Z = (z) => z - 114;
  return (
    <g {...st}>
      <rect x={-36} y={Z(18)} width={72} height={20} />
      <rect x={-2.2} y={Z(38)} width={4.4} height={Z(91.2) - Z(38)} />
      <rect x={-15} y={Z(57) - 2.6} width={30} height={5.2} />
      <rect x={-5} y={Z(91.2)} width={10} height={10} />
    </g>
  );
}

export default function DomeBlockMap({ mode = 'general', selected = null, seat = null, onPick = null }) {
  const sel = TD_BLOCKS.blocks.find((b) => b.n === selected);
  const [floor, setFloor] = useState(sel ? floorOf(sel.lv) : '1F');
  // (the floor of the block chosen, when one is chosen)
  useEffect(() => { if (sel) setFloor(floorOf(sel.lv)); }, [sel]);
  const [hover, setHover] = useState(null);
  const lvs = FLOORS.find((f) => f.id === floor).lv;
  const shown = useMemo(() => TD_BLOCKS.blocks.filter((b) => lvs.includes(b.lv)), [lvs]);

  return (
    <div className="absolute inset-0">
      <svg viewBox={`${box.x0} ${box.z0} ${box.w} ${box.h}`} className="absolute inset-0 w-full h-full p-2" preserveAspectRatio="xMidYMid meet">
        <path d={path(TD_BLOCKS.outer)} fill="#111114" stroke="#3a3a40" strokeWidth={0.5} />
        <path d={path(TD_BLOCKS.field)} fill="#16201a" stroke="#2c3d31" strokeWidth={0.5} />
        <Stage mode={mode} />
        {shown.map((b, i) => {
          const on = b.n === selected, hov = b.n === hover;
          return (
            <g
              key={`${b.n}-${b.lv}-${i}`}
              data-block={b.n}
              onClick={onPick ? (e) => { e.stopPropagation(); onPick(b.n); } : undefined}
              onPointerEnter={() => setHover(b.n)}
              onPointerLeave={() => setHover((h) => (h === b.n ? null : h))}
              className={onPick ? 'cursor-pointer' : undefined}
            >
              {b.p.map((p, j) => (
                <path
                  key={j}
                  d={path(p)}
                  fill={on ? ACCENT : hov ? '#4a4a52' : '#26262b'}
                  fillOpacity={on ? 0.9 : 1}
                  stroke={on ? '#ffd2b0' : '#5c5c66'}
                  strokeWidth={on ? 0.6 : 0.35}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
        {/* the names, over every block (none taking the pointer) */}
        <g pointerEvents="none" fontFamily="ui-monospace, monospace" textAnchor="middle" dominantBaseline="central">
          {shown.filter((b, i, a) => a.findIndex((q) => q.n === b.n) === i).map((b) => (
            <text key={b.n} x={b.c[0]} y={b.c[1]} fontSize={FONT[b.lv] ?? 2.6} fill={b.n === selected ? '#000' : '#b9b9c2'} fontWeight={b.n === selected ? 700 : 400}>
              {b.n}
            </text>
          ))}
          {mode !== '360' && <text x={0} y={-114 + 28} fontSize={4} fill="#000" fontWeight={700}>STAGE</text>}
        </g>
        {seat && floorOf(seat.level) === floor && (
          <circle cx={seat.x} cy={seat.z - 114} r={1.1} fill="#fff" stroke="#000" strokeWidth={0.4} pointerEvents="none" />
        )}
      </svg>
      {/* the floors */}
      <div className="absolute left-2 top-2 flex border border-white/15 bg-black/70 text-[9px] tracking-[0.2em]" onDoubleClick={(e) => e.stopPropagation()}>
        {FLOORS.map((f) => (
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
        <div className="absolute left-2 bottom-2 border border-white/15 bg-black/70 px-2 py-1 text-[10px] tracking-[0.15em] text-neutral-300 pointer-events-none">{hover}</div>
      )}
    </div>
  );
}
