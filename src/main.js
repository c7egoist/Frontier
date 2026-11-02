import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './styles.css';

import { FieldScene, QUALITY_LEVELS } from './gpu/FieldScene.js';
import {
  FIELD_MODES,
  MODE_INDEX,
  effectiveScale,
} from './core/fields.js';
import {
  parseDatasetFile,
  createSampleFieldCsv,
  datasetSummary,
} from './core/datasets.js';
import {
  computeFieldStats,
  formatClock,
  formatNumber,
  probeSample,
} from './core/analysis.js';
import {
  SCALAR_CHANNELS,
  colorAt,
  gradientCss,
} from './core/palettes.js';
import {
  drawCoherenceBar,
  drawFilmstripCanvas,
  drawHistogram,
  drawSparkline,
  filmstripChannels,
} from './ui/charts.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  canvas: $('#gl-canvas'),
  viewport: $('#viewport'),
  loading: $('#loading-overlay'),
  error: $('#error-overlay'),
  errorMessage: $('#error-message'),
  gpuLabel: $('#gpu-label'),
  statusBackend: $('#status-backend'),
  statusSource: $('#status-source'),
  statusCounts: $('#status-counts'),
  statusFps: $('#status-fps'),
  statusClock: $('#status-clock'),
  sessionTime: $('#session-time'),
  computeNote: $('#compute-note'),
  qualityBadge: $('#quality-badge'),
  sourceKind: $('#source-kind'),
  modeEyebrow: $('#mode-eyebrow'),
  viewTitle: $('#view-title'),
  viewSubtitle: $('#view-subtitle'),
  datasetSource: $('#dataset-source'),
  datasetGrid: $('#dataset-grid'),
  customPreset: $('#custom-preset'),
  customSubtitle: $('#custom-subtitle'),
  scalarSelect: $('#scalar-select'),
  legendGradient: $('#legend-gradient'),
  legendLabel: $('#legend-label'),
  legendUnit: $('#legend-unit'),
  legendMax: $('#legend-max'),
  legendMid: $('#legend-mid'),
  legendLow: $('.legend-ticks span:last-child'),
  legendCaption: $('#legend-caption'),
  filmstrip: $('#filmstrip'),
  fileInput: $('#file-input'),
  dropOverlay: $('#drop-overlay'),
  helpDialog: $('#help-dialog'),
  toastStack: $('#toast-stack'),
  probeHint: $('#probe-hint'),
  probeEmpty: $('#probe-empty'),
  probeDetails: $('#probe-details'),
  copyProbe: $('#copy-probe'),
  playButton: $('#play-btn'),
  timeSlider: $('#time-slider'),
  timeValue: $('#time-value'),
  sliceY: $('#slice-y'),
  sliceEnabled: $('#slice-enabled'),
};

const canvases = {
  sparkline: $('#sparkline'),
  histogram: $('#histogram'),
  coherence: $('#coherence'),
  filmstrip: $$('#filmstrip canvas'),
};

const state = {
  mode: 'wind',
  scalarMode: 0,
  playing: true,
  time: 8,
  playbackSpeed: 1,
  fieldScale: 1,
  glyphScale: 1,
  tracerRate: 1,
  trailLength: 1.2,
  sliceEnabled: false,
  sliceY: 5,
  quality: 'balanced',
  dataScale: 1,
  dataset: null,
  probe: null,
  layers: {
    glyphs: true,
    animatedGlyphs: true,
    tracers: true,
    terrain: true,
    grid: true,
    contours: true,
    rain: true,
    vegetation: true,
    obstacles: true,
  },
};

const params = new URLSearchParams(window.location.search);
const targetFps = Number(params.get('fps')) > 0 ? Math.min(60, Number(params.get('fps'))) : 0;
const frameInterval = targetFps ? 1000 / targetFps : 0;
if (QUALITY_LEVELS[params.get('quality')]) state.quality = params.get('quality');
for (const key of ['glyphs', 'tracers', 'rain', 'vegetation', 'grid']) {
  if (params.get(key) === '0') state.layers[key] = false;
}

let scene = null;
let lastStats = null;
let lastProbe = null;
let history = [];
let filmstripKey = '';
let statsTimer = 0;
let filmstripTimer = 0;
let probeTimer = 0;
let firstFrame = true;

