// roomacoustics.js — physical room model. Pure math, no Web Audio, so it can be
// unit-tested in Node (see scripts/verify-acoustics.mjs).
//
// Two things live here:
//
//   1. ABSORPTION → RT60 PER OCTAVE BAND (Sabine, with the air term).
//      Instead of hand-writing "rt60: 2.0" per venue and hand-dialing an lfDamp
//      knob, we describe the venue's SURFACES and let the reverberation times
//      fall out. This is what makes the "bass ratio" (RT60@125Hz ÷ RT60@mid)
//      come out RIGHT for each venue type instead of being guessed:
//        · a great concert hall lands at 1.15–1.25 — the low end rings LONGER
//          than the mids, and that is precisely what makes it sound warm and
//          "great". The audience is the dominant absorber and absorbs far less
//          at 125 Hz than at 1 kHz, so the ratio exceeds 1 on its own.
//        · a wood-lined jazz club lands BELOW 1 — panel absorbers eat the low
//          end, which is why small clubs sound tight rather than warm-boomy.
//      Nothing enforces that by hand; it is a consequence of the α tables.
//
//   2. IMAGE-SOURCE EARLY REFLECTIONS (Allen–Berkley) for a shoebox room.
//      Each reflection gets a physically consistent delay, 1/r level, per-band
//      absorption from the surfaces it bounced off, and — critically — a real
//      ARRIVAL DIRECTION. The direction is what lets impulse.js render the early
//      field with correct interaural time/level differences, which is the cue
//      the ear reads as spaciousness. Random taps cannot do that.

export const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];
export const SPEED_OF_SOUND = 343; // m/s at 20 °C

// Air absorption exponent m (nepers/m... used as the classic 4mV term), for
// 20 °C / 50 % RH, interpolated from ISO 9613-1. Only matters in the big rooms,
// where it is the reason a stadium's top end dies long before its mids do.
export const AIR_M = [0.0001, 0.0003, 0.0006, 0.0011, 0.0026, 0.0072, 0.0230];

