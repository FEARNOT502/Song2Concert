// SoundInfo.jsx — a compact "?" button that, on click, opens a popup
// explaining how the convolution reverb + sound design is tuned for the
// CURRENT venue, and the keys. Rendered at the right edge of the top bar. It
// closes on ✕, a second click, Esc, or a click anywhere outside it. Content
// comes from data.js (SOUND_NOTES + SHARED_NOTES) so it stays in sync with the
// actual IR params and engine graph.

import { useEffect, useRef, useState } from 'react';
import { getSoundNote, SHARED_NOTES } from '../data.js';

const ACCENT = 'oklch(0.78 0.16 55)';

// the keys, as App.jsx and walk.js read them
const KEYS = [
  ['SPACE', 'play / pause'],
  ['← →', '5 s back / forward'],
  ['F', 'open files'],
  ['V', 'choose a venue'],
  ['W A S D', 'walk · drag to look'],
  ['SHIFT', 'run'],
];
const DESK_KEYS = [
  ['1 – 9 · 0 · -', 'call a part of the song'],
  ['`', 'hand the lights back to the song'],
];

export default function SoundInfo({ venue, desk = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const note = getSoundNote(venue.id);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const keys = desk ? [...KEYS, ...DESK_KEYS] : KEYS;

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-label="사운드 조정과 단축키 설명"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-6 h-6 rounded-full border border-[oklch(0.78_0.16_55)]/60 flex items-center justify-center hover:bg-[oklch(0.78_0.16_55)] hover:text-black transition-colors ${
          open ? 'bg-[oklch(0.78_0.16_55)] text-black' : 'text-[oklch(0.78_0.16_55)]'
        }`}
      >
        {/* drawn, not typed: a glyph sits where its font's metrics put it, off
            the circle's centre; this mark's box is centred on the button's */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3.9 4.1a2.1 2.1 0 1 1 3.2 1.8c-.7.4-1.1.8-1.1 1.6v.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="6" cy="10" r="0.85" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-3 w-[400px] max-w-[88vw] max-h-[calc(100vh-200px)] overflow-y-auto bg-[#0a0a0a]/95 border border-white/15 backdrop-blur-md p-5 text-left shadow-2xl normal-case tracking-normal cursor-default"
          style={{ boxShadow: '0 12px 48px rgba(0,0,0,0.7)' }}
        >
          <button
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 w-7 h-7 border border-white/15 hover:border-white/50 text-neutral-500 hover:text-white flex items-center justify-center text-[12px] transition-colors font-mono"
          >
            ✕
          </button>
          <div className="flex items-baseline gap-3 mb-1 pr-10">
            <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-500 font-mono">사운드 조정</div>
            <div className="text-[11px] tracking-[0.15em] uppercase font-mono" style={{ color: ACCENT }}>{venue.type}</div>
          </div>
          <div className="text-white text-[17px] font-light font-tight leading-snug mb-3 pr-8">{note.headline}</div>

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
          <ul className="space-y-1.5 mb-4">
            {SHARED_NOTES.map((p, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-neutral-400 font-tight">
                <span className="text-neutral-600 mt-[2px]">·</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-600 font-mono mb-2 pt-3 border-t border-white/10">단축키</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11.5px] font-mono">
            {keys.map(([k, what]) => (
              <div key={k} className="contents">
                <dt className="text-neutral-200 whitespace-nowrap">[{k}]</dt>
                <dd className="text-neutral-500">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
