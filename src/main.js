// App entry: wires the viewer, the generator, the control panel, export + presets.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import Viewer, { TIME_PRESETS } from './viewer.js';
import { MaterialLibrary } from './lib/materials.js';
import { BuildingGenerator, DEFAULT_PARAMS, TYPE_PRESETS } from './lib/building.js';
import { Rng } from './lib/prng.js';
import { PALETTES, PALETTE_KEYS, BUILDING_TYPES, WOOD_STYLES } from './data/names.js';
import { TILE_TYPES } from './lib/roofs.js';
import { buildPanel, getPath, setPath, toast, humanize } from './ui.js';
import './styles.css';
import { clearTextureCache } from './lib/textures.js';

const STORE_KEY = 'eastasia-building-generator.v1';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  params: { ...DEFAULT_PARAMS, signs: { ...DEFAULT_PARAMS.signs } },
  street: { enabled: false, count: 5, spacing: 1.4, mix: 'mixed' },
  view: { time: 'golden', bloom: true, ground: true, grid: false, autoFrame: true, realLights: true },
  lastInfo: null,
  lastColors: null,
  lastContent: null,
  buildings: [],
  generating: false,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.params) state.params = { ...state.params, ...saved.params, signs: { ...state.params.signs, ...(saved.params.signs || {}) } };
    if (saved.street) state.street = { ...state.street, ...saved.street };
    if (saved.view) state.view = { ...state.view, ...saved.view };
  } catch {
    /* ignore */
  }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ params: state.params, street: state.street, view: state.view }));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const viewport = document.getElementById('viewport');
const panelEl = document.getElementById('panel');
const viewer = new Viewer(viewport);
const materials = new MaterialLibrary();
const generator = new BuildingGenerator(materials);

loadState();

// --- view-only state ---
viewer.setTimePreset(state.view.time);
viewer.setBloom(state.view.bloom);
viewer.setGroundVisible(state.view.ground);
viewer.setGridVisible(state.view.grid);

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

let contentRoot = null;
let genTimer = null;
let lastFrameKey = '';

function api() {
  return {
    get: (p) => getPath(state.params, p),
    set: (p, v) => setPath(state.params, p, v),
    resolved: (p) => {
      const key = p.split('.').pop();
      const c = state.lastColors || PALETTES[state.params.theme] || PALETTES.machiya;
      const map = {
        wallColor: c.plaster,
        woodColor: c.wood,
        roofColor: c.roof,
        trimColor: c.trim,
      };
      return map[key] || c.accent || '#888888';
    },
    onAction: handleAction,
    onChange: (p, live) => scheduleRegenerate(p, live),
  };
}

function scheduleRegenerate(path, live) {
  persist();
  const heavy = ['type', 'theme', 'floors', 'width', 'depth', 'seed', 'floorHeight', 'detail', 'roofType', 'roofOverhang', 'roofCurve', 'wallStyle'];
  const delay = live ? (heavy.some((h) => path.endsWith(h)) ? 90 : 260) : 0;
  clearTimeout(genTimer);
  if (delay === 0) regenerate();
  else genTimer = setTimeout(regenerate, delay);
}

function buildingParamsFor(base, index, rng) {
  const mixes = {
    mixed: ['machiya', 'shop', 'ramen', 'house', 'apartment', 'office', 'konbini', 'teahouse', 'ryokan', 'arcade', 'temple', 'pagoda'],
    oldtown: ['machiya', 'machiya', 'shop', 'ramen', 'teahouse', 'ryokan', 'house'],
    commercial: ['shop', 'konbini', 'arcade', 'apartment', 'office', 'ramen'],
    temple: ['temple', 'shrine', 'pagoda', 'teahouse', 'machiya'],
    modern: ['apartment', 'office', 'tower', 'konbini', 'arcade'],
  };
  const list = mixes[state.street.mix] || mixes.mixed;
  const type = rng.pick(list);
  const preset = TYPE_PRESETS[type] || {};
  const p = {
    ...DEFAULT_PARAMS,
    ...preset,
    type,
    seed: `${base.seed}-street-${index}`,
    theme: base.theme,
    detail: base.detail,
    lightStyle: base.lightStyle,
    lightIntensity: base.lightIntensity,
    lightsEnabled: base.lightsEnabled,
    realLights: base.realLights,
    bloom: base.bloom,
    ground: false,
    groundStyle: 'none',
    autoSigns: true,
    name: '',
    nameSub: '',
    signs: { ...DEFAULT_PARAMS.signs },
    modernMix: Math.max(0, Math.min(1, base.modernMix + rng.float(-0.15, 0.2))),
    roofCurve: base.roofCurve,
    roofTile: rng.bool(0.75) ? base.roofTile : rng.pick(TILE_TYPES),
    woodStyle: rng.bool(0.6) ? base.woodStyle : rng.pick(WOOD_STYLES),
    floors: Math.max(1, Math.round((preset.floors ?? base.floors) + rng.int(-1, 2))),
    width: (preset.width ?? base.width) * rng.float(0.82, 1.22),
    depth: (preset.depth ?? base.depth) * rng.float(0.85, 1.15),
    irregularity: Math.max(0.05, base.irregularity * rng.float(0.6, 1.5)),
    pole: rng.bool(0.55),
    wireToSides: true,
    // per-building colour drift, still inside the theme family
    wallColor: '',
    woodColor: '',
  };
  // pagodas & temples keep their identity; houses stay quiet
  if (type === 'house' || type === 'temple' || type === 'shrine' || type === 'pagoda') {
    p.modernMix = Math.min(p.modernMix, 0.25);
    p.neon = type === 'house' ? rng.bool(0.3) : false;
  }
  return p;
}

