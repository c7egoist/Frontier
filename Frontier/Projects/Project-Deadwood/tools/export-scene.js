// Geometry-only interchange. Runtime roots, physics and teleport logic live in src/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import {buildScrapyard,updateScrapyardVisuals} from '../src/scrapyard-world.js';
import {YARD,YARD_BEATS,yardSpawn} from '../src/scrapyard.js';
import { buildGlacier,updateGlacierVisuals } from '../src/glacier-world.js';
import { GLACIER,GLACIER_BEATS,createShips,createAvalanches,STORM,advanceCrystalStorm,glacierCentre } from '../src/glacier.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildWorld, buildCar, buildRootVisuals, updateRootVisual } from '../src/world.js';
import { FIREFLY,createFireflies } from '../src/fireflies.js';
import { GARDEN, createMaze, createPlants, createFlowers } from '../src/garden.js';
import { buildGarden, updateGardenVisuals } from '../src/garden-world.js';
import { COURSE, BEATS, centerX, groundY, tangent, createHazards } from '../src/course.js';
// GLTFExporter uses FileReader for embedding buffers; Node has Blob but not FileReader.
globalThis.FileReader=class {
 async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.();}
 async readAsDataURL(blob){this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;this.onloadend?.();}
};
const scene=new T.Scene();scene.name='Frontier / Deadwood + Hunger + Icebound + Iron Tide / greybox studies';
scene.userData={units:'metres',forward:'+Z',up:'+Y',runtime:'src/main.js',note:'Static greybox snapshot, not an engine-integrated gameplay level.'};
function stageGlacier(g){const car={x:glacierCentre(920),z:GLACIER.z+920};for(let t=0;t<1.8;t+=1/90)advanceCrystalStorm(g.state,car,1/90);updateGlacierVisuals(g,car,0);}
const world=buildWorld(scene),icebound=buildGlacier(scene);stageGlacier(icebound);const ironTide=buildScrapyard(scene);updateScrapyardVisuals(ironTide,yardSpawn(ironTide.state),0,{inspect:true});world.entry.group.name='Portal_01_Entry';world.exit.group.name='Portal_02_Exit';world.exit.group.userData={trigger:{z:2200,halfWidth:10},destination:COURSE.destination,sameScene:true};
const {car}=buildCar(scene);car.name='PlayerCar_Spawn';car.position.set(centerX(0),groundY(0),0);car.rotation.y=tangent(0);
const roots=createHazards(),visuals=buildRootVisuals(scene,roots);
roots.forEach((r,i)=>{updateRootVisual({...r,age:20},visuals[i],0,false);visuals[i].mesh.name=`Root_${i.toString().padStart(2,'0')}`;visuals[i].mesh.userData={hazard:r,warningSeconds:r.warning,continuousGrowth:true,branchNodes:r.branches.map(b=>({parent:b.parent,attach:b.attach}))};});
world.staticColliders.forEach((c,i)=>{if(c.r>5)scene.userData.heartCollider=c;});
scene.updateMatrixWorld(true);
const exporter=new GLTFExporter();const gltf=await exporter.parseAsync(scene,{binary:false,onlyVisible:true});
gltf.asset.generator='Frontier / Deadwood deterministic greybox exporter';
const output=fileURLToPath(new URL('../Content/Scenes/',import.meta.url));await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'Deadwood.gltf'),JSON.stringify(gltf));
await fs.writeFile(path.join(output,'Deadwood.layout.json'),JSON.stringify({schema:3,course:COURSE,beats:BEATS,roots,colliders:world.staticColliders,portals:[{from:{x:centerX(2200),y:groundY(2200),z:2200},to:COURSE.destination,sameScene:true},{from:{x:world.garden.maze.exit.x,z:world.garden.maze.exit.z+10},to:{x:glacierCentre(0),z:GLACIER.z},sameScene:true},{from:{x:glacierCentre(2000),z:GLACIER.z+2000},to:GLACIER.landing,sameScene:true},{from:{x:ironTide.exit.root.position.x,z:YARD.z+YARD.length},to:YARD.landing,sameScene:true}],yardInterchange:'IronTide.layout.json',glacierInterchange:'Icebound.layout.json',gardenInterchange:"CarnivorousGarden.layout.json",exportNote:'glTF contains a 20-second static snapshot of branching root systems. Runtime animation, collisions, pursuit and portal transport are in the browser prototype; metadata is an integration contract, not native engine code.'},null,2)+'\n');
console.log(`Exported ${gltf.nodes.length} nodes; ${gltf.meshes.length} meshes; extensions: ${(gltf.extensionsUsed||[]).join(', ')}.`);

// Separate garden-only scene, without duplicating the forest geometry.
const gardenScene=new T.Scene();gardenScene.name='The Hunger / carnivorous garden greybox';
const garden=buildGarden(gardenScene);
garden.plants.forEach((p,i)=>{p.rise=1;garden.trapVisuals[i].anchor.userData={buriedAtStart:p.buried,initialState:p.buried?'dormant':'open',trapId:p.id};});
updateGardenVisuals(garden,0);gardenScene.updateMatrixWorld(true);
gardenScene.userData={units:'metres',runtime:'src/garden.js + src/garden-world.js',note:'Static open-mouth survey snapshot; trap/firefly simulation is browser code.'};
const gardenGltf=await new GLTFExporter().parseAsync(gardenScene,{binary:false,onlyVisible:true});
await fs.writeFile(path.join(output,'CarnivorousGarden.gltf'),JSON.stringify(gardenGltf));
await fs.writeFile(path.join(output,'CarnivorousGarden.layout.json'),JSON.stringify({schema:2,garden:GARDEN,maze:createMaze(),plants:createPlants(),flowers:createFlowers(),fireflyRules:FIREFLY,fireflies:createFireflies(createMaze()),terrainContract:"src/garden-terrain.js",sameScene:true,runtime:'src/garden.js',note:'Native gameplay integration and glTF jaw animation are not included.'},null,2)+'\n');
console.log(`Garden-only scene: ${gardenGltf.nodes.length} nodes, ${garden.plants.length} flytraps, ${garden.fireflies.length} explosive fireflies.`);

