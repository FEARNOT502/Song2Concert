// ─────────────────────────────────────────────────────────────────────────────
// DOME — Tokyo Dome: an air-supported membrane, 1.24 million m³, its ring
// leaning 1/10 down from the infield to the outfield, from FOH 55 m out on
// the field. Blue seats in the 1st-floor stand, the balcony band and the
// steep 2nd-floor stand standing out over it under the roof; the lights and
// loudspeakers hung from the roof's cables; arena seats in
// blocks on the field; a short runway to a long stage across the field; a
// sea of lightsticks under
// central control.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, DEG, KELVIN, V3, clamp, lerp, prng, std, floorPanelTex, glowMat, ringTint } from '../core.js';
import { lightPoints } from '../people.js';
import { hoists, micStand, shadowSpot, stageDeck, stageSteps, truss, wedge } from '../rig.js';
import { bigCrowd, bigScreens, crossThrust, diagonalTowers, roundBlocks, roundStage, delayTower, fixtureRow, flashOnCrowd, flashUnits, floorChairs, fohPosition, fromRow, groundRoof, paCorner, paHang, paPair, paWing, runBlinders, runShow, runStrobes, scaffoldMasking, screenHang, section, stageRing, subLine, thinRow, wallStrip } from '../show.js';
import { buildStands, decodeSeats } from '../stands.js';
import { TD_STANDS } from './td-data.js';

