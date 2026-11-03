// Software reference renderer for evidence. This is NOT the GPU path — it re-implements the
// ocean surface shading in TypeScript so the height field, spectrum behaviour and LOD decision
// can be inspected as images in an environment with no GPU. The GPU shader is the shipping path;
// this exists so the numbers and the imagery can be checked together.

import { makeCascades, evaluateCascadeCPU, DEFAULT_OCEAN, type SpectrumCascade } from '../src/core/oceanSpectrum.ts';
import { resolveWaterLod, type LODParams } from '../src/core/lod.ts';
import { WorldField, DEFAULT_WORLD, bakeHeightmap, sampleBake } from '../src/core/terrain.ts';
import { MERIDIAN, VESPER, THULE, AUSTRAL, ARCHIPELAGO, GULFS } from '../src/world/presets.ts';
import { newImage, put, rect, text, textWidth, writePng, type Image } from './png.ts';

const OUT = process.argv[2] ?? 'Exhibits';

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smooth(e0: number, e1: number, x: number) { const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); }
function aces(x: number) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1); }
function gamma(v: number) { return Math.pow(aces(v), 1 / 2.2); }
const toByte = (v: number) => Math.round(clamp(v, 0, 1) * 255);

// ---------------------------------------------------------------------------
// 1. Ocean surface perspective render (near field, displaced regime)
// ---------------------------------------------------------------------------
function renderOceanView(w: number, h: number, time: number, eyeY = 9, pitchDeg = -3.5): { img: Image; stats: Record<string, number> } {
  const cascades = makeCascades([512, 64, 8], 128, 424242, DEFAULT_OCEAN);
  const layers = cascades.map(c => evaluateCascadeCPU(c, time, DEFAULT_OCEAN.choppiness));
  const tiles = [512, 64, 8];
  const img = newImage(w, h, [12, 20, 34]);
  const pitch = pitchDeg * Math.PI / 180;
  const yaw = DEFAULT_OCEAN.windDirection;
  const fov = 55 * Math.PI / 180;
  const tanHalf = Math.tan(fov / 2);
  const sunDir = normalize3([0.62, 0.21, 0.75]);

  const sampler = (c: number) => {
    const L = layers[c];
    const tile = tiles[c];
    return (wx: number, wz: number): number => {
      const u = ((wx / tile) % 1 + 1) % 1 * L.size;
      const v = ((wz / tile) % 1 + 1) % 1 * L.size;
      const x0 = Math.floor(u) % L.size, z0 = Math.floor(v) % L.size;
      const tx = u - Math.floor(u), tz = v - Math.floor(v);
      const x1 = (x0 + 1) % L.size, z1 = (z0 + 1) % L.size;
      const a = L.height[z0 * L.size + x0], b = L.height[z0 * L.size + x1];
      const cc = L.height[z1 * L.size + x0], d = L.height[z1 * L.size + x1];
      return lerp(lerp(a, b, tx), lerp(cc, d, tx), tz);
    };
  };
  const extentFade = (wx: number, wz: number, tile: number) => {
    const ext = tile * 0.5;
    const rel = Math.max(Math.abs(wx), Math.abs(wz));
    return smooth(ext, ext * 0.75, rel);
  };
  const heightAt = (wx: number, wz: number, footprint: number): { h: number; active: number } => {
    let h = 0, active = 0;
    for (let c = 0; c < 3; c++) {
      const texel = tiles[c] / layers[c].size;
      const fade = smooth(1, 3, texel / Math.max(footprint, 1e-4)) * extentFade(wx, wz, tiles[c]);
      if (fade <= 0.002) continue;
      h += sampler(c)(wx, wz) * fade;
      active = c;
    }
    return { h, active };
  };
  const slopeAt = (c: number, wx: number, wz: number): [number, number] => {
    const L = layers[c];
    const tile = tiles[c];
    const e = tile / L.size;
    const hs = sampler(c);
    return [(hs(wx + e, wz) - hs(wx - e, wz)) / (2 * e), (hs(wx, wz + e) - hs(wx, wz - e)) / (2 * e)];
  };

  let hmMin = Infinity, hmMax = -Infinity, foamPixels = 0;
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);

  for (let py = 0; py < h; py++) {
    const ndcY = 1 - (py + 0.5) / h * 2;
    for (let px = 0; px < w; px++) {
      const ndcX = (px + 0.5) / w * 2 - 1;
      // camera space ray, rotated by yaw and pitched down
      const cx = ndcX * tanHalf * (w / h);
      const cy = ndcY * tanHalf;
      const dirCam = [cx, cy + Math.tan(pitch) * 1.0, -1];
      const dir = normalize3([
        dirCam[0] * cosYaw + dirCam[2] * sinYaw,
        dirCam[1],
        -dirCam[0] * sinYaw + dirCam[2] * cosYaw,
      ]);

      // Ray-march the displaced height field: this is the whole point — geometry, not a texture.
      let t = 0.05, hit = false, height = 0, footprint = 0;
      for (let step = 0; step < 320; step++) {
        const footprintNow = (t * 2 * tanHalf) / h;
        const wx = dir[0] * t, wz = dir[2] * t;
        const surf = heightAt(wx, wz, footprintNow);
        const rayY = eyeY + dir[1] * t;
        const diff = rayY - surf.h;
        if (diff < 0.012 * Math.max(t, 1)) {
          hit = true;
          height = surf.h;
          footprint = footprintNow;
          break;
        }
        // step proportional to how far above the surface we are, clamped for grazing rays
        t += Math.max(footprintNow * 1.1, diff * 0.45, 0.02);
        if (t > 12000) break;
      }

      if (!hit) {
        // above the horizon or beyond the far plane: sky
        const up = Math.pow(clamp(dir[1], 0, 1), 0.62);
        const sky = [lerp(0.46, 0.030, up), lerp(0.56, 0.085, up), lerp(0.71, 0.235, up)];
        put(img, px, py, [toByte(gamma(sky[0] * 1.05)), toByte(gamma(sky[1] * 1.05)), toByte(gamma(sky[2] * 1.05))]);
        continue;
      }

      const wx = dir[0] * t, wz = dir[2] * t;
      hmMin = Math.min(hmMin, height);
      hmMax = Math.max(hmMax, height);

      // Normal from the dominant cascade plus the finest visible one.
      let nX = 0, nZ = 0;
      for (let c = 0; c < 3; c++) {
        const texel = tiles[c] / layers[c].size;
        const fade = smooth(1, 3, texel / Math.max(footprint, 1e-4));
        if (fade <= 0.002) continue;
        const [sx, sz] = slopeAt(c, wx, wz);
        nX += sx * fade;
        nZ += sz * fade;
      }
      const normal = normalize3([-nX * 3.1, 1, -nZ * 3.1]);
      const view = normalize3([-dir[0], -dir[1], -dir[2]]);
      const ndv = clamp(-(view[0] * normal[0] + view[1] * normal[1] + view[2] * normal[2]), 0, 1);
      const fres = 0.02 + 0.98 * Math.pow(1 - ndv, 5);
      const ndl = Math.max(normal[0] * sunDir[0] + normal[1] * sunDir[1] + normal[2] * sunDir[2], 0);

      // Sky reflection
      const d2 = -(view[0] * normal[0] + view[1] * normal[1] + view[2] * normal[2]) * 2;
      const refl = normalize3([view[0] + d2 * normal[0], view[1] + d2 * normal[1], view[2] + d2 * normal[2]]);
      const upR = Math.pow(clamp(refl[1], 0, 1), 0.62);
      let reflCol: [number, number, number] = [lerp(0.46, 0.030, upR), lerp(0.56, 0.085, upR), lerp(0.71, 0.235, upR)];
      const dim = lerp(0.62, 0.95, smooth(0, 0.35, ndv));
      reflCol = [reflCol[0] * dim, reflCol[1] * dim, reflCol[2] * dim];

      // Sun glitter: tight lobe along the reflected sun direction
      const rl = normalize3([sunDir[0] - 2 * sunDir[1] * 0, sunDir[1], sunDir[2]]);
      const align = Math.max(0, refl[0] * rl[0] + refl[1] * rl[1] + refl[2] * rl[2]);
      const glint = Math.pow(align, 520) * 9 + Math.pow(align, 48) * 0.10;

      // Body colour: crests facing the sun thin out and glow (subsurface), troughs darken.
      const crest = clamp(height / 1.4, -1, 1);
      // Deep scatter is dark teal; crests pick up transmitted light (subsurface scattering).
      const body = [
        0.004 + Math.max(crest, 0) * 0.030,
        0.032 + Math.max(crest, 0) * 0.115,
        0.062 + Math.max(crest, 0) * 0.090,
      ];
      const shade = 0.55 + 0.45 * ndl;
      const ff = Math.min(fres, 0.86);
      let col = [
        lerp(body[0], reflCol[0], ff) + glint,
        lerp(body[1], reflCol[1], ff) + glint * 0.97,
        lerp(body[2], reflCol[2], ff) + glint * 0.92,
      ];
      col = [col[0] * shade, col[1] * shade, col[2] * shade];

      // Foam from the Jacobian.
      const L0 = layers[0];
      const jx = Math.floor(((wx / tiles[0]) % 1 + 1) % 1 * L0.size);
      const jz = Math.floor(((wz / tiles[0]) % 1 + 1) % 1 * L0.size);
      const jac = L0.jacobian[jz * L0.size + jx];
      const foam = smooth(0.62, 0.05, jac);
      if (foam > 0.05) {
        foamPixels++;
        const f = foam * 0.9;
        col = [lerp(col[0], 0.86, f), lerp(col[1], 0.90, f), lerp(col[2], 0.94, f)];
      }

      // Aerial perspective
      const haze = 1 - Math.exp(-t * 0.00022);
      col = [lerp(col[0], 0.36, haze), lerp(col[1], 0.46, haze), lerp(col[2], 0.60, haze)];

      put(img, px, py, [toByte(gamma(col[0])), toByte(gamma(col[1])), toByte(gamma(col[2]))]);
    }
  }

  const title = 'SPECTRAL OCEAN - SURFACE RAY-MARCHED FROM THE FFT HEIGHT FIELD';
  const hs = Math.sqrt(cascades.reduce((a, c) => a + (c.targetHs / 4) ** 2, 0)) * 4;
  const sub = `T=${time.toFixed(1)}S   HS ${hs.toFixed(2)}M   CASCADES 512/64/8M   CAM ${eyeY}M AT ${Math.abs(pitchDeg)}DEG   CPU REFERENCE RENDER, NOT A GPU CAPTURE`;
  rect(img, 8, 8, 12 + Math.max(textWidth(title), textWidth(sub)), 40, [8, 12, 18], 0.82);
  text(img, 12, 11, title, [222, 236, 250]);
  text(img, 12, 24, sub, [140, 168, 196]);
  return { img, stats: { heightMin: hmMin, heightMax: hmMax, foamFraction: foamPixels / (w * h), hs } };
}

