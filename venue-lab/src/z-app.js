import * as THREE from 'three';
import { appPalette, clamp, COVERS, drawCover, extractPalette, V3 } from '../../src/three/core.js';
import { createStage } from '../../src/three/stage.js';
import { VENUE_BUILDERS } from '../../src/three/venues/index.js';
import { modeOf, ROUND_VENUES } from '../../src/useVenueModes.js';
import { Tags, sleeveCanvas, typeSleeve } from './y-tags.js';
import { exportBake } from './rx/bake-export.js';

// ─────────────────────────────────────────────────────────────────────────────
// the app: venue switching, the beat, the palette, the look-around, the UI
// ─────────────────────────────────────────────────────────────────────────────

// An artifact host serves no binary files: the Lab's models and baked light
// go up as base64 text beside the page (build.mjs writes `<name>.b64.txt`).
// Where a binary asset is not found, its text twin is fetched and decoded.
{
  const fetch0 = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    const res = await fetch0(input, init).catch((e) => { if (!/assets\/[^/?#]+\.(glb|gi)\b/.test(url || '')) throw e; return null; });
    if ((res && res.ok) || !/assets\/[^/?#]+\.(glb|gi)\b/.test(url || '')) return res;
    const twin = url.replace(/(\.(glb|gi))(\?[^#]*)?$/, '$1.b64.txt');
    const t = await fetch0(twin);
    if (!t.ok) return res ?? t;
    const bin = atob((await t.text()).trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes.buffer, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
  };
}

const INFO = {
  club: { name: 'Club', type: 'LIVE HOUSE', ref: '라이브하우스 · 가상의 공간', seats: '350', seat: 'Floor, centre', dist: '5 m', rt: '0.75', vol: '672', warm: '0.85', refl: '+6' },
  theater: { name: 'Theater', type: 'PROSCENIUM · MUSICAL', ref: '블루스퀘어 신한카드홀 기반', seats: '1,766', seat: 'Stalls, row 9', dist: '14 m', rt: '1.28', vol: '15,000', warm: '1.01', refl: '+16' },
  concerthall: { name: 'Concert Hall', type: 'VINEYARD', ref: '롯데콘서트홀 기반', seats: '2,036', seat: 'Terrace block', dist: '13 m', rt: '2.02', vol: '22,000', warm: '1.20', refl: '+12' },
  arena: { name: 'Arena', type: 'ARENA · END STAGE', ref: '사이타마 슈퍼 아레나 기반', seats: '22,500', seat: 'FOH, floor', dist: '36 m', rt: '2.64', vol: '400,000', warm: '1.14', refl: '+44' },
  dome: { name: 'Dome', type: 'DOMED STADIUM', ref: '도쿄 돔 기반', seats: '45,000', seat: 'FOH, field', dist: '56 m', rt: '3.63', vol: '1,240,000', warm: '1.50', refl: '+84' },
  stadium: { name: 'Stadium', type: 'OPEN STADIUM', ref: '웸블리 스타디움 기반', seats: '90,000', seat: 'FOH, pitch', dist: '66 m', rt: '2.15', vol: '1,139,100', warm: '1.18', refl: '+112' },
};
const VENUES = Object.keys(VENUE_BUILDERS);

// ── the beat: a simulated track with a real song's shape, or a real file ──
class Beat {
  constructor() {
    this.bpm = 122;
    this.playing = true;
    this.clock = 0;
    this.kick = 0; this.snare = 0; this.hat = 0; this.energy = 0.4; this.bar = 0; this.beat = 0;
    this.audio = null;
  }
  // verse 8 bars, pre 4, chorus 8, break 4 — and round again
  sectionEnergy(bar) {
    const b = bar % 24;
    if (b < 8) return 0.38;
    if (b < 12) return 0.6 + (b - 8) * 0.06;
    if (b < 20) return 1.0;
    return 0.22;
  }
  update(dt) {
    if (this.audio) return this.updateAudio(dt);
    if (this.playing) this.clock += dt;
    const bp = this.clock * this.bpm / 60;
    const bi = Math.floor(bp), ph = bp - bi;
    this.beat = bi; this.bar = Math.floor(bi / 4);
    const e = this.sectionEnergy(this.bar);
    const inBreak = (this.bar % 24) >= 20;
    this.energy += (e - this.energy) * Math.min(1, dt * 1.2);
    const play = this.playing ? 1 : 0;
    this.kick = play * (inBreak && bi % 2 ? 0 : Math.exp(-ph * 7));
    this.snare = play * ((bi % 2 === 1) ? Math.exp(-ph * 9) : 0) * (inBreak ? 0.3 : 1);
    this.hat = play * Math.exp(-((bp * 2) % 1) * 14);
    if (!this.playing) this.energy += (0.15 - this.energy) * Math.min(1, dt);
  }
  // Decoded in memory and played from a buffer: no media element and no blob
  // URL, so nothing for the page's sandbox to refuse.
  async attach(file) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ac = this.audio?.ac || new Ctx();
    if (this.audio?.src) { try { this.audio.src.stop(); } catch { /* already stopped */ } }
    await ac.resume();
    const buf = await ac.decodeAudioData(await file.arrayBuffer());
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const an = ac.createAnalyser();
    an.fftSize = 1024; an.smoothingTimeConstant = 0.5;
    src.connect(an); an.connect(ac.destination);
    src.start();
    this.audio = { ac, src, an, bins: new Uint8Array(an.frequencyBinCount), avgLow: 0, avgAll: 0, lastKick: 0, t: 0 };
    this.playing = true;
  }
  toggleAudio() {
    const ac = this.audio.ac;
    if (ac.state === 'running') { ac.suspend(); return false; }
    ac.resume(); return true;
  }
  updateAudio(dt) {
    const A = this.audio;
    A.an.getByteFrequencyData(A.bins);
    const hz = A.ac.sampleRate / A.an.fftSize;
    let low = 0, mid = 0, all = 0;
    for (let i = 1; i < A.bins.length; i++) {
      const f = i * hz, v = A.bins[i] / 255;
      if (f < 140) low += v; else if (f > 1500 && f < 5000) mid += v;
      all += v;
    }
    low /= Math.max(1, Math.floor(140 / hz)); all /= A.bins.length;
    A.avgLow += (low - A.avgLow) * Math.min(1, dt * 3);
    A.t += dt;
    const onset = low > A.avgLow * 1.18 + 0.03 && A.t - A.lastKick > 0.22;
    if (onset) { A.lastKick = A.t; this.kick = 1; this.beat++; if (this.beat % 4 === 0) this.bar++; }
    else this.kick *= Math.exp(-dt * 7);
    this.snare = clamp(mid / 60) * 0.8;
    this.energy += (clamp(all * 3.2) - this.energy) * Math.min(1, dt * 0.8);
    this.clock += dt;
  }
}

const Art = {
  id: 'blueRoom', meta: COVERS.blueRoom, palette: null, src: null,
  set(canvas, meta, id) {
    this.src = canvas.toDataURL('image/jpeg', 0.93);
    this.meta = meta;
    this.id = id;
    this.palette = extractPalette(canvas);
  },
};

const App = {
  stage: null, venueId: VENUES[0], layouts: {}, quality: 'high',
  mode: 'app', crowdLight: 'stick', houseTarget: 0, fps: 0,
  beat: new Beat(), building: false, _paused: false,

  get pipe() { return this.stage.debug.pipe; },
  get walker() { return this.stage.debug.walker; },
  get venue() { return { root: this.walker.root }; },
  get paused() { return this._paused; },
  set paused(value) {
    this._paused = !!value;
    this.stage.debug.setPaused(this._paused);
  },

  async init() {
    const canvas = document.getElementById('stage');
    const query = new URLSearchParams(location.search);
    if (query.get('q') === 'low' || (matchMedia('(max-width: 720px)').matches && query.get('q') !== 'high')) this.quality = 'low';
    this.stage = createStage(canvas, { quality: this.quality });
    if (!this.stage) throw new Error('WebGL을 사용할 수 없습니다');
    const resize = () => this.stage.resize(canvas.clientWidth, canvas.clientHeight);
    new ResizeObserver(resize).observe(canvas);
    resize();

    Art.set(drawCover('blueRoom'), COVERS.blueRoom, 'blueRoom');
    UI.init(this);
    this.applyArt();
    this.syncPlayback();
    this.stage.start();

    const id = location.hash.slice(1);
    const venue = VENUES.includes(id) ? id : VENUES[0];
    this.layouts[venue] = query.get('layout');
    await this.setVenue(venue);

    let last = performance.now(), sample = last, drawn = this.stage.stats().drawn;
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (this.paused || document.hidden) return;
      this.updatePulse(dt);
      if (now - sample >= 500) {
        const next = this.stage.stats().drawn;
        this.fps = (next - drawn) * 1000 / (now - sample);
        UI.fps(this.fps);
        drawn = next;
        sample = now;
      }
    };
    requestAnimationFrame(loop);
  },

  async build(load) {
    if (this.building) return;
    this.building = true;
    UI.loading(true, INFO[this.venueId].name);
    try {
      await load();
      UI.loading(false);
    } catch (error) {
      console.error(error);
      UI.loading(true, `오류: ${error.message}`);
    } finally {
      this.building = false;
    }
  },

  async setVenue(id) {
    if (!VENUES.includes(id) || this.building) return;
    this.venueId = id;
    if (location.hash.slice(1) !== id) location.hash = id;
    UI.venue(id);
    await this.build(() => this.stage.setVenue(id, modeOf(this.layouts, id)));
    this.pipe.rx?.setVenue(this.stage.debug.venue, id, modeOf(this.layouts, id));
    UI.rx(this);
  },

  // the Lab's own pipeline (src/rx) on or off, and SDR or HDR out
  setRx(on) {
    const rx = this.pipe.rx;
    if (!rx || rx.on === on) return;
    rx.on = on;
    this.pipe.venuePass.resetHistory?.();
    this.stage.resize(document.getElementById('stage').clientWidth, document.getElementById('stage').clientHeight);
    UI.rx(this);
  },
  setOut(mode) {
    const rx = this.pipe.rx;
    if (!rx) return;
    rx.setOutput(mode);
    rx.hdr?.ready.then(() => { this.stage.resize(document.getElementById('stage').clientWidth, document.getElementById('stage').clientHeight); UI.rx(this); });
    UI.rx(this);
  },

  async setLayout(layout) {
    if (this.building) return;
    this.layouts[this.venueId] = layout;
    await this.setVenue(this.venueId);
  },

  async setQuality(quality) {
    if (this.building || quality === this.quality) return;
    this.quality = quality;
    UI.pressed('#seg-quality', quality);
    await this.build(() => this.stage.setQuality(quality));
  },

  setHouse(level, immediate = false) {
    this.houseTarget = clamp(level);
    this.stage.setHouseLights(this.houseTarget, immediate);
    UI.pressed('#seg-lights', this.houseTarget > 0.5 ? 'house' : 'show');
  },

  setCrowdLight(mode) {
    this.crowdLight = mode;
    this.stage.setCrowdLight(mode);
    UI.pressed('#seg-crowd', mode);
  },

  syncPlayback() {
    this.stage.setPlaying(this.beat.playing);
    this.stage.setHouseLights(this.houseTarget);
  },

  updatePulse(dt) {
    this.beat.update(dt);
    this.stage.setPulse(clamp(this.beat.energy * 0.5 + this.beat.kick * 0.5));
  },

  setMode(mode) {
    this.mode = mode;
    this.applyArt();
    UI.tone(this);
  },

  setCover(canvas, meta, id, { tone = true } = {}) {
    Art.set(canvas, meta, id);
    if (tone) this.mode = 'art';
    this.applyArt();
    UI.tone(this);
  },

  applyArt() {
    this.stage.setArt({ coverSrc: Art.src, title: Art.meta.title, artist: Art.meta.artist, tone: this.mode });
  },

  setCamera(eye, target) {
    const home = this.walker.home;
    this.walker.home = { eye, target };
    this.walker.reset();
    this.walker.home = home;
  },

  frame(dt) {
    this.updatePulse(dt);
    this.stage.debug.drawFrame(dt);
  },
};

// ── UI ──
const UI = {
  init(app) {
    const $ = (s) => document.querySelector(s);
    this.$ = $;
    const tabs = $('#tabs');
    VENUES.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button'; b.id = `tab-${id}`; b.dataset.id = id; b.textContent = INFO[id].name;
      b.addEventListener('click', () => { if (!app.building && app.venueId !== id) app.setVenue(id); });
      tabs.appendChild(b);
    });
    const seg = (sel, fn) => $(sel).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => fn(b.dataset.v)));
    seg('#seg-lights', (v) => app.setHouse(v === 'house' ? 1 : 0));
    seg('#seg-quality', (v) => app.setQuality(v));
    seg('#seg-layout', (v) => app.setLayout(v));
    seg('#seg-tone', (v) => app.setMode(v));
    seg('#seg-crowd', (v) => app.setCrowdLight(v));
    seg('#seg-rx', (v) => app.setRx(v === 'next'));
    seg('#seg-out', (v) => app.setOut(v));
    this.pressed('#seg-crowd', app.crowdLight);
    this.pressed('#seg-quality', app.quality);
    this.pressed('#seg-lights', 'show');
    // covers
    const row = $('#covers');
    Object.keys(COVERS).forEach((id) => {
      const c = drawCover(id, 512);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cover'; b.id = `cover-${id}`; b.title = COVERS[id].title;
      const img = document.createElement('img'); img.alt = COVERS[id].title; img.src = c.toDataURL('image/jpeg', 0.85);
      b.appendChild(img);
      b.addEventListener('click', () => { app.setCover(drawCover(id), COVERS[id], id); });
      row.insertBefore(b, $('#cover-upload'));
    });
    $('#cover-file').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      // read as a data URL: a blob: image can be refused by the page's sandbox
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
          const g = c.getContext('2d');
          const s = Math.min(img.width, img.height);
          g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S, S);
          const name = file.name.replace(/\.[^.]+$/, '');
          const meta = { title: name, artist: '', label: 'YOUR ARTWORK' };
          this.addCover('custom', c, meta, name);
          app.setCover(c, meta, 'custom');
        };
        img.onerror = () => { UI.$('#tone-note').textContent = '이 이미지를 읽지 못했습니다. JPG나 PNG를 올려 주세요'; };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
    // a song: its beat drives the show, its tags name it on the screens and
    // its embedded sleeve (or one set from its title) colours the lighting
    $('#audio-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      $('#beat-label').textContent = '음원을 읽는 중…';
      const tags = Tags.read(file).catch(() => null);
      try { await app.beat.attach(file); app.syncPlayback(); $('#beat-toggle').textContent = '음원 멈추기'; } catch { $('#beat-label').textContent = '이 파일은 브라우저가 디코드하지 못합니다. MP3·WAV·FLAC을 올려 주세요'; return; }
      const t = await tags;
      const title = t?.title || file.name.replace(/\.[^.]+$/, ''), artist = t?.artist || '';
      let sleeve = null;
      if (t?.picture) { try { sleeve = await sleeveCanvas(t.picture); } catch (err) { console.warn('sleeve', err); } }
      const meta = { title, artist, label: t?.album || 'NOW PLAYING' };
      const c = sleeve || typeSleeve(title, artist);
      this.addCover('track', c, meta, title);
      app.setCover(c, meta, 'track');
      $('#beat-label').textContent = `${artist ? `${artist} — ` : ''}${title} · ${sleeve ? '앨범아트 추출됨' : '앨범아트 없음, 제목으로 커버 생성'}`;
    });
    $('#beat-toggle').addEventListener('click', () => {
      const B = app.beat;
      if (B.audio) {
        B.playing = B.toggleAudio();
        app.syncPlayback();
        $('#beat-toggle').textContent = B.playing ? '음원 멈추기' : '음원 재생';
        return;
      }
      B.playing = !B.playing;
      app.syncPlayback();
      $('#beat-toggle').setAttribute('aria-pressed', String(B.playing));
      $('#beat-toggle').textContent = B.playing ? '비트 멈추기' : '비트 재생';
    });
    $('#tone-toggle').addEventListener('click', () => { document.body.classList.toggle('tone-open'); });
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      const i = VENUES.indexOf(app.venueId);
      if (e.key === 'ArrowRight' && !app.building) app.setVenue(VENUES[(i + 1) % VENUES.length]);
      if (e.key === 'ArrowLeft' && !app.building) app.setVenue(VENUES[(i + VENUES.length - 1) % VENUES.length]);
      if (e.key === 'h' || e.key === 'H') app.setHouse(app.houseTarget ? 0 : 1);
      if (e.key === ' ' && !e.target.closest?.('button')) { e.preventDefault(); $('#beat-toggle').click(); }
    });
    this.tone(app);
  },
  // a sleeve of the user's own (an uploaded image, or a song's) in the row
  addCover(id, canvas, meta, name) {
    const $ = this.$;
    let b = document.getElementById(`cover-${id}`);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'cover'; b.id = `cover-${id}`;
      b.appendChild(document.createElement('img'));
      $('#covers').insertBefore(b, $('#cover-upload'));
      $('#covers').style.setProperty('--n', String($('#covers').children.length));
    }
    b.title = name;
    b.querySelector('img').alt = name;
    b.querySelector('img').src = canvas.toDataURL('image/jpeg', 0.85);
    b.onclick = () => App.setCover(canvas, meta, id);
  },
  pressed(sel, v) { this.$(sel).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); },
  venue(id) {
    const I = INFO[id];
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.id === id ? 'true' : 'false'));
    const $ = this.$;
    $('#v-type').textContent = `${I.type} · ${I.seats} SEATS`;
    $('#v-name').textContent = I.name;
    $('#v-ref').textContent = I.ref;
    $('#v-seat').textContent = I.seat;
    $('#v-dist').textContent = I.dist;
    $('#v-rt').textContent = I.rt;
    $('#v-vol').textContent = I.vol;
    $('#v-warm').textContent = I.warm;
    $('#v-refl').textContent = I.refl;
    const round = ROUND_VENUES.includes(id);
    $('#crowd-row').hidden = !round;
    $('#seg-layout').hidden = !round && id !== 'theater';
    $('#seg-layout [data-v="360"]').hidden = !round;
    $('#seg-layout [data-v="op"]').hidden = id !== 'theater';
    this.pressed('#seg-layout', modeOf(App.layouts, id));
  },
  tone(app) {
    this.pressed('#seg-tone', app.mode);
    document.querySelectorAll('.cover').forEach((b) => b.setAttribute('aria-pressed', String(b.id === `cover-${Art.id}`)));
    const sw = this.$('#swatches');
    sw.innerHTML = '';
    const P = app.mode === 'art' ? Art.palette : appPalette();
    for (const k of ['a', 'b', 'c', 'd']) {
      const s = document.createElement('span');
      s.style.background = `#${P[k].getHexString()}`;
      sw.appendChild(s);
    }
    this.$('#tone-note').textContent = app.mode === 'art'
      ? `${(Art.meta.title || '앨범아트')}에서 뽑은 색으로 공연 조명을 칠합니다`
      : '앱 디자인 시스템의 앰버 톤입니다. 커버를 고르면 그 색으로 바뀝니다';
  },
  loading(on, name = '') {
    const el = this.$('#loading');
    el.hidden = !on;
    if (on) this.$('#loading-name').textContent = name;
  },
  fps(v) { this.$('#fps').textContent = `${Math.round(v)} FPS`; },
  rx(app) {
    const rx = app.pipe.rx;
    if (!rx) { this.$('#seg-rx').hidden = this.$('#seg-out').hidden = true; return; }
    this.pressed('#seg-rx', rx.on ? 'next' : 'base');
    this.pressed('#seg-out', rx.out);
    const hdrOk = !!navigator.gpu;
    this.$('#seg-out [data-v="hdr"]').disabled = !hdrOk;
    this.$('#seg-out').title = rx.hdr ? `HDR: ${rx.hdr.status}` : (hdrOk ? 'HDR: WebGPU 확장 범위 캔버스 (HDR 디스플레이 필요)' : 'HDR: 이 브라우저에 WebGPU가 없습니다');
    this.$('#seg-rx').title = `Next: 베이크 GI(${rx.giStatus}) · GTAO · SSR · 반사 프로브 · 프록셀 헤이즈 · TAA · AgX / Base: 앱 그대로`;
  },
};

