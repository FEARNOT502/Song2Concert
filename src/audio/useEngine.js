// useEngine.js — React binding around ConcertEngine.
// Owns a single engine instance for the app lifetime and surfaces the bits the
// UI needs: status, current time, and an imperative handle for transport calls.

import { useEffect, useRef, useState, useCallback } from 'react';
import { ConcertEngine } from './engine.js';

export function useEngine() {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new ConcertEngine();

  // 'demo'    — no real file loaded; UI runs on the synthetic clock
  // 'loading' — decoding/loading a file
  // 'ready'   — file loaded, paused
  // 'live'    — file loaded, playing
  const [status, setStatus] = useState('demo');
  const [duration, setDuration] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);

  // NOTE: we intentionally do NOT destroy on effect cleanup. React StrictMode
  // mounts effects twice in dev (mount→unmount→mount); destroying on the first
  // unmount would close the AudioContext that the re-mounted component still
  // references (→ "Cannot close a closed AudioContext" + dead audio graph).
  // Tear down only when the page itself goes away.
  useEffect(() => {
    const engine = engineRef.current;
    const onUnload = () => engine.destroy();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  const loadFile = useCallback(async (file) => {
    const engine = engineRef.current;
    setStatus('loading');
    try {
      await engine.resume();
      const dur = await engine.loadFile(file);
      setDuration(Number.isFinite(dur) ? dur : 0);
      setHasAudio(true);
      setStatus('ready');
      return true;
    } catch (e) {
      console.error('[engine] load failed', e);
      setStatus('demo');
      setHasAudio(false);
      return false;
    }
  }, []);

  const play = useCallback(async () => {
    const engine = engineRef.current;
    await engine.play();
    if (engine.ready) setStatus('live');
  }, []);

  const pause = useCallback(() => {
    engineRef.current.pause();
    if (engineRef.current.ready) setStatus('ready');
  }, []);

  return {
    engine: engineRef.current,
    status,
    duration,
    hasAudio,
    setStatus,
    loadFile,
    play,
    pause,
  };
}
