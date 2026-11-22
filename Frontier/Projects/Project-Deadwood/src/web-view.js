import * as T from 'three';
import {strandPoint,strandFrame,threadBlend,supportProgress,gust} from './web-level.js';
import {rng} from './level.js';
import {knotWeave} from './web-weave.js';
export function createWebView(scene,web){const root=new T.Group();scene.add(root);const silk=new T.MeshStandardMaterial({color:'#d0c9ac',roughness:.95,side:T.DoubleSide,transparent:true,opacity:.25,depthWrite:false}),stone=new T.MeshStandardMaterial({color:'#555b55',roughness:1}),dark=new T.MeshStandardMaterial({color:'#303d39',roughness:1}),fiber=new T.LineBasicMaterial({color:'#e4dcc3',transparent:true,opacity:.85}),ribbons=[],filaments=[],supports=[];
 const random=rng(73),rockGeo=new T.IcosahedronGeometry(1,1);
 function rock(x,y,z,sx,sy,sz){const o=new T.Mesh(rockGeo,stone);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.y=random()*6;root.add(o);}
 for(let i=0;i<65;i++)rock((i%2?1:-1)*(165+random()*100),-30,-80+random()*1270,35+random()*65,60+random()*70,30+random()*70);for(let i=0;i<45;i++)rock((random()-.5)*550,-100,random()*1300,40,20+random()*20,40);
 const floor=new T.Mesh(new T.PlaneGeometry(2500,2300),dark);floor.rotation.x=-Math.PI/2;floor.position.set(0,-110,500);root.add(floor);
 const steps=64;
 for(const e of web.edges){const g=new T.BufferGeometry(),idx=[];for(let i=0;i<steps;i++)for(let strip=0;strip<2;strip++){const n=i*4+strip*2;idx.push(n,n+1,n+4,n+1,n+5,n+4);}g.setAttribute('position',new T.BufferAttribute(new Float32Array((steps+1)*4*3),3));g.setIndex(idx);const mesh=new T.Mesh(g,silk.clone());mesh.frustumCulled=false;root.add(mesh);ribbons.push({e,mesh});const lines=new T.LineSegments(new T.BufferGeometry(),fiber);lines.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(800*6),3));lines.frustumCulled=false;root.add(lines);filaments.push({e,lines});
  if(e.kind==='damaged'){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(18*6),3));const o=new T.LineSegments(g,fiber.clone());o.frustumCulled=false;root.add(o);supports.push({e,o});}
 }
 for(const n of web.nodes){const g=new T.Group();g.position.set(n.x,n.y,n.z);root.add(g);const weave=knotWeave(n),shape=new T.Shape(weave.outline.map(p=>new T.Vector2(p.x,-p.z))),disk=new T.Mesh(new T.ShapeGeometry(shape),silk);disk.rotation.x=-Math.PI/2;disk.position.y=.025;g.add(disk);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(weave.segments,3));g.add(new T.LineSegments(geo,fiber));if(n.row===0||n.row===10)rock(n.x,n.y-16,n.z,19,16,21);
  if(n.lane===0||n.lane===2)root.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(n.x,n.y,n.z),new T.Vector3(Math.sign(n.x)*180,n.y+35,n.z+12)]),fiber));}
 rock(240,12,1170,55,16,65);const landing=new T.Mesh(new T.CircleGeometry(40,32),silk);landing.rotation.x=-Math.PI/2;landing.position.set(240,28,1170);root.add(landing);
 const gateMat=new T.MeshStandardMaterial({color:'#8f8a72',roughness:1});for(const n of web.nodes.filter(n=>n.row===10)){for(const side of [-1,1]){const o=new T.Mesh(new T.CylinderGeometry(.8,1.2,8,8),gateMat);o.position.set(n.x+side*5,n.y+4,n.z+2);root.add(o);}const beam=new T.Mesh(new T.BoxGeometry(12,1.5,1.5),gateMat);beam.position.set(n.x,n.y+8,n.z+2);root.add(beam);}
 const dustGeo=new T.BufferGeometry(),dustPos=new Float32Array(180*3);for(let i=0;i<180;i++){dustPos[i*3]=(random()-.5)*220;dustPos[i*3+1]=25+random()*35;dustPos[i*3+2]=random()*1100;}dustGeo.setAttribute('position',new T.BufferAttribute(dustPos,3));const dust=new T.Points(dustGeo,new T.PointsMaterial({color:'#d9ccae',size:.15,transparent:true,opacity:.6}));root.add(dust);
 function update(s){for(let k=0;k<ribbons.length;k++){const {e,mesh}=ribbons[k],load=s.edge===e.id?s.speed/18:0,frames=Array.from({length:steps+1},(_,i)=>strandFrame(e,i/steps,s.time,load)),pos=mesh.geometry.attributes.position.array;
  function widths(t,strip){const blend=threadBlend(e,t),sign=strip?1:-1;return{centre:sign*(e.width/4*(1-blend)+.99*blend),half:e.width/4*(1-blend)+.36*blend};}
  function xyz(i,offset){const f=frames[i];if(s.edge===e.id&&e.kind==='twin'){const d=i/steps-s.edgeT,stretch=Math.max(-.7,Math.min(.7,(s.offset+d*f.metric*Math.tan(s.heading))*Math.exp(-((d/.045)**2))));offset+=stretch*threadBlend(e,i/steps);}return [f.p.x+f.right.x*offset,f.p.y+.025,f.p.z+f.right.z*offset];}
  for(let i=0;i<=steps;i++)for(let strip=0;strip<2;strip++){const {centre,half}=widths(i/steps,strip);for(let side=0;side<2;side++)pos.set(xyz(i,centre+(side?half:-half)),(i*4+strip*2+side)*3);}
  mesh.material.color.set(e.kind==='damaged'?'#b5a27d':e.kind==='vertical'?'#d4c8a7':'#d0c9ac');mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeVertexNormals();const {lines}=filaments[k],out=lines.geometry.attributes.position.array;let at=0;function segment(i,a,j,b){out.set(xyz(i,a),at);at+=3;out.set(xyz(j,b),at);at+=3;}
  for(let strip=0;strip<2;strip++){
   for(let lane=0;lane<3;lane++)for(let i=0;i<steps;i++){const a=widths(i/steps,strip),b=widths((i+1)/steps,strip),roughA=Math.sin(i*.83+e.phase)*.035,roughB=Math.sin((i+1)*.83+e.phase)*.035;segment(i,a.centre+(lane-1)*a.half+roughA,i+1,b.centre+(lane-1)*b.half+roughB);}
   if(e.weave==='crosslace'){for(let i=0;i<steps;i+=2){const j=Math.min(steps,i+2),a=widths(i/steps,strip),b=widths(j/steps,strip);segment(i,a.centre-a.half,j,b.centre+b.half);segment(i,a.centre+a.half,j,b.centre-b.half);}}
   else if(e.weave==='chevron'){for(let i=0;i<steps-1;i+=2){const j=i+1,a=widths(i/steps,strip),b=widths(j/steps,strip);segment(i,a.centre-a.half,j,b.centre);segment(i,a.centre+a.half,j,b.centre);}}
   else if(e.weave==='fan'){for(let i=0;i<steps-6;i+=6){const a=widths(i/steps,strip);for(let j=i+2;j<=i+6;j+=2){const b=widths(j/steps,strip);segment(i,a.centre-a.half,j,b.centre+b.half);}}}
   else if(e.weave==='braid'){for(let i=0;i<steps;i++){const a=widths(i/steps,strip),b=widths((i+1)/steps,strip),v=Math.sin(i*.7),w=Math.sin((i+1)*.7);segment(i,a.centre+v*a.half,i+1,b.centre+w*b.half);segment(i,a.centre-v*a.half,i+1,b.centre-w*b.half);}}
   else{for(let i=0;i<=steps;i++){if((i+e.id)%4===0)continue;const a=widths(i/steps,strip);segment(i,a.centre-a.half,i,a.centre+a.half);}}
  }
  lines.geometry.setDrawRange(0,at/3);lines.geometry.attributes.position.needsUpdate=true;

 }
 for(const {e,o} of supports){const p=strandPoint(e,.5,s.time),anchor={x:(e.a.x+e.b.x)/2,y:Math.max(e.a.y,e.b.y)+37,z:(e.a.z+e.b.z)/2},out=o.geometry.attributes.position.array,progress=supportProgress(e,s.time),age=s.time-e.damageAt;for(let i=0;i<18;i++){const strand=i%3,broken=Number.isFinite(e.damageAt)&&age>strand+1,side=(strand-1)*.26,top={...anchor,x:anchor.x+side},bottom=broken?{x:p.x+side+Math.sin(s.time*3+i)*progress*2,y:anchor.y-8-i*.6,z:anchor.z+Math.sin(i)*progress*3}:{...p,x:p.x+side};out.set([top.x,top.y,top.z,bottom.x,bottom.y,bottom.z],i*6);}o.geometry.attributes.position.needsUpdate=true;o.material.color.set(Number.isFinite(e.damageAt)?'#c5a57c':'#ded6bd');}
 dust.position.x=gust(s.time)*3;}
 return {root,update};}
