# Song2Concert — Claude Code Handoff

A web app that takes a user's FLAC/WAV file and re-renders it as if heard from a specific seat in a real concert venue (jazz club, concert hall, arena, domed stadium, cathedral, recording studio). The UI is a **first-person audience-POV scene** — the viewer is "seated" inside the venue, the album art is shown on the stage, and an **audiophile-console** UI overlay reports the seat position, acoustic signature, and mix.

This document is a self-contained spec — paste it into Claude Code along with the repo and ask it to "build the prototype" or "extend it" and the result should match the reference.

---

## 0 · Reference implementation

The reference HTML prototype lives at `Song2Concert Prototype.html` with sources in `proto/`. Use it as the source of truth for visual treatment; this document explains the **system** so you can extend or rebuild.

```
Song2Concert Prototype.html      # entry point
proto/
  covers.jsx                     # 4 album-art cover designs + <Cover id size/>
  data.jsx                       # FILES + VENUES arrays
  ui.jsx                         # TopBar, BottomTransport, panels, modals
  scenes.jsx                     # 6 venue scene components + <Scene venueId.../>
  app.jsx                        # <App/> with state, mounts everything
```

---

## 1 · Product surface

One full-bleed screen, never paginates. Layered structure:

```
┌──────────────────────────────────────────────────────────────────────┐
│  TopBar:  ●SONG2CONCERT  v0.4   File ▾   Venue ▾   Seat ▾   IN SEAT │
├──────────────────────────────────────────────────────────────────────┤
│  ┌── LeftDataPanel ──┐                       ┌─ RightDataPanel ──┐  │
│  │ SEAT POSITION     │      ╭───────────╮    │ PLAYING           │  │
│  │ Row C · #7        │      │ ALBUM ART │    │ blue room sessions│  │
│  │ direct/wet 22/78  │      │  on stage │    │ JAZZ CLUB sig.    │  │
│  │ first refl +17ms  │      ╰───────────╯    │ RT60 1.2s ...     │  │
│  │                   │     foreground heads  │                   │  │
│  └───────────────────┘  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  └───────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ [⏮] [⏸] [⏭]  03:42/10:51  ━━●━━━  DRY ━━━●━━ WET 78%   A/B  EXPORT │
└──────────────────────────────────────────────────────────────────────┘
```

Three discoverable picker modals (file / venue / seat) overlay this screen — never a separate route.

---

## 2 · Visual language (the "Audiophile Console" system)

Strict palette. Don't introduce new colors without a strong reason.

| Token | Value | Use |
|---|---|---|
| `bg`            | `#000`            | full background |
| `fg`            | `#e5e5e5` (neutral-200) | primary text |
| `fg-dim`        | `#737373` (neutral-500) | labels, meta |
| `fg-deeper`     | `#404040` (neutral-600) | separators, hint text |
| `accent`        | `oklch(0.78 0.16 55)` | warm orange/amber — playhead, "now playing", glows |
| `hairline`      | `rgba(255,255,255,0.10–0.15)` | borders, dividers |
| `glow`          | `oklch(0.78 0.16 55 / 0.3–0.4)` | album art shadow, stage edge |

**No gradients on UI elements** other than these specific places:
- Stage spotlights (radial, `accent` with low alpha)
- Album art "breathing" `box-shadow` that pulses with playback
- Cathedral stained-glass (multi-stop linear → `oklch(0.65 0.22 25)` → `oklch(0.5 0.18 240)` etc.)

### Typography

Three families, no others.

| Family | Use | Loaded weights |
|---|---|---|
| **JetBrains Mono** | Labels, data readouts, ALL UPPERCASE TRACKING-WIDE chrome | 300, 400, 500 |
| **Inter Tight** | Numbers, names, in-modal copy (the "normal-case" content) | 200–900 |
| **Instrument Serif** | Album-cover titles only (never UI) | normal + italic |

Default size for chrome labels: **10px** with **0.2–0.3em letter-spacing**, uppercase.
Hero numbers (e.g. seat label): **22–28px**, **font-weight 300**, Inter Tight, tracking-tight.

