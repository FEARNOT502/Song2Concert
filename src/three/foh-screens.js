// foh-screens.js — the FOH desks' monitors, drawn live.
//
//   audio, left   the show: the venue, the song (sleeve, title, waveform with
//                 the playhead, time) and what is cued next
//   audio, right  the room: a real-time analyser over the room's figures
//   light, left   the desk's parts (keys 1–0, -), AUTO/MANUAL, what comes next,
//                 the beat; and the camera feed with its CAM 1–5 buttons
//   light, right  the fan-light map (foh-fanmap.js)
//
// Each screen is a canvas on the monitor's own quad in the GLB (found by its
// material's name), redrawn a few times a second, and only while someone is
// close enough to the desk to read it.
import * as THREE from 'three';
import { VENUES } from '../data.js';
import { DESK } from '../lightDesk.js';
import { cameraFeed, cameraPoses, fanMap } from './foh-feeds.js';

const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const SANS = '"Inter Tight", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
const C = {
  bg: '#0a0d13', panel: '#111824', line: '#1f2a3a', dim: '#5d6b80', text: '#d9e1ec', soft: '#9aa7ba',
  accent: '#ffb35c', live: '#ff4a3d', green: '#57d6a2', blue: '#6ea8ff', violet: '#b48cff',
};
// how near (m) the camera must be for the screens to be worth drawing
const NEAR = 28;

// The lighting screen's halves and the camera's picture and buttons on it,
// as fractions of its canvas (also what a click is tested against).
export const LIGHT_W = 1560, LIGHT_H = 560;
export const CAM_VIEW = { x: 800, y: 74, w: 740, h: 400 };
export const CAM_BUTTONS = Array.from({ length: 5 }, (_, i) => ({ i, x: 800 + i * 150, y: 488, w: 140, h: 56 }));
export const CAMERAS = ['FOH', 'CAM 03', 'CAM 04', 'CAM 05', 'JIB'];

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function screenOn(group, name, w, h) {
  let mesh = null;
  group.traverse((o) => { if (!mesh && o.isMesh && o.material?.name === name) mesh = o; });
  if (!mesh) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.anisotropy = 4;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  const material = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(0.82, 0.82, 0.82), toneMapped: false });
  material.name = name;
  mesh.material = material;
  return { mesh, canvas, ctx, map, material, centre: null, last: -1 };
}
// where a screen is in the room (once its group has its world matrix)
function centreOf(s) {
  if (!s.centre) {
    const m = new THREE.Matrix4();
    s.mesh.getMatrixAt(0, m);
    s.mesh.geometry.computeBoundingBox();
    s.mesh.updateWorldMatrix(true, false);
    s.centre = s.mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m).applyMatrix4(s.mesh.matrixWorld);
  }
  return s.centre;
}

