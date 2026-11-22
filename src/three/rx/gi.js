// ─────────────────────────────────────────────────────────────────────────────
// The baked light (A1), live.
//
// The room's indirect light was ray traced offline (bake-gi.mjs), once per
// light group: each group is the lights that always move together (the house
// lights, a front light, the colour wash, the LED wall...), baked at unit
// strength. Light adds, so the room's GI now is the sum of those bakes, each
// weighted by what its lights are doing this frame: colour × intensity. That
// sum is made on the GPU when light weights change, into three small 3D textures
// (first-order spherical harmonics of irradiance, one per colour channel) read
// by the materials (materials.js) and the haze.
//
// The file: 'RXGI', a u32 header length, the JSON header, then half floats:
// for each group, for each channel (r, g, b), the probes x-fastest, four each
// (constant term, then the linear term's x, y, z).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RXU } from './materials.js';

const MAXG = 32;

export async function loadGI(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'RXGI') throw new Error(`${url}: not a GI file`);
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const off = (8 + hl + 3) & ~3;
  const data = new Uint16Array(buf, off, (buf.byteLength - off) >> 1);
  return { header, data };
}

export class GIVolume {
  constructor(renderer) {
    this.renderer = renderer;
    this.ready = false;
    this.groups = [];
    this.weights = Array.from({ length: MAXG }, () => new THREE.Vector3());
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      defines: { MAXG },
      uniforms: { tIn: { value: null }, uW: { value: this.weights }, uG: { value: 0 }, uC: { value: 0 }, uZ: { value: 0 }, uNZ: { value: 1 }, uNX: { value: 1 } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        precision highp sampler3D;
        uniform highp sampler3D tIn;
        uniform vec3 uW[MAXG];
        uniform int uG, uC, uZ, uNZ, uNX;
        void main() {
          ivec2 p = ivec2(gl_FragCoord.xy);
          vec4 s = vec4(0.0);
          for (int g = 0; g < MAXG; g++) {
            if (g >= uG) break;
            float w = uW[g][uC];
            if (w != 0.0) s += texelFetch(tIn, ivec3(p.x + g * uNX, p.y, uC * uNZ + uZ), 0) * w;
          }
          gl_FragColor = s;
        }`,
      depthTest: false, depthWrite: false,
    }));
  }

  // the probes and the groups, matched to the lights now in the room
  set({ header, data }, root) {
    this.dispose();
    const [nx, ny, nz] = header.dims;
    const G = header.groups.length;
    if (G > MAXG || nx * G > 2048 || nz * 3 > 2048) throw new Error('GI: too many groups for one texture');
    // groups side by side along x, channels stacked along z: [c][z][y][g][x]
    const W = nx * G, packed = new Uint16Array(W * ny * nz * 3 * 4);
    for (let g = 0; g < G; g++) for (let c = 0; c < 3; c++) for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) {
      const src = ((((g * 3 + c) * nz + z) * ny + y) * nx) * 4;
      const dst = (((c * nz + z) * ny + y) * W + g * nx) * 4;
      packed.set(data.subarray(src, src + nx * 4), dst);
    }
    const tex = new THREE.Data3DTexture(packed, W, ny, nz * 3);
    tex.format = THREE.RGBAFormat; tex.type = THREE.HalfFloatType;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    this.input = tex;
    this.rts = [0, 1, 2].map(() => {
      const rt = new THREE.WebGL3DRenderTarget(nx, ny, nz, { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      rt.texture.wrapS = rt.texture.wrapT = rt.texture.wrapR = THREE.ClampToEdgeWrapping;
      return rt;
    });
    this.header = header;
    this.dims = [nx, ny, nz];
    const lights = [];
    root.traverse((o) => { if (o.isLight) lights.push(o); });
    root.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    const find = (type, pos) => {
      let best = null, bd = 0.06;
      for (const l of lights) {
        if (l.type !== type) continue;
        const d = l.getWorldPosition(wp).distanceTo(new THREE.Vector3(...pos));
        if (d < bd) { bd = d; best = l; }
      }
      return best;
    };
    this.groups = header.groups.map((g) => ({ ...g, light: find(g.rep.type, g.rep.pos) }));
    this.missing = this.groups.filter((g) => !g.light).map((g) => g.name);
    const o = header.origin, c = header.cell;
    // texel centres sit on the probes: the volume reaches half a cell past them
    RXU.rxGIOrigin.value.set(o[0] - c[0] / 2, o[1] - c[1] / 2, o[2] - c[2] / 2);
    RXU.rxGISize.value.set(nx * c[0], ny * c[1], nz * c[2]);
    RXU.rxGIOffset.value = header.offset ?? Math.min(...c) * 0.4;
    RXU.rxGI0.value = this.rts[0].texture; RXU.rxGI1.value = this.rts[1].texture; RXU.rxGI2.value = this.rts[2].texture;
    this.dirty = true;
    this.ready = true;
  }

  static visible(o) { for (let p = o; p; p = p.parent) if (!p.visible && !p.userData.rxHidden) return false; return true; }

  update() {
    if (!this.ready) return;
    for (const [i, { light, scale }] of this.groups.entries()) {
      let r = 0, g = 0, b = 0;
      if (light && GIVolume.visible(light)) {
        const k = light.intensity * (scale ?? 1);
        r = light.color.r * k;
        g = light.color.g * k;
        b = light.color.b * k;
      }
      const weight = this.weights[i];
      if (weight.x === r && weight.y === g && weight.z === b) continue;
      weight.set(r, g, b);
      this.dirty = true;
    }
    if (!this.dirty) return;
    const r = this.renderer, U = this.quad.material.uniforms;
    U.tIn.value = this.input; U.uG.value = this.groups.length; U.uNZ.value = this.dims[2]; U.uNX.value = this.dims[0];
    const cur = r.getRenderTarget(), cf = r.getActiveCubeFace(), cm = r.getActiveMipmapLevel();
    for (let c = 0; c < 3; c++) {
      U.uC.value = c;
      for (let z = 0; z < this.dims[2]; z++) {
        U.uZ.value = z;
        r.setRenderTarget(this.rts[c], z);
        this.quad.render(r);
      }
    }
    r.setRenderTarget(cur, cf, cm);
    this.dirty = false;
  }

  dispose() {
    this.input?.dispose(); this.rts?.forEach((t) => t.dispose());
    this.input = null; this.rts = null; this.ready = false;
    RXU.rxGI0.value = RXU.rxGI1.value = RXU.rxGI2.value = null;
  }
}
