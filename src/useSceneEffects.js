// useSceneEffects.js — the scene's quality switch, remembered between visits.
//
// What it controls is in three/kit.js and three/stage.js: the crowd, the point
// fields, the light shafts and the bloom pass. Off, none of them are built, and
// the room, its seating, the rig and the screens are what is left.
//
// It defaults ON. The scene as designed is the product, and a player that opens
// looking flat to save a machine that was never struggling has made the wrong
// guess. The machine that IS struggling is already handled without being asked —
// see useAudioStrain, which gives frames back the moment the audio thread
// underruns. This switch is for the listener who would rather not wait for that
// to be noticed, and their answer is kept.

import { useCallback, useEffect, useState } from 'react';

const KEY = 's2c.sceneEffects';

function load() {
  // Private mode and a blocked third-party context both throw on access rather
  // than returning null, and neither is a reason to fail to draw a room.
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function useSceneEffects() {
  const [effects, setEffects] = useState(load);

  useEffect(() => {
    try { window.localStorage.setItem(KEY, effects ? '1' : '0'); } catch { /* not fatal */ }
  }, [effects]);

  // Stable, so TopBar's memo holds and the playback clock does not re-render it.
  const change = useCallback((next) => setEffects(!!next), []);

  return [effects, change];
}
