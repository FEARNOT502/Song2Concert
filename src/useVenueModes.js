// useVenueModes.js — how each big room is set out, remembered between visits:
// 'general' (an end stage, as before) or '360' (a centre stage, the house sold
// all round it). Only the arena, the dome and the stadium have the choice;
// each keeps its own, and starts at 'general'. The sound is the same either
// way: the room being convolved does not change, only the picture of it.

import { useCallback, useEffect, useState } from 'react';

const KEY = 's2c.venueModes';

export const ROUND_VENUES = ['arena', 'dome', 'stadium'];
export const VENUE_MODES = ['general', '360'];

function load() {
  // Private mode and a blocked third-party context both throw on access.
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    const out = {};
    for (const id of ROUND_VENUES) if (v[id] === '360') out[id] = '360';
    return out;
  } catch {
    return {};
  }
}

// The mode a venue is shown in: its remembered one, 'general' for the rest.
export const modeOf = (modes, id) => (ROUND_VENUES.includes(id) && modes[id] === '360' ? '360' : 'general');

export function useVenueModes() {
  const [modes, setModes] = useState(load);

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(modes)); } catch { /* not fatal */ }
  }, [modes]);

  // Stable, so the memoised chrome that takes it holds.
  const setMode = useCallback((id, mode) => {
    if (!ROUND_VENUES.includes(id)) return;
    setModes((m) => (modeOf(m, id) === mode ? m : { ...m, [id]: mode === '360' ? '360' : 'general' }));
  }, []);

  return [modes, setMode];
}
