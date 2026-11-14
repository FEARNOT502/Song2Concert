import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {std,pbrSet,valueNoise,glowMat,KELVIN} from '../core.js';

// Page 4 is a longitudinal section: PDF x is height, PDF y is depth.
// These are the undersides of SUSPENDED technical galleries, not a single
// low roof. The operator photographs show the high ceiling behind them.
const sectionPoint=(px,py)=>({z:5.9+(558.84-py)/15.2,y:(px-246.24)/15.2});
const first=sectionPoint(477.24,449.52),second=sectionPoint(486.36,293.4),third=sectionPoint(502.2,220.92);
export const THEATER_CEILING_HEIGHT=22.137;
export const THEATER_CEILING_GALLERIES=[
  {...first,back:sectionPoint(477.24,334.92).z,height:3.3,kind:'split'},
  {...second,back:sectionPoint(486.36,247.8).z,height:1.4,kind:'long'},
  {...third,back:sectionPoint(502.2,154.8).z,height:.2,kind:'rear'},
];
const canopyStart=9.5,rearReturn=36.8;
export function theaterCeilingY(z) {
  for(const g of THEATER_CEILING_GALLERIES)if(z>=g.z&&z<=g.back)return g.y;
  if(z>=canopyStart&&z<first.z)return THEATER_CEILING_HEIGHT+(first.y+3.3-THEATER_CEILING_HEIGHT)*(z-canopyStart)/(first.z-canopyStart);
  const rear=THEATER_CEILING_GALLERIES[2];
  if(z>rear.back&&z<rearReturn)return rear.y+(THEATER_CEILING_HEIGHT-rear.y)*(z-rear.back)/(rearReturn-rear.back);
  return THEATER_CEILING_HEIGHT;
}

