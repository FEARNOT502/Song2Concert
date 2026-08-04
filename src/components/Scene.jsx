// Scene.jsx — 6 first-person audience-POV venue scenes. Each is a rich,
// venue-specific stage: club combo, proscenium theatre, vineyard concert hall,
// arena LED wall + sea of crowd, domed stadium, and open night-sky stadium.
//
// The album art + "Title — Artist" caption are mounted INSIDE each venue's
// on-stage screen (the amber-outlined LED rectangle), sized and spaced to sit
// cleanly within it. Coordinates below are in the 1440×760 SVG space; the
// HTML overlay is positioned with the same percentages so it tracks the screen
// under `preserveAspectRatio="xMidYMid slice"`.

import React, { useMemo, useState, useEffect } from 'react';
import Cover from './Cover.jsx';

const ACCENT = 'oklch(0.78 0.16 55)';
const VB_W = 1440;
const VB_H = 760;

// deterministic RNG (matches venue-variants' vvPrng)
function prng(seed) {
  let x = seed;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

// crowd head: body + head, optional raised arms
function Head({ cx, cy, size, arms = 0, fill = '#000' }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={size * 0.7} ry={size * 0.95} fill={fill} />
      <circle cx={cx} cy={cy - size * 0.65} r={size * 0.6} fill={fill} />
      {arms === 1 && (
        <path d={`M ${cx - size * 0.3} ${cy - size * 0.3} L ${cx - size * 0.5} ${cy - size * 1.8}`}
          fill="none" stroke={fill} strokeWidth={size * 0.45} strokeLinecap="round" />
      )}
      {arms === 2 && (
        <>
          <path d={`M ${cx - size * 0.3} ${cy - size * 0.3} L ${cx - size * 0.55} ${cy - size * 1.8}`}
            fill="none" stroke={fill} strokeWidth={size * 0.42} strokeLinecap="round" />
          <path d={`M ${cx + size * 0.3} ${cy - size * 0.3} L ${cx + size * 0.55} ${cy - size * 1.8}`}
            fill="none" stroke={fill} strokeWidth={size * 0.42} strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function dust(count, seed) {
  const rnd = prng(seed);
  return Array.from({ length: count }).map((_, i) => ({
    x: 200 + rnd() * 1040,
    y: 60 + rnd() * 500,
    r: 0.4 + (i % 3) * 0.4,
    o: 0.1 + (i % 4) * 0.06,
  }));
}

function StarField({ count = 60, seed = 1 }) {
  const rnd = prng(seed);
  return Array.from({ length: count }).map((_, i) => {
    const x = rnd() * 1440, y = rnd() * 220;
    const r = 0.4 + rnd() * 1.2;
    return <circle key={i} cx={x} cy={y} r={r} fill="oklch(0.95 0.04 220)" opacity={0.3 + rnd() * 0.6} />;
  });
}

// ── on-screen album art + caption, mounted INSIDE the venue's LED rectangle ──
// `screen` is the rectangle in SVG coords: { x, y, w, h }. The cover is sized to
// fill the screen width (minus padding); the caption sits just below the art but
// inside the rectangle's lower band so the whole "now playing" block reads as
// content ON the stage screen.
function StageArt({ coverId, coverSrc, pulse, title, artist, screen, bezel = true }) {
  // convert the screen rect to overlay percentages
  const left = ((screen.x + screen.w / 2) / VB_W) * 100;
  const top = (screen.y / VB_H) * 100;
  const widthPct = (screen.w / VB_W) * 100;
  const heightPct = (screen.h / VB_H) * 100;

  // The SVG uses preserveAspectRatio="xMidYMid slice", so 1 SVG unit renders at
  // scale = max(vw/1440, vh/760) px. Compute a NUMERIC cover size (the fictional
  // covers do arithmetic on `size`, so it must be a number, not a CSS string).
  const [vp, setVp] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 760,
  }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const scale = Math.max(vp.w / VB_W, vp.h / VB_H);
  // cover fits inside the screen with padding; bounded by both width & height
  const coverPx = Math.max(40, Math.round(Math.min(screen.w * 0.66, screen.h * 0.62) * scale));

  return (
    <div
      className="absolute z-10 flex flex-col items-center justify-center"
      style={{
        left: `${left}%`, top: `${top}%`,
        width: `${widthPct}vw`, height: `${heightPct}vh`,
        transform: 'translate(-50%, 0)',
        pointerEvents: 'none',
        filter: `drop-shadow(0 0 ${36 + pulse * 26}px oklch(0.78 0.16 55 / ${0.3 + pulse * 0.12}))`,
        transition: 'filter 140ms',
      }}
    >
      <div className="text-[9px] tracking-[0.3em] text-[oklch(0.78_0.16_55)] font-mono mb-1.5 opacity-90">▸ NOW PLAYING</div>
      <div style={bezel ? { padding: 5, background: '#000', border: '1px solid rgba(255,255,255,0.14)' } : undefined}>
        <Cover id={coverId} src={coverSrc} size={coverPx} />
      </div>
      {title && (
        <div className="mt-2 w-[112%] text-center">
          <div
            className="text-white font-light leading-tight font-tight truncate"
            style={{ fontSize: 'clamp(11px, 1.25vw, 19px)', textShadow: '0 1px 12px rgba(0,0,0,0.95)' }}
          >
            {title}
          </div>
          {artist && artist !== '—' && (
            <div
              className="text-neutral-300 mt-0.5 tracking-[0.08em] font-tight truncate"
              style={{ fontSize: 'clamp(9px, 0.85vw, 13px)', textShadow: '0 1px 10px rgba(0,0,0,0.95)' }}
            >
              {artist}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SceneShell = ({ children }) => (
  <div className="absolute inset-0 z-0">{children}</div>
);

// Music-reactive crowd phone lights: a sea of phone torches that twinkle with
// the beat. `pulse` (0..1 RMS) drives the swell; each phone has its own phase
// (p.ph) and `now` is a render-time clock so the field shimmers individually.
function PhoneField({ phones, pulse, now }) {
  return phones.map((p, i) => {
    const tw = 0.5 + 0.5 * Math.sin(now * 0.007 + p.ph);
    const lit = Math.min(1, 0.55 + pulse * 0.9 * tw);
    const glow = Math.min(0.55, 0.15 + pulse * 0.6 * tw);
    return (
      <g key={i}>
        <rect x={p.x - p.s / 2} y={p.y} width={p.s} height={p.s * 1.4} fill="oklch(0.97 0.07 90)" opacity={lit} />
        <circle cx={p.x} cy={p.y + 1} r={p.s * (1.8 + pulse * 2.4 * tw)} fill="oklch(0.96 0.07 90)" opacity={glow} />
      </g>
    );
  });
}

// ═══════════════════════════════════════════ 1. CLUB
// No LED wall; the album art mounts on the lit back wall behind the combo.
function SceneClub({ coverId, coverSrc, pulse, title, artist }) {
  const particles = useMemo(() => dust(30, 7), []);
  const now = performance.now();
  return (
    <SceneShell>
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="j2Spot" cx="0.5" cy="0" r="0.7">
            <stop offset="0" stopColor="oklch(0.85 0.16 55)" stopOpacity="0.35" />
            <stop offset="1" stopColor="oklch(0.85 0.16 55)" stopOpacity="0" />
          </radialGradient>
          <pattern id="j2Brick" patternUnits="userSpaceOnUse" width="32" height="14">
            <rect width="32" height="14" fill="#0c0703" />
            <line x1="0" y1="14" x2="32" y2="14" stroke="#1a1208" strokeWidth="0.6" />
            <line x1="16" y1="0" x2="16" y2="14" stroke="#1a1208" strokeWidth="0.6" />
          </pattern>
        </defs>
        <polygon points="0,0 1440,0 1080,260 360,260" fill="#040303" />
        <polygon points="0,0 360,260 360,560 0,760" fill="url(#j2Brick)" />
        <polygon points="1440,0 1080,260 1080,560 1440,760" fill="url(#j2Brick)" />
        <rect x="360" y="260" width="720" height="320" fill="#070504" />
        {/* on-stage screen frame the album art mounts into */}
        <rect x="556" y="286" width="328" height="252" fill="#020108" stroke={ACCENT} strokeWidth="1.4" opacity="0.9" />
        {/* pipe lighting bar — lit cans glow & swell with the music */}
        <rect x="360" y="248" width="720" height="6" fill="#1a1208" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
          const lit = i % 3 === 0;
          const tw = 0.5 + 0.5 * Math.sin(now * 0.005 + i * 0.9);
          return (
          <g key={i}>
            <rect x={400 + i * 92 - 8} y="254" width="16" height="14" fill="#0a0604" stroke="#1a1208" />
            <circle cx={400 + i * 92} cy="266" r={lit ? 4 + pulse * 3 * tw : 4} fill={lit ? ACCENT : '#1a1208'} opacity={lit ? Math.min(1, 0.85 + pulse * 0.15) : 1} />
          </g>
          );
        })}
        <polygon points="660,260 780,260 880,580 560,580" fill="url(#j2Spot)" opacity={0.65 + pulse * 0.35} />
        <polygon points="940,260 1020,260 1060,580 940,580" fill="url(#j2Spot)" opacity={0.4 + pulse * 0.4} />
        <polygon points="420,260 500,260 480,580 380,580" fill="url(#j2Spot)" opacity={0.4 + pulse * 0.4} />
        <polygon points="360,560 1080,560 1080,580 360,580" fill="#1a1208" />
        <line x1="360" y1="560" x2="1080" y2="560" stroke={ACCENT} strokeWidth="1.4" />
        {/* drum kit center-left */}
        <g transform="translate(560 460)">
          <rect x="-90" y="100" width="180" height="14" fill="#0a0604" />
          <ellipse cx="0" cy="80" rx="48" ry="46" fill="#0a0604" stroke="#1a1208" strokeWidth="1.5" />
          <circle cx="0" cy="80" r="34" fill="#04020a" />
          <circle cx="0" cy="80" r="18" fill={ACCENT} opacity="0.18" />
          <line x1="-78" y1="100" x2="-78" y2="30" stroke="#1a1208" strokeWidth="2" />
          <ellipse cx="-78" cy="30" rx="16" ry="3" fill="oklch(0.75 0.12 80)" />
          <ellipse cx="38" cy="62" rx="22" ry="6" fill="#0a0604" stroke="#1a1208" />
          <ellipse cx="-18" cy="36" rx="18" ry="5" fill="#0a0604" stroke="#1a1208" />
          <ellipse cx="18" cy="32" rx="20" ry="5" fill="#0a0604" stroke="#1a1208" />
          <line x1="62" y1="100" x2="76" y2="-2" stroke="#1a1208" strokeWidth="1.6" />
          <ellipse cx="76" cy="-2" rx="26" ry="4" fill="oklch(0.75 0.12 80)" />
          <ellipse cx="0" cy="20" rx="14" ry="22" fill="#000" />
          <circle cx="0" cy="-8" r="11" fill="#000" />
        </g>
        {/* upright bass */}
        <g transform="translate(840 540)">
          <path d="M 0 0 Q -20 30 -20 60 Q -20 100 0 110 Q 20 100 20 60 Q 20 30 0 0 Z" fill="#0a0604" stroke="#1a1208" />
          <rect x="-4" y="-90" width="8" height="90" fill="#0a0604" />
          <ellipse cx="-22" cy="0" rx="12" ry="36" fill="#000" />
          <circle cx="-22" cy="-46" r="11" fill="#000" />
        </g>
        {/* piano */}
        <g transform="translate(280 510)">
          <path d="M 0 60 L -90 0 L 60 0 L 150 60 Z" fill="#04020a" stroke="#1a1208" />
          <rect x="-60" y="60" width="180" height="20" fill="#0a0604" />
          <rect x="-50" y="80" width="160" height="6" fill="#e8e0d0" />
          <ellipse cx="30" cy="80" rx="14" ry="24" fill="#000" />
          <circle cx="30" cy="48" r="11" fill="#000" />
        </g>
        {/* singer */}
        <g>
          <line x1="720" y1="560" x2="720" y2="406" stroke="#1a1208" strokeWidth="2" />
          <ellipse cx="752" cy="428" rx="8" ry="5" fill="#0a0604" stroke="#1a1208" />
          <ellipse cx="720" cy="480" rx="22" ry="52" fill="#000" />
          <circle cx="720" cy="418" r="14" fill="#000" />
        </g>
        {/* tables / heads receding */}
        {Array.from({ length: 4 }).map((_, row) => {
          const y = 610 + row * 38;
          const headSize = 16 + row * 4;
          const cols = 8 + row * 2;
          const margin = 80 - row * 12;
          const spacing = (1440 - margin * 2) / cols;
          const rnd = prng(7 + row * 11);
          return Array.from({ length: cols }).map((_, c) => {
            const cx = margin + spacing * (c + 0.5) + (rnd() - 0.5) * 12;
            return <Head key={`${row}-${c}`} cx={cx} cy={y} size={headSize} />;
          });
        })}
        {Array.from({ length: 18 }).map((_, i) => {
          const x = 60 + (i * 79) % 1380, y = 720 + (i % 3) * 6;
          return <circle key={i} cx={x} cy={y} r="1.6" fill="oklch(0.92 0.18 60)" opacity="0.85" />;
        })}
        {particles.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="oklch(0.85 0.16 55)" opacity={p.o} />)}
      </svg>
      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist}
        screen={{ x: 556, y: 286, w: 328, h: 252 }} />
    </SceneShell>
  );
}

// ═══════════════════════════════════════════ 2. THEATRE
// A proscenium house: the arch frames the stage, drapes hang either side of it,
// and tiers of boxes climb the side walls. What you cannot see is the stage
// house behind the arch, which is most of why this room is drier than the hall.
function SceneTheater({ coverId, coverSrc, pulse, title, artist }) {
  const particles = useMemo(() => dust(34, 23), []);
  const now = performance.now();
  return (
    <SceneShell>
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="thSpot" cx="0.5" cy="0" r="0.62">
            <stop offset="0" stopColor="oklch(0.85 0.16 45)" stopOpacity="0.3" />
            <stop offset="1" stopColor="oklch(0.85 0.16 45)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="thDrape" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a0d0b" />
            <stop offset="1" stopColor="#120504" />
          </linearGradient>
        </defs>
        <polygon points="0,0 1440,0 1040,150 400,150" fill="#040302" />
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={i} x1={400 + i * 128} y1="150" x2={i * 240} y2="0" stroke="#160f0a" strokeWidth="1" />
        ))}
        <polygon points="0,0 400,150 400,520 0,730" fill="#0a0604" />
        <polygon points="1440,0 1040,150 1040,520 1440,730" fill="#0a0604" />

        {/* tiers of boxes up the side walls */}
        {[240, 330, 420].map((y, i) => (
          <g key={i}>
            <rect x="0" y={y} width="400" height="30" fill="#160f0a" />
            <line x1="0" y1={y} x2="400" y2={y} stroke="oklch(0.62 0.11 55)" strokeWidth="0.8" opacity="0.6" />
            {Array.from({ length: 11 }).map((_, k) => <Head key={k} cx={26 + k * 34} cy={y + 13} size={6} />)}
            <rect x="1040" y={y} width="400" height="30" fill="#160f0a" />
            <line x1="1040" y1={y} x2="1440" y2={y} stroke="oklch(0.62 0.11 55)" strokeWidth="0.8" opacity="0.6" />
            {Array.from({ length: 11 }).map((_, k) => <Head key={`r${k}`} cx={1066 + k * 34} cy={y + 13} size={6} />)}
          </g>
        ))}

        {/* the proscenium arch itself, and the drapes it frames */}
        <path d="M 400,150 L 400,520 L 1040,520 L 1040,150 Q 720,96 400,150 Z" fill="#050403" />
        <path d="M 400,150 L 400,520 L 1040,520 L 1040,150 Q 720,96 400,150 Z" fill="none" stroke="oklch(0.72 0.13 55)" strokeWidth="2.5" opacity="0.85" />
        <path d="M 412,158 L 412,512 L 1028,512 L 1028,158 Q 720,108 412,158 Z" fill="none" stroke="oklch(0.6 0.1 55)" strokeWidth="0.8" opacity="0.5" />
        {[0, 1].map((side) => (
          <g key={side}>
            {Array.from({ length: 7 }).map((_, i) => {
              const x = side ? 1028 - i * 22 : 412 + i * 22;
              return <path key={i} d={`M ${x},160 Q ${x + (side ? -9 : 9)},330 ${x},512`} stroke="url(#thDrape)" strokeWidth="20" fill="none" opacity="0.95" />;
            })}
          </g>
        ))}

        <rect x="556" y="200" width="328" height="244" fill="#020108" stroke={ACCENT} strokeWidth="1.4" opacity="0.9" />
        <polygon points="620,150 820,150 890,520 550,520" fill="url(#thSpot)" opacity={0.55 + pulse * 0.5} />

        {/* apron and orchestra pit rail */}
        <polygon points="540,516 900,516 940,534 500,534" fill="#160f0a" />
        <line x1="500" y1="534" x2="940" y2="534" stroke="oklch(0.7 0.12 55)" strokeWidth="1.4" opacity={0.7 + pulse * 0.3} />
        <path d="M 470,556 Q 720,540 970,556" fill="none" stroke="#241708" strokeWidth="10" />

        {/* performers downstage */}
        {[-118, -40, 40, 118].map((dx, i) => (
          <g key={i} opacity={0.9}>
            <ellipse cx={720 + dx} cy={498} rx="7" ry="15" fill="#000" />
            <circle cx={720 + dx} cy={480} r="5.2" fill="#000" />
          </g>
        ))}

        {/* raked stalls */}
        {Array.from({ length: 9 }).map((_, row) => {
          const y = 566 + row * 21 + row * row * 1.0;
          const xMargin = 360 - row * 36;
          const headSize = 6 + row * 1.4;
          const cols = 27 - row * 2;
          const spacing = (1440 - xMargin * 2) / cols;
          return Array.from({ length: cols }).map((_, c) => (
            <Head key={`${row}-${c}`} cx={xMargin + spacing * (c + 0.5)} cy={y} size={headSize} />
          ));
        })}
        {particles.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="oklch(0.85 0.16 50)" opacity={p.o} />)}
        <g opacity={0.5 + pulse * 0.4}>
          {Array.from({ length: 5 }).map((_, i) => {
            const tw = 0.5 + 0.5 * Math.sin(now * 0.004 + i * 1.3);
            return <circle key={i} cx={480 + i * 120} cy={132} r={2 + pulse * 1.6 * tw} fill="oklch(0.86 0.14 55)" />;
          })}
        </g>
      </svg>
      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist}
        screen={{ x: 556, y: 200, w: 328, h: 244 }} />
    </SceneShell>
  );
}

