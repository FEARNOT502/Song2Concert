// gymnastic-bowl.js — the parts of KSPO DOME's bowl round the seats: the
// vomitories, the two concourse rings behind them and the stairs between.
//
// The seats themselves say where the vomitories are: the operator's model
// leaves gaps in the 2F rake where they cut through it (gymnastic-data.js).
//   lower  12 tunnels from the 1F cross aisle (4.77 m) under 2F rows 1-4,
//          ramping down to the 2F concourse
//   upper  11 in rows 5-8 (or 7-8), stairs in them down to the concourse
// Each an open pit with white diagonal walls and its door in the back, as
// the 2018 photographs show them along the rake.
// The 2F concourse runs round under the rake (its ceiling the rake's
// underside), the 3F concourse behind the top row, open to the bowl over a
// rail; four stair cores join them. Their finishes are lit from within, as
// the arena's are (an emissive term in place of their fittings' light), so a
// concourse reads lit through a vomitory's mouth with the house dark.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, std } from '../core.js';
import { GYM_RAD, gymPoint, gymRing } from '../gymnastic-arena-plan.js';

export const CROSS_Y = 4.77, CROSS_R = 44.8;
export const C2 = { y: 3.9, r0: 49.6, r1: 66.5 };
export const C3 = { y: 12.1, r0: 60.9, r1: 66.5, ceil: 15.0 };

// [angle, rows-on-either-side label] of each vomitory, from the gaps
export const LOWER_VOMS = [
  [14.5, ['49', '50']], [63.6, ['23', '24']], [92.9, ['26', '26']], [131.2, ['29', '30']],
  [157.3, ['31', '32']], [180.0, ['33', '34']], [202.7, ['35', '36']], [228.8, ['38', '38']],
  [267.2, ['41', '42']], [296.4, ['44', '44']], [326.5, ['45', '46']], [345.3, ['47', '48']],
];
export const UPPER_VOMS = [
  [22.35, 5], [44.65, 5], [78.25, 7], [112.05, 7], [145.95, 7], [180.0, 7], [214.0, 7],
  [247.95, 7], [281.75, 7], [315.35, 7], [337.65, 5],
];
const LOWER_W = 2.6, UPPER_W = 2.4, WALL = .3;
// the pits' radii and floor heights by the first row they cut
const PIT = { 5: { r0: 49.55, floor: 6.35 }, 7: { r0: 51.95, floor: 7.24 } };
const PIT_R1 = 53.75;
export const STAIR_CORES = [45, 135, 225, 315];

// a box radial at `deg`: tangential half-width `hw`, from radius r0 to r1
function radialBox(out, deg, r0, r1, hw, y0, y1, across = 0) {
  if (r1 - r0 < .01 || y1 - y0 < .01) return;
  const g = new THREE.BoxGeometry(hw * 2, y1 - y0, r1 - r0);
  g.rotateY(Math.PI - deg * GYM_RAD);
  const [x, z] = gymPoint(deg, (r0 + r1) / 2);
  const [tx, tz] = gymPoint(deg + 90, across);
  g.translate(x + tx, (y0 + y1) / 2, z + tz);
  out.push(g.toNonIndexed());
  g.dispose();
}

// a prism radial at `deg`, `across` off its line: a polygon [[r, y]..] in the
// radial plane, `thick` across
function prism(out, deg, across, pts, thick) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([r, y]) => new THREE.Vector2(r, y))), { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  const [ux, uz] = gymPoint(deg, 1), [tx, tz] = gymPoint(deg + 90, 1);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(V3(ux, 0, uz), V3(0, 1, 0), V3(tx, 0, tz)).setPosition(tx * across, 0, tz * across));
  out.push(g.toNonIndexed());
  g.dispose();
}

function sector(out, a0, a1, r0, r1, y0, y1) {
  const ring = [...gymRing(a0, a1, r1, Math.max(2, Math.ceil((a1 - a0) / 2))), ...gymRing(a0, a1, r0, Math.max(2, Math.ceil((a1 - a0) / 2))).reverse()];
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  out.push(g.toNonIndexed());
  g.dispose();
}

