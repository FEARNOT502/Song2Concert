// Modals.jsx — modal shell + file / venue / seat pickers (ported from proto/ui.jsx)
// FilePicker accepts a real uploaded FLAC/WAV via drag-drop or the native input.

import { useRef, useState } from 'react';
import { VENUES } from '../data.js';

// ───────────────────────────────────────── Modal shell
export function Modal({ open, onClose, title, subtitle, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-10" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/15 max-w-[1200px] w-full max-h-[92vh] sm:max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5 border-b border-white/10 gap-3">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[12px] tracking-[0.25em] sm:tracking-[0.3em] uppercase text-neutral-500 font-mono truncate">{subtitle}</div>
            <div className="text-white text-[20px] sm:text-[26px] font-light mt-1 font-tight">{title}</div>
          </div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 border border-white/20 hover:border-white/50 text-neutral-400 hover:text-white flex items-center justify-center transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── venue thumbnails
//
// The buildings, at night, from outside — the moment before you go in. These
// used to be plan diagrams: a rectangle for the room, a bar for the stage, dots
// for the audience. A plan tells you nothing you cannot read in the RT60 figure
// underneath it, and it looks like a fire-escape notice.
//
// Each one is the actual building the room model is drawn from, so the picker
// and the scene agree: a brick shopfront, a proscenium house with a portico, the
// Philharmonie's tent, an arena drum, Tokyo Dome's membrane, Wembley's arch.
// Every gradient id is prefixed with the venue so six of them can share a page.

const ACC = 'oklch(0.78 0.16 55)';

// Windows lit from inside, scattered so no two buildings light up alike.
function Lights({ x, y, w, h, cols, rows, seed = 1, size = 1.6, warm = '#ffc27a' }) {
  let n = seed;
  const rnd = () => { n = (n * 9301 + 49297) % 233280; return n / 233280; };
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = rnd();
      if (v < 0.42) continue;
      out.push(
        <rect
          key={`${r}-${c}`}
          x={x + (c + 0.5) * (w / cols) - size / 2}
          y={y + (r + 0.5) * (h / rows) - size / 2}
          width={size}
          height={size * 1.15}
          fill={v > 0.86 ? '#cfe4ff' : warm}
          opacity={0.35 + v * 0.5}
        />,
      );
    }
  }
  return out;
}

