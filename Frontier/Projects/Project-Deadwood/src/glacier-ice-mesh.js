import * as T from 'three';
import { clamp } from './course.js';
import { GLACIER,glacierY } from './glacier-layout.js';
import { createIceCells,collapseAt,snowCoverage,onFirmIce } from './glacier-field.js';

export function buildIceMesh(parent,state){
 const cells=createIceCells().cells,positions=[],normals=[],indices=[],records=[];
 const push=(x,y,z,nx,ny,nz)=>{positions.push(x,y,z);normals.push(nx,ny,nz);return positions.length/3-1;};
 for(const c of cells){
  const start=positions.length/3,p=c.polygon,n=p.length,top=[],bottom=[];
  for(const v of p)top.push(push(v.x,glacierY(v.z-GLACIER.z),v.z,0,1,0));
  for(const v of p)bottom.push(push(v.x,glacierY(v.z-GLACIER.z)-1.5,v.z,0,-1,0));
  for(let j=1;j<n-1;j++){indices.push(top[0],top[j+1],top[j]);indices.push(bottom[0],bottom[j],bottom[j+1]);}
  for(let j=0;j<n;j++){
   const a=p[j],b=p[(j+1)%n],len=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/len,nz=-(b.x-a.x)/len;
   const q=positions.length/3;
   push(a.x,glacierY(a.z-GLACIER.z),a.z,nx,0,nz);push(b.x,glacierY(b.z-GLACIER.z),b.z,nx,0,nz);
   push(a.x,glacierY(a.z-GLACIER.z)-1.5,a.z,nx,0,nz);push(b.x,glacierY(b.z-GLACIER.z)-1.5,b.z,nx,0,nz);
   indices.push(q,q+1,q+2,q+1,q+3,q+2);
  }
  records.push({...c,start,count:positions.length/3-start,drop:NaN});
 }
 const geometry=new T.BufferGeometry(),base=new Float32Array(positions);
 geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(base),3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.BufferAttribute(new Float32Array(positions.length),3));geometry.setIndex(indices);geometry.computeBoundingSphere();
 const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.12,flatShading:true}));mesh.name='VoronoiIce_IndependentFracturePlates';mesh.receiveShadow=true;mesh.frustumCulled=false;parent.add(mesh);
 const crackGeo=new T.BufferGeometry();crackGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(20000*6),3).setUsage(T.DynamicDrawUsage));crackGeo.setDrawRange(0,0);
 const cracks=new T.LineSegments(crackGeo,new T.LineBasicMaterial({color:0xc7dce2,transparent:true,opacity:.8,depthWrite:false}));cracks.name='ContactStrain_BranchingFractures';cracks.frustumCulled=false;parent.add(cracks);
 const field={mesh,geometry,base,records,cracks,seed:null};refreshIceColors(field,state);return field;
}
export function refreshIceColors(g,state){
 if(g.seed===state.seed)return;g.seed=state.seed;
 const colors=g.geometry.attributes.color.array,cache=new Map(),base=g.base,black=new T.Color(0x3d5966),blue=new T.Color(0x8faab5),snow=new T.Color(0xe2e8e8);
 for(const c of g.records){
  c.drop=NaN;
  for(let v=c.start;v<c.start+c.count;v++){
   const k=v*3,x=base[k],z=base[k+2],key=`${x.toFixed(3)},${z.toFixed(3)}`;let color=cache.get(key);
   if(!color){const white=snowCoverage(x,z,state.field),firm=z<GLACIER.z+85||z>GLACIER.z+1940||onFirmIce(x,z,state.field);color=(firm?blue:black).clone().lerp(snow,white).multiplyScalar(.96+Math.sin(x*.7+z*.3)*.035);cache.set(key,color);}
   const shade=v-c.start<c.polygon.length?1:.77;colors[k]=color.r*shade;colors[k+1]=color.g*shade;colors[k+2]=color.b*shade;
  }
 }g.geometry.attributes.color.needsUpdate=true;
}
export function updateIceMesh(g,state,car){
 refreshIceColors(g,state);const positionAttribute=g.geometry.attributes.position;positionAttribute.clearUpdateRanges();const positions=positionAttribute.array;let changed=false,changedCells=0;
 for(const c of g.records){
  const front=collapseAt(c.x,state),distance=front-c.s,broken=state.broken.has(c.id);
  const drop=!c.active||state.field.voidCells.has(c.id)?65:broken?Math.min(40,8+state.failureAge*22):distance>0?Math.min(48,Math.pow(distance/13,1.3)*4):0;
  if(Math.abs(drop-c.drop)<.001)continue;c.drop=drop;changed=true;changedCells++;positionAttribute.addUpdateRange(c.start*3,c.count*3);
  const angle=drop>0&&drop<50?Math.min(.9,drop*.045)*Math.sin(c.phase):0,cos=Math.cos(angle),sin=Math.sin(angle),cy=glacierY(c.s);
  for(let v=c.start;v<c.start+c.count;v++){
   const k=v*3,dx=g.base[k]-c.x,dy=g.base[k+1]-cy;
   positions[k]=c.x+dx*cos-dy*sin;positions[k+1]=cy+dx*sin+dy*cos-drop;positions[k+2]=g.base[k+2];
  }
 }if(changed){if(changedCells>1000)positionAttribute.clearUpdateRanges();positionAttribute.needsUpdate=true;}
 const line=g.cracks.geometry.attributes.position.array;let n=0;
 const segment=(a,b,t=1)=>{if(n>=20000)return;const k=n++*6;line[k]=a.x;line[k+1]=glacierY(a.z-GLACIER.z)+.065;line[k+2]=a.z;line[k+3]=a.x+(b.x-a.x)*t;line[k+4]=glacierY((a.z+(b.z-a.z)*t)-GLACIER.z)+.065;line[k+5]=a.z+(b.z-a.z)*t;};
 for(const c of g.records){
  if(c.drop>1||Math.abs(c.z-car.z)>230)continue;
  const f=state.fractures.get(c.id),p=c.polygon;
  if(f){
   for(let j=0;j<p.length;j++){const reveal=clamp(f.damage*2-j*.19,0,1);if(reveal>0)segment(p[j],p[(j+1)%p.length],reveal);}
   const a=p[0],b=p[Math.floor(p.length/2)],mid={x:a.x*.38+b.x*.62+Math.sin(c.phase)*2,z:a.z*.38+b.z*.62};
   segment(a,mid,clamp(f.damage*1.7,0,1));if(f.damage>.4)segment(mid,p[p.length-2],clamp((f.damage-.4)*2,0,1));
  }else if(c.id%13===0){
   const a=p[0],b=p[2];segment(a,{x:a.x*.35+b.x*.65,z:a.z*.35+b.z*.65},.65);
  }
 }
 g.cracks.geometry.setDrawRange(0,n*2);const attribute=g.cracks.geometry.attributes.position;attribute.clearUpdateRanges();if(n){attribute.addUpdateRange(0,n*6);attribute.needsUpdate=true;}
}
