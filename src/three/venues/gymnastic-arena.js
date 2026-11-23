import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, clamp, concreteTex, fbm, pbrSet, smooth, std, valueNoise, withRepeat } from '../core.js';
import { decodeSeats, stadiumSeatGeometry, seatFinder } from '../stands.js';
import { maskingDrapes } from '../show.js';
import { GYM_AISLE_R, GYM_FOH, GYM_NAME, GYM_RAD, gymPoint, gymRing, gymSector } from '../gymnastic-arena-plan.js';
import { GYM_UPPER } from './gymnastic-data.js';
import { buildGymnasticShow } from './gymnastic-show.js';
import { TOP, buildBowl, cutRake } from './gymnastic-bowl.js';
import { getGymnasticSeatCatalog, gymFloor, gymOpenSeat, gymStands, underConsole } from './gymnastic-seats.js';

export { rakeAt } from './gymnastic-bowl.js';

const TREAD_SECTORS = [[-50, 50], [61, 120], [128, 232], [240, 299]];
const MAT = {
  concrete: 0x929698, folded: 0x575754, parapet: 0x767878, rail: 0xababaa,
  wall: 0xa0a5a9, steel: 0xa9adb1, ceiling: 0xbcbfc2, concourse: 0x27292a,
};

function plate(outline, y0, y1, mat) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function arcWall(root, color, radius, bottom, top, start = 0, end = 360) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, top - bottom,
    Math.ceil((end - start) / 4), 1, true, (180 - end) * GYM_RAD, (end - start) * GYM_RAD), color);
  mesh.position.y = (bottom + top) / 2;
  root.add(mesh);
  return mesh;
}

function tube(a, b, d, target, matrix, up) {
  const dy = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dy.clone().normalize());
  matrix.compose(a.clone().lerp(b, .5), q, V3(d, dy.length(), d));
  target.push(matrix.clone());
}

function pipes(root, runs, material) {
  if (!runs.length) return;
  const matrices = [], up = V3(0, 1, 0), matrix = new THREE.Matrix4();
  for (const [a, b, d] of runs) tube(a, b, d, matrices, matrix, up);
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .5, 1, 5), material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.userData.noCollide = true;
  root.add(mesh);
}

function railArc(root, mat, radius, y, start, end) {
  const rail = [], base = gymRing(start, end, radius, Math.round((end - start) * .75));
  for (const [i, [x, z]] of base.entries()) {
    rail.push([V3(x, y, z), V3(x, y + 1.04, z), .05]);
    if (!i) continue;
    for (const h of [.46, 1.02]) {
      const [ax, az] = base[i - 1];
      rail.push([V3(ax, y + h, az), V3(x, y + h, z), h > .9 ? .07 : .045]);
    }
  }
  pipes(root, rail, mat);
  // The thin collision panels share the top-rail boundary and leave the
  // stairs and the actual entrances open at the ends of each arc.
  const collision = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  arcWall(root, collision, radius, y, y + 1.04, start, end).visible = false;
}

function railRadial(root, mat, deg, pts) {
  const rail = [], colPos = [];
  for (let s = 1; s < pts.length; s++) {
    const [r0, y0] = pts[s - 1], [r1, y1] = pts[s];
    const [x0, z0] = gymPoint(deg, r0), [x1, z1] = gymPoint(deg, r1);
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.1));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, r = r0 + (r1 - r0) * t, y = y0 + (y1 - y0) * t;
      const [x, z] = gymPoint(deg, r);
      if (s === 1 || k > 0) rail.push([V3(x, y, z), V3(x, y + 1.04, z), .05]);
      if (k > 0) {
        const pt = (k - 1) / steps, py = y0 + (y1 - y0) * pt, pr = r0 + (r1 - r0) * pt;
        const [px, pz] = gymPoint(deg, pr);
        for (const h of [.46, 1.02]) rail.push([V3(px, py + h, pz), V3(x, y + h, z), h > .9 ? .07 : .045]);
      }
    }
    colPos.push(
      x0, y0, z0, x1, y1, z1, x1, y1 + 1.04, z1,
      x0, y0, z0, x1, y1 + 1.04, z1, x0, y0 + 1.04, z0,
    );
  }
  pipes(root, rail, mat);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(colPos, 3));
  const wall = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  wall.visible = false;
  root.add(wall);
}

