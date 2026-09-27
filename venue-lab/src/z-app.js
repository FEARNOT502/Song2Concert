// ─────────────────────────────────────────────────────────────────────────────
// the app: venue switching, the beat, the palette, the look-around, the UI
// ─────────────────────────────────────────────────────────────────────────────

const INFO = {
  club: { name: 'Club', type: 'LIVE HOUSE', ref: '라이브하우스 · 가상의 공간', seats: '350', seat: 'Floor, centre', dist: '5 m', rt: '0.75', vol: '672', warm: '0.85', refl: '+6' },
  theater: { name: 'Theater', type: 'PROSCENIUM · MUSICAL', ref: '블루스퀘어 신한카드홀 기반', seats: '1,766', seat: 'Stalls, row 9', dist: '14 m', rt: '1.28', vol: '15,000', warm: '1.01', refl: '+16' },
  concerthall: { name: 'Concert Hall', type: 'VINEYARD', ref: '롯데콘서트홀 기반', seats: '2,036', seat: 'Terrace block', dist: '13 m', rt: '2.02', vol: '22,000', warm: '1.20', refl: '+12' },
  arena: { name: 'Arena', type: 'ARENA · END STAGE', ref: '사이타마 슈퍼 아레나 기반', seats: '22,500', seat: 'FOH, floor', dist: '36 m', rt: '2.64', vol: '400,000', warm: '1.14', refl: '+44' },
  inspire: { name: 'Inspire', type: 'ARENA · T-STAGE', ref: '인스파이어 아레나 기반', seats: '15,000', seat: 'FOH, floor', dist: '44 m', rt: '2.30', vol: '310,000', warm: '1.10', refl: '+38' },
  kspo: { name: 'KSPO DOME', type: 'ARENA · T-STAGE', ref: 'KSPO DOME 기반', seats: '14,594', seat: 'FOH, floor', dist: '34 m', rt: '2.20', vol: '260,000', warm: '1.08', refl: '+34' },
  dome: { name: 'Dome', type: 'DOMED STADIUM', ref: '도쿄 돔 기반', seats: '45,000', seat: 'FOH, field', dist: '56 m', rt: '3.63', vol: '1,240,000', warm: '1.50', refl: '+84' },
  stadium: { name: 'Stadium', type: 'OPEN STADIUM', ref: '웸블리 스타디움 기반', seats: '90,000', seat: 'FOH, pitch', dist: '66 m', rt: '2.15', vol: '1,139,100', warm: '1.18', refl: '+112' },
};
const ORDER = ['club', 'theater', 'concerthall', 'arena', 'inspire', 'kspo', 'dome', 'stadium'];
const RETRACT = { inspire: '100번대 가변석', kspo: '1층 가변석' };
const BUILDERS = {
  club: typeof buildClub === 'function' ? buildClub : null,
  theater: typeof buildTheater === 'function' ? buildTheater : null,
  concerthall: typeof buildConcertHall === 'function' ? buildConcertHall : null,
  arena: typeof buildArena === 'function' ? buildArena : null,
  inspire: typeof buildInspire === 'function' ? buildInspire : null,
  kspo: typeof buildKspo === 'function' ? buildKspo : null,
  dome: typeof buildDome === 'function' ? buildDome : null,
  stadium: typeof buildStadium === 'function' ? buildStadium : null,
};

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

// ── album art ──
const Art = {
  id: 'blueRoom', canvas: null, meta: COVERS.blueRoom, palette: null, cache: new Map(), coverTex: null,
  set(canvas, meta, id) {
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
    this.coverTex?.dispose();
    this.canvas = canvas; this.meta = meta; this.id = id;
    this.palette = extractPalette(canvas);
    this.coverTex = new THREE.CanvasTexture(canvas);
    this.coverTex.colorSpace = THREE.SRGBColorSpace;
  },
  texture(aspect) {
    const k = aspect.toFixed(3);
    if (!this.cache.has(k)) this.cache.set(k, screenContent(this.canvas, this.meta, aspect));
    return this.cache.get(k);
  },
};

