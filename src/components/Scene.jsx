// Scene.jsx — the venue, rendered in 3D.
//
// Each of the six rooms is a WebGL scene modelled on a real building (see
// src/three/venues): a live house, Blue Square's Shinhan Card Hall, the Lotte
// Concert Hall, the Saitama Super Arena, the Tokyo Dome and Wembley. The
// listener starts at the seat the sound is computed for and can walk from
// there — W A S D, drag to look — while the sound stays at that seat.
//
// This component owns very little: a canvas and a stage (src/three/stage.js).
// The album art and title are drawn on the room's own screens by the stage; the
// HTML version (StageArt) is only the fallback for a browser without WebGL,
// where the record still plays and the art is laid out on a black frame.
//
// Building a room holds the page's thread for a moment, so while one is being
// built (the first one, and each venue change) a loading cover sits over the
// view: the mark, the venue's name and a moving bar, drawn by CSS that keeps
// moving while the thread is busy (index.html has its styles).

import { memo, useEffect, useRef, useState } from 'react';
import StageArt from './StageArt.jsx';
import { BrandMark } from './TopBar.jsx';
import { createStage } from '../three/stage.js';
import { findVenue } from '../data.js';

function LoadingCover({ venueId, mode, done }) {
  return (
    <div className={`s2c-load ${done ? 'is-done' : ''}`} aria-hidden={done} role="status">
      <span className="s2c-load-mark"><BrandMark size={34} /></span>
      <div className="s2c-load-label">Loading venue</div>
      <div className="s2c-load-name">{findVenue(venueId).name}{mode === '360' ? ' 360' : ''}</div>
      <div className="s2c-load-bar"><span /></div>
    </div>
  );
}

function Scene({
  venueId, venueMode = 'general', coverId, coverSrc, pulse = 0, pulseRef = null, title, artist,
  strain = 0, effects = true, playing = false, crowdLight = 'stick', analyser = null,
  songMap = null, clock = null, part = null, seat = null, onSeatChange = null, apiRef = null,
}) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  // Read once, at mount. The stage builds its first room straight away, and a
  // scene that came up with the effects on and dropped them a tick later would
  // pay for them anyway — which is the one thing the switch exists to avoid.
  const effectsAtMount = useRef(effects);
  const [host, setHost] = useState({ w: 0, h: 0 });
  const [ok, setOk] = useState(true);
  // the room being built ({ id, mode }), or null once it is drawn
  const [loading, setLoading] = useState({ id: venueId, mode: venueMode });

  // ── the stage lives as long as the component does ──
  useEffect(() => {
    // Phones get a cheaper renderer: no multisampling, a lower pixel ratio, a
    // thinner crowd, 30 frames a second. The rooms are otherwise the same.
    const quality = window.matchMedia?.('(max-width: 900px)').matches ? 'low' : 'high';
    const stage = createStage(canvasRef.current, {
      quality, effects: effectsAtMount.current,
      onLoading: (on, id, mode) => setLoading(on ? { id, mode } : null),
      onSeatChange: (s) => onSeatChange?.(s),
    });
    const el = hostRef.current;
    if (stage) stageRef.current = stage;
    else { setOk(false); setLoading(null); }
    if (apiRef) apiRef.current = stage;
    // in development, the stage is reachable from the console (and the checks)
    if (import.meta.env.DEV && stage) window.__stage = stage;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setHost({ w: width, h: height });
      stage?.resize(width, height);
    });
    ro.observe(el);
    stage?.resize(el.clientWidth, el.clientHeight);
    stage?.start();

    return () => {
      ro.disconnect();
      stage?.dispose();
      stageRef.current = null;
      if (apiRef) apiRef.current = null;
    };
  }, []);

  useEffect(() => { stageRef.current?.setVenue(venueId, venueMode); }, [venueId, venueMode]);
  useEffect(() => { if (venueId === 'dome') stageRef.current?.setSeat(seat); }, [venueId, seat]);
  useEffect(() => { stageRef.current?.setArt({ coverId, coverSrc, title, artist }); }, [coverId, coverSrc, title, artist]);
  // Stopped, the house lights are up; playing, they go down for the show.
  useEffect(() => { stageRef.current?.setPlaying(playing); }, [playing]);
  useEffect(() => { stageRef.current?.setCrowdLight(crowdLight); }, [crowdLight]);
  // A part of the song called from the lighting desk, or null to follow the song.
  useEffect(() => { stageRef.current?.setPart(part); }, [part]);
  // The engine's analyser, read for the kick drum — nothing is connected to it.
  useEffect(() => { stageRef.current?.setAnalyser(analyser); }, [analyser]);
  // The song's structure (src/songMap.js) and the playback clock to read it by.
  useEffect(() => { stageRef.current?.setSongMap(songMap, clock); }, [songMap, clock]);
  // How hard the audio thread is finding it — see stage.js setStrain. The scene
  // gives frames back when the sound needs them.
  useEffect(() => { stageRef.current?.setStrain(strain); }, [strain]);
  // Switching this rebuilds the room — see stage.js setEffects. It is a no-op
  // when the value has not moved, so the mount pass costs nothing.
  useEffect(() => { stageRef.current?.setEffects(effects); }, [effects]);
  // the scene samples the pulse itself, once per rendered frame, so a loud track
  // does not turn into sixty React renders a second
  useEffect(() => { stageRef.current?.setPulseRef(pulseRef); }, [pulseRef]);
  useEffect(() => { if (!pulseRef) stageRef.current?.setPulse(pulse); }, [pulse, pulseRef]);

  // Without WebGL the room cannot be drawn, but the record still plays — so the
  // art is laid out in the middle of a black frame instead of vanishing with it.
  const box = host.w ? { x: host.w * 0.28, y: host.h * 0.12, w: host.w * 0.44, h: host.h * 0.76 } : null;

  return (
    <div ref={hostRef} className="absolute inset-0 z-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing"
        style={{ display: ok ? 'block' : 'none' }}
        aria-label="공연장 3D 장면. 드래그해서 둘러보고 W A S D로 걸어 다닐 수 있습니다."
      />
      {ok && <LoadingCover venueId={loading?.id || venueId} mode={loading ? loading.mode : venueMode} done={!loading} />}
      {!ok && (
        <StageArt
          rect={box}
          coverId={coverId}
          coverSrc={coverSrc}
          pulse={pulse}
          pulseRef={pulseRef}
          title={title}
          artist={artist}
        />
      )}
    </div>
  );
}

// Memoised: the clock above re-renders the app several times a second, and
// nothing about the room changes when it does.
export default memo(Scene);
