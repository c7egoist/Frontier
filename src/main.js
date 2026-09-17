// ============================================================================
// main.js — app shell: scene, lights, geometry-nodes-style parameter panel
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { GLTFExporter } from '../lib/GLTFExporter.js';
import { buildRoof } from './build.js';

// ---------------------------------------------------------------------------
const Q = new URLSearchParams(location.search);
const P = {
  roofType: Q.get('type') || 'yosemune',
  length: 10, depth: 6.2, wallHeight: 3.0,
  eaveOverhang: 0.75, rakeOverhang: 0.55,
  pitchTop: 33, pitchEave: 21, eaveFlip: 6,
  cornerLift: 0.34, cornerPow: 2.6,
  hipRise: 0.62, gableBreak: 0.30,
  tileModule: 0.30, coverWidth: 0.15, courseHeight: 0.235, tileJitter: 0.5,
  ridgeCapSize: 0.105, plasterFillet: true,
  onigawara: true, onigawaraScale: 1.0,
  shrineChigi: false, chigiHeight: 0.72, katsuogiCount: 4,
  showRafters: true, gableFrame: true,
  tileColor: '#565a60', woodColor: '#4a3628', wallColor: '#2e2620',
  plasterColor: '#ded7c6', fasciaColor: '#20303a',
  seed: 7,
};

const PRESETS = {
  minka: { label: '農家 Minka farmhouse', roofType: 'kirizuma', length: 9, depth: 6, wallHeight: 2.9,
    tileColor: '#7d4a33', woodColor: '#6b5138', wallColor: '#33291f', fasciaColor: '#4a3a2c',
    pitchTop: 35, pitchEave: 24, eaveFlip: 7, shrineChigi: false, onigawara: false, gableFrame: true },
  machiya: { label: '町家 Machiya shop', roofType: 'kirizuma', length: 10, depth: 5.4, wallHeight: 3.2,
    tileColor: '#4c5158', woodColor: '#2e2a28', wallColor: '#262220', fasciaColor: '#1c2f3a',
    pitchTop: 30, pitchEave: 20, shrineChigi: false, onigawara: true, gableFrame: false },
  temple: { label: '寺院 Temple hall', roofType: 'irimoya', length: 12.5, depth: 7.5, wallHeight: 3.6,
    tileColor: '#3d4d68', woodColor: '#3a2b20', wallColor: '#38302a', fasciaColor: '#2a2118',
    pitchTop: 30, pitchEave: 19, onigawaraScale: 1.35, shrineChigi: false, onigawara: true },
  shrine: { label: '神社 Shrine', roofType: 'yosemune', length: 8, depth: 6, wallHeight: 3.0,
    tileColor: '#715137', woodColor: '#54402c', wallColor: '#2c241c', fasciaColor: '#54402c',
    pitchTop: 34, pitchEave: 22, shrineChigi: true, katsuogiCount: 4, onigawara: false },
  gate: { label: '門 Hōgyō gate', roofType: 'hogyo', length: 6.5, depth: 6.5, wallHeight: 2.7,
    tileColor: '#4e5a52', woodColor: '#41321f', wallColor: '#302620', fasciaColor: '#2c241c',
    pitchTop: 38, pitchEave: 26, eaveFlip: 8, cornerLift: 0.42, shrineChigi: false, onigawara: false },
};

// ---------------------------------------------------------------------------
// three.js scene
// ---------------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b9c4cc');
scene.fog = new THREE.Fog('#b9c4cc', 55, 140);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
camera.position.set(14, 9, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;

const hemi = new THREE.HemisphereLight('#cfd8e0', '#5a5148', 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff2dc', 2.2);
sun.position.set(14, 22, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -16;
sun.shadow.camera.right = sun.shadow.camera.top = 16;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight('#8fa0ad', 0.25));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(90, 48),
  new THREE.MeshStandardMaterial({ color: '#8a9187', roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, '#6d7570', '#7d857e');
grid.position.y = 0.001;
grid.material.opacity = 0.35; grid.material.transparent = true;
scene.add(grid);

// ---------------------------------------------------------------------------
// build / rebuild
// ---------------------------------------------------------------------------
let roofGroup = null;
let lastStats = null;
function rebuild() {
  if (roofGroup) {
    scene.remove(roofGroup);
    roofGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.map) o.material.map.dispose();
      if (o.material) o.material.dispose();
    });
  }
  const t0 = performance.now();
  const { group, stats } = buildRoof(P);
  scene.add(group);
  roofGroup = group;
  lastStats = stats;
  const ms = (performance.now() - t0).toFixed(0);
  document.getElementById('stats').innerHTML =
    `<b>${P.roofType}</b> · ${stats.tris.toLocaleString()} tris · built in ${ms} ms<br>` +
    `ridge ${stats.ridgeHeight.toFixed(2)} m · eave ${stats.eaveHeight.toFixed(2)} m · ` +
    `bearing gap ${(stats.bearing * 1000).toFixed(0)} mm ${Math.abs(stats.bearing) < 0.002 ? '✓ seated on plate' : '⚠'}`;
}
rebuild();

