// ─────────────────────────────────────────────────────────────────────────────
// THEATER — a musical house after Blue Square's Shinhan Card Hall: three
// levels (1,066 / 430 / 270 at the real one), the stalls 27 m deep from the
// stage edge to the back row, the first balcony 18.5 m from the stage. A black
// portal, the house curtain gathered up, the pit covered over, box booms, and a
// show running. Behind each floor's last row a wall with doors onto its
// concourse; stairs at both back corners join the three, and a passage down
// each side from a door at the front of the stalls.
// The seats are the hall's own plan, seat for seat: blue, each block angled
// in toward the stage as the plan draws it.
// Room model: 29 × 40 × 16 m, 9th row centre, 12 m from the source.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, DEG, KELVIN, V3, carpetTex, glowMat, prng, std, velvet, withRepeat, woodTex, ringTint } from '../core.js';
import { crowd3D, lightPoints } from '../people.js';
import { drapeGeometry, ledScreen, lineArray, mats, seatField, shadowSpot, stageDeck, stageSteps } from '../rig.js';
import { floorBlocks } from '../show.js';
import { seatFinder } from '../stands.js';

// Blue Square's seating plan, read off the hall's published charts: for each
// floor, blocks front (f), rear (r) or balcony (b), in the middle (side 0) or
// either side (-1 house left, 1 house right). A middle block gives each row's
// seats across the house (metres from the centre line); a side block is
// turned th degrees in towards the stage about its aisle end, x0 m out from
// the centre, and gives each row's seats by their distance out from there.
// Behind the stalls' side blocks, a row of wheelchair places and one of
// companion seats. 990 in the stalls (the pit covered, 76 more), 430, 270.
export const BSQ = {f1:[{sec:"f",side:-1,th:12.3,x0:5.44,rows:[[4.36,3.84,3.31,2.78,2.25,1.73,1.2,0.66],[4.78,4.25,3.72,3.2,2.67,2.14,1.61,1.09,0.56],[5.2,4.67,4.14,3.6,3.08,2.55,2.03,1.5,0.97,0.45],[5.09,4.56,4.03,3.5,2.98,2.45,1.91,1.39,0.86,0.33],[5.5,4.97,4.44,3.92,3.39,2.86,2.34,1.81,1.28,0.75,0.22],[5.92,5.39,4.87,4.33,3.81,3.28,2.75,2.22,1.7,1.17,0.64,0.12],[6.32,5.81,5.28,4.75,4.23,3.7,3.17,2.64,2.11,1.58,1.06,0.53,0.0]]},{sec:"f",side:0,th:0.0,x0:0.0,rows:[[-3.72,-3.23,-2.74,-2.26,-1.77,-1.28,-0.78,-0.31,0.18,0.68,1.17,1.65,2.14,2.63,3.13,3.6],[-3.97,-3.48,-2.98,-2.5,-2.02,-1.52,-1.03,-0.53,-0.06,0.43,0.93,1.42,1.89,2.39,2.88,3.37,3.85],[-3.72,-3.23,-2.74,-2.26,-1.77,-1.28,-0.78,-0.31,0.18,0.68,1.17,1.65,2.14,2.63,3.13,3.6],[-3.97,-3.48,-2.98,-2.5,-2.02,-1.52,-1.03,-0.53,-0.06,0.43,0.93,1.42,1.89,2.39,2.88,3.37,3.85],[-3.72,-3.23,-2.74,-2.26,-1.77,-1.28,-0.78,-0.31,0.18,0.68,1.17,1.65,2.14,2.63,3.13,3.6],[-3.97,-3.48,-2.98,-2.5,-2.02,-1.52,-1.03,-0.53,-0.06,0.43,0.93,1.42,1.89,2.39,2.88,3.37,3.85],[-3.72,-3.23,-2.74,-2.26,-1.77,-1.28,-0.78,-0.31,0.18,0.68,1.17,1.65,2.14,2.63,3.13,3.6]]},{sec:"f",side:1,th:12.6,x0:5.3,rows:[[0.68,1.2,1.72,2.25,2.77,3.29,3.81,4.33],[0.57,1.09,1.61,2.14,2.66,3.18,3.71,4.22,4.75],[0.46,0.98,1.5,2.02,2.55,3.07,3.59,4.11,4.64,5.15],[0.34,0.86,1.39,1.91,2.43,2.96,3.48,4.0,4.52,5.04],[0.23,0.75,1.27,1.79,2.32,2.84,3.36,3.88,4.41,4.93,5.45],[0.12,0.64,1.16,1.68,2.21,2.73,3.25,3.77,4.29,4.82,5.34,5.86],[0.0,0.53,1.05,1.57,2.09,2.61,3.13,3.66,4.18,4.7,5.22,5.75,6.27]]},{sec:"r",side:-1,th:12.3,x0:5.01,rows:[[8.95,8.42,7.89,7.36,6.84,6.31,5.78,5.25,4.72,4.2,3.67,3.14,2.61,2.08,1.56],[8.84,8.31,7.78,7.25,6.72,6.2,5.67,5.14,4.61,4.08,3.56,3.03,2.5,1.97,1.44],[8.72,8.19,7.67,7.14,6.61,6.09,5.56,5.03,4.5,3.97,3.44,2.92,2.39,1.86,1.33],[8.61,8.09,7.56,7.03,6.5,5.97,5.45,4.92,4.39,3.86,3.33,2.81,2.28,1.75,1.22],[8.5,7.97,7.45,6.92,6.39,5.86,5.33,4.81,4.28,3.75,3.22,2.69,2.17,1.64,1.11],[8.39,7.86,7.33,6.81,6.28,5.75,5.22,4.7,4.17,3.64,3.11,2.58,2.06,1.53,1.0],[8.28,7.75,7.22,6.7,6.17,5.64,5.11,4.58,4.06,3.53,3.0,2.47,1.94,1.42,0.89],[8.17,7.64,7.11,6.58,6.06,5.53,5.0,4.47,3.95,3.42,2.89,2.36,1.83,1.3,0.78],[8.06,7.53,7.0,6.47,5.95,5.42,4.89,4.36,3.83,3.31,2.78,2.25,1.72,1.2,0.67],[7.95,7.42,6.88,6.36,5.83,5.31,4.78,4.25,3.72,3.19,2.67,2.14,1.61,1.08,0.56],[7.84,7.31,6.78,6.25,5.72,5.2,4.67,4.14,3.61,3.08,2.56,2.03,1.5,0.97,0.44],[7.72,7.2,6.67,6.14,5.61,5.08,4.56,4.03,3.5,2.97,2.44,1.92,1.39,0.86,0.33],[7.62,7.09,6.56,6.03,5.5,4.97,4.45,3.92,3.39,2.86,2.33,1.81,1.28,0.75,0.22],[7.5,6.97,6.45,5.92,5.39,4.86,4.33,3.81,3.28,2.75,2.22,1.7,1.17,0.64,0.11],[7.39,6.86,6.33,5.81,5.28,4.75,4.22,3.69,3.17,2.64,2.11,1.58,1.06,0.53,0.0],[0.66,1.35,2.04,2.73,3.43,4.12,4.81,5.52,6.27],[0.26,0.95,1.64,2.33,3.03,3.72,4.43]]},{sec:"r",side:0,th:0.0,x0:0.0,rows:[[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81],[-3.93,-3.44,-2.94,-2.43,-1.93,-1.44,-0.94,-0.43,0.06,0.55,1.07,1.56,2.06,2.57,3.07,3.56,4.05],[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81],[-3.93,-3.44,-2.94,-2.43,-1.93,-1.44,-0.94,-0.43,0.06,0.55,1.07,1.56,2.06,2.57,3.07,3.56,4.05],[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81],[-3.93,-3.44,-2.94,-2.43,-1.93,-1.44,-0.94,-0.43,0.06,0.55,1.07,1.56,2.06,2.57,3.07,3.56,4.05],[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81],[-3.93,-3.44,-2.94,-2.43,-1.93,-1.44,-0.94,-0.43,0.06,0.55,1.07,1.56,2.06,2.57,3.07,3.56,4.05],[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81],[-3.93,-3.44,-2.94,-2.43,-1.93,-1.44,-0.94,-0.43,0.06,0.55,1.07,1.56,2.06,2.57,3.07,3.56,4.05],[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81],[-3.93,-3.44,-2.94,-2.43,-1.93,-1.44,-0.94,-0.43,0.06,0.55,1.07,1.56,2.06,2.57,3.07,3.56,4.05],[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81],[-3.93,-3.44,-2.94,-2.43,-1.93,-1.44,-0.94,-0.43,0.06,0.55,1.07,1.56,2.06,2.57,3.07,3.56,4.05],[-3.68,-3.19,-2.7,-2.18,-1.69,-1.19,-0.68,-0.18,0.31,0.82,1.32,1.81,2.3,2.82,3.31,3.81]]},{sec:"r",side:1,th:12.3,x0:4.94,rows:[[1.56,2.08,2.61,3.14,3.67,4.2,4.72,5.25,5.78,6.31,6.84,7.36,7.89,8.42,8.95],[1.45,1.98,2.5,3.03,3.56,4.09,4.62,5.14,5.67,6.2,6.73,7.25,7.78,8.31,8.84],[1.33,1.86,2.39,2.92,3.45,3.98,4.5,5.03,5.56,6.09,6.62,7.14,7.67,8.2,8.73],[1.22,1.75,2.28,2.81,3.33,3.86,4.39,4.92,5.45,5.97,6.5,7.03,7.56,8.09,8.62],[1.11,1.64,2.17,2.7,3.22,3.75,4.28,4.81,5.34,5.86,6.39,6.92,7.45,7.98,8.5],[1.0,1.53,2.06,2.59,3.12,3.64,4.17,4.7,5.23,5.75,6.28,6.81,7.34,7.87,8.39],[0.89,1.42,1.95,2.47,3.0,3.53,4.06,4.59,5.12,5.64,6.17,6.7,7.23,7.75,8.28],[0.78,1.31,1.83,2.36,2.89,3.42,3.95,4.47,5.0,5.53,6.06,6.59,7.12,7.64,8.17],[0.67,1.2,1.72,2.25,2.78,3.31,3.84,4.36,4.89,5.42,5.95,6.47,7.0,7.53,8.06],[0.56,1.08,1.61,2.14,2.67,3.2,3.72,4.25,4.78,5.31,5.84,6.36,6.89,7.42,7.95],[0.44,0.97,1.5,2.03,2.56,3.09,3.62,4.14,4.67,5.2,5.73,6.25,6.78,7.31,7.84],[0.33,0.86,1.39,1.92,2.45,2.98,3.5,4.03,4.56,5.08,5.61,6.14,6.67,7.2,7.73],[0.22,0.75,1.28,1.81,2.33,2.86,3.39,3.92,4.45,4.97,5.5,6.03,6.56,7.09,7.62],[0.11,0.64,1.17,1.7,2.22,2.75,3.28,3.81,4.34,4.86,5.39,5.92,6.45,6.98,7.5],[0.0,0.53,1.06,1.59,2.11,2.64,3.17,3.7,4.23,4.75,5.28,5.81,6.34,6.86,7.39],[0.75,1.46,2.17,2.88,3.59,4.3,5.01,5.72,6.44],[0.36,1.07,1.78,2.49,3.2,3.91,4.62]]}],f2:[{sec:"b",side:-1,th:12.3,x0:5.4,rows:[[8.47,7.9,7.37,6.84,6.31,5.78,5.25,4.72,4.18,3.65,3.13,2.6,2.06,1.53,1.0],[8.32,7.79,7.25,6.73,6.2,5.67,5.14,4.61,4.07,3.54,3.01,2.48,1.95,1.42,0.89],[8.21,7.67,7.14,6.61,6.08,5.55,5.03,4.49,3.96,3.43,2.9,2.37,1.84,1.31,0.78],[8.1,7.56,7.04,6.5,5.97,5.44,4.91,4.38,3.85,3.32,2.79,2.26,1.73,1.2,0.67],[7.99,7.45,6.92,6.39,5.86,5.33,4.8,4.27,3.74,3.21,2.68,2.15,1.62,1.09,0.56],[6.81,6.28,5.75,5.22,4.69,4.16,3.63,3.1,2.57,2.04,1.51,0.97,0.45],[6.7,6.17,5.64,5.11,4.58,4.05,3.52,2.99,2.46,1.93,1.4,0.86,0.34],[6.59,6.06,5.53,5.0,4.46,3.93,3.4,2.87,2.34,1.81,1.28,0.76,0.22],[6.47,5.95,5.41,4.88,4.35,3.82,3.29,2.76,2.23,1.7,1.17,0.64,0.11],[7.42,6.89,6.36,5.83,5.3,4.77,4.24,3.71,3.18,2.65,2.12,1.59,1.06,0.53,0.0]]},{sec:"b",side:0,th:0.0,x0:0.0,rows:[[-3.66,-3.16,-2.67,-2.2,-1.7,-1.21,-0.72,-0.22,0.27,0.77,1.25,1.73,2.23,2.72,3.21,3.71],[-3.66,-3.16,-2.67,-2.2,-1.7,-1.21,-0.72,-0.22,0.27,0.77,1.25,1.73,2.23,2.72,3.21,3.71],[-3.66,-3.16,-2.67,-2.2,-1.7,-1.21,-0.72,-0.22,0.27,0.77,1.25,1.73,2.23,2.72,3.21,3.71],[-3.66,-3.16,-2.67,-2.2,-1.7,-1.21,-0.72,-0.22,0.27,0.77,1.25,1.73,2.23,2.72,3.21,3.71],[-3.66,-3.16,-2.67,-2.2,-1.7,-1.21,-0.72,-0.22,0.27,0.77,1.25,1.73,2.23,2.72,3.21,3.71],[-3.16,-2.67,-2.2,-1.7,-1.21,-0.72,-0.22,0.27,0.77,1.25,1.73,2.23,2.72,3.21],[-3.16,-2.67,-2.2,-1.7,-1.21,-0.72,-0.22,0.27,0.77,1.25,1.73,2.23,2.72],[-2.92,-2.43,-1.95,-1.46,-0.96,-0.47,0.02,0.52,1.01,1.49,1.98,2.47,2.97],[-2.92,-2.43,-1.95,-1.46,-0.96,-0.47,0.02,0.52,1.01,1.49,1.98,2.47,2.97],[-2.92,-2.43,-1.95,-1.46,-0.96,-0.47,0.02,0.52,1.01,1.49,1.98,2.47,2.97]]},{sec:"b",side:1,th:12.3,x0:5.28,rows:[[1.01,1.54,2.07,2.6,3.13,3.66,4.19,4.72,5.25,5.78,6.31,6.84,7.37,7.91,8.45],[0.9,1.43,1.96,2.49,3.02,3.55,4.08,4.61,5.14,5.67,6.2,6.73,7.26,7.79,8.32],[0.78,1.31,1.84,2.37,2.9,3.44,3.96,4.5,5.03,5.56,6.09,6.62,7.15,7.68,8.21],[0.67,1.2,1.73,2.26,2.79,3.33,3.85,4.38,4.91,5.44,5.97,6.5,7.04,7.57,8.1],[0.56,1.09,1.62,2.15,2.68,3.21,3.74,4.27,4.8,5.33,5.86,6.39,6.92,7.46,7.99],[0.45,0.98,1.51,2.04,2.57,3.1,3.63,4.16,4.69,5.22,5.75,6.28,6.81],[0.34,0.87,1.4,1.93,2.46,2.99,3.52,4.05,4.58,5.11,5.64,6.17,6.7],[0.23,0.76,1.29,1.82,2.35,2.88,3.41,3.94,4.47,5.0,5.53,6.06,6.59],[0.11,0.64,1.17,1.7,2.23,2.77,3.29,3.83,4.36,4.88,5.42,5.95,6.48],[0.0,0.53,1.06,1.59,2.12,2.65,3.18,3.71,4.24,4.77,5.3,5.83,6.37,6.9,7.43]]}],f3:[{sec:"b",side:-1,th:12.3,x0:5.53,rows:[[8.06,7.52,6.99,6.45,5.92,5.38,4.85,4.31,3.78,3.24,2.71,2.17,1.64,1.1,0.57],[7.94,7.41,6.87,6.34,5.8,5.27,4.74,4.2,3.67,3.13,2.59,2.06,1.52,0.99,0.45],[6.23,5.69,5.16,4.62,4.09,3.55,3.02,2.48,1.95,1.41,0.88,0.34],[7.72,7.18,6.65,6.12,5.58,5.04,4.51,3.98,3.44,2.9,2.37,1.83,1.3,0.76,0.23],[7.61,7.07,6.54,6.0,5.47,4.93,4.4,3.86,3.33,2.79,2.25,1.72,1.19,0.65,0.12],[8.06,7.5,6.96,6.43,5.89,5.35,4.82,4.28,3.75,3.21,2.68,2.14,1.61,1.07,0.54,0.0]]},{sec:"b",side:0,th:0.0,x0:0.0,rows:[[-3.72,-3.22,-2.72,-2.23,-1.73,-1.24,-0.75,-0.25,0.24,0.74,1.24,1.73,2.23,2.73,3.22,3.72],[-3.72,-3.22,-2.72,-2.23,-1.73,-1.24,-0.75,-0.25,0.24,0.74,1.24,1.73,2.23,2.73,3.22,3.72],[-3.72,-3.22,-2.72,-2.23,-1.73,-1.24,-0.75,-0.25,0.24,0.74,1.24,1.73,2.23,2.73,3.22,3.72],[-3.72,-3.22,-2.72,-2.23,-1.73,-1.24,-0.75,-0.25,0.24,0.74,1.24,1.73,2.23,2.73,3.22,3.72],[-3.72,-3.22,-2.72,-2.23,-1.73,-1.24,-0.75,-0.25,0.24,0.74,1.24,1.73,2.23,2.73,3.22,3.72],[-3.72,-3.22,-2.72,-2.23,-1.73,-1.24,-0.75,0.74,1.24,1.73,2.23,2.73,3.22,3.72]]},{sec:"b",side:1,th:12.4,x0:5.44,rows:[[0.57,1.1,1.64,2.17,2.71,3.25,3.78,4.32,4.85,5.39,5.92,6.46,6.99,7.54,8.07],[0.46,0.99,1.53,2.06,2.6,3.13,3.67,4.2,4.74,5.27,5.81,6.35,6.88,7.42,7.95],[0.35,0.88,1.41,1.95,2.48,3.02,3.56,4.09,4.63,5.16,5.7,6.23],[0.23,0.76,1.3,1.83,2.37,2.9,3.44,3.98,4.51,5.04,5.58,6.12,6.65,7.19,7.72],[0.12,0.65,1.19,1.72,2.26,2.79,3.33,3.86,4.4,4.93,5.47,6.0,6.54,7.07,7.61],[0.0,0.54,1.07,1.61,2.14,2.68,3.21,3.75,4.28,4.82,5.35,5.89,6.42,6.96,7.49,8.03]]}]};
// ─────────────────────────────────────────────────────────────────────────────

