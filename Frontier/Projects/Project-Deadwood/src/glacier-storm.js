import { rng } from './course.js';
import { GLACIER,glacierCentre,glacierHalfWidth,glacierY,createShips } from './glacier-layout.js';
import { cellAt,ridgeContact,fieldReachable } from './glacier-field.js';
export const STORM=Object.freeze({capacity:320,minBatch:18,maxBatch:27,minInterval:2.4,maxInterval:3.5,minAhead:60,maxAhead:140});
export function createCrystals(){return Array.from({length:STORM.capacity},(_,id)=>({id,state:'inactive',age:0,x:0,z:0,s:0,y:0,top:32,radius:3,height:13,warning:1.2,hit:false,life:20,wave:0}));}
export function shipDistance(x,z,p){const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw),s=Math.sin(p.yaw);return Math.hypot(dx*c-dz*s,Math.max(0,Math.abs(dx*s+dz*c)-(p.length*.5-p.width)))-p.width;}
// Conservative projection of BOTH airborne and landed ice. No permanent safe lane is reserved.
export function stormGaps(s,state,extra=null,ships=createShips()){
 const width=glacierHalfWidth(s)-4,z=GLACIER.z+s,gaps=[];let start=null;
 for(let off=-width;off<=width;off+=3){
  const x=glacierCentre(s)+off,cell=cellAt(x,z);
  let blocked=!cell||state.field.voidCells.has(cell.id)||ridgeContact(x,z,state.field,2)||ships.some(p=>shipDistance(x,z,p)<3);
  if(!blocked&&state.avalanches.some(a=>a.state!=='open'&&Math.abs(x-a.x)<a.width/2+3&&Math.abs(z-a.z)<a.depth/2+3))blocked=true;
  if(!blocked)for(const p of state.crystals){if(!['warning','falling','landed'].includes(p.state))continue;if(Math.abs(p.z-z)<(p.state==='landed'?p.rubbleRadius:p.radius)+3&&Math.hypot(x-p.x,z-p.z)<(p.state==='landed'?p.rubbleRadius:p.radius)+3){blocked=true;break;}}
  if(!blocked&&extra&&Math.hypot(x-extra.x,z-extra.z)<extra.radius+3)blocked=true;
  if(!blocked&&start===null)start=off;
  if((blocked||off+3>width)&&start!==null){const end=blocked?off-3:off;if(end-start>=9)gaps.push({from:glacierCentre(s)+start,to:glacierCentre(s)+end,width:end-start});start=null;}
 }return gaps;
}
export function spawnCrystalWave(state,car,ships=createShips()){
 const random=state.stormRandom||(state.stormRandom=rng(state.seed^0x7195a)),s=car.z-GLACIER.z;
 if(s>1930)return [];
 const want=STORM.minBatch+Math.floor(random()*(STORM.maxBatch-STORM.minBatch+1)),spawned=[];
 const slots=state.crystals.filter(p=>p.state==='inactive');
 // A shower fills several randomly placed lobes, not a single aimed crystal or authored station.
 const lobes=Array.from({length:3},()=>({s:s+STORM.minAhead+random()*(STORM.maxAhead-STORM.minAhead),off:(random()-.5)*glacierHalfWidth(s+65)*1.5}));
 for(let attempt=0;spawned.length<want&&attempt<220&&spawned.length<slots.length;attempt++){
  const lobe=lobes[attempt%3],station=Math.max(s+55,Math.min(1938,lobe.s+(random()-.5)*37)),width=glacierHalfWidth(station),x=glacierCentre(station)+Math.max(-width+9,Math.min(width-9,lobe.off+(random()-.5)*46));
  const p={s:station,x,z:GLACIER.z+station,radius:2.1+random()*2.1,height:9+random()*9,top:27+random()*12,warning:.95+random()*.85,life:4.5+random()*3.5};
  if(ridgeContact(p.x,p.z,state.field,1)||ships.some(ship=>shipDistance(p.x,p.z,ship)<p.radius+1))continue;
  if(state.crystals.some(q=>q.state!=='inactive'&&q.state!=='melting'&&Math.hypot(p.x-q.x,p.z-q.z)<p.radius+q.radius+2))continue;
  // Every accepted footprint must leave at least two car-width exits at its cross-section.
  if(stormGaps(station,state,p,ships).length<2)continue;
  const slot=slots[spawned.length];Object.assign(slot,p,{state:'warning',age:0,y:glacierY(station)+p.top,hit:false,wave:state.waves+1});spawned.push(slot);
 }
 // Reject the end of a random batch if its projected footprints seal the entire forward field.
 // This does not protect snow, a side, or a pre-selected route; the surviving gaps move each wave.
 while(spawned.length){
  const discs=state.crystals.filter(p=>['warning','falling','landed'].includes(p.state)).map(p=>({x:p.x,z:p.z,r:p.state==='landed'?p.rubbleRadius:p.radius}));
  if(fieldReachable(state.field,car,Math.min(1980,s+180),discs,state.avalanches,1.5))break;
  spawned.pop().state='inactive';
 }
 if(spawned.length){state.waves++;state.spawnedCrystals+=spawned.length;}
 state.nextStorm=STORM.minInterval+random()*(STORM.maxInterval-STORM.minInterval);return spawned;
}
export function advanceCrystalStorm(state,car,dt,damage=()=>false,ships=createShips()){
 const events=[];state.stormTime+=dt;state.nextStorm-=dt;
 if(state.nextStorm<=0)for(const p of spawnCrystalWave(state,car,ships))events.push({kind:'crystal-warning',crystal:p});
 for(const p of state.crystals){
  if(p.state==='inactive')continue;
  p.age+=dt;
  if(p.state==='warning'){
   if(p.age>=p.warning){p.state='falling';p.age=0;events.push({kind:'crystal-fall',crystal:p});}
  }else if(p.state==='falling'){
   const floor=glacierY(p.s);p.y=floor+p.top-17*p.age*p.age;
   const tip=p.y-p.height/2;
   if(!p.hit&&tip<glacierY(car.z-GLACIER.z)+3&&tip>floor-4&&Math.hypot(car.x-p.x,car.z-p.z)<p.radius+1.25){
    p.hit=true;const amount=Math.round(28+p.radius*4);if(damage(amount))events.push({kind:'hit',amount});
   }
   if(tip<=floor+.1){p.state='landed';p.age=0;p.rubbleRadius=p.radius*.66;p.y=floor+p.height*.10;state.impacts.push({x:p.x,z:p.z,age:0,size:p.radius});if(state.impacts.length>36)state.impacts.shift();events.push({kind:'crystal-impact',crystal:p});}
  }else if(p.state==='landed'){
   if(p.age>p.life||p.s<car.z-GLACIER.z-150){p.state='melting';p.age=0;}
  }else if(p.state==='melting'){
   p.y-=dt*12;if(p.age>.8)p.state='inactive';
  }
 }return events;
}
