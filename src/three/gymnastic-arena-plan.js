// App metres at the centre of the KSPO floor. The old gate 1-1/A axis is -z.
export const GYM_ID = 'gymnastic-arena';
export const GYM_NAME = 'KSPO DOME';
export const GYM_360_AUDIO = 'gymnastic-arena-360';
export const GYM_FLOOR_R = 32.7;
export const GYM_AISLE_R = 33.35;
export const GYM_FIRST_ROW = 12;
export const GYM_RAD = Math.PI / 180;
export const GYM_FOH = {
  general: [0, .65, 25.5],
  360: [0, 3.75, -38.0],
};
export const GYM_PA = {
  general: [
    { x: -19.8, z: -17.9, top: 12.7, yaw: -.16 },
    { x: 19.8, z: -17.9, top: 12.7, yaw: .16 },
    { x: -22.6, z: -16.5, top: 12.4, yaw: -.87 },
    { x: 22.6, z: -16.5, top: 12.4, yaw: .87 },
    { x: -25.0, z: 16.2, top: 12.0, yaw: -.25 },
    { x: 25.0, z: 18.0, top: 12.0, yaw: .25 },
  ],
  360: Array.from({ length: 8 }, (_, i) => {
    const yaw = (Math.floor(i / 2) * 90 + (i % 2 ? 51 : 39)) * GYM_RAD;
    return { x: 21.5 * Math.sin(yaw), z: 21.5 * Math.cos(yaw), top: 18.0, yaw };
  }),
};
export const GYM_CENTER_R = 7.6;
export const GYM_STANDING = [[53, 127], [127, 180], [180, 233], [233, 307], [307, 360], [0, 53]];
export const gymPoint = (degrees, r) => [Math.sin(degrees * GYM_RAD) * r, -Math.cos(degrees * GYM_RAD) * r];
export const gymRing = (start, end, r, segments = Math.ceil((end - start) / 3)) =>
  Array.from({ length: segments + 1 }, (_, i) => gymPoint(start + i * (end - start) / segments, r));
export const gymSector = (start, end, near, far) =>
  [...gymRing(start, end, far), ...gymRing(start, end, near).reverse()];

const GENERAL = {
  deck: 1.65, runway: 1.28, front: -12.3, back: -24.4, tip: 10.8, w: 38,
  wall: [35.4, 10.4], wallZ: -23.35, rig: 15.9,
};
const ROUND = { deck: 1.38, rig: 18.4 };
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

export function gymStagePlan(mode) {
  const round = mode === '360';
  const L = round ? ROUND : GENERAL;
  if (round) {
    const ring = gymRing(0, 360, GYM_CENTER_R, 72).slice(0, -1);
    return { L, round, decks: [{ ring, h: L.deck, radius: GYM_CENTER_R }], steps: [], masts: [] };
  }
  const main = rect(-L.w / 2, L.w / 2, L.back, L.front);
  const runway = rect(-2.05, 2.05, L.front, L.tip);
  const steps = [-1, 1].map((side) => {
    const x = side * 14.8;
    const z = L.front + 2.52;
    return { x, z, h: L.deck, width: 1.45, dir: [0, -1], ring: rect(x - .725, x + .725, L.front, z) };
  });
  return { L, round, decks: [{ ring: main, h: L.deck }, { ring: runway, h: L.runway }], steps, masts: [] };
}
