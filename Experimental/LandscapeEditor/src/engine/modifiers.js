import { num, int } from "./schema.js";
import { clamp, smoothstep, smootherstep, gaussianBlur, gradient, slopeDegrees, normalize } from "./field.js";
import { fbm } from "./noise.js";

// Modifiers reshape the heights directly. Inputs and outputs are normalised [0, 1].
// `c` = { N, cell, maxH, seaM, noiseFor(offset), derive(H) }.

export const MODIFIERS = {
  terrace: {
    label: "Terrace / strata",
    category: "modifier",
    blurb: "Quantises height into benches. Smooth = 0 gives hard steps, 1 gives soft rounded shelves.",
    params: [
      int("steps", "Steps", 2, 40, 8),
      num("smooth", "Edge softness", 0, 1, 0.01, 0.3),
    ],
    run(c, H, p) {
      const out = new Float32Array(H.length);
      const half = (1 - p.smooth) * 0.5 + 0.02;
      for (let i = 0; i < H.length; i++) {
        const t = H[i] * p.steps;
        const f = Math.floor(t);
        const r = t - f;
        const s = smoothstep(0.5 - half, 0.5 + half, r);
        out[i] = clamp((f + s) / p.steps, 0, 1);
      }
      return out;
    },
  },
  rift: {
    label: "Rift carve",
    category: "modifier",
    blurb: "Cuts a fault-line graben with a flat floor. The walls are as steep as Wall sharpness asks.",
    params: [
      num("depth", "Depth", 0, 800, 5, 220, "m"),
      num("frequency", "Fault frequency", 0.5, 8, 0.05, 2, "cycles"),
      num("width", "Rift width", 0.01, 0.3, 0.005, 0.06),
      num("wall", "Wall sharpness", 0, 1, 0.01, 0.6),
      num("warp", "Fault warp", 0, 1, 0.01, 0.5, "×"),
      int("seed", "Seed offset", 0, 999, 0),
    ],
    run(c, H, p) {
      const { N, maxH } = c;
      const n = c.noiseFor(p.seed + 97);
      const out = new Float32Array(H.length);
      const depthN = p.depth / maxH;
      const wall = 1 + p.wall * 3;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const u = x / N;
          const v = y / N;
          const wx = fbm(n.perlin, u * 2 + 4.1, v * 2 + 0.7, 3, 2, 0.5) * p.warp;
          const wy = fbm(n.perlin, u * 2 + 9.3, v * 2 + 6.2, 3, 2, 0.5) * p.warp;
          const z = Math.abs(n.perlin((u + wx * 0.5) * p.frequency, (v + wy * 0.5) * p.frequency));
          const inside = 1 - smoothstep(0, p.width * 3, z);
          const i = y * N + x;
          // Flat floor (raised to a power) with steep walls.
          out[i] = clamp(H[i] - depthN * Math.pow(inside, wall) * (1 - 0.15 * (1 - inside)), 0, 1);
        }
      }
      return out;
    },
  },
  smooth: {
    label: "Smooth",
    category: "modifier",
    blurb: "Gaussian relaxation. Calms harsh noise and keeps large forms, as a geologist would after weathering.",
    params: [
      int("radius", "Radius", 1, 20, 3, "cells"),
      num("detail", "Detail kept", 0, 1, 0.01, 0.4),
    ],
    run(c, H, p) {
      const blur = gaussianBlur(H, c.N, p.radius);
      const out = new Float32Array(H.length);
      for (let i = 0; i < H.length; i++) out[i] = blur[i] + (H[i] - blur[i]) * p.detail;
      return out;
    },
  },
  sharpen: {
    label: "Sharpen ridges",
    category: "modifier",
    blurb: "Unsharp mask on height. Pushes crests and spurs up and cuts valleys deeper for rugged outcrops.",
    params: [
      num("amount", "Amount", 0, 3, 0.01, 0.8),
      int("radius", "Radius", 2, 20, 6, "cells"),
    ],
    run(c, H, p) {
      const blur = gaussianBlur(H, c.N, p.radius);
      const out = new Float32Array(H.length);
      for (let i = 0; i < H.length; i++) out[i] = clamp(H[i] + p.amount * (H[i] - blur[i]), 0, 1);
      return out;
    },
  },
  cliffSculpt: {
    label: "Cliff sculpt",
    category: "modifier",
    blurb: "Steep faces snap into vertical steps while gentle ground stays smooth. Sea cliffs and mesa edges.",
    params: [
      num("threshold", "Cliff angle", 20, 80, 0.5, 45, "°"),
      num("stepSize", "Step height", 10, 400, 1, 90, "m"),
      num("softness", "Edge softness", 1, 20, 0.5, 6, "°"),
    ],
    run(c, H, p) {
      const { N, cell, maxH } = c;
      const { gx, gy } = gradient(Float32Array.from(H, (v) => v * maxH), N, cell);
      const slope = slopeDegrees(gx, gy);
      const out = new Float32Array(H.length);
      const stepN = p.stepSize / maxH;
      for (let i = 0; i < H.length; i++) {
        const k = smoothstep(p.threshold - p.softness, p.threshold + p.softness, slope[i]);
        const q = Math.floor(H[i] / stepN) * stepN;
        const frac = (H[i] - q) / stepN;
        const snapped = q + stepN * smoothstep(0.35, 0.65, frac);
        out[i] = clamp(H[i] + (snapped - H[i]) * k, 0, 1);
      }
      return out;
    },
  },
};
