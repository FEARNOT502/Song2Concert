// App metres at the centre of the KSPO floor. The old gate 1-1/A axis is -z.
export const GYM_ID = 'gymnastic-arena';
export const GYM_NAME = 'KSPO DOME';
export const GYM_360_AUDIO = 'gymnastic-arena-360';
export const GYM_FLOOR_R = 32.7;
export const GYM_AISLE_R = 33.35;
export const GYM_FIRST_ROW = 12;
export const GYM_RAD = Math.PI / 180;
// FOH: the mix position's deck (the console's floor, its top at y). General:
// the floor's back middle, as on the operator's and HYBE's end-stage plots.
// 360: the CONSOLE in section 19 (1F, between 18 and 20 on DAY6's map), on a
// scaffold deck over the stand's rows, facing the round stage.
export const GYM_FOH = {
  general: [0, .81, 24.6],
  360: [0, 4.86, -38.6],
};
// The section 19 scaffold under the 360 console (radii along the section's
// middle, half its width across).
export const GYM_CONSOLE_DECK = { r0: 35.25, r1: 41.95, half: 4.6, top: 4.86 };
export const GYM_PA = {
  // mains off the downstage corners, side hangs turned to the 1F/2F sides,
  // then a delay pair out over the floor's back corners for the C end's upper rows
  general: [
    { x: -21.9, z: -13.4, top: 16.9, yaw: -.12 },
    { x: 21.9, z: -13.4, top: 16.9, yaw: .12 },
    { x: -26.1, z: -14.1, top: 16.6, yaw: -.72 },
    { x: 26.1, z: -14.1, top: 16.6, yaw: .72 },
    { x: -24.8, z: 15.6, top: 17.2, yaw: -.24 },
    { x: 24.8, z: 17.4, top: 17.2, yaw: .24 },
  ],
  // 360: a pair at each corner of the LED box, splayed either side of the
  // diagonal, far enough out that each hangs clear past the box's face and
  // its IMAG beside it, not in front of them
  360: Array.from({ length: 8 }, (_, i) => {
    const diag = (Math.floor(i / 2) * 90 + 45) * GYM_RAD, s = i % 2 ? 1 : -1;
    const x = 13.6 * Math.sin(diag) + s * .9 * Math.cos(diag), z = 13.6 * Math.cos(diag) - s * .9 * Math.sin(diag);
    return { x, z, top: 18.2, yaw: diag + s * .38 };
  }),
};
export const GYM_CENTER_R = 7.6;
export const GYM_STANDING = [[53, 127], [127, 180], [180, 233], [233, 307], [307, 360], [0, 53]];
export const gymPoint = (degrees, r) => [Math.sin(degrees * GYM_RAD) * r, -Math.cos(degrees * GYM_RAD) * r];
export const gymRing = (start, end, r, segments = Math.ceil((end - start) / 3)) =>
  Array.from({ length: segments + 1 }, (_, i) => gymPoint(start + i * (end - start) / segments, r));
export const gymSector = (start, end, near, far) =>
  [...gymRing(start, end, far), ...gymRing(start, end, near).reverse()];

// General: the end stage at A with its LED wall and the band upstage, a
// runway out to a walkway across it (the T: RIIZE's 2025 plot), the floor
// seated round it. Units as CONCERT_LAYOUTS (stage-plan.js).
const GENERAL = {
  code: 'KG1', deck: 1.8, runway: 1.5, gap: 2.6, thrustGap: 2.2,
  front: -12.3, back: -24.4, w: 40, runHalf: 2.1, cross: 3.4, crossD: 4.6, wing: 12.4, tip: 8.0,
  wall: [30.4, 10.9, 4.45], wallZ: -23.15, rig: 18.2, reach: 66,
};
// 360: DAY6's low round deck, the drum riser in its middle, the grid over it.
const ROUND = { code: 'KR1', deck: 1.38, riser: [2.28, .69], gap: 2.6, rig: 20.2, wall: [16.4, 5.4, 12.6], reach: 64 };
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const RISE = .2, RUN = .28;
const flight = ({ x, z, h, y0 = 0, width, dir }) => {
  const n = Math.max(1, Math.ceil((h - y0) / RISE - 1e-6)), len = n * RUN;
  const [dx, dz] = dir, ax = -dz, az = dx, hw = width / 2;
  return { x, z, h, y0, width, dir, ring: [[x - ax * hw, z - az * hw], [x + ax * hw, z + az * hw],
    [x + ax * hw + dx * len, z + az * hw + dz * len], [x - ax * hw + dx * len, z - az * hw + dz * len]] };
};

export function gymStagePlan(mode) {
  const round = mode === '360';
  const L = round ? ROUND : GENERAL;
  if (round) {
    const ring = gymRing(0, 360, GYM_CENTER_R, 72).slice(0, -1);
    const riser = gymRing(0, 360, L.riser[0], 48).slice(0, -1);
    const steps = [36, 216].map((deg) => {
      const [x, z] = gymPoint(deg, GYM_CENTER_R + Math.ceil(L.deck / RISE) * RUN);
      const [dx, dz] = gymPoint(deg, 1);
      return flight({ x, z, h: L.deck, width: 1.3, dir: [-dx, -dz] });
    });
    return {
      L, round, steps, masts: [],
      decks: [{ ring, h: L.deck, radius: GYM_CENTER_R, gap: L.gap }, { ring: riser, h: L.deck + L.riser[1], base: L.deck, radius: L.riser[0], gap: 0 }],
    };
  }
  const r = L.w / 2;
  const decks = [
    { ring: rect(-r, r, L.back, L.front), h: L.deck, gap: L.gap },
    { ring: rect(-L.runHalf, L.runHalf, L.front, L.cross), h: L.runway, gap: L.thrustGap },
    { ring: rect(-L.wing, L.wing, L.cross, L.cross + L.crossD), h: L.runway, gap: L.thrustGap },
  ];
  const steps = [
    // crew stairs down the deck's front at its ends, and up from the runway
    ...[-1, 1].map((side) => flight({ x: side * (r - 2.2), z: L.front + Math.ceil(L.deck / RISE) * RUN, h: L.deck, width: 1.5, dir: [0, -1] })),
    flight({ x: 0, z: L.front + Math.ceil((L.deck - L.runway) / RISE) * RUN, h: L.deck, y0: L.runway, width: 2.4, dir: [0, -1] }),
  ];
  return { L, round, decks: decks.map((d) => ({ base: 0, ramp: null, ...d })), steps, masts: [] };
}