function Sky({ id, from = '#0b0d1c', to = '#1c1526' }) {
  return (
    <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
}

const FRAME = { width: '100%', height: '100%' };

// ── 1 · Club — a brick shopfront on a wet street ──
function ThumbClub() {
  return (
    <svg viewBox="0 0 120 80" style={FRAME}>
      <defs>
        <Sky id="cl" from="#0a0b16" to="#241a1a" />
        <linearGradient id="cl-brick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2418" /><stop offset="1" stopColor="#1d120c" />
        </linearGradient>
        <radialGradient id="cl-pool" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#ffb066" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffb066" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" fill="url(#cl-sky)" />
      {/* neighbours, held back so the club reads in front */}
      <rect x="0" y="18" width="26" height="48" fill="#171019" />
      <rect x="98" y="14" width="22" height="52" fill="#14101a" />
      <Lights x={2} y={22} w={22} h={30} cols={3} rows={5} seed={31} size={1.4} />
      {/* the club itself */}
      <rect x="24" y="10" width="74" height="56" fill="url(#cl-brick)" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={i} x1="24" y1={12 + i * 6.6} x2="98" y2={12 + i * 6.6} stroke="#0f0a07" strokeWidth="0.5" opacity="0.7" />
      ))}
      <rect x="24" y="8" width="74" height="3" fill="#241610" />
      {/* upstairs windows */}
      {[30, 44, 58, 72, 86].map((x, i) => (
        <g key={x}>
          <rect x={x} y="15" width="8" height="11" fill="#0c0a12" stroke="#3a2618" strokeWidth="0.5" />
          {i % 2 === 0 && <rect x={x + 1} y="16" width="6" height="9" fill="#ffbe7a" opacity="0.3" />}
        </g>
      ))}
      {/* awning + the glow it throws on the pavement */}
      <path d="M 34 40 L 88 40 L 92 48 L 30 48 Z" fill="#2a0f10" />
      <path d="M 34 40 L 88 40 L 92 48 L 30 48 Z" fill="none" stroke="#4a1c1a" strokeWidth="0.6" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line key={i} x1={35 + i * 8.8} y1="40" x2={33.5 + i * 9.2} y2="48" stroke="#170809" strokeWidth="0.7" />
      ))}
      <ellipse cx="61" cy="66" rx="34" ry="9" fill="url(#cl-pool)" />
      {/* neon */}
      <rect x="46" y="29" width="30" height="9" rx="1" fill="#12080a" stroke={ACC} strokeWidth="0.7" />
      <text x="61" y="35.6" textAnchor="middle" fill={ACC} style={{ font: '5px "JetBrains Mono", monospace', letterSpacing: '0.12em' }}>CLUB</text>
      {/* doorway, window and the queue outside */}
      <rect x="54" y="50" width="13" height="16" fill="#1a0d08" />
      <rect x="55" y="51" width="11" height="15" fill="#ffb066" opacity="0.5" />
      <rect x="33" y="51" width="17" height="12" fill="#0d0910" stroke="#3a2618" strokeWidth="0.5" />
      <rect x="71" y="51" width="17" height="12" fill="#0d0910" stroke="#3a2618" strokeWidth="0.5" />
      <rect x="34" y="52" width="15" height="10" fill="#ff9745" opacity="0.16" />
      {[[45, 0], [48.5, 1], [73, 0], [76.5, 1], [80, 0]].map(([x, s], i) => (
        <g key={i} fill="#080609">
          <ellipse cx={x} cy={62 - s} rx="1.7" ry="3.4" />
          <circle cx={x} cy={57.6 - s} r="1.3" />
        </g>
      ))}
      <rect x="0" y="66" width="120" height="14" fill="#100c12" />
      <rect x="0" y="66" width="120" height="0.6" fill="#2b2130" />
    </svg>
  );
}

