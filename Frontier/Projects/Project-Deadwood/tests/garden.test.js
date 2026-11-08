import test from 'node:test';
import assert from 'node:assert/strict';
import { GARDEN,createMaze,createPlants,primarySamples,collidesMaze,advancePlants,inMouth,collidesClosedMouth,createFlowers,gardenExit } from '../src/garden.js';
import { passageSample,gardenGround,gardenTerrain,gardenRoofHeight,constrainGardenCamera } from '../src/garden-terrain.js';
import { stepVehicle } from '../src/vehicle.js';

const edge=(a,b)=>[a,b].sort().join('|');
test('maze has a connected main route, real branch choices, loops and blind alleys',()=>{
 const m=createMaze();assert.ok(m.distance>1120&&m.distance<1250);assert.equal(m.primary.length,29);
 const keys=new Set(m.cells.map(p=>`${p.c},${p.r}`)),edges=new Set(m.edges);
 m.primary.slice(1).forEach((p,i)=>assert.ok(edges.has(edge(`${m.primary[i].c},${m.primary[i].r}`,`${p.c},${p.r}`))));
 const degree=new Map([...keys].map(k=>[k,0]));m.edges.forEach(e=>e.split('|').forEach(k=>degree.set(k,degree.get(k)+1)));
 assert.ok([...degree.values()].some(n=>n>=3));assert.ok([...degree.values()].filter(n=>n===1).length>=4);
 // Connected graph + E >= V guarantees at least one loop, without making this a lap race.
 const visited=new Set(),queue=[`${m.entry.c},${m.entry.r}`];queue[0]='4,0';
 while(queue.length){const k=queue.shift();if(visited.has(k))continue;visited.add(k);for(const e of m.edges){const [a,b]=e.split('|');if(a===k&&!visited.has(b))queue.push(b);if(b===k&&!visited.has(a))queue.push(a);}}
 assert.equal(visited.size,keys.size);assert.ok(m.edges.length>=m.cells.length);
});
test('curved passages keep a car-sized centreline; stones create real shoulder obstacles',()=>{
 const maze=createMaze();
 for(const s of maze.segments)for(const t of [0,.25,.5,.75,1]){
  const x=s.a.x+(s.b.x-s.a.x)*t,z=s.a.z+(s.b.z-s.a.z)*t;
  assert.ok(passageSample(x,z,maze).distance<-6);
 }
 assert.ok(maze.stones.length>150);assert.ok(maze.stones.some(s=>s.solid&&collidesMaze(s.x,s.z,maze)));
 assert.ok(collidesMaze(705,2590,maze));
});
test('wavy terrain has actual slopes and the bank surface follows the same signed passages',()=>{
 const m=createMaze(),heights=m.paths.flatMap(p=>p.points.map(q=>gardenGround(q.x,q.z)));
 assert.ok(Math.max(...heights)-Math.min(...heights)>4);
 for(const p of m.paths)for(const q of p.points)assert.ok(Math.abs(gardenTerrain(q.x,q.z,m)-gardenGround(q.x,q.z))<.0001);
 assert.ok(m.paths.filter(p=>p.tunnel).length>=20);
 const bank={x:705,z:2590};assert.ok(gardenTerrain(bank.x,bank.z,m)>gardenGround(bank.x,bank.z)+7);
});
test('chase camera retracts before entering a solid organic bank',()=>{
 const m=createMaze(),car={x:m.entry.x,z:m.entry.z};
 const desired={x:car.x+45,y:5,z:car.z+30},p=constrainGardenCamera(car,desired,m);
 assert.ok(Math.hypot(p.x-car.x,p.z-car.z)<Math.hypot(desired.x-car.x,desired.z-car.z));
 assert.ok(gardenTerrain(p.x,p.z,m)<p.y);
});
test('both waiting surface traps and hidden erupting traps populate the maze',()=>{
 const p=createPlants();assert.ok(p.length>16);assert.ok(p.some(x=>x.buried&&x.rise===0));assert.ok(p.some(x=>!x.buried&&x.rise===1));
 assert.deepEqual(p,createPlants());
});
test('buried trap warns, erupts with debris event, opens, winds up, snaps and captures',()=>{
 const p=createPlants().find(p=>p.buried),car={x:p.x,z:p.z},events=[];
 assert.equal(p.state,'dormant');
 for(let t=0;t<5;t+=1/90)events.push(...advancePlants([p],car,1/90));
 for(const kind of ['warning','erupt','aim','snap','capture'])assert.ok(events.some(e=>e.kind===kind),kind);
 assert.equal(p.state,'feeding');assert.equal(p.closure,1);assert.equal(p.bursts,1);
 assert.equal(events.filter(e=>e.kind==='capture').length,1);
});
test('moving clear during telegraph avoids capture; a missed trap reopens after cooldown',()=>{
 const p=createPlants().find(p=>!p.buried),car={x:p.x,z:p.z};advancePlants([p],car,.1);assert.equal(p.state,'windup');
 car.x+=25;let capture=false;
 for(let t=0;t<8;t+=.02)if(advancePlants([p],car,.02).some(e=>e.kind==='capture'))capture=true;
 assert.equal(capture,false);assert.equal(p.state,'open');assert.equal(p.closure,0);assert.ok(p.snaps>0);
});
test('mouth envelope respects plant rotation and does not eat a distant vehicle',()=>{
 const p=createPlants()[0];p.yaw=Math.PI/2;
 assert.ok(inMouth(p,p.x,p.z));assert.equal(inMouth(p,p.x+20,p.z),false);
});
test('a full-speed straight pass is caught by a concealed ambush; immediate braking can escape',()=>{
 function run(brake){
  const p=createPlants().find(p=>p.buried),car={x:p.x,z:p.z-36,speed:26,heading:0};let warned=false,caught=false,warningAt=0;
  for(let t=0;t<2;t+=1/180){
   if(brake&&warned)car.speed*=Math.exp(-5/180);car.z+=car.speed/180;
   for(const e of advancePlants([p],car,1/180)){if(e.kind==='warning'){warned=true;warningAt=t;}if(e.kind==='capture')caught=true;}
  }return {caught,warningAt};
 }
 assert.equal(run(false).caught,true);assert.equal(run(true).caught,false);
 assert.ok(GARDEN.warning+GARDEN.rise+GARDEN.windup+GARDEN.snap<.8);
});
test('retries can vary ambush anchors while keeping the render pool and graph topology stable',()=>{
 const m=createMaze(),a=createPlants(m,111),b=createPlants(m,112);
 assert.equal(a.length,b.length);assert.notDeepEqual(a,b);assert.ok(a.filter(p=>p.buried).length>a.length*.85);
 assert.ok(a.every(p=>Number.isFinite(p.y)));
});
test('garden vehicle has full maze bounds, a lower speed cap, and cannot drive through a bank',()=>{
 const maze=createMaze(),car={x:maze.entry.x,z:maze.entry.z,speed:0,heading:0};
 for(let i=0;i<900;i++)stepVehicle(car,{throttle:true},1/90,(x,z)=>collidesMaze(x,z,maze),1);
 assert.ok(car.speed<=GARDEN.maxSpeed);assert.ok(car.z<maze.entry.z+120);
 // The first forward dead end blocks driving straight instead of teleporting to the next turn.
 assert.ok(car.z>maze.entry.z+65);
});
test('far gate is directional and width-bound, and is in the same world coordinate space',()=>{
 const m=createMaze(),car={x:m.exit.x,z:m.exit.z+10};assert.ok(gardenExit(m.exit.z+8,car,m));
 assert.equal(gardenExit(m.exit.z+20,car,m),false);car.x+=25;assert.equal(gardenExit(m.exit.z+8,car,m),false);
 assert.ok(GARDEN.landing.x>GARDEN.x+500);
});

test('closed jaws are physical obstacles, not a safe mesh the car can ghost through',()=>{
 const p=createPlants().find(p=>!p.buried);p.rise=1;p.closure=1;p.yaw=0;
 assert.equal(collidesClosedMouth(p,p.x,p.z),true);assert.equal(collidesClosedMouth(p,p.x+5,p.z),false);
 p.closure=0;assert.equal(collidesClosedMouth(p,p.x,p.z),false);
});

test('curved editor guide follows the real passages and tunnel roof clearance is finite',()=>{
 const m=createMaze(),points=primarySamples(m);assert.ok(points.length>300);
 for(const p of points)assert.ok(passageSample(p.x,p.z,m).distance<-6);
 const tunnel=m.paths.find(p=>p.tunnel),p=tunnel.points[6],roof=gardenRoofHeight(p.x,p.z,m);
 assert.ok(roof>gardenGround(p.x,p.z)+6);assert.ok(roof<gardenGround(p.x,p.z)+10);
});