// ═══════════════════════════════════════════ 2b. CONCERT HALL — vineyard
// Terraced blocks of seating step down around a central platform, and the
// audience wraps behind the orchestra as well as in front of it. The panels
// hanging overhead are the hall's reflectors; the low walls bounding each block
// are what give every seat a lateral reflection from a few metres away.
function SceneConcertHall({ coverId, coverSrc, pulse, title, artist }) {
  const particles = useMemo(() => dust(46, 71), []);
  const now = performance.now();
  const terrace = (x, y, w, h, seats, size) => (
    <g>
      <path d={`M ${x},${y + h} L ${x},${y} L ${x + w},${y} L ${x + w},${y + h} Z`} fill="#0d0906" />
      <line x1={x} y1={y} x2={x + w} y2={y} stroke="oklch(0.68 0.11 60)" strokeWidth="1.2" opacity="0.75" />
      {Array.from({ length: seats }).map((_, i) => (
        <Head key={i} cx={x + (w / seats) * (i + 0.5)} cy={y + h * 0.55} size={size} />
      ))}
    </g>
  );
  return (
    <SceneShell>
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="chSpot" cx="0.5" cy="0.1" r="0.62">
            <stop offset="0" stopColor="oklch(0.88 0.13 70)" stopOpacity="0.3" />
            <stop offset="1" stopColor="oklch(0.88 0.13 70)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="1440" height="760" fill="#050403" />

        {/* organ and the rear terrace above the platform */}
        {Array.from({ length: 30 }).map((_, i) => {
          const x = 500 + i * 15;
          const h = 66 + ((i * 11) % 74);
          return <rect key={i} x={x} y={150 - h * 0.4} width="10" height={h + 54} fill="#0e0a06" stroke="#1c1409" strokeWidth="0.5" />;
        })}
        {terrace(470, 232, 500, 34, 16, 6)}

        {/* suspended reflector clouds — a vineyard hall's signature */}
        <g opacity={0.85}>
          {[
            { x: 470, y: 92, w: 210, rot: -6 },
            { x: 700, y: 74, w: 250, rot: 2 },
            { x: 962, y: 96, w: 190, rot: 7 },
          ].map((c, i) => (
            <g key={i} transform={`rotate(${c.rot} ${c.x + c.w / 2} ${c.y})`}>
              <line x1={c.x + c.w * 0.25} y1="0" x2={c.x + c.w * 0.25} y2={c.y} stroke="#2a1e10" strokeWidth="1" />
              <line x1={c.x + c.w * 0.75} y1="0" x2={c.x + c.w * 0.75} y2={c.y} stroke="#2a1e10" strokeWidth="1" />
              <rect x={c.x} y={c.y} width={c.w} height="13" rx="5" fill="#181008" stroke={`oklch(${0.6 + pulse * 0.2} 0.1 60)`} strokeWidth="1" opacity={0.7 + pulse * 0.3} />
            </g>
          ))}
        </g>

        <rect x="556" y="150" width="328" height="244" fill="#020108" stroke={ACCENT} strokeWidth="1.4" opacity="0.9" />
        <polygon points="600,120 840,120 940,470 500,470" fill="url(#chSpot)" opacity={0.55 + pulse * 0.5} />

        {/* the platform, and the orchestra on it */}
        <ellipse cx="720" cy="470" rx="272" ry="48" fill="#0b0806" stroke="oklch(0.66 0.11 58)" strokeWidth="1.2" opacity="0.9" />
        {[
          { r: 214, cy: 480, count: 17 },
          { r: 168, cy: 462, count: 13 },
          { r: 118, cy: 446, count: 9 },
        ].map((row, ri) => Array.from({ length: row.count }).map((_, i) => {
          const t = row.count === 1 ? 0.5 : i / (row.count - 1);
          const angle = Math.PI * (0.12 + t * 0.76);
          const cx = 720 - Math.cos(angle) * row.r;
          const cy = row.cy - Math.sin(angle) * 14;
          return (
            <g key={`p${ri}-${i}`}>
              <ellipse cx={cx} cy={cy} rx="5" ry="9" fill="#000" />
              <circle cx={cx} cy={cy - 8} r="3.5" fill="#000" />
            </g>
          );
        }))}
        {/* conductor */}
        <ellipse cx="720" cy="432" rx="7" ry="14" fill="#000" />
        <circle cx="720" cy="416" r="5" fill="#000" />

        {/* terraced blocks stepping down either side, each with its own low wall */}
        {[
          { x: 0, y: 300, w: 300, h: 46, seats: 9, size: 7 },
          { x: 0, y: 372, w: 350, h: 52, seats: 10, size: 8 },
          { x: 0, y: 452, w: 400, h: 58, seats: 11, size: 9 },
        ].map((t, i) => <g key={`l${i}`}>{terrace(t.x, t.y, t.w, t.h, t.seats, t.size)}</g>)}
        {[
          { x: 1140, y: 300, w: 300, h: 46, seats: 9, size: 7 },
          { x: 1090, y: 372, w: 350, h: 52, seats: 10, size: 8 },
          { x: 1040, y: 452, w: 400, h: 58, seats: 11, size: 9 },
        ].map((t, i) => <g key={`r${i}`}>{terrace(t.x, t.y, t.w, t.h, t.seats, t.size)}</g>)}

        {/* the block we are sitting in, stepping toward us */}
        {Array.from({ length: 7 }).map((_, row) => {
          const y = 552 + row * 24 + row * row * 1.6;
          const xMargin = 300 - row * 42;
          const headSize = 7 + row * 1.5;
          const cols = 22 - row * 2;
          const spacing = (1440 - xMargin * 2) / cols;
          return (
            <g key={row}>
              <line x1={xMargin - 14} y1={y - 13} x2={1440 - xMargin + 14} y2={y - 13} stroke="oklch(0.5 0.08 58)" strokeWidth="0.8" opacity="0.35" />
              {Array.from({ length: cols }).map((_, c) => (
                <Head key={c} cx={xMargin + spacing * (c + 0.5)} cy={y} size={headSize} />
              ))}
            </g>
          );
        })}
        {particles.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="oklch(0.88 0.13 65)" opacity={p.o} />)}
        <g opacity={0.45 + pulse * 0.35}>
          {Array.from({ length: 6 }).map((_, i) => {
            const tw = 0.5 + 0.5 * Math.sin(now * 0.0035 + i * 1.1);
            return <circle key={i} cx={420 + i * 120} cy={44} r={1.8 + pulse * 1.5 * tw} fill="oklch(0.9 0.11 65)" />;
          })}
        </g>
      </svg>
      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist}
        screen={{ x: 556, y: 150, w: 328, h: 244 }} />
    </SceneShell>
  );
}

