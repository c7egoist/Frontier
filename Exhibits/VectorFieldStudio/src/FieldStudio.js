/*====================================================================================================================================
                                                        FIELDSTUDIO.JS
====================================================================================================================================*/
// 🧩 Application shell: state, GPU loop, outliner, inspector, presets, persistence, and overlays.

import {
    createInitialState,
    cloneState,
    applyMode,
    sanitizeState,
    MODES,
    COLOR_RAMPS,
    PRESETS,
} from './SceneState.js';
import { createNoiseVolume } from './noise.js';
import { generateTerrain } from './terrain.js';
import { createFieldSampler, probeReadout } from './field.js';
import { SceneRenderer } from './gpu/SceneRenderer.js';
import { OutlinerSequence } from './OutlinerSequence.js';
import { InspectorPanel } from './InspectorPanel.js';
import { icon } from './IconAtlas.js';
import { mat4 } from './math.js';

const AUTOSAVE_KEY = 'frontier-field-studio-v1';
const SELECTION_LABELS = {
    scene: 'Scene',
    terrain: 'Terrain',
    wind: 'Wind field',
    force: 'Force field',
    terrainFlow: 'Terrain flow',
    precipitation: 'Precipitation',
    vegetation: 'Vegetation',
    slice: 'Slice plane',
    glyphs: 'Field glyphs',
    streamlines: 'Streamlines',
    grid: 'Ground grid',
    probe: 'Probe',
};

export class FieldStudio {
    constructor() {
        this.state = createInitialState();
        this.noise = createNoiseVolume(64);
        this.terrain = generateTerrain(this.state.terrain);
        this.canvas = document.getElementById('glCanvas');
        this.renderer = new SceneRenderer(this.canvas, this.state, this.noise, this.terrain, {
            onProbe: (point) => this.placeProbe(point),
            onHover: (point) => this.updateHover(point),
        });
        this.outliner = new OutlinerSequence(document.getElementById('outlinerTree'), this.state, {
            onSelect: (id) => this.selectNode(id),
            onToggleVisibility: (id, visible) => this.toggleVisibility(id, visible),
        });
        this.outliner.attachSearch(document.getElementById('searchInput'));
        this.inspector = new InspectorPanel(document.getElementById('inspectorBody'), this.state, {
            onChange: (path, value) => this.onInspectorChange(path, value),
            onAction: (action) => this.onAction(action),
            onSelect: (id) => this.selectNode(id),
            onPreset: (id) => this.applyPreset(id),
        });
        this.fieldSampler = createFieldSampler(this.state, this.terrain, this.noise);
        this.analysis = {};
        this.probeData = null;
        this.info = this.renderer.getInfo();
        this.inspector.setInfo(this.info);
        this.simTime = 0;
        this.accumulator = 0;
        this.lastTime = performance.now();
        this.lastStats = 0;
        this.lastAnalysis = 0;
        this.frameHandle = null;
        this.terrainTimer = null;
        this.fieldTimer = null;
        this.saveTimer = null;
        this.toastTimer = null;
        this.bindUI();
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.updateAnalysis();
        this.updateProbeReadout();
        this.resizeObserver = new ResizeObserver(() => this.renderer.resize());
        this.resizeObserver.observe(document.getElementById('viewport'));
        this.startLoop();
        this.loadAutosave();
        window.setTimeout(() => document.getElementById('loading').classList.add('hidden'), 320);
    }

