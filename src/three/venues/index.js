// index.js — the six 3D venues, keyed by the same ids the audio engine uses.
//
// A builder takes the scene's shared reactive uniforms and returns everything
// the stage needs to show a room:
//
//   root        the THREE.Group holding the whole venue
//   screen      the surface the album art mounts onto; `Scene` projects its four
//               corners every frame and parks the HTML overlay on the result
//   camera      { position, target, fov } — position comes from the seat in the
//               room model, so where you sit is where you hear from
//   background  clear colour
//   fog         depth grading; in rooms this big it is most of the sense of scale
//   bloom       per-venue bloom, because a club and a stadium do not glow alike
//   update      (t, pulse) → per-frame animation that is not already on the GPU

import buildClub from './club.js';
import buildTheater from './theater.js';
import buildConcertHall from './concerthall.js';
import buildArena from './arena.js';
import buildDome from './dome.js';
import buildStadium from './stadium.js';

export const VENUE_BUILDERS = {
  club: buildClub,
  theater: buildTheater,
  concerthall: buildConcertHall,
  arena: buildArena,
  dome: buildDome,
  stadium: buildStadium,
};

export const buildVenue = (id, u) => (VENUE_BUILDERS[id] || buildClub)(u);