function fieldOptions() {
  const mode = FIELD_MODES.find((entry) => entry.id === state.mode) || FIELD_MODES[0];
  return {
    mode: MODE_INDEX[state.mode],
    amplitude: mode.amplitude,
    time: state.time,
    scale: state.fieldScale,
    dataScale: state.dataScale,
    scalarMode: state.scalarMode,
    dataset: state.dataset,
  };
}

function channelLabel(channel) {
  if (channel === 1) {
    return state.mode === 'custom' ? 'Data scalar' : 'Pressure';
  }
  return SCALAR_CHANNELS[channel]?.label || 'Channel';
}

function channelInfo(channel) {
  const base = SCALAR_CHANNELS[channel] || SCALAR_CHANNELS[0];
  if (channel === 1 && state.mode === 'custom') {
    return { ...base, label: 'Data scalar', unit: 'data', description: 'Imported scalar channel' };
  }
  return base;
}

function paintRange(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  const progress = ((value - min) / Math.max(1e-6, max - min)) * 100;
  input.style.setProperty('--progress', `${progress.toFixed(2)}%`);
}

function syncRangeOutput(input, output, formatter) {
  paintRange(input);
  if (output) output.textContent = formatter(Number(input.value));
}

function syncTimeUI() {
  elements.timeSlider.value = String(state.time);
  syncRangeOutput(elements.timeSlider, elements.timeValue, (value) => `${value.toFixed(1)} s`);
  const clock = formatClock(state.time);
  elements.statusClock.textContent = clock;
  elements.sessionTime.textContent = clock;
}

function updatePlayButton() {
  const use = elements.playButton.querySelector('use');
  use.setAttribute('href', state.playing ? '#i-pause' : '#i-play');
  elements.playButton.setAttribute('aria-label', state.playing ? 'Pause simulation' : 'Play simulation');
  elements.playButton.title = state.playing ? 'Pause simulation' : 'Play simulation';
}

function togglePlay(force) {
  state.playing = typeof force === 'boolean' ? force : !state.playing;
  updatePlayButton();
}

function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = message ? ` · ${message}` : '';
  toast.append(strong, span);
  elements.toastStack.append(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 260);
  }, 3800);
}

function onStatus(status) {
  const computeText = status.computeAvailable ? 'WebGL2 · GPU shaders' : 'WebGL2 · shader fallback';
  elements.gpuLabel.textContent = computeText;
  elements.statusBackend.textContent = computeText;
  elements.computeNote.textContent = status.computeAvailable
    ? 'GPU shader advection active · float framebuffer available'
    : 'GPU shader advection active · no float framebuffer';
  elements.qualityBadge.textContent = status.quality;
  elements.statusCounts.textContent = [
    `${status.glyphCount.toLocaleString()} glyphs`,
    `${status.particleCount.toLocaleString()} tracers`,
    `${status.terrainVertices.toLocaleString()} surface vertices`,
  ].join(' · ');
}

function onFrame(frame) {
  elements.statusFps.textContent = `${Math.round(frame.fps)} FPS · ${frame.frameMs.toFixed(1)} ms`;
}

function updateLegend() {
  const info = channelInfo(state.scalarMode);
  elements.legendGradient.style.background = gradientCss(info.id, 'to top');
  elements.legendLabel.textContent = info.label;
  elements.legendUnit.textContent = info.unit;
  elements.legendCaption.textContent = info.description;
  if (state.scalarMode === 0) {
    elements.legendMax.textContent = '6.0';
    elements.legendMid.textContent = '3.0';
    elements.legendLow.textContent = '0';
  } else if (state.scalarMode === 1 && state.mode === 'custom' && state.dataset) {
    const [lo, hi] = state.dataset.scalarRange;
    elements.legendMax.textContent = formatNumber(hi, 1);
    elements.legendMid.textContent = formatNumber((lo + hi) * 0.5, 1);
    elements.legendLow.textContent = formatNumber(lo, 1);
  } else if (state.scalarMode === 4) {
    elements.legendMax.textContent = '+6.3';
    elements.legendMid.textContent = '+2.1';
    elements.legendLow.textContent = '-2.2';
  } else if (state.scalarMode === 2) {
    elements.legendMax.textContent = '5.0';
    elements.legendMid.textContent = '2.5';
    elements.legendLow.textContent = '0';
  } else {
    elements.legendMax.textContent = '1.0';
    elements.legendMid.textContent = '0.5';
    elements.legendLow.textContent = '0';
  }
}

