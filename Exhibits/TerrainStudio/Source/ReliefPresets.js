//============================================================================================================================================
//                                                              RELIEFPRESETS.JS
//============================================================================================================================================
// 🧩 Fourteen field-tested geologies at 1024² over a 2 km frame across Alpine, Fluvial (Rivers & Lakes),
//    Arid, and Volcanic & Karst provinces. Every preset is an ordinary layer stack combining tectonic/structural
//    uplift, Gaea-style river incision, perched lakes/tarns, glacial/hydraulic/thermal erosion, and 3D SDF caves.

import { ConstructLayer } from "./LayerStackEvaluation.js?v=8";

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
        Blurb: "Glaciated granite massif: sharp Swiss-turbulence arêtes, wide U-valleys, cirque tarns, alpine rivers and 3D karst caves.",
        SeedMark: 4815,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Alpine basement", Blend: "Replace", Seed: 4815,
                Params: { Amplitude: 205, BaseElevation: 42, Wavelength: 1340, Octaves: 5, Gain: 0.48, Warp: 160, Plateau: 0.12, Tilt: 58, TiltAngle: 18 },
            }),
            ConstructLayer("TectonicFront", {
                Label: "Jungfrau–Aar massif wall", Seed: 4816,
                Params: { Amplitude: 365, Angle: 104, Offset: 28, Width: 550, Asymmetry: 0.44, Meander: 215, Waviness: 1020, CrestWavelength: 450 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Horn & arête crests", Seed: 9021,
                Params: { Amplitude: 320, Wavelength: 800, Octaves: 5, Sharpness: 1.56, Warp: 160 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Drainage & rivers", Seed: 4817,
                Params: { Strength: 2.35, Iterations: 5, Sedimentation: 0.50, Capacity: 1.12 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Glacial U-troughs & tarns", Seed: 4819,
                Params: { Strength: 0.74, WidthTexels: 17, ScourMetres: 11 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Rill & couloir wash", Seed: 4823,
                Params: { Droplets: 145000, Inertia: 0.25, Capacity: 4.3, ErodeRate: 0.31, DepositRate: 0.32, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Scree & cliff repose", Seed: 4829,
                Params: { Iterations: 50, TalusAngle: 35, CliffAngle: 75, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Cirque & couloir snowfields", Seed: 4831,
                Params: { Snowline: 410, Band: 72, SlopeLimit: 44, Depth: 4.4 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Alpine karst caves (SDF)", Seed: 4835,
                Params: { CaveCount: 2, Aperture: 15, TunnelDepth: 75, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 128, SunElevation: 38, WaterLevel: 176,
            FogDensity: 0.000085, FogColour: [0.66, 0.72, 0.78],
            RockLow: [0.24, 0.25, 0.28], RockHigh: [0.49, 0.51, 0.54],
            ScreeTint: [0.40, 0.39, 0.36],
            MeadowTint: [0.15, 0.32, 0.12], DryTint: [0.38, 0.35, 0.21],
            WaterTint: [0.06, 0.28, 0.35],
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
        Blurb: "Active collision front: dark Lhotse-banded gneiss walls, pyramidal horns, turquoise meltwater rivers and gorge caves.",
        SeedMark: 8848,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Tibetan foreland", Blend: "Replace", Seed: 8848,
                Params: { Amplitude: 210, BaseElevation: 110, Wavelength: 1260, Octaves: 5, Gain: 0.48, Warp: 190, Plateau: 0.08, Tilt: 55, TiltAngle: 18 },
            }),
            ConstructLayer("TectonicFront", {
                Label: "Main collision arc", Seed: 8849,
                Params: { Amplitude: 365, Angle: 118, Offset: -20, Width: 620, Asymmetry: 0.34, Meander: 245, Waviness: 1120, CrestWavelength: 520 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Ice arêtes & horns", Seed: 8851,
                Params: { Amplitude: 285, Wavelength: 780, Octaves: 5, Sharpness: 1.48, Warp: 155 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Antecedent gorges & rivers", Seed: 8853,
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
                Params: { Snowline: 520, Band: 80, SlopeLimit: 44, Depth: 4.5 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Himalayan cliff caves (SDF)", Seed: 8871,
                Params: { CaveCount: 2, Aperture: 16, TunnelDepth: 80, Blend: 8 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 152, SunElevation: 34, SunIntensity: 3.3, WaterLevel: 312,
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
        Blurb: "Sedimentary staircase: hard beds hold the cliffs, soft beds bleed slopes, Redwall alcove caves and a winding river floor.",
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
                Label: "The Colorado River", Seed: 1617,
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
        Blurb: "Sandstone badlands & wadi canyonlands: dark desert-varnish mesas, broad golden sand corridors, flash-flood pools and wind caves.",
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
            WaterTint: [0.09, 0.29, 0.27],
            Vegetation: 0.08, StrataContrast: 0.72,
        }),
        Stamps: [],
        Camera: { Azimuth: -36, Elevation: 24, Distance: 2350 },
    },
    {
        Id: "Dolomites",
        Label: "Dolomite Towers",
        Region: "South Tyrol · 46.6° N",
        Category: "Alpine",
        Blurb: "Pale carbonate reef towers and castellated ramparts rising sheer above green alpine scree aprons, an emerald tarn and caves.",
        SeedMark: 3342,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Alpe di Siusi alp", Blend: "Replace", Seed: 3342,
                Params: { Amplitude: 210, BaseElevation: 35, Wavelength: 1350, Octaves: 5, Gain: 0.48, Warp: 150, Plateau: 0.16, Tilt: 40, TiltAngle: 34 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Carbonate reef towers", Seed: 3349,
                Params: { Amplitude: 395, Wavelength: 840, Octaves: 5, Sharpness: 1.58, Warp: 160 },
            }),
            ConstructLayer("StrataTerrace", {
                Label: "Dolomia Principale ledges", Seed: 3353,
                Params: { BandMetres: 28, RiserWidth: 0.38, TerraceStrength: 0.48, HardContrast: 0.85 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Mountain torrents & tarns", Seed: 3359,
                Params: { Strength: 2.05, Iterations: 4, Sedimentation: 0.55, Capacity: 1.10 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Cirque tarn basins", Seed: 3361,
                Params: { Strength: 0.68, WidthTexels: 15, ScourMetres: 9 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Couloir & chimney wash", Seed: 3367,
                Params: { Droplets: 140000, Inertia: 0.24, Capacity: 4.0, ErodeRate: 0.32, DepositRate: 0.34, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Pale dolostone talus fans", Seed: 3371,
                Params: { Iterations: 56, TalusAngle: 33, CliffAngle: 74, Rate: 0.50 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Ledge & couloir snow", Seed: 3377,
                Params: { Snowline: 385, Band: 55, SlopeLimit: 40, Depth: 3.5 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Dolostone gallery caves (SDF)", Seed: 3383,
                Params: { CaveCount: 2, Aperture: 15, TunnelDepth: 75, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 142, SunElevation: 36, SunIntensity: 3.25, WaterLevel: 146,
            FogDensity: 0.000080, FogColour: [0.72, 0.75, 0.80],
            SkyZenith: [0.15, 0.34, 0.64], SkyHorizon: [0.82, 0.84, 0.88],
            RockLow: [0.46, 0.42, 0.39], RockHigh: [0.74, 0.68, 0.63],
            ScreeTint: [0.60, 0.56, 0.50],
            MeadowTint: [0.16, 0.36, 0.12], DryTint: [0.46, 0.42, 0.26],
            WaterTint: [0.05, 0.34, 0.32],
            Vegetation: 0.92, StrataContrast: 0.64,
        }),
        Stamps: [],
        Camera: { Azimuth: -44, Elevation: 24, Distance: 2320 },
    },
    {
        Id: "Patagonia",
        Label: "Patagonian Fitz Roy",
        Region: "Southern Andes · 49.3° S",
        Category: "Alpine",
        Blurb: "Wind-scoured granite spires rising above a turquoise glacial piedmont lake, braided outwash streams and ice-worn walls.",
        SeedMark: 4930,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Patagonian piedmont", Blend: "Replace", Seed: 4930,
                Params: { Amplitude: 195, BaseElevation: 40, Wavelength: 1380, Octaves: 5, Gain: 0.48, Warp: 160, Plateau: 0.14, Tilt: 65, TiltAngle: 12 },
            }),
            ConstructLayer("TectonicFront", {
                Label: "Chaltén batholith wall", Seed: 4933,
                Params: { Amplitude: 390, Angle: 96, Offset: 35, Width: 540, Asymmetry: 0.45, Meander: 210, Waviness: 980, CrestWavelength: 440 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Granite needles & buttresses", Seed: 4937,
                Params: { Amplitude: 310, Wavelength: 820, Octaves: 5, Sharpness: 1.56, Warp: 160 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Meltwater rivers & lakes", Seed: 4941,
                Params: { Strength: 2.45, Iterations: 5, Sedimentation: 0.52, Capacity: 1.12 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Laguna de los Tres scour", Seed: 4947,
                Params: { Strength: 0.78, WidthTexels: 18, ScourMetres: 12 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Roaring-forties storm wash", Seed: 4951,
                Params: { Droplets: 145000, Inertia: 0.25, Capacity: 4.3, ErodeRate: 0.31, DepositRate: 0.32, Radius: 3 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Granite boulder talus", Seed: 4957,
                Params: { Iterations: 50, TalusAngle: 35, CliffAngle: 75, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Rime ice & hanging glaciers", Seed: 4961,
                Params: { Snowline: 355, Band: 70, SlopeLimit: 45, Depth: 4.2 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Glacial cliff caves (SDF)", Seed: 4967,
                Params: { CaveCount: 2, Aperture: 15, TunnelDepth: 75, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 118, SunElevation: 32, SunIntensity: 3.3, WaterLevel: 186,
            FogDensity: 0.000090, FogColour: [0.68, 0.75, 0.82],
            SkyZenith: [0.12, 0.30, 0.60], SkyHorizon: [0.78, 0.84, 0.90],
            RockLow: [0.26, 0.25, 0.24], RockHigh: [0.58, 0.50, 0.42],
            ScreeTint: [0.40, 0.38, 0.35],
            MeadowTint: [0.19, 0.30, 0.14], DryTint: [0.42, 0.36, 0.24],
            WaterTint: [0.08, 0.38, 0.44],
            Vegetation: 0.52, StrataContrast: 0.25,
        }),
        Stamps: [],
        Camera: { Azimuth: -22, Elevation: 22, Distance: 2380 },
    },
    {
        Id: "CirqueTarns",
        Label: "Tatra Cirque & Tarns",
        Region: "High Tatras · 49.2° N",
        Category: "Alpine",
        Blurb: "Amphitheatre of dark granite arêtes cradling multi-level glacial paternoster tarns linked by cascading rock spillways.",
        SeedMark: 4920,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Carpathian uplift", Blend: "Replace", Seed: 4920,
                Params: { Amplitude: 230, BaseElevation: 65, Wavelength: 1280, Octaves: 5, Gain: 0.48, Warp: 165, Plateau: 0.16, Tilt: 30, TiltAngle: 45 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Cirque amphitheatre arêtes", Seed: 4923,
                Params: { Amplitude: 375, Wavelength: 820, Octaves: 5, Sharpness: 1.52, Warp: 175 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Spillway cascades & tarns", Seed: 4927,
                Params: { Strength: 2.30, Iterations: 5, Sedimentation: 0.56, Capacity: 1.08 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Paternoster tarn scour", Seed: 4931,
                Params: { Strength: 0.82, WidthTexels: 18, ScourMetres: 13 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Couloir rill network", Seed: 4935,
                Params: { Droplets: 135000, Inertia: 0.26, Capacity: 4.1, ErodeRate: 0.30, DepositRate: 0.34, Radius: 3 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Cirque scree cones", Seed: 4939,
                Params: { Iterations: 54, TalusAngle: 34, CliffAngle: 70, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "High cirque snow patches", Seed: 4943,
                Params: { Snowline: 370, Band: 60, SlopeLimit: 40, Depth: 3.5 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Tatra granite caves (SDF)", Seed: 4949,
                Params: { CaveCount: 2, Aperture: 14, TunnelDepth: 70, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 136, SunElevation: 37, SunIntensity: 3.15, WaterLevel: 196,
            FogDensity: 0.000085, FogColour: [0.66, 0.73, 0.79],
            RockLow: [0.22, 0.24, 0.26], RockHigh: [0.46, 0.49, 0.52],
            ScreeTint: [0.38, 0.39, 0.37],
            MeadowTint: [0.14, 0.33, 0.13], DryTint: [0.36, 0.34, 0.20],
            WaterTint: [0.04, 0.28, 0.34],
            Vegetation: 0.78, StrataContrast: 0.20,
        }),
        Stamps: [],
        Camera: { Azimuth: -34, Elevation: 26, Distance: 2300 },
    },
    {
        Id: "ScottishGlen",
        Label: "Highland Glen & Loch",
        Region: "Scottish Highlands · 56.7° N",
        Category: "Fluvial",
        Blurb: "Classic U-shaped glaciated glen flooded by a deep Highland loch, fed by cascading mountain rivers and heather-clad ridges.",
        SeedMark: 5670,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Caledonian basement", Blend: "Replace", Seed: 5670,
                Params: { Amplitude: 220, BaseElevation: 25, Wavelength: 1420, Octaves: 5, Gain: 0.48, Warp: 180, Plateau: 0.20, Tilt: 25, TiltAngle: 62 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Glen Etive crags & spurs", Seed: 5673,
                Params: { Amplitude: 320, Wavelength: 860, Octaves: 5, Sharpness: 1.38, Warp: 170 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Glen river & loch basin", Seed: 5679,
                Params: { Strength: 2.65, Iterations: 5, Sedimentation: 0.54, Capacity: 1.10 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Loch trough overdeepening", Seed: 5683,
                Params: { Strength: 0.80, WidthTexels: 20, ScourMetres: 13 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Peat burn & waterfall wash", Seed: 5689,
                Params: { Droplets: 150000, Inertia: 0.24, Capacity: 4.2, ErodeRate: 0.32, DepositRate: 0.32, Radius: 3 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Bracken & talus slopes", Seed: 5693,
                Params: { Iterations: 50, TalusAngle: 33, CliffAngle: 66, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Summit cornice snow", Seed: 5699,
                Params: { Snowline: 410, Band: 55, SlopeLimit: 38, Depth: 2.5 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Highland sea-glen caves (SDF)", Seed: 5703,
                Params: { CaveCount: 2, Aperture: 15, TunnelDepth: 72, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 148, SunElevation: 31, SunIntensity: 3.05, WaterLevel: 138,
            FogDensity: 0.000110, FogColour: [0.64, 0.70, 0.75],
            SkyZenith: [0.18, 0.34, 0.56], SkyHorizon: [0.76, 0.80, 0.84],
            RockLow: [0.25, 0.24, 0.23], RockHigh: [0.46, 0.44, 0.41],
            ScreeTint: [0.38, 0.35, 0.31],
            MeadowTint: [0.18, 0.31, 0.11], DryTint: [0.44, 0.33, 0.18],
            SandTint: [0.62, 0.54, 0.40],
            WaterTint: [0.04, 0.19, 0.26],
            Vegetation: 0.92, StrataContrast: 0.24,
        }),
        Stamps: [],
        Camera: { Azimuth: -42, Elevation: 23, Distance: 2320 },
    },
    {
        Id: "Fjord",
        Label: "Norwegian Fjord",
        Region: "Western Norway · 62.1° N",
        Category: "Fluvial",
        Blurb: "Deeply drowned glacial fjord with sheer gneiss walls, high plateau snowfields, hanging valley streams and sea-cliff caves.",
        SeedMark: 6210,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Fjell plateau", Blend: "Replace", Seed: 6210,
                Params: { Amplitude: 280, BaseElevation: 40, Wavelength: 1480, Octaves: 5, Gain: 0.48, Warp: 150, Plateau: 0.58, Tilt: 40, TiltAngle: -24 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Geiranger gneiss walls", Seed: 6217,
                Params: { Amplitude: 330, Wavelength: 820, Octaves: 5, Sharpness: 1.44, Warp: 155 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Fjord trunk & hanging streams", Seed: 6221,
                Params: { Strength: 2.95, Iterations: 6, Sedimentation: 0.42, Capacity: 1.18 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Deep fjord ice trough", Seed: 6229,
                Params: { Strength: 0.84, WidthTexels: 20, ScourMetres: 15 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Seven Sisters waterfall chutes", Seed: 6233,
                Params: { Droplets: 145000, Inertia: 0.25, Capacity: 4.3, ErodeRate: 0.32, DepositRate: 0.28, Radius: 3 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Fjord wall repose", Seed: 6239,
                Params: { Iterations: 48, TalusAngle: 35, CliffAngle: 76, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Jostedalsbreen plateau snow", Seed: 6247,
                Params: { Snowline: 360, Band: 60, SlopeLimit: 42, Depth: 4.0 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Fjord sea-cliff caves (SDF)", Seed: 6253,
                Params: { CaveCount: 2, Aperture: 16, TunnelDepth: 78, Blend: 8 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 130, SunElevation: 33, SunIntensity: 3.15, WaterLevel: 218,
            FogDensity: 0.000095, FogColour: [0.65, 0.73, 0.80],
            SkyZenith: [0.13, 0.31, 0.60], SkyHorizon: [0.77, 0.83, 0.89],
            RockLow: [0.21, 0.23, 0.26], RockHigh: [0.45, 0.47, 0.50],
            ScreeTint: [0.36, 0.37, 0.36],
            MeadowTint: [0.14, 0.34, 0.13], DryTint: [0.36, 0.34, 0.22],
            WaterTint: [0.03, 0.22, 0.30],
            Vegetation: 0.82, StrataContrast: 0.28,
        }),
        Stamps: [],
        Camera: { Azimuth: -48, Elevation: 25, Distance: 2350 },
    },
    {
        Id: "BraidedValley",
        Label: "Braided River Valley",
        Region: "Southern Alps · 43.8° S",
        Category: "Fluvial",
        Blurb: "Wide gravel-bed braided river plain fed by eroded greywacke mountain catchments, coalescing alluvial fans and floodplain pools.",
        SeedMark: 4380,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Rakaia valley floor", Blend: "Replace", Seed: 4380,
                Params: { Amplitude: 185, BaseElevation: 35, Wavelength: 1450, Octaves: 5, Gain: 0.48, Warp: 160, Plateau: 0.18, Tilt: 55, TiltAngle: 32 },
            }),
            ConstructLayer("TectonicFront", {
                Label: "Southern Alps divide", Seed: 4383,
                Params: { Amplitude: 330, Angle: 128, Offset: 120, Width: 580, Asymmetry: 0.36, Meander: 220, Waviness: 1050, CrestWavelength: 480 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Greywacke feeder spurs", Seed: 4389,
                Params: { Amplitude: 240, Wavelength: 760, Octaves: 5, Sharpness: 1.45, Warp: 145 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Braided river & gravel fans", Seed: 4393,
                Params: { Strength: 2.75, Iterations: 6, Sedimentation: 0.68, Capacity: 1.05 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Outwash plain widening", Seed: 4397,
                Params: { Strength: 0.70, WidthTexels: 18, ScourMetres: 8 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Shingle fan & stream wash", Seed: 4403,
                Params: { Droplets: 165000, Inertia: 0.24, Capacity: 4.4, ErodeRate: 0.34, DepositRate: 0.38, Radius: 3 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Shingle scree aprons", Seed: 4409,
                Params: { Iterations: 56, TalusAngle: 33, CliffAngle: 68, Rate: 0.50 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "High divide snowline", Seed: 4413,
                Params: { Snowline: 390, Band: 65, SlopeLimit: 41, Depth: 3.5 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Gorge undercut caves (SDF)", Seed: 4419,
                Params: { CaveCount: 2, Aperture: 15, TunnelDepth: 72, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 124, SunElevation: 39, SunIntensity: 3.25, WaterLevel: 168,
            FogDensity: 0.000080, FogColour: [0.68, 0.74, 0.79],
            RockLow: [0.27, 0.28, 0.30], RockHigh: [0.50, 0.51, 0.53],
            SandTint: [0.64, 0.62, 0.58], ScreeTint: [0.46, 0.45, 0.43],
            MeadowTint: [0.20, 0.34, 0.14], DryTint: [0.48, 0.42, 0.26],
            WaterTint: [0.07, 0.35, 0.40],
            Vegetation: 0.72, StrataContrast: 0.22,
        }),
        Stamps: [],
        Camera: { Azimuth: -36, Elevation: 25, Distance: 2340 },
    },
    {
        Id: "Caldera",
        Label: "Icelandic Caldera Lake",
        Region: "Central Highlands · 65.0° N",
        Category: "Volcanic",
        Blurb: "Dark basalt ring-ridge and black tephra slopes enclosing a luminous turquoise crater lake, rhyolite gullies and lava caves.",
        SeedMark: 6501,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "Askja volcanic shield", Blend: "Replace", Seed: 6501,
                Params: { Amplitude: 240, BaseElevation: 55, Wavelength: 1360, Octaves: 5, Gain: 0.48, Warp: 165, Plateau: 0.28, Tilt: 20, TiltAngle: 15 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Caldera ring & tephra cones", Seed: 6507,
                Params: { Amplitude: 345, Wavelength: 840, Octaves: 5, Sharpness: 1.48, Warp: 185 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Crater lake & radial gullies", Seed: 6511,
                Params: { Strength: 2.25, Iterations: 5, Sedimentation: 0.58, Capacity: 1.08 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Caldera basin overdeepening", Seed: 6517,
                Params: { Strength: 0.76, WidthTexels: 18, ScourMetres: 12 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Tephra & rhyolite rills", Seed: 6521,
                Params: { Droplets: 150000, Inertia: 0.25, Capacity: 4.2, ErodeRate: 0.34, DepositRate: 0.34, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Black cinders & talus", Seed: 6529,
                Params: { Iterations: 54, TalusAngle: 33, CliffAngle: 70, Rate: 0.48 },
            }),
            ConstructLayer("SnowAccumulation", {
                Label: "Caldera rim snowdrifts", Seed: 6533,
                Params: { Snowline: 350, Band: 60, SlopeLimit: 40, Depth: 3.2 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Basalt lava tubes (SDF)", Seed: 6539,
                Params: { CaveCount: 2, Aperture: 16, TunnelDepth: 78, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 144, SunElevation: 32, SunIntensity: 3.25, WaterLevel: 194,
            FogDensity: 0.000095, FogColour: [0.66, 0.72, 0.77],
            SkyZenith: [0.14, 0.30, 0.56], SkyHorizon: [0.76, 0.81, 0.86],
            RockLow: [0.15, 0.16, 0.18], RockHigh: [0.42, 0.36, 0.30],
            SandTint: [0.28, 0.27, 0.26], ScreeTint: [0.24, 0.23, 0.22],
            MeadowTint: [0.22, 0.36, 0.10], DryTint: [0.46, 0.36, 0.22],
            WaterTint: [0.06, 0.40, 0.44],
            Vegetation: 0.55, StrataContrast: 0.35,
        }),
        Stamps: [],
        Camera: { Azimuth: -30, Elevation: 26, Distance: 2320 },
    },
    {
        Id: "KarstRiver",
        Label: "Guilin Karst River",
        Region: "Guangxi · 25.2° N",
        Category: "Volcanic",
        Blurb: "Fengcong limestone tower-karst pinnacles and solution caves rising out of a meandering jade river plain and flooded basins.",
        SeedMark: 2520,
        BuildLayers: () =>
        [
            ConstructLayer("CellularPlateau", {
                Label: "Karst cockpit basins", Blend: "Replace", Seed: 2520,
                Params: { Amplitude: 220, BaseElevation: 30, CellSize: 460, EdgeWidth: 0.34, HeightVariance: 0.68 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Fenglin limestone towers", Seed: 2527,
                Params: { Amplitude: 340, Wavelength: 760, Octaves: 5, Sharpness: 1.62, Warp: 160 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Li River & karst lagoons", Seed: 2531,
                Params: { Strength: 2.55, Iterations: 5, Sedimentation: 0.58, Capacity: 1.12 },
            }),
            ConstructLayer("GlacialPolish", {
                Label: "Floodplain valley flat", Seed: 2537,
                Params: { Strength: 0.74, WidthTexels: 18, ScourMetres: 10 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Subtropical solution wash", Seed: 2543,
                Params: { Droplets: 145000, Inertia: 0.26, Capacity: 4.1, ErodeRate: 0.32, DepositRate: 0.34, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Tower cliff repose", Seed: 2549,
                Params: { Iterations: 48, TalusAngle: 35, CliffAngle: 78, Rate: 0.48 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Karst river caves (SDF)", Seed: 2557,
                Params: { CaveCount: 3, Aperture: 17, TunnelDepth: 82, Blend: 8 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 132, SunElevation: 38, SunIntensity: 3.15, WaterLevel: 146,
            FogDensity: 0.000125, FogColour: [0.70, 0.77, 0.76],
            SkyZenith: [0.18, 0.38, 0.62], SkyHorizon: [0.80, 0.85, 0.83],
            RockLow: [0.24, 0.26, 0.25], RockHigh: [0.48, 0.50, 0.47],
            SandTint: [0.68, 0.62, 0.46], ScreeTint: [0.36, 0.38, 0.34],
            MeadowTint: [0.13, 0.35, 0.12], DryTint: [0.34, 0.36, 0.20],
            WaterTint: [0.05, 0.34, 0.28],
            Vegetation: 0.95, StrataContrast: 0.38,
        }),
        Stamps:
        [
            { Shape: "Arch", X: -180, Z: 140, Scale: 95, Rotation: 62, Blend: 14, Sink: 5 },
        ],
        Camera: { Azimuth: -40, Elevation: 24, Distance: 2320 },
    },
    {
        Id: "MonumentButte",
        Label: "Monument Butte & Arroyo",
        Region: "Colorado Plateau · 37.0° N",
        Category: "Arid",
        Blurb: "Isolated De Chelly red-sandstone mittens and stratified mesas cut by dendritic flash-flood arroyos and desert waterholes.",
        SeedMark: 3700,
        BuildLayers: () =>
        [
            ConstructLayer("CellularPlateau", {
                Label: "Monument mesas & mittens", Blend: "Replace", Seed: 3700,
                Params: { Amplitude: 275, BaseElevation: 40, CellSize: 620, EdgeWidth: 0.24, HeightVariance: 0.70 },
            }),
            ConstructLayer("DomainWarp", {
                Label: "Cliff retreat & fins", Seed: 3707,
                Params: { StrengthMetres: 115, Wavelength: 520 },
            }),
            ConstructLayer("StrataTerrace", {
                Label: "Organ Rock & De Chelly beds", Seed: 3713,
                Params: { BandMetres: 22, RiserWidth: 0.36, TerraceStrength: 0.62, HardContrast: 0.90 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Dendritic arroyo & pools", Seed: 3719,
                Params: { Strength: 1.85, Iterations: 4, Sedimentation: 0.60, Capacity: 1.05 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Caprock pedestal wash", Seed: 3727,
                Params: { Droplets: 150000, Inertia: 0.25, Capacity: 4.1, ErodeRate: 0.34, DepositRate: 0.32, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Red talus cones", Seed: 3733,
                Params: { Iterations: 58, TalusAngle: 32, CliffAngle: 76, Rate: 0.50 },
            }),
            ConstructLayer("AeolianSettle", {
                Label: "Valley dune ripples", Seed: 3739,
                Params: { WindAngle: 52, Slabs: 130000 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Sandstone alcove caves (SDF)", Seed: 3747,
                Params: { CaveCount: 2, Aperture: 16, TunnelDepth: 74, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 136, SunElevation: 40, SunIntensity: 3.45, WaterLevel: 22,
            FogDensity: 0.000075, FogColour: [0.84, 0.72, 0.58],
            SkyZenith: [0.17, 0.37, 0.67], SkyHorizon: [0.90, 0.79, 0.64],
            RockLow: [0.52, 0.22, 0.13], RockHigh: [0.76, 0.42, 0.24],
            SandTint: [0.84, 0.60, 0.38], ScreeTint: [0.58, 0.34, 0.20],
            MeadowTint: [0.30, 0.34, 0.16], DryTint: [0.60, 0.42, 0.24],
            WaterTint: [0.09, 0.30, 0.28],
            Vegetation: 0.14, StrataContrast: 0.92,
        }),
        Stamps: [],
        Camera: { Azimuth: -46, Elevation: 24, Distance: 2320 },
    },
    {
        Id: "Badlands",
        Label: "Painted Badlands & Fans",
        Region: "Dakota Basin · 43.7° N",
        Category: "Arid",
        Blurb: "Intricately gullied polychrome mudstone ridges shedding sediment into broad coalescing alluvial fans and a playa lake.",
        SeedMark: 4370,
        BuildLayers: () =>
        [
            ConstructLayer("ContinentalMass", {
                Label: "White River tableland", Blend: "Replace", Seed: 4370,
                Params: { Amplitude: 190, BaseElevation: 40, Wavelength: 1320, Octaves: 5, Gain: 0.48, Warp: 145, Plateau: 0.46, Tilt: 45, TiltAngle: 22 },
            }),
            ConstructLayer("RidgeUplift", {
                Label: "Knife-edge badland divides", Seed: 4373,
                Params: { Amplitude: 265, Wavelength: 620, Octaves: 5, Sharpness: 1.64, Warp: 140 },
            }),
            ConstructLayer("StrataTerrace", {
                Label: "Polychrome bentonite bands", Seed: 4379,
                Params: { BandMetres: 18, RiserWidth: 0.44, TerraceStrength: 0.46, HardContrast: 0.84 },
            }),
            ConstructLayer("FluvialIncision", {
                Label: "Dendritic washes & playa", Seed: 4387,
                Params: { Strength: 2.40, Iterations: 5, Sedimentation: 0.72, Capacity: 0.95 },
            }),
            ConstructLayer("HydraulicErosion", {
                Label: "Dense badland rill carving", Seed: 4391,
                Params: { Droplets: 185000, Inertia: 0.20, Capacity: 4.5, ErodeRate: 0.38, DepositRate: 0.38, Radius: 2 },
            }),
            ConstructLayer("ThermalErosion", {
                Label: "Mudstone pediment fans", Seed: 4399,
                Params: { Iterations: 52, TalusAngle: 31, CliffAngle: 68, Rate: 0.50 },
            }),
            ConstructLayer("CaveNetwork", {
                Label: "Piping & undercut caves (SDF)", Seed: 4407,
                Params: { CaveCount: 2, Aperture: 14, TunnelDepth: 68, Blend: 7 },
            }),
        ],
        Environment: Environment(
        {
            SunAzimuth: 142, SunElevation: 41, SunIntensity: 3.35, WaterLevel: 52,
            FogDensity: 0.000080, FogColour: [0.82, 0.75, 0.64],
            SkyZenith: [0.18, 0.38, 0.66], SkyHorizon: [0.88, 0.81, 0.68],
            RockLow: [0.46, 0.32, 0.24], RockHigh: [0.74, 0.58, 0.44],
            SandTint: [0.80, 0.68, 0.50], ScreeTint: [0.58, 0.46, 0.36],
            MeadowTint: [0.28, 0.36, 0.16], DryTint: [0.62, 0.50, 0.34],
            WaterTint: [0.10, 0.32, 0.30],
            Vegetation: 0.24, StrataContrast: 0.88,
        }),
        Stamps: [],
        Camera: { Azimuth: -38, Elevation: 25, Distance: 2300 },
    },
];
