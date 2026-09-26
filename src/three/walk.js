// ─────────────────────────────────────────────────────────────────────────────
// walking: W A S D across the room at eye height with the feet on whatever is
// underfoot — the floor, a rake, the treads of a stand, the stage steps — and
// the walls in the way. Drag to look: all the way round, and up or down as far
// as straight up and straight down.
//
// The ground and the walls are found by casting rays into one merged copy of
// the venue's solid geometry, indexed with a BVH so each cast costs microseconds
// rather than a walk over every triangle. The index is built the first time
// the listener moves, not when the room is built: most visits never leave the
// seat and should not pay for it.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, V3, clamp } from './core.js';

export const WALK = {
  eye: 1.6,        // standing eye height above the floor
  step: 0.85,      // a step: a stand's row, a stair, a kerb
  drop: 1.5,       // the most that is stepped down: a stage's front edge, a
                   // balcony's or the pit's is a place to stop, not to fall from
  climb: 1.5,      // the most that is climbed onto, and only onto something
                   // broad — a stand's front row, a terrace, a low deck; an
                   // amp or a drum of the same height is walked round
  radius: 0.3,     // how close to a wall the eye may come
  speed: 3.2,      // m/s walking; Shift runs
  run: 3,
  gravity: 18,
  lookRate: 0.0042, // radians per pixel of drag at a 60° field of view
};

// One merged, world-space, position-only copy of everything solid in `root`.
// Left out: instanced crowds and seats, point fields, anything drawn additively
// or see-through, and meshes marked `userData.noCollide`.
export function collisionGeometry(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noCollide) return;
    const g = o.geometry;
    if (!g || g.isInstancedBufferGeometry || !g.attributes.position) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    if (list.every((m) => !m || m.blending === THREE.AdditiveBlending || (m.transparent && m.opacity < 0.5) || m.visible === false)) return;
    const c = new THREE.BufferGeometry();
    c.setAttribute('position', g.attributes.position.clone());
    if (g.index) c.setIndex(g.index.clone());
    const flat = c.index ? c.toNonIndexed() : c;
    flat.applyMatrix4(o.matrixWorld);
    parts.push(flat);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

