import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, sanitizeState, applyMode, cloneState } from '../src/SceneState.js';
import { createNoiseVolume, curlNoise } from '../src/noise.js';
import { generateTerrain, buildVegetation, buildGlyphBases } from '../src/terrain.js';
import { createFieldSampler, probeReadout } from '../src/field.js';
import { mat4, camera, screenToRay, projectToScreen, rayHeightfield, vec3, clamp, lerp } from '../src/math.js';

test('terrain generation produces a valid heightfield and mesh', () => {
    const state = createInitialState();
    const terrain = generateTerrain(state.terrain);
    assert.equal(terrain.resolution, 256);
    assert.equal(terrain.heights.length, 256 * 256);
    assert.equal(terrain.data.length, 256 * 256 * 4);
    assert.equal(terrain.mesh.indices.length, 255 * 255 * 6);
    assert.equal(terrain.mesh.positions.length, 256 * 256 * 3);
    for (let i = 0; i < terrain.heights.length; i++) {
        const h = terrain.heights[i];
        assert.ok(Number.isFinite(h), 'height finite');
        assert.ok(h >= 0 && h <= 1, 'height normalized');
    }
    for (let i = 0; i < terrain.data.length; i++) {
        assert.ok(terrain.data[i] >= 0 && terrain.data[i] <= 255, 'data byte range');
    }
    const center = terrain.heightAt(0, 0);
    assert.ok(Number.isFinite(center), 'center height finite');
    const outside = terrain.heightAt(1000, 1000, -1);
    assert.equal(outside, -1);
    const sample = terrain.sampleData(0, 0);
    assert.equal(sample.length, 4);
    for (const value of sample) assert.ok(value >= 0 && value <= 1);
});

test('noise volume is tileable and curl is finite', () => {
    const noise = createNoiseVolume(64);
    assert.equal(noise.data.length, 64 * 64 * 64 * 4);
    const a = noise.sample(0.1, 0.2, 0.3);
    const b = noise.sample(1.1, 1.2, 1.3);
    assert.equal(a.length, 3);
    for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(a[i] - b[i]) < 1e-6, 'wrap continuity');
        assert.ok(a[i] >= 0 && a[i] <= 1);
    }
    const curl = curlNoise(noise, 0.2, 0.3, 0.4);
    for (const value of curl) assert.ok(Number.isFinite(value));
});

test('field sampler produces finite vectors in all modes', () => {
    const state = createInitialState();
    const terrain = generateTerrain(state.terrain);
    const noise = createNoiseVolume(64);
    for (const mode of ['wind', 'force', 'terrain']) {
        state.mode = mode;
        const sampler = createFieldSampler(state, terrain, noise);
        for (const p of [[0, 20, 0], [-20, 12, 10], [25, 30, -20]]) {
            const sample = sampler.sample(p);
            for (const value of sample.vector) assert.ok(Number.isFinite(value), `${mode} vector finite`);
            assert.ok(Number.isFinite(sample.magnitude));
            assert.ok(sample.magnitude >= 0);
        }
    }
});

test('force sources attract, repel, and rotate', () => {
    const state = createInitialState();
    state.mode = 'force';
    state.layers.force.sources = [
        { id: 'a', label: 'A', kind: 'attractor', position: [0, 0, 0], strength: 1, radius: 10, enabled: true },
    ];
    state.layers.force.background = [0, 0, 0];
    const terrain = generateTerrain(state.terrain);
    const noise = createNoiseVolume(64);
    const attractor = createFieldSampler(state, terrain, noise);
    const attracted = attractor.sample([5, 0, 0]).vector;
    assert.ok(attracted[0] < 0, 'attractor points inward');

    state.layers.force.sources[0].kind = 'repulsor';
    const repulsor = createFieldSampler(state, terrain, noise);
    const repelled = repulsor.sample([5, 0, 0]).vector;
    assert.ok(repelled[0] > 0, 'repulsor points outward');

    state.layers.force.sources[0].kind = 'vortex';
    const vortex = createFieldSampler(state, terrain, noise);
    const rotated = vortex.sample([5, 0, 0]).vector;
    assert.ok(Number.isFinite(rotated[2]), 'vortex tangent finite');
    assert.ok(Math.abs(rotated[0]) < Math.abs(rotated[2]) + 1e-6, 'vortex tangent dominates radial');
});

