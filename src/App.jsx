// App.jsx — Song2Concert: single full-bleed screen, audience-POV venue scene +
// audiophile-console overlay, driven by a real Web Audio convolution engine.
// Upload-only: drop a FLAC/WAV to hear it re-rendered in the chosen venue.

import { useCallback, useEffect, useRef, useState } from 'react';
import { findVenue } from './data.js';
import Scene from './components/Scene.jsx';
import TopBar from './components/TopBar.jsx';
import BottomTransport from './components/BottomTransport.jsx';
import { LeftDataPanel, RightDataPanel, SeatChip } from './components/Panels.jsx';
import { FilePicker, VenuePicker } from './components/Modals.jsx';
import QueuePanel from './components/QueuePanel.jsx';
import { useEngine } from './audio/useEngine.js';
import { audioBufferToFlac } from './audio/flac.js';
import { extractMetadata } from './audio/metadata.js';

const stripExt = (name) => name.replace(/\.[^.]+$/, '');

// shown before anything is uploaded
const PLACEHOLDER_FILE = {
  name: 'no file loaded',
  track: 'drop a FLAC / WAV to begin',
  artist: '—',
  format: '— · —',
  durSec: 0,
  cover: null, // no art before a file is loaded → plain black on the stage
};

export default function App() {
  // ── state model (CLAUDE_PROMPT.md §3) ───────────────────────────────────
  const [venueId, setVenueId] = useState('jazz');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [wetDry, setWetDry] = useState(findVenue('jazz').position.wet);
  const [volume, setVolume] = useState(85);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [exporting, setExporting] = useState(false);

  // playback queue. The track at index 0 is ALWAYS the one currently loaded;
  // finished / skipped tracks are removed from the front. `queue` state mirrors
  // the File[] in queueRef as lightweight display rows ({ id, name }).
  const queueRef = useRef([]);             // File[] — [current, next, ...]
  const idRef = useRef(0);                 // monotonic id for stable list keys
  const [queue, setQueue] = useState([]);  // [{ id, name }] for display
  const [upload, setUpload] = useState(null); // { name, track, artist, durSec, coverSrc, format }

  const { engine, status, duration, hasAudio, setStatus, loadFile, play, pause } = useEngine();

  // derived
  const venue = findVenue(venueId);

  const displayFile = upload
    ? {
        name: upload.name, track: upload.track, artist: upload.artist,
        format: upload.format, durSec: Math.round(upload.durSec || 0), cover: 'blueRoom',
      }
    : PLACEHOLDER_FILE;
  const effDurSec = hasAudio && duration ? duration : displayFile.durSec;
  const coverSrc = upload?.coverSrc || null;

  // ── push venue → convolver + pre-delay ──────────────────────────────────
  useEffect(() => { engine.setVenue(venue); }, [engine, venue]);

  // ── push wet/dry + volume → graph ───────────────────────────────────────
  useEffect(() => { engine.setWetDry(wetDry); }, [engine, wetDry]);
  useEffect(() => { engine.setVolume(volume); }, [engine, volume]);

  // ── playback clock — reads engine.currentTime each frame while playing ───
  // (loadTrack is declared below; reach it via a ref to dodge the TDZ + deps.)
  const advanceRef = useRef(() => {});
  useEffect(() => {
    if (!playing || !hasAudio) return undefined;
    let raf;
    let stopped = false;
    let advancing = false; // guard so we fire advance() once per track-end
    const tick = () => {
      if (stopped) return;
      if (engine.isEnded) {
        // Track finished → drop it from the queue and play the next one.
        // We keep the RAF loop alive across the advance (do NOT stop it):
        // `playing` stays true while auto-advancing, so this effect never
        // re-runs to restart the loop — if we stopped here, the clock would
        // freeze on the next track. The `advancing` flag prevents firing the
        // async advance more than once before the next track is loaded.
        if (!advancing) { advancing = true; advanceRef.current().finally(() => { advancing = false; }); }
        raf = requestAnimationFrame(tick);
        return;
      }
      setTime(engine.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [playing, hasAudio, engine]);

  // ── pulse animation — AnalyserNode RMS, frozen on pause ──────────────────
  useEffect(() => {
    if (!playing || !hasAudio) { setPulse(0); return undefined; }
    let raf;
    let stopped = false;
    const smooth = { v: 0 };
    const loop = () => {
      if (stopped) return;
      const rms = engine.getRMS();
      const target = Math.min(1, rms * 6);
      smooth.v += (target - smooth.v) * (target > smooth.v ? 0.5 : 0.08);
      setPulse(Math.max(0, smooth.v));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [playing, hasAudio, engine]);

  // ── transport handlers ──────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (!hasAudio) { setFilePickerOpen(true); return; } // nothing loaded → prompt
    if (playing) { pause(); setPlaying(false); }
    else { await play(); setPlaying(true); }
  }, [hasAudio, playing, play, pause]);

  const handleSeek = useCallback((sec) => {
    if (!hasAudio) return;
    setTime(sec);
    engine.seek(sec);
  }, [hasAudio, engine]);

  // ── pickers / state transitions ─────────────────────────────────────────
  const handlePickVenue = (id) => {
    setVenueId(id);
    setWetDry(findVenue(id).position.wet); // reset wet/dry to the venue default
  };

  // Load whatever sits at the FRONT of the queue (index 0) and play it.
  // The queue is consumed from the front, so the current track is always [0].
  const loadFront = useCallback(async (autoplay = true) => {
    const q = queueRef.current;
    if (!q.length) {
      // queue drained → stop & reset to the empty state
      setPlaying(false);
      setStatus('ready');
      setTime(0);
      setPulse(0);
      return;
    }
    const f = q[0];
    const ok = await loadFile(f);
    if (!ok) {
      // skip an undecodable file: drop it and try the next
      queueRef.current = queueRef.current.slice(1);
      setQueue((rows) => rows.slice(1));
      return loadFront(autoplay);
    }
    const fmt = `${(f.name.split('.').pop() || 'PCM').toUpperCase()} · streaming`;
    const meta = await extractMetadata(f);
    setUpload((prev) => {
      if (prev?.coverSrc) URL.revokeObjectURL(prev.coverSrc);
      return {
        name: meta.title || stripExt(f.name),
        track: meta.artist ? stripExt(f.name) : 'uploaded · streaming',
        artist: meta.artist || 'your file',
        durSec: engine.duration,
        coverSrc: meta.coverSrc,
        format: fmt,
      };
    });
    setTime(0);
    engine.setWetDry(wetDry);
    engine.setVolume(volume);
    if (autoplay) { await play(); setPlaying(true); }
  }, [engine, loadFile, play, setStatus, wetDry, volume]);

  // Drop the front (finished/skipped) track, then load the new front.
  const advance = useCallback(async () => {
    queueRef.current = queueRef.current.slice(1);
    setQueue((rows) => rows.slice(1));
    await loadFront(true);
  }, [loadFront]);
  advanceRef.current = advance; // keep the playback clock's ref fresh

  // Jump to a track in the queue by display id: drop everything before it
  // (including the current track), then play it.
  const jumpTo = useCallback(async (id) => {
    const rows = queue;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx <= 0) { if (idx === 0) return; else return; } // 0 is already playing
    queueRef.current = queueRef.current.slice(idx);
    setQueue(rows.slice(idx));
    await loadFront(true);
  }, [queue, loadFront]);

  // Remove a single queued track by id (cannot remove the one playing, index 0).
  const removeFromQueue = useCallback((id) => {
    const idx = queue.findIndex((r) => r.id === id);
    if (idx <= 0) return; // never remove the currently-playing front track here
    queueRef.current = queueRef.current.filter((_, i) => i !== idx);
    setQueue((rows) => rows.filter((r) => r.id !== id));
  }, [queue]);

  // append dropped/selected files to the queue; start playing if idle
  const handleUpload = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    const wasEmpty = queueRef.current.length === 0;
    queueRef.current = queueRef.current.concat(list);
    setQueue((rows) => rows.concat(list.map((f) => ({ id: ++idRef.current, name: stripExt(f.name) }))));
    if (wasEmpty) await loadFront(true);
  };

  // next = drop the front and play the next queued track
  const nextTrack = useCallback(() => {
    if (queueRef.current.length < 2) return;
    advance();
  }, [advance]);

  // prev = restart the current track from the top (finished tracks are gone)
  const prevTrack = useCallback(() => {
    if (!hasAudio) return;
    setTime(0);
    engine.seek(0);
  }, [hasAudio, engine]);

  // ── export FLAC (offline render through current venue) ────────────────────
  const handleExport = async () => {
    if (!hasAudio) { setFilePickerOpen(true); return; }
    setExporting(true);
    try {
      const { buffer, bitDepth } = await engine.renderOffline(venue);
      const blob = await audioBufferToFlac(buffer, { bitDepth });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stripExt(upload?.name || 'export')} — ${venue.type.toLowerCase()}.flac`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // ── keyboard (Space / ←→ / F V / Esc) ───────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') handleSeek(Math.min(effDurSec, time + 5));
      else if (e.key === 'ArrowLeft') handleSeek(Math.max(0, time - 5));
      else if (e.key === 'f' || e.key === 'F') setFilePickerOpen(true);
      else if (e.key === 'v' || e.key === 'V') setVenuePickerOpen(true);
      else if (e.key === 'Escape') {
        setFilePickerOpen(false); setVenuePickerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, handleSeek, time, effDurSec]);

  const audioStatus = hasAudio ? (playing ? 'live' : (status === 'loading' ? 'loading' : 'ready')) : 'demo';

  return (
    <div className="w-screen h-screen bg-black text-neutral-200 overflow-hidden relative font-mono">
      <Scene
        venueId={venueId}
        coverId={displayFile.cover}
        coverSrc={coverSrc}
        pulse={pulse}
        title={upload ? upload.name : null}
        artist={upload ? upload.artist : null}
      />

      {/* hairline grid overlay — "instrument" signal */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      <TopBar
        file={displayFile}
        venue={venue}
        audioStatus={audioStatus}
        onFileClick={() => setFilePickerOpen(true)}
        onVenueClick={() => setVenuePickerOpen(true)}
      />
      <LeftDataPanel venue={venue} />
      <RightDataPanel venue={venue} file={displayFile} />
      <SeatChip venue={venue} />
      <QueuePanel queue={queue} onJump={jumpTo} onRemove={removeFromQueue} playing={playing} />

      {/* call-to-action before any file is loaded — sits BELOW the album art so
          it doesn't cover the cover/caption on the stage */}
      {!hasAudio && (
        <button
          onClick={() => setFilePickerOpen(true)}
          className="absolute bottom-[150px] left-1/2 -translate-x-1/2 z-20 border border-[oklch(0.78_0.16_55)]/60 text-[oklch(0.78_0.16_55)] px-5 py-2.5 text-[10px] tracking-[0.3em] uppercase hover:bg-[oklch(0.78_0.16_55)] hover:text-black transition-colors font-mono"
        >
          ↓ Drop a FLAC / WAV to begin
        </button>
      )}

      {/* shortcuts hint */}
      <div className="absolute bottom-[112px] left-1/2 -translate-x-1/2 z-20 text-[11px] tracking-[0.3em] uppercase text-neutral-600 flex gap-5 font-mono">
        <span>[SPACE] play/pause</span>
        <span>[F] file</span>
        <span>[V] venue</span>
      </div>

      <BottomTransport
        playing={playing}
        onToggle={togglePlay}
        onPrev={prevTrack}
        onNext={nextTrack}
        hasNext={queue.length > 1}
        hasPrev={hasAudio}
        time={time}
        durSec={effDurSec}
        wetDry={wetDry}
        onWetChange={setWetDry}
        onSeek={handleSeek}
        onExport={handleExport}
        exporting={exporting}
        volume={volume}
        onVolumeChange={setVolume}
      />

      <FilePicker
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        onUpload={handleUpload}
        uploadedName={upload?.name}
        queueCount={queue.length}
      />
      <VenuePicker open={venuePickerOpen} onClose={() => setVenuePickerOpen(false)} current={venueId} onPick={handlePickVenue} />
    </div>
  );
}
