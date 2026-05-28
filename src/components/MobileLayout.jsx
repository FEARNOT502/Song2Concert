// MobileLayout.jsx — stacked, vertically-scrolling layout for narrow screens.
// The desktop layout positions everything as absolute overlays over a full-bleed
// Scene; that doesn't fit on phones. Here we stack instead: a compact header, the
// venue stage (Scene + album art) as a hero, the data rails reflowed into scroll
// cards, and a fixed compact transport pinned to the bottom.

import { useState } from 'react';
import Scene from './Scene.jsx';
import { formatTime } from './BottomTransport.jsx';

// Brand mark — same "Wave → Hall Arc" as the desktop TopBar, inlined.
function BrandMark({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <line x1="3" y1="9" x2="3" y2="15" stroke="#f3ecdc" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="5.5" y1="7" x2="5.5" y2="17" stroke="#f3ecdc" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="8" y1="10" x2="8" y2="14" stroke="#f3ecdc" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="10.5" y1="6" x2="10.5" y2="18" stroke="oklch(0.78 0.16 55)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M 14 6 Q 21 12 14 18" fill="none" stroke="oklch(0.78 0.16 55)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M 14 9 Q 18.5 12 14 15" fill="none" stroke="#f3ecdc" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <circle cx="14" cy="12" r="1.2" fill="oklch(0.78 0.16 55)" />
    </svg>
  );
}

const STATUS_LABEL = {
  demo: '○ NO FILE',
  loading: '◌ DECODING…',
  ready: '● PAUSED',
  live: '● IN VENUE',
};

