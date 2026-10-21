/* ════════════════════════════════════════════════════════════════════
   io.js — project schema, JSON/CSV codecs, heightfield sampling.
   Pure except for the image-decoding + download helpers (DOM-guarded).
   ════════════════════════════════════════════════════════════════════ */
import {sampleRoad} from './spline.js';
import {SURFACE_IDS} from './geometry.js';

export const ROAD_FORMAT = 'frontier-road-network';
export const ROAD_VERSION = 1;

const ROAD_COLORS = ['#4a90e2', '#e2a44a', '#7ee7a5', '#c792ea', '#f6c66a', '#6cd5e0', '#f28b82', '#9aa0a6'];

const num = (v, fb) => (Number.isFinite(+v) ? +v : fb);

export function defaultRoad(id, n, overrides = {}) {
  return {
    id, name: `Road ${n}`,
    color: ROAD_COLORS[(n - 1) % ROAD_COLORS.length],
    visible: true, closed: false,
    lanes: 2, laneWidth: 3.5, shoulderL: 1.0, shoulderR: 1.0,
    kerbL: false, kerbR: false, camber: 0.06,
    surface: 'asphalt', centerMarking: 'dashed', edgeMarking: true,
    guardrailL: false, guardrailR: false,
    bridgeParapet: 'rail', bridgeSpacing: 12,
    conform: 'design', drapeOffset: 0.15,
    points: [],
    ...overrides
  };
}

export function newProject(name = 'Untitled route') {
  return {
    format: ROAD_FORMAT, version: ROAD_VERSION,
    units: 'meters', up: '+Y',
    name, nextId: 1,
    roads: [], junctions: [], heightmap: null,
    settings: {cornerRadius: 6}, intersectionOverrides: {}
  };
}

export function allocId(project, prefix) {
  return `${prefix}${project.nextId++}`;
}

function sanitizeRoad(r, warnings) {
  const points = (Array.isArray(r.points) ? r.points : []).map((p, i) => {
    if (!Number.isFinite(+p?.x) || !Number.isFinite(+p?.z)) {
      warnings.push(`point #${i + 1} had bad XZ and was reset to origin`);
    }
    const q = {x: num(p?.x, 0), z: num(p?.z, 0), y: num(p?.y, 0), w: num(p?.w, 1) || 1};
    if (p?.bridge) q.bridge = true;
    return q;
  });
  const lanes = Math.min(6, Math.max(1, Math.round(num(r.lanes, 2))));
  return {
    id: String(r.id || `r${Math.floor(Math.random() * 1e9)}`),
    name: String(r.name || 'Road'),
    color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#4a90e2',
    visible: r.visible !== false,
    closed: !!r.closed,
    lanes,
    laneWidth: Math.min(12, Math.max(1.5, num(r.laneWidth, 3.5))),
    shoulderL: Math.min(12, Math.max(0, num(r.shoulderL, 1))),
    shoulderR: Math.min(12, Math.max(0, num(r.shoulderR, 1))),
    kerbL: !!r.kerbL, kerbR: !!r.kerbR,
    camber: Math.min(0.5, Math.max(0, num(r.camber, 0.06))),
    surface: SURFACE_IDS.includes(r.surface) ? r.surface : 'asphalt',
    centerMarking: ['none', 'single', 'double', 'dashed'].includes(r.centerMarking) ? r.centerMarking : 'dashed',
    edgeMarking: r.edgeMarking !== false,
    guardrailL: !!r.guardrailL, guardrailR: !!r.guardrailR,
    bridgeParapet: r.bridgeParapet === 'wall' ? 'wall' : 'rail',
    bridgeSpacing: Math.min(30, Math.max(4, num(r.bridgeSpacing, 12))),
    conform: r.conform === 'drape' ? 'drape' : 'design',
    drapeOffset: Math.min(50, Math.max(-50, num(r.drapeOffset, 0.15))),
    points
  };
}

