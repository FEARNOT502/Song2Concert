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
    inMat: materials.interior ?? std({ color: 0x8f8a80, roughness: 0.92, emissive: 0x8a8376, emissiveIntensity: 0.6 }),
    ceilMat: materials.ceiling ?? std({ color: 0xd8d4cc, roughness: 0.9, emissive: 0x8a857c, emissiveIntensity: 0.55 }),
    floorLit: std({ color: 0x86817a, roughness: 0.7, emissive: 0x5b564e, emissiveIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    // the sides of a tunnel mouth: lit from the concourse behind, less so out in the bowl
    mouthMat: std({ color: 0xa9a297, roughness: 0.9, emissive: 0x5a554c, emissiveIntensity: 0.4, side: THREE.DoubleSide }),
    mouthFloor: std({ color: 0x77726b, roughness: 0.75, emissive: 0x3e3a35, emissiveIntensity: 0.45 }),
    stairMat: materials.stair ?? std({ color: 0xa8a298, roughness: 0.85, emissive: 0x5e594f, emissiveIntensity: 0.5 }),
    lampMat: glowMat(0xfff0da, 1.7, { side: THREE.DoubleSide }),
  };
}

// The building's aisle signs (Tokyo Dome's hang black over each portal: the
// number large, 通路 AISLE under it): one plate drawn in the cell (x, y, w, h).
function drawAisleSign(g, x, y, w, h, label, bg, fg) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${Math.round(h * 0.54)}px "Inter Tight", Arial, sans-serif`;
  g.fillText(label, x + w / 2, y + h * 0.4);
  g.font = `500 ${Math.round(h * 0.17)}px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, "Inter Tight", Arial, sans-serif`;
  g.fillText('通路 AISLE', x + w / 2, y + h * 0.83);
}

// The name over a vomitory's mouth: white on a dark plate, lit (`aisle`: a
// number, in the style of the building's aisle signs).
function vomSignTexture(label, bg = '#15181f', fg = '#f2f2ee', aisle = false) {
  const key = `vomsign:${label}:${bg}:${fg}:${aisle}`;
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  if (aisle) drawAisleSign(g, 0, 0, 256, 96, label, bg, fg);
  else {
    g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${label.length > 4 ? 44 : 58}px "Inter Tight", Arial, sans-serif`;
    g.fillText(label, 128, 50);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true;
  TEX.set(key, t);
  return t;
}