window.__app = App; window.__art = Art; window.__tags = { Tags, sleeveCanvas };
window.__pal = (id) => { const p = extractPalette(drawCover(id)); return { kind: p.kind, cols: ["a", "b", "c", "d"].map((k) => p[k].getHexString()) }; };
window.__info = () => ({ walk: [App.walker.feet.x, App.walker.feet.y, App.walker.feet.z, App.walker.eyeH].map((v) => +v.toFixed(2)), bvh: !!App.walker.bvh, venue: App.venueId, fps: Math.round(App.fps), beams: App.pipe.beams.geo.instanceCount, calls: App.pipe.renderer.info.render.calls, tris: App.pipe.renderer.info.render.triangles, progs: App.pipe.renderer.info.programs?.length });
// draw the same moment `n` more times: the temporal passes settle (screenshots)
window.__settle = async (n = 24) => {
  const p = App.pipe, rx = p.rx;
  if (!rx) return null;
  rx.settling = true;
  try { for (let i = 0; i < n; i++) { p.render(p.lastT ?? 0); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); } } finally { rx.settling = false; }
  return rx.info();
};
window.__rxInfo = () => App.pipe.rx?.info();
// the bake's input: the room's surfaces and its lights, sent to the bake server
window.__rxExport = (opts) => exportBake(App, opts);
window.__set = async (o = {}) => {
  if (o.layout) await App.setLayout(o.layout);
  if (o.quality) await App.setQuality(o.quality);
  if (o.house !== undefined) App.setHouse(+o.house, true);
  if (o.cover) App.setCover(drawCover(o.cover), COVERS[o.cover], o.cover, { tone: o.mode !== 'app' });
  if (o.mode) App.setMode(o.mode);
  if (o.t !== undefined) { App.beat.clock = +o.t; App.beat.energy = App.beat.sectionEnergy(Math.floor(+o.t * App.beat.bpm / 240)); }
  if (o.cam) {
    const c = String(o.cam).split(',').map(Number);
    if (c.length === 6 && c.every(Number.isFinite)) App.setCamera(V3(...c.slice(0, 3)), V3(...c.slice(3)));
  }
  if (o.light) App.setCrowdLight(o.light);
  if (o.rx !== undefined) App.setRx(o.rx !== '0' && o.rx !== 0);
  if (o.out) { App.setOut(o.out); await App.pipe.rx?.hdr?.ready; App.stage.resize(document.getElementById('stage').clientWidth, document.getElementById('stage').clientHeight); }
  if (o.rxoff !== undefined && App.pipe.rx) for (const k of Object.keys(App.pipe.rx.f)) App.pipe.rx.f[k] = !String(o.rxoff).split(',').includes(k);
  if (o.yaw !== undefined) App.walker.yaw += +o.yaw;
  if (o.pitch !== undefined) App.walker.pitch += +o.pitch;
  // to: "x,z;x,z" walks to each point in turn (stops early if stuck)
  if (o.to) {
    const W = App.walker, cam = App.pipe.camera;
    for (const pt of String(o.to).split(';')) {
      const [tx, tz] = pt.split(',').map(Number);
      let still = 0;
      for (let i = 0; i < 3000; i++) {
        const dx = tx - W.feet.x, dz = tz - W.feet.z, d = Math.hypot(dx, dz);
        if (d < 0.1) break;
        W.yaw = Math.atan2(dx, -dz); W.held.add('w');
        const bx = W.feet.x, bz = W.feet.z;
        W.update(Math.min(1 / 30, d / 3.2 + 0.001), cam);
        if (Math.hypot(W.feet.x - bx, W.feet.z - bz) < 1e-4) { if (++still > 10) break; } else still = 0;
      }
      W.held.clear();
      for (let t = 0; t < 1; t += 1 / 30) W.update(1 / 30, cam);
    }
  }
  // walk: "w:3,d:1.5" holds W for 3 s then D for 1.5 s, stepped at 30 fps
  if (o.walk) {
    for (const part of String(o.walk).split(',')) {
      const [keys, secs] = part.split(':');
      for (const k of keys.split('+')) App.walker.held.add(k);
      for (let t = 0; t < +secs; t += 1 / 30) App.walker.update(1 / 30, App.pipe.camera);
      App.walker.held.clear();
    }
    for (let t = 0; t < 1; t += 1 / 30) App.walker.update(1 / 30, App.pipe.camera);
  }
  App.beat.playing = o.freeze ? false : App.beat.playing;
  if (o.hidesil) App.venue.root.traverse((m) => { if (m.geometry?.isInstancedBufferGeometry) m.visible = false; });
  if (o.hidepts) App.venue.root.traverse((m) => { if (m.isPoints) m.visible = false; });
  if (o.noui) document.querySelectorAll('.top,.rail,.hint').forEach((e) => { e.style.display = 'none'; });
  if (o.nohaze) App.pipe.haze.mesh.visible = false;
  if (o.nobeams) App.pipe.beams.mesh.visible = false;
  if (o.nomask) App.pipe.mask.clear();
  if (o.nobloom) App.pipe.bloom.enabled = false;
  if (o.exp) App.pipe.final.material.uniforms.uExposure.value = +o.exp;   // (a check's render, brighter: exp=3)
  for (let i = 0; i < (o.frames ?? 2); i++) await new Promise((r) => requestAnimationFrame(r));
  App.pipe.final.material.uniforms.uFade.value = 1;
  if (o.pause) { App.frame(0.016, performance.now() / 1000); App.paused = true; }
  return window.__info();
};

