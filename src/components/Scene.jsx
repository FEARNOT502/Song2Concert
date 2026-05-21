// Scene.jsx — 6 first-person audience-POV venue scenes built to read like REAL
// concert stages: a raised stage deck, line-array PA stacks flanking it, an
// overhead lighting truss with moving-head fixtures + beams, an LED video wall
// behind the band, band silhouettes with instruments, haze, and an audience
// field that grows with venue size. Album art sits on the video wall / screen.
//
// Shared building blocks (Truss, LineArray, Beams, Band, …) keep the five
// venues consistent while each gets its own architecture + scale.

import React, { useMemo } from 'react';
import Cover from './Cover.jsx';

const ACCENT = 'oklch(0.78 0.16 55)';

// deterministic RNG for stable scatter
function rng(seed) {
  let x = seed;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

// ── shared stage furniture ───────────────────────────────────────────────

// overhead lighting truss spanning x1..x2 at height y, with hanging fixtures
function Truss({ x1, x2, y, fixtures = 9, color = '#15161e' }) {
  const w = x2 - x1;
  return (
    <g>
      <rect x={x1} y={y} width={w} height="10" fill={color} stroke="#26283a" strokeWidth="0.6" />
      {/* lattice diagonals */}
      {Array.from({ length: Math.floor(w / 24) }).map((_, i) => (
        <line key={i} x1={x1 + i * 24} y1={y} x2={x1 + i * 24 + 24} y2={y + 10} stroke="#2a2c3e" strokeWidth="0.5" opacity="0.7" />
      ))}
      {/* hung moving-head fixtures */}
      {Array.from({ length: fixtures }).map((_, i) => {
        const fx = x1 + ((i + 0.5) / fixtures) * w;
        return (
          <g key={`f${i}`}>
            <line x1={fx} y1={y + 10} x2={fx} y2={y + 16} stroke="#2a2c3e" strokeWidth="1.2" />
            <rect x={fx - 4} y={y + 16} width="8" height="9" rx="1.5" fill="#0c0d14" stroke="#2a2c3e" strokeWidth="0.6" />
            <circle cx={fx} cy={y + 25} r="1.6" fill={ACCENT} opacity="0.85" />
          </g>
        );
      })}
    </g>
  );
}

// a flown line-array PA hang (the curved column of speaker boxes)
function LineArray({ x, yTop, boxes = 7, w = 30, curve = 10 }) {
  return (
    <g>
      <line x1={x} y1={yTop - 14} x2={x} y2={yTop} stroke="#2a2c3e" strokeWidth="1.4" />
      {Array.from({ length: boxes }).map((_, i) => {
        const bw = w - i * (curve * 0.15);
        const by = yTop + i * 15;
        const skew = (i / boxes) * curve;
        return (
          <g key={i}>
            <rect x={x - bw / 2 + skew} y={by} width={bw} height="13" rx="1.5" fill="#0a0b12" stroke="#23252f" strokeWidth="0.6" />
            <circle cx={x - bw / 4 + skew} cy={by + 6.5} r="3" fill="#16171f" />
            <circle cx={x + bw / 4 + skew} cy={by + 6.5} r="3" fill="#16171f" />
          </g>
        );
      })}
    </g>
  );
}

// moving-head light beams fanning down from the truss to the stage
function Beams({ originY, spread = 1, count = 6, cx = 720, len = 360, hue = 55, op = 0.14 }) {
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const ox = cx + (t - 0.5) * 520 * spread;
        const tx = cx + (t - 0.5) * 220 * spread;
        return (
          <polygon
            key={i}
            points={`${ox - 8},${originY} ${ox + 8},${originY} ${tx + 26},${originY + len} ${tx - 26},${originY + len}`}
            fill={`oklch(0.82 0.16 ${hue})`}
            opacity={op}
          />
        );
      })}
    </g>
  );
}

