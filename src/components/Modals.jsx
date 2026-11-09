// Modals.jsx — modal shell + file / venue / seat pickers (ported from proto/ui.jsx)
// FilePicker accepts a real uploaded FLAC/WAV via drag-drop or the native input.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VENUES } from '../data.js';
import { ROUND_VENUES, VENUE_MODES, modeOf } from '../useVenueModes.js';
import { getDomeSeatCatalog } from '../three/venues/dome.js';
import DomeBlockMap from './DomeBlockMap.jsx';
import { useReorder, moved } from './useReorder.js';

const DOME_TIERS = [
  ['A', '1F INFIELD LOWER (A)'],
  ['B', '1F INFIELD UPPER (B)'],
  ['F', '1F OUTFIELD (F)'],
  ['G', '1F EXCITE SEATS (G)'],
  ['C', 'BALCONY (C)'],
  ['D', '2F LOWER (D)'],
  ['E', '2F UPPER (E)'],
];
// a seat as the picker and the badges write it
export const seatText = (s) => (s ? `${s.block} · ROW ${s.row} · SEAT ${s.num}` : 'FOH · ARENA');

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
            {v.id === 'dome' && domeCat ? (
              <SeatMap key={`${v.id}-${mode}`} alt={`${v.name}${mode === '360' ? ' 360' : ''} block map`}>
                <DomeBlockMap
                  mode={mode}
                  selected={selBlock === 'FOH' ? null : selBlock}
                  seat={selBlock === 'FOH' ? null : domeCat.getSeat(selBlock, selRow, selNum)}
                  onPick={handleBlockChange}
                />
              </SeatMap>
            ) : (
              <SeatMap key={`${v.id}-${mode}`} src={mapSrc(v.id, mode)} alt={`${v.name}${mode === '360' ? ' 360' : ''} 좌석배치도`} />
            )}
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
                  <span className="text-[9px] tracking-[0.28em] text-neutral-400 uppercase">SEAT · BLOCK / ROW / NO.</span>
                  <span className="text-[11px] text-[oklch(0.78_0.16_55)] tabular-nums">
                    {seatText(selBlock === 'FOH' ? null : { block: selBlock, row: selRow, num: selNum })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.2em] text-neutral-500">BLOCK</span>
                    <select
                      aria-label="Block"
                      value={selBlock}
                      onChange={(e) => handleBlockChange(e.target.value)}
                      className="bg-[#0a0a0a] border border-white/20 focus:border-[oklch(0.78_0.16_55)] text-white text-[12px] px-2 py-1.5 outline-none tabular-nums"
                    >
                      <option value="FOH">FOH (ARENA)</option>
                      {DOME_TIERS.map(([prefix, label]) => {
                        const list = domeCat.blocks.filter((b) => b.startsWith(prefix));
                        if (!list.length) return null;
                        return (
                          <optgroup key={prefix} label={label}>
                            {list.map((b) => <option key={b} value={b}>{b}</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.2em] text-neutral-500">ROW</span>
                    <select
                      aria-label="Row"
                      value={selBlock === 'FOH' ? '' : selRow}
                      disabled={selBlock === 'FOH'}
                      onChange={(e) => handleRowChange(Number(e.target.value))}
                      className="bg-[#0a0a0a] border border-white/20 focus:border-[oklch(0.78_0.16_55)] disabled:opacity-40 text-white text-[12px] px-2 py-1.5 outline-none tabular-nums"
                    >
                      {selBlock === 'FOH' ? <option value="">—</option> : domeRows.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.2em] text-neutral-500">SEAT</span>
                    <select
                      aria-label="Seat"
                      value={selBlock === 'FOH' ? '' : selNum}
                      disabled={selBlock === 'FOH'}
                      onChange={(e) => setSelNum(Number(e.target.value))}
                      className="bg-[#0a0a0a] border border-white/20 focus:border-[oklch(0.78_0.16_55)] disabled:opacity-40 text-white text-[12px] px-2 py-1.5 outline-none tabular-nums"
                    >
                      {selBlock === 'FOH' ? <option value="">—</option> : domeNums.map((n) => (
                        <option key={n} value={n}>{n}</option>
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
function SeatMap({ src, alt, children = null }) {
  const box = useRef(null);
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef(null);
  const moved = useRef(false);
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
      // (a drag once the pointer has gone 4 px: short of that it is a click, on a block of a plan that takes them)
      onPointerDown={(e) => { moved.current = false; if (t.k > 1) drag.current = { x: e.clientX - t.x, y: e.clientY - t.y, x0: e.clientX, y0: e.clientY, id: e.pointerId }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!moved.current) {
          if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
          moved.current = true; e.currentTarget.setPointerCapture(d.id);
        }
        setT((o) => clamp({ k: o.k, x: e.clientX - d.x, y: e.clientY - d.y }));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); moved.current = false; } }}
      onDoubleClick={(e) => { const r = box.current.getBoundingClientRect(); if (t.k > 1) setT({ k: 1, x: 0, y: 0 }); else zoomAt(2.5, e.clientX - r.left, e.clientY - r.top); }}
    >
      {children ? (
        <div role="img" aria-label={alt} className="absolute inset-0 origin-top-left" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}>
          {children}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain p-2 origin-top-left"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
        />
      )}
      <div className="absolute right-2 bottom-2 flex flex-col border border-white/15 bg-black/70 text-neutral-400 text-[13px] leading-none">
        <button type="button" aria-label="확대" className="w-7 h-7 hover:text-white hover:bg-white/10" onClick={() => zoomAt(1.6, ...mid())}>+</button>
        <button type="button" aria-label="축소" className="w-7 h-7 border-t border-white/15 hover:text-white hover:bg-white/10" onClick={() => zoomAt(1 / 1.6, ...mid())}>−</button>
        {t.k > 1 && <button type="button" aria-label="원래 크기" className="w-7 h-7 border-t border-white/15 text-[10px] hover:text-white hover:bg-white/10" onClick={() => setT({ k: 1, x: 0, y: 0 })}>1:1</button>}
      </div>
    </div>
  );
}

// ───────────────────────────────────────── File picker (upload, multi-file)
//
// Two panes: files go in on the left, as many times as wanted, and on the right
// the whole running order: what is playing now, pinned at the top, then what is
// already waiting and what has just been added, in one list to drag into order.
// Nothing changes until a button at the bottom is pressed; closing throws away
// what was added. The list scrolls, the window stays the size it is.
const ACCENT_TXT = 'text-[oklch(0.78_0.16_55)]';
const stripName = (n) => n.replace(/\.[^.]+$/, '');

function PickerArt({ src }) {
  return src
    ? <img src={src} alt="" draggable={false} className="w-9 h-9 object-cover shrink-0" />
    : <div className="w-9 h-9 shrink-0 bg-white/10" />;
}

let pickerSeq = 0;

export function FilePicker({ open, onClose, getQueue, readMeta, onApply, onDiscard }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [now, setNow] = useState(null);       // the playing row, or null
  const [rows, setRows] = useState([]);       // the waiting rows: { key, id?, file, title, sub, art, isNew }
  const reading = useRef(0);

  // tags and covers, one file at a time so a big drop does not read them all at once
  const fill = useCallback(async (list) => {
    const run = reading.current;
    for (const r of list) {
      let m;
      try { m = await readMeta(r.file); } catch { continue; }
      if (run !== reading.current) return;
      const patch = { art: m?.coverSrc ?? null };
      if (m?.title) { patch.title = m.title; patch.sub = m.artist ?? ''; }
      setRows((q) => q.map((x) => (x.key === r.key ? { ...x, ...patch } : x)));
      setNow((x) => (x && x.key === r.key ? { ...x, ...patch } : x));
    }
  }, [readMeta]);

  // (read once as it opens: the queue moving on underneath does not disturb the list being arranged)
  const queueAtOpen = useRef(getQueue);
  queueAtOpen.current = getQueue;
  useEffect(() => {
    if (!open) return;
    reading.current++;
    const toRow = (r) => ({ key: `q${r.id}`, id: r.id, file: r.file, title: r.name, sub: '', art: null, isNew: false });
    const all = queueAtOpen.current().map(toRow);
    setNow(all[0] ?? null);
    setRows(all.slice(1));
    fill(all);
  }, [open, fill]);

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const added = files.map((file) => ({ key: `n${++pickerSeq}`, file, title: stripName(file.name), sub: '', art: null, isNew: true }));
    setRows((q) => q.concat(added));
    fill(added);
  };

  const pin = now ? 1 : 0;
  const { listRef, handle, dragging } = useReorder({ count: rows.length + pin, first: pin, onMove: (a, b) => setRows((q) => moved(q, a - pin, b - pin)) });

  const remove = (key) => setRows((q) => q.filter((r) => r.key !== key));
  const newCount = rows.filter((r) => r.isNew).length;
  const close = () => { reading.current++; onDiscard(rows.filter((r) => r.isNew).map((r) => r.file)); onClose(); };
  const apply = (mode) => {
    reading.current++;
    onApply({ items: rows.map((r) => (r.isNew ? { file: r.file } : { id: r.id })), mode });
    onClose();
  };

  if (!open) return null;
  const btn = 'px-5 py-2.5 text-[13px] border transition-colors font-mono tracking-[0.08em]';
  const primary = `${btn} bg-[oklch(0.78_0.16_55)] border-[oklch(0.78_0.16_55)] text-black font-semibold hover:brightness-110 disabled:opacity-40`;
  const quiet = `${btn} border-white/20 text-neutral-200 hover:border-white/50`;
  const row = (r, i, pinned) => (
    <div key={r.key} className={`group flex items-center gap-3 px-3 py-2 border-b border-white/[0.06] ${pinned ? 'bg-[oklch(0.78_0.16_55)]/10' : ''} ${dragging === i ? 'bg-white/10' : ''}`}>
      {pinned
        ? <span className="w-4 shrink-0" />
        : <span {...handle(i)} aria-label="Drag to reorder" className="w-4 shrink-0 text-center text-neutral-600 hover:text-white cursor-grab active:cursor-grabbing select-none">⋮⋮</span>}
      <PickerArt src={r.art} />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-white truncate font-tight">{r.title}</div>
        {r.sub && <div className="text-[12px] text-neutral-500 truncate font-tight">{r.sub}</div>}
      </div>
      {pinned && <span className="shrink-0 bg-[oklch(0.78_0.16_55)] text-black text-[9px] tracking-[0.18em] px-1.5 py-0.5 font-mono">NOW</span>}
      {r.isNew && <span className={`shrink-0 border border-[oklch(0.78_0.16_55)] ${ACCENT_TXT} text-[9px] tracking-[0.18em] px-1.5 py-px font-mono`}>NEW</span>}
      {!pinned && <button type="button" aria-label="Remove" onClick={() => remove(r.key)} className="shrink-0 w-5 h-5 text-neutral-600 hover:text-white text-[11px]">✕</button>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-10" onClick={close}>
      <div className="bg-[#0a0a0a] border border-white/15 w-full max-w-[880px] h-[min(620px,88vh)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="text-white text-[20px] font-light font-tight">Add music</div>
          <button type="button" aria-label="Close" onClick={close} className="w-9 h-9 border border-white/20 hover:border-white/50 text-neutral-400 hover:text-white flex items-center justify-center transition-colors">✕</button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="md:w-[300px] shrink-0 p-4 md:border-r border-b md:border-b-0 border-white/10 flex">
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              className={`flex-1 border-2 border-dashed transition-colors p-6 flex flex-col items-center justify-center text-center cursor-pointer ${dragOver ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/5' : 'border-white/20 hover:border-[oklch(0.78_0.16_55)]'}`}
            >
              <div className={`${ACCENT_TXT} text-[10px] tracking-[0.3em] uppercase font-mono`}>↓ Drop here</div>
              <div className="text-white text-[17px] font-light mt-2 font-tight">or click to add files</div>
              <input
                ref={inputRef}
                type="file"
                accept=".flac,.wav,.aiff,.aif,audio/*"
                multiple
                className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="px-4 py-2.5 text-[10px] tracking-[0.3em] uppercase text-neutral-500 font-mono shrink-0">Running order</div>
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
              {now && row(now, 0, true)}
              {rows.map((r, i) => row(r, i + pin, false))}
              {!now && !rows.length && <div className="px-4 py-10 text-center text-[14px] text-neutral-600 font-tight">No tracks yet</div>}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-4 py-3 border-t border-white/10 shrink-0">
          {newCount > 0 && <span className="mr-auto text-[13px] text-neutral-500 font-tight">{newCount} new</span>}
          {now && newCount > 0 && <button type="button" className={quiet} onClick={() => apply('queue')}>Add to queue</button>}
          {newCount > 0
            ? <button type="button" className={primary} onClick={() => apply('now')}>{now ? 'Play now' : 'Play'}</button>
            : <button type="button" className={primary} disabled={!now && !rows.length} onClick={() => apply('queue')}>Done</button>}
        </div>
      </div>
    </div>
  );
}
