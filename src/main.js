import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { generateBuilding } from './generator/building.js';

// Scene setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0d0f');
scene.fog = new THREE.Fog('#0d0d0f', 18, 38);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(8.5, 4.5, 9.5);

const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
renderer.outputColorSpace=THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=0.08;
controls.minDistance=1.5;
controls.maxDistance=28;
controls.maxPolarAngle=Math.PI*0.49;
controls.target.set(0,2,0);

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xfff0d0, 1.8);
dirLight.position.set(6,12,5);
dirLight.castShadow=true;
dirLight.shadow.mapSize.set(2048,2048);
dirLight.shadow.camera.near=0.5;
dirLight.shadow.camera.far=30;
dirLight.shadow.camera.left=-12;
dirLight.shadow.camera.right=12;
dirLight.shadow.camera.top=12;
dirLight.shadow.camera.bottom=-12;
dirLight.shadow.bias=-0.0003;
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0x8ab4ff, 0.35);
fillLight.position.set(-5,4,-6);
scene.add(fillLight);

// Ground
const groundGeom = new THREE.PlaneGeometry(60,60);
const groundMat = new THREE.MeshStandardMaterial({color:'#1a1a1e', roughness:0.95, metalness:0});
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x=-Math.PI/2;
ground.receiveShadow=true;
scene.add(ground);
const grid = new THREE.GridHelper(60, 60, '#2a2a36', '#1e1e28');
grid.position.y=0.01;
scene.add(grid);

// Street details
const streetMat = new THREE.MeshStandardMaterial({color:'#222', roughness:0.9});
const road = new THREE.Mesh(new THREE.PlaneGeometry(60,8), streetMat);
road.rotation.x=-Math.PI/2;
road.position.set(0,0.005, 12);
road.receiveShadow=true;
scene.add(road);

// Building holder
let buildingRoot = new THREE.Group();
scene.add(buildingRoot);

// Default params
function getParamsFromUI(){
  const v = id=> document.getElementById(id).value;
  const c = id=> document.getElementById(id).checked;
  const f = id=> parseFloat(v(id));
  return {
    seed: parseInt(v('seed')),
    buildingType: v('buildingType'),
    buildingUse: v('buildingUse'),
    width: f('width'),
    depth: f('depth'),
    floor1: c('floor1'),
    floor2: c('floor2'),
    floor3: c('floor3'),
    floor4: c('floor4'),
    floorHeight: f('floorHeight'),
    pillarDensity: parseInt(v('pillarDensity')),
    hasEngawa: c('hasEngawa'),
    hasGenkan: c('hasGenkan'),
    hasSecondFloorSetback: c('hasSecondFloorSetback'),
    roofType: v('roofType'),
    roofHeight: f('roofHeight'),
    roofCurve: f('roofCurve'),
    roofOverhang: f('roofOverhang'),
    ridgeHeight: f('ridgeHeight'),
    roofTileType: v('roofTileType'),
    tileScale: f('tileScale'),
    roofColor: v('roofColor'),
    has3DTiles: c('has3DTiles'),
    hasOnigawara: c('hasOnigawara'),
    hasRidgeOrnament: c('hasRidgeOrnament'),
    hasKawaraDetail: c('hasKawaraDetail'),
    woodType: v('woodType'),
    woodColor: v('woodColor'),
    woodAge: f('woodAge'),
    wallType: v('wallType'),
    wallColor: v('wallColor'),
    wallTexScale: f('wallTexScale'),
    lightType: v('lightType'),
    lightColor: v('lightColor'),
    lightIntensity: f('lightIntensity'),
    hasChochin: c('hasChochin'),
    hasAndon: c('hasAndon'),
    hasStreetLight: c('hasStreetLight'),
    hasInteriorLights: c('hasInteriorLights'),
    chochinCount: parseInt(v('chochinCount')),
    lightFlicker: f('lightFlicker'),
    hasElectricPole: c('hasElectricPole'),
    hasPhoneLines: c('hasPhoneLines'),
    hasAircon: c('hasAircon'),
    hasMeterBox: c('hasMeterBox'),
    hasGutter: c('hasGutter'),
    modernity: f('modernity'),
    hasKanban: c('hasKanban'),
    kanbanText: v('kanbanText'),
    kanbanTextEn: v('kanbanTextEn'),
    kanbanStyle: v('kanbanStyle'),
    hasNoren: c('hasNoren'),
    norenText: v('norenText'),
    hasPosters: c('hasPosters'),
    posterTexts: v('posterTexts'),
    hasSmallSigns: c('hasSmallSigns'),
    hasFurniture: c('hasFurniture'),
    hasChairsTables: c('hasChairsTables'),
    hasZabuton: c('hasZabuton'),
    hasPlants: c('hasPlants'),
    hasTansu: c('hasTansu'),
    hasKitchen: c('hasKitchen'),
    furnitureDensity: f('furnitureDensity'),
  };
}