// ── 2 · Theatre — a portico, a pediment, a lit marquee ──
function ThumbTheater() {
  return (
    <svg viewBox="0 0 120 80" style={FRAME}>
      <defs>
        <Sky id="th" from="#090b18" to="#1e1620" />
        <linearGradient id="th-stone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2b2119" /><stop offset="0.45" stopColor="#443428" /><stop offset="1" stopColor="#241b14" />
        </linearGradient>
        <radialGradient id="th-pool" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#ffbe7a" stopOpacity="0.45" /><stop offset="1" stopColor="#ffbe7a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" fill="url(#th-sky)" />
      <rect x="0" y="26" width="16" height="42" fill="#141019" />
      <rect x="104" y="24" width="16" height="44" fill="#141019" />
      {/* main block */}
      <rect x="14" y="22" width="92" height="46" fill="url(#th-stone)" />
      <rect x="14" y="22" width="92" height="1.2" fill="#5b4632" />
      {/* upper storey: arched windows */}
      {[24, 40, 56, 72, 88].map((x) => (
        <g key={x}>
          <path d={`M ${x} 40 L ${x} 32 Q ${x + 4} 27 ${x + 8} 32 L ${x + 8} 40 Z`} fill="#0d0a12" stroke="#5b4632" strokeWidth="0.5" />
          <path d={`M ${x + 1} 39 L ${x + 1} 32.5 Q ${x + 4} 28.5 ${x + 7} 32.5 L ${x + 7} 39 Z`} fill="#ffbe7a" opacity="0.24" />
        </g>
      ))}
      {/* pediment + portico */}
      <path d="M 32 22 L 60 9 L 88 22 Z" fill="#4b3a2b" />
      <path d="M 32 22 L 60 9 L 88 22 Z" fill="none" stroke="#6d543c" strokeWidth="0.7" />
      <path d="M 36.5 20.4 L 60 13.6 L 83.5 20.4 Z" fill="#2c2118" />
      <rect x="30" y="22" width="60" height="2.6" fill="#54402f" />
      {[34, 44, 54, 64, 74, 84].map((x) => (
        <g key={x}>
          <rect x={x} y="24.6" width="4.4" height="30" fill="#4a392a" />
          <rect x={x} y="24.6" width="1.3" height="30" fill="#634c37" />
          <rect x={x - 0.8} y="24.6" width="6" height="1.6" fill="#5e4835" />
          <rect x={x - 0.8} y="53" width="6" height="1.8" fill="#5e4835" />
        </g>
      ))}
      {/* marquee */}
      <rect x="38" y="45" width="44" height="10" rx="1" fill="#160f08" stroke={ACC} strokeWidth="0.8" />
      <text x="60" y="52.2" textAnchor="middle" fill={ACC} style={{ font: '5px "JetBrains Mono", monospace', letterSpacing: '0.14em' }}>THEATER</text>
      {Array.from({ length: 15 }).map((_, i) => (
        <circle key={i} cx={39.5 + i * 3} cy="56.6" r="0.85" fill="#ffd9a0" opacity={0.55 + (i % 3) * 0.15} />
      ))}
      <ellipse cx="60" cy="68" rx="40" ry="9" fill="url(#th-pool)" />
      {/* doors and steps */}
      {[46, 56, 66].map((x) => <rect key={x} x={x} y="57" width="8" height="11" fill="#2a1a10" stroke="#6d543c" strokeWidth="0.4" />)}
      {[0, 1, 2].map((i) => <rect key={i} x={30 - i * 3} y={68 + i * 2} width={60 + i * 6} height="2.2" fill={i % 2 ? '#241c16' : '#2d241c'} />)}
      {[[40, 0], [43, 1], [78, 0], [81.5, 1]].map(([x, s], i) => (
        <g key={i} fill="#070609">
          <ellipse cx={x} cy={65 - s} rx="1.6" ry="3.2" />
          <circle cx={x} cy={60.8 - s} r="1.25" />
        </g>
      ))}
      <rect x="0" y="74" width="120" height="6" fill="#100d13" />
    </svg>
  );
}

// ── 3 · Concert hall — the vineyard's tent roof over a glass foyer ──
function ThumbConcertHall() {
  return (
    <svg viewBox="0 0 120 80" style={FRAME}>
      <defs>
        <Sky id="ch" from="#080a18" to="#171426" />
        <linearGradient id="ch-tent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d4a2c" /><stop offset="1" stopColor="#2c2317" />
        </linearGradient>
        <linearGradient id="ch-tent2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3a22" /><stop offset="1" stopColor="#211a11" />
        </linearGradient>
        <linearGradient id="ch-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc98c" stopOpacity="0.55" /><stop offset="1" stopColor="#ffa855" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <rect width="120" height="80" fill="url(#ch-sky)" />
      {/* the faceted tent — the form the terraces make from outside */}
      <path d="M 8 52 L 26 20 L 44 44 L 60 12 L 76 44 L 94 20 L 112 52 Z" fill="url(#ch-tent)" />
      <path d="M 26 20 L 44 44 L 60 12 Z" fill="url(#ch-tent2)" />
      <path d="M 76 44 L 94 20 L 112 52 Z" fill="url(#ch-tent2)" />
      <path d="M 8 52 L 26 20 L 44 44 L 60 12 L 76 44 L 94 20 L 112 52" fill="none" stroke="#8a6c3e" strokeWidth="0.7" opacity="0.85" />
      {[26, 60, 94].map((x, i) => (
        <line key={x} x1={x} y1={i === 1 ? 12 : 20} x2={x} y2="52" stroke="#7a5f37" strokeWidth="0.4" opacity="0.5" />
      ))}
      {/* ridge lights */}
      {[26, 60, 94].map((x, i) => <circle key={x} cx={x} cy={i === 1 ? 12 : 20} r="1.1" fill="#ffd9a0" opacity="0.9" />)}
      {/* glass foyer */}
      <rect x="8" y="52" width="104" height="16" fill="#0f0d16" />
      <rect x="10" y="53.5" width="100" height="13" fill="url(#ch-glass)" />
      {Array.from({ length: 17 }).map((_, i) => (
        <line key={i} x1={10 + i * 6.25} y1="53.5" x2={10 + i * 6.25} y2="66.5" stroke="#1a1420" strokeWidth="0.8" />
      ))}
      <line x1="10" y1="60" x2="110" y2="60" stroke="#1a1420" strokeWidth="0.6" />
      {/* the audience inside the foyer, before the bell */}
      {[18, 24, 31, 44, 50, 63, 70, 76, 88, 95, 101].map((x, i) => (
        <g key={x} fill="#120b12" opacity="0.85">
          <ellipse cx={x} cy={63 - (i % 2)} rx="1.5" ry="3" />
          <circle cx={x} cy={59 - (i % 2)} r="1.15" />
        </g>
      ))}
      <rect x="8" y="68" width="104" height="1.4" fill="#2a2333" />
      <rect x="0" y="69" width="120" height="11" fill="#0d0b12" />
      {/* plaza lamps */}
      {[16, 60, 104].map((x) => (
        <g key={x}><line x1={x} y1="69" x2={x} y2="58" stroke="#2b2434" strokeWidth="0.7" /><circle cx={x} cy="57" r="1.5" fill="#ffdca8" opacity="0.85" /></g>
      ))}
    </svg>
  );
}

