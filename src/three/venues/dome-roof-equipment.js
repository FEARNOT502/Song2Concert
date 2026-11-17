import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {std,V3} from '../core.js';
import {rodInto} from '../rig.js';

// Photo-based lighting banks and a small suspended equipment cage. Their
// locations are estimates on the existing cable grid, not a surveyed rig.
export function roofEquipment({roofAt,grid,originZ,lensMaterial}) {
  const group=new THREE.Group();group.name='Roof suspended equipment';
  const body=[],faces=[],wires=[],cage=[],items=[];
  const frame=std({color:0x3e4144,roughness:.8,metalness:.35});
  const anchor=(i,j)=>V3(i*grid,roofAt(i*grid,originZ+j*grid)-.04,originZ+j*grid);
  const anchors=(i,j)=>[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>anchor(i+x,j+z));
  const box=(out,w,h,d,p,matrix)=>{
    const g=new THREE.BoxGeometry(w,h,d);g.translate(...p);
    if(matrix)g.applyMatrix4(matrix);out.push(g.toNonIndexed());
  };
  const suspend=(top,bottom)=>{
    const unused=top.slice();
    for(const b of bottom){
      unused.sort((p,q)=>Math.hypot(p.x-b.x,p.z-b.z)-Math.hypot(q.x-b.x,q.z-b.z));
      const a=unused.shift();rodInto(wires,a,b,.012);
      rodInto(wires,a.clone().add(V3(0,.03,0)),a.clone().add(V3(0,-.12,0)),.045);
    }
  };
  for(const i of [-3,3])for(const j of [-3,3]){
    const top=anchors(i,j),y=Math.min(...top.map(p=>p.y))-1.5;
    const f=new THREE.Object3D();f.position.set(i*grid,y,originZ+j*grid);f.lookAt(0,0,81);f.updateMatrixWorld();
    const matrix=f.matrixWorld,W=4.0,H=1.3;
    box(body,W,.08,.12,[0,-H/2,-.18],matrix);box(body,W,.08,.12,[0,H/2,-.18],matrix);
    for(const x of [-W/2,W/2])box(body,.08,H,.12,[x,0,-.18],matrix);
    for(let row=0;row<2;row++)for(let col=0;col<6;col++){
      const x=(col-2.5)*.65,z=0,y=(row-.5)*.61;
      box(body,.55,.55,.30,[x,y,z],matrix);
      const lens=new THREE.CircleGeometry(.215,16);lens.translate(x,y,.155);lens.applyMatrix4(matrix);faces.push(lens.toNonIndexed());
    }
    const bottom=[[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2]].map(([x,y])=>V3(x,y,-.22).applyMatrix4(matrix));
    suspend(top,bottom);
    items.push({kind:'two-row lighting bank',cell:[i,j],position:f.position.toArray(),anchors:top.map(p=>p.toArray()),mounts:bottom.map(p=>p.toArray()),lamps:12});
  }
  {
    const top=anchors(0,0),y=Math.min(...top.map(p=>p.y))-2.5,c=V3(0,y,originZ),W=1.15,H=.85,D=1.0;
    const corners=[];
    for(const x of [-W/2,W/2])for(const yy of [-H/2,H/2])for(const z of [-D/2,D/2])corners.push(c.clone().add(V3(x,yy,z)));
    for(let i=0;i<corners.length;i++)for(let j=i+1;j<corners.length;j++){
      const a=corners[i],b=corners[j],delta=[Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.z-b.z)];
      if(delta.filter(d=>d>1e-6).length===1)rodInto(cage,a,b,.025);
    }
    box(cage,.62,.46,.58,[c.x,c.y-.02,c.z]);
    const unit=new THREE.CylinderGeometry(.23,.19,.28,16);unit.translate(c.x,c.y-.6,c.z);cage.push(unit.toNonIndexed());
    const bottom=[[-W/2,-D/2],[W/2,-D/2],[W/2,D/2],[-W/2,D/2]].map(([x,z])=>c.clone().add(V3(x,H/2,z)));
    suspend(top,bottom);
    items.push({kind:'equipment cage',cell:[0,0],position:c.toArray(),anchors:top.map(p=>p.toArray()),mounts:bottom.map(p=>p.toArray())});
  }
  for(const [parts,material,name] of [[body,frame,'Ceiling suspended lighting banks'],[faces,lensMaterial,'Ceiling bank lenses'],[wires,std({color:0x6f7376,roughness:.75,metalness:.35}),'Ceiling suspension wires'],[cage,frame,'Ceiling equipment cage']]){
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name=name;mesh.userData.noCollide=true;group.add(mesh);
  }
  group.userData.items=items;
  return group;
}
