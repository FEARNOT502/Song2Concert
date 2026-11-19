import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, clamp, ringTint, std, velvet } from './core.js';
import { rodInto } from './rig.js';
import { flashUnits, runBlinders, runShow } from './show.js';
import { STEP_RISE, STEP_RUN } from './stage-plan.js';
import { ConcertModels, heading, placement } from './concert-models.js';
import layouts from './data/concert-equipment.json';

const FLIGHT_CASE_SIZES = [V3(1, 1, 1), V3(.84, .77, .88), V3(1.06, .86, .96)];
const point = ([x, z], y = 0) => V3(x, y, z);
const cabinetRot = new THREE.Quaternion();
const X = V3(1), Y = V3(0, 1);
// The microphone's grille and capsule center in the exported stand's frame.
const MIC_AXIS = V3(.31, .20, .93).normalize();
const MIC_GRILLE = V3(.286, 1.725, .389).addScaledVector(MIC_AXIS, .095);
const MIC_HEIGHT = 1.48;
const CONTACT_PROPS = new Set(['drums', 'keyboard', 'mic', 'prompter', 'wedge', 'touring-rack', 'flight-case', 'ballast']);

function cameraLabel(code) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#131316';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#e1e4e8';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CAM ' + code, 64, 17);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(.103, .027), new THREE.MeshBasicMaterial({ map, color: 0xbbbbbb }));
}

function contains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

function stageHeight(decks, x, z) {
  let height = 0;
  for (const { ring, h, ramp } of decks) {
    if (!contains(ring, x, z)) continue;
    if (!ramp) height = Math.max(height, h);
    else {
      const zs = ring.map((p) => p[1]);
      const low = Math.min(...zs), high = Math.max(...zs);
      height = Math.max(height, THREE.MathUtils.lerp(...ramp, (z - low) / (high - low)));
    }
  }
  return height;
}