export function buildTheaterCeiling(root,{X}) {
  const noise=valueNoise(71),finish=pbrSet('bsq-ceiling-matte-v1',256,(u,v)=>{
    const n=noise(u*36,v*10)-.5,t=1+n*.035;
    return [.34*t,.295*t,.235*t,.5+n*.015,.96];
  },{normal:.25});
  const timber=std({...finish,roughness:1}),dark=std({color:0x111311,roughness:1});
  const metal=std({color:0x353832,roughness:.8,metalness:.35}),joint=std({color:0x3a3328,roughness:1});
  const lampMat=glowMat(KELVIN(3000),3.5),batches=new Map(),rigPoints=[],apertures=[];
  const add=(material,g)=>{if(!batches.has(material))batches.set(material,[]);if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}batches.get(material).push(g);};
  const box=(material,x,y,z,w,h,d)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);add(material,g);};
  const slope=(z0,y0,z1,y1)=>{
    const run=z1-z0,rise=y1-y0,angle=Math.atan2(rise,run),g=new THREE.BoxGeometry(2*X,.18,Math.hypot(run,rise));
    g.rotateX(-angle);g.translate(0,(y0+y1)/2+.09*Math.cos(angle),(z0+z1)/2-.09*Math.sin(angle));add(timber,g);
  };
  // The high timber ceiling closes the room, including the spaces above and
  // between the galleries. Every gallery has its own solid underside.
  box(timber,0,THEATER_CEILING_HEIGHT+.1,23.85,2*X,.2,38.3);
  slope(canopyStart,THEATER_CEILING_HEIGHT,first.z,first.y+3.3);
  const rear=THEATER_CEILING_GALLERIES[2];slope(rear.back,rear.y,rearReturn,THEATER_CEILING_HEIGHT);

  for(const g of THEATER_CEILING_GALLERIES) {
    box(timber,0,g.y+.1,(g.z+g.back)/2,2*X,.2,g.back-g.z);
    if(g.kind==='rear')continue;
    // Aperture layout and upper enclosure heights come from photographs;
    // no reflected ceiling drawing or as-built aperture dimensions are public.
    const openings=g.kind==='split'?[[-11.5,-6.4,.3,1.65],[-4.25,4.25,.25,2.95],[6.4,11.5,.3,1.65]]:[[-9.6,9.6,.2,1.18]];
    const shape=new THREE.Shape();shape.moveTo(-X,0);shape.lineTo(X,0);shape.lineTo(X,g.height);shape.lineTo(-X,g.height);shape.closePath();
    for(const [x0,x1,y0,y1] of openings) {
      const hole=new THREE.Path();hole.moveTo(x0,y0);hole.lineTo(x1,y0);hole.lineTo(x1,y1);hole.lineTo(x0,y1);hole.closePath();shape.holes.push(hole);
      const depth=1.3,midY=g.y+(y0+y1)/2;
      // A closed dark well makes an actual recess, rather than a hole into
      // empty space. The grille and fixtures sit inside the recess.
      box(dark,(x0+x1)/2,midY,g.z+depth,x1-x0,y1-y0,.08);
      for(const x of [x0-.035,x1+.035])box(dark,x,midY,g.z+depth/2,.07,y1-y0,depth);
      for(const y of [g.y+y0-.035,g.y+y1+.035])box(dark,(x0+x1)/2,y,g.z+depth/2,x1-x0+.14,.07,depth);
      for(let x=x0+.08;x<x1;x+=.16)box(metal,x,midY,g.z+.22,.009,y1-y0,.009);
      for(let y=g.y+y0+.06;y<g.y+y1;y+=.16)box(metal,(x0+x1)/2,y,g.z+.22,x1-x0,.009,.009);
      for(let x=x0+.15;x<x1;x+=1.5)box(metal,x,midY,g.z+.45,.045,y1-y0,.045);
      box(metal,(x0+x1)/2,g.y+y0+.12,g.z+.5,x1-x0,.055,.055);
      const n=Math.max(2,Math.round((x1-x0)/2.8));
      for(let k=0;k<n;k++)rigPoints.push(new THREE.Vector3(x0+(x1-x0)*(k+.5)/n,midY,g.z+.6));
      apertures.push({centre:new THREE.Vector3((x0+x1)/2,midY,g.z),normal:new THREE.Vector3(0,0,-1),depth});
    }
    const face=new THREE.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false});face.translate(0,g.y,g.z);add(timber,face);
    box(timber,0,g.y+g.height+.09,g.z+.75,2*X,.18,1.5);
    for(const side of [-1,1])box(timber,side*(X-.09),g.y+g.height/2,g.z+.75,.18,g.height,1.5);
    // Suspension and service-floor details in the high technical space.
    for(const x of [-12,-6,0,6,12]) {
      const low=g.y+g.height,high=THEATER_CEILING_HEIGHT;
      box(metal,x,(low+high)/2,g.back-.3,.055,high-low,.055);
      box(metal,x,g.y+.45,g.back-.4,.035,.9,.035);
    }
    box(metal,0,g.y+.9,g.back-.4,2*X-.4,.04,.04);
  }
  // Subtle timber panel joints on each broad underside.
  for(const g of THEATER_CEILING_GALLERIES) {
    for(let z=g.z+.8;z<g.back;z+=2.8)box(joint,0,g.y-.004,z,2*X,.006,.012);
    for(let x=-10.8;x<X;x+=3.6)box(joint,x,g.y-.004,(g.z+g.back)/2,.012,.006,g.back-g.z);
  }
  const lightRows=[6.5,8.5,...THEATER_CEILING_GALLERIES.flatMap(g=>[g.z+.65,g.back-.65]),34.8,38.5];
  for(const z of lightRows)for(const x of [-10.5,-7,-3.5,0,3.5,7,10.5]) {
    const y=theaterCeilingY(z);
    const trim=new THREE.CylinderGeometry(.105,.105,.025,12);trim.translate(x,y-.016,z);add(dark,trim);
    const light=new THREE.CylinderGeometry(.065,.065,.008,12);light.translate(x,y-.033,z);add(lampMat,light);
    if(Math.abs(x)%7===0) {
      const vent=new THREE.CylinderGeometry(.11,.11,.012,12);vent.translate(x+.7,y-.012,z+.3);add(dark,vent);
      for(const offset of [-.05,0,.05])box(metal,x+.7,y-.021,z+.3+offset,.17,.006,.012);
    }
  }
  const ceiling=new THREE.Group();ceiling.name='Theater continuous acoustic ceiling';ceiling.userData.apertures=apertures;
  for(const [material,parts] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.receiveShadow=true;ceiling.add(mesh);parts.forEach(g=>g.dispose());
  }
  root.add(ceiling);
  // Approximate the warm indirect bounce absent from the real-time renderer.
  // Broad area lights reveal the ceiling without point-light hot spots.
  const indirect=[];
  for(const [y,z,w,d] of [[10.5,17,22,8],[12,27,22,7],[17,36,20,6]]) {
    const light=new THREE.RectAreaLight(KELVIN(3500),0,w,d);light.position.set(0,y,z);light.lookAt(0,y+5,z);root.add(light);indirect.push(light);
  }
  return {rigPoints,apertures,setHouse(house){lampMat.color.copy(KELVIN(3000)).multiplyScalar(3.5*house);indirect.forEach(l=>{l.intensity=2.2*house;});}};
}
