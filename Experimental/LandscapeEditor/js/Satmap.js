// 📦 Satmap composer — stylised albedo from elevation, slope, protrusions, rivers and sediment, plus analysis ramps for each channel.

import { LatticeHash } from "./Random.js";
import { SmoothStep, SmootherStep } from "./Generators.js";

/// in    Id       [-]  palette identifier
/// out   Palette  [-]  colour table in sRGB 0–255 with climate knobs
export const Palettes = {
    Temperate: {
        Name: "Temperate", Lowland: [86, 110, 56], Midland: [108, 118, 66], Highland: [128, 116, 98], Rock: [116, 106, 98],
        Snow: [238, 242, 246], Sand: [196, 178, 132], Soil: [96, 82, 62], Shallow: [88, 152, 160], Deep: [28, 62, 92],
        Water: [46, 88, 116], Vegetation: [60, 92, 52], SnowLine: 2600, VegetationAmount: 0.8, Rockiness: 0.5, Wetness: 0.5,
    },
    Arid: {
        Name: "Arid", Lowland: [204, 168, 116], Midland: [190, 146, 102], Highland: [170, 124, 96], Rock: [142, 104, 80],
        Snow: [242, 238, 230], Sand: [224, 194, 138], Soil: [150, 122, 92], Shallow: [96, 172, 170], Deep: [34, 72, 92],
        Water: [60, 100, 110], Vegetation: [126, 128, 84], SnowLine: 4200, VegetationAmount: 0.15, Rockiness: 0.7, Wetness: 0.1,
    },
    Sandstone: {
        Name: "Sandstone", Lowland: [196, 118, 72], Midland: [210, 134, 84], Highland: [222, 152, 98], Rock: [166, 84, 56],
        Snow: [242, 236, 230], Sand: [232, 182, 124], Soil: [122, 80, 58], Shallow: [96, 166, 168], Deep: [34, 70, 92],
        Water: [60, 100, 110], Vegetation: [120, 124, 78], SnowLine: 4200, VegetationAmount: 0.12, Rockiness: 0.85, Wetness: 0.08,
    },
    Alpine: {
        Name: "Alpine", Lowland: [72, 104, 58], Midland: [96, 112, 74], Highland: [118, 114, 108], Rock: [100, 98, 98],
        Snow: [246, 248, 252], Sand: [180, 168, 140], Soil: [88, 78, 64], Shallow: [88, 158, 170], Deep: [24, 58, 92],
        Water: [44, 90, 124], Vegetation: [84, 124, 62], SnowLine: 2500, VegetationAmount: 0.75, Rockiness: 0.6, Wetness: 0.55,
    },
    Himalayan: {
        Name: "Himalayan", Lowland: [102, 110, 74], Midland: [118, 112, 92], Highland: [132, 126, 120], Rock: [110, 104, 100],
        Snow: [248, 250, 255], Sand: [176, 160, 132], Soil: [92, 84, 66], Shallow: [84, 150, 166], Deep: [26, 60, 94],
        Water: [48, 92, 124], Vegetation: [78, 96, 58], SnowLine: 4800, VegetationAmount: 0.55, Rockiness: 0.75, Wetness: 0.4,
    },
    Volcanic: {
        Name: "Volcanic", Lowland: [84, 104, 72], Midland: [96, 102, 84], Highland: [66, 66, 68], Rock: [46, 45, 47],
        Snow: [236, 240, 244], Sand: [78, 74, 72], Soil: [64, 60, 56], Shallow: [78, 136, 146], Deep: [22, 52, 78],
        Water: [40, 84, 110], Vegetation: [102, 130, 76], SnowLine: 1200, VegetationAmount: 0.6, Rockiness: 0.8, Wetness: 0.6,
    },
    Coastal: {
        Name: "Coastal", Lowland: [104, 126, 70], Midland: [118, 118, 80], Highland: [132, 120, 104], Rock: [124, 116, 106],
        Snow: [240, 242, 246], Sand: [226, 210, 168], Soil: [102, 88, 68], Shallow: [102, 186, 186], Deep: [26, 72, 102],
        Water: [48, 98, 124], Vegetation: [84, 112, 60], SnowLine: 3200, VegetationAmount: 0.7, Rockiness: 0.6, Wetness: 0.5,
    },
    Glacial: {
        Name: "Glacial", Lowland: [126, 140, 118], Midland: [154, 162, 158], Highland: [182, 186, 190], Rock: [116, 116, 118],
        Snow: [248, 250, 254], Sand: [198, 200, 206], Soil: [102, 100, 96], Shallow: [116, 176, 186], Deep: [40, 76, 104],
        Water: [72, 118, 140], Vegetation: [96, 118, 88], SnowLine: 1600, VegetationAmount: 0.3, Rockiness: 0.65, Wetness: 0.45,
    },
};