function disposeTree(root) {
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    o.geometry?.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture && !v.userData.shared && !isArtTex(v)) v.dispose(); }
      m.dispose();
    }
    if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
  });
}
const isArtTex = (t) => t === Art.coverTex || [...Art.cache.values()].includes(t);

const App = {
  pipe: null, venue: null, venueId: 'club', ctx: null, retract: false,
  quality: 'high', house: 0, houseTarget: 0, mode: 'app', crowdLight: 'stick',
  pal: null, palTarget: null,
  beat: new Beat(),
  frames: 0, fps: 60, building: false, timeOffset: 0,

  async init() {
    const canvas = document.getElementById('stage');
    this.pipe = new Pipeline(canvas);
    this.walker = new Walker(canvas);
    const q = new URLSearchParams(location.search);
    if (q.get('q') === 'low' || (window.matchMedia?.('(max-width: 720px)').matches && q.get('q') !== 'high')) this.quality = 'low';
    this.pipe.setQuality(this.quality);
    const resize = () => this.pipe.resize(canvas.clientWidth, canvas.clientHeight);
    new ResizeObserver(resize).observe(canvas);
    resize();
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch { /* fonts are optional */ }
    Art.set(drawCover('blueRoom'), COVERS.blueRoom, 'blueRoom');
    this.pal = appPalette(); this.palTarget = appPalette();
    UI.init(this);
    const id = (location.hash || '').slice(1);
    await this.setVenue(ORDER.includes(id) ? id : 'club');
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (document.hidden || this.paused) return;
      this.frame(dt, now / 1000);
    };
    requestAnimationFrame(loop);
  },

  ctxFor() {
    const pipe = this.pipe;
    const screens = [];
    const rigs = [];
    const cu = crowdUniforms();
    return {
      pipe, q: pipe.q, cu, screens, rigs, retract: this.retract,
      art: { texture: (aspect) => Art.texture(aspect), cover: () => Art.coverTex },
      addScreen: (group, aspect, kind = 'main') => {
        screens.push({ group, aspect, kind, haze: [] });
        if (kind !== 'ribbon' && group.userData.face) pipe.mask.add(group.userData.face);
      },
      screenHaze: (group, items, offsets) => { const s = screens.find((x) => x.group === group); if (s) s.haze.push(...items.map((h, i) => ({ h, o: offsets[i] }))); },
      rig: (opts) => { const r = new Rig(pipe, opts); rigs.push(r); return r; },
    };
  },

  async setVenue(id) {
    if (!BUILDERS[id]) return;
    this.building = true;
    UI.loading(true, INFO[id].name);
    await this.fade(0, 180);
    const pipe = this.pipe;
    if (this.venue) {
      pipe.scene.remove(this.venue.root);
      disposeTree(this.venue.root);
      this.envRT?.dispose(); this.envRT = null;
    }
    pipe.beams.clear(); pipe.haze.clear(); pipe.flares.clear(); pipe.mask.clear();
    pipe.scene.remove(pipe.flares.mesh);
    await new Promise((r) => setTimeout(r, 16));
    const ctx = this.ctxFor();
    const v = BUILDERS[id](ctx);
    for (const r of ctx.rigs) v.root.add(r.build());
    dropDegenerateTriangles(v.root);
    pipe.scene.add(v.root);
    pipe.scene.add(pipe.flares.mesh);
    pipe.scene.background = v.background || new THREE.Color(0);
    pipe.scene.fog = v.fog || null;
    const cam = pipe.camera;
    cam.fov = v.camera.fov; cam.near = v.camera.near ?? 0.1; cam.far = v.camera.far ?? 2000;
    cam.updateProjectionMatrix();
    this.venue = v; this.ctx = ctx; this.venueId = id;
    this.walker.setVenue(v.root, v.camera.pos, v.camera.target);
    this.applyCamera();
    const b = v.bloom || {};
    pipe.bloom.strength = b.strength ?? 0.6; pipe.bloom.radius = b.radius ?? 0.6; pipe.bloom.threshold = b.threshold ?? 0.9;
    const G = pipe.final.material.uniforms, g = v.grade || {};
    G.uExposure.value = g.exposure ?? 1; G.uVignette.value = g.vignette ?? 0.35; G.uCA.value = g.ca ?? 0.004;
    G.uGrain.value = pipe.q.grain ? (g.grain ?? 0.035) : 0; G.uSat.value = g.sat ?? 1.05;
    G.uLift.value.setRGB(...(g.lift || [0, 0, 0]));
    pipe.haze.uniforms.uDensity.value = v.hazeDensity ?? 0.02;
    pipe.beams.uniforms.uGain.value = v.beamGain ?? 1;
    pipe.haze.uniforms.uAmb.value.copy(v.hazeAmb || new THREE.Color(0));
    pipe.haze.uniforms.uAmbDist.value = v.hazeAmbDist ?? 80;
    this.applyArt();
    location.hash = id;
    UI.venue(id);
    try { await pipe.renderer.compileAsync(pipe.scene, cam); } catch { /* compile on first frame instead */ }
    this.frame(0.016, performance.now() / 1000);
    this.building = false;
    UI.loading(false);
    this.fade(1, 420);
    this.frames = 0;
  },

  fade(to, ms) {
    const U = this.pipe.final.material.uniforms.uFade;
    const from = U.value, t0 = performance.now();
    return new Promise((res) => {
      const step = () => {
        const k = clamp((performance.now() - t0) / ms);
        U.value = from + (to - from) * k * k * (3 - 2 * k);
        if (k < 1) requestAnimationFrame(step); else res();
      };
      if (ms <= 0) { U.value = to; res(); } else step();
    });
  },

  // screens, their light, their haze, and the reflections, from the current art
  applyArt() {
    const v = this.venue, ctx = this.ctx;
    if (!v) return;
    for (const s of ctx.screens) {
      const face = s.group.userData.face;
      const tex = s.kind === 'main' ? Art.texture(s.aspect) : Art.coverTex;
      if (face) face.material.uniforms.tArt.value = tex;
      const img = s.kind === 'main' ? tex.image : Art.canvas;
      const avg = regionColor(img, 0, 0, 1, 1);
      s.avg = avg;
      if (s.group.userData.rect) s.group.userData.rect.color.copy(avg).multiplyScalar(1 / Math.max(0.05, Math.max(avg.r, avg.g, avg.b)));
      s.lum = Math.max(avg.r, avg.g, avg.b);
      for (const { h, o } of s.haze) h.color.copy(regionColor(img, 0.5 + o[0] * 0.5 - 0.2, 0.5 - o[1] * 0.5 - 0.2, 0.5 + o[0] * 0.5 + 0.2, 0.5 - o[1] * 0.5 + 0.2));
    }
    this.rebuildEnv();
  },

  rebuildEnv() {
    const v = this.venue;
    if (!v?.env) return;
    const spec = { ...v.env, emitters: (v.env.emitters || []).map((e) => (e.screen ? { ...e, map: Art.texture(e.aspect || 16 / 9) } : e)) };
    this.envRT?.dispose();
    this.envRT = buildEnvironment(this.pipe, spec);
    this.pipe.scene.environment = this.envRT.texture;
    this.pipe.scene.environmentIntensity = v.envIntensity ?? 0.6;
  },

  setMode(mode) {
    this.mode = mode;
    this.palTarget = mode === 'art' ? Art.palette : appPalette();
    UI.tone(this);
  },

  // Picking a sleeve is asking to see it: the lighting takes its colours at
  // once. 'App' puts the design system's amber back.
  setCover(canvas, meta, id, { tone = true } = {}) {
    Art.set(canvas, meta, id);
    if (tone) this.mode = 'art';
    this.palTarget = this.mode === 'art' ? Art.palette : appPalette();
    this.applyArt();
    UI.tone(this);
  },

  applyCamera() {
    const v = this.venue;
    if (!v) return;
    const cam = this.pipe.camera;
    // a portrait screen keeps at least ~56 degrees across, so the stage is
    // still in the room rather than a keyhole onto the screen
    const minH = 56 * DEG;
    const fov = Math.min(100, Math.max(v.camera.fov, 2 * Math.atan(Math.tan(minH / 2) / cam.aspect) / DEG));
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.debugCam) { cam.position.copy(this.debugCam.pos); cam.lookAt(this.debugCam.tgt); return; }
    this.walker.update(this.walkDt || 0, cam);
  },

  frame(dt, now) {
    const v = this.venue;
    if (!v) return;
    const pipe = this.pipe;
    this.beat.update(dt);
    const t = this.beat.clock + this.timeOffset;
    this.house += (this.houseTarget - this.house) * Math.min(1, dt * 1.4);
    for (const k of ['a', 'b', 'c', 'd']) this.pal[k].lerp(this.palTarget[k], Math.min(1, dt * 2.2));
    this.walkDt = dt;
    this.applyCamera();
    const B = this.beat;
    const f = { t, dt, kick: B.kick, snare: B.snare, hat: B.hat, energy: B.energy, bar: B.bar, beat: B.beat, house: this.house, pal: this.pal, cam: pipe.camera.position };
    const cu = this.ctx.cu;
    cu.uTime.value = t; cu.uKick.value = B.kick * (1 - this.house); cu.uEnergy.value = B.energy * (1 - this.house * 0.8);
    cu.uFlick.value = B.kick * (1 - this.house);
    v.update(f);
    for (const r of this.ctx.rigs) r.update(1, pipe.camera.position);
    const pulse = clamp(B.kick * 0.6 + B.energy * 0.3) * (1 - this.house);
    for (const s of this.ctx.screens) {
      const face = s.group.userData.face;
      if (face) { const U = face.material.uniforms; U.uTime.value = t; U.uPulse.value = pulse; U.uHouse.value = this.house; for (const k of ['uTint', 'uTint2']) if (U[k]) U[k].value.copy(k === 'uTint' ? this.pal.a : this.pal.b); }
      const rect = s.group.userData.rect;
      if (rect) rect.intensity = (s.lum ?? 0.3) * (face?.material.uniforms.uBright.value ?? 1) * (s.group.userData.lightPower ?? 1) * (0.9 + 0.2 * pulse) * (1 - 0.45 * this.house) * 1.6;
      for (const { h } of s.haze) h.power = (s.group.userData.hazePower ?? 20) * (0.85 + 0.3 * pulse) * (1 - 0.6 * this.house);
      if (s.group.userData.bezel) s.group.userData.bezel.color.setHex(APP.accent).multiplyScalar(0.7 + pulse * 0.6);
    }
    // lightstick / phone points take the palette; the crowd's own lights
    // follow the stick/torch switch and dim when the house lights come up
    const mode = this.crowdLight === 'flash' ? 1 : 0;
    pipe.scene.traverseVisible((o) => {
      if (o.userData.crowdLights) { o.material.uniforms.uMode.value = mode; o.material.uniforms.uHouse.value = this.house; }
      if (o.isPoints && o.material.uniforms?.uPal) {
        const P = o.material.uniforms.uPal.value;
        ['a', 'b', 'c', 'd'].forEach((k, i) => P[i].set(this.pal[k].r, this.pal[k].g, this.pal[k].b));
        o.material.uniforms.uScale.value = (pipe.size.h * pipe.renderer.getPixelRatio() * 0.5) / Math.tan(pipe.camera.fov * 0.5 * DEG);
      }
      if (o.material?.uniforms?.fogDensity && pipe.scene.fog) {
        o.material.uniforms.fogDensity.value = pipe.scene.fog.density ?? 0;
        o.material.uniforms.fogColor.value.copy(pipe.scene.fog.color);
      }
    });
    pipe.render(t);
    this.frames++;
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
    if (this.frames % 20 === 0) UI.fps(this.fps);
  },
};