// ---------------------------------------------------------------------------
// parameter panel (geometry-nodes style input stack)
// ---------------------------------------------------------------------------
const GROUPS = [
  { name: 'Form', items: [
    { k: 'roofType', label: 'Roof form', kind: 'select', options: [
      ['kirizuma', 'Kirizuma 切妻 — gable'],
      ['yosemune', 'Yosemune 寄棟 — hip'],
      ['irimoya', 'Irimoya 入母屋 — hip & gable'],
      ['hogyo', 'Hōgyō 宝形 — pyramidal']] },
  ]},
  { name: 'Massing', items: [
    { k: 'length', label: 'Length', kind: 'range', min: 4, max: 18, step: 0.1, unit: 'm' },
    { k: 'depth', label: 'Depth', kind: 'range', min: 3, max: 12, step: 0.1, unit: 'm' },
    { k: 'wallHeight', label: 'Wall height', kind: 'range', min: 2.2, max: 5, step: 0.05, unit: 'm' },
    { k: 'eaveOverhang', label: 'Eave overhang', kind: 'range', min: 0.3, max: 1.6, step: 0.05, unit: 'm' },
    { k: 'rakeOverhang', label: 'Gable/rake overhang', kind: 'range', min: 0.2, max: 1.2, step: 0.05, unit: 'm' },
  ]},
  { name: 'Slope & curvature', items: [
    { k: 'pitchTop', label: 'Ridge pitch', kind: 'range', min: 15, max: 50, step: 1, unit: '°' },
    { k: 'pitchEave', label: 'Eave pitch', kind: 'range', min: 10, max: 40, step: 1, unit: '°' },
    { k: 'eaveFlip', label: 'Eave kick (nokiage)', kind: 'range', min: 0, max: 14, step: 0.5, unit: '°' },
    { k: 'cornerLift', label: 'Corner lift (sumi-sori)', kind: 'range', min: 0, max: 0.8, step: 0.02, unit: 'm' },
    { k: 'cornerPow', label: 'Corner falloff', kind: 'range', min: 1.2, max: 5, step: 0.1, unit: '' },
  ]},
  { name: 'Irimoya hip & gable', show: p => p.roofType === 'irimoya', items: [
    { k: 'hipRise', label: 'Hip ridge height', kind: 'range', min: 0.45, max: 0.95, step: 0.01, unit: '×' },
    { k: 'gableBreak', label: 'Gable break point', kind: 'range', min: 0.14, max: 0.55, step: 0.01, unit: '×' },
  ]},
  { name: 'Tiles (hongawara)', items: [
    { k: 'tileModule', label: 'Tile pitch (pan+cover)', kind: 'range', min: 0.2, max: 0.45, step: 0.01, unit: 'm' },
    { k: 'coverWidth', label: 'Cover roll width', kind: 'range', min: 0.09, max: 0.22, step: 0.005, unit: 'm' },
    { k: 'courseHeight', label: 'Course exposure', kind: 'range', min: 0.15, max: 0.4, step: 0.005, unit: 'm' },
    { k: 'tileJitter', label: 'Hand-laid variation', kind: 'range', min: 0, max: 1, step: 0.05, unit: '' },
  ]},
  { name: 'Ridge & ornaments', items: [
    { k: 'ridgeCapSize', label: 'Ridge cap radius', kind: 'range', min: 0.06, max: 0.18, step: 0.005, unit: 'm' },
    { k: 'plasterFillet', label: 'Plaster fillet (shironuri)', kind: 'bool' },
    { k: 'onigawara', label: 'Onigawara ridge ends', kind: 'bool' },
    { k: 'onigawaraScale', label: 'Onigawara size', kind: 'range', min: 0.5, max: 2, step: 0.05, unit: '×', show: p => p.onigawara },
    { k: 'shrineChigi', label: 'Shrine chigi + katsuogi', kind: 'bool' },
    { k: 'chigiHeight', label: 'Chigi height', kind: 'range', min: 0.4, max: 1.2, step: 0.02, unit: 'm', show: p => p.shrineChigi },
    { k: 'katsuogiCount', label: 'Katsuogi logs', kind: 'range', min: 0, max: 8, step: 1, unit: '', show: p => p.shrineChigi },
  ]},
  { name: 'Structure & finish', items: [
    { k: 'showRafters', label: 'Exposed rafters (taruki)', kind: 'bool' },
    { k: 'gableFrame', label: 'Exposed gable frame', kind: 'bool' },
    { k: 'tileColor', label: 'Roof tile', kind: 'color' },
    { k: 'woodColor', label: 'Wood', kind: 'color' },
    { k: 'wallColor', label: 'Wall', kind: 'color' },
    { k: 'plasterColor', label: 'Plaster / gable wall', kind: 'color' },
    { k: 'fasciaColor', label: 'Fascia accent', kind: 'color' },
  ]},
];