/// in    Id       [-]  palette identifier
/// out   Palette  [-]  requested palette, or Temperate when unknown
export function ResolvePalette(Id) {
    return Palettes[Id] ?? Palettes.Temperate;
}

/// in    Stops    [-]  array of [Position, R, G, B] with Position in [0, 1]
/// in    T        [-]  sample position in [0, 1]
/// out   Colour   [-]  [R, G, B] in 0–255 interpolated from the stops
function Ramp(Stops, T) {
    const Clamped = Math.min(Math.max(T, 0), 1);
    for (let Index = 1; Index < Stops.length; Index++) {
        if (Clamped <= Stops[Index][0]) {
            const [P0, R0, G0, B0] = Stops[Index - 1];
            const [P1, R1, G1, B1] = Stops[Index];
            const Local = (Clamped - P0) / Math.max(P1 - P0, 1e-6);
            return [R0 + (R1 - R0) * Local, G0 + (G1 - G0) * Local, B0 + (B1 - B0) * Local];
        }
    }
    const Last = Stops[Stops.length - 1];
    return [Last[1], Last[2], Last[3]];
}

const Ramps = {
    Height: [[0, 22, 34, 66], [0.25, 46, 96, 92], [0.5, 122, 150, 80], [0.75, 170, 130, 90], [1, 246, 244, 240]],
    Slope: [[0, 14, 18, 22], [0.35, 110, 92, 40], [0.7, 196, 120, 40], [1, 240, 236, 210]],
    Flow: [[0, 18, 22, 28], [0.4, 40, 78, 110], [0.75, 96, 186, 220], [1, 240, 252, 255]],
    Sediment: [[0, 14, 12, 12], [0.4, 120, 74, 40], [0.75, 214, 156, 88], [1, 250, 232, 196]],
    Erosion: [[0, 14, 12, 14], [0.4, 140, 40, 32], [0.75, 226, 118, 46], [1, 252, 222, 150]],
    Moisture: [[0, 120, 92, 56], [0.5, 96, 150, 90], [0.8, 60, 128, 170], [1, 40, 80, 150]],
};

/// in    Mode      [-]  satmap identifier
/// out   Label     [-]  dropdown caption
export const SatmapModes = [
    { Id: "Composite", Label: "Composite (satellite)", Hint: "Stylised albedo from elevation, slope, protrusions, rivers and sediment." },
    { Id: "Height", Label: "Elevation", Hint: "Absolute height above sea level." },
    { Id: "Slope", Label: "Slope", Hint: "Steepness in degrees." },
    { Id: "Protrusion", Label: "Protrusions & hollows", Hint: "Red: convex crests and spurs. Blue: concave hollows." },
    { Id: "Rivers", Label: "Rivers & drainage", Hint: "Flow accumulation through the priority-flood router." },
    { Id: "Sediment", Label: "Sedimentation", Hint: "Material deposited by erosion layers." },
    { Id: "Erosion", Label: "Erosion intensity", Hint: "Material removed by erosion layers." },
    { Id: "Moisture", Label: "Moisture", Hint: "Soil wetness from drainage area, altitude and hollows." },
    { Id: "Coast", Label: "Coast distance", Hint: "Signed distance to the shoreline." },
];

/// in    Heights   [m]   Float32Array surface
/// in    Analysis  [-]   AnalyseTerrain output
/// in    Result    [-]   EvaluateProject result, providing Sediment, Erosion, Sea, Cell and N
/// out   Scale     [-]   { Sediment, Erosion } 95th-percentile normalisers
function Percentile95(Field) {
    const Sorted = Float32Array.from(Field).sort();
    return Math.max(Sorted[Math.floor(Sorted.length * 0.95)] || 0, 1e-6);
}

