import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadConcertModels, loadDomeSeatModels } from '../../src/three/concert-models.js';
import { crowdUniforms } from '../../src/three/people.js';
import { QUALITY } from '../../src/three/render.js';
import { Rig } from '../../src/three/rig.js';
import { buildDome } from '../../src/three/venues/dome.js';

function rowCamera(seat, depth, side, height, targetHeight = .42) {
  const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
  return [
    [seat.x + depth * fx + side * fz, seat.y + height, seat.z + depth * fz - side * fx],
    [seat.x, seat.y + targetHeight, seat.z],
  ];
}

async function start() {
  const query = new URLSearchParams(location.search);
  const showCrowd = query.get('crowd') === '1';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a101b);
  const pipe = { beams: { add: () => ({}) }, flares: { add: () => ({}) } };
  const art = new THREE.DataTexture(new Uint8Array([30, 35, 41, 255]), 1, 1);
  art.needsUpdate = true;
  const rigs = [];
  const crowd = crowdUniforms();
  crowd.uAmb.value.setHex(0x8b8178);
  crowd.uWash.value.setHex(0x2e3340);
  const [concertModels, domeSeatModels] = await Promise.all([loadConcertModels(), loadDomeSeatModels()]);
  const venue = buildDome({
    mode: 'general', q: { ...QUALITY.low, crowd: showCrowd ? 1 : 0 }, cu: crowd, pipe,
    concertModels, domeSeatModels,
    rig(options) { const rig = new Rig(pipe, options); rigs.push(rig); return rig; },
    art: { texture: () => art }, addScreen() {}, screenHaze() {},
  });
  for (const rig of rigs) venue.root.add(rig.build());
  venue.root.traverse((object) => {
    if (object.isLight || object.isPoints) object.visible = false;
  });

  scene.add(venue.root, new THREE.HemisphereLight(0xf2f6ff, 0x7b7167, 2.25));
  const key = new THREE.DirectionalLight(0xfff2de, 1.2);
  key.position.set(-36, 54, 20);
  const fill = new THREE.DirectionalLight(0xd8e6ff, .45);
  fill.position.set(40, 25, 138);
  scene.add(key, fill);

  const preview = venue.root.getObjectByName('Tokyo Dome GLB seating').userData.seatCounts;
  const row = (block, number) => venue.seats.filter((s) => s.block === block && s.row === number);
  const middle = (seats) => seats[Math.floor(seats.length / 2)];
  const terraceKey = preview.fitted.find((key) => key === 'D:D16:8') ?? preview.fitted[0];
  const terrace = terraceKey && (() => {
    const [, block, number] = terraceKey.split(':');
    const [a, b, , d] = row(block, +number);
    return { ...b, x: (a.x + d.x) / 2, z: (a.z + d.z) / 2 };
  })();
  const views = {
    dome: showCrowd ? [[-9, 23, 83], [4, 12, 139]] : [[0, 11, 93], [0, 20, 150]],
    general: rowCamera(middle(row('A23', 13)), 2.4, 1.25, 1.56),
    terrace: terrace && rowCamera(terrace, 2.9, -1.15, 3.35, .56),
    balcony: rowCamera(middle(row('C38', 2)), 2.7, 1.35, 1.48, .50),
  };

  const camera = new THREE.PerspectiveCamera(56, 1, .12, 700);
  const controls = new OrbitControls(camera, renderer.domElement);
  const draw = () => renderer.render(scene, camera);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    draw();
  };
  const switchView = () => {
    const id = location.hash.slice(1);
    const [position, target] = views[id] ?? views.dome;
    camera.position.fromArray(position);
    controls.target.fromArray(target);
    controls.update();
    draw();
  };
  controls.addEventListener('change', draw);
  addEventListener('resize', resize);
  addEventListener('hashchange', switchView);
  if (query.has('noui')) document.querySelector('nav').hidden = true;
  document.querySelector('[role="status"]').remove();
  camera.position.fromArray(views.dome[0]);
  resize();
  switchView();
  window.__seatPreview = {
    ...preview,
    spectators: venue.root.children.find((object) => object.userData.crowdLights)?.geometry.attributes.position.count ?? 0,
  };
}

start().catch((error) => {
  console.error(error);
  document.querySelector('[role="status"]').textContent = error.message;
});
