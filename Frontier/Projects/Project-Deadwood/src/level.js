// Distances in metres. Root graphs are independent of rendering and frame rate.
export const LENGTH=1200, MAX_SPEED=33;
export const PORTAL_EXIT={x:180,z:1430};
export const center=z=>13*Math.sin(z/145)+6*Math.sin(z/64);
export function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
const normalize=v=>{const d=Math.hypot(v.x,v.y,v.z);return{x:v.x/d,y:v.y/d,z:v.z/d};};
export function branchLength(branch,age){return Math.max(0,age-branch.birth)*branch.speed;}
export function branchRadius(branch,age,s=0){const length=branchLength(branch,age);if(length<=0)return 0;const localAge=Math.max(0,age-branch.birth-s/branch.speed);return (branch.radius+Math.sqrt(localAge)*branch.thicken)*Math.min(1,(length-s)/1.5+.035);}
// Persistent material-space curve: growing tips reveal NEW curve instead of stretching old geometry.
export function branchPoint(b,s){
 const bend=s*s/(s+5),arch=b.shape==='arch',hook=b.shape==='hook';
 // Curvature is in material space: arches descend again, hooks turn back on themselves.
 const radius=b.bendRadius||9,angle=s/radius;
 const forward=hook?Math.sin(angle)*radius:s;
 const rise=arch?Math.sin(s/(b.archSpan||20)*Math.PI)*(b.archHeight||6):hook?(1-Math.cos(angle))*radius*.65:0;
 return{x:b.origin.x+b.direction.x*forward+Math.sin(s*b.frequency+b.phase)*bend*b.curl,
 y:Math.max(-.65,b.origin.y+b.direction.y*s*(arch||hook?.24:1)+Math.sin(s*b.frequency*.8)*bend*b.lift+rise),
 z:b.origin.z+b.direction.z*forward+(Math.cos(s*b.frequency+b.phase)-Math.cos(b.phase))*bend*b.curl};
}
export function createRoot(random,x,z,options={}){
 const warning=.55+random()*.9, branches=[];
 function add(origin,direction,birth,depth,radius){
  const b={origin,direction:normalize(direction),birth,depth,radius,speed:1.6+random()*3.8,thicken:.075+random()*.13,frequency:.13+random()*.38,phase:random()*Math.PI*2,curl:.16+random()*.65,lift:(random()-.35)*.55,shape:random()<.48?'arch':random()<.6?'hook':'twist',archSpan:12+random()*18,archHeight:4+random()*6,bendRadius:5+random()*8,parent:-1,attach:0};
  if(depth===0&&options.uproot)Object.assign(b,{direction:{x:.12,y:1,z:.08},shape:'twist',curl:.12,lift:.2});
  const index=branches.push(b)-1;
  if(depth<2){const count=depth===0?2+Math.floor(random()*3):1+Math.floor(random()*2);for(let i=0;i<count;i++){
   const attach=1.5+random()*(depth===0?7:4),p=branchPoint(b,attach),angle=random()*Math.PI*2;
   const childIndex=branches.length;
   add(p,{x:Math.cos(angle),y:random()<.45?.03+random()*.25:.35+random()*1.3,z:Math.sin(angle)},birth+attach/b.speed,depth+1,radius*(.45+random()*.25));
   branches[childIndex].parent=index;branches[childIndex].attach=attach;
  }}return b;
 }
 const angle=random()*Math.PI*2,vertical=random()<.38;
 add({x,y:-.65,z},{x:Math.cos(angle)*(vertical?.25:1),y:vertical?1.2+random():.08+random()*.65,z:Math.sin(angle)*(vertical?.25:1)},warning,0,.14+random()*.38);
 return{x,z,warning,branches,age:0};
}
// Denser, irregular pressure. Distance leads include growth time, not just the soil warning.
export const ROOT_PRESSURE={maxActive:96,retireBehind:60,firstEvent:.1,treeClearance:40,minLead:84,speedLead:1.25,leadSpread:70,clusterSpread:14};
export function nextSpawn(random){return Math.min(1.8,.14-Math.log(Math.max(.000001,1-random()))*(.12+random()*.36));}
export function spawnCluster(random,playerZ,speed=MAX_SPEED){
 const count=random()<.2?1:2+Math.floor(random()*4),out=[],near=ROOT_PRESSURE.minLead+Math.max(0,Math.min(MAX_SPEED,speed))*ROOT_PRESSURE.speedLead,lo=Math.max(45,playerZ+near-ROOT_PRESSURE.clusterSpread),hi=Math.min(LENGTH-24,playerZ+near+ROOT_PRESSURE.leadSpread+ROOT_PRESSURE.clusterSpread);
 if(lo>hi)return out;
 const baseZ=Math.max(lo,Math.min(hi,playerZ+near+random()*ROOT_PRESSURE.leadSpread));
 for(let i=0;i<count;i++){
  let z=Math.max(lo,Math.min(hi,baseZ+(random()-.5)*ROOT_PRESSURE.clusterSpread*2));
  // Retry inside the lookahead band instead of silently dropping most eruptions at tree sites.
  for(let attempt=0;attempt<12&&TREE_SITES.some(t=>Math.abs(t.z-z)<ROOT_PRESSURE.treeClearance);attempt++)z=lo+random()*(hi-lo);
  if(TREE_SITES.some(t=>Math.abs(t.z-z)<ROOT_PRESSURE.treeClearance))continue;
  out.push(createRoot(random,center(z)+(random()-.5)*36,z));
 }
 return out;
}
export function hitsRoot(x,z,root){for(const b of root.branches){if(b.broken)continue;const length=branchLength(b,root.age);if(length<=0)continue;for(let s=0;s<=length;s+=.65){const p=branchPoint(b,s),r=branchRadius(b,root.age,s);if(p.y+r>0&&p.y-r<2.1&&Math.hypot(p.x-x,p.z-z)<1.25+r)return true;}}return false;}