test('probe readout is finite and includes terrain channels', () => {
    const state = createInitialState();
    const terrain = generateTerrain(state.terrain);
    const noise = createNoiseVolume(64);
    const readout = probeReadout(state, terrain, noise, [0, terrain.heightAt(0, 0) + 0.35, 0]);
    for (const value of readout.vector) assert.ok(Number.isFinite(value));
    assert.ok(Number.isFinite(readout.magnitude));
    assert.ok(Number.isFinite(readout.flow));
    assert.ok(Number.isFinite(readout.vegetation));
    assert.ok(Number.isFinite(readout.moisture));
});

test('vegetation and glyph bases are above the terrain', () => {
    const state = createInitialState();
    const terrain = generateTerrain(state.terrain);
    const vegetation = buildVegetation(terrain, state.terrain, 4000);
    assert.ok(vegetation.blades.length > 0);
    assert.ok(vegetation.blades.length <= 4000);
    for (const blade of vegetation.blades) {
        assert.ok(Number.isFinite(blade.x));
        assert.ok(Number.isFinite(blade.y));
        assert.ok(Number.isFinite(blade.z));
        assert.ok(blade.y >= terrain.heightAt(blade.x, blade.z) - 0.1);
    }
    const bases = buildGlyphBases(terrain, 70, 10, 5);
    assert.ok(bases.length > 0);
    for (let i = 0; i < bases.length; i += 3) {
        assert.ok(Number.isFinite(bases[i]));
        assert.ok(Number.isFinite(bases[i + 1]));
        assert.ok(Number.isFinite(bases[i + 2]));
    }
});

test('matrix inverse and projection round-trip', () => {
    const view = mat4.lookAt([0, 10, 100], [0, 0, 0], [0, 1, 0]);
    const projection = mat4.perspective(Math.PI / 4, 16 / 9, 0.5, 900);
    const viewProjection = mat4.multiply(projection, view);
    const inverse = mat4.invert(viewProjection);
    const identity = mat4.multiply(viewProjection, inverse);
    for (let i = 0; i < 16; i++) {
        const expected = i % 5 === 0 ? 1 : 0;
        assert.ok(Math.abs(identity[i] - expected) < 1e-5, 'inverse identity');
    }
    const ray = screenToRay(inverse, 800, 450, 1600, 900);
    assert.ok(Number.isFinite(ray.origin[0]));
    assert.ok(Number.isFinite(ray.direction[0]));
    const projected = projectToScreen(viewProjection, [0, 0, 0], 1600, 900);
    assert.ok(projected);
    assert.ok(projected.x > 700 && projected.x < 900);
    assert.ok(projected.y > 350 && projected.y < 550);
});

test('ray-heightfield intersection hits the surface', () => {
    const state = createInitialState();
    const terrain = generateTerrain(state.terrain);
    const hit = rayHeightfield([0, 80, 0], [0, -1, 0], (x, z) => terrain.heightAt(x, z, -1e3), { half: terrain.size * 0.5 }, 300);
    assert.ok(hit);
    assert.ok(Math.abs(hit[1] - terrain.heightAt(hit[0], hit[2])) < 0.5);
});

test('state sanitisation clamps and preserves sources', () => {
    const state = createInitialState();
    state.terrain.seaLevel = 2;
    state.camera.distance = 10000;
    state.layers.force.sources = [];
    const clean = sanitizeState(state);
    assert.ok(clean.terrain.seaLevel <= 0.55);
    assert.ok(clean.camera.distance <= 420);
    assert.ok(Array.isArray(clean.layers.force.sources));
});

test('mode presets set field visibility', () => {
    const state = createInitialState();
    applyMode(state, 'force');
    assert.equal(state.mode, 'force');
    assert.equal(state.layers.force.visible, true);
    assert.equal(state.layers.slice.visible, true);
    applyMode(state, 'terrain');
    assert.equal(state.mode, 'terrain');
    assert.equal(state.layers.terrainFlow.visible, true);
    assert.equal(state.layers.precipitation.visible, true);
    const draft = cloneState(state);
    draft.layers.wind.speed = 99;
    assert.equal(state.layers.wind.speed, 16);
});

test('scalar helpers behave at boundaries', () => {
    assert.equal(clamp(5, 0, 1), 1);
    assert.equal(clamp(-5, 0, 1), 0);
    assert.equal(lerp(0, 10, 0.5), 5);
    assert.ok(vec3.isFinite([1, 2, 3]));
    assert.ok(!vec3.isFinite([NaN, 2, 3]));
    assert.ok(Math.abs(camera.eyeFor([0, 0, 0], 0, 0, 10)[2] - 10) < 1e-6);
});