function lowerStands(root, mat, mode) {
  for (const [i, [a, b]] of TREAD_SECTORS.entries()) {
    const isC = i === 2, isA = i === 0;
    const front = isC ? 33.77 : 33.91, rows = isC ? 10 : 11;
    const showSectors = mode === '360' && isA ? [[a, -7], [7, b]] : [[a, b]];
    root.add(plate(gymSector(a, b, GYM_AISLE_R - .55, front + .04), 0, 2.60, mat.folded));
    for (let line = 0; line < 10; line++) {
      const y = .16 + .24 * line;
      arcWall(root, mat.parapet, GYM_AISLE_R - .56, y, y + .055, a + .2, b - .2);
    }
    for (const [start, end] of showSectors) railArc(root, mat.rail, GYM_AISLE_R - .33, 2.60, start + .2, end - .2);
    for (let r = 0; r < rows; r++) {
      const inner = front + r * .84, y = 2.8 + r * .2;
      root.add(plate(gymSector(a, b, inner, inner + .842), 0, y, mat.concrete));
    }
    const end = front + .84 * rows;
    root.add(plate(gymSector(a, b, end, 44.8), 0, 4.77, mat.concrete));
    const endProfile = [[GYM_AISLE_R - .33, 2.60], [front, 2.80], [end, 2.8 + (rows - 1) * .2], [43.18, 4.77]];
    for (const deg of [a + .2, b - .2]) railRadial(root, mat.rail, deg, endProfile);
    // Small half-step strips in the lower seating aisles.
    const groups = i % 2 ? 4 : 7;
    for (let aisle = 1; aisle < groups; aisle++) {
      const theta = a + (b - a) * aisle / groups;
      const parts = [];
      for (let r = 0; r < rows - 1; r++) {
        const [tx, tz] = gymPoint(theta, front + r * .84 + .64);
        const geom = new THREE.BoxGeometry(.86, .1, .38);
        geom.rotateY(-theta * GYM_RAD);
        geom.translate(tx, 2.85 + .20 * r, tz);
        parts.push(geom);
      }
      if (parts.length) root.add(new THREE.Mesh(mergeGeometries(parts), mat.concrete));
      parts.forEach((g) => g.dispose());
    }
  }

  // The tunnels between the blocks stay open from the floor; the cross aisle
  // runs behind a solid masonry block so their backs are sealed flush with the
  // stand rear, and a continuous fence bridges each tunnel edge along the aisle.
  for (let i = 0; i < TREAD_SECTORS.length; i++) {
    const a = TREAD_SECTORS[i][1], b = TREAD_SECTORS[(i + 1) % TREAD_SECTORS.length][0] + (i + 1 === TREAD_SECTORS.length ? 360 : 0);
    root.add(plate(gymSector(a - .1, b + .1, 33.91 + .84 * 11, 44.8), 0, 4.77, mat.concrete));
    railArc(root, mat.rail, 43.18, 4.77, a - .2, b + .2);
  }
}

function upperStands(root, mat) {
  const coordinates = decodeSeats(GYM_UPPER);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(coordinates, (x) => x / 100), 3));
  const deck = new THREE.Mesh(cutRake(geo), mat.concrete);
  geo.dispose();
  deck.receiveShadow = true;
  deck.name = '2F rake';
  root.add(deck);

  // Continuous top tiers from the cut rake out to the outer bowl wall so
  // every section meets cleanly with zero step breaks, topped by the solid
  // paneled rear wall, fascia ring beam, and upper drum.
  const parts = [
    plateGeometry(gymSector(0, 360, 57.1, TOP.r1 + .05), 9.95, 10.14),
    plateGeometry(gymSector(0, 360, 58.35, TOP.r1 + .05), 10.10, 10.78),
    plateGeometry(gymSector(213.8, 224.5, 57.45, 58.45), 10.10, 10.46),
  ];
  for (const [a0, a1] of [[146.2, 168.5], [191.5, 213.8]]) {
    parts.push(
      plateGeometry(gymSector(a0, a1, 58.15, TOP.r1 + .05), 10.10, 10.94),
      plateGeometry(gymSector(a0, a1, 59.00, TOP.r1 + .05), 10.90, 11.36),
      plateGeometry(gymSector(a0, a1, 59.75, TOP.r1 + .05), 11.32, 11.78),
    );
  }
  root.add(new THREE.Mesh(mergeGeometries(parts), mat.concrete));
  parts.forEach((g) => g.dispose());

  // Clean continuous perimeter wall right behind the top seats (no open 3F concourse).
  arcWall(root, mat.wall, TOP.r1, 10.0, 15.2);
  const cols = [];
  for (let i = 0; i < 24; i++) {
    const deg = i * 15, [cx, cz] = gymPoint(deg, TOP.r1 - .13);
    const col = new THREE.BoxGeometry(.55, 5.2, .26);
    col.rotateY(-deg * GYM_RAD);
    col.translate(cx, 12.6, cz);
    cols.push(col.toNonIndexed());
    col.dispose();
  }
  root.add(new THREE.Mesh(mergeGeometries(cols), mat.parapet));
  cols.forEach((g) => g.dispose());
  root.add(plate(gymSector(0, 360, TOP.r1 - .25, TOP.r1 + .05), 15.2, 16.3, mat.parapet));
  arcWall(root, mat.ceiling, TOP.r1, 16.3, 22.5);
  railArc(root, mat.rail, TOP.r1 - .22, 10.78, 213.8, 506.2);
  railArc(root, mat.rail, TOP.r1 - .22, 10.78, 168.5, 191.5);
  for (const [a0, a1] of [[146.2, 168.5], [191.5, 213.8]]) railArc(root, mat.rail, TOP.r1 - .22, 11.78, a0, a1);
  return buildBowl(root);
}

