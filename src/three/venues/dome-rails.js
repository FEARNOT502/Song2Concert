import * as THREE from 'three';

// A single face through the balcony walls and the screen backing, with
// their common horizontal soffit at the balcony fascia's underside.
export function outfieldWallProfile(data) {
  const walls=[...data.upperWall].sort((a,b)=>a.pts.at(-1)[0]-b.pts.at(-1)[0]);
  const [left,right]=walls,m=data.upperOutfieldMass;
  const massBottoms=m.front.map(()=>m.y0);
  return {
    points:[...left.pts,...m.front.slice(1),...right.pts.slice(0,-1).reverse()],
    bottoms:[...left.y0,...massBottoms.slice(1),...right.y0.slice(0,-1).reverse()],
    joins:[left.pts.length-1,left.pts.length+m.front.length-2],massBottoms,
  };
}

// A closed band with a true miter at every corner. The same vertices serve
// the front and the return, including their top, underside and end caps.
export function joinedStrip(points, tops, bottoms, thickness) {
  const count = points.length, half = thickness / 2;
  if (count < 2) return null;
  const directions = points.slice(1).map((p, i) => new THREE.Vector2(p.x-points[i].x,p.z-points[i].z).normalize());
  const normals = directions.map(d => new THREE.Vector2(-d.y,d.x));
  const offsets = points.map((_, i) => {
    if (i === 0) return normals[0].clone().multiplyScalar(half);
    if (i === count-1) return normals.at(-1).clone().multiplyScalar(half);
    const m = normals[i-1].clone().add(normals[i]).normalize();
    return m.multiplyScalar(half/Math.max(.25,m.dot(normals[i])));
  });
  const positions = [], quad = (a,b,c,d) => positions.push(...a,...b,...c,...a,...c,...d);
  const at = (i, side, y) => [points[i].x+offsets[i].x*side,y,points[i].z+offsets[i].y*side];
  for(let i=0;i<count-1;i++){
    const j=i+1,a=at(i,1,bottoms[i]),b=at(j,1,bottoms[j]),c=at(j,-1,bottoms[j]),d=at(i,-1,bottoms[i]);
    const A=at(i,1,tops[i]),B=at(j,1,tops[j]),C=at(j,-1,tops[j]),D=at(i,-1,tops[i]);
    quad(a,b,B,A);quad(c,d,D,C);quad(A,B,C,D);quad(d,c,b,a);
    if(i===0)quad(d,a,A,D);
    if(j===count-1)quad(b,c,C,B);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}
