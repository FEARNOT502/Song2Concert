# Song2Concert · Icon assets

Mark: **Wave → Hall Arc** (icon option 03).

A waveform on the left morphs into a curved hall arc on the right — "audio → space".

## Palette
- Background (dark): `#000000`
- Background (light): `#f3ecdc` (cream)
- Ink on dark: `#f3ecdc`
- Ink on light: `#1a1408`
- Accent: `#e08a3c` ≈ `oklch(0.78 0.16 55)`

## Files

### SVG (master sources — edit these)
- `song2concert-icon-dark.svg` — mark for dark surfaces (24×24 viewBox, 1.6px stroke)
- `song2concert-icon-light.svg` — same mark with ink swapped for light surfaces
- `song2concert-app-icon-tile.svg` — 64×64 padded tile on solid black

### PNG · transparent mark only
`png-transparent/icon-{16,32,48,64,128,192,256,512,1024}.png`
Use on top of any background (dark surfaces preferred). Stroke uses cream ink — for light backgrounds, render `song2concert-icon-light.svg` instead.

### PNG · app tiles (square w/ 12% safe area, solid bg)
- `png-tile-black/app-icon-{180,192,256,512,1024}.png` — black tiles
- `png-tile-cream/app-icon-{192,512}.png` — cream tiles for light-theme installs

### Web favicon & touch icon (ready to ship)
- `favicon-16.png`, `favicon-32.png` — transparent
- `apple-touch-icon.png` — 180×180 black tile

## HTML usage

```html
<link rel="icon" type="image/svg+xml" href="/song2concert-icon-dark.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

## PWA manifest snippet

```json
{
  "name": "Song2Concert",
  "short_name": "S2C",
  "icons": [
    { "src": "/png-tile-black/app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/png-tile-black/app-icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/png-tile-black/app-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "theme_color": "#000000",
  "background_color": "#000000",
  "display": "standalone"
}
```
