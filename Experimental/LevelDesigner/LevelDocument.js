// The level document (schema frontier.level.v1): environment, entities on two layers, and hotspots. DOM-free and
// THREE-free, so the checks run it in Node and the C++ port can mirror it field for field.
//
//   environment  sky (gradient), sun (azimuth / elevation in degrees), studio (cyclorama colours and floor gloss),
//                lights[] (point / spot / area lights, each with a transform like an entity; spot and area lights
//                shine along their local +X, as the Component Viewer's Spot Light does)
//   entities     { id, name, type, transform: { location, rotation (deg), scale }, props, locked, visible, layer }
//                layer 'base' = authored lobby items (ship locked); layer 'premium' = objects a Premium user adds
//   hotspots     { id, name, anchor, view: { target, yaw, pitch (deg), distance, focal (mm) }, target: { entity, slot },
//                options: [{ label, color }], choice }. Anchor, view target and yaw are in the target entity's frame,
//                so the dots and views follow the car when it moves or spins on the turntable.
//   start        the opening camera view (world space); Preview returns here when a hotspot is closed
//
// Roles. The Designer previews the two player tiers: on Basic the premium layer is hidden and refuses edits; on
// Premium the user adds and edits their own objects there. Authored base items are locked in both tiers until the
// author unlocks them (the lock on each Outliner row).

export const LEVEL_SCHEMA = 'frontier.level.v1';
export const ROLES = ['basic', 'premium'];
export const LAYERS = ['base', 'premium'];

// Entity types. `shape` is the primitive geometry; `light` types live in environment.lights.
export const ENTITY_TYPES = {
  Vehicle: { label: 'Vehicle', icon: 'vehicle' },
  Turntable: { label: 'Turntable', icon: 'rotate' },
  Primitive: { label: 'Primitive', icon: 'cube' },
  StaticMesh: { label: 'Static Mesh', icon: 'box' },
};

export const PRIMITIVE_SHAPES = {
  box: { label: 'Box', icon: 'box', size: [1, 1, 1] },
  sphere: { label: 'Sphere', icon: 'sphere', size: [1, 1, 1] },
  cylinder: { label: 'Cylinder', icon: 'capsule', size: [1, 1, 1] },
  plinth: { label: 'Plinth', icon: 'layers', size: [2.4, 0.3, 1.2] },
  panel: { label: 'Wall panel', icon: 'viewport', size: [3, 2.4, 0.08] },
};

export const LIGHT_TYPES = {
  point: { label: 'Point Light', icon: 'bulb' },
  spot: { label: 'Spot Light', icon: 'spot' },
  area: { label: 'Area Light', icon: 'viewport' },
};
export const MAX_LIGHTS = 8;

// Vehicle colour slots: the configurable parts of the ControlVehicle and the palette families they recolour.
export const VEHICLE_SLOTS = {
  paint: { label: 'Paint', families: [6] },
  glass: { label: 'Glass', families: [7] },
  trim: { label: 'Trim', families: [8] },
  tyre: { label: 'Tyres', families: [9] },
  rim: { label: 'Rims', families: [10] },
  lights: { label: 'Headlights', families: [13] },
};

export const VEHICLE_COLOURS = { paint: '#9fb3c8', glass: '#1b2129', trim: '#24272c', tyre: '#1c1c1e', rim: '#c3c8cf', lights: '#f2f5ff' };

