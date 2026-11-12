// WebGL2 GPU 2.5D Shallow-Water + Coastal Shore Bathymetry + Mass-Conserving Continuum Foam Engine
// Zero foam textures. Zero fake particle sprites. Includes full Canvas2D fallback.

import {
  FULLSCREEN_VERT,
  VORTICITY_FRAG,
  SWE_STEP_FRAG,
  FOAM_STEP_FRAG,
  FLOW_ADVECTION_FRAG,
  SKY_VERT,
  SKY_FRAG,
  WATER_SURFACE_VERT,
  WATER_SURFACE_FRAG,
  WATER_SKIRT_VERT,
  WATER_SKIRT_FRAG,
  SEABED_VERT,
  SEABED_FRAG,
  BOAT_VERT,
  BOAT_FRAG,
  LINE_VERT,
  LINE_FRAG,
  POST_FRAG,
} from './Shaders.js';
import {
  CreateWaveMirror,
  ResetWaveMirror,
  InjectMirrorImpulse,
  StepWaveMirror,
  CreateBoatState,
  ResetBoatState,
  StepBoatPhysics,
  BuildBoatModelMatrix,
  BuildBoatMesh,
  EstimateShorelineX,
} from './BoatPhysics.js';

function HexToRgb01(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return [0.35, 0.55, 0.7];
  const n = parseInt(m[1], 16);
  const r = Math.pow(((n >> 16) & 255) / 255, 2.2);
  const g = Math.pow(((n >> 8) & 255) / 255, 2.2);
  const b = Math.pow((n & 255) / 255, 2.2);
  return [r, g, b];
}

