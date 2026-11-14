import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const THEATER_WALL_X=14.32;
export const THEATER_WALL_THICKNESS=.30;
// Operator PDF pages 1–3, unrotated coordinates: jamb/hinge locations.
// Width is the opening between jamb edges, not the 180-degree swing arc.
// Door HEIGHT and transverse landing heights are reconstructions, not dimensions
// specified by the PDF. See THEATER_REMODEL.ko.md for the distinction.
const raw=[
  [1,1,'side',219.24,404.52,29.04,.535], [1,6,'side',663.36,404.52,29.04,.535],
  [1,2,'side',218.88,184.26,28.92,2.882], [1,5,'side',663.36,184.26,28.92,2.882],
  [1,3,'rear',366.84,117.36,29.04,2.882,79.44], [1,4,'rear',515.76,117.36,29.04,2.882,79.44],
  [2,1,'side',220.08,315.18,28.92,8.021], [2,4,'side',664.68,315.18,28.92,8.021],
  [2,2,'rear',367.92,221.76,29.04,9.624,198.48], [2,3,'rear',516.84,221.76,29.04,9.624,198.48],
  [3,1,'side',221.16,310.80,29.04,13.571], [3,2,'side',665.64,310.80,29.04,13.571],
];
const centre=[441.30,442.38,443.40],origin=[558.84,661.56,661.56];
export const THEATER_GATES=raw.map(([floor,num,plane,px,py,width,y,outerPy])=>({
  id:`${floor}F-G${num}`,floor,num,plane,side:px<centre[floor-1]?-1:1,
  x:(px-centre[floor-1])/15.2,z:5.9+(origin[floor-1]-py)/15.2,
  width:width/15.2,height:2.3,y,
  outerZ:outerPy==null?null:5.9+(origin[floor-1]-outerPy)/15.2,
  plan:{px,py,width},heightVerified:false,
}));
export const THEATER_REAR_Z={1:THEATER_GATES.find(g=>g.floor===1&&g.plane==='rear').outerZ,2:THEATER_GATES.find(g=>g.floor===2&&g.plane==='rear').outerZ};
export const THEATER_SIDE_FRONT_DOOR=[5,6.6];
export const THEATER_SIDE_CONCOURSE_OPENING=[37.8,42.6];
// The shell and its applied finishes must use the same clear openings.
export function theaterSideOpenings(side) {
  return [[...THEATER_SIDE_FRONT_DOOR,0,2.3],
    ...[2.882,9.624,15.071].map(y=>[...THEATER_SIDE_CONCOURSE_OPENING,y,y+2.7]),
    ...THEATER_GATES.filter(g=>g.plane==='side'&&g.side===side).map(g=>[g.z-g.width/2,g.z+g.width/2,g.y,g.y+g.height])];
}

export function addTheaterGateFrames(root,{X,wood,carpet}) {
  const parts=[];
  const box=(x,y,z,w,h,d)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts.push(g);};
  const sign=(gate,z=gate.z)=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const c=canvas.getContext('2d');
    c.fillStyle='#17402c';c.fillRect(0,0,256,96);c.fillStyle='#e7f5dd';c.font='bold 28px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(`${gate.floor}F  GATE ${gate.num}`,128,48);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.74,.278),new THREE.MeshBasicMaterial({map:tex}));
    mesh.position.set(gate.plane==='side'?gate.side*(X-.025):gate.x,gate.y+gate.height+.23,gate.plane==='side'?gate.z:z-.035);
    if(gate.plane==='side')mesh.rotation.y=-gate.side*Math.PI/2;
    mesh.userData.noCollide=true;mesh.userData.gate=gate.id;root.add(mesh);
  };
  for(const g of THEATER_GATES) {
    const h=g.height,w=g.width;
    if(g.plane==='side') {
      for(const d of [-1,1])box(g.side*(X+.15),g.y+h/2,g.z+d*(w/2+.04),.34,h+.08,.08);
      box(g.side*(X+.15),g.y+h+.04,g.z,.34,.08,w+.16);sign(g);
      // A full-width threshold covers the wall's thickness; no step into air.
      const t=new THREE.Mesh(new THREE.BoxGeometry(.65,.12,w),carpet);t.position.set(g.side*(X+.12),g.y-.06,g.z);root.add(t);
      if(g.floor===3) {
        const a=new THREE.Vector3(g.side*11.5,g.y-.11,30.2),b=new THREE.Vector3(g.side*(X+.2),g.y-.11,g.z);
        const dx=b.x-a.x,dz=b.z-a.z,geo=new THREE.BoxGeometry(Math.hypot(dx,dz),.22,.9);
        geo.rotateY(-Math.atan2(dz,dx));geo.translate((a.x+b.x)/2,a.y,(a.z+b.z)/2);
        root.add(new THREE.Mesh(geo,carpet));
      }
    } else {
      // The rear entrances are TWO doors with a real vestibule between them.
      const end=g.outerZ,mid=(g.z+end)/2,depth=end-g.z;
      for(const s of [-1,1])box(g.x+s*(w/2+.08),g.y+1.35,mid,.16,2.7,depth+.12);
      box(g.x,g.y+2.5,g.z,w+.32,.4,.16);
      for(const s of [-1,1])box(g.x+s*(w/2+.04),g.y+h/2,g.z,.08,h,.22);
      box(g.x,g.y+2.72,mid,w+.32,.16,depth+.12);
      const t=new THREE.Mesh(new THREE.BoxGeometry(w+.16,.15,depth+.4),carpet);t.position.set(g.x,g.y-.075,mid);root.add(t);
      sign(g);sign(g,end);
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(parts),wood));parts.forEach(g=>g.dispose());
}

// Paths used by the geometry audit: auditorium → doorway → connected concourse.
export function theaterGatePath(g,{X=THEATER_WALL_X}={}) {
  const endY=[2.882,9.624,15.071][g.floor-1],endZ=g.floor===1?37.95:g.floor===2?37.5:38.6;
  if(g.plane==='rear')return [[g.x,g.y,g.z-.65],[g.x,g.y,g.z+.4],[g.x,g.y,g.outerZ+.5],[0,endY,endZ]];
  return [[g.side*(X-.5),g.y,g.z],[g.side*(X+.4),g.y,g.z],[g.side*(X+.95),g.y,g.z],
    [g.side*(X+.95),endY,38.3],[g.side*(X-.42),endY,38.3],[g.side*(X-.42),endY,endZ],[0,endY,endZ]];
}
