import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, clamp, lerp, ringTint, stageTex, std, withRepeat } from './core.js';
import { lightPoints } from './people.js';
import { chainInto, drumKit, hoists, latticeInto, ledScreen, mats, micStand, stageDeck, stageSteps, truss } from './rig.js';
import {
  bigCrowd, blockGrid, delayTower, flashOnCrowd, flashUnits, floorBlocks, floorChairs, fohPosition, groundRoof,
  maskingDrapes, packFloor, paHang, runBlinders, runShow, runStrobes, screenHang, section, subLine,
} from './show.js';

const CONCERT_LAYOUTS = {
  arena: {
    general: { code: 'AG1', deck: 2.1, runway: 1.45, gap: 3.4, thrustGap: 2.65, front: 23, back: 6, w: 39, rig: 23.5, wallZ: 9.15, wall: [37, 14.7, 4.6], tip: 48, reach: 67 },
    360: { code: 'AR1', deck: 1.55, gap: 3, rig: 24.8, wall: [18, 7.3, 12], reach: 62 },
  },
  dome: {
    general: { code: 'DG1', deck: 2.5, runway: 1.65, gap: 4.2, thrustGap: 3, front: 38, back: 16, w: 77, rig: 29.5, wallZ: 19.6, wall: [45, 18.4, 4.9], tip: 92, reach: 112 },
    360: { code: 'DR1', deck: 1.7, gap: 3.65, thrustGap: 3.1, rig: 34.5, wall: [27, 10.5, 17], reach: 120 },
  },
  stadium: {
    general: { code: 'SG2', deck: 2.9, runway: 1.85, gap: 4.7, thrustGap: 3.2, front: 36, back: 12, w: 84, rig: 36, wallZ: 14, wall: [75, 25, 4.9], tip: 86, reach: 150 },
    360: { code: 'SR3', deck: 1.85, gap: 3.9, thrustGap: 3.25, rig: 35.5, wall: [24, 9.6, 20], reach: 156 },
  },
};

const SHOW_AXES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const SHOW_DIAGONALS = SHOW_AXES.map((yaw) => yaw + Math.PI / 4);
const showXZ = (center, yaw, dist, across = 0, y = 0) =>
  V3(center.x + Math.sin(yaw) * dist + Math.cos(yaw) * across, y, center.z + Math.cos(yaw) * dist - Math.sin(yaw) * across);

export function concertRoom(ctx, id, room) {
  const { root, center, eye, stands, field } = room;
  const L = CONCERT_LAYOUTS[id][ctx.mode];
  const round = ctx.mode === '360';
  const arena = id === 'arena', dome = id === 'dome';
  center.y = L.deck;
  let floorBounds, onFloor, houseSources = room.houseSources || [], houseUpdate = room.houseUpdate;
  if (arena) {
    if (!round) {
      const xs = [-76, -31, -16, 16, 31, 76];
      for (let i = 1; i < xs.length; i++) {
        const a = xs[i - 1], b = xs[i];
        maskingDrapes(root, { a: [a, room.mask(a)], b: [b, room.mask(b)], top: room.H, bottomAt: stands.topAt });
      }
    }
    floorBounds = { x0: -29.2, x1: 29.2, z0: round ? 4 : L.front, z1: room.OZ + 39.5 };
    const offsets = [[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]];
    onFloor = (x, z) => Math.abs(x) < 29.2 && z >= 4 && z < floorBounds.z1 && offsets.every(([dx, dz]) => stands.topAt(x + dx, z + dz) < .05);
    houseUpdate = (f) => {
      room.updateInterior(f.house);
      room.house.forEach((lamp) => { lamp.intensity = 9200 * f.house; });
      room.houseFix.forEach((lamp) => { lamp.intensity = 1.35 * f.house; });
    };
  } else {
    const zMin = Math.min(...field.map((p) => p.z));
    const maxX = dome ? 75 : 54;
    floorBounds = { x0: -maxX, x1: maxX, z0: round ? zMin : L.front, z1: dome ? 123.6 : 131 };
    onFloor = (x, z) => showContains(field, x, z) && showEdgeDistance(field, x, z) > (dome ? 2.5 : 3.5);
    if (!dome) houseSources = [[-70, 20], [70, 20], [-70, 110], [70, 110], [0, -10], [0, 150]].map(([x, z]) => V3(x, room.roofY - 2, z));
  }
  const show = concertProduction(ctx, root, id, { center, eye, stands, floorBounds, onFloor, ceiling: room.H, houseSources, houseUpdate });
  return {
    root, eye, ...show, round, seatNear: stands.seatNear, seats: stands.seats,
    background: new THREE.Color(arena ? 0 : dome ? 0x050506 : 0x020306),
    fog: new THREE.FogExp2(arena ? 0x060508 : dome ? 0x07060a : 0x090708, arena ? .0037 : dome ? .0025 : .00165),
    hazeAmb: new THREE.Color(arena ? 0x040306 : dome ? 0x060507 : 0x060405),
    hazeAmbDist: arena ? 160 : dome ? 230 : 400,
    bloom: { strength: .63, radius: .65, threshold: 1.18 },
    grade: { exposure: arena ? 1.16 : 1.2, vignette: .29, ca: .003, grain: .025, sat: 1.04, lift: [.004, .005, .009] },
    envIntensity: arena ? .6 : dome ? .55 : .5,
  };
}