// band silhouettes with instruments on the deck
function Band({ y, scale = 1, members = 'full' }) {
  const s = scale;
  const fig = (cx, cy, h = 26) => (
    <g>
      <ellipse cx={cx} cy={cy} rx={5 * s} ry={h * 0.4 * s} fill="#000" />
      <rect x={cx - 4 * s} y={cy - h * s} width={8 * s} height={h * s} rx={3 * s} fill="#000" />
      <circle cx={cx} cy={cy - h * s} r={4.5 * s} fill="#000" />
    </g>
  );
  return (
    <g>
      {/* lead vocalist center + mic stand */}
      <line x1={720} y1={y} x2={720} y2={y - 34 * s} stroke="#000" strokeWidth={1.6 * s} />
      <circle cx={720} cy={y - 35 * s} r={2.6 * s} fill="#000" />
      {fig(720, y, 30)}
      {/* guitarists flanking */}
      {fig(640, y + 2, 27)}
      <line x1={628} y1={y - 4 * s} x2={660} y2={y + 12 * s} stroke="#000" strokeWidth={2 * s} />
      {fig(806, y + 2, 27)}
      <line x1={792} y1={y - 4 * s} x2={822} y2={y + 12 * s} stroke="#000" strokeWidth={2 * s} />
      {/* drum riser behind */}
      {members === 'full' && (
        <g>
          <rect x={690} y={y - 30 * s} width={60 * s} height={14 * s} fill="#05050a" opacity="0.8" />
          <circle cx={706} cy={y - 34 * s} r={8 * s} fill="#000" stroke="#1a1a22" strokeWidth="0.6" />
          <circle cx={734} cy={y - 34 * s} r={8 * s} fill="#000" stroke="#1a1a22" strokeWidth="0.6" />
          {fig(720, y - 30 * s, 18)}
        </g>
      )}
    </g>
  );
}

// scattered audience field; rows recede upward, heads shrink
function Crowd({ rows, baseY, rowGap, colsBase, colGrow, sizeBase, sizeGrow, seed = 7, phones = 0 }) {
  const pts = useMemo(() => {
    const out = [];
    const r = rng(seed);
    for (let row = 0; row < rows; row++) {
      const y = baseY + row * rowGap + row * row * 0.5;
      const cols = colsBase + row * colGrow;
      for (let c = 0; c < cols; c++) {
        const x = ((c + 0.5) / cols) * 1440 + (r() - 0.5) * 10;
        out.push({ x, y, size: sizeBase + row * sizeGrow });
      }
    }
    return out;
  }, [rows, baseY, rowGap, colsBase, colGrow, sizeBase, sizeGrow, seed]);
  const ph = useMemo(() => {
    const r = rng(seed + 99);
    return Array.from({ length: phones }).map(() => ({ x: r() * 1440, y: baseY - 10 + r() * (rows * rowGap) }));
  }, [phones, seed, baseY, rows, rowGap]);
  return (
    <g>
      {pts.map((p, i) => (
        <g key={i}>
          <ellipse cx={p.x} cy={p.y} rx={p.size * 0.7} ry={p.size * 0.85} fill="#000" />
          <circle cx={p.x} cy={p.y - p.size * 0.5} r={p.size * 0.55} fill="#000" />
        </g>
      ))}
      {ph.map((p, i) => (
        <rect key={`p${i}`} x={p.x} y={p.y} width="2" height="3" fill="oklch(0.92 0.08 90)" opacity={0.4 + (i % 3) * 0.15} />
      ))}
    </g>
  );
}

const NowPlaying = ({ label = '▸ NOW PLAYING' }) => (
  <div className="absolute -top-4 left-0 text-[11px] tracking-[0.3em] text-[oklch(0.78_0.16_55)] font-mono">{label}</div>
);

// "Title — Artist" caption under the album art on stage
function StageCaption({ title, artist }) {
  if (!title) return null;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-4 w-[150%] text-center pointer-events-none">
      <div className="text-white text-[20px] font-light leading-tight font-tight truncate" style={{ textShadow: '0 1px 12px rgba(0,0,0,0.95)' }}>{title}</div>
      {artist && artist !== '—' && (
        <div className="text-neutral-300 text-[13px] mt-1 tracking-[0.08em] font-tight truncate" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.95)' }}>{artist}</div>
      )}
    </div>
  );
}

// wrapper that places the album art (the LED-wall content) + caption + glow
function StageArt({ coverId, coverSrc, pulse, size, top, glow = 0.32, label, title, artist, screen = true }) {
  return (
    <div
      className="absolute z-10"
      style={{
        left: '50%', top, transform: 'translateX(-50%)',
        filter: `drop-shadow(0 0 ${50 + pulse * 30}px oklch(0.78 0.16 55 / ${glow + pulse * 0.12}))`,
        transition: 'filter 120ms',
      }}
    >
      {/* a thin bezel so the art reads as an on-stage LED screen */}
      <div style={screen ? { padding: 6, background: '#000', border: '1px solid rgba(255,255,255,0.12)' } : undefined}>
        <Cover id={coverId} src={coverSrc} size={size} />
      </div>
      {label && <NowPlaying label={label} />}
      <StageCaption title={title} artist={artist} />
    </div>
  );
}

