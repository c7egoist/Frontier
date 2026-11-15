// Fracture recipe model — pure functions, no DOM.  Storage format, defaults, clamps and the bake signature are kept
// byte-compatible with the Project Zero editor (Frontier-OLD `ProjectZeroEditor`, key prefix `Frontier.Fracture.v2:`)
// so a recipe authored here is picked up by the old inspector card and vice versa.
//
// The shatter here is a *schematic*: a deterministic 2D Voronoi section through the object, good enough to show
// piece count, size spread, impact focus and material character in the UI.  It is not the runtime fracture solver.

export const STORAGE_PREFIX = 'Frontier.Fracture.v2:';
export const REVISION = 2;

export const DEFAULTS = Object.freeze({
  Enabled: false, Mode: 'dynamic', PieceSdf: false, SdfResolution: 64, Material: 'concrete',
  Energy: 2500, Seed: 42, Ceiling: 48, MinimumSize: 0.045, X: 0, Y: 0, Z: 0,
});

export const LIMITS = Object.freeze({
  Energy: [0, 50000], Seed: [1, 999999], Ceiling: [2, 160], MinimumSize: [0.002, 0.3], X: [-1000, 1000], Y: [-1000, 1000], Z: [-1000, 1000],
});
const INTEGER = new Set(['Seed', 'Ceiling']);
export const SDF_RESOLUTIONS = [32, 64, 128];

// yield: pieces per unit of (energy/2500)^½ · focus: share of cracks pulled toward the impact · pattern: site layout
// grain: anisotropy of cells along the object's up axis (wood splinters) · tone: schematic tint.
export const MATERIALS = [
  { id: 'concrete', name: 'Concrete', yield: 1.0, focus: 0.55, pattern: 'cluster', grain: 1, tone: '#a29d94', note: 'Chunky rubble, dense near the hit.' },
  { id: 'rock', name: 'Stone', yield: 0.75, focus: 0.35, pattern: 'cluster', grain: 1.25, tone: '#8a7f72', note: 'Few large slabs, cracks run long.' },
  { id: 'wood', name: 'Wood', yield: 0.55, focus: 0.4, pattern: 'grain', grain: 4.5, tone: '#b8865a', note: 'Splinters along the grain.' },
  { id: 'glass', name: 'Glass', yield: 1.7, focus: 0.85, pattern: 'radial', grain: 1, tone: '#9fd0dc', note: 'Radial shards from the impact.' },
  { id: 'tempered', name: 'Tempered glass', yield: 3.2, focus: 0.05, pattern: 'uniform', grain: 1, tone: '#86bfd0', note: 'Breaks everywhere into small cubes.' },
  { id: 'plastic', name: 'ABS plastic', yield: 0.35, focus: 0.7, pattern: 'cluster', grain: 1, tone: '#d9d2c2', note: 'Tough — only a few big pieces.' },
];
export const MATERIAL = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

export const PREVIEWABLE = ['cube', 'sphere', 'cylinder', 'cone'];

// ------------------------------------------------------------------ settings
export function normalize(raw = {}) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const t = {
    ...DEFAULTS,
    EditedAt: Number.isFinite(e.EditedAt) ? e.EditedAt : 0,
    Enabled: e.Enabled === true,
    PieceSdf: e.PieceSdf === true,
    SdfResolution: SDF_RESOLUTIONS.includes(Number(e.SdfResolution)) ? Number(e.SdfResolution) : 64,
    Mode: e.Mode === 'baked' ? 'baked' : 'dynamic',
    Material: Object.hasOwn(MATERIAL, e.Material) ? e.Material : DEFAULTS.Material,
  };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const n = Number(e[k] ?? DEFAULTS[k]);
    t[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[k];
    if (INTEGER.has(k)) t[k] = Math.round(t[k]);
  }
  if (e.Baked && typeof e.Baked.Signature === 'string') t.Baked = e.Baked;
  return t;
}

// Owner descriptor from a scene subject ({Id, Name, Icon:'editor-cube'}) and its transform values ({Scale:[x,y,z]}).
export function describe(subject, values = {}) {
  return {
    Id: subject.Id, Name: subject.Name, Primitive: subject.Icon?.replace(/^editor-/, ''),
    Scale: [0, 1, 2].map((i) => { const n = Number(values.Scale?.[i] ?? 1); return Number.isFinite(n) ? Math.min(1000, Math.max(0.001, n)) : 1; }),
  };
}

