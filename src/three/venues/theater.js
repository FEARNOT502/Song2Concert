// Theater — official Blue Square musical-hall plans (2025), technical sheet
// (2026), and operator interior photographs. See docs/THEATER_REMODEL.ko.md.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APP, KELVIN, V3, clamp, pbrSet, valueNoise, glowMat, prng, std, velvet, withRepeat, woodTex, ringTint } from '../core.js';
import { crowd3D, lightPoints } from '../people.js';
import { drapeGeometry, ledScreen, lineArray, mats, shadowSpot, stageSteps } from '../rig.js';
import { seatFinder } from '../stands.js';

import { getTheaterSeatCatalog } from './theater-seats.js';
import { theaterHouse } from './theater-house.js';
import {buildTheaterStage} from './theater-stage.js';
import {addTheaterSplayedWalls,theaterWallX} from './theater-walls.js';
import {buildTheaterCeiling,theaterCeilingY} from './theater-ceiling.js';
import {THEATER_GATES,THEATER_WALL_X,THEATER_WALL_THICKNESS,THEATER_REAR_Z,THEATER_SIDE_FRONT_DOOR,THEATER_SIDE_CONCOURSE_OPENING,theaterSideOpenings} from './theater-entries.js';

export { getTheaterSeatCatalog } from './theater-seats.js';