// Neutral environment presets. `Lobby` is the default (the reference photo: pale blue sky over a white cyclorama).
export const ENVIRONMENT_PRESETS = {
  lobby: {
    label: 'Lobby',
    sky: { top: '#6fa6db', horizon: '#c6dbef', ground: '#c9d2dc', exposure: 1.0 },
    sun: { azimuth: 148, elevation: 30, intensity: 2.8, color: '#fff6ea', softness: 0.55 },
    studio: { wall: '#e6eaef', floor: '#cfd6df', gloss: 0.72, radius: 13, height: 5.2, wave: 1.6, cove: 2.2, fill: 0.8 },
  },
  overcast: {
    label: 'Overcast',
    sky: { top: '#b7c2cc', horizon: '#e7eaee', ground: '#cfd3d8', exposure: 1.05 },
    sun: { azimuth: 30, elevation: 55, intensity: 1.1, color: '#ffffff', softness: 0.9 },
    studio: { wall: '#eceef0', floor: '#d9dce0', gloss: 0.5, radius: 13, height: 5.2, wave: 1.6, cove: 2.2, fill: 1.2 },
  },
  dusk: {
    label: 'Dusk',
    sky: { top: '#5d6f9a', horizon: '#f2c9a4', ground: '#b9aca4', exposure: 0.95 },
    sun: { azimuth: 95, elevation: 9, intensity: 2.2, color: '#ffc58f', softness: 0.45 },
    studio: { wall: '#ece4dc', floor: '#d6ccc4', gloss: 0.8, radius: 13, height: 5.2, wave: 1.6, cove: 2.2, fill: 0.7 },
  },
  showroom: {
    label: 'Showroom',
    sky: { top: '#3b4048', horizon: '#8c939c', ground: '#5d636b', exposure: 1.0 },
    sun: { azimuth: 40, elevation: 62, intensity: 1.4, color: '#ffffff', softness: 0.7 },
    studio: { wall: '#c9cdd2', floor: '#a9afb7', gloss: 0.9, radius: 13, height: 6.5, wave: 0, cove: 2.6, fill: 0.6 },
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const vec = (v, fallback) => (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(+n)) ? v.map(Number) : fallback.slice());
const num = (v, fallback) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : fallback);
const colour = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);

export function transform(location = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return { location: location.slice(), rotation: rotation.slice(), scale: scale.slice() };
}

