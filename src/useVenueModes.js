// useVenueModes.js — how each big room is set out, remembered between visits:
// 'general' (an end stage, as before) or '360' (a centre stage, the house sold
// all round it). Each keeps its own layout and starts at 'general'.
// KSPO DOME also switches the PA and listener geometry with the layout.

import { GYM_ID } from './three/gymnastic-arena-plan.js';
import { useCallback, useEffect, useState } from 'react';

const KEY = 's2c.venueModes';

export const ROUND_VENUES = ['arena', 'dome', 'stadium', GYM_ID];
export const VENUE_MODES = ['general', '360'];

function load() {
  // Private mode and a blocked third-party context both throw on access.
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    const out = {};
    for (const id of ROUND_VENUES) if (v[id] === '360') out[id] = '360';
    if (v.theater === 'op') out.theater = 'op';
    return out;
  } catch {
    return {};
  }
}

// The mode a venue is shown in: its remembered one, 'general' for the rest.
export const modeOf = (modes, id) => id === 'theater' ? (modes[id] === 'op' ? 'op' : 'general') : (ROUND_VENUES.includes(id) && modes[id] === '360' ? '360' : 'general');

export function useVenueModes() {
  const [modes, setModes] = useState(load);

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(modes)); } catch { /* not fatal */ }
  }, [modes]);

  // Stable, so the memoised chrome that takes it holds.
  const setMode = useCallback((id, mode) => {
    if (!ROUND_VENUES.includes(id) && id !== 'theater') return;
    const next = id === 'theater' ? (mode === 'op' ? 'op' : 'general') : (mode === '360' ? '360' : 'general');
    setModes((m) => (modeOf(m, id) === next ? m : { ...m, [id]: next }));
  }, []);

  return [modes, setMode];
}