// A draggable slider sized for touch (tall hit area, larger knob).
function MobileSlider({ value, max = 100, onChange, fillClass, disabled }) {
  const onPointer = (e) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onChange(ratio * max);
  };
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPointer(e); }}
      onPointerMove={(e) => { if (e.buttons) onPointer(e); }}
      className={`relative flex-1 py-4 -my-4 select-none touch-none ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}
    >
      <div className="h-[3px] bg-white/15 rounded-full relative pointer-events-none">
        <div className={`absolute left-0 top-0 h-[3px] rounded-full ${fillClass}`} style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[oklch(0.78_0.16_55)] shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Small label/value card.
function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] tracking-[0.2em] uppercase text-neutral-400">{title}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function StatRow({ k, v }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-0.5">
      <span className="text-neutral-500 text-[12px] uppercase tracking-wide">{k}</span>
      <span className="text-white text-[16px] tabular-nums font-tight">{v}</span>
    </div>
  );
}

export default function MobileLayout({
  venue, displayFile, coverSrc, pulse, upload, audioStatus, hasAudio,
  // transport
  playing, onToggle, onPrev, onNext, hasNext, hasPrev,
  time, durSec, wetDry, onWetChange, onSeek, onExport, exporting,
  volume, onVolumeChange, immersive, onImmersiveChange,
  // pickers
  onFileClick, onVenueClick,
}) {
  const [showMixer, setShowMixer] = useState(false);
  const pos = venue.position;
  const direct = 100 - pos.wet;
  const liveish = audioStatus === 'live' || audioStatus === 'ready';

  return (
    <div className="fixed inset-0 bg-black text-neutral-200 flex flex-col font-mono overflow-hidden">
      {/* ── header ── */}
      <header className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/10 bg-black/70 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <BrandMark size={20} />
          <span className="text-[12px] tracking-[0.18em] text-neutral-300">SONG2CONCERT</span>
        </div>
        <span className={`text-[10px] tracking-[0.15em] ${liveish ? 'text-[oklch(0.78_0.16_55)]' : 'text-neutral-500'}`}>
          {STATUS_LABEL[audioStatus] || STATUS_LABEL.demo}
        </span>
      </header>

      {/* ── scrolling content ── */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {/* stage hero — the venue scene + album art */}
        <div className="relative w-full" style={{ height: '46vh', minHeight: 260 }}>
          <Scene
            venueId={venue.id}
            coverId={displayFile.cover}
            coverSrc={coverSrc}
            pulse={pulse}
            title={upload ? upload.name : null}
            artist={upload ? upload.artist : null}
          />
        </div>

        {/* cards */}
        <div className="px-4 pb-40 pt-4 space-y-3">
          {/* call-to-action before any file is loaded */}
          {!hasAudio && (
            <button
              onClick={onFileClick}
              className="block w-full rounded-xl border border-[oklch(0.78_0.16_55)]/60 text-[oklch(0.78_0.16_55)] py-3.5 text-[12px] tracking-[0.2em] uppercase active:bg-[oklch(0.78_0.16_55)] active:text-black"
            >
              ↓ Tap to add a FLAC / WAV
            </button>
          )}

          {/* now playing */}
          <Card title="Playing">
            <div className="text-white text-[18px] font-light leading-snug font-tight truncate">{displayFile.name}</div>
            <div className="text-[12px] text-neutral-500 mt-0.5 truncate">{displayFile.track}</div>
            {upload && upload.artist && upload.artist !== '—' && (
              <div className="text-[11px] text-neutral-600 mt-0.5 truncate">{upload.artist}</div>
            )}
            <div className="text-[11px] text-neutral-600 mt-1.5">{displayFile.format}</div>
          </Card>

          {/* venue */}
          <button onClick={onVenueClick} className="block w-full text-left">
            <Card title="Venue · tap to change">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white text-[22px] font-light leading-tight font-tight">{venue.name}</div>
                  <div className="text-[12px] text-neutral-500 mt-0.5">{venue.type}</div>
                </div>
                <span className="text-neutral-600 text-lg">▾</span>
              </div>
              <div className="text-[12px] text-neutral-400 mt-2 leading-relaxed font-tight">{venue.descKo}</div>
            </Card>
          </button>

          {/* direct / reverb */}
          <Card title="Direct / Reverb">
            <div className="flex items-baseline gap-2">
              <span className="text-white text-[24px] font-light tabular-nums font-tight">{direct}<span className="text-[13px] text-neutral-500">%</span></span>
              <span className="text-neutral-600">/</span>
              <span className="text-white text-[24px] font-light tabular-nums font-tight">{pos.wet}<span className="text-[13px] text-neutral-500">%</span></span>
            </div>
            <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden flex">
              <div className="h-full bg-white/50" style={{ width: `${direct}%` }} />
              <div className="h-full bg-[oklch(0.78_0.16_55)]" style={{ width: `${pos.wet}%` }} />
            </div>
            <div className="mt-3 text-[11px] text-neutral-500">First reflection <span className="text-neutral-300 tabular-nums">{pos.firstReflection}</span></div>
          </Card>

          {/* signature */}
          <Card title={`${venue.type} signature`}>
            {Object.entries(venue.acoustics).map(([k, v]) => <StatRow key={k} k={k} v={v} />)}
            <div className="mt-2 pt-2 border-t border-white/10">
              <StatRow k="Capacity" v={venue.capacity} />
            </div>
          </Card>
        </div>
      </main>

      {/* ── fixed transport ── */}
      <div className="absolute bottom-0 inset-x-0 z-40 border-t border-white/10 bg-black/85 backdrop-blur-md">
        {/* expandable mixer (wet/dry + volume + export) */}
        {showMixer && (
          <div className="px-4 pt-3 pb-2 space-y-3 border-b border-white/10">
            <div className="flex items-center gap-3 text-[11px] tracking-[0.15em] text-neutral-400 uppercase">
              <span className="w-12">Dry/Wet</span>
              <MobileSlider value={wetDry} max={100} onChange={(v) => onWetChange(Math.round(v))} fillClass="bg-gradient-to-r from-white/40 to-[oklch(0.78_0.16_55)]" />
              <span className="w-12 text-right tabular-nums">{wetDry}%</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] tracking-[0.15em] text-neutral-400 uppercase">
              <span className="w-12">Volume</span>
              <MobileSlider value={volume} max={100} onChange={(v) => onVolumeChange(Math.round(v))} fillClass="bg-white/60" />
              <span className="w-12 text-right tabular-nums">{volume}</span>
            </div>
            <button
              onClick={() => onImmersiveChange(!immersive)}
              className={`w-full mt-1 py-2.5 border rounded-lg text-[12px] tracking-[0.15em] uppercase transition-colors ${immersive ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/15 text-[oklch(0.78_0.16_55)]' : 'border-white/25 text-neutral-400'}`}
            >
              360° Spatial {immersive ? 'ON' : 'OFF'} · 헤드폰 권장
            </button>
            <button
              onClick={onExport}
              disabled={exporting}
              className="w-full mt-1 py-2.5 border border-[oklch(0.78_0.16_55)] text-[oklch(0.78_0.16_55)] active:bg-[oklch(0.78_0.16_55)] active:text-black rounded-lg text-[12px] tracking-[0.15em] uppercase disabled:opacity-50"
            >
              {exporting ? 'RENDERING…' : 'EXPORT FLAC ↗'}
            </button>
          </div>
        )}

        {/* scrubber */}
        <div className="px-4 pt-2 flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-neutral-400 w-10">{formatTime(time)}</span>
          <MobileSlider value={time} max={durSec || 1} onChange={onSeek} fillClass="bg-[oklch(0.78_0.16_55)]" disabled={!hasAudio} />
          <span className="text-[11px] tabular-nums text-neutral-400 w-10 text-right">{formatTime(durSec)}</span>
        </div>

        {/* transport buttons */}
        <div className="px-4 pb-4 pt-1 flex items-center justify-between">
          <button onClick={onFileClick} className="w-11 h-11 rounded-full border border-white/20 flex items-center justify-center text-[15px] active:bg-white/10" title="Open file">⊕</button>
          <div className="flex items-center gap-5">
            <button onClick={onPrev} disabled={!hasPrev} className="w-10 h-10 rounded-full border border-white/25 flex items-center justify-center text-xs active:bg-white/10 disabled:opacity-30">⏮</button>
            <button onClick={onToggle} className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center text-xl active:bg-neutral-300">
              {playing ? '⏸' : '▶'}
            </button>
            <button onClick={onNext} disabled={!hasNext} className="w-10 h-10 rounded-full border border-white/25 flex items-center justify-center text-xs active:bg-white/10 disabled:opacity-30">⏭</button>
          </div>
          <button
            onClick={() => setShowMixer((s) => !s)}
            className={`w-11 h-11 rounded-full border flex items-center justify-center text-[15px] active:bg-white/10 ${showMixer ? 'border-[oklch(0.78_0.16_55)] text-[oklch(0.78_0.16_55)]' : 'border-white/20'}`}
            title="Mixer & export"
          >
            ⚙
          </button>
        </div>
      </div>
    </div>
  );
}
