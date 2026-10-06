// ─────────────────────────────────────────────────────────────────────────────
// STADIUM — Wembley: three tiers of red seats, a roof over every seat and none
// over the pitch, the arch standing over the north stand, a London sky. From
// FOH 65 m out on the pitch.
// ─────────────────────────────────────────────────────────────────────────────

function nightSky(u) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: u.uTime, tNoise: { value: noise3D() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      precision highp sampler3D;
      uniform float uTime; uniform sampler3D tNoise; varying vec3 vD;
      void main() {
        float y = vD.y;
        // city glow at the horizon, deep blue overhead
        vec3 horizon = vec3(0.16, 0.085, 0.05);
        vec3 zenith = vec3(0.004, 0.007, 0.02);
        vec3 c = mix(horizon, zenith, smoothstep(-0.02, 0.55, y));
        // low cloud, lit orange from below by the city and the stadium
        vec2 p = vD.xz / max(y + 0.15, 0.05);
        float n = texture(tNoise, vec3(p * 0.06 + vec2(uTime * 0.002, 0.0), 0.3)).r;
        float n2 = texture(tNoise, vec3(p * 0.17 - vec2(0.0, uTime * 0.003), 0.7)).r;
        float cl = smoothstep(0.45, 0.8, n * 0.7 + n2 * 0.45) * smoothstep(0.0, 0.25, y);
        c = mix(c, vec3(0.1, 0.06, 0.05) * (0.6 + 0.8 * n2), cl * 0.85);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10;
  return sky;
}

// The arch: 315 m, its top 133 m above the pitch, leaning 22 degrees north
// over the north stand (so in its own plane it rises further, 133 m over the
// cosine of the lean). A lattice tube, floodlit white. Its feet stand on
// their own bases outside the building, past each end, 50 m north of the
// centre spot; from there it climbs steeply enough to clear the roof
// everywhere it passes over it.
function archCurve({ x0 = 50, zc = 64, span = 315, height = 133, lean = 22 * DEG, leg = 0.45 } = {}) {
  const rise = (height + 6) / Math.cos(lean);
  // a point on the arch's axis at s (0..1, foot to foot)
  return (s) => {
    const h = rise * Math.sin(Math.PI * s) ** leg;
    return V3(x0 + h * Math.sin(lean), h * Math.cos(lean) - 6, zc + (s - 0.5) * span);
  };
}
function wembleyArch({ x0 = 50, zc = 64, span = 315 } = {}) {
  const at = archCurve({ x0, zc, span });
  const pts = [];
  for (let i = 0; i <= 120; i++) pts.push(at(i / 120));
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 240, 3.7, 16, false);
  const m = std({ color: 0xe8e8ea, roughness: 0.5, metalness: 0.2, emissive: 0x9aa0aa, emissiveIntensity: 0.55, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        // lattice: a diagonal grid of tubes, the rest is air
        vec2 p = vec2(vUv.x * 520.0, vUv.y * 8.0);
        vec2 a = abs(fract(vec2(p.x + p.y, p.x - p.y) * 0.5) - 0.5);
        float bar = min(a.x, a.y);
        float ring = abs(fract(p.x * 0.5) - 0.5);
        if (bar > 0.09 && ring > 0.06) discard;
      }`);
  };
  m.defines = { USE_UV: '' };
  m.customProgramCacheKey = () => 'arch';
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m));
  // the concrete bases the hinges sit on
  for (const e of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 14), std({ color: 0x3a3a3e, roughness: 0.9 }));
    base.position.set(x0, 2, zc + e * span / 2); g.add(base);
  }
  return g;
}

function buildStadium(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 3.2, ROOF = 52, RIG = 36;
  // FOH, and the listener there: at the back of the pitch's crowd
  const eye = V3(0, 1.6 + 1.2, 126);
  const STAGE = V3(0, DECK, 20);
  // the centre spot, on the long axis; the stage end is west (-z), north is +x
  const ZC = 64;
  const OFF = V3(0, 0, ZC);
  root.add(nightSky(cu));
  const rnd = prng(199);
  const stars = [];
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, e = 0.18 + rnd() * 1.3, r = 850;
    stars.push({ x: Math.cos(a) * Math.cos(e) * r, y: Math.sin(e) * r, z: Math.sin(a) * Math.cos(e) * r + ZC, white: true, size: 1.2 + rnd() * 1.6, phase: rnd() * 6.28 });
  }
  const starField = lightPoints(stars, cu, { maxPx: 2.2 });
  starField.material.uniforms.uGain.value = 0.25;
  starField.material.fog = false;
  root.add(starField);

  // ── the bowl, by the seating plan ──
  // Three tiers all the way round, as the detailed plan draws them: Level 1
  // (blocks 101-144, 44 rows, a walkway behind row 28 with the tunnels up
  // from the Level 1 concourse, the players' tunnel and the four corner
  // tunnels cut into its front: an open cut walled either side to a portal
  // under the rows, as wide and as deep as the plan leaves each corner
  // unseated), the Club Wembley tier (201-252, entered
  // through the doors at the back from the club concourse and the boxes) and
  // Level 5 (501-552, up to 45 rows down the sides, 24 at the ends where the
  // two big screens stand in bays in its front, tunnels a third of the way
  // up). Sold out as a concert sells it: every seat that can see the face of
  // the wall, the restricted-view ones beside the stage included; the stand
  // behind it and the corners behind the wall's line are not sold.
  // The end screens' bays: each a notch in Level 5's front. The screen fills
  // the notch from side to side just behind the front's curve, its foot
  // below the tier's front lip (as the photographs show it: the blocks
  // either side come down to its edges, a low rail between, the fascia
  // band under it). The few rows right behind it face its back: not sold.
  const SCREEN_H = 9.5;
  const screenBays = WB_STANDS.bays.filter((b) => b.kind === 'screen').map((b) => {
    const f = b.front, mid = f[Math.floor(f.length / 2)];
    const [a0, a1] = b.mouth;
    const tx = a1[0] - a0[0], tz = a1[1] - a0[1], tl = Math.hypot(tx, tz);
    let nx = -tz / tl, nz = tx / tl;
    if (nx * (0 - mid[0]) + nz * (0 - mid[1]) < 0) { nx = -nx; nz = -nz; }
    const cx = (a0[0] + a1[0]) / 2, cz = (a0[1] + a1[1]) / 2, ux = tx / tl, uz = tz / tl;
    const T = ([x, z]) => (x - cx) * ux + (z - cz) * uz, D = ([x, z]) => -((x - cx) * nx + (z - cz) * nz);
    const Sf = Math.max(...f.map(D)) + 0.3;                             // the screen's face
    const side = (sg) => Math.max(...b.ring.filter((p) => sg * T(p) > 0 && Math.abs(D(p) - Sf) < 0.6).map((p) => sg * T(p))) - 0.1;
    const wl = side(-1), wr = side(1), Db = Math.max(...b.ring.map(D)) + 0.1;
    return { b, nx, nz, cx, cz, ux, uz, T, D, Sf, wl, wr, Db, yaw: Math.atan2(nx, nz) };
  });
  const behindScreen = (x, z) => screenBays.some((q) => { const p = [x, z - ZC], t = q.T(p), d = q.D(p); return t > -q.wl - 0.5 && t < q.wr + 0.5 && d > q.Sf && d < q.Db + 6; });
  const stands = buildStands(WB_STANDS, {
    offset: OFF, stage: STAGE, seatColor: 0x9a1418, concreteTone: 0.26, seed: 600, roofY: ROOF,
    sold: (x, z, lv) => z - 8 > Math.max(2, 0.12 * (Math.abs(x) - 31)) && !(lv === 'L5' && behindScreen(x, z)),   // in front of the wall (face z 8, 62 m wide), not behind an end screen
  });
  root.add(stands.group);
  const ring = (poly) => poly[0].map(([x, z]) => ({ x, z: z + ZC }));
  const field = ring(WB_STANDS.field[0]);
  const outerRing = ring(WB_STANDS.outer[0]);
  const roofIn = ring(WB_STANDS.roofIn[0]);

  // ── the pitch inside the Level 1 front, covered for the show ──
  const pitchShape = new THREE.Shape(field.map((p) => new THREE.Vector2(p.x, -p.z)));
  const pitchGeo = new THREE.ShapeGeometry(pitchShape, 1); pitchGeo.rotateX(-Math.PI / 2);
  const pitch = new THREE.Mesh(pitchGeo, std({ ...withRepeat(floorPanelTex({ key: 'pitchcover', tone: 0.07, seed: 57 }), 20, 28), roughness: 0.85 }));
  pitch.position.y = 0.02; pitch.receiveShadow = true; root.add(pitch);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(700, 48), std({ color: 0x0b0b0c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, ZC); ground.userData.noCollide = true;
  root.add(ground);

  // ── the bays in Level 5's front ──
  // At either end a bay holds a big screen (`screenBays` above: set into the
  // tier, filling its notch side to side, not a box standing out). On the
  // south side a bay holds the TV gantry (Level 4):
  // an open platform level with the tier's front row, a glass balustrade
  // along its front, the cameras along it, the commentary desks along its
  // back, under a light canopy.
  const housingMat = std({ color: 0x2a2c30, roughness: 0.7, metalness: 0.3 });
  const cladMat = std({ color: 0x74777c, roughness: 0.75, metalness: 0.2 });
  const treadMat = std({ ...withRepeat(concreteTex({ key: 'standconc0.26', tone: 0.26 }), 1 / 3, 1 / 3), color: 0xffffff, roughness: 0.95 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb2bf, roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const steelDark = std({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.5 });
  const L5h0 = WB_STANDS.levels.find((l) => l.name === 'L5').h0;
  const extrude = (ring, y0, y1, mat) => {
    const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, z + ZC)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.position.y = y1; root.add(m); return m;
  };
  // a wall along a polyline (x, z), from y0 to y1
  const strip = (P, y0, y1, out, off = 0) => {
    for (let i = 0; i + 1 < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], l = Math.hypot(bx - ax, bz - az);
      if (l < 1e-3) continue;
      const g = new THREE.PlaneGeometry(l, y1 - y0);
      g.rotateY(Math.atan2(-(bz - az), bx - ax)); g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2 + ZC); out.push(g);
    }
  };
  for (const b of WB_STANDS.bays) {
    const screen = b.kind === 'screen';
    const f = b.front, mid = f[Math.floor(f.length / 2)];
    const [a0, a1] = b.mouth;
    const tx = a1[0] - a0[0], tz = a1[1] - a0[1], tl = Math.hypot(tx, tz);
    let nx = -tz / tl, nz = tx / tl;
    if (nx * (0 - mid[0]) + nz * (0 - mid[1]) < 0) { nx = -nx; nz = -nz; }
    const yaw = Math.atan2(nx, nz);
    if (screen) {
      const q = screenBays.find((g) => g.b === b);
      const at = (t, d) => [q.cx + q.ux * t - q.nx * d, q.cz + q.uz * t - q.nz * d];
      const w = q.wl + q.wr - 0.2, t0 = (q.wr - q.wl) / 2;
      const foot = b.y0 - 0.4, head = foot + SCREEN_H + 0.3;
      extrude(b.ring, foot - 0.4, foot - 0.1, cladMat);                                     // the sliver of floor before it
      const HB = 1.2;                                                                       // its housing, 1.2 m deep
      extrude([at(-q.wl, q.Sf), at(q.wr, q.Sf), at(q.wr, q.Sf + HB), at(-q.wl, q.Sf + HB)], foot - 0.1, head, cladMat);
      // behind it the tier's own treads run on to the rows behind, unseated
      // (no wall beside the blocks either side, their rows and these level)
      const L5 = WB_STANDS.levels.find((l) => l.name === 'L5'), Df0 = Math.max(...b.front.map(q.D));
      const half = (sg, d) => Math.max(...b.ring.filter((p) => sg * q.T(p) > 0 && Math.abs(q.D(p) - d) < 0.5).map((p) => sg * q.T(p)), 0);
      for (let k = Math.floor((q.Sf + HB - Df0) / L5.D); Df0 + k * L5.D < q.Db; k++) {
        const d0 = Math.max(q.Sf + HB, Df0 + k * L5.D), d1 = Math.min(q.Db, Df0 + (k + 1) * L5.D), dm = (d0 + d1) / 2;
        const l = half(-1, dm), r = half(1, dm);
        if (d1 - d0 < 0.05 || l + r < 1) continue;
        extrude([at(-l, d0), at(r, d0), at(r, d1), at(-l, d1)], foot - 0.1, L5.hs[Math.min(k, L5.hs.length - 1)], treadMat);
      }
      const scr = ledScreen({ w, h: SCREEN_H, tex: ctx.art.texture(w / SCREEN_H), pitch: 0.012, bright: 1.3, kind: 'main', frame: 0.15, light: false });
      const [sx, sz] = at(t0, q.Sf - 0.05);
      scr.position.set(sx, foot + 0.15 + SCREEN_H / 2, sz + ZC); scr.rotation.y = q.yaw;
      root.add(scr); ctx.addScreen(scr, w / SCREEN_H, 'main');
      continue;
    }
    // the gantry
    const deckY = L5h0, top = b.y1 + 0.05;
    const nA = b.ring.length - f.length + 2, A = b.ring.slice(0, nA);
    extrude(b.ring, b.y0, deckY, housingMat);                     // under it, the tier's front carried across
    extrude(b.ring, top - 0.3, top, housingMat);                  // the canopy
    const back = [], rail = [], glassG = [];
    strip(A, deckY, top - 0.3, back);
    strip(f, deckY, deckY + 1.1, glassG);
    for (let i = 0; i + 1 < f.length; i++) {
      const [ax, az] = f[i], [bx, bz] = f[i + 1];
      const d = V3(bx - ax, 0, bz - az), l = d.length();
      const h = new THREE.BoxGeometry(0.08, 0.08, l); h.rotateY(Math.atan2(d.x, d.z)); h.translate((ax + bx) / 2, deckY + 1.12, (az + bz) / 2 + ZC); rail.push(h.toNonIndexed());
    }
    root.add(new THREE.Mesh(mergeGeometries(back.map((g) => g.toNonIndexed())), std({ color: 0x2a2b30, roughness: 0.8, emissive: 0x3a3226, emissiveIntensity: 1, side: THREE.DoubleSide })));   // lit by the gantry's own lights
    root.add(new THREE.Mesh(mergeGeometries(glassG.map((g) => g.toNonIndexed())), glassMat));
    root.add(new THREE.Mesh(mergeGeometries(rail), steelDark));
    // lights under the canopy
    const lamps = [];
    for (let i = 0; i < f.length; i += 3) {
      const [x, z] = f[i], r = Math.hypot(x, z) || 1, off = 2.2;
      const lg = new THREE.BoxGeometry(2.4, 0.04, 0.3); lg.rotateY(Math.atan2(x, z)); lg.translate(x + (x / r) * off, top - 0.33, z + ZC + (z / r) * off); lamps.push(lg.toNonIndexed());
    }
    root.add(new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshBasicMaterial({ color: 0xfff1d8 })));
    // the commentary desks along the back, and the cameras along the front
    const desks = [], cams = [], legs = [];
    for (let i = 0; i + 1 < A.length; i++) {
      const [ax, az] = A[i], [bx, bz] = A[i + 1], l = Math.hypot(bx - ax, bz - az);
      if (l < 0.2) continue;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, r = Math.hypot(cx, cz) || 1;
      const dg = new THREE.BoxGeometry(0.7, 0.06, l); dg.rotateY(Math.atan2(bx - ax, bz - az));
      dg.translate(cx - (cx / r) * 0.5, deckY + 0.74, cz + ZC - (cz / r) * 0.5); desks.push(dg.toNonIndexed());
    }
    let run = 0;
    for (let i = 0; i + 1 < f.length; i++) {
      const [ax, az] = f[i], [bx, bz] = f[i + 1], l = Math.hypot(bx - ax, bz - az);
      run += l;
      if (run < 3.5) continue;
      run = 0;
      const r = Math.hypot(bx, bz) || 1, x = bx + (bx / r) * 1.3, z = bz + (bz / r) * 1.3;
      const body = new THREE.BoxGeometry(0.34, 0.36, 0.7); body.rotateY(Math.atan2(-bx, -bz)); body.translate(x, deckY + 1.55, z + ZC); cams.push(body.toNonIndexed());
      const lens = new THREE.CylinderGeometry(0.1, 0.12, 0.5, 10); lens.rotateX(Math.PI / 2); lens.rotateY(Math.atan2(-bx, -bz));
      lens.translate(x - (bx / r) * 0.55, deckY + 1.58, z + ZC - (bz / r) * 0.55); cams.push(lens.toNonIndexed());
      const post = new THREE.CylinderGeometry(0.06, 0.1, 1.35, 8); post.translate(x, deckY + 0.68, z + ZC); legs.push(post.toNonIndexed());
    }
    root.add(new THREE.Mesh(mergeGeometries(desks), std({ color: 0x2e3036, roughness: 0.6, emissive: 0x1c2430, emissiveIntensity: 1 })));
    if (cams.length) root.add(new THREE.Mesh(mergeGeometries(cams), std({ color: 0x0c0d10, roughness: 0.4, metalness: 0.4 })));
    if (legs.length) root.add(new THREE.Mesh(mergeGeometries(legs), steelDark));
  }

  // ── the roof, as it is built ──
  // Over every seat, open over the pitch. Its steel is white: parallel
  // rafters running north-south every 15.5 m, each an underslung beam (a
  // top chord under the roof, V-shaped legs down to a cable), a prismatic
  // truss round its perimeter above the back of the top tier, a box girder
  // along the north roof's leading edge hung from the arch by forestay
  // cables on pyramid struts, backstays from the arch to the perimeter
  // truss behind it, and the floodlight gantry round the opening. The south
  // roof's leading edge is a bowstring truss hung between four primary
  // trusses that run from the south perimeter to the north roof's leading
  // edge; along the southern edge of the north roof the cladding is
  // translucent, 25 m wide (Kayvani, Structural Design of the Arch and Roof
  // of Wembley Stadium). The cladding rises to 52 m above the pitch.
  const BAND = 25;
  const northEdge = (p) => p.x > 30;
  // the opening, and the translucent band beside it: one hole in the cladding
  const holeRing = roofIn.map((p) => (northEdge(p) ? { x: p.x + BAND, z: p.z } : p));
  const plate = new THREE.Shape(outerRing.map((p) => new THREE.Vector2(p.x, p.z)));
  plate.holes.push(new THREE.Path(holeRing.map((p) => new THREE.Vector2(p.x, p.z))));
  const roofGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.3, bevelEnabled: false, curveSegments: 1 });
  roofGeo.rotateX(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, std({ color: 0x5e6268, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide }));
  roof.position.y = ROOF;
  root.add(roof);
  {
    const run = roofIn.filter(northEdge).sort((a, b) => a.z - b.z);
    const pos = [], idx = [];
    run.forEach((p, i) => {
      pos.push(p.x, ROOF - 0.15, p.z, p.x + BAND, ROOF - 0.15, p.z);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const band = new THREE.Mesh(g, std({ color: 0xa9adb3, roughness: 0.9, emissive: 0x1c1d20, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    root.add(band);
  }
  const inRing = (poly) => (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const inOuter = inRing(outerRing), inOpen = inRing(roofIn);
  const steel = [], cables = [];
  const TOP = ROOF - 0.35;
  // the rafters, and the purlins' lines across them
  for (let k = -11; k <= 11; k++) {
    const z = ZC + k * 15.5;
    const runs = []; let a = null;
    for (let x = -170; x <= 170; x += 0.25) {
      const on = inOuter(x, z) && !inOpen(x, z);
      if (on && a === null) a = x;
      if (!on && a !== null) { runs.push([a, x - 0.25]); a = null; }
    }
    if (a !== null) runs.push([a, 170]);
    for (const [xa0, xb0] of runs) {
      const xa = xa0 + 0.6, xb = xb0 - 0.6, L = xb - xa;
      if (L < 8) continue;
      // the top chord: a fabricated beam just under the cladding
      const beam = new THREE.BoxGeometry(L, 0.9, 0.45); beam.translate((xa + xb) / 2, TOP - 0.45, z); steel.push(beam.toNonIndexed());
      const spans = Math.max(1, Math.round(L / 48));
      for (let sp = 0; sp < spans; sp++) {
        const s0 = xa + (L * sp) / spans, s1 = xa + (L * (sp + 1)) / spans, l = s1 - s0;
        const depth = Math.min(5.5, 1.4 + l * 0.085);
        const nv = Math.max(2, Math.round(l / 7));
        const node = (j) => { const t = (j + 0.5) / nv; return V3(s0 + t * l, TOP - 0.9 - depth * Math.sin(Math.PI * t) ** 0.8, z); };
        let prev = V3(s0, TOP - 0.9, z);
        for (let j = 0; j < nv; j++) {
          const n = node(j), half = Math.min(1.6, l / nv * 0.3);
          // the vee: two legs from the top chord to a node on the cable
          rodInto(steel, V3(n.x - half, TOP - 0.9, z), n, 0.2, 0.09);
          rodInto(steel, V3(n.x + half, TOP - 0.9, z), n, 0.2, 0.09);
          rodInto(cables, prev, n, 0.07);
          prev = n;
        }
        rodInto(cables, prev, V3(s1, TOP - 0.9, z), 0.07);
      }
    }
  }
  // the perimeter truss, over the back of the top tier
  const back = [];
  for (let k = 0; k < outerRing.length; k += Math.max(1, Math.round(outerRing.length / 110))) back.push(outerRing[k]);
  const inward = (p, d) => { const r = Math.hypot(p.x, p.z - ZC) || 1; return V3(p.x - (p.x / r) * d, 0, p.z - ((p.z - ZC) / r) * d); };
  for (let k = 0; k < back.length; k++) {
    const a = inward(back[k], 3.5), b = inward(back[(k + 1) % back.length], 3.5);
    prismInto(steel, V3(a.x, TOP - 0.2, a.z), V3(b.x, TOP - 0.2, b.z), 3.2, 4.2, 0.16);
  }
  // round the opening: the leading edge — a box girder on the north side,
  // a truss elsewhere — with the floodlight gantry under it
  const edge = [];
  for (let k = 0; k < roofIn.length; k += Math.max(1, Math.round(roofIn.length / 140))) edge.push(roofIn[k]);
  const leb = [];
  for (let k = 0; k < edge.length; k++) {
    const a = edge[k], b = edge[(k + 1) % edge.length];
    const north = a.x > 44 && b.x > 44;
    if (north) {
      const d = Math.hypot(b.x - a.x, b.z - a.z), g = new THREE.BoxGeometry(2.6, 3.0, d + 0.05);
      g.rotateY(Math.atan2(b.x - a.x, b.z - a.z)); g.translate((a.x + b.x) / 2, TOP - 1.5, (a.z + b.z) / 2); steel.push(g.toNonIndexed());
      leb.push(a);
    } else prismInto(steel, V3(a.x, TOP - 0.3, a.z), V3(b.x, TOP - 0.3, b.z), 2.4, 2.6, 0.12);
  }
  // the pyramid struts on the north roof's leading edge, and the forestays
  // from them up to the arch, crossing as a Warren truss
  const arch = archCurve({ zc: ZC });
  const archAtZ = (z) => { let s0 = 0, s1 = 1; for (let i = 0; i < 30; i++) { const m = (s0 + s1) / 2; if (arch(m).z < z) s0 = m; else s1 = m; } return arch((s0 + s1) / 2); };
  leb.sort((p, q) => p.z - q.z);
  const apexes = [];
  if (leb.length > 2) {
    const z0 = leb[0].z, z1 = leb[leb.length - 1].z, n = Math.max(2, Math.round((z1 - z0) / 21));
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      let p = leb[0]; for (const q of leb) if (Math.abs(q.z - z) < Math.abs(p.z - z)) p = q;
      const apex = V3(p.x + 2.5, ROOF + 7.5, p.z);
      for (const [dx, dz] of [[-0.8, -3.5], [-0.8, 3.5], [5.5, -3.5], [5.5, 3.5]]) rodInto(steel, V3(p.x + dx, ROOF, p.z + dz), apex, 0.28, 0.18);
      apexes.push(apex);
    }
    for (const ap of apexes) for (const dz of [-24, 24]) {
      const q = archAtZ(ap.z + dz);
      if (q.y > ap.y + 10) rodInto(cables, ap, q, 0.09, 0.09, 4);
    }
  }
  // the backstays, from the arch down to the perimeter truss behind it
  const northBack = back.filter((p) => p.x > 60);
  for (let i = 0; i <= 16; i++) {
    const q = arch(0.2 + (0.6 * i) / 16);
    for (const dz of [-18, 18]) {
      let p = null, bd = Infinity;
      for (const c of northBack) { const d = Math.abs(c.z - (q.z + dz)); if (d < bd) { bd = d; p = c; } }
      if (p && bd < 8) { const b = inward(p, 3.5); rodInto(cables, q, V3(b.x, TOP + 0.3, b.z), 0.09, 0.09, 4); }
    }
  }
  // The south roof's leading edge: an east-west bowstring truss, curved in
  // plan along the opening, five spans between the perimeter truss at either
  // end and the four primary trusses; the central span 140 m long and 15 m
  // deep, a cable bottom chord sagging under a steel top chord, the services
  // gantry along it.
  const southX = (() => {
    // the opening's south edge, eased into one curve and run on east and
    // west over the roof to the perimeter truss
    const pts = roofIn.filter((p) => p.x < -20 && Math.abs(p.z - ZC) < 62);
    let c = 0, x0 = 0;
    { let sxx = 0, sx = 0, sy = 0, sxy = 0; for (const p of pts) { const u = (p.z - ZC) ** 2; sxx += u * u; sx += u; sy += p.x; sxy += u * p.x; } const n = pts.length; c = (n * sxy - sx * sy) / (n * sxx - sx * sx); x0 = (sy - c * sx) / n; }
    return (z) => x0 + c * (z - ZC) ** 2;
  })();
  const PT = [-102, -70, 70, 102];            // the primary trusses, east-west from the centre spot
  // the south perimeter truss's line at z
  const southPerim = (z) => { for (let x = southX(z); x > -200; x -= 0.5) if (!inOuter(x, z)) return x + 3.5; return -130; };
  // the ends of the bowstring: where its curve meets the perimeter truss
  const endZ = (sd) => { for (let d = 74; d < 170; d += 0.5) { const z = ZC + sd * d; if (!inOuter(southX(z), z + sd * 3.5)) return d; } return 150; };
  const ends = [-endZ(-1), endZ(1)];
  const supports = [ends[0], ...PT, ends[1]];
  const chordY = TOP - 0.6;
  const bow = [];                              // the bottom chord, sampled
  for (let k = 0; k + 1 < supports.length; k++) {
    const a = supports[k], b = supports[k + 1], span = b - a, depth = 15 * span / 140;
    const n = Math.max(3, Math.round(span / 7));
    for (let i = 0; i <= n; i++) {
      if (k && !i) continue;
      const t = i / n, z = ZC + a + span * t;
      bow.push({ z, top: V3(southX(z), chordY, z), bot: V3(southX(z), chordY - 1.2 - depth * 4 * t * (1 - t), z) });
    }
  }
  for (let i = 0; i + 1 < bow.length; i++) {
    const p = bow[i], q = bow[i + 1];
    // the top chord: a box girder; the bottom chord: twin cables
    const d = p.top.distanceTo(q.top), g = new THREE.BoxGeometry(1.6, 1.2, d + 0.05);
    g.rotateY(Math.atan2(q.top.x - p.top.x, q.top.z - p.top.z)); g.translate((p.top.x + q.top.x) / 2, chordY, (p.top.z + q.top.z) / 2); steel.push(g.toNonIndexed());
    for (const dx of [-0.6, 0.6]) rodInto(cables, V3(p.bot.x + dx, p.bot.y, p.bot.z), V3(q.bot.x + dx, q.bot.y, q.bot.z), 0.11, 0.11, 5);
    // the struts down to it, and crossed diagonals between
    rodInto(steel, p.top, p.bot, 0.18, 0.14);
    rodInto(cables, p.top, q.bot, 0.05, 0.05, 4); rodInto(cables, q.top, p.bot, 0.05, 0.05, 4);
  }
  if (bow.length) rodInto(steel, bow[bow.length - 1].top, bow[bow.length - 1].bot, 0.18, 0.14);
  // the services gantry, a walkway along the central span inside the truss
  for (let i = 0; i + 1 < bow.length; i++) {
    const p = bow[i], q = bow[i + 1];
    if (Math.abs(p.z - ZC) > 70 || Math.abs(q.z - ZC) > 70) continue;
    const y = chordY - 4.2, d = Math.hypot(q.top.x - p.top.x, q.top.z - p.top.z);
    const g = new THREE.BoxGeometry(1.4, 0.12, d + 0.05);
    g.rotateY(Math.atan2(q.top.x - p.top.x, q.top.z - p.top.z)); g.translate((p.top.x + q.top.x) / 2 + 1.0, y, (p.top.z + q.top.z) / 2); steel.push(g.toNonIndexed());
  }
  // the four primary trusses, north-south from the south perimeter truss to
  // the north roof's leading edge (up to 180 m), where pyramid struts hang
  // them from the arch by forestays; their top chords carry the moving roof
  // panels' bogies
  const NLE = 46;
  for (const dz of PT) {
    const z = ZC + dz, xs = southPerim(z);
    prismInto(steel, V3(xs, TOP - 0.3, z), V3(NLE, TOP - 0.3, z), 3.0, 5.0, 0.2);
    const apex = V3(NLE + 2.5, ROOF + 7.5, z);
    for (const [ddx, ddz] of [[-0.8, -3.5], [-0.8, 3.5], [5.5, -3.5], [5.5, 3.5]]) rodInto(steel, V3(NLE + ddx, ROOF, z + ddz), apex, 0.3, 0.2);
    apexes.push(apex);
    for (const off of [-24, 24]) { const q = archAtZ(z + off); if (q.y > apex.y + 10) rodInto(cables, apex, q, 0.1, 0.1, 4); }
  }
  // the twin catenary cables over the southern edge of the north roof, 300 m
  // from foot to foot of the arch through the struts' heads
  {
    const heads = apexes.slice().sort((a, b) => a.z - b.z);
    const feet = [arch(0.012), arch(0.988)];
    const path = [feet[0], ...heads, feet[1]];
    for (const off of [-0.8, 0.8]) for (let i = 0; i + 1 < path.length; i++) {
      rodInto(cables, V3(path[i].x + off, path[i].y + 0.4, path[i].z), V3(path[i + 1].x + off, path[i + 1].y + 0.4, path[i + 1].z), 0.07, 0.07, 4);
    }
  }
  const steelMat = std({ color: 0xe6e7e8, roughness: 0.5, metalness: 0.35, emissive: 0x2c2e32, emissiveIntensity: 0.2 });
  root.add(new THREE.Mesh(mergeGeometries(steel), steelMat));
  root.add(new THREE.Mesh(mergeGeometries(cables), std({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.7, emissive: 0x202226, emissiveIntensity: 0.2 })));
  // the gantry lights along the roof's inner edge
  const flood = [];
  for (let k = 0; k < edge.length; k += 1) flood.push(pipe.flares.add(V3(edge[k].x, ROOF - 3.4, edge[k].z), KELVIN(5600), 1.8, 0));
  root.add(wembleyArch({ zc: ZC }));

  // the press box: desks in front of every other row, a screen between
  // every two places
  const deskGeo = [], deskScr = [];
  for (const dk of WB_STANDS.desks || []) {
    const sh = new THREE.Shape(dk.polys[0].map(([x, z]) => new THREE.Vector2(x, z + ZC)));
    for (const hole of dk.polys.slice(1)) sh.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z + ZC))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: dk.y - dk.y0, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, dk.y, 0); deskGeo.push(g.toNonIndexed());
    const ring = dk.polys[0];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let z = z0 + 0.6; z < z1 - 0.4; z += 1.2) {
      const m = new THREE.BoxGeometry(0.04, 0.3, 0.5); m.rotateZ(0.25); m.translate((x0 + x1) / 2, dk.y + 0.17, z + ZC); deskScr.push(m.toNonIndexed());
    }
  }
  if (deskGeo.length) {
    root.add(new THREE.Mesh(mergeGeometries(deskGeo), std({ color: 0x33353a, roughness: 0.6 })));
    root.add(new THREE.Mesh(mergeGeometries(deskScr), std({ color: 0x0a0b0d, roughness: 0.3, emissive: 0x28364a, emissiveIntensity: 1 })));
  }

  // ── stage: one LED wall under a ground-supported roof ──
  // As the stadium tours build it: a wide LED wall across the set (it takes the
  // place of IMAG at this size), hung from the roof of a steel stage — four
  // lattice towers carrying a roof grid, the lighting trusses on chains under
  // it, the mains from its front corners — and the side PA on towers of their
  // own, bridged to the roof. A runway out to a cross on the pitch.
  const deck = stageDeck({ w: 78, d: 26, h: DECK, z: 20 });
  root.add(deck);
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 39.75, z: 33, h: DECK, dir: [0, -1] }));
  const RW0 = 33, CZ = 50, XW = 30, XD = 5.2, RW1 = 84, TIP = 10, XH = DECK - 0.8;
  const cross = crossThrust(root, { z0: RW0, z1: RW1, w: 5, crossZ: CZ, crossD: XD, crossW: XW, tip: TIP, h: XH });
  const bRimM = glowMat(APP.accent, 1);
  {
    const g = new THREE.BoxGeometry(XW * 2 + 0.1, 0.05, 0.05); g.translate(0, XH, CZ + XD + 0.02);
    const g2 = new THREE.BoxGeometry(TIP + 0.1, 0.05, 0.05); g2.translate(0, XH, RW1 + 0.02);
    root.add(new THREE.Mesh(mergeGeometries([g, g2]), bRimM));
  }
  const WZ = 8, WW = 62, WH = 21, Y0 = DECK + 1.6;   // the wall's face, size and foot
  const scr = bigScreens(ctx, root, { w: WW, h: WH, y: Y0 + WH / 2, z: WZ, pitch: 0.0059 });
  // the stage's own roof: towers at the corners, beams across at each truss
  // line and along the sides, a black skin over it
  const TX = WW / 2 + 4, SR = 33;                    // the towers' x, the roof's height
  const BZ = [WZ - 0.4, 14.5, 21.5, 28.5];          // the roof's beams across
  groundRoof(root, { tx: TX, zs: BZ, y0: DECK, top: SR });
  // the PA wings: a tower either side past the deck, bridged to the roof
  const PX = 44, PZ = 19, PH = 31;
  for (const sd of [-1, 1]) paWing(root, { x: sd * PX, z: PZ, h: PH, bridge: V3(sd * (TX + 0.8), SR, BZ[2]) });
  // the wall on its own header and chains from the roof's back beam
  screenHang(root, { y: Y0 + WH + 0.3, z: WZ, w: WW, topY: SR - 0.8, n: 7, size: 0.76 });
  // the lighting trusses on chains under the roof's beams
  const LT = 28.5;
  for (const z of BZ.slice(1)) {
    const t = truss(2 * TX - 4, { size: 1.0, finish: 'black' }); t.position.set(0, LT, z); root.add(t);
    root.add(hoists([-28, -14, 0, 14, 28], LT, z, SR - 0.8));
  }
  // no one on stage: the backline set, the microphone at the end stage
  const star = micStand({ height: 1.6 });
  star.position.set(0, XH, RW1 - 1.2); root.add(star);
  for (const [x, z, col] of [[-10, 18, 0x5a1a0e], [10, 18, 0x1a1a1c]]) {
    const gt = guitar({ color: col, bass: x > 0 }); gt.scale.setScalar(0.8); gt.position.set(x, DECK + 0.5, z); gt.rotation.x = -0.28; root.add(gt);
    const m = micStand({ height: 1.5 }); m.position.set(x, DECK, z + 1.4); m.rotation.y = Math.PI; root.add(m);
    const a = ampStack({ count: 2 }); a.position.set(x * 1.2, DECK, z - 6); root.add(a);
  }
  const keysS = keyboardRig(); keysS.position.set(-5, DECK + 1, 13); root.add(keysS);
  const drumRiser = stageDeck({ w: 7, d: 4, h: 1.0, z: 11.5, lip: false }); drumRiser.position.y = DECK; root.add(drumRiser);
  const kit = drumKit({ shell: 0x0c0c10 }); kit.position.set(0, DECK + 1, 11.5); kit.scale.setScalar(1.2); root.add(kit);
  for (let i = 0; i < 12; i++) { const w = wedge({ w: 0.9 }); w.position.set(-22 + i * 4, DECK, 32.4); w.rotation.y = Math.PI; root.add(w); }
  // the subs in a row on the pitch under the barrier, the front fills on the lip
  subLine(root, { x0: -32, x1: 32, z: 34.3, gap: 3.4, count: 2, fills: { xs: [-36, -29, -22, -15, -8, 8, 15, 22, 29, 36], y: DECK, z: 32.6 } });

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  const DT = [[-22, 80], [22, 80]];             // the delay towers, out on the pitch
  const towerLights = [];
  for (const side of [-1, 1]) {
    // the mains from the roof's front corners, the flown subs behind them on
    // the side beam; on the wing towers the side hangs turned out to the side
    // stands and the 270s further round
    paHang(root, { x: side * (WW / 2 + 2.6), y: SR - 2.4, z: BZ[3] + 0.2, boxes: 20, width: 1.5, yaw: -side * 0.04, roofY: SR - 0.8 });
    paHang(root, { x: side * TX, y: SR - 2.4, z: 24.5, boxes: 10, width: 1.4, depth: 1.0, splay: 0.008, roofY: SR - 0.8 });
    paHang(root, { x: side * (PX - 1.2), y: PH - 1.6, z: PZ + 1.0, boxes: 18, width: 1.4, yaw: side * 0.45, roofY: PH - 0.5 });
    paHang(root, { x: side * (PX + 2.5), y: PH - 1.6, z: PZ + 0.4, boxes: 14, width: 1.3, yaw: side * 1.15, roofY: PH - 0.4 });
    for (const dx of [-1.6, 0, 1.6]) towerLights.push(V3(side * PX + dx, PH + 1.2, PZ));
  }
  for (const [x, z] of DT) towerLights.push(...delayTower(root, { x, z, h: 26, boxes: 18, width: 1.4, yaw: -Math.sign(x) * 0.03 }));
  const spots = [], beams = [], washes = [], ups = [], lasers = [];
  // spots on the front truss, beams on the middle one, washes on the back
  for (let i = 0; i < 16; i++) spots.push({ fx: rig.add({ kind: 'spot', pos: V3(-30 + i * 4, LT - 0.7, BZ[3]), length: 90, angle: 0.08 }), i, n: 16, group: 0 });
  for (let i = 0; i < 16; i++) beams.push({ fx: rig.add({ kind: 'beam', pos: V3(-30 + i * 4, LT - 0.7, BZ[2]), length: 140, beamGain: 1.3 }), i, n: 16, group: 1 });
  for (let i = 0; i < 12; i++) washes.push({ fx: rig.add({ kind: 'wash', pos: V3(-27.5 + i * 5, LT - 0.7, BZ[1]), length: 45, beamGain: 0.4 }), i, n: 12, group: 2 });
  const tw = towerLights.map((pos, i) => ({ fx: rig.add({ kind: 'beam', pos, length: 120, beamGain: 1.0 }), i, n: towerLights.length, group: 5 }));
  for (let i = 0; i < 14; i++) ups.push({ fx: rig.add({ kind: 'beam', pos: V3(-33 + i * (66 / 13), DECK + 0.3, 32.2), hang: 'up', length: 220, beamGain: 1.4 }), i, n: 14, group: 3 });
  for (let i = 0; i < 6; i++) lasers.push({ fx: rig.add({ kind: 'laser', pos: V3(-12 + i * 4.8, DECK + 0.3, 32.8), body: false, length: 200, beamGain: 8, flareGain: 0.2, noise: 0.4 }), i, n: 6 });
  for (const k of [3, 7, 11, 14]) rig.light(spots[k].fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5 }), 30000);
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.12, penumbra: 0.7, size: q.shadowSize, far: 200, cast: q.shadows });
  front1.position.set(-10, 34, 96); front1.target.position.set(0, DECK + 1, 20);
  const follow = shadowSpot(KELVIN(5600), 0, { angle: 0.03, penumbra: 0.5, cast: false });
  follow.position.set(0, 40, 140); follow.target.position.set(0, XH, RW1 - TIP / 2);
  const followBeam = rig.add({ kind: 'follow', pos: V3(0, 40, 140), length: 110, body: false, beamGain: 0.5, color: KELVIN(5600) });
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, LT - 1, BZ[1]); stageWash.target.position.set(0, DECK, 24);
  for (const l of [front1, follow, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-50, 40, 60], [50, 40, 60]]) { const l = new THREE.PointLight(0xffffff, 0, 220, 2); l.position.set(x, y, z); root.add(l); fill.push(l); }
  const house = [];
  // house lights from the roof's leading edge, aimed down into the bowl rather
  // than lighting the underside of the roof they hang from
  for (const [x, z] of [[-70, 20], [70, 20], [-70, 110], [70, 110], [0, -10], [0, 150]]) {
    const l = new THREE.SpotLight(KELVIN(5600), 0, 320, 1.1, 1, 2);
    l.position.set(x, ROOF - 2, z); l.target.position.set(x * 0.7, 0, ZC + (z - ZC) * 0.7);
    root.add(l, l.target); house.push(l);
  }
  // the bowl's own light: the sky over the opening, and in house light the
  // floodlit pitch and stands throwing it back up under the roof
  const hemi = new THREE.HemisphereLight(0x10131e, 0x040406, 0.25);
  root.add(hemi);

  // ── people ──
  // the pitch packed from the pit barrier to the far goal, every sold seat taken
  const inPoly = (poly) => (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const inField = inPoly(field);
  const edgeDist = (x, z) => {
    let m = Infinity;
    for (let i = 0; i < field.length; i++) {
      const a = field[i], b = field[(i + 1) % field.length];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2);
      m = Math.min(m, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return m;
  };
  const onPitch = (x, z) => inField(x, z) && edgeDist(x, z) > 3.5;
  const avoid = (x, z) => cross.inside(x, z, 1.2) || DT.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 5) || (Math.abs(x - eye.x) < 5 && Math.abs(z - eye.z) < 4.5);
  const standing = packFloor({ x0: -44, x1: 44, z0: 37, z1: ZC + 66, avoid, inside: onPitch, seed: 177 });
  bigCrowd(root, cu, q, standing.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.05 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.25;
  root.add(aisleField);
  root.add(lightPoints(fohPosition(pipe, root, eye, { riser: 1.2 }), cu, { maxPx: 4 }));

  // ── haze: a stadium is open, so it is thin, but the beams still carry ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  ctx.screenHaze(scr.main, offs.map(([dx, dy]) => hz.add(V3(dx * 30, Y0 + WH / 2 + dy * WH * 0.5, WZ + 1.5), 0xffffff, 0)), offs);
  scr.main.userData.hazePower = 160;
  const hzWash = [hz.add(V3(-20, LT - 2, 20), 0xffffff, 0), hz.add(V3(20, LT - 2, 20), 0xffffff, 0), hz.add(V3(0, DECK + 5, 30), 0xffffff, 0)];

  return {
    root, eye,
    camera: { pos: eye, target: V3(0, DECK + 13.5, 10), fov: 62, near: 0.2, far: 2000 },
    background: new THREE.Color(0x020306),
    fog: new THREE.FogExp2(0x090708, 0.0019),
    hazeDensity: 0.0005, beamGain: 0.45, hazeAmb: new THREE.Color(0x060405), hazeAmbDist: 400,
    bloom: { strength: 0.7, radius: 0.7, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.38, ca: 0.005, grain: 0.04, sat: 1.08, lift: [0.004, 0.005, 0.01] },
    env: { w: 300, h: 60, d: 320, eye, wall: 0x0a0a10, floor: 0x0a0a0c, ambient: 0x06070c, emitters: [
      { w: WW, h: WH, pos: V3(0, Y0 + WH / 2, WZ + 0.2), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: WW / WH },
      { w: 300, h: 300, pos: V3(0, 58, ZC), normal: V3(0, -1, 0), color: 0x18100c, power: 1 },
    ] },
    envIntensity: 0.5,
    update(f) {
      stands.update(f);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 80), stage: STAGE, span: 80 });
      runShow(rig, beams, f, { house: V3(0, 40, 120), stage: STAGE, span: 110 });
      runShow(rig, washes, f, { house: V3(0, 0, 36), stage: STAGE, span: 40, strobe: false });
      runShow(rig, tw, f, { house: V3(0, 40, 90), stage: V3(0, DECK, RW1), span: 80 });
      runShow(rig, ups, f, { house: V3(0, 120, 60), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      runLasers(lasers, f);
      rig.aim(followBeam, V3(star.position.x, XH + 0.8, star.position.z)); followBeam.intensity = 1.1 * show;
      front1.intensity = 60000 * show + 20000 * f.house;
      follow.intensity = 90000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (26000 + 30000 * f.energy + 12000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (600 + 1600 * f.energy) * show; });
      house.forEach((l) => { l.intensity = 38000 * f.house; });
      flood.forEach((h) => { h.intensity = 0.05 + 0.7 * f.house; });
      hemi.intensity = 0.25 + 1.4 * f.house;
      hemi.groundColor.setRGB(0.016 + 0.1 * f.house, 0.016 + 0.09 * f.house, 0.024 + 0.08 * f.house);
      steelMat.emissiveIntensity = 0.12 + 0.5 * f.house;
      hzWash[0].color.copy(f.pal.a); hzWash[1].color.copy(f.pal.b); hzWash[2].color.copy(f.pal.d);
      hzWash.forEach((h) => { h.power = 260 * (0.4 + 0.6 * f.energy + 0.3 * f.kick) * show; });
      deck.userData.lip.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      bRimM.color.setHex(APP.accent).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 18, 16);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.3 * f.house);
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 10);
    },
  };
}
