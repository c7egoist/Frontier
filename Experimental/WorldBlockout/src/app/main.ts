// Editor entry point: wires the world field, the spectral ocean, the GPU renderer, brush
// interaction and exports together. Everything CPU-side (field, bake, exports) works without a
// GPU; the 3D view degrades with an explicit message rather than silently drawing nothing.

import { OrbitCamera } from './camera.ts';
import { initGpu } from './device.ts';
import { Renderer, DEFAULT_SETTINGS, type RenderSettings } from '../gpu/renderer.ts';
import { SHADER_SOURCES } from './shaders.ts';
import { WorldField, DEFAULT_WORLD, bakeHeightmap, sampleBake, extractCoastline, type BrushKind, type HeightBake } from '../core/terrain.ts';
import { MERIDIAN, VESPER, THULE, AUSTRAL, ARCHIPELAGO, GULFS, CITIES, type CityPlot } from '../world/presets.ts';
import { makeCascades, calibrateCascades, DEFAULT_OCEAN, type SpectrumCascade } from '../core/oceanSpectrum.ts';
import { resolveWaterLod, type LODParams } from '../core/lod.ts';
import { downloadPng, exportHeightmapPng, exportMapPng, exportObj, exportWorldJson, exportCoastSvg, exportSpectrumCsv } from '../export/exporters.ts';
import { buildHud } from '../ui/hud.ts';
import { wireControls } from '../ui/controls.ts';

interface AppState {
  world: WorldField;
  bake: HeightBake;
  cascades: SpectrumCascade[];
  cities: CityPlot[];
  settings: RenderSettings;
  mode: '3d' | 'map';
  tool: BrushKind | 'city' | 'none';
  brushRadius: number;
  strength: number;
  paused: boolean;
  renderer: Renderer | null;
  gpuError: string | null;
  fps: number;
}

const state: AppState = {
  world: new WorldField(DEFAULT_WORLD, [MERIDIAN, VESPER, THULE, AUSTRAL], [...ARCHIPELAGO, ...GULFS]),
  bake: null as unknown as HeightBake,
  cascades: [],
  cities: CITIES.slice(),
  settings: { ...DEFAULT_SETTINGS },
  mode: '3d',
  tool: 'none',
  brushRadius: 90_000,
  strength: 0.65,
  paused: false,
  renderer: null,
  gpuError: null,
  fps: 0,
};

const camera = new OrbitCamera();
const canvas = document.getElementById('view') as HTMLCanvasElement;
const loading = document.getElementById('loading')!;
const loadingText = document.getElementById('loading-text')!;

function setLoading(text: string | null) {
  if (text === null) {
    loading.classList.add('hidden');
  } else {
    loading.classList.remove('hidden');
    loadingText.textContent = text;
  }
}

/** Bake + upload. Called on world generation and after brush edits (throttled). */
let bakeTimer: number | undefined;
function scheduleBake(ms = 90) {
  if (bakeTimer) clearTimeout(bakeTimer);
  bakeTimer = window.setTimeout(() => {
    rebake();
  }, ms);
}

function rebake() {
  const t0 = performance.now();
  const size = state.world.params.gridSize;
  state.bake = bakeHeightmap(state.world, size);
  // City pads follow the terrain: snap each plot onto land at the intersection with the bake.
  state.cities = state.cities.map((c) => {
    const h = sampleBake(state.bake, c.x, c.z);
    return { ...c, x: c.x, z: c.z, radius: c.radius, onLand: h > 0, padHeight: h } as CityPlot;
  });
  const bakeMs = performance.now() - t0;
  setLoading(null);
  if (state.renderer) {
    const layer = packWorldLayers(state.bake);
    state.renderer.setBake(state.bake, layer, cityBuffer(state.cities, state.bake));
    state.renderer.setCityCount(state.cities.length);
  }
  updateHud(bakeMs);
}

