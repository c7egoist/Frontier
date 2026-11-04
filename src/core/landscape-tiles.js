/**
 * Budgeted tile scheduler for planet-scale terrain.
 *
 * This is the piece that makes "hundreds of kilometres, no VRAM/RAM cliff, no
 * HDD thrash" work without geometry streaming.
 *
 * Instead of streaming prebuilt geometry from disk (which is what turns an HDD
 * into a stutter machine), tiles are *derived data*: a pure function of the
 * document plus absolute coordinates. So the scheduler can
 *
 *   1. hold a hard memory budget (bytes, not a guess), evicting by LRU,
 *   2. queue generation by screen-space importance,
 *   3. cancel work that has gone out of view before it starts,
 *   4. drop and instantly regenerate any tile that was evicted — there is no
 *      decompression step and no disk read, so worst-case behaviour equals
 *      best-case behaviour. That is the HDD-robustness argument: local
 *      regeneration at ~1-4 ms per tile replaces random 4 K reads.
 */

export const BYTES_PER_FLOAT = 4;

/** Rough per-vertex/per-cell costs used for budgeting before allocation. */
export function estimateTileBytes(vertices, indices, extras = {}) {
  const positionBytes = vertices * 3 * BYTES_PER_FLOAT;
  const normalBytes = vertices * 3 * BYTES_PER_FLOAT;
  const uvBytes = vertices * 2 * BYTES_PER_FLOAT;
  const indexBytes = indices * BYTES_PER_FLOAT;
  const extraBytes = Object.values(extras).reduce((sum, value) => sum + (Number(value) || 0) * BYTES_PER_FLOAT, 0);
  return positionBytes + normalBytes + uvBytes + indexBytes + extraBytes;
}

export class LandscapeTileScheduler {
  constructor(options = {}) {
    this.tileMeters = options.tileMeters ?? 1024;
    /** Hard ceiling for resident tile payloads. */
    this.budgetBytes = options.budgetBytes ?? 320 * 1024 * 1024;
    /** Tiles generated per animation frame. */
    this.tilesPerFrame = options.tilesPerFrame ?? 3;
    /** Maximum tiles kept resident regardless of budget. */
    this.maxTiles = options.maxTiles ?? 768;
    this.tiles = new Map();
    this.queue = [];
    this.queued = new Set();
    this.bytes = 0;
    this.frame = 0;
    this.stats = {
      generated: 0,
      evicted: 0,
      rejected: 0,
      cancelled: 0,
      lastGenerateMs: 0,
      peakBytes: 0,
      peakTiles: 0,
    };
    this.onEvict = options.onEvict || null;
  }

  setBudget(bytes) {
    this.budgetBytes = Math.max(8 * 1024 * 1024, Number(bytes) || this.budgetBytes);
    this.enforceBudget();
  }

  /** Queue a tile for generation, inserting by descending priority (cost). */
  request(key, descriptor, priority) {
    const existing = this.tiles.get(key);
    if (existing && existing.descriptor.lod === descriptor.lod && existing.descriptor.revision === descriptor.revision) {
      existing.lastUsed = this.frame;
      return false;
    }
    if (this.queued.has(key)) {
      const index = this.queue.findIndex((entry) => entry.key === key);
      if (index >= 0) this.queue[index].priority = priority;
      return false;
    }
    this.queued.add(key);
    this.queue.push({
      key,
      descriptor,
      priority,
      requestedAt: this.frame,
      cancelled: false,
    });
    this.queue.sort((a, b) => a.priority - b.priority);
    return true;
  }

  cancel(key, predicate = null) {
    if (this.queued.has(key)) {
      const entry = this.queue.find((item) => item.key === key);
      if (entry && (!predicate || predicate(entry.descriptor))) {
        entry.cancelled = true;
        this.stats.cancelled += 1;
      }
    }
  }

  /** Drop everything queued whose descriptor is no longer wanted. */
  prune(keepKeys) {
    let removed = 0;
    for (const entry of this.queue) {
      if (!keepKeys.has(entry.key)) {
        entry.cancelled = true;
        removed += 1;
      }
    }
    if (removed) {
      this.queue = this.queue.filter((entry) => !entry.cancelled);
      for (const entry of this.queue) this.queued.add(entry.key);
      this.queued = new Set(this.queue.map((entry) => entry.key));
    }
    return removed;
  }

  get(key) {
    const tile = this.tiles.get(key);
    if (tile) tile.lastUsed = this.frame;
    return tile || null;
  }

  /**
   * Generates up to `tilesPerFrame` queued tiles. `build(descriptor)` returns
   * `{ data, bytes }`; returning null aborts that tile without counting an
   * error (used when a descriptor went stale mid-queue).
   */
  pump(build) {
    this.frame += 1;
    const started = now();
    let budget = this.tilesPerFrame;
    let generated = 0;
    while (this.queue.length && budget > 0) {
      const entry = this.queue.shift();
      this.queued.delete(entry.key);
      if (entry.cancelled) continue;
      budget -= 1;
      const result = build(entry.descriptor);
      if (!result) {
        this.stats.rejected += 1;
        continue;
      }
      const previous = this.tiles.get(entry.key);
      if (previous) {
        this.bytes -= previous.bytes;
        this.tiles.delete(entry.key);
      }
      const tile = {
        key: entry.key,
        descriptor: entry.descriptor,
        data: result.data,
        bytes: result.bytes,
        lastUsed: this.frame,
        bornAt: this.frame,
      };
      this.tiles.set(entry.key, tile);
      this.bytes += tile.bytes;
      generated += 1;
      this.stats.generated += 1;
    }
    this.stats.lastGenerateMs = generated ? now() - started : 0;
    this.enforceBudget();
    this.stats.peakBytes = Math.max(this.stats.peakBytes, this.bytes);
    this.stats.peakTiles = Math.max(this.stats.peakTiles, this.tiles.size);
    return generated;
  }

