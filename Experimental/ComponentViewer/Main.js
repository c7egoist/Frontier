// Boot: workers, the icon baker, the asset library, the ControlVehicle sample (Vehicle Lab's FCT1 meshes compiled
// through the same pipeline as any import) and the import paths (file picker, drag-and-drop, sample sources).
import { $, toast } from './Ui.js';
import { hydrateIcons } from './Icons.js';
import { createAsset, compileAll, workerChannel, fmt } from './CompileSteps.js';
import { readGeometry, formatOf, readFacet } from './Engine/ImportFormats.js';
import { SOURCE_PRESETS, constructSource } from './Engine/SourceGeometry.js';
import { createBlueprint, addComponent, findComponent, VEHICLE_SHEET } from './Blueprint.js';
import { IconRenderer, VEHICLE_PALETTE, meshObject, assetSlots } from './Render.js';
import { createGeometryCompile } from './GeometryCompile.js';
import { createComponentViewer } from './ComponentViewer.js';

const assets = new Map();
const iconRenderer = new IconRenderer();
const sdfWorker = workerChannel(new URL('./Engine/SdfWorker.js', import.meta.url));
const lodWorker = workerChannel(new URL('./Engine/LodWorker.js', import.meta.url));

const ctx = {
  sdfWorker, lodWorker,
  async renderIcon(asset) {
    const s = asset.settings.icon;
    const channel = s.shading === 'normals' ? 'normals' : 'lit';
    const overrides = s.shading === 'clay' ? Object.fromEntries(assetSlots(asset).map((x) => [x.family, '#c3c7cf'])) : {};
    return iconRenderer.render(meshObject(asset, { channel, overrides, castShadow: false }), s);
  },
};

// ------------------------------------------------------------------------------------------------- import paths
const compile = createGeometryCompile({
  ctx,
  onFinish(asset, { cancelled, open, existing }) {
    if (cancelled) {
      if (!existing && assets.has(asset.id) && !asset.out.geometry) assets.delete(asset.id);
      if (!existing && !asset.compiledAt) assets.delete(asset.id);
      viewer.refresh();
      return;
    }
    assets.set(asset.id, asset);
    if (existing) { viewer.refresh(); toast(`${asset.name} recompiled · placed meshes updated`); return; }
    if (open) {
      const bp = createBlueprintFor(asset);
      viewer.open(bp);
      toast(`${asset.name} compiled · opened as ${bp.name}`);
    }
  },
});

function openCompile(asset, options = {}) {
  if (!assets.has(asset.id)) assets.set(asset.id, asset);
  compile.open(asset, options);
}