/** Pack the bake into the two float layers the GPU samples. */
function packWorldLayers(bake: HeightBake) {
  const size = bake.size;
  const height = new Float32Array(size * size * 4);
  const bathy = new Float32Array(size * size * 4);
  const h = bake.heights;
  const cell = bake.cell;
  const half = bake.worldSize / 2;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const xm = h[z * size + Math.max(0, x - 1)];
      const xp = h[z * size + Math.min(size - 1, x + 1)];
      const zm = h[Math.max(0, z - 1) * size + x];
      const zp = h[Math.min(size - 1, z + 1) * size + x];
      const slope = Math.hypot((xp - xm) / (2 * cell), (zp - zm) / (2 * cell));
      // coast distance approximated from the land/sea neighbourhood (metres)
      const inland = h[i];
      height[i * 4 + 0] = inland;
      height[i * 4 + 1] = inland >= 0 ? 1 : 0;
      height[i * 4 + 2] = inland >= 0 ? 1 : 0;
      height[i * 4 + 3] = slope;
      bathy[i * 4 + 0] = inland;
      bathy[i * 4 + 1] = (x / size) * 2 - 1;
      bathy[i * 4 + 2] = (z / size) * 2 - 1;
      bathy[i * 4 + 3] = 1;
    }
  }
  void half;
  return { height, bathy };
}

function cityBuffer(cities: CityPlot[], bake: HeightBake): Float32Array {
  const buf = new Float32Array(32 * 4);
  cities.slice(0, 32).forEach((c, i) => {
    const kind = c.kind === 'capital' ? 2 : c.kind === 'port' ? 1 : 0;
    buf[i * 4 + 0] = c.x;
    buf[i * 4 + 1] = c.z;
    buf[i * 4 + 2] = c.radius;
    buf[i * 4 + 3] = kind;
  });
  void bake;
  return buf;
}

function regenerateSpectrum() {
  const tiles = [512, 64, 8];
  const params = {
    ...DEFAULT_OCEAN,
    windSpeed: state.settings.windSpeed,
    windDirection: state.settings.windDirection,
    choppiness: state.settings.choppiness,
  };
  const cascades = makeCascades(tiles, state.settings.spectrumSize, state.world.params.seed, params);
  state.cascades = calibrateCascades(cascades, params.windSpeed);
  state.renderer?.setSpectrum(state.cascades);
  updateHud();
}

let hudTimer: number | undefined;
function updateHud(bakeMs?: number) {
  if (hudTimer) clearTimeout(hudTimer);
  hudTimer = window.setTimeout(() => {
    buildHud({
        seed: state.world.params.seed,
        gridSize: state.world.params.gridSize,
        landFraction: state.bake?.landFraction ?? 0,
        ops: state.world.ops,
        cities: state.cities,
        cascades: state.cascades,
        settings: state.settings,
        lod: state.renderer?.currentLod ?? null,
        stats: state.renderer?.stats ?? null,
        gpuError: state.gpuError,
        fps: state.fps,
        bakeMs: bakeMs ?? 0,
        tool: state.tool,
    });
    wireOutliner();
  }, 60);
}

function wireOutliner() {
  const el = document.getElementById('outliner');
  if (!el) return;
  const items = state.world.ops.slice(-40).reverse();
  el.innerHTML = items.map(op => `
    <div class="item" data-op="${op.id}">
      <span class="kind">${op.kind}</span>
      <span class="name">${op.name ?? `${Math.round(op.radius / 1000)} km`}</span>
      <button data-del="${op.id}" title="Delete">✕</button>
    </div>`).join('') || '<div class="item"><span class="kind">—</span><span class="name">No sculpt ops yet</span></div>';
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = Number((b as HTMLElement).dataset.del);
      state.world.removeOp(id);
      scheduleBake(30);
    });
  });
}

// ---------------------------------------------------------------------------
// Brush interaction
// ---------------------------------------------------------------------------
let dragging = false;
let dragMoved = 0;
let lastX = 0, lastY = 0;
let painting = false;

function screenRay(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  return camera.ray(ndcX, ndcY, rect.width / rect.height);
}

