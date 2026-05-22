// SoundInfo.jsx — a compact "?" button that, on hover/focus/click, reveals a
// popup explaining how the convolution reverb + sound design is tuned for the
// CURRENT venue. Rendered inline in the top bar (left of the format/status
// text). Content comes from data.js (SOUND_NOTES + SHARED_NOTES) so it stays in
// sync with the actual IR params and engine graph.

import { useState } from 'react';
import { getSoundNote, SHARED_NOTES } from '../data.js';

const ACCENT = 'oklch(0.78 0.16 55)';

export default function SoundInfo({ venue }) {
  const [open, setOpen] = useState(false);
  const note = getSoundNote(venue.id);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-label="사운드 조정 설명"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-6 h-6 rounded-full border border-[oklch(0.78_0.16_55)]/60 text-[oklch(0.78_0.16_55)] text-[12px] flex items-center justify-center hover:bg-[oklch(0.78_0.16_55)] hover:text-black transition-colors font-mono leading-none"
      >
        ?
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-3 w-[400px] max-w-[88vw] bg-[#0a0a0a]/95 border border-white/15 backdrop-blur-md p-5 text-left shadow-2xl normal-case tracking-normal cursor-default"
          style={{ boxShadow: '0 12px 48px rgba(0,0,0,0.7)' }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-500 font-mono">사운드 조정</div>
            <div className="text-[11px] tracking-[0.15em] uppercase font-mono" style={{ color: ACCENT }}>{venue.type}</div>
          </div>
          <div className="text-white text-[17px] font-light font-tight leading-snug mb-3">{note.headline}</div>

          <ul className="space-y-2 mb-4">
            {note.points.map((p, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-neutral-300 font-tight">
                <span style={{ color: ACCENT }} className="mt-[2px]">▸</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <div className="text-[10px] tracking-[0.08em] text-neutral-500 font-mono border border-white/10 px-3 py-2 mb-4 leading-relaxed">
            {note.params}
          </div>

          <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-600 font-mono mb-2">모든 공연장 공통</div>
          <ul className="space-y-1.5">
            {SHARED_NOTES.map((p, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-neutral-400 font-tight">
                <span className="text-neutral-600 mt-[2px]">·</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
