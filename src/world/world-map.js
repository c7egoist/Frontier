/** Top-down world layout. Coordinates and region bounds are normalized to [0, 1]. */
export const MASK_RESOLUTION = 256;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function createWorld() {
  return { version: 1, layers: [], regions: [], nextLayer: 1, nextRegion: 1 };
}

export function addShapeLayer(world, name = `Shape ${world.nextLayer}`) {
  const layer = { id: `shape-${world.nextLayer++}`, name, visible: true, revision: 0, mask: new Uint8Array(MASK_RESOLUTION ** 2) };
  world.layers.push(layer);
  return layer;
}

/** Paint a continuous capsule in normalized map space. Erasing never affects other layers. */
export function paintMask(layer, x0, y0, x1, y1, radius, erase = false) {
  const n = MASK_RESOLUTION;
  layer.revision = (layer.revision || 0) + 1;
  const r = clamp(radius, 1 / n, 1);
  const minX = Math.max(0, Math.floor((Math.min(x0, x1) - r) * n));
  const maxX = Math.min(n - 1, Math.ceil((Math.max(x0, x1) + r) * n));
  const minY = Math.max(0, Math.floor((Math.min(y0, y1) - r) * n));
  const maxY = Math.min(n - 1, Math.ceil((Math.max(y0, y1) + r) * n));
  const dx = x1 - x0, dy = y1 - y0, denom = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = (x + 0.5) / n, py = (y + 0.5) / n;
    const t = denom ? clamp(((px - x0) * dx + (py - y0) * dy) / denom) : 0;
    const d = Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
    const coverage = clamp((r - d) * n + 0.5);
    const i = y * n + x;
    const value = Math.round(coverage * 255);
    layer.mask[i] = erase ? Math.min(layer.mask[i], 255 - value) : Math.max(layer.mask[i], value);
  }
}

export function normalizeBounds(x0, y0, x1, y1) {
  const bounds = { x: clamp(Math.min(x0, x1)), y: clamp(Math.min(y0, y1)), width: clamp(Math.max(x0, x1)) - clamp(Math.min(x0, x1)), height: clamp(Math.max(y0, y1)) - clamp(Math.min(y0, y1)) };
  return bounds.width >= 2 / MASK_RESOLUTION && bounds.height >= 2 / MASK_RESOLUTION ? bounds : null;
}

export function addRegion(world, layerId, bounds, name = `Terrain ${world.nextRegion}`) {
  if (!world.layers.some(layer => layer.id === layerId) || !bounds || bounds.width <= 0 || bounds.height <= 0 || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1) throw new Error('Invalid shape layer or bounds');
  const region = { id: `terrain-${world.nextRegion++}`, layerId, name, bounds: { ...bounds }, bake: null };
  world.regions.push(region);
  return region;
}

export function sampleGrid(data, n, u, v) {
  const x = clamp(u) * (n - 1), y = clamp(v) * (n - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  return (data[y0 * n + x0] * (1 - tx) + data[y0 * n + x1] * tx) * (1 - ty) + (data[y1 * n + x0] * (1 - tx) + data[y1 * n + x1] * tx) * ty;
}

/** Crop the selected shape into the region; mask is independent of terrain resolution. */
export function regionMask(world, region, size = MASK_RESOLUTION) {
  const layer = world.layers.find(item => item.id === region.layerId);
  if (!layer) throw new Error('Region shape layer no longer exists');
  const output = new Uint8Array(size * size), b = region.bounds;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    output[y * size + x] = Math.round(sampleGrid(layer.mask, MASK_RESOLUTION, b.x + (x / (size - 1)) * b.width, b.y + (y / (size - 1)) * b.height));
  }
  return output;
}

/** Combine actual region height bakes in stack order. Unbaked land stays flat. */
export function bakeWorld(world, size = 128) {
  const heights = new Float32Array(size * size), coverage = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1), i = y * size + x;
    for (const layer of world.layers) if (layer.visible) coverage[i] = Math.max(coverage[i], sampleGrid(layer.mask, MASK_RESOLUTION, u, v) / 255);
    for (const region of world.regions) {
      const layer = world.layers.find(item => item.id === region.layerId);
      const b = region.bounds;
      if (!layer?.visible || !region.bake || u < b.x || v < b.y || u > b.x + b.width || v > b.y + b.height) continue;
      const lu = (u - b.x) / b.width, lv = (v - b.y) / b.height;
      const weight = sampleGrid(layer.mask, MASK_RESOLUTION, u, v) / 255;
      heights[i] = heights[i] * (1 - weight) + sampleGrid(region.bake.heights, region.bake.size, lu, lv) * weight;
    }
  }
  return { size, heights, coverage };
}