// ───────────────────────────────────────── 1. JAZZ CLUB
function SceneJazz({ coverId, coverSrc, pulse, title, artist }) {
  return (
    <div className="absolute inset-0 z-0">
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="jzSpot" cx="0.5" cy="0" r="0.7">
            <stop offset="0" stopColor="oklch(0.85 0.16 55)" stopOpacity="0.32" />
            <stop offset="1" stopColor="oklch(0.85 0.16 55)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="jzFloor" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1a1208" /><stop offset="1" stopColor="#000" />
          </linearGradient>
          <pattern id="jzBrick" patternUnits="userSpaceOnUse" width="32" height="14">
            <rect width="32" height="14" fill="#0c0703" />
            <line x1="0" y1="14" x2="32" y2="14" stroke="#1a1208" strokeWidth="0.6" />
            <line x1="16" y1="0" x2="16" y2="14" stroke="#1a1208" strokeWidth="0.6" />
          </pattern>
        </defs>

        {/* low room — brick side walls, dark back wall */}
        <polygon points="0,0 1440,0 1080,250 360,250" fill="#040303" />
        <polygon points="0,0 360,250 360,560 0,760" fill="url(#jzBrick)" />
        <polygon points="1440,0 1080,250 1080,560 1440,760" fill="url(#jzBrick)" />
        <rect x="360" y="250" width="720" height="320" fill="#070504" />
        <polygon points="360,560 1080,560 1440,760 0,760" fill="url(#jzFloor)" />

        {/* small overhead bar of warm cans */}
        <Truss x1={470} x2={970} y={120} fixtures={6} color="#120c06" />
        {/* tight warm spots onto the stage */}
        <polygon points="620,150 760,150 850,540 560,540" fill="url(#jzSpot)" />
        <polygon points="500,150 580,150 470,540 410,540" fill="url(#jzSpot)" opacity="0.5" />
        <polygon points="880,150 960,150 1010,540 920,540" fill="url(#jzSpot)" opacity="0.5" />

        {/* raised stage deck */}
        <polygon points="430,548 1010,548 1070,580 370,580" fill="#0d0a06" />
        <line x1="430" y1="548" x2="1010" y2="548" stroke={ACCENT} strokeWidth="1.4" opacity="0.85" />

        {/* small PA cabinets on stands (club PA, not line array) */}
        {[[ 470, 470 ], [ 970, 470 ]].map(([x, y], i) => (
          <g key={i}>
            <line x1={x} y1={y + 40} x2={x} y2={y + 78} stroke="#1a1208" strokeWidth="3" />
            <rect x={x - 16} y={y} width="32" height="44" rx="2" fill="#0a0806" stroke="#241a0e" />
            <circle cx={x} cy={y + 16} r="9" fill="#16110a" />
            <circle cx={x} cy={y + 33} r="5" fill="#16110a" />
          </g>
        ))}

        {/* jazz combo: upright bass, grand piano, drums, mic */}
        <ellipse cx="500" cy="500" rx="20" ry="46" fill="#000" />
        <rect x="496" y="420" width="7" height="86" fill="#000" />
        <rect x="850" y="492" width="150" height="12" fill="#000" />
        <rect x="858" y="504" width="134" height="44" fill="#0a0604" />
        <Band y={520} scale={0.8} members="combo" />

        {/* haze near the spots */}
        {Array.from({ length: 22 }).map((_, i) => {
          const r = rng(13 + i)();
          return <circle key={i} cx={420 + r * 600} cy={180 + ((i * 53) % 340)} r={0.5 + (i % 3) * 0.4} fill={ACCENT} opacity={0.08 + (i % 4) * 0.05} />;
        })}

        {/* a few close audience heads at the bottom (intimate) */}
        {[[160, 770, 95], [400, 790, 105], [690, 800, 100], [980, 785, 108], [1260, 795, 110]]
          .map(([cx, cy, rx], i) => <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={rx * 0.8} fill="#000" />)}
      </svg>

      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} size={250} top="20%" glow={0.3} label="▸ NOW PLAYING" title={title} artist={artist} screen={false} />
    </div>
  );
}

