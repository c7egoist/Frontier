// UI, camera and frame loop for the WebGPU volumetric tyre demo.
import { buildTyreMesh, resolveParams, roadPreset } from './tyreCore.js';
import { GpuTyre } from './gpuTyre.js';

const canvas = document.getElementById('view');
const hud = document.getElementById('hud');
const message = document.getElementById('message');

const SLIDERS = [
  { key: 'speed', label: 'Rolling speed (m/s)', min: 0, max: 20, step: 0.5 },
  { key: 'bar', label: 'Inflation (bar)', min: 0.5, max: 4, step: 0.05 },
  { key: 'youngsMPa', label: 'Rubber stiffness E (MPa)', min: 2, max: 10, step: 0.2 },
  { key: 'density', label: 'Effective density (kg/m³)', min: 1000, max: 3000, step: 50 },
  { key: 'rimMass', label: 'Sprung mass per corner (kg)', min: 60, max: 400, step: 5 },
  { key: 'bumpCm', label: 'Obstacle height (cm)', min: 0, max: 12, step: 0.5 },
  { key: 'obsX', label: 'Obstacle position (m)', min: 0, max: 40, step: 0.25 },
  { key: 'obsW', label: 'Obstacle width (m)', min: 0.1, max: 3, step: 0.05 },
  { key: 'period', label: 'Road repeat length (m)', min: 6, max: 40, step: 0.5 },
  { key: 'spacing', label: 'Mixed road: spacing (m)', min: 1, max: 20, step: 0.25 },
  { key: 'slip', label: 'Slip angle / steer (deg)', min: -10, max: 10, step: 0.5 },
  { key: 'friction', label: 'Tread friction µ', min: 0, max: 1.5, step: 0.05 },
  { key: 'frictionC', label: 'Contact stickiness (1/s)', min: 0, max: 2000, step: 50 },
  { key: 'damping', label: 'Internal damping (1/s)', min: 0, max: 30, step: 0.5 },
  { key: 'simSpeed', label: 'Simulation speed (×)', min: 0.1, max: 1, step: 0.05 },
];

const ui = {
  speed: 5, bar: 2.5, youngsMPa: 6, density: 1000, rimMass: 180, bumpCm: 3,
  friction: 0.9, damping: 4, simSpeed: 1, colourMode: 0, showEdges: false, paused: false, follow: true,
  slip: 0, road: 'speedbump',
  obsX: 4, obsW: 0.5, period: 12, spacing: 4, frictionC: 600,
};

function toParams() {
  return resolveParams({
    speed: ui.speed,
    pressure: ui.bar * 1e5,
    youngs: ui.youngsMPa * 1e6,
    density: ui.density,
    rimMass: ui.rimMass,
    road: roadPreset(ui.road, ui.bumpCm / 100, { x: ui.obsX, w: ui.obsW, period: ui.period, spacing: ui.spacing }),
    roadPeriod: ui.period,
    frictionC: ui.frictionC,
    yaw: (ui.slip * Math.PI) / 180,
    friction: ui.friction,
    damping: ui.damping,
  });
}

function buildControls() {
  const panel = document.getElementById('controls');
  for (const s of SLIDERS) {
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `<span>${s.label}</span><span class="val" id="v-${s.key}"></span>
      <input type="range" id="i-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${ui[s.key]}">`;
    panel.appendChild(row);
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      ui[s.key] = Number(input.value);
      showValue(s.key);
      if (s.key === 'density') gpu?.setDensity(toParams().density);
    });
    showValue(s.key);
  }
  document.getElementById('road').addEventListener('change', (e) => { ui.road = e.target.value; });
  document.getElementById('colour').addEventListener('change', (e) => { ui.colourMode = Number(e.target.value); });
  document.getElementById('edges').addEventListener('change', (e) => { ui.showEdges = e.target.checked; });
  document.getElementById('follow').addEventListener('change', (e) => { ui.follow = e.target.checked; });
  document.getElementById('pause').addEventListener('click', (e) => {
    ui.paused = !ui.paused;
    e.target.textContent = ui.paused ? 'Resume' : 'Pause';
  });
  document.getElementById('reset').addEventListener('click', () => { gpu?.reset(); accumulator = 0; simTime = 0; });
}

function showValue(key) {
  const el = document.getElementById(`v-${key}`);
  const value = ui[key];
  el.textContent = key === 'density' ? Math.round(value) : Number(value).toFixed(key === 'bar' || key === 'friction' ? 2 : 1);
}

// ---- minimal column-major matrix helpers ------------------------------------------------
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}
function lookAt(eye, center, up) {
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = norm([center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]]);
  const s = norm(cross(f, up));
  const u = cross(s, f);
  return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0,
    -dot(s, eye), -dot(u, eye), dot(f, eye), 1];
}
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = sum;
  }
  return out;
}

