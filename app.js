import { snapPoint, confirmDrawing } from './src/input.js?v=21';
import { escapeMarkup, propertyField, slideInspector, bindInspectorTabs } from './src/ui.js?v=21';
import { pairVertexPacket, lineVertexPacket, triangleVertexPacket, triangulatePolygon, ensureWinding, isClosedForm } from './src/rendering.js?v=23';

const draftCanvas = document.querySelector('#draftCanvas');
const sceneCanvas = document.querySelector('#sceneCanvas');
const canvasWrap = document.querySelector('#canvasWrap');
const crosshair = document.querySelector('#canvasCrosshair');
const coordinateReadout = document.querySelector('#coordinateReadout');
const canvasHint = document.querySelector('#canvasHint');
const orbitHint = document.querySelector('#orbitHint');
const statusMessage = document.querySelector('#statusMessage');
const footerMessage = document.querySelector('#footerMessage');
const viewEyebrow = document.querySelector('#viewEyebrow');
const viewTitle = document.querySelector('#viewTitle');
const zoomReadout = document.querySelector('#zoomReadout');
const geometryCount = document.querySelector('#geometryCount');
const planeCount = document.querySelector('#planeCount');
const sceneCount = document.querySelector('#sceneCount');
const snapStepReadout = document.querySelector('#snapStep');
const sceneInspector = document.querySelector('#sceneInspector');
const propertiesInspector = document.querySelector('#propertiesInspector');

const colors = {
  acid: '#d5dfe3',
  cyan: '#8eb4c4',
  pink: '#c49ba0',
  orange: '#c5ad8d',
  purple: '#aca9c5',
  white: '#d7dcde',
  selected: '#ffffff',
  vertex: '#63d486',
  vertexPicked: '#b7ffc2',
  gizmoX: '#e01414',
  gizmoY: '#12d40a',
  gizmoZ: '#1560e0',
  gizmoXHover: '#ff5c5c',
  gizmoYHover: '#6dff67',
  gizmoZHover: '#5d96ff',
  gizmoCyan: '#1fc7c7',
  gizmoMagenta: '#c81ec8',
  gizmoYellow: '#e0cd12',
  muted: '#858d91'
};

let scene = {
  records: [],
  planes: [],
  nextId: 1
};

let view = {
  mode: '3d',
  zoom: 1,
  pan: { x: 0, y: 0 },
  showGrid: true,
  snap: true,
  snapSize: 10,
  pointer: { x: 0, y: 0 },
  hasPointer: false
};

let orbit = {
  yaw: -0.72,
  pitch: 0.56,
  zoom: 1,
  goalYaw: -0.72,
  goalPitch: 0.56,
  goalZoom: 1,
  target: { x: 0, y: 0, z: 0 },
  goalTarget: { x: 0, y: 0, z: 0 }
};
let cameraAnimation = null;

let activeTool = 'select';
let sketch = { points: [], preview: null, previewWorld: null };
let shapeDrag = null;
let controlDrag = null;
let gizmoState = null;
let gizmoDrag = null;
let gizmoHoverAxis = null;
let pickedControlPoint = null;
let selectedId = null;
let undoStack = [];
let redoStack = [];
let isPanning = false;
let isOrbiting = false;
let isScenePanning = false;
let dragAnchor = null;
let activeInspector = 'scene';
let gl = null;
let glProgram = null;
let glPosition = null;
let glMatrix = null;
let glColor = null;
let gpuRenderer = {
  device: null,
  context: null,
  format: null,
  pipeline: null,
  fillPipeline: null,
  gizmoPipeline: null,
  gizmoFillPipeline: null,
  layout: null,
  uniformBuffer: null,
  width: 0,
  height: 0,
  ready: false
};
let cameraView = null;
const rendererReadout = document.querySelector('#rendererReadout');

function initWebGL() {
  gl = sceneCanvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return;
  const vertexSource = `
    attribute vec3 a_position;
    uniform mat4 u_matrix;
    void main() { gl_Position = u_matrix * vec4(a_position, 1.0); }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform vec4 u_color;
    void main() { gl_FragColor = u_color; }
  `;
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexSource);
  gl.compileShader(vertexShader);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);
  glProgram = gl.createProgram();
  gl.attachShader(glProgram, vertexShader);
  gl.attachShader(glProgram, fragmentShader);
  gl.linkProgram(glProgram);
  glPosition = gl.getAttribLocation(glProgram, 'a_position');
  glMatrix = gl.getUniformLocation(glProgram, 'u_matrix');
  glColor = gl.getUniformLocation(glProgram, 'u_color');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
}

async function initWebGPURenderer() {
  if (!navigator.gpu) {
    initWebGL();
    rendererReadout.textContent = 'WEBGL FALLBACK';
    return;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();
    const shader = device.createShaderModule({ code: `
      struct SceneUniforms {
        camera: mat4x4<f32>,
        tint: vec4<f32>,
      };
      @group(0) @binding(0) var<uniform> scene: SceneUniforms;
      @vertex fn vertexMain(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
        return scene.camera * vec4<f32>(position, 1.0);
      }
      @fragment fn fragmentMain() -> @location(0) vec4<f32> {
        return scene.tint;
      }
    ` });
    const layout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipelineBase = {
      layout: pipelineLayout,
      vertex: {
        module: shader,
        entryPoint: 'vertexMain',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }]
      },
      fragment: {
        module: shader,
        entryPoint: 'fragmentMain',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
    };
    const pipeline = device.createRenderPipeline({ ...pipelineBase, primitive: { topology: 'line-list' } });
    const fillPipeline = device.createRenderPipeline({
      ...pipelineBase,
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' }
    });
    const gizmoPipeline = device.createRenderPipeline({
      ...pipelineBase,
      primitive: { topology: 'line-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' }
    });
    const gizmoFillPipeline = device.createRenderPipeline({
      ...pipelineBase,
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' }
    });
    const uniformBuffer = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const context = sceneCanvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU context unavailable');
    context.configure({ device, format, alphaMode: 'opaque' });
    gpuRenderer = { device, context, format, pipeline, fillPipeline, gizmoPipeline, gizmoFillPipeline, layout, uniformBuffer, width: 0, height: 0, ready: true };
    rendererReadout.textContent = 'WEBGPU';
    device.lost.then(() => {
      gpuRenderer.ready = false;
      rendererReadout.textContent = 'WEBGPU LOST';
    });
    renderAll();
  } catch (error) {
    initWebGL();
    rendererReadout.textContent = 'WEBGL FALLBACK';
    setMessage('WebGPU unavailable · using WebGL fallback');
  }
}

const toolLabels = {
  select: 'Select geometry or a plane',
  line: 'Click endpoints · right-click to confirm',
  polyline: 'Click continuous points · right-click to confirm',
  polygon: 'Click vertices · right-click to close and confirm',
  rectangle: 'Click-drag a corner · right-click to confirm',
  circle: 'Click-drag from centre · right-click to confirm',
  ellipse: 'Click centre · click corner · right-click to confirm',
  arc: 'Click start · through point · end · right-click to confirm',
  slot: 'Click start · end · width · right-click to confirm',
  bezier: 'Click continuous Bézier points · right-click to confirm',
  hermite: 'Click continuous Hermite points · right-click to confirm',
  bspline: 'Click continuous B-spline points · right-click to confirm',
  nurbs: 'Click continuous NURBS points · right-click to confirm',
  spline: 'Click continuous spline points · right-click to confirm',
  plane: 'Click to place · right-click to confirm'
};

const formLabels = {
  line: 'LINE',
  polyline: 'POLYLINE',
  polygon: 'POLYGON',
  rectangle: 'RECTANGLE',
  circle: 'CIRCLE',
  ellipse: 'ELLIPSE',
  arc: '3-POINT ARC',
  slot: 'SLOT',
  bezier: 'BÉZIER',
  hermite: 'HERMITE',
  bspline: 'B-SPLINE',
  nurbs: 'NURBS',
  spline: 'SPLINE'
};

function isCurveForm(form) {
  return ['arc', 'bezier', 'hermite', 'bspline', 'nurbs', 'spline'].includes(form);
}

function controlPointsForRecord(record) {
  if (record.form === 'hermite' && !record.points) return [record.start, record.tangentStart, record.tangentEnd, record.end].filter(Boolean);
  if (isCurveForm(record.form)) return record.points || [];
  return [];
}

function guidePointsForRecord(record) {
  if (record.form === 'circle') return [];
  if (isCurveForm(record.form)) return controlPointsForRecord(record);
  if (record.form === 'line' || record.form === 'polyline' || record.form === 'polygon') return record.points || [];
  if (record.form === 'rectangle') return cornersForRectangle(record);
  if (record.form === 'ellipse') return [record.center, makePoint(record.center.x + record.radiusX, record.center.y), makePoint(record.center.x, record.center.y + record.radiusY)];
  if (record.form === 'slot') return record.points || [];
  return [];
}

function makePoint(x = 0, y = 0) {
  return { x: Number(x), y: Number(y) };
}