// ───────────────────────────────────────── 2. CONCERT HALL
function SceneHall({ coverId, coverSrc, pulse, title, artist }) {
  return (
    <div className="absolute inset-0 z-0">
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="chSpot" cx="0.5" cy="0" r="0.6">
            <stop offset="0" stopColor="oklch(0.85 0.16 55)" stopOpacity="0.24" />
            <stop offset="1" stopColor="oklch(0.85 0.16 55)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* coffered ceiling converging to the proscenium */}
        <polygon points="0,0 1440,0 1020,170 420,170" fill="#040302" />
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={i} x1={420 + i * 86} y1="170" x2={i * 205} y2="0" stroke="#15100a" strokeWidth="1" />
        ))}

        {/* side balconies in perspective */}
        <polygon points="0,0 420,170 420,520 0,720" fill="#0a0604" />
        <polygon points="1440,0 1020,170 1020,520 1440,720" fill="#0a0604" />
        {[230, 330].map((yy, i) => (
          <g key={i}>
            <polygon points={`0,${yy} 420,${yy + 28} 420,${yy + 48} 0,${yy + 20}`} fill="#15100a" opacity="0.6" />
            <polygon points={`1440,${yy} 1020,${yy + 28} 1020,${yy + 48} 1440,${yy + 20}`} fill="#15100a" opacity="0.6" />
          </g>
        ))}

        {/* proscenium arch around the stage */}
        <path d="M 420,170 L 420,520 L 1020,520 L 1020,170 Q 720,132 420,170 Z" fill="none" stroke="oklch(0.7 0.12 55)" strokeWidth="1.2" opacity="0.7" />
        {/* stage shell / back wall */}
        <rect x="455" y="190" width="530" height="320" fill="#050403" />

        {/* concert spots from the bridge */}
        <polygon points="620,170 820,170 880,510 560,510" fill="url(#chSpot)" />
        <polygon points="470,170 540,170 380,510 300,510" fill="url(#chSpot)" opacity="0.45" />
        <polygon points="900,170 970,170 1140,510 1060,510" fill="url(#chSpot)" opacity="0.45" />

        {/* raised stage with orchestra rows */}
        <polygon points="455,512 985,512 1035,536 405,536" fill="#0a0604" />
        <line x1="455" y1="512" x2="985" y2="512" stroke={ACCENT} strokeWidth="1.4" opacity="0.8" />
        {Array.from({ length: 20 }).map((_, i) => {
          const cx = 500 + (i % 10) * 50, cy = 470 + Math.floor(i / 10) * 20;
          return <g key={i}><ellipse cx={cx} cy={cy} rx="6" ry="9" fill="#000" /><circle cx={cx} cy={cy - 8} r="3.5" fill="#000" /></g>;
        })}
        {/* conductor */}
        <ellipse cx="720" cy="512" rx="6" ry="11" fill="#000" /><circle cx="720" cy="500" r="4" fill="#000" />

        {/* full audience receding */}
        <Crowd rows={8} baseY={556} rowGap={26} colsBase={22} colGrow={-2} sizeBase={6} sizeGrow={1.6} seed={23} />
      </svg>

      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} size={210} top="17%" glow={0.26} label="▸ NOW PLAYING" title={title} artist={artist} />
    </div>
  );
}

// ───────────────────────────────────────── 3. ARENA
function SceneArena({ coverId, coverSrc, pulse, title, artist }) {
  return (
    <div className="absolute inset-0 z-0">
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="arGlow" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.32" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* dark roof + curved upper bowl with distant fans */}
        <rect x="0" y="0" width="1440" height="80" fill="#040303" />
        <path d="M 0,150 Q 720,70 1440,150 L 1440,210 Q 720,150 0,210 Z" fill="#0a0805" />
        {Array.from({ length: 90 }).map((_, i) => {
          const t = i / 90; const x = t * 1440; const y = 160 + Math.sin(t * Math.PI) * -28 + (i % 3) * 4;
          return <circle key={i} cx={x} cy={y} r="1.2" fill="#2a2018" />;
        })}

        {/* main lighting truss + beams */}
        <Truss x1={300} x2={1140} y={96} fixtures={13} />
        <Beams originY={122} spread={1.1} count={7} len={360} hue={55} op={0.13} />
        <Beams originY={122} spread={1.3} count={4} len={380} hue={310} op={0.08} />

        {/* big LED wall behind the band */}
        <rect x="430" y="180" width="580" height="250" fill="#000" stroke={ACCENT} strokeWidth="1.6" opacity="0.85" />
        <rect x="430" y="180" width="580" height="250" fill="url(#arGlow)" />

        {/* flown line arrays flanking the stage */}
        <LineArray x={372} yTop={170} boxes={8} w={34} curve={12} />
        <LineArray x={1068} yTop={170} boxes={8} w={34} curve={12} />

        {/* raised stage deck with thrust */}
        <polygon points="470,470 970,470 1030,512 410,512" fill="#0a0604" />
        <polygon points="690,512 750,512 770,556 670,556" fill="#0a0604" />
        <line x1="470" y1="470" x2="970" y2="470" stroke={ACCENT} strokeWidth="1.6" />
        <Band y={452} scale={1} members="full" />

        {/* a sea of fans on the floor + lower bowl */}
        <Crowd rows={13} baseY={540} rowGap={15} colsBase={40} colGrow={2} sizeBase={4} sizeGrow={0.6} seed={31} phones={26} />
      </svg>

      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} size={250} top="25%" glow={0.4} title={title} artist={artist} />
    </div>
  );
}

