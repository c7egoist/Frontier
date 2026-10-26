//============================================================================================================================================
//                                                              RELIEFPRESETS.JS
//============================================================================================================================================
// 🧩 Four field-tested geologies at 1024² over a 2 km frame: Alpine glaciation, Himalayan collision,
//    sedimentary canyon incision, and an arid inselberg hamada. A preset is nothing hidden — just a
//    layer stack, an atmosphere, a rock palette, and (twice) a starter SDF stamp so the voxel
//    overhang system is visible the moment the world finishes building.

import { ConstructLayer } from "./LayerStackEvaluation.js";

export const DefaultEnvironment =
{
    SunAzimuth: 135.0, SunElevation: 38.0, SunIntensity: 3.1,
    Exposure: 1.05,
    FogDensity: 0.00016, FogColour: [0.62, 0.68, 0.74],
    SkyZenith: [0.16, 0.34, 0.62], SkyHorizon: [0.78, 0.82, 0.86],
    WaterLevel: 40.0, WaterTint: [0.05, 0.23, 0.30],
    RockLow: [0.32, 0.28, 0.24], RockHigh: [0.55, 0.52, 0.48],
    MeadowTint: [0.16, 0.32, 0.10], DryTint: [0.45, 0.39, 0.20],
    SandTint: [0.76, 0.62, 0.38], ScreeTint: [0.42, 0.38, 0.33],
    SnowTint: [0.93, 0.95, 1.00],
    StrataContrast: 0.35, Vegetation: 0.8,
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
        Blurb: "Glaciated granite massif: U-valleys, hanging cirques, meadow floors, snow above 505 m.",
        SeedMark: 4815,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", { Label: "Alpine basement", Blend: "Replace", Seed: 4815,
                Params: { Amplitude: 450, BaseElevation: 40, Wavelength: 1320, Octaves: 7, Gain: 0.52, Warp: 170, Plateau: 0.12 } }),
            ConstructLayer("RidgeUplift", { Label: "Horn & arête crests", Seed: 9021,
                Params: { Amplitude: 465, Wavelength: 860, Octaves: 7, Sharpness: 1.45, Warp: 150 } }),
            ConstructLayer("FluvialIncision", { Label: "Drainage & rivers", Seed: 4817,
                Params: { Strength: 0.8, Iterations: 2, Sedimentation: 0.5, Capacity: 1.1 } }),
            ConstructLayer("GlacialPolish", { Label: "Glacial troughs", Seed: 4819,
                Params: { Strength: 0.68, WidthTexels: 16, ScourMetres: 7 } }),
            ConstructLayer("HydraulicErosion", { Label: "Rill & gully wash", Seed: 4823,
                Params: { Droplets: 170000, Inertia: 0.28, Capacity: 4.5, ErodeRate: 0.32, DepositRate: 0.3, Radius: 2 } }),
            ConstructLayer("ThermalErosion", { Label: "Scree repose", Seed: 4829,
                Params: { Iterations: 55, TalusAngle: 34, Rate: 0.5 } }),
            ConstructLayer("SnowAccumulation", { Label: "Permanent snowfields", Seed: 4831,
                Params: { Snowline: 505, Band: 130, SlopeLimit: 55, Depth: 3 } }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 128, SunElevation: 42, WaterLevel: 104,
            FogDensity: 0.000085, FogColour: [0.66, 0.72, 0.78],
            RockLow: [0.30, 0.28, 0.26], RockHigh: [0.58, 0.57, 0.55],
            MeadowTint: [0.14, 0.34, 0.11], DryTint: [0.42, 0.38, 0.19],
            Vegetation: 1.0, StrataContrast: 0.18,
        }),
        Stamps: [],
        Camera: { Azimuth: -38, Elevation: 24, Distance: 2600 },
    },
    {
        Id: "Himalaya",
        Label: "Khumbu Himalaya",
        Region: "Nepal · 27.9° N",
        Category: "Alpine",
        Blurb: "Active collision front: a 1 700 m ice-bound arc, knife arêtes, gorges cut to the basement.",
        SeedMark: 8848,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", { Label: "Tibetan foreland", Blend: "Replace", Seed: 8848,
                Params: { Amplitude: 260, BaseElevation: 215, Wavelength: 1200, Octaves: 5, Gain: 0.5, Warp: 200, Plateau: 0.05 } }),
            ConstructLayer("TectonicFront", { Label: "Main collision arc", Seed: 8849,
                Params: { Amplitude: 920, Angle: 118, Offset: -80, Width: 470, Asymmetry: 0.45, Meander: 280, Waviness: 1100, CrestWavelength: 300 } }),
            ConstructLayer("RidgeUplift", { Label: "Ice arêtes", Seed: 8851, MaskChannel: "Height", MaskLow: 0.15, MaskHigh: 0.55,
                Params: { Amplitude: 620, Wavelength: 520, Octaves: 5, Sharpness: 1.5, Warp: 130 } }),
            ConstructLayer("FluvialIncision", { Label: "Antecedent gorges", Seed: 8853,
                Params: { Strength: 1.8, Iterations: 4, Sedimentation: 0.45, Capacity: 1.1 } }),
            ConstructLayer("GlacialPolish", { Label: "Imja-style troughs", Seed: 8857,
                Params: { Strength: 0.7, WidthTexels: 15, ScourMetres: 10 } }),
            ConstructLayer("HydraulicErosion", { Label: "Monsoon wash", Seed: 8861,
                Params: { Droplets: 200000, Inertia: 0.3, Capacity: 5.0, ErodeRate: 0.34, DepositRate: 0.28, Radius: 2 } }),
            ConstructLayer("ThermalErosion", { Label: "Frost-shatter repose", Seed: 8863,
                Params: { Iterations: 85, TalusAngle: 35, Rate: 0.5 } }),
            ConstructLayer("SnowAccumulation", { Label: "Névé & icefall snow", Seed: 8867,
                Params: { Snowline: 470, Band: 170, SlopeLimit: 68, Depth: 3.5 } }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 155, SunElevation: 34, SunIntensity: 3.3, WaterLevel: 70,
            FogDensity: 0.00010, FogColour: [0.70, 0.76, 0.83],
            SkyZenith: [0.10, 0.26, 0.58], SkyHorizon: [0.80, 0.85, 0.90],
            RockLow: [0.21, 0.20, 0.19], RockHigh: [0.44, 0.42, 0.40],
            MeadowTint: [0.20, 0.30, 0.13], DryTint: [0.44, 0.37, 0.22],
            WaterTint: [0.10, 0.36, 0.42],
            Vegetation: 0.55, StrataContrast: 0.3,
        }),
        Stamps: [],
        Camera: { Azimuth: -24, Elevation: 20, Distance: 3000 },
    },
    {
        Id: "Canyon",
        Label: "Colorado Canyon",
        Region: "Arizona Plateau · 36.1° N",
        Category: "Arid",
        Blurb: "Sedimentary staircase: hard beds hold the cliffs, soft beds bleed slopes, one river owns the floor.",
        SeedMark: 1609,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", { Label: "Kaibab plateau", Blend: "Replace", Seed: 1609,
                Params: { Amplitude: 330, BaseElevation: 60, Wavelength: 1500, Octaves: 4, Gain: 0.5, Warp: 90, Plateau: 0.8, Tilt: 130, TiltAngle: 38 } }),
            ConstructLayer("StrataTerrace", { Label: "Bedded limestone & shale", Seed: 1613,
                Params: { BandMetres: 24, RiserWidth: 0.42, TerraceStrength: 0.65, HardContrast: 0.9 } }),
            ConstructLayer("FluvialIncision", { Label: "The river", Seed: 1617,
                Params: { Strength: 3.2, Iterations: 6, Sedimentation: 0.35, Capacity: 1.15 } }),
            ConstructLayer("HydraulicErosion", { Label: "Differential wash", Seed: 1619,
                Params: { Droplets: 240000, Inertia: 0.25, Capacity: 4.2, ErodeRate: 0.4, DepositRate: 0.26, Radius: 2 } }),
            ConstructLayer("ThermalErosion", { Label: "Talus aprons", Seed: 1621,
                Params: { Iterations: 44, TalusAngle: 32, CliffAngle: 76, Rate: 0.5 } }),
            ConstructLayer("AeolianSettle", { Label: "Floor sand drift", Seed: 1627,
                Params: { WindAngle: 65, Slabs: 60000 } }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 140, SunElevation: 47, SunIntensity: 3.4, WaterLevel: 22,
            FogDensity: 0.000075, FogColour: [0.80, 0.72, 0.60],
            SkyZenith: [0.18, 0.38, 0.68], SkyHorizon: [0.88, 0.80, 0.66],
            RockLow: [0.48, 0.24, 0.14], RockHigh: [0.72, 0.45, 0.28],
            SandTint: [0.80, 0.58, 0.36], ScreeTint: [0.55, 0.36, 0.22],
            MeadowTint: [0.30, 0.36, 0.16], DryTint: [0.58, 0.44, 0.24],
            WaterTint: [0.08, 0.32, 0.30],
            Vegetation: 0.3, StrataContrast: 1.0,
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
        Blurb: "Bare-rock Hamada: a dissected plateau in retreat — remnants at staggered levels, wadi fans, sand sheeted into the basins.",
        SeedMark: 2340,
        BuildLayers: () =>
        [
            ConstructLayer("CellularPlateau", { Label: "Plateau remnants", Blend: "Replace", Seed: 2340,
                Params: { Amplitude: 235, BaseElevation: 30, CellSize: 560, EdgeWidth: 0.30, HeightVariance: 0.72 } }),
            ConstructLayer("DomainWarp", { Label: "Escarpment retreat", Seed: 2343,
                Params: { StrengthMetres: 150, Wavelength: 520 } }),
            ConstructLayer("ContinentalMass", { Label: "Pediment swell", Seed: 2347, Strength: 0.7,
                Params: { Amplitude: 110, BaseElevation: 0, Wavelength: 900, Octaves: 5, Gain: 0.5, Warp: 120, Plateau: 0.3 } }),
            ConstructLayer("StrataTerrace", { Label: "Cuesta bedding", Seed: 2351,
                Params: { BandMetres: 26, RiserWidth: 0.5, TerraceStrength: 0.35, HardContrast: 0.75 } }),
            ConstructLayer("FluvialIncision", { Label: "Wadi drainage", Seed: 2357,
                Params: { Strength: 0.85, Iterations: 2, Sedimentation: 0.7, Capacity: 0.9 } }),
            ConstructLayer("HydraulicErosion", { Label: "Flash-flood rills", Seed: 2361,
                Params: { Droplets: 115000, Inertia: 0.3, Capacity: 4.0, ErodeRate: 0.3, DepositRate: 0.32, Radius: 2 } }),
            ConstructLayer("ThermalErosion", { Label: "Talus aprons", Seed: 2363,
                Params: { Iterations: 95, TalusAngle: 31, CliffAngle: 70, Rate: 0.5 } }),
            ConstructLayer("AeolianSettle", { Label: "Sand sheeting", Seed: 2369,
                Params: { WindAngle: 40, Slabs: 260000 } }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 118, SunElevation: 56, SunIntensity: 3.5, WaterLevel: -60,
            FogDensity: 0.00011, FogColour: [0.84, 0.74, 0.58],
            SkyZenith: [0.22, 0.42, 0.70], SkyHorizon: [0.90, 0.81, 0.64],
            RockLow: [0.44, 0.30, 0.19], RockHigh: [0.62, 0.44, 0.28],
            SandTint: [0.83, 0.64, 0.38], ScreeTint: [0.52, 0.40, 0.27],
            MeadowTint: [0.32, 0.34, 0.15], DryTint: [0.60, 0.47, 0.25],
            Vegetation: 0.15, StrataContrast: 0.42,
        }),
        Stamps:
        [
            { Shape: "Crag", X: -260, Z: 190, Scale: 85, Rotation: 12, Blend: 16, Sink: 8 },
        ],
        Camera: { Azimuth: -30, Elevation: 22, Distance: 2400 },
    },
];