// ------------------------------------------------------------------------------------------------- the Lobby level
// Hotspot views look at the car from where a buyer would stand. CameraRig yaw: 0 puts the camera on +Z (the car's
// right side), 90 on +X (the nose). Anchors sit on the car's surface; the vehicle's +X is forward.
export function createLobbyLevel() {
  const env = clone(ENVIRONMENT_PRESETS.lobby);
  delete env.label;
  return normaliseLevel({
    schema: LEVEL_SCHEMA,
    name: 'Lobby',
    environment: {
      preset: 'lobby',
      ...env,
      lights: [
        { id: 'L1', name: 'Softbox', type: 'area', transform: transform([0.2, 4.4, 0], [0, 0, -90]), color: '#ffffff', intensity: 2.2, width: 5, height: 2.4, layer: 'base', locked: true, visible: true },
        { id: 'L2', name: 'Rim Light', type: 'spot', transform: transform([-6.5, 3.2, -4.5], [0, -34.7, -18.2]), color: '#dfe9ff', intensity: 40, range: 22, angle: 30, layer: 'base', locked: true, visible: true },
      ],
    },
    entities: [
      { id: 'E1', name: 'Turntable', type: 'Turntable', transform: transform([0, 0, 0]), props: { radius: 3.4, color: '#dfe3e8', spin: 0 }, locked: true, layer: 'base' },
      { id: 'E2', name: 'ControlVehicle', type: 'Vehicle', transform: transform([0, 0.012, 0]), props: { colours: { ...VEHICLE_COLOURS }, wing: true }, locked: true, layer: 'base' },
    ],
    start: { target: [0, 1.1, 0], yaw: 50, pitch: 8, distance: 16, focal: 35 },
    hotspots: [
      { id: 'H1', name: 'Paint', anchor: [0.05, 0.98, 1.27], view: { target: [0, 0.8, 0], yaw: 55, pitch: 10, distance: 14.5, focal: 35 }, target: { entity: 'E2', slot: 'paint' },
        options: [['Ice Blue', '#9fb3c8'], ['Arctic White', '#eef0f2'], ['Graphite', '#3c4148'], ['Racing Yellow', '#e9c13b'], ['Signal Red', '#b8262c'], ['Deep Teal', '#1f5f66']] },
      { id: 'H2', name: 'Front wheel', anchor: [1.727, 0.51, 1.3], view: { target: [1.6, 0.55, 1.05], yaw: 30, pitch: 9, distance: 5.6, focal: 35 }, target: { entity: 'E2', slot: 'rim' },
        options: [['Satin Silver', '#c3c8cf'], ['Gloss Black', '#17181a'], ['Bronze', '#8c6a3f'], ['Gunmetal', '#4b5058'], ['Electric Blue', '#2f6fe0']] },
      { id: 'H3', name: 'Rear wheel', anchor: [-1.669, 0.51, 1.3], view: { target: [-1.55, 0.55, 1.05], yaw: -30, pitch: 9, distance: 5.6, focal: 35 }, target: { entity: 'E2', slot: 'tyre' },
        options: [['Black', '#1c1c1e'], ['Charcoal', '#34363a'], ['Stone', '#9a958c'], ['Tan', '#8a6b4a']] },
      { id: 'H4', name: 'Headlights', anchor: [3.02, 0.88, 0.78], view: { target: [2.85, 0.8, 0.5], yaw: 62, pitch: 7, distance: 4.6, focal: 35 }, target: { entity: 'E2', slot: 'lights' },
        options: [['Cool White', '#f2f5ff'], ['Warm White', '#ffe2b0'], ['Ice', '#c9e6ff'], ['Amber', '#ffb238']] },
      { id: 'H5', name: 'Interior / glass', anchor: [0.1, 1.48, 1.0], view: { target: [0.2, 1.2, 0.3], yaw: 30, pitch: 20, distance: 7, focal: 35 }, target: { entity: 'E2', slot: 'glass' },
        options: [['Smoke', '#1b2129'], ['Clear', '#5b6a76'], ['Privacy', '#0c0e11'], ['Bronze tint', '#3a2d21']] },
      { id: 'H6', name: 'Wing / trim', anchor: [-2.98, 1.64, 0.9], view: { target: [-2.7, 1.3, 0], yaw: -128, pitch: 18, distance: 6.4, focal: 35 }, target: { entity: 'E2', slot: 'trim' },
        options: [['Carbon', '#24272c'], ['Gloss Black', '#0f1012'], ['Satin White', '#e4e6e8'], ['Ice Blue', '#9fb3c8']] },
    ].map((h) => ({ ...h, options: h.options.map(([label, color]) => ({ label, color })), choice: 0 })),
  });
}

// ------------------------------------------------------------------------------------------------------ normalise
// Fills defaults and drops anything malformed, so imported JSON can never break the Designer.
export function normaliseLevel(input) {
  const src = input && typeof input === 'object' ? input : {};
  const preset = ENVIRONMENT_PRESETS[src.environment && src.environment.preset] || ENVIRONMENT_PRESETS.lobby;
  const e = src.environment || {};
  const sky = e.sky || {}, sun = e.sun || {}, studio = e.studio || {};
  const level = {
    schema: LEVEL_SCHEMA,
    name: typeof src.name === 'string' && src.name.trim() ? src.name.trim() : 'Lobby',
    environment: {
      preset: ENVIRONMENT_PRESETS[e.preset] ? e.preset : 'custom',
      sky: { top: colour(sky.top, preset.sky.top), horizon: colour(sky.horizon, preset.sky.horizon), ground: colour(sky.ground, preset.sky.ground), exposure: num(sky.exposure, preset.sky.exposure) },
      sun: { azimuth: num(sun.azimuth, preset.sun.azimuth), elevation: Math.max(-5, Math.min(90, num(sun.elevation, preset.sun.elevation))), intensity: Math.max(0, num(sun.intensity, preset.sun.intensity)), color: colour(sun.color, preset.sun.color), softness: Math.max(0, Math.min(1, num(sun.softness, preset.sun.softness))) },
      studio: Object.fromEntries(Object.entries(preset.studio).map(([k, d]) => [k, typeof d === 'string' ? colour(studio[k], d) : num(studio[k], d)])),
      lights: (Array.isArray(e.lights) ? e.lights : []).filter((l) => l && LIGHT_TYPES[l.type]).slice(0, MAX_LIGHTS).map(normaliseLight),
    },
    entities: (Array.isArray(src.entities) ? src.entities : []).filter((x) => x && ENTITY_TYPES[x.type]).map(normaliseEntity),
    hotspots: (Array.isArray(src.hotspots) ? src.hotspots : []).filter(Boolean).map(normaliseHotspot),
    start: normaliseHotspot({ view: src.start || { target: [0, 1.1, 0], yaw: 50, pitch: 8, distance: 16, focal: 35 } }).view,
  };
  level.environment.studio.gloss = Math.max(0, Math.min(1, level.environment.studio.gloss));
  dedupeIds(level);
  return level;
}