/** Parse + migrate a .road.json payload. Never throws on shape errors — reports warnings. */
export function parseProject(input) {
  const warnings = [];
  let raw = input;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); }
    catch { throw new Error('Not valid JSON — the file could not be parsed.'); }
  }
  if (!raw || typeof raw !== 'object') throw new Error('Not a road project file.');
  if (raw.format !== ROAD_FORMAT) warnings.push(`format is “${raw.format || '?'}”, expected “${ROAD_FORMAT}” — loading anyway`);
  if (num(raw.version, 1) > ROAD_VERSION) warnings.push(`version ${raw.version} is newer than this editor (v${ROAD_VERSION}) — some data may be ignored`);
  const project = newProject(String(raw.name || 'Imported route'));
  project.nextId = Math.max(1, Math.round(num(raw.nextId, 1)) || 1);
  project.roads = (Array.isArray(raw.roads) ? raw.roads : []).map((r) => sanitizeRoad(r, warnings));
  project.junctions = (Array.isArray(raw.junctions) ? raw.junctions : []).map((j, i) => ({
    id: String(j.id || `j${i + 1}`),
    name: String(j.name || `Junction ${i + 1}`),
    x: num(j.x, 0), z: num(j.z, 0), y: num(j.y, 0),
    links: (Array.isArray(j.links) ? j.links : [])
      .filter((l) => l && l.road && (l.end === 'start' || l.end === 'end'))
      .map((l) => ({road: String(l.road), end: l.end}))
  }));
  // Drop links that point at missing roads.
  for (const j of project.junctions) {
    const before = j.links.length;
    j.links = j.links.filter((l) => project.roads.some((r) => r.id === l.road));
    if (j.links.length !== before) warnings.push(`junction “${j.name}” referenced a missing road — link dropped`);
  }
  // Heightmap (embedded data URL or settings-only).
  const h = raw.heightmap;
  if (h && typeof h === 'object') {
    project.heightmap = {
      name: String(h.name || 'heightmap'),
      kind: h.kind === 'demo' ? 'demo' : 'image',
      width: Math.round(num(h.width, 0)) || 0,
      height: Math.round(num(h.height, 0)) || 0,
      minX: num(h.minX, -100), maxX: num(h.maxX, 100),
      minZ: num(h.minZ, -100), maxZ: num(h.maxZ, 100),
      base: num(h.base, 0), scale: num(h.scale, 30),
      image: typeof h.image === 'string' && h.image.startsWith('data:image/') ? h.image : null
    };
    if ((project.heightmap.width <= 0 || !project.heightmap.image) && h.grid) {
      // Compact numeric grids are accepted too (tests / synthetic terrain).
      project.heightmap.grid = h.grid;
    }
  }
  project.settings = {cornerRadius: Math.min(14, Math.max(2, num(raw.settings?.cornerRadius, 6)))};
  project.intersectionOverrides = {};
  if (raw.intersectionOverrides && typeof raw.intersectionOverrides === 'object') {
    for (const [k, v] of Object.entries(raw.intersectionOverrides)) {
      if (/^[\w@.-]{1,80}$/.test(k) && v && typeof v === 'object') {
        project.intersectionOverrides[k] = {enabled: v.enabled !== false};
      }
    }
  }
  // Ensure unique road/junction ids.
  const seen = new Set();
  for (const r of project.roads) {
    if (seen.has(r.id)) { r.id = `${r.id}_${Math.floor(Math.random() * 1e6)}`; warnings.push('duplicate road id repaired'); }
    seen.add(r.id);
  }
  for (const j of project.junctions) {
    if (seen.has(j.id)) { j.id = `${j.id}_${Math.floor(Math.random() * 1e6)}`; warnings.push('duplicate junction id repaired'); }
    seen.add(j.id);
  }
  return {project, warnings};
}

export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

/** Centreline stations for every road: road,s,x,y,z,heading_deg,grade_%,radius_m,width_m. */
export function centerlineCSV(project, {step = 2.0} = {}) {
  const rows = ['road_id,road_name,s_m,x_m,y_m,z_m,heading_deg,grade_pct,radius_m,width_m'];
  for (const road of project.roads || []) {
    const smp = sampleRoad(road.points, {closed: road.closed, step});
    const baseW = road.lanes * road.laneWidth + road.shoulderL + road.shoulderR;
    for (const p of smp.samples) {
      rows.push([road.id, `"${String(road.name).replace(/"/g, '""')}"`, p.s.toFixed(2),
        p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3), p.hdg.toFixed(1),
        (p.grade * 100).toFixed(2), Number.isFinite(p.radius) ? p.radius.toFixed(1) : '',
        (baseW * (p.w || 1)).toFixed(2)].join(','));
    }
  }
  return rows.join('\n') + '\n';
}

/* ── heightfield grid sampling (pure) ──────────────────────────────── */
/** Bilinear sample of a row-major Float32 grid; fx,fy in cells (0..w-1). Null outside. */
export function sampleGrid(grid, w, h, fx, fy) {
  if (!(fx >= 0 && fy >= 0 && fx <= w - 1 && fy <= h - 1)) return null;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const a = grid[y0 * w + x0], b = grid[y0 * w + x1];
  const c = grid[y1 * w + x0], d = grid[y1 * w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/**
 * Build a terrain sampler from grid + bounds. Returns
 * {sample(x,z)->y|null, bounds, minY, maxY, rev}.
 * Row 0 of the grid maps to minZ (north edge).
 */
export function createGridSampler(grid, w, h, bounds, rev = 1) {
  const {minX, maxX, minZ, maxZ} = bounds;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < minY) minY = grid[i];
    if (grid[i] > maxY) maxY = grid[i];
  }
  return {
    rev, bounds: {...bounds}, minY, maxY, gridW: w, gridH: h,
    grid,
    sample(x, z) {
      if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
      const fx = ((x - minX) / (maxX - minX)) * (w - 1);
      const fy = ((z - minZ) / (maxZ - minZ)) * (h - 1);
      return sampleGrid(grid, w, h, fx, fy);
    }
  };
}