// ───────────────────────────────────────── 4. DOMED STADIUM
function SceneDome({ coverId, coverSrc, pulse, title, artist }) {
  return (
    <div className="absolute inset-0 z-0">
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="domSky" cx="0.5" cy="1" r="1">
            <stop offset="0" stopColor="#16161e" stopOpacity="0.9" /><stop offset="1" stopColor="#04040a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="domGlow" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.3" /><stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* dome shell with concentric panels + central skylight */}
        <path d="M -200,470 Q 720,-110 1640,470 L 1640,-50 L -200,-50 Z" fill="#06060a" />
        {Array.from({ length: 7 }).map((_, i) => (
          <path key={i} d={`M -200,${470 - i * 30} Q 720,${-110 - i * 70} 1640,${470 - i * 30}`} fill="none" stroke="rgba(180,180,200,0.06)" strokeWidth="0.8" />
        ))}
        {Array.from({ length: 13 }).map((_, i) => {
          const a = (i / 12) * Math.PI;
          return <line key={i} x1={720 + Math.cos(a + Math.PI) * 900} y1="470" x2="720" y2="55" stroke="rgba(180,180,200,0.04)" strokeWidth="0.6" />;
        })}
        <ellipse cx="720" cy="66" rx="170" ry="13" fill="oklch(0.85 0.04 220 / 0.18)" />
        <rect x="0" y="0" width="1440" height="470" fill="url(#domSky)" opacity="0.4" />

        {/* hung center scoreboard rig + truss + beams */}
        <Truss x1={260} x2={1180} y={150} fixtures={16} />
        <Beams originY={176} spread={1.3} count={9} len={340} hue={55} op={0.12} />

        {/* huge LED video wall on the end stage */}
        <rect x="470" y="210" width="500" height="220" fill="#000" stroke={ACCENT} strokeWidth="1.6" opacity="0.85" />
        <rect x="470" y="210" width="500" height="220" fill="url(#domGlow)" />

        {/* tall flown line arrays + side delay hangs */}
        <LineArray x={420} yTop={200} boxes={9} w={32} curve={12} />
        <LineArray x={1020} yTop={200} boxes={9} w={32} curve={12} />
        <LineArray x={240} yTop={230} boxes={6} w={24} curve={8} />
        <LineArray x={1200} yTop={230} boxes={6} w={24} curve={8} />

        {/* end stage deck */}
        <polygon points="500,450 940,450 990,492 450,492" fill="#0a0604" />
        <line x1="500" y1="450" x2="940" y2="450" stroke={ACCENT} strokeWidth="1.4" />
        <Band y={436} scale={0.85} members="full" />

        {/* upper-deck wraparound silhouettes */}
        <rect x="0" y="392" width="430" height="64" fill="#06060a" />
        <rect x="1010" y="392" width="430" height="64" fill="#06060a" />
        {Array.from({ length: 50 }).map((_, i) => {
          const x = (i / 25) * 430; return <circle key={i} cx={i < 25 ? x : 1010 + x} cy={410 + (i % 3) * 14} r="1.6" fill="#2a2018" />;
        })}

        {/* enormous crowd field */}
        <Crowd rows={17} baseY={500} rowGap={14} colsBase={50} colGrow={2} sizeBase={3.2} sizeGrow={0.5} seed={41} phones={60} />
      </svg>

      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} size={210} top="27%" glow={0.32} title={title} artist={artist} />
    </div>
  );
}