export function buildTheater(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const W = 29, D = 40, H = 16, X = W / 2;
  const PZ = 4.0, PT = 0.7;            // proscenium wall: audience face at PZ + PT
  const OW = 15.2, OB = 1.1, OT = 10.4; // opening width, sill (deck), head
  const DECK = 1.1;
  const APRON = 5.9;                    // stage edge
  const PIT0 = APRON, PIT1 = 8.3;       // orchestra pit (covered over)
  // the stalls: seven rows, a cross-aisle, fifteen more, then the wheelchair
  // places; row g of the stalls counts through the cross-aisle as a row
  const ROW0 = 8.9, ROWD = 0.95, CROSSW = 1.6;
  const rowY = (g) => 0.12 + g * 0.075 + g * g * 0.0032;
  const stallZ = (sec, k) => ROW0 + k * ROWD + (sec === 'r' ? 7 * ROWD + CROSSW : 0);
  const stallG = (sec, k) => (sec === 'r' ? 8 + Math.min(k, 15) : k);
  const eye = V3(0, rowY(stallG('r', 1)) + 1.2, stallZ('r', 1) + 0.3);
  const tung = KELVIN(3200);

  // ── materials ──
  const walnut = woodTex({ key: 'walnut', planks: 8, joints: 1, base: [0.2, 0.11, 0.06], tone: 0.12, grain: 0.35, rough: 0.5, seed: 12 });
  const wallMat = std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), roughness: 1 });
  const black = std({ color: 0x050506, roughness: 0.9 });
  const carpet = std({ ...withRepeat(carpetTex({ key: 'theatercarpet', base: [0.16, 0.035, 0.04] }), 16, 20), roughness: 1 });
  const seatVel = velvet(0x22409e, 'seatblue');

  // ── the house ──
  // the house floor, out to the proscenium: the pit is covered over level with it
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D - PZ - PT), carpet);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, (PZ + PT + D) / 2); floor.receiveShadow = true;
  root.add(floor);
  // the levels behind the seats (see concourses below): the floor of the
  // stalls' wheelchair places, and where the stalls' and the 2nd floor's walls
  // with their doors stand; the side walls' door and opening onto the passages
  const CY1 = 0.12 + 23 * 0.075 + 23 * 23 * 0.0032;
  const CZW = 33.5;
  const SIDE_DOOR = [5.0, 6.6], SIDE_OPEN = [33.8, 39.6];
  for (const side of [-1, 1]) {
    // the side walls, with a door at the front of the stalls and the opening
    // from the side passage onto the stalls' concourse
    const ws = new THREE.Shape();
    ws.moveTo(PZ, 0); ws.lineTo(D, 0); ws.lineTo(D, H); ws.lineTo(PZ, H); ws.lineTo(PZ, 0);
    for (const [z0, z1, y0, y1] of [[SIDE_DOOR[0], SIDE_DOOR[1], 0, 2.3], [SIDE_OPEN[0], SIDE_OPEN[1], CY1, CY1 + 2.8]]) {
      const h = new THREE.Path(); h.moveTo(z0, y0); h.lineTo(z1, y0); h.lineTo(z1, y1); h.lineTo(z0, y1); h.lineTo(z0, y0); ws.holes.push(h);
    }
    const wg = new THREE.ShapeGeometry(ws, 1);
    const P = wg.attributes.position;
    for (let i = 0; i < P.count; i++) { const u = P.getX(i), v = P.getY(i); P.setXYZ(i, side * X, v, u); }
    wg.computeVertexNormals();
    const wall = new THREE.Mesh(wg, std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), roughness: 1, side: THREE.DoubleSide }));
    wall.receiveShadow = true;
    root.add(wall);
    // acoustic fins down the side walls, catching the light edge-on, short of
    // the concourses
    const fins = [];
    for (let z = PZ + 3; z < CZW - 0.5; z += 1.4) { const f = new THREE.BoxGeometry(0.22, H - 1, 0.06); f.translate(side * (X - 0.11), H / 2 + 0.5, z); fins.push(f); }
    root.add(new THREE.Mesh(mergeGeometries(fins), std({ color: 0x2a1a10, roughness: 0.6 })));
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std({ color: 0x08080a, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, D / 2); root.add(ceil);
  const backW = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); backW.rotation.y = Math.PI; backW.position.set(0, H / 2, D); root.add(backW);
  // FOH bridges: slots across the ceiling
  for (const z of [11, 19]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 1.2, 1.6), std({ color: 0x030304, roughness: 1 }));
    slot.position.set(0, H - 0.6, z); root.add(slot);
  }

  // ── proscenium wall with the opening ──
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-X, 0); wallShape.lineTo(X, 0); wallShape.lineTo(X, H); wallShape.lineTo(-X, H); wallShape.lineTo(-X, 0);
  const hole = new THREE.Path();
  hole.moveTo(-OW / 2, OB); hole.lineTo(OW / 2, OB); hole.lineTo(OW / 2, OT); hole.lineTo(-OW / 2, OT); hole.lineTo(-OW / 2, OB);
  wallShape.holes.push(hole);
  const pros = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: PT, bevelEnabled: false }), std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), roughness: 1 }));
  pros.position.z = PZ;
  pros.receiveShadow = true;
  root.add(pros);
  // the black portal frame inside the opening
  const portal = [];
  for (const [w, h, x, y] of [[OW + 1.2, 0.6, 0, OT + 0.3], [0.6, OT - OB, -OW / 2 - 0.3, (OT + OB) / 2], [0.6, OT - OB, OW / 2 + 0.3, (OT + OB) / 2]]) {
    const b = new THREE.BoxGeometry(w, h, 0.3); b.translate(x, y, PZ + PT + 0.16); portal.push(b);
  }
  root.add(new THREE.Mesh(mergeGeometries(portal), black));

  // house curtain: a gathered valance and two tabs
  const houseVel = velvet(0x5a0710, 'housecurtain');
  const valance = new THREE.Mesh(drapeGeometry(OW + 0.4, 1.7, 34, 0.12), houseVel);
  valance.position.set(0, OT - 0.85, PZ + 0.35); root.add(valance);
  for (const side of [-1, 1]) {
    const tab = new THREE.Mesh(drapeGeometry(1.5, OT - OB, 9, 0.16), houseVel);
    tab.position.set(side * (OW / 2 - 0.55), (OT + OB) / 2, PZ + 0.3); root.add(tab);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), std({ color: 0x8a6a2a, metalness: 0.8, roughness: 0.35 }));
    tie.rotation.x = Math.PI / 2; tie.position.set(side * (OW / 2 - 0.55), 4.2, PZ + 0.3); root.add(tie);
  }

  // ── stage house ──
  const deck = stageDeck({ w: 24, d: 18, h: DECK, z: -14 + 9, lip: false, fascia: 0x050505 });
  root.add(deck);
  // apron, curved, out to the pit
  const apron = stageDeck({ w: OW + 2, d: APRON - PZ - PT + 1, h: DECK, z: (PZ + PT + APRON) / 2 - 0.5, round: 0.8, fascia: 0x050505 });
  root.add(apron);
  // side steps from the house floor up to the apron, either side of the pit
  for (const s of [-1, 1]) {
    root.add(stageSteps({ x: s * 9.95, z: 8.45, h: DECK, dir: [0, -1], width: 1.4 }));
    // a landing at the top, and a step across to the apron clear of the pit
    const lm = std({ color: 0x0c0c0e, roughness: 0.8 });
    const landing = new THREE.Mesh(new THREE.BoxGeometry(1.5, DECK, 2.15), lm);
    landing.position.set(s * 9.9, DECK / 2, 5.775); root.add(landing);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.3, DECK, 1.15), lm);
    bridge.position.set(s * 8.55, DECK / 2, 5.275); root.add(bridge);
  }
  const lipM = glowMat(APP.accent, 0.35);
  // along the apron's curved front (stageDeck's round front: the corners
  // 0.8 m back from its edge, the middle 0.2 m out past it)
  {
    const aw = OW + 2, az = (PZ + PT + APRON) / 2 - 0.5, ad = APRON - PZ - PT + 1, y = DECK - 0.01;
    const path = new THREE.CurvePath();
    for (const s of [-1, 1]) path.add(new THREE.QuadraticBezierCurve3(V3(s * aw / 2, y, az + ad / 2 - 0.8 + 0.01), V3(s * aw / 2, y, az + ad / 2 + 0.01), V3(0, y, az + ad / 2 + 0.21)));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.012, 4, false), lipM));
  }
  const stageBack = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), black);
  stageBack.position.set(0, 8, -14); root.add(stageBack);
  // legs and borders: the black masking that makes wings
  const maskMat = velvet(0x050505, 'blackvel', { sheenColor: new THREE.Color(0x151515) });
  for (const z of [2.6, -1.0, -4.6]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(drapeGeometry(2.4, 11, 6, 0.1), maskMat);
      leg.position.set(side * (OW / 2 + 0.2 - (z < 0 ? 0.6 : 0)), DECK + 5.5, z); root.add(leg);
    }
    const border = new THREE.Mesh(drapeGeometry(OW + 2, 1.8, 10, 0.06), maskMat);
    border.position.set(0, OT - 0.4 - (z < 0 ? 0.3 : 0), z); root.add(border);
  }

  // the set: an LED wall upstage, framed by two steel towers
  const aspect = 16 / 9;
  const SW = 12.4, SH = SW / aspect;
  const screen = ledScreen({ w: SW, h: SH, tex: ctx.art.texture(aspect), pitch: 0.0039, bright: 1.3, frame: 0.2, lightPower: 1.7 });
  screen.position.set(0, DECK + 1.2 + SH / 2, -6.2);
  root.add(screen);
  ctx.addScreen(screen, aspect, 'main');
  const steel = std({ color: 0x1b1a1c, metalness: 0.8, roughness: 0.45 });
  const practical = new THREE.MeshBasicMaterial({ color: KELVIN(2600).clone().multiplyScalar(6), toneMapped: false });
  const practicals = [];
  for (const side of [-1, 1]) {
    const tw = [];
    const x0 = side * 5.2;
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) { const p = new THREE.BoxGeometry(0.12, 6.4, 0.12); p.translate(x0 + dx, DECK + 3.2, -2.6 + dz); tw.push(p); }
    for (const y of [3.0, 5.6]) {
      const pl = new THREE.BoxGeometry(2.0, 0.12, 2.0); pl.translate(x0, DECK + y, -2.6); tw.push(pl);
      for (const dz of [-0.95, 0.95]) { const r = new THREE.BoxGeometry(2.0, 0.05, 0.05); r.translate(x0, DECK + y + 1.0, -2.6 + dz); tw.push(r); }
      const r2 = new THREE.BoxGeometry(0.05, 0.05, 2.0); r2.translate(x0 - side * 0.95, DECK + y + 1.0, -2.6); tw.push(r2);
    }
    for (let k = 0; k < 8; k++) { const st = new THREE.BoxGeometry(1.1, 0.08, 0.34); st.translate(x0 - side * 1.6, DECK + 0.37 * (k + 1), -2.6 + 1.2 - k * 0.3); tw.push(st); }
    const tower = new THREE.Mesh(mergeGeometries(tw), steel);
    tower.castShadow = true; tower.receiveShadow = true;
    root.add(tower);
    for (const y of [3.4, 6.0]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), practical);
      lamp.position.set(x0 - side * 0.8, DECK + y, -1.75); root.add(lamp);
      practicals.push(pipe.flares.add(lamp.position, KELVIN(2600), 0.5, 0.6));
    }
  }

  // the stage stands empty between numbers: the lead's mark is a pool of
  // followspot on the deck
  const lead = { position: V3(-0.9, DECK, 3.3) };

  // ── the pit ──
  // covered over, level with the house floor (which runs on under the
  // apron's front): no band in it for this show

  // ── PA: centre cluster and left/right columns ──
  const cluster = lineArray({ boxes: 6, width: 1.1, depth: 0.6, height: 0.34, splay: 0.05 });
  cluster.position.set(0, OT + 2.4, PZ + PT + 0.7); root.add(cluster);
  for (const side of [-1, 1]) {
    const col = lineArray({ boxes: 12, width: 0.7, depth: 0.5, height: 0.3, splay: 0.012 });
    col.position.set(side * (OW / 2 + 1.35), OT - 0.4, PZ + PT + 0.5); col.rotation.y = -side * 0.25; root.add(col);
  }

  // ── seats and people, by the seating plan ──
  const spots = [], people = [];
  const rnd = prng(23);
  const sit = (x, y, z, turn) => {
    spots.push({ x, y, z, turn });
    const mine = Math.abs(z - eye.z) < 0.5 && Math.abs(x - eye.x) < 0.5;
    if (!mine && rnd() < 0.94) people.push({ x, y: y + 0.02, z: z - 0.05, turn: turn + (rnd() - 0.5) * 0.2, h: 0.93 + rnd() * 0.12 });
  };
  const toe = (x, z) => Math.atan2(x, z - 2) * 0.12;
  const seatFrame = std({ color: 0x140c08, roughness: 0.5 });
  const balconyFront = std({ ...withRepeat(walnut, 3, 1), roughness: 1 });
  const slabMat = std({ color: 0x0c0806, roughness: 1 });
  // a tread: a box one row deep under a row of seats, from `a` to `b` along
  // the row (seats sit on its line, the tread runs 0.18 m in front of it and
  // the rest of the row behind), `bottom` to `top`
  const tread = (out, ax, az, bx, bz, run, top, bottom) => {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    let nx = -uz, nz = ux; if (nz < 0) { nx = -nx; nz = -nz; }        // away from the stage
    const g = new THREE.BoxGeometry(len, top - bottom, run);
    g.rotateY(-Math.atan2(uz, ux));
    const off = run / 2 - 0.18;
    g.translate((ax + bx) / 2 + nx * off, (top + bottom) / 2, (az + bz) / 2 + nz * off);
    out.push(g);
    return { nx, nz };
  };
  // a floor's blocks: rows at z(sec, k), y(sec, k), the treads solid down to
  // `base(y)`, the aisles between the blocks filled at each row's height, the
  // side blocks' treads run on out to the walls. In front of a block's first
  // row the tread runs on a further KNEE, where its people's feet are (a
  // seated person's feet are about 0.55 m in front of the seat), and a
  // balcony's front stands past that, so no foot shows through it.
  const KNEE = 0.6;
  const floorBlocks = (blocks, { z, y, base, aisleTo, parts, fronts, frontY, aisleLights }) => {
    for (const b of blocks) {
      const th = b.th * DEG, sd = b.side;
      b.rows.forEach((row, k) => {
        const zk = z(b.sec, k), yk = y(b.sec, k);
        if (sd === 0) {
          for (const x of row) sit(x, yk, zk, Math.PI + toe(x, zk));
          // the middle block and the aisles either side, as one tread
          tread(parts, -aisleTo, zk, aisleTo, zk, ROWD, yk, base(yk));
          if (aisleLights) for (const s of [-1, 1]) aisleLights.push({ x: s * 4.7, y: yk + 0.05, z: zk + 0.3 });
          if (k === 0) tread(parts, -aisleTo, zk - KNEE, aisleTo, zk - KNEE, KNEE, yk, base(yk));
          if (k === 0 && fronts) tread(fronts, -aisleTo, zk - KNEE - 0.16, aisleTo, zk - KNEE - 0.16, 0.16, frontY(yk), yk - 0.4);
          return;
        }
        // a side block's row: from its aisle end out, turned in toward the stage
        const dx = sd * Math.cos(th), dz = -Math.sin(th);
        const px = sd * b.x0, pz = zk;
        for (const d of row) {
          const x = px + dx * d, zz = pz + dz * d;
          sit(x, yk, zz, Math.PI + sd * th + toe(x, zz) * 0.5);
        }
        const reach = (X - 0.15 - b.x0) / Math.cos(th);
        tread(parts, px - dx * 0.4, pz - dz * 0.4, px + dx * reach, pz + dz * reach, ROWD, yk, base(yk));
        if (k === 0) tread(parts, px - dx * 0.4, pz - dz * 0.4 - KNEE, px + dx * reach, pz + dz * reach - KNEE, KNEE, yk, base(yk));
        if (k === 0 && fronts) tread(fronts, px - dx * 0.4, pz - dz * 0.4 - KNEE - 0.16, px + dx * reach, pz + dz * reach - KNEE - 0.16, 0.16, frontY(yk), yk - 0.4);
      });
    }
  };
  // the stalls
  const rake = [], stepPts = [];
  const stalls = BSQ.f1;
  floorBlocks(stalls, { z: stallZ, y: (sec, k) => rowY(stallG(sec, k)), base: () => 0, aisleTo: 5.95, parts: rake, aisleLights: stepPts });
  // the cross-aisle, level with the 7th row, wall to wall
  { const yc = rowY(7), z0 = stallZ('f', 6) + ROWD - 0.18; const b = new THREE.BoxGeometry(W - 0.2, yc, stallZ('r', 0) - 0.18 - z0); b.translate(0, yc / 2, z0 + (stallZ('r', 0) - 0.18 - z0) / 2); rake.push(b); }
  // behind the stalls, the wheelchair places on a level floor to the back wall
  { const yb = rowY(stallG('r', 15)), z0 = stallZ('r', 14) + ROWD - 0.18; const b = new THREE.BoxGeometry(W - 0.2, yb, D - z0); b.translate(0, yb / 2, (z0 + D) / 2); rake.push(b); }
  const rakeMesh = new THREE.Mesh(mergeGeometries(rake), carpet); rakeMesh.receiveShadow = true; root.add(rakeMesh);
  // the balconies: 2nd floor 18.5 m from the stage, ten rows; the 3rd above
  // and behind it, six rows; slabs under the treads, a timber front, and a
  // walkway behind the last row to the back wall
  const balconies = [
    { blocks: BSQ.f2, z0: 24.4, y0: 5.2, rise: 0.3, front: 1.0 },
    // the 3rd floor's front kept low (0.8 m over its first tread), as the
    // photographs from its rows show it: under a seated eye, the stage clear over it
    { blocks: BSQ.f3, z0: 29.0, y0: 10.6, rise: 0.36, front: 0.8 },
  ];
  const lampSpots = [], levels = [];
  for (const B of balconies) {
    const parts = [], fronts = [];
    const z = (sec, k) => B.z0 + k * 0.9, y = (sec, k) => B.y0 + k * B.rise;
    floorBlocks(B.blocks, { z, y, base: (yk) => yk - 0.45, aisleTo: 5.95, parts, fronts, frontY: (yk) => yk + B.front, aisleLights: stepPts });
    const n = Math.max(...B.blocks.map((b) => b.rows.length));
    // its back slab, to the rear wall, is laid with the concourses (cut for the stairs)
    levels.push({ y: y('b', n - 1), z: z('b', n - 1) + 0.72, parts });
    root.add(new THREE.Mesh(mergeGeometries(fronts), balconyFront));
    for (const x of [-8.5, -3, 3, 8.5]) lampSpots.push(V3(x, B.y0 + B.front + 0.05, B.z0 - KNEE - 0.3 - Math.max(0, Math.abs(x) - 5.95) * Math.tan(12.3 * DEG)));
  }
  const conc = concourses(root, { X, D, H, CY1, CZW, levels, slabMat, wallMat: std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), roughness: 1 }), SIDE_DOOR, SIDE_OPEN });
  root.add(seatField(spots, { fabric: seatVel, frame: seatFrame }));
  if (q.crowd) root.add(crowd3D(people, cu, { kind: 'seated', detail: 1, seed: 5 }));
  // aisle step lights
  const steps = lightPoints(stepPts.map((p) => ({ ...p, white: true, size: 0.02, phase: 0 })), cu, { maxPx: 5 });
  steps.material.uniforms.uGain.value = 0.35;
  root.add(steps);
  // exit signs: over the doors in the side walls at the front of the stalls
  // (the doors in the walls behind each floor carry their own)
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), glowMat(0x19c26a, 2.2));
    sign.position.set(side * (X - 0.03), 2.62, (SIDE_DOOR[0] + SIDE_DOOR[1]) / 2); sign.rotation.y = -side * Math.PI / 2; root.add(sign);
  }

  // ── lighting rig ──
  const rig = ctx.rig({ finish: 'black' });
  // box booms on the side walls, near the stage
  const booms = [];
  for (const side of [-1, 1]) {
    const pipeM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 6), mats().black);
    pipeM.position.set(side * (X - 0.5), 7, 9.6); root.add(pipeM);
    for (let i = 0; i < 5; i++) {
      const f = rig.add({ kind: 'profile', pos: V3(side * (X - 0.8), 4 + i * 1.4, 9.6), color: KELVIN(3400), length: 24, scale: 0.7, beamGain: 0.06, flareGain: 0.6 });
      rig.aim(f, V3(-side * 1.5 + side * i * 0.4, DECK + 1.2, 1.5 - i * 0.8));
      booms.push(f);
    }
  }
  // overhead backlight: moving heads on the upstage electric, above the border
  const backs = [];
  for (let i = 0; i < 8; i++) {
    const f = rig.add({ kind: 'spot', pos: V3(-6.3 + i * 1.8, OT + 0.6, -3.4), color: 0xffffff, length: 18, scale: 0.8, beamGain: 1.0, flareGain: 0.4, angle: 0.07 });
    backs.push(f);
  }
  // side light from the wings (dance booms)
  const sides = [];
  for (const side of [-1, 1]) for (const [y, z] of [[2.2, 0.8], [3.6, -2.8]]) {
    const f = rig.add({ kind: 'profile', pos: V3(side * (OW / 2 + 1.0), DECK + y, z), color: 0xffffff, length: 18, scale: 0.7, beamGain: 0.3, flareGain: 0.2, angle: 0.13, body: true });
    rig.aim(f, V3(-side * 4, DECK + 1.2, z + 0.4));
    sides.push(f);
  }
  // followspots from the booth at the back
  const follows = [];
  for (const side of [-1, 1]) {
    const f = rig.add({ kind: 'follow', pos: V3(side * 3.5, 14.8, D - 1.2), color: KELVIN(5600), length: 44, scale: 1.2, beamGain: 0.35, flareGain: 0.6, body: false, soft: 0.2 });
    follows.push(f);
  }
  // FOH front light from the ceiling bridges (above frame; their beams cross it)
  const fohs = [];
  for (const z of [11, 19]) for (let i = 0; i < 6; i++) {
    const f = rig.add({ kind: 'profile', pos: V3(-6 + i * 2.4, H - 1.3, z), color: KELVIN(3200), length: 26, scale: 0.7, beamGain: 0.02, flareGain: 0.4 });
    rig.aim(f, V3(-4 + i * 1.6, DECK + 1.3, 2.2 - (z - 11) * 0.1));
    fohs.push(f);
  }

  // real light: two shadowed front lights, a colour wash, a backlight, the pit
  const front1 = shadowSpot(tung, 0, { angle: 0.32, penumbra: 0.6, size: q.shadowSize, far: 40, cast: q.shadows });
  front1.position.set(-5, H - 1.3, 12); front1.target.position.set(-0.5, DECK, 1.5);
  const front2 = shadowSpot(tung, 0, { angle: 0.32, penumbra: 0.6, size: q.shadowSize, far: 40, cast: q.shadows });
  front2.position.set(6, H - 1.3, 14); front2.target.position.set(0.5, DECK, 0.5);
  const washA = shadowSpot(0xffffff, 0, { angle: 0.6, penumbra: 1, cast: false });
  washA.position.set(0, OT + 1, -2); washA.target.position.set(0, DECK, 2);
  const backC = shadowSpot(0xffffff, 0, { angle: 0.7, penumbra: 1, cast: false });
  backC.position.set(0, OT + 0.8, -5); backC.target.position.set(0, DECK, 3);
  const followL = shadowSpot(KELVIN(5600), 0, { angle: 0.035, penumbra: 0.4, cast: false });
  for (const s of [front1, front2, washA, backC, followL]) { root.add(s); root.add(s.target); }
  const houseLights = [];
  for (const [x, z] of [[-6, 12], [6, 12], [-6, 24], [6, 24], [0, 32]]) {
    const l = new THREE.PointLight(KELVIN(2800), 0, 30, 2);
    l.position.set(x, H - 1, z); l.userData.offWhenDark = 'house'; root.add(l); houseLights.push(l);
  }
  const hemi = new THREE.HemisphereLight(0x1a1418, 0x080506, 0.12);
  root.add(hemi);
  // what the stage throws back into the house: a broad soft source in the
  // opening, coloured by the show
  const bounce = new THREE.RectAreaLight(0xffffff, 0, OW, OT - OB);
  bounce.position.set(0, (OT + OB) / 2, PZ + PT + 1.2); bounce.lookAt(0, (OT + OB) / 2, 30);
  root.add(bounce);
  // curtain warmers from the first bridge onto the valance and tabs
  const warmers = [];
  for (const side of [-1, 1]) {
    const w = shadowSpot(KELVIN(2900), 0, { angle: 0.5, penumbra: 1, cast: false });
    w.position.set(side * 4, H - 1.2, 11); w.target.position.set(side * 5, OT - 1.5, PZ + 0.5);
    root.add(w, w.target); warmers.push(w);
  }
  // little shaded lamps along the balcony fronts
  const lampFl = [];
  const lampMat = glowMat(KELVIN(2500), 3.5);
  for (const p of lampSpots) {
    const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 10, 1, true), lampMat);
    lp.position.copy(p); root.add(lp);
    lampFl.push(pipe.flares.add(lp.position, KELVIN(2500), 0.35, 0.5));
  }
  // grazers at the foot of the proscenium wall, up the walnut
  const grazers = [];
  for (const side of [-1, 1]) for (const x of [9.2, 11.6]) {
    const gz = shadowSpot(KELVIN(2700), 0, { angle: 0.5, penumbra: 1, cast: false });
    gz.position.set(side * x, 0.4, PZ + PT + 0.35); gz.target.position.set(side * x, 9, PZ + PT - 0.2);
    root.add(gz, gz.target); grazers.push(gz);
  }
  const wallWash = [];
  for (const side of [-1, 1]) for (const z of [12, 21]) {
    const l = new THREE.PointLight(KELVIN(2500), 0, 9, 2);
    l.position.set(side * (X - 3.3), 7.4, z); root.add(l); wallWash.push(l);
  }

  // haze points: the screen, the practicals, the followspot booth
  const hz = pipe.haze;
  const offs = [[-0.6, 0.4], [0.6, 0.4], [-0.6, -0.4], [0.6, -0.4], [0, 0]];
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * SW * 0.5, screen.position.y + dy * SH * 0.5, -5.8), 0xffffff, 0));
  ctx.screenHaze(screen, hzs, offs);
  screen.userData.hazePower = 26;
  const hzBooth = [-1, 1].map((s) => hz.add(V3(s * 3.5, 14.8, D - 1.3), KELVIN(5600), 0));
  const hzStage = hz.add(V3(0, DECK + 3, 1), tung, 0);

  let aimT = 0;
  return {
    root, eye, seatNear: seatFinder(spots, { below: 0.3 }),
    camera: { pos: eye, target: V3(0, 5.3, 0), fov: 54, near: 0.1, far: 120 },
    background: new THREE.Color(0),
    fog: new THREE.FogExp2(0x050304, 0.008),
    hazeDensity: 0.0014, beamGain: 0.3, hazeAmb: new THREE.Color(0x030202), hazeAmbDist: 90,
    bloom: { strength: 0.55, radius: 0.6, threshold: 1.1 },
    grade: { exposure: 1.25, vignette: 0.42, ca: 0.004, grain: 0.04, sat: 1.06, lift: [0.01, 0.006, 0.006] },
    env: { w: W, h: H, d: D, eye, wall: 0x1a0d08, floor: 0x0c0405, emitters: [
      { w: SW, h: SH, pos: V3(0, screen.position.y, -6), normal: V3(0, 0, 1), screen: true, power: 1.4, aspect },
      { w: 12, h: 3, pos: V3(0, DECK + 0.5, 1), normal: V3(0, 1, 0), color: tung, power: 3 },
    ] },
    envIntensity: 0.55,
    update(f) {
      const show = 1 - f.house;
      const { a, b, c, d } = f.pal;
      aimT += f.dt * (0.4 + f.energy * 0.6);
      const leadPos = V3(lead.position.x, DECK + 1.3, lead.position.z);
      front1.intensity = (170 + f.energy * 60) * show + 60 * f.house;
      front2.intensity = (140 + f.energy * 50) * show + 50 * f.house;
      washA.color.copy(a); washA.intensity = (120 + f.energy * 200 + f.kick * 80) * show;
      backC.color.copy(b); backC.intensity = (140 + f.energy * 220 + f.snare * 90) * show;
      followL.position.set(3.5, 14.8, D - 1.2); followL.target.position.copy(leadPos); followL.target.updateMatrixWorld();
      followL.intensity = 900 * show;
      booms.forEach((fx) => { fx.color.copy(tung); fx.intensity = 0.8 * show + 0.1 * f.house; });
      fohs.forEach((fx) => { fx.intensity = 0.9 * show + 0.15 * f.house; });
      backs.forEach((fx, i) => {
        const sw = Math.sin(aimT * 1.3 + i * 0.8);
        fx.color.copy(i % 2 ? b : a);
        rig.aim(fx, V3(-6.3 + i * 1.8 + sw * 2.2, DECK, 1.8 + Math.cos(aimT + i) * 1.5));
        fx.intensity = (0.25 + 0.55 * f.energy + (i % 2 ? f.snare : f.kick) * 0.4) * show;
      });
      sides.forEach((fx, i) => { fx.color.copy(i % 2 ? c : d); fx.intensity = (0.35 + 0.45 * f.energy) * show; });
      follows.forEach((fx) => { rig.aim(fx, leadPos); fx.intensity = 1.4 * show; });
      practicals.forEach((p, i) => { p.intensity = (0.45 + 0.1 * Math.sin(f.t * 2 + i)) * (0.6 + 0.4 * show); });
      houseLights.forEach((l) => { l.intensity = 420 * f.house; });
      bounce.color.copy(tung).lerp(a, 0.4).lerp(b, 0.2);
      bounce.intensity = (0.9 + f.energy * 0.6 + f.kick * 0.2) * show + 0.3 * f.house;
      // in the show only what lights the stage stays on (and the exit signs
      // and the aisles' step lights, brighter then): the curtain warmers, the
      // walls' washes and grazers, the balcony lamps go out with the house
      warmers.forEach((w) => { w.intensity = 120 * f.house; });
      wallWash.forEach((l) => { l.intensity = 26 * f.house; });
      grazers.forEach((g) => { g.intensity = 58 * f.house; });
      lampMat.color.copy(KELVIN(2500)).multiplyScalar(3.5 * f.house);
      lampFl.forEach((l) => { l.intensity = 0.35 * f.house; });
      hemi.intensity = 0.02 + 0.1 * f.house;
      steps.material.uniforms.uGain.value = 0.7 + 0.2 * f.house;
      // the concourses: lit with the house; in the show only while someone is in one
      conc.set(Math.max(f.house, conc.inside(f.cam) ? 1 : 0));
      ringTint(lipM.color, f.pal.a).multiplyScalar(0.25 + 0.3 * f.kick * show);
      hzBooth.forEach((h) => { h.power = 30 * show; });
      hzStage.power = (20 + f.energy * 20) * show + 6 * f.house;
      cu.uRimColor.value.copy(tung).lerp(a, 0.35).multiplyScalar(0.05 * show + 0.01);
      cu.uStage.value.set(0, 5, 0);
      cu.uWash.value.copy(tung).multiplyScalar(0.02 * show);
      cu.uAmb.value.setRGB(0.008, 0.006, 0.005).multiplyScalar(1 + f.house * 6);
    },
  };
}