// The recipe is everything that changes geometry; storage mode, SDF options and bookkeeping are excluded.
export function recipe(settings) {
  // eslint-disable-next-line no-unused-vars
  const { Enabled, Mode, Baked, EditedAt, PieceSdf, SdfResolution, ...rest } = normalize(settings);
  return rest;
}

export function signature(owner, settings) {
  return JSON.stringify({ Revision: REVISION, Primitive: owner.Primitive, Scale: owner.Scale, Recipe: recipe(settings) });
}

export function shortHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

// off · dynamic · unbaked · stale · sdf-pending · ready
export function bakeState(owner, settings) {
  const s = normalize(settings);
  if (!s.Enabled) return 'off';
  if (s.Mode !== 'baked') return 'dynamic';
  if (!s.Baked) return 'unbaked';
  if (s.Baked.Signature !== signature(owner, s)) return 'stale';
  if (s.PieceSdf && (!s.Baked.Sdf || s.Baked.Sdf.Resolution !== s.SdfResolution)) return 'sdf-pending';
  return 'ready';
}

export const STATE_TEXT = {
  off: 'Fracture is off for this object.',
  dynamic: 'Fragments are generated at impact time.',
  unbaked: 'Not baked yet — bake to store the pieces.',
  stale: 'Recipe changed since the last bake.',
  'sdf-pending': 'Pieces are baked. Per-piece SDF is pending.',
  ready: 'Baked pieces are up to date.',
};

const FIELD_LABEL = { Material: 'Material', Energy: 'Energy', Seed: 'Seed', Ceiling: 'Piece ceiling', MinimumSize: 'Minimum size', X: 'Impact X', Y: 'Impact Y', Z: 'Impact Z' };
export function formatField(key, v) {
  if (key === 'Material') return MATERIAL[v]?.name ?? String(v);
  if (key === 'Energy') return formatEnergy(v);
  if (key === 'MinimumSize') return formatLength(v);
  if (key === 'X' || key === 'Y' || key === 'Z') return `${(+v).toFixed(2)} m`;
  return String(v);
}

// What changed between the baked recipe and the current one (and owner shape) — drives the stale explanation.
export function recipeDiff(owner, settings) {
  const s = normalize(settings);
  if (!s.Baked) return [];
  let then;
  try { then = JSON.parse(s.Baked.Signature); } catch { return [{ key: 'Signature', label: 'Signature', from: '?', to: '?' }]; }
  const now = recipe(s), out = [];
  for (const key of Object.keys(FIELD_LABEL)) {
    const a = then.Recipe?.[key], b = now[key];
    if (a !== b) out.push({ key, label: FIELD_LABEL[key], from: a === undefined ? '—' : formatField(key, a), to: formatField(key, b) });
  }
  if (then.Primitive !== owner.Primitive) out.push({ key: 'Primitive', label: 'Shape', from: String(then.Primitive), to: String(owner.Primitive) });
  if (JSON.stringify(then.Scale) !== JSON.stringify(owner.Scale)) out.push({ key: 'Scale', label: 'Scale', from: (then.Scale || []).join(' × '), to: owner.Scale.join(' × ') });
  if (then.Revision !== REVISION) out.push({ key: 'Revision', label: 'Solver revision', from: String(then.Revision), to: String(REVISION) });
  return out;
}

// Recipe fields back from a stored bake ("revert to baked").
export function bakedRecipe(settings) {
  const s = normalize(settings);
  if (!s.Baked) return null;
  try { return JSON.parse(s.Baked.Signature).Recipe || null; } catch { return null; }
}

// ------------------------------------------------------------------ persistence (Project Zero format)
export const storageKey = (id) => STORAGE_PREFIX + id;