function showContains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function showEdgeDistance(ring, x, z) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1));
    d = Math.min(d, (x - a.x - u * dx) ** 2 + (z - a.z - u * dz) ** 2);
  }
  return Math.sqrt(d);
}

function showDeck(root, ring, h, gap, footprints, base = 0) {
  const contour = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.z)));
  const geo = new THREE.ExtrudeGeometry(contour, { depth: h - base, bevelEnabled: false, curveSegments: 1 });
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.44, uv.getY(i) / 2.44);
  geo.rotateX(Math.PI / 2); geo.translate(0, h, 0);
  const tex = stageTex();
  const mat = std({ ...withRepeat(tex, 1, 1), roughnessMap: null, roughness: 0.88, metalness: 0 });
  const mesh = new THREE.Mesh(geo, [mat, mats().fabric]);
  mesh.receiveShadow = true;
  root.add(mesh);
  const bounds = new THREE.Box3().setFromPoints(ring);
  footprints.push({ ring, gap, bounds });
  return mesh;
}

function showRamp(root, ring, fromH, toH, gap, footprints) {
  const mesh = showDeck(root, ring, fromH, gap, footprints);
  const { min, max } = footprints[footprints.length - 1].bounds;
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > .01) pos.setY(i, lerp(fromH, toH, (pos.getZ(i) - min.z) / (max.z - min.z)));
  }
  mesh.geometry.computeVertexNormals();
}

function showRect(center, yaw, from, to, half, offset = 0) {
  return [[from, -half], [from, half], [to, half], [to, -half]]
    .map(([dist, across]) => showXZ(center, yaw, dist, offset + across));
}

function showBeam(root, a, b, size = 0.8) {
  const span = b.clone().sub(a);
  const t = truss(span.length(), { size, finish: 'black' });
  t.position.copy(a).addScaledVector(span, 0.5);
  t.quaternion.setFromUnitVectors(V3(1), span.normalize());
  root.add(t);
}

function showScreen(ctx, root, screens, { x = 0, z, bottom, w, h, yaw = 0, double = false, bright = 1.65, light = false }) {
  const group = new THREE.Group();
  const rear = new THREE.Mesh(new THREE.BoxGeometry(w + .12, h + .12, .43), mats().paint);
  group.add(rear);
  group.position.set(x, bottom + h / 2, z);
  group.rotation.y = yaw;
  root.add(group);
  for (const dir of double ? [1, -1] : [1]) {
    const panel = ledScreen({ w, h, tex: ctx.art.texture(w / h), pitch: .005, bright, frame: 0, light, lightPower: 1.25 });
    panel.position.z = dir * .24;
    if (dir < 0) panel.rotation.y = Math.PI;
    group.add(panel);
    ctx.addScreen(panel, w / h, 'main');
    screens.push({ w, h, pos: group.position.clone(), normal: V3(Math.sin(yaw) * dir, 0, Math.cos(yaw) * dir) });
  }
  return group;
}

function showSubLine(root, pos, yaw, opts) {
  const group = new THREE.Group();
  subLine(group, { z: 0, ...opts });
  group.position.copy(pos);
  group.rotation.y = yaw;
  group.name = 'Subwoofers and front fill';
  root.add(group);
}

function showPA(root, config, name) {
  const array = paHang(root, name === 'Flown subwoofer array' ? { ...config, height: .53 } : config);
  array.name = name;
}

function showLEDs(root, runs) {
  const lightBars = Array.from({ length: 8 }, (_, i) => ({ parts: [], index: i, mat: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) }));
  for (const { a, b, size = 0.13, shift = 0 } of runs) {
    const d = b.clone().sub(a);
    const n = Math.max(1, Math.ceil(d.length() / 2.1));
    const rot = new THREE.Quaternion().setFromUnitVectors(V3(1), d.clone().normalize());
    const segment = d.length() / n;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.BoxGeometry(segment * .84, size, size);
      geo.applyMatrix4(new THREE.Matrix4().compose(a.clone().addScaledVector(d, (i + .5) / n), rot, V3(1, 1, 1)));
      lightBars[(i + shift) % lightBars.length].parts.push(geo);
    }
  }
  lightBars.forEach(({ parts, mat }) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.userData.noCollide = true;
    root.add(mesh);
  });
  return lightBars;
}

