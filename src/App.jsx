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
import { useEngine } from './audio/useEngine.js';
import { audioBufferToWav } from './audio/wav.js';
import { extractMetadata } from './audio/metadata.js';

const stripExt = (name) => name.replace(/\.[^.]+$/, '');

// shown before anything is uploaded
const PLACEHOLDER_FILE = {
  name: 'no file loaded',
  track: 'drop a FLAC / WAV to begin',
  artist: '—',
  format: '— · —',
  durSec: 0,
  cover: 'blueRoom', // neutral default art on the stage
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

  // playback queue (raw File objects) + the current track's metadata
  const queueRef = useRef([]);             // File[]
  const [queueLen, setQueueLen] = useState(0);
  const [queueIndex, setQueueIndex] = useState(-1);
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
    const tick = () => {
      if (stopped) return;
      if (engine.isEnded) {
        // track finished → advance to the next queued track, else stop & reset
        const q = queueRef.current;
        if (q.length > 1 && queueIndex < q.length - 1) {
          stopped = true;
          advanceRef.current(queueIndex + 1);
          return;
        }
        setPlaying(false);
        setStatus('ready');
        setTime(0);
        setPulse(0);
        return;
      }
      setTime(engine.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [playing, hasAudio, engine, setStatus, queueIndex]);

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

  // load queue[index] (decode + metadata + play). autoplay defaults true.
  const loadTrack = useCallback(async (index, autoplay = true) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    const f = q[index];
    setQueueIndex(index);

    const ok = await loadFile(f);
    if (!ok) {
      alert(`이 파일을 디코드하지 못했습니다: ${f.name}`);
      return;
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
  }, [engine, loadFile, play, wetDry, volume]);
  advanceRef.current = (i) => loadTrack(i, true); // keep the clock's ref fresh

  // append dropped/selected files to the queue; start playing if idle
  const handleUpload = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    const wasEmpty = queueRef.current.length === 0;
    queueRef.current = queueRef.current.concat(list);
    setQueueLen(queueRef.current.length);
    if (wasEmpty) await loadTrack(0, true);
  };

  const nextTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length < 2) return;
    loadTrack((queueIndex + 1) % q.length, true);
  }, [queueIndex, loadTrack]);

  const prevTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length < 2) return;
    loadTrack((queueIndex - 1 + q.length) % q.length, true);
  }, [queueIndex, loadTrack]);

  // ── export WAV (offline render through current venue) ────────────────────
  const handleExport = async () => {
    if (!hasAudio) { setFilePickerOpen(true); return; }
    setExporting(true);
    try {
      const rendered = await engine.renderOffline(venue);
      const blob = audioBufferToWav(rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stripExt(upload?.name || 'export')} — ${venue.type.toLowerCase()}.wav`;
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

      {/* call-to-action before any file is loaded */}
      {!hasAudio && (
        <button
          onClick={() => setFilePickerOpen(true)}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[120px] z-20 border border-[oklch(0.78_0.16_55)]/60 text-[oklch(0.78_0.16_55)] px-5 py-2.5 text-[10px] tracking-[0.3em] uppercase hover:bg-[oklch(0.78_0.16_55)] hover:text-black transition-colors font-mono"
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
        hasQueue={queueLen > 1}
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
        queueLen={queueLen}
        queueIndex={queueIndex}
      />
      <VenuePicker open={venuePickerOpen} onClose={() => setVenuePickerOpen(false)} current={venueId} onPick={handlePickVenue} />
    </div>
  );
}