// ── audio, left: the show ──
function drawShow(s, st) {
  const { ctx, canvas: { width: W, height: H } } = s;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // the venue bar
  ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, 76);
  ctx.fillStyle = C.dim; ctx.font = `600 20px ${MONO}`; ctx.textBaseline = 'middle';
  ctx.fillText('SHOW', 28, 38);
  ctx.fillStyle = C.text; ctx.font = `700 34px ${SANS}`;
  const venue = st.venue;
  const name = venue ? venue.name.toUpperCase() + (st.mode === '360' ? ' 360' : '') : '';
  ctx.fillText(name, 112, 39);
  const nameW = ctx.measureText(name).width;
  ctx.fillStyle = C.soft; ctx.font = `500 22px ${MONO}`;
  ctx.fillText(venue ? `${venue.type} · ${venue.capacity.toUpperCase()}` : '', 112 + nameW + 26, 40);
  ctx.fillStyle = st.playing ? C.live : C.dim;
  ctx.beginPath(); ctx.arc(W - 120, 38, 9, 0, Math.PI * 2); ctx.fill();
  ctx.font = `700 20px ${MONO}`; ctx.fillText(st.playing ? 'ON AIR' : 'STANDBY', W - 102, 39);

  // the sleeve
  const art = 336, ax = 28, ay = 104;
  ctx.fillStyle = C.panel; ctx.fillRect(ax, ay, art, art);
  if (st.cover && st.title) ctx.drawImage(st.cover, ax, ay, art, art);
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(ax, ay, art, art);

  const x0 = ax + art + 36, x1 = W - 32, w = x1 - x0;
  if (!st.title) {
    ctx.fillStyle = C.dim; ctx.font = `600 30px ${MONO}`;
    ctx.fillText('NO FILE LOADED', x0, ay + 40);
    return;
  }
  ctx.fillStyle = C.dim; ctx.font = `600 18px ${MONO}`;
  ctx.fillText('NOW PLAYING', x0, ay + 14);
  ctx.fillStyle = C.text; ctx.font = `700 50px ${SANS}`;
  ctx.fillText(fit(ctx, st.title, w), x0, ay + 62);
  ctx.fillStyle = C.soft; ctx.font = `500 30px ${SANS}`;
  ctx.fillText(fit(ctx, st.artist || '', w), x0, ay + 108);

  // the waveform, played part lit, and the playhead
  const wy = ay + 146, wh = 118, mid = wy + wh / 2;
  ctx.fillStyle = C.panel; ctx.fillRect(x0, wy, w, wh);
  const k = st.duration > 0 ? Math.min(1, Math.max(0, st.position / st.duration)) : 0;
  const peaks = st.peaks;
  const bars = Math.floor(w / 4);
  for (let i = 0; i < bars; i++) {
    let p = 0.08;
    if (peaks?.length) {
      const a = Math.floor(i / bars * peaks.length), b = Math.max(a + 1, Math.floor((i + 1) / bars * peaks.length));
      for (let j = a; j < b; j++) p = Math.max(p, peaks[j]);
    }
    const h = Math.max(2, p * (wh - 10));
    ctx.fillStyle = i / bars <= k ? C.accent : '#2e3a4d';
    ctx.fillRect(x0 + i * 4, mid - h / 2, 3, h);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0 + k * w - 1.5, wy - 6, 3, wh + 12);
  ctx.fillStyle = C.text; ctx.font = `600 24px ${MONO}`;
  ctx.textAlign = 'left'; ctx.fillText(fmtTime(st.position), x0, wy + wh + 26);
  ctx.textAlign = 'right'; ctx.fillText(fmtTime(st.duration), x1, wy + wh + 26);
  ctx.textAlign = 'left';

  // what is cued next
  const ny = ay + art - 14;
  ctx.fillStyle = C.dim; ctx.font = `700 22px ${MONO}`;
  ctx.fillText('NEXT ▸', x0, ny);
  ctx.fillStyle = st.nextSong ? C.text : C.dim; ctx.font = `500 26px ${SANS}`;
  ctx.fillText(fit(ctx, st.nextSong || '—', w - 110), x0 + 108, ny + 1);
}

// ── audio, right: the room ──
const RTA_BANDS = 30;
function drawRoom(s, st, rta) {
  const { ctx, canvas: { width: W, height: H } } = s;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, 56);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text; ctx.font = `700 24px ${MONO}`;
  ctx.fillText('ROOM / SYSTEM', 28, 29);
  ctx.fillStyle = C.soft; ctx.font = `500 20px ${MONO}`;
  ctx.fillText(st.venue ? st.venue.name.toUpperCase() + (st.mode === '360' ? ' 360' : '') : '', 250, 30);
  ctx.textAlign = 'right'; ctx.fillStyle = C.dim;
  ctx.fillText('RTA · 1/3 OCT · dB', W - 28, 30);
  ctx.textAlign = 'left';

  // the analyser: bars and their peaks, over a dB grid
  const gx = 64, gy = 72, gw = W - 92, gh = 214;
  ctx.fillStyle = C.panel; ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.fillStyle = C.dim; ctx.font = `500 15px ${MONO}`; ctx.textAlign = 'right';
  for (let d = 0; d <= 4; d++) {
    const y = gy + d * gh / 4;
    ctx.beginPath(); ctx.moveTo(gx, y + .5); ctx.lineTo(gx + gw, y + .5); ctx.stroke();
    ctx.fillText(`${-d * 15}`, gx - 8, y);
  }
  ctx.textAlign = 'center';
  const bw = gw / RTA_BANDS;
  for (let b = 0; b < RTA_BANDS; b++) {
    const v = rta.level[b], pk = rta.peak[b];
    const h = v * gh;
    const x = gx + b * bw + 2;
    const grad = ctx.createLinearGradient(0, gy + gh, 0, gy);
    grad.addColorStop(0, C.green); grad.addColorStop(.7, C.accent); grad.addColorStop(1, C.live);
    ctx.fillStyle = grad;
    ctx.fillRect(x, gy + gh - h, bw - 4, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, gy + gh - pk * gh - 2, bw - 4, 3);
  }
  for (const [hz, label] of [[63, '63'], [250, '250'], [1000, '1k'], [4000, '4k'], [16000, '16k']]) {
    const b = Math.log(hz / RTA_LO) / Math.log(RTA_HI / RTA_LO) * RTA_BANDS;
    ctx.fillStyle = C.dim; ctx.fillText(label, gx + b * bw, gy + gh + 16);
  }
  ctx.textAlign = 'left';

  // the room's figures
  const a = st.venue?.acoustics || {}, pos = st.venue?.position || {};
  const cells = [
    ['RT60', a.rt60], ['RT60 125 Hz', a['rt60 @125Hz']], ['BASS RATIO', a['bass ratio']], ['SPACIOUSNESS', a.spaciousness],
    ['WARMTH', a.warmth?.toUpperCase()], ['FIRST REFL.', pos.firstReflection], ['DISTANCE', pos.distance], ['LEVEL', a.level],
  ];
  const cw = (W - 56) / 4;
  cells.forEach(([k, v], i) => {
    const x = 28 + (i % 4) * cw, y = 330 + Math.floor(i / 4) * 74;
    ctx.fillStyle = C.panel; ctx.fillRect(x, y, cw - 12, 64);
    ctx.fillStyle = C.dim; ctx.font = `600 15px ${MONO}`; ctx.fillText(k, x + 14, y + 18);
    ctx.fillStyle = C.text; ctx.font = `700 26px ${MONO}`; ctx.fillText(v ?? '—', x + 14, y + 45);
  });
}

