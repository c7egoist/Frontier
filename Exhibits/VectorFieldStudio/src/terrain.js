/*====================================================================================================================================
                                                        TERRAIN.JS
====================================================================================================================================*/
// 🧩 Procedural heightfield, flow accumulation, vegetation density, and render mesh construction.

import { clamp, lerp, smoothstep, mulberry32 } from './math.js';

const TERRAIN_RESOLUTION = 256;

function hash2(x, y, seed) {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function fade(t) {
    return t * t * (3 - 2 * t);
}

function valueNoise2(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const n00 = hash2(xi, yi, seed);
    const n10 = hash2(xi + 1, yi, seed);
    const n01 = hash2(xi, yi + 1, seed);
    const n11 = hash2(xi + 1, yi + 1, seed);
    const nx0 = n00 + (n10 - n00) * xf;
    const nx1 = n01 + (n11 - n01) * xf;
    return nx0 + (nx1 - nx0) * yf;
}

function fbm2(x, y, seed, octaves) {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
        sum += valueNoise2(x * frequency, y * frequency, seed + i * 131) * amplitude;
        norm += amplitude;
        amplitude *= 0.5;
        frequency *= 2.03;
    }
    return sum / norm;
}

function paletteColor(height, slope, vegetation, seaLevel) {
    const sand = [0.62, 0.56, 0.42];
    const grass = [0.32, 0.42, 0.26];
    const forest = [0.22, 0.34, 0.20];
    const rock = [0.36, 0.35, 0.31];
    const snow = [0.78, 0.79, 0.75];
    let color;
    if (height < seaLevel + 0.015) {
        color = sand;
    } else if (height < 0.42) {
        color = [
            lerp(sand[0], grass[0], smoothstep(seaLevel, 0.42, height)),
            lerp(sand[1], grass[1], smoothstep(seaLevel, 0.42, height)),
            lerp(sand[2], grass[2], smoothstep(seaLevel, 0.42, height)),
        ];
    } else if (height < 0.72) {
        color = [
            lerp(grass[0], rock[0], smoothstep(0.42, 0.72, height)),
            lerp(grass[1], rock[1], smoothstep(0.42, 0.72, height)),
            lerp(grass[2], rock[2], smoothstep(0.42, 0.72, height)),
        ];
    } else {
        color = [
            lerp(rock[0], snow[0], smoothstep(0.72, 0.95, height)),
            lerp(rock[1], snow[1], smoothstep(0.72, 0.95, height)),
            lerp(rock[2], snow[2], smoothstep(0.72, 0.95, height)),
        ];
    }
    const vegetationMix = clamp(vegetation * 0.55, 0, 0.55);
    color = [
        lerp(color[0], forest[0], vegetationMix),
        lerp(color[1], forest[1], vegetationMix),
        lerp(color[2], forest[2], vegetationMix),
    ];
    const rockMix = smoothstep(0.35, 0.85, slope) * 0.65;
    color = [lerp(color[0], rock[0], rockMix), lerp(color[1], rock[1], rockMix), lerp(color[2], rock[2], rockMix)];
    return color;
}

/**
 * Generate the complete terrain field. The returned RGBA8 texture packs height, flow accumulation,
 * vegetation density, and moisture so the GPU can shade the surface and evaluate the same field.
 */
