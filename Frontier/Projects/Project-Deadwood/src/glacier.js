import { GLACIER,glacierCentre,glacierY,glacierHalfWidth,createShips,createAvalanches } from './glacier-layout.js';
import { createIceField,cellAt,collapseAt,snowCoverage,onFirmIce,ridgeContact,fieldReachable } from './glacier-field.js';
import { STORM,createCrystals,shipDistance,advanceCrystalStorm } from './glacier-storm.js';
export * from './glacier-layout.js';
export { createCrystals,STORM,advanceCrystalStorm } from './glacier-storm.js';
export { cellAt,collapseAt } from './glacier-field.js';

export function createGlacierState(seed=711){return {seed,time:0,hazardTime:0,started:false,front:GLACIER.collapseStart,load:0,hull:100,lastHit:-100,failed:null,failureAge:0,complete:false,
 field:createIceField(seed),avalanches:createAvalanches(),crystals:createCrystals(),holes:[],broken:new Set(),fractures:new Map(),impacts:[],shortcutUses:[],lastContact:-100,previousZ:GLACIER.z,
 stormTime:0,nextStorm:.2,waves:0,spawnedCrystals:0,stormPreview:false};}
export function glacierSurface(x,z,state){
 const s=z-GLACIER.z,field=state.field,snow=snowCoverage(x,z,field)>.35;
 const shortcut=state.avalanches.find(a=>a.state==='open'&&Math.abs(z-a.z)<a.depth*.9&&Math.abs(x-a.x)<a.width*.6);
 if(snow)return {kind:'packed snow',grip:7.6,brake:29,limit:38,fragile:false};
 if(shortcut)return {kind:'avalanche ice',grip:.85,brake:15,limit:22,fragile:true,shortcut:shortcut.id};
 if(s<85||s>1940||onFirmIce(x,z,field))return {kind:'blue ice',grip:2.5,brake:22,limit:38,fragile:false};
 const strength=26+Math.sin(x*.032+s*.021+state.seed)*1.8;
 return {kind:'thin black ice',grip:1.05,brake:18,limit:strength,fragile:true};
}
export function glacierObstacle(x,z,state,ships=createShips()){
 const s=z-GLACIER.z;
 if(Math.abs(x-glacierCentre(s))>glacierHalfWidth(s)-2||s< -14||s>GLACIER.length+12||(s>GLACIER.length+2&&Math.abs(x-glacierCentre(GLACIER.length))>9))return 'wall';
 if(ships.some(ship=>shipDistance(x,z,ship)<1.25))return 'hull';
 if(ridgeContact(x,z,state.field))return 'pressure ridge';
 for(const a of state.avalanches)if(a.state!=='open'&&Math.abs(x-a.x)<a.width/2+1.2&&Math.abs(z-a.z)<a.depth/2+1.2)return 'ice wall';
 for(const p of state.crystals)if(p.state==='landed'&&Math.hypot(x-p.x,z-p.z)<p.rubbleRadius+1.2)return 'fallen crystal';
 return null;
}
export function glacierDamage(state,amount){
 const now=Math.max(state.time,state.hazardTime);
 if(now-state.lastHit<.85||state.failed)return false;
 state.hull=Math.max(0,state.hull-amount);state.lastHit=now;
 if(!state.hull)state.failed='Vehicle crushed';return true;
}
export function glacierSupported(x,z,state){
 const cell=cellAt(x,z);return !!cell&&z-GLACIER.z>collapseAt(x,state)&&!state.broken.has(cell.id)&&!state.field.voidCells.has(cell.id);
}
function stressIce(state,car,dt,surface,speed){
 if(surface.fragile&&speed>surface.limit)state.load+=dt*(.28+(speed-surface.limit)*.052);
 else state.load=Math.max(0,state.load-dt*(surface.kind==='packed snow'?1.1:.62));
 if(state.load>.06){
  const c=cellAt(car.x,car.z);if(c){
   let f=state.fractures.get(c.id);if(!f){f={damage:0,age:0};state.fractures.set(c.id,f);}f.damage=Math.max(f.damage,state.load);f.age=0;
   // Strain follows the contact footprint into adjacent polygons, rather than a radial star decal.
   for(const [dx,dz] of [[-5,-2],[5,2],[-2,6],[2,-6]]){
    const n=cellAt(car.x+dx,car.z+dz);if(n&&n.id!==c.id){const q=state.fractures.get(n.id)||{damage:0,age:0};q.damage=Math.max(q.damage,state.load*.55);q.age=0;state.fractures.set(n.id,q);}
   }
  }
 }
 for(const [id,f] of state.fractures){f.age+=dt;if(f.age>12&&!state.broken.has(id))state.fractures.delete(id);}
 if(state.load>=1){
  const c=cellAt(car.x,car.z);if(c){
   const cells=[c.id];state.broken.add(c.id);
   for(const [dx,dz] of [[5,2],[-3,-5]]){const n=cellAt(car.x+dx,car.z+dz);if(n&&!cells.includes(n.id)){cells.push(n.id);state.broken.add(n.id);}}
   state.holes.push({cells,x:car.x,z:car.z,age:0});
  }
  state.failed='The ice broke beneath you';state.impacts.push({x:car.x,z:car.z,age:0,size:4});
 }
}
export function advanceGlacier(state,car,dt,ships=createShips()){
 const events=[];
 if(state.failed){state.failureAge+=dt;state.impacts.forEach(p=>p.age+=dt);state.impacts=state.impacts.filter(p=>p.age<2);return events;}
 if(state.complete)return events;
 state.hazardTime+=dt;if(state.started)state.time+=dt;
 state.front=GLACIER.collapseStart+Math.max(0,state.time-GLACIER.collapseDelay)*GLACIER.collapseSpeed;
 const s=car.z-GLACIER.z,surface=glacierSurface(car.x,car.z,state),speed=Math.hypot(car.vx||0,car.vz||0);
 if(state.started){
  stressIce(state,car,dt,surface,speed);
  if(!glacierSupported(car.x,car.z,state)){
   state.failed=state.failed||(s<collapseAt(car.x,state)?'The collapse front caught you':'You drove into an open lead');events.push({kind:'fall'});
  }
 }
 for(const a of state.avalanches){
  if(a.state==='sealed'&&s>a.s-140){a.state='rumbling';a.age=0;events.push({kind:'avalanche-warning',avalanche:a});}
  else if(a.state==='rumbling'){a.age+=dt;if(a.age>1.25){a.state='falling';a.age=0;events.push({kind:'avalanche',avalanche:a});}}
  else if(a.state==='falling'){
   a.age+=dt;if(Math.abs(car.x-a.x)<a.width*.6&&Math.abs(car.z-a.z)<a.depth*.65&&glacierDamage(state,55))events.push({kind:'hit',amount:55});
   if(a.age>1.6){a.state='open';a.age=0;events.push({kind:'shortcut-open',avalanche:a});}
  }else if(a.state==='open'&&Math.abs(car.x-a.x)<a.width*.5&&Math.abs(car.z-a.z)<a.depth*.5&&!state.shortcutUses.includes(a.id))state.shortcutUses.push(a.id);
 }
 if(state.started||state.stormPreview)events.push(...advanceCrystalStorm(state,car,dt,amount=>glacierDamage(state,amount),ships));
 state.impacts.forEach(p=>p.age+=dt);state.impacts=state.impacts.filter(p=>p.age<2);
 if(state.previousZ<GLACIER.z+GLACIER.length&&s>=GLACIER.length&&Math.abs(car.x-glacierCentre(GLACIER.length))<10&&!state.failed){state.complete=true;events.push({kind:'portal'});}
 state.previousZ=car.z;return events;
}
// Velocity and facing are distinct. Grip islands let you change momentum, not follow a painted lane.
export function stepGlacierVehicle(car,input,dt,state,ships=createShips()){
 if(state.failed||state.complete)return {contact:null};car.vx??=0;car.vz??=0;
 const surface=glacierSurface(car.x,car.z,state),speed=Math.hypot(car.vx,car.vz),steer=input.steer||0,throttle=input.throttle?1:0;
 if(throttle)state.started=true;
 const forward=car.vx*Math.sin(car.heading)+car.vz*Math.cos(car.heading);
 car.heading+=steer*(surface.grip>4?1.08:.86)*Math.min(1,speed/5)*dt*(forward<-.2?-1:1);
 const fx=Math.sin(car.heading),fz=Math.cos(car.heading),projection=car.vx*fx+car.vz*fz,realign=1-Math.exp(-surface.grip*dt);
 car.vx+=(fx*projection-car.vx)*realign;car.vz+=(fz*projection-car.vz)*realign;
 const acceleration=throttle*13-(input.brake?(forward>1?surface.brake:8):0);
 car.vx+=fx*acceleration*dt;car.vz+=fz*acceleration*dt;
 const drag=Math.exp(-(input.hard?surface.brake/Math.max(5,speed):throttle?.07:.2)*dt);car.vx*=drag;car.vz*=drag;
 const v=Math.hypot(car.vx,car.vz);if(v>GLACIER.maxSpeed){car.vx*=GLACIER.maxSpeed/v;car.vz*=GLACIER.maxSpeed/v;}
 const nx=car.x+car.vx*dt,nz=car.z+car.vz*dt,contact=glacierObstacle(nx,nz,state,ships);
 if(contact){car.vx*=.2;car.vz*=.2;if(v>12&&state.hazardTime-state.lastContact>.8){glacierDamage(state,contact==='hull'?22:10);state.lastContact=state.hazardTime;}}
 else{car.x=nx;car.z=nz;}
 car.speed=Math.hypot(car.vx,car.vz)*((car.vx*fx+car.vz*fz)<0?-1:1);return {contact};
}
export function glacierSpawn(state,s=0,connected=false){
 for(let d=0;d<glacierHalfWidth(s)-5;d+=5)for(const sign of [1,-1]){const x=glacierCentre(s)+d*sign;if(!glacierObstacle(x,GLACIER.z+s,state)&&glacierSupported(x,GLACIER.z+s,state)&&(!connected||fieldReachable(state.field,{x,z:GLACIER.z+s},Math.min(2000,s+220),[],state.avalanches,1.5)))return {x,z:GLACIER.z+s};}
 return {x:glacierCentre(s),z:GLACIER.z+s};
}
