// WebGL2 landscape viewport: raymarched SDF terrain + procedural non-tiling ocean.
import { GLSL_NOISE } from '../core/noise.js';
import { buildFieldGLSL, MAX_LAYERS, MAX_OPS, UNDER_DEPTH } from '../core/landscape.js';

const VERT = /* glsl */`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Ocean: sum of directional wave components with incommensurate (non-commensurate)
// frequencies in world space + noise-warped phase => no visible tiling/repetition.
const FRAG = /* glsl */`
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uSeaLevel;

${GLSL_NOISE}
${buildFieldGLSL()}

float oceanHeight(vec2 xz, float t) {
  float h = 0.0;
  // 9 directional components, irrational-ish frequency ratios, world-space phases
  h += 0.55 * sin(dot(xz, vec2(0.0211, 0.0173)) * 6.2831 + t * 1.1);
  h += 0.38 * sin(dot(xz, vec2(-0.0347, 0.0289)) * 6.2831 + t * 1.7 + 1.3);
  h += 0.27 * sin(dot(xz, vec2(0.0523, -0.0441)) * 6.2831 + t * 2.3 + 4.1);
  h += 0.19 * sin(dot(xz, vec2(-0.0719, -0.0683)) * 6.2831 + t * 3.1 + 2.2);
  h += 0.12 * sin(dot(xz, vec2(0.1123, 0.0917)) * 6.2831 + t * 4.2 + 5.7);
  h += 0.08 * sin(dot(xz, vec2(-0.1571, 0.1319)) * 6.2831 + t * 5.3 + 0.9);
  h += 0.05 * sin(dot(xz, vec2(0.2113, -0.1877)) * 6.2831 + t * 6.7 + 3.3);
  // noise-warped chop breaks any residual periodicity
  vec2 warp = vec2(fbm(xz * 0.013 + t * 0.05, 4), fbm(xz * 0.017 - t * 0.04, 4)) - 0.5;
  h += 0.22 * sin(dot(xz + warp * 34.0, vec2(0.0877, 0.0761)) * 6.2831 + t * 2.9);
  h += 0.10 * sin(dot(xz - warp * 21.0, vec2(-0.1231, 0.1093)) * 6.2831 + t * 3.7);
  return h;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.6, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

float marchOcean(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    float h = oceanHeight(p.xz, uTime) + uSeaLevel - p.y;
    if (h < 0.15) return t;
    t += max(0.4, h * 0.9);
    if (t > 4000.0) break;
  }
  return -1.0;
}

