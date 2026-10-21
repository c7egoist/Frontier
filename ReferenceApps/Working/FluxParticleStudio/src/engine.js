/* Flux engine — Three.js viewport, GPU layer meshes, composer chain
   (render → afterimage trails → bloom → output), transport + capture. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {AfterimagePass} from 'three/addons/postprocessing/AfterimagePass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {VERT, FRAG, SHAPES, makeUniforms} from './shaders.js';

export const MAXN = 20000;

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── unit-solid particle geometry (shared across layers) ──────────
   Shard: non-indexed octahedron, 8 faces × 3 verts, flat facet normals
   (winding-independent: normals are flipped to face outward). Cube: unit
   BoxGeometry, 24 verts + index. Both span ±0.5 so shader size math for
   the old quads carries over unchanged. */

const _o = {
  px: [0.5, 0, 0], nx: [-0.5, 0, 0], py: [0, 0.5, 0],
  ny: [0, -0.5, 0], pz: [0, 0, 0.5], nz: [0, 0, -0.5],
};
const _faces = [
  ['py', 'pz', 'px'], ['py', 'px', 'nz'], ['py', 'nz', 'nx'], ['py', 'nx', 'pz'],
  ['ny', 'px', 'pz'], ['ny', 'pz', 'nx'], ['ny', 'nx', 'nz'], ['ny', 'nz', 'px'],
];

export function buildShard() {
  const pos = new Float32Array(8 * 3 * 3);
  const nrm = new Float32Array(8 * 3 * 3);
  _faces.forEach((f, fi) => {
    const a = _o[f[0]], b = _o[f[1]], c = _o[f[2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) n = [-n[0], -n[1], -n[2]];
    [a, b, c].forEach((v, vi) => {
      const o = (fi * 3 + vi) * 3;
      pos[o] = v[0]; pos[o + 1] = v[1]; pos[o + 2] = v[2];
      nrm[o] = n[0]; nrm[o + 1] = n[1]; nrm[o + 2] = n[2];
    });
  });
  return {
    index: null,
    position: new THREE.BufferAttribute(pos, 3),
    normal: new THREE.BufferAttribute(nrm, 3),
  };
}

let _cubeBase = null;
export function cubeBase() {
  if (!_cubeBase) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    _cubeBase = {index: box.index, position: box.getAttribute('position'), normal: box.getAttribute('normal')};
  }
  return _cubeBase;
}

let _shardBase = null;
export function shardBase() {
  if (!_shardBase) _shardBase = buildShard();
  return _shardBase;
}

export function solidOf(layer) {
  return layer?.look?.shape === 'cube' ? 'cube' : 'shard';
}

