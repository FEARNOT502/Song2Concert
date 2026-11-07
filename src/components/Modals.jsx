// Modals.jsx — modal shell + file / venue / seat pickers (ported from proto/ui.jsx)
// FilePicker accepts a real uploaded FLAC/WAV via drag-drop or the native input.

import { useCallback, useEffect, useRef, useState } from 'react';
import { VENUES } from '../data.js';
import { ROUND_VENUES, VENUE_MODES, modeOf } from '../useVenueModes.js';

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

export function VenuePicker({ open, onClose, current, currentMode = 'general', modes = {}, onPick }) {
  const [sel, setSel] = useState(current);
  const [selMode, setSelMode] = useState(currentMode);
  // (opened on the room and layout in use)
  useEffect(() => { if (open) { setSel(current); setSelMode(currentMode); } }, [open, current, currentMode]);
  const v = VENUES.find((x) => x.id === sel) || VENUES[0];
  const round = ROUND_VENUES.includes(v.id);
  const mode = round ? selMode : 'general';
  const choose = useCallback((id) => { setSel(id); setSelMode(id === current ? currentMode : modeOf(modes, id)); }, [current, currentMode, modes]);
  const enter = useCallback((id = sel, m = mode) => { onPick(id, ROUND_VENUES.includes(id) ? m : undefined); onClose(); }, [sel, mode, onPick, onClose]);

  // the keys, ahead of the app's own (whose arrows seek)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
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

  const isCurrent = v.id === current && (!round || mode === currentMode);
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

        {/* the one chosen */}
        <div className="min-w-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
            <div className="min-w-0">
              <div className="text-white text-[22px] sm:text-[26px] font-light normal-case tracking-tight font-tight leading-none">{v.name}</div>
              <div className="text-[10px] tracking-[0.3em] text-neutral-500 mt-2 truncate">{v.type} · {v.capacity}</div>
            </div>
            {round && (
              <div className="ml-auto flex border border-white/15" role="group" aria-label="배치">
                {VENUE_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelMode(m)}
                    aria-pressed={mode === m}
                    className={`px-3.5 py-1.5 text-[10px] tracking-[0.25em] transition-colors ${
                      mode === m ? `bg-[oklch(0.78_0.16_55)]/20 text-white` : 'text-neutral-500 hover:text-neutral-200'
                    }`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <SeatMap key={`${v.id}-${mode}`} src={mapSrc(v.id, mode)} alt={`${v.name}${mode === '360' ? ' 360' : ''} 좌석배치도`} />

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10 border border-white/10">
            {facts.map(([k, val]) => (
              <div key={k} className="bg-[#0a0a0a] px-3 py-2.5">
                <div className="text-[9px] tracking-[0.3em] text-neutral-600">{k}</div>
                <div className="text-[13px] text-neutral-200 mt-1 normal-case tracking-normal tabular-nums">{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="text-[12px] text-neutral-500 normal-case tracking-normal font-tight min-w-0 truncate">{v.descKo}</div>
            <button
              type="button"
              onClick={() => enter()}
              className={`ml-auto shrink-0 px-5 py-2.5 text-[11px] tracking-[0.25em] border transition-colors ${
                isCurrent ? 'border-white/20 text-neutral-400 hover:text-white hover:border-white/50' : `border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)] text-black hover:brightness-110`
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
      className={`relative aspect-[16/10] sm:aspect-auto sm:h-[clamp(240px,calc(88vh-380px),620px)] bg-black border border-white/10 overflow-hidden select-none touch-none ${t.k > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
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
        className="absolute inset-0 w-full h-full object-contain p-3 origin-top-left"
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
