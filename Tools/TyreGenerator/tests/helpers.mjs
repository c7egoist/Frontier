// Test helpers: load the generator's dims()/PRESETS from TyreGenerator.html (geometry section only, no DOM/WebGL).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
export const HTML = path.join(here, '..', 'TyreGenerator.html');

globalThis.ClipperLib = require('clipper-lib');
globalThis.window = globalThis;

export function loadGenerator() {
  const html = readFileSync(HTML, 'utf8');
  const start = html.indexOf('<script type="module">') + '<script type="module">'.length;
  let src = html.slice(start, html.indexOf('</script>', start));
  const cut = src.indexOf('//  2D TREAD EDITOR');   // geometry + presets only; the editor and scene need a DOM
  src = src.slice(0, cut).split('\n').filter(l => !/^import /.test(l)).join('\n');
  const THREE = require('three');
  return new Function('THREE', src + `
    return { T, P, PRESETS, dims, renderPattern, buildProfile, applyPresetState: i => { Object.assign(T, PRESETS[i].tyre); P.name = PRESETS[i].name; P.type = PRESETS[i].type; P.layers = PRESETS[i].layers.map(l => Object.assign({}, l)); T.wear = 0; } };`)(THREE);
}
