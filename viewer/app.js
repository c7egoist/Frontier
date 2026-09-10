// Frontier viewer: raw WebGL, zero dependencies.
// Proves the single-mesh claim: the whole crown bends via pivot wind in ONE
// draw call per material with no junction cracking (verts are shared).
(function () {
  'use strict';
  const canvas = document.getElementById('gl');
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) { document.getElementById('stats').textContent = 'WebGL unavailable'; return; }

  const VS = `
    attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aCol;
    attribute vec3 aPiv; attribute float aFlu;
    uniform mat4 uMVP; uniform float uTime, uWind, uSpeed, uLeaf;
    uniform vec3 uWindDir;
    varying vec3 vN; varying float vAO; varying float vShade;
    vec3 rotAxis(vec3 v, vec3 ax, float ang) {
      float c = cos(ang), s = sin(ang);
      return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
    }
    void main() {
      float weight = aCol.r, phase = aCol.g;
      vAO = aCol.b;
      vec3 off = aPos - aPiv;
      float t = uTime * uSpeed;
      float gust = sin(t * 1.3 + phase * 6.2831) * 0.65
                 + sin(t * 2.9 + phase * 12.566 + aPiv.x) * 0.25
                 + sin(t * 5.1 + phase * 3.0) * 0.10 * aFlu;
      float ang = gust * uWind * (0.10 + 0.55 * weight);
      vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), uWindDir) + vec3(0.0, 0.35, 0.0));
      vec3 p = aPiv + rotAxis(off, ax, ang);
      // leaf flutter: small high-frequency normal wobble
      p += aNrm * (uLeaf * aFlu * 0.02 * uWind * sin(t * 9.0 + phase * 40.0 + aPos.x * 8.0));
      // gentle whole-tree sway so the trunk visibly moves at high wind
      p.xz += uWindDir.xz * (uWind * 0.05 * sin(t * 0.9) * (aPos.y * 0.15));
      vN = aNrm;
      vShade = weight;
      gl_Position = uMVP * vec4(p, 1.0);
    }`;
  const FS = `
    precision mediump float;
    varying vec3 vN; varying float vAO; varying float vShade;
    uniform vec3 uAlbedo; uniform vec3 uLight;
    void main() {
      vec3 n = normalize(vN);
      float d = abs(dot(n, normalize(uLight))) * 0.7 + 0.3;
      float ao = 0.35 + 0.65 * vAO;
      gl_FragColor = vec4(uAlbedo * d * ao, 1.0);
    }`;
  const FS_WIRE = `
    precision mediump float;
    void main() { gl_FragColor = vec4(0.08, 0.09, 0.1, 1.0); }`;

  function prog(vs, fs) {
    function sh(t, s) { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
      if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const P = prog(VS, FS), PW = prog(VS, FS_WIRE);

  function meshBuffers(m, isLeaf) {
    const n = m.positions.length;
    const pos = new Float32Array(m.positions.flat());
    const nrm = new Float32Array(m.normals.flat());
    const col = new Float32Array(m.colors.flat());
    const piv = new Float32Array(m.pivots.flat());
    let flu;
    if (isLeaf) { flu = new Float32Array(n).fill(1.0); }
    else { flu = new Float32Array(m.flutter); }
    const idx = new Uint32Array(m.indices);
    function buf(data, ncomp, type) {
      const b = gl.createBuffer();
      gl.bindBuffer(type || gl.ARRAY_BUFFER, b);
      gl.bufferData(type || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }
    // line indices for wireframe (unique edges)
    const edges = new Set(), L = [];
    for (let i = 0; i < idx.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = idx[i + k], b = idx[i + (k + 1) % 3];
        const key = a < b ? a * 1000000 + b : b * 1000000 + a;
        if (!edges.has(key)) { edges.add(key); L.push(a, b); }
      }
    }
    return { n, triCount: idx.length / 3, bPos: buf(pos), bNrm: buf(nrm), bCol: buf(col),
             bPiv: buf(piv), bFlu: buf(flu), bIdx: buf(idx, 0, gl.ELEMENT_ARRAY_BUFFER),
             bLin: buf(new Uint32Array(L), 0, gl.ELEMENT_ARRAY_BUFFER), lineCount: L.length };
  }
  function bindAll(pr, mb) {
    function attr(name, b, n) { const l = gl.getAttribLocation(pr, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); }
    attr('aPos', mb.bPos, 3); attr('aNrm', mb.bNrm, 3); attr('aCol', mb.bCol, 4);
    attr('aPiv', mb.bPiv, 3); attr('aFlu', mb.bFlu, 1);
  }
  function mat4persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  }
  function mat4mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }

  // camera state
  let yaw = -0.9, pitch = 0.12, dist = 9, target = [0, 2, 0];
  const view = document.getElementById('view');
  let drag = null;
  view.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, y0: yaw, p0: pitch }; view.setPointerCapture(e.pointerId); });
  view.addEventListener('pointermove', e => { if (!drag) return;
    yaw = drag.y0 - (e.clientX - drag.x) * 0.006;
    pitch = Math.min(1.4, Math.max(-0.4, drag.p0 + (e.clientY - drag.y) * 0.006)); });
  view.addEventListener('pointerup', () => drag = null);
  view.addEventListener('wheel', e => { e.preventDefault(); dist = Math.min(30, Math.max(2.5, dist * (1 + e.deltaY * 0.001))); }, { passive: false });

  const ui = id => document.getElementById(id);
  ui('wind').oninput = e => ui('windVal').textContent = (+e.target.value).toFixed(2);
  ui('speed').oninput = e => ui('speedVal').textContent = (+e.target.value).toFixed(2);

  gl.getExtension('OES_element_index_uint');
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  function frame(mvpFn, meshes, t) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = view.clientWidth * dpr, h = view.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.914, 0.929, 0.941, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (ui('spin').checked && !drag) yaw += 0.0035;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const eye = [target[0] + dist * cp * sy, target[1] + dist * sp, target[2] + dist * cp * cy];
    // lookAt
    const z = norm3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    const x = norm3(cross3([0, 1, 0], z)), y = cross3(z, x);
    const V = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
               -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1];
    const mvp = mat4mul(mat4persp(0.7, w / h, 0.1, 100), V);
    const wind = +ui('wind').value, speed = +ui('speed').value;
    const tsec = t * 0.001;
    for (const mm of meshes) {
      if (!mm.show()) continue;
      gl.useProgram(P);
      bindAll(P, mm.mb);
      setU(P, mvp, wind, speed, tsec, mm.albedo, mm.leaf ? 1 : 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mm.mb.bIdx);
      gl.drawElements(gl.TRIANGLES, mm.mb.triCount * 3, gl.UNSIGNED_INT, 0);
      if (ui('wire').checked) {
        gl.useProgram(PW);
        bindAll(PW, mm.mb);
        setU(PW, mvp, wind, speed, tsec, mm.albedo, mm.leaf ? 1 : 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mm.mb.bLin);
        gl.drawElements(gl.LINES, mm.mb.lineCount, gl.UNSIGNED_INT, 0);
      }
    }
  }
  function setU(pr, mvp, wind, speed, t, albedo, leaf) {
    gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'uMVP'), false, mvp);
    gl.uniform1f(gl.getUniformLocation(pr, 'uTime'), t);
    gl.uniform1f(gl.getUniformLocation(pr, 'uWind'), wind);
    gl.uniform1f(gl.getUniformLocation(pr, 'uSpeed'), speed);
    gl.uniform1f(gl.getUniformLocation(pr, 'uLeaf'), leaf);
    gl.uniform3f(gl.getUniformLocation(pr, 'uWindDir'), 0.8, 0, 0.6);
    const la = gl.getUniformLocation(pr, 'uAlbedo');
    if (la) { gl.uniform3f(la, albedo[0], albedo[1], albedo[2]); gl.uniform3f(gl.getUniformLocation(pr, 'uLight'), 0.45, 0.75, 0.55); }
  }
  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  fetch('tree.json').then(r => r.json()).then(data => {
    const meshes = [];
    const bark = meshBuffers(data.bark, false);
    meshes.push({ mb: bark, albedo: [0.45, 0.33, 0.24], leaf: false, show: () => ui('showBark').checked });
    if (data.leaves) {
      const lv = meshBuffers(data.leaves, true);
      meshes.push({ mb: lv, albedo: [0.24, 0.47, 0.2], leaf: true, show: () => ui('showLeaves').checked });
    }
    // fit camera
    const P = data.bark.positions;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of P) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
    target = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    dist = Math.max(mx[1] - mn[1], mx[0] - mn[0], mx[2] - mn[2]) * 1.9;
    ui('validBadge').textContent = data.meta.valid ? '✓ watertight single mesh' : '⚠ validation failed';
    ui('validBadge').style.background = data.meta.valid ? '#1d7a3a' : '#a33';
    const lt = data.leaves ? data.leaves.indices.length / 3 : 0;
    ui('stats').textContent =
      `preset: ${data.meta.preset}  seed: ${data.meta.seed}  lod: ${data.meta.lod}\n` +
      `bark: ${bark.n} verts / ${bark.triCount} tris (1 mesh)\n` +
      `leaves: ${data.leaves ? data.leaves.positions.length : 0} verts / ${lt} tris (1 mesh)\n` +
      `drag = orbit · wheel = zoom`;
    (function loop(t) { frame(null, meshes, t || 0); requestAnimationFrame(loop); })();
  }).catch(err => { ui('stats').textContent = 'failed to load tree.json: ' + err; });
})();
