// Runs every verification suite and summarises. Each suite exits non-zero on failure, so this
// is a plain sequence rather than a runner dependency.
import { spawnSync } from 'node:child_process';

const suites = [
  ['spectrum physics', 'tests/run.ts'],
  ['LOD resolver', 'tests/lod.ts'],
  ['world field + brushes', 'tests/terrain.ts'],
  ['FFT shader parity', 'tests/fftShaderParity.ts'],
  ['FFT pass chain', 'tests/chain.ts'],
  ['uniform layouts', 'tests/uniforms.ts'],
  ['shader parse + bindings', 'tests/shaders.ts'],
  ['stage visibility', 'tests/layoutSource.ts'],
  ['DOM boot (no GPU)', 'tests/domSmoke.ts'],
];

let failed = 0;
const summary = [];
for (const [name, file] of suites) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', file], { encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const m = /(\d+) passed, (\d+) failed/.exec(out);
  const ok = r.status === 0;
  if (!ok) failed++;
  summary.push({ suite: name, file, result: ok ? 'pass' : 'FAIL', detail: m ? `${m[1]} checks` : out.split('\n').slice(-3).join(' ') });
  if (!ok) process.stdout.write(`\n--- ${name} ---\n${out}\n`);
}

const width = [14, 26, 8, 12];
const line = '─'.repeat(width.reduce((a, b) => a + b + 2, 0));
const pad = (s, n) => s.padEnd(n).slice(0, n);
console.log(`\n${line}`);
console.log(`${pad('suite', width[0])}  ${pad('file', width[1])}  ${pad('result', width[2])}  detail`);
console.log(line);
for (const r of summary) console.log(`${pad(r.suite, width[0])}  ${pad(r.file, width[1])}  ${pad(r.result, width[2])}  ${r.detail}`);
console.log(line);
console.log(failed ? `${failed} suite(s) failed` : 'all suites passed');
process.exit(failed ? 1 : 0);