function mountContactShadows(group, footprints) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `
      varying vec2 footprint;
      void main() {
        footprint = abs(uv * 2.0 - 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 footprint;
      void main() {
        vec2 rounded = max(footprint - 0.26, 0.0) / 0.74;
        float shade = 1.0 - smoothstep(0.22, 1.0, length(rounded));
        gl_FragColor = vec4(0.005, 0.005, 0.007, shade * 0.47);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, footprints.length);
  mesh.name = 'Equipment contact shadows';
  mesh.userData.noCollide = true;
  footprints.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  group.add(mesh);
}

export function addConcertEquipment(models, root, room, mode, plan, eye) {
  const data = layouts[room + '-' + mode];
  const group = new THREE.Group();
  group.name = 'Concert equipment';
  root.add(group);
  const batch = new ConcertModels(models, group);
  const floorExclusions = [], collision = [], contactShadows = [];
  const collisionMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const display = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.FrontSide });
  const railParts = [];
  const amber = new THREE.MeshBasicMaterial({ color: 0x0d0704, toneMapped: false });
  const warm = new THREE.Color(0xffa15e);
  let drapeMaterial, matteDrape;
  const fieldHeight = room === 'arena' ? 0 : .02;

  function boxCollision(x, y, z, w, h, d, yaw = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.rotateY(yaw); geo.translate(x, y, z);
    collision.push(geo);
  }
  function add(name, x, y, z, yaw = 0, scale, material) {
    batch.add(name, placement(x, y, z, yaw, scale), material);
  }
  function contact(x, y, z, w, d, yaw = 0) {
    contactShadows.push(placement(x, Math.max(fieldHeight, y) + .003, z, yaw, V3(w, 1, d)));
  }
  function reserve(x, z, rx, rz) {
    floorExclusions.push((a, b) => Math.abs(a - x) <= rx && Math.abs(b - z) <= rz);
  }
  function reservePad(x, z, radius) {
    floorExclusions.push((a, b) => (a - x) ** 2 + (b - z) ** 2 < radius ** 2);
  }
  function stepMesh(step) {
    const { x, z, h, y0, width, dir } = step;
    const n = Math.max(1, Math.ceil((h - y0) / STEP_RISE - 1e-6)), rise = (h - y0) / n;
    const yaw = heading(dir);
    for (let i = 0; i < n; i++) {
      const t = (i + .5) * STEP_RUN;
      add('tread', x + t * dir[0], y0 + (i + 1) * rise + .001, z + t * dir[1], yaw + Math.PI, V3(width / 1.44, 1, 1));
    }
    for (const side of [-1, 1]) {
      const dx = Math.cos(yaw) * side * (width / 2 - .04), dz = -Math.sin(yaw) * side * (width / 2 - .04);
      const start = V3(x + dx, y0 + rise, z + dz).addScaledVector(point(dir), .07);
      const end = V3(x + dx, h, z + dz).addScaledVector(point(dir), n * STEP_RUN - .06);
      const a = start.clone().add(V3(0, .86));
      const b = end.clone().add(V3(0, .86));
      rodInto(railParts, start, a, .023);
      rodInto(railParts, end, b, .023);
      rodInto(railParts, a, b, .024);
    }
  }
  for (const s of plan.steps) stepMesh(s);
  if (railParts.length) {
    const rails = new THREE.Mesh(mergeGeometries(railParts), new THREE.MeshStandardMaterial({ color: 0x444448, metalness: .65, roughness: .47 }));
    rails.userData.noCollide = true;
    group.add(rails);
    railParts.forEach((geo) => geo.dispose());
  }

  if (room === 'stadium' && mode === 'general') {
    for (const x of [-24, 24]) {
      add('bridge-frame', x, 0, 48, 0, V3(2.65, 2.45 / 2.1425, 4 / 2.60));
      for (const side of [-1, 1]) boxCollision(x + side * 3.02, 2.91, 48, .07, .9, 3.8);
    }
  }

  add('foh', eye.x, 0, eye.z);
  contact(eye.x, 0, eye.z, 8.15, 6.3);
  // Match the authored FOH's two decks, side landings and individual treads.
  const lower = .81, upper = 3.14;
  const fohFloor = (x, top, z, w, d) => boxCollision(eye.x + x, top - .07, eye.z + z, w, .14, d);
  fohFloor(0, lower, 0, 7, 5);
  fohFloor(0, upper, 1.635, 4.38, 1.93);
  fohFloor(3.3085, upper, 1.979, 2.377, 1.15);
  fohFloor(3.962, lower, -2.061, 1.11, .82);
  for (let i = 0; i < 4; i++) fohFloor(0, lower * (i + 1) / 4, 3.52 - (i + .5) * .269, 1.33, .269);
  for (let i = 0; i < 12; i++) {
    fohFloor(3.962, lower + (upper - lower) * (i + 1) / 12, 1.419 - (11.5 - i) * .261, .977, .261);
  }
  for (const x of [-1.34, 1.25]) {
    contact(eye.x + x, lower, eye.z - .57, 2.48, 1.14);
    contact(eye.x + x, lower, eye.z + .85, 1.0, .94);
  }
  for (const x of [-1.058, 1.046]) contact(eye.x + x, upper, eye.z + 1.64, 1.37, 1.6);
  for (const { code, p, aim } of data.cameras) {
    const yaw = heading([aim[0] - p[0], aim[1] - p[1]]);
    add('camera', p[0], 0, p[1], yaw);
    const label = cameraLabel(code);
    label.position.copy(V3(0, 1.63, .514).applyAxisAngle(Y, yaw)).add(point(p));
    label.rotation.y = yaw;
    label.name = 'CAM ' + code;
    label.userData.noCollide = true;
    group.add(label);
    boxCollision(p[0], .81, p[1], .86, 1.62, .86, yaw);
    contact(p[0], 0, p[1], 1.52, 1.48, yaw);
    reservePad(p[0], p[1], 1.23);
  }
  const { p: [jx, jz], tip, pocket, aim } = data.jib;
  const length = Math.hypot(tip[0] - jx, tip[1] - jz);
  const jibYaw = Math.atan2(jz - tip[1], tip[0] - jx);
  add('jib', jx, 0, jz, jibYaw, V3(length / 4.6, 1, 1));
  add('jib-head', tip[0], 2.713, tip[1], heading([aim[0] - tip[0], aim[1] - tip[1]]));
  boxCollision(jx, .71, jz, .97, 1.42, .97, jibYaw);
  contact(jx, 0, jz, 1.75, 1.55, jibYaw);
  reservePad(jx, jz, 1.11);
  floorExclusions.push((x, z) => contains(pocket, x, z));

  const barrierWidth = 1.12;
  for (const points of data.fences) {
    // Fold tiny polyline jogs into the neighbouring bay; a 10 cm detour
    // cannot take its own panel and has no well-defined crowd-facing side.
    const path = points.filter(([x, z], i) => !i || i === points.length - 1 ||
      Math.hypot(x - points[i - 1][0], z - points[i - 1][1]) > .2);
    for (let j = 1; j < path.length; j++) {
      const [ax, az] = path[j - 1], [bx, bz] = path[j];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < .05) continue;
      let yaw = Math.atan2(-dz, dx);
      // The barrier kick plate faces the crowd. Its stabilising foot is on the pit side.
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const nx = -dz / len, nz = dx / len;
      const deckDistance = (x, z) => Math.min(...plan.decks.flatMap(({ ring }) => ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const ux = b[0] - a[0], uz = b[1] - a[1];
        const t = clamp(((x - a[0]) * ux + (z - a[1]) * uz) / (ux ** 2 + uz ** 2 || 1));
        return (x - a[0] - t * ux) ** 2 + (z - a[1] - t * uz) ** 2;
      })));
      if (deckDistance(mx + nx, mz + nz) < deckDistance(mx - nx, mz - nz)) yaw += Math.PI;
      const n = Math.max(1, Math.round(len / barrierWidth));
      for (let i = 0; i < n; i++) {
        const u = (i + .5) / n;
        add('barrier', ax + dx * u, 0, az + dz * u, yaw, V3(len / (n * barrierWidth), 1, 1));
      }
      contact(mx - Math.sin(yaw) * .18, 0, mz - Math.cos(yaw) * .18, len + .06, .83, yaw);
      boxCollision(mx, .56, mz, len, 1.12, .095, yaw);
      const rot = Math.cos(yaw), sin = Math.sin(yaw);
      floorExclusions.push((x, z) =>
        Math.abs((x - mx) * rot - (z - mz) * sin) <= len / 2 + .2 &&
        Math.abs((x - mx) * sin + (z - mz) * rot + .19) <= .72);
    }
  }

  let caseCount = 0;
  function prop({ kind, p: [x, z], facing, model, size, stack }, y, ground) {
    let yaw = heading(facing);
    let scale;
    // Facing describes the performer. The keyboard's keybed and pedal point
    // toward the player, as does the end of the wireless microphone.
    if (kind === 'keyboard') yaw += Math.PI;
    if (kind === 'mic') {
      yaw += Math.PI - Math.atan2(MIC_AXIS.x, MIC_AXIS.z);
      scale = V3(1, MIC_HEIGHT / MIC_GRILLE.y, 1);
      const singer = MIC_GRILLE.clone().addScaledVector(MIC_AXIS, .24).applyAxisAngle(Y, yaw);
      add('mark', x + singer.x, y + .004, z + singer.z, heading(facing));
    }
    if (kind === 'flight-case') {
      scale = FLIGHT_CASE_SIZES[caseCount % FLIGHT_CASE_SIZES.length];
      yaw += [0, Math.PI / 2, Math.PI][caseCount++ % 3];
    }
    if (kind === 'cable-guard') {
      const nearJib = Math.hypot(x - jx, z - jz) < 3.5;
      yaw = nearJib ? jibYaw : Math.PI / 2;
      const modules = nearJib ? 2 : 3;
      for (let i = 0; i < modules; i++) {
        const offset = (i - (modules - 1) / 2) * .66;
        add('cable-guard', x + Math.cos(yaw) * offset, y, z - Math.sin(yaw) * offset, yaw, V3(.74, 1, 1));
      }
      contact(x, y, z, modules * .66 + .1, .70, yaw);
      reserve(x, z, nearJib ? .83 : .43, nearJib ? .83 : 1.1);
      return;
    }
    if (kind === 'fender' || kind === 'vox') {
      const amp = models.get(kind);
      const tiers = stack ?? (model === 'combo-with-extension' ? 2 : 1);
      contact(x, y, z, amp.size.x + .24, amp.size.z + .22, yaw);
      const name = kind + '-extension';
      const ext = models.get(name);
      const rise = kind === 'fender' ? .47 : .5;
      for (let i = 1; i < tiers; i++) {
        add(name, x, y, z, yaw, V3(1.025, rise / ext.bounds.max.y, 1.05));
        y += rise;
      }
    }
    if (CONTACT_PROPS.has(kind)) {
      const bounds = models.get(kind).size;
      contact(x, y, z, bounds.x * (scale?.x ?? 1) + .15, bounds.z * (scale?.z ?? 1) + .15, yaw);
    }
    add(kind, x, y, z, yaw, scale);
    if (kind === 'prompter') add('prompter-display', x, y, z, yaw, undefined, display);
    if (kind === 'touring-rack' && !ground) {
      add('signal-coil', x + Math.cos(yaw) * .58, y + .002, z - Math.sin(yaw) * .58, yaw);
    }
    if (ground) {
      const [w, d] = size || [1.25, .8];
      reserve(x, z, w * .5 + .29, d * .5 + .29);
    }
  }
  for (const item of data.stage) prop(item, stageHeight(plan.decks, ...item.p), false);
  for (const item of data.floor) prop(item, 0, true);
  // The open service cover is tucked next to the lower FOH rack.
  add('cable-guard-service', eye.x - 2.98, .816, eye.z + .48, Math.PI / 2, V3(.63, 1, .74));
  // The band has short spare signal looms next to its amp stacks. Vocal mic
  // stands remain the wireless assets, independent from the deck cabling.
  for (const { kind, p: [x, z], facing } of data.stage) {
    if (!['fender', 'vox', 'keyboard'].includes(kind)) continue;
    const yaw = heading(facing);
    const dx = Math.cos(yaw), dz = -Math.sin(yaw);
    const side = x < 0 ? 1 : -1;
    add('signal-coil', x + dx * side * .74, stageHeight(plan.decks, x, z) + .004, z + dz * side * .74, yaw);
  }

  for (const [x, y, z, fx, fz, count] of data.subs) {
    const model = models.get('ground-sub');
    const yaw = heading([fx, fz]);
    const scale = V3(1.274 / model.size.x, .54 / model.size.y, 1 / model.size.z);
    for (let i = 0; i < count; i++) add('ground-sub', x, y + .55 * i - model.bounds.min.y * scale.y, z, yaw, scale);
    contact(x, y, z, 1.52, 1.24, yaw);
    reserve(x, z, .85, .8);
    boxCollision(x, y + count * .55 / 2, z, 1.27, count * .55, 1, yaw);
  }
  for (const [x, y, z, fx, fz, w] of data.fills) {
    add('front-fill', x, y - .16, z, heading([fx, fz]), V3(w / models.get('front-fill').size.x, 1, 1));
  }
  for (const { kind, p: [x, y, z], facing, ground } of data.lights) {
    if (kind !== 'footlight') {
      if (ground) reserve(x, z, 1.03, .7);
      contact(x, y, z, kind === 'blinder4' ? 1.8 : .76, .72, heading(facing));
      continue;
    }
    const yaw = heading(facing);
    // The trim is flush with the deck. The inset emitters use their original
    // optics above the deck's depth surface, inside a shallow dark housing.
    const trim = V3(1, .24, 1);
    add('footlight', x, y - .053, z, yaw, trim);
    add('footlight-lens', x, y - .052, z, yaw, trim, amber);
  }
  const envelope = new THREE.Color();
  let footLevel = 0;
  return {
    data,
    group,
    blocksFloor: (x, z) => floorExclusions.some((test) => test(x, z)),
    drape(x, y, z, yaw, width, height, matte) {
      const model = models.get('masking');
      const material = matte
        ? (matteDrape ??= std({ color: 0x030303, roughness: 1, side: THREE.DoubleSide }))
        : (drapeMaterial ??= velvet(0x020202, 'maskvel', {
          sheenColor: new THREE.Color(0x060606), sheenRoughness: .6, side: THREE.DoubleSide,
        }));
      add('masking', x, y, z, yaw, V3(width / model.size.x, height / model.size.y, .72), material);
      boxCollision(x, y + height / 2, z, width, height, .06, yaw);
    },
    mountFlash(kind, _unit, matrix) {
      const name = kind === 'blinder' ? 'blinder8' : kind;
      const height = name === 'blinder8' ? .486 : name === 'strobe' ? .244 : .60;
      batch.add(name, matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, -height, 0)));
    },
    hang({ x, y, z, boxes, width = 1.3, yaw = 0, splay = .035, depth = .7, height = .38 }, key) {
      const model = models.get(key);
      const scale = V3(width / model.size.x, height * .985 / model.size.y, depth / model.size.z);
      const raw = (boxes - 1) * splay + splay * .22 * (boxes - 1) * (boxes - 2) / 2;
      const cap = Math.min(1, .85 / Math.max(raw, .001));
      const holder = placement(x, y, z, yaw);
      let down = 0, angle = 0, back = 0;
      for (let i = 0; i < boxes; i++) {
        cabinetRot.setFromAxisAngle(X, angle);
        const offset = V3(0, -height - model.bounds.min.y * scale.y).applyQuaternion(cabinetRot);
        const local = new THREE.Matrix4().compose(offset.add(V3(0, down, back)), cabinetRot, scale);
        batch.add(key, new THREE.Matrix4().multiplyMatrices(holder, local));
        down -= Math.cos(angle) * height;
        back -= Math.sin(angle) * height;
        angle += (splay + i * splay * .22) * cap;
      }
      add(key + '-bar', x, y + .013, z, yaw, V3(scale.x, 1, scale.z));
    },
    delay({ x, z, h, yaw, roof }) {
      if (roof) {
        for (const dx of [-2.8, 2.8]) for (const dz of [-2.8, 2.8]) {
          const p = V3(dx, h + .42, dz).applyAxisAngle(Y, yaw);
          add('delay-roof', x + p.x, p.y, z + p.z, yaw, V3(1.5, .8, 2.7));
        }
      }
      const p = V3(-1.02, .3, -.34).applyAxisAngle(Y, yaw);
      add('delay-patch', x + p.x, p.y, z + p.z, yaw);
      const cover = V3(-1.28, .304, .24).applyAxisAngle(Y, yaw);
      add('cable-guard', x + cover.x, cover.y, z + cover.z, yaw + Math.PI / 2);
    },
    setArt(map) {
      if (display.map?.source === map?.source) return;
      if (Boolean(display.map) !== Boolean(map)) display.needsUpdate = true;
      display.map?.dispose();
      display.map = map?.clone() ?? null;
      if (display.map) {
        display.map.flipY = false;
        display.map.needsUpdate = true;
      }
      display.color.setHex(map ? 0xffffff : 0);
    },
    runFootlights(f, part) {
      const level = part === 'break' || part === 'interlude' ? .46
        : part === 'intro' || part === 'outro' ? .27
          : part === 'chorus' ? .36 + .29 * f.kick : .12 + .16 * f.energy;
      footLevel = THREE.MathUtils.lerp(footLevel, level * (1 - f.house), clamp(f.dt * 5));
      amber.color.copy(ringTint(envelope, f.pal.b)).lerp(warm, .48).multiplyScalar(.025 + 3.2 * footLevel);
    },
    finish() {
      batch.flush();
      mountContactShadows(group, contactShadows);
      if (!collision.length) return;
      const shell = new THREE.Mesh(mergeGeometries(collision), collisionMaterial);
      shell.name = 'Equipment collision';
      shell.visible = false;
      group.add(shell);
      collision.forEach((geo) => geo.dispose());
    },
  };
}

export function floorLighting(equipment, rig, center, reach) {
  const { data, group } = equipment;
  const rows = new Map();
  const flash = [];
  const warmWash = new THREE.Color(0xffd3a7);
  const target = V3(), direction = V3();
  for (const { kind, p, aim, facing } of data.lights) {
    if (kind === 'footlight') continue;
    if (kind === 'blinder4') {
      flash.push({ pos: new THREE.Vector3(...p).add(V3(0, .60)), dir: point(facing, .10) });
      continue;
    }
    const pos = new THREE.Vector3(...p), focus = new THREE.Vector3(...aim);
    const dir = focus.clone().sub(pos).normalize();
    const fx = rig.add({
      pos, dir, kind, hang: 'up', intensity: 0,
      length: reach * (kind === 'beam' ? .65 : .28),
      localBeam: kind !== 'beam',
      beamGain: kind === 'beam' ? .42 : kind === 'spot' ? .26 : .11,
      flareGain: .16, scale: 1,
    });
    const isTip = Math.hypot(pos.x - center.x, pos.z - center.z) > 21;
    const key = kind + (isTip ? '-tip' : '-main');
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ fx, dir, tip: isTip });
  }
  const floorBlinders = flash.length ? flashUnits(rig, group, flash, {
    kind: 'blinder4',
    mountBody: equipment.mountFlash,
  }) : null;
  let groupIndex = 0;
  for (const row of rows.values()) {
    row.forEach((it, i) => Object.assign(it, { i, n: row.length, group: groupIndex }));
    groupIndex++;
  }
  return (f, part) => {
    const quiet = part === 'break' || part === 'interlude';
    const chorus = part === 'chorus' || part === 'dance' || part === 'post';
    const intro = part === 'intro';
    const afterDark = (f.secBar ?? f.bar) % 4;
    for (const row of rows.values()) {
      runShow(rig, row, f, { up: true, strobe: false, stage: center, house: center });
      for (const { fx, dir, tip, i } of row) {
        const soft = fx.kind === 'wash' || fx.kind === 'par';
        if (chorus) {
          target.copy(center).y = center.y + 16 + (i % 3) * 2;
          target.x += Math.sin((f.phase ?? f.beat) * Math.PI / 4 + i) * reach * .07;
          direction.copy(target).sub(fx.pos).normalize();
          fx.dir.lerp(direction, soft ? .23 : .53).normalize();
        } else {
          fx.dir.lerp(dir, soft || quiet ? .95 : .66).normalize();
        }
        if (fx.kind === 'par') fx.dir.copy(dir);
        if (soft) fx.color.lerp(warmWash, quiet || intro ? .28 : .1);
        const accent = tip === (afterDark >= 2) ? 1 : .55;
        fx.intensity *= chorus ? .83 : quiet ? (soft ? .53 : .23) : intro ? (soft ? .88 : .47) : accent * (soft ? .9 : .64);
        if (intro && soft) fx.intensity = Math.max(fx.intensity, .075 * (1 - f.house));
      }
    }
    equipment.runFootlights(f, part);
    return floorBlinders ? runBlinders(floorBlinders, f) : 0;
  };
}
