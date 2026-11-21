// A reflection probe: the room itself, captured from inside it, one cube face
// a frame, prefiltered for rough reflections once all six are in. The
// materials look it up box-projected (materials.js), so a reflection on the
// stage floor lands where the walls and the screen really are.

import * as THREE from 'three';

export class ReflectionProbe {
  constructor(renderer, pmrem, size = 256) {
    this.renderer = renderer;
    this.pmrem = pmrem;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cam = new THREE.CubeCamera(0.05, 400, this.cubeRT);
    this.pmremRT = null;
    this.face = 0;
    this.ready = false;
    this.every = 45;          // frames between captures
    this.wait = 0;
    this.box = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  }
  get texture() { return this.ready ? this.pmremRT.texture : null; }
  place(pos, min, max) {
    this.cam.position.copy(pos);
    this.box.min.copy(min); this.box.max.copy(max);
    this.cam.updateMatrixWorld(true);
    this.ready = false; this.face = 0; this.wait = 0;
  }
  // `faces` cube faces now; after the sixth the prefiltered map is rebuilt
  step(scene, faces = 1, before = null, after = null) {
    if (this.face === 0 && this.ready && this.wait-- > 0) return false;
    const r = this.renderer, cam = this.cam;
    if (cam.coordinateSystem !== r.coordinateSystem) { cam.coordinateSystem = r.coordinateSystem; cam.updateCoordinateSystem(); }
    cam.updateMatrixWorld(true);
    const cur = r.getRenderTarget(), cf = r.getActiveCubeFace(), cm = r.getActiveMipmapLevel();
    const ac = r.autoClear;
    r.autoClear = true;
    before?.();
    for (let i = 0; i < faces && this.face < 6; i++, this.face++) {
      r.setRenderTarget(this.cubeRT, this.face);
      r.render(scene, cam.children[this.face]);
    }
    after?.();
    r.autoClear = ac;
    r.setRenderTarget(cur, cf, cm);
    if (this.face < 6) return false;
    this.face = 0;
    this.wait = this.every;
    this.pmremRT = this.pmrem.fromCubemap(this.cubeRT.texture, this.pmremRT);
    this.ready = true;
    return true;
  }
  dispose() { this.cubeRT.dispose(); this.pmremRT?.dispose(); }
}