// The aisle numbers (data.signs: {x, y, z, yaw, w, label}, a plate facing (sin yaw,
// cos yaw); with `r` it is bent round a pillar of that radius about (x, z), w the
// arc's length), every plate of them on one sheet and in one mesh.
function signSheet(list, ox, oz, bg = '#15181f', fg = '#f2f2ee') {
  const labels = [...new Set(list.map((s) => s.label))];
  const cols = 8, cw = 256, ch = 96, rows = Math.ceil(labels.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
  const g2 = c.getContext('2d');
  g2.fillStyle = bg; g2.fillRect(0, 0, c.width, c.height);
  labels.forEach((label, i) => drawAisleSign(g2, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, label, bg, fg));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const P = [], U = [];
  for (const s of list) {
    const i = labels.indexOf(s.label);
    const u0 = ((i % cols) * cw) / c.width, u1 = u0 + cw / c.width;
    const v1 = 1 - (Math.floor(i / cols) * ch) / c.height, v0 = v1 - ch / c.height;
    const hh = (s.w * ch / cw) / 2;
    if (s.r) {
      // round a pillar: a strip of segments along the arc (the angle runs the way the plate's u does, to the right of a viewer facing it)
      const seg = 10, rs = s.r + 0.012, span = s.w / s.r;
      for (let k = 0; k < seg; k++) {
        const t0 = k / seg, t1 = (k + 1) / seg, a0 = s.yaw + (t0 - 0.5) * span, a1 = s.yaw + (t1 - 0.5) * span;
        const p0 = [s.x + ox + rs * Math.sin(a0), s.z + oz + rs * Math.cos(a0)], p1 = [s.x + ox + rs * Math.sin(a1), s.z + oz + rs * Math.cos(a1)];
        const ua = u0 + (u1 - u0) * t0, ub = u0 + (u1 - u0) * t1;
        const q = [[p0[0], s.y - hh, p0[1], ua, v0], [p1[0], s.y - hh, p1[1], ub, v0], [p1[0], s.y + hh, p1[1], ub, v1], [p0[0], s.y + hh, p0[1], ua, v1]];
        for (const j of [0, 1, 2, 0, 2, 3]) { P.push(q[j][0], q[j][1], q[j][2]); U.push(q[j][3], q[j][4]); }
      }
      continue;
    }
    const rx = Math.cos(s.yaw) * s.w / 2, rz = -Math.sin(s.yaw) * s.w / 2;
    const x = s.x + ox, z = s.z + oz;
    const q = [[x - rx, s.y - hh, z - rz, u0, v0], [x + rx, s.y - hh, z + rz, u1, v0], [x + rx, s.y + hh, z + rz, u1, v1], [x - rx, s.y + hh, z - rz, u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { P.push(q[k][0], q[k][1], q[k][2]); U.push(q[k][3], q[k][4]); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d8d8 }));
  m.userData.noCollide = true;
  return m;
}

// The columns at the heads of the 1st floor's aisles (data.pillars: {x, z, r, y0, y1}):
// round, in one mesh.
function pillars(list, ox, oz, mat) {
  const parts = list.map((p) => {
    const g = new THREE.CylinderGeometry(p.r, p.r, p.y1 - p.y0, 24, 1, false);
    g.translate(p.x + ox, (p.y0 + p.y1) / 2, p.z + oz);
    return g.toNonIndexed();
  });
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.receiveShadow = true;
  return m;
}

// The doors' frames (data.frames: {x, z, yaw, w, h, y}): a post each side and a lintel across, as deep as the
// wall is thick; the frame faces (sin yaw, cos yaw), `w` the opening, `h` its height over the floor `y`.
function doorFrames(list, ox, oz, mat) {
  const parts = [];
  const T = 0.16, D = 0.34;
  for (const f of list) {
    const box = (bw, bh, bd, lx, ly) => {
      const b = new THREE.BoxGeometry(bw, bh, bd);
      b.translate(lx, ly, 0); b.rotateY(f.yaw); b.translate(f.x + ox, 0, f.z + oz);
      parts.push(b.toNonIndexed());
    };
    for (const s of [-1, 1]) box(T, f.h + 0.2, D, s * (f.w / 2 + T / 2), f.y + (f.h + 0.2) / 2);
    box(f.w + 2 * T, 0.2, D, 0, f.y + f.h + 0.1);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.receiveShadow = true;
  return m;
}

// A vomitory as its own solid: a straight pit through the rows too low to
// walk under, walled either side up past the treads beside it (each wall one
// solid, its top raked with the rows, capped; the walls sit inside the pit, so
// the treads' own sides are behind them, never in the same plane), the mouth
// framed (a post each side, a lintel over it, as deep as the walls are thick),
// a tunnel on under the rows above to the concourse, ceiled and lit from
// within, and the section's name over the mouth.
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
  // a wall along the pit, a profile (t, y) of its own extruded across s0..s1
  const wall = (pts, s0, s1) => {
    if (pts.length < 3) return null;
    const ex = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([t, y]) => new THREE.Vector2(t, y))), { depth: s1 - s0, bevelEnabled: false });
    const [x, z] = at(0, s0);
    ex.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(vx, 0, vz)).setPosition(x, 0, z));
    return ex.toNonIndexed();
  };
  const T = 0.35, hw = v.w / 2, PAR = 1.0;
  const pit = [], cap = [], tunnel = [], floor = [], ceil = [], lamps = [], signs = [];
  for (const sg of [-1, 1]) {
    // the rows' treads beside the pit, the wall's top a rail's height over each, raked from one row's middle to the next's
    const rows = v.sides.filter((sd) => sd[0] === sg).sort((p, q) => p[1] - q[1]);
    if (!rows.length) continue;
    const top = rows.map(([, t0, t1, h]) => [(t0 + t1) / 2, h + PAR]);
    const prof = [[rows[0][1], top[0][1]], ...top, [rows[rows.length - 1][2], top[top.length - 1][1]]];
    // only where the wall stands up over the pit's floor
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const lo = v.y, t0 = run[0][0], t1 = run[run.length - 1][0];
        const s0 = sg * (hw - T), s1 = sg * hw, a = Math.min(s0, s1), b = Math.max(s0, s1);
        pit.push(wall([[t0, lo], [t1, lo], ...run.slice().reverse().map(([t, y]) => [t, y])], a, b));
        cap.push(wall([...run.map(([t, y]) => [t, y]), ...run.slice().reverse().map(([t, y]) => [t, y + 0.06])], a - 0.03, b + 0.03));
      }
      run = [];
    };
    for (let i = 0; i < prof.length; i++) {
      if (prof[i][1] - v.y > 0.02) run.push(prof[i]);
      else flush();
    }
    flush();
  }
  // a guard across the front where the rows in front fall away
  if (v.front != null && v.front < v.y - 0.3) pit.push(box(-T, 0, -hw, hw, v.front, v.y + PAR));
  // where the rows at the mouth stand well below the concourse, steps up
  // inside the pit to its floor
  const mouth = Math.min(...v.sides.filter((sd) => sd[1] < 0.3).map((sd) => sd[3])) - 0.17;
  let t0f = 0;
  if (Number.isFinite(mouth) && v.y - mouth > 0.5) {
    const n = Math.ceil((v.y - mouth) / 0.18), rise = (v.y - mouth) / n;
    for (let i = 0; i < n; i++) floor.push(box(i * 0.3, (i + 1) * 0.3, -hw + T, hw - T, mouth - 0.3, mouth + rise * (i + 1)));
    t0f = n * 0.3;
  }
  floor.push(box(t0f, v.L + v.T, -hw, hw, v.y - 0.12, v.y + 0.005));
  if (v.T > 0 && v.roof != null) {
    // the mouth's frame: posts as thick as the pit's walls, a lintel between them, deep enough to read as the wall's thickness
    const D = Math.max(v.T, 0.6);
    for (const sg of [-1, 1]) tunnel.push(box(v.L, v.L + D, sg * (hw - T), sg * hw, v.y, v.roof + 0.45));
    tunnel.push(box(v.L, v.L + D, -hw, hw, v.roof, v.roof + 0.45));
    // a tunnel to a concourse not drawn here ends at its doors
    if (v.end) tunnel.push(box(v.L + v.T - T, v.L + v.T, -hw, hw, v.y, v.roof));
    ceil.push(box(v.L, v.L + D, -hw + T, hw - T, v.roof - 0.05, v.roof - 0.01));
    for (let t = v.L + 1.2; t < v.L + v.T - 0.6; t += 3) {
      const [x, z] = at(t, 0);
      lamps.push([x, v.roof - 0.06, z, yaw]);
    }
    if (v.label) {
      const [x, z] = at(v.L - 0.03, 0);
      const w = Math.min(1.6, v.w - 0.3);
      signs.push({ x, y: v.roof + 0.32, z, yaw: yaw + Math.PI, w, ...(v.sign != null ? { h: w * 0.375, aisle: true } : {}), label: v.sign ?? v.label });
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
  const inZones = (list, { x, y, z }) => list.some((q) => y > q.y0 && y < q.y1 && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1
    && inRing(q.rings[0], x, z) && !q.rings.slice(1).some((h) => inRing(h, x, z)));
  // while the show runs ('공연 중', house 0) the concourses stay dark: the lights come up only for someone who has stepped
  // in at an entrance, between the wall's line and a couple of metres past the pillar
  const showZones = (data.pillars || []).map((p) => {
    const ax = p.ax ?? 0, az = p.az ?? 1, vx = -az, vz = ax;
    const ring = [[-1.8, -2.4], [2.8, -2.4], [2.8, 2.4], [-1.8, 2.4]].map(([a, b]) => [p.x + ox + ax * a + vx * b, p.z + oz + az * a + vz * b]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { rings: [ring], x0, x1, z0, z1, y0: p.y0 + 0.2, y1: p.y1 + 0.2 };
  });
  const inside = (c, house) => inZones(house < 0.5 && showZones.length ? showZones : zones, c);
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
      const want = inside(f.cam, f.house ?? 1) ? 1 : 0;
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
// Rails and walls come from a raster's outline: along a slanted or curved
// edge they run as a staircase, long runs joined by jogs a cell long, each
// jog a panel of its own facing another way. Join the segments that meet end
// to end at the same heights into runs, and draw each run again within
// `tol` of it (Douglas-Peucker), so a straight edge is one panel and a
// curve a chain of chords, with no jog left in it.
function smoothRuns(segs, tol = 0.14) {
  const key = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
  const hk = (s) => `${Math.round(s[4] * 50)},${Math.round(s[5] * 50)}`;
  const from = new Map(), to = new Map();
  segs.forEach((s, i) => { from.set(`${hk(s)}|${key(s[0], s[1])}`, i); to.set(`${hk(s)}|${key(s[2], s[3])}`, i); });
  const used = new Uint8Array(segs.length), out = [];
  const dp = (P) => {
    if (P.length < 3) return P;
    const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
    const st = [[0, P.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); const [ax, az] = P[a], [bx, bz] = P[b];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1e-9;
      let m = -1, md = tol;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i][0] - ax) * dz - (P[i][1] - az) * dx) / l; if (d > md) { md = d; m = i; } }
      if (m >= 0) { keep[m] = 1; st.push([a, m], [m, b]); }
    }
    return P.filter((_, i) => keep[i]);
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    // walk back to the start of this run, then forward along it
    let s0 = i, guard = 0;
    while (guard++ < segs.length) { const j = to.get(`${hk(segs[s0])}|${key(segs[s0][0], segs[s0][1])}`); if (j === undefined || used[j] || j === i) break; s0 = j; if (s0 === i) break; }
    const P = [[segs[s0][0], segs[s0][1]]]; let c = s0; const h = [segs[s0][4], segs[s0][5]];
    while (c !== undefined && !used[c]) {
      used[c] = 1; P.push([segs[c][2], segs[c][3]]);
      c = from.get(`${hk(segs[c])}|${key(segs[c][2], segs[c][3])}`);
    }
    const Q = dp(P);
    for (let k = 0; k + 1 < Q.length; k++) out.push([Q[k][0], Q[k][1], Q[k + 1][0], Q[k + 1][1], h[0], h[1]]);
  }
  return out;
}

