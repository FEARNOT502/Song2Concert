// TopBar.jsx — top chrome bar (ported from proto/ui.jsx)
// `audioStatus` reflects the real Web Audio engine state: 'demo' | 'loading' |
// 'ready' | 'live'. It replaces the prototype's static "IN SEAT" badge with a
// truthful indicator of whether real audio is loaded.

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
        <div className="w-2 h-2 rounded-full bg-[oklch(0.78_0.16_55)] animate-pulse" />
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
        <span>{file.format.split(' · ').slice(0, 2).join(' · ')}</span>
        <span className={liveish ? 'text-[oklch(0.78_0.16_55)]' : 'text-neutral-500'}>
          {STATUS_LABEL[audioStatus] || STATUS_LABEL.demo}
        </span>
      </div>
    </div>
  );
}
