# Song2Concert

Auralize a FLAC/WAV file as if heard from a chosen seat in one of six venues
(jazz club · concert hall · arena · domed stadium · cathedral · recording
studio). One full-bleed, first-person audience-POV screen with an audiophile-
console overlay, built on a real **Web Audio API convolution-reverb** engine.

## Run

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # production build to dist/
```

## How it works

**UI** follows `CLAUDE_PROMPT.md` exactly: strict black / white / amber palette
(`oklch(0.78 0.16 55)`), three fonts (JetBrains Mono · Inter Tight · Instrument
Serif), and a 1440×760 SVG scene per venue. No routing — pickers are overlays.

**Audio** (`src/audio/`):

- Streaming source — uploaded files play through a hidden `<audio>` element via
  `createMediaElementSource()`, so large hi-res files are **not** loaded into one
  in-memory `AudioBuffer`.
- Routing — `source → dryGain → master` (dry) and
  `source → preDelay → convolver → wetGain → master` (wet). The wet/dry slider
  is an equal-power crossfader; pre-delay is the seat's first-reflection time;
  **Bypass** mutes the convolver path (100 % dry).
- Impulse responses are synthesized per venue from its acoustic params
  (`src/audio/impulse.js`); production would swap in measured IRs.
- Autoplay policy — `AudioContext.resume()` fires on the first user gesture.
- The album-art **pulse** is driven by an `AnalyserNode` RMS read each frame
  (sine fallback for the demo library), frozen on pause / bypass.
- **Export WAV** renders the current file through the venue offline.

When you drop in a real file, embedded **cover art + title/artist** are read
straight from the header (FLAC `PICTURE`/`VORBIS_COMMENT`, ID3v2 `APIC`/`TIT2`/
`TPE1`) without pulling the hi-res payload into memory (`src/audio/metadata.js`).

The demo library tracks have no audio payload (they exercise the visual/state
system); drop a real FLAC/WAV via **File ▾** to hear the reverb and export.

## Source map

```
src/
  App.jsx                    state model, clock, pulse, keyboard, transitions
  data.js                    FILES + VENUES (+ per-venue IR synthesis params)
  components/
    Cover.jsx                4 album covers + real-image (src) support
    Scene.jsx                6 venue SVG scenes + dispatcher
    TopBar.jsx               file / venue / seat dropdowns + engine status
    BottomTransport.jsx      play, scrubber, wet/dry, bypass, export
    Panels.jsx               left / right data rails + seat chip
    Modals.jsx               modal shell, venue thumbs, 3 pickers
  audio/
    engine.js                ConcertEngine — the Web Audio graph
    useEngine.js             React binding
    impulse.js               synthetic IR generator
    metadata.js              FLAC/ID3v2 cover-art + title/artist extraction
    wav.js                   AudioBuffer → 16-bit WAV
```

## Keyboard

`Space` play/pause · `←` / `→` seek ±5s · `F` / `V` / `S` pickers · `Esc` close.
