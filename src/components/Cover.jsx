// Cover.jsx — 4 fictional album-art covers + dispatcher (ported from proto/covers.jsx)
// All measurements derive from `size` so covers scale cleanly.
// Accepts either an `id` (fictional cover) or a `src` (real image, e.g. from
// FLAC metadata) per CLAUDE_PROMPT.md §7.

function CoverBlueRoom({ size = 320 }) {
  return (
    <div
      className="relative flex flex-col justify-between"
      style={{
        width: size, height: size, padding: size * 0.05,
        background: 'linear-gradient(165deg, #1c3a47 0%, #0e2229 100%)',
      }}
    >
      <div
        className="flex justify-between"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.025, letterSpacing: '0.3em', color: 'oklch(0.85 0.12 55)' }}
      >
        <span>SIDE A</span><span>BLR · 024</span>
      </div>
      <div
        className="absolute"
        style={{
          right: size * 0.12, top: size * 0.22,
          width: size * 0.55, height: size * 0.55, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, oklch(0.82 0.18 55), oklch(0.55 0.18 35))',
          boxShadow: `0 0 ${size * 0.15}px oklch(0.78 0.16 55 / 0.4)`,
        }}
      />
      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: '"Instrument Serif", serif', color: '#f3ecdc', fontSize: size * 0.11, lineHeight: 0.95 }}>blue room</div>
        <div style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', color: '#f3ecdc', fontSize: size * 0.11, lineHeight: 0.95 }}>sessions.</div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.022, letterSpacing: '0.3em', color: 'rgba(243,236,220,0.55)', marginTop: size * 0.025 }}>
          EUNJI HAN · 2024
        </div>
      </div>
    </div>
  );
}

function CoverSymphony({ size = 280 }) {
  return (
    <div className="relative flex flex-col" style={{ width: size, height: size, padding: size * 0.08, background: '#ede4d3', color: '#1a1408' }}>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.028, letterSpacing: '0.3em' }}>DG · 138 815</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: size * 0.22, lineHeight: 0.88, fontWeight: 500 }}>MAHLER</div>
        <div style={{ fontFamily: '"Instrument Serif", serif', fontStyle: 'italic', fontSize: size * 0.085, marginTop: size * 0.02, color: '#5a4a28' }}>Symphony № 2</div>
        <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: size * 0.05, marginTop: size * 0.04, letterSpacing: '0.05em' }}>Resurrection.</div>
      </div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.026, letterSpacing: '0.2em', color: '#5a4a28' }}>
        ABBADO · BERLINER PHIL · 2003
      </div>
    </div>
  );
}

function CoverFuturePresent({ size = 320 }) {
  return (
    <div
      className="relative overflow-hidden flex flex-col justify-between"
      style={{
        width: size, height: size, padding: size * 0.05,
        background: 'radial-gradient(circle at 50% 60%, oklch(0.55 0.22 320) 0%, oklch(0.25 0.18 290) 50%, #0a0420 100%)',
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-90" style={{ transform: 'translateY(30%)' }}>
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI;
          const x2 = 50 + Math.cos(a) * 80;
          const y2 = 50 - Math.sin(a) * 80;
          return <line key={i} x1="50" y1="50" x2={x2} y2={y2} stroke={`oklch(0.78 0.2 ${30 + i * 4})`} strokeWidth="0.35" opacity="0.7" />;
        })}
        <circle cx="50" cy="50" r="14" fill="oklch(0.85 0.18 60)" />
      </svg>
      <div className="relative flex justify-between" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.022, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.7)' }}>
        <span>LP · 087</span><span>STEREO</span>
      </div>
      <div className="relative" style={{ color: '#f8e8b8' }}>
        <div style={{ fontFamily: '"Inter Tight", sans-serif', fontWeight: 800, fontSize: size * 0.13, letterSpacing: '-0.03em', lineHeight: 0.9 }}>FUTURE</div>
        <div style={{ fontFamily: '"Inter Tight", sans-serif', fontStyle: 'italic', fontWeight: 300, fontSize: size * 0.13, letterSpacing: '-0.03em', lineHeight: 0.9 }}>present.</div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.022, letterSpacing: '0.3em', marginTop: size * 0.03, color: 'rgba(255,255,255,0.7)' }}>
          DIM SUN · SIDE B · 2025
        </div>
      </div>
    </div>
  );
}