// ── 4 · Arena — a glazed drum under a cantilevered canopy ──
function ThumbArena() {
  return (
    <svg viewBox="0 0 120 80" style={FRAME}>
      <defs>
        <Sky id="ar" from="#070a18" to="#171728" />
        <linearGradient id="ar-drum" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1a1b26" /><stop offset="0.5" stopColor="#33344a" /><stop offset="1" stopColor="#171825" />
        </linearGradient>
        <linearGradient id="ar-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0ff" stopOpacity="0.42" /><stop offset="1" stopColor="#ff9745" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect width="120" height="80" fill="url(#ar-sky)" />
      {/* city behind */}
      <g fill="#111322">
        <rect x="0" y="30" width="14" height="38" /><rect x="12" y="38" width="10" height="30" />
        <rect x="100" y="26" width="12" height="42" /><rect x="110" y="36" width="10" height="32" />
      </g>
      <Lights x={1} y={33} w={20} h={28} cols={4} rows={6} seed={7} size={1.2} />
      <Lights x={101} y={29} w={18} h={30} cols={4} rows={6} seed={13} size={1.2} />
      {/* canopy */}
      <path d="M 10 30 Q 60 16 110 30 L 110 34 Q 60 20 10 34 Z" fill="#242637" />
      <path d="M 10 30 Q 60 16 110 30" fill="none" stroke="#454a68" strokeWidth="0.7" />
      {/* drum */}
      <path d="M 14 34 Q 60 22 106 34 L 106 66 L 14 66 Z" fill="url(#ar-drum)" />
      {/* glazed concourse band */}
      <path d="M 15 44 Q 60 33 105 44 L 105 56 Q 60 45 15 56 Z" fill="url(#ar-glass)" />
      {Array.from({ length: 19 }).map((_, i) => (
        <line key={i} x1={16 + i * 4.9} y1={44 - Math.sin((i / 18) * Math.PI) * 6 + 4.5} x2={16 + i * 4.9} y2={56 - Math.sin((i / 18) * Math.PI) * 6 + 4.5} stroke="#0f1120" strokeWidth="0.8" opacity="0.8" />
      ))}
      {/* fins above the band */}
      {Array.from({ length: 25 }).map((_, i) => (
        <line key={i} x1={15 + i * 3.7} y1={34 - Math.sin((i / 24) * Math.PI) * 11} x2={15 + i * 3.7} y2={44 - Math.sin((i / 24) * Math.PI) * 11} stroke="#3d4058" strokeWidth="1.1" opacity="0.55" />
      ))}
      {/* the sign band, the one warm thing on the building */}
      <path d="M 22 60 L 98 60 L 98 64 L 22 64 Z" fill="#12090a" stroke={ACC} strokeWidth="0.6" />
      <text x="60" y="63.3" textAnchor="middle" fill={ACC} style={{ font: '4px "JetBrains Mono", monospace', letterSpacing: '0.3em' }}>ARENA</text>
      {/* entrance */}
      <rect x="50" y="64" width="20" height="6" fill="#ffb066" opacity="0.42" />
      <rect x="0" y="68" width="120" height="12" fill="#0c0d16" />
      <rect x="0" y="68" width="120" height="0.7" fill="#262a3d" />
      {[30, 40, 50, 72, 82, 92].map((x, i) => (
        <g key={x} fill="#07070d"><ellipse cx={x} cy={73 + (i % 2)} rx="1.5" ry="3" /><circle cx={x} cy={69 + (i % 2)} r="1.15" /></g>
      ))}
    </svg>
  );
}

