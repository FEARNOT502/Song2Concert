// StageArt.jsx — the album art and title, mounted on the venue's on-stage screen.
//
// This stays HTML rather than becoming a texture in the 3D scene, on purpose:
// the fictional covers are React components, uploaded art is an <img>, and type
// rendered by the browser stays crisp at any size. What makes it read as part of
// the room is that its box comes from the 3D screen — `stage.js` projects that
// screen's corners and hands the rectangle back.

import { memo, useEffect, useMemo, useRef } from 'react';
import Cover from './Cover.jsx';

const ACCENT = 'oklch(0.78 0.16 55)';

// The glow behind the art, as a CSS filter for a given pulse.
const glowFor = (pulse) => `drop-shadow(0 0 ${34 + pulse * 9}px oklch(0.78 0.16 55 / ${0.3 + pulse * 0.07}))`;
// How much the pulse has to move before the glow is redrawn. The same step the
// old React state used, so the glow looks exactly as it did.
const PULSE_STEP = 0.06;

// The cover is memoised so the per-frame `pulse` prop, which only drives the
// glow, never re-renders the artwork underneath it.
const Art = memo(function Art({ coverId, coverSrc, size, bezel }) {
  return (
    <div style={bezel ? { padding: Math.max(2, size * 0.016), background: '#000', border: '1px solid rgba(255,255,255,0.16)' } : undefined}>
      <Cover id={coverId} src={coverSrc} size={size} />
    </div>
  );
});

function StageArt({ rect, coverId, coverSrc, pulse = 0, pulseRef = null, title, artist, bezel = true }) {
  const box = rect || { x: 0, y: 0, w: 0, h: 0 };

  // The glow follows the music without going through React.
  //
  // It used to be a `pulse` prop, set as state from the playback clock, which
  // meant the whole tree above this component re-rendered every time the glow
  // moved — ten or more times a second on anything with a beat. The clock
  // writes the pulse into a ref; this reads it once per animation frame and
  // touches one style property when it has moved enough to matter. Nothing
  // else on the page is involved.
  const glowRef = useRef(null);
  useEffect(() => {
    if (!pulseRef) return undefined;
    let raf = 0;
    let shown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = pulseRef.current || 0;
      if (Math.abs(p - shown) < PULSE_STEP && shown >= 0) return;
      shown = p;
      if (glowRef.current) glowRef.current.style.filter = glowFor(p);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pulseRef]);
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
      ref={glowRef}
      className="absolute z-10 flex flex-col items-center justify-center"
      style={{
        left: box.x, top: box.y, width: box.w, height: box.h,
        pointerEvents: 'none',
        visibility: rect ? 'visible' : 'hidden',
        filter: glowFor(pulseRef ? (pulseRef.current || 0) : pulse),
        transition: 'filter 260ms',
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

export default memo(StageArt);
