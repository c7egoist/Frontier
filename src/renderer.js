import { makeClothRenderVertices } from './geometry.js';

const GPU_STATIC_SHADER = `
struct SceneUniforms {
  viewProjection: mat4x4<f32>,
  camera: vec4<f32>,
  dress: vec4<f32>,
  clock: vec4<f32>,
};
@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) roughness: f32,
};
struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) roughness: f32,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = scene.viewProjection * vec4<f32>(input.position, 1.0);
  output.worldPosition = input.position;
  output.worldNormal = input.normal;
  output.color = input.color;
  output.roughness = input.roughness;
  return output;
}

fn illuminate(base: vec3<f32>, normal: vec3<f32>, position: vec3<f32>, roughness: f32) -> vec4<f32> {
  let n = normalize(normal);
  let light = normalize(vec3<f32>(-0.48, 0.82, 0.48));
  let view = normalize(scene.camera.xyz - position);
  let halfVector = normalize(light + view);
  let diffuse = max(dot(n, light), 0.0);
  let r = clamp(roughness, 0.055, 1.0);
  let gloss = 1.0 - r;
  let specular = pow(max(dot(n, halfVector), 0.0), mix(7.0, 88.0, gloss)) * mix(0.025, 0.32, gloss);
  let rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * mix(0.025, 0.12, gloss);
  let broadHighlight = pow(max(dot(n, halfVector), 0.0), 5.0) * mix(0.005, 0.08, gloss);
  let lit = base * (0.39 + diffuse * 0.74) + vec3<f32>(specular + rim + broadHighlight);
  return vec4<f32>(lit, 1.0);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return illuminate(input.color.rgb, input.worldNormal, input.worldPosition, input.roughness);
}
`;

const GPU_CLOTH_SHADER = `
struct SceneUniforms {
  viewProjection: mat4x4<f32>,
  camera: vec4<f32>,
  dress: vec4<f32>,
  clock: vec4<f32>,
};
@group(0) @binding(0) var<storage, read> clothPositions: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> scene: SceneUniforms;

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let cols = 64u;
  let rows = 64u;
  let row = vertexIndex / cols;
  let col = vertexIndex % cols;
  let left = row * cols + ((col + cols - 1u) % cols);
  let right = row * cols + ((col + 1u) % cols);
  var aboveRow = row;
  var belowRow = row;
  if (row > 0u) { aboveRow = row - 1u; }
  if (row + 1u < rows) { belowRow = row + 1u; }
  let above = aboveRow * cols + col;
  let below = belowRow * cols + col;
  let p = clothPositions[vertexIndex].xyz;
  let across = clothPositions[right].xyz - clothPositions[left].xyz;
  let vertical = clothPositions[below].xyz - clothPositions[above].xyz;
  let normal = normalize(cross(vertical, across));
  var output: VertexOutput;
  output.clipPosition = scene.viewProjection * vec4<f32>(p, 1.0);
  output.worldPosition = p;
  output.worldNormal = normal;
  return output;
}

fn illuminate(base: vec3<f32>, normal: vec3<f32>, position: vec3<f32>, roughness: f32) -> vec4<f32> {
  let n = normalize(normal);
  let light = normalize(vec3<f32>(-0.48, 0.82, 0.48));
  let view = normalize(scene.camera.xyz - position);
  let halfVector = normalize(light + view);
  let diffuse = max(dot(n, light), 0.0);
  let r = clamp(roughness, 0.055, 1.0);
  let gloss = 1.0 - r;
  let specular = pow(max(dot(n, halfVector), 0.0), mix(7.0, 88.0, gloss)) * mix(0.025, 0.32, gloss);
  let rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * mix(0.025, 0.12, gloss);
  let broadHighlight = pow(max(dot(n, halfVector), 0.0), 5.0) * mix(0.005, 0.08, gloss);
  let sheen = pow(1.0 - abs(dot(n, view)), 4.0) * mix(0.0, 0.055, gloss);
  let lit = base * (0.39 + diffuse * 0.74) + vec3<f32>(specular + rim + broadHighlight + sheen);
  return vec4<f32>(lit, 1.0);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return illuminate(scene.dress.rgb, input.worldNormal, input.worldPosition, scene.dress.a);
}
`;

