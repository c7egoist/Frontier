// Pure-model checks for the Fracture Editor: Project Zero storage compatibility, clamps, signature, bake states,
// stale diff and 3D shatter invariants (volume, closed pieces, outer skin, material character, convex parts).   node Experimental/FractureEditor/Scripts/CheckFractureEditor.mjs
import * as F from '../FractureModel.js';

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); pass++; console.log(' ok ', name); } catch (e) { fail++; console.log('FAIL', name, '\n    ', e.message); } };
const eq = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg); };

const crate = F.describe({ Id: 'crate', Name: 'Crate', Icon: 'editor-cube' }, { Scale: [1, 1, 1] });
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; };

check('defaults match Project Zero', () => {
  eq(F.normalize({}), { ...F.DEFAULTS, EditedAt: 0 });
  eq(F.normalize(null).Material, 'concrete');
  eq(F.STORAGE_PREFIX, 'Frontier.Fracture.v2:');
});
check('clamps and integer rounding', () => {
  const s = F.normalize({ Energy: 1e9, Seed: 3.6, Ceiling: 999, MinimumSize: 0, X: -5000, Material: 'cheese', SdfResolution: 100, Mode: 'BAKED' });
  eq([s.Energy, s.Seed, s.Ceiling, s.MinimumSize, s.X, s.Material, s.SdfResolution, s.Mode], [50000, 4, 160, 0.002, -1000, 'concrete', 64, 'dynamic']);
  eq(F.normalize({ Energy: 'nope' }).Energy, 2500);
});
check('describe strips editor- prefix and clamps scale', () => {
  eq(F.describe({ Id: 'a', Name: 'A', Icon: 'editor-sphere' }, { Scale: [0, 2, 5000] }), { Id: 'a', Name: 'A', Primitive: 'sphere', Scale: [0.001, 2, 1000] });
});
check('signature identical to the old editor (Revision 2, recipe only)', () => {
  const s = { Enabled: true, Mode: 'baked', PieceSdf: true, SdfResolution: 128, EditedAt: 9, Energy: 3000 };
  const expected = JSON.stringify({ Revision: 2, Primitive: 'cube', Scale: [1, 1, 1], Recipe: { Material: 'concrete', Energy: 3000, Seed: 42, Ceiling: 48, MinimumSize: 0.045, X: 0, Y: 0, Z: 0 } });
  eq(F.signature(crate, s), expected);
  eq(F.signature(crate, { ...s, Enabled: false, Mode: 'dynamic', PieceSdf: false }), expected, 'storage-only fields must not change the signature');
});
check('bake states', () => {
  const base = { Enabled: true, Mode: 'baked' };
  eq(F.bakeState(crate, {}), 'off');
  eq(F.bakeState(crate, { Enabled: true }), 'dynamic');
  eq(F.bakeState(crate, base), 'unbaked');
  const baked = { ...base, Baked: { Signature: F.signature(crate, base) } };
  eq(F.bakeState(crate, baked), 'ready');
  eq(F.bakeState(crate, { ...baked, Energy: 9000 }), 'stale');
  eq(F.bakeState(crate, { ...baked, PieceSdf: true }), 'sdf-pending');
  eq(F.bakeState(crate, { ...baked, PieceSdf: true, Baked: { ...baked.Baked, Sdf: { Resolution: 64 } } }), 'ready');
  eq(F.bakeState(crate, { ...baked, PieceSdf: true, SdfResolution: 128, Baked: { ...baked.Baked, Sdf: { Resolution: 64 } } }), 'sdf-pending');
  eq(F.bakeState({ ...crate, Scale: [2, 1, 1] }, baked), 'stale', 'rescaling the object invalidates the bake');
});
check('stale diff names what changed, revert restores it', () => {
  const s = { Enabled: true, Mode: 'baked', Baked: { Signature: F.signature(crate, {}) }, Energy: 9000, Material: 'glass' };
  const d = F.recipeDiff(crate, s);
  eq(d.map((x) => x.key), ['Material', 'Energy']);
  eq(d[0].from + ' → ' + d[0].to, 'Concrete → Glass');
  const r = F.bakedRecipe(s);
  eq(F.bakeState(crate, { ...s, ...r }), 'ready');
});
check('storage round-trip in Project Zero shape', () => {
  const st = memStore();
  F.writeStored(st, crate, { Enabled: true, Energy: 4000 });
  const raw = JSON.parse(st.map.get('Frontier.Fracture.v2:crate'));
  eq(Object.keys(raw), ['Owner', 'Settings']);
  eq(raw.Owner, crate);
  eq(raw.Settings.Energy, 4000);
  eq(F.readStored(st, 'crate').Settings.Enabled, true);
  eq(F.readStored(st, 'missing'), null);
  st.setItem('Frontier.Fracture.v2:bad', '{oops'); eq(F.readStored(st, 'bad'), null);
});
check('energy slider curve is monotonic and round-trips', () => {
  let prev = -1;
  for (let p = 0; p <= 1.0001; p += 0.02) { const j = F.sliderToEnergy(p); ok(j >= prev, 'monotonic'); prev = j; }
  eq(F.sliderToEnergy(1), 50000); eq(F.sliderToEnergy(0), 0);
  ok(Math.abs(F.sliderToEnergy(F.energyToSlider(2500)) - 2500) <= 50, 'round trip near 2500');
});
check('piece budget respects ceiling, minimum size and energy', () => {
  eq(F.pieceBudget(crate, { Ceiling: 10, Energy: 50000 }).pieces, 10);
  eq(F.pieceBudget(crate, { Ceiling: 10, Energy: 50000 }).limiter, 'ceiling');
  const big = F.pieceBudget(crate, { MinimumSize: 0.3, Energy: 50000 });
  eq([big.pieces, big.limiter], [3, 'size']);
  eq(F.pieceBudget(crate, {}).limiter, 'energy');
  eq(F.pieceBudget(crate, { Energy: 0 }).pieces, 2);
});
check('shatter is deterministic per seed and differs across seeds', () => {
  const a = F.shatter(crate, { Seed: 7 }), b = F.shatter(crate, { Seed: 7 }), c = F.shatter(crate, { Seed: 8 });
  eq(a.cells.map((x) => x.centroid), b.cells.map((x) => x.centroid));
  ok(JSON.stringify(a.cells.map((x) => x.centroid)) !== JSON.stringify(c.cells.map((x) => x.centroid)), 'seed should change the layout');
});
const PRIMS = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'mesh'];
const area = (pts) => { let n = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])]; } return n.map((v) => v / 2); };
check('pieces fill the solid exactly for every material and shape', () => {
  for (const prim of PRIMS) for (const m of F.MATERIALS) {
    const owner = F.describe({ Id: 'x', Name: 'X', Icon: 'editor-' + prim }, { Scale: [1.4, 2, 1] });
    const r = F.shatter(owner, { Material: m.id, Energy: 6000, X: 0.2, Y: 0.4, Z: 0.1 });
    ok(r.solid.volume > 0, `${prim}: solid volume ${r.solid.volume}`);
    const total = r.cells.reduce((s, c) => s + c.volume, 0);
    ok(Math.abs(total - r.solid.volume) / r.solid.volume < 1e-6, `${prim}/${m.id}: pieces hold ${total} of ${r.solid.volume}`);
    ok(r.cells.length >= 2 && r.cells.length <= r.budget.pieces, `${prim}/${m.id}: ${r.cells.length} pieces vs budget ${r.budget.pieces}`);
  }
});
check('every piece is a closed surface; cracks never add outer skin', () => {
  for (const prim of PRIMS) {
    const owner = F.describe({ Id: 'x', Icon: 'editor-' + prim }, { Scale: [1, 1.5, 1] });
    const r = F.shatter(owner, { Energy: 9000, Ceiling: 80, MinimumSize: 0.01 });
    let outer = 0;
    for (const c of r.cells) {
      const sum = [0, 0, 0];
      for (const f of c.faces) { const a = area(f.pts); for (let k = 0; k < 3; k++) sum[k] += a[k]; if (f.kind === 'outer') outer += Math.hypot(...a); }
      ok(Math.hypot(...sum) < 1e-6, `${prim}: piece surface not closed (${Math.hypot(...sum)})`);
      ok(c.faces.some((f) => f.kind === 'inner'), `${prim}: piece without a crack face`);
    }
    const skin = F.intact(owner).cells[0].faces.reduce((s, f) => s + Math.hypot(...area(f.pts)), 0);
    ok(Math.abs(outer - skin) / skin < 1e-6, `${prim}: outer skin ${outer} vs intact ${skin}`);
  }
});
check('materials have character (glass > concrete > plastic piece counts)', () => {
  const n = (m) => F.shatter(crate, { Material: m, Energy: 5000, Ceiling: 160, MinimumSize: 0.01 }).cells.length;
  ok(n('tempered') > n('glass') && n('glass') > n('concrete') && n('concrete') > n('plastic'), 'expected tempered > glass > concrete > plastic');
});
check('impact focus pulls small pieces toward the hit', () => {
  const r = F.shatter(crate, { Material: 'concrete', Energy: 8000, Ceiling: 120, MinimumSize: 0.01, X: 0.3, Y: 0.3, Z: 0.3 });
  const near = r.cells.filter((c) => c.dist < 0.25), far = r.cells.filter((c) => c.dist > 0.6);
  const avg = (xs) => xs.reduce((s, c) => s + c.size, 0) / xs.length;
  ok(near.length && far.length && avg(near) < avg(far), 'pieces near the impact should be smaller');
});
check('wood splinters are elongated along y', () => {
  const r = F.shatter(crate, { Material: 'wood', Energy: 8000, Ceiling: 60, MinimumSize: 0.01 });
  let tall = 0;
  for (const c of r.cells) { const pts = c.faces.flatMap((f) => f.pts), ext = (k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k])); if (ext(1) > Math.max(ext(0), ext(2))) tall++; }
  ok(tall / r.cells.length > 0.7, `only ${tall}/${r.cells.length} pieces taller than wide`);
});
check('glass panes break in-plane; concave and imported shapes fracture through convex parts', () => {
  const pane = F.describe({ Id: 'p', Icon: 'editor-cube' }, { Scale: [1.6, 1.1, 0.02] });
  const r = F.shatter(pane, { Material: 'glass', Energy: 2000 });
  ok(r.cells.every((c) => c.faces.some((f) => f.kind === 'outer' && Math.abs(area(f.pts)[2]) > 1e-9)), 'every shard keeps both pane faces');
  const torus = F.shatter(F.describe({ Id: 't', Icon: 'editor-torus' }, { Scale: [3, 3, 0.5] }), { Energy: 1500 });
  ok(torus.proxy.includes('convex') && torus.solid.parts.length === 16, 'torus decomposed into 16 wedges');
  ok(torus.cells.some((c) => c.parts > 1), 'some torus piece spans several wedges');
  const statue = F.shatter(F.describe({ Id: 'm', Icon: 'editor-mesh' }, { Scale: [1, 2.2, 1] }), {});
  ok(statue.proxy.startsWith('Proxy') && statue.cells.length >= 2, 'imported mesh uses the proxy hull');
});
check('storage estimate counts SDF only when enabled', () => {
  eq(F.storageEstimate(10, {}).sdf, 0);
  eq(F.storageEstimate(10, { PieceSdf: true, SdfResolution: 32 }).sdf, 10 * 32 ** 3 * 2);
  eq(F.formatBytes(F.storageEstimate(1, { PieceSdf: true, SdfResolution: 128 }).sdf), '4.0 MB');
});
check('formatting', () => {
  eq(F.formatEnergy(2500), '2.50 kJ'); eq(F.formatEnergy(150), '150 J'); eq(F.formatEnergy(32000), '32.0 kJ');
  eq(F.formatLength(0.045), '4.5 cm'); eq(F.formatLength(0.002), '2.0 mm'); eq(F.formatLength(1.5), '1.50 m');
  eq(F.shortHash('abc').length, 6);
});
check('histogram counts every piece', () => {
  const r = F.shatter(crate, { Energy: 9000 });
  eq(F.histogram(r.cells).bins.reduce((a, b) => a + b, 0), r.cells.length);
});

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
