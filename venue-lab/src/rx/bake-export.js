// The bake's input, from the room as the Lab builds it (bake-gi.mjs drives
// this in a headless browser and does the ray tracing in Node):
//
//   lights  every spot and point light, sampled over several states of the
//           show (house up, half, down; different moments of the song), then
//           grouped: lights whose intensity always moves in proportion and
//           whose colour is always the same are one group, baked together at
//           their relative strengths. The LED walls (their area lights) are a
//           group each, baked as the walls' faces glowing.
//   surfaces every opaque triangle in the room, in world space, with its
//           albedo (colour × texture average × vertex/instance colour), whether
//           it is two-sided, and whether it is an LED wall's face.

import * as THREE from 'three';

const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible && !p.userData.rxHidden) return false; return true; };

function texAverage(tex, cache) {
  if (!tex?.image) return [1, 1, 1];
  if (cache.has(tex)) return cache.get(tex);
  let out = [1, 1, 1];
  try {
    const img = tex.image;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (img.data && img.width) {
      // a DataTexture: average its texels directly
      const d = img.data, n = img.width * img.height, ch = d.length / n;
      const s = [0, 0, 0];
      for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 4096))) for (let k = 0; k < 3; k++) s[k] += d[i * ch + Math.min(k, ch - 1)];
      const cnt = Math.ceil(n / Math.max(1, Math.floor(n / 4096)));
      const max = d instanceof Uint8Array || d instanceof Uint8ClampedArray ? 255 : 1;
      out = s.map((v) => v / cnt / max);
    } else {
      g.drawImage(img, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      const s = [0, 0, 0];
      for (let i = 0; i < 256; i++) for (let k = 0; k < 3; k++) s[k] += d[i * 4 + k];
      out = s.map((v) => v / 256 / 255);
    }
    if (tex.colorSpace === THREE.SRGBColorSpace) out = out.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  } catch { out = [1, 1, 1]; }
  cache.set(tex, out);
  return out;
}

function baseAlbedo(m, cache) {
  let c = [0.18, 0.18, 0.18];
  if (m.color?.isColor) c = [m.color.r, m.color.g, m.color.b];
  else if (m.uniforms?.diffuse?.value?.isColor) { const v = m.uniforms.diffuse.value; c = [v.r, v.g, v.b]; }
  else if (m.uniforms?.uColor?.value?.isColor) { const v = m.uniforms.uColor.value; c = [v.r, v.g, v.b]; }
  if (m.map) { const t = texAverage(m.map, cache); c = c.map((v, i) => v * t[i]); }
  // a lamp's or a screen's unlit face: what it reflects, not what it shows
  if (m.isMeshBasicMaterial || m.isShaderMaterial) c = c.map((v) => Math.min(v, 0.25));
  return c.map((v) => Math.min(0.92, Math.max(0, v)));
}

function skipMaterial(m) {
  if (!m || m.visible === false || m.colorWrite === false) return true;
  if (m.blending === THREE.AdditiveBlending || (m.blending === THREE.CustomBlending)) return true;
  if (m.transparent && (m.opacity < 0.6 || m.depthWrite === false)) return true;
  if (m.isPointsMaterial || m.isLineBasicMaterial || m.isSpriteMaterial) return true;
  return false;
}