    bindUI() {
        const $ = (id) => document.getElementById(id);
        this.playButton = $('playButton');
        this.resetCameraButton = $('resetCameraButton');
        this.saveButton = $('saveButton');
        this.openButton = $('openButton');
        this.screenshotButton = $('screenshotButton');
        this.helpButton = $('helpButton');
        this.toggleOutlinerButton = $('toggleOutlinerButton');
        this.toggleInspectorButton = $('toggleInspectorButton');
        this.addSourceButton = $('addSourceButton');
        this.probeToolButton = $('probeToolButton');
        this.autoRotateButton = $('autoRotateButton');
        this.vpModeLabel = $('vpModeLabel');
        this.vpDescription = $('vpDescription');
        this.legend = $('legend');
        this.legendTitle = $('legendTitle');
        this.legendUnit = $('legendUnit');
        this.legendMin = $('legendMin');
        this.legendMax = $('legendMax');
        this.legendBar = $('legendBar');
        this.statsOverlay = $('statsOverlay');
        this.statFps = $('statFps');
        this.statFrame = $('statFrame');
        this.statParticles = $('statParticles');
        this.statusRenderer = $('statusRenderer');
        this.statusFormat = $('statusFormat');
        this.statusParticles = $('statusParticles');
        this.statusFps = $('statusFps');
        this.statusQuality = $('statusQuality');
        this.statusCursor = $('statusCursor');
        this.inspectorType = $('inspectorType');
        this.probeLabel = $('probeLabel');
        this.hoverReadout = $('hoverReadout');
        this.axisGizmo = $('axisGizmo');
        this.toast = $('toast');
        this.helpModal = $('helpModal');
        this.fileInput = $('fileInput');

        this.playButton.innerHTML = icon('pause', 15);
        this.resetCameraButton.innerHTML = icon('reset', 15);
        this.saveButton.innerHTML = icon('save', 15);
        this.openButton.innerHTML = icon('open', 15);
        this.screenshotButton.innerHTML = icon('camera', 15);
        this.helpButton.innerHTML = icon('help', 15);
        this.toggleOutlinerButton.innerHTML = icon('panelLeft', 14);
        this.toggleInspectorButton.innerHTML = icon('panelRight', 14);
        this.addSourceButton.innerHTML = icon('plus', 13);
        this.probeToolButton.innerHTML = `${icon('probe', 12)}<span>Probe</span>`;
        this.autoRotateButton.innerHTML = `${icon('rotate', 12)}<span>Orbit</span>`;
        const searchIcon = document.querySelector('.search-icon');
        if (searchIcon) searchIcon.innerHTML = icon('search', 13);
        const closeHelp = $('closeHelpButton');
        if (closeHelp) closeHelp.innerHTML = icon('close', 14);

        document.querySelectorAll('.mode-tab').forEach((tab) => {
            const mode = tab.dataset.mode;
            tab.innerHTML = `${icon(mode === 'wind' ? 'wind' : mode === 'force' ? 'force' : 'terrain', 13)}<span>${MODES[mode].label}</span>`;
            tab.addEventListener('click', () => this.setMode(mode));
        });
        document.querySelectorAll('[data-camera]').forEach((button) => {
            button.addEventListener('click', () => {
                this.renderer.setCameraPreset(button.dataset.camera);
                this.showToast(`${button.dataset.camera.toUpperCase()} view`);
            });
        });

        this.playButton.addEventListener('click', () => this.togglePlay());
        this.resetCameraButton.addEventListener('click', () => {
            this.renderer.setCameraPreset('iso');
            this.state.camera.autoRotate = false;
            this.syncUI();
            this.showToast('Camera reset');
        });
        this.saveButton.addEventListener('click', () => this.saveScene());
        this.openButton.addEventListener('click', () => this.fileInput.click());
        this.screenshotButton.addEventListener('click', () => this.screenshot());
        this.helpButton.addEventListener('click', () => this.openHelp());
        this.fileInput.addEventListener('change', async () => {
            const file = this.fileInput.files && this.fileInput.files[0];
            if (file) await this.loadScene(file);
            this.fileInput.value = '';
        });
        this.probeToolButton.addEventListener('click', () => this.toggleProbeTool());
        this.autoRotateButton.addEventListener('click', () => {
            this.state.camera.autoRotate = !this.state.camera.autoRotate;
            this.syncUI();
            this.scheduleSave();
        });
        this.addSourceButton.addEventListener('click', () => this.addSource());
        this.toggleOutlinerButton.addEventListener('click', () => {
            const app = document.getElementById('app');
            if (window.innerWidth > 980) app.classList.toggle('hide-outliner');
            else app.classList.toggle('show-outliner');
        });
        this.toggleInspectorButton.addEventListener('click', () => {
            const app = document.getElementById('app');
            if (window.innerWidth > 760) app.classList.toggle('hide-inspector');
            else app.classList.toggle('show-inspector');
        });
        if (closeHelp) closeHelp.addEventListener('click', () => this.closeHelp());
        this.helpModal.addEventListener('click', (event) => {
            if (event.target === this.helpModal) this.closeHelp();
        });
        window.addEventListener('keydown', (event) => this.onKeyDown(event));
        window.addEventListener('resize', () => this.renderer.resize());
        window.addEventListener('beforeunload', () => this.scheduleSaveNow());
    }

