import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {THEATER_GATES} from './theater-entries.js';

export function theaterRowZ(row,x) {
  if(Math.abs(x)<=4.15)return row.z;
  const side=x<0?-1:1,ss=row.seats.filter(s=>side*s.x>4.9);
  const mx=ss.reduce((a,s)=>a+s.x,0)/ss.length,mz=ss.reduce((a,s)=>a+s.z,0)/ss.length;
  const covariance=ss.reduce((a,s)=>a+(s.x-mx)*(s.z-mz),0),variance=ss.reduce((a,s)=>a+(s.x-mx)**2,0);
  const slope=covariance/variance,sideZ=mz+slope*(side*5.2-mx);
  if(Math.abs(x)>=5.2)return mz+slope*(x-mx);
  return row.z+(sideZ-row.z)*(Math.abs(x)-4.15)/(5.2-4.15);
}

export function buildTheaterLanding({X,front,back,yFront,yBack,bottom,material}) {
  const stations=[-X,-5.2,-4.15,4.15,5.2,X],positions=[],indices=[];
  for(const x of stations)positions.push(x,bottom,front(x),x,yFront,front(x),x,yBack,back(x),x,bottom,back(x));
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<4;j++) {
    const a=i*4+j,b=(i+1)*4+j,c=(i+1)*4+(j+1)%4,d=i*4+(j+1)%4;
    indices.push(a,d,c,a,c,b);
  }
  indices.push(0,2,1,0,3,2);
  const a=(stations.length-1)*4;indices.push(a,a+1,a+2,a,a+2,a+3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();
  const pos=flat.attributes.position,uv=[];for(let i=0;i<pos.count;i++)uv.push(pos.getX(i)*.5,pos.getZ(i)*.5);
  flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const mesh=new THREE.Mesh(flat,material);mesh.receiveShadow=true;return mesh;
}