function regenerate(opts = {}) {
  if (state.generating) return;
  state.generating = true;
  viewport.classList.add('busy');
  const t0 = performance.now();
  const root = new THREE.Group();
  root.name = state.street.enabled ? 'Street' : 'Building';
  const lights = [];
  const infos = [];
  state.buildings = [];

  try {
    if (state.street.enabled) {
      const count = Math.max(2, Math.min(14, Math.round(state.street.count)));
      const rng = new Rng(`street:${state.params.seed}:${count}:${state.street.mix}`);
      let cursor = 0;
      for (let i = 0; i < count; i++) {
        const p = buildingParamsFor(state.params, i, rng);
        const { group, info, lights: ls } = generator.generate(p);
        const front = p.depth / 2;
        group.position.set(cursor + p.width / 2, 0, -front);
        group.userData.buildingParams = p;
        group.userData.info = info;
        root.add(group);
        state.buildings.push({ group, params: p, info });
        cursor += p.width + state.street.spacing;
        for (const l of ls) lights.push({ ...l, pos: [l.pos[0] + group.position.x, l.pos[1], l.pos[2] + group.position.z] });
        infos.push(info);
      }
      // street ground: sidewalk + road
      const streetG = new THREE.Group();
      streetG.name = 'StreetGround';
      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(cursor + 6, 0.18, 3.4),
        materials.get('concrete', { color: '#b6b3ab' })
      );
      sidewalk.position.set(cursor / 2 - 0.5, 0.03, -1.9);
      sidewalk.receiveShadow = true;
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(cursor + 40, 0.12, 16),
        materials.get('asphalt', { color: '#54565a' })
      );
      road.position.set(cursor / 2 - 0.5, -0.05, 11);
      road.receiveShadow = true;
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(cursor + 6, 0.24, 0.3),
        materials.get('stone', { color: '#c0bcb2' })
      );
      curb.position.set(cursor / 2 - 0.5, 0.08, -0.35);
      streetG.add(sidewalk, road, curb);
      root.add(streetG);
    } else {
      const { group, info, lights: ls } = generator.generate(state.params);
      root.add(group);
      for (const l of ls) lights.push(l);
      infos.push(info);
      state.buildings.push({ group, params: { ...state.params }, info });
      state.lastColors = info.colors || null;
      state.lastContent = info.content || null;
    }
  } catch (err) {
    console.error(err);
    toast('Generation failed: ' + err.message, 4000);
  }

  if (contentRoot) {
    viewer.scene.remove(contentRoot);
    contentRoot.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    contentRoot = null;
  }
  contentRoot = root;
  viewer.setContent(root);
  viewer.setBuildingLights(lights, state.view.realLights ? 12 : 0);

  const primary = infos[0] || null;
  state.lastInfo = primary;
  if (!state.street.enabled && primary) {
    state.lastColors = primary.colors || null;
    state.lastContent = primary.content || null;
  }
  const frameKey = `${state.street.enabled}:${infos.length}`;
  if (state.view.autoFrame || frameKey !== lastFrameKey || opts.frame) {
    viewer.frameObject(root);
    lastFrameKey = frameKey;
  }
  updateHud(infos, performance.now() - t0);
  syncPlaceholders();
  state.generating = false;
  viewport.classList.remove('busy');
}

function updateHud(infos, ms) {
  const totalTris = infos.reduce((a, i) => a + i.triangles, 0);
  const totalMeshes = infos.reduce((a, i) => a + i.meshes, 0);
  const parts = infos.reduce((a, i) => a + (i.parts || 0), 0);
  const hud = document.getElementById('hud-stats');
  if (hud) {
    const main = infos[0];
    hud.innerHTML = state.street.enabled
      ? `<span class="stat">buildings <b>${infos.length}</b></span>
         <span class="stat">tris <b>${fmt(totalTris)}</b></span>
         <span class="stat">meshes <b>${totalMeshes}</b></span>
         <span class="stat">gen <b>${ms.toFixed(0)}ms</b></span>`
      : `<span class="stat">“<b>${escapeHtml(main.name || 'building')}</b>”</span>
         <span class="stat">floors <b>${main.floors}</b></span>
         <span class="stat">h <b>${main.height.toFixed(1)}m</b></span>
         <span class="stat">tris <b>${fmt(totalTris)}</b></span>
         <span class="stat">parts <b>${fmt(parts)}</b></span>
         <span class="stat">gen <b>${ms.toFixed(0)}ms</b></span>`;
  }
  const badge = document.getElementById('hud-badge');
  if (badge) badge.textContent = state.street.enabled ? '' : (infos[0]?.theme || '');
}

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function syncPlaceholders() {
  const c = state.lastContent;
  if (!c) return;
  const set = (path, value) => {
    const input = document.querySelector(`[data-path="${path}"]`);
    if (input) input.placeholder = `auto: ${value}`;
  };
  set('name', c.name);
  set('nameSub', c.sub);
  set('signs.main', c.main);
  set('signs.mainSub', c.mainSub);
  set('signs.side', c.side);
  set('signs.banner', c.banner);
  set('signs.lantern', c.lantern || '(blank)');
  set('signs.neon', c.neon || '(blank)');
  set('signs.aboard', c.aboard || '(blank)');
  set('signs.posterTitle', c.posterTitle);
  set('signs.menu', c.menu);
  set('signs.posterBody', c.posterBody.join(' / '));
}

