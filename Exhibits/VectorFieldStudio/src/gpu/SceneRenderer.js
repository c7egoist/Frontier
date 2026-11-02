/*====================================================================================================================================
                                                        SCENERENDERER.JS
====================================================================================================================================*/
// 🧩 WebGL2 scene renderer: terrain, water, slice, glyphs, streamlines, vegetation, sources, probe.

import {
    createContext,
    createProgram,
    createFullscreenVAO,
    createMeshVAO,
    createBuffer,
} from './gl.js';
import { FULLSCREEN_VS, BACKGROUND_FS } from './shaders/common.js';
import { TERRAIN_VS, TERRAIN_FS, WATER_VS, WATER_FS } from './shaders/terrain.js';
import { SLICE_VS, SLICE_FS, GLYPH_VS, GLYPH_FS, STREAMLINE_VS, STREAMLINE_FS } from './shaders/field.js';
import { VEGETATION_VS, VEGETATION_FS, SOURCE_VS, SOURCE_FS, PROBE_VS, PROBE_FS, GRID_VS, GRID_FS } from './shaders/vegetation.js';
import { GpuField } from './GpuField.js';
import { buildVegetation, buildGlyphBases } from '../terrain.js';
import { createFieldSampler } from '../field.js';
import { clamp, lerp, hexToRgb, mat4, camera as cameraMath, screenToRay, rayHeightfield, projectToScreen } from '../math.js';
import { TERRAIN_PALETTES } from '../SceneState.js';

const SUN_DIRECTION = (() => {
    const x = 0.42, y = 0.82, z = 0.28;
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length];
})();

const SOURCE_COLORS = {
    attractor: '#d9a06a',
    repulsor: '#c96a6a',
    vortex: '#8f7ad9',
};

export class SceneRenderer {
    constructor(canvas, state, noiseVolume, terrain, callbacks = {}) {
        this.canvas = canvas;
        this.state = state;
        this.noiseVolume = noiseVolume;
        this.terrain = terrain;
        this.callbacks = callbacks;
        this.context = createContext(canvas);
        this.gl = this.context.gl;
        this.programs = this.createPrograms();
        this.fullscreenVAO = createFullscreenVAO(this.gl);
        this.gpuField = new GpuField(this.gl, this.context, noiseVolume, terrain, state.quality);
        this.cameraCurrent = {
            azimuth: state.camera.azimuth,
            elevation: state.camera.elevation,
            distance: state.camera.distance,
            target: [...state.camera.target],
        };
        this.viewport = { width: 1, height: 1, pixelRatio: 1, cssWidth: 1, cssHeight: 1 };
        this.probe = { valid: false, position: [0, 0, 0], ground: 0, top: 0 };
        this.probeTool = false;
        this.streamlineVertexCount = 0;
        this.glyphCount = 0;
        this.vegetationVertexCount = 0;
        this.sourceCount = 0;
        this.probeVertexCount = 0;
        this.gridVertexCount = 0;
        this.gridExtent = 0;
        this.gridDivisions = 0;
        this.pointer = { active: false, id: null, x: 0, y: 0, startX: 0, startY: 0, moved: 0, button: 0, mode: 'orbit' };
        this.frameStats = { fps: 0, frameMs: 0 };
        this.lastFrame = performance.now();
        this.lastHover = 0;
        this.terrainVAO = null;
        this.terrainBuffers = null;
        this.terrainIndexCount = 0;
        this.waterVAO = null;
        this.waterBuffers = null;
        this.waterIndexCount = 0;
        this.sliceVAO = null;
        this.sliceBuffers = null;
        this.sliceIndexCount = 0;
        this.glyphVAO = null;
        this.glyphBuffers = null;
        this.vegetationVAO = null;
        this.vegetationBuffers = null;
        this.streamlineVAO = null;
        this.streamlineBuffers = null;
        this.sourceVAO = null;
        this.sourceBuffer = null;
        this.probeVAO = null;
        this.probeBuffer = null;
        this.gridVAO = null;
        this.gridBuffers = null;
        this.createTerrainBuffers();
        this.createWaterBuffers();
        this.createSliceBuffers();
        this.createGlyphBuffers();
        this.createVegetationBuffers();
        this.createStreamlineBuffers();
        this.createSourceBuffers();
        this.createProbeBuffers();
        this.createGridBuffers();
        this.refreshField();
        this.resize();
        this.bindEvents();
    }

