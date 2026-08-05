// useMediaSession.js — the lock screen, the notification shade, the headphone
// button and whatever the car stereo shows.
//
// The queue already advances on its own while the tab is in the background —
// that is driven by real audio events rather than by the animation clock, so it
// survives being minimised (see App.jsx). What it could not do was be
// CONTROLLED from there: the phone's own transport had nothing to talk to, so
// the one place you actually reach for while a record is playing was the one
// place that did nothing.
//
// Two details worth keeping straight:
//
//   · `setPositionState` throws if the numbers are inconsistent — a position
//     past the duration, a duration of zero, anything not finite — and it is
//     called often enough that one bad frame would fill the console. Every value
//     is checked before it goes in.
//   · The album is the VENUE. It is the field the lock screen has room for and
//     nothing else is competing for it, and it is the honest answer to what you
//     are listening to: not the file, the room it is being played in.

import { useEffect } from 'react';

const FALLBACK_ART = `${import.meta.env.BASE_URL}apple-touch-icon.png`;

export function useMediaSession({
  hasAudio, playing, title, artist, album, artworkSrc,
  duration, position, onPlay, onPause, onPrev, onNext, onSeek, hasNext, hasPrev,
}) {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null;

  // ── what is playing ──
  useEffect(() => {
    if (!ms || !window.MediaMetadata) return;
    if (!hasAudio) { ms.metadata = null; return; }
    ms.metadata = new window.MediaMetadata({
      title: title || 'Untitled',
      artist: artist || '',
      album: album || '',
      // The extracted cover is an object URL, which is same-origin and works
      // here. Sizes are declared because some platforms will not show artwork
      // without them, and the extracted image's real size is not known.
      artwork: [{ src: artworkSrc || FALLBACK_ART, sizes: '512x512', type: 'image/png' }],
    });
  }, [ms, hasAudio, title, artist, album, artworkSrc]);

  // ── playing or not ──
  useEffect(() => {
    if (!ms) return;
    ms.playbackState = !hasAudio ? 'none' : (playing ? 'playing' : 'paused');
  }, [ms, hasAudio, playing]);

  // ── the buttons ──
  useEffect(() => {
    if (!ms || typeof ms.setActionHandler !== 'function') return undefined;
    // A handler set to null is how a platform is told to grey the button out,
    // so the enabled state is expressed by passing null rather than by leaving
    // a live handler that does nothing.
    const handlers = {
      play: onPlay,
      pause: onPause,
      previoustrack: hasPrev ? onPrev : null,
      nexttrack: hasNext ? onNext : null,
      seekbackward: (d) => onSeek(Math.max(0, position - (d.seekOffset || 10))),
      seekforward: (d) => onSeek(Math.min(duration, position + (d.seekOffset || 10))),
      seekto: (d) => { if (Number.isFinite(d.seekTime)) onSeek(d.seekTime); },
      stop: onPause,
    };
    for (const [action, fn] of Object.entries(handlers)) {
      // Not every platform implements every action; setting an unknown one
      // throws rather than being ignored.
      try { ms.setActionHandler(action, fn); } catch (e) { /* unsupported here */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { ms.setActionHandler(action, null); } catch (e) { /* noop */ }
      }
    };
  }, [ms, onPlay, onPause, onPrev, onNext, onSeek, hasNext, hasPrev, position, duration]);

  // ── where in the track ──
  useEffect(() => {
    if (!ms || typeof ms.setPositionState !== 'function') return;
    if (!hasAudio || !Number.isFinite(duration) || duration <= 0) {
      try { ms.setPositionState(); } catch (e) { /* noop */ }
      return;
    }
    try {
      ms.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.max(0, Math.min(duration, position || 0)),
      });
    } catch (e) { /* inconsistent for one frame; the next one corrects it */ }
  }, [ms, hasAudio, duration, position]);
}
