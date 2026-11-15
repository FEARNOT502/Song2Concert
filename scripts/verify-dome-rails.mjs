import assert from 'node:assert/strict';
import * as THREE from 'three';
import {joinedStrip} from '../src/three/venues/dome-rails.js';
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