// ═══════════════════════════════════════════ 3. ARENA — City Arena
function SceneArena({ coverId, coverSrc, pulse, title, artist }) {
  const crowd = useMemo(() => {
    const pts = [];
    const rnd = prng(91);
    for (let row = 0; row < 18; row++) {
      const y = 540 + row * 12 + row * row * 0.5;
      const cols = 50 + row * 3;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols * 1440 + (rnd() - 0.5) * 6;
        const size = 3.6 + row * 0.55;
        const r = rnd();
        const arms = r < 0.06 ? 2 : r < 0.18 ? 1 : 0;
        pts.push({ x, y, size, arms });
      }
    }
    return pts;
  }, []);
  const phones = useMemo(() => {
    const rnd = prng(33);
    return Array.from({ length: 90 }).map(() => ({ x: rnd() * 1440, y: 560 + rnd() * 200, s: 2 + rnd() * 2, ph: rnd() * Math.PI * 2 }));
  }, []);
  const now = performance.now();
  return (
    <SceneShell>
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="a2LED" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.45" /><stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="a2Haze" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.22" /><stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="a2HazeMag" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="oklch(0.7 0.18 320)" stopOpacity="0.22" /><stop offset="1" stopColor="oklch(0.7 0.18 320)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1440" height="50" fill="#020203" />
        <path d="M 0,140 Q 720,80 1440,140 L 1440,200 Q 720,160 0,200 Z" fill="#0a0805" />
        {Array.from({ length: 220 }).map((_, i) => {
          const t = i / 220, x = t * 1440;
          const y = 150 + Math.sin(t * Math.PI) * -32 + (i % 4) * 4;
          return <circle key={i} cx={x} cy={y} r="1.4" fill="#2a2018" />;
        })}
        <rect x="200" y="70" width="1040" height="8" fill="#15110a" />
        {Array.from({ length: 14 }).map((_, i) => {
          const x = 230 + i * 76;
          const on = i % 3 !== 1;
          const hue = i % 4 === 0 ? 320 : 55;
          // overhead PA lights pump with the beat, each on its own phase
          const sway = 0.5 + 0.5 * Math.sin(now * 0.005 + i * 0.9);
          const lampR = 6 + (on ? pulse * 5 * sway : 0);
          return (
            <g key={i}>
              <rect x={x - 8} y="78" width="16" height="18" fill="#0a0604" stroke="#1a1208" />
              <circle cx={x} cy="100" r={lampR} fill={on ? `oklch(${0.78 + pulse * 0.12} 0.18 ${hue})` : '#1a1208'} />
              {on && <polygon points={`${x - 8},105 ${x + 8},105 ${x + 80},540 ${x - 80},540`} fill={`oklch(0.8 0.18 ${hue})`} opacity={0.05 + pulse * 0.22 * sway} />}
            </g>
          );
        })}
        {[230, 1210].map((cx, i) => (
          <g key={i}>
            <line x1={cx} y1="78" x2={cx} y2="130" stroke="#3a2a14" strokeWidth="0.8" />
            {Array.from({ length: 7 }).map((_, k) => (
              <polygon key={k} points={`${cx - 20},${130 + k * 22} ${cx + 20},${130 + k * 22} ${cx + 24},${152 + k * 22} ${cx - 24},${152 + k * 22}`} fill="#0a0604" stroke="#1a1208" />
            ))}
          </g>
        ))}
        <polygon points="280,90 380,90 640,540 540,540" fill="url(#a2Haze)" opacity={0.4 + pulse * 0.5} />
        <polygon points="1060,90 1160,90 900,540 800,540" fill="url(#a2Haze)" opacity={0.4 + pulse * 0.5} />
        <polygon points="720,90 840,90 800,540 740,540" fill="url(#a2HazeMag)" opacity={0.45 + pulse * 0.5} />
        {/* main LED wall — album art mounts here */}
        <rect x="280" y="180" width="880" height="300" fill="#020108" stroke={ACCENT} strokeWidth="2" />
        {Array.from({ length: 80 }).map((_, i) => {
          const x = 290 + (i % 40) * 22, y = 190 + Math.floor(i / 40) * 20;
          return <rect key={i} x={x} y={y} width="1.2" height="1.2" fill="oklch(0.7 0.16 55)" opacity={0.25 + (i % 5) * 0.06} />;
        })}
        <rect x="280" y="180" width="880" height="300" fill="url(#a2LED)" opacity={0.55 + pulse * 0.45} />
        {/* side LED wings — panels flicker with the beat */}
        {[180, 1220].map((x, i) => (
          <g key={i}>
            <rect x={x - 50} y="220" width="100" height="260" fill="#020108" stroke={ACCENT} strokeWidth="1.4" />
            {Array.from({ length: 26 }).map((_, k) => {
              const sway = 0.5 + 0.5 * Math.sin(now * 0.006 + k * 1.3 + i * 2);
              return <rect key={k} x={x - 44 + (k % 4) * 22} y={230 + Math.floor(k / 4) * 38} width="14" height="14" fill={`oklch(${0.6 + pulse * 0.18} 0.17 ${55 + (k % 4) * 60})`} opacity={Math.min(1, (0.4 + (k % 3) * 0.15) * (0.6 + pulse * 0.9 * sway))} />;
            })}
          </g>
        ))}
        <polygon points="280,495 1160,495 1240,540 200,540" fill="#0a0604" />
        <line x1="280" y1="495" x2="1160" y2="495" stroke={ACCENT} strokeWidth="2" />
        {Array.from({ length: 30 }).map((_, i) => <circle key={i} cx={290 + i * 30} cy="498" r="2" fill="oklch(0.92 0.18 60)" />)}
        <g transform="translate(720 430)">
          <rect x="-90" y="40" width="180" height="60" fill="#0a0604" />
          <ellipse cx="0" cy="40" rx="40" ry="36" fill="#0a0604" stroke="#1a1208" />
          <circle cx="0" cy="40" r="14" fill={ACCENT} opacity="0.25" />
          <ellipse cx="0" cy="-10" rx="12" ry="18" fill="#000" />
          <circle cx="0" cy="-32" r="9" fill="#000" />
        </g>
        {[360, 1080].map((x, i) => (
          <g key={i}>
            {[0, 1].map(k => (
              <g key={k} transform={`translate(${x + k * 80} 0)`}>
                <rect x="-30" y="400" width="60" height="50" fill="#0a0604" stroke="#1a1208" />
                <rect x="-30" y="450" width="60" height="44" fill="#0a0604" stroke="#1a1208" />
              </g>
            ))}
          </g>
        ))}
        <g transform="translate(720 460)">
          <line x1="0" y1="40" x2="0" y2="-30" stroke="#1a1208" strokeWidth="2" />
          <ellipse cx="0" cy="14" rx="18" ry="44" fill="#000" />
          <circle cx="0" cy="-22" r="13" fill="#000" />
          <path d="M 16 0 L 32 -50" stroke="#000" strokeWidth="8" strokeLinecap="round" />
        </g>
        <line x1="60" y1="100" x2="700" y2="540" stroke="oklch(0.78 0.16 320)" strokeWidth="1" opacity="0.5" />
        <line x1="1380" y1="100" x2="740" y2="540" stroke="oklch(0.78 0.16 320)" strokeWidth="1" opacity="0.5" />
        {crowd.map((p, i) => <Head key={i} cx={p.x} cy={p.y} size={p.size} arms={p.arms} />)}
        <PhoneField phones={phones} pulse={pulse} now={now} />
      </svg>
      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist}
        screen={{ x: 280, y: 180, w: 880, h: 300 }} />
    </SceneShell>
  );
}