float march(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 220; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.05 * max(1.0, t * 0.001)) return t;
    t += d * 0.9;
    if (t > 3000.0) break;
  }
  return -1.0;
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRot * vec3((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0), -1.6));

  float tLand = march(ro, rd);
  float tSea = rd.y < 0.0 ? marchOcean(ro, rd) : -1.0;

  vec3 sky = mix(vec3(0.05, 0.07, 0.10), vec3(0.35, 0.5, 0.68), pow(max(0.0, rd.y), 0.6));
  // sun
  vec3 sunDir = normalize(vec3(0.5, 0.55, 0.35));
  sky += vec3(1.0, 0.85, 0.6) * pow(max(0.0, dot(rd, sunDir)), 350.0) * 0.9;
  sky += vec3(1.0, 0.8, 0.55) * pow(max(0.0, dot(rd, sunDir)), 8.0) * 0.12;

  vec3 col = sky;
  float t = -1.0; bool isSea = false;
  if (tLand > 0.0 && (tSea < 0.0 || tLand < tSea)) t = tLand;
  else if (tSea > 0.0) { t = tSea; isSea = true; }

  if (t > 0.0) {
    vec3 p = ro + rd * t;
    if (isSea) {
      // procedural ocean shading: non-tiling normals from analytic derivative + noise
      float e = 1.2;
      float h0 = oceanHeight(p.xz, uTime);
      float hx = oceanHeight(p.xz + vec2(e, 0.0), uTime);
      float hz = oceanHeight(p.xz + vec2(0.0, e), uTime);
      vec3 n = normalize(vec3(h0 - hx, e, h0 - hz));
      vec3 view = -rd;
      float fres = pow(1.0 - max(0.0, dot(n, view)), 5.0);
      vec3 deep = vec3(0.015, 0.09, 0.16);
      vec3 shal = vec3(0.06, 0.28, 0.38);
      vec3 water = mix(deep, shal, fres * 0.7 + 0.15);
      water = mix(water, sky, fres * 0.75);
      float spec = pow(max(0.0, dot(reflect(-sunDir, n), view)), 220.0);
      water += vec3(1.0, 0.9, 0.7) * spec;
      // shoreline foam: fade where terrain SDF is near zero
      float shore = map(p + vec3(0.0, -0.4, 0.0));
      float foam = (1.0 - smoothstep(0.0, 2.5, abs(shore))) * (0.5 + 0.5 * sin(uTime * 2.0 + p.x * 0.3 + p.z * 0.23));
      water = mix(water, vec3(0.85, 0.92, 0.95), foam * 0.55);
      // distance fog
      float fog = 1.0 - exp(-t * 0.0009);
      col = mix(water, sky, fog);
    } else {
      vec3 n = calcNormal(p);
      float ndl = max(0.0, dot(n, sunDir));
      vec3 alb = mix(vec3(0.42, 0.36, 0.28), vec3(0.55, 0.52, 0.45), fbm(p.xz * 0.02, 4));
      if (p.y < uSeaLevel + 0.5) alb = mix(alb, vec3(0.32, 0.3, 0.24), 0.6); // wet shore
      float ao = clamp(map(p + n * 1.5) / 1.5, 0.0, 1.0);
      vec3 c = alb * (0.18 + 0.95 * ndl) * ao;
      c += vec3(1.0, 0.85, 0.6) * pow(max(0.0, dot(reflect(-sunDir, n), -rd)), 24.0) * 0.15;
      float fog = 1.0 - exp(-t * 0.0009);
      col = mix(c, sky, fog);
    }
  }
  // vignette + tonemap
  col = col / (1.0 + col);
  col = pow(col, vec3(0.4545));
  float vig = smoothstep(1.4, 0.4, length(vUv - 0.5) * 1.6);
  col *= mix(0.75, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Viewport3D {
  constructor(canvas, store, hud) {
    this.canvas = canvas;
    this.store = store;
    this.hud = hud;
    this.cam = { pos: [260, 180, 420], yaw: -0.9, pitch: -0.35 };
    this.wasd = false;
    this.keys = new Set();
    this.time = 0;
    this._initGL();
    this._bind();
    this.resize();
    this._last = performance.now();
    this._raf = requestAnimationFrame(() => this.frame());
  }

  _initGL() {
    const gl = this.canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const scalar = ['uRes', 'uTime', 'uCamPos', 'uCamRot', 'uSeaLevel'];
    const arrays = ['uRegion', 'uBase', 'uEdge', 'uVisible', 'uOpLayer', 'uOpType', 'uOpA', 'uOpB', 'uOpVis', 'uOpInfl'];
    for (const name of scalar) this.u[name] = gl.getUniformLocation(prog, name);
    for (const name of arrays) this.u[name] = gl.getUniformLocation(prog, `${name}[0]`) || gl.getUniformLocation(prog, name);
  }

  _bind() {
    let dragging = false, last = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true; last = [e.clientX, e.clientY];
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      if (e.buttons === 2 || e.shiftKey) {
        const s = 0.01;
        const fwd = this.forward();
        this.cam.pos[0] -= (Math.cos(this.cam.yaw) * dx - Math.sin(this.cam.yaw) * dy * 0) * s * 10;
        this.cam.pos[2] -= (Math.sin(this.cam.yaw) * dx) * s * 10;
        this.cam.pos[0] += fwd[0] * dy * s * 10;
        this.cam.pos[2] += fwd[2] * dy * s * 10;
      } else {
        this.cam.yaw -= dx * 0.005;
        this.cam.pitch = Math.max(-1.5, Math.min(1.5, this.cam.pitch - dy * 0.005));
      }
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = this.forward();
      const sp = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      this.cam.pos[0] += f[0] * (e.deltaY * 0.4);
      this.cam.pos[1] += f[1] * (e.deltaY * 0.4);
      this.cam.pos[2] += f[2] * (e.deltaY * 0.4);
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  forward() {
    return [
      -Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch),
      Math.sin(this.cam.pitch),
      -Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch),
    ];
  }

  setWasd(on) { this.wasd = on; }

  resize() {
    const wrap = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(2, wrap.clientWidth * dpr);
    this.canvas.height = Math.max(2, wrap.clientHeight * dpr);
  }

  uploadField() {
    const gl = this.gl;
    const doc = this.store.doc;
    const region = new Float32Array(MAX_LAYERS * 4);
    const base = new Float32Array(MAX_LAYERS);
    const edge = new Float32Array(MAX_LAYERS);
    const vis = new Float32Array(MAX_LAYERS);
    const opLayer = new Int32Array(MAX_OPS).fill(-1);
    const opType = new Int32Array(MAX_OPS).fill(-1);
    const opA = new Float32Array(MAX_OPS * 4);
    const opB = new Float32Array(MAX_OPS * 4);
    const opVis = new Float32Array(MAX_OPS);
    const opInfl = new Float32Array(MAX_OPS);
    doc.layers.slice(0, MAX_LAYERS).forEach((layer, i) => {
      // union bbox of region + box-selected regions keeps GPU path simple
      let x = layer.region.x, y = layer.region.y, x2 = x + layer.region.w, y2 = y + layer.region.h;
      for (const r of layer.regions || []) {
        x = Math.min(x, r.x); y = Math.min(y, r.y);
        x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
      }
      region.set([x, y, x2 - x, y2 - y], i * 4);
      base[i] = layer.baseHeight;
      edge[i] = layer.edgeWidth;
      vis[i] = layer.visible ? 1 : 0;
    });
    let op = 0;
    doc.layers.slice(0, MAX_LAYERS).forEach((layer, i) => {
      for (const lf of layer.landforms) {
        if (op >= MAX_OPS) return;
        opLayer[op] = i;
        opType[op] = Object.keys(LANDFORM_TYPES).indexOf(lf.type);
        const p = lf.params;
        switch (lf.type) {
          case 'fractal': opA.set([p.amplitude, p.scale, p.octaves, 0], op * 4); break;
          case 'multifractal': opA.set([p.amplitude, p.scale, p.octaves, p.gain], op * 4); break;
          case 'ridged': opA.set([p.amplitude, p.scale, p.octaves, p.sharpness], op * 4); break;
          case 'badlands': opA.set([p.amplitude, p.scale, p.octaves, 0], op * 4); opB.set([p.talus, 0, 0, 0], op * 4); break;
          case 'craters': opA.set([p.count, p.radius, p.depth, p.seed], op * 4); opB.set([p.rim, 0, 0, 0], op * 4); break;
          case 'ridges': opA.set([p.amplitude, p.scale, p.octaves, p.angle], op * 4); break;
          case 'dunes': opA.set([p.amplitude, p.wavelength, 0, 0], op * 4); opB.set([p.sharpness, 0, p.windAngle, 0], op * 4); break;
        }
        opVis[op] = lf.visible ? 1 : 0;
        opInfl[op] = p.influence;
        op++;
      }
    });
    gl.uniform4fv(this.u.uRegion, region);
    gl.uniform1fv(this.u.uBase, base);
    gl.uniform1fv(this.u.uEdge, edge);
    gl.uniform1fv(this.u.uVisible, vis);
    gl.uniform1iv(this.u.uOpLayer, opLayer);
    gl.uniform1iv(this.u.uOpType, opType);
    gl.uniform4fv(this.u.uOpA, opA);
    gl.uniform4fv(this.u.uOpB, opB);
    gl.uniform1fv(this.u.uOpVis, opVis);
    gl.uniform1fv(this.u.uOpInfl, opInfl);
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.time += dt;

    if (this.wasd) {
      const sp = (this.keys.has('shift') ? 220 : 70) * dt;
      const f = this.forward();
      const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
      if (this.keys.has('w')) { this.cam.pos[0] += f[0] * sp; this.cam.pos[1] += f[1] * sp; this.cam.pos[2] += f[2] * sp; }
      if (this.keys.has('s')) { this.cam.pos[0] -= f[0] * sp; this.cam.pos[1] -= f[1] * sp; this.cam.pos[2] -= f[2] * sp; }
      if (this.keys.has('a')) { this.cam.pos[0] -= right[0] * sp; this.cam.pos[2] -= right[2] * sp; }
      if (this.keys.has('d')) { this.cam.pos[0] += right[0] * sp; this.cam.pos[2] += right[2] * sp; }
      if (this.keys.has('q')) this.cam.pos[1] -= sp;
      if (this.keys.has('e')) this.cam.pos[1] += sp;
    }

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, this.time);
    gl.uniform3f(this.u.uCamPos, this.cam.pos[0], this.cam.pos[1], this.cam.pos[2]);
    gl.uniform1f(this.u.uSeaLevel, 0);
    const cy = Math.cos(this.cam.yaw), sy = Math.sin(this.cam.yaw);
    const cp = Math.cos(this.cam.pitch), sp2 = Math.sin(this.cam.pitch);
    // rotation matrix (yaw around Y, pitch around X) — columns
    gl.uniformMatrix3fv(this.u.uCamRot, false, new Float32Array([
      cy, 0, -sy,
      sy * sp2, cp, cy * sp2,
      sy * cp, -sp2, cy * cp,
    ]));
    this.uploadField();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.hud.fps = Math.round(1 / Math.max(dt, 1e-3));
    this._raf = requestAnimationFrame(() => this.frame());
  }
}
