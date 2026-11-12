// Exercise the actual app renderer and Walker, including both directions of
// every inter-floor stair and the 14 upper/8 outfield vomitories.
// CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-dome.mjs [output-folder]
// DOME_DATA=/absolute/path/to/td_stands.json can review a staged generator run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(process.argv[2]||'/tmp/dome-review');
fs.mkdirSync(output,{recursive:true});
const html=`<html><style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas></canvas><script type="module">
import {createStage} from './src/three/stage.js';
window.stage=createStage(document.querySelector('canvas'),{quality:'low',effects:false,onLoading:on=>window.ready=!on});
stage.resize(innerWidth,innerHeight);stage.start();stage.setVenue('dome');
</script></html>`;
const server=await createServer({root,server:{port:0},logLevel:'error',plugins:[{
  name:'verify-dome',enforce:'pre',
  configureServer(s){s.middlewares.use((req,res,next)=>{
    if(!req.url?.endsWith('/__verify_dome'))return next();
    res.setHeader('Content-Type','text/html');res.end(html);
  });},
  transform(code,id){
    if(process.env.DOME_DATA&&id.endsWith('/src/three/venues/td-data.js'))
      return 'export const TD_STANDS='+fs.readFileSync(process.env.DOME_DATA,'utf8')+';';
    if(id.endsWith('/src/three/venues/dome.js'))
      return code.replace('const stands = buildStands(TD, {','window.__verifyDomePillars=TD.pillars;\n  const stands = buildStands(TD, {');
  },
}]});
let browser;
try{
  await server.listen();
  const port=server.httpServer.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:960,height:640}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await page.addInitScript(()=>{
    const get=WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension=function(name){return name==='KHR_parallel_shader_compile'?null:get.call(this,name);};
  });
  await page.goto(`http://localhost:${port}${server.config.base}__verify_dome`);
  await page.waitForFunction(()=>window.ready&&window.stage.stats().drawn>1,null,{timeout:60000});
  const report=await page.evaluate(async()=>{
    const {TD_STANDS:D}=await import('./src/three/venues/td-data.js');
    const {walker:W,pipe}=stage.debug;W.ensureIndex();
    const checks=[];
    const place=(x,y,z)=>{W.feet.set(x,y,z);W.gy=y;W.grounded=true;W.seated=null;W.vy=0;W.held.clear();};
    const move=(x,z)=>{
      for(let i=0;i<1800;i++){
        const dx=x-W.feet.x,dz=z-W.feet.z;
        if(Math.hypot(dx,dz)<.12)break;
        W.yaw=Math.atan2(dx,-dz);W.held.add('w');
        const px=W.feet.x,pz=W.feet.z;W.update(1/30,pipe.camera);
        if(Math.hypot(W.feet.x-px,W.feet.z-pz)<1e-5)break;
      }
      W.held.clear();return Math.hypot(x-W.feet.x,z-W.feet.z);
    };
    const segment=(name,a,b,y0,y1)=>{
      const g=W.ground(a[0],a[1]+114,y0+.45);
      if(g===null){checks.push({name,error:'missing start floor'});return;}
      place(a[0],g,a[1]+114);
      const distance=move(b[0],b[1]+114),endY=W.feet.y;
      const result={name,distance:+distance.toFixed(3),heightError:+Math.abs(endY-y1).toFixed(3)};
      if(distance>.2||Math.abs(endY-y1)>.12){
        const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ray=W.ray.clone();
        ray.direction.set(dx/len,0,dz/len);ray.origin.copy(W.feet);ray.origin.y+=1.55;
        const hit=W.bvh.raycastFirst(ray,2,0,1);
        result.end=W.feet.toArray();result.hit=hit&&{point:hit.point.toArray(),normal:hit.face.normal.toArray()};
        result.ground=[0,.2,.4,.7].map(t=>W.ground(W.feet.x+dx/len*t,W.feet.z+dz/len*t,W.feet.y+1.5));
        ray.origin.set(W.feet.x+dx/len*.2,result.ground[1]+.05,W.feet.z+dz/len*.2);ray.direction.set(0,1,0);
        const head=W.bvh.raycastFirst(ray,2,0,1.7);
        result.head=head&&{point:head.point.toArray(),normal:head.face.normal.toArray()};
      }
      checks.push(result);
    };
    for(const [i,f] of [...D.flights,...(D.accessFlights||[])].entries()){
      const a=[f.x-f.dx*.7,f.z-f.dz*.7],b=[f.x+f.dx*(f.L+.7),f.z+f.dz*(f.L+.7)];
      segment(`stair-${i}-up`,a,b,f.y0,f.y1);
      segment(`stair-${i}-down`,b,a,f.y1,f.y0);
    }
    for(const name of ['E','F']){
      const level=D.levels.find(l=>l.name===name);
      for(const [i,v] of level.voms.entries())for(const offset of name==='F'?[-1.2,1.2]:[0]){
        const [dx,dz]=v.u,ox=-dz*offset,oz=dx*offset;
        const front=name==='F'?.3:.7;
        const a=[v.p[0]-dx*front+ox,v.p[1]-dz*front+oz];
        const b=[v.p[0]+dx*(v.L+v.T+.7)+ox,v.p[1]+dz*(v.L+v.T+.7)+oz];
        segment(`${name}-vom-${i}-${offset}-in`,a,b,v.y,v.top??v.y);
        segment(`${name}-vom-${i}-${offset}-out`,b,a,v.top??v.y,v.y);
      }
    }
    const route=(name,points,y)=>{
      const a=points[0],g=W.ground(a[0],a[1]+114,y+.4);
      if(g===null){checks.push({name,error:'missing route floor'});return;}
      place(a[0],g,a[1]+114);
      let failure=null;
      for(let i=1;i<points.length;i++){
        const d=move(points[i][0],points[i][1]+114);
        if(d>.2||Math.abs(W.feet.y-y)>.12){failure={at:i,distance:+d.toFixed(3),end:W.feet.toArray()};break;}
      }
      checks.push({name,points:points.length,...(failure?{error:failure}:{distance:0,heightError:0})});
    };
    const c1=D.concourseRoutes.find(r=>r.id==='C1');
    route('C1-circuit',c1.walkLine,c1.y);
    const sides=D.balconyRooms.sides.map(sd=>sd.back.slice(6,-6).map(([x,z])=>{
      const r=Math.hypot(x,z+60);return [x-x/r*1.1,z-(z+60)/r*1.1];
    }));
    route('C3-rear-corridor',[...sides[0].slice().reverse(),...sides[1]],D.balconyRooms.y);
    const e=D.levels.find(l=>l.name==='E');
    const c4=e.voms.map(v=>[v.p[0]+v.u[0]*(v.L+3),v.p[1]+v.u[1]*(v.L+3)])
      .sort((a,b)=>Math.atan2(a[0],a[1]+60)-Math.atan2(b[0],b[1]+60));
    route('C4-rear-corridor',c4,24);
    return {checks,stats:stage.stats(),effectivePillars:window.__verifyDomePillars};
  });
  fs.writeFileSync(path.join(output,'walk.json'),JSON.stringify(report,null,2));
  const failed=report.checks.filter(c=>c.error||c.distance>.2||c.heightError>.12);
  console.log(JSON.stringify({checks:report.checks.length,failed,errors},null,2));
  if(process.argv.includes('--screenshots')){
    for(const v of [
      {name:'junction',eye:[82,12,58],target:[62,5,34]},
      {name:'balcony',eye:[42,17,130],target:[75,18,105]},
      {name:'balcony-columns',eye:[61,17,109],target:[85,18,118]},
      {name:'A02-tunnel',eye:[67,7,60],target:[77,4,48]},
      {name:'outfield',eye:[0,20,125],target:[0,16,-9]},
      {name:'outfield-side',eye:[40,16,35],target:[65,10,4]},
      {name:'scoreboard',eye:[0,10,5],target:[0,14,-12]},
    ].filter(v=>{const flag=process.argv.find(s=>s.startsWith('--views='));return !flag||flag.slice(8).split(',').includes(v.name);})){
      await page.evaluate(v=>{const {walker:w,pipe:p}=stage.debug;w.home={eye:p.camera.position.clone().set(...v.eye),target:p.camera.position.clone().set(...v.target)};w.reset();w.update(0,p.camera);},v);
      const n=await page.evaluate(()=>stage.stats().drawn);
      await page.waitForFunction(n=>stage.stats().drawn>n+1,n,{timeout:30000});
      await page.screenshot({path:path.join(output,`${v.name}.png`)});
    }
  }
  assert.deepEqual(errors,[],'renderer error');
  assert.equal(failed.length,0,'Dome walk route failed; see walk.json');
}finally{await browser?.close();await server.close();}
