/*====================================================================================================================================
                                                        GPUFIELD.JS
====================================================================================================================================*/
// 🧩 GPU particle advection and precipitation integration with ping-pong float targets.

import { createProgram, createTexture2D, createTexture3D, createFramebuffer, createFullscreenVAO, pickParticleFormat } from './gl.js';
import { FULLSCREEN_VS } from './shaders/common.js';
import { PARTICLE_UPDATE_FS, PARTICLE_RENDER_VS, PARTICLE_RENDER_FS, RAIN_UPDATE_FS, RAIN_RENDER_VS, RAIN_RENDER_FS } from './shaders/particles.js';
import { COLOR_RAMPS } from '../SceneState.js';
import { hexToRgb, mulberry32 } from '../math.js';

const PARTICLE_SIZES = { performance: 192, balanced: 256, quality: 384 };
const RAIN_SIZE = 128;
const MAX_FORCE_SOURCES = 8;

function floatToHalf(value) {
    const f32 = new Float32Array(1);
    const u32 = new Uint32Array(f32.buffer);
    f32[0] = value;
    const x = u32[0];
    const sign = (x >> 16) & 0x8000;
    const exponent = (x >> 23) & 0xff;
    const mantissa = x & 0x7fffff;
    if (exponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
    let e = exponent - 127 + 15;
    if (e >= 0x1f) return sign | 0x7c00;
    if (e <= 0) {
        if (e < -10) return sign;
        const m = (mantissa | 0x800000) >> (1 - e);
        return sign | (m >> 13);
    }
    return sign | (e << 10) | (mantissa >> 13);
}

function toTargetData(gl, values, format) {
    if (format.type === gl.FLOAT) return values;
    if (format.type === gl.HALF_FLOAT) {
        const half = new Uint16Array(values.length);
        for (let i = 0; i < values.length; i++) half[i] = floatToHalf(values[i]);
        return half;
    }
    return values;
}

export class GpuField {
    constructor(gl, context, noiseVolume, terrain, quality = 'balanced') {
        this.gl = gl;
        this.context = context;
        this.noiseVolume = noiseVolume;
        this.terrain = terrain;
        this.quality = quality;
        this.particleSize = PARTICLE_SIZES[quality] || PARTICLE_SIZES.balanced;
        this.rainSize = RAIN_SIZE;
        this.seed = Math.random() * 1000;
        this.lastDt = 1 / 60;
        this.format = pickParticleFormat(gl, context.floatRenderable, context.halfFloatRenderable);
        if (this.format.label === 'RGBA8') {
            throw new Error('Float render targets are unavailable; the GPU field requires EXT_color_buffer_float.');
        }
        this.vao = createFullscreenVAO(gl);
        this.particleUpdate = createProgram(gl, FULLSCREEN_VS, PARTICLE_UPDATE_FS, 'particle update');
        this.particleRender = createProgram(gl, PARTICLE_RENDER_VS, PARTICLE_RENDER_FS, 'particle render');
        this.rainUpdate = createProgram(gl, FULLSCREEN_VS, RAIN_UPDATE_FS, 'rain update');
        this.rainRender = createProgram(gl, RAIN_RENDER_VS, RAIN_RENDER_FS, 'rain render');
        this.noiseTexture = createTexture3D(gl, noiseVolume.size, noiseVolume.size, noiseVolume.size, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, noiseVolume.data, gl.REPEAT);
        this.terrainTexture = createTexture2D(gl, terrain.resolution, terrain.resolution, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, terrain.data, gl.CLAMP_TO_EDGE);
        this.particleTargets = this.createParticleTargets();
        this.rainTargets = this.createRainTargets();
    }

    get boundsY() {
        return this.terrain.maxHeight * 2.6 + 26;
    }

    get particleCount() {
        return this.particleSize * this.particleSize;
    }

    get rainCount() {
        return this.rainSize * this.rainSize;
    }

    createParticleTargets() {
        const gl = this.gl;
        const size = this.particleSize;
        const count = size * size;
        const state = new Float32Array(count * 4);
        const previous = new Float32Array(count * 4);
        const random = mulberry32(0x51ed270b);
        const half = this.terrain.size * 0.5;
        for (let i = 0; i < count; i++) {
            const x = (random() * 2 - 1) * half * 0.92;
            const z = (random() * 2 - 1) * half * 0.92;
            const ground = this.terrain.heightAt(x, z, 0);
            const y = ground + 1.5 + random() * (this.boundsY - ground - 1.5);
            const age = random() * 6;
            const seed = random() * 1000;
            state[i * 4] = x;
            state[i * 4 + 1] = y;
            state[i * 4 + 2] = z;
            state[i * 4 + 3] = age;
            previous[i * 4] = x;
            previous[i * 4 + 1] = y;
            previous[i * 4 + 2] = z;
            previous[i * 4 + 3] = seed;
        }
        const stateData = toTargetData(gl, state, this.format);
        const previousData = toTargetData(gl, previous, this.format);
        const textures = [
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, stateData, gl.CLAMP_TO_EDGE),
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, previousData, gl.CLAMP_TO_EDGE),
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, stateData, gl.CLAMP_TO_EDGE),
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, previousData, gl.CLAMP_TO_EDGE),
        ];
        const framebuffers = [
            createFramebuffer(gl, [textures[0], textures[1]]),
            createFramebuffer(gl, [textures[2], textures[3]]),
        ];
        return { textures, framebuffers, current: 0 };
    }

    createRainTargets() {
        const gl = this.gl;
        const size = this.rainSize;
        const count = size * size;
        const state = new Float32Array(count * 4);
        const previous = new Float32Array(count * 4);
        const random = mulberry32(0x9a3c1f77);
        const half = this.terrain.size * 0.48;
        for (let i = 0; i < count; i++) {
            const x = (random() * 2 - 1) * half;
            const z = (random() * 2 - 1) * half;
            const y = this.boundsY * (0.7 + random() * 0.3);
            state[i * 4] = x;
            state[i * 4 + 1] = y;
            state[i * 4 + 2] = z;
            state[i * 4 + 3] = random() * 4;
            previous[i * 4] = x;
            previous[i * 4 + 1] = y;
            previous[i * 4 + 2] = z;
            previous[i * 4 + 3] = random() * 1000;
        }
        const stateData = toTargetData(gl, state, this.format);
        const previousData = toTargetData(gl, previous, this.format);
        const textures = [
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, stateData, gl.CLAMP_TO_EDGE),
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, previousData, gl.CLAMP_TO_EDGE),
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, stateData, gl.CLAMP_TO_EDGE),
            createTexture2D(gl, size, size, this.format.internalFormat, this.format.format, this.format.type, gl.NEAREST, previousData, gl.CLAMP_TO_EDGE),
        ];
        const framebuffers = [
            createFramebuffer(gl, [textures[0], textures[1]]),
            createFramebuffer(gl, [textures[2], textures[3]]),
        ];
        return { textures, framebuffers, current: 0 };
    }

    setTerrain(terrain) {
        this.terrain = terrain;
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.terrainTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, terrain.resolution, terrain.resolution, 0, gl.RGBA, gl.UNSIGNED_BYTE, terrain.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    setQuality(quality) {
        if (quality === this.quality) return;
        this.quality = quality;
        this.particleSize = PARTICLE_SIZES[quality] || PARTICLE_SIZES.balanced;
        this.disposeTargets(this.particleTargets);
        this.particleTargets = this.createParticleTargets();
    }

    reset() {
        this.disposeTargets(this.particleTargets);
        this.particleTargets = this.createParticleTargets();
        this.disposeTargets(this.rainTargets);
        this.rainTargets = this.createRainTargets();
        this.seed = Math.random() * 1000;
    }

    disposeTargets(targets) {
        const gl = this.gl;
        for (const texture of targets.textures) gl.deleteTexture(texture);
        for (const framebuffer of targets.framebuffers) gl.deleteFramebuffer(framebuffer);
    }

    setFieldUniforms(program, state, time) {
        const gl = this.gl;
        const mode = state.mode === 'wind' ? 0 : state.mode === 'force' ? 1 : 2;
        const wind = state.layers.wind;
        const force = state.layers.force;
        const terrainFlow = state.layers.terrainFlow;
        const windDir = [
            Math.cos(wind.elevation * Math.PI / 180) * Math.cos(wind.direction * Math.PI / 180),
            Math.sin(wind.elevation * Math.PI / 180),
            Math.cos(wind.elevation * Math.PI / 180) * Math.sin(wind.direction * Math.PI / 180),
        ];
        gl.uniform1i(program.uniform('uMode'), mode);
        gl.uniform1f(program.uniform('uTime'), time);
        gl.uniform1f(program.uniform('uTerrainSize'), this.terrain.size);
        gl.uniform1f(program.uniform('uTerrainHeight'), this.terrain.maxHeight);
        gl.uniform1f(program.uniform('uBoundsY'), this.boundsY);
        gl.uniform3f(program.uniform('uWindDir'), windDir[0], windDir[1], windDir[2]);
        gl.uniform1f(program.uniform('uWindSpeed'), wind.speed);
        gl.uniform1f(program.uniform('uTurbulence'), wind.turbulence);
        gl.uniform1f(program.uniform('uCurlScale'), wind.curlScale);
        gl.uniform1f(program.uniform('uLift'), wind.lift);
        gl.uniform1f(program.uniform('uTerrainCoupling'), wind.terrainCoupling);
        gl.uniform3f(program.uniform('uForceBackground'), force.background[0], force.background[1], force.background[2]);
        gl.uniform1f(program.uniform('uForceStrength'), force.strength);
        gl.uniform1f(program.uniform('uForceRadius'), force.radius);
        gl.uniform1f(program.uniform('uForceFalloff'), force.falloff);
        const sources = new Float32Array(MAX_FORCE_SOURCES * 4);
        const kinds = new Float32Array(MAX_FORCE_SOURCES);
        const activeSources = force.sources.filter((source) => source.enabled !== false).slice(0, MAX_FORCE_SOURCES);
        activeSources.forEach((source, index) => {
            sources[index * 4] = source.position[0];
            sources[index * 4 + 1] = source.position[1];
            sources[index * 4 + 2] = source.position[2];
            sources[index * 4 + 3] = source.strength;
            kinds[index] = source.kind === 'repulsor' ? 1 : source.kind === 'vortex' ? 2 : 0;
        });
        gl.uniform1i(program.uniform('uForceCount'), activeSources.length);
        gl.uniform4fv(program.uniform('uForceSources[0]'), sources);
        gl.uniform1fv(program.uniform('uForceKinds[0]'), kinds);
        gl.uniform1f(program.uniform('uFlowSpeed'), terrainFlow.speed);
        gl.uniform1f(program.uniform('uFlowTurbulence'), terrainFlow.turbulence);
        const rampKey = state.mode === 'wind' ? wind.colorRamp : state.mode === 'force' ? force.colorRamp : terrainFlow.colorRamp;
        this.setRamp(program, rampKey);
    }

    setRamp(program, rampKey) {
        const gl = this.gl;
        const ramp = COLOR_RAMPS[rampKey] || COLOR_RAMPS.sage;
        const rampArray = new Float32Array(15);
        ramp.forEach((hex, index) => {
            const rgb = hexToRgb(hex);
            rampArray[index * 3] = rgb[0];
            rampArray[index * 3 + 1] = rgb[1];
            rampArray[index * 3 + 2] = rgb[2];
        });
        gl.uniform3fv(program.uniform('uRamp[0]'), rampArray);
    }

    setRainUniforms(program, state, time) {
        const gl = this.gl;
        const precipitation = state.layers.precipitation;
        const wind = state.layers.wind;
        const windDir = [
            Math.cos(wind.elevation * Math.PI / 180) * Math.cos(wind.direction * Math.PI / 180),
            0,
            Math.cos(wind.elevation * Math.PI / 180) * Math.sin(wind.direction * Math.PI / 180),
        ];
        gl.uniform3f(program.uniform('uWindDir'), windDir[0], windDir[1], windDir[2]);
        gl.uniform1f(program.uniform('uFallSpeed'), precipitation.fallSpeed);
        gl.uniform1f(program.uniform('uWindCoupling'), precipitation.windCoupling);
        gl.uniform1f(program.uniform('uIntensity'), precipitation.intensity);
        gl.uniform1f(program.uniform('uBoundsY'), this.boundsY);
        gl.uniform1f(program.uniform('uTime'), time);
        gl.uniform1f(program.uniform('uTerrainHeight'), this.terrain.maxHeight);
        gl.uniform1f(program.uniform('uTerrainSize'), this.terrain.size);
    }

    activeLayer(state) {
        if (state.mode === 'wind') return state.layers.wind;
        if (state.mode === 'force') return state.layers.force;
        return state.layers.terrainFlow;
    }

    update(dt, state, time) {
        if (dt <= 0) return;
        this.lastDt = dt;
        const gl = this.gl;
        const layer = this.activeLayer(state);
        if (layer.visible) {
            const targets = this.particleTargets;
            const current = targets.current;
            const read = 1 - current;
            gl.bindFramebuffer(gl.FRAMEBUFFER, targets.framebuffers[current]);
            gl.viewport(0, 0, this.particleSize, this.particleSize);
            gl.useProgram(this.particleUpdate.program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, targets.textures[read * 2]);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, targets.textures[read * 2 + 1]);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.terrainTexture);
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_3D, this.noiseTexture);
            gl.uniform1i(this.particleUpdate.uniform('uState'), 0);
            gl.uniform1i(this.particleUpdate.uniform('uPrevious'), 1);
            gl.uniform1i(this.particleUpdate.uniform('uTerrainData'), 2);
            gl.uniform1i(this.particleUpdate.uniform('uNoise3D'), 3);
            this.setFieldUniforms(this.particleUpdate, state, time);
            gl.uniform1f(this.particleUpdate.uniform('uDt'), dt);
            gl.uniform1f(this.particleUpdate.uniform('uLife'), layer.life);
            gl.uniform1f(this.particleUpdate.uniform('uSurfaceLock'), state.mode === 'terrain' ? 1 : 0);
            gl.uniform1f(this.particleUpdate.uniform('uSeed'), this.seed);
            gl.uniform3f(this.particleUpdate.uniform('uBoundsMin'), -this.terrain.size * 0.5, 0, -this.terrain.size * 0.5);
            gl.uniform3f(this.particleUpdate.uniform('uBoundsMax'), this.terrain.size * 0.5, this.boundsY, this.terrain.size * 0.5);
            gl.bindVertexArray(this.vao);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            targets.current = 1 - current;
        }
        if (state.layers.precipitation.visible) {
            const targets = this.rainTargets;
            const current = targets.current;
            const read = 1 - current;
            gl.bindFramebuffer(gl.FRAMEBUFFER, targets.framebuffers[current]);
            gl.viewport(0, 0, this.rainSize, this.rainSize);
            gl.useProgram(this.rainUpdate.program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, targets.textures[read * 2]);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, targets.textures[read * 2 + 1]);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.terrainTexture);
            gl.uniform1i(this.rainUpdate.uniform('uState'), 0);
            gl.uniform1i(this.rainUpdate.uniform('uPrevious'), 1);
            gl.uniform1i(this.rainUpdate.uniform('uTerrainData'), 2);
            this.setRainUniforms(this.rainUpdate, state, time);
            gl.uniform1f(this.rainUpdate.uniform('uDt'), dt);
            gl.bindVertexArray(this.vao);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            targets.current = 1 - current;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
    }

    renderParticles(viewProjection, viewport, state, time) {
        const gl = this.gl;
        const layer = this.activeLayer(state);
        if (!layer.visible) return 0;
        const targets = this.particleTargets;
        const current = targets.current;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, viewport.width, viewport.height);
        gl.useProgram(this.particleRender.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targets.textures[current * 2]);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, targets.textures[current * 2 + 1]);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.terrainTexture);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_3D, this.noiseTexture);
        gl.uniform1i(this.particleRender.uniform('uState'), 0);
        gl.uniform1i(this.particleRender.uniform('uPrevious'), 1);
        gl.uniform1i(this.particleRender.uniform('uTerrainData'), 2);
        gl.uniform1i(this.particleRender.uniform('uNoise3D'), 3);
        this.setFieldUniforms(this.particleRender, state, time);
        gl.uniformMatrix4fv(this.particleRender.uniform('uViewProj'), false, viewProjection);
        gl.uniform2f(this.particleRender.uniform('uResolution'), viewport.width, viewport.height);
        gl.uniform1f(this.particleRender.uniform('uDt'), Math.max(this.lastDt, 0.008));
        gl.uniform1f(this.particleRender.uniform('uStreak'), layer.streak);
        gl.uniform1f(this.particleRender.uniform('uWidth'), layer.width);
        gl.uniform1f(this.particleRender.uniform('uLife'), layer.life);
        gl.uniform1f(this.particleRender.uniform('uOpacity'), layer.opacity);
        gl.uniform1f(this.particleRender.uniform('uMaxSpeed'), this.maxSpeed(state));
        gl.uniform1f(this.particleRender.uniform('uPixelRatio'), viewport.pixelRatio);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.particleCount * 6);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
        return this.particleCount;
    }

    renderRain(viewProjection, viewport, state, time) {
        const gl = this.gl;
        const precipitation = state.layers.precipitation;
        if (!precipitation.visible) return 0;
        const targets = this.rainTargets;
        const current = targets.current;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, viewport.width, viewport.height);
        gl.useProgram(this.rainRender.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targets.textures[current * 2]);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, targets.textures[current * 2 + 1]);
        gl.uniform1i(this.rainRender.uniform('uState'), 0);
        gl.uniform1i(this.rainRender.uniform('uPrevious'), 1);
        gl.uniformMatrix4fv(this.rainRender.uniform('uViewProj'), false, viewProjection);
        gl.uniform2f(this.rainRender.uniform('uResolution'), viewport.width, viewport.height);
        gl.uniform1f(this.rainRender.uniform('uDt'), Math.max(this.lastDt, 0.008));
        gl.uniform1f(this.rainRender.uniform('uStreak'), precipitation.streak);
        gl.uniform1f(this.rainRender.uniform('uWidth'), precipitation.width);
        gl.uniform1f(this.rainRender.uniform('uOpacity'), precipitation.opacity);
        gl.uniform1f(this.rainRender.uniform('uIntensity'), precipitation.intensity);
        gl.uniform1f(this.rainRender.uniform('uPixelRatio'), viewport.pixelRatio);
        const color = hexToRgb(precipitation.color);
        gl.uniform3f(this.rainRender.uniform('uColor'), color[0], color[1], color[2]);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.rainCount * 6);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
        return this.rainCount;
    }

    maxSpeed(state) {
        if (state.mode === 'wind') return Math.max(8, state.layers.wind.speed * 2.2);
        if (state.mode === 'force') return Math.max(10, state.layers.force.strength * 30);
        return Math.max(2, state.layers.terrainFlow.speed * 8);
    }

    dispose() {
        const gl = this.gl;
        this.disposeTargets(this.particleTargets);
        this.disposeTargets(this.rainTargets);
        gl.deleteTexture(this.noiseTexture);
        gl.deleteTexture(this.terrainTexture);
        gl.deleteVertexArray(this.vao);
        for (const program of [this.particleUpdate, this.particleRender, this.rainUpdate, this.rainRender]) {
            gl.deleteProgram(program.program);
        }
    }
}
