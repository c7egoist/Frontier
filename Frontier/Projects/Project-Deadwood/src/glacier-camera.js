import {glacierY,GLACIER,glacierObstacle} from './glacier.js';
// Retract the chase camera before it crosses a hull/ridge, rather than looking through it.
export function constrainGlacierCamera(car,desired,state,ships){
 const focus={x:car.x,y:glacierY(car.z-GLACIER.z)+2.4,z:car.z};
 let last=0;
 for(let i=1;i<=36;i++){
  const t=i/36,x=focus.x+(desired.x-focus.x)*t,z=focus.z+(desired.z-focus.z)*t;
  if(glacierObstacle(x,z,state,ships)){
   const q=Math.max(.08,last-.035);return {x:focus.x+(desired.x-focus.x)*q,y:focus.y+(desired.y-focus.y)*q,z:focus.z+(desired.z-focus.z)*q};
  }last=t;
 }return {x:desired.x,y:desired.y,z:desired.z};
}