// ═══════════════════════════════════════════ 4. DOMED STADIUM — Grand Dome
function SceneDome({ coverId, coverSrc, pulse, title, artist }) {
  const crowd = useMemo(() => {
    const pts = [];
    const rnd = prng(55);
    for (let row = 0; row < 24; row++) {
      const y = 470 + row * 10 + row * row * 0.45;
      const cols = 64 + row * 3;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols * 1440 + (rnd() - 0.5) * 4;
        const size = 2.8 + row * 0.45;
        const r = rnd();
        if (row < 6 && x > 620 && x < 820) continue;
        const arms = r < 0.05 ? 2 : r < 0.15 ? 1 : 0;
        pts.push({ x, y, size, arms });
      }
    }
    return pts;
  }, []);
  const sticks = useMemo(() => {
    const rnd = prng(77);
    return Array.from({ length: 140 }).map(() => ({ x: rnd() * 1440, y: 480 + rnd() * 260, hue: rnd() < 0.5 ? 320 : (rnd() < 0.5 ? 55 : 220), o: 0.5 + rnd() * 0.4, ph: rnd() * Math.PI * 2 }));
  }, []);
  // render-time clock for the lightstick shimmer; advances every frame while
  // playing (pulse drives re-renders). Paused → pulse 0 → reactive terms vanish.
  const now = performance.now();
  return (
    <SceneShell>
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="d2Sky" cx="0.5" cy="1" r="1">
            <stop offset="0" stopColor="#1a1a22" stopOpacity="0.9" /><stop offset="1" stopColor="#04040a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="d2Haze" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="oklch(0.7 0.14 55)" stopOpacity="0.2" /><stop offset="1" stopColor="oklch(0.7 0.14 55)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M -200,500 Q 720,-100 1640,500 L 1640,-50 L -200,-50 Z" fill="#06060a" />
        {Array.from({ length: 9 }).map((_, i) => (
          <path key={i} d={`M -200,${500 - i * 30} Q 720,${-100 - i * 70} 1640,${500 - i * 30}`} fill="none" stroke="rgba(180,180,200,0.06)" strokeWidth="0.7" />
        ))}
        <ellipse cx="720" cy="70" rx="220" ry="14" fill="oklch(0.85 0.04 220 / 0.16)" />
        <rect x="0" y="0" width="1440" height="500" fill="url(#d2Sky)" opacity="0.4" />
        <ellipse cx="720" cy="120" rx="500" ry="36" fill="none" stroke="#1a1a22" strokeWidth="1.4" />
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i / 36) * Math.PI * 2;
          const x = 720 + Math.cos(a) * 500, y = 120 + Math.sin(a) * 36;
          if (y > 122) return null;
          const hue = i % 3 === 0 ? 320 : (i % 3 === 1 ? 55 : 220);
          // each beam fixture brightens with the music, on its own phase so the
          // rig "dances" rather than flashing in unison
          const sway = 0.5 + 0.5 * Math.sin(now * 0.005 + i * 0.7);
          const lampR = 3 + pulse * 4 * sway;
          const beamO = 0.04 + pulse * 0.16 * sway;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={lampR} fill={`oklch(0.82 0.18 ${hue})`} opacity={Math.min(1, 0.7 + pulse * 0.3)} />
              <polygon points={`${x - 3},${y + 4} ${x + 3},${y + 4} ${x + 80},480 ${x - 80},480`} fill={`oklch(0.8 0.18 ${hue})`} opacity={beamO} />
            </g>
          );
        })}
        <polygon points="200,140 320,140 720,480 600,480" fill="url(#d2Haze)" opacity={0.5 + pulse * 0.4} />
        <polygon points="1240,140 1120,140 720,480 840,480" fill="url(#d2Haze)" opacity={0.5 + pulse * 0.4} />
        <line x1="720" y1="120" x2="720" y2="180" stroke="#3a3a48" strokeWidth="1.6" />
        {/* center LED — album art mounts here */}
        <rect x="540" y="180" width="360" height="220" fill="#020108" stroke={ACCENT} strokeWidth="1.6" />
        {Array.from({ length: 80 }).map((_, i) => {
          const x = 545 + (i % 40) * 9, y = 185 + Math.floor(i / 40) * 12;
          return <rect key={i} x={x} y={y} width="1" height="1" fill="oklch(0.7 0.16 55)" opacity={0.3 + (i % 5) * 0.06} />;
        })}
        {[200, 1240].map((x, i) => (
          <g key={i}>
            <rect x={x - 70} y="200" width="140" height="240" fill="#020108" stroke={ACCENT} strokeWidth="1.2" />
            {Array.from({ length: 36 }).map((_, k) => {
              const hue = 55 + (k % 5) * 60;
              return <rect key={k} x={x - 60 + (k % 6) * 22} y={210 + Math.floor(k / 6) * 38} width="14" height="14" fill={`oklch(0.65 0.16 ${hue})`} opacity={0.4 + (k % 3) * 0.15} />;
            })}
          </g>
        ))}
        <polygon points="460,450 980,450 1020,490 420,490" fill="#0a0604" />
        <line x1="460" y1="450" x2="980" y2="450" stroke={ACCENT} strokeWidth="1.4" />
        <polygon points="650,490 790,490 810,580 630,580" fill="#0a0604" />
        <ellipse cx="720" cy="600" rx="40" ry="14" fill="#0a0604" stroke={ACCENT} strokeWidth="1.2" />
        {[500, 560, 620, 820, 880, 940].map((x, i) => (
          <g key={i}><ellipse cx={x} cy={460} rx="6" ry="14" fill="#000" /><circle cx={x} cy={442} r="5" fill="#000" /></g>
        ))}
        <g transform="translate(720 596)">
          <ellipse cx="0" cy="-4" rx="6" ry="12" fill="#000" />
          <circle cx="0" cy="-20" r="5" fill="#000" />
          <path d="M 5 -10 L 14 -28" stroke="#000" strokeWidth="3" strokeLinecap="round" />
        </g>
        <rect x="0" y="400" width="380" height="80" fill="#06060a" />
        <rect x="1060" y="400" width="380" height="80" fill="#06060a" />
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 28 }).map((_, c) => (
            <g key={`ul-${row}-${c}`}>
              <Head cx={10 + c * 14} cy={415 + row * 12} size={2.4} />
              <Head cx={1066 + c * 14} cy={415 + row * 12} size={2.4} />
            </g>
          ))
        )}
        {crowd.map((p, i) => <Head key={i} cx={p.x} cy={p.y} size={p.size} arms={p.arms} />)}
        {sticks.map((s, i) => {
          // music-reactive lightstick: brightness + glow swell with the beat,
          // each stick on its own phase so the sea of light shimmers (not a
          // single uniform on/off). `pulse` (0..1, RMS) is the audio drive.
          const beat = 0.55 + 0.45 * Math.sin(now * 0.006 + s.ph); // per-stick shimmer
          const lit = s.o * (0.45 + pulse * 1.1 * beat);
          const r = 3.5 + pulse * 5 * beat;
          return (
            <g key={i}>
              <rect x={s.x} y={s.y} width="1.2" height={3 + pulse * 2} fill={`oklch(0.9 0.2 ${s.hue})`} opacity={Math.min(1, lit)} />
              <circle cx={s.x + 0.6} cy={s.y} r={r} fill={`oklch(0.88 0.2 ${s.hue})`} opacity={Math.min(0.6, lit * 0.4)} />
            </g>
          );
        })}
      </svg>
      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist}
        screen={{ x: 540, y: 180, w: 360, h: 220 }} />
    </SceneShell>
  );
}