function normalize3(v: number[]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------------------------------------------------------------------------
// 2. Water column slice — proves the surface is a height field
// ---------------------------------------------------------------------------
function renderSlice(w: number, h: number, time: number): Image {
  const cascades = makeCascades([512, 64, 8], 256, 424242, DEFAULT_OCEAN);
  const layers = cascades.map(c => evaluateCascadeCPU(c, time, DEFAULT_OCEAN.choppiness));
  const img = newImage(w, h, [10, 14, 22]);
  const L = layers[0];
  const n = L.size;
  const profile: number[] = [];
  for (let x = 0; x < w; x++) {
    // slice along one tile row, 512 m across
    const u = (x / w) * n;
    const x0 = Math.floor(u) % n, tx = u - Math.floor(u);
    const at = (arr: Float32Array) => lerp(arr[64 * n + x0], arr[64 * n + (x0 + 1) % n], tx);
    let height = at(L.height);
    // add the two chop cascades so the profile shows the full sea state
    for (let c = 1; c < 3; c++) {
      const Lc = layers[c];
      const uu = ((x / w) * 8) % 1 * Lc.size;
      const xx = Math.floor(uu) % Lc.size;
      height += lerp(Lc.height[64 * Lc.size + xx], Lc.height[64 * Lc.size + (xx + 1) % Lc.size], uu - Math.floor(uu)) * 0.6;
    }
    profile.push(height);
  }
  const maxAbs = Math.max(...profile.map(Math.abs), 0.5);
  const scale = (h * 0.30) / maxAbs; // vertical exaggeration
  const mid = Math.round(h * 0.45);
  // water body
  for (let x = 0; x < w; x++) {
    const top = mid - profile[x] * scale;
    const bottom = h - 46;
    for (let y = Math.round(top); y < bottom; y++) {
      const depth = (y - top) / Math.max(1, bottom - top);
      const c: [number, number, number] = [
        Math.round(lerp(40, 6, depth)),
        Math.round(lerp(120, 26, depth)),
        Math.round(lerp(150, 44, depth)),
      ];
      put(img, x, y, c);
    }
    // surface line
    put(img, x, Math.round(top), [190, 230, 250]);
  }
  // waterline
  rect(img, 0, mid, w - 1, mid, [120, 160, 190], 0.35);
  // axis labels
  text(img, 12, h - 34, `WATER COLUMN SLICE - 512 M ACROSS - VERTICAL EXAGGERATION ${(scale).toFixed(1)}X`, [205, 225, 245]);
  text(img, 12, h - 20, `PEAK-TO-TROUGH ${(2 * maxAbs).toFixed(2)} M   HS ${(Math.sqrt(cascades.reduce((a, c) => a + (c.targetHs / 4) ** 2, 0)) * 4).toFixed(2)} M   T=${time.toFixed(1)}S`, [150, 175, 200]);
  text(img, 12, 12, 'ZERO MEAN SURFACE', [120, 150, 175]);
  return img;
}

// ---------------------------------------------------------------------------
// 3. World map from the SDF field
// ---------------------------------------------------------------------------
function renderWorldMap(w: number, h: number): { img: Image; stats: Record<string, number> } {
  const field = new WorldField({ ...DEFAULT_WORLD, gridSize: 512 }, [MERIDIAN, VESPER, THULE, AUSTRAL], [...ARCHIPELAGO, ...GULFS]);
  const bake = bakeHeightmap(field, 512);
  const img = newImage(w, h, [8, 12, 20]);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor((y / h) * bake.size);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x / w) * bake.size);
      const i = sy * bake.size + sx;
      const hh = bake.heights[i];
      const hx = bake.heights[sy * bake.size + Math.min(bake.size - 1, sx + 1)];
      const hz = bake.heights[Math.min(bake.size - 1, sy + 1) * bake.size + sx];
      const shade = clamp(1 + ((hh - hx) + (hh - hz)) * 0.0016, 0.55, 1.45);
      const [r, g, b] = mapColor(hh);
      let rn = (r / 255) * shade, gn = (g / 255) * shade, bn = (b / 255) * shade;
      // Wet-sand band: a few kilometres either side of the waterline, blended instead of a hard cut.
      const band = 1 - smooth(0, 90, Math.abs(hh));
      if (band > 0) {
        rn = lerp(rn, 0.80, band * 0.45);
        gn = lerp(gn, 0.74, band * 0.45);
        bn = lerp(bn, 0.58, band * 0.45);
      }
      put(img, x, y, [toByte(rn), toByte(gn), toByte(bn)]);
    }
  }
  // coastline stroke
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x / w) * bake.size), sy = Math.floor((y / h) * bake.size);
      const c = bake.heights[sy * bake.size + sx];
      const cx = bake.heights[sy * bake.size + Math.min(bake.size - 1, sx + 1)];
      if ((c > 0) !== (cx > 0)) put(img, x, y, [246, 242, 226], 0.5);
    }
  }
  return { img, stats: { landFraction: bake.landFraction, min: bake.min, max: bake.max } };
}