export function generateTerrain(params) {
    const resolution = TERRAIN_RESOLUTION;
    const size = params.size;
    const maxHeight = params.maxHeight;
    const seed = params.seed | 0;
    const octaves = clamp(params.octaves | 0, 1, 8);
    const frequency = params.frequency;
    const ridge = clamp(params.ridge, 0, 1);
    const seaLevel = clamp(params.seaLevel, 0, 0.6);

    const rawHeights = new Float32Array(resolution * resolution);
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < resolution; j++) {
        const v = j / (resolution - 1);
        for (let i = 0; i < resolution; i++) {
            const u = i / (resolution - 1);
            const warpX = u + 0.12 * (valueNoise2(u * 3.1 + 4.7, v * 3.1 + 1.3, seed + 17) - 0.5);
            const warpZ = v + 0.12 * (valueNoise2(u * 3.1 + 9.2, v * 3.1 + 7.4, seed + 29) - 0.5);
            let h = 0;
            let amplitude = 1;
            let norm = 0;
            let freq = frequency;
            for (let octave = 0; octave < octaves; octave++) {
                let n = valueNoise2(warpX * freq, warpZ * freq, seed + octave * 131);
                n = 1 - Math.abs(n * 2 - 1);
                n = lerp(n, n * n, ridge);
                h += n * amplitude;
                norm += amplitude;
                amplitude *= 0.5;
                freq *= 2.03;
            }
            h /= norm;
            const riverCenter = 0.5 + 0.16 * Math.sin(u * 6.2 + seed * 0.07);
            const river = Math.abs(v - riverCenter);
            h -= 0.42 * Math.exp(-Math.pow(river / 0.075, 2));
            h += 0.18 * smoothstep(0.55, 0.95, u) * valueNoise2(u * 4.0, v * 4.0, seed + 71);
            rawHeights[j * resolution + i] = h;
            if (h < min) min = h;
            if (h > max) max = h;
        }
    }

    const heights = new Float32Array(resolution * resolution);
    for (let i = 0; i < rawHeights.length; i++) {
        const normalized = (rawHeights[i] - min) / (max - min || 1);
        heights[i] = Math.pow(clamp(normalized, 0, 1), 1.12);
    }

    const flow = new Float32Array(resolution * resolution).fill(1);
    const order = new Uint32Array(resolution * resolution);
    for (let i = 0; i < order.length; i++) order[i] = i;
    const orderArray = Array.from(order);
    orderArray.sort((a, b) => heights[b] - heights[a]);
    const neighborOffsets = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];
    for (let index = 0; index < orderArray.length; index++) {
        const cell = orderArray[index];
        const cx = cell % resolution;
        const cz = Math.floor(cell / resolution);
        const h = heights[cell];
        let lowest = -1;
        let lowestHeight = h;
        for (let n = 0; n < neighborOffsets.length; n++) {
            const nx = cx + neighborOffsets[n][0];
            const nz = cz + neighborOffsets[n][1];
            if (nx < 0 || nx >= resolution || nz < 0 || nz >= resolution) continue;
            const ni = nz * resolution + nx;
            if (heights[ni] < lowestHeight) {
                lowestHeight = heights[ni];
                lowest = ni;
            }
        }
        if (lowest >= 0) flow[lowest] += flow[cell];
    }
    let maxFlow = 1;
    for (let i = 0; i < flow.length; i++) if (flow[i] > maxFlow) maxFlow = flow[i];
    const flowNorm = new Float32Array(flow.length);
    const logMax = Math.log1p(maxFlow);
    for (let i = 0; i < flow.length; i++) flowNorm[i] = Math.log1p(flow[i]) / logMax;

    const data = new Uint8Array(resolution * resolution * 4);
    const vegetation = new Float32Array(resolution * resolution);
    const moisture = new Float32Array(resolution * resolution);
    const slopeMap = new Float32Array(resolution * resolution);
    const cellSize = size / (resolution - 1);
    for (let j = 0; j < resolution; j++) {
        for (let i = 0; i < resolution; i++) {
            const index = j * resolution + i;
            const hL = heights[j * resolution + Math.max(0, i - 1)];
            const hR = heights[j * resolution + Math.min(resolution - 1, i + 1)];
            const hU = heights[Math.max(0, j - 1) * resolution + i];
            const hD = heights[Math.min(resolution - 1, j + 1) * resolution + i];
            const dx = (hR - hL) * maxHeight / (2 * cellSize);
            const dz = (hD - hU) * maxHeight / (2 * cellSize);
            const slope = Math.hypot(dx, dz);
            slopeMap[index] = slope;
            const u = i / (resolution - 1);
            const v = j / (resolution - 1);
            const variation = valueNoise2(u * 14.0, v * 14.0, seed + 211);
            const moistureValue = clamp(flowNorm[index] * 0.9 + variation * 0.22 - slope * 0.22, 0, 1);
            const altitudeFade = smoothstep(seaLevel + 0.015, seaLevel + 0.12, heights[index]) * (1 - smoothstep(0.78, 0.96, heights[index]));
            const vegetationValue = clamp(
                smoothstep(0.28, 0.72, moistureValue) * (1 - smoothstep(0.35, 0.9, slope)) * (0.55 + 0.45 * variation) * altitudeFade,
                0,
                1,
            );
            vegetation[index] = vegetationValue;
            moisture[index] = moistureValue;
            const offset = index * 4;
            data[offset] = Math.round(clamp(heights[index], 0, 1) * 255);
            data[offset + 1] = Math.round(clamp(flowNorm[index], 0, 1) * 255);
            data[offset + 2] = Math.round(clamp(vegetationValue, 0, 1) * 255);
            data[offset + 3] = Math.round(clamp(moistureValue, 0, 1) * 255);
        }
    }

    const meshPositions = new Float32Array(resolution * resolution * 3);
    const meshNormals = new Float32Array(resolution * resolution * 3);
    const meshColors = new Float32Array(resolution * resolution * 3);
    for (let j = 0; j < resolution; j++) {
        for (let i = 0; i < resolution; i++) {
            const index = j * resolution + i;
            const x = (i / (resolution - 1) - 0.5) * size;
            const z = (j / (resolution - 1) - 0.5) * size;
            const y = heights[index] * maxHeight;
            meshPositions[index * 3] = x;
            meshPositions[index * 3 + 1] = y;
            meshPositions[index * 3 + 2] = z;
            const hL = heights[j * resolution + Math.max(0, i - 1)];
            const hR = heights[j * resolution + Math.min(resolution - 1, i + 1)];
            const hU = heights[Math.max(0, j - 1) * resolution + i];
            const hD = heights[Math.min(resolution - 1, j + 1) * resolution + i];
            const dx = (hR - hL) * maxHeight / (2 * cellSize);
            const dz = (hD - hU) * maxHeight / (2 * cellSize);
            const normal = [ -dx, 1, -dz ];
            const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
            meshNormals[index * 3] = normal[0] / length;
            meshNormals[index * 3 + 1] = normal[1] / length;
            meshNormals[index * 3 + 2] = normal[2] / length;
            const color = paletteColor(heights[index], slopeMap[index], vegetation[index], seaLevel);
            meshColors[index * 3] = color[0];
            meshColors[index * 3 + 1] = color[1];
            meshColors[index * 3 + 2] = color[2];
        }
    }

    const indices = new Uint32Array((resolution - 1) * (resolution - 1) * 6);
    let cursor = 0;
    for (let j = 0; j < resolution - 1; j++) {
        for (let i = 0; i < resolution - 1; i++) {
            const a = j * resolution + i;
            const b = a + 1;
            const c = a + resolution;
            const d = c + 1;
            indices[cursor++] = a;
            indices[cursor++] = c;
            indices[cursor++] = b;
            indices[cursor++] = b;
            indices[cursor++] = c;
            indices[cursor++] = d;
        }
    }

    const sampleBilinear = (array, x, z, channels = 1, stride = 1) => {
        const fx = clamp((x / size + 0.5) * (resolution - 1), 0, resolution - 1);
        const fz = clamp((z / size + 0.5) * (resolution - 1), 0, resolution - 1);
        const x0 = Math.floor(fx);
        const z0 = Math.floor(fz);
        const x1 = Math.min(x0 + 1, resolution - 1);
        const z1 = Math.min(z0 + 1, resolution - 1);
        const tx = fx - x0;
        const tz = fz - z0;
        const out = [];
        for (let channel = 0; channel < channels; channel++) {
            const at = (xx, zz) => array[(zz * resolution + xx) * stride + channel];
            const c00 = at(x0, z0), c10 = at(x1, z0), c01 = at(x0, z1), c11 = at(x1, z1);
            out.push(lerp(lerp(c00, c10, tx), lerp(c01, c11, tx), tz));
        }
        return out;
    };

    const heightAt = (x, z, outside = 0) => {
        if (Math.abs(x) > size * 0.5 || Math.abs(z) > size * 0.5) return outside;
        return sampleBilinear(heights, x, z)[0] * maxHeight;
    };

    const sampleData = (x, z) => {
        if (Math.abs(x) > size * 0.5 || Math.abs(z) > size * 0.5) return [0, 0, 0, 0];
        return sampleBilinear(data, x, z, 4, 4).map((value) => value / 255);
    };

    return {
        resolution,
        size,
        maxHeight,
        seaLevel,
        waterLevel: seaLevel * maxHeight,
        heights,
        flow: flowNorm,
        vegetation,
        moisture,
        slope: slopeMap,
        data,
        mesh: {
            positions: meshPositions,
            normals: meshNormals,
            colors: meshColors,
            indices,
            vertexCount: resolution * resolution,
            indexCount: indices.length,
        },
        heightAt,
        sampleData,
        sampleBilinear,
    };
}

