import { warpCell,makePassages,createStones,passageSample,gardenGround,gardenTerrain } from './garden-terrain.js';
import { COURSE, rng, clamp } from './course.js';

export const GARDEN = Object.freeze({ x: COURSE.destination.x, z: COURSE.destination.z, pitch: 40, cols: 9, rows: 13,
  maxSpeed: 29, warning: .18, rise: .22, windup: .16, snap: .12, hold: .8, cooldown: 1.5,
  landing: { x: 1600, z: 3300, length: 260 } });
const key = (c,r) => `${c},${r}`;
const edgeKey = (a,b) => [a,b].sort().join('|');
export const cellPosition = (c,r) => warpCell(c,r);
export function createMaze() {
  const cells = new Map(), edges = new Set(), primary = [];
  const addPath = (turns, main=false) => {
    let [c,r] = turns[0];
    const add=()=>{const id=key(c,r);cells.set(id,{c,r,...cellPosition(c,r)});if(main&&primary.at(-1)!==id)primary.push(id);};add();
    for(const [tc,tr] of turns.slice(1)) while(c!==tc||r!==tr){
      const a=key(c,r); if(c!==tc)c+=Math.sign(tc-c);else r+=Math.sign(tr-r);add();edges.add(edgeKey(a,key(c,r)));
    }
  };
  addPath([[4,0],[4,2],[2,2],[2,4],[6,4],[6,6],[3,6],[3,8],[7,8],[7,10],[4,10],[4,12]],true);
  // Real alternatives, reconnecting loops, and blind alleys. Nothing is a lap requirement.
  addPath([[4,1],[6,1],[6,2],[5,2]]);
  addPath([[2,3],[0,3],[0,5],[2,5],[2,4]]);
  addPath([[4,4],[4,5],[3,5],[3,6]]);
  addPath([[6,5],[8,5],[8,7],[7,7],[7,8]]);
  addPath([[3,7],[1,7],[1,9],[2,9]]);
  addPath([[5,8],[5,9],[4,9],[4,10]]);
  addPath([[7,10],[8,10],[8,12],[6,12]]);
  addPath([[4,11],[2,11],[2,12]]);
  const {segments,paths}=makePassages([...cells.values()],[...edges]);
  const gateColliders=[];
  for(const z of [GARDEN.z-36,GARDEN.z+490])for(const side of [-1,1]){
    gateColliders.push({x:GARDEN.x+side*13,z,w:5,d:6},{x:GARDEN.x+side*18.5,z,w:7,d:6});
  }
  const maze={gateColliders,cells:[...cells.values()],edges:[...edges],primary:primary.map(id=>cells.get(id)),segments,paths,entry:cellPosition(4,0),exit:cellPosition(4,12)};
  const mainEdges=new Set(primary.slice(1).map((id,i)=>edgeKey(primary[i],id)));
  maze.distance=paths.filter(p=>mainEdges.has(p.edge)).reduce((sum,p)=>sum+p.points.slice(1).reduce((n,q,i)=>n+Math.hypot(q.x-p.points[i].x,q.z-p.points[i].z),0),0);
  maze.stones=createStones(maze);return maze;
}
export function primarySamples(maze){
  const points=[];
  for(let i=1;i<maze.primary.length;i++){
    const a=maze.primary[i-1],b=maze.primary[i],edge=edgeKey(key(a.c,a.r),key(b.c,b.r)),path=maze.paths.find(p=>p.edge===edge);
    const p=path.points,reverse=Math.hypot(p[0].x-a.x,p[0].z-a.z)>1;
    points.push(...(reverse?[...p].reverse():p).slice(i===1?0:1));
  }
  return points;
}
export function collidesMaze(x,z,maze,radius=COURSE.carRadius){
  if(passageSample(x,z,maze).distance>-radius)return true;
  if(maze.stones.some(s=>s.solid&&Math.hypot(x-s.x,z-s.z)<s.radius*.85+radius))return true;
  return maze.gateColliders.some(w=>{
    const dx=Math.max(Math.abs(x-w.x)-w.w/2,0),dz=Math.max(Math.abs(z-w.z)-w.d/2,0);
    return dx*dx+dz*dz<radius*radius;
  });
}