/* ------------------------------------------------------------------ */
/* Japanese webfonts (progressive: only fetched when the system has    */
/* no CJK font, or when the user asks for them)                        */
/* ------------------------------------------------------------------ */

let cjkLoaded = false;

function systemHasCJK() {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '64px sans-serif';
    const cjk = ctx.measureText('麺').width;
    const tofu = ctx.measureText('\uFFFD').width;
    return cjk > 1 && Math.abs(cjk - tofu) > 0.5;
  } catch {
    return true;
  }
}

async function loadCJKFonts(force = false) {
  if (cjkLoaded) return true;
  if (!force && systemHasCJK()) return false;
  try {
    toast('Fetching Japanese webfonts…', 6000);
    const [sansUrl, serifUrl] = await Promise.all([
      import('@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff2?url').then((m) => m.default),
      import('@fontsource/shippori-mincho/files/shippori-mincho-japanese-700-normal.woff2?url').then((m) => m.default),
    ]);
    const faces = [
      new FontFace('Noto Sans JP', `url(${sansUrl}) format('woff2')`, { weight: '400 800', display: 'swap' }),
      new FontFace('Noto Serif JP', `url(${serifUrl}) format('woff2')`, { weight: '400 800', display: 'swap' }),
    ];
    await Promise.all(faces.map((f) => f.load().then((lf) => document.fonts.add(lf))));
    cjkLoaded = true;
    clearTextureCache();
    regenerate();
    toast('Japanese webfonts loaded');
    return true;
  } catch (e) {
    console.warn('CJK font load failed', e);
    toast('Could not load Japanese webfonts — using system fonts');
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

const PRESETS = [
  { label: '🏮 Machiya', params: { type: 'machiya', theme: 'machiya', floors: 2, modernMix: 0.4 } },
  { label: '🍜 Ramen', params: { type: 'ramen', theme: 'showa', floors: 2, modernMix: 0.5, neon: true } },
  { label: '⛩ Temple', params: { type: 'temple', theme: 'temple', floors: 1, modernMix: 0.1 } },
  { label: '🏯 Pagoda', params: { type: 'pagoda', theme: 'lacquer', floors: 5, modernMix: 0.05 } },
  { label: '🏪 Konbini', params: { type: 'konbini', theme: 'citypop', floors: 1, modernMix: 0.9 } },
  { label: '🏢 Apartment', params: { type: 'apartment', theme: 'whitewash', floors: 5, modernMix: 0.75 } },
  { label: '🎮 Neon arcade', params: { type: 'arcade', theme: 'neonDistrict', floors: 4, modernMix: 1 } },
  { label: '🗼 Tower', params: { type: 'tower', theme: 'imperial', floors: 9, modernMix: 0.8 } },
  { label: '🍵 Teahouse', params: { type: 'teahouse', theme: 'bamboo', floors: 1, modernMix: 0.1 } },
  { label: '🏨 Ryokan', params: { type: 'ryokan', theme: 'edo', floors: 3, modernMix: 0.2 } },
];

function handleAction(name, payload) {
  switch (name) {
    case 'randomize': {
      randomizeAll();
      return;
    }
    case 'reseed': {
      state.params.seed = `${state.params.type}-${Math.floor(Math.random() * 9999)}`;
      syncPanel();
      regenerate();
      return;
    }
    case 'preset': {
      const preset = PRESETS.find((p) => p.label === payload);
      if (preset) {
        state.params = { ...state.params, ...preset.params };
        syncPanel();
        regenerate();
        toast(preset.label.replace(/^\S+\s/, '') + ' loaded');
      }
      return;
    }
    case 'type': {
      state.params.type = payload;
      const preset = TYPE_PRESETS[payload] || {};
      state.params = { ...state.params, ...preset, type: payload };
      if (preset.theme) state.params.theme = preset.theme;
      syncPanel();
      regenerate();
      return;
    }
    case 'theme': {
      state.params.theme = payload;
      syncPanel();
      regenerate();
      return;
    }
    case 'export-glb': {
      exportGLB();
      return;
    }
    case 'export-png': {
      viewer.screenshot(`building-${state.params.seed}`);
      return;
    }
    case 'export-json': {
      download(new Blob([JSON.stringify({ params: state.params, street: state.street }, null, 2)], { type: 'application/json' }), `building-${state.params.seed}.json`);
      return;
    }
    case 'import-json': {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (data.params) state.params = { ...state.params, ...data.params };
          if (data.street) state.street = { ...state.street, ...data.street };
          syncPanel();
          regenerate();
          toast('Preset loaded');
        } catch (e) {
          toast('Could not read preset');
        }
      };
      input.click();
      return;
    }
    case 'frame': {
      viewer.frameObject(contentRoot);
      return;
    }
    case 'topview': {
      viewer.camera.position.set(0, 40, 0.01);
      viewer.controls.target.set(0, 0, 0);
      viewer.needsRender = true;
      return;
    }
    case 'frontview': {
      viewer.camera.position.set(0, 4, 30);
      viewer.controls.target.set(0, 5, 0);
      viewer.needsRender = true;
      return;
    }
    case 'reset': {
      localStorage.removeItem(STORE_KEY);
      state.params = { ...DEFAULT_PARAMS, signs: { ...DEFAULT_PARAMS.signs } };
      state.street = { enabled: false, count: 5, spacing: 1.4, mix: 'mixed' };
      syncPanel();
      regenerate();
      toast('Reset to defaults');
      return;
    }
    case 'copy-params': {
      navigator.clipboard?.writeText(JSON.stringify(state.params, null, 2));
      toast('Parameters copied as JSON');
      return;
    }
    case 'time': {
      state.view.time = payload;
      viewer.setTimePreset(payload);
      persist();
      syncPanel();
      return;
    }
    case 'toggle-real': {
      state.view.realLights = !state.view.realLights;
      persist();
      regenerate();
      toast(`Real lights ${state.view.realLights ? 'on' : 'off'}`);
      return;
    }
    case 'toggle-bloom': {
      state.view.bloom = !state.view.bloom;
      viewer.setBloom(state.view.bloom);
      persist();
      toast(`Bloom ${state.view.bloom ? 'on' : 'off'}`);
      return;
    }
    case 'clear-cache': {
      clearTextureCache();
      regenerate();
      toast('Texture cache cleared');
      return;
    }
    case 'toggle-grid': {
      state.view.grid = !state.view.grid;
      viewer.setGridVisible(state.view.grid);
      persist();
      toast(`Grid ${state.view.grid ? 'on' : 'off'}`);
      return;
    }
    case 'load-fonts': {
      loadCJKFonts(true);
      return;
    }
    case 'toggle-street': {
      state.street.enabled = !state.street.enabled;
      persist();
      syncPanel();
      regenerate({ frame: true });
      return;
    }
    default:
      return;
  }
}

