import * as T from 'three';
import { buildGarden } from './garden-world.js';
import { COURSE, BEATS, rng, centerX, groundY, widthAt, ROOT_LIMITS, rootFrames, branchPoint, rootRadius } from './course.js';
export const materials = {
  ground: new T.MeshStandardMaterial({ color: 0x68695b, roughness: 1, vertexColors: true }),
  bark: new T.MeshStandardMaterial({ color: 0x565749, roughness: 1, flatShading: true }),
  root: new T.MeshStandardMaterial({ color: 0x555346, roughness: 1, flatShading: true }),
  stone: new T.MeshStandardMaterial({ color: 0x8e9180, roughness: 1, flatShading: true }),
  pale: new T.MeshStandardMaterial({ color: 0xb8b5a1, roughness: 1 }),
  dark: new T.MeshStandardMaterial({ color: 0x262b25, roughness: .95 }),
  car: new T.MeshStandardMaterial({ color: 0xb7ae91, roughness: .72, metalness: .15 }),
  glass: new T.MeshStandardMaterial({ color: 0x333e37, roughness: .42, metalness: .3 })
};
const boxGeo = new T.BoxGeometry(1, 1, 1), cylinder = new T.CylinderGeometry(1, 1, 1, 6);
function box(parent, mat, x, y, z, w, h, d) { const m = new T.Mesh(boxGeo, mat); m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
function segmentMatrix(a, b, r1, r2 = r1) {
  const middle = new T.Vector3().addVectors(a, b).multiplyScalar(.5), delta = new T.Vector3().subVectors(b, a);
  return new T.Matrix4().compose(middle, new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize()), new T.Vector3(r1, delta.length(), r2));
}
function label(text, size = 256) {
  if (typeof document === 'undefined') return materials.pale;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const cx = c.getContext('2d'); cx.fillStyle = '#b7b6a0'; cx.fillRect(0,0,size,size); cx.fillStyle = '#42483b'; cx.textAlign = 'center'; cx.font = `bold ${size * .34}px Arial`; cx.fillText(text, size / 2, size * .62);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return new T.MeshBasicMaterial({ map: tex });
}
export function buildWorld(scene) {
  const random = rng(COURSE.seed), staticColliders = [];
  // Continuous irregular forest floor; central earth passage, not a paved race track.
  const pos = [], colors = [], idx = [], columns = 24, rows = 306;
  for (let i = 0; i <= rows; i++) {
    const z = -100 + i * 8;
    for (let j = 0; j <= columns; j++) {
      const off = (j / columns - .5) * 440, w = widthAt(z);
      const shoulder = Math.max(0, Math.abs(off) - w) / 45;
      const y = groundY(z) + Math.min(1, shoulder) * (Math.sin(z * .035 + off * .06) * 3 + Math.sin(off * .08) * 2) - .12;
      pos.push(centerX(z) + off, y, z);
      const color = new T.Color(Math.abs(off) < w ? 0x96917c : 0x707361); color.multiplyScalar(.85 + random() * .24); colors.push(color.r,color.g,color.b);
      if (i < rows && j < columns) { const a = i * (columns + 1) + j, b = a + columns + 1; idx.push(a,b,a+1,a+1,b,b+1); }
    }
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos,3)); geo.setAttribute('color', new T.Float32BufferAttribute(colors,3)); geo.setIndex(idx); geo.computeVertexNormals();
  const ground = new T.Mesh(geo,materials.ground); ground.receiveShadow = true; scene.add(ground);
  const trunks = [], branches = [], rocks = [];
  for (let i = 0; i < 1450; i++) {
    const z = -80 + random() * 2450, side = random() < .5 ? -1 : 1;
    const off = side * (widthAt(z) + 8 + random() ** 1.7 * 160), x = centerX(z) + off, y = groundY(z) - .2;
    const height = 13 + random() * 25, radius = .55 + random() * 1.7;
    const a = new T.Vector3(x,y,z), b = new T.Vector3(x + (random()-.5)*5,y+height,z+(random()-.5)*4);
    trunks.push(segmentMatrix(a,b,radius,radius*.85));
    for(let k=0;k<3;k++) {
      const angle = random()*Math.PI*2, t=.38+random()*.5, ba=a.clone().lerp(b,t), length=4+random()*10;
      const bb=ba.clone().add(new T.Vector3(Math.cos(angle)*length, length*.45,Math.sin(angle)*length));
      branches.push(segmentMatrix(ba,bb,radius*.36,radius*.22));
      const bc=bb.clone().add(new T.Vector3(Math.cos(angle+.7)*length*.6,length*.4,Math.sin(angle+.7)*length*.6));
      branches.push(segmentMatrix(bb,bc,radius*.13,radius*.09));
    }
    if (i%3===0) rocks.push({x:x+(random()-.5)*5,y:y+.8,z,w:2+random()*4,h:1+random()*3,d:2+random()*4});
    if (Math.abs(off) < widthAt(z)+18) staticColliders.push({x,z,r:radius+1});
  }
  function instances(geometry, mat, matrices) { const m = new T.InstancedMesh(geometry,mat,matrices.length); matrices.forEach((v,i)=>m.setMatrixAt(i,v)); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; }
  instances(cylinder, materials.bark, trunks); instances(cylinder, materials.bark, branches);
  const rm = new T.Matrix4(), rq = new T.Quaternion(); instances(new T.IcosahedronGeometry(1,0), materials.stone, rocks.map(r=>rm.compose(new T.Vector3(r.x,r.y,r.z),rq.setFromEuler(new T.Euler(random(),random(),random())),new T.Vector3(r.w,r.h,r.d)).clone()));
  // The old heart: a genuine two-way fork, not a painted chicane.
  const heartZ=1050, heartX=centerX(heartZ), heartY=groundY(heartZ);
  const stump = new T.Mesh(new T.CylinderGeometry(7,10,13,9,1),materials.bark); stump.position.set(heartX,heartY+5,heartZ); stump.castShadow=true; scene.add(stump); staticColliders.push({x:heartX,z:heartZ,r:10});
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const m=new T.Mesh(cylinder,materials.bark);const start=new T.Vector3(heartX+Math.cos(a)*6,heartY+2,heartZ+Math.sin(a)*6),end=new T.Vector3(heartX+Math.cos(a)*15,heartY+.3,heartZ+Math.sin(a)*15);m.matrixAutoUpdate=false;m.matrix.copy(segmentMatrix(start,end,1.8));scene.add(m);}
  // Sparse survey markers communicate scale, not racing lanes.
  for (let z=100; z<2200; z+=100) {const x=centerX(z)+widthAt(z)+3,y=groundY(z);box(scene,materials.pale,x,y+1.3,z,.8,2.6,.7); const plate=new T.Mesh(new T.PlaneGeometry(1.9,1.9),label(String(z/100).padStart(2,'0')));plate.position.set(x,y+2,z-.42);plate.rotation.y=Math.PI;scene.add(plate);}
  BEATS.forEach((b,i)=>{const z=b.start+16, x=centerX(z)-widthAt(z)-4,y=groundY(z);box(scene,materials.stone,x,y+3,z,2.2,6,1.3);const p=new T.Mesh(new T.PlaneGeometry(2,2),label(String(i+1).padStart(2,'0')));p.position.set(x,y+4,z-.7);p.rotation.y=Math.PI;scene.add(p);});
  const entry=buildGate(scene,-40,'01'); const exit=buildGate(scene,COURSE.length,'02');
  // The garden and its next-world landing are loaded alongside the forest.
  const garden=buildGarden(scene);
  return { staticColliders, portal:exit.surface, entry, exit, garden };
}
export function buildGate(scene,z,num) {
  const x=centerX(z),y=groundY(z),group=new T.Group(); group.position.set(x,y,z);scene.add(group);
  for(const side of [-1,1]) {for(let j=0;j<4;j++){const m=box(group,materials.stone,side*(11.7+(j%2)*.2),j*4+2,0,4.8,3.9,5.5);m.rotation.z=side*.018;}box(group,materials.pale,side*12,.2,-2,7,.8,10);}
  box(group,materials.pale,0,17.1,0,28,3.3,6);box(group,materials.stone,0,19.2,0,21,1,5);
  const surface=new T.Mesh(new T.PlaneGeometry(18.5,14),new T.MeshBasicMaterial({color:0xc1c6ac,side:T.DoubleSide}));surface.position.set(0,7.1,0);group.add(surface);
  const plate=new T.Mesh(new T.PlaneGeometry(3,2.5),label(num));plate.position.set(0,17.2,-3.03);plate.rotation.y=Math.PI;group.add(plate);
  return { group, surface };
}
export function buildCar(scene) {
  const car=new T.Group();scene.add(car);
  box(car,materials.dark,0,.62,0,2.2,.5,4.5);box(car,materials.car,0,1.02,0,2.15,.7,4.4);
  const cabin=box(car,materials.glass,0,1.64,-.25,1.8,.8,2.15);cabin.rotation.x=.04;
  box(car,materials.car,0,2.08,-.35,1.9,.12,1.65);box(car,materials.car,0,1.44,1.55,2.08,.12,1.2);
  box(car,materials.dark,0,.85,2.26,1.6,.3,.08);box(car,materials.dark,0,.8,-2.26,2.3,.25,.12);
  for(const x of [-.76,.76])box(car,materials.pale,x,1.13,2.23,.4,.2,.09);
  const wheels=[];for(const x of [-1.12,1.12])for(const z of [-1.38,1.4]){const wheel=new T.Group();wheel.position.set(x,.6,z);const tire=new T.Mesh(new T.CylinderGeometry(.59,.59,.4,12),materials.dark);tire.rotation.z=Math.PI/2;wheel.add(tire);const hub=new T.Mesh(new T.CylinderGeometry(.29,.29,.415,8),materials.stone);hub.rotation.z=Math.PI/2;wheel.add(hub);car.add(wheel);wheels.push(wheel);}
  car.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return { car,wheels };
}
// One merged tube mesh per root system. Forks share their parent's actual moving node.
// Fixed topology / pooled nodes: growing the forest does not allocate geometry each frame.
export function buildRootVisuals(scene, roots) {
  return roots.map(root => {
    const rings = 14, sides = 6, stride = (rings + 1) * (sides + 1), indices = [];
    for (let branch = 0; branch < ROOT_LIMITS.branches; branch++)
      for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
        const a = branch * stride + i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(ROOT_LIMITS.branches * stride * 3),3).setUsage(T.DynamicDrawUsage));
    geometry.setIndex(indices);
    const mesh = new T.Mesh(geometry,materials.root);mesh.castShadow=true;mesh.visible=false;mesh.geometry.boundingSphere=new T.Sphere(new T.Vector3(root.x,groundY(root.z)+10,root.z),100);scene.add(mesh);
    const nodes = new T.InstancedMesh(new T.IcosahedronGeometry(1,1),materials.root,ROOT_LIMITS.branches);
    nodes.instanceMatrix.setUsage(T.DynamicDrawUsage);nodes.castShadow=true;nodes.boundingSphere=mesh.geometry.boundingSphere.clone();mesh.add(nodes);
    const warning = new T.Group();scene.add(warning);
    const random=rng(root.id*79+431);
    for(let j=0;j<9;j++){
      const angle=random()*Math.PI*2, radius=.5+random()*2.5;
      const crack=box(warning,materials.dark,Math.cos(angle)*radius,0,Math.sin(angle)*radius,.12,.08,.7+random()*1.7);
      crack.rotation.y=angle;crack.castShadow=false;
    }
    const dirt=new T.Mesh(new T.IcosahedronGeometry(1,1),materials.root);warning.add(dirt);
    return {mesh,nodes,warning,dirt,rings,sides,stride};
  });
}
const axis=new T.Vector3(),sideVec=new T.Vector3(),normal=new T.Vector3();
const up=new T.Vector3(0,1,0),horizontal=new T.Vector3(1,0,0),nodeMatrix=new T.Matrix4();
export function updateRootVisual(root,visual,time,preview=false) {
  const previewAge=root.previewAge+(time%38);
  const sample=preview?{...root,age:previewAge,preGrown:false}:root;
  const frames=rootFrames(sample,time),{mesh,nodes,warning,dirt,rings,sides,stride}=visual;
  mesh.visible=frames.some(f=>f.visible);
  warning.visible=sample.age>=0||sample.preGrown;
  warning.position.set(root.x,groundY(root.z)-.06,root.z);
  if(warning.visible){
    const rumble=sample.age<root.warning?Math.sin(time*31+root.phase)*.08:0;
    dirt.position.y=.08+rumble;
    dirt.scale.set(1.8+frames[0].girth,.2+frames[0].girth*.38,1.6+frames[0].girth);
  }
  if(!mesh.visible)return;
  const radius=85*(1+.3*Math.log1p(Math.max(0,sample.age)/6));
  mesh.geometry.boundingSphere.center.set(root.x,groundY(root.z)+10,root.z);mesh.geometry.boundingSphere.radius=radius;
  nodes.boundingSphere.copy(mesh.geometry.boundingSphere);
  const positions=mesh.geometry.attributes.position.array;let nodeCount=0;
  for(let branch=0;branch<ROOT_LIMITS.branches;branch++){
    const frame=frames[branch],active=frame?.visible;
    for(let i=0;i<=rings;i++){
      const u=i/rings,p=active?branchPoint(frame,u):{x:root.x,y:groundY(root.z)-4,z:root.z};
      let radius=0;
      if(active){
        const next=branchPoint(frame,Math.min(1,u+.005)),prev=branchPoint(frame,Math.max(0,u-.005));
        axis.set(next.x-prev.x,next.y-prev.y,next.z-prev.z).normalize();
        // A vertical sprout must not collapse its tube frame when aligned with world up.
        sideVec.crossVectors(axis,Math.abs(axis.y)>.94?horizontal:up).normalize();
        normal.crossVectors(sideVec,axis).normalize();radius=rootRadius(frame,u);
      }
      for(let j=0;j<=sides;j++){
        const angle=j/sides*Math.PI*2,c=Math.cos(angle)*radius,s=Math.sin(angle)*radius;
        const k=(branch*stride+i*(sides+1)+j)*3;
        positions[k]=p.x+(active?sideVec.x*c+normal.x*s:0);
        positions[k+1]=p.y+(active?sideVec.y*c+normal.y*s:0);
        positions[k+2]=p.z+(active?sideVec.z*c+normal.z*s:0);
      }
    }
    if(active){
      const r=Math.max(.001,frame.girth*(branch?1.25:.8)),origin=frame.origin;
      nodeMatrix.makeScale(r,r*.85,r);nodeMatrix.setPosition(origin.x,origin.y,origin.z);nodes.setMatrixAt(nodeCount++,nodeMatrix);
    }
  }
  nodes.count=nodeCount;nodes.instanceMatrix.needsUpdate=true;
  mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeVertexNormals();
  // Unused pooled branches are degenerate; provide valid normals for static glTF interchange.
  const normals=mesh.geometry.attributes.normal.array;
  for(let i=0;i<normals.length;i+=3)if(normals[i]*normals[i]+normals[i+1]*normals[i+1]+normals[i+2]*normals[i+2]<.000001)normals[i+1]=1;

}