function CoverNeonShrine({ size = 320 }) {
  return (
    <div className="relative overflow-hidden" style={{ width: size, height: size, background: 'linear-gradient(180deg, #0a0610 0%, #2a0820 60%, oklch(0.45 0.2 320) 100%)' }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="ns-line" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="oklch(0.85 0.18 320)" stopOpacity="0" />
            <stop offset="1" stopColor="oklch(0.85 0.18 320)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <line x1="0" y1="62" x2="100" y2="62" stroke="oklch(0.92 0.16 60)" strokeWidth="0.4" />
        {Array.from({ length: 11 }).map((_, i) => {
          const x = i * 10;
          return <line key={i} x1={x} y1="62" x2={(x - 50) * 6 + 50} y2="100" stroke="url(#ns-line)" strokeWidth="0.3" />;
        })}
        {Array.from({ length: 6 }).map((_, i) => {
          const y = 62 + (i + 1) * (i + 1) * 1.2;
          return <line key={`h${i}`} x1="0" y1={y} x2="100" y2={y} stroke="url(#ns-line)" strokeWidth="0.3" />;
        })}
        <g fill="#0a0610" stroke="oklch(0.85 0.18 60)" strokeWidth="0.5">
          <rect x="34" y="40" width="32" height="3" />
          <rect x="38" y="43" width="24" height="1" />
          <rect x="40" y="43" width="3" height="22" />
          <rect x="57" y="43" width="3" height="22" />
        </g>
        <circle cx="50" cy="36" r="12" fill="oklch(0.92 0.16 60)" opacity="0.85" />
      </svg>
      <div className="absolute top-0 left-0 right-0 flex justify-between p-3" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.022, letterSpacing: '0.3em', color: 'oklch(0.92 0.16 60 / 0.85)' }}>
        <span>NS · 014</span><span>SIDE A</span>
      </div>
      <div className="absolute left-0 right-0 text-center" style={{ bottom: size * 0.04 }}>
        <div style={{ fontFamily: '"Inter Tight", sans-serif', fontWeight: 900, fontSize: size * 0.14, letterSpacing: '-0.04em', color: '#fff8e8', lineHeight: 0.9 }}>NEON</div>
        <div style={{ fontFamily: '"Inter Tight", sans-serif', fontWeight: 200, fontStyle: 'italic', fontSize: size * 0.14, letterSpacing: '-0.04em', color: 'oklch(0.92 0.16 60)', lineHeight: 0.9 }}>shrine.</div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.022, letterSpacing: '0.3em', marginTop: size * 0.02, color: 'rgba(255,255,255,0.7)' }}>
          KASAI · 2026
        </div>
      </div>
    </div>
  );
}

const COVER_MAP = {
  blueRoom: CoverBlueRoom,
  symphony: CoverSymphony,
  future: CoverFuturePresent,
  neon: CoverNeonShrine,
};

export default function Cover({ id, size, src }) {
  // Real uploaded album art (extracted from file metadata) takes precedence.
  if (src) {
    return (
      <img
        src={src}
        alt="album art"
        style={{ width: size, height: size, objectFit: 'cover', display: 'block' }}
      />
    );
  }
  // No id and no src → start screen (no file loaded yet): plain black cover.
  if (!id) {
    return <div style={{ width: size, height: size, background: '#000', display: 'block' }} />;
  }
  const C = COVER_MAP[id] || CoverBlueRoom;
  return <C size={size} />;
}
