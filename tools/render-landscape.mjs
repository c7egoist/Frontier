/**
 * Landscape QA renderer.
 *
 * Renders the authored landscape field to PNG from a real camera so the terrain
 * shapes can be inspected without a browser. It reuses the project's existing
 * zero-dependency PNG encoder (tools/render-qa.mjs) and samples the exact
 * production field evaluator (src/core/landscape-field.js) — this is not a
 * separate approximation, so what it shows is what the studio draws.
 *
 * Usage:
 *   node tools/render-landscape.mjs --out Exports/landscape.png
 *   node tools/render-landscape.mjs --seed 77 --span 1200000 --yaw 40 --pitch 24
 *   node tools/render-landscape.mjs --topdown --out Exports/landscape-map.png
 */

import fs from 'node:fs';
import path from 'node:path';
import { encodeRgbPng } from './render-qa.mjs';
import { createLandscapeDocument, addStamp, createStamp } from '../src/core/landscape-document.js';
import { createLandscapeField } from '../src/core/landscape-field.js';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const PALETTE = {
  deepSeabed: [29, 33, 31],
  seabed: [84, 83, 62],
  sand: [183, 164, 113],
  wetSand: [86, 73, 50],
  grass: [71, 86, 49],
  steppe: [106, 105, 62],
  rock: [90, 86, 78],
  cliff: [73, 69, 64],
  scree: [117, 109, 96],
  snow: [225, 231, 238],
  water: [26, 74, 96],
  waterShallow: [56, 133, 126],
  foam: [226, 233, 236],
};

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

function shadeSurface(field, x, z, cell, seaLevel) {
  const elevation = field.elevationAt(x, z, cell);
  if (elevation < seaLevel) {
    const depth = seaLevel - elevation;
    let colour = mix(PALETTE.waterShallow, PALETTE.water, smoothstep(0, 120, depth));
    colour = mix(colour, PALETTE.deepSeabed, smoothstep(180, 2200, depth));
    // Surf band: where the bed is within a few metres of the surface.
    const surf = 1 - smoothstep(0, 6, depth);
    colour = mix(colour, PALETTE.foam, surf * 0.55);
    return colour;
  }
  const e = Math.max(0, elevation - seaLevel);
  const hL = field.elevationAt(x - cell, z, cell);
  const hR = field.elevationAt(x + cell, z, cell);
  const hD = field.elevationAt(x, z - cell, cell);
  const hU = field.elevationAt(x, z + cell, cell);
  const slope = Math.hypot((hR - hL) / (2 * cell), (hU - hD) / (2 * cell));
  const rockiness = smoothstep(0.22, 0.55, slope);

  let colour = mix(PALETTE.sand, PALETTE.grass, smoothstep(4, 70, e));
  colour = mix(colour, PALETTE.steppe, smoothstep(150, 600, e));
  colour = mix(colour, PALETTE.scree, smoothstep(400, 1100, e) * 0.7);
  colour = mix(colour, PALETTE.rock, rockiness * 0.85);
  colour = mix(colour, PALETTE.cliff, smoothstep(0.5, 0.85, slope));
  const snow = smoothstep(3300, 4400, e) * (1 - smoothstep(0.55, 0.9, slope) * 0.6);
  colour = mix(colour, PALETTE.snow, snow);
  const beach = 1 - smoothstep(1, 9, e);
  colour = mix(colour, PALETTE.wetSand, beach * 0.7);
  return colour;
}

/**
 * Cache the region as a regular height grid. The raymarcher then does cheap
 * bilinear lookups and only calls the exact evaluator to refine hits — the same
 * split the real viewport uses (analytic field for tiles, cached bed for water).
 */
function buildHeightGrid(field, { originX, originZ, spanMeters, resolution }) {
  const n = resolution;
  const step = spanMeters / (n - 1);
  const heights = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    const z = originZ + iz * step;
    for (let ix = 0; ix < n; ix++) {
      heights[iz * n + ix] = field.elevationAt(originX + ix * step, z, step);
    }
  }
  return {
    heights,
    n,
    step,
    originX,
    originZ,
    sample(x, z) {
      const fx = (x - originX) / step;
      const fz = (z - originZ) / step;
      if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) return -1e9;
      const ix = fx | 0;
      const iz = fz | 0;
      const tx = fx - ix;
      const tz = fz - iz;
      const a = heights[iz * n + ix];
      const b = heights[iz * n + ix + 1];
      const c = heights[(iz + 1) * n + ix];
      const d = heights[(iz + 1) * n + ix + 1];
      return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
    },
  };
}

