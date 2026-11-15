// Geometry, official-chart and actual Rig matrix/light checks. Canvas drawing
// and GPU beam rendering are stubbed; this does not inspect WebGL pixels.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { buildTheater } from '../src/three/venues/theater.js';
import { getTheaterSeatCatalog } from '../src/three/venues/theater-seats.js';
import { crowdUniforms } from '../src/three/people.js';
import { collisionGeometry, Walker, WALK } from '../src/three/walk.js';
import {THEATER_GATES,THEATER_WALL_X,theaterGatePath} from '../src/three/venues/theater-entries.js';
import {theaterCeilingY} from '../src/three/venues/theater-ceiling.js';
import {theaterRowZ} from '../src/three/venues/theater-balcony.js';
import {Rig} from '../src/three/rig.js';
import {THEATER_SPLAY,THEATER_SPLAY_SLOPE,theaterWallX} from '../src/three/venues/theater-walls.js';

globalThis.document = {createElement:()=>({width:1024,height:512,getContext:()=>({
  fillRect(){},fillText(){},createRadialGradient:()=>({addColorStop(){}}),
})})};
for(const mode of ['general','op']) {
  const cat=getTheaterSeatCatalog(mode);
  const expected=mode==='op'?[1066,430,270]:[990,430,270];
  assert.deepEqual([1,2,3].map(f=>cat.seats.filter(s=>s.floor===f).length),expected);
  assert.equal(new Set(cat.seats.map(s=>`${s.floor}:${s.row}:${s.num}`)).size,cat.seats.length);
  assert.equal(cat.seats.filter(s=>s.kind==='wheelchair').length,18);
  assert.equal(cat.seats.filter(s=>s.kind==='family').length,14);
  assert.equal(cat.seats.filter(s=>s.kind==='op').length,mode==='op'?76:0);
  // The published numbered charts have holes. Do not fill them with phantom seats.
  assert.equal(cat.getSeat('1F',1,1),null);
  assert.equal(cat.getSeat('1F',1,33),null);
  assert.equal(cat.getSeat('2F',7,29),null);
  assert.equal(cat.getSeat('3F',3,2),null);
  assert.equal(cat.getSeat('3F',6,31),null);
  assert(cat.getSeat('3F',6,30));
  for(const s of cat.seats) {
    assert.deepEqual(cat.getSeat(s.block,s.row,s.num),s);
    assert(cat.getRows(s.block).includes(s.row));
    assert(cat.getNums(s.block,s.row).includes(s.num));
    for(const v of [s.x,s.y,s.z,s.yaw])assert(Number.isFinite(v));
  }
  const rigs=[],hazeSources=[];
  const pipe={
    beams:{add:o=>({...o,pos:o.pos.clone(),dir:o.dir.clone(),color:o.color.clone()})},
    haze:{add:(pos,color,power=0)=>{const h={pos:pos.clone(),color:new THREE.Color(color),power};hazeSources.push(h);return h;}},
    flares:{add:(pos,color,size=1,intensity=0)=>({pos:pos.clone(),color:new THREE.Color(color),size,intensity})},
  };
  const ctx={mode,q:{crowd:0},cu:crowdUniforms(),
    pipe,
    art:{texture:()=>new THREE.Texture()},addScreen(){},screenHaze(){},
    rig:opts=>{const rig=new Rig(pipe,opts);rigs.push(rig);return rig;}};
  const venue=buildTheater(ctx);
  for(const rig of rigs)venue.root.add(rig.build());
  venue.root.traverse(o=>{
    if(!o.isMesh)return;
    assert(o.geometry,'every visible mesh has geometry');
    for(const n of o.geometry.attributes.position.array)assert(Number.isFinite(n));
  });
  const geo=collisionGeometry(venue.root),bvh=new MeshBVH(geo),ray=new THREE.Ray();
  // At the former deck/apron overlap, portal sill and side bridge seams there
  // must be exactly one opaque top mesh at +0.93 m, not coplanar layers.
  const topRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,.22);
  const stage=venue.root.getObjectByName('Theater continuous stage deck');assert(stage);
  const edge=venue.root.getObjectByName('Theater apron edge strip').geometry.parameters.path;
  assert(edge.curves[0].getPoint(1).distanceTo(edge.curves[1].getPoint(0))<1e-7,'apron edge follows a continuous curve without a cross-stage jump');
  for(const [x,z] of [
    ...[-6.2,-.3,6.1].flatMap(x=>[3.79,3.91,4.13,4.51,4.77,5.1].map(z=>[x,z])),
    ...[-1,1].flatMap(side=>[[side*8.1,5.2],[side*8.05,6.8],[side*8.4,6.95]]),
  ]) {
    topRay.ray.origin.set(x,1.04,z);
    const layers=new Set(topRay.intersectObject(venue.root,true).filter(h=>h.object.isMesh&&!h.object.isInstancedMesh&&Math.abs(h.point.y-.93)<.002&&Math.abs(h.face.normal.y)>.9).map(h=>h.object));
    assert.equal(layers.size,1,`one stage top at ${x},${z}`);assert(layers.has(stage));
  }
  const gaps=[];
  for(const s of cat.seats)for(const offset of [0,.12]) {
    const x=s.x-Math.sin(s.yaw)*offset,z=s.z-Math.cos(s.yaw)*offset;
    ray.origin.set(x,s.y+.08,z);ray.direction.set(0,-1,0);
    const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.23);
    if(!hit||Math.abs(hit.point.y-s.y)>.04)gaps.push(`${s.floor}F/${s.row}/${s.num} at offset ${offset}`);
  }
  assert.deepEqual(gaps,[],'all seat origins and seated camera positions stand on their own floor');
  // The observed wall is the diagonal inner face, not the rectangular outside
  // enclosure. Check physical intersections below the projecting FOH cases.
  for(const side of [-1,1])for(const z of [7.1,9.6,12,14.8]) {
    ray.origin.set(0,1.37,z);ray.direction.set(side,0,0);
    const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,15);
    assert(hit&&Math.abs(Math.abs(hit.point.x)-theaterWallX(z))<.02,'splayed inner wall follows the operator plan');
  }
  const regular=cat.seats.filter(s=>s.kind!=='wheelchair'),chairs=venue.root.getObjectByName('Theater seats');
  let aisle=Infinity;
  const matrix=new THREE.Matrix4(),vertex=new THREE.Vector3();
  for(const row of ['OP 1','OP 2','OP 3',1,2,3,4,5,6])for(const side of [-1,1]) {
    const s=regular.filter(s=>s.floor===1&&s.row===row&&side*s.x>0).sort((a,b)=>side*(b.x-a.x))[0];
    if(!s)continue;
    const index=regular.indexOf(s);
    for(const mesh of chairs.children) {
      mesh.getMatrixAt(index,matrix);
      const facing=new THREE.Vector3(0,0,1).transformDirection(matrix);
      assert(facing.dot(new THREE.Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw)))>.99999,'chair and occupant face the plan-derived row angle');
      const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++) {
        vertex.fromBufferAttribute(p,i).applyMatrix4(matrix);
        if(vertex.z<THEATER_SPLAY.frontZ||vertex.z>THEATER_SPLAY.backZ)continue;
        aisle=Math.min(aisle,(theaterWallX(vertex.z)-Math.abs(vertex.x))/Math.hypot(1,THEATER_SPLAY_SLOPE));
      }
    }
  }
  assert(aisle>.85,`clear outer aisle beside actual chair geometry: ${aisle.toFixed(3)} m`);
  const walkRoute=(points,label)=>{
    const walker=Object.create(Walker.prototype);walker.bvh=bvh;walker.ray=new THREE.Ray();walker.eyeH=WALK.eye;
    const [x,y,z]=points[0],ground=walker.ground(x,z,y+.9);assert(ground!==null);
    walker.feet=new THREE.Vector3(x,ground,z);walker.gy=ground;
    for(const target of points.slice(1)) {
      const start=walker.feet.clone(),n=Math.ceil(Math.hypot(target[0]-start.x,target[2]-start.z)/.10);
      for(let i=1;i<=n;i++) {
        const x=start.x+(target[0]-start.x)*i/n,z=start.z+(target[2]-start.z)*i/n,dx=x-walker.feet.x,dz=z-walker.feet.z;
        const move=new THREE.Vector3(dx,0,dz);walker.slide(move);
        assert(Math.hypot(move.x-dx,move.z-dz)<.005,`${label} wall at ${x.toFixed(2)},${z.toFixed(2)}`);
        assert(walker.canStand(dx,dz),`${label} floor/headroom at ${x.toFixed(2)},${z.toFixed(2)}`);
        const gy=walker.ground(x,z,walker.gy+WALK.climb);assert(gy!==null);walker.feet.set(x,gy,z);walker.gy=gy;
      }
    }
    assert(Math.abs(walker.gy-points.at(-1)[1])<.035,`${label} destination floor`);
  };
  for(const side of [-1,1]) {
    const path=[];
    for(let z=9.9;z<14.9;z+=.35)path.push([side*(theaterWallX(z)-.55/Math.hypot(1,THEATER_SPLAY_SLOPE)),0,z+.55*THEATER_SPLAY_SLOPE/Math.hypot(1,THEATER_SPLAY_SLOPE)]);
    path.push([side*13,.535,16.0526],[side*(THEATER_WALL_X+.5),.535,16.0526]);
    // Reverse direction starts at the entry threshold rather than y=0.
    for(const points of [path,[...path].reverse()])walkRoute(points,`splayed aisle ${side}`);
    const steps=[[side*8.4,0,8.85],[side*8.4,.93,7.18],[side*8.2,.93,6.75],[side*7.7,.93,6],[side*7,.93,5.3],[0,.93,5],[0,.93,3.5]];
    for(const points of [steps,[...steps].reverse()])walkRoute(points,`stage access ${side}`);
  }
  // Sweep the former fan-shaped holes behind both balconies, including the
  // rear slab joint and the narrow edge against each side wall.
  for(const floor of [2,3]) {
    const row=Math.max(...cat.getRows(`${floor}F`).filter(Number.isFinite));
    const seats=cat.seats.filter(s=>s.floor===floor&&s.row===row&&s.kind==='standard');
    const central=seats.filter(s=>Math.abs(s.x)<4.9),z=central.reduce((a,s)=>a+s.z,0)/central.length,y=seats[0].y;
    const last={z,y,seats};
    const xs=[-THEATER_WALL_X+.025,THEATER_WALL_X-.025];
    for(let x=-14;x<=14;x+=.28)xs.push(x);
    for(const x of xs) {
      const zs=[z+.78,z+.82,z+.9];
      for(let rear=theaterRowZ(last,x)+.84;rear<z+.91;rear+=.22)zs.push(rear);
      for(const rear of zs) {
        // Stay below the nearby horizontal wall battens, which are finishes
        // above the floor rather than the floor/wall joint being inspected.
        ray.origin.set(x,y+.025,rear);ray.direction.set(0,-1,0);
        const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.06);
        assert(hit&&Math.abs(hit.point.y-y)<.015,`${floor}F rear floor reaches the walls at ${x.toFixed(2)},${rear.toFixed(2)}: ${JSON.stringify(hit?.point)}`);
      }
    }
  }
  const rear3=cat.seats.filter(s=>s.floor===3&&s.row===6&&Math.abs(s.x)<4.9);
  const rear3Z=rear3.reduce((a,s)=>a+s.z,0)/rear3.length;
  for(const x of [-3.5,0,3.5]) {
    ray.origin.set(x,rear3[0].y+2.6,rear3Z+.9);ray.direction.set(0,0,1);
    const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.3);
    assert(hit,'the former 3F booth window is an opaque solid wall');
  }
  const ceiling=venue.root.getObjectByName('Theater continuous acoustic ceiling');assert(ceiling);
  assert.equal(ceiling.userData.apertures.length,4,'one long gallery aperture and three subdivided apertures');
  for(const z of [10,17,23,29.5,35.4]) {
    const y=theaterCeilingY(z);ray.origin.set(1.2,y-.3,z);ray.direction.set(0,1,0);
    const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.5);
    assert(hit&&Math.abs(hit.point.y-y)<.015,'continuous acoustic finish follows the ceiling section');
  }
  for(const {centre,normal,depth} of ceiling.userData.apertures) {
    ray.origin.copy(centre).addScaledVector(normal,-depth+.3);ray.direction.copy(normal).negate();
    const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.5);
    assert(hit&&hit.distance>.2&&hit.distance<.4,'gallery aperture has a closed recessed back, not an open void');
  }
  for(const s of cat.seats) {
    ray.origin.set(s.x,s.y+.15,s.z);ray.direction.set(0,1,0);
    assert(!bvh.raycastFirst(ray,THREE.DoubleSide,0,1.65),'ceiling and overhead structures preserve seated/standing headroom');
  }
  // Regression: independent fascia / landing boxes left a 35 cm open strip.
  for(const floor of [2,3]) {
    const ss=cat.seats.filter(s=>s.floor===floor&&s.row===1&&s.kind==='standard');
    const probes=[0,-12,12].map(x=>ss.reduce((best,s)=>Math.abs(s.x-x)<Math.abs(best.x-x)?s:best,ss[0]));
    const y=ss[0].y-(floor===3?.758:.064);
    for(const s of probes) {
      ray.origin.set(s.x,ss[0].y+.15,s.z-1.5);ray.direction.set(0,-1,0);
      const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,2);
      assert(hit&&Math.abs(hit.point.y-y)<.015,`${floor}F nose landing is continuous at x=${s.x}`);
    }
  }
  const shells=[];venue.root.traverse(o=>{if(o.userData.balconyShell)shells.push(o);});
  assert.equal(shells.length,2);
  for(const shell of shells) {
    const p=shell.geometry.attributes.position,edges=new Map();
    const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*10000)).join(',');
    for(let i=0;i<p.count;i+=3)for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]) {
      const edge=[key(a),key(b)].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);
    }
    assert([...edges.values()].every(n=>n===2),`${shell.name} has no open boundary edges`);
  }

  // Use the app's actual standing/headroom and wall-sliding checks, at 12 cm
  // increments, in both directions from every public gate to its concourse.
  assert.deepEqual([1,2,3].map(f=>THEATER_GATES.filter(g=>g.floor===f).length),[6,4,2]);
  for(const gate of THEATER_GATES) {
    const middle=gate.plane==='side'?new THREE.Vector3(gate.side*(THEATER_WALL_X+.15),gate.y+1.2,gate.z):new THREE.Vector3(gate.x,gate.y+1.2,gate.z);
    let width=0;
    for(const side of [-1,1]) {
      ray.origin.copy(middle);ray.direction.set(gate.plane==='rear'?side:0,0,gate.plane==='side'?side:0);
      const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,2);assert(hit,`${gate.id} has its jamb`);width+=hit.distance;
    }
    assert(Math.abs(width-gate.width)<.015,`${gate.id} clear width matches the plan`);
    if(gate.plane==='side') {
      // Thin applied wall courses can fall between Walker's body rays. Scan
      // the full doorway too, including finishes that project off the wall.
      for(const offset of [-.4,0,.4])for(let dy=.08;dy<gate.height-.08;dy+=.004) {
        // At the bottom, inspect the wall thickness itself: neighbouring
        // raked seat tiers can be higher than the centre of the threshold.
        ray.origin.set(gate.side*(THEATER_WALL_X-(dy<.35?.04:.45)),gate.y+dy,gate.z+gate.width*offset);
        ray.direction.set(gate.side,0,0);
        const obstruction=bvh.raycastFirst(ray,THREE.DoubleSide,0,.8);
        assert(!obstruction,`${gate.id} finish crosses opening at y=${(gate.y+dy).toFixed(3)}, offset=${offset}, hit=${JSON.stringify(obstruction?.point)}`);
      }
    }
    const path=theaterGatePath(gate);
    for(const points of [path,[...path].reverse()]) {
      const walker=Object.create(Walker.prototype);walker.bvh=bvh;walker.ray=new THREE.Ray();walker.eyeH=WALK.eye;
      const [x,y,z]=points[0],ground=walker.ground(x,z,y+.9);assert(ground!==null);
      walker.feet=new THREE.Vector3(x,ground,z);walker.gy=ground;
      for(const next of points.slice(1)) {
        const start=walker.feet.clone(),n=Math.ceil(Math.hypot(next[0]-start.x,next[2]-start.z)/.12);
        for(let i=1;i<=n;i++) {
          const x=start.x+(next[0]-start.x)*i/n,z=start.z+(next[2]-start.z)*i/n;
          const dx=x-walker.feet.x,dz=z-walker.feet.z;
          const move=new THREE.Vector3(dx,0,dz);walker.slide(move);
          assert(Math.hypot(move.x-dx,move.z-dz)<.005,`${gate.id} route is blocked by a wall at ${x.toFixed(2)},${z.toFixed(2)}`);
          assert(walker.canStand(dx,dz),`${gate.id} route lacks floor/headroom at ${x.toFixed(2)},${z.toFixed(2)}`);
          const gy=walker.ground(x,z,walker.gy+WALK.climb);walker.feet.set(x,gy,z);walker.gy=gy;
        }
      }
    }
  }
  for(const side of [-1,1])for(const [from,to,startZ,endZ] of [[2.882,9.624,37.95,37.5],[9.624,15.071,37.5,38.6]]) {
    const mid=(from+to)/2;
    const path=[[0,from,startZ],[side*13.1,from,startZ],[side*13.1,from,39.7],
      [side*12.1,from,39.7],[side*5.95,mid,39.7],[side*5.95,mid,41.8],
      [side*12.1,to,41.8],[side*13.1,to,41.8],[side*13.1,to,endZ],[0,to,endZ]];
    for(const points of [path,[...path].reverse()]) {
      const walker=Object.create(Walker.prototype);walker.bvh=bvh;walker.ray=new THREE.Ray();walker.eyeH=WALK.eye;
      const [x,y,z]=points[0];walker.feet=new THREE.Vector3(x,y,z);walker.gy=y;
      for(const next of points.slice(1)) {
        const start=walker.feet.clone(),n=Math.ceil(Math.hypot(next[0]-start.x,next[2]-start.z)/.1);
        for(let i=1;i<=n;i++) {
          const x=start.x+(next[0]-start.x)*i/n,z=start.z+(next[2]-start.z)*i/n;
          const dx=x-walker.feet.x,dz=z-walker.feet.z,move=new THREE.Vector3(dx,0,dz);walker.slide(move);
          assert(Math.hypot(move.x-dx,move.z-dz)<.005,`stair ${from}->${to} side ${side} wall at ${x.toFixed(2)},${z.toFixed(2)}`);
          assert(walker.canStand(dx,dz),`stair ${from}->${to} side ${side} floor/headroom at ${x.toFixed(2)},${z.toFixed(2)}`);
          const gy=walker.ground(x,z,walker.gy+WALK.climb);walker.feet.set(x,gy,z);walker.gy=gy;
        }
      }
      assert(Math.abs(walker.gy-points.at(-1)[1])<.03,'stairs arrive on the requested storey');
    }
  }

  ray.origin.set(0,.3,7.4);ray.direction.set(0,-1,0);
  const pit=bvh.raycastFirst(ray,THREE.DoubleSide,0,5);
  assert(pit);
  assert(Math.abs(pit.point.y-(mode==='op'?0:-1.87))<.005,'pit opens physically and its cover returns in OP mode');
  assert.equal(venue.seatNear(cat.defaultSeat.x,cat.defaultSeat.z,cat.defaultSeat.y)?.num,23);
  // Exercise the real Rig: body, beam, lens flare and stage illumination must
  // share the two fence-mounted origins, including during playback.
  const palette=Object.fromEntries(['a','b','c','d'].map(k=>[k,new THREE.Color('#ff9745')]));
  const rig=rigs[0],follows=rig.fx.filter(f=>f.kind==='follow');assert.equal(follows.length,2);
  for(const house of [1,0]) {
    venue.update({dt:.016,t:1,energy:.2,house,pal:palette,cam:venue.eye});rig.update(1,venue.eye);
    for(const f of follows) {
      assert(f.body,'followspots have visible mounted bodies');
      ray.origin.set(f.pos.x,f.pos.y-.35,f.pos.z);ray.direction.set(0,0,1);
      const fence=bvh.raycastFirst(ray,THREE.DoubleSide,0,.6);
      assert(fence&&fence.distance>.2&&fence.distance<.4,'fixture is immediately ahead of the 3F fence');
      assert(f.beam.pos.distanceTo(f._lens)<1e-7);
      const light=rig.lights.find(l=>l.userData.fx===f);assert(light);
      assert(light.position.distanceTo(f._lens)<1e-7,'real stage light starts at the visible lens');
      assert(f.flare.pos.distanceTo(f._lens.clone().addScaledVector(f.dir,.05))<1e-7);
      assert.equal(f.beam.intensity>0,house===0);assert.equal(light.intensity>0,house===0);
    }
  }
  const moving=rig.fx.filter(f=>f.kind==='spot');assert.equal(moving.length,8);
  const wash=venue.root.getObjectByName('Theater concert wash'),low=wash.intensity;
  assert.equal(low>0,mode==='op');assert.equal(moving.some(f=>f.intensity>0),mode==='op');
  const before=moving.map(f=>f.dir.clone());
  venue.update({dt:1,t:2,energy:.9,house:0,pal:palette,cam:venue.eye});rig.update(1,venue.eye);
  if(mode==='op') {
    assert(wash.intensity>low,'concert wash responds to music energy');
    assert(moving.some((f,i)=>f.dir.distanceTo(before[i])>.01),'concert moving heads sweep');
  } else {
    assert.equal(wash.intensity,0);assert(rig.fx.filter(f=>f.kind!=='follow').every(f=>f.intensity===0),'musical playback keeps the other rig dark');
  }
  assert(!hazeSources.some(h=>h.power>0&&h.pos.y>10&&h.pos.z>25),'no detached followspot glow in rear seats');
  console.log(`PASS Theater ${mode}: ${cat.seats.length} seats; splayed walls; ${aisle.toFixed(2)} m minimum clear side aisle; stage access; solid 3F rear wall; single stage surface; sealed rear floors; fence followspots; ${mode==='op'?'concert':'musical'} lighting; 12 gates; 24 concourse routes; 8 stair routes; pit`);
  geo.dispose();
}
