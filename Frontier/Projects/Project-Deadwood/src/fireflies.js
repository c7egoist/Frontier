import { rng,clamp } from './course.js';
import { gardenGround } from './garden-terrain.js';

export const FIREFLY=Object.freeze({trigger:6.2,fuse:.48,radius:7.2,damage:48,chainRadius:5.5,chainFuse:.16});
export function createFireflies(maze,seed=9812){
  const random=rng(seed),flies=[];
  maze.paths.filter((p,i)=>p.tunnel?i%2===0:i%6===0).forEach(path=>{
    const centre=path.points[6],next=path.points[7],dx=next.x-centre.x,dz=next.z-centre.z,len=Math.hypot(dx,dz),side=random()<.5?-1:1;
    // A clustered shoulder threat, not an invisible full-width proximity kill zone.
    const ax=centre.x-dz/len*path.radius*.48*side,az=centre.z+dx/len*path.radius*.48*side;
    for(let j=0;j<4;j++){
      const angle=random()*Math.PI*2,r=1.1+random()*1.7,x=ax+Math.cos(angle)*r,z=az+Math.sin(angle)*r;
      flies.push({id:flies.length,anchorX:x,anchorZ:z,x,y:gardenGround(x,z)+1.5+random()*1.3,z,
        baseY:1.5+random()*1.1,phase:random()*6.28,state:'idle',timer:0,fuse:FIREFLY.fuse,burst:false});
    }
  });return flies;
}
export function advanceFireflies(flies,car,dt,time){
  const events=[];
  for(const f of flies){
    if(f.state==='spent')continue;
    f.timer+=dt;
    if(f.state==='idle'){
      f.x=f.anchorX+Math.sin(time*1.7+f.phase)*.65;f.z=f.anchorZ+Math.cos(time*1.2+f.phase)*.6;
      f.y=gardenGround(f.x,f.z)+f.baseY+Math.sin(time*2+f.phase)*.4;
      if(Math.hypot(car.x-f.x,car.z-f.z)<FIREFLY.trigger){f.state='armed';f.timer=0;f.fuse=FIREFLY.fuse;events.push({kind:'firefly-arm',fly:f});}
    }else if(f.timer>=f.fuse){
      f.state='spent';f.burst=true;
      const distance=Math.hypot(car.x-f.x,car.z-f.z),damage=distance<FIREFLY.radius?Math.round(FIREFLY.damage*(.45+.55*(1-distance/FIREFLY.radius))):0;
      events.push({kind:'firefly-explode',fly:f,damage,radius:FIREFLY.radius});
      for(const other of flies)if(other!==f&&other.state==='idle'&&Math.hypot(other.x-f.x,other.z-f.z)<FIREFLY.chainRadius){
        other.state='armed';other.timer=0;other.fuse=FIREFLY.chainFuse;events.push({kind:'firefly-chain',fly:other});
      }
    }
  }
  return events;
}
export function explosionSample(explosion){const t=clamp(explosion.age/.45,0,1);return {radius:.3+Math.sin(t*Math.PI*.6)*explosion.radius,alpha:(1-t)*.65};}
