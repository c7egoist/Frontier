// Erosion models. Every model works in "cell units" (height divided by cell size) so slopes are
// dimensionless rise-over-run, exactly as they would be on a real DEM. Results are converted back to
// metres. Each model reports the material it removed and deposited, which feeds the satmaps.
//
//  hydraulic  - particle droplets: rain flows downhill, picks up sediment and drops it on flats.
//  fluvial    - stream-power incision on a routed drainage network, with transport-limited deposition.
//  thermal    - talus creep: slopes steeper than the rock's angle of repose slump onto their neighbours.
//  aeolian    - wind transport: material is lifted from exposed windward faces and dropped in lee shadows.
//  glacial    - ice-fed valleys are widened into flat-floored U-shapes above the snowline.
import { makeGrid, minFilter, sampleBilinear, clamp, smoothstep, lerp } from './grid.js';
import { mulberry32 } from './noise.js';

// --- Routing: priority-flood depression filling (Barnes 2014) and D8 receivers -----------------

class MinHeap {
  constructor(cap) {
    this.k = new Float64Array(cap);
    this.v = new Int32Array(cap);
    this.size = 0;
  }
  push(key, val) {
    let i = this.size++;
    this.k[i] = key;
    this.v[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop() {
    const topV = this.v[0];
    this.size--;
    this.k[0] = this.k[this.size];
    this.v[0] = this.v[this.size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < this.size && this.k[l] < this.k[m]) m = l;
      if (r < this.size && this.k[r] < this.k[m]) m = r;
      if (m === i) break;
      [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
      [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
      i = m;
    }
    return topV;
  }
}

// Returns a copy of `hc` in which every pit is raised to its spill level, so water always reaches an outlet.
export function priorityFlood(hc, n) {
  const filled = Float32Array.from(hc);
  const closed = new Uint8Array(n * n);
  const heap = new MinHeap(n * n * 4);
  const eps = 1e-5;
  for (let x = 0; x < n; x++) {
    for (const i of [x, (n - 1) * n + x]) {
      closed[i] = 1;
      heap.push(filled[i], i);
    }
  }
  for (let y = 1; y < n - 1; y++) {
    for (const i of [y * n, y * n + n - 1]) {
      closed[i] = 1;
      heap.push(filled[i], i);
    }
  }
  while (heap.size) {
    const i = heap.pop();
    const x = i % n;
    const y = (i - x) / n;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (closed[j]) continue;
        closed[j] = 1;
        if (filled[j] <= filled[i]) filled[j] = filled[i] + eps;
        heap.push(filled[j], j);
      }
    }
  }
  return filled;
}

// Each cell drains to its steepest lower neighbour. Outlets point to themselves.
export function receivers(filled, n) {
  const recv = new Int32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let best = i;
      let bestSlope = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const dist = dx && dy ? Math.SQRT2 : 1;
          const s = (filled[i] - filled[yy * n + xx]) / dist;
          if (s > bestSlope) {
            bestSlope = s;
            best = yy * n + xx;
          }
        }
      }
      recv[i] = best;
    }
  }
  return recv;
}

// Indices ordered from highest to lowest filled elevation: donors always come before their receivers.
export function descendingOrder(filled) {
  const order = new Uint32Array(filled.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  return order.sort((a, b) => filled[b] - filled[a]);
}

// Upstream contributing area, in cells.
export function accumulate(order, recv) {
  const area = new Float32Array(recv.length).fill(1);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const r = recv[i];
    if (r !== i) area[r] += area[i];
  }
  return area;
}

// --- Hydraulic (particle) erosion -----------------------------------------------------------

function brush(radius) {
  const out = [];
  let sum = 0;
  const r = Math.max(1, Math.round(radius));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const w = Math.max(0, r - d);
      out.push([dx, dy, w]);
      sum += w;
    }
  }
  return out.map(([dx, dy, w]) => [dx, dy, w / sum]);
}

