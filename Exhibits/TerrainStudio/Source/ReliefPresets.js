//============================================================================================================================================
//                                                              RELIEFPRESETS.JS
//============================================================================================================================================
// 🧩 Four field-tested geologies at 1024² over a 2 km frame: Alpine glaciation, Himalayan collision,
//    sedimentary canyon incision, and an arid sandstone wadi/butte hamada. Every preset is an ordinary
//    layer stack with river + glacial + hydraulic + thermal erosion and 3D SDF cave systems.

import { ConstructLayer } from "./LayerStackEvaluation.js";

export const DefaultEnvironment =
{
    SunAzimuth: 135.0, SunElevation: 38.0, SunIntensity: 3.1,
    Exposure: 1.05,
    FogDensity: 0.00014, FogColour: [0.64, 0.70, 0.76],
    SkyZenith: [0.16, 0.34, 0.62], SkyHorizon: [0.78, 0.82, 0.86],
    WaterLevel: 40.0, WaterTint: [0.05, 0.23, 0.30],
    RockLow: [0.30, 0.28, 0.26], RockHigh: [0.54, 0.52, 0.49],
    MeadowTint: [0.16, 0.32, 0.11], DryTint: [0.44, 0.38, 0.21],
    SandTint: [0.78, 0.62, 0.38], ScreeTint: [0.42, 0.39, 0.35],
    SnowTint: [0.94, 0.96, 1.00],
    StrataContrast: 0.32, Vegetation: 0.75,
};

function Environment(Overrides)
{
    return { ...DefaultEnvironment, ...Overrides };
}

