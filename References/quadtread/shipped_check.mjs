/* Runs the meshing code exactly as it is embedded in References/QuadTreadAAA.html. */
// Run `node build_html.mjs --check` first: it writes _htmlcore.mjs from the markers inside QuadTreadAAA.html.
import { buildTread, compile, toOBJ, DESIGNS, BASE_T } from './_htmlcore.mjs';
const T = { ...BASE_T, pitches: 12 };
const names = ['top', 'floor', 'sipe', 'relief', 'kerf', 'pit'];
let bad = 0;
for (const D of DESIGNS) {
  const C = compile(T, D);
  const line = [];
  for (const st of [1, 2, 3, 4]) {
    const B = buildTread(T, D, { stage: st });
    const s = B.stats;
    const want = st === 1 ? null : 2 * s.cols;
    const errs = [];
    if (want !== null && s.open !== want) errs.push(`open ${s.open}/${want}`);
    if (st > 1) for (const k of ['nonManifold', 'inconsistent', 'degenerate', 'pinched']) if (s[k]) errs.push(`${k}:${s[k]}`);
    if (!s.quadsTile) errs.push('EMPTY');
    if (errs.length) bad++;
    line.push(`s${st} ${s.quadsTile}q${errs.length ? ' !!' + errs.join(',') : ' ✓'}`);
    if (st === 4) {
      // what three.js will actually consume: indexed sets over one shared position buffer, nothing out of range
      const nv = B.wp.length / 3;
      let seen = 0;
      for (const g of B.groups) {
        if (!g.quads) continue;
        if (g.idx.length !== g.quads * 4) { errs.push(`idx length ${g.idx.length} != ${g.quads * 4}`); }
        for (let i = 0; i < g.idx.length; i++) if (g.idx[i] < 0 || g.idx[i] >= nv) { errs.push('idx out of range'); break; }
        seen += g.quads;
      }
      if (seen !== s.quads) errs.push(`sets ${seen} != faces ${s.quads}`);
      if (B.wp.length % 3 || B.wp.some(v => !isFinite(v))) errs.push('bad positions');
      if (!isFinite(B.wire.length) || B.wire.length % 6) errs.push('bad wire');
      for (const v of B.wp) if (!isFinite(v)) { errs.push('NaN vertex'); break; }
      const fl = toOBJ(B).split('\n').filter(l => l[0] === 'f');
      const nq = fl.filter(l => !/^f \d+ \d+ \d+ \d+$/.test(l)).length;
      if (nq) { bad++; line.push(`OBJ:${nq} non-quad`); } else line.push(`obj ${fl.length} quad-faces ✓`);
    }
  }
  console.log(`${D.id.padEnd(13)} ${line.join('  ')}`);
}
console.log(bad ? `\n${bad} FAILING` : `\nshipped core: ${DESIGNS.length}/12 designs closed, oriented, all quads`);
process.exit(bad ? 1 : 0);
