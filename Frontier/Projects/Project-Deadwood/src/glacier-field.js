import { rng,clamp } from './course.js';
import { GLACIER,glacierCentre,glacierHalfWidth,createAvalanches,createShips } from './glacier-layout.js';

// Voronoi polygons clipped against nearby jittered sites: shared, non-square fracture edges.
// Fixed geology is cached; snow, pressure ridges and open leads change with the run seed.
const STEP=13,MINX=-195,MINZ=-26,COLS=31,ROWS=159;
let geology;
function clip(poly,nx,nz,limit){
 const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=a.x*nx+a.z*nz-limit,db=b.x*nx+b.z*nz-limit;
  if(da<=1e-7)out.push(a);
  if((da<0)!==(db<0)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
 }return out;
}
export function createIceCells(){
 if(geology)return geology;
 const random=rng(93071),sites=[];
 for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++)sites.push({col,row,x:MINX+(col+.5)*STEP+(random()-.5)*STEP*.67,z:MINZ+(row+.5)*STEP+(random()-.5)*STEP*.67});
 const cells=sites.map((p,id)=>{
  let polygon=[{x:p.x-STEP*2,z:p.z-STEP*2},{x:p.x+STEP*2,z:p.z-STEP*2},{x:p.x+STEP*2,z:p.z+STEP*2},{x:p.x-STEP*2,z:p.z+STEP*2}];
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
   if((!dx&&!dz)||p.row+dz<0||p.row+dz>=ROWS||p.col+dx<0||p.col+dx>=COLS)continue;
   const q=sites[(p.row+dz)*COLS+p.col+dx],nx=q.x-p.x,nz=q.z-p.z;
   polygon=clip(polygon,nx,nz,(q.x*q.x+q.z*q.z-p.x*p.x-p.z*p.z)/2);
  }
  polygon=polygon.map(v=>({x:v.x+GLACIER.x,z:v.z+GLACIER.z}));
  return {id,col:p.col,row:p.row,x:p.x+GLACIER.x,s:p.z,z:p.z+GLACIER.z,polygon,phase:random()*6.28,active:Math.abs(p.x+GLACIER.x-glacierCentre(p.z))<glacierHalfWidth(p.z)+7};
 });
 geology={cells,sites};return geology;
}
export function cellAt(x,z){
 const {cells}=createIceCells(),col=Math.floor((x-GLACIER.x-MINX)/STEP),row=Math.floor((z-GLACIER.z-MINZ)/STEP);
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  const c=col+dx,r=row+dz;if(c<0||c>=COLS||r<0||r>=ROWS)continue;
  const cell=cells[r*COLS+c],p=cell.polygon;let inside=true;
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x)<-1e-5){inside=false;break;}}
  if(inside)return cell;
 }return null;
}
export function ellipseDistance(x,z,p){
 const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0);
 return Math.hypot((dx*c-dz*s)/p.rx,(dx*s+dz*c)/p.rz);
}
export function createIceField(seed=711,attempt=0){
 const random=rng((seed^0x51aa9)+attempt*7919),snow=[],firm=[],ridges=[],fissures=[];
 const point=(start=110,end=1910)=>{const s=start+random()*(end-start);return {s,x:glacierCentre(s)+(random()-.5)*glacierHalfWidth(s)*1.65,z:GLACIER.z+s,yaw:(random()-.5)*2.4};};
 for(let i=0;i<162;i++)snow.push({...point(80,1940),rx:9+random()*10,rz:12+random()*20});
 for(let i=0;i<53;i++)firm.push({...point(),rx:18+random()*20,rz:21+random()*29});
 const avalanches=createAvalanches();
 for(let i=0;i<64;i++){
  const p=point();if(avalanches.some(a=>Math.abs(p.z-a.z)<a.depth*.7&&Math.abs(p.x-a.x)<a.width*.7))continue;
  ridges.push({...p,rx:6+random()*6,rz:14+random()*13,height:5+random()*10});
 }
 for(let i=0;i<19;i++){
  const p=point(170,1880);if(avalanches.some(a=>Math.abs(p.z-a.z)<75))continue;
  if(ridges.some(r=>Math.hypot(r.x-p.x,r.z-p.z)<25))continue;
  fissures.push({...p,rx:7+random()*4,rz:18+random()*11});
 }
 const voidCells=new Set();for(const c of createIceCells().cells)if(fissures.some(f=>ellipseDistance(c.x,c.z,f)<1))voidCells.add(c.id);
 const field={seed,snow,firm,ridges,fissures,voidCells,attempt};
 if(!fieldReachable(field,{x:glacierCentre(0),z:GLACIER.z},2000,[],createAvalanches(),2)){
  if(attempt<8)return createIceField(seed,attempt+1);
  // Bounded fail-safe: remove obstructing outcrops, never silently ship a sealed random field.
  while(ridges.length&&!fieldReachable(field,{x:glacierCentre(0),z:GLACIER.z},2000,[],[],2))ridges.pop();
  if(!fieldReachable(field,{x:glacierCentre(0),z:GLACIER.z},2000,[],[],2))voidCells.clear();
 }
 return field;
}
export function snowCoverage(x,z,field){
 let value=0;for(const p of field.snow){if(Math.abs(z-p.z)>p.rz+p.rx)continue;value=Math.max(value,clamp((1-ellipseDistance(x,z,p))*4,0,1));}return value;
}
export function onFirmIce(x,z,field){return field.firm.some(p=>Math.abs(z-p.z)<p.rz+p.rx&&ellipseDistance(x,z,p)<1);}
export const collapseAt=(x,state)=>state.front+5*Math.sin(x*.147+state.seed*.01)+3*Math.sin(x*.39);
export function ridgeContact(x,z,field,padding=1.2){
 return field.ridges.some(p=>Math.abs(z-p.z)<p.rz+p.rx+padding&&ellipseDistance(x,z,{...p,rx:p.rx+padding,rz:p.rz+padding})<1);
}

