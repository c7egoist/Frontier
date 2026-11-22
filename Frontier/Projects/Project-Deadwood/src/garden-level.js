import {rng} from './level.js';
export const CELL=22,COLS=9,ROWS=11,GARDEN_SPEED=21;
export const organicPoint=(x,z)=>({x:x+3.6*Math.sin(z/27)+1.8*Math.sin(x/40+z/23),z:z+2.8*Math.sin(x/27)+1.4*Math.sin(z/43)});
const gridPoint=(c,r)=>({x:(c-(COLS-1)/2)*CELL,z:r*CELL});
export const cellPoint=(c,r)=>{const p=gridPoint(c,r);return organicPoint(p.x,p.z);};
export function cellAt(x,z){let result={c:0,r:0},distance=Infinity;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const p=cellPoint(c,r),d=(p.x-x)**2+(p.z-z)**2;if(d<distance){distance=d;result={c,r};}}return result;}
const dirs=[{dc:0,dr:1,bit:1,opp:4},{dc:1,dr:0,bit:2,opp:8},{dc:0,dr:-1,bit:4,opp:1},{dc:-1,dr:0,bit:8,opp:2}];
export function buildMaze(seed=641){const random=rng(seed),cells=Array.from({length:ROWS},()=>Array(COLS).fill(0)),visited=new Set(['4,0']),stack=[[4,0]];while(stack.length){const [c,r]=stack.at(-1),options=dirs.filter(d=>c+d.dc>=0&&c+d.dc<COLS&&r+d.dr>=0&&r+d.dr<ROWS&&!visited.has(`${c+d.dc},${r+d.dr}`));if(!options.length){stack.pop();continue;}const d=options[Math.floor(random()*options.length)];cells[r][c]|=d.bit;cells[r+d.dr][c+d.dc]|=d.opp;visited.add(`${c+d.dc},${r+d.dr}`);stack.push([c+d.dc,r+d.dr]);}
 // A handful of loops allow genuine alternate choices, not one long corridor.
 for(let i=0;i<10;i++){const c=Math.floor(random()*(COLS-1)),r=1+Math.floor(random()*(ROWS-2));cells[r][c]|=2;cells[r][c+1]|=8;}
 return{cells,start:{c:4,r:0},goal:{c:4,r:ROWS-1},seed};}