export const ReliefPresets =
[
    {
        Id: "Alps",
        Label: "Bernese Alps",
        Region: "Swiss Alps · 46.5° N",
        Category: "Alpine",
        Blurb: "Glaciated granite massif: sharp dendritic arêtes, wide U-valleys, cirque couloirs and 3D karst caves.",
        SeedMark: 4815,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Alpine basement", Blend: "Replace", Seed: 4815,
                Params: { Amplitude: 245, BaseElevation: 45, Wavelength: 1320, Octaves: 6, Gain: 0.48, Warp: 170, Plateau: 0.10, Tilt: 35, TiltAngle: 28 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Horn & arête crests", Seed: 9021,
                Params: { Amplitude: 390, Wavelength: 820, Octaves: 6, Sharpness: 1.48, Warp: 165 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Drainage & rivers", Seed: 4817,
                Params: { Strength: 2.10, Iterations: 4, Sedimentation: 0.50, Capacity: 1.15 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Glacial U-troughs", Seed: 4819,
                Params: { Strength: 0.72, WidthTexels: 16, ScourMetres: 9 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Rill & couloir wash", Seed: 4823,
                Params: { Droplets: 140000, Inertia: 0.26, Capacity: 4.2, ErodeRate: 0.30, DepositRate: 0.32, Radius: 3 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Scree & cliff repose", Seed: 4829,
                Params: { Iterations: 52, TalusAngle: 34, CliffAngle: 68, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Cirque & couloir snowfields", Seed: 4831,
                Params: { Snowline: 330, Band: 65, SlopeLimit: 42, Depth: 4 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Alpine karst caves (SDF)", Seed: 4835,
                Params: { CaveCount: 2, Aperture: 15, TunnelDepth: 75, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 128, SunElevation: 38, WaterLevel: 82,
            FogDensity: 0.000085, FogColour: [0.66, 0.72, 0.78],
            RockLow: [0.24, 0.25, 0.28], RockHigh: [0.49, 0.51, 0.54],
            ScreeTint: [0.40, 0.39, 0.36],
            MeadowTint: [0.15, 0.32, 0.12], DryTint: [0.38, 0.35, 0.21],
            Vegetation: 0.85, StrataContrast: 0.22,
        }),
        Stamps: [],
        Camera: { Azimuth: -38, Elevation: 24, Distance: 2350 },
    },
    {
        Id: "Himalaya",
        Label: "Khumbu Himalaya",
        Region: "Nepal · 27.9° N",
        Category: "Alpine",
        Blurb: "Active collision front: dark Lhotse-banded gneiss walls, sharp arêtes, glacial troughs and gorge caves.",
        SeedMark: 8848,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Tibetan foreland", Blend: "Replace", Seed: 8848,
                Params: { Amplitude: 210, BaseElevation: 110, Wavelength: 1260, Octaves: 5, Gain: 0.48, Warp: 190, Plateau: 0.08, Tilt: 55, TiltAngle: 18 },
            }),
            ConstructLayer("TectonicFront", {
                Label: "Main collision arc", Seed: 8849,
                Params: { Amplitude: 360, Angle: 118, Offset: -20, Width: 620, Asymmetry: 0.34, Meander: 245, Waviness: 1120, CrestWavelength: 520 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Ice arêtes & horns", Seed: 8851,
                Params: { Amplitude: 280, Wavelength: 820, Octaves: 5, Sharpness: 1.42, Warp: 155 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Antecedent gorges", Seed: 8853,
                Params: { Strength: 2.35, Iterations: 4, Sedimentation: 0.45, Capacity: 1.15 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Imja-style U-troughs", Seed: 8857,
                Params: { Strength: 0.74, WidthTexels: 16, ScourMetres: 10 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Monsoon & couloir wash", Seed: 8861,
                Params: { Droplets: 150000, Inertia: 0.28, Capacity: 4.4, ErodeRate: 0.30, DepositRate: 0.30, Radius: 3 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Frost-shatter repose", Seed: 8863,
                Params: { Iterations: 58, TalusAngle: 35, CliffAngle: 72, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Névé & icefall snow", Seed: 8867,
                Params: { Snowline: 535, Band: 80, SlopeLimit: 44, Depth: 4.5 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Himalayan cliff caves (SDF)", Seed: 8871,
                Params: { CaveCount: 2, Aperture: 16, TunnelDepth: 80, Blend: 8 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 152, SunElevation: 34, SunIntensity: 3.3, WaterLevel: 68,
            FogDensity: 0.000095, FogColour: [0.70, 0.76, 0.83],
            SkyZenith: [0.10, 0.26, 0.58], SkyHorizon: [0.80, 0.85, 0.90],
            RockLow: [0.19, 0.20, 0.22], RockHigh: [0.40, 0.42, 0.45],
            ScreeTint: [0.35, 0.35, 0.34],
            MeadowTint: [0.18, 0.28, 0.13], DryTint: [0.38, 0.34, 0.22],
            WaterTint: [0.10, 0.36, 0.42],
            Vegetation: 0.28, StrataContrast: 0.32,
        }),
        Stamps: [],
        Camera: { Azimuth: -26, Elevation: 22, Distance: 2450 },
    },
    {
        Id: "Canyon",
        Label: "Colorado Canyon",
        Region: "Arizona Plateau · 36.1° N",
        Category: "Arid",
        Blurb: "Sedimentary staircase: hard beds hold the cliffs, soft beds bleed slopes, Redwall alcove caves and a river floor.",
        SeedMark: 1609,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Kaibab plateau", Blend: "Replace", Seed: 1609,
                Params: { Amplitude: 330, BaseElevation: 60, Wavelength: 1500, Octaves: 4, Gain: 0.5, Warp: 90, Plateau: 0.8, Tilt: 130, TiltAngle: 38 },
            }),
            ConstructLayer("StrataTerrace", {
                Label: "Bedded limestone & shale", Seed: 1613,
                Params: { BandMetres: 24, RiserWidth: 0.42, TerraceStrength: 0.65, HardContrast: 0.9 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "The river", Seed: 1617,
                Params: { Strength: 3.2, Iterations: 6, Sedimentation: 0.35, Capacity: 1.15 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Differential wash", Seed: 1619,
                Params: { Droplets: 200000, Inertia: 0.25, Capacity: 4.2, ErodeRate: 0.38, DepositRate: 0.26, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Talus aprons", Seed: 1621,
                Params: { Iterations: 44, TalusAngle: 32, CliffAngle: 76, Rate: 0.5 },
            }),
            ConstructLayer("AeolianSettle", {
                Label: "Floor sand drift", Seed: 1627,
                Params: { WindAngle: 65, Slabs: 60000 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Redwall alcove caves (SDF)", Seed: 1631,
                Params: { CaveCount: 2, Aperture: 16, TunnelDepth: 75, Blend: 8 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 140, SunElevation: 45, SunIntensity: 3.4, WaterLevel: 26,
            FogDensity: 0.000075, FogColour: [0.80, 0.72, 0.60],
            SkyZenith: [0.18, 0.38, 0.68], SkyHorizon: [0.88, 0.80, 0.66],
            RockLow: [0.48, 0.24, 0.14], RockHigh: [0.72, 0.45, 0.28],
            SandTint: [0.80, 0.58, 0.36], ScreeTint: [0.55, 0.36, 0.22],
            MeadowTint: [0.30, 0.36, 0.16], DryTint: [0.58, 0.44, 0.24],
            WaterTint: [0.08, 0.32, 0.30],
            Vegetation: 0.28, StrataContrast: 1.0,
        }),
        Stamps:
        [
            { Shape: "Arch", X: 210, Z: -170, Scale: 105, Rotation: 35, Blend: 14, Sink: 6 },
        ],
        Camera: { Azimuth: -52, Elevation: 26, Distance: 2300 },
    },
    {
        Id: "RockyDesert",
        Label: "Rocky Hamada",
        Region: "Rocky desert · 23.4° S",
        Category: "Arid",
        Blurb: "Sandstone badlands & wadi canyonlands: dark desert-varnish mesas, broad golden sand corridors and wind caves.",
        SeedMark: 2340,
        BuildLayers: () =>
        [
            ConstructLayer("CellularPlateau", {
                Label: "Sandstone mesas & wadis", Blend: "Replace", Seed: 2340,
                Params: { Amplitude: 245, BaseElevation: 35, CellSize: 540, EdgeWidth: 0.28, HeightVariance: 0.62 },
            }),
            ConstructLayer("DomainWarp", {
                Label: "Escarpment retreat", Seed: 2343,
                Params: { StrengthMetres: 135, Wavelength: 560 },
            }),
            ConstructLayer("ContinentalMass", {
                Label: "Pediment swell", Seed: 2347, Strength: 0.72,
                Params: { Amplitude: 120, BaseElevation: 0, Wavelength: 960, Octaves: 5, Gain: 0.48, Warp: 130, Plateau: 0.32 },
            }),
            ConstructLayer("StrataTerrace", {
                Label: "Cuesta sandstone bedding", Seed: 2351,
                Params: { BandMetres: 26, RiserWidth: 0.42, TerraceStrength: 0.44, HardContrast: 0.82 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Wadi canyon network", Seed: 2357,
                Params: { Strength: 1.25, Iterations: 3, Sedimentation: 0.65, Capacity: 1.0 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Flash-flood rills & fans", Seed: 2361,
                Params: { Droplets: 140000, Inertia: 0.26, Capacity: 4.0, ErodeRate: 0.32, DepositRate: 0.34, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Talus aprons", Seed: 2363,
                Params: { Iterations: 65, TalusAngle: 32, CliffAngle: 72, Rate: 0.48 },
            }),
            ConstructLayer("AeolianSettle", {
                Label: "Golden wadi sand sheets", Seed: 2369,
                Params: { WindAngle: 42, Slabs: 180000 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Sandstone wind caves (SDF)", Seed: 2373,
                Params: { CaveCount: 2, Aperture: 15, TunnelDepth: 70, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 132, SunElevation: 42, SunIntensity: 3.45, WaterLevel: -60,
            FogDensity: 0.000085, FogColour: [0.84, 0.74, 0.58],
            SkyZenith: [0.20, 0.40, 0.68], SkyHorizon: [0.90, 0.81, 0.64],
            RockLow: [0.42, 0.23, 0.14], RockHigh: [0.68, 0.42, 0.26],
            SandTint: [0.85, 0.66, 0.40], ScreeTint: [0.54, 0.37, 0.23],
            MeadowTint: [0.32, 0.34, 0.15], DryTint: [0.62, 0.46, 0.26],
            Vegetation: 0.08, StrataContrast: 0.72,
        }),
        Stamps: [],
        Camera: { Azimuth: -36, Elevation: 24, Distance: 2350 },
    },
];
