// ─────────────────────────────────────────────────────────────────────────────
// tags: title, artist, album and the embedded sleeve, read straight from the
// file's bytes — MP3 (ID3v2.2–2.4, ID3v1), FLAC, OGG Vorbis/Opus, M4A/MP4 and
// WAV/AIFF (an ID3 chunk or RIFF INFO). Nothing leaves the page.
// ─────────────────────────────────────────────────────────────────────────────

const Tags = {
  ascii(b, o, n) { let s = ''; for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s; },
  be32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; },
  le32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; },
  syncsafe(b, o) { return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f); },
  text(bytes, enc = 'utf-8') {
    // UTF-16 with a byte-order mark: the decoder has to be told which way round
    if (enc === 'utf-16') { enc = bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-16le'; if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) bytes = bytes.subarray(2); }
    try { return new TextDecoder(enc).decode(bytes).replace(/\u0000+$/, '').split('\u0000')[0].trim(); } catch { return ''; }
  },
  // FF 00 → FF
  unsync(b) {
    const out = new Uint8Array(b.length);
    let n = 0;
    for (let i = 0; i < b.length; i++) { out[n++] = b[i]; if (b[i] === 0xff && b[i + 1] === 0) i++; }
    return out.subarray(0, n);
  },
  sniff(bytes) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (this.ascii(bytes, 0, 4) === 'RIFF' && this.ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
    if (this.ascii(bytes, 0, 3) === 'GIF') return 'image/gif';
    return '';
  },

  async read(file) {
    const b = new Uint8Array(await file.arrayBuffer());
    const out = { title: '', artist: '', album: '', picture: null };
    const head = this.ascii(b, 0, 4);
    try {
      if (head.startsWith('ID3')) {
        const end = 10 + this.syncsafe(b, 6);
        this.id3(b, 0, out);
        if (this.ascii(b, end, 4) === 'fLaC') this.flac(b, end, out);
      } else if (head === 'fLaC') this.flac(b, 0, out);
      else if (head === 'OggS') this.ogg(b, out);
      else if (this.ascii(b, 4, 4) === 'ftyp') this.mp4(b, out);
      else if (head === 'RIFF') this.riff(b, out);
      else if (head === 'FORM') this.aiff(b, out);
      if (!out.title && b.length > 128 && this.ascii(b, b.length - 128, 3) === 'TAG') this.id3v1(b, out);
    } catch (e) { console.warn('tags', e); }
    if (out.picture && !out.picture.mime) out.picture.mime = this.sniff(out.picture.bytes) || 'image/jpeg';
    return out;
  },

  pick(out, pic, type) {
    // the front cover wins; otherwise the first picture there is
    if (!out.picture || (type === 3 && out.picture.type !== 3)) out.picture = { ...pic, type };
  },

  id3(b, o, out) {
    const ver = b[o + 3], flags = b[o + 5];
    const size = this.syncsafe(b, o + 6);
    let tag = b.subarray(o + 10, o + 10 + size);
    if (ver < 4 && (flags & 0x80)) tag = this.unsync(tag);
    let p = 0;
    if (flags & 0x40) p = ver === 3 ? 4 + this.be32(tag, 0) : this.syncsafe(tag, 0);
    const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
    const enc = ['latin1', 'utf-16', 'utf-16be', 'utf-8'];
    while (p + hdr <= tag.length) {
      const id = this.ascii(tag, p, idLen);
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const len = ver === 2 ? (tag[p + 3] << 16) | (tag[p + 4] << 8) | tag[p + 5] : ver === 4 ? this.syncsafe(tag, p + 4) : this.be32(tag, p + 4);
      const f2 = ver === 2 ? 0 : tag[p + 9];
      let d = tag.subarray(p + hdr, p + hdr + len);
      p += hdr + len;
      if (ver === 3 && (f2 & 0xc0)) continue;              // compressed or encrypted
      if (ver === 4) {
        if (f2 & 0x0c) continue;
        if (f2 & 0x01) d = d.subarray(4);                   // data length indicator
        if (f2 & 0x02) d = this.unsync(d);
      }
      if (!d.length) continue;
      const e = enc[d[0]] || 'latin1';
      if (id === 'TIT2' || id === 'TT2') out.title ||= this.text(d.subarray(1), e);
      else if (id === 'TPE1' || id === 'TP1') out.artist ||= this.text(d.subarray(1), e);
      else if ((id === 'TPE2' || id === 'TP2') && !out.artist) out.artist = this.text(d.subarray(1), e);
      else if (id === 'TALB' || id === 'TAL') out.album ||= this.text(d.subarray(1), e);
      else if (id === 'APIC' || id === 'PIC') {
        let q = 1, mime;
        if (id === 'PIC') { const f = this.ascii(d, 1, 3).toUpperCase(); mime = f === 'PNG' ? 'image/png' : 'image/jpeg'; q = 4; }
        else { const z = d.indexOf(0, 1); mime = this.ascii(d, 1, z - 1).toLowerCase(); q = z + 1; if (mime && !mime.includes('/')) mime = `image/${mime === 'jpg' ? 'jpeg' : mime}`; }
        const type = d[q++];
        // the description, terminated by one zero (latin1/utf-8) or two (utf-16)
        if (d[0] === 1 || d[0] === 2) { while (q + 1 < d.length && (d[q] || d[q + 1])) q += 2; q += 2; }
        else { while (q < d.length && d[q]) q++; q++; }
        this.pick(out, { bytes: d.slice(q), mime }, type);
      }
    }
  },

  id3v1(b, out) {
    const o = b.length - 128;
    const t = (a, n) => this.text(b.subarray(o + a, o + a + n), 'latin1');
    out.title ||= t(3, 30); out.artist ||= t(33, 30); out.album ||= t(63, 30);
  },

  // "KEY=value" comments, shared by FLAC and OGG
  vorbis(b, o, out) {
    const vlen = this.le32(b, o); o += 4 + vlen;
    const n = this.le32(b, o); o += 4;
    const dec = new TextDecoder('utf-8');
    for (let i = 0; i < n && o + 4 <= b.length; i++) {
      const len = this.le32(b, o); o += 4;
      const s = dec.decode(b.subarray(o, o + len)); o += len;
      const eq = s.indexOf('=');
      if (eq < 0) continue;
      const k = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1);
      if (k === 'TITLE') out.title ||= v.trim();
      else if (k === 'ARTIST') out.artist ||= v.trim();
      else if (k === 'ALBUMARTIST' && !out.artist) out.artist = v.trim();
      else if (k === 'ALBUM') out.album ||= v.trim();
      else if (k === 'METADATA_BLOCK_PICTURE') { try { this.flacPicture(this.b64(v), 0, out); } catch { /* malformed */ } }
      else if (k === 'COVERART') { try { this.pick(out, { bytes: this.b64(v), mime: '' }, 3); } catch { /* malformed */ } }
    }
  },
  b64(s) { const bin = atob(s.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },

  flacPicture(b, o, out) {
    const type = this.be32(b, o); o += 4;
    const ml = this.be32(b, o); o += 4;
    const mime = this.ascii(b, o, ml); o += ml;
    const dl = this.be32(b, o); o += 4 + dl + 16;
    const len = this.be32(b, o); o += 4;
    this.pick(out, { bytes: b.slice(o, o + len), mime }, type);
  },

  flac(b, o, out) {
    o += 4;
    for (let last = false; !last && o + 4 <= b.length;) {
      const h = b[o]; last = !!(h & 0x80);
      const type = h & 0x7f, len = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
      o += 4;
      if (type === 4) this.vorbis(b, o, out);
      else if (type === 6) this.flacPicture(b, o, out);
      o += len;
    }
  },

  // put the stream's packets back together until the comment header turns up
  ogg(b, out) {
    let o = 0, packet = [], count = 0;
    while (o + 27 <= b.length && this.ascii(b, o, 4) === 'OggS' && count < 3) {
      const nseg = b[o + 26];
      let p = o + 27 + nseg;
      for (let i = 0; i < nseg; i++) {
        const lace = b[o + 27 + i];
        packet.push(b.subarray(p, p + lace)); p += lace;
        if (lace < 255) {
          const len = packet.reduce((s, x) => s + x.length, 0);
          const pk = new Uint8Array(len);
          let q = 0; for (const x of packet) { pk.set(x, q); q += x.length; }
          packet = [];
          count++;
          if (pk[0] === 3 && this.ascii(pk, 1, 6) === 'vorbis') { this.vorbis(pk, 7, out); return; }
          if (this.ascii(pk, 0, 8) === 'OpusTags') { this.vorbis(pk, 8, out); return; }
        }
      }
      o = p;
    }
  },

  mp4(b, out) {
    const walk = (s, e, fn) => {
      for (let o = s; o + 8 <= e;) {
        let size = this.be32(b, o), hdr = 8;
        const type = this.ascii(b, o + 4, 4);
        if (size === 1) { size = this.be32(b, o + 8) * 4294967296 + this.be32(b, o + 12); hdr = 16; }
        else if (size === 0) size = e - o;
        if (size < hdr) return;
        fn(type, o + hdr, Math.min(e, o + size));
        o += size;
      }
    };
    const data = (s, e) => { let r = null; walk(s, e, (t, a, z) => { if (t === 'data' && !r) r = { kind: this.be32(b, a) & 0xffffff, bytes: b.subarray(a + 8, z) }; }); return r; };
    walk(0, b.length, (t, a, z) => {
      if (t !== 'moov') return;
      walk(a, z, (t2, a2, z2) => {
        if (t2 !== 'udta') return;
        walk(a2, z2, (t3, a3, z3) => {
          if (t3 !== 'meta') return;
          walk(a3 + 4, z3, (t4, a4, z4) => {
            if (t4 !== 'ilst') return;
            walk(a4, z4, (key, a5, z5) => {
              const d = data(a5, z5);
              if (!d) return;
              const txt = () => this.text(d.bytes, 'utf-8');
              if (key === '©nam') out.title ||= txt();
              else if (key === '©ART') out.artist ||= txt();
              else if (key === 'aART' && !out.artist) out.artist = txt();
              else if (key === '©alb') out.album ||= txt();
              else if (key === 'covr') this.pick(out, { bytes: d.bytes.slice(), mime: d.kind === 14 ? 'image/png' : d.kind === 13 ? 'image/jpeg' : '' }, 3);
            });
          });
        });
      });
    });
  },

  riff(b, out) {
    for (let o = 12; o + 8 <= b.length;) {
      const id = this.ascii(b, o, 4), len = this.le32(b, o + 4);
      const s = o + 8;
      if ((id === 'id3 ' || id === 'ID3 ') && this.ascii(b, s, 3) === 'ID3') this.id3(b, s, out);
      else if (id === 'LIST' && this.ascii(b, s, 4) === 'INFO') {
        for (let q = s + 4; q + 8 <= s + len;) {
          const k = this.ascii(b, q, 4), l = this.le32(b, q + 4);
          const v = this.text(b.subarray(q + 8, q + 8 + l), 'utf-8');
          if (k === 'INAM') out.title ||= v;
          else if (k === 'IART') out.artist ||= v;
          else if (k === 'IPRD') out.album ||= v;
          q += 8 + l + (l & 1);
        }
      }
      o = s + len + (len & 1);
    }
  },

  aiff(b, out) {
    for (let o = 12; o + 8 <= b.length;) {
      const id = this.ascii(b, o, 4), len = this.be32(b, o + 4);
      const s = o + 8;
      if ((id === 'ID3 ' || id === 'id3 ') && this.ascii(b, s, 3) === 'ID3') this.id3(b, s, out);
      else if (id === 'NAME') out.title ||= this.text(b.subarray(s, s + len), 'latin1');
      o = s + len + (len & 1);
    }
  },
};

