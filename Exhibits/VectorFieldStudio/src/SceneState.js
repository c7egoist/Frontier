/*====================================================================================================================================
                                                        SCENESTATE.JS
====================================================================================================================================*/
// 🧩 Scene parameters, mode presets, and serialisable analysis state.

export const MODES = {
    wind: {
        id: 'wind',
        label: 'Wind',
        accent: '#7fc8b0',
        description: 'Air advection, turbulence, and terrain deflection',
    },
    force: {
        id: 'force',
        label: 'Force',
        accent: '#d9a06a',
        description: 'Attractors, repulsors, vortices, and equipotential slices',
    },
    terrain: {
        id: 'terrain',
        label: 'Terrain',
        accent: '#a9bd9c',
        description: 'Rain, flow accumulation, and vegetation response',
    },
};

export const COLOR_RAMPS = {
    sage: ['#12303a', '#1f6f78', '#5fb39a', '#cfe3b4', '#f4f1d6'],
    ember: ['#2a1630', '#6d2f55', '#b8553f', '#e0a05a', '#f6e3b4'],
    ice: ['#0e1a2e', '#1f3f6e', '#3f7fa8', '#8fc7cf', '#e6f4f2'],
    moss: ['#14231a', '#2f5a34', '#6f9a4f', '#b9c98a', '#eef0cf'],
};

export const TERRAIN_PALETTES = {
    alpine: {
        label: 'Alpine',
        low: '#8f8a6a',
        mid: '#5f7350',
        high: '#8a8a80',
        peak: '#d8d8cc',
    },
    arid: {
        label: 'Arid',
        low: '#b09a72',
        mid: '#8a7350',
        high: '#9a7a5a',
        peak: '#d8c8a8',
    },
    boreal: {
        label: 'Boreal',
        low: '#6f7a5a',
        mid: '#3f5a3f',
        high: '#6a6a60',
        peak: '#c8d0c8',
    },
};

export function createInitialState() {
    return {
        version: 1,
        mode: 'wind',
        playing: true,
        time: 0,
        timeScale: 1,
        quality: 'balanced',
        selected: 'wind',
        camera: {
            azimuth: 0.72,
            elevation: 0.42,
            distance: 118,
            target: [0, 7, 0],
            autoRotate: false,
            fov: 45,
        },
        terrain: {
            seed: 7,
            size: 120,
            maxHeight: 18,
            octaves: 5,
            frequency: 1.7,
            ridge: 0.35,
            seaLevel: 0.22,
        },
        layers: {
            terrain: {
                visible: true,
                opacity: 1,
                contours: true,
                wireframe: false,
                water: true,
                palette: 'alpine',
            },
            wind: {
                visible: true,
                speed: 16,
                direction: 38,
                elevation: 14,
                turbulence: 1.1,
                curlScale: 0.035,
                lift: 0.9,
                terrainCoupling: 0.55,
                life: 7,
                streak: 4,
                width: 1.5,
                opacity: 0.9,
                colorRamp: 'sage',
            },
            force: {
                visible: false,
                background: [0.15, 0.05, 0.0],
                strength: 1,
                radius: 18,
                falloff: 1.8,
                life: 8,
                streak: 3,
                width: 1.4,
                opacity: 0.9,
                colorRamp: 'ember',
                sources: [
                    {
                        id: 'source-attractor',
                        label: 'Attractor A',
                        kind: 'attractor',
                        position: [-22, 16, 0],
                        strength: 1.2,
                        radius: 16,
                        enabled: true,
                    },
                    {
                        id: 'source-repulsor',
                        label: 'Repulsor B',
                        kind: 'repulsor',
                        position: [22, 12, 8],
                        strength: 1,
                        radius: 14,
                        enabled: true,
                    },
                    {
                        id: 'source-vortex',
                        label: 'Vortex C',
                        kind: 'vortex',
                        position: [0, 26, -18],
                        strength: 1.4,
                        radius: 20,
                        enabled: true,
                    },
                ],
            },
            terrainFlow: {
                visible: false,
                speed: 1,
                turbulence: 0.6,
                life: 9,
                streak: 3,
                width: 1.4,
                opacity: 0.85,
                colorRamp: 'moss',
            },
            precipitation: {
                visible: false,
                intensity: 0.6,
                fallSpeed: 26,
                windCoupling: 0.65,
                streak: 2.2,
                width: 1,
                opacity: 0.55,
                color: '#9fc6d8',
            },
            vegetation: {
                visible: true,
                density: 0.55,
                height: 1.5,
                sway: 0.6,
                opacity: 0.9,
                color: '#7fa86a',
            },
            slice: {
                visible: false,
                axis: 'y',
                offset: 16,
                opacity: 0.55,
                mode: 'magnitude',
                contours: true,
                gain: 1,
            },
            glyphs: {
                visible: false,
                scale: 2.2,
                opacity: 0.5,
                colorRamp: 'sage',
            },
            streamlines: {
                visible: false,
                count: 48,
                steps: 110,
                opacity: 0.65,
            },
            grid: {
                visible: false,
                extent: 120,
                divisions: 24,
                opacity: 0.3,
            },
            probe: {
                active: false,
                position: [0, 0, 0],
                valid: false,
            },
        },
        render: {
            showStats: true,
            showLegend: true,
            showGizmo: true,
            showProbe: true,
            exposure: 1,
        },
    };
}

