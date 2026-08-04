// frame.js — the bridge between the acoustic room model and the 3D scene.
//
// The venues you look at are the venues you hear. Room dimensions, stage
// position, stage width and the seat you are sitting in all come out of
// `audio/venuerooms.js` — the same file the impulse responses are computed from —
// rather than being drawn by eye. Change a room's dims and both the reverberation
// and the picture move together.
//
// venuerooms.js uses (x across, y from the stage end toward the back, z up) with
// the origin at a room corner. three.js wants Y up, so this recentres X on the
// stage and swaps the other two:
//
//     three.x = room.x - stage.x      three.y = room.z      three.z = room.y
//
// leaving the stage centre line at x = 0, the floor at y = 0 and the audience at
// positive z looking toward -z.

import * as THREE from 'three';
import { VENUE_ROOMS } from '../../audio/venuerooms.js';

// How far the seat is lifted off the flat floor by the thing it actually sits
// on. FOH is a riser, not a spot on the ground; a stalls seat is on a rake. The
// model's listener height is the ear height ABOVE that surface, so this is added
// rather than replacing it — the listening distance the engine uses is unchanged.
const RISER = {
  club: 0,
  theater: 0,       // the rake supplies it — see the stalls block in theater.js
  concerthall: 0,   // ditto, the terrace
  arena: 0.9,
  dome: 1.0,
  stadium: 1.2,
};

export function frame(id) {
  const r = VENUE_ROOMS[id];
  const [width, depth, height] = r.dims;
  const [sx, sy, sz] = r.stage.center;
  const [lx, ly, lz] = r.listener;
  return {
    id,
    width, depth, height,
    xMin: -sx,
    xMax: width - sx,
    // where the sound comes from: the PA hang / stage source the engine uses
    source: { x: 0, y: sz, z: sy, halfWidth: r.stage.halfWidth },
    // the seat, in three.js space. `y` still needs whatever the seat stands on.
    seat: new THREE.Vector3(lx - sx, lz + RISER[id], ly),
    // Where the camera goes. Same row, same height — but on the stage centre
    // line rather than at the seat's exact x.
    //
    // The room model puts the listener two or three metres off centre on
    // purpose: dead centre gets its side reflections as a symmetric pair, which
    // narrows the image, so the seat critics travel for is never quite on the
    // axis. That is worth a couple of metres in the acoustics and it costs
    // nothing there. It costs a lot in the picture: from 5 m back in a club it
    // is a 9° yaw, which turns a front-of-house view into an oblique one and
    // slides the album art off to one side of the frame.
    //
    // So the camera gives up the x and keeps the two things that actually set
    // the perspective — how far back the seat is and how high it sits. The
    // engine still listens from the offset seat; nothing about the sound moves.
    eye: new THREE.Vector3(0, lz + RISER[id], ly),
    riser: RISER[id],
    distance: Math.hypot(sx - lx, sy - ly, sz - lz),
  };
}
