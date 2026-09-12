import { PRESETS, PRESET_GROUPS, cloneParams, isGrass } from '../src/tree/params';
import { generateTree } from '../src/tree/generate';

/**
 * Deterministic review gate for the desert library. This is intentionally
 * stricter than the generic generator probe: a plant is not catalogued when a
 * seed creates a disconnected surface, a dropped organ, non-finite vertices,
 * or a visibly under-resolved silhouette. It is a geometry/silhouette gate,
 * not a substitute for an artist looking at the captured close-up.
 */
const seeds = [1, 7, 42];
const desertNames = new Set(
  PRESET_GROUPS.filter((g) => g.label === 'Desert' || g.label === 'Desert · succulents').flatMap((g) => g.names),
);
const desert = PRESETS.filter((p) => desertNames.has(p.name));

if (!desert.length) throw new Error('No desert presets found in the catalog');

let reviewed = 0;
for (const preset of desert) {
  for (const seed of seeds) {
    const p = cloneParams(preset);
    p.seed = seed;
    const r = generateTree(p, { obstacleMeshes: false });
    const pos = r.mesh.positions;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let finite = true;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const y = pos[i + 1];
      const z = pos[i + 2];
      finite = finite && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const height = maxY - minY;
    const topology = r.report.closed && r.report.manifold && r.report.components === 1 && r.report.genus === 0;
    const organs = isGrass(preset) ? r.grass?.dropped ?? 0 : r.stats.droppedStems;
    const pass = topology && finite && organs === 0 && r.report.degenerateFaces === 0 && r.report.quadRatio >= 0.995 && height > 0.025 && width > 0.001 && depth > 0.001;
    if (!pass) {
      throw new Error(
        `${preset.name} seed ${seed} failed review: ` +
          JSON.stringify({ topology, finite, dropped: organs, degenerate: r.report.degenerateFaces, quadRatio: r.report.quadRatio, width, height, depth }),
      );
    }
    reviewed++;
    console.log(
      `PASS  ${preset.name.padEnd(22)} seed=${seed} ${isGrass(preset) ? 'succulent' : 'cactus/tree '.trim()} ` +
        `silhouette=${width.toFixed(3)}×${height.toFixed(3)}×${depth.toFixed(3)} m ` +
        `V=${r.report.vertices} F=${r.report.faces} quads=${(r.report.quadRatio * 100).toFixed(2)}%`,
    );
  }
}

console.log(`\nDesert review gate: ${reviewed}/${desert.length * seeds.length} captures pass`);