function renderPerspective(field, options) {
  const { width, height, yawDeg, pitchDeg, distMul, focusX, focusZ } = options;
  const seaLevel = options.seaLevel;
  const ssaa = 2;
  const W = width * ssaa;
  const H = height * ssaa;
  const span = field.doc.world.spanMeters;

  const target = [focusX, 0, focusZ];
  const radius = span * 0.5;
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const camDist = radius * distMul * 1.6;
  const eye = [
    target[0] + Math.sin(yaw) * Math.cos(pitch) * camDist,
    target[1] + Math.sin(pitch) * camDist,
    target[2] + Math.cos(yaw) * Math.cos(pitch) * camDist,
  ];

  const fwd = normalize3([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = normalize3(cross3(fwd, [0, 1, 0]));
  const up = cross3(right, fwd);
  const fovScale = 1 / Math.tan((46 * Math.PI) / 360);
  const aspect = W / H;
  const sunDir = normalize3(options.sunDir);

  const rgb = new Uint8Array(W * H * 3);
  const maxDist = camDist * 1.7;
  const step = Math.max(span * 0.0009, camDist * 0.0009);

  // Grid extent follows the camera: a close-up must not be sampled at the
  // continent's spacing, and an overview must still reach the horizon.
  const gridSpan = clamp(camDist * 9, span * 0.02, span * 1.05);
  const grid = buildHeightGrid(field, {
    originX: focusX - gridSpan / 2,
    originZ: focusZ - gridSpan / 2,
    spanMeters: gridSpan,
    resolution: Math.min(1200, Math.max(256, Math.round(gridSpan / Math.max(8, camDist * 0.0045)))),
  });

  for (let py = 0; py < H; py++) {
    const ndcY = 1 - (py / (H - 1)) * 2;
    for (let px = 0; px < W; px++) {
      const ndcX = (px / (W - 1)) * 2 - 1;
      const dir = normalize3([
        fwd[0] * fovScale + right[0] * ndcX * aspect + up[0] * ndcY,
        fwd[1] * fovScale + right[1] * ndcX * aspect + up[1] * ndcY,
        fwd[2] * fovScale + right[2] * ndcX * aspect + up[2] * ndcY,
      ]);

      let hitT = -1;
      let t = Math.max(step, 1);
      let previousT = t;
      // March the cached grid (cheap bilinear), refine hits against the exact
      // field only when a crossing is bracketed.
      while (t < maxDist) {
        const x = eye[0] + dir[0] * t;
        const z = eye[2] + dir[2] * t;
        const y = eye[1] + dir[1] * t;
        const elevation = grid.sample(x, z);
        if (y - elevation < 0 && t > step) {
          let lo = previousT;
          let hi = t;
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) * 0.5;
            const mx = eye[0] + dir[0] * mid;
            const mz = eye[2] + dir[2] * mid;
            const my = eye[1] + dir[1] * mid;
            const md = my - field.elevationAt(mx, mz, Math.max(grid.step * 0.5, mid * 0.002));
            if (md > 0) lo = mid;
            else hi = mid;
          }
          hitT = (lo + hi) * 0.5;
          break;
        }
        previousT = t;
        t += Math.max(step, t * 0.0045);
      }

      let colour;
      if (hitT < 0) {
        // Sky gradient with a soft sun.
        const upness = clamp(dir[1] * 0.5 + 0.5, 0, 1);
        colour = mix([176, 193, 205], [86, 122, 166], Math.pow(upness, 0.7));
        const sun = Math.pow(Math.max(0, dot3(dir, sunDir)), 320) * 6;
        colour = [colour[0] + sun * 255, colour[1] + sun * 235, colour[2] + sun * 200];
      } else {
        const x = eye[0] + dir[0] * hitT;
        const z = eye[2] + dir[2] * hitT;
        const y = eye[1] + dir[1] * hitT;
        const cell = Math.max(grid.step * 0.5, hitT * 0.002);
        colour = shadeSurface(field, x, z, cell, seaLevel);
        if (y > seaLevel - 0.5) {
          const e = cell * 1.2;
          const hL = field.elevationAt(x - e, z, cell);
          const hR = field.elevationAt(x + e, z, cell);
          const hD = field.elevationAt(x, z - e, cell);
          const hU = field.elevationAt(x, z + e, cell);
          const n = normalize3([-(hR - hL) / (2 * e), 1, -(hU - hD) / (2 * e)]);
          const ndl = Math.max(0, dot3(n, sunDir));
          const sky = 0.34 + 0.66 * ndl;
          colour = [colour[0] * sky * 1.25, colour[1] * sky * 1.25, colour[2] * sky * 1.22];
        }
        // Aerial perspective
        const fog = 1 - Math.exp(-Math.pow(hitT / (maxDist * 0.85), 1.5));
        colour = mix(colour, [178, 194, 205], clamp(fog, 0, 0.9));
      }

      const index = (py * W + px) * 3;
      rgb[index] = clamp(Math.round(colour[0]), 0, 255);
      rgb[index + 1] = clamp(Math.round(colour[1]), 0, 255);
      rgb[index + 2] = clamp(Math.round(colour[2]), 0, 255);
    }
  }

  return { rgb, W, H, ssaa };
}