// ═══════════════════════════════════════════ 5. OPEN STADIUM — Mega Stadium
function SceneStadium({ coverId, coverSrc, pulse, title, artist }) {
  const crowd = useMemo(() => {
    const pts = [];
    const rnd = prng(177);
    for (let row = 0; row < 20; row++) {
      const y = 500 + row * 12 + row * row * 0.45;
      const cols = 56 + row * 3;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols * 1440 + (rnd() - 0.5) * 4;
        const size = 3.2 + row * 0.5;
        const r = rnd();
        const arms = r < 0.05 ? 2 : r < 0.18 ? 1 : 0;
        pts.push({ x, y, size, arms });
      }
    }
    return pts;
  }, []);
  const phones = useMemo(() => {
    const rnd = prng(199);
    return Array.from({ length: 200 }).map(() => ({ x: rnd() * 1440, y: 520 + rnd() * 220, s: 1.6 + rnd() * 2, ph: rnd() * Math.PI * 2 }));
  }, []);
  const now = performance.now();
  return (
    <SceneShell>
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="s2Sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#04041a" /><stop offset="0.6" stopColor="#1a0820" /><stop offset="1" stopColor="#2a1014" />
          </linearGradient>
          <radialGradient id="s2LED" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.45" /><stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="s2Haze" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.24" /><stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="s2HazeMag" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="oklch(0.7 0.18 320)" stopOpacity="0.22" /><stop offset="1" stopColor="oklch(0.7 0.18 320)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1440" height="300" fill="url(#s2Sky)" />
        <StarField count={100} seed={31} />
        <ellipse cx="220" cy="100" rx="200" ry="22" fill="#1a0a1a" opacity="0.6" />
        <ellipse cx="1100" cy="60" rx="240" ry="18" fill="#1a0a1a" opacity="0.5" />
        <circle cx="1140" cy="100" r="18" fill="oklch(0.92 0.06 80)" opacity="0.6" />
        {/* CITY SKYLINE */}
        <g fill="#04020a">
          <rect x="0" y="220" width="40" height="80" /><rect x="40" y="250" width="60" height="50" />
          <rect x="100" y="200" width="50" height="100" /><rect x="150" y="260" width="80" height="40" />
          <rect x="230" y="230" width="30" height="70" /><rect x="260" y="270" width="80" height="30" />
          <rect x="1100" y="240" width="60" height="60" /><rect x="1160" y="180" width="40" height="120" />
          <rect x="1200" y="220" width="80" height="80" /><rect x="1280" y="260" width="60" height="40" />
          <rect x="1340" y="200" width="50" height="100" /><rect x="1390" y="240" width="50" height="60" />
        </g>
        {Array.from({ length: 60 }).map((_, i) => {
          const x = (i * 23) % 1440;
          const ok = x < 340 || x > 1100;
          if (!ok) return null;
          const y = 220 + (i % 7) * 14;
          return <rect key={i} x={x} y={y} width="1.4" height="1.4" fill="oklch(0.92 0.12 80)" opacity="0.7" />;
        })}
        <path d="M 0,300 Q 720,260 1440,300 L 1440,360 Q 720,320 0,360 Z" fill="#06060a" />
        {Array.from({ length: 180 }).map((_, i) => {
          const t = i / 180, x = t * 1440;
          const y = 308 + Math.sin(t * Math.PI) * -28 + (i % 4) * 4;
          return <circle key={i} cx={x} cy={y} r="1.2" fill="#2a2018" />;
        })}
        {/* 4 light towers — each rig's beam haze + lamp glow pulses with music */}
        {[140, 540, 900, 1300].map((x, i) => {
          const sway = 0.5 + 0.5 * Math.sin(now * 0.0045 + i * 1.6);
          return (
          <g key={i}>
            <line x1={x} y1="700" x2={x} y2="140" stroke="#1a1a22" strokeWidth="3" />
            <polygon points={`${x - 28},120 ${x + 28},120 ${x + 36},170 ${x - 36},170`} fill="#0a0a14" stroke="#1a1a22" />
            {Array.from({ length: 12 }).map((_, k) => {
              const dx = (k % 4) * 14 - 21, dy = Math.floor(k / 4) * 12 + 130;
              const on = k % 2 === 0;
              return <circle key={k} cx={x + dx} cy={dy} r={on ? 2 + pulse * 2.4 * sway : 2} fill={on ? `oklch(${0.92 + pulse * 0.08} 0.18 80)` : '#1a1a22'} opacity={on ? 0.95 : 1} />;
            })}
            <polygon points={`${x - 30},170 ${x + 30},170 ${x + 70},500 ${x - 70},500`} fill="url(#s2Haze)" opacity={0.3 + pulse * 0.5 * sway} />
          </g>
          );
        })}
        {/* center main stage LED — album art mounts here */}
        <rect x="380" y="220" width="680" height="240" fill="#020108" stroke={ACCENT} strokeWidth="2.4" />
        {Array.from({ length: 100 }).map((_, i) => {
          const x = 390 + (i % 40) * 17, y = 230 + Math.floor(i / 40) * 16;
          return <rect key={i} x={x} y={y} width="1.4" height="1.4" fill="oklch(0.7 0.16 55)" opacity={0.3 + (i % 5) * 0.06} />;
        })}
        <rect x="380" y="220" width="680" height="240" fill="url(#s2LED)" opacity={0.55 + pulse * 0.45} />
        {/* side LED wings (delay screens) — flicker with the beat */}
        {[260, 1180].map((x, i) => (
          <g key={i}>
            <rect x={x - 60} y="240" width="120" height="200" fill="#020108" stroke={ACCENT} strokeWidth="1.4" />
            {Array.from({ length: 30 }).map((_, k) => {
              const sway = 0.5 + 0.5 * Math.sin(now * 0.006 + k * 1.1 + i * 2);
              return <rect key={k} x={x - 54 + (k % 5) * 22} y={250 + Math.floor(k / 5) * 32} width="14" height="14" fill={`oklch(${0.6 + pulse * 0.18} 0.17 ${55 + (k % 4) * 60})`} opacity={Math.min(1, (0.4 + (k % 3) * 0.15) * (0.6 + pulse * 0.9 * sway))} />;
            })}
          </g>
        ))}
        {/* PA delay towers */}
        {[300, 1140].map((x, i) => (
          <g key={i}>
            {Array.from({ length: 6 }).map((_, k) => (
              <polygon key={k} points={`${x - 14},${320 + k * 18} ${x + 14},${320 + k * 18} ${x + 18},${338 + k * 18} ${x - 18},${338 + k * 18}`}
                fill="#0a0604" stroke="#1a1208" />
            ))}
          </g>
        ))}
        <polygon points="240,200 360,200 580,500 460,500" fill="url(#s2HazeMag)" opacity={0.4 + pulse * 0.5} />
        <polygon points="1080,200 1200,200 980,500 860,500" fill="url(#s2HazeMag)" opacity={0.4 + pulse * 0.5} />
        <polygon points="280,460 1160,460 1240,500 200,500" fill="#0a0604" />
        <line x1="280" y1="460" x2="1160" y2="460" stroke={ACCENT} strokeWidth="2" />
        {Array.from({ length: 32 }).map((_, i) => <circle key={i} cx={300 + i * 28} cy="463" r="2" fill="oklch(0.92 0.18 60)" />)}
        <g transform="translate(720 420)">
          <rect x="-60" y="20" width="120" height="34" fill="#0a0604" />
          <ellipse cx="0" cy="20" rx="24" ry="22" fill="#0a0604" stroke="#1a1208" />
        </g>
        {[460, 540, 620, 820, 900, 980].map((x, i) => (
          <g key={i}><ellipse cx={x} cy={430} rx="6" ry="14" fill="#000" /><circle cx={x} cy={412} r="5" fill="#000" /></g>
        ))}
        <g transform="translate(720 440)">
          <line x1="0" y1="20" x2="0" y2="-30" stroke="#1a1208" strokeWidth="2" />
          <ellipse cx="0" cy="0" rx="10" ry="22" fill="#000" />
          <circle cx="0" cy="-22" r="8" fill="#000" />
          <path d="M 9 -10 L 22 -38" stroke="#000" strokeWidth="6" strokeLinecap="round" />
        </g>
        {crowd.map((p, i) => <Head key={i} cx={p.x} cy={p.y} size={p.size} arms={p.arms} />)}
        <PhoneField phones={phones} pulse={pulse} now={now} />
      </svg>
      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist}
        screen={{ x: 380, y: 220, w: 680, h: 240 }} />
    </SceneShell>
  );
}

const SCENE_MAP = {
  club: SceneClub,
  theater: SceneTheater,
  concerthall: SceneConcertHall,
  arena: SceneArena,
  dome: SceneDome,
  stadium: SceneStadium,
};

export default function Scene({ venueId, coverId, coverSrc, pulse, title, artist }) {
  const C = SCENE_MAP[venueId] || SceneClub;
  return <C coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist} />;
}