// The concourses behind the three floors, and the ways between them.
//
// Behind each floor's last row a wall across the house with a door at each
// aisle, an exit sign over it; behind the 3rd floor's wall, a window for the
// followspots. Behind the walls the floors run back to the rear wall: the
// stalls' level floor, the balconies' back slabs (`levels`: their heights,
// fronts and the parts their slabs are merged with). At each back corner a
// pair of stairs: from the stalls' concourse up along the rear wall to the 2nd
// floor's, then back the other way, in front of it, to the 3rd's; the slab
// over each flight is cut away, a wall stands between the two flights and a
// rail round each well. Down each side, outside the side wall, a passage from
// the door at the front of the stalls, ramped up to the stalls' concourse.
function concourses(root, { X, D, H, CY1, CZW, levels, slabMat, wallMat, SIDE_DOOR, SIDE_OPEN }) {
  const [L2, L3] = levels;
  const box = (out, x0, x1, y0, y1, z0, z1) => {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); out.push(b);
  };
  const T = 0.25, DW = 1.6, DH = 2.3, DOORS = [-4.7, 4.7];
  // the stairs: A from the stalls' concourse to the 2nd floor, along the rear
  // wall; B from there to the 3rd, in front of it (x for the right-hand pair,
  // mirrored for the left)
  const AZ = [38.3, D - 0.05], BZ = [36.55, 38.15];
  const AX = [4.8, 12.0], BX = [5.6, 12.6];
  const flight = (out, side, xFrom, xTo, z0, z1, y0, y1) => {
    const n = Math.ceil((y1 - y0) / 0.18 - 1e-6), rise = (y1 - y0) / n, run = Math.abs(xTo - xFrom) / n, dir = Math.sign(xTo - xFrom);
    for (let i = 0; i < n; i++) {
      const xa = side * (xFrom + dir * i * run), xb = side * (xFrom + dir * (i + 1) * run);
      box(out, Math.min(xa, xb), Math.max(xa, xb), y0, y0 + rise * (i + 1), z0, z1);
    }
  };
  // a slab across the house from z0 to the rear wall, cut where `holes`
  // ([x0, x1, z0, z1] on the right, mirrored on the left) are
  const slab = (out, y0, y1, z0, holes) => {
    const xs = [-X + 0.1, X - 0.1];
    for (const [hx0, hx1] of holes) xs.push(-hx1, -hx0, hx0, hx1);
    xs.sort((a, b) => a - b);
    const zs = [z0, D];
    for (const [, , hz0, hz1] of holes) zs.push(hz0, hz1);
    zs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (holes.some(([hx0, hx1, hz0, hz1]) => Math.abs(cx) > hx0 && Math.abs(cx) < hx1 && cz > hz0 && cz < hz1)) continue;
      box(out, xs[i], xs[i + 1], y0, y1, zs[j], zs[j + 1]);
    }
  };
  slab(L2.parts, L2.y - 0.45, L2.y, L2.z, [[AX[0], AX[1], AZ[0], D]]);
  slab(L3.parts, L3.y - 0.45, L3.y, L3.z, [[BX[0], BX[1], BZ[0], BZ[1]]]);
  root.add(new THREE.Mesh(mergeGeometries(L2.parts), slabMat), new THREE.Mesh(mergeGeometries(L3.parts), slabMat));

  const walls = [], dark = [], stairs = [], rails = [], lit = [];
  // a wall across the house at z, from y0 to y1, a door at each aisle (and,
  // with `win`, a window from x -win[0]..win[0] between win[1] and win[2])
  const across = (z, y0, y1, win) => {
    const xs = [-X + 0.05];
    for (const x of DOORS) xs.push(x - DW / 2, x + DW / 2);
    xs.push(X - 0.05);
    for (let i = 0; i < xs.length - 1; i++) {
      if (i % 2 === 1) { box(walls, xs[i], xs[i + 1], y0 + DH, y1, z - T / 2, z + T / 2); continue; }   // over a door
      if (win && xs[i] < win[0] && xs[i + 1] > -win[0]) {
        const a = Math.max(xs[i], -win[0]), b = Math.min(xs[i + 1], win[0]);
        box(walls, xs[i], a, y0, y1, z - T / 2, z + T / 2); box(walls, b, xs[i + 1], y0, y1, z - T / 2, z + T / 2);
        box(walls, a, b, y0, win[1], z - T / 2, z + T / 2); box(walls, a, b, win[2], y1, z - T / 2, z + T / 2);
        continue;
      }
      box(walls, xs[i], xs[i + 1], y0, y1, z - T / 2, z + T / 2);
    }
    for (const x of DOORS) {
      // the frame, and the exit sign over it on both faces
      box(dark, x - DW / 2 - 0.08, x - DW / 2, y0, y0 + DH + 0.08, z - T / 2 - 0.02, z + T / 2 + 0.02);
      box(dark, x + DW / 2, x + DW / 2 + 0.08, y0, y0 + DH + 0.08, z - T / 2 - 0.02, z + T / 2 + 0.02);
      box(dark, x - DW / 2 - 0.08, x + DW / 2 + 0.08, y0 + DH, y0 + DH + 0.08, z - T / 2 - 0.02, z + T / 2 + 0.02);
      for (const f of [-1, 1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), glowMat(0x19c26a, 2.2));
        sign.position.set(x, y0 + DH + 0.32, z + f * (T / 2 + 0.01)); if (f < 0) sign.rotation.y = Math.PI; root.add(sign);
      }
    }
  };
  across(CZW, CY1, L2.y - 0.45);                       // the stalls'
  across(CZW, L2.y, L3.y - 0.45);                      // the 2nd floor's (under the 3rd floor's last tread)
  const zw3 = L3.z + 0.3;
  across(zw3, L3.y, H, [5.5, L3.y + 1.9, L3.y + 3.2]); // the 3rd floor's, the followspots' window in it

  for (const side of [-1, 1]) {
    const sx = (a, b) => [Math.min(side * a, side * b), Math.max(side * a, side * b)];
    flight(stairs, side, AX[0], AX[1], AZ[0], AZ[1], CY1, L2.y);
    flight(stairs, side, BX[1], BX[0], BZ[0], BZ[1], L2.y, L3.y);
    // between the two flights, on the 2nd floor, up to the 3rd floor's slab
    box(walls, ...sx(AX[0], AX[1]), L2.y, L3.y - 0.45, AZ[0] - 0.12, AZ[0] - 0.02);
    // rails round the wells: the 2nd floor's at A's foot, the 3rd's round B
    box(rails, ...sx(AX[0] - 0.06, AX[0]), L2.y, L2.y + 1.05, AZ[0], D);
    box(rails, ...sx(BX[0] + 0.3, BX[1]), L3.y, L3.y + 1.05, BZ[0] - 0.06, BZ[0]);
    box(rails, ...sx(BX[1], BX[1] + 0.06), L3.y, L3.y + 1.05, BZ[0], BZ[1]);
    box(rails, ...sx(BX[0] + 0.3, BX[1]), L3.y, L3.y + 1.05, BZ[1], BZ[1] + 0.06);
    // the side passage, outside the side wall: level from the front door, a
    // ramp up to the stalls' concourse, level along it; its outer wall, its
    // front end wall and its ceiling (the rear wall closes its back end)
    const x0 = side > 0 ? X : -X - 1.9, x1 = side > 0 ? X + 1.9 : -X;
    const zr0 = SIDE_DOOR[1] + 0.6, zr1 = SIDE_OPEN[0] - 0.3;
    // (its floor runs 0.2 m on through the wall's line, over the house's floors' edge)
    const [f0, f1] = sx(X - 0.2, X + 1.9);
    box(walls, f0, f1, -0.2, 0, SIDE_DOOR[0] - 0.4, zr0);
    box(walls, f0, f1, CY1 - 0.2, CY1, zr1, D);
    {
      const len = Math.hypot(zr1 - zr0, CY1), r = new THREE.BoxGeometry(x1 - x0, 0.2, len);
      r.rotateX(-Math.atan2(CY1, zr1 - zr0)); r.translate((x0 + x1) / 2, CY1 / 2 - 0.1, (zr0 + zr1) / 2); walls.push(r);
    }
    const xo = side > 0 ? x1 : x0;
    box(walls, ...sx(Math.abs(xo), Math.abs(xo) + T), -0.2, L2.y, SIDE_DOOR[0] - 0.4, D);
    box(walls, x0, x1, -0.2, L2.y, SIDE_DOOR[0] - 0.4 - T, SIDE_DOOR[0] - 0.4);
    box(walls, x0, x1, L2.y - 0.45, L2.y, SIDE_DOOR[0] - 0.4, D);
    // its lamps, down the outer wall
    for (let z = SIDE_DOOR[0] + 1; z < D - 1; z += 4) {
      const fy = z <= zr0 ? 0 : z >= zr1 ? CY1 : CY1 * (z - zr0) / (zr1 - zr0);
      box(lit, ...sx(Math.abs(xo) - 0.06, Math.abs(xo) - 0.02), fy + 2.4, fy + 2.7, z - 0.4, z + 0.4);
    }
  }
  // the concourses' ceiling lamps
  for (const [y, z0] of [[L2.y - 0.45, CZW], [L3.y - 0.45, CZW], [H, zw3]]) {
    for (const x of [-9, -3, 3, 9]) box(lit, x - 0.6, x + 0.6, y - 0.03, y, (z0 + D) / 2 - 0.3, (z0 + D) / 2 + 0.3);
  }
  const wm = new THREE.Mesh(mergeGeometries(walls), wallMat); wm.receiveShadow = true;
  root.add(wm);
  root.add(new THREE.Mesh(mergeGeometries(dark), std({ color: 0x0a0605, roughness: 0.6 })));
  const sm = new THREE.Mesh(mergeGeometries(stairs), slabMat); sm.receiveShadow = true;
  root.add(sm);
  root.add(new THREE.Mesh(mergeGeometries(rails), std({ color: 0x1a1210, roughness: 0.5, metalness: 0.4 })));
  const litM = std({ color: 0x1a1612, emissive: 0xc79a6a, emissiveIntensity: 0.6 });
  root.add(new THREE.Mesh(mergeGeometries(lit), litM));
  // a light down each floor's concourse, and the side passages
  const fills = [];
  for (const [y, z0] of [[0, CZW], [L2.y, CZW], [L3.y, L3.z + 0.3]]) {
    const l = new THREE.PointLight(0xffe2c0, 0, 22, 2); l.position.set(0, y + 2.4, (z0 + D) / 2); root.add(l); fills.push([l, 260]);
  }
  for (const side of [-1, 1]) for (const z of [12, 26]) {
    const l = new THREE.PointLight(0xffe2c0, 0, 14, 2); l.position.set(side * (X + 0.95), 2.4 + CY1 * (z - 7) / 26, z); root.add(l); fills.push([l, 90]);
  }
  return {
    set(k) { litM.emissiveIntensity = 0.6 * k; for (const [l, p] of fills) l.intensity = p * k; },
    // behind a floor's back wall, or out in a side passage
    inside: (c) => c.z > CZW + 0.15 || Math.abs(c.x) > X + 0.1,
  };
}