### Layout grid

A full-bleed WebGL canvas. Each venue is a real 3D scene (`src/three/`), built from the room model the reverb is computed from, and viewed from the modelled seat. Everything else is absolutely positioned over it with z-layers:

```
z-0   Scene canvas (architecture, rigging, audience, light)
z-10  Album art (HTML overlay, projected onto the 3D stage screen; can pulse, can use real <img>)
z-20  Data overlays (left rail, right rail, seat chip)
z-40  TopBar + BottomTransport (always visible)
z-50  Modals (file / venue / seat picker)
```

The 80px-square hairline grid overlays everything at opacity 0.04 — anchors the eye and signals "instrument".

---

## 3 · State model

```ts
type AppState = {
  fileId:        FileId;      // which audio file
  venueId:       VenueId;     // which venue (jazz | hall | arena | dome | cathedral | studio)
  seatId:        SeatId;      // which seat within that venue
  playing:       boolean;
  time:          number;      // playback position in seconds
  wetDry:        number;      // 0–100 (% wet)
  bypass:        boolean;     // dry/raw bypass toggle
  filePickerOpen, venuePickerOpen, seatPickerOpen: boolean;
};
```

### Derived
- `file = FILES.find(id == fileId)`
- `venue = VENUES.find(id == venueId)`
- `seat = venue.seats.find(id == seatId)`
- `pulse` (0–1, animated via `requestAnimationFrame` while `playing`)

### Transitions
- **`time`** ticks +1s per second while `playing`, wraps at `file.durSec`.
- **`pulse`** is `(sin(t*2)+1)/2 * 0.6 + sin(t*7)*0.2` — a subtle breathing on the album art glow.
- **Switching venue** resets `seatId` to the new venue's first seat and `wetDry` to that seat's `wet`.
- **Switching seat** sets `wetDry` to that seat's `wet`.
- **Switching file** resets `time = 0` (album art changes; venue stays).
- **Bypass** zeros the pulse (the room is "off").

### Keyboard
- `Space` — play/pause
- `←` / `→` — seek ±5s
- `F` / `V` / `S` — open file / venue / seat picker
- `Esc` — close any open modal

---

## 4 · Data shape

```ts
// FILES — demo library, also what's offered in the file picker.
type File = {
  id:       string;     // 'br04'
  name:     string;     // 'blue room — sessions'
  track:    string;     // '04 · so quiet so blue'
  artist:   string;
  file:     string;     // 'eunji_han_so_quiet.flac'
  format:   string;     // 'FLAC · 96/24 · −14.2 LUFS'
  dur:      string;     // '03:42'
  durSec:   number;     // 222
  cover:    CoverId;    // 'blueRoom' | 'symphony' | 'future' | 'neon'
};

// VENUES — the menu of physical spaces.
type Venue = {
  id:        string;            // 'jazz'
  name:      string;            // 'Blue Note Tokyo'
  type:      string;            // 'JAZZ CLUB' (uppercase)
  capacity:  string;            // '280 seats'
  city:      string;
  descKo:    string;            // short Korean tagline shown in left panel
  seats:     Seat[];            // 2–3 named seat positions per venue
  acoustics: { rt60, edt, c80, warmth, level: string };
};

type Seat = {
  id:              string;      // 'C7'
  label:           string;      // 'Row C · #7'
  distance:        string;      // '3.4 m'
  az:              string;      // '0°' azimuth from stage centerline
  direct:          number;      // 0–100, % direct sound
  wet:             number;      // 0–100, % reverb (direct + wet should ≈ 100)
  firstReflection: string;      // '+17 ms'
};
```

The six canonical venues with their acoustic signatures (use these or extend):

