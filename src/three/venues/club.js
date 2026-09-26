// ─────────────────────────────────────────────────────────────────────────────
// CLUB — a live house: 300 standing, 12 × 16 × 3.5 m, black walls, a low
// ceiling you can touch with a raised hand, a band's backline four metres away
// and an LED wall behind it. The low ceiling is what puts the first
// reflection at +6 ms.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, carpetTex, concreteTex, glowMat, phys, plasterTex, prng, std, withRepeat, woodTex } from '../core.js';
import { ampStack, drumKit, guitar, keyboardRig, ledScreen, mats, micStand, shadowSpot, stageDeck, subStack, truss, wedge } from '../rig.js';
import { runShow, section } from '../show.js';

// Gig posters for the walls: invented bills, bold type on flat colour.
export function gigPoster(seed) {
  const r = prng(seed);
  const W = 256, H = 360;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bgs = ['#e8e2d0', '#1a1a1a', '#c8341e', '#f2c230', '#1d3f8a', '#e56a9a', '#2c6e49'];
  const fgs = ['#111', '#f2f2f2', '#111', '#111', '#f2f2f2', '#111', '#f2f2f2'];
  const k = Math.floor(r() * bgs.length);
  g.fillStyle = bgs[k]; g.fillRect(0, 0, W, H);
  g.fillStyle = fgs[k];
  g.globalAlpha = 0.85;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    if (r() < 0.5) g.arc(W * r(), H * (0.2 + r() * 0.4), 30 + r() * 70, 0, Math.PI * 2);
    else g.rect(W * r() * 0.6, H * (0.15 + r() * 0.4), 40 + r() * 120, 20 + r() * 90);
    g.fill();
  }
  g.globalAlpha = 1;
  const names = ['NIGHT SWIMS', 'PAPER TIGERS', 'LOW TIDE', 'STATIC BLOOM', 'GLASS ANIMALS', 'SOFT RIOT', 'MOTH & FLAME', 'NORTHERN HUM'];
  g.font = `900 ${34 + Math.floor(r() * 10)}px "Inter Tight", system-ui, sans-serif`;
  g.fillText(names[Math.floor(r() * names.length)], 14, H - 70, W - 28);
  g.font = '500 15px "JetBrains Mono", ui-monospace, monospace';
  g.fillText(`LIVE · ${10 + Math.floor(r() * 20)}.${Math.floor(1 + r() * 12)} · 19:30`, 14, H - 40);
  g.fillText('ALL STANDING', 14, H - 20);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function blinder(pipe, pos, dir) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.22), mats().paint);
  body.position.copy(pos); body.lookAt(pos.clone().add(dir)); g.add(body);
  const lampM = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const flares = [];
  for (const dx of [-0.15, 0.15]) {
    const p = pos.clone().add(V3(dx, 0, 0)).addScaledVector(dir, 0.12);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.11, 18), lampM);
    lamp.position.copy(p); lamp.lookAt(p.clone().add(dir)); g.add(lamp);
    flares.push(pipe.flares.add(p, KELVIN(2900), 1.4, 0));
  }
  return { group: g, lampM, flares };
}