// ── 5 · Dome — an air-supported membrane on a concrete ring ──
function ThumbDome() {
  return (
    <svg viewBox="0 0 120 80" style={FRAME}>
      <defs>
        <Sky id="dm" from="#06081a" to="#141428" />
        <radialGradient id="dm-skin" cx="0.42" cy="0.18" r="0.95">
          <stop offset="0" stopColor="#e8e4ea" /><stop offset="0.55" stopColor="#a49fb4" /><stop offset="1" stopColor="#4c4a60" />
        </radialGradient>
        <linearGradient id="dm-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2b3c" /><stop offset="1" stopColor="#15151f" />
        </linearGradient>
      </defs>
      <rect width="120" height="80" fill="url(#dm-sky)" />
      {Array.from({ length: 26 }).map((_, i) => (
        <circle key={i} cx={(i * 37) % 118 + 1} cy={(i * 13) % 26 + 2} r={0.5 + (i % 3) * 0.25} fill="#cdd8ff" opacity={0.3 + (i % 4) * 0.14} />
      ))}
      <g fill="#101324">
        <rect x="0" y="40" width="12" height="26" /><rect x="108" y="36" width="12" height="30" />
      </g>
      {/* the membrane */}
      <path d="M 12 54 A 48 40 0 0 1 108 54 Z" fill="url(#dm-skin)" />
      {/* the cable net that holds it down */}
      {Array.from({ length: 11 }).map((_, i) => {
        const t = (i + 1) / 12, a = Math.PI * t;
        return <path key={i} d={`M ${60 - Math.cos(a) * 48} 54 Q 60 ${54 - 40 * Math.sin(a) * 0.6} ${60 + Math.cos(a) * 48} 54`} fill="none" stroke="#5c5a72" strokeWidth="0.35" opacity="0.5" />;
      })}
      {[0.3, 0.55, 0.8].map((k, i) => (
        <path key={i} d={`M ${60 - 48 * k} ${54 - Math.sqrt(Math.max(0, 1 - k * k)) * 0} A ${48 * k} ${40 * k} 0 0 1 ${60 + 48 * k} 54`} fill="none" stroke="#6b6880" strokeWidth="0.35" opacity="0.35" />
      ))}
      <path d="M 12 54 A 48 40 0 0 1 108 54" fill="none" stroke="#d6d2df" strokeWidth="0.7" opacity="0.7" />
      {/* concrete ring base + concourse */}
      <path d="M 10 54 L 110 54 L 110 68 L 10 68 Z" fill="url(#dm-base)" />
      <rect x="10" y="54" width="100" height="1.4" fill="#4b4a60" />
      {Array.from({ length: 21 }).map((_, i) => (
        <rect key={i} x={12 + i * 4.6} y="57" width="2.6" height="7" fill="#ff9745" opacity={i % 3 === 0 ? 0.42 : 0.2} />
      ))}
      {/* mast lights */}
      {[18, 102].map((x) => (
        <g key={x}><line x1={x} y1="54" x2={x} y2="42" stroke="#3a3a4e" strokeWidth="0.8" /><rect x={x - 3} y="39" width="6" height="3.4" fill="#fff0cf" opacity="0.85" /></g>
      ))}
      <rect x="0" y="68" width="120" height="12" fill="#0b0c15" />
      <rect x="0" y="68" width="120" height="0.7" fill="#232538" />
      {[26, 34, 42, 62, 70, 86, 94].map((x, i) => (
        <g key={x} fill="#07070e"><ellipse cx={x} cy={73 + (i % 2)} rx="1.5" ry="3" /><circle cx={x} cy={69 + (i % 2)} r="1.15" /></g>
      ))}
    </svg>
  );
}

