// ─────────────────────────────────────────────────────────────────────────────
// the orchestra: four winds, American seating, on risers
//
// Strings on the platform floor in arcs round the podium — first violins on
// the left, seconds inside them, violas centre-right, cellos on the right with
// the basses behind them. Behind the strings three risers: woodwinds (flutes
// and oboes, then clarinets and bassoons), then brass (eight horns on the left,
// trumpets, trombones and tuba on the right), then timpani and percussion at
// the top. Harps and celesta on the far left. About a hundred players.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, V3, phys, std, withRepeat, woodTex } from '../core.js';
import { crowd3D } from '../people.js';
import { mats, seatField } from '../rig.js';

export function instrumentGeos() {
  if (instrumentGeos.cache) return instrumentGeos.cache;
  const G = {};
  // violin along +z: body, neck, scroll
  {
    const body = new THREE.SphereGeometry(1, 14, 8); body.scale(0.1, 0.022, 0.18); body.translate(0, 0, 0);
    const waist = new THREE.SphereGeometry(1, 10, 6); waist.scale(0.07, 0.022, 0.08); waist.translate(0, 0, 0.13);
    const neck = new THREE.BoxGeometry(0.025, 0.02, 0.2); neck.translate(0, 0.01, 0.28);
    const scroll = new THREE.SphereGeometry(0.02, 8, 6); scroll.translate(0, 0.01, 0.39);
    G.violin = mergeGeometries([body, waist, neck, scroll]);
  }
  // cello / bass: a lathe body with a neck, upright
  const fiddle = (s) => {
    const prof = [[0, 0], [0.26, 0.02], [0.33, 0.2], [0.3, 0.42], [0.21, 0.58], [0.23, 0.72], [0.25, 0.9], [0.18, 1.06], [0.06, 1.12], [0, 1.13]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
    const b = new THREE.LatheGeometry(prof, 18); b.scale(1, 1, 0.36); b.translate(0, 0.1 * s, 0);
    const n = new THREE.BoxGeometry(0.05 * s, 0.85 * s, 0.04 * s); n.translate(0, 1.6 * s, 0);
    const pin = new THREE.CylinderGeometry(0.01, 0.01, 0.12 * s, 5); pin.translate(0, 0.05 * s, 0);
    return mergeGeometries([b.toNonIndexed(), n.toNonIndexed(), pin.toNonIndexed()]);
  };
  G.cello = fiddle(0.62);
  G.bass = fiddle(1.0);
  // a straight tube along +z with an optional bell
  const tube = (len, r, bell = 0) => {
    const t = new THREE.CylinderGeometry(r, r, len, 10, 1, true); t.rotateX(Math.PI / 2); t.translate(0, 0, len / 2);
    const parts = [t.toNonIndexed()];
    if (bell) { const c = new THREE.CylinderGeometry(bell, r, bell * 2.2, 16, 1, true); c.rotateX(Math.PI / 2); c.translate(0, 0, len + bell * 1.1); parts.push(c.toNonIndexed()); }
    return mergeGeometries(parts);
  };
  G.flute = tube(0.66, 0.011);
  G.reed = tube(0.58, 0.015, 0.035);
  G.bassoon = tube(1.3, 0.032);
  G.trumpet = tube(0.46, 0.012, 0.06);
  {
    const slide = tube(0.95, 0.009); const slide2 = tube(0.95, 0.009); slide2.translate(0.05, 0, 0);
    const bell = tube(0.4, 0.012, 0.1); bell.translate(-0.1, 0.02, -0.05);
    G.trombone = mergeGeometries([slide, slide2, bell]);
  }
  {
    const coil = new THREE.TorusGeometry(0.16, 0.022, 8, 24); coil.rotateY(Math.PI / 2);
    const bell = new THREE.CylinderGeometry(0.15, 0.03, 0.34, 16, 1, true); bell.rotateZ(Math.PI / 2.4); bell.translate(0.12, -0.12, 0);
    G.horn = mergeGeometries([coil.toNonIndexed(), bell.toNonIndexed()]);
  }
  {
    const body = new THREE.CylinderGeometry(0.15, 0.13, 0.62, 16, 1, true);
    const bell = new THREE.CylinderGeometry(0.26, 0.15, 0.3, 20, 1, true); bell.translate(0, 0.45, 0);
    G.tuba = mergeGeometries([body.toNonIndexed(), bell.toNonIndexed()]);
  }
  instrumentGeos.cache = G;
  return G;
}

export function orchestra(root, cu, { DECK, cond, q }) {
  const G = instrumentGeos();
  const M = mats();
  const varnish = phys({ color: 0x3e1706, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 });
  const blackwood = std({ color: 0x0b0a0a, roughness: 0.3, metalness: 0.2 });
  const bassoonWood = phys({ color: 0x5a2410, roughness: 0.3, clearcoat: 0.8 });
  const hinoki = woodTex({ key: 'hinoki', planks: 7, joints: 2, base: [0.74, 0.57, 0.39], tone: 0.08, grain: 0.18, rough: 0.35, seed: 31 });
  const top = std({ ...withRepeat(hinoki, 1 / 1.3, 1 / 2.6), roughness: 1 });
  const side = std({ color: 0x3a2818, roughness: 0.6 });

  // ── risers ──
  const R1 = 0.3, R2 = 0.6, R3 = 0.9;
  for (const [w, d, h, z] of [[11, 2.0, R1, 3.1], [17, 1.3, R2, 1.5], [15, 1.5, R3, 0.1]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, side, side]);
    r.position.set(0, DECK + h / 2, z); r.receiveShadow = true; r.castShadow = true; root.add(r);
    // a rail along the back of the top riser
  }

  const face = (x, z) => Math.atan2(cond.x - x, cond.z - z);
  const seat = (x, y, z) => ({ x, y, z, turn: face(x, z) });
  // arcs round the podium: angle measured from upstage, positive to the
  // audience's right
  const arcFill = (n, a0, a1, radii, y = DECK) => {
    const out = [];
    const per = Math.ceil(n / radii.length);
    for (const r of radii) {
      const k = Math.min(per, n - out.length);
      for (let i = 0; i < k; i++) {
        const a = (a0 + (a1 - a0) * (k === 1 ? 0.5 : i / (k - 1))) * DEG;
        const x = Math.sin(a) * r, z = cond.z - Math.cos(a) * r;
        out.push(seat(x, y, z));
      }
    }
    return out;
  };
  const row = (n, x0, x1, z, y) => Array.from({ length: n }, (_, i) => seat(x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)), y, z));

  const S = {
    vn1: arcFill(16, -86, -40, [2.3, 3.2, 4.1, 5.0]),
    vn2: arcFill(14, -36, -8, [2.8, 3.7, 4.6, 5.5]),
    va: arcFill(12, 8, 36, [2.8, 3.7, 4.6, 5.5]),
    vc: arcFill(10, 42, 86, [2.3, 3.2, 4.1]),
    cb: arcFill(8, 58, 84, [5.3, 6.2]),
    fl: row(4, -3.9, -1.0, 3.6, DECK + R1),
    ob: row(4, 1.0, 3.9, 3.6, DECK + R1),
    cl: row(4, -3.9, -1.0, 2.65, DECK + R1),
    bn: row(4, 1.0, 3.9, 2.65, DECK + R1),
    hn: row(8, -7.8, -2.6, 1.5, DECK + R2),
    tp: row(4, -0.6, 2.4, 1.5, DECK + R2),
    tb: row(3, 3.2, 5.6, 1.5, DECK + R2),
    tu: row(1, 6.6, 6.6, 1.5, DECK + R2),
    timp: [seat(0, DECK + R3, -0.35)],
    perc: [seat(-4.2, DECK + R3, 0.1), seat(-2.4, DECK + R3, 0.1), seat(2.6, DECK + R3, 0.1), seat(4.6, DECK + R3, 0.1)],
    harp: [seat(-8.6, DECK, 4.9), seat(-8.9, DECK, 3.7)],
    cel: [seat(-7.4, DECK, 2.9)],
  };
  S.timp[0].turn = 0; S.perc.forEach((p) => { p.turn = 0; });

  // players, in black, by pose
  const black = (list) => list.map((p) => ({ ...p, top: 0x0b0b0d, h: 1 }));
  const seatedBy = { violin: [...S.vn1, ...S.vn2, ...S.va], cello: S.vc, flute: S.fl, wind: [...S.ob, ...S.cl, ...S.bn], horn: S.hn, brass: [...S.tp, ...S.tb, ...S.tu], harp: S.harp, keys: S.cel };
  let seed = 3;
  for (const [pose, list] of Object.entries(seatedBy)) root.add(crowd3D(black(list), cu, { kind: 'seated', pose: pose === 'keys' ? 'pianist' : pose, detail: 1, seed: seed++ }));
  root.add(crowd3D(black(S.cb), cu, { kind: 'still', pose: 'bassist', detail: 1, seed: seed++ }));
  root.add(crowd3D(black([...S.timp, ...S.perc]), cu, { kind: 'still', pose: 'mallets', detail: 1, seed: seed++ }));

  // chairs and stands (a stand between each pair of strings)
  const seatedAll = Object.values(seatedBy).flat();
  const chairs = seatedAll.map((p) => ({ x: p.x - Math.sin(p.turn) * 0.05, y: p.y, z: p.z - Math.cos(p.turn) * 0.05, turn: p.turn }));
  root.add(seatField(chairs, { style: 'chair', fabric: std({ color: 0x0b0b0b, roughness: 0.6 }), frame: std({ color: 0x0b0b0b, roughness: 0.5 }) }));
  const stands = [];
  const strings = [...S.vn1, ...S.vn2, ...S.va, ...S.vc];
  strings.forEach((p, i) => { if (i % 2 === 0) stands.push(p); });
  for (const k of ['fl', 'ob', 'cl', 'bn', 'hn', 'tp', 'tb', 'tu', 'perc']) stands.push(...S[k]);
  const standG = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6).translate(0, 0.5, 0),
    new THREE.BoxGeometry(0.5, 0.34, 0.02).rotateX(-0.45).translate(0, 1.12, 0),
  ]);
  const sI = new THREE.InstancedMesh(standG, std({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.4 }), stands.length);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), Y = V3(0, 1, 0);
  stands.forEach((p, i) => { qq.setFromAxisAngle(Y, p.turn + Math.PI); m4.compose(V3(p.x + Math.sin(p.turn) * 0.72, p.y, p.z + Math.cos(p.turn) * 0.72), qq, V3(1, 1, 1)); sI.setMatrixAt(i, m4); });
  root.add(sI);

  // instruments, each in its player's frame
  const place = (list, geo, mat, local, rot = [0, 0, 0], scale = 1) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const L = new THREE.Matrix4().compose(V3(...local), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V3(scale, scale, scale));
    const P = new THREE.Matrix4();
    list.forEach((p, i) => {
      P.compose(V3(p.x, p.y, p.z), qq.setFromAxisAngle(Y, p.turn), V3(1, 1, 1));
      mesh.setMatrixAt(i, P.clone().multiply(L));
    });
    mesh.castShadow = true;
    return mesh;
  };
  root.add(place([...S.vn1, ...S.vn2], G.violin, varnish, [-0.12, 1.02, 0.22], [0.25, -0.35, 0.5]));
  root.add(place(S.va, G.violin, varnish, [-0.12, 1.0, 0.22], [0.25, -0.35, 0.5], 1.12));
  root.add(place(S.vc, G.cello, varnish, [0, 0.02, 0.36], [-0.22, 0, 0]));
  root.add(place(S.cb, G.bass, varnish, [0.12, 0, 0.34], [-0.12, 0, 0.1]));
  root.add(place(S.fl, G.flute, M.chrome, [-0.02, 1.1, 0.18], [0, Math.PI / 2 - 0.1, 0]));
  root.add(place([...S.ob, ...S.cl], G.reed, blackwood, [0, 1.06, 0.14], [0.95, 0, 0]));
  root.add(place(S.bn, G.bassoon, bassoonWood, [0.14, 0.42, 0.3], [-1.45, 0, 0.12]));
  root.add(place(S.hn, G.horn, M.brass, [0.14, 0.78, 0.22]));
  root.add(place(S.tp, G.trumpet, M.brass, [0, 1.04, 0.16], [0.2, 0, 0]));
  root.add(place(S.tb, G.trombone, M.brass, [0, 1.03, 0.17], [0.28, 0, 0]));
  root.add(place(S.tu, G.tuba, M.brass, [0.05, 0.8, 0.28]));

  // timpani: five kettles round the timpanist
  const t0 = S.timp[0];
  for (let i = 0; i < 5; i++) {
    const a = (-60 + i * 30) * DEG, r = 0.34 - Math.abs(i - 2) * 0.03;
    const x = t0.x + Math.sin(a) * 0.95, z = t0.z + Math.cos(a) * 0.95;
    const k = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: 0xb06a38, metalness: 1, roughness: 0.28 }));
    k.position.set(x, t0.y + 0.62, z); root.add(k);
    const head = new THREE.Mesh(new THREE.CircleGeometry(r, 28), std({ color: 0xe6ddc8, roughness: 0.6 }));
    head.rotation.x = -Math.PI / 2; head.position.set(x, t0.y + 0.625, z); root.add(head);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.5, 0.35, 8), M.black);
    legs.position.set(x, t0.y + 0.17, z); root.add(legs);
  }
  // percussion: bass drum, tam-tam, glockenspiel, xylophone
  const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.42, 28), [M.black, M.drumhead, M.drumhead]);
  bd.rotation.z = Math.PI / 2; bd.rotation.y = 0.3; bd.position.set(-4.3, DECK + R3 + 0.62, 0.7); root.add(bd);
  const tam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.012, 36), std({ color: 0x9a6a2a, metalness: 1, roughness: 0.35 }));
  tam.rotation.x = Math.PI / 2; tam.position.set(4.7, DECK + R3 + 1.0, 0.75); root.add(tam);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 6, 30), M.black);
  frame.position.set(4.7, DECK + R3 + 1.0, 0.75); root.add(frame);
  for (const [x, len] of [[-2.4, 1.1], [2.6, 1.4]]) {
    const tbl = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.42), std({ color: 0x5a3018, roughness: 0.4 }));
    tbl.position.set(x, DECK + R3 + 0.86, 0.6); root.add(tbl);
    const bars = [];
    for (let i = 0; i < 18; i++) { const b = new THREE.BoxGeometry(len / 22, 0.02, 0.3 - i * 0.006); b.translate(x - len / 2 + (i + 0.5) * (len / 18), DECK + R3 + 0.9, 0.6); bars.push(b); }
    root.add(new THREE.Mesh(mergeGeometries(bars), x < 0 ? std({ color: 0xd0d0d0, metalness: 1, roughness: 0.25 }) : std({ color: 0x8a4a22, roughness: 0.35 })));
  }
  // harps: column, soundbox, neck, gilded
  const gilt = std({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 });
  for (const h of S.harp) {
    const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.75, 10), gilt); col.position.set(0, 0.9, 0.55); g.add(col);
    const box = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 1.55, 10), phys({ color: 0x8a5a2a, roughness: 0.3, clearcoat: 1 }));
    box.position.set(0, 0.85, 0.2); box.rotation.x = 0.32; g.add(box);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 1.72, 0.55), V3(0, 1.68, 0.35), V3(0, 1.58, 0.15), V3(0, 1.62, -0.05)]), 16, 0.035, 8), gilt);
    g.add(neck);
    g.position.set(h.x, h.y, h.z); g.rotation.y = h.turn; root.add(g);
  }
  const cel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.5), phys({ color: 0x1a120c, roughness: 0.2, clearcoat: 1 }));
  const c0 = S.cel[0];
  cel.position.set(c0.x + Math.sin(c0.turn) * 0.55, DECK + 0.5, c0.z + Math.cos(c0.turn) * 0.55); cel.rotation.y = c0.turn; root.add(cel);
}
