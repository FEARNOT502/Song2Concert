// foh-feeds.js — the two pictures the lighting desk shows that are drawn
// from the room itself rather than onto a canvas:
//
//   fanMap      the lightsticks from straight above, on the 4:3 monitor: the
//               same points and the same shader as in the house (so the waves
//               and scenes are exactly the ones the crowd is running), with
//               the stage's outline over them
//   cameraFeed  one of five cameras (the FOH's own, the three floor cameras,
//               the jib), rendered small into a target the lighting monitor
//               shows in its picture; with the rig's beams and haze on 'high'
//
// Both render with the stage's renderer before the frame's own pass, a few
// times a second, and only while the desk is near enough to be seen.
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
    dispose() { rt.dispose(); geo.dispose(); outline.material.dispose(); },
  };
}

// The five cameras' places and where they look, from the layout data:
// 0 the FOH's left camera on the upper deck, 1–3 the floor cameras, 4 the jib
// (its head panning slowly to and fro over the stage).
export function cameraPoses({ data, eye, focus, deck, field = 0 }) {
  const look = (x, z, y = deck + 1.35) => new THREE.Vector3(x, y, z);
  const floorCam = ({ p, aim }) => {
    const d = Math.hypot(aim[0] - p[0], aim[1] - p[1]) || 1;
    const pos = new THREE.Vector3(p[0] + (aim[0] - p[0]) / d * .45, field + 1.58, p[1] + (aim[1] - p[1]) / d * .45);
    return () => ({ pos, at: look(aim[0], aim[1]), fov: 30 });
  };
  const cams = [() => ({ pos: new THREE.Vector3(eye.x - 1.04, 5.02, eye.z + 1.05), at: focus.clone(), fov: 17 })];
  for (const c of data.cameras.slice(0, 3)) cams.push(floorCam(c));
  while (cams.length < 4) cams.push(cams[cams.length - 1]);
  const { tip, aim } = data.jib;
  const jibPos = new THREE.Vector3(tip[0], field + 2.85, tip[1]);
  const base = look(aim[0], aim[1], deck + 1.1);
  cams.push((t) => {
    const a = Math.sin(t * 0.21) * 0.32;
    const dx = base.x - jibPos.x, dz = base.z - jibPos.z;
    return { pos: jibPos, at: new THREE.Vector3(jibPos.x + dx * Math.cos(a) - dz * Math.sin(a), base.y, jibPos.z + dx * Math.sin(a) + dz * Math.cos(a)), fov: 38 };
  });
  return cams;
}

export function cameraFeed(pipe, poses, { size = [480, 270] } = {}) {
  const [w, h] = size;
  const cam = new THREE.PerspectiveCamera(30, w / h, .3, pipe.camera.far);
  const sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
  sceneRT.depthTexture = new THREE.DepthTexture(w, h);
  sceneRT.depthTexture.type = THREE.UnsignedIntType;
  const vw = Math.round(w / 2), vh = Math.round(h / 2);
  const volRT = new THREE.WebGLRenderTarget(vw, vh, { type: THREE.HalfFloatType, depthBuffer: false });
  const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
  const texture = upright(out.texture);
  const texel = new THREE.Vector2();
  return {
    texture,
    render(renderer, index, t, volume) {
      const pose = poses[index](t);
      if (cam.fov !== pose.fov) { cam.fov = pose.fov; cam.updateProjectionMatrix(); }
      cam.position.copy(pose.pos);
      cam.lookAt(pose.at);
      cam.updateMatrixWorld();
      const comp = pipe.venuePass?.comp;
      withRenderer(renderer, () => {
        renderer.setRenderTarget(sceneRT);
        renderer.render(pipe.scene, cam);
        renderer.setRenderTarget(volRT);
        renderer.setClearColor(0x000000, 1);
        renderer.clear(true, false, false);
        // the rig's beams and the haze, as the stage's own pass draws them
        // (it sets these again for its own camera before it draws)
        if (volume && pipe.volOn && pipe.beams && pipe.haze) {
          for (const U of [pipe.beams.uniforms, pipe.haze.uniforms]) {
            U.tDepth.value = sceneRT.depthTexture;
            U.uRes.value.set(vw, vh);
            U.uProjInv.value.copy(cam.projectionMatrixInverse);
            U.uFar.value = cam.far * 0.98;
          }
          pipe.haze.uniforms.uCamWorld.value.copy(cam.matrixWorld);
          renderer.render(pipe.volScene, cam);
        }
        if (comp) {
          const U = comp.material.uniforms;
          texel.copy(U.uVolTexel.value);
          U.tScene.value = sceneRT.texture;
          U.tVol.value = volRT.texture;
          U.uVolTexel.value.set(1 / vw, 1 / vh);
          renderer.setRenderTarget(out);
          comp.render(renderer);
          U.uVolTexel.value.copy(texel);
        }
      });
    },
    dispose() { sceneRT.depthTexture.dispose(); sceneRT.dispose(); volRT.dispose(); out.dispose(); },
  };
}