function plateGeometry(outline, y0, y1) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g.toNonIndexed();
}

// The roof as it reads from the seats (the 2018 interior photographs): a
// space frame of deep radial trusses running in to a ring over the middle,
// ring trusses at four radii, a grid of purlins with X bracing between them
// at the roof's underside, white acoustic baffles hung in its bays, a
// catwalk ring with its rails, the house speaker cluster in the middle and
// the house lights, high bays on the trusses' bottom chords (`update(house)`
// lights them).
const ROOF_N = 24;
const roofHeight = (r) => 28.9 - 7.2 * (r / 62.5) ** 2.2;
function roof(root, mat, pipe) {
  const n = ROOF_N, at = (deg, r, drop = 0) => {
    const [x, z] = gymPoint(deg, r);
    return V3(x, roofHeight(r) - drop, z);
  };
  // the skin over it all: the deck's underside, dark between the members
  const positions = [];
  const radii = [.02, 8.2, 16, 25, 35, 45, 54, 62.5];
  for (let k = 1; k < radii.length; k++) {
    for (let i = 0; i < 48; i++) {
      const a = i * 7.5, b = (i + 1) * 7.5;
      for (const [p, q, w] of [[at(a, radii[k - 1]), at(a, radii[k]), at(b, radii[k])], [at(a, radii[k - 1]), at(b, radii[k]), at(b, radii[k - 1])]]) {
        positions.push(p.x, p.y, p.z, q.x, q.y, q.z, w.x, w.y, w.z);
      }
    }
  }
  const cover = new THREE.BufferGeometry();
  cover.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cover.computeVertexNormals();
  const skin = new THREE.Mesh(cover, mat.ceiling);
  skin.name = 'Roof deck';
  root.add(skin);

  const chords = [], webs = [], light = [];
  const DEPTH = (r) => 1.2 + 1.5 * Math.min(1, r / 30);
  // a deep truss from (a0, r0) to (a1, r1): a top chord under the deck, two
  // bottom chords DEPTH below it, webs between them every ~2.4 m
  function truss(a0, r0, a1, r1, size = .19) {
    const len = Math.hypot(...gymPoint(a1, r1).map((v, i) => v - gymPoint(a0, r0)[i]));
    const bays = Math.max(1, Math.round(len / 2.4));
    const pts = [];
    for (let i = 0; i <= bays; i++) {
      const t = i / bays, a = a0 + (a1 - a0) * t, r = r0 + (r1 - r0) * t;
      const top = at(a, r, .35), d = DEPTH(r);
      const [sx, sz] = gymPoint(a + 90, 1), side = V3(sx * .55, 0, sz * .55);
      const across = Math.abs(a1 - a0) > .1 && Math.abs(r1 - r0) < .1;
      const off = across ? V3(...(() => { const [ux, uz] = gymPoint(a, 1); return [ux * .55, 0, uz * .55]; })()) : side;
      pts.push({ top, b1: top.clone().add(V3(0, -d, 0)).add(off), b2: top.clone().add(V3(0, -d, 0)).sub(off) });
    }
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      chords.push([p.top, q.top, size], [p.b1, q.b1, size * .8], [p.b2, q.b2, size * .8]);
      webs.push([i % 2 ? p.top : q.top, i % 2 ? q.b1 : p.b1, .07], [i % 2 ? p.top : q.top, i % 2 ? q.b2 : p.b2, .07], [p.b1, q.b2, .05]);
    }
    for (const p of pts) webs.push([p.top, p.b1, .06], [p.top, p.b2, .06], [p.b1, p.b2, .05]);
    return pts;
  }
  const RINGS = [10, 22, 34, 46, 57];
  for (let i = 0; i < n; i++) {
    const a = i * 360 / n;
    truss(a, RINGS[0], a, 61.6, .22);
  }
  for (const r of RINGS) {
    for (let i = 0; i < n; i++) truss(i * 360 / n, r, (i + 1) * 360 / n, r, r === RINGS[0] ? .24 : .17);
  }
  // purlins round the bays at the underside, every 3 m out, X bracing between
  for (let r = 13; r < 61; r += 3) {
    for (let i = 0; i < n * 2; i++) {
      const a = i * 180 / n, b = (i + 1) * 180 / n;
      webs.push([at(a, r, .3), at(b, r, .3), .055]);
      if (r + 3 < 61) webs.push([at(a, r, .3), at(b, r + 3, .3), .035], [at(b, r, .3), at(a, r + 3, .3), .035]);
    }
  }
  // the catwalk ring: grating on the bottom chords' level, rails either side
  const walkR = 28, walkY = roofHeight(walkR) - .35 - DEPTH(walkR) - .1;
  const rails = [];
  for (let i = 0; i < 96; i++) {
    const a = i * 3.75, b = (i + 1) * 3.75;
    for (const dr of [-.5, .5]) {
      const [x0, z0] = gymPoint(a, walkR + dr), [x1, z1] = gymPoint(b, walkR + dr);
      rails.push([V3(x0, walkY + 1.05, z0), V3(x1, walkY + 1.05, z1), .045], [V3(x0, walkY + .5, z0), V3(x1, walkY + .5, z1), .035]);
      rails.push([V3(x0, walkY, z0), V3(x0, walkY + 1.05, z0), .04]);
    }
  }
  const steel = std({ color: 0xd3d6d8, roughness: .8, metalness: .3 });
  pipes(root, chords, steel);
  pipes(root, webs, steel);
  pipes(root, rails, std({ color: 0xbfc2c4, roughness: .8, metalness: .35 }));
  const grating = new THREE.Mesh(new THREE.RingGeometry(walkR - .5, walkR + .5, 192, 1), std({ color: 0x55585a, roughness: .8, metalness: .4, side: THREE.DoubleSide }));
  grating.rotateX(-Math.PI / 2);
  grating.position.y = walkY;
  grating.userData.noCollide = true;
  root.add(grating);

  // the baffles: white panels hung on edge in the bays, two rows a bay
  const baffle = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, .9, .06), mat.panel, n * 2 * 15);
  baffle.userData.noCollide = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1);
  let k = 0;
  for (let i = 0; i < n * 2; i++) {
    const a = (i + .5) * 180 / n;
    for (let r = 14.5; r < 59 && k < baffle.count; r += 3) {
      const p = at(a, r, .95);
      q.setFromAxisAngle(V3(0, 1, 0), -a * GYM_RAD);
      baffle.setMatrixAt(k++, m.compose(p, q, one));
    }
  }
  baffle.count = k;
  root.add(baffle);

  // the house speaker cluster over the middle, in its ring
  const cluster = new THREE.Group();
  cluster.name = 'House speaker cluster';
  const black = std({ color: 0x141516, roughness: .7, metalness: .2 });
  for (let i = 0; i < 8; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, .9), black);
    const [x, z] = gymPoint(i * 45, 1.25);
    box.position.set(x, 22.6, z);
    box.rotation.y = -i * 45 * GYM_RAD;
    cluster.add(box);
  }
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, .35, 24, 1, true), black);
  frame.position.y = 23.7;
  cluster.add(frame);
  const hangers = [];
  for (let i = 0; i < 4; i++) {
    const [x, z] = gymPoint(i * 90 + 45, 1.8);
    hangers.push([V3(x, 23.8, z), V3(x, roofHeight(2) - .2, z), .03]);
  }
  pipes(cluster, hangers, black);
  cluster.traverse((o) => { o.userData.noCollide = true; });
  root.add(cluster);

  // the house lights: high bays under the bottom chords of the radial trusses
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(.24, .3, .38, 10), std({ color: 0x9a9c9e, roughness: .5, metalness: .5 }), n * 4);
  const lens = new THREE.InstancedMesh(new THREE.CircleGeometry(.23, 12), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }), n * 4);
  lens.geometry.rotateX(Math.PI / 2);
  k = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 360 / n + (i % 2 ? 4 : -4);
    for (const r of [17, 29, 41, 52]) {
      const p = at(a, r, .35 + DEPTH(r) + .25);
      lamps.setMatrixAt(k, m.makeTranslation(p.x, p.y, p.z));
      lens.setMatrixAt(k, m.makeTranslation(p.x, p.y - .2, p.z));
      if (pipe && (i + r) % 3 === 0) light.push(pipe.flares.add(V3(p.x, p.y - .22, p.z), KELVIN(5200), .5, 0));
      k++;
    }
  }
  lamps.userData.noCollide = lens.userData.noCollide = true;
  root.add(lamps, lens);
  const warm = KELVIN(5200);
  // (the roof lit by the house lights' spill and bounce: the white deck, the
  // baffles and the steel glow a little with them, as in the photographs)
  const glow = [[mat.ceiling, .1], [mat.panel, .1], [steel, .04]];
  for (const [m2] of glow) m2.emissive = KELVIN(5600);
  return (house) => {
    lens.material.color.copy(warm).multiplyScalar(.05 + 5.5 * house);
    for (const f of light) f.intensity = .4 * house;
    for (const [m2, k] of glow) m2.emissiveIntensity = k * house;
  };
}