// Separate Scene 3 interchange; the onward destination is now the scrapyard entrance.
const glacierScene=new T.Scene();glacierScene.name='Icebound / glacier cave and frozen fleet';
const glacier=buildGlacier(glacierScene);stageGlacier(glacier);
const player=buildCar(glacierScene).car;player.name='Icebound_PlayerSpawn';player.position.set(glacierCentre(0),0,GLACIER.z);
glacierScene.userData={units:'metres',forward:'+Z',up:'+Y',runtime:'src/glacier.js + src/glacier-world.js',note:'Static greybox, not native engine integration. Gameplay and moving/breakable geometry run in the browser prototype.'};
glacierScene.updateMatrixWorld(true);
const iceGltf=await new GLTFExporter().parseAsync(glacierScene,{binary:false,onlyVisible:true});
await fs.writeFile(path.join(output,'Icebound.gltf'),JSON.stringify(iceGltf));
const field=glacier.state.field;
await fs.writeFile(path.join(output,'Icebound.layout.json'),JSON.stringify({schema:2,revision:2,glacier:GLACIER,beats:GLACIER_BEATS,ships:createShips(),avalanches:createAvalanches(),storm:STORM,seed:glacier.state.seed,field:{...field,voidCells:[...field.voidCells]},previewCrystals:glacier.state.crystals.filter(p=>p.state!=='inactive'),fractureContract:'src/glacier-field.js: cached Voronoi polygons; src/glacier-ice-mesh.js: independently falling plates and growing branching contact cracks',portals:[{from:{x:glacierCentre(2000),z:GLACIER.z+2000},halfWidth:10,to:GLACIER.landing,sameScene:true}],collisionContract:'src/glacier.js: capsule hulls, pressure-ridge ellipses, avalanche plugs, landed rubble and polygon support. No continuous snow route. Seeded rejection checks field connectivity and storm escape space.',runtime:'src/glacier.js + src/glacier-field.js + src/glacier-storm.js + src/glacier-world.js',note:'Static glTF shower snapshot, seed 711. Runs randomize at restart. Runtime logic and native integration are not embedded.'},null,2)+'\n');
console.log(`Icebound-only scene: ${iceGltf.nodes.length} nodes; ${glacier.ships.length} sailing ships; ${glacier.state.crystals.length} falling crystals; ${glacier.iceField.records.length} Voronoi fracture plates.`);

// Separate Scene 4 interchange: all seeded courts, not just the visible driving sectors.
const yardScene=new T.Scene();yardScene.name='Iron Tide / working scrapyard';
const yard=buildScrapyard(yardScene);updateScrapyardVisuals(yard,yardSpawn(yard.state),0,{inspect:true});
const yardPlayer=buildCar(yardScene).car;yardPlayer.name='IronTide_PlayerSpawn';const spawn=yardSpawn(yard.state);yardPlayer.position.set(spawn.x,0,spawn.z);
yardScene.userData={units:'metres',forward:'+Z',up:'+Y',runtime:'src/scrapyard.js + src/scrapyard-world.js',note:'Static survey snapshot. Crane/magnet/car/debris/drone physics are browser logic, not glTF animation or native engine code.'};
yardScene.updateMatrixWorld(true);const yardGltf=await new GLTFExporter().parseAsync(yardScene,{binary:false,onlyVisible:true});
await fs.writeFile(path.join(output,'IronTide.gltf'),JSON.stringify(yardGltf));
await fs.writeFile(path.join(output,'IronTide.layout.json'),JSON.stringify({schema:1,yard:YARD,beats:YARD_BEATS,seed:yard.state.seed,layout:yard.state.layout,cranes:yard.state.cranes,drones:yard.state.drones,initialMetalBodies:yard.state.bodies.filter(b=>b.state!=='inactive'),portals:[{from:{x:yard.exit.root.position.x,z:YARD.z+YARD.length},halfWidth:11,to:YARD.landing,sameScene:true}],simulation:{capacity:YARD.bodyCapacity,gravity:18,magneticForce:'44 * (1-distance/radius)^1.5 * field * (2.6/mass)',craneWarning:1.45,cranePull:5.2,malfunctionChance:.16,buckleWarning:1.8,collapseSeconds:2.8,captureFailureSeconds:2.3,droneWarning:[1.3,1.95],dronePieces:5},collisionContract:'src/scrapyard.js: elliptical salvage islands, shacks, tyre heaps, crawler bases, fallen-boom capsules, pushable loose bodies and vehicle magnetic lift. Grid reachability is validation, not a marked route.',runtime:'src/scrapyard.js + src/scrapyard-world.js',note:'Seed 91 static snapshot only. Browser restarts randomize unless ?seed= is specified. No native engine integration or physics animation embedded.'},null,2)+'\n');
console.log(`Iron Tide-only scene: ${yardGltf.nodes.length} nodes; ${yard.state.layout.blocks.length} salvage islands; ${yard.state.cranes.length} magnetic cranes; ${yard.state.drones.length} cargo drones.`);