function randomizeAll() {
  const rng = new Rng(Math.floor(Math.random() * 1e9));
  const type = rng.pick(BUILDING_TYPES);
  const theme = rng.pick(PALETTE_KEYS);
  const preset = TYPE_PRESETS[type] || {};
  const p = {
    ...DEFAULT_PARAMS,
    ...preset,
    type,
    theme,
    seed: `${type}-${rng.int(100, 999)}`,
    floors: Math.max(1, Math.round((preset.floors ?? 2) + rng.int(-1, 2))),
    width: (preset.width ?? 7.5) * rng.float(0.9, 1.2),
    depth: (preset.depth ?? 6.5) * rng.float(0.9, 1.15),
    floorHeight: rng.float(2.8, 3.8),
    irregularity: rng.float(0.1, 0.6),
    roofType: rng.bool(0.6) ? 'auto' : rng.pick(['gable', 'hip', 'irimoya', 'pyramid', 'flat']),
    roofTile: rng.pick(TILE_TYPES),
    roofCurve: rng.float(0.2, 0.95),
    roofOverhang: rng.float(0.6, 1.5),
    woodStyle: rng.pick(WOOD_STYLES),
    wallStyle: rng.pick(['plaster', 'timber', 'timber', 'stone', 'concrete', 'metal', 'tile']),
    windowStyle: 'auto',
    modernMix: rng.float(0.15, 0.95),
    neon: rng.bool(0.65),
    lanterns: rng.bool(0.7),
    vending: rng.bool(0.6),
    posterCount: rng.int(0, 5),
    awning: rng.bool(0.6),
    noren: rng.bool(0.6),
    balcony: rng.bool(0.6),
    acUnits: rng.bool(0.7),
    waterTank: rng.bool(0.4),
    antenna: rng.bool(0.4),
    solar: rng.bool(0.25),
    pole: rng.bool(0.7),
    boundaryWall: rng.bool(0.2),
    torii: rng.bool(0.12),
    lightStyle: rng.pick(['warm', 'warm', 'neon', 'cool', 'mixed']),
    detail: state.params.detail,
    signs: { ...DEFAULT_PARAMS.signs },
    name: '',
    nameSub: '',
  };
  state.params = p;
  syncPanel();
  regenerate({ frame: true });
  const names = { machiya: 'Machiya', shop: 'Shop', ramen: 'Ramen bar', house: 'House', apartment: 'Apartment', office: 'Office', temple: 'Temple', shrine: 'Shrine', teahouse: 'Teahouse', pagoda: 'Pagoda', ryokan: 'Ryokan', factory: 'Factory', konbini: 'Konbini', arcade: 'Arcade', tower: 'Tower' };
  toast(`Random: ${names[type] || type} · ${PALETTES[theme]?.label || theme}`);
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportGLB() {
  if (!contentRoot) return;
  toast('Building .glb …');
  const exporter = new GLTFExporter();
  exporter.parse(
    contentRoot,
    (result) => {
      const blob = new Blob([result], { type: 'model/gltf-binary' });
      const name = state.street.enabled ? `street-${state.params.seed}` : `${state.params.type}-${state.params.seed}`;
      download(blob, `${name}.glb`);
      toast(`Exported ${name}.glb (${(blob.size / 1024 / 1024).toFixed(2)} MB) — opens in Blender`);
    },
    (err) => {
      console.error(err);
      toast('GLB export failed');
    },
    { binary: true, onlyVisible: true, maxTextureSize: 2048 }
  );
}

/* ------------------------------------------------------------------ */
/* Click to inspect                                                    */
/* ------------------------------------------------------------------ */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
viewer.renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (!state.street.enabled) return;
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ndc, viewer.camera);
  const hits = ray.intersectObjects(contentRoot ? contentRoot.children : [], true);
  if (!hits.length) return;
  let obj = hits[0].object;
  while (obj && !obj.userData.buildingParams) obj = obj.parent;
  if (obj?.userData.buildingParams) {
    const p = obj.userData.buildingParams;
    state.params = { ...state.params, ...p, ground: true, groundStyle: 'street' };
    state.street.enabled = false;
    syncPanel();
    persist();
    regenerate({ frame: true });
    toast(`Loaded “${p.name || p.type}” into the panel`);
  }
});

