import {rng} from './level.js';
import {cellPoint,mazePath,wallContact,segmentDistance} from './garden-level.js';
export function gardenHeight(x,z){return .85*Math.sin(x/18)+1.1*Math.sin(z/29)+.42*Math.sin((x+z)/9)+.18*Math.sin(x/4)*Math.sin(z/6);}
export function gardenSlope(x,z,yaw){const dx=Math.sin(yaw),dz=Math.cos(yaw),sample=(a,b)=>gardenHeight(x+a,z+b);return{pitch:Math.atan((sample(dx*2,dz*2)-sample(-dx*2,-dz*2))/4),roll:Math.atan((sample(dz, -dx)-sample(-dz,dx))/2)};}
export function environmentLayout(maze,walls){const random=rng(maze.seed+911),path=mazePath(maze),rocks=[],groundFlowers=[];
 for(let r=0;r<maze.cells.length;r++)for(let c=0;c<maze.cells[r].length;c++){const p=cellPoint(c,r);for(let j=0;j<2;j++){const side=j?1:-1,x=p.x+side*(5.5+random()*1.8),z=p.z+(random()-.5)*12;if(!wallContact(x,z,walls,1.3)){groundFlowers.push({x,z,size:.5+random()*.55,shade:random()});if(r>0&&random()<.6)rocks.push({x:x-side*1.1,z:z+1.5,radius:.4+random()*.65,phase:random()*6.28});}}}
 const passages=[];for(let r=0;r<maze.cells.length;r++)for(let c=0;c<maze.cells[r].length;c++){const a=cellPoint(c,r),bits=maze.cells[r][c];if(bits&1)passages.push([a,cellPoint(c,r+1)]);if(bits&2)passages.push([a,cellPoint(c+1,r)]);if(r>0&&random()<.7){const x=a.x+(random()<.5?-1:1)*(5.7+random()),z=a.z+(random()<.5?-1:1)*(5.4+random());if(!wallContact(x,z,walls,1.6))rocks.push({x,z,radius:.45+random()*.55,phase:random()*6.28});}}
 const clearRocks=[];for(const rock of rocks){if(passages.some(([a,b])=>segmentDistance(rock.x,rock.z,a,b)<rock.radius+1.8))continue;if(clearRocks.some(other=>Math.hypot(other.x-rock.x,other.z-rock.z)<other.radius+rock.radius+.5))continue;clearRocks.push(rock);}
 const tunnels=[];for(const index of [1,7,13,20,26]){if(index+1>=path.length)continue;const a=cellPoint(path[index].c,path[index].r),b=cellPoint(path[index+1].c,path[index+1].r);tunnels.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,yaw:Math.atan2(b.x-a.x,b.z-a.z),length:18,width:8.5,height:6.4});}
 return{rocks:clearRocks,groundFlowers,tunnels};}
export function tunnelAt(x,z,tunnels){return tunnels.find(t=>{const dx=x-t.x,dz=z-t.z,side=dx*Math.cos(t.yaw)-dz*Math.sin(t.yaw),along=dx*Math.sin(t.yaw)+dz*Math.cos(t.yaw);return Math.abs(side)<t.width-1&&Math.abs(along)<t.length/2+1;})||null;}
export function rockContact(x,z,rocks,radius=1.5){return rocks.find(r=>Math.hypot(x-r.x,z-r.z)<r.radius+radius)||null;}