export function buildClub(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const W = 12, D = 16, H = 3.5, X = W / 2;
  const DECK = 0.6, FRONT = 3.5;
  const eye = V3(0, 1.7, 6.3);

  // ── the room: black paint on everything, a floor that has seen some nights ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ ...withRepeat(concreteTex({ key: 'livefloor', tone: 0.07, seed: 91 }), W / 3, D / 3), roughness: 0.55, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, D / 2); floor.receiveShadow = true;
  root.add(floor);
  const blackWall = std({ ...withRepeat(plasterTex({ key: 'blackpaint', base: [0.035, 0.035, 0.038] }), 3, 1), roughness: 0.85 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), blackWall);
    wall.rotation.y = -side * Math.PI / 2; wall.position.set(side * X, H / 2, D / 2); wall.receiveShadow = true;
    root.add(wall);
    // acoustic foam panels down the side walls
    const foam = [];
    for (let z = 4.2; z < 13; z += 1.4) for (const y of [1.9, 2.8]) { const f = new THREE.BoxGeometry(0.06, 0.8, 1.2); f.translate(side * (X - 0.04), y, z); foam.push(f); }
    root.add(new THREE.Mesh(mergeGeometries(foam), std({ color: 0x0c0c0e, roughness: 1 })));
    // posters
    for (let i = 0; i < 4; i++) {
      const pz = 4.6 + i * 2.1 + (side > 0 ? 0.7 : 0);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), std({ map: gigPoster(i * 7 + (side > 0 ? 3 : 0)), roughness: 0.6 }));
      pm.rotation.y = -side * Math.PI / 2; pm.position.set(side * (X - 0.08), 1.45, pz); root.add(pm);
    }
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), blackWall);
  back.rotation.y = Math.PI; back.position.set(0, H / 2, D); root.add(back);
  const stageWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std({ color: 0x050506, roughness: 0.95 }));
  stageWall.position.set(0, H / 2, 0.01); root.add(stageWall);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ color: 0x070708, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, D / 2); root.add(ceil);
  const duct = std({ color: 0x141416, metalness: 0.7, roughness: 0.5 });
  for (const x of [-3.9, 3.6]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, D - 4, 18), duct);
    d.rotation.x = Math.PI / 2; d.position.set(x, H - 0.26, D / 2 + 2); root.add(d);
  }

  // ── the stage ──
  const deck = stageDeck({ w: 9.2, d: FRONT - 0.1, h: DECK, z: (FRONT + 0.1) / 2, fascia: 0x060606, lip: false });
  root.add(deck);
  // gaffer tape along the front edge
  const tape = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 0.05), std({ color: 0xd8d0b0, roughness: 0.7 }));
  tape.rotation.x = -Math.PI / 2; tape.position.set(0, DECK + 0.002, FRONT - 0.06); root.add(tape);

  // the LED wall behind the band
  const SW = 7.8, SH = 2.5, aspect = SW / SH;
  const screen = ledScreen({ w: SW, h: SH, tex: ctx.art.texture(aspect), pitch: 0.0026, bright: 1.35, frame: 0.06, lightPower: 1.3 });
  screen.position.set(0, DECK + 0.25 + SH / 2, 0.22);
  root.add(screen);
  ctx.addScreen(screen, aspect, 'main');

  // ── the backline: set up and waiting ──
  const riser = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.36, 2.0), [std({ color: 0x0a0a0a }), std({ color: 0x0a0a0a }), std({ ...withRepeat(carpetTex({ key: 'drumrug', base: [0.09, 0.08, 0.08] }), 3, 2), roughness: 1 }), std({ color: 0x0a0a0a }), std({ color: 0x0c0c0c, roughness: 0.6 }), std({ color: 0x0a0a0a })]);
  riser.position.set(0, DECK + 0.18, 1.35); riser.receiveShadow = true; riser.castShadow = true; root.add(riser);
  const kit = drumKit({ shell: 0x0e0e10 });
  kit.position.set(0, DECK + 0.36, 1.45); root.add(kit);
  const throne = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.55, 14), mats().black);
  throne.position.set(0, DECK + 0.36 + 0.28, 0.75); root.add(throne);
  // guitar: half stack, guitar on a stand, pedalboard
  const gtrAmp = ampStack({ w: 0.76, h: 0.76, d: 0.36, count: 1 });
  gtrAmp.position.set(-2.9, DECK, 1.0); gtrAmp.rotation.y = 0.12; root.add(gtrAmp);
  const combo = ampStack({ w: 0.62, h: 0.52, d: 0.3, count: 1 });
  combo.position.set(-3.8, DECK, 1.3); combo.rotation.y = 0.35; root.add(combo);
  const gStand = (x, z, col, bass) => {
    const gt = guitar({ color: col, bass });
    gt.scale.setScalar(0.78);
    gt.position.set(x, DECK + 0.5, z); gt.rotation.set(-0.28, 0.2 * Math.sign(-x), 0); root.add(gt);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5), mats().black);
    st.position.set(x, DECK + 0.31, z - 0.1); root.add(st);
  };
  gStand(-2.2, 1.9, 0x5a1a0e, false);
  gStand(2.25, 1.9, 0x1b1b1d, true);
  const pedals = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.32), mats().black);
  pedals.position.set(-1.9, DECK + 0.03, 2.75); root.add(pedals);
  // bass: a fridge and a head
  const bassRig = ampStack({ w: 0.66, h: 1.3, d: 0.42, count: 1 });
  bassRig.position.set(2.9, DECK, 1.0); bassRig.rotation.y = -0.12; root.add(bassRig);
  // keys on an X stand
  const keys = keyboardRig();
  keys.position.set(3.35, DECK, 2.4); keys.rotation.y = -0.7; root.add(keys);
  // microphones
  for (const [x, z, h] of [[0, 2.95, 1.55], [-2.0, 2.75, 1.5], [2.05, 2.75, 1.5], [3.0, 2.95, 1.4]]) {
    const m = micStand({ height: h }); m.position.set(x, DECK, z); m.rotation.y = Math.PI; root.add(m);
  }
  // wedges and a set list taped to the floor
  for (const x of [-2.3, -1.0, 1.0, 2.3]) { const w = wedge({ w: 0.5 }); w.position.set(x, DECK, FRONT - 0.35); w.rotation.y = Math.PI; root.add(w); }
  const setlist = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), std({ color: 0xf0ece0, roughness: 0.8 }));
  setlist.rotation.x = -Math.PI / 2; setlist.position.set(0.35, DECK + 0.003, FRONT - 0.7); root.add(setlist);
  // PA: tops on subs at the stage corners
  for (const side of [-1, 1]) {
    const sub = subStack({ w: 0.8, h: 0.62, d: 0.8, count: 1 }); sub.position.set(side * 5.15, 0, FRONT + 0.1); root.add(sub);
    const top = subStack({ w: 0.5, h: 0.78, d: 0.45, count: 1 }); top.position.set(side * 5.15, 0.64, FRONT + 0.1); top.rotation.y = -side * 0.25; root.add(top);
  }

  // ── lights ──
  const rig = ctx.rig({ finish: 'black' });
  const fTruss = truss(9.6, { size: 0.3, finish: 'black' }); fTruss.position.set(0, H - 0.3, FRONT - 0.1); root.add(fTruss);
  const bTruss = truss(9.6, { size: 0.3, finish: 'black' }); bTruss.position.set(0, H - 0.25, 0.7); root.add(bTruss);
  const fronts = [], backs = [], pars = [];
  for (let i = 0; i < 4; i++) fronts.push({ fx: rig.add({ kind: 'wash', pos: V3(-3.6 + i * 2.4, H - 0.48, FRONT - 0.1), scale: 0.55, length: 5, angle: 0.28, beamGain: 0.6, flareGain: 0.35 }), i, n: 4, group: 0 });
  for (let i = 0; i < 5; i++) backs.push({ fx: rig.add({ kind: 'beam', pos: V3(-3.8 + i * 1.9, H - 0.45, 0.7), scale: 0.5, length: 14, angle: 0.035, beamGain: 1.2, flareGain: 0.7 }), i, n: 5, group: 1 });
  for (let i = 0; i < 4; i++) pars.push({ fx: rig.add({ kind: 'par', pos: V3(-3.0 + i * 2.0, H - 0.45, FRONT - 0.15), scale: 0.45, length: 4.5, angle: 0.2, beamGain: 0.5, flareGain: 0.25, body: false }), i, n: 4, group: 2 });
  const blinders = [-2.4, 2.4].map((x) => { const b = blinder(pipe, V3(x, H - 0.55, 0.85), V3(0, -0.12, 1).normalize()); root.add(b.group); return b; });

  const key = shadowSpot(KELVIN(3400), 0, { angle: 0.55, penumbra: 0.7, size: q.shadowSize, far: 16, cast: q.shadows });
  key.position.set(0.4, H - 0.35, FRONT - 0.2); key.target.position.set(0, DECK + 0.4, 1.4);
  const colA = shadowSpot(0xffffff, 0, { angle: 0.6, penumbra: 1, cast: false });
  colA.position.set(-3, H - 0.4, FRONT); colA.target.position.set(0.5, DECK, 1.2);
  const colB = shadowSpot(0xffffff, 0, { angle: 0.6, penumbra: 1, cast: false });
  colB.position.set(3, H - 0.4, FRONT); colB.target.position.set(-0.5, DECK, 1.2);
  const backL = shadowSpot(0xffffff, 0, { angle: 0.7, penumbra: 1, cast: false });
  backL.position.set(0, H - 0.3, 0.7); backL.target.position.set(0, 0.6, 5);
  const blindL = new THREE.PointLight(KELVIN(2900), 0, 14, 2); blindL.position.set(0, H - 0.6, 1.2);
  for (const l of [key, colA, colB, backL]) root.add(l, l.target);
  root.add(blindL);
  const houseL = [];
  for (const z of [7, 11.5, 14.8]) { const l = new THREE.PointLight(KELVIN(2700), 0, 10, 2); l.position.set(0, H - 0.3, z); root.add(l); houseL.push(l); }
  root.add(new THREE.HemisphereLight(0x16141a, 0x050505, 0.1));
  // exit signs
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), glowMat(0x19c26a, 2));
    sign.position.set(side * (X - 0.03), 2.5, 9); sign.rotation.y = -side * Math.PI / 2; root.add(sign);
  }

  // ── the bar at the back ──
  const barTop = std({ ...withRepeat(woodTex({ key: 'bartop', planks: 3, joints: 1, base: [0.18, 0.1, 0.05], rough: 0.25, seed: 19 }), 2, 0.5), roughness: 1 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 0.7), [mats().cab, mats().cab, barTop, mats().cab, mats().cab, mats().cab]);
  counter.position.set(-1, 0.55, 14.6); root.add(counter);
  const shelfGlow = glowMat(KELVIN(2600), 1.4);
  for (const y of [1.5, 2.0, 2.5]) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.03, 0.3), shelfGlow); sh.position.set(-1, y, 15.8); root.add(sh);
  }
  const bottles = [];
  const brnd = prng(4);
  for (const y of [1.5, 2.0, 2.5]) for (let x = -3.6; x < 1.6; x += 0.14 + brnd() * 0.06) {
    const b = new THREE.CylinderGeometry(0.035, 0.04, 0.3 + brnd() * 0.08, 8); b.translate(x, y + 0.17, 15.78); bottles.push(b);
  }
  root.add(new THREE.Mesh(mergeGeometries(bottles), phys({ color: 0x3a2a14, roughness: 0.1, transmission: 0.3, transparent: true, opacity: 0.85 })));

  // no audience: the floor is empty, the band's gear waiting under the lights

  // haze: a small room, heavily hazed
  const hz = pipe.haze;
  const offs = [[-0.7, 0.3], [0.7, 0.3], [0, -0.2]];
  ctx.screenHaze(screen, offs.map(([dx, dy]) => hz.add(V3(dx * SW * 0.5, screen.position.y + dy * SH * 0.5, 0.6), 0xffffff, 0)), offs);
  screen.userData.hazePower = 12;
  const hzA = hz.add(V3(-3, H - 0.6, FRONT), 0xffffff, 0), hzB = hz.add(V3(3, H - 0.6, FRONT), 0xffffff, 0);
  const hzBlind = hz.add(V3(0, H - 0.6, 0.9), KELVIN(2900), 0);

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, 2.05, 0.4), fov: 62, near: 0.05, far: 60 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x050506, 0.02),
    hazeDensity: 0.0022, beamGain: 0.45, hazeAmb: new THREE.Color(0x030305), hazeAmbDist: 40,
    bloom: { strength: 0.55, radius: 0.55, threshold: 1.0 },
    grade: { exposure: 1.25, vignette: 0.45, ca: 0.005, grain: 0.045, sat: 1.08, lift: [0.006, 0.005, 0.008] },
    env: { w: W, h: H, d: D, eye, wall: 0x0c0a0e, floor: 0x060606, emitters: [
      { w: SW, h: SH, pos: V3(0, screen.position.y, 0.3), normal: V3(0, 0, 1), screen: true, power: 1.2, aspect },
      { w: 5.6, h: 1.2, pos: V3(-1, 2, 15.8), normal: V3(0, 0, -1), color: KELVIN(2600), power: 2 },
    ] },
    envIntensity: 0.55,
    update(f) {
      const show = 1 - f.house;
      const stage = V3(0, DECK, 1.5);
      runShow(rig, fronts, f, { house: V3(0, DECK, 1.8), stage, span: 5, strobe: false });
      runShow(rig, backs, f, { house: V3(0, 1.4, 9), stage, span: 9 });
      runShow(rig, pars, f, { house: V3(0, DECK, 1.5), stage, span: 6, strobe: false });
      fronts.forEach(({ fx }) => { fx.angle = 0.3; });
      pars.forEach(({ fx, i }) => { rig.aim(fx, V3(-2.6 + i * 1.7, DECK, 1.6)); fx.intensity = (0.5 + 0.4 * f.energy + (i % 2 ? f.snare : f.kick) * 0.4) * show; });
      const sec = f.sec || section(f.bar);
      const hit = sec === 'chorus' && f.kick > 0.7 && f.beat % 4 === 0 ? f.kick : 0;
      blinders.forEach((b) => { b.lampM.color.copy(KELVIN(2900)).multiplyScalar(0.05 + hit * 30 * show); b.flares.forEach((fl) => { fl.intensity = hit * 3 * show; }); });
      blindL.intensity = hit * 60 * show;
      hzBlind.power = hit * 25 * show;
      key.intensity = (26 + 10 * f.energy) * show + 12 * f.house;
      colA.color.copy(f.pal.a); colB.color.copy(f.pal.b); backL.color.copy(f.pal.c);
      colA.intensity = (14 + 20 * f.energy + 8 * f.kick) * show;
      colB.intensity = (14 + 20 * f.energy + 8 * f.snare) * show;
      backL.intensity = (8 + 16 * f.energy) * show;
      hzA.color.copy(f.pal.a); hzB.color.copy(f.pal.b);
      hzA.power = hzB.power = (8 + 10 * f.energy) * show;
      houseL.forEach((l, i) => { l.intensity = (i === 2 ? 2.5 : 0) + f.house * 14; });
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.25).multiplyScalar((0.1 + 0.12 * f.kick + hit * 0.5) * show + 0.01);
      cu.uStage.value.set(0, 2.2, 1.0);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.015 * show + 0.08 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.005).multiplyScalar(1 + f.house * 5);
    },
  };
}
