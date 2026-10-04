import { makeClothRenderVertices } from './geometry.js';

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
