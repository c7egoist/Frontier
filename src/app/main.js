import {
  GpuErosionEngine,
  TERRAIN_RESOLUTION_STORAGE_KEY,
  normalizeTerrainResolution,
  resolveTerrainResolution,
  terrainResolutionProfile,
} from '../erosion/gpu-erosion-engine.js';
import { ErosionLayerStackUI } from '../erosion/layer-stack-ui.js';
import {
  LAYER_OPERATION_SPECS,
  TERRAIN_STACK_PRESETS,
  createStackLayer,
} from '../erosion/terrain-stack-presets.js';
import { DEFAULT_CUSTOM_ARCH_CURVES } from '../geology/custom-arch-spline.js';
import { FORMATION_PRESETS, LITHOLOGY_PALETTES, resolveParams } from '../geology/presets.js';
import { exportFormationToGLB } from '../io/glb-exporter.js';
import { exportFormationToOBJ } from '../io/obj-exporter.js';
import { ArchCurveGizmoOverlay } from './arch-curve-gizmo.js';
import { RockStudioViewport } from './viewport.js';

// ============================================================================
// SCHEMA DEFINITIONS: 3D ROCK & CLIFF STUDIO
// ============================================================================

const SLIDER_SCHEMA = {
  tectonics: [
    { key: 'dipAngle',       label: 'Bedding / Foliation Dip', min: 0,   max: 78,  step: 1,    fmt: (v) => `${v}°` },
    { key: 'strikeAngle',    label: 'Strike Azimuth',          min: -90, max: 90,  step: 1,    fmt: (v) => `${v}°` },
    { key: 'jointDensity',   label: 'Joint Set Density',       min: 0.2, max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'jointAperture',  label: 'Joint Notch Aperture',    min: 0.0, max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'faultIntensity', label: 'Fault Slip & Gullies',    min: 0.0, max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
  ],
  macro: [
    { key: 'scale',            label: 'Real-World Scale',       min: 2.5, max: 28,  step: 0.5,  fmt: (v) => `${Number(v).toFixed(1)}m` },
    { key: 'overhangStrength', label: 'Overhangs & Competency', min: 0.0, max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'pluckingAmount',   label: 'Block Plucking',         min: 0.0, max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'talusAmount',      label: 'Talus & Fallen Slabs',   min: 0.0, max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
  ],
  detail: [
    { key: 'cleavageSharpness', label: 'Cleavage Planarity',     min: 0.15, max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'facetAmplitude',    label: 'Stepped Scarplet Depth', min: 0.0,  max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'edgeWear',          label: 'Chisel Chamfer & Wear',  min: 0.0,  max: 1.0, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'creaseAngle',       label: 'Crease Split Angle',     min: 22,   max: 85,  step: 1,    fmt: (v) => `${v}°` },
  ],
  erosion: [
    { key: 'rainErosionAmount', label: 'Rainfall Erosion Amount', min: 0, max: 1, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'rainDroplets',      label: 'Raindrop Count',          min: 0, max: 24000, step: 500, fmt: (v) => `${(Number(v) / 1000).toFixed(1)}k` },
    { key: 'rainEdgeProtection', label: 'Sharp Edge Protection',  min: 0, max: 1, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'chemAmount',    label: 'Chemical Weathering (Rust/Patina)', min: 0, max: 1, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'ironContent',   label: 'Iron Content (Rust Stain)',         min: 0, max: 1, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'copperContent', label: 'Copper Content (Blue Patina)',      min: 0, max: 1, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` },
  ],
};

const CATEGORIES = ['All', 'Arch', 'Sedimentary', 'Desert', 'Cliff', 'Outcrop', 'Boulder', 'Fracture Demo'];
const QUICK_SEEDS = [4029, 7714, 1984, 9301, 5518, 2607];

const state = {
  studioMode: window.location.hash === '#rock' ? 'rock' : 'erosion',
  params: resolveParams({
    archetype: 'desert-arch', seed: 4029, quality: 'medium', decimation: 1.0,
    rainErosionAmount: 0.5, rainDroplets: 8000, rainEdgeProtection: 0.7,
    chemAmount: 0.8, ironContent: 0.7, copperContent: 0.25,
  }),
  categoryFilter: 'All',
  latestResult: null,
  autoFrameNext: true,
  rockInitializedOnce: false,
  curveMode: false,
  customCurveActive: false,
};

// ============================================================================
// VIEWPORTS & WORKER INITIALIZATION
// ============================================================================

const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const statusToast = document.getElementById('status-toast');
const viewportEl = document.getElementById('viewport-canvas');
const stageEl = document.querySelector('.viewport-stage');
const erosionCanvas = document.getElementById('erosion-canvas');
const terrainResolutionSelect = document.getElementById('tp-terrain-resolution');
const initialTerrainResolution = resolveTerrainResolution();
if (terrainResolutionSelect) terrainResolutionSelect.value = String(initialTerrainResolution);

let erosionEngine = null;
let erosionLayerStackUI = null;
let fatalGpuError = null;
let viewport = null;
let curveOverlay = null;
let curveToolBound = false;

function ensureRockViewport() {
  if (viewport) return viewport;
  try {
    viewport = new RockStudioViewport(viewportEl);
    viewport.setActive(false);
    curveOverlay = new ArchCurveGizmoOverlay(stageEl, {
      getCameraAdapter: () => (state.studioMode === 'rock' && viewport ? viewport.getCameraAdapter() : null),
      onCurveChanged: () => updateCurveReadout(),
      onCurveCommitted: (curves) => {
        state.customCurveActive = true;
        updateCurveReadout();
        state.params.customArchCurves = curves;
        requestSynthesis(false);
      },
    });
    if (!curveToolBound) {
      curveToolBound = true;
      initCurveTool();
    }
  } catch (err) {
    console.error('Rock Studio viewport error:', err);
  }
  return viewport;
}

function updateErosionHud(tel) {
  const elGrid = document.getElementById('er-stat-grid');
  const elSteps = document.getElementById('er-stat-steps');
  const elEval = document.getElementById('er-stat-eval');
  const elCaves = document.getElementById('er-stat-caves');
  const elCut = document.getElementById('er-stat-cut');
  const elSed = document.getElementById('er-stat-sed');
  const elWater = document.getElementById('er-stat-water');
  const elFps = document.getElementById('er-stat-fps');

  if (elGrid) elGrid.textContent = `${tel.gridRes ?? erosionEngine?.gridRes ?? initialTerrainResolution}²`;
  if (elSteps) elSteps.textContent = String(tel.layerCount ?? tel.steps ?? 0);
  if (elEval) elEval.textContent = `${(tel.evalMs ?? 0).toFixed(1)} ms`;
  if (elCaves) elCaves.textContent = `${(tel.caveTris ?? 0).toLocaleString()} tris`;
  if (elCut) elCut.textContent = `${(tel.coarseSedM3 ?? 0).toLocaleString()} m³`;
  if (elSed) elSed.textContent = `${(tel.fineSedM3 ?? 0).toLocaleString()} m³`;
  if (elWater) elWater.textContent = `${(tel.waterVolumeM3 ?? 0).toLocaleString()} m³`;
  if (elFps) elFps.textContent = `${tel.fps ?? 60} FPS`;
}

try {
  erosionEngine = new GpuErosionEngine(erosionCanvas, updateErosionHud, {
    gridSize: initialTerrainResolution,
  });
} catch (err) {
  fatalGpuError = err.message || String(err);
  console.error('GPU Terrain Pipeline initialization error:', err);
  statusToast.classList.remove('hidden');
  statusToast.textContent = `GPU Pipeline Error: ${fatalGpuError}`;
}

const worker = new Worker(new URL('../worker/gen-worker.js', import.meta.url), { type: 'module' });
let reqCounter = 0;
let busy = false;
let pendingRequest = null;

function requestSynthesis(autoFrame = false) {
  ensureRockViewport();
  if (autoFrame) state.autoFrameNext = true;
  const payload = { params: { ...state.params } };
  if (busy) {
    pendingRequest = payload;
    return;
  }
  dispatchToWorker(payload);
}

function dispatchToWorker(payload) {
  busy = true;
  const id = ++reqCounter;
  if (state.studioMode === 'rock') {
    progressBar.classList.remove('hidden');
    progressFill.style.width = '5%';
    statusToast.classList.remove('hidden');
    statusToast.textContent = 'Synthesizing 3D geology...';
  }
  worker.postMessage({ id, params: payload.params });
}

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'progress') {
    if (state.studioMode === 'rock') {
      progressFill.style.width = `${Math.round(msg.progress * 100)}%`;
      statusToast.textContent = msg.stage;
    }
    return;
  }

  busy = false;
  if (msg.type === 'done') {
    if (curveOverlay && state.customCurveActive) {
      curveOverlay.setCurves(state.params.customArchCurves || DEFAULT_CUSTOM_ARCH_CURVES, false);
      updateCurveReadout();
    }

    state.latestResult = {
      params: msg.params,
      lithology: msg.lithology,
      stats: msg.stats,
      mesh: msg.mesh,
    };

    const selectLith = document.getElementById('select-lithology');
    if (selectLith && msg.lithology) selectLith.value = msg.lithology;

    if (viewport) {
      viewport.setFormationMesh(
        msg.mesh,
        msg.lithology,
        msg.stats.dimensions,
        state.autoFrameNext
      );
    }
    state.autoFrameNext = false;
    updateRockHud(msg.stats);
  } else if (msg.type === 'error') {
    console.error('Geology worker error:', msg.message);
    statusToast.classList.remove('hidden');
    statusToast.textContent = `Error: ${msg.message}`;
  }

  if (pendingRequest) {
    const next = pendingRequest;
    pendingRequest = null;
    dispatchToWorker(next);
  } else {
    progressBar.classList.add('hidden');
    if (!fatalGpuError) {
      statusToast.classList.add('hidden');
    }
  }
};

function updateRockHud(stats) {
  const [dx, dy, dz] = stats.dimensions;
  document.getElementById('stat-dims').textContent = `${dx}×${dy}×${dz}m`;
  document.getElementById('stat-tris').textContent = stats.triangles.toLocaleString();
  document.getElementById('stat-verts').textContent = stats.vertices.toLocaleString();
  document.getElementById('stat-blocks').textContent = `${stats.blockCount}`;
  document.getElementById('stat-time').textContent = `${stats.elapsedMs}ms`;
}

// ============================================================================
// WORKSPACE SWITCHING (TERRAIN STUDIO <-> 3D ROCK & CLIFF STUDIO)
// ============================================================================

function setStudioMode(mode) {
  state.studioMode = mode === 'rock' ? 'rock' : 'erosion';
  const isTerrain = state.studioMode === 'erosion';

  document.getElementById('mode-btn-erosion').classList.toggle('active', isTerrain);
  document.getElementById('mode-btn-rock').classList.toggle('active', !isTerrain);

  document.getElementById('left-erosion-panels').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('right-erosion-panels').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('tp-terrain-bars').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('tp-terrain-header-actions').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('hud-erosion').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('cb-shelf-root').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('erosion-canvas').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('spline-gizmo-svg').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('wind-debug-canvas').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('tp-scene-nav').classList.toggle('hidden-panel', !isTerrain);
  document.getElementById('tp-scene-caption').classList.toggle('hidden-panel', !isTerrain);

  document.getElementById('left-rock-panels').classList.toggle('hidden-panel', isTerrain);
  document.getElementById('right-rock-panels').classList.toggle('hidden-panel', isTerrain);
  document.getElementById('hud-rock').classList.toggle('hidden-panel', isTerrain);
  document.getElementById('viewport-canvas').classList.toggle('hidden-panel', isTerrain);
  document.getElementById('rock-camera-bar').classList.toggle('hidden-panel', isTerrain);

  const leftTabLabel = document.getElementById('tp-left-tab-label');
  if (leftTabLabel) leftTabLabel.textContent = isTerrain ? 'Layer stack' : 'Rock archetypes';

  if (isTerrain) {
    progressBar.classList.add('hidden');
    if (!fatalGpuError) {
      statusToast.classList.add('hidden');
    }
    if (curveOverlay && state.curveMode) setCurveMode(false);
    if (viewport) viewport.setActive(false);
    if (erosionEngine) {
      erosionEngine.resizeIfNeeded();
      erosionEngine.start();
    }
    window.history.replaceState(null, '', '#terrain');
  } else {
    if (erosionEngine) erosionEngine.stop();
    const vp = ensureRockViewport();
    if (vp) vp.setActive(true);
    if (!state.rockInitializedOnce) {
      state.rockInitializedOnce = true;
      requestSynthesis(true);
    } else if (state.latestResult && vp) {
      vp.frameCamera('hero');
    }
    window.history.replaceState(null, '', '#rock');
  }
}

document.getElementById('mode-btn-erosion').addEventListener('click', () => setStudioMode('erosion'));
document.getElementById('mode-btn-rock').addEventListener('click', () => setStudioMode('rock'));

// Focus mode keeps every control available, but temporarily removes the two
// side docks so the terrain/rock viewport becomes the dominant workspace.
const focusPanelsButton = document.getElementById('btn-toggle-panels');
if (focusPanelsButton) {
  focusPanelsButton.addEventListener('click', () => {
    const focused = document.body.classList.toggle('tp-focus-mode');
    focusPanelsButton.classList.toggle('active-play', focused);
    focusPanelsButton.setAttribute('aria-pressed', focused ? 'true' : 'false');
    focusPanelsButton.textContent = focused ? 'Panels' : 'Focus';
    focusPanelsButton.title = focused
      ? 'Show the layer stack and inspector again'
      : 'Hide the side panels and give the 3D viewport the full workspace';
    requestAnimationFrame(() => {
      erosionEngine?.resizeIfNeeded();
      viewport?.resize();
    });
  });
}

// Resolution changes are intentionally applied through a clean studio reload:
// the engine allocates its complete GPU working set from gridSize at boot.
// A one-time session snapshot carries the authored document (preset, stack,
// spline points, settings, cave-stroke list and camera) across that reload;
// live erosion and GPU-resident height sculpt stamps are rebuilt/reset.
const TERRAIN_RESOLUTION_SNAPSHOT_KEY = 'frontier.terrainResolution.snapshot.v1';
const TERRAIN_SIM_PROCESS_IDS = ['hydraulic', 'cryo', 'wind', 'rockfall', 'chemical'];

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function discardTerrainResolutionSnapshot() {
  try {
    window.sessionStorage.removeItem(TERRAIN_RESOLUTION_SNAPSHOT_KEY);
  } catch (_) {
    // Storage is an enhancement here; the resolution URL still works alone.
  }
}

function captureTerrainResolutionSnapshot(nextResolution) {
  if (!erosionEngine?.pipeline) return false;
  const pipe = erosionEngine.pipeline;
  try {
    const sculptCaveStrokes = {};
    for (const [layerId, entry] of pipe.sculptStore.entries()) {
      if (Array.isArray(entry?.caveStrokes) && entry.caveStrokes.length) {
        sculptCaveStrokes[layerId] = structuredClone(entry.caveStrokes.slice(0, 20000));
      }
    }

    const snapshot = {
      version: 1,
      savedAt: Date.now(),
      targetResolution: normalizeTerrainResolution(nextResolution),
      activePresetId: pipe.activePresetId,
      projectTitle: pipe.projectTitle,
      paletteId: pipe.paletteId,
      fabricMode: pipe.fabricMode,
      shadingMode: pipe.shadingMode,
      selectedLayerId: pipe.selectedLayerId,
      simPlaybackMode: pipe.simPlaybackMode,
      simSoloProcess: pipe.simSoloProcess,
      simProcessEnabled: structuredClone(pipe.simProcessEnabled),
      layers: structuredClone(pipe.layers),
      sculptCaveStrokes,
      engineParams: structuredClone(erosionEngine.params),
      camera: structuredClone(erosionEngine.camera),
    };
    window.sessionStorage.setItem(TERRAIN_RESOLUTION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    console.warn('Could not preserve the terrain document across the resolution reload:', err);
    discardTerrainResolutionSnapshot();
    return false;
  }
}

function restoreTerrainResolutionSnapshot() {
  if (!erosionEngine?.pipeline) return false;
  const pipe = erosionEngine.pipeline;
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(TERRAIN_RESOLUTION_SNAPSHOT_KEY);
    if (raw) window.sessionStorage.removeItem(TERRAIN_RESOLUTION_SNAPSHOT_KEY);
  } catch (_) {
    return false;
  }
  if (!raw) return false;

  let fallbackPresetId = pipe.activePresetId;
  try {
    const snapshot = JSON.parse(raw);
    if (!isPlainRecord(snapshot) || snapshot.version !== 1) return false;
    if (normalizeTerrainResolution(snapshot.targetResolution) !== erosionEngine.gridRes) return false;
    if (!Number.isFinite(snapshot.savedAt) || Date.now() - snapshot.savedAt > 15 * 60 * 1000) return false;
    if (!Array.isArray(snapshot.layers) || snapshot.layers.length < 1 || snapshot.layers.length > 80) return false;
    if (!isPlainRecord(snapshot.engineParams) || !isPlainRecord(snapshot.camera)) return false;
    if (typeof snapshot.activePresetId === 'string' && TERRAIN_STACK_PRESETS[snapshot.activePresetId]) {
      fallbackPresetId = snapshot.activePresetId;
    }

    // Sanitize and rebuild every layer through the normal factory first, so
    // a malformed snapshot cannot leave the live pipeline half-restored.
    const oldIds = new Set();
    const idMap = new Map();
    const restoredLayers = snapshot.layers.map((layer) => {
      if (!isPlainRecord(layer) || typeof layer.type !== 'string' || !LAYER_OPERATION_SPECS[layer.type]) {
        throw new Error('Snapshot contains an unknown terrain layer');
      }
      if (typeof layer.id !== 'string' || oldIds.has(layer.id)) {
        throw new Error('Snapshot contains a duplicate terrain layer id');
      }
      if (layer.params !== undefined && !isPlainRecord(layer.params)) {
        throw new Error('Snapshot contains invalid layer parameters');
      }
      if (layer.mask !== undefined && !isPlainRecord(layer.mask)) {
        throw new Error('Snapshot contains an invalid layer mask');
      }
      oldIds.add(layer.id);
      const restored = createStackLayer(layer.type, {
        name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.slice(0, 120) : undefined,
        enabled: layer.enabled !== false,
        locked: Boolean(layer.locked),
        mask: layer.mask,
        params: layer.params || {},
      });
      idMap.set(layer.id, restored.id);
      return restored;
    });
    if (!restoredLayers.some((layer) => layer.type === 'base-landform')) {
      throw new Error('Snapshot has no base landform');
    }

    const restoredCaveStrokes = new Map();
    if (snapshot.sculptCaveStrokes !== undefined) {
      if (!isPlainRecord(snapshot.sculptCaveStrokes)) throw new Error('Snapshot contains invalid cave strokes');
      for (const [oldLayerId, strokes] of Object.entries(snapshot.sculptCaveStrokes)) {
        const newLayerId = idMap.get(oldLayerId);
        const layer = restoredLayers.find((candidate) => candidate.id === newLayerId);
        if (!layer || layer.type !== 'sculpt-layer' || !Array.isArray(strokes) || strokes.length > 20000) continue;
        const cleanStrokes = strokes.map((stroke) => {
          if (!isPlainRecord(stroke)) throw new Error('Snapshot contains an invalid cave stroke');
          const clean = {
            x: Number(stroke.x),
            y: Number(stroke.y),
            z: Number(stroke.z),
            radius: Number(stroke.radius),
            strength: Number(stroke.strength),
            op: stroke.op === 'cave-fill' ? 'cave-fill' : 'cave-carve',
          };
          if (![clean.x, clean.y, clean.z, clean.radius, clean.strength].every(Number.isFinite)) {
            throw new Error('Snapshot contains a non-finite cave stroke');
          }
          return clean;
        });
        restoredCaveStrokes.set(newLayerId, cleanStrokes);
      }
    }

    // Painted height stamps live only in GPU textures, so only cave strokes
    // survive the reallocation. Keep the visible edit count honest.
    for (const layer of restoredLayers) {
      if (layer.type === 'sculpt-layer') {
        layer.params.strokeCount = restoredCaveStrokes.get(layer.id)?.length || 0;
      }
    }

    const restoredSimEnabled = {};
    for (const processId of TERRAIN_SIM_PROCESS_IDS) {
      restoredSimEnabled[processId] = snapshot.simProcessEnabled?.[processId] !== false;
    }
    const camera = snapshot.camera;
    const restoredCamera = {
      yaw: Number(camera.yaw),
      pitch: Number(camera.pitch),
      distance: Number(camera.distance),
      target: Array.isArray(camera.target) ? camera.target.slice(0, 3).map(Number) : [],
    };
    if (![restoredCamera.yaw, restoredCamera.pitch, restoredCamera.distance, ...restoredCamera.target].every(Number.isFinite)
      || restoredCamera.target.length !== 3) {
      throw new Error('Snapshot contains an invalid camera');
    }

    // Mutation begins only after validation. Clear sculpt textures created
    // for the boot preset in the same way loadPreset() does.
    for (const entry of pipe.sculptStore.values()) {
      for (const tex of entry.tex || []) pipe.gl.deleteTexture(tex);
      for (const fbo of entry.fbo || []) pipe.gl.deleteFramebuffer(fbo);
    }
    pipe.sculptStore.clear();

    Object.assign(erosionEngine.params, structuredClone(snapshot.engineParams), {
      gridSize: erosionEngine.gridRes,
    });
    erosionEngine.camera.yaw = restoredCamera.yaw;
    erosionEngine.camera.pitch = restoredCamera.pitch;
    erosionEngine.camera.distance = restoredCamera.distance;
    erosionEngine.camera.target = restoredCamera.target;

    pipe.activePresetId = fallbackPresetId;
    pipe.projectTitle = typeof snapshot.projectTitle === 'string' && snapshot.projectTitle.trim()
      ? snapshot.projectTitle.slice(0, 160)
      : (TERRAIN_STACK_PRESETS[fallbackPresetId]?.name || pipe.projectTitle);
    pipe.paletteId = Number.isFinite(Number(snapshot.paletteId)) ? Number(snapshot.paletteId) : pipe.paletteId;
    pipe.fabricMode = Number.isFinite(Number(snapshot.fabricMode)) ? Number(snapshot.fabricMode) : pipe.fabricMode;
    pipe.shadingMode = Math.max(0, Math.min(9, Math.round(Number(snapshot.shadingMode) || 0)));
    pipe.authorTool = 'navigate';
    pipe.layers = restoredLayers;
    pipe.selectedLayerId = idMap.get(snapshot.selectedLayerId) || restoredLayers[0]?.id || null;
    pipe.simPlaybackMode = snapshot.simPlaybackMode === 'all' ? 'all' : 'solo';
    pipe.simSoloProcess = TERRAIN_SIM_PROCESS_IDS.includes(snapshot.simSoloProcess)
      ? snapshot.simSoloProcess
      : 'hydraulic';
    pipe.simProcessEnabled = restoredSimEnabled;

    for (const [layerId, strokes] of restoredCaveStrokes.entries()) {
      pipe._getOrCreateSculptEntry(layerId).caveStrokes.push(...strokes);
    }

    pipe.evaluateStack({ reseedPlacements: true });
    pipe.pauseSimulationForEdit(`Terrain rebuilt at ${erosionEngine.gridRes}²`);
    return true;
  } catch (err) {
    console.warn('Could not restore the terrain document after the resolution reload:', err);
    try {
      pipe.loadPreset(fallbackPresetId);
    } catch (_) {
      // The boot preset remains available if even the fallback cannot load.
    }
    return false;
  }
}

if (terrainResolutionSelect) {
  terrainResolutionSelect.value = String(erosionEngine?.gridRes ?? initialTerrainResolution);
  terrainResolutionSelect.addEventListener('change', () => {
    const current = normalizeTerrainResolution(erosionEngine?.gridRes ?? initialTerrainResolution);
    const next = normalizeTerrainResolution(terrainResolutionSelect.value, current);
    if (next === current) {
      terrainResolutionSelect.value = String(current);
      return;
    }

    const profile = terrainResolutionProfile(next, erosionEngine?.params?.worldSpan);
    const workload = profile.relativeCellCount >= 1
      ? `${profile.relativeCellCount.toFixed(profile.relativeCellCount % 1 ? 2 : 0)}× the 512² cell count`
      : `${Math.round(profile.relativeCellCount * 100)}% of the 512² cell count`;
    const documentSaved = captureTerrainResolutionSnapshot(next);
    const restoreNote = documentSaved
      ? 'Your current recipe, layer stack, spline points, settings and camera will be restored after the reload. Live erosion progress and painted heightfield sculpt stamps will reset because their GPU textures are being reallocated.'
      : 'The studio will reload to the default terrain so all GPU buffers match.';
    const confirmed = window.confirm(
      `Rebuild Terrain Studio at ${next}×${next} (${profile.label}, about ${profile.cellSizeMeters.toFixed(2)} m per cell, ${workload})?\n\n` +
      restoreNote
    );
    if (!confirmed) {
      discardTerrainResolutionSnapshot();
      terrainResolutionSelect.value = String(current);
      return;
    }

    try {
      window.localStorage.setItem(TERRAIN_RESOLUTION_STORAGE_KEY, String(next));
    } catch (_) {
      // The URL below still carries the choice when storage is unavailable.
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('terrainRes', String(next));
    window.location.assign(nextUrl.toString());
  });
}

// ============================================================================
// FRONTIER TERRAIN STUDIO PIPELINE CONTROLS
// ============================================================================

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initTerrainStudio() {
  if (!erosionEngine) return;

  restoreTerrainResolutionSnapshot();
  erosionLayerStackUI = new ErosionLayerStackUI(erosionEngine);

  // Viewport visibility toggles: hide/show Water, Snow & Rain independently
  // (visual only -- the simulations keep running underneath).
  const visBindings = [
    ['tp-vis-water', 'showWater'],
    ['tp-vis-snow', 'showSnow'],
    ['tp-vis-rain', 'showRain'],
  ];
  for (const [elId, paramKey] of visBindings) {
    const el = document.getElementById(elId);
    if (!el) continue;
    el.checked = erosionEngine.params[paramKey] !== false;
    el.addEventListener('change', () => {
      erosionEngine.params[paramKey] = el.checked;
      // Keep the inspector's matching checkbox in sync when rendered
      const mirrorId = paramKey === 'showWater' ? 'tp-chk-show-water'
        : paramKey === 'showSnow' ? 'tp-chk-show-snow'
        : 'tp-chk-show-rain';
      const mirror = document.getElementById(mirrorId);
      if (mirror) mirror.checked = el.checked;
    });
  }

  const chemSlider = document.getElementById('tp-chem');
  if (chemSlider) {
    chemSlider.value = erosionEngine.params.chemicalWeathering ?? 0.7;
    chemSlider.addEventListener('input', () => {
      erosionEngine.params.chemicalWeathering = Number(chemSlider.value);
    });
  }

  const playBtn = document.getElementById('btn-er-play');
  const syncPlayBtn = (state = erosionEngine.pipeline.getSimulationControlState()) => {
    erosionEngine.playing = state.running;
    playBtn.textContent = state.running ? '⏸ Pause' : '▶ Simulate';
    playBtn.classList.toggle('active-play', state.running);
    playBtn.title = state.running
      ? 'Pause all live simulation seasons [Space]'
      : 'Simulate the selected season — or all enabled seasons in Simultaneous mode [Space]';
  };
  erosionEngine.pipeline.addSimulationStateListener(syncPlayBtn);
  syncPlayBtn();
  playBtn.addEventListener('click', () => {
    const pipe = erosionEngine.pipeline;
    if (pipe.liveSimRunning) {
      pipe.pauseSimulation('');
    } else if (pipe.simPlaybackMode === 'solo') {
      // Selecting a simulation layer + pressing Simulate runs that season only.
      const selected = pipe.getSelectedLayer();
      const processes = pipe.simulationProcessesForLayer(selected);
      const state = pipe.getSimulationControlState();
      const firstAvailable = (processes.includes(state.soloProcess) && state.processes.some((proc) => proc.id === state.soloProcess && proc.available)) ? state.soloProcess : processes.find((id) => state.processes.some((proc) => proc.id === id && proc.available));
      if (firstAvailable) pipe.startSimulation(firstAvailable);
      else pipe.startSimulation(null);
    } else {
      pipe.startSimulation(null);
    }
    syncPlayBtn();
  });

  document.getElementById('btn-er-reset').addEventListener('click', () => {
    erosionEngine.pipeline.evaluateStack({ reseedPlacements: true, fastPreview: false });
    erosionLayerStackUI.renderAll();
  });

  // Camera Presets in Viewport Scene Nav
  document.getElementById('btn-er-frame').addEventListener('click', () => {
    erosionEngine.resetCamera();
  });

  document.getElementById('btn-cam-cliff').addEventListener('click', () => {
    erosionEngine.camera.yaw = 0.62;
    erosionEngine.camera.pitch = 0.19;
    erosionEngine.camera.distance = 310;
    erosionEngine.camera.target = [12, 48, -14];
  });

  document.getElementById('btn-cam-top').addEventListener('click', () => {
    erosionEngine.camera.yaw = 0.0;
    erosionEngine.camera.pitch = 1.38;
    erosionEngine.camera.distance = 680;
    erosionEngine.camera.target = [0, 40, 0];
  });

  // Export Constructed Terrain Mesh (.GLB / .OBJ)
  document.getElementById('btn-er-export-glb').addEventListener('click', () => {
    const mesh = erosionEngine.extractMeshForExport(2);
    const slug = erosionEngine.pipeline.activePresetId || 'terrain';
    const glb = exportFormationToGLB({
      mesh,
      lithology: 'canyonSand',
      params: { archetype: slug, seed: 4029 },
    });
    downloadBlob(
      new Blob([glb], { type: 'model/gltf-binary' }),
      `frontier_${slug}_${erosionEngine.pipeline.layers.length}layers.glb`
    );
  });

  document.getElementById('btn-er-export-obj').addEventListener('click', () => {
    const mesh = erosionEngine.extractMeshForExport(2);
    const slug = erosionEngine.pipeline.activePresetId || 'terrain';
    const objText = exportFormationToOBJ({
      mesh,
      params: { archetype: slug, seed: 4029 },
    });
    downloadBlob(
      new Blob([objText], { type: 'text/plain' }),
      `frontier_${slug}_${erosionEngine.pipeline.layers.length}layers.obj`
    );
  });
}

// ============================================================================
// 3D ROCK & CLIFF STUDIO CONTROLS
// ============================================================================

const sliderRefs = new Map();

function updateCurveReadout() {
  const readout = document.getElementById('curve-point-readout');
  const pill = document.getElementById('curve-mode-pill');
  const radSlider = document.getElementById('slider-curve-radius');
  const radOut = document.getElementById('out-curve-radius');
  if (!curveOverlay) return;

  const pt = curveOverlay.getSelectedPoint();
  if (pill) {
    pill.textContent = !state.curveMode ? 'Off' : curveOverlay.placeMode ? 'Placing' : 'Gizmo';
  }
  if (!readout) return;
  if (!pt) {
    const total = curveOverlay.getCurves().reduce((n, c) => n + c.length, 0);
    readout.textContent = `${total} control points`;
    return;
  }
  readout.textContent = `P${curveOverlay.selectedPointIdx + 1} · r ${(pt.r ?? 1).toFixed(2)}×`;
  if (radSlider) radSlider.value = String(pt.r ?? 1.0);
  if (radOut) radOut.textContent = `${(pt.r ?? 1.0).toFixed(2)}×`;
}

function setCurveMode(flag) {
  state.curveMode = Boolean(flag);
  if (!curveOverlay) return;
  curveOverlay.setEnabled(state.curveMode);
  curveOverlay.setPlaceMode(state.curveMode);
  updateCurveReadout();
}

function initCurveTool() {
  if (!curveOverlay) return;
  document.getElementById('btn-curve-draw').addEventListener('click', () => {
    if (state.studioMode !== 'rock') setStudioMode('rock');
    state.curveMode = !state.curveMode;
    if (state.curveMode) {
      curveOverlay.clearForClickDraw(0);
      state.params.customArchCurves = curveOverlay.getCurves();
      setCurveMode(true);
    } else {
      setCurveMode(false);
    }
  });

  document.getElementById('btn-curve-reset').addEventListener('click', () => {
    curveOverlay.setCurves(DEFAULT_CUSTOM_ARCH_CURVES);
    state.params.customArchCurves = curveOverlay.getCurves();
    state.customCurveActive = true;
    setCurveMode(true);
    requestSynthesis(true);
  });

  document.getElementById('btn-curve-branch').addEventListener('click', () => {
    curveOverlay.addBranchArch([0, 0, 3.4], 0.86);
    state.params.customArchCurves = curveOverlay.getCurves();
    state.customCurveActive = true;
    setCurveMode(true);
    requestSynthesis(true);
  });

  document.getElementById('btn-curve-delete').addEventListener('click', () => {
    curveOverlay.deleteSelectedPoint();
    state.params.customArchCurves = curveOverlay.getCurves();
    requestSynthesis(false);
  });

  const radSlider = document.getElementById('slider-curve-radius');
  radSlider.addEventListener('input', () => {
    curveOverlay.setSelectedPointRadius(Number(radSlider.value), false);
    document.getElementById('out-curve-radius').textContent = `${Number(radSlider.value).toFixed(2)}×`;
  });
  radSlider.addEventListener('change', () => {
    curveOverlay.setSelectedPointRadius(Number(radSlider.value), true);
  });

  document.getElementById('archetype-list').addEventListener('pointerdown', () => {
    if (state.customCurveActive) {
      state.customCurveActive = false;
      delete state.params.customArchCurves;
      setCurveMode(false);
    }
  }, true);
}

function buildCategoryFilterBar() {
  const bar = document.getElementById('cat-filter-bar');
  bar.innerHTML = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cat-chip ${state.categoryFilter === cat ? 'active' : ''}`;
    btn.textContent = cat === 'Fracture Demo' ? 'Cracks' : cat;
    btn.addEventListener('click', () => {
      state.categoryFilter = cat;
      bar.querySelectorAll('.cat-chip').forEach((el) => el.classList.toggle('active', el === btn));
      buildArchetypeCards();
    });
    bar.appendChild(btn);
  }
}

function buildArchetypeCards() {
  const container = document.getElementById('archetype-list');
  container.innerHTML = '';
  for (const preset of Object.values(FORMATION_PRESETS)) {
    if (state.categoryFilter !== 'All' && preset.category !== state.categoryFilter) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `archetype-card ${preset.id === state.params.archetype ? 'active' : ''}`;
    btn.dataset.id = preset.id;
    btn.innerHTML = `
      <div class="arch-name">${preset.name}</div>
      <div class="arch-sub">${preset.category}</div>
    `;
    btn.addEventListener('click', () => selectArchetype(preset.id));
    container.appendChild(btn);
  }
}

function selectArchetype(archId) {
  const preset = FORMATION_PRESETS[archId];
  if (!preset) return;
  state.params = resolveParams({
    archetype: archId,
    seed: state.params.seed,
    quality: state.params.quality,
    decimation: state.params.decimation,
    rainErosionAmount: state.params.rainErosionAmount ?? 0.5,
    chemAmount: state.params.chemAmount ?? 0.8,
    ironContent: state.params.ironContent ?? 0.7,
    copperContent: state.params.copperContent ?? 0.25,
    rainDroplets: state.params.rainDroplets ?? 8000,
    rainEdgeProtection: state.params.rainEdgeProtection ?? 0.7,
    ...(state.params.customArchCurves ? { customArchCurves: state.params.customArchCurves } : {}),
  });
  document.getElementById('active-category').textContent = preset.category;
  document.querySelectorAll('#archetype-list .archetype-card').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === archId);
  });
  syncSlidersFromState();
  requestSynthesis(true);
}

