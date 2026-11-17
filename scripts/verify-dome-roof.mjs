import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DOME_ROOF as R,ROOF_WINGS,roofFoldRows,roofLineMaskGLSL,roofTriangleCorners} from '../src/three/venues/dome-roof.js';
import {roofEquipment} from '../src/three/venues/dome-roof-equipment.js';
import {TD_STANDS as D} from '../src/three/venues/td-data.js';
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
console.log('Four wings: uniform 8.5m base grid and omitted-stroke layout passed');

const panels=roofTriangleCorners();
assert.equal(2*R.triangleX/R.grid,13,'there must be thirteen vertical panels between the two outfield triangle tips');
for(const panel of panels){
 for(const n of panel.apex)assert(Math.abs(Math.abs(n)/R.grid-.5-Math.round(Math.abs(n)/R.grid-.5))<1e-9,'triangle apex misses a grid crossing');
 for(const p of panel.ends)assert(Math.abs(norm(...p)-1)<1e-9,'triangle edge misses outer ring');
 assert(Math.hypot(panel.ends[0][0]-panel.ends[1][0],panel.ends[0][1]-panel.ends[1][1])>34);
}
for(const wing of ROOF_WINGS)for(const row of roofFoldRows(wing).slice(0,3)){
 const p=row.axisDimension?[row.half,row.axis]:[row.axis,row.half];
 assert(Math.abs(p[0])<R.triangleX||Math.abs(p[1])<R.triangleZ,'triangle clips a 5/7/9 row');
}
const F=D.levels.find(l=>l.name==='F'),decode=b=>{const v=Buffer.from(b,'base64');return new Int16Array(v.buffer,v.byteOffset,v.byteLength/2);};
const seats=decode(F.seats),labels=decode(F.labels),blocks=new Map();
for(let i=0,j=0;i<seats.length;i+=4,j+=3){
 if(labels[j+1]<17)continue;
 const id=D.blockNames[labels[j]],p=[seats[i]/F.seatScale,seats[i+1]/F.seatScale+114];
 if(!blocks.has(id))blocks.set(id,[]);blocks.get(id).push(p);
}
const centreAngle=([x,z])=>Math.atan2(Math.abs(x),54-z);
for(const panel of panels.filter(p=>p.side[1]<0)){
 const bounds=panel.ends.map(([x,z])=>centreAngle([x,z+R.centreZ])).sort((a,b)=>a-b);
 // The photo gives an approximate width; its two ends may fall within a
 // block. Count substantial overlap, excluding a small boundary sliver.
 const coverage=[...blocks].filter(([,ps])=>Math.sign(ps[0][0])===panel.side[0]).map(([id,ps])=>{
  const a=ps.map(centreAngle),lo=Math.min(...a),hi=Math.max(...a);
  return {id,fraction:Math.max(0,Math.min(hi,bounds[1])-Math.max(lo,bounds[0]))/(hi-lo)};
 });
 const ids=coverage.filter(p=>p.fraction>=.25).map(p=>p.id).sort();
 assert.deepEqual(ids,panel.side[0]>0?['F16','F17','F18','F19']:['F02','F03','F04','F05']);
 console.log(`Outfield triangle spans about four blocks: ${ids.join(', ')}`);
}
console.log('Thirteen vertical panel bays between outfield triangle apices passed');

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
