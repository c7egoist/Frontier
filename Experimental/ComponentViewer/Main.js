// Boot: the compile context (workers + icon baker, used headlessly for the ControlVehicle sample), the asset library,
// the import paths (file picker, drag-and-drop, sample sources) and the Geometry Compiler hand-off. The compiler is a
// separate workspace (Experimental/GeometryCompiler/Compile.html) framed full-window; see CompileExchange.js.
import { $, toast } from '../Shared/Studio/Ui.js';
import { hydrateIcons } from '../Shared/Studio/Icons.js';
import { fmt } from '../Shared/GeometryCompile/CompileSteps.js';
import { loadVehicleParts } from '../Shared/Models/ControlVehicle.js';
import { createCompileContext } from '../Shared/GeometryCompile/CompileContext.js';
import { COMPILE_SAMPLES, assetFromFile } from '../Shared/GeometryCompile/CompileSources.js';
import { hostCompiler } from '../Shared/GeometryCompile/CompileExchange.js';
import { createBlueprint, addComponent, findComponent, VEHICLE_SHEET } from './Blueprint.js';
import { createComponentViewer } from './ComponentViewer.js';

const assets = new Map();
const { ctx, iconRenderer } = createCompileContext();

// ------------------------------------------------------------------------------------------------- import paths
// Sessions run in the Geometry Compiler page; it hands back a compiled copy of the asset (or a cancel).
const compiler = hostCompiler($('Compile'), {
  onFinish(asset, { cancelled, open, existing }) {
    if (cancelled) { viewer.refresh(); return; }
    assets.set(asset.id, asset);
    if (existing) { viewer.refresh(); toast(`${asset.name} recompiled · placed meshes updated`); return; }
    viewer.refresh();
    if (open) {
      const bp = createBlueprintFor(asset);
      viewer.open(bp);
      toast(`${asset.name} compiled · opened as ${bp.name}`);
    }
  },
  onError(error) { $('Compile').hidden = true; toast(`Geometry Compiler: ${error.message || error}`); },
});

function openCompile(asset, options = {}) {
  compiler.open(asset, options);
}

async function importFiles(files) {
  for (const file of files) {
    try {
      openCompile(await assetFromFile(file));
      return; // one compile session at a time; the rest can be imported after
    } catch (error) {
      toast(String(error.message || error));
    }
  }
}

$('FileInput').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
addEventListener('drop', (e) => { if (e.dataTransfer.files.length && !e.defaultPrevented) { e.preventDefault(); importFiles(e.dataTransfer.files); } });

// A blueprint wrapping one asset: root → Static Mesh (+ a collision component matching the compiled shape).
function createBlueprintFor(asset) {
  const bp = createBlueprint(`BP_${asset.name.replace(/[^\w]+/g, '')}`);
  const mesh = addComponent(bp, 'StaticMesh', { name: asset.name.replace(/[^\w]+/g, ''), props: { asset: asset.id } });
  const c = asset.out.collision;
  if (c && c.type === 'box') addComponent(bp, 'BoxCollision', { parentId: mesh.id, name: 'Bounds', props: { extent: c.half.map((v) => +v.toFixed(3)), location: c.centre.map((v) => +v.toFixed(3)) } });
  if (c && c.type === 'sphere') addComponent(bp, 'SphereCollision', { parentId: mesh.id, name: 'Bounds', props: { radius: +c.radius.toFixed(3), location: c.centre.map((v) => +v.toFixed(3)) } });
  if (c && c.type === 'capsule') addComponent(bp, 'CapsuleCollision', { parentId: mesh.id, name: 'Bounds', props: { radius: +c.radius.toFixed(3), halfHeight: +c.halfHeight.toFixed(3), location: c.centre.map((v) => +v.toFixed(3)), rotation: c.axis === 0 ? [0, 0, 90] : c.axis === 2 ? [90, 0, 0] : [0, 0, 0] } });
  const g = asset.out.geometry;
  const r = g ? g.bounds.radius : 1;
  addComponent(bp, 'PointLight', { name: 'KeyLight', props: { location: [r * 1.2, r * 1.6 + 0.4, r * 1.2], intensity: 4 + r * 4, range: r * 6 + 2 } });
  bp.dirty = true;
  return bp;
}
window.FrontierComponentViewer = { createBlueprintFor, assets };

// ------------------------------------------------------------------------------------------------------ samples
const samples = COMPILE_SAMPLES.map((s) => ({ ...s, async open() { openCompile(await s.source()); } }));

// ---------------------------------------------------------------------------------------------- vehicle sample
// Parts, the procedural wing and the headless compile live in Shared/Models/ControlVehicle.js (also used by the
// Level Designer's Lobby).
const loadVehicle = (report) => loadVehicleParts({ ctx, assets, report });