// ── 6 · Stadium — the bowl under the arch ──
function ThumbStadium() {
  return (
    <svg viewBox="0 0 120 80" style={FRAME}>
      <defs>
        <Sky id="st" from="#050818" to="#181632" />
        <linearGradient id="st-bowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f3145" /><stop offset="1" stopColor="#12131e" />
        </linearGradient>
        <linearGradient id="st-arch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfd6e8" /><stop offset="1" stopColor="#6d7590" />
        </linearGradient>
        <radialGradient id="st-glow" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#ffb066" stopOpacity="0.4" /><stop offset="1" stopColor="#ffb066" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" fill="url(#st-sky)" />
      {Array.from({ length: 30 }).map((_, i) => (
        <circle key={i} cx={(i * 41) % 118 + 1} cy={(i * 17) % 32 + 2} r={0.5 + (i % 3) * 0.25} fill="#d5deff" opacity={0.28 + (i % 4) * 0.15} />
      ))}
      {/* the light the bowl throws into the sky */}
      <ellipse cx="60" cy="56" rx="52" ry="22" fill="url(#st-glow)" />
      {/* the arch */}
      <path d="M 12 58 A 48 40 0 0 1 108 58" fill="none" stroke="url(#st-arch)" strokeWidth="2.6" strokeLinecap="round" />
      {Array.from({ length: 9 }).map((_, i) => {
        const t = (i + 1) / 10, a = Math.PI * t;
        const x = 60 - Math.cos(a) * 48, y = 58 - Math.sin(a) * 40;
        return <line key={i} x1={x} y1={y} x2={60 - Math.cos(a) * 34} y2="47" stroke="#6d7590" strokeWidth="0.35" opacity="0.55" />;
      })}
      {/* roof ring + bowl */}
      <path d="M 8 47 Q 60 37 112 47 L 112 52 Q 60 42 8 52 Z" fill="#20222f" />
      <path d="M 8 47 Q 60 37 112 47" fill="none" stroke="#454a63" strokeWidth="0.6" />
      <path d="M 10 52 Q 60 42 110 52 L 110 68 L 10 68 Z" fill="url(#st-bowl)" />
      {/* the lit bowl interior, glimpsed over the rim */}
      <path d="M 12 51.5 Q 60 42 108 51.5 L 108 55 Q 60 45.5 12 55 Z" fill="#ff9745" opacity="0.3" />
      {/* concourse arches */}
      {Array.from({ length: 17 }).map((_, i) => {
        const x = 13 + i * 5.7;
        const y = 58 - Math.sin((i / 16) * Math.PI) * 5;
        return <path key={i} d={`M ${x} 68 L ${x} ${y + 3} Q ${x + 2.1} ${y} ${x + 4.2} ${y + 3} L ${x + 4.2} 68 Z`} fill="#0d0e18" stroke="#333749" strokeWidth="0.35" />;
      })}
      {[24, 60, 96].map((x) => <rect key={x} x={x - 4} y="62" width="8" height="6" fill="#ffb066" opacity="0.4" />)}
      <rect x="0" y="68" width="120" height="12" fill="#0a0b14" />
      <rect x="0" y="68" width="120" height="0.7" fill="#242840" />
      {[20, 28, 36, 50, 58, 66, 84, 92, 100].map((x, i) => (
        <g key={x} fill="#06060d"><ellipse cx={x} cy={73 + (i % 2)} rx="1.5" ry="3" /><circle cx={x} cy={69 + (i % 2)} r="1.15" /></g>
      ))}
    </svg>
  );
}