function cylinderWall(out, r, y0, y1, a0, a1) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, Math.max(2, Math.ceil((a1 - a0) / 2)), 1, true, (180 - a1) * GYM_RAD, (a1 - a0) * GYM_RAD);
  g.translate(0, (y0 + y1) / 2, 0);
  out.push(g.toNonIndexed());
  g.dispose();
}

// a straight flight of treads (each a solid box down to y0) from `from` rising `rise`, along unit `dir`
function flight(out, from, dir, rise, width, y0) {
  const n = Math.max(1, Math.round(Math.abs(rise) / .19)), step = rise / n, run = .28;
  const yaw = Math.atan2(dir.x, dir.z);
  for (let i = 0; i < n; i++) {
    const top = from.y + step * (i + 1);
    const g = new THREE.BoxGeometry(width, top - y0, run);
    g.rotateY(yaw);
    const c = from.clone().addScaledVector(dir, run * (i + .5));
    g.translate(c.x, (top + y0) / 2, c.z);
    out.push(g.toNonIndexed());
    g.dispose();
  }
  return from.clone().addScaledVector(dir, run * n).setY(from.y + rise);
}

function mesh(root, parts, material, name, collide = true) {
  if (!parts.length) return null;
  const m = new THREE.Mesh(mergeGeometries(parts), material);
  parts.forEach((g) => g.dispose());
  m.name = name;
  m.receiveShadow = true;
  if (!collide) m.userData.noCollide = true;
  root.add(m);
  return m;
}

const within = (deg, x, z, hw, r0, r1) => {
  const r = Math.hypot(x, z);
  if (r < r0 || r > r1) return false;
  const a = Math.atan2(x, -z) / GYM_RAD;
  const d = ((a - deg + 540) % 360) - 180;
  return Math.abs(d * GYM_RAD * r) < hw;
};

// The rake's surface with the vomitories' openings cut out of it.
export function cutRake(geometry) {
  const pos = geometry.attributes.position;
  const keep = [];
  const holes = [
    ...LOWER_VOMS.map(([deg]) => [deg, LOWER_W / 2 + WALL, CROSS_R + .2, 49.9]),
    ...UPPER_VOMS.map(([deg, row]) => [deg, UPPER_W / 2 + WALL, PIT[row].r0, PIT_R1]),
  ];
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    if (holes.some(([deg, hw, r0, r1]) => within(deg, x, z, hw - .05, r0, r1))) continue;
    for (let k = 0; k < 3; k++) keep.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  g.computeVertexNormals();
  return g;
}

