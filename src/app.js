import {
  CLOTH_COLS,
  CLOTH_ROWS,
  DRESS_PRESETS,
  hexToRgb,
  makeBodyGeometry,
  makeDressDetails,
  makeDressGeometry,
} from './geometry.js';
import { CpuClothSimulation, GpuClothSimulation, requestWebGPUDevice } from './simulation.js';
import { createWebGLRenderer } from './renderer.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const pauseIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.4 4.5h2.8v11H6.4zm4.5 0h2.8v11h-2.8z" fill="currentColor"/></svg>';
const playIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4.8 8.2 5.2L7 15.2V4.8Z" fill="currentColor"/></svg>';

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2300);
}

function setRangeFill(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const progress = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', `${progress}%`);
}

function formatClock(time) {
  const totalFrames = Math.floor(time * 24);
  const seconds = Math.floor(totalFrames / 24);
  const frames = totalFrames % 24;
  return `00:${String(seconds).padStart(2, '0')}${frames ? `:${String(frames).padStart(2, '0')}` : ''}`;
}

function downloadProject(state) {
  const payload = {
    application: 'stitch / garment lab',
    version: 1,
    project: 'Violet hour',
    exportedAt: new Date().toISOString(),
    renderer: state.rendererType === 'webgpu' ? 'WebGPU cloth compute + WebGL viewport' : 'WebGL viewport + CPU cloth fallback',
    garment: {
      silhouette: state.preset.id,
      name: state.preset.title,
      fabric: state.preset.fabric,
      color: state.color,
      roughness: state.preset.roughness,
      particles: `${CLOTH_COLS} × ${CLOTH_ROWS}`,
    },
    simulation: {
      running: state.running,
      windMetersPerSecond: state.wind,
      weightKgPerSquareMeter: state.weight,
      biasStretch: state.stretch,
      timeSeconds: Number(state.time.toFixed(2)),
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'violet-hour-look.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateSimulationLabels(state) {
  const stateLabel = state.running ? 'LIVE DRAPE' : 'SIM PAUSED';
  $('#hud-state').textContent = stateLabel;
  $('#hud-wind').textContent = `WIND ${state.wind.toFixed(2)} M/S`;
  $('#hud-particles').textContent = `${(CLOTH_COLS * CLOTH_ROWS).toLocaleString()} PTS`;
  $('.sim-hud').classList.toggle('paused', !state.running);
  const playButton = $('#play-pause');
  playButton.innerHTML = state.running ? pauseIcon : playIcon;
  playButton.classList.toggle('is-playing', state.running);
  playButton.setAttribute('aria-label', state.running ? 'Pause simulation' : 'Play simulation');
  playButton.title = state.running ? 'Pause simulation' : 'Play simulation';
  $('#timeline-time').innerHTML = `${formatClock(state.time)} <small> / 00:08</small>`;
  $('#timeline-range').value = String(state.time);
  $('#timeline-progress').style.width = `${Math.max(0, Math.min(100, (state.time / 8) * 100))}%`;
  $('#frame-counter').textContent = `FRAME ${String(Math.floor(state.time * 24)).padStart(3, '0')}`;
}

function updatePresetLabels(state) {
  $('#graph-garment-name').textContent = state.preset.graphName;
  $('#viewport-look-title').textContent = `VIOLET HOUR / ${state.preset.title.toUpperCase()}`;
  $('#fabric-name').textContent = state.preset.fabric;
  $('#fabric-weight-label').textContent = state.preset.fabricMeta;
  $('#fabric-preview').style.background = `radial-gradient(ellipse at 28% 20%, rgba(255,255,255,.6), transparent 37%), linear-gradient(135deg, ${state.color}, #35212b)`;
  $('.node-swatch').style.background = `radial-gradient(ellipse at 28% 22%, rgba(255,255,255,.58), transparent 35%), linear-gradient(135deg, ${state.color}, #571c32)`;
  const swatch = $$('.color-swatch').find((button) => button.dataset.color.toLowerCase() === state.color.toLowerCase());
  $$('.color-swatch').forEach((button) => button.classList.toggle('selected', button === swatch));
  $('#weight-range').value = String(state.weight);
  $('#weight-value').innerHTML = `${state.weight.toFixed(2)} <small>kg/m²</small>`;
  $('#stretch-range').value = String(Math.round(state.stretch * 100));
  $('#stretch-value').innerHTML = `${Math.round(state.stretch * 100)} <small>%</small>`;
  setRangeFill($('#weight-range'));
  setRangeFill($('#stretch-range'));
}

export async function boot(initialCanvas) {
  let activeCanvas = initialCanvas;
  const bodyGeometry = makeBodyGeometry();
  let savedProject = {};
  try { savedProject = JSON.parse(localStorage.getItem('stitch-violet-hour') || '{}'); } catch { /* ignore an invalid saved project */ }
  const initialPreset = DRESS_PRESETS[savedProject.preset] || DRESS_PRESETS.slip;
  const savedColor = typeof savedProject.color === 'string' && /^#[0-9a-f]{6}$/i.test(savedProject.color)
    ? savedProject.color.toLowerCase()
    : initialPreset.color;
  const state = {
    renderer: null,
    simulation: null,
    rendererType: 'pending',
    preset: { ...initialPreset, color: savedColor },
    color: savedColor,
    weight: Math.max(0.25, Math.min(1.35, Number(savedProject.weight ?? $('#weight-range').value) || 0.72)),
    stretch: Math.max(0.2, Math.min(1, Number(savedProject.stretch ?? Number($('#stretch-range').value) / 100) || 0.68)),
    wind: Math.max(0, Math.min(2, Number(savedProject.wind ?? $('#wind-range').value) || 0)), 
    running: true,
    time: 0,
    speed: 1,
    autoRotate: false,
    wireframe: false,
    showModel: true,
    rotation: { yaw: 0.24, pitch: 0.025, distance: 6.7, target: [0, 1.55, 0] },
    pointer: null,
  };
  let clothGeometry = makeDressGeometry(state.preset, CLOTH_COLS, CLOTH_ROWS);
  let dressDetails = makeDressDetails(state.preset, state.color);

  $('#weight-range').value = String(state.weight);
  $('#weight-value').innerHTML = `${state.weight.toFixed(2)} <small>kg/m²</small>`;
  $('#stretch-value').innerHTML = `${Math.round(state.stretch * 100)} <small>%</small>`;
  $('#wind-value').innerHTML = `${state.wind.toFixed(2)} <small>m/s</small>`;
  $$('#weight-range, #stretch-range, #wind-range').forEach(setRangeFill);

  const status = $('#engine-status');
  const statusLabel = status.querySelector('.engine-label');
  statusLabel.textContent = 'CONNECTING WEBGPU';
  let renderer = null;
  const gpuDevice = await requestWebGPUDevice();
  if (gpuDevice) {
    try {
      state.simulation = new GpuClothSimulation(gpuDevice, clothGeometry);
      renderer = createWebGLRenderer(activeCanvas, bodyGeometry, clothGeometry, dressDetails);
      state.rendererType = 'webgpu';
    } catch (error) {
      console.error('WebGPU cloth setup failed; using the CPU cloth fallback.', error);
      gpuDevice.destroy();
      state.simulation = null;
      renderer = null;
    }
  }
  if (!renderer) {
    renderer = createWebGLRenderer(activeCanvas, bodyGeometry, clothGeometry, dressDetails);
    state.simulation = new CpuClothSimulation(clothGeometry);
    state.rendererType = 'webgl';
    status.classList.add('fallback');
    statusLabel.textContent = 'WEBGL · CPU FALLBACK';
  } else {
    status.classList.remove('fallback');
    statusLabel.textContent = 'WEBGPU CLOTH · WEBGL VIEW';
  }
  $('#solver-node-detail').textContent = `${CLOTH_COLS} × ${CLOTH_ROWS} PARTICLES`;
  state.renderer = renderer;
  activeCanvas.dataset.renderer = state.rendererType;
  status.title = state.rendererType === 'webgpu'
    ? 'WebGPU compute cloth solver, read back for the WebGL viewport'
    : 'WebGL viewport with the real-time CPU cloth fallback';

  // The cloth is reconstructed from the silhouette profile and then settles under gravity.
  // It remains the same 64 × 64 particle mesh across all three looks for quick switching.
  const applyPreset = (id, preserveColor = false) => {
    const source = DRESS_PRESETS[id] || DRESS_PRESETS.slip;
    state.preset = { ...source, color: preserveColor ? state.color : source.color };
    if (!preserveColor) state.color = source.color;
    clothGeometry = makeDressGeometry(state.preset, CLOTH_COLS, CLOTH_ROWS);
    dressDetails = makeDressDetails(state.preset, state.color);
    state.simulation.reset(clothGeometry);
    renderer.clothGeometry = clothGeometry;
    renderer.setDressDetails(dressDetails);
    updatePresetLabels(state);
    $('#weight-range').value = String(state.weight);
    $$('.look-card').forEach((button) => {
      const active = button.dataset.look === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    state.time = 0;
    updateSimulationLabels(state);
  };

  const applyColor = (hex) => {
    state.color = hex.toLowerCase();
    state.preset = { ...state.preset, color: state.color };
    dressDetails = makeDressDetails(state.preset, state.color);
    renderer.setDressDetails(dressDetails);
    updatePresetLabels(state);
  };

  const resetSimulation = (message = false) => {
    state.simulation.reset(clothGeometry);
    state.time = 0;
    if (!state.running) state.running = true;
    updateSimulationLabels(state);
    if (message) showToast('Drape reset — the garment is settling again.');
  };

  $$('.look-card').forEach((button) => {
    const active = button.dataset.look === state.preset.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updatePresetLabels(state);
  updateSimulationLabels(state);

  // Editor navigation and construction graph.
  $$('.editor-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.editor-tab').forEach((item) => item.classList.toggle('active', item === tab));
      const target = document.getElementById(tab.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  $$('.graph-node').forEach((node) => {
    node.addEventListener('click', () => {
      $$('.graph-node').forEach((item) => item.classList.toggle('selected', item === node));
      const map = { fabric: 'material-section', pattern: 'look-section', garment: 'look-section', solver: 'material-section' };
      document.getElementById(map[node.dataset.node])?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (node.dataset.node === 'solver') showToast(state.rendererType === 'webgpu' ? 'WebGPU is solving 4,096 particles every frame.' : 'CPU solver is active in this browser preview.');
    });
  });
  $('#add-node').addEventListener('click', () => showToast('All four construction nodes are connected and live.'));
  $('#browse-silhouettes').addEventListener('click', () => {
    $('#look-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $$('.look-card').forEach((card) => card.addEventListener('click', () => {
    applyPreset(card.dataset.look);
    showToast(`${state.preset.title} loaded on the mannequin.`);
  }));

  const fabricOptions = [
    { name: 'Mulberry silk', meta: '19 momme · satin weave', roughness: 0.16 },
    { name: 'Cloud organza', meta: '12 momme · crisp sheer', roughness: 0.36 },
    { name: 'Soft velvet', meta: '32 momme · fluid pile', roughness: 0.31 },
  ];
  let fabricIndex = 0;
  const syncFabricIndex = () => {
    const found = fabricOptions.findIndex((option) => option.name.toLowerCase() === state.preset.fabric.toLowerCase());
    fabricIndex = found >= 0 ? found : 0;
  };
  syncFabricIndex();
  $('#fabric-choice').addEventListener('click', () => {
    fabricIndex = (fabricIndex + 1) % fabricOptions.length;
    const option = fabricOptions[fabricIndex];
    state.preset = { ...state.preset, fabric: option.name, fabricMeta: option.meta, roughness: option.roughness };
    dressDetails = makeDressDetails(state.preset, state.color);
    renderer.setDressDetails(dressDetails);
    updatePresetLabels(state);
    showToast(`${option.name} · ${option.meta}`);
  });

  $$('.color-swatch').forEach((button) => button.addEventListener('click', () => applyColor(button.dataset.color)));
  $('#custom-color').addEventListener('click', () => $('#custom-color-input').click());
  $('#custom-color-input').addEventListener('input', (event) => applyColor(event.target.value));

  $('#weight-range').addEventListener('input', (event) => {
    state.weight = Number(event.target.value);
    $('#weight-value').innerHTML = `${state.weight.toFixed(2)} <small>kg/m²</small>`;
    setRangeFill(event.target);
  });
  $('#stretch-range').addEventListener('input', (event) => {
    state.stretch = Number(event.target.value) / 100;
    $('#stretch-value').innerHTML = `${Math.round(state.stretch * 100)} <small>%</small>`;
    setRangeFill(event.target);
  });
  $('#wind-range').addEventListener('input', (event) => {
    state.wind = Number(event.target.value);
    $('#wind-value').innerHTML = `${state.wind.toFixed(2)} <small>m/s</small>`;
    $('#hud-wind').textContent = `WIND ${state.wind.toFixed(2)} M/S`;
    setRangeFill(event.target);
  });

  $('#play-pause').addEventListener('click', () => {
    state.running = !state.running;
    updateSimulationLabels(state);
  });
  $('#reset-sim').addEventListener('click', () => resetSimulation(true));
  $('#timeline-range').addEventListener('input', (event) => {
    state.time = Number(event.target.value);
    state.simulation.reset(clothGeometry);
    updateSimulationLabels(state);
  });
  $('#speed-select').addEventListener('change', (event) => {
    state.speed = Number(event.target.value);
    showToast(`Simulation speed set to ${state.speed}×.`);
  });
  $('#save-project').addEventListener('click', () => {
    const saved = {
      preset: state.preset.id,
      color: state.color,
      weight: state.weight,
      stretch: state.stretch,
      wind: state.wind,
      speed: state.speed,
    };
    try { localStorage.setItem('stitch-violet-hour', JSON.stringify(saved)); } catch { /* private browsing can block storage */ }
    $('.saved-state').innerHTML = '<i></i> Saved just now';
    showToast('Project saved in this browser.');
  });
  $('#export-project').addEventListener('click', () => downloadProject(state));

  $('#rotate-view').addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    $('#rotate-view').classList.toggle('is-active', state.autoRotate);
    showToast(state.autoRotate ? 'Auto-rotate enabled.' : 'Auto-rotate paused.');
  });
  $('#reset-view').addEventListener('click', () => {
    state.rotation.yaw = 0.24;
    state.rotation.pitch = 0.025;
    state.rotation.distance = 6.7;
    state.rotation.target = [0, 1.55, 0];
  });
  $('#toggle-wireframe').addEventListener('click', () => {
    state.wireframe = !state.wireframe;
    $('#toggle-wireframe').classList.toggle('is-active', state.wireframe);
    showToast(state.wireframe ? 'Fabric particle mesh shown.' : 'Fabric surface view restored.');
  });
  $('#toggle-model').addEventListener('click', () => {
    state.showModel = !state.showModel;
    $('#toggle-model').classList.toggle('is-active', !state.showModel);
    showToast(state.showModel ? 'Mannequin visible.' : 'Mannequin hidden.');
  });
  $('#fullscreen-view').addEventListener('click', async () => {
    const target = $('.viewport-shell');
    try {
      if (!document.fullscreenElement) await target.requestFullscreen();
      else await document.exitFullscreen();
    } catch { showToast('Fullscreen is not available in this browser.'); }
  });

  // Orbit, pan-free zoom and a double-click camera reset keep the viewport direct and tactile.
  activeCanvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    state.pointer = { x: event.clientX, y: event.clientY, moved: false };
    activeCanvas.setPointerCapture?.(event.pointerId);
    activeCanvas.classList.add('dragging');
  });
  activeCanvas.addEventListener('pointermove', (event) => {
    if (!state.pointer) return;
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    state.pointer.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
    state.rotation.yaw += dx * 0.006;
    state.rotation.pitch = Math.max(-0.16, Math.min(0.62, state.rotation.pitch - dy * 0.0045));
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
  });
  const endOrbit = () => {
    state.pointer = null;
    activeCanvas.classList.remove('dragging');
  };
  activeCanvas.addEventListener('pointerup', endOrbit);
  activeCanvas.addEventListener('pointercancel', endOrbit);
  activeCanvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    state.rotation.distance = Math.max(4.15, Math.min(10.5, state.rotation.distance + event.deltaY * 0.004));
  }, { passive: false });
  activeCanvas.addEventListener('dblclick', () => {
    state.rotation.yaw = 0.24;
    state.rotation.pitch = 0.025;
    state.rotation.distance = 6.7;
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      state.running = !state.running;
      updateSimulationLabels(state);
    }
    if (event.key.toLowerCase() === 'r' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) resetSimulation(true);
  });

  const resizeObserver = new ResizeObserver(() => renderer.resize?.());
  resizeObserver.observe($('.stage'));

  let previousTime = performance.now();
  let elapsedForFps = 0;
  let frameCounter = 0;
  let lastFpsUpdate = previousTime;
  const renderFrame = (now) => {
    const rawDt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const dt = state.running ? rawDt * state.speed : 0;
    if (state.running) {
      state.time += dt;
      if (state.time >= 8) {
        state.time %= 8;
        state.simulation.reset(clothGeometry);
      }
    }
    if (state.autoRotate) state.rotation.yaw += rawDt * 0.13;
    const settings = {
      running: state.running,
      wind: state.wind,
      gravity: state.weight,
      stretch: state.stretch,
    };
    if (state.running) state.simulation.step(dt, state.time, settings);
    renderer.render({
      simulation: state.simulation,
      dt,
      time: state.time,
      camera: state.rotation,
      color: hexToRgb(state.color),
      roughness: state.preset.roughness,
      settings,
      wireframe: state.wireframe,
      showModel: state.showModel,
    });
    frameCounter++;
    elapsedForFps += rawDt;
    if (elapsedForFps > 0.6) {
      const fps = Math.round(frameCounter / elapsedForFps);
      $('#fps-label').textContent = `${fps} FPS`;
      frameCounter = 0;
      elapsedForFps = 0;
    }
    if (now - lastFpsUpdate > 80) {
      updateSimulationLabels(state);
      lastFpsUpdate = now;
    }
    requestAnimationFrame(renderFrame);
  };
  requestAnimationFrame(renderFrame);
}