function add(a, b) { return makePoint(a.x + b.x, a.y + b.y); }
function sub(a, b) { return makePoint(a.x - b.x, a.y - b.y); }
function scalePoint(a, factor) { return makePoint(a.x * factor, a.y * factor); }
function lengthOf(a) { return Math.hypot(a.x, a.y); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lerp(a, b, t) { return makePoint(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function deepCopy(record) {
  return JSON.parse(JSON.stringify(record));
}

function saveSnapshot() {
  undoStack.push(deepCopy(scene));
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function restoreSnapshot(snapshot) {
  scene = deepCopy(snapshot);
  selectedId = null;
  sketch = { points: [], preview: null };
  renderAll();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(deepCopy(scene));
  restoreSnapshot(undoStack.pop());
  setMessage('Undid the last edit');
  updateUndoButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(deepCopy(scene));
  restoreSnapshot(redoStack.pop());
  setMessage('Restored the next edit');
  updateUndoButtons();
}

function updateUndoButtons() {
  document.querySelector('#undoButton').disabled = undoStack.length === 0;
  document.querySelector('#redoButton').disabled = redoStack.length === 0;
}

function nextName(prefix) {
  const source = prefix === 'Plane' ? scene.planes : scene.records;
  let index = source.length + 1;
  let proposed = `${prefix} ${String(index).padStart(2, '0')}`;
  while (source.some(record => record.name === proposed)) {
    index += 1;
    proposed = `${prefix} ${String(index).padStart(2, '0')}`;
  }
  return proposed;
}

function makeRecord(form, payload) {
  const colorByForm = {
    line: colors.cyan,
    polyline: colors.orange,
    polygon: colors.orange,
    rectangle: colors.acid,
    circle: colors.purple,
    ellipse: colors.purple,
    arc: colors.pink,
    slot: colors.orange,
    bezier: colors.pink,
    hermite: colors.pink,
    bspline: colors.pink,
    nurbs: colors.pink,
    spline: colors.pink
  };
  return {
    id: `g${scene.nextId++}`,
    name: nextName(isCurveForm(form) ? 'Curve' : 'Geometry'),
    form,
    color: colorByForm[form] || colors.white,
    planeId: activePlane()?.id || null,
    winding: isClosedForm(form) ? 'CCW' : null,
    ...payload
  };
}

function makePlane(center) {
  return {
    id: `p${scene.nextId++}`,
    name: nextName('Plane'),
    form: 'plane',
    center: makePoint(center.x, center.y),
    width: 160,
    height: 100,
    elevation: 0,
    twist: 0,
    tiltX: 0,
    tiltY: 0,
    winding: 'CCW',
    color: colors.cyan
  };
}

function findSelected() {
  const record = scene.records.find(item => item.id === selectedId);
  if (record) return record;
  return scene.planes.find(item => item.id === selectedId) || null;
}

function setMessage(message) {
  statusMessage.textContent = message;
  footerMessage.textContent = message;
}

function setTool(tool) {
  activeTool = tool;
  shapeDrag = null;
  controlDrag = null;
  gizmoState = null;
  gizmoDrag = null;
  gizmoHoverAxis = null;
  pickedControlPoint = null;
  sketch = { points: [], preview: null, previewWorld: null };
  document.querySelectorAll('.tool-button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.tool === tool);
  });
  updateToolCopy();
  renderAll();
}

function updateToolCopy() {
  const message = toolLabels[activeTool] || toolLabels.select;
  setMessage(message);
  canvasHint.textContent = message;
  canvasHint.classList.toggle('is-hidden', scene.records.length + scene.planes.length > 0 || sketch.points.length > 0);
  draftCanvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
  sceneCanvas.style.cursor = activeTool === 'select' ? 'grab' : 'crosshair';
}

function setMode(mode) {
  view.mode = mode;
  document.querySelectorAll('.mode-button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.view === mode);
  });
  draftCanvas.classList.toggle('is-hidden', mode !== '2d');
  sceneCanvas.classList.toggle('is-hidden', mode !== '3d');
  orbitHint.classList.toggle('is-visible', mode === '3d');
  viewEyebrow.textContent = mode === '2d' ? 'PARAMETRIC DRAFT' : 'SPATIAL PREVIEW';
  viewTitle.textContent = mode === '2d' ? 'XY / FRONT' : 'ISOMETRIC / WORLD';
  setMessage(mode === '2d' ? toolLabels[activeTool] : 'Drag to orbit · scroll to zoom');
  renderAll();
}

function resizeCanvas(canvas, needs2D = true) {
  const box = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(box.width));
  const height = Math.max(1, Math.floor(box.height));
  const pixelWidth = Math.floor(width * ratio);
  const pixelHeight = Math.floor(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = needs2D ? canvas.getContext('2d') : null;
  if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height, ratio };
}

function screenFromWorld(point, width, height) {
  return {
    x: width / 2 + view.pan.x + point.x * view.zoom,
    y: height / 2 + view.pan.y - point.y * view.zoom
  };
}

function sketchSnapRecord() {
  const points = sketch.points || [];
  if (!points.length || activeTool === 'select' || activeTool === 'plane') return null;
  if (['line', 'polyline', 'polygon', 'bezier', 'hermite', 'bspline', 'nurbs', 'spline'].includes(activeTool)) return { form: activeTool, points };
  if (activeTool === 'arc') return points.length >= 3 ? arcRecordFromPoints(points.slice(0, 3)) : { form: 'polyline', points };
  if (activeTool === 'slot') return points.length >= 3 ? slotRecordFromPoints(points.slice(0, 3)) : { form: 'polyline', points };
  if (activeTool === 'rectangle' && points.length >= 2) return { form: 'polygon', points: cornersForRectangle({ origin: makePoint(Math.min(points[0].x, points[1].x), Math.min(points[0].y, points[1].y)), width: Math.abs(points[1].x - points[0].x), height: Math.abs(points[1].y - points[0].y) }) };
  if (activeTool === 'circle' && points.length >= 2) return { form: 'circle', center: points[0], radius: distance(points[0], points[1]) };
  if (activeTool === 'ellipse' && points.length >= 2) return { form: 'ellipse', center: points[0], radiusX: Math.abs(points[1].x - points[0].x), radiusY: Math.abs(points[1].y - points[0].y) };
  return null;
}

function snapRecordsForPlane(planeId) {
  const records = scene.records.filter(record => (record.planeId || null) === planeId);
  const draft = sketchSnapRecord();
  if (draft) records.push({ ...draft, planeId });
  return records;
}

function worldFromScreen(point, width, height, modifiers = {}) {
  const raw = {
    x: (point.x - width / 2 - view.pan.x) / view.zoom,
    y: -(point.y - height / 2 - view.pan.y) / view.zoom
  };
  const active = activePlane();
  const planeId = active?.id || null;
  const records = snapRecordsForPlane(planeId);
  return snapPoint(raw, {
    records,
    planes: active ? [active] : [],
    ctrlKey: Boolean(modifiers.ctrlKey),
    altKey: Boolean(modifiers.altKey),
    grid: modifiers.grid !== undefined ? modifiers.grid : view.snap && !modifiers.ctrlKey && !modifiers.altKey,
    gridSize: view.snapSize,
    threshold: 12 / view.zoom
  });
}

function rawWorldFromScreen(point, width, height) {
  return makePoint(
    (point.x - width / 2 - view.pan.x) / view.zoom,
    -(point.y - height / 2 - view.pan.y) / view.zoom
  );
}

function gridStep() {
  let step = 10;
  while (step * view.zoom < 25) step *= 2;
  while (step * view.zoom > 95) step /= 2;
  return step;
}

function drawGrid(ctx, width, height) {
  if (!view.showGrid) return;
  const step = gridStep();
  const left = rawWorldFromScreen({ x: 0, y: height }, width, height);
  const right = rawWorldFromScreen({ x: width, y: 0 }, width, height);
  const startX = Math.floor(left.x / step) * step;
  const endX = Math.ceil(right.x / step) * step;
  const startY = Math.floor(left.y / step) * step;
  const endY = Math.ceil(right.y / step) * step;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#101112';
  ctx.beginPath();
  for (let x = startX; x <= endX; x += step) {
    const sx = screenFromWorld({ x, y: 0 }, width, height).x;
    ctx.moveTo(Math.round(sx) + 0.5, 0);
    ctx.lineTo(Math.round(sx) + 0.5, height);
  }
  for (let y = startY; y <= endY; y += step) {
    const sy = screenFromWorld({ x: 0, y }, width, height).y;
    ctx.moveTo(0, Math.round(sy) + 0.5);
    ctx.lineTo(width, Math.round(sy) + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = '#17191a';
  ctx.beginPath();
  for (let x = startX; x <= endX; x += step * 5) {
    const sx = screenFromWorld({ x, y: 0 }, width, height).x;
    ctx.moveTo(Math.round(sx) + 0.5, 0);
    ctx.lineTo(Math.round(sx) + 0.5, height);
  }
  for (let y = startY; y <= endY; y += step * 5) {
    const sy = screenFromWorld({ x: 0, y }, width, height).y;
    ctx.moveTo(0, Math.round(sy) + 0.5);
    ctx.lineTo(width, Math.round(sy) + 0.5);
  }
  ctx.stroke();

  const origin = screenFromWorld({ x: 0, y: 0 }, width, height);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#4a4a4a';
  ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(width, origin.y); ctx.stroke();
  ctx.strokeStyle = '#3d3d3d';
  ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, height); ctx.stroke();
  ctx.fillStyle = '#989898';
  ctx.font = '9px SFMono-Regular, Consolas, monospace';
  ctx.fillText('X', width - 17, origin.y - 7);
  ctx.fillStyle = '#888888';
  ctx.fillText('Y', origin.x + 7, 14);
  ctx.fillStyle = '#626267';
  ctx.beginPath(); ctx.arc(origin.x, origin.y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function bezierPoint(points, t) {
  const a = lerp(points[0], points[1], t);
  const b = lerp(points[1], points[2], t);
  const c = lerp(points[2], points[3], t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

function hermitePoint(record, t) {
  const p0 = record.start;
  const p1 = record.end;
  const m0 = scalePoint(sub(record.tangentStart, p0), 1.65);
  const m1 = scalePoint(sub(p1, record.tangentEnd), 1.65);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return makePoint(
    h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
    h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y
  );
}

function catmullRomPoint(points, t) {
  if (points.length === 1) return points[0];
  if (points.length === 2) return lerp(points[0], points[1], t);
  const scaled = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const segment = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - segment;
  const p0 = points[Math.max(0, segment - 1)];
  const p1 = points[segment];
  const p2 = points[segment + 1];
  const p3 = points[Math.min(points.length - 1, segment + 2)];
  const local2 = local * local;
  const local3 = local2 * local;
  return makePoint(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * local + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * local2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * local3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * local + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * local2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * local3)
  );
}

function curveRecordFromPoints(form, points, planeId = null) {
  if (form === 'hermite' && points.length === 4) return { form, start: points[0], end: points[1], tangentStart: points[2], tangentEnd: points[3], planeId };
  return { form, points, planeId };
}

function arcRecordFromPoints(points, planeId = null) {
  const [a, through, c] = points;
  const determinant = 2 * (a.x * (through.y - c.y) + through.x * (c.y - a.y) + c.x * (a.y - through.y));
  if (Math.abs(determinant) < 0.00001) return { form: 'arc', points: points.slice(), center: a, radius: 0, startAngle: 0, sweep: 0, planeId };
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = through.x * through.x + through.y * through.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = makePoint(
    (a2 * (through.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - through.y)) / determinant,
    (a2 * (c.x - through.x) + b2 * (a.x - c.x) + c2 * (through.x - a.x)) / determinant
  );
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const throughAngle = Math.atan2(through.y - center.y, through.x - center.x);
  const endAngle = Math.atan2(c.y - center.y, c.x - center.x);
  const fullTurn = Math.PI * 2;
  const ccwSweep = (endAngle - startAngle + fullTurn) % fullTurn;
  const throughSweep = (throughAngle - startAngle + fullTurn) % fullTurn;
  const sweep = throughSweep <= ccwSweep + 0.00001 ? ccwSweep : -(fullTurn - ccwSweep);
  return { form: 'arc', points: points.slice(), center, radius: distance(center, a), startAngle, sweep, planeId };
}

function arcSamples(record, count = 96) {
  if (!record.center || !record.radius || !record.sweep) return record.points ? record.points.slice() : [];
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = record.startAngle + record.sweep * index / count;
    points.push(makePoint(record.center.x + Math.cos(angle) * record.radius, record.center.y + Math.sin(angle) * record.radius));
  }
  return points;
}

function slotRecordFromPoints(points, planeId = null) {
  const [start, end, widthPoint] = points;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const radius = length ? Math.abs(dx * (widthPoint.y - start.y) - dy * (widthPoint.x - start.x)) / length : distance(start, widthPoint);
  return { form: 'slot', points: points.slice(), start, end, radius, planeId, winding: 'CCW' };
}

function slotBoundary(record, segments = 24) {
  if (!record.start || !record.end || !record.radius) return record.points ? record.points.slice() : [];
  const dx = record.end.x - record.start.x;
  const dy = record.end.y - record.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const direction = { x: dx / length, y: dy / length };
  const normal = { x: -direction.y, y: direction.x };
  const points = [
    makePoint(record.start.x - normal.x * record.radius, record.start.y - normal.y * record.radius),
    makePoint(record.end.x - normal.x * record.radius, record.end.y - normal.y * record.radius)
  ];
  for (let index = 1; index <= segments; index += 1) {
    const angle = -Math.PI / 2 + Math.PI * index / segments;
    points.push(makePoint(record.end.x + direction.x * Math.cos(angle) * record.radius + normal.x * Math.sin(angle) * record.radius, record.end.y + direction.y * Math.cos(angle) * record.radius + normal.y * Math.sin(angle) * record.radius));
  }
  for (let index = 1; index <= segments; index += 1) {
    const angle = Math.PI / 2 + Math.PI * index / segments;
    points.push(makePoint(record.start.x + direction.x * Math.cos(angle) * record.radius + normal.x * Math.sin(angle) * record.radius, record.start.y + direction.y * Math.cos(angle) * record.radius + normal.y * Math.sin(angle) * record.radius));
  }
  if (points.length > 1 && distance(points[points.length - 1], points[0]) < 0.0001) points.pop();
  return ensureWinding(points, 'CCW');
}

function clampedKnotVector(pointCount, degree) {
  const knotCount = pointCount + degree + 1;
  return Array.from({ length: knotCount }, (_, index) => {
    if (index <= degree) return 0;
    if (index >= pointCount) return 1;
    return (index - degree) / (pointCount - degree);
  });
}

function bsplinePoint(points, t, requestedDegree = 3, weights = null) {
  if (points.length === 1) return points[0];
  const degree = Math.max(1, Math.min(requestedDegree, points.length - 1));
  const knots = clampedKnotVector(points.length, degree);
  const parameter = Math.max(0, Math.min(1, t));
  if (parameter >= 1) return points[points.length - 1];
  let span = degree;
  for (let index = degree; index < points.length; index += 1) {
    if (parameter >= knots[index] && parameter < knots[index + 1]) { span = index; break; }
  }
  const basis = new Array(degree + 1).fill(0);
  const left = new Array(degree + 1).fill(0);
  const right = new Array(degree + 1).fill(0);
  basis[0] = 1;
  for (let order = 1; order <= degree; order += 1) {
    left[order] = parameter - knots[span + 1 - order];
    right[order] = knots[span + order] - parameter;
    let saved = 0;
    for (let offset = 0; offset < order; offset += 1) {
      const denominator = right[offset + 1] + left[order - offset];
      const value = denominator ? basis[offset] / denominator : 0;
      basis[offset] = saved + right[offset + 1] * value;
      saved = left[order - offset] * value;
    }
    basis[order] = saved;
  }
  let x = 0; let y = 0; let weightTotal = 0;
  for (let offset = 0; offset <= degree; offset += 1) {
    const point = points[span - degree + offset];
    const weight = weights ? Number(weights[span - degree + offset]) || 1 : 1;
    const contribution = basis[offset] * weight;
    x += point.x * contribution;
    y += point.y * contribution;
    weightTotal += contribution;
  }
  return makePoint(weightTotal ? x / weightTotal : x, weightTotal ? y / weightTotal : y);
}

function bsplineSamples(record, count = 128) {
  const points = record.points || [];
  if (points.length < 2) return points.slice();
  const degree = Number(record.degree) || 3;
  const weights = record.form === 'nurbs' ? record.weights : null;
  return Array.from({ length: count + 1 }, (_, index) => bsplinePoint(points, index / count, degree, weights));
}

function curveLengthEstimate(record) {
  if (record.form === 'arc' && record.radius !== undefined) return Math.abs(record.radius * (record.sweep || 0));
  const points = record.points || (record.form === 'hermite' ? [record.start, record.end, record.tangentStart, record.tangentEnd].filter(Boolean) : []);
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(points[index - 1], points[index]);
  if (record.form === 'bezier' || record.form === 'hermite') length *= 1.35;
  return Math.max(length, 1);
}

function adaptiveCurveResolution(record) {
  const viewportScale = view.mode === '2d'
    ? view.zoom
    : (cameraView ? cameraView.height / (2 * Math.tan(Math.PI / 3.2 / 2) * (700 / Math.max(orbit.zoom, .35))) : orbit.zoom);
  const estimatedPixels = curveLengthEstimate(record) * Math.max(viewportScale, .1);
  return Math.max(48, Math.min(8192, Math.ceil(estimatedPixels / 3)));
}

function curveSamples(record, count = null) {
  const sampleCount = count || adaptiveCurveResolution(record);
  if (record.form === 'arc') return arcSamples(record, sampleCount);
  if (record.form === 'bspline' || record.form === 'nurbs') return bsplineSamples(record, sampleCount);
  const controlPoints = record.points || [];
  const points = [];
  if (record.form === 'bezier' && controlPoints.length === 4) {
    for (let i = 0; i <= sampleCount; i += 1) points.push(bezierPoint(controlPoints, i / sampleCount));
    return points;
  }
  if (record.form === 'hermite' && !controlPoints.length && record.start && record.end && record.tangentStart && record.tangentEnd) {
    for (let i = 0; i <= sampleCount; i += 1) points.push(hermitePoint(record, i / sampleCount));
    return points;
  }
  if (controlPoints.length < 2) return controlPoints.slice();
  for (let i = 0; i <= sampleCount; i += 1) points.push(catmullRomPoint(controlPoints, i / sampleCount));
  return points;
}

function cornersForRectangle(record) {
  const x = record.origin.x;
  const y = record.origin.y;
  const w = record.width;
  const h = record.height;
  return ensureWinding([makePoint(x, y), makePoint(x + w, y), makePoint(x + w, y + h), makePoint(x, y + h)], 'CCW');
}

function drawPath(ctx, points, projector, close = false) {
  if (!points.length) return;
  const first = projector(points[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = projector(points[i]);
    ctx.lineTo(point.x, point.y);
  }
  if (close) ctx.closePath();
  ctx.stroke();
}

function fillClosedPath2D(ctx, points, projector, colour, alpha) {
  if (points.length < 3) return;
  const first = projector(points[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = projector(points[index]);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fillStyle = colourCss(colour, alpha);
  ctx.fill();
}

function drawRecord2D(ctx, record, width, height, selected = false) {
  const project = point => screenFromWorld(point, width, height);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = selected ? colors.selected : record.color;
  ctx.lineWidth = selected ? 2.8 : 1.7;

  if (record.form === 'line' || record.form === 'polyline') drawPath(ctx, record.points, project);
  if (record.form === 'polygon' || record.form === 'slot') {
    const boundary = record.form === 'polygon' ? ensureWinding(record.points, 'CCW') : slotBoundary(record);
    fillClosedPath2D(ctx, boundary, project, selected ? colors.selected : record.color, selected ? .24 : .1);
    drawPath(ctx, boundary, project, true);
  }
  if (record.form === 'rectangle') {
    const corners = cornersForRectangle(record);
    fillClosedPath2D(ctx, corners, project, selected ? colors.selected : record.color, selected ? .24 : .1);
    drawPath(ctx, corners, project, true);
  }
  if (record.form === 'circle') {
    const center = project(record.center);
    ctx.beginPath(); ctx.arc(center.x, center.y, record.radius * view.zoom, 0, Math.PI * 2);
    ctx.fillStyle = colourCss(selected ? colors.selected : record.color, selected ? .24 : .1); ctx.fill(); ctx.stroke();
  }
  if (record.form === 'ellipse') {
    const center = project(record.center);
    ctx.beginPath(); ctx.ellipse(center.x, center.y, record.radiusX * view.zoom, record.radiusY * view.zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = colourCss(selected ? colors.selected : record.color, selected ? .24 : .1); ctx.fill(); ctx.stroke();
  }
  if (isCurveForm(record.form)) drawPath(ctx, curveSamples(record), project);
  ctx.restore();

  if (selected) drawRecordGuides2D(ctx, record, width, height);
}

function drawRecordGuides2D(ctx, record, width, height) {
  const project = point => screenFromWorld(point, width, height);
  const handles = guidePointsForRecord(record);
  if (!handles.length) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.48)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const pts = handles.map(project);
  if (record.form === 'bezier' || record.form === 'hermite') {
    ctx.beginPath();
    if (record.form === 'bezier') {
      if (pts[1]) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); }
      if (pts[3] && pts[2]) { ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); }
    } else if (pts[1]) {
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
      if (pts[3] && pts[2]) { ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); }
    }
    ctx.stroke();
  }
  if (['bspline', 'nurbs', 'spline'].includes(record.form) && pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let index = 1; index < pts.length; index += 1) ctx.lineTo(pts[index].x, pts[index].y);
    ctx.stroke();
  }
  if (record.form === 'ellipse') {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
    ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[2].x, pts[2].y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  pts.forEach((point, index) => {
    const picked = pickedControlPoint && pickedControlPoint.recordId === record.id && pickedControlPoint.index === index;
    ctx.beginPath();
    ctx.arc(point.x, point.y, picked ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = picked ? colors.vertexPicked : colors.vertex;
    ctx.fill();
  });
  ctx.restore();
}

function planeCorners2D(plane) {
  const halfW = plane.width / 2;
  const halfH = plane.height / 2;
  const angle = (plane.twist || 0) * Math.PI / 180;
  const local = [makePoint(-halfW, -halfH), makePoint(halfW, -halfH), makePoint(halfW, halfH), makePoint(-halfW, halfH)];
  const corners = local.map(point => makePoint(
    plane.center.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    plane.center.y + point.x * Math.sin(angle) + point.y * Math.cos(angle)
  ));
  return ensureWinding(corners, 'CCW');
}

function drawPlane2D(ctx, plane, width, height, selected = false) {
  const project = point => screenFromWorld(point, width, height);
  const corners = planeCorners2D(plane).map(project);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = selected ? colourCss(colors.selected, .24) : colourCss(colors.cyan, .045);
  ctx.fill();
  ctx.strokeStyle = selected ? colors.selected : 'rgba(142,180,196,.62)';
  ctx.lineWidth = selected ? 2.8 : 1;
  ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
  const center = project(plane.center);
  ctx.fillStyle = selected ? colors.selected : colors.cyan;
  ctx.font = '9px SFMono-Regular, Consolas, monospace';
  ctx.fillText(plane.name.toUpperCase(), center.x + 8, center.y - 8);
  ctx.beginPath(); ctx.arc(center.x, center.y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPreview2D(ctx, width, height) {
  if (!sketch.points.length && !sketch.preview) return;
  const points = sketch.points.slice();
  if (sketch.preview) points.push(sketch.preview);
  const project = point => screenFromWorld(point, width, height);
  ctx.save();
  ctx.strokeStyle = activeTool === 'plane' ? colors.cyan : (isCurveForm(activeTool) ? colors.pink : colors.acid);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);

  if (activeTool === 'line' && points.length >= 1) drawPath(ctx, points.slice(0, 2), project);
  if (activeTool === 'polyline' && points.length >= 1) drawPath(ctx, points, project);
  if (activeTool === 'rectangle' && points.length >= 1) {
    const a = points[0]; const b = points[1] || points[0];
    const corners = ensureWinding([a, makePoint(b.x, a.y), b, makePoint(a.x, b.y)], 'CCW');
    fillClosedPath2D(ctx, corners, project, colors.acid, .08);
    drawPath(ctx, corners, project, true);
  }
  if (activeTool === 'circle' && points.length >= 1) {
    const center = project(points[0]); const radius = points[1] ? distance(points[0], points[1]) * view.zoom : 0;
    ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.fillStyle = colourCss(colors.acid, .08); ctx.fill(); ctx.stroke();
  }
  if (activeTool === 'ellipse' && points.length >= 1) {
    const center = project(points[0]); const second = points[1] || points[0];
    ctx.beginPath(); ctx.ellipse(center.x, center.y, Math.abs(second.x - points[0].x) * view.zoom, Math.abs(second.y - points[0].y) * view.zoom, 0, 0, Math.PI * 2); ctx.fillStyle = colourCss(colors.acid, .08); ctx.fill(); ctx.stroke();
  }
  if (activeTool === 'polygon' && points.length >= 1) {
    const boundary = ensureWinding(points, 'CCW');
    if (boundary.length >= 3) fillClosedPath2D(ctx, boundary, project, colors.acid, .08);
    drawPath(ctx, boundary, project, boundary.length >= 3);
  }
  if (activeTool === 'slot' && points.length >= 1) {
    if (points.length >= 3) {
      const boundary = slotBoundary(slotRecordFromPoints(points.slice(0, 3)));
      fillClosedPath2D(ctx, boundary, project, colors.acid, .08);
      drawPath(ctx, boundary, project, true);
    } else drawPath(ctx, points, project);
  }
  if (activeTool === 'arc' && points.length >= 1) {
    if (points.length >= 3) drawPath(ctx, arcSamples(arcRecordFromPoints(points.slice(0, 3))), project);
    else drawPath(ctx, points, project);
  }
  if (['bezier', 'hermite', 'bspline', 'nurbs', 'spline'].includes(activeTool) && points.length >= 1) {
    points.forEach(point => { const p = project(point); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
    if (points.length >= 2) {
      if ((activeTool === 'bezier' || activeTool === 'hermite') && points.length <= 4) {
        ctx.beginPath(); ctx.moveTo(project(points[0]).x, project(points[0]).y); ctx.lineTo(project(points[1]).x, project(points[1]).y); ctx.stroke();
        if (activeTool === 'bezier' && points[3] && points[2]) {
          ctx.beginPath(); ctx.moveTo(project(points[2]).x, project(points[2]).y); ctx.lineTo(project(points[3]).x, project(points[3]).y); ctx.stroke();
        }
        if (activeTool === 'hermite' && points[2]) {
          ctx.beginPath(); ctx.moveTo(project(points[0]).x, project(points[0]).y); ctx.lineTo(project(points[2]).x, project(points[2]).y); ctx.stroke();
          if (points[3]) { ctx.beginPath(); ctx.moveTo(project(points[1]).x, project(points[1]).y); ctx.lineTo(project(points[3]).x, project(points[3]).y); ctx.stroke(); }
        }
      }
      ctx.setLineDash([]);
      drawPath(ctx, curveSamples(curveRecordFromPoints(activeTool, points)), project);
      ctx.setLineDash([5, 4]);
    }
  }
  if (activeTool === 'plane' && points.length >= 1) {
    const plane = {
      id: 'preview-plane', name: 'Plane', form: 'plane', center: points[0],
      width: 160, height: 100, elevation: 0, twist: 0, tiltX: 0, tiltY: 0, color: colors.cyan
    };
    drawPlane2D(ctx, plane, width, height, false);
  }
  ctx.restore();
}

function render2D() {
  const { ctx, width, height } = resizeCanvas(draftCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);
  scene.planes.forEach(plane => drawPlane2D(ctx, plane, width, height, plane.id === selectedId));
  scene.records.forEach(record => drawRecord2D(ctx, record, width, height, record.id === selectedId));
  drawPreview2D(ctx, width, height);
}

function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale3(a, factor) { return { x: a.x * factor, y: a.y * factor, z: a.z * factor }; }
function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross3(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function normalize3(a) {
  const size = Math.hypot(a.x, a.y, a.z) || 1;
  return scale3(a, 1 / size);
}

function mat4Multiply(a, b) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return result;
}

function perspectiveMatrix(fieldOfView, aspect, near, far, webGpuDepth = false) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const range = near - far;
  const result = new Float32Array(16);
  result[0] = f / aspect;
  result[5] = f;
  result[10] = webGpuDepth ? far / range : (far + near) / range;
  result[11] = -1;
  result[14] = webGpuDepth ? (far * near) / range : (2 * far * near) / range;
  return result;
}

function lookAtMatrix(eye, centre, up) {
  const z = normalize3(sub3(eye, centre));
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  const result = new Float32Array(16);
  // WebGPU consumes column-major matrices. These are the camera basis rows
  // laid out for transformPoint(), with world Z kept as the up direction.
  result[0] = x.x; result[1] = y.x; result[2] = z.x; result[3] = 0;
  result[4] = x.y; result[5] = y.y; result[6] = z.y; result[7] = 0;
  result[8] = x.z; result[9] = y.z; result[10] = z.z; result[11] = 0;
  result[12] = -dot3(x, eye); result[13] = -dot3(y, eye); result[14] = -dot3(z, eye); result[15] = 1;
  return result;
}

function invertMatrix(matrix) {
  const result = new Float32Array(16);
  const a00 = matrix[0]; const a01 = matrix[1]; const a02 = matrix[2]; const a03 = matrix[3];
  const a10 = matrix[4]; const a11 = matrix[5]; const a12 = matrix[6]; const a13 = matrix[7];
  const a20 = matrix[8]; const a21 = matrix[9]; const a22 = matrix[10]; const a23 = matrix[11];
  const a30 = matrix[12]; const a31 = matrix[13]; const a32 = matrix[14]; const a33 = matrix[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!determinant) return null;
  determinant = 1 / determinant;
  result[0] = (a11 * b11 - a12 * b10 + a13 * b09) * determinant;
  result[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * determinant;
  result[2] = (a31 * b05 - a32 * b04 + a33 * b03) * determinant;
  result[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * determinant;
  result[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * determinant;
  result[5] = (a00 * b11 - a02 * b08 + a03 * b07) * determinant;
  result[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * determinant;
  result[7] = (a20 * b05 - a22 * b02 + a23 * b01) * determinant;
  result[8] = (a10 * b10 - a11 * b08 + a13 * b06) * determinant;
  result[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * determinant;
  result[10] = (a30 * b04 - a31 * b02 + a33 * b00) * determinant;
  result[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * determinant;
  result[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * determinant;
  result[13] = (a00 * b09 - a01 * b07 + a02 * b06) * determinant;
  result[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * determinant;
  result[15] = (a20 * b03 - a21 * b01 + a22 * b00) * determinant;
  return result;
}

function transformPoint(matrix, point) {
  const x = point.x; const y = point.y; const z = point.z; const w = point.w === undefined ? 1 : point.w;
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w
  };
}

function planeLocalToWorld(point, plane) {
  if (!plane) return { x: point.x, y: point.y, z: point.z || 0 };
  const twist = (plane.twist || 0) * Math.PI / 180;
  const tiltX = (plane.tiltX || 0) * Math.PI / 180;
  const tiltY = (plane.tiltY || 0) * Math.PI / 180;
  const xTilt = {
    x: point.x * Math.cos(tiltY) + (point.z || 0) * Math.sin(tiltY),
    y: point.y,
    z: -point.x * Math.sin(tiltY) + (point.z || 0) * Math.cos(tiltY)
  };
  const yTilt = {
    x: xTilt.x,
    y: xTilt.y * Math.cos(tiltX) - xTilt.z * Math.sin(tiltX),
    z: xTilt.y * Math.sin(tiltX) + xTilt.z * Math.cos(tiltX)
  };
  return {
    x: plane.center.x + yTilt.x * Math.cos(twist) - yTilt.y * Math.sin(twist),
    y: plane.center.y + yTilt.x * Math.sin(twist) + yTilt.y * Math.cos(twist),
    z: plane.elevation + yTilt.z
  };
}

function worldToPlaneLocal(point, plane) {
  if (!plane) return makePoint(point.x, point.y);
  const twist = (plane.twist || 0) * Math.PI / 180;
  const tiltX = (plane.tiltX || 0) * Math.PI / 180;
  const tiltY = (plane.tiltY || 0) * Math.PI / 180;
  const x = point.x - plane.center.x;
  const y = point.y - plane.center.y;
  const z = point.z - plane.elevation;
  const twistedX = x * Math.cos(twist) + y * Math.sin(twist);
  const twistedY = -x * Math.sin(twist) + y * Math.cos(twist);
  const undoneX = twistedX * Math.cos(tiltY) - (twistedY * Math.sin(tiltX) + z * Math.cos(tiltX)) * Math.sin(tiltY);
  const undoneY = twistedY * Math.cos(tiltX) + z * Math.sin(tiltX);
  return makePoint(undoneX, undoneY);
}

function planeWorldNormal(plane) {
  const origin = planeLocalToWorld({ x: 0, y: 0, z: 0 }, plane);
  const tip = planeLocalToWorld({ x: 0, y: 0, z: 1 }, plane);
  return normalize3(sub3(tip, origin));
}

function planeCorners3D(plane) {
  const halfW = plane.width / 2;
  const halfH = plane.height / 2;
  const localCorners = ensureWinding([
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH }
  ], 'CCW');
  return localCorners.map(point => planeLocalToWorld({ x: point.x, y: point.y, z: 0 }, plane));
}

function recordPoint3D(record, point) {
  const plane = scene.planes.find(item => item.id === record.planeId) || null;
  const world = planeLocalToWorld({ x: point.x, y: point.y, z: 0 }, plane);
  const offset = record.gizmoOffset || { x: 0, y: 0, z: 0 };
  return { x: world.x + (Number(offset.x) || 0), y: world.y + (Number(offset.y) || 0), z: world.z + (Number(offset.z) || 0) };
}

function recordPoints3D(record) {
  if (record.form === 'line' || record.form === 'polyline') return record.points.map(point => recordPoint3D(record, point));
  if (record.form === 'rectangle') return cornersForRectangle(record).map(point => recordPoint3D(record, point));
  if (record.form === 'circle') {
    const localPoints = [];
    for (let i = 0; i < 64; i += 1) { const angle = i / 64 * Math.PI * 2; localPoints.push({ x: record.center.x + Math.cos(angle) * record.radius, y: record.center.y + Math.sin(angle) * record.radius }); }
    const ordered = ensureWinding(localPoints, 'CCW');
    return ordered.map(point => recordPoint3D(record, point));
  }
  if (record.form === 'ellipse') {
    const localPoints = [];
    for (let i = 0; i < 64; i += 1) { const angle = i / 64 * Math.PI * 2; localPoints.push({ x: record.center.x + Math.cos(angle) * record.radiusX, y: record.center.y + Math.sin(angle) * record.radiusY }); }
    const ordered = ensureWinding(localPoints, 'CCW');
    return ordered.map(point => recordPoint3D(record, point));
  }
  if (record.form === 'bezier' || record.form === 'hermite' || record.form === 'spline' || record.form === 'bspline' || record.form === 'nurbs' || record.form === 'arc') return curveSamples(record).map(point => recordPoint3D(record, point));
  if (record.form === 'polygon') return ensureWinding(record.points, 'CCW').map(point => recordPoint3D(record, point));
  if (record.form === 'slot') return slotBoundary(record).map(point => recordPoint3D(record, point));
  return [];
}

function controlPointMarkerBatches3D(record) {
  const controls = guidePointsForRecord(record);
  const basis = cameraScreenBasis();
  const fieldOfView = Math.PI / 3.2;
  return controls.map((control, index) => {
    const picked = pickedControlPoint && pickedControlPoint.recordId === record.id && pickedControlPoint.index === index;
    const surfacePoint = recordPoint3D(record, control);
    const toCamera = sub3(cameraView.eye, surfacePoint);
    const depth = Math.max(Math.hypot(toCamera.x, toCamera.y, toCamera.z), 1);
    const worldPerPixel = depth * 2 * Math.tan(fieldOfView / 2) / Math.max(cameraView.height, 1);
    const radius = worldPerPixel * (picked ? 6 : 4);
    // Move the billboard a few pixels toward the camera so it is not z-fighting
    // with the selected edge or face while keeping the projected vertex fixed.
    const center = add3(surfacePoint, scale3(normalize3(toCamera), worldPerPixel * 2));
    const rim = [];
    for (let step = 0; step < 16; step += 1) {
      const angle = step / 16 * Math.PI * 2;
      rim.push(add3(center, add3(scale3(basis.right, Math.cos(angle) * radius), scale3(basis.up, Math.sin(angle) * radius))));
    }
    const triangles = [];
    for (let step = 0; step < rim.length; step += 1) triangles.push(center, rim[step], rim[(step + 1) % rim.length]);
    return { triangles, colour: picked ? colors.vertexPicked : colors.vertex };
  });
}

function gizmoAxisDefinitions() {
  return [
    { name: 'x', dir: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, colour: colors.gizmoX, hover: colors.gizmoXHover, plane: colors.gizmoCyan },
    { name: 'y', dir: { x: 0, y: 1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, colour: colors.gizmoY, hover: colors.gizmoYHover, plane: colors.gizmoMagenta },
    { name: 'z', dir: { x: 0, y: 0, z: 1 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, colour: colors.gizmoZ, hover: colors.gizmoZHover, plane: colors.gizmoYellow }
  ];
}

function gizmoOriginForState() {
  if (!gizmoState || selectedId !== gizmoState.recordId) return null;
  const record = scene.records.find(item => item.id === gizmoState.recordId);
  const control = record && guidePointsForRecord(record)[gizmoState.index];
  return record && control ? recordPoint3D(record, control) : null;
}

function gizmoConeTriangles(origin, axis, u, v, baseDistance, tipDistance, radius) {
  const base = add3(origin, scale3(axis, baseDistance));
  const tip = add3(origin, scale3(axis, tipDistance));
  const triangles = [];
  const segments = 20;
  for (let step = 0; step < segments; step += 1) {
    const firstAngle = step / segments * Math.PI * 2;
    const nextAngle = (step + 1) / segments * Math.PI * 2;
    const first = add3(base, add3(scale3(u, Math.cos(firstAngle) * radius), scale3(v, Math.sin(firstAngle) * radius)));
    const next = add3(base, add3(scale3(u, Math.cos(nextAngle) * radius), scale3(v, Math.sin(nextAngle) * radius)));
    triangles.push(tip, first, next, base, next, first);
  }
  return triangles;
}

function gizmoCylinderTriangles(origin, axis, u, v, centreDistance, length, radius) {
  const start = add3(origin, scale3(axis, centreDistance - length / 2));
  const end = add3(origin, scale3(axis, centreDistance + length / 2));
  const triangles = [];
  const segments = 20;
  for (let step = 0; step < segments; step += 1) {
    const firstAngle = step / segments * Math.PI * 2;
    const nextAngle = (step + 1) / segments * Math.PI * 2;
    const startFirst = add3(start, add3(scale3(u, Math.cos(firstAngle) * radius), scale3(v, Math.sin(firstAngle) * radius)));
    const startNext = add3(start, add3(scale3(u, Math.cos(nextAngle) * radius), scale3(v, Math.sin(nextAngle) * radius)));
    const endFirst = add3(end, add3(scale3(u, Math.cos(firstAngle) * radius), scale3(v, Math.sin(firstAngle) * radius)));
    const endNext = add3(end, add3(scale3(u, Math.cos(nextAngle) * radius), scale3(v, Math.sin(nextAngle) * radius)));
    triangles.push(startFirst, endFirst, startNext, startNext, endFirst, endNext);
  }
  return triangles;
}

function gizmoArcTriangles(origin, u, v, innerRadius, outerRadius, sweep, segments) {
  const centre = Math.PI / 4;
  const start = centre - sweep / 2;
  const triangles = [];
  const pointAt = (radius, angle) => add3(origin, add3(scale3(u, Math.cos(angle) * radius), scale3(v, Math.sin(angle) * radius)));
  for (let step = 0; step < segments; step += 1) {
    const firstAngle = start + sweep * step / segments;
    const nextAngle = start + sweep * (step + 1) / segments;
    const innerFirst = pointAt(innerRadius, firstAngle);
    const outerFirst = pointAt(outerRadius, firstAngle);
    const innerNext = pointAt(innerRadius, nextAngle);
    const outerNext = pointAt(outerRadius, nextAngle);
    triangles.push(innerFirst, outerFirst, innerNext, outerFirst, outerNext, innerNext);
  }
  return triangles;
}

function gizmoBillboardRingTriangles(origin) {
  const basis = cameraScreenBasis();
  const toCamera = normalize3(sub3(cameraView.eye, origin));
  const depth = Math.max(Math.hypot(toCamera.x, toCamera.y, toCamera.z), 1);
  const worldPerPixel = depth * 2 * Math.tan(Math.PI / 3.2 / 2) / Math.max(cameraView.height, 1);
  const centre = add3(origin, scale3(toCamera, worldPerPixel * 2));
  const radius = Math.max(45 * .16, worldPerPixel * 8);
  const band = Math.max(45 * .008, worldPerPixel * 1.1);
  const innerRadius = Math.max(radius - band, worldPerPixel * 2);
  const outerRadius = radius + band;
  const triangles = [];
  const segments = 40;
  for (let step = 0; step < segments; step += 1) {
    const firstAngle = step / segments * Math.PI * 2;
    const nextAngle = (step + 1) / segments * Math.PI * 2;
    const innerFirst = add3(centre, add3(scale3(basis.right, Math.cos(firstAngle) * innerRadius), scale3(basis.up, Math.sin(firstAngle) * innerRadius)));
    const outerFirst = add3(centre, add3(scale3(basis.right, Math.cos(firstAngle) * outerRadius), scale3(basis.up, Math.sin(firstAngle) * outerRadius)));
    const innerNext = add3(centre, add3(scale3(basis.right, Math.cos(nextAngle) * innerRadius), scale3(basis.up, Math.sin(nextAngle) * innerRadius)));
    const outerNext = add3(centre, add3(scale3(basis.right, Math.cos(nextAngle) * outerRadius), scale3(basis.up, Math.sin(nextAngle) * outerRadius)));
    triangles.push(innerFirst, outerFirst, innerNext, outerFirst, outerNext, innerNext);
  }
  return triangles;
}

function gizmoGeometry() {
  const origin = gizmoOriginForState();
  if (!origin || !cameraView) return null;
  const length = 45;
  const tip = length * .95;
  const radius = length * .06;
  const fillBatches = [];
  const lineBatches = [];
  gizmoAxisDefinitions().forEach(axis => {
    const colour = gizmoHoverAxis === axis.name ? axis.hover : axis.colour;
    fillBatches.push({ triangles: gizmoConeTriangles(origin, axis.dir, axis.u, axis.v, tip - length * .1, tip + length * .09, radius), colour, alpha: 1 });
    fillBatches.push({ triangles: gizmoCylinderTriangles(origin, axis.dir, axis.u, axis.v, tip - length * .28, length * .14, radius), colour, alpha: 1 });

    const half = length * .08;
    const planeCentre = add3(origin, scale3(add3(axis.u, axis.v), tip - half));
    const planeCorners = [
      add3(planeCentre, add3(scale3(axis.u, -half), scale3(axis.v, -half))),
      add3(planeCentre, add3(scale3(axis.u, half), scale3(axis.v, -half))),
      add3(planeCentre, add3(scale3(axis.u, half), scale3(axis.v, half))),
      add3(planeCentre, add3(scale3(axis.u, -half), scale3(axis.v, half)))
    ];
    // Keep the reference's translucent plane handle, but use a conservative
    // alpha and no depth writes so it cannot obscure the sketch face beneath it.
    fillBatches.push({ triangles: [planeCorners[0], planeCorners[1], planeCorners[2], planeCorners[0], planeCorners[2], planeCorners[3]], colour: axis.plane, alpha: .18 });
    lineBatches.push({ points: planeCorners, colour: axis.plane, alpha: .95, close: true });

    fillBatches.push({ triangles: gizmoArcTriangles(origin, axis.u, axis.v, length * .62 - length * .038, length * .62 + length * .038, 31 * Math.PI / 180, 24), colour, alpha: 1 });
  });
  fillBatches.push({ triangles: gizmoBillboardRingTriangles(origin), colour: '#ffffff', alpha: 1 });
  return { fillBatches, lineBatches };
}

function renderGizmoWebGPU(pass) {
  const geometry = gizmoGeometry();
  if (!geometry) return;
  geometry.fillBatches.forEach(batch => gpuDrawVertices(pass, pairVertexPacket(batch.triangles), batch.colour, batch.alpha, true, true));
  geometry.lineBatches.forEach(batch => gpuDrawVertices(pass, lineVertexPacket(batch.points, batch.close), batch.colour, batch.alpha, false, true));
}

function renderGizmoWebGL() {
  const geometry = gizmoGeometry();
  if (!geometry) return;
  gl.disable(gl.DEPTH_TEST);
  geometry.fillBatches.forEach(batch => glDraw(batch.triangles, gl.TRIANGLES, batch.colour, cameraView.matrix, batch.alpha));
  geometry.lineBatches.forEach(batch => glDraw(batch.points, gl.LINE_STRIP, batch.colour, cameraView.matrix, batch.alpha, batch.close));
  gl.enable(gl.DEPTH_TEST);
}

function findGizmoHandleAtScene(screenPoint) {
  const origin = gizmoOriginForState();
  if (!origin || !cameraView) return null;
  const projectedOrigin = projectWorld(origin);
  let best = null;
  gizmoAxisDefinitions().forEach(axis => {
    const projectedTip = projectWorld(add3(origin, scale3(axis.dir, 45 * 1.08)));
    const dx = projectedTip.x - projectedOrigin.x;
    const dy = projectedTip.y - projectedOrigin.y;
    const length = Math.hypot(dx, dy);
    const along = length ? ((screenPoint.x - projectedOrigin.x) * dx + (screenPoint.y - projectedOrigin.y) * dy) / (length * length) : 0;
    const distanceToAxis = screenSegmentDistance(screenPoint, projectedOrigin, projectedTip);
    const distanceToOrigin = Math.hypot(screenPoint.x - projectedOrigin.x, screenPoint.y - projectedOrigin.y);
    const foreshortened = length < 18 && distanceToOrigin >= 9 && distanceToOrigin <= 14;
    const onHandle = foreshortened || (along >= .38 && along <= 1.08 && distanceToAxis <= 12);
    if (onHandle && (!best || distanceToAxis < best.distance)) best = { axis: axis.name, dir: axis.dir, distance: distanceToAxis };
  });
  return best;
}

function axisParameterAtScreen(screenPoint, origin, axis) {
  const ray = sceneRay(screenPoint);
  const w0 = sub3(origin, ray.origin);
  const a = dot3(axis, axis);
  const b = dot3(axis, ray.direction);
  const c = dot3(ray.direction, ray.direction);
  const d = dot3(axis, w0);
  const e = dot3(ray.direction, w0);
  const denominator = a * c - b * b;
  if (Math.abs(denominator) < 0.000001) return null;
  return (b * e - c * d) / denominator;
}

function beginGizmoAxisDrag(handle, event) {
  const origin = gizmoOriginForState();
  if (!origin) return false;
  const parameter = axisParameterAtScreen(pointerPosition(event, sceneCanvas), origin, handle.dir);
  if (parameter === null) return false;
  const record = scene.records.find(item => item.id === gizmoState.recordId);
  if (!record) return false;
  gizmoDrag = {
    recordId: record.id,
    index: gizmoState.index,
    axis: handle.axis,
    dir: handle.dir,
    origin,
    startParameter: parameter,
    startOffsetZ: Number(record.gizmoOffset?.z) || 0,
    pointerId: event.pointerId
  };
  gizmoHoverAxis = handle.axis;
  saveSnapshot();
  sceneCanvas.setPointerCapture(event.pointerId);
  return true;
}

function updateGuideWithGizmo(record, index, axis, delta, startWorld, startOffsetZ) {
  if (axis === 'z') {
    record.gizmoOffset = { ...(record.gizmoOffset || {}), z: startOffsetZ + delta };
    return;
  }
  const targetWorld = add3(startWorld, scale3(axis === 'x' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }, delta));
  const offset = record.gizmoOffset || { x: 0, y: 0, z: 0 };
  const unoffsetWorld = { x: targetWorld.x - (Number(offset.x) || 0), y: targetWorld.y - (Number(offset.y) || 0), z: targetWorld.z - (Number(offset.z) || 0) };
  const plane = scene.planes.find(item => item.id === record.planeId) || null;
  updateGuidePoint(record, index, plane ? worldToPlaneLocal(unoffsetWorld, plane) : makePoint(unoffsetWorld.x, unoffsetWorld.y));
}

function updateGizmoDrag(event) {
  if (!gizmoDrag || gizmoDrag.pointerId !== event.pointerId) return;
  const current = axisParameterAtScreen(pointerPosition(event, sceneCanvas), gizmoDrag.origin, gizmoDrag.dir);
  const record = scene.records.find(item => item.id === gizmoDrag.recordId);
  if (current === null || !record) return;
  let delta = current - gizmoDrag.startParameter;
  if (event.ctrlKey) delta = Math.round(delta / Math.max(view.snapSize, .0001)) * view.snapSize;
  updateGuideWithGizmo(record, gizmoDrag.index, gizmoDrag.axis, delta, gizmoDrag.origin, gizmoDrag.startOffsetZ);
  pickedControlPoint = { recordId: record.id, index: gizmoDrag.index };
  renderAll();
}

function colourVector(hex, alpha = 1) {
  const clean = String(hex || '#a5bac5').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean;
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255, alpha];
}

function colourCss(hex, alpha = 1) {
  const [red, green, blue] = colourVector(hex, alpha);
  return `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${alpha})`;
}

function glDraw(points, mode, colour, matrix, alpha = 1, close = false) {
  if (!gl || !glProgram || !points.length) return;
  const vertices = points.slice();
  if (close && points.length > 1) vertices.push(points[0]);
  const packed = new Float32Array(vertices.length * 3);
  vertices.forEach((point, index) => { packed[index * 3] = point.x; packed[index * 3 + 1] = point.y; packed[index * 3 + 2] = point.z; });
  const storage = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, storage);
  gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STREAM_DRAW);
  gl.useProgram(glProgram);
  gl.enableVertexAttribArray(glPosition);
  gl.vertexAttribPointer(glPosition, 3, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(glMatrix, false, matrix);
  gl.uniform4fv(glColor, new Float32Array([...colourVector(colour, alpha)]));
  gl.drawArrays(mode, 0, vertices.length);
  gl.deleteBuffer(storage);
}

function cameraMatrices(width, height, webGpuDepth = false) {
  const target = orbit.target;
  const distanceFromTarget = 700 / orbit.zoom;
  const eye = {
    x: target.x + Math.cos(orbit.pitch) * Math.cos(orbit.yaw) * distanceFromTarget,
    y: target.y + Math.cos(orbit.pitch) * Math.sin(orbit.yaw) * distanceFromTarget,
    z: target.z + Math.sin(orbit.pitch) * distanceFromTarget
  };
  const projection = perspectiveMatrix(Math.PI / 3.2, width / Math.max(height, 1), .1, 5000, webGpuDepth);
  const look = lookAtMatrix(eye, target, { x: 0, y: 0, z: 1 });
  const matrix = mat4Multiply(projection, look);
  return { matrix, inverse: invertMatrix(matrix), eye, width, height };
}

function projectWorld(point) {
  const clip = transformPoint(cameraView.matrix, point);
  const reciprocal = clip.w || 1;
  return {
    x: (clip.x / reciprocal * .5 + .5) * cameraView.width,
    y: (1 - (clip.y / reciprocal * .5 + .5)) * cameraView.height,
    depth: clip.z / reciprocal
  };
}

function unprojectScreen(screenPoint, clipZ) {
  const rect = sceneCanvas.getBoundingClientRect();
  const x = screenPoint.x / rect.width * 2 - 1;
  const y = 1 - screenPoint.y / rect.height * 2;
  const clip = transformPoint(cameraView.inverse, { x, y, z: clipZ, w: 1 });
  const reciprocal = clip.w || 1;
  return { x: clip.x / reciprocal, y: clip.y / reciprocal, z: clip.z / reciprocal };
}

function sceneRay(screenPoint) {
  const near = unprojectScreen(screenPoint, gpuRenderer.ready ? 0 : -1);
  const far = unprojectScreen(screenPoint, 1);
  return { origin: near, direction: normalize3(sub3(far, near)) };
}

function rayPlaneHit(ray, plane) {
  const origin = plane ? planeLocalToWorld({ x: 0, y: 0, z: 0 }, plane) : { x: 0, y: 0, z: 0 };
  const normal = plane ? planeWorldNormal(plane) : { x: 0, y: 0, z: 1 };
  const denominator = dot3(normal, ray.direction);
  if (Math.abs(denominator) < 0.00001) return null;
  const distanceAlongRay = dot3(sub3(origin, ray.origin), normal) / denominator;
  if (distanceAlongRay < 0) return null;
  return add3(ray.origin, scale3(ray.direction, distanceAlongRay));
}

function activePlane() {
  const directPlane = scene.planes.find(plane => plane.id === selectedId);
  if (directPlane) return directPlane;
  const selectedRecord = scene.records.find(record => record.id === selectedId);
  return selectedRecord?.planeId ? scene.planes.find(plane => plane.id === selectedRecord.planeId) || null : null;
}

function sceneSnapPoint(point, event) {
  const plane = activePlane();
  const planeId = plane?.id || null;
  const records = snapRecordsForPlane(planeId);
  const rect = sceneCanvas.getBoundingClientRect();
  const worldPerPixel = (700 / Math.max(orbit.zoom, .35)) * (2 * Math.tan(Math.PI / 3.2 / 2)) / Math.max(rect.height, 1);
  return snapPoint(point, {
    records,
    planes: plane ? [plane] : [],
    ctrlKey: Boolean(event.ctrlKey),
    altKey: Boolean(event.altKey),
    grid: view.snap && !event.ctrlKey && !event.altKey,
    gridSize: view.snapSize,
    threshold: 14 * worldPerPixel
  });
}

function scenePointForEvent(event) {
  const screenPoint = pointerPosition(event, sceneCanvas);
  const plane = activePlane();
  const hit = rayPlaneHit(sceneRay(screenPoint), plane);
  if (!hit) return null;
  const local = worldToPlaneLocal(hit, plane);
  return {
    world: hit,
    local: activeTool === 'select' ? local : sceneSnapPoint(local, event)
  };
}

function screenSegmentDistance(point, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const intersects = ((polygon[i].y > point.y) !== (polygon[j].y > point.y)) && point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function selectAtScene(screenPoint) {
  for (let i = scene.planes.length - 1; i >= 0; i -= 1) {
    const polygon = planeCorners3D(scene.planes[i]).map(projectWorld);
    if (pointInPolygon(screenPoint, polygon)) { selectedId = scene.planes[i].id; return true; }
  }
  for (let i = scene.records.length - 1; i >= 0; i -= 1) {
    const record = scene.records[i];
    const projected = recordPoints3D(record).map(projectWorld);
    if (isClosedForm(record.form) && projected.length >= 3 && pointInPolygon(screenPoint, projected)) { selectedId = record.id; return true; }
    for (let index = 1; index < projected.length; index += 1) {
      if (screenSegmentDistance(screenPoint, projected[index - 1], projected[index]) < 10) { selectedId = record.id; return true; }
    }
  }
  selectedId = null;
  return false;
}

function draw3Grid() {
  const points = [];
  const extent = 240;
  const step = 20;
  for (let coordinate = -extent; coordinate <= extent; coordinate += step) {
    points.push({ x: coordinate, y: -extent, z: -0.35 }, { x: coordinate, y: extent, z: -0.35 });
    points.push({ x: -extent, y: coordinate, z: -0.35 }, { x: extent, y: coordinate, z: -0.35 });
  }
  glDraw(points, gl.LINES, '#2a3033', cameraView.matrix, .7);
}

function draw3Axes() {
  glDraw([{ x: 0, y: 0, z: 0 }, { x: 120, y: 0, z: 0 }], gl.LINES, '#a0a0a0', cameraView.matrix, .95);
  glDraw([{ x: 0, y: 0, z: 0 }, { x: 0, y: 120, z: 0 }], gl.LINES, '#858585', cameraView.matrix, .95);
  glDraw([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 120 }], gl.LINES, '#6e6e6e', cameraView.matrix, .95);
}

function draw3Plane(plane, selected) {
  const corners = planeCorners3D(plane);
  glDraw(triangulatePolygon(corners), gl.TRIANGLES, selected ? colors.selected : '#6f8c98', cameraView.matrix, selected ? .24 : .08);
  glDraw(corners, gl.LINE_STRIP, selected ? colors.selected : '#8eb4c4', cameraView.matrix, selected ? 1 : .75, true);
}

function previewRecord3D() {
  const points = sketch.points.slice();
  if (sketch.preview) points.push(sketch.preview);
  if (!points.length) return null;
  const planeId = activePlane()?.id || null;
  if (activeTool === 'line' || activeTool === 'polyline') return { form: activeTool, points, planeId };
  if (activeTool === 'rectangle' && points.length >= 1) {
    const a = points[0]; const b = points[1] || points[0];
    return { form: 'rectangle', origin: makePoint(Math.min(a.x, b.x), Math.min(a.y, b.y)), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), planeId };
  }
  if (activeTool === 'circle' && points.length >= 1) return { form: 'circle', center: points[0], radius: points[1] ? distance(points[0], points[1]) : 0, planeId };
  if (activeTool === 'ellipse' && points.length >= 1) return { form: 'ellipse', center: points[0], radiusX: Math.abs((points[1] || points[0]).x - points[0].x), radiusY: Math.abs((points[1] || points[0]).y - points[0].y), planeId };
  if (activeTool === 'arc') return points.length >= 3 ? { ...arcRecordFromPoints(points.slice(0, 3), planeId), planeId } : { form: 'polyline', points, planeId };
  if (activeTool === 'slot') return points.length >= 3 ? slotRecordFromPoints(points.slice(0, 3), planeId) : { form: 'polyline', points, planeId };
  if (activeTool === 'polygon' && points.length >= 2) return { form: 'polygon', points: ensureWinding(points, 'CCW'), planeId, winding: 'CCW' };
  if (['bezier', 'hermite', 'bspline', 'nurbs', 'spline'].includes(activeTool) && points.length >= 2) return curveRecordFromPoints(activeTool, points, planeId);
  return null;
}

let gpuFrameBuffers = [];

function gpuWriteUniforms(matrix, colour, alpha) {
  const uniformBuffer = gpuRenderer.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  gpuRenderer.device.queue.writeBuffer(uniformBuffer, 0, matrix.buffer, matrix.byteOffset, matrix.byteLength);
  const tint = new Float32Array(colourVector(colour, alpha));
  gpuRenderer.device.queue.writeBuffer(uniformBuffer, 64, tint.buffer, tint.byteOffset, tint.byteLength);
  const bindGroup = gpuRenderer.device.createBindGroup({
    layout: gpuRenderer.layout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
  });
  gpuFrameBuffers.push(uniformBuffer);
  return bindGroup;
}

function gpuDrawVertices(pass, packed, colour, alpha, fill = false, overlay = false) {
  if (!packed.length) return;
  const vertexBuffer = gpuRenderer.device.createBuffer({ size: packed.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  gpuRenderer.device.queue.writeBuffer(vertexBuffer, 0, packed.buffer, packed.byteOffset, packed.byteLength);
  const bindGroup = gpuWriteUniforms(cameraView.matrix, colour, alpha);
  const pipeline = overlay
    ? (fill ? gpuRenderer.gizmoFillPipeline : gpuRenderer.gizmoPipeline)
    : (fill ? gpuRenderer.fillPipeline : gpuRenderer.pipeline);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(packed.length / 3);
  gpuFrameBuffers.push(vertexBuffer);
}

function renderWebGPU() {
  const size = resizeCanvas(sceneCanvas, false);
  if (gpuRenderer.width !== sceneCanvas.width || gpuRenderer.height !== sceneCanvas.height) {
    gpuRenderer.context.configure({ device: gpuRenderer.device, format: gpuRenderer.format, alphaMode: 'opaque' });
    gpuRenderer.width = sceneCanvas.width;
    gpuRenderer.height = sceneCanvas.height;
  }
  cameraView = cameraMatrices(size.width, size.height, true);
  const device = gpuRenderer.device;
  const depthTexture = device.createTexture({ size: [sceneCanvas.width, sceneCanvas.height, 1], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  gpuFrameBuffers = [depthTexture];
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: gpuRenderer.context.getCurrentTexture().createView(), clearValue: { r: .063, g: .071, b: .075, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    depthStencilAttachment: { view: depthTexture.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
  });
  const grid = [];
  for (let coordinate = -240; coordinate <= 240; coordinate += 20) {
    grid.push({ x: coordinate, y: -240, z: -.35 }, { x: coordinate, y: 240, z: -.35 });
    grid.push({ x: -240, y: coordinate, z: -.35 }, { x: 240, y: coordinate, z: -.35 });
  }
  gpuDrawVertices(pass, pairVertexPacket(grid), '#2a3033', .7);
  gpuDrawVertices(pass, lineVertexPacket([{ x: 0, y: 0, z: 0 }, { x: 120, y: 0, z: 0 }]), '#a0a0a0', .95);
  gpuDrawVertices(pass, lineVertexPacket([{ x: 0, y: 0, z: 0 }, { x: 0, y: 120, z: 0 }]), '#858585', .95);
  gpuDrawVertices(pass, lineVertexPacket([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 120 }]), '#6e6e6e', .95);
  scene.planes.slice().sort((a, b) => a.elevation - b.elevation).forEach(plane => {
    const corners = planeCorners3D(plane);
    gpuDrawVertices(pass, triangleVertexPacket(corners), plane.id === selectedId ? colors.selected : '#6f8c98', plane.id === selectedId ? .24 : .08, true);
    gpuDrawVertices(pass, lineVertexPacket(corners, true), plane.id === selectedId ? colors.selected : '#8eb4c4', plane.id === selectedId ? 1 : .75);
  });
  if (activeTool === 'plane' && sketch.previewWorld) {
    const previewPlane = { center: makePoint(sketch.previewWorld.x, sketch.previewWorld.y), width: 160, height: 100, elevation: sketch.previewWorld.z, twist: 0, tiltX: 0, tiltY: 0 };
    const corners = planeCorners3D(previewPlane);
    gpuDrawVertices(pass, triangleVertexPacket(corners), '#8eb4c4', .08, true);
    gpuDrawVertices(pass, lineVertexPacket(corners, true), '#a5bac5', .65);
  }
  scene.records.forEach(record => {
    const points = recordPoints3D(record);
    const closed = isClosedForm(record.form);
    const tint = record.id === selectedId ? colors.selected : record.color;
    if (closed) gpuDrawVertices(pass, triangleVertexPacket(points), tint, record.id === selectedId ? .24 : .1, true);
    gpuDrawVertices(pass, lineVertexPacket(points, closed), tint, record.id === selectedId ? 1 : .95);
    if (record.id === selectedId) controlPointMarkerBatches3D(record).forEach(marker => gpuDrawVertices(pass, pairVertexPacket(marker.triangles), marker.colour, 1, true));
  });
  const preview = previewRecord3D();
  if (preview) {
    const points = recordPoints3D(preview);
    const closed = isClosedForm(preview.form);
    if (closed) gpuDrawVertices(pass, triangleVertexPacket(points), '#c6d4da', .12, true);
    gpuDrawVertices(pass, lineVertexPacket(points, closed), '#c6d4da', .8);
  }
  renderGizmoWebGPU(pass);
  pass.end();
  const frameResources = gpuFrameBuffers.slice();
  gpuFrameBuffers = [];
  device.queue.submit([encoder.finish()]);
  device.queue.onSubmittedWorkDone().then(() => frameResources.forEach(resource => resource.destroy()));
}

function render3D() {
  if (gpuRenderer.ready) {
    renderWebGPU();
    return;
  }
  if (!gl) return;
  const size = resizeCanvas(sceneCanvas, false);
  gl.viewport(0, 0, sceneCanvas.width, sceneCanvas.height);
  gl.clearColor(0.063, 0.071, 0.075, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  cameraView = cameraMatrices(size.width, size.height, false);
  gl.lineWidth(1);
  draw3Grid();
  draw3Axes();
  scene.planes.slice().sort((a, b) => a.elevation - b.elevation).forEach(plane => draw3Plane(plane, plane.id === selectedId));
  if (activeTool === 'plane' && sketch.previewWorld) {
    draw3Plane({ id: 'preview-plane', name: 'Plane', form: 'plane', center: makePoint(sketch.previewWorld.x, sketch.previewWorld.y), width: 160, height: 100, elevation: sketch.previewWorld.z, twist: 0, tiltX: 0, tiltY: 0 }, false);
  }
  scene.records.forEach(record => {
    const points = recordPoints3D(record);
    const closed = isClosedForm(record.form);
    const tint = record.id === selectedId ? colors.selected : record.color;
    if (closed) glDraw(triangulatePolygon(points), gl.TRIANGLES, tint, cameraView.matrix, record.id === selectedId ? .24 : .1);
    glDraw(points, gl.LINE_STRIP, tint, cameraView.matrix, record.id === selectedId ? 1 : .95, closed);
    if (record.id === selectedId) controlPointMarkerBatches3D(record).forEach(marker => glDraw(marker.triangles, gl.TRIANGLES, marker.colour, cameraView.matrix, 1));
  });
  const preview = previewRecord3D();
  if (preview) {
    const points = recordPoints3D(preview);
    const closed = isClosedForm(preview.form);
    if (closed) glDraw(triangulatePolygon(points), gl.TRIANGLES, '#c6d4da', cameraView.matrix, .12);
    glDraw(points, gl.LINE_STRIP, '#c6d4da', cameraView.matrix, .8, closed);
  }
  renderGizmoWebGL();
}

function renderAll() {
  resizeCanvas(draftCanvas);
  if (view.mode === '2d') render2D(); else render3D();
  renderSceneInspector();
  renderPropertiesInspector();
  geometryCount.textContent = `${scene.records.length} GEOMETRY`;
  planeCount.textContent = `${scene.planes.length} PLANES`;
  sceneCount.textContent = String(scene.records.length + scene.planes.length);
  snapStepReadout.textContent = String(view.snapSize);
  zoomReadout.textContent = view.mode === '2d' ? `${Math.round(view.zoom * 100)}%` : `${Math.round(orbit.zoom * 100)}%`;
  updateToolCopy();
  updateUndoButtons();
}

function addRecord(record) {
  saveSnapshot();
  scene.records.push(record);
  selectedId = record.id;
  sketch = { points: [], preview: null, previewWorld: null };
  shapeDrag = null;
  setMessage(`Created ${record.name}`);
}

function addPlaneAt(point) {
  saveSnapshot();
  const plane = makePlane(point);
  plane.elevation = Number(point.z) || 0;
  scene.planes.push(plane);
  selectedId = plane.id;
  sketch = { points: [], preview: null, previewWorld: null };
  shapeDrag = null;
  setMessage(`Created ${plane.name}`);
}

function finishDrawing() {
  const points = sketch.points.slice();
  if (activeTool === 'line' && points.length >= 2) addRecord(makeRecord('line', { points: points.slice(0, 2) }));
  if (activeTool === 'polyline' && points.length >= 2) addRecord(makeRecord('polyline', { points }));
  if (activeTool === 'rectangle' && points.length >= 2) {
    const a = points[0]; const b = points[1];
    addRecord(makeRecord('rectangle', { origin: makePoint(Math.min(a.x, b.x), Math.min(a.y, b.y)), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }));
  }
  if (activeTool === 'circle' && points.length >= 2) addRecord(makeRecord('circle', { center: points[0], radius: distance(points[0], points[1]) }));
  if (activeTool === 'ellipse' && points.length >= 2) addRecord(makeRecord('ellipse', { center: points[0], radiusX: Math.abs(points[1].x - points[0].x), radiusY: Math.abs(points[1].y - points[0].y) }));
  if (activeTool === 'polygon' && points.length >= 3) addRecord(makeRecord('polygon', { points: ensureWinding(points, 'CCW'), winding: 'CCW' }));
  if (activeTool === 'arc' && points.length >= 3) addRecord(makeRecord('arc', { ...arcRecordFromPoints(points.slice(0, 3), activePlane()?.id || null), winding: null }));
  if (activeTool === 'slot' && points.length >= 3) addRecord(makeRecord('slot', slotRecordFromPoints(points.slice(0, 3), activePlane()?.id || null)));
  if (activeTool === 'bezier' && points.length >= 2) addRecord(makeRecord('bezier', { points }));
  if (activeTool === 'hermite' && points.length >= 2) {
    if (points.length === 4) addRecord(makeRecord('hermite', { start: points[0], end: points[1], tangentStart: points[2], tangentEnd: points[3] }));
    else addRecord(makeRecord('hermite', { points }));
  }
  if (activeTool === 'bspline' && points.length >= 2) addRecord(makeRecord('bspline', { points, degree: Math.min(3, points.length - 1) }));
  if (activeTool === 'nurbs' && points.length >= 2) addRecord(makeRecord('nurbs', { points, degree: Math.min(3, points.length - 1), weights: points.map(() => 1) }));
  if (activeTool === 'spline' && points.length >= 2) addRecord(makeRecord('spline', { points }));
}

function pointToSegment(point, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1) : 0;
  return distance(point, makePoint(a.x + t * dx, a.y + t * dy));
}

function pointInsidePlane(point, plane) {
  const angle = -(plane.twist || 0) * Math.PI / 180;
  const dx = point.x - plane.center.x; const dy = point.y - plane.center.y;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(localX) <= plane.width / 2 && Math.abs(localY) <= plane.height / 2;
}

function hitRecord(point, record, threshold = 8) {
  if (record.form === 'line' || record.form === 'polyline') {
    for (let i = 1; i < record.points.length; i += 1) if (pointToSegment(point, record.points[i - 1], record.points[i]) <= threshold / view.zoom) return true;
  }
  if (record.form === 'rectangle' || record.form === 'polygon' || record.form === 'slot') {
    const corners = record.form === 'rectangle' ? cornersForRectangle(record) : (record.form === 'polygon' ? ensureWinding(record.points, 'CCW') : slotBoundary(record));
    if (corners.length >= 3 && pointInPolygon(point, corners)) return true;
    for (let i = 0; i < corners.length; i += 1) if (pointToSegment(point, corners[i], corners[(i + 1) % corners.length]) <= threshold / view.zoom) return true;
  }
  if (record.form === 'circle' && distance(point, record.center) <= record.radius + threshold / view.zoom) return true;
  if (record.form === 'ellipse') {
    const normalized = ((point.x - record.center.x) ** 2) / Math.max(record.radiusX ** 2, 0.0001) + ((point.y - record.center.y) ** 2) / Math.max(record.radiusY ** 2, 0.0001);
    if (normalized <= 1 + threshold / view.zoom) return true;
    const samples = recordPoints3D(record).map(item => makePoint(item.x, item.y));
    for (let i = 1; i < samples.length; i += 1) if (pointToSegment(point, samples[i - 1], samples[i]) <= threshold / view.zoom) return true;
  }
  if (isCurveForm(record.form)) {
    const samples = curveSamples(record);
    for (let i = 1; i < samples.length; i += 1) if (pointToSegment(point, samples[i - 1], samples[i]) <= threshold / view.zoom) return true;
  }
  return false;
}

function selectAt(point) {
  for (let i = scene.planes.length - 1; i >= 0; i -= 1) if (pointInsidePlane(point, scene.planes[i])) { selectedId = scene.planes[i].id; return; }
  for (let i = scene.records.length - 1; i >= 0; i -= 1) if (hitRecord(point, scene.records[i])) { selectedId = scene.records[i].id; return; }
  selectedId = null;
}

function pointerPosition(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return makePoint(event.clientX - rect.left, event.clientY - rect.top);
}

function updatePointerReadout(screenPoint) {
  const rect = draftCanvas.getBoundingClientRect();
  const world = rawWorldFromScreen(screenPoint, rect.width, rect.height);
  view.pointer = world;
  view.hasPointer = true;
  coordinateReadout.innerHTML = `X ${world.x.toFixed(2)} <span>·</span> Y ${world.y.toFixed(2)}`;
  crosshair.style.left = `${screenPoint.x}px`;
  crosshair.style.top = `${screenPoint.y}px`;
  crosshair.style.display = view.mode === '2d' && activeTool !== 'select' ? 'block' : 'none';
}

function findGuidePointAt2D(point) {
  const record = findSelected();
  if (!record || record.form === 'circle') return null;
  const handles = guidePointsForRecord(record);
  let best = null;
  handles.forEach((handle, index) => {
    const distanceToPoint = distance(point, handle);
    if (distanceToPoint <= 10 / view.zoom && (!best || distanceToPoint < best.distance)) best = { recordId: record.id, index, distance: distanceToPoint };
  });
  return best;
}

function findGuidePointAtScene(screenPoint) {
  const record = findSelected();
  if (!record || record.form === 'circle') return null;
  const handles = guidePointsForRecord(record);
  let best = null;
  handles.forEach((handle, index) => {
    const projected = projectWorld(recordPoint3D(record, handle));
    const distanceToPoint = Math.hypot(screenPoint.x - projected.x, screenPoint.y - projected.y);
    if (distanceToPoint <= 12 && (!best || distanceToPoint < best.distance)) best = { recordId: record.id, index, distance: distanceToPoint };
  });
  return best;
}

function updateGuidePoint(record, index, point) {
  if (record.form === 'hermite' && !record.points) {
    if (index === 0) record.start = point;
    if (index === 1) record.tangentStart = point;
    if (index === 2) record.tangentEnd = point;
    if (index === 3) record.end = point;
    return;
  }
  if (record.form === 'arc') {
    const next = record.points.slice();
    const gizmoOffset = record.gizmoOffset;
    next[index] = point;
    Object.assign(record, arcRecordFromPoints(next, record.planeId), { id: record.id, name: record.name, color: record.color });
    if (gizmoOffset) record.gizmoOffset = gizmoOffset;
    return;
  }
  if (record.form === 'slot') {
    const next = record.points.slice();
    const gizmoOffset = record.gizmoOffset;
    next[index] = point;
    Object.assign(record, slotRecordFromPoints(next, record.planeId), { id: record.id, name: record.name, color: record.color });
    if (gizmoOffset) record.gizmoOffset = gizmoOffset;
    return;
  }
  if (record.form === 'rectangle') {
    const x = record.origin.x; const y = record.origin.y;
    const maxX = x + record.width; const maxY = y + record.height;
    if (index === 0) Object.assign(record, { origin: makePoint(point.x, point.y), width: Math.max(1, maxX - point.x), height: Math.max(1, maxY - point.y) });
    if (index === 1) Object.assign(record, { origin: makePoint(x, point.y), width: Math.max(1, point.x - x), height: Math.max(1, maxY - point.y) });
    if (index === 2) Object.assign(record, { width: Math.max(1, point.x - x), height: Math.max(1, point.y - y) });
    if (index === 3) Object.assign(record, { origin: makePoint(point.x, y), width: Math.max(1, maxX - point.x), height: Math.max(1, point.y - y) });
    return;
  }
  if (record.form === 'ellipse') {
    if (index === 0) record.center = point;
    if (index === 1) record.radiusX = Math.max(1, Math.abs(point.x - record.center.x));
    if (index === 2) record.radiusY = Math.max(1, Math.abs(point.y - record.center.y));
    return;
  }
  if (record.points && record.points[index]) record.points[index] = point;
}

function normaliseSelectedWinding() {
  const record = findSelected();
  if (record?.form === 'polygon') record.points = ensureWinding(record.points, 'CCW');
}

function previewDraftEvent(event) {
  const position = pointerPosition(event, draftCanvas);
  const rect = draftCanvas.getBoundingClientRect();
  sketch.preview = worldFromScreen(position, rect.width, rect.height, event);
  sketch.previewWorld = null;
}

function onDraftPointerDown(event) {
  if (event.button === 2 && activeTool !== 'select') {
    event.preventDefault();
    if (!shapeDrag) previewDraftEvent(event);
    confirmCurrentDrawing();
    return;
  }
  if (event.button === 1 || (event.button === 0 && event.shiftKey) || (event.button === 2 && activeTool === 'select')) {
    isPanning = true;
    dragAnchor = { x: event.clientX, y: event.clientY, panX: view.pan.x, panY: view.pan.y };
    draftCanvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0) return;
  const position = pointerPosition(event, draftCanvas);
  const rect = draftCanvas.getBoundingClientRect();
  const point = activeTool === 'select' ? rawWorldFromScreen(position, rect.width, rect.height) : worldFromScreen(position, rect.width, rect.height, event);
  updatePointerReadout(position);

  if (activeTool === 'select') {
    const guide = findGuidePointAt2D(point);
    if (guide) {
      selectedId = guide.recordId;
      gizmoState = { recordId: guide.recordId, index: guide.index };
      gizmoHoverAxis = null;
      pickedControlPoint = guide;
      controlDrag = { ...guide, pointerId: event.pointerId, surface: 'draft' };
      saveSnapshot();
      draftCanvas.setPointerCapture(event.pointerId);
      renderAll();
      return;
    }
    selectAt(point);
    gizmoState = null;
    gizmoHoverAxis = null;
    pickedControlPoint = null;
    renderAll();
    return;
  }
  if (activeTool === 'plane') {
    sketch.preview = point;
    sketch.previewWorld = null;
    renderAll();
    return;
  }
  if (['rectangle', 'circle'].includes(activeTool) && sketch.points.length === 0) {
    sketch.points.push(point);
    sketch.preview = point;
    shapeDrag = { start: point, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, surface: 'draft' };
    draftCanvas.setPointerCapture(event.pointerId);
    renderAll();
    return;
  }
  sketch.points.push(point);
  renderAll();
}

function onDraftPointerMove(event) {
  const position = pointerPosition(event, draftCanvas);
  updatePointerReadout(position);
  if (controlDrag && controlDrag.surface === 'draft' && controlDrag.pointerId === event.pointerId) {
    const rect = draftCanvas.getBoundingClientRect();
    const point = worldFromScreen(position, rect.width, rect.height, event);
    const record = scene.records.find(item => item.id === controlDrag.recordId);
    if (record) {
      updateGuidePoint(record, controlDrag.index, point);
      pickedControlPoint = { recordId: record.id, index: controlDrag.index };
      renderAll();
    }
    return;
  }
  if (isPanning && dragAnchor) {
    view.pan.x = dragAnchor.panX + event.clientX - dragAnchor.x;
    view.pan.y = dragAnchor.panY + event.clientY - dragAnchor.y;
    render2D();
    return;
  }
  const rect = draftCanvas.getBoundingClientRect();
  if (shapeDrag && shapeDrag.surface === 'draft' && shapeDrag.pointerId === event.pointerId) {
    sketch.preview = worldFromScreen(position, rect.width, rect.height, event);
    shapeDrag.moved = shapeDrag.moved || Math.hypot(event.clientX - shapeDrag.x, event.clientY - shapeDrag.y) > 2;
    render2D();
    return;
  }
  if (activeTool === 'plane') {
    sketch.preview = worldFromScreen(position, rect.width, rect.height, event);
    sketch.previewWorld = null;
    render2D();
    return;
  }
  if (activeTool === 'select') {
    const guide = findGuidePointAt2D(rawWorldFromScreen(position, rect.width, rect.height));
    const changed = guide?.recordId !== pickedControlPoint?.recordId || guide?.index !== pickedControlPoint?.index;
    if (changed) {
      pickedControlPoint = guide;
      render2D();
    }
    return;
  }
  if (!sketch.points.length) return;
  sketch.preview = worldFromScreen(position, rect.width, rect.height, event);
  render2D();
}

function onDraftPointerUp(event) {
  if (controlDrag && controlDrag.surface === 'draft' && controlDrag.pointerId === event.pointerId) {
    normaliseSelectedWinding();
    controlDrag = null;
    if (draftCanvas.hasPointerCapture(event.pointerId)) draftCanvas.releasePointerCapture(event.pointerId);
    renderAll();
    return;
  }
  if (shapeDrag && shapeDrag.surface === 'draft' && shapeDrag.pointerId === event.pointerId) {
    const position = pointerPosition(event, draftCanvas);
    const rect = draftCanvas.getBoundingClientRect();
    const point = worldFromScreen(position, rect.width, rect.height, event);
    sketch.preview = point;
    if (shapeDrag.moved) sketch.points = [shapeDrag.start, point];
    shapeDrag = null;
    if (draftCanvas.hasPointerCapture(event.pointerId)) draftCanvas.releasePointerCapture(event.pointerId);
    renderAll();
  }
  if (isPanning) {
    isPanning = false;
    dragAnchor = null;
    if (draftCanvas.hasPointerCapture(event.pointerId)) draftCanvas.releasePointerCapture(event.pointerId);
  }
}

function finishPolyline() {
  if (activeTool !== 'polyline' || sketch.points.length < 2) return;
  if (sketch.preview && distance(sketch.points[sketch.points.length - 1], sketch.preview) < 0.01) sketch.points.pop();
  finishDrawing();
}

function confirmCurrentDrawing() {
  const handled = confirmDrawing({
    activeTool,
    sketch,
    addPlane: point => addPlaneAt(point),
    finishPolyline,
    finishDrawing
  });
  if (handled) {
    renderAll();
    if (activeTool !== 'select') setMessage('Confirmed');
  }
}

function cameraScreenBasis() {
  const forward = normalize3(sub3(orbit.target, cameraView.eye));
  const right = normalize3(cross3(forward, { x: 0, y: 0, z: 1 }));
  const up = normalize3(cross3(right, forward));
  return { right, up };
}

function beginSceneOrbit(event) {
  isOrbiting = true;
  dragAnchor = { x: event.clientX, y: event.clientY, yaw: orbit.goalYaw, pitch: orbit.goalPitch };
  sceneCanvas.classList.add('is-orbiting');
  sceneCanvas.setPointerCapture(event.pointerId);
}

function beginScenePan(event) {
  isScenePanning = true;
  dragAnchor = { x: event.clientX, y: event.clientY, target: { ...orbit.goalTarget } };
  sceneCanvas.classList.add('is-orbiting');
  sceneCanvas.setPointerCapture(event.pointerId);
}

function previewSceneEvent(event) {
  const hit = scenePointForEvent(event);
  if (!hit) return false;
  sketch.preview = hit.local;
  sketch.previewWorld = hit.world;
  return true;
}

function onScenePointerDown(event) {
  if (event.button === 2 && activeTool !== 'select') {
    event.preventDefault();
    if (!shapeDrag) previewSceneEvent(event);
    confirmCurrentDrawing();
    return;
  }
  if (!cameraView) return;
  // Blender-style navigation remains available when selecting: MMB orbits, Shift+MMB pans.
  if ((event.button === 1 || event.button === 2) && event.shiftKey) {
    beginScenePan(event);
    return;
  }
  if (event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey)) {
    beginSceneOrbit(event);
    return;
  }
  if (event.button !== 0) return;
  const screenPoint = pointerPosition(event, sceneCanvas);
  const hit = scenePointForEvent(event);
  if (activeTool === 'select') {
    const gizmoHandle = findGizmoHandleAtScene(screenPoint);
    if (gizmoHandle && beginGizmoAxisDrag(gizmoHandle, event)) {
      event.preventDefault();
      return;
    }
    const guide = findGuidePointAtScene(screenPoint);
    if (guide) {
      selectedId = guide.recordId;
      gizmoState = { recordId: guide.recordId, index: guide.index };
      gizmoHoverAxis = null;
      pickedControlPoint = guide;
      controlDrag = { ...guide, pointerId: event.pointerId, surface: 'scene' };
      saveSnapshot();
      sceneCanvas.setPointerCapture(event.pointerId);
      renderAll();
      return;
    }
    selectAtScene(screenPoint);
    gizmoState = null;
    gizmoHoverAxis = null;
    pickedControlPoint = null;
    renderAll();
    return;
  }
  if (!hit) return;
  if (activeTool === 'plane') {
    sketch.preview = hit.local;
    sketch.previewWorld = hit.world;
    renderAll();
    return;
  }
  if (['rectangle', 'circle'].includes(activeTool) && sketch.points.length === 0) {
    sketch.points.push(hit.local);
    sketch.preview = hit.local;
    sketch.previewWorld = hit.world;
    shapeDrag = { start: hit.local, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, surface: 'scene' };
    sceneCanvas.setPointerCapture(event.pointerId);
    render3D();
    return;
  }
  sketch.points.push(hit.local);
  render3D();
}

function onScenePointerMove(event) {
  if (gizmoDrag && gizmoDrag.pointerId === event.pointerId) {
    updateGizmoDrag(event);
    return;
  }
  if (controlDrag && controlDrag.surface === 'scene' && controlDrag.pointerId === event.pointerId) {
    const hit = scenePointForEvent(event);
    const record = scene.records.find(item => item.id === controlDrag.recordId);
    if (hit && record) {
      updateGuidePoint(record, controlDrag.index, hit.local);
      pickedControlPoint = { recordId: record.id, index: controlDrag.index };
      renderAll();
    }
    return;
  }
  if (isScenePanning && dragAnchor) {
    const rect = sceneCanvas.getBoundingClientRect();
    const scale = (700 / orbit.zoom) * (2 * Math.tan(Math.PI / 3.2 / 2)) / Math.max(rect.height, 1);
    const basis = cameraScreenBasis();
    orbit.goalTarget = {
      x: dragAnchor.target.x - basis.right.x * (event.clientX - dragAnchor.x) * scale + basis.up.x * (event.clientY - dragAnchor.y) * scale,
      y: dragAnchor.target.y - basis.right.y * (event.clientX - dragAnchor.x) * scale + basis.up.y * (event.clientY - dragAnchor.y) * scale,
      z: dragAnchor.target.z - basis.right.z * (event.clientX - dragAnchor.x) * scale + basis.up.z * (event.clientY - dragAnchor.y) * scale
    };
    requestCameraMotion();
    return;
  }
  if (isOrbiting && dragAnchor) {
    orbit.goalYaw = dragAnchor.yaw - (event.clientX - dragAnchor.x) * 0.008;
    orbit.goalPitch = clamp(dragAnchor.pitch - (event.clientY - dragAnchor.y) * 0.008, -1.45, 1.45);
    requestCameraMotion();
    return;
  }
  if (shapeDrag && shapeDrag.surface === 'scene' && shapeDrag.pointerId === event.pointerId) {
    const hit = scenePointForEvent(event);
    if (!hit) return;
    shapeDrag.moved = shapeDrag.moved || Math.hypot(event.clientX - shapeDrag.x, event.clientY - shapeDrag.y) > 2;
    sketch.preview = hit.local;
    sketch.previewWorld = hit.world;
    render3D();
    return;
  }
  if (!cameraView) return;
  if (activeTool === 'select') {
    const screenPoint = pointerPosition(event, sceneCanvas);
    const gizmoHandle = findGizmoHandleAtScene(screenPoint);
    const guide = findGuidePointAtScene(screenPoint);
    const changed = gizmoHandle?.axis !== gizmoHoverAxis
      || guide?.recordId !== pickedControlPoint?.recordId
      || guide?.index !== pickedControlPoint?.index;
    if (changed) {
      gizmoHoverAxis = gizmoHandle?.axis || null;
      pickedControlPoint = guide;
      sceneCanvas.style.cursor = gizmoHandle ? 'pointer' : 'grab';
      render3D();
    }
    return;
  }
  const hit = scenePointForEvent(event);
  if (!hit) return;
  sketch.preview = hit.local;
  sketch.previewWorld = hit.world;
  render3D();
}

function onScenePointerUp(event) {
  if (gizmoDrag && gizmoDrag.pointerId === event.pointerId) {
    normaliseSelectedWinding();
    gizmoDrag = null;
    gizmoHoverAxis = null;
    if (sceneCanvas.hasPointerCapture(event.pointerId)) sceneCanvas.releasePointerCapture(event.pointerId);
    renderAll();
    return;
  }
  if (controlDrag && controlDrag.surface === 'scene' && controlDrag.pointerId === event.pointerId) {
    normaliseSelectedWinding();
    controlDrag = null;
    if (sceneCanvas.hasPointerCapture(event.pointerId)) sceneCanvas.releasePointerCapture(event.pointerId);
    renderAll();
    return;
  }
  if (shapeDrag && shapeDrag.surface === 'scene' && shapeDrag.pointerId === event.pointerId) {
    const hit = scenePointForEvent(event);
    if (hit && shapeDrag.moved) {
      sketch.points = [shapeDrag.start, hit.local];
      sketch.preview = hit.local;
      sketch.previewWorld = hit.world;
    }
    shapeDrag = null;
    if (sceneCanvas.hasPointerCapture(event.pointerId)) sceneCanvas.releasePointerCapture(event.pointerId);
    renderAll();
  }
  isOrbiting = false;
  isScenePanning = false;
  dragAnchor = null;
  sceneCanvas.classList.remove('is-orbiting');
  if (sceneCanvas.hasPointerCapture(event.pointerId)) sceneCanvas.releasePointerCapture(event.pointerId);
}

function requestCameraMotion() {
  if (cameraAnimation) return;
  cameraAnimation = requestAnimationFrame(animateCamera);
}

function animateCamera() {
  const ease = .14;
  orbit.yaw += (orbit.goalYaw - orbit.yaw) * ease;
  orbit.pitch += (orbit.goalPitch - orbit.pitch) * ease;
  orbit.zoom += (orbit.goalZoom - orbit.zoom) * ease;
  orbit.target.x += (orbit.goalTarget.x - orbit.target.x) * ease;
  orbit.target.y += (orbit.goalTarget.y - orbit.target.y) * ease;
  orbit.target.z += (orbit.goalTarget.z - orbit.target.z) * ease;
  zoomReadout.textContent = `${Math.round(orbit.zoom * 100)}%`;
  if (view.mode === '3d') render3D();
  const settled = Math.abs(orbit.goalYaw - orbit.yaw) < .0005 && Math.abs(orbit.goalPitch - orbit.pitch) < .0005 && Math.abs(orbit.goalZoom - orbit.zoom) < .0005 && Math.abs(orbit.goalTarget.x - orbit.target.x) < .01 && Math.abs(orbit.goalTarget.y - orbit.target.y) < .01 && Math.abs(orbit.goalTarget.z - orbit.target.z) < .01;
  if (settled) {
    orbit.yaw = orbit.goalYaw;
    orbit.pitch = orbit.goalPitch;
    orbit.zoom = orbit.goalZoom;
    orbit.target = { ...orbit.goalTarget };
    cameraAnimation = null;
    if (view.mode === '3d') render3D();
  } else {
    cameraAnimation = requestAnimationFrame(animateCamera);
  }
}

function zoomBy(factor) {
  if (view.mode === '2d') view.zoom = clamp(view.zoom * factor, 0.15, 8);
  else {
    orbit.goalZoom = clamp(orbit.goalZoom * factor, 0.35, 3.5);
    requestCameraMotion();
  }
  renderAll();
}

function setCameraPreset(preset) {
  if (preset === 'top') { orbit.goalYaw = -0.35; orbit.goalPitch = 1.48; }
  if (preset === 'front') { orbit.goalYaw = -Math.PI / 2; orbit.goalPitch = 0.08; }
  if (preset === 'right') { orbit.goalYaw = 0; orbit.goalPitch = 0.08; }
  orbit.goalZoom = 1;
  if (view.mode !== '3d') setMode('3d');
  requestCameraMotion();
}

function fitView() {
  const points = [];
  scene.records.forEach(record => {
    if (record.form === 'circle') points.push(makePoint(record.center.x - record.radius, record.center.y - record.radius), makePoint(record.center.x + record.radius, record.center.y + record.radius));
    else if (record.form === 'ellipse') points.push(makePoint(record.center.x - record.radiusX, record.center.y - record.radiusY), makePoint(record.center.x + record.radiusX, record.center.y + record.radiusY));
    else if (record.form === 'rectangle') points.push(...cornersForRectangle(record));
    else if (isCurveForm(record.form)) points.push(...curveSamples(record));
    else if (record.form === 'polygon') points.push(...record.points);
    else if (record.form === 'slot') points.push(...slotBoundary(record));
    else points.push(...record.points);
  });
  scene.planes.forEach(plane => points.push(...planeCorners2D(plane)));
  if (!points.length) {
    if (view.mode === '3d') {
      orbit.goalTarget = { x: 0, y: 0, z: 0 };
      orbit.goalZoom = 1;
      requestCameraMotion();
    } else {
      view.zoom = 1;
      view.pan = { x: 0, y: 0 };
    }
    renderAll();
    return;
  }
  const xs = points.map(point => point.x); const ys = points.map(point => point.y);
  const width = Math.max(...xs) - Math.min(...xs); const height = Math.max(...ys) - Math.min(...ys);
  if (view.mode === '3d') {
    orbit.goalTarget = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, z: 0 };
    orbit.goalZoom = clamp(260 / Math.max(width, height, 120), .35, 3.5);
    requestCameraMotion();
    renderAll();
    setMessage('Fit all geometry to 3D view');
    return;
  }
  const rect = draftCanvas.getBoundingClientRect();
  view.zoom = clamp(Math.min((rect.width - 120) / Math.max(width, 100), (rect.height - 120) / Math.max(height, 100)), 0.15, 8);
  view.pan = { x: -((Math.max(...xs) + Math.min(...xs)) / 2) * view.zoom, y: ((Math.max(...ys) + Math.min(...ys)) / 2) * view.zoom };
  renderAll();
  setMessage('Fit all geometry to view');
}

function iconFor(record) {
  if (record.form === 'plane') return '◇';
  if (record.form === 'circle' || record.form === 'ellipse') return '○';
  if (isCurveForm(record.form)) return record.form === 'arc' ? '◒' : '⌁';
  if (record.form === 'slot') return '▭';
  if (record.form === 'polygon') return '⬠';
  if (record.form === 'rectangle') return '□';
  return '／';
}

function renderSceneInspector() {
  const total = scene.records.length + scene.planes.length;
  const rows = [];
  scene.planes.forEach(plane => rows.push({ ...plane, kindLabel: 'CONSTRUCTION PLANE', iconClass: 'plane' }));
  scene.records.forEach(record => rows.push({ ...record, kindLabel: formLabels[record.form] || record.form.toUpperCase(), iconClass: isCurveForm(record.form) ? 'curve' : (isClosedForm(record.form) ? 'closed' : '') }));
  sceneInspector.innerHTML = `
    <div class="inspector-scroll">
      <section class="inspector-card">
        <div class="card-head">
          <div><div class="card-kicker">SCENE CONTENT</div><div class="card-title">Construction order</div></div>
          <span class="card-count">${String(total).padStart(2, '0')}</span>
        </div>
        <div class="card-body">
          <div class="scene-list">
            ${rows.length ? rows.map(record => `
              <button class="scene-row ${record.id === selectedId ? 'is-selected' : ''}" data-scene-id="${record.id}">
                <span class="scene-icon ${record.iconClass}">${iconFor(record)}</span>
                <span><span class="scene-name">${escapeMarkup(record.name)}</span><span class="scene-kind">${record.kindLabel}</span></span>
              </button>`).join('') : '<div class="scene-empty">No geometry yet.<br>Choose a primitive, curve,<br>or plane from the pill toolbar.</div>'}
          </div>
        </div>
      </section>
      <section class="inspector-card compact-card">
        <div class="card-head"><div><div class="card-kicker">WORKSPACE</div><div class="card-title">Draft contents</div></div><span class="card-dot ${total ? 'is-on' : ''}"></span></div>
        <div class="card-note">${scene.planes.length} plane${scene.planes.length === 1 ? '' : 's'} · ${scene.records.length} geometry record${scene.records.length === 1 ? '' : 's'}</div>
      </section>
    </div>`;
  sceneInspector.querySelectorAll('[data-scene-id]').forEach(row => row.addEventListener('click', () => {
    selectedId = row.dataset.sceneId;
    renderAll();
  }));
}

function renderPropertiesInspector() {
  const record = findSelected();
  if (!record) {
    propertiesInspector.innerHTML = '<div class="inspector-scroll"><div class="blank-properties"><strong>Nothing selected</strong>Select geometry in the Scene view to inspect its dimensions and construction settings.</div></div>';
    return;
  }
  if (record.form === 'plane') {
    propertiesInspector.innerHTML = `
      <div class="inspector-scroll">
        <section class="property-card selected-card">
          <div class="property-card-head"><span>CONSTRUCTION PLANE</span><span class="card-count">3D</span></div>
          <div class="property-name-large">${escapeMarkup(record.name)}</div>
          <div class="property-subtitle">ACTIVE WORKING SURFACE</div>
        </section>
        <section class="property-card">
          <div class="property-card-head"><span>IDENTITY</span><span>01</span></div>
          <div class="property-card-body">
            ${propertyField('Name', 'name', record.name)}
          </div>
        </section>
        <section class="property-card">
          <div class="property-card-head"><span>PLACEMENT</span><span>XYZ</span></div>
          <div class="property-card-body">
            ${propertyField('Origin X', 'centerX', record.center.x, 'number')}
            ${propertyField('Origin Y', 'centerY', record.center.y, 'number')}
            ${propertyField('Elevation', 'elevation', record.elevation, 'number')}
          </div>
        </section>
        <section class="property-card">
          <div class="property-card-head"><span>ORIENTATION</span><span>DEG</span></div>
          <div class="property-card-body">
            ${propertyField('Twist', 'twist', record.twist, 'number')}
            ${propertyField('Tilt X', 'tiltX', record.tiltX, 'number')}
            ${propertyField('Tilt Y', 'tiltY', record.tiltY, 'number')}
          </div>
        </section>
        <section class="property-card">
          <div class="property-card-head"><span>SIZE</span><span>MM</span></div>
          <div class="property-card-body">
            ${propertyField('Width', 'width', record.width, 'number')}
            ${propertyField('Height', 'height', record.height, 'number')}
          </div>
        </section>
        <button class="delete-button" data-delete="${record.id}">DELETE PLANE</button>
      </div>`;
  } else {
    const count = ['line', 'polyline', 'polygon', 'bezier', 'hermite', 'bspline', 'nurbs', 'spline'].includes(record.form) ? (record.points?.length || 4) : (record.form === 'arc' ? 3 : (record.form === 'slot' ? 3 : 1));
    propertiesInspector.innerHTML = `
      <div class="inspector-scroll">
        <section class="property-card selected-card">
          <div class="property-card-head"><span>${formLabels[record.form]}</span><span class="card-count">2D / 3D</span></div>
          <div class="property-name-large">${escapeMarkup(record.name)}</div>
          <div class="property-subtitle">PARAMETRIC GEOMETRY</div>
        </section>
        <section class="property-card">
          <div class="property-card-head"><span>IDENTITY</span><span>01</span></div>
          <div class="property-card-body">
            ${propertyField('Name', 'name', record.name)}
            ${propertyField('Stroke', 'color', record.color, 'color')}
          </div>
        </section>
        <section class="property-card">
          <div class="property-card-head"><span>MEASUREMENTS</span><span>MM</span></div>
          <div class="property-card-body">
            <div class="readout-box"><div class="readout"><div class="readout-label">FORM</div><div class="readout-value">${formLabels[record.form]}</div></div><div class="readout"><div class="readout-label">POINTS</div><div class="readout-value">${count}</div></div></div>
            <div class="readout-box"><div class="readout"><div class="readout-label">CENTRE X</div><div class="readout-value">${getRecordCentre(record).x.toFixed(2)}</div></div><div class="readout"><div class="readout-label">CENTRE Y</div><div class="readout-value">${getRecordCentre(record).y.toFixed(2)}</div></div></div>
          </div>
        </section>
        <button class="delete-button" data-delete="${record.id}">DELETE GEOMETRY</button>
      </div>`;
  }
  propertiesInspector.querySelectorAll('[data-property]').forEach(input => input.addEventListener('change', () => updateSelectedProperty(input.dataset.property, input.type === 'number' ? Number(input.value) : input.value)));
  propertiesInspector.querySelector('[data-delete]')?.addEventListener('click', () => deleteSelected());
}

function getRecordCentre(record) {
  if (record.center) return record.center;
  let points = [];
  if (record.form === 'rectangle') points = cornersForRectangle(record);
  else if (isCurveForm(record.form) || record.form === 'polygon') points = record.points || [];
  else if (record.form === 'slot') points = record.points || [record.start, record.end];
  else points = record.points || [];
  if (!points.length) return makePoint();
  return makePoint(points.reduce((sum, point) => sum + point.x, 0) / points.length, points.reduce((sum, point) => sum + point.y, 0) / points.length);
}

function updateSelectedProperty(property, next) {
  const record = findSelected();
  if (!record) return;
  saveSnapshot();
  if (property === 'name') record.name = String(next || 'Untitled');
  else if (property === 'centerX') record.center.x = Number(next) || 0;
  else if (property === 'centerY') record.center.y = Number(next) || 0;
  else if (property === 'width' || property === 'height') record[property] = Math.max(1, Number(next) || 1);
  else if (['elevation', 'twist', 'tiltX', 'tiltY'].includes(property)) record[property] = Number(next) || 0;
  else if (property === 'color') record.color = next;
  renderAll();
}

function deleteSelected() {
  if (!selectedId) return;
  saveSnapshot();
  scene.records = scene.records.filter(record => record.id !== selectedId);
  scene.planes = scene.planes.filter(plane => plane.id !== selectedId);
  selectedId = null;
  setMessage('Deleted selection');
  renderAll();
}

function setInspector(tab) {
  activeInspector = tab;
  document.querySelectorAll('.inspector-tab').forEach(button => button.classList.toggle('is-active', button.dataset.inspector === tab));
  const track = document.querySelector('#inspectorTrack');
  slideInspector(track, tab);
}

function exportSketch() {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nova-cad-sketch.json';
  link.click();
  URL.revokeObjectURL(url);
  setMessage('Sketch exported');
}

function importSketch(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!incoming || !Array.isArray(incoming.records) || !Array.isArray(incoming.planes)) throw new Error('Invalid sketch');
      saveSnapshot();
      scene = {
        records: incoming.records.map(record => ({ ...record, winding: isClosedForm(record.form) ? 'CCW' : (record.winding || null) })),
        planes: incoming.planes.map(plane => ({ ...plane, winding: 'CCW' })),
        nextId: Number(incoming.nextId) || 1
      };
      selectedId = null;
      renderAll();
      setMessage('Sketch imported');
    } catch (error) {
      setMessage('Import refused: invalid sketch');
    }
  };
  reader.readAsText(file);
}

function newSketch() {
  if ((scene.records.length || scene.planes.length) && !window.confirm('Clear the current sketch?')) return;
  if (scene.records.length || scene.planes.length) saveSnapshot();
  scene = { records: [], planes: [], nextId: 1 };
  selectedId = null;
  view.zoom = 1; view.pan = { x: 0, y: 0 };
  setTool('select');
  setMessage('New sketch ready');
  renderAll();
}

function onKeyDown(event) {
  if (event.target.matches('input')) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmCurrentDrawing();
    return;
  }
  const key = event.key.toLowerCase();
  const shortcuts = { v: 'select', l: 'line', p: 'polyline', g: 'polygon', r: 'rectangle', c: 'circle', e: 'ellipse', t: 'arc', o: 'slot', b: 'bezier', h: 'hermite', n: 'bspline', u: 'nurbs', s: 'spline', a: 'plane' };
  if (shortcuts[key]) { event.preventDefault(); setTool(shortcuts[key]); }
  if (key === 'escape') { shapeDrag = null; controlDrag = null; gizmoDrag = null; gizmoState = null; gizmoHoverAxis = null; pickedControlPoint = null; sketch = { points: [], preview: null, previewWorld: null }; setTool('select'); }
  if (key === 'delete' || key === 'backspace') deleteSelected();
  if (key === 'f') fitView();
  if (key === '1') setMode('2d');
  if (key === '2') setMode('3d');
  if ((event.metaKey || event.ctrlKey) && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  if ((event.metaKey || event.ctrlKey) && key === 'y') { event.preventDefault(); redo(); }
}

draftCanvas.addEventListener('pointerdown', onDraftPointerDown);
draftCanvas.addEventListener('pointermove', onDraftPointerMove);
draftCanvas.addEventListener('pointerup', onDraftPointerUp);
draftCanvas.addEventListener('pointerleave', () => {
  if (!isPanning && !shapeDrag && !controlDrag) { sketch.preview = null; pickedControlPoint = null; render2D(); }
});
sceneCanvas.addEventListener('pointerleave', () => {
  if (!controlDrag && !gizmoDrag && !isOrbiting && !isScenePanning) {
    pickedControlPoint = null;
    gizmoHoverAxis = null;
    sceneCanvas.style.cursor = activeTool === 'select' ? 'grab' : 'crosshair';
    render3D();
  }
});
sceneCanvas.addEventListener('pointerdown', onScenePointerDown);
sceneCanvas.addEventListener('pointermove', onScenePointerMove);
sceneCanvas.addEventListener('pointerup', onScenePointerUp);
draftCanvas.addEventListener('contextmenu', event => event.preventDefault());
sceneCanvas.addEventListener('contextmenu', event => event.preventDefault());

canvasWrap.addEventListener('wheel', event => {
  event.preventDefault();
  zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
}, { passive: false });

const toolbarTooltip = document.createElement('div');
toolbarTooltip.className = 'toolbar-tooltip';
toolbarTooltip.setAttribute('role', 'tooltip');
document.body.appendChild(toolbarTooltip);

function showToolbarTooltip(button) {
  toolbarTooltip.textContent = button.dataset.tooltip;
  const rect = button.getBoundingClientRect();
  toolbarTooltip.style.left = `${rect.right + 10}px`;
  toolbarTooltip.style.top = `${rect.top + rect.height / 2}px`;
  toolbarTooltip.classList.add('is-visible');
}

function hideToolbarTooltip() {
  toolbarTooltip.classList.remove('is-visible');
}

document.querySelectorAll('.tool-button').forEach(button => {
  button.dataset.tooltip = button.title || button.getAttribute('aria-label') || 'Tool';
  button.addEventListener('click', () => setTool(button.dataset.tool));
  button.addEventListener('mouseenter', () => showToolbarTooltip(button));
  button.addEventListener('mouseleave', hideToolbarTooltip);
  button.addEventListener('focus', () => showToolbarTooltip(button));
  button.addEventListener('blur', hideToolbarTooltip);
});
document.querySelectorAll('.mode-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.view)));
bindInspectorTabs(document.querySelectorAll('.inspector-tab'), document.querySelector('#inspectorTrack'), tab => { activeInspector = tab; });
document.querySelector('#undoButton').addEventListener('click', undo);
document.querySelector('#redoButton').addEventListener('click', redo);
document.querySelector('#newButton').addEventListener('click', newSketch);
document.querySelector('#planeButton').addEventListener('click', () => setTool('plane'));
document.querySelector('#gridButton').addEventListener('click', event => {
  view.showGrid = !view.showGrid; event.currentTarget.classList.toggle('is-active', view.showGrid); renderAll();
});
document.querySelector('#snapButton').addEventListener('click', event => {
  view.snap = !view.snap; event.currentTarget.classList.toggle('is-active', view.snap); renderAll();
});
document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => setCameraPreset(button.dataset.camera)));
document.querySelector('#fitButton').addEventListener('click', fitView);
document.querySelector('#zoomIn').addEventListener('click', () => zoomBy(1.2));
document.querySelector('#zoomOut').addEventListener('click', () => zoomBy(0.8));
document.querySelector('#exportButton').addEventListener('click', exportSketch);
document.querySelector('#importButton').addEventListener('click', () => document.querySelector('#importFile').click());
document.querySelector('#importFile').addEventListener('change', event => { if (event.target.files[0]) importSketch(event.target.files[0]); event.target.value = ''; });
window.addEventListener('keydown', onKeyDown);
window.addEventListener('resize', renderAll);

rendererReadout.textContent = 'WEBGPU STARTING';
initWebGPURenderer();
renderAll();