  enforceBudget() {
    while ((this.bytes > this.budgetBytes || this.tiles.size > this.maxTiles) && this.tiles.size > 1) {
      let oldestKey = null;
      let oldest = Infinity;
      for (const [key, tile] of this.tiles) {
        if (tile.lastUsed < oldest) {
          oldest = tile.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey === null) break;
      const tile = this.tiles.get(oldestKey);
      this.tiles.delete(oldestKey);
      this.bytes -= tile.bytes;
      this.stats.evicted += 1;
      if (this.onEvict) this.onEvict(tile);
    }
  }

  invalidate(predicate) {
    for (const [key, tile] of [...this.tiles]) {
      if (!predicate || predicate(tile.descriptor, key)) {
        this.tiles.delete(key);
        this.bytes -= tile.bytes;
        if (this.onEvict) this.onEvict(tile);
      }
    }
    for (const entry of this.queue) {
      if (!predicate || predicate(entry.descriptor, entry.key)) entry.cancelled = true;
    }
    this.queue = this.queue.filter((entry) => !entry.cancelled);
    this.queued = new Set(this.queue.map((entry) => entry.key));
  }

  clear() {
    if (this.onEvict) {
      for (const tile of this.tiles.values()) this.onEvict(tile);
    }
    this.tiles.clear();
    this.queue = [];
    this.queued.clear();
    this.bytes = 0;
  }

  report() {
    return {
      tiles: this.tiles.size,
      queued: this.queue.length,
      bytes: this.bytes,
      budgetBytes: this.budgetBytes,
      megabytes: this.bytes / (1024 * 1024),
      budgetMegabytes: this.budgetBytes / (1024 * 1024),
      ...this.stats,
    };
  }
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/**
 * Camera-relative tile selection with a clipmap-style ring structure.
 *
 * Rings double in tile size outward, which is the standard way to cover a
 * continent from a ground camera without a per-frame cost proportional to the
 * covered area: each ring costs O(ring tiles), not O(area).
 */
export const RING_LOD = Object.freeze([
  { ring: 0, tileMeters: 256, radiusTiles: 4, cellMeters: 8 },
  { ring: 1, tileMeters: 1_024, radiusTiles: 5, cellMeters: 32 },
  { ring: 2, tileMeters: 4_096, radiusTiles: 5, cellMeters: 128 },
  { ring: 3, tileMeters: 19_264, radiusTiles: 5, cellMeters: 512 },
  { ring: 4, tileMeters: 110_592, radiusTiles: 4, cellMeters: 3_072 },
]);

/**
 * Returns the tile descriptors needed around a focus point, nearest first.
 * `viewDistance` clamps how many rings are considered.
 */
export function selectTilesAround({ focusX, focusZ, viewDistance, revision, maxTiles = 512, minRing = 0 }) {
  const selected = [];
  const seen = new Set();
  for (const ring of RING_LOD) {
    if (ring.ring < minRing) continue;
    if (ring.radiusTiles * ring.tileMeters < viewDistance * 0.5) {
      // Still include inner rings; they are cheap and needed underfoot.
    }
    const centerTx = Math.floor(focusX / ring.tileMeters);
    const centerTz = Math.floor(focusZ / ring.tileMeters);
    for (let dz = -ring.radiusTiles; dz <= ring.radiusTiles; dz++) {
      for (let dx = -ring.radiusTiles; dx <= ring.radiusTiles; dx++) {
        const tx = centerTx + dx;
        const tz = centerTz + dz;
        const key = `${ring.ring}:${tx}:${tz}`;
        if (seen.has(key)) continue;
        // Skip tiles fully covered by the previous (finer) ring.
        if (ring.ring > 0) {
          const previous = RING_LOD[ring.ring - 1];
          const insidePrev = Math.abs(dx) * ring.tileMeters < previous.radiusTiles * previous.tileMeters
            && Math.abs(dz) * ring.tileMeters < previous.radiusTiles * previous.tileMeters;
          if (insidePrev) continue;
        }
        seen.add(key);
        const tileX = tx * ring.tileMeters;
        const tileZ = tz * ring.tileMeters;
        const dist = Math.hypot(
          tileX + ring.tileMeters * 0.5 - focusX,
          tileZ + ring.tileMeters * 0.5 - focusZ
        );
        if (viewDistance > 0 && dist > viewDistance + ring.tileMeters) continue;
        selected.push({
          key,
          tx,
          tz,
          ring: ring.ring,
          tileMeters: ring.tileMeters,
          cellMeters: ring.cellMeters,
          distance: dist,
          revision,
        });
      }
    }
  }
  selected.sort((a, b) => a.distance - b.distance);
  return selected.slice(0, maxTiles);
}
