// Figure 2 of the Takenaka roof paper specifies 8.5m cable spacing.
// The wall-side progression omits strokes on that uniform grid.
const GRID=8.5;
export const DOME_ROOF=Object.freeze({radius:100.5,exponent:1.53,grid:GRID,core:GRID*6.5,centreZ:81,gridOriginZ:81});
export const ROOF_WINGS=['home','outfield','first','third'];

// The four plain corner panels start at straight cable boundaries. End the
// periodic cloth deformation on the grid side, before entering those panels.
export function roofTriangleGLSL() {
  const edge=DOME_ROOF.core.toFixed(4),start=(DOME_ROOF.core-3.5).toFixed(4);
  return `float trianglePanel(vec2 c) {
    return smoothstep(${start},${edge},abs(c.x))*smoothstep(${start},${edge},abs(c.y));
  }
  float roofSagWeight(vec2 c) { return 1.0-trianglePanel(c); }`;
}

export function roofFoldRows(wing='home') {
  const R=DOME_ROOF,axis=wing==='home'||wing==='outfield'?1:0;
  const sign=wing==='outfield'||wing==='third'?-1:1;
  const shift=[0,R.gridOriginZ-R.centreZ];
  const norm=p=>(Math.abs(p[0]/R.radius)**R.exponent+Math.abs(p[1]/R.radius)**R.exponent)**(1/R.exponent);
  const point=(along,cross)=>axis?[cross+shift[0],along+shift[1]]:[along+shift[0],cross+shift[1]];
  let outer=0;
  for(let k=20;k>=0;k--){
    const along=sign*(k+.5)*GRID;
    if([-2.5*GRID,2.5*GRID].every(c=>norm(point(along,c))<=1)){outer=k;break;}
  }
  return [5,7,9,11,13].map((bays,i)=>({wing,bays,half:bays*GRID/2,axis:sign*(outer+.5-i)*GRID,axisIndex:sign*(outer-i),axisDimension:axis}));
}

export function roofLineMaskGLSL() {
  const f=n=>n.toFixed(7),outer=wing=>Math.abs(roofFoldRows(wing)[0].axis);
  return `float trimmedCross(float primary,float along,float first,float aa) {
    float row=floor((first-abs(along))/${f(GRID)}+.5);
    if(row<0.0)return 0.0;
    if(row>=5.0)return 1.0;
    float halfWidth=(2.5+row)*${f(GRID)};
    return 1.0-smoothstep(halfWidth,halfWidth+aa,abs(primary));
  }
  vec2 roofLineMask(vec2 c,vec2 fw,float bowedZ) {
    float xFirst=c.x>=0.0?${f(outer('first'))}:${f(outer('third'))};
    float zFirst=c.y>=0.0?${f(outer('home'))}:${f(outer('outfield'))};
    return vec2(trimmedCross(c.y,c.x,xFirst,fw.y),trimmedCross(c.x,bowedZ,zFirst,fw.x));
  }`;
}