const THUMBS = {
  club: ThumbClub,
  theater: ThumbTheater,
  concerthall: ThumbConcertHall,
  arena: ThumbArena,
  dome: ThumbDome,
  stadium: ThumbStadium,
};

export function VenueThumb({ id }) {
  const T = THUMBS[id];
  return T ? <T /> : null;
}

// ───────────────────────────────────────── Venue picker
export function VenuePicker({ open, onClose, current, onPick }) {
  return (
    <Modal open={open} onClose={onClose} title="Choose a venue" subtitle="JAZZ CLUB · CONCERT HALL · ARENA · DOME · STADIUM">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {VENUES.map((v) => {
          const active = v.id === current;
          return (
            <button
              key={v.id}
              onClick={() => { onPick(v.id); onClose(); }}
              className={`relative text-left border ${active ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/5' : 'border-white/15 hover:border-white/40'} p-5 transition-colors font-mono`}
            >
              <div className="aspect-[3/2] bg-black border border-white/10 mb-4 relative overflow-hidden">
                <VenueThumb id={v.id} />
                <div className="absolute top-2 left-2 text-[9px] tracking-[0.3em] text-neutral-500">{v.type}</div>
                {active && <div className="absolute top-2 right-2 text-[oklch(0.78_0.16_55)] text-[9px] tracking-[0.3em]">● CURRENT</div>}
              </div>
              <div className="text-white text-[21px] font-light normal-case tracking-tight font-tight">{v.name}</div>
              <div className="text-[12px] text-neutral-500 mt-1">{v.capacity}</div>
              <div className="text-[12px] text-neutral-400 mt-3 leading-relaxed normal-case tracking-normal font-tight">{v.descKo}</div>
              <div className="mt-3 pt-3 border-t border-white/10 flex gap-4 text-[12px] tabular-nums">
                <span className="text-neutral-500">RT60 <span className="text-white">{v.acoustics.rt60}</span></span>
                <span className="text-neutral-500">EDT <span className="text-white">{v.acoustics.edt}</span></span>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────── File picker (upload, multi-file)
export function FilePicker({ open, onClose, onUpload, uploadedName, queueCount = 0 }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const accept = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length) { onUpload(files); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Open audio files" subtitle="DROP FLAC / WAV — MULTIPLE OK · PROCESSED LOCALLY IN YOUR BROWSER">
      {/* drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); accept(e.dataTransfer.files); }}
        className={`border-2 border-dashed transition-colors p-8 sm:p-16 text-center cursor-pointer ${dragOver ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/5' : 'border-white/20 hover:border-[oklch(0.78_0.16_55)]'}`}
      >
        <div className="text-[oklch(0.78_0.16_55)] text-[10px] tracking-[0.3em] uppercase font-mono">↓ DROP HERE</div>
        <div className="text-white text-[20px] sm:text-[28px] font-light mt-3 font-tight">Tap to add · FLAC / WAV / AIFF</div>
        <div className="text-neutral-500 text-[12px] mt-2">여러 파일 선택 가능 · 큐에 추가되어 연속 재생 · 16 / 24-bit · hi-res 지원</div>
        <div className="text-neutral-600 text-[11px] mt-4 font-mono">or click to browse ↗</div>
        {uploadedName && (
          <div className="text-[oklch(0.78_0.16_55)] text-[11px] mt-5 font-mono">
            ▸ NOW · {uploadedName}{queueCount > 1 ? `   ·   ${queueCount - 1} in queue` : ''}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".flac,.wav,.aiff,.aif,audio/*"
          multiple
          className="hidden"
          onChange={(e) => accept(e.target.files)}
        />
      </div>

      <div className="text-[10px] tracking-[0.2em] uppercase text-neutral-600 mt-5 leading-relaxed font-mono">
        파일은 서버로 업로드되지 않습니다 · 브라우저 내 Web Audio로 실시간 처리 ·
        24-bit / hi-res FLAC은 WASM 디코더로 자동 폴백합니다.
      </div>
    </Modal>
  );
}
