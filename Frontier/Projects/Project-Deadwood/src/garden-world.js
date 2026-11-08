import * as T from 'three';
import { buildOrganicGround,buildFireflyVisuals,updateFireflyVisuals } from './garden-organic-world.js';
import { createFireflies } from './fireflies.js';
import { gardenGround,gardenTerrain } from './garden-terrain.js';
import { rng } from './course.js';
import { GARDEN, primarySamples, createMaze, createPlants, createFlowers } from './garden.js';

const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:1,flatShading:true,...extra});
const soil=mat(0x78735f), bank=mat(0x62694e), leaf=mat(0x687451,{side:T.DoubleSide}), pale=mat(0xbab29a), dark=mat(0x333c29), petal=mat(0x8b7162,{side:T.DoubleSide}), pollen=mat(0xaa9970);
const cube=new T.BoxGeometry(1,1,1), sphere=new T.IcosahedronGeometry(1,1);
function mesh(parent,geometry,material,x=0,y=0,z=0,sx=1,sy=1,sz=1){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,material,x,y,z,w,h,d){return mesh(parent,cube,material,x,y,z,w,h,d);}
function tube(parent,points,radius,material=leaf){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(parent,new T.TubeGeometry(curve,12,radius,5,false),material);}
function instances(parent,geometry,material,transforms){
  const m=new T.InstancedMesh(geometry,material,transforms.length),dummy=new T.Object3D();
  transforms.forEach((t,i)=>{dummy.position.set(...t.p);dummy.rotation.set(...(t.r||[0,0,0]));dummy.scale.set(...t.s);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function leafGeometry(){
  const g=new T.SphereGeometry(1,7,5);g.scale(1,.09,3);return g;
}
function lobeGeometry(){
  const p=[],colors=[],idx=[],n=18,m=7;
  for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
    const a=i/n*Math.PI,s=j/m,x=Math.sin(a)*6*s,z=Math.cos(a)*5.4,y=-.65*Math.sin(a)*Math.sin(s*Math.PI);
    p.push(x,y,z);const c=new T.Color().lerpColors(new T.Color(0x785b50),new T.Color(0x76805b),Math.pow(s,3));colors.push(c.r,c.g,c.b);
    if(i<n&&j<m){const q=i*(m+1)+j,b=q+m+1;idx.push(q,b,q+1,q+1,b,b+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();const normals=g.attributes.normal;for(let i=0;i<normals.count;i++)if(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))<.1)normals.setXYZ(i,0,1,0);return g;
}
const lobe=lobeGeometry(),mouthMaterial=mat(0xffffff,{vertexColors:true,side:T.DoubleSide}),toothGeo=new T.ConeGeometry(.16,1.65,5),leafGeo=leafGeometry();
function buildTrap(parent,plant){
  const anchor=new T.Group();anchor.name=`Flytrap_${plant.id}`;anchor.position.set(plant.x,plant.y,plant.z);anchor.rotation.y=plant.yaw;anchor.scale.setScalar(plant.scale);parent.add(anchor);
  const growth=new T.Group();anchor.add(growth);
  const leaves=[];for(let i=0;i<7;i++){const a=i*Math.PI*2/7;leaves.push({p:[Math.sin(a)*3,.2,Math.cos(a)*3],r:[.1,a,.08],s:[1.3,1,1.6]});}instances(growth,leafGeo,leaf,leaves);
  const stem=mesh(growth,new T.CylinderGeometry(1,1,1,7),leaf);stem.scale.set(.65,2,.65);
  const mouth=new T.Group();growth.add(mouth);
  const jaws=[];
  for(const side of [-1,1]){
    const jaw=new T.Group();jaw.position.y=1.25;jaw.scale.x=side;mouth.add(jaw);mesh(jaw,lobe,mouthMaterial);jaws.push(jaw);
    const teeth=[];
    for(let j=0;j<21;j++){
      const a=(j+.5)/21*Math.PI,position=new T.Vector3(Math.sin(a)*6,.05,Math.cos(a)*5.4),direction=new T.Vector3(-.65,.75,-Math.cos(a)*.4).normalize();
      const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction),e=new T.Euler().setFromQuaternion(q);
      teeth.push({p:[position.x+direction.x*.7,position.y+direction.y*.7,position.z+direction.z*.7],r:[e.x,e.y,e.z],s:[1,1,1]});
    }
    instances(jaw,toothGeo,pale,teeth);
    for(const z of [-3,-1,1,3])tube(jaw,[[0,.04,z],[2,-.3,z*.95],[4,-.18,z*.7]],.065,leaf);
  }
  mesh(mouth,sphere,dark,0,1.2,0,.6,.7,5.5);
  const warning=new T.Group();warning.position.set(plant.x,plant.y-.08,plant.z);parent.add(warning);
  for(let i=0;i<8;i++){const a=i*2.39;const crack=box(warning,dark,Math.sin(a)*3,0,Math.cos(a)*3,.16,.15,2.5);crack.rotation.y=a;}
  const mound=mesh(warning,sphere,soil,0,.1,0,3,.4,3);
  return {anchor,growth,jaws,warning,mound,mouth,stem};
}
function buildFlower(parent,f){
  const g=new T.Group();g.name=`NectarBloom_${f.id}`;g.position.set(f.x,f.y||0,f.z);parent.add(g);
  const h=f.height-(f.y||0);tube(g,[[0,0,0],[-2,h*.35,0],[1,h*.7,1],[0,h,0]],.7);
  for(let i=0;i<4;i++){const a=i*2.4;const m=mesh(g,leafGeo,leaf,Math.cos(a)*2,3+i*2,Math.sin(a)*2,1.4,1,1.7);m.rotation.set(.4,a,.3);}
  const crown=new T.Group();crown.position.y=h;g.add(crown);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,m=mesh(crown,leafGeo,i%2?petal:pale,Math.sin(a)*3,-.7,Math.cos(a)*3,1.6,2,1.6);m.rotation.set(-.28,a,0);
  }
  mesh(crown,sphere,pollen,0,.1,0,2,1.25,2);
  const seeds=[];for(let i=0;i<17;i++){const a=i*2.4,r=Math.sqrt(i/17)*1.8;seeds.push({p:[Math.cos(a)*r,1,Math.sin(a)*r],s:[.2,.5,.2]});}instances(crown,sphere,pale,seeds);
  return {g,crown};
}
function buildPitcher(parent,x,z,height=15){
  const g=new T.Group();g.name='GiantPitcher';g.position.set(x,0,z);parent.add(g);
  const profile=[[1,0],[1.8,2],[3.2,5],[2.6,9],[3.8,12]].map(([r,y])=>new T.Vector2(r,y*height/12));
  mesh(g,new T.LatheGeometry(profile,14),mat(0x716b50,{side:T.DoubleSide}));
  const rim=mesh(g,new T.TorusGeometry(3.8,.42,6,18),petal,0,height,0);rim.rotation.x=Math.PI/2;
  mesh(g,new T.CircleGeometry(2.6,16),dark,0,height-3,0).rotation.x=-Math.PI/2;
  tube(g,[[0,height,-3],[0,height+3,-3],[0,height+4,0]],.3);
  const lid=mesh(g,leafGeo,leaf,0,height+3,-1,2,1,1.5);lid.rotation.x=.2;
  return g;
}
function gate(parent,x,z,name){
  const g=new T.Group();g.name=name;g.position.set(x,0,z);parent.add(g);
  for(const side of [-1,1]){box(g,soil,side*18.5,4,0,7,8,6);box(g,pale,side*13,8,0,5,16,6);tube(g,[[side*13,0,-3],[side*10,7,-3],[side*13,15,-3]],.8,leaf);}
  box(g,pale,0,17,0,31,4,6);
  return g;
}
export function buildGarden(scene){
  const group=new T.Group();group.name='TheHunger_CarnivorousGarden';scene.add(group);
  const maze=createMaze(),plants=createPlants(maze),flowers=createFlowers(maze),fireflies=createFireflies(maze),random=rng(8291);
  const organic=buildOrganicGround(group,maze,leafGeo,leaf);
  const trapVisuals=plants.map(p=>buildTrap(group,p)),flowerVisuals=flowers.map(f=>buildFlower(group,f)),fireflyVisuals=buildFireflyVisuals(group,fireflies.length);
  for(const [c,r] of [[3,1],[1,5],[7,4],[2,8],[6,11]]){const x=GARDEN.x+(c-4)*40,z=GARDEN.z+r*40;const pitcher=buildPitcher(group,x,z,13+random()*5);pitcher.position.y=gardenTerrain(x,z,maze);}
  gate(group,GARDEN.x,GARDEN.z-36,'GardenEntry');gate(group,maze.exit.x,maze.exit.z+10,'GardenExit');
  const portal=mesh(group,new T.PlaneGeometry(21,14),new T.MeshBasicMaterial({color:0xb8b9a3,side:T.DoubleSide}),maze.exit.x,7,maze.exit.z+10);
  const trail=new T.Line(new T.BufferGeometry().setFromPoints(primarySamples(maze).map(p=>new T.Vector3(p.x,gardenGround(p.x,p.z)+.3,p.z))),new T.LineBasicMaterial({color:0xc7b485,depthTest:false,transparent:true,opacity:.8}));trail.visible=false;trail.renderOrder=3;group.add(trail);
  const garden={group,maze,plants,flowers,fireflies,trapVisuals,flowerVisuals,fireflyVisuals,portal,trail,organic,explosions:[]};
  updateGardenVisuals(garden,0);return garden;
}
export function updateGardenVisuals(garden,time){
  garden.plants.forEach((p,i)=>{
    const v=garden.trapVisuals[i];v.anchor.position.set(p.x,p.y,p.z);v.anchor.scale.setScalar(p.scale);v.warning.position.set(p.x,p.y-.08,p.z);
    const c=Math.cos(p.yaw),s=Math.sin(p.yaw),ox=(p.headX*c-p.headZ*s)/p.scale,oz=(p.headX*s+p.headZ*c)/p.scale;
    v.mouth.position.set(ox,0,oz);
    const a=new T.Vector3(0,-.8,0),b=new T.Vector3(ox,1.25,oz),delta=b.clone().sub(a);
    v.stem.position.copy(a.add(b).multiplyScalar(.5));v.stem.scale.set(.65,delta.length(),.65);v.stem.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
    v.growth.position.y=(p.rise-1)*12;v.growth.visible=p.rise>.01;
    v.warning.visible=p.state==='warning'||p.state==='rising';v.mound.position.y=p.state==='warning'?Math.sin(time*30)*.12:.1;
    const angle=.08+Math.max(0,p.closure)*1.32;
    v.jaws[0].rotation.z=-angle;v.jaws[1].rotation.z=angle;
    v.anchor.rotation.y=p.yaw;
  });
  garden.flowerVisuals.forEach((v,i)=>{v.crown.rotation.z=Math.sin(time*.45+i)*.055;});
  updateFireflyVisuals(garden.fireflyVisuals,garden.fireflies,garden.explosions,time);
}
