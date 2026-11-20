// LightPanel.jsx — the lighting desk, bottom left over the scene in the big
// rooms (the arena, the dome, the stadium). A part of the song called here —
// intro through outro — is what the rig and the lightsticks play until AUTO
// hands it back to the song; on AUTO the part the song is in now is lit. It
// folds away to its title, and remembers which it was. The crowd's
// stick/torch switch lives here too.
//
// Keys (App.jsx): 1–9, 0, - for the parts in this order, ` for AUTO.

import { memo, useEffect, useState } from 'react';
import { CrowdLightToggle } from './TopBar.jsx';
import { DESK } from '../lightDesk.js';

const ACCENT = 'oklch(0.78 0.16 55)';
const KEY = 's2c.lightPanel';

// the parts in the order a song runs, with their keys (shared with the FOH screen)
export { DESK };

function loadOpen() {
  try { return window.localStorage.getItem(KEY) === 'open'; } catch { return false; }
}

function LightPanel({ part, onPart, playing, stageRef, crowdLight, onCrowdLightChange }) {
  const [open, setOpen] = useState(loadOpen);
  useEffect(() => {
    try { window.localStorage.setItem(KEY, open ? 'open' : 'closed'); } catch { /* not fatal */ }
  }, [open]);

  // what the song is playing now, read off the stage a few times a second
  // while the desk is open (it is not React state there, it is per frame)
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const read = () => setLive(stageRef.current?.getPart?.().part ?? null);
    read();
    const id = setInterval(read, 200);
    return () => clearInterval(id);
  }, [open, stageRef]);

  const auto = part == null;
  const btn = 'py-1.5 text-[10px] tracking-[0.18em] uppercase border transition-colors disabled:cursor-not-allowed';

  return (
    <div className="absolute bottom-[128px] left-10 z-30 w-[320px] max-w-[36vw] font-mono pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-baseline gap-2 mb-2 text-[10px] tracking-[0.3em] uppercase text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <span className="text-neutral-600">{open ? '▾' : '▸'}</span>
        Lighting
        {/* (on AUTO just that: the song's own part is shown on the desk's
            buttons while it is open, not in the title, where it went stale
            once the desk was folded) */}
        <span className="tracking-[0.2em]" style={{ color: ACCENT }}>
          {auto ? 'auto' : part}
        </span>
      </button>

      {open && (
        <div className="bg-black/50 backdrop-blur-sm border border-white/10 p-2.5 space-y-2">
          <div className="grid grid-cols-4 gap-1">
            {DESK.map(([id, label, key]) => {
              const held = part === id;
              const now = auto && playing && live === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!playing}
                  onClick={() => onPart(id)}
                  aria-pressed={held}
                  className={`${btn} relative ${
                    held
                      ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/20 text-white'
                      : now
                        ? 'border-[oklch(0.78_0.16_55)]/50 bg-[oklch(0.78_0.16_55)]/10 text-neutral-200'
                        : 'border-white/10 text-neutral-400 hover:border-white/30 hover:text-neutral-200 disabled:text-neutral-700 disabled:hover:border-white/10'
                  }`}
                >
                  {label}
                  <span className="absolute top-0.5 right-1 text-[8px] tracking-normal text-neutral-600">{key}</span>
                </button>
              );
            })}
            {/* the chorus's first moment on demand, in the cell after Outro */}
            <button
              type="button"
              disabled={!playing}
              onClick={() => stageRef.current?.hit?.()}
              title="The chorus's first moment: blinders, strobes and the heads' white hit"
              className={`${btn} relative border-white/10 text-neutral-400 hover:border-white/30 hover:text-neutral-200 active:bg-[oklch(0.78_0.16_55)]/30 disabled:text-neutral-700 disabled:hover:border-white/10`}
            >
              Hit
              <span className="absolute top-0.5 right-1 text-[8px] tracking-normal text-neutral-600">+</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPart(null)}
              aria-pressed={auto}
              className={`${btn} flex-1 ${
                auto
                  ? 'border-[oklch(0.78_0.16_55)] bg-[oklch(0.78_0.16_55)]/20 text-white'
                  : 'border-white/10 text-neutral-400 hover:border-white/30 hover:text-neutral-200'
              }`}
            >
              Auto <span className="text-[8px] text-neutral-600 tracking-normal">`</span>
            </button>
            <CrowdLightToggle mode={crowdLight} onChange={onCrowdLightChange} />
          </div>
          {!playing && <div className="text-[9px] tracking-[0.15em] uppercase text-neutral-600">Play a song to call the parts</div>}
        </div>
      )}
    </div>
  );
}

// Memoised: the playback clock re-renders the app several times a second.
export default memo(LightPanel);
