import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, clamp, deckGridTex, lerp, ringTint, std, withRepeat } from './core.js';
import { lightPoints } from './people.js';
import { chainInto, hoists, latticeInto, ledScreen, mats, stageSteps, truss } from './rig.js';
import {
  bigCrowd, blockGrid, delayTower, flashOnCrowd, flashUnits, floorBlocks, floorChairs, fohPosition, groundRoof,
  maskingDrapes, packFloor, paHang, runBlinders, runShow, runStrobes, screenHang, section, subLine,
} from './show.js';
import { AXES as SHOW_AXES, CONCERT_LAYOUTS, DIAGONALS as SHOW_DIAGONALS, stagePlan } from './stage-plan.js';

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

// The deck's finish: black touring panels with their joints a white grid
// (deckGridTex: 1.22 m), a faint satin sheen; the sides black cloth.
function deckMaterials() {
  const top = std({ ...withRepeat(deckGridTex(), 1, 1), color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: .55 });
  // (the skirts black velour: dead matte, so the front keys aimed at the
  // runway's end do not light its face up grey)
  const skirt = std({ color: 0x020202, roughness: 1, envMapIntensity: .15 });
  return [top, skirt];
}

function showDeck(root, ring, h, gap, footprints, mat, base = 0) {
  const contour = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.z)));
  const geo = new THREE.ExtrudeGeometry(contour, { depth: h - base, bevelEnabled: false, curveSegments: 1 });
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.44, uv.getY(i) / 2.44);
  geo.rotateX(Math.PI / 2); geo.translate(0, h, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  root.add(mesh);
  const bounds = new THREE.Box3().setFromPoints(ring);
  footprints.push({ ring, gap, bounds });
  return mesh;
}

function showRamp(root, ring, fromH, toH, gap, footprints, mat) {
  const mesh = showDeck(root, ring, fromH, gap, footprints, mat);
  const { min, max } = footprints[footprints.length - 1].bounds;
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > .01) pos.setY(i, lerp(fromH, toH, (pos.getZ(i) - min.z) / (max.z - min.z)));
  }
  mesh.geometry.computeVertexNormals();
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
  group.name = 'LED screen';
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
  subLine(group, { z: 0, count: 3, dark: true, ...opts });
  group.position.copy(pos);
  group.rotation.y = yaw;
  group.name = 'Subwoofers and front fill';
  root.add(group);
}

function showPA(root, config, name) {
  const array = paHang(root, name.includes('subwoofer') ? { ...config, height: .53 } : config);
  array.name = name;
  return array;
}

// ── LED strips ──
// Every run is one unbroken bar (no gaps between pieces); its vertices carry
// how far along their run they are (metres), so the shader can lay a
// gradient along the deck's edge and move it.
const LED_SIZE = .12;
function ledGeometry(runs) {
  const parts = [];
  for (const { a, b, size = LED_SIZE, t0 = 0 } of runs) {
    const d = b.clone().sub(a), len = d.length();
    if (len < .05) continue;
    const geo = new THREE.BoxGeometry(len + size, size, size);
    const pos = geo.attributes.position;
    const along = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) along[i] = t0 + pos.getX(i) + len / 2;
    geo.setAttribute('aT', new THREE.BufferAttribute(along, 1));
    geo.applyMatrix4(new THREE.Matrix4().compose(a.clone().addScaledVector(d, .5), new THREE.Quaternion().setFromUnitVectors(V3(1), d.normalize()), V3(1, 1, 1)));
    parts.push(geo);
  }
  return parts.length ? mergeGeometries(parts) : null;
}

// Runs round a deck's outline, just under its lip and a hair proud of its
// face. Where another deck as high carries on past an edge, that edge's run
// lies inside it and is not seen: what shows is one line round the whole set.
function deckEdgeRuns(ring, yAt, out, t = 0) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a.x * b.z - b.x * a.z; }
  const s = area > 0 ? 1 : -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < .05) continue;
    const nx = s * dz / len * .06, nz = -s * dx / len * .06;
    out.push({ a: V3(a.x + nx, yAt(a) - .09, a.z + nz), b: V3(b.x + nx, yAt(b) - .09, b.z + nz), t0: t });
    t += len;
  }
  return t;
}