function updateFilmstripLabels() {
  const channels = filmstripChannels(MODE_INDEX[state.mode]);
  $$('#filmstrip .film-card').forEach((card, index) => {
    const channel = channels[index];
    card.querySelector('.film-label').textContent = channelLabel(channel);
    card.classList.toggle('active', channel === state.scalarMode);
    card.dataset.channel = String(channel);
  });
}

function updateScalarSelect() {
  const pressureOption = elements.scalarSelect.querySelector('option[value="1"]');
  pressureOption.textContent = state.mode === 'custom' ? 'Data scalar' : 'Pressure / scalar';
  elements.scalarSelect.value = String(state.scalarMode);
}

function updateModeUI() {
  const mode = FIELD_MODES.find((entry) => entry.id === state.mode) || FIELD_MODES[0];
  $$('#preset-list .preset').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.mode);
  });
  elements.sourceKind.textContent = state.mode === 'custom' ? 'Imported' : 'Procedural';
  elements.modeEyebrow.textContent = state.mode === 'custom'
    ? 'Imported grid · trilinear sampling'
    : `${mode.label} · live simulation`;
  elements.viewTitle.textContent = state.mode === 'custom' && state.dataset ? state.dataset.name : mode.title;
  elements.viewSubtitle.textContent = mode.subtitle;
  elements.statusSource.textContent = state.mode === 'custom' && state.dataset
    ? `${state.dataset.name} · ${datasetSummary(state.dataset)}`
    : mode.note;
  elements.datasetSource.textContent = state.mode === 'custom' && state.dataset ? state.dataset.name : 'Analytic field';
  elements.datasetGrid.textContent = state.mode === 'custom' && state.dataset
    ? state.dataset.dims.join(' × ')
    : 'Continuous';
  updateScalarSelect();
  updateLegend();
  updateFilmstripLabels();
}

function renderFilmstrip(force = false) {
  const options = fieldOptions();
  const timeBucket = Math.round(options.time * 1.5);
  const key = [
    options.mode, options.scalarMode, timeBucket, options.amplitude.toFixed(3),
    options.scale.toFixed(3), options.dataScale.toFixed(3), state.dataset?.name || '',
  ].join('|');
  if (!force && key === filmstripKey) return;
  filmstripKey = key;
  const channels = filmstripChannels(options.mode);
  canvases.filmstrip.forEach((canvas, index) => {
    drawFilmstripCanvas(canvas, channels[index], options);
  });
}

function refreshStats(resetHistory = false) {
  const options = fieldOptions();
  lastStats = computeFieldStats(options);
  if (resetHistory) history = [];
  history.push(lastStats.meanSpeed);
  if (history.length > 96) history.shift();

  $('#stat-mean').textContent = formatNumber(lastStats.meanSpeed, 2);
  $('#stat-peak').textContent = formatNumber(lastStats.maxSpeed, 2);
  $('#stat-energy').textContent = formatNumber(lastStats.energy, 2);
  $('#stat-coherence').textContent = `${Math.round(lastStats.coherence * 100)}%`;
  $('#stat-samples').textContent = `${lastStats.samples} samples`;
  $('#histogram-range').textContent = '0 – 6 m/s';
  drawSparkline(canvases.sparkline, history);
  drawHistogram(canvases.histogram, lastStats);
  drawCoherenceBar(canvases.coherence, lastStats.coherence);
}

function updateProbe(updateMarker = true) {
  if (!state.probe || !scene) return;
  const options = fieldOptions();
  lastProbe = probeSample(state.probe, options);
  const info = channelInfo(state.scalarMode);
  const rgb = colorAt(info.id, lastProbe.scalar.normalized);
  $('#probe-position').textContent = lastProbe.point.map((value) => formatNumber(value, 2)).join(', ');
  $('#probe-u').textContent = formatNumber(lastProbe.vector[0], 3);
  $('#probe-v').textContent = formatNumber(lastProbe.vector[1], 3);
  $('#probe-w').textContent = formatNumber(lastProbe.vector[2], 3);
  $('#probe-speed').textContent = formatNumber(lastProbe.speed, 3);
  $('#probe-scalar').textContent = formatNumber(lastProbe.scalar.raw, 3);
  $('#probe-curl').textContent = formatNumber(lastProbe.curl, 3);
  $('#probe-divergence').textContent = formatNumber(lastProbe.divergence, 3);
  $('#probe-azimuth').textContent = `${formatNumber(lastProbe.azimuth, 1)}°`;
  $('#probe-inclination').textContent = `${formatNumber(lastProbe.inclination, 1)}°`;
  if (updateMarker) scene.setProbe(state.probe, lastProbe.vector, rgb);
}

