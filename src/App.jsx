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
import MobileLayout from './components/MobileLayout.jsx';
import { useIsMobile } from './useIsMobile.js';
import { useMediaSession } from './useMediaSession.js';
import { useEngine } from './audio/useEngine.js';
import { useAudioStrain } from './audio/useAudioStrain.js';
import { audioBufferToFlac } from './audio/flac.js';
import { extractMetadata } from './audio/metadata.js';

// How the export's two halves divide the progress bar. Rendering the venue
// offline is a convolution plus six worklets over the whole track and its tail;
// encoding is libFLAC over the result. The render is the longer of the two by
// some margin, so it owns most of the bar.
const RENDER_SHARE = 0.72;

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
  const [venueId, setVenueId] = useState('stadium');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [wetDry, setWetDry] = useState(findVenue('stadium').position.wet);
  const [volume, setVolume] = useState(85);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  // the scene reads this every frame; `pulse` state exists only for the DOM
  const pulseRef = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0); // 0..1 while exporting

  // playback queue. The track at index 0 is ALWAYS the one currently loaded;
  // finished / skipped tracks are removed from the front. `queue` state mirrors
  // the File[] in queueRef as lightweight display rows ({ id, name }).
  const queueRef = useRef([]);             // File[] — [current, next, ...]
  const idRef = useRef(0);                 // monotonic id for stable list keys
  const [queue, setQueue] = useState([]);  // [{ id, name }] for display
  const [upload, setUpload] = useState(null); // { name, track, artist, durSec, coverSrc, format }

  const { engine, status, duration, hasAudio, setStatus, loadFile, play, pause } = useEngine();
  const isMobile = useIsMobile();
  // The scene draws less when the audio thread starts missing its deadline.
  const strain = useAudioStrain(engine, playing);

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
  // Advance exactly once per track-end. Shared by BOTH the rAF poll (foreground)
  // and the engine's end-of-track event (fires while backgrounded), so the two
  // can never double-advance and skip a track.
  const advancingRef = useRef(false);
  const handleEnded = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    advanceRef.current().finally(() => { advancingRef.current = false; });
  }, []);

  // Drive auto-advance off the engine's REAL end-of-track event (audio 'ended' /
  // buffer-source onended). These fire even when the tab/window is minimized or
  // not on top — unlike requestAnimationFrame, which the browser pauses in the
  // background — so the queue keeps moving without the page being focused.
  useEffect(() => {
    engine.onended = handleEnded;
    return () => { if (engine.onended === handleEnded) engine.onended = null; };
  }, [engine, handleEnded]);

  // ── playback clock + pulse, in one loop ──────────────────────────────────
  //
  // These used to be two requestAnimationFrame loops, each calling setState on
  // every frame, which re-rendered the whole tree sixty times a second next to a
  // convolution engine and a stack of audio worklets. That is what was breaking
  // playback up: the audio thread is separate, but it does not get a whole core
  // to itself, and a main thread that never yields starves it.
  //
  // Now one loop. The 3D scene reads the pulse straight off `pulseRef` every
  // frame — no React involved — and state is written only fast enough for what
  // it actually drives: a clock that shows seconds, and a glow behind the art.
  useEffect(() => {
    if (!playing || !hasAudio) { pulseRef.current = 0; setPulse(0); return undefined; }
    let raf;
    let stopped = false;
    let lastTime = -1;
    let lastPulse = -1;
    const smooth = { v: 0 };
    const loop = () => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (engine.isEnded) {
        // Track finished → advance (foreground fallback; the engine event above
        // is the primary trigger and also covers the backgrounded case). The
        // loop stays alive across the advance: `playing` stays true while
        // auto-advancing, so this effect never re-runs to restart it.
        handleEnded();
        return;
      }
      const rms = engine.getRMS();
      const target = Math.min(1, rms * 6);
      // gentler attack than before: the lights should swell, not snap
      smooth.v += (target - smooth.v) * (target > smooth.v ? 0.22 : 0.06);
      const p = Math.max(0, smooth.v);
      pulseRef.current = p;

      const t = engine.currentTime;
      if (Math.abs(t - lastTime) >= 0.2) { lastTime = t; setTime(t); }
      if (Math.abs(p - lastPulse) >= 0.06) { lastPulse = p; setPulse(p); }
    };
    raf = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [playing, hasAudio, engine, handleEnded]);

  // ── transport handlers ──────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    if (!hasAudio) { setFilePickerOpen(true); return; } // nothing loaded → prompt
    if (playing) { pause(); setPlaying(false); }
    else { await play(); setPlaying(true); }
  }, [hasAudio, playing, play, pause]);

  // Explicit play and pause, rather than the toggle. A lock screen sends the
  // action it wants — and sends it again if it thinks the first one was missed —
  // so a toggle wired to both would answer a second `play` by pausing.
  const resumePlayback = useCallback(async () => {
    if (!hasAudio || playing) return;
    await play();
    setPlaying(true);
  }, [hasAudio, playing, play]);

  const pausePlayback = useCallback(() => {
    if (!playing) return;
    pause();
    setPlaying(false);
  }, [playing, pause]);

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
    // Now that this track is running, decode the next one. Deferred by a moment
    // so it does not land on the same tick as the graph starting up — the decode
    // itself is off the main thread, but reading a hi-res file into memory is
    // not, and the start of a track is the worst time to do it.
    readAheadRef.current(1500);
  }, [engine, loadFile, play, setStatus, wetDry, volume]);

  // Decode the track AFTER the current one, so switching to it costs nothing.
  // Called whenever the queue changes shape or a new track starts.
  const readAheadTimer = useRef(0);
  const readAhead = useCallback((delay = 0) => {
    clearTimeout(readAheadTimer.current);
    const next = queueRef.current[1];
    if (!next) return;
    readAheadTimer.current = setTimeout(() => engine.prepareNext(next), delay);
  }, [engine]);
  const readAheadRef = useRef(readAhead);
  readAheadRef.current = readAhead;
  useEffect(() => () => clearTimeout(readAheadTimer.current), []);

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
    // Removing the track that was queued next makes the decoded buffer waste,
    // and whatever moved up into its place is now worth having ready instead.
    if (idx === 1) readAheadRef.current(0);
  }, [queue]);

  // append dropped/selected files to the queue; start playing if idle
  const handleUpload = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    const wasEmpty = queueRef.current.length === 0;
    queueRef.current = queueRef.current.concat(list);
    setQueue((rows) => rows.concat(list.map((f) => ({ id: ++idRef.current, name: stripExt(f.name) }))));
    if (wasEmpty) { await loadFront(true); return; }
    // Something is already playing and these went behind it. If one of them is
    // now the next track, start decoding it — the point of the read-ahead is
    // that it is done long before it is needed.
    readAhead(1500);
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
    setExportProgress(0);
    try {
      const { buffer, bitDepth } = await engine.renderOffline(venue, {
        onProgress: (p) => setExportProgress(p * RENDER_SHARE),
      });
      const blob = await audioBufferToFlac(buffer, {
        bitDepth,
        onProgress: (p) => setExportProgress(RENDER_SHARE + p * (1 - RENDER_SHARE)),
      });
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
      setExportProgress(0);
    }
  };

  // ── lock screen / headphone buttons / car stereo ────────────────────────────
  useMediaSession({
    hasAudio,
    playing,
    title: displayFile.name,
    artist: upload?.artist || '',
    // The room is what you are listening to, and it is the field the lock screen
    // has spare. See useMediaSession.js.
    album: `${venue.name} · Song2Concert`,
    artworkSrc: coverSrc,
    duration: effDurSec,
    position: time,
    onPlay: resumePlayback,
    onPause: pausePlayback,
    onPrev: prevTrack,
    onNext: nextTrack,
    onSeek: handleSeek,
    hasNext: queue.length > 1,
    hasPrev: hasAudio,
  });

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

  // Shared pickers — rendered in both layouts.
  const pickers = (
    <>
      <FilePicker
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        onUpload={handleUpload}
        uploadedName={upload?.name}
        queueCount={queue.length}
      />
      <VenuePicker open={venuePickerOpen} onClose={() => setVenuePickerOpen(false)} current={venueId} onPick={handlePickVenue} />
    </>
  );

  if (isMobile) {
    return (
      <>
        <MobileLayout
          venue={venue}
          displayFile={displayFile}
          coverSrc={coverSrc}
          pulse={pulse}
          pulseRef={pulseRef}
          upload={upload}
          audioStatus={audioStatus}
          hasAudio={hasAudio}
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
          exportProgress={exportProgress}
          volume={volume}
          onVolumeChange={setVolume}
          onFileClick={() => setFilePickerOpen(true)}
          onVenueClick={() => setVenuePickerOpen(true)}
          strain={strain}
        />
        {pickers}
      </>
    );
  }

  return (
    <div className="w-screen h-screen bg-black text-neutral-200 overflow-hidden relative font-mono">
      <Scene
        venueId={venueId}
        coverId={displayFile.cover}
        coverSrc={coverSrc}
        pulse={pulse}
        pulseRef={pulseRef}
        title={upload ? upload.name : null}
        artist={upload ? upload.artist : null}
        strain={strain}
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
        exportProgress={exportProgress}
        volume={volume}
        onVolumeChange={setVolume}
      />

      {pickers}
    </div>
  );
}