// ── light, left: the parts, and the camera's buttons ──
function drawLight(s, st, cam) {
  const { ctx } = s;
  const W = LIGHT_W, H = LIGHT_H, half = 780;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  // the header
  ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, 58);
  ctx.fillStyle = C.text; ctx.font = `700 24px ${MONO}`;
  ctx.fillText('LIGHTING / PARTS', 26, 30);
  const manual = st.manual;
  round(ctx, half - 196, 12, 168, 36, 6);
  ctx.fillStyle = manual ? C.accent : C.green; ctx.fill();
  ctx.fillStyle = '#0a0d13'; ctx.font = `800 20px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText(manual ? 'MANUAL' : 'AUTO', half - 112, 31);
  ctx.textAlign = 'left';

  // the eleven keys
  const cols = 4, gx = 26, gy = 76, cw = (half - 52) / cols, ch = 96;
  DESK.forEach(([id, label, key], i) => {
    const x = gx + (i % cols) * cw, y = gy + Math.floor(i / cols) * (ch + 10);
    const on = st.playing && st.part === id;
    round(ctx, x, y, cw - 10, ch, 8);
    ctx.fillStyle = on ? (manual ? 'rgba(255,179,92,.28)' : 'rgba(87,214,162,.22)') : C.panel; ctx.fill();
    ctx.lineWidth = on ? 3 : 1.5; ctx.strokeStyle = on ? (manual ? C.accent : C.green) : C.line; ctx.stroke();
    ctx.fillStyle = on ? '#fff' : C.soft; ctx.font = `700 26px ${MONO}`;
    ctx.fillText(label.toUpperCase(), x + 16, y + ch / 2 + 8);
    ctx.fillStyle = C.dim; ctx.font = `600 18px ${MONO}`;
    ctx.fillText(key, x + cw - 36, y + 20);
  });
  // the HIT key, lit while the hit lasts
  const hx = gx + 3 * cw, hy = gy + 2 * (ch + 10);
  const hitOn = st.hitT < 0.6;
  round(ctx, hx, hy, cw - 10, ch, 8);
  ctx.fillStyle = hitOn ? '#fff' : C.panel; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = hitOn ? '#fff' : C.line; ctx.stroke();
  ctx.fillStyle = hitOn ? '#0a0d13' : C.soft; ctx.font = `800 26px ${MONO}`;
  ctx.fillText('HIT', hx + 16, hy + ch / 2 + 8);
  ctx.fillStyle = C.dim; ctx.font = `600 18px ${MONO}`; ctx.fillText('+', hx + cw - 36, hy + 20);

  // what comes next, and the beat
  const by = H - 52;
  ctx.fillStyle = C.dim; ctx.font = `600 20px ${MONO}`;
  const next = st.playing && !manual && st.nextPart ? `NEXT  ${st.nextPart.toUpperCase()}  IN ${fmtTime(st.toNext)}` : st.playing ? (manual ? 'HELD BY HAND · ` FOR AUTO' : 'FOLLOWING THE SONG') : 'STOPPED';
  ctx.fillText(next, 26, by);
  const beat = Math.floor(st.beat ?? 0) % 4;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.arc(half - 150 + i * 34, by, 11, 0, Math.PI * 2);
    ctx.fillStyle = st.playing && i === beat ? (i === 0 ? C.live : C.accent) : C.line; ctx.fill();
  }

  // the camera half: its title, the picture (drawn over by the feed), the buttons
  ctx.fillStyle = C.line; ctx.fillRect(half, 0, 2, H);
  ctx.fillStyle = C.text; ctx.font = `700 24px ${MONO}`;
  ctx.fillText('CAMERA', half + 22, 30);
  ctx.fillStyle = C.live; ctx.font = `700 22px ${MONO}`;
  ctx.fillText(`● PGM  CAM ${cam + 1}  ${CAMERAS[cam]}`, half + 160, 30);
  const v = CAM_VIEW;
  ctx.fillStyle = '#05070b'; ctx.fillRect(v.x, v.y, v.w, v.h);
  if (!st.feed) {
    ctx.fillStyle = C.dim; ctx.font = `700 34px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText('NO SIGNAL', v.x + v.w / 2, v.y + v.h / 2);
    ctx.textAlign = 'left';
  }
  for (const b of CAM_BUTTONS) {
    const on = b.i === cam;
    round(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = on ? C.live : C.panel; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = on ? C.live : C.line; ctx.stroke();
    ctx.fillStyle = on ? '#fff' : C.soft; ctx.font = `800 20px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText(`${b.i + 1}`, b.x + 22, b.y + b.h / 2 + 1);
    ctx.font = `600 16px ${MONO}`;
    ctx.fillText(CAMERAS[b.i], b.x + b.w / 2 + 14, b.y + b.h / 2 + 1);
    ctx.textAlign = 'left';
  }
}

