// Headless verification: loads the app in real Chrome, catches console/runtime errors,
// exercises the generator across every type + roof form, and writes screenshots.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:5173/';
const OUT = path.resolve('shots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1600,1000',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

const errors = [];
const warnings = [];
page.on('console', (msg) => {
  const t = msg.type();
  const text = msg.text();
  if (t === 'error') errors.push(text);
  else if (t === 'warning') warnings.push(text);
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

console.log('→ loading', URL);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => !!window.__gen, { timeout: 60000 });
await sleep(2500);

const boot = await page.evaluate(() => {
  const { state, viewer } = window.__gen;
  let meshes = 0;
  let tris = 0;
  viewer.scene.traverse((o) => {
    if (o.isMesh && o.geometry) {
      meshes++;
      const pos = o.geometry.attributes.position;
      tris += Math.floor((o.geometry.index ? o.geometry.index.count : pos.count) / 3);
    }
  });
  return { type: state.params.type, info: window.__gen.state.lastInfo?.name, meshes, tris, children: viewer.scene.children.length };
});
console.log('boot:', JSON.stringify(boot));

// --- stress test every building type / roof form / tile inside the page ---
const stress = await page.evaluate(async () => {
  const { generator, materials, state } = window.__gen;
  const mod = await import('/src/lib/building.js');
  const names = await import('/src/data/names.js');
  const { TILE_TYPES } = await import('/src/lib/roofs.js');
  const results = [];
  const types = [];
  // collect every type from the UI chips
  document.querySelectorAll('[data-type-chip]').forEach((c) => types.push(c.dataset.typeChip));
  for (const type of types) {
    try {
      const p = mod.paramsFor(type, { seed: `test-${type}`, detail: 2 });
      const t0 = performance.now();
      const { info, group, lights } = generator.generate(p);
      let meshes = 0;
      group.traverse((o) => {
        if (o.isMesh) meshes++;
      });
      results.push({ type, ok: true, tris: info.triangles, meshes, lights: lights.length, ms: +(performance.now() - t0).toFixed(0) });
    } catch (e) {
      results.push({ type, ok: false, error: e.message + ' @ ' + (e.stack || '').split('\n')[1] });
    }
  }
  const roofResults = [];
  for (const roofType of ['gable', 'hip', 'irimoya', 'pyramid', 'tiered', 'shed', 'flat']) {
    for (const tile of TILE_TYPES) {
      try {
        const p = mod.paramsFor('machiya', { seed: `roof-${roofType}-${tile}`, roofType, roofTile: tile, detail: 2, floors: 3 });
        const { info } = generator.generate(p);
        roofResults.push({ roofType, tile, ok: true, tris: info.triangles });
      } catch (e) {
        roofResults.push({ roofType, tile, ok: false, error: e.message });
      }
    }
  }
  const detailResults = [];
  for (const detail of [0, 1, 2, 3]) {
    try {
      const p = mod.paramsFor('temple', { seed: `d${detail}`, detail });
      const t0 = performance.now();
      const { info } = generator.generate(p);
      detailResults.push({ detail, ok: true, tris: info.triangles, ms: +(performance.now() - t0).toFixed(0) });
    } catch (e) {
      detailResults.push({ detail, ok: false, error: e.message });
    }
  }
  // seed determinism check
  const a = generator.generate(mod.paramsFor('shop', { seed: 'determinism', detail: 2 }));
  const b = generator.generate(mod.paramsFor('shop', { seed: 'determinism', detail: 2 }));
  const determinism = a.info.triangles === b.info.triangles;
  void materials;
  void state;
  void names;
  return { results, roofResults, detailResults, determinism };
});

const failed = stress.results.filter((r) => !r.ok);
const roofFailed = stress.roofResults.filter((r) => !r.ok);
console.log('\n--- building types ---');
for (const r of stress.results) console.log(r.ok ? `  ✓ ${r.type.padEnd(10)} tris=${String(r.tris).padStart(7)} meshes=${String(r.meshes).padStart(3)} lights=${r.lights} ${r.ms}ms` : `  ✗ ${r.type}: ${r.error}`);
console.log(`\nroof/tile matrix: ${stress.roofResults.length - roofFailed.length}/${stress.roofResults.length} ok`);
for (const r of roofFailed) console.log(`  ✗ ${r.roofType}/${r.tile}: ${r.error}`);
console.log('detail levels:', JSON.stringify(stress.detailResults));
console.log('deterministic rebuild:', stress.determinism);

// --- screenshots of a few presets ---
const shots = [
  ['machiya', { type: 'machiya', theme: 'machiya', floors: 2, time: 'golden' }],
  ['temple', { type: 'temple', theme: 'temple', time: 'noon' }],
  ['ramen', { type: 'ramen', theme: 'showa', time: 'dusk' }],
  ['arcade', { type: 'arcade', theme: 'neonDistrict', time: 'night' }],
  ['pagoda', { type: 'pagoda', theme: 'lacquer', time: 'noon' }],
  ['apartment', { type: 'apartment', theme: 'whitewash', time: 'overcast' }],
];
for (const [name, cfg] of shots) {
  await page.evaluate((c) => {
    const { state, regenerate } = window.__gen;
    Object.assign(state.params, c, { ground: true, groundStyle: 'street' });
    window.__gen.viewer.setTimePreset(c.time);
    regenerate({ frame: true });
  }, cfg);
  await sleep(1800);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot →', name);
}

// --- street mode ---
await page.evaluate(() => {
  const { state, regenerate } = window.__gen;
  state.street.enabled = true;
  state.street.count = 7;
  state.street.mix = 'mixed';
  window.__gen.viewer.setTimePreset('dusk');
  regenerate({ frame: true });
});
await sleep(4000);
await page.screenshot({ path: path.join(OUT, 'street.png') });
const streetInfo = await page.evaluate(() => ({ count: window.__gen.state.buildings.length, tris: window.__gen.state.buildings.reduce((a, b) => a + b.info.triangles, 0) }));
console.log('street:', JSON.stringify(streetInfo));

// --- GLB export test (in-page, no download) ---
const glb = await page.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const root = window.__gen.viewer.content;
  const exporter = new GLTFExporter();
  return await new Promise((resolve) => {
    const t0 = performance.now();
    exporter.parse(
      root,
      (res) => resolve({ bytes: res.byteLength, ms: +(performance.now() - t0).toFixed(0) }),
      (e) => resolve({ error: String(e) }),
      { binary: true }
    );
  });
});
console.log('GLB export:', JSON.stringify(glb));

console.log('\n--- console errors (' + errors.length + ') ---');
for (const e of errors.slice(0, 25)) console.log('  !', e.slice(0, 300));
console.log('--- warnings (' + warnings.length + ') ---');
for (const w of warnings.slice(0, 8)) console.log('  ~', w.slice(0, 200));

await browser.close();
const bad = failed.length + roofFailed.length + errors.length;
console.log(bad === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${bad} problems`);
process.exit(bad === 0 ? 0 : 1);
