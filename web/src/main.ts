/**
 * Frontier Ocean: app shell, camera, input and the frame loop.
 *
 * The frame is two submissions. The first advances the 2.5D layers (fine + coarse shallow water,
 * wave packets, splats, resolves) with `simDt = dt / sweSubsteps`; the parameter block is then
 * rewritten with `simDt = dt / mpmSubsteps` and the second submission runs the 3D layer and the
 * renderer against the freshly resolved surface. One uniform buffer, two timesteps, no copies.
 */

import { compileErrors, initGpu, type GpuContext } from '@/core/gpu';
import { AdaptiveQuality, GLOBALS, PRESETS, applyConfig, defaultParams, deriveConfig, parseUrlOptions } from '@/core/params';
import { Camera } from '@/core/math';
import { OceanSim, type SimState } from '@/sim/ocean';
import { Renderer } from '@/render/renderer';
import { SHADER_NAMES } from '@/sim/shaders';

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

function fatal(err: unknown): void {
  const box = $('fatal');
  const body = $('fatalBody');
  const title = $('fatalTitle');
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  title.textContent = compileErrors.length ? 'Shader compilation failed' : 'WebGPU could not start';
  body.textContent = compileErrors.length ? `${message}\n\n${compileErrors.join('\n\n')}` : message;
  box.classList.add('show');
  console.error(err);
}

