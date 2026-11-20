import * as THREE from 'three';
import { V3 } from '../core.js';
import { addModelArray, ConcertModels, mountEquipmentContactShadows, placement } from '../concert-models.js';
import { mats, subStack, wedge } from '../rig.js';
import { paHang } from '../show.js';

export function addTheaterPA(root, models, { concert, deck, lipPath, portalFront, openingWidth, openingTop }) {
  const pa = new THREE.Group();
  pa.name = 'Theater PA';
  root.add(pa);
  const detailed = models && ['line-array', 'line-array-bar', 'ground-sub', 'front-fill', 'wedge'].every(name => models.has(name));
  const batch = detailed ? new ConcertModels(models, pa) : null;
  const shadows = [];
  const steel = mats().black;
  const collision = new THREE.MeshBasicMaterial();
  const up = V3(0, 1);

  function flown(name, config) {
    const roofY = config.y + .75;
    const hang = paHang(pa, { ...config, roofY, build: batch && (attrs => addModelArray(batch, attrs)) });
    hang.name = name;
    // Short steel arms seat into the solid audience face of the proscenium.
    const beamLength = config.z - portalFront + .35;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(config.width * .86, .13, beamLength), steel);
    arm.position.set(config.x, roofY, portalFront - .04 + beamLength / 2);
    arm.name = 'Theater PA suspension arm';
    pa.add(arm);
  }

  flown('Theater center PA hang', {
    x: 0, y: openingTop + 2.46, z: portalFront + .75, width: 1.03,
    boxes: 6, height: .32, depth: .60, splay: .04,
  });
  for (const side of [-1, 1]) {
    flown('Theater side PA hang', {
      x: side * (openingWidth / 2 + .46), y: openingTop - .28, z: portalFront + .80,
      boxes: concert ? 10 : 9, width: .74, height: .34, depth: .54, yaw: -side * .14, splay: .016,
    });
  }

  function cabinet(name, x, y, z, yaw, width, height, depth) {
    if (batch) {
      const { size, center, bounds } = models.get(name);
      const scale = V3(width / size.x, height / size.y, depth / size.z);
      const offset = V3(center.x * scale.x, bounds.min.y * scale.y, center.z * scale.z).applyAxisAngle(up, yaw);
      batch.add(name, placement(x - offset.x, y - offset.y, z - offset.z, yaw, scale));
      return;
    }
    const housing = name === 'wedge' ? wedge({ w: width }) : subStack({ w: width, h: height, d: depth, count: 1 });
    housing.name = name;
    housing.position.set(x, y, z);
    housing.rotation.y = yaw;
    if (name === 'wedge') housing.scale.set(1, height / .36, depth / .52);
    pa.add(housing);
  }

  for (const side of [-1, 1]) {
    const subX = concert ? [1.48, 2.66] : [6.43];
    const y = concert ? 0 : deck;
    const z = concert ? 6.52 : 2.93;
    const width = concert ? 1.03 : .92, height = concert ? .49 : .43, depth = .72;
    for (const x of subX) {
      cabinet('ground-sub', side * x, y, z, 0, width, height, depth);
      shadows.push(placement(side * x, y + .003, z, 0, V3(width + .14, 1, depth + .12)));
      if (batch) {
        const shell = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), collision);
        shell.position.set(side * x, y + height / 2, z);
        shell.name = 'Theater subwoofer cabinet collision';
        shell.visible = false;
        pa.add(shell);
      }
    }
    if (!concert) {
      const yaw = Math.PI + side * .24;
      cabinet('wedge', side * 5.36, deck, 3.84, yaw, .55, .25, .43);
      shadows.push(placement(side * 5.36, deck + .003, 3.84, yaw, V3(.65, 1, .52)));
    }
  }

  const stops = concert ? [.11, .265, .42, .58, .735, .89] : [.16, .39, .61, .84];
  for (const t of stops) {
    const edge = lipPath.getPointAt(t), tangent = lipPath.getTangentAt(t);
    const outward = V3(-tangent.z, 0, tangent.x);
    const yaw = Math.atan2(outward.x, outward.z);
    const center = edge.clone().addScaledVector(outward, .145);
    cabinet('front-fill', center.x, deck - .25, center.z, yaw, .58, .18, .28);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(.44, .10, .12), steel);
    bracket.position.copy(edge).addScaledVector(outward, -.01);
    bracket.position.y = deck - .17;
    bracket.rotation.y = yaw;
    bracket.name = 'Theater front-fill fascia bracket';
    pa.add(bracket);
  }

  batch?.flush();
  mountEquipmentContactShadows(pa, shadows);
}