// ───────────────────────────────────────── 5. OPEN STADIUM (80,000)
function SceneStadium({ coverId, coverSrc, pulse, title, artist }) {
  return (
    <div className="absolute inset-0 z-0">
      <svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="stdSky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#070b16" /><stop offset="1" stopColor="#0a0a10" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="stdGlow" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.3" /><stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* open night sky + stars */}
        <rect x="0" y="0" width="1440" height="300" fill="#05070f" />
        <rect x="0" y="0" width="1440" height="340" fill="url(#stdSky)" opacity="0.7" />
        {Array.from({ length: 40 }).map((_, i) => (
          <circle key={`s${i}`} cx={(i * 173) % 1440} cy={(i * 53) % 150} r={i % 5 === 0 ? 1 : 0.6} fill="#cdd6ff" opacity={0.2 + (i % 4) * 0.12} />
        ))}

        {/* open bowl rim with terraced rings */}
        <path d="M 0,290 Q 720,175 1440,290 L 1440,460 L 0,460 Z" fill="#0a0a12" />
        <path d="M 0,290 Q 720,175 1440,290" fill="none" stroke="rgba(180,190,220,0.10)" strokeWidth="1.2" />
        {Array.from({ length: 4 }).map((_, i) => (
          <path key={i} d={`M 0,${320 + i * 30} Q 720,${205 + i * 30} 1440,${320 + i * 30}`} fill="none" stroke="rgba(180,190,220,0.05)" strokeWidth="0.8" />
        ))}

        {/* floodlight masts */}
        {[110, 470, 970, 1330].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="290" x2={x} y2="115" stroke="#15161e" strokeWidth="3" />
            <rect x={x - 26} y="92" width="52" height="24" fill="#0c0d14" stroke="#1c1d28" />
            {Array.from({ length: 12 }).map((_, k) => (
              <circle key={k} cx={x - 20 + (k % 4) * 13} cy={98 + Math.floor(k / 4) * 8} r="2.2" fill="oklch(0.95 0.06 90)" opacity="0.85" />
            ))}
            <polygon points={`${x - 26},116 ${x + 26},116 ${x + 200},470 ${x - 200},470`} fill="oklch(0.85 0.1 90)" opacity="0.05" />
          </g>
        ))}

        {/* festival stage roof + truss + beams */}
        <polygon points="430,200 1010,200 1040,238 400,238" fill="#0a0b12" stroke="#1c1d28" strokeWidth="0.8" />
        <Truss x1={445} x2={995} y={236} fixtures={11} />
        <Beams originY={262} spread={1.2} count={8} len={210} hue={55} op={0.13} />
        <Beams originY={262} spread={1.4} count={5} len={220} hue={310} op={0.07} />

        {/* giant LED wall */}
        <rect x="500" y="252" width="440" height="200" fill="#000" stroke={ACCENT} strokeWidth="1.6" opacity="0.9" />
        <rect x="500" y="252" width="440" height="200" fill="url(#stdGlow)" />

        {/* big PA wings (line arrays) */}
        <LineArray x={420} yTop={250} boxes={9} w={32} curve={12} />
        <LineArray x={1020} yTop={250} boxes={9} w={32} curve={12} />

        {/* stage deck + band */}
        <polygon points="520,452 920,452 980,492 460,492" fill="#0a0604" />
        <line x1="520" y1="452" x2="920" y2="452" stroke={ACCENT} strokeWidth="1.4" />
        <Band y={438} scale={0.8} members="full" />

        {/* massive open-field crowd */}
        <Crowd rows={20} baseY={470} rowGap={13} colsBase={54} colGrow={2} sizeBase={3} sizeGrow={0.45} seed={57} phones={90} />
      </svg>

      <StageArt coverId={coverId} coverSrc={coverSrc} pulse={pulse} size={200} top="30%" glow={0.32} title={title} artist={artist} />
    </div>
  );
}

const SCENE_MAP = {
  jazz: SceneJazz,
  hall: SceneHall,
  arena: SceneArena,
  dome: SceneDome,
  stadium: SceneStadium,
};

export default function Scene({ venueId, coverId, coverSrc, pulse, title, artist }) {
  const C = SCENE_MAP[venueId] || SceneJazz;
  return <C coverId={coverId} coverSrc={coverSrc} pulse={pulse} title={title} artist={artist} />;
}
