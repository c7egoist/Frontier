import { num, int } from "./schema.js";
import { clamp, smoothstep, routeFlow, accumulate, laplacian } from "./field.js";
import { mulberry32 } from "./rng.js";

// Erosion operates on heights in METRES (H is Float32Array of N*N metres) and returns
// { sed } where sed is the material deposited in metres. The caller blends the result
// into the stack through the layer mask, so an erosion only acts where it is allowed.

// Hydraulic (particle) erosion, after Beyer and Lague. Each droplet rolls downhill,
// picks up sediment while fast and steep, and drops it when it slows or climbs.
function hydraulic(c, H, p) {
  const { N } = c;
  const sed = new Float32Array(N * N);
  const rnd = mulberry32(c.seed + 101);
  const count = Math.round(p.density * N * N);
  const r = Math.max(1, Math.round(p.radius));
  const bx = [];
  const by = [];
  const bw = [];
  let wsum = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      const w = r - d;
      bx.push(dx);
      by.push(dy);
      bw.push(w);
      wsum += w;
    }
  }
  for (let k = 0; k < bw.length; k++) bw[k] /= wsum;
  const { inertia, capacity, erosionRate, depositRate, evaporation, gravity, minSlope } = p;
  const maxLife = p.lifetime | 0;
  for (let d = 0; d < count; d++) {
    let x = 1 + rnd() * (N - 3);
    let y = 1 + rnd() * (N - 3);
    let dx = 0;
    let dy = 0;
    let speed = 1;
    let water = 1;
    let s = 0;
    for (let life = 0; life < maxLife; life++) {
      const xi = x | 0;
      const yi = y | 0;
      const fx = x - xi;
      const fy = y - yi;
      const i = yi * N + xi;
      const h00 = H[i];
      const h10 = H[i + 1];
      const h01 = H[i + N];
      const h11 = H[i + N + 1];
      const gxv = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gyv = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      const hOld = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
      dx = dx * inertia - gxv * (1 - inertia);
      dy = dy * inertia - gyv * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) {
        const a = rnd() * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a);
      } else {
        dx /= len;
        dy /= len;
      }
      x += dx;
      y += dy;
      if (x < 1 || y < 1 || x >= N - 2 || y >= N - 2) break;
      const nx = x | 0;
      const ny = y | 0;
      const nfx = x - nx;
      const nfy = y - ny;
      const j = ny * N + nx;
      const hNew =
        H[j] * (1 - nfx) * (1 - nfy) +
        H[j + 1] * nfx * (1 - nfy) +
        H[j + N] * (1 - nfx) * nfy +
        H[j + N + 1] * nfx * nfy;
      const dh = hNew - hOld;
      const cap = Math.max(-dh, minSlope) * speed * water * capacity;
      if (s > cap || dh > 0) {
        // Deposit: drop sediment on the spot where the droplet slowed or climbed.
        const amt = dh > 0 ? Math.min(dh, s) : (s - cap) * depositRate;
        s -= amt;
        H[i] += amt * (1 - fx) * (1 - fy);
        H[i + 1] += amt * fx * (1 - fy);
        H[i + N] += amt * (1 - fx) * fy;
        H[i + N + 1] += amt * fx * fy;
        sed[i] += amt * (1 - fx) * (1 - fy);
        sed[i + 1] += amt * fx * (1 - fy);
        sed[i + N] += amt * (1 - fx) * fy;
        sed[i + N + 1] += amt * fx * fy;
      } else {
        // Erode: carve a soft brush around the droplet, never more than the drop in height.
        const amt = Math.min((cap - s) * erosionRate, -dh);
        s += amt;
        for (let k = 0; k < bw.length; k++) {
          const tx = xi + bx[k];
          const ty = yi + by[k];
          if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
          H[ty * N + tx] -= amt * bw[k];
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
      water *= 1 - evaporation;
    }
  }
  return sed;
}

