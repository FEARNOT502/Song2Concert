import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, concreteTex, std, withRepeat } from '../core.js';
import { stageSteps } from '../rig.js';
import { decodeSeats, stadiumSeatGeometry, seatFinder } from '../stands.js';
import { GYM_AISLE_R, GYM_FOH, GYM_NAME, GYM_RAD, gymPoint, gymRing, gymSector } from '../gymnastic-arena-plan.js';
import { GYM_UPPER } from './gymnastic-data.js';
import { buildGymnasticShow } from './gymnastic-show.js';
import { getGymnasticSeatCatalog, gymFloor, gymStands } from './gymnastic-seats.js';

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
    root.add(plate(gymSector(a, b, end, 44.8), 4.51, 4.77, mat.concrete));
    // Aisles at the four floor approaches rise up beside the folded bays.
    const angle = a - 3.8, [x, z] = gymPoint(angle, 28.5);
    const [dx, dz] = gymPoint(angle, 1);
    root.add(stageSteps({ x, z, h: 4.76, width: 1.65, dir: [dx, dz], run: .61 }));
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

  // Accessible concourse at the back of C. The open edge and the slope
  // beside the treads face the stage and are visible from the floor.
  root.add(plate(gymSector(134, 226, 42.3, 45.4), 4.54, 4.78, mat.concrete));
  railArc(root, mat.rail, 42.4, 4.78, 136, 224);
}

function upperStands(root, mat) {
  const coordinates = decodeSeats(GYM_UPPER);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(coordinates, (x) => x / 100), 3));
  geo.computeVertexNormals();
  const deck = new THREE.Mesh(geo, mat.concrete);
  deck.receiveShadow = true;
  root.add(deck);

  // Outer circulation and the front of the boxes behind the last seats.
  root.add(plate(gymSector(0, 360, 59.2, 62.4), 10.43, 10.70, mat.concrete));
  for (const [start, end] of [[21, 48], [55, 76], [82, 111], [113, 154], [158, 202], [206, 244], [250, 278], [283, 306], [312, 346]]) {
    arcWall(root, mat.concourse, 60.35, 10.72, 14.02, start, end);
    arcWall(root, mat.parapet, 59.8, 10.68, 11.45, start, end);
  }
  for (const center of [112, 126, 140, 154, 206, 220, 234, 248]) {
    arcWall(root, mat.parapet, 58.35, 11.05, 11.45, center - 4.4, center + 4.4);
    arcWall(root, mat.concourse, 60.1, 11.1, 13.92, center - 4.4, center + 4.4);
  }
  arcWall(root, mat.parapet, 62.4, 12.9, 14.15);
  arcWall(root, mat.wall, 62.4, 14.15, 22);
}

function roof(root, mat) {
  const roofHeight = (r) => 28.9 - 7.2 * (r / 62.5) ** 2.2;
  const positions = [], beams = [];
  const radii = [.02, 8.2, 16, 25, 35, 45, 54, 62.5];
  const n = 48, height = (a, r, drop = 0) => {
    const [x, z] = gymPoint(a, r);
    return V3(x, roofHeight(r) - drop, z);
  };
  const skin = (a, b, c) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let r = 1; r < radii.length; r++) {
    const inner = radii[r - 1], outer = radii[r];
    for (let i = 0; i < n; i++) {
      const a = i * 360 / n, b = (i + 1) * 360 / n;
      skin(height(a, inner), height(a, outer), height(b, outer));
      skin(height(a, inner), height(b, outer), height(b, inner));
      const drop = r === 1 ? .55 : 1.15;
      beams.push([height(a, outer, drop), height(b, outer, drop), r % 2 === 0 ? .22 : .16]);
      if (r === 1) continue;
      beams.push([height(a, inner, drop), height(a, outer, drop), .16]);
      beams.push([height(a, inner, .10), height(b, outer, drop), .088]);
      beams.push([height(a, outer, .10), height(a, outer, drop), .095]);
    }
  }
  const cover = new THREE.BufferGeometry();
  cover.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cover.computeVertexNormals();
  root.add(new THREE.Mesh(cover, mat.ceiling));
  pipes(root, beams, mat.steel);

  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(2.22, .075, 1.16), mat.panel, 480);
  panels.userData.noCollide = true;
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (const radius of [15, 20, 26, 33, 39, 45, 51, 56, 59, 61]) {
    for (let step = 0; step < n; step++) {
      const angle = (step + (radius % 2 ? .5 : .26)) * 360 / n;
      const [x, z] = gymPoint(angle, radius);
      matrix.makeRotationY(-angle * GYM_RAD).setPosition(x, roofHeight(radius) - .57, z);
      panels.setMatrixAt(index++, matrix);
    }
  }
  root.add(panels);
}

