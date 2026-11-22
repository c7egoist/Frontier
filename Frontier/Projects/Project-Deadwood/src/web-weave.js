// Decorative geometry only: changing a weave never changes adhesion or tyre grip.
import {rng} from './level.js';
import {knotRadius} from './web-level.js';
export function knotWeave(n){const random=rng((n.id+1)*19391+Math.floor(n.weavePhase*1000)),segments=[],outline=[];
 const rim=a=>{const r=knotRadius(n,a);return{x:Math.cos(a)*r,z:Math.sin(a)*r};};
 const line=(a,b)=>segments.push(a.x,.07,a.z,b.x,.07,b.z);
 for(let i=0;i<96;i++){const p=rim(i/96*Math.PI*2);outline.push(p);line(p,rim((i+1)/96*Math.PI*2));}
 if(n.weave==='spiral'){
  for(let i=0;i<17;i++){const a=i/17*Math.PI*2+(random()-.5)*.15;line({x:0,z:0},rim(a));}
  let last={x:0,z:0};for(let i=1;i<=440;i++){const a=i/440*Math.PI*14,r=knotRadius(n,a)*(i/440)*.95,p={x:Math.cos(a)*r,z:Math.sin(a)*r};line(last,p);last=p;}
 }else if(n.weave==='fan'){
  const centre={x:-n.radius*.37,z:n.radius*.16};let last=null;
  for(let band=1;band<=8;band++){last=null;for(let i=0;i<=40;i++){const a=n.weavePhase+i/40*Math.PI*2,p=rim(a),q={x:centre.x+(p.x-centre.x)*band/8,z:centre.z+(p.z-centre.z)*band/8};if(last)line(last,q);last=q;}}
  for(let i=0;i<19;i++)line(centre,rim(i/19*Math.PI*2));
 }else{
  const rings=[];for(let band=1;band<=7;band++){const ring=[];for(let i=0;i<21;i++){const a=i/21*Math.PI*2+(random()-.5)*.16,r=knotRadius(n,a)*band/7*(.92+random()*.12);ring.push({x:Math.cos(a)*r,z:Math.sin(a)*r});}rings.push(ring);for(let i=0;i<21;i++)line(ring[i],ring[(i+1)%21]);}
  for(let band=0;band<6;band++)for(let i=0;i<21;i++){line(rings[band][i],rings[band+1][i]);if(i%3===0)line(rings[band][i],rings[band+1][(i+1)%21]);}
 }
 return{outline,segments};}