/* ------------------------------------------------------------------ */
/* Panel schema                                                        */
/* ------------------------------------------------------------------ */

const SCHEMA = [
  {
    title: 'Build',
    open: true,
    items: [
      {
        t: 'custom',
        render: (body) => {
          const wrap = document.createElement('div');
          wrap.className = 'field';
          const lab = document.createElement('div');
          lab.className = 'field-label';
          lab.textContent = 'Presets';
          wrap.appendChild(lab);
          const row = document.createElement('div');
          row.className = 'chips';
          for (const p of PRESETS) {
            const c = document.createElement('div');
            c.className = 'chip';
            c.textContent = p.label;
            c.onclick = () => handleAction('preset', p.label);
            row.appendChild(c);
          }
          wrap.appendChild(row);
          body.appendChild(wrap);
        },
      },
      {
        t: 'custom',
        render: (body) => {
          const wrap = document.createElement('div');
          wrap.className = 'field';
          const lab = document.createElement('div');
          lab.className = 'field-label';
          lab.textContent = 'Building type';
          wrap.appendChild(lab);
          const row = document.createElement('div');
          row.className = 'chips';
          for (const t of BUILDING_TYPES) {
            const c = document.createElement('div');
            c.className = 'chip';
            c.textContent = humanize(t);
            c.dataset.typeChip = t;
            c.onclick = () => handleAction('type', t);
            row.appendChild(c);
          }
          wrap.appendChild(row);
          body.appendChild(wrap);
          wrap._refresh = () => {
            for (const c of row.children) c.classList.toggle('active', c.dataset.typeChip === state.params.type);
          };
          body._typeRow = wrap;
        },
      },
      {
        t: 'custom',
        render: (body) => {
          const wrap = document.createElement('div');
          wrap.className = 'field';
          const lab = document.createElement('div');
          lab.className = 'field-label';
          lab.textContent = 'Style theme';
          wrap.appendChild(lab);
          const row = document.createElement('div');
          row.className = 'chips';
          for (const key of PALETTE_KEYS) {
            const c = document.createElement('div');
            c.className = 'chip';
            c.textContent = PALETTES[key].label.split('—')[0].trim();
            c.title = PALETTES[key].label;
            c.dataset.themeChip = key;
            c.onclick = () => handleAction('theme', key);
            row.appendChild(c);
          }
          wrap.appendChild(row);
          body.appendChild(wrap);
          wrap._refresh = () => {
            for (const c of row.children) c.classList.toggle('active', c.dataset.themeChip === state.params.theme);
          };
          body._themeRow = wrap;
        },
      },
      { k: 'name', t: 'text', label: 'Building name / main sign', placeholder: 'auto: random shop name' },
      { k: 'nameSub', t: 'text', label: 'Sub-text (romaji)', placeholder: 'auto' },
      { k: 'seed', t: 'text', label: 'Seed', placeholder: 'kyoto-01', hint: 'Same seed + same settings = identical building, every time.' },
      { t: 'buttons', columns: 3, items: [{ label: '🎲 Randomize', action: 'randomize', primary: true }, { label: '⟳ Re-roll seed', action: 'reseed' }, { label: '⤺ Reset', action: 'reset' }] },
      { k: 'floors', t: 'range', min: 1, max: 12, step: 1, label: 'Floors / storeys' },
      { k: 'floorHeight', t: 'range', min: 2.2, max: 5, step: 0.05, label: 'Floor height', unit: 'm' },
      { k: 'width', t: 'range', min: 3, max: 22, step: 0.1, label: 'Width', unit: 'm' },
      { k: 'depth', t: 'range', min: 3, max: 20, step: 0.1, label: 'Depth', unit: 'm' },
      { k: 'irregularity', t: 'range', min: 0, max: 1, step: 0.02, label: 'Irregularity', hint: 'Procedural wobble: footprint drift per floor, colour variation.' },
      { k: 'detail', t: 'range', min: 0, max: 3, step: 1, label: 'Detail level', hint: '3 = full tile ribs, rafters, ornaments.' },
    ],
  },
  {
    title: 'Roof',
    open: true,
    items: [
      {
        k: 'roofType',
        t: 'select',
        label: 'Roof form',
        options: [
          { value: 'auto', label: 'Auto (per building type)' },
          { value: 'gable', label: 'Gable 切妻 kirizuma' },
          { value: 'hip', label: 'Hip 寄棟 yosemune' },
          { value: 'irimoya', label: 'Hip-and-gable 入母屋 irimoya' },
          { value: 'pyramid', label: 'Pyramidal 宝形 hōgyō' },
          { value: 'tiered', label: 'Tiered 五重塔 pagoda' },
          { value: 'shed', label: 'Shed / lean-to 片流れ' },
          { value: 'flat', label: 'Flat + parapet' },
        ],
      },
      { k: 'roofTile', t: 'select', label: 'Roof tile type', options: TILE_TYPES.map((t) => ({ value: t, label: humanize(t) })) },
      { k: 'roofColor', t: 'color', label: 'Roof colour' },
      { k: 'roofCurve', t: 'range', min: 0, max: 1, step: 0.02, label: 'Flying eaves 反り sori', hint: 'Corner lift + concave slope.' },
      { k: 'roofOverhang', t: 'range', min: 0.3, max: 2.2, step: 0.05, label: 'Eave overhang', unit: 'm' },
      { k: 'roofThickness', t: 'range', min: 0.03, max: 0.3, step: 0.01, label: 'Roof thickness', unit: 'm' },
      { k: 'roofDetail', t: 'toggle', label: 'Rafters, ridges & ornaments', hint: 'Rafter tails, ridge caps, hip ridges, onigawara.' },
      { k: 'shachihoko', t: 'toggle', label: 'Golden shachihoko fins', hint: 'Temple / castle ridge ornaments.' },
    ],
  },
  {
    title: 'Walls & façade',
    open: true,
    items: [
      {
        k: 'wallStyle',
        t: 'select',
        label: 'Wall material',
        options: ['plaster', 'timber', 'stone', 'concrete', 'tile', 'metal', 'brick'].map((v) => ({ value: v, label: humanize(v) })),
      },
      { k: 'wallColor', t: 'color', label: 'Wall colour' },
      { k: 'woodStyle', t: 'select', label: 'Wood species / finish', options: WOOD_STYLES.map((w) => ({ value: w, label: humanize(w) })) },
      { k: 'woodColor', t: 'color', label: 'Wood colour' },
      { k: 'trimColor', t: 'color', label: 'Trim / beam colour' },
      {
        k: 'windowStyle',
        t: 'select',
        label: 'Window type',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'lattice', label: 'Timber lattice 格子 koushi' },
          { value: 'shoji', label: 'Paper shoji 障子' },
          { value: 'glass', label: 'Glass + aluminium' },
          { value: 'industrial', label: 'Industrial / factory' },
        ],
      },
      { k: 'windows', t: 'toggle', label: 'Windows' },
      { k: 'lattice', t: 'toggle', label: 'Lattice screens on shopfront' },
      { k: 'shoji', t: 'toggle', label: 'Shoji paper panes' },
      { k: 'glassFront', t: 'toggle', label: 'Glass front' },
      { k: 'shopfront', t: 'toggle', label: 'Shopfront (glass bays + door)' },
      { k: 'interior', t: 'toggle', label: 'Interior slice', hint: 'Counter, tables, shelves and a warm ceiling light, seen through the glass.' },
      { k: 'awning', t: 'toggle', label: 'Striped awning' },
      { k: 'noren', t: 'toggle', label: 'Noren curtain 暖簾' },
      { k: 'shutters', t: 'toggle', label: 'Roller shutters (half down)' },
      { k: 'balcony', t: 'toggle', label: 'Balconies / veranda' },
      { k: 'balconyLaundry', t: 'toggle', label: 'Laundry on the balcony' },
      { k: 'skirtRoofs', t: 'toggle', label: 'Skirt roofs & window awnings 庇' },
    ],
  },
  {
    title: 'Modern layer',
    open: true,
    items: [
      { k: 'modernMix', t: 'range', min: 0, max: 1, step: 0.02, label: 'Ancient ⇄ modern mix', hint: 'Drives AC units, neon, rooftop kit, vending machines.' },
      { k: 'neon', t: 'toggle', label: 'Neon signage' },
      { k: 'acUnits', t: 'toggle', label: 'Air-con units' },
      { k: 'downpipes', t: 'toggle', label: 'Downpipes & gutters' },
      { k: 'waterTank', t: 'toggle', label: 'Rooftop water tank' },
      { k: 'solar', t: 'toggle', label: 'Solar panels' },
      { k: 'antenna', t: 'toggle', label: 'TV antenna / dish' },
      { k: 'roofRail', t: 'toggle', label: 'Rooftop railing' },
      { k: 'vending', t: 'toggle', label: 'Vending machines' },
      { k: 'posterCount', t: 'range', min: 0, max: 8, step: 1, label: 'Posters / flyers on walls' },
      { k: 'menuBoard', t: 'toggle', label: 'Menu / notice boards' },
      { k: 'banners', t: 'toggle', label: 'Vertical banners 幟 nobori' },
      { k: 'lanterns', t: 'toggle', label: 'Paper lanterns 提灯' },
      { k: 'tanzaku', t: 'toggle', label: 'Wish-slip strings 短冊' },
    ],
  },
  {
    title: 'Signage text (type your own)',
    open: true,
    items: [
      { t: 'note', text: 'Leave a field empty to let the generator invent it. Anything you type is drawn onto the board texture (kanji, kana, latin — all fine).' },
      { k: 'signs.main', t: 'text', label: 'Main sign band' },
      { k: 'signs.mainSub', t: 'text', label: 'Main sign sub-line' },
      { k: 'signs.side', t: 'text', label: 'Vertical side sign' },
      { k: 'signs.neon', t: 'text', label: 'Neon text' },
      { k: 'signs.banner', t: 'text', label: 'Nobori banner text' },
      { k: 'signs.lantern', t: 'text', label: 'Lantern text' },
      { k: 'signs.noren', t: 'text', label: 'Noren text' },
      { k: 'signs.aboard', t: 'text', label: 'A-board headline' },
      { k: 'signs.posterTitle', t: 'text', label: 'Poster title' },
      { k: 'signs.posterBody', t: 'textarea', label: 'Poster body (one line each)', rows: 4, placeholder: '先着100名様\n粗品進呈' },
      { k: 'signs.menu', t: 'text', label: 'Menu board title' },
      { k: 'autoSigns', t: 'toggle', label: 'Invent names for empty fields' },
    ],
  },
  {
    title: 'Street & power',
    open: false,
    items: [
      { k: 'pole', t: 'toggle', label: 'Utility pole outside' },
      { k: 'poleSide', t: 'select', label: 'Pole side', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
      { k: 'powerLines', t: 'toggle', label: 'Power lines (electricity run)' },
      { k: 'phoneLine', t: 'toggle', label: 'Telephone / fibre lines' },
      { k: 'wireToSides', t: 'toggle', label: 'Wires running off to the sides' },
      { k: 'streetLamp', t: 'toggle', label: 'Street lamp on the pole' },
      { k: 'transformers', t: 'toggle', label: 'Pole transformers' },
      { k: 'bicycles', t: 'toggle', label: 'Parked bicycles' },
      { k: 'crates', t: 'toggle', label: 'Crates, barrels & gas cylinders' },
      { k: 'plants', t: 'toggle', label: 'Potted plants & bamboo' },
      { k: 'seating', t: 'toggle', label: 'Outdoor tables, stools & benches' },
      { k: 'parasol', t: 'toggle', label: 'Parasols' },
      { k: 'mailbox', t: 'toggle', label: 'Post box' },
      { k: 'fireBox', t: 'toggle', label: 'Fire-hose box' },
      { k: 'boundaryWall', t: 'toggle', label: 'Boundary wall with tiled cap' },
      { k: 'torii', t: 'toggle', label: 'Torii gate ⛩' },
      {
        k: 'groundStyle',
        t: 'select',
        label: 'Ground',
        options: [
          { value: 'street', label: 'Sidewalk + road' },
          { value: 'plot', label: 'Plot only' },
          { value: 'none', label: 'None' },
        ],
      },
    ],
  },
  {
    title: 'Lighting & render',
    open: false,
    items: [
      { k: 'lightsEnabled', t: 'toggle', label: 'Lights on' },
      {
        k: 'lightStyle',
        t: 'select',
        label: 'Light colour / type',
        options: [
          { value: 'warm', label: 'Warm lantern glow' },
          { value: 'cool', label: 'Cool modern LED' },
          { value: 'neon', label: 'Neon (pink / cyan)' },
          { value: 'mixed', label: 'Mixed' },
        ],
      },
      { k: 'lightIntensity', t: 'range', min: 0, max: 3, step: 0.05, label: 'Light intensity' },
      {
        t: 'chips',
        label: 'Time of day',
        // handled as a special action
        options: Object.entries(TIME_PRESETS).map(([k, v]) => ({ value: k, label: v.label })),
        k: '__time',
      },
      { t: 'buttons', columns: 3, items: [{ label: 'Real lights', action: 'toggle-real' }, { label: 'Bloom', action: 'toggle-bloom' }, { label: 'Grid', action: 'toggle-grid' }] },
      { t: 'buttons', columns: 3, items: [{ label: 'Frame', action: 'frame' }, { label: 'Front view', action: 'frontview' }, { label: 'Top view', action: 'topview' }] },
    ],
  },
  {
    title: 'Street generator',
    open: false,
    items: [
      { t: 'note', text: 'Generate a whole block: every building is built by the same procedural graph with its own seed, then click any building to pull its settings back into this panel.' },
      { t: 'buttons', columns: 2, items: [{ label: '🏘 Toggle street mode', action: 'toggle-street', primary: true }, { label: 'Re-roll street', action: 'reseed' }] },
      { k: '__street.count', t: 'range', min: 2, max: 14, step: 1, label: 'Buildings in the row' },
      { k: '__street.spacing', t: 'range', min: 0, max: 6, step: 0.1, label: 'Gap between buildings', unit: 'm' },
      {
        k: '__street.mix',
        t: 'select',
        label: 'Street character',
        options: [
          { value: 'mixed', label: 'Mixed neighbourhood' },
          { value: 'oldtown', label: 'Old town (machiya)' },
          { value: 'commercial', label: 'Commercial strip' },
          { value: 'temple', label: 'Temple precinct' },
          { value: 'modern', label: 'Modern city' },
        ],
      },
    ],
  },
  {
    title: 'Export & save',
    open: false,
    items: [
      { t: 'buttons', columns: 2, items: [{ label: '⬇ Export .glb', action: 'export-glb', primary: true }, { label: '📷 Snapshot PNG', action: 'export-png' }] },
      { t: 'buttons', columns: 3, items: [{ label: 'Save .json', action: 'export-json' }, { label: 'Load .json', action: 'import-json' }, { label: 'Copy JSON', action: 'copy-params' }] },
      { t: 'buttons', columns: 2, items: [{ label: 'あ Load CJK webfonts', action: 'load-fonts' }, { label: 'Clear texture cache', action: 'clear-cache' }] },
      { t: 'note', text: 'Japanese webfonts download on demand if your system has no CJK fonts (about 2.4 MB, cached by the browser).' },
      { t: 'note', text: 'The .glb carries all geometry, materials and the baked canvas textures — drag it straight into Blender.' },
    ],
  },
];

