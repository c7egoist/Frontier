import * as T from 'three';
import {rng} from './course.js';
import {YARD,yardCentre,yardHalfWidth,yardY,createYardState,cranePose} from './scrapyard.js';
const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.88,flatShading:true,...extra});
const rust=material(0x695044),steel=material(0x70716b,{metalness:.28}),rubber=material(0x282824),glass=material(0x303b3a),ochre=material(0x9d8154),pale=material(0xb5ae98),mud=material(0x716453,{vertexColors:true}),dark=material(0x383a33);
const cube=new T.BoxGeometry(1,1,1),wheel=new T.CylinderGeometry(.43,.43,.26,7),tyre=new T.TorusGeometry(.53,.19,5,10),heap=new T.IcosahedronGeometry(1,1),dummy=new T.Object3D();
const palette=[0x755a4e,0x65716b,0x9a8d73,0x646b70,0x7a5148,0x88887c,0x4c5c5b];
function mesh(g,geo,mat,x=0,y=0,z=0,sx=1,sy=1,sz=1){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function box(g,mat,x,y,z,w,h,d){return mesh(g,cube,mat,x,y,z,w,h,d);}
function beam(g,a,b,r,mat=steel){const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start);const m=mesh(g,new T.CylinderGeometry(r,r,1,6),mat);m.position.copy(start.add(end).multiplyScalar(.5));m.scale.y=delta.length();m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
function batch(parent,geo,mat,items,name){
 if(!items.length)return null;const m=new T.InstancedMesh(geo,mat,items.length);m.name=name;
 items.forEach((p,i)=>{dummy.position.set(...p.p);dummy.rotation.set(...(p.r||[0,0,0]));dummy.scale.set(...(p.s||[1,1,1]));dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);if(p.color)m.setColorAt(i,new T.Color(p.color));});m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function carParts(arr,x,y,z,yaw,crushed,color,random){
 const height=crushed?.42:.85,cabin=crushed?.22:.67,co=Math.cos(yaw),si=Math.sin(yaw),rotation=[(random()-.5)*.08,yaw,(random()-.5)*.08];
 arr.shell.push({p:[x,y+height*.5,z],r:rotation,s:[2.18,height,4.5],color});
 arr.cab.push({p:[x-si*.25,y+height+cabin*.48,z-co*.25],r:rotation,s:[1.7,cabin,2.05]});
 arr.roof.push({p:[x-si*.3,y+height+cabin,z-co*.3],r:rotation,s:[1.87,.12,1.84],color});
 if(!crushed&&random()>.4)for(const lx of [-1.08,1.08])for(const lz of [-1.35,1.36])arr.wheels.push({p:[x+lx*co+lz*si,y+.25,z-lx*si+lz*co],r:[0,yaw,Math.PI/2],s:[1,1,1]});
}
function rebuildScenery(g){
 if(g.scenery){g.group.remove(g.scenery);g.scenery.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.userData.uniqueGeometry)o.geometry.dispose();});}
 const root=new T.Group();root.name='RandomScrapyard_WreckCourts';g.group.add(root);g.scenery=root;g.sectors=[];
 const random=rng(g.state.seed^87611);
 for(let start=0;start<YARD.length;start+=200){
  const sector=new T.Group();sector.userData.station=start+100;sector.name=`WreckCourt_${start}`;root.add(sector);g.sectors.push(sector);
  const arr={shell:[],cab:[],roof:[],wheels:[]},bales=[],tyres=[],panels=[],ribs=[];
  for(const b of g.state.layout.blocks.filter(p=>p.s>=start&&p.s<start+200)){
   const co=Math.cos(b.yaw),si=Math.sin(b.yaw),world=(x,z)=>[b.x+x*co+z*si,b.z-x*si+z*co];
   if(b.kind==='wrecks'||b.kind==='bales'){
    // Interlocking rows of actual car silhouettes. Lower crushed bales close the collider footprint.
    const cols=Math.max(2,Math.floor(b.rx*2/4.7)),rows=Math.max(2,Math.floor(b.rz*2/5.4));
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
     const lx=(col/(cols-1)-.5)*b.rx*1.75,lz=(row/(rows-1)-.5)*b.rz*1.75;if(Math.hypot(lx/b.rx,lz/b.rz)>1.05)continue;
     const [x,z]=world(lx,lz),base=yardY(x,z),layers=(row+col)%3===0?2+Math.floor(random()*3):1;
     bales.push({p:[x,base+1.2,z],r:[0,b.yaw+(random()-.5)*.16,0],s:[4.5,2.4,5.1],color:palette[Math.floor(random()*palette.length)]});
     for(let layer=0;layer<layers;layer++)carParts(arr,x+(random()-.5)*.6,base+2+layer*.95,z+(random()-.5)*.6,b.yaw+(random()-.5)*.28,b.kind==='bales'||layer<layers-1,palette[Math.floor(random()*palette.length)],random);
    }
   }else if(b.kind==='tyres'){
    for(let i=0;i<22;i++){const a=random()*6.28,r=Math.sqrt(random()),[x,z]=world(Math.cos(a)*b.rx*r,Math.sin(a)*b.rz*r);tyres.push({p:[x,yardY(x,z)+.4+Math.floor(random()*4)*.47,z],r:[Math.PI/2+(random()-.5)*.6,random()*6.28,0],s:[1+random()*.5,1+random()*.5,1]});}
   }else if(b.kind==='shack'){
    const base=yardY(b.x,b.z);const shack=new T.Group();shack.name=`CorrugatedMetalShack_${b.id}`;shack.position.set(b.x,base,b.z);shack.rotation.y=b.yaw;sector.add(shack);
    box(shack,rust,0,b.height/2,0,b.rx*2,b.height,b.rz*2);box(shack,dark,0,1.6,-b.rz-.06,2.8,3.2,.12);
    for(const side of [-1,1]){const roof=box(shack,steel,side*b.rx*.49,b.height+.65,0,b.rx+1,.16,b.rz*2+1.7);roof.rotation.z=side*-.15;}
    for(let x=-b.rx;x<=b.rx;x+=.65){const [wx,wz]=world(x,-b.rz-.1);ribs.push({p:[wx,base+b.height/2,wz],r:[0,b.yaw,0],s:[.065,b.height,.18]});}
    for(const side of [-1,1])for(let z=-b.rz;z<=b.rz;z+=.7){const [wx,wz]=world(side*(b.rx+.06),z);ribs.push({p:[wx,base+b.height/2,wz],r:[0,b.yaw,0],s:[.15,b.height,.07]});}
   }
  }
  batch(sector,cube,pale,arr.shell,'StackedAndCrushedCars_Bodies');batch(sector,cube,glass,arr.cab,'WreckCabins');batch(sector,cube,pale,arr.roof,'WreckRoofs');batch(sector,wheel,rubber,arr.wheels,'WreckTyres');batch(sector,cube,rust,bales,'CompactedScrapBales');batch(sector,tyre,rubber,tyres,'RubberTyreHeaps');batch(sector,cube,steel,ribs,'CorrugatedShackRibs');
  // Jagged perimeter is a yard boundary, not a pair of painted racing rails.
  for(let s=start;s<Math.min(YARD.length,start+200);s+=17)for(const side of [-1,1]){
   const x=yardCentre(s)+side*(yardHalfWidth(s)+2),z=YARD.z+s,base=yardY(x,z);
   panels.push({p:[x,base+2.3,z],r:[0,side*.03,side*(random()-.5)*.08],s:[.3,4.6,16.7]});

  }
  batch(sector,cube,steel,panels,'SalvageFencePanels');
 }
 // Inspection outlines are footprints, never a recommended driving line.
 const points=[];for(const b of g.state.layout.blocks)for(let j=0;j<20;j++)for(const a of [j/20*Math.PI*2,(j+1)/20*Math.PI*2]){const lx=Math.cos(a)*b.rx,lz=Math.sin(a)*b.rz,co=Math.cos(b.yaw),si=Math.sin(b.yaw),x=b.x+lx*co+lz*si,z=b.z-lx*si+lz*co;points.push(x,yardY(x,z)+.15,z);}
 g.guide.geometry.dispose();g.guide.geometry=new T.BufferGeometry();g.guide.geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
}
function buildCrane(parent,id){
 const root=new T.Group();root.name=`MagneticSalvageCrane_${id}`;parent.add(root);
 for(const side of [-1,1]){box(root,dark,side*3,1,0,2.2,1.8,8);for(let j=-3;j<=3;j+=1.5)mesh(root,wheel,steel,side*4.2,1,j,1.7,1,1.7).rotation.z=Math.PI/2;}
 const upper=new T.Group();root.add(upper);box(upper,ochre,0,3,0,6,3.7,7);box(upper,rust,0,4,-5,6.8,4,3.4);box(upper,steel,0,6,0,3.4,3,3.6);box(upper,glass,-2.2,4.4,2.7,2.7,2.7,2.4);
 const boom=new T.Group();boom.position.y=7;root.add(boom);
 for(const x of [-1.2,1.2])for(const y of [-1,1])beam(boom,[x,y,0],[x*.62,y*.62,38],.16,ochre);
 for(let z=0;z<38;z+=3){beam(boom,[-1.2,-1,z],[1.2,1,z+3],.11,steel);beam(boom,[1.2,-1,z],[-1.2,1,z+3],.11,steel);beam(boom,[-1.2,1,z],[1.2,-1,z+3],.11,steel);}
 const head=new T.Group();head.name=`CraneMagnet_${id}`;parent.add(head);mesh(head,new T.CylinderGeometry(3.2,3.5,1.1,16),dark,0,0,0);mesh(head,new T.CylinderGeometry(2.5,2.5,.2,16),steel,0,-.6,0);box(head,ochre,0,.8,0,4.1,.5,3.5);
 const cableGeometry=new T.BufferGeometry();cableGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(15*3),3).setUsage(T.DynamicDrawUsage));const cable=new T.Line(cableGeometry,new T.LineBasicMaterial({color:0x34342f}));cable.frustumCulled=false;parent.add(cable);
 return {root,upper,boom,head,cable};
}
function buildDrone(parent,id){
 const root=new T.Group();root.name=`IndustrialCargoDrone_${id}`;parent.add(root);box(root,steel,0,0,0,4,1.4,5);box(root,ochre,0,1,0,3,1,3.6);box(root,rust,0,-1.7,0,3.4,2.2,4);
 const rotors=[];for(const x of [-4.7,4.7])for(const z of [-4.5,4.5]){
  beam(root,[x*.3,0,z*.3],[x,0,z],.2,dark);mesh(root,new T.TorusGeometry(2.1,.17,5,16),dark,x,.2,z).rotation.x=Math.PI/2;
  const r=new T.Group();r.position.set(x,.24,z);box(r,steel,0,0,0,3.8,.08,.3);box(r,steel,0,0,0,.3,.08,3.8);root.add(r);rotors.push(r);
 }return {root,rotors};
}
function gate(parent,x,z,label){
 const root=new T.Group();root.name=label;parent.add(root);const y=yardY(x,z);root.position.set(x,y,z);
 for(const side of [-1,1]){box(root,rust,side*14,8,0,3,16,5);box(root,steel,side*14,1,0,7,2,9);}
 box(root,ochre,0,16,0,31,2,5);for(let i=-12;i<14;i+=4)box(root,dark,i,16,-2.55,1.6,1.7,.1).rotation.z=.4;
 const plane=mesh(root,new T.PlaneGeometry(24,13),new T.MeshBasicMaterial({color:0xb8b4a6,side:T.DoubleSide}),0,7,0);return {root,plane};
}
export function buildScrapyard(scene){
 const group=new T.Group();group.name='Scene04_IronTide_Scrapyard';scene.add(group);const state=createYardState();
 const positions=[],colors=[],indices=[],cols=48,rows=240;
 for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
  const s=-40+r*8.3,x=YARD.x+(c/cols-.5)*650,z=YARD.z+s,y=yardY(x,z)-.08;positions.push(x,y,z);
  const tint=new T.Color(0x8d7d65).multiplyScalar(.8+.18*Math.sin(x*.03+s*.04)+.06*Math.sin(s*.6+x));colors.push(tint.r,tint.g,tint.b);
  if(r<rows&&c<cols){const a=r*(cols+1)+c,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
 }
 const groundGeo=new T.BufferGeometry();groundGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));groundGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));groundGeo.setIndex(indices);groundGeo.computeVertexNormals();const ground=mesh(group,groundGeo,mud);ground.name='RuttedScrapyardGround';ground.receiveShadow=true;ground.castShadow=false;
 const guide=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xbdb08f,depthTest:false,transparent:true,opacity:.6}));guide.visible=false;group.add(guide);
 const cranes=state.cranes.map(c=>buildCrane(group,c.id)),drones=state.drones.map(d=>buildDrone(group,d.id));
 const bodyParts={};for(const [name,geo,mat] of [['metal',cube,steel],['cab',cube,glass],['roof',cube,rust],['tyre',wheel,rubber]]){const m=new T.InstancedMesh(geo,mat,YARD.bodyCapacity*(name==='tyre'?4:1));m.instanceMatrix.setUsage(T.DynamicDrawUsage);m.frustumCulled=false;m.castShadow=true;m.receiveShadow=true;m.name=`MagneticLooseScrap_${name}`;group.add(m);bodyParts[name]=m;}
 const shadows=new T.InstancedMesh(new T.CircleGeometry(1,18).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:0x2c2922,transparent:true,opacity:.4,depthWrite:false}),YARD.bodyCapacity+6);shadows.instanceMatrix.setUsage(T.DynamicDrawUsage);shadows.frustumCulled=false;group.add(shadows);
 const dust=new T.InstancedMesh(heap,material(0xa69a7e),480);dust.frustumCulled=false;dust.instanceMatrix.setUsage(T.DynamicDrawUsage);group.add(dust);
 gate(group,yardCentre(0),YARD.z-28,'ScrapyardArrivalGantry');const exit=gate(group,yardCentre(YARD.length),YARD.z+YARD.length,'ScrapyardExitPortal');
 const landing=YARD.landing;box(group,material(0x9a907a),landing.x,-1,landing.z+100,150,2,300);
 const g={group,state,guide,cranes,drones,bodyParts,shadows,dust,exit,seed:null,sectors:[],scenery:null};updateScrapyardVisuals(g,{x:YARD.x,z:YARD.z},0);return g;
}
export function updateScrapyardVisuals(g,car,time,{inspect=false,focus=null,viewRadius=460}={}){
 const centre=(focus?.z??car.z)-YARD.z,range=inspect&&!focus?Infinity:viewRadius;
 const state=g.state;if(g.seed!==state.seed){g.seed=state.seed;rebuildScenery(g);}
 for(const s of g.sectors)s.visible=inspect||Math.abs(s.userData.station-(car.z-YARD.z))<460;
 state.cranes.forEach((c,i)=>{
  const v=g.cranes[i];v.root.visible=v.head.visible=v.cable.visible=Math.abs(c.s-centre)<range;const pose=cranePose(c,state.hazardTime),base=yardY(c.x,c.z);v.root.position.set(c.x,base,c.z);v.root.rotation.y=pose.yaw;v.upper.rotation.z=pose.progress*c.side*.75;v.boom.rotation.x=-pose.pitch;v.head.position.set(c.head.x,c.head.y,c.head.z);v.head.rotation.set(pose.progress*.4,pose.yaw,state.captured?.crane===c.id?Math.sin(time*7)*.03:0);
  const a=v.cable.geometry.attributes.position.array;for(let j=0;j<15;j++){const t=j/14;a[j*3]=c.tip.x+(c.head.x-c.tip.x)*t+Math.sin(t*Math.PI)*pose.progress*3;a[j*3+1]=c.tip.y+(c.head.y-c.tip.y)*t;a[j*3+2]=c.tip.z+(c.head.z-c.tip.z)*t;}v.cable.geometry.attributes.position.needsUpdate=true;
 });
 state.drones.forEach((d,i)=>{const v=g.drones[i];v.root.visible=Math.abs(d.z-YARD.z-centre)<range;v.root.position.set(d.x,d.y,d.z);v.root.rotation.set(Math.sin(time*2+d.id)*.025,Math.sin(time*.2+d.id)*.12,Math.cos(time+d.id)*.035);v.rotors.forEach((r,j)=>r.rotation.y=time*(j%2?22:-22));});
 const counts={metal:0,cab:0,roof:0,tyre:0};let shadowCount=0;
 const put=(name,pos,scale,yaw=0,roll=0)=>{const m=g.bodyParts[name];dummy.position.set(...pos);dummy.rotation.set(0,yaw,roll);dummy.scale.set(...scale);dummy.updateMatrix();m.setMatrixAt(counts[name]++,dummy.matrix);};
 for(const b of state.bodies){
  if(b.state==='inactive')continue;const floor=yardY(b.x,b.z),tilt=b.state==='falling'?b.age*b.spin:0;
  put('metal',[b.x,b.y,b.z],[b.rx*2,b.height,b.rz*2],b.yaw,tilt*.25);
  if(b.kind==='car'){
   put('cab',[b.x,b.y+b.height*.6,b.z],[1.7,.35,2.1],b.yaw,tilt*.25);put('roof',[b.x,b.y+b.height*.8,b.z],[1.9,.12,1.9],b.yaw,tilt*.25);
   for(const x of [-1.13,1.13])for(const z of [-1.4,1.4]){const co=Math.cos(b.yaw),si=Math.sin(b.yaw);put('tyre',[b.x+x*co+z*si,b.y-.2,b.z-x*si+z*co],[1,1,1],b.yaw,Math.PI/2);}
  }
  if(b.state==='falling'){
   dummy.position.set(b.x,floor+.05,b.z);dummy.rotation.set(0,0,0);dummy.scale.set(b.r*1.4,1,b.r*1.4);dummy.updateMatrix();g.shadows.setMatrixAt(shadowCount++,dummy.matrix);
  }
 }
 for(const d of state.drones)if(d.state==='warning'||d.state==='dumping'){
  dummy.position.set(d.x,yardY(d.x,d.z)+.08,d.z);dummy.rotation.set(0,0,0);dummy.scale.set(6.8,1,6.8);dummy.updateMatrix();g.shadows.setMatrixAt(shadowCount++,dummy.matrix);
 }
 for(const [name,m] of Object.entries(g.bodyParts)){m.count=counts[name];m.visible=m.count>0;m.instanceMatrix.needsUpdate=true;}
 g.shadows.count=shadowCount;g.shadows.visible=shadowCount>0;g.shadows.instanceMatrix.needsUpdate=true;
 let n=0;for(const p of state.impacts)for(let j=0;j<16&&n<480;j++){
  const t=p.age,a=j*2.399,r=(3+j%5)*t,y=yardY(p.x,p.z)+.2+(4+j%4)*t-10*t*t;if(y<yardY(p.x,p.z)-.4)continue;
  dummy.position.set(p.x+Math.sin(a)*r,y,p.z+Math.cos(a)*r);dummy.rotation.set(t*j,t,0);dummy.scale.set(.15+(p.size||1)*.06,.2,.25);dummy.updateMatrix();g.dust.setMatrixAt(n++,dummy.matrix);
 }g.dust.count=n;g.dust.visible=n>0;g.dust.instanceMatrix.needsUpdate=true;
}