/** Analytic demo hills — no image asset needed. */
export function createDemoHills(bounds = {minX: -160, maxX: 160, minZ: -160, maxZ: 160}, cells = 128) {
  const w = cells, h = cells;
  const grid = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = bounds.minX + ((bounds.maxX - bounds.minX) * i) / (w - 1);
      const z = bounds.minZ + ((bounds.maxZ - bounds.minZ) * j) / (h - 1);
      grid[j * w + i] =
        26 * Math.exp(-((x + 70) ** 2 + (z - 40) ** 2) / (2 * 70 * 70)) +
        40 * Math.exp(-((x - 80) ** 2 + (z + 60) ** 2) / (2 * 55 * 55)) +
        9 * Math.exp(-((x - 20) ** 2 + (z - 90) ** 2) / (2 * 40 * 40)) +
        3.2 * Math.sin(x * 0.045) * Math.cos(z * 0.05) +
        1.1 * Math.sin(x * 0.13 + 1.7) * Math.sin(z * 0.11 + 0.4);
    }
  }
  return {grid, w, h, bounds};
}

/* ── DOM-guarded helpers ───────────────────────────────────────────── */
const hasDOM = () => typeof document !== 'undefined';

/** Decode an <img>/File/blob URL into a height sampler. base+scale map black→base, white→base+scale. */
export async function samplerFromImage(src, {bounds, base = 0, scale = 30, maxCells = 256} = {}) {
  if (!hasDOM()) throw new Error('Image decoding needs a browser.');
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Could not decode that image as a heightmap.'));
    im.src = src;
  });
  const k = Math.min(1, maxCells / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * k));
  const h = Math.max(2, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const grid = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Luminance → height. Row 0 = image top = minZ (north).
    const lum = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
    grid[i] = base + lum * scale;
  }
  return createGridSampler(grid, w, h, bounds || {minX: -w / 2, maxX: w / 2, minZ: -h / 2, maxZ: h / 2});
}

/** Read a File as a data URL (for embedding the heightmap in the project). */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.readAsDataURL(file);
  });
}

export function downloadText(filename, text, mime = 'application/json') {
  if (!hasDOM()) return;
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export function downloadCanvasPNG(canvas, filename) {
  if (!hasDOM()) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }, 'image/png');
}

/* ── starter scene (built-in so first launch is never empty) ───────── */
export function starterProject() {
  const p = newProject('Ridge Pass');
  p.nextId = 5;
  p.roads = [
    {
      ...defaultRoad('r1', 1, {name: 'Ridge Pass', color: '#4a90e2'}),
      lanes: 2, laneWidth: 3.5, shoulderL: 1.2, shoulderR: 1.2,
      centerMarking: 'double', edgeMarking: true,
      guardrailL: true, guardrailR: true, surface: 'asphalt',
      points: [
        {x: -150, z: 60, y: 2, w: 1},
        {x: -105, z: 44, y: 5, w: 1},
        {x: -62, z: 52, y: 8, w: 1},
        {x: -28, z: 22, y: 11, w: 1},
        {x: -34, z: -22, y: 14, w: 1},
        {x: -4, z: -48, y: 17, w: 1},
        {x: 38, z: -38, y: 20, w: 1},
        {x: 52, z: 2, y: 22, w: 1}
      ]
    },
    {
      ...defaultRoad('r2', 2, {name: 'Quarry Spur', color: '#e2a44a'}),
      lanes: 1, laneWidth: 4.5, shoulderL: 0.8, shoulderR: 0.8,
      centerMarking: 'none', edgeMarking: false, surface: 'gravel',
      points: [
        {x: 52, z: 2, y: 22, w: 1},
        {x: 92, z: 10, y: 19, w: 1},
        {x: 128, z: 34, y: 16, w: 1.15},
        {x: 142, z: 72, y: 13, w: 1.25}
      ]
    },
    {
      ...defaultRoad('r3', 3, {name: 'Overlook Loop', color: '#7ee7a5'}),
      closed: true, lanes: 1, laneWidth: 3.2, shoulderL: 0.5, shoulderR: 0.5,
      centerMarking: 'dashed', edgeMarking: true, surface: 'dirt',
      points: [
        {x: -78, z: -72, y: 30, w: 1},
        {x: -44, z: -84, y: 31, w: 1},
        {x: -18, z: -62, y: 30, w: 1},
        {x: -30, z: -34, y: 29, w: 1},
        {x: -66, z: -38, y: 29, w: 1}
      ]
    }
  ];
  p.junctions = [
    {id: 'j4', name: 'Pass Summit', x: 52, z: 2, y: 22,
      links: [{road: 'r1', end: 'end'}, {road: 'r2', end: 'start'}]}
  ];
  return p;
}