/* --- special handling for the two pseudo-paths (__street / __time) --- */
function wrapApi() {
  const base = api();
  return {
    ...base,
    get: (path) => {
      if (path === '__street.count') return state.street.count;
      if (path === '__street.spacing') return state.street.spacing;
      if (path === '__street.mix') return state.street.mix;
      if (path === '__time') return state.view.time;
      return base.get(path);
    },
    set: (path, value) => {
      if (path === '__street.count') {
        state.street.count = value;
        return;
      }
      if (path === '__street.spacing') {
        state.street.spacing = value;
        return;
      }
      if (path === '__street.mix') {
        state.street.mix = value;
        return;
      }
      if (path === '__time') {
        handleAction('time', value);
        return;
      }
      base.set(path, value);
    },
    onChange: (path, live) => {
      if (path === '__time') return;
      if (path.startsWith('__street.')) {
        persist();
        clearTimeout(genTimer);
        genTimer = setTimeout(() => regenerate(), live ? 200 : 0);
        return;
      }
      base.onChange(path, live);
    },
  };
}

let panel;
function syncPanel() {
  panel?.refresh();
}

function buildUI() {
  panel = buildPanel(panelEl, SCHEMA, wrapApi());
  syncPanel();
}

/* ------------------------------------------------------------------ */
/* HUD buttons                                                         */
/* ------------------------------------------------------------------ */