/// in    Result    [-]   EvaluateProject result
/// in    Mode      [-]   satmap identifier
/// in    Palette   [-]   palette identifier
/// out   Pixels    [-]   Uint8ClampedArray RGBA of N×N
export function ComposeSatmap(Result, Mode, Palette) {
    const { N, Cell, Sea, Heights, Analysis, Sediment, Erosion } = Result;
    const Total = N * N;
    const Pixels = new Uint8ClampedArray(Total * 4);
    const Pal = ResolvePalette(Palette);
    const SedimentScale = Percentile95(Sediment);
    const ErosionScale = Percentile95(Erosion);
    const Highest = Math.max(Analysis.Highest, 1);
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            const Elevation = Heights[Index];
            const Submerged = Elevation <= Sea;
            let Colour;
            switch (Mode) {
                case "Height":
                    Colour = Ramp(Ramps.Height, (Elevation - Math.min(Sea, 0)) / Highest);
                    break;
                case "Slope":
                    Colour = Ramp(Ramps.Slope, Analysis.Slope[Index] / 60);
                    break;
                case "Protrusion": {
                    const Curvature = Analysis.Protrusion[Index];
                    const Hot = Math.max(Curvature, 0);
                    const Cold = Math.max(-Curvature, 0);
                    Colour = [
                        236 * Hot + 40 * (1 - Hot - Cold) + 30 * Cold,
                        80 * Hot + 40 * (1 - Hot - Cold) + 110 * Cold,
                        60 * Hot + 46 * (1 - Hot - Cold) + 230 * Cold,
                    ];
                    break;
                }
                case "Rivers": {
                    Colour = Submerged ? Ramp(Ramps.Flow, 0.02) : Ramp(Ramps.Flow, Analysis.River[Index]);
                    break;
                }
                case "Sediment":
                    Colour = Ramp(Ramps.Sediment, Sediment[Index] / (SedimentScale * 1.6));
                    break;
                case "Erosion":
                    Colour = Ramp(Ramps.Erosion, Erosion[Index] / (ErosionScale * 1.6));
                    break;
                case "Moisture":
                    Colour = Ramp(Ramps.Moisture, Analysis.Moisture[Index]);
                    break;
                case "Coast": {
                    const Signed = Analysis.Coast[Index];
                    const Scale = Math.max(Cell * 40, 1);
                    const Land = SmoothStep(-Scale, Scale, Signed);
                    Colour = [
                        Land * 150 + (1 - Land) * 26,
                        Land * 126 + (1 - Land) * 82,
                        Land * 84 + (1 - Land) * 150,
                    ];
                    break;
                }
                default:
                    Colour = Composite(Result, Index, X, Y, Pal, SedimentScale, ErosionScale);
            }
            const Offset = Index * 4;
            Pixels[Offset] = Colour[0];
            Pixels[Offset + 1] = Colour[1];
            Pixels[Offset + 2] = Colour[2];
            Pixels[Offset + 3] = 255;
        }
    }
    return Pixels;
}

/// in    Result     [-]  EvaluateProject result
/// in    Index      [-]  cell index
/// in    X, Y       [-]  cell coordinates
/// in    Pal        [-]  resolved palette
/// in    SedScale   [m]  sediment normaliser
/// in    EroScale   [m]  erosion normaliser
/// out   Colour     [-]  [R, G, B] albedo in 0–255
function Composite(Result, Index, X, Y, Pal, SedScale, EroScale) {
    const { N, Cell, Sea, Heights, Analysis, Sediment, Erosion } = Result;
    const Elevation = Heights[Index];
    const Highest = Math.max(Analysis.Highest, 1);
    const Along = Math.min(Math.max(Elevation / Highest, 0), 1);
    const Slope = Analysis.Slope[Index];
    const Curvature = Analysis.Protrusion[Index];
    const Moist = Analysis.Moisture[Index];
    const Sediments = Math.min(Sediment[Index] / (SedScale * 1.6), 1);
    const Eroded = Math.min(Erosion[Index] / (EroScale * 1.6), 1);
    const River = Analysis.River[Index];
    const Coast = Analysis.Coast[Index];
    const Breakup = Patch(Result.Seed, X * Cell, Y * Cell);
    const Fine = Patch(Result.Seed + 19, X * Cell, Y * Cell, 45);
    if (Elevation <= Sea) {
        const Depth = Sea - Elevation;
        const ToLand = -Coast;
        const Shallow = 1 - SmoothStep(0, Cell * 6, ToLand);
        let Water = mix3(Pal.Shallow, Pal.Deep, SmoothStep(0, 260, Depth));
        if (Shallow > 0) {
            Water = mix3(Water, Pal.Shallow, 0.35 * Shallow);
        }
        return scale3(Water, 0.94 + 0.08 * Fine);
    }
    const Vegetation = Pal.VegetationAmount * (1 - SmoothStep(0.55, 0.8, Along));
    let Base = mix3(Pal.Lowland, Pal.Midland, SmoothStep(0.08, 0.45, Along));
    Base = mix3(Base, Pal.Highland, SmoothStep(0.5, 0.82, Along));
    Base = mix3(Base, Pal.Vegetation, Vegetation * (1 - SmoothStep(20, 38, Slope)) * 0.85);
    const Bare = Math.max(SmoothStep(24, 46, Slope) * Pal.Rockiness, SmoothStep(0.25, 0.8, Curvature) * 0.45 * Pal.Rockiness);
    Base = mix3(Base, Pal.Rock, Math.min(Bare, 1));
    Base = mix3(Base, Pal.Soil, Math.max(-Curvature, 0) * 0.28 * Pal.Wetness * (1 - Bare));
    Base = mix3(Base, Pal.Sand, Sediments * 0.82);
    Base = mix3(Base, Pal.Rock, Eroded * 0.22);
    if (Moist > 0.55) {
        Base = scale3(Base, 1 - 0.14 * (Moist - 0.55) * Pal.Wetness * 2);
    }
    const Beach = SmoothStep(Cell * 6, 0, Coast);
    Base = mix3(Base, Pal.Sand, Beach * 0.78);
    const Snow = SmoothStep(Pal.SnowLine - 200, Pal.SnowLine + 220, Elevation + Breakup * 260) * (1 - SmoothStep(34, 52, Slope));
    Base = mix3(Base, Pal.Snow, Math.min(Snow * 1.15, 1));
    const Channel = SmoothStep(0.22, 0.55, River);
    Base = mix3(Base, Pal.Water, Channel * 0.92);
    return scale3(Base, 0.9 + 0.2 * Fine * (0.7 + 0.3 * Breakup));
}