// Thermal (talus) erosion: material slides off any slope steeper than the talus angle.
function thermal(c, H, p) {
  const { N, cell } = c;
  const sed = new Float32Array(N * N);
  const tan = Math.tan((p.talus * Math.PI) / 180);
  const diag = cell * Math.SQRT2;
  const D = [
    [-1, -1, diag],
    [0, -1, cell],
    [1, -1, diag],
    [-1, 0, cell],
    [1, 0, cell],
    [-1, 1, diag],
    [0, 1, cell],
    [1, 1, diag],
  ];
  const delta = new Float32Array(N * N);
  const exc_ = new Float64Array(8);
  for (let it = 0; it < p.iterations; it++) {
    delta.fill(0);
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        const h = H[i];
        // Each cell hands out at most half of its largest excess, so a cliff cannot overshoot and diverge.
        let total = 0;
        let maxExc = 0;
        for (let k = 0; k < 8; k++) {
          const [dx, dy, dist] = D[k];
          const exc = h - H[(y + dy) * N + x + dx] - tan * dist;
          exc_[k] = exc > 0 ? exc : 0;
          total += exc_[k];
          if (exc_[k] > maxExc) maxExc = exc_[k];
        }
        if (total <= 0) continue;
        const scale = Math.min(1, (0.5 * maxExc) / total) * p.rate;
        for (let k = 0; k < 8; k++) {
          if (exc_[k] <= 0) continue;
          const [dx, dy] = D[k];
          const j = (y + dy) * N + x + dx;
          const move = exc_[k] * scale;
          delta[i] -= move;
          delta[j] += move;
          sed[j] += move;
        }
      }
    }
    for (let i = 0; i < N * N; i++) H[i] += delta[i];
  }
  return sed;
}

// Stream-power fluvial erosion: dz/dt = U - K * A^m * S^n, with flow routed over a depression-filled surface.
// Eroded load travels downstream and drops where the gradient flattens.
function stream(c, H, p) {
  const { N, cell } = c;
  const sed = new Float32Array(N * N);
  const K = p.erodibility;
  const next = new Float32Array(N * N);
  for (let it = 0; it < p.iterations; it++) {
    const { receiver, slopeTo, order } = routeFlow(H, N, cell);
    const A = accumulate(receiver, order, null);
    const flux = new Float32Array(N * N);
    next.set(H);
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const r = receiver[i];
      const S = Math.max(0, slopeTo[i]);
      let ero = K * Math.pow(A[i], p.areaExp) * Math.pow(S, p.slopeExp);
      ero = Math.min(ero, p.maxStep);
      next[i] -= ero;
      flux[i] += ero;
      if (S < p.depositSlope) {
        // Deposition is capped per step so a whole catchment cannot bury one flat cell.
        const dep = Math.min(flux[i] * p.depositFraction, p.maxDeposit);
        next[i] += dep;
        sed[i] += dep;
        flux[i] -= dep;
      }
      if (r >= 0) flux[r] += flux[i];
    }
    for (let i = 0; i < N * N; i++) {
      H[i] = Math.max(0, next[i] + p.uplift);
    }
  }
  return sed;
}

