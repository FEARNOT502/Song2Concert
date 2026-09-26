// ─────────────────────────────────────────────────────────────────────────────
// DOME — Tokyo Dome: an air-supported membrane over a round bowl, 1.24 million
// m³, from FOH 55 m out on the field. Blue seats in the 1st-floor stand, the
// balcony band, the steep 2nd-floor stand under the roof; arena seats in
// blocks on the field; a catwalk to a B-stage; a sea of lightsticks under
// central control.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, DEG, KELVIN, V3, clamp, floorPanelTex, glowMat, lerp, std } from '../core.js';
import { lightPoints } from '../people.js';
import { hoists, latticeInto, ledScreen, lineArray, mats, micStand, shadowSpot, stageDeck, stageSteps, subStack, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, blockGrid, floorBlocks, floorChairs, fohPosition, runLasers, runShow, section, stageSet } from '../show.js';
import { buildStands } from '../stands.js';
import { TD_STANDS } from './td-data.js';

export function membraneMaterial() {
  const m = std({ color: 0xd8d8d4, roughness: 0.95, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBounce = { value: new THREE.Color(0) };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform vec3 uBounce;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // the cable net: two families at 45 degrees, eight and a half metres apart
          vec2 p = vec2(vWP.x + vWP.z, vWP.x - vWP.z) / (8.5 * 1.4142);
          vec2 d = abs(fract(p) - 0.5);
          vec2 w = fwidth(p) * 1.2;
          float cable = 1.0 - min(smoothstep(0.0, w.x + 0.004, 0.5 - d.x), smoothstep(0.0, w.y + 0.004, 0.5 - d.y));
          diffuseColor.rgb *= 1.0 - 0.55 * cable;
          // panel seams and a soft sag between cables
          float sag = 0.9 + 0.1 * (d.x + d.y);
          diffuseColor.rgb *= sag;
          totalEmissiveRadiance += uBounce * (1.0 - 0.6 * cable) * sag;
        }`);
  };
  m.customProgramCacheKey = () => 'membrane';
  return m;
}

export function buildDome(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 2.6, RIG = 32;
  const eye = V3(0, 1.6 + 1.0, 70);
  const STAGE = V3(0, DECK, 12);
  // The ballpark as the official seating map draws it: the field is the open
  // ground inside the 1st floor's front rows; home plate is behind FOH, the
  // stage stands in front of the centre-field fence.
  const ZH = 114;                 // home plate
  const OFF = V3(0, 0, ZH);
  const fieldRing = TD_STANDS.field[0][0].map(([x, z]) => ({ x, z: z + ZH }));
  const phi = (x, z) => Math.abs(Math.atan2(x, ZH - z)) / DEG;   // 0 at centre field, 45 at the poles

  // ── field ──
  const fieldShape = new THREE.Shape(fieldRing.map((p) => new THREE.Vector2(p.x, -p.z)));
  const fieldGeo = new THREE.ShapeGeometry(fieldShape, 1);
  fieldGeo.rotateX(-Math.PI / 2);
  const fuv = fieldGeo.attributes.uv; const fpos = fieldGeo.attributes.position;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / 16, fpos.getZ(i) / 16);
  const field = new THREE.Mesh(fieldGeo, std({ ...floorPanelTex({ key: 'domefloor', tone: 0.1 }), roughness: 0.8 }));
  field.position.y = 0.02; field.receiveShadow = true; root.add(field);

  // ── the stands, from the official seating map ──
  // The 1st floor: blocks A (rows 1–26) and B (27–47) round the infield with
  // the walkway between them, entered from the concourse behind by the
  // numbered passages at the back; the outfield's F blocks above the fence.
  // The balcony (C) behind the 1st floor, pole to pole round home. The 2nd
  // floor: D (rows 1–10) and E (11 up to 33, deepest behind home) with the
  // walkway between, the passages from its concourse opening onto it.
  const stands = buildStands(TD_STANDS, {
    offset: OFF, stage: STAGE, seed: 400, concreteTone: 0.28, roofY: 46.5,
    seatColors: { A: 0x1d3c86, B: 0x1d3c86, F: 0x1d3c86, C: 0x7a1a20, D: 0x1d3c86, E: 0x1d3c86 },
    crowd: !!q.crowd,
    // nobody behind or beside the set
    sold: (x, z) => z > 14,
  });
  root.add(stands.group);
  // the wall in front of the 1st floor: padded 4.0 m with 0.24 m of net and the
  // yellow line in the outfield, a low padded wall along the lines, and the
  // backstop net behind home plate
  const pad = [], line = [], net = [], back = [];
  for (let k = 0; k < fieldRing.length; k++) {
    const a = fieldRing[k], b = fieldRing[(k + 1) % fieldRing.length];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.05) continue;
    const ang = -Math.atan2(b.z - a.z, b.x - a.x);
    const outfield = Math.hypot(mx, mz - ZH) > 92 && phi(mx, mz) < 46;
    const seg = (hh, y, list, d = 0.36) => { const g = new THREE.BoxGeometry(len + 0.04, hh, d); g.rotateY(ang); g.translate(mx, y, mz); list.push(g); };
    if (outfield) { seg(4.0, 2.0, pad); seg(0.12, 4.02, line, 0.4); seg(0.24, 4.16, net, 0.04); }
    else { seg(1.2, 0.6, pad); if (phi(mx, mz) > 150) seg(7.5, 1.2 + 3.75, back, 0.03); }
  }
  root.add(new THREE.Mesh(mergeGeometries(pad), std({ color: 0x163a78, roughness: 0.8 })));
  root.add(new THREE.Mesh(mergeGeometries(line), glowMat(0xe8c830, 0.45)));
  root.add(new THREE.Mesh(mergeGeometries(net), std({ color: 0x151515, roughness: 1, transparent: true, opacity: 0.6 })));
  if (back.length) root.add(new THREE.Mesh(mergeGeometries(back), std({ color: 0x202024, roughness: 1, transparent: true, opacity: 0.35, side: THREE.DoubleSide })));
  // the foul poles, where the lines meet the fence
  for (const sd of [-1, 1]) {
    const r = 100, x = sd * r * Math.SQRT1_2, z = ZH - r * Math.SQRT1_2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 26, 12), std({ color: 0xe8c418, roughness: 0.45, emissive: 0x3a3004 }));
    pole.position.set(x, 13, z); root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0xf2d020, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    flag.position.set(x - sd * 0.8, 14, z); flag.rotation.y = sd * Math.PI / 4; root.add(flag);
  }

  // ── the membrane ──
  // The roof in plan is a rounded square (a superellipse) drawn round the
  // backs of the stands; the cushion rises from the ring beam on top of the
  // outer wall to the crown.
  const outer = TD_STANDS.outer[0][0].map(([x, z]) => ({ x, z: z + ZH }));
  const zMin = Math.min(...outer.map((p) => p.z)), zMax = Math.max(...outer.map((p) => p.z));
  const ZC = (zMin + zMax) / 2;
  const NE = 3.2;
  const norm = (x, z, a, b) => (Math.abs(x / a) ** NE + Math.abs((z - ZC) / b) ** NE) ** (1 / NE);
  let RA = Math.max(...outer.map((p) => Math.abs(p.x))) + 2, RB = (zMax - zMin) / 2 + 2;
  const over = Math.max(...outer.map((p) => norm(p.x, p.z, RA, RB)));
  if (over > 1) { RA *= over; RB *= over; }
  const YE = 46, APEX = 64;
  const rise = APEX - YE;
  const roofAt = (x, z) => YE + rise * (1 - Math.min(1, norm(x, z, RA, RB)) ** 2);
  const edge = (t, rho = 1) => {
    const c = Math.cos(t), sn = Math.sin(t);
    return { x: rho * RA * Math.sign(c) * Math.abs(c) ** (2 / NE), z: ZC + rho * RB * Math.sign(sn) * Math.abs(sn) ** (2 / NE) };
  };
  const membrane = membraneMaterial();
  membrane.side = THREE.DoubleSide;
  {
    const I = 160, J = 28;
    const pos = [], idx = [];
    for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) {
      const e = edge(i / I * Math.PI * 2, j / J);
      pos.push(e.x, roofAt(e.x, e.z), e.z);
    }
    for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) {
      const a = j * (I + 1) + i, b = a + 1, c = a + I + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, membrane));
  }
  // the ring beam the membrane is anchored to
  // what hangs from the cable net (as at the real building): a gondola at the
  // crown with the centre speaker cluster and the TV camera, 21 speaker
  // clusters round the edge of the membrane, and 14 banks of field lights
  const hang = [];
  const cable = (x, z, y0) => { const top = roofAt(x, z); const c = new THREE.CylinderGeometry(0.03, 0.03, top - y0, 4); c.translate(x, (top + y0) / 2, z); hang.push(c); };
  const gondola = new THREE.Group();
  const gy = APEX - 8;
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.8, 3.2, 24), std({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.4 }));
  pod.position.set(0, gy, ZC); gondola.add(pod);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const la = lineArray({ boxes: 4, width: 1.0, depth: 0.6, height: 0.36 });
    la.position.set(Math.sin(a) * 3.0, gy - 1.6, ZC + Math.cos(a) * 3.0); la.rotation.y = a; gondola.add(la);
  }
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.2), std({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.5 }));
  cam.position.set(0, gy - 3.4, ZC); gondola.add(cam);
  root.add(gondola);
  for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) cable(dx, ZC + dz, gy + 1.6);
  for (let i = 0; i < 21; i++) {
    const { x, z } = edge((i / 21) * Math.PI * 2 + 0.1, 0.8);
    const y = roofAt(x, z) - 6;
    const sp = lineArray({ boxes: 6, width: 1.1, depth: 0.62, height: 0.36 });
    sp.position.set(x, y, z); sp.rotation.y = Math.atan2(-x, ZC - z); root.add(sp);
    cable(x, z, y + 0.2);
  }
  const bankLamps = [];
  const bankM = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const bankFrames = [];
  for (let i = 0; i < 14; i++) {
    const { x, z } = edge((i / 14) * Math.PI * 2 + 0.22, 0.56);
    const y = roofAt(x, z) - 5;
    const yaw = Math.atan2(-x, ZC - z);
    const fr = new THREE.BoxGeometry(8, 0.3, 2.4); fr.rotateX(0.5); fr.rotateY(yaw); fr.translate(x, y, z); bankFrames.push(fr);
    for (let u = 0; u < 7; u++) for (let v = 0; v < 2; v++) {
      const lx = -3.3 + u * 1.1, lz = -0.55 + v * 1.1;
      const p = V3(lx, -0.2, lz).applyAxisAngle(V3(1, 0, 0), 0.5).applyAxisAngle(V3(0, 1, 0), yaw).add(V3(x, y, z));
      bankLamps.push(p);
    }
    cable(x - Math.cos(yaw) * 3, z + Math.sin(yaw) * 3, y);
    cable(x + Math.cos(yaw) * 3, z - Math.sin(yaw) * 3, y);
  }
  root.add(new THREE.Mesh(mergeGeometries(bankFrames), std({ color: 0x202024, roughness: 0.6, metalness: 0.4 })));
  const lampG = new THREE.CircleGeometry(0.4, 12);
  const lampI = new THREE.InstancedMesh(lampG, bankM, bankLamps.length);
  const lm4 = new THREE.Matrix4(), lq = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), V3(0, -1, 0));
  bankLamps.forEach((p, i) => { lm4.compose(p, lq, V3(1, 1, 1)); lampI.setMatrixAt(i, lm4); });
  root.add(lampI);
  root.add(new THREE.Mesh(mergeGeometries(hang), std({ color: 0x303036, roughness: 0.5, metalness: 0.6 })));
  // the outer wall, up to the ring beam
  {
    const I = 160, pos = [], idx = [];
    for (let i = 0; i <= I; i++) { const e = edge(i / I * Math.PI * 2); pos.push(e.x, 0, e.z, e.x, YE + 0.5, e.z); }
    for (let i = 0; i < I; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    root.add(new THREE.Mesh(g, std({ color: 0x0e0e12, roughness: 0.9, side: THREE.DoubleSide })));
    // and the floor out to it, under the stands
    const sh = new THREE.Shape(Array.from({ length: 96 }, (_, i) => { const e = edge(i / 96 * Math.PI * 2); return new THREE.Vector2(e.x, -e.z); }));
    const fg = new THREE.ShapeGeometry(sh, 1); fg.rotateX(-Math.PI / 2);
    root.add(new THREE.Mesh(fg, std({ color: 0x0c0c0e, roughness: 1 })));
  }

  // ── stage ──
  stageSet(root, { w: 38, h: 24, z: 3.6, deck: DECK, towerX: 20.4, backdropW: 50, backdropH: 23, wingX: 31, wingW: 12, wingH: 15 });
  const deck = stageDeck({ w: 62, d: 20, h: DECK, z: 12 });
  root.add(deck);
  const catwalk = stageDeck({ w: 4.4, d: 26, h: DECK - 0.8, z: 35, lip: false });
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 31.75, z: 22, h: DECK, dir: [0, -1] }));
  root.add(catwalk);
  const bstage = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.2, DECK - 0.8, 40), std({ color: 0x0a0a0c, roughness: 0.6 }));
  bstage.position.set(0, (DECK - 0.8) / 2, 51); root.add(bstage);
  const bRimM = glowMat(APP.accent, 1);
  const bRim = new THREE.Mesh(new THREE.TorusGeometry(6.05, 0.04, 6, 64), bRimM);
  bRim.rotation.x = Math.PI / 2; bRim.position.set(0, DECK - 0.8, 51); root.add(bRim);
  const scr = bigScreens(ctx, root, { w: 38, y: DECK + 1.6 + 38 / (16 / 9) / 2, z: 3.6, imagW: 17, imagX: 36, imagY: 19, imagZ: 7, imagYaw: 0.34, pitch: 0.0059 });
  // LED columns either side of the main wall
  for (const side of [-1, 1]) {
    const col = ledScreen({ w: 3.2, h: 18, tex: ctx.art.cover(), pitch: 0.012, bright: 1.2, kind: 'ribbon', frame: 0.1, light: false });
    col.position.set(side * 22.5, DECK + 9, 5); root.add(col);
    ctx.addScreen(col, 1, 'ribbon');
  }
  // an empty B-stage with its microphone, waiting
  const star = micStand({ height: 1.6 });
  star.position.set(0, DECK - 0.8, 51); root.add(star);
  for (let i = 0; i < 10; i++) { const w = wedge({ w: 0.8 }); w.position.set(-18 + i * 4, DECK, 21.6); w.rotation.y = Math.PI; root.add(w); }
  for (const side of [-1, 1]) for (const dz of [-2, 2]) { const sub = subStack({ count: 3, cols: 3, w: 1.4 }); sub.position.set(side * 14, 0, 24 + dz); root.add(sub); }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const z of [5, 13, 21]) { const t = truss(52, { size: 1.0, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-22, -8, 8, 22], RIG, z, APEX - 2)); }
  for (const side of [-1, 1]) {
    const main = lineArray({ boxes: 18, width: 1.4 }); main.position.set(side * 20, RIG - 0.8, 22); main.rotation.y = -side * 0.06; root.add(main);
    const out = lineArray({ boxes: 14, width: 1.3 }); out.position.set(side * 30, RIG - 1.2, 20); out.rotation.y = -side * 0.35; root.add(out);
    // delay towers on the field
    const mast = [];
    latticeInto(mast, V3(side * 34, 0, 58), V3(side * 34, 22, 58), 1.2, 0.05);
    root.add(new THREE.Mesh(mergeGeometries(mast), mats().black));
    const delay = lineArray({ boxes: 10, width: 1.2 }); delay.position.set(side * 34, 22, 57.2); delay.rotation.y = Math.PI - side * 0.1; root.add(delay);
  }
  const spots = [], beams = [], washes = [], ups = [], ring2 = [], lasers = [], bst = [];
  for (let i = 0; i < 14; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-24 + i * (48 / 13), RIG - 0.6, 21), length: 70, angle: 0.08 }), i, n: 14, group: 0 });
  for (let i = 0; i < 14; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-24 + i * (48 / 13), RIG - 0.6, 13), length: 90, beamGain: 1.2 }), i, n: 14, group: 1 });
  for (let i = 0; i < 10; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(-22 + i * (44 / 9), RIG - 0.6, 5), length: 35, beamGain: 0.4 }), i, n: 10, group: 2 });
  for (let i = 0; i < 12; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * (52 / 11), DECK + 0.3, 21.8), hang: 'up', length: 70 }), i, n: 12, group: 3 });
  // the ring: beams along the 2nd-floor front, pole to pole, pointing in
  {
    const edge = TD_STANDS.rim.map(([x, z]) => ({ x, z: z + ZH }));
    edge.sort((p, q2) => Math.atan2(p.x, p.z - ZH) - Math.atan2(q2.x, q2.z - ZH));
    const len = [0];
    for (let i = 1; i < edge.length; i++) len.push(len[i - 1] + Math.hypot(edge[i].x - edge[i - 1].x, edge[i].z - edge[i - 1].z));
    const N2 = 18;
    for (let i = 0, j = 0; i < N2; i++) {
      const want = (i + 0.5) / N2 * len[len.length - 1];
      while (j < len.length - 2 && len[j + 1] < want) j++;
      const t = (want - len[j]) / (len[j + 1] - len[j]);
      const pos = V3(lerp(edge[j].x, edge[j + 1].x, t), TD_STANDS.rimY - 1.6, lerp(edge[j].z, edge[j + 1].z, t));
      const a = Math.atan2(pos.x, pos.z - ZC);
      ring2.push({ fx: rig.add({ kind: 'beam', pos, hang: 'up', length: 110, beamGain: 0.9, flareGain: 0.6 }), i, n: N2, group: 4, a });
    }
  }
  for (let i = 0; i < 6; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-10 + i * 4, DECK + 0.3, 21.9), body: false, length: 150, beamGain: 7, flareGain: 0.2, noise: 0.4 }), i, n: 6 });
  const moverLights = [];
  for (const k of [3, 6, 9, 12]) moverLights.push(rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5 }), 14000));
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.14, penumbra: 0.7, size: q.shadowSize, far: 140, cast: q.shadows });
  front1.position.set(-8, 30, 72); front1.target.position.set(0, DECK + 1, 15);
  const follow = shadowSpot(KELVIN(5600), 0, { angle: 0.035, penumbra: 0.5, cast: false });
  follow.position.set(0, 36, 100); follow.target.position.set(0, DECK, 50);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, 4); stageWash.target.position.set(0, DECK, 16);
  for (const l of [front1, follow, stageWash]) root.add(l, l.target);
  const followBeam = rig.add({ kind: 'follow', pos: V3(0, 36, 100), length: 70, body: false, beamGain: 0.5, flareGain: 0.5, color: KELVIN(5600) });
  const fill = [];
  for (const [x, y, z] of [[-40, 30, 50], [40, 30, 50], [0, 40, 90]]) { const l = new THREE.PointLight(0xffffff, 0, 160, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  // the house lights are the field banks: aimed down at the field and the
  // stands, so the membrane above them only gets what bounces back up
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.22;
    const l = new THREE.SpotLight(KELVIN(5200), 0, 260, 1.05, 1, 2);
    const e = edge(a, 0.56), e2 = edge(a, 0.32);
    l.position.set(e.x, roofAt(e.x, e.z) - 8, e.z);
    l.target.position.set(e2.x, 0, e2.z);
    root.add(l, l.target); house.push(l);
  }
  root.add(new THREE.HemisphereLight(0x181a24, 0x050508, 0.35));

  // ── people ──
  // arena seats on the field in blocks, the crowd standing at them; every
  // sold seat in the stands taken
  const inPoly = (poly) => (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const inField = inPoly(fieldRing);
  const edgeDist = (x, z) => {
    let m = Infinity;
    for (let i = 0; i < fieldRing.length; i++) {
      const a = fieldRing[i], b = fieldRing[(i + 1) % fieldRing.length];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2);
      m = Math.min(m, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return m;
  };
  const onField = (x, z) => inField(x, z) && edgeDist(x, z) > 3;
  // the arena: lettered blocks A (at the stage) to F (at home plate), numbered
  // across, 13 seats wide and 15 rows deep, clipped to the field and cleared
  // for the runway, the B-stage, the delay towers and the desk
  const xs = [];
  for (let i = 0; i < 8; i++) { const x0 = 1.0 + i * 8.2; xs.unshift([-x0 - 7, -x0]); xs.push([x0, x0 + 7]); }
  const keep = (x, z) => onField(x, z)
    && !(Math.abs(x) < 3.4 && z < 49)
    && Math.hypot(x, z - 51) > 7.4
    && !(Math.abs(x - eye.x) < 5 && Math.abs(z - eye.z) < 4.5)
    && !(Math.abs(x) < 16 && z < 27)
    && Math.hypot(Math.abs(x) - 34, z - 58) > 1.6;
  const arena = floorBlocks(blockGrid([[25, 39], [41, 55], [57, 71], [73, 87], [89, 103], [105, 119]], xs), { keep, seed: 55 });
  root.add(floorChairs(arena.chairs));
  const fieldPeople = arena.people;
  bigCrowd(root, cu, q, fieldPeople.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.04 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.25;
  root.add(aisleField);
  root.add(lightPoints(fohPosition(pipe, root, eye, { riser: 1.0 }), cu, { maxPx: 4 }));

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  ctx.screenHaze(scr.main, offs.map(([dx, dy]) => hz.add(V3(dx * 19, scr.main.position.y + dy * scr.h * 0.5, 4.5), 0xffffff, 0)), offs);
  scr.main.userData.hazePower = 320;
  const hzWash = [hz.add(V3(-16, RIG - 1, 14), 0xffffff, 0), hz.add(V3(16, RIG - 1, 14), 0xffffff, 0), hz.add(V3(0, 22, 51), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 10, 6), fov: 60, near: 0.2, far: 800 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x07070b, 0.0026),
    hazeDensity: 0.0011, beamGain: 0.5, hazeAmb: new THREE.Color(0x05050a), hazeAmbDist: 260,
    bloom: { strength: 0.75, radius: 0.7, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.1, lift: [0.004, 0.004, 0.009] },
    env: { w: 236, h: 56, d: 236, eye, wall: 0x0c0c12, floor: 0x0a0a0c, emitters: [
      { w: 38, h: 21, pos: V3(0, 14.9, 4), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: 16 / 9 },
      { w: 200, h: 200, pos: V3(0, 55, 52), normal: V3(0, -1, 0), color: 0x202028, power: 1 },
    ] },
    envIntensity: 0.55,
    update(f) {
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 68), stage: STAGE, span: 60 });
      runShow(rig, beams, f, { house: V3(0, 22, 95), stage: STAGE, span: 80 });
      runShow(rig, washes, f, { house: V3(0, 0, 26), stage: STAGE, span: 30, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 40, 50), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      // the ring converges on the B-stage in the chorus, spreads to the roof otherwise
      const sec = f.sec || section(f.bar);
      ring2.forEach(({ fx, i, a }) => {
        const tgt = sec === 'chorus' ? V3(Math.sin(f.t * 0.8 + i) * 6, 26, 51 + Math.cos(f.t * 0.8 + i) * 6) : V3(Math.sin(a) * 30, 56, ZC + Math.cos(a) * 30);
        fx.dir.lerp(tgt.sub(fx.pos).normalize(), Math.min(1, f.dt * 2)).normalize();
        fx.color.copy(i % 2 ? f.pal.a : f.pal.c);
        fx.intensity = (sec === 'chorus' ? 0.9 + 0.4 * f.kick : sec === 'pre' ? 0.5 : 0.18) * show;
      });
      bankM.color.copy(KELVIN(5200)).multiplyScalar(0.02 + 2.2 * f.house);
      runLasers(lasers, f);
      rig.aim(followBeam, V3(star.position.x, DECK + 0.6, star.position.z)); followBeam.intensity = 1.2 * show;
      front1.intensity = 90000 * show + 9000 * f.house;
      follow.intensity = 50000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (12000 + 14000 * f.energy + 6000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (200 + 500 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 12000 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h) => { h.power = 600 * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      bRimM.color.setHex(APP.accent).multiplyScalar((0.6 + 0.9 * f.kick) * show + 0.2);
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      const sh = membrane.userData.shader;
      if (sh) sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.03, 0.03, 0.032).multiplyScalar(0.4 + 1.6 * f.house));
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 14, 10);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
    },
  };
}