function mapColor(h: number): [number, number, number] {
  const l = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
  if (h < 0) {
    const d = -h;
    let c = l([61, 158, 168], [26, 71, 122], smooth(0, 300, d));
    c = l(c, [8, 23, 56], smooth(200, 4200, d));
    return [c[0], c[1], c[2]];
  }
  let c = l([204, 189, 133], [92, 125, 69], smooth(0, 40, h));
  c = l(c, [133, 133, 82], smooth(600, 1600, h));
  c = l(c, [143, 128, 112], smooth(2200, 3200, h));
  c = l(c, [240, 242, 250], smooth(4200, 4800, h));
  return [c[0], c[1], c[2]];
}

// ---------------------------------------------------------------------------
// 4. LOD decision chart — the adaptivity evidence
// ---------------------------------------------------------------------------
function renderLodChart(w: number, h: number): Image {
  const img = newImage(w, h, [11, 15, 22]);
  const P: LODParams = {
    fovY: 55 * Math.PI / 180, viewportHeight: 1080,
    simRadius: 900, flatDistance: 25000, horizonDistance: 60000, pixelErrorBudget: 4,
  };
  const altitudes = [2, 20, 200, 2000, 20000];
  text(img, 18, 14, 'WATER LOD RESOLVER', [232, 240, 250], 2);
  text(img, 18, 36, 'WHAT THE RESOLVER DECIDES, PER CAMERA ALTITUDE', [130, 150, 172]);
  text(img, 18, 50, 'RING SPACING DOUBLES OUTWARD. THE BASE SPACING IS SET BY HOW MANY PIXELS THE SHORTEST WAVE', [126, 146, 168]);
  text(img, 18, 62, 'SPANS AT THAT CAMERA HEIGHT: 2 M AT EYE LEVEL, 32 M FROM 20 KM. COARSE RINGS REPLACE FINE ONES.', [126, 146, 168]);

  // five stacked panels, each showing ring spacing vs distance as a staircase
  const panelH = Math.floor((h - 96) / altitudes.length);
  const x0 = 150, x1 = w - 250;
  const xOf = (m: number) => x0 + (Math.log10(Math.max(m, 1)) / Math.log10(52000)) * (x1 - x0);
  const colours: [number, number, number][] = [[120, 200, 255], [95, 165, 225], [80, 140, 196], [66, 116, 165], [150, 210, 240]];

  altitudes.forEach((alt, ai) => {
    const top = 84 + ai * panelH;
    const bottom = top + panelH - 16;
    const plan = resolveWaterLod(alt, P);
    const yOf = (sp: number) => bottom - (Math.log2(sp) / 10) * (bottom - top - 10);
    // panel frame + axis ticks
    rect(img, x0, bottom, x1, bottom, [40, 50, 64]);
    rect(img, x0, top, x0, bottom, [40, 50, 64]);
    for (let sp = 8; sp <= 1024; sp *= 2) {
      rect(img, x0 - 5, Math.round(yOf(sp)), x0, Math.round(yOf(sp)), [46, 58, 74]);
      text(img, x0 - 50, Math.round(yOf(sp)) - 3, sp >= 1024 ? '1KM' : `${sp}M`, [110, 128, 148]);
    }
    // ring staircase
    let prev: [number, number] | null = null;
    for (const r of plan.rings) {
      const pt: [number, number] = [xOf(Math.max(r.outer, 2)), yOf(r.spacing)];
      if (prev) {
        const steps = Math.max(Math.abs(pt[0] - prev[0]), Math.abs(pt[1] - prev[1]), 1);
        for (let s2 = 0; s2 <= steps; s2++) {
          const tt = s2 / steps;
          const xx = Math.round(lerp(prev[0], pt[0], tt));
          const yy = Math.round(lerp(prev[1], pt[1], tt));
          rect(img, xx, yy - 1, xx + 1, yy + 1, colours[ai]);
        }
      }
      prev = pt;
    }
    // regime boundary markers
    for (const [d, label] of [[P.simRadius, 'SIM'], [P.flatDistance, 'MESH']] as [number, string][]) {
      for (let yy = top; yy < bottom; yy += 4) put(img, xOf(d), yy, [70, 84, 104]);
      text(img, xOf(d) + 3, top + 2, label, [92, 108, 128]);
    }
    const name = alt >= 1000 ? `${alt / 1000} KM` : `${alt} M`;
    text(img, 20, top + 2, name, colours[ai]);
    text(img, 20, top + 14, `BASE ${plan.baseSpacing} M`, [110, 128, 148]);
    text(img, x1 + 12, top + 6, `${plan.rings.length} RINGS  ${(plan.tris / 1000).toFixed(0)}K TRIS  MAX ${plan.maxErrorPx.toFixed(0)} PX`, colours[ai]);
  });
  text(img, x0, h - 12, 'DISTANCE FROM CAMERA (LOG SCALE)', [150, 172, 194]);
  text(img, 20, h - 12, 'SPACING', [150, 172, 194]);
  return img;
}

