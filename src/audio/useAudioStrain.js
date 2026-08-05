// useAudioStrain.js — turn the audio thread's underrun count into a number the
// scene can act on.
//
// The engine reports what the browser reports: the share of render quanta that
// missed their deadline in the last second (see ConcertEngine._watchLoad). That
// is the crackle itself, not a proxy for it, so the response can be direct.
//
// The policy is deliberately asymmetric. Underruns are audible immediately, so
// one bad second escalates at once; recovery waits, because a scene that steps
// its quality up and down every second is worse to look at than one that stays
// where it landed, and because the load that caused the underrun is usually
// still there — a laptop does not go back on mains by itself.
//
// Where the browser does not implement renderCapacity (everything outside
// Chromium today) this stays at zero and the scene keeps its own frame-cost
// governor, which is what it had before.

import { useEffect, useState } from 'react';

// Any underrun at all is a click somebody heard. There is no threshold below
// which this is acceptable, so the test is against zero rather than a rate.
const CLEAN_SECONDS_TO_RECOVER = 12;
const MAX_STRAIN = 2;

export function useAudioStrain(engine, active) {
  const [strain, setStrain] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const load = engine.getLoad();
    if (!load.supported) return undefined;

    let clean = 0;
    const id = setInterval(() => {
      const { underrun } = engine.getLoad();
      if (underrun > 0) {
        clean = 0;
        setStrain((s) => Math.min(MAX_STRAIN, s + 1));
      } else if (++clean >= CLEAN_SECONDS_TO_RECOVER) {
        clean = 0;
        setStrain((s) => Math.max(0, s - 1));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [engine, active]);

  return strain;
}
