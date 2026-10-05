// ─────────────────────────────────────────────────────────────────────────────
// The stage samples' parts: LED walls of any shape that share one picture, the
// T runway every sample has, the steel behind a wall, tiers and stairs, the
// side screens. The arena, the dome and the stadium each pick from these by
// `ctx.stage` (0: the stage as built, 1–3: the samples).
// ─────────────────────────────────────────────────────────────────────────────

// The samples' names, per venue, for the lab's switch.
const STAGE_SAMPLES = {
  arena: ['LED 월 + 중앙 계단', '곡면 LED 월', '다층 라이저'],
  dome: ['플랫 파노라마', '랩어라운드', '스카이라인 블록'],
  stadium: ['박스 루프', '아치 캐노피', '초광폭 LED 월'],
};

// LED as one surface of flat pieces sharing one picture: each piece a quad
// given by its corners in the room, [bl, br, tr, tl] seen from the front, and
// its place in the picture [u0, v0, u1, v1] (0..1 of the whole). W × H is the
// picture's size in metres. A black cabinet stands behind each piece.
function ledSurface(ctx, root, pieces, { W, H, pitch = 0.0078, bright = 1.3, light = null, depth = 0.35 }) {
  const aspect = W / H;
  const pos = [], uv = [], idx = [], cab = [];
  for (const { c, u } of pieces) {
    const n = pos.length / 3;
    for (const p of c) pos.push(p.x, p.y, p.z);
    uv.push(u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    // the cabinet: the piece's quad pushed back along its normal, as a box
    const e1 = c[1].clone().sub(c[0]), e2 = c[3].clone().sub(c[0]);
    const nrm = e1.clone().cross(e2).normalize();
    const b = new THREE.BoxGeometry(e1.length() + 0.1, e2.length() + 0.1, depth);
    const m = new THREE.Matrix4().makeBasis(e1.clone().normalize(), e2.clone().normalize(), nrm);
    m.setPosition(c[0].clone().add(c[2]).multiplyScalar(0.5).addScaledVector(nrm, -depth / 2 - 0.02));
    b.applyMatrix4(m); cab.push(b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const face = new THREE.Mesh(geo, ledMaterial({ tex: ctx.art.texture(aspect), pitch, w: W, h: H, bright, kind: 'main' }));
  g.add(face);
  g.add(new THREE.Mesh(mergeGeometries(cab), mats().paint));
  let rect = null;
  if (light) {
    rect = new THREE.RectAreaLight(0xffffff, 1, light.w, light.h);
    rect.position.copy(light.pos); rect.lookAt(light.pos.x, light.pos.y, light.pos.z + 10);
    g.add(rect);
  }
  g.userData = { face, rect, w: W, h: H, lightPower: 1.2 };
  root.add(g);
  ctx.addScreen(g, aspect, 'main');
  return g;
}

// Pieces of a flat wall at depth z, its picture W × H with its bottom at y0
// and its middle at x = 0: rects [x0, x1, y0, y1] in the wall's own metres.
function flatPieces(rects, { W, H, y0, z }) {
  return rects.map(([x0, x1, a, b]) => ({
    c: [V3(x0, y0 + a, z), V3(x1, y0 + a, z), V3(x1, y0 + b, z), V3(x0, y0 + b, z)],
    u: [x0 / W + 0.5, a / H, x1 / W + 0.5, b / H],
  }));
}

// A wing of a wall: from its hinge (hx, hz) out `len` metres, swung forward
// by `ang` (radians, toward +z); its picture from u0 to u1.
function wingPiece({ hx, hz, len, ang, y0, h, u0, u1, H }) {
  const s = Math.sign(hx);
  const ex = hx + s * len * Math.cos(ang), ez = hz + len * Math.sin(ang);
  const [l, r] = s < 0 ? [V3(ex, 0, ez), V3(hx, 0, hz)] : [V3(hx, 0, hz), V3(ex, 0, ez)];
  return { c: [V3(l.x, y0, l.z), V3(r.x, y0, r.z), V3(r.x, y0 + h, r.z), V3(l.x, y0 + h, l.z)], u: [Math.min(u0, u1), 0, Math.max(u0, u1), h / H] };
}

// A concave wall: an arc of radius R whose middle stands at z, `half` radians
// either side of the middle, in n flat strips.
function arcPieces({ R, z, half, y0, h, n = 32 }) {
  const cz = z + R, out = [];
  for (let i = 0; i < n; i++) {
    const a0 = -half + (2 * half * i) / n, a1 = -half + (2 * half * (i + 1)) / n;
    const p0 = V3(R * Math.sin(a0), 0, cz - R * Math.cos(a0)), p1 = V3(R * Math.sin(a1), 0, cz - R * Math.cos(a1));
    out.push({ c: [V3(p0.x, y0, p0.z), V3(p1.x, y0, p1.z), V3(p1.x, y0 + h, p1.z), V3(p0.x, y0 + h, p0.z)], u: [i / n, 0, (i + 1) / n, 1] });
  }
  return out;
}

// A lit frame round a door in a wall (its opening x ±w/2, from y0 up h).
function doorFrame(root, { w, h, y0, z }) {
  const m = glowMat(APP.accent, 1.1);
  const t = 0.08, geos = [];
  for (const [bw, bh, x, y] of [[w + t * 2, t, 0, y0 + h + t / 2], [t, h, -w / 2 - t / 2, y0 + h / 2], [t, h, w / 2 + t / 2, y0 + h / 2]]) {
    const b = new THREE.BoxGeometry(bw, bh, t); b.translate(x, y, z + 0.08); geos.push(b);
  }
  // the opening itself: black, a way through to the dark behind
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ color: 0x010101, roughness: 1 }));
  hole.position.set(0, y0 + h / 2, z - 0.3); root.add(hole);
  root.add(new THREE.Mesh(mergeGeometries(geos), m));
}

