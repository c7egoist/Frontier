import './style.css';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COURSE, BEATS, clamp, centerX, groundY, widthAt, tangent, beatAt, createHazards, advanceHazards, collidesRoot, ROOT_LIMITS } from './course.js';
import { GARDEN, createPlants, mouthCentre, collidesClosedMouth, collidesMaze, advancePlants, gardenExit } from './garden.js';
import { gardenGround,gardenTerrain,constrainGardenCamera } from './garden-terrain.js';
import { createFireflies,advanceFireflies } from './fireflies.js';
import { createHull,applyHullDamage } from './garden-combat.js';
import { updateGardenVisuals } from './garden-world.js';
import {constrainGlacierCamera} from './glacier-camera.js';
import { buildGlacier,updateGlacierVisuals } from './glacier-world.js';
import { GLACIER,GLACIER_BEATS,glacierCentre,glacierY,glacierSpawn,advanceCrystalStorm,glacierSurface,glacierObstacle,glacierSupported,createGlacierState,stepGlacierVehicle,advanceGlacier } from './glacier.js';
import {buildScrapyard,updateScrapyardVisuals} from './scrapyard-world.js';
import {YARD,YARD_BEATS,yardCentre,yardY,createYardState,yardSpawn,stepYardVehicle,advanceYard,constrainYardCamera} from './scrapyard.js';
import { buildDebris } from './debris.js';
import { stepVehicle } from './vehicle.js';
import { buildWorld, buildCar, buildRootVisuals, updateRootVisual } from './world.js';
const $=id=>document.getElementById(id), canvas=$('world');
const scene=new T.Scene();scene.background=new T.Color(0xa5ad99);scene.fog=new T.Fog(0xa5ad99,95,460);
let renderer;
try { renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); }
catch(e){$('loading').textContent='WebGL is required. Please open this study in a desktop browser with hardware acceleration.';throw e;}
const draftQuality=new URLSearchParams(location.search).get('quality')==='draft';
renderer.setPixelRatio(Math.min(devicePixelRatio,draftQuality?.75:1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=!draftQuality;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const camera=new T.PerspectiveCamera(62,innerWidth/innerHeight,.15,5000);
const controls=new OrbitControls(camera,canvas);controls.enabled=false;controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=16;controls.maxDistance=2500;
const skyLight=new T.HemisphereLight(0xdbe2cc,0x494739,2.25);scene.add(skyLight);
const sun=new T.DirectionalLight(0xffe5b4,3.1);sun.position.set(-100,150,80);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-85,right:85,top:85,bottom:-85,near:1,far:380});sun.shadow.bias=-.0004;sun.shadow.normalBias=.08;scene.add(sun);scene.add(sun.target);
const world=buildWorld(scene), vehicle=buildCar(scene), debris=buildDebris(scene,(z,x)=>x>600&&x<1200?gardenTerrain(x,z,world.garden.maze):x>=1200?0:groundY(z));
const garden=world.garden,glacier=buildGlacier(scene),yard=buildScrapyard(scene);
for(const surface of [garden.portal,glacier.exit.plane,yard.exit.plane]){surface.material.map=null;surface.material.color.set(0xd2dcdf);}
const rootSettings={rate:1,growth:1,count:ROOT_LIMITS.systems};let forestSeed=COURSE.seed;
let roots=createHazards(forestSeed),rootVisuals=buildRootVisuals(scene,roots);
const chasingRoots=createHazards(COURSE.seed+900,7);
chasingRoots.forEach((r,i)=>{r.pursuitOffset=(i/6-.5)*widthAt(0)*1.7;r.age=18;r.preGrown=true;});
const chaseVisuals=buildRootVisuals(scene,chasingRoots);
function rebuildForest(){
  for(const v of rootVisuals){scene.remove(v.mesh,v.warning);v.mesh.geometry.dispose();v.nodes.geometry.dispose();}
  roots=createHazards(forestSeed,rootSettings.count);rootVisuals=buildRootVisuals(scene,roots);debris.clear();
}
// Route line is an editor overlay only: it never appears during a run.
const guidePoints=[];for(let z=0;z<=COURSE.length;z+=10)guidePoints.push(new T.Vector3(centerX(z),groundY(z)+.35,z));
const routeGuide=new T.Line(new T.BufferGeometry().setFromPoints(guidePoints),new T.LineBasicMaterial({color:0xe2c38a,depthTest:false,transparent:true,opacity:.8}));routeGuide.visible=false;routeGuide.renderOrder=3;scene.add(routeGuide);
const portalTarget=new T.WebGLRenderTarget(512,512),portalCamera=new T.PerspectiveCamera(65,18.5/14,.2,700);
world.portal.material.map=portalTarget.texture;world.portal.material.color.set(0xffffff);world.portal.material.needsUpdate=true;
for(const surface of [garden.portal,glacier.exit.plane,yard.exit.plane]){surface.material.map=portalTarget.texture;surface.material.color.set(0xffffff);}
portalCamera.position.set(COURSE.destination.x,7,COURSE.destination.z-40);portalCamera.lookAt(COURSE.destination.x,6,COURSE.destination.z+80);
const keys=new Set();
let hull=createHull(),gardenSeed=3511,impactUntil=0;
let mode='intro',capture=null,forestTime=0,gardenTime=0,time=0,rootTime=0,runTime=0,accumulator=0,worldIndex=3,hasMoved=false,complete=false,failed=false,rootsPaused=false,sectionTest=false,bonnet=false,hitCooldown=0,noticeUntil=0,front=-170,inspectionFrom='intro',beatIndex=-1;
const car={x:centerX(0),z:0,speed:0,heading:tangent(0)};
const clock=new T.Clock(),cameraPosition=new T.Vector3(),lookTarget=new T.Vector3(),targetLook=new T.Vector3();
function notify(text,seconds=3){$('notice').textContent=text;noticeUntil=time+seconds;$('notice').classList.add('visible');}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;}
function floorAt(x,z){return worldIndex===1?gardenGround(x,z):worldIndex===2?glacierY(z-GLACIER.z):worldIndex===3?yardY(x,z):worldIndex===4?0:groundY(z);}
function syncCar(){
  if(capture){const p=garden.plants[capture.id],m=mouthCentre(p),t=clamp(capture.age/1.7,0,1),q=t*t*(3-2*t);vehicle.car.position.set(capture.x+(m.x-capture.x)*q,p.y-q*4,capture.z+(m.z-capture.z)*q);vehicle.car.scale.setScalar(1-q*.97);vehicle.car.visible=t<.98;return;}
  vehicle.car.position.set(car.x,floorAt(car.x,car.z)+(worldIndex===3?(car.y||0):0),car.z);
  if(worldIndex===2&&glacier.state.failed&&!glacierSupported(car.x,car.z,glacier.state)){const t=glacier.state.failureAge;vehicle.car.position.y-=Math.min(32,t*t*8);vehicle.car.rotation.set(t*.4,car.heading,t*.25);vehicle.car.visible=t<2;return;}
  const dx=Math.sin(car.heading),dz=Math.cos(car.heading),pitch=(floorAt(car.x+dx*2,car.z+dz*2)-floorAt(car.x-dx*2,car.z-dz*2))/4;
  const roll=(floorAt(car.x+dz,car.z-dx)-floorAt(car.x-dz,car.z+dx))/2;
  vehicle.car.rotation.set(-Math.atan(pitch),car.heading,Math.atan(roll)*.8);
  if(worldIndex===3&&(car.y||0)>.3){vehicle.car.rotation.z+=Math.sin(time*5)*Math.min(.35,car.y*.035);vehicle.car.rotation.x+=.1;}
}
function resetRun(z=0,test=false){
  $('study-forest').classList.add('active');$('study-garden').classList.remove('active');$('study-glacier').classList.remove('active');$('study-yard').classList.remove('active');
  worldIndex=0;car.vx=0;car.vz=0;car.y=0;car.vy=0;impactUntil=0;capture=null;vehicle.car.visible=true;vehicle.car.scale.setScalar(1);car.x=centerX(z);car.z=z;car.heading=tangent(z);car.speed=0;runTime=0;rootTime=0;front=z-170;hasMoved=false;complete=false;failed=false;hitCooldown=0;rootsPaused=false;sectionTest=test;beatIndex=-1;
  rebuildForest();roots.forEach(r=>{if(r.z<z-30)r.age=20;});
  $('run-label').textContent=test?'SECTION TEST':'RUN TIME';$('pause-roots').textContent='PAUSE ROOT GROWTH';syncCar();
}
function enterDrive(reset=false){
  if(reset){if(worldIndex>=3)resetYard();else if(worldIndex===2)resetGlacier();else if(worldIndex===1)resetGarden();else resetRun();}mode='drive';controls.enabled=false;routeGuide.visible=false;garden.trail.visible=false;glacier.guide.visible=false;glacier.roofs.visible=true;yard.guide.visible=false;
  $('intro').hidden=true;$('route-card').hidden=true;$('map-panel').hidden=true;$('hud').hidden=false;document.body.classList.add('driving');
  setAtmosphere();scene.fog.near=worldIndex===1?32:70;scene.fog.far=worldIndex===1?235:worldIndex>=2?390:460;garden.organic.skins.visible=true;camera.fov=62;camera.updateProjectionMatrix();snapCamera();
  if(reset&&worldIndex===3)notify('Choose your alleys. Live magnets pull the car as well as the scrap.',5);
  else if(reset&&worldIndex===2)notify('No fixed route. Read the ice, choose a gap, watch the incoming shower.',5);
  else if(reset)notify(worldIndex?'Keep clear of the jaws. Find the far gate.':'Keep moving. The roots are waking.',3.5);
}
function snapCamera(){const behind=bonnet?-.95:worldIndex===1?10:15;camera.position.set(car.x-Math.sin(car.heading)*behind,floorAt(car.x,car.z)+(bonnet?2.35:worldIndex===1?4.8:7.5),car.z-Math.cos(car.heading)*behind);lookTarget.set(car.x+Math.sin(car.heading)*24,floorAt(car.x,car.z+25)+2,car.z+Math.cos(car.heading)*24);camera.lookAt(lookTarget);}
function inspect(){
  if(mode==='inspect'){enterDrive();return;}
  inspectionFrom=mode;mode='inspect';keys.clear();car.speed=0;car.vx=0;car.vz=0;controls.enabled=true;routeGuide.visible=worldIndex===0;garden.trail.visible=worldIndex===1;
  $('intro').hidden=true;$('route-card').hidden=true;$('hud').hidden=false;$('map-panel').hidden=false;document.body.classList.add('driving');scene.fog.near=1400;scene.fog.far=4200;
  if(worldIndex>=3){
    if(inspectionFrom==='intro'||worldIndex===4)resetYard(true);
    controls.target.set(YARD.x,0,YARD.z+900);camera.position.set(YARD.x+620,1250,YARD.z+220);yard.guide.visible=true;
  }else if(worldIndex===2){
    if(inspectionFrom==='intro')resetGlacier(true);
    controls.target.set(GLACIER.x,0,GLACIER.z+1050);camera.position.set(GLACIER.x+650,1550,GLACIER.z+250);glacier.guide.visible=true;glacier.roofs.visible=false;
  }else if(worldIndex===1){
    if(inspectionFrom==='intro')resetGarden();
    controls.target.set(GARDEN.x,0,GARDEN.z+235);camera.position.set(GARDEN.x+260,620,GARDEN.z+50);
  }else if(inspectionFrom==='intro'){resetRun();roots.forEach(r=>r.age=20);controls.target.set(0,0,1100);camera.position.set(430,1660,450);}
  else{controls.target.set(car.x,0,car.z+80);camera.position.set(car.x+120,260,car.z-100);}
  garden.trail.visible=worldIndex===1;garden.organic.skins.visible=false;configureInspector();controls.update();
  sectionTest=true;if(!complete)$('run-label').textContent='SECTION TEST';
  $('objective-title').textContent=worldIndex===3?'Inspect the working scrapyard':worldIndex===2?'Inspect the glacier passage':worldIndex===1?'Inspect the living maze':'Inspect the greybox';$('objective-sub').textContent=worldIndex===3?'Orbit the working machinery. Magnets and falling loads remain physical.':worldIndex===2?'Cutaway view. Section jumps and demonstrations are marked tests.':'Hazards run here; driving and the run clock are paused.';
}
function toggleRoots(){rootsPaused=!rootsPaused;if(!sectionTest&&!complete){sectionTest=true;$('run-label').textContent='SECTION TEST';} $('pause-roots').textContent=rootsPaused?'RESUME HAZARDS':(worldIndex>=3?'PAUSE YARD MACHINERY':worldIndex===2?'PAUSE ICE HAZARDS':worldIndex===1?'PAUSE PLANTS & INSECTS':'PAUSE ROOT GROWTH');notify(rootsPaused?'Hazards paused · untimed test':'Hazards resumed · untimed test');}
$('start-button').onclick=()=>enterDrive(true);$('inspect-button').onclick=inspect;$('return-drive').onclick=()=>enterDrive();$('pause-roots').onclick=toggleRoots;
function configureInspector(){
  $('root-lab').hidden=worldIndex!==0;$('garden-lab').hidden=worldIndex!==1;$('glacier-lab').hidden=worldIndex!==2;$('yard-lab').hidden=worldIndex!==3;
  $('map-panel').querySelector('h2').textContent=worldIndex===3?'A yard of competing gaps.':worldIndex===2?'A way across the ice.':worldIndex===1?'Blind bends. Living tunnels.':'A forest, not a pattern.';
  $('beat-list').replaceChildren();
  const choices=worldIndex===3?[...YARD_BEATS,{s:1860,name:'Far gantry / portal test'}]:worldIndex===2?[...GLACIER_BEATS,{s:1960,name:'Far portal / transfer test'}]:worldIndex===1?[{name:'Ambush approach',index:0},{name:'The root tunnels',index:10},{name:'Firefly hollows',index:22},{name:'Far gate / portal test',index:28}]:BEATS;
  choices.forEach((beat,i)=>{const b=document.createElement('button');b.innerHTML=`<span>0${i+1}</span>${beat.name.toUpperCase()}`;
    b.onclick=()=>{
      if(worldIndex===3){resetYard(true,beat.s);controls.target.set(car.x,0,car.z+60);camera.position.set(car.x+100,160,car.z-60);yard.guide.visible=true;}
      else if(worldIndex===2){resetGlacier(true,beat.s);controls.target.set(car.x,0,car.z+80);camera.position.set(car.x+100,180,car.z-70);glacier.guide.visible=true;glacier.roofs.visible=false;}
      else if(worldIndex===1){resetGarden(true);const p=garden.maze.primary[beat.index];car.x=p.x;car.z=p.z;controls.target.set(p.x,0,p.z);camera.position.set(p.x+90,160,p.z-80);syncCar();}
      else{resetRun(beat.start+25,true);controls.target.set(centerX(beat.start+130),0,beat.start+130);camera.position.set(centerX(beat.start)+140,300,beat.start-70);}
      controls.update();notify(`Section test / ${beat.name}`);
    };$('beat-list').appendChild(b);
  });
}
function resetGarden(test=false,keepSpeed=false){
  const speed=keepSpeed?Math.min(car.speed,GARDEN.maxSpeed):0;
  Object.assign(car,{x:garden.maze.entry.x,z:garden.maze.entry.z,speed,heading:0,vx:0,vz:0,y:0,vy:0});
  gardenSeed=crypto.getRandomValues(new Uint32Array(1))[0];
  createPlants(garden.maze,gardenSeed).forEach((p,i)=>Object.assign(garden.plants[i],p));
  garden.fireflies=createFireflies(garden.maze,gardenSeed^9812);garden.explosions=[];hull=createHull();impactUntil=0;
  $('study-garden').classList.add('active');$('study-forest').classList.remove('active');$('study-glacier').classList.remove('active');$('study-yard').classList.remove('active');
  worldIndex=1;gardenTime=0;capture=null;failed=false;complete=false;hasMoved=keepSpeed;runTime=0;rootTime=0;rootsPaused=false;sectionTest=test;keys.clear();debris.clear();
  vehicle.car.visible=true;vehicle.car.scale.setScalar(1);$('run-label').textContent=test?'SECTION TEST':'GARDEN TIME';$('pause-roots').textContent='PAUSE PLANTS & INSECTS';syncCar();
}
function selectStudy(index){
  if(index===3)resetYard();else if(index===2)resetGlacier();else if(index===1)resetGarden();else resetRun();mode='intro';controls.enabled=false;garden.organic.skins.visible=true;garden.trail.visible=false;routeGuide.visible=false;
  $('intro').hidden=false;$('route-card').hidden=false;$('hud').hidden=true;$('map-panel').hidden=true;document.body.classList.remove('driving');
  $('study-forest').classList.toggle('active',index===0);$('study-garden').classList.toggle('active',index===1);$('study-glacier').classList.toggle('active',index===2);$('study-yard').classList.toggle('active',index===3);yard.guide.visible=false;glacier.guide.visible=false;glacier.roofs.visible=true;yard.guide.visible=false;
  $('intro').querySelector('h1').innerHTML=index?'THE<br>HUNGER<span>.</span>':'DEAD<br>WOOD<span>.</span>';
  $('intro').querySelector('.intro-sub').textContent=index?'Not everything here feeds on sunlight.':"The forest doesn't want you through.";
  $('intro').querySelector('.description').textContent=index?'Blind bends. Living tunnels. Buried mouths strike from the uneven earth. Firefly swarms flash, burst and set off their neighbours. The garden no longer waits for you.':'A one-way run through a dying forest. The ground splits. Roots rise, twist and close behind you. Find the gaps. Reach the stone gate.';
  $('intro').querySelector('.eyebrow>span').textContent=['SCENE 01 / DEADWOOD','SCENE 02 / THE HUNGER','SCENE 03 / ICEBOUND','SCENE 04 / SCRAPYARD'][index];
  $('time-kind').textContent=index===2?'MINIMUM AT TOP SPEED':'DESIGN TARGET';
  $('spec-distance').innerHTML=index?'1.15 <small>KM</small>':'2.2 <small>KM</small>';$('spec-time').innerHTML=index?'80–140 <small>SEC</small>':'50–70 <small>SEC</small>';
  $('spec-route').textContent=index?'MAIN MAZE ROUTE':'POINT TO POINT';$('spec-count').textContent=index?'03':'05';$('spec-kind').textContent=index?'LIVING THREATS':'ENCOUNTER BEATS';$('start-label').textContent=index?'ENTER THE MAZE':'ENTER THE FOREST';
  $('route-tag').innerHTML=index?'02 <span>/ CARNIVOROUS GARDEN</span>':'01 <span>/ DEAD FOREST</span>';$('route-title').textContent=index?'Do not take the bait.':'Outrun the roots.';
  $('route-summary').textContent=index?'Forest portal → living maze → far gate':'Stone gate → forest → stone gate';
  if(index===2){
    $('intro').querySelector('h1').innerHTML='ICE<br>BOUND<span>.</span>';$('intro').querySelector('.intro-sub').textContent='The sea is holding its breath.';
    $('intro').querySelector('.description').textContent='No trail to follow. Pressure ridges split the ice into interlocking channels. Grip islands, open water and frozen hulls demand different lines. Random crystal showers fall ahead; the gaps you chose will not stay open.';
    $('spec-distance').innerHTML='2.0 <small>KM</small>';$('spec-time').innerHTML='53+ <small>SEC</small>';$('spec-route').textContent='POINT TO POINT';$('spec-count').textContent='04';$('spec-kind').textContent='ENCOUNTER BEATS';$('start-label').textContent='ENTER THE GLACIER';
    $('route-tag').innerHTML='03 <span>/ GLACIER CAVE</span>';$('route-title').textContent='Never trust the same line.';$('route-summary').textContent='Blue vault → avalanche cut → frozen fleet → far cave';
  }
  if(index===3){
    $('intro').querySelector('h1').innerHTML='IRON<br>TIDE<span>.</span>';$('intro').querySelector('.intro-sub').textContent='Everything here is waiting to be lifted.';
    $('intro').querySelector('.description').textContent='Stacked wrecks. Blind metal alleys. No painted racing line. Crane magnets pull the scrap—and your car. Loads drop, booms buckle, and cargo drones dump fresh obstacles into whichever gap you thought was clear.';
    $('spec-distance').innerHTML='1.9 <small>KM</small>';$('spec-time').innerHTML='60+ <small>SEC</small>';$('time-kind').textContent='MINIMUM AT TOP SPEED';$('spec-route').textContent='POINT TO POINT';$('spec-count').textContent='08';$('spec-kind').textContent='WORKING CRANES';$('start-label').textContent='ENTER THE SCRAPYARD';
    $('route-tag').innerHTML='04 <span>/ WORKING SCRAPYARD</span>';$('route-title').textContent='The short line can lift you.';$('route-summary').textContent='Wreck courts · magnet yards · falling cargo · far gantry';
  }
  setAtmosphere();scene.fog.near=70;scene.fog.far=index===2?390:460;
}
$('study-forest').onclick=()=>selectStudy(0);$('study-garden').onclick=()=>selectStudy(1);$('study-glacier').onclick=()=>selectStudy(2);$('study-yard').onclick=()=>selectStudy(3);
$('garden-restart').onclick=()=>{resetGarden(true);enterDrive();};
function framePlant(p){controls.target.set(p.x-5,p.y+3,p.z);camera.position.set(p.x+18,p.y+15,p.z-25);controls.update();}
$('plant-demo').onclick=()=>{
  resetGarden(true);const p=garden.plants.find(p=>p.buried)||garden.plants[1];
  p.state='warning';p.timer=0;p.rise=0;car.x=p.x+11;car.z=p.z-3;car.heading=0;rootsPaused=false;syncCar();framePlant(p);notify('Buried flytrap / warning → eruption → snap',4);
};
$('feeding-demo').onclick=()=>{
  resetGarden(true);const p=garden.plants[0];p.state='windup';p.timer=0;p.rise=1;
  car.x=p.x;car.z=p.z;car.heading=0;syncCar();framePlant(p);notify('Capture test / this vehicle is inside the mouth',3);
};
function markRootTest(){sectionTest=true;$('run-label').textContent='SECTION TEST';}
for(const [id,key] of [['eruption-rate','rate'],['growth-rate','growth']]){
  $(id).addEventListener('input',()=>{rootSettings[key]=Number($(id).value);$(id+'-value').textContent=rootSettings[key].toFixed(1)+'×';markRootTest();});
}
$('root-density').addEventListener('change',()=>{
  rootSettings.count=Number($('root-density').value);$('root-density-value').textContent=String(rootSettings.count);
  resetRun(worldIndex?0:Math.max(0,car.z),true);
});
$('shuffle-roots').onclick=()=>{
  forestSeed=crypto.getRandomValues(new Uint32Array(1))[0];resetRun(worldIndex?0:Math.max(0,car.z),true);
  notify('New scattered root layout / no fixed lane');
};
$('root-demo').onclick=()=>{
  const root=roots.reduce((a,b)=>Math.abs(a.z-car.z-30)<Math.abs(b.z-car.z-30)?a:b);
  root.age=0;root.preGrown=false;rootsPaused=false;debris.clear();markRootTest();
  $('pause-roots').textContent='PAUSE ROOT GROWTH';
  controls.target.set(root.x-7,groundY(root.z)+5,root.z-6);
  camera.position.set(root.x+18,groundY(root.z)+17,root.z-35);controls.update();
  $('objective-title').textContent='An eruption, up close';$('objective-sub').textContent='Watch the ground split, nodes fork and soil lift. Growth keeps going.';
};
function showHelp(show){$('help').hidden=!show;keys.clear();clock.getDelta();}
$('help-button').onclick=()=>showHelp(true);$('close-help').onclick=()=>showHelp(false);
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='Escape'){showHelp($('help').hidden);return;}if(!$('help').hidden)return;
  if(e.code==='Enter'&&mode==='intro'){enterDrive(true);return;}
  if(e.code==='KeyR'){enterDrive(true);return;}
  if(e.code==='KeyV'){inspect();return;}
  if(e.code==='KeyC'){bonnet=!bonnet;if(mode==='drive')snapCamera();return;}
  if(e.code==='KeyP'&&mode!=='intro'){toggleRoots();return;}
  keys.add(e.code);
});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{keys.clear();clock.getDelta();accumulator=0;});
function input(...codes){return codes.some(c=>keys.has(c));}
$('firefly-demo').onclick=()=>{
  resetGarden(true);const f=garden.fireflies[0];
  car.x=f.x+2.5;car.z=f.z;car.heading=0;
  garden.plants.forEach(p=>{if(Math.hypot(p.x-car.x,p.z-car.z)<30){p.state='closed';p.timer=-100;p.closure=1;}});syncCar();framePlant({x:f.x,y:gardenGround(f.x,f.z),z:f.z});
  notify('Swarm study / nearby jaws held closed / flash → chain burst',3);
};
function damageVehicle(amount){
  if(mode==='intro'||capture||!applyHullDamage(hull,amount,gardenTime))return;
  impactUntil=time+.35;
  if(hull.value===0){failed=true;car.speed=0;keys.clear();$('run-label').textContent='VEHICLE WRECKED';notify('VEHICLE WRECKED / R to retry the garden',3600);}
}
function obstacle(x,z){
  if(worldIndex===1)return collidesMaze(x,z,garden.maze)||garden.plants.some(p=>collidesClosedMouth(p,x,z))||garden.flowers.some(f=>Math.hypot(x-f.x,z-f.z)<2.2);
  if(worldIndex===2)return false;
  if(collidesRoot(x,z,roots,rootTime))return true;
  for(const o of world.staticColliders)if(Math.abs(o.z-z)<o.r+2&&Math.hypot(x-o.x,z-o.z)<o.r+COURSE.carRadius)return true;
  return false;
}
function drive(dt){
  if(worldIndex===2){driveGlacier(dt);return;}
  if(worldIndex===3){driveYard(dt);return;}
  if(worldIndex===4)return;
  if(failed)return;
  const throttle=input('KeyW','ArrowUp'),brake=input('KeyS','ArrowDown'),hard=input('Space'),steer=(input('KeyA','ArrowLeft')?1:0)-(input('KeyD','ArrowRight')?1:0);
  if(throttle)hasMoved=true;
  const previousZ=car.z,impactSpeed=car.speed;
  const result=stepVehicle(car,{throttle,brake,hard,steer},dt,obstacle,worldIndex);
  if(result.contact&&worldIndex===1&&impactSpeed>12&&time>hitCooldown)damageVehicle(6);
  if(result.contact&&time>hitCooldown){notify(worldIndex?'Dense growth. Reverse and find a passage.':'Root contact. Reverse, then find the opening.',1.7);hitCooldown=time+2;}
  if(result.crossed){
    forestTime=runTime;resetGarden(false,true);enterDrive();
    notify(`THE HUNGER / Forest cleared in ${formatTime(forestTime)}. Same scene.`,6);return;
  }
  if(worldIndex===1&&gardenExit(previousZ,car,garden.maze)){
    resetGlacier();enterDrive();notify('ICEBOUND / The garden gate leads into the same loaded map.',6);return;
  }
  if(hasMoved&&!complete){runTime+=dt;
    if(worldIndex===0){
      if(!rootsPaused&&runTime>COURSE.pursuitDelay)front+=COURSE.pursuitSpeed*dt;
      if(car.z<front+3){failed=true;car.speed=0;notify('The forest caught you. Press R to restart.',3600);$('run-label').textContent='ROOT-BOUND';}
    }
  }
  if(!rootsPaused&&worldIndex===0){rootTime+=dt;advanceHazards(roots,car.z,dt,rootSettings);}
  syncCar();vehicle.wheels.forEach((w,i)=>{w.children.forEach(t=>t.rotation.x+=car.speed*dt/.59);if(i%2)w.rotation.y=steer*.22;});
  if(mode==='drive'){
    const current=BEATS.indexOf(beatAt(car.z));
    if(worldIndex===1){$('section-label').textContent='02 / THE HUNGER';$('objective-title').textContent='Find the far gate';$('objective-sub').textContent='Watch the soil, not the skyline. Flashing fireflies will burst.';}
    else if(worldIndex===2){$('section-label').textContent='03 / OPEN GROUND';$('objective-title').textContent='Out of the feeding ground';$('objective-sub').textContent='Both worlds crossed without a scene load. R to retry the garden.';}
    else if(current!==beatIndex){beatIndex=current;const b=BEATS[current];$('section-label').textContent=`0${current+1} / ${b.name.toUpperCase()}`;$('objective-title').textContent='Reach the exit gate';$('objective-sub').textContent=b.note;}
  }
}
function updateCamera(dt){
  if(mode==='intro'){
    if(worldIndex===3){
      const c=yard.state.cranes[0];camera.position.set(c.x+55,20,c.z-53);camera.lookAt(c.head.x,9,c.head.z+45);Object.assign(car,yardSpawn(yard.state,160));car.heading=0;syncCar();return;
    }
    if(worldIndex===2){
      const s=805;camera.position.set(glacierCentre(s)+39,14,GLACIER.z+s-38);camera.lookAt(glacierCentre(930)-8,12,GLACIER.z+945);Object.assign(car,glacierSpawn(glacier.state,815));car.heading=0;syncCar();return;
    }
    if(worldIndex===1){
      camera.position.set(GARDEN.x+32,32,GARDEN.z-18);camera.lookAt(GARDEN.x-6,5,GARDEN.z+75);const p=garden.maze.paths[0].points[5];car.x=p.x;car.z=p.z;car.heading=0;syncCar();return;
    }
    const z=1450;camera.position.set(centerX(z)+12+Math.sin(time*.055)*2,groundY(z)+8,z-34);camera.lookAt(centerX(z+48),groundY(z)+4,z+48);
    car.x=centerX(z)+2;car.z=z-5;car.heading=tangent(z);syncCar();
  }else if(mode==='inspect'){controls.update();}
  else{
    const base=floorAt(car.x,car.z)+(worldIndex===3?(car.y||0):0),behind=bonnet?-.95:worldIndex===1?10:15+Math.abs(car.speed)*.1;
    cameraPosition.set(car.x-Math.sin(car.heading)*behind,base+(bonnet?2.35:worldIndex===1?4.8:7.2)+Math.abs(car.speed)*.015,car.z-Math.cos(car.heading)*behind);
    if(worldIndex===1){const p=constrainGardenCamera(car,cameraPosition,garden.maze);cameraPosition.set(p.x,p.y,p.z);}
    camera.position.lerp(cameraPosition,1-Math.exp(-8*dt));
    if(worldIndex===3&&!bonnet){const p=constrainYardCamera(car,camera.position,yard.state);camera.position.set(p.x,p.y,p.z);}
    if(worldIndex===2&&!bonnet){const p=constrainGlacierCamera(car,camera.position,glacier.state,glacier.ships);camera.position.set(p.x,p.y,p.z);}
    if(worldIndex===1&&time<impactUntil)camera.position.x+=Math.sin(time*66)*.24;
    targetLook.set(car.x+Math.sin(car.heading)*27,floorAt(car.x+Math.sin(car.heading)*20,car.z+Math.cos(car.heading)*20)+2.2+(worldIndex===3?(car.y||0):0),car.z+Math.cos(car.heading)*27);lookTarget.lerp(targetLook,1-Math.exp(-8*dt));camera.lookAt(lookTarget);
    const fov=bonnet?70:62+Math.abs(car.speed)*.14;camera.fov=T.MathUtils.damp(camera.fov,fov,3,dt);camera.updateProjectionMatrix();
  }
}
function gardenStep(dt){
  gardenTime+=dt;
  const target=mode==='intro'?{x:GARDEN.x,z:GARDEN.z+65}:car;
  for(const e of advancePlants(garden.plants,target,dt)){
    if(e.kind==='erupt')debris.simulation.emit(e.plant.x,e.plant.y,e.plant.z,1.35,140,2);
    if(mode==='intro'||capture)continue;
    if(e.kind==='warning')notify('Soil twitch. Move now.',.6);
    if(e.kind==='aim')notify('Mouth lunging!',.5);
    if(e.kind==='capture'&&!capture&&!failed){capture={id:e.plant.id,age:0,x:car.x,z:car.z};failed=true;car.speed=0;keys.clear();$('run-label').textContent='VEHICLE CONSUMED';notify('VEHICLE CONSUMED / R to retry The Hunger',3600);}
  }
  for(const e of advanceFireflies(garden.fireflies,target,dt,gardenTime)){
    if(e.kind==='firefly-arm'&&mode!=='intro'&&!failed)notify('Fireflies flashing. Break away from the swarm.',1.2);
    if(e.kind==='firefly-explode'){
      garden.explosions.push({x:e.fly.x,y:e.fly.y,z:e.fly.z,radius:e.radius,age:0});
      if(garden.explosions.length>16)garden.explosions.shift();
      debris.simulation.emit(e.fly.x,e.fly.y,e.fly.z,1.6,150);
      if(e.damage>0&&mode!=='intro'&&!capture&&!failed){
        damageVehicle(e.damage);car.speed*=.48;
        const dx=car.x-e.fly.x,dz=car.z-e.fly.z,length=Math.hypot(dx,dz)||1,nx=car.x+dx/length*1.4,nz=car.z+dz/length*1.4;
        if(!collidesMaze(nx,nz,garden.maze)){car.x=nx;car.z=nz;}syncCar();
        if(!failed)notify(`Firefly blast / hull ${hull.value}%`,1.5);
      }
    }
  }
  garden.explosions.forEach(e=>e.age+=dt);garden.explosions=garden.explosions.filter(e=>e.age<.45);

}
let frame=0;
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.08);time+=dt;
  const active=$('help').hidden&&!document.hidden;
  if(active&&(mode==='drive'||(worldIndex===3&&mode==='inspect'&&!rootsPaused))){
    accumulator+=dt;while(accumulator>=1/90){
      if(mode==='drive')drive(1/90);else{stepYardVehicle(car,{},1/90,yard.state);advanceYard(yard.state,car,1/90);}
      accumulator-=1/90;
    }
    if(mode==='inspect')syncCar();
  }else accumulator=0;
  if(active&&worldIndex===3&&mode==='intro'&&!rootsPaused)advanceYard(yard.state,car,dt,{preview:true});
  yard.group.visible=worldIndex>=2;
  if(worldIndex===3)updateScrapyardVisuals(yard,car,time,{inspect:mode==='inspect',focus:mode==='inspect'?controls.target:null,viewRadius:mode==='inspect'?Math.max(460,camera.position.distanceTo(controls.target)*1.3):460});
  if(active&&mode==='inspect'&&!rootsPaused&&worldIndex===2){advanceGlacier(glacier.state,car,dt,glacier.ships);syncCar();}
  if(active&&mode==='intro'&&worldIndex===2){advanceCrystalStorm(glacier.state,{x:glacierCentre(815),z:GLACIER.z+815},dt);glacier.state.impacts.forEach(p=>p.age+=dt);glacier.state.impacts=glacier.state.impacts.filter(p=>p.age<2);}
  if(worldIndex===2)updateGlacierVisuals(glacier,car,time);
  if(active&&mode==='inspect'&&!rootsPaused&&worldIndex===0){rootTime+=dt;advanceHazards(roots,car.z+80,dt,rootSettings);}
  updateCamera(dt);
  roots.forEach((r,i)=>{const nearby=worldIndex===0&&(mode==='inspect'||Math.abs(r.z-(mode==='intro'?1450:car.z))<290);if(nearby)updateRootVisual(r,rootVisuals[i],mode==='intro'?time:rootTime,mode==='intro');else{rootVisuals[i].mesh.visible=false;rootVisuals[i].warning.visible=false;}});
  chasingRoots.forEach((r,i)=>{r.z=front-i*8-Math.sin(i*13)*7;r.x=centerX(r.z)+r.pursuitOffset;const visible=mode==='drive'&&!worldIndex&&hasMoved;chaseVisuals[i].mesh.visible=visible;chaseVisuals[i].warning.visible=visible;if(visible)updateRootVisual(r,chaseVisuals[i],rootTime);});
  if(active&&!rootsPaused&&worldIndex===1){
    if(capture){capture.age+=dt;syncCar();}
    gardenStep(dt);
  }
  updateGardenVisuals(garden,gardenTime);
  const simulateDebris=active&&!rootsPaused&&!failed;
  if(simulateDebris){if(worldIndex===0)debris.emitter.update(roots,mode==='intro'?time:rootTime,mode==='intro',mode==='inspect'?null:car.z);debris.simulation.update(dt);}
  debris.render();
  const shadowZ=mode==='intro'&&worldIndex===0?1450:car.z,shadowX=worldIndex?car.x:centerX(shadowZ);sun.position.set(shadowX-85,155,shadowZ+60);sun.target.position.set(shadowX,0,shadowZ+20);sun.target.updateMatrixWorld();
  frame++;
  const portalZ=worldIndex===3?YARD.z+YARD.length:worldIndex===2?GLACIER.z+GLACIER.length:worldIndex===1?garden.maze.exit.z:COURSE.length;
  if(frame%6===0&&mode!=='inspect'&&Math.abs(car.z-portalZ)<240&&worldIndex<4){
    const destination=worldIndex===3?YARD.landing:worldIndex===2?GLACIER.landing:worldIndex===1?{x:glacierCentre(0),z:GLACIER.z}:COURSE.destination;
    portalCamera.position.set(destination.x,7,destination.z-12);portalCamera.lookAt(destination.x,5,destination.z+75);
    const surface=worldIndex===3?yard.exit.plane:worldIndex===2?glacier.exit.plane:worldIndex===1?garden.portal:world.portal;
    surface.visible=false;renderer.setRenderTarget(portalTarget);renderer.render(scene,portalCamera);renderer.setRenderTarget(null);surface.visible=true;
  }
  renderer.shadowMap.needsUpdate=frame%3===0;renderer.render(scene,camera);
  if(mode!=='intro'){
    $('speed').textContent=Math.round(Math.abs(car.speed)*3.6);$('time').textContent=formatTime(runTime);
    $('distance').textContent=worldIndex===3?`${Math.max(0,Math.round(YARD.length-(car.z-YARD.z)))} M TO FAR GANTRY`:worldIndex===4?'BEYOND THE YARD / SAME MAP':worldIndex===2?`${Math.max(0,Math.round(GLACIER.length-(car.z-GLACIER.z)))} M TO FAR PORTAL`:worldIndex===1?`FAR GATE / ${Math.round(Math.hypot(car.x-garden.maze.exit.x,car.z-garden.maze.exit.z))} M DIRECT`:`${Math.max(0,Math.round(COURSE.length-car.z)).toLocaleString()} M TO GATE`;
    $('progress-fill').style.width=`${worldIndex===3?clamp((car.z-YARD.z)/YARD.length*100,0,100):worldIndex===4?100:worldIndex===2?clamp((car.z-GLACIER.z)/GLACIER.length*100,0,100):worldIndex===1?clamp((car.z-GARDEN.z)/480*100,0,100):clamp(car.z/COURSE.length*100,0,100)}%`;
  }
  $('hull').hidden=worldIndex!==1&&worldIndex!==2&&worldIndex!==3;$('hull-value').textContent=`${worldIndex===3?yard.state.hull:worldIndex===2?glacier.state.hull:hull.value}%`;updateIceTelemetry();updateYardTelemetry();$('impact').style.opacity=time<impactUntil?'0.23':'0';
  if(time>noticeUntil)$('notice').classList.remove('visible');
}
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
// Read-only diagnostics for smoke tests; gameplay state is not modified by the test interface.
window.deadwood={snapshot:()=>({mode,worldIndex,yard:yardSnapshot(),glacier:{time:glacier.state.time,front:glacier.state.front,load:glacier.state.load,hull:glacier.state.hull,failed:glacier.state.failed,complete:glacier.state.complete,surface:glacierSurface(car.x,car.z,glacier.state).kind,holes:glacier.state.holes.length,collapsedTiles:glacier.iceField.records.filter(t=>t.active&&t.drop>2).length,seed:glacier.state.seed,waves:glacier.state.waves,spawnedCrystals:glacier.state.spawnedCrystals,snowIslands:glacier.state.field.snow.length,ridges:glacier.state.field.ridges.length,openLeads:glacier.state.field.voidCells.size,brokenPlates:glacier.state.broken.size,fractures:glacier.state.fractures.size,fallingCrystals:glacier.state.crystals.filter(p=>p.state==='falling').length,warningCrystals:glacier.state.crystals.filter(p=>p.state==='warning').length,ships:glacier.ships.length,avalanches:glacier.state.avalanches.map(a=>a.state),crystals:glacier.state.crystals.map(p=>p.state),roofVisible:glacier.roofs.visible,fallAge:glacier.state.failureAge,shortcutUses:[...glacier.state.shortcutUses]},captured:capture?{id:capture.id,age:capture.age}:null,vehicleVisible:vehicle.car.visible,pose:{y:vehicle.car.position.y,pitch:vehicle.car.rotation.x,roll:vehicle.car.rotation.z},garden:{time:gardenTime,plants:garden.plants.length,eruptions:garden.plants.reduce((n,p)=>n+p.bursts,0),snaps:garden.plants.reduce((n,p)=>n+p.snaps,0),insects:garden.fireflies.length,armedFireflies:garden.fireflies.filter(f=>f.state==='armed').length,spentFireflies:garden.fireflies.filter(f=>f.state==='spent').length,hull:hull.value,seed:gardenSeed,tunnels:garden.maze.paths.filter(p=>p.tunnel).length,roofsVisible:garden.organic.skins.visible,stones:garden.maze.stones.length},car:{...car},runTime,sectionTest,rootsPaused,failed,complete,activeRoots:roots.filter(r=>r.age>=0||r.preGrown).length,rootTime,rootSettings:{...rootSettings},forestSeed,particles:debris.simulation.activeCount,emittedParticles:debris.simulation.emitted,branchCount:roots.reduce((n,r)=>n+r.branches.length,0),drawCalls:renderer.info.render.calls})};
function setAtmosphere(){
  const cold=worldIndex===2;document.body.classList.toggle('scrapyard',worldIndex>=3);document.body.classList.toggle('icebound',cold);
  scene.background.set(worldIndex>=3?0xb6ad98:cold?0xb9c8cf:0xa5ad99);scene.fog.color.copy(scene.background);
  skyLight.color.set(cold?0xdce9f1:0xdbe2cc);skyLight.groundColor.set(cold?0x526571:0x494739);sun.color.set(cold?0xebf2f5:0xffe5b4);
}
function resetGlacier(test=false,s=0){
  const fixedSeed=new URLSearchParams(location.search).get('seed');
  const seed=fixedSeed!==null&&/^\d+$/.test(fixedSeed)?Number(fixedSeed)>>>0:crypto.getRandomValues(new Uint32Array(1))[0];
  glacier.state=createGlacierState(seed);glacier.state.previousZ=GLACIER.z+s;glacier.state.stormPreview=test;
  if(s>0)glacier.state.avalanches.forEach(a=>{if(a.s<s-100)a.state='open';});
  Object.assign(car,glacierSpawn(glacier.state,s,test),{speed:0,heading:Math.atan2(glacierCentre(s+1)-glacierCentre(s-1),2),vx:0,vz:0});
  worldIndex=2;car.y=0;car.vy=0;failed=false;complete=false;capture=null;hasMoved=false;runTime=0;rootsPaused=false;sectionTest=test;hitCooldown=0;impactUntil=0;keys.clear();debris.clear();
  vehicle.car.visible=true;vehicle.car.scale.setScalar(1);$('run-label').textContent=test?'SECTION TEST':'GLACIER TIME';$('pause-roots').textContent='PAUSE ICE HAZARDS';
  for(const [id,i] of [['study-forest',0],['study-garden',1],['study-glacier',2],['study-yard',3]])$(id).classList.toggle('active',i===2);
  glacier.roofs.visible=mode!=='inspect';updateGlacierVisuals(glacier,car,time);syncCar();setAtmosphere();
}
function driveGlacier(dt){
  const state=glacier.state;
  if(state.failed){advanceGlacier(state,car,dt,glacier.ships);syncCar();return;}
  const throttle=input('KeyW','ArrowUp'),brake=input('KeyS','ArrowDown'),hard=input('Space'),steer=(input('KeyA','ArrowLeft')?1:0)-(input('KeyD','ArrowRight')?1:0);
  if(throttle)hasMoved=true;
  if(!rootsPaused){
    const result=stepGlacierVehicle(car,{throttle,brake,hard,steer},dt,state,glacier.ships);
    if(result.contact&&time>hitCooldown){notify(result.contact==='hull'?'Frozen hull. Brake, reverse and give the bow room.':'Blocked. Brake and choose another gap between the ridges.',2);hitCooldown=time+2;}
    for(const e of advanceGlacier(state,car,dt,glacier.ships)){
      if(e.kind==='crystal-warning'&&e.crystal.id%9===0&&time>hitCooldown){notify('Crystal shower ahead. Watch the dark impact shadows.',2);hitCooldown=time+4;}
      if(e.kind==='avalanche-warning')notify('Avalanche moving. Choose a wider gap away from the fall.',3);
      if(e.kind==='shortcut-open')notify('Avalanche cut open. A new choice, but fragile ice: under 79 km/h.',3);
      if(e.kind==='hit'){impactUntil=time+.35;notify(`Ice impact / hull ${state.hull}%`,1.5);}
      if(e.kind==='portal'){
        resetYard();enterDrive();notify('IRON TIDE / Through the ice portal into the same loaded map.',6);return;
      }
    }
  }
  runTime=state.time;
  if(state.failed){failed=true;car.speed=0;car.vx=0;car.vz=0;keys.clear();$('run-label').textContent='LOST TO THE ICE';notify(`${state.failed} / R to retry Icebound`,3600);}
  syncCar();vehicle.wheels.forEach(w=>w.children.forEach(t=>t.rotation.x+=car.speed*dt/.59));
  const beat=[...GLACIER_BEATS].reverse().find(b=>car.z-GLACIER.z>=b.s)||GLACIER_BEATS[0];
  $('section-label').textContent=`03 / ${beat.name.toUpperCase()}`;$('objective-title').textContent='Reach the far portal';$('objective-sub').textContent=beat.note;
}
function updateIceTelemetry(){
  $('ice-telemetry').hidden=worldIndex!==2||mode==='intro';if(worldIndex!==2)return;
  const state=glacier.state,surface=glacierSurface(car.x,car.z,state),gap=Math.max(0,car.z-GLACIER.z-state.front);
  $('ice-surface').textContent=surface.kind.toUpperCase();$('ice-limit').textContent=surface.fragile?`ICE LIMIT / ${Math.round(surface.limit*3.6)} KM/H`:'FIRM UNDER THE TYRES';
  $('ice-gap').textContent=state.started?`COLLAPSE / ${Math.round(gap)} M BEHIND`:'COLLAPSE STARTS WHEN YOU DRIVE';$('ice-load').style.width=`${Math.min(100,state.load*100)}%`;
  $('ice-danger').textContent=state.load>.65?'ICE FRACTURING — SLOW DOWN':state.load>.15?'CRACKS SPREADING':'ICE LOAD';
}
$('ice-restart').onclick=()=>{resetGlacier(true);enterDrive();};
function glacierStudy(s){resetGlacier(true,s);glacier.roofs.visible=false;controls.target.set(car.x,4,car.z+15);camera.position.set(car.x+38,45,car.z-50);controls.update();}
$('ice-break-demo').onclick=()=>{
  glacierStudy(235);
  search:for(let station=135;station<390;station+=7)for(let off=-55;off<=55;off+=3){const x=glacierCentre(station)+off,z=GLACIER.z+station;if(glacierSurface(x,z,glacier.state).fragile&&!glacierObstacleForStudy(x,z)&&glacierSupported(x,z,glacier.state)){car.x=x;car.z=z;break search;}}
  car.heading=0;car.vx=0;car.vz=38;car.speed=38;glacier.state.started=true;glacier.state.load=.55;syncCar();controls.target.set(car.x,1,car.z);camera.position.set(car.x+16,20,car.z-22);controls.update();notify('Contact strain study / branching cracks → polygon fracture → breakthrough',4);
};
function glacierObstacleForStudy(x,z){return glacierObstacle(x,z,glacier.state,glacier.ships);}
$('collapse-demo').onclick=()=>{glacierStudy(0);glacier.state.started=true;glacier.state.time=GLACIER.collapseDelay+(220-20)/GLACIER.collapseSpeed;notify('Timed collapse study / irregular plates fail behind the front',4);};
$('avalanche-demo').onclick=()=>{glacierStudy(390);notify('Avalanche study / rumble → fall → physically open shortcut',4);};
$('crystal-demo').onclick=()=>{glacierStudy(920);controls.target.set(glacierCentre(990),12,GLACIER.z+990);camera.position.set(car.x+70,45,car.z-25);controls.update();notify('Random shower study / many falling crystals / no player-selected drops',4);};

