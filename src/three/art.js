// art.js — the sleeve on the stage's screens, and the colour it gives the rig.
//
// The album art is drawn INTO the room now: a texture on the LED walls, framed
// the way a show's content team frames a sleeve, with the title and artist
// under it. That is what lets the listener walk around it — an HTML overlay
// laid over the canvas cannot be hidden behind a truss or seen from the side.
//
// The lighting takes its colours from the sleeve when there is a real one (a
// track's embedded art), and from the app's own palette otherwise: before a
// file is loaded, and for a file that carries no picture.

import * as THREE from 'three';
import { APP, appPalette, drawCover, extractPalette, screenContent } from './core.js';

// The screens before anything is playing: black, with the app's mark small in
// the middle, so the wall reads as switched on and waiting.
function idleSleeve(S = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#050505'; g.fillRect(0, 0, S, S);
  const accent = `#${new THREE.Color(APP.accent).getHexString()}`;
  g.strokeStyle = accent; g.lineWidth = S * 0.012; g.lineCap = 'round';
  g.beginPath(); g.moveTo(S * 0.52, S * 0.36); g.quadraticCurveTo(S * 0.72, S * 0.5, S * 0.52, S * 0.64); g.stroke();
  g.strokeStyle = '#f3ecdc';
  for (const [x, h] of [[0.33, 0.1], [0.38, 0.18], [0.43, 0.07]]) { g.beginPath(); g.moveTo(S * x, S * (0.5 - h / 2)); g.lineTo(S * x, S * (0.5 + h / 2)); g.stroke(); }
  g.fillStyle = 'rgba(243,236,220,0.5)';
  g.font = `400 ${S * 0.032}px "JetBrains Mono", ui-monospace, monospace`;
  g.textAlign = 'center';
  g.fillText('S O N G 2 C O N C E R T', S / 2, S * 0.8);
  return c;
}

function loadSleeve(src, S = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = S;
      const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
      c.getContext('2d').drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, S, S);
      resolve(c);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export function createArt(onChange) {
  const art = {
    canvas: idleSleeve(),
    meta: { title: '', artist: '', label: '' },
    palette: appPalette(),
    tone: 'app',
    coverTex: null,
    cache: new Map(),
    want: null,
    token: 0,

    // Screen content at a given aspect: built once per aspect per sleeve.
    texture(aspect) {
      const k = aspect.toFixed(3);
      if (!this.cache.has(k)) this.cache.set(k, screenContent(this.canvas, this.meta, aspect));
      return this.cache.get(k);
    },

    // The sleeve alone, for the narrow columns and ribbons.
    cover() {
      if (!this.coverTex) {
        this.coverTex = new THREE.CanvasTexture(this.canvas);
        this.coverTex.colorSpace = THREE.SRGBColorSpace;
      }
      return this.coverTex;
    },

    install(canvas, meta, fromArt) {
      for (const t of this.cache.values()) t.dispose();
      this.cache.clear();
      this.coverTex?.dispose(); this.coverTex = null;
      this.canvas = canvas;
      this.meta = meta;
      this.tone = fromArt ? 'art' : 'app';
      this.palette = fromArt ? extractPalette(canvas) : appPalette();
      onChange?.();
    },

    // { coverId, coverSrc, title, artist } from the app. A real picture is
    // loaded before anything changes, so the screens never flash to a
    // placeholder on the way to it.
    async set(want) {
      this.want = want;
      const token = ++this.token;
      const { coverId = null, coverSrc = null, title = null, artist = null } = want || {};
      const meta = title
        ? { title, artist: artist && artist !== '—' ? artist : '', label: 'NOW PLAYING' }
        : { title: '', artist: '', label: '' };
      if (coverSrc) {
        try {
          const c = await loadSleeve(coverSrc);
          if (token === this.token) this.install(c, meta, true);
          return;
        } catch { /* an unreadable picture: fall through to the drawn sleeve */ }
      }
      if (token !== this.token) return;
      this.install(coverId ? drawCover(coverId) : idleSleeve(), meta, false);
    },

    // The drawn sleeves and the screen type use the app's web fonts; once they
    // have loaded, draw again with them.
    refresh() { this.set(this.want); },

    dispose() {
      this.token++;
      for (const t of this.cache.values()) t.dispose();
      this.cache.clear();
      this.coverTex?.dispose(); this.coverTex = null;
    },
  };
  return art;
}
