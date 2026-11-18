// stage-plan.js — where the big rooms' concert stages stand, in plan.
//
// Plain numbers, no three.js: the 3D production (concert-production.js)
// builds its decks, stairs and masts from this, and the seating maps in the
// venue picker draw the same shapes, so the two cannot drift apart.
//
// Coordinates are the app's room metres: x across, z away from the stage end
// (towards FOH); `cz` is the z of the stage's centre (the round stage's
// middle, or the end stage's reference point).

export const CONCERT_LAYOUTS = {
  arena: {
    general: { code: 'AG1', deck: 2.1, runway: 1.45, gap: 3.4, thrustGap: 2.65, front: 23, back: 6, w: 39, rig: 23.5, wallZ: 9.15, wall: [37, 14.7, 4.6], tip: 48, reach: 67 },
    360: { code: 'AR1', deck: 1.55, gap: 3, rig: 24.8, wall: [18, 7.3, 12], reach: 62 },
  },
  dome: {
    // (the walkway across the runway sits 27 m out from the deck's front)
    general: { code: 'DG1', deck: 2.5, runway: 1.65, gap: 4.2, thrustGap: 3, front: 38, back: 16, w: 77, cross: 65, rig: 29.5, wallZ: 19.6, wall: [45, 18.4, 4.9], tip: 92, reach: 112 },
    // (the screens shortened so the masts, 28 m out on the diagonals, stand clear past their ends)
    360: { code: 'DR1', deck: 1.7, gap: 3.65, thrustGap: 3.1, rig: 34.5, wall: [23, 10.5, 17], mast: 28, reach: 120 },
  },
  stadium: {
    general: { code: 'SG2', deck: 2.9, runway: 1.85, gap: 4.7, thrustGap: 3.2, front: 36, back: 12, w: 84, rig: 36, wallZ: 14, wall: [75, 25, 4.9], tip: 86, reach: 150 },
    360: { code: 'SR3', deck: 1.85, gap: 3.9, thrustGap: 3.25, rig: 35.5, wall: [24, 9.6, 20], reach: 156 },
  },
};

// The z of each room's stage centre: the end stage's reference line, the
// round stage's middle (the dome's is the middle of its field, from its data).
export const STAGE_Z = { arena: { general: 15.2, 360: 45 }, dome: { general: 28 }, stadium: { general: 20, 360: 64 } };

export const AXES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
export const DIAGONALS = AXES.map((yaw) => yaw + Math.PI / 4);

// stair geometry (rig.js stageSteps): risers at most 0.2 m, 0.28 m treads
export const STEP_RISE = 0.2, STEP_RUN = 0.28;
const flights = (h, y0 = 0) => Math.max(1, Math.ceil((h - y0) / STEP_RISE - 1e-6));

// a point `dist` out from `c` along `yaw` (0 = +z, positive towards +x), `across` to its side
export const planXZ = (c, yaw, dist, across = 0) =>
  [c[0] + Math.sin(yaw) * dist + Math.cos(yaw) * across, c[1] + Math.cos(yaw) * dist - Math.sin(yaw) * across];
export const planRect = (c, yaw, from, to, half, offset = 0) =>
  [[from, -half], [from, half], [to, half], [to, -half]].map(([d, a]) => planXZ(c, yaw, d, offset + a));

// A flight of steps from y0 up to h whose foot is at (x, z), climbing along
// `dir`; its outline on the floor too, for the seats and the maps.
function flight({ x, z, h, y0 = 0, width, dir }) {
  const n = flights(h, y0), len = n * STEP_RUN;
  const yaw = Math.atan2(dir[0], dir[1]);
  return { x, z, h, y0, width, dir, ring: planRect([x, z], yaw, 0, len, width / 2) };
}