export function createEngine(container, store, hooks = {}) {
  // Capture console errors/warnings (three.js logs shader/program failures
  // here) so the diagnostics badge can show them on screen.
  const consoleLog = [];
  for (const m of ['error', 'warn']) {
    const orig = console[m].bind(console);
    console[m] = (...a) => {
      try {
        const line = a.map((x) => {
          if (typeof x === 'string') return x;
          try { return JSON.stringify(x); } catch { return String(x); }
        }).join(' ').slice(0, 1500);
        consoleLog.push(`[${m}] ${line}`);
        if (consoleLog.length > 14) consoleLog.shift();
      } catch { /* noop */ }
      orig(...a);
    };
  }

  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // Accumulate stats over the whole composer chain (reset manually per frame).
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(store.comp.background || '#050507');
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  const CAM_HOME = {pos: [0, 3.2, 24], tgt: [0, 0.5, 0]};
  camera.position.set(...CAM_HOME.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...CAM_HOME.tgt);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Composer targets default to half-float; fall back to byte targets on
  // GPUs without float renderability instead of rendering black.
  let composer = null, floatTargets = true;
  try {
    const floatOK = renderer.extensions.has('EXT_color_buffer_float') ||
      renderer.extensions.has('EXT_color_buffer_half_float');
    if (floatOK) {
      composer = new EffectComposer(renderer);
    } else {
      floatTargets = false;
      const r = container.getBoundingClientRect();
      const rt = new THREE.WebGLRenderTarget(
        Math.max(50, Math.round(r.width) || 50), Math.max(50, Math.round(r.height) || 50),
        {type: THREE.UnsignedByteType});
      composer = new EffectComposer(renderer, rt);
    }
  } catch {
    composer = new EffectComposer(renderer);
  }
  composer.addPass(new RenderPass(scene, camera));
  const trailsPass = new AfterimagePass();
  composer.addPass(trailsPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.9, 0.55, 0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const layers = new Map(); // id → {mesh, geo, mat, seeds, shape}
  let time = 0, playing = false, loop = true;
  let afterimageReset = false;
  const wrapHandlers = new Set();

  function fillSeeds(attr, seed) {
    const rnd = mulberry32(seed);
    const arr = attr.array;
    for (let i = 0; i < arr.length; i++) arr[i] = rnd();
    attr.needsUpdate = true;
  }

  function buildLayerMesh(layer, shape) {
    const base = shape === 'cube' ? cubeBase() : shardBase();
    const geo = new THREE.InstancedBufferGeometry();
    if (base.index) geo.setIndex(base.index);
    geo.setAttribute('position', base.position);
    geo.setAttribute('normal', base.normal);
    const seeds = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 4), 4);
    fillSeeds(seeds, layer.seed);
    const idx = new THREE.InstancedBufferAttribute(new Float32Array(MAXN), 1);
    for (let i = 0; i < MAXN; i++) idx.array[i] = i;
    geo.setAttribute('aSeed', seeds);
    geo.setAttribute('aIndex', idx);
    geo.instanceCount = Math.min(layer.emitter.count, MAXN);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: makeUniforms(),
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    return {mesh, geo, mat, seeds, shape, seed: layer.seed};
  }

  function syncLayer(layer) {
    const shape = solidOf(layer);
    let rec = layers.get(layer.id);
    if (rec && rec.shape !== shape) {
      scene.remove(rec.mesh);
      rec.geo.dispose(); rec.mat.dispose();
      layers.delete(layer.id);
      rec = null;
    }
    if (!rec) {
      rec = buildLayerMesh(layer, shape);
      layers.set(layer.id, rec);
      scene.add(rec.mesh);
    }
    const {mesh, geo, mat, seeds} = rec;
    const u = mat.uniforms;
    const E = layer.emitter, F = layer.forces, K = layer.look, B = layer.burst;
    if (rec.seed !== layer.seed) { fillSeeds(seeds, layer.seed); rec.seed = layer.seed; }
    const n = Math.max(1, Math.min(MAXN, Math.round(E.count)));
    geo.instanceCount = n;
    u.uLoop.value = store.comp.duration;
    u.uLife.value = Math.min(E.life, store.comp.duration);
    u.uCount.value = n;
    u.uEmitPos.value.set(...E.pos);
    u.uDir.value.set(...E.dir);
    u.uSpeed.value = E.speed; u.uSpread.value = E.spread;
    u.uShape.value = Math.max(0, SHAPES.indexOf(E.shape));
    u.uRadius.value = E.radius; u.uLength.value = E.length;
    u.uWidth.value = E.width; u.uHeight.value = E.height; u.uDepth.value = E.depth;
    u.uGravity.value = F.gravity;
    u.uWind.value.set(F.wind[0], F.wind[1]);
    u.uTurbAmp.value = F.turbAmp; u.uTurbScale.value = F.turbScale; u.uTurbSpeed.value = F.turbSpeed;
    u.uEvo.value = (layer.seed % 1000) / 1000;
    u.uBurstTime.value = B.time; u.uBurstPower.value = B.on ? B.power : 0;
    u.uSize0.value = K.size0; u.uSize1.value = K.size1; u.uStretch.value = K.stretch;
    u.uTumble.value = K.tumble ?? 1.2;
    u.uColA.value.set(K.colA); u.uColB.value.set(K.colB); u.uColC.value.set(K.colC);
    u.uColBias.value = K.colBias; u.uBright.value = K.bright;
    u.uOpacity.value = K.opacity ?? layer.opacity;
    mat.blending = K.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
    mat.depthWrite = K.blending === 'normal';
    mesh.visible = layer.visible !== false;
    mesh.renderOrder = 10 + store.layers.indexOf(layer);
  }

  function syncAll() {
    const ids = new Set(store.layers.map((l) => l.id));
    for (const [id, rec] of layers) {
      if (!ids.has(id)) {
        scene.remove(rec.mesh);
        rec.geo.dispose(); rec.mat.dispose();
        layers.delete(id);
      }
    }
    for (const l of store.layers) syncLayer(l);
    const c = store.comp;
    scene.background.set(c.background || '#050507');
    renderer.setClearColor(scene.background);
    bloomPass.enabled = !!c.bloom.on;
    bloomPass.strength = c.bloom.strength;
    bloomPass.radius = c.bloom.radius;
    bloomPass.threshold = c.bloom.threshold;
    trailsPass.enabled = !!c.trails.on;
    if (trailsPass.uniforms?.damp) trailsPass.uniforms.damp.value = c.trails.damp;
    if (time > c.duration) time = 0;
  }

  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(50, r.width), h = Math.max(50, r.height);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  new ResizeObserver(resize).observe(container);

  // Transport + loop.
  let last = performance.now(), fpsEMA = 60, fpsTick = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0.016;
    fpsEMA += (1 / Math.min(dt, 0.25) - fpsEMA) * 0.06;
    if (playing) {
      time += Math.min(dt, 0.1);
      const dur = store.comp.duration;
      if (time >= dur) {
        if (loop) {
          time -= dur;
          for (const fn of wrapHandlers) { try { fn(); } catch { /* noop */ } }
        } else { time = dur; setPlaying(false); }
      }
      hooks.onTime?.(time);
    }
    for (const rec of layers.values()) rec.mat.uniforms.uTime.value = time;
    renderer.info.reset();
    if (afterimageReset && trailsPass.enabled) {
      const d = trailsPass.uniforms.damp.value;
      trailsPass.uniforms.damp.value = 0;
      composer.render();
      trailsPass.uniforms.damp.value = d;
      afterimageReset = false;
    } else {
      composer.render();
    }
    controls.update();
    fpsTick += dt;
    if (fpsTick > 0.5) { fpsTick = 0; hooks.onFps?.(fpsEMA); }
  }

  function setPlaying(v) {
    playing = !!v;
    hooks.onPlaying?.(playing);
  }

  function report() {
    const gl = renderer.getContext();
    let glRenderer = '';
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      glRenderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch { glRenderer = '(unavailable)'; }
    const has = (n) => { try { return !!gl.getExtension(n); } catch { return false; } };
    const info = renderer.info;
    return {
      calls: info.render.calls, tris: info.render.triangles, points: info.render.points,
      programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures,
      line: `${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(0)}k tris · ${info.programs.length} progs`,
      glVersion: String(gl.getParameter(gl.VERSION)),
      glRenderer,
      floatTargets,
      extFloat: has('EXT_color_buffer_float'),
      extHalf: has('EXT_color_buffer_half_float'),
      extFloatLinear: has('OES_texture_float_linear'),
      canvasSize: `${canvas.width}×${canvas.height}`,
      layers: store.layers.map((l) => {
        const rec = layers.get(l.id);
        return {
          name: l.name, count: l.emitter.count, solid: solidOf(l),
          instances: rec ? rec.geo.instanceCount : -1,
          visible: rec ? rec.mesh.visible : false,
          blend: l.look?.blending || 'add',
        };
      }),
      console: [...consoleLog],
    };
  }

  const api = {
    canvas,
    get time() { return time; },
    get playing() { return playing; },
    get loop() { return loop; },
    setLoop(v) { loop = !!v; },
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying(!playing),
    stop() { setPlaying(false); api.seek(0); },
    seek(t) {
      time = Math.max(0, Math.min(store.comp.duration, t));
      afterimageReset = true;
      hooks.onTime?.(time);
    },
    onWrap(fn) { wrapHandlers.add(fn); return () => wrapHandlers.delete(fn); },
    syncAll,
    reseed(id) {
      const rec = layers.get(id);
      if (rec) { rec.seed = undefined; }
    },
    resetCamera() {
      camera.position.set(...CAM_HOME.pos);
      controls.target.set(...CAM_HOME.tgt);
    },
    liveParticles() {
      let n = 0;
      for (const l of store.layers) {
        if (l.visible === false) continue;
        n += Math.min(MAXN, Math.round(l.emitter.count));
      }
      return n;
    },
    captureFrame() {
      composer.render();
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    },
    debug: {report, renderer, scene, camera, composer, layers, consoleLog},
  };

  resize();
  syncAll();
  requestAnimationFrame(frame);
  return api;
}
