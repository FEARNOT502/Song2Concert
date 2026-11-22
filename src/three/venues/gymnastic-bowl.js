// gymnastic-bowl.js — the parts of KSPO DOME's bowl round the seats: the
// vomitories and the concourse behind them.
//
// The vomitories as the operator's model (kspodome_dae, 2023) draws them and
// the 2018 photographs show them: an open pit in the rake between thin white
// walls, the walls' tops a diagonal a metre over the treads beside them, a
// handrail post at each front corner.
//   lower  12 off the 1F cross aisle (4.77 m): four steps down to the
//          concourse's level, then a tunnel under the rows (its roof at 6.2 m)
//          straight into the concourse
//   upper  11 in the rows over 51 m (three or four rows cut, as the seats
//          show): the pit's floor stepping down 0.9 m to a door in its back
//          wall, past the door a stair down into the concourse
// The concourse: one level all the way round under the rake, kept plain (no
// rooms, doors or columns): its ceiling the rake's underside (white, ribbed
// by the radial beams under the rake, as the 2025 photographs show it) out
// to a flat ceiling under the top rows, a plain wall behind. Behind the top
// row only a narrow aisle and the wall. The finishes are lit from within, as
// the arena's are (an emissive term in place of their fittings' light), so
// the concourse reads lit through a vomitory with the house dark.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KELVIN, V3, floorPanelTex, std } from '../core.js';
import { GYM_RAD, gymPoint, gymRing } from '../gymnastic-arena-plan.js';

export const CROSS_Y = 4.77, CROSS_R = 44.8;
export const C2 = { y: 4.17, r0: 49.8, r1: 60.0, ceil: 10.2 };
// the aisle behind the top row, up against the bowl's wall
export const TOP = { y: 12.1, r0: 60.9, r1: 62.4 };

// the lower vomitories' angles, centred in the gaps in the 2F's first rows
// (the seats as the operator's chart draws them)
export const LOWER_VOMS = [14.87, 63.42, 92.9, 131.08, 157.3, 180.0, 202.7, 228.8, 266.96, 296.64, 326.5, 345.42];
// the upper ones: [angle, the pit's front, its back wall] (radii, from the
// rows the chart's seats leave out there)
export const UPPER_VOMS = [
  [22.35, 51.61, 55.13], [44.65, 51.79, 54.78], [78.25, 51.58, 54.55], [112.05, 51.32, 54.29],
  [145.95, 51.12, 54.1], [180.0, 51.0, 53.98], [214.0, 51.09, 54.05], [247.95, 51.26, 54.23],
  [281.75, 51.46, 54.46], [315.35, 51.78, 54.77], [337.65, 51.59, 55.11],
];
// the pits' clear width either side of the line, their walls' thickness
const PIT_HW = 1.35, WALL = .15, OUT = PIT_HW + WALL;
// lower: the cross aisle's edge, the tunnel's mouth, its roof's underside
const L_FRONT = 45.0, L_MOUTH = 47.3, L_ROOF = 6.2;
// upper: the doorway's half-width, the passage's run on past the door
const DOOR_HW = 1.0, PASSAGE = 1.6;
// the rake's underside: .45 m under its treads
const SOFFIT_DROP = .45;

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

// The rake's surface with the vomitories' pits cut out of it, and without
// the model's own stand-ins for what is under it (a flat slab at the 2F's
// level, a wall round at 57 m): the concourse is built here instead.
export function cutRake(geometry) {
  const pos = geometry.attributes.position;
  const keep = [];
  const holes = [
    ...LOWER_VOMS.map((deg) => [deg, OUT, CROSS_R + .2, 48.65]),
    ...UPPER_VOMS.map(([deg, rF, rD]) => [deg, OUT, rF, rD]),
  ];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3, r = Math.hypot(x, z);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (y < 4.9 && r > 45.6) continue;
    if (Math.abs(n.y) < .3 && r > 56.2 && r < 58.8 && y < 10.3) continue;
    if (holes.some(([deg, hw, r0, r1]) => within(deg, x, z, hw - .05, r0, r1))) continue;
    for (const v of [a, b, c]) keep.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  g.computeVertexNormals();
  return g;
}

