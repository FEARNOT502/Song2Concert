import * as THREE from 'three';
import {stageTex,std,withRepeat} from '../core.js';
import {THEATER_SPLAY,theaterWallX} from './theater-walls.js';

// A single footprint for the main deck, apron, side bridges and landings.
// Coplanar separate tops caused both depth fighting and different UV scales.
export function buildTheaterStage({openingWidth,height,front,portalFront,mainFront}) {
  const half=Math.min((openingWidth+2)/2,THEATER_SPLAY.nearX-.1),bridgeInner=7.35,landingInner=7.4;
  const bridgeFront=portalFront+1.15,landingFront=7.05;
  const landingOuter=theaterWallX(landingFront)-.1;
  const a=new THREE.Vector2(half,front-.8),b=new THREE.Vector2(half,front),c=new THREE.Vector2(0,front+.2);
  const t=Math.sqrt(1-bridgeInner/half),q=b.clone().lerp(c,t);
  const start=a.clone().lerp(b,t).lerp(q,t);
  const shape=new THREE.Shape();
  shape.moveTo(-12,-14);shape.lineTo(12,-14);shape.lineTo(12,mainFront);
  shape.lineTo(half,mainFront);shape.lineTo(half,portalFront);shape.lineTo(half,THEATER_SPLAY.frontZ);
  shape.lineTo(landingOuter,landingFront);shape.lineTo(landingInner,landingFront);shape.lineTo(landingInner,bridgeFront);
  shape.lineTo(bridgeInner,bridgeFront);shape.lineTo(start.x,start.y);shape.quadraticCurveTo(q.x,q.y,0,c.y);
  shape.quadraticCurveTo(-q.x,q.y,-start.x,start.y);shape.lineTo(-bridgeInner,bridgeFront);
  shape.lineTo(-landingInner,bridgeFront);shape.lineTo(-landingInner,landingFront);shape.lineTo(-landingOuter,landingFront);
  shape.lineTo(-half,THEATER_SPLAY.frontZ);shape.lineTo(-half,portalFront);shape.lineTo(-half,mainFront);shape.lineTo(-12,mainFront);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:32});
  geometry.rotateX(Math.PI/2);geometry.translate(0,height,0);
  const p=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/2.44,p.getZ(i)/2.44);
  const top=std({...withRepeat(stageTex(),1,1),roughnessMap:null,roughness:.88,metalness:0});
  const deck=new THREE.Mesh(geometry,[top,std({color:0x050505,roughness:.8})]);
  deck.name='Theater continuous stage deck';deck.userData.plan='stage';deck.receiveShadow=true;
  const lipPath=new THREE.CurvePath(),y=height-.01;
  lipPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-start.x,y,start.y+.01),new THREE.Vector3(-q.x,y,q.y+.01),new THREE.Vector3(0,y,c.y+.01)));
  lipPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,y,c.y+.01),new THREE.Vector3(q.x,y,q.y+.01),new THREE.Vector3(start.x,y,start.y+.01)));
  return {deck,lipPath};
}