export function mazePath(maze,start=maze.start,goal=maze.goal){const q=[start],previous=new Map([[`${start.c},${start.r}`,null]]);for(let i=0;i<q.length;i++){const p=q[i];if(p.c===goal.c&&p.r===goal.r)break;for(const d of dirs){if(!(maze.cells[p.r][p.c]&d.bit))continue;const n={c:p.c+d.dc,r:p.r+d.dr},key=`${n.c},${n.r}`;if(!previous.has(key)){previous.set(key,p);q.push(n);}}}let p=goal,path=[];while(p){path.push(p);p=previous.get(`${p.c},${p.r}`);}return path.reverse();}
export function mazeWalls(maze){const walls=[];function add(x,z,w,d){const horizontal=w>d,points=[];for(let i=0;i<=8;i++){const t=i/8-.5;points.push(organicPoint(x+(horizontal?t*CELL:0),z+(horizontal?0:t*CELL)));}const mid=points[4];walls.push({x:mid.x,z:mid.z,w,d,points,radius:1.9});}
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const p=gridPoint(c,r);if(!(maze.cells[r][c]&1))add(p.x,p.z+CELL/2,CELL,3.8);if(!(maze.cells[r][c]&2))add(p.x+CELL/2,p.z,3.8,CELL);if(r===0)add(p.x,-CELL/2,CELL,3.8);if(c===0)add(p.x-CELL/2,p.z,3.8,CELL);}return walls;}
export function segmentDistance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);}
export function wallContact(x,z,walls,radius=1.5){return walls.some(w=>w.points?w.points.some((p,i)=>i>0&&segmentDistance(x,z,w.points[i-1],p)<w.radius+radius):Math.abs(x-w.x)<w.w/2+radius&&Math.abs(z-w.z)<w.d/2+radius);}
export function moveInMaze(x,z,dx,dz,walls,radius=1.5){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.7));let hit=false;for(let i=0;i<steps;i++){if(!wallContact(x+dx/steps,z,walls,radius))x+=dx/steps;else hit=true;if(!wallContact(x,z+dz/steps,walls,radius))z+=dz/steps;else hit=true;}return{x,z,hit};}
export function gardenLayout(maze,seed=maze.seed+23){const random=rng(seed),path=mazePath(maze),safeStart=3,plants=[];for(let r=1;r<ROWS;r++)for(let c=0;c<COLS;c++){if(c===maze.goal.c&&r===maze.goal.r)continue;if(random()>.43)continue;const p=cellPoint(c,r),side=random()<.5?-1:1;plants.push({x:p.x+side*(3+random()*1.5),z:p.z+(random()-.5)*5,buried:random()<.82,phase:random()*5,heading:random()*Math.PI*2});}
 // Ensure the first junction previews one surface trap and one eruption.
 const previews=path.slice(safeStart,safeStart+2);previews.forEach((p,i)=>{const v=cellPoint(p.c,p.r);for(let j=plants.length-1;j>=0;j--)if(Math.hypot(plants[j].x-v.x,plants[j].z-v.z)<12)plants.splice(j,1);plants.push({x:v.x+(i?4:-4),z:v.z,buried:!!i,phase:0,heading:.4});});
 // One visible mouth and one buried trap teach the two behaviors immediately after entry.
 for(const preview of [{x:7,z:12,buried:false},{x:-6,z:29,buried:true}]){for(let i=plants.length-1;i>=0;i--)if(Math.hypot(plants[i].x-preview.x,plants[i].z-preview.z)<10)plants.splice(i,1);plants.push({...preview,phase:0,heading:preview.buried?-.25:.3});}
 // Concealed paired hunters cover turning pockets as well as open straights.
 for(let i=4;i<path.length-2;i+=3){const node=path[i],v=cellPoint(node.c,node.r);for(const side of [-1,1]){if(plants.some(p=>Math.hypot(p.x-(v.x+side*5.5),p.z-(v.z+side*3))<5))continue;plants.push({x:v.x+side*5.5,z:v.z+side*3,buried:true,phase:random()*4,heading:random()*6.28});}}
 const banks=mazeWalls(maze);for(const p of plants){if(!wallContact(p.x,p.z,banks,1.2))continue;const c=Math.max(0,Math.min(COLS-1,Math.round(p.x/CELL+(COLS-1)/2))),r=Math.max(0,Math.min(ROWS-1,Math.round(p.z/CELL))),v=cellPoint(c,r);p.x=v.x;p.z=v.z;for(let attempt=0;attempt<20;attempt++){const x=v.x+(random()-.5)*12,z=v.z+(random()-.5)*12;if(!wallContact(x,z,banks,1.2)){p.x=x;p.z=z;break;}}}
 const flowers=path.filter((_,i)=>i>3&&i%6===0).slice(0,6).map((p,i)=>({...cellPoint(p.c,p.r),offset:i%2?6:-6}));return{plants,flowers,path};}
// Hidden until disturbed; a readable wind-up, followed by a quick committed snap.
export function trapPose(age,buried){
 if(age<0)return{phase:'idle',rise:buried?0:1,jaw:.12,danger:false};
 if(age<.78)return{phase:'warning',rise:buried?0:1,jaw:.05,danger:false};
 if(age<1.04)return{phase:'eruption',rise:buried?(age-.78)/.26:1,jaw:.02,danger:false};
 if(age<1.17)return{phase:'open',rise:1,jaw:.02,danger:false};
 if(age<1.42)return{phase:'snap',rise:1,jaw:.02+(age-1.17)/.25*1.39,danger:age>=1.25};
 if(age<1.92)return{phase:'closed',rise:1,jaw:1.41,danger:true};
 return{phase:'recover',rise:buried?Math.max(0,1-(age-1.92)/.88):1,jaw:Math.max(.1,1.41-(age-1.92)*1.7),danger:false};
}
export function trapCaptures(plant,age,x,z){const mouth=plant.mouth||plant;return trapPose(age,plant.buried).danger&&Math.hypot(x-mouth.x,z-mouth.z)<3.1;}