function normaliseTransform(t = {}) {
  return { location: vec(t.location, [0, 0, 0]), rotation: vec(t.rotation, [0, 0, 0]), scale: vec(t.scale, [1, 1, 1]) };
}

function normaliseLight(l) {
  return {
    id: String(l.id || ''), name: String(l.name || LIGHT_TYPES[l.type].label), type: l.type, transform: normaliseTransform(l.transform),
    color: colour(l.color, '#ffffff'), intensity: Math.max(0, num(l.intensity, l.type === 'spot' ? 30 : l.type === 'area' ? 2 : 8)),
    range: Math.max(0, num(l.range, 16)), angle: Math.max(1, Math.min(89, num(l.angle, 30))), width: Math.max(0.05, num(l.width, 3)), height: Math.max(0.05, num(l.height, 1.5)),
    layer: l.layer === 'premium' ? 'premium' : 'base', locked: !!l.locked, visible: l.visible !== false,
  };
}

function normaliseEntity(x) {
  const props = x.props && typeof x.props === 'object' ? clone(x.props) : {};
  if (x.type === 'Vehicle') props.colours = Object.fromEntries(Object.entries(VEHICLE_COLOURS).map(([k, d]) => [k, colour(props.colours && props.colours[k], d)]));
  if (x.type === 'Primitive') { props.shape = PRIMITIVE_SHAPES[props.shape] ? props.shape : 'box'; props.color = colour(props.color, '#d8dce2'); props.roughness = Math.max(0, Math.min(1, num(props.roughness, 0.5))); props.metalness = Math.max(0, Math.min(1, num(props.metalness, 0))); }
  if (x.type === 'Turntable') { props.radius = Math.max(0.5, num(props.radius, 3.4)); props.color = colour(props.color, '#dfe3e8'); props.spin = num(props.spin, 0); }
  return { id: String(x.id || ''), name: String(x.name || ENTITY_TYPES[x.type].label), type: x.type, transform: normaliseTransform(x.transform), props, locked: !!x.locked, visible: x.visible !== false, layer: x.layer === 'premium' ? 'premium' : 'base' };
}

function normaliseHotspot(h) {
  const v = h.view || {};
  const options = (Array.isArray(h.options) ? h.options : []).filter((o) => o && colour(o.color, null)).map((o) => ({ label: String(o.label || o.color), color: colour(o.color, '#ffffff') }));
  return {
    id: String(h.id || ''), name: String(h.name || 'Hotspot'), anchor: vec(h.anchor, [0, 1, 0]),
    view: { target: vec(v.target, [0, 0.7, 0]), yaw: num(v.yaw, 45), pitch: Math.max(-89, Math.min(89, num(v.pitch, 12))), distance: Math.max(0.2, num(v.distance, 5)), focal: Math.max(8, Math.min(300, num(v.focal, 50))) },
    target: { entity: String((h.target && h.target.entity) || ''), slot: VEHICLE_SLOTS[h.target && h.target.slot] ? h.target.slot : 'paint' },
    options, choice: Math.max(0, Math.min(options.length - 1, Math.round(num(h.choice, 0)))) || 0,
  };
}