function ledStrips(root, runs) {
  const geo = ledGeometry(runs);
  const U = {
    uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() },
    uPhase: { value: 0 }, uClock: { value: 0 }, uFlow: { value: 0 }, uChase: { value: 0 }, uLevel: { value: .04 }, uMix: { value: 0 },
  };
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float aT;\nvarying float vT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vT = aT;');
    sh.fragmentShader = 'uniform vec3 uA, uB, uC;\nuniform float uPhase, uClock, uFlow, uChase, uLevel, uMix;\nvarying float vT;\n' +
      sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', /* glsl */`
        // three palette colours round a loop, laid along the strip and moving
        float p = fract(vT * 0.035 - uPhase) * 3.0;
        vec3 grad = p < 1.0 ? mix(uA, uB, smoothstep(0.0, 1.0, p))
                  : p < 2.0 ? mix(uB, uC, smoothstep(0.0, 1.0, p - 1.0))
                  : mix(uC, uA, smoothstep(0.0, 1.0, p - 2.0));
        vec3 solid = mix(uA, uB, uMix);
        float ch = 0.5 + 0.5 * cos(vT * 0.21 - uClock * 6.5);
        vec3 led = mix(solid, grad, uFlow) * uLevel * mix(1.0, 0.25 + 1.2 * ch * ch, uChase);
        vec4 diffuseColor = vec4(led, opacity);`);
  };
  mat.customProgramCacheKey = () => 'concert-led-strip';
  if (geo) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.noCollide = true;
    mesh.name = 'LED strips';
    root.add(mesh);
  }
  // the looks by the song's part: verse one colour fading to the next, the
  // build a slow flow, the chorus the palette running round with a chase,
  // the break nearly out; eased between, so a change of part glides
  const now = { flow: 0, speed: .03, chase: 0, level: .1 };
  const _a = new THREE.Color(), _b = new THREE.Color(), _c = new THREE.Color();
  return (f, sec, show) => {
    const high = sec === 'chorus', quiet = sec === 'break', pre = sec === 'pre';
    const want = quiet ? { flow: 0, speed: .02, chase: 0, level: .09 + .03 * Math.sin(f.t * 1.3) }
      : high ? { flow: 1, speed: .16, chase: .75, level: .62 + .45 * f.kick }
        : pre ? { flow: 1, speed: .055, chase: .2, level: .34 + .2 * clamp(f.energy) + .15 * f.kick }
          : { flow: 0, speed: .03, chase: 0, level: .3 + .14 * f.kick };
    const k = Math.min(1, (f.dt || .016) * 2.5);
    for (const key of ['flow', 'speed', 'chase']) now[key] += (want[key] - now[key]) * k;
    now.level += (want.level - now.level) * Math.min(1, (f.dt || .016) * 8);
    U.uA.value.copy(ringTint(_a, f.pal.a));
    U.uB.value.copy(ringTint(_b, f.pal.b));
    U.uC.value.copy(ringTint(_c, f.pal.c || f.pal.a));
    // (the gradient's phase accumulates, so a change of speed does not jump it)
    U.uPhase.value = (U.uPhase.value + (f.dt || .016) * now.speed) % 1;
    U.uClock.value = f.t % 1000;
    U.uFlow.value = now.flow;
    U.uChase.value = now.chase;
    U.uMix.value = .5 + .5 * Math.sin(f.t * .35);
    U.uLevel.value = .035 + now.level * show;
  };
}

function concertProduction(ctx, root, room, { center, eye, stands, floorBounds, onFloor, ceiling, houseSources, houseUpdate }) {
  const round = ctx.mode === '360';
  const plan = stagePlan(room, ctx.mode, center.z);
  const L = plan.L;
  const arena = room === 'arena', dome = room === 'dome', stadium = room === 'stadium';
  const { pipe, cu, q } = ctx;
  const production = new THREE.Group();
  production.name = L.code;
  root.add(production);
  const footprints = [], screens = [], delays = [], rails = [], washes = [], fixtureRows = [];
  const rig = ctx.rig({ finish: 'black' });
  const mainW = L.wall[0], mainH = L.wall[1], bottom = L.wall[2];
  const h = L.deck, rw = L.runway || h;
  const P = ([x, z], y = 0) => V3(x, y, z);

  // ── the decks, their stairs, and the LED strip round them ──
  const deckMat = deckMaterials();
  let ledT = 0;
  for (const d of plan.decks) {
    const ring = d.ring.map((p) => P(p));
    if (d.ramp) showRamp(production, ring, d.ramp[0], d.ramp[1], d.gap, footprints, deckMat);
    else showDeck(production, ring, d.h, d.gap, footprints, deckMat, d.base);
    const { min, max } = footprints[footprints.length - 1].bounds;
    const yAt = d.ramp ? (p) => lerp(d.ramp[0], d.ramp[1], (p.z - min.z) / (max.z - min.z)) : () => d.h;
    ledT = deckEdgeRuns(ring, yAt, rails, ledT) + 10;
  }
  for (const s of plan.steps) {
    production.add(stageSteps(s));
    const ring = s.ring.map((p) => P(p));
    footprints.push({ ring, gap: .9, bounds: new THREE.Box3().setFromPoints(ring) });
  }
  const bar = (a, b, size = LED_SIZE) => { rails.push({ a, b, size, t0: ledT }); ledT += a.distanceTo(b) + 10; };

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
  const screen = (config) => showScreen(ctx, production, screens, config);
  // a delay tower: a roofed mast with a pair of arrays under its roof
  const delay = (p, y, yaw, boxes) => {
    delays.push(p);
    const head = delayTower(production, { x: p.x, z: p.z, h: y, boxes, width: dome ? 1.3 : 1.5, yaw });
    row(head[0], head[head.length - 1], 4, 'beam', yaw, center, { gain: .45, lift: .76 });
  };

  let frontTarget = center;
  if (!round) {
    const front = L.front, back = L.back, r = L.w / 2;
    screen({ z: L.wallZ, bottom, w: mainW, h: mainH, bright: arena ? 1.65 : 1.85, light: true });
    // the arena's IMAG columns are portrait (3:4): the sleeve over its title
    const wings = arena ? { x: 26.6, z: 14.1, bottom: 7.6, w: 8.4, h: 11.2, yaw: .26 }
      : dome ? { x: 32.2, z: L.wallZ + 1.5, bottom: 5.2, w: 14.3, h: 14.5, yaw: .07 } : null;
    if (wings) for (const side of [-1, 1]) {
      screen({ ...wings, x: side * wings.x, yaw: side * wings.yaw });
      screenHang(production, { x: side * wings.x, y: wings.bottom + wings.h, z: wings.z, w: wings.w, yaw: side * wings.yaw, topY: arena ? ceiling : L.rig - .5, size: .48, n: 3 });
    }
    screenHang(production, { y: bottom + mainH, z: L.wallZ, w: mainW, topY: arena ? ceiling : L.rig - .4, size: .7, n: arena ? 5 : 7 });
    const trussZ = [L.wallZ - .4, lerp(back, front, .61), front - .8];
    const roofTx = dome ? r + 1.1 : r - 1.25;
    // the outriggers off the roof's front corners carry the PA past the deck's ends
    const outX = r + (arena ? 0 : 13.2);
    if (!arena) {
      groundRoof(production, { tx: roofTx, zs: trussZ, top: L.rig });
      maskingDrapes(production, { a: [-r - 2, trussZ[0] - .75], b: [r + 2, trussZ[0] - .75], top: L.rig, bottomAt: () => 0 });
    }
    const fy = L.rig - (arena ? .35 : 2);
    trussZ.forEach((z, i) => {
      showBeam(production, V3(-r, fy, z), V3(r, fy, z), .7);
      production.add(hoists([-r + 2, -r * .36, r * .36, r - 2], fy, z, arena ? ceiling : L.rig - .45));
      row(V3(-r + 1, fy - .35, z), V3(r - 1, fy - .35, z), (arena ? 10 : 14) + i * 2, ['wash', 'beam', 'spot'][i], 0, center);
      bar(V3(-r + .8, fy - .25, z + .38), V3(r - .8, fy - .25, z + .38), arena ? .09 : .14);
    });
    row(V3(-r + 2, fy - .36, front + .16), V3(r - 2, fy - .36, front + .16), arena ? 8 : 12, 'par', 0, center, { gain: .12, lift: .72 });
    for (const side of [-1, 1]) {
      const z = front - .8;
      // (the arena's hangs clear of the downstage truss's end; the open-air
      // rooms' on the outrigger, past the roof's corner tower)
      const x = side * (r + (arena ? 1.7 : 3.6));
      if (!arena) {
        showBeam(production, V3(side * roofTx, L.rig, z), V3(side * outX, L.rig, z), 1.15);
        // the corner tower's LED: up its face to the house
        bar(V3(side * roofTx, 3, z + 1.0), V3(side * roofTx, L.rig - 1, z + 1.0), .19);
      }
      const hangTop = arena ? ceiling : L.rig - .2;
      showPA(production, { x, y: L.rig - 1.6, z, boxes: arena ? 16 : 21, width: arena ? 1.23 : 1.57, yaw: side * .12, roofY: hangTop }, 'Main line array');
      // (the flown subs behind the mains: the arena's from the ceiling, the
      // others' under the roof's side beam)
      showPA(production, { x: arena ? x : side * (roofTx + .65), y: L.rig - 2.4, z: z - 2.6, boxes: arena ? 8 : 12, depth: 1.04, roofY: arena ? ceiling : L.rig, splay: .006 }, 'Flown subwoofer array');
      showPA(production, { x: x + side * (arena ? 4.2 : 3.4), y: L.rig - 1.8, z: z - .4, boxes: arena ? 13 : 16, width: 1.2, yaw: side * .7, roofY: arena ? ceiling : L.rig }, 'Side fill');
      showPA(production, { x: x + side * (arena ? 8.4 : 7.4), y: L.rig - 1.9, z: z - 1, boxes: arena ? 10 : 13, width: 1.1, yaw: side * 1.2, roofY: arena ? ceiling : L.rig }, 'Outfill (270)');
      if (arena) {
        showPA(production, { x: side * 15, y: 24, z: 63, boxes: 9, width: 1.05, yaw: side * .09, roofY: ceiling }, 'Rear delay hang');
        showPA(production, { x: side * 24.5, y: 23.4, z: 44, boxes: 8, width: 1.05, yaw: side * .42, roofY: ceiling }, 'Side delay hang');
      } else {
        // (the dome's, on the infield, raised to reach the upper stands)
        delay(V3(side * (dome ? 25 : 27), 0, dome ? 103 : 105), dome ? 26 : 29, side * .1, dome ? 12 : 14);
      }
    }
    const fill = { xs: [-.85, -.64, -.41, -.18, .18, .41, .64, .85].map((e) => e * r), y: h, z: -1.35 };
    if (stadium) {
      for (const [x0, x1] of [[-r + 2.8, -28.4], [-19.6, 19.6], [28.4, r - 2.8]]) {
        showSubLine(production, V3(0, 0, front + 1.05), 0, { x0, x1, pitch: 1.65, fills: { ...fill, xs: fill.xs.filter((x) => x >= x0 && x <= x1) } });
      }
    } else showSubLine(production, V3(0, 0, front + 1.05), 0, { x0: -r + 2.8, x1: r - 2.8, gap: arena ? 3.6 : 4, pitch: arena ? 1.8 : 1.65, fills: fill });
    row(V3(-r + 3, h + .12, front - .8), V3(r - 3, h + .12, front - .8), arena ? 8 : 14, 'beam', 0, center, { up: true, gain: .46 });
    frontTarget = V3(0, rw + .55, L.tip - 2.4);
  } else if (arena) {
    const dz = 24, tx = 11.25, top = L.rig;
    for (const side of [-1, 1]) {
      const x = side * tx;
      showBeam(production, V3(x, top, center.z - dz), V3(x, top, center.z + dz), .75);
      row(V3(x, top - .46, center.z - dz + 2), V3(x, top - .46, center.z + dz - 2), 15, 'beam', side * Math.PI / 2, center);
      bar(V3(x + side * .4, top - .25, center.z - dz), V3(x + side * .4, top - .25, center.z + dz), .10);
      for (const z of [-dz, -15, 0, 15, dz]) production.add(hoists([x], top, center.z + z, ceiling));
      for (const z of [-13, 13]) {
        showPA(production, { x: x + side * .4, y: top - .85, z: center.z + z, boxes: 14, yaw: side * Math.PI / 2, roofY: top }, 'Long-side line array');
        showPA(production, { x: x - side * .4, y: top - 1.4, z: center.z + z - 1.6, boxes: 7, width: 1.0, depth: 1.0, yaw: side * Math.PI / 2, splay: .006, roofY: top }, 'Flown subwoofer array');
      }
      // the corners, off the truss ends to the ceiling: the diagonals
      for (const s of [-1, 1]) showPA(production, { x: side * (tx + 2.2), y: top - .9, z: center.z + s * (dz + 1.6), boxes: 10, width: 1.05, yaw: Math.atan2(side, s), roofY: ceiling }, 'Corner line array');
    }
    for (const dist of [-dz, -17.8, -3.2, 3.2, 17.8, dz]) {
      const z = center.z + dist;
      showBeam(production, V3(-tx, top, z), V3(tx, top, z), .65);
      if (Math.abs(dist) !== dz) continue;
      row(V3(-tx, top - .45, z), V3(tx, top - .45, z), 8, 'spot', dist < 0 ? Math.PI : 0, center);
      for (const side of [-1, 1]) showPA(production, { x: side * 6.8, y: top - 1, z, boxes: 12, width: 1.1, yaw: dist < 0 ? Math.PI : 0, roofY: top }, 'End line array');
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
      showSubLine(production, showXZ(center, yaw, long ? 6.85 : 22.8), yaw, { x0: long ? -17.5 : -4.5, x1: long ? 17.5 : 4.5, pitch: 2.2, count: long ? 3 : 2, fills: { xs: long ? [-15, -8, 0, 8, 15] : [-4, 0, 4], y: h, z: -.95 } });
    }
  } else {
    // The round stage's roof stands on masts out among the crowd, clear of
    // the screens and the PA: the dome's one on each diagonal, 28 m out; the
    // stadium's a pair at each runway's end, either side of its platform.
    // Girders from the middle out to them carry the screens (a fin down each
    // diagonal); beams between the masts close the roof's square, and the
    // PA hangs off it facing out, clear of both.
    const top = L.rig;
    const steel = [], chains = [];
    const lead = dome ? 2.8 : 3.4;
    const mastSize = dome ? 1.5 : 1.7;
    const mastRad = dome ? L.mast : 38.8;
    for (const m of plan.masts) {
      const p = P(m);
      latticeInto(steel, p, p.clone().setY(top + .6), mastSize, .078);
      const half = mastSize / 2 + .5;
      const ring = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([a, b]) => V3(p.x + a, 0, p.z + b));
      footprints.push({ ring, gap: 1, bounds: new THREE.Box3().setFromPoints(ring) });
      // two LED bars up its audience-side face
      const out = V3(p.x - center.x, 0, p.z - center.z).normalize();
      const side = V3(out.z, 0, -out.x);
      for (const s of [-1, 1]) {
        const at = p.clone().addScaledVector(out, mastSize / 2 + .1).addScaledVector(side, s * (mastSize / 2 - .18));
        bar(at.clone().setY(.4), at.clone().setY(top - .9), dome ? .145 : .17);
      }
    }
    // the perimeter: mast to mast round the square
    const corners = dome ? SHOW_DIAGONALS.map((yaw) => showXZ(center, yaw, mastRad, 0, top))
      : SHOW_DIAGONALS.flatMap((yaw) => [showXZ(center, yaw, mastRad, -6.3, top), showXZ(center, yaw, mastRad, 6.3, top)]);
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i], b = corners[(i + 1) % corners.length];
      showBeam(production, a, b, dome ? 1.0 : 1.2);
    }
    for (const [i, yaw] of SHOW_DIAGONALS.entries()) {
      // the girder out along the diagonal, to the mast (and on past it a little for the subs)
      const girderEnd = showXZ(center, yaw, mastRad + (dome ? 2.2 : 0), 0, top);
      showBeam(production, center.clone().setY(top), girderEnd, dome ? 1.25 : 1.5);
      if (dome) {
        // knee braces from the mast up under the girder
        latticeInto(steel, showXZ(center, yaw, mastRad, 0, top - 4.5), showXZ(center, yaw, mastRad - 4.5, 0, top - .6), .5, .035);
      }
      // the screen: a double-faced fin under the girder
      const xScreen = showXZ(center, yaw, lead + mainW / 2);
      screen({ x: xScreen.x, z: xScreen.z, bottom, w: mainW, h: mainH, yaw: yaw - Math.PI / 2, double: true, bright: 1.83 });
      for (const d of [lead + 2.3, lead + mainW - 2.3]) {
        const pick = showXZ(center, yaw, d);
        chainInto(chains, pick.x, bottom + mainH, pick.z, top - .5, { motor: false });
      }
      row(showXZ(center, yaw, 4.4, .82, top - .7), showXZ(center, yaw, mastRad - 3, .82, top - .7), dome ? 9 : 12, 'beam', yaw + .6, center);
      row(showXZ(center, yaw, 4.4, -.82, top - .7), showXZ(center, yaw, mastRad - 3, -.82, top - .7), dome ? 7 : 9, 'spot', yaw - .6, center);
      // the main hangs: a pair at the girder's end, splayed out to either side
      if (dome) {
        showBeam(production, showXZ(center, yaw, mastRad + .6, -3.1, top - .45), showXZ(center, yaw, mastRad + .6, 3.1, top - .45), .6);
        for (const s of [-1, 1]) showPA(production, { ...xz(showXZ(center, yaw, mastRad + .6, s * 2.4)), y: top - 1.7, boxes: 14, width: 1.3, yaw: yaw + s * .5, roofY: top - .75 }, s > 0 ? 'Main sector array' : 'Side sector array');
        showPA(production, { ...xz(showXZ(center, yaw, mastRad + 1.8)), y: top - 2.6, boxes: 7, width: 1.18, depth: 1.05, yaw, roofY: top - .6, splay: .008 }, 'Flown subwoofer array');
      } else {
        for (const s of [-1, 1]) showPA(production, { ...xz(showXZ(center, yaw, mastRad + .3, s * 3.2)), y: top - 1.7, boxes: 16, width: 1.5, yaw: yaw + s * .3, roofY: top - .6 }, s > 0 ? 'Main sector array' : 'Side sector array');
        showPA(production, { ...xz(showXZ(center, yaw, mastRad - 1.7)), y: top - 2.6, boxes: 8, width: 1.18, depth: 1.05, yaw, roofY: top - .75, splay: .008 }, 'Flown subwoofer array');
      }
      // the ground subs and front fills round the centre
      const ySub = dome ? yaw : yaw + Math.PI / 4;
      const p = showXZ(center, ySub, dome ? 15.7 - .25 : 15 - .4);
      showSubLine(production, p, ySub, { x0: -6.9, x1: 6.9, pitch: 1.7, gap: dome ? 0 : 2, fills: { xs: [-5.5, -2.2, 2.2, 5.5], y: h, z: -2 } });
      const zSide = Math.sign(Math.cos(yaw));
      const d = V3(Math.sign(Math.sin(yaw)) * (dome ? (zSide > 0 ? 23 : 32) : 37), 0, center.z + zSide * (dome ? 37 : 46));
      // (the dome's infield pair raised to reach the upper stands)
      if (onFloor(d.x, d.z)) delay(d, dome ? (zSide > 0 ? 28 : 19) : 28, Math.atan2(d.x, d.z - center.z), dome ? 12 : 14);
    }
    // the sides: an array off the middle of each perimeter beam, down the axis
    for (const yaw of SHOW_AXES) {
      const rad = dome ? mastRad * Math.SQRT1_2 : (mastRad + 6.3) * Math.SQRT1_2;
      showPA(production, { ...xz(showXZ(center, yaw, rad + .2)), y: top - 1.5, boxes: dome ? 13 : 16, width: dome ? 1.25 : 1.4, yaw, roofY: top - .55 }, 'Side line array');
      showPA(production, { ...xz(showXZ(center, yaw, rad + .2, 2.2)), y: top - 2.4, boxes: 6, width: 1.18, depth: 1.05, yaw, roofY: top - .55, splay: .008 }, 'Flown subwoofer array');
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
  const runLeds = ledStrips(production, rails);

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
  if (stadium) {
    ground = packFloor({ ...floorBounds, spacing: .64, inside: keep, seed: 177, trim: { cols: 4, rows: 4 } });
  } else {
    const xs = arena ? [[x0, -14.9], [-13.5, -1], [1, 13.5], [14.9, x1]] : [];
    const zs = [];
    if (dome) {
      // (the end stage's columns start beside the runway, so the ground either
      // side of it, from the deck's front to the end stage, is seated too)
      const limit = Math.min(-x0, x1);
      for (let x = round ? .7 : 2.6 + L.thrustGap + .2; x < limit; x += 9.3) {
        const end = Math.min(x + 8, limit);
        xs.push([-end, -x], [x, end]);
      }
    }
    const start = dome && !round ? L.front + L.gap + .2 : z0;
    for (let z = start; z < z1; z += dome ? 10.4 : 13) zs.push([z, Math.min(z + (dome ? 9.2 : 11.4), z1)]);
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
    stageTarget: focus, camera: { pos: eye, target: focus, fov: arena ? 56 : 59, near: .16, far: stadium ? 1800 : 700 },
    hazeDensity: arena ? .00125 : dome ? .00085 : .00043, beamGain: arena ? .55 : .62,
    env: { w: stadium ? 300 : dome ? 235 : 138, h: ceiling || 58, d: stadium ? 320 : dome ? 236 : 126, eye, wall: 0x0a0a10, floor: 0x0a0a0c, emitters: screens.slice(0, round ? 8 : 3).map(({ w, h, pos, normal }) => ({ w, h, pos, normal, screen: true, power: 1.4, aspect: w / h })) },
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      const sec = f.sec || section(f.bar);
      const high = sec === 'chorus', quiet = sec === 'break';
      const energy = clamp(f.energy);
      for (const { fixtures, options } of fixtureRows) runShow(rig, fixtures, f, options);
      const bl = runBlinders(blinders, f);
      const st = runStrobes(strobes, f);
      runLeds(f, sec, show);
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

const xz = (p) => ({ x: p.x, z: p.z });