const GL_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec4 aColor;
in float aRoughness;
uniform mat4 uViewProjection;
out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec4 vColor;
out float vRoughness;
void main() {
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  vWorldPosition = aPosition;
  vWorldNormal = aNormal;
  vColor = aColor;
  vRoughness = aRoughness;
}
`;

const GL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uCamera;
uniform vec3 uTint;
in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec4 vColor;
in float vRoughness;
out vec4 outColor;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 light = normalize(vec3(-0.48, 0.82, 0.48));
  vec3 view = normalize(uCamera - vWorldPosition);
  vec3 halfVector = normalize(light + view);
  float diffuse = max(dot(n, light), 0.0);
  float rough = clamp(vRoughness, 0.055, 1.0);
  float gloss = 1.0 - rough;
  float specular = pow(max(dot(n, halfVector), 0.0), mix(7.0, 88.0, gloss)) * mix(0.025, 0.32, gloss);
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * mix(0.025, 0.12, gloss);
  float broadHighlight = pow(max(dot(n, halfVector), 0.0), 5.0) * mix(0.005, 0.08, gloss);
  float sheen = pow(1.0 - abs(dot(n, view)), 4.0) * mix(0.0, 0.055, gloss);
  vec3 base = vColor.rgb * uTint;
  vec3 lit = base * (0.39 + diffuse * 0.74) + vec3(specular + rim + broadHighlight + sheen);
  outColor = vec4(lit, vColor.a);
}
`;

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function lookAt(eye, center, up = [0, 1, 0]) {
  const z = normalize(eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]);
  const x = normalize(up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const out = new Float32Array(16);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
  return out;
}

function makeProjection(aspect, webgpu) {
  const f = 1 / Math.tan((35 * Math.PI / 180) / 2);
  const near = 0.1;
  const far = 90;
  const out = new Float32Array(16);
  out[0] = f / Math.max(aspect, 0.1);
  out[5] = f;
  if (webgpu) {
    out[10] = far / (near - far);
    out[11] = -1;
    out[14] = (far * near) / (near - far);
  } else {
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
  }
  return out;
}

function multiplyMat4(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

export function cameraMatrices(camera, aspect, webgpu = false) {
  const cosPitch = Math.cos(camera.pitch);
  const eye = [
    camera.target[0] + Math.sin(camera.yaw) * cosPitch * camera.distance,
    camera.target[1] + Math.sin(camera.pitch) * camera.distance,
    camera.target[2] + Math.cos(camera.yaw) * cosPitch * camera.distance,
  ];
  const view = lookAt(eye, camera.target);
  const projection = makeProjection(aspect, webgpu);
  return { matrix: multiplyMat4(projection, view), eye };
}

function createGPUBuffer(device, label, data, usage) {
  const buffer = device.createBuffer({ label, size: Math.max(4, data.byteLength), usage, mappedAtCreation: true });
  new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  buffer.unmap();
  return buffer;
}

function packUniforms(matrix, eye, dress, time) {
  const values = new Float32Array(28);
  values.set(matrix, 0);
  values.set(eye, 16);
  values[19] = 1;
  values[20] = dress[0]; values[21] = dress[1]; values[22] = dress[2]; values[23] = dress[3];
  values[24] = time; values[25] = 0; values[26] = 0; values[27] = 0;
  return values;
}

function createWireIndices(cols, rows) {
  const pairs = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const right = row * cols + ((col + 1) % cols);
      pairs.push(i, right);
      if (row + 1 < rows) pairs.push(i, (row + 1) * cols + col);
    }
  }
  return new Uint16Array(pairs);
}

