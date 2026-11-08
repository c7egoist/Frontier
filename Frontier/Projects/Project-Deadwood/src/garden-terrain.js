import { clamp, rng } from './course.js';

// Shared render/collision terrain contract. +Z is forward; coordinates remain in the same scene.
export const GARDEN_ORIGIN={x:900,z:2600};
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function gardenGround(x,z){
  const u=x-900,v=z-2600;
  const arrival=smooth(Math.hypot(u,v)/35),exit=smooth(Math.hypot(u,v-480)/24);
  return (1.65*Math.sin(v/29)+1.1*Math.sin(u/22+v/47)+.5*Math.sin((u+v)/8.5))*arrival*exit;
}
export function warpCell(c,r){
  const x=900+(c-4)*40,z=2600+r*40;
  const fade=smooth(Math.min(Math.hypot(c-4,r),Math.hypot(c-4,r-12))/1.7);
  return {x:x+fade*(Math.sin(r*1.17+c*.9)*6+Math.cos(c*2.1-r*.4)*2),z:z+fade*Math.sin(c*1.31+r*.73)*7};
}
export function makePassages(cells,edges){
  const byId=new Map(cells.map(c=>[`${c.c},${c.r}`,c])),random=rng(84312),segments=[],paths=[];
  for(const [index,edge] of edges.entries()){
    const [a,b]=edge.split('|').map(k=>byId.get(k)),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
    const bend=(random()-.5)*15,radius=7.6+random()*2.4,points=[];
    for(let i=0;i<=12;i++){
      const t=i/12,s=Math.sin(t*Math.PI)*bend+Math.sin(t*Math.PI*2)*bend*.16;
      points.push({x:a.x+dx*t+nx*s,z:a.z+dz*t+nz*s});
      if(i)segments.push({a:points[i-1],b:points[i],radius,path:index});
    }
    paths.push({id:index,edge,radius,points,tunnel:index%5===1||index%7===3||index%11===6,roof:7.3+random()*2});
  }
  // Arrival/exit aprons connect to the portal openings, not arbitrary outer-field shortcuts.
  segments.push({a:{x:900,z:2558},b:byId.get('4,0'),radius:10.5,path:-1},{a:byId.get('4,12'),b:{x:900,z:3110},radius:10.5,path:-2});
  return {segments,paths};
}
const caches=new WeakMap(),BIN=24;
function binsFor(maze){
  let bins=caches.get(maze);if(bins)return bins;
  bins=new Map();
  maze.segments.forEach(s=>{
    const reach=s.radius+22;
    for(let ix=Math.floor((Math.min(s.a.x,s.b.x)-reach)/BIN);ix<=Math.floor((Math.max(s.a.x,s.b.x)+reach)/BIN);ix++)
      for(let iz=Math.floor((Math.min(s.a.z,s.b.z)-reach)/BIN);iz<=Math.floor((Math.max(s.a.z,s.b.z)+reach)/BIN);iz++){
        const key=`${ix},${iz}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(s);
      }
  });caches.set(maze,bins);return bins;
}
export function passageSample(x,z,maze){
  let best=1e4,nearest=null,along=0;
  const list=binsFor(maze).get(`${Math.floor(x/BIN)},${Math.floor(z/BIN)}`)||[];
  for(const s of list){
    const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=clamp(((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz),0,1);
    const d=Math.hypot(x-s.a.x-t*dx,z-s.a.z-t*dz)-s.radius;
    if(d<best){best=d;nearest=s;along=t;}
  }
  return {distance:best,segment:nearest,along};
}
export function gardenTerrain(x,z,maze){
  const d=passageSample(x,z,maze).distance;
  const height=11+Math.sin(x/18+z/33)*2.8+Math.cos(z/21)*1.5;
  return gardenGround(x,z)+smooth(d/8.5)*height;
}
export function createStones(maze){
  const random=rng(8109),stones=[];
  for(let i=0;i<180;i++){
    const path=maze.paths[Math.floor(random()*maze.paths.length)],j=1+Math.floor(random()*10),p=path.points[j],q=path.points[j+1];
    const dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz),side=random()<.5?-1:1;
    const offset=side*(path.radius*(.48+random()*.45)),x=p.x-dz/len*offset,z=p.z+dx/len*offset;
    if(Math.hypot(x-900,z-2600)<27||Math.hypot(x-900,z-3080)<18)continue;
    const radius=.3+random()*1.0,height=.2+random()*1.05;
    stones.push({x,z,y:gardenGround(x,z),radius,height,rotation:random()*6.28,solid:height>.52});
  }
  return stones;
}
export function gardenRoofHeight(x,z,maze){
  let ceiling=Infinity;
  for(const path of maze.paths){
    if(!path.tunnel)continue;let distance=Infinity,closest=null;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),qx=a.x+dx*t,qz=a.z+dz*t,d=Math.hypot(x-qx,z-qz);
      if(d<distance){distance=d;closest={x:qx,z:qz};}
    }
    const radius=path.radius+1.1;
    if(distance<radius)ceiling=Math.min(ceiling,gardenGround(closest.x,closest.z)+.3+Math.sqrt(1-Math.pow(distance/radius,2))*(path.roof-.4));
  }
  return ceiling;
}
export function constrainGardenCamera(car,desired,maze){
  const start={x:car.x,y:gardenGround(car.x,car.z)+2.8,z:car.z};
  let result=start;
  for(let i=1;i<=18;i++){
    const t=i/18,p={x:start.x+(desired.x-start.x)*t,y:start.y+(desired.y-start.y)*t,z:start.z+(desired.z-start.z)*t};
    if(gardenTerrain(p.x,p.z,maze)>p.y-.55||gardenRoofHeight(p.x,p.z,maze)<p.y+.45)break;
    result=p;
  }
  return result;
}
