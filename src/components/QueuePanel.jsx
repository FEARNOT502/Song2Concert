// QueuePanel.jsx — the play queue, shown on the right side. Row 0 is the track
// currently playing (highlighted); the rest are waiting tracks. Click a waiting
// title to jump to it (tracks before it are dropped); click ✕ to remove one.
// Finished tracks are removed automatically by App, so this only ever lists the
// current track + what's still to come.

import { memo } from 'react';

const ACCENT = 'oklch(0.78 0.16 55)';

function QueuePanel({ queue, onJump, onRemove, playing }) {
  if (!queue || queue.length === 0) return null;

  return (
    <div className="absolute bottom-[128px] right-10 z-30 w-[260px] max-w-[30vw] font-mono pointer-events-auto">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-400">Queue</div>
        <div className="text-[10px] tracking-[0.2em] text-neutral-600 tabular-nums">{queue.length}</div>
      </div>

      <div className="max-h-[34vh] overflow-y-auto pr-1 space-y-px">
        {queue.map((row, i) => {
          const current = i === 0;
          return (
            <div
              key={row.id}
              className={`group flex items-center gap-2 px-2.5 py-2 border-l-2 transition-colors ${
                current
                  ? 'border-l-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/10'
                  : 'border-l-transparent hover:border-l-white/30 hover:bg-white/5 cursor-pointer'
              }`}
              onClick={current ? undefined : () => onJump(row.id)}
              title={current ? '재생 중' : '클릭하면 이 곡으로 이동'}
            >
              <span
                className={`text-[10px] w-4 shrink-0 text-center ${current ? '' : 'text-neutral-600'}`}
                style={current ? { color: ACCENT } : undefined}
              >
                {current ? (playing ? '▶' : '⏸') : i}
              </span>
              <span
                className={`flex-1 truncate text-[12px] tracking-normal normal-case font-tight ${
                  current ? 'text-white' : 'text-neutral-300'
                }`}
              >
                {row.name}
              </span>
              {!current && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(row.id); }}
                  className="shrink-0 w-4 h-4 flex items-center justify-center text-neutral-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity text-[11px]"
                  title="큐에서 제거"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Memoised: the playback clock re-renders the app several times a second.
export default memo(QueuePanel);