let _domeCatalog = null;
export function getDomeSeatCatalog() {
  if (_domeCatalog) return _domeCatalog;
  const ZH = 114;
  const bNames = TD_STANDS.blockNames || [];
  const byBlock = new Map();
  for (const L of TD_STANDS.levels) {
    const S = decodeSeats(L.seats), sk = L.seatScale ?? 10;
    const LB = L.labels ? decodeSeats(L.labels) : null;
    if (!LB) continue;
    for (let i = 0; i < S.length; i += 4) {
      const rx = S[i] / sk, rz = S[i + 1] / sk, rIdx = S[i + 2], yaw = S[i + 3] * DEG;
      const x = rx, z = rz + ZH;
      const y = L.hs ? L.hs[Math.min(rIdx, L.hs.length - 1)] : L.h0 + L.rise * rIdx;
      const lk = (i >> 2) * 3;
      const block = bNames[LB[lk]] ?? L.name;
      const row = LB[lk + 1];
      const num = LB[lk + 2];
      let rm = byBlock.get(block);
      if (!rm) { rm = new Map(); byBlock.set(block, rm); }
      let nm = rm.get(row);
      if (!nm) { nm = new Map(); rm.set(row, nm); }
      nm.set(num, { x, y, z, yaw, block, row, num, level: L.name });
    }
  }
  const blocks = [...byBlock.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const getRows = (block) => {
    const rm = byBlock.get(block);
    return rm ? [...rm.keys()].sort((a, b) => a - b) : [];
  };
  const getNums = (block, row) => {
    const nm = byBlock.get(block)?.get(Number(row));
    return nm ? [...nm.keys()].sort((a, b) => a - b) : [];
  };
  const getSeat = (block, row, num) => byBlock.get(block)?.get(Number(row))?.get(Number(num)) || null;
  _domeCatalog = { blocks, byBlock, getRows, getNums, getSeat };
  return _domeCatalog;
}

export function membraneMaterial() {
  // The roof from inside, as the photographs show it: cables each way, 14 from one big triangle's side to the next, the
  // same distance apart, none on either centre line, with a
  // clamp at each crossing; the fabric between them sewn in widths.
  // On each of the four diagonals the net stops at one crossing: past it, out to
  // the ring, one big plain triangle, its point at that crossing, its two short
  // sides the last two cables, its long side (about 36 m) the ring. A warm
  // off-white, lit through by the daylight outside.
  // Closer up, as the photographs show it (from home, from the 2nd floor, by
  // day and by night): the cables running from home to centre field (x = const)
  // are thin and dark, taut and straight; the other way the fabric hangs a little
  // between them, so each seam across (z = const) sags in a shallow arc from one
  // dark cable to the next and reads as a scalloped grey line, much fainter than
  // the cables. The rows of fabric hang between the seams like shingles: a soft
  // shadow along each arc, pale in the middle. A small fitting at each crossing,
  // a pale lamp either side of it; and from the crown out to each big triangle's
  // point a staircase of pale lit strips along the cables, step by step down the
  // diagonal. The colour a warm grey-white; by day warmer, lit through.
  const ZC = 81, TRI_X = 50.4, TRI_Z = 50.4, GRID = 2 * TRI_X / 13;
  const LAYER = '1.6';               // metres between the inner liner and the outer skin
  const GL = GRID.toFixed(4), HG = (GRID / 2).toFixed(4);
  // how far the fabric hangs between the straight cables, and how much each row bellies between its seams (m)
  const SAG_A = '0.85', SAG_B = '0.22';
  const m = std({ color: 0xe5ddcf, roughness: 0.92, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBounce = { value: new THREE.Color(0) };
    // (how bright the lit strips and the small lamps on the roof read: daylight through the fabric and the house's own light
    // on them — full with the house up, very faint during the show)
    sh.uniforms.uSky = m.userData.uSky = { value: 1 };
    m.userData.shader = sh;
    const triGL = `float bigTri(vec2 c, float zs, float e) { return smoothstep(${TRI_X.toFixed(1)} + e, ${TRI_X.toFixed(1)} + e + 0.2, abs(c.x)) * smoothstep(${TRI_Z.toFixed(1)} + e, ${TRI_Z.toFixed(1)} + e + 0.2, abs(zs)); }
      // (the hang dies away over the first few metres into each triangle, so the row beside it meets it without a step)
      float triHang(vec2 c) { return smoothstep(${TRI_X.toFixed(1)}, ${(TRI_X + 3.5).toFixed(1)}, abs(c.x)) * smoothstep(${TRI_Z.toFixed(1)}, ${(TRI_Z + 3.5).toFixed(1)}, abs(c.y)); }`;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; varying float vRho; attribute float aRho; ${triGL}`)
      // the fabric hangs between the straight cables, less and less out to the ring; the triangles lie flat
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 c = position.xz - vec2(0.0, ${ZC.toFixed(1)});
          float dx = fract((c.x + ${HG}) / ${GL}) - 0.5, dz = fract((c.y + ${HG}) / ${GL}) - 0.5;
          // (in the mesh half the kink at the cable: the mesh is a metre or so fine, and a full kink smeared over
          // its triangles made the straight cables wobble, none made the seams' arcs wavy; the shading keeps it all)
          float ax = cos(3.14159 * dx); ax = 0.5 * ax * ax + 0.5 * (1.0 - 4.0 * dx * dx);
          transformed.y -= (${SAG_A} * ax + ${SAG_B} * ax * (1.0 - 4.0 * dz * dz)) * (1.0 - smoothstep(0.84, 0.98, aRho)) * (1.0 - triHang(c));
          vRho = aRho;
        }`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; varying float vRho; uniform vec3 uBounce; uniform float uSky; ${triGL}
        // the staircase of slots down each diagonal: 1 inside the band from w0 to w1 metres past its cable, on the cells along the diagonal
        float stripAt(vec2 c, vec2 fw, float w0, float w1) {
          vec2 a = abs(c) / ${GL};
          float Lb = floor(a.y) + 0.5, La = floor(a.x) + 0.5;
          float sB = step(Lb - 1.0, a.x) * step(a.x, Lb) * step(Lb, 6.6) * smoothstep(w0, w0 + fw.y, (a.y - Lb) * ${GL}) * (1.0 - smoothstep(w1, w1 + fw.y, (a.y - Lb) * ${GL}));
          float sA = step(La, a.y) * step(a.y, La + 1.0) * step(La, 5.6) * smoothstep(w0, w0 + fw.x, (a.x - La) * ${GL}) * (1.0 - smoothstep(w1, w1 + fw.x, (a.x - La) * ${GL}));
          return max(sA, sB);
        }`)
      // (the hang's slope, so the light falls on it as on the real thing: the normal faces into the house, down)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 c = vWP.xz - vec2(0.0, ${ZC.toFixed(1)});
          float dx = fract((c.x + ${HG}) / ${GL}) - 0.5, dz = fract((c.y + ${HG}) / ${GL}) - 0.5;
          float k = (1.0 - smoothstep(0.84, 0.98, vRho)) * (1.0 - triHang(c)) * 8.0 / ${GL};
          vec3 g = vec3((${SAG_A} + ${SAG_B} * (1.0 - 4.0 * dz * dz)) * dx, 0.0, ${SAG_B} * (1.0 - 4.0 * dx * dx) * dz) * k;
          normal = normalize(normal + mat3(viewMatrix) * g);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec2 c = vWP.xz - vec2(0.0, ${ZC.toFixed(1)});
          vec2 fw = fwidth(c) + 1e-4;
          float fx = fract((c.x + ${HG}) / ${GL}), dx = fx - 0.5;
          float zs = c.y;
          float dz = fract((zs + ${HG}) / ${GL}) - 0.5;
          // distance (m) to the nearest straight cable, and to the nearest seam across
          float along = abs(fract((c.x + ${HG}) / ${GL} + 0.5) - 0.5) * ${GL};
          float across = abs(fract((zs + ${HG}) / ${GL} + 0.5) - 0.5) * ${GL};
          float inTri = bigTri(c, zs, 0.3), net = 1.0 - inTri;
          // the cables: about 0.18 m across, near-black; never drawn under a pixel or so, but then only as dark
          // as their real width would make that pixel (with a floor, so from the far side they still read, thinly)
          float hw = max(0.09, fw.x * 0.6);
          float kA = 0.78 * max(0.09 / hw, 0.42);
          float aLine = (1.0 - smoothstep(hw, hw + fw.x, along)) * net;
          // the seams across: thinner and grey; but the two that bound each big triangle are cables, as dark
          float edgeB = step(${TRI_X.toFixed(1)}, abs(c.x));
          float rb = mix(0.05, 0.09, edgeB), xw = max(rb, fw.y * 0.6);
          float kB = mix(0.42, 0.78, edgeB) * max(rb / xw, mix(0.3, 0.42, edgeB));
          float bLine = (1.0 - smoothstep(xw, xw + fw.y, across)) * net;
          // the fitting at each crossing (dark, a little wider than the cable), and its pale lamp either side
          float cover = min(1.0, 0.25 / max(fw.x, fw.y));
          float clampD = (1.0 - smoothstep(0.26, 0.26 + fw.x, along)) * (1.0 - smoothstep(0.2, 0.2 + fw.y, across)) * net * cover;
          float lamp = (1.0 - smoothstep(0.17, 0.17 + max(fw.x, fw.y), length(vec2(along - 0.55, across)))) * net * cover * cover;
          // the staircase of lit strips down each diagonal, from the crown to the triangle's point, beside the cables
          // (each is a slot in the inner liner, beside a cable, through which the outer skin shows, the daylight in it: the
          // outer skin is ${LAYER} m above, so what shows through a slot moves with where it is seen from — square on, the
          // whole slot is lit; from the side the liner's edge covers part of it, and from far round, all of it)
          vec3 vdir = normalize(vWP - cameraPosition);
          vec2 par = vdir.xz / max(vdir.y, 0.12) * ${LAYER};
          float strip = stripAt(c, fw, 0.1, 0.75) * stripAt(c + par, fw, -0.15, 1.0) * net * min(1.0, 0.65 / max(fw.x, fw.y));
          // the fabric's widths, side by side between the cables: faint
          float seam = (1.0 - smoothstep(0.0, fwidth(fx * 4.0) * 1.5 + 0.02, abs(fract(fx * 4.0 + 0.5) - 0.5) * 2.0)) * net;
          // the big triangles' own widths: faint, square to the ring
          float tv = (abs(c.x) - abs(zs)) / 1.41421 / 4.5;
          float tseam = (1.0 - smoothstep(0.0, fwidth(tv) * 1.5 + 0.01, abs(fract(tv + 0.5) - 0.5) * 2.0)) * inTri;
          // each row of fabric: a soft shadow just past the seam it hangs from, pale through its middle; the triangles plain, a touch paler
          float shade = mix((1.0 - 0.07 * 4.0 * dx * dx) * (1.0 - 0.12 * smoothstep(0.15, 0.5, abs(dz))), 1.07, inTri);
          // (every line the same in the fabric's own colour and in what the show throws on it: dark or lit, they stay sharp)
          float lines = (1.0 - kA * aLine) * (1.0 - kB * bLine * (1.0 - aLine)) * (1.0 - 0.55 * clampD) * (1.0 - 0.06 * seam) * (1.0 - 0.06 * tseam);
          float lit = max(0.35 * lamp, 0.45 * strip) * (1.0 - aLine) * uSky, pale = 1.0 + lit;
          diffuseColor.rgb *= shade * lines * pale;
          totalEmissiveRadiance += uBounce * shade * lines * pale + diffuseColor.rgb * 0.7 * lit;
        }`);
  };
  m.customProgramCacheKey = () => 'membrane14';
  return m;
}

export function buildDome(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const DECK = 2.6;
  // FOH, and the listener there: at the very back of the field's seats, in
  // the middle, the blocks either side of it
  const eye = V3(0, 1.6 + 1.0, 122);
  // (the end stage's; round, the field's middle: set below)
  let STAGE = V3(0, DECK, 28);
  const round = ctx.mode === '360';
  // The ballpark as the official seating map draws it: the field is the open
  // ground inside the 1st floor's front rows; home plate is behind FOH, the
  // stage stands in front of the centre-field fence.
  const ZH = 114;                 // home plate
  const OFF = V3(0, 0, ZH);
  const fieldRing = TD_STANDS.field[0][0].map(([x, z]) => ({ x, z: z + ZH }));
  if (round) { const zs = fieldRing.map((p) => p.z); STAGE = V3(0, DECK, (Math.min(...zs) + Math.max(...zs)) / 2); }
  // the fence round the field and, along the lines, behind the excite seats
  const fenceRing = (TD_STANDS.fence ? TD_STANDS.fence[0][0] : TD_STANDS.field[0][0]).map(([x, z]) => ({ x, z: z + ZH }));
  const inRing = (ring, x, z) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const phi = (x, z) => Math.abs(Math.atan2(x, ZH - z)) / DEG;   // 0 at centre field, 45 at the poles

  // ── field ──
  const fieldShape = new THREE.Shape(fieldRing.map((p) => new THREE.Vector2(p.x, -p.z)));
  const fieldGeo = new THREE.ShapeGeometry(fieldShape, 1);
  fieldGeo.rotateX(-Math.PI / 2);
  const fuv = fieldGeo.attributes.uv; const fpos = fieldGeo.attributes.position;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / 16, fpos.getZ(i) / 16);
  const field = new THREE.Mesh(fieldGeo, std({ ...floorPanelTex({ key: 'domefloor', tone: 0.1 }), roughness: 0.8 }));
  field.position.y = 0.02; field.receiveShadow = true; root.add(field);

  // ── the roof's geometry, from the drawings of it ──
  // In plan a superellipse set corner-on to home plate: 201 m from corner to
  // corner along the home–centre axis and across it, its sides bulging out
  // (180.6 m apart across the diagonals), its centre 33 m out from home
  // plate. The compression ring round it leans 1/10 from the infield down to
  // the outfield, 44.7 m over the field at the home corner and 24.7 m at the
  // centre-field corner; the air holds the membrane 25 m over the ring's
  // plane, its crown 60.7 m up, 20 m in from the centre towards home. The
  // building's wall stands 5 m out from the ring.
  const ZC = ZH - 33, RA = 100.5, NE = 1.53, RISE = 25, DOME_WALL = 1.09;
  const ringY = (z) => 34.7 + 0.1 * (z - ZC);
  const norm = (x, z) => (Math.abs(x / RA) ** NE + Math.abs((z - ZC) / RA) ** NE) ** (1 / NE);
  const roofAt = (x, z) => ringY(z) + RISE * (1 - Math.min(1, norm(x, z)) ** 2);
  const edge = (t, rho = 1) => {
    const c = Math.cos(t), sn = Math.sin(t);
    return { x: rho * RA * Math.sign(c) * Math.abs(c) ** (2 / NE), z: ZC + rho * RA * Math.sign(sn) * Math.abs(sn) ** (2 / NE) };
  };

  // ── the stands, from the official seating map ──
  // The 1st floor: blocks A (rows 1–26) and B (27–47) round the infield with
  // the walkway between them, entered from the concourse behind by the
  // numbered passages at the back; the outfield's F blocks above the fence.
  // The balcony (C) over the back of the 1st floor, pole to pole round home.
  // The 2nd floor: D (rows 1–10) and E (11 up to 33, deepest behind home)
  // with the walkway between, the passages from its concourse opening onto
  // it; its front stands out 12 m over the 1st floor. The current concert
  // model uses blue seating throughout, including the balcony and boxes.
  // Sold out as a concert sells it: every
  // seat that can see the face of the wall, the restricted-view ones beside
  // the stage and the outfield's ends past the poles included; the outfield
  // behind the set not.
  // ── the box seats, as the data names them (td_labels.py's boxRows, each seat by its label) ──
  // The Sky Terrace (the 2022 renewal): rows 8 and 9 of D14-D18 and D32-D38, two boxes of four a row, blue seats
  // behind a long light-wood counter at table height with cup holes, on a wooden front down to the tread, light-wood
  // half-height partitions between the boxes. On the 3B side's 1st floor behind B31-B39, in the rows the chart leaves
  // out (td_boxes.py): THE 3rd PLATINUM BOX, blue seats with black tables and partitions in this latest-seat specification;
  // the structural arrangement follows the older supplier photographs. The press seats, blue seats at plain dark
  // desks (no photograph found: the user's account), no partitions.
  const SEAT_BLUE = 0x214797;
  // (their counters and partitions: light wood for the Sky Terrace, black for the Platinum Box, dark for the press desks)
  const BOX_WOOD = { terrace: 0xc9a06a, platinum: 0x1c1c1e, press: 0x2b2d31 };
  const boxOf = new Map();          // `${level}:${x * scale}:${z * scale}` -> its box row
  {
    const want = new Map((TD_STANDS.boxRows ?? []).map((b) => [`${b.level}:${b.block}:${b.row}`, b]));
    const names = TD_STANDS.blockNames || [];
    for (const L of TD_STANDS.levels) {
      if (!L.labels || !(TD_STANDS.boxRows ?? []).some((b) => b.level === L.name)) continue;
      const S = decodeSeats(L.seats), LB = decodeSeats(L.labels);
      for (let i = 0, j = 0; i < S.length; i += 4, j += 3) {
        const b = want.get(`${L.name}:${names[LB[j]]}:${LB[j + 1]}`);
        if (b) boxOf.set(`${L.name}:${S[i]}:${S[i + 1]}`, b);
      }
    }
  }
  const scaleOf = new Map(TD_STANDS.levels.map((l) => [l.name, l.seatScale ?? 10]));
  const boxAt = (name, x, z) => { const k = scaleOf.get(name) ?? 10; return boxOf.get(`${name}:${Math.round(x * k)}:${Math.round(z * k)}`); };
  // ── the main screen's line (built further on) ──
  // Along the curve of the outfield stand's back, over its back rows, where
  // the columns at the heads of its aisles stand: they carry it.
  // (the columns that carry it: out to the third vomitory either side of the middle, 50 and 57, and the aisle columns between)
  // (td_tidy.py: the vomitories' columns carry their passage's number, `vom`; the band's ends at 50 and 57)
  const scrCols = TD_STANDS.pillars.filter((c) => c.vom === 50 || c.vom === 57);
  const scrEnd = Math.max(...(scrCols.length ? scrCols : [49, 56].map((i) => TD_STANDS.pillars[i])).map((c) => Math.abs(Math.atan2(c.x, -c.z) / DEG))) + 0.2;
  const isScr = (c) => Math.hypot(c.x, c.z) > 110 && Math.abs(Math.atan2(c.x, -c.z) / DEG) <= scrEnd;
  const MV = (() => {
    const F = TD_STANDS.levels.find((l) => l.name === 'F');
    let ftop = 0;
    const far = new Map();                 // the stand's back, by the angle from home (0 at centre field)
    // (with the backscreen's rows, set apart from the stand's: the line has to run on across the middle)
    for (const r of [...F.rows, ...(TD_STANDS.backscreen ?? [])]) {
      ftop = Math.max(ftop, r.y);
      for (const p of r.polys) for (const ring of p) for (const [x, z] of ring) {
        const a = Math.round(Math.atan2(x, -z) / DEG * 2) / 2, d = Math.hypot(x, z);
        if (!(far.get(a) >= d)) far.set(a, d);
      }
    }
    const angs = [...far.keys()].filter((a) => Math.abs(a) <= 44).sort((u, v) => u - v);
    const back = angs.map((a) => { let sm = 0, w = 0; for (const b of angs) if (Math.abs(b - a) <= 3) { sm += far.get(b); w++; } return { a, d: sm / w - 5.9 }; });
    // one gentle curve, the same both sides; any column it would come through is set back until it stands 1.7 m behind the face
    const D0 = Math.min(125, back.reduce((m, b) => (Math.abs(b.a) < Math.abs(m.a) ? b : m)).d), KC = 0.012;
    back.forEach((b) => { b.d = D0 - KC * b.a * b.a; });
    const colMoved = new Map();
    for (const c of TD_STANDS.pillars) {
      if (!isScr(c)) continue;
      const r = Math.hypot(c.x, c.z), a = Math.atan2(c.x, -c.z) / DEG, need = D0 - KC * a * a + 1.7 - r;
      if (need > 0) colMoved.set(c, { x: c.x * (r + need) / r, z: c.z * (r + need) / r });
    }
    const pts = back.map(({ a, d }) => ({ x: Math.sin(a * DEG) * d, z: ZH - Math.cos(a * DEG) * d, a }));
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const mid = len[back.findIndex((b) => b.a >= 0)];
    const along = (w) => pts.filter((_, i) => Math.abs(len[i] - mid) <= w / 2);
    // the band runs from column 50 to column 57, the third vomitory either side of the middle, a little past each
    const sup = TD_STANDS.pillars.filter((c) => isScr(c) && !c.aisle);
    const armLen = sup.length ? Math.max(...sup.map((c) => { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = Math.hypot(q.x - c.x, q.z - (c.z + ZH)); if (d < bd) { bd = d; bi = i; } }); return Math.abs(len[bi] - mid); })) : 46;
    const band = along(2 * (armLen + 1.5)), lower = along(20);
    // level, its top 2 m under the floods where the ring is lowest over it
    // (room for the sign over its middle)
    const y1 = Math.min(...band.map((p) => ringY(p.z))) - 1.6 - 3.0, y0 = y1 - 7.5, yl = y0 - 5.4;
    return { F, ftop, pts, len, mid, band, lower, y0, y1, yl, a0: band[0].a, a1: band[band.length - 1].a, colMoved };
  })();
  // (the columns under it end at its frame)
  // (and the band's two end columns, at the second vomitory from each pole (50, 57): moved forward to their mouths they
  // stand a touch outside the band's angle, but they carry its ends: they stop at its top, the arms on them, the user's call)
  const underMV = (p) => p.vom === 50 || p.vom === 57 || (Math.hypot(p.x, p.z) > 110 && (() => { const a = Math.atan2(p.x, -p.z) / DEG; return a >= MV.a0 && a <= MV.a1; })());
  // (a column with nothing over it from the data, y1 99, goes on up to the ring)
  // (the columns that carry the screen stop behind its frame: nothing shows over it)
  // (and those set back take their number plates with them)
  const movedFrom = [...MV.colMoved].map(([c, q]) => ({ c, q }));
  const TD = {
    ...TD_STANDS,
    pillars: TD_STANDS.pillars.map((p) => (isScr(p) || p.y1 >= 99 ? { ...p, ...(MV.colMoved.get(p) ?? {}), y1: underMV(p) ? MV.y1 + 0.3 : ringY(p.z + ZH) - 1.2 } : p)),
    signs: TD_STANDS.signs.map((s) => { const m = movedFrom.find(({ c }) => Math.hypot(c.x - s.x, c.z - s.z) < 0.2); return m ? { ...s, x: m.q.x, z: m.q.z } : s; }),
  };
  const stands = buildStands(TD, {
    // (the lightsticks' blocks: the real ones, as each seat is labelled; where
    // a level has no labels, by the stands' own aisles)
    byAisle: true,
    // (one wedge across every level, cut where the 1st floor's aisles run:
    // A's and F's blocks each one, every other block whole to the wedge it
    // mostly lies in, so a wedge runs up the house block over block)
    sectors: ['A', 'F'], sectorBlocks: true, round,
    // (a B block shares its aisles with the A block of its number in front of
    // it, across the walkway: the same wedge)
    sectorPair: (name) => (/^B\d\d$/.test(name) ? `A${name.slice(1)}` : name === 'A01' || name === 'A49' ? name : null),
    // (the balcony's and the 2nd floor's blocks, over the 1st floor's, cut up
    // their rows where the aisles under them run, each part the colour of the
    // block under it; E's as D's in front of it)
    sectorOver: { E: 'D' },
    // (the concrete a clean, neutral light grey, as the photographs show it: no warm cast of its own, little mottling)
    offset: OFF, stage: STAGE, seed: 400, concreteTone: 0.64, concreteWarm: 0.0, concreteEven: 0.8, roofY: (x, z) => ringY(z + ZH) + 0.3,
    seatColors: Object.fromEntries(['A', 'B', 'F', 'K', 'G', 'C', 'D', 'E'].map((level) => [level, SEAT_BLUE])),
    // F rows are already limited to their PDF blocks, including F11's
    // six-row pocket. A broad angular mask used to hide named seats too.
    crowd: !!q.crowd,
    // the lightsticks' floors as the building counts them, [floor, band from
    // the front]: the 1st floor (the field-level seats, A, B behind it, and
    // the outfield's F beside them), the balcony, the 2nd floor (D, E behind)
    tiers: { G: [1, 0], A: [1, 1], B: [1, 2], F: [1, 1], C: [2, 0], D: [3, 0], E: [3, 1] },
    // (round, every seat; else those in front of the wall: face z 19.6, 66 m wide)
    sold: round ? () => true : (x, z) => z - 19.6 > Math.max(4, 0.12 * (Math.abs(x) - 33)),
    // the side walls where a stand drops away: the stands' own concrete,
    // not dark steel
    // (the balcony's own front rail from the data is not drawn: its glass front is, below, along rimCS)
    materials: {
      rail: std({ color: 0xb7b9b8, roughness: 0.88, side: THREE.DoubleSide }),
      wall: std({ color: 0xc3c5c4, roughness: 0.9, side: THREE.DoubleSide }),
      interior: std({ color: 0xc4c7c5, roughness: 0.9, emissive: 0x787d7c, emissiveIntensity: 0.5 }),
      ceiling: std({ color: 0xd3d5d2, roughness: 0.92, emissive: 0x818684, emissiveIntensity: 0.45 }),
      stair: std({ color: 0xb1b4b2, roughness: 0.9, emissive: 0x626765, emissiveIntensity: 0.45 }),
      floor: std({ color: 0xa7adab, roughness: 0.72, emissive: 0x5e6663, emissiveIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      levelRail: { C: new THREE.MeshBasicMaterial({ visible: false }) },
    },
  });
  root.add(stands.group);
  // The outfield's columns (td_tidy.py): plain grey, as the 1st floor's, at the head of every aisle and in the front
  // of every vomitory's mouth. Anything here with a glow of its own (stands.js: `houseLit`) goes down with the
  // house lights in the show.
  const houseLit = [];
  stands.group.traverse((o) => { const m = o.material; if (m?.userData?.houseLit && !houseLit.some(([q]) => q === m)) houseLit.push([m, m.emissiveIntensity]); });
  {
    const ZO = OFF.z ?? ZH, XO = OFF.x ?? 0;
    const grp = new THREE.Group();
    // (each vomitory's mouth: the passage on from the top of its stairs into the concourse between green-painted
    // walls, under a soffit (12.webp), 2.4 m deep)
    const greenM = std({ color: 0x2e5a4e, roughness: 0.9, side: THREE.DoubleSide }), soffitM = greenM;   // (the doorway's head green as its walls: the passage on to the concourse)
    for (const v of TD.levels.find((l) => l.name === 'F')?.voms ?? []) {
      if (v.top == null || v.roof == null) continue;
      const [ux, uz] = v.u, vx = -uz, vz = ux, hw = v.w / 2, D = 2.4, h = v.roof - v.top;
      const at = (t, s) => [v.p[0] + XO + ux * t + vx * s, v.p[1] + ZO + uz * t + vz * s];
      for (const sg of [-1, 1]) {
        const g = new THREE.PlaneGeometry(D, h); g.rotateY(Math.atan2(ux, uz) - Math.PI / 2);
        const [x, z] = at(v.L + D / 2, sg * (hw - 0.01)); g.translate(x, v.top + h / 2, z);
        grp.add(new THREE.Mesh(g, greenM));
      }
      const g = new THREE.PlaneGeometry(2 * hw, D); g.rotateX(Math.PI / 2); g.rotateY(Math.atan2(ux, uz));
      const [x, z] = at(v.L + D / 2, 0); g.translate(x, v.roof, z);
      grp.add(new THREE.Mesh(g, soffitM));
      // the pit roofed from its front (the mouth, the column standing in its middle) back to the wall: a slab
      // rising with the stairs under it, between the pit's walls (td_tidy.py: roof0 at the front, roof at the back)
      if (v.roof0 != null) {
        const sw = hw - 0.35, k = v.slab ?? 0.3, P = [];
        const c = (t, s, y) => { const [x2, z2] = at(t, s); return [x2, y, z2]; };
        const y0 = v.roof0, y1 = v.roof;
        const quad = (a, b, cc, d) => P.push(...a, ...b, ...cc, ...a, ...cc, ...d);
        quad(c(0, -sw, y0), c(0, sw, y0), c(v.L, sw, y1), c(v.L, -sw, y1));                 // underside
        quad(c(0, -sw, y0 + k), c(v.L, -sw, y1 + k), c(v.L, sw, y1 + k), c(0, sw, y0 + k)); // top
        quad(c(0, -sw, y0), c(0, -sw, y0 + k), c(0, sw, y0 + k), c(0, sw, y0));             // the lintel's face
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.computeVertexNormals();
        grp.add(new THREE.Mesh(sg, std({ color: 0x9d9a93, roughness: 0.9, side: THREE.DoubleSide })));
      }
    }
    root.add(grp);
  }
  const houseGlow = (f) => { for (const [m, e] of houseLit) m.emissiveIntensity = e * f.house; };
  // The fronts of the balcony and the 2nd floor: one smooth line each along its rim, as the photographs show them.
  //   2nd floor  a solid parapet, painted a light grey, 0.85 m over its front tread, its top 0.22 m thick; on its
  //              seat side a stainless double rail: one tube along the face just under the top, the other 0.25 m
  //              over the top (1.1 m up), bent down onto the face at posts along it
  //   balcony    the slab's edge faced light (the sponsor band), and over it a low front of clear glass panes
  //              between stainless posts, a round stainless rail on top: the seats show through from the field
  // (the 2nd floor's front runs on unbroken behind home; the balcony's stops either side of the wall between S101 and S301)
  {
    const inward = ([x, z]) => { const dx = -x, dz = -60 - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const along = (rim, d) => rim.map((p) => { const n = inward(p); return { x: p[0] + n[0] * d, z: p[1] + n[1] * d + ZH }; });
    const steel = [], glass = [];
    // a round tube through the points at height y (one per line, merged below)
    const tube = (P, y, r) => {
      if (P.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(P.map((p) => new THREE.Vector3(p.x, y, p.z)), false, 'centripetal');
      steel.push(new THREE.TubeGeometry(curve, Math.max(8, P.length * 2), r, 6, false));
    };
    // posts along a line, about every `every` m: [y0, y1], `w` square
    const posts = (P, y0, y1, w, every) => {
      let acc = every;
      for (let i = 0; i < P.length; i++) {
        if (i) acc += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
        if (acc < every && i !== P.length - 1) continue;
        acc = 0;
        const b = new THREE.BoxGeometry(w, y1 - y0, w); b.translate(P[i].x, (y0 + y1) / 2, P[i].z); steel.push(b.toNonIndexed());
      }
    };
    const paint = std({ color: 0xb7b9b8, roughness: 0.85 });
    // the 2nd floor
    {
      const rim = TD_STANDS.rimS.flat(), y = TD_STANDS.rimY;
      const g = wallStrip(along(rim, 0.17), rim.map(() => y + 0.85), { y0: y - 1.5, thick: 0.22, ease: 0 });
      if (g) { const m3 = new THREE.Mesh(g, paint); m3.receiveShadow = true; root.add(m3); }
      const face = along(rim, 0.0);
      tube(face, y + 0.74, 0.024);
      tube(face, y + 1.1, 0.024);
      posts(face, y + 0.7, y + 1.1, 0.045, 2.4);
    }
    // the balcony
    {
      const fascia = std({ color: 0xd9d9d5, roughness: 0.8 });
      const y = TD_STANDS.rimCY;
      for (const rim of TD_STANDS.rimCS ?? []) {
        const g = wallStrip(along(rim, 0.28), rim.map(() => y + 0.08), { y0: y - 1.2, thick: 0.08, ease: 0 });
        if (g) { const m3 = new THREE.Mesh(g, fascia); m3.receiveShadow = true; root.add(m3); }
        const line = along(rim, 0.26);
        const gl = wallStrip(line, rim.map(() => y + 0.93), { y0: y + 0.08, thick: 0.012, ease: 0 });
        if (gl) glass.push(gl);
        tube(line, y + 0.95, 0.028);
        posts(line, y + 0.08, y + 0.95, 0.04, 1.5);
      }
    }
    if (steel.length) {
      const m3 = new THREE.Mesh(mergeGeometries(steel.map((s) => (s.index ? s.toNonIndexed() : s))), std({ color: 0xc9ccd0, roughness: 0.28, metalness: 0.85, envMapIntensity: 0.8 }));
      m3.userData.noCollide = true; root.add(m3);
    }
    if (glass.length) {
      const m3 = new THREE.Mesh(mergeGeometries(glass), std({ color: 0xd8e6ea, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
      m3.renderOrder = 2; root.add(m3);
    }
  }
  // The back of the balcony (td_balcony.py): the rooms behind its top row, glazed onto it, from the suites behind home
  // out to where the 2nd floor's seats stop; past that a plain wall. THE SUITE TOKYO (official page: 28 rooms behind
  // the backstop on the 3rd-floor balcony, "ガラス扉はフルオープン"; its room photographs and Kotobuki's of the suite
  // balcony): a room a block, warm wood-lined, full-width glass doors in black frames straight behind the top row,
  // divided by walls on the balcony's partition lines. The Premium Lounge (Kotobuki's photograph along its rows: a white
  // back wall with openings into the lounge, a light ceiling with downlights over the seats): one long room behind
  // white piers on the column lines, glazed between. Lit from inside with the house: dark (nearly) while the show
  // plays. Over the glazing, a strip of wall up to the 2nd floor's underside, and that underside one smooth surface
  // (light, the balcony's ceiling), not the rows' slabs stepping.
  // (the rooms' lights: their own list, dimmed to 4% while the show plays; the stands' self-lit pieces are in houseLit above)
  const roomLit = [];
  {
    const BR = TD_STANDS.balconyRooms;
    const lit = (color, emissive, e, o = {}) => { const m = std({ color, roughness: 0.85, emissive, emissiveIntensity: e, ...o }); roomLit.push([m, e]); return m; };
    const P3 = ([x, z], y) => [x, y, z + ZH];
    // a ribbon between two lines at heights (per point), facing up or down
    const ribbon = (A, B, ya, yb, down) => {
      const P = [];
      for (let i = 0; i + 1 < A.length; i++) {
        const a0 = P3(A[i], ya[i]), a1 = P3(A[i + 1], ya[i + 1]), b0 = P3(B[i], yb[i]), b1 = P3(B[i + 1], yb[i + 1]);
        if (down) P.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1); else P.push(...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
    };
    // (which way is up for a ribbon from front to back: its winding as seen from above)
    const upward = (A, B) => { const dx = A[1][0] - A[0][0], dz = A[1][1] - A[0][1], ex = B[0][0] - A[0][0], ez = B[0][1] - A[0][1]; return dx * ez - dz * ex < 0; };
    const box = (out, w, h, d, x, y, z, rotY) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateY(rotY); b.translate(x, y, z + ZH); out.push(b.toNonIndexed()); };
    if (BR) {
      const y = BR.y, cy = BR.ceil;
      const wood = lit(0xa27a52, 0x6b4a2c, 0.55), white = lit(0xe2ded6, 0x8c877d, 0.5), ceilM = lit(0xe6e2da, 0x8f8a80, 0.55, { side: THREE.DoubleSide });
      const carpet = lit(0x6e6258, 0x2e2822, 0.5, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      const lamp = glowMat(0xfff0da, 1.6, { side: THREE.DoubleSide }); const lampC = lamp.color.clone();
      roomLit.push([{ set emissiveIntensity(v) { lamp.color.copy(lampC).multiplyScalar(v / 0.6); } }, 0.6]);
      const geo = { wood: [], white: [], ceil: [], floor: [], frame: [], glass: [], lamp: [], header: [] };
      const angOf = ([x, z]) => Math.abs(Math.atan2(x - 0, z + 60)) / DEG;
      for (const sd of BR.sides) {
        const F = sd.front, K = sd.back, n = F.length;
        const up = upward(F, K);
        geo.floor.push(ribbon(F, K, F.map(() => y + 0.015), K.map(() => y + 0.015), !up));
        geo.ceil.push(ribbon(F, K, F.map(() => cy), K.map(() => cy), up));
        // the back wall: wood behind the suites, white behind the lounge
        const iL = sd.ang.findIndex((a) => a >= sd.lounge[0] - 1e-6);
        const backOf = (i0, i1) => wallStrip(K.slice(i0, i1 + 1).map(([x, z]) => ({ x, z: z + ZH })), K.slice(i0, i1 + 1).map(() => cy + 0.02), { y0: y, thick: 0.1, ease: 0 });
        if (sd.backSegments) {
          for (const line of sd.backSegments) {
            const g = wallStrip(line.map(([x,z]) => ({x,z:z+ZH})), line.map(() => cy+.02), {y0:y,thick:.1,ease:0});
            (angOf(line[Math.floor(line.length/2)]) < sd.lounge[0] ? geo.wood : geo.white).push(g);
          }
        } else {
          if (iL > 0) geo.wood.push(backOf(0, iL));
          geo.white.push(backOf(Math.max(0, iL), n - 1));
        }
        // the glazing: panes from the top tread to the frame band; the band; the header over it up to the underside
        const G = sd.glass, Hd = sd.header;
        const line = (pts, off) => pts.map(([x, z]) => { const dx = x, dz = z + 60, l = Math.hypot(dx, dz) || 1; return { x: x + dx / l * off, z: z + dz / l * off + ZH }; });
        const gp = wallStrip(line(G, 0.03), G.map((g) => g[2]), { y0: y + 0.01, thick: 0.02, ease: 0 }); if (gp) geo.glass.push(gp);
        const fb = wallStrip(line(G, 0.06), Hd.map((h) => h[2]), { y0: G.map((g) => g[2]), thick: 0.12, ease: 0 }); if (fb) geo.frame.push(fb);
        const hd = wallStrip(line(Hd, 0.15), Hd.map((h) => h[3]), { y0: Hd.map((h) => h[2] - 0.01), thick: 0.3, ease: 0 }); if (hd) geo.header.push(hd);
        // mullions: the suites' doors about every 1.3 m, the lounge's glazing every 1.8 m; at each suite's wall a broad one
        const L = line(G, 0.06);
        let acc = 0;
        for (let i = 1; i < n; i++) {
          const dx = L[i].x - L[i - 1].x, dz = L[i].z - L[i - 1].z;
          acc += Math.hypot(dx, dz);
          const suite = sd.ang[i] < sd.lounge[0];
          if (acc < (suite ? 1.3 : 1.8)) continue;
          acc = 0;
          const b = new THREE.BoxGeometry(0.07, G[i][2] - y, 0.1); b.rotateY(Math.atan2(dx, dz)); b.translate(L[i].x, (y + G[i][2]) / 2, L[i].z); geo.frame.push(b.toNonIndexed());
        }
        // downlights over the rooms, down their middle
        for (let i = 2; i < n; i += 8) {
          const mx = (F[i][0] * 0.55 + K[i][0] * 0.45), mz = (F[i][1] * 0.55 + K[i][1] * 0.45);
          box(geo.lamp, 0.35, 0.02, 0.35, mx, cy - 0.02, mz, 0);
        }
      }
      // the walls across: between the suites (wood), the rooms' ends; a dark mullion where each meets the glazing
      for (const [x0, z0, x1, z1] of BR.walls) {
        const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0);
        box(geo.wood, 0.15, cy - y, len, (x0 + x1) / 2, (y + cy) / 2, (z0 + z1) / 2, rot);
        box(geo.frame, 0.16, 2.6, 0.14, x0, y + 1.3, z0, rot);
      }
      // the lounge's piers on the column lines: white, from the tread to the header
      for (const [x, z] of BR.piers) {
        const rot = Math.atan2(x, z + 60);
        box(geo.white, 1.1, cy - y, 0.3, x + Math.sin(rot) * 0.2, (y + cy) / 2, z + Math.cos(rot) * 0.2, rot);
      }
      const add = (list, mat, collide = true) => {
        const g = list.filter(Boolean).map((q) => { const t = q.index ? q.toNonIndexed() : q; if (t.attributes.uv) t.deleteAttribute('uv'); return t; });
        if (!g.length) return null;
        const m3 = new THREE.Mesh(mergeGeometries(g), mat); if (!collide) m3.userData.noCollide = true; m3.receiveShadow = true; root.add(m3); return m3;
      };
      add(geo.wood, wood); add(geo.white, white); add(geo.ceil, ceilM, false); add(geo.floor, carpet, false); add(geo.lamp, lamp, false);
      add(geo.frame, std({ color: 0x1f2023, roughness: 0.5, metalness: 0.3 }));
      add(geo.header, lit(0xcfc9bd, 0x4a463f, 0.35));
      const gm = add(geo.glass, std({ color: 0xbfd2d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      if (gm) gm.renderOrder = 2;
      // the 2nd floor's underside over the balcony: light, its downlights with the house
      const S = [];
      for (const sd of BR.sides) {
        const sec = sd.soffit;
        for (let k = 0; k + 1 < sec.length; k++) {
          const a = sec[k], b = sec[k + 1];
          if (Math.abs(angOf(a[0]) - angOf(b[0])) > 1.5) continue;
          for (let i = 0; i + 1 < a.length; i++) {
            const p = [a[i], a[i + 1], b[i + 1], b[i]].map(([x, z, yy]) => [x, yy, z + ZH]);
            // (facing down: the winding by the side)
            if (sd.sg > 0) S.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]); else S.push(...p[0], ...p[2], ...p[1], ...p[0], ...p[3], ...p[2]);
          }
        }
      }
      if (S.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(S, 3)); g.computeVertexNormals();
        const m3 = new THREE.Mesh(g, lit(0xdcd8d0, 0x8a857c, 0.5, { side: THREE.DoubleSide })); m3.userData.noCollide = true; root.add(m3);
      }
    }
  }
  // The wall behind the upper tier (td_ends.py, td_balcony.py): straight up to the ring from behind the 2nd floor's top
  // rows, one smooth line in plan from behind home out past each pole, over the balcony's back wall where it stands
  // over it (its foot on the glazing's header, past the rooms on the balcony's top tread), to where the balcony ends,
  // then square out to the building's own wall; the end faces across the decks (the 2nd floor's with its foot on the
  // underside's line). Plain concrete, as the stands'.
  {
    const parts = [];
    for (const w of TD_STANDS.upperWall ?? []) {
      const P = w.pts.map(([x, z]) => ({ x, z: z + ZH }));
      parts.push(wallStrip(P, P.map((p) => ringY(p.z) + 0.5), { y0: w.y0, thick: 0.4, ease: 0 }));
      const R = w.ret.map(([x, z]) => ({ x, z: z + ZH }));
      parts.push(wallStrip(R, R.map((p) => ringY(p.z) + 0.5), { y0: w.retY0 ?? 13.6, thick: 0.4, ease: 0 }));
    }
    for (const e of TD_STANDS.upperEnds ?? []) {
      if (e.pts) { parts.push(wallStrip(e.pts.map(([x, z]) => ({ x, z: z + ZH })), e.y1, { y0: e.y0, thick: e.thick ?? 0.3, ease: 0 })); continue; }
      const P = [e.a, e.b].map(([x, z]) => ({ x, z: z + ZH }));
      parts.push(wallStrip(P, [e.y1, e.y1], { y0: e.y0, thick: 0.4, ease: 0 }));
    }
    const g = parts.filter(Boolean);
    // (lifted a little with the house, as the house lights fill the bowl: an end face turned from the floods reads as
    // concrete, not as a black mass; off in the show. No shadows on it: the floods graze it, and the seats' and the
    // shadow map's own acne showed on it as dark slivers)
    if (g.length) { const wm = std({ color: 0xcfc6b6, roughness: 0.9, emissive: 0x6a655c, emissiveIntensity: 0.5 }); roomLit.push([wm, 0.5]); root.add(new THREE.Mesh(mergeGeometries(g), wm)); }
  }
  // The balcony's partitions. Its rows run on unbroken along the Premium Lounge (1B and 3B sides: rows of 70-odd
  // seats); only the suites (THE SUITE TOKYO, behind the backstop) are divided, by low cream panels, a metre over
  // the treads, on the lines of the columns under them. The suites hold 284 of the balcony's 1,804 seats: the
  // stretch nearest home on each side holding that share of its seats.
  if (TD_STANDS.cWalls?.length) {
    const C = TD_STANDS.levels.find((l) => l.name === 'C'), S = decodeSeats(C.seats), sk = C.seatScale ?? 10;
    const lim = new Map();
    for (const side of [-1, 1]) {
      const a = [];
      for (let i = 0; i < S.length; i += 4) if (Math.sign(S[i]) === side) a.push(Math.abs(Math.atan2(S[i] / sk, -S[i + 1] / sk)) / DEG);
      a.sort((u, v) => v - u);
      lim.set(side, a.length ? a[Math.floor(a.length * 284 / 1804)] : 180);
    }
    const parts = TD_STANDS.cWalls.filter((w) => Math.abs(Math.atan2(w.x, -w.z)) / DEG > lim.get(Math.sign(w.x) || 1)).map((w) => {
      const g = new THREE.BoxGeometry(0.08, w.y1 - w.y0, w.len);
      g.rotateY(Math.atan2(w.ax, w.az)); g.translate(w.x, (w.y0 + w.y1) / 2, w.z + ZH);
      return g.toNonIndexed();
    });
    if (parts.length) root.add(new THREE.Mesh(mergeGeometries(parts), std({ color: 0xd8cdb8, roughness: 0.8 })));
  }
  {
    const rows = new Map();
    for (const L of TD_STANDS.levels) {
      if (!(TD_STANDS.boxRows ?? []).some((b) => b.level === L.name)) continue;
      const S = decodeSeats(L.seats), sk = L.seatScale ?? 10;
      for (let i = 0; i < S.length; i += 4) {
        const bx = boxOf.get(`${L.name}:${S[i]}:${S[i + 1]}`);
        if (!bx) continue;
        const x = S[i] / sk, z = S[i + 1] / sk, row = S[i + 2], yaw = S[i + 3] * DEG, key = `${L.name}:${bx.block}:${bx.row}`;
        if (!rows.has(key)) rows.set(key, Object.assign([], { per: bx.per, kind: bx.kind }));
        rows.get(key).push({ x, z: z + ZH, y: L.hs ? L.hs[row] : L.h0 + L.rise * row, fx: Math.sin(yaw), fz: Math.cos(yaw), a: Math.atan2(x, -z) });
      }
    }
    const woods = new Map(), holes = [];
    const woodOf = (k) => { if (!woods.has(k)) woods.set(k, []); return woods.get(k); };
    const piece = (out, w, h, d, x, y, z, rotY) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateY(rotY); b.translate(x, y, z); out.push(b); };
    for (const seats of rows.values()) {
      const wood = woodOf(seats.kind ?? 'terrace');
      seats.sort((p, q2) => p.a - q2.a);
      const blocks = [];
      for (const s of seats) {
        const b = blocks[blocks.length - 1];
        if (!b || Math.hypot(s.x - b[b.length - 1].x, s.z - b[b.length - 1].z) > 1.35) blocks.push([s]);
        else b.push(s);
      }
      for (const blk of blocks) {
        if (blk.length < 2) continue;
        const n = blk.length;
        const dx = blk[n - 1].x - blk[0].x, dz = blk[n - 1].z - blk[0].z, span = Math.hypot(dx, dz) || 1;
        let fX = -dz / span, fZ = dx / span;
        if (fX * blk[0].fx + fZ * blk[0].fz < 0) { fX = -fX; fZ = -fZ; }
        const rot = Math.atan2(fX, fZ), tX = Math.cos(rot), tZ = -Math.sin(rot);
        const cx = (blk[0].x + blk[n - 1].x) / 2, cz = (blk[0].z + blk[n - 1].z) / 2, y = blk[0].y;
        const W = span + 0.56;
        // continuous counter and front panel across the Sky Terrace block, with cup holes and flush partitions
        piece(wood, W, 0.035, 0.34, cx + fX * 0.52, y + 0.72, cz + fZ * 0.52, rot);
        piece(wood, W, 0.72, 0.03, cx + fX * 0.68, y + 0.36, cz + fZ * 0.68, rot);
        for (let k = 0; k < n; k++) {
          const u = (blk[k].x - cx) * tX + (blk[k].z - cz) * tZ;
          piece(holes, 0.08, 0.004, 0.08, cx + tX * u + fX * 0.52, y + 0.74, cz + tZ * u + fZ * 0.52, rot);
        }
        const parts = [-(W / 2 - 0.02), W / 2 - 0.02];
        for (let k = seats.per; seats.per > 0 && k < n; k += seats.per) {
          const uA = (blk[k - 1].x - cx) * tX + (blk[k - 1].z - cz) * tZ;
          const uB = (blk[k].x - cx) * tX + (blk[k].z - cz) * tZ;
          parts.push((uA + uB) / 2);
        }
        for (const u of parts) {
          piece(wood, 0.04, 1.1, 0.95, cx + tX * u + fX * 0.22, y + 0.55, cz + tZ * u + fZ * 0.22, rot);
        }
      }
    }
    for (const [k, wood] of woods) {
      const wm = new THREE.Mesh(mergeGeometries(wood), std({ color: BOX_WOOD[k] ?? 0xc9a06a, roughness: 0.9, envMapIntensity: 0.3 })); wm.receiveShadow = true; wm.castShadow = true;
      root.add(wm);
    }
    if (holes.length) root.add(new THREE.Mesh(mergeGeometries(holes), std({ color: 0x141414, roughness: 0.9 })));
  }
  // the wall in front of the 1st floor (behind the excite seats along the
  // lines): padded 4.0 m with 0.24 m of net and the
  // yellow line in the outfield, a low padded wall along the lines (for a
  // concert the backstop net behind home plate is taken down)
  // one continuous wall round the field, its height eased along it
  const ringPts = [], ringH = [], ringOut = [], ringTop = [];
  {
    // the traced ring resampled evenly, every half metre
    const src = fenceRing.concat([fenceRing[0]]);
    let acc = 0;
    for (let k = 0; k + 1 < src.length; k++) {
      const a = src[k], b = src[k + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = acc; t < len; t += 0.5) ringPts.push({ x: a.x + (b.x - a.x) * t / len, z: a.z + (b.z - a.z) * t / len });
      acc = Math.max(0, (Math.ceil((len - acc) / 0.5) * 0.5 + acc) - len);
    }
    const n = ringPts.length;
    // (behind home one clean curve: the traced line eased over a few metres)
    {
      const P0 = ringPts.map((p) => ({ x: p.x, z: p.z }));
      for (let i = 0; i < n; i++) {
        const w0 = Math.min(1, Math.max(0, (55 - (180 - phi(P0[i].x, P0[i].z))) / 10));
        if (w0 <= 0) continue;
        let sx = 0, sz = 0, sw = 0;
        for (let k = -12; k <= 12; k++) { const q2 = P0[(i + k + n) % n], wk = 13 - Math.abs(k); sx += q2.x * wk; sz += q2.z * wk; sw += wk; }
        ringPts[i].x = P0[i].x + (sx / sw - P0[i].x) * w0; ringPts[i].z = P0[i].z + (sz / sw - P0[i].z) * w0;
      }
    }
    for (let i = 0; i < n; i++) {
      const a = ringPts[(i - 1 + n) % n], b = ringPts[(i + 1) % n], p = ringPts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len, sd = nx * p.x + nz * (p.z - (ZH - 60)) > 0 ? 1 : -1;
      // up to the front of the stand behind it (towards the poles the front
      // rows stand high, the fence having cut off the ones below)
      const top = stands.topAt(p.x + nx * sd * 0.6, p.z + nz * sd * 0.6);
      const outfield = Math.hypot(p.x, p.z - ZH) > 92 && phi(p.x, p.z) < 46;
      ringOut.push(outfield);
      ringH.push(outfield ? Math.max(4.0, top) : Math.max(1.2, top));
      ringTop.push(top);
    }
    // one height all round the outfield (its stand's front row is level), and
    // from home out to each pole only ever rising with the stands' fronts
    // (never below one, so no front's face shows over it; no dip and rise
    // past the poles), up to the outfield's height at the pole
    const outs = ringH.filter((_, i) => ringOut[i]).sort((a, b) => a - b);
    const outH = outs.length ? outs[outs.length >> 1] : 4.0;
    for (let i = 0; i < n; i++) if (ringOut[i]) ringH[i] = outH;
    let home = -1, hp = -1;
    for (let i = 0; i < n; i++) if (!ringOut[i]) { const f = phi(ringPts[i].x, ringPts[i].z); if (f > hp) { hp = f; home = i; } }
    for (const step of [1, -1]) {
      let h = 0;
      for (let k = 0; k < n; k++) {
        const j = (home + step * k + n * 4) % n;
        if (ringOut[j]) break;
        h = Math.min(outH, Math.max(h, ringH[j])); ringH[j] = h;
      }
    }
    // behind home plate (the backstop) the padded wall stands 2.2 m at the least (the stands' front
    // rows are laid level with it: td_stand1.fit_rake's fmin), easing back to the lines' height
    // between 25 and 45 degrees off the line behind the catcher
    for (let i = 0; i < n; i++) {
      if (ringOut[i]) continue;
      const off = 180 - phi(ringPts[i].x, ringPts[i].z), t = Math.min(1, Math.max(0, (45 - off) / 20)), w = t * t * (3 - 2 * t);
      if (w > 0) ringH[i] = Math.max(ringH[i], ringH[i] + w * (Math.max(2.2, ringTop[i]) - ringH[i]));
    }
    // and nowhere under the front of the stand behind it (its concrete face showed over the padding),
    // never over the outfield's height (td_stand1.fit_rake keeps the fronts under it)
    for (let i = 0; i < n; i++) ringH[i] = Math.max(ringH[i], Math.min(outH, ringTop[i]));
  }
  // (open at the mouth of the tunnel under A02: the wall stops either side of it, a swing gate between; and at each of
  // the excite seats' steps up to the stand)
  const tunnels = [...(TD_STANDS.tunnels ?? []), ...(TD_STANDS.exciteGates ?? [])];
  const inMouth = ringPts.map((p) => tunnels.some((t) => {
    const dx = p.x - t.p[0], dz = p.z - ZH - t.p[1], a = dx * t.u[0] + dz * t.u[1], b = -dx * t.u[1] + dz * t.u[0];
    return Math.abs(b) < t.w / 2 + 0.05 && a > -3 && a < 3;
  }));
  let padGeo;
  if (!inMouth.some(Boolean)) padGeo = wallStrip(ringPts, ringH, { thick: 0.36, closed: true, ease: 6 });
  else {
    const n = ringPts.length, s0 = inMouth.indexOf(true), parts = [];
    let run = [];
    for (let k = 1; k <= n; k++) {
      const i = (s0 + k) % n;
      if (inMouth[i]) { if (run.length > 1) parts.push(run); run = []; } else run.push(i);
    }
    if (run.length > 1) parts.push(run);
    padGeo = mergeGeometries(parts.map((r) => wallStrip(r.map((i) => ringPts[i]), r.map((i) => ringH[i]), { thick: 0.36, ease: 6 })).filter(Boolean));
  }
  for (const t of tunnels) {
    if (!t.gate) continue;
    // a concrete lintel slab flush behind the padded wall over the mouth, the cut behind it open to the roof
    const vx = -t.u[1], vz = t.u[0], lw = t.w / 2 - 0.03;
    const fy = t.sides?.[0]?.[0]?.[1] ?? (t.h + 0.6);
    const lTop = fy, lH = 0.32, lBot = lTop - lH, sd = 1.1;
    const slab = new THREE.BoxGeometry(t.w + 0.04, lH, sd);
    slab.rotateY(Math.atan2(t.u[0], t.u[1]));
    slab.translate(t.p[0] + t.u[0] * (0.18 + sd / 2), lBot + lH / 2, t.p[1] + ZH + t.u[1] * (0.18 + sd / 2));
    root.add(new THREE.Mesh(slab, std({ color: 0x8a857c, roughness: 0.9 })));
    // two padded leaves hinged at the mouth's sides, fitting cleanly under the lintel slab
    for (const sg of [-1, 1]) {
      const hx = t.p[0] + vx * sg * t.w / 2, hz = t.p[1] + ZH + vz * sg * t.w / 2;
      const gh = Math.max(1.8, lBot - 0.02);
      const ang = Math.atan2(vx, vz) + sg * 0.35;            // the leaf's run from its hinge, swung 20 degrees in
      const dx = -Math.sin(ang) * sg, dz = -Math.cos(ang) * sg;
      const leaf = new THREE.BoxGeometry(0.22, gh, lw);      // (padded, as thick as the wall's padding)
      leaf.rotateY(Math.atan2(dx, dz)); leaf.translate(hx + dx * lw / 2, gh / 2, hz + dz * lw / 2);
      root.add(new THREE.Mesh(leaf, std({ color: 0x0b2a1a, roughness: 0.8 })));
    }
  }
  // steps from the field up over the low wall into the 1st floor's front
  // rows, round foul territory either side (the way the field's crowd comes
  // and goes from the stands at a concert)
  for (const want of [95, 125, 160]) for (const sd of [-1, 1]) {
    let best = -1, bd = Infinity;
    // (only where the fence stands on the field itself, not behind the excite seats)
    const onFieldEdge = (p) => { const dx = -p.x, dz = ZH - 60 - p.z, l = Math.hypot(dx, dz) || 1; return inRing(fieldRing, p.x + dx / l * 1.5, p.z + dz / l * 1.5); };
    ringPts.forEach((p, i) => { if (ringOut[i] || Math.sign(p.x) !== sd || !onFieldEdge(p)) return; const d = Math.abs(phi(p.x, p.z) - want); if (d < bd) { bd = d; best = i; } });
    if (best < 0) continue;
    const n = ringPts.length, a = ringPts[(best - 2 + n) % n], c = ringPts[(best + 2) % n], p = ringPts[best];
    let ux = -(c.z - a.z), uz = c.x - a.x; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    if (ux * p.x + uz * (p.z - (ZH - 60)) < 0) { ux = -ux; uz = -uz; }   // outwards, from the field to the stand
    const h = ringH[best], run = 0.28, len = Math.ceil(h / 0.2) * run;
    root.add(stageSteps({ x: p.x - ux * (len + 0.2), z: p.z - uz * (len + 0.2), h, dir: [ux, uz], width: 1.6 }));
  }
  root.add(new THREE.Mesh(padGeo, std({ color: 0x0b2a1a, roughness: 0.8 })));
  // (behind home, between the back of the wall and the stand's first treads: closed in concrete at the wall's height)
  {
    const n = ringPts.length, parts = [];
    let run = [];
    const flushR = () => {
      if (run.length > 3) {
        const P = run.map((i) => { const p = ringPts[i], dx = p.x, dz = p.z - (ZH - 60), l = Math.hypot(dx, dz) || 1; return { x: p.x + dx / l * 0.5, z: p.z + dz / l * 0.5 }; });
        const g = wallStrip(P, run.map((i) => ringH[i] - 0.01), { thick: 0.75, ease: 6 });
        if (g) parts.push(g);
      }
      run = [];
    };
    let s0 = inMouth.findIndex((m, i) => m || ringOut[i]); if (s0 < 0) s0 = 0;
    for (let k = 0; k < n; k++) { const i = (s0 + k) % n; if (!inMouth[i] && !ringOut[i] && 180 - phi(ringPts[i].x, ringPts[i].z) < 58) run.push(i); else flushR(); }
    flushR();
    if (parts.length) root.add(new THREE.Mesh(mergeGeometries(parts), std({ color: 0xa8a297, roughness: 0.9 })));
  }
  // the steps of the excite seats: from the walkway behind their back rows up through a gap in the 1st floor's wall to the stand's aisle
  {
    const treads = [], RISE = 0.19;
    for (const t of TD_STANDS.exciteAisles ?? []) {
      const ax = t.a[0], az = t.a[1] + ZH, bx = t.b[0], bz = t.b[1] + ZH, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const n = Math.max(2, Math.ceil((t.y1 - t.y0) / RISE)), run = L / n;
      for (let k = 0; k < n; k++) {
        const top = t.y0 + (t.y1 - t.y0) * (k + 1) / n, c = (k + 0.5) * run;
        const b = new THREE.BoxGeometry(t.w, top, run + 0.02);
        b.rotateY(Math.atan2(ux, uz)); b.translate(ax + ux * c, top / 2, az + uz * c);
        treads.push(b.toNonIndexed());
      }
    }
    if (treads.length) root.add(new THREE.Mesh(mergeGeometries(treads), std({ color: 0xa8a297, roughness: 0.9 })));
  }
  // the padded fence round each excite stand, as the photographs show it: along its front (out by one diagonal to the
  // deepest blocks, back in by another to the 1st floor's wall short of the pole) and square back to that wall at the
  // home end; one height, about chest high to the front row, a pale cap along its top. Straight runs, each its own
  // slab, so the corners stay sharp. (No net over it: for a concert it is taken down.)
  {
    const pad = [], cap = [], T = 0.22;
    for (const f of TD_STANDS.exciteFence ?? []) {
      const P = f.pts.map(([x, z]) => ({ x, z: z + ZH }));
      for (let k = 0; k + 1 < P.length; k++) {
        const a = P[k], b = P[k + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / l, uz = (b.z - a.z) / l;
        // (each run carried half the fence's thickness past its ends: the corners close)
        const run = [{ x: a.x - ux * T / 2, z: a.z - uz * T / 2 }, { x: b.x + ux * T / 2, z: b.z + uz * T / 2 }];
        pad.push(wallStrip(run, [f.h, f.h], { thick: T, ease: 0 }));
        cap.push(wallStrip(run, [f.h + 0.05, f.h + 0.05], { y0: f.h, thick: T + 0.05, ease: 0 }));
      }
    }
    if (pad.length) {
      root.add(new THREE.Mesh(mergeGeometries(pad), std({ color: 0x0b2a1a, roughness: 0.8 })));
      root.add(new THREE.Mesh(mergeGeometries(cap), std({ color: 0xc9cdc8, roughness: 0.75 })));
    }
  }
  // the yellow line along the top of the outfield fence, and its net
  {
    const n = ringPts.length, eased = ringH.map((_, i) => { let s = 0, w = 0; for (let k = -6; k <= 6; k++) { const wk = 7 - Math.abs(k); s += ringH[(i + k + n) % n] * wk; w += wk; } return s / w; });
    let i0 = ringOut.findIndex((o, i) => o && !ringOut[(i - 1 + n) % n]);
    if (i0 >= 0) {
      const run = [];
      for (let k = 0; k < n && ringOut[(i0 + k) % n]; k++) run.push((i0 + k) % n);
      const pts = run.map((i) => ringPts[i]), top = run.map((i) => eased[i]);
      const lineGeo = wallStrip(pts, top.map((h) => h + 0.12), { y0: top.map((h) => h + 0.005), thick: 0.4, ease: 0 });
      if (lineGeo) root.add(new THREE.Mesh(lineGeo, std({ color: 0xc9a82a, roughness: 0.7 })));   // paint, unlit
      // the net over it, 0.24 m (the fence 4.24 m in all)
      const netGeo = wallStrip(pts, top.map((h) => h + 0.36), { y0: top.map((h) => h + 0.12), thick: 0.04, ease: 0 });
      if (netGeo) root.add(new THREE.Mesh(netGeo, std({ color: 0x1a1c1e, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false })));
      // the ribbon screens (1.28 × 53.76 m) along the top of the fence's face
      // from each pole towards left- and right-centre; off for a concert
      const inward = (p) => { const dx = -p.x, dz = ZH - 60 - p.z, l = Math.hypot(dx, dz) || 1; return { x: p.x + dx / l * 0.22, z: p.z + dz / l * 0.22 }; };
      const L = Math.round(53.76 / 0.5);
      for (const part of [run.slice(0, L), run.slice(-L)]) {
        // (level, at the outfield fence's own height: the fence's eased top dips towards the pole, where it meets the infield's)
        const lvl = top.slice().sort((a, b) => a - b)[top.length >> 1];
        const rp = part.map((i) => inward(ringPts[i])), rt = part.map(() => lvl);
        const rg = wallStrip(rp, rt.map((h) => h - 0.15), { y0: rt.map((h) => h - 1.43), thick: 0.06, ease: 0 });
        // (matt, as a screen switched off: glossy it took the room's light and read as the stand's concrete)
        if (rg) root.add(new THREE.Mesh(rg, std({ color: 0x0a0b0c, roughness: 0.85, metalness: 0, envMapIntensity: 0.1 })));
      }
    }
  }
  // the foul poles, on the lines just behind the fence: each stands in the
  // outfield stand's front rows, from its treads (not the field), up to 26 m;
  // flat paint and a net screen, lit by the room like the rest of it (no
  // shine, no glow of their own)
  for (const sd of [-1, 1]) {
    const at = (r) => [sd * r * Math.SQRT1_2, ZH - r * Math.SQRT1_2];
    let r = 98;
    while (r < 115 && stands.topAt(...at(r)) < 1) r += 0.1;
    const [x, z] = at(r + 0.6), y0 = stands.topAt(x, z), top = 26;
    const paint = { color: 0xd9b81a, roughness: 1, metalness: 0, envMapIntensity: 0 };
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, top - y0, 12), std(paint));
    pole.position.set(x, (y0 + top) / 2, z); root.add(pole);
    const fy0 = y0 + 2.5, fy1 = top - 2;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, fy1 - fy0), std({ ...paint, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    flag.position.set(x - sd * 0.8, (fy0 + fy1) / 2, z); flag.rotation.y = sd * Math.PI / 4; root.add(flag);
  }

  // ── the membrane ──
  // (its geometry, ZC, ringY, roofAt and edge, is set out before the stands)
  const membrane = membraneMaterial();
  membrane.side = THREE.DoubleSide;
  {
    // (fine enough that each 8.5 m panel's bulge is really in the mesh)
    const I = 480, J = 90;
    const pos = [], idx = [], rho = [];
    for (let j = 0; j <= J; j++) for (let i = 0; i <= I; i++) {
      const e = edge(i / I * Math.PI * 2, j / J);
      pos.push(e.x, roofAt(e.x, e.z), e.z);
      rho.push(j / J);
    }
    for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) {
      const a = j * (I + 1) + i, b = a + 1, c = a + I + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aRho', new THREE.Float32BufferAttribute(rho, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, membrane));
  }
  // Nothing hangs from the membrane (as the photographs show it: no light
  // gondolas, no loudspeakers on it); the house light comes from round the
  // ring, over the top of the stands, aimed down and in at the field.
  const LIGHTS = [];
  for (let i = 0; i < 14; i++) {
    const { x, z } = edge((i + 0.5) / 14 * Math.PI * 2, 0.97);
    LIGHTS.push(V3(x, ringY(z) - 1.5, z));
  }
  // The house lights are the floods round its edge (the membrane's own small
  // lamps and lit strips, in its material, light nothing).
  // The floods themselves (LED, about 700 since the 2016–17 retrofit), as the
  // photographs show them: banks, not a line. Each bank two rows of round
  // lamps, six to a row, in square housings on a frame, the banks a few
  // metres apart all the way round, on a steel catwalk with a handrail that
  // runs round the ring just under the membrane's edge. Each bank set square
  // to the ring, its faces turned in and a little down at the field. Their
  // faces light with the house.
  const floodM = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, side: THREE.DoubleSide });
  const floodGlow = [];
  {
    const RHO = 0.988, NB = 64, ROWS = 2, COLS = 6, PITCH = 1.05, TILT = 0.3, body = [], faces = [];
    // (even spacing along the ring: arc length round it, sampled)
    const NS = 2400, S = [0], P = [edge(0, RHO)];
    for (let i = 1; i <= NS; i++) { const p = edge(i / NS * Math.PI * 2, RHO); S.push(S[i - 1] + Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z)); P.push(p); }
    const L = S[NS];
    const atS = (s) => { s = ((s % L) + L) % L; let i = 1; while (S[i] < s) i++; const f = (s - S[i - 1]) / (S[i] - S[i - 1]); return { x: lerp(P[i - 1].x, P[i].x, f), z: lerp(P[i - 1].z, P[i].z, f) }; };
    const frame = (s) => {
      const p = atS(s), a = atS(s - 0.5), b = atS(s + 0.5);
      let yaw = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;          // face square to the ring...
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      if (dx * (0 - p.x) + dz * (ZC - p.z) < 0) yaw += Math.PI;          // ...and in, not out
      return { ...p, yaw };
    };
    const place = (g, f, y, tilt = 0) => { g.rotateX(tilt); g.rotateY(f.yaw); g.translate(f.x, y, f.z); return g; };
    for (let b = 0; b < NB; b++) {
      const f = frame((b + 0.5) / NB * L), y = ringY(f.z) - 1.5;
      const at = (lx, ly, lz) => V3(lx, ly, lz).applyAxisAngle(V3(1, 0, 0), TILT).applyAxisAngle(V3(0, 1, 0), f.yaw).add(V3(f.x, y, f.z));
      // the bank's frame behind the lamps
      body.push(place(new THREE.BoxGeometry(COLS * PITCH + 0.3, ROWS * PITCH + 0.25, 0.14), f, 0, TILT).translate(...at(0, 0, -0.3).sub(V3(f.x, 0, f.z)).toArray()).toNonIndexed());
      for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
        const lx = (k - (COLS - 1) / 2) * PITCH, ly = (r - (ROWS - 1) / 2) * PITCH;
        const hb = new THREE.BoxGeometry(0.84, 0.84, 0.42); hb.rotateX(TILT); hb.rotateY(f.yaw); hb.translate(...at(lx, ly, 0).toArray()); body.push(hb.toNonIndexed());
        const face = new THREE.CircleGeometry(0.34, 12); face.rotateX(TILT); face.rotateY(f.yaw); face.translate(...at(lx, ly, 0.22).toArray()); faces.push(face);
      }
      floodGlow.push(pipe.flares.add(at(0, 0, 0.45), KELVIN(5200), 4.2, 0));
    }
    // the catwalk: its deck under the banks and the handrail in front of them, all the way round
    const NC = 200;
    for (let i = 0; i < NC; i++) {
      const s0 = i / NC * L, s1 = (i + 1) / NC * L, a = atS(s0), c = atS(s1), f = frame((s0 + s1) / 2), len = Math.hypot(c.x - a.x, c.z - a.z) + 0.05;
      const m = { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2, yaw: f.yaw };
      const y = ringY(m.z) - 1.5, ix = Math.sin(f.yaw), iz = Math.cos(f.yaw);
      const deck = place(new THREE.BoxGeometry(len, 0.12, 1.4), m, y - ROWS * PITCH / 2 - 0.35); deck.translate(ix * 0.3, 0, iz * 0.3); body.push(deck.toNonIndexed());
      const rail = place(new THREE.BoxGeometry(len, 0.07, 0.07), m, y - ROWS * PITCH / 2 + 0.75); rail.translate(ix * 0.95, 0, iz * 0.95); body.push(rail.toNonIndexed());
      const kick = place(new THREE.BoxGeometry(len, 0.2, 0.03), m, y - ROWS * PITCH / 2 - 0.2); kick.translate(ix * 0.98, 0, iz * 0.98); body.push(kick.toNonIndexed());
    }
    root.add(new THREE.Mesh(mergeGeometries(body), std({ color: 0x3a3c40, roughness: 0.6, metalness: 0.4 })));
    root.add(new THREE.Mesh(mergeGeometries(faces), floodM));
  }
  // the ring beam's support frame round the edge, 5 m deep, roofed at the
  // ring; the outer wall under it
  {
    const I = 160, R0 = 1.0, R1 = DOME_WALL;
    const pos = [], idx = [], wpos = [], widx = [];
    for (let i = 0; i <= I; i++) {
      const t = i / I * Math.PI * 2, a = edge(t, R0), b = edge(t, R1);
      pos.push(a.x, ringY(a.z) + 0.4, a.z, b.x, ringY(b.z) + 0.4, b.z);
      wpos.push(b.x, 0, b.z, b.x, ringY(b.z) + 0.5, b.z);
    }
    for (let i = 0; i < I; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const mat = std({ color: 0x0e0e12, roughness: 0.9, side: THREE.DoubleSide });
    for (const [P, X] of [[pos, idx], [wpos, widx]]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setIndex(X); g.computeVertexNormals();
      root.add(new THREE.Mesh(g, mat));
    }
    // and the floor out to it, under the stands
    const sh = new THREE.Shape(Array.from({ length: 96 }, (_, i) => { const e = edge(i / 96 * Math.PI * 2, R1); return new THREE.Vector2(e.x, -e.z); }));
    const fg = new THREE.ShapeGeometry(sh, 1); fg.rotateX(-Math.PI / 2);
    root.add(new THREE.Mesh(fg, std({ color: 0x0c0c0e, roughness: 1 })));
  }

  // The main screen (2022), as the photographs show it: LED in two parts. A
  // band 125.6 × 7.5 m across the outfield from right to left, along the
  // curve of the stand's back and level, over its back rows on the columns at
  // the heads of its aisles (the crowd sits under it), a dark frame behind it;
  // and in its middle a lower part, 20 × 5.4 m, hung under the band over the
  // backscreen (about 1,050 m² in all). Over the band's middle the TOKYO DOME sign in green;
  // over all of it, the floods on the ring.
  // Off for a concert: the set
  // stands in front of its middle.
  {
    const { F, ftop, pts, len, mid, band, lower, y0, y1, yl } = MV;
    const out = (p, k) => { const l = Math.hypot(p.x, p.z - ZH) || 1; return { x: p.x + p.x / l * k, z: p.z + (p.z - ZH) / l * k }; };
    const face = std({ color: 0x050506, roughness: 0.3, metalness: 0.2 });
    const frame = std({ color: 0x1c1d21, roughness: 0.7 });
    root.add(new THREE.Mesh(wallStrip(band, band.map(() => y1), { y0, thick: 0.25, ease: 0 }), face));
    root.add(new THREE.Mesh(wallStrip(lower, lower.map(() => y0), { y0: yl, thick: 0.25, ease: 0 }), face));
    root.add(new THREE.Mesh(wallStrip(band.map((p) => out(p, 0.7)), band.map(() => y1 + 0.4), { y0: y0 - 0.4, thick: 1.0, ease: 0 }), frame));
    root.add(new THREE.Mesh(wallStrip(lower.map((p) => out(p, 0.7)), lower.map(() => y0), { y0: yl - 0.3, thick: 1.0, ease: 0 }), frame));
    // The band hangs off the columns behind it: from each, two steel arms forward to its frame
    {
      const steel = [], armM = std({ color: 0x1c1d21, roughness: 0.7 });
      for (const c of TD_STANDS.pillars) {
        if (!underMV(c)) continue;
        const cq = MV.colMoved.get(c) ?? c, cx = cq.x, cz = cq.z + ZH;
        let best = null, bd = Infinity;
        for (const p of band) { const d = Math.hypot(p.x - cx, p.z - cz); if (d < bd) { bd = d; best = p; } }
        if (!best || bd > 12) continue;
        const f = out(best, 0.7);
        const dx = f.x - cx, dz = f.z - cz, L = Math.hypot(dx, dz);
        if (L < 0.2) continue;
        for (const y of [y0 + 0.5, y1 - 0.5]) {
          const b = new THREE.BoxGeometry(0.35, 0.5, L);
          b.rotateY(Math.atan2(dx, dz)); b.translate(cx + dx / 2, y, cz + dz / 2);
          steel.push(b.toNonIndexed());
        }
      }
      if (steel.length) root.add(new THREE.Mesh(mergeGeometries(steel), armM));
    }
    // the sign over the middle: TOKYO DOME in green on black
    {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160;
      const g = cv.getContext('2d');
      g.fillStyle = '#060807'; g.fillRect(0, 0, 1024, 160);
      g.fillStyle = '#3ddc84'; g.font = 'bold 112px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('TOKYO DOME', 512, 84);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true }));
      const i = len.findIndex((v) => v >= mid), p = pts[i], q = pts[i + 1], o = out(p, -0.2);
      sign.position.set(o.x, y1 + 1.75, o.z); sign.rotation.y = Math.atan2(-(q.z - p.z), q.x - p.x);
      root.add(sign);
    }
    // the backscreen: the outfield stand's rows between F09 and F12, the data's own outlines, in dark green
    {
      const parts = [];
      for (const r of TD_STANDS.backscreen ?? []) for (const poly of r.polys) {
        const shape = new THREE.Shape(poly[0].map(([x, z]) => new THREE.Vector2(x, -z)));
        for (const h of poly.slice(1)) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
        const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.05, r.y), bevelEnabled: false });
        g.rotateX(-Math.PI / 2); g.translate(0, 0, ZH);
        parts.push(g.index ? g.toNonIndexed() : g);
      }
      if (parts.length) root.add(new THREE.Mesh(mergeGeometries(parts), std({ color: 0x18382a, roughness: 0.95 })));
    }
  }

  if (round) return domeRound();

  // ── stage ──
  // As the dome tours set it: the stage across the outfield, its front about
  // level with the foul poles (100 m down the lines; the set's back yard
  // behind it to the centre-field stands), one LED wall across almost the
  // whole set in place of IMAG. Nothing is flown from the membrane: the show
  // brings its own roof on towers, and the PA its own wings.
  const SZ = 16;                                  // the stage's front at z 38
  const WW = 66, WH = 16, WY = DECK + 2.4 + WH / 2, WZ = 3.6 + SZ;
  const deck = stageDeck({ w: 72, d: 20, h: DECK, z: 12 + SZ, lip: false });
  root.add(deck);
  // (as the photographs from the 2nd floor show it) a runway out from the
  // stage's middle, crossed a third of the way down the field by a long
  // walkway either side, and on past it to an end stage
  // the end stage's back (and the 1.4 m kept clear round it) on the aisle
  // behind the band of floor blocks it stands in, so no strip too shallow for
  // a block is left empty behind it
  const RW0 = 22 + SZ, CZ = 57, XW = 30, XD = 5.2, RW1 = 91.2, TIP = 10, XH = DECK - 0.8;
  const cross = crossThrust(root, { z0: RW0, z1: RW1, w: 4.4, crossZ: CZ, crossD: XD, crossW: XW, tip: TIP, h: XH });
  // the stairs up either side of the deck, beside it (it is 72 m wide), 3 m wide
  for (const s of [-1, 1]) root.add(stageSteps({ x: s * 37.55, z: RW0, h: DECK, dir: [0, -1], width: 3 }));
  const ringM = stageRing(root, [{ x: 0, z: 12 + SZ, w: 72, d: 20, h: DECK, back: true }, ...cross.parts]);
  const scr = bigScreens(ctx, root, { w: WW, h: WH, y: WY, z: WZ, pitch: 0.0059 });
  // the stage's roof on its towers, the wall on chains from its back beam
  const TX = WW / 2 + 4, SR = 27, LT = 23;
  const BZ = [WZ - 0.4, 26, 32, RW0 + 0.5];
  groundRoof(root, { tx: TX, zs: BZ, y0: 0, top: SR });
  screenHang(root, { y: WY + WH / 2 + 0.3, z: WZ, w: WW, topY: SR - 0.8, n: 6, size: 0.76 });
  // Black masking right behind the LED wall, across the stage roof's back
  // from tower to tower, hung from its back beam: the stands behind the
  // stage do not show through or round the wall.
  scaffoldMasking(root, { line: [[-(TX + 1), BZ[0] - 0.9], [TX + 1, BZ[0] - 0.9]], tops: [SR + 0.6], front: [0, 100] });
  // the road cases in the yard behind the set
  {
    const rnd = prng(17), cases = [];
    for (const s of [-1, 1]) for (let i = 0; i < 14; i++) {
      const cw = 1.2 + rnd() * 0.6, ch = 0.9 + rnd() * 0.5, cd = 0.8 + rnd() * 0.3;
      const b = new THREE.BoxGeometry(cw, ch, cd);
      b.translate(s * (8 + (i % 5) * 4.5), ch / 2 + (i > 9 ? 1.2 : 0), WZ - 5 - Math.floor(i / 5) * 2.2);
      cases.push(b);
    }
    root.add(new THREE.Mesh(mergeGeometries(cases), std({ color: 0x141416, roughness: 0.5, metalness: 0.3 })));
  }
  for (let i = 0; i < 12; i++) { const w = wedge({ w: 0.8 }); w.position.set(-22 + i * 4, DECK, RW0 - 0.4); w.rotation.y = Math.PI; root.add(w); }
  // the subs in a row on the field under the barrier, the front fills on the lip
  subLine(root, { x0: -30, x1: 30, z: RW0 + 1.0, gap: 3.4, count: 2, fills: { xs: [-33, -26, -19, -12, -6, 6, 12, 19, 26, 33], y: DECK, z: RW0 - 0.35 } });

  // ── rig ──
  const rig = ctx.rig({ finish: 'black' });
  for (const z of BZ.slice(1)) {
    const t = truss(2 * TX - 4, { size: 1.0, finish: 'black' }); t.position.set(0, LT, z); root.add(t);
    root.add(hoists([-30, -15, 0, 15, 30], LT, z, SR - 0.8));
  }
  // the PA: the mains from the stage roof's front corners; the side hangs turned out to the infield
  // stands and the 270s further round, on wing towers bridged to the roof
  const PX = 47, PZ = 32, PH = 24;
  const DT = [[-24, 100], [24, 100]];           // the delay towers, two-thirds of the way back to FOH
  const towerLights = [];
  for (const side of [-1, 1]) {
    paWing(root, { x: side * PX, z: PZ, h: PH, bridge: V3(side * (TX + 0.8), SR, BZ[2]) });
    // the stage's front corner: the main to the front, two more round to
    // the side, spaced out on arms from the roof's corner tower
    paCorner(root, { px: side * TX, pz: BZ[3], r: 3.6, yaws: [0, side * 0.6, side * 1.2], boxes: [20, 16, 14], y: SR - 2.4, bar: SR - 1.2, width: 1.4 });
    paPair(root, { x: side * (PX - 1.2), y: PH - 1.6, z: PZ + 1.0, boxes: 16, width: 1.3, yaw: side * 0.5, roofY: PH - 0.5 });
    paHang(root, { x: side * (PX + 2.5), y: PH - 1.6, z: PZ + 0.4, boxes: 12, width: 1.2, yaw: side * 1.15, roofY: PH - 0.4 });
    for (const dx of [-1.6, 0, 1.6]) towerLights.push(V3(side * PX + dx, PH + 1.2, PZ));
  }
  // the delay towers on the field, either side of the runway, past the
  // cross: for the back of the field and the stands behind home
  for (const [x, z] of DT) towerLights.push(...delayTower(root, { x, z, h: 26, boxes: 16, width: 1.3, from: V3(0, 0, 0) }));
  const spots = [], beams = [], washes = [], ups = [], ring2 = [], bst = [];
  spots.push(...fixtureRow(q, 14, (i) => ({ fx: rig.add({ kind: 'spot', pos: V3(-26 + i * 4, LT - 0.7, BZ[3]), length: 70, angle: 0.08 }), group: 0 })));
  beams.push(...fixtureRow(q, 14, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * 4, LT - 0.7, BZ[2]), length: 90, beamGain: 1.2 }), group: 1 })));
  washes.push(...fixtureRow(q, 10, (i) => ({ fx: rig.add({ kind: 'wash', pos: V3(-27 + i * 6, LT - 0.7, BZ[1]), length: 35, beamGain: 0.4, flareGain: 0.15 }), group: 2 })));
  // the lights on the delay towers' heads, sweeping the field and the stands
  const tw = fixtureRow(q, towerLights.length, (i) => ({ fx: rig.add({ pos: towerLights[i], kind: 'beam', length: 70, beamGain: 0.9 }), group: 5 }));
  ups.push(...fixtureRow(q, 12, (i) => ({ fx: rig.add({ kind: 'beam', pos: V3(-26 + i * (52 / 11), DECK, RW0 - 0.2), hang: 'up', length: 70 }), group: 3 })));
  // the ring: beams along the 2nd-floor front, pole to pole, pointing in
  {
    const edge = TD_STANDS.rim.map(([x, z]) => ({ x, z: z + ZH }));
    edge.sort((p, q2) => Math.atan2(p.x, p.z - ZH) - Math.atan2(q2.x, q2.z - ZH));
    const len = [0];
    for (let i = 1; i < edge.length; i++) len.push(len[i - 1] + Math.hypot(edge[i].x - edge[i - 1].x, edge[i].z - edge[i - 1].z));
    const N2 = (q.rig ?? 1) < 1 ? 10 : 18;
    for (let i = 0, j = 0; i < N2; i++) {
      const want = (i + 0.5) / N2 * len[len.length - 1];
      while (j < len.length - 2 && len[j + 1] < want) j++;
      const t = (want - len[j]) / (len[j + 1] - len[j]);
      const pos = V3(lerp(edge[j].x, edge[j + 1].x, t), TD_STANDS.rimY - 1.6, lerp(edge[j].z, edge[j + 1].z, t));
      const a = Math.atan2(pos.x, pos.z - ZC);
      ring2.push({ fx: rig.add({ kind: 'beam', pos, hang: 'up', length: 110, beamGain: 0.9, flareGain: 0.6 }), i, n: N2, group: 4, a });
    }
  }
  // blinders under the front truss and on the wing towers' faces; strobes
  // along the foot of the wall and under the middle truss
  const bu = [], bt = [];
  for (const x of [-28, -20, -12, -4, 4, 12, 20, 28]) bu.push({ pos: V3(x, LT - 0.9, BZ[3] + 0.12), dir: V3(x * 0.3, 1.5 - LT, 75 - BZ[3]), mount: LT - 0.5 });
  for (const side of [-1, 1]) for (const dx of [-0.52, 0.52]) {
    const pos = V3(side * PX + dx, 9, PZ + 1.15);
    bt.push({ pos, dir: V3(0, 1.5, 80).sub(pos), mount: null });
  }
  const blinders = flashUnits(rig, root, [...thinRow(q, bu), ...thinRow(q, bt)], { kind: 'blinder' });
  const su = [], st = [];
  for (let i = 0; i < 10; i++) su.push({ pos: V3(-27 + i * 6, DECK + 0.12, WZ + 0.5), dir: V3(0, 0.25, 1), mount: DECK });
  for (const x of [-20, -12, -4, 4, 12, 20]) st.push({ pos: V3(x, LT - 0.65, BZ[2] + 0.1), dir: V3(0, -0.5, 1), mount: LT - 0.5 });
  const strobes = flashUnits(rig, root, [...thinRow(q, su), ...thinRow(q, st)], { kind: 'strobe' });
  const moverLights = [];
  for (const k of [3, 6, 9, 12]) moverLights.push(rig.light(fromRow(spots, k, 14).fx, shadowSpot(0xffffff, 0, { cast: false, penumbra: 0.5 }), 14000));
  const front1 = shadowSpot(KELVIN(5600), 0, { angle: 0.14, penumbra: 0.7, size: q.shadowSize, far: 140, cast: q.shadows });
  front1.position.set(-8, 30, 88); front1.target.position.set(0, DECK + 1, 15 + SZ);
  const stageWash = shadowSpot(0xffffff, 0, { angle: 0.8, penumbra: 1, cast: false });
  stageWash.position.set(0, LT - 1, BZ[1]); stageWash.target.position.set(0, DECK, 16 + SZ);
  for (const l of [front1, stageWash]) root.add(l, l.target);
  const fill = [];
  for (const [x, y, z] of [[-40, 30, 66], [40, 30, 66], [0, 26, 100]]) { const l = new THREE.PointLight(0xffffff, 0, 160, 2); l.position.set(x, y, z); l.userData.offWhenDark = 'show'; root.add(l); fill.push(l); }
  const house = [];
  // the house lights are the ring's floods: aimed down at the field and the
  // stands, so the membrane above them only gets what bounces back up
  // (not the ones behind the set: they would shine across the stage straight
  // at the house, a glare off the decks; the set stands in front of them)
  for (let i = 0; i < 9; i++) {
    const p = LIGHTS[Math.round(i / 8 * (LIGHTS.length - 1))];
    if (p.z < 20 + SZ) continue;
    // (no fall-off with distance: a long-throw flood lights the field and the
    // stands near it alike; with it, the stands nearest a flood took a hot spot)
    const l = new THREE.SpotLight(KELVIN(5200), 0, 0, 0.8, 1, 0);
    l.position.copy(p).y -= 1.0;
    // each down at the field, just its own side of the middle: aimed across,
    // the far stands sat on its axis and took a hot spot
    l.target.position.set(p.x * 0.2, 0, ZC + (p.z - ZC) * 0.2);
    l.userData.offWhenDark = 'house'; root.add(l, l.target); house.push(l);
  }
  root.add(new THREE.HemisphereLight(0x181a24, 0x050508, 0.35));

  // ── people ──
  // arena seats on the field in blocks, the crowd standing at them; every
  // sold seat in the stands taken
  const inPoly = (poly) => (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  const inField = inPoly(fieldRing);
  const edgeDist = (x, z) => {
    let m = Infinity;
    for (let i = 0; i < fieldRing.length; i++) {
      const a = fieldRing[i], b = fieldRing[(i + 1) % fieldRing.length];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2);
      m = Math.min(m, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return m;
  };
  const onField = (x, z) => inField(x, z) && edgeDist(x, z) > 3;
  // the arena: lettered blocks A (at the stage) to F (towards home), the
  // way the dome's floor plans run them — wide blocks of chairs, 16 to a row
  // and 15 rows deep, with narrow aisles between and a cross aisle between
  // the letters, laid out from the runway outwards. A block that meets the
  // runway, the cross or the desk gives up the side that
  // meets it, whole rows and columns at a time; one cut down to a sliver is
  // left out, and so is a row the field's edge cuts to a few chairs.
  const SEAT = 0.5, PITCH = 0.9, NX = 16, NZ = 15, BW = NX * SEAT, BD = NZ * PITCH, AX = 1.2, AZ = 1.6;
  // (the floor kept GAP clear of the stage, the runway and the cross, so the
  // front rows see over them to the far side)
  const GAP = 3.5;
  const bands = [];
  // (the first blocks 9 m back from the stage's front, as the photographs show it)
  for (let z = RW0 + 9; z + 4 * PITCH < CZ - GAP; z += BD + AZ) bands.push([z, Math.min(z + BD, CZ - GAP)]);
  // beside the walkway across, past its ends, a short band fills the gap
  // between the front blocks and the ones behind the cross
  bands.push([bands[bands.length - 1][1] + AZ, CZ + XD + GAP - AZ]);
  for (let z = CZ + XD + GAP; z < 136; z += BD + AZ) bands.push([z, z + BD]);
  const obst = [
    [-2.2 - GAP, 2.2 + GAP, RW0, RW1 + GAP],                     // the runway
    [-XW - GAP, XW + GAP, CZ - GAP, CZ + XD + GAP],               // the walkway across
    [-TIP / 2 - GAP, TIP / 2 + GAP, RW1 - TIP - GAP, RW1 + GAP], // the end stage
  ];
  // the desk only takes the chairs it stands on; the towers stand in aisles
  // of their own (below), TB either side of each clear of chairs
  const TB = 4.0;
  const taken = [[eye.x - 4.4, eye.x + 4.4, eye.z - 3.0, eye.z + 4.4], ...DT.map(([x, z]) => [x - TB, x + TB, z - TB, z + TB])];
  const free = (x, z) => !taken.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  // the floor ends where the dome's floor plans end it: straight across at
  // the aisle behind the desk's band, cut in towards it from the sides
  // along the diagonal the foul lines' corners leave (from the plan 정우
  // drew over the floor)
  // the field is not quite symmetric (the excite seats' fronts differ a
  // little side to side): a chair only where the field holds it on both
  // sides, so the blocks along them are mirror images
  const inBoth = (x, z) => inField(x, z) && inField(-x, z) && Math.min(edgeDist(x, z), edgeDist(-x, z)) > 2.2;
  const BACK = 123.6, DG0 = [23.5, 106], DG1 = [12, BACK];
  const inBack = (x, z) => z < BACK && (z < DG0[1] || Math.abs(x) < DG0[0] + (z - DG0[1]) * (DG1[0] - DG0[0]) / (DG1[1] - DG0[1]));
  const blocks = [];
  bands.forEach(([z0, z1], r) => {
    // past the end stage the middle is open: a block on the centre line
    const open = z0 > RW1 + GAP;
    const x0s = [];
    // a band the delay towers stand in: each tower in an aisle of its own, the
    // blocks between the centre one and the tower resized to fill that span
    // evenly (no block cut down round a tower's base), the usual ones outside
    const tower = DT.find(([, tz]) => tz + TB > z0 && tz - TB < z1);
    if (open && tower) {
      const tx = Math.abs(tower[0]);
      x0s.push([-BW / 2, BW]);
      const a = BW / 2 + AX, span = tx - TB - a;
      const n = Math.max(1, Math.round((span + AX) / (BW + AX)));
      const w = Math.floor((span - (n - 1) * AX) / n / SEAT + 1e-6) * SEAT;
      for (let k = 0; k < n; k++) { const x = a + k * (w + AX); x0s.push([x, w], [-x - w, w]); }
      // past the tower, a block the field's edge cuts down to a few chairs
      // across is left out rather than kept as a sliver beside the tower
      for (let x = tx + TB; x < 80; x += BW + AX) x0s.push([x, BW, 8], [-x - BW, BW, 8]);
    } else {
      for (let x = open ? -BW / 2 : 3.6; x < 80; x += BW + AX) { x0s.push([x, BW]); if (!open || x > 0) x0s.push([-x - BW, BW]); }
    }
    for (const [x0, bw, minCols = 3] of x0s) {
      let b = { x0, x1: x0 + bw, z0, z1 };
      for (const [ox0, ox1, oz0, oz1] of obst) {
        if (!b || ox1 <= b.x0 || ox0 >= b.x1 || oz1 <= b.z0 || oz0 >= b.z1) continue;
        const parts = [{ ...b, x1: ox0 }, { ...b, x0: ox1 }, { ...b, z1: oz0 }, { ...b, z0: oz1 }]
          .filter((p) => p.x1 - p.x0 >= 6 * SEAT && p.z1 - p.z0 >= 4 * PITCH);
        b = parts.sort((p, q2) => (q2.x1 - q2.x0) * (q2.z1 - q2.z0) - (p.x1 - p.x0) * (p.z1 - p.z0))[0] || null;
      }
      if (b) blocks.push({ ...b, minCols, name: String.fromCharCode(65 + r) });
    }
  });
  const arena = { people: [], chairs: [] };
  {
    const rnd = prng(55);
    for (const b of blocks) {
      const nx = Math.floor((b.x1 - b.x0) / SEAT + 1e-6), nz = Math.floor((b.z1 - b.z0) / PITCH + 1e-6);
      // rows from its front; out to the field's edge, a walkway along the
      // fence left clear, the blocks there as many chairs as fit
      const ox = (b.x0 + b.x1) / 2 - (nx - 1) * SEAT / 2;
      const rows = [];
      for (let j = 0; j < nz; j++) {
        const z = b.z0 + (j + 0.5) * PITCH, row = [];
        for (let i = 0; i < nx; i++) { const x = ox + i * SEAT; if (inBoth(x, z) && free(x, z) && inBack(x, z)) row.push(x); }
        if (row.length >= 3) rows.push({ z, row });
      }
      if (rows.length < 2 || (b.minCols > 3 && rows.filter((r) => r.row.length >= b.minCols).length < b.minCols)) continue;
      for (const { z, row } of rows) for (const x of row) {
        arena.chairs.push({ x, y: 0, z: z + 0.16, turn: Math.PI });
        if (rnd() < 0.97) arena.people.push({ x: x + (rnd() - 0.5) * 0.08, y: 0, z: z - 0.16 + (rnd() - 0.5) * 0.06, h: 0.92 + rnd() * 0.14, full: true, fblock: b });
      }
    }
  }
  root.add(floorChairs(arena.chairs));
  const fieldPeople = arena.people;
  bigCrowd(root, cu, q, fieldPeople.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21 });
  const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.04 })), cu, { maxPx: 3 });
  aisleField.material.uniforms.uGain.value = 0.25;
  root.add(aisleField);
  root.add(lightPoints(fohPosition(pipe, root, eye, { riser: 1.0 }), cu, { maxPx: 4 }));

  // ── haze ──
  const hz = pipe.haze;
  const offs = [[-0.6, 0.35], [0.6, 0.35], [-0.6, -0.35], [0.6, -0.35], [0, 0]];
  ctx.screenHaze(scr.main, offs.map(([dx, dy]) => hz.add(V3(dx * 32, scr.main.position.y + dy * scr.h * 0.5, WZ + 0.9), 0xffffff, 0)), offs);
  scr.main.userData.hazePower = 320;
  // (no glows of their own in the air over the stage and the cross: what
  // lights the haze there is the rig's beams)

  return {
    root, eye, seatNear: stands.seatNear, seats: stands.seats, stageTarget: V3(0, DECK + 8, 6 + SZ),
    camera: { pos: eye, target: V3(0, DECK + 10, 6 + SZ), fov: 60, near: 0.2, far: 800 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x07070b, 0.002),
    hazeDensity: 0.0011, beamGain: 0.5, hazeAmb: new THREE.Color(0x05050a), hazeAmbDist: 260,
    bloom: { strength: 0.75, radius: 0.7, threshold: 1.15 },
    grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.1, lift: [0.004, 0.004, 0.009] },
    env: { w: 236, h: 56, d: 236, eye, wall: 0x0c0c12, floor: 0x0a0a0c, emitters: [
      { w: WW, h: WH, pos: V3(0, WY, WZ + 0.4), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: WW / WH },
      { w: 200, h: 200, pos: V3(0, 55, 52), normal: V3(0, -1, 0), color: 0x202028, power: 1 },
    ] },
    envIntensity: 0.55,
    update(f) {
      stands.update(f); houseGlow(f);
      const show = 1 - f.house;
      runShow(rig, spots, f, { house: V3(0, 1, 68), stage: STAGE, span: 60 });
      runShow(rig, beams, f, { house: V3(0, 22, 95), stage: STAGE, span: 80 });
      runShow(rig, washes, f, { house: V3(0, 0, 26 + SZ), stage: STAGE, span: 30, strobe: false });
      runShow(rig, tw, f, { house: V3(0, 30, 50), stage: V3(0, XH, CZ), span: 60 });
      runShow(rig, ups, f, { house: V3(0, 40, 50), stage: STAGE, up: true });
      washes.forEach(({ fx }) => { fx.angle = 0.3; });
      // the ring converges on the long stage in the chorus, spreads to the roof otherwise
      const sec = f.sec || section(f.bar);
      ring2.forEach(({ fx, i, a }) => {
        const tgt = sec === 'chorus' ? V3(Math.sin(f.t * 0.8 + i) * 22, 26, CZ + XD / 2 + Math.cos(f.t * 0.8 + i) * 3) : V3(Math.sin(a) * 30, 56, ZC + Math.cos(a) * 30);
        fx.dir.lerp(tgt.sub(fx.pos).normalize(), Math.min(1, f.dt * 2)).normalize();
        fx.color.copy(i % 2 ? f.pal.a : f.pal.c);
        fx.intensity = (sec === 'chorus' ? 0.9 + 0.4 * f.kick : sec === 'pre' ? 0.5 : 0.18) * show;
      });
      // (idle, at half what it was: it glared off the deck)
      front1.intensity = 90000 * show;
      stageWash.color.copy(f.pal.a); stageWash.intensity = (12000 + 14000 * f.energy + 6000 * f.kick) * show;
      fill.forEach((l, i) => { l.color.copy(i ? f.pal.b : f.pal.a); l.intensity = (200 + 500 * f.energy) * show; });
      // (half what they were: at full the deck, the trusses and the roof threw
      // too much of them back)
      floodM.color.copy(KELVIN(5200)).multiplyScalar(0.03 + 2.6 * f.house);
      for (const [m, e] of roomLit) m.emissiveIntensity = e * (0.04 + 0.96 * f.house);
      if (membrane.userData.uSky) membrane.userData.uSky.value = 0.06 + 0.94 * f.house;
      for (const g of floodGlow) g.intensity = 0.9 * f.house;
      house.forEach((l) => { l.intensity = 1.6 * f.house; });
      ringTint(ringM.color, f.pal.a).multiplyScalar((0.6 + 0.8 * f.kick) * show + 0.2);
      const sh = membrane.userData.shader;
      if (sh) {
        // the house lights wash the membrane warm; in the show it takes the stage's colour back
        sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.2, 0.16, 0.11).multiplyScalar(0.02 + 0.49 * f.house));
      }
      cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
      cu.uStage.value.set(0, 14, 10 + SZ);
      cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
      flashOnCrowd(cu.uWash.value, runBlinders(blinders, f), runStrobes(strobes, f));
      cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
    },
  };
  // ── the centre stage (360) ──
  // After TWICE's THIS IS FOR at the Tokyo Dome (September 2025): every seat
  // sold, a rectangular stage in the middle of the field on its own roof with
  // a box of screens under it (roundStage), the field seated round it in
  // blocks facing it, four delay towers on the diagonals, FOH towards home.
  function domeRound() {
    // (a runway 8 m wide out from each end, towards home and centre field)
    // (the deck 1.8 m, as the end stage's runways)
    const RC = roundStage(ctx, root, { c: STAGE, w: 16, d: 40, deck: 1.8, top: 27, box: [22, 11], follow: 75, followY: 26, runway: { w: 8, len: 22 } });
    const inF = (x, z) => inRing(fieldRing, x, z) && inRing(fieldRing, -x, z);
    const edgeD = (x, z) => {
      let m = Infinity;
      for (let i = 0; i < fieldRing.length; i++) {
        const a = fieldRing[i], b = fieldRing[(i + 1) % fieldRing.length];
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2);
        m = Math.min(m, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
      }
      return m;
    };
    // the delay towers on the diagonals, each aimed out, an aisle of its own
    // (on the field, 12 m clear of its edge: never into the stands)
    // (the pair towards home on a wider line and allowed nearer the field's edge: the field narrows that way and brought them in against the stage)
    const fieldOK = (cl) => (x, z) => inF(x, z) && Math.min(edgeD(x, z), edgeD(-x, z)) > cl;
    const DTR = [...diagonalTowers(STAGE, { r: 52, ax: 0.62, az: 0.78, cell: 10, ok: fieldOK(12) }).filter(([, z]) => z < STAGE.z), ...diagonalTowers(STAGE, { r: 60, ax: 0.82, az: 0.57, cell: 10, ok: fieldOK(7) }).filter(([, z]) => z > STAGE.z)];
    const towerLights = [];
    // (the outfield's pair as high as the outfield stand they play to; home's to the 2nd floor)
    for (const [x, z] of DTR) towerLights.push(...delayTower(root, { x, z, h: z < STAGE.z ? 20 : 30, boxes: z < STAGE.z ? 14 : 18, width: 1.3, from: STAGE }));
    const rig = ctx.rig({ finish: 'black' });
    const tw = fixtureRow(q, towerLights.length, (i) => ({ fx: rig.add({ pos: towerLights[i], kind: 'beam', length: 70, beamGain: 0.9 }), group: 5 }));
    // (well back from the runway's end, towards home)
    const feye = V3(0, 1.6 + 1.0, STAGE.z + 60);
    const skip = (x, z) => !inF(x, z) || Math.min(edgeD(x, z), edgeD(-x, z)) < 2.2 || RC.inside(x, z, 3.5)
      || DTR.some(([tx, tz]) => Math.abs(x - tx) < 5 && Math.abs(z - tz) < 5)
      || (Math.abs(x - feye.x) < 4.4 && Math.abs(z - feye.z) < 3.6);
    const seats = roundBlocks({ c: STAGE, hd: 20 + 3.5, x0: -80, x1: 80, z0: -10, z1: 140, skip, seed: 55 });
    root.add(floorChairs(seats.chairs));
    bigCrowd(root, cu, q, seats.people.concat(stands.people.map((p) => ({ ...p, h: 0.97 }))), { seed: 21, round: STAGE });
    const aisleField = lightPoints(stands.aisleLights.map((a) => ({ ...a, white: true, size: 0.04 })), cu, { maxPx: 3 });
    aisleField.material.uniforms.uGain.value = 0.25;
    root.add(aisleField);
    root.add(lightPoints(fohPosition(pipe, root, feye, { riser: 1.0 }), cu, { maxPx: 4 }));
    // the house lights: the ring's floods, all round
    const house = [];
    for (let i = 0; i < 9; i++) {
      const p = LIGHTS[Math.round(i / 8 * (LIGHTS.length - 1))];
      const l = new THREE.SpotLight(KELVIN(5200), 0, 0, 0.8, 1, 0);
      l.position.copy(p).y -= 1.0;
      l.target.position.set(p.x * 0.2, 0, ZC + (p.z - ZC) * 0.2);
      l.userData.offWhenDark = 'house'; root.add(l, l.target); house.push(l);
    }
    root.add(new THREE.HemisphereLight(0x181a24, 0x050508, 0.35));
    return {
      root, eye: feye, seatNear: stands.seatNear, seats: stands.seats, stageTarget: V3(0, RC.BY * 0.65, STAGE.z), round: true,
      camera: { pos: feye, target: V3(0, RC.BY, STAGE.z), fov: 60, near: 0.2, far: 800 },
      background: new THREE.Color(0),
      fog: new THREE.FogExp2(0x07070b, 0.002),
      hazeDensity: 0.0011, beamGain: 0.5, hazeAmb: new THREE.Color(0x05050a), hazeAmbDist: 260,
      bloom: { strength: 0.75, radius: 0.7, threshold: 1.15 },
      grade: { exposure: 1.2, vignette: 0.4, ca: 0.005, grain: 0.04, sat: 1.1, lift: [0.004, 0.004, 0.009] },
      env: { w: 236, h: 56, d: 236, eye: feye, wall: 0x0c0c12, floor: 0x0a0a0c, emitters: [
        { w: RC.BW, h: RC.BH, pos: V3(0, RC.BY, STAGE.z + RC.BW / 2), normal: V3(0, 0, 1), screen: true, power: 1.5, aspect: RC.BW / RC.BH },
        { w: 200, h: 200, pos: V3(0, 55, 52), normal: V3(0, -1, 0), color: 0x202028, power: 1 },
      ] },
      envIntensity: 0.55,
      update(f) {
        stands.update(f); houseGlow(f);
        const show = 1 - f.house;
        const [bl, sb] = RC.run(f, { follow: 90000, wash: 12000 });
        runShow(rig, tw, f, { house: V3(0, 30, STAGE.z), stage: RC.stage, span: 60 });
        floodM.color.copy(KELVIN(5200)).multiplyScalar(0.03 + 2.6 * f.house);
        for (const [m, e] of roomLit) m.emissiveIntensity = e * (0.04 + 0.96 * f.house);
        if (membrane.userData.uSky) membrane.userData.uSky.value = 0.06 + 0.94 * f.house;
        for (const g of floodGlow) g.intensity = 0.9 * f.house;
        house.forEach((l) => { l.intensity = 1.6 * f.house; });
        const sh = membrane.userData.shader;
        if (sh) sh.uniforms.uBounce.value.copy(f.pal.a).lerp(f.pal.b, 0.5 + 0.5 * Math.sin(f.t * 0.3)).multiplyScalar((0.012 + 0.02 * f.energy + 0.015 * f.kick) * show).add(new THREE.Color(0.2, 0.16, 0.11).multiplyScalar(0.02 + 0.49 * f.house));
        cu.uRimColor.value.copy(f.pal.a).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar((0.2 + 0.25 * f.kick) * show);
        cu.uStage.value.set(0, 14, STAGE.z);
        cu.uWash.value.copy(f.pal.b).multiplyScalar(0.012 * show + 0.25 * f.house);
        flashOnCrowd(cu.uWash.value, bl, sb);
        cu.uAmb.value.setRGB(0.004, 0.004, 0.007).multiplyScalar(1 + f.house * 8);
      },
    };
  }
}