export function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
}

export function applyMode(state, mode) {
    if (!MODES[mode]) return state;
    state.mode = mode;
    state.selected = mode;
    if (mode === 'wind') {
        state.layers.wind.visible = true;
        state.layers.terrain.visible = true;
        state.layers.vegetation.visible = true;
        state.layers.precipitation.visible = false;
        state.layers.slice.visible = false;
        state.layers.glyphs.visible = false;
        state.layers.streamlines.visible = false;
    } else if (mode === 'force') {
        state.layers.force.visible = true;
        state.layers.terrain.visible = true;
        state.layers.vegetation.visible = false;
        state.layers.precipitation.visible = false;
        state.layers.slice.visible = true;
        state.layers.glyphs.visible = true;
        state.layers.streamlines.visible = true;
    } else if (mode === 'terrain') {
        state.layers.terrainFlow.visible = true;
        state.layers.terrain.visible = true;
        state.layers.vegetation.visible = true;
        state.layers.precipitation.visible = true;
        state.layers.slice.visible = false;
        state.layers.glyphs.visible = false;
        state.layers.streamlines.visible = false;
    }
    return state;
}

export function mergeState(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    for (const key of Object.keys(patch)) {
        const value = patch[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (!base[key] || typeof base[key] !== 'object') base[key] = {};
            mergeState(base[key], value);
        } else if (value !== undefined) {
            base[key] = value;
        }
    }
    return base;
}

export function sanitizeState(state) {
    const initial = createInitialState();
    const merged = mergeState(initial, state);
    merged.mode = MODES[merged.mode] ? merged.mode : 'wind';
    merged.quality = ['performance', 'balanced', 'quality'].includes(merged.quality) ? merged.quality : 'balanced';
    merged.camera.elevation = Math.min(1.45, Math.max(0.05, merged.camera.elevation));
    merged.camera.distance = Math.min(420, Math.max(18, merged.camera.distance));
    merged.terrain.size = Math.min(240, Math.max(60, merged.terrain.size));
    merged.terrain.maxHeight = Math.min(40, Math.max(6, merged.terrain.maxHeight));
    merged.terrain.seaLevel = Math.min(0.55, Math.max(0, merged.terrain.seaLevel));
    if (!Array.isArray(merged.layers.force.sources)) {
        merged.layers.force.sources = initial.layers.force.sources;
    }
    merged.layers.force.sources = merged.layers.force.sources.slice(0, 8).map((source, index) => ({
        id: source.id || `source-${index}`,
        label: source.label || `Source ${index + 1}`,
        kind: ['attractor', 'repulsor', 'vortex'].includes(source.kind) ? source.kind : 'attractor',
        position: Array.isArray(source.position) && source.position.length === 3 ? source.position.map(Number) : [0, 12, 0],
        strength: Number.isFinite(source.strength) ? source.strength : 1,
        radius: Number.isFinite(source.radius) ? source.radius : 14,
        enabled: source.enabled !== false,
    }));
    return merged;
}

