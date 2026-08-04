// StageArt.jsx — the album art and title, mounted on the venue's on-stage screen.
//
// This stays HTML rather than becoming a texture in the 3D scene, on purpose:
// the fictional covers are React components, uploaded art is an <img>, and type
// rendered by the browser stays crisp at any size. What makes it read as part of
// the room is that its box comes from the 3D screen — `stage.js` projects that
// screen's corners and hands the rectangle back.

import { memo, useMemo } from 'react';
import Cover from './Cover.jsx';

const ACCENT = 'oklch(0.78 0.16 55)';

// The cover is memoised so the per-frame `pulse` prop, which only drives the
// glow, never re-renders the artwork underneath it.
const Art = memo(function Art({ coverId, coverSrc, size, bezel }) {
  return (
    <div style={bezel ? { padding: Math.max(2, size * 0.016), background: '#000', border: '1px solid rgba(255,255,255,0.16)' } : undefined}>
      <Cover id={coverId} src={coverSrc} size={size} />
    </div>
  );
});

function StageArt({ rect, coverId, coverSrc, pulse, title, artist, bezel = true }) {
  const box = rect || { x: 0, y: 0, w: 0, h: 0 };
  const metrics = useMemo(() => {
    const cover = Math.max(24, Math.round(Math.min(box.w * 0.60, box.h * 0.58)));
    return {
      cover,
      label: Math.max(6, Math.min(13, cover * 0.048)),
      title: Math.max(11, Math.min(26, cover * 0.11)),
      artist: Math.max(9, Math.min(17, cover * 0.072)),
    };
  }, [box.w, box.h]);

  return (
    <div
      className="absolute z-10 flex flex-col items-center justify-center"
      style={{
        left: box.x, top: box.y, width: box.w, height: box.h,
        pointerEvents: 'none',
        visibility: rect ? 'visible' : 'hidden',
        filter: `drop-shadow(0 0 ${28 + pulse * 30}px oklch(0.78 0.16 55 / ${0.26 + pulse * 0.16}))`,
        transition: 'filter 140ms',
      }}
    >
      <div
        className="tracking-[0.3em] font-mono opacity-90"
        style={{ fontSize: metrics.label, color: ACCENT, marginBottom: metrics.label * 0.9 }}
      >
        ▸ NOW PLAYING
      </div>

      <Art coverId={coverId} coverSrc={coverSrc} size={metrics.cover} bezel={bezel} />

      {title && (
        <div className="w-[118%] text-center" style={{ marginTop: metrics.title * 0.6 }}>
          <div
            className="text-white font-light leading-tight font-tight truncate"
            style={{ fontSize: metrics.title, textShadow: '0 1px 12px rgba(0,0,0,0.95)' }}
          >
            {title}
          </div>
          {artist && artist !== '—' && (
            <div
              className="text-neutral-300 tracking-[0.08em] font-tight truncate"
              style={{ fontSize: metrics.artist, marginTop: metrics.artist * 0.18, textShadow: '0 1px 10px rgba(0,0,0,0.95)' }}
            >
              {artist}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StageArt;