// The roof's acoustic baffles: white perforated sheet in a frame, the holes
// in a tight grid (the sound goes through to the wool behind).
function baffleTex() {
  return pbrSet('gym-baffle', 256, (u, v) => {
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const frame = edge < .025 ? 1 : 0;
    const hu = (u * 52) % 1 - .5, hv = (v * 18) % 1 - .5;
    const hole = frame ? 0 : 1 - smooth(.18, .26, Math.hypot(hu, hv));
    const c = .82 - .38 * hole - .06 * frame;
    return [c, c, c * .98, .5 - hole * .4 + frame * .2, 1];
  }, { normal: 1.0 });
}

function chairs(root, seats) {
  const bodyMat = std({ color: 0xffffff, roughness: .96, envMapIntensity: .05, side: THREE.DoubleSide });
  const frameMat = std({ color: 0x25282b, roughness: .95, envMapIntensity: .05 });
  bodyMat.userData.flat = true;
  frameMat.userData.flat = true;
  const body = new THREE.InstancedMesh(stadiumSeatGeometry(), bodyMat, seats.length);
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(.05, .48, .3), frameMat, seats.length);
  const mat = new THREE.Matrix4(), m2 = new THREE.Matrix4(), color = new THREE.Color();
  const mount = new THREE.Matrix4().makeTranslation(.24, .24, -.07);
  // the colours as of 2025 (the concert photographs from 1F and from 2F 27):
  // 1F's fixed rows yellow; 2F yellow at the front, then yellow and teal mixed
  // seat by seat, teal taking over towards the back
  const YELLOW = [0x9e7820, 0xa67f24, 0x94701c], TEAL = [0x457d91, 0x4c8599, 0x3e7488];
  const hash = (i) => { let h = Math.imul(i | 0, 2654435761) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return (h % 1000) / 1000; };
  seats.forEach((seat, i) => {
    const n = +seat.block, key = n * 1009 + seat.row * 97 + seat.num * 13;
    const t = clamp((seat.row - 2) / 11, 0, 1), pTeal = t * t * (3 - 2 * t) * .88;
    const teal = n >= 23 && hash(key) < pTeal;
    const hue = (teal ? TEAL : YELLOW)[Math.floor(hash(key + 911) * 3)];
    mat.makeRotationY(seat.yaw).setPosition(seat.x, seat.y, seat.z);
    body.setMatrixAt(i, mat);
    body.setColorAt(i, color.setHex(hue));
    frame.setMatrixAt(i, m2.copy(mat).multiply(mount));
  });
  body.receiveShadow = true;
  root.add(body, frame);
}