// The steel a ground-supported wall hangs on: uprights every `step` metres
// behind it, ledgers across, raked braces back to the deck.
function wallScaffold(root, { x0, x1, y0, y1, z, step = 6, size = 0.8 }) {
  const parts = [];
  const n = Math.max(1, Math.round((x1 - x0) / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    latticeInto(parts, V3(x, y0, z), V3(x, y1, z), size, 0.04);
    latticeInto(parts, V3(x, y0, z - 5), V3(x, y0 + (y1 - y0) * 0.6, z - 0.4), size * 0.6, 0.03);
  }
  for (const y of [y0 + (y1 - y0) * 0.5, y1 - 0.4]) latticeInto(parts, V3(x0, y, z), V3(x1, y, z), size, 0.04);
  root.add(new THREE.Mesh(mergeGeometries(parts), mats().black));
}

// The T: a runway from the deck's front (z0) to z1, then a crossbar across its
// end. Returns a test for a point on it (with a margin), for the seats.
function tRunway(root, { z0, z1, w, crossW, crossD, h }) {
  root.add(stageDeck({ w, d: z1 - z0, h, z: (z0 + z1) / 2, lip: false }));
  root.add(stageDeck({ w: crossW, d: crossD, h, z: z1 + crossD / 2 }));
  // the accent along the runway's edges, at deck height
  const m = glowMat(APP.accent, 1), geos = [];
  for (const s of [-1, 1]) { const b = new THREE.BoxGeometry(0.04, 0.04, z1 - z0); b.translate(s * (w / 2 + 0.02), h - 0.04, (z0 + z1) / 2); geos.push(b); }
  root.add(new THREE.Mesh(mergeGeometries(geos), m));
  return (x, z, mg = 0) => (Math.abs(x) < w / 2 + mg && z > z0 - mg && z < z1 + mg)
    || (Math.abs(x) < crossW / 2 + mg && z > z1 - mg && z < z1 + crossD + mg);
}

// A raised deck standing on another (a riser, a tier, a platform).
function tierDeck(root, { w, d, h, z, x = 0, y }) {
  const t = stageDeck({ w, d, h, z, x, lip: false });
  t.position.y = y; root.add(t);
  return t;
}

// A riser's front as a band of LED in the palette's colours.
function riserBand(ctx, root, { w, h, x = 0, y, z }) {
  const b = ledScreen({ w, h, tex: ctx.art.cover(), pitch: 0.01, bright: 1.1, kind: 'ribbon', frame: 0, light: false });
  b.position.set(x, y + h / 2, z + 0.01); root.add(b);
  ctx.addScreen(b, 1, 'ribbon');
}

// Stairs with lit nosings: from y0 at (x, z) up to y1, climbing toward -z.
function litStairs(root, { x = 0, z, y0, y1, width, run = 0.3, riseMax = 0.2 }) {
  root.add(stageSteps({ x, z, h: y1, y0, width, run, riseMax }));
  const n = Math.max(1, Math.ceil((y1 - y0) / riseMax - 1e-6)), rise = (y1 - y0) / n;
  const geos = [];
  for (let i = 0; i < n; i++) { const b = new THREE.BoxGeometry(width, 0.025, 0.025); b.translate(x, y0 + rise * (i + 1) - 0.015, z - i * run + 0.005); geos.push(b); }
  root.add(new THREE.Mesh(mergeGeometries(geos), glowMat(APP.accent, 1.2)));
}

// The side screens: a pair, 16:9, turned in toward the middle.
function imagPair(ctx, root, { w, x, y, z, yaw, pitch = 0.0078, legs = 0 }) {
  const aspect = 16 / 9, out = [];
  for (const side of [-1, 1]) {
    const s = ledScreen({ w, h: w / aspect, tex: ctx.art.texture(aspect), pitch, bright: 1.2, kind: 'main', frame: 0.25, light: false });
    s.userData.bezel?.color.setScalar(0);
    s.position.set(side * x, y, z); s.rotation.y = -side * yaw;
    root.add(s); ctx.addScreen(s, aspect, 'main'); out.push(s);
    if (legs) {
      // a tower to stand it on
      const parts = [];
      for (const dx of [-w * 0.3, w * 0.3]) {
        const p = V3(dx, 0, -0.8).applyAxisAngle(V3(0, 1, 0), -side * yaw).add(V3(side * x, 0, z));
        latticeInto(parts, V3(p.x, 0, p.z), V3(p.x, y + w / aspect / 2, p.z), 1.2, 0.05);
      }
      root.add(new THREE.Mesh(mergeGeometries(parts), mats().black));
    }
  }
  return out;
}
