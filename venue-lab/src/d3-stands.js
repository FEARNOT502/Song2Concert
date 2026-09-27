// ─────────────────────────────────────────────────────────────────────────────
// stands built from a venue's own seating plan
//
// The data (generated offline from the official seat maps, one file per venue)
// gives each level's rows as tread outlines with their heights — straight down
// the sides, fanning round the corners, curving round the ends, exactly where
// the building has them — and every seat on them. Round that: the half steps
// up each aisle, the mouths of the tunnels the crowd comes in by, the walls
// with the doors (扉) in them, the rails where a stand drops away, the
// concourse floors behind and under the stands, and the stairs between them;
// and the concourses closed in — ceilings, walls with the doors in them, and
// lights — so that inside them it is a lit corridor, not a gap onto the night.
// ─────────────────────────────────────────────────────────────────────────────

// A stadium seat, folded up: the shell's back and its seat pan as thin plates
// (seen from a stand away, that is all a seat is), eight triangles.
function stadiumSeatGeometry() {
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
function decodeSeats(b64) {
  if (Array.isArray(b64)) return b64;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// The finishes inside: pale walls and ceilings and a floor that read as lit
// under the concourse lights whatever the show is doing out in the bowl.
function roomMaterials(materials) {
  return {
    inMat: materials.interior ?? std({ color: 0xc9c2b4, roughness: 0.92, emissive: 0x7a7366, emissiveIntensity: 0.5 }),
    ceilMat: materials.ceiling ?? std({ color: 0xd8d4cc, roughness: 0.9, emissive: 0x8a857c, emissiveIntensity: 0.55 }),
    floorLit: std({ color: 0x86817a, roughness: 0.7, emissive: 0x5b564e, emissiveIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    // the sides of a tunnel mouth: lit from the concourse behind, less so out in the bowl
    mouthMat: std({ color: 0xa9a297, roughness: 0.9, emissive: 0x5a554c, emissiveIntensity: 0.4, side: THREE.DoubleSide }),
    mouthFloor: std({ color: 0x77726b, roughness: 0.75, emissive: 0x3e3a35, emissiveIntensity: 0.45 }),
    stairMat: materials.stair ?? std({ color: 0xa8a298, roughness: 0.85, emissive: 0x5e594f, emissiveIntensity: 0.5 }),
    lampMat: glowMat(0xfff0da, 1.7, { side: THREE.DoubleSide }),
  };
}

// The name over a vomitory's mouth: white on a dark plate, lit.
function vomSignTexture(label, bg = '#15181f', fg = '#f2f2ee') {
  const key = `vomsign:${label}:${bg}:${fg}`;
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${label.length > 4 ? 44 : 58}px "Inter Tight", Arial, sans-serif`;
  g.fillText(label, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true;
  TEX.set(key, t);
  return t;
}

// A vomitory as its own solid: a straight pit through the rows too low to
// walk under, walled either side up past the treads beside it (the walls sit
// inside the pit, so the treads' own sides are behind them, never in the same
// plane), a tunnel on under the rows above to the concourse, walled, ceiled
// and lit from within, and the section's name over the mouth.
function vomParts(v, ox, oz) {
  const [ux, uz] = v.u, vx = -uz, vz = ux;
  const yaw = Math.atan2(ux, uz);
  const at = (t, s) => [v.p[0] + ox + ux * t + vx * s, v.p[1] + oz + uz * t + vz * s];
  const box = (t0, t1, s0, s1, y0, y1) => {
    if (t1 - t0 < 0.01 || y1 - y0 < 0.01) return null;
    const g = new THREE.BoxGeometry(Math.abs(s1 - s0), y1 - y0, t1 - t0);
    g.rotateY(yaw);
    const [x, z] = at((t0 + t1) / 2, (s0 + s1) / 2);
    g.translate(x, (y0 + y1) / 2, z);
    return g.toNonIndexed();
  };
  const T = 0.22, hw = v.w / 2, PAR = 1.0;
  const pit = [], cap = [], tunnel = [], floor = [], ceil = [], lamps = [], signs = [];
  for (const [sg, t0, t1, top] of v.sides) {
    const s0 = sg * (hw - T), s1 = sg * hw;
    pit.push(box(t0, t1, s0, s1, v.y, top + PAR));
    cap.push(box(t0, t1, s0 - sg * 0.03, s1 + sg * 0.03, top + PAR, top + PAR + 0.06));
  }
  // a guard across the front where the rows in front fall away
  if (v.front != null && v.front < v.y - 0.3) pit.push(box(-T, 0, -hw, hw, v.front, v.y + PAR));
  floor.push(box(0, v.L + v.T, -hw, hw, v.y - 0.12, v.y + 0.005));
  if (v.T > 0 && v.roof != null) {
    for (const sg of [-1, 1]) tunnel.push(box(v.L, v.L + v.T, sg * (hw - T), sg * hw, v.y, v.roof));
    ceil.push(box(v.L, v.L + v.T, -hw + T, hw - T, v.roof - 0.05, v.roof - 0.01));
    for (let t = v.L + 1.2; t < v.L + v.T - 0.6; t += 3) {
      const [x, z] = at(t, 0);
      lamps.push([x, v.roof - 0.06, z, yaw]);
    }
    if (v.label) {
      const [x, z] = at(v.L - 0.03, 0);
      signs.push({ x, y: v.roof + 0.32, z, yaw: yaw + Math.PI, w: Math.min(1.6, v.w - 0.3), label: v.label });
    }
  }
  const clean = (a) => a.filter(Boolean);
  return { pit: clean(pit), cap: clean(cap), tunnel: clean(tunnel), floor: clean(floor), ceil: clean(ceil), lamps, signs };
}

// The concourse lights are on for whoever is in there: seen from the bowl —
// a seat, the floor, the stage — the doors and tunnel mouths stay dark, as
// they read in a show; step into a concourse, a tunnel or onto its stairs and
// they come up. `update(f)` follows the camera and fades between the two.
function roomLights(data, { ox, oz, lit }) {
  const R = data.rooms;
  const zones = [];
  const add = (polys, y0, y1) => {
    const rings = polys.map((r) => r.map(([x, z]) => [x + ox, z + oz]));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    zones.push({ rings, x0, x1, z0, z1, y0, y1 });
  };
  for (const f of R.lit) for (const polys of f.polys) add(polys, f.y + 0.2, f.y + 4.6);
  for (const L of data.levels) for (const h of L.holes) add([h.ring], h.floor + 0.2, h.floor + 5.5);
  for (const L of data.levels) for (const v of L.voms || []) {
    const [ux, uz] = v.u, vx = -uz, vz = ux, hw = v.w / 2, t1 = v.L + v.T + 0.5;
    add([[[0, -hw], [t1, -hw], [t1, hw], [0, hw]].map(([t, s]) => [v.p[0] + ux * t + vx * s, v.p[1] + uz * t + vz * s])], v.y - 0.3, v.y + 3.2);
  }
  for (const f of data.flights) {
    const w = (f.w ?? 1.6) / 2 + 0.4, ux = f.dx, uz = f.dz, vx = -uz, vz = ux;
    const c = [[-0.8, -w], [f.L + 0.8, -w], [f.L + 0.8, w], [-0.8, w]].map(([a, b]) => [f.x + ux * a + vx * b, f.z + uz * a + vz * b]);
    add([c], f.y0 + 0.2, f.y1 + 2.4);
  }
  const inRing = (r, x, z) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const inside = ({ x, y, z }) => zones.some((q) => y > q.y0 && y < q.y1 && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1
    && inRing(q.rings[0], x, z) && !q.rings.slice(1).some((h) => inRing(h, x, z)));
  const mats = ['inMat', 'ceilMat', 'floorLit', 'mouthMat', 'mouthFloor', 'stairMat'].map((k) => [lit[k], lit[k].emissiveIntensity]);
  const lamp = lit.lampMat.color.clone();
  let k = -1;
  const set = (v) => {
    k = v;
    for (const [m, e] of mats) m.emissiveIntensity = e * v;
    lit.lampMat.color.copy(lamp).multiplyScalar(v);
  };
  set(0);
  return {
    update(f) {
      if (!f.cam) return;
      const want = inside(f.cam) ? 1 : 0;
      if (want === k) return;
      const step = Math.min(1, (f.dt ?? 1 / 60) * 5);
      set(Math.abs(want - k) < 0.02 ? want : k + (want - k) * step);
    },
  };
}

// The concourses and the tunnels to them, closed in and lit: the walls round
// them (pale and lit on the inside, the building's own on the outside), the
// ceilings, the underside of the stands over them lined, the floors under the
// lights, and the lights themselves in lines along the way.
function buildRooms(R, { ox, oz, shapeOf, structMat, wallMat, lit: M }) {
  const g = new THREE.Group();
  const { inMat, ceilMat, floorLit } = M;
  const outMat = wallMat.clone(); outMat.side = THREE.FrontSide;
  // walls: the front of each faces the room
  const inP = [], inN = [], outP = [], outN = [];
  const quad = (P, N, x0, z0, x1, z1, y0, y1) => {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y0, z0], [x1, y1, z1], [x0, y1, z0]]) { P.push(x + ox, y, z + oz); N.push(nx, 0, nz); }
  };
  for (const [x0, z0, x1, z1, y0, y1] of R.walls) {
    quad(inP, inN, x0, z0, x1, z1, y0, y1);
    quad(outP, outN, x1, z1, x0, z0, y0, y1);
  }
  const mk = (P, N) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return geo; };
  if (inP.length) { g.add(new THREE.Mesh(mk(inP, inN), inMat)); g.add(new THREE.Mesh(mk(outP, outN), outMat)); }
  // horizontal sheets, facing up or down
  const sheet = (polys, y, down) => {
    const geo = new THREE.ShapeGeometry(shapeOf(polys), 1);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    const f = geo.index ? geo.toNonIndexed() : geo;
    if (down) {
      const p = f.attributes.position.array, n = f.attributes.normal.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      for (let i = 1; i < n.length; i += 3) n[i] = -1;
    }
    return f;
  };
  const under = [], over = [], litF = [];
  for (const c of R.ceils) for (const polys of c.polys) { under.push(sheet(polys, c.y, true)); over.push(sheet(polys, c.y + 0.02, false)); }
  for (const s of R.soffits) for (const polys of s.polys) under.push(sheet(polys, s.y, true));
  for (const f of R.lit) for (const polys of f.polys) litF.push(sheet(polys, f.y + 0.012, false));
  if (under.length) { const m = new THREE.Mesh(mergeGeometries(under), ceilMat); m.userData.noCollide = true; g.add(m); }
  if (over.length) { const m = new THREE.Mesh(mergeGeometries(over), structMat); m.userData.noCollide = true; g.add(m); }
  if (litF.length) { const m = new THREE.Mesh(mergeGeometries(litF), floorLit); m.receiveShadow = true; g.add(m); }
  // the lights: long fittings, along the way
  if (R.lamps.length) {
    const P = [], N = [];
    for (const [x, y, z, yaw] of R.lamps) {
      const ux = Math.cos(yaw), uz = -Math.sin(yaw);       // along the corridor
      const vx = Math.sin(yaw), vz = Math.cos(yaw);        // across it
      const a = 0.9, b = 0.14;
      const c = [[-a, -b], [a, -b], [a, b], [-a, b]].map(([s, t]) => [x + ox + ux * s + vx * t, z + oz + uz * s + vz * t]);
      for (const k of [0, 2, 1, 0, 3, 2]) { P.push(c[k][0], y, c[k][1]); N.push(0, -1, 0); }
    }
    const m = new THREE.Mesh(mk(P, N), M.lampMat);
    m.userData.noCollide = true;
    g.add(m);
  }
  return g;
}

function buildStands(data, {
  offset = V3(0, 0, 0), stage = V3(0, 2, 0), seatColors = {}, seatColor = 0x22262e,
  concreteTone = 0.22, sold = () => true, occupancy = 0.97, seed = 5, roofY = 36, crowd = true,
  materials = {}, seatMesh = null, seatColorAt = null,
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
  // where the concourses are closed in, they and the ways to them are lit
  const lit = data.rooms ? roomMaterials(materials) : null;

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
  const panels = { rail: [[], []], wall: [[], []], mouth: [[], []] };
  const panel = (kind, x0, z0, x1, z1, y0, y1) => {
    const [p, n] = panels[kind];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;            // the triangles' own facing, so both sides light true
    const a = [x0 + ox, z0 + oz], b = [x1 + ox, z1 + oz];
    for (const [x, y, z] of [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]]) { p.push(x, y, z); n.push(nx, 0, nz); }
  };
  const mkPanels = ([p, n]) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); return geo; };

  const people = [], aisleLights = [], seatSpots = [];
  const solid = [], floors = [], stairs = [], mouthFloors = [];
  const voms = { pit: [], cap: [], tunnel: [], floor: [], ceil: [], lamps: [], signs: [] };
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
      flat([h.ring], h.floor, lit ? mouthFloors : floors);
      const n = h.ring.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (h.open[i] && h.open[j]) continue;
        const [x0, z0] = h.ring[i], [x1, z1] = h.ring[j];
        panel(lit ? 'mouth' : 'wall', x0, z0, x1, z1, h.floor, Math.max(h.tops[i], h.tops[j]) + 0.95);
      }
    }
    for (const v of L.voms || []) {
      const p = vomParts(v, ox, oz);
      voms.pit.push(...p.pit); voms.cap.push(...p.cap); voms.tunnel.push(...p.tunnel);
      voms.floor.push(...p.floor); voms.ceil.push(...p.ceil); voms.lamps.push(...p.lamps); voms.signs.push(...p.signs);
    }
    for (const [x0, z0, x1, z1, y0, y1] of L.rails) panel('rail', x0, z0, x1, z1, y0, y1);
    for (const [x0, z0, x1, z1, y0, y1] of L.walls) panel('wall', x0, z0, x1, z1, y0, y1);
    const mesh = new THREE.Mesh(mergeGeometries(levelGeo), structMat);
    mesh.receiveShadow = true;
    g.add(mesh);
    // the seats, and the crowd in the sold ones
    const col = seatColors[L.name] ?? seatColor;
    const spots = [], odd = new Map();
    const S = decodeSeats(L.seats);
    for (let i = 0; i < S.length; i += 4) {
      const x = S[i] / 10 + ox, z = S[i + 1] / 10 + oz, yaw = S[i + 3] * DEG;
      const y = L.hs ? L.hs[Math.min(S[i + 2], L.hs.length - 1)] : L.h0 + L.rise * S[i + 2];
      // a venue can pick out a row in another colour
      const c = seatColorAt ? seatColorAt(L.name, x - ox, z - oz, S[i + 2]) : null;
      if (c != null && c !== col) { if (!odd.has(c)) odd.set(c, []); odd.get(c).push({ x, y, z, yaw }); }
      else spots.push({ x, y, z, yaw });
      if (crowd && sold(x, z, L.name) && rnd() < occupancy) {
        people.push({ x: x - Math.sin(yaw) * 0.12, y, z: z - Math.cos(yaw) * 0.12, turn: Math.atan2(stage.x - x, stage.z - z) });
      }
    }
    seatSpots.push({ spots, col });
    for (const [c, sp] of odd) seatSpots.push({ spots: sp, col: c });
  }
  // concourses
  for (const f of data.floors) for (const polys of f.polys) {
    if (f.y0 <= 0.01) prism(polys, 0, f.y, solid);
    else { prism(polys, f.y0, f.y, solid); }
  }
  // stairs between them: a solid flight with a rail each side
  const openRails = [];
  for (const f of data.flights) {
    const { x, z, dx, dz, n, L, y0, y1 } = f;
    const run = L / n, w = f.w ?? 1.6;
    for (let i = 0; i < n; i++) {
      const b = new THREE.BoxGeometry(w, y0 + (y1 - y0) * (i + 1) / n - y0 + 0.01, run + 0.02);
      b.rotateY(Math.atan2(dx, dz));
      const cx = x + dx * run * (i + 0.5), cz = z + dz * run * (i + 0.5);
      b.translate(cx + ox, (y0 + (y0 + (y1 - y0) * (i + 1) / n)) / 2, cz + oz);
      (f.open ? solid : stairs).push(b.toNonIndexed());
    }
    for (const s of [-1, 1]) {
      const px = -dz * s * (w / 2 + 0.02), pz = dx * s * (w / 2 + 0.02);
      if (!f.open) { panel('rail', x + px, z + pz, x + dx * L + px, z + dz * L + pz, y0, y1 + 1.0); continue; }
      // out in the open (not in a concourse): a handrail up the slope
      const len = Math.hypot(L, y1 - y0), g = new THREE.BoxGeometry(0.05, 0.05, len);
      g.rotateX(-Math.atan2(y1 - y0, L)); g.rotateY(Math.atan2(dx, dz));
      g.translate(x + dx * L / 2 + px + ox, (y0 + y1) / 2 + 0.95, z + dz * L / 2 + pz + oz); openRails.push(g);
    }
  }
  if (openRails.length) g.add(new THREE.Mesh(mergeGeometries(openRails), std({ color: 0xa8acb2, roughness: 0.4, metalness: 0.7 })));
  if (solid.length) { const m = new THREE.Mesh(mergeGeometries(solid), structMat); m.receiveShadow = true; g.add(m); }
  // the stairs stand in the lit concourses: lit with them
  if (stairs.length) { const m = new THREE.Mesh(mergeGeometries(stairs), lit ? lit.stairMat : structMat); m.receiveShadow = true; g.add(m); }
  if (mouthFloors.length) g.add(new THREE.Mesh(mergeGeometries(mouthFloors), lit.mouthFloor));
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
  if (panels.mouth[0].length) g.add(new THREE.Mesh(mkPanels(panels.mouth), lit.mouthMat));
  if (data.rooms) g.add(buildRooms(data.rooms, { ox, oz, shapeOf, structMat, wallMat, lit }));
  // the vomitories
  const addMerged = (list, mat, collide = true) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.receiveShadow = true; if (!collide) m.userData.noCollide = true;
    g.add(m);
  };
  addMerged(voms.pit, materials.vom ?? structMat);
  addMerged(voms.cap, railMat);
  addMerged(voms.tunnel, lit ? lit.mouthMat : wallMat);
  addMerged(voms.floor, lit ? lit.mouthFloor : floorMat);
  addMerged(voms.ceil, lit ? lit.ceilMat : structMat, false);
  if (voms.lamps.length && lit) {
    const P = [], N = [];
    for (const [x, y, z, yaw] of voms.lamps) {
      const ux = Math.sin(yaw), uz = Math.cos(yaw), vx = -uz, vz = ux;
      const c = [[-0.8, -0.1], [0.8, -0.1], [0.8, 0.1], [-0.8, 0.1]].map(([s, t]) => [x + ux * s + vx * t, z + uz * s + vz * t]);
      for (const k of [0, 2, 1, 0, 3, 2]) { P.push(c[k][0], y, c[k][1]); N.push(0, -1, 0); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    const m = new THREE.Mesh(geo, lit.lampMat); m.userData.noCollide = true; g.add(m);
  }
  for (const s of voms.signs) {
    const geo = new THREE.PlaneGeometry(s.w, 0.42);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: vomSignTexture(s.label, materials.signBg, materials.signFg), color: 0xd8d8d8 }));
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.yaw; m.userData.noCollide = true;
    g.add(m);
  }
  // seats: instanced per colour, or handed to the venue's own seat
  const lights = lit ? roomLights(data, { ox, oz, lit }) : null;
  const update = (f) => lights?.update(f);
  // the top of whatever stands at (x, z): a row's tread or a concourse floor
  const tops = [];
  const addTop = (polys, y) => {
    const ring = polys[0].map(([x, z]) => [x + ox, z + oz]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    tops.push({ ring, holes: polys.slice(1).map((h) => h.map(([x, z]) => [x + ox, z + oz])), y, x0, x1, z0, z1 });
  };
  for (const L of data.levels) for (const row of L.rows) for (const polys of row.polys) addTop(polys, row.y);
  for (const f of data.floors) for (const polys of f.polys) addTop(polys, f.y);
  const inRing = (r, x, z) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i], [xj, zj] = r[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const topAt = (x, z) => {
    let y = 0;
    for (const t of tops) {
      if (t.y <= y || x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1) continue;
      if (inRing(t.ring, x, z) && !t.holes.some((h) => inRing(h, x, z))) y = t.y;
    }
    return y;
  };
  if (seatMesh) {
    g.add(seatMesh(seatSpots.flatMap(({ spots }) => spots.map((sp) => ({ x: sp.x, y: sp.y, z: sp.z, turn: sp.yaw })))));
    return { group: g, people, aisleLights, update, topAt };
  }
  const seatGeo = stadiumSeatGeometry();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (const { spots, col } of seatSpots) {
    const inst = new THREE.InstancedMesh(seatGeo, std({ color: col, roughness: 0.55, side: THREE.DoubleSide }), spots.length);
    spots.forEach((s, i) => { q.setFromAxisAngle(V3(0, 1, 0), s.yaw); m4.compose(V3(s.x, s.y, s.z), q, V3(1, 1, 1)); inst.setMatrixAt(i, m4); });
    inst.receiveShadow = true;
    g.add(inst);
  }
  return { group: g, people, aisleLights, update, topAt };
}