/** Tessellation density view: draw every ring's quads in perspective so the density change is
 *  the subject rather than a wireframe sketch. */
function renderRingDensity(w: number, h: number, altitude: number, pitchDeg: number): Image {
  const img = newImage(w, h, [9, 14, 22]);
  const P: LODParams = {
    fovY: 55 * Math.PI / 180, viewportHeight: 1080,
    simRadius: 900, flatDistance: 25000, horizonDistance: 60000, pixelErrorBudget: 4,
  };
  const plan = resolveWaterLod(altitude, P);
  const horizonY = Math.round(h * 0.34);
  const fov = P.fovY, tanHalf = Math.tan(fov / 2);
  const camH = Math.max(altitude, 2);
  const pitch = pitchDeg * Math.PI / 180;

  // background: sky + fogged water gradient
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < horizonY) {
        const t = y / horizonY;
        put(img, x, y, [Math.round(lerp(120, 176, t)), Math.round(lerp(142, 196, t)), Math.round(lerp(172, 222, t))]);
      } else {
        const t = (y - horizonY) / (h - horizonY);
        put(img, x, y, [Math.round(lerp(96, 14, Math.pow(t, 0.55))), Math.round(lerp(118, 30, Math.pow(t, 0.55))), Math.round(lerp(140, 46, Math.pow(t, 0.55)))]);
      }
    }
  }
  // project world XZ (relative to camera) to screen, camera pitched down by `pitch`
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const project = (wx: number, wz: number): [number, number, number] | null => {
    // camera space: z forward along +X world (arbitrary), y up
    const cz = wz;
    const cy = camH;
    if (cz <= 1) return null;
    // rotate the point into camera orientation (pitch only)
    const yCam = cy * cosP - cz * sinP;
    const zCam = cy * sinP + cz * cosP;
    if (zCam <= 1) return null;
    const sx = w / 2 + (wx / (zCam * tanHalf * (w / h))) * (w / 2);
    const sy = h * 0.5 - (yCam / (zCam * tanHalf)) * (h / 2);
    return [sx, sy, zCam];
  };
  const colours: Record<string, [number, number, number]> = {
    simulated: [150, 220, 255], displaced: [110, 175, 235], flat: [86, 132, 186], horizon: [60, 92, 130],
  };
  const drawn = plan.rings.slice(0, 10);
  // draw coarse rings first so the fine lines sit on top
  for (const ring of [...drawn].reverse()) {
    const col = colours[ring.regime] ?? [90, 130, 170];
    const quads = Math.min(ring.verts, 32);
    const half = ring.outer;
    const stepW = (2 * half) / quads;
    // only within the visible forward band, to keep the picture readable
    const zMin = Math.max(ring.inner, 2);
    const zMax = Math.min(ring.outer, 30000);
    if (zMax <= zMin) continue;
    const zSteps = Math.max(2, Math.min(48, Math.round((zMax - zMin) / Math.max(ring.spacing * 4, 1))));
    // longitudinal lines
    for (let i = -quads / 2; i <= quads / 2; i++) {
      const wx = i * stepW;
      let prev: [number, number] | null = null;
      for (let s2 = 0; s2 <= zSteps; s2++) {
        const wz = lerp(zMin, zMax, s2 / zSteps);
        const p = project(wx, wz);
        if (p && prev) {
          const steps = Math.max(Math.abs(p[0] - prev[0]), Math.abs(p[1] - prev[1]), 1);
          for (let t = 0; t <= steps; t++) {
            put(img, Math.round(lerp(prev[0], p[0], t / steps)), Math.round(lerp(prev[1], p[1], t / steps)), col, 0.5);
          }
        }
        prev = p ? [p[0], p[1]] : null;
      }
    }
    // transverse lines
    const rows = Math.max(2, Math.min(60, Math.round((zMax - zMin) / ring.spacing)));
    for (let r = 0; r <= rows; r++) {
      const wz = lerp(zMin, zMax, r / rows);
      let prev: [number, number] | null = null;
      for (let i = -quads / 2; i <= quads / 2; i++) {
        const p = project(i * stepW, wz);
        if (p && prev) {
          const steps = Math.max(Math.abs(p[0] - prev[0]), Math.abs(p[1] - prev[1]), 1);
          for (let t = 0; t <= steps; t++) {
            put(img, Math.round(lerp(prev[0], p[0], t / steps)), Math.round(lerp(prev[1], p[1], t / steps)), col, 0.42);
          }
        }
        prev = p ? [p[0], p[1]] : null;
      }
    }
    // ring boundary
    const pEdge = project(-half, Math.min(zMax, half));
    if (pEdge) {
      for (let i = -quads / 2; i <= quads / 2; i++) {
        const p = project(i * stepW, Math.min(zMax, half));
        if (p) put(img, Math.round(p[0]), Math.round(p[1]), col, 0.95);
      }
    }
  }
  const title = 'ADAPTIVE WATER TESSELLATION';
  rect(img, 10, 8, 10 + textWidth(title) * 2 + 10, 30, [8, 12, 18], 0.85);
  text(img, 14, 13, title, [232, 242, 252], 2);
  text(img, 14, 38, `CAMERA ${altitude} M AT ${Math.abs(pitchDeg)} DEG - ${plan.rings.length} RINGS - ${(plan.tris / 1000).toFixed(0)}K TRIS`, [140, 168, 196]);
  let ly = h - 14 - drawn.length * 11;
  for (const r of drawn) {
    text(img, 14, ly, `RING ${String(r.index).padStart(2)}  ${String(r.spacing).padStart(5)} M QUADS  ${r.regime.toUpperCase().padEnd(10)} ${r.errorPx.toFixed(0)} PX ERROR`, colours[r.regime], 1);
    ly += 11;
  }
  return img;
}