// Aeolian (wind) erosion and dune build-up. Wind picks up sediment on windward faces, carries it
// downwind in saltation hops, and drops it where the lee slope shelters the flow.
function aeolian(c, H, p) {
  const { N, cell } = c;
  const sed = new Float32Array(N * N);
  const th = (p.direction * Math.PI) / 180;
  const wx = Math.cos(th);
  const wy = Math.sin(th);
  const hop = p.saltation;
  const F = new Float32Array(N * N);
  const F2 = new Float32Array(N * N);
  const sampleH = (x, y) => {
    const xc = clamp(x, 0, N - 1.001);
    const yc = clamp(y, 0, N - 1.001);
    const x0 = xc | 0;
    const y0 = yc | 0;
    const fx = xc - x0;
    const fy = yc - y0;
    const i = y0 * N + x0;
    return H[i] * (1 - fx) * (1 - fy) + H[i + 1] * fx * (1 - fy) + H[i + N] * (1 - fx) * fy + H[i + N + 1] * fx * fy;
  };
  const sampleF = (x, y) => {
    const xc = clamp(x, 0, N - 1.001);
    const yc = clamp(y, 0, N - 1.001);
    const x0 = xc | 0;
    const y0 = yc | 0;
    const fx = xc - x0;
    const fy = yc - y0;
    const i = y0 * N + x0;
    return F[i] * (1 - fx) * (1 - fy) + F[i + 1] * fx * (1 - fy) + F[i + N] * (1 - fx) * fy + F[i + N + 1] * fx * fy;
  };
  const pickBase = p.strength * 0.6;
  const capBase = p.strength * 0.5;
  for (let it = 0; it < p.iterations; it++) {
    // Pass 1: pick up on windward faces. Pickup slows as the carried load builds up.
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const s = (sampleH(x + wx, y + wy) - sampleH(x - wx, y - wy)) / (2 * cell);
        const load = Math.min(1, F[i] / (capBase + 1e-6));
        const pick = pickBase * Math.max(0, s) * (1 - load);
        H[i] -= pick;
        F[i] += pick;
      }
    }
    // Pass 2: saltation hop, a semi-Lagrangian advection of the carried load downwind.
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) F2[y * N + x] = sampleF(x - wx * hop, y - wy * hop);
    }
    F.set(F2);
    // Pass 3: deposit where the load exceeds the capacity of the local wind (lee shelter).
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const s = (sampleH(x + wx, y + wy) - sampleH(x - wx, y - wy)) / (2 * cell);
        const cap = capBase * clamp(1 + 6 * s, 0.05, 3);
        if (F[i] > cap) {
          const dep = (F[i] - cap) * 0.5;
          F[i] -= dep;
          H[i] += dep;
          sed[i] += dep;
        }
      }
    }
  }
  return sed;
}

// Glacial erosion: ice above the firn line carves cirques and widens valleys into U-shaped floors.
function glacial(c, H, p) {
  const { N, cell } = c;
  const sed = new Float32Array(N * N);
  const next = new Float32Array(N * N);
  for (let it = 0; it < p.iterations; it++) {
    const { receiver, slopeTo, order } = routeFlow(H, N, cell);
    const A = accumulate(receiver, order, null);
    const lap = laplacian(H, N);
    const ice = new Float32Array(N * N);
    const maxH = c.maxH;
    const line = p.iceline * maxH;
    for (let i = 0; i < N * N; i++) ice[i] = smoothstep(line - 0.04 * maxH, line + 0.04 * maxH, H[i]);
    next.set(H);
    for (let i = 0; i < N * N; i++) {
      const g = ice[i];
      if (g <= 0) continue;
      const S = Math.max(0, slopeTo[i]);
      const valley = smoothstep(4, 60, A[i]);
      // Valley widening: diffuse toward a flat floor where a glacier channel runs.
      next[i] += p.smoothing * 0.18 * g * valley * lap[i];
      // Cirque carving: concave hollows above the firn line deepen into bowls.
      next[i] -= p.cirque * 0.12 * g * Math.max(0, lap[i]);
      // Glacial plucking along the channel.
      next[i] -= Math.min(p.intensity * 0.08 * Math.sqrt(A[i]) * Math.pow(S, 0.9) * g, 25);
    }
    for (let i = 0; i < N * N; i++) {
      const before = H[i];
      H[i] = Math.max(0, next[i]);
      if (H[i] < before) sed[i] += Math.min(25, (before - H[i]) * (1 - ice[i]) * 0.3);
    }
  }
  return sed;
}

