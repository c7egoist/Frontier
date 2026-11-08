import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { COURSE, BEATS, createHazards } from '../src/course.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('export metadata matches live course, roots, portal and collision contract',async()=>{
 const layout=JSON.parse(await fs.readFile(new URL('../Content/Scenes/Deadwood.layout.json',import.meta.url),'utf8'));
 assert.deepEqual(layout.course,COURSE);assert.deepEqual(layout.beats,BEATS);assert.deepEqual(layout.roots,createHazards());
 assert.equal(layout.portals[0].sameScene,true);assert.ok(layout.colliders.some(c=>c.r===10));
});
test('exported glTF loads with forest instances, visible mature roots and both areas',async()=>{
 // Loader's data-URI fetch progress event is the only browser primitive needed here.
 if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class extends Event{constructor(type,options){super(type);Object.assign(this,options);}};
 const raw=await fs.readFile(new URL('../Content/Scenes/Deadwood.gltf',import.meta.url),'utf8');
 const parsed=JSON.parse(raw);
 assert.ok(parsed.extensionsUsed.includes('EXT_mesh_gpu_instancing'));
 for(const a of parsed.accessors){for(const v of [...(a.min||[]),...(a.max||[])])assert.ok(Number.isFinite(v));}
 const gltf=await new GLTFLoader().parseAsync(raw,'');
 let instances=0,roots=0;gltf.scene.traverse(o=>{if(o.isInstancedMesh)instances+=o.count;if(o.name.startsWith('Root_'))roots++;});
 assert.ok(instances>8000);assert.equal(roots,createHazards().length);
 assert.ok(gltf.scene.getObjectByName('Portal_01_Entry'));assert.ok(gltf.scene.getObjectByName('Portal_02_Exit'));
});

test('garden-only interchange loads with hidden-trap survey, opaque tunnels and explosive fireflies',async()=>{
 const {GARDEN,createMaze,createPlants}=await import('../src/garden.js');
 const metadata=JSON.parse(await fs.readFile(new URL('../Content/Scenes/CarnivorousGarden.layout.json',import.meta.url),'utf8'));
 assert.deepEqual(metadata.garden,GARDEN);assert.deepEqual(metadata.maze,createMaze());assert.deepEqual(metadata.plants,createPlants());
 const raw=await fs.readFile(new URL('../Content/Scenes/CarnivorousGarden.gltf',import.meta.url),'utf8'),parsed=JSON.parse(raw);
 for(const accessor of parsed.accessors)for(const v of [...(accessor.min||[]),...(accessor.max||[])])assert.ok(Number.isFinite(v));
 const gltf=await new GLTFLoader().parseAsync(raw,'');let traps=0,pitchers=0,tunnels=0,flies=0;
 gltf.scene.traverse(o=>{if(o.name.startsWith('Flytrap_'))traps++;if(o.name.startsWith('GiantPitcher'))pitchers++;if(o.name.startsWith('TunnelRoof_'))tunnels++;if(o.name.startsWith('ExplosiveFireflies_Bodies'))flies=o.count;});
 assert.equal(traps,createPlants().length);assert.equal(pitchers,5);assert.equal(tunnels,createMaze().paths.filter(p=>p.tunnel).length);assert.equal(flies,80);assert.ok(gltf.scene.getObjectByName('GardenExit'));
});

test('Icebound interchange loads with fleet, cave, load-bearing floor and same-map exit metadata',async()=>{
 const {GLACIER,createShips,createAvalanches,STORM}=await import('../src/glacier.js');
 const metadata=JSON.parse(await fs.readFile(new URL('../Content/Scenes/Icebound.layout.json',import.meta.url),'utf8'));
 assert.deepEqual(metadata.glacier,GLACIER);assert.deepEqual(metadata.ships,createShips());assert.deepEqual(metadata.avalanches,createAvalanches());assert.deepEqual(metadata.storm,STORM);assert.equal(metadata.schema,2);assert.equal(metadata.field.snow.length,162);assert.equal(metadata.snowRoute,undefined);
 assert.equal(metadata.portals[0].sameScene,true);assert.deepEqual(metadata.portals[0].to,GLACIER.landing);
 const raw=await fs.readFile(new URL('../Content/Scenes/Icebound.gltf',import.meta.url),'utf8'),parsed=JSON.parse(raw);
 for(const a of parsed.accessors)for(const n of [...(a.min||[]),...(a.max||[])])assert.ok(Number.isFinite(n));
 const gltf=await new GLTFLoader().parseAsync(raw,'');let ships=0,roofs=0,tiles=0;
 gltf.scene.traverse(o=>{if(o.name.startsWith('FrozenSailingShip_'))ships++;if(o.name.startsWith('GlacierCaveVault_'))roofs++;if(o.name.startsWith('VoronoiIce_'))tiles=o.geometry.attributes.position.count;});
 assert.equal(ships,8);assert.equal(roofs,2);assert.ok(tiles>100000);assert.equal(gltf.scene.getObjectByName('PackedSnow_HighGripRoute'),undefined);assert.ok(gltf.scene.getObjectByName('RandomCrystalShowers_FallingIce'));assert.ok(gltf.scene.getObjectByName('PressureRidges_BranchingPassages'));assert.ok(gltf.scene.getObjectByName('Icebound_PlayerSpawn'));
});
