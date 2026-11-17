import assert from 'node:assert/strict';
import * as THREE from 'three';
import {joinedStrip,outfieldWallProfile,parapetLightMounts,UPPER_PARAPET_HEIGHT} from '../src/three/venues/dome-rails.js';
import {TD_STANDS} from '../src/three/venues/td-data.js';
import {addDomeStandLights,updateDomeStandLights} from '../src/three/venues/dome-stand-lights.js';
const P=[{x:0,z:0},{x:4,z:0},{x:4,z:3}],g=joinedStrip(P,[1,1,1],[0,0,0],.2);
const a=g.attributes.position.array,edges=new Map();
const key=i=>Array.from(a.slice(i,i+3),v=>v.toFixed(5)).join(',');
for(let i=0;i<a.length;i+=9)for(const [u,v] of [[i,i+3],[i+3,i+6],[i+6,i]]){
 const edge=[key(u),key(v)].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);
}
assert([...edges.values()].every(n=>n===2),'parapet has an open edge');
const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
for(const [x,z] of [[4.05,-.05],[3.98,.02],[4.05,.05]]){
 const hit=new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0];
 assert(hit&&Math.abs(hit.point.y-1)<1e-6,`gap at right-angle corner ${x}, ${z}`);
}
console.log('Closed parapet and three corner rays passed');
const profile=outfieldWallProfile(TD_STANDS),mass=TD_STANDS.upperOutfieldMass;
const walls=[...TD_STANDS.upperWall].sort((a,b)=>a.pts.at(-1)[0]-b.pts.at(-1)[0]);
for(const [i,k] of profile.joins.entries()){
 assert.deepEqual(profile.points[k],walls[i].pts.at(-1),'wall junction shifted in plan');
 assert.equal(profile.bottoms[k],walls[i].y0.at(-1),'vertical step at the wall junction');
}
assert.equal(profile.massBottoms[mass.screenRange[0]],mass.y0);
assert.equal(profile.massBottoms[mass.screenRange[1]],mass.y0);
assert(profile.massBottoms.every(y=>y===TD_STANDS.rimCY-1.2));
assert.equal(TD_STANDS.scoreboardBottom,TD_STANDS.rimCY-1.2);
console.log('Both wall joins share their face and soffit heights');

const fences=TD_STANDS.frontParapets.D.map(({panel})=>{
 const P=panel.pts.map(([x,z])=>({x,z:z+114}));
 const geo=joinedStrip(P,panel.ys.map(y=>y+UPPER_PARAPET_HEIGHT),panel.ys.map(y=>y-.06),.22);
 const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.updateMatrixWorld();return m;
});
for(const count of [10,18])for(const p of parapetLightMounts(TD_STANDS,count)){
 const hits=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+.1,p.z),new THREE.Vector3(0,-1,0),0,.15).intersectObjects(fences);
 assert(hits.length&&Math.abs(hits[0].point.y-p.y)<1e-5,`4F beam lacks a parapet under its bracket: ${p.x}, ${p.z}`);
}
console.log('All 28 light positions have a solid 4F parapet directly under their bracket');

for(const count of [10,18]){
 const root=new THREE.Group(),rig={add:o=>({...o,dir:new THREE.Vector3(0,1,0),color:new THREE.Color()})};
 const fixtures=addDomeStandLights({rig,root,data:TD_STANDS,quality:{rig:count===10?.5:1}});
 assert.equal(fixtures.length,count);
 const hardware=root.getObjectByName('4F beam mounting brackets');root.updateMatrixWorld(true);
 for(const {fx} of fixtures){
  const ray=new THREE.Raycaster(fx.pos.clone().add(new THREE.Vector3(0,.02,0)),new THREE.Vector3(0,-1,0),0,.2);
  assert(Math.abs(ray.intersectObject(hardware)[0].point.y-fx.pos.y)<1e-5,'fixture floats above bracket');
 }
 const f={house:0,sec:'chorus',t:1,dt:1,kick:.5,pal:{a:new THREE.Color('red'),c:new THREE.Color('blue')}};
 for(const targetZ of [59.6,81]){
  updateDomeStandLights(fixtures,f,targetZ);assert(fixtures.every(({fx})=>fx.intensity>0&&Math.abs(fx.dir.length()-1)<1e-6));
  updateDomeStandLights(fixtures,{...f,house:1},targetZ);assert(fixtures.every(({fx})=>fx.intensity===0));
 }
}
console.log('Shared stand-light brackets and playback passed at both quality counts and both stage targets');