export const EROSIONS = {
  hydraulic: {
    label: "Hydraulic (rain)",
    category: "erosion",
    blurb: "Rain droplets carve gullies and deposit fans. Realistic dendritic drainage and sediment aprons.",
    params: [
      num("density", "Droplets per cell", 0.1, 4, 0.05, 1.2, "×"),
      int("lifetime", "Droplet lifetime", 10, 150, 60, "steps"),
      num("inertia", "Inertia", 0, 0.5, 0.01, 0.05),
      num("capacity", "Sediment capacity", 0.5, 12, 0.1, 4),
      num("erosionRate", "Erosion rate", 0.01, 1, 0.01, 0.3),
      num("depositRate", "Deposition rate", 0, 1, 0.01, 0.3),
      num("evaporation", "Evaporation", 0, 0.1, 0.001, 0.02),
      num("gravity", "Gravity", 1, 20, 0.1, 10),
      num("minSlope", "Minimum slope", 0, 0.5, 0.01, 0.05),
      num("radius", "Brush radius", 1, 6, 0.1, 2, "cells"),
    ],
    run: (c, H, p) => hydraulic(c, H, p),
  },
  thermal: {
    label: "Thermal (talus)",
    category: "erosion",
    blurb: "Rock fall and scree. Slopes relax to their angle of repose, so cliffs get aprons of debris.",
    params: [
      num("talus", "Talus angle", 15, 70, 0.5, 35, "°"),
      int("iterations", "Iterations", 1, 200, 25),
      num("rate", "Transfer rate", 0.05, 0.5, 0.01, 0.4),
    ],
    run: (c, H, p) => thermal(c, H, p),
  },
  stream: {
    label: "Stream power (fluvial)",
    category: "erosion",
    blurb: "Rivers incise according to drainage area and gradient. Canyons and valleys with knickpoints.",
    params: [
      int("iterations", "Iterations", 1, 40, 8),
      num("erodibility", "Erodibility (K)", 0.001, 0.2, 0.001, 0.02),
      num("areaExp", "Area exponent (m)", 0.2, 0.9, 0.01, 0.5),
      num("slopeExp", "Slope exponent (n)", 0.5, 2, 0.01, 1),
      num("uplift", "Uplift per step", 0, 20, 0.1, 0, "m"),
      num("maxStep", "Max cut per step", 1, 60, 0.5, 20, "m"),
      num("depositSlope", "Deposit below slope", 0, 0.1, 0.001, 0.02),
      num("depositFraction", "Deposit fraction", 0, 1, 0.01, 0.5),
      num("maxDeposit", "Max deposit per step", 0, 40, 0.1, 4, "m"),
    ],
    run: (c, H, p) => stream(c, H, p),
  },
  aeolian: {
    label: "Aeolian (wind & dunes)",
    category: "erosion",
    blurb: "Wind deflates windward faces and builds dunes and sand sheets on the lee. Use with desert presets.",
    params: [
      num("direction", "Wind direction", 0, 360, 1, 225, "°"),
      num("strength", "Wind strength", 0, 1, 0.01, 0.6),
      num("saltation", "Saltation hop", 1, 20, 0.1, 6, "cells"),
      int("iterations", "Iterations", 1, 400, 90),
    ],
    run: (c, H, p) => aeolian(c, H, p),
  },
  glacial: {
    label: "Glacial (U-valley)",
    category: "erosion",
    blurb: "Ice carves cirques and U-shaped valleys above the firn line. Alpine character.",
    params: [
      num("iceline", "Ice line", 0.2, 1, 0.01, 0.55, "×"),
      num("intensity", "Plucking intensity", 0, 2, 0.01, 0.6),
      num("smoothing", "Valley widening", 0, 1, 0.01, 0.5),
      num("cirque", "Cirque depth", 0, 1, 0.01, 0.4),
      int("iterations", "Iterations", 1, 30, 6),
    ],
    run: (c, H, p) => glacial(c, H, p),
  },
};

