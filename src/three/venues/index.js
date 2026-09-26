// index.js — the six 3D venues, keyed by the same ids the audio engine uses.
//
// A builder takes the stage's context — the pipeline, the quality settings, the
// crowd's shared uniforms, and the hooks for screens and rigs — and returns:
//
//   root        the THREE.Group holding the whole venue
//   eye         where the listener starts: the seat the room is heard from
//   camera      { pos, target, fov, near, far }
//   background, fog, hazeDensity, beamGain, bloom, grade
//               how the room looks through the pipeline
//   env         the big emitters, for the reflections' environment map
//   update      (f) → the show: lights, screens and crowd for this frame

import { buildClub } from './club.js';
import { buildTheater } from './theater.js';
import { buildConcertHall } from './concerthall.js';
import { buildArena } from './arena.js';
import { buildDome } from './dome.js';
import { buildStadium } from './stadium.js';

export const VENUE_BUILDERS = {
  club: buildClub,
  theater: buildTheater,
  concerthall: buildConcertHall,
  arena: buildArena,
  dome: buildDome,
  stadium: buildStadium,
};

export const buildVenue = (id, ctx) => (VENUE_BUILDERS[id] || buildClub)(ctx);
