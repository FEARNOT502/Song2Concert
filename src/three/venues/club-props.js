import * as THREE from 'three';
import { V3 } from '../core.js';
import { ConcertModels, mountEquipmentContactShadows, placement } from '../concert-models.js';

export function addClubProps(root, models, deck, front, ceiling) {
  const group = new THREE.Group();
  group.name = 'Club modeled equipment';
  root.add(group);
  const props = new ConcertModels(models, group);
  const shadows = [];
  const center = (front + .1) / 2;
  const scaleAt = (value) => typeof value === 'number' ? V3(value, value, value) : value;
  const add = (name, x, y, z, yaw = 0, scale) => props.add(name, placement(x, y, z, yaw, scaleAt(scale)));

  function onFloor(name, x, y, z, yaw = 0, value = 1) {
    const { bounds, center: origin, size } = models.get(name);
    const scale = scaleAt(value);
    add(name, x, y - bounds.min.y * scale.y, z, yaw, scale);
    const offset = V3(origin.x * scale.x, 0, origin.z * scale.z).applyAxisAngle(V3(0, 1), yaw);
    shadows.push(placement(x + offset.x, y + .003, z + offset.z, yaw, V3(size.x * scale.x + .12, 1, size.z * scale.z + .12)));
  }

  function collision(name, x, y, z, w, h, d) {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
    shell.name = name;
    shell.position.set(x, y, z);
    shell.visible = false;
    group.add(shell);
  }

  add('deck', 0, 0, center);
  add('led-wall', 0, deck + .25, .204);
  onFloor('drum-kit', 0, deck, 1.325, 0, .93);
  onFloor('keys', 2.48, deck, 1.55, Math.PI + .24, .94);
  const lean = new THREE.Matrix4().makeRotationX(-7 * Math.PI / 180).setPosition(0, 0, .007);
  for (const [instrument, x, z, yaw] of [['guitar', -2.12, 1.87, -.08], ['bass', 3.88, 1.76, .16]]) {
    onFloor(instrument + '-stand', x, deck, z, yaw);
    props.add(instrument, placement(x, deck, z, yaw).multiply(lean));
  }
  onFloor('shared-vox', -3.15, deck, .67, .16);
  onFloor('support-amp', -3.93, deck, .84, .22);
  onFloor('shared-fender', 3.47, deck, .58, -.14);
  onFloor('pedalboard', -2.15, deck, 2.62, .14);
  add('set-list', .56, deck + .004, 3.01, .14);
  add('cables', -3.41, deck + .003, 1.45, .12, .88);
  onFloor('shared-flight-case', -4.03, deck, 1.83, .18, .56);
  onFloor('shared-flight-case', 4.01, deck, 1.09, -.08, .55);
  onFloor('shared-touring-rack', 4.17, deck, .64, -.16, .55);
  for (const x of [-2.83, -.75, 1.05, 3.67]) {
    onFloor('wedge', x, deck, 3.07, Math.PI + .15 * Math.sign(-x));
  }
  for (const [x, z, scale] of [[-2.49, 2.42, .97], [0, 2.82, 1], [1.47, 2.63, .98], [3.88, 2.41, .94]]) {
    onFloor('wireless-mic', x, deck, z, 0, scale);
  }

  const subHeight = models.get('pa-sub').size.y;
  for (const side of [-1, 1]) {
    const x = side * 5.06, z = front + .12, yaw = -side * .17;
    onFloor('pa-sub', x, 0, z, yaw);
    onFloor('pa-top', x, subHeight, z, yaw);
    collision('Club PA cabinet collision', x, subHeight / 2, z, .79, subHeight, .71);
    for (const pz of [5.2, 8.1, 11.1]) add('acoustic', side * 5.94, .72, pz, -side * Math.PI / 2);
    add('exit-sign', side * 5.91, 2.5, 9.0, -side * Math.PI / 2);
    for (const pz of [5.72, 7.77, 9.82, 11.87, 13.92]) {
      add('ductwork', side < 0 ? -3.9 : 3.6, ceiling - .56, pz, -side * Math.PI / 2);
    }
  }
  for (const z of [7, 11.5, 14.8]) add('house-downlight', 0, ceiling - .242, z);
  const bar = models.get('bar');
  const module = 6.5 / 3;
  for (const i of [-1, 0, 1]) add('bar', -1 + i * module, 0, 14.68, Math.PI, V3(module / bar.size.x, 1, 1));
  collision('Club bar counter collision', -1, .53, 14.68, 6.5, 1.06, .75);

  for (const z of [front - .10, .73]) {
    for (const x of [-3.6, -1.2, 1.2, 3.6]) {
      add('club-truss', x, ceiling - .39, z, 0, V3(2.4 / 2.3, 1, 1));
    }
  }

  mountEquipmentContactShadows(group, shadows);
  return props;
}
