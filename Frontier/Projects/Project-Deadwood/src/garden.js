import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rng} from './level.js';
import {buildGardenEnvironment} from './garden-environment-view.js';
import {gardenHeight,gardenSlope,tunnelAt} from './garden-environment.js';
import {createFireflies} from './garden-fireflies.js';
import {HUNT,chooseHunters,aimHunt,huntMouth,sweptBite,burrowSite} from './garden-combat.js';
import {CELL,COLS,ROWS,GARDEN_SPEED,buildMaze,cellPoint,cellAt,mazeWalls,gardenLayout,moveInMaze,trapPose,trapCaptures,wallContact} from './garden-level.js';
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.95});
export function createGarden(scene,origin={x:2000,z:0},options={}){
 const group=new THREE.Group();group.position.set(origin.x,0,origin.z);scene.add(group);
 const soil=material('#76745b'),hedge=material('#535d3b'),leaf=material('#677345'),inside=material('#864b40'),vein=material('#a59b6d'),ivory=material('#c0b58c'),stem=material('#414d31'),petal=material('#ae8a6c'),pollen=material('#8f773e');
 const unitSphere=new THREE.SphereGeometry(1,12,8),cone=new THREE.ConeGeometry(.17,1.2,5),boxGeo=new THREE.BoxGeometry(1,1,1),clod=new THREE.IcosahedronGeometry(.4,0);
 function mesh(g,m,parent=group){const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function blob(parent,m,x,y,z,sx,sy,sz){const o=mesh(unitSphere,m,parent);o.position.set(x,y,z);o.scale.set(sx,sy,sz);return o;}
 function box(parent,m,x,y,z,w,h,d){const o=mesh(boxGeo,m,parent);o.position.set(x,y,z);o.scale.set(w,h,d);return o;}
 function limb(parent,a,b,r,m){const d=new THREE.Vector3().subVectors(b,a),o=mesh(new THREE.CylinderGeometry(r*.65,r,d.length(),6),m,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
 function batch(parent){const groups=new Map(),items=parent.children.filter(o=>o.isMesh);for(const o of items){o.updateMatrix();const key=o.material.uuid;if(!groups.has(key))groups.set(key,{m:o.material,g:[]});groups.get(key).g.push(o.geometry.clone().applyMatrix4(o.matrix));parent.remove(o);}for(const b of groups.values()){const g=mergeGeometries(b.g);b.g.forEach(g=>g.dispose());mesh(g,b.m,parent);}}
 const maze=buildMaze(),walls=mazeWalls(maze),layout=gardenLayout(maze),random=rng(maze.seed);
 const environment=buildGardenEnvironment(group,maze,walls,{soil,hedge,leaf,stem,petal,ivory});
 const collisionWalls=[...walls,...environment.rocks.map(r=>({points:[r,r],radius:r.radius}))];
 const plants=layout.plants.map(def=>{const base=new THREE.Group();base.position.set(def.x,gardenHeight(def.x,def.z),def.z);base.rotation.y=def.heading;group.add(base);const head=new THREE.Group();base.add(head);limb(head,new THREE.Vector3(0,0,0),new THREE.Vector3(0,1,0),.7,stem);
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2,o=blob(head,leaf,Math.cos(a)*2,.12,Math.sin(a)*2,1.3,.22,3);o.rotation.y=-a+Math.PI/2;}
  const jaws=[];for(const side of [-1,1]){const jaw=new THREE.Group();jaw.position.y=1;head.add(jaw);blob(jaw,leaf,0,-.12,side*2,3.7,.43,2.5);blob(jaw,inside,0,.16,side*2,3.35,.2,2.22);
   for(let i=0;i<=9;i++){const a=i/9*Math.PI,tooth=mesh(cone,ivory,jaw);tooth.position.set(Math.cos(a)*3.2,.7,side*(2+Math.sin(a)*1.9));tooth.rotation.x=-side*.25;}
   for(let i=-2;i<=2;i++)limb(jaw,new THREE.Vector3(i*.45,.4,side*.2),new THREE.Vector3(i*1.05,.42,side*3.7),.035,vein);
   batch(jaw);jaws.push({jaw,side});}
  batch(head);const neck=mesh(new THREE.BufferGeometry(),stem,base);neck.visible=false;const cue=mesh(new THREE.RingGeometry(1.2,1.36,18),vein,base);cue.rotation.x=-Math.PI/2;cue.position.y=.035;cue.visible=false;const mound=blob(base,soil,0,.12,0,2.4,.3,2.4),stones=[];for(let i=0;i<8;i++){const o=mesh(clod,soil,base);o.visible=false;stones.push({o,a:random()*Math.PI*2,v:2+random()*4});}return{...def,base,head,jaws,mound,stones,neck,cue,home:{...def},aim:null,previousMouth:null,cooldown:0,rate:1,age:-1,cycle:0,emerged:false,renderAge:-1};});
 const flowers=layout.flowers.map((def,index)=>{const base=new THREE.Group();base.position.set(def.x+def.offset,gardenHeight(def.x+def.offset,def.z),def.z);group.add(base);const h=9+index%3;limb(base,new THREE.Vector3(),new THREE.Vector3(1,h,0),.65,stem);for(let i=0;i<4;i++){const l=blob(base,leaf,(i%2?1:-1)*2,2+i*1.4,0,3,.3,1.2);l.rotation.z=i%2?.4:-.4;}
  const crown=new THREE.Group();crown.position.set(1,h,0);base.add(crown);for(let j=0;j<7;j++){const a=j/7*Math.PI*2,p=blob(crown,petal,Math.cos(a)*3,0,Math.sin(a)*3,2.8,.6,1.6);p.rotation.y=-a;p.rotation.z=.15;}blob(crown,pollen,0,.4,0,1.8,.8,1.8);batch(crown);batch(base);return{...def,x:def.x+def.offset,h,base,crown};});
 const fireflySources=[...environment.groundFlowers.filter((_,i)=>i%11===0),...flowers].slice(0,14);
 const fireflies=createFireflies(group,fireflySources),insects=fireflies.flies;
 const start=cellPoint(maze.start.c,maze.start.r),goal=cellPoint(maze.goal.c,maze.goal.r);
 const exit=new THREE.Group();exit.position.set(goal.x,gardenHeight(goal.x,goal.z+5),goal.z+5);group.add(exit);for(const side of [-1,1])box(exit,vein,side*5.5,5,0,2.1,10,3);box(exit,vein,0,10,0,13,2,3);const curtain=mesh(new THREE.PlaneGeometry(9,9),new THREE.MeshBasicMaterial({color:'#c9c5a8',side:THREE.DoubleSide,transparent:true,opacity:.55}),exit);curtain.position.y=4.5;
 let x=start.x,z=start.z,yaw=0,speed=0,time=0,mode='intro',paused=false,capture=null,captureAge=0,impact=0,visited=new Set(),mapOpen=false,insectHits=0,huntRandom=rng(1),huntSeed=1,attackDelay=0,attacks=0,escapes=0,burrowTimer=4.2,burrows=0;
 const mini=document.createElement('canvas');mini.width=252;mini.height=246;mini.className='garden-map';const ctx=mini.getContext('2d');
 function drawMap(){if(!mini.isConnected)return;ctx.clearRect(0,0,252,246);ctx.fillStyle='#20291ee8';ctx.fillRect(0,0,252,246);const scale=.84,project=p=>({x:126+p.x*scale,y:227-p.z*scale}),known=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){if(mapOpen||visited.has(`${c},${r}`))known.push(cellPoint(c,r));}
  ctx.fillStyle='#8f947929';for(const p of known){const v=project(p);ctx.beginPath();ctx.arc(v.x,v.y,9,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#a2aa85';ctx.lineWidth=1;for(const bank of walls){if(!mapOpen&&!bank.points.some(p=>known.some(k=>Math.hypot(k.x-p.x,k.z-p.z)<17)))continue;ctx.beginPath();bank.points.forEach((p,i)=>{const v=project(p);if(i===0)ctx.moveTo(v.x,v.y);else ctx.lineTo(v.x,v.y);});ctx.stroke();}
  ctx.strokeStyle='#c4b28a';ctx.lineWidth=3;for(const t of environment.tunnels){if(!mapOpen&&!known.some(p=>Math.hypot(p.x-t.x,p.z-t.z)<18))continue;const a=project({x:t.x-Math.sin(t.yaw)*5,z:t.z-Math.cos(t.yaw)*5}),b=project({x:t.x+Math.sin(t.yaw)*5,z:t.z+Math.cos(t.yaw)*5});ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  const exitPoint=project(goal);ctx.fillStyle='#c6b289';ctx.fillRect(exitPoint.x-3,exitPoint.y-3,6,6);const car=project({x,z});ctx.save();ctx.translate(car.x,car.y);ctx.rotate(yaw);ctx.fillStyle='#f1e4bf';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-4,4);ctx.lineTo(4,4);ctx.fill();ctx.restore();ctx.font='9px Arial';ctx.fillStyle='#b5bca5';ctx.fillText(mapOpen?'M · ORGANIC SURVEY':'M · REVEAL FIELD SKETCH',14,15);}
 function mountMap(){document.querySelector('.route')?.append(mini);mini.hidden=false;}
 function reset(seed=options.seed??Math.floor(Math.random()*2147483647)){x=start.x;z=start.z;yaw=0;speed=0;time=0;mode='driving';paused=false;capture=null;captureAge=0;impact=0;insectHits=0;attacks=0;escapes=0;burrowTimer=4.2;burrows=0;attackDelay=0;huntSeed=seed;huntRandom=rng(seed);visited=new Set(['4,0']);
 for(const p of plants){p.age=-1;p.cycle=0;p.emerged=false;p.renderAge=-1;p.aim=null;p.previousMouth=null;p.cooldown=huntRandom()*.8;p.rate=.96+huntRandom()*.1;p.buried=p.home.buried||huntRandom()<.5;
  p.x=p.home.x;p.z=p.home.z;for(let attempt=0;attempt<6;attempt++){const xx=p.home.x+(huntRandom()-.5)*4,zz=p.home.z+(huntRandom()-.5)*6;if(!wallContact(xx,zz,walls,1.1)){p.x=xx;p.z=zz;break;}}
  p.base.position.set(p.x,gardenHeight(p.x,p.z),p.z);p.base.rotation.set(0,p.home.heading,0);p.head.visible=!p.buried;p.head.position.set(0,0,0);p.head.scale.setScalar(1);p.mound.visible=false;p.cue.visible=false;p.neck.visible=false;p.jaws.forEach(j=>j.jaw.rotation.x=-j.side*.12);p.stones.forEach(s=>s.o.visible=false);}
 fireflies.reset();mountMap();}
 function activate(intro=false){group.visible=true;reset();if(intro)mode='intro';}
 function update(dt,keys,redraw=true){let warning='',surface='WATCH THE JAWS · DARK SOIL HIDES BURIED TRAPS';if(mode==='driving'&&!paused){time+=dt;const previousCar={x,z};impact=Math.max(0,impact-dt);const throttle=keys.has('KeyW')||keys.has('ArrowUp'),brake=keys.has('KeyS')||keys.has('ArrowDown'),turn=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0);
  speed=THREE.MathUtils.clamp(speed+(throttle?11:brake?(speed>1?-20:-7):-Math.sign(speed)*3)*dt,-8,GARDEN_SPEED);if(!throttle&&!brake&&Math.abs(speed)<.3)speed=0;
  yaw+=turn*(.25+Math.min(1,Math.abs(speed)/7))*1.25*Math.sign(speed||1)*dt;const move=moveInMaze(x,z,Math.sin(yaw)*speed*dt,Math.cos(yaw)*speed*dt,collisionWalls);x=move.x;z=move.z;if(move.hit)speed*=Math.exp(-dt*8);
  const slope=gardenSlope(x,z,yaw);if(speed>0&&slope.pitch>0)speed=Math.max(0,speed-slope.pitch*6*dt);
  const {c,r}=cellAt(x,z);if(c>=0&&c<COLS&&r>=0&&r<ROWS)visited.add(`${c},${r}`);
  for(const f of flowers)if(Math.hypot(x-f.x,z-f.z)<2.1){x-=Math.sin(yaw)*speed*dt;z-=Math.cos(yaw)*speed*dt;speed*=.8;}
  const car={x,z,yaw,vx:Math.sin(yaw)*speed,vz:Math.cos(yaw)*speed};attackDelay=Math.max(0,attackDelay-dt);for(const p of plants)p.cooldown=Math.max(0,p.cooldown-dt);
  const cloud=fireflies.update(dt,time,{x,z},walls);if(cloud.armed>0){for(const p of plants){if(p.age<0)continue;if(p.age<1.04){p.age=-1;p.aim=null;p.cooldown=2;}else if(p.age<1.92){p.age=1.92;}}}
  burrowTimer-=dt;if(burrowTimer<=0&&time>3&&plants.filter(p=>p.age>=0).length<HUNT.slots){const dormant=plants.find(p=>p.buried&&p.age<0&&p.cooldown<=0&&Math.hypot(p.x-x,p.z-z)>17),site=burrowSite(car,huntRandom,walls);if(dormant&&site){dormant.x=site.x;dormant.z=site.z;dormant.base.position.set(site.x,gardenHeight(site.x,site.z),site.z);dormant.head.visible=false;dormant.rate=.96+huntRandom()*.1;dormant.aim=null;dormant.previousMouth=null;burrows++;}burrowTimer=3.4+huntRandom()*1.6;}
  for(const p of (insects.some(f=>f.age>=0&&f.age<1.35)||(tunnelAt(x,z,environment.tunnels)&&plants.some(p=>p.age>=0))?[]:chooseHunters(plants,car,walls,time,attackDelay))){p.age=0;p.cycle++;p.aim=aimHunt(p,car,walls);p.previousMouth={x:p.x,z:p.z};p.base.rotation.y=Math.atan2(p.aim.x-p.x,p.aim.z-p.z);attackDelay=.65+huntRandom()*.2;attacks++;}
  for(const p of plants){if(p.age>=0)p.age+=dt*p.rate;if(p.age>=0&&p.age<HUNT.lock)p.aim=aimHunt(p,car,walls);
   const pose=trapPose(p.age,p.buried),mouth=huntMouth(p,p.age),angle=p.base.rotation.y,dx=mouth.x-p.x,dz=mouth.z-p.z;
   p.mouth=mouth;p.head.visible=pose.rise>.01;p.head.position.set(Math.cos(angle)*dx-Math.sin(angle)*dz,-6.5*(1-pose.rise)+Math.min(.65,Math.hypot(dx,dz)*.08)+gardenHeight(mouth.x,mouth.z)-gardenHeight(p.x,p.z),Math.sin(angle)*dx+Math.cos(angle)*dz);p.head.scale.setScalar(.65+.48*pose.rise);p.head.rotation.z=pose.phase==='warning'?Math.sin(p.age*45)*.035:0;p.jaws.forEach(j=>j.jaw.rotation.x=-j.side*pose.jaw);
   p.cue.visible=pose.phase==='warning'&&p.buried;p.cue.scale.setScalar(1+p.age*3);p.mound.visible=pose.phase==='warning'&&p.buried;p.mound.scale.y=.07+Math.sin(p.age*47)*.035;
   p.neck.visible=pose.rise>.05&&p.age>=0;if(p.neck.visible&&p.age-p.renderAge>1/24){const tip=p.head.position,points=[new THREE.Vector3(0,-.5,0),new THREE.Vector3(tip.x*.3,Math.max(.2,pose.rise*1.9),tip.z*.3),new THREE.Vector3(tip.x,Math.max(-.4,tip.y+.5),tip.z)];p.neck.geometry.dispose();p.neck.geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.5,6,false);p.renderAge=p.age;}
   for(const s of p.stones){const t=p.age-.78;s.o.visible=p.buried&&p.age>=0&&t>=0&&t<.9;s.o.position.set(Math.cos(s.a)*s.v*Math.max(0,t),Math.max(0,s.v*2*t-4.9*t*t),Math.sin(s.a)*s.v*Math.max(0,t));s.o.rotation.set(t*4,s.a,t*5);}
   if(Math.hypot(x-mouth.x,z-mouth.z)<19&&['warning','eruption','open','snap'].includes(pose.phase)){const side=(p.x-x)*Math.cos(yaw)-(p.z-z)*Math.sin(yaw),ahead=(p.x-x)*Math.sin(yaw)+(p.z-z)*Math.cos(yaw);warning=p.buried&&pose.phase==='warning'?(ahead<0?'SOIL MOVING BEHIND · CHANGE LINE':side>0?'LEFT SOIL SHUDDER · AMBUSH':'RIGHT SOIL SHUDDER · AMBUSH'):'LUNGING JAWS · BRAKE OR CHANGE LINE';}
   if(!capture&&p.age>=0&&sweptBite(p,p.age,car,previousCar,walls)){capture=p;captureAge=0;speed=0;mode='eating';warning='VEHICLE CAUGHT';}
   p.previousMouth={...mouth};if(p.age>HUNT.end){p.age=-1;p.aim=null;p.cooldown=2.1+huntRandom()*1.6;p.renderAge=-1;escapes++;}
  }
  if(cloud.warning)warning=cloud.warning;
  for(const event of cloud.events){if(event.hit&&impact<.1){speed*=.45;impact=1.1;insectHits++;const length=Math.hypot(x-event.x,z-event.z)||1,shove=moveInMaze(x,z,(x-event.x)/length*2.1,(z-event.z)/length*2.1,collisionWalls);x=shove.x;z=shove.z;warning='FIREFLY BURST · RECOVER YOUR LINE';}}
  if(mode==='driving'&&Math.hypot(x-goal.x,z-(goal.z+5))<4.5){mode='complete';speed=0;}
 }
 if(mode==='eating'&&!paused){captureAge+=dt;x=THREE.MathUtils.damp(x,capture.mouth.x,7,dt);z=THREE.MathUtils.damp(z,capture.mouth.z,7,dt);capture.jaws.forEach(j=>j.jaw.rotation.x=-j.side*1.48);if(captureAge>1.6)mode='eaten';}
 const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));if(redraw)drawMap();return{x:x+origin.x,z:z+origin.z,yaw,speed,time,mode,paused,warning,surface,visited:visited.size,total:COLS*ROWS,goalDistance:Math.hypot(x-goal.x,z-goal.z),forward,carScale:mode==='eating'?Math.max(.05,1-captureAge*.7):mode==='eaten'?.05:1,carY:gardenHeight(x,z)+(mode==='eating'?Math.sin(captureAge*2)*1.3:0),...gardenSlope(x,z,yaw),inTunnel:!!tunnelAt(x,z,environment.tunnels),impact,attacks,escapes,activeHunters:plants.filter(p=>p.age>=0).length};}
 return{group,maze,walls,environment,plants,flowers,insects,fireflies,activate,reset,update,mountMap,toggleMap(){mapOpen=!mapOpen;drawMap();},togglePause(){paused=!paused;return paused;},get snapshot(){return{x,z,yaw,speed,time,mode,paused,visited:visited.size,captured:!!capture,huntSeed,attacks,escapes,burrows,activeHunters:plants.filter(p=>p.age>=0).length,inTunnel:!!tunnelAt(x,z,environment.tunnels),firefliesArmed:insects.filter(f=>f.age>=0&&f.age<1.35).length,concealed:plants.filter(p=>p.buried).length,trapCycles:plants.reduce((n,p)=>n+p.cycle,0),insectHits};},origin};
}