// Forward connectivity check, not an authored path. Used to reject sealed random fields/showers.
export function fieldReachable(field,car,endS,discs=[],avalanches=[],margin=1.5){
 const step=6,min=GLACIER.x-192,cols=65,ships=createShips(),startS=car.z-GLACIER.z;
 let previous=new Uint8Array(cols);for(let c=0;c<cols;c++)if(Math.abs(min+c*step-car.x)<step+1)previous[c]=1;
 for(let s=startS+step;s<=endS+step*.5;s+=step){
  const next=new Uint8Array(cols),z=GLACIER.z+s,w=glacierHalfWidth(s)-3;
  for(let c=1;c<cols-1;c++){
   if(!previous[c-1]&&!previous[c]&&!previous[c+1])continue;
   const x=min+c*step;if(Math.abs(x-glacierCentre(s))>w)continue;
   if(s>1980&&Math.abs(x-glacierCentre(2000))>9)continue;
   const cell=cellAt(x,z);if(!cell||field.voidCells.has(cell.id)||ridgeContact(x,z,field,margin+1.2))continue;
   if(ships.some(p=>{const dx=x-p.x,dz=z-p.z,co=Math.cos(p.yaw),si=Math.sin(p.yaw);return Math.hypot(dx*co-dz*si,Math.max(0,Math.abs(dx*si+dz*co)-(p.length*.5-p.width)))<p.width+margin+1.2;}))continue;
   if(avalanches.some(a=>a.state!=='open'&&Math.abs(x-a.x)<a.width/2+margin+1.2&&Math.abs(z-a.z)<a.depth/2+margin+1.2))continue;
   if(discs.some(p=>Math.abs(p.z-z)<p.r+margin+1.2&&Math.hypot(x-p.x,z-p.z)<p.r+margin+1.2))continue;
   next[c]=1;
  }
  if(!next.some(Boolean))return false;previous=next;
 }return previous.some(Boolean);
}
