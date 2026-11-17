import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DOME_ROOF as R,ROOF_WINGS,roofFoldRows,roofLineMaskGLSL} from '../src/three/venues/dome-roof.js';
import {roofEquipment} from '../src/three/venues/dome-roof-equipment.js';
const norm=(x,z)=>(Math.abs(x/R.radius)**R.exponent+Math.abs(z/R.radius)**R.exponent)**(1/R.exponent);
for(const wing of ROOF_WINGS){
 const rows=roofFoldRows(wing),counts=[];
 for(const [i,row] of rows.entries()){
  // Every retained endpoint remains on a base cable intersection;
  // there is no new, shifted or compressed crosswise line.
  assert(Math.abs(Math.abs(row.axis)/R.grid-.5-Math.round(Math.abs(row.axis)/R.grid-.5))<1e-9);
  if(i)assert(Math.abs(Math.abs(rows[i-1].axis-row.axis)-R.grid)<1e-9,'compressed original grid pitch');
  const points=[];
  for(let k=-20;k<=20;k++){
   const cross=(k+.5)*R.grid;if(Math.abs(cross)>row.half+1e-7)continue;
   const p=row.axisDimension?[cross,row.axis]:[row.axis,cross];p[1]+=R.gridOriginZ-R.centreZ;
   assert(norm(...p)<=1+1e-8,'retained stroke extends outside the roof');points.push(p);
  }
  counts.push(points.length-1);
 }
 assert.deepEqual(counts,[5,7,9,11,13]);
}
assert.equal(R.grid,8.5,'roof must use the drawing’s uniform 8.5m cable pitch');
assert.equal(R.gridOriginZ,R.centreZ,'grid must be centred on the roof envelope');
assert(!/roofFold\(|mix\(/.test(roofLineMaskGLSL()),'mask must omit strokes without remapping coordinates');
console.log('Four wings: 5/7/9/11/13 retained bays; uniform 8.5m pitch and omitted-stroke layout passed');

const roofAt=(x,z)=>34.7+.1*(z-R.centreZ)+25*(1-Math.min(1,norm(x,z-R.centreZ))**2);
const equipment=roofEquipment({roofAt,grid:R.grid,originZ:R.gridOriginZ,lensMaterial:new THREE.MeshBasicMaterial()});
assert.equal(equipment.userData.items.length,5);
for(const item of equipment.userData.items){
 assert.equal(item.anchors.length,4);
 assert(Math.min(...item.anchors.map(p=>p[1]))>Math.max(...item.mounts.map(p=>p[1])),'equipment extends above its anchors');
 for(const p of item.anchors){
  assert(Math.abs(p[0]/R.grid+.5-Math.round(p[0]/R.grid+.5))<1e-8,'support misses a cable crossing');
  assert(Math.abs((p[2]-R.gridOriginZ)/R.grid+.5-Math.round((p[2]-R.gridOriginZ)/R.grid+.5))<1e-8);
  assert(Math.abs(roofAt(p[0],p[2])-p[1]-.04)<1e-8,'support misses the roof surface');
 }
}
equipment.traverse(o=>{if(o.isMesh)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});
console.log('All five suspended units have four supports attached at roof cable crossings');