export function hydraulic(hc, n, p, seed) {
  const rng = mulberry32(seed);
  const br = brush(p.radius);
  const maxSteps = 48;
  const drops = Math.round(p.drops);
  for (let d = 0; d < drops; d++) {
    let px = 2 + rng() * (n - 4);
    let py = 2 + rng() * (n - 4);
    let dirX = 0;
    let dirY = 0;
    let speed = 1;
    let water = 1;
    let sediment = 0;
    for (let step = 0; step < maxSteps; step++) {
      const ix = px | 0;
      const iy = py | 0;
      const fx = px - ix;
      const fy = py - iy;
      const i = iy * n + ix;
      const h00 = hc[i];
      const h10 = hc[i + 1];
      const h01 = hc[i + n];
      const h11 = hc[i + n + 1];
      const gradX = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gradY = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      const height = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;

      dirX = dirX * p.inertia - gradX * (1 - p.inertia);
      dirY = dirY * p.inertia - gradY * (1 - p.inertia);
      let len = Math.hypot(dirX, dirY);
      if (len < 1e-9) {
        const a = rng() * Math.PI * 2;
        dirX = Math.cos(a);
        dirY = Math.sin(a);
        len = 1;
      }
      dirX /= len;
      dirY /= len;
      px += dirX;
      py += dirY;
      if (px < 1.5 || py < 1.5 || px > n - 2.5 || py > n - 2.5) break;

      const jx = px | 0;
      const jy = py | 0;
      const gx = px - jx;
      const gy = py - jy;
      const j = jy * n + jx;
      const newHeight = hc[j] * (1 - gx) * (1 - gy) + hc[j + 1] * gx * (1 - gy) + hc[j + n] * (1 - gx) * gy + hc[j + n + 1] * gx * gy;
      const dH = newHeight - height;

      const capacity = Math.max(-dH * speed * water * p.capacity, 0.01);
      if (sediment > capacity || dH > 0) {
        const amount = dH > 0 ? Math.min(dH, sediment) : (sediment - capacity) * p.depositRate;
        sediment -= amount;
        hc[i] += amount * (1 - fx) * (1 - fy);
        hc[i + 1] += amount * fx * (1 - fy);
        hc[i + n] += amount * (1 - fx) * fy;
        hc[i + n + 1] += amount * fx * fy;
      } else {
        const amount = Math.min((capacity - sediment) * p.erodeRate, -dH);
        for (let k = 0; k < br.length; k++) {
          const [dx, dy, w] = br[k];
          const xx = ix + dx;
          const yy = iy + dy;
          if (xx < 1 || yy < 1 || xx >= n - 1 || yy >= n - 1) continue;
          const c = yy * n + xx;
          hc[c] -= amount * w;
        }
        sediment += amount;
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dH * 4));
      water *= 1 - p.evaporation;
    }
  }
  return hc;
}

// --- Fluvial stream-power incision ----------------------------------------------------------

export function fluvial(hc, n, p, seed, onRound) {
  const rounds = Math.max(1, Math.round(p.rounds));
  const sweeps = Math.max(1, Math.round(p.sweeps));
  const K = p.erodibility * 0.12;
  const m = p.mExp;
  const exponentN = p.nExp;
  const dep = p.depositFrac;
  for (let r = 0; r < rounds; r++) {
    // Rebuild the drainage network from the current surface each round.
    const filled = priorityFlood(hc, n);
    const recv = receivers(filled, n);
    const order = descendingOrder(filled);
    const area = accumulate(order, recv);
    const q = new Float32Array(n * n);
    for (let s = 0; s < sweeps; s++) {
      q.fill(0);
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const rc = recv[i];
        if (rc === i) continue;
        const dist = rc - i === 1 || i - rc === 1 || rc - i === n || i - rc === n ? 1 : Math.SQRT2;
        const drop = hc[i] - hc[rc];
        const slope = drop > 0 ? drop / dist : 0;
        const cap = K * Math.pow(area[i], m) * Math.pow(slope, exponentN);
        const incoming = q[i];
        let out;
        if (cap > incoming) {
          const e = Math.min((cap - incoming) * 0.5, Math.max(0, drop) * 0.9);
          hc[i] -= e;
          out = incoming + e;
        } else {
          const dd = (incoming - cap) * dep;
          hc[i] += dd;
          out = incoming - dd;
        }
        q[rc] += out;
      }
      if (p.uplift) for (let i = 0; i < hc.length; i++) hc[i] += p.uplift;
    }
    if (onRound) onRound(r);
  }
  return hc;
}

// --- Thermal (talus) ------------------------------------------------------------------------

