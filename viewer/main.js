/**
 * Viewer for the procedural roof generator.
 *
 * Imports the core straight into the browser — the same modules the CLI and the
 * validator run — so what you see here is the geometry that the checks assert on.
 * Parameter changes rebuild the roof live.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildRoof } from '../src/core/build-roof.js';
import { PRESETS, presetSpec, mergeSpec, DEFAULT_SPEC } from '../src/core/spec.js';
import { FORM_TABLE } from '../src/core/surface.js';
import { TILE_CATALOG } from '../src/core/tiles.js';

const stage = document.getElementById('stage');
const hud = document.getElementById('hud');

// ── renderer / scene ──────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141821);
scene.fog = new THREE.Fog(0x141821, 60, 190);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
camera.position.set(15, 11, 17);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;

const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x2a2622, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2df, 1.05);
sun.position.set(-16, 26, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const cam = sun.shadow.camera;
cam.left = -22; cam.right = 22; cam.top = 22; cam.bottom = -22; cam.far = 90;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fb8ff, 0.28);
fill.position.set(14, 9, -12);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x2c3130, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(160, 80, 0x3d4450, 0x272c34);
grid.position.y = 0.002;
scene.add(grid);

// ── state ─────────────────────────────────────────────────────────────────────
const state = {
  preset: 'minka',
  spec: presetSpec('minka'),
  explode: 0,
  wire: false,
  hidden: new Set(),
  lengthSegments: 3,      // rebuild latency: 3 stations per tile is plenty at this scale
};
const group = new THREE.Group();
scene.add(group);

const LAYER_ORDER = [
  ['tiles', '瓦 tiles (incl. eave row)'],
  ['ridge', '棟 ridge + 鬼瓦'],
  ['hipRidge', '隅棟 hips'],
  ['verge', '破風/袖瓦 verges'],
  ['bargeboard', '破風 boards'],
  ['battens', '瓦桟 battens'],
  ['deck', '野地板 sheathing'],
  ['underlay', 'ルーフィング underlay'],
  ['rafters', '垂木 rafters'],
  ['hiprafters', '隅木 hip rafters'],
  ['purlins', '母屋 purlins'],
  ['ridgebeam', '棟木 ridge beam'],
  ['frame', '軸組 frame'],
  ['eaveBoard', '茅負/広小舞 eave board'],
  ['volume', '躯体 body'],
  ['lanterns', '提灯 lanterns'],
];

const MATERIAL_BY_PART = {
  tiles: 'tile', 'tiles.eave': 'tileEave', ridge: 'ridge', hipRidge: 'ridge',
  verge: 'tileEave', eaveBoard: 'woodDark', bargeboard: 'woodDark', battens: 'woodDark',
  deck: 'deck', underlay: 'underlayment', rafters: 'wood', hiprafters: 'wood',
  purlins: 'woodDark', ridgebeam: 'woodDark', frame: 'woodDark', lanterns: 'glow',
  volume: 'volume',
};

const materials = {};
function material(key, colour, opts = {}) {
  const m = materials[key] ?? (materials[key] = new THREE.MeshStandardMaterial({
    color: colour, roughness: 0.82, metalness: 0.03, flatShading: true, ...opts,
  }));
  m.color.set(colour);
  m.wireframe = state.wire;
  return m;
}

function explodeOffset(partId) {
  if (!state.explode) return 0;
  const order = ['volume', 'frame', 'ridgebeam', 'purlins', 'hiprafters', 'rafters',
    'underlay', 'deck', 'battens', 'eaveBoard', 'bargeboard', 'verge', 'hipRidge', 'ridge', 'tiles', 'lanterns'];
  const i = Math.max(0, order.indexOf(partId));
  return i * state.explode * 0.22;
}

// ── build ─────────────────────────────────────────────────────────────────────
function boundsOf(parts) {
  const box = new THREE.Box3();
  for (const p of parts) {
    for (let i = 0; i + 2 < p.positions.length; i += 3) {
      box.expandByPoint(new THREE.Vector3(p.positions[i], p.positions[i + 1], p.positions[i + 2]));
    }
  }
  return box;
}

let buildMs = 0;
function rebuild({ resetCamera = false } = {}) {
  const t0 = performance.now();
  const roof = buildRoof(state.spec, { lengthSegments: state.lengthSegments });
  buildMs = performance.now() - t0;

  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose();
  }
  const visible = [];
  for (const part of roof.parts) {
    const key = part.id === 'tiles' ? 'tiles'
      : part.id === 'tiles.eave' ? 'tiles' : part.id;
    if (state.hidden.has(key)) continue;
    if (!part.positions.length) continue;
    const matKey = MATERIAL_BY_PART[part.id] ?? 'wood';
    const colour = state.spec.palette[matKey] ?? '#888888';
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material(matKey + (state.wire ? '-wire' : ''), colour));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const y = explodeOffset(part.id);
    mesh.position.y = y;
    group.add(mesh);
    visible.push(part);
  }

  const box = boundsOf(visible);
  const size = box.getSize(new THREE.Vector3());
  if (resetCamera) {
    const dist = Math.max(size.x, size.z) * 1.5 + size.y;
    camera.position.set(dist * 0.72, size.y * 0.9 + dist * 0.35, dist * 0.72);
    controls.target.set(0, size.y * 0.55, 0);
  }
  controls.update();

  const tris = visible.reduce((s, p) => s + p.positions.length / 9, 0);
  const f = roof.report.faces;
  const tileCount = roof.report.counts.tiles ?? 0;
  const adj = roof.report.counts.adjustedTiles ?? 0;
  hud.innerHTML = `<b>${roof.spec.form}</b> · ${roof.tile.name} · pitch ${(roof.report.pitchDeg).toFixed(1)}°`
    + ` · ${tileCount} tiles (${adj} 調整瓦) · ${roof.report.totalRoofArea.toFixed(1)} m² · ~${Math.round(roof.report.massEstimateKg)} kg`
    + ` · coverage ${roof.report.coverageFactor.toFixed(2)}<br>ridge ${roof.report.ridgeLength.toFixed(2)} m`
    + ` · hip run ${(roof.report.hipRun ?? 0).toFixed(2)} m · faces ${f.length}`
    + ` · ${tris.toLocaleString()} triangles · built in ${buildMs.toFixed(0)} ms`;
}

// ── ui ────────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const presetSelect = $('preset');
for (const [name, preset] of Object.entries(PRESETS)) {
  presetSelect.append(new Option(`${name} — ${preset.label}`, name));
}
presetSelect.value = state.preset;

const formSelect = $('form');
for (const [key, def] of Object.entries(FORM_TABLE)) {
  formSelect.append(new Option(`${key}  (${def.region})`, key));
}

const tileSelect = $('tile');
for (const [key, tile] of Object.entries(TILE_CATALOG)) {
  tileSelect.append(new Option(`${key} — ${tile.name}`, key));
}

function syncControls() {
  const s = state.spec;
  formSelect.value = s.form;
  tileSelect.value = s.tiles.id;
  $('tileColour').value = s.palette.tile;
  $('woodColour').value = s.palette.wood;
  $('overhang').value = s.overhang.eave;
  $('gable').value = s.overhang.gable;
  $('pitch').value = s.pitch.sun;
  const r = s.frame?.rafter?.width ?? 0.045;
  const diam = s.curvature.corner.rafterDiam ?? r * 2.2;
  const on = s.curvature.corner.enabled !== false;
  $('sweep').value = on ? (s.curvature.corner.qiaoFactor ?? 4) * diam : 0;
  $('push').value = on ? (s.curvature.corner.chongFactor ?? 3) * diam : 0;
}

const layerHost = $('layers');
for (const [id, label] of LAYER_ORDER) {
  const l = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = true;
  cb.addEventListener('change', () => {
    if (cb.checked) state.hidden.delete(id); else state.hidden.add(id);
    rebuild();
  });
  l.append(cb, Object.assign(document.createElement('span'), { textContent: label }));
  layerHost.append(l);
}

function withSpec(patch, resetCamera = false) {
  state.spec = mergeSpec(presetSpec(state.preset), { ...structuredClone(state.spec), ...patch });
  rebuild({ resetCamera });
}

presetSelect.addEventListener('change', () => {
  state.preset = presetSelect.value;
  state.spec = presetSpec(state.preset);
  syncControls();
  // the layer set of another preset may be empty; keep the checkboxes as they are
  rebuild({ resetCamera: true });
});
formSelect.addEventListener('change', () => withSpec({ form: formSelect.value }, true));
tileSelect.addEventListener('change', () => withSpec({ tiles: { ...state.spec.tiles, id: tileSelect.value } }));
$('tileColour').addEventListener('input', (e) => withSpec({ palette: { ...state.spec.palette, tile: e.target.value, ridge: shade(e.target.value, -0.12) } }));
$('woodColour').addEventListener('input', (e) => withSpec({ palette: { ...state.spec.palette, wood: e.target.value, woodDark: shade(e.target.value, -0.32) } }));
$('overhang').addEventListener('input', (e) => withSpec({ overhang: { ...state.spec.overhang, eave: +e.target.value, rear: +e.target.value } }));
$('gable').addEventListener('input', (e) => withSpec({ overhang: { ...state.spec.overhang, gable: +e.target.value } }));
$('pitch').addEventListener('input', (e) => withSpec({ pitch: { ...state.spec.pitch, sun: +e.target.value } }, true));
// 起翘 / 冲出 are expressed in rafter diameters, the way carpenters set them out
function cornerPatch() {
  const r = state.spec.frame?.rafter?.width ?? 0.045;
  const diam = state.spec.curvature.corner.rafterDiam ?? r * 2.2;
  const lift = +$('sweep').value, push = +$('push').value;
  return {
    curvature: {
      ...state.spec.curvature,
      corner: {
        ...state.spec.curvature.corner,
        enabled: lift > 0.001 || push > 0.001,
        rafterDiam: diam,
        qiaoFactor: lift / diam,
        chongFactor: push / diam,
      },
    },
  };
}
$('sweep').addEventListener('input', () => withSpec(cornerPatch()));
$('push').addEventListener('input', () => withSpec(cornerPatch()));
$('explode').addEventListener('input', (e) => { state.explode = +e.target.value; rebuild(); });
$('wire').addEventListener('change', (e) => { state.wire = e.target.checked; rebuild(); });

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0, 1));
  return `#${c.getHexString()}`;
}

const size = new THREE.Vector3();
function fit() {
  const box = boundsOf(group.children.map((m) => ({ positions: m.geometry.attributes.position.array })));
  box.getSize(size);
}
$('btnIso').addEventListener('click', () => view('iso'));
$('btnGable').addEventListener('click', () => view('gable'));
$('btnCorner').addEventListener('click', () => view('corner'));
$('btnTop').addEventListener('click', () => view('top'));

function view(kind) {
  const box = new THREE.Box3().setFromObject(group);
  box.getSize(size);
  const c = box.getCenter(new THREE.Vector3());
  const d = Math.max(size.x, size.z) * 1.6 + size.y;
  const targets = {
    iso: [c.x, c.y * 0.9, c.z],
    gable: [c.x, c.y, c.z],
    corner: [box.max.x - size.x * 0.12, box.min.y + size.y * 0.35, box.max.z - size.z * 0.12],
    top: [c.x, c.y, c.z],
  };
  controls.target.set(...targets[kind]);
  const dirs = {
    iso: [0.62, 0.45, 0.64],
    gable: [0.02, 0.12, 1.0],
    corner: [0.66, 0.34, 0.66],
    top: [0.0001, 1.0, 0.0001],
  };
  const dir = dirs[kind].map((v) => v * (kind === 'corner' ? d * 0.52 : d));
  camera.position.set(controls.target.x + dir[0], controls.target.y + dir[1], controls.target.z + dir[2]);
  controls.update();
}

// ── loop ──────────────────────────────────────────────────────────────────────
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

syncControls();
rebuild({ resetCamera: true });
resize();
(function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
})();
