import {rng,clamp} from './course.js';
export const YARD=Object.freeze({x:2700,z:5600,length:1900,maxSpeed:32,bodyCapacity:240,landing:{x:4100,z:7900,length:240}});
export const YARD_BEATS=[{s:0,name:'The intake maze',note:'There is no marked racing line. Read the gaps between stacked wrecks.'},{s:380,name:'Magnet courts',note:'Moving scrap warns of a live field. Keep your speed or take the wider alley.'},{s:830,name:'The breaker yards',note:'Crane loads fall. A buckling boom can take its whole load down.'},{s:1300,name:'Air freight',note:'Cargo drones hover before dumping. Shadows show where the load will land.'},{s:1700,name:'The last sorting court',note:'Find another gap if fresh scrap blocks the short line. Reach the far gantry.'}];
export const yardCentre=s=>YARD.x+90*Math.sin(s/270)+35*Math.sin(s/95);
export const yardHalfWidth=s=>125+15*Math.sin(s/210)**2;
export const yardY=(x,z)=>.65*Math.sin((z-YARD.z)/79)+.28*Math.sin((x-yardCentre(z-YARD.z))/22);
function local(x,z,p){const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0);return [dx*c-dz*s,dx*s+dz*c];}
function inBlock(x,z,p,pad=1.3){const [a,b]=local(x,z,p);return p.kind==='shack'?Math.abs(a)<p.rx+pad&&Math.abs(b)<p.rz+pad:Math.hypot(a/(p.rx+pad),b/(p.rz+pad))<1;}
export function segmentDistance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return {distance:Math.hypot(x-a.x-dx*t,z-a.z-dz*t),t};}
export function createCranes(seed=91){
 const random=rng(seed^87219);return [210,430,645,865,1085,1310,1535,1740].map((s,id)=>{
  const side=id%2?1:-1,x=yardCentre(s)+side*(28+random()*53),yaw=-side*Math.PI/2+(random()-.5)*.8;
  return {id,s,x,z:YARD.z+s,yaw,baseYaw:yaw,side,state:'dormant',age:0,cycle:0,pitch:.58,fall:0,field:0,radius:45+random()*10,head:{x:0,y:12,z:0},tip:{x:0,y:25,z:0},headVX:0,headVZ:0,malfunction:false,failRoll:0};
 });
}
export function yardStaticContact(x,z,layout,pad=1.3){
 const s=z-YARD.z;if(s< -12||s>YARD.length+12||Math.abs(x-yardCentre(s))>yardHalfWidth(s)-pad||(s>YARD.length&&Math.abs(x-yardCentre(YARD.length))>11))return {kind:'fence'};
 for(const b of layout.blocks)if(Math.abs(z-b.z)<b.rx+b.rz+pad&&inBlock(x,z,b,pad))return b;
 for(const c of layout.craneBases)if(Math.hypot(x-c.x,z-c.z)<8+pad)return {kind:'crane base',...c};
 return null;
}
export function yardRoute(layout,preference=0,start={x:YARD.x,z:YARD.z},endS=YARD.length,avoid=[]){
 const step=6,min=YARD.x-300,cols=101,first=Math.max(0,Math.floor((start.z-YARD.z)/step)),last=Math.min(317,Math.ceil(endS/step)),rows=last-first+1;
 const cost=new Float32Array(rows*cols).fill(Infinity),parent=new Int16Array(rows*cols).fill(-1),startCol=Math.round((start.x-min)/step);
 for(let d=-1;d<=1;d++)if(startCol+d>0&&startCol+d<cols)cost[startCol+d]=Math.abs(d)*2;
 for(let r=1;r<rows;r++)for(let c=1;c<cols-1;c++){
  const s=(first+r)*step,x=min+c*step,z=YARD.z+s;if(yardStaticContact(x,z,layout,3.1)||avoid.some(p=>Math.hypot(x-p.x,z-p.z)<p.r))continue;
  if(s>YARD.length-25&&Math.abs(x-yardCentre(YARD.length))>10)continue;
  for(let dc=-1;dc<=1;dc++){
   const pc=c+dc,value=cost[(r-1)*cols+pc]+(dc?1.48:1)+(preference?Math.max(0,-preference*(x-yardCentre(s)))*.013:0);
   if(value<cost[r*cols+c]){cost[r*cols+c]=value;parent[r*cols+c]=pc;}
  }
 }
 let c=-1,best=Infinity;for(let j=0;j<cols;j++){const v=cost[(rows-1)*cols+j];if(v<best){best=v;c=j;}}
 if(c<0)return [];
 const path=[];for(let r=rows-1;r>=0;r--){path.push({x:min+c*step,z:YARD.z+(first+r)*step});c=parent[r*cols+c];if(c<0)break;}return path.reverse();
}
export function createYardLayout(seed=91,attempt=0){
 const random=rng((seed^0x591a)+attempt*7919),craneBases=createCranes(seed).map(c=>({x:c.x,z:c.z})),blocks=[];
 for(let i=0;i<108;i++){
  const s=112+random()*1650,x=yardCentre(s)+(random()-.5)*yardHalfWidth(s)*1.65,kind=i%5===0?'bales':'wrecks',rx=10+random()*12,rz=15+random()*23;
  if(craneBases.some(c=>Math.hypot(x-c.x,YARD.z+s-c.z)<20))continue;
  blocks.push({id:blocks.length,s,x,z:YARD.z+s,kind,rx,rz,yaw:(random()-.5)*2.8,height:3+random()*9});
 }
 for(let i=0;i<24;i++){
  const s=130+random()*1610,x=yardCentre(s)+(random()-.5)*yardHalfWidth(s)*1.65;
  if(blocks.some(b=>Math.hypot(b.x-x,b.z-(YARD.z+s))<24)||craneBases.some(c=>Math.hypot(c.x-x,c.z-(YARD.z+s))<22))continue;
  blocks.push({id:blocks.length,s,x,z:YARD.z+s,kind:'shack',rx:5+random()*5,rz:7+random()*7,yaw:(random()-.5)*2,height:4.4+random()*2});
 }
 for(let i=0;i<64;i++){
  const s=105+random()*1680,x=yardCentre(s)+(random()-.5)*yardHalfWidth(s)*1.7;
  if(blocks.some(b=>Math.hypot(b.x-x,b.z-YARD.z-s)<19)||craneBases.some(c=>Math.hypot(c.x-x,c.z-YARD.z-s)<18))continue;
  blocks.push({id:blocks.length,s,x,z:YARD.z+s,kind:'tyres',rx:3+random()*3,rz:4+random()*4,yaw:random()*3,height:1.5+random()*2});
 }
 const layout={seed,attempt,blocks,craneBases};
 if(!yardRoute(layout).length){if(attempt<10)return createYardLayout(seed,attempt+1);while(blocks.length&&!yardRoute(layout).length)blocks.splice(Math.floor(blocks.length/2),1);}
 return layout;
}
export function cranePose(c,time){
 const sweep=c.state==='fallen'||c.state==='collapsing'?c.fallYaw:c.baseYaw+Math.sin(time*.34+c.id*2.71)*.52;
 const progress=c.state==='collapsing'?clamp(c.age/2.8,0,1):c.state==='fallen'?1:0,pitch=.58-progress*.78,ground=yardY(c.x,c.z),reach=38*Math.cos(pitch);
 const tip={x:c.x+Math.sin(sweep)*reach,y:ground+7+38*Math.sin(pitch),z:c.z+Math.cos(sweep)*reach};
 const head={x:tip.x,y:Math.max(yardY(tip.x,tip.z)+1.8,tip.y-15),z:tip.z};
 return {yaw:sweep,pitch,progress,tip,head};
}
const METAL_TYPES=['car','beam','crate','panel'];
function makeBody(id,random){const kind=METAL_TYPES[Math.floor(random()*4)],car=kind==='car',beam=kind==='beam';return {id,kind,magnetic:true,state:'inactive',x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:random()*6.28,spin:0,rx:car?1.1:beam?.45:.7+random()*.5,rz:car?2.3:beam?3.5:1,height:car?.9:beam?.6:1+random(),mass:car?2.6:beam?1.2:.65,r:car?2.5:beam?2.4:1.1,attachedTo:null,slot:0,age:0,hit:false};}
export function createYardState(seed=91){
 const random=rng(seed^0x583a),layout=createYardLayout(seed),cranes=createCranes(seed),bodies=Array.from({length:YARD.bodyCapacity},(_,id)=>makeBody(id,random));
 const state={seed,layout,random,time:0,started:false,hazardTime:0,hull:100,lastHit:-100,failed:null,failureAge:0,complete:false,captured:null,magnetic:0,nearestMagnet:null,cranes,bodies,drones:[],impacts:[],dropped:0,droneDrops:0,craneDrops:0,collapses:0,pulledObjects:0,captures:0,previousZ:YARD.z};
 for(const c of cranes){Object.assign(c,cranePose(c,0));for(let j=0;j<7;j++){const b=bodies[c.id*7+j];Object.assign(b,{state:'attached',attachedTo:c.id,slot:j});}}
 for(let i=56;i<126;i++){
  const b=bodies[i],c=cranes[(i-56)%cranes.length],a=random()*6.28,r=13+random()*36;
  b.x=c.head.x+Math.cos(a)*r;b.z=c.head.z+Math.sin(a)*r;b.y=yardY(b.x,b.z)+b.height/2;b.state='loose';
  if(yardStaticContact(b.x,b.z,layout,b.r))b.state='inactive';
 }
 for(let id=0;id<6;id++)state.drones.push({id,state:'waiting',age:0,delay:id*.8+random()*1.5,x:YARD.x+(id%2?1:-1)*170,y:24+random()*7,z:YARD.z+100+id*18,targetX:0,targetZ:0,lead:80+random()*55,drops:0,round:0});
 updateAttached(state,0);return state;
}
export function yardDamage(state,amount){if(state.hazardTime-state.lastHit<.8||state.failed)return false;state.hull=Math.max(0,state.hull-amount);state.lastHit=state.hazardTime;if(!state.hull)state.failed='Vehicle crushed by scrap';return true;}
export function yardObstacle(x,z,state){
 const fixed=yardStaticContact(x,z,state.layout);if(fixed)return fixed;
 for(const c of state.cranes)if(c.state==='fallen'){
  const a={x:c.x+(c.tip.x-c.x)*.52,z:c.z+(c.tip.z-c.z)*.52};if(segmentDistance(x,z,a,c.tip).distance<4.1)return {kind:'fallen crane',crane:c};
 }
 for(const b of state.bodies)if(b.state==='loose'&&b.y-yardY(b.x,b.z)<b.height/2+.8&&Math.hypot(x-b.x,z-b.z)<b.r+1.25)return {kind:'loose scrap',body:b};
 return null;
}
function freeBody(state,car){return state.bodies.find(b=>b.state==='inactive')||state.bodies.find(b=>b.state==='loose'&&b.z<car.z-250);}
function dropBody(state,source,car,kind=null){
 const b=freeBody(state,car);if(!b)return null;
 const random=state.random,fresh=makeBody(b.id,random);Object.assign(b,fresh,{kind:kind||fresh.kind,state:'falling',x:source.x+(random()-.5)*9,y:source.y,z:source.z+(random()-.5)*9,vx:(random()-.5)*5,vz:(random()-.5)*5,vy:-1,spin:(random()-.5)*2,hit:false});state.dropped++;return b;
}
function releaseLoad(state,c,car){
 for(const b of state.bodies)if(b.state==='attached'&&b.attachedTo===c.id){b.state='falling';b.attachedTo=null;b.vx=c.headVX*.35+(state.random()-.5)*8;b.vz=c.headVZ*.35+(state.random()-.5)*8;b.vy=-1;b.hit=false;b.spin=(state.random()-.5)*2.4;state.dropped++;state.craneDrops++;}
}
function obstacleHeight(b){return b.kind==='wrecks'?6.4:b.kind==='bales'?5.7:b.kind==='fence'?4.6:(b.height||6);}
function supportHeight(state,x,z){const b=yardStaticContact(x,z,state.layout,0);return yardY(x,z)+(b?obstacleHeight(b):0);}
function liberateScrap(state,c,car){
 const source=state.layout.blocks.filter(b=>['wrecks','bales'].includes(b.kind)&&Math.hypot(b.x-c.head.x,b.z-c.head.z)<c.radius*.9).sort((a,b)=>Math.hypot(a.x-c.head.x,a.z-c.head.z)-Math.hypot(b.x-c.head.x,b.z-c.head.z))[0];
 if(!source)return;const b=freeBody(state,car);if(!b)return;const random=state.random,x=source.x+(random()-.5)*source.rx,z=source.z+(random()-.5)*source.rz;
 Object.assign(b,makeBody(b.id,random),{kind:'car',rx:1.1,rz:2.3,height:.9,mass:2.6,r:2.5,state:'falling',x,z,y:supportHeight(state,x,z)+1,vy:0,vx:0,vz:0,spin:0,hit:false});
}
function updateAttached(state,dt){
 for(const b of state.bodies)if(b.state==='attached'){
  const c=state.cranes[b.attachedTo],a=b.slot*2.399+state.hazardTime*.11,r=1.5+(b.slot%3)*.8;
  b.x=c.head.x+Math.sin(a)*r;b.z=c.head.z+Math.cos(a)*r;b.y=c.head.y-1.2-(b.slot%3)*.95;b.vx=b.vy=b.vz=0;b.yaw+=dt*.13;
 }
}
function craneStep(state,car,dt,events){
 for(const c of state.cranes){
  const previous={...c.head};
  if(c.state==='dormant'&&Math.abs(car.z-c.z)<220){c.state='idle';c.age=-state.random()*2.8;}
  if(c.state!=='dormant'&&c.state!=='fallen')c.age+=dt;
  if(c.state==='idle'&&c.age>2.2){c.state='warning';c.age=0;c.cycle++;c.malfunction=state.random()<.16;events.push({kind:'magnet-warning',crane:c});}
  else if(c.state==='warning'&&c.age>1.45){c.state='pulling';c.age=0;events.push({kind:'magnet-on',crane:c});}
  else if(c.state==='pulling'){
   c.salvageTimer=(c.salvageTimer||0)+dt;if(c.salvageTimer>.85){c.salvageTimer=0;liberateScrap(state,c,car);}
   if(c.malfunction&&c.age>2.2){c.state='buckling';c.age=0;events.push({kind:'crane-warning',crane:c});}
   else if(c.age>5.2){releaseLoad(state,c,car);c.state='dumping';c.age=0;events.push({kind:'crane-dump',crane:c});}
  }else if(c.state==='dumping'&&c.age>1.4){c.state='idle';c.age=-state.random()*2;}
  else if(c.state==='buckling'&&c.age>1.8){c.state='collapsing';c.age=0;c.fallYaw=c.baseYaw+Math.sin(state.hazardTime*.34+c.id*2.71)*.52;state.collapses++;events.push({kind:'crane-collapse',crane:c});}
  else if(c.state==='collapsing'&&c.age>2.8){c.state='fallen';c.age=0;releaseLoad(state,c,car);state.impacts.push({x:c.tip.x,z:c.tip.z,age:0,size:12});events.push({kind:'crane-impact',crane:c});}
  Object.assign(c,cranePose(c,state.hazardTime));c.headVX=(c.head.x-previous.x)/Math.max(.001,dt);c.headVZ=(c.head.z-previous.z)/Math.max(.001,dt);
  c.field=c.state==='pulling'||c.state==='buckling'?1:c.state==='warning'?Math.min(1,c.age/1.45)*.15:c.state==='collapsing'?Math.max(0,1-c.age/2.8):0;
  if(c.state==='collapsing'){
   const t=segmentDistance(car.x,car.z,c,c.tip);if(t.distance<4.5&&7+(c.tip.y-yardY(c.x,c.z)-7)*t.t<(car.y||0)+3.5&&yardDamage(state,65))events.push({kind:'hit',amount:65});
  }
 }
}
export function magnetAcceleration(c,x,y,z,mass=2.6){
 if(c.field<=.15)return {x:0,y:0,z:0,strength:0};
 const dx=c.head.x-x,dz=c.head.z-z,d=Math.hypot(dx,dz);if(d>=c.radius)return {x:0,y:0,z:0,strength:0};
 const strength=44*Math.pow(1-d/c.radius,1.5)*c.field*(2.6/mass),dy=c.head.y-y;
 return {x:dx/(d||1)*strength,y:dy>0?strength*.95:strength*-.6,z:dz/(d||1)*strength,strength};
}
function droneStep(state,car,dt,events){
 for(const d of state.drones){
  d.age+=dt;
  if(d.state==='waiting'&&d.age>d.delay){d.state='transit';d.age=0;d.round++;d.offset=(state.random()-.5)*1.5;d.lead=80+state.random()*55;}
  if(d.state==='transit'){
   const s=Math.min(YARD.length-48,Math.max(80,car.z-YARD.z+d.lead));d.targetZ=YARD.z+s;d.targetX=yardCentre(s)+d.offset*yardHalfWidth(s);
   const dx=d.targetX-d.x,dz=d.targetZ-d.z,len=Math.hypot(dx,dz),move=Math.min(len,57*dt);d.x+=dx/(len||1)*move;d.z+=dz/(len||1)*move;d.y=yardY(d.x,d.z)+25+Math.sin(state.hazardTime*.9+d.id)*1.3;
   if(len<9&&d.age>1.5){d.state='warning';d.age=0;d.drops=0;d.warn=1.3+state.random()*.65;events.push({kind:'drone-warning',drone:d});}
  }else if(d.state==='warning'){
   if(d.age>d.warn){d.state='dumping';d.age=0;d.drops=0;}
  }else if(d.state==='dumping'){
   const count=Math.min(5,Math.floor(d.age/.17)+1);
   while(d.drops<count){if(dropBody(state,d,car)){state.droneDrops++;events.push({kind:'drone-drop',drone:d});}d.drops++;}
   if(d.age>1){d.state='departing';d.age=0;}
  }else if(d.state==='departing'){
   d.x+=(d.id%2?1:-1)*dt*26;d.z+=dt*19;
   if(d.age>2){d.state='waiting';d.age=0;d.delay=.5+state.random()*2;}
  }
 }
}
function bodyStep(state,car,dt,events){
 for(const b of state.bodies){
  if(b.state==='inactive'||b.state==='attached')continue;b.age+=dt;
  let nearest=null,maxForce=0,ax=0,az=0,ay=0;
  if(b.magnetic)for(const c of state.cranes){const f=magnetAcceleration(c,b.x,b.y,b.z,b.mass);ax+=f.x;az+=f.z;ay+=f.y;if(f.strength>maxForce){maxForce=f.strength;nearest=c;}}
  if(nearest&&Math.hypot(b.x-nearest.head.x,b.z-nearest.head.z)<4&&Math.abs(b.y-nearest.head.y)<4&&state.bodies.filter(p=>p.state==='attached'&&p.attachedTo===nearest.id).length<13){
   b.state='attached';b.attachedTo=nearest.id;b.slot=state.bodies.filter(p=>p.state==='attached'&&p.attachedTo===nearest.id).length;state.pulledObjects++;continue;
  }
  const floor=supportHeight(state,b.x,b.z)+b.height/2,wasAir=b.y>floor+.15,oldY=b.y;
  b.vx+=ax*dt;b.vz+=az*dt;b.vy+=(ay-18)*dt;
  const nextX=b.x+b.vx*dt,nextZ=b.z+b.vz*dt;
  if(yardStaticContact(nextX,nextZ,state.layout,b.r*.65)&&b.y-b.height/2<supportHeight(state,nextX,nextZ)-.1){b.vx*=-.18;b.vz*=-.18;}else{b.x=nextX;b.z=nextZ;}
  b.y+=b.vy*dt;b.yaw+=b.spin*dt;
  const newFloor=supportHeight(state,b.x,b.z)+b.height/2;
  if(b.y<=newFloor){
   if(wasAir&&b.vy<-6){state.impacts.push({x:b.x,z:b.z,age:0,size:b.mass*2});if(state.impacts.length>40)state.impacts.shift();events.push({kind:'scrap-impact',body:b});}
   b.y=newFloor;b.vy=Math.max(0,-b.vy*.12);if(b.vy<1)b.vy=0;b.state='loose';b.vx*=Math.exp(-3.6*dt);b.vz*=Math.exp(-3.6*dt);b.spin*=Math.exp(-3*dt);
  }else{b.state='falling';b.vx*=Math.exp(-.12*dt);b.vz*=Math.exp(-.12*dt);}
  const vehicleY=yardY(car.x,car.z)+(car.y||0);
  if(!b.hit&&(wasAir||b.state==='falling')&&Math.min(oldY,b.y)-b.height/2<vehicleY+2.3&&Math.max(oldY,b.y)+b.height/2>vehicleY&&Math.hypot(b.x-car.x,b.z-car.z)<b.r+1.2){
   const amount=Math.round(clamp(18+Math.abs(b.vy)*b.mass*.75,20,55));if(yardDamage(state,amount)){events.push({kind:'hit',amount});car.vx=(car.vx||0)*.55;car.vz=(car.vz||0)*.55;}b.hit=true;
  }
  if(b.z<car.z-320&&b.state==='loose')b.state='inactive';
 }
}
export function advanceYard(state,car,dt,{preview=false}={}){
 const events=[];if(state.complete)return events;
 if(state.failed){state.failureAge+=dt;return events;}
 state.hazardTime+=dt;if(state.started&&!preview)state.time+=dt;
 const actor=preview?{...car,y:-1000}:car;craneStep(state,actor,dt,events);droneStep(state,car,dt,events);bodyStep(state,actor,dt,events);updateAttached(state,dt);
 state.magnetic=0;state.nearestMagnet=null;
 if(!preview){
  let ay=0;
  if(state.captured){
   const capture=state.captured,c=state.cranes[capture.crane];capture.age+=dt;
   if(c.field>.4){car.x=c.head.x;car.z=c.head.z;car.y=Math.max(0,c.head.y-yardY(car.x,car.z)-2.4);car.vx=car.vz=car.vy=car.speed=0;if(capture.age>2.3){state.failed='Vehicle taken by the crane magnet';state.captures++;}}
   else{state.captured=null;car.vy=-1;events.push({kind:'released'});}
  }else{
   for(const c of state.cranes){
    const f=magnetAcceleration(c,car.x,yardY(car.x,car.z)+(car.y||0)+1.2,car.z);car.vx=(car.vx||0)+f.x*dt;car.vz=(car.vz||0)+f.z*dt;ay+=f.y;
    if(f.strength>state.magnetic){state.magnetic=f.strength;state.nearestMagnet=c.id;}
    if(c.field>.7&&Math.hypot(car.x-c.head.x,car.z-c.head.z)<3.6&&(car.y||0)>5&&Math.abs(yardY(car.x,car.z)+car.y+1.2-c.head.y)<4){state.captured={crane:c.id,age:0};events.push({kind:'captured',crane:c});break;}
   }
   const oldHeight=car.y||0;car.vy=(car.vy||0)+(ay-18)*dt;car.y=Math.max(0,oldHeight+car.vy*dt);
   if(car.y<=0){if(oldHeight>.04&&car.vy<-9&&yardDamage(state,Math.round(clamp(Math.abs(car.vy)*1.4,12,40))))events.push({kind:'hit',amount:Math.round(Math.abs(car.vy)*1.4)});car.vy=0;}
  }
 }
 state.impacts.forEach(p=>p.age+=dt);state.impacts=state.impacts.filter(p=>p.age<1.5);
 if(state.previousZ<YARD.z+YARD.length&&car.z>=YARD.z+YARD.length&&Math.abs(car.x-yardCentre(YARD.length))<11&&!state.failed&&!preview){state.complete=true;events.push({kind:'portal'});}state.previousZ=car.z;
 return events;
}
export function stepYardVehicle(car,input,dt,state){
 if(state.failed||state.complete||state.captured)return {contact:null};car.vx??=0;car.vz??=0;car.y??=0;car.vy??=0;
 const throttle=!!input.throttle,steer=input.steer||0,v=Math.hypot(car.vx,car.vz),forward=car.vx*Math.sin(car.heading)+car.vz*Math.cos(car.heading);if(throttle)state.started=true;
 const grounded=car.y<.3;car.heading+=steer*1.25*Math.min(1,v/4)*dt*(forward<-.3?-1:1)*(grounded?1:.25);
 const fx=Math.sin(car.heading),fz=Math.cos(car.heading),projection=car.vx*fx+car.vz*fz,grip=1-Math.exp(-(grounded?6.2:.18)*dt);
 car.vx+=(fx*projection-car.vx)*grip;car.vz+=(fz*projection-car.vz)*grip;
 const acceleration=(throttle?14:0)-(input.brake?(forward>1?28:8):0);car.vx+=fx*acceleration*dt*(grounded?1:.2);car.vz+=fz*acceleration*dt*(grounded?1:.2);
 const drag=Math.exp(-(input.hard?3.2:throttle?.08:.35)*dt);car.vx*=drag;car.vz*=drag;
 const speed=Math.hypot(car.vx,car.vz);if(speed>YARD.maxSpeed){car.vx*=YARD.maxSpeed/speed;car.vz*=YARD.maxSpeed/speed;}
 const nx=car.x+car.vx*dt,nz=car.z+car.vz*dt;let contact=grounded?yardObstacle(nx,nz,state):yardStaticContact(nx,nz,state.layout,.5);if(!grounded&&contact&&(car.y||0)>obstacleHeight(contact)+.8)contact=null;
 if(contact?.kind==='loose scrap'){
  const b=contact.body;b.vx+=car.vx*.8/b.mass;b.vz+=car.vz*.8/b.mass;b.hit=false;
  if(b.mass<1.4){car.x=nx;car.z=nz;car.vx*=.92;car.vz*=.92;}
  else{car.vx*=.25;car.vz*=.25;if(speed>12)yardDamage(state,10);}
 }else if(contact){car.vx*=.18;car.vz*=.18;if(speed>12)yardDamage(state,contact.kind==='fallen crane'?25:12);}
 else{car.x=nx;car.z=nz;}
 car.speed=Math.hypot(car.vx,car.vz)*((car.vx*fx+car.vz*fz)<0?-1:1);return {contact};
}
export function yardSpawn(state,s=0){for(let off=0;off<yardHalfWidth(s)-4;off+=5)for(const sign of [1,-1]){const x=yardCentre(s)+off*sign,z=YARD.z+s;if(!yardObstacle(x,z,state))return {x,z};}return {x:yardCentre(s),z:YARD.z+s};}
export function constrainYardCamera(car,desired,state){
 const focus={x:car.x,y:yardY(car.x,car.z)+(car.y||0)+2.4,z:car.z};let last=0;
 for(let i=1;i<=32;i++){const t=i/32,x=focus.x+(desired.x-focus.x)*t,z=focus.z+(desired.z-focus.z)*t;if(yardStaticContact(x,z,state.layout,.4)){const q=Math.max(.06,last-.02);return {x:focus.x+(desired.x-focus.x)*q,y:focus.y+(desired.y-focus.y)*q,z:focus.z+(desired.z-focus.z)*q};}last=t;}return {...desired};
}