// The folded telescopic rows (1-11) behind black cloth, as at a concert: a
// pleated drape on a track along each bay's face, from the floor up under the
// mid-aisle's rail, open at the aisle stairs between the bays.
function foldedCurtain(root) {
  const radius = GYM_AISLE_R - .73;
  for (const [a, b] of TREAD_SECTORS) {
    const ring = gymRing(a + .25, b - .25, radius, Math.ceil((b - a) / 2.2));
    for (let i = 1; i < ring.length; i++) {
      maskingDrapes(root, { a: ring[i - 1], b: ring[i], top: 2.52, panel: 1.4 });
    }
  }
}

// Each open seat taken, the person on it turned to the stage; their block for
// the lightsticks the section (1F 1-22 on level 1, 2F 23-52 on level 2), their
// place round the stage from one side of the house to the other.
function seatedCrowd(seats, stage, round) {
  return seats.map((s) => {
    const turn = Math.atan2(stage.x - s.x, stage.z - s.z);
    const around = Math.atan2(s.x - stage.x, s.z - stage.z);
    return {
      x: s.x + Math.sin(s.yaw) * .03, y: s.y, z: s.z + Math.cos(s.yaw) * .03, turn, seat: true,
      zone: { lv: +s.block < 23 ? 1 : 2, block: +s.block, u: round ? (around + Math.PI) / (2 * Math.PI) : (around + Math.PI) / (2 * Math.PI) },
    };
  });
}

