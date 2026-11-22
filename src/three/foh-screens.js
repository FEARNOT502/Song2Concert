// foh-screens.js — the FOH desks' monitors, drawn live.
//
//   audio, left   the show: the venue, the song (sleeve, title, waveform with
//                 the playhead, time) and what is cued next
//   audio, right  the room: a real-time analyser over the room's figures
//   light, left   the cue stack, next cue, mode and beat
//   light, right  the fan-light map (foh-feeds.js)
//
// Each screen is a canvas on the monitor's own quad in the GLB (found by its
// material's name), redrawn a few times a second, and only while someone is
// close enough to the desk to read it.
import * as THREE from 'three';
import { VENUES } from '../data.js';
import { DESK } from '../lightDesk.js';
import { fanMap } from './foh-feeds.js';

const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const SANS = '"Inter Tight", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
const C = {
  bg: '#0a0d13', panel: '#111824', line: '#1f2a3a', dim: '#5d6b80', text: '#d9e1ec', soft: '#9aa7ba',
  accent: '#ffb35c', live: '#ff4a3d', green: '#57d6a2', blue: '#6ea8ff', violet: '#b48cff',
};
// how near (m) the camera must be for the screens to be worth drawing
const NEAR = 28;

const LIGHT_W = 1560, LIGHT_H = 560;
const CUES = [...DESK, ['hit', 'Hit', '+']];
const cueLabel = (part) => DESK.find(([id]) => id === part)?.[1] ?? '—';

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
  return { mesh, canvas, ctx, map, centre: null, last: -1 };
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