function yardSnapshot(){
 const s=yard.state;return {seed:s.seed,time:s.time,hazardTime:s.hazardTime,hull:s.hull,failed:s.failed,magnetic:s.magnetic,captured:s.captured?{...s.captured}:null,cranes:s.cranes.map(c=>({id:c.id,state:c.state,field:c.field,head:{...c.head}})),dropped:s.dropped,droneDrops:s.droneDrops,craneDrops:s.craneDrops,collapses:s.collapses,pulledObjects:s.pulledObjects,activeBodies:s.bodies.filter(b=>b.state!=='inactive').length,attachedBodies:s.bodies.filter(b=>b.state==='attached').length,airborneBodies:s.bodies.filter(b=>b.state==='falling').length,droneStates:s.drones.map(d=>d.state),blocks:s.layout.blocks.length,shacks:s.layout.blocks.filter(b=>b.kind==='shack').length,tyreHeaps:s.layout.blocks.filter(b=>b.kind==='tyres').length};
}
function resetYard(test=false,s=0){
 const fixed=new URLSearchParams(location.search).get('seed'),seed=fixed!==null&&/^\d+$/.test(fixed)?Number(fixed)>>>0:crypto.getRandomValues(new Uint32Array(1))[0];
 yard.state=createYardState(seed);yard.state.previousZ=YARD.z+s;Object.assign(car,yardSpawn(yard.state,s),{heading:Math.atan2(yardCentre(s+1)-yardCentre(s-1),2),speed:0,vx:0,vz:0,y:0,vy:0});
 worldIndex=3;failed=false;complete=false;capture=null;hasMoved=false;runTime=0;rootsPaused=false;sectionTest=test;hitCooldown=0;impactUntil=0;keys.clear();debris.clear();vehicle.car.visible=true;vehicle.car.scale.setScalar(1);
 for(const [id,i] of [['study-forest',0],['study-garden',1],['study-glacier',2],['study-yard',3]])$(id).classList.toggle('active',i===3);
 $('run-label').textContent=test?'SECTION TEST':'YARD TIME';$('pause-roots').textContent='PAUSE YARD MACHINERY';updateScrapyardVisuals(yard,car,time,{inspect:mode==='inspect',focus:mode==='inspect'?controls.target:null,viewRadius:mode==='inspect'?Math.max(460,camera.position.distanceTo(controls.target)*1.3):460});syncCar();setAtmosphere();
}
function driveYard(dt){
 const state=yard.state;
 if(!rootsPaused&&!state.failed){
  const inputData={throttle:input('KeyW','ArrowUp'),brake:input('KeyS','ArrowDown'),hard:input('Space'),steer:(input('KeyA','ArrowLeft')?1:0)-(input('KeyD','ArrowRight')?1:0)};
  const result=stepYardVehicle(car,inputData,dt,state);if(result.contact&&time>hitCooldown){notify(result.contact.kind==='loose scrap'?'Loose scrap. Light pieces can be pushed; wrecks need room.':'Stacked scrap. Reverse and choose another alley.',2);hitCooldown=time+2.5;}
  for(const e of advanceYard(state,car,dt)){
   if(e.kind==='magnet-warning'&&Math.abs(e.crane.z-car.z)<180)notify('Crane winding up. Watch the hanging load and moving metal.',2.5);
   if(e.kind==='crane-warning')notify('Crane buckling. Get clear of the boom and its load.',3);
   if(e.kind==='captured')notify('MAGNET HAS THE VEHICLE',3);
   if(e.kind==='hit'){impactUntil=time+.35;notify(`Scrap impact / hull ${state.hull}%`,1.5);}
   if(e.kind==='portal'){
    worldIndex=4;complete=true;Object.assign(car,{x:YARD.landing.x,z:YARD.landing.z,speed:0,vx:0,vz:0,y:0,vy:0,heading:0});keys.clear();$('run-label').textContent=sectionTest?'PORTAL TEST / CLEARED':'YARD CLEARED';$('section-label').textContent='BEYOND THE YARD / SAME MAP';$('objective-title').textContent='Out of the breakers';$('objective-sub').textContent='The whole journey stayed in one scene. R retries Iron Tide.';notify(`IRON TIDE CLEARED / ${formatTime(runTime)}`,7);snapCamera();return;
   }
  }
 }else if(state.failed)advanceYard(state,car,dt);
 runTime=state.time;syncCar();vehicle.wheels.forEach(w=>w.children.forEach(t=>t.rotation.x+=car.speed*dt/.59));
 const beat=[...YARD_BEATS].reverse().find(b=>car.z-YARD.z>=b.s)||YARD_BEATS[0];$('section-label').textContent=`04 / ${beat.name.toUpperCase()}`;$('objective-title').textContent='Reach the far gantry';$('objective-sub').textContent=beat.note;
 if(state.failed&&!failed){failed=true;keys.clear();$('run-label').textContent=state.captured?'MAGNET-BOUND':'VEHICLE WRECKED';notify(`${state.failed} / R for a fresh yard`,3600);}
}
function updateYardTelemetry(){
 $('yard-telemetry').hidden=worldIndex!==3||mode==='intro';if(worldIndex!==3)return;
 $('yard-field').textContent=yard.state.captured?'VEHICLE HELD':(car.y||0)>.4?'VEHICLE LIFTING':yard.state.magnetic>4?'MAGNET PULL':'NO STRONG FIELD';$('yard-pull').textContent=`ATTRACTION / ${Math.round(yard.state.magnetic)} M/S²`;
 $('yard-activity').textContent=`${yard.state.bodies.filter(b=>b.state==='falling').length} FALLING LOADS · ${yard.state.droneDrops} DRONE DROPS`;
}
function yardStudy(s){resetYard(true,s);yard.guide.visible=false;controls.target.set(car.x,8,car.z+30);camera.position.set(car.x+60,45,car.z-55);controls.update();}
$('yard-restart').onclick=()=>{resetYard(true);enterDrive();};
$('magnet-demo').onclick=()=>{
 yardStudy(210);const c=yard.state.cranes[0];c.state='pulling';c.age=-3;c.malfunction=false;c.field=1;
 Object.assign(car,{x:c.head.x+5,z:c.head.z,y:0,vy:0,vx:0,vz:0,speed:0});controls.target.set(c.head.x,8,c.head.z);camera.position.set(c.head.x+32,18,c.head.z-35);controls.update();notify('Attraction study / loose metal and this car are both physical targets',4);
};
$('crane-drop-demo').onclick=()=>{yardStudy(210);Object.assign(car,yardSpawn(yard.state,80));const c=yard.state.cranes[0];c.state='pulling';c.age=5.1;c.malfunction=false;controls.target.set(c.head.x,7,c.head.z);camera.position.set(c.head.x+35,19,c.head.z-40);controls.update();notify('Crane release study / the attached load falls and collides',4);};
$('crane-fall-demo').onclick=()=>{yardStudy(210);Object.assign(car,yardSpawn(yard.state,80));const c=yard.state.cranes[0];c.state='buckling';c.age=.3;c.field=1;controls.target.set(c.x,10,c.z);camera.position.set(c.x+65,32,c.z-55);controls.update();notify('Malfunction study / crane, magnet and attached load come down together',4);};
$('drone-demo').onclick=()=>{yardStudy(760);const d=yard.state.drones[0];Object.assign(d,{state:'transit',age:1.6,lead:100,offset:0,x:yardCentre(860),z:car.z+95,y:yardY(yardCentre(860),car.z+95)+26});controls.target.set(car.x,14,car.z+100);camera.position.set(car.x+70,45,car.z-30);controls.update();notify('Air freight study / hovering carriers choose random drops ahead',4);};

const requestedScene=new URLSearchParams(location.search).get('scene');selectStudy(requestedScene==='forest'?0:requestedScene==='garden'?1:requestedScene==='glacier'?2:3);
$('loading').hidden=true;animate();