// The plan: { L, round, decks, steps, masts }
//   decks  [{ ring: [[x, z]..], h, base, gap, ramp: [hFrom, hTo] | null }]
//          (a ramp's top rises from hFrom to hTo along +z)
//   steps  [{ x, z, h, y0, width, dir, ring }]
//   masts  [[x, z]] the round stages' ground-supported roof towers
export function stagePlan(id, mode, cz) {
  const L = CONCERT_LAYOUTS[id][mode === '360' ? '360' : 'general'];
  const round = mode === '360';
  const arena = id === 'arena', dome = id === 'dome', stadium = id === 'stadium';
  const c = [0, cz];
  const h = L.deck, rw = L.runway || h;
  const decks = [], steps = [], masts = [];
  const deck = (ring, y, gap, extra = {}) => { decks.push({ ring, h: y, base: 0, gap, ramp: null, ...extra }); };
  const run = (yaw, a, b, half, gap = L.thrustGap || L.gap, across = 0, y = rw) => deck(planRect(c, yaw, a, b, half, across), y, gap);

  if (!round) {
    const { front, back } = L, r = L.w / 2;
    run(0, back - cz, front - cz, r, L.gap, 0, h);
    for (const side of [-1, 1]) steps.push(flight({ x: side * (r - 2.1), z: front + flights(h) * STEP_RUN, h, width: arena ? 1.4 : 2, dir: [0, -1] }));
    if (stadium) {
      // a loop: two straight walkways out from the deck's ends, a half ring
      // round the far end; along each straight a raised span the crowd walks under
      const R = 24, half = 3.3, turn = L.tip - R - half;
      const arc = (rad) => Array.from({ length: 49 }, (_, i) => [rad * Math.cos(i * Math.PI / 48), turn + rad * Math.sin(i * Math.PI / 48)]);
      deck([...arc(R + half), ...arc(R - half).reverse()], rw, L.thrustGap);
      for (const side of [-1, 1]) {
        const span = (a, b) => planRect(c, 0, a - cz, b - cz, half, side * R);
        deck(span(front, 41), rw, L.thrustGap);
        deck(span(41, 46), rw, L.thrustGap, { ramp: [rw, 2.45] });
        deck(span(46, 50), 2.45, L.thrustGap, { base: 2.14 });
        deck(span(50, 55), rw, L.thrustGap, { ramp: [2.45, rw] });
        deck(span(55, turn), rw, L.thrustGap);
        steps.push(flight({ x: side * R, z: front + flights(h, rw) * STEP_RUN, h, y0: rw, width: 3, dir: [0, -1] }));
      }
    } else {
      // a runway out to a walkway across it; the dome's runs on past it to an end stage
      const cross = arena ? L.tip - 5.6 : L.cross, depth = 5.6, wing = arena ? 12.7 : 26;
      run(0, front - cz, cross - cz, arena ? 2.1 : 2.6);
      run(0, cross - cz, cross + depth - cz, wing);
      if (dome) {
        run(0, cross + depth - cz, L.tip - 11 - cz, 2.6);
        run(0, L.tip - 11 - cz, L.tip - cz, 6);
      }
      steps.push(flight({ x: 0, z: front + flights(h, rw) * STEP_RUN, h, y0: rw, width: arena ? 2 : 2.7, dir: [0, -1] }));
    }
  } else if (arena) {
    run(0, -22, 22, 6.15, L.gap, 0, h);
    for (const s of [-1, 1]) steps.push(flight({ x: -2.4, z: cz + s * (22 + flights(h) * STEP_RUN), h, width: 1.4, dir: [0, -s] }));
  } else {
    // an octagonal centre, four runways out of it (the dome's along the
    // field's axes, the stadium's on the diagonals) and stairs down from
    // each runway's end
    const outer = dome ? 15.7 : 15;
    deck(AXES.flatMap((yaw) => [yaw + Math.PI / 8, yaw + Math.PI * 3 / 8]).map((yaw) => planXZ(c, yaw, outer)), h, L.gap);
    const join = outer * Math.cos(Math.PI / 8);
    (dome ? AXES : DIAGONALS).forEach((yaw, i) => {
      const tip = dome ? (i % 2 ? 34 : 40) : 36.8;
      run(yaw, join, tip, dome ? 3.15 : 3.5, L.thrustGap, 0, h);
      let end = tip, top = h;
      if (stadium) {
        // a wider platform at the end, a step up; a mast stands either side of it
        end = tip + 4; top = h + .075;
        run(yaw, tip - .15, end, 5.15, L.thrustGap, 0, top);
        for (const side of [-1, 1]) masts.push(planXZ(c, yaw, tip + 2, side * 6.3));
      }
      const [x, z] = planXZ(c, yaw, end + flights(top) * STEP_RUN);
      steps.push(flight({ x, z, h: top, width: stadium ? 3 : 2.4, dir: [-Math.sin(yaw), -Math.cos(yaw)] }));
    });
    if (dome) for (const yaw of DIAGONALS) masts.push(planXZ(c, yaw, L.mast));
  }
  return { L, round, decks, steps, masts };
}