// Sabine absorption coefficients α per octave band (125 … 8k).
//
// `audience` is the single most important row: in every real venue the people
// are most of the absorption, and they absorb roughly half as much at 125 Hz as
// at 1 kHz. That asymmetry is the physical origin of a good hall's warmth.
export const MATERIALS = {
  // Occupied, upholstered seating — values for well-regarded halls, where seat
  // absorption is deliberately kept low so the room keeps its strength (G).
  audience:      [0.35, 0.55, 0.72, 0.75, 0.80, 0.78, 0.80],
  // Thick plaster on masonry, as in a 19th-century shoebox. Low mid/HF
  // absorption; the raised 125 Hz figure is panel flex of the wall structure.
  hallMasonry:   [0.15, 0.10, 0.04, 0.04, 0.05, 0.06, 0.06],
  // Wood paneling / diffusers over an air gap: a classic panel absorber, so it
  // eats LOW frequencies hardest. This is why a club is tight, not boomy.
  clubWood:      [0.28, 0.22, 0.15, 0.09, 0.09, 0.10, 0.10],
  // An idealised arena bowl: deep porous absorption on the deck with a membrane
  // backing, plus banners. Absorption FALLING with frequency is what deep
  // absorbers do, and the low-frequency end is the expensive part that real
  // arenas skimp on — thin treatment eats mids and lets the low end ring, which
  // is why most arenas boom. This one does not skimp; without it the crowd's own
  // absorption, which is weak at 125 Hz, pushes the bass ratio past 1.3.
  arenaTreated:  [0.60, 0.50, 0.38, 0.38, 0.40, 0.40, 0.38],
  // A dome roof with the deployed absorption an idealised one would carry. A
  // bare membrane is nearly transparent at LF, which is exactly why real domes
  // boom; treating it is the difference between 7 s and 4 s of reverberation.
  domeMembrane:  [0.55, 0.68, 0.75, 0.76, 0.74, 0.70, 0.66],
  // Bare concrete — reflective everywhere.
  concrete:      [0.02, 0.02, 0.03, 0.03, 0.04, 0.05, 0.05],
  // The open sky. Everything that leaves never comes back, so α = 1. Giving the
  // stadium this as its "ceiling" is the whole reason it sounds thin and dry
  // compared with the dome — we do not have to fake that with a density knob.
  openSky:       [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  // Grass / pitch surface.
  turf:          [0.25, 0.30, 0.40, 0.50, 0.55, 0.60, 0.60],
};

// Scattering coefficient s per surface: the share of NON-absorbed energy that
// leaves in some direction other than the specular one.
//
// This matters more than it sounds. Without it, the image-source model produces
// a mirror-bright specular reflection off the audience plane arriving under a
// millisecond after the direct sound — which would comb-filter the whole mix.
// Real audience seating is the most irregular surface in any venue (heads,
// shoulders, seat backs, a rake) and scatters most of what it does not absorb,
// so that reflection is diffuse, not specular. The scattered energy is not
// lost: it is already counted in the Sabine reverberation time, and therefore
// shows up in the late tail where it belongs.
export const SCATTERING = {
  audience: 0.80,       // the most irregular surface in the building
  clubWood: 0.60,       // the club's diffusers exist precisely to do this
  hallMasonry: 0.40,    // coffers, niches, ornament
  arenaTreated: 0.50,
  domeMembrane: 0.20,   // smooth fabric
  concrete: 0.15,
  turf: 0.50,
  openSky: 0.0,         // nothing comes back anyway
};

// Reverberation time per octave band, Sabine with the air-absorption term:
//   RT60 = 0.161·V / (Σ Sα + 4mV)
// `surfaces` is [{ area, material }]; material is a key of MATERIALS or a raw
// 7-element α array.
export function reverbTimes({ volume, surfaces }) {
  return BANDS.map((_, b) => {
    let absorption = 0;
    for (const s of surfaces) {
      const alpha = Array.isArray(s.material) ? s.material : MATERIALS[s.material];
      if (!alpha) throw new Error(`unknown material: ${s.material}`);
      absorption += s.area * alpha[b];
    }
    absorption += 4 * AIR_M[b] * volume;
    return absorption > 0 ? (0.161 * volume) / absorption : 0;
  });
}

// Mid-band RT60 (the number a venue is normally quoted by) = mean of 500/1k.
export const midRT = (rts) => (rts[2] + rts[3]) / 2;
// Bass ratio: how much longer the low end rings than the mids. > 1 = warm.
export const bassRatio = (rts) => (rts[0] + rts[1]) / (rts[2] + rts[3]);

// Total surface area and volume of a shoebox, as a convenience for venue defs.
export function shoebox(w, l, h) {
  return {
    volume: w * l * h,
    dims: [w, l, h],
    area: { floor: w * l, ceiling: w * l, sideWalls: 2 * l * h, endWalls: 2 * w * h },
  };
}

// ── Image-source early reflections ──────────────────────────────────────────
//
// Allen–Berkley image method for a shoebox. Returns one entry per reflection,
// ordered by arrival time, EXCLUDING the direct sound (which the engine's dry
// path carries) — but normalised so that gains are relative to the direct
// sound's own 1/r level. So a reflection with gain 0.5 really is 6 dB below the
// direct sound as heard at that seat, which is what makes the direct-to-early
// balance (and hence C80) come out physically instead of being dialed in.
//
//   room     { dims:[w,l,h], surfaces:{ x0,x1,y0,y1,z0,z1 } }  material keys
//   source   [x,y,z]   listener [x,y,z]   (metres, origin at a room corner)
//   maxOrder total wall bounces to enumerate
//   maxTime  drop reflections arriving later than this (the late tail takes over)
//
// Each entry: { time, gain (broadband, ≈ mid-band), band[] (per-octave gain),
//               azimuth (rad, 0 = ahead, +right), elevation (rad) }
export function imageSources({ room, source, listener, maxOrder = 3, maxTime = 0.12 }) {
  const [W, L, H] = room.dims;
  const s = room.surfaces;
  // Absorption per wall, and how rough each wall is. The specular coefficient is
  // finished per reflection below, because it depends on the angle the ray meets
  // the wall at.
  const alphaOf = {};
  const scatOf = {};
  for (const key of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1']) {
    const name = s[key];
    const alpha = Array.isArray(name) ? name : MATERIALS[name];
    if (!alpha) throw new Error(`unknown material for wall ${key}: ${name}`);
    alphaOf[key] = alpha;
    scatOf[key] = Array.isArray(name) ? 0 : (SCATTERING[name] ?? 0);
  }

  // A surface scatters far more at grazing incidence than head-on: the rougher
  // it looks along the ray, the less of a mirror it is. This matters enormously
  // in the big rooms, where the path to the mix position skims the crowd for
  // fifty metres at barely ten degrees. Treated as a mirror, that bounce comes
  // back only 5 dB down and swamps the room's entire reverberant budget — which
  // is exactly what it did here before this term existed, leaving the stadium
  // with no audible reverberation at all.
  //
  // In a rectangular room a specular reflection preserves its angle with each
  // axis, so one angle per axis covers every bounce order.
  const grazingScatter = (base, sinAngle) => base + (1 - base) * Math.pow(1 - sinAngle, 2);

  const directDist = Math.hypot(
    source[0] - listener[0], source[1] - listener[1], source[2] - listener[2],
  ) || 1e-6;

  // The listener faces the stage, so "ahead" is the horizontal direction from
  // the listener to the real source. Deriving it (rather than fixing it to an
  // axis) means a venue can place its stage anywhere without the azimuths — and
  // therefore the whole binaural render — silently ending up rotated.
  const fx0 = source[0] - listener[0], fy0 = source[1] - listener[1];
  const fLen = Math.hypot(fx0, fy0) || 1e-6;
  const fx = fx0 / fLen, fy = fy0 / fLen;   // forward
  const rx = fy, ry = -fx;                  // right = forward rotated −90°

  const out = [];
  const N = maxOrder;
  for (let p = 0; p <= 1; p++) {
    for (let q = 0; q <= 1; q++) {
      for (let r = 0; r <= 1; r++) {
        for (let m = -N; m <= N; m++) {
          for (let n = -N; n <= N; n++) {
            for (let o = -N; o <= N; o++) {
              // how many times this image bounced off each of the six walls
              const hx0 = Math.abs(m - p), hx1 = Math.abs(m);
              const hy0 = Math.abs(n - q), hy1 = Math.abs(n);
              const hz0 = Math.abs(o - r), hz1 = Math.abs(o);
              const order = hx0 + hx1 + hy0 + hy1 + hz0 + hz1;
              if (order === 0) continue;      // that's the direct sound
              if (order > N) continue;

              const ix = (1 - 2 * p) * source[0] + 2 * m * W;
              const iy = (1 - 2 * q) * source[1] + 2 * n * L;
              const iz = (1 - 2 * r) * source[2] + 2 * o * H;

              const dx = ix - listener[0], dy = iy - listener[1], dz = iz - listener[2];
              const dist = Math.hypot(dx, dy, dz);
              if (dist < 1e-6) continue;
              const time = (dist - directDist) / SPEED_OF_SOUND; // relative to direct arrival
              if (time < 0 || time > maxTime) continue;

              // Angle this ray makes with each pair of walls (sine of the
              // grazing angle), used to decide how mirror-like each bounce is.
              const sinX = Math.abs(dx) / dist;
              const sinY = Math.abs(dy) / dist;
              const sinZ = Math.abs(dz) / dist;
              const spec = {
                x0: Math.sqrt(Math.max(0, 1 - grazingScatter(scatOf.x0, sinX))),
                x1: Math.sqrt(Math.max(0, 1 - grazingScatter(scatOf.x1, sinX))),
                y0: Math.sqrt(Math.max(0, 1 - grazingScatter(scatOf.y0, sinY))),
                y1: Math.sqrt(Math.max(0, 1 - grazingScatter(scatOf.y1, sinY))),
                z0: Math.sqrt(Math.max(0, 1 - grazingScatter(scatOf.z0, sinZ))),
                z1: Math.sqrt(Math.max(0, 1 - grazingScatter(scatOf.z1, sinZ))),
              };
              const wall = (key, b) => Math.sqrt(Math.max(0, 1 - alphaOf[key][b])) * spec[key];

              // per-band gain: spherical spreading × every wall's β, per bounce
              const spread = directDist / dist;
              const band = BANDS.map((__, b) => (
                spread
                * Math.pow(wall('x0', b), hx0) * Math.pow(wall('x1', b), hx1)
                * Math.pow(wall('y0', b), hy0) * Math.pow(wall('y1', b), hy1)
                * Math.pow(wall('z0', b), hz0) * Math.pow(wall('z1', b), hz1)
              ));
              // broadband gain ≈ the 500 Hz/1 kHz mean, used for level bookkeeping
              const gain = (band[2] + band[3]) / 2;
              if (gain < 1e-4) continue;

              // arrival direction in the LISTENER's frame: 0 = straight ahead
              // (toward the stage), positive = to their right, +elevation = above.
              const ahead = dx * fx + dy * fy;
              const right = dx * rx + dy * ry;
              const azimuth = Math.atan2(right, ahead);
              const elevation = Math.asin(Math.max(-1, Math.min(1, dz / dist)));
              // Bounced off nothing but the floor: still a real arrival, but by
              // convention it is not what the initial time delay gap measures.
              const floorOnly = hz0 === order;
              out.push({ time, gain, band, azimuth, elevation, order, floorOnly });
            }
          }
        }
      }
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

// Initial time delay gap: how long after the direct sound the first reflection
// off a room BOUNDARY arrives. 15–25 ms is the signature of a great seat — long
// enough that the direct sound is heard clean (intimacy, clarity), short enough
// that the room still feels present.
//
// The floor bounce is excluded, as it conventionally is: it arrives within a
// millisecond at any seat, is diffuse rather than specular over an audience,
// and says nothing about the room's size. Reflections more than 20 dB below the
// direct sound are excluded too — they are present but not what the ear is
// timing the room by.
export function itdg(reflections, floor = 0.1) {
  for (const r of reflections) {
    if (r.floorOnly) continue;
    if (r.gain < floor) continue;
    return r.time;
  }
  return 0;
}

// Lateral fraction: the share of early (0–80 ms) energy arriving from the SIDES,
// weighted by cos²(azimuth-from-the-median-plane) the way an LF measurement's
// figure-of-eight microphone does. 0.20–0.25 is the target for a great hall; it
// is the strongest single predictor of apparent source width.
export function lateralFraction(reflections, window = 0.08) {
  let lateral = 0, total = 0;
  for (const r of reflections) {
    if (r.time > window) continue;
    const e = r.gain * r.gain;
    total += e;
    lateral += e * Math.pow(Math.sin(r.azimuth) * Math.cos(r.elevation), 2);
  }
  return total > 0 ? lateral / total : 0;
}

// Mixing time: when discrete reflections give way to a statistically diffuse
// tail. The usual estimate is ≈ √V milliseconds. Past this point there is no
// point tracking individual images — the noise tail model takes over.
export const mixingTime = (volume) => Math.sqrt(volume) / 1000;