let currentParams = getParamsFromUI();
let currentBuilding = null;
let animationId=null;
let time=0;

function rebuild(){
  const params = getParamsFromUI();
  currentParams=params;
  // remove old
  if(currentBuilding){
    buildingRoot.remove(currentBuilding.group);
    // dispose materials
    currentBuilding.group.traverse(o=>{
      if(o.isMesh){
        if(o.geometry) o.geometry.dispose();
        if(o.material){
          if(o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      }
    });
  }
  const result = generateBuilding(params, scene, THREE);
  currentBuilding=result;
  buildingRoot.add(result.group);

  // update stats
  document.getElementById('statPolys').textContent = Math.floor(result.stats.polys).toLocaleString();
  document.getElementById('statTiles').textContent = result.stats.tiles.toLocaleString();
  document.getElementById('statLights').textContent = result.stats.lights;

  // raster debug — copy debugCanvas to visible canvas
  if(result.debugCanvas){
    const target = document.getElementById('debugRaster');
    if(target){
      const tCtx = target.getContext('2d');
      tCtx.clearRect(0,0,512,512);
      tCtx.drawImage(result.debugCanvas,0,0);
    }
  }

  // graph
  document.getElementById('graphSeed').textContent = params.seed;
  const floors = (params.floor2?2:1)+(params.floor3?1:0)+(params.floor4?1:0);
  document.getElementById('graphFloors').textContent = `${floors}F • ${params.width}m`;
  document.getElementById('graphRoof').textContent = `${params.roofType} • ${params.roofTileType.split('_')[1]||params.roofTileType}`;
  document.getElementById('graphMaterial').textContent = `${params.woodType} + ${params.wallType}`;
  document.getElementById('graphDetails').textContent = `${params.hasChochin?'Chochin':''} ${params.hasKanban?'Kanban':''} ${params.hasElectricPole?'Pole':''}`;

  // update range labels
  document.querySelectorAll('.val').forEach(el=>{
    const forId=el.dataset.for;
    if(forId){
      const inp=document.getElementById(forId);
      if(inp) el.textContent = inp.type==='range' ? parseFloat(inp.value).toFixed(inp.step<1?2:0) : inp.value;
    }
  });
}

// Bind UI
function bind(){
  const inputs = document.querySelectorAll('#controls-panel input, #controls-panel select, #controls-panel textarea');
  inputs.forEach(inp=>{
    inp.addEventListener('input', ()=>{
      // live update for some, debounce for heavy
      if(inp.type==='range' || inp.type==='color' || inp.type==='checkbox' || inp.tagName==='SELECT'){
        rebuild();
      }
    });
    inp.addEventListener('change', rebuild);
  });

  document.getElementById('seedRandom').addEventListener('click', ()=>{
    document.getElementById('seed').value = Math.floor(Math.random()*9999)+100;
    rebuild();
  });
  document.getElementById('randomizeBtn').addEventListener('click', randomizeAll);
  document.getElementById('exportBtn').addEventListener('click', exportGLTF);

  document.querySelectorAll('#presets button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      applyPreset(btn.dataset.preset);
    });
  });

  window.addEventListener('keydown', e=>{
    if(e.key==='r' || e.key==='R'){
      randomizeAll();
    }
    if(e.key==='f' || e.key==='F'){
      controls.target.set(0,2,0);
      camera.position.set(8.5,4.5,9.5);
      controls.update();
    }
    if(e.key==='g' || e.key==='G'){
      grid.visible=!grid.visible;
    }
  });
}