// ── UI ──
const UI = {
  init(app) {
    const $ = (s) => document.querySelector(s);
    this.$ = $;
    const tabs = $('#tabs');
    ORDER.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button'; b.id = `tab-${id}`; b.dataset.id = id; b.textContent = INFO[id].name;
      b.disabled = !BUILDERS[id];
      b.addEventListener('click', () => { if (!app.building && app.venueId !== id) app.setVenue(id); });
      tabs.appendChild(b);
    });
    const seg = (sel, fn) => $(sel).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => fn(b.dataset.v)));
    seg('#seg-lights', (v) => { app.houseTarget = v === 'house' ? 1 : 0; this.pressed('#seg-lights', v); });
    seg('#seg-quality', async (v) => {
      if (app.building || app.quality === v) return;
      app.quality = v; this.pressed('#seg-quality', v);
      app.pipe.setQuality(v);
      await app.setVenue(app.venueId);
    });
    seg('#seg-tone', (v) => app.setMode(v));
    seg('#seg-crowd', (v) => { app.crowdLight = v; this.pressed('#seg-crowd', v); });
    // Inspire's 100s: out, or folded away for a bigger floor (the room is rebuilt)
    seg('#seg-retract', async (v) => {
      const r = v === 'in';
      if (app.building || app.retract === r) return;
      app.retract = r; this.pressed('#seg-retract', v);
      await app.setVenue(app.venueId);
    });
    this.pressed('#seg-retract', app.retract ? 'in' : 'out');
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
      try { await app.beat.attach(file); $('#beat-toggle').textContent = '음원 멈추기'; } catch { $('#beat-label').textContent = '이 파일은 브라우저가 디코드하지 못합니다. MP3·WAV·FLAC을 올려 주세요'; return; }
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
      if (B.audio) { const on = B.toggleAudio(); $('#beat-toggle').textContent = on ? '음원 멈추기' : '음원 재생'; return; }
      B.playing = !B.playing;
      $('#beat-toggle').setAttribute('aria-pressed', String(B.playing));
      $('#beat-toggle').textContent = B.playing ? '비트 멈추기' : '비트 재생';
    });
    $('#tone-toggle').addEventListener('click', () => { document.body.classList.toggle('tone-open'); });
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input')) return;
      const i = ORDER.indexOf(app.venueId);
      if (e.key === 'ArrowRight' && !app.building) app.setVenue(ORDER[(i + 1) % ORDER.length]);
      if (e.key === 'ArrowLeft' && !app.building) app.setVenue(ORDER[(i + ORDER.length - 1) % ORDER.length]);
      if (e.key === 'h' || e.key === 'H') { app.houseTarget = app.houseTarget ? 0 : 1; this.pressed('#seg-lights', app.houseTarget ? 'house' : 'show'); }
      if (e.key === ' ') { e.preventDefault(); $('#beat-toggle').click(); }
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
    $('#crowd-row').hidden = !['arena', 'inspire', 'kspo', 'dome', 'stadium'].includes(id);
    // the telescopic seats: Inspire's 100s, KSPO DOME's 1st floor
    $('#retract-row').hidden = !RETRACT[id];
    if (RETRACT[id]) { $('#retract-label').textContent = RETRACT[id]; $('#seg-retract').setAttribute('aria-label', RETRACT[id]); }
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
};

