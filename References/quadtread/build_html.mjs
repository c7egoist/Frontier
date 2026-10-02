/* Assembles References/QuadTreadAAA.html from the tested modules, and proves the shipped copy is the tested copy. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const rd = f => readFileSync(f.startsWith('/') ? f : join(here, f), 'utf8');
const strip = src => src.replace(/^import[^\n]*\n/gm, '').replace(/^export (const|function|let|class) /gm, '$1 ');

const OUT = join(here, '..', 'QuadTreadAAA.html');
const BASE_T = `{
  width: 245, aspect: 45, rim: 17, treadFrac: 0.88,
  depth: 9, crown: 2.5, shoulderLen: 12, shoulderDrop: 3,
  pitches: 48, chevron: 24, cham: 0.8, bevel: 1.2, sipeDepthF: 0.62,
  xsub: 6, usub: 9, xmin: 0.9, ugap: 0.7, skin: 2.2,
  skirt: true, skirtLen: 9, cap: false, wire: true, outline: true, tint: true, flat: false, spin: false,
}`;

if (process.argv[2] === '--check') {
  const html = rd(OUT);
  const m = html.match(/\/\*<<<CORE[\s\S]*?\*\/([\s\S]*?)\/\*>>>CORE\*\//);
  if (!m) { console.log('NO CORE MARKERS'); process.exit(1); }
  const body = m[1];
  const parts = ['quadcore.mjs', 'quadmesh.mjs', 'designs.mjs'];
  const src = [strip(rd('quadcore.mjs')), strip(rd('quadmesh.mjs')), `const BASE_T = ${BASE_T};`, strip(rd('designs.mjs'))].join('\n');
  const norm = t => t.replace(/\s+/g, ' ').trim();
  const same = norm(body) === norm(src);
  writeFileSync(join(here, '_htmlcore.mjs'), body + '\nexport { buildTread, compile, buildGrid, toOBJ, DESIGNS, BASE_T };\n');
  console.log(same ? 'core matches the modules byte-for-byte (modulo whitespace)' : 'CORE DIFFERS from the modules');
  process.exit(same ? 0 : 1);
}

const core = [strip(rd('quadcore.mjs')), strip(rd('quadmesh.mjs')), `const BASE_T = ${BASE_T};`, strip(rd('designs.mjs'))].join('\n\n');
let html = rd('template.html');
if (!html.includes('/*CORE*/')) { console.log('template lost the /*CORE*/ marker'); process.exit(1); }
html = html.replace('/*CORE*/', () => core);
writeFileSync(OUT, html);
console.log(`wrote ${OUT}  (${(html.length / 1024).toFixed(0)} KB, core ${(core.length / 1024).toFixed(0)} KB)`);
