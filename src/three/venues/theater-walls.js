import * as THREE from 'three';
import {THEATER_WALL_X} from './theater-entries.js';

// Operator plan, page 1, unrotated PDF coordinates. The diagonal inner face
// boxes in the technical room; it is distinct from the rectangular outer wall.
const centre=441.30,origin=558.84,scale=15.2;
export const THEATER_SPLAY={
  nearX:(centre-313.68)/scale,
  frontX:(centre-306.60)/scale,frontZ:5.9+(origin-548.88)/scale,
  backX:(centre-246.96)/scale,backZ:5.9+(origin-419.40)/scale,
  plan:{near:[313.68,548.88],front:[306.60,548.88],back:[246.96,419.40]},
};
export const THEATER_SPLAY_SLOPE=(THEATER_SPLAY.backX-THEATER_SPLAY.frontX)/(THEATER_SPLAY.backZ-THEATER_SPLAY.frontZ);
export function theaterWallX(z) {
  const p=THEATER_SPLAY;
  if(z<p.frontZ)return p.nearX;
  if(z<=p.backZ)return p.frontX+(z-p.frontZ)*THEATER_SPLAY_SLOPE;
  return THEATER_WALL_X;
}

export function addTheaterSplayedWalls(root,{height,material,front=4.7}) {
  const p=THEATER_SPLAY;
  for(const side of [-1,1]) {
    const shape=new THREE.Shape();
    for(const [i,[x,z]] of [[THEATER_WALL_X,front],[p.nearX,front],[p.nearX,p.frontZ],[p.frontX,p.frontZ],[p.backX,p.backZ],[THEATER_WALL_X,p.backZ]].entries()) {
      if(i===0)shape.moveTo(side*x,z);else shape.lineTo(side*x,z);
    }
    shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height+.33,bevelEnabled:false});
    geo.rotateX(Math.PI/2);geo.translate(0,height+.15,0);
    const pos=geo.attributes.position,uv=geo.attributes.uv;
    for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getZ(i),pos.getY(i));
    const wall=new THREE.Mesh(geo,material);wall.name=`Theater splayed inner wall ${side<0?'L':'R'}`;
    wall.receiveShadow=true;root.add(wall);
  }
}
