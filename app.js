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
  target: { x: 0, y: 0, z: 0 }
};
let cameraAnimation = null;

let activeTool = 'select';
let sketch = { points: [], preview: null };
let selectedId = null;
let undoStack = [];
let redoStack = [];
let isPanning = false;
let isOrbiting = false;
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
      fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format }] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
    };
    const pipeline = device.createRenderPipeline({ ...pipelineBase, primitive: { topology: 'line-list' } });
    const fillPipeline = device.createRenderPipeline({ ...pipelineBase, primitive: { topology: 'triangle-list' } });
    const uniformBuffer = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const context = sceneCanvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU context unavailable');
    context.configure({ device, format, alphaMode: 'opaque' });
    gpuRenderer = { device, context, format, pipeline, fillPipeline, layout, uniformBuffer, width: 0, height: 0, ready: true };
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
  line: 'Click two endpoints',
  polyline: 'Click points · double-click to finish',
  rectangle: 'Click opposite corners',
  circle: 'Click centre, then radius',
  ellipse: 'Click centre, then corner',
  bezier: 'Click start · two handles · end',
  hermite: 'Click start · end · tangent out · tangent in',
  plane: 'Click to place a construction plane'
};

const formLabels = {
  line: 'LINE',
  polyline: 'POLYLINE',
  rectangle: 'RECTANGLE',
  circle: 'CIRCLE',
  ellipse: 'ELLIPSE',
  bezier: 'BÉZIER',
  hermite: 'HERMITE'
};

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
    rectangle: colors.acid,
    circle: colors.purple,
    ellipse: colors.purple,
    bezier: colors.pink,
    hermite: colors.pink
  };
  return {
    id: `g${scene.nextId++}`,
    name: nextName(form === 'bezier' || form === 'hermite' ? 'Curve' : 'Geometry'),
    form,
    color: colorByForm[form] || colors.white,
    planeId: activePlane()?.id || null,
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
  sketch = { points: [], preview: null };
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

function worldFromScreen(point, width, height) {
  const raw = {
    x: (point.x - width / 2 - view.pan.x) / view.zoom,
    y: -(point.y - height / 2 - view.pan.y) / view.zoom
  };
  if (!view.snap) return makePoint(raw.x, raw.y);
  return makePoint(
    Math.round(raw.x / view.snapSize) * view.snapSize,
    Math.round(raw.y / view.snapSize) * view.snapSize
  );
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
  ctx.strokeStyle = '#594043';
  ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(width, origin.y); ctx.stroke();
  ctx.strokeStyle = '#334a38';
  ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, height); ctx.stroke();
  ctx.fillStyle = '#8f5b5f';
  ctx.font = '9px SFMono-Regular, Consolas, monospace';
  ctx.fillText('X', width - 17, origin.y - 7);
  ctx.fillStyle = '#649071';
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

function curveSamples(record, count = 96) {
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    points.push(record.form === 'bezier' ? bezierPoint(record.points, t) : hermitePoint(record, t));
  }
  return points;
}