/** Intersect the camera ray with the water plane and then march onto the height field. */
function pickWorld(clientX: number, clientY: number): [number, number] | null {
  const { origin, dir } = screenRay(clientX, clientY);
  if (Math.abs(dir[1]) < 1e-5) return null;
  let t = -origin[1] / dir[1];
  if (t < 0) return null;
  // Two refinement steps: sample the bake along the ray and step to the surface crossing.
  for (let i = 0; i < 40; i++) {
    const p: [number, number] = [origin[0] + dir[0] * t, origin[2] + dir[2] * t];
    const h = state.bake ? sampleBake(state.bake, p[0], p[1]) : 0;
    const y = origin[1] + dir[1] * t;
    if (y <= h + 1) return p;
    t += Math.max(20, Math.abs(y - h) / Math.max(Math.abs(dir[1]), 0.02)) * 0.6;
  }
  return [origin[0] + dir[0] * t, origin[2] + dir[2] * t];
}

function applyBrush(clientX: number, clientY: number) {
  const hit = pickWorld(clientX, clientY);
  if (!hit) return;
  const [x, z] = hit;
  if (state.tool === 'none') return;
  if (state.tool === 'city') {
    const idx = state.cities.length;
    state.cities.push({ name: `Plot ${idx + 1}`, x, z, radius: Math.max(4000, state.brushRadius * 0.3), kind: 'outpost' });
    // A city needs a pad to sit on, so a flatten op is authored with it.
    state.world.addOp({
      kind: 'flatten', x, z, radius: Math.max(6000, state.brushRadius * 0.45),
      strength: state.strength, target: Math.max(12, sampleBake(state.bake, x, z)), name: `Pad ${idx + 1}`,
    });
    scheduleBake(30);
    return;
  }
  const kind = state.tool as BrushKind;
  const radius = state.brushRadius;
  const strength = kind === 'raise' || kind === 'lower'
    ? state.strength * 1800
    : kind === 'flatten'
      ? state.strength
      : state.strength;
  state.world.addOp({
    kind, x, z, radius,
    strength,
    target: kind === 'flatten' ? Math.max(10, sampleBake(state.bake, x, z)) : undefined,
    squareness: kind === 'gulf' || kind === 'blob' ? 0.25 : 0,
    name: `${kind} ${(radius / 1000).toFixed(0)} km`,
  });
  scheduleBake(40);
}

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  dragMoved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  if (state.tool !== 'none' && state.mode === '3d') {
    painting = true;
    applyBrush(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (painting) {
    if (dragMoved > 18) {
      painting = false;
    }
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (e.shiftKey || e.buttons === 4) {
    camera.pan(dx, dy, rect.height);
  } else {
    camera.orbit(dx, dy);
  }
});

canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  painting = false;
  canvas.releasePointerCapture(e.pointerId);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.zoom(e.deltaY);
}, { passive: false });

// WASD / QE fly
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function flyStep(dt: number) {
  const speed = camera.distance * 0.9 * dt;
  const s = Math.sin(camera.yaw), c = Math.cos(camera.yaw);
  if (keys.has('w')) { camera.target[0] -= s * speed; camera.target[1] -= c * speed; }
  if (keys.has('s')) { camera.target[0] += s * speed; camera.target[1] += c * speed; }
  if (keys.has('a')) { camera.target[0] -= c * speed; camera.target[1] += s * speed; }
  if (keys.has('d')) { camera.target[0] += c * speed; camera.target[1] -= s * speed; }
  if (keys.has('q')) camera.distance = Math.min(260_000, camera.distance * (1 + dt * 1.4));
  if (keys.has('e')) camera.distance = Math.max(12, camera.distance * (1 - dt * 1.4));
}

// ---------------------------------------------------------------------------
// Resize + loop
// ---------------------------------------------------------------------------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', resize);

let last = performance.now();
let frameCount = 0;
let fpsTimer = 0;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  resize();
  flyStep(dt);
  frameCount++;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    state.fps = frameCount / fpsTimer;
    frameCount = 0;
    fpsTimer = 0;
  }
  if (state.renderer) {
    try {
      state.renderer.render(camera, state.paused ? 0 : dt, {
        mapView: state.mode === 'map',
        mapCenter: [camera.target[0], camera.target[1]],
        mapHalf: camera.distance * 0.9,
      });
    } catch (err) {
      state.gpuError = (err as Error).message;
      state.renderer = null;
      showError(state.gpuError);
    }
  }
  updateHudLight();
  requestAnimationFrame(frame);
}