async function importFiles(files) {
  for (const file of files) {
    const fmtInfo = formatOf(file.name);
    if (!fmtInfo) { toast(`Unknown file type: ${file.name}`); continue; }
    try {
      const raw = readGeometry(file.name, await file.arrayBuffer());
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const settings = fmtInfo.ext === 'facet' ? { source: { up: 'z' } } : {};
      const asset = createAsset({ name, fileName: file.name, fileSize: file.size, raw, settings, palette: fmtInfo.ext === 'facet' ? VEHICLE_PALETTE : null });
      openCompile(asset);
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
const samples = [
  ...SOURCE_PRESETS.map((p) => ({
    label: p.label, note: `${p.note} · Frontier-1 preset`, icon: p.id === 'terrain' ? 'grid' : 'sparkle',
    open() {
      const src = constructSource(p.id, 24000);
      const raw = { positions: src.positions, indices: src.indices, families: null, format: 'Procedural', notes: [`Frontier-1 Cluster LOD preset “${p.label}” (24k triangle budget)`] };
      openCompile(createAsset({ name: p.label, fileName: `${p.id}.preset`, raw, settings: { meta: { category: 'Prop', tags: 'preset, frontier-1' } } }));
    },
  })),
  {
    label: 'ControlVehicle Body (FCT1)', note: 'Vehicle Lab mesh · Z-up · re-import', icon: 'vehicle',
    async open() {
      const raw = readFacet(await (await fetch('./Models/ControlVehicleBody.facet')).arrayBuffer());
      openCompile(createAsset({ name: 'ControlVehicle Body Copy', fileName: 'ControlVehicleBody.facet', fileSize: 64736, raw, palette: VEHICLE_PALETTE, settings: { source: { up: 'z' }, geometry: { centre: 'none' }, meta: { category: 'Vehicle part' } } }));
    },
  },
];

// ---------------------------------------------------------------------------------------------- vehicle sample
const VEHICLE_PARTS = [
  { key: 'body', file: 'ControlVehicleBody.facet', name: 'ControlVehicle Body', tags: 'vehicle, body, fct1', collision: 'box', normals: 'angle' },
  { key: 'tyre', file: 'ControlVehicleTyre.facet', name: 'ControlVehicle Tyre', tags: 'vehicle, wheel, fct1', collision: 'box', normals: 'smooth' },
  { key: 'rim', file: 'ControlVehicleRim.facet', name: 'ControlVehicle Rim', tags: 'vehicle, wheel, fct1', collision: 'none', normals: 'angle' },
];

async function loadVehicle(report) {
  const parts = {};
  let i = 0;
  for (const part of VEHICLE_PARTS) {
    report(`Reading ${part.file}`, i / VEHICLE_PARTS.length);
    const bytes = await (await fetch(`./Models/${part.file}`)).arrayBuffer();
    const raw = readFacet(bytes);
    const asset = createAsset({
      name: part.name, fileName: part.file, fileSize: bytes.byteLength, raw, origin: 'sample', palette: VEHICLE_PALETTE,
      settings: {
        source: { up: 'z' }, geometry: { centre: 'none', normals: part.normals }, collision: { type: part.collision },
        sdf: { resolution: 40 }, icon: { yaw: part.key === 'body' ? 40 : 60, pitch: 18 },
        meta: { name: part.name, category: 'Vehicle part', tags: part.tags, notes: 'Vehicle Lab ControlVehicle source mesh (Frontier-OLD · VehicleProvingGrounds/Archive).' },
      },
    });
    assets.set(asset.id, asset);
    await compileAll(asset, ctx, (step, f) => report(`Compiling ${part.name} · ${step}`, (i + f * 0.9) / VEHICLE_PARTS.length));
    asset.compiledAt = Date.now();
    parts[part.key] = asset;
    i++;
  }
  return parts;
}

// ControlVehicle as a Blueprint class: Vehicle Lab's sockets become component transforms (authored Z-up → Y-up:
// x, y, z → x, z, −y), Vehicle Lab's sheets become the Vehicle Movement component.
function buildVehicleBlueprint(parts) {
  const bp = createBlueprint('BP_ControlVehicle', 'Pawn');
  const body = addComponent(bp, 'StaticMesh', { name: 'Body', props: { asset: parts.body.id, location: [0, +VEHICLE_SHEET.groundOffset.toFixed(5), 0], mass: 1220, simulatePhysics: true } });
  const names = ['WheelFL', 'WheelFR', 'WheelRL', 'WheelRR'];
  const wheels = VEHICLE_SHEET.axleMount.map((m, i) => {
    const tyre = addComponent(bp, 'StaticMesh', { parentId: body.id, name: names[i], props: { asset: parts.tyre.id, location: [m[0], m[2], -m[1]], rotation: [0, m[1] < 0 ? 180 : 0, 0], mass: 20 } });
    addComponent(bp, 'StaticMesh', { parentId: tyre.id, name: `${names[i]}Rim`, props: { asset: parts.rim.id } });
    return tyre;
  });
  addComponent(bp, 'SpotLight', { parentId: body.id, name: 'HeadlightL', props: { location: [2.95, 0.42, -0.78], rotation: [0, 0, -4], intensity: 30, angle: 28, range: 30 } });
  addComponent(bp, 'SpotLight', { parentId: body.id, name: 'HeadlightR', props: { location: [2.95, 0.42, 0.78], rotation: [0, 0, -4], intensity: 30, angle: 28, range: 30 } });
  addComponent(bp, 'Scene', { parentId: body.id, name: 'RearWingSocket', props: { location: [-2.9822, 0.8367, 0] } });
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