// Deliberate tree set pieces have real escape routes, independent of random roots.
export const TREE_SITES=[{z:272,side:1,kind:'block',length:37},{z:603,side:-1,kind:'under',length:39},{z:938,side:-1,kind:'block',length:38}];
export function bypassOffset(site,z){const t=(z-(site.z-85))/170;return t<=0||t>=1?0:site.side*27*Math.sin(Math.PI*t)**.85;}
export function driveIntervals(z){const c=center(z),intervals=[[c-13.6,c+13.6]];for(const site of TREE_SITES){if(Math.abs(site.z-z)<85){const x=c+bypassOffset(site,z);intervals.push([x-5.8,x+5.8]);}}return intervals;}
export function clampDriveX(x,z){const intervals=driveIntervals(z);if(intervals.some(([a,b])=>x>=a&&x<=b))return x;let closest=Infinity,result=x;for(const [a,b] of intervals)for(const edge of [a,b])if(Math.abs(edge-x)<closest){closest=Math.abs(edge-x);result=edge;}return result;}
export function treeAngle(site,age){const t=Math.max(0,Math.min(1,(age-1.15)/2.5));return (site.kind==='under'?1.36:Math.PI/2)*t*t;}
export function treePoint(site,p,age){const angle=treeAngle(site,age),c=Math.cos(angle),s=Math.sin(angle);return{x:center(site.z)+site.side*18+p.x*c-site.side*p.y*s,y:.85+site.side*p.x*s+p.y*c,z:site.z+p.z};}
export function treeSegments(site){return [{a:{x:0,y:0,z:0},b:{x:0,y:site.length,z:0},radius:1.05},...[.48,.67,.82].map((t,i)=>({a:{x:0,y:site.length*t,z:0},b:{x:(i%2?1:-1)*4,y:site.length*t+4,z:(i%2?1:-1)*3},radius:.28})),...(site.secondary?[{a:{x:0,y:1.4,z:0},b:{x:-site.side*10,y:1.5,z:0},radius:.5}]:[])];}
export function hitsTree(x,z,site,age){for(const seg of treeSegments(site)){const a=treePoint(site,seg.a,age),b=treePoint(site,seg.b,age),n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.5);for(let i=0;i<=n;i++){const t=i/n,px=a.x+(b.x-a.x)*t,py=a.y+(b.y-a.y)*t,pz=a.z+(b.z-a.z)*t;if(py-seg.radius<2.1&&py+seg.radius>0&&Math.hypot(x-px,z-pz)<1.25+seg.radius)return true;}}return false;}