// the rake's underside: a surface of revolution through `profile` [[r, y]..]
// with angular gaps in each radial band, `holes` [[deg, half-width, r0, r1]..]
function soffit(profile, holes) {
  const pos = [];
  for (let i = 1; i < profile.length; i++) {
    const [ra, ya] = profile[i - 1], [rb, yb] = profile[i], rm = (ra + rb) / 2;
    const cuts = holes.filter(([, , h0, h1]) => rm > h0 && rm < h1)
      .map(([deg, hw]) => [deg - hw / rm / GYM_RAD, deg + hw / rm / GYM_RAD]).sort((a, b) => a[0] - b[0]);
    const runs = cuts.length ? cuts.map((c, k) => [c[1], k + 1 < cuts.length ? cuts[k + 1][0] : cuts[0][0] + 360]) : [[0, 360]];
    for (const [a0, a1] of runs) {
      const n = Math.max(1, Math.ceil(a1 - a0));
      for (let k = 0; k < n; k++) {
        const d0 = a0 + (a1 - a0) * k / n, d1 = a0 + (a1 - a0) * (k + 1) / n;
        const [x00, z00] = gymPoint(d0, ra), [x01, z01] = gymPoint(d1, ra);
        const [x10, z10] = gymPoint(d0, rb), [x11, z11] = gymPoint(d1, rb);
        pos.push(x00, ya, z00, x10, yb, z10, x11, yb, z11, x00, ya, z00, x11, yb, z11, x01, ya, z01);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}

export function buildBowl(root, { pipe, rakeAt }) {
  // the vomitories' white walls, matt (no sheen: under the house lights a
  // painted edge read as a polished one)
  const white = std({ color: 0xb4b6b3, roughness: 1, envMapIntensity: .15, side: THREE.DoubleSide });
  white.userData.flat = true;
  const concrete = std({ color: 0x8d9092, roughness: .95, side: THREE.DoubleSide });
  // the concourse's finishes, lit from within (see the note at the top), a
  // neutral white: light walls, a mid-grey stone floor, white ceilings
  // (their own colour nearly black: the house lights throw no shadows, and
  // would reach in through the rake; the finishes' look is their emission)
  // (a near-white light: 4000 K read brown on these finishes; the walls and
  // ceilings well over the floor, or the ring read as one grey haze)
  const glowOf = (k, i, side = THREE.DoubleSide) => std({ color: 0x0f0f0f, roughness: .95, emissive: KELVIN(5600).multiplyScalar(k), emissiveIntensity: i, side });
  const lit = glowOf(1, 1.2);
  const floorLit = glowOf(.62, .72, THREE.FrontSide);
  // the floor's stone, 0.6 m tiles (its UVs are metres: the sector's plan)
  const tiles = floorPanelTex({ key: 'gym-concourse-floor', tone: .95, seed: 57 }).map;
  tiles.repeat.set(1 / 4.8, 1 / 4.8);
  floorLit.emissiveMap = tiles;
  const ceilingLit = glowOf(1.05, 1.28);
  // (the beams' sides a shade darker than the soffit between them, so they read)
  const ribLit = glowOf(.74, 1.2);
  for (const m of [lit, floorLit, ceilingLit, ribLit]) m.userData.flat = true;
  const rail = std({ color: 0xb7babb, roughness: .78, metalness: .4 });
  const W = { white: [], dark: [], lit: [], floor: [], ceiling: [], rib: [], rail: [], tread: [] };
  const soff = (r) => rakeAt(r) - SOFFIT_DROP;
  // where the soffit comes down to the flat ceiling
  let lo = C2.r0, hi = TOP.r0;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (soff(m) < C2.ceil) lo = m; else hi = m; }
  const R_CEIL = lo;
  const post = (deg, r, y, s) => {
    const [x, z] = gymPoint(deg, r), [tx, tz] = gymPoint(deg + 90, s * (OUT - .06));
    W.rail.push([V3(x + tx, y, z + tz), V3(x + tx, y + 1.0, z + tz)]);
  };

  // ── lower: off the cross aisle, four steps down between the walls, the
  // tunnel's mouth under the rows, the tunnel on into the concourse ──
  for (const deg of LOWER_VOMS) {
    for (const s of [-1, 1]) {
      prism(W.white, deg, s * (PIT_HW + WALL / 2), [[L_FRONT, C2.y], [L_FRONT, CROSS_Y + 1.05], [L_MOUTH, rakeAt(L_MOUTH) + 1.05], [L_MOUTH, C2.y]], WALL);
      post(deg, CROSS_R - .3, CROSS_Y, s);
      // the tunnel's walls
      radialBox(W.lit, deg, L_MOUTH, C2.r0, WALL / 2, C2.y, L_ROOF, s * (PIT_HW + WALL / 2));
    }
    radialBox(W.tread, deg, CROSS_R - .05, L_FRONT + .4, PIT_HW, C2.y - .3, CROSS_Y);
    for (let i = 0; i < 4; i++) {
      const ra = L_FRONT + .4 + (L_MOUTH - L_FRONT - .4) * i / 4, rb = L_FRONT + .4 + (L_MOUTH - L_FRONT - .4) * (i + 1) / 4;
      radialBox(W.tread, deg, ra, rb, PIT_HW, C2.y - .3, CROSS_Y - (CROSS_Y - C2.y) * (i + 1) / 4);
    }
    radialBox(W.floor, deg, L_MOUTH, C2.r0, PIT_HW, C2.y - .3, C2.y);
    // the tunnel's ceiling, its roof over the mouth (the rows' own tread
    // there) and the white face over the mouth
    radialBox(W.ceiling, deg, L_MOUTH, C2.r0 + .05, OUT, L_ROOF - .05, L_ROOF);
    radialBox(W.tread, deg, L_MOUTH, 48.65, OUT, L_ROOF, L_ROOF + .1);
    radialBox(W.white, deg, L_MOUTH - .02, L_MOUTH + .06, OUT, L_ROOF - .25, L_ROOF + .1);
  }

  // ── upper: the pit's floor stepping down from the row in front, a door
  // in its back wall, past it a stair down into the concourse; under the
  // rake the pit and the passage are a mass faced in the concourse's finish ──
  for (const [deg, rF, rD] of UPPER_VOMS) {
    // (a short pit drops further, for the door's height under the rows)
    const yF = rakeAt(rF), yD = Math.min(yF - .9, rakeAt(rD) - 2.0), head = yD + 1.95;
    for (const s of [-1, 1]) {
      prism(W.white, deg, s * (PIT_HW + WALL / 2), [[rF, yD - .3], [rF, yF + 1.0], [rD + .2, rakeAt(rD) + 1.0], [rD + .2, yD - .3]], WALL);
      post(deg, rF + .12, yF, s);
    }
    // the floor: a landing, steps down, a landing at the door
    radialBox(W.tread, deg, rF, rF + .35, PIT_HW, yD - .3, yF);
    const s0 = rF + .35, s1 = rD - .6, n = Math.round((yF - yD) / .18);
    for (let i = 0; i < n; i++) radialBox(W.tread, deg, s0 + (s1 - s0) * i / n, s0 + (s1 - s0) * (i + 1) / n, PIT_HW, yD - .3, yF - (yF - yD) * (i + 1) / n);
    radialBox(W.tread, deg, s1, rD + .2, PIT_HW, yD - .3, yD);
    // the back wall: a lintel up to the rows behind, a jamb either side, the
    // dark of the passage beyond
    radialBox(W.white, deg, rD, rD + .2, PIT_HW, head, rakeAt(rD) + .02);
    for (const s of [-1, 1]) radialBox(W.white, deg, rD, rD + .2, (PIT_HW - DOOR_HW) / 2, yD, head, s * (DOOR_HW + PIT_HW) / 2);
    // the passage: down from the door into the concourse, lit, its walls
    // and ceiling to where the soffit is high enough over the stair
    const [ux, uz] = gymPoint(deg, 1), [px, pz] = gymPoint(deg, rD + .2);
    const end = flight(W.floor, V3(px, yD, pz), V3(ux, 0, uz), C2.y - yD, DOOR_HW * 2 - .1, C2.y - .3);
    const rP = rD + PASSAGE;
    radialBox(W.ceiling, deg, rD + .2, rP, DOOR_HW + .08, head, head + .05);
    radialBox(W.lit, deg, rP, rP + .03, DOOR_HW + .08, head, soff(rP) + .05);
    for (const s of [-1, 1]) {
      prism(W.lit, deg, s * (DOOR_HW + .04), [[rD + .2, C2.y], [rP, C2.y], [rP, soff(rP) + .05], [rD + .2, soff(rD + .2) + .05]], .08);
      const [tx, tz] = gymPoint(deg + 90, s * (DOOR_HW - .12));
      W.rail.push([V3(px + tx, yD + .9, pz + tz), V3(end.x + tx, C2.y + .9, end.z + tz)]);
      // the mass's sides, its end beside the passage
      prism(W.lit, deg, s * (OUT + .01), [[Math.max(rF, C2.r0), C2.y], [rD + .2, C2.y], [rD + .2, soff(rD + .2) + .05], [Math.max(rF, C2.r0), soff(Math.max(rF, C2.r0)) + .05]], .02);
      radialBox(W.lit, deg, rD + .2, rD + .22, (OUT - DOOR_HW) / 2, C2.y, soff(rD + .2) + .05, s * (OUT + DOOR_HW) / 2);
    }
    if (rF > C2.r0) radialBox(W.lit, deg, rF - .02, rF, OUT + .01, C2.y, soff(rF) + .05);
  }

  // ── the concourse: its floor, its inner wall where the rake comes down to
  // it, the rake's underside and the flat ceiling, a plain wall behind ──
  sector(W.floor, 0, 360, C2.r0, C2.r1, C2.y - .3, C2.y);
  const cuts = LOWER_VOMS.map((deg) => [deg - (OUT + .02) / C2.r0 / GYM_RAD, deg + (OUT + .02) / C2.r0 / GYM_RAD]).sort((a, b) => a[0] - b[0]);
  cuts.forEach((c, i) => cylinderWall(W.lit, C2.r0, C2.y, soff(C2.r0) + .05, c[1], i + 1 < cuts.length ? cuts[i + 1][0] : cuts[0][0] + 360));
  // over the tunnels' ends, the wall's top
  for (const deg of LOWER_VOMS) radialBox(W.lit, deg, C2.r0 - .02, C2.r0, OUT + .02, L_ROOF, soff(C2.r0) + .05);
  cylinderWall(W.lit, C2.r1, C2.y, C2.ceil + .1, 0, 360);
  sector(W.ceiling, 0, 360, R_CEIL - .05, C2.r1, C2.ceil, C2.ceil + .15);
  // the soffit, open over the upper vomitories' pits and passages
  const radii = new Set([C2.r0, R_CEIL, ...UPPER_VOMS.flatMap(([, rF, rD]) => [rF, rD + .2, rD + PASSAGE])]);
  for (let r = Math.ceil(C2.r0 * 2) / 2; r < R_CEIL; r += .5) radii.add(r);
  const profile = [...radii].filter((r) => r >= C2.r0 && r <= R_CEIL).sort((a, b) => a - b).map((r) => [r, soff(r)]);
  const soffitHoles = UPPER_VOMS.flatMap(([deg, rF, rD]) => [[deg, OUT, rF, rD + .2], [deg, DOOR_HW + .04, rD + .2, rD + PASSAGE]]);
  const soffitMesh = new THREE.Mesh(soffit(profile, soffitHoles), ceilingLit);
  soffitMesh.name = 'Concourse soffit';
  soffitMesh.userData.noCollide = true;
  root.add(soffitMesh);
  // the beams under the rake, every 2.5 degrees, clear of the vomitories
  const near = (deg, list, half) => list.some((v) => Math.abs(((deg - (v[0] ?? v) + 540) % 360) - 180) * GYM_RAD * 52 < half);
  const ribPts = [...profile.map(([r, y]) => [r, y + .05]), ...profile.map(([r, y]) => [r, y - .38]).reverse()];
  for (let i = 0; i < 144; i++) {
    const deg = 1.25 + i * 2.5;
    if (near(deg, UPPER_VOMS, OUT + .4) || near(deg, LOWER_VOMS, OUT + .4)) continue;
    prism(W.rib, deg, 0, ribPts, .3);
  }

  const meshes = [
    mesh(root, W.white, white, 'Vomitory walls'),
    mesh(root, W.lit, lit, 'Concourse walls'),
    mesh(root, W.floor, floorLit, 'Concourse floors'),
    mesh(root, W.ceiling, ceilingLit, 'Concourse ceilings', false),
    mesh(root, W.rib, ribLit, 'Concourse soffit beams', false),
    mesh(root, W.tread, concrete, 'Vomitory floors and stairs'),
    soffitMesh,
  ];
  // the rails and posts, as thin tubes
  if (W.rail.length) {
    const up = V3(0, 1, 0), mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    const tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.03, .03, 1, 8), rail, W.rail.length);
    W.rail.forEach(([a, b], i) => {
      const d = b.clone().sub(a), len = d.length();
      q.setFromUnitVectors(up, d.normalize());
      tubes.setMatrixAt(i, mtx.compose(a.clone().lerp(b, .5), q, V3(1, len, 1)));
    });
    tubes.userData.noCollide = true;
    tubes.name = 'Bowl rails';
    root.add(tubes);
  }
  // the fittings: square downlights between the beams on the soffit, a ring
  // of them in the flat ceiling
  const spots = [];
  for (let i = 0; i < 144; i++) {
    const deg = i * 2.5;
    if (near(deg, UPPER_VOMS, OUT + .3)) continue;
    for (const r of [52.2, 55.4]) spots.push([deg, r, soff(r) - .03]);
  }
  for (let i = 0; i < 120; i++) spots.push([i * 3 + 1.5, (R_CEIL + C2.r1) / 2, C2.ceil - .03]);
  const fit = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .04, .32), new THREE.MeshBasicMaterial({ color: KELVIN(5200).multiplyScalar(2.2) }), spots.length);
  const mtx = new THREE.Matrix4(), rot = new THREE.Quaternion(), one = V3(1, 1, 1);
  spots.forEach(([deg, r, y], n) => {
    const [ux, uz] = gymPoint(deg, 1), k = y < C2.ceil - .1 ? (soff(r + .1) - soff(r - .1)) / .2 : 0;
    rot.setFromUnitVectors(V3(0, 1, 0), V3(-k * ux, 1, -k * uz).normalize());
    const [x, z] = gymPoint(deg, r);
    fit.setMatrixAt(n, mtx.compose(V3(x, y, z), rot, one));
  });
  fit.userData.noCollide = true;
  fit.name = 'Concourse fittings';
  root.add(fit);
  // The concourse lit as the other rooms' are (stands.js roomLights): dark
  // from the bowl, its lights coming up once someone steps into it (the
  // ring, a tunnel or a passage) and going down again when they leave.
  const zones = [
    { r0: C2.r0 - .2, r1: C2.r1, y0: C2.y - .3, y1: C2.ceil },
    ...LOWER_VOMS.map((deg) => ({ deg, hw: PIT_HW, r0: L_MOUTH, r1: C2.r0, y0: C2.y - .3, y1: L_ROOF + 1 })),
    ...UPPER_VOMS.map(([deg, rF, rD]) => ({ deg, hw: DOOR_HW, r0: rD, r1: rD + PASSAGE, y0: C2.y - .3, y1: rakeAt(rF) + 1.2 })),
  ];
  const inside = ({ x, y, z }) => zones.some((q) => {
    if (y < q.y0 || y > q.y1) return false;
    if (q.deg === undefined) { const r = Math.hypot(x, z); return r > q.r0 && r < q.r1; }
    return within(q.deg, x, z, q.hw, q.r0, q.r1);
  });
  const glow = [lit, floorLit, ceilingLit, ribLit].map((m) => [m, m.emissiveIntensity]);
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
