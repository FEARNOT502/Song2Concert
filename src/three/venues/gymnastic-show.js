import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, ringTint, std } from '../core.js';
import { ampStack, drumKit, keyboardRig, latticeInto, ledScreen, mats, micStand, stageDeck, stageSteps, wedge } from '../rig.js';
import { bigCrowd, floorChairs, fohPosition, maskingDrapes, packFloor, paHang, runShow, screenHang, subLine } from '../show.js';
import { GYM_CENTER_R, GYM_FLOOR_R, GYM_FOH, GYM_PA, GYM_RAD, GYM_STANDING, gymPoint, gymRing, gymStagePlan } from '../gymnastic-arena-plan.js';
import { gymMask, gymOpenSeat, gymStands } from './gymnastic-seats.js';

function beamGrid(root, segments, y) {
  const parts = [];
  for (const [a, b, size] of segments) latticeInto(parts, V3(a[0], y, a[1]), V3(b[0], y, b[1]), size, .045);
  root.add(new THREE.Mesh(mergeGeometries(parts), mats().trussBlack));
  parts.forEach((g) => g.dispose());
}

function circleDeck(root, r, h, y, color) {
  const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72), [
    std({ color, roughness: .72, metalness: .08 }),
    std({ color: 0x272d36, roughness: .75 }),
    std({ color: 0x16181b, roughness: .75 }),
  ]);
  d.position.y = y + h / 2;
  d.receiveShadow = true;
  root.add(d);
}

function addScreen(ctx, root, x, y, z, yaw, w, h, light = true) {
  const kind = 'main';
  const aspect = w / h;
  const screen = ledScreen({ w, h, tex: ctx.art.texture(aspect), pitch: .004, kind,
    bright: 1.60, light, lightPower: .9 });
  screen.position.set(x, y, z);
  screen.rotation.y = yaw;
  root.add(screen);
  ctx.addScreen(screen, aspect, kind);
  return screen;
}

function barrier(root, points, gate = false) {
  const pieces = [];
  for (let i = 1; i < points.length; i++) {
    const [[x0, z0], [x1, z1]] = [points[i - 1], points[i]];
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = -Math.atan2(z1 - z0, x1 - x0);
    const n = Math.ceil(len / 1.65);
    for (const [height, width] of [[.13, .10], [1.05, .055]]) {
      const piece = new THREE.BoxGeometry(len, width, width);
      piece.rotateY(yaw);
      piece.translate((x0 + x1) / 2, height, (z0 + z1) / 2);
      pieces.push(piece);
    }
    for (let j = 0; j <= n; j++) {
      if (j === 0 && i > 1) continue;
      const at = j / n, x = x0 + (x1 - x0) * at, z = z0 + (z1 - z0) * at;
      const post = new THREE.BoxGeometry(.043, 1.02, .045);
      post.translate(x, .55, z);
      pieces.push(post);
    }
    if (!gate) continue;
    const panel = new THREE.BoxGeometry(len, .48, .025);
    panel.rotateY(yaw);
    panel.translate((x0 + x1) / 2, .44, (z0 + z1) / 2);
    pieces.push(panel);
  }
  if (pieces.length) {
    root.add(new THREE.Mesh(mergeGeometries(pieces), std({ color: 0x575a5d, roughness: .8, metalness: .33 })));
    pieces.forEach((g) => g.dispose());
  }
}

function generalProduction(ctx, root, plan) {
  const { L, decks, steps } = plan;
  for (const d of decks) {
    const [[x0, z0], , [x1, z1]] = d.ring;
    root.add(stageDeck({ w: x1 - x0, d: z1 - z0, h: d.h, z: (z0 + z1) / 2 }));
  }
  for (const s of steps) root.add(stageSteps(s));
  const [w, h] = L.wall;
  addScreen(ctx, root, 0, L.deck + .34 + h / 2, L.wallZ, 0, w, h);
  screenHang(root, { w, x: 0, y: L.deck + .34 + h, z: L.wallZ, topY: L.rig, n: 6, size: .43 });
  const rows = [-22.6, -17.75, -12.6, -2.5, 8.5];
  beamGrid(root, rows.map((z, i) => [[i < 3 ? -21 : -10, z], [i < 3 ? 21 : 10, z], i < 3 ? .59 : .42]), L.rig);
  const curtain = [[-59, gymMask(-59)], [-19, gymMask(-19)], [19, gymMask(19)], [59, gymMask(59)]];
  for (let i = 1; i < curtain.length; i++) {
    maskingDrapes(root, { a: curtain[i - 1], b: curtain[i], top: 17.5, matte: true,
      bottomAt: (x, z) => {
        const r = Math.hypot(x, z);
        return r >= 44.4 ? Math.min(10.6, 4.85 + (r - 44.4) * .42) : r >= 33 ? Math.min(4.76, 2.6 + (r - 33) * .22) : 0;
      } });
  }
  subLine(root, V3(0, 0, L.front + .72), 0, { x0: -17.9, x1: 17.9, gap: 3.2, pitch: 1.45 });
  for (const s of [-1, 1]) {
    const a = ampStack({ w: .72, h: .58, d: .46 });
    a.position.set(s * 12.1, L.deck, -20.5);
    root.add(a);
    barrier(root, [[s * 18, -9.6], [s * 4.0, -9.6], [s * 4.0, L.tip + 1.45]], true);
  }
  barrier(root, [[-4, L.tip + 1.45], [4, L.tip + 1.45]], true);
  return rows.flatMap((z, i) => {
    const count = i < 3 ? 12 : 6;
    return Array.from({ length: count }, (_, k) => ({ x: (k / (count - 1) - .5) * (i < 3 ? 38 : 18), z, top: L.rig - .62, group: i }));
  });
}