| id | name | RT60 | C80 | Character |
|---|---|---|---|---|
| `jazz`      | Blue Note Tokyo            | 1.2 s | +4.2 dB | low ceiling, wood diffusion, intimate |
| `hall`      | Concertgebouw Grote Zaal   | 2.8 s | +1.8 dB | shoebox, coffered ceiling |
| `arena`     | The O2 Arena               | 4.6 s | −1.2 dB | PA-shaped, big delays |
| `dome`      | Tokyo Dome                 | 6.8 s | −4.0 dB | cavernous, delay-cluster PA |
| `cathedral` | Notre-Dame d'Évreux        | 8.4 s | −6.8 dB | 8+ sec reverb tail, low direct |
| `studio`    | Hansa Studio 2 (control)   | 0.18 s | +12 dB | near-dry reference monitoring |

---

## 5 · Scene recipes (the hardest part)

> **Superseded.** The scenes below describe the original SVG recipes. They are now
> real 3D scenes — see `src/three/venues/` and the notes at the top of each file.
> The intent still holds and the recipes are kept as the record of it.

Every scene is a THREE.Group built by `src/three/venues/<id>.js` and rendered by `src/three/stage.js`, with the album art an **HTML overlay** parked on the screen inside the room — `stage.js` projects that screen's corners each frame so the art tracks it. Acoustic feel ≈ visual feel, and it is not left to eye: the room's dimensions, stage position, stage width and listening seat all come from `audio/venuerooms.js`, so the bigger and more reverberant the venue, the smaller the stage in frame and the larger the audience — automatically.

Common ingredients:
- **Foreground audience heads:** `<ellipse>` (body) + `<circle>` (head) in `#000` — large and out-of-focus near bottom of frame, smaller and tighter rows further back.
- **Spotlight cones:** `<polygon>` trapezoids from ceiling to stage edge, filled with a radial `accent` gradient at low alpha.
- **Stage front edge:** thin `accent` line at the platform lip — the single chromatic anchor in every scene.
- **Dust particles:** scatter of small `<circle>`s in `accent` at ~0.1–0.3 opacity in the spotlight area.
- **Album art:** `<Cover id={file.cover} size={...}/>` with `box-shadow` / `drop-shadow` driven by `pulse`.

### 5.1 · Jazz Club
- **Vanishing point:** narrow trapezoid (back wall 720px wide) — viewer is **close** to stage.
- **Walls:** brick pattern (32×14 SVG pattern, `#0c0703` with `#1a1208` grout).
- **Ceiling:** flat `#040303`, low.
- **On stage:** double-bass body, piano, mic stand silhouettes.
- **Audience:** 6 big head silhouettes at the very bottom (overlapping the frame edge).
- **Album art:** 300px, centered, top ~20%. Strong glow.

### 5.2 · Concert Hall
- **Vanishing point:** wider trapezoid, **stage further back** (back wall ~520px wide).
- **Proscenium arch:** thin `accent` outline traced around stage opening.
- **Coffered ceiling:** radiating lines from a vanishing point near the chandelier.
- **Chandelier:** small ellipse with 14 dots ringed around it, soft glow.
- **On stage:** 18 small ellipses + circles in 2 rows (orchestra), 1 conductor.
- **Audience:** 7 rows receding into the distance, head size shrinks with row index, count per row decreases. Total ~80 heads.
- **Album art:** 220px, centered, top ~17%.

### 5.3 · Arena
- **Jumbotron:** 880×280 black rectangle outlined in `accent`, framed by `#1a1208` strips top/bottom.
- **Upper deck:** soft curved silhouette across upper third, dotted with tiny audience dots.
- **Stage:** small platform below jumbotron, tiny figures.
- **Lasers:** 4 thin diagonals — 2 in `oklch(0.78 0.16 310)` (magenta), 2 in `oklch(0.78 0.16 35)` (peach).
- **Crowd:** 14 rows × ~40 dots = a sea of audience filling the bottom half. Phone screens scattered as 3×4px `oklch(0.92 0.08 90)` rects.
- **Album art:** 260px, centered on the jumbotron position.

### 5.4 · Domed Stadium
- **Dome curve:** giant `<path>` arc filling the upper half (`M -200,500 Q 720,-100 1640,500`).
- **Dome ribs / panels:** subtle concentric arcs + radial ribs in `rgba(180,180,200,0.04–0.06)`.
- **Skylight slot:** small horizontal ellipse at top, cool desaturated white.
- **Suspended center jumbotron:** 360×200, hung by a vertical line from the dome apex.
- **PA stacks:** two narrow rectangles at the sides with circular speaker drivers.
- **Field:** sea of crowd — 18 rows × ~50 dots, with even more scattered phone screens.
- **Album art:** 200px on the suspended jumbotron.

