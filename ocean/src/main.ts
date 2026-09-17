import { OrbitCamera } from './camera';
import { Gui, FpsMeter } from './gui';
import { Renderer } from './renderer';
import { OceanSim, SimPipelines } from './sim';
import { TIERS } from './tiers';
import { perspective, lookAt, mul, invert, transformPoint, clamp } from './math';

const canvas = document.getElementById('gfx') as HTMLCanvasElement;
const errBox = document.getElementById('err') as HTMLElement;

function fail(msg: string): void {
  errBox.style.display = 'flex';
  errBox.textContent = msg;
  throw new Error(msg);
}

async function boot(): Promise<void> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    fail('WebGPU is not available in this browser.\nUse Chrome/Edge 113+ (or enable the WebGPU flag), then reload.');
    return;
  }
  const q = new URLSearchParams(location.search);
  const fast = q.has('fast');
  let tierName = q.get('tier') ?? (fast ? 'low' : 'high');
  if (!TIERS[tierName]) tierName = 'high';

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { fail('No WebGPU adapter found.'); return; }
  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (ev) => {
    const e = ev as GPUUncapturedErrorEvent;
    console.error(e.error);
    fail('GPU error: ' + e.error.message);
  });

  const ctx = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  // state -------------------------------------------------------------------
  const gui = new Gui({
    tier: tierName,
    amr: q.get('amr') !== '0' && !fast,
    wind: fast ? 0.4 : 0.55,
    spray: q.get('spray') !== '0',
    minimap: q.get('map') !== '0' && !fast,
    waveview: false,
  });
  const cam = new OrbitCamera();
  const pipes = new SimPipelines(device);
  let sim = new OceanSim(device, { ...TIERS[gui.state.tier] }, pipes);
  const renderer = new Renderer(device, format);
  const urlScale = parseFloat(q.get('scale') ?? '1') || 1;
  const probe = q.has('probe');

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const scale = TIERS[gui.state.tier].renderScale * urlScale * (fast ? 0.6 : 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr * scale));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr * scale));
    canvas.width = w;
    canvas.height = h;
    renderer.resize(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  // gui wiring ---------------------------------------------------------------
  gui.onTier = (t) => {
    sim.destroy();
    sim = new OceanSim(device, { ...TIERS[t] }, pipes);
    resize();
  };
  gui.onAmr = (v) => { sim.setAmr(v); };
  gui.onWaveview = () => { /* read per frame */ };

  // input --------------------------------------------------------------------
  let dragging = false;
  let panning = false;
  let downX = 0, downY = 0, moved = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    panning = e.shiftKey || e.button === 1 || e.button === 2;
    downX = e.clientX; downY = e.clientY; moved = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    downX = e.clientX; downY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (panning) cam.pan(dx, dy);
    else cam.orbit(dx, dy);
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    panning = false;
    if (moved < 6 && e.button === 0) pendingSplash = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.zoom(e.deltaY);
  }, { passive: false });

  let pendingSplash = false;
  let splash: { x: number; z: number; amp: number; sigma: number } | null = null;
  let splashUntil = 0;

  function castClickSplash(mx: number, my: number): void {
    const vp = lastViewProj;
    void vp;
    const ndcX = (mx / canvas.clientWidth) * 2 - 1;
    const ndcY = 1 - (my / canvas.clientHeight) * 2;
    const inv = lastInvViewProj;
    const p0 = transformPoint(inv, ndcX, ndcY, 0);
    const p1 = transformPoint(inv, ndcX, ndcY, 1);
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    if (Math.abs(dy) < 1e-5) return;
    const t = -p0[1] / dy;
    if (t <= 0) return;
    const hx = p0[0] + dx * t;
    const hz = p0[2] + dz * t;
    const [ox, oz] = sim.nearOrigin;
    if (hx < ox || hx > ox + 96 || hz < oz || hz > oz + 96) return;
    splash = { x: hx, z: hz, amp: 7.5, sigma: 1.9 };
    splashUntil = nowTime + 0.35;
  }

  // main loop ------------------------------------------------------------------
  const fps = new FpsMeter();
  let nowTime = 0;
  let lastViewProj: Float32Array = new Float32Array(16);
  let lastInvViewProj: Float32Array = new Float32Array(16);
  let statTimer = 0;

  let frameCount = 0;
  let probeDone = false;
  async function runProbe(): Promise<void> {
    // render one frame into an offscreen target and read the pixels back
    const pr = renderer.makeProbe(256, 144);
    const e = device.createCommandEncoder();
    sim.frame(e, {
      dt: 1 / 60, time: nowTime, camX: cam.targetX, camZ: cam.targetZ,
      windAmp: 0.6, targetRms: 0.7, windDir: [1, 0], spawnRate: 1,
      splash: null, sprayEnabled: true,
    });
    renderer.render(e, pr.view, {
      sim,
      viewProj: lastViewProj,
      invViewProj: lastInvViewProj,
      camPos: [cam.targetX + 30, 12, cam.targetZ + 30],
      camRight: [1, 0, 0], camUp: [0, 1, 0],
      time: nowTime,
      sun: [0.42, 0.38, 0.25],
      tier: TIERS[gui.state.tier],
      waveview: false, minimap: false, spray: true,
      windPhase: 0, foamGain: 1, meshOrigin: [cam.targetX, cam.targetZ],
    });
    e.copyTextureToBuffer(
      { texture: pr.tex },
      { buffer: pr.buf, bytesPerRow: pr.bytesPerRow, rowsPerImage: 144 },
      [256, 144],
    );
    device.queue.submit([e.finish()]);
    await pr.buf.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(pr.buf.getMappedRange());
    let rSum = 0, gSum = 0, bSum = 0, n = data.length / 4;
    let distinct = new Set();
    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
      distinct.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    pr.buf.unmap();
    (window as any).__probeResult = {
      avg: [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)],
      distinctColors: distinct.size,
      sample: [data[0], data[1], data[2], data[50000], data[50001], data[50002]],
    };
    pr.tex.destroy();
    pr.buf.destroy();
    probeDone = true;
  }

  function frame(): void {
    const tickRes = fps.tick();
    const dt = tickRes.dt;
    nowTime += dt;
    frameCount++;
    if (probe && frameCount === 80 && !probeDone) {
      void runProbe().catch((err) => { console.error('probe failed', err); probeDone = true; });
    }

    const sea = gui.state.wind;
    const windAmp = 0.35 + 0.5 * sea;          // raw wind magnitude
    const targetRms = 0.1 + 0.45 * sea * sea;  // desired near-field rms height (m)
    const windAngle = 2.1 + nowTime * 0.008;
    const windDir: [number, number] = [Math.cos(windAngle), Math.sin(windAngle)];
    let spawnRate = 0.3 + 1.6 * sea;

    if (pendingSplash) {
      pendingSplash = false;
      castClickSplash(downX, downY);
    }
    if (splash && nowTime > splashUntil) splash = null;
    if (splash) spawnRate += 2.5;

    // camera matrices
    const aspect = canvas.width / canvas.height;
    const proj = perspective(cam.fov, aspect, 0.5, 30000);
    const eye = cam.eye();
    const center = cam.center();
    const view = lookAt(eye, center, [0, 1, 0]);
    const viewProj = mul(proj, view);
    const invViewProj = invert(viewProj);
    lastViewProj = new Float32Array(viewProj);
    lastInvViewProj = new Float32Array(invViewProj);
    const camRight: [number, number, number] = [view[0], view[4], view[8]];
    const camUp: [number, number, number] = [view[1], view[5], view[9]];
    const meshCell = 0.375;
    const meshOrigin: [number, number] = [
      Math.floor(center[0] / meshCell) * meshCell,
      Math.floor(center[2] / meshCell) * meshCell,
    ];

    // record + submit everything in one encoder
    const t0 = performance.now();
    const e = device.createCommandEncoder();
    sim.frame(e, {
      dt: clamp(dt, 1 / 240, 1 / 30),
      time: nowTime,
      camX: center[0],
      camZ: center[2],
      windAmp,
      targetRms,
      windDir,
      spawnRate,
      splash,
      sprayEnabled: gui.state.spray,
    });
    renderer.render(e, ctx.getCurrentTexture().createView(), {
      sim,
      viewProj: viewProj as unknown as Float32Array,
      invViewProj: invViewProj as unknown as Float32Array,
      camPos: [eye[0], eye[1], eye[2]],
      camRight, camUp,
      time: nowTime,
      sun: [0.42, 0.38, 0.25],
      tier: TIERS[gui.state.tier],
      waveview: gui.state.waveview,
      minimap: gui.state.minimap,
      spray: gui.state.spray,
      windPhase: nowTime * 0.6,
      foamGain: 1.0,
      meshOrigin,
    });
    device.queue.submit([e.finish()]);
    const recMs = performance.now() - t0;

    statTimer += dt;
    if (statTimer > 0.4) {
      statTimer = 0;
      gui.setStats({
        fps: tickRes.fps,
        frameMs: tickRes.frameMs,
        simMs: recMs,
        refinedBlocks: sim.refinedCount,
        blocksTotal: 64,
        cellsSim: sim.cellsSim,
        cellsUniform: sim.cellsUniform,
        sprayCap: sim.sprayCap,
      });
      gui.render();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  if (errBox.style.display !== 'flex') {
    fail('Failed to start: ' + (err?.message ?? String(err)));
  }
  console.error(err);
});
