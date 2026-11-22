import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rng} from './level.js';
import {SHIPS,mainCenter,baseCenter,halfWidth,shortcutCenter,floePose,shardPose,fracturePose} from './glacier-level.js';
const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
export function createGlacierView(scene,origin={x:4500,z:0}){
 const world=new THREE.Group();world.position.set(origin.x,0,origin.z);scene.add(world);const ice=mat('#9db5bb',.24),snow=mat('#d6dcd7'),rock=mat('#667d86'),wood=mat('#655e50'),deckMat=mat('#8a8170'),canvas=mat('#bcb9a8'),dark=mat('#343e42'),rope=mat('#48483e');const ceilingMat=mat('#91a9b1',.48);ceilingMat.side=THREE.DoubleSide;
 const staticRoot=new THREE.Group();world.add(staticRoot);const cube=new THREE.BoxGeometry(1,1,1),cone=new THREE.ConeGeometry(1,1,6),rockGeo=new THREE.IcosahedronGeometry(1,0);
 function mesh(g,m,parent=staticRoot){const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function box(parent,m,x,y,z,w,h,d){const o=mesh(cube,m,parent);o.position.set(x,y,z);o.scale.set(w,h,d);return o;}
 function beam(parent,a,b,r,m){const dir=new THREE.Vector3().subVectors(b,a),o=mesh(new THREE.CylinderGeometry(r*.7,r,dir.length(),6),m,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());return o;}
 function poly(points,indices,m,parent=staticRoot){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,m,parent);}
 const water=mesh(new THREE.PlaneGeometry(1800,2200),mat('#354c56',.27),world);water.rotation.x=-Math.PI/2;water.position.set(0,-3.8,800);water.castShadow=false;
 const random=rng(831),floes=[],cracks=[];

 function makeFloe(z,shortcut=false){const a=z,b=Math.min(z+8,shortcut?710:1328),fn=shortcut?shortcutCenter:mainCenter,wa=shortcut?7:halfWidth(a),wb=shortcut?7:halfWidth(b),ca=fn(a),cb=fn(b),edgeA=Math.sin(a*.71)*.7,edgeB=Math.sin(b*.71)*.7,group=new THREE.Group();world.add(group);
  const vertices=[[ca-wa+edgeA,0,a],[ca+wa+edgeA,0,a],[cb-wb+edgeB,0,b],[cb+wb+edgeB,0,b],[ca-wa+edgeA,-.95,a],[ca+wa+edgeA,-.95,a],[cb-wb+edgeB,-.95,b],[cb+wb+edgeB,-.95,b]];
  poly(vertices,[0,2,1,1,2,3,0,4,2,2,4,6,1,3,5,3,7,5,0,1,4,1,5,4,2,6,3,3,6,7],ice,group);
  // Joints and hairline cracks belong to the floe so they fall with it.
  const midX=(ca+cb)/2,midZ=(a+b)/2;for(const child of group.children)child.geometry.translate(-midX,0,-midZ);group.position.set(midX,0,midZ);floes.push({z:midZ,group,shortcut});}
 for(let z=0;z<1328;z+=8)makeFloe(z);for(let z=470;z<710;z+=8)makeFloe(z,true);
 function ship(def,decorative=false){const hull=new THREE.Group();hull.position.set(def.x,0,def.z);hull.rotation.set(.015,def.yaw,def.lean);staticRoot.add(hull);const L=def.length,B=def.beam,points=[],idx=[],sections=12;
  for(let i=0;i<=sections;i++){const t=i/sections,z=(t-.5)*L,width=Math.max(.4,Math.sin(t*Math.PI)**.55*B/2),sheer=2.8+Math.abs(t-.5)**2*9;points.push(-width,sheer,z,-width*.68,-1.4,z,0,-3,z,width*.68,-1.4,z,width,sheer,z);if(i<sections)for(let j=0;j<4;j++){const n=i*5+j;idx.push(n,n+5,n+1,n+1,n+5,n+6);}}
  poly(Array.from({length:points.length/3},(_,i)=>points.slice(i*3,i*3+3)),idx,wood,hull);
  const deckPoints=[],deckIdx=[];for(let i=0;i<=sections;i++){const t=i/sections,z=(t-.5)*L,w=Math.max(.3,Math.sin(t*Math.PI)**.55*B/2),y=2.82+Math.abs(t-.5)**2*9;deckPoints.push([-w,y,z],[w,y,z]);if(i<sections){const n=i*2;deckIdx.push(n,n+2,n+1,n+1,n+2,n+3);}}poly(deckPoints,deckIdx,deckMat,hull);
  box(hull,wood,0,4.1,-L*.25,B*.65,2.6,L*.16);box(hull,snow,0,5.5,-L*.25,B*.69,.25,L*.17);
  for(let j=0;j<3;j++){const z=(j-1)*L*.27,height=20+(j===1?8:2);beam(hull,new THREE.Vector3(0,2.8,z),new THREE.Vector3(.35,height,z),.32,wood);for(let k=0;k<2;k++){const y=height-3-k*6,span=B*(k?.5:.7);beam(hull,new THREE.Vector3(-span,y,z),new THREE.Vector3(span,y,z),.15,wood);
    // Ragged, partly furled canvas hangs motionless in the ice.
    poly([[-span,y-.2,z],[span,y-.2,z],[span*.72,y-4.2,z+.45],[span*.1,y-3.5,z+.6],[-span*.6,y-4.7,z+.3]],[0,1,4,1,2,3,1,3,4],canvas,hull);}
   for(const side of [-1,1]){beam(hull,new THREE.Vector3(side*B*.42,3,z-4),new THREE.Vector3(0,height-2,z),.035,rope);beam(hull,new THREE.Vector3(side*B*.42,3,z+4),new THREE.Vector3(0,height-2,z),.035,rope);}}
  beam(hull,new THREE.Vector3(0,4,L*.4),new THREE.Vector3(0,7,L*.65),.25,wood);
  for(let i=0;i<18;i++){const t=.1+i/22,z=(t-.5)*L,w=Math.sin(t*Math.PI)**.55*B/2;for(const side of [-1,1]){const icicle=mesh(cone,ice,hull);icicle.position.set(side*w,1.7+random(),z);icicle.scale.set(.22,1.5+random()*2,.22);icicle.rotation.z=Math.PI;}}
  return hull;}
 SHIPS.forEach(s=>ship(s));for(const [x,z,length] of [[83,160,63],[-86,300,57],[77,46,48]])ship({x,z,length,beam:18,yaw:(random()-.5)*.7,lean:(random()-.5)*.3},true);
 // Pressure ridges, small bergs, and mountains surround the ice lead.
 for(let i=0;i<100;i++){const z=random()*1400,x=baseCenter(z)+(random()>.5?1:-1)*(75+random()*115),o=mesh(rockGeo,i%3?snow:ice);if(Math.abs(x-mainCenter(z))<halfWidth(z)+15||(z>470&&z<710&&Math.abs(x-shortcutCenter(z))<35)){staticRoot.remove(o);continue;}o.position.set(x,-1,z);o.scale.set(8+random()*20,6+random()*28,10+random()*22);o.rotation.y=random()*6;}
 // A continuous vaulted cave, wide enough to contain the split route.
 const roofPoints=[],roofIdx=[];for(let k=0;k<=42;k++){const z=385+k*21.8,c=baseCenter(z);for(let j=0;j<=18;j++){const a=j/18*Math.PI;roofPoints.push([c+Math.cos(a)*220,Math.sin(a)*(42+Math.sin(z/53)*5)-2,z]);}if(k<42)for(let j=0;j<18;j++){const n=k*19+j;roofIdx.push(n,n+19,n+1,n+1,n+19,n+20);}}poly(roofPoints,roofIdx,ceilingMat);
 for(let i=0;i<130;i++){const z=410+random()*870,c=baseCenter(z),x=c+(random()-.5)*130,h=4+random()*10,shard=mesh(cone,ice);const roofY=Math.sqrt(Math.max(0,1-((x-c)/220)**2))*(42+Math.sin(z/53)*5)-2;shard.position.set(x,roofY-h*.5+1,z);shard.scale.set(1+random()*1.6,h,1+random());shard.rotation.z=Math.PI;}
 // Avalanche entrance plug and falling snow/ice masses.
 const barrier=new THREE.Group();world.add(barrier);const gateZ=500,gateX=shortcutCenter(gateZ);for(let i=0;i<9;i++){const o=mesh(rockGeo,ice,barrier);o.position.set(gateX+(i%3-1)*4,2.5+Math.floor(i/3)*3.4,gateZ);o.scale.set(3.2,4,3);}
 const avalanchePieces=Array.from({length:28},(_,i)=>{const o=mesh(rockGeo,i%3?snow:ice,world);o.visible=false;return{o,phase:random(),x:gateX+(random()-.5)*30,z:gateZ+(random()-.5)*32};});
 const debris=new THREE.Group();world.add(debris);for(let i=0;i<8;i++){const o=mesh(rockGeo,snow,debris);o.position.set(mainCenter(535)+15+Math.sin(i)*2,1,522+i*3.8);o.scale.set(4,2.5,4);}debris.visible=false;
 const portalMat=new THREE.MeshBasicMaterial({color:'#d5dedb',transparent:true,opacity:.48,side:THREE.DoubleSide});function portal(x,z,parent=staticRoot){for(const side of [-1,1])box(parent,ice,x+side*7,6,z,3,12,4);box(parent,snow,x,12,z,17,2.5,4);const p=mesh(new THREE.PlaneGeometry(11,11),portalMat,parent);p.position.set(x,5.5,z);return p;}
 portal(mainCenter(1320),1320);
 // Landing is created up front and lives in this same world.
 box(staticRoot,snow,245,-.4,1605,130,.8,145);portal(245,1557);for(let i=0;i<14;i++){const o=mesh(rockGeo,ice);o.position.set(245+Math.cos(i)*55,3,1605+Math.sin(i)*65);o.scale.set(8,8+i%5*3,10);}
 // Batch only static meshes; falling floes/avalanche/shards remain independently animated.
 staticRoot.updateWorldMatrix(true,true);const inv=staticRoot.matrixWorld.clone().invert(),batches=new Map();staticRoot.traverse(o=>{if(!o.isMesh)return;const key=o.material.uuid;if(!batches.has(key))batches.set(key,{m:o.material,g:[]});const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));g.deleteAttribute('uv');batches.get(key).g.push(g);});staticRoot.clear();for(const b of batches.values()){const g=mergeGeometries(b.g);b.g.forEach(g=>g.dispose());mesh(g,b.m,staticRoot);}
 const fieldRoot=new THREE.Group();world.add(fieldRoot);let fieldSeed=null;
 const fractureVisuals=new Map();
 function patch(parent,p,m,y){const points=[];for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=1+.08*Math.sin(i*7.7+p.z);points.push(new THREE.Vector2(Math.cos(a)*p.rx*r,Math.sin(a)*p.rz*r));}const g=new THREE.ShapeGeometry(new THREE.Shape(points));g.rotateX(-Math.PI/2);const o=mesh(g,m,parent);o.position.set(p.x,y,p.z);o.rotation.y=p.angle??0;return o;}
 function buildField(field){for(const child of [...fieldRoot.children]){if(child.geometry!==rockGeo)child.geometry.dispose();if(child.material!==snow&&child.material!==ice)child.material.dispose();fieldRoot.remove(child);}for(const p of field.snow)patch(fieldRoot,p,snow,.035);for(const p of field.ridges){for(let i=0;i<5;i++){const o=mesh(rockGeo,i%2?ice:snow,fieldRoot),a=i*2.4;const dx=Math.cos(a)*p.rx*.35,dz=Math.sin(a)*p.rz*.35;o.position.set(p.x+dx,1.5+i%3,p.z+dz);o.scale.set(p.rx*.7,3+i%3*2,p.rz*.65);o.rotation.y=p.angle;}}for(const p of field.weak){const o=patch(fieldRoot,p,new THREE.MeshStandardMaterial({color:'#75939e',roughness:.32,transparent:true,opacity:.23}),.05);o.castShadow=false;const points=[];for(let arm=0;arm<5;arm++){const a=arm*1.256+p.z;let x=p.x,z=p.z;for(let i=1;i<5;i++){const nx=p.x+Math.cos(a+Math.sin(i+p.z)*.18)*p.rx*i/5,nz=p.z+Math.sin(a+Math.sin(i)*.2)*p.rz*i/5;points.push(new THREE.Vector3(x,.075,z),new THREE.Vector3(nx,.075,nz));if(i>2)points.push(new THREE.Vector3(nx,.075,nz),new THREE.Vector3(nx+Math.cos(a+1)*3,.075,nz+Math.sin(a+1)*3));x=nx;z=nz;}}const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#557b8b',transparent:true,opacity:.6}));line.userData.z=p.z;fieldRoot.add(line);}fieldSeed=field.seed;}
 function updateFractures(s){
  for(const f of s.fractures??[]){if(!fractureVisuals.has(f)){const g=new THREE.Group();g.position.set(f.x,.1,f.z);world.add(g);const vertices=[],r=rng(Math.floor(f.seed));for(let arm=0;arm<9;arm++){const a=arm/9*Math.PI*2;let x=0,z=0;for(let j=1;j<6;j++){const nx=Math.cos(a+(r()-.5)*.5)*j*1.8,nz=Math.sin(a+(r()-.5)*.5)*j*1.8;vertices.push(x,0,z,nx,0,nz);if(j>2)vertices.push(nx,0,nz,nx+Math.cos(a+1)*2,0,nz+Math.sin(a+1)*2);x=nx;z=nz;}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#203f50'})));const hole=patch(g,{x:0,z:0,rx:f.radius,rz:f.radius},mat('#294550',.3),.025);const chips=[];for(let i=0;i<9;i++){const o=mesh(rockGeo,ice,g);o.scale.set(1.6,.7,2.2);chips.push(o);}fractureVisuals.set(f,{g,hole,chips});}
   const v=fractureVisuals.get(f),p=fracturePose(f.age);v.g.children[0].scale.setScalar(.15+p.spread);v.hole.visible=p.open;for(let i=0;i<v.chips.length;i++){const o=v.chips[i],a=i/9*Math.PI*2;o.visible=p.open;o.position.set(Math.cos(a)*f.radius*.82,-Math.min(7,p.sink*(.3+i%3*.2)),Math.sin(a)*f.radius*.82);o.rotation.set(p.sink*.1,a,p.sink*.15);}}
  for(const [f,v] of fractureVisuals)if(!(s.fractures??[]).includes(f)){v.g.traverse(o=>o.geometry&&o.geometry!==rockGeo&&o.geometry.dispose());world.remove(v.g);fractureVisuals.delete(f);}
 }
 const shardVisuals=new Map();const markerGeo=new THREE.RingGeometry(1.8,2.05,12),markerMat=new THREE.MeshBasicMaterial({color:'#607f8c',transparent:true,opacity:.65,side:THREE.DoubleSide});
 function update(s){if(s.field&&fieldSeed!==s.field.seed)buildField(s.field);updateFractures(s);for(const child of fieldRoot.children)child.visible=(child.userData.z??child.position.z)>s.front;for(const crack of cracks)crack.line.visible=crack.z>s.front;for(const f of floes){const pose=floePose(f.z,s.front);f.group.visible=pose.visible;if(f.shortcut&&!s.open){f.group.position.y=0;f.group.rotation.z=0;continue;}f.group.position.y=pose.y;f.group.rotation.z=pose.tilt*Math.sin(f.z*.4)*.45;f.group.rotation.x=pose.tilt*Math.cos(f.z*.3)*.25;}
  barrier.visible=!s.open;debris.visible=s.open;
  for(const p of avalanchePieces){const t=s.avalancheAge-1.25;p.o.visible=t>=0&&t<3.8;if(p.o.visible){p.o.position.set(p.x+Math.sin(p.phase*10)*t*4,32-(t+p.phase*.4)**2*8,p.z+t*8);p.o.scale.setScalar(2+p.phase*3);p.o.rotation.set(t*2,p.phase*4,t);}}
  for(const shard of s.shards){
   if(!shardVisuals.has(shard)){const o=mesh(cone,ice,world);o.rotation.z=Math.PI;const marker=mesh(markerGeo,markerMat,world);marker.rotation.x=-Math.PI/2;shardVisuals.set(shard,{o,marker});}
   const v=shardVisuals.get(shard),pose=shardPose(shard.age,shard.height),length=shard.length??8,radius=shard.radius??1.5;
   // y is the tip height: large crystals visibly plunge from the ceiling to the floor.
   v.o.position.set(shard.x+(pose.phase==='warning'&&shard.age>=0?Math.sin(shard.age*38)*.18:0),pose.y+length*.5-Math.max(0,shard.age-5)*5,shard.z);
   v.o.rotation.x=pose.phase==='impact'?Math.min(.45,Math.max(0,shard.age-2)*.22):0;
   v.o.scale.set(radius,length,radius);v.marker.position.set(shard.x,.08,shard.z);v.marker.scale.setScalar((radius+1.6)/2);
   v.marker.visible=shard.age>=0&&(pose.phase==='warning'||pose.phase==='falling');
  }
  for(const [shard,v] of shardVisuals)if(!s.shards.includes(shard)){world.remove(v.o,v.marker);shardVisuals.delete(shard);}
 }
 function reset(){fieldSeed=null;for(const v of fractureVisuals.values()){v.g.traverse(o=>o.geometry&&o.geometry!==rockGeo&&o.geometry.dispose());world.remove(v.g);}fractureVisuals.clear();for(const v of shardVisuals.values())world.remove(v.o,v.marker);shardVisuals.clear();floes.forEach(f=>{f.group.visible=true;f.group.position.y=0;f.group.rotation.set(0,0,0);});barrier.visible=true;debris.visible=false;avalanchePieces.forEach(p=>p.o.visible=false);}
 return{world,origin,floes,staticRoot,update,reset};
}