window.__app = App; window.__art = Art; window.__tags = { Tags, sleeveCanvas };
window.__pal = (id) => { const p = extractPalette(drawCover(id)); return { kind: p.kind, cols: ["a", "b", "c", "d"].map((k) => p[k].getHexString()) }; };
window.__info = () => ({ walk: [App.walker.feet.x, App.walker.feet.y, App.walker.feet.z, App.walker.eyeH].map((v) => +v.toFixed(2)), bvh: !!App.walker.bvh, venue: App.venueId, fps: Math.round(App.fps), beams: App.pipe.beams.geo.instanceCount, calls: App.pipe.renderer.info.render.calls, tris: App.pipe.renderer.info.render.triangles, progs: App.pipe.renderer.info.programs?.length });
window.__set = async (o = {}) => {
  if (o.house !== undefined) { App.houseTarget = +o.house; App.house = +o.house; }
  if (o.cover) App.setCover(drawCover(o.cover), COVERS[o.cover], o.cover, { tone: o.mode !== 'app' });
  if (o.mode) App.setMode(o.mode);
  if (o.mode === 'art') for (const k of ['a', 'b', 'c', 'd']) App.pal[k].copy(App.palTarget[k]);
  if (o.t !== undefined) { App.beat.clock = +o.t; App.beat.energy = App.beat.sectionEnergy(Math.floor(+o.t * App.beat.bpm / 240)); }
  if (o.cam) { const c = String(o.cam).split(',').map(Number); App.debugCam = { pos: V3(c[0], c[1], c[2]), tgt: V3(c[3], c[4], c[5]) }; App.applyCamera(); }
  if (o.light) { App.crowdLight = o.light; UI.pressed('#seg-crowd', o.light); }
  if (o.retract !== undefined && !!+o.retract !== !!App.retract) { App.retract = !!+o.retract; UI.pressed('#seg-retract', App.retract ? 'in' : 'out'); await App.setVenue(App.venueId); }
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
  if (o.quality && o.quality !== App.quality) { App.quality = o.quality; App.pipe.setQuality(o.quality); UI.pressed('#seg-quality', o.quality); await App.setVenue(App.venueId); }
  if (o.hidesil) App.venue.root.traverse((m) => { if (m.geometry?.isInstancedBufferGeometry) m.visible = false; });
  if (o.hidepts) App.venue.root.traverse((m) => { if (m.isPoints) m.visible = false; });
  if (o.noui) document.querySelectorAll('.top,.rail,.hint').forEach((e) => { e.style.display = 'none'; });
  if (o.nohaze) App.pipe.haze.mesh.visible = false;
  if (o.nobeams) App.pipe.beams.mesh.visible = false;
  if (o.nomask) App.pipe.mask.clear();
  if (o.nobloom) App.pipe.bloom.enabled = false;
  for (let i = 0; i < (o.frames ?? 2); i++) await new Promise((r) => requestAnimationFrame(r));
  App.pipe.final.material.uniforms.uFade.value = 1;
  if (o.pause) { App.frame(0.016, performance.now() / 1000); App.paused = true; }
  return window.__info();
};

