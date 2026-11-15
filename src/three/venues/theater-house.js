import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std } from '../core.js';
import { seatField } from '../rig.js';
import { getTheaterSeatCatalog } from './theater-seats.js';
import { buildTheaterBalcony,buildTheaterLanding,theaterRowZ } from './theater-balcony.js';
import {addTheaterGateFrames,theaterSideOpenings} from './theater-entries.js';

// These are the drawn chair centres, with the section's own per-row heights.
// Separate stair treads halve the high balcony risers so walking stays possible.
export function theaterHouse(root, { mode, carpet, wood, fabric, X, D }) {
  const catalog = getTheaterSeatCatalog(mode), spots = catalog.seats;
  const mats = { carpet, wood, dark: std({color:0x16120e,roughness:.85}),
    rail:std({color:0x9f8960,metalness:.65,roughness:.48}),soffit:std({color:0x534534,roughness:1}),
    glass:new THREE.MeshPhysicalMaterial({color:0xb0c0be,roughness:.1,metalness:.12,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}),black:std({color:0x08090a,roughness:.95}) };
  const batches = new Map();
  const box = (mat,x,y,z,w,h,d,turn=0) => {
    if(w<=0||h<=0||d<=0)return;
    const geo=new THREE.BoxGeometry(w,h,d);geo.rotateY(turn);geo.translate(x,y,z);
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(geo);
  };
  const wallFinish=(mat,side,x,y,z,w,h,d)=>{
    let pieces=[[z-d/2,z+d/2,y-h/2,y+h/2]];
    for(const [a,b,c,e] of theaterSideOpenings(side)) {
      pieces=pieces.flatMap(([z0,z1,y0,y1])=>{
        const left=Math.max(z0,a),right=Math.min(z1,b),bottom=Math.max(y0,c),top=Math.min(y1,e);
        if(left>=right||bottom>=top)return [[z0,z1,y0,y1]];
        return [[z0,left,y0,y1],[right,z1,y0,y1],[left,right,y0,bottom],[left,right,top,y1]]
          .filter(([a,b,c,e])=>b>a&&e>c);
      });
    }
    for(const [z0,z1,y0,y1] of pieces)box(mat,x,(y0+y1)/2,(z0+z1)/2,w,y1-y0,z1-z0);
  };
  const levels=[], stepPts=[], lampSpots=[];
  for(let f=1;f<=3;f++) {
    const rows=catalog.getRows(`${f}F`).filter(r=>typeof r==='number'&&r<=22);
    let lastZ=0,lastY=0;const floorRows=[];
    for(const row of rows) {
      const rowSeats=spots.filter(s=>s.floor===f&&s.row===row&&s.kind==='standard');
      if(!rowSeats.length)continue;
      const central=rowSeats.filter(s=>Math.abs(s.x)<4.9), cz=central.reduce((a,s)=>a+s.z,0)/central.length, y=rowSeats[0].y;
      lastZ=cz;lastY=y;
      floorRows.push({row,y,z:cz,seats:rowSeats});
      // Centre seats and stair aisles. Side treads follow the drawing's angles.
      for(const side of [-1,0,1]) {
        const ss=rowSeats.filter(s=>side===0?Math.abs(s.x)<4.9:side*s.x>4.9);
        if(!ss.length)continue;
        const angle=side===0?0:ss[0].yaw-Math.PI;
        const inner=5.05;
        const mid=ss[Math.floor(ss.length/2)], x=side===0?0:side*(X+inner)/2;
        const z=side===0?cz:mid.z-Math.tan(angle)*(x-mid.x);
        const w=side===0?11.3:(X-inner)/Math.cos(angle);
        if(f===1)box(carpet,x,(-.18+y)/2,z+.31,w,y+.18,.92,angle);
      }
      const prev=row>1?spots.find(s=>s.floor===f&&s.row===row-1&&Math.abs(s.x)<4.9):null;
      for(const side of [-1,1]) {
        const x=side*4.95;
        stepPts.push({x,y:y+.025,z:cz-.24});
        if(prev) {
          const steps=Math.max(1,Math.ceil((y-prev.y)/.18)),run=(cz-prev.z)/steps;
          for(let i=0;i<steps;i++) {
            const top=prev.y+(y-prev.y)*(i+1)/steps;
            box(carpet,x,top-.13,prev.z+.55+run*(i+.5),1.25,.26,run+.025);
          }
        }
      }
    }
    if(f>1) {
      const balcony=buildTheaterBalcony({floor:f,rows:floorRows,X,carpet,fascia:mats.dark,soffit:mats.soffit,rail:mats.rail});
      root.add(balcony.root);lampSpots.push(...balcony.lamps);
      // One exact full-width joint; the slab builder keeps the stair wells.
      levels.push({y:lastY,z:balcony.rearZ,parts:[],balcony});
    } else {
      const a=floorRows[6],b=floorRows[7];
      root.add(buildTheaterLanding({X,front:x=>theaterRowZ(a,x)+.65,back:x=>theaterRowZ(b,x)-.2,yFront:a.y,yBack:b.y,bottom:-.18,material:carpet}));
      root.add(buildTheaterLanding({X,front:x=>theaterRowZ(floorRows.at(-1),x)+.65,back:()=>D,yFront:lastY,yBack:lastY,bottom:-.18,material:carpet}));
    }
  }
  addTheaterGateFrames(root,{X,wood,carpet});
  // Family rooms: a dark glazed screen with timber mullions. The 14 places
  // remain selectable and are distinct from the 18 open wheelchair bays.
  for(const side of [-1,1]) {
    box(mats.glass,side*8.05,4.1,33.35,4.65,1.65,.055,side*.21);
    box(wood,side*8.05,3.0,33.35,4.8,.25,.14,side*.21);
    for(const x of [5.65,8,10.45])box(wood,side*x,4.12,33.35-(x-8)*.21,.065,2.1,.12);
  }
  // Open pit is a real void in the floor mesh. No invisible floor covers it.
  if(mode==='op') {
    box(carpet,0,-.06,7.4,15.6,.12,3);
  } else {
    box(mats.black,0,-1.94,7.4,15.6,.14,3);
    box(mats.dark,0,-.94,8.94,15.85,1.88,.14);
    for(const side of [-1,1])box(mats.dark,side*7.86,-.94,7.4,.12,1.88,3);
    // Open pit safety rail, with small uprights and mesh, photographed finish.
    box(mats.rail,0,.72,9.02,15.8,.035,.035);
    for(let x=-7.8;x<8;x+=1.56)box(mats.rail,x,.36,9.02,.025,.72,.025);
  }
  // Projecting FOH lighting boxes and their horizontal timber slats.
  for(const side of [-1,1]) {
    box(wood,side*(X-.45),9.45,14.25,.9,8.3,7.1);
    box(mats.black,side*(X-.94),9.45,14.25,.055,6.4,5.75);
    for(let y=5.3;y<13.65;y+=.145) {
      box(mats.dark,side*(X-.92),y,14.25,.035,.016,7.1);
    }
    for(const z of [11.15,17.35]) {
      box(wood,side*(X-1),9.45,z,.2,8.35,.38);
    }
    // Wall reflector panels behind the boxes, staggered like the photos.
    for(let z=20;z<35;z+=3) {
      wallFinish(wood,side,side*(X-.17),6.2+(Math.round(z)%2)*.55,z,.32,2.7,1.55);
      wallFinish(wood,side,side*(X-.13),12.2+(Math.round(z)%2)*.5,z,.25,2.2,1.7);
    }
    // Horizontal wall courses, not the former vertical fins.
    for(let y=.2;y<18;y+=.22)wallFinish(mats.dark,side,side*(X-.015),y,20,.03,.009,29);
  }
  const regular=spots.filter(s=>s.kind!=='wheelchair');
  root.add(seatField(regular,{fabric,frame:std({color:0x332719,roughness:.62}),style:'bluesquare'}));
  addSeatNumbers(root,regular);
  // Accessible bays get a small blue floor marker, not a theatre chair.
  for(const s of spots.filter(s=>s.kind==='wheelchair')) {
    box(mats.rail,s.x,s.y+.012,s.z,.7,.02,.72,s.yaw);
    box(carpet,s.x,s.y+.025,s.z,.65,.02,.67,s.yaw);
  }
  for(const [mat,geos] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(geos),mat);mesh.receiveShadow=true;root.add(mesh);
    geos.forEach(g=>g.dispose());
  }
  return {catalog,spots,levels,stepPts,lampSpots};
}

function addSeatNumbers(root,seats) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const c=canvas.getContext('2d');
  c.fillStyle='#c7b58e';c.fillRect(0,0,1024,512);c.fillStyle='#151411';c.font='bold 34px sans-serif';c.textAlign='center';c.textBaseline='middle';
  for(let n=1;n<=64;n++)c.fillText(String(n),((n-1)%8)*128+64,Math.floor((n-1)/8)*64+32);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const geos=[];
  for(const s of seats) {
    const g=new THREE.PlaneGeometry(.055,.028),uv=g.attributes.uv;
    const col=(s.num-1)%8,row=Math.floor((s.num-1)/8);
    for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+col)/8,(uv.getY(i)+7-row)/8);
    g.rotateX(-Math.PI/2);g.translate(.247,.655,.08);g.rotateY(s.yaw);g.translate(s.x,s.y,s.z);geos.push(g);
  }
  const mesh=new THREE.Mesh(mergeGeometries(geos),new THREE.MeshStandardMaterial({map:tex,roughness:.65}));
  mesh.userData.plan='labels';mesh.userData.noCollide=true;root.add(mesh);geos.forEach(g=>g.dispose());
}
