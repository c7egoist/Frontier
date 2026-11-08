import * as T from 'three';
import { rng } from './course.js';
import { gardenGround,gardenTerrain,passageSample } from './garden-terrain.js';

export function buildOrganicGround(parent,maze,leafGeometry,leafMaterial){
  const positions=[],colors=[],indices=[],cols=138,rows=198,step=3;
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const x=693+i*step,z=2550+j*step,d=passageSample(x,z,maze).distance,y=gardenTerrain(x,z,maze);
    positions.push(x,y,z);
    const t=Math.min(1,Math.max(0,d/8)),c=new T.Color().lerpColors(new T.Color(0x8c8265),new T.Color(0x4f5940),t);
    c.multiplyScalar(.91+Math.sin(x*.7+z*.31)*.045+Math.cos(x*.17-z*.5)*.04);colors.push(c.r,c.g,c.b);
    if(j<rows&&i<cols){const a=j*(cols+1)+i,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const ground=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.name='OrganicTerrain_CurvedPassages';ground.receiveShadow=true;parent.add(ground);
  const random=rng(6191),matrix=new T.Matrix4(),dummy=new T.Object3D(),foliage=[];
  for(let i=0;i<2300;i++){
    const x=710+random()*380,z=2570+random()*540,d=passageSample(x,z,maze).distance;
    if(d<3||d>18)continue;
    foliage.push({x,y:gardenTerrain(x,z,maze),z,angle:random()*6.28,size:1.1+random()*2});
  }
  const leaves=new T.InstancedMesh(leafGeometry,leafMaterial,foliage.length);
  foliage.forEach((p,i)=>{dummy.position.set(p.x,p.y+.15,p.z);dummy.rotation.set((random()-.5)*1.3,p.angle,(random()-.5)*1.2);dummy.scale.set(p.size,2,p.size);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);});leaves.castShadow=true;parent.add(leaves);
  const rocks=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:0x85816c,flatShading:true,roughness:1}),maze.stones.length);
  rocks.name='Stones_PhysicalShoulderObstacles';maze.stones.forEach((s,i)=>{dummy.position.set(s.x,s.y+s.height*.35,s.z);dummy.rotation.set(.2,s.rotation,.15);dummy.scale.set(s.radius,s.height*.65,s.radius*.8);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);});rocks.castShadow=true;rocks.receiveShadow=true;parent.add(rocks);
  const skins=new T.Group(),ribs=new T.Group();skins.name='TunnelRoofs_CutawayInInspection';ribs.name='LivingTunnelRootRibs';parent.add(skins,ribs);
  const skinMat=new T.MeshStandardMaterial({color:0x4d5840,roughness:1,side:T.DoubleSide,flatShading:true});
  const ribMat=new T.MeshStandardMaterial({color:0x454a35,roughness:1,flatShading:true});
  const ribTransforms=[];
  for(const path of maze.paths.filter(p=>p.tunnel)){
    const p=[],idx=[],across=18;
    const ringPoint=(i,j)=>{
      const point=path.points[i],a=path.points[Math.max(0,i-1)],b=path.points[Math.min(12,i+1)],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),angle=j/across*Math.PI;
      const radius=path.radius+.85+Math.sin(i*.8)*.25;
      return new T.Vector3(point.x-dz/len*Math.cos(angle)*radius,gardenGround(point.x,point.z)+.3+Math.sin(angle)*(path.roof+Math.sin(i*.7)*.4),point.z+dx/len*Math.cos(angle)*radius);
    };
    for(let i=0;i<=12;i++)for(let j=0;j<=across;j++){
      const point=ringPoint(i,j);p.push(point.x,point.y,point.z);
      if(i<12&&j<across){const a=i*(across+1)+j,b=a+across+1;idx.push(a,a+1,b,a+1,b+1,b);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();
    const roof=new T.Mesh(g,skinMat);roof.name=`TunnelRoof_${path.id}`;roof.castShadow=true;roof.receiveShadow=true;skins.add(roof);
    for(const i of [0,4,8,12])for(let j=0;j<across;j++){
      const a=ringPoint(i,j),b=ringPoint(i,j+1),delta=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5);
      matrix.compose(mid,new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize()),new T.Vector3(.48,delta.length(),.48));ribTransforms.push(matrix.clone());
    }
  }
  const ribMesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,6),ribMat,ribTransforms.length);ribTransforms.forEach((m,i)=>ribMesh.setMatrixAt(i,m));ribMesh.castShadow=true;ribMesh.receiveShadow=true;ribs.add(ribMesh);
  return {ground,skins,ribs,rocks};
}
export function buildFireflyVisuals(parent,count){
  const bodies=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:0x44452e,roughness:.8}),count);
  const lamps=new T.InstancedMesh(new T.SphereGeometry(1,7,5),new T.MeshBasicMaterial({color:0xb9a96a}),count);
  const wings=new T.InstancedMesh(new T.SphereGeometry(1,5,3),new T.MeshStandardMaterial({color:0xb7b19a,transparent:true,opacity:.42,side:T.DoubleSide,roughness:1}),count*2);
  bodies.name='ExplosiveFireflies_Bodies';lamps.name='FireflyAbdomens_WarmBioluminescence';wings.name='FireflyWings';
  for(const m of [bodies,lamps,wings]){m.instanceMatrix.setUsage(T.DynamicDrawUsage);m.frustumCulled=false;parent.add(m);}
  const bursts=Array.from({length:16},()=>{
    const m=new T.Mesh(new T.IcosahedronGeometry(1,2),new T.MeshBasicMaterial({color:0xb9a477,transparent:true,opacity:.6,depthWrite:false}));m.visible=false;parent.add(m);return m;
  });
  return {bodies,lamps,wings,bursts};
}
const dummy=new T.Object3D();
export function updateFireflyVisuals(visual,flies,explosions,time){
  let n=0;
  flies.forEach(f=>{
    if(f.state==='spent')return;
    const yaw=Math.sin(time*.4+f.phase),pulse=f.state==='armed'?.8+Math.sin(time*55)*.2:.5+Math.sin(time*3+f.phase)*.1;
    dummy.position.set(f.x,f.y,f.z);dummy.rotation.set(0,yaw,0);dummy.scale.set(.25,.19,.65);dummy.updateMatrix();visual.bodies.setMatrixAt(n,dummy.matrix);
    dummy.position.z-=.42;dummy.scale.set(.23*pulse,.18*pulse,.31*pulse);dummy.updateMatrix();visual.lamps.setMatrixAt(n,dummy.matrix);
    for(let j=0;j<2;j++){
      const side=j?1:-1;dummy.position.set(f.x+side*.35,f.y+.1,f.z);dummy.rotation.set(0,yaw,side*Math.sin(time*46+f.phase)*.6);dummy.scale.set(.48,.025,.24);dummy.updateMatrix();visual.wings.setMatrixAt(n*2+j,dummy.matrix);
    }n++;
  });
  visual.bodies.count=n;visual.lamps.count=n;visual.wings.count=n*2;
  for(const m of [visual.bodies,visual.lamps,visual.wings])m.instanceMatrix.needsUpdate=true;
  visual.bursts.forEach((m,i)=>{
    const e=explosions[i];m.visible=!!e&&e.age<.45;
    if(m.visible){const t=e.age/.45;m.position.set(e.x,e.y,e.z);m.scale.setScalar(.3+Math.sin(t*Math.PI*.6)*e.radius);m.material.opacity=(1-t)*.55;}
  });
}
