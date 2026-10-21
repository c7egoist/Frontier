import { OrbitCamera } from "../scene/OrbitCamera.ts";
import { DynamicResolution } from "../perf/DynamicResolution.ts";
import { CPU_QUALITY_TABLE, QUALITY_TABLE } from "../sim/common.ts";
import { Hud } from "../ui/Hud.ts";
import { defaultColliders } from "../colliders.ts";
import type { MaterialId } from "../types.ts";
import { GpuSolver } from "../sim/gpu/GpuSolver.ts";
import { CpuSolver } from "../sim/cpu/CpuSolver.ts";
import { WebGpuRenderer } from "../render/webgpu/WebGpuRenderer.ts";
import { WebGl2Renderer } from "../render/webgl2/WebGl2Renderer.ts";

const NOZZLE: [number, number, number] = [0, 3.15, 0];

function makeCanvas(parent: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = "fluid-canvas";
  parent.appendChild(canvas);
  return canvas;
}

function showMessage(parent: HTMLElement, text: string) {
  const el = document.createElement("div");
  el.className = "boot-overlay";
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

export async function startApp(root: HTMLElement) {
  const gpuOk = await tryWebGpu(root);
  if (gpuOk) return;
  const glOk = tryWebGl2(root);
  if (glOk) return;
  showMessage(root, "This browser supports neither WebGPU nor WebGL2 — please use an up-to-date Chrome, Edge or Firefox.");
}

async function tryWebGpu(root: HTMLElement): Promise<boolean> {
  if (!("gpu" in navigator)) return false;
  try {
    const gpu = (navigator as unknown as { gpu: GPU }).gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;
    const device = await adapter.requestDevice();
    const canvas = makeCanvas(root);
    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!context) return false;
    const format = gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const maxParticles = QUALITY_TABLE.ultra.maxParticles;
    const solver = new GpuSolver(device, maxParticles);
    const colliders = defaultColliders();
    solver.setColliders(colliders);

    const renderer = new WebGpuRenderer(canvas, device, context, format);
    renderer.setColliders(colliders);
    renderer.setParticleSource(solver);

    const camera = new OrbitCamera(canvas);
    const dynres = new DynamicResolution(QUALITY_TABLE);

    let currentMaterial: MaterialId = "water";
    let pouring = false;

    const hud = new Hud(root, {
      onMaterialChange: (id) => (currentMaterial = id),
      onPourChange: (p) => (pouring = p),
      onBurst: () => {
        const budget = dynres.settings.maxParticles;
        solver.spawn(
          {
            material: currentMaterial,
            origin: NOZZLE,
            spread: 0.55,
            count: Math.min(6000, budget),
            initialVelocity: [0, -2.2, 0],
          },
          budget,
        );
      },
      onReset: () => solver.reset(),
      onQualityChange: (mode) => dynres.setMode(mode),
      onBackendHint: () => "WebGPU compute SPH · up to " + maxParticles.toLocaleString() + " particles",
    });

    device.lost.then((info) => {
      showMessage(root, "WebGPU device was lost (" + info.message + "). Please reload.");
    });

    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dtMs = Math.min(now - last, 1000 / 24);
      last = now;
      dynres.update(dtMs);
      const settings = dynres.settings;
      solver.setActiveBudget(settings.maxParticles);

      if (pouring) {
        solver.spawn(
          {
            material: currentMaterial,
            origin: NOZZLE,
            spread: 0.14,
            count: 48,
            initialVelocity: [0, -1.6, 0],
          },
          settings.maxParticles,
        );
      }

      const substeps = settings.tier === "potato" || settings.tier === "low" ? 1 : settings.tier === "medium" ? 2 : 3;
      solver.step(Math.min(dtMs / 1000, 1 / 30), substeps);

      renderer.render({
        camera,
        renderScale: settings.renderScale,
        viewMode: "particles",
        activeCount: solver.activeCount,
        time: solver.simTime,
      });

      hud.setStats(dynres.fps, settings.tier, settings.renderScale, solver.activeCount, settings.maxParticles);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return true;
  } catch (err) {
    console.warn("WebGPU init failed, falling back:", err);
    root.querySelectorAll("canvas, .hud").forEach((n) => n.remove());
    return false;
  }
}

function tryWebGl2(root: HTMLElement): boolean {
  try {
    const canvas = makeCanvas(root);
    const gl = canvas.getContext("webgl2", { antialias: false, depth: true, alpha: false });
    if (!gl) return false;

    const maxParticles = CPU_QUALITY_TABLE.ultra.maxParticles;
    const solver = new CpuSolver(maxParticles);
    const colliders = defaultColliders();
    solver.setColliders(colliders);

    const renderer = new WebGl2Renderer(canvas, gl, maxParticles);
    renderer.setColliders(colliders);

    const camera = new OrbitCamera(canvas);
    const dynres = new DynamicResolution(CPU_QUALITY_TABLE);

    let currentMaterial: MaterialId = "water";
    let pouring = false;

    const hud = new Hud(root, {
      onMaterialChange: (id) => (currentMaterial = id),
      onPourChange: (p) => (pouring = p),
      onBurst: () => {
        const budget = dynres.settings.maxParticles;
        solver.spawn(
          { material: currentMaterial, origin: NOZZLE, spread: 0.5, count: Math.min(600, budget), initialVelocity: [0, -2.0, 0] },
          budget,
        );
      },
      onReset: () => solver.reset(),
      onQualityChange: (mode) => dynres.setMode(mode),
      onBackendHint: () => "WebGL2 CPU SPH fallback · up to " + maxParticles.toLocaleString() + " particles",
    });

    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dtMs = Math.min(now - last, 1000 / 20);
      last = now;
      dynres.update(dtMs);
      const settings = dynres.settings;
      solver.setActiveBudget(settings.maxParticles);

      if (pouring) {
        solver.spawn(
          { material: currentMaterial, origin: NOZZLE, spread: 0.12, count: 6, initialVelocity: [0, -1.5, 0] },
          settings.maxParticles,
        );
      }

      solver.step(Math.min(dtMs / 1000, 1 / 24), 1);

      renderer.render({ camera, renderScale: settings.renderScale, viewMode: "particles", solver, time: solver.simTime });

      hud.setStats(dynres.fps, settings.tier, settings.renderScale, solver.activeCount, settings.maxParticles);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return true;
  } catch (err) {
    console.warn("WebGL2 init failed:", err);
    root.querySelectorAll("canvas, .hud").forEach((n) => n.remove());
    return false;
  }
}
