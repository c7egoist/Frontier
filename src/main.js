import { buildRealtimeScene, cameraFromOrbit } from './scene.js';
import { RestirRenderer } from './renderer.js';
import { RasterFallback } from './fallback.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const bringup = $('#bringup');
const progressBar = $('#bringup-progress');
const progressPercent = $('#bringup-percent');
const bringupCaption = $('#bringup-caption');
const appShell = $('.app-shell');
const settingsPanel = $('#settings-panel');
const toast = $('#toast');
let canvas = $('#viewport');
let scene = null;
let renderer = null;
let rasterFallback = null;
let backendMode = 'gpu';
let activePreset = 'balanced';
let lastFrameInfo = null;
let lastUiUpdate = 0;
let lastTime = performance.now();
let fpsSmoothed = 60;
let toastTimeout = 0;
let pointerDown = false;
let pointerX = 0;
let pointerY = 0;
let pressed = new Set();
const touchDrive = new Set();
let dragMoved = false;
let lastPointerX = 0;
let lastPointerY = 0;

const defaultOrbit = Object.freeze({ yaw: -0.79, pitch: 0.22, distance: 13.2, target: [0, 0, 0.9], fovY: 43 * Math.PI / 180 });
const orbit = { ...defaultOrbit, target: [...defaultOrbit.target] };

const settings = {
  mode: 0,
  renderScale: 0.50,
  initialCandidates: 1,
  maxBounces: 3,
  maxHistoryM: 24,
  spatialTaps: 4,
  temporal: true,
  spatial: true,
  denoise: true,
  checkerboard: false,
  giStrength: 1.0,
  fireflyClamp: 12.0,
  exposure: 0.0
};

const presets = {
  gtx: {
    renderScale: 0.35, initialCandidates: 1, maxBounces: 2, maxHistoryM: 12, spatialTaps: 2,
    temporal: true, spatial: true, denoise: true, checkerboard: true, giStrength: 0.9, fireflyClamp: 8.0
  },
  balanced: {
    renderScale: 0.50, initialCandidates: 1, maxBounces: 3, maxHistoryM: 24, spatialTaps: 4,
    temporal: true, spatial: true, denoise: true, checkerboard: false, giStrength: 1.0, fireflyClamp: 12.0
  },
  rtx: {
    renderScale: 0.65, initialCandidates: 2, maxBounces: 4, maxHistoryM: 32, spatialTaps: 6,
    temporal: true, spatial: true, denoise: true, checkerboard: false, giStrength: 1.0, fireflyClamp: 18.0
  },
  ultra: {
    renderScale: 0.80, initialCandidates: 3, maxBounces: 6, maxHistoryM: 48, spatialTaps: 8,
    temporal: true, spatial: true, denoise: true, checkerboard: false, giStrength: 1.0, fireflyClamp: 24.0
  }
};