    startLoop() {
        const loop = (now) => {
            const frameDt = Math.min(0.1, Math.max(0.0001, (now - this.lastTime) / 1000));
            this.lastTime = now;
            if (this.state.playing) {
                this.accumulator += frameDt * this.state.timeScale;
                const step = 1 / 60;
                let steps = 0;
                while (this.accumulator >= step && steps < 3) {
                    this.simTime += step;
                    this.state.time = this.simTime;
                    this.renderer.gpuField.update(step, this.state, this.simTime);
                    this.accumulator -= step;
                    steps++;
                }
            } else {
                this.accumulator = 0;
                this.state.time = this.simTime;
            }
            this.renderer.render(frameDt, this.simTime);
            this.updateStats(now);
            this.updateAxisGizmo();
            this.updateProbeLabel();
            if (now - this.lastAnalysis > 500) {
                this.lastAnalysis = now;
                this.updateAnalysis();
            }
            this.frameHandle = requestAnimationFrame(loop);
        };
        this.frameHandle = requestAnimationFrame(loop);
    }

    setMode(mode) {
        if (!MODES[mode]) return;
        applyMode(this.state, mode);
        this.state.selected = mode;
        this.renderer.refreshField();
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.updateAnalysis();
        this.updateProbeReadout();
        this.scheduleSave();
    }

    selectNode(id) {
        if (id === 'wind' || id === 'force' || id === 'terrainFlow') {
            const mode = id === 'terrainFlow' ? 'terrain' : id;
            if (this.state.mode !== mode) {
                applyMode(this.state, mode);
                this.renderer.refreshField();
                this.updateAnalysis();
            }
            this.state.selected = id;
        } else {
            this.state.selected = id;
        }
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.scheduleSave();
    }

    toggleVisibility(id, visible) {
        if (id === 'scene') return;
        if (id === 'wind' || id === 'force' || id === 'terrainFlow') {
            const mode = id === 'terrainFlow' ? 'terrain' : id;
            if (this.state.mode !== mode) {
                applyMode(this.state, mode);
                this.state.selected = id;
                this.renderer.refreshField();
                this.updateAnalysis();
            }
            this.state.layers[id].visible = visible;
        } else if (id === 'probe') {
            this.state.layers.probe.active = visible;
            this.renderer.setProbeTool(visible);
        } else if (this.state.layers.force.sources.some((source) => source.id === id)) {
            const source = this.state.layers.force.sources.find((entry) => entry.id === id);
            if (source) source.enabled = visible;
            this.renderer.refreshField();
            this.updateAnalysis();
        } else if (this.state.layers[id]) {
            this.state.layers[id].visible = visible;
        }
        this.outliner.render();
        this.syncUI();
        this.scheduleSave();
    }

    onInspectorChange(path, value) {
        if (path.startsWith('terrain.')) {
            this.scheduleTerrainRebuild();
        } else if (path === 'quality') {
            this.renderer.setQuality(value);
            this.info = this.renderer.getInfo();
            this.inspector.setInfo(this.info);
        } else if (path === 'playing') {
            this.syncUI();
        } else if (path === 'layers.probe.active') {
            this.renderer.setProbeTool(value);
        } else if (path.startsWith('layers.force') || path.startsWith('layers.streamlines') || path.startsWith('layers.wind') || path.startsWith('layers.terrainFlow')) {
            this.scheduleFieldRefresh();
        }
        if (path.startsWith('layers.force.sources')) this.outliner.render();
        this.syncUI();
        this.scheduleSave();
    }

    scheduleTerrainRebuild() {
        if (this.terrainTimer) clearTimeout(this.terrainTimer);
        this.terrainTimer = setTimeout(() => {
            this.terrainTimer = null;
            this.terrain = generateTerrain(this.state.terrain);
            this.renderer.setTerrain(this.terrain);
            this.state.layers.probe.valid = false;
            this.state.layers.probe.active = false;
            this.renderer.setProbeTool(false);
            this.updateAnalysis();
            this.updateProbeReadout();
            this.scheduleSave();
        }, 140);
    }