function setProbe(point) {
  state.probe = point;
  elements.probeEmpty.hidden = true;
  elements.probeDetails.hidden = false;
  elements.copyProbe.disabled = false;
  elements.probeHint.querySelector('span').textContent = 'Probe active · click to move sample';
  updateProbe(true);
}

function clearProbe() {
  state.probe = null;
  lastProbe = null;
  if (scene) scene.clearProbe();
  elements.probeEmpty.hidden = false;
  elements.probeDetails.hidden = true;
  elements.copyProbe.disabled = true;
  elements.probeHint.querySelector('span').textContent = 'Click terrain to sample the field';
}

function setMode(modeId) {
  if (modeId === 'custom' && !state.dataset) {
    showToast('No imported dataset', 'Load a CSV or JSON grid first.', 'error');
    return;
  }
  if (modeId === state.mode) return;
  state.mode = modeId;
  state.dataScale = modeId === 'custom' && state.dataset ? state.dataset.recommendedScale : 1;
  state.time = modeId === 'custom' ? Math.min(state.time, 30) : state.time;
  if (scene) scene.setMode(modeId, state);
  updateModeUI();
  syncTimeUI();
  refreshStats(true);
  renderFilmstrip(true);
  if (state.probe) updateProbe(true);
  showToast('Field loaded', (FIELD_MODES.find((entry) => entry.id === modeId) || FIELD_MODES[0]).label);
}

function setScalarMode(channel) {
  state.scalarMode = channel;
  updateScalarSelect();
  updateLegend();
  updateFilmstripLabels();
  renderFilmstrip(true);
  if (state.probe) updateProbe(true);
}

function activateDataset(dataset) {
  state.dataset = dataset;
  state.dataScale = dataset.recommendedScale;
  elements.customPreset.disabled = false;
  elements.customSubtitle.textContent = datasetSummary(dataset);
  if (scene) scene.setDataset(dataset, state);
  if (state.mode !== 'custom') {
    state.mode = 'custom';
    if (scene) scene.setMode('custom', state);
  }
  updateModeUI();
  refreshStats(true);
  renderFilmstrip(true);
  if (state.probe) updateProbe(true);
  onStatus({
    webgl2: true,
    computeAvailable: scene?.computeAvailable ?? true,
    quality: QUALITY_LEVELS[state.quality].label,
    glyphCount: scene?.glyphCount || 0,
    particleCount: scene?.particleCount || 0,
    terrainVertices: (QUALITY_LEVELS[state.quality].terrainSegments + 1) ** 2,
    dataset,
  });
  showToast('Dataset imported', `${dataset.name} · ${datasetSummary(dataset)}`);
}

async function handleFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const dataset = parseDatasetFile(text, file.name);
    activateDataset(dataset);
  } catch (error) {
    showToast('Import failed', error.message || 'Unrecognized field data.', 'error');
  } finally {
    elements.fileInput.value = '';
  }
}

