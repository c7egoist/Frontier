// Developer-only reactive reference driver. This is NOT an in-game route/assist or human balance evidence.
import { pathToFileURL } from 'node:url';
import { clamp } from '../src/course.js';
import {GLACIER,glacierCentre,createGlacierState,glacierSurface,glacierObstacle,glacierSupported,glacierSpawn,stepGlacierVehicle,advanceGlacier} from '../src/glacier.js';
const STEP=6,MINX=GLACIER.x-210,COLS=71,ROWS=336;
export function navigationGrid(state){
 const staticState={...state,crystals:[]},grid=new Uint8Array(ROWS*COLS),surface=new Float32Array(grid.length);
 for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){
  const x=MINX+col*STEP,z=GLACIER.z+row*STEP,index=row*COLS+col;
  grid[index]=[[0,0],[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dz])=>!glacierObstacle(x+dx,z+dz,staticState))&&glacierSupported(x,z,staticState)&&[[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dz])=>glacierSupported(x+dx,z+dz,staticState));
  surface[index]=glacierSurface(x,z,staticState).kind==='packed snow'?0:glacierSurface(x,z,staticState).kind==='blue ice'?.05:.12;
 }return {grid,surface};
}
export function planAhead(state,car,nav,horizon=180){
 const start=Math.max(0,Math.floor((car.z-GLACIER.z)/STEP)),end=Math.min(334,start+Math.ceil(horizon/STEP)),n=end-start+1;
 const costs=new Float32Array(n*COLS).fill(Infinity),parents=new Int16Array(n*COLS).fill(-1),col0=Math.round((car.x-MINX)/STEP);
 for(let dc=-3;dc<=3;dc++)if(col0+dc>=0&&col0+dc<COLS)costs[col0+dc]=Math.abs(dc)*5;
 const active=state.crystals.filter(p=>['warning','falling','landed'].includes(p.state));
 for(let r=1;r<n;r++)for(let c=0;c<COLS;c++){
  const absolute=(start+r)*COLS+c;if(!nav.grid[absolute])continue;
  const x=MINX+c*STEP,z=GLACIER.z+(start+r)*STEP;
  if(active.some(p=>Math.abs(p.z-z)<(p.state==='landed'?p.rubbleRadius:p.radius)+4&&Math.hypot(x-p.x,z-p.z)<(p.state==='landed'?p.rubbleRadius:p.radius)+4))continue;
  for(let d=-1;d<=1;d++){
   const pc=c+d;if(pc<0||pc>=COLS)continue;
   const previous=(r-1)*COLS+pc,value=costs[previous]+(d?1.45:1)+nav.surface[absolute]+Math.abs(x-glacierCentre((start+r)*STEP))*.0008;
   if(value<costs[r*COLS+c]){costs[r*COLS+c]=value;parents[r*COLS+c]=pc;}
  }
 }
 let best=-1,bestCost=Infinity;
 for(let c=0;c<COLS;c++){
  const x=MINX+c*STEP;if(end>=333&&Math.abs(x-glacierCentre(2000))>6)continue;
  const cost=costs[(n-1)*COLS+c]+Math.abs(x-car.x)*.018;if(cost<bestCost){bestCost=cost;best=c;}
 }
 if(best<0)return [];
 const points=[];for(let r=n-1;r>=0;r--){points.push({x:MINX+best*STEP,z:GLACIER.z+(start+r)*STEP});best=parents[r*COLS+best];if(best<0)break;}return points.reverse();
}
export function referenceRun(seed=711){
 const state=createGlacierState(seed),car={...glacierSpawn(state),vx:0,vz:0,speed:0,heading:0},nav=navigationGrid(state);
 let path=[],nextPlan=0,contacts=0,noPlan=0,backoff=0,lastContact=-999,travel=0,previous={...car};
 for(let frame=0;frame<170*60&&!state.failed&&!state.complete;frame++){
  if(frame>=nextPlan){path=planAhead(state,car,nav);if(!path.length)path=planAhead(state,car,nav,72);if(!path.length)path=planAhead(state,car,nav,36);if(!path.length)noPlan++;nextPlan=frame+24;}
  const speed=Math.abs(car.speed),look=5+speed*.16;
  let target=path.find(p=>p.z>car.z+look)||path.at(-1)||{x:car.x,z:car.z+20};
  const angle=Math.atan2(target.x-car.x,target.z-car.z),velocity=Math.atan2(car.vx,car.vz||.001),slip=Math.atan2(Math.sin(angle-velocity),Math.cos(angle-velocity));
  const wantedHeading=angle+clamp(slip*.6,-.35,.35),err=Math.atan2(Math.sin(wantedHeading-car.heading),Math.cos(wantedHeading-car.heading));
  const surface=glacierSurface(car.x,car.z,state),desired=surface.fragile?Math.min(24,surface.limit-1):29;
  const targetSpeed=Math.abs(angle-car.heading)>.20?12:desired;
  let input={steer:clamp(err*2.8,-1,1),throttle:speed<targetSpeed,brake:speed>targetSpeed+.5,hard:!path.length&&speed>8};
  if(backoff>0){backoff--;input={steer:clamp(-err*2,-.7,.7),brake:true};}
  const contact=stepGlacierVehicle(car,input,1/60,state).contact;if(contact){contacts++;if(frame-lastContact>120){backoff=85;lastContact=frame;}}
  advanceGlacier(state,car,1/60);travel+=Math.hypot(car.x-previous.x,car.z-previous.z);previous={...car};
 }
 return {seed,complete:state.complete,failed:state.failed,time:+state.time.toFixed(2),s:+(car.z-GLACIER.z).toFixed(1),hull:state.hull,waves:state.waves,crystals:state.spawnedCrystals,contacts,noPlan,travel:+travel.toFixed(1)};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){for(const seed of process.argv.slice(2).length?process.argv.slice(2).map(Number):[711,101,202,303,404,505,606])console.log(JSON.stringify(referenceRun(seed)));}