// Closed balcony envelope. Every station shares the SAME section vertices:
// the fan-shaped nose, stepped seating deck, rear edge and soffit meet without
// independent boxes/planes leaving a view into the volume between them.
// Section page 4: nose landings are 0.064 m / 0.758 m below the first seats.
export function buildTheaterBalcony({ floor, rows, X, carpet, fascia, soffit, rail }) {
  const root = new THREE.Group();root.name = `Theater balcony ${floor}F`;
  const first = rows[0], last = rows.at(-1);
  const landingY = first.y - (floor === 3 ? .758 : .064);
  const frontHeight = .664, noseOffset = 1.86;
  const stations = [-X, -X+.9, -5.2, -4.15, 4.15, 5.2, X-.9, X];
  const lineAt=theaterRowZ;
  const profile = (x) => {
    const firstZ=lineAt(first,x), lastZ=lineAt(last,x), front=firstZ-noseOffset;
    // Each point's material describes the edge arriving at that point.
    const p=[], add=(z,y,mat)=>p.push({z,y,mat});
    add(front,landingY-.6,2);
    add(front,landingY+frontHeight,1);
    add(front+.16,landingY+frontHeight,1);
    add(front+.16,landingY,1);
    const n=Math.ceil((first.y-landingY)/.18), run=.24;
    const start=firstZ-.2-n*run;
    add(start,landingY,0);
    for(let i=0;i<n;i++) {
      const y=landingY+(first.y-landingY)*(i+1)/n;
      add(start+i*run,y,0);add(start+(i+1)*run,y,0);
    }
    for(let i=1;i<rows.length;i++) {
      const z=lineAt(rows[i],x)-.2;
      add(z,rows[i-1].y,0);add(z,rows[i].y,0);
    }
    add(lastZ+.8,last.y,0);
    add(lastZ+.8,last.y-.55,2);
    add(firstZ+.65,first.y-.55,2);
    if(Math.abs(x)===X) {
      // Reserve the outer aisle as a level doorway landing. Otherwise the
      // closed shell's raked side cap fills the lower rear corner of a gate.
      const gate=THEATER_GATES.find(g=>g.floor===floor&&g.plane==='side'&&g.side===Math.sign(x));
      const deck=p.slice(4,-2),a=gate.z-gate.width/2,b=gate.z+gate.width/2;
      const lo=Math.max(...deck.filter(v=>v.z<=a).map(v=>v.z));
      const hi=Math.min(...deck.filter(v=>v.z>=b).map(v=>v.z));
      for(const v of deck)if(v.z>=lo&&v.z<=hi)v.y=gate.y;
    }
    return p;
  };
  const profiles=stations.map(profile), count=profiles[0].length;
  const positions=[],uv=[],indices=[[],[],[]];
  for(let i=0;i<stations.length;i++)for(const p of profiles[i]) {
    positions.push(stations[i],p.y,p.z);uv.push(stations[i]*.5,p.z*.5);
  }
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<count;j++) {
    const next=(j+1)%count, a=i*count+j,b=(i+1)*count+j,c=(i+1)*count+next,d=i*count+next;
    indices[profiles[i][next].mat].push(a,d,c,a,c,b);
  }
  for(const ring of [0,stations.length-1]) {
    // Flattened landing risers have coincident points. Keep unique cap points
    // and split triangulation edges at every collinear boundary vertex so the
    // cap and loft share complete edges, including along the level landing.
    const unique=[];
    profiles[ring].forEach((p,i)=>{if(!unique.some(v=>Math.abs(v.p.z-p.z)<1e-7&&Math.abs(v.p.y-p.y)<1e-7))unique.push({p,index:ring*count+i});});
    const points=unique.map(({p})=>new THREE.Vector2(p.z,p.y));
    for(const triangle of THREE.ShapeUtils.triangulateShape(points,[])) {
      let [a,b,c]=triangle.map(v=>unique[v].index);
      const A=new THREE.Vector3().fromArray(positions,a*3), B=new THREE.Vector3().fromArray(positions,b*3), C=new THREE.Vector3().fromArray(positions,c*3);
      const normal=B.sub(A).cross(C.sub(A));
      if(normal.x*(ring===0?-1:1)<0)[b,c]=[c,b];
      const boundary=[];
      for(const [start,end] of [[a,b],[b,c],[c,a]]) {
        const z0=positions[start*3+2],y0=positions[start*3+1],dz=positions[end*3+2]-z0,dy=positions[end*3+1]-y0,length=dz*dz+dy*dy;
        const edge=[{index:start,t:0}];
        for(const {p,index} of unique) {
          const t=((p.z-z0)*dz+(p.y-y0)*dy)/length;
          if(t>1e-7&&t<1-1e-7&&Math.abs((p.z-z0)*dy-(p.y-y0)*dz)<1e-7)edge.push({index,t});
        }
        boundary.push(...edge.sort((a,b)=>a.t-b.t).map(v=>v.index));
      }
      if(boundary.length===3)indices[2].push(a,b,c);
      else {
        const middle=positions.length/3;
        const y=(positions[a*3+1]+positions[b*3+1]+positions[c*3+1])/3,z=(positions[a*3+2]+positions[b*3+2]+positions[c*3+2])/3;
        positions.push(stations[ring],y,z);uv.push(stations[ring]*.5,z*.5);
        for(let i=0;i<boundary.length;i++)indices[2].push(middle,boundary[i],boundary[(i+1)%boundary.length]);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  let offset=0;const all=[];
  indices.forEach((list,material)=>{
    const valid=[];
    for(let i=0;i<list.length;i+=3) {
      const a=new THREE.Vector3().fromArray(positions,list[i]*3),b=new THREE.Vector3().fromArray(positions,list[i+1]*3),c=new THREE.Vector3().fromArray(positions,list[i+2]*3);
      if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-14)valid.push(list[i],list[i+1],list[i+2]);
    }
    geometry.addGroup(offset,valid.length,material);all.push(...valid);offset+=valid.length;
  });
  geometry.setIndex(all);
  const flat=geometry.toNonIndexed();flat.computeVertexNormals();geometry.dispose();
  const shell=new THREE.Mesh(flat,[carpet,fascia,soffit]);
  shell.name=`Theater closed balcony shell ${floor}F`;shell.userData.balconyShell=floor;shell.receiveShadow=true;root.add(shell);

  // Brass strips follow the exact same front boundary as the envelope.
  const trims=[];
  for(let i=0;i<stations.length-1;i++) {
    const x0=stations[i],x1=stations[i+1],z0=lineAt(first,x0)-noseOffset-.018,z1=lineAt(first,x1)-noseOffset-.018;
    const length=Math.hypot(x1-x0,z1-z0),angle=-Math.atan2(z1-z0,x1-x0);
    for(const dy of [-.52,.14,.63]) {
      const g=new THREE.BoxGeometry(length,.022,.025);g.rotateY(angle);g.translate((x0+x1)/2,landingY+dy,(z0+z1)/2);trims.push(g);
    }
  }
  // Keep trim meshes cheap without sharing the shell's material topology.
  root.add(new THREE.Mesh(mergeGeometries(trims),rail));trims.forEach(g=>g.dispose());
  return {root,landingY,frontZ:(x)=>lineAt(first,x)-noseOffset,
    lamps:[-9,0,9].map(x=>new THREE.Vector3(x,landingY-.45,lineAt(first,x)-noseOffset-.1))};
}