// A stand's rails climb its raked edges row by row: one flat piece per row,
// each a step up from the last — a staircase along what is one sloping
// rail. Chain the pieces that meet end to end (a step of a row or two
// between them), give each point along the chain its own height, and draw
// the chain again as straight sloping runs: [x0, z0, x1, z1, bottom0, top0,
// bottom1, top1] each.
function slopedRuns(segs, { step = 0.75, tol = 0.14, ytol = 0.12 } = {}) {
  const key = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
  const from = new Map(), to = new Map();
  segs.forEach((s, i) => {
    const kf = key(s[0], s[1]), kt = key(s[2], s[3]);
    if (!from.has(kf)) from.set(kf, []); from.get(kf).push(i);
    if (!to.has(kt)) to.set(kt, []); to.get(kt).push(i);
  });
  // pieces at one height chain round any bend; pieces a step apart only
  // straight on (a raked edge), not round a notch
  const near = (a, b) => {
    const same = Math.abs(a[4] - b[4]) < 1e-3 && Math.abs(a[5] - b[5]) < 1e-3;
    if (same) return true;
    if (Math.abs(a[4] - b[4]) > step || Math.abs(a[5] - b[5]) > step) return false;
    const ax = a[2] - a[0], az = a[3] - a[1], bx = b[2] - b[0], bz = b[3] - b[1];
    return (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1) > 0.9;
  };
  const used = new Uint8Array(segs.length), out = [];
  const nextOf = (i) => (from.get(key(segs[i][2], segs[i][3])) || []).find((j) => !used[j] && near(segs[i], segs[j]));
  const prevOf = (i) => (to.get(key(segs[i][0], segs[i][1])) || []).find((j) => !used[j] && near(segs[i], segs[j]));
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    let s0 = i, g = 0;
    while (g++ < segs.length) { const j = prevOf(s0); if (j === undefined || j === i) break; used[s0] = 1; s0 = j; }
    for (let k = 0; k < segs.length; k++) if (used[k] === 1 && k !== i) { /* reset the walk-back marks */ }
    // walk forward from the chain's start
    const chain = []; let c = s0; const seen = new Set();
    used[s0] = 0;
    while (c !== undefined && !seen.has(c)) { seen.add(c); used[c] = 2; chain.push(segs[c]); c = nextOf(c); }
    // points with heights: each segment's middle carries its own; the
    // chain's ends and joints take their neighbours'
    const P = [[chain[0][0], chain[0][1]]];
    let L = 0; const T = [0], Y = [];
    for (const sg of chain) { L += Math.hypot(sg[2] - sg[0], sg[3] - sg[1]); P.push([sg[2], sg[3]]); T.push(L); }
    const flat = chain.every((sg) => Math.abs(sg[4] - chain[0][4]) < 1e-3 && Math.abs(sg[5] - chain[0][5]) < 1e-3);
    // heights at the segments' middles, eased along the chain
    const mids = chain.map((sg, k) => [(T[k] + T[k + 1]) / 2, sg[4], sg[5]]);
    const at = (t) => {
      if (flat || mids.length === 1) return [chain[0][4], chain[0][5]];
      if (t <= mids[0][0]) return [mids[0][1], mids[0][2]];
      if (t >= mids[mids.length - 1][0]) return [mids[mids.length - 1][1], mids[mids.length - 1][2]];
      let k = 0; while (mids[k + 1][0] < t) k++;
      const f = (t - mids[k][0]) / (mids[k + 1][0] - mids[k][0] || 1);
      return [mids[k][1] + (mids[k + 1][1] - mids[k][1]) * f, mids[k][2] + (mids[k + 1][2] - mids[k][2]) * f];
    };
    for (const t of T) Y.push(at(t));
    // Douglas-Peucker over plan and height together
    const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
    const st = [[0, P.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let m = -1, md = 0;
      for (let j = a + 1; j < b; j++) {
        const f = (T[j] - T[a]) / (T[b] - T[a] || 1);
        const px = P[a][0] + (P[b][0] - P[a][0]) * f, pz = P[a][1] + (P[b][1] - P[a][1]) * f;
        const dxy = Math.hypot(P[j][0] - px, P[j][1] - pz) / tol;
        const dy = Math.abs(Y[j][1] - (Y[a][1] + (Y[b][1] - Y[a][1]) * f)) / ytol;
        const dd = Math.max(dxy, dy);
        if (dd > 1 && dd > md) { md = dd; m = j; }
      }
      if (m >= 0) { keep[m] = 1; st.push([a, m], [m, b]); }
    }
    const idx = []; for (let j = 0; j < P.length; j++) if (keep[j]) idx.push(j);
    for (let k = 0; k + 1 < idx.length; k++) {
      const a = idx[k], b = idx[k + 1];
      out.push([P[a][0], P[a][1], P[b][0], P[b][1], Y[a][0], Y[a][1], Y[b][0], Y[b][1]]);
    }
  }
  return out;
}

