import { buildTread } from './quadmesh.mjs';
import { compile } from './quadcore.mjs';
import { t } from './harness.mjs';
import { DESIGNS } from './designs.mjs';
const T = t({ pitches: 2 });
for (const D of DESIGNS) {
  try {
    const C = compile(T, D);
    const B = buildTread(T, D, { stage: 3 });
    const s = B.stats;
    console.log(`${D.id.padEnd(13)} cuts ${String(C.cuts.length).padStart(3)} rows ${String(s.rows).padStart(5)} cols ${String(s.cols).padStart(4)} quads ${String(s.quadsTile).padStart(7)} open ${String(s.open).padStart(4)}/${2*s.cols} nm ${s.nonManifold} inc ${s.inconsistent} deg ${s.degenerate} pinch ${s.pinched} splits ${s.splits}/${s.passes} lv ${s.levels.join('+')}`);
  } catch (e) { console.log(`${D.id} THREW ${e.message}`); }
}
