import * as THREE from 'three';
import { KELVIN, V3 } from '../core.js';
import { shadowSpot } from '../rig.js';

export function addTheaterLab(root, model, deck) {
  const lab = model.clone(true);
  lab.name = 'Theater Jekyll laboratory';
  root.add(lab);

  // Keep collision at the furniture scale, away from individual bottles and rails.
  const invisible = new THREE.MeshBasicMaterial();
  function collision(x, z, width, depth, height, yaw = 0) {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), invisible);
    shell.position.set(x, deck + height / 2, z);
    shell.rotation.y = yaw;
    shell.visible = false;
    lab.add(shell);
  }
  for (const side of [-1, 1]) {
    collision(side * 2.27, -5.0, 2.47, .49, 6.59, -side * .19);
    collision(side * 4.82, -3.94, 3.17, .49, 6.59, -side * .57);
    collision(side * 1.12, -.40, 2.33, .86, 1.10, -side * .227);
  }

  const blue = new THREE.Color(0x91aaff), green = new THREE.Color(0x73d076);
  const tungsten = KELVIN(3400);
  const key = shadowSpot(tungsten, 0, { angle: .54, penumbra: .85, far: 23, cast: false });
  key.name = 'Theater laboratory workbench key';
  key.position.set(-2.25, 7.7, 4.5);
  key.target.position.set(0, deck + 1, .34);
  lab.add(key, key.target);
  const shelves = [-1, 1].map((side) => {
    const lamp = shadowSpot(blue, 0, { angle: .65, penumbra: .82, far: 20, cast: false });
    lamp.name = 'Theater laboratory shelf wash';
    lamp.position.set(side * 4.6, 7.7, 1.45);
    lamp.target.position.set(side * 3.1, 3.28, -4.25);
    lab.add(lamp, lamp.target);
    return lamp;
  });
  return {
    lead: V3(-.15, deck, 1.55),
    update({ house, energy = 0 }) {
      const show = 1 - house;
      const turn = THREE.MathUtils.smoothstep(energy, .32, .89) * show;
      key.intensity = 295 * house + (420 - 240 * turn) * show;
      for (const lamp of shelves) {
        lamp.color.copy(blue).lerp(green, turn);
        lamp.intensity = 185 * house + (520 - 75 * turn) * show;
      }
    },
  };
}
