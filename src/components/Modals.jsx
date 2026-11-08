// Modals.jsx — modal shell + file / venue / seat pickers (ported from proto/ui.jsx)
// FilePicker accepts a real uploaded FLAC/WAV via drag-drop or the native input.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VENUES } from '../data.js';
import { ROUND_VENUES, VENUE_MODES, modeOf } from '../useVenueModes.js';
import { getDomeSeatCatalog } from '../three/venues/dome.js';

const DOME_TIERS = [
  ['A', '1F 1층 내야 하단 (A블록)'],
  ['B', '1F 1층 내야 상단 (B블록)'],
  ['F', '1F 외야석 (F블록)'],
  ['G', '1F 익사이트석 (G블록)'],
  ['C', '2F 발코니석 (C블록)'],
  ['D', '4F 2층 하단 (D블록)'],
  ['E', '4F 2층 상단 (E블록)'],
];

// ───────────────────────────────────────── Modal shell
export function Modal({ open, onClose, title, subtitle, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-10" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/15 max-w-[1200px] w-full max-h-[92vh] sm:max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5 border-b border-white/10 gap-3">
          <div className="min-w-0">
            {subtitle && <div className="text-[10px] sm:text-[12px] tracking-[0.25em] sm:tracking-[0.3em] uppercase text-neutral-500 font-mono truncate mb-1">{subtitle}</div>}
            <div className="text-white text-[20px] sm:text-[26px] font-light font-tight">{title}</div>
          </div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 border border-white/20 hover:border-white/50 text-neutral-400 hover:text-white flex items-center justify-center transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── Venue picker
//
// A list of the rooms, smallest to largest, beside a large plan of the one
// chosen (scripts/venue-maps.mjs → public/venue-maps/*.svg): the stage at the
// top in the accent, every seat in its own colour, a standing floor in a dim
// tint; zoomable.
// Choosing a room only shows it; Enter, a double click or the button goes in.
// The big rooms have a GENERAL / 360 pair over the plan, which shows that
// layout and goes in laid out that way. ↑↓ choose, ←→ switch the layout.
// On a phone the list is a row of chips over the plan.
const mapSrc = (id, mode = 'general') => `${import.meta.env.BASE_URL}venue-maps/${id}${mode === '360' ? '-360' : ''}.svg`;
const MODE_LABEL = { general: 'GENERAL', 360: '360' };
// how the floor is laid out, by room and layout
const FLOOR = {
  club: 'Standing', theater: 'Seated', concerthall: 'Seated',
  arena: { general: 'Seated floor', 360: 'Standing floor' },
  dome: { general: 'Seated floor', 360: 'Seated floor' },
  stadium: { general: 'Standing pitch', 360: 'Seated floor' },
};
const floorOf = (id, mode) => (typeof FLOOR[id] === 'string' ? FLOOR[id] : FLOOR[id]?.[mode]);
const headcount = (v) => Number(String(v.capacity).replace(/[^\d]/g, '').slice(0, 6)) || 0;
const short = (n) => (n < 1000 ? String(n) : `${Math.round(n / 100) / 10}k`);
// the size bar: logarithmic, so 300 shows beside 90,000
const sizeOf = (n) => Math.max(0.06, Math.min(1, Math.log10(n / 100) / 3));

export function VenuePicker({ open, onClose, current, currentMode = 'general', modes = {}, currentSeat = null, onPick }) {
  const [sel, setSel] = useState(current);
  const [selMode, setSelMode] = useState(currentMode);
  const [selBlock, setSelBlock] = useState('FOH');
  const [selRow, setSelRow] = useState(1);
  const [selNum, setSelNum] = useState(1);

  const domeCat = useMemo(() => (sel === 'dome' ? getDomeSeatCatalog() : null), [sel]);
  const domeRows = useMemo(() => (domeCat && selBlock !== 'FOH' ? domeCat.getRows(selBlock) : []), [domeCat, selBlock]);
  const domeNums = useMemo(() => (domeCat && selBlock !== 'FOH' ? domeCat.getNums(selBlock, selRow) : []), [domeCat, selBlock, selRow]);

  // (opened on the room and layout in use)
  useEffect(() => {
    if (open) {
      setSel(current);
      setSelMode(currentMode);
      if (currentSeat?.block) {
        setSelBlock(currentSeat.block);
        setSelRow(currentSeat.row);
        setSelNum(currentSeat.num);
      } else {
        setSelBlock('FOH');
      }
    }
  }, [open, current, currentMode, currentSeat]);

  const handleBlockChange = useCallback((nextBlock) => {
    setSelBlock(nextBlock);
    if (nextBlock === 'FOH' || !domeCat) return;
    const rows = domeCat.getRows(nextBlock);
    const r0 = rows.includes(selRow) ? selRow : (rows[0] ?? 1);
    const nums = domeCat.getNums(nextBlock, r0);
    const n0 = nums.includes(selNum) ? selNum : (nums[0] ?? 1);
    setSelRow(r0);
    setSelNum(n0);
  }, [domeCat, selRow, selNum]);

  const handleRowChange = useCallback((nextRow) => {
    setSelRow(nextRow);
    if (!domeCat || selBlock === 'FOH') return;
    const nums = domeCat.getNums(selBlock, nextRow);
    const n0 = nums.includes(selNum) ? selNum : (nums[0] ?? 1);
    setSelNum(n0);
  }, [domeCat, selBlock, selNum]);

  const v = VENUES.find((x) => x.id === sel) || VENUES[0];
  const round = ROUND_VENUES.includes(v.id);
  const mode = round ? selMode : 'general';
  const choose = useCallback((id) => { setSel(id); setSelMode(id === current ? currentMode : modeOf(modes, id)); }, [current, currentMode, modes]);
  const enter = useCallback((id = sel, m = mode) => {
    const seatObj = id === 'dome' && selBlock !== 'FOH' ? (domeCat?.getSeat(selBlock, selRow, selNum) || null) : null;
    onPick(id, ROUND_VENUES.includes(id) ? m : undefined, seatObj);
    onClose();
  }, [sel, mode, selBlock, selRow, selNum, domeCat, onPick, onClose]);

  // the keys, ahead of the app's own (whose arrows seek)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT') {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); enter(); }
        return;
      }
      const i = VENUES.findIndex((x) => x.id === sel);
      let hit = true;
      if (e.key === 'ArrowDown') choose(VENUES[(i + 1) % VENUES.length].id);
      else if (e.key === 'ArrowUp') choose(VENUES[(i - 1 + VENUES.length) % VENUES.length].id);
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && round) setSelMode(e.key === 'ArrowLeft' ? 'general' : '360');
      else if (e.key === 'Enter') enter();
      else hit = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (hit) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, sel, round, choose, enter]);

  const listRef = useRef(null);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [sel, open]);

  const sameSeat = v.id !== 'dome' || (
    selBlock === 'FOH'
      ? !currentSeat
      : (currentSeat?.block === selBlock && Number(currentSeat?.row) === Number(selRow) && Number(currentSeat?.num) === Number(selNum))
  );
  const isCurrent = v.id === current && (!round || mode === currentMode) && sameSeat;
  const facts = [
    ['RT60', v.acoustics.rt60],
    ['DISTANCE', v.position.distance],
    ['FIRST REFL.', v.position.firstReflection],
    ['FLOOR', floorOf(v.id, mode)],
  ];

  return (
    <Modal open={open} onClose={onClose} title="Choose a venue">
      <div className="flex flex-col sm:grid sm:grid-cols-[minmax(210px,260px)_1fr] gap-4 sm:gap-7 font-mono">
        {/* the rooms */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="공연장"
          className="flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-visible -mx-1 px-1 pb-1 sm:pb-0 snap-x"
        >
          {VENUES.map((x) => {
            const on = x.id === sel;
            const here = x.id === current;
            const n = headcount(x);
            return (
              <button
                key={x.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => choose(x.id)}
                onDoubleClick={() => enter(x.id, x.id === sel ? mode : modeOf(modes, x.id))}
                className={`snap-start shrink-0 sm:shrink text-left border px-3 py-2 sm:py-2.5 transition-colors ${
                  on ? `border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/10` : 'border-white/10 hover:border-white/35'
                }`}
              >
                <div className="flex items-baseline gap-2 sm:gap-3">
                  <span className={`w-2 text-[9px] ${here ? `text-[oklch(0.78_0.16_55)]` : 'text-transparent'}`} aria-label={here ? '지금 공연장' : undefined}>●</span>
                  <span className={`normal-case tracking-tight font-tight text-[16px] sm:text-[17px] whitespace-nowrap ${on ? 'text-white' : 'text-neutral-300'}`}>{x.name}</span>
                  <span className="ml-auto pl-2 text-[11px] text-neutral-500 tabular-nums">{short(n)}</span>
                </div>
                <div className="hidden sm:block ml-4 mt-1.5 h-[3px] bg-white/[0.06]">
                  <div className={`h-full ${on ? `bg-[oklch(0.78_0.16_55)]` : 'bg-white/25'}`} style={{ width: `${sizeOf(n) * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* the one chosen: its name, its plan under it (as wide as a portrait
            plan is at that height), and beside them what the room is */}
        <div className="min-w-0 flex flex-col sm:grid sm:grid-cols-[auto_minmax(240px,1fr)] sm:grid-rows-[auto_1fr] gap-x-7 gap-y-3">
          <div className="text-white text-[22px] sm:text-[28px] font-light normal-case tracking-tight font-tight leading-none sm:col-start-1 sm:row-start-1">{v.name}</div>
          <div className="sm:col-start-1 sm:row-start-2">
            <SeatMap key={`${v.id}-${mode}`} src={mapSrc(v.id, mode)} alt={`${v.name}${mode === '360' ? ' 360' : ''} 좌석배치도`} />
          </div>

          <div className="min-w-0 flex flex-col sm:col-start-2 sm:row-start-1 sm:row-span-2">
            <div className="text-[10px] tracking-[0.3em] text-neutral-500 sm:pt-1">{v.type}</div>
            <div className="text-[11px] text-neutral-400 mt-1 normal-case tracking-normal tabular-nums">{v.capacity}</div>

            {round && (
              <div className="mt-4 grid grid-cols-2 border border-white/15" role="group" aria-label="배치">
                {VENUE_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelMode(m)}
                    aria-pressed={mode === m}
                    className={`py-2 text-[10px] tracking-[0.25em] transition-colors ${
                      mode === m ? 'bg-[oklch(0.78_0.16_55)]/20 text-white' : 'text-neutral-500 hover:text-neutral-200'
                    }`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            )}

            {sel === 'dome' && domeCat && (
              <div className="mt-4 border border-white/15 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] tracking-[0.28em] text-neutral-400 uppercase">SEAT · 블록 / 열 / 좌석번호</span>
                  <span className="text-[11px] text-[oklch(0.78_0.16_55)] tabular-nums">
                    {selBlock === 'FOH' ? 'FOH (아레나 기본)' : `${selBlock}블록 ${selRow}열 ${selNum}번`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.2em] text-neutral-500">BLOCK</span>
                    <select
                      aria-label="블록"
                      value={selBlock}
                      onChange={(e) => handleBlockChange(e.target.value)}
                      className="bg-[#0a0a0a] border border-white/20 focus:border-[oklch(0.78_0.16_55)] text-white text-[12px] px-2 py-1.5 outline-none tabular-nums"
                    >
                      <option value="FOH">FOH (기본)</option>
                      {DOME_TIERS.map(([prefix, label]) => {
                        const list = domeCat.blocks.filter((b) => b.startsWith(prefix));
                        if (!list.length) return null;
                        return (
                          <optgroup key={prefix} label={label}>
                            {list.map((b) => <option key={b} value={b}>{b}블록</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.2em] text-neutral-500">ROW (열)</span>
                    <select
                      aria-label="열"
                      value={selBlock === 'FOH' ? '' : selRow}
                      disabled={selBlock === 'FOH'}
                      onChange={(e) => handleRowChange(Number(e.target.value))}
                      className="bg-[#0a0a0a] border border-white/20 focus:border-[oklch(0.78_0.16_55)] disabled:opacity-40 text-white text-[12px] px-2 py-1.5 outline-none tabular-nums"
                    >
                      {selBlock === 'FOH' ? <option value="">—</option> : domeRows.map((r) => (
                        <option key={r} value={r}>{r}열</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.2em] text-neutral-500">SEAT (번)</span>
                    <select
                      aria-label="좌석번호"
                      value={selBlock === 'FOH' ? '' : selNum}
                      disabled={selBlock === 'FOH'}
                      onChange={(e) => setSelNum(Number(e.target.value))}
                      className="bg-[#0a0a0a] border border-white/20 focus:border-[oklch(0.78_0.16_55)] disabled:opacity-40 text-white text-[12px] px-2 py-1.5 outline-none tabular-nums"
                    >
                      {selBlock === 'FOH' ? <option value="">—</option> : domeNums.map((n) => (
                        <option key={n} value={n}>{n}번</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-px bg-white/10 border border-white/10">
              {facts.map(([k, val]) => (
                <div key={k} className="bg-[#0a0a0a] px-3 py-2.5">
                  <div className="text-[9px] tracking-[0.3em] text-neutral-600">{k}</div>
                  <div className="text-[13px] text-neutral-200 mt-1 normal-case tracking-normal tabular-nums">{val}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-[12.5px] leading-relaxed text-neutral-400 normal-case tracking-normal font-tight">{v.descKo}</div>

            <button
              type="button"
              onClick={() => enter()}
              // (on a phone it stays at the bottom while the rest scrolls)
              className={`sticky bottom-0 sm:static mt-5 sm:mt-auto w-full py-3 text-[11px] tracking-[0.25em] border transition-colors shadow-[0_-12px_16px_#0a0a0a] sm:shadow-none ${
                isCurrent ? 'border-white/20 bg-[#0a0a0a] text-neutral-400 hover:text-white hover:border-white/50' : 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)] text-black hover:brightness-110'
              }`}
            >
              {isCurrent ? 'STAY' : 'ENTER →'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// The plan, zoomable: the wheel or the buttons zoom (about the pointer), a drag
// pans when zoomed in, a double click zooms in and back out.
function SeatMap({ src, alt }) {
  const box = useRef(null);
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef(null);
  const clamp = (n) => {
    const el = box.current;
    if (!el || n.k <= 1) return { k: 1, x: 0, y: 0 };
    const w = el.clientWidth, h = el.clientHeight;
    return { k: n.k, x: Math.min(0, Math.max(w - w * n.k, n.x)), y: Math.min(0, Math.max(h - h * n.k, n.y)) };
  };
  const zoomAt = (f, cx, cy) => setT((o) => {
    const k = Math.min(6, Math.max(1, o.k * f));
    return clamp({ k, x: cx - (cx - o.x) * (k / o.k), y: cy - (cy - o.y) * (k / o.k) });
  });
  const mid = () => [box.current.clientWidth / 2, box.current.clientHeight / 2];
  // (the wheel is a native listener: React's is passive and cannot stop the page scrolling)
  useEffect(() => {
    const el = box.current;
    const onWheel = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <div
      ref={box}
      // (3:4, as the plans are drawn: on a phone a third of the screen high;
      // else the modal's height less its header and the name, or what the
      // window's width leaves beside the list and an info column of 240 px,
      // and no more than 460 px)
      style={{ '--map-h': 'min(calc(88vh - 260px), calc((min(1136px, 100vw - 144px) - 560px) * 4 / 3), 460px)' }}
      className={`relative h-[34vh] sm:h-[var(--map-h)] aspect-[3/4] max-w-full mx-auto sm:mx-0 bg-black border border-white/10 overflow-hidden select-none touch-none ${t.k > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
      onPointerDown={(e) => { if (t.k > 1) { drag.current = { x: e.clientX - t.x, y: e.clientY - t.y }; e.currentTarget.setPointerCapture(e.pointerId); } }}
      onPointerMove={(e) => { if (drag.current) setT((o) => clamp({ k: o.k, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={(e) => { const r = box.current.getBoundingClientRect(); if (t.k > 1) setT({ k: 1, x: 0, y: 0 }); else zoomAt(2.5, e.clientX - r.left, e.clientY - r.top); }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain p-2 origin-top-left"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
      />
      <div className="absolute right-2 bottom-2 flex flex-col border border-white/15 bg-black/70 text-neutral-400 text-[13px] leading-none">
        <button type="button" aria-label="확대" className="w-7 h-7 hover:text-white hover:bg-white/10" onClick={() => zoomAt(1.6, ...mid())}>+</button>
        <button type="button" aria-label="축소" className="w-7 h-7 border-t border-white/15 hover:text-white hover:bg-white/10" onClick={() => zoomAt(1 / 1.6, ...mid())}>−</button>
        {t.k > 1 && <button type="button" aria-label="원래 크기" className="w-7 h-7 border-t border-white/15 text-[10px] hover:text-white hover:bg-white/10" onClick={() => setT({ k: 1, x: 0, y: 0 })}>1:1</button>}
      </div>
    </div>
  );
}

// ───────────────────────────────────────── File picker (upload, multi-file)
export function FilePicker({ open, onClose, onUpload }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const accept = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length) { onUpload(files); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Open audio files">
      {/* drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); accept(e.dataTransfer.files); }}
        className={`border-2 border-dashed transition-colors p-8 sm:p-16 text-center cursor-pointer ${dragOver ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/5' : 'border-white/20 hover:border-[oklch(0.78_0.16_55)]'}`}
      >
        <div className="text-[oklch(0.78_0.16_55)] text-[10px] tracking-[0.3em] uppercase font-mono">↓ DROP HERE</div>
        <div className="text-white text-[20px] sm:text-[28px] font-light mt-3 font-tight">Tap to add · FLAC / WAV / AIFF</div>
        <input
          ref={inputRef}
          type="file"
          accept=".flac,.wav,.aiff,.aif,audio/*"
          multiple
          className="hidden"
          onChange={(e) => accept(e.target.files)}
        />
      </div>
    </Modal>
  );
}
