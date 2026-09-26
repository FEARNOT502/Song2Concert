// useCrowdLight.js — what the crowd holds up in the big rooms, remembered
// between visits: lightsticks under central control ('stick', the default) or
// phone torches ('flash'). Only the arena, the dome and the stadium have a
// crowd lit this way; the switch is shown there and kept for the next visit.

import { useCallback, useEffect, useState } from 'react';

const KEY = 's2c.crowdLight';

function load() {
  // Private mode and a blocked third-party context both throw on access.
  try {
    return window.localStorage.getItem(KEY) === 'flash' ? 'flash' : 'stick';
  } catch {
    return 'stick';
  }
}

export const CROWD_LIGHT_VENUES = ['arena', 'dome', 'stadium'];

export function useCrowdLight() {
  const [mode, setMode] = useState(load);

  useEffect(() => {
    try { window.localStorage.setItem(KEY, mode); } catch { /* not fatal */ }
  }, [mode]);

  // Stable, so TopBar's memo holds and the playback clock does not re-render it.
  const change = useCallback((next) => setMode(next === 'flash' ? 'flash' : 'stick'), []);

  return [mode, change];
}