// ---------------------------------------------------------------------------
// 5. Adaptive wireframe: rings drawn over a horizon view
// ---------------------------------------------------------------------------
function renderRingView(w: number, h: number, altitude: number): Image {
  const img = newImage(w, h, [10, 16, 26]);
  const P: LODParams = {
    fovY: 55 * Math.PI / 180, viewportHeight: 1080,
    simRadius: 900, flatDistance: 25000, horizonDistance: 60000, pixelErrorBudget: 4,
  };
  const plan = resolveWaterLod(altitude, P);
  const horizonY = Math.round(h * 0.42);
  // sky + haze
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / h;
      if (y < horizonY) {
        put(img, x, y, [toByte(lerp(0.30, 0.62, t / (horizonY / h))), toByte(lerp(0.42, 0.72, t / (horizonY / h))), toByte(lerp(0.58, 0.86, t / (horizonY / h)))]);
      } else {
        const d = (y - horizonY) / (h - horizonY);
        put(img, x, y, [toByte(lerp(0.42, 0.05, Math.pow(d, 0.6))), toByte(lerp(0.50, 0.16, Math.pow(d, 0.6))), toByte(lerp(0.60, 0.24, Math.pow(d, 0.6)))]);
      }
    }
  }
  // draw rings as concentric squares in perspective (y = 0 plane, camera at altitude)
  const colours: Record<string, [number, number, number]> = {
    simulated: [120, 200, 255], displaced: [90, 150, 210], flat: [70, 110, 160], horizon: [50, 80, 118],
  };
  const camH = Math.max(altitude, 2);
  const tanHalf = Math.tan(P.fovY / 2);
  const project = (wx: number, wz: number): [number, number] => {
    const depth = wz;
    if (depth <= 1) return [-1, -1];
    const sx = w / 2 + (wx / (depth * tanHalf * (w / h))) * (w / 2);
    const sy = horizonY + ((camH / depth) / tanHalf) * (h / 2);
    return [sx, sy];
  };
  for (const ring of plan.rings) {
    const col = colours[ring.regime] ?? [80, 120, 160];
    const step = ring.outer / 12;
    for (let i = -12; i <= 12; i++) {
      const c = i * step;
      // lines parallel to view direction
      for (const side of [-1, 1]) {
        let prev: [number, number] | null = null;
        for (let s = 0; s <= 24; s++) {
          const z = ring.inner + (ring.outer - ring.inner) * (s / 24);
          if (z < 4) continue;
          const p = project(c, z);
          if (prev && p[0] >= 0) {
            const steps = Math.max(Math.abs(p[0] - prev[0]), Math.abs(p[1] - prev[1]), 1);
            for (let t = 0; t <= steps; t++) {
              put(img, Math.round(lerp(prev[0], p[0], t / steps)), Math.round(lerp(prev[1], p[1], t / steps)), col, 0.30);
            }
          }
          prev = p[0] >= 0 ? p : null;
        }
        void side;
      }
    }
    // near edge of the ring
    let prev: [number, number] | null = null;
    for (let i = -12; i <= 12; i++) {
      const p = project(i * step, Math.max(ring.inner, 6));
      if (prev && p[0] >= 0) {
        const steps = Math.max(Math.abs(p[0] - prev[0]), Math.abs(p[1] - prev[1]), 1);
        for (let t = 0; t <= steps; t++) put(img, Math.round(lerp(prev[0], p[0], t / steps)), Math.round(lerp(prev[1], p[1], t / steps)), col, 0.95);
      }
      prev = p;
    }
  }
  text(img, 14, 12, `ADAPTIVE WATER LOD - CAMERA ${altitude} M - ${plan.rings.length} RINGS - ${(plan.tris / 1000).toFixed(0)}K TRIS`, [225, 235, 248]);
  text(img, 14, 26, plan.reason.toUpperCase(), [140, 165, 190]);
  let ly = 52;
  text(img, 14, ly, 'RING   SPACING   REGIME            ERROR', [140, 160, 182]);
  ly += 13;
  for (const r of plan.rings.slice(0, 8)) {
    text(img, 14, ly, `${String(r.index).padStart(4)} ${String(r.spacing).padStart(8)}M   ${r.regime.toUpperCase().padEnd(16)} ${r.errorPx.toFixed(1)}PX`, colours[r.regime]);
    ly += 12;
  }
  text(img, 14, h - 20, 'RING EDGES DRAW THE TESSELLATION STEP; SPACING GROWS WITH DISTANCE TO HOLD ERROR NEAR THE BUDGET', [120, 140, 160], 1);
  return img;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const t0 = Date.now();