/**
 * Build a deterministic blade field. Each blade carries its vegetation density so the shader can
 * reveal or hide it from the density control without rebuilding geometry.
 */
export function buildVegetation(terrain, params, count = 30000) {
    const random = mulberry32((params.seed | 0) * 7919 + 17);
    const blades = [];
    const half = terrain.size * 0.5;
    let attempts = 0;
    while (blades.length < count && attempts < count * 8) {
        attempts++;
        const x = (random() * 2 - 1) * half * 0.98;
        const z = (random() * 2 - 1) * half * 0.98;
        const sample = terrain.sampleData(x, z);
        const density = sample[2];
        if (density < 0.08) continue;
        if (random() > density * 1.35) continue;
        const y = terrain.heightAt(x, z) + 0.02;
        blades.push({
            x,
            y,
            z,
            density,
            scale: 0.55 + random() * 0.9,
            phase: random() * Math.PI * 2,
            tint: random(),
        });
    }
    const data = new Float32Array(blades.length * 8);
    for (let i = 0; i < blades.length; i++) {
        const blade = blades[i];
        const offset = i * 8;
        data[offset] = blade.x;
        data[offset + 1] = blade.y;
        data[offset + 2] = blade.z;
        data[offset + 3] = blade.scale;
        data[offset + 4] = blade.phase;
        data[offset + 5] = blade.tint;
        data[offset + 6] = blade.density;
        data[offset + 7] = 0;
    }
    return { blades, data, count: blades.length };
}

export function buildGlyphBases(terrain, boundsY, horizontal = 12, levels = 6) {
    const positions = [];
    const half = terrain.size * 0.42;
    for (let level = 0; level < levels; level++) {
        const y = lerp(terrain.maxHeight + 2, boundsY, levels === 1 ? 0.5 : level / (levels - 1));
        for (let j = 0; j < horizontal; j++) {
            for (let i = 0; i < horizontal; i++) {
                const x = lerp(-half, half, horizontal === 1 ? 0.5 : i / (horizontal - 1));
                const z = lerp(-half, half, horizontal === 1 ? 0.5 : j / (horizontal - 1));
                const ground = terrain.heightAt(x, z, 0);
                if (y < ground + 1.5) continue;
                positions.push(x, y, z);
            }
        }
    }
    return new Float32Array(positions);
}
