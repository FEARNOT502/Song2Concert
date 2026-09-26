// ─────────────────────────────────────────────────────────────────────────────
// stands built from a venue's own seating plan
//
// The data (generated offline from the official seat maps, one file per venue)
// gives each level's rows as tread outlines with their heights — straight down
// the sides, fanning round the corners, curving round the ends, exactly where
// the building has them — and every seat on them. Round that: the half steps
// up each aisle, the mouths of the tunnels the crowd comes in by, the walls
// with the doors (扉) in them, the rails where a stand drops away, the
// concourse floors behind and under the stands, and the stairs between them.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, V3, concreteTex, prng, std, withRepeat } from './core.js';

// A stadium seat, folded up: the shell's back and its seat pan as thin plates
// (seen from a stand away, that is all a seat is), eight triangles.
export function stadiumSeatGeometry() {
  const P = [], N = [];
  const quad = (a, b, c, d, n) => { for (const v of [a, b, c, a, c, d]) P.push(...v); for (let i = 0; i < 6; i++) N.push(...n); };
  const w = 0.22;
  // the back: leaning back, 0.45–0.85 m up
  quad([-w, 0.45, -0.16], [w, 0.45, -0.16], [w, 0.86, -0.24], [-w, 0.86, -0.24], [0, 0.2, 0.98]);
  quad([-w, 0.86, -0.24], [w, 0.86, -0.24], [w, 0.86, -0.28], [-w, 0.86, -0.28], [0, 1, 0]);
  // the pan, folded up against it, and its front edge
  quad([-w, 0.42, -0.1], [w, 0.42, -0.1], [w, 0.7, -0.14], [-w, 0.7, -0.14], [0, 0.15, 0.99]);
  quad([-w, 0.42, -0.1], [w, 0.42, -0.1], [w, 0.42, -0.16], [-w, 0.42, -0.16], [0, -1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}

// seats come packed: little-endian int16 quads (x dm, z dm, row, yaw°), base64
export function decodeSeats(b64) {
  if (Array.isArray(b64)) return b64;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export function buildStands(data, {
  offset = V3(0, 0, 0), stage = V3(0, 2, 0), seatColors = {}, seatColor = 0x22262e,
  concreteTone = 0.22, sold = () => true, occupancy = 0.97, seed = 5, roofY = 36, crowd = true,
  materials = {}, seatMesh = null,
}) {
  const g = new THREE.Group();
  const ox = offset.x, oz = offset.z;
  const rnd = prng(seed);
  const conc = withRepeat(concreteTex({ key: `standconc${concreteTone}`, tone: concreteTone }), 1 / 3, 1 / 3);
  // a venue can dress it in its own materials (a hall's carpet and timber)
  const structMat = materials.struct ?? std({ ...conc, color: 0xffffff, roughness: 0.95 });
  const floorMat = materials.floor ?? std({ color: 0x3a3b3e, roughness: 0.9 });
  const wallMat = materials.wall ?? std({ color: 0x2a2b30, roughness: 0.85, side: THREE.DoubleSide });
  const railMat = materials.rail ?? std({ color: 0x15161a, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });

  // a prism: an outline (with holes) standing from y0 to y1
  const shapeOf = (polys) => {
    const s = new THREE.Shape(polys[0].map(([x, z]) => new THREE.Vector2(x + ox, -(z + oz))));
    for (const h of polys.slice(1)) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x + ox, -(z + oz)))));
    return s;
  };
  const prism = (polys, y0, y1, out) => {
    if (y1 - y0 < 0.01) return;
    const geo = new THREE.ExtrudeGeometry(shapeOf(polys), { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y0, 0);
    out.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const flat = (polys, y, out) => {
    const geo = new THREE.ShapeGeometry(shapeOf(polys), 1);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    out.push(geo.index ? geo.toNonIndexed() : geo);
  };
  // thin vertical panels, merged: rails, walls, tunnel sides
  const panels = { rail: [[], []], wall: [[], []] };
  const panel = (kind, x0, z0, x1, z1, y0, y1) => {
    const [p, n] = panels[kind];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;            // the triangles' own facing, so both sides light true
    const a = [x0 + ox, z0 + oz], b = [x1 + ox, z1 + oz];
    for (const [x, y, z] of [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]]) { p.push(x, y, z); n.push(nx, 0, nz); }
  };
  const mkPanels = ([p, n]) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); return geo; };

  const people = [], aisleLights = [], seatSpots = [];
  const solid = [], floors = [];
  for (const L of data.levels) {
    const levelGeo = [];
    for (const row of L.rows) for (const polys of row.polys) prism(polys, row.y0, row.y, levelGeo);
    // the half steps up the aisles
    for (const st of L.steps) {
      prism(st.polys, st.y0, st.y, levelGeo);
      const c = st.polys[0].reduce((a, [x, z]) => [a[0] + x, a[1] + z], [0, 0]).map((v) => v / st.polys[0].length);
      aisleLights.push({ x: c[0] + ox, y: st.y0 + 0.04, z: c[1] + oz });
    }
    // tunnel mouths: a floor, and walls up past the treads round them, left
    // open where the rows above leave headroom (the way through to the concourse)
    for (const h of L.holes) {
      flat([h.ring], h.floor, floors);
      const n = h.ring.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (h.open[i] && h.open[j]) continue;
        const [x0, z0] = h.ring[i], [x1, z1] = h.ring[j];
        panel('wall', x0, z0, x1, z1, h.floor, Math.max(h.tops[i], h.tops[j]) + 0.95);
      }
    }
    for (const [x0, z0, x1, z1, y0, y1] of L.rails) panel('rail', x0, z0, x1, z1, y0, y1);
    for (const [x0, z0, x1, z1, y0, y1] of L.walls) panel('wall', x0, z0, x1, z1, y0, y1);
    const mesh = new THREE.Mesh(mergeGeometries(levelGeo), structMat);
    mesh.receiveShadow = true;
    g.add(mesh);
    // the seats, and the crowd in the sold ones
    const col = seatColors[L.name] ?? seatColor;
    const spots = [];
    const S = decodeSeats(L.seats);
    for (let i = 0; i < S.length; i += 4) {
      const x = S[i] / 10 + ox, z = S[i + 1] / 10 + oz, yaw = S[i + 3] * DEG;
      const y = L.hs ? L.hs[Math.min(S[i + 2], L.hs.length - 1)] : L.h0 + L.rise * S[i + 2];
      spots.push({ x, y, z, yaw });
      if (crowd && sold(x, z, L.name) && rnd() < occupancy) {
        people.push({ x: x - Math.sin(yaw) * 0.12, y, z: z - Math.cos(yaw) * 0.12, turn: Math.atan2(stage.x - x, stage.z - z) });
      }
    }
    seatSpots.push({ spots, col });
  }
  // concourses
  for (const f of data.floors) for (const polys of f.polys) {
    if (f.y0 <= 0.01) prism(polys, 0, f.y, solid);
    else { prism(polys, f.y0, f.y, solid); }
  }
  // stairs between them: a solid flight with a rail each side
  for (const f of data.flights) {
    const { x, z, dx, dz, n, L, y0, y1 } = f;
    const run = L / n, w = f.w ?? 1.6;
    for (let i = 0; i < n; i++) {
      const b = new THREE.BoxGeometry(w, y0 + (y1 - y0) * (i + 1) / n - y0 + 0.01, run + 0.02);
      b.rotateY(Math.atan2(dx, dz));
      const cx = x + dx * run * (i + 0.5), cz = z + dz * run * (i + 0.5);
      b.translate(cx + ox, (y0 + (y0 + (y1 - y0) * (i + 1) / n)) / 2, cz + oz);
      solid.push(b.toNonIndexed());
    }
    for (const s of [-1, 1]) {
      const px = -dz * s * (w / 2 + 0.02), pz = dx * s * (w / 2 + 0.02);
      panel('rail', x + px, z + pz, x + dx * L + px, z + dz * L + pz, y0, y1 + 1.0);
    }
  }
  if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid), structMat); m.receiveShadow = true; g.add(m); }
  if (floors.length) g.add(new THREE.Mesh(mergeGeometries(floors), floorMat));
  // the building's outer wall, up to the roof
  for (const polys of data.outer) {
    const ring = polys[0];
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
      panel('wall', x0, z0, x1, z1, 0, roofY);
    }
  }
  if (panels.wall[0].length) g.add(new THREE.Mesh(mkPanels(panels.wall), wallMat));
  if (panels.rail[0].length) g.add(new THREE.Mesh(mkPanels(panels.rail), railMat));
  // seats: instanced per colour, or handed to the venue's own seat
  if (seatMesh) {
    g.add(seatMesh(seatSpots.flatMap(({ spots }) => spots.map((sp) => ({ x: sp.x, y: sp.y, z: sp.z, turn: sp.yaw })))));
    return { group: g, people, aisleLights };
  }
  const seatGeo = stadiumSeatGeometry();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (const { spots, col } of seatSpots) {
    const inst = new THREE.InstancedMesh(seatGeo, std({ color: col, roughness: 0.55, side: THREE.DoubleSide }), spots.length);
    spots.forEach((s, i) => { q.setFromAxisAngle(V3(0, 1, 0), s.yaw); m4.compose(V3(s.x, s.y, s.z), q, V3(1, 1, 1)); inst.setMatrixAt(i, m4); });
    inst.receiveShadow = true;
    g.add(inst);
  }
  return { group: g, people, aisleLights };
}
