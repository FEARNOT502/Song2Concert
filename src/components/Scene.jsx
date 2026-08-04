// Scene.jsx — the venue, rendered in 3D.
//
// Each of the six rooms is a real WebGL scene built from the SAME geometry the
// reverb is computed from (see src/three/venues/frame.js): the room's dimensions,
// where the stage is, how wide it is, and which seat you are in all come out of
// audio/venuerooms.js. So the picture is not an illustration of the venue — it is
// the venue the engine is convolving with, drawn from your seat.
//
// This component owns very little: a canvas, a stage (src/three/stage.js), and
// the HTML overlay carrying the album art and title. The overlay's box is
// projected from the 3D screen inside the room, so the art sits on that screen
// and rides with the camera.

import { useEffect, useRef, useState } from 'react';
import StageArt from './StageArt.jsx';
import { createStage } from '../three/stage.js';

export default function Scene({ venueId, coverId, coverSrc, pulse, title, artist }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const stageRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [host, setHost] = useState({ w: 0, h: 0 });
  const [ok, setOk] = useState(true);

  // ── the stage lives as long as the component does ──
  useEffect(() => {
    // Phones get a cheaper renderer: no bloom, lower pixel ratio. Everything
    // else about the scene is identical.
    const quality = window.matchMedia?.('(max-width: 900px)').matches ? 'low' : 'high';
    const stage = createStage(canvasRef.current, { quality });
    const el = hostRef.current;

    if (stage) {
      stageRef.current = stage;
      stage.attachOverlay(overlayRef.current);
      stage.onLayout(setRect);
    } else {
      setOk(false);
    }

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
    };
  }, []);

  useEffect(() => { stageRef.current?.setVenue(venueId); }, [venueId]);
  useEffect(() => { stageRef.current?.setPulse(pulse); }, [pulse]);

  // Without WebGL the room cannot be drawn, but the record still plays — so the
  // art is laid out in the middle of a black frame instead of vanishing with it.
  const box = ok
    ? rect
    : (host.w ? { x: host.w * 0.28, y: host.h * 0.12, w: host.w * 0.44, h: host.h * 0.76 } : null);

  return (
    <div ref={hostRef} className="absolute inset-0 z-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" style={{ display: ok ? 'block' : 'none' }} />
      <StageArt
        rect={box}
        overlayRef={overlayRef}
        coverId={coverId}
        coverSrc={coverSrc}
        pulse={pulse}
        title={title}
        artist={artist}
      />
    </div>
  );
}