// the analyser's log bands
const RTA_LO = 40, RTA_HI = 16000;
function readRta(rta, st, dt) {
  const bins = st.bins;
  const fall = Math.exp(-dt * 6), peakFall = dt * 0.25;
  for (let b = 0; b < RTA_BANDS; b++) {
    let v = 0;
    if (bins && st.playing) {
      const lo = RTA_LO * Math.pow(RTA_HI / RTA_LO, b / RTA_BANDS), hi = RTA_LO * Math.pow(RTA_HI / RTA_LO, (b + 1) / RTA_BANDS);
      const a = Math.max(1, Math.floor(lo / st.binHz)), z = Math.max(a, Math.min(bins.length - 1, Math.ceil(hi / st.binHz)));
      for (let i = a; i <= z; i++) v = Math.max(v, bins[i] / 255);
    }
    rta.level[b] = Math.max(v, rta.level[b] * fall);
    rta.peak[b] = Math.max(rta.level[b], rta.peak[b] - peakFall);
  }
}

// The lighting monitor: its canvas, with the camera's picture laid into the
// canvas's picture box (tone-mapped there, so a bright stage does not burn it).
function lightMaterial(ui) {
  return new THREE.ShaderMaterial({
    name: 'Cue stack monitor',
    uniforms: {
      tUI: { value: ui }, tFeed: { value: null }, uFeedOn: { value: 0 }, uGain: { value: 0.82 },
      uRect: { value: new THREE.Vector4(CAM_VIEW.x / LIGHT_W, CAM_VIEW.y / LIGHT_H, (CAM_VIEW.x + CAM_VIEW.w) / LIGHT_W, (CAM_VIEW.y + CAM_VIEW.h) / LIGHT_H) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tUI, tFeed; uniform float uFeedOn, uGain; uniform vec4 uRect;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tUI, vUv).rgb;
        vec2 q = (vUv - uRect.xy) / (uRect.zw - uRect.xy);
        if (uFeedOn > 0.5 && q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0) {
          vec3 f = texture2D(tFeed, vec2(q.x, 1.0 - q.y)).rgb * 1.7;
          c = f / (1.0 + f);
        }
        gl_FragColor = vec4(c * uGain, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function meshWith(group, name) {
  let mesh = null;
  group.traverse((o) => { if (!mesh && o.isMesh && o.material?.name === name) mesh = o; });
  return mesh;
}

export function fohScreens(group, { venueId, mode, root, plan, pipe, data, eye, focus, deck, field = 0, high = true }) {
  const show = screenOn(group, 'Audio channel display', 1120, 480);
  const room = screenOn(group, 'Audio routing display', 1120, 480);
  const light = screenOn(group, 'Cue stack monitor', LIGHT_W, LIGHT_H);
  if (!show && !room && !light) return null;
  if (light) {
    light.material.dispose();
    light.material = light.mesh.material = lightMaterial(light.map);
  }
  // the fan-light map, on its own 4:3 monitor
  const mapMesh = meshWith(group, 'Fan map display');
  const map = mapMesh && root && plan ? fanMap(root, plan, { size: high ? [1024, 768] : [512, 384] }) : null;
  if (map) mapMesh.material = new THREE.MeshBasicMaterial({ name: 'Fan map display', map: map.texture, toneMapped: false });
  // the cameras, their picture, CAM 1's viewfinder and tally
  const feed = light && pipe && data ? cameraFeed(pipe, cameraPoses({ data, eye, focus, deck, field }), { size: high ? [480, 270] : [320, 180] }) : null;
  const finder = meshWith(group, 'Camera viewfinder live');
  const finderOwn = finder?.material;
  const finderLive = feed && new THREE.MeshBasicMaterial({ name: 'Camera viewfinder live', map: feed.texture, toneMapped: false });
  const tally = meshWith(group, 'CAM 1 tally lamp')?.material;
  const tallyOn = tally?.emissiveIntensity ?? 1;
  const slots = { map: { last: -1 }, feed: { last: -1 } };
  // the pictures from the room cost a second view of it: drawn only while
  // their monitor is in sight (and slower while the frame is struggling)
  const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const inSight = (mesh, camera) => {
    if (!mesh || !camera) return false;
    const c = mesh === light?.mesh ? centreOf(light) : (mesh.userData.centre ??= centreOf({ mesh, centre: null }));
    sphere.set(c, 0.8);
    return frustum.intersectsSphere(sphere);
  };
  let fed = false, mapped = false;
  const venue = VENUES.find((v) => v.id === venueId) || null;
  const rta = { level: new Float32Array(RTA_BANDS), peak: new Float32Array(RTA_BANDS) };
  let cam = 0, clock = 0, lastRta = 0;
  const all = [show, room, light].filter(Boolean);
  const near = (camPos) => all.some((s) => centreOf(s).distanceTo(camPos) < NEAR);
  // a screen redrawn at `hz`, at most
  const due = (s, hz) => {
    if (clock - s.last < 1 / hz) return false;
    s.last = clock;
    return true;
  };
  const api = {
    light,
    get camera() { return cam; },
    setCamera(i) {
      cam = Math.max(0, Math.min(CAMERAS.length - 1, i));
      if (light) light.last = -1;
      slots.feed.last = -1;
      if (!high) fed = false;
      if (finder && finderLive) finder.material = cam === 0 ? finderLive : finderOwn;
      if (tally) tally.emissiveIntensity = cam === 0 ? tallyOn : tallyOn * 0.06;
    },
    near,
    update(st) {
      clock = st.t;
      if (!near(st.camPos)) return;
      const s = { ...st, venue, mode };
      if (show && due(show, st.playing ? 4 : 1)) { drawShow(show, s); show.map.needsUpdate = true; }
      if (room && due(room, st.playing ? 20 : 2)) {
        readRta(rta, s, Math.min(.5, clock - lastRta));
        lastRta = clock;
        drawRoom(room, s, rta);
        room.map.needsUpdate = true;
      }
      // the pictures from the room: a few times a second on 'high'; once,
      // and then held, on 'low'
      if (st.camera) frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(st.camera.projectionMatrix, st.camera.matrixWorldInverse));
      const rate = st.heavy ? 5 : 15;
      if (map && st.renderer && (high ? inSight(mapMesh, st.camera) && due(slots.map, rate) : !mapped)) { map.render(st.renderer, st.scene); mapped = true; }
      const feedSeen = inSight(light.mesh, st.camera) || (cam === 0 && inSight(finder, st.camera));
      if (feed && st.renderer && (high ? feedSeen && due(slots.feed, rate) : !fed)) {
        feed.render(st.renderer, cam, clock, high);
        if (!fed) { fed = true; light.material.uniforms.tFeed.value = feed.texture; light.material.uniforms.uFeedOn.value = 1; light.last = -1; }
      }
      if (light && due(light, 10)) { drawLight(light, { ...s, feed: fed }, cam); light.map.needsUpdate = true; }
    },
    // A click on the lighting monitor's CAM buttons (a ray from the camera):
    // true when it took one.
    click(raycaster) {
      if (!light) return false;
      const hit = raycaster.intersectObject(light.mesh, false)[0];
      if (!hit?.uv) return false;
      const x = hit.uv.x * LIGHT_W, y = hit.uv.y * LIGHT_H;
      const b = CAM_BUTTONS.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      if (!b) return false;
      api.setCamera(b.i);
      return true;
    },
    dispose() {
      for (const s of all) { s.map.dispose(); s.material.dispose(); }
      map?.dispose(); feed?.dispose(); finderLive?.dispose();
    },
  };
  api.setCamera(0);
  return api;
}