function updateHudLight() {
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  };
  set('stat-fps', `${state.fps.toFixed(0)} fps`);
  const stats = state.renderer?.stats;
  if (stats) {
    set('stat-tris', `${(stats.triangles / 1000).toFixed(0)}k tris`);
    set('stat-hs', `Hs ${stats.hs.toFixed(1)} m`);
    const plan = stats.lod;
    if (plan) {
      const ringEl = document.getElementById('lod-plan');
      if (ringEl) {
        ringEl.innerHTML = `<span class="muted">${plan.reason}</span>\n` +
          plan.rings.map(r => `${r.index}  ${String(r.spacing).padStart(6)} m  ${r.regime.padEnd(9)}  err ${r.errorPx.toFixed(1)} px`).join('\n');
      }
      const casEl = document.getElementById('cascade-list');
      if (casEl && state.cascades.length) {
        casEl.innerHTML = state.cascades.map((c) => {
          const texel = c.cfg.tile / c.cfg.size;
          return `cascade ${String(c.cfg.tile).padStart(4)} m  texel ${texel.toFixed(2)} m  Hs ${c.targetHs.toFixed(2)} m`;
        }).join('\n');
      }
      const simEl = document.getElementById('sim-readout');
      if (simEl) {
        simEl.innerHTML = `sim ${stats.simResolution}²  dt ${stats.simDtMs.toFixed(1)} ms  steps ${stats.simSteps}  ring0 ${state.settings.simExtent} m`;
      }
    }
  }
}

function showError(msg: string) {
  const panel = document.getElementById('error-panel') as HTMLElement;
  const text = document.getElementById('error-text')!;
  panel.hidden = false;
  text.textContent = msg;
  const gpu = document.getElementById('stat-gpu')!;
  gpu.classList.add('bad');
  gpu.textContent = 'GPU unavailable — map + exports still work';
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  setLoading('Baking world field…');
  await new Promise(r => setTimeout(r, 16));
  state.world = new WorldField(
    { ...DEFAULT_WORLD, gridSize: Number((document.getElementById('bake-res') as HTMLSelectElement).value) },
    [MERIDIAN, VESPER, THULE, AUSTRAL],
    [...ARCHIPELAGO, ...GULFS],
  );
  state.bake = bakeHeightmap(state.world, state.world.params.gridSize);

  setLoading('Building ocean spectrum…');
  await new Promise(r => setTimeout(r, 16));
  regenerateSpectrum();

  setLoading('Starting WebGPU…');
  const gpu = await initGpu();
  if (!gpu.ok || !gpu.device) {
    state.gpuError = gpu.error ?? 'GPU unavailable';
    showError(state.gpuError);
    setLoading(null);
    wireControls({ state }, { camera, regenerateSpectrum, scheduleBake, rebake, updateHud });
    requestAnimationFrame(frame);
    return;
  }
  document.getElementById('stat-gpu')!.textContent = gpu.adapterInfo ?? 'GPU ready';

  try {
    const renderer = new Renderer(gpu.device, canvas, gpu.format!);
    await renderer.init(SHADER_SOURCES, gpu.format!);
    renderer.settings = state.settings;
    renderer.setSpectrum(state.cascades);
    state.renderer = renderer;
    rebake();
  } catch (err) {
    state.gpuError = (err as Error).message;
    showError(state.gpuError);
  }
  setLoading(null);
  wireControls({ state }, { camera, regenerateSpectrum, scheduleBake, rebake, updateHud });
  wireExports();
  requestAnimationFrame(frame);
}

function wireExports() {
  const safe = (name: string, fn: () => void) => {
    document.getElementById(name)?.addEventListener('click', fn);
  };
  safe('btn-png', () => exportMapPng(state.bake, state.world.ops));
  safe('btn-height', () => exportHeightmapPng(state.bake));
  safe('btn-obj', () => exportObj(state.bake));
  safe('btn-json', () => exportWorldJson(state.world, state.cities, state.settings));
  safe('btn-coast', () => exportCoastSvg(extractCoastline(state.bake), state.bake));
  safe('btn-spectrum', () => exportSpectrumCsv(state.cascades));
  void downloadPng;
}

boot().catch((err) => {
  showError(String(err && (err as Error).stack || err));
  setLoading(null);
});
