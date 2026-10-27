import { DEFAULT_VEGETABLE, VEGETABLE_PRESETS } from '../src/plant/vegetableParams';
import { VegetableMesher } from '../src/plant/vegetableMesher';
import { validateTopology } from '../src/tree/validate';

const argv: string[] = (globalThis as unknown as { process: { argv: string[] } }).process.argv;
const only = argv[2];
const seeds = (argv[3] ?? '1,2,3').split(',').map(Number);

for (const preset of VEGETABLE_PRESETS) {
  if (only && !preset.name.toLowerCase().includes(only.toLowerCase())) continue;
  for (const seed of seeds) {
    const p = { ...DEFAULT_VEGETABLE, ...preset.vegetable };
    const t0 = performance.now();
    let r;
    try {
      r = new VegetableMesher(p, seed).build();
    } catch (e) {
      console.log(`${preset.name.padEnd(22)} seed=${seed} THREW ${(e as Error).message}`);
      continue;
    }
    const t1 = performance.now();
    const rep = validateTopology(r.mesh);
    const t2 = performance.now();
    console.log(
      `${preset.name.padEnd(22)} seed=${seed} organs=${r.stats.organs} lvl=${r.stats.perLevel.join('/')} ${JSON.stringify(r.stats.counts)} V=${rep.vertices} F=${rep.faces} quads=${(rep.quadRatio * 100).toFixed(1)}% ` +
        `bnd=${rep.boundaryEdges} nm=${rep.nonManifoldEdges} inc=${rep.inconsistentEdges} deg=${rep.degenerateFaces} chi=${rep.eulerCharacteristic} comp=${rep.components} genus=${rep.genus} h=${r.height.toFixed(2)} minE=${rep.minEdgeLength.toExponential(1)} dropped=${r.stats.dropped} ${JSON.stringify(r.stats.dropReasons)} ` +
        `t=${(t1 - t0).toFixed(0)}/${(t2 - t1).toFixed(0)}ms`,
    );
  }
}