    scheduleFieldRefresh() {
        if (this.fieldTimer) clearTimeout(this.fieldTimer);
        this.fieldTimer = setTimeout(() => {
            this.fieldTimer = null;
            this.renderer.refreshField();
            this.updateAnalysis();
            this.updateProbeReadout();
            this.scheduleSave();
        }, 90);
    }

    scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.scheduleSaveNow(), 500);
    }

    scheduleSaveNow() {
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.state));
        } catch (error) {
            /* Storage may be unavailable or full; the scene remains in memory. */
        }
    }

    loadAutosave() {
        try {
            const raw = localStorage.getItem(AUTOSAVE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const loaded = sanitizeState(parsed);
            this.mutateState(loaded);
            this.terrain = generateTerrain(this.state.terrain);
            this.renderer.setTerrain(this.terrain);
            this.renderer.setQuality(this.state.quality);
            this.renderer.setProbeTool(this.state.layers.probe.active);
            this.outliner.render();
            this.inspector.render();
            this.syncUI();
            this.updateAnalysis();
            this.updateProbeReadout();
            this.showToast('Restored local scene');
        } catch (error) {
            console.warn('Autosave restore failed', error);
        }
    }

    saveScene() {
        const payload = JSON.stringify({ app: 'frontier-field-studio', version: 1, state: this.state }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'frontier-field-studio.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.showToast('Scene saved');
    }

    async loadScene(file) {
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const loaded = sanitizeState(parsed.state || parsed);
            this.mutateState(loaded);
            this.terrain = generateTerrain(this.state.terrain);
            this.renderer.setTerrain(this.terrain);
            this.renderer.setQuality(this.state.quality);
            this.renderer.setProbeTool(this.state.layers.probe.active);
            this.outliner.render();
            this.inspector.render();
            this.syncUI();
            this.updateAnalysis();
            this.updateProbeReadout();
            this.scheduleSaveNow();
            this.showToast('Scene loaded');
        } catch (error) {
            console.warn('Scene load failed', error);
            this.showToast('Could not read that scene file');
        }
    }

    resetScene() {
        const initial = createInitialState();
        this.mutateState(initial);
        this.terrain = generateTerrain(this.state.terrain);
        this.renderer.setTerrain(this.terrain);
        this.renderer.setQuality(this.state.quality);
        this.renderer.gpuField.reset();
        this.renderer.setProbeTool(false);
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.updateAnalysis();
        this.updateProbeReadout();
        this.scheduleSaveNow();
        this.showToast('Scene reset');
    }

    applyPreset(id) {
        const preset = PRESETS.find((entry) => entry.id === id);
        if (!preset) return;
        const draft = cloneState(this.state);
        preset.apply(draft);
        this.mutateState(draft);
        this.terrain = generateTerrain(this.state.terrain);
        this.renderer.setTerrain(this.terrain);
        this.renderer.setQuality(this.state.quality);
        this.renderer.gpuField.reset();
        this.state.layers.probe.valid = false;
        this.state.layers.probe.active = false;
        this.renderer.setProbeTool(false);
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.updateAnalysis();
        this.updateProbeReadout();
        this.scheduleSaveNow();
        this.showToast(`Preset · ${preset.label}`);
    }

    addSource() {
        if (this.state.mode !== 'force') {
            applyMode(this.state, 'force');
        }
        const sources = this.state.layers.force.sources;
        const source = {
            id: `source-${Date.now()}`,
            label: `Source ${sources.length + 1}`,
            kind: 'attractor',
            position: [0, 16, 0],
            strength: 1,
            radius: 14,
            enabled: true,
        };
        sources.push(source);
        this.state.selected = source.id;
        this.renderer.refreshField();
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.updateAnalysis();
        this.scheduleSave();
        this.showToast('Force source added');
    }

    duplicateSource() {
        const sources = this.state.layers.force.sources;
        const index = sources.findIndex((source) => source.id === this.state.selected);
        if (index < 0) return;
        const clone = {
            ...sources[index],
            id: `source-${Date.now()}`,
            label: `${sources[index].label} copy`,
            position: [...sources[index].position],
            enabled: true,
        };
        sources.splice(index + 1, 0, clone);
        this.state.selected = clone.id;
        this.renderer.refreshField();
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.updateAnalysis();
        this.scheduleSave();
        this.showToast('Source duplicated');
    }

    deleteSource() {
        const sources = this.state.layers.force.sources;
        const index = sources.findIndex((source) => source.id === this.state.selected);
        if (index < 0) return;
        sources.splice(index, 1);
        this.state.selected = 'force';
        this.renderer.refreshField();
        this.outliner.render();
        this.inspector.render();
        this.syncUI();
        this.updateAnalysis();
        this.scheduleSave();
        this.showToast('Source deleted');
    }

    placeProbe(point) {
        this.state.layers.probe.position = [point[0], point[1], point[2]];
        this.state.layers.probe.valid = true;
        this.updateProbeReadout();
        this.scheduleSave();
    }

    clearProbe() {
        this.state.layers.probe.valid = false;
        this.state.layers.probe.active = false;
        this.renderer.clearProbe();
        this.renderer.setProbeTool(false);
        this.probeData = null;
        this.inspector.setProbeData(null);
        this.syncUI();
        this.scheduleSave();
    }

    toggleProbeTool() {
        this.state.layers.probe.active = !this.state.layers.probe.active;
        this.renderer.setProbeTool(this.state.layers.probe.active);
        this.syncUI();
        this.scheduleSave();
        if (this.state.layers.probe.active) this.showToast('Probe tool · click the terrain');
    }

    togglePlay() {
        this.state.playing = !this.state.playing;
        this.syncUI();
        this.scheduleSave();
    }

    onAction(action) {
        if (action === 'reset-scene') this.resetScene();
        else if (action === 'save-scene') this.saveScene();
        else if (action === 'open-scene') this.fileInput.click();
        else if (action === 'add-source') this.addSource();
        else if (action === 'duplicate-source') this.duplicateSource();
        else if (action === 'delete-source') this.deleteSource();
        else if (action === 'clear-probe') this.clearProbe();
    }

    onKeyDown(event) {
        if (event.target && event.target.matches && event.target.matches('input, select, textarea')) return;
        if (event.key === ' ') {
            event.preventDefault();
            this.togglePlay();
        } else if (event.key === '1') {
            this.setMode('wind');
        } else if (event.key === '2') {
            this.setMode('force');
        } else if (event.key === '3') {
            this.setMode('terrain');
        } else if (event.key === 'r' || event.key === 'R') {
            this.renderer.setCameraPreset('iso');
            this.state.camera.autoRotate = false;
            this.syncUI();
            this.showToast('Camera reset');
        } else if (event.key === 's' || event.key === 'S') {
            this.screenshot();
        } else if (event.key === 'p' || event.key === 'P') {
            this.toggleProbeTool();
        } else if (event.key === 'g' || event.key === 'G') {
            this.state.layers.grid.visible = !this.state.layers.grid.visible;
            this.outliner.render();
            this.syncUI();
            this.scheduleSave();
        } else if (event.key === '?') {
            this.openHelp();
        } else if (event.key === 'Escape') {
            this.closeHelp();
        }
    }

    updateAnalysis() {
        this.fieldSampler = createFieldSampler(this.state, this.terrain, this.noise);
        const statistics = this.fieldSampler.statistics(3200);
        const profile = this.state.mode === 'wind' ? this.fieldSampler.verticalProfile(28) : [];
        let flowCount = 0;
        for (const value of this.terrain.flow) if (value > 0.6) flowCount++;
        const flowChannels = (flowCount / this.terrain.flow.length) * 100;
        let vegetationSum = 0;
        for (const value of this.terrain.vegetation) vegetationSum += value;
        const vegetationCover = vegetationSum / this.terrain.vegetation.length;
        this.analysis = {
            statistics,
            profile,
            mean: statistics.mean,
            p95: statistics.p95,
            max: statistics.max,
            flowChannels,
            vegetationCover,
            waterLevel: this.terrain.waterLevel,
            accent: MODES[this.state.mode].accent,
        };
        this.info = this.renderer.getInfo();
        this.inspector.setAnalysis(this.analysis);
        this.inspector.setInfo(this.info);
        this.syncUI();
        this.updateProbeReadout();
    }

    updateProbeReadout() {
        if (this.state.layers.probe.valid) {
            const readout = probeReadout(this.state, this.terrain, this.noise, this.state.layers.probe.position);
            readout.valid = true;
            this.probeData = readout;
            this.inspector.setProbeData(readout);
        } else {
            this.probeData = null;
            this.inspector.setProbeData(null);
        }
        this.updateProbeLabel();
    }

    updateProbeLabel() {
        if (!this.probeData || !this.probeData.valid || !this.state.render.showProbe) {
            this.probeLabel.classList.add('hidden');
            return;
        }
        const screen = this.renderer.project([this.probeData.position[0], this.probeData.ground + 8, this.probeData.position[2]]);
        if (!screen || screen.x < 0 || screen.y < 0 || screen.x > this.renderer.viewport.cssWidth || screen.y > this.renderer.viewport.cssHeight) {
            this.probeLabel.classList.add('hidden');
            return;
        }
        this.probeLabel.style.left = `${screen.x}px`;
        this.probeLabel.style.top = `${screen.y}px`;
        this.probeLabel.textContent = `X ${this.probeData.position[0].toFixed(1)}  Y ${this.probeData.ground.toFixed(1)}  Z ${this.probeData.position[2].toFixed(1)}  ·  |v| ${this.probeData.magnitude.toFixed(2)}`;
        this.probeLabel.classList.remove('hidden');
    }

    updateHover(point) {
        if (point) {
            this.statusCursor.textContent = `X ${point[0].toFixed(1)}  Y ${point[1].toFixed(1)}  Z ${point[2].toFixed(1)}`;
            if (this.fieldSampler) {
                const sample = this.fieldSampler.sample(point);
                this.hoverReadout.textContent = `|v| ${sample.magnitude.toFixed(2)} u  ·  ${MODES[this.state.mode].label.toLowerCase()}`;
            }
        } else {
            this.statusCursor.textContent = 'X —  Y —  Z —';
            this.hoverReadout.textContent = '';
        }
    }

    updateStats(now) {
        if (now - this.lastStats < 250) return;
        this.lastStats = now;
        const stats = this.renderer.frameStats;
        this.statFps.textContent = String(Math.round(stats.fps));
        this.statFrame.textContent = `${stats.frameMs.toFixed(1)} ms`;
        this.statusFps.textContent = `${Math.round(stats.fps)} fps`;
    }

    updateAxisGizmo() {
        const canvas = this.axisGizmo;
        if (!canvas || this.state.render.showGizmo === false) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const size = 92;
        if (canvas.width !== Math.floor(size * ratio)) {
            canvas.width = Math.floor(size * ratio);
            canvas.height = Math.floor(size * ratio);
        }
        const context = canvas.getContext('2d');
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, size, size);
        const { view } = this.renderer.getViewProjection();
        const axes = [
            { key: 'X', dir: [1, 0, 0], color: '#c96a6a' },
            { key: 'Y', dir: [0, 1, 0], color: '#a9bd9c' },
            { key: 'Z', dir: [0, 0, 1], color: '#7f9fc9' },
        ].map((axis) => {
            const projected = mat4.transformDirection(view, axis.dir);
            return { ...axis, projected };
        }).sort((a, b) => a.projected[2] - b.projected[2]);
        const cx = size / 2;
        const cy = size / 2;
        context.strokeStyle = 'rgba(255,255,255,0.08)';
        context.beginPath();
        context.arc(cx, cy, 30, 0, Math.PI * 2);
        context.stroke();
        for (const axis of axes) {
            const x = cx + axis.projected[0] * 27;
            const y = cy - axis.projected[1] * 27;
            context.strokeStyle = axis.color;
            context.fillStyle = axis.color;
            context.lineWidth = 1.4;
            context.beginPath();
            context.moveTo(cx, cy);
            context.lineTo(x, y);
            context.stroke();
            context.beginPath();
            context.arc(x, y, 2, 0, Math.PI * 2);
            context.fill();
            context.font = '8px system-ui, sans-serif';
            context.fillText(axis.key, x + (x >= cx ? 4 : -8), y + (y >= cy ? 8 : -3));
        }
        context.fillStyle = 'rgba(230,230,220,0.7)';
        context.beginPath();
        context.arc(cx, cy, 1.5, 0, Math.PI * 2);
        context.fill();
    }

    syncUI() {
        document.querySelectorAll('.mode-tab').forEach((tab) => {
            tab.setAttribute('aria-selected', tab.dataset.mode === this.state.mode ? 'true' : 'false');
        });
        this.playButton.innerHTML = icon(this.state.playing ? 'pause' : 'play', 15);
        this.playButton.title = this.state.playing ? 'Pause (Space)' : 'Play (Space)';
        this.probeToolButton.classList.toggle('active', this.state.layers.probe.active);
        this.autoRotateButton.classList.toggle('active', this.state.camera.autoRotate);
        this.vpModeLabel.textContent = MODES[this.state.mode].label;
        this.vpDescription.textContent = MODES[this.state.mode].description;
        this.inspectorType.textContent = this.selectedLabel();
        this.statsOverlay.classList.toggle('hidden', !this.state.render.showStats);
        this.legend.classList.toggle('hidden', !this.state.render.showLegend);
        this.axisGizmo.classList.toggle('hidden', !this.state.render.showGizmo);
        this.statusQuality.textContent = this.state.quality.charAt(0).toUpperCase() + this.state.quality.slice(1);
        this.statusRenderer.textContent = this.info.renderer || 'WebGL2';
        this.statusFormat.textContent = this.info.format || '—';
        this.statusParticles.textContent = `${(this.info.particleCount || 0).toLocaleString()} particles`;
        this.statParticles.textContent = (this.info.particleCount || 0).toLocaleString();
        this.updateLegend();
        this.updateProbeLabel();
    }

    selectedLabel() {
        if (this.state.layers.force.sources.some((source) => source.id === this.state.selected)) return 'Force source';
        return SELECTION_LABELS[this.state.selected] || 'Scene';
    }

    updateLegend() {
        const mode = this.state.mode;
        let title = 'Wind speed';
        let unit = 'm/s';
        let min = 0;
        let max = this.renderer.gpuField.maxSpeed(this.state);
        let rampKey = this.state.layers.wind.colorRamp;
        if (mode === 'force') {
            title = 'Field magnitude';
            unit = 'u';
            rampKey = this.state.layers.force.colorRamp;
        } else if (mode === 'terrain') {
            title = 'Flow accumulation';
            unit = '';
            min = 0;
            max = 1;
            rampKey = this.state.layers.terrainFlow.colorRamp;
        }
        this.legendTitle.textContent = title;
        this.legendUnit.textContent = unit;
        this.legendMin.textContent = min.toFixed(mode === 'terrain' ? 1 : 0);
        this.legendMax.textContent = max.toFixed(mode === 'terrain' ? 1 : 0);
        const ramp = COLOR_RAMPS[rampKey] || COLOR_RAMPS.sage;
        this.legendBar.style.background = `linear-gradient(90deg, ${ramp.join(', ')})`;
    }

    mutateState(nextState) {
        const current = this.state;
        for (const key of Object.keys(current)) delete current[key];
        Object.assign(current, nextState);
    }

    screenshot() {
        const dataUrl = this.renderer.screenshot();
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `frontier-field-${Date.now()}.png`;
        link.click();
        this.showToast('Screenshot saved');
    }

    openHelp() {
        this.helpModal.classList.remove('hidden');
        const close = document.getElementById('closeHelpButton');
        if (close) close.focus();
    }

    closeHelp() {
        this.helpModal.classList.add('hidden');
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('visible');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.toast.classList.remove('visible'), 2200);
    }

    dispose() {
        if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.terrainTimer) clearTimeout(this.terrainTimer);
        if (this.fieldTimer) clearTimeout(this.fieldTimer);
        if (this.saveTimer) clearTimeout(this.saveTimer);
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.renderer.dispose();
    }
}

try {
    const studio = new FieldStudio();
    window.fieldStudio = studio;
} catch (error) {
    console.error(error);
    console.error(error && error.stack ? error.stack : String(error));
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('hidden');
    const glError = document.getElementById('glError');
    if (glError) glError.classList.remove('hidden');
    const glErrorText = document.getElementById('glErrorText');
    if (glErrorText) glErrorText.textContent = error && error.message ? error.message : String(error);
}