// ── light, left: the cues and playback state ──
function drawLight(s, st) {
  const { ctx } = s;
  const W = LIGHT_W, H = LIGHT_H;
  const { manual, playing } = st;
  const modeColor = manual ? C.accent : C.green;

  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.line;
  ctx.fillRect(32, 82, W - 64, 2);

  ctx.fillStyle = C.text;
  ctx.font = `700 36px ${SANS}`;
  ctx.fillText('Lighting cues', 34, 44);
  round(ctx, W - 228, 20, 194, 48, 8);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.fillStyle = modeColor;
  ctx.font = `700 23px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(manual ? 'MANUAL' : 'AUTO', W - 131, 45);
  ctx.textAlign = 'left';

  const cols = 4, gx = 34, gy = 104, cw = 245, ch = 128, gap = 12;
  CUES.forEach(([id, label, key], i) => {
    const x = gx + (i % cols) * (cw + gap);
    const y = gy + Math.floor(i / cols) * (ch + gap);
    const hit = id === 'hit';
    const active = hit ? st.hitT < 0.6 : playing && st.part === id;
    const color = hit ? C.text : modeColor;
    round(ctx, x, y, cw, ch, 10);
    ctx.fillStyle = active ? (hit ? '#272d39' : manual ? '#39291e' : '#19312d') : C.panel;
    ctx.fill();
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.strokeStyle = active ? color : C.line;
    ctx.stroke();

    round(ctx, x + 16, y + 15, 46, 34, 5);
    ctx.fillStyle = active ? color : '#202b3e';
    ctx.fill();
    ctx.fillStyle = active ? C.bg : C.soft;
    ctx.font = `700 22px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(key, x + 39, y + 33);
    ctx.textAlign = 'left';
    ctx.fillStyle = active ? C.text : C.soft;
    ctx.font = `700 34px ${SANS}`;
    ctx.fillText(label, x + 16, y + 91);
  });

  const sx = 1072, sw = W - sx - 34, sh = 3 * ch + 2 * gap;
  round(ctx, sx, gy, sw, sh, 10);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const tx = sx + 26;
  ctx.fillStyle = C.soft;
  ctx.font = `600 21px ${MONO}`;
  ctx.fillText('CURRENT CUE', tx, 142);
  ctx.fillStyle = playing ? modeColor : C.text;
  ctx.font = `700 52px ${SANS}`;
  ctx.fillText(playing ? cueLabel(st.part) : 'Standby', tx, 198);

  ctx.fillStyle = C.line;
  ctx.fillRect(tx, 247, sw - 52, 2);
  ctx.fillStyle = C.soft;
  ctx.font = `600 21px ${MONO}`;
  ctx.fillText('NEXT CUE', tx, 284);
  const next = playing && !manual && st.nextPart;
  ctx.fillStyle = C.text;
  ctx.font = `700 38px ${SANS}`;
  ctx.fillText(next ? cueLabel(st.nextPart) : manual ? 'Held manually' : '—', tx, 329);
  if (next) {
    ctx.fillStyle = C.soft;
    ctx.font = `600 22px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtTime(st.toNext), sx + sw - 26, 330);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = C.line;
  ctx.fillRect(tx, 376, sw - 52, 2);
  ctx.fillStyle = C.soft;
  ctx.font = `600 21px ${MONO}`;
  ctx.fillText('BEAT', tx, 419);
  const beat = Math.floor(st.beat ?? 0) % 4;
  for (let i = 0; i < 4; i++) {
    round(ctx, tx + i * 102, 448, 92, 34, 5);
    ctx.fillStyle = playing && i === beat ? modeColor : '#202b3e';
    ctx.fill();
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

export function fohScreens(group, { venueId, mode, root, plan, high = true }) {
  const show = screenOn(group, 'Audio channel display', 1120, 480);
  const room = screenOn(group, 'Audio routing display', 1120, 480);
  const light = screenOn(group, 'Cue stack monitor', LIGHT_W, LIGHT_H);
  const screens = [show, room, light].filter(Boolean);
  if (!screens.length) return null;

  let mapMesh = null;
  group.traverse((o) => { if (!mapMesh && o.isMesh && o.material?.name === 'Fan map display') mapMesh = o; });
  const map = mapMesh && root && plan ? fanMap(root, plan, { size: high ? [1024, 768] : [512, 384] }) : null;
  if (map) mapMesh.material = new THREE.MeshBasicMaterial({ name: 'Fan map display', map: map.texture, toneMapped: false });
  const mapScreen = { mesh: mapMesh, centre: null, last: -1 };
  const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), sphere = new THREE.Sphere();
  let mapped = false, lastRta = 0;
  const venue = VENUES.find((v) => v.id === venueId) || null;
  const rta = { level: new Float32Array(RTA_BANDS), peak: new Float32Array(RTA_BANDS) };
  const due = (screen, time, hz) => {
    if (time - screen.last < 1 / hz) return false;
    screen.last = time;
    return true;
  };

  return {
    update(st) {
      if (!screens.some((screen) => centreOf(screen).distanceTo(st.camPos) < NEAR)) return;
      const s = { ...st, venue, mode };
      if (show && due(show, st.t, st.playing ? 4 : 1)) {
        drawShow(show, s);
        show.map.needsUpdate = true;
      }
      if (room && due(room, st.t, st.playing ? 20 : 2)) {
        readRta(rta, s, Math.min(.5, st.t - lastRta));
        lastRta = st.t;
        drawRoom(room, s, rta);
        room.map.needsUpdate = true;
      }
      if (light && due(light, st.t, 10)) {
        drawLight(light, s);
        light.map.needsUpdate = true;
      }
      if (!map || !st.renderer) return;
      if (high) {
        if (!st.camera) return;
        frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(st.camera.projectionMatrix, st.camera.matrixWorldInverse));
        sphere.set(centreOf(mapScreen), 0.8);
        if (!frustum.intersectsSphere(sphere) || !due(mapScreen, st.t, st.heavy ? 5 : 15)) return;
      } else if (mapped) return;
      map.render(st.renderer, st.scene);
      mapped = true;
    },
    dispose() { map?.dispose(); },
  };
}