export async function createWebGPURenderer(canvas, modelGeometry, clothGeometry, detailsGeometry) {
  if (!('gpu' in navigator)) return null;
  let adapter;
  let device;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) {
      device.destroy();
      return null;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });
    const renderer = new WebGPURenderer(canvas, device, context, format, modelGeometry, clothGeometry, detailsGeometry);
    await renderer.initialize();
    return renderer;
  } catch (error) {
    console.warn('WebGPU setup failed; using the WebGL renderer instead.', error);
    try { device?.destroy(); } catch { /* device may not have been created */ }
    return null;
  }
}

class WebGPURenderer {
  constructor(canvas, device, context, format, modelGeometry, clothGeometry, detailsGeometry) {
    this.type = 'webgpu';
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = format;
    this.modelGeometry = modelGeometry;
    this.clothGeometry = clothGeometry;
    this.detailsGeometry = detailsGeometry;
    this.sceneUniformBuffer = device.createBuffer({ label: 'camera and fabric uniforms', size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.depthTexture = null;
    this.depthView = null;
    this.width = 0;
    this.height = 0;
    this.simulation = null;
    this.clothBindGroup = null;
    this.isWireframe = false;
    this.staticVisible = true;
  }

  async initialize() {
    const device = this.device;
    const staticModule = device.createShaderModule({ label: 'studio material shader', code: GPU_STATIC_SHADER });
    const clothModule = device.createShaderModule({ label: 'silk surface shader', code: GPU_CLOTH_SHADER });
    const vertexBuffers = [{
      arrayStride: 44,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x4' },
        { shaderLocation: 3, offset: 40, format: 'float32' },
      ],
    }];
    const makeStaticPipeline = (label) => device.createRenderPipeline({
      label,
      layout: 'auto',
      vertex: { module: staticModule, entryPoint: 'vertexMain', buffers: vertexBuffers },
      fragment: { module: staticModule, entryPoint: 'fragmentMain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.staticPipeline = makeStaticPipeline('body and garment detail pipeline');
    this.clothPipeline = device.createRenderPipeline({
      label: 'live fabric surface pipeline',
      layout: 'auto',
      vertex: { module: clothModule, entryPoint: 'vertexMain' },
      fragment: { module: clothModule, entryPoint: 'fragmentMain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.wirePipeline = device.createRenderPipeline({
      label: 'fabric topology pipeline',
      layout: 'auto',
      vertex: { module: clothModule, entryPoint: 'vertexMain' },
      fragment: { module: clothModule, entryPoint: 'fragmentMain', targets: [{ format: this.format }] },
      primitive: { topology: 'line-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
    });

    this.sceneBindGroup = device.createBindGroup({
      label: 'studio scene uniforms',
      layout: this.staticPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.sceneUniformBuffer } }],
    });
    this.staticVertexBuffer = createGPUBuffer(device, 'mannequin and studio vertices', this.modelGeometry.vertices, GPUBufferUsage.VERTEX);
    this.staticIndexBuffer = createGPUBuffer(device, 'mannequin and studio indices', this.modelGeometry.indices, GPUBufferUsage.INDEX);
    this.staticIndexCount = this.modelGeometry.indexCount;
    this.clothIndexBuffer = createGPUBuffer(device, 'dress triangle indices', this.clothGeometry.indices, GPUBufferUsage.INDEX);
    this.clothWireIndexBuffer = createGPUBuffer(device, 'dress wire indices', createWireIndices(this.clothGeometry.cols, this.clothGeometry.rows), GPUBufferUsage.INDEX);
    this.clothWireIndexCount = createWireIndices(this.clothGeometry.cols, this.clothGeometry.rows).length;
    this.setDressDetails(this.detailsGeometry);
    this.resize(true);
  }

  setSimulation(simulation) {
    this.simulation = simulation;
    const entries = [
      { binding: 0, resource: { buffer: simulation.positionBuffer } },
      { binding: 1, resource: { buffer: this.sceneUniformBuffer } },
    ];
    this.clothBindGroup = this.device.createBindGroup({
      label: 'live fabric positions and material',
      layout: this.clothPipeline.getBindGroupLayout(0),
      entries,
    });
    this.clothWireBindGroup = this.device.createBindGroup({
      label: 'live fabric wireframe positions and material',
      layout: this.wirePipeline.getBindGroupLayout(0),
      entries,
    });
  }

  setDressDetails(geometry) {
    if (this.detailsVertexBuffer) this.detailsVertexBuffer.destroy();
    if (this.detailsIndexBuffer) this.detailsIndexBuffer.destroy();
    this.detailsGeometry = geometry;
    this.detailsVertexBuffer = createGPUBuffer(this.device, 'stitched garment details', geometry.vertices, GPUBufferUsage.VERTEX);
    this.detailsIndexBuffer = createGPUBuffer(this.device, 'stitched garment indices', geometry.indices, GPUBufferUsage.INDEX);
    this.detailsIndexCount = geometry.indexCount;
  }

  resize(force = false) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
    if (this.depthTexture) this.depthTexture.destroy();
    this.depthTexture = this.device.createTexture({
      label: 'viewport depth',
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();
  }

  render({ simulation, dt, time, camera, color, roughness, settings, wireframe = false, showModel = true }) {
    this.resize();
    const aspect = this.width / Math.max(1, this.height);
    const { matrix, eye } = cameraMatrices(camera, aspect, true);
    const material = [color[0], color[1], color[2], roughness];
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, packUniforms(matrix, eye, material, time));
    const encoder = this.device.createCommandEncoder({ label: 'stitch viewport frame' });
    if (settings.running && simulation) simulation.encode(encoder, dt, time, settings);
    const pass = encoder.beginRenderPass({
      label: 'studio render pass',
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    if (showModel) {
      pass.setPipeline(this.staticPipeline);
      pass.setBindGroup(0, this.sceneBindGroup);
      pass.setVertexBuffer(0, this.staticVertexBuffer);
      pass.setIndexBuffer(this.staticIndexBuffer, 'uint16');
      pass.drawIndexed(this.staticIndexCount);
    }
    if (this.detailsIndexCount) {
      pass.setPipeline(this.staticPipeline);
      pass.setBindGroup(0, this.sceneBindGroup);
      pass.setVertexBuffer(0, this.detailsVertexBuffer);
      pass.setIndexBuffer(this.detailsIndexBuffer, 'uint16');
      pass.drawIndexed(this.detailsIndexCount);
    }
    if (simulation && this.clothBindGroup) {
      if (wireframe) {
        pass.setPipeline(this.wirePipeline);
        pass.setBindGroup(0, this.clothWireBindGroup);
        pass.setIndexBuffer(this.clothWireIndexBuffer, 'uint16');
        pass.drawIndexed(this.clothWireIndexCount);
      } else {
        pass.setPipeline(this.clothPipeline);
        pass.setBindGroup(0, this.clothBindGroup);
        pass.setIndexBuffer(this.clothIndexBuffer, 'uint16');
        pass.drawIndexed(this.clothGeometry.indices.length);
      }
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose() {
    this.depthTexture?.destroy();
    this.staticVertexBuffer?.destroy();
    this.staticIndexBuffer?.destroy();
    this.detailsVertexBuffer?.destroy();
    this.detailsIndexBuffer?.destroy();
    this.clothIndexBuffer?.destroy();
    this.clothWireIndexBuffer?.destroy();
    this.sceneUniformBuffer?.destroy();
    this.device?.destroy();
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, GL_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, GL_FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Could not link the viewport shaders.');
  return program;
}

export function createWebGLRenderer(canvas, modelGeometry, clothGeometry, detailsGeometry) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This browser does not provide a WebGPU or WebGL2 renderer.');
  return new WebGLRenderer(canvas, gl, modelGeometry, clothGeometry, detailsGeometry);
}

class WebGLRenderer {
  constructor(canvas, gl, modelGeometry, clothGeometry, detailsGeometry) {
    this.type = 'webgl';
    this.canvas = canvas;
    this.gl = gl;
    this.modelGeometry = modelGeometry;
    this.clothGeometry = clothGeometry;
    this.detailsGeometry = detailsGeometry;
    this.isWireframe = false;
    this.staticVisible = true;
    this.program = createProgram(gl);
    this.locations = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor'),
      roughness: gl.getAttribLocation(this.program, 'aRoughness'),
      matrix: gl.getUniformLocation(this.program, 'uViewProjection'),
      camera: gl.getUniformLocation(this.program, 'uCamera'),
      tint: gl.getUniformLocation(this.program, 'uTint'),
    };
    this.staticVertexBuffer = gl.createBuffer();
    this.staticIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, modelGeometry.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.staticIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, modelGeometry.indices, gl.STATIC_DRAW);
    this.staticIndexCount = modelGeometry.indexCount;
    this.detailsVertexBuffer = gl.createBuffer();
    this.detailsIndexBuffer = gl.createBuffer();
    this.setDressDetails(detailsGeometry);
    this.clothVertexBuffer = gl.createBuffer();
    this.clothIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.clothIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, clothGeometry.indices, gl.STATIC_DRAW);
    this.wireIndices = createWireIndices(clothGeometry.cols, clothGeometry.rows);
    this.clothWireIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.clothWireIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.wireIndices, gl.STATIC_DRAW);
    this.clothWireIndexCount = this.wireIndices.length;
    this.resize();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  setDressDetails(geometry) {
    this.detailsGeometry = geometry;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.detailsVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.detailsIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    this.detailsIndexCount = geometry.indexCount;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.width = width;
    this.height = height;
  }

  bindGeometry(vertexBuffer, indexBuffer) {
    const gl = this.gl;
    const loc = this.locations;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.enableVertexAttribArray(loc.position);
    gl.enableVertexAttribArray(loc.normal);
    gl.enableVertexAttribArray(loc.color);
    gl.enableVertexAttribArray(loc.roughness);
    gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 44, 0);
    gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 44, 12);
    gl.vertexAttribPointer(loc.color, 4, gl.FLOAT, false, 44, 24);
    gl.vertexAttribPointer(loc.roughness, 1, gl.FLOAT, false, 44, 40);
  }

  render({ simulation, dt, time, camera, color, roughness, settings, wireframe = false, showModel = true }) {
    this.resize();
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const aspect = this.width / Math.max(1, this.height);
    const { matrix, eye } = cameraMatrices(camera, aspect, false);
    gl.uniformMatrix4fv(this.locations.matrix, false, matrix);
    gl.uniform3fv(this.locations.camera, eye);
    if (showModel) {
      gl.uniform3f(this.locations.tint, 1, 1, 1);
      this.bindGeometry(this.staticVertexBuffer, this.staticIndexBuffer);
      gl.drawElements(gl.TRIANGLES, this.staticIndexCount, gl.UNSIGNED_SHORT, 0);
    }
    if (this.detailsIndexCount) {
      gl.uniform3f(this.locations.tint, 1, 1, 1);
      this.bindGeometry(this.detailsVertexBuffer, this.detailsIndexBuffer);
      gl.drawElements(gl.TRIANGLES, this.detailsIndexCount, gl.UNSIGNED_SHORT, 0);
    }
    if (simulation) {
      const vertices = makeClothRenderVertices(simulation.positions, simulation.cols, simulation.rows, roughness);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.clothVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.uniform3fv(this.locations.tint, color);
      if (wireframe) {
        this.bindGeometry(this.clothVertexBuffer, this.clothWireIndexBuffer);
        gl.drawElements(gl.LINES, this.clothWireIndexCount, gl.UNSIGNED_SHORT, 0);
      } else {
        this.bindGeometry(this.clothVertexBuffer, this.clothIndexBuffer);
        gl.drawElements(gl.TRIANGLES, this.clothGeometry.indices.length, gl.UNSIGNED_SHORT, 0);
      }
    }
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.staticVertexBuffer);
    gl.deleteBuffer(this.staticIndexBuffer);
    gl.deleteBuffer(this.detailsVertexBuffer);
    gl.deleteBuffer(this.detailsIndexBuffer);
    gl.deleteBuffer(this.clothVertexBuffer);
    gl.deleteBuffer(this.clothIndexBuffer);
    gl.deleteBuffer(this.clothWireIndexBuffer);
    gl.deleteProgram(this.program);
  }
}
