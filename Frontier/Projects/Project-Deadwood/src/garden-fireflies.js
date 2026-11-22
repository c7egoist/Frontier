import * as THREE from 'three';
import {clearSight} from './garden-combat.js';
import {gardenHeight} from './garden-environment.js';
export const FIREFLY={trigger:8.5,fuse:1.35,blast:6,respawn:7.5,maxArmed:2};
export function fireflyPhase(age){return age<0?'idle':age<FIREFLY.fuse?'arming':age<FIREFLY.fuse+.65?'burst':'spent';}
export function fireflyBlastHits(f,car,walls){return Math.hypot(car.x-f.x,car.z-f.z)<FIREFLY.blast&&clearSight(f,car,walls);}
export function createFireflies(group,sources){const bodyMat=new THREE.MeshStandardMaterial({color:'#514b32',roughness:.8}),wingMat=new THREE.MeshStandardMaterial({color:'#c4b998',transparent:true,opacity:.38,side:THREE.DoubleSide}),geo=new THREE.SphereGeometry(1,9,6);
 const flies=sources.slice(0,14).flatMap((source,i)=>Array.from({length:i%3===0?2:1},(_,j)=>{const body=new THREE.Group();group.add(body);function blob(m,x,y,z,sx,sy,sz){const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);body.add(o);return o;}
  blob(bodyMat,0,0,0,.38,.3,.85);blob(bodyMat,0,.08,.75,.25,.25,.3);const glowMat=new THREE.MeshStandardMaterial({color:'#b69a4d',emissive:'#b18b32',emissiveIntensity:.25,roughness:.5});blob(glowMat,0,-.02,-.65,.32,.26,.45);
  const wings=[];for(const side of [-1,1]){const w=new THREE.Group();body.add(w);const m=new THREE.Mesh(geo,wingMat);m.position.set(side*.9,.1,0);m.scale.set(1.15,.035,.5);w.add(m);wings.push({w,side});}
  const puffMat=new THREE.MeshBasicMaterial({color:'#b1a47a',transparent:true,opacity:0,depthWrite:false,wireframe:false});const puff=new THREE.Mesh(geo,puffMat);group.add(puff);puff.visible=false;
  const dustGeo=new THREE.IcosahedronGeometry(.16,0),dustMat=new THREE.MeshStandardMaterial({color:'#afa17a',roughness:1}),dust=new THREE.InstancedMesh(dustGeo,dustMat,16);dust.visible=false;group.add(dust);
  return{body,wings,glowMat,puff,puffMat,dust,home:{x:source.x+(j?.8:-.8),z:source.z},x:0,z:0,y:0,age:-1,phase:i*.8+j,exploded:false};}));
 const dummy=new THREE.Object3D();
 function reset(){for(const f of flies){f.age=-1;f.exploded=false;f.body.visible=true;f.body.scale.setScalar(1);f.glowMat.emissiveIntensity=.25;f.puff.visible=f.dust.visible=false;f.x=f.home.x;f.z=f.home.z;f.y=gardenHeight(f.x,f.z)+1.7;f.body.position.set(f.x,f.y,f.z);}}
 function update(dt,time,car,walls,allowArm=true){const events=[];let warning='',armed=flies.filter(f=>fireflyPhase(f.age)==='arming').length;
  for(const f of flies){if(f.age<0){f.x=f.home.x+Math.sin(time*.75+f.phase)*1.6;f.z=f.home.z+Math.cos(time*.6+f.phase)*1.3;f.y=gardenHeight(f.x,f.z)+1.6+Math.sin(time*1.5+f.phase)*.35;if(allowArm&&time>2.2&&armed<FIREFLY.maxArmed&&Math.hypot(f.x-car.x,f.z-car.z)<FIREFLY.trigger&&clearSight(f,car,walls)){f.age=0;armed++;}}
   if(f.age>=0)f.age+=dt;const phase=fireflyPhase(f.age);f.body.visible=phase==='idle'||phase==='arming';f.body.position.set(f.x,f.y+(phase==='arming'?Math.sin(f.age*35)*.05:0),f.z);f.body.rotation.y=time*.4+f.phase;
   const charge=Math.max(0,Math.min(1,f.age/FIREFLY.fuse));f.body.scale.setScalar(phase==='arming'?1+charge*.65:1);f.glowMat.emissiveIntensity=phase==='arming'?.35+charge*(.6+.3*Math.sin(f.age*35)):.2+Math.sin(time*1.6+f.phase)*.08;
   for(const w of f.wings)w.w.rotation.z=w.side*Math.sin(time*37+f.phase)*.65;
   if(phase==='arming'&&Math.hypot(f.x-car.x,f.z-car.z)<15)warning='FIREFLY SWELLING · LEAVE THE CLOUD';
   if(f.age>=FIREFLY.fuse&&!f.exploded){f.exploded=true;events.push({x:f.x,z:f.z,hit:fireflyBlastHits(f,car,walls)});}
   f.puff.visible=f.dust.visible=phase==='burst';if(phase==='burst'){const t=(f.age-FIREFLY.fuse)/.65;f.puff.position.set(f.x,f.y,f.z);f.puff.scale.setScalar(.5+Math.min(1,t*4)*FIREFLY.blast);f.puffMat.opacity=.24*(1-t);for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=t*(4+i%3);dummy.position.set(f.x+Math.cos(a)*r,f.y+Math.sin(i*2)*r*.35-t*t*2,f.z+Math.sin(a)*r);dummy.scale.setScalar(1-t);dummy.rotation.set(i+t*4,i*.3,t*3);dummy.updateMatrix();f.dust.setMatrixAt(i,dummy.matrix);}f.dust.instanceMatrix.needsUpdate=true;}
   if(f.age>FIREFLY.respawn){f.age=-1;f.exploded=false;}}
  return{events,warning,armed};}
 reset();return{flies,reset,update};
}