export function buildBowl(root, { pipe, rakeAt }) {
  const white = std({ color: 0xc6c8c5, roughness: .95, envMapIntensity: .2, side: THREE.DoubleSide });
  const concrete = std({ color: 0x8d9092, roughness: .92, side: THREE.DoubleSide });
  // the concourses' finishes, lit from within (see the note at the top)
  const lit = std({ color: 0xb9b6ae, roughness: .85, emissive: KELVIN(3600), emissiveIntensity: .35, side: THREE.DoubleSide });
  const floorLit = std({ color: 0x6c6a66, roughness: .82, emissive: KELVIN(3600), emissiveIntensity: .1 });
  const ceilingLit = std({ color: 0x9c9a95, roughness: .9, emissive: KELVIN(3600), emissiveIntensity: .18, side: THREE.DoubleSide });
  const rail = std({ color: 0xb7babb, roughness: .78, metalness: .4 });
  const W = { white: [], roof: [], dark: [], concrete: [], lit: [], floor: [], ceiling: [], rail: [], tread: [] };

  // ── the vomitories, as they are in the 2018 photographs: an open pit in
  // the rake facing the stage, its white walls' tops a diagonal rising from
  // the pit's mouth to its back, the door in its back wall dark, a short roof
  // over the door running back to where the rows go on ──
  const hood = (deg, rF, rB, rEnd, floorY, width) => {
    const hw = width / 2, door = [1.8, 2.2], roofY = floorY + door[1] + .38;
    for (const s of [-1, 1]) {
      prism(W.white, deg, s * (hw - WALL / 2), [[rF, C2.y], [rF, floorY + 1.05], [rB, roofY + .1], [rEnd, roofY + .1], [rEnd, C2.y]], WALL);
    }
    // the roof over the door and the tunnel's first metres
    radialBox(W.roof, deg, rB, rEnd, hw - WALL, roofY - .22, roofY);
    // the back wall: a lintel over the door, a jamb either side
    const inner = width - WALL * 2, jamb = (inner - door[0]) / 2;
    radialBox(W.white, deg, rB, rB + .25, inner / 2, floorY + door[1], roofY);
    if (jamb > .05) for (const s of [-1, 1]) radialBox(W.white, deg, rB, rB + .25, jamb / 2, floorY, floorY + door[1], s * (door[0] / 2 + jamb / 2));
    // the dark beyond the door: the tunnel's lining and its ceiling
    for (const s of [-1, 1]) radialBox(W.dark, deg, rB + .25, rEnd + 1.2, .03, floorY - 1, floorY + door[1], s * (door[0] / 2 + .03));
    radialBox(W.dark, deg, rB + .25, rEnd + 1.2, door[0] / 2 + .06, floorY + door[1], floorY + door[1] + .03);
    // the pit's floor up to the back wall
    radialBox(W.tread, deg, rF, rB + .25, hw - WALL, C2.y, floorY);
  };

  // lower: the pit opens off the 1F cross aisle across 2F rows 1-2; past its
  // door the tunnel ramps down under the rows to the concourse
  for (const [deg] of LOWER_VOMS) {
    const hw = LOWER_W / 2, rF = CROSS_R + .15, rB = 47.3, r1 = C2.r0 + .2;
    hood(deg, rF, rB, 49.45, CROSS_Y, LOWER_W + WALL * 2);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const ra = rB + .25 + (r1 - rB - .25) * i / steps, rb = rB + .25 + (r1 - rB - .25) * (i + 1) / steps;
      radialBox(W.tread, deg, ra, rb, .95, C2.y - .3, CROSS_Y - (CROSS_Y - C2.y) * (i + 1) / steps);
    }
    radialBox(W.ceiling, deg, 49.25, r1, hw + WALL, 6.45, 6.62);
    for (const s of [-1, 1]) radialBox(W.lit, deg, 49.25, r1, WALL / 2, C2.y, 6.5, s * (hw + WALL / 2));
  }

  // upper: the pit's floor the tread of the row before it; past the door a
  // stair down under the rows to the concourse
  for (const [deg, row] of UPPER_VOMS) {
    const { r0, floor } = PIT[row];
    const rB = Math.min(r0 + 1.9, PIT_R1 - .45);
    hood(deg, r0, rB, PIT_R1, floor, UPPER_W + WALL * 2);
    radialBox(W.tread, deg, rB, PIT_R1, .95, C2.y, floor);
    const [ux, uz] = gymPoint(deg, 1);
    const [px, pz] = gymPoint(deg, PIT_R1);
    const end = flight(W.tread, V3(px, floor, pz), V3(ux, 0, uz), C2.y - floor, 1.8, C2.y - .3);
    for (const s of [-1, 1]) {
      const [tx, tz] = gymPoint(deg + 90, s * .82);
      W.rail.push([V3(px + tx, floor + .95, pz + tz), V3(end.x + tx, C2.y + .95, end.z + tz)]);
    }
  }

  // ── the 2F concourse under the rake: its floor, its inner wall where the
  // rake comes down to it, the back wall with its doors, lit ──
  sector(W.floor, 0, 360, C2.r0, C2.r1, C2.y - .3, C2.y);
  const gaps = (list, hw) => {
    // the inner wall in runs between the lower vomitories' tunnels
    const runs = [], cuts = list.map(([deg]) => [deg - (hw + .5) / C2.r0 / GYM_RAD, deg + (hw + .5) / C2.r0 / GYM_RAD]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < cuts.length; i++) runs.push([cuts[i][1], i + 1 < cuts.length ? cuts[i + 1][0] : cuts[0][0] + 360]);
    return runs;
  };
  for (const [a0, a1] of gaps(LOWER_VOMS, LOWER_W / 2 + WALL)) cylinderWall(W.lit, C2.r0, C2.y, 6.9, a0, a1);
  cylinderWall(W.lit, C2.r1, C2.y, C3.ceil, 0, 360);
  // the 3F concourse floor (the 2F's ceiling there), its ceiling, the band
  // over its open front, its rail behind the top row
  const holes = STAIR_CORES.map((deg) => [deg - 5.2, deg + 5.2]);
  const around = [];
  for (let i = 0; i < holes.length; i++) around.push([holes[i][1], i + 1 < holes.length ? holes[i + 1][0] : holes[0][0] + 360]);
  for (const [a0, a1] of around) sector(W.floor, a0, a1, C3.r0, C3.r1, C3.y - .3, C3.y);
  for (const [a0, a1] of holes) sector(W.floor, a0, a1, C3.r0, 62.9, C3.y - .3, C3.y);
  sector(W.ceiling, 0, 360, 62.4, C3.r1, C3.ceil, C3.ceil + .25);
  for (let i = 0; i < 240; i++) {
    const [ax, az] = gymPoint(i * 1.5, C3.r0 + .05), [bx, bz] = gymPoint((i + 1) * 1.5, C3.r0 + .05);
    W.rail.push([V3(ax, C3.y + 1.05, az), V3(bx, C3.y + 1.05, bz)], [V3(ax, C3.y + .55, az), V3(bx, C3.y + .55, bz)]);
    if (i % 2 === 0) W.rail.push([V3(ax, C3.y, az), V3(ax, C3.y + 1.05, az)]);
  }

  // ── four stair cores between the 2F and the 3F, along the back wall:
  // a flight up to a landing, the next back up to the 3F through its slab ──
  for (const deg of STAIR_CORES) {
    const r1 = C2.r1 - 1.0, r2 = C2.r1 - 2.7, mid = (C2.y + C3.y) / 2;
    const tan = (a) => { const [tx, tz] = gymPoint(a + 90, 1); return V3(tx, 0, tz); };
    // (each flight 22 treads, 6.2 m: about 5.4 degrees out here)
    const [x1, z1] = gymPoint(deg - 4.6, r1);
    flight(W.tread, V3(x1, C2.y, z1), tan(deg - 4.6), mid - C2.y, 1.5, C2.y - .3);
    sector(W.tread, deg + .8, deg + 3.8, r2 - .8, r1 + .8, mid - .3, mid);
    const [x2, z2] = gymPoint(deg + .8, r2);
    flight(W.tread, V3(x2, mid, z2), tan(deg + .8).negate(), C3.y - mid, 1.5, mid - .3);
    radialBox(W.lit, deg - 1.9, r2 + .75, r1 - .75, 2.9 * GYM_RAD * C2.r1, C2.y, mid + .2, 0);
  }

  const meshes = [
    mesh(root, W.white, white, 'Vomitory hoods'),
    mesh(root, W.roof, std({ color: 0xb8bab6, roughness: .95, envMapIntensity: .2, side: THREE.DoubleSide }), 'Vomitory hood roofs'),
    mesh(root, W.dark, std({ color: 0x141517, roughness: 1, side: THREE.DoubleSide }), 'Vomitory linings', false),
    mesh(root, W.concrete, concrete, 'Bowl concrete'),
    mesh(root, W.lit, lit, 'Concourse walls'),
    mesh(root, W.floor, floorLit, 'Concourse floors'),
    mesh(root, W.ceiling, ceilingLit, 'Concourse ceilings'),
    mesh(root, W.tread, concrete, 'Vomitory floors and stairs'),
  ];
  // the rails, as thin tubes
  if (W.rail.length) {
    const up = V3(0, 1, 0), mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    const tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.024, .024, 1, 6), rail, W.rail.length);
    W.rail.forEach(([a, b], i) => {
      const d = b.clone().sub(a), len = d.length();
      q.setFromUnitVectors(up, d.normalize());
      tubes.setMatrixAt(i, mtx.compose(a.clone().lerp(b, .5), q, V3(1, len, 1)));
    });
    tubes.userData.noCollide = true;
    tubes.name = 'Bowl rails';
    root.add(tubes);
  }
  // the fittings: a line of lamps under the rake round the 2F concourse, one
  // under the 3F concourse's ceiling, every 2.5 degrees
  const fit = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, .06, .22), new THREE.MeshBasicMaterial({ color: KELVIN(3600).multiplyScalar(1.1) }), 288);
  const mtx = new THREE.Matrix4(), rot = new THREE.Quaternion(), one = V3(1, 1, 1);
  let n = 0;
  for (let i = 0; i < 144; i++) {
    const deg = i * 2.5;
    rot.setFromAxisAngle(V3(0, 1, 0), Math.PI / 2 - deg * GYM_RAD);
    for (const [r, y] of [[57.2, rakeAt(57.2) - .42], [64.4, C3.ceil - .05]]) {
      const [x, z] = gymPoint(deg, r);
      fit.setMatrixAt(n++, mtx.compose(V3(x, y, z), rot, one));
    }
  }
  fit.userData.noCollide = true;
  fit.name = 'Concourse fittings';
  root.add(fit);
  // The concourses lit as the other rooms' are (stands.js roomLights): dark
  // from the bowl, their lights coming up once someone steps into one (a
  // concourse ring, a vomitory's passage, a stair core) and going down again
  // when they leave.
  const zones = [
    { r0: C2.r0 - .2, r1: C2.r1, y0: C2.y - .3, y1: C2.y + 4.8 },
    { r0: C3.r0 - .1, r1: C3.r1, y0: C3.y - .3, y1: C3.ceil },
    ...LOWER_VOMS.map(([deg]) => ({ deg, hw: LOWER_W / 2 + .2, r0: CROSS_R + .3, r1: C2.r0, y0: C2.y - .3, y1: 7.4 })),
    ...UPPER_VOMS.map(([deg, row]) => ({ deg, hw: UPPER_W / 2 + .2, r0: PIT[row].r0 + .6, r1: PIT_R1 + 5, y0: C2.y - .3, y1: PIT[row].floor + 2.4 })),
  ];
  const inside = ({ x, y, z }) => zones.some((q) => {
    if (y < q.y0 || y > q.y1) return false;
    if (q.deg === undefined) { const r = Math.hypot(x, z); return r > q.r0 && r < q.r1; }
    return within(q.deg, x, z, q.hw, q.r0, q.r1);
  });
  const glow = [[lit, lit.emissiveIntensity], [floorLit, floorLit.emissiveIntensity], [ceilingLit, ceilingLit.emissiveIntensity]];
  const fitColor = fit.material.color.clone();
  let k = -1;
  const set = (v) => {
    k = v;
    for (const [m, base] of glow) m.emissiveIntensity = base * v;
    fit.material.color.copy(fitColor).multiplyScalar(v);
  };
  set(0);
  const update = (f) => {
    if (!f.cam) return;
    const want = inside(f.cam) ? 1 : 0;
    if (want === k) return;
    const step = Math.min(1, (f.dt ?? 1 / 60) * 5);
    set(Math.abs(want - k) < .02 ? want : k + (want - k) * step);
  };
  return { meshes, update };
}