export function buildTheater(ctx) {
  const { pipe, q, cu } = ctx;
  const root = new THREE.Group();
  const W = 2*THEATER_WALL_X, D = 43, H = 22.137, X = W / 2;
  const PZ = 4.0, PT = 0.7;            // proscenium wall: audience face at PZ + PT
  const OW = 14.9, OB = 0.93, OT = 10.93; // opening width, sill (deck), head
  const DECK = 0.93;
  const concert=ctx.mode==='op';
  const APRON = 5.9;                    // stage edge
  const PIT0 = APRON, PIT1 = 8.9;
  const catalog = getTheaterSeatCatalog(ctx.mode);
  const home = catalog.defaultSeat;
  const eye = V3(home.x, home.y + 1.2, home.z);
  const tung = KELVIN(3200);

  // ── materials ──
  const walnut = woodTex({ key: 'bsq-wood-v2', planks: 8, joints: 1, base: [0.41, 0.35, 0.27], tone: 0.025, grain: 0.045, rough: 0.9, seam:.82, seed: 12 });
  const wallMat = std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), normalScale:new THREE.Vector2(.15,.15), roughness: 1 });
  const black = std({ color: 0x050506, roughness: 0.9 });
  const fiber=valueNoise(204);
  const carpetSet=pbrSet('bsq-heather-carpet',256,(u,v)=>{
    const n=fiber(u*128,v*128,128),weave=.94+.1*n;
    return [.43*weave,.405*weave,.35*weave,n*.16,.98];
  },{normal:.45});
  const carpet = std({ ...withRepeat(carpetSet, 2, 2), roughness: 1 });
  const seatVel = velvet(0x194c9b, 'seatblue');

  // ── the house ──
  // The floor has a real opening; only OP mode installs the pit cover.
  const outline = new THREE.Shape();
  outline.moveTo(-X,PZ+PT);outline.lineTo(X,PZ+PT);outline.lineTo(X,D);outline.lineTo(-X,D);outline.closePath();
  const pit = new THREE.Path();pit.moveTo(-7.8,PIT0);pit.lineTo(-7.8,PIT1);pit.lineTo(7.8,PIT1);pit.lineTo(7.8,PIT0);pit.closePath();outline.holes.push(pit);
  const floorGeo=new THREE.ShapeGeometry(outline);floorGeo.rotateX(Math.PI/2);
  // Shape y becomes world z with +pi/2; reverse the face to point up.
  const floorMat=carpet.clone();floorMat.side=THREE.DoubleSide;
  const floor = new THREE.Mesh(floorGeo,floorMat);
  floor.position.y=-.015;floor.receiveShadow=true;root.add(floor);
  // the levels behind the seats (see concourses below): the floor of the
  // stalls' wheelchair places, and where the stalls' and the 2nd floor's walls
  // with their doors stand; the side walls' door and opening onto the passages
  const CY1 = 2.882;
  const CZW = THEATER_REAR_Z[1];
  const SIDE_DOOR = THEATER_SIDE_FRONT_DOOR, SIDE_OPEN = THEATER_SIDE_CONCOURSE_OPENING;
  for (const side of [-1, 1]) {
    // the side walls, with a door at the front of the stalls and the opening
    // from the side passage onto the stalls' concourse
    const ws = new THREE.Shape();
    ws.moveTo(PZ, 0); ws.lineTo(D, 0); ws.lineTo(D, H); ws.lineTo(PZ, H); ws.lineTo(PZ, 0);
    for (const [z0, z1, y0, y1] of theaterSideOpenings(side)) {
      const h = new THREE.Path(); h.moveTo(z0, y0); h.lineTo(z1, y0); h.lineTo(z1, y1); h.lineTo(z0, y1); h.lineTo(z0, y0); ws.holes.push(h);
    }
    const wg = new THREE.ExtrudeGeometry(ws,{depth:THEATER_WALL_THICKNESS,bevelEnabled:false});
    const P = wg.attributes.position;
    for (let i = 0; i < P.count; i++) { const u = P.getX(i), v = P.getY(i), w=P.getZ(i); P.setXYZ(i, side*(X+w), v, u); }
    wg.computeVertexNormals();
    const wall = new THREE.Mesh(wg, std({ ...withRepeat(walnut, 1 / 1.2, 1 / 4), normalScale:new THREE.Vector2(.15,.15), roughness: 1, side: THREE.DoubleSide }));
    wall.receiveShadow = true;
    root.add(wall);

  }
  addTheaterSplayedWalls(root,{height:H,material:wallMat,front:PZ+PT});
  const ceiling=buildTheaterCeiling(root,{X});
  const backW = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); backW.rotation.y = Math.PI; backW.position.set(0, H / 2, D); root.add(backW);

  // ── proscenium wall with the opening ──
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-X, 0); wallShape.lineTo(X, 0); wallShape.lineTo(X, H); wallShape.lineTo(-X, H); wallShape.lineTo(-X, 0);
  const hole = new THREE.Path();
  // Recess the concealed wall sill so its timber top cannot fight the deck.
  const sill=DECK-.08;
  hole.moveTo(-OW / 2, sill); hole.lineTo(OW / 2, sill); hole.lineTo(OW / 2, OT); hole.lineTo(-OW / 2, OT); hole.lineTo(-OW / 2, sill);
  wallShape.holes.push(hole);
  const pros = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: PT, bevelEnabled: false }), wallMat);
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
  const houseVel = velvet(0x08090b, 'housecurtain');
  const valance = new THREE.Mesh(drapeGeometry(OW + 0.4, 1.7, 34, 0.12), houseVel);
  valance.position.set(0, OT - 0.85, PZ + 0.35); root.add(valance);
  for (const side of [-1, 1]) {
    const tab = new THREE.Mesh(drapeGeometry(1.5, OT - OB, 9, 0.16), houseVel);
    tab.position.set(side * (OW / 2 - 0.55), (OT + OB) / 2, PZ + 0.3); root.add(tab);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), std({ color: 0x8a6a2a, metalness: 0.8, roughness: 0.35 }));
    tie.rotation.x = Math.PI / 2; tie.position.set(side * (OW / 2 - 0.55), 4.2, PZ + 0.3); root.add(tie);
  }

  // ── stage house ──
  const {deck,lipPath}=buildTheaterStage({openingWidth:OW,height:DECK,front:APRON,portalFront:PZ+PT,mainFront:PZ});
  root.add(deck);
  // side steps from the house floor up to the apron, either side of the pit
  for (const s of [-1, 1]) {
    root.add(stageSteps({ x: s * 8.4, z: 8.45, h: DECK, dir: [0, -1], width: 1.1 }));
  }
  const lipM = glowMat(APP.accent, 0.35);
  const lip=new THREE.Mesh(new THREE.TubeGeometry(lipPath,64,.012,4,false),lipM);
  lip.name='Theater apron edge strip';root.add(lip);
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
    col.position.set(side * (theaterWallX(PZ+PT+.5)-.48), OT - 0.4, PZ + PT + 0.5); col.rotation.y = -side * 0.25; root.add(col);
  }

  // Exact plan-derived chairs and section-derived heights, shared with picker.
  const { spots, levels, stepPts, lampSpots } = theaterHouse(root, {mode:ctx.mode,carpet,wood:wallMat,fabric:seatVel,X,D});
  const people=[], rnd=prng(23);
  for(const s of spots) {
    if(s.kind==='wheelchair'||s.kind==='family')continue;
    if(Math.abs(s.z-eye.z)<.6&&Math.abs(s.x-eye.x)<.6)continue;
    if(rnd()<.86)people.push({...s,y:s.y+.02,z:s.z-.05,turn:s.yaw,h:.93+rnd()*.12});
  }
  const slabMat=carpet;
  const conc = concourses(root,{X,D,H,CY1,CZW,levels,slabMat,wallMat,SIDE_DOOR,SIDE_OPEN});
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
    pipeM.position.set(side * (theaterWallX(9.6)-.2), 7, 9.6); root.add(pipeM);
    for (let i = 0; i < 5; i++) {
      const f = rig.add({ kind: 'profile', pos: V3(side * (theaterWallX(9.6)-.38), 4 + i * 1.4, 9.6), color: KELVIN(3400), length: 24, scale: 0.7, beamGain: 0.06, flareGain: 0.6 });
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
  // Both visible fixtures and their real light are mounted on the audience-
  // facing side of the 3F fence, using the balcony's actual fan profile.
  const follows = [],followBrackets=[],front3=levels[1].balcony;
  for (const side of [-1, 1]) {
    const x=side*3.5,z=front3.frontZ(x),y=front3.railY;
    const bracket=new THREE.BoxGeometry(.44,.07,.5);bracket.translate(x,y+.035,z-.17);followBrackets.push(bracket);
    const f = rig.add({ kind: 'follow', pos: V3(x,y+.075,z-.30), color: KELVIN(5600), length: 44, scale:.8, beamGain:.35, flareGain:.6, body:true,soft:.2 });
    const light=shadowSpot(KELVIN(5600),0,{angle:.035,penumbra:.4,cast:false});
    light.name='Theater fence followspot';rig.light(f,light,320);
    follows.push(f);
  }
  const mounts=new THREE.Mesh(mergeGeometries(followBrackets),std({color:0x1c1b19,roughness:.7,metalness:.5}));
  mounts.name='Theater 3F fence followspot brackets';root.add(mounts);followBrackets.forEach(g=>g.dispose());
  // FOH front light from the ceiling bridges (above frame; their beams cross it)
  const fohs = [];
  for (const position of ceiling.rigPoints) {
    const f = rig.add({ kind: 'profile', pos: position, color: KELVIN(3200), length: 26, scale: 0.7, beamGain: 0.02, flareGain: 0.4 });
    rig.aim(f, V3(position.x*.6, DECK + 1.3, 1.5));
    fohs.push(f);
  }

  // real light: two shadowed front lights, a colour wash, a backlight, the pit
  const front1 = shadowSpot(tung, 0, { angle: 0.32, penumbra: 0.6, size: q.shadowSize, far: 40, cast: q.shadows });
  front1.position.set(-5, theaterCeilingY(12)-.4, 12); front1.target.position.set(-0.5, DECK, 1.5);
  const front2 = shadowSpot(tung, 0, { angle: 0.32, penumbra: 0.6, size: q.shadowSize, far: 40, cast: q.shadows });
  front2.position.set(6, theaterCeilingY(14)-.4, 14); front2.target.position.set(0.5, DECK, 0.5);
  const washA = shadowSpot(0xffffff, 0, { angle: 0.6, penumbra: 1, cast: false });
  washA.name='Theater concert wash';
  washA.position.set(0, OT + 1, -2); washA.target.position.set(0, DECK, 2);
  const backC = shadowSpot(0xffffff, 0, { angle: 0.7, penumbra: 1, cast: false });
  backC.position.set(0, OT + 0.8, -5); backC.target.position.set(0, DECK, 3);
  for (const s of [front1, front2, washA, backC]) { root.add(s); root.add(s.target); }
  const houseLights = [];
  for (const [x, z] of [[-6, 12], [6, 12], [-6, 24], [6, 24], [0, 32]]) {
    const l = new THREE.SpotLight(KELVIN(3000), 0, 30, 1.05, .7, 2);
    l.position.set(x, theaterCeilingY(z)-.08, z);l.target.position.set(x,0,z);
    l.userData.offWhenDark = 'house'; root.add(l,l.target); houseLights.push(l);
  }
  // Warm recessed downlights below both balconies, visible in the official photos.
  for(const [y,z] of [[5.65,27.5],[11.8,32.3]])for(const x of [-8,0,8]) {
    const l=new THREE.SpotLight(KELVIN(3000),0,16,1.05,.7,2);l.position.set(x,y,z);l.target.position.set(x,y-5,z);l.userData.offWhenDark='house';root.add(l,l.target);houseLights.push(l);
  }
  const hemi = new THREE.HemisphereLight(0xd9d4c4, 0x302a22, 0.3);
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
    w.position.set(side * 4, theaterCeilingY(11)-.4, 11); w.target.position.set(side * 5, OT - 1.5, PZ + 0.5);
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

  // Haze sources for the screen and stage. Followspots use the Rig's actual
  // lens beam and flare; no separate glowing point is left in the rear seats.
  const hz = pipe.haze;
  const offs = [[-0.6, 0.4], [0.6, 0.4], [-0.6, -0.4], [0.6, -0.4], [0, 0]];
  const hzs = offs.map(([dx, dy]) => hz.add(V3(dx * SW * 0.5, screen.position.y + dy * SH * 0.5, -5.8), 0xffffff, 0));
  ctx.screenHaze(screen, hzs, offs);
  screen.userData.hazePower = 26;
  const hzStage = hz.add(V3(0, DECK + 3, 1), tung, 0);

  let aimT = 0;
  return {
    root, eye, stageTarget: V3(0, DECK + 2.3, -1), seatNear: seatFinder(spots, { below: 0.3 }),
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
      const energy=clamp(f.energy??0),live=concert?show:0;
      aimT += f.dt * (0.4 + energy * 0.6);
      const leadPos = V3(lead.position.x, DECK + 1.3, lead.position.z);
      // OPEN PIT keeps the restrained musical look. OP SEATING enables the
      // existing stage rig as a music-driven concert, with a dark auditorium.
      front1.color.copy(tung).lerp(a,.45*live);front1.intensity=60*f.house+120*live;
      front2.color.copy(tung).lerp(b,.45*live);front2.intensity=50*f.house+90*live;
      washA.color.copy(a);washA.intensity=(150+600*energy)*live;
      backC.color.copy(b);backC.intensity=(150+450*energy)*live;
      booms.forEach((fx) => { fx.color.copy(tung).lerp(c,.5*live);fx.intensity=.1*f.house+(.25+.65*energy)*live; });
      fohs.forEach((fx) => {fx.color.copy(tung).lerp(d,.3*live);fx.intensity=.15*f.house+(.2+.5*energy)*live;});
      backs.forEach((fx, i) => {
        const sw = Math.sin(aimT * 1.3 + i * 0.8);
        fx.color.copy(i % 2 ? b : a);
        rig.aim(fx, V3(-6.3 + i * 1.8 + sw * 2.2, DECK, 1.8 + Math.cos(aimT + i) * 1.5));
        fx.intensity=(.55+energy)*(.8+.2*Math.sin(aimT*3+i)**2)*live;
      });
      sides.forEach((fx, i) => { fx.color.copy(i % 2 ? c : d);fx.intensity=(.35+.7*energy)*live; });
      follows.forEach((fx) => { rig.aim(fx, leadPos);fx.intensity=(concert?.5:1.4)*show; });
      practicals.forEach((p, i) => { p.intensity=(.45+.1*Math.sin(f.t*2+i))*(.6*f.house+(.25+.35*energy)*live); });
      practical.color.copy(KELVIN(2600)).multiplyScalar(6*f.house+3*live);
      houseLights.forEach((l) => { l.intensity = 420 * f.house; });
      bounce.color.copy(tung).lerp(a, 0.4).lerp(b, 0.2);
      bounce.intensity = 0.3 * f.house;
      // in the show only what lights the stage stays on (and the exit signs
      // and the aisles' step lights, brighter then): the curtain warmers, the
      // walls' washes and grazers, the balcony lamps go out with the house
      warmers.forEach((w) => { w.intensity = 120 * f.house; });
      wallWash.forEach((l) => { l.intensity = 26 * f.house; });
      grazers.forEach((g) => { g.intensity = 58 * f.house; });
      lampMat.color.copy(KELVIN(2500)).multiplyScalar(3.5 * f.house);
      lampFl.forEach((l) => { l.intensity = 0.35 * f.house; });
      ceiling.setHouse(f.house);
      hemi.intensity = 0.025 + 0.3 * f.house;
      steps.material.uniforms.uGain.value = 0.7 + 0.2 * f.house;
      // the concourses: lit with the house; in the show only while someone is in one
      conc.set(Math.max(f.house, conc.inside(f.cam) ? 1 : 0));
      ringTint(lipM.color, f.pal.a).multiplyScalar(0.25 * f.house);
      hzStage.power = 6 * f.house;
      cu.uRimColor.value.copy(tung).lerp(a, 0.35).multiplyScalar(0.02*show+0.01+.04*energy*live);
      cu.uStage.value.set(0, 5, 0);
      cu.uWash.value.copy(tung).lerp(b,.6*live).multiplyScalar(.02*show+.04*energy*live);
      cu.uAmb.value.setRGB(0.008, 0.006, 0.005).multiplyScalar(1 + f.house * 6);
    },
  };
}

