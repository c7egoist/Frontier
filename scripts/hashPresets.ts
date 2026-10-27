import { PRESETS, cloneParams } from '../src/tree/params';
import { generateTree } from '../src/tree/generate';

const argv: string[] = (globalThis as unknown as { process: { argv: string[] } }).process.argv;
const only = (argv[2] ?? '').toLowerCase();
const seeds = (argv[3] ?? '1').split(',').map(Number);

function fnv(arr: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.round(arr[i] * 1e5) | 0;
    h ^= v & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

for (const preset of PRESETS) {
  if (only && !preset.name.toLowerCase().includes(only)) continue;
  for (const seed of seeds) {
    const p = cloneParams(preset);
    p.seed = seed;
    const r = generateTree(p, { validate: true, obstacleMeshes: false });
    const m = r.mesh;
    console.log(`${preset.name.padEnd(22)} s=${seed} V=${m.vertexCount} Q=${m.quadCount} T=${m.triCount} pos=${fnv(m.positions)} quads=${fnv(m.quads)} wind=${fnv(m.wind)} lvl=${fnv(m.levels)} genus=${r.report.genus} closed=${r.report.closed}`);
  }
}
