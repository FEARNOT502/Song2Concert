// QueuePanel.jsx — the play queue, shown on the right side. Row 0 is the track
// currently playing (highlighted); the rest are waiting tracks. Click a waiting
// title to jump to it (tracks before it are dropped); click ✕ to remove one.
// Finished tracks are removed automatically by App, so this only ever lists the
// current track + what's still to come. It folds away to its title and count,
// like the lighting desk, and remembers which it was. A waiting row drags by
// its handle into a new place; the track playing stays where it is.

import { memo, useEffect, useState } from 'react';
import { useReorder, moved } from './useReorder.js';

const ACCENT = 'oklch(0.78 0.16 55)';
const KEY = 's2c.queuePanel';

function loadOpen() {
  try { return window.localStorage.getItem(KEY) !== 'closed'; } catch { return true; }
}

function QueuePanel({ queue, onJump, onRemove, onReorder, playing }) {
  const [open, setOpen] = useState(loadOpen);
  const { listRef, handle, dragging } = useReorder({
    count: queue?.length ?? 0, first: 1,
    onMove: (from, to) => onReorder(moved(queue, from, to).map((r) => r.id)),
  });
  useEffect(() => {
    try { window.localStorage.setItem(KEY, open ? 'open' : 'closed'); } catch { /* not fatal */ }
  }, [open]);

  if (!queue || queue.length === 0) return null;

  return (
    <div className="absolute bottom-[128px] right-10 z-30 w-[260px] max-w-[30vw] font-mono pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-baseline justify-between mb-2 text-[10px] tracking-[0.3em] uppercase text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-neutral-600">{open ? '▾' : '▸'}</span>
          Queue
        </span>
        <span className="tracking-[0.2em] text-neutral-600 tabular-nums">{queue.length}</span>
      </button>

      {open && (
        <div ref={listRef} className="max-h-[34vh] overflow-y-auto pr-1 space-y-px">
          {queue.map((row, i) => {
            const current = i === 0;
            return (
              <div
                key={row.id}
                className={`group flex items-center gap-2 px-2.5 py-2 border-l-2 transition-colors ${dragging === i ? 'bg-white/10' : ''} ${
                  current
                    ? 'border-l-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/10'
                    : 'border-l-transparent hover:border-l-white/30 hover:bg-white/5 cursor-pointer'
                }`}
                onClick={current ? undefined : () => onJump(row.id)}
              >
                <span
                  className={`text-[10px] w-4 shrink-0 text-center ${current ? '' : 'text-neutral-600'}`}
                  style={current ? { color: ACCENT } : undefined}
                >
                  {current ? (playing ? '▶' : '⏸') : i}
                </span>
                {!current && <span {...handle(i)} aria-label="순서 바꾸기" className="shrink-0 text-neutral-700 group-hover:text-neutral-400 cursor-grab active:cursor-grabbing select-none text-[11px]">⋮⋮</span>}
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
                    aria-label="큐에서 제거"
                    className="shrink-0 w-4 h-4 flex items-center justify-center text-neutral-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity text-[11px]"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Memoised: the playback clock re-renders the app several times a second.
export default memo(QueuePanel);