function Mat4Perspective(fovRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovRad * 0.5);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function Mat4LookAt(eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

function Mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function Mat4Invert(m) {
  const out = new Float32Array(16);
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

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

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return out;
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export class FluidWaterEngine {
  constructor(canvas, sceneValues, hiddenMap) {
    this.canvas = canvas;
    this.values = sceneValues;
    this.hidden = hiddenMap;
    this.selectedId = 'waterbody';

    this.paused = false;
    this.debugView = 0;
    this.projectionMode = 'PERSP';
    this.simTime = 0;
    this.flowClock = 0;
    this.prevFlowPhaseA = 0;
    this.prevFlowPhaseB = 0.5;
    this.activeSimRes = 0;

    this.keys = new Set();
    this.mirror = CreateWaveMirror(64);
    this.boat = CreateBoatState();
    ResetBoatState(this.boat, this.values.waterbody, this.values.shore);

    this.brush = {
      active: false,
      worldX: 0,
      worldZ: 0,
      velX: 0,
      velZ: 0,
    };

    this.pointerMode = null;
    this.lastPointer = { x: 0, y: 0 };
    this.viewProj = new Float32Array(16);
    this.invViewProj = new Float32Array(16);
    this.cameraPos = [24, 16, 24];

    this.telemetry = {
      fps: 60,
      simStepMs: 0.8,
      backend: 'WebGL2 Float GPU',
      simRes: 256,
      boatSpeed: 0,
      boatPitchDeg: 0,
      boatRollDeg: 0,
      boatHeaveM: 0,
      foamActivity: 0.14,
      cameraYaw: 44,
      cameraPitch: 26,
    };

    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._lastFrameTs = performance.now();

    this.isWebGL2 = false;
    this._initWebGL2();
    this._bindEvents();
  }

  _initWebGL2() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      this._initSoftwareFallback();
      return;
    }

    const extFloat = gl.getExtension('EXT_color_buffer_float');
    const extHalf = gl.getExtension('EXT_color_buffer_half_float');
    if (!extFloat && !extHalf) {
      this._initSoftwareFallback();
      return;
    }

    this.gl = gl;
    this.isWebGL2 = true;
    this.floatFormat = gl.RGBA16F;
    this.floatType = gl.HALF_FLOAT;
    this.telemetry.backend = 'WebGL2 RGBA16F GPU';

    try {
      this._compilePrograms();
      this._buildStaticGeometry();
      this._ensureSimTextures(this.values.waterbody.SimResolution);
      this._initFlowTextures();
      this._ensureSceneRenderTarget(Math.max(1, this.canvas.width), Math.max(1, this.canvas.height));
      this._seedInitialWake();
    } catch (err) {
      console.warn('WebGL2 fluid init failed, switching to Canvas2D fallback:', err);
      this.isWebGL2 = false;
      this._initSoftwareFallback();
    }
  }

  _initSoftwareFallback() {
    this.isWebGL2 = false;
    this.ctx2d = this.canvas.getContext('2d');
    this.telemetry.backend = 'Canvas2D Software Fallback';
  }

  _compileShader(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile failed: ' + log);
    }
    return sh;
  }

  _createProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const vs = this._compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('Program link failed: ' + log);
    }
    const uniforms = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (info) uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return { prog, uniforms };
  }

  _compilePrograms() {
    this.programs = {
      vorticity: this._createProgram(FULLSCREEN_VERT, VORTICITY_FRAG),
      swe: this._createProgram(FULLSCREEN_VERT, SWE_STEP_FRAG),
      foam: this._createProgram(FULLSCREEN_VERT, FOAM_STEP_FRAG),
      flow: this._createProgram(FULLSCREEN_VERT, FLOW_ADVECTION_FRAG),
      sky: this._createProgram(SKY_VERT, SKY_FRAG),
      water: this._createProgram(WATER_SURFACE_VERT, WATER_SURFACE_FRAG),
      skirt: this._createProgram(WATER_SKIRT_VERT, WATER_SKIRT_FRAG),
      seabed: this._createProgram(SEABED_VERT, SEABED_FRAG),
      boat: this._createProgram(BOAT_VERT, BOAT_FRAG),
      line: this._createProgram(LINE_VERT, LINE_FRAG),
      post: this._createProgram(FULLSCREEN_VERT, POST_FRAG),
    };
  }

  _createSimTarget(width, height) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.floatFormat, width, height, 0, gl.RGBA, this.floatType, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Simulation FBO incomplete');
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, width, height };
  }

  _deleteTarget(target) {
    if (!target || !this.gl) return;
    this.gl.deleteFramebuffer(target.fbo);
    this.gl.deleteTexture(target.tex);
  }

  _ensureSimTextures(res) {
    const n = Math.max(64, Math.min(384, Math.round(res || 256)));
    if (this.activeSimRes === n && this.simTargets) return;
    if (this.simTargets) {
      for (const k of Object.keys(this.simTargets)) {
        const item = this.simTargets[k];
        if (Array.isArray(item)) item.forEach((t) => this._deleteTarget(t));
        else this._deleteTarget(item);
      }
    }
    this.activeSimRes = n;
    this.telemetry.simRes = n;
    this.simTargets = {
      water: [this._createSimTarget(n, n), this._createSimTarget(n, n)],
      foam: [this._createSimTarget(n, n), this._createSimTarget(n, n)],
      flow: [this._createSimTarget(n, n), this._createSimTarget(n, n)],
      vort: this._createSimTarget(n, n),
    };
    this.waterIdx = 0;
    this.foamIdx = 0;
    this.flowIdx = 0;
    this._initFlowTextures();
  }

  _initFlowTextures() {
    if (!this.isWebGL2 || !this.simTargets) return;
    const gl = this.gl;
    const p = this.programs.flow;
    const w = this.values.waterbody;
    gl.bindVertexArray(this.emptyVao);
    gl.useProgram(p.prog);
    gl.viewport(0, 0, this.activeSimRes, this.activeSimRes);
    gl.uniform2f(p.uniforms.uSimRes, this.activeSimRes, this.activeSimRes);
    gl.uniform2f(p.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
    gl.uniform1f(p.uniforms.uDt, 0);
    gl.uniform2f(p.uniforms.uWindVec, 0, 0);
    gl.uniform1f(p.uniforms.uFoamAdvectSlip, 1);
    gl.uniform1f(p.uniforms.uResetA, 1);
    gl.uniform1f(p.uniforms.uResetB, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.simTargets.flow[0].tex);
    gl.uniform1i(p.uniforms.uFlowTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[0].tex);
    gl.uniform1i(p.uniforms.uWaterTex, 1);

    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simTargets.flow[i].fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _ensureSceneRenderTarget(width, height) {
    if (!this.isWebGL2) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.sceneTarget && this.sceneTarget.width === w && this.sceneTarget.height === h) return;

    const gl = this.gl;
    if (this.sceneTarget) {
      gl.deleteFramebuffer(this.sceneTarget.fbo);
      gl.deleteTexture(this.sceneTarget.tex);
      gl.deleteRenderbuffer(this.sceneTarget.depthRbo);
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);

    const depthRbo = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRbo);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRbo);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Scene HDR FBO incomplete');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.sceneTarget = { fbo, tex, depthRbo, width: w, height: h };
  }

  _buildStaticGeometry() {
    const gl = this.gl;
    this.emptyVao = gl.createVertexArray();

    // 1) Water Surface Grid Mesh (224 x 224)
    const N = 224;
    const waterVerts = new Float32Array((N + 1) * (N + 1) * 2);
    let ptr = 0;
    for (let z = 0; z <= N; z++) {
      const v = z / N;
      for (let x = 0; x <= N; x++) {
        waterVerts[ptr++] = x / N;
        waterVerts[ptr++] = v;
      }
    }
    const waterIdx = new Uint32Array(N * N * 6);
    let ip = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i0 = z * (N + 1) + x;
        const i1 = i0 + 1;
        const i2 = i0 + (N + 1);
        const i3 = i2 + 1;
        waterIdx[ip++] = i0; waterIdx[ip++] = i2; waterIdx[ip++] = i1;
        waterIdx[ip++] = i1; waterIdx[ip++] = i2; waterIdx[ip++] = i3;
      }
    }
    this.waterMesh = this._makeVao(waterVerts, waterIdx, gl.UNSIGNED_INT, [
      { loc: gl.getAttribLocation(this.programs.water.prog, 'aGridUv'), size: 2, stride: 8, offset: 0 },
    ]);

    // 2) Cutaway Water Skirt Sides along the 4 WaterBody perimeter edges
    const segs = 192;
    const skirtVerts = [];
    const skirtIdx = [];
    const sides = [
      [[0, 0], [1, 0], [0, 0, -1]],
      [[1, 0], [1, 1], [1, 0, 0]],
      [[1, 1], [0, 1], [0, 0, 1]],
      [[0, 1], [0, 0], [-1, 0, 0]],
    ];
    for (const [a, b, nrm] of sides) {
      const base = skirtVerts.length / 6;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const u = a[0] + (b[0] - a[0]) * t;
        const v = a[1] + (b[1] - a[1]) * t;
        skirtVerts.push(u, v, 1, nrm[0], nrm[1], nrm[2]);
        skirtVerts.push(u, v, 0, nrm[0], nrm[1], nrm[2]);
      }
      for (let i = 0; i < segs; i++) {
        const k = base + i * 2;
        skirtIdx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
      }
    }
    this.skirtMesh = this._makeVao(new Float32Array(skirtVerts), new Uint16Array(skirtIdx), gl.UNSIGNED_SHORT, [
      { loc: gl.getAttribLocation(this.programs.skirt.prog, 'aEdgeParam'), size: 3, stride: 24, offset: 0 },
      { loc: gl.getAttribLocation(this.programs.skirt.prog, 'aNormal'), size: 3, stride: 24, offset: 12 },
    ]);

    // 3) Displaced Seabed + Curved Sandy Cove Shore Mesh (160x160 inside bounds + studio floor apron)
    const S = 160;
    const seaVerts = [];
    const seaIdx = [];
    for (let z = 0; z <= S; z++) {
      const v = z / S;
      for (let x = 0; x <= S; x++) {
        seaVerts.push(x / S, v);
      }
    }
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const i0 = z * (S + 1) + x;
        const i1 = i0 + 1;
        const i2 = i0 + (S + 1);
        const i3 = i2 + 1;
        seaIdx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    // Outer studio floor ring outside [0..1]
    const ringBase = seaVerts.length / 2;
    const outer = 6.0;
    const ringPts = [
      [-outer, -outer], [1 + outer, -outer], [1 + outer, 1 + outer], [-outer, 1 + outer],
      [0, 0], [1, 0], [1, 1], [0, 1],
    ];
    for (const [rx, rz] of ringPts) seaVerts.push(rx, rz);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const o0 = ringBase + k, o1 = ringBase + k2;
      const in0 = ringBase + 4 + k, in1 = ringBase + 4 + k2;
      seaIdx.push(o0, in0, o1, o1, in0, in1);
    }
    this.seabedMesh = this._makeVao(new Float32Array(seaVerts), new Uint32Array(seaIdx), gl.UNSIGNED_INT, [
      { loc: gl.getAttribLocation(this.programs.seabed.prog, 'aPosUv'), size: 2, stride: 8, offset: 0 },
    ]);

    // 4) Boat 3D Sculpted Mesh
    const boatGeo = BuildBoatMesh();
    this.boatMesh = this._makeVao(boatGeo.vertices, boatGeo.indices, gl.UNSIGNED_SHORT, [
      { loc: gl.getAttribLocation(this.programs.boat.prog, 'aPos'), size: 3, stride: 28, offset: 0 },
      { loc: gl.getAttribLocation(this.programs.boat.prog, 'aNormal'), size: 3, stride: 28, offset: 12 },
      { loc: gl.getAttribLocation(this.programs.boat.prog, 'aMatId'), size: 1, stride: 28, offset: 24 },
    ]);

    // 5) Dynamic Bounds Wireframe Line Buffer
    this.lineVao = gl.createVertexArray();
    this.lineVbo = gl.createBuffer();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 4096 * 4, gl.DYNAMIC_DRAW);
    const pLoc = gl.getAttribLocation(this.programs.line.prog, 'aPos');
    const cLoc = gl.getAttribLocation(this.programs.line.prog, 'aColor');
    if (pLoc >= 0) {
      gl.enableVertexAttribArray(pLoc);
      gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 28, 0);
    }
    if (cLoc >= 0) {
      gl.enableVertexAttribArray(cLoc);
      gl.vertexAttribPointer(cLoc, 4, gl.FLOAT, false, 28, 12);
    }
    gl.bindVertexArray(null);
  }

  _makeVao(verts, indices, indexType, attrs) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ebo = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    for (const a of attrs) {
      if (a.loc >= 0) {
        gl.enableVertexAttribArray(a.loc);
        gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, a.stride, a.offset);
      }
    }
    gl.bindVertexArray(null);
    return { vao, vbo, ebo, count: indices.length, indexType };
  }

  _seedInitialWake() {
    const oldPaused = this.paused;
    this.paused = false;
    for (let i = 0; i < 65; i++) {
      this._stepSimulation(1 / 45);
    }
    this.paused = oldPaused;
  }

  SetScene(sceneValues, hiddenMap) {
    this.values = sceneValues;
    this.hidden = hiddenMap;
    ResetWaveMirror(this.mirror);
    ResetBoatState(this.boat, this.values.waterbody, this.values.shore);
    this.simTime = 0;
    this.flowClock = 0;
    if (this.isWebGL2) {
      this._ensureSimTextures(this.values.waterbody.SimResolution);
      const gl = this.gl;
      for (const pair of [this.simTargets.water, this.simTargets.foam]) {
        for (const t of pair) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this._initFlowTextures();
      this._seedInitialWake();
    }
  }

  ResetWaves() {
    ResetWaveMirror(this.mirror);
    if (!this.isWebGL2 || !this.simTargets) return;
    const gl = this.gl;
    for (const pair of [this.simTargets.water, this.simTargets.foam]) {
      for (const t of pair) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._initFlowTextures();
  }

  TriggerCenterSplash() {
    const cx = this.values.shore.ShoreEnabled ? -this.values.shore.ShoreWidth * 0.35 : 0;
    InjectMirrorImpulse(this.mirror, cx, 0, 3.0, 2.0, 0, 0);
    if (!this.isWebGL2) return;
    const oldBrush = { ...this.brush };
    this.brush = { active: true, worldX: cx, worldZ: 0, velX: 1.4, velZ: -1.2 };
    this._stepSimulation(1 / 60);
    this.brush = oldBrush;
  }

  ResetBoat() {
    ResetBoatState(this.boat, this.values.waterbody, this.values.shore);
  }

  FrameSelected(id) {
    const cam = this.values.camera;
    if (id === 'boat') {
      cam.TargetX = this.boat.x;
      cam.TargetY = 0.6;
      cam.TargetZ = this.boat.z;
      cam.Distance = Math.max(11, Math.min(20, cam.Distance));
    } else if (id === 'shore') {
      cam.TargetX = EstimateShorelineX(0, this.values.waterbody, this.values.shore);
      cam.TargetY = 0.3;
      cam.TargetZ = 0;
      cam.Distance = 24;
    } else {
      cam.TargetX = 0;
      cam.TargetY = 0.2;
      cam.TargetZ = 0;
      cam.Distance = Math.max(26, this.values.waterbody.BoundWidth * 0.72);
    }
  }

  _computeCameraMatrices(aspect) {
    const cam = this.values.camera;
    const boat = this.boat;
    if (this.values.boat.FollowBoat && !this.hidden.boat) {
      cam.TargetX += (boat.x - cam.TargetX) * 0.14;
      cam.TargetZ += (boat.z - cam.TargetZ) * 0.14;
    }

    let yaw = (cam.YawDeg * Math.PI) / 180;
    let pitch = (cam.PitchDeg * Math.PI) / 180;
    let dist = cam.Distance;

    if (this.projectionMode === 'TOP') {
      pitch = 1.48;
      dist = Math.max(dist, this.values.waterbody.BoundWidth * 0.95);
    } else if (this.projectionMode === 'FRONT') {
      yaw = 0;
      pitch = 0.08;
    } else if (this.projectionMode === 'RIGHT') {
      yaw = Math.PI * 0.5;
      pitch = 0.08;
    }

    const cp = Math.cos(pitch);
    const eye = [
      cam.TargetX + dist * cp * Math.cos(yaw),
      cam.TargetY + dist * Math.sin(pitch),
      cam.TargetZ + dist * cp * Math.sin(yaw),
    ];
    this.cameraPos = eye;

    const proj = Mat4Perspective((cam.FovDeg * Math.PI) / 180, Math.max(0.2, aspect), 0.2, 420.0);
    const view = Mat4LookAt(eye, [cam.TargetX, cam.TargetY, cam.TargetZ], [0, 1, 0]);
    this.viewProj = Mat4Multiply(proj, view);
    this.invViewProj = Mat4Invert(this.viewProj);
  }

  _raycastWaterPlane(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;

    const inv = this.invViewProj;
    const unproject = (z) => {
      const x = inv[0] * ndcX + inv[4] * ndcY + inv[8] * z + inv[12];
      const y = inv[1] * ndcX + inv[5] * ndcY + inv[9] * z + inv[13];
      const w = inv[3] * ndcX + inv[7] * ndcY + inv[11] * z + inv[15];
      const zOut = inv[2] * ndcX + inv[6] * ndcY + inv[10] * z + inv[14];
      return [x / w, y / w, zOut / w];
    };

    const p0 = unproject(-1);
    const p1 = unproject(1);
    const dy = p1[1] - p0[1];
    if (Math.abs(dy) < 1e-5) return null;
    const t = -p0[1] / dy;
    if (t < 0 || t > 100) return null;
    return [p0[0] + (p1[0] - p0[0]) * t, p0[2] + (p1[2] - p0[2]) * t];
  }

  _bindEvents() {
    this._onKeyDown = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        if (this.values.boat.ControlMode === 'manual') e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.lastPointer = { x: e.clientX, y: e.clientY };

      if (e.button === 0 && !e.altKey && !e.shiftKey) {
        const hit = this._raycastWaterPlane(e.clientX, e.clientY);
        const halfW = this.values.waterbody.BoundWidth * 0.5;
        const halfL = this.values.waterbody.BoundLength * 0.5;
        if (hit && Math.abs(hit[0]) <= halfW && Math.abs(hit[1]) <= halfL) {
          this.pointerMode = 'brush';
          this.brush.active = true;
          this.brush.worldX = hit[0];
          this.brush.worldZ = hit[1];
          this.brush.velX = 0;
          this.brush.velZ = 0;
          InjectMirrorImpulse(
            this.mirror,
            hit[0],
            hit[1],
            this.values.waterbody.BrushRadius,
            this.values.waterbody.BrushStrength,
            0,
            0,
          );
          return;
        }
      }
      this.pointerMode = e.shiftKey || e.button === 1 ? 'pan' : 'orbit';
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.pointerMode) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };

      if (this.pointerMode === 'brush') {
        const hit = this._raycastWaterPlane(e.clientX, e.clientY);
        if (hit) {
          this.brush.velX = Math.max(-12, Math.min(12, (hit[0] - this.brush.worldX) * 28));
          this.brush.velZ = Math.max(-12, Math.min(12, (hit[1] - this.brush.worldZ) * 28));
          this.brush.worldX = hit[0];
          this.brush.worldZ = hit[1];
          InjectMirrorImpulse(
            this.mirror,
            hit[0],
            hit[1],
            this.values.waterbody.BrushRadius,
            this.values.waterbody.BrushStrength,
            this.brush.velX,
            this.brush.velZ,
          );
        }
      } else if (this.pointerMode === 'orbit') {
        const cam = this.values.camera;
        cam.YawDeg = (cam.YawDeg + dx * 0.38 + 360) % 360;
        cam.PitchDeg = Math.max(4, Math.min(84, cam.PitchDeg + dy * 0.32));
      } else if (this.pointerMode === 'pan') {
        const cam = this.values.camera;
        const yaw = (cam.YawDeg * Math.PI) / 180;
        const scale = cam.Distance * 0.0018;
        cam.TargetX += (Math.sin(yaw) * dx - Math.cos(yaw) * dy) * scale;
        cam.TargetZ += (-Math.cos(yaw) * dx - Math.sin(yaw) * dy) * scale;
      }
    });

    const endPointer = () => {
      this.pointerMode = null;
      this.brush.active = false;
    };
    this.canvas.addEventListener('pointerup', endPointer);
    this.canvas.addEventListener('pointercancel', endPointer);

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const cam = this.values.camera;
        cam.Distance = Math.max(6, Math.min(130, cam.Distance * (1 + Math.sign(e.deltaY) * 0.09)));
      },
      { passive: false },
    );
  }

  _sunDirection() {
    const sun = this.values.sun;
    const el = (sun.ElevationDeg * Math.PI) / 180;
    const az = (sun.AzimuthDeg * Math.PI) / 180;
    const c = Math.cos(el);
    return [c * Math.cos(az), Math.sin(el), c * Math.sin(az)];
  }

  _windVector() {
    const wind = this.values.wind;
    if (this.hidden.wind) return [0, 0];
    const rad = (wind.DirectionDeg * Math.PI) / 180;
    return [Math.cos(rad) * wind.Speed, Math.sin(rad) * wind.Speed];
  }

  _effectiveShore() {
    const sh = this.values.shore;
    const enabled = sh.ShoreEnabled && !this.hidden.shore && !this.hidden['grp-world'];
    return { ...sh, ShoreEnabled: enabled };
  }

  _stepSimulation(dt) {
    const t0 = performance.now();
    const w = this.values.waterbody;
    const wind = this.values.wind;
    const boatP = this.values.boat;
    const sh = this._effectiveShore();
    const boatVis = !this.hidden.boat && !this.hidden['grp-vessels'];
    const waterVis = !this.hidden.waterbody && !this.hidden['grp-water'];

    this.simTime += dt;
    this._ensureSimTextures(w.SimResolution);

    StepWaveMirror(this.mirror, dt, this.simTime, w, wind, this.boat, boatP, boatVis, sh);
    if (boatVis) {
      StepBoatPhysics(this.boat, dt, this.simTime, this.mirror, w, wind, boatP, this.keys, sh);
    }

    if (!this.isWebGL2 || !waterVis) {
      this.telemetry.simStepMs = performance.now() - t0;
      return;
    }

    const gl = this.gl;
    const res = this.activeSimRes;
    const [windX, windZ] = this._windVector();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVao);
    gl.viewport(0, 0, res, res);

    const dx = Math.min(w.BoundWidth, w.BoundLength) / res;
    const cfl = Math.max(0.04, dx * 0.36);
    const substeps = Math.max(2, Math.min(5, Math.ceil((w.WaveSpeed * dt) / cfl)));
    const subDt = Math.min(0.016, dt / substeps);

    for (let s = 0; s < substeps; s++) {
      const vp = this.programs.vorticity;
      gl.useProgram(vp.prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simTargets.vort.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[this.waterIdx].tex);
      gl.uniform1i(vp.uniforms.uWaterTex, 0);
      gl.uniform2f(vp.uniforms.uSimRes, res, res);
      gl.uniform2f(vp.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const sp = this.programs.swe;
      gl.useProgram(sp.prog);
      gl.uniform2f(sp.uniforms.uSimRes, res, res);
      gl.uniform2f(sp.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
      gl.uniform1f(sp.uniforms.uDt, subDt);
      gl.uniform1f(sp.uniforms.uWaveSpeed, w.WaveSpeed);
      gl.uniform1f(sp.uniforms.uWaterDepth, w.WaterDepth);
      gl.uniform1f(sp.uniforms.uDamping, w.WaveDamping);
      gl.uniform1f(sp.uniforms.uVorticityStrength, w.VorticityConfinement);
      gl.uniform1i(sp.uniforms.uBoundaryMode, w.BoundaryMode);

      gl.uniform1f(sp.uniforms.uShoreEnabled, sh.ShoreEnabled ? 1.0 : 0.0);
      gl.uniform1f(sp.uniforms.uShoreWidth, sh.ShoreWidth);
      gl.uniform1f(sp.uniforms.uShoreSlope, sh.ShoreSlope);
      gl.uniform1f(sp.uniforms.uShoreCurve, sh.ShoreCurve);

      gl.uniform1f(sp.uniforms.uBoatVisible, boatVis ? 1.0 : 0.0);
      gl.uniform2f(sp.uniforms.uBoatPos, this.boat.x, this.boat.z);
      gl.uniform2f(sp.uniforms.uBoatVel, this.boat.vx, this.boat.vz);
      gl.uniform1f(sp.uniforms.uBoatYaw, this.boat.yaw);
      gl.uniform1f(sp.uniforms.uBoatY, this.boat.y);
      gl.uniform2f(sp.uniforms.uBoatHalfLenBeam, boatP.HullLength * 0.5, boatP.HullBeam * 0.5);
      gl.uniform1f(sp.uniforms.uBoatDraft, boatP.DraftDepth);
      gl.uniform1f(sp.uniforms.uWakeCoupling, boatP.WakeCoupling);
      gl.uniform1f(sp.uniforms.uPropWash, boatP.PropWashIntensity);

      gl.uniform1f(sp.uniforms.uBrushActive, this.brush.active && s === 0 ? 1.0 : 0.0);
      gl.uniform2f(sp.uniforms.uBrushWorldXZ, this.brush.worldX, this.brush.worldZ);
      gl.uniform2f(sp.uniforms.uBrushVel, this.brush.velX, this.brush.velZ);
      gl.uniform1f(sp.uniforms.uBrushRadius, w.BrushRadius);
      gl.uniform1f(sp.uniforms.uBrushStrength, w.BrushStrength);
      gl.uniform2f(sp.uniforms.uWindVec, windX, windZ);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.simTargets.vort.tex);
      gl.uniform1i(sp.uniforms.uVortTex, 1);

      let nextWater = 1 - this.waterIdx;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simTargets.water[nextWater].fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[this.waterIdx].tex);
      gl.uniform1i(sp.uniforms.uWaterTex, 0);
      gl.uniform1f(sp.uniforms.uStepPhase, 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.waterIdx = nextWater;

      nextWater = 1 - this.waterIdx;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simTargets.water[nextWater].fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[this.waterIdx].tex);
      gl.uniform1i(sp.uniforms.uWaterTex, 0);
      gl.uniform1f(sp.uniforms.uStepPhase, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.waterIdx = nextWater;
    }

    // Mass-Conserving Continuum Foam Step
    const fp = this.programs.foam;
    const nextFoam = 1 - this.foamIdx;
    gl.useProgram(fp.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.simTargets.foam[nextFoam].fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.simTargets.foam[this.foamIdx].tex);
    gl.uniform1i(fp.uniforms.uFoamTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[this.waterIdx].tex);
    gl.uniform1i(fp.uniforms.uWaterTex, 1);

    gl.uniform2f(fp.uniforms.uSimRes, res, res);
    gl.uniform2f(fp.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
    gl.uniform1f(fp.uniforms.uDt, dt);
    gl.uniform1f(fp.uniforms.uTime, this.simTime);
    gl.uniform1f(fp.uniforms.uSwellAmp, w.SwellAmplitude);
    gl.uniform1f(fp.uniforms.uSwellFreq, w.SwellFrequency);
    gl.uniform1f(fp.uniforms.uCrossChop, w.CrossChop);
    gl.uniform2f(fp.uniforms.uWindVec, windX, windZ);
    gl.uniform1f(fp.uniforms.uFoamAdvectSlip, w.FoamAdvectSlip);

    gl.uniform1f(fp.uniforms.uWaterDepth, w.WaterDepth);
    gl.uniform1f(fp.uniforms.uShoreEnabled, sh.ShoreEnabled ? 1.0 : 0.0);
    gl.uniform1f(fp.uniforms.uShoreWidth, sh.ShoreWidth);
    gl.uniform1f(fp.uniforms.uShoreSlope, sh.ShoreSlope);
    gl.uniform1f(fp.uniforms.uShoreCurve, sh.ShoreCurve);
    gl.uniform1f(fp.uniforms.uSurfBreakStrength, sh.SurfBreakStrength);

    gl.uniform1f(fp.uniforms.uBreakingThreshold, w.BreakingThreshold);
    gl.uniform1f(fp.uniforms.uBreakingRate, w.BreakingRate);
    gl.uniform1f(fp.uniforms.uConvergenceRate, w.ConvergenceRate);
    gl.uniform1f(fp.uniforms.uHullFoamChurn, w.HullFoamChurn);
    gl.uniform1f(fp.uniforms.uThickDrainageRate, w.ThickDrainageRate);
    gl.uniform1f(fp.uniforms.uLaceRuptureRate, w.LaceRuptureRate);
    gl.uniform1f(fp.uniforms.uSubsurfaceDecay, w.SubsurfaceDecay);
    gl.uniform1f(fp.uniforms.uMaxFoamBudget, w.MaxFoamBudget);
    gl.uniform1i(fp.uniforms.uBoundaryMode, w.BoundaryMode);

    gl.uniform1f(fp.uniforms.uBoatVisible, boatVis ? 1.0 : 0.0);
    gl.uniform2f(fp.uniforms.uBoatPos, this.boat.x, this.boat.z);
    gl.uniform2f(fp.uniforms.uBoatVel, this.boat.vx, this.boat.vz);
    gl.uniform1f(fp.uniforms.uBoatYaw, this.boat.yaw);
    gl.uniform1f(fp.uniforms.uBoatVY, this.boat.vy);
    gl.uniform2f(fp.uniforms.uBoatHalfLenBeam, boatP.HullLength * 0.5, boatP.HullBeam * 0.5);
    gl.uniform1f(fp.uniforms.uPropWash, boatP.PropWashIntensity);

    gl.uniform1f(fp.uniforms.uBrushActive, this.brush.active ? 1.0 : 0.0);
    gl.uniform2f(fp.uniforms.uBrushWorldXZ, this.brush.worldX, this.brush.worldZ);
    gl.uniform2f(fp.uniforms.uBrushVel, this.brush.velX, this.brush.velZ);
    gl.uniform1f(fp.uniforms.uBrushRadius, w.BrushRadius);
    gl.uniform1f(fp.uniforms.uBrushStrength, w.BrushStrength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.foamIdx = nextFoam;

    // Dual-Phase Flow Coordinate Advection
    const cycleSec = 8.5;
    this.flowClock += dt;
    const phaseA = (this.flowClock / cycleSec) % 1.0;
    const phaseB = (this.flowClock / cycleSec + 0.5) % 1.0;
    const resetA = phaseA < this.prevFlowPhaseA ? 1.0 : 0.0;
    const resetB = phaseB < this.prevFlowPhaseB ? 1.0 : 0.0;
    this.prevFlowPhaseA = phaseA;
    this.prevFlowPhaseB = phaseB;

    const flp = this.programs.flow;
    const nextFlow = 1 - this.flowIdx;
    gl.useProgram(flp.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.simTargets.flow[nextFlow].fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.simTargets.flow[this.flowIdx].tex);
    gl.uniform1i(flp.uniforms.uFlowTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[this.waterIdx].tex);
    gl.uniform1i(flp.uniforms.uWaterTex, 1);

    gl.uniform2f(flp.uniforms.uSimRes, res, res);
    gl.uniform2f(flp.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
    gl.uniform1f(flp.uniforms.uDt, dt);
    gl.uniform2f(flp.uniforms.uWindVec, windX * wind.SurfaceDrift, windZ * wind.SurfaceDrift);
    gl.uniform1f(flp.uniforms.uFoamAdvectSlip, w.FoamAdvectSlip);
    gl.uniform1f(flp.uniforms.uResetA, resetA);
    gl.uniform1f(flp.uniforms.uResetB, resetB);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.flowIdx = nextFlow;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.telemetry.simStepMs = performance.now() - t0;

    const swellEnergy = Math.max(0, w.SwellAmplitude * (0.4 + w.CrossChop * 0.5) - w.BreakingThreshold * 0.5);
    const surfEnergy = sh.ShoreEnabled ? 0.08 * sh.SurfBreakStrength : 0;
    const targetFoamIdx = Math.min(0.65, this.boat.foamChurn * 0.14 + swellEnergy * 0.25 + surfEnergy + (this.brush.active ? 0.18 : 0));
    this.telemetry.foamActivity += (targetFoamIdx - this.telemetry.foamActivity) * 0.08;
  }

  _drawBoundsWireframe() {
    const gl = this.gl;
    const w = this.values.waterbody;
    const sh = this._effectiveShore();
    if (!w.ShowBounds) return;

    const hw = w.BoundWidth * 0.5;
    const hl = w.BoundLength * 0.5;
    const yBot = -w.WaterDepth;
    const yTop = w.BoundsHeight;

    const isSelected = this.selectedId === 'waterbody';
    const col = isSelected ? [1.0, 0.71, 0.33, 0.92] : [0.35, 0.72, 0.86, 0.72];
    const dimCol = isSelected ? [1.0, 0.71, 0.33, 0.42] : [0.35, 0.72, 0.86, 0.32];
    const verts = [];

    const pushSeg = (ax, ay, az, bx, by, bz, c) => {
      verts.push(ax, ay, az, c[0], c[1], c[2], c[3]);
      verts.push(bx, by, bz, c[0], c[1], c[2], c[3]);
    };

    const corners = [
      [-hw, -hl],
      [hw, -hl],
      [hw, hl],
      [-hw, hl],
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      pushSeg(a[0], yTop, a[1], b[0], yTop, b[1], dimCol);
      pushSeg(a[0], 0.0, a[1], b[0], 0.0, b[1], col);
      pushSeg(a[0], yBot, a[1], b[0], yBot, b[1], col);
      pushSeg(a[0], yBot, a[1], a[0], yTop, a[1], col);
    }

    const step = 4.0;
    for (let x = -hw + step; x < hw; x += step) {
      pushSeg(x, yBot, -hl, x, yBot + 0.25, -hl, dimCol);
      pushSeg(x, yBot, hl, x, yBot + 0.25, hl, dimCol);
    }
    for (let z = -hl + step; z < hl; z += step) {
      pushSeg(-hw, yBot, z, -hw, yBot + 0.25, z, dimCol);
      pushSeg(hw, yBot, z, hw, yBot + 0.25, z, dimCol);
    }

    // Highlight curved Shore waterline when Shore is selected in Outliner!
    if (this.selectedId === 'shore' && sh.ShoreEnabled) {
      const shoreCol = [1.0, 0.78, 0.35, 0.95];
      const segs = 48;
      for (let i = 0; i < segs; i++) {
        const z0 = -hl + (i / segs) * w.BoundLength;
        const z1 = -hl + ((i + 1) / segs) * w.BoundLength;
        const x0 = Math.max(-hw, Math.min(hw, EstimateShorelineX(z0, w, sh)));
        const x1 = Math.max(-hw, Math.min(hw, EstimateShorelineX(z1, w, sh)));
        pushSeg(x0, 0.06, z0, x1, 0.06, z1, shoreCol);
      }
    }

    if (this.selectedId === 'boat' && !this.hidden.boat) {
      const boatCol = [1.0, 0.71, 0.33, 0.95];
      const r = Math.max(this.values.boat.HullLength, this.values.boat.HullBeam) * 0.62;
      const segs = 32;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        pushSeg(
          this.boat.x + Math.cos(a0) * r, this.boat.y + 0.2, this.boat.z + Math.sin(a0) * r,
          this.boat.x + Math.cos(a1) * r, this.boat.y + 0.2, this.boat.z + Math.sin(a1) * r,
          boatCol,
        );
      }
    }

    const data = new Float32Array(verts);
    const lp = this.programs.line;
    gl.useProgram(lp.prog);
    gl.uniformMatrix4fv(lp.uniforms.uViewProj, false, this.viewProj);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINES, 0, verts.length / 7);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  _renderWebGL2() {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width < 2 || height < 2) return;

    this._ensureSceneRenderTarget(width, height);
    this._computeCameraMatrices(width / height);

    const w = this.values.waterbody;
    const boatP = this.values.boat;
    const sh = this._effectiveShore();
    const sun = this.values.sun;
    const atm = this.values.atmosphere;
    const wind = this.values.wind;
    const sea = this.values.seabed;
    const post = this.values.post;

    const sunDir = this._sunDirection();
    const sunCol = this.hidden.sun ? [0.15, 0.17, 0.22] : HexToRgb01(sun.SunColor);
    const sunInt = this.hidden.sun ? 0.35 : sun.Intensity;
    const zenith = HexToRgb01(atm.ZenithColor);
    const horizon = HexToRgb01(atm.HorizonColor);
    const shallow = HexToRgb01(w.ShallowColor);
    const deep = HexToRgb01(w.DeepColor);
    const sand = HexToRgb01(sea.SandColor);
    const beach = HexToRgb01(sh.BeachColor);
    const [windX, windZ] = this._windVector();

    const waterVis = !this.hidden.waterbody && !this.hidden['grp-water'];
    const boatVis = !this.hidden.boat && !this.hidden['grp-vessels'];
    const seabedVis = !this.hidden.seabed && !this.hidden['grp-world'];
    const atmVis = !this.hidden.atmosphere && !this.hidden['grp-world'];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.03, 0.035, 0.045, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1) Procedural Sky Dome
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    const skyP = this.programs.sky;
    gl.useProgram(skyP.prog);
    gl.uniformMatrix4fv(skyP.uniforms.uInvViewProj, false, this.invViewProj);
    gl.uniform3fv(skyP.uniforms.uCameraPos, this.cameraPos);
    gl.uniform3fv(skyP.uniforms.uSunDir, sunDir);
    gl.uniform3fv(skyP.uniforms.uSunColor, sunCol);
    gl.uniform3fv(skyP.uniforms.uZenithColor, zenith);
    gl.uniform3fv(skyP.uniforms.uHorizonColor, horizon);
    gl.uniform1f(skyP.uniforms.uHazeDensity, atm.HazeDensity);
    gl.uniform1f(skyP.uniforms.uSkyBrightness, atm.SkyBrightness);
    gl.uniform1f(skyP.uniforms.uShowAtmosphere, atmVis ? 1.0 : 0.0);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // 2) Displaced Seabed + Curved Sandy Cove Shore + Studio Reference Grid
    if (seabedVis) {
      const sp = this.programs.seabed;
      gl.useProgram(sp.prog);
      gl.uniformMatrix4fv(sp.uniforms.uViewProj, false, this.viewProj);
      gl.uniform2f(sp.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
      gl.uniform1f(sp.uniforms.uWaterDepth, w.WaterDepth);
      gl.uniform1f(sp.uniforms.uShoreEnabled, sh.ShoreEnabled ? 1.0 : 0.0);
      gl.uniform1f(sp.uniforms.uShoreWidth, sh.ShoreWidth);
      gl.uniform1f(sp.uniforms.uShoreSlope, sh.ShoreSlope);
      gl.uniform1f(sp.uniforms.uShoreCurve, sh.ShoreCurve);

      gl.uniform3fv(sp.uniforms.uSandColor, sand);
      gl.uniform3fv(sp.uniforms.uBeachColor, beach);
      gl.uniform1f(sp.uniforms.uSandWetness, sh.SandWetness);
      gl.uniform3fv(sp.uniforms.uCameraPos, this.cameraPos);
      gl.uniform3fv(sp.uniforms.uSunDir, sunDir);
      gl.uniform3fv(sp.uniforms.uSunColor, sunCol);
      gl.uniform1f(sp.uniforms.uSunIntensity, sunInt);
      gl.uniform3fv(sp.uniforms.uZenithColor, zenith);
      gl.uniform3fv(sp.uniforms.uHorizonColor, horizon);
      gl.uniform1f(sp.uniforms.uCausticIntensity, sea.CausticIntensity);
      gl.uniform1f(sp.uniforms.uCausticScale, sea.CausticScale);
      gl.uniform1f(sp.uniforms.uTime, this.simTime);
      gl.uniform1f(sp.uniforms.uStudioGridOpacity, sea.StudioGridOpacity);
      gl.bindVertexArray(this.seabedMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.seabedMesh.count, this.seabedMesh.indexType, 0);
    }

    // 3) Coupled 3D Boat Vessel
    if (boatVis) {
      const bp = this.programs.boat;
      const modelMat = BuildBoatModelMatrix(this.boat, boatP);
      gl.useProgram(bp.prog);
      gl.uniformMatrix4fv(bp.uniforms.uViewProj, false, this.viewProj);
      gl.uniformMatrix4fv(bp.uniforms.uModel, false, modelMat);
      gl.uniform3fv(bp.uniforms.uCameraPos, this.cameraPos);
      gl.uniform3fv(bp.uniforms.uSunDir, sunDir);
      gl.uniform3fv(bp.uniforms.uSunColor, sunCol);
      gl.uniform1f(bp.uniforms.uSunIntensity, sunInt);
      gl.uniform3fv(bp.uniforms.uZenithColor, zenith);
      gl.uniform3fv(bp.uniforms.uHorizonColor, horizon);
      gl.uniform1f(bp.uniforms.uSkyBrightness, atm.SkyBrightness);
      gl.bindVertexArray(this.boatMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.boatMesh.count, this.boatMesh.indexType, 0);
    }

    // 4) Displaced 3D Water Surface + Analytical Cellular Foam
    if (waterVis) {
      const wp = this.programs.water;
      gl.useProgram(wp.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[this.waterIdx].tex);
      gl.uniform1i(wp.uniforms.uWaterTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.simTargets.foam[this.foamIdx].tex);
      gl.uniform1i(wp.uniforms.uFoamTex, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.simTargets.flow[this.flowIdx].tex);
      gl.uniform1i(wp.uniforms.uFlowTex, 2);

      gl.uniform2f(wp.uniforms.uSimRes, this.activeSimRes, this.activeSimRes);
      gl.uniform2f(wp.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
      gl.uniform1f(wp.uniforms.uTime, this.simTime);
      gl.uniform1f(wp.uniforms.uSwellAmp, w.SwellAmplitude);
      gl.uniform1f(wp.uniforms.uSwellFreq, w.SwellFrequency);
      gl.uniform1f(wp.uniforms.uCrossChop, w.CrossChop);
      gl.uniform2f(wp.uniforms.uWindVec, windX, windZ);
      gl.uniform1f(wp.uniforms.uCapillaryChop, this.hidden.wind ? 0.0 : wind.CapillaryChop);
      gl.uniformMatrix4fv(wp.uniforms.uViewProj, false, this.viewProj);

      gl.uniform1f(wp.uniforms.uWaterDepth, w.WaterDepth);
      gl.uniform1f(wp.uniforms.uShoreEnabled, sh.ShoreEnabled ? 1.0 : 0.0);
      gl.uniform1f(wp.uniforms.uShoreWidth, sh.ShoreWidth);
      gl.uniform1f(wp.uniforms.uShoreSlope, sh.ShoreSlope);
      gl.uniform1f(wp.uniforms.uShoreCurve, sh.ShoreCurve);
      gl.uniform3fv(wp.uniforms.uBeachColor, beach);

      gl.uniform1f(wp.uniforms.uCellScale, w.CellScale);
      gl.uniform1f(wp.uniforms.uFilamentStretch, w.FilamentStretch);
      gl.uniform1f(wp.uniforms.uLaceCrispness, w.LaceCrispness);
      gl.uniform1f(wp.uniforms.uFoamRelief, w.FoamRelief);
      gl.uniform1f(wp.uniforms.uSubsurfaceTintStrength, w.SubsurfaceTintStrength);

      const cycleSec = 8.5;
      gl.uniform1f(wp.uniforms.uFlowPhaseA, (this.flowClock / cycleSec) % 1.0);
      gl.uniform1f(wp.uniforms.uFlowPhaseB, (this.flowClock / cycleSec + 0.5) % 1.0);

      gl.uniform1f(wp.uniforms.uAbsorptionDepth, w.AbsorptionDepth);
      gl.uniform3fv(wp.uniforms.uShallowColor, shallow);
      gl.uniform3fv(wp.uniforms.uDeepColor, deep);
      gl.uniform3fv(wp.uniforms.uSandColor, sand);
      gl.uniform1f(wp.uniforms.uCausticIntensity, sea.CausticIntensity);
      gl.uniform1f(wp.uniforms.uCausticScale, sea.CausticScale);
      gl.uniform1f(wp.uniforms.uFresnelStrength, w.FresnelStrength);
      gl.uniform1f(wp.uniforms.uRoughnessBase, w.RoughnessBase);

      gl.uniform3fv(wp.uniforms.uCameraPos, this.cameraPos);
      gl.uniform3fv(wp.uniforms.uSunDir, sunDir);
      gl.uniform3fv(wp.uniforms.uSunColor, sunCol);
      gl.uniform1f(wp.uniforms.uSunIntensity, sunInt);
      gl.uniform1f(wp.uniforms.uGlintPower, sun.GlintPower);
      gl.uniform3fv(wp.uniforms.uZenithColor, zenith);
      gl.uniform3fv(wp.uniforms.uHorizonColor, horizon);
      gl.uniform1f(wp.uniforms.uHazeDensity, atm.HazeDensity);
      gl.uniform1f(wp.uniforms.uSkyBrightness, atm.SkyBrightness);

      gl.uniform1f(wp.uniforms.uBoatVisible, boatVis ? 1.0 : 0.0);
      gl.uniform2f(wp.uniforms.uBoatPos, this.boat.x, this.boat.z);
      gl.uniform1f(wp.uniforms.uBoatYaw, this.boat.yaw);
      gl.uniform2f(wp.uniforms.uBoatHalfLenBeam, boatP.HullLength * 0.5, boatP.HullBeam * 0.5);
      gl.uniform1i(wp.uniforms.uDebugView, this.debugView);

      gl.bindVertexArray(this.waterMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.waterMesh.count, this.waterMesh.indexType, 0);

      // 5) Translucent Cutaway Glass Water Walls
      if (w.ShowTankWalls) {
        const skp = this.programs.skirt;
        gl.useProgram(skp.prog);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.simTargets.water[this.waterIdx].tex);
        gl.uniform1i(skp.uniforms.uWaterTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.simTargets.foam[this.foamIdx].tex);
        gl.uniform1i(skp.uniforms.uFoamTex, 1);

        gl.uniform2f(skp.uniforms.uSimRes, this.activeSimRes, this.activeSimRes);
        gl.uniform2f(skp.uniforms.uBoundsXZ, w.BoundWidth, w.BoundLength);
        gl.uniform1f(skp.uniforms.uTime, this.simTime);
        gl.uniform1f(skp.uniforms.uSwellAmp, w.SwellAmplitude);
        gl.uniform1f(skp.uniforms.uSwellFreq, w.SwellFrequency);
        gl.uniform1f(skp.uniforms.uCrossChop, w.CrossChop);
        gl.uniform2f(skp.uniforms.uWindVec, windX, windZ);
        gl.uniform1f(skp.uniforms.uWaterDepth, w.WaterDepth);
        gl.uniform1f(skp.uniforms.uShoreEnabled, sh.ShoreEnabled ? 1.0 : 0.0);
        gl.uniform1f(skp.uniforms.uShoreWidth, sh.ShoreWidth);
        gl.uniform1f(skp.uniforms.uShoreSlope, sh.ShoreSlope);
        gl.uniform1f(skp.uniforms.uShoreCurve, sh.ShoreCurve);

        gl.uniformMatrix4fv(skp.uniforms.uViewProj, false, this.viewProj);
        gl.uniform3fv(skp.uniforms.uShallowColor, shallow);
        gl.uniform3fv(skp.uniforms.uDeepColor, deep);
        gl.uniform3fv(skp.uniforms.uCameraPos, this.cameraPos);
        gl.uniform1f(skp.uniforms.uGlassOpacity, sea.TankGlassOpacity);

        gl.bindVertexArray(this.skirtMesh.vao);
        gl.drawElements(gl.TRIANGLES, this.skirtMesh.count, this.skirtMesh.indexType, 0);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    // 6) WaterBody Bounds Wireframe & Selection Rings
    this._drawBoundsWireframe();

    // Final Pass: ACES Tone Mapping + Specular Bloom
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, width, height);
    const pp = this.programs.post;
    gl.useProgram(pp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.tex);
    gl.uniform1i(pp.uniforms.uSceneTex, 0);
    gl.uniform2f(pp.uniforms.uTexelSize, 1.0 / width, 1.0 / height);
    gl.uniform1f(pp.uniforms.uExposureEV, post.ExposureEV);
    gl.uniform1f(pp.uniforms.uContrast, post.Contrast);
    gl.uniform1f(pp.uniforms.uSaturation, post.Saturation);
    gl.uniform1f(pp.uniforms.uBloom, post.Bloom);
    gl.uniform1f(pp.uniforms.uVignette, post.Vignette);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _renderSoftwareFallback() {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.fillStyle = '#09121a';
    ctx.fillRect(0, 0, width, height);

    const w = this.values.waterbody;
    const N = this.mirror.N;
    const pad = 42;
    const boxW = width - pad * 2;
    const boxH = height - pad * 2;

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const h = this.mirror.h[z * N + x];
        const v = Math.hypot(this.mirror.u[z * N + x], this.mirror.v[z * N + x]);
        const c = Math.max(0, Math.min(255, Math.round(120 + h * 180 + v * 35)));
        ctx.fillStyle = `rgb(${Math.round(c * 0.25)}, ${Math.round(c * 0.65)}, ${c})`;
        ctx.fillRect(pad + (x / N) * boxW, pad + (z / N) * boxH, boxW / N + 1, boxH / N + 1);
      }
    }

    if (w.ShowBounds) {
      ctx.strokeStyle = this.selectedId === 'waterbody' ? '#ffb454' : '#58b6d9';
      ctx.lineWidth = 2;
      ctx.strokeRect(pad, pad, boxW, boxH);
    }

    if (!this.hidden.boat) {
      const bx = pad + ((this.boat.x / w.BoundWidth) + 0.5) * boxW;
      const bz = pad + ((this.boat.z / w.BoundLength) + 0.5) * boxH;
      ctx.save();
      ctx.translate(bx, bz);
      ctx.rotate(this.boat.yaw);
      ctx.fillStyle = '#eef1f4';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-14, 9);
      ctx.lineTo(-14, -9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  Resize(cssWidth, cssHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(2, Math.round(cssWidth * dpr));
    const ph = Math.max(2, Math.round(cssHeight * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
  }

  Tick(now) {
    const rawDt = (now - this._lastFrameTs) * 0.001;
    this._lastFrameTs = now;
    const dt = Math.min(0.033, Math.max(0.001, rawDt));

    this._fpsAccum += rawDt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.45) {
      this.telemetry.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    if (!this.paused) {
      this._stepSimulation(dt);
    }

    if (this.isWebGL2) {
      this._renderWebGL2();
    } else {
      this._renderSoftwareFallback();
    }

    this.telemetry.boatSpeed = this.boat.speed;
    this.telemetry.boatPitchDeg = (this.boat.pitch * 180) / Math.PI;
    this.telemetry.boatRollDeg = (this.boat.roll * 180) / Math.PI;
    this.telemetry.boatHeaveM = this.boat.y;
    this.telemetry.cameraYaw = Math.round(this.values.camera.YawDeg);
    this.telemetry.cameraPitch = Math.round(this.values.camera.PitchDeg);
  }

  Destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