App.init().then(() => {
  let n = 0;
  const wait = () => { if (++n > 3) window.__ready = true; else requestAnimationFrame(wait); };
  requestAnimationFrame(wait);
}).catch((e) => { console.error(e); document.getElementById('loading-name').textContent = `오류: ${e.message}`; });

// debug: what a ray from `o` along `d` runs into first, and what it is
window.__rayHits = (root, o, d, far = 60) => {
  const rc = new THREE.Raycaster(V3(...o), V3(...d).normalize(), 0, far);
  const hits = rc.intersectObject(root, true).filter((h) => h.object.isMesh && !h.object.isInstancedMesh);
  return hits.slice(0, 3).map((h) => {
    const names = []; let p = h.object; while (p && names.length < 3) { names.push(p.type + (p.name ? ':' + p.name : '') + (p.geometry ? '/' + p.geometry.type : '')); p = p.parent; }
    const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
    return { d: +h.distance.toFixed(2), p: h.point.toArray().map((v) => +v.toFixed(2)), obj: names.join(' < '), mat: m?.type, col: m?.color?.getHexString(), em: m?.emissive?.getHexString(), n: h.face?.normal?.toArray().map((v) => +v.toFixed(2)), verts: h.object.geometry?.attributes?.position?.count };
  });
};