function renderTopDown(field, options) {
  const { width, height, focusX, focusZ, viewSpan } = options;
  const seaLevel = options.seaLevel;
  const W = width;
  const H = height;
  const cell = viewSpan / Math.max(W, H);
  const sunDir = normalize3(options.sunDir);
  const rgb = new Uint8Array(W * H * 3);
  const originX = focusX - (W * cell) / 2;
  const originZ = focusZ - (H * cell) / 2;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = originX + px * cell;
      const z = originZ + py * cell;
      let colour = shadeSurface(field, x, z, cell, seaLevel);
      const elevation = field.elevationAt(x, z, cell);
      if (elevation >= seaLevel) {
        const e = cell;
        const hL = field.elevationAt(x - e, z, cell);
        const hR = field.elevationAt(x + e, z, cell);
        const hD = field.elevationAt(x, z - e, cell);
        const hU = field.elevationAt(x, z + e, cell);
        const n = normalize3([-(hR - hL) / (2 * e), 1, -(hU - hD) / (2 * e)]);
        const ndl = Math.max(0, dot3(n, sunDir));
        const sky = 0.45 + 0.55 * ndl;
        colour = [colour[0] * sky * 1.2, colour[1] * sky * 1.2, colour[2] * sky * 1.18];
      }
      const index = (py * W + px) * 3;
      rgb[index] = clamp(Math.round(colour[0]), 0, 255);
      rgb[index + 1] = clamp(Math.round(colour[1]), 0, 255);
      rgb[index + 2] = clamp(Math.round(colour[2]), 0, 255);
    }
  }
  return { rgb, W, H, ssaa: 1 };
}

function downscale(rgb, W, H, factor) {
  if (factor <= 1) return { rgb, W, H };
  const w = Math.floor(W / factor);
  const h = Math.floor(H / factor);
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const index = ((y * factor + sy) * W + (x * factor + sx)) * 3;
          r += rgb[index];
          g += rgb[index + 1];
          b += rgb[index + 2];
        }
      }
      const count = factor * factor;
      const outIndex = (y * w + x) * 3;
      out[outIndex] = Math.round(r / count);
      out[outIndex + 1] = Math.round(g / count);
      out[outIndex + 2] = Math.round(b / count);
    }
  }
  return { rgb: out, W: w, H: h };
}

function main() {
  const seed = Number(arg('seed', '4029'));
  const span = Number(arg('span', '3200000'));
  const out = arg('out', 'Exports/landscape-qa.png');
  const width = Number(arg('width', '640'));
  const height = Number(arg('height', '420'));
  const yawDeg = Number(arg('yaw', '36'));
  const pitchDeg = Number(arg('pitch', '22'));
  const distMul = Number(arg('dist', '0.85'));
  const focusX = Number(arg('focus-x', '0'));
  const focusZ = Number(arg('focus-z', '0'));
  const viewSpan = Number(arg('view-span', String(span)));
  const seaLevel = Number(arg('sea', '0'));

  const doc = createLandscapeDocument({ name: 'QA Landscape', spanMeters: span, seed });
  const base = doc.layers.find((layer) => layer.kind === 'base');
  if (arg('coverage', null)) base.params.landCoverage = Number(arg('coverage'));
  if (arg('orogeny', null)) base.params.orogeny = Number(arg('orogeny'));
  if (arg('cell', null)) base.params.continentCellMeters = Number(arg('cell'));

  if (flag('stamps')) {
    const landform = doc.layers.find((layer) => layer.kind === 'landform');
    addStamp(doc, landform.id, createStamp({ kind: 'island', x: 0, z: 0, radius: 26_000, height: 1_400 }));
    addStamp(doc, landform.id, createStamp({ kind: 'canyon', x: 0, z: 0, radius: 18_000, height: 900 }));
    addStamp(doc, landform.id, createStamp({ kind: 'crater', x: 60_000, z: 20_000, radius: 16_000, height: 900 }));
    addStamp(doc, landform.id, createStamp({ kind: 'basin', x: -60_000, z: -20_000, radius: 40_000, height: 700 }));
  }

  const field = createLandscapeField(doc);
  const options = {
    width,
    height,
    yawDeg,
    pitchDeg,
    distMul,
    focusX,
    focusZ,
    viewSpan,
    seaLevel,
    sunDir: [0.55, 0.62, 0.42],
  };

  const started = Date.now();
  const result = flag('topdown') ? renderTopDown(field, options) : renderPerspective(field, options);
  const final = downscale(result.rgb, result.W, result.H, result.ssaa);
  const target = path.resolve(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, encodeRgbPng(final.W, final.H, final.rgb));
  console.log(`wrote ${target} (${final.W}x${final.H}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`land fraction ${(estimate(doc, field) * 100).toFixed(1)}%`);
}

function estimate(doc, field) {
  let land = 0;
  let total = 0;
  const span = doc.world.spanMeters;
  const step = span / 48;
  for (let iz = 0; iz < 48; iz++) {
    for (let ix = 0; ix < 48; ix++) {
      const e = field.elevationAt(-span / 2 + ix * step, -span / 2 + iz * step, step);
      total += 1;
      if (e > 0) land += 1;
    }
  }
  return total ? land / total : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