function buildSliders(groupKey, mountId) {
  const mount = document.getElementById(mountId);
  mount.innerHTML = '';
  for (const spec of SLIDER_SCHEMA[groupKey]) {
    const wrap = document.createElement('div');
    wrap.className = 'slider-group';
    const val = state.params[spec.key];
    wrap.innerHTML = `
      <div class="slider-label">
        <span>${spec.label}</span>
        <output>${spec.fmt(val)}</output>
      </div>
      <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${val}" />
    `;
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');
    input.addEventListener('input', () => {
      const num = Number(input.value);
      state.params[spec.key] = num;
      out.textContent = spec.fmt(num);
      requestSynthesis(false);
    });
    sliderRefs.set(spec.key, { input, out, spec });
    mount.appendChild(wrap);
  }
}

function syncSlidersFromState() {
  for (const [key, ref] of sliderRefs.entries()) {
    const val = state.params[key];
    ref.input.value = val;
    ref.out.textContent = ref.spec.fmt(val);
  }
}

function buildSeedStrip() {
  const strip = document.getElementById('seed-strip');
  strip.innerHTML = '';
  for (const s of QUICK_SEEDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `seed-chip ${Number(state.params.seed) === s ? 'active' : ''}`;
    b.textContent = `#${s}`;
    b.addEventListener('click', () => setSeed(s));
    strip.appendChild(b);
  }
}

