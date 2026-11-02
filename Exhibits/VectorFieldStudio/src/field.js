/*====================================================================================================================================
                                                        FIELD.JS
====================================================================================================================================*/
// 🧩 CPU mirror of the GPU vector field, used by probes, streamlines, and field statistics.

import { clamp, lerp, smoothstep, vec3, mulberry32 } from './math.js';
import { curlNoise } from './noise.js';

export const MODE_INDEX = { wind: 0, force: 1, terrain: 2 };
export const FORCE_KIND = { attractor: 0, repulsor: 1, vortex: 2 };

export function windDirection(azimuthDegrees, elevationDegrees) {
    const azimuth = azimuthDegrees * Math.PI / 180;
    const elevation = elevationDegrees * Math.PI / 180;
    return [
        Math.cos(elevation) * Math.cos(azimuth),
        Math.sin(elevation),
        Math.cos(elevation) * Math.sin(azimuth),
    ];
}

export function forceSources(state) {
    return state.layers.force.sources.filter((source) => source.enabled !== false);
}

export function createFieldSampler(state, terrain, noise) {
    const mode = MODE_INDEX[state.mode] ?? 0;
    const wind = state.layers.wind;
    const force = state.layers.force;
    const terrainParams = state.terrain;
    const windDir = windDirection(wind.direction, wind.elevation);
    const boundsY = terrain.maxHeight * 2.6 + 26;
    const sources = forceSources(state).map((source) => ({
        position: source.position,
        strength: source.strength,
        kind: FORCE_KIND[source.kind] ?? 0,
        radius: source.radius,
    }));

    const heightAt = (x, z) => terrain.heightAt(x, z, 0);
    const sampleNoise = (x, y, z) => curlNoise(noise, x, y, z);

    function windAt(p) {
        const ground = heightAt(p[0], p[2]);
        const h = clamp((p[1] - ground) / boundsY, 0, 1);
        const profile = lerp(0.35, 1, smoothstep(0, 0.55, h));
        const v = [windDir[0] * wind.speed * profile, windDir[1] * wind.speed * profile, windDir[2] * wind.speed * profile];
        const scale = wind.curlScale;
        const time = state.time || 0;
        const c = sampleNoise(p[0] * scale, p[1] * scale + time * 0.02, p[2] * scale);
        v[0] += c[0] * wind.turbulence * 6;
        v[1] += c[1] * wind.turbulence * 6;
        v[2] += c[2] * wind.turbulence * 6;
        const e = 1.5;
        const hC = ground;
        const hX = heightAt(p[0] + e, p[2]);
        const hZ = heightAt(p[0], p[2] + e);
        const gx = (hX - hC) / e;
        const gz = (hZ - hC) / e;
        const slope = Math.hypot(gx, gz);
        v[1] += wind.lift * (slope * 8 + 0.4) * smoothstep(0, 12, p[1] - hC);
        v[0] -= gx * wind.terrainCoupling * 10;
        v[2] -= gz * wind.terrainCoupling * 10;
        v[1] += Math.max(0, hC + 1 - p[1]) * 3;
        return v;
    }

    function forceAt(p) {
        const v = [
            force.background[0] * force.strength,
            force.background[1] * force.strength,
            force.background[2] * force.strength,
        ];
        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            const dx = p[0] - source.position[0];
            const dy = p[1] - source.position[1];
            const dz = p[2] - source.position[2];
            const r2 = dx * dx + dy * dy + dz * dz + 0.25;
            const r = Math.sqrt(r2);
            const radius = Math.max(0.5, source.radius);
            let falloff = Math.pow(radius / (r + radius * 0.15), force.falloff);
            falloff *= smoothstep(0, 1, 1 - r / (radius * 4));
            const dir = [dx / r, dy / r, dz / r];
            const strength = source.strength * falloff;
            if (source.kind === 0) {
                v[0] -= dir[0] * strength * 12;
                v[1] -= dir[1] * strength * 12;
                v[2] -= dir[2] * strength * 12;
            } else if (source.kind === 1) {
                v[0] += dir[0] * strength * 12;
                v[1] += dir[1] * strength * 12;
                v[2] += dir[2] * strength * 12;
            } else {
                const tangent = vec3.normalize(vec3.cross(dir, [0, 1, 0]));
                v[0] += tangent[0] * strength * 14 + dir[0] * strength * 2;
                v[1] += tangent[1] * strength * 14 + dir[1] * strength * 2;
                v[2] += tangent[2] * strength * 14 + dir[2] * strength * 2;
            }
        }
        return v;
    }

    function terrainAt(p) {
        const e = 1;
        const hC = heightAt(p[0], p[2]);
        const hX = heightAt(p[0] + e, p[2]);
        const hZ = heightAt(p[0], p[2] + e);
        const gx = (hX - hC) / e;
        const gz = (hZ - hC) / e;
        const v = [-gx * state.layers.terrainFlow.speed * 12, 0, -gz * state.layers.terrainFlow.speed * 12];
        const c = sampleNoise(p[0] * 0.08, p[1] * 0.08 + (state.time || 0) * 0.01, p[2] * 0.08);
        v[0] += c[0] * state.layers.terrainFlow.turbulence * 0.8;
        v[2] += c[2] * state.layers.terrainFlow.turbulence * 0.8;
        return v;
    }

    function potentialAt(p) {
        let potential = 0;
        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            if (source.kind === 2) continue;
            const dx = p[0] - source.position[0];
            const dy = p[1] - source.position[1];
            const dz = p[2] - source.position[2];
            const r = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.25);
            potential += (source.kind === 0 ? -source.strength : source.strength) / r;
        }
        return potential;
    }

    function vectorAt(p) {
        if (mode === 0) return windAt(p);
        if (mode === 1) return forceAt(p);
        return terrainAt(p);
    }

    function sample(p) {
        const vector = vectorAt(p);
        const ground = heightAt(p[0], p[2]);
        const terrainSample = terrain.sampleData(p[0], p[2]);
        return {
            vector,
            magnitude: vec3.length(vector),
            potential: potentialAt(p),
            ground,
            flow: terrainSample[1],
            vegetation: terrainSample[2],
            moisture: terrainSample[3],
        };
    }

    function sampleGround(x, z) {
        const y = heightAt(x, z) + 0.35;
        return sample([x, y, z]);
    }

    function randomPoint(random) {
        const half = terrain.size * 0.5;
        if (mode === 2) {
            const x = (random() * 2 - 1) * half * 0.96;
            const z = (random() * 2 - 1) * half * 0.96;
            return [x, heightAt(x, z) + 0.35, z];
        }
        const x = (random() * 2 - 1) * half * 0.9;
        const z = (random() * 2 - 1) * half * 0.9;
        const ground = heightAt(x, z);
        const y = lerp(ground + 1.5, boundsY, random());
        return [x, y, z];
    }

    function statistics(count = 3200) {
        const random = mulberry32(0x51ed270b);
        const values = new Float32Array(count);
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        for (let i = 0; i < count; i++) {
            const p = randomPoint(random);
            const value = vec3.length(vectorAt(p));
            values[i] = value;
            if (value < min) min = value;
            if (value > max) max = value;
            sum += value;
        }
        const sorted = Array.from(values).sort((a, b) => a - b);
        const percentile = (q) => sorted[clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1)];
        return {
            values: sorted,
            min,
            max,
            mean: sum / count,
            p50: percentile(0.5),
            p95: percentile(0.95),
            count,
        };
    }

    function verticalProfile(samples = 28) {
        const random = mulberry32(0x9a3c1f77);
        const profile = [];
        for (let i = 0; i < samples; i++) {
            const y = lerp(1, boundsY, i / (samples - 1));
            let sum = 0;
            let count = 0;
            for (let k = 0; k < 12; k++) {
                const x = (random() * 2 - 1) * terrain.size * 0.42;
                const z = (random() * 2 - 1) * terrain.size * 0.42;
                const ground = heightAt(x, z);
                if (y < ground + 1) continue;
                sum += vec3.length(vectorAt([x, y, z]));
                count++;
            }
            profile.push({ height: y, speed: count ? sum / count : 0 });
        }
        return profile;
    }

    function streamlineGeometry(count = 48, steps = 110) {
        const random = mulberry32(0x2f6e1b3d);
        const positions = [];
        const colors = [];
        const half = terrain.size * 0.46;
        const seeds = [];
        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            for (let k = 0; k < 10; k++) {
                const theta = random() * Math.PI * 2;
                const phi = Math.acos(random() * 2 - 1);
                const radius = source.radius * (0.35 + random() * 0.5);
                seeds.push([
                    source.position[0] + radius * Math.sin(phi) * Math.cos(theta),
                    source.position[1] + radius * Math.cos(phi),
                    source.position[2] + radius * Math.sin(phi) * Math.sin(theta),
                ]);
            }
        }
        while (seeds.length < count) {
            seeds.push([(random() * 2 - 1) * half, lerp(4, boundsY, random()), (random() * 2 - 1) * half]);
        }
        const maxMagnitude = Math.max(4, force.strength * 18);
        for (let s = 0; s < Math.min(count, seeds.length); s++) {
            let p = seeds[s].slice();
            for (let step = 0; step < steps; step++) {
                const v = forceAt(p);
                const magnitude = vec3.length(v);
                if (!Number.isFinite(magnitude) || magnitude < 0.02) break;
                const direction = vec3.scale(v, 1 / magnitude);
                const next = [p[0] + direction[0] * 0.9, p[1] + direction[1] * 0.9, p[2] + direction[2] * 0.9];
                if (Math.abs(next[0]) > half || Math.abs(next[2]) > half || next[1] < 0 || next[1] > boundsY) break;
                const t = clamp(magnitude / maxMagnitude, 0, 1);
                const color = [
                    lerp(0.95, 0.55, t),
                    lerp(0.55, 0.78, t),
                    lerp(0.35, 0.62, t),
                ];
                positions.push(p[0], p[1], p[2], next[0], next[1], next[2]);
                colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
                p = next;
            }
        }
        return {
            positions: new Float32Array(positions),
            colors: new Float32Array(colors),
            vertexCount: positions.length / 3,
        };
    }

    return {
        mode,
        boundsY,
        windDir,
        sources,
        sample,
        sampleGround,
        vectorAt,
        potentialAt,
        statistics,
        verticalProfile,
        streamlineGeometry,
        heightAt,
    };
}

export function probeReadout(state, terrain, noise, position) {
    const sampler = createFieldSampler(state, terrain, noise);
    const sample = sampler.sample(position);
    return {
        position,
        vector: sample.vector,
        magnitude: sample.magnitude,
        potential: sample.potential,
        ground: sample.ground,
        flow: sample.flow,
        vegetation: sample.vegetation,
        moisture: sample.moisture,
        boundsY: sampler.boundsY,
    };
}
