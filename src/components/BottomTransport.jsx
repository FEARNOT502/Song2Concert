// BottomTransport.jsx — transport bar.
// All sliders are real draggable controls (pointer capture), independent of one
// another. Wet/dry drives the GainNode crossfader; EXPORT WAV renders offline.

import { useRef } from 'react';

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// A draggable horizontal slider. value/max in absolute units; onChange(value).
function Slider({ value, max = 100, onChange, fillClass, knobClass, disabled }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const ratioAt = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const emit = (clientX) => onChange(ratioAt(clientX) * max);

  const onDown = (e) => {
    if (disabled) return;
    dragging.current = true;
    ref.current.setPointerCapture(e.pointerId);
    emit(e.clientX);
  };
  const onMove = (e) => { if (dragging.current) emit(e.clientX); };
  const onUp = (e) => {
    dragging.current = false;
    try { ref.current.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
  };

  const pct = max ? (value / max) * 100 : 0;
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className={`flex-1 py-3 -my-3 select-none touch-none ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}
    >
      <div className="h-px bg-white/15 relative pointer-events-none">
        <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-px ${fillClass}`} style={{ width: `${pct}%` }} />
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full ${knobClass}`}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BottomTransport({
  playing, onToggle, onPrev, onNext, hasNext, hasPrev,
  time, durSec, wetDry, onWetChange, onSeek,
  onExport, exporting, volume, onVolumeChange,
}) {
  return (
    <div className="absolute bottom-0 inset-x-0 z-40 border-t border-white/10 px-10 py-6 flex items-center gap-8 text-[13px] tracking-[0.2em] text-neutral-400 uppercase bg-black/70 backdrop-blur-md font-mono">
      <div className="flex items-center gap-3">
        <button onClick={onPrev} disabled={!hasPrev} title="처음부터 다시" className="w-9 h-9 rounded-full border border-white/25 hover:border-white/60 flex items-center justify-center text-xs transition-colors disabled:opacity-30">⏮</button>
        <button onClick={onToggle} className="w-12 h-12 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center text-lg transition-colors">
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={onNext} disabled={!hasNext} title="다음 곡" className="w-9 h-9 rounded-full border border-white/25 hover:border-white/60 flex items-center justify-center text-xs transition-colors disabled:opacity-30">⏭</button>
      </div>

      <div className="flex items-center gap-3 text-[12px] tabular-nums text-neutral-300 min-w-[120px]">
        <span>{formatTime(time)}</span>
        <span className="text-neutral-600">/</span>
        <span>{formatTime(durSec)}</span>
      </div>

      {/* scrubber */}
      <Slider
        value={time}
        max={durSec || 1}
        onChange={onSeek}
        fillClass="bg-[oklch(0.78_0.16_55)]"
        knobClass="bg-[oklch(0.78_0.16_55)] w-2.5 h-2.5"
      />

      {/* wet/dry crossfader */}
      <div className="flex items-center gap-3 min-w-[260px]">
        <span className="text-neutral-500">DRY</span>
        <Slider
          value={wetDry}
          max={100}
          onChange={(v) => onWetChange(Math.round(v))}
          fillClass="bg-gradient-to-r from-white/40 to-[oklch(0.78_0.16_55)]"
          knobClass="bg-[oklch(0.78_0.16_55)] w-2 h-2"
        />
        <span className="text-neutral-500 tabular-nums w-16 text-right">WET {wetDry}%</span>
      </div>

      {/* master volume */}
      <div className="flex items-center gap-3 min-w-[160px]">
        <button
          onClick={() => onVolumeChange(volume > 0 ? 0 : 85)}
          className="text-neutral-500 hover:text-neutral-200 transition-colors w-4 text-center"
          title={volume > 0 ? 'Mute' : 'Unmute'}
        >
          {volume === 0 ? '✕' : volume < 50 ? '◗' : '◉'}
        </button>
        <span className="text-neutral-500">VOL</span>
        <Slider
          value={volume}
          max={100}
          onChange={(v) => onVolumeChange(Math.round(v))}
          fillClass="bg-white/60"
          knobClass="bg-white/80 w-2 h-2"
        />
        <span className="text-neutral-500 tabular-nums w-8 text-right">{volume}</span>
      </div>

      <button
        onClick={onExport}
        disabled={exporting}
        className="px-3 py-1.5 border border-[oklch(0.78_0.16_55)] text-[oklch(0.78_0.16_55)] hover:bg-[oklch(0.78_0.16_55)] hover:text-black rounded transition-colors disabled:opacity-50 disabled:cursor-wait text-[12px]"
      >
        {exporting ? 'RENDERING…' : 'EXPORT WAV ↗'}
      </button>
    </div>
  );
}