async function loadSample() {
  try {
    let text;
    try {
      const response = await fetch('/sample-wind-field.csv', { cache: 'no-store' });
      if (!response.ok) throw new Error('Sample file unavailable');
      text = await response.text();
    } catch {
      text = createSampleFieldCsv();
    }
    const dataset = parseDatasetFile(text, 'sample-wind-field.csv');
    activateDataset(dataset);
  } catch (error) {
    showToast('Sample failed', error.message || 'Could not generate sample field.', 'error');
  }
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSnapshot() {
  const options = fieldOptions();
  const snapshot = {
    schema: 'frontier.vector-field.snapshot/1',
    exportedAt: new Date().toISOString(),
    mode: state.mode,
    scalarChannel: channelInfo(state.scalarMode),
    simulation: {
      time: state.time,
      playing: state.playing,
      playbackSpeed: state.playbackSpeed,
      fieldScale: state.fieldScale,
      effectiveScale: effectiveScale(options),
      tracerRate: state.tracerRate,
      slice: { enabled: state.sliceEnabled, height: state.sliceY },
    },
    dataset: state.dataset ? {
      name: state.dataset.name,
      dimensions: state.dataset.dims,
      sourceBounds: state.dataset.sourceBounds,
      scalarRange: state.dataset.scalarRange,
      meanSpeed: state.dataset.meanSpeed,
      maxSpeed: state.dataset.maxSpeed,
      rows: state.dataset.rows,
    } : null,
    statistics: lastStats,
    history,
    probe: lastProbe,
    layers: state.layers,
    renderer: {
      quality: state.quality,
      gpuCompute: scene?.computeAvailable ?? false,
      glyphs: scene?.glyphCount ?? 0,
      tracers: scene?.particleCount ?? 0,
      fps: scene?.lastFps ?? null,
    },
  };
  downloadJson(`frontier-field-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, snapshot);
  showToast('Snapshot exported', 'Session statistics and probe included.');
}

function bindControls() {
  $$('#preset-list .preset').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });
  $('#import-btn').addEventListener('click', () => elements.fileInput.click());
  $('#import-top').addEventListener('click', () => elements.fileInput.click());
  $('#sample-btn').addEventListener('click', loadSample);
  elements.fileInput.addEventListener('change', (event) => handleFile(event.target.files?.[0]));

  elements.playButton.addEventListener('click', () => togglePlay());
  $('#reset-time-btn').addEventListener('click', () => {
    state.time = 0;
    syncTimeUI();
    refreshStats(true);
    renderFilmstrip(true);
  });
  $('#playback-speed').addEventListener('change', (event) => {
    state.playbackSpeed = Number(event.target.value);
  });
  elements.timeSlider.addEventListener('input', (event) => {
    state.time = Number(event.target.value);
    togglePlay(false);
    syncTimeUI();
    renderFilmstrip(true);
  });

  const rangeBindings = [
    ['field-scale', 'field-scale-value', 'fieldScale', (value) => value.toFixed(2)],
    ['glyph-scale', 'glyph-scale-value', 'glyphScale', (value) => value.toFixed(2)],
    ['tracer-rate', 'tracer-rate-value', 'tracerRate', (value) => value.toFixed(2)],
    ['slice-y', 'slice-y-value', 'sliceY', (value) => `${value.toFixed(1)} m`],
  ];
  for (const [inputId, outputId, key, formatter] of rangeBindings) {
    const input = $(`#${inputId}`);
    const output = $(`#${outputId}`);
    syncRangeOutput(input, output, formatter);
    input.addEventListener('input', (event) => {
      state[key] = Number(event.target.value);
      syncRangeOutput(input, output, formatter);
      if (key === 'fieldScale') refreshStats(false);
    });
  }
  elements.sliceEnabled.addEventListener('change', (event) => {
    state.sliceEnabled = event.target.checked;
    elements.sliceY.disabled = !state.sliceEnabled;
  });

  const layerBindings = {
    'layer-glyphs': 'glyphs',
    'layer-animated-glyphs': 'animatedGlyphs',
    'layer-tracers': 'tracers',
    'layer-terrain': 'terrain',
    'layer-grid': 'grid',
    'layer-rain': 'rain',
    'layer-vegetation': 'vegetation',
    'layer-obstacles': 'obstacles',
  };
  for (const [id, key] of Object.entries(layerBindings)) {
    const input = $(`#${id}`);
    input.checked = state.layers[key];
    input.addEventListener('change', (event) => {
      state.layers[key] = event.target.checked;
      if (key === 'grid') state.layers.contours = event.target.checked;
    });
  }

  elements.scalarSelect.addEventListener('change', (event) => setScalarMode(Number(event.target.value)));
  $$('#filmstrip .film-card').forEach((card) => {
    card.addEventListener('click', () => setScalarMode(Number(card.dataset.channel)));
  });

  $('#quality-select').addEventListener('change', (event) => {
    state.quality = event.target.value;
    if (scene) scene.setQuality(state.quality, state);
    showToast('GPU budget', `${QUALITY_LEVELS[state.quality].label} quality selected.`);
  });

  $$('.view-tab').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.view-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
      scene?.setView(button.dataset.view);
    });
  });
  $('#reset-view').addEventListener('click', () => {
    scene?.setView('iso');
    $$('.view-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === 'iso'));
  });
  $('#fullscreen-btn').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await elements.viewport.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      showToast('Fullscreen blocked', error.message, 'error');
    }
  });

  $('#export-btn').addEventListener('click', exportSnapshot);
  $('#export-analysis').addEventListener('click', exportSnapshot);
  $('#clear-probe').addEventListener('click', clearProbe);
  $('#copy-probe').addEventListener('click', async () => {
    if (!lastProbe) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastProbe, null, 2));
      showToast('Probe copied', 'Sample JSON is on the clipboard.');
    } catch {
      showToast('Clipboard blocked', 'Use Export snapshot instead.', 'error');
    }
  });

  $('#help-btn').addEventListener('click', () => elements.helpDialog.showModal());
  $('#close-help').addEventListener('click', () => elements.helpDialog.close());
  elements.helpDialog.addEventListener('click', (event) => {
    if (event.target === elements.helpDialog) elements.helpDialog.close();
  });

  let pointerStart = null;
  elements.canvas.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
  });
  elements.canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart || pointerStart.button !== 0 || !scene) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (distance > 5) return;
    const point = scene.probeFromPointer(event.clientX, event.clientY);
    if (point) setProbe(point);
  });

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.dropOverlay.classList.add('visible');
  });
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) elements.dropOverlay.classList.remove('visible');
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.dropOverlay.classList.remove('visible');
    handleFile(event.dataTransfer?.files?.[0]);
  });

  window.addEventListener('keydown', (event) => {
    if (elements.helpDialog.open) return;
    const tag = event.target?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === '1') setMode('wind');
    else if (event.key === '2') setMode('force');
    else if (event.key === '3') setMode('terrain');
    else if (event.key === '4' && state.dataset) setMode('custom');
    else if (event.key.toLowerCase() === 'r') {
      scene?.setView('iso');
      $$('.view-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === 'iso'));
    } else if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      elements.helpDialog.showModal();
    }
  });
}