const camera = { yaw: 0.9, pitch: 0.28, dist: 2.2, target: [0, 0.3, 0] };
let dragging = false, lastPointer = null;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastPointer = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camera.yaw -= (e.clientX - lastPointer[0]) * 0.008;
  camera.pitch = Math.max(-0.1, Math.min(1.3, camera.pitch + (e.clientY - lastPointer[1]) * 0.006));
  lastPointer = [e.clientX, e.clientY];
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.dist = Math.max(0.8, Math.min(8, camera.dist * Math.exp(e.deltaY * 0.001)));
}, { passive: false });

function cameraMatrices(aspect) {
  const eye = [
    camera.target[0] + camera.dist * Math.cos(camera.pitch) * Math.sin(camera.yaw),
    camera.target[1] + camera.dist * Math.sin(camera.pitch),
    camera.target[2] + camera.dist * Math.cos(camera.pitch) * Math.cos(camera.yaw),
  ];
  const view = lookAt(eye, camera.target, [0, 1, 0]);
  const proj = perspective(0.8, aspect, 0.02, 80);
  return { eye, viewProj: multiply(proj, view) };
}

// ---- main loop -----------------------------------------------------------------------------
const SIM_DT_CAP = 1 / 30;
const MAX_STEPS_PER_FRAME = 240;
let gpu = null;
let accumulator = 0, simTime = 0, last = performance.now();
let frames = 0, fpsTime = 0, fps = 0, jsMs = 0;
let meshParams = null;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min((now - last) / 1000, SIM_DT_CAP);
  last = now;
  frames++; fpsTime += realDt;
  if (fpsTime > 0.5) { fps = frames / fpsTime; frames = 0; fpsTime = 0; }
  if (!gpu) return;

  const params = toParams();
  let steps = 0;
  if (!ui.paused) {
    accumulator += realDt * ui.simSpeed;
    steps = Math.min(Math.floor(accumulator / params.dt), MAX_STEPS_PER_FRAME);
    accumulator = steps === MAX_STEPS_PER_FRAME ? 0 : accumulator - steps * params.dt;
    simTime += steps * params.dt;
  }

  if (ui.follow) {
    camera.target[0] += (gpu.rimX - camera.target[0]) * 0.2;
  } else {
    camera.target[0] = 0;
  }
  const aspect = canvas.width / Math.max(1, canvas.height);
  const cam = cameraMatrices(aspect);
  const t0 = performance.now();
  gpu.frame({ params, steps, camera: cam, colourMode: ui.colourMode, showEdges: ui.showEdges });
  jsMs = jsMs * 0.9 + (performance.now() - t0) * 0.1;

  const rim = gpu.lastRim;
  const rimY = rim ? rim.y : NaN;
  const sag = Number.isFinite(rimY) ? (params.targetY - rimY) * 1000 : NaN;
  const g = gpu.gpuTimes;
  const gpuLine = g
    ? `GPU per sub-step (ms, EMA): tet ${g.tet.toFixed(3)}  node ${g.node.toFixed(3)}  rim ${g.rim.toFixed(3)}\n` +
      `GPU est. per frame: ${(steps * (g.tet + g.node + g.rim) + g.normal + g.render).toFixed(2)} ms  (normal ${g.normal.toFixed(3)}, render ${g.render.toFixed(3)})`
    : 'GPU timing: timestamp-query not available in this browser';
  hud.textContent =
    `FPS ${fps.toFixed(0)}   JS encode ${jsMs.toFixed(2)} ms   sub-steps/frame ${steps} (dt ${(params.dt * 1e3).toFixed(3)} ms)\n` +
    `sim time ${simTime.toFixed(2)} s   rim x ${gpu.rimX.toFixed(2)} m   slip ${ui.slip.toFixed(1)}°\n` +
    `rim height ${Number.isFinite(rimY) ? rimY.toFixed(4) : '…'} m   ride-target offset ${Number.isFinite(sag) ? sag.toFixed(1) : '…'} mm\n` +
    `${gpuLine}\n` +
    `nodes ${meshParams.N}   tetrahedra ${meshParams.T}   surface tris ${meshParams.surface.length / 3}`;
}

function showMessage(text) {
  message.textContent = text;
  message.style.display = 'block';
}

async function main() {
  buildControls();
  if (!navigator.gpu) {
    showMessage('WebGPU is not available in this browser. Use a current Chrome, Edge or Safari with WebGPU enabled.');
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { showMessage('No WebGPU adapter was found.'); return; }
  const wanted = adapter.features.has('timestamp-query') ? ['timestamp-query'] : [];
  const device = await adapter.requestDevice({ requiredFeatures: wanted });
  device.lost.then((info) => showMessage(`GPU device lost: ${info.message}`));
  const format = navigator.gpu.getPreferredCanvasFormat();
  const context = canvas.getContext('webgpu');
  resizeCanvas();
  context.configure({ device, format, alphaMode: 'opaque' });
  window.addEventListener('resize', resizeCanvas);

  const p = toParams();
  meshParams = buildTyreMesh(p);
  gpu = new GpuTyre(device, context, format, meshParams, { width: canvas.width, height: canvas.height });
  requestAnimationFrame(frame);
}

main().catch((err) => showMessage(`Failed to start: ${err.message}`));