function randomizeAll(){
  const seedInput=document.getElementById('seed');
  seedInput.value = Math.floor(Math.random()*10000);
  // randomize some key params
  const roofTypes=['irimoya','kirizuma','yosemune','karahafu','nokikarahafu'];
  document.getElementById('roofType').value = roofTypes[Math.floor(Math.random()*roofTypes.length)];
  const tileTypes=['kawara_nihon','kawara_ibushi','kawara_red','mokume','copper','ceramic_blue'];
  document.getElementById('roofTileType').value = tileTypes[Math.floor(Math.random()*tileTypes.length)];
  const woodTypes=['hinoki','sugi','yakisugi','keyaki','painted_red','charcoal'];
  document.getElementById('woodType').value = woodTypes[Math.floor(Math.random()*woodTypes.length)];
  document.getElementById('width').value = (3 + Math.random()*6).toFixed(1);
  document.getElementById('depth').value = (4 + Math.random()*6).toFixed(1);
  document.getElementById('roofCurve').value = (0.3+Math.random()*0.6).toFixed(2);
  document.getElementById('roofHeight').value = (1.5+Math.random()*2.5).toFixed(1);
  // random booleans
  document.getElementById('floor2').checked = Math.random()>0.3;
  document.getElementById('floor3').checked = Math.random()>0.7;
  document.getElementById('hasKanban').checked = Math.random()>0.2;
  document.getElementById('hasNoren').checked = Math.random()>0.3;
  document.getElementById('hasChochin').checked = Math.random()>0.2;
  document.getElementById('chochinCount').value = Math.floor(Math.random()*5)+1;
  const kanjiOptions=['山田商店','鈴木酒店','居酒屋','ラーメン','喫茶店','花屋','本屋','銭湯','寿司','天ぷら'];
  document.getElementById('kanbanText').value = kanjiOptions[Math.floor(Math.random()*kanjiOptions.length)];
  const enOptions=['YAMADA','SAKE','RAMEN','CAFE','FLOWER','BOOKS','SENTO','SUSHI'];
  document.getElementById('kanbanTextEn').value = enOptions[Math.floor(Math.random()*enOptions.length)];
  rebuild();
}