function showFatal(error) {
  elements.loading.classList.add('hidden');
  elements.error.hidden = false;
  elements.errorMessage.textContent = error.message || String(error);
  elements.gpuLabel.textContent = 'WebGL2 unavailable';
  elements.statusBackend.textContent = 'Renderer unavailable';
  showToast('Renderer unavailable', error.message || String(error), 'error');
  console.error(error);
}

function start() {
  try {
    scene = new FieldScene(elements.canvas, { quality: state.quality, onFrame, onStatus });
  } catch (error) {
    showFatal(error);
    return;
  }

  // Non-UI validation hook for state and seed-position inspection.
  window.__fieldStudio = {
    get state() { return state; },
    get scene() { return scene; },
    readSeedPositions: (count = 32) => scene?.readParticleStates(count) || [],
  };

  $('#quality-select').value = state.quality;
  bindControls();
  updatePlayButton();
  updateModeUI();
  syncTimeUI();
  $$('input[type="range"]').forEach(paintRange);
  refreshStats(true);
  renderFilmstrip(true);

  let last = performance.now();
  function frame(now) {
    if (frameInterval && now - last < frameInterval) {
      requestAnimationFrame(frame);
      return;
    }
    const rawDelta = Math.min((now - last) / 1000, 0.5);
    const delta = Math.min(rawDelta, 0.1);
    last = now;
    if (state.playing) {
      state.time = (state.time + delta * state.playbackSpeed) % 60;
      syncTimeUI();
    }
    scene.update(delta, state, rawDelta);
    statsTimer += rawDelta;
    filmstripTimer += rawDelta;
    probeTimer += rawDelta;
    if (statsTimer >= 0.5) {
      refreshStats(false);
      statsTimer = 0;
    }
    if (filmstripTimer >= 1.0) {
      renderFilmstrip(false);
      filmstripTimer = 0;
    }
    if (probeTimer >= 0.12 && state.probe) {
      updateProbe(true);
      probeTimer = 0;
    }
    if (firstFrame) {
      firstFrame = false;
      setTimeout(() => elements.loading.classList.add('hidden'), 420);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start();