function cornersForRectangle(record) {
  const x = record.origin.x;
  const y = record.origin.y;
  const w = record.width;
  const h = record.height;
  return [makePoint(x, y), makePoint(x + w, y), makePoint(x + w, y + h), makePoint(x, y + h)];
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

function drawRecord2D(ctx, record, width, height, selected = false) {
  const project = point => screenFromWorld(point, width, height);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = selected ? colors.acid : record.color;
  ctx.lineWidth = selected ? 2.5 : 1.7;

  if (record.form === 'line' || record.form === 'polyline') drawPath(ctx, record.points, project);
  if (record.form === 'rectangle') drawPath(ctx, cornersForRectangle(record), project, true);
  if (record.form === 'circle') {
    const center = project(record.center);
    ctx.beginPath(); ctx.arc(center.x, center.y, record.radius * view.zoom, 0, Math.PI * 2); ctx.stroke();
  }
  if (record.form === 'ellipse') {
    const center = project(record.center);
    ctx.beginPath(); ctx.ellipse(center.x, center.y, record.radiusX * view.zoom, record.radiusY * view.zoom, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (record.form === 'bezier' || record.form === 'hermite') drawPath(ctx, curveSamples(record), project);
  ctx.restore();

  if (selected) drawRecordGuides2D(ctx, record, width, height);
}

function drawRecordGuides2D(ctx, record, width, height) {
  const project = point => screenFromWorld(point, width, height);
  ctx.save();
  ctx.strokeStyle = 'rgba(216,255,62,.34)';
  ctx.fillStyle = colors.acid;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  let handles = [];
  if (record.form === 'bezier') handles = record.points;
  if (record.form === 'hermite') handles = [record.start, record.tangentStart, record.tangentEnd, record.end];
  if (handles.length) {
    const pts = handles.map(project);
    ctx.beginPath();
    if (record.form === 'bezier') {
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
      ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y);
    } else {
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
      ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach(point => { ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2); ctx.fill(); });
  }
  if (record.form === 'circle') {
    const center = project(record.center);
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(center.x + record.radius * view.zoom, center.y); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.arc(center.x, center.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  if (record.form === 'ellipse') {
    const center = project(record.center);
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(center.x - record.radiusX * view.zoom, center.y); ctx.lineTo(center.x + record.radiusX * view.zoom, center.y); ctx.stroke(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(center.x, center.y - record.radiusY * view.zoom); ctx.lineTo(center.x, center.y + record.radiusY * view.zoom); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); ctx.arc(center.x, center.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function planeCorners2D(plane) {
  const halfW = plane.width / 2;
  const halfH = plane.height / 2;
  const angle = (plane.twist || 0) * Math.PI / 180;
  const local = [makePoint(-halfW, -halfH), makePoint(halfW, -halfH), makePoint(halfW, halfH), makePoint(-halfW, halfH)];
  return local.map(point => makePoint(
    plane.center.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    plane.center.y + point.x * Math.sin(angle) + point.y * Math.cos(angle)
  ));
}

function drawPlane2D(ctx, plane, width, height, selected = false) {
  const project = point => screenFromWorld(point, width, height);
  const corners = planeCorners2D(plane).map(project);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = selected ? 'rgba(96,216,255,.13)' : 'rgba(96,216,255,.045)';
  ctx.fill();
  ctx.strokeStyle = selected ? colors.acid : 'rgba(96,216,255,.62)';
  ctx.lineWidth = selected ? 2 : 1;
  ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
  const center = project(plane.center);
  ctx.fillStyle = selected ? colors.acid : colors.cyan;
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
  ctx.strokeStyle = activeTool === 'plane' ? colors.cyan : (activeTool === 'bezier' || activeTool === 'hermite' ? colors.pink : colors.acid);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);

  if (activeTool === 'line' && points.length >= 1) drawPath(ctx, points.slice(0, 2), project);
  if (activeTool === 'polyline' && points.length >= 1) drawPath(ctx, points, project);
  if (activeTool === 'rectangle' && points.length >= 1) {
    const a = points[0]; const b = points[1] || points[0];
    drawPath(ctx, [a, makePoint(b.x, a.y), b, makePoint(a.x, b.y)], project, true);
  }
  if (activeTool === 'circle' && points.length >= 1) {
    const center = project(points[0]); const radius = points[1] ? distance(points[0], points[1]) * view.zoom : 0;
    ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.stroke();
  }
  if (activeTool === 'ellipse' && points.length >= 1) {
    const center = project(points[0]); const second = points[1] || points[0];
    ctx.beginPath(); ctx.ellipse(center.x, center.y, Math.abs(second.x - points[0].x) * view.zoom, Math.abs(second.y - points[0].y) * view.zoom, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (activeTool === 'bezier' && points.length >= 1) {
    points.forEach(point => { const p = project(point); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
    if (points.length >= 2) { ctx.beginPath(); ctx.moveTo(project(points[0]).x, project(points[0]).y); ctx.lineTo(project(points[1]).x, project(points[1]).y); ctx.stroke(); }
    if (points.length >= 3) { ctx.beginPath(); ctx.moveTo(project(points[2]).x, project(points[2]).y); ctx.lineTo(project(points[points.length - 1]).x, project(points[points.length - 1]).y); ctx.stroke(); }
    if (points.length === 4) { ctx.setLineDash([]); drawPath(ctx, curveSamples({ form: 'bezier', points }), project); }
  }
  if (activeTool === 'hermite' && points.length >= 1) {
    points.forEach(point => { const p = project(point); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
    if (points.length >= 2) {
      ctx.beginPath(); ctx.moveTo(project(points[0]).x, project(points[0]).y); ctx.lineTo(project(points[1]).x, project(points[1]).y); ctx.stroke();
    }
    if (points.length >= 3) {
      ctx.beginPath(); ctx.moveTo(project(points[0]).x, project(points[0]).y); ctx.lineTo(project(points[2]).x, project(points[2]).y); ctx.stroke();
    }
    if (points.length >= 4) {
      ctx.beginPath(); ctx.moveTo(project(points[1]).x, project(points[1]).y); ctx.lineTo(project(points[3]).x, project(points[3]).y); ctx.stroke();
      ctx.setLineDash([]);
      drawPath(ctx, curveSamples({ form: 'hermite', start: points[0], end: points[1], tangentStart: points[2], tangentEnd: points[3] }), project);
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
  result[0] = x.x; result[1] = x.y; result[2] = x.z; result[3] = 0;
  result[4] = y.x; result[5] = y.y; result[6] = y.z; result[7] = 0;
  result[8] = z.x; result[9] = z.y; result[10] = z.z; result[11] = 0;
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
  return [
    planeLocalToWorld({ x: -halfW, y: -halfH, z: 0 }, plane),
    planeLocalToWorld({ x: halfW, y: -halfH, z: 0 }, plane),
    planeLocalToWorld({ x: halfW, y: halfH, z: 0 }, plane),
    planeLocalToWorld({ x: -halfW, y: halfH, z: 0 }, plane)
  ];
}

function recordPoint3D(record, point) {
  const plane = scene.planes.find(item => item.id === record.planeId) || null;
  return planeLocalToWorld({ x: point.x, y: point.y, z: 0 }, plane);
}

function recordPoints3D(record) {
  if (record.form === 'line' || record.form === 'polyline') return record.points.map(point => recordPoint3D(record, point));
  if (record.form === 'rectangle') return cornersForRectangle(record).map(point => recordPoint3D(record, point));
  if (record.form === 'circle') {
    const points = [];
    for (let i = 0; i <= 64; i += 1) { const angle = i / 64 * Math.PI * 2; points.push(recordPoint3D(record, { x: record.center.x + Math.cos(angle) * record.radius, y: record.center.y + Math.sin(angle) * record.radius })); }
    return points;
  }
  if (record.form === 'ellipse') {
    const points = [];
    for (let i = 0; i <= 64; i += 1) { const angle = i / 64 * Math.PI * 2; points.push(recordPoint3D(record, { x: record.center.x + Math.cos(angle) * record.radiusX, y: record.center.y + Math.sin(angle) * record.radiusY })); }
    return points;
  }
  if (record.form === 'bezier' || record.form === 'hermite') return curveSamples(record, 96).map(point => recordPoint3D(record, point));
  return [];
}

function colourVector(hex, alpha = 1) {
  const clean = String(hex || '#a5bac5').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean;
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255, alpha];
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
  const distanceFromTarget = 520 / orbit.zoom;
  const eye = {
    x: target.x + Math.cos(orbit.pitch) * Math.cos(orbit.yaw) * distanceFromTarget,
    y: target.y + Math.cos(orbit.pitch) * Math.sin(orbit.yaw) * distanceFromTarget,
    z: target.z + Math.sin(orbit.pitch) * distanceFromTarget
  };
  const projection = perspectiveMatrix(Math.PI / 4.2, width / Math.max(height, 1), 1, 4000, webGpuDepth);
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

function scenePointForEvent(event) {
  const screenPoint = pointerPosition(event, sceneCanvas);
  const hit = rayPlaneHit(sceneRay(screenPoint), activePlane());
  if (!hit) return null;
  const local = worldToPlaneLocal(hit, activePlane());
  return {
    world: hit,
    local: view.snap ? makePoint(Math.round(local.x / view.snapSize) * view.snapSize, Math.round(local.y / view.snapSize) * view.snapSize) : local
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
    const projected = recordPoints3D(scene.records[i]).map(projectWorld);
    for (let index = 1; index < projected.length; index += 1) {
      if (screenSegmentDistance(screenPoint, projected[index - 1], projected[index]) < 10) { selectedId = scene.records[i].id; return true; }
    }
  }
  selectedId = null;
  return false;
}

function draw3Grid() {
  const points = [];
  const extent = 300;
  const step = 20;
  for (let coordinate = -extent; coordinate <= extent; coordinate += step) {
    points.push({ x: coordinate, y: -extent, z: -0.35 }, { x: coordinate, y: extent, z: -0.35 });
    points.push({ x: -extent, y: coordinate, z: -0.35 }, { x: extent, y: coordinate, z: -0.35 });
  }
  glDraw(points, gl.LINES, '#2a3033', cameraView.matrix, .7);
}

function draw3Axes() {
  glDraw([{ x: 0, y: 0, z: 0 }, { x: 120, y: 0, z: 0 }], gl.LINES, '#a77c81', cameraView.matrix, .95);
  glDraw([{ x: 0, y: 0, z: 0 }, { x: 0, y: 120, z: 0 }], gl.LINES, '#789383', cameraView.matrix, .95);
  glDraw([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 120 }], gl.LINES, '#8297bd', cameraView.matrix, .95);
}

function draw3Plane(plane, selected) {
  const corners = planeCorners3D(plane);
  glDraw([corners[0], corners[1], corners[2], corners[3]], gl.TRIANGLE_FAN, selected ? '#a5bac5' : '#6f8c98', cameraView.matrix, selected ? .18 : .08);
  glDraw(corners, gl.LINE_STRIP, selected ? '#d7e2e6' : '#8eb4c4', cameraView.matrix, selected ? 1 : .75, true);
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
  if (activeTool === 'bezier' && points.length >= 4) return { form: 'bezier', points: points.slice(0, 4), planeId };
  if (activeTool === 'hermite' && points.length >= 4) return { form: 'hermite', start: points[0], end: points[1], tangentStart: points[2], tangentEnd: points[3], planeId };
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

function gpuLineVertices(points, close = false) {
  if (points.length < 2) return new Float32Array();
  const vertices = [];
  for (let index = 1; index < points.length; index += 1) vertices.push(points[index - 1], points[index]);
  if (close) vertices.push(points[points.length - 1], points[0]);
  const packed = new Float32Array(vertices.length * 3);
  vertices.forEach((point, index) => { packed[index * 3] = point.x; packed[index * 3 + 1] = point.y; packed[index * 3 + 2] = point.z; });
  return packed;
}

function gpuTriangleVertices(points) {
  if (points.length < 3) return new Float32Array();
  const vertices = [points[0], points[1], points[2]];
  for (let index = 3; index < points.length; index += 1) vertices.push(points[0], points[index - 1], points[index]);
  const packed = new Float32Array(vertices.length * 3);
  vertices.forEach((point, index) => { packed[index * 3] = point.x; packed[index * 3 + 1] = point.y; packed[index * 3 + 2] = point.z; });
  return packed;
}

function gpuDrawVertices(pass, packed, colour, alpha, fill = false) {
  if (!packed.length) return;
  const vertexBuffer = gpuRenderer.device.createBuffer({ size: packed.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  gpuRenderer.device.queue.writeBuffer(vertexBuffer, 0, packed.buffer, packed.byteOffset, packed.byteLength);
  const bindGroup = gpuWriteUniforms(cameraView.matrix, colour, alpha);
  pass.setPipeline(fill ? gpuRenderer.fillPipeline : gpuRenderer.pipeline);
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
  for (let coordinate = -300; coordinate <= 300; coordinate += 20) {
    grid.push({ x: coordinate, y: -300, z: -.35 }, { x: coordinate, y: 300, z: -.35 });
    grid.push({ x: -300, y: coordinate, z: -.35 }, { x: 300, y: coordinate, z: -.35 });
  }
  gpuDrawVertices(pass, gpuLineVertices(grid), '#2a3033', .7);
  gpuDrawVertices(pass, gpuLineVertices([{ x: 0, y: 0, z: 0 }, { x: 120, y: 0, z: 0 }]), '#a77c81', .95);
  gpuDrawVertices(pass, gpuLineVertices([{ x: 0, y: 0, z: 0 }, { x: 0, y: 120, z: 0 }]), '#789383', .95);
  gpuDrawVertices(pass, gpuLineVertices([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 120 }]), '#8297bd', .95);
  scene.planes.slice().sort((a, b) => a.elevation - b.elevation).forEach(plane => {
    const corners = planeCorners3D(plane);
    gpuDrawVertices(pass, gpuTriangleVertices(corners), plane.id === selectedId ? '#a5bac5' : '#6f8c98', plane.id === selectedId ? .18 : .08, true);
    gpuDrawVertices(pass, gpuLineVertices(corners, true), plane.id === selectedId ? '#d7e2e6' : '#8eb4c4', plane.id === selectedId ? 1 : .75);
  });
  if (activeTool === 'plane' && sketch.previewWorld) {
    const previewPlane = { center: makePoint(sketch.previewWorld.x, sketch.previewWorld.y), width: 160, height: 100, elevation: sketch.previewWorld.z, twist: 0, tiltX: 0, tiltY: 0 };
    const corners = planeCorners3D(previewPlane);
    gpuDrawVertices(pass, gpuTriangleVertices(corners), '#8eb4c4', .08, true);
    gpuDrawVertices(pass, gpuLineVertices(corners, true), '#a5bac5', .65);
  }
  scene.records.forEach(record => {
    const points = recordPoints3D(record);
    gpuDrawVertices(pass, gpuLineVertices(points, record.form === 'rectangle' || record.form === 'circle' || record.form === 'ellipse'), record.id === selectedId ? '#d7e2e6' : record.color, record.id === selectedId ? 1 : .95);
  });
  const preview = previewRecord3D();
  if (preview) gpuDrawVertices(pass, gpuLineVertices(recordPoints3D(preview), preview.form === 'rectangle' || preview.form === 'circle' || preview.form === 'ellipse'), '#c6d4da', .8);
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
    const closed = record.form === 'rectangle' || record.form === 'circle' || record.form === 'ellipse';
    glDraw(points, closed ? gl.LINE_STRIP : gl.LINE_STRIP, record.id === selectedId ? '#d7e2e6' : record.color, cameraView.matrix, record.id === selectedId ? 1 : .95, closed);
  });
  const preview = previewRecord3D();
  if (preview) glDraw(recordPoints3D(preview), gl.LINE_STRIP, '#c6d4da', cameraView.matrix, .8, preview.form === 'rectangle' || preview.form === 'circle' || preview.form === 'ellipse');
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
  sketch = { points: [], preview: null };
  setTool('select');
  setMessage(`Created ${record.name}`);
}

function addPlaneAt(point) {
  saveSnapshot();
  const plane = makePlane(point);
  plane.elevation = Number(point.z) || 0;
  scene.planes.push(plane);
  selectedId = plane.id;
  setTool('select');
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
  if (activeTool === 'bezier' && points.length >= 4) addRecord(makeRecord('bezier', { points: points.slice(0, 4) }));
  if (activeTool === 'hermite' && points.length >= 4) addRecord(makeRecord('hermite', { start: points[0], end: points[1], tangentStart: points[2], tangentEnd: points[3] }));
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
  if (record.form === 'rectangle') {
    const corners = cornersForRectangle(record);
    for (let i = 0; i < corners.length; i += 1) if (pointToSegment(point, corners[i], corners[(i + 1) % corners.length]) <= threshold / view.zoom) return true;
  }
  if (record.form === 'circle' && Math.abs(distance(point, record.center) - record.radius) <= threshold / view.zoom) return true;
  if (record.form === 'ellipse') {
    const samples = recordPoints3D(record).map(item => makePoint(item.x, item.y));
    for (let i = 1; i < samples.length; i += 1) if (pointToSegment(point, samples[i - 1], samples[i]) <= threshold / view.zoom) return true;
  }
  if (record.form === 'bezier' || record.form === 'hermite') {
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

function onDraftPointerDown(event) {
  if (event.button === 1 || event.button === 2 || event.shiftKey) {
    isPanning = true;
    dragAnchor = { x: event.clientX, y: event.clientY, panX: view.pan.x, panY: view.pan.y };
    draftCanvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0) return;
  const position = pointerPosition(event, draftCanvas);
  const rect = draftCanvas.getBoundingClientRect();
  const point = worldFromScreen(position, rect.width, rect.height);
  updatePointerReadout(position);

  if (activeTool === 'select') {
    selectAt(point);
    renderAll();
    return;
  }
  if (activeTool === 'plane') {
    addPlaneAt(point);
    return;
  }
  sketch.points.push(point);
  if (['line', 'rectangle', 'circle', 'ellipse'].includes(activeTool) && sketch.points.length === 2) finishDrawing();
  if (activeTool === 'bezier' && sketch.points.length === 4) finishDrawing();
  if (activeTool === 'hermite' && sketch.points.length === 4) finishDrawing();
  renderAll();
}

function onDraftPointerMove(event) {
  const position = pointerPosition(event, draftCanvas);
  updatePointerReadout(position);
  if (isPanning && dragAnchor) {
    view.pan.x = dragAnchor.panX + event.clientX - dragAnchor.x;
    view.pan.y = dragAnchor.panY + event.clientY - dragAnchor.y;
    render2D();
    return;
  }
  if (activeTool === 'plane') {
    const rect = draftCanvas.getBoundingClientRect();
    sketch.preview = worldFromScreen(position, rect.width, rect.height);
    render2D();
    return;
  }
  if (!sketch.points.length || activeTool === 'select' || activeTool === 'polyline') {
    if (activeTool === 'polyline' && sketch.points.length) {
      const rect = draftCanvas.getBoundingClientRect();
      sketch.preview = worldFromScreen(position, rect.width, rect.height);
      render2D();
    }
    return;
  }
  const rect = draftCanvas.getBoundingClientRect();
  sketch.preview = worldFromScreen(position, rect.width, rect.height);
  render2D();
}

function onDraftPointerUp(event) {
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

function onScenePointerDown(event) {
  if (event.button === 1 || event.button === 2 || event.altKey || event.shiftKey) {
    isOrbiting = true;
    dragAnchor = { x: event.clientX, y: event.clientY, yaw: orbit.goalYaw, pitch: orbit.goalPitch };
    sceneCanvas.classList.add('is-orbiting');
    sceneCanvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0 || !cameraView) return;
  const screenPoint = pointerPosition(event, sceneCanvas);
  const hit = scenePointForEvent(event);
  if (activeTool === 'select') {
    const hitSelection = selectAtScene(screenPoint);
    if (!hitSelection) {
      isOrbiting = true;
      dragAnchor = { x: event.clientX, y: event.clientY, yaw: orbit.goalYaw, pitch: orbit.goalPitch };
      sceneCanvas.classList.add('is-orbiting');
      sceneCanvas.setPointerCapture(event.pointerId);
    }
    renderAll();
    return;
  }
  if (!hit) return;
  if (activeTool === 'plane') {
    addPlaneAt({ x: hit.world.x, y: hit.world.y, z: hit.world.z });
    return;
  }
  sketch.points.push(hit.local);
  if (['line', 'rectangle', 'circle', 'ellipse'].includes(activeTool) && sketch.points.length === 2) finishDrawing();
  if (activeTool === 'bezier' && sketch.points.length === 4) finishDrawing();
  if (activeTool === 'hermite' && sketch.points.length === 4) finishDrawing();
  render3D();
}

function onScenePointerMove(event) {
  if (isOrbiting && dragAnchor) {
    orbit.goalYaw = dragAnchor.yaw + (event.clientX - dragAnchor.x) * 0.008;
    orbit.goalPitch = clamp(dragAnchor.pitch + (event.clientY - dragAnchor.y) * 0.008, -1.2, 1.2);
    requestCameraMotion();
    return;
  }
  if (activeTool === 'select' || !cameraView) return;
  const hit = scenePointForEvent(event);
  if (!hit) return;
  sketch.preview = hit.local;
  sketch.previewWorld = hit.world;
  render3D();
}

function onScenePointerUp(event) {
  isOrbiting = false;
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
  zoomReadout.textContent = `${Math.round(orbit.zoom * 100)}%`;
  if (view.mode === '3d') render3D();
  const settled = Math.abs(orbit.goalYaw - orbit.yaw) < .0005 && Math.abs(orbit.goalPitch - orbit.pitch) < .0005 && Math.abs(orbit.goalZoom - orbit.zoom) < .0005;
  if (settled) {
    orbit.yaw = orbit.goalYaw;
    orbit.pitch = orbit.goalPitch;
    orbit.zoom = orbit.goalZoom;
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
    else if (record.form === 'bezier' || record.form === 'hermite') points.push(...curveSamples(record));
    else points.push(...record.points);
  });
  scene.planes.forEach(plane => points.push(...planeCorners2D(plane)));
  if (!points.length) {
    if (view.mode === '3d') {
      orbit.target = { x: 0, y: 0, z: 0 };
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
    orbit.target = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, z: 0 };
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
  if (record.form === 'bezier' || record.form === 'hermite') return '⌁';
  if (record.form === 'rectangle') return '□';
  return '／';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function renderSceneInspector() {
  const total = scene.records.length + scene.planes.length;
  const rows = [];
  scene.planes.forEach(plane => rows.push({ ...plane, kindLabel: 'CONSTRUCTION PLANE', iconClass: 'plane' }));
  scene.records.forEach(record => rows.push({ ...record, kindLabel: formLabels[record.form], iconClass: record.form === 'bezier' || record.form === 'hermite' ? 'curve' : '' }));
  sceneInspector.innerHTML = `
    <div class="scene-section">
      <div class="section-label"><span>WORKSPACE</span><span class="accent">${total ? 'LIVE' : 'EMPTY'}</span></div>
      <div class="scene-list">
        ${rows.length ? rows.map(record => `
          <button class="scene-row ${record.id === selectedId ? 'is-selected' : ''}" data-scene-id="${record.id}">
            <span class="scene-icon ${record.iconClass}">${iconFor(record)}</span>
            <span><span class="scene-name">${escapeHtml(record.name)}</span><span class="scene-kind">${record.kindLabel}</span></span>
          </button>`).join('') : '<div class="scene-empty">Your sketch is empty.<br>Choose a primitive, curve,<br>or plane to begin.</div>'}
      </div>
    </div>`;
  sceneInspector.querySelectorAll('[data-scene-id]').forEach(row => row.addEventListener('click', () => {
    selectedId = row.dataset.sceneId;
    renderAll();
  }));
  sceneInspector.querySelectorAll('[data-quick-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.quickTool)));
}

function field(label, property, current, inputType = 'text', suffix = '') {
  return `<div class="field"><label>${label}</label><input data-property="${property}" type="${inputType}" value="${escapeHtml(current)}" />${suffix ? `<small>${suffix}</small>` : ''}</div>`;
}

function renderPropertiesInspector() {
  const record = findSelected();
  if (!record) {
    propertiesInspector.innerHTML = '<div class="blank-properties"><strong>Nothing selected</strong>Select geometry in the viewport or scene list to inspect its dimensions, coordinates, and construction settings.</div>';
    return;
  }
  if (record.form === 'plane') {
    propertiesInspector.innerHTML = `
      <div class="property-head"><div class="property-title"><div class="property-icon">◇</div><div><div class="property-name">${escapeHtml(record.name)}</div><div class="scene-kind">CONSTRUCTION PLANE</div></div></div></div>
      <div class="property-form">
        ${field('Name', 'name', record.name)}
        ${field('Origin X', 'centerX', record.center.x, 'number')}
        ${field('Origin Y', 'centerY', record.center.y, 'number')}
        ${field('Width', 'width', record.width, 'number')}
        ${field('Height', 'height', record.height, 'number')}
        ${field('Elevation', 'elevation', record.elevation, 'number')}
        ${field('Twist', 'twist', record.twist, 'number')}
        ${field('Tilt X', 'tiltX', record.tiltX, 'number')}
        ${field('Tilt Y', 'tiltY', record.tiltY, 'number')}
        <div class="readout-box"><div class="readout"><div class="readout-label">ORIGIN X</div><div class="readout-value">${record.center.x.toFixed(2)} mm</div></div><div class="readout"><div class="readout-label">ORIGIN Y</div><div class="readout-value">${record.center.y.toFixed(2)} mm</div></div></div>
        <button class="delete-button" data-delete="${record.id}">DELETE PLANE</button>
      </div>`;
  } else {
    const count = record.form === 'line' || record.form === 'polyline' || record.form === 'bezier' ? record.points.length : 1;
    propertiesInspector.innerHTML = `
      <div class="property-head"><div class="property-title"><div class="property-icon">${iconFor(record)}</div><div><div class="property-name">${escapeHtml(record.name)}</div><div class="scene-kind">${formLabels[record.form]}</div></div></div></div>
      <div class="property-form">
        ${field('Name', 'name', record.name)}
        ${field('Stroke', 'color', record.color, 'color')}
        <div class="readout-box"><div class="readout"><div class="readout-label">FORM</div><div class="readout-value">${formLabels[record.form]}</div></div><div class="readout"><div class="readout-label">POINTS</div><div class="readout-value">${count}</div></div></div>
        <div class="readout-box"><div class="readout"><div class="readout-label">CENTRE X</div><div class="readout-value">${getRecordCentre(record).x.toFixed(2)} mm</div></div><div class="readout"><div class="readout-label">CENTRE Y</div><div class="readout-value">${getRecordCentre(record).y.toFixed(2)} mm</div></div></div>
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
  else if (record.form === 'bezier') points = record.points;
  else if (record.form === 'hermite') points = [record.start, record.end];
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
  sceneInspector.classList.toggle('is-hidden', tab !== 'scene');
  propertiesInspector.classList.toggle('is-hidden', tab !== 'properties');
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
      scene = { records: incoming.records, planes: incoming.planes, nextId: Number(incoming.nextId) || 1 };
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
  const key = event.key.toLowerCase();
  const shortcuts = { v: 'select', l: 'line', p: 'polyline', r: 'rectangle', c: 'circle', e: 'ellipse', b: 'bezier', h: 'hermite', a: 'plane' };
  if (shortcuts[key]) { event.preventDefault(); setTool(shortcuts[key]); }
  if (key === 'escape') { sketch = { points: [], preview: null }; setTool('select'); }
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
draftCanvas.addEventListener('pointerleave', () => { if (!isPanning) { sketch.preview = null; render2D(); } });
draftCanvas.addEventListener('dblclick', finishPolyline);
sceneCanvas.addEventListener('pointerdown', onScenePointerDown);
sceneCanvas.addEventListener('pointermove', onScenePointerMove);
sceneCanvas.addEventListener('pointerup', onScenePointerUp);
draftCanvas.addEventListener('contextmenu', event => event.preventDefault());
sceneCanvas.addEventListener('contextmenu', event => event.preventDefault());

canvasWrap.addEventListener('wheel', event => {
  event.preventDefault();
  zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
}, { passive: false });

document.querySelectorAll('.tool-button').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
document.querySelectorAll('.mode-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.view)));
document.querySelectorAll('.inspector-tab').forEach(button => button.addEventListener('click', () => setInspector(button.dataset.inspector)));
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
