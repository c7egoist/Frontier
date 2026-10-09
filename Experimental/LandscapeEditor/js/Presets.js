// 📦 Terrain presets — complete layer stacks for canyons, cliffs, coasts, ranges, volcanic islands, dunes and deserts.

import { CompleteProject } from "./Pipeline.js";

let IdCounter = 0;

/// in    Prefix   [-]  short label for the identifier
/// out   Id       [-]  unique layer identifier for this session
export function NewLayerId(Prefix = "Layer") {
    IdCounter += 1;
    return `${Prefix}${IdCounter.toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
}

/// in    Kind     [-]  mask catalogue key
/// in    Params   [-]  mask parameter overrides
/// in    Extra    [-]  { Invert, Strength, Seed, Generator } optional fields
/// out   Mask     [-]  mask record
export function Mask(Kind, Params = {}, Extra = {}) {
    return { Id: NewLayerId("Mask"), Enabled: true, Kind, Invert: false, Strength: 1, Seed: 3, Params, ...Extra };
}

/// in    Name     [-]  display name
/// in    Type     [-]  generator catalogue key
/// in    Options  [-]  { Blend, Amplitude, Offset, Opacity, Seed, Params, Masks }
/// out   Layer    [-]  generator layer record
export function Gen(Name, Type, Options = {}) {
    return {
        Id: NewLayerId("Gen"),
        Name,
        Kind: "Generator",
        Visible: true,
        Opacity: Options.Opacity ?? 1,
        Blend: Options.Blend ?? "Add",
        Amplitude: Options.Amplitude ?? 800,
        Offset: Options.Offset ?? 0,
        Source: { Type, Seed: Options.Seed ?? 1, Params: Options.Params ?? {} },
        Masks: Options.Masks ?? [],
    };
}

/// in    Name     [-]  display name
/// in    Type     [-]  erosion catalogue key
/// in    Options  [-]  { Params, Masks, Modulation: { Influence, Source }, Seed }
/// out   Layer    [-]  erosion layer record
export function Ero(Name, Type, Options = {}) {
    return {
        Id: NewLayerId("Ero"),
        Name,
        Kind: "Erosion",
        Visible: true,
        Opacity: Options.Opacity ?? 1,
        Blend: "Replace",
        Seed: Options.Seed ?? 11,
        Erosion: { Type, Params: Options.Params ?? {} },
        Modulation: Options.Modulation
            ? { Enabled: true, Influence: Options.Modulation.Influence ?? 0.5, Source: Options.Modulation.Source }
            : { Enabled: false, Influence: 0.5, Source: { Type: "Simplex", Seed: 5, Params: { Scale: 1400, Octaves: 4 } } },
        Masks: Options.Masks ?? [],
    };
}

/// in    Id        [-]  stable preset key
/// in    Name      [-]  display name
/// in    Summary   [-]  one-sentence description for the presets drawer
/// in    Palette   [-]  satmap palette identifier
/// in    Project   [-]  { WorldSize, SeaLevel, Layers }
/// out   Preset    [-]  preset record
function Preset(Id, Name, Summary, Palette, Project) {
    return { Id, Name, Summary, Palette, Project: { WorldSize: 4096, SeaLevel: -100, Seed: 7, ...Project } };
}

export const Presets = [
    Preset("Blank", "Blank plain", "A gentle plane with faint undulation. Start from here to build your own stack.", "Temperate", {
        SeaLevel: -200,
        Layers: [Gen("Plain", "Constant", { Blend: "Replace", Amplitude: 180, Params: { Level: 0.3 } }), Gen("Undulation", "Perlin", { Amplitude: 60, Params: { Scale: 2600, Octaves: 3 } })],
    }),
    Preset("SandstoneCanyons", "Sandstone canyons", "Stepped mesas cut by a stream-powered drainage network, with weathering bands that sculpt red canyon walls.", "Sandstone", {
        SeaLevel: -60,
        Seed: 21,
        Layers: [
            Gen("Plateau", "Terrace", { Blend: "Replace", Amplitude: 1250, Seed: 21, Params: { Scale: 5400, Octaves: 4, Steps: 6, Sharpness: 0.55, Gain: 0.45 } }),
            Gen("Rock texture", "Ridged", { Amplitude: 170, Seed: 4, Params: { Scale: 800, Octaves: 5, Sharpness: 1.3 } }),
            Ero("Bedding", "Stratified", { Params: { BandHeight: 110, HardRatio: 0.42, Contrast: 0.85, Rate: 0.5, Talus: 40, Iterations: 35 } }),
            Ero("Drainage", "StreamPower", { Params: { Erodibility: 1.1, Iterations: 14, Deposition: 0.3 } }),
            Ero("Gullies", "Hydraulic", { Params: { Droplets: 70000, Lifetime: 80, ErodeRate: 0.3, DepositRate: 0.3 } }),
            Ero("Wall collapse", "Thermal", { Params: { Angle: 42, Iterations: 15, Rate: 0.25 } }),
        ],
    }),
    Preset("SandstoneCliffs", "Sandstone cliffs", "Hard caprock over soft beds: vertical banded cliff faces with talus aprons at their feet.", "Sandstone", {
        SeaLevel: -120,
        Seed: 33,
        Layers: [
            Gen("Tableland", "Terrace", { Blend: "Replace", Amplitude: 1050, Seed: 33, Params: { Scale: 9000, Octaves: 4, Steps: 4, Sharpness: 0.8 } }),
            Gen("Tilt", "Gradient", { Amplitude: 240, Params: { Angle: 20 } }),
            Gen("Relief", "Warped", { Amplitude: 260, Seed: 6, Params: { Scale: 2600, Octaves: 5, Warp: 0.8 } }),
            Ero("Caprock banding", "Stratified", {
                Params: { BandHeight: 170, HardRatio: 0.5, Contrast: 0.9, Rate: 0.55, Talus: 46, Iterations: 40 },
                Masks: [Mask("Altitude", { Low: 200, High: 2600, Feather: 150 })],
            }),
            Ero("Cliff collapse", "Thermal", { Params: { Angle: 60, Iterations: 30, Rate: 0.35 }, Masks: [Mask("Cliff", { MinSlope: 36, Feather: 8, Breakup: 0.3 })] }),
            Ero("Drainage", "StreamPower", { Params: { Erodibility: 0.5, Iterations: 6 } }),
        ],
    }),
    Preset("CoastalCliffs", "Coastal cliffs", "An island with fetch-driven wave-cut notches, undercut headlands and talus, while the interior falls off smoothly toward the shore.", "Coastal", {
        SeaLevel: 260,
        Seed: 44,
        Layers: [
            Gen("Island", "Island", { Blend: "Replace", Amplitude: 1050, Seed: 44, Params: { Radius: 0.8, Falloff: 1.4, CoastNoise: 0.7, Scale: 1400 } }),
            Gen("Coastal relief", "Ridged", { Amplitude: 420, Seed: 9, Params: { Scale: 1100, Octaves: 6, Sharpness: 1.4 }, Masks: [Mask("Coastal", { Distance: 900, Zone: "Inland", Shape: "Smoother" })] }),
            Gen("Hills", "Hybrid", { Amplitude: 240, Seed: 12, Params: { Scale: 1800, Octaves: 6, Gain: 0.3, Offset: 0.7 }, Masks: [Mask("Altitude", { Low: 300, High: 1600, Feather: 200 })] }),
            Ero("Wave-cut notches", "WaveCut", { Params: { Reach: 110, Energy: 0.8, Undercut: 0.6, Talus: 52, Iterations: 26 } }),
            Ero("Cliff collapse", "Thermal", { Params: { Angle: 48, Iterations: 20, Rate: 0.3 }, Masks: [Mask("Cliff", { MinSlope: 35, Feather: 9, MinHeight: 300 })] }),
            Ero("Gullies", "Hydraulic", { Params: { Droplets: 50000 }, Masks: [Mask("Coastal", { Distance: 1200, Zone: "Inland", Shape: "Smooth" })] }),
        ],
    }),
    Preset("Himalayan", "Himalayan mountain", "Towering ridged massif with peaks concentrated under a summit falloff, glacier-carved valleys and cirques at high snow.", "Himalayan", {
        SeaLevel: -100,
        Seed: 55,
        Layers: [
            Gen("Massif", "Mountain", { Blend: "Replace", Amplitude: 3000, Seed: 55, Params: { Scale: 5200, Octaves: 8, Sharpness: 1.8, RidgeShare: 0.8, PeakBias: 1.6 } }),
            Gen("Summit detail", "Ridged", { Amplitude: 520, Seed: 8, Params: { Scale: 950, Octaves: 6, Sharpness: 1.7 }, Masks: [Mask("Summit", { Threshold: 1800, Peak: 3400, Shoulder: 1.6, Breakup: 0.4 })] }),
            Ero("Stream network", "StreamPower", { Params: { Erodibility: 1.2, Iterations: 10 } }),
            Ero("Glacial valleys", "Glacial", { Params: { Snowline: 3800, Strength: 1.2, Cirque: 0.5, Smoothing: 6, Iterations: 3 }, Masks: [Mask("Altitude", { Low: 1500, High: 6000, Feather: 300 })] }),
            Ero("Gullies", "Hydraulic", { Params: { Droplets: 80000, Lifetime: 90 } }),
            Ero("Rockfall", "Thermal", { Params: { Angle: 42, Iterations: 25, Rate: 0.3 }, Masks: [Mask("Cliff", { MinSlope: 40, Feather: 8, MinHeight: 1500 })] }),
        ],
    }),
    Preset("Icelandic", "Icelandic", "Basalt plateaus with lava-edge ridges, a jagged shoreline with sea cliffs, and glaciers filling the valleys below the snowline.", "Volcanic", {
        SeaLevel: 180,
        Seed: 66,
        Layers: [
            Gen("Volcanic shield", "Warped", { Blend: "Replace", Amplitude: 1150, Seed: 66, Params: { Scale: 4200, Octaves: 6, Warp: 1.0 } }),
            Gen("Coast falloff", "Island", { Blend: "Multiply", Amplitude: 1, Seed: 14, Params: { Radius: 0.9, Falloff: 1.1, CoastNoise: 0.9, Scale: 1200 } }),
            Gen("Basalt plates", "Cellular", { Amplitude: 300, Seed: 17, Params: { Scale: 1400, Mode: "Edges", Roughness: 0.35 }, Masks: [Mask("Altitude", { Low: 150, High: 1000, Feather: 200 })] }),
            Gen("Lava terraces", "Terrace", { Amplitude: 380, Seed: 19, Params: { Scale: 3400, Octaves: 4, Steps: 3, Sharpness: 0.3 }, Masks: [Mask("Summit", { Threshold: 600, Peak: 1100, Shoulder: 1.2 })] }),
            Ero("Sea cliffs", "WaveCut", { Params: { Reach: 70, Energy: 0.6, Undercut: 0.45, Talus: 50, Iterations: 16 } }),
            Ero("Glacial valleys", "Glacial", { Params: { Snowline: 900, Strength: 0.9, Cirque: 0.5, Smoothing: 8, Iterations: 3 } }),
            Ero("Columnar bands", "Stratified", { Params: { BandHeight: 60, HardRatio: 0.7, Contrast: 0.6, Rate: 0.2, Talus: 40, Iterations: 12 }, Masks: [Mask("Slope", { Min: 22, Max: 70, Feather: 6 })] }),
            Ero("Drainage", "Hydraulic", { Params: { Droplets: 60000 } }),
        ],
    }),
    Preset("Alps", "Alps", "Rounded-but-sharp alpine massifs with U-shaped valleys, hanging cirques and snow on the upper faces.", "Alpine", {
        SeaLevel: -200,
        Seed: 77,
        Layers: [
            Gen("Alpine massif", "Mountain", { Blend: "Replace", Amplitude: 2400, Seed: 77, Params: { Scale: 4800, Octaves: 7, Sharpness: 1.5, RidgeShare: 0.6, PeakBias: 1.2 } }),
            Gen("Spurs", "Ridged", { Amplitude: 320, Seed: 15, Params: { Scale: 900, Octaves: 6, Sharpness: 1.6 }, Masks: [Mask("Summit", { Threshold: 1000, Peak: 2600, Shoulder: 1.4 })] }),
            Ero("Stream network", "StreamPower", { Params: { Erodibility: 0.9, Iterations: 12 } }),
            Ero("Glaciers", "Glacial", { Params: { Snowline: 2600, Strength: 1.4, Cirque: 0.6, Smoothing: 8, Iterations: 4 } }),
            Ero("Gullies", "Hydraulic", { Params: { Droplets: 80000, Lifetime: 90 } }),
            Ero("Scree", "Thermal", { Params: { Angle: 38, Iterations: 30, Rate: 0.3 } }),
        ],
    }),
    Preset("SnowyMountains", "Snowy mountains", "Snow-capped ridgelines and broad white summits, with deep glacial troughs and polished cirque bowls.", "Glacial", {
        SeaLevel: -150,
        Seed: 88,
        Layers: [
            Gen("Ridge massif", "Ridged", { Blend: "Replace", Amplitude: 2200, Seed: 88, Params: { Scale: 3600, Octaves: 7, Sharpness: 1.3, Gain: 0.5 } }),
            Gen("Summit ice", "Hybrid", { Amplitude: 500, Seed: 21, Params: { Scale: 1100, Octaves: 5, Gain: 0.3, Offset: 0.8 }, Masks: [Mask("Summit", { Threshold: 1200, Peak: 2400, Shoulder: 1.1, Breakup: 0.3 })] }),
            Ero("Ice carving", "Glacial", { Params: { Snowline: 1800, Strength: 1.8, Cirque: 0.8, Smoothing: 6, Iterations: 4 } }),
            Ero("Stream network", "StreamPower", { Params: { Erodibility: 0.6, Iterations: 8 } }),
            Ero("Avalanche debris", "Thermal", { Params: { Angle: 44, Iterations: 30, Rate: 0.3 } }),
        ],
    }),
    Preset("RuggedOutcrops", "Rugged outcrops", "Fractured rock outcrops with crack-edge ridges, hard bands standing proud, and steep talus-shedding slopes.", "Temperate", {
        SeaLevel: -120,
        Seed: 99,
        Layers: [
            Gen("Fracture plates", "Cellular", { Blend: "Replace", Amplitude: 520, Seed: 99, Params: { Scale: 900, Mode: "Edges", Roughness: 0.45 } }),
            Gen("Rock mass", "Hybrid", { Amplitude: 720, Seed: 23, Params: { Scale: 1800, Octaves: 6, Gain: 0.4, Offset: 0.6 }, Masks: [Mask("Altitude", { Low: 200, High: 2000, Feather: 200 })] }),
            Ero("Outcrop weathering", "Stratified", { Params: { BandHeight: 90, HardRatio: 0.35, Contrast: 0.5, Rate: 0.3, Talus: 50, Iterations: 25 } }),
            Ero("Shedding slopes", "Thermal", { Params: { Angle: 50, Iterations: 25, Rate: 0.35 } }),
            Ero("Gullies", "Hydraulic", { Params: { Droplets: 60000, Radius: 2 } }),
        ],
    }),
    Preset("DesertDunes", "Desert dunes", "Asymmetric dune fields with slip faces, wind-driven deflation and sand drifting into lee troughs.", "Arid", {
        SeaLevel: -200,
        Seed: 111,
        Layers: [
            Gen("Desert floor", "Perlin", { Blend: "Replace", Amplitude: 130, Seed: 111, Params: { Scale: 6000, Octaves: 3 } }),
            Gen("Dune sea", "Dunes", { Amplitude: 300, Seed: 5, Params: { Scale: 520, WindAngle: 35, Elongation: 5, Asymmetry: 0.82, Ripple: 0.15, Breakup: 0.45 } }),
            Ero("Wind shaping", "Aeolian", { Params: { WindAngle: 35, Strength: 0.5, SandSupply: 0.7, Saltation: 4, Repose: 33, Iterations: 30 } }),
        ],
    }),
    Preset("RockyDesert", "Rocky desert landscape", "Mesas and buttes weathered by bed, carved by ephemeral washes along faults, and dusted with wind-blown sand.", "Arid", {
        SeaLevel: -200,
        Seed: 122,
        Layers: [
            Gen("Mesa base", "Terrace", { Blend: "Replace", Amplitude: 820, Seed: 122, Params: { Scale: 4400, Octaves: 5, Steps: 5, Sharpness: 0.35 } }),
            Gen("Buttes", "Ridged", { Amplitude: 360, Seed: 13, Params: { Scale: 1600, Octaves: 5, Sharpness: 1.4 } }),
            Ero("Bedded weathering", "Stratified", { Params: { BandHeight: 130, HardRatio: 0.5, Contrast: 0.7, Rate: 0.35, Talus: 40, Iterations: 25 } }),
            Ero("Ephemeral washes", "StreamPower", { Params: { Erodibility: 0.7, Iterations: 10 }, Masks: [Mask("Rift", { Angle: 25, Position: 0.5, Width: 260, Falloff: 800 })] }),
            Ero("Desert wind", "Aeolian", { Params: { WindAngle: 110, Strength: 0.35, SandSupply: 0.35, Saltation: 3, Iterations: 14 } }),
            Ero("Talus", "Thermal", { Params: { Angle: 45, Iterations: 15, Rate: 0.3 } }),
        ],
    }),
];

/// in    Id       [-]  preset identifier
/// out   Project  [-]  complete project with fresh layer identifiers, ready to load
export function PresetProject(Id) {
    const Preset_ = Presets.find((Entry) => Entry.Id === Id) ?? Presets[0];
    const Project = CompleteProject({ ...Preset_.Project, Name: Preset_.Name, Palette: Preset_.Palette });
    return {
        ...Project,
        Layers: Project.Layers.map((Layer) => ({ ...Layer, Id: NewLayerId(Layer.Kind === "Erosion" ? "Ero" : "Gen"), Masks: Layer.Masks.map((Mask_) => ({ ...Mask_, Id: NewLayerId("Mask") })) })),
    };
}