    createPrograms() {
        const gl = this.gl;
        return {
            background: createProgram(gl, FULLSCREEN_VS, BACKGROUND_FS, 'background'),
            terrain: createProgram(gl, TERRAIN_VS, TERRAIN_FS, 'terrain'),
            water: createProgram(gl, WATER_VS, WATER_FS, 'water'),
            slice: createProgram(gl, SLICE_VS, SLICE_FS, 'slice'),
            glyph: createProgram(gl, GLYPH_VS, GLYPH_FS, 'glyph'),
            streamline: createProgram(gl, STREAMLINE_VS, STREAMLINE_FS, 'streamline'),
            vegetation: createProgram(gl, VEGETATION_VS, VEGETATION_FS, 'vegetation'),
            source: createProgram(gl, SOURCE_VS, SOURCE_FS, 'source'),
            probe: createProgram(gl, PROBE_VS, PROBE_FS, 'probe'),
            grid: createProgram(gl, GRID_VS, GRID_FS, 'grid'),
        };
    }

    createTerrainBuffers() {
        this.deleteMesh(this.terrainVAO, this.terrainBuffers);
        const mesh = this.terrain.mesh;
        const result = createMeshVAO(this.gl, this.programs.terrain, [
            { name: 'aPosition', size: 3, data: mesh.positions },
            { name: 'aNormal', size: 3, data: mesh.normals },
            { name: 'aColor', size: 3, data: mesh.colors },
        ], mesh.indices);
        this.terrainVAO = result.vao;
        this.terrainBuffers = result.buffers;
        this.terrainIndexCount = mesh.indexCount;
    }