function setBringupProgress(fraction, caption) {
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${String(percent).padStart(2, '0')}%`;
  if (caption) bringupCaption.textContent = caption;
}

function showToast(message, duration = 2500) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('is-visible'), duration);
}

function setBackendUI(info, error = null) {
  const title = $('#backend-title');
  const detail = $('#backend-detail');
  const note = $('#backend-note');
  const state = $('#backend-state');
  const telemetry = $('#telemetry-backend');
  if (backendMode === 'gpu') {
    title.textContent = 'WEBGPU · SOFTWARE BVH';
    detail.textContent = `${info?.name || 'GPU adapter'} · compute triangle tracing`;
    state.textContent = info?.tier === 'gtx' ? 'GTX FALLBACK' : (info?.tier === 'rtx' ? 'RTX COMPUTE' : 'AUTO');
    telemetry.textContent = 'COMPUTE BVH';
    if (info?.tier === 'rtx') {
      note.textContent = 'RTX adapter detected. This web build uses the portable triangle-BVH compute backend (RT-core APIs are not exposed to WebGPU); choose RTX Compute High for a larger real-time budget.';
    } else if (info?.tier === 'gtx') {
      note.textContent = 'GTX-compatible path active: GPU compute traverses indexed triangles in a compact per-mesh BVH, with reduced resolution, checkerboard candidates and capped history.';
    } else {
      note.textContent = 'Portable WebGPU compute path active. The same triangle-BVH fallback works across GTX and RTX-class adapters; this browser does not expose native DXR / Vulkan ray-query.';
    }
    $('#render-badge').textContent = 'RESTIR GI · COMPUTE';
  } else {
    title.textContent = 'WEBGL 2 · RASTER PREVIEW';
    detail.textContent = 'WebGPU unavailable · GI passes paused';
    state.textContent = 'FALLBACK';
    telemetry.textContent = 'RASTER ONLY';
    note.textContent = error
      ? `ReSTIR is not running in this browser (${error}). The preview still draws the original triangle scene; use WebGPU over HTTPS to enable reservoir GI.`
      : 'ReSTIR is not running in this browser. This WebGL fallback keeps the actual triangle vehicle visible; use WebGPU over HTTPS to enable reservoir GI.';
    $('#render-badge').textContent = 'RASTER PREVIEW';
  }
}

function rangeProgress(input) {
  const min = Number(input.min), max = Number(input.max), value = Number(input.value);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', `${percent}%`);
}

function syncControlsFromSettings() {
  $('#candidate-count').value = settings.initialCandidates;
  $('#bounce-count').value = settings.maxBounces;
  $('#history-count').value = settings.maxHistoryM;
  $('#spatial-count').value = settings.spatialTaps;
  $('#render-scale').value = Math.round(settings.renderScale * 100);
  $('#gi-strength').value = settings.giStrength;
  $('#firefly-clamp').value = settings.fireflyClamp;
  $('#exposure').value = settings.exposure;
  $('#temporal-toggle').checked = settings.temporal;
  $('#spatial-toggle').checked = settings.spatial;
  $('#denoise-toggle').checked = settings.denoise;
  $('#checkerboard-toggle').checked = settings.checkerboard;
  updateValueLabels();
}

function updateValueLabels() {
  const controls = [
    ['candidate-count', 'candidate-count-value', (value) => `${value} ${Number(value) === 1 ? 'ray' : 'rays'}`],
    ['bounce-count', 'bounce-count-value', (value) => `${value}`],
    ['history-count', 'history-count-value', (value) => `${value} M`],
    ['spatial-count', 'spatial-count-value', (value) => `${value} ${Number(value) === 1 ? 'tap' : 'taps'}`],
    ['render-scale', 'render-scale-value', (value) => `${value}%`],
    ['gi-strength', 'gi-strength-value', (value) => `${Number(value).toFixed(2)}×`],
    ['firefly-clamp', 'firefly-value', (value) => Number(value).toFixed(1)],
    ['exposure', 'exposure-value', (value) => `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)} EV`]
  ];
  for (const [inputId, outputId, format] of controls) {
    const input = document.getElementById(inputId);
    document.getElementById(outputId).textContent = format(input.value);
    rangeProgress(input);
  }
}

function markCustomPreset() {
  if (activePreset === 'custom') return;
  activePreset = 'custom';
  $$('.preset-card').forEach((button) => button.classList.remove('is-selected'));
  $('.auto-pill').textContent = 'CUSTOM';
}

function applyPreset(name, { quiet = false } = {}) {
  const values = presets[name];
  if (!values) return;
  activePreset = name;
  Object.assign(settings, values);
  $$('.preset-card').forEach((button) => button.classList.toggle('is-selected', button.dataset.preset === name));
  $('.auto-pill').textContent = 'AUTO READY';
  syncControlsFromSettings();
  renderer?.resetHistory();
  if (!quiet) showToast(`${name === 'gtx' ? 'GTX performance' : name === 'rtx' ? 'RTX compute high' : name === 'ultra' ? 'Ultra look-dev' : 'Balanced'} profile applied`);
}

function setRenderMode(mode) {
  settings.mode = Number(mode);
  $$('.mode-button').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.mode) === settings.mode));
  renderer?.resetHistory();
  const names = ['RESTIR GI', 'DIRECT ONLY', 'NORMALS', 'ALBEDO', 'RESERVOIR'];
  if (backendMode === 'gpu') $('#render-badge').textContent = names[settings.mode] || 'RESTIR GI';
}

function configureDrivePad() {
  $$('.drive-button').forEach((button) => {
    const action = button.dataset.drive;
    const release = () => {
      touchDrive.delete(action);
      button.classList.remove('is-held');
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      touchDrive.add(action);
      button.classList.add('is-held');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });
}

function configureControls() {
  configureDrivePad();
  const numericControls = [
    ['candidate-count', (value) => { settings.initialCandidates = Number(value); }],
    ['bounce-count', (value) => { settings.maxBounces = Number(value); renderer?.resetHistory(); }],
    ['history-count', (value) => { settings.maxHistoryM = Number(value); }],
    ['spatial-count', (value) => { settings.spatialTaps = Number(value); }],
    ['render-scale', (value) => { settings.renderScale = Number(value) / 100; }],
    ['gi-strength', (value) => { settings.giStrength = Number(value); }],
    ['firefly-clamp', (value) => { settings.fireflyClamp = Number(value); }],
    ['exposure', (value) => { settings.exposure = Number(value); }]
  ];
  for (const [id, apply] of numericControls) {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
      apply(input.value);
      markCustomPreset();
      updateValueLabels();
    });
  }
  const toggles = [
    ['temporal-toggle', 'temporal'], ['spatial-toggle', 'spatial'], ['denoise-toggle', 'denoise'], ['checkerboard-toggle', 'checkerboard']
  ];
  for (const [id, settingName] of toggles) {
    document.getElementById(id).addEventListener('change', (event) => {
      settings[settingName] = event.target.checked;
      markCustomPreset();
      if (settingName === 'temporal') renderer?.resetHistory();
    });
  }
  $$('.preset-card').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  $$('.mode-button').forEach((button) => button.addEventListener('click', () => setRenderMode(button.dataset.mode)));
  $('#reset-history').addEventListener('click', () => {
    renderer?.resetHistory();
    showToast('Temporal reservoirs cleared · rebuilding stable history');
  });
  $('#reset-camera').addEventListener('click', () => resetView());
  $('#fold-button').addEventListener('click', () => appShell.classList.toggle('is-folded'));
  $('#help-button').addEventListener('click', openHelp);
  $('#help-close').addEventListener('click', closeHelp);
  $$('.help-backdrop, [data-close-help]').forEach((element) => element.addEventListener('click', closeHelp));
  syncControlsFromSettings();
}

function openHelp() {
  const modal = $('#help-modal');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}
function closeHelp() {
  const modal = $('#help-modal');
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function resetView() {
  orbit.yaw = defaultOrbit.yaw;
  orbit.pitch = defaultOrbit.pitch;
  orbit.distance = defaultOrbit.distance;
  orbit.target = [...defaultOrbit.target];
  scene?.resetVehicle();
  renderer?.resetHistory();
  showToast('Camera and ControlVehicle reset');
}

function attachPointerControls(targetCanvas) {
  if (targetCanvas.dataset.pointerControlsAttached === 'true') return;
  targetCanvas.dataset.pointerControlsAttached = 'true';
  targetCanvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointerDown = true;
    dragMoved = false;
    pointerX = lastPointerX = event.clientX;
    pointerY = lastPointerY = event.clientY;
    targetCanvas.setPointerCapture?.(event.pointerId);
  });
  targetCanvas.addEventListener('pointermove', (event) => {
    if (!pointerDown) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    if (Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY) > 3) dragMoved = true;
    orbit.yaw -= dx * 0.006;
    orbit.pitch = Math.max(-0.1, Math.min(1.05, orbit.pitch + dy * 0.004));
  });
  const release = (event) => {
    pointerDown = false;
    if (!dragMoved && event.type === 'pointerup' && event.clientX > targetCanvas.getBoundingClientRect().left) {
      targetCanvas.focus?.();
    }
  };
  targetCanvas.addEventListener('pointerup', release);
  targetCanvas.addEventListener('pointercancel', release);
  targetCanvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    orbit.distance = Math.max(5.8, Math.min(32.0, orbit.distance * Math.exp(event.deltaY * 0.001)));
  }, { passive: false });
}

function attachKeyboardControls() {
  const editable = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  window.addEventListener('keydown', (event) => {
    if (editable(event.target) || $('#help-modal').classList.contains('is-open')) {
      if (event.key === 'Escape') closeHelp();
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      pressed.add(event.code);
      event.preventDefault();
    } else if (event.code === 'KeyR') {
      resetView();
    } else if (event.code === 'KeyF') {
      appShell.classList.toggle('is-folded');
    } else if (event.code === 'Escape') {
      closeHelp();
    }
  });
  window.addEventListener('keyup', (event) => pressed.delete(event.code));
  window.addEventListener('blur', () => {
    pressed.clear();
    touchDrive.clear();
    $$('.drive-button').forEach((button) => button.classList.remove('is-held'));
  });
}

function readDriveInput() {
  return {
    forward: pressed.has('KeyW') || pressed.has('ArrowUp') || touchDrive.has('forward'),
    reverse: pressed.has('KeyS') || pressed.has('ArrowDown') || touchDrive.has('reverse'),
    left: pressed.has('KeyA') || pressed.has('ArrowLeft') || touchDrive.has('left'),
    right: pressed.has('KeyD') || pressed.has('ArrowRight') || touchDrive.has('right'),
    brake: pressed.has('KeyS') || pressed.has('ArrowDown') || touchDrive.has('reverse'),
    handbrake: pressed.has('Space') || touchDrive.has('handbrake')
  };
}

function replaceCanvasForRasterFallback() {
  const replacement = document.createElement('canvas');
  replacement.id = 'viewport';
  replacement.tabIndex = 0;
  replacement.setAttribute('aria-label', 'ControlVehicle raster fallback viewport');
  canvas.replaceWith(replacement);
  canvas = replacement;
  return canvas;
}

function updateTelemetry(now, deltaSeconds) {
  const instantaneous = 1 / Math.max(deltaSeconds, 1e-4);
  fpsSmoothed = fpsSmoothed * 0.88 + instantaneous * 0.12;
  if (now - lastUiUpdate < 400) return;
  lastUiUpdate = now;
  $('#fps-value').textContent = Math.round(fpsSmoothed).toString().padStart(2, '0');
  $('#frame-value').textContent = `${(1000 / Math.max(fpsSmoothed, 0.1)).toFixed(1)} ms`;
  $('#bounce-readout').textContent = backendMode === 'gpu' ? `${settings.maxBounces} BOUNCES` : 'PAUSED';
  if (scene) {
    $('#triangle-count').textContent = scene.totalTriangles.toLocaleString('en-US');
    const speed = scene.currentSpeedKmh;
    $('#speed-readout').innerHTML = `${speed} <small>KM/H</small>`;
    $('#gear-readout').textContent = speed > 0 ? 'D' : (scene.vehicle.speed < -0.05 ? 'R' : 'N');
    $('#drive-status').textContent = scene.driving ? 'DRIVING' : 'PARKED';
    $('#drive-dot').classList.toggle('is-moving', scene.driving);
  }
  if (lastFrameInfo) {
    $('#resolution-value').textContent = `${lastFrameInfo.width} × ${lastFrameInfo.height}`;
    $('#camera-readout').textContent = `ORBIT CAMERA · ${orbit.distance.toFixed(1)} M`;
  }
}

function renderLoop(now) {
  if (!scene) return;
  const deltaSeconds = Math.min(0.05, Math.max(1e-4, (now - lastTime) / 1000));
  lastTime = now;
  scene.advanceVehicle(readDriveInput(), deltaSeconds);
  const target = [scene.vehicle.x, scene.vehicle.y, 0.88];
  const camera = cameraFromOrbit(orbit, target);
  camera.aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  try {
    lastFrameInfo = backendMode === 'gpu'
      ? renderer.render(camera, settings, deltaSeconds)
      : rasterFallback.render(camera, settings);
  } catch (error) {
    console.error('Frame render failed:', error);
    if (backendMode === 'gpu') {
      fallBackToRaster(error);
    }
  }
  updateTelemetry(now, deltaSeconds);
  requestAnimationFrame(renderLoop);
}

function fallBackToRaster(error) {
  if (backendMode !== 'gpu') return;
  backendMode = 'raster';
  const message = error?.message || String(error || 'unknown WebGPU error');
  console.error('WebGPU renderer unavailable; using the triangle raster preview:', message);
  renderer?.destroy();
  renderer = null;
  try {
    const fallbackCanvas = replaceCanvasForRasterFallback();
    rasterFallback = new RasterFallback(fallbackCanvas, scene);
    attachPointerControls(fallbackCanvas);
    setBackendUI(null, message.split('\n')[0].slice(0, 130));
    showToast('WebGPU ReSTIR is unavailable · showing triangle raster preview', 5000);
  } catch (fallbackError) {
    setBringupProgress(1, fallbackError.message || 'No compatible graphics API is available.');
    bringup.classList.remove('is-hidden');
    console.error(fallbackError);
  }
}

async function start() {
  configureControls();
  attachKeyboardControls();
  try {
    setBringupProgress(0.03, 'Retrieving the original Project-Drive vehicle facets…');
    scene = await buildRealtimeScene((fraction, caption) => {
      setBringupProgress(0.05 + fraction * 0.34, caption);
    });
    $('#triangle-count').textContent = scene.totalTriangles.toLocaleString('en-US');
    setBringupProgress(0.44, 'Requesting WebGPU and compiling ReSTIR compute passes…');
    renderer = new RestirRenderer(canvas, (caption, progress) => {
      if (progress < 0) {
        setBringupProgress(1, caption);
        showToast(caption, 6000);
        if (backendMode === 'gpu' && scene) fallBackToRaster(new Error(caption));
      } else {
        setBringupProgress(Math.max(0.44, progress), caption);
      }
    });
    try {
      const adapterInfo = await renderer.initialize(scene);
      backendMode = 'gpu';
      const selectedPreset = adapterInfo.tier === 'gtx' ? 'gtx' : (adapterInfo.tier === 'rtx' ? 'rtx' : 'balanced');
      applyPreset(selectedPreset, { quiet: true });
      setBackendUI(adapterInfo);
      setBringupProgress(1, 'ReSTIR GI ready · triangle BVH active');
    } catch (error) {
      fallBackToRaster(error);
      setBringupProgress(1, 'Raster preview ready · WebGPU ReSTIR unavailable');
    }
    window.setTimeout(() => bringup.classList.add('is-hidden'), 220);
    attachPointerControls(canvas);
    lastTime = performance.now();
    requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    setBringupProgress(1, error.message || 'Could not assemble the scene.');
    showToast(error.message || 'Scene initialization failed', 7000);
  }
}

start();
