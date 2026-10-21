import test from 'node:test';
import assert from 'node:assert/strict';

// Shader sources are static strings — verify structural sanity without GL.
test('VERT + FRAG are structurally sane GLSL', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../src/shaders.js', import.meta.url), 'utf8'));
  const vert = src.match(/export const VERT = \/\* glsl \*\/`([\s\S]*?)`;/)[1];
  const frag = src.match(/export const FRAG = \/\* glsl \*\/`([\s\S]*?)`;/)[1];
  for (const [name, code] of [['VERT', vert], ['FRAG', frag]]) {
    assert.ok(code.includes('void main'), `${name} has main`);
    assert.equal((code.match(/{/g) || []).length, (code.match(/}/g) || []).length, `${name} braces`);
    assert.equal((code.match(/\(/g) || []).length, (code.match(/\)/g) || []).length, `${name} parens`);
    assert.ok(!code.includes('${'), `${name} has no accidental template holes`);
  }
  // Every uniform set by the engine must be declared.
  const engine = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../src/engine.js', import.meta.url), 'utf8'));
  const used = [...engine.matchAll(/u\.(\w+)\.value/g)].map((m) => m[1]);
  assert.ok(used.length > 10, 'engine sets uniforms');
  for (const u of new Set(used)) {
    assert.ok(vert.includes(u), `VERT declares ${u}`);
  }
  // Every uniform in makeUniforms must be consumed by the engine or defaults.
  const uni = src.match(/export function makeUniforms\(\) \{([\s\S]*?)\n\}/)[1];
  for (const u of [...uni.matchAll(/(\w+): \{value/g)].map((m) => m[1])) {
    assert.ok(vert.includes(u) || frag.includes(u), `uniform ${u} declared in shaders`);
  }
});

test('particles are true 3D solids with faceted lighting', async () => {
  const {VERT, FRAG, SOLIDS} = await import('../src/shaders.js');
  assert.deepEqual([...SOLIDS].sort(), ['cube', 'shard']);
  // Real 3D orientation: velocity frame + tumble, local solid vertex/normal.
  for (const token of ['normal', 'position', 'uTumble', 'cameraPosition', 'viewMatrix']) {
    assert.ok(VERT.includes(token), `VERT uses ${token}`);
  }
  // Faceted lighting: key diffuse + rim + specular glint.
  for (const token of ['keyDir', 'dif', 'rim', 'spec', 'reflect(']) {
    assert.ok(VERT.includes(token), `VERT lights with ${token}`);
  }
  // No billboard math may remain.
  assert.ok(!VERT.includes('modelViewMatrix'), 'no view-space billboard offsets');
  assert.ok(!VERT.includes('vUv'), 'no quad UV varying');
  // Fragment shades the solid (tip glow, dither, alpha discard).
  for (const token of ['vLocal', 'gl_FragColor', 'discard', 'gl_FragCoord']) {
    assert.ok(FRAG.includes(token), `FRAG uses ${token}`);
  }
});

test('simulation stays scrub-safe (pure function of time + seeds)', async () => {
  const {VERT} = await import('../src/shaders.js');
  assert.ok(VERT.includes('uTime'), 'driven by uTime');
  assert.ok(VERT.includes('aSeed') && VERT.includes('aIndex'), 'per-particle seeds');
  assert.ok(!VERT.includes('texture'), 'no feedback buffers');
});