function chairs(root, seats) {
  const body = new THREE.InstancedMesh(stadiumSeatGeometry(), std({ color: 0xffffff, roughness: .75, side: THREE.DoubleSide }), seats.length);
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(.05, .48, .3), std({ color: 0x25282b, roughness: .82 }), seats.length);
  const mat = new THREE.Matrix4(), m2 = new THREE.Matrix4(), color = new THREE.Color();
  const mount = new THREE.Matrix4().makeTranslation(.24, .24, -.07);
  seats.forEach((seat, i) => {
    const n = +seat.block;
    const hue = n < 23
      ? n >= 16 || (n >= 5 && n <= 11) ? (n >= 16 ? 0x27674d : 0xb99834) : 0xcaac43
      : seat.y > 10.93 ? 0x78372c : ((n > 33 && n < 45) || n < 31 ? 0x67a8ad : 0xc98437);
    mat.makeRotationY(seat.yaw).setPosition(seat.x, seat.y, seat.z);
    body.setMatrixAt(i, mat);
    body.setColorAt(i, color.setHex(hue));
    frame.setMatrixAt(i, m2.copy(mat).multiply(mount));
  });
  body.receiveShadow = true;
  root.add(body, frame);
}

export function buildGymnasticArena(ctx) {
  const root = new THREE.Group();
  root.name = GYM_NAME;
  const textures = withRepeat(concreteTex({ key: 'gym-structure', tone: .44, warm: .05, even: .64 }), .27, .27);
  const mat = Object.fromEntries(Object.entries(MAT).map(([name, color]) =>
    [name, std({ color, roughness: .91, side: THREE.DoubleSide, ...(name === 'concrete' ? textures : {}) })]));
  mat.panel = std({ color: 0xd2d4ce, roughness: 1, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(62.4, 128),
    std({ color: 0x757474, ...withRepeat(concreteTex({ key: 'gym-floor', tone: .37, even: .82 }), 18, 18), roughness: .81 }));
  ground.rotateX(-Math.PI / 2);
  ground.receiveShadow = true;
  root.add(ground);
  lowerStands(root, mat, ctx.mode);
  upperStands(root, mat);
  roof(root, mat);
  // The console occupies the centre of section 19 in the circular show.
  const stands = gymStands().filter((seat) => ctx.mode !== '360' || seat.block !== '19');
  chairs(root, stands);
  const floor = gymFloor(ctx.mode);
  const catalog = getGymnasticSeatCatalog(ctx.mode);
  const floorHeight = GYM_FOH[ctx.mode][1];
  const eye = V3(GYM_FOH[ctx.mode][0], floorHeight + 1.6, GYM_FOH[ctx.mode][2]);
  const show = buildGymnasticShow(ctx, root, eye, floor);
  const room = {
    root, eye, ...show, round: ctx.mode === '360', seatNear: seatFinder(catalog.seats.filter((s) => !s.standing)),
    seats: [...stands, ...floor.positions],
    background: new THREE.Color(0x090a0c), fog: new THREE.FogExp2(0x090a0d, .0029),
    hazeDensity: .00072, volShoulder: 3.1, hazeAmb: new THREE.Color(0x080b12), hazeAmbDist: 95, beamGain: .52,
    bloom: { strength: .36, threshold: 1.40, radius: .55, house: 2.6 },
    grade: { exposure: 1.07, vignette: .25, grain: .02, lift: [.005, .006, .009] },
    env: { w: 125, d: 125, h: 29, eye, wall: 0x15181e, floor: 0x121319 },
  };
  return room;
}
