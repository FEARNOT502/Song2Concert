// BlockMap.jsx — a room's seating plan in the venue picker, block by block
// (each block outlined round its own seats by the room's pipeline): one level
// at a time (the levels lie over one another in plan), the stage end at the
// top. The chosen block is lit in the accent and the chosen seat marked in it;
// a block is chosen by clicking it. Blocks not sold for the layout are dim and
// cannot be chosen. The room's own wrapper gives the data, its levels' tabs,
// how it names a block, and where its stage stands.

import { useEffect, useMemo, useState } from 'react';

export const ACCENT = '#ff9745';
const path = (p) => `M${p.map(([x, z]) => `${x} ${z}`).join('L')}Z`;

// data: { blocks: [{ n, lv, c, seats, rows, p }], field, outer }
// floors: [{ id, label, lv: [data levels] }]
// zc: the app's z of the data's z 0 (a seat's z is the app's)
// stage: (mode) => SVG of the stage, in data metres; stageText: [x, z] or null
// font: { level: type size }; label(n): a block's name on the plan; hoverText(n): its name in full
export default function BlockMap({ data, floors, zc, stage, stageText = null, font = {}, label = (n) => n, hoverText = (n) => `BLOCK ${n}`, mode = 'general', selected = null, seat = null, sellable = null, onPick = null }) {
  const floorOf = (lv) => floors.find((f) => f.lv.includes(lv))?.id ?? floors[0].id;
  const box = useMemo(() => {
    const pts = data.blocks.flatMap((b) => b.p.flat());          // (the blocks, not the building round them: the bowl fills the plan)
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, z0 = Math.min(...zs) - 2, z1 = Math.max(...zs) + 2;
    return { x0, z0, w: x1 - x0, h: z1 - z0 };
  }, [data]);
  const sel = data.blocks.find((b) => b.n === selected);
  const [floor, setFloor] = useState(sel ? floorOf(sel.lv) : floors[0].id);
  useEffect(() => { if (sel) setFloor(floorOf(sel.lv)); }, [sel]);
  const [hover, setHover] = useState(null);
  const lvs = floors.find((f) => f.id === floor).lv;
  const shown = useMemo(() => data.blocks.filter((b) => lvs.includes(b.lv)), [data, lvs]);
  const canPick = (b) => !sellable || sellable.has(b.n);

  return (
    <div className="absolute inset-0">
      <svg viewBox={`${box.x0} ${box.z0} ${box.w} ${box.h}`} className="absolute inset-0 w-full h-full p-2" preserveAspectRatio="xMidYMid meet">
        <path d={path(data.outer)} fill="#111114" stroke="#3a3a40" strokeWidth={0.6} />
        <path d={path(data.field)} fill="#16201a" stroke="#2c3d31" strokeWidth={0.6} />
        {stage(mode)}
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
            <text key={b.n} x={b.c[0]} y={b.c[1]} fontSize={font[b.lv] ?? 3.4} fill={b.n === selected ? '#000' : canPick(b) ? '#b9b9c2' : '#4a4a52'} fontWeight={b.n === selected ? 700 : 400}>
              {label(b.n)}
            </text>
          ))}
          {mode !== '360' && stageText && <text x={stageText[0]} y={stageText[1]} fontSize={5} fill="#000" fontWeight={700}>STAGE</text>}
        </g>
        {seat && floorOf(seat.level) === floor && (
          <circle cx={seat.x} cy={seat.z - zc} r={1.4} fill="#fff" stroke="#000" strokeWidth={0.5} pointerEvents="none" />
        )}
      </svg>
      <div className="absolute left-2 top-2 flex border border-white/15 bg-black/70 text-[9px] tracking-[0.2em]" onDoubleClick={(e) => e.stopPropagation()}>
        {floors.map((f) => (
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
          {hoverText(hover)}
        </div>
      )}
    </div>
  );
}
