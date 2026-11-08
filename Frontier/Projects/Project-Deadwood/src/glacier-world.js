import * as T from 'three';
import { rng } from './course.js';
import { GLACIER,glacierCentre,glacierY,glacierHalfWidth,createShips,createGlacierState,cellAt,collapseAt } from './glacier.js';
import { buildIceMesh,updateIceMesh } from './glacier-ice-mesh.js';
const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.7,flatShading:true,...extra});
const ice=mat(0x9eb8bf,{roughness:.38,metalness:.08}),snow=mat(0xe1e7e7,{roughness:1}),darkIce=mat(0x50676d,{roughness:.22,metalness:.18}),wood=mat(0x514d45,{roughness:1}),timber=mat(0x767268,{roughness:1}),canvas=mat(0xc6c3b5,{side:T.DoubleSide,roughness:1});
const boxGeo=new T.BoxGeometry(1,1,1),crystalGeo=new T.ConeGeometry(1,1,5),sphere=new T.IcosahedronGeometry(1,0);
function mesh(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,material,x,y,z,w,h,d){return mesh(parent,boxGeo,material,x,y,z,w,h,d);}
function beam(parent,a,b,radius,material=timber){
  const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av),m=mesh(parent,new T.CylinderGeometry(radius,radius,1,7),material,0,0,0);
  m.position.copy(av.add(bv).multiplyScalar(.5));m.scale.y=delta.length();m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;
}
function hullGeometry(length,width){
  const positions=[],indices=[],steps=16;
  for(let j=0;j<=steps;j++){
    const u=j/steps,z=(u-.5)*length,shape=Math.pow(Math.sin(u*Math.PI),.6);
    for(const [side,height] of [[-1,4.5],[-.88,.6],[-.45,-4],[.45,-4],[.88,.6],[1,4.5]])positions.push(side*width*shape,height,z);
    if(j<steps)for(let k=0;k<5;k++){const a=j*6+k,b=a+6;indices.push(a,a+1,b,a+1,b+1,b);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function sail(parent,mastY,yardWidth,z,offset=0){
  const pos=[],idx=[],n=8,m=5;
  for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
    const x=(i/n-.5)*yardWidth,y=mastY-j/m*10,bulge=Math.sin(i/n*Math.PI)*Math.sin(j/m*Math.PI)*2;
    pos.push(x+offset,y,z+bulge);
    if(i<n&&j<m){const a=i*(m+1)+j,b=a+m+1;idx.push(a,b,a+1,a+1,b,b+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return mesh(parent,g,canvas,0,0,0);
}
function buildShip(parent,spec){
  const g=new T.Group();g.name=`FrozenSailingShip_${spec.id}`;g.position.set(spec.x,glacierY(spec.s)+.4,spec.z);g.rotation.set(spec.tilt,spec.yaw,spec.tilt*.5);parent.add(g);
  const hull=mesh(g,hullGeometry(spec.length,spec.width),wood,0,0,0);hull.material.side=T.DoubleSide;
  // Exposed rib-work, deck, high bows and stern make this a sailing hull, not a grey box.
  box(g,timber,0,2.5,0,spec.width*1.4,.6,spec.length*.7);
  box(g,wood,0,5,-spec.length*.29,spec.width*1.45,5,spec.length*.15);
  box(g,snow,0,7.6,-spec.length*.29,spec.width*1.5,.3,spec.length*.16);
  for(let i=1;i<11;i++){
    const z=(i/12-.5)*spec.length,shape=Math.pow(Math.sin(i/12*Math.PI),.6);
    for(const side of [-1,1])beam(g,[side*spec.width*.87*shape,.2,z],[side*spec.width*shape,4.8,z],.19,timber);
  }
  const ropes=[];
  for(const [index,z] of [-spec.length*.22,spec.length*.08,spec.length*.3].entries()){
    const height=34-index*5+(spec.id%2)*4;
    beam(g,[0,2,z],[0,height,z],.36,wood);
    for(const h of [height-2,height-12]){
      const width=spec.width*(h===height-2?2.3:2.8);beam(g,[-width/2,h,z],[width/2,h,z],.22,wood);
      if(!(spec.id===4&&index===0))sail(g,h-.3,width,z,.4);
      for(const side of [-1,1])ropes.push(new T.Vector3(side*spec.width*.85,3,z-7),new T.Vector3(side*width*.5,h,z));
    }
    for(const side of [-1,1])ropes.push(new T.Vector3(side*spec.width*.75,3,z-10),new T.Vector3(0,height,z));
  }
  beam(g,[0,3,spec.length*.34],[0,10,spec.length*.65],.3,wood);
  const rigging=new T.LineSegments(new T.BufferGeometry().setFromPoints(ropes),new T.LineBasicMaterial({color:0x797b72}));g.add(rigging);
  for(let i=0;i<8;i++){const a=i*.78;mesh(g,crystalGeo,ice,Math.sin(a)*spec.width*.7,3.8,Math.cos(a)*spec.length*.3,.3,2.5,.3).rotation.z=Math.PI;}
  return g;
}
function caveSection(parent,start,end,open=false){
  const points=[],idx=[],steps=Math.ceil((end-start)/14),sides=18;
  for(let i=0;i<=steps;i++){
    const s=start+(end-start)*i/steps,width=glacierHalfWidth(s)+4,base=glacierY(s),height=30+Math.sin(s/72)*7;
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI,rough=1+Math.sin(i*1.7+j*2.1)*.055;
      points.push(glacierCentre(s)+Math.cos(a)*width*rough,base-1+Math.sin(a)*height*rough,GLACIER.z+s);
      if(i<steps&&j<sides){const q=i*(sides+1)+j,b=q+sides+1;idx.push(q,q+1,b,q+1,b+1,b);}
    }
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.setIndex(idx);geo.computeVertexNormals();
  const roof=mesh(parent,geo,mat(0x95b2bd,{side:T.DoubleSide,roughness:.7}),0,0,0);roof.name=`GlacierCaveVault_${start}`;
  return roof;
}
function gate(parent,x,z,y=0){
  const g=new T.Group();g.name='GlacierExitPortal';g.position.set(x,y,z);parent.add(g);
  for(const side of [-1,1]){const m=box(g,ice,side*13,9,0,5,18,7);m.rotation.z=side*.09;mesh(g,crystalGeo,snow,side*15,8,2,4,20,4);}
  box(g,snow,0,18,0,30,4,8);
  const plane=mesh(g,new T.PlaneGeometry(20,14),new T.MeshBasicMaterial({color:0xd2dcdf,side:T.DoubleSide}),0,7.1,0);return {g,plane};
}
export function buildGlacier(scene){
 const group=new T.Group();group.name='Scene03_Icebound_ShatteredFields';scene.add(group);
 const random=rng(77103),ships=createShips(),state=createGlacierState();
 box(group,mat(0x243d4a,{roughness:.24,metalness:.18}),GLACIER.x,-7,GLACIER.z+1000,440,1,2160);
 const iceField=buildIceMesh(group,state);
 const roofs=new T.Group();roofs.name='CaveRoofs_InspectionCutaway';group.add(roofs);caveSection(roofs,-28,775);caveSection(roofs,1670,2030);
 const bergs=[];
 for(let s=-20;s<2050;s+=27)for(const side of [-1,1]){
  const x=glacierCentre(s)+side*(glacierHalfWidth(s)+12+random()*9),h=20+random()*37;
  bergs.push({x,y:glacierY(s)+h*.4,z:GLACIER.z+s,h,w:12+random()*13,angle:random()*6.28});
 }
 const bergMesh=new T.InstancedMesh(sphere,ice,bergs.length),dummy=new T.Object3D();bergs.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.scale.set(b.w,b.h*.65,20);dummy.rotation.set(.1,b.angle,.1);dummy.updateMatrix();bergMesh.setMatrixAt(i,dummy.matrix);});bergMesh.castShadow=true;bergMesh.receiveShadow=true;group.add(bergMesh);
 const shipVisuals=ships.map(s=>buildShip(group,s));
 const ridgeMesh=new T.InstancedMesh(sphere,ice,192);ridgeMesh.name='PressureRidges_BranchingPassages';ridgeMesh.castShadow=true;ridgeMesh.receiveShadow=true;ridgeMesh.frustumCulled=false;group.add(ridgeMesh);
 const avalancheVisuals=state.avalanches.map(a=>{
  const plug=mesh(group,sphere,ice,a.x,glacierY(a.s)+10,a.z,a.width*.58,16,a.depth*.55);plug.name=`AvalanchePlug_${a.id}`;
  const chunks=[];for(let i=0;i<28;i++)chunks.push(mesh(group,sphere,ice,a.x+(random()-.5)*a.width,glacierY(a.s)+18+random()*8,a.z+(random()-.5)*a.depth,2+random()*4,3+random()*5,3+random()*4));
  chunks.forEach(m=>{m.userData.origin=m.position.clone();m.visible=false;});return {plug,chunks};
 });
 const crystalMesh=new T.InstancedMesh(crystalGeo,ice,state.crystals.length);crystalMesh.name='RandomCrystalShowers_FallingIce';crystalMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);crystalMesh.castShadow=true;crystalMesh.frustumCulled=false;group.add(crystalMesh);
 const shadowGeometry=new T.CircleGeometry(1,18);shadowGeometry.rotateX(-Math.PI/2);
 const crystalShadows=new T.InstancedMesh(shadowGeometry,new T.MeshBasicMaterial({color:0x1c303b,transparent:true,opacity:.42,depthWrite:false}),state.crystals.length);crystalShadows.frustumCulled=false;crystalShadows.instanceMatrix.setUsage(T.DynamicDrawUsage);group.add(crystalShadows);
 const shards=new T.InstancedMesh(sphere,snow,640);shards.frustumCulled=false;shards.instanceMatrix.setUsage(T.DynamicDrawUsage);group.add(shards);
 gate(group,glacierCentre(0),GLACIER.z-35,glacierY(0));const exit=gate(group,glacierCentre(2000),GLACIER.z+2000,glacierY(2000));
 const guide=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xc9d4d5,depthTest:false,transparent:true,opacity:.5}));guide.name='GripIslands_InspectorOnly';guide.visible=false;group.add(guide);
 // Former landing geometry is replaced by the Scene 04 scrapyard.
 const glacier={group,ships,shipVisuals,state,iceField,roofs,ridgeMesh,avalancheVisuals,crystalMesh,crystalShadows,shards,exit,guide,seed:null};
 updateGlacierVisuals(glacier,{x:glacierCentre(0),z:GLACIER.z},0);return glacier;
}
const dummy=new T.Object3D();
export function updateGlacierVisuals(g,car,time){
 const state=g.state;
 if(g.seed!==state.seed){
  g.seed=state.seed;let n=0;const lines=[];
  for(const p of state.field.ridges)for(let j=0;j<3;j++){
   const dx=(j-1)*p.rx*.4,dz=Math.sin(j*2.3)*p.rz*.1,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
   dummy.position.set(p.x+dx*c+dz*s,glacierY(p.s)+p.height*.3,p.z-dx*s+dz*c);dummy.rotation.set(.1,p.yaw,.1*(j-1));dummy.scale.set(p.rx*.75,p.height*(.58+j*.03),p.rz*.8);dummy.updateMatrix();g.ridgeMesh.setMatrixAt(n++,dummy.matrix);
  }g.ridgeMesh.count=n;g.ridgeMesh.instanceMatrix.needsUpdate=true;
  for(const p of state.field.snow)for(let j=0;j<18;j++){
   for(const a of [j/18*Math.PI*2,(j+1)/18*Math.PI*2]){
    const dx=Math.cos(a)*p.rx,dz=Math.sin(a)*p.rz,c=Math.cos(p.yaw),s=Math.sin(p.yaw);lines.push(p.x+dx*c+dz*s,glacierY(p.s)+.25,p.z-dx*s+dz*c);
   }
  }
  g.guide.geometry.dispose();g.guide.geometry=new T.BufferGeometry();g.guide.geometry.setAttribute('position',new T.Float32BufferAttribute(lines,3));
 }
 updateIceMesh(g.iceField,state,car);
 g.avalancheVisuals.forEach((v,i)=>{
  const a=state.avalanches[i];v.plug.visible=a.state!=='open';v.plug.position.y=glacierY(a.s)+10-(a.state==='falling'?a.age*12:0);v.plug.rotation.z=a.state==='rumbling'?Math.sin(a.age*30)*.02:a.state==='falling'?a.age*.6:0;
  v.chunks.forEach((m,j)=>{m.visible=a.state==='falling';if(m.visible){const t=a.age,p=m.userData.origin;m.position.set(p.x+Math.sin(j*3)*t*8,p.y-t*t*11,p.z+t*9);m.rotation.set(t+j,t*.8,t*.5);}});
 });
 let crystals=0,shadows=0;
 for(const p of state.crystals){
  if(p.state==='inactive')continue;
  const rubble=p.state==='landed'||p.state==='melting',cell=cellAt(p.x,p.z),drop=rubble&&(p.s<collapseAt(p.x,state)||state.broken.has(cell?.id)||state.field.voidCells.has(cell?.id))?22:0;
  dummy.position.set(p.x,p.y-drop,p.z);dummy.rotation.set(p.state==='falling'?Math.sin(p.id)*p.age*.12:0,0,Math.PI+(p.state==='warning'?Math.sin(p.age*28+p.id)*.012:p.state==='landed'?Math.sin(p.id)*.16:0));dummy.scale.set(rubble?p.rubbleRadius:p.radius,p.height*(rubble?.35:1),rubble?p.rubbleRadius:p.radius);dummy.updateMatrix();g.crystalMesh.setMatrixAt(crystals++,dummy.matrix);
  if(p.state==='warning'||p.state==='falling'){
   const size=p.radius*(p.state==='falling'?1.35:.75+Math.min(1,p.age/p.warning)*.6);
   dummy.position.set(p.x,glacierY(p.s)+.08,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(size,1,size);dummy.updateMatrix();g.crystalShadows.setMatrixAt(shadows++,dummy.matrix);
  }
 }
 g.crystalMesh.count=crystals;g.crystalMesh.visible=crystals>0;g.crystalMesh.instanceMatrix.needsUpdate=true;
 g.crystalShadows.count=shadows;g.crystalShadows.visible=shadows>0;g.crystalShadows.instanceMatrix.needsUpdate=true;
 let n=0;
 for(const impact of state.impacts)for(let j=0;j<18&&n<640;j++){
  const a=j*2.399,t=impact.age,spread=(5+(j%4))*t,y=glacierY(impact.z-GLACIER.z)+.5+(5+j%4)*t-9*t*t;if(y<glacierY(impact.z-GLACIER.z)-1)continue;
  dummy.position.set(impact.x+Math.cos(a)*spread,y,impact.z+Math.sin(a)*spread);dummy.rotation.set(t*j,t*2,0);dummy.scale.set(.25+(impact.size||1)*.1,.8,.4);dummy.updateMatrix();g.shards.setMatrixAt(n++,dummy.matrix);
 }
 if(state.started&&state.front>-15&&state.front<GLACIER.length){
  const front=state.front,half=glacierHalfWidth(front),clock=state.time+state.failureAge;
  for(let j=0;j<80&&n<640;j++){
   const age=(clock*1.1+j*.137)%1.25,x=glacierCentre(front)+(j/79-.5)*half*1.9+Math.sin(j*2.4)*age*3,z=GLACIER.z+collapseAt(x,state)-age*22;
   dummy.position.set(x,glacierY(front)+.3+3*age-10*age*age,z);dummy.rotation.set(age*3,j,age*2);dummy.scale.set(.5+(j%3)*.3,.5,.8);dummy.updateMatrix();g.shards.setMatrixAt(n++,dummy.matrix);
  }
 }
 g.shards.count=n;g.shards.visible=n>0;g.shards.instanceMatrix.needsUpdate=true;
}