function roundProduction(ctx, root, plan) {
  const { L } = plan;
  circleDeck(root, GYM_CENTER_R, L.deck, 0, 0xd0d5da);
  circleDeck(root, 2.28, .69, L.deck, 0xd4dee5);
  const drums = drumKit({ shell: 0x263341 });
  drums.position.y = L.deck + .69;
  root.add(drums);
  const shields = std({ color: 0x9dbed8, transparent: true, opacity: .18, roughness: .14, side: THREE.DoubleSide, depthWrite: false });
  for (const deg of [220, 245, 270, 295, 320]) {
    const [x, z] = gymPoint(deg, 1.85);
    const acrylic = new THREE.Mesh(new THREE.BoxGeometry(.72, 1.32, .018), shields);
    acrylic.position.set(x, L.deck + 1.35, z);
    acrylic.rotation.y = -deg * GYM_RAD;
    acrylic.userData.noCollide = true;
    root.add(acrylic);
  }
  for (const [i, deg] of [61, 186, 303].entries()) {
    const [x, z] = gymPoint(deg, 4.9), angle = Math.PI - deg * GYM_RAD;
    const instrument = i === 1 ? keyboardRig() : micStand();
    instrument.position.set(x, L.deck, z);
    instrument.rotation.y = angle;
    root.add(instrument);
    const monitor = wedge();
    monitor.position.set(x * 1.14, L.deck, z * 1.14);
    monitor.rotation.y = angle + Math.PI;
    root.add(monitor);
  }
  for (const deg of [36, 216]) {
    const [x, z] = gymPoint(deg, GYM_CENTER_R + 2.31);
    const [dx, dz] = gymPoint(deg, 1);
    root.add(stageSteps({ x, z, h: L.deck, dir: [-dx, -dz], width: 1.25 }));
  }
  const xs = [-14.5, -7.3, 0, 7.3, 14.5];
  beamGrid(root, xs.flatMap((x) => [[[x, -14.5], [x, 14.5], .6], [[-14.5, x], [14.5, x], .6]]), L.rig);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const side of [-1, 1]) {
      const x = 14.75 * Math.sin(yaw) + side * 6.95 * Math.cos(yaw);
      const z = 14.75 * Math.cos(yaw) - side * 6.95 * Math.sin(yaw);
      addScreen(ctx, root, x, 16.95, z, yaw, 12.8, 6.25, side === -1);
      const lower = addScreen(ctx, root, x * .70, 12.35, z * .70, yaw, 6.5, 3.55, false);
      const [ix, iz] = [Math.sin(yaw), Math.cos(yaw)];
      addScreen(ctx, root, lower.position.x - ix * .22, 12.35, lower.position.z - iz * .22,
        yaw + Math.PI, 6.5, 3.55, false);
    }
  }
  for (const [a, b] of GYM_STANDING) {
    const inner = gymRing(a + 2.1, b - 2.1, GYM_CENTER_R + 2.3);
    const outer = gymRing(a + 2.1, b - 2.1, GYM_FLOOR_R - 2.0);
    barrier(root, [...inner, ...outer.reverse(), inner[0]], true);
  }
  return xs.flatMap((x, i) => xs.map((z, j) => ({ x, z, top: L.rig - .61, group: i + j })));
}

