import { getMeshWorldTriangles, makeLookAtMatrix } from './scene.js';

const vertexSource = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aAlbedo;
layout(location=3) in vec3 aEmission;
uniform mat4 uViewProjection;
out vec3 vPosition;
out vec3 vNormal;
out vec3 vAlbedo;
out vec3 vEmission;
void main() {
  vPosition = aPosition;
  vNormal = aNormal;
  vAlbedo = aAlbedo;
  vEmission = aEmission;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec3 vAlbedo;
in vec3 vEmission;
uniform vec3 uCameraPosition;
uniform int uMode;
out vec4 outColor;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 n = normalize(vNormal);
  if (uMode == 2) { outColor = vec4(n * 0.5 + 0.5, 1.0); return; }
  if (uMode == 3) { outColor = vec4(pow(max(vAlbedo, vec3(0.0)), vec3(1.0/2.2)), 1.0); return; }
  vec3 lightDir = normalize(vec3(-0.42, -0.32, 0.85));
  vec3 viewDir = normalize(uCameraPosition - vPosition);
  float diffuse = 0.15 + max(dot(n, lightDir), 0.0) * 1.05;
  vec3 halfVector = normalize(lightDir + viewDir);
  float specular = pow(max(dot(n, halfVector), 0.0), 28.0) * 0.24;
  vec3 direct = vAlbedo * diffuse + specular * mix(vec3(0.04), vAlbedo, 0.35) + vEmission;
  outColor = vec4(pow(aces(max(direct, vec3(0.0))), vec3(1.0/2.2)), 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown WebGL shader error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function makeProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Could not link raster fallback');
  return program;
}

export class RasterFallback {
  constructor(canvas, scene) {
    this.canvas = canvas;
    this.scene = scene;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('Neither WebGPU nor WebGL 2 is available in this browser.');
    const gl = this.gl;
    this.program = makeProgram(gl);
    this.buffer = gl.createBuffer();
    this.locations = {
      viewProjection: gl.getUniformLocation(this.program, 'uViewProjection'),
      cameraPosition: gl.getUniformLocation(this.program, 'uCameraPosition'),
      mode: gl.getUniformLocation(this.program, 'uMode')
    };
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = 12 * Float32Array.BYTES_PER_ELEMENT;
    for (const [location, offset] of [[0, 0], [1, 3], [2, 6], [3, 9]]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.025, 0.035, 0.04, 1);
    this.vertexCount = 0;
    this.lastVehiclePose = '';
    this.lastGeometryUpload = 0;
    this.updateGeometry(true);
  }

  updateGeometry(force = false) {
    const pose = `${this.scene.vehicle.x.toFixed(3)}:${this.scene.vehicle.y.toFixed(3)}:${this.scene.vehicle.yaw.toFixed(3)}:${this.scene.vehicle.wheelSpin.toFixed(3)}`;
    const now = performance.now();
    if (!force && pose === this.lastVehiclePose && now - this.lastGeometryUpload < 500) return;
    this.lastVehiclePose = pose;
    this.lastGeometryUpload = now;
    const triangles = getMeshWorldTriangles(this.scene);
    const values = new Float32Array(triangles.length * 3 * 12);
    let cursor = 0;
    for (const tri of triangles) {
      const material = this.scene.materials[tri.material] || this.scene.materials[15];
      for (let corner = 0; corner < 3; corner++) {
        const position = tri.p[corner], normal = tri.n[corner];
        values.set(position, cursor); cursor += 3;
        values.set(normal, cursor); cursor += 3;
        values.set(material.albedo, cursor); cursor += 3;
        values.set(material.emission, cursor); cursor += 3;
      }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.DYNAMIC_DRAW);
    this.vertexCount = values.length / 12;
  }

  render(camera, settings) {
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(2, Math.round(rect.width * ratio));
    const height = Math.max(2, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    this.updateGeometry();
    camera.aspect = width / height;
    const matrix = makeLookAtMatrix(camera);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.viewProjection, false, matrix);
    gl.uniform3fv(this.locations.cameraPosition, camera.position);
    gl.uniform1i(this.locations.mode, settings.mode);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    return { width, height, outputWidth: width, outputHeight: height, effectiveScale: 1, backend: 'WEBGL 2 · RASTER FALLBACK' };
  }

  destroy() {
    this.gl?.deleteBuffer(this.buffer);
    this.gl?.deleteProgram(this.program);
  }
}