export function readStored(storage, id) {
  try { const v = JSON.parse(storage.getItem(storageKey(id))); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

export function writeStored(storage, owner, settings) {
  const value = { Owner: owner, Settings: normalize(settings) };
  const text = JSON.stringify(value), key = storageKey(owner.Id);
  if (storage.getItem(key) !== text) storage.setItem(key, text);
  return value;
}

// ------------------------------------------------------------------ formatting
export function formatEnergy(j) {
  j = +j;
  if (j >= 1000) return `${(j / 1000).toFixed(j >= 10000 ? 1 : 2)} kJ`;
  return `${Math.round(j)} J`;
}
export function formatLength(m) {
  m = +m;
  if (m < 0.01) return `${(m * 1000).toFixed(1)} mm`;
  if (m < 1) return `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm`;
  return `${m.toFixed(2)} m`;
}
export function formatBytes(b) {
  if (b >= 1 << 20) return `${(b / (1 << 20)).toFixed(b >= 10 << 20 ? 0 : 1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

// Energy slider uses a cubic curve so the useful low range (taps, strikes) gets most of the travel.
export const energyToSlider = (j) => Math.cbrt(Math.max(0, j) / LIMITS.Energy[1]);
export const sliderToEnergy = (p) => { const j = LIMITS.Energy[1] * p ** 3; return j < 100 ? Math.round(j) : j < 2000 ? Math.round(j / 10) * 10 : Math.round(j / 50) * 50; };

export const ENERGY_PRESETS = [
  { id: 'tap', label: 'Tap', joules: 150 },
  { id: 'strike', label: 'Strike', joules: 2500 },
  { id: 'impact', label: 'Impact', joules: 9000 },
  { id: 'blast', label: 'Blast', joules: 32000 },
];

// ------------------------------------------------------------------ section outline (object local metres, y up)
export function outline(owner) {
  const [sx, sy] = owner.Scale, hx = sx / 2, hy = sy / 2;
  switch (owner.Primitive) {
    case 'cube': case 'cylinder': return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
    case 'cone': return [[-hx, -hy], [hx, -hy], [0, hy]];
    case 'sphere': return Array.from({ length: 56 }, (_, i) => { const a = (i / 56) * Math.PI * 2; return [Math.cos(a) * hx, Math.sin(a) * hy]; });
    default: return null;
  }
}

export function polygonArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a) / 2;
}

function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f;
  }
  if (Math.abs(a) < 1e-12) return p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0]);
  return [cx / (3 * a), cy / (3 * a)];
}

function inside(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  }
  return c;
}

// Keep the part of `poly` on the side of the bisector closer to a than b.
function clipBisector(poly, a, b) {
  const nx = b[0] - a[0], ny = b[1] - a[1];
  const d = (nx * (a[0] + b[0])) / 2 + (ny * (a[1] + b[1])) / 2;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = p[0] * nx + p[1] * ny - d, fq = q[0] * nx + q[1] * ny - d;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// How many pieces the recipe asks for and which limit wins (energy, ceiling or minimum size).
export function pieceBudget(owner, settings) {
  const s = normalize(settings), m = MATERIAL[s.Material];
  const shape = outline(owner);
  const area = shape ? polygonArea(shape) : owner.Scale[0] * owner.Scale[1];
  const byEnergy = Math.max(2, Math.round(m.yield * 24 * Math.sqrt(s.Energy / 2500)));
  const bySize = Math.max(2, Math.floor(area / (s.MinimumSize * 2.2) ** 2));
  const pieces = Math.max(2, Math.min(s.Ceiling, bySize, byEnergy));
  const limiter = pieces === byEnergy && byEnergy <= Math.min(s.Ceiling, bySize) ? 'energy' : pieces === s.Ceiling && s.Ceiling <= bySize ? 'ceiling' : 'size';
  return { pieces, byEnergy, bySize, ceiling: s.Ceiling, limiter, area };
}

// Memory estimate for a baked result (mesh pieces ~ 34 verts × 32 B + indices) and per-piece SDF (R16F voxels).
export function storageEstimate(pieces, settings) {
  const s = normalize(settings);
  const mesh = pieces * (34 * 32 + 64 * 3 * 2);
  const sdf = s.PieceSdf ? pieces * s.SdfResolution ** 3 * 2 : 0;
  return { mesh, sdf, total: mesh + (s.Mode === 'baked' ? sdf : 0) };
}

// Deterministic schematic shatter.  Returns null cells with a notice for shapes the preview can't section.
export function shatter(owner, settings) {
  const s = normalize(settings), m = MATERIAL[s.Material];
  const shape = outline(owner);
  const budget = pieceBudget(owner, s);
  if (!shape) {
    return { owner, shape: null, cells: [], budget, impact: [s.X, s.Y], notice: owner.Primitive === 'torus' ? 'Concave preview needs decomposition.' : 'Source geometry preview is pending.' };
  }
  const [sx, sy] = owner.Scale, hx = sx / 2, hy = sy / 2;
  const ix = Math.min(hx, Math.max(-hx, s.X)), iy = Math.min(hy, Math.max(-hy, s.Y));
  const R = Math.hypot(sx, sy) / 2;
  const rand = rng(s.Seed * 2654435761 + s.Material.length * 97);
  const n = budget.pieces, sites = [];
  const tryPush = (x, y) => { if (inside(shape, x, y)) { sites.push([x, y]); return true; } return false; };
  // Energy widens the spread of the crack cluster around the impact.
  const spread = R * (0.25 + 0.6 * Math.min(1, Math.sqrt(s.Energy / 20000)));
  let guard = 0;
  if (m.pattern === 'uniform') {
    const cols = Math.max(1, Math.round(Math.sqrt((n * sx) / sy))), rows = Math.max(1, Math.ceil(n / cols));
    for (let r = 0; r < rows && sites.length < n; r++) for (let c = 0; c < cols && sites.length < n; c++) {
      const x = -hx + ((c + 0.5 + (rand() - 0.5) * 0.7) / cols) * sx, y = -hy + ((r + 0.5 + (rand() - 0.5) * 0.7) / rows) * sy;
      if (!tryPush(x, y)) tryPush(x * 0.8, y * 0.8);
    }
  } else if (m.pattern === 'radial') {
    const spokes = Math.max(5, Math.round(Math.sqrt(n) * 2.2));
    while (sites.length < n && guard++ < n * 60) {
      const k = Math.floor(rand() * spokes), a = ((k + 0.5 + (rand() - 0.5) * 0.35) / spokes) * Math.PI * 2;
      // Shards run along spokes: a dense core at the hit, then long wedges out to the edge.
      const r = rand() < 0.45 ? spread * 0.5 * rand() ** 1.4 : R * 1.6 * rand() ** 1.15;
      tryPush(ix + Math.cos(a) * r, iy + Math.sin(a) * r);
    }
  }
  while (sites.length < n && guard++ < n * 200) {
    if (rand() < m.focus) { const a = rand() * Math.PI * 2, r = spread * rand() ** 1.5; tryPush(ix + Math.cos(a) * r, iy + Math.sin(a) * r * (m.pattern === 'grain' ? m.grain * 0.6 : 1)); }
    else tryPush(-hx + rand() * sx, -hy + rand() * sy);
  }
  // Grain: solve in a space squashed along y so cells come out long and thin.
  const g = m.grain;
  const squash = (p) => [p[0], p[1] / g], unsquash = (p) => [p[0], p[1] * g];
  const space = shape.map(squash), local = sites.map(squash);
  const cells = [];
  for (let i = 0; i < local.length; i++) {
    const order = local.map((p, j) => [j, (p[0] - local[i][0]) ** 2 + (p[1] - local[i][1]) ** 2]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    let poly = space;
    for (const [j, d2] of order) {
      let far = 0;
      for (const q of poly) far = Math.max(far, (q[0] - local[i][0]) ** 2 + (q[1] - local[i][1]) ** 2);
      if (d2 > 4 * far) break;
      poly = clipBisector(poly, local[i], local[j]);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    const p = poly.map(unsquash), area = polygonArea(p);
    if (area <= 1e-12) continue;
    const c = centroid(p);
    cells.push({ poly: p, area, size: Math.sqrt(area), centroid: c, dist: Math.hypot(c[0] - ix, c[1] - iy), shade: rand() });
  }
  cells.sort((a, b) => a.dist - b.dist);
  return { owner, shape, cells, budget, impact: [ix, iy], notice: null };
}

export function pieceStats(cells) {
  if (!cells.length) return { count: 0, smallest: 0, largest: 0, median: 0 };
  const sizes = cells.map((c) => c.size).sort((a, b) => a - b);
  return { count: sizes.length, smallest: sizes[0], largest: sizes[sizes.length - 1], median: sizes[sizes.length >> 1] };
}

// Size histogram (log-spaced) for the strip under the stage.
export function histogram(cells, bins = 12) {
  const out = new Array(bins).fill(0);
  if (!cells.length) return { bins: out, lo: 0, hi: 0 };
  const sizes = cells.map((c) => c.size), lo = Math.min(...sizes), hi = Math.max(...sizes);
  const L = Math.log(lo), H = Math.log(hi);
  for (const v of sizes) out[H - L < 1e-9 ? 0 : Math.min(bins - 1, Math.floor(((Math.log(v) - L) / (H - L)) * bins))]++;
  return { bins: out, lo, hi };
}