export function thermal(hc, n, p) {
  const tan = Math.tan((p.talus * Math.PI) / 180);
  const delta = new Float32Array(n * n);
  const offs = [-1, 1, -n, n, -n - 1, -n + 1, n - 1, n + 1];
  const dists = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  for (let it = 0; it < p.iterations; it++) {
    delta.fill(0);
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        for (let k = 0; k < 8; k++) {
          const j = i + offs[k];
          const excess = hc[i] - hc[j] - tan * dists[k];
          if (excess > 0) {
            const flow = excess * 0.5 * p.rate;
            delta[i] -= flow;
            delta[j] += flow;
          }
        }
      }
    }
    for (let i = 0; i < hc.length; i++) hc[i] += delta[i];
  }
  return hc;
}

// --- Aeolian (wind) -------------------------------------------------------------------------

export function aeolian(hc, n, p) {
  const a = (p.bearing * Math.PI) / 180;
  // Direction the wind blows toward, in grid space (x right, y down).
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const order = new Uint32Array(n * n);
  for (let i = 0; i < order.length; i++) order[i] = i;
  const proj = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) proj[y * n + x] = x * dx + y * dy;
  order.sort((u, v) => proj[u] - proj[v]);
  const q = new Float32Array(n * n);
  for (let it = 0; it < p.iterations; it++) {
    q.fill(0);
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const x = i % n;
      const y = (i - x) / n;
      const up = sampleBilinear(hc, n, x - dx, y - dy);
      const g = hc[i] - up;
      const qin = q[i];
      let qout;
      if (g > 0) {
        // Windward: the wind is accelerated over the crest and lifts loose material.
        const cap = p.strength * (0.15 + g * 0.8);
        const e = Math.max(0, cap - qin) * 0.5;
        hc[i] -= Math.min(e, 0.25 * Math.max(0, g));
        qout = qin + e;
      } else {
        // Lee: flow separates, sand drops, and the deposit grows toward a slipface.
        const shelter = clamp(-g * 2);
        const dd = qin * shelter * p.lee;
        hc[i] += dd;
        qout = qin - dd;
      }
      const nx = Math.round(x + dx);
      const ny = Math.round(y + dy);
      if (nx >= 0 && ny >= 0 && nx < n && ny < n) q[ny * n + nx] += qout;
    }
  }
  return hc;
}

// --- Glacial --------------------------------------------------------------------------------

export function glacial(hcMetres, n, cs, p, seed) {
  // Work in metres here: the snowline is an elevation, and the valley width is a distance.
  const h = Float32Array.from(hcMetres);
  const hc = h.map((v) => v / cs);
  const filled = priorityFlood(hc, n);
  const recv = receivers(filled, n);
  const order = descendingOrder(filled);
  const area = accumulate(order, recv);
  const logA = Float32Array.from(area, (v) => Math.log(v + 1));
  const sorted = Float32Array.from(logA).sort();
  const q = sorted[Math.floor((1 - p.reach) * (sorted.length - 1))];
  const radius = Math.max(1, Math.round(p.width / cs / 2));
  let out = h;
  for (let pass = 0; pass < p.passes; pass++) {
    const floor = minFilter(out, n, radius);
    const next = Float32Array.from(out);
    for (let i = 0; i < out.length; i++) {
      const ice = smoothstep(q - 0.4, q + 0.4, logA[i]) * smoothstep(p.ela - 400, p.ela + 250, out[i]);
      if (ice <= 0) continue;
      next[i] = lerp(out[i], floor[i], ice * p.strength * 0.5);
    }
    out = next;
  }
  return out;
}

// --- Registry -------------------------------------------------------------------------------

const P = (key, label, min, max, step, def, unit = '') => ({ key, label, min, max, step, default: def, unit });

