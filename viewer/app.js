// Frontier Studio viewer: raw WebGL, zero dependencies.
// Hardened boot: the data/UI layer (spec, sliders, generate, export, stats)
// ALWAYS runs; the 3D renderer initializes independently and falls back to
// a server-rendered 2D preview when WebGL is unavailable. Errors are sticky
// and every boot step is reported on the status line.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const V = 'v=4'; // cache buster for app data fetches

  /* ---------------- status + errors (never throws) ---------------- */
  function status(msg) {
    const el = $('statusLine');
    if (el) el.textContent = msg;
    console.log('[studio] ' + msg);
  }
  function showErr(msg, sticky) {
    const e = $('err');
    if (!e) return;
    e.textContent = msg;
    e.style.display = 'block';
    clearTimeout(showErr._t);
    if (!sticky) showErr._t = setTimeout(() => { e.style.display = 'none'; }, 6000);
  }
  function clearErr() {
    const e = $('err');
    if (e) e.style.display = 'none';
    clearTimeout(showErr._t);
  }
  window.addEventListener('error', ev => {
    showErr('JS error: ' + (ev.message || ev.error), true);
    status('crashed: ' + (ev.message || ev.error));
  });

  /* ---------------- shared state ---------------- */
  let gl = null, hasGL = false, isGL2 = false;
  let P_BARK = null, P_LEAF = null, P_WIRE = null, P_GROUND = null;
  let TEX = null, groundMesh = null;
  let meshes = [];
  let yaw = -0.9, pitch = 0.14, dist = 10, target = [0, 2.2, 0], groundR = 6;
  let curPreset = 'oak', specParams = [];
  const FOG = [0.925, 0.905, 0.855];

  /* ---------------- shaders ---------------- */
  const VS_MAIN = `
    attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV;
    attribute vec4 aCol; attribute vec3 aPiv; attribute float aFlu;
    uniform mat4 uMVP; uniform float uTime, uWind, uSpeed, uLeaf;
    uniform vec3 uWindDir;
    varying vec3 vN; varying vec2 vUV; varying float vAO, vPhase, vFog;
    varying vec3 vWp;
    vec3 rotAxis(vec3 v, vec3 ax, float ang) {
      float c = cos(ang), s = sin(ang);
      return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
    }
    void main() {
      float weight = aCol.r; vPhase = aCol.g; vAO = aCol.b; vUV = aUV;
      vec3 off = aPos - aPiv;
      float t = uTime * uSpeed;
      float gust = sin(t * 1.3 + vPhase * 6.2831) * 0.65
                 + sin(t * 2.9 + vPhase * 12.566 + aPiv.x) * 0.25
                 + sin(t * 5.1 + vPhase * 3.0) * 0.10 * aFlu;
      float ang = gust * uWind * (0.10 + 0.55 * weight);
      vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), uWindDir) + vec3(0.0, 0.35, 0.0));
      vec3 p = aPiv + rotAxis(off, ax, ang);
      p += aNrm * (uLeaf * aFlu * 0.02 * uWind * sin(t * 9.0 + vPhase * 40.0 + aPos.x * 8.0));
      p.xz += uWindDir.xz * (uWind * 0.05 * sin(t * 0.9) * (aPos.y * 0.15));
      vN = aNrm; vWp = p;
      vec4 mv = uMVP * vec4(p, 1.0);
      gl_Position = mv;
      vFog = max(mv.w, 0.0);
    }`;
  const PERTURB = `
    vec3 perturbNormal(vec3 N, vec3 wp, vec2 uv, float strength) {
      vec3 q0 = dFdx(wp), q1 = dFdy(wp);
      vec2 st0 = dFdx(uv), st1 = dFdy(uv);
      vec3 T = normalize(q0 * st1.t - q1 * st0.t + 1e-7);
      vec3 B = normalize(cross(N, T));
      vec3 mapN = texture2D(uNrmMap, uv).xyz * 2.0 - 1.0;
      mapN.xy *= strength;
      return normalize(mat3(T, B, N) * mapN);
    }`;
  function fragSources(useDeriv, needDirective) {
    const ext = needDirective ? '#extension GL_OES_standard_derivatives : enable' : '';
    const FS_BARK = `
    precision mediump float;
    ${ext}
    varying vec3 vN; varying vec2 vUV; varying float vAO, vPhase, vFog; varying vec3 vWp;
    uniform sampler2D uAlbMap; uniform sampler2D uNrmMap;
    uniform vec3 uLight, uFogColor; uniform float uNrmStr, uFogNear, uFogFar;
    ${useDeriv ? PERTURB : ''}
    void main() {
      vec3 alb = texture2D(uAlbMap, vUV).rgb;
      vec3 N = normalize(vN);
      ${useDeriv ? 'N = perturbNormal(N, vWp, vUV, uNrmStr);' : ''}
      float d = abs(dot(N, normalize(uLight))) * 0.68 + 0.32;
      float hemi = 0.72 + 0.28 * N.y;
      float ao = 0.35 + 0.65 * vAO;
      vec3 col = alb * d * hemi * ao * 1.25;
      float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    }`;
    const FS_LEAF = `
    precision mediump float;
    varying vec3 vN; varying vec2 vUV; varying float vAO, vPhase, vFog; varying vec3 vWp;
    uniform sampler2D uLeafMap;
    uniform vec3 uLight, uFogColor; uniform float uFogNear, uFogFar;
    void main() {
      vec4 tx = texture2D(uLeafMap, vUV);
      if (tx.a < 0.45) discard;
      vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
      float d = abs(dot(N, normalize(uLight))) * 0.62 + 0.38;
      float hemi = 0.7 + 0.3 * abs(N.y);
      float h = fract(vPhase * 7.13);
      vec3 tint = vec3(0.90 + 0.20 * h, 0.94 + 0.12 * h, 0.86 + 0.16 * fract(h * 3.7));
      vec3 col = tx.rgb * tint * d * hemi * 1.1;
      float sss = pow(max(dot(-N, normalize(uLight)), 0.0), 2.0) * 0.35;
      col += tx.rgb * sss;
      float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    }`;
    const FS_WIRE = `
    precision mediump float;
    varying vec3 vN; varying vec2 vUV; varying float vAO, vPhase, vFog; varying vec3 vWp;
    void main() { gl_FragColor = vec4(0.05, 0.06, 0.08, 1.0); }`;
    const VS_GROUND = `
    attribute vec3 aPos; attribute vec2 aUV;
    uniform mat4 uMVP; varying vec2 vUV; varying float vFog;
    void main() { vUV = aUV; vec4 mv = uMVP * vec4(aPos, 1.0);
      gl_Position = mv; vFog = max(mv.w, 0.0); }`;
    const FS_GROUND = `
    precision mediump float;
    varying vec2 vUV; varying float vFog;
    uniform sampler2D uTex; uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
    void main() {
      vec3 col = texture2D(uTex, vUV).rgb;
      float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    }`;
    return { FS_BARK, FS_LEAF, FS_WIRE, VS_GROUND, FS_GROUND };
  }

  function compile(t, s) {
    const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS))
      throw new Error('shader: ' + gl.getShaderInfoLog(h));
    return h;
  }
  function prog(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  /* ---------------- textures ---------------- */
  function loadTex(url, repeat) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
      new ImageData(new Uint8ClampedArray([200, 200, 200, 255]), 1, 1));
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
    };
    img.onerror = () => status('texture failed: ' + url + ' (continuing untextured)');
    img.src = url;
    return tex;
  }
  function groundTexture() {
    const S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, S * 0.02, S / 2, S / 2, S * 0.5);
    g.addColorStop(0.00, '#42502e'); g.addColorStop(0.10, '#5d7340');
    g.addColorStop(0.35, '#7d9a58'); g.addColorStop(0.75, '#b9b49b');
    g.addColorStop(1.00, '#ece7db');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const dx = (x - S / 2) / S, dy = (y - S / 2) / S;
      if (dx * dx + dy * dy > 0.22) continue;
      c.fillStyle = Math.random() < 0.5 ? '#6b8a4c55' : '#8fae6555';
      c.fillRect(x, y, 2, 2);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c.getImageData(0, 0, S, S));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  /* ---------------- mesh buffers ---------------- */
  function meshBuffers(m, isLeaf) {
    const n = m.positions.length;
    const pos = new Float32Array(m.positions.flat());
    const nrm = new Float32Array(m.normals.flat());
    const uv = new Float32Array((m.uvs || m.positions.map(() => [0, 0])).flat());
    const col = new Float32Array(m.colors.flat());
    const piv = new Float32Array(m.pivots.flat());
    const flu = isLeaf ? new Float32Array(n).fill(1.0) : new Float32Array(m.flutter);
    const idx = new Uint32Array(m.indices);
    function buf(data, target) {
      const b = gl.createBuffer();
      gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    }
    const edges = new Set(), L = [];
    for (let i = 0; i < idx.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = idx[i + k], b = idx[i + (k + 1) % 3];
        const key = (a < b ? a : b) * 4100000 + (a < b ? b : a);
        if (!edges.has(key)) { edges.add(key); L.push(a, b); }
      }
    }
    return {
      n, triCount: idx.length / 3,
      bPos: buf(pos, gl.ARRAY_BUFFER), bNrm: buf(nrm, gl.ARRAY_BUFFER),
      bUV: buf(uv, gl.ARRAY_BUFFER), bCol: buf(col, gl.ARRAY_BUFFER),
      bPiv: buf(piv, gl.ARRAY_BUFFER), bFlu: buf(flu, gl.ARRAY_BUFFER),
      bIdx: buf(idx, gl.ELEMENT_ARRAY_BUFFER),
      bLin: buf(new Uint32Array(L), gl.ELEMENT_ARRAY_BUFFER), lineCount: L.length
    };
  }
  function freeMesh(mb) {
    if (!mb || !gl) return;
    for (const k of ['bPos', 'bNrm', 'bUV', 'bCol', 'bPiv', 'bFlu', 'bIdx', 'bLin']) gl.deleteBuffer(mb[k]);
  }
  function bindMain(pr, mb) {
    function at(name, b, n) {
      const l = gl.getAttribLocation(pr, name);
      if (l < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0);
    }
    at('aPos', mb.bPos, 3); at('aNrm', mb.bNrm, 3); at('aUV', mb.bUV, 2);
    at('aCol', mb.bCol, 4); at('aPiv', mb.bPiv, 3); at('aFlu', mb.bFlu, 1);
  }
  function buildGroundMesh() {
    const SEG = 48, P = [0, 0, 0], UV = [0.5, 0.5], I = [];
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * Math.PI * 2;
      P.push(Math.cos(a), 0, Math.sin(a)); UV.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
    }
    for (let i = 1; i <= SEG; i++) I.push(0, i + 1, i); // up-facing (CCW from +Y)
    function buf(d, t, ty) {
      const b = gl.createBuffer();
      gl.bindBuffer(t, b); gl.bufferData(t, ty === 'f' ? new Float32Array(d) : new Uint16Array(d), gl.STATIC_DRAW); return b;
    }
    return {
      bPos: buf(P, gl.ARRAY_BUFFER, 'f'), bUV: buf(UV, gl.ARRAY_BUFFER, 'f'),
      bIdx: buf(I, gl.ELEMENT_ARRAY_BUFFER, 'i'), count: I.length
    };
  }

  /* ---------------- GL init (isolated: throws -> 2D fallback) ---------------- */
  function initGL() {
    const canvas = $('gl');
    const kinds = ['webgl2', 'webgl', 'experimental-webgl'];
    let ctx = null, kind = '';
    for (const k of kinds) {
      try { ctx = canvas.getContext(k, { antialias: true, alpha: true }); } catch (e) { ctx = null; }
      if (ctx) { kind = k; break; }
    }
    if (!ctx) throw new Error('WebGL unavailable (tried webgl2/webgl/experimental-webgl)');
    gl = ctx;
    isGL2 = (kind === 'webgl2') ||
      (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
    if (!isGL2 && !gl.getExtension('OES_element_index_uint'))
      throw new Error('WebGL 1 without uint-index support');
    const useDeriv = isGL2 || !!gl.getExtension('OES_standard_derivatives');
    const src = fragSources(useDeriv, !isGL2 && useDeriv);
    P_BARK = prog(VS_MAIN, src.FS_BARK); P_LEAF = prog(VS_MAIN, src.FS_LEAF);
    P_WIRE = prog(VS_MAIN, src.FS_WIRE); P_GROUND = prog(src.VS_GROUND, src.FS_GROUND);
    TEX = {
      barkAlb: loadTex('assets/bark_albedo.png?' + V, true),
      barkNrm: loadTex('assets/bark_normal.png?' + V, true),
      leaf: loadTex('assets/leaf_alpha.png?' + V, false),
    };
    TEX.ground = groundTexture();
    groundMesh = buildGroundMesh();
    gl.enable(gl.DEPTH_TEST);
    hasGL = true;
    $('renderMode').textContent = isGL2 ? '3D · webgl2' : '3D · webgl1';
    status('renderer: ' + kind + ' OK');
  }

  /* ---------------- camera ---------------- */
  const view = $('view');
  let drag = null;
  view.addEventListener('contextmenu', e => e.preventDefault());
  view.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, y0: yaw, p0: pitch, pan: e.button === 2, t0: target.slice() };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.pan) {
      const s = dist * 0.0016;
      const cx = Math.cos(yaw), sx = Math.sin(yaw);
      target = [drag.t0[0] - ((e.clientX - drag.x) * cx * s),
      drag.t0[1] + (e.clientY - drag.y) * s,
      drag.t0[2] + ((e.clientX - drag.x) * sx * s)];
    } else {
      yaw = drag.y0 - (e.clientX - drag.x) * 0.006;
      pitch = Math.min(1.4, Math.max(-0.25, drag.p0 + (e.clientY - drag.y) * 0.006));
    }
  });
  view.addEventListener('pointerup', () => drag = null);
  view.addEventListener('wheel', e => {
    e.preventDefault();
    dist = Math.min(40, Math.max(2.2, dist * (1 + e.deltaY * 0.001)));
  }, { passive: false });

  /* ---------------- math ---------------- */
  function persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  }
  function mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  /* ---------------- render ---------------- */
  const canvas = $('gl');
  function frame(tms) {
    if (!hasGL) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(view.clientWidth * dpr, 2), h = Math.max(view.clientHeight * dpr, 2);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if ($('spin').checked && !drag) yaw += 0.0032;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const eye = [target[0] + dist * cp * sy, target[1] + dist * sp, target[2] + dist * cp * cy];
    const z = norm3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    const x = norm3(cross3([0, 1, 0], z)), y = cross3(z, x);
    const V = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1];
    const mvp = mul(persp(0.68, w / h, 0.1, 120), V);
    const wind = +$('wind').value, speed = +$('speed').value, tsec = tms * 0.001;
    const fogNear = dist * 1.1, fogFar = dist * 3.4;
    function common(pr, leaf) {
      gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'uMVP'), false, mvp);
      gl.uniform1f(gl.getUniformLocation(pr, 'uTime'), tsec);
      gl.uniform1f(gl.getUniformLocation(pr, 'uWind'), wind);
      gl.uniform1f(gl.getUniformLocation(pr, 'uSpeed'), speed);
      gl.uniform1f(gl.getUniformLocation(pr, 'uLeaf'), leaf ? 1 : 0);
      gl.uniform3f(gl.getUniformLocation(pr, 'uWindDir'), 0.8, 0, 0.6);
      const fl = gl.getUniformLocation(pr, 'uFogColor');
      if (fl) {
        gl.uniform3f(fl, FOG[0], FOG[1], FOG[2]);
        gl.uniform1f(gl.getUniformLocation(pr, 'uFogNear'), fogNear);
        gl.uniform1f(gl.getUniformLocation(pr, 'uFogFar'), fogFar);
        gl.uniform3f(gl.getUniformLocation(pr, 'uLight'), 0.45, 0.75, 0.55);
      }
    }
    if ($('showGround').checked) {
      gl.useProgram(P_GROUND);
      const S = [groundR, 0, 0, 0, 0, 1, 0, 0, 0, 0, groundR, 0, target[0], 0, target[2], 1];
      gl.uniformMatrix4fv(gl.getUniformLocation(P_GROUND, 'uMVP'), false, mul(mvp, S));
      gl.uniform3f(gl.getUniformLocation(P_GROUND, 'uFogColor'), FOG[0], FOG[1], FOG[2]);
      gl.uniform1f(gl.getUniformLocation(P_GROUND, 'uFogNear'), fogNear);
      gl.uniform1f(gl.getUniformLocation(P_GROUND, 'uFogFar'), fogFar);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, TEX.ground);
      gl.uniform1i(gl.getUniformLocation(P_GROUND, 'uTex'), 0);
      const lp = gl.getAttribLocation(P_GROUND, 'aPos'), lu = gl.getAttribLocation(P_GROUND, 'aUV');
      gl.bindBuffer(gl.ARRAY_BUFFER, groundMesh.bPos);
      gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, groundMesh.bUV);
      gl.enableVertexAttribArray(lu); gl.vertexAttribPointer(lu, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.CULL_FACE);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, groundMesh.bIdx);
      gl.drawElements(gl.TRIANGLES, groundMesh.count, gl.UNSIGNED_SHORT, 0);
    }
    for (const mm of meshes) {
      if (!mm.show()) continue;
      const pr = mm.leaf ? P_LEAF : P_BARK;
      gl.useProgram(pr);
      bindMain(pr, mm.mb);
      common(pr, mm.leaf);
      gl.activeTexture(gl.TEXTURE0);
      if (mm.leaf) {
        gl.bindTexture(gl.TEXTURE_2D, TEX.leaf);
        gl.uniform1i(gl.getUniformLocation(pr, 'uLeafMap'), 0);
        gl.disable(gl.CULL_FACE);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, TEX.barkAlb);
        gl.uniform1i(gl.getUniformLocation(pr, 'uAlbMap'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, TEX.barkNrm);
        gl.uniform1i(gl.getUniformLocation(pr, 'uNrmMap'), 1);
        gl.uniform1f(gl.getUniformLocation(pr, 'uNrmStr'), +$('nrmStr').value);
        gl.enable(gl.CULL_FACE);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mm.mb.bIdx);
      gl.drawElements(gl.TRIANGLES, mm.mb.triCount * 3, gl.UNSIGNED_INT, 0);
      if ($('wire').checked && !mm.leaf) {
        gl.useProgram(P_WIRE);
        bindMain(P_WIRE, mm.mb);
        common(P_WIRE, false);
        gl.enable(gl.CULL_FACE);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mm.mb.bLin);
        gl.drawElements(gl.LINES, mm.mb.lineCount, gl.UNSIGNED_INT, 0);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- data ---------------- */
  function setTree(data) {
    for (const mm of meshes) freeMesh(mm.mb);
    meshes = [];
    if (hasGL) {
      const bark = meshBuffers(data.bark, false);
      meshes.push({ mb: bark, leaf: false, show: () => $('showBark').checked });
      if (data.leaves) {
        const lv = meshBuffers(data.leaves, true);
        meshes.push({ mb: lv, leaf: true, show: () => $('showLeaves').checked });
      }
    }
    const P = data.bark.positions;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of P) for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]);
    }
    target = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2 * 0.9, (mn[2] + mx[2]) / 2];
    const H = mx[1] - mn[1];
    dist = Math.max(H, mx[0] - mn[0], mx[2] - mn[2]) * 1.75;
    groundR = Math.max(H * 1.1, 4);
    updateStats(data);
    clearErr();
    if (!hasGL) refreshPreview();
    else status('tree ready: ' + meshes.reduce((a, m) => a + m.mb.triCount, 0).toFixed(0) + ' tris (3D)');
  }
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
  function updateStats(data) {
    const m = data.meta, lt = data.leaves ? data.leaves.indices.length / 3 : 0;
    const bt = data.bark.indices.length / 3;
    $('stVerts').textContent = fmt(data.bark.positions.length + (data.leaves ? data.leaves.positions.length : 0));
    $('stTris').textContent = fmt(bt + lt);
    $('stH').textContent = (m.height || 0).toFixed(1) + 'm';
    $('stEuler').textContent = m.euler;
    const badge = $('validBadge');
    badge.textContent = m.valid ? '● watertight single mesh' : '● INVALID mesh';
    badge.classList.toggle('bad', !m.valid);
    const checks = [
      ['Closed surface', (m.boundary_edges | 0) === 0 && (m.nonmanifold_edges | 0) === 0],
      ['Manifold edges', (m.nonmanifold_edges | 0) === 0],
      ['Consistent winding', (m.inconsistent_edges | 0) === 0],
      ['Genus 0 (ball)', m.euler === 2],
      ['Single component', (m.components | 0) === 1],
    ];
    const ok = checks.filter(c => c[1]).length;
    $('healthPct').textContent = Math.round(ok / checks.length * 100);
    [...$('healthBars').children].forEach((el, i) => {
      el.className = checks[i][1] ? 'ok' : 'no';
    });
    $('validRows').innerHTML = checks.map(c =>
      `<div class="vrow"><span>${c[0]}</span><b class="${c[1] ? 'good' : 'bad'}">${c[1] ? 'pass' : 'FAIL'}</b></div>`).join('');
    $('meshRows').innerHTML =
      `<div class="vrow"><span>Bark verts / tris</span><b>${fmt(data.bark.positions.length)} / ${fmt(bt)}</b></div>` +
      `<div class="vrow"><span>Leaf verts / tris</span><b>${fmt(data.leaves ? data.leaves.positions.length : 0)} / ${fmt(lt)}</b></div>` +
      `<div class="vrow"><span>Skeleton nodes</span><b>${fmt(m.skeleton_nodes || 0)}</b></div>` +
      `<div class="vrow"><span>Boundary edges</span><b>${m.boundary_edges | 0}</b></div>` +
      `<div class="vrow"><span>Non-manifold</span><b>${m.nonmanifold_edges | 0}</b></div>`;
  }

  /* ---------------- 2D fallback preview ---------------- */
  function refreshPreview() {
    status('rendering 2D preview…');
    fetch('api/preview?' + V, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: curPreset, seed: +$('seed').value || 0,
        lod: +$('lod').value, values: collectValues() // server clamps to <=1
      }),
    }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(j.error || r.status); });
      return r.blob();
    }).then(blob => {
      const img = $('previewImg');
      if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
      status('2D preview ready (sliders + Generate + export fully work)');
    }).catch(e => {
      showErr('preview failed: ' + e.message, true);
      status('preview failed: ' + e.message);
    });
  }
  function enterFallback(reason) {
    hasGL = false;
    canvas.style.display = 'none';
    $('fallback').style.display = 'flex';
    $('renderMode').textContent = '2D preview';
    showErr('3D unavailable (' + reason + ') — showing server preview. Sliders, Generate and export all work.', true);
    status('renderer: 2D fallback (' + reason + ')');
  }

  /* ---------------- parametric UI ---------------- */
  const PRESET_INFO = {
    oak: 'broadleaf', pine: 'conifer', birch: 'slender', colony: 'dense crown', sapling: 'test',
  };
  function setLoading(on, msg) {
    $('loader').classList.toggle('show', on);
    $('genBtn').disabled = on;
    if (msg) $('loadMsg').textContent = msg;
  }
  function buildPresets(list) {
    const box = $('presets'); box.innerHTML = '';
    for (const p of list) {
      if (p === 'sapling') continue;
      const b = document.createElement('button');
      b.className = 'preset' + (p === curPreset ? ' on' : '');
      b.innerHTML = `<b>${p[0].toUpperCase() + p.slice(1)}</b><span>${PRESET_INFO[p] || ''}</span>`;
      b.onclick = () => { curPreset = p; loadSpec(); };
      box.appendChild(b);
    }
  }
  function loadSpec() {
    status('loading slider spec for ' + curPreset + '…');
    fetch('api/spec?preset=' + curPreset + '&' + V).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(spec => {
      buildPresets(spec.presets);
      document.querySelectorAll('#presets .preset').forEach(el => {
        el.classList.toggle('on', el.textContent.toLowerCase().startsWith(curPreset));
      });
      specParams = spec.params;
      const host = $('shapeControls'); host.innerHTML = '';
      for (const g of spec.groups) {
        const items = spec.params.filter(p => p.group === g);
        if (!items.length) continue;
        const div = document.createElement('div');
        div.className = 'grp';
        div.innerHTML = `<h3>${g}</h3>`;
        for (const p of items) {
          const row = document.createElement('div');
          row.className = 'srow';
          const dec = p.kind === 'int' ? 0 : (p.step < 0.01 ? 3 : 2);
          row.innerHTML = `<label><span>${p.label}</span><b></b></label>`;
          const inp = document.createElement('input');
          inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step;
          inp.value = p.value; inp.dataset.key = p.key;
          const val = row.querySelector('b');
          val.textContent = (+p.value).toFixed(dec);
          inp.oninput = () => val.textContent = (+inp.value).toFixed(dec);
          row.appendChild(inp);
          div.appendChild(row);
        }
        host.appendChild(div);
      }
      status('spec ready: ' + spec.params.length + ' sliders');
    }).catch(e => {
      showErr('studio API unreachable (' + e.message + ') — is frontier_server running?', true);
      status('spec FAILED: ' + e.message);
    });
  }
  function collectValues() {
    const v = {};
    document.querySelectorAll('#shapeControls input[type=range]').forEach(el => v[el.dataset.key] = +el.value);
    return v;
  }
  $('genBtn').onclick = () => {
    setLoading(true, 'Growing branches… fusing junctions…');
    status('generating ' + curPreset + '…');
    fetch('api/generate?' + V, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: curPreset, seed: +$('seed').value || 0,
        lod: +$('lod').value, values: collectValues()
      }),
    }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(j.error || r.status); });
      return r.json();
    }).then(data => {
      setLoading(false);
      if (data.error) { showErr(data.error, true); return; }
      setTree(data);
    }).catch(e => { setLoading(false); showErr('generate failed: ' + e.message, true); status('generate FAILED'); });
  };
  $('dice').onclick = () => { $('seed').value = Math.floor(Math.random() * 9999); };
  $('retry3d').onclick = () => location.reload();
  function download(fmt) {
    setLoading(true, 'Exporting ' + fmt + '…');
    fetch('api/export?' + V, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: curPreset, seed: +$('seed').value || 0,
        lod: +$('lod').value, values: collectValues(), format: fmt
      }),
    }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(j.error || r.status); });
      return r.blob();
    }).then(blob => {
      setLoading(false);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `frontier_${curPreset}.${fmt}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      status('exported ' + fmt);
    }).catch(e => { setLoading(false); showErr('export failed: ' + e.message, true); });
  }
  $('dlGlb').onclick = () => download('glb');
  $('dlObj').onclick = () => download('obj');

  /* tabs */
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tabpage').forEach(p => p.classList.remove('on'));
    $('tab-' + b.dataset.tab).classList.add('on');
  });
  $('wind').oninput = e => $('windVal').textContent = (+e.target.value).toFixed(2);
  $('speed').oninput = e => $('speedVal').textContent = (+e.target.value).toFixed(2);
  $('nrmStr').oninput = e => $('nrmVal').textContent = (+e.target.value).toFixed(2);

  /* ---------------- boot (data layer independent of 3D) ---------------- */
  try {
    initGL();
  } catch (e) {
    enterFallback(e.message);
  }
  if (hasGL) requestAnimationFrame(frame);
  status('loading bundled tree.json…');
  fetch('tree.json?' + V).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(data => {
    status('tree.json parsed, building…');
    setTree(data);
    if (data.meta && data.meta.preset && PRESET_INFO[data.meta.preset]) curPreset = data.meta.preset;
    $('seed').value = (data.meta && data.meta.seed) || 1;
    loadSpec();
  }).catch(e => {
    status('tree.json FAILED (' + e.message + ') — press Generate');
    loadSpec();
  });
})();
