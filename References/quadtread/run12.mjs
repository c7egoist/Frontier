import { buildTread, toOBJ } from './quadmesh.mjs';
import { compile } from './quadcore.mjs';
import { t } from './harness.mjs';
import { DESIGNS } from './designs.mjs';

let fails = 0;
const T = t({ pitches: Number(process.env.PP || 48), xsub: Number(process.env.XS || 6) });
for (const D of DESIGNS) {
  const C = compile(T, D);
  const line = [];
  for (const st of [3, 4]) {
    const B = buildTread(T, D, { stage: st });
    const s = B.stats;
    const want = st === 1 ? null : 2 * s.cols;
    const bad = [];
    if (want !== null && s.open !== want) bad.push(`open ${s.open}!=${want}`);
    if (st > 1) for (const k of ['nonManifold', 'inconsistent', 'degenerate', 'pinched']) if (s[k]) bad.push(`${k}:${s[k]}`);
    if (s.quadsTile === 0) bad.push('EMPTY');
    if (bad.length) fails++;
    line.push(st === 1 ? `s1 ${s.quadsTile}q` : `s${st} ${s.quadsTile}q ${s.open}o${bad.length ? ' !!' + bad.join(',') : ''}`);
    if (st === 4) {
      const G = B.grid;
      console.log(`${D.id.padEnd(13)} pieces ${String(C.pieces.length).padStart(3)} cuts ${String(C.cuts.length).padStart(3)} rows ${String(s.rows).padStart(4)} cols ${String(s.cols).padStart(3)} mirror ${String(s.mirroredFaces).padStart(5)}/${String(s.quads).padStart(6)} | ${line.join(' | ')}`);
    }
  }
}
console.log(fails ? `\n${fails} FAILING` : `\nall ${DESIGNS.length} designs closed + oriented, quads only`);