/// in    Seed      [-]  lattice seed
/// in    X, Y      [m]  world position
/// in    Scale     [m]  patch wavelength
/// out   Value     [-]  smooth value noise in [0, 1]
function Patch(Seed, X, Y, Scale = 260) {
    const GX = X / Scale;
    const GY = Y / Scale;
    const IX = Math.floor(GX);
    const IY = Math.floor(GY);
    const FX = SmootherStep(0, 1, GX - IX);
    const FY = SmootherStep(0, 1, GY - IY);
    const A = LatticeHash(Seed, IX, IY, 0);
    const B = LatticeHash(Seed, IX + 1, IY, 0);
    const C = LatticeHash(Seed, IX, IY + 1, 0);
    const D = LatticeHash(Seed, IX + 1, IY + 1, 0);
    return (A * (1 - FX) + B * FX) * (1 - FY) + (C * (1 - FX) + D * FX) * FY;
}

/// in    A, B     [-]  colours as [R, G, B]
/// in    T        [-]  blend weight in [0, 1]
/// out   Colour   [-]  linear interpolation of A and B
function mix3(A, B, T) {
    const K = Math.min(Math.max(T, 0), 1);
    return [A[0] + (B[0] - A[0]) * K, A[1] + (B[1] - A[1]) * K, A[2] + (B[2] - A[2]) * K];
}

/// in    Colour   [-]  [R, G, B]
/// in    Factor   [-]  brightness multiplier
/// out   Colour   [-]  scaled colour
function scale3(Colour, Factor) {
    return [Colour[0] * Factor, Colour[1] * Factor, Colour[2] * Factor];
}

/// in    Result   [-]  EvaluateProject result
/// out   Pixels   [-]  Uint8ClampedArray RGBA hillshade of N×N, sea tinted blue
export function ComposeHillshade(Result) {
    const { N, Cell, Sea, Heights } = Result;
    const Pixels = new Uint8ClampedArray(N * N * 4);
    const Light = normalise3([-0.6, -0.5, 0.62]);
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            const Left = Heights[Y * N + Math.max(X - 1, 0)];
            const Right = Heights[Y * N + Math.min(X + 1, N - 1)];
            const Up = Heights[Math.max(Y - 1, 0) * N + X];
            const Down = Heights[Math.min(Y + 1, N - 1) * N + X];
            const Normal = normalise3([-(Right - Left) / (2 * Cell), -(Down - Up) / (2 * Cell), 1]);
            const Shade = Math.max(0, Normal[0] * Light[0] + Normal[1] * Light[1] + Normal[2] * Light[2]);
            const Value = 255 * Math.pow(Shade, 0.9);
            const Submerged = Heights[Index] <= Sea;
            Pixels[Index * 4] = Submerged ? Value * 0.3 : Value;
            Pixels[Index * 4 + 1] = Submerged ? Value * 0.5 : Value;
            Pixels[Index * 4 + 2] = Submerged ? Value * 0.9 : Value;
            Pixels[Index * 4 + 3] = 255;
        }
    }
    return Pixels;
}

/// in    Vector   [-]  three-component vector
/// out   Unit     [-]  normalised vector
function normalise3(Vector) {
    const Length = Math.hypot(Vector[0], Vector[1], Vector[2]) || 1;
    return [Vector[0] / Length, Vector[1] / Length, Vector[2] / Length];
}