App.init().then(() => {
  let n = 0;
  const wait = () => { if (++n > 3) window.__ready = true; else requestAnimationFrame(wait); };
  requestAnimationFrame(wait);
}).catch((e) => {
  console.error(e);
  document.getElementById('loading').hidden = false;
  document.getElementById('loading-name').textContent = `오류: ${e.message}`;
});

// debug: what a ray from `o` along `d` runs into first, and what it is
window.__rayHits = (root, o, d, far = 60) => {
  const rc = new THREE.Raycaster(V3(...o), V3(...d).normalize(), 0, far);
  const hits = rc.intersectObject(root, true).filter((h) => h.object.isMesh && !h.object.isInstancedMesh);
  return hits.slice(0, 3).map((h) => {
    const names = []; let p = h.object; while (p && names.length < 3) { names.push(p.type + (p.name ? ':' + p.name : '') + (p.geometry ? '/' + p.geometry.type : '')); p = p.parent; }
    const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
    return { d: +h.distance.toFixed(2), p: h.point.toArray().map((v) => +v.toFixed(2)), obj: names.join(' < '), mat: m?.type, col: m?.color?.getHexString(), em: m?.emissive?.getHexString(), n: h.face?.normal?.toArray().map((v) => +v.toFixed(2)), verts: h.object.geometry?.attributes?.position?.count,
      tri: h.face ? [h.face.a, h.face.b, h.face.c].map((i) => V3().fromBufferAttribute(h.object.geometry.attributes.position, i).applyMatrix4(h.object.matrixWorld).toArray().map((v) => +v.toFixed(2))) : null };
  });
};