export function buildGymnasticArena(ctx) {
  const root = new THREE.Group();
  root.name = GYM_NAME;
  const round = ctx.mode === '360';
  const textures = withRepeat(concreteTex({ key: 'gym-structure', tone: .44, warm: .05, even: .64 }), .27, .27);
  const wallTex = withRepeat(concreteTex({ key: 'gym-wall', tone: .74, warm: .02, even: .82 }), .12, .12);
  const parapetTex = withRepeat(concreteTex({ key: 'gym-parapet', tone: .58, warm: .03, even: .76 }), .22, .22);
  const mat = Object.fromEntries(Object.entries(MAT).map(([name, color]) => {
    const mapProps = name === 'concrete' ? textures : name === 'wall' ? wallTex : name === 'parapet' ? parapetTex : null;
    // (no roughness map on the concrete finishes: under it the screen-space
    // reflections traced its pores and sparkled; the arena's concrete is the same)
    return [name, std({ color, roughness: name === 'wall' ? .95 : .93, side: THREE.DoubleSide, ...(mapProps ? { ...mapProps, roughnessMap: null } : {}) })];
  }));
  mat.panel = std({ color: 0xffffff, ...baffleTex(), roughnessMap: null, roughness: 1, side: THREE.DoubleSide });
  // the floor as the 2025 concert photographs show it: light grey concrete
  const ground = new THREE.Mesh(new THREE.CircleGeometry(62.4, 128),
    std({ color: 0xc3beb4, ...withRepeat(concreteTex({ key: 'gym-floor', tone: .5, even: .55, warm: .04 }), 16, 16), roughnessMap: null, roughness: 1, envMapIntensity: .3 }));
  ground.rotateX(-Math.PI / 2);
  ground.receiveShadow = true;
  root.add(ground);
  lowerStands(root, mat, ctx.mode);
  foldedCurtain(root);
  const bowl = upperStands(root, mat);
  const houseRoof = roof(root, mat, ctx.pipe);
  // (360: the console's scaffold stands over section 19's middle rows)
  const all = gymStands().filter((seat) => !round || !underConsole(seat));
  chairs(root, all);
  const floor = gymFloor(ctx.mode);
  const catalog = getGymnasticSeatCatalog(ctx.mode);
  const [fx, fy, fz] = GYM_FOH[ctx.mode];
  const eye = V3(fx, fy + 1.6, fz);
  const stage = V3(0, 0, round ? 0 : -17);
  const open = all.filter((seat) => gymOpenSeat(seat, ctx.mode));
  const stands = {
    people: seatedCrowd(open, stage, round), aisleLights: [], update() {},
    seatNear: seatFinder(catalog.seats.filter((s) => !s.standing)), seats: [...all, ...floor.positions],
  };
  const show = buildGymnasticShow(ctx, root, eye, stands, floor, (f) => { houseRoof(f.house); bowl.update(f); });
  return {
    root, eye, ...show, round, seatNear: stands.seatNear, seats: stands.seats, splitTurn: 0,
    background: new THREE.Color(0x060608), fog: new THREE.FogExp2(0x07070a, .0031),
    hazeAmb: new THREE.Color(0x050407), hazeAmbDist: 120,
    // (house up, the threshold raised over what the house lights make of the
    // white vomitory walls and the light floor: they haloed, and read as
    // reflections)
    bloom: { strength: .32, radius: .5, threshold: 1.5, house: 2.2 },
    grade: { exposure: 1.14, vignette: .28, ca: .003, grain: .025, sat: 1.04, lift: [.004, .005, .009] },
    envIntensity: .58,
    finish: { matte: .15, gloss: .3, metal: .3 },
  };
}