function applyPreset(name){
  const set = (id,val)=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(el.type==='checkbox') el.checked=val;
    else el.value=val;
  };
  switch(name){
    case 'machiya_classic':
      set('buildingType','machiya'); set('buildingUse','house');
      set('roofType','irimoya'); set('roofTileType','kawara_nihon'); set('roofColor','#4a4e52');
      set('woodType','hinoki'); set('woodColor','#d2b48c'); set('woodAge','0.2');
      set('wallType','shikkui'); set('wallColor','#f5f1e8');
      set('width','6.5'); set('depth','9'); set('floor2',true); set('floor3',false);
      set('hasEngawa',true); set('hasNoren',true); set('norenText','営業中');
      set('hasChochin',true); set('chochinCount','2'); set('lightType','chochin');
      set('hasElectricPole',false); set('hasAircon',false); set('modernity','0.15');
      set('kanbanText','山田商店'); set('kanbanTextEn','YAMADA');
      break;
    case 'izakaya_night':
      set('buildingType','izakaya'); set('buildingUse','izakaya');
      set('roofType','kirizuma'); set('roofTileType','kawara_ibushi'); set('roofColor','#3a3d40');
      set('woodType','yakisugi'); set('woodColor','#3a2a1a'); set('woodAge','0.6');
      set('wallType','yakisugi_wall'); set('wallColor','#2b1d12');
      set('width','5'); set('depth','7'); set('floor2',true); set('floor3',false);
      set('hasEngawa',false); set('hasNoren',true); set('norenText','居酒屋');
      set('hasChochin',true); set('chochinCount','5'); set('lightType','bare_bulb'); set('lightColor','#ff8c2a'); set('lightIntensity','1.8');
      set('hasElectricPole',true); set('hasPhoneLines',true); set('hasAircon',true); set('hasPosters',true);
      set('hasKitchen',true); set('hasZabuton',true);
      set('kanbanText','鳥貴'); set('kanbanTextEn','TORIKI'); set('kanbanStyle','wood_vertical');
      set('modernity','0.6');
      break;
    case 'modern_machiya':
      set('buildingType','machiya'); set('buildingUse','store');
      set('roofType','yosemune'); set('roofTileType','copper'); set('roofColor','#6a8a7a');
      set('woodType','charcoal'); set('woodColor','#2a2a2a'); set('woodAge','0.1');
      set('wallType','modern_plaster'); set('wallColor','#e8e6e1');
      set('width','7.5'); set('depth','8'); set('floor2',true); set('floor3',true);
      set('hasEngawa',false); set('hasNoren',false);
      set('hasChochin',false); set('lightType','hidden_led'); set('lightColor','#ffe8c0'); set('lightIntensity','1.0');
      set('hasElectricPole',true); set('hasAircon',true); set('hasGutter',true);
      set('kanbanText','FRONTIER'); set('kanbanTextEn','COFFEE'); set('kanbanStyle','metal_neon');
      set('modernity','0.85');
      break;
    case 'ryokan':
      set('buildingType','ryokan'); set('buildingUse','ryokan');
      set('roofType','irimoya'); set('roofTileType','kawara_nihon'); set('roofColor','#4e5255');
      set('woodType','sugi'); set('woodColor','#b8956a'); set('woodAge','0.35');
      set('wallType','shikkui'); set('wallColor','#f2efe6');
      set('width','10'); set('depth','12'); set('floor2',true); set('floor3',false);
      set('hasEngawa',true); set('hasSecondFloorSetback',true);
      set('hasChochin',true); set('chochinCount','4'); set('hasPlants',true);
      set('kanbanText','旅館松風'); set('kanbanTextEn','MATSUKAZE');
      break;
    case 'showa_store':
      set('buildingType','store'); set('buildingUse','store');
      set('roofType','kirizuma'); set('roofTileType','kawara_red'); set('roofColor','#8b2222');
      set('woodType','painted_red'); set('woodColor','#8b2a2a'); set('wallType','shitami');
      set('width','5.5'); set('depth','6'); set('floor2',true); set('floor3',false);
      set('hasPosters',true); set('hasSmallSigns',true); set('hasElectricPole',true); set('hasMeterBox',true);
      set('hasChochin',true); set('chochinCount','2'); set('lightType','bare_bulb');
      set('kanbanText','鈴木酒店'); set('kanbanTextEn','SAKE'); set('posterTexts','ビール ¥500\nたばこ\nアイス');
      break;
    case 'temple_gate':
      set('buildingType','temple_shop'); set('buildingUse','store');
      set('roofType','karahafu'); set('roofTileType','ceramic_blue'); set('roofColor','#2f4a71');
      set('woodType','keyaki'); set('woodColor','#8d5a3a'); set('woodAge','0.4');
      set('wallType','namako'); set('wallColor','#f0f0f0');
      set('width','6'); set('depth','5'); set('floor2',false);
      set('hasOnigawara',true); set('hasRidgeOrnament',true); set('hasChochin',true); set('chochinCount','2');
      set('kanbanText','御守'); set('kanbanTextEn','OMAMORI');
      break;
  }
  rebuild();
}

function exportGLTF(){
  if(!currentBuilding) return;
  const exporter=new GLTFExporter();
  exporter.parse(currentBuilding.group, (gltf)=>{
    const blob = new Blob([JSON.stringify(gltf)], {type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`frontier_machiya_${currentParams.seed}.gltf`;
    a.click();
    URL.revokeObjectURL(url);
  }, (e)=>{console.error(e)}, {binary:false});
}

// Animation loop
function animate(){
  animationId=requestAnimationFrame(animate);
  time+=0.016;
  controls.update();
  // flicker chochin lights
  if(currentBuilding){
    currentBuilding.group.traverse(obj=>{
      if(obj.isPointLight && obj.userData.isChochin){
        const flicker = currentParams.lightFlicker;
        obj.intensity = currentParams.lightIntensity * (1 + Math.sin(time*10 + obj.position.x)*flicker*0.3 + (Math.random()-0.5)*flicker*0.2);
      }
    });
  }
  renderer.render(scene,camera);
}

window.addEventListener('resize', ()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

bind();
rebuild();
animate();

// Also generate Blender addon file as downloadable?
// We'll create a secondary export for blender python
console.log('Frontier Machiya Generator ready');
