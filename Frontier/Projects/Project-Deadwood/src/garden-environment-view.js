import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {gardenHeight,environmentLayout} from './garden-environment.js';
export function buildGardenEnvironment(group,maze,walls,materials){
 const {soil,hedge,leaf,stem,petal,ivory}=materials,layout=environmentLayout(maze,walls),staticGroup=new THREE.Group();group.add(staticGroup);
 const sphere=new THREE.SphereGeometry(1,9,6),rockGeo=new THREE.IcosahedronGeometry(1,1),rootMat=new THREE.MeshStandardMaterial({color:'#454c32',roughness:1});
 function mesh(g,m,parent=staticGroup){const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function blob(m,x,y,z,sx,sy,sz){const o=mesh(sphere,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);return o;}
 function tube(points,r,m=rootMat){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(12,points.length*2),r,6,false),m);}
 // A sampled surface, not a flat slab. The driving height uses this exact field.
 const floorGeo=new THREE.PlaneGeometry(260,300,130,150);floorGeo.rotateX(-Math.PI/2);const pos=floorGeo.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i)+115;pos.setXYZ(i,x,gardenHeight(x,z)-.025,z);}floorGeo.computeVertexNormals();const floor=mesh(floorGeo,soil,group);floor.castShadow=false;
 // Rounded, sinuous earth banks with exposed woody roots. No rectangular hedges.
 for(const [index,w] of walls.entries()){const vertices=[],indices=[],steps=w.points.length,height=w.z<0&&Math.abs(w.x)<20?2.0:4.8+Math.sin(index*2.1)*1.1;
  for(let i=0;i<steps;i++){const p=w.points[i],a=w.points[Math.max(0,i-1)],b=w.points[Math.min(steps-1,i+1)],len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;for(let j=0;j<=12;j++){const angle=j/12*Math.PI,r=2.15*(1+.1*Math.sin(i*1.4+index)),x=p.x+nx*Math.cos(angle)*r,z=p.z+nz*Math.cos(angle)*r;vertices.push(x,gardenHeight(x,z)+Math.sin(angle)*(height+.3*Math.sin(i*1.7)),z);}if(i<steps-1)for(let j=0;j<12;j++){const n=i*13+j;indices.push(n,n+13,n+1,n+1,n+13,n+14);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();mesh(g,hedge);
  for(const p of [w.points[0],w.points.at(-1)])blob(hedge,p.x,gardenHeight(p.x,p.z)+height*.35,p.z,2.1,height*.65,2.1);
  for(let side=-1;side<=1;side+=2){const points=w.points.map((p,i)=>new THREE.Vector3(p.x+Math.sin(i*1.2+index)*.9,gardenHeight(p.x,p.z)+height*(.5+.4*Math.sin(i*.7+index+side)),p.z+Math.cos(i*1.3+index)*.9));tube(points,.22+(index%3)*.07);}
  for(let j=1;j<steps;j+=3){const p=w.points[j],o=blob(leaf,p.x,gardenHeight(p.x,p.z)+height*.8,p.z,.45,1.6,1.5);o.rotation.z=Math.sin(index+j)*.7;o.rotation.y=index*.7;}
 }
 for(let i=20;i<walls.length;i+=27){const p=walls[i].points[4];if(Math.hypot(p.x,p.z)<45)continue;const profile=[[.4,0],[.9,1],[1.8,3],[1.5,5],[1.15,6],[1.5,6.7]].map(([r,h])=>new THREE.Vector2(r,h)),body=mesh(new THREE.LatheGeometry(profile,12),leaf);body.position.set(p.x,gardenHeight(p.x,p.z),p.z);const rim=mesh(new THREE.TorusGeometry(1.5,.22,6,14),petal);rim.rotation.x=Math.PI/2;rim.position.set(p.x,body.position.y+6.7,p.z);const dark=mesh(new THREE.CircleGeometry(1.25,14),stem);dark.rotation.x=-Math.PI/2;dark.position.set(p.x,body.position.y+6.25,p.z);blob(leaf,p.x,body.position.y+8,p.z+.8,1.5,.2,1.7).rotation.x=.3;}
 const stoneMat=new THREE.MeshStandardMaterial({color:'#777667',roughness:1});
 for(const r of layout.rocks){const o=mesh(rockGeo,stoneMat);o.position.set(r.x,gardenHeight(r.x,r.z)+r.radius*.45,r.z);o.rotation.set(r.phase*.3,r.phase,.3);o.scale.set(r.radius,r.radius*.8,r.radius*.9);}
 // Low flower clumps grow at the feet of banks, not only on tall poles.
 for(const [index,p] of layout.groundFlowers.entries()){const y=gardenHeight(p.x,p.z),m=p.shade>.5?petal:ivory;for(let k=0;k<3;k++){const x=p.x+Math.sin(k*2.4+index)*.8,z=p.z+Math.cos(k*2.4+index)*.8,h=p.size*(.35+k*.13);blob(stem,x,y+h*.45,z,.08,h*.5,.08);for(let j=0;j<5;j++){const a=j/5*Math.PI*2,o=blob(m,x+Math.cos(a)*p.size*.25,y+h,z+Math.sin(a)*p.size*.25,p.size*.28,.09,p.size*.15);o.rotation.y=-a;}blob(leaf,x-.25,y+.1,z,.7,.12,.3);}}
 const tunnelMat=new THREE.MeshStandardMaterial({color:'#4f543a',roughness:1,side:THREE.DoubleSide});
 for(const t of layout.tunnels){const vertices=[],indices=[],axis=new THREE.Vector3(Math.sin(t.yaw),0,Math.cos(t.yaw)),across=new THREE.Vector3(Math.cos(t.yaw),0,-Math.sin(t.yaw));
  function point(along,angle,lift=0){const side=Math.cos(angle)*t.width,x=t.x+axis.x*along+across.x*side,z=t.z+axis.z*along+across.z*side;return new THREE.Vector3(x,gardenHeight(x,z)+Math.sin(angle)*t.height+lift,z);}
  for(let k=0;k<=12;k++){const along=(k/12-.5)*t.length;for(let j=0;j<=24;j++){const p=point(along,j/24*Math.PI,.1*Math.sin(k*2+j*.6));vertices.push(p.x,p.y,p.z);}if(k<12)for(let j=0;j<24;j++){const n=k*25+j;indices.push(n,n+25,n+1,n+1,n+25,n+26);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();mesh(g,tunnelMat);
  for(let k=-2;k<=2;k++){const points=[];for(let j=0;j<=24;j++)points.push(point(k*t.length/4,j/24*Math.PI,-.15));tube(points,.28+(k%2===0?.08:0));}
  // High hanging rootlets keep the vehicle-height corridor clear.
  for(let k=-1;k<=1;k++){const p=point(k*5,Math.PI/2,-.15);tube([p,p.clone().add(new THREE.Vector3(.5,-.7,.3)),p.clone().add(new THREE.Vector3(.7,-1.1,.6))],.12);}
 }
 // Static environment is merged by material to avoid a draw call per flower/root.
 const batches=new Map();for(const o of staticGroup.children){o.updateMatrix();const key=o.material.uuid;if(!batches.has(key))batches.set(key,{m:o.material,g:[]});const clone=o.geometry.clone().applyMatrix4(o.matrix);clone.deleteAttribute('uv');batches.get(key).g.push(clone);}staticGroup.clear();for(const b of batches.values()){const g=mergeGeometries(b.g);b.g.forEach(g=>g.dispose());mesh(g,b.m);}
 return{...layout,floor,staticGroup};
}
