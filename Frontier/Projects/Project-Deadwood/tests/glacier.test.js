import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLACIER,glacierCentre,glacierY,createShips,createGlacierState,glacierSurface,glacierObstacle,glacierSupported,glacierSpawn,glacierDamage,advanceGlacier,stepGlacierVehicle,cellAt,collapseAt} from '../src/glacier.js';
import {createIceCells,fieldReachable} from '../src/glacier-field.js';
import {spawnCrystalWave,advanceCrystalStorm,STORM} from '../src/glacier-storm.js';
import {buildGlacier,updateGlacierVisuals} from '../src/glacier-world.js';
import {constrainGlacierCamera} from '../src/glacier-camera.js';
import {referenceRun} from '../tools/check-glacier-balance.js';
const carAt=(s=0,x=glacierCentre(s),speed=0)=>({x,z:GLACIER.z+s,heading:0,vx:0,vz:speed,speed});
function tick(state,car,seconds){const events=[];for(let t=0;t<seconds;t+=1/90)events.push(...advanceGlacier(state,car,1/90));return events;}
function surfacePoint(state,kind){
 for(let s=150;s<1900;s+=8)for(let off=-55;off<=55;off+=5){const x=glacierCentre(s)+off,z=GLACIER.z+s;if(glacierSurface(x,z,state).kind===kind&&glacierSupported(x,z,state)&&!glacierObstacle(x,z,state)&&!glacierObstacle(x+4,z+4,state))return carAt(s,x);}
 throw new Error(`No ${kind} found`);
}