function setSeed(newSeed) {
  state.params.seed = Number(newSeed) || 1;
  document.getElementById('input-seed').value = state.params.seed;
  document.querySelectorAll('.seed-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.textContent === `#${state.params.seed}`);
  });
  requestSynthesis(false);
}

function initShadingControls() {
  const lithSelect = document.getElementById('select-lithology');
  for (const [key, pal] of Object.entries(LITHOLOGY_PALETTES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = pal.name;
    lithSelect.appendChild(opt);
  }
  lithSelect.value = 'navajoRed';

  const shadingSelect = document.getElementById('select-shading');
  const rowLith = document.getElementById('row-lithology');
  rowLith.style.display = shadingSelect.value === 'lithology' ? 'flex' : 'none';

  shadingSelect.addEventListener('change', () => {
    const mode = shadingSelect.value;
    rowLith.style.display = mode === 'lithology' ? 'flex' : 'none';
    ensureRockViewport()?.setShadingMode(mode);
  });

  lithSelect.addEventListener('change', () => ensureRockViewport()?.setLithologyOverride(lithSelect.value));
  document.getElementById('select-rock-fabric').addEventListener('change', (e) => {
    ensureRockViewport()?.setFabricMode(Number(e.target.value) || 0);
  });

  const sunAz = document.getElementById('slider-sun-az');
  const sunEl = document.getElementById('slider-sun-el');
  const updateSun = () => {
    const az = Number(sunAz.value);
    const el = Number(sunEl.value);
    document.getElementById('out-sun-az').textContent = `${az}°`;
    document.getElementById('out-sun-el').textContent = `${el}°`;
    ensureRockViewport()?.setSunAngles(az, el);
  };
  sunAz.addEventListener('input', updateSun);
  sunEl.addEventListener('input', updateSun);

  document.getElementById('chk-human').addEventListener('change', (e) => ensureRockViewport()?.setScaleHumanVisible(e.target.checked));
  document.getElementById('chk-wireframe').addEventListener('change', (e) => ensureRockViewport()?.setWireframe(e.target.checked));
  document.getElementById('chk-turntable').addEventListener('change', (e) => ensureRockViewport()?.setTurntable(e.target.checked));
}

function initRockActionButtons() {
  document.getElementById('btn-random-seed').addEventListener('click', () => setSeed(Math.floor(1000 + Math.random() * 9000)));
  document.getElementById('btn-apply-seed').addEventListener('click', () => setSeed(Number(document.getElementById('input-seed').value)));

  document.querySelectorAll('#quality-buttons button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#quality-buttons button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.params.quality = btn.dataset.q;
      requestSynthesis(false);
    });
  });

  document.getElementById('select-decimation').addEventListener('change', (e) => {
    state.params.decimation = Number(e.target.value);
    requestSynthesis(false);
  });

  document.getElementById('btn-reset-params').addEventListener('click', () => selectArchetype(state.params.archetype));

  document.querySelectorAll('#rock-camera-bar .cam-btn').forEach((btn) => {
    btn.addEventListener('click', () => ensureRockViewport()?.frameCamera(btn.dataset.cam));
  });

  document.getElementById('btn-export-glb').addEventListener('click', () => {
    if (!state.latestResult) return;
    const glb = exportFormationToGLB(state.latestResult);
    downloadBlob(new Blob([glb], { type: 'model/gltf-binary' }), `frontier_${state.params.archetype}_${state.params.seed}.glb`);
  });

  document.getElementById('btn-export-obj').addEventListener('click', () => {
    if (!state.latestResult) return;
    const objText = exportFormationToOBJ(state.latestResult);
    downloadBlob(new Blob([objText], { type: 'text/plain' }), `frontier_${state.params.archetype}_${state.params.seed}.obj`);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (state.studioMode === 'erosion' && erosionEngine) {
      if (e.key === 'f' || e.key === 'F') {
        erosionEngine.resetCamera();
      } else if (e.code === 'Space') {
        e.preventDefault();
        document.getElementById('btn-er-play').click();
      }
      return;
    }
    if (e.key === 'f' || e.key === 'F') ensureRockViewport()?.frameCamera('hero');
  });
}

// Boot Frontier Terrain Studio + Rock Studio Controls
initTerrainStudio();
buildCategoryFilterBar();
buildArchetypeCards();
buildSliders('tectonics', 'sliders-tectonics');
buildSliders('macro', 'sliders-macro');
buildSliders('detail', 'sliders-detail');
buildSliders('erosion', 'sliders-erosion');
buildSeedStrip();
initShadingControls();
initRockActionButtons();
setStudioMode(state.studioMode);