function concertProduction(ctx, root, room, { center, eye, stands, floorBounds, onFloor, ceiling, houseSources, houseUpdate }) {
  const round = ctx.mode === '360';
  const L = CONCERT_LAYOUTS[room][ctx.mode];
  const arena = room === 'arena', dome = room === 'dome';
  const { pipe, cu, q } = ctx;
  const production = new THREE.Group();
  production.name = L.code;
  root.add(production);
  const footprints = [], screens = [], delays = [], rails = [], washes = [], fixtureRows = [];
  const rig = ctx.rig({ finish: 'black' });
  const mainW = L.wall[0], mainH = L.wall[1], bottom = L.wall[2];
  const h = L.deck, rw = L.runway || h;
  const run = (yaw, a, b, half, gap = L.thrustGap || L.gap, across = 0, y = rw) =>
    showDeck(production, showRect(center, yaw, a, b, half, across), y, gap, footprints);

  const row = (a, b, count, kind, yaw, focus, { up = false, gain = 0.58, lift = 1 } = {}) => {
    const n = Math.max(2, (q.rig ?? 1) >= 1 ? count : Math.ceil(count * .6));
    const group = fixtureRows.length;
    const fixtures = Array.from({ length: n }, (_, i) => {
      const pos = a.clone().lerp(b, (i + .5) / n);
      const fx = rig.add({ kind, pos, hang: up ? 'up' : 'down', length: L.reach * (kind === 'wash' ? .53 : 1), beamGain: gain, flareGain: .32, scale: arena ? 1 : 1.23, dir: focus.clone().sub(pos) });
      return { fx, i, n, group };
    });
    const stage = focus.clone();
    const house = showXZ(center, yaw, L.reach * .55, 0, L.rig * .39);
    fixtureRows.push({ fixtures, options: { house, stage, up, lift, span: L.reach * .48, strobe: kind === 'beam' || kind === 'spot' } });
  };
  const bar = (a, b, size, shift) => rails.push({ a, b, size, shift });
  const lip = (fromX, toX, z, y, size, shift) => bar(V3(fromX, y - .09, z + .055), V3(toX, y - .09, z + .055), size, shift);
  const screen = (config) => showScreen(ctx, production, screens, config);
  const delay = (p, y, yaw, boxes) => {
    delays.push(p);
    const head = delayTower(production, { x: p.x, z: p.z, h: y, boxes, width: dome ? 1.3 : 1.5, yaw });
    row(head[0], head[head.length - 1], 4, 'beam', yaw, center, { gain: .45, lift: .76 });
  };

  let frontTarget = center;
  if (!round) {
    const front = L.front, back = L.back;
    run(0, back - center.z, front - center.z, L.w / 2, L.gap, 0, h);
    const r = L.w / 2;
    lip(-r + .8, r - .8, front, h, arena ? .09 : .14, 3);
    for (const side of [-1, 1]) production.add(stageSteps({ x: side * (L.w / 2 - 2.1), z: front + Math.ceil(h / .2) * .28, h, width: arena ? 1.4 : 2, dir: [0, -1] }));
    if (room === 'stadium') {
      const r = 24, half = 3.3, turn = L.tip - r - half;
      const arc = (rad) => Array.from({ length: 49 }, (_, i) => V3(rad * Math.cos(i * Math.PI / 48), 0, turn + rad * Math.sin(i * Math.PI / 48)));
      const outer = arc(r + half), inner = arc(r - half).reverse();
      showDeck(production, [...outer, ...inner], rw, L.thrustGap, footprints);
      // Brief raised spans along the straight arms connect the inside and
      // outside ground sections beneath the catwalk.
      for (const side of [-1, 1]) {
        const bridge = (a, b) => showRect(center, 0, a - center.z, b - center.z, half, side * r);
        showDeck(production, bridge(front, 41), rw, L.thrustGap, footprints);
        showRamp(production, bridge(41, 46), rw, 2.45, L.thrustGap, footprints);
        showDeck(production, bridge(46, 50), 2.45, L.thrustGap, footprints, 2.14);
        showRamp(production, bridge(50, 55), 2.45, rw, L.thrustGap, footprints);
        showDeck(production, bridge(55, turn), rw, L.thrustGap, footprints);
      }
      for (const r of [outer, inner]) for (let i = 1; i < r.length; i++) {
        if (i % 4 === 0 || i === 1 || i === r.length - 1) bar(r[i - 1].clone().setY(rw - .08), r[i].clone().setY(rw - .08), .105, i % 8);
      }
    } else {
      const cross = arena ? L.tip - 5.6 : 57, depth = 5.6;
      run(0, front - center.z, cross - center.z, arena ? 2.1 : 2.6);
      run(0, cross - center.z, cross + depth - center.z, arena ? 12.7 : 26);
      const wing = arena ? 12.7 : 26;
      for (const side of [-1, 1]) {
        lip(side * 2.75, side * (wing - .2), cross + depth, rw, .12, side < 0 ? 1 : 5);
        bar(V3(side * (wing + .05), rw - .09, cross + .15), V3(side * (wing + .05), rw - .09, cross + depth), .10, 4);
      }
      if (dome) {
        run(0, cross + depth - center.z, L.tip - 11 - center.z, 2.6);
        run(0, L.tip - 11 - center.z, L.tip - center.z, 6);
        lip(-5.9, 5.9, L.tip, rw, .12, 2);
      }
    }
    if (room === 'stadium') {
      for (const x of [-24, 24]) production.add(stageSteps({ x, z: front + Math.ceil((h - rw) / .2) * .28, h, y0: rw, width: 3, dir: [0, -1] }));
    } else {
      const n = Math.ceil((h - rw) / .2);
      production.add(stageSteps({ x: 0, z: front + n * .28, h, y0: rw, width: arena ? 2 : 2.7, dir: [0, -1] }));
    }

    screen({ z: L.wallZ, bottom, w: mainW, h: mainH, bright: arena ? 1.65 : 1.85, light: true });
    const wings = arena ? { x: 26.6, z: 14.1, bottom: 9.3, w: 12, h: 9.2, yaw: .26 }
      : dome ? { x: 32.2, z: L.wallZ + 1.5, bottom: 5.2, w: 14.3, h: 14.5, yaw: .07 } : null;
    if (wings) for (const side of [-1, 1]) {
      screen({ ...wings, x: side * wings.x, yaw: side * wings.yaw });
      screenHang(production, { x: side * wings.x, y: wings.bottom + wings.h, z: wings.z, w: wings.w, yaw: side * wings.yaw, topY: arena ? ceiling : L.rig - .5, size: .48, n: 3 });
    }
    screenHang(production, { y: bottom + mainH, z: L.wallZ, w: mainW, topY: arena ? ceiling : L.rig - .4, size: .7, n: arena ? 5 : 7 });
    const trussZ = [L.wallZ - .4, lerp(back, front, .61), front - .8];
    const roofTx = dome ? r + 1.1 : r - 1.25;
    if (!arena) {
      groundRoof(production, { tx: roofTx, zs: trussZ, top: L.rig });
      maskingDrapes(production, { a: [-r - 2, trussZ[0] - .75], b: [r + 2, trussZ[0] - .75], top: L.rig, bottomAt: () => 0 });
    }
    const fy = L.rig - (arena ? .35 : 2);
    trussZ.forEach((z, i) => {
      showBeam(production, V3(-r, fy, z), V3(r, fy, z), .7);
      production.add(hoists([-r + 2, -r * .36, r * .36, r - 2], fy, z, arena ? ceiling : L.rig - .45));
      row(V3(-r + 1, fy - .35, z), V3(r - 1, fy - .35, z), (arena ? 10 : 14) + i * 2, ['wash', 'beam', 'spot'][i], 0, center);
      bar(V3(-r + .8, fy - .25, z + .38), V3(r - .8, fy - .25, z + .38), arena ? .09 : .14, i * 2);
    });
    row(V3(-r + 2, fy - .36, front + .16), V3(r - 2, fy - .36, front + .16), arena ? 8 : 12, 'par', 0, center, { gain: .12, lift: .72 });
    for (const side of [-1, 1]) {
      const x = side * (r + (arena ? .9 : 3.6)), z = front - .8;
      if (!arena) {
        showBeam(production, V3(side * roofTx, L.rig, z), V3(side * (r + 8.4), L.rig, z), 1.15);
        bar(V3(side * (roofTx + .82), 3, z + .65), V3(side * (roofTx + .82), L.rig - 1, z + .65), .19, side > 0 ? 2 : 0);
      }
      showPA(production, { x, y: L.rig - 1.6, z, boxes: arena ? 16 : 21, width: arena ? 1.23 : 1.57, yaw: side * .12, roofY: arena ? ceiling : L.rig - .2 }, 'Main line array');
      showPA(production, { x: side * (r + (arena ? .2 : 1.8)), y: L.rig - 2.4, z: z - 2.3, boxes: arena ? 7 : 10, depth: 1.04, roofY: arena ? ceiling : L.rig, splay: .006 }, 'Flown subwoofer array');
      showPA(production, { x: x + side * (arena ? 9.9 : 3.1), y: L.rig - 1.8, z, boxes: arena ? 13 : 16, width: 1.2, yaw: side * .86, roofY: arena ? ceiling : L.rig }, 'Side fill');
      if (arena) showPA(production, { x: side * 15, y: 24, z: 63, boxes: 9, width: 1.05, yaw: side * .09, roofY: ceiling }, 'Rear delay hang');
      else delay(V3(side * (dome ? 25 : 27), 0, dome ? 103 : 105), dome ? 21 : 29, side * .1, dome ? 14 : 18);
      const lipX = side * (arena ? 2.14 : dome ? 2.65 : 27.35);
      if (room === 'stadium') {
        for (const [a, b, ya, yb] of [[front, 41, rw, rw], [41, 46, rw, 2.45], [46, 50, 2.45, 2.45], [50, 55, 2.45, rw], [55, L.tip - 27.3, rw, rw]]) {
          bar(V3(lipX, ya - .08, a), V3(lipX, yb - .08, b), .1, side > 0 ? 3 : 1);
        }
      } else bar(V3(lipX, rw - .08, front + .16), V3(lipX, rw - .08, arena ? L.tip - 5.6 : 57), .1, side > 0 ? 3 : 1);
    }
    const fill = { xs: [-.85, -.64, -.41, -.18, .18, .41, .64, .85].map((e) => e * r), y: h, z: -1.35 };
    if (room === 'stadium') {
      for (const [x0, x1] of [[-r + 2.8, -28.4], [-19.6, 19.6], [28.4, r - 2.8]]) {
        showSubLine(production, V3(0, 0, front + 1.05), 0, { x0, x1, pitch: 1.65, count: 2, fills: { ...fill, xs: fill.xs.filter((x) => x >= x0 && x <= x1) } });
      }
    } else showSubLine(production, V3(0, 0, front + 1.05), 0, { x0: -r + 2.8, x1: r - 2.8, gap: 4, pitch: arena ? 1.8 : 1.65, count: 2, fills: fill });
    row(V3(-r + 3, h + .12, front - .8), V3(r - 3, h + .12, front - .8), arena ? 8 : 14, 'beam', 0, center, { up: true, gain: .46 });
    frontTarget = V3(0, rw + .55, L.tip - 2.4);
  } else if (arena) {
    run(0, -22, 22, 6.15);
    const dz = 24, tx = 11.25, top = L.rig;
    for (const side of [-1, 1]) {
      const x = side * tx;
      bar(V3(side * 6.2, h - .08, center.z - 22), V3(side * 6.2, h - .08, center.z + 22), .095, side > 0 ? 2 : 5);
      showBeam(production, V3(x, top, center.z - dz), V3(x, top, center.z + dz), .75);
      row(V3(x, top - .46, center.z - dz + 2), V3(x, top - .46, center.z + dz - 2), 15, 'beam', side * Math.PI / 2, center);
      bar(V3(x + side * .4, top - .25, center.z - dz), V3(x + side * .4, top - .25, center.z + dz), .10, side > 0 ? 3 : 0);
      for (const z of [-dz, -15, 0, 15, dz]) production.add(hoists([x], top, center.z + z, ceiling));
      for (const z of [-13, 13]) {
        showPA(production, { x: x + side * .4, y: top - .85, z: center.z + z, boxes: 13, yaw: side * Math.PI / 2, roofY: top }, 'Long-side line array');
        showPA(production, { x: x - side * .4, y: top - 1.4, z: center.z + z - 1.6, boxes: 6, width: 1.0, depth: 1.0, yaw: side * Math.PI / 2, splay: .006, roofY: top }, 'Flown subwoofer array');
      }
    }
    for (const dist of [-dz, -17.8, -3.2, 3.2, 17.8, dz]) {
      const z = center.z + dist;
      showBeam(production, V3(-tx, top, z), V3(tx, top, z), .65);
      if (Math.abs(dist) !== dz) continue;
      row(V3(-tx, top - .45, z), V3(tx, top - .45, z), 8, 'spot', dist < 0 ? Math.PI : 0, center);
      for (const side of [-1, 1]) showPA(production, { x: side * 6.8, y: top - 1, z, boxes: 11, width: 1.1, yaw: dist < 0 ? Math.PI : 0, roofY: top }, 'End line array');
    }
    const bw = 10, centerGap = 10.45;
    for (const s of [-1, 1]) {
      const z = center.z + s * centerGap;
      const box = new THREE.Mesh(new THREE.BoxGeometry(bw, mainH, mainW), mats().paint);
      box.position.set(0, bottom + mainH / 2, z);
      production.add(box);
      for (const x of [-bw / 2 - .06, bw / 2 + .06]) screen({ x, z, bottom, w: mainW, h: mainH, yaw: Math.sign(x) * Math.PI / 2 });
      screen({ z: z + s * (mainW / 2 + .06), bottom, w: bw, h: mainH, yaw: s < 0 ? Math.PI : 0 });
      const chains = [];
      for (const x of [-4.35, 4.35]) for (const dz of [-7.25, 7.25]) chainInto(chains, x, bottom + mainH, z + dz, top - .22);
      production.add(new THREE.Mesh(mergeGeometries(chains), mats().chain));
    }
    for (const yaw of SHOW_AXES) {
      const long = Math.abs(Math.sin(yaw)) > .5;
      showSubLine(production, showXZ(center, yaw, long ? 6.85 : 22.8), yaw, { x0: long ? -17.5 : -4.5, x1: long ? 17.5 : 4.5, pitch: 2.2, count: long ? 2 : 1, fills: { xs: long ? [-15, -8, 0, 8, 15] : [-4, 0, 4], y: h, z: -.95 } });
    }
    for (const s of [-1, 1]) production.add(stageSteps({ x: -2.4, z: center.z + s * (22 + Math.ceil(h / .2) * .28), h, dir: [0, -s] }));
  } else {
    const yawArms = dome ? SHOW_AXES : SHOW_DIAGONALS;
    const outer = dome ? 15.7 : 15;
    const core = SHOW_AXES.flatMap((yaw) => [yaw + Math.PI / 8, yaw + Math.PI * 3 / 8]).map((yaw) => showXZ(center, yaw, outer));
    showDeck(production, core, h, L.gap, footprints);
    const join = outer * Math.cos(Math.PI / 8);
    for (const [i, yaw] of yawArms.entries()) {
      const tip = dome ? (i % 2 ? 34 : 40) : 36.8;
      run(yaw, join, tip, dome ? 3.15 : 3.5);
      if (!dome) run(yaw, tip - .15, tip + 4, 5.15, L.thrustGap, 0, h + .075);
      for (const side of [-1, 1]) bar(showXZ(center, yaw, join + .7, side * (dome ? 3.2 : 3.56), h - .12), showXZ(center, yaw, tip - .5, side * (dome ? 3.2 : 3.56), h - .12), .1, i * 2);
      const end = tip + (dome ? .05 : 4.05), half = dome ? 3.08 : 5.08;
      bar(showXZ(center, yaw, end, -half, h - .07), showXZ(center, yaw, end, half, h - .07), .12, i * 2 + 3);
    }
    const steel = [], chains = [];
    const lead = dome ? 2.8 : 3.4;
    for (const [i, yaw] of SHOW_DIAGONALS.entries()) {
      const mast = dome ? showXZ(center, yaw, 21.7) : showXZ(center, yaw, 21.2, 5.25);
      if (dome) {
        // Equipment shoulders carry the longer screen's pick points while
        // leaving the four main runways as continuous performer paths.
        run(yaw, join, 24.4, 2.55, L.gap, 0, h);
      } else run(yaw, 17.2, 25.2, 2.4, L.gap, 5.35, h - .12);
      const yBase = dome ? h : h - .12;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(2.1, .28, 2.1), mats().cab);
      shoe.position.copy(mast).y = yBase + .14; production.add(shoe);
      latticeInto(steel, mast.clone().setY(yBase + .12), mast.clone().setY(L.rig), dome ? 1.5 : 1.7, .078);
      const joinRoof = showXZ(center, yaw, 21.2, 0, L.rig);
      const roofTip = showXZ(center, yaw, lead + mainW + .9, 0, L.rig);
      showBeam(production, center.clone().setY(L.rig), roofTip, dome ? 1.25 : 1.5);
      if (!dome) showBeam(production, mast.clone().setY(L.rig), joinRoof, 1.0);
      latticeInto(steel, mast.clone().setY(L.rig - 5.7), roofTip, .57, .045);
      const xScreen = showXZ(center, yaw, lead + mainW / 2);
      screen({ x: xScreen.x, z: xScreen.z, bottom, w: mainW, h: mainH, yaw: yaw - Math.PI / 2, double: true, bright: 1.83 });
      for (const d of [lead + 2.3, lead + mainW - 2.3]) {
        const pick = showXZ(center, yaw, d);
        chainInto(chains, pick.x, bottom + mainH, pick.z, L.rig - .5, { motor: false });
      }
      const edge = mast.clone().addScaledVector(showXZ(V3(), yaw, 0, .83), 1);
      bar(edge.clone().setY(h + 1.5), edge.clone().setY(L.rig - .9), dome ? .145 : .17, i * 2);
      const neg = mast.clone().addScaledVector(showXZ(V3(), yaw, 0, -.83), 1);
      bar(neg.clone().setY(h + 1.5), neg.clone().setY(L.rig - .9), .15, i * 2 + 3);
      row(showXZ(center, yaw, 4.4, .82, L.rig - .7), showXZ(center, yaw, lead + mainW - 1, .82, L.rig - .7), dome ? 8 : 10, 'beam', yaw + .6, center);
      row(showXZ(center, yaw, 4.4, -.82, L.rig - .7), showXZ(center, yaw, lead + mainW - 1, -.82, L.rig - .7), dome ? 6 : 8, 'spot', yaw - .6, center);
      for (const side of [-1, 1]) {
        const pa = mast.clone().add(showXZ(V3(), yaw, .3, side * 1.7));
        showBeam(production, mast.clone().setY(L.rig - .45), pa.clone().setY(L.rig - .45), .6);
        showPA(production, { x: pa.x, z: pa.z, y: L.rig - 1.7, boxes: dome ? 15 : 18, width: dome ? 1.3 : 1.5, yaw: yaw + side * .53, roofY: L.rig - .5 }, side > 0 ? 'Main sector array' : 'Side sector array');
      }
      const sub = mast.clone().add(showXZ(V3(), yaw, -1.4));
      showPA(production, { x: sub.x, z: sub.z, y: L.rig - 3.0, boxes: dome ? 6 : 8, width: 1.18, depth: 1.05, yaw, roofY: L.rig - 1.1, splay: .008 }, 'Flown subwoofer array');
      const ySub = dome ? yaw : yaw + Math.PI / 4;
      const p = showXZ(center, ySub, dome ? outer - .25 : outer - .4);
      showSubLine(production, p, ySub, { x0: -6.9, x1: 6.9, pitch: 1.7, gap: dome ? 0 : 2, count: 2, fills: { xs: [-5.5, -2.2, 2.2, 5.5], y: h, z: -2 } });
      const zSide = Math.sign(Math.cos(yaw));
      const d = V3(Math.sign(Math.sin(yaw)) * (dome ? (zSide > 0 ? 23 : 32) : 37), 0, center.z + zSide * (dome ? 37 : 46));
      if (onFloor(d.x, d.z)) delay(d, dome ? (zSide > 0 ? 23 : 19) : 28, Math.atan2(d.x, d.z - center.z), dome ? 13 : 17);
    }
    production.add(new THREE.Mesh(mergeGeometries(steel), mats().trussBlack), new THREE.Mesh(mergeGeometries(chains), mats().chain));
  }

  // Low edge fills and independent soft key coverage keep the deck legible
  // when a cue uses the taller LED wall or sends the beams into the stands.
  const facing = round ? SHOW_AXES : [-.82, .82];
  for (const yaw of facing) {
    const pos = showXZ(center, yaw, arena ? 16 : 24, 0, arena ? 18.5 : L.rig - 3.7);
    const key = new THREE.SpotLight(KELVIN(4400), 0, L.reach, .49, .85, 2);
    key.position.copy(pos);
    key.target.position.copy(center).y = h;
    key.userData.offWhenDark = 'show';
    production.add(key, key.target);
    washes.push(key);
  }
  if (!round) for (const side of [-1, 1]) {
    const key = new THREE.SpotLight(KELVIN(4600), 0, L.reach, arena ? .28 : .34, .8, 2);
    key.position.set(side * (arena ? 12 : 24), arena ? 24 : L.rig - 6, L.tip + (arena ? 13 : 14));
    key.target.position.copy(frontTarget);
    key.userData.offWhenDark = 'show';
    production.add(key, key.target);
    washes.push(key);
  }
  const mic = micStand({});
  mic.position.copy(center).y = h;
  production.add(mic);
  const kit = drumKit({ shell: 0x20232b });
  kit.position.copy(center).add(V3(0, h + .25, round ? -3.7 : -2.7));
  const riser = stageDeck({ w: 4.5, d: 2.6, h: .25, z: kit.position.z, lip: false });
  riser.position.y = h;
  production.add(riser, kit);
  const cueLeds = showLEDs(production, rails);

  // Distance from the stage, its speaker line and the delay tower bases.
  const clearStage = (x, z, pad = 0) => !footprints.some(({ ring, gap, bounds }) => {
    const d = gap + pad;
    return x >= bounds.min.x - d && x <= bounds.max.x + d && z >= bounds.min.z - d && z <= bounds.max.z + d &&
      (showContains(ring, x, z) || showEdgeDistance(ring, x, z) <= d);
  });
  const keep = (x, z) => onFloor(x, z) && (!dome || onFloor(-x, z)) && (round || z > L.front) && clearStage(x, z, .18) &&
    !delays.some((p) => Math.abs(x - p.x) < 4.65 && Math.abs(z - p.z) < 4.65) &&
    (Math.abs(x - eye.x) > 4.9 || Math.abs(z - eye.z) > 4.45);

  const { x0, x1, z0, z1 } = floorBounds;
  let ground;
  if (room === 'stadium') {
    ground = packFloor({ ...floorBounds, spacing: .64, inside: keep, seed: 177, trim: { cols: 4, rows: 4 } });
  } else {
    const xs = arena ? [[x0, -14.9], [-13.5, -1], [1, 13.5], [14.9, x1]] : [];
    const zs = [];
    if (dome) for (let x = .7, limit = Math.min(-x0, x1); x < limit; x += 9.3) {
      const end = Math.min(x + 8, limit);
      xs.push([-end, -x], [x, end]);
    }
    for (let z = z0; z < z1; z += 13) zs.push([z, Math.min(z + 11.4, z1)]);
    const floor = floorBlocks(blockGrid(zs, xs), { keep, seed: arena ? 31 : 55, trim: { cols: 6, rows: 4 } });
    if (round) for (const chair of floor.chairs) chair.turn = Math.atan2(-chair.x, center.z - chair.z);
    root.add(floorChairs(floor.chairs));
    ground = floor.people;
  }
  for (const p of ground) {
    // The chair jitter and person mesh must also respect the pit gap.
    p.turn = Math.atan2(-p.x, center.z - p.z);
  }
  bigCrowd(root, cu, q, ground.concat(stands.people.map((p) => ({ ...p, h: .97 }))), { seed: 21, round: round ? center : null });
  const aisle = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: .04 })), cu, { maxPx: 3 });
  aisle.material.uniforms.uGain.value = .25;
  root.add(aisle, lightPoints(fohPosition(pipe, root, eye, { riser: eye.y - 1.6 }), cu, { maxPx: 4 }));

  const entry = new THREE.HemisphereLight(0xaaaabf, 0x23232a, .32);
  root.add(entry);
  const house = houseSources.map((pos) => {
    const lamp = new THREE.SpotLight(KELVIN(5000), 0, L.reach * 2.1, 1.12, .65, 2);
    lamp.position.copy(pos);
    lamp.target.position.set(pos.x * .73, 0, lerp(center.z, pos.z, .65));
    lamp.userData.offWhenDark = 'house';
    root.add(lamp, lamp.target);
    return lamp;
  });
  const focus = center.clone().setY(round ? Math.max(8, bottom * .73) : (bottom + mainH * .55) * .66);
  const flashPositions = round ? (arena ? SHOW_AXES : SHOW_DIAGONALS) : [-.48, -.16, .16, .48];
  const units = flashPositions.map((yaw, i) => ({
    pos: round ? showXZ(center, yaw, arena ? (i % 2 ? 11.25 : 24) : 12, 0, L.rig - 1.15)
      : V3((i / 3 - .5) * L.w * .82, L.rig - (arena ? .98 : 2.65), L.front - .6),
    dir: showXZ(V3(), yaw, 1, 0, -.32),
    mount: L.rig - (round ? 0 : arena ? .35 : 2),
  }));
  const blinders = flashUnits(rig, production, units);
  const strobes = flashUnits(rig, production, units.map((u) => ({ ...u, pos: u.pos.clone().addScaledVector(u.dir, .15).add(V3(.7, .2, 0)) })), { kind: 'strobe' });
  return {
    stageTarget: focus, camera: { pos: eye, target: focus, fov: arena ? 56 : 59, near: .16, far: room === 'stadium' ? 1800 : 700 },
    hazeDensity: arena ? .00125 : dome ? .00085 : .00043, beamGain: arena ? .55 : .62,
    env: { w: room === 'stadium' ? 300 : dome ? 235 : 138, h: ceiling || 58, d: room === 'stadium' ? 320 : dome ? 236 : 126, eye, wall: 0x0a0a10, floor: 0x0a0a0c, emitters: screens.slice(0, round ? 8 : 3).map(({ w, h, pos, normal }) => ({ w, h, pos, normal, screen: true, power: 1.4, aspect: w / h })) },
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      const sec = f.sec || section(f.bar);
      const high = sec === 'chorus', quiet = sec === 'break';
      const energy = clamp(f.energy);
      for (const { fixtures, options } of fixtureRows) runShow(rig, fixtures, f, options);
      const bl = runBlinders(blinders, f);
      const st = runStrobes(strobes, f);
      for (const { mat, index } of cueLeds) {
        const chase = Math.pow(.5 + .5 * Math.cos(index / 8 * Math.PI * 2 - f.t * (high ? 7 : 2.2)), 2);
        const k = quiet ? .13 : high ? .35 + .61 * chase + .37 * f.kick : .21 + .33 * chase + .20 * f.snare;
        ringTint(mat.color, index < 4 ? f.pal.a : f.pal.b).multiplyScalar(.035 + k * show);
      }
      const keyPower = arena ? 13500 : dome ? 32500 : 43500;
      washes.forEach((l, i) => {
        l.color.copy(KELVIN(4600)).lerp(i % 2 ? f.pal.b : f.pal.a, high ? .37 : .18);
        l.intensity = keyPower * (quiet ? .82 : 1 + .32 * energy) * show;
      });
      house.forEach((l) => { l.intensity = (arena ? 12500 : 34500) * f.house; });
      entry.intensity = .26 + .86 * f.house;
      houseUpdate?.({ ...f, sec });
      cu.uStage.value.copy(center).y = round ? 10 : 13;
      ringTint(cu.uRimColor.value, f.pal.a).multiplyScalar((.15 + .24 * f.kick) * show);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(.019 * show + .24 * f.house);
      flashOnCrowd(cu.uWash.value, bl, st);
      cu.uAmb.value.setRGB(.005, .005, .009).multiplyScalar(1 + f.house * 10);
    },
  };
}