test('2 km route has scattered grip islands and broad alternate channels, not a snow ribbon',()=>{
 const a=createGlacierState(711),b=createGlacierState(712);
 assert.ok(GLACIER.length/GLACIER.maxSpeed>30);assert.equal(createShips().length,8);assert.equal(a.field.snow.length,162);assert.ok(a.field.ridges.length>40);assert.ok(a.field.voidCells.size>10);
 assert.notDeepEqual(a.field.snow,b.field.snow);assert.notDeepEqual(a.field.ridges,b.field.ridges);assert.equal('snowRoute' in a.field,false);
});
test('20 randomized fields retain full forward connectivity to the portal',()=>{
 for(let seed=1;seed<=20;seed++){const state=createGlacierState(seed);assert.ok(fieldReachable(state.field,glacierSpawn(state),2000,[],state.avalanches,2),`Sealed field: seed ${seed}`);}
});
test('snow islands realign sideways velocity much faster than black ice',()=>{
 const state=createGlacierState(),snow=surfacePoint(state,'packed snow'),ice=surfacePoint(state,'thin black ice');snow.vx=ice.vx=12;snow.vz=ice.vz=20;
 stepGlacierVehicle(snow,{},.1,state);stepGlacierVehicle(ice,{},.1,state);assert.ok(ice.vx>snow.vx*1.7);
});
test('excess speed fractures polygon support; slow ice and full-speed snow survive',()=>{
 const fast=createGlacierState(),slow=createGlacierState(),snow=createGlacierState();for(const state of [fast,slow,snow])state.started=true;
 const a=surfacePoint(fast,'thin black ice'),b={...a},c=surfacePoint(snow,'packed snow');a.vz=38;b.vz=18;c.vz=38;
 tick(fast,a,1.7);tick(slow,b,1.7);tick(snow,c,1.7);
 assert.match(fast.failed,/broke/);assert.ok(fast.broken.has(cellAt(a.x,a.z).id));assert.equal(glacierSupported(a.x,a.z,fast),false);assert.equal(slow.failed,null);assert.equal(snow.failed,null);
 assert.ok(fast.fractures.size>0);assert.ok(fast.holes[0].cells.length>=1);assert.equal('key' in fast.holes[0],false);
});
test('snow recovery relieves strain without a permanent safe line',()=>{
 const state=createGlacierState();state.started=true;state.load=.8;const car=surfacePoint(state,'packed snow');car.vz=34;tick(state,car,.5);assert.ok(state.load<.26);assert.equal(state.failed,null);
});
test('collapse remains time-driven while stationary and has a jagged front',()=>{
 const state=createGlacierState(),car=carAt();tick(state,car,5);assert.equal(state.time,0);assert.equal(state.front,GLACIER.collapseStart);
 stepGlacierVehicle(car,{throttle:true},1/90,state);car.vx=car.vz=0;tick(state,car,22);
 assert.match(state.failed,/collapse/);assert.equal(glacierSupported(car.x,car.z,state),false);assert.notEqual(collapseAt(car.x,state),collapseAt(car.x+12,state));
});
test('Voronoi plates have irregular polygons and accurate support lookup',()=>{
 const cells=createIceCells().cells;assert.ok(cells.length>4000);assert.ok(new Set(cells.map(c=>c.polygon.length)).size>3);
 for(const c of cells.filter(c=>c.active).filter((_,i)=>i%17===0)){assert.equal(cellAt(c.x,c.z).id,c.id);assert.ok(c.polygon.length>=3);}
});
test('open leads actually remove support and end a careless attempt',()=>{
 const state=createGlacierState(),id=[...state.field.voidCells][0],p=createIceCells().cells[id],car=carAt(p.s,p.x);state.started=true;
 assert.equal(glacierSupported(car.x,car.z,state),false);advanceGlacier(state,car,1/90);assert.match(state.failed,/open lead/);
});
test('random showers release many large crystals, not one authored falling shard',()=>{
 const state=createGlacierState(711),car=glacierSpawn(state,920),spawned=spawnCrystalWave(state,car);
 assert.ok(spawned.length>=18);assert.ok(spawned.every(p=>p.s>920&&p.radius>=2.1&&p.height>=9));
 assert.ok(new Set(spawned.map(p=>Math.round(p.s/5))).size>=4);
 let maxFalling=0;for(let i=0;i<3*90;i++){advanceCrystalStorm(state,car,1/90);maxFalling=Math.max(maxFalling,state.crystals.filter(p=>p.state==='falling').length);}assert.ok(maxFalling>=12);
});
test('random sequence is reproducible for QA but changes with the run seed',()=>{
 const a=createGlacierState(711),b=createGlacierState(711),c=createGlacierState(712),car=carAt(100);
 const positions=state=>spawnCrystalWave(state,car).map(p=>[p.x,p.z,p.warning,p.height]);
 assert.deepEqual(positions(a),positions(b));assert.notDeepEqual(a.crystals,c.crystals);assert.notDeepEqual(a.crystals.filter(p=>p.state==='warning').map(p=>p.x),positions(c).map(p=>p[0]));
});
test('a new shower cannot seal all projected forward escape space',()=>{
 for(const seed of [711,712,55,123,429]){
  const state=createGlacierState(seed),car=glacierSpawn(state,180),spawned=spawnCrystalWave(state,car);
  if(spawned.length){const discs=state.crystals.filter(p=>p.state==='warning').map(p=>({x:p.x,z:p.z,r:p.radius}));assert.ok(fieldReachable(state.field,car,360,discs,state.avalanches,1.5));}
 }
});
test('falling shards move down, damage on impact and shatter into smaller temporary rubble',()=>{
 const state=createGlacierState(),origin=carAt(100);state.stormPreview=true;
 const p=spawnCrystalWave(state,origin)[0],car=carAt(p.s,p.x),startY=p.y;
 let damage=0;for(let i=0;i<3.2*90;i++)advanceCrystalStorm(state,car,1/90,n=>{damage+=n;return true;});
 assert.equal(p.state,'landed');assert.ok(p.y<startY-15);assert.ok(damage>=36&&damage<=50);assert.ok(p.rubbleRadius<p.radius);assert.equal(glacierObstacle(p.x,p.z,state),'fallen crystal');
 for(let i=0;i<10*90;i++)advanceCrystalStorm(state,origin,1/90);
 assert.ok(p.state==='inactive'||p.wave>1,'Expired rubble slot must clear or be recycled into a new shower');assert.equal(state.crystals.length,STORM.capacity);assert.ok(state.spawnedCrystals>30);
});
test('pressure ridges block and avalanches physically open alternate cuts',()=>{
 const state=createGlacierState(),ridge=state.field.ridges.find(r=>!createShips().some(p=>Math.hypot(p.x-r.x,p.z-r.z)<70));assert.equal(glacierObstacle(ridge.x,ridge.z,state),'pressure ridge');
 const a=state.avalanches[0];assert.equal(glacierObstacle(a.x,a.z,state),'ice wall');tick(state,carAt(390),3.2);assert.equal(a.state,'open');assert.notEqual(glacierObstacle(a.x,a.z,state),'ice wall');
});
test('hull damage cooldown and fast ship collisions still matter',()=>{
 const state=createGlacierState(),ship=createShips()[0];state.started=true;const car=carAt(ship.s,ship.x,30);
 assert.equal(stepGlacierVehicle(car,{},1/90,state).contact,'hull');assert.equal(state.hull,78);assert.equal(glacierDamage(state,60),false);state.time=1;glacierDamage(state,100);assert.equal(state.failed,'Vehicle crushed');
});
test('far portal still requires a forward crossing inside its aperture',()=>{
 const state=createGlacierState();state.previousZ=GLACIER.z+1999;
 assert.equal(advanceGlacier(state,carAt(2000,glacierCentre(2000)+20),1/90).some(e=>e.kind==='portal'),false);
 state.previousZ=GLACIER.z+1999;assert.ok(advanceGlacier(state,carAt(2000),1/90).some(e=>e.kind==='portal'));assert.equal(state.complete,true);
});
test('rendered fracture plates and branching cracks match actual broken support',()=>{
 const g=buildGlacier(new T.Scene()),car=surfacePoint(g.state,'thin black ice');g.state.started=true;g.state.load=.6;car.vz=38;
 advanceGlacier(g.state,car,.1);updateGlacierVisuals(g,car,0);assert.ok(g.iceField.cracks.geometry.drawRange.count>0);
 tick(g.state,car,1.7);g.state.failureAge=.4;updateGlacierVisuals(g,car,0);
 const c=g.iceField.records[cellAt(car.x,car.z).id],k=c.start*3;assert.ok(g.iceField.geometry.attributes.position.array[k+1]<g.iceField.base[k+1]-8);
 assert.ok(g.iceField.geometry.attributes.color);assert.equal(g.group.getObjectByName('PackedSnow_HighGripRoute'),undefined);
 for(const name of ['position','normal','color'])for(const v of g.iceField.geometry.attributes[name].array)assert.ok(Number.isFinite(v));
});
test('holding full throttle straight ahead no longer clears the field',()=>{
 for(const seed of [711,101,202,303,404]){
  const state=createGlacierState(seed),car={...glacierSpawn(state),heading:0,vx:0,vz:0,speed:0};
  for(let i=0;i<60*90&&!state.failed;i++){stepGlacierVehicle(car,{throttle:true},1/90,state);advanceGlacier(state,car,1/90);}
  assert.ok(state.failed);assert.equal(state.complete,false);
 }
});
test('reactive reference driver can win several changed layouts with the real controller and storm enabled',()=>{
 for(const seed of [711,303,404]){const run=referenceRun(seed);assert.equal(run.complete,true,JSON.stringify(run));assert.equal(run.failed,null);assert.ok(run.crystals>500);assert.ok(run.hull<100&&run.hull>0);assert.ok(run.time>100&&run.time<170);}
});

 test('the instanced crystal meshes really descend and shatter, not just their hazard state',()=>{
  const g=buildGlacier(new T.Scene()),car=glacierSpawn(g.state,920);spawnCrystalWave(g.state,car);updateGlacierVisuals(g,car,0);
  const matrix=new T.Matrix4();g.crystalMesh.getMatrixAt(0,matrix);const top=matrix.elements[13];assert.ok(g.crystalMesh.count>=18);
  for(let t=0;t<3.2;t+=1/90)advanceCrystalStorm(g.state,car,1/90);updateGlacierVisuals(g,car,3.2);g.crystalMesh.getMatrixAt(0,matrix);
  assert.ok(matrix.elements[13]<top-15);assert.ok(matrix.elements[5]<0);assert.ok(g.shards.count>0);
 });

 test('chase camera retracts before crossing a pressure ridge',()=>{
  const state=createGlacierState(),ridge=state.field.ridges.find(p=>!createShips().some(s=>Math.hypot(p.x-s.x,p.z-s.z)<90));
  const car={x:ridge.x,z:ridge.z-ridge.rz-ridge.rx-8},desired={x:ridge.x,y:20,z:ridge.z+ridge.rz+30};
  const p=constrainGlacierCamera(car,desired,state,createShips());assert.ok(p.z<desired.z-5);assert.equal(glacierObstacle(p.x,p.z,state),null);
 });