export const EROSIONS = {
  hydraulic: {
    id: 'hydraulic',
    label: 'Hydraulic (rain)',
    description: 'Particle rainfall. Carves fine branching gullies and deposits fans on the flats.',
    params: [
      P('drops', 'Raindrops', 1000, 400000, 1000, 120000, ''),
      P('inertia', 'Inertia', 0, 0.5, 0.01, 0.05, ''),
      P('capacity', 'Sediment capacity', 0.5, 12, 0.1, 4, ''),
      P('erodeRate', 'Erosion rate', 0.02, 1, 0.01, 0.3, ''),
      P('depositRate', 'Deposition rate', 0.02, 1, 0.01, 0.3, ''),
      P('evaporation', 'Evaporation', 0, 0.1, 0.001, 0.02, ''),
      P('radius', 'Brush radius', 1, 6, 0.5, 3, 'cells'),
    ],
    run(ctx, p, h, cs) {
      const hc = Float32Array.from(h, (v) => v / cs);
      hydraulic(hc, ctx.n, p, ctx.seed);
      return hc.map((v) => v * cs);
    },
  },
  fluvial: {
    id: 'fluvial',
    label: 'Fluvial (rivers)',
    description: 'Stream-power incision along a routed drainage network. Sculpts valleys, river terraces and alluvial fans.',
    params: [
      P('erodibility', 'Erodibility', 0, 1, 0.01, 0.5, ''),
      P('mExp', 'Area exponent m', 0.1, 1, 0.01, 0.5, ''),
      P('nExp', 'Slope exponent n', 0.5, 2, 0.01, 1, ''),
      P('rounds', 'Network rebuilds', 1, 8, 1, 4, ''),
      P('sweeps', 'Sweeps per rebuild', 1, 20, 1, 4, ''),
      P('depositFrac', 'Flat-ground deposition', 0, 1, 0.01, 0.5, ''),
      P('uplift', 'Uplift per sweep', 0, 4, 0.05, 0, 'cells'),
    ],
    run(ctx, p, h, cs) {
      const hc = Float32Array.from(h, (v) => v / cs);
      fluvial(hc, ctx.n, p, ctx.seed);
      return hc.map((v) => v * cs);
    },
  },
  thermal: {
    id: 'thermal',
    label: 'Thermal (talus)',
    description: 'Rock slumps to its angle of repose. Gives scree slopes, talus aprons and rounded cliff bases.',
    params: [
      P('talus', 'Angle of repose', 15, 60, 0.5, 34, '°'),
      P('rate', 'Transfer rate', 0.05, 0.5, 0.01, 0.3, ''),
      P('iterations', 'Iterations', 1, 150, 1, 30, ''),
    ],
    run(ctx, p, h, cs) {
      const hc = Float32Array.from(h, (v) => v / cs);
      thermal(hc, ctx.n, p);
      return hc.map((v) => v * cs);
    },
  },
  aeolian: {
    id: 'aeolian',
    label: 'Aeolian (wind)',
    description: 'Wind transport. Strips crests, builds lee dunes and smooths sand plains.',
    params: [
      P('bearing', 'Wind from bearing', 0, 359, 1, 240, '°'),
      P('strength', 'Wind strength', 0, 1, 0.01, 0.5, ''),
      P('lee', 'Lee deposition', 0, 1, 0.01, 0.6, ''),
      P('iterations', 'Iterations', 1, 80, 1, 20, ''),
    ],
    run(ctx, p, h, cs) {
      const hc = Float32Array.from(h, (v) => v / cs);
      aeolian(hc, ctx.n, p);
      return hc.map((v) => v * cs);
    },
  },
  glacial: {
    id: 'glacial',
    label: 'Glacial (U-valleys)',
    description: 'Ice follows the high-accumulation valleys above the snowline and widens them into flat-floored U-shapes.',
    params: [
      P('ela', 'Snowline (ELA)', 0, 4000, 10, 1100, 'm'),
      P('reach', 'Ice reach', 0, 1, 0.01, 0.5, ''),
      P('width', 'Valley width', 50, 1200, 10, 300, 'm'),
      P('strength', 'Carve strength', 0, 1, 0.01, 0.6, ''),
      P('passes', 'Passes', 1, 8, 1, 3, ''),
    ],
    run(ctx, p, h, cs) {
      return glacial(h, ctx.n, cs, p, ctx.seed);
    },
  },
};

export const EROSION_LIST = Object.values(EROSIONS);

// Runs one erosion model on metres. Returns the new height plus the material removed and deposited (metres).
export function runErosion(type, ctx, params, h) {
  const def = EROSIONS[type] || EROSIONS.hydraulic;
  const out = def.run(ctx, params, h, ctx.cs);
  // Tectonic uplift is a constant lift, not moved material, so it is kept out of the erosion and deposition maps.
  const uplift = type === 'fluvial' ? (params.uplift || 0) * (params.sweeps || 1) * (params.rounds || 1) * ctx.cs : 0;
  const erosion = makeGrid(ctx.n);
  const deposit = makeGrid(ctx.n);
  for (let i = 0; i < h.length; i++) {
    const d = out[i] - h[i] - uplift;
    if (d < 0) erosion[i] = -d;
    else deposit[i] = d;
  }
  return { height: out, erosion, deposit };
}