export class Walker {
  constructor(canvas, { keys = true } = {}) {
    this.canvas = canvas;
    this.feet = V3();
    this.eyeH = WALK.eye;       // current eye height: seated at the start, standing once walking
    this.yaw = 0; this.pitch = 0;
    this.vy = 0;
    this.held = new Set();
    this.bvh = null; this.geo = null; this.root = null;
    this.grounded = false;
    this.home = null;
    this.ray = new THREE.Ray();
    this.drag = null;
    this.onLook = null;
    const down = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) { this.held.add(k); e.preventDefault?.(); }
      if (e.key === 'Shift') this.held.add('shift');
    };
    const up = (e) => { this.held.delete(e.key.toLowerCase()); if (e.key === 'Shift') this.held.delete('shift'); };
    const blur = () => this.held.clear();
    const pdown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const pmove = (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.look(dx, dy);
    };
    const pup = (e) => { if (this.drag && this.drag.id === e.pointerId) this.drag = null; };
    const dbl = () => this.reset();
    this.listeners = [
      [canvas, 'pointerdown', pdown], [canvas, 'pointermove', pmove], [canvas, 'pointerup', pup],
      [canvas, 'pointercancel', pup], [canvas, 'dblclick', dbl],
    ];
    if (keys) this.listeners.push([window, 'keydown', down], [window, 'keyup', up], [window, 'blur', blur]);
    for (const [t, ev, fn] of this.listeners) t.addEventListener(ev, fn);
    canvas.style.touchAction = 'none';
  }

  // drag in pixels → yaw without limit, pitch up to straight up and down
  look(dx, dy, fov = 60) {
    const k = WALK.lookRate * (fov / 60);
    this.yaw += dx * k;
    this.pitch = clamp(this.pitch - dy * k, -89 * DEG, 89 * DEG);
  }

  // a new room: stand at its seat, facing its stage
  setVenue(root, eye, target) {
    this.root = root;
    this.geo?.dispose(); this.geo = null; this.bvh = null;
    this.home = { eye: eye.clone(), target: target.clone() };
    this.reset();
  }

  reset() {
    if (!this.home) return;
    const { eye, target } = this.home;
    const d = target.clone().sub(eye).normalize();
    this.yaw = Math.atan2(d.x, -d.z);
    this.pitch = Math.asin(clamp(d.y, -1, 1));
    this.feet.set(eye.x, eye.y - WALK.eye, eye.z);
    this.gy = this.feet.y;
    this.eyeH = WALK.eye;
    this.seated = eye.y;        // the seat's own eye, kept until the first step
    this.grounded = false;
    this.vy = 0;
  }

  get moving() { return this.held.has('w') || this.held.has('a') || this.held.has('s') || this.held.has('d'); }

  ensureIndex() {
    if (this.bvh || !this.root) return;
    this.geo = collisionGeometry(this.root);
    if (this.geo) this.bvh = new MeshBVH(this.geo, { maxLeafTris: 8 });
  }

  // first surface below (x, top, z), or null
  ground(x, z, top) {
    this.ray.origin.set(x, top, z);
    this.ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, 400);
    return hit ? hit.point.y : null;
  }

  // Can the listener stand a (dx, dz) step away? Not over nothing (under a
  // floor, out past the building), not up a tall thing unless it is broad
  // enough to stand on, and not anywhere without headroom.
  canStand(dx, dz) {
    if (!dx && !dz) return true;
    const x = this.feet.x + dx, z = this.feet.z + dz;
    const g = this.ground(x, z, this.gy + WALK.climb);
    if (g === null || g < this.gy - WALK.drop) return false;
    const rise = g - this.gy;
    if (rise > WALK.step) {
      // broad enough? Most of a ring just inside the edge has to be at that
      // height or above: true of a stand's front row or a deck from any angle,
      // not of an amp or a drum
      const l = Math.hypot(dx, dz), cx = x + dx / l * 0.3, cz = z + dz / l * 0.3;
      let on = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const h = this.ground(cx + Math.cos(a) * 0.6, cz + Math.sin(a) * 0.6, g + 0.5);
        if (h !== null && h >= g - 0.15) on++;
      }
      if (on < 5) return false;
    }
    if (rise > 0.02) {
      this.ray.origin.set(x, g + 0.05, z);
      this.ray.direction.set(0, 1, 0);
      if (this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, WALK.eye + 0.1)) return false;
    }
    return true;
  }

  // the part of `move` that does not run into a wall, sliding along it
  slide(move) {
    const len = Math.hypot(move.x, move.z);
    if (len < 1e-6) return move;
    for (let pass = 0; pass < 2; pass++) {
      const l = Math.hypot(move.x, move.z);
      if (l < 1e-6) return move;
      this.ray.direction.set(move.x / l, 0, move.z / l);
      let hit = null;
      for (const h of [WALK.climb + 0.05, Math.max(WALK.climb + 0.2, this.eyeH)]) {
        this.ray.origin.set(this.feet.x, this.feet.y + h, this.feet.z);
        const r = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, l + WALK.radius);
        if (r && (!hit || r.distance < hit.distance)) hit = r;
      }
      if (!hit) return move;
      const n = hit.face.normal.clone();
      n.y = 0;
      if (n.lengthSq() < 1e-6) return move.set(0, 0, 0);
      n.normalize();
      if (n.x * move.x + n.z * move.z > 0) n.negate();
      // go no nearer the wall than the radius; what runs along it is kept
      const into = -(n.x * move.x + n.z * move.z);
      if (into <= 0) return move;
      const allowed = Math.max(0, hit.distance - WALK.radius) * (into / l);
      move.addScaledVector(n, into - Math.min(into, allowed));
    }
    return move;
  }

  update(dt, camera) {
    dt = Math.min(dt, 0.1);
    if (this.moving) {
      this.ensureIndex();
      const f = (this.held.has('w') ? 1 : 0) - (this.held.has('s') ? 1 : 0);
      const r = (this.held.has('d') ? 1 : 0) - (this.held.has('a') ? 1 : 0);
      const sp = WALK.speed * (this.held.has('shift') ? WALK.run : 1) * dt;
      const move = V3(Math.sin(this.yaw) * f + Math.cos(this.yaw) * r, 0, -Math.cos(this.yaw) * f + Math.sin(this.yaw) * r);
      if (move.lengthSq() > 0) move.normalize().multiplyScalar(sp);
      if (this.bvh) {
        if (!this.grounded) {
          const g = this.ground(this.feet.x, this.feet.z, this.seated + 0.2);
          if (g !== null) { this.eyeH = this.seated - g; this.feet.y = g; }
          this.gy = this.feet.y;
          this.grounded = true;
        }
        this.slide(move);
        // take the move if it can be stood at; failing that, whichever half of
        // it can, so a walk along a ledge or a wall keeps going
        if (!this.canStand(move.x, move.z)) {
          if (this.canStand(move.x, 0)) move.z = 0;
          else if (this.canStand(0, move.z)) move.x = 0;
          else move.set(0, 0, 0);
        }
      }
      this.feet.x += move.x; this.feet.z += move.z;
      this.seated = null;
    }
    if (this.bvh && this.grounded) {
      const g = this.ground(this.feet.x, this.feet.z, this.gy + WALK.climb);
      if (g !== null) this.gy = g;
      if (g !== null) {
        if (g >= this.feet.y - 0.02) {
          // up a step: quick, but not a teleport; a tall one takes a moment
          this.feet.y += (g - this.feet.y) * Math.min(1, dt * (g - this.feet.y > 0.5 ? 7 : 16));
          this.vy = 0;
        } else {
          this.vy -= WALK.gravity * dt;
          this.feet.y = Math.max(g, this.feet.y + this.vy * dt);
          if (this.feet.y <= g + 1e-3) this.vy = 0;
        }
      }
      // stand up out of the seat on the first step
      if (this.seated === null) this.eyeH += (WALK.eye - this.eyeH) * Math.min(1, dt * 3);
    }
    if (camera) {
      const y = this.seated != null && !this.grounded ? this.seated : this.feet.y + this.eyeH;
      camera.position.set(this.feet.x, y, this.feet.z);
      camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
    }
  }

  dispose() {
    for (const [t, ev, fn] of this.listeners) t.removeEventListener(ev, fn);
    this.geo?.dispose();
    this.bvh = null; this.geo = null; this.root = null;
  }
}