    createWaterBuffers() {
        this.deleteMesh(this.waterVAO, this.waterBuffers);
        const half = this.terrain.size * 0.51;
        const positions = new Float32Array([
            -half, 0, -half,
            half, 0, -half,
            half, 0, half,
            -half, 0, half,
        ]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
        const result = createMeshVAO(this.gl, this.programs.water, [
            { name: 'aPosition', size: 3, data: positions },
        ], indices);
        this.waterVAO = result.vao;
        this.waterBuffers = result.buffers;
        this.waterIndexCount = 6;
    }

    createSliceBuffers() {
        this.deleteMesh(this.sliceVAO, this.sliceBuffers);
        const positions = new Float32Array([
            -0.5, 0, -0.5,
            0.5, 0, -0.5,
            0.5, 0, 0.5,
            -0.5, 0, 0.5,
        ]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
        const result = createMeshVAO(this.gl, this.programs.slice, [
            { name: 'aPosition', size: 3, data: positions },
        ], indices);
        this.sliceVAO = result.vao;
        this.sliceBuffers = result.buffers;
        this.sliceIndexCount = 6;
    }

    createGlyphBuffers() {
        this.deleteMesh(this.glyphVAO, this.glyphBuffers);
        const bases = buildGlyphBases(this.terrain, this.gpuField.boundsY, 12, 6);
        const count = bases.length / 3;
        const baseData = new Float32Array(count * 2 * 3);
        const tipData = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            const x = bases[i * 3], y = bases[i * 3 + 1], z = bases[i * 3 + 2];
            baseData[i * 6] = x; baseData[i * 6 + 1] = y; baseData[i * 6 + 2] = z;
            baseData[i * 6 + 3] = x; baseData[i * 6 + 4] = y; baseData[i * 6 + 5] = z;
            tipData[i * 2] = 0;
            tipData[i * 2 + 1] = 1;
        }
        const result = createMeshVAO(this.gl, this.programs.glyph, [
            { name: 'aBase', size: 3, data: baseData },
            { name: 'aTip', size: 1, data: tipData },
        ]);
        this.glyphVAO = result.vao;
        this.glyphBuffers = result.buffers;
        this.glyphCount = count;
    }

    createVegetationBuffers() {
        this.deleteMesh(this.vegetationVAO, this.vegetationBuffers);
        const vegetation = buildVegetation(this.terrain, this.state.terrain, 30000);
        const count = vegetation.blades.length;
        const baseData = new Float32Array(count * 2 * 3);
        const paramData = new Float32Array(count * 2 * 4);
        for (let i = 0; i < count; i++) {
            const blade = vegetation.blades[i];
            for (let v = 0; v < 2; v++) {
                const baseOffset = (i * 2 + v) * 3;
                const paramOffset = (i * 2 + v) * 4;
                baseData[baseOffset] = blade.x;
                baseData[baseOffset + 1] = blade.y;
                baseData[baseOffset + 2] = blade.z;
                paramData[paramOffset] = blade.scale;
                paramData[paramOffset + 1] = blade.phase;
                paramData[paramOffset + 2] = blade.tint;
                paramData[paramOffset + 3] = blade.density;
            }
        }
        const result = createMeshVAO(this.gl, this.programs.vegetation, [
            { name: 'aBase', size: 3, data: baseData },
            { name: 'aParams', size: 4, data: paramData },
        ]);
        this.vegetationVAO = result.vao;
        this.vegetationBuffers = result.buffers;
        this.vegetationVertexCount = count * 2;
    }

    createStreamlineBuffers() {
        this.deleteMesh(this.streamlineVAO, this.streamlineBuffers);
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
        const colorBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.streamlineVAO = vao;
        this.streamlineBuffers = [positionBuffer, colorBuffer];
        this.streamlineVertexCount = 0;
    }

    updateStreamlines() {
        if (this.state.mode !== 'force') {
            this.streamlineVertexCount = 0;
            return;
        }
        const sampler = createFieldSampler(this.state, this.terrain, this.noiseVolume);
        const geometry = sampler.streamlineGeometry(this.state.layers.streamlines.count, this.state.layers.streamlines.steps);
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.streamlineBuffers[0]);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.streamlineBuffers[1]);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.colors, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.streamlineVertexCount = geometry.vertexCount;
    }

    createSourceBuffers() {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(8 * 8), gl.DYNAMIC_DRAW);
        const stride = 8 * 4;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
        gl.bindVertexArray(null);
        this.sourceVAO = vao;
        this.sourceBuffer = buffer;
        this.sourceCount = 0;
    }

    updateSourceBuffer() {
        const sources = this.state.layers.force.sources.filter((source) => source.enabled !== false).slice(0, 8);
        const data = new Float32Array(8 * 8);
        sources.forEach((source, index) => {
            const color = hexToRgb(SOURCE_COLORS[source.kind] || SOURCE_COLORS.attractor);
            const offset = index * 8;
            data[offset] = source.position[0];
            data[offset + 1] = source.position[1];
            data[offset + 2] = source.position[2];
            data[offset + 3] = color[0];
            data[offset + 4] = color[1];
            data[offset + 5] = color[2];
            data[offset + 6] = source.kind === 'vortex' ? 13 : 10;
            data[offset + 7] = 0;
        });
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sourceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.sourceCount = sources.length;
    }

    createProbeBuffers() {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.probeVAO = vao;
        this.probeBuffer = buffer;
        this.probeVertexCount = 0;
    }

    setProbe(position) {
        const ground = this.terrain.heightAt(position[0], position[2], 0);
        const top = ground + 8;
        const x = position[0];
        const z = position[2];
        const positions = [];
        positions.push(x, ground, z, x, top, z);
        const segments = 40;
        const radius = 1.2;
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            positions.push(
                x + Math.cos(a0) * radius, ground + 0.06, z + Math.sin(a0) * radius,
                x + Math.cos(a1) * radius, ground + 0.06, z + Math.sin(a1) * radius,
            );
        }
        positions.push(x - 0.8, top, z, x + 0.8, top, z);
        positions.push(x, top, z - 0.8, x, top, z + 0.8);
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.probeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.probeVertexCount = positions.length / 3;
        this.probe = { valid: true, position: [x, ground, z], ground, top };
    }

    clearProbe() {
        this.probe = { valid: false, position: [0, 0, 0], ground: 0, top: 0 };
        this.probeVertexCount = 0;
    }

    createGridBuffers() {
        this.deleteMesh(this.gridVAO, this.gridBuffers);
        const extent = this.state.layers.grid.extent;
        const divisions = this.state.layers.grid.divisions;
        const half = extent * 0.5;
        const positions = [];
        for (let i = 0; i <= divisions; i++) {
            const t = (i / divisions - 0.5) * extent;
            positions.push(t, 0.05, -half, t, 0.05, half);
            positions.push(-half, 0.05, t, half, 0.05, t);
        }
        const result = createMeshVAO(this.gl, this.programs.grid, [
            { name: 'aPosition', size: 3, data: new Float32Array(positions) },
        ]);
        this.gridVAO = result.vao;
        this.gridBuffers = result.buffers;
        this.gridVertexCount = positions.length / 3;
        this.gridExtent = extent;
        this.gridDivisions = divisions;
    }

    deleteMesh(vao, buffers) {
        const gl = this.gl;
        if (vao) gl.deleteVertexArray(vao);
        if (buffers) for (const buffer of buffers) gl.deleteBuffer(buffer);
    }

    bindEvents() {
        this.onPointerDown = (event) => {
            if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
            this.pointer = {
                active: true,
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                startX: event.clientX,
                startY: event.clientY,
                moved: 0,
                button: event.button,
                mode: event.button === 2 || event.shiftKey ? 'pan' : 'orbit',
            };
            this.canvas.setPointerCapture(event.pointerId);
        };
        this.onPointerMove = (event) => {
            if (this.pointer.active && event.pointerId === this.pointer.id) {
                const dx = event.clientX - this.pointer.x;
                const dy = event.clientY - this.pointer.y;
                this.pointer.x = event.clientX;
                this.pointer.y = event.clientY;
                this.pointer.moved += Math.abs(dx) + Math.abs(dy);
                if (this.pointer.mode === 'orbit') {
                    this.state.camera.azimuth -= dx * 0.005;
                    this.state.camera.elevation = clamp(this.state.camera.elevation + dy * 0.005, 0.05, 1.45);
                } else {
                    const scale = this.state.camera.distance * 0.0016;
                    const eye = cameraMath.eyeFor(this.cameraCurrent.target, this.cameraCurrent.azimuth, this.cameraCurrent.elevation, this.cameraCurrent.distance);
                    const forward = cameraMath.lookAt(eye, this.cameraCurrent.target, [0, 1, 0]);
                    const right = [forward[0], forward[4], forward[8]];
                    const up = [forward[1], forward[5], forward[9]];
                    this.state.camera.target[0] += -right[0] * dx * scale + up[0] * dy * scale;
                    this.state.camera.target[1] += -right[1] * dx * scale + up[1] * dy * scale;
                    this.state.camera.target[2] += -right[2] * dx * scale + up[2] * dy * scale;
                }
                return;
            }
            const now = performance.now();
            if (now - this.lastHover < 45) return;
            this.lastHover = now;
            const point = this.screenToWorld(event.clientX, event.clientY);
            this.callbacks.onHover?.(point);
        };
        this.onPointerUp = (event) => {
            if (!this.pointer.active || event.pointerId !== this.pointer.id) return;
            const wasClick = this.pointer.moved < 5 && this.pointer.button === 0;
            if (wasClick && this.probeTool) {
                const point = this.screenToWorld(event.clientX, event.clientY);
                if (point) {
                    this.setProbe(point);
                    this.callbacks.onProbe?.(point);
                }
            }
            this.pointer.active = false;
            if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
        };
        this.onWheel = (event) => {
            event.preventDefault();
            const factor = Math.exp(event.deltaY * 0.001);
            this.state.camera.distance = clamp(this.state.camera.distance * factor, 18, 420);
        };
        this.onDoubleClick = (event) => {
            const point = this.screenToWorld(event.clientX, event.clientY);
            if (point) {
                this.state.camera.target = [point[0], point[1] + 2, point[2]];
            }
        };
        this.onContextMenu = (event) => event.preventDefault();
        this.onPointerLeave = () => this.callbacks.onHover?.(null);
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointercancel', this.onPointerUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        this.canvas.addEventListener('dblclick', this.onDoubleClick);
        this.canvas.addEventListener('contextmenu', this.onContextMenu);
        this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    }

    unbindEvents() {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointercancel', this.onPointerUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('dblclick', this.onDoubleClick);
        this.canvas.removeEventListener('contextmenu', this.onContextMenu);
        this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width);
        const cssHeight = Math.max(1, rect.height);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, this.state.quality === 'quality' ? 2 : 1.5);
        const width = Math.max(1, Math.floor(cssWidth * pixelRatio));
        const height = Math.max(1, Math.floor(cssHeight * pixelRatio));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.viewport = { width, height, pixelRatio, cssWidth, cssHeight };
    }

    getViewProjection() {
        const aspect = this.viewport.cssWidth / Math.max(1, this.viewport.cssHeight);
        return cameraMath.viewProjection(
            this.cameraCurrent.target,
            this.cameraCurrent.azimuth,
            this.cameraCurrent.elevation,
            this.cameraCurrent.distance,
            this.state.camera.fov * Math.PI / 180,
            aspect,
            0.5,
            900,
        );
    }

    screenToWorld(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const { viewProjection } = this.getViewProjection();
        const inverse = mat4.invert(viewProjection);
        const ray = screenToRay(inverse, x, y, rect.width, rect.height);
        return rayHeightfield(ray.origin, ray.direction, (px, pz) => this.terrain.heightAt(px, pz, -1e3), { half: this.terrain.size * 0.5 }, 600);
    }

    project(point) {
        const { viewProjection } = this.getViewProjection();
        return projectToScreen(viewProjection, point, this.viewport.cssWidth, this.viewport.cssHeight);
    }

    setProbeTool(active) {
        this.probeTool = Boolean(active);
        this.canvas.style.cursor = active ? 'crosshair' : 'grab';
    }

    setCameraPreset(preset) {
        if (preset === 'top') {
            this.state.camera.azimuth = 0;
            this.state.camera.elevation = 1.45;
            this.state.camera.distance = 150;
            this.state.camera.target = [0, 0, 0];
        } else if (preset === 'front') {
            this.state.camera.azimuth = 0;
            this.state.camera.elevation = 0.16;
            this.state.camera.distance = 135;
            this.state.camera.target = [0, 7, 0];
        } else if (preset === 'iso') {
            this.state.camera.azimuth = 0.72;
            this.state.camera.elevation = 0.42;
            this.state.camera.distance = 118;
            this.state.camera.target = [0, 7, 0];
        }
    }

    refreshField() {
        this.updateStreamlines();
    }

    setTerrain(terrain) {
        this.terrain = terrain;
        this.gpuField.setTerrain(terrain);
        this.createTerrainBuffers();
        this.createWaterBuffers();
        this.createGlyphBuffers();
        this.createVegetationBuffers();
        this.createGridBuffers();
        this.refreshField();
        this.clearProbe();
    }

    setQuality(quality) {
        this.gpuField.setQuality(quality);
        this.resize();
    }

    bindFieldTextures(program) {
        const gl = this.gl;
        gl.uniform1i(program.uniform('uTerrainData'), 0);
        gl.uniform1i(program.uniform('uNoise3D'), 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.gpuField.terrainTexture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.gpuField.noiseTexture);
    }

    updateCamera(dt) {
        if (this.state.camera.autoRotate) this.state.camera.azimuth += dt * 0.12;
        const damp = 1 - Math.exp(-dt * 14);
        this.cameraCurrent.azimuth = lerp(this.cameraCurrent.azimuth, this.state.camera.azimuth, damp);
        this.cameraCurrent.elevation = lerp(this.cameraCurrent.elevation, this.state.camera.elevation, damp);
        this.cameraCurrent.distance = lerp(this.cameraCurrent.distance, this.state.camera.distance, damp);
        for (let i = 0; i < 3; i++) {
            this.cameraCurrent.target[i] = lerp(this.cameraCurrent.target[i], this.state.camera.target[i], damp);
        }
    }

    sliceBasis() {
        const slice = this.state.layers.slice;
        const size = this.terrain.size;
        const height = this.terrain.maxHeight * 2.2;
        if (slice.axis === 'x') {
            return {
                origin: [slice.offset, 0, -size * 0.5],
                u: [0, 0, size],
                v: [0, height, 0],
            };
        }
        if (slice.axis === 'z') {
            return {
                origin: [-size * 0.5, 0, slice.offset],
                u: [size, 0, 0],
                v: [0, height, 0],
            };
        }
        return {
            origin: [0, slice.offset, 0],
            u: [size, 0, 0],
            v: [0, 0, size],
        };
    }

    render(dt, time) {
        const rect = this.canvas.getBoundingClientRect();
        if (Math.abs(rect.width - this.viewport.cssWidth) > 0.5 || Math.abs(rect.height - this.viewport.cssHeight) > 0.5) {
            this.resize();
        }
        this.updateCamera(dt);
        const gl = this.gl;
        const { eye, viewProjection } = this.getViewProjection();
        const state = this.state;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.viewport.width, this.viewport.height);
        gl.clearColor(0.03, 0.04, 0.035, 1);
        gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.BLEND);
        gl.useProgram(this.programs.background.program);
        gl.uniform2f(this.programs.background.uniform('uResolution'), this.viewport.width, this.viewport.height);
        const top = hexToRgb('#111512');
        const bottom = hexToRgb('#080a09');
        gl.uniform3f(this.programs.background.uniform('uTopColor'), top[0], top[1], top[2]);
        gl.uniform3f(this.programs.background.uniform('uBottomColor'), bottom[0], bottom[1], bottom[2]);
        gl.bindVertexArray(this.fullscreenVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);

        if (state.layers.terrain.visible) {
            const palette = TERRAIN_PALETTES[state.layers.terrain.palette] || TERRAIN_PALETTES.alpine;
            const low = hexToRgb(palette.low);
            const mid = hexToRgb(palette.mid);
            const high = hexToRgb(palette.high);
            const peak = hexToRgb(palette.peak);
            const fog = hexToRgb('#0b0f0d');
            gl.useProgram(this.programs.terrain.program);
            gl.uniformMatrix4fv(this.programs.terrain.uniform('uViewProj'), false, viewProjection);
            gl.uniform3f(this.programs.terrain.uniform('uEye'), eye[0], eye[1], eye[2]);
            gl.uniform3f(this.programs.terrain.uniform('uSunDir'), SUN_DIRECTION[0], SUN_DIRECTION[1], SUN_DIRECTION[2]);
            gl.uniform1f(this.programs.terrain.uniform('uTerrainSize'), this.terrain.size);
            gl.uniform1f(this.programs.terrain.uniform('uTerrainHeight'), this.terrain.maxHeight);
            gl.uniform1f(this.programs.terrain.uniform('uSeaLevel'), state.terrain.seaLevel);
            gl.uniform1f(this.programs.terrain.uniform('uOpacity'), state.layers.terrain.opacity);
            gl.uniform1f(this.programs.terrain.uniform('uContours'), state.layers.terrain.contours ? 1 : 0);
            gl.uniform3f(this.programs.terrain.uniform('uPaletteLow'), low[0], low[1], low[2]);
            gl.uniform3f(this.programs.terrain.uniform('uPaletteMid'), mid[0], mid[1], mid[2]);
            gl.uniform3f(this.programs.terrain.uniform('uPaletteHigh'), high[0], high[1], high[2]);
            gl.uniform3f(this.programs.terrain.uniform('uPalettePeak'), peak[0], peak[1], peak[2]);
            gl.uniform3f(this.programs.terrain.uniform('uFogColor'), fog[0], fog[1], fog[2]);
            gl.uniform1f(this.programs.terrain.uniform('uFogDensity'), 0.0022);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.gpuField.terrainTexture);
            gl.uniform1i(this.programs.terrain.uniform('uTerrainData'), 0);
            gl.bindVertexArray(this.terrainVAO);
            gl.drawElements(gl.TRIANGLES, this.terrainIndexCount, gl.UNSIGNED_INT, 0);
        }

        if (state.layers.terrain.visible && state.layers.terrain.water && this.terrain.waterLevel > 0.01) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.useProgram(this.programs.water.program);
            gl.uniformMatrix4fv(this.programs.water.uniform('uViewProj'), false, viewProjection);
            gl.uniform3f(this.programs.water.uniform('uEye'), eye[0], eye[1], eye[2]);
            gl.uniform3f(this.programs.water.uniform('uSunDir'), SUN_DIRECTION[0], SUN_DIRECTION[1], SUN_DIRECTION[2]);
            gl.uniform1f(this.programs.water.uniform('uTime'), time);
            gl.uniform1f(this.programs.water.uniform('uWaterLevel'), this.terrain.waterLevel);
            gl.uniform1f(this.programs.water.uniform('uOpacity'), 0.58);
            gl.uniform1f(this.programs.water.uniform('uTerrainHeight'), this.terrain.maxHeight);
            gl.uniform1f(this.programs.water.uniform('uTerrainSize'), this.terrain.size);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.gpuField.terrainTexture);
            gl.uniform1i(this.programs.water.uniform('uTerrainData'), 0);
            gl.bindVertexArray(this.waterVAO);
            gl.drawElements(gl.TRIANGLES, this.waterIndexCount, gl.UNSIGNED_SHORT, 0);
        }

        if (state.layers.slice.visible) {
            const basis = this.sliceBasis();
            const slice = state.layers.slice;
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.useProgram(this.programs.slice.program);
            this.bindFieldTextures(this.programs.slice);
            this.gpuField.setFieldUniforms(this.programs.slice, state, time);
            gl.uniformMatrix4fv(this.programs.slice.uniform('uViewProj'), false, viewProjection);
            gl.uniform3f(this.programs.slice.uniform('uSliceOrigin'), basis.origin[0], basis.origin[1], basis.origin[2]);
            gl.uniform3f(this.programs.slice.uniform('uSliceU'), basis.u[0], basis.u[1], basis.u[2]);
            gl.uniform3f(this.programs.slice.uniform('uSliceV'), basis.v[0], basis.v[1], basis.v[2]);
            gl.uniform1f(this.programs.slice.uniform('uSliceMode'), slice.mode === 'potential' ? 1 : slice.mode === 'flow' ? 2 : 0);
            gl.uniform1f(this.programs.slice.uniform('uSliceScale'), this.gpuField.maxSpeed(state));
            gl.uniform1f(this.programs.slice.uniform('uSliceOpacity'), slice.opacity);
            gl.uniform1f(this.programs.slice.uniform('uSliceContours'), slice.contours ? 1 : 0);
            gl.uniform1f(this.programs.slice.uniform('uSliceGain'), slice.gain);
            gl.bindVertexArray(this.sliceVAO);
            gl.drawElements(gl.TRIANGLES, this.sliceIndexCount, gl.UNSIGNED_SHORT, 0);
        }

        if (state.layers.glyphs.visible) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.useProgram(this.programs.glyph.program);
            this.bindFieldTextures(this.programs.glyph);
            this.gpuField.setFieldUniforms(this.programs.glyph, state, time);
            this.gpuField.setRamp(this.programs.glyph, state.layers.glyphs.colorRamp);
            gl.uniformMatrix4fv(this.programs.glyph.uniform('uViewProj'), false, viewProjection);
            gl.uniform1f(this.programs.glyph.uniform('uGlyphScale'), state.layers.glyphs.scale);
            gl.uniform1f(this.programs.glyph.uniform('uGlyphMax'), this.gpuField.maxSpeed(state));
            gl.uniform1f(this.programs.glyph.uniform('uGlyphOpacity'), state.layers.glyphs.opacity);
            gl.bindVertexArray(this.glyphVAO);
            gl.drawArrays(gl.LINES, 0, this.glyphCount * 2);
        }

        if (state.layers.streamlines.visible && this.streamlineVertexCount > 0) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.useProgram(this.programs.streamline.program);
            gl.uniformMatrix4fv(this.programs.streamline.uniform('uViewProj'), false, viewProjection);
            gl.uniform1f(this.programs.streamline.uniform('uOpacity'), state.layers.streamlines.opacity);
            gl.bindVertexArray(this.streamlineVAO);
            gl.drawArrays(gl.LINES, 0, this.streamlineVertexCount);
        }

        this.gpuField.renderParticles(viewProjection, this.viewport, state, time);
        this.gpuField.renderRain(viewProjection, this.viewport, state, time);

        if (state.layers.vegetation.visible) {
            const wind = state.layers.wind;
            const windDir = [
                Math.cos(wind.elevation * Math.PI / 180) * Math.cos(wind.direction * Math.PI / 180),
                Math.sin(wind.elevation * Math.PI / 180),
                Math.cos(wind.elevation * Math.PI / 180) * Math.sin(wind.direction * Math.PI / 180),
            ];
            const color = hexToRgb(state.layers.vegetation.color);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.useProgram(this.programs.vegetation.program);
            gl.uniformMatrix4fv(this.programs.vegetation.uniform('uViewProj'), false, viewProjection);
            gl.uniform1f(this.programs.vegetation.uniform('uTime'), time);
            gl.uniform1f(this.programs.vegetation.uniform('uDensity'), state.layers.vegetation.density);
            gl.uniform1f(this.programs.vegetation.uniform('uHeight'), state.layers.vegetation.height);
            gl.uniform1f(this.programs.vegetation.uniform('uSway'), state.layers.vegetation.sway);
            gl.uniform1f(this.programs.vegetation.uniform('uWindSpeed'), wind.speed);
            gl.uniform3f(this.programs.vegetation.uniform('uWindDir'), windDir[0], windDir[1], windDir[2]);
            gl.uniform3f(this.programs.vegetation.uniform('uColor'), color[0], color[1], color[2]);
            gl.uniform1f(this.programs.vegetation.uniform('uOpacity'), state.layers.vegetation.opacity);
            gl.bindVertexArray(this.vegetationVAO);
            gl.drawArrays(gl.LINES, 0, this.vegetationVertexCount);
        }

        if (state.layers.grid.visible) {
            if (state.layers.grid.extent !== this.gridExtent || state.layers.grid.divisions !== this.gridDivisions) {
                this.createGridBuffers();
            }
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.useProgram(this.programs.grid.program);
            gl.uniformMatrix4fv(this.programs.grid.uniform('uViewProj'), false, viewProjection);
            gl.uniform3f(this.programs.grid.uniform('uColor'), 0.32, 0.38, 0.32);
            gl.uniform1f(this.programs.grid.uniform('uOpacity'), state.layers.grid.opacity);
            gl.uniform1f(this.programs.grid.uniform('uExtent'), state.layers.grid.extent);
            gl.bindVertexArray(this.gridVAO);
            gl.drawArrays(gl.LINES, 0, this.gridVertexCount);
        }

        if (state.layers.force.visible) {
            this.updateSourceBuffer();
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.depthMask(false);
            gl.useProgram(this.programs.source.program);
            gl.uniformMatrix4fv(this.programs.source.uniform('uViewProj'), false, viewProjection);
            gl.uniform1f(this.programs.source.uniform('uPixelRatio'), this.viewport.pixelRatio);
            gl.uniform1f(this.programs.source.uniform('uOpacity'), 0.9);
            gl.bindVertexArray(this.sourceVAO);
            gl.drawArrays(gl.POINTS, 0, this.sourceCount);
        }

        if (this.probe.valid && this.probeVertexCount > 0 && state.render.showProbe) {
            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.useProgram(this.programs.probe.program);
            gl.uniformMatrix4fv(this.programs.probe.uniform('uViewProj'), false, viewProjection);
            gl.uniform3f(this.programs.probe.uniform('uColor'), 0.91, 0.94, 0.84);
            gl.uniform1f(this.programs.probe.uniform('uOpacity'), 0.9);
            gl.bindVertexArray(this.probeVAO);
            gl.drawArrays(gl.LINES, 0, this.probeVertexCount);
        }

        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);

        const now = performance.now();
        const frameMs = now - this.lastFrame;
        this.lastFrame = now;
        this.frameStats.frameMs = lerp(this.frameStats.frameMs, frameMs, 0.08);
        this.frameStats.fps = lerp(this.frameStats.fps, 1000 / Math.max(1, frameMs), 0.08);
        return this.frameStats;
    }

    getInfo() {
        return {
            renderer: this.context.renderer,
            vendor: this.context.vendor,
            format: this.gpuField.format.label,
            particleCount: this.gpuField.particleCount,
            rainCount: this.gpuField.rainCount,
            vegetationCount: this.vegetationVertexCount / 2,
            glyphCount: this.glyphCount,
            streamlineCount: this.streamlineVertexCount / 2,
        };
    }

    screenshot() {
        this.render(0, this.state.time);
        return this.canvas.toDataURL('image/png');
    }

    dispose() {
        this.unbindEvents();
        const gl = this.gl;
        this.deleteMesh(this.terrainVAO, this.terrainBuffers);
        this.deleteMesh(this.waterVAO, this.waterBuffers);
        this.deleteMesh(this.sliceVAO, this.sliceBuffers);
        this.deleteMesh(this.glyphVAO, this.glyphBuffers);
        this.deleteMesh(this.vegetationVAO, this.vegetationBuffers);
        this.deleteMesh(this.streamlineVAO, this.streamlineBuffers);
        this.deleteMesh(this.gridVAO, this.gridBuffers);
        if (this.sourceVAO) gl.deleteVertexArray(this.sourceVAO);
        if (this.sourceBuffer) gl.deleteBuffer(this.sourceBuffer);
        if (this.probeVAO) gl.deleteVertexArray(this.probeVAO);
        if (this.probeBuffer) gl.deleteBuffer(this.probeBuffer);
        if (this.fullscreenVAO) gl.deleteVertexArray(this.fullscreenVAO);
        for (const program of Object.values(this.programs)) gl.deleteProgram(program.program);
        this.gpuField.dispose();
    }
}
