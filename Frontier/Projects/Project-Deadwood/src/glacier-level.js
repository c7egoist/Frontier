// Glacier Cave — metre/second greybox rules, independent of rendering.
import {rng} from './level.js';
export const GLACIER={length:1320,maxSpeed:32,startZ:14,collapseSpeed:12.5,launchGrace:6,landing:{x:245,z:1570}};
export const baseCenter=z=>12*Math.sin(z/180)+9*Math.sin(z/65);
export function mainCenter(z){const t=(z-470)/240;return baseCenter(z)-(t>0&&t<1?95*Math.sin(Math.PI*t):0);}
export const halfWidth=z=>68+7*Math.sin(z/150)+4*Math.sin(z/48);
export const AVALANCHE={entry:470,exit:710,warning:1.25,opens:3.7};
export function shortcutCenter(z){const t=(z-470)/240,a=baseCenter(470),b=baseCenter(710);return a+(b-a)*t+7*Math.sin(Math.PI*t);}
export function routeIntervals(z,open=false){if(z<0||z>GLACIER.length+12)return[];const c=mainCenter(z),out=[[c-halfWidth(z),c+halfWidth(z)]];if(open&&z>=470&&z<=710){const s=shortcutCenter(z);out.push([s-7,s+7]);}return out;}
export function onIce(x,z,open=false,margin=0){return routeIntervals(z,open).some(([a,b])=>x>=a+margin&&x<=b-margin);}
export function onShortcut(x,z,open){return open&&z>495&&z<688&&Math.abs(x-shortcutCenter(z))<7.5&&Math.abs(x-mainCenter(z))>halfWidth(z);}
export function snowLanes(z){const c=mainCenter(z),w=halfWidth(z);return [c-w+7+Math.sin(z/47)*2.1,c+w-7+Math.sin(z/39)*1.7];}
export function surfaceAt(x,z,open=false){return onShortcut(x,z,open)?'black ice':snowLanes(z).some(c=>Math.abs(x-c)<3.3)?'packed snow':'black ice';}
export const FRAGILE=[{z:160,end:240,offset:0,width:16,safe:19},{z:548,end:632,offset:2,width:13,safe:18},{z:1010,end:1095,offset:-4,width:11,safe:18}];
export function fragileAt(x,z,open=false){if(onShortcut(x,z,open))return z>545&&z<590?{safe:22,shortcut:true}:null;return FRAGILE.find(p=>z>=p.z&&z<=p.end&&Math.abs(x-mainCenter(z)-p.offset)<p.width/2)||null;}
// Fresh spatial choices on every run. No continuous grip lane and no prescribed solution.
export function createIceField(seed){
 const random=rng(seed^0x35ade),ridges=[],snow=[],weak=[];
 for(let z=90;z<1250;z+=48+random()*30){
  const c=mainCenter(z),w=halfWidth(z);
  for(let side of [-1,1])ridges.push({x:c+side*(12+random()*(w-50)),z:z+(random()-.5)*18,rx:7+random()*7,rz:10+random()*9,angle:random()*Math.PI});
 }
 for(let z=35;z<1290;z+=26){const w=halfWidth(z);snow.push({x:mainCenter(z)+(random()-.5)*(w*2-20),z,rx:6+random()*8,rz:9+random()*13});}
 for(let z=125;z<1260;z+=37+random()*25)weak.push({x:mainCenter(z)+(random()-.5)*(halfWidth(z)*2-22),z,rx:9+random()*9,rz:12+random()*12,safe:15+random()*5});
 weak.push({x:shortcutCenter(568),z:568,rx:6,rz:23,safe:22});
 return {seed,ridges,snow,weak};
}
export function inPatch(p,x,z,margin=0){const dx=x-p.x,dz=z-p.z,a=p.angle??0,u=dx*Math.cos(a)-dz*Math.sin(a),v=dx*Math.sin(a)+dz*Math.cos(a);return (u/(p.rx+margin))**2+(v/(p.rz+margin))**2<1;}
export function fieldSurface(s,x=s.x,z=s.z){return s.field.snow.some(p=>inPatch(p,x,z))?'packed snow':'black ice';}
export function fieldFragile(s,x=s.x,z=s.z){return s.field.weak.find(p=>inPatch(p,x,z))??null;}
export function fracturePose(age){return {spread:Math.min(1,Math.max(0,age/2.2)),open:age>=2.2,sink:Math.max(0,age-2.2)**2*3};}
export function stressStep(stress,speed,safe,dt){return Math.max(0,Math.min(1.1,stress+(speed>safe?(speed-safe)/10: -.75)*dt));}
export function collapseFront(time,furthest){return Math.max(-65,12.5*Math.max(0,time-6)-65,furthest-180);}
export function floePose(z,front){const age=Math.max(0,(front-z)/GLACIER.collapseSpeed);return{age,y:age?-Math.min(45,age*age*3.5):0,tilt:Math.min(.9,age*.4),visible:age<3.8};}
export const SHIPS=[{z:105,offset:10,length:44,beam:13,yaw:.24,lean:-.12},{z:198,offset:-13,length:48,beam:15,yaw:-.35,lean:.16},{z:290,offset:8,length:45,beam:14,yaw:.57,lean:-.1},{z:365,offset:-18,length:52,beam:17,yaw:-.12,lean:.14},{z:825,offset:9,length:43,beam:12,yaw:.14,lean:-.15}].map(s=>({...s,x:mainCenter(s.z)+s.offset}));
export function shipContact(x,z,ships=SHIPS,radius=1.6){return ships.find(s=>{const dx=x-s.x,dz=z-s.z,lx=dx*Math.cos(s.yaw)-dz*Math.sin(s.yaw),lz=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw);return(lx/(s.beam*.5+radius))**2+(lz/(s.length*.5+radius))**2<1;})||null;}
export function avalanchePose(age){return{phase:age<0?'dormant':age<1.25?'warning':age<3.7?'falling':'open',open:age>=3.7,debris:age>=3.7};}
export function shardPose(age,height=27){if(age<.95)return{phase:'warning',y:height,danger:false};const t=age-.95,y=Math.max(.8,height-26*t*t);return{phase:y>.8?'falling':'impact',y,danger:y<4&&t<1.5};}
export function routeDistance(fn,a,b){let length=0,p={x:fn(a),z:a};for(let z=a+1;z<=b;z++){const x=fn(z);length+=Math.hypot(x-p.x,z-p.z);p={x,z};}return length;}
// A shower samples the passage ahead, never the driver's lateral position or velocity.
export function crystalShower(s){
 const count=18+Math.floor(s.random()*11),out=[];
 for(let i=0;i<count;i++){
  const z=Math.min(1290,s.z+18+s.random()*92),intervals=routeIntervals(z,s.open),lane=intervals[Math.floor(s.random()*intervals.length)],radius=1.4+s.random()*1.6;
  const length=8+s.random()*8,x=lane[0]+radius+s.random()*Math.max(0,lane[1]-lane[0]-radius*2);
  out.push({x,z,age:-s.random()*.85,height:22+s.random()*7,length,radius,hit:false});
 }
 return out;
}
export function newGlacierState(seed=47){return{seed,random:rng(seed),field:createIceField(seed),fractures:[],x:mainCenter(14),z:14,yaw:0,vx:0,vz:0,time:0,mode:'driving',paused:false,stress:0,front:-65,furthest:14,avalancheAge:-1,open:false,shardTimer:1.4,shards:[],hits:0,impact:0,fallAge:0,reason:'',hole:null,edgeTime:0,portalAge:0};}
export function stepGlacier(s,dt,keys){if(s.paused||s.mode==='intro'||s.mode==='failed'||s.mode==='complete')return s;if(s.mode==='falling'){s.fallAge+=dt;if(s.fallAge>1.65)s.mode='failed';return s;}if(s.mode==='arriving'){s.portalAge+=dt;if(s.portalAge>1.4)s.mode='complete';return s;}
 s.time+=dt;s.crystalCooldown=Math.max(0,(s.crystalCooldown??0)-dt);s.impact=Math.max(0,s.impact-dt);const speed=Math.hypot(s.vx,s.vz),surface=fieldSurface(s),snow=surface==='packed snow';
 const turn=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0),gas=keys.has('KeyW')||keys.has('ArrowUp'),brake=keys.has('KeyS')||keys.has('ArrowDown');
 const forward={x:Math.sin(s.yaw),z:Math.cos(s.yaw)},along=s.vx*forward.x+s.vz*forward.z;
 s.yaw+=turn*(.25+Math.min(1,speed/10))*(snow?1.08:.92)*Math.sign(along||1)*dt;
 const accel=gas?10:brake?(along>1?-(snow?22:14):-6):0;s.vx+=forward.x*accel*dt;s.vz+=forward.z*accel*dt;
 const cross=s.vx*Math.cos(s.yaw)-s.vz*Math.sin(s.yaw),grip=1-Math.exp(-(snow?7.5:.7)*dt);s.vx-=Math.cos(s.yaw)*cross*grip;s.vz+=Math.sin(s.yaw)*cross*grip;
 const drag=Math.exp(-(gas?(snow?.035:.006):(snow?.34:.045))*dt);s.vx*=drag;s.vz*=drag;const v=Math.hypot(s.vx,s.vz);if(v>32){s.vx*=32/v;s.vz*=32/v;}
 const reverse=s.vx*Math.sin(s.yaw)+s.vz*Math.cos(s.yaw);if(reverse< -8){s.vx-=Math.sin(s.yaw)*(reverse+8);s.vz-=Math.cos(s.yaw)*(reverse+8);}
 const old={x:s.x,z:s.z};s.x+=s.vx*dt;s.z+=s.vz*dt;
 if(!s.open&&Math.abs(s.z-500)<5&&Math.abs(s.x-shortcutCenter(500))<9){s.x=old.x;s.z=old.z;s.vx*=.15;s.vz*=.15;}
 if(shipContact(s.x,s.z)||s.field.ridges.some(p=>inPatch(p,s.x,s.z,1.6))){s.x=old.x;s.z=old.z;s.vx*=-.14;s.vz*=-.14;s.impact=.45;}
 // A fallen snow ridge obstructs only the inner bank of the main route; the main remains open.
 if(s.open&&s.z>520&&s.z<550&&Math.abs(s.x-(mainCenter(s.z)+15))<5){s.x=old.x;s.z=old.z;s.vx*=.3;s.vz*=.3;}
 s.furthest=Math.max(s.furthest,s.z);s.front=collapseFront(s.time,s.furthest);
 if(s.avalancheAge<0&&s.z>340)s.avalancheAge=0;if(s.avalancheAge>=0)s.avalancheAge+=dt;s.open=s.avalancheAge>=3.7;
 const thin=fieldFragile(s);s.stress=stressStep(s.stress,Math.hypot(s.vx,s.vz),thin?thin.safe:100,dt);
 function fail(reason){s.mode='falling';s.reason=reason;s.fallAge=0;}
 // Stress opens a local, telegraphed fracture; escape before its centre gives way.
 if(s.stress>.6&&!s.fractures.some(p=>Math.hypot(p.x-s.x,p.z-s.z)<14))s.fractures.push({x:s.x,z:s.z,age:0,radius:5.5,seed:s.random()*1000});
 for(const f of s.fractures){f.age+=dt;if(fracturePose(f.age).open&&Math.hypot(s.x-f.x,s.z-f.z)<f.radius)fail('A spreading ice fracture opened beneath the car. Leave the cracking patch before it breaks.');}
 s.fractures=s.fractures.filter(f=>f.z>s.front-35);
 if(s.stress>=1)s.stress=.8;
 s.edgeTime=onIce(s.x,s.z,s.open)?Math.max(0,s.edgeTime-dt*3):s.edgeTime+dt;if(s.edgeTime>.22)fail('You slid off the ice lead. Packed snow gives you more control around the hulls.');
 if(s.z<s.front+2)fail('The timed collapse reached your vehicle. Keep a margin while slowing for fragile ice.');
 s.shardTimer-=dt;if(s.z>410&&s.z<1250&&s.shardTimer<=0){s.shards.push(...crystalShower(s));s.shardTimer=.5+s.random()*.35;}
 for(const shard of s.shards){shard.age+=dt;const p=shardPose(shard.age,shard.height);if(!shard.fractured&&p.phase==='impact'&&(shard.length??0)>13){shard.fractured=true;s.fractures.push({x:shard.x,z:shard.z,age:0,radius:3.5,seed:s.random()*1000});}if(!shard.hit&&s.crystalCooldown===0&&p.danger&&Math.hypot(s.x-shard.x,s.z-shard.z)<(shard.radius??1.2)+1.6){shard.hit=true;s.crystalCooldown=.65;s.hits++;s.vx*=.25;s.vz*=.25;s.impact=.8;if(s.hits>=3)fail('Repeated falling-ice impacts disabled the car. Watch the shaking crystals and their ground shadows.');}}
 s.shards=s.shards.filter(p=>p.age<7);
 if(s.mode==='driving'&&s.z>=GLACIER.length-3&&Math.abs(s.x-mainCenter(1320))<6){s.mode='arriving';s.x=245;s.z=1570;s.vx=0;s.vz=0;s.yaw=0;s.portalAge=0;}
 return s;}
