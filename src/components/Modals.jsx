// Modals.jsx — modal shell + file / venue / seat pickers (ported from proto/ui.jsx)
// FilePicker accepts a real uploaded FLAC/WAV via drag-drop or the native input.

import { useRef, useState } from 'react';
import { VENUES } from '../data.js';

// ───────────────────────────────────────── Modal shell
export function Modal({ open, onClose, title, subtitle, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-10" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/15 max-w-[1200px] w-full max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/10">
          <div>
            <div className="text-[12px] tracking-[0.3em] uppercase text-neutral-500 font-mono">{subtitle}</div>
            <div className="text-white text-[26px] font-light mt-1 font-tight">{title}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 border border-white/20 hover:border-white/50 text-neutral-400 hover:text-white flex items-center justify-center transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-auto p-8">{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── tiny schematic venue thumbnails
export function VenueThumb({ id }) {
  const common = { width: '100%', height: '100%' };
  const palette = { fill: 'rgba(255,255,255,0.18)', stroke: 'rgba(255,255,255,0.4)', accent: 'oklch(0.78 0.16 55)' };
  if (id === 'jazz') return (
    <svg viewBox="0 0 120 80" style={common}>
      <rect x="6" y="20" width="108" height="40" fill="none" stroke={palette.stroke} />
      <rect x="46" y="18" width="28" height="14" fill={palette.accent} />
      {Array.from({ length: 12 }).map((_, i) => <circle key={i} cx={12 + i * 9} cy="68" r="2.4" fill={palette.fill} />)}
    </svg>
  );
  if (id === 'hall') return (
    <svg viewBox="0 0 120 80" style={common}>
      <path d="M 6 60 L 6 30 Q 60 12 114 30 L 114 60 Z" fill="none" stroke={palette.stroke} />
      <rect x="48" y="28" width="24" height="14" fill={palette.accent} />
      {Array.from({ length: 7 }).map((_, r) => Array.from({ length: 16 - r }).map((_, c) => (
        <circle key={`${r}-${c}`} cx={12 + r * 3 + c * (96 / (16 - r))} cy={48 + r * 3.5} r="1" fill={palette.fill} />
      )))}
    </svg>
  );
  if (id === 'arena') return (
    <svg viewBox="0 0 120 80" style={common}>
      <ellipse cx="60" cy="40" rx="54" ry="34" fill="none" stroke={palette.stroke} />
      <rect x="42" y="14" width="36" height="20" fill={palette.accent} />
      {Array.from({ length: 40 }).map((_, i) => {
        const a = (i / 40) * Math.PI * 2;
        return <circle key={i} cx={60 + Math.cos(a) * 36} cy={40 + Math.sin(a) * 22} r="0.8" fill={palette.fill} />;
      })}
    </svg>
  );
  if (id === 'dome') return (
    <svg viewBox="0 0 120 80" style={common}>
      <path d="M 6 70 Q 60 4 114 70" fill="none" stroke={palette.stroke} />
      <rect x="6" y="68" width="108" height="3" fill="rgba(255,255,255,0.1)" />
      <rect x="50" y="50" width="20" height="14" fill={palette.accent} />
      {Array.from({ length: 60 }).map((_, i) => <circle key={i} cx={12 + (i * 8) % 100} cy={70 - (i % 4) * 1.5} r="0.7" fill={palette.fill} />)}
    </svg>
  );
  if (id === 'stadium') return (
    <svg viewBox="0 0 120 80" style={common}>
      {/* open bowl rim */}
      <path d="M 4 36 Q 60 18 116 36 L 116 60 L 4 60 Z" fill="none" stroke={palette.stroke} />
      {/* floodlight masts */}
      {[14, 40, 80, 106].map((x, i) => (
        <g key={i}><line x1={x} y1="36" x2={x} y2="16" stroke="rgba(255,255,255,0.25)" /><rect x={x - 4} y="12" width="8" height="5" fill={palette.accent} opacity="0.8" /></g>
      ))}
      {/* center screen */}
      <rect x="48" y="30" width="24" height="16" fill={palette.accent} opacity="0.8" />
      {/* crowd field */}
      {Array.from({ length: 60 }).map((_, i) => <circle key={i} cx={8 + (i * 9) % 104} cy={62 + (i % 4) * 3.5} r="0.8" fill={palette.fill} />)}
    </svg>
  );
  return null;
}

// ───────────────────────────────────────── Venue picker
export function VenuePicker({ open, onClose, current, onPick }) {
  return (
    <Modal open={open} onClose={onClose} title="Choose a venue" subtitle="JAZZ CLUB · CONCERT HALL · ARENA · DOME · STADIUM">
      <div className="grid grid-cols-3 gap-4">
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
              <div className="text-[12px] text-neutral-500 mt-1">{v.capacity} · {v.city}</div>
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
export function FilePicker({ open, onClose, onUpload, uploadedName, queueLen = 0, queueIndex = -1 }) {
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
        className={`border-2 border-dashed transition-colors p-16 text-center cursor-pointer ${dragOver ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/5' : 'border-white/20 hover:border-[oklch(0.78_0.16_55)]'}`}
      >
        <div className="text-[oklch(0.78_0.16_55)] text-[10px] tracking-[0.3em] uppercase font-mono">↓ DROP HERE</div>
        <div className="text-white text-[28px] font-light mt-3 font-tight">Drop FLAC / WAV / AIFF</div>
        <div className="text-neutral-500 text-[12px] mt-2">여러 파일 선택 가능 · 큐에 추가되어 연속 재생 · 16 / 24-bit · hi-res 지원</div>
        <div className="text-neutral-600 text-[11px] mt-4 font-mono">or click to browse ↗</div>
        {uploadedName && (
          <div className="text-[oklch(0.78_0.16_55)] text-[11px] mt-5 font-mono">
            ▸ NOW · {uploadedName}{queueLen > 1 ? `   ·   QUEUE ${queueIndex + 1}/${queueLen}` : ''}
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