export async function exportBake(App, { url = '/__bake', states, send = true, extra = {} } = {}) {
  const pipe = App.pipe, venue = App.stage.debug.venue, root = venue.root;
  root.updateMatrixWorld(true);
  // ── the lights over the show's states ──
  const lights = [];
  root.traverse((o) => { if (o.isSpotLight || o.isPointLight || o.isRectAreaLight) lights.push(o); });
  const screenRect = (l) => l.isRectAreaLight && l.parent?.userData?.rect === l;
  const S = states || [[1, 0.5], [0.7, 7.3], [0.35, 13.1], [0, 3.1], [0, 19.7], [0, 41.3], [0, 27.9]];
  const house0 = App.houseTarget;
  const rec = lights.map(() => []);
  const tp = new THREE.Vector3();
  for (const [h, t] of S) {
    App.setHouse(h, true);
    App.beat.clock = t;
    App.beat.energy = App.beat.sectionEnergy(Math.floor(t * App.beat.bpm / 240));
    App.frame(0.016);
    root.updateMatrixWorld(true);
    lights.forEach((l, i) => rec[i].push({ I: visible(l) ? l.intensity : 0, c: [l.color.r, l.color.g, l.color.b] }));
  }
  const info = (l) => {
    const p = l.getWorldPosition(new THREE.Vector3());
    const o = { type: l.type, pos: p.toArray(), name: l.name || '' };
    if (l.isSpotLight) {
      l.target.getWorldPosition(tp);
      Object.assign(o, { dir: tp.clone().sub(p).normalize().toArray(), angle: l.angle, penumbra: l.penumbra, distance: l.distance, decay: l.decay });
    } else if (l.isPointLight) Object.assign(o, { distance: l.distance, decay: l.decay });
    else {
      const q = l.getWorldQuaternion(new THREE.Quaternion()), s = l.getWorldScale(new THREE.Vector3());
      Object.assign(o, { normal: new THREE.Vector3(0, 0, -1).applyQuaternion(q).toArray(), right: new THREE.Vector3(1, 0, 0).applyQuaternion(q).toArray(), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q).toArray(), w: l.width * s.x, h: l.height * s.y });
    }
    return o;
  };
  const groups = [];
  const used = new Set();
  lights.forEach((l, i) => {
    if (used.has(i)) return;
    if (l.isRectAreaLight) {
      if (!screenRect(l)) return;
      used.add(i);
      groups.push({ kind: 'screen', name: l.name || `screen ${groups.length}`, rep: info(l), members: [info(l)], light: l });
      return;
    }
    const v = rec[i].map((r) => r.I);
    const mx = Math.max(...v);
    if (mx <= 1e-6) return;
    const g = { kind: 'light', name: l.name || `${l.type} ${i}`, idx: [i] };
    used.add(i);
    lights.forEach((l2, j) => {
      if (used.has(j) || l2.type !== l.type || l2.isRectAreaLight) return;
      const v2 = rec[j].map((r) => r.I), m2 = Math.max(...v2);
      if (m2 <= 1e-6) return;
      const prop = v.every((x, s) => Math.abs(x / mx - v2[s] / m2) < 0.01);
      const col = rec[i].every((r, s) => (r.I <= 0 || rec[j][s].I <= 0) || r.c.every((c, k) => Math.abs(c - rec[j][s].c[k]) < 0.01));
      if (prop && col) { g.idx.push(j); used.add(j); }
    });
    // the representative: the strongest; the others at their strength relative to it
    g.idx.sort((a, b) => Math.max(...rec[b].map((r) => r.I)) - Math.max(...rec[a].map((r) => r.I)));
    const rep = g.idx[0];
    const sStar = rec[rep].reduce((bi, r, s, arr) => (r.I > arr[bi].I ? s : bi), 0);
    g.rep = info(lights[rep]); g.light = lights[rep];
    g.members = g.idx.map((j) => ({ ...info(lights[j]), k: rec[j][sStar].I / rec[rep][sStar].I }));
    delete g.idx;
    groups.push(g);
  });
  // at most MAXG groups (the GPU sums them into one texture): the LED walls
  // and the strongest; the rest keep their direct light only
  const MAXG = 24;
  if (groups.length > MAXG) {
    const weight = (g) => (g.kind === 'screen' ? Infinity : Math.max(...rec[lights.indexOf(g.light)].map((r) => r.I)) * g.members.reduce((t, m) => t + (m.k ?? 1), 0));
    groups.sort((a, b) => weight(b) - weight(a));
    groups.length = MAXG;
  }
  App.setHouse(house0, true);
  App.frame(0.016);

  // ── the surfaces ──
  const cache = new Map();
  const screenFaces = new Map();
  groups.forEach((g, gi) => { if (g.kind === 'screen') { const face = g.light.parent?.userData?.face; if (face) screenFaces.set(face, gi); } });
  const pos = [], idx = [], alb = [], flags = [], egrp = [];
  let nv = 0;
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4(), mi = new THREE.Matrix4(), col = new THREE.Color();
  const bb = new THREE.Box3();
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.isPoints || o.isLine || o.isSprite || !visible(o) || !o.geometry?.attributes?.position) return;
    const geo = o.geometry, P = geo.attributes.position, I = geo.index;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groupsG = geo.groups.length && Array.isArray(o.material) ? geo.groups : [{ start: 0, count: I ? I.count : P.count, materialIndex: 0 }];
    const VC = geo.attributes.color;
    const inst = o.isInstancedMesh ? o.count : 1;
    const screenG = screenFaces.get(o) ?? -1;
    meshes++;
    for (let k = 0; k < inst; k++) {
      m4.copy(o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(k, mi); m4.multiply(mi); }
      const instCol = o.isInstancedMesh && o.instanceColor ? (o.getColorAt(k, col), [col.r, col.g, col.b]) : null;
      const base = nv;
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m4); pos.push(v.x, v.y, v.z); bb.expandByPoint(v); }
      nv += P.count;
      for (const gr of groupsG) {
        const m = mats[gr.materialIndex ?? 0];
        if (skipMaterial(m) && screenG < 0) continue;
        let a = baseAlbedo(m, cache);
        if (instCol) a = a.map((x, c) => x * instCol[c]);
        const two = m.side === THREE.DoubleSide ? 1 : 0;
        const end = Math.min(gr.start + gr.count, I ? I.count : P.count);
        for (let t = gr.start; t + 2 < end + 0; t += 3) {
          const ia = I ? I.getX(t) : t, ib = I ? I.getX(t + 1) : t + 1, ic = I ? I.getX(t + 2) : t + 2;
          idx.push(base + ia, base + ib, base + ic);
          let ta = a;
          if (VC && m.vertexColors) ta = a.map((x, c) => x * (VC.getComponent(ia, c) + VC.getComponent(ib, c) + VC.getComponent(ic, c)) / 3);
          alb.push(...ta.map((x) => Math.round(Math.sqrt(Math.min(1, x)) * 255)));
          flags.push(two | (screenG >= 0 ? 2 : 0));
          egrp.push(Math.max(0, screenG));
        }
      }
    }
  });
  const header = {
    venue: App.venueId, mode: App.pipe.rx?.mode ?? 'general',
    env: venue.env ? { w: venue.env.w, h: venue.env.h, d: venue.env.d } : null,
    bbox: [bb.min.toArray(), bb.max.toArray()],
    tris: idx.length / 3, verts: nv, meshes,
    groups: groups.map(({ light, ...g }) => g),
    ...extra,
  };
  if (!send) return header;
  const enc = new TextEncoder().encode(JSON.stringify(header));
  const parts = [new Uint32Array([enc.length]), enc];
  const pad = (4 - ((4 + enc.length) % 4)) % 4;
  parts.push(new Uint8Array(pad));
  parts.push(new Uint32Array([nv, idx.length / 3]));
  parts.push(new Float32Array(pos), new Uint32Array(idx), new Uint8Array(alb), new Uint8Array(flags), new Uint8Array(egrp));
  const res = await fetch(url, { method: 'POST', body: new Blob(parts) });
  return { ...header, groups: header.groups.length, server: await res.text() };
}
