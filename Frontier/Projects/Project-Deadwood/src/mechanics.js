// Gameplay rules shared by rendering and tests. Seconds/metres, no Three.js dependency.
import {center,branchLength,branchPoint,branchRadius,treePoint,treeSegments} from './level.js';
export const RIDGES=[{z:155,offset:-3,width:6,length:12},{z:451,offset:4,width:7,length:14},{z:772,offset:-4,width:6,length:13},{z:1060,offset:2,width:7,length:15}];
export const MUD=[{z:112,offset:5,rx:6,rz:17},{z:393,offset:-5,rx:7,rz:22},{z:818,offset:4,rx:7,rz:19},{z:1025,offset:-6,rx:5,rz:18}];
export const GRIP_ROOTS=[{z:345,offset:-3},{z:864,offset:4}];
export function exposedRootAt(x,z){return GRIP_ROOTS.some(site=>{const dx=x-center(site.z)-site.offset;return Math.abs(dx)<8&&[0,1.5,3].some(shift=>Math.abs(z-site.z-shift-Math.sin(dx*.55)*1.2)<.55);});}
export const ARCHES=[{z:205,offset:0},{z:711,offset:-1},{z:1133,offset:1}];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function ridgeHeight(site,age,x,z){const dx=(x-center(site.z)-site.offset)/site.width,dz=(z-site.z)/site.length;return Math.max(0,1-dx*dx)**2*Math.max(0,1-dz*dz)**2*clamp((age-1.2)/3)*1.65;}
export function surfaceAt(ridges,x,z){let height=0;for(const r of ridges)height+=ridgeHeight(r,r.age,x,z);return height;}
export function mudAt(x,z){return MUD.some(m=>((x-center(m.z)-m.offset)/m.rx)**2+((z-m.z)/m.rz)**2<1);}
export function archShape(age){const grow=clamp(age/2),close=clamp((age-6)/8);return{width:(8.5-6.2*close)*grow,height:(6-3.9*close)*grow,radius:(.38+close*.85)*grow,close};}
export function archPoint(site,age,t){const s=archShape(age),a=t*Math.PI;return{x:center(site.z)+site.offset+Math.cos(a)*s.width,y:Math.sin(a)*s.height-.3,z:site.z+Math.sin(a*2)*1.2};}
export function hitsArch(site,age,x,z){const s=archShape(age);if(age<.4)return false;for(let i=0;i<=60;i++){const p=archPoint(site,age,i/60);if(p.y+s.radius>0&&p.y-s.radius<2.1&&Math.hypot(x-p.x,z-p.z)<1.25+s.radius)return true;}return false;}
export function pursuitStep(front,playerZ,dt){return Math.max(playerZ-105,front+12*dt);}
export function breakBranch(root,index){const broken=new Set([index]);let changed=true;while(changed){changed=false;root.branches.forEach((b,i)=>{if(!b.broken&&broken.has(b.parent)&&!broken.has(i)){broken.add(i);changed=true;}});}for(const i of broken)root.branches[i].broken=true;return broken;}
export function rootContact(x,z,root,speed,baseHeight=0){for(let index=0;index<root.branches.length;index++){const b=root.branches[index];if(b.broken)continue;const length=branchLength(b,root.age);for(let s=0;s<=length&&length>0;s+=.55){const p=branchPoint(b,s),r=branchRadius(b,root.age,s);if(p.y+r>baseHeight&&p.y-r<baseHeight+2.1&&Math.hypot(p.x-x,p.z-z)<1.25+r){return{index,p,r,kind:b.depth>0&&r<.3&&branchRadius(b,root.age,0)<.38?(speed>6?'break':'brush'):'solid'};}}}return null;}
export function timberContact(x,z,tree,age,speed,baseHeight=0){const segments=treeSegments(tree);for(let index=0;index<segments.length;index++){if(tree.brokenSegments?.has(index))continue;const seg=segments[index],a=treePoint(tree,seg.a,age),b=treePoint(tree,seg.b,age),count=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.5);for(let i=0;i<=count;i++){const t=i/count,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};if(p.y-seg.radius<baseHeight+2.1&&p.y+seg.radius>baseHeight&&Math.hypot(x-p.x,z-p.z)<1.25+seg.radius)return{index,p,kind:index>0&&speed>6?'break':'solid'};}}return null;}
// First trunk lands against an adjacent trunk; the latter falls lengthwise out of the detour.
export const REACTION_DELAY=3.5;
export function reactionStage(rootAge,treeAge){return rootAge<1.8?'uprooting':treeAge<REACTION_DELAY?'first-fall':'second-fall';}