// ControlVehicle as a Blueprint class: Vehicle Lab's sockets become component transforms (authored Z-up → Y-up:
// x, y, z → x, z, −y), Vehicle Lab's sheets become the Vehicle Movement component.
function buildVehicleBlueprint(parts) {
  const bp = createBlueprint('BP_ControlVehicle', 'Pawn');
  const body = addComponent(bp, 'StaticMesh', { name: 'Body', props: { asset: parts.body.id, location: [0, +VEHICLE_SHEET.groundOffset.toFixed(5), 0], mass: 1220, simulatePhysics: true } });
  // Each wheel hangs from a Spring socket at its axle mount (meets road bumps, squats and lifts with acceleration);
  // the front ones turn on a Hinge socket (±32° steering lock) between the spring and the wheel.
  const names = ['FL', 'FR', 'RL', 'RR'];
  const wheels = VEHICLE_SHEET.axleMount.map((m, i) => {
    const spring = addComponent(bp, 'Socket', { parentId: body.id, name: `Suspension${names[i]}`, props: { kind: 'spring', location: [m[0], m[2], -m[1]], springHz: 2, damping: 0.42, springTravel: 0.09, bumpSpacing: 7, loadGain: 1 } });
    const mount = m[0] > 0 ? addComponent(bp, 'Socket', { parentId: spring.id, name: `Steer${names[i]}`, props: { kind: 'hinge', angleMin: -32, angleMax: 32, pose: 0.5 } }) : spring;
    const tyre = addComponent(bp, 'StaticMesh', { parentId: mount.id, name: `Wheel${names[i]}`, props: { asset: parts.tyre.id, rotation: [0, m[1] < 0 ? 180 : 0, 0], mass: 20 } });
    addComponent(bp, 'StaticMesh', { parentId: tyre.id, name: `Wheel${names[i]}Rim`, props: { asset: parts.rim.id } });
    return tyre;
  });
  addComponent(bp, 'SpotLight', { parentId: body.id, name: 'HeadlightL', props: { location: [2.95, 0.42, -0.78], rotation: [0, 0, -4], intensity: 30, angle: 28, range: 30 } });
  addComponent(bp, 'SpotLight', { parentId: body.id, name: 'HeadlightR', props: { location: [2.95, 0.42, 0.78], rotation: [0, 0, -4], intensity: 30, angle: 28, range: 30 } });
  // Vehicle Lab's rear wing socket, now a Dock keyed “wing”: Simulate runs a pull test (the wing tears off above
  // 1.2 kN, drifts out and snaps back inside 0.3 m). Release / Connect work in the editor too.
  const wingDock = addComponent(bp, 'Socket', { parentId: body.id, name: 'RearWingSocket', props: { kind: 'dock', location: [-2.9822, 0.8367, 0], key: 'wing', snapRadius: 0.3, breakForce: 1200, drive: 'pull' } });
  addComponent(bp, 'StaticMesh', { parentId: wingDock.id, name: 'RearWing', props: { asset: parts.wing.id, tags: 'wing', mass: 6 } });
  addComponent(bp, 'Socket', { parentId: body.id, name: 'TowStrap', props: { kind: 'tether', location: [-3.1, 0.1, 0], length: 0.32, swing: 30, tetherDamping: 0.3 } });
  addComponent(bp, 'Arrow', { parentId: body.id, name: 'Forward', props: { location: [3.2, 0.2, 0], length: 0.8 } });
  addComponent(bp, 'Camera', { name: 'ChaseCamera', props: { location: [-7.2, 2.4, 0], rotation: [0, 0, -12], fov: 62 } });
  addComponent(bp, 'BoxCollision', { parentId: body.id, name: 'FrontBumperTrigger', props: { location: [3.05, 0.1, 0], extent: [0.18, 0.28, 1.05], trigger: true } });
  const vm = addComponent(bp, 'VehicleMovement', { name: 'VehicleMovement' });
  vm.props.wheels = wheels.map((w) => w.id);
  bp.dirty = false;
  return bp;
}

// ---------------------------------------------------------------------------------------------------------- boot
const viewer = createComponentViewer({ assets, iconRenderer, openCompile, importFiles, samples });
hydrateIcons(document);

(async () => {
  const boot = $('Boot');
  const report = (text, f) => { $('BootText').textContent = text; $('BootBar').style.width = `${Math.round(f * 100)}%`; };
  try {
    const parts = await loadVehicle(report);
    report('Assembling BP_ControlVehicle', 1);
    const bp = buildVehicleBlueprint(parts);
    viewer.open(bp);
    bp.icon = null;
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 400);
    const tris = Object.values(parts).reduce((n, a) => n + a.out.geometry.indices.length / 3, 0);
    toast(`ControlVehicle compiled · ${fmt(tris)} tris · 3 assets`);
  } catch (error) {
    console.error(error);
    $('BootText').textContent = `Could not load the ControlVehicle sample: ${error.message}. Import an object to start.`;
    boot.classList.add('failed');
    const bp = createBlueprint('BP_Empty');
    viewer.open(bp);
    setTimeout(() => boot.remove(), 2500);
  }
})();

export { assets, findComponent };
