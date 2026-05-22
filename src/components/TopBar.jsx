// TopBar.jsx — top chrome bar (ported from proto/ui.jsx)
// `audioStatus` reflects the real Web Audio engine state: 'demo' | 'loading' |
// 'ready' | 'live'. It replaces the prototype's static "IN SEAT" badge with a
// truthful indicator of whether real audio is loaded.

import SoundInfo from './SoundInfo.jsx';

// Brand mark — "Wave → Hall Arc" (icon-exports). Inlined so it inherits color
// and needs no extra request. Cream waveform morphs into an accent hall arc.
function BrandMark({ size = 22 }) {
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
  ready: '● IN VENUE · paused',
  live: '● IN VENUE',
};

export default function TopBar({ file, venue, audioStatus = 'demo', onFileClick, onVenueClick }) {
  const liveish = audioStatus === 'live' || audioStatus === 'ready';
  return (
    <div className="absolute top-0 inset-x-0 z-40 flex items-center justify-between px-10 pt-6 pb-4 text-[13px] tracking-[0.2em] uppercase text-neutral-500 border-b border-white/5 bg-black/40 backdrop-blur-sm font-mono">
      <div className="flex items-center gap-3">
        <BrandMark size={22} />
        <span className="text-neutral-300">SONG2CONCERT</span>
        <span className="text-neutral-600">v0.4</span>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={onFileClick} className="px-3 py-1.5 hover:bg-white/5 rounded transition-colors flex items-center gap-2 group">
          <span className="text-neutral-500">File</span>
          <span className="text-neutral-200 text-[15px] normal-case tracking-normal font-tight">{file.name}</span>
          <span className="text-neutral-600 group-hover:text-neutral-300">▾</span>
        </button>
        <div className="w-px h-3 bg-white/15" />
        <button onClick={onVenueClick} className="px-3 py-1.5 hover:bg-white/5 rounded transition-colors flex items-center gap-2 group">
          <span className="text-neutral-500">Venue</span>
          <span className="text-neutral-200 text-[15px] normal-case tracking-normal font-tight">{venue.name}</span>
          <span className="text-neutral-600 group-hover:text-neutral-300">▾</span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <SoundInfo venue={venue} />
        <span>{file.format.split(' · ').slice(0, 2).join(' · ')}</span>
        <span className={liveish ? 'text-[oklch(0.78_0.16_55)]' : 'text-neutral-500'}>
          {STATUS_LABEL[audioStatus] || STATUS_LABEL.demo}
        </span>
      </div>
    </div>
  );
}
