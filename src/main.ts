import { SRC, resolve, withMesh } from './shaders';
import { perspective, lookAt, mul, invert } from './math';
import { buildUI, setStats, QUALITY, type Params } from './ui';

// ---------------------------------------------------------------------------
// Frontier Ocean — a real-time, large-scale ocean driven by a cascaded GPU
// shallow-water (wave-equation) solver. No FFT, no baked spectra: every frame
// integrates a PDE on three nested toroidal patches.
// ---------------------------------------------------------------------------

const NBANDS = 3;
// Physical patch sizes (metres). Band 0 = swell, 1 = wind sea, 2 = capillary chop.
const BAND_L = [512, 128, 32];
const DEPTH_REF = 120; // reference depth used for the dispersion relation

const fail = (msg: string) => {
  const e = document.getElementById('err')!;
  e.className = 'on';
  e.innerHTML = `<div><b>${msg}</b><br><br>This demo needs WebGPU (Chrome/Edge 113+, or Safari 18+).</div>`;
};

async function main() {
  const canvas = document.getElementById('gfx') as HTMLCanvasElement;
  if (!navigator.gpu) return fail('WebGPU not available.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return fail('No suitable GPU adapter.');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const params: Params = {
    windSpeed: 11, windDir: 35, choppiness: 1.15, foam: 0.9, waveScale: 1.0,
    sunElev: 26, sunAzim: 140, exposure: 1.15, spray: 1.0,
    quality: 'balanced', paused: false, wireframe: false,
  };

  // ---------------- camera -------------------------------------------------
  const cam = { pos: [0, 14, 900] as number[], yaw: Math.PI, pitch: -0.12, fov: 55 };
  const keys = new Set<string>();
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', (e) => { dragging = false; canvas.releasePointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cam.yaw -= e.movementX * 0.0032;
    cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch - e.movementY * 0.0032));
  });
  canvas.addEventListener('wheel', (e) => {
    cam.fov = Math.max(20, Math.min(95, cam.fov + e.deltaY * 0.03));
    e.preventDefault();
  }, { passive: false });
  addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // ---------------- gpu resources ------------------------------------------
  const simU = device.createBuffer({ size: 3 * 32 + 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const camU = device.createBuffer({ size: 64 * 2 + 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bandU = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const sprayU = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const sprayCamU = device.createBuffer({ size: 64 + 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(bandU, 0, new Float32Array([BAND_L[0], BAND_L[1], BAND_L[2], NBANDS]));

  const linSamp = device.createSampler({
    magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat',
  });

  // Shader modules
  const mkMod = (code: string) => device.createShaderModule({ code: resolve(code) });
  const simMod = mkMod(SRC.sim);
  const derMod = mkMod(SRC.derive);
  const skyMod = mkMod(SRC.sky);
  const sprayMod = mkMod(SRC.spray);
  const sprayDrawMod = mkMod(SRC.sprayDraw);

  // Pipelines that never change
  const simPipe = device.createComputePipeline({ layout: 'auto', compute: { module: simMod, entryPoint: 'step' } });
  const derPipe = device.createComputePipeline({ layout: 'auto', compute: { module: derMod, entryPoint: 'derive' } });
  const skyPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: skyMod, entryPoint: 'vs' },
    fragment: { module: skyMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
  });
  const skyBG = device.createBindGroup({
    layout: skyPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: camU } }],
  });

  const sprayUpdatePipe = device.createComputePipeline({
    layout: 'auto', compute: { module: sprayMod, entryPoint: 'update' },
  });
  const sprayDrawPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: sprayDrawMod, entryPoint: 'vs' },
    fragment: {
      module: sprayDrawMod, entryPoint: 'fs',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
  });

  // ---------------- quality-dependent resources ----------------------------
  type Res = {
    grid: number; rings: number; radial: number; substeps: number; sprayCount: number;
    state: GPUTexture[]; foam: GPUTexture[]; disp: GPUTexture;
    simBG: GPUBindGroup[]; derBG: GPUBindGroup[];
    oceanPipe: GPURenderPipeline; oceanBG: GPUBindGroup;
    terrainPipe: GPURenderPipeline; terrainBG: GPUBindGroup;
    vertCount: number; indexBuf: GPUBuffer; indexCount: number;
    parts: GPUBuffer; sprayBG: GPUBindGroup;
  };
  let R: Res;
  let depthTex: GPUTexture | null = null;

  function buildRadialIndex(rings: number, radial: number) {
    const ra = radial + 1;
    const quads = rings * radial;
    const data = new Uint32Array(quads * 6);
    let o = 0;
    for (let r = 0; r < rings; r++) {
      for (let a = 0; a < radial; a++) {
        const i0 = r * ra + a, i1 = i0 + 1, i2 = i0 + ra, i3 = i2 + 1;
        data[o++] = i0; data[o++] = i2; data[o++] = i1;
        data[o++] = i1; data[o++] = i2; data[o++] = i3;
      }
    }
    const buf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(buf, 0, data);
    return { buf, count: data.length, verts: (rings + 1) * ra };
  }

  function makeArrayTex(grid: number) {
    return device.createTexture({
      size: [grid, grid, NBANDS], format: 'rgba16float', dimension: '2d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  function rebuild() {
    const q = QUALITY[params.quality];
    R?.state.forEach((t) => t.destroy());
    R?.foam.forEach((t) => t.destroy());
    R?.disp.destroy();
    R?.indexBuf.destroy();
    R?.parts.destroy();

    const grid = q.grid;
    const state = [makeArrayTex(grid), makeArrayTex(grid)];
    const foam = [makeArrayTex(grid), makeArrayTex(grid)];
    const disp = makeArrayTex(grid);

    // Seed with a faint noise so the wind instability has something to amplify.
    const seed = new Uint16Array(grid * grid * 4 * NBANDS);
    const f2h = (v: number) => {
      // float32 -> float16 bits (sufficient for small magnitudes)
      const fb = new Float32Array([v]); const ib = new Uint32Array(fb.buffer)[0];
      const s = (ib >>> 16) & 0x8000; let e = ((ib >>> 23) & 0xff) - 112; const m = ib & 0x7fffff;
      if (e <= 0) return s;
      if (e >= 31) return s | 0x7bff;
      return s | (e << 10) | (m >>> 13);
    };
    for (let l = 0; l < NBANDS; l++) {
      for (let i = 0; i < grid * grid; i++) {
        const amp = [0.35, 0.12, 0.03][l];
        seed[(l * grid * grid + i) * 4 + 0] = f2h((Math.random() * 2 - 1) * amp);
      }
    }
    device.queue.writeTexture(
      { texture: state[0] }, seed,
      { bytesPerRow: grid * 8, rowsPerImage: grid }, [grid, grid, NBANDS],
    );

    const mkView = (t: GPUTexture, storage = false) =>
      t.createView({ dimension: storage ? '2d-array' : '2d-array' });

    const simBG = [0, 1].map((i) => device.createBindGroup({
      layout: simPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: simU } },
        { binding: 1, resource: mkView(state[i]) },
        { binding: 2, resource: mkView(state[1 - i], true) },
        { binding: 3, resource: mkView(foam[i]) },
        { binding: 4, resource: mkView(foam[1 - i], true) },
      ],
    }));
    const derBG = [0, 1].map((i) => device.createBindGroup({
      layout: derPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: simU } },
        { binding: 1, resource: mkView(state[i]) },
        { binding: 2, resource: mkView(foam[i]) },
        { binding: 3, resource: mkView(disp, true) },
      ],
    }));

    const oceanMod = device.createShaderModule({ code: resolve(withMesh(SRC.ocean, q.rings, q.radial)) });
    const terrMod = device.createShaderModule({ code: resolve(withMesh(SRC.terrain, q.rings, q.radial)) });

    const oceanPipe = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: oceanMod, entryPoint: 'vs' },
      fragment: { module: oceanMod, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    const terrainPipe = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: terrMod, entryPoint: 'vs' },
      fragment: { module: terrMod, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });

    const oceanBG = device.createBindGroup({
      layout: oceanPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: camU } },
        { binding: 1, resource: mkView(disp) },
        { binding: 2, resource: linSamp },
        { binding: 3, resource: { buffer: bandU } },
      ],
    });
    const terrainBG = device.createBindGroup({
      layout: terrainPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: camU } }],
    });

    const idx = buildRadialIndex(q.rings, q.radial);

    const sprayCount = Math.max(64, q.spray);
    const parts = device.createBuffer({
      size: sprayCount * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(parts, 0, new Float32Array(sprayCount * 8));
    const sprayBG = device.createBindGroup({
      layout: sprayUpdatePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: sprayU } },
        { binding: 1, resource: { buffer: parts } },
        { binding: 2, resource: mkView(disp) },
        { binding: 3, resource: linSamp },
      ],
    });
    const sprayDrawBG0 = device.createBindGroup({
      layout: sprayDrawPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: sprayCamU } },
        { binding: 1, resource: { buffer: parts } },
      ],
    });

    R = {
      grid, rings: q.rings, radial: q.radial, substeps: q.substeps, sprayCount,
      state, foam, disp, simBG, derBG, oceanPipe, oceanBG, terrainPipe, terrainBG,
      vertCount: idx.verts, indexBuf: idx.buf, indexCount: idx.count,
      parts, sprayBG,
    };
    (R as any).sprayDrawBG0 = sprayDrawBG0;
  }

  rebuild();
  buildUI(params, (key) => { if (key === 'quality') rebuild(); });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, params.quality.startsWith('rtx') ? 2 : 1.25);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h && depthTex) return;
    canvas.width = w; canvas.height = h;
    depthTex?.destroy();
    depthTex = device.createTexture({
      size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  addEventListener('resize', resize);
  resize();

  // ---------------- uniform packing ----------------------------------------
  const simData = new Float32Array((3 * 32 + 32) / 4);

  /** Dispersion: phase speed of the dominant wavelength of a band at depth H. */
  function phaseSpeed(lambda: number, H: number) {
    const k = (2 * Math.PI) / lambda;
    return Math.sqrt((9.81 / k) * Math.tanh(k * H));
  }

  function writeSim(dt: number, time: number) {
    for (let b = 0; b < NBANDS; b++) {
      const L = BAND_L[b];
      const dx = L / R.grid;
      const lambda = L * 0.25;
      let c = phaseSpeed(lambda, DEPTH_REF);
      // CFL guard: an explicit wave-equation solve needs c*dt/dx <= 1/sqrt(2).
      const cflMax = (0.62 * dx) / Math.max(dt, 1e-5);
      c = Math.min(c, cflMax);

      // Fully-developed-sea amplitude cap (Pierson–Moskowitz-like scaling with
      // wind speed), used as the tanh soft limiter in the solver.
      const U = Math.max(0.5, params.windSpeed);
      const cap = Math.min(0.42 * lambda, 0.0009 * U * U * Math.sqrt(lambda)) * 8.0 + 0.05;

      const o = b * 8;
      simData[o + 0] = L;
      simData[o + 1] = dx;
      simData[o + 2] = c;
      simData[o + 3] = cap;
      simData[o + 4] = dt;
      simData[o + 5] = [0.06, 0.18, 0.55][b];       // drag: short waves damp fast
      simData[o + 6] = [1.0, 0.7, 0.35][b];         // wind coupling per band
      simData[o + 7] = [1.0, 0.85, 0.6][b];         // choppiness weight
    }
    const a = (params.windDir * Math.PI) / 180;
    const o = 24;
    simData[o + 0] = Math.cos(a);
    simData[o + 1] = Math.sin(a);
    simData[o + 2] = time;
    simData[o + 3] = params.windSpeed;
    simData[o + 4] = R.grid;
    simData[o + 5] = 0;
    simData[o + 6] = params.choppiness;
    simData[o + 7] = 0.35;                           // foam decay rate
    device.queue.writeBuffer(simU, 0, simData);
  }

  const camData = new Float32Array((64 * 2 + 16 * 4) / 4);

  // ---------------- frame loop ---------------------------------------------
  let last = performance.now();
  let time = 0;
  let fpsAcc = 0, fpsN = 0, fpsShown = 0;
  let parity = 0;

  function frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.4) { fpsShown = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (!params.paused) time += dt;

    resize();

    // camera fly
    const sp = (keys.has('shift') ? 240 : 45) * dt;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp2 = Math.sin(cam.pitch);
    const fwd = [sy * cp, sp2, -cy * cp];
    const right = [cy, 0, sy];
    const move = (v: number[], s: number) => { cam.pos[0] += v[0] * s; cam.pos[1] += v[1] * s; cam.pos[2] += v[2] * s; };
    if (keys.has('w')) move(fwd, sp);
    if (keys.has('s')) move(fwd, -sp);
    if (keys.has('d')) move(right, sp);
    if (keys.has('a')) move(right, -sp);
    if (keys.has('e')) cam.pos[1] += sp;
    if (keys.has('q')) cam.pos[1] -= sp;
    cam.pos[1] = Math.max(-40, Math.min(3000, cam.pos[1]));

    const aspect = canvas.width / canvas.height;
    const proj = perspective((cam.fov * Math.PI) / 180, aspect, 0.25, 40000);
    const target = [cam.pos[0] + fwd[0], cam.pos[1] + fwd[1], cam.pos[2] + fwd[2]];
    const view = lookAt(cam.pos, target, [0, 1, 0]);
    const vp = mul(proj, view);
    const ivp = invert(vp);

    const se = (params.sunElev * Math.PI) / 180, sa = (params.sunAzim * Math.PI) / 180;
    const sun = [Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa)];

    camData.set(vp, 0);
    camData.set(ivp, 16);
    camData.set([cam.pos[0], cam.pos[1], cam.pos[2], time], 32);
    camData.set([sun[0], sun[1], sun[2], params.exposure], 36);
    camData.set([params.choppiness, params.foam, 0, params.waveScale], 40);
    const wa = (params.windDir * Math.PI) / 180;
    camData.set([Math.cos(wa), Math.sin(wa), params.windSpeed, 1], 44);
    device.queue.writeBuffer(camU, 0, camData);

    // Billboard basis for spray.
    const up = [0, 1, 0];
    const rgt = [cy, 0, sy];
    const bup = [
      rgt[1] * fwd[2] - rgt[2] * fwd[1],
      rgt[2] * fwd[0] - rgt[0] * fwd[2],
      rgt[0] * fwd[1] - rgt[1] * fwd[0],
    ];
    const scData = new Float32Array(28);
    scData.set(vp, 0);
    scData.set([rgt[0], rgt[1], rgt[2], 0], 16);
    scData.set([-bup[0], -bup[1], -bup[2], 0], 20);
    scData.set([cam.pos[0], cam.pos[1], cam.pos[2], 0], 24);
    device.queue.writeBuffer(sprayCamU, 0, scData);

    device.queue.writeBuffer(sprayU, 0, new Float32Array([
      cam.pos[0], cam.pos[1], cam.pos[2], params.paused ? 0 : dt,
      Math.cos(wa), Math.sin(wa), params.windSpeed, time,
      R.sprayCount, 0.06 * params.spray, 260, 9.81,
      BAND_L[0], BAND_L[2], Math.max(0.12, 0.62 - params.spray * 0.12), Math.random() * 1e6,
    ]));

    const enc = device.createCommandEncoder();

    // --- simulation ---------------------------------------------------------
    const steps = params.paused ? 0 : R.substeps;
    // One uniform write per frame: all substeps share dt/substeps, which keeps
    // the CFL number constant and avoids a stall-inducing write per dispatch.
    writeSim(dt / R.substeps, time);
    for (let s = 0; s < steps; s++) {
      const p = enc.beginComputePass();
      p.setPipeline(simPipe);
      p.setBindGroup(0, R.simBG[parity]);
      const wg = Math.ceil(R.grid / 8);
      p.dispatchWorkgroups(wg, wg, NBANDS);
      p.end();
      parity = 1 - parity;
    }
    {
      const p = enc.beginComputePass();
      p.setPipeline(derPipe);
      p.setBindGroup(0, R.derBG[parity]);
      const wg = Math.ceil(R.grid / 8);
      p.dispatchWorkgroups(wg, wg, NBANDS);
      p.end();
    }
    if (R.sprayCount > 64 && params.spray > 0.01) {
      const p = enc.beginComputePass();
      p.setPipeline(sprayUpdatePipe);
      p.setBindGroup(0, R.sprayBG);
      p.dispatchWorkgroups(Math.ceil(R.sprayCount / 64));
      p.end();
    }

    // --- rendering ----------------------------------------------------------
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.02, g: 0.05, b: 0.09, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTex!.createView(),
        depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });

    pass.setPipeline(skyPipe);
    pass.setBindGroup(0, skyBG);
    pass.draw(3);

    pass.setPipeline(R.terrainPipe);
    pass.setBindGroup(0, R.terrainBG);
    pass.setIndexBuffer(R.indexBuf, 'uint32');
    pass.drawIndexed(R.indexCount);

    pass.setPipeline(R.oceanPipe);
    pass.setBindGroup(0, R.oceanBG);
    pass.setIndexBuffer(R.indexBuf, 'uint32');
    pass.drawIndexed(R.indexCount);

    if (R.sprayCount > 64 && params.spray > 0.01) {
      pass.setPipeline(sprayDrawPipe);
      pass.setBindGroup(0, (R as any).sprayDrawBG0);
      pass.draw(6, R.sprayCount);
    }

    pass.end();
    device.queue.submit([enc.finish()]);

    const cells = R.grid * R.grid * NBANDS * R.substeps;
    setStats(
      `${fpsShown.toFixed(0)} fps · ${(R.indexCount / 3 / 1000).toFixed(0)}k tris<br>` +
      `sim ${R.grid}²×${NBANDS} bands × ${R.substeps} steps = ${(cells / 1000).toFixed(0)}k cells/frame<br>` +
      `spray ${(R.sprayCount / 1024).toFixed(0)}k · alt ${cam.pos[1].toFixed(0)} m`,
    );

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => { console.error(e); fail(String(e)); });