export function createPlants(maze=createMaze(),seed=3511){
  const random=rng(seed),plants=[];
  maze.paths.filter(p=>p.id%3!==2).forEach((path,i)=>{
    const index=4+Math.floor(random()*5),a=path.points[index],b=path.points[index+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    const offset=(random()-.5)*6.5,x=a.x-dz/len*offset,z=a.z+dx/len*offset;
    if(Math.hypot(path.points[6].x-GARDEN.x,path.points[6].z-GARDEN.z)<29)return;
    const buried=i%9!==0;
    plants.push({id:plants.length,x,z,y:gardenGround(x,z),yaw:Math.atan2(dx,dz),scale:.9+random()*.22,buried,
      phase:random()*Math.PI*2,state:buried?'dormant':'open',timer:0,rise:buried?0:1,closure:0,bursts:0,snaps:0,
      headX:0,headZ:0,aimX:0,aimZ:0,ambush:buried});
  });
  return plants;
}
export function mouthCentre(p){return {x:p.x+(p.headX||0),z:p.z+(p.headZ||0)};}
export function inMouth(plant,x,z,padding=0){
  const centre=mouthCentre(plant),dx=x-centre.x,dz=z-centre.z,c=Math.cos(plant.yaw),s=Math.sin(plant.yaw);
  return Math.pow((dx*c-dz*s)/(4.4*plant.scale+padding),2)+Math.pow((dx*s+dz*c)/(4.8*plant.scale+padding),2)<1;
}
export function collidesClosedMouth(plant,x,z,radius=1.2){
  if(plant.rise<.9||plant.closure<.82)return false;
  const m=mouthCentre(plant),dx=x-m.x,dz=z-m.z,c=Math.cos(plant.yaw),s=Math.sin(plant.yaw);
  const halfWidth=Math.cos(.08+plant.closure*1.32)*6*plant.scale+radius;
  return Math.pow((dx*c-dz*s)/halfWidth,2)+Math.pow((dx*s+dz*c)/(5.4*plant.scale+radius),2)<1;
}
function aimPlant(p,car){
  const lead=.18*Math.max(0,car.speed||0),dx=car.x+Math.sin(car.heading||0)*lead-p.x,dz=car.z+Math.cos(car.heading||0)*lead-p.z,len=Math.hypot(dx,dz)||1;
  const reach=Math.min(p.buried?2.2:4.2,len);p.aimX=dx/len*reach;p.aimZ=dz/len*reach;
}
export function advancePlants(plants,car,dt){
  const events=[];
  for(const p of plants){
    const distance=Math.hypot(p.x-car.x,p.z-car.z);p.timer+=dt;
    const trigger=12+Math.max(0,car.speed||0)*.23;
    if(p.state==='dormant'&&distance<trigger){p.state='warning';p.timer=0;aimPlant(p,car);events.push({kind:'warning',plant:p});}
    else if(p.state==='warning'&&p.timer>=GARDEN.warning){p.state='rising';p.timer=0;p.bursts++;events.push({kind:'erupt',plant:p});}
    else if(p.state==='rising'){
      p.rise=clamp(p.timer/GARDEN.rise,0,1);
      if(p.rise===1){p.state='windup';p.timer=0;aimPlant(p,car);events.push({kind:'aim',plant:p});}
    }else if(p.state==='open'&&distance<13){p.state='windup';p.timer=0;aimPlant(p,car);events.push({kind:'aim',plant:p});}
    else if(p.state==='windup'){
      p.closure=Math.sin(p.timer*55)*.08;
      const t=clamp(p.timer/GARDEN.windup,0,1);p.headX=p.aimX*t;p.headZ=p.aimZ*t;
      if(p.timer>=GARDEN.windup){p.state='snapping';p.timer=0;p.snaps++;events.push({kind:'snap',plant:p});}
    }else if(p.state==='snapping'){
      p.closure=clamp(p.timer/GARDEN.snap,0,1);
      if(p.closure>.3&&inMouth(p,car.x,car.z,.65)){
        p.state='feeding';p.timer=0;p.closure=1;events.push({kind:'capture',plant:p});
      }else if(p.closure===1){p.state='closed';p.timer=0;}
    }else if(p.state==='closed'&&p.timer>GARDEN.hold){p.state='cooldown';p.timer=0;}
    else if(p.state==='cooldown'){
      const t=clamp(p.timer/GARDEN.cooldown,0,1);p.closure=1-t;p.headX=p.aimX*(1-t);p.headZ=p.aimZ*(1-t);
      if(t===1){p.state='open';p.timer=0;}
    }
  }
  return events;
}
export function createFlowers(maze=createMaze()){
  const flowers=[[5,1],[1,3],[5,4],[7,6],[2,7],[6,9],[3,11],[7,12]].map(([c,r],i)=>{
    const p=cellPosition(c,r);
    if(i===0)return {id:i,x:GARDEN.x+13,z:GARDEN.z+53,height:23,phase:2.2};
    if(i===1)return {id:i,x:GARDEN.x-13,z:GARDEN.z+78,height:26,phase:4.1};
    return {id:i,x:p.x+12,z:p.z+12,height:17+(i%3)*5,phase:i*2.17};
  });
  return flowers.map(f=>{const y=gardenTerrain(f.x,f.z,maze);return {...f,y,height:f.height+y};});
}
export function gardenExit(previousZ,car,maze){return previousZ<maze.exit.z+9&&car.z>=maze.exit.z+9&&Math.abs(car.x-maze.exit.x)<9.3;}
