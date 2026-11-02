// Modals.jsx — modal shell + file / venue / seat pickers (ported from proto/ui.jsx)
// FilePicker accepts a real uploaded FLAC/WAV via drag-drop or the native input.

import { useRef, useState } from 'react';
import { VENUES } from '../data.js';

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
// Each card shows the room's seating plan, drawn from the 3D room itself
// (scripts/venue-maps.mjs → public/venue-maps): the stage at the top in the
// accent, every seat in its own colour, a standing floor in a dim tint. Six
// cards fit on one screen, three across and two down, with no scrolling.
const mapSrc = (id) => `${import.meta.env.BASE_URL}venue-maps/${id}.webp`;

export function VenuePicker({ open, onClose, current, onPick }) {
  return (
    <Modal open={open} onClose={onClose} title="Choose a venue">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {VENUES.map((v) => {
          const active = v.id === current;
          return (
            <button
              key={v.id}
              onClick={() => { onPick(v.id); onClose(); }}
              className={`relative text-left border ${active ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/5' : 'border-white/15 hover:border-white/40'} p-3 transition-colors font-mono`}
            >
              <div className="aspect-[16/9] bg-black border border-white/10 relative overflow-hidden">
                <img src={mapSrc(v.id)} alt={`${v.name} 좌석배치도`} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
                {active && <div className="absolute top-2 right-2 text-[oklch(0.78_0.16_55)] text-[9px] tracking-[0.3em]">● CURRENT</div>}
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div className="text-white text-[18px] sm:text-[20px] font-light normal-case tracking-tight font-tight truncate">{v.name}</div>
                <div className="text-[11px] text-neutral-500 tabular-nums shrink-0">{v.capacity}</div>
              </div>
              <div className="text-[9px] tracking-[0.3em] text-neutral-600 mt-1 truncate">{v.type}</div>
            </button>
          );
        })}
      </div>
    </Modal>
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
