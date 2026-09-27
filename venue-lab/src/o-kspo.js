// ─────────────────────────────────────────────────────────────────────────────
// KSPO — KSPO DOME (the Olympic Gymnastics Arena), Seoul: a round bowl under
// a 120 m cable dome, 14,594 seats, set up with an end stage and a T-shaped
// thrust: the stage in front of the A block, the drapes either side of it
// hiding the A block and the 2nd floor behind it, seen from FOH on a seated
// floor. The 1st floor in four blocks round the floor with a stair passage at
// each diagonal; B and D's first eight rows telescope away to make the floor
// bigger (A's are folded away under the stage). A walkway round the top of the
// 1st floor, the 2nd floor's tunnels opening onto it; the 2nd floor all round,
// the box seats over its back on the two sides; the dome's ribs over it all.
// From the official seating chart and the KCISA models of the building.
// ─────────────────────────────────────────────────────────────────────────────

function buildKspo(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const K = KSPO_STANDS;
  const RIM = K.rim, APEX = 35, R_OUT = 60, DECK = 1.8, RIG = 19;
  const retract = !!ctx.retract;          // B and D's telescopic rows folded away
  const OZ = 30;                          // the bowl's centre, in this room's coordinates
  const eye = V3(0, 1.6 + 0.9, OZ + 17.5);
  // the stage in front of the A block, out on the floor: its front 6.5 m north of the centre
  const SF = OZ - 6.5, SB = OZ - 18.2;
  const STAGE = V3(0, DECK, (SF + SB) / 2);
  // chart angle (the official chart's, counter-clockwise from its right) of a
  // point in plan (x east, z south)
  const theta = (x, z) => ((180 - Math.atan2(z, x) / DEG) + 540) % 360 - 180;
  // behind the drapes: the A block, the 2nd floor behind it, and 23 and 44
  // beside it (not sold for an end stage)
  const masked = (x, zr) => { const t = theta(x, zr - OZ); return t > -158 && t < -22; };

  // ── the stands ──
  const lv = (name) => K.levels.find((l) => l.name === name);
  const F1 = lv('1F');
  const levels = [
    { ...F1, rails: F1.rails.concat(F1.railsA, retract ? F1.railsRetract : []) },
    ...(retract ? [] : [lv('1FT')]),
    lv('2F'),
  ];
  const seatCol = (name, x, z) => {
    const t = theta(x, z);
    if (name === '2F') return (Math.abs(t) > 34 && Math.abs(t) < 146) ? 0xd9782a : 0x3a9fc6;
    if (t > 39 && t < 140) return 0x1d5a3a;                                 // C
    if (t > -141 && t < -39) return 0x2f8f5a;                                // A
    return 0xb3a52e;                                                          // B, D
  };
  const stands = buildStands({ ...K, levels }, {
    offset: V3(0, 0, OZ), stage: STAGE, seed: 1200, concreteTone: 0.3, roofY: RIM,
    seatColors: { '1F': 0x2f8f5a, '1FT': 0xb3a52e, '2F': 0xd9782a },
    seatColorAt: (name, x, z) => seatCol(name, x, z),
    materials: { vom: std({ color: 0x9a9ca0, roughness: 0.7 }) },
    crowd: !!q.crowd,
    sold: (x, z) => !masked(x, z),
  });
  root.add(stands.group);
  // the folded rows: a stack of benches against the rows left
  {
    const parts = [];
    for (const polys of K.stacksA.concat(retract ? K.stacks : [])) {
      const s = new THREE.Shape(polys[0].map(([x, z]) => new THREE.Vector2(x, -(z + OZ))));
      const geo = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    }
    if (parts.length) root.add(new THREE.Mesh(mergeGeometries(parts), std({ color: 0x2a2c30, roughness: 0.7, metalness: 0.2 })));
  }
  // the box seats over the 2nd floor's back on the two sides: three rows up
  // behind a glass front, a counter before each row, glass between the boxes
  {
    const B = K.box, conc = [], glass = [], seats = [];
    const at = (r, t) => { const a = (180 - t) * DEG; return [r * Math.cos(a), r * Math.sin(a) + OZ]; };
    for (const [a0, a1] of B.arcs) {
      const span = ((a1 - a0) + 360) % 360, n = Math.ceil(span / 1.2);
      for (let i = 0; i < n; i++) {
        const t0 = a0 + span * i / n, t1 = a0 + span * (i + 1) / n, tm = (t0 + t1) / 2;
        for (let k = 0; k < 3; k++) {
          const r0 = B.r0 + 0.4 + k * 1.35, r1 = k < 2 ? r0 + 1.35 : B.r1, y = B.y + 0.38 * (k + 1);
          const [x0, z0] = at((r0 + r1) / 2, tm), len = (t1 - t0) * DEG * (r0 + r1) / 2 + 0.03;
          const g = new THREE.BoxGeometry(len, 0.38 * (k + 1), r1 - r0); g.rotateY(-(180 - tm) * DEG - Math.PI / 2); g.translate(x0, B.y + 0.19 * (k + 1), z0); conc.push(g);
          // the counter in front, the seats behind it
          const [cx, cz] = at(r0 + 0.25, tm);
          const c = new THREE.BoxGeometry(len, 0.08, 0.35); c.rotateY(-(180 - tm) * DEG - Math.PI / 2); c.translate(cx, y + 0.72, cz); conc.push(c);
          for (let j = 0; j < 2; j++) {
            const [sx, sz] = at(r0 + 0.85, t0 + (t1 - t0) * (j + 0.5) / 2);
            seats.push({ x: sx, y, z: sz, yaw: Math.atan2(-sx, -(sz - OZ)) });
          }
        }
        // a glass screen every fourth step between one box and the next
        if (i % 4 === 0) {
          const [gx, gz] = at((B.r0 + B.r1) / 2, t0);
          const g = new THREE.PlaneGeometry(B.r1 - B.r0, 1.3); g.rotateY(-(180 - t0) * DEG); g.translate(gx, B.y + 1.5, gz); glass.push(g);
        }
      }
      // the glass along the front
      const m = Math.ceil(span / 2);
      for (let i = 0; i < m; i++) {
        const t0 = a0 + span * i / m, t1 = a0 + span * (i + 1) / m, [x0, z0] = at(B.r0 + 0.1, t0), [x1, z1] = at(B.r0 + 0.1, t1);
        const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(len + 0.02, 1.0);
        g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, B.y + 0.5, (z0 + z1) / 2); glass.push(g);
      }
    }
    root.add(new THREE.Mesh(mergeGeometries(conc.map((g) => (g.index ? g.toNonIndexed() : g))), std({ ...withRepeat(concreteTex({ key: 'kspobox', tone: 0.34 }), 1 / 3, 1 / 3), color: 0xc8c6c0, roughness: 0.9 })));
    root.add(new THREE.Mesh(mergeGeometries(glass), std({ color: 0x9aa4b0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })));
    const inst = new THREE.InstancedMesh(stadiumSeatGeometry(), std({ color: 0x2445a8, roughness: 0.55, side: THREE.DoubleSide }), seats.length);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
    seats.forEach((s, i) => { qq.setFromAxisAngle(V3(0, 1, 0), s.yaw); m4.compose(V3(s.x, s.y, s.z), qq, V3(1, 1, 1)); inst.setMatrixAt(i, m4); });
    root.add(inst);
  }

  // ── the building: the floor, the wall over the stands, the cable dome ──
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R_OUT, 96), std({ ...withRepeat(concreteTex({ key: 'kspofloor', tone: 0.14 }), 30, 30), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, OZ); floor.receiveShadow = true; root.add(floor);
  // the dome: a shallow cap on the ring beam, its ribs radial to a tension
  // ring at the crown, two rings of hoops between
  const roofAt = (r) => RIM + (APEX - RIM) * (1 - (r / R_OUT) ** 2);
  {
    const g = new THREE.CircleGeometry(R_OUT + 0.5, 96, 0, Math.PI * 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, roofAt(Math.hypot(x, y))); }
    g.rotateX(-Math.PI / 2); g.scale(1, 1, -1); g.computeVertexNormals();
    // (the cap's own height already set; move it onto the centre)
    const m = new THREE.Mesh(g, std({ color: 0x4a4d52, roughness: 0.92, side: THREE.DoubleSide }));
    m.position.set(0, 0, OZ); root.add(m);
  }
  const ribs = [];
  const NR = 24;
  for (let i = 0; i < NR; i++) {
    const a = i / NR * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const pts = [59, 44, 30, 16, 6].map((r) => V3(r * c, roofAt(r) - 1.6, r * s + OZ));
    for (let k = 0; k + 1 < pts.length; k++) latticeInto(ribs, pts[k], pts[k + 1], 1.3, 0.05);
  }
  for (const r of [44, 30, 16, 6]) {
    for (let i = 0; i < NR; i++) {
      const a0 = i / NR * Math.PI * 2, a1 = (i + 1) / NR * Math.PI * 2;
      latticeInto(ribs, V3(r * Math.cos(a0), roofAt(r) - 1.6, r * Math.sin(a0) + OZ), V3(r * Math.cos(a1), roofAt(r) - 1.6, r * Math.sin(a1) + OZ), 0.6, 0.035);
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(ribs), std({ color: 0x6e7278, metalness: 0.5, roughness: 0.55 })));
  // the ring beam, and the wall under it with its ribs of columns
  {
    const beam = new THREE.Mesh(new THREE.TorusGeometry(R_OUT - 0.6, 0.7, 8, 96), std({ color: 0x8c8f94, roughness: 0.7 }));
    beam.rotation.x = Math.PI / 2; beam.position.set(0, RIM - 0.4, OZ); root.add(beam);
    const cols = [];
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2, g = new THREE.BoxGeometry(0.5, RIM - K.concourse['2F'], 0.6);
      g.rotateY(-a); g.translate((R_OUT - 0.5) * Math.cos(a), (RIM + K.concourse['2F']) / 2, (R_OUT - 0.5) * Math.sin(a) + OZ); cols.push(g);
    }
    root.add(new THREE.Mesh(mergeGeometries(cols), std({ color: 0x9a9da2, roughness: 0.7 })));
  }
  // the gondola at the crown: the centre cluster
  {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2.4, 16), std({ color: 0x1a1b1e, roughness: 0.6, metalness: 0.4 }));
    g.position.set(0, APEX - 5.5, OZ); root.add(g);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 4), std({ color: 0x777777 })); w.position.set(0, APEX - 2.8, OZ); root.add(w);
  }
  const houseFix = [];
  for (const r of [12, 26, 40]) for (let i = 0; i < (r < 20 ? 6 : 12); i++) {
    const a = (i + 0.5) / (r < 20 ? 6 : 12) * Math.PI * 2;
    houseFix.push(pipe.flares.add(V3(r * Math.cos(a), roofAt(r) - 2.2, r * Math.sin(a) + OZ), KELVIN(4200), 1.1, 0));
  }

  // ── stage: the end stage, the runway, the T's cross ──
  stageSet(root, { w: 24, h: 14, z: SB + 0.4, deck: DECK, towerX: 12.8, backdropW: 30, backdropH: 13, wingX: 16.5, wingW: 5, wingH: 10 });
  const deck = stageDeck({ w: 30, d: SF - SB, h: DECK, z: (SF + SB) / 2 });
  root.add(deck);
  const TZ0 = SF, TZ1 = OZ + 4.0, CW = 14, CD = 3.2;
  const runway = stageDeck({ w: 3.0, d: TZ1 - TZ0, h: DECK, z: (TZ0 + TZ1) / 2, lip: false });
  root.add(runway);
  const cross = stageDeck({ w: CW, d: CD, h: DECK, z: TZ1 + CD / 2 });
  root.add(cross);
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 15.8, z: SF - 1.2, h: DECK, dir: [0, -1] }));
  const scr = bigScreens(ctx, root, { w: 18, y: DECK + 1.4 + 18 / (16 / 9) / 2, z: SB + 0.6, imagW: 8, imagX: 17.5, imagY: 11.5, imagZ: SB + 3, imagYaw: 0.3 });
  const kit = drumKit({ shell: 0x1a1a1e }); kit.position.set(0, DECK + 1, SB + 3.2); kit.scale.setScalar(1.1); root.add(kit);
  const riser = stageDeck({ w: 8, d: 3.5, h: 1.0, z: SB + 3.4, lip: false }); riser.position.y = DECK; root.add(riser);
  const keys = keyboardRig(); keys.position.set(-5, DECK + 1, SB + 4.0); root.add(keys);
  for (const x of [-10, 10]) { const a = ampStack({ count: 2 }); a.position.set(x, DECK, SB + 3.5); root.add(a); }
  for (const [x, z] of [[0, SF - 0.8], [0, TZ1 + 1.4]]) { const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z); root.add(m); }
  for (let i = 0; i < 8; i++) { const w = wedge(); w.position.set(-10.5 + i * 3, DECK, SF - 0.6); w.rotation.y = Math.PI; root.add(w); }
  for (const side of [-1, 1]) for (const dz of [-1.2, 1.2]) { const sub = subStack({ count: 3, cols: 2 }); sub.position.set(side * 10, 0, SF + 1.8 + dz); root.add(sub); }
  // the masking: drapes out from the stage's front corners along the A
  // block's ends to the wall, and across behind the stage over the set
  const drapeTo = (t) => { const a = (180 - t) * DEG; return [[20.2 * Math.cos(a), 20.2 * Math.sin(a) + OZ], [(R_OUT - 0.8) * Math.cos(a), (R_OUT - 0.8) * Math.sin(a) + OZ]]; };
  for (const t of [-39.2, -140.4]) {
    const [a, b] = drapeTo(t);
    maskingDrapes(root, { a, b, top: RIM - 2.5, bottomAt: (x, z) => stands.topAt(x, z) });
  }
  // and along the stage's sides back to them
  for (const sd of [-1, 1]) maskingDrapes(root, { a: [sd * 15.6, SF - 2.0], b: [sd * 15.65, OZ - 12.77], top: RIG - 1.5, bottomAt: () => 0 });
  {
    const zb = OZ - 25.5, xe = 25.5 / Math.tan(39.2 * DEG) - 0.3;
    maskingDrapes(root, { a: [-xe, zb], b: [xe, zb], top: RIM - 2.5, bottomAt: (x, z) => (Math.abs(x) < 15.5 ? DECK + 13.4 : stands.topAt(x, z)) });
  }

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  const Z1 = SB + 1.8, Z2 = SB + 7.6;
  for (const z of [Z1, Z2]) { const t = truss(32, { size: 0.76, finish: 'black' }); t.position.set(0, RIG, z); root.add(t); root.add(hoists([-14, -5, 5, 14], RIG, z, roofAt(Math.abs(z - OZ)))); }
  { const t = truss(18, { size: 0.6, finish: 'black' }); t.rotation.y = Math.PI / 2; t.position.set(0, RIG - 1, TZ1 - 5); root.add(t); }
  for (const side of [-1, 1]) {
    const main = lineArray({ boxes: 14, width: 1.2 }); main.position.set(side * 14.5, RIG - 0.6, SF + 0.6); main.rotation.y = -side * 0.08; root.add(main);
    const out = lineArray({ boxes: 12, width: 1.1 }); out.position.set(side * 21, RIG - 1.2, SF - 1.0); out.rotation.y = -side * 0.5; root.add(out);
  }
  const spots = [], beams = [], washes = [], ups = [], lasers = [];
  for (let i = 0; i < 12; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-14 + i * (28 / 11), RIG - 0.5, Z2), length: 45, angle: 0.085, beamGain: 1.0 }), i, n: 12, group: 0 });
  for (let i = 0; i < 12; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-14 + i * (28 / 11), RIG - 0.5, Z1), length: 60, beamGain: 1.2 }), i, n: 12, group: 1 });
  for (let i = 0; i < 8; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(0, RIG - 1.5, TZ1 - 13 + i * 2.2), length: 22, beamGain: 0.5 }), i, n: 8, group: 2 });
  for (let i = 0; i < 10; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-13 + i * (26 / 9), DECK + 0.25, SF - 0.4), hang: 'up', length: 50, beamGain: 1.0 }), i, n: 10, group: 3 });
  for (let i = 0; i < 4; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-6 + i * 4, DECK + 0.3, SF - 0.2), body: false, length: 80, beamGain: 6, flareGain: 0.2, noise: 0.4 }), i, n: 4 });
  for (const k of [2, 5, 8, 10]) rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5, decay: 2 }), 5200);
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.2, penumbra: 0.7, size: q.shadowSize, far: 80, cast: q.shadows });
  front1.position.set(-6, RIG + 3, OZ + 20); front1.target.position.set(0, DECK + 1, STAGE.z);
  const front2 = shadowSpot(KELVIN(5600), 0, { angle: 0.16, penumbra: 0.6, cast: false });
  front2.position.set(4, RIG + 3, OZ + 26); front2.target.position.set(0, DECK + 1.5, TZ1 + 1.5);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, RIG - 1, SB); stageWash.target.position.set(0, DECK, SF - 3);
  for (const l of [front1, front2, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-18, 16, OZ], [18, 16, OZ], [0, 20, OZ + 30]]) { const l = new THREE.PointLight(0xffffff, 0, 90, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  for (const [x, z] of [[-24, OZ - 10], [24, OZ - 10], [-24, OZ + 20], [24, OZ + 20], [0, OZ + 5], [0, OZ + 40]]) { const l = new THREE.PointLight(KELVIN(4200), 0, 110, 2); l.position.set(x, 24, z); root.add(l); house.push(l); }
  root.add(new THREE.HemisphereLight(0x14141c, 0x050508, 0.18));

  // ── people: the floor seated in blocks round the runway and the cross, up
  // to the 1st floor's front all round (with B and D folded away, out to
  // their fixed rows) ──
  const RF = K.floorR, RT = K.tele.front - 2.6 - 0.6;
  const limit = (x, zp) => {
    const t = theta(x, zp);
    const side = (t > -24 && t < 31) || t > 148 || t < -156;              // D, B
    return retract && side ? RT : RF - 0.8;
  };
  const keepF = (x, z) => {
    const zp = z - OZ;
    return Math.hypot(x, zp) < limit(x, zp) && z > SF + 1.2
      && !(Math.abs(x) < 2.8 && z < TZ1 + 0.4)                              // the runway
      && !(Math.abs(x) < CW / 2 + 1.6 && z > TZ1 - 1.2 && z < TZ1 + CD + 1.6)  // the cross
      && !(Math.abs(x - eye.x) < 5 && z > eye.z - 4 && z < eye.z + 3.5);    // the desk
  };
  const W = retract ? 27 : 20;
  const cols = [[-W, -15.5], [-14.5, -8], [-7, -1.6], [1.6, 7], [8, 14.5], [15.5, W]];
  const zs = [[SF + 1.4, OZ - 4], [OZ - 3, OZ + 7], [OZ + 8, OZ + 21]];
  const floorSeats = floorBlocks(blockGrid(zs, cols), { keep: keepF, seed: 12 });
  root.add(floorChairs(floorSeats.chairs));
  bigCrowd(root, cu, q, floorSeats.people.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 31 });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.03 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.3;
  root.add(aisleField);
  const fohLeds = lightPoints(fohPosition(pipe, root, eye), cu, { maxPx: 4 });
  root.add(fohLeds);

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * 10, scr.main.position.y + dy * scr.h * 0.5, SB + 1.2), 0xffffff, 0));
  ctx.screenHaze(scr.main, hzs, offs);
  scr.main.userData.hazePower = 90;
  const hzWash = [hz.add(V3(-8, RIG - 1, STAGE.z), 0xffffff, 0), hz.add(V3(8, RIG - 1, STAGE.z), 0xffffff, 0), hz.add(V3(0, DECK + 3, TZ1 + 1.5), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 6, STAGE.z), fov: 58, near: 0.15, far: 400 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x060508, 0.005),
    hazeDensity: 0.0011, beamGain: 0.6, hazeAmb: new THREE.Color(0x040306), hazeAmbDist: 150,
    bloom: { strength: 0.7, radius: 0.65, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.004, 0.008] },
    env: { w: R_OUT * 2, h: APEX, d: R_OUT * 2, eye, wall: 0x0a0a10, floor: 0x050507, emitters: [
      { w: 18, h: 10.1, pos: V3(0, scr.main.position.y, SB + 0.6), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: 16 / 9 },
      { w: 28, h: 1, pos: V3(0, RIG, STAGE.z), normal: V3(0, -1, 0), color: APP.accent, power: 4 },
    ] },
    envIntensity: 0.6,
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, OZ + 8), stage: STAGE, span: 30 });
      runShow(rig, beams, f, { house: V3(0, 12, OZ + 20), stage: STAGE, span: 40 });
      runShow(rig, washes, f, { house: V3(0, 0, OZ - 4), stage: V3(0, DECK, TZ1 - 4), span: 14, strobe: false });
      runShow(rig, ups, f, { house: V3(0, 30, OZ + 10), stage: STAGE, up: true });
      runLasers(lasers, f);
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      front1.intensity = 24000 * show + 4000 * f.house;
      front2.intensity = 12000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (5000 + 6000 * f.energy + 3000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (120 + 300 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 4200 * f.house; });
      houseFix.forEach((h) => { h.intensity = 1.0 * f.house; });
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h, i) => { h.power = (i < 2 ? 260 : 140) * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cross.userData.lip?.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.22 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 10, STAGE.z);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.2 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.006).multiplyScalar(1 + f.house * 8);
    },
  };
}