function wireHud() {
  const map = {
    'btn-randomize': () => randomizeAll(),
    'btn-generate': () => regenerate({ frame: true }),
    'btn-glb': () => exportGLB(),
    'btn-png': () => viewer.screenshot(`building-${state.params.seed}`),
    'btn-frame': () => viewer.frameObject(contentRoot),
    'btn-top': () => {
      viewer.camera.position.set(0.01, Math.max(28, (state.lastInfo?.height || 12) * 2.2), 0.01);
      viewer.controls.target.set(0, 0, 0);
      viewer.needsRender = true;
    },
    'btn-view': (el) => {
      const modes = ['golden', 'noon', 'dusk', 'night', 'overcast'];
      const i = (modes.indexOf(state.view.time) + 1) % modes.length;
      handleAction('time', modes[i]);
      el.textContent = TIME_PRESETS[modes[i]].label;
    },
  };
  for (const [id, fn] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('click', () => fn(el));
  }
  const lightBtn = document.getElementById('btn-lights');
  lightBtn?.addEventListener('click', (e) => {
    state.params.lightsEnabled = !state.params.lightsEnabled;
    lightBtn.classList.toggle('on', state.params.lightsEnabled);
    lightBtn.textContent = state.params.lightsEnabled ? 'Lights: on' : 'Lights: off';
    syncPanel();
    regenerate();
  });
  const viewBtn = document.getElementById('btn-view');
  if (viewBtn) viewBtn.textContent = TIME_PRESETS[state.view.time].label;
  const lightTgl = document.getElementById('btn-lights');
  if (lightTgl) lightTgl.classList.toggle('on', state.params.lightsEnabled);
}

