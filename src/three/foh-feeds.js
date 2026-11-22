// The overhead fan-light monitor draws the crowd's actual lightsticks and
// the stage outline on their own layer.
import * as THREE from 'three';

export const MAP_LAYER = 7;

function withRenderer(renderer, fn) {
  const target = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  const shadows = renderer.shadowMap.autoUpdate;
  // (a second view must not redraw every shadow map the room has)
  renderer.shadowMap.autoUpdate = false;
  try { fn(); } finally {
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setClearColor(clear, alpha);
    renderer.setRenderTarget(target);
  }
}

// the target's picture the right way up on a GLB screen (whose v runs down)
function upright(texture) {
  const t = texture;
  t.repeat.set(1, -1);
  t.offset.set(0, 1);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function fanMap(root, plan, { size = [1024, 768] } = {}) {
  const points = [];
  root.traverse((o) => { if (o.userData.crowdLights) points.push(o); });
  if (!points.length) return null;
  const box = new THREE.Box3();
  for (const p of points) {
    p.layers.enable(MAP_LAYER);
    p.updateWorldMatrix(true, false);
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox.clone().applyMatrix4(p.matrixWorld));
  }
  for (const { ring } of plan.decks) for (const [x, z] of ring) box.expandByPoint(new THREE.Vector3(x, 0, z));
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const aspect = size[0] / size[1];
  const hh = Math.max((box.max.z - box.min.z) / 2, (box.max.x - box.min.x) / 2 / aspect) * 1.04;
  const hw = hh * aspect;
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 2000);
  // straight down, the stage (low z) at the top of the picture
  cam.position.set(cx, 900, cz);
  cam.up.set(0, 0, -1);
  cam.lookAt(cx, 0, cz);
  cam.layers.set(MAP_LAYER);
  cam.updateMatrixWorld();

  // the stage's outline, seen only by this camera
  const lines = [];
  for (const { ring, h, ramp } of plan.decks) {
    const y = ramp ? Math.max(...ramp) : h;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      lines.push(ax, y, az, bx, y, bz);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const outline = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8aa0c4, fog: false, toneMapped: false }));
  outline.layers.set(MAP_LAYER);
  outline.frustumCulled = false;
  outline.name = 'Fan map outline';
  root.add(outline);

  const rt = new THREE.WebGLRenderTarget(size[0], size[1], { type: THREE.HalfFloatType, samples: 2 });
  const texture = upright(rt.texture);
  // a stick, a few pixels across at the map's scale (some 0.6 m apart)
  const px = Math.max(2, Math.min(5, size[0] / (2 * hw) * 0.55));
  return {
    texture,
    target: rt,
    render(renderer, scene) {
      withRenderer(renderer, () => {
        const bg = scene.background;
        scene.background = null;
        for (const p of points) p.material.uniforms.uMapPx.value = px;
        renderer.setRenderTarget(rt);
        renderer.setClearColor(0x05070b, 1);
        renderer.clear(true, true, false);
        renderer.render(scene, cam);
        for (const p of points) p.material.uniforms.uMapPx.value = 0;
        scene.background = bg;
      });
    },
    dispose() { rt.dispose(); },
  };
}
