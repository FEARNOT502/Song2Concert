import * as THREE from 'three';
import { TD_STANDS } from './td-data.js';

const HOME_Z = 114;
const BOX_WIDTH = 2.5;
const CABINET_DEPTH = 1.105;
const GENERAL_LEVELS = new Set(['A', 'B', 'F', 'D', 'E']);
const byRow = (s) => `${s.level}:${s.block}:${s.row}`;
const angle = (s) => Math.abs(Math.atan2(s.x, HOME_Z - s.z));

function groupSeats(seats, keyOf) {
  const groups = new Map();
  for (const seat of seats) {
    const key = keyOf(seat);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(seat);
  }
  return groups;
}

function terraceFloor(level, y, x, z, fx, fz) {
  const spans = [];
  for (const row of level.rows) {
    if (Math.abs(row.y - y) > .001) continue;
    for (const polygon of row.polys) {
      const crossings = [];
      for (const ring of polygon) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [ax, az] = ring[j], [bx, bz] = ring[i];
          const a = (ax - x) * fz - (az + HOME_Z - z) * fx;
          const b = (bx - x) * fz - (bz + HOME_Z - z) * fx;
          if ((a > 0) !== (b > 0)) {
            const t = a / (a - b);
            crossings.push((ax + (bx - ax) * t - x) * fx + (az + (bz - az) * t + HOME_Z - z) * fz);
          }
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 1; i < crossings.length; i += 2) {
        if (crossings[i - 1] <= 0 && crossings[i] >= 0) spans.push([crossings[i - 1], crossings[i]]);
      }
    }
  }
  return spans.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
}

function terraceLayout(seats) {
  const level = TD_STANDS.levels.find((l) => l.name === 'D');
  const labels = new Map(TD_STANDS.boxRows.filter((r) => r.kind === 'terrace').map((r) => [byRow(r), r]));
  const rows = groupSeats(seats.filter((s) => labels.has(byRow(s))), byRow);
  const fitted = [], retained = [];
  for (const [key, raw] of rows) {
    // Split by the chart's group size. The gap between adjacent groups can be
    // shorter than one metre in the existing app model.
    const sorted = [...raw].sort((a, b) => a.num - b.num);
    const per = labels.get(key).per;
    const groups = [];
    for (let i = 0; i < sorted.length; i += per) {
      const group = sorted.slice(i, i + per);
      if (group.length !== 4) break;
      const a = group[0], b = group.at(-1);
      const yaw = Math.atan2(group.reduce((sum, s) => sum + Math.sin(s.yaw), 0), group.reduce((sum, s) => sum + Math.cos(s.yaw), 0));
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const limits = Array.from({ length: 21 }, (_, j) => {
        const u = BOX_WIDTH * (j / 20 - .5);
        return terraceFloor(level, a.y, x + u * fz, z - u * fx, fx, fz);
      });
      if (limits.some((l) => !l)) break;
      const rear = Math.max(...limits.map((l) => l[0])) + .008;
      const front = Math.min(...limits.map((l) => l[1])) - .008;
      const depth = Math.min(CABINET_DEPTH, front - rear);
      if (depth < 1.00) break;
      groups.push({ x, y: a.y, z, yaw: Math.atan2(fx, fz), fx, fz, rear, depth });
    }
    if (groups.length * per !== sorted.length || groups.some((g, i) =>
      i && Math.hypot(g.x - groups[i - 1].x, g.z - groups[i - 1].z) < BOX_WIDTH)) {
      retained.push(key);
    } else {
      fitted.push({ key, groups });
    }
  }
  return { fitted, retained };
}

function pitchScales(seats, width) {
  const result = new Map();
  for (const row of groupSeats(seats, byRow).values()) {
    row.sort((a, b) => a.num - b.num);
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1], b = row[i];
      if (b.num !== a.num + 1) continue;
      const scale = Math.max(.70, (Math.hypot(b.x - a.x, b.z - a.z) - .012) / width);
      for (const s of [a, b]) result.set(s, Math.min(scale, result.get(s) ?? 1));
    }
  }
  return result;
}

export function buildDomeSeatMeshes({ general, far, balcony, bench, cabinet }, seats) {
  const { fitted, retained } = terraceLayout(seats);
  const boxRows = new Set(TD_STANDS.boxRows.map(byRow));
  const placedRows = new Set(fitted.map((r) => r.key));
  const loungeLimits = new Map([-1, 1].map((side) => {
    const angles = seats.filter((s) => s.level === 'C' && Math.sign(s.x) === side).map(angle).sort((a, b) => b - a);
    return [side, angles[Math.floor(angles.length * 284 / 1804)]];
  }));
  const generalSeats = [], balconySeats = [], replaced = new Set();
  for (const s of seats) {
    const row = byRow(s);
    if (placedRows.has(row)) replaced.add(s);
    else if (GENERAL_LEVELS.has(s.level) && !boxRows.has(row)) {
      generalSeats.push(s);
      replaced.add(s);
    } else if (s.level === 'C' && angle(s) < loungeLimits.get(Math.sign(s.x))) {
      balconySeats.push(s);
      replaced.add(s);
    }
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const group = new THREE.Group();
  group.name = 'Tokyo Dome GLB seating';
  function batch(part, items, scales) {
    const ins = new THREE.InstancedMesh(part.geometry, part.material, items.length);
    items.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw);
      m.compose(position.set(s.x, s.y, s.z), q, scale.set(scales?.get(s) ?? 1, 1, s.depthScale ?? 1));
      ins.setMatrixAt(i, m);
    });
    ins.instanceMatrix.needsUpdate = true;
    ins.userData.noCollide = true;
    ins.receiveShadow = true;
    ins.computeBoundingSphere();
    return ins;
  }

  const standScales = pitchScales(generalSeats, .420);
  for (const seats of groupSeats(generalSeats, (s) => `${s.level}:${Math.floor(s.x / 10)}:${Math.floor(s.z / 10)}`).values()) {
    const lod = new THREE.LOD();
    const origin = new THREE.Vector3(seats[0].x, seats[0].y, seats[0].z);
    lod.position.copy(origin);
    const near = batch(general, seats, standScales), distant = batch(far, seats, standScales);
    near.position.copy(origin).negate();
    distant.position.copy(origin).negate();
    lod.addLevel(near, 0);
    lod.addLevel(distant, 27, .1);
    group.add(lod);
  }
  group.add(batch(balcony, balconySeats, pitchScales(balconySeats, .502)));
  const boxes = fitted.flatMap((row) => row.groups);
  if (boxes.length) {
    const move = (b, offset, depthScale) => ({ ...b, x: b.x + b.fx * offset, z: b.z + b.fz * offset, depthScale });
    // Keep the bench at its official size. Only the outer shell can shorten
    // slightly to meet the original concrete tread.
    group.add(batch(bench, boxes.map((b) => move(b, b.rear + .505))));
    group.add(batch(cabinet, boxes.map((b) => move(b, b.rear + .505 * b.depth / CABINET_DEPTH, b.depth / CABINET_DEPTH))));
  }
  group.userData.seatCounts = {
    general: generalSeats.length, balcony: balconySeats.length, boxes: boxes.length,
    fitted: [...placedRows], retained,
  };
  return { group, replaced, placedRows };
}
