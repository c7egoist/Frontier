/*====================================================================================================================================
                                                        PARAMETERSSCHEMA.JS
====================================================================================================================================*/
// 🧩 Inspector schemas for each outliner node. Paths address the serialisable scene state.

import { COLOR_RAMPS, TERRAIN_PALETTES } from './SceneState.js';

const rampOptions = Object.entries(COLOR_RAMPS).map(([value, colors]) => ({ value, label: value[0].toUpperCase() + value.slice(1), colors }));
const paletteOptions = Object.entries(TERRAIN_PALETTES).map(([value, palette]) => ({ value, label: palette.label }));

const fieldStatistics = [
    { type: 'histogram', label: 'Magnitude distribution' },
    { type: 'readout', label: 'Mean', path: 'analysis.mean', unit: 'u', digits: 2 },
    { type: 'readout', label: 'P95', path: 'analysis.p95', unit: 'u', digits: 2 },
    { type: 'readout', label: 'Max', path: 'analysis.max', unit: 'u', digits: 2 },
];

export const SCHEMAS = {
    scene: [
        {
            title: 'Playback',
            controls: [
                { type: 'toggle', label: 'Run simulation', path: 'playing', icon: 'play' },
                { type: 'slider', label: 'Time scale', path: 'timeScale', min: 0.1, max: 3, step: 0.05, unit: '×' },
                { type: 'select', label: 'Quality', path: 'quality', options: [
                    { value: 'performance', label: 'Performance · 36k' },
                    { value: 'balanced', label: 'Balanced · 65k' },
                    { value: 'quality', label: 'Quality · 147k' },
                ] },
            ],
        },
        {
            title: 'Presets',
            controls: [{ type: 'presets', label: 'Field presets' }],
        },
        {
            title: 'Renderer',
            controls: [
                { type: 'readout', label: 'Device', path: 'info.renderer' },
                { type: 'readout', label: 'Target format', path: 'info.format' },
                { type: 'readout', label: 'Particles', path: 'info.particleCount' },
                { type: 'readout', label: 'Rain drops', path: 'info.rainCount' },
                { type: 'readout', label: 'Vegetation', path: 'info.vegetationCount' },
                { type: 'readout', label: 'Glyphs', path: 'info.glyphCount' },
                { type: 'readout', label: 'Streamlines', path: 'info.streamlineCount' },
            ],
        },
        {
            title: 'Viewport',
            controls: [
                { type: 'toggle', label: 'Statistics overlay', path: 'render.showStats' },
                { type: 'toggle', label: 'Colour legend', path: 'render.showLegend' },
                { type: 'toggle', label: 'Axis gizmo', path: 'render.showGizmo' },
                { type: 'toggle', label: 'Probe marker', path: 'render.showProbe' },
            ],
        },
        {
            title: 'About',
            controls: [
                { type: 'note', text: 'A GPU field workspace for wind, force, and terrain analysis. Drag to orbit, shift-drag to pan, scroll to zoom, double-click to focus.' },
                { type: 'button', label: 'Reset scene', action: 'reset-scene', icon: 'reset' },
                { type: 'button', label: 'Save scene', action: 'save-scene', icon: 'save' },
                { type: 'button', label: 'Open scene', action: 'open-scene', icon: 'open' },
            ],
        },
    ],
    terrain: [
        {
            title: 'Heightfield',
            controls: [
                { type: 'slider', label: 'Seed', path: 'terrain.seed', min: 1, max: 99, step: 1 },
                { type: 'slider', label: 'Extent', path: 'terrain.size', min: 80, max: 200, step: 5, unit: 'm' },
                { type: 'slider', label: 'Max height', path: 'terrain.maxHeight', min: 8, max: 30, step: 1, unit: 'm' },
                { type: 'slider', label: 'Octaves', path: 'terrain.octaves', min: 1, max: 7, step: 1 },
                { type: 'slider', label: 'Frequency', path: 'terrain.frequency', min: 0.8, max: 3, step: 0.05 },
                { type: 'slider', label: 'Ridge', path: 'terrain.ridge', min: 0, max: 1, step: 0.01 },
                { type: 'slider', label: 'Sea level', path: 'terrain.seaLevel', min: 0, max: 0.5, step: 0.01 },
            ],
        },
        {
            title: 'Surface',
            controls: [
                { type: 'select', label: 'Palette', path: 'layers.terrain.palette', options: paletteOptions },
                { type: 'toggle', label: 'Contour lines', path: 'layers.terrain.contours' },
                { type: 'toggle', label: 'Water plane', path: 'layers.terrain.water' },
                { type: 'slider', label: 'Opacity', path: 'layers.terrain.opacity', min: 0.2, max: 1, step: 0.01 },
            ],
        },
        {
            title: 'Terrain analysis',
            controls: [
                { type: 'note', text: 'Flow accumulation is routed downhill from every cell. Channels drive the moisture field, which in turn drives vegetation density.' },
                { type: 'readout', label: 'Flow channels', path: 'analysis.flowChannels', digits: 0 },
                { type: 'readout', label: 'Vegetation cover', path: 'analysis.vegetationCover', unit: '%', digits: 1 },
                { type: 'readout', label: 'Water level', path: 'analysis.waterLevel', unit: 'm', digits: 1 },
            ],
        },
    ],
    wind: [
        {
            title: 'Flow',
            controls: [
                { type: 'slider', label: 'Speed', path: 'layers.wind.speed', min: 0, max: 40, step: 0.5, unit: 'm/s' },
                { type: 'slider', label: 'Direction', path: 'layers.wind.direction', min: 0, max: 360, step: 1, unit: '°' },
                { type: 'slider', label: 'Elevation', path: 'layers.wind.elevation', min: -10, max: 60, step: 1, unit: '°' },
                { type: 'slider', label: 'Turbulence', path: 'layers.wind.turbulence', min: 0, max: 3, step: 0.05 },
                { type: 'slider', label: 'Curl scale', path: 'layers.wind.curlScale', min: 0.01, max: 0.08, step: 0.001 },
                { type: 'slider', label: 'Terrain lift', path: 'layers.wind.lift', min: 0, max: 2, step: 0.05 },
                { type: 'slider', label: 'Terrain coupling', path: 'layers.wind.terrainCoupling', min: 0, max: 1, step: 0.01 },
            ],
        },
        {
            title: 'Integration',
            controls: [
                { type: 'slider', label: 'Lifetime', path: 'layers.wind.life', min: 2, max: 14, step: 0.5, unit: 's' },
                { type: 'slider', label: 'Streak length', path: 'layers.wind.streak', min: 1, max: 8, step: 0.1, unit: '×' },
                { type: 'slider', label: 'Streak width', path: 'layers.wind.width', min: 0.5, max: 3, step: 0.1, unit: 'px' },
                { type: 'slider', label: 'Opacity', path: 'layers.wind.opacity', min: 0, max: 1, step: 0.01 },
            ],
        },
        {
            title: 'Appearance',
            controls: [{ type: 'select', label: 'Colour ramp', path: 'layers.wind.colorRamp', options: rampOptions }],
        },
        {
            title: 'Field statistics',
            controls: [
                { type: 'profile', label: 'Vertical speed profile' },
                ...fieldStatistics,
            ],
        },
    ],
    force: [
        {
            title: 'Field',
            controls: [
                { type: 'slider', label: 'Strength', path: 'layers.force.strength', min: 0, max: 2, step: 0.01 },
                { type: 'slider', label: 'Radius', path: 'layers.force.radius', min: 6, max: 30, step: 0.5, unit: 'm' },
                { type: 'slider', label: 'Falloff', path: 'layers.force.falloff', min: 1, max: 3, step: 0.05 },
                { type: 'vector3', label: 'Background flow', path: 'layers.force.background', step: 0.01 },
            ],
        },
        {
            title: 'Sources',
            controls: [{ type: 'sources', label: 'Field sources' }],
        },
        {
            title: 'Integration',
            controls: [
                { type: 'slider', label: 'Lifetime', path: 'layers.force.life', min: 2, max: 14, step: 0.5, unit: 's' },
                { type: 'slider', label: 'Streak length', path: 'layers.force.streak', min: 1, max: 8, step: 0.1, unit: '×' },
                { type: 'slider', label: 'Streak width', path: 'layers.force.width', min: 0.5, max: 3, step: 0.1, unit: 'px' },
                { type: 'slider', label: 'Opacity', path: 'layers.force.opacity', min: 0, max: 1, step: 0.01 },
            ],
        },
        {
            title: 'Appearance',
            controls: [{ type: 'select', label: 'Colour ramp', path: 'layers.force.colorRamp', options: rampOptions }],
        },
        {
            title: 'Field statistics',
            controls: fieldStatistics,
        },
    ],
    forceSource: [
        {
            title: 'Source',
            controls: [
                { type: 'select', label: 'Kind', path: 'source.kind', options: [
                    { value: 'attractor', label: 'Attractor' },
                    { value: 'repulsor', label: 'Repulsor' },
                    { value: 'vortex', label: 'Vortex' },
                ] },
                { type: 'toggle', label: 'Enabled', path: 'source.enabled' },
                { type: 'slider', label: 'Strength', path: 'source.strength', min: 0, max: 3, step: 0.05 },
                { type: 'slider', label: 'Radius', path: 'source.radius', min: 4, max: 32, step: 0.5, unit: 'm' },
                { type: 'vector3', label: 'Position', path: 'source.position', step: 0.5 },
            ],
        },
        {
            title: 'Actions',
            controls: [
                { type: 'button', label: 'Duplicate source', action: 'duplicate-source', icon: 'plus' },
                { type: 'button', label: 'Delete source', action: 'delete-source', icon: 'trash', danger: true },
            ],
        },
    ],
    terrainFlow: [
        {
            title: 'Surface flow',
            controls: [
                { type: 'slider', label: 'Flow speed', path: 'layers.terrainFlow.speed', min: 0, max: 2.5, step: 0.05 },
                { type: 'slider', label: 'Turbulence', path: 'layers.terrainFlow.turbulence', min: 0, max: 1.5, step: 0.05 },
                { type: 'slider', label: 'Lifetime', path: 'layers.terrainFlow.life', min: 2, max: 14, step: 0.5, unit: 's' },
                { type: 'slider', label: 'Streak length', path: 'layers.terrainFlow.streak', min: 1, max: 8, step: 0.1, unit: '×' },
                { type: 'slider', label: 'Streak width', path: 'layers.terrainFlow.width', min: 0.5, max: 3, step: 0.1, unit: 'px' },
                { type: 'slider', label: 'Opacity', path: 'layers.terrainFlow.opacity', min: 0, max: 1, step: 0.01 },
            ],
        },
        {
            title: 'Appearance',
            controls: [{ type: 'select', label: 'Colour ramp', path: 'layers.terrainFlow.colorRamp', options: rampOptions }],
        },
        {
            title: 'Field statistics',
            controls: fieldStatistics,
        },
    ],
    precipitation: [
        {
            title: 'Rain',
            controls: [
                { type: 'slider', label: 'Intensity', path: 'layers.precipitation.intensity', min: 0, max: 1, step: 0.01 },
                { type: 'slider', label: 'Fall speed', path: 'layers.precipitation.fallSpeed', min: 5, max: 50, step: 1, unit: 'm/s' },
                { type: 'slider', label: 'Wind coupling', path: 'layers.precipitation.windCoupling', min: 0, max: 1.5, step: 0.01 },
                { type: 'slider', label: 'Streak length', path: 'layers.precipitation.streak', min: 1, max: 6, step: 0.1, unit: '×' },
                { type: 'slider', label: 'Streak width', path: 'layers.precipitation.width', min: 0.5, max: 2, step: 0.1, unit: 'px' },
                { type: 'slider', label: 'Opacity', path: 'layers.precipitation.opacity', min: 0, max: 1, step: 0.01 },
                { type: 'color', label: 'Colour', path: 'layers.precipitation.color' },
            ],
        },
        {
            title: 'Note',
            controls: [{ type: 'note', text: 'Rain drops are advected by the wind vector and respawn above the terrain when they hit the surface.' }],
        },
    ],
    vegetation: [
        {
            title: 'Blades',
            controls: [
                { type: 'slider', label: 'Density', path: 'layers.vegetation.density', min: 0, max: 1, step: 0.01 },
                { type: 'slider', label: 'Height', path: 'layers.vegetation.height', min: 0.2, max: 3, step: 0.05, unit: 'm' },
                { type: 'slider', label: 'Wind sway', path: 'layers.vegetation.sway', min: 0, max: 2, step: 0.05 },
                { type: 'slider', label: 'Opacity', path: 'layers.vegetation.opacity', min: 0, max: 1, step: 0.01 },
                { type: 'color', label: 'Colour', path: 'layers.vegetation.color' },
            ],
        },
        {
            title: 'Note',
            controls: [{ type: 'note', text: 'Blade placement is sampled from the terrain moisture and slope fields. Density reveals blades without rebuilding geometry.' }],
        },
    ],
    slice: [
        {
            title: 'Inspection plane',
            controls: [
                { type: 'select', label: 'Axis', path: 'layers.slice.axis', options: [
                    { value: 'y', label: 'Horizontal · Y' },
                    { value: 'x', label: 'Vertical · X' },
                    { value: 'z', label: 'Vertical · Z' },
                ] },
                { type: 'slider', label: 'Offset', path: 'layers.slice.offset', min: -60, max: 60, step: 0.5, unit: 'm' },
                { type: 'select', label: 'Channel', path: 'layers.slice.mode', options: [
                    { value: 'magnitude', label: 'Magnitude' },
                    { value: 'potential', label: 'Potential' },
                    { value: 'flow', label: 'Flow accumulation' },
                ] },
                { type: 'slider', label: 'Gain', path: 'layers.slice.gain', min: 0.2, max: 3, step: 0.05, unit: '×' },
                { type: 'slider', label: 'Opacity', path: 'layers.slice.opacity', min: 0, max: 1, step: 0.01 },
                { type: 'toggle', label: 'Contour lines', path: 'layers.slice.contours' },
            ],
        },
        {
            title: 'Note',
            controls: [{ type: 'note', text: 'The slice evaluates the active field per fragment on the GPU. Potential contours reveal equipotential structure around force sources.' }],
        },
    ],
    glyphs: [
        {
            title: 'Glyph grid',
            controls: [
                { type: 'slider', label: 'Scale', path: 'layers.glyphs.scale', min: 0.5, max: 5, step: 0.1, unit: 'm' },
                { type: 'slider', label: 'Opacity', path: 'layers.glyphs.opacity', min: 0, max: 1, step: 0.01 },
                { type: 'select', label: 'Colour ramp', path: 'layers.glyphs.colorRamp', options: rampOptions },
            ],
        },
        {
            title: 'Note',
            controls: [{ type: 'note', text: 'Glyph direction and length are evaluated in the vertex shader from the same field function used by the particles.' }],
        },
    ],
    streamlines: [
        {
            title: 'Streamlines',
            controls: [
                { type: 'slider', label: 'Count', path: 'layers.streamlines.count', min: 8, max: 96, step: 1 },
                { type: 'slider', label: 'Steps', path: 'layers.streamlines.steps', min: 40, max: 200, step: 5 },
                { type: 'slider', label: 'Opacity', path: 'layers.streamlines.opacity', min: 0, max: 1, step: 0.01 },
            ],
        },
        {
            title: 'Note',
            controls: [{ type: 'note', text: 'Streamlines are integrated with a fixed-step force evaluation and rebuilt when the field changes.' }],
        },
    ],
    grid: [
        {
            title: 'Ground grid',
            controls: [
                { type: 'slider', label: 'Extent', path: 'layers.grid.extent', min: 60, max: 200, step: 5, unit: 'm' },
                { type: 'slider', label: 'Divisions', path: 'layers.grid.divisions', min: 8, max: 48, step: 1 },
                { type: 'slider', label: 'Opacity', path: 'layers.grid.opacity', min: 0, max: 1, step: 0.01 },
            ],
        },
    ],
    probe: [
        {
            title: 'Probe',
            controls: [
                { type: 'toggle', label: 'Probe tool', path: 'layers.probe.active' },
                { type: 'probe', label: 'Field sample' },
            ],
        },
        {
            title: 'Note',
            controls: [{ type: 'note', text: 'Click the terrain with the probe tool to sample the active field. The marker shows the surface point and a vertical reference.' }],
        },
    ],
};

export function getSchema(kind, state) {
    if (kind === 'forceSource') {
        const index = state.layers.force.sources.findIndex((source) => source.id === state.selected);
        if (index < 0) return SCHEMAS.force;
        const schema = JSON.parse(JSON.stringify(SCHEMAS.forceSource));
        for (const section of schema) {
            for (const control of section.controls) {
                if (control.path && control.path.startsWith('source.')) {
                    control.path = `layers.force.sources.${index}.${control.path.slice(7)}`;
                }
            }
        }
        return schema;
    }
    return SCHEMAS[kind] || SCHEMAS.scene;
}