console.log('rendering ocean hero view (35 m, 1024x576)…');
const ocean = renderOceanView(1024, 576, 21.7, 35, -14);
writePng(`${OUT}/ocean-surface.png`, ocean.img);

console.log('rendering ocean close view (10 m, low grazing angle)…');
writePng(`${OUT}/ocean-surface-low.png`, renderOceanView(1024, 576, 21.7, 10, -7).img);

console.log('rendering water column slice…');
const slice = renderSlice(1024, 384, 21.7);
writePng(`${OUT}/water-column.png`, slice);

console.log('rendering world map (1024² bake -> 1024 png)…');
const map = renderWorldMap(1024, 1024);
writePng(`${OUT}/world-map.png`, map.img);

console.log('rendering LOD chart…');
writePng(`${OUT}/lod-resolver.png`, renderLodChart(1100, 620));

console.log('rendering tessellation density at 200 m…');
writePng(`${OUT}/lod-rings-200m.png`, renderRingDensity(1280, 720, 200, 22));
console.log('rendering tessellation density at 4 km…');
writePng(`${OUT}/lod-rings-4km.png`, renderRingDensity(1280, 720, 4000, 38));

console.log(JSON.stringify({
  oceanHeights: { min: ocean.stats.heightMin, max: ocean.stats.heightMax },
  hs: ocean.stats.hs,
  foamFraction: ocean.stats.foamFraction,
  landFraction: map.stats.landFraction,
  elapsedMs: Date.now() - t0,
}, null, 2));