// A closed outline traced off a raster (a building's outer wall) carries the
// raster's jitter: smooth it along its length (a Gaussian over `sig` metres,
// resampled every 0.5 m) and draw it again within `tol` of the smoothed line.
function smoothRing(ring, { sig = 2.5, tol = 0.08 } = {}) {
  const n = ring.length;
  if (n < 8) return ring;
  const T = [0];
  for (let i = 0; i < n; i++) { const [a, b] = [ring[i], ring[(i + 1) % n]]; T.push(T[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = T[n], m = Math.max(16, Math.round(L / 0.5)), P = [];
  let k = 0;
  for (let j = 0; j < m; j++) {
    const t = (j / m) * L; while (T[k + 1] < t) k++;
    const f = (t - T[k]) / (T[k + 1] - T[k] || 1), a = ring[k], b = ring[(k + 1) % n];
    P.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  const h = Math.max(1, Math.round((sig / 0.5) * 3)), w = [];
  for (let d = -h; d <= h; d++) w.push(Math.exp(-0.5 * (d * 0.5 / sig) ** 2));
  const ws = w.reduce((a, b) => a + b, 0);
  const S = P.map((_, j) => { let x = 0, z = 0; for (let d = -h; d <= h; d++) { const q = P[(j + d + m) % m]; x += q[0] * w[d + h]; z += q[1] * w[d + h]; } return [x / ws, z / ws]; });
  // Douglas-Peucker, closed: split at the two farthest-apart points
  const dp = (Q) => {
    const keep = new Uint8Array(Q.length); keep[0] = keep[Q.length - 1] = 1; const st = [[0, Q.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); const [ax, az] = Q[a], [bx, bz] = Q[b]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1e-9;
      let mi = -1, md = tol;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((Q[i][0] - ax) * dz - (Q[i][1] - az) * dx) / l; if (d > md) { md = d; mi = i; } }
      if (mi >= 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return Q.filter((_, i) => keep[i]);
  };
  const half = Math.floor(m / 2);
  const A = dp(S.slice(0, half + 1)), B = dp(S.slice(half).concat([S[0]]));
  return A.slice(0, -1).concat(B.slice(0, -1));
}

// A partition with thickness: the panel [x0, z0, x1, z1, ya0, ya1, yb0, yb1] (its bottom and top at each end)
// as a solid box `T` thick towards its right (running x0,z0 -> x1,z1), a face each side, the top and the two ends
// (every face its own flat normal).
function thickPanel(P, N, [x0, z0, x1, z1, ya0, ya1, yb0, yb1], T) {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
  const nx = (dz / l) * T, nz = (-dx / l) * T;
  const a0 = [x0, ya0, z0], a1 = [x0, ya1, z0], b0 = [x1, yb0, z1], b1 = [x1, yb1, z1];
  const o = (v) => [v[0] + nx, v[1], v[2] + nz];
  const quad = (p, q, r, s_) => {
    // flat normal facing away from the box's middle (the outer face's normal is the panel's right, the inner its left)
    const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [s_[0] - p[0], s_[1] - p[1], s_[2] - p[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = [(p[0] + r[0]) / 2 - (x0 + x1 + nx) / 2, (p[1] + r[1]) / 2 - (ya0 + ya1 + yb0 + yb1) / 4, (p[2] + r[2]) / 2 - (z0 + z1 + nz) / 2];
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) { n = n.map((v) => -v); [q, s_] = [s_, q]; }
    const m = Math.hypot(...n) || 1;
    for (const v of [p, q, r, p, r, s_]) { P.push(...v); N.push(n[0] / m, n[1] / m, n[2] / m); }
  };
  quad(a0, b0, b1, a1);                              // the face towards the pit
  quad(o(a0), o(b0), o(b1), o(a1));                  // the outer face
  quad(a1, b1, o(b1), o(a1));                        // the top
  quad(a0, a1, o(a1), o(a0));                        // the ends
  quad(b0, b1, o(b1), o(b0));
}

// Thin vertical panels laid end to end (a rail, a wall round a curve) each
// carry their own facing; where two meet at a gentle bend they share one, so
// the run shades as one smooth surface rather than a row of facets.
function weldNormals(P, N, crease = 35) {
  const c = Math.cos(crease * DEG), groups = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const k = `${Math.round(P[i] * 50)},${Math.round(P[i + 1] * 50)},${Math.round(P[i + 2] * 50)}`;
    let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(i);
  }
  const out = N.slice();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    for (const i of idx) {
      let x = 0, z = 0;
      for (const j of idx) if (N[i] * N[j] + N[i + 2] * N[j + 2] > c) { x += N[j]; z += N[j + 2]; }
      const l = Math.hypot(x, z) || 1; out[i] = x / l; out[i + 2] = z / l;
    }
  }
  return out;
}

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
  for (const [x0, z0, x1, z1, y0, y1] of smoothRuns(R.walls, 0.1)) {
    quad(inP, inN, x0, z0, x1, z1, y0, y1);
    quad(outP, outN, x1, z1, x0, z0, y0, y1);
  }
  const mk = (P, N) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N.length === P.length && N !== P ? weldNormals(P, N) : N, 3)); return geo; };
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

// Tunnels at floor level out under a stand (a stadium's corner tunnels, an
// arena floor's corner passages): an open cut through the rows too low to
// pass under, walled either side a rail's height above the rows beside it,
// then on under the rows above, walled, roofed and lit; closed at its end
// by doors when it leads to rooms not drawn here.
function buildTunnels(data, ox, oz) {
  const g = new THREE.Group();
  const tunnelGeo = { wall: [], floor: [], lamp: [] };
  const h1 = data.levels[0].h0;
  for (const t of data.tunnels || []) {
    const [ux, uz] = t.u, vx = -uz, vz = ux, yaw = Math.atan2(ux, uz);
    const at = (a, b) => [t.p[0] + ox + ux * a + vx * b, t.p[1] + oz + uz * a + vz * b];
    const box = (out, a0, a1, b0, b1, y0, y1) => {
      const bx = new THREE.BoxGeometry(Math.abs(b1 - b0), y1 - y0, a1 - a0);
      bx.rotateY(yaw); const [x, z] = at((a0 + a1) / 2, (b0 + b1) / 2); bx.translate(x, (y0 + y1) / 2, z); out.push(bx.toNonIndexed());
    };
    // a wall along the cut, its top raked with the rows: (a, y) extruded across
    const raked = (s0, s1, pts) => {
      const ex = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a_, y]) => new THREE.Vector2(a_, y))), { depth: s1 - s0, bevelEnabled: false });
      const [ox_, oz_] = at(0, s0);
      ex.applyMatrix4(new THREE.Matrix4().makeBasis(V3(ux, 0, uz), V3(0, 1, 0), V3(vx, 0, vz)).setPosition(ox_, 0, oz_));
      tunnelGeo.wall.push(ex.toNonIndexed());
    };
    const hw = t.w / 2, T = 0.3;
    if (t.covered) {
      // covered from its mouth: the same wall either side, the whole way, a
      // flat roof under the deck and the rows over it
      for (const sg of [-1, 1]) box(tunnelGeo.wall, -0.3, t.L, sg > 0 ? hw - T : -hw - 0.12, sg > 0 ? hw + 0.12 : -hw + T, 0, t.h + 0.02);
      box(tunnelGeo.wall, -0.3, t.L, -hw - 0.12, hw + 0.12, t.h - 0.02, t.h + 0.12);
    } else {
      // the cut's side walls: a rail's height over the rows beside them
      const cut = (prof) => (prof?.length > 1
        ? [[prof[0][0], 0], [prof[prof.length - 1][0], 0], ...prof.slice().reverse()]
        : [[-0.4, 0], [t.deck, 0], [t.deck, t.deckY + 1.0], [-0.4, h1 + 1.0]]);
      raked(hw - T, hw + 0.12, cut(t.sides?.[1])); raked(-hw - 0.12, -hw + T, cut(t.sides?.[0]));
      for (const sg of [-1, 1]) box(tunnelGeo.wall, t.deck, t.L, sg > 0 ? hw - T : -hw - 0.12, sg > 0 ? hw + 0.12 : -hw + T, 0, t.h + 0.02);
      box(tunnelGeo.wall, t.deck - 0.05, t.L, -hw, hw, t.h - 0.02, t.h + 0.12);      // the roof on under the rows
    }
    box(tunnelGeo.floor, -0.4, t.L + (t.closed ? 0 : 12), -hw - 0.3, hw + 0.3, -0.02, 0.04);
    if (t.closed) box(tunnelGeo.wall, t.L - 0.3, t.L, -hw, hw, 0, t.h);      // its doors, shut
    for (let a = (t.covered ? 1.0 : t.deck + 1.5); a < t.L; a += 6) box(tunnelGeo.lamp, a, a + 1.4, -0.12, 0.12, t.h - 0.08, t.h - 0.02);
  }
  if (tunnelGeo.wall.length) g.add(new THREE.Mesh(mergeGeometries(tunnelGeo.wall), std({ color: 0x4c4a47, roughness: 0.92 })));
  if (tunnelGeo.floor.length) g.add(new THREE.Mesh(mergeGeometries(tunnelGeo.floor), std({ color: 0x2c2c2e, roughness: 0.95 })));
  if (tunnelGeo.lamp.length) g.add(new THREE.Mesh(mergeGeometries(tunnelGeo.lamp), new THREE.MeshBasicMaterial({ color: 0xfff2dc })));
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
  // Its top and underside are the outline's triangulation; its sides a strip
  // round each ring, shaded smooth along a curve and sharp at a corner, the
  // texture running on unbroken along it (faces shaded one by one, the
  // texture starting afresh on each, show a curved front as a row of facets).
  const prism = (polys, y0, y1, out) => {
    if (y1 - y0 < 0.01) return;
    const cap = new THREE.ShapeGeometry(shapeOf(polys), 1);
    cap.rotateX(-Math.PI / 2);
    const top = cap.toNonIndexed(); top.translate(0, y1, 0);
    const bot = cap.toNonIndexed(); bot.translate(0, y0, 0);
    {
      const p = bot.attributes.position.array, n = bot.attributes.normal.array, u = bot.attributes.uv.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      for (let i = 0; i < u.length; i += 6) for (let k = 0; k < 2; k++) { const t = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = t; }
      for (let i = 1; i < n.length; i += 3) n[i] = -1;
    }
    out.push(top, bot);
    const P = [], N = [], U = [];
    const cosCrease = Math.cos(35 * DEG);
    polys.forEach((ring0, ri) => {
      let ring = ring0.map(([x, z]) => [x + ox, z + oz]);
      if (ring.length > 2 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1e-6) ring = ring.slice(0, -1);
      const n = ring.length;
      if (n < 3) return;
      let A = 0;
      for (let i = 0; i < n; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n]; A += x0 * z1 - x1 * z0; }
      // the side of each edge away from the solid: out of the outline, into a hole
      const sg = (ri === 0 ? 1 : -1) * (A > 0 ? 1 : -1);
      const en = [], el = [];
      for (let i = 0; i < n; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1e-9;
        en.push([sg * dz / l, -sg * dx / l]); el.push(l);
      }
      // each corner's normal from the ring's direction over a metre either
      // side of it (the traced outline wobbles by a few centimetres, which
      // shaded edge by edge shows as stripes); where the ring turns within
      // that metre, a corner, each face keeps its own side's direction
      const cum = [0]; for (let i = 0; i < n; i++) cum.push(cum[i] + el[i]);
      const per = cum[n];
      const at = (t) => {
        t = ((t % per) + per) % per;
        let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= t) lo = m; else hi = m; }
        const f = el[lo] > 0 ? (t - cum[lo]) / el[lo] : 0, [x0, z0] = ring[lo], [x1, z1] = ring[(lo + 1) % n];
        return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
      };
      const W = Math.min(1.0, per / 8);
      const nrm = (dx, dz) => { const l = Math.hypot(dx, dz) || 1e-9; return [sg * dz / l, -sg * dx / l]; };
      const vnB = [], vnA = [];
      for (let i = 0; i < n; i++) {
        const p = ring[i], a = at(cum[i] - W), b = at(cum[i] + W);
        const ta = [p[0] - a[0], p[1] - a[1]], tb = [b[0] - p[0], b[1] - p[1]];
        const la = Math.hypot(...ta) || 1e-9, lb = Math.hypot(...tb) || 1e-9;
        if ((ta[0] * tb[0] + ta[1] * tb[1]) / (la * lb) < cosCrease) { vnB.push(nrm(...ta)); vnA.push(nrm(...tb)); }
        else { const q = nrm(b[0] - a[0], b[1] - a[1]); vnB.push(q); vnA.push(q); }
      }
      // the face after corner i takes vnA[i]; the face before corner j, vnB[j]
      const vn = (i, e) => (e === i ? vnA[i] : vnB[i]);
      let s0 = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [ax, az] = ring[i], [bx, bz] = ring[j];
        const na = vn(i, i), nb = vn(j, i), s1 = s0 + el[i];
        const a0 = [ax, y0, az, na, s0], a1 = [ax, y1, az, na, s0], b0 = [bx, y0, bz, nb, s1], b1 = [bx, y1, bz, nb, s1];
        const tri = sg > 0 ? [a0, b1, b0, a0, a1, b1] : [a0, b0, b1, a0, b1, a1];
        for (const [x, y, z, nn, uu] of tri) { P.push(x, y, z); N.push(nn[0], 0, nn[1]); U.push(uu, y); }
        s0 = s1;
      }
    });
    if (P.length) {
      const side = new THREE.BufferGeometry();
      side.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      side.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      side.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      out.push(side);
    }
  };
  const flat = (polys, y, out) => {
    const geo = new THREE.ShapeGeometry(shapeOf(polys), 1);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    out.push(geo.index ? geo.toNonIndexed() : geo);
  };
  // thin vertical panels, merged: rails, walls, tunnel sides
  const panels = { rail: [[], []], wall: [[], []], mouth: [[], []], own: [[], []] };
  const panel4 = (kind, x0, z0, x1, z1, ya0, ya1, yb0, yb1) => {
    const [p, n] = panels[kind];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const a = [x0 + ox, z0 + oz], b = [x1 + ox, z1 + oz];
    for (const [x, y, z] of [[a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], ya0, a[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]]]) { p.push(x, y, z); n.push(nx, 0, nz); }
  };
  const panel = (kind, x0, z0, x1, z1, y0, y1) => {
    const [p, n] = panels[kind];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;            // the triangles' own facing, so both sides light true
    const a = [x0 + ox, z0 + oz], b = [x1 + ox, z1 + oz];
    for (const [x, y, z] of [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]]) { p.push(x, y, z); n.push(nx, 0, nz); }
  };
  const mkPanels = ([p, n]) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(weldNormals(p, n), 3)); return geo; };

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
    for (const l of L.name === 'B' ? data.gateLamps || [] : []) voms.lamps.push([l.x + ox, l.y, l.z + oz, l.yaw]);
    for (const v of L.voms || []) {
      const p = vomParts(v, ox, oz);
      voms.pit.push(...p.pit); voms.cap.push(...p.cap); voms.tunnel.push(...p.tunnel);
      voms.floor.push(...p.floor); voms.ceil.push(...p.ceil); voms.lamps.push(...p.lamps); voms.signs.push(...p.signs);
    }
    // a level can have its own front (a VIP balcony's dark mesh), and the
    // low partitions between its boxes
    const own = materials.levelRail?.[L.name];
    for (const [x0, z0, x1, z1, ya0, ya1, yb0, yb1] of slopedRuns(L.rails)) panel4(own ? 'own' : 'rail', x0, z0, x1, z1, ya0, ya1, yb0, yb1);
    if (own && panels.own[0].length) { g.add(new THREE.Mesh(mkPanels(panels.own), own)); panels.own = [[], []]; }
    // the partitions beside a gate's pit and its stairs' cuts: solid, `gateRailT` thick
    if (L.gateRails?.length) {
      const gp = [], gn = [];
      for (const r of slopedRuns(L.gateRails.map(([x0, z0, x1, z1, y0, y1]) => [x0 + ox, z0 + oz, x1 + ox, z1 + oz, y0, y1]))) thickPanel(gp, gn, r, L.gateRailT ?? 0.25);
      if (gp.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3));
        const m = new THREE.Mesh(geo, railMat); m.receiveShadow = true; g.add(m);
      }
    }
    if (L.partitions?.length) {
      const pp = [];
      for (const [x0, z0, x1, z1, y0, y1] of L.partitions) {
        const len = Math.hypot(x1 - x0, z1 - z0), b = new THREE.BoxGeometry(0.06, y1 - y0, len);
        b.rotateY(Math.atan2(x1 - x0, z1 - z0)); b.translate((x0 + x1) / 2 + ox, (y0 + y1) / 2, (z0 + z1) / 2 + oz); pp.push(b.toNonIndexed());
      }
      g.add(new THREE.Mesh(mergeGeometries(pp), materials.partition ?? std({ color: 0x1a1b1f, roughness: 0.6, metalness: 0.3 })));
    }
    for (const [x0, z0, x1, z1, y0, y1] of smoothRuns(L.walls)) panel('wall', x0, z0, x1, z1, y0, y1);
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
        people.push({ x: x - Math.sin(yaw) * 0.12, y, z: z - Math.cos(yaw) * 0.12, turn: Math.atan2(stage.x - x, stage.z - z), seat: true });
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
  // the building's outer wall, up to the roof (roofY a height, or the height
  // at a point of the stands' plan where the roof is not level)
  const roofAtXZ = typeof roofY === 'function' ? roofY : () => roofY;
  for (const polys of data.outer) {
    const ring = smoothRing(polys[0]);
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
      panel('wall', x0, z0, x1, z1, 0, roofAtXZ((x0 + x1) / 2, (z0 + z1) / 2));
    }
  }
  if (panels.wall[0].length) g.add(new THREE.Mesh(mkPanels(panels.wall), wallMat));
  if (panels.rail[0].length) g.add(new THREE.Mesh(mkPanels(panels.rail), railMat));
  if (panels.mouth[0].length) g.add(new THREE.Mesh(mkPanels(panels.mouth), lit.mouthMat));
  if (data.rooms) g.add(buildRooms(data.rooms, { ox, oz, shapeOf, structMat, wallMat, lit }));
  if (data.tunnels?.length) g.add(buildTunnels(data, ox, oz));
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
    const geo = new THREE.PlaneGeometry(s.w, s.h ?? 0.42);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: vomSignTexture(s.label, materials.signBg, materials.signFg, !!s.aisle), color: 0xd8d8d8 }));
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.yaw; m.userData.noCollide = true;
    g.add(m);
  }
  if (data.signs?.length) g.add(signSheet(data.signs, ox, oz, materials.signBg, materials.signFg));
  if (data.pillars?.length) g.add(pillars(data.pillars, ox, oz, lit ? lit.inMat : wallMat));
  if (data.frames?.length) g.add(doorFrames(data.frames, ox, oz, materials.doorFrame ?? std({ color: 0x1b1d22, roughness: 0.55, metalness: 0.35 })));
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
