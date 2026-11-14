// Geometry and official-chart checks. Canvas drawing and the lighting rig are
// stubbed: this verifies geometry/collision, never pixels or WebGL appearance.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { buildTheater } from '../src/three/venues/theater.js';
import { getTheaterSeatCatalog } from '../src/three/venues/theater-seats.js';
import { crowdUniforms } from '../src/three/people.js';
import { collisionGeometry, Walker, WALK } from '../src/three/walk.js';
import {THEATER_GATES,THEATER_WALL_X,theaterGatePath} from '../src/three/venues/theater-entries.js';
import {theaterCeilingY} from '../src/three/venues/theater-ceiling.js';

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
  const fixture=o=>({...o,position:o.pos.clone(),color:new THREE.Color(o.color||0xffffff),intensity:0});
  const ctx={mode,q:{crowd:0},cu:crowdUniforms(),
    pipe:{haze:{add:()=>({power:0})},flares:{add:()=>({intensity:0})}},
    art:{texture:()=>new THREE.Texture()},addScreen(){},screenHaze(){},
    rig:()=>({add:fixture,aim(){}})};
  const venue=buildTheater(ctx);
  venue.root.traverse(o=>{
    if(!o.isMesh)return;
    assert(o.geometry,'every visible mesh has geometry');
    for(const n of o.geometry.attributes.position.array)assert(Number.isFinite(n));
  });
  const geo=collisionGeometry(venue.root),bvh=new MeshBVH(geo),ray=new THREE.Ray();
  const gaps=[];
  for(const s of cat.seats)for(const offset of [0,.12]) {
    const x=s.x-Math.sin(s.yaw)*offset,z=s.z-Math.cos(s.yaw)*offset;
    ray.origin.set(x,s.y+.08,z);ray.direction.set(0,-1,0);
    const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.23);
    if(!hit||Math.abs(hit.point.y-s.y)>.04)gaps.push(`${s.floor}F/${s.row}/${s.num} at offset ${offset}`);
  }
  assert.deepEqual(gaps,[],'all seat origins and seated camera positions stand on their own floor');
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
  // House/show update functions must still accept the existing music/light inputs.
  const palette=Object.fromEntries(['a','b','c','d'].map(k=>[k,new THREE.Color('#ff9745')]));
  for(const house of [1,0])venue.update({dt:.016,t:1,energy:.5,house,pal:palette,cam:venue.eye});
  console.log(`PASS Theater ${mode}: ${cat.seats.length} seats; closed balcony shells; continuous ceiling and recessed galleries; 12 measured gate widths; 24 bidirectional concourse routes; 8 stair routes; pit; house/show`);
  geo.dispose();
}