const panel = document.getElementById('panel');
function buildPanel() {
  panel.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'p-head';
  head.innerHTML = `<h2>Roof Generator <span>v1 — roofs</span></h2>
    <div class="presets">${Object.entries(PRESETS).map(([k, v]) =>
      `<button data-preset="${k}">${v.label}</button>`).join('')}</div>`;
  panel.appendChild(head);
  head.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    Object.assign(P, PRESETS[b.dataset.preset], { seed: P.seed + 1 });
    buildPanel(); rebuild();
  });

  for (const g of GROUPS) {
    if (g.show && !g.show(P)) continue;
    const box = document.createElement('div');
    box.className = 'group';
    box.innerHTML = `<h3>${g.name}</h3>`;
    for (const it of g.items) {
      if (it.show && !it.show(P)) continue;
      box.appendChild(makeInput(it));
    }
    panel.appendChild(box);
  }
  const actions = document.createElement('div');
  actions.className = 'actions';
  const seedBtn = document.createElement('button');
  seedBtn.textContent = '⟳ Re-seed tiles';
  seedBtn.onclick = () => { P.seed = (Math.random() * 9999) | 0; rebuild(); };
  const expBtn = document.createElement('button');
  expBtn.textContent = '⬇ Export GLB';
  expBtn.onclick = () => {
    new GLTFExporter().parse(roofGroup, (res) => {
      const blob = new Blob([res], { type: 'model/gltf-binary' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `roof-${P.roofType}.glb`;
      a.click();
    }, (e) => console.error(e), { binary: true });
  };
  actions.append(seedBtn, expBtn);
  panel.appendChild(actions);
}
function makeInput(it) {
  const row = document.createElement('div');
  row.className = 'row';
  if (it.kind === 'select') {
    row.innerHTML = `<label>${it.label}</label>`;
    const sel = document.createElement('select');
    for (const [v, t] of it.options) sel.add(new Option(t, v));
    sel.value = P[it.k];
    sel.onchange = () => { P[it.k] = sel.value; buildPanel(); rebuild(); };
    row.appendChild(sel);
  } else if (it.kind === 'range') {
    const val = document.createElement('span');
    val.className = 'val';
    const fmt = v => it.unit === '°' ? `${v.toFixed(0)}${it.unit}` : it.unit === '' ? (it.step >= 1 ? `${v}` : v.toFixed(2)) : `${(+v).toFixed(2).replace(/\.00$/, '')}${it.unit}`;
    val.textContent = fmt(P[it.k]);
    row.innerHTML = `<label>${it.label}</label>`;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = it.min; inp.max = it.max; inp.step = it.step; inp.value = P[it.k];
    inp.oninput = () => {
      P[it.k] = +inp.value; val.textContent = fmt(P[it.k]);
      rebuild();
    };
    row.append(inp, val);
  } else if (it.kind === 'bool') {
    row.classList.add('bool');
    row.innerHTML = `<label>${it.label}</label>`;
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.checked = P[it.k];
    inp.onchange = () => { P[it.k] = inp.checked; buildPanel(); rebuild(); };
    row.appendChild(inp);
  } else if (it.kind === 'color') {
    row.innerHTML = `<label>${it.label}</label>`;
    const inp = document.createElement('input');
    inp.type = 'color'; inp.value = P[it.k];
    inp.oninput = () => { P[it.k] = inp.value; rebuild(); };
    row.appendChild(inp);
  }
  return row;
}
buildPanel();

// ---------------------------------------------------------------------------
// shot mode (for automated verification screenshots)
// ---------------------------------------------------------------------------
if (Q.has('azim')) {
  document.body.classList.add('shot');
  const az = +Q.get('azim') * Math.PI / 180, el = +Q.get('elev') * Math.PI / 180;
  const dist = +Q.get('dist') || 18;
  const cz = +Q.get('z') || 2.6;
  camera.position.set(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el) + cz, dist * Math.cos(el) * Math.cos(az));
  controls.target.set(0, cz, 0);
  if (Q.has('hideui')) document.getElementById('panel').style.display = 'none';
}
controls.update();

// ---------------------------------------------------------------------------
const loop = () => {
  controls.update();
  renderer.render(scene, camera);
  if (Q.has('azim')) window.__ready = true;
  requestAnimationFrame(loop);
};
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
