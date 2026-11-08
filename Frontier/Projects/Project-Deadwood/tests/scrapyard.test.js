import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {YARD,yardCentre,yardY,createYardState,yardRoute,yardSpawn,yardStaticContact,yardObstacle,cranePose,magnetAcceleration,yardDamage,stepYardVehicle,advanceYard,constrainYardCamera} from '../src/scrapyard.js';
import {buildScrapyard,updateScrapyardVisuals} from '../src/scrapyard-world.js';
const carAt=(s=0)=>({x:yardCentre(s),z:YARD.z+s,heading:0,vx:0,vz:0,y:0,vy:0,speed:0});
function tick(state,car,seconds,preview=false,drive=false){const events=[];for(let t=0;t<seconds;t+=1/90){if(drive)stepYardVehicle(car,{},1/90,state);events.push(...advanceYard(state,car,1/90,{preview}));}return events;}
function liveCrane(state){const c=state.cranes[0];c.state='pulling';c.age=-3;c.field=1;c.malfunction=false;return c;}

test('yard is a >30 second point-to-point study with wrecks, bales, shacks and tyre courts',()=>{
 const state=createYardState(91);assert.ok(YARD.length/YARD.maxSpeed>30);assert.equal(state.cranes.length,8);assert.equal(state.drones.length,6);
 for(const kind of ['wrecks','bales','shack','tyres'])assert.ok(state.layout.blocks.some(b=>b.kind===kind));assert.ok(state.layout.blocks.length>100);
});
test('20 seeded layouts retain distinct left/right routes, not a reserved straight lane',()=>{
 for(let seed=1;seed<=20;seed++){
  const state=createYardState(seed),a=yardRoute(state.layout,-1),b=yardRoute(state.layout,1);assert.ok(a.length>300,`seed ${seed}`);assert.equal(a.length,b.length);
  assert.ok(Math.max(...a.map((p,i)=>Math.abs(p.x-b[i].x)))>55,`insufficient choices: ${seed}`);
  assert.ok(a.every(p=>!yardStaticContact(p.x,p.z,state.layout,2.5)));
 }
});
test('run seeds change the scrap layout and automatic hazard sequence',()=>{
 const a=createYardState(91),b=createYardState(92),same=createYardState(91);assert.notDeepEqual(a.layout.blocks,b.layout.blocks);assert.deepEqual(a.layout.blocks,same.layout.blocks);assert.notDeepEqual(a.cranes,b.cranes);
});
test('crane slew is bounded around its authored base yaw, never accumulated each frame',()=>{
 const state=createYardState(),c=state.cranes[0],base=c.baseYaw;tick(state,carAt(160),20,true);
 assert.ok(Math.abs(c.yaw-base)<=.521);assert.ok(Math.hypot(c.head.x-c.x,c.head.z-c.z)<39);assert.ok(Number.isFinite(c.head.y));
});
test('magnet force increases toward the head and is zero outside its radius',()=>{
 const state=createYardState(),c=liveCrane(state),y=c.head.y-10;
 const inner=magnetAcceleration(c,c.head.x+8,y,c.head.z),outer=magnetAcceleration(c,c.head.x+c.radius*.85,y,c.head.z),outside=magnetAcceleration(c,c.head.x+c.radius+1,y,c.head.z);
 assert.ok(inner.x<0);assert.ok(inner.y>18);assert.ok(inner.strength>outer.strength*5);assert.equal(outside.strength,0);c.field=0;assert.equal(magnetAcceleration(c,c.head.x+2,y,c.head.z).strength,0);
});
test('magnet pulls and lifts loose metal while a non-magnetic object stays laterally put',()=>{
 const state=createYardState(),c=liveCrane(state),metal=state.bodies[140],rubber=state.bodies[141];state.layout.blocks=[];state.layout.craneBases=[];
 for(const b of [metal,rubber])Object.assign(b,{state:'loose',attachedTo:null,x:c.head.x+9,z:c.head.z,y:c.head.y-4,vx:0,vy:0,vz:0,mass:1,magnetic:b===metal});
 const start=metal.x,rubberX=rubber.x;tick(state,carAt(),.7,true);
 assert.ok(metal.x<start-2||metal.state==='attached');assert.equal(rubber.x,rubberX);assert.ok(metal.y>rubber.y);
});
test('the actual player car can be dragged, lifted and held by a powerful magnet',()=>{
 const state=createYardState(),c=liveCrane(state),car={...carAt(),x:c.head.x+5,z:c.head.z};tick(state,car,1.4,false,true);
 assert.ok(car.y>6);assert.ok(state.captured);assert.equal(state.captured.crane,0);tick(state,car,3,false,true);assert.match(state.failed,/magnet/);assert.ok(car.y>5);
});
test('a driver who leaves the outer field can escape without being lifted',()=>{
 const state=createYardState(),c=liveCrane(state);state.layout.blocks=[];state.layout.craneBases=[];
 const car={...carAt(),x:c.head.x+c.radius*.86,z:c.head.z,heading:Math.PI/2},start=car.x;
 for(let t=0;t<2;t+=1/90){stepYardVehicle(car,{throttle:true},1/90,state);advanceYard(state,car,1/90);}
 assert.ok(car.x>start+15);assert.equal(state.captured,null);assert.equal(state.failed,null);assert.ok(car.y<.1);
});
test('crane release drops its real attached load; the load falls and lands physically',()=>{
 const state=createYardState(),c=liveCrane(state),car=carAt();c.age=5.19;const body=state.bodies.find(b=>b.attachedTo===c.id),before=body.y;
 const events=tick(state,car,.12,true);assert.equal(c.state,'dumping');assert.ok(state.craneDrops>=7);assert.ok(events.some(e=>e.kind==='crane-dump'));assert.equal(body.attachedTo,null);assert.ok(body.y<before);
 tick(state,car,2,true);assert.ok(state.impacts.length||state.bodies.some(b=>b.state==='loose'));
});
test('malfunction brings the boom down with its load still attached, then leaves a collider',()=>{
 const state=createYardState(),c=state.cranes[0],car=carAt();state.layout.blocks=[];state.layout.craneBases=[];c.state='buckling';c.age=1.75;c.field=1;
 const high=c.tip.y;tick(state,car,1.2,true);assert.equal(c.state,'collapsing');assert.ok(c.tip.y<high-5);assert.ok(state.bodies.some(b=>b.state==='attached'&&b.attachedTo===0));
 tick(state,car,2.2,true);assert.equal(c.state,'fallen');assert.equal(state.collapses,1);assert.ok(state.craneDrops>=7);
 const x=c.x+(c.tip.x-c.x)*.8,z=c.z+(c.tip.z-c.z)*.8;assert.equal(yardObstacle(x,z,state).kind,'fallen crane');
});
test('drone cargo physically descends from a hover and becomes ground scrap',()=>{
 const state=createYardState(),car=carAt(100),d=state.drones[0];state.layout.blocks=[];state.layout.craneBases=[];
 state.drones.forEach(p=>{p.state='waiting';p.delay=1000;p.age=0;});Object.assign(d,{state:'warning',age:2,warn:1.3,x:car.x,z:car.z+90,y:28});
 tick(state,car,.22,true);assert.ok(state.droneDrops>=1);const b=state.bodies.find(p=>p.state==='falling'&&p.z>car.z+70&&p.y>20);assert.ok(b);const height=b.y;
 tick(state,car,1.8,true);assert.ok(b.y<height-10);assert.equal(state.droneDrops,5);assert.ok(state.bodies.some(p=>p.state==='loose'&&Math.abs(p.z-d.z)<15));
});
test('ordinary automatic cycles create repeated drone drops without a chosen drop button',()=>{
 const state=createYardState(),car=carAt(170);tick(state,car,20,true);assert.ok(state.droneDrops>=40);assert.ok(state.craneDrops>0||state.collapses>0);assert.ok(state.bodies.length===YARD.bodyCapacity);
});
test('falling scrap damages the car rather than passing through it',()=>{
 const state=createYardState(),car=carAt(),b=state.bodies[150];Object.assign(b,{state:'falling',x:car.x,z:car.z,y:12,vy:-10,vx:0,vz:0,mass:2.6,magnetic:true,hit:false});
 const events=tick(state,car,1.2);assert.ok(state.hull<100);assert.ok(events.some(e=>e.kind==='hit'));
});
test('grounded light scrap can be pushed rather than permanently sealing the route',()=>{
 const state=createYardState(),car=carAt(),b=state.bodies[150];Object.assign(b,{state:'loose',x:car.x,z:car.z+3,y:.5,vx:0,vz:0,mass:.65,r:1.1,height:1});car.vz=15;car.speed=15;
 const result=stepYardVehicle(car,{throttle:true},.05,state);assert.equal(result.contact.kind,'loose scrap');assert.ok(b.vz>10);assert.ok(car.z>YARD.z);
});
test('hulks and shacks collide; damage cooldown prevents one hit being charged every frame',()=>{
 const state=createYardState(),b=state.layout.blocks.find(b=>b.kind==='shack');assert.equal(yardStaticContact(b.x,b.z,state.layout).kind,'shack');assert.equal(yardDamage(state,35),true);assert.equal(yardDamage(state,35),false);state.hazardTime=1;yardDamage(state,100);assert.match(state.failed,/crushed/);
});
test('yard exit is a forward aperture crossing and only completes once',()=>{
 const state=createYardState(),car=carAt(YARD.length);state.previousZ=car.z-1;const events=advanceYard(state,car,1/90);assert.ok(events.some(e=>e.kind==='portal'));assert.equal(state.complete,true);assert.deepEqual(advanceYard(state,car,1/90),[]);
 const miss=createYardState();miss.previousZ=car.z-1;assert.equal(advanceYard(miss,{...car,x:car.x+30},1/90).some(e=>e.kind==='portal'),false);
});
test('rendered crane, cargo, shacks, rubber tyres and dynamic body matrices are present and finite',()=>{
 const g=buildScrapyard(new T.Scene()),car=carAt();updateScrapyardVisuals(g,car,0,{inspect:true});let cranes=0,drones=0,shacks=0,tyres=0;
 g.group.traverse(o=>{if(o.name.startsWith('MagneticSalvageCrane_'))cranes++;if(o.name.startsWith('IndustrialCargoDrone_'))drones++;if(o.name.startsWith('CorrugatedMetalShack_'))shacks++;if(o.name==='RubberTyreHeaps')tyres+=o.count;if(o.isInstancedMesh)for(const n of o.instanceMatrix.array)assert.ok(Number.isFinite(n));});
 assert.equal(cranes,8);assert.equal(drones,6);assert.ok(shacks>=5);assert.ok(tyres>300);assert.ok(g.bodyParts.metal.count>80);
 const c=liveCrane(g.state),body=g.state.bodies.find(b=>b.attachedTo===c.id),before=body.y;c.age=5.19;tick(g.state,car,.5,true);updateScrapyardVisuals(g,car,1);assert.ok(body.y<before);assert.ok(g.shadows.count>0);
});
test('scrap-aware chase camera retracts before passing through a wreck pile',()=>{
 const state=createYardState(),b=state.layout.blocks[0],car={x:b.x,z:b.z-b.rx-b.rz-8,y:0},wanted={x:b.x,y:15,z:b.z+b.rz};const p=constrainYardCamera(car,wanted,state);assert.ok(p.z<wanted.z-5);
});