/* ------------------------------------------------------------------ */
/* Keyboard                                                            */
/* ------------------------------------------------------------------ */

window.addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  switch (e.key.toLowerCase()) {
    case 'r':
      randomizeAll();
      break;
    case 'g':
      exportGLB();
      break;
    case 'f':
      viewer.frameObject(contentRoot);
      break;
    case 'h':
      state.params.lightsEnabled = !state.params.lightsEnabled;
      toggleById('btn-lights', state.params.lightsEnabled, 'Lights');
      syncPanel();
      regenerate();
      break;
    default:
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const modes = ['golden', 'noon', 'dusk', 'night', 'overcast'];
        handleAction('time', modes[Number(e.key) - 1]);
        const b = document.getElementById('btn-view');
        if (b) b.textContent = TIME_PRESETS[modes[Number(e.key) - 1]].label;
      }
  }
});

function toggleById(id, on, label) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('on', on);
    el.textContent = `${label}: ${on ? 'on' : 'off'}`;
  }
}

/* ------------------------------------------------------------------ */
/* Go                                                                  */
/* ------------------------------------------------------------------ */

buildUI();
wireHud();
// only fetch the CJK webfonts when the system cannot draw kanji itself
systemHasCJK() ? null : loadCJKFonts();
viewer.onFps = (fps) => {
  const el = document.getElementById('hud-fps');
  if (el) el.textContent = `${fps} fps`;
};
regenerate({ frame: true });
window.__gen = { state, viewer, regenerate, generator, materials };
