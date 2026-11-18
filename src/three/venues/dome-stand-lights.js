import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {std,V3} from '../core.js';
import {parapetLightMounts} from './dome-rails.js';

// Both stage modes use the same fixtures and saddles on the 4F parapet.
export function addDomeStandLights({rig,root,data,quality,offsetZ=114,roofCentreZ=81}) {
  const count=(quality.rig??1)<1?10:18,mounts=parapetLightMounts(data,count,offsetZ),brackets=[],fixtures=[];
  for(const [i,{x,y,z,yaw}] of mounts.entries()){
    const plate=new THREE.BoxGeometry(.56,.06,.42);
    plate.rotateY(yaw);plate.translate(x,y+.03,z);brackets.push(plate);
    for(const side of [-1,1]){
      const leg=new THREE.BoxGeometry(.12,.22,.06);
      leg.rotateY(yaw);leg.translate(x+Math.sin(yaw)*side*.14,y-.08,z+Math.cos(yaw)*side*.14);brackets.push(leg);
    }
    const pos=V3(x,y+.06,z),a=Math.atan2(pos.x,pos.z-roofCentreZ);
    fixtures.push({fx:rig.add({kind:'beam',pos,hang:'up',length:110,beamGain:.9,flareGain:.6}),i,n:count,group:4,a});
  }
  const hardware=new THREE.Mesh(mergeGeometries(brackets),std({color:0x272a2d,roughness:.9,envMapIntensity:.15}));
  hardware.name='4F beam mounting brackets';hardware.userData.noCollide=true;hardware.userData.mounts=mounts;
  root.add(hardware);
  return fixtures;
}

export function updateDomeStandLights(fixtures,f,targetZ,roofCentreZ=81) {
  const chorus=(f.sec||f.part)==='chorus',show=1-f.house;
  for(const {fx,i,a} of fixtures){
    const target=chorus?V3(Math.sin(f.t*.8+i)*22,26,targetZ+Math.cos(f.t*.8+i)*3):V3(Math.sin(a)*30,56,roofCentreZ+Math.cos(a)*30);
    fx.dir.lerp(target.sub(fx.pos).normalize(),Math.min(1,f.dt*2)).normalize();
    fx.color.copy(i%2?f.pal.a:f.pal.c);
    fx.intensity=(chorus?.9+.4*f.kick:(f.sec||f.part)==='pre'?.5:.18)*show;
  }
}