### 5.5 · Cathedral
- **Proportions:** emphasize **vertical** — narrow nave, very tall vault.
- **Gothic vault:** pointed arch outline at top (`M 0,0 L 0,180 Q 200,80 360,40 L 720,0 L 1080,40 Q 1240,80 1440,180 L 1440,0 Z` over dark `#04020a`).
- **Side columns:** four receding pairs of stone columns left/right with pointed-arch tops.
- **Rose window:** circle ~50px radius behind the altar, filled with a multi-stop stained-glass linear gradient (red → amber → blue → purple) plus radial spokes.
- **Side stained-glass:** 4 tall pointed-arch windows flanking, same gradient.
- **Light beams:** trapezoidal `oklch(0.85 0.16 60 / 0.16→0)` shafts from windows downward — the "god rays".
- **Altar:** small raised platform, 5 candle flames (tiny `oklch(0.92 0.18 60)` circles with halo).
- **Pews:** 6 rows sparsely populated (every 3rd seat is occupied — feels reverent, not packed).
- **Album art:** 180px on the altar (about 50% from top).

### 5.6 · Recording Studio
- **Proportions:** small room — walls converge sharply.
- **Acoustic foam:** SVG pattern of triangular wedges (`<polygon points="10,2 18,18 2,18"/>` repeating 20×20) across the top wall and side walls. This is the visual fingerprint of a treated room.
- **Mixing console:** wide trapezoid platform across the bottom, populated with 36 vertical faders and 24 small knobs.
- **Studio monitors:** 2 large speaker cabinets (180×260) in foreground left+right, each with woofer + tweeter circles. Tiny `accent` LED on each. The drivers glow with `pulse`.
- **Engineer chair:** silhouetted in the foreground center (the "sweet spot").
- **Sound rays:** two dashed lines from each monitor's tweeter to the sweet spot.
- **No audience.** Studio = solitary listening.
- **Album art:** 200px on the back wall between the monitors (treat it like a display/print).

---

## 6 · Component contracts

### `<Cover id={CoverId} size={number} />`
Renders one of 4 fictional cover designs at a given pixel size. **All measurements inside are derived from `size`** (e.g. `padding: size * 0.05`) so it scales cleanly. Add covers by extending the `map` inside `Cover` in `covers.jsx`.

### `<Scene venueId={VenueId} coverId={CoverId} pulse={number}/>`
Dispatches to the right scene. Pass `pulse=0` when `bypass` is on or `playing` is false to freeze the breathing.

### `<TopBar file venue seat onFileClick onVenueClick onSeatClick/>`
Three click-targets: File, Venue, Seat — each shows the current selection with a `▾` glyph and opens its modal.

### `<BottomTransport playing onToggle onPrev onNext time durSec wetDry onWetChange onSeek onBypass bypass/>`
- The scrubber is clickable to seek.
- The wet/dry slider is clickable.
- A/B and EXPORT WAV are non-functional in the prototype; in production they should compare two impulse responses and render the convolved audio respectively.

### `<LeftDataPanel venue seat/>` · `<RightDataPanel venue file/>` · `<SeatChip venue seat/>`
Pure presentational; read from state. Left panel shows **where you are** (seat-centric), right panel shows **what you're hearing** (file + venue acoustic signature).

### Modals
`<Modal/>` is a shell (backdrop, header, body). The three pickers (`FilePicker`, `VenuePicker`, `SeatPicker`) all use it. Card style is identical: `border-white/15` resting, `border-[accent]` + tinted bg when current/active.

---

## 7 · Production considerations (what the prototype fakes)

Anything from this list that becomes real should be wired in via Web Audio API:

| Faked | How to make it real |
|---|---|
| Playback position counter | `AudioBufferSourceNode.currentTime` |
| Wet/dry slider | `GainNode` cross-fader between dry path and a `ConvolverNode` with the venue's IR |
| Each venue's acoustic signature | Real impulse responses (e.g. OpenAIR, EchoThief) — one IR per `(venue, seat)` pair, or interpolate |
| First-reflection time | Pre-delay before the convolver |
| Pulse animation on album art | Analyser node → RMS → drive `pulse` |
| 102 dB SPL etc. | Estimated from LUFS + venue gain (no real measurement) |
| Bypass | Disconnect the convolver path |
| Export WAV | OfflineAudioContext render → encode to WAV |

For album art uploaded by the user, the `<Cover>` component should accept either a `id` (fictional cover) or a `src` (real image URL extracted from FLAC metadata via `metaflac` / `music-metadata`).

---

## 8 · Acceptance checklist

The build is "done" when:

1. ☐ One full-bleed screen — no separate routes/pages.
2. ☐ All 6 venue scenes render with their architectural cues (brick / proscenium / jumbotron / dome / vault / foam).
3. ☐ The album art is always visible on the venue's "stage" surface — and changes when the file changes.
4. ☐ Top bar shows current file / venue / seat as clickable dropdowns.
5. ☐ Clicking any of the three opens its modal; clicking a card commits the choice and closes the modal.
6. ☐ Switching venue **also** resets seat (to the new venue's default) and wet/dry (to that seat's wet ratio).
7. ☐ Bottom transport works: play/pause toggles, time advances, scrubber + wet/dry are clickable to set values, prev/next file cycle.
8. ☐ Album art has a subtle pulse animation while playing (frozen on pause or bypass).
9. ☐ Left panel shows seat position + direct/wet bar + first reflection.
10. ☐ Right panel shows track + venue acoustic signature (RT60, EDT, C80, warmth, level).
11. ☐ Keyboard: Space, ←/→, F/V/S, Esc.
12. ☐ No new colors outside the palette in §2. No new fonts. No emoji in the chrome.

---

## 9 · How to extend

- **Add a venue:** add the room to `audio/venuerooms.js`, push to `VENUES` in `data.js`, add `src/three/venues/<id>.js` and register it in `src/three/venues/index.js`, add a `VenueThumb` case in `Modals.jsx`.
- **Add a file/cover:** push to `FILES` and add a new `Cover<Name>` component, register in `Cover` map.
- **Real audio:** rewrite `<BottomTransport>` and `<App>` to own an `AudioContext` + load IRs from `/irs/<venue>-<seat>.wav`.
- **Mobile:** the scene renders at whatever size its container is, so it fits the phone hero without cropping; under 900px width the renderer drops bloom and caps pixel ratio, and the data panels collapse into `MobileLayout`.

---

## 10 · One-shot prompt (for pasting into Claude Code)

> Build an interactive prototype of **Song2Concert**, a web app that auralizes a user's FLAC/WAV file as if heard from a specific seat in one of six venues (jazz club, concert hall, arena, domed stadium, cathedral, recording studio). The UI is a single full-bleed screen showing a **first-person audience-POV scene** of the chosen venue, with the file's album art displayed on the stage and an audiophile-console UI overlay (top bar, left/right data panels, bottom transport, three picker modals). Use **React 18 + Tailwind CSS via CDN**. Strict palette: pure black background, white text, a single warm-orange accent `oklch(0.78 0.16 55)`, hairlines in `rgba(255,255,255,0.10–0.15)`. Three fonts only: JetBrains Mono (chrome labels, UPPERCASE 0.2–0.3em tracking), Inter Tight (numbers + names), Instrument Serif (album covers only). Each venue is rendered as a 1440×760 SVG `viewBox` scene with venue-specific architecture (brick walls / proscenium / jumbotron / dome / gothic vault / acoustic foam), foreground audience silhouettes in `#000`, spotlight cones in low-alpha accent gradient, and a centered `<Cover>` component for the album art. Follow `CLAUDE_PROMPT.md` for the full data shape, scene recipes, state model, and acceptance checklist. **Do not invent new colors, fonts, or routes.**