// The concourses behind the three floors, and the ways between them.
//
// Behind each floor's last row a wall across the house with a door at each
// aisle, an exit sign over it; behind the 3rd floor's wall, a window for the
// followspots. Behind the walls the floors run back to the rear wall: the
// stalls' level floor and the balconies' back slabs. Each rear corner has
// a switchback stair per storey, with a turning landing and a cut upper slab.
// The transverse concourse stays clear in front of those flights. Side
// passages meet all measured public openings at a continuous threshold.
function concourses(root, { X, D, H, CY1, CZW, levels, slabMat, wallMat, SIDE_DOOR, SIDE_OPEN }) {
  const [L2, L3] = levels;
  const box = (out, x0, x1, y0, y1, z0, z1) => {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); out.push(b);
  };
  const rear=THEATER_GATES.filter(g=>g.floor===1&&g.plane==='rear');
  const T=.25,DW=rear[0].width,DH=2.3,DOORS=rear.map(g=>g.x);
  // First and returning flights; mirrored at the two rear corners.
  const AZ=[39.0,40.4],BZ=[41.1,42.5];
  const AX=[6.4,12.0],BX=[5.4,6.4];
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
    const xs = [-X, X];
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
  slab(L2.parts, L2.y - 0.45, L2.y, L2.z, [[AX[0], AX[1], BZ[0], BZ[1]]]);
  slab(L3.parts, L3.y - 0.45, L3.y, L3.z, [[AX[0], AX[1], BZ[0], BZ[1]]]);
  root.add(new THREE.Mesh(mergeGeometries(L2.parts), slabMat), new THREE.Mesh(mergeGeometries(L3.parts), slabMat));

  const walls = [], dark = [], stairs = [], rails = [], lit = [];
  // a wall across the house at z, from y0 to y1, a door at each aisle (and,
  // with `win`, a window from x -win[0]..win[0] between win[1] and win[2])
  const across = (z, y0, y1, win) => {
    const xs = [-X];
    for (const x of DOORS) xs.push(x - DW / 2, x + DW / 2);
    xs.push(X);
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
  across(CZW, CY1, L2.y - 0.45, [2.7,CY1+.7,CY1+1.8]); // ground-floor control booth
  across(THEATER_REAR_Z[2], L2.y, L3.y - 0.45);                      // the 2nd floor's (under the 3rd floor's last tread)
  const zw3 = L3.z + 0.3;
  across(zw3, L3.y, H); // User-requested solid rear wall; retain the two doors.

  for (const side of [-1, 1]) {
    const sx = (a, b) => [Math.min(side * a, side * b), Math.max(side * a, side * b)];
    // Two ordinary flights with a turning landing per storey. Keeping them
    // behind z=39 preserves the clear cross-concourse in front of the stairs.
    for(const [from,to] of [[CY1,L2.y],[L2.y,L3.y]]) {
      const mid=(from+to)/2;
      flight(stairs,side,AX[1],AX[0],AZ[0],AZ[1],from,mid);
      box(stairs,...sx(BX[0],BX[1]),mid-.22,mid,AZ[0],BZ[1]);
      flight(stairs,side,AX[0],AX[1],BZ[0],BZ[1],mid,to);
      box(rails,...sx(BX[0]-.04,BX[0]),mid,mid+1.05,AZ[0],BZ[1]);
      for(const z of [AZ[0],BZ[1]])box(rails,...sx(BX[0],BX[1]),mid,mid+1.05,z-.025,z+.025);
      for(const z of [BZ[0]-.04,BZ[1]])box(rails,...sx(AX[0],AX[1]-.45),to,to+1.05,z,z+.04);
      box(rails,...sx(AX[0]-.04,AX[0]),to,to+1.05,BZ[0],BZ[1]);
    }
    // the side passage, outside the side wall: level from the front door, a
    // ramp up to the stalls' concourse, level along it; its outer wall, its
    // front end wall and its ceiling (the rear wall closes its back end)
    const x0 = side > 0 ? X : -X - 1.9, x1 = side > 0 ? X + 1.9 : -X;
    const [f0,f1]=sx(X-.2,X+1.9);
    const deck=(z0,z1,y0,y1)=>{
      if(y0===y1){box(stairs,f0,f1,y0-.22,y0,z0,z1);return;}
      const g=new THREE.BoxGeometry(f1-f0,.22,Math.hypot(z1-z0,y1-y0));
      g.rotateX(-Math.atan2(y1-y0,z1-z0));g.translate((f0+f1)/2,(y0+y1)/2-.11,(z0+z1)/2);stairs.push(g);
    };
    deck(SIDE_DOOR[0]-.4,6.6,0,0);deck(6.6,15,0,.535);deck(15,17.1,.535,.535);
    deck(17.1,29.5,.535,CY1);deck(29.5,D,CY1,CY1);
    deck(27.6,29.8,8.021,8.021);deck(29.8,THEATER_REAR_Z[2],8.021,L2.y);deck(THEATER_REAR_Z[2],D,L2.y,L2.y);
    deck(27.9,30,13.571,13.571);deck(30,36.4,13.571,L3.y);deck(36.4,D,L3.y,L3.y);
    for(const [z,y] of [[27.6,8.021],[27.9,13.571]])box(walls,x0,x1,y,y+2.7,z-.12,z);
    const xo = side > 0 ? x1 : x0;
    box(walls, ...sx(Math.abs(xo), Math.abs(xo) + T), -0.2, H, SIDE_DOOR[0] - 0.4, D);
    box(walls, x0, x1, -0.2, H, SIDE_DOOR[0] - 0.4 - T, SIDE_DOOR[0] - 0.4);
    box(walls,x0,x1,L2.y-.45,L2.y,SIDE_DOOR[0]-.4,27.6);
    // its lamps, down the outer wall
    for (let z = SIDE_DOOR[0] + 1; z < D - 1; z += 4) {
      const fy=z<=6.6?0:z<15?.535*(z-6.6)/8.4:z<17.1?.535:z<29.5?.535+(CY1-.535)*(z-17.1)/12.4:CY1;
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
  for (const [y, z0] of [[CY1, CZW], [L2.y, THEATER_REAR_Z[2]], [L3.y, L3.z + 0.3]]) {
    const l = new THREE.PointLight(0xffe2c0, 0, 22, 2); l.position.set(0, y + 2.4, (z0 + D) / 2); root.add(l); fills.push([l, 260]);
  }
  for (const side of [-1, 1]) for (const z of [12, 26]) {
    const l = new THREE.PointLight(0xffe2c0, 0, 14, 2); l.position.set(side * (X + 0.95), 2.4 + CY1 * (z - 7) / 26, z); root.add(l); fills.push([l, 90]);
  }
  return {
    set(k) { litM.emissiveIntensity = 0.6 * k; for (const [l, p] of fills) l.intensity = p * k; },
    // behind a floor's back wall, or out in a side passage
    inside: (c) => c.z > (c.y>12?zw3:c.y>5?THEATER_REAR_Z[2]:CZW)+.15 || Math.abs(c.x)>X+.1,
  };
}