// The embedded sleeve as a square canvas, decoded from memory — no blob: URL
// for the sandbox to refuse. Falls back to a data: URL through an <img>.
async function sleeveCanvas(pic, S = 1024) {
  const blob = new Blob([pic.bytes], { type: pic.mime });
  let src = null;
  try { src = await createImageBitmap(blob); } catch {
    src = await new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onload = () => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = rd.result; };
      rd.onerror = rej;
      rd.readAsDataURL(blob);
    });
  }
  const c = document.createElement('canvas'); c.width = c.height = S;
  const w = src.width, h = src.height, s = Math.min(w, h);
  c.getContext('2d').drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, S, S);
  src.close?.();
  return c;
}

// A track with no picture still gets a sleeve: its title set in type over a
// colour taken from the title itself, so every song lights differently.
function typeSleeve(title, artist, S = 1024) {
  let h = 2166136261;
  for (const ch of `${title}|${artist}`) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  const hue = (h >>> 0) % 360, hue2 = (hue + 40 + ((h >>> 9) % 80)) % 360;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, `hsl(${hue} 70% 22%)`); grd.addColorStop(1, `hsl(${hue2} 80% 48%)`);
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const glow = g.createRadialGradient(S * 0.7, S * 0.3, 0, S * 0.7, S * 0.3, S * 0.6);
  glow.addColorStop(0, `hsla(${hue2} 90% 70% / 0.55)`); glow.addColorStop(1, 'hsla(0 0% 0% / 0)');
  g.fillStyle = glow; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.font = `400 ${S * 0.1}px "Instrument Serif", Georgia, serif`;
  const words = (title || 'untitled').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > S * 0.8 && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  lines.slice(-4).forEach((l, i, a) => g.fillText(l, S * 0.1, S * 0.86 - (a.length - 1 - i) * S * 0.105));
  g.font = `500 ${S * 0.028}px "JetBrains Mono", ui-monospace, monospace`;
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText((artist || '').toUpperCase(), S * 0.1, S * 0.12);
  return c;
}
