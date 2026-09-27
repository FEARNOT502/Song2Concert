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
  const STAGE = V3(0, DECK, 8);

  // ── the stands, from the seating plan ──
  // Every section as the plan draws it and every row as the ticketing lists
  // it: the 100s' fourteen rows, the 200s' eight (east), ten (west, ends) and
  // thirteen (corners, north), the 300s' eleven; the concourses behind them
  // closed in and lit, doors in their walls, stairs between them.
  const data = retract ? { ...INSP_STANDS, levels: INSP_STANDS.levels.filter((l) => l.name !== '100') } : INSP_STANDS;
  const stands = buildStands(data, {
    offset: V3(0, 0, OZ), stage: STAGE, seed: 900, concreteTone: 0.2, roofY: H,
    seatColors: { 100: 0x1b2231, 200: 0x2c5a96, 300: 0x8e1b1d },
    // the 200s' back row on the east, under the boxes, is red
    seatColorAt: (name, x, z, row) => (name === '200' && x > 30 && Math.abs(z) < 20 && row === 7 ? 0x8e1b1d : null),
    crowd: !!q.crowd,
    // for the T stage the sections behind it are not sold
    sold: (x, z) => !(z < 2.5 && Math.abs(x) < 36),
  });
  root.add(stands.group);
  // folded away, each 100s section is a stack of benches against the wall
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
  // a band round the bowl, the lettering on it facing in
  const band = (ring, y0, h, mat, tile) => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length]; a += x0 * z1 - x1 * z0; }
    const R = a > 0 ? ring : ring.slice().reverse();
    const P = [], UV = [];
    let u = 0;
    for (let i = 0; i < R.length; i++) {
      const [x0, z0] = R[i], [x1, z1] = R[(i + 1) % R.length];
      const u1 = u + Math.hypot(x1 - x0, z1 - z0) / tile;
      for (const [x, y, z, uu, v] of [[x0, y0, z0, u, 0], [x1, y0, z1, u1, 0], [x1, y0 + h, z1, u1, 1], [x0, y0, z0, u, 0], [x1, y0 + h, z1, u1, 1], [x0, y0 + h, z0, u, 1]]) {
        P.push(x, y, z + OZ); UV.push(uu, v);
      }
      u = u1;
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
  // the ribbon board: an LED band round the bowl where the 300s rise from the
  // 200s' back, and on the east under the boxes
  const ribbonM = new THREE.MeshBasicMaterial({ map: letters('inspribbon', { fg: 'rgba(255,255,255,0.95)', grad: ['#7a1a8c', '#d0265a', '#e0305a', '#7a1a8c'] }), toneMapped: false, side: THREE.DoubleSide });
  root.add(band(INSP_STANDS.ribbon, INSP_STANDS.ribbonY, 0.85, ribbonM, 16));
  // the 200s' front: a dark fascia, the name printed on it
  root.add(band(INSP_STANDS.rim, INSP_STANDS.rimY, 0.8, std({ map: letters('insprim', { bg: '#0d1733', fg: '#e8ecf4' }), roughness: 0.6, side: THREE.DoubleSide }), 14));
  // the boxes on the east side, over the 200s' back and the ribbon: glass
  // fronts set back behind a balcony of two rows of seats, lit within
  {
    const R = INSP_STANDS.ribbon;
    let xb = 0;
    for (const [x, z] of R) if (Math.abs(z) < 19 && x > xb) xb = x;
    const y0 = INSP_STANDS.ribbonY + 0.85 + 0.75, hB = 3.2, n = 19, w = 3.4, z0 = -(n * w) / 2;
    const xg = xb + 2.1;                                 // the glass line
    const glass = [], frame = [], rails = [], inside = [], seats = [];
    for (let i = 0; i < n; i++) {
      const z = z0 + i * w + OZ;
      const g = new THREE.PlaneGeometry(w - 0.2, hB - 0.3); g.rotateY(-Math.PI / 2); g.translate(xg, y0 + 0.35 + (hB - 0.3) / 2, z + w / 2); glass.push(g);
      const f = new THREE.BoxGeometry(0.3, hB, 0.2); f.translate(xg, y0 + hB / 2, z); frame.push(f);
      // a glass screen between one box's balcony and the next
      const d = new THREE.PlaneGeometry(xg - xb, 1.1); d.rotateY(0); d.translate((xb + xg) / 2, y0 + 0.55 + 0.35, z); rails.push(d);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) seats.push({ x: xb + 0.55 + r * 0.85, y: y0 + r * 0.35, z: z + 0.6 + k * 0.55 });
      // the room within: its back wall lit warm
      const b = new THREE.PlaneGeometry(w - 0.3, hB - 0.4); b.rotateY(-Math.PI / 2); b.translate(xg + 4.5, y0 + 0.35 + (hB - 0.4) / 2, z + w / 2); inside.push(b);
    }
    const L = n * w;
    for (const [dx, dy, wx, hy, x] of [[0, -0.35, xg - xb + 0.25, 0.7, (xb + xg + 0.15) / 2], [0, 0.175, 0.85, 0.35, xb + 1.4 + 0.1]]) {
      const s = new THREE.BoxGeometry(wx, hy, L); s.translate(x + dx, y0 + dy, OZ); frame.push(s);
    }
    const back = new THREE.BoxGeometry(0.3, 0.35, L); back.translate(xg - 0.15, y0 + 0.175, OZ); frame.push(back);
    const floorIn = new THREE.BoxGeometry(4.6, 0.4, L); floorIn.translate(xg + 2.3, y0 + 0.15, OZ); frame.push(floorIn);
    const top = new THREE.BoxGeometry(xg - xb + 5, 0.8, L); top.translate((xb + xg + 4.6) / 2, y0 + hB + 0.4, OZ); frame.push(top);
    const face = new THREE.PlaneGeometry(L, 0.75); face.rotateY(-Math.PI / 2); face.translate(xb - 0.06, y0 - 0.33, OZ); frame.push(face);
    const rail = new THREE.PlaneGeometry(L, 1.0); rail.rotateY(-Math.PI / 2); rail.translate(xb + 0.05, y0 + 0.5, OZ); rails.push(rail);
    root.add(new THREE.Mesh(mergeGeometries(frame.map((g) => (g.index ? g.toNonIndexed() : g))), std({ color: 0x2a2c31, roughness: 0.6 })));
    root.add(new THREE.Mesh(mergeGeometries(glass), std({ color: 0x0c0e12, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.55, emissive: 0x2a1e12, emissiveIntensity: 0.3 })));
    root.add(new THREE.Mesh(mergeGeometries(inside), std({ color: 0x1a1612, roughness: 0.8, emissive: 0x6a4a2a, emissiveIntensity: 0.35 })));
    root.add(new THREE.Mesh(mergeGeometries(rails), std({ color: 0x9aa4b0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })));
    const seatGeo = stadiumSeatGeometry();
    const inst = new THREE.InstancedMesh(seatGeo, std({ color: 0x2a2d33, roughness: 0.5, side: THREE.DoubleSide }), seats.length);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -Math.PI / 2);
    seats.forEach((s, i) => { m4.compose(V3(s.x, s.y, s.z), qq, V3(1, 1, 1)); inst.setMatrixAt(i, m4); });
    root.add(inst);
  }

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
  stageSet(root, { w: 24, h: 15, z: 2.4, deck: DECK, towerX: 12.8, backdropW: 30, backdropH: 14, wingX: 16.5, wingW: 5, wingH: 10 });
  const deck = stageDeck({ w: 32, d: 12, h: DECK, z: 8 });
  root.add(deck);
  const RZ = 42.5, RR = 4.5;
  const runway = stageDeck({ w: 3.2, d: RZ - RR + 0.4 - 14, h: DECK, z: (14 + RZ - RR + 0.4) / 2, lip: false });
  root.add(runway);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, DECK, 64), [std({ color: 0x060607, roughness: 0.7 }), std({ ...withRepeat(stageTex(), 3, 3), roughness: 1 }), std({ color: 0x060607 })]);
  disc.position.set(0, DECK / 2, RZ); disc.receiveShadow = true; root.add(disc);
  const ringM = glowMat(APP.accent, 1.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RR + 0.02, 0.025, 6, 96), ringM);
  ring.rotation.x = Math.PI / 2; ring.position.set(0, DECK - 0.03, RZ); root.add(ring);
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 16.5, z: 12, h: DECK, dir: [0, -1] }));
  const scr = bigScreens(ctx, root, { w: 20, y: DECK + 1.4 + 20 / (16 / 9) / 2, z: 2.6, imagW: 9, imagX: 19.5, imagY: 12.5, imagZ: 5, imagYaw: 0.3 });
  // the backline, set and waiting
  const kit = drumKit({ shell: 0x1a1a1e }); kit.position.set(0, DECK + 1, 5.2); kit.scale.setScalar(1.1); root.add(kit);
  const riser = stageDeck({ w: 8, d: 3.5, h: 1.0, z: 5.4, lip: false }); riser.position.y = DECK; root.add(riser);
  const keys = keyboardRig(); keys.position.set(-5, DECK + 1, 6.0); root.add(keys);
  for (const x of [-10, 10]) { const a = ampStack({ count: 2 }); a.position.set(x, DECK, 5.5); root.add(a); }
  for (const [x, z] of [[0, 13.2], [0, RZ]]) { const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z); root.add(m); }
  for (let i = 0; i < 8; i++) { const w = wedge(); w.position.set(-10.5 + i * 3, DECK, 13.4); w.rotation.y = Math.PI; root.add(w); }
  for (const side of [-1, 1]) for (const dz of [-1.2, 1.2]) { const sub = subStack({ count: 3, cols: 2 }); sub.position.set(side * 10, 0, 15.5 + dz); root.add(sub); }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const z of [3.6, 9.6]) { const t = truss(34, { size: 0.76, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-15, -5, 5, 15], RIG, z, 23)); }
  for (const x of [-5, 5]) { const t = truss(28, { size: 0.6, finish: 'black' }); t.rotation.y = Math.PI / 2; t.position.set(x, RIG - 1, 29); root.add(t); }
  const pa = [];
  for (const side of [-1, 1]) {
    const main = lineArray({ boxes: 14, width: 1.2 }); main.position.set(side * 14.5, RIG - 0.6, 14.5); main.rotation.y = -side * 0.08; root.add(main); pa.push(main);
    const out = lineArray({ boxes: 12, width: 1.1 }); out.position.set(side * 22, RIG - 1.2, 13); out.rotation.y = -side * 0.45; root.add(out);
  }
  const spots = [], beams = [], washes = [], ups = [], lasers = [];
  for (let i = 0; i < 12; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-15 + i * (30 / 11), RIG - 0.5, 9.6), length: 45, angle: 0.085, beamGain: 1.0 }), i, n: 12, group: 0 });
  for (let i = 0; i < 12; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-15 + i * (30 / 11), RIG - 0.5, 3.6), length: 60, beamGain: 1.2 }), i, n: 12, group: 1 });
  for (let i = 0; i < 10; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(i < 5 ? -5 : 5, RIG - 1.5, 17 + (i % 5) * 5.5), length: 22, beamGain: 0.5 }), i, n: 10, group: 2 });
  for (let i = 0; i < 10; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-14 + i * (28 / 9), DECK + 0.25, 13.6), hang: 'up', length: 50, beamGain: 1.0 }), i, n: 10, group: 3 });
  for (let i = 0; i < 4; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-6 + i * 4, DECK + 0.3, 13.8), body: false, length: 90, beamGain: 6, flareGain: 0.2, noise: 0.4 }), i, n: 4 });
  for (const k of [2, 5, 8, 10]) rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5, decay: 2 }), 5200);
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.2, penumbra: 0.7, size: q.shadowSize, far: 80, cast: q.shadows });
  front1.position.set(-6, RIG + 2, 46); front1.target.position.set(0, DECK + 1, 10);
  const front2 = shadowSpot(KELVIN(5600), 0, { angle: 0.14, penumbra: 0.6, cast: false });
  front2.position.set(4, RIG + 2, 60); front2.target.position.set(0, DECK + 1.5, RZ);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, 2); stageWash.target.position.set(0, DECK, 12);
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
  const W = retract ? 30.5 : 19.8, ZE = retract ? OZ + 37.5 : OZ + 25.8;
  const cols = retract
    ? [[-W, -21.2], [-20.2, -12], [-11, -3], [3, 11], [12, 20.2], [21.2, W]]
    : [[-W, -12], [-11, -3], [3, 11], [12, W]];
  const zs = [[16.2, 31.4], [32.4, 47.6], [48.6, ZE]];
  const keep = (x, z) => Math.abs(x) < W + 0.1 && z < ZE
    && !(Math.abs(x) < 3.2 && z < RZ)                              // the runway
    && Math.hypot(x, z - RZ) > RR + 2.0                            // round the round stage
    && !(Math.abs(x) < 6.5 && z > 54 && z < 61.5);                 // the desk
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
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * 10, scr.main.position.y + dy * scr.h * 0.5, 3.2), 0xffffff, 0));
  ctx.screenHaze(scr.main, hzs, offs);
  scr.main.userData.hazePower = 90;
  const hzWash = [hz.add(V3(-8, RIG - 1, 10), 0xffffff, 0), hz.add(V3(8, RIG - 1, 10), 0xffffff, 0), hz.add(V3(0, DECK + 3, RZ), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 6.5, 4), fov: 58, near: 0.15, far: 400 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x060508, 0.005),
    hazeDensity: 0.0017, beamGain: 0.55, hazeAmb: new THREE.Color(0x040306), hazeAmbDist: 150,
    bloom: { strength: 0.7, radius: 0.65, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.004, 0.008] },
    env: { w: X1 - X0, h: H, d: Z1 - Z0, eye, wall: 0x0a0a10, floor: 0x050507, emitters: [
      { w: 20, h: 11.25, pos: V3(0, scr.main.position.y, 2.6), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: 16 / 9 },
      { w: 30, h: 1, pos: V3(0, RIG, 10), normal: V3(0, -1, 0), color: APP.accent, power: 4 },
    ] },
    envIntensity: 0.6,
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 50), stage: STAGE, span: 32 });
      runShow(rig, beams, f, { house: V3(0, 12, 64), stage: STAGE, span: 40 });
      runShow(rig, washes, f, { house: V3(0, 0, 30), stage: V3(0, DECK, 28), span: 18, strobe: false });
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
      cu.uStage.value.set(0, 10, 12);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.2 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.006).multiplyScalar(1 + f.house * 8);
    },
  };
}