function audience(ctx, root, round, floor, mode) {
  if (!round) root.add(floorChairs(floor.positions, { color: 0x2a2d32 }));
  if (!ctx.q.crowd) return;
  const seated = gymStands().filter((seat, i) => i % 2 === 0 && gymOpenSeat(seat, mode)).map((s) => ({
    x: s.x, y: s.y, z: s.z, seat: true, turn: s.yaw, full: false,
  }));
  const occupants = round ? packFloor({
    x0: -32, z0: -32, x1: 32, z1: 32, spacing: .78, seed: 38,
    inside: (x, z) => {
      const r = Math.hypot(x, z);
      if (r > GYM_FLOOR_R - 2.2 || r < GYM_CENTER_R + 2.65) return false;
      const angle = (Math.atan2(x, -z) / GYM_RAD + 360) % 360;
      return GYM_STANDING.some(([a, b]) => angle > a + 2.5 && angle < b - 2.5);
    },
  }) : floor.people;
  bigCrowd(root, ctx.cu, ctx.q, [...seated, ...occupants], { seed: 49, round: round ? V3() : null });
}

export function buildGymnasticShow(ctx, root, eye, floor) {
  const mode = ctx.mode;
  const plan = gymStagePlan(mode);
  const { L, round } = plan;
  const production = new THREE.Group();
  production.name = round ? 'Round concert production' : 'End stage production';
  production.userData.plan = 'stage';
  root.add(production);
  const stageTarget = V3(0, L.deck + (round ? .95 : 2.0), round ? 0 : -17.0);
  const points = round ? roundProduction(ctx, production, plan) : generalProduction(ctx, production, plan);
  for (const [i, { x, z, top, yaw }] of GYM_PA[mode].entries()) {
    paHang(production, { x, z, y: top, yaw, boxes: i < 2 || round ? 10 : 7,
      width: .93, height: .34, splay: .032, roofY: round ? 25.6 : L.rig });
  }

  const foh = new THREE.Group();
  const [fx, fy, fz] = GYM_FOH[mode];
  foh.position.set(fx, round ? fy - .42 : 0, fz);
  foh.rotation.y = round ? Math.PI : 0;
  fohPosition(ctx.pipe, foh, V3(), { riser: round ? .42 : fy });
  root.add(foh);

  audience(ctx, root, round, floor, mode);
  const rig = ctx.rig({ finish: 'black', restrainFlares: true });
  const fixtures = points.map(({ x, top, z, group }, i) => {
    const pos = V3(x, top, z);
    const fx = rig.add({ kind: i % 3 === 0 ? 'wash' : i % 3 === 1 ? 'beam' : 'spot', pos,
      dir: stageTarget.clone().sub(pos), length: 77, beamGain: .60, scale: .77 });
    return { fx, i, n: points.length, group };
  });
  const up = [];
  for (let i = 0; i < 14; i++) {
    const [x, z] = round ? gymPoint(i * 360 / 14, GYM_CENTER_R - .43) : [1.28 * (i - 6.5), L.front - .35];
    up.push({ fx: rig.add({ kind: 'beam', pos: V3(x, L.deck + .26, z), hang: 'up',
      length: 74, beamGain: .6, scale: .63 }), i, n: 14, group: 0 });
  }

  const ambient = new THREE.HemisphereLight(0xd8e4f5, 0x77706a, 1.8);
  const house = [];
  const keys = [];
  root.add(ambient);
  for (let i = 0; i < 8; i++) {
    const [x, z] = gymPoint(i * 45, 34);
    const l = new THREE.PointLight(0xfff0de, 210, 83, 2);
    l.position.set(x, 24, z);
    root.add(l);
    house.push(l);
    if (i % 2) {
      const [sx, sz] = gymPoint(i * 45, round ? 13.2 : 11.5);
      const key = new THREE.SpotLight(0xcfe2ff, 500, 65, .44, .76, 1.8);
      key.position.set(sx, 13, sz + (round ? 0 : -13.5));
      key.target.position.copy(stageTarget).y = L.deck + .5;
      root.add(key, key.target);
      keys.push(key);
    }
  }

  return {
    stageTarget,
    camera: { pos: eye, target: stageTarget, fov: 58, near: .12, far: 265 },
    update(f) {
      const show = 1 - f.house;
      const options = { house: V3(0, 2, round ? 0 : 18), stage: stageTarget, span: 31 };
      runShow(rig, fixtures, f, options);
      runShow(rig, up, f, { ...options, up: true, lift: .84 });
      ambient.intensity = .105 + 1.02 * f.house;
      house.forEach((l) => { l.intensity = 210 * f.house; });
      keys.forEach((l, i) => {
        l.intensity = (620 + 520 * f.energy) * show;
        l.color.copy(KELVIN(5700)).lerp(i % 2 ? f.pal.a : f.pal.b, .38);
      });
      ctx.cu.uStage.value.set(0, 12, round ? 0 : -9);
      ringTint(ctx.cu.uRimColor.value, f.pal.a).multiplyScalar(.36 * show);
      ctx.cu.uWash.value.copy(f.pal.b).multiplyScalar(.025 * show + .25 * f.house);
      ctx.cu.uAmb.value.setRGB(.007, .007, .011).multiplyScalar(1 + f.house * 10);
    },
  };
}