async function main(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('gpu');
  const url = parseUrlOptions(location.search);

  const gpu: GpuContext = await initGpu(canvas, GLOBALS, (info) => fatal(new Error(`GPU device lost: ${info.reason} — ${info.message}`)));

  // Preset: an explicit ?tier= wins; a low-end ?preset= is honoured (someone asking for safe mode
  // means it); otherwise the adapter's capability profile decides.
  const auto = gpu.caps.tier === 'rtx' ? 'rtx' : gpu.caps.tier === 'igpu' ? 'igpu' : 'gtx';
  const presetKey = url.tier !== 'auto' ? url.tier : url.preset === 'safe' || url.preset === 'igpu' ? url.preset : auto;
  const preset = PRESETS[presetKey] ?? PRESETS.gtx!;
  const cfg = deriveConfig(preset, gpu.caps);

  const values: Record<string, number | readonly number[]> = { ...defaultParams() };
  applyConfig(values, cfg, preset);

  const sim = new OceanSim(gpu.device, gpu.paramsLayout, preset, cfg, values);
  const renderer = new Renderer(
    gpu.device,
    gpu.paramsLayout,
    gpu.paramsBindGroup,
    cfg,
    preset,
    gpu.format,
    () => gpu.context.getCurrentTexture().createView(),
    { nearField: sim.surface.nearField, farField: sim.surface.farField, particles: sim.mpm.particles },
  );

  // --- one-time initialisation: bake the bathymetry, seed the lattices and the packet field ----
  {
    const encoder = gpu.device.createCommandEncoder({ label: 'init' });
    sim.initialize(gpu.device, gpu.paramsBindGroup, encoder);
    gpu.device.queue.submit([encoder.finish()]);
  }

  const quality = new AdaptiveQuality(preset, gpu.caps, { targetFps: url.bench ? 240 : 60, minLevel: url.minLevel, startLevel: url.startLevel });
  const camera = new Camera();
  camera.position = [0, 14, -160];
  camera.yaw = Math.PI;
  camera.pitch = -0.12;
  camera.speed = 26;
  camera.far = 24000;

  // --- input ------------------------------------------------------------------------------------
  const keys = new Set<string>();
  let dragging = false;
  let lookX = 0;
  let lookY = 0;
  let pointerDown = false;
  let pointerAlt = false;
  let mouseX = 0;
  let mouseY = 0;
  let showHelp = true;
  let paused = false;
  let fluidOn = preset.mpmParticles > 0;
  let adaptive = true;
  let debugView = 0;

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyF') fluidOn = !fluidOn;
    if (e.code === 'KeyP') paused = !paused;
    if (e.code === 'KeyL') adaptive = !adaptive;
    if (e.code === 'KeyH') {
      showHelp = !showHelp;
      $('help').style.display = showHelp ? '' : 'none';
    }
    if (e.code === 'KeyR') {
      camera.position = [0, 14, -160];
      camera.yaw = Math.PI;
      camera.pitch = -0.12;
    }
    if (e.code.startsWith('Digit')) {
      const d = Number(e.code.slice(5));
      debugView = d >= 1 && d <= 5 ? (debugView === d ? 0 : d) : 0;
      const names = ['shaded', 'elevation', 'normals', 'whitecaps', 'surface speed', 'counters'];
      $('view').textContent = names[debugView] ?? 'shaded';
    }
    if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyC'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 0 && !e.shiftKey) {
      dragging = true;
      pointerDown = true;
      pointerAlt = e.altKey;
    }
    mouseX = e.offsetX;
    mouseY = e.offsetY;
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    pointerDown = false;
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const dx = e.offsetX - mouseX;
    const dy = e.offsetY - mouseY;
    mouseX = e.offsetX;
    mouseY = e.offsetY;
    if (dragging) {
      lookX += dx;
      lookY += dy;
    }
  });
  canvas.addEventListener('wheel', (e) => {
    camera.speed = Math.min(400, Math.max(2, camera.speed * Math.exp(-e.deltaY * 0.0012)));
    e.preventDefault();
  }, { passive: false });

  // --- per-frame state ---------------------------------------------------------------------------
  let time = 0;
  let frame = 0;
  let last = performance.now();
  let hudTimer = 0;
  let fps = 0;
  let smoothedMs = 16;
  let pointerPrev: [number, number] = [0, 0];
  const state: SimState = {
    time: 0,
    dt: 0,
    frame: 0,
    cameraPos: [0, 14, -160],
    cameraUnderwater: false,
    viewProj: camera.viewProj,
    invViewProj: camera.invViewProj,
    view: camera.view,
    invView: camera.invView,
    projScaleY: 1,
    nearPlane: camera.near,
    farPlane: camera.far,
    pointer: { pos: [0, 0], prev: [0, 0], active: false, force: 0, radius: 60, mode: 0 },
  };

  function resizeIfNeeded(scale: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(8, Math.round((canvas.clientWidth || 1280) * dpr * scale));
    const h = Math.max(8, Math.round((canvas.clientHeight || 720) * dpr * scale));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    renderer.resize(w, h);
    values.resolution = [w, h];
  }

  function rayToSeaLevel(): [number, number] | null {
    const inv = camera.invViewProj;
    const ndcX = (mouseX / (canvas.clientWidth || 1)) * 2 - 1;
    const ndcY = 1 - (mouseY / (canvas.clientHeight || 1)) * 2;
    // Two points on the ray: the near plane and the far plane.
    const a = transform(inv, ndcX, ndcY, 0);
    const b = transform(inv, ndcX, ndcY, 1);
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as [number, number, number];
    if (Math.abs(dir[1]) < 1e-6) return null;
    const t = (0 - a[1]) / dir[1];
    if (t < 0.05 || t > 1.2) return null;
    return [a[0] + dir[0] * t, a[2] + dir[2] * t];
  }

  function frameStep(now: number): void {
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(Math.max(raw, 0.0005), 0.05);
    // Pausing freezes the simulation but keeps rendering, so the camera can still be flown.
    const simDt = paused ? 0 : dt;

    const q = adaptive
      ? quality.update(0, raw * 1000)
      : { level: 1, renderScale: preset.renderScale, effects: 3, targetMs: 1000 / 60, gpuMs: 0, fps: 1 / Math.max(raw, 1e-3) };
    const scale = url.scale ?? q.renderScale;
    resizeIfNeeded(scale);
    const [rw, rh] = renderer.renderSize;

    // --- camera ---------------------------------------------------------------------------------
    const turn = 0.0022;
    camera.yaw += lookX * turn;
    camera.pitch = Math.max(-1.5, Math.min(1.45, camera.pitch - lookY * turn));
    lookX = 0;
    lookY = 0;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? camera.boost : 1;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const up = (keys.has('Space') || keys.has('KeyE') ? 1 : 0) - (keys.has('KeyC') || keys.has('KeyQ') ? 1 : 0);
    camera.move(forward * boost, strafe * boost, up * boost, dt);

    state.cameraUnderwater = camera.position[1] < Number(values.seaLevel ?? 0) - 0.05;
    state.cameraPos = [...camera.position] as [number, number, number];
    state.projScaleY = 1 / Math.tan(camera.fovY / 2);
    camera.update(rw / rh);

    // --- pointer interaction ---------------------------------------------------------------------
    const hit = rayToSeaLevel();
    state.pointer.active = pointerDown && hit !== null;
    state.pointer.mode = pointerAlt ? 2 : 1;
    state.pointer.force = pointerAlt ? -1.2 : 1.4;
    state.pointer.radius = Math.max(12, camera.speed * 3);
    state.pointer.prev = pointerPrev;
    if (hit) state.pointer.pos = hit;

    // --- uniforms + submission 1 (2.5D layers) ----------------------------------------------------
    if (!paused) {
      time += dt;
      frame++;
      if (state.pointer.active) pointerPrev = state.pointer.pos;
    }
    state.time = time;
    state.dt = simDt;
    state.frame = frame;

    sim.recenter([camera.position[0], camera.position[2]]);
    values.qualityLevel = q.level;
    values.debugView = debugView;
    values.mpmActiveTiles = Math.round(cfg.mpm.tiles[0] * cfg.mpm.tiles[1] * cfg.mpm.tiles[2] * q.level);
    values.detailAmp = 0.11 * (0.45 + 0.55 * Math.min(1, q.level));

    const sweSubsteps = Math.max(1, Number(values.sweSubsteps ?? 1));
    sim.writeUniforms(gpu.paramsWriter, state, simDt / sweSubsteps);
    gpu.uploadParams();
    {
      const encoder = gpu.device.createCommandEncoder({ label: 'sim-2.5d' });
      sim.simulate(encoder, gpu.paramsBindGroup, simDt);
      gpu.device.queue.submit([encoder.finish()]);
    }

    // --- uniforms + submission 2 (3D layer + render) ----------------------------------------------
    const mpmSubsteps = Math.max(1, Number(values.mpmSubsteps ?? 1));
    sim.writeUniforms(gpu.paramsWriter, state, simDt / mpmSubsteps);
    gpu.uploadParams();
    {
      const encoder = gpu.device.createCommandEncoder({ label: 'sim-3d+render' });
      sim.couple(encoder, gpu.paramsBindGroup);
      renderer.frame(encoder, {
        fluid: fluidOn,
        particleCount: fluidOn ? Math.round(cfg.mpm.maxParticles * (0.25 + 0.75 * q.level)) : 0,
      });
      gpu.device.queue.submit([encoder.finish()]);
    }

    // --- hud -------------------------------------------------------------------------------------
    smoothedMs = smoothedMs * 0.9 + raw * 1000 * 0.1;
    fps = fps * 0.9 + (1 / Math.max(raw, 1e-3)) * 0.1;
    hudTimer += raw;
    if (hudTimer > 0.2) {
      hudTimer = 0;
      $('preset').textContent = `· ${preset.name}`;
      $('adapter').textContent = `${gpu.caps.vendor || 'unknown vendor'} ${gpu.caps.architecture || ''} [${gpu.caps.tier}]`.trim();
      $('fps').textContent = fps.toFixed(0);
      $('ms').textContent = `${smoothedMs.toFixed(1)} ms`;
      $('quality').textContent = `${(q.level * 100).toFixed(0)}% · fx ${q.effects} · ${adaptive ? 'auto' : 'manual'}`;
      $('res').textContent = `${rw}×${rh} (${scale.toFixed(2)}×)`;
      $('sweCount').textContent = `${cfg.swe.count.toLocaleString()} + ${cfg.coarse.count.toLocaleString()}`;
      $('waveCount').textContent = cfg.wave.count.toLocaleString();
      $('mpmCount').textContent = cfg.mpm.maxParticles.toLocaleString();
      $('mem').textContent = `${((cfg.totalBytes + renderer.bytes) / 1048576).toFixed(0)} MB`;
      $('load').style.width = `${Math.min(100, (smoothedMs / (1000 / 60)) * 100).toFixed(0)}%`;
    }

    requestAnimationFrame(frameStep);
  }

  // Cosmetic: log the module list once, so a missing shader is obvious in the console.
  console.info(`Frontier Ocean ready — ${SHADER_NAMES.length} WGSL modules, preset ${preset.name} (${presetKey}), tier ${gpu.caps.tier}`);
  requestAnimationFrame(frameStep);
}

function transform(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const s = Math.abs(w) > 1e-9 ? 1 / w : 0;
  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * s,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * s,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * s,
  ];
}

main().catch(fatal);
