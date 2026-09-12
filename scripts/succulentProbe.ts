/** Headless topology probe for the desert roster.
 *
 * Usage: npx vite-node scripts/succulentProbe.ts "" 1,7,42
 */
import { PRESETS, cloneParams, isSucculent } from '../src/tree/params';
import { generateTree } from '../src/tree/generate';

const argv: string[] = (globalThis as unknown as { process: { argv: string[] } }).process.argv;
const seeds = (argv[3] ?? '1,7,42').split(',').map((s: string) => Number(s.trim())).filter((s: number) => Number.isFinite(s));
const query = (argv[2] ?? '').toLowerCase();
const presets = PRESETS.filter((p) => isSucculent(p) && (!query || p.name.toLowerCase().includes(query)));

for (const preset of presets) {
  for (const seed of seeds) {
    const p = cloneParams(preset);
    p.seed = seed;
    const r = generateTree(p);
    const s = r.succulent!;
    console.log(
      `${p.name}\tseed ${seed}\t${r.report.vertices} V / ${r.report.faces} F\t` +
        `quad ${(r.report.quadRatio * 100).toFixed(2)}%\t` +
        `chi ${r.report.eulerCharacteristic}\t` +
        `boundary ${r.report.boundaryEdges}\tnonmanifold ${r.report.nonManifoldEdges}\t` +
        `organs ${s.organs}\twindows ${s.junctions}\tdropped ${s.dropped}`,
    );
  }
}