export const PRESETS = [
    {
        id: 'alpine-wind',
        label: 'Alpine Wind',
        description: 'Steady cross-ridge flow with terrain deflection',
        apply(state) {
            applyMode(state, 'wind');
            Object.assign(state.terrain, { seed: 7, seaLevel: 0.22, octaves: 5, frequency: 1.7, ridge: 0.35 });
            Object.assign(state.layers.wind, {
                speed: 16,
                direction: 38,
                elevation: 14,
                turbulence: 1.1,
                curlScale: 0.035,
                lift: 0.9,
                terrainCoupling: 0.55,
                life: 7,
                streak: 4,
                opacity: 0.9,
                colorRamp: 'sage',
            });
            Object.assign(state.layers.vegetation, { density: 0.55, height: 1.5, sway: 0.6 });
            state.layers.precipitation.visible = false;
        },
    },
    {
        id: 'storm-cell',
        label: 'Storm Cell',
        description: 'High turbulence, driving rain, and a dark boundary layer',
        apply(state) {
            applyMode(state, 'wind');
            Object.assign(state.terrain, { seed: 19, seaLevel: 0.28, octaves: 6, frequency: 2.1, ridge: 0.5 });
            Object.assign(state.layers.wind, {
                speed: 30,
                direction: 122,
                elevation: 22,
                turbulence: 2.2,
                curlScale: 0.05,
                lift: 1.4,
                terrainCoupling: 0.8,
                life: 8,
                streak: 6,
                opacity: 0.95,
                colorRamp: 'ice',
            });
            Object.assign(state.layers.precipitation, { visible: true, intensity: 0.9, fallSpeed: 34, windCoupling: 0.9, opacity: 0.7 });
            Object.assign(state.layers.vegetation, { density: 0.4, height: 1.2, sway: 1.1 });
        },
    },
    {
        id: 'valley-rain',
        label: 'Valley Rain',
        description: 'Surface flow accumulation, channel rain, and riparian vegetation',
        apply(state) {
            applyMode(state, 'terrain');
            Object.assign(state.terrain, { seed: 31, seaLevel: 0.3, octaves: 5, frequency: 1.4, ridge: 0.25 });
            Object.assign(state.layers.terrainFlow, { speed: 1.2, turbulence: 0.8, life: 10, streak: 4, opacity: 0.9, colorRamp: 'ice' });
            Object.assign(state.layers.precipitation, { visible: true, intensity: 0.8, fallSpeed: 24, windCoupling: 0.35, opacity: 0.6 });
            Object.assign(state.layers.vegetation, { density: 0.72, height: 1.7, sway: 0.5 });
        },
    },
    {
        id: 'ridge-vegetation',
        label: 'Ridge Vegetation',
        description: 'Dry ridgeline with dense slope vegetation and no rain',
        apply(state) {
            applyMode(state, 'terrain');
            Object.assign(state.terrain, { seed: 43, seaLevel: 0.16, octaves: 6, frequency: 2.2, ridge: 0.6 });
            Object.assign(state.layers.terrainFlow, { speed: 0.8, turbulence: 0.4, life: 8, streak: 3, opacity: 0.75, colorRamp: 'moss' });
            state.layers.precipitation.visible = false;
            Object.assign(state.layers.vegetation, { density: 0.85, height: 2.1, sway: 0.8 });
        },
    },
    {
        id: 'dipole-field',
        label: 'Dipole Field',
        description: 'Attractor and repulsor pair with equipotential contours',
        apply(state) {
            applyMode(state, 'force');
            state.layers.force.sources = [
                { id: 'source-attractor', label: 'Attractor A', kind: 'attractor', position: [-20, 16, 0], strength: 1.4, radius: 18, enabled: true },
                { id: 'source-repulsor', label: 'Repulsor B', kind: 'repulsor', position: [20, 16, 0], strength: 1.4, radius: 18, enabled: true },
            ];
            Object.assign(state.layers.force, { strength: 1.1, radius: 18, falloff: 1.8, colorRamp: 'ember' });
            Object.assign(state.layers.slice, { visible: true, axis: 'y', offset: 16, opacity: 0.6, mode: 'potential', contours: true });
            Object.assign(state.layers.glyphs, { visible: true, scale: 2.4, opacity: 0.55 });
            Object.assign(state.layers.streamlines, { visible: true, count: 56, steps: 120, opacity: 0.7 });
        },
    },
    {
        id: 'vortex-pair',
        label: 'Vortex Pair',
        description: 'Counter-rotating vortices with a vertical inspection slice',
        apply(state) {
            applyMode(state, 'force');
            state.layers.force.sources = [
                { id: 'source-vortex-a', label: 'Vortex A', kind: 'vortex', position: [-14, 20, -8], strength: 1.6, radius: 18, enabled: true },
                { id: 'source-vortex-b', label: 'Vortex B', kind: 'vortex', position: [14, 20, 8], strength: 1.6, radius: 18, enabled: true },
                { id: 'source-attractor', label: 'Attractor C', kind: 'attractor', position: [0, 8, 0], strength: 0.7, radius: 14, enabled: true },
            ];
            Object.assign(state.layers.force, { strength: 1, radius: 18, falloff: 1.6, colorRamp: 'ice' });
            Object.assign(state.layers.slice, { visible: true, axis: 'x', offset: 0, opacity: 0.5, mode: 'magnitude', contours: true });
            Object.assign(state.layers.glyphs, { visible: true, scale: 2, opacity: 0.45 });
            Object.assign(state.layers.streamlines, { visible: true, count: 64, steps: 130, opacity: 0.65 });
        },
    },
];
