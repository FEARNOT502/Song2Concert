// ─────────────────────────────────────────────────────────────────────────────
// INSPIRE — Inspire Arena, Incheon: a 15,000-seat arena, the stage at its
// north end in the T-stage set-up — the main stage, a runway down the middle
// of the floor and a round stage at its end — seen from FOH on a seated floor.
// Three tiers round a rectangular bowl: the 100s, a telescopic stand along
// the sides and across the south end that folds away under the 200s to make
// the floor bigger; the 200s all the way round; the 300s over them on the
// west, north and south, the boxes over the 200s on the east.
// ─────────────────────────────────────────────────────────────────────────────

function buildInspire(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const H = 31, DECK = 1.8, RIG = 20;
  const retract = !!ctx.retract;          // the 100s folded away
  const OZ = 36;                          // the floor's centre, in this room's coordinates
  const eye = V3(0, 1.6 + 0.9, 58);
  const SH = 5;                           // the stage brought 5 m out from the north end's 200s
  const STAGE = V3(0, DECK, 8 + SH);

  // ── the stands, as exact planes from the seating plan ──
  // The bowl is all straight sides and 45-degree corners, so every section is
  // a polygon of straight lines, every row as the ticketing lists it: the
  // 100s' fourteen rows, the 200s' eight (east), ten (west, south) and
  // thirteen (their corners, the north end), the 300s' eleven; the
  // concourses behind them closed in and lit, the 300s' tunnels red-walled.
  // Folded away, the 100s leave temporary stairs up to the 200s' front.
  const L2d = INSP_STANDS.levels.find((l) => l.name === '200');
  const B2 = L2d.h0, n2 = Math.ceil(B2 / 0.19), run = n2 * 0.28;
  // up to the aisles between the 200s' sections: two a side, two at the south end
  const temp = [[-33.9, -7.45, -1, 0], [-33.9, 6.2, -1, 0], [33.9, -7.4, 1, 0], [33.9, 6.2, 1, 0], [-6.9, 40.4, 0, 1], [9.3, 40.4, 0, 1]]
    .map(([x, z, dx, dz]) => ({ x: x - dx * run, z: z - dz * run, dx, dz, n: n2, L: run, y0: 0, y1: B2, w: 1.4 }));
  // the parapet along the 200s' front open where each lands
  const gapRails = (rails) => {
    let out = rails;
    for (const f of temp) {
      const tx = f.x + f.dx * f.L, tz = f.z + f.dz * f.L, next = [];
      for (const r of out) {
        const [x0, z0, x1, z1, y0, y1] = r, L = Math.hypot(x1 - x0, z1 - z0) || 1;
        const t = ((tx - x0) * (x1 - x0) + (tz - z0) * (z1 - z0)) / L, d = Math.abs((tx - x0) * (z1 - z0) - (tz - z0) * (x1 - x0)) / L;
        if (d > 1.0 || t < -0.8 || t > L + 0.8) { next.push(r); continue; }
        const g0 = t - 0.8, g1 = t + 0.8, at = (k) => [x0 + (x1 - x0) * k / L, z0 + (z1 - z0) * k / L];
        if (g0 > 0.05) next.push([x0, z0, ...at(g0), y0, y1]);
        if (g1 < L - 0.05) next.push([...at(g1), x1, z1, y0, y1]);
      }
      out = next;
    }
    return out;
  };
  const data = retract ? { ...INSP_STANDS,
    levels: INSP_STANDS.levels.filter((l) => l.name !== '100').map((l) => (l.name === '200' ? { ...l, rails: gapRails(l.rails) } : l)) } : INSP_STANDS;
  // the temporary stairs themselves: open steel flights with a handrail each side
  if (retract) {
    const steel = [], treads = [];
    for (const f of temp) {
      const yaw = Math.atan2(f.dx, f.dz), run = f.L / f.n;
      for (let i = 0; i < f.n; i++) {
        const b = new THREE.BoxGeometry(f.w, 0.05, run + 0.03); b.rotateY(yaw);
        b.translate(f.x + f.dx * run * (i + 0.5), f.y1 * (i + 1) / f.n - 0.025, f.z + f.dz * run * (i + 0.5) + OZ); treads.push(b);
      }
      for (const sd of [-1, 1]) {
        const px = -f.dz * sd * (f.w / 2 + 0.03), pz = f.dx * sd * (f.w / 2 + 0.03);
        const len = Math.hypot(f.L, f.y1), pitch = Math.atan2(f.y1, f.L);
        for (const [dy, th] of [[0, 0.28], [1.0, 0.05]]) {
          const g = new THREE.BoxGeometry(0.05, th, len); g.rotateX(-pitch); g.rotateY(yaw);
          g.translate(f.x + f.dx * f.L / 2 + px, f.y1 / 2 + dy - (dy ? 0 : 0.15), f.z + f.dz * f.L / 2 + pz + OZ); steel.push(g);
        }
        for (let t = 0; t <= f.L + 0.01; t += f.L / 3) {
          const h = f.y1 * t / f.L, g = new THREE.BoxGeometry(0.06, h + 1.0, 0.06);
          g.translate(f.x + f.dx * t + px, (h + 1.0) / 2, f.z + f.dz * t + pz + OZ); steel.push(g);
        }
      }
    }
    root.add(new THREE.Mesh(mergeGeometries(treads.map((g) => g.toNonIndexed())), std({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6 })));
    const rail = new THREE.Mesh(mergeGeometries(steel.map((g) => g.toNonIndexed())), std({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.7 }));
    root.add(rail);
  }
  const MZ = 1.6 + SH;                         // the masking beside and behind the stage
  const stands = buildStands(data, {
    offset: V3(0, 0, OZ), stage: STAGE, seed: 900, concreteTone: 0.2, roofY: H,
    seatColors: { 100: 0x1b2231, 200: 0x2c5a96, 300: 0x8e1b1d },
    // the east 200s' back row, under the boxes, is red
    seatColorAt: (name, x, z, row) => (name === '200' && x > 30 && Math.abs(z) < 24 && row === 7 ? 0x8e1b1d : null),
    materials: { vom: std({ color: 0xb8231c, roughness: 0.65 }) },
    crowd: !!q.crowd,
    // nobody behind the masking
    sold: (x, z) => z > MZ + 0.6,
  });
  root.add(stands.group);
  // folded away, each 100s section is a stack of benches against the 200s
  if (retract) {
    const parts = [];
    for (const polys of INSP_STANDS.stacks) {
      const s = new THREE.Shape(polys[0].map(([x, z]) => new THREE.Vector2(x, -(z + OZ))));
      const geo = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    }
    if (parts.length) root.add(new THREE.Mesh(mergeGeometries(parts), std({ color: 0x15171c, roughness: 0.7, metalness: 0.2 })));
  }
  // bands along straight runs, the lettering on them facing into the bowl
  const band = (segs, y0, h, mat, tile) => {
    const P = [], UV = [];
    for (const [a, b] of segs) {
      // the normal into the bowl; the ends ordered so the lettering reads
      // left to right from there; the band just proud of the face behind
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 0.05) continue;
      let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      if (nx * -mx + nz * -mz < 0) { nx = -nx; nz = -nz; }
      const [p0, p1] = ((b[0] - a[0]) * nz - (b[1] - a[1]) * nx) > 0 ? [a, b] : [b, a];
      const u1 = l / tile, o = 0.06;
      for (const [q, y, uu, v] of [[p0, y0, 0, 0], [p1, y0, u1, 0], [p1, y0 + h, u1, 1], [p0, y0, 0, 0], [p1, y0 + h, u1, 1], [p0, y0 + h, 0, 1]]) {
        P.push(q[0] + nx * o, y, q[1] + nz * o + OZ); UV.push(uu, v);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.userData.noCollide = true;
    return m;
  };
  const letters = (key, { bg, fg, grad }) => {
    if (TEX.has(key)) return TEX.get(key);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
    const g = c.getContext('2d');
    if (grad) { const lg = g.createLinearGradient(0, 0, 1024, 0); grad.forEach((col, i) => lg.addColorStop(i / (grad.length - 1), col)); g.fillStyle = lg; } else g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 64);
    g.fillStyle = fg; g.font = '600 34px "Helvetica Neue", Arial, sans-serif'; g.textBaseline = 'middle';
    for (const x of [96, 608]) { g.fillText('+ INSPIRE', x, 34); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    t.userData.shared = true; TEX.set(key, t);
    return t;
  };
  // the ribbon board: an LED band along the 300s' fronts, and on the east
  // along the front of the boxes
  const ribbonM = new THREE.MeshBasicMaterial({ map: letters('inspribbon', { fg: 'rgba(255,255,255,0.95)', grad: ['#7a1a8c', '#d0265a', '#e0305a', '#7a1a8c'] }), toneMapped: false, side: THREE.DoubleSide });
  root.add(band(INSP_STANDS.ribbon, INSP_STANDS.ribbonY, 0.85, ribbonM, 16));
  // the 200s' front: a dark parapet, the name printed on it
  root.add(band(INSP_STANDS.rim, INSP_STANDS.rimY + 0.02, 0.86, std({ map: letters('insprim', { bg: '#0d1733', fg: '#e8ecf4' }), roughness: 0.6, side: THREE.DoubleSide }), 14));
  // the boxes on the east, over the 200s: each a terrace stepping up in two
  // levels behind a glass balustrade to the box's glass front (curtained
  // black), white walls sloping down between one terrace and the next, the
  // soffit over them and the wall on up to the roof
  {
    const S = INSP_STANDS.sky, X = S.x, y = S.y, n = S.n, w = (S.z1 - S.z0) / n;
    const xg = X + S.terrace, xb = xg + S.box, yb = y + 0.45, top = yb + S.h;
    const conc = [], white = [], glass = [], curtain = [], rails = [];
    const box = (x0, x1, y0, y1, z0, z1, list) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2 + OZ); list.push(g); };
    box(X, X + 1.3, y - 1.6, y, S.z0, S.z1, conc);                // the lower terrace (the ribbon on its face)
    box(X + 1.3, xg, y - 1.6, yb, S.z0, S.z1, conc);              // the upper one
    box(xg, xb, y - 1.6, yb, S.z0, S.z1, conc);                   // the boxes' floor
    box(xg - 0.3, xb, top, top + 0.4, S.z0, S.z1, conc);          // the soffit over them
    box(xg - 0.3, xg - 0.05, top + 0.4, H, S.z0 - 3, S.z1 + 3, conc);   // the wall above, to the roof
    box(X, X + 0.12, y, y + 0.12, S.z0, S.z1, white);             // the balustrade's kerb
    { const g = new THREE.PlaneGeometry(S.z1 - S.z0, 1.0); g.rotateY(Math.PI / 2); g.translate(X + 0.06, y + 0.62, (S.z0 + S.z1) / 2 + OZ); rails.push(g); }
    for (let i = 0; i <= n; i++) {
      const z = S.z0 + i * w;
      // the sloping wall between two terraces: low at the front, up to the soffit at the glass
      const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(S.terrace, 0), new THREE.Vector2(S.terrace, top + 0.4 - y), new THREE.Vector2(S.terrace - 0.6, top + 0.4 - y), new THREE.Vector2(0.15, 1.1)]);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false });
      g.translate(0, 0, -0.07); g.translate(X, y, z + OZ); white.push(g.toNonIndexed());
      box(xg - 0.05, xg + 0.2, yb, top, z - 0.12, z + 0.12, white);   // the post at the glass
      if (i < n) {
        const gl = new THREE.PlaneGeometry(w - 0.3, S.h - 0.1); gl.rotateY(-Math.PI / 2); gl.translate(xg + 0.05, yb + (S.h - 0.1) / 2, z + w / 2 + OZ); glass.push(gl);
        const cu_ = new THREE.PlaneGeometry(w - 0.3, S.h - 0.1); cu_.rotateY(-Math.PI / 2); cu_.translate(xg + 0.35, yb + (S.h - 0.1) / 2, z + w / 2 + OZ); curtain.push(cu_);
        // a few steps up from the lower terrace to the upper, beside the wall
        for (let k = 0; k < 2; k++) box(X + 1.3 - 0.3 * (2 - k), X + 1.3, y + 0.15 * (k + 1) - 0.15, y + 0.15 * (k + 1), z + 0.1, z + 1.1, conc);
      }
    }
    const M = (list, mat) => { if (list.length) { const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat); m.receiveShadow = true; root.add(m); } };
    M(conc, std({ ...withRepeat(concreteTex({ key: 'inspsky', tone: 0.3 }), 1 / 3, 1 / 3), color: 0xb9b8b4, roughness: 0.9 }));
    M(white, std({ color: 0x8c8c88, roughness: 0.85 }));
    M(curtain, velvet(0x050506, 'skycurtain', { sheenColor: new THREE.Color(0x0a0a0a), sheenRoughness: 0.7, side: THREE.DoubleSide }));
    M(glass, std({ color: 0x0c0e12, roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    M(rails, std({ color: 0x9aa4b0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  }
  // the masking: black drapes across the room beside and behind the stage,
  // over the set in the middle, down to the stands behind
  maskingDrapes(root, { a: [-64, MZ], b: [64, MZ], top: 22.4, bottomAt: (x, z) => (Math.abs(x) < 16 ? DECK + 15 : stands.topAt(x, z)) });

  // ── the building: floor, roof, its steel, the rigging grid ──
  const X0 = -64, X1 = 64, Z0 = OZ - 66, Z1 = OZ + 66;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), std({ ...withRepeat(concreteTex({ key: 'inspfloor', tone: 0.12 }), (X1 - X0) / 4, (Z1 - Z0) / 4), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true;
  root.add(floor);
  const roofPlane = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), std({ color: 0x08080a, roughness: 0.95, side: THREE.DoubleSide }));
  roofPlane.rotation.x = Math.PI / 2; roofPlane.position.set(0, H, (Z0 + Z1) / 2); root.add(roofPlane);
  const roofParts = [];
  for (let x = X0 + 8; x <= X1 - 6; x += 16) latticeInto(roofParts, V3(x, H - 3.4, Z0 + 4), V3(x, H - 3.4, Z1 - 4), 3.2, 0.1);
  for (let z = Z0 + 10; z <= Z1 - 8; z += 13) latticeInto(roofParts, V3(X0 + 4, H - 1.4, z), V3(X1 - 4, H - 1.4, z), 1.4, 0.06);
  // the grid, 23 m up, over the floor
  for (let x = -30; x <= 30; x += 6) latticeInto(roofParts, V3(x, 23, OZ - 34), V3(x, 23, OZ + 34), 0.4, 0.03);
  for (let z = OZ - 34; z <= OZ + 34; z += 6) latticeInto(roofParts, V3(-30, 23, z), V3(30, 23, z), 0.4, 0.03);
  root.add(new THREE.Mesh(mergeGeometries(roofParts), std({ color: 0x24262b, metalness: 0.6, roughness: 0.5 })));
  const houseFix = [];
  for (let z = 10; z <= 64; z += 9) for (let x = -24; x <= 24; x += 12) houseFix.push(pipe.flares.add(V3(x, 22.6, z), KELVIN(4200), 1.1, 0));

  // ── stage: the main stage, the runway, the round stage ──
  stageSet(root, { w: 24, h: 15, z: 2.4 + SH, deck: DECK, towerX: 12.8, backdropW: 30, backdropH: 14, wingX: 16.5, wingW: 5, wingH: 10 });
  const deck = stageDeck({ w: 32, d: 12, h: DECK, z: 8 + SH });
  root.add(deck);
  const RZ = 42.5, RR = 4.5;
  const runway = stageDeck({ w: 3.2, d: RZ - RR + 0.4 - 14 - SH, h: DECK, z: (14 + SH + RZ - RR + 0.4) / 2, lip: false });
  root.add(runway);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, DECK, 64), [std({ color: 0x060607, roughness: 0.7 }), std({ ...withRepeat(stageTex(), 3, 3), roughness: 1 }), std({ color: 0x060607 })]);
  disc.position.set(0, DECK / 2, RZ); disc.receiveShadow = true; root.add(disc);
  const ringM = glowMat(APP.accent, 1.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RR + 0.02, 0.025, 6, 96), ringM);
  ring.rotation.x = Math.PI / 2; ring.position.set(0, DECK - 0.03, RZ); root.add(ring);
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 16.5, z: 12 + SH, h: DECK, dir: [0, -1] }));
  const scr = bigScreens(ctx, root, { w: 20, y: DECK + 1.4 + 20 / (16 / 9) / 2, z: 2.6 + SH, imagW: 9, imagX: 19.5, imagY: 12.5, imagZ: 5 + SH, imagYaw: 0.3 });
  // the backline, set and waiting
  const kit = drumKit({ shell: 0x1a1a1e }); kit.position.set(0, DECK + 1, 5.2 + SH); kit.scale.setScalar(1.1); root.add(kit);
  const riser = stageDeck({ w: 8, d: 3.5, h: 1.0, z: 5.4 + SH, lip: false }); riser.position.y = DECK; root.add(riser);
  const keys = keyboardRig(); keys.position.set(-5, DECK + 1, 6.0 + SH); root.add(keys);
  for (const x of [-10, 10]) { const a = ampStack({ count: 2 }); a.position.set(x, DECK, 5.5 + SH); root.add(a); }
  for (const [x, z] of [[0, 13.2 + SH], [0, RZ]]) { const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z); root.add(m); }
  for (let i = 0; i < 8; i++) { const w = wedge(); w.position.set(-10.5 + i * 3, DECK, 13.4 + SH); w.rotation.y = Math.PI; root.add(w); }
  for (const side of [-1, 1]) for (const dz of [-1.2, 1.2]) { const sub = subStack({ count: 3, cols: 2 }); sub.position.set(side * 10, 0, 15.5 + SH + dz); root.add(sub); }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const z of [3.6 + SH, 9.6 + SH]) { const t = truss(34, { size: 0.76, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-15, -5, 5, 15], RIG, z, 23)); }
  for (const x of [-5, 5]) { const t = truss(28, { size: 0.6, finish: 'black' }); t.rotation.y = Math.PI / 2; t.position.set(x, RIG - 1, 29 + SH / 2); root.add(t); }
  const pa = [];
  for (const side of [-1, 1]) {
    const main = lineArray({ boxes: 14, width: 1.2 }); main.position.set(side * 14.5, RIG - 0.6, 14.5 + SH); main.rotation.y = -side * 0.08; root.add(main); pa.push(main);
    const out = lineArray({ boxes: 12, width: 1.1 }); out.position.set(side * 22, RIG - 1.2, 13 + SH); out.rotation.y = -side * 0.45; root.add(out);
  }
  const spots = [], beams = [], washes = [], ups = [], lasers = [];
  for (let i = 0; i < 12; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-15 + i * (30 / 11), RIG - 0.5, 9.6 + SH), length: 45, angle: 0.085, beamGain: 1.0 }), i, n: 12, group: 0 });
  for (let i = 0; i < 12; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-15 + i * (30 / 11), RIG - 0.5, 3.6 + SH), length: 60, beamGain: 1.2 }), i, n: 12, group: 1 });
  for (let i = 0; i < 10; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(i < 5 ? -5 : 5, RIG - 1.5, 17 + SH + (i % 5) * (5.5 - SH / 5)), length: 22, beamGain: 0.5 }), i, n: 10, group: 2 });
  for (let i = 0; i < 10; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-14 + i * (28 / 9), DECK + 0.25, 13.6 + SH), hang: 'up', length: 50, beamGain: 1.0 }), i, n: 10, group: 3 });
  for (let i = 0; i < 4; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-6 + i * 4, DECK + 0.3, 13.8 + SH), body: false, length: 90, beamGain: 6, flareGain: 0.2, noise: 0.4 }), i, n: 4 });
  for (const k of [2, 5, 8, 10]) rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5, decay: 2 }), 5200);
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.2, penumbra: 0.7, size: q.shadowSize, far: 80, cast: q.shadows });
  front1.position.set(-6, RIG + 2, 46); front1.target.position.set(0, DECK + 1, 10 + SH);
  const front2 = shadowSpot(KELVIN(5600), 0, { angle: 0.14, penumbra: 0.6, cast: false });
  front2.position.set(4, RIG + 2, 60); front2.target.position.set(0, DECK + 1.5, RZ);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, 2 + SH); stageWash.target.position.set(0, DECK, 12 + SH);
  for (const l of [front1, front2, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-18, 16, 34], [18, 16, 34], [0, 20, 64]]) { const l = new THREE.PointLight(0xffffff, 0, 90, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  for (const [x, z] of [[-20, 16], [20, 16], [-20, 56], [20, 56], [0, 36], [0, 72]]) { const l = new THREE.PointLight(KELVIN(4200), 0, 110, 2); l.position.set(x, 22, z); root.add(l); house.push(l); }
  root.add(new THREE.HemisphereLight(0x14141c, 0x050508, 0.18));

  // ── people ──
  // the floor seated in blocks either side of the runway and across the back,
  // the desk and the round stage left clear; with the 100s folded away the
  // blocks run on to the walls
  const W = retract ? 31.0 : 19.8, ZE = retract ? OZ + 37.4 : OZ + 26.1;
  const cols = retract
    ? [[-W, -21.2], [-20.2, -12], [-11, -3], [3, 11], [12, 20.2], [21.2, W]]
    : [[-W, -12], [-11, -3], [3, 11], [12, W]];
  const zs = [[16.2 + SH, 31.4], [32.4, 47.6], [48.6, ZE]];
  const keep = (x, z) => Math.abs(x) < W + 0.1 && z < ZE
    && !(Math.abs(x) < 3.2 && z < RZ)                              // the runway
    && Math.hypot(x, z - RZ) > RR + 2.0                            // round the round stage
    && !(Math.abs(x) < 6.5 && z > 54 && z < 61.5)                  // the desk
    && !(retract && temp.some((f) => {                               // the stairs up to the 200s
      const ax = x - f.x, az = z - OZ - f.z, t = ax * f.dx + az * f.dz, w = Math.abs(-ax * f.dz + az * f.dx);
      return t > -1.2 && t < f.L + 0.5 && w < f.w / 2 + 0.9;
    }));
  const floorSeats = floorBlocks(blockGrid(zs, cols), { keep, seed: 9 });
  root.add(floorChairs(floorSeats.chairs));
  bigCrowd(root, cu, q, floorSeats.people.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 23 });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.03 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.3;
  root.add(aisleField);
  const fohLeds = lightPoints(fohPosition(pipe, root, eye), cu, { maxPx: 4 });
  root.add(fohLeds);

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * 10, scr.main.position.y + dy * scr.h * 0.5, 3.2 + SH), 0xffffff, 0));
  ctx.screenHaze(scr.main, hzs, offs);
  scr.main.userData.hazePower = 90;
  const hzWash = [hz.add(V3(-8, RIG - 1, 10 + SH), 0xffffff, 0), hz.add(V3(8, RIG - 1, 10 + SH), 0xffffff, 0), hz.add(V3(0, DECK + 3, RZ), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 6.5, 4), fov: 58, near: 0.15, far: 400 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x060508, 0.005),
    hazeDensity: 0.0017, beamGain: 0.55, hazeAmb: new THREE.Color(0x040306), hazeAmbDist: 150,
    bloom: { strength: 0.7, radius: 0.65, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.004, 0.008] },
    env: { w: X1 - X0, h: H, d: Z1 - Z0, eye, wall: 0x0a0a10, floor: 0x050507, emitters: [
      { w: 20, h: 11.25, pos: V3(0, scr.main.position.y, 2.6 + SH), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: 16 / 9 },
      { w: 30, h: 1, pos: V3(0, RIG, 10 + SH), normal: V3(0, -1, 0), color: APP.accent, power: 4 },
    ] },
    envIntensity: 0.6,
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 50), stage: STAGE, span: 32 });
      runShow(rig, beams, f, { house: V3(0, 12, 64), stage: STAGE, span: 40 });
      runShow(rig, washes, f, { house: V3(0, 0, 30), stage: V3(0, DECK, 28 + SH / 2), span: 18, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 30, 40), stage: STAGE, up: true });
      runLasers(lasers, f);
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      front1.intensity = 24000 * show + 4000 * f.house;
      front2.intensity = 12000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (5000 + 6000 * f.energy + 3000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (120 + 300 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 8000 * f.house; });
      houseFix.forEach((h) => { h.intensity = 1.5 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h, i) => { h.power = (i < 2 ? 260 : 140) * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      ringM.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.22 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 10, 12 + SH);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.2 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.006).multiplyScalar(1 + f.house * 8);
    },
  };
}
