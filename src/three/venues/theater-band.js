import * as THREE from 'three';
import { V3 } from '../core.js';
import { ConcertModels, mountEquipmentContactShadows, placement, wirelessMicMount } from '../concert-models.js';

export function addTheaterBand(models, root, deck) {
  const group = new THREE.Group();
  group.name = 'Theater concert band';
  root.add(group);
  const band = new ConcertModels(models, group);
  const footprints = [];

  function add(name, x, z, { yaw = 0, scale, height = 0, contact = true } = {}) {
    band.add(name, placement(x, deck + height, z, yaw, scale));
    if (contact) {
      const { size, center } = models.get(name);
      const offset = V3(center.x * (scale?.x ?? 1), 0, center.z * (scale?.z ?? 1));
      const dx = offset.x * Math.cos(yaw) + offset.z * Math.sin(yaw);
      const dz = offset.z * Math.cos(yaw) - offset.x * Math.sin(yaw);
      footprints.push(placement(x + dx, deck + .003, z + dz, yaw, V3(size.x * (scale?.x ?? 1) + .18, 1, size.z * (scale?.z ?? 1) + .16)));
    }
  }

  add('drums', 0, -2.9);
  add('keyboard', -2.78, -.48, { yaw: Math.PI + .12 });
  add('theater-bass', -4.1, 1.17, { yaw: .16 });
  add('theater-guitar', 3.92, 1.1, { yaw: -.17 });
  add('theater-pedalboard', 3.1, 1.94, { yaw: -.12 });

  const isolation = models.get('theater-amp-isolator');
  for (const [name, x, z, yaw] of [['fender', -4.59, -.23, .16], ['vox', 4.57, -.22, -.17]]) {
    const { size } = models.get(name);
    const scale = V3((size.x + .10) / isolation.size.x, 1, (size.z + .10) / isolation.size.z);
    add('theater-amp-isolator', x, z, { yaw, scale });
    add(name, x, z, { yaw, height: isolation.bounds.max.y, contact: false });
  }
  add('flight-case', -5.64, .27, { yaw: .08, scale: V3(.72, .68, .75) });
  add('touring-rack', 5.61, -.72, { yaw: -.14, scale: V3(.81, .72, .84) });
  add('theater-di', -3.96, 1.99, { yaw: .26 });
  add('theater-di', 3.57, 1.93, { yaw: -.12 });
  add('theater-set-list', .47, 3.65, { yaw: .09, contact: false });
  for (const side of [-1, 1]) {
    for (const z of [1.38, 2.18]) {
      add('cable-guard', side * 5.12, z, { yaw: Math.PI / 2, scale: V3(.9, .58, .63) });
    }
  }

  const lead = V3();
  for (const [x, z, facing] of [[-3.33, 2.70, .10], [0, 3.19, 0], [3.17, 2.70, -.10]]) {
    const { yaw, scale, singer } = wirelessMicMount(facing);
    add('mic', x, z, { yaw, scale });
    add('mark', x + singer.x, z + singer.z, { yaw: facing, height: .004, contact: false });
    if (x === 0) lead.set(x + singer.x, deck, z + singer.z);
  }
  for (const [x, z, yaw] of [[-3.66, 4.27, .11], [-.76, 4.39, -.14], [.79, 4.37, .13], [3.65, 4.28, -.10]]) {
    add('wedge', x, z, { yaw: Math.PI + yaw, scale: V3(.84, .82, .84) });
  }

  band.flush();
  mountEquipmentContactShadows(group, footprints);
  return lead;
}
