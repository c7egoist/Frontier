// Boots the real editor modules against a simulated DOM with no WebGPU, which is the path a
// browser without a GPU adapter takes. Catches wiring errors that types cannot: missing element
// ids, control bindings that throw, exports that crash, HUD updates on an empty state.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { check, report } from './harness.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;
const g = globalThis as unknown as Record<string, unknown>;
g.window = window;
g.document = window.document;
g.HTMLCanvasElement = window.HTMLCanvasElement;
g.HTMLElement = window.HTMLElement;
g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.performance = window.performance;
g.devicePixelRatio = 1;

// Canvas 2D is not implemented by jsdom; exports that rasterise must be stubbed at the context.
const ctx2d = {
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
  arc: () => {}, save: () => {}, restore: () => {}, setLineDash: () => {},
  strokeStyle: '', lineWidth: 1,
};
(window.HTMLCanvasElement.prototype as unknown as { getContext: (t: string) => unknown }).getContext = (type: string) => {
  if (type === '2d') return ctx2d;
  return null; // no 'webgpu' context: exercises the fallback path
};
(window.HTMLCanvasElement.prototype as unknown as { toBlob: (cb: (b: unknown) => void) => void }).toBlob = (cb) => cb(null);

let downloads = 0;
g.URL = window.URL;
(window.URL as unknown as { createObjectURL: () => string }).createObjectURL = () => { downloads++; return 'blob:stub'; };
(window.URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};

const { WorldField, DEFAULT_WORLD, bakeHeightmap, extractCoastline } = await import('../src/core/terrain.ts');
const { MERIDIAN, VESPER, THULE, AUSTRAL, ARCHIPELAGO, GULFS, CITIES } = await import('../src/world/presets.ts');
const { makeCascades, DEFAULT_OCEAN } = await import('../src/core/oceanSpectrum.ts');
const { buildHud } = await import('../src/ui/hud.ts');
const { wireControls } = await import('../src/ui/controls.ts');
const { OrbitCamera } = await import('../src/app/camera.ts');
const exporters = await import('../src/export/exporters.ts');
const { resolveWaterLod } = await import('../src/core/lod.ts');

console.log('DOM boot (no GPU)');
const world = new WorldField({ ...DEFAULT_WORLD, gridSize: 128 }, [MERIDIAN, VESPER, THULE], [...ARCHIPELAGO, ...GULFS]);
const bake = bakeHeightmap(world, 128);
check('bake produced a world', bake.landFraction > 0.05, `${(bake.landFraction * 100).toFixed(1)}% land`);

const cascades = makeCascades([512, 64, 8], 64, 1, DEFAULT_OCEAN);
const camera = new OrbitCamera();

let controlErrors: string[] = [];
const host = {
  state: {
    settings: { windSpeed: 11, windDirection: 0.6, choppiness: 1, simExtent: 900, pixelErrorBudget: 4,
      exposure: 1, sunElevation: 0.3, sunAzimuth: 2, terrainDetail: 1, spectrumSize: 64, simResolution: 128 },
    tool: 'none' as 'none' | 'gulf' | 'city' | 'raise' | 'lower' | 'flatten' | 'smooth' | 'blob',
    brushRadius: 90_000,
    strength: 0.6,
    paused: false,
    mode: '3d' as '3d' | 'map',
    world: { params: { gridSize: 128, peakHeight: 5200, shelfWidth: 220_000, seed: 1 } },
  },
};
try {
  wireControls(host, {
    camera,
    regenerateSpectrum: () => {},
    scheduleBake: () => {},
    rebake: () => {},
    updateHud: () => {},
  });
} catch (e) {
  controlErrors.push((e as Error).message);
}
check('controls wire up without throwing', controlErrors.length === 0, controlErrors.join('; '));

// Every id referenced by controls must exist in the document.
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const controlSrc = readFileSync(new URL('../src/ui/controls.ts', import.meta.url), 'utf8');
const usedIds = new Set([...controlSrc.matchAll(/\$\s*(?:<[^>]+>)?\(\s*'([^']+)'\s*\)/g)].map(m => m[1]));
const missing = [...usedIds].filter(id => !htmlIds.has(id));
check('every control element referenced by the UI exists in index.html', missing.length === 0,
  missing.length ? `missing: ${missing.join(', ')}` : `${usedIds.size} ids checked`);

// Slider input events must not throw and must mutate settings.
const wind = window.document.getElementById('wind') as unknown as { value: string; dispatchEvent: (e: unknown) => void };
const before = host.state.settings.windSpeed;
wind.value = '17';
wind.dispatchEvent(new window.Event('input'));
check('slider input updates settings', host.state.settings.windSpeed === 17, `${before} -> ${host.state.settings.windSpeed}`);

const toolBtn = window.document.querySelector('#tools button[data-tool="gulf"]') as unknown as { dispatchEvent: (e: unknown) => void; classList: { contains: (c: string) => boolean } };
toolBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('tool selection updates state', host.state.tool === 'gulf', `tool = ${host.state.tool}`);

const modeBtn = window.document.querySelector('#modes button[data-mode="map"]') as unknown as { dispatchEvent: (e: unknown) => void };
modeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('mode switch to map', host.state.mode === 'map');

// HUD renders against real data without throwing.
let hudError = '';
try {
  buildHud({
    seed: 1, gridSize: 128, landFraction: bake.landFraction, ops: world.ops, cities: CITIES,
    cascades, settings: host.state.settings as never,
    lod: resolveWaterLod(120, { fovY: 0.96, viewportHeight: 1080, simRadius: 900, flatDistance: 25000, horizonDistance: 60000, pixelErrorBudget: 4 }),
    stats: { frameMs: 8, gpuMs: null, lod: null, triangles: 49152, cascades: 3, simResolution: 256, simSteps: 2, simDtMs: 12, tallestWave: 1.9, hs: 2.6 },
    gpuError: null, fps: 60, bakeMs: 120, tool: 'none',
  });
} catch (e) { hudError = (e as Error).message; }
check('HUD renders', hudError === '', hudError);
const lodText = window.document.getElementById('lod-plan')?.textContent ?? '';
check('HUD shows the adaptive plan', /DISPLACED/i.test(lodText), lodText.slice(0, 60).replace(/\s+/g, ' '));

// Exports must complete without throwing.
const exportErrors: string[] = [];
const each = (name: string, fn: () => void) => { try { fn(); } catch (e) { exportErrors.push(`${name}: ${(e as Error).message}`); } };
each('map png', () => exporters.exportMapPng(bake, world.ops));
each('heightmap png', () => exporters.exportHeightmapPng(bake));
each('obj', () => exporters.exportObj(bake));
each('world json', () => exporters.exportWorldJson(world, CITIES, {}));
each('coast svg', () => exporters.exportCoastSvg(extractCoastline(bake), bake));
each('spectrum csv', () => exporters.exportSpectrumCsv(cascades));
check('all six exports run', exportErrors.length === 0, exportErrors.join('; ') || `${downloads} download(s) triggered`);

// Camera maths
{
  const m = camera.matrix(16 / 9);
  check('camera matrices are finite', [...m.viewProj].every(Number.isFinite), 'finite viewProj');
  const ray = camera.ray(0, 0, 16 / 9);
  check('centre ray points at the orbit target', Math.abs(ray.dir[1]) > 0, `dir y ${ray.dir[1].toFixed(3)}`);
}
report();
