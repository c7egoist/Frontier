import { loadGenerator } from './helpers.mjs';
import { buildTyreQuadMesh, auditQuadMesh } from '../TyreTopology.js';
const G = loadGenerator();
const { T, PRESETS, dims } = G;
const which = process.argv[2] ? process.argv.slice(2).map(Number) : PRESETS.map((_, i) => i);
for (const i of which) {
  G.applyPresetState(i);
  const d = dims(); const t0 = Date.now();
  try {
    const m = buildTyreQuadMesh({ d, pattern: { layers: G.P.layers }, treadDepth: T.treadDepth, wear: T.wear, wearBias: T.wearBias, crown: T.crown, bulge: T.bulge, rimWidthFrac: T.rimWidthFrac, spacing: 15, chamfer: 0.25, faceBudget: Number(process.env.BUDGET || 120000) });
    const a = auditQuadMesh(m);
    console.log(PRESETS[i].name.padEnd(16), `${Date.now() - t0}ms`, JSON.stringify(a), JSON.stringify({ ...m.counts, contour: m.spacing.contour }));
  } catch (e) { console.log(PRESETS[i].name, 'ERROR', e.stack.split('\n').slice(0, 4).join(' | ')); }
}