// Every record gets a unique id with its collection's prefix (E entities, L lights, H hotspots).
function dedupeIds(level) {
  const seen = new Set();
  const fix = (list, prefix) => { for (const r of list) { if (!r.id || seen.has(r.id)) r.id = nextId(level, prefix, seen); seen.add(r.id); } };
  fix(level.entities, 'E'); fix(level.environment.lights, 'L'); fix(level.hotspots, 'H');
}

export function nextId(level, prefix, taken = null) {
  const used = taken || new Set(allRecords(level).map((r) => r.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// ------------------------------------------------------------------------------------------------------- queries
export function allRecords(level) {
  return [...level.entities, ...level.environment.lights, ...level.hotspots];
}

export function findRecord(level, id) {
  return allRecords(level).find((r) => r.id === id) || null;
}

// 'entity' | 'light' | 'hotspot' | null
export function recordSort(level, id) {
  if (level.entities.some((r) => r.id === id)) return 'entity';
  if (level.environment.lights.some((r) => r.id === id)) return 'light';
  if (level.hotspots.some((r) => r.id === id)) return 'hotspot';
  return null;
}

// Hotspots are authoring records (never locked); the premium layer follows the role; base items follow their lock.
export function queryEditable(level, id, role) {
  const r = findRecord(level, id);
  if (!r) return false;
  if (recordSort(level, id) === 'hotspot') return true;
  if (r.layer === 'premium') return role === 'premium';
  return !r.locked;
}

// Premium objects are visible to Premium users only.
export function queryShown(record, role) {
  if (!record) return false;
  if (record.layer === 'premium' && role !== 'premium') return false;
  return record.visible !== false;
}

export function levelStats(level, role = 'premium') {
  const shown = allRecords(level).filter((r) => r.layer === undefined || queryShown(r, role));
  return { entities: level.entities.filter((r) => queryShown(r, role)).length, lights: level.environment.lights.filter((r) => queryShown(r, role)).length, hotspots: level.hotspots.length, premium: allRecords(level).filter((r) => r.layer === 'premium').length, shown: shown.length };
}

// ------------------------------------------------------------------------------------------------------ edits
// Each edit returns { ok, record?, reason? } and never throws on a refused edit, so the UI can toast the reason.
export function addPrimitive(level, role, shape, { location = [2.5, 0, 2.5], name } = {}) {
  if (role !== 'premium') return { ok: false, reason: 'Adding objects is a Premium feature' };
  const spec = PRIMITIVE_SHAPES[shape];
  if (!spec) return { ok: false, reason: `Unknown shape ${shape}` };
  const y = location[1] + (shape === 'panel' ? spec.size[1] / 2 : spec.size[1] / 2);
  const record = normaliseEntity({ id: nextId(level, 'E'), name: uniqueName(level, name || spec.label), type: 'Primitive', transform: transform([location[0], y, location[2]], [0, 0, 0], spec.size), props: { shape, color: '#d8dce2' }, layer: 'premium' });
  level.entities.push(record);
  return { ok: true, record };
}

export function addMesh(level, role, asset, { location = [2.5, 0, 2.5] } = {}) {
  if (role !== 'premium') return { ok: false, reason: 'Adding objects is a Premium feature' };
  if (!asset || !asset.id) return { ok: false, reason: 'No compiled asset' };
  const record = normaliseEntity({ id: nextId(level, 'E'), name: uniqueName(level, String(asset.name || 'Mesh').replace(/[^\w]+/g, '')), type: 'StaticMesh', transform: transform(location), props: { asset: asset.id, assetName: asset.name }, layer: 'premium' });
  level.entities.push(record);
  return { ok: true, record };
}

// Lights: Premium users add theirs to the premium layer; the cap keeps the forward renderer cheap.
export function addLight(level, role, type, { location = [2, 3, 2] } = {}) {
  if (role !== 'premium') return { ok: false, reason: 'Adding lights is a Premium feature' };
  if (!LIGHT_TYPES[type]) return { ok: false, reason: `Unknown light ${type}` };
  if (level.environment.lights.length >= MAX_LIGHTS) return { ok: false, reason: `At most ${MAX_LIGHTS} lights` };
  const record = normaliseLight({ id: nextId(level, 'L'), name: uniqueName(level, LIGHT_TYPES[type].label.replace(/\s+/g, '')), type, transform: transform(location, type === 'point' ? [0, 0, 0] : [0, 0, -90]), layer: 'premium' });
  level.environment.lights.push(record);
  return { ok: true, record };
}

export function addHotspot(level, view, { name = 'Hotspot', anchor, target = { entity: '', slot: 'paint' } } = {}) {
  const record = normaliseHotspot({ id: nextId(level, 'H'), name: uniqueName(level, name), anchor: anchor || view.target, view, target, options: [{ label: 'Default', color: '#ffffff' }] });
  level.hotspots.push(record);
  return { ok: true, record };
}

export function removeRecord(level, id, role) {
  const sort = recordSort(level, id);
  if (!sort) return { ok: false, reason: 'Nothing selected' };
  if (!queryEditable(level, id, role)) return { ok: false, reason: refusal(level, id, role) };
  const list = sort === 'entity' ? level.entities : sort === 'light' ? level.environment.lights : level.hotspots;
  const at = list.findIndex((r) => r.id === id);
  const [record] = list.splice(at, 1);
  // A hotspot aimed at a removed entity keeps its view but loses its target.
  if (sort === 'entity') for (const h of level.hotspots) if (h.target.entity === id) h.target.entity = '';
  return { ok: true, record };
}

export function duplicateRecord(level, id, role) {
  const sort = recordSort(level, id);
  const src = findRecord(level, id);
  if (!src) return { ok: false, reason: 'Nothing selected' };
  if (sort !== 'hotspot' && role !== 'premium') return { ok: false, reason: 'Duplicating objects is a Premium feature' };
  if (sort === 'light' && level.environment.lights.length >= MAX_LIGHTS) return { ok: false, reason: `At most ${MAX_LIGHTS} lights` };
  if (sort === 'entity' && src.type === 'Vehicle') return { ok: false, reason: 'The lobby holds one vehicle' };
  const copy = clone(src);
  copy.id = nextId(level, sort === 'entity' ? 'E' : sort === 'light' ? 'L' : 'H');
  copy.name = uniqueName(level, src.name);
  if (sort !== 'hotspot') { copy.layer = 'premium'; copy.locked = false; copy.transform.location[0] += 0.6; copy.transform.location[2] += 0.6; }
  else copy.anchor[1] += 0.2;
  (sort === 'entity' ? level.entities : sort === 'light' ? level.environment.lights : level.hotspots).push(copy);
  return { ok: true, record: copy };
}

export function writeTransform(level, id, role, next) {
  const r = findRecord(level, id);
  if (!r) return { ok: false, reason: 'Nothing selected' };
  if (!queryEditable(level, id, role)) return { ok: false, reason: refusal(level, id, role) };
  if (recordSort(level, id) === 'hotspot') { r.anchor = vec(next.location, r.anchor); return { ok: true, record: r }; }
  r.transform = normaliseTransform({ ...r.transform, ...next });
  return { ok: true, record: r };
}

export function toggleLock(level, id) {
  const r = findRecord(level, id);
  if (!r || recordSort(level, id) === 'hotspot' || r.layer === 'premium') return { ok: false, reason: 'Only authored items lock' };
  r.locked = !r.locked;
  return { ok: true, record: r };
}

export function refusal(level, id, role) {
  const r = findRecord(level, id);
  if (!r) return 'Nothing selected';
  if (r.layer === 'premium' && role !== 'premium') return 'Premium objects are edited on the Premium tier';
  if (r.locked) return `${r.name} is a locked lobby item`;
  return '';
}

function uniqueName(level, name) {
  const names = new Set(allRecords(level).map((r) => r.name));
  if (!names.has(name)) return name;
  const stem = name.replace(/\d+$/, '');
  let n = 2;
  while (names.has(`${stem}${n}`)) n++;
  return `${stem}${n}`;
}

// ------------------------------------------------------------------------------------------------------ hotspots
// The camera pose a hotspot flies to, in CameraRig units (radians); and the reverse, capturing the live pose.
export function hotspotPose(hotspot) {
  const v = hotspot.view;
  return { target: v.target.slice(), yaw: (v.yaw * Math.PI) / 180, pitch: (v.pitch * Math.PI) / 180, distance: v.distance, focal: v.focal };
}

export function captureView(hotspot, pose) {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  hotspot.view = { target: pose.target.map(r3), yaw: r3((pose.yaw * 180) / Math.PI), pitch: r3((pose.pitch * 180) / Math.PI), distance: r3(pose.distance), focal: r3(pose.focal) };
  return hotspot.view;
}

// Picks option `index` of a hotspot and writes its colour into the target vehicle slot. Returns the colour applied.
export function applyOption(level, hotspotId, index) {
  const h = level.hotspots.find((x) => x.id === hotspotId);
  if (!h || !h.options[index]) return null;
  h.choice = index;
  const target = level.entities.find((e) => e.id === h.target.entity);
  if (target && target.type === 'Vehicle') target.props.colours[h.target.slot] = h.options[index].color;
  return h.options[index].color;
}

// ---------------------------------------------------------------------------------------------------- environment
export function applyPreset(level, name) {
  const p = ENVIRONMENT_PRESETS[name];
  if (!p) return false;
  const env = level.environment;
  env.preset = name;
  env.sky = clone(p.sky); env.sun = clone(p.sun); env.studio = clone(p.studio);
  return true;
}

// Sun direction (unit vector toward the sun, Y-up): azimuth from +Z toward +X, elevation above the horizon.
export function sunDirection(sun) {
  const a = (sun.azimuth * Math.PI) / 180, e = (sun.elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

// --------------------------------------------------------------------------------------------- serialise · history
export function exportLevel(level) {
  return JSON.stringify(level, null, 2);
}

export function importLevel(text) {
  const parsed = JSON.parse(text);
  if (parsed.schema && parsed.schema !== LEVEL_SCHEMA) throw new Error(`Unsupported schema ${parsed.schema}`);
  return normaliseLevel(parsed);
}

// Problems a level author should see in Details (never blocks saving).
export function checkLevel(level) {
  const issues = [];
  if (!level.entities.some((e) => e.type === 'Vehicle')) issues.push({ level: 'warn', text: 'No vehicle: the configurator has nothing to show' });
  for (const h of level.hotspots) {
    if (!level.entities.some((e) => e.id === h.target.entity)) issues.push({ level: 'warn', id: h.id, text: `${h.name}: no target entity` });
    if (!h.options.length) issues.push({ level: 'warn', id: h.id, text: `${h.name}: no options` });
  }
  if (level.environment.lights.length >= MAX_LIGHTS) issues.push({ level: 'info', text: `Light budget full (${MAX_LIGHTS})` });
  return issues;
}

// Snapshot history: push after each committed edit; undo / redo return a fresh copy of the level.
export function createHistory(level, limit = 64) {
  const past = [exportLevel(level)];
  let at = 0;
  return {
    push(next) { const s = exportLevel(next); if (s === past[at]) return false; past.splice(at + 1); past.push(s); if (past.length > limit) past.shift(); at = past.length - 1; return true; },
    undo() { if (at === 0) return null; at--; return JSON.parse(past[at]); },
    redo() { if (at >= past.length - 1) return null; at++; return JSON.parse(past[at]); },
    get depth() { return at; },
    get size() { return past.length; },
  };
}
