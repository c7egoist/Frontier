// 📦 Mask catalogue — smooth 0–1 weight fields (coast, summit falloff, cliffs, strata, rifts) that gate any layer.

import { CreatePermutation, Perlin2 } from "./Noise.js";
import { GenerateField, CompleteGeneratorSpec, SmoothStep, SmootherStep } from "./Generators.js";
import { Gradient, Protrusion, DistanceTo } from "./Analysis.js";

/// in    Key      [-]  parameter identifier
/// in    Label    [-]  inspector caption
/// in    Unit     [-]  unit caption
/// in    Min      [-]  lower slider bound
/// in    Max      [-]  upper slider bound
/// in    Step     [-]  slider increment
/// in    Default  [-]  initial value
/// out   Param    [-]  schema record
function NumberParam(Key, Label, Unit, Min, Max, Step, Default) {
    return { Key, Label, Unit, Min, Max, Step, Default, Kind: "number" };
}

/// in    Key      [-]  parameter identifier
/// in    Label    [-]  inspector caption
/// in    Options  [-]  array of { Id, Label }
/// in    Default  [-]  option identifier
/// out   Param    [-]  schema record
function ChoiceParam(Key, Label, Options, Default) {
    return { Key, Label, Options, Default, Kind: "choice" };
}

const ShapeOptions = [
    { Id: "Linear", Label: "Linear" },
    { Id: "Smooth", Label: "Smooth" },
    { Id: "Smoother", Label: "Smoother" },
];

/// in    Shape    [-]  falloff curve identifier
/// in    Low      [-]  lower edge
/// in    High     [-]  upper edge
/// in    Value    [-]  sample
/// out   Weight   [-]  falloff weight in [0, 1]
function Falloff(Shape, Low, High, Value) {
    if (High === Low) {
        return Value < Low ? 0 : 1;
    }
    const T = Math.min(Math.max((Value - Low) / (High - Low), 0), 1);
    if (Shape === "Linear") {
        return T;
    }
    if (Shape === "Smooth") {
        return T * T * (3 - 2 * T);
    }
    return T * T * T * (T * (T * 6 - 15) + 10);
}

/// in    Params    [-]  record with Breakup and Scale
/// in    Table     [-]  permutation table
/// in    X, Y      [m]  world coordinates
/// out   Noise     [-]  signed low-frequency breakup in roughly [-1, 1]
function Breakup(Table, Params, X, Y) {
    return Perlin2(Table, X / Params.Scale, Y / Params.Scale) * 1.4;
}

export const MaskCatalogue = {
    Coastal: {
        Name: "Coastal falloff",
        Summary: "Weight that fades in from the shoreline, so coasts ease into the interior instead of meeting it with a wall.",
        Params: [
            NumberParam("Distance", "Falloff distance", "m", 50, 4000, 10, 700),
            ChoiceParam("Zone", "Zone", [
                { Id: "Inland", Label: "Inland" },
                { Id: "Offshore", Label: "Offshore" },
                { Id: "Band", Label: "Coastline band" },
            ], "Inland"),
            ChoiceParam("Shape", "Falloff curve", ShapeOptions, "Smoother"),
            NumberParam("Breakup", "Shoreline breakup", "", 0, 1, 0.01, 0.2),
            NumberParam("Scale", "Breakup wavelength", "m", 100, 3000, 10, 420),
        ],
    },
    Altitude: {
        Name: "Altitude band",
        Summary: "Weight between two elevations with feathered edges. Gates lowlands, midlands or summits.",
        Params: [
            NumberParam("Low", "Band floor", "m", -500, 6000, 10, 300),
            NumberParam("High", "Band ceiling", "m", 0, 8000, 10, 2000),
            NumberParam("Feather", "Feather", "m", 0, 2000, 10, 300),
        ],
    },
    Summit: {
        Name: "Summit falloff",
        Summary: "Smooth shoulder that rises only near the highest ground. Lifts peaks without a continuous plateau edge.",
        Params: [
            NumberParam("Threshold", "Shoulder start", "m", 0, 6000, 10, 1200),
            NumberParam("Peak", "Full strength at", "m", 100, 8000, 10, 2200),
            NumberParam("Shoulder", "Shoulder curve", "×", 0.5, 4, 0.05, 1.8),
            NumberParam("Breakup", "Ridge breakup", "", 0, 1, 0.01, 0.35),
            NumberParam("Scale", "Breakup wavelength", "m", 150, 4000, 10, 900),
        ],
    },
    Slope: {
        Name: "Slope band",
        Summary: "Weight between two steepness angles. Selects gentle ground or steep faces.",
        Params: [
            NumberParam("Min", "Minimum slope", "deg", 0, 85, 0.5, 25),
            NumberParam("Max", "Maximum slope", "deg", 0, 90, 0.5, 60),
            NumberParam("Feather", "Feather", "deg", 0, 30, 0.5, 8),
        ],
    },
    Cliff: {
        Name: "Cliff face",
        Summary: "Steep, high ground with breakup — isolates bare rock faces for cliff erosion.",
        Params: [
            NumberParam("MinSlope", "Cliff steepness", "deg", 10, 85, 0.5, 38),
            NumberParam("Feather", "Feather", "deg", 1, 30, 0.5, 10),
            NumberParam("MinHeight", "Minimum elevation", "m", 0, 6000, 10, 0),
            NumberParam("Breakup", "Face breakup", "", 0, 1, 0.01, 0.25),
            NumberParam("Scale", "Breakup wavelength", "m", 100, 3000, 10, 320),
        ],
    },
    Strata: {
        Name: "Stratified bands",
        Summary: "Periodic elevation bands, warped and sharpened — stacked sandstone beds, sills and terraces.",
        Params: [
            NumberParam("Band", "Band thickness", "m", 20, 800, 5, 140),
            NumberParam("Duty", "Band duty", "", 0, 1, 0.01, 0.5),
            NumberParam("Sharpness", "Bed sharpness", "", 0, 1, 0.01, 0.8),
            NumberParam("Warp", "Bed warp", "", 0, 1, 0.01, 0.25),
            NumberParam("Phase", "Phase", "", 0, 1, 0.01, 0),
        ],
    },
    Rift: {
        Name: "Rift zone",
        Summary: "Linear fault corridor with a wobbling centreline and smooth flanks. Guides rift valleys and grabens.",
        Params: [
            NumberParam("Angle", "Rift direction", "deg", 0, 179, 1, 60),
            NumberParam("Position", "Position across", "", 0, 1, 0.01, 0.5),
            NumberParam("Width", "Core width", "m", 0, 3000, 10, 280),
            NumberParam("Falloff", "Flank falloff", "m", 10, 4000, 10, 900),
            NumberParam("Wobble", "Centreline wobble", "", 0, 1, 0.01, 0.4),
            NumberParam("Wavelength", "Wobble wavelength", "m", 500, 12000, 50, 3500),
        ],
    },
    Ridge: {
        Name: "Ridge protrusion",
        Summary: "Weight on convex crests (positive curvature) — isolates spurs, arêtes and knife edges.",
        Params: [
            NumberParam("Threshold", "Protrusion threshold", "", -1, 1, 0.01, 0.25),
            NumberParam("Feather", "Feather", "", 0, 1, 0.01, 0.25),
        ],
    },
    Noise: {
        Name: "Noise gate",
        Summary: "Any generator thresholded into a mask. Gives organic patches of erosion or uplift.",
        Params: [
            NumberParam("Threshold", "Threshold", "", 0, 1, 0.01, 0.5),
            NumberParam("Contrast", "Edge contrast", "", 0.01, 1, 0.01, 0.35),
        ],
        Generator: true,
    },
};

/// in    Kind    [-]  catalogue key
/// out   Params  [-]  object of default values for the mask's own parameters
export function DefaultMaskParams(Kind) {
    const Descriptor = MaskCatalogue[Kind] ?? MaskCatalogue.Coastal;
    const Result = {};
    for (const Param of Descriptor.Params) {
        Result[Param.Key] = Param.Default;
    }
    return Result;
}

/// in    Spec    [-]  partial mask specification
/// out   Spec    [-]  complete mask specification with defaults applied
export function CompleteMaskSpec(Spec = {}) {
    const Kind = MaskCatalogue[Spec.Kind] ? Spec.Kind : "Coastal";
    const Result = {
        Id: Spec.Id ?? "",
        Kind,
        Invert: Boolean(Spec.Invert),
        Strength: Spec.Strength ?? 1,
        Params: { ...DefaultMaskParams(Kind), ...(Spec.Params ?? {}) },
        Seed: Math.round(Spec.Seed ?? 3),
    };
    if (MaskCatalogue[Kind].Generator) {
        Result.Generator = CompleteGeneratorSpec(Spec.Generator ?? { Type: "Simplex", Seed: Result.Seed, Params: { Scale: 900, Octaves: 4 } });
    }
    return Result;
}

/// in    Spec    [-]  mask specification
/// in    Ctx     [-]  { N, Cell, World, Sea, Heights } current stage state; Heights in metres
/// out   Weight  [-]  Float32Array N×N in [0, 1]
export function BuildMaskWeight(Spec, Ctx) {
    const Full = CompleteMaskSpec(Spec);
    const { N, Cell, Sea, Heights } = Ctx;
    const Total = N * N;
    const Table = CreatePermutation(Full.Seed + 77);
    const P = Full.Params;
    const Weight = new Float32Array(Total);
    switch (Full.Kind) {
        case "Coastal": {
            const SeaMask = new Uint8Array(Total);
            const LandMask = new Uint8Array(Total);
            for (let Index = 0; Index < Total; Index++) {
                const IsSea = Heights[Index] <= Sea;
                SeaMask[Index] = IsSea ? 1 : 0;
                LandMask[Index] = IsSea ? 0 : 1;
            }
            const ToSea = DistanceTo(SeaMask, N, Cell);
            const ToLand = DistanceTo(LandMask, N, Cell);
            for (let Y = 0; Y < N; Y++) {
                for (let X = 0; X < N; X++) {
                    const Index = Y * N + X;
                    const Jitter = 1 + P.Breakup * 0.5 * Breakup(Table, P, X * Cell, Y * Cell);
                    const Inland = ToSea[Index] * Jitter;
                    const Offshore = ToLand[Index] * Jitter;
                    let Value;
                    if (P.Zone === "Offshore") {
                        Value = SeaMask[Index] ? Falloff(P.Shape, 0, P.Distance, Offshore) : 0;
                    } else if (P.Zone === "Band") {
                        const Distance = SeaMask[Index] ? Offshore : Inland;
                        Value = 1 - Falloff(P.Shape, 0, P.Distance, Distance);
                    } else {
                        Value = LandMask[Index] ? Falloff(P.Shape, 0, P.Distance, Inland) : 0;
                    }
                    Weight[Index] = Value;
                }
            }
            break;
        }
        case "Altitude":
            for (let Index = 0; Index < Total; Index++) {
                const H = Heights[Index];
                const Rising = SmootherStep(P.Low - P.Feather, P.Low + P.Feather, H);
                const Falling = SmootherStep(P.High - P.Feather, P.High + P.Feather, H);
                Weight[Index] = Rising * (1 - Falling);
            }
            break;
        case "Summit":
            for (let Y = 0; Y < N; Y++) {
                for (let X = 0; X < N; X++) {
                    const Index = Y * N + X;
                    const Span = Math.max(P.Peak - P.Threshold, 1);
                    const Shifted = Heights[Index] + P.Breakup * Span * 0.5 * Breakup(Table, P, X * Cell, Y * Cell);
                    Weight[Index] = Math.pow(SmootherStep(P.Threshold, P.Threshold + Span, Shifted), P.Shoulder);
                }
            }
            break;
        case "Slope": {
            const { Gx, Gy } = Gradient(Heights, N, Cell);
            for (let Index = 0; Index < Total; Index++) {
                const Steep = (Math.atan(Math.hypot(Gx[Index], Gy[Index])) * 180) / Math.PI;
                Weight[Index] = SmoothStep(P.Min - P.Feather, P.Min + P.Feather, Steep) * (1 - SmoothStep(P.Max - P.Feather, P.Max + P.Feather, Steep));
            }
            break;
        }
        case "Cliff": {
            const { Gx, Gy } = Gradient(Heights, N, Cell);
            for (let Y = 0; Y < N; Y++) {
                for (let X = 0; X < N; X++) {
                    const Index = Y * N + X;
                    const Steep = (Math.atan(Math.hypot(Gx[Index], Gy[Index])) * 180) / Math.PI;
                    const Jitter = P.Breakup * 2.5 * Breakup(Table, P, X * Cell, Y * Cell);
                    const Gate = SmoothStep(P.MinSlope - P.Feather, P.MinSlope + P.Feather, Steep + Jitter);
                    Weight[Index] = Gate * SmoothStep(P.MinHeight - 150, P.MinHeight + 150, Heights[Index]);
                }
            }
            break;
        }
        case "Strata": {
            const Edge = (1 - P.Sharpness) * 0.5 + 0.01;
            for (let Y = 0; Y < N; Y++) {
                for (let X = 0; X < N; X++) {
                    const Index = Y * N + X;
                    const Warp = P.Warp * 0.5 * Breakup(Table, { Scale: 900 }, X * Cell, Y * Cell);
                    const Wave = 0.5 + 0.5 * Math.sin(2 * Math.PI * (Heights[Index] / Math.max(P.Band, 1) + P.Phase + Warp));
                    Weight[Index] = SmootherStep(P.Duty - Edge, P.Duty + Edge, Wave);
                }
            }
            break;
        }
        case "Rift": {
            const Angle = (P.Angle * Math.PI) / 180;
            const NX = -Math.sin(Angle);
            const NY = Math.cos(Angle);
            const Along = [Math.cos(Angle), Math.sin(Angle)];
            const Centre = Ctx.World / 2;
            const Offset = (P.Position - 0.5) * Ctx.World;
            for (let Y = 0; Y < N; Y++) {
                for (let X = 0; X < N; X++) {
                    const Index = Y * N + X;
                    const PX = X * Cell - Centre;
                    const PY = Y * Cell - Centre;
                    const Across = PX * NX + PY * NY - Offset;
                    const Position = PX * Along[0] + PY * Along[1];
                    const Wander = P.Wobble * P.Wavelength * 0.15 * Perlin2(Table, Position / P.Wavelength, 4.2);
                    const Distance = Math.abs(Across - Wander);
                    Weight[Index] = 1 - SmootherStep(P.Width, P.Width + P.Falloff, Distance);
                }
            }
            break;
        }
        case "Ridge": {
            const Curvature = Protrusion(Heights, N, Cell);
            for (let Index = 0; Index < Total; Index++) {
                Weight[Index] = SmoothStep(P.Threshold - P.Feather, P.Threshold + P.Feather + 1e-4, Curvature[Index]);
            }
            break;
        }
        case "Noise": {
            const Field = GenerateField(Full.Generator, { N, Cell, World: Ctx.World, Normalize: true });
            const Half = P.Contrast * 0.5;
            for (let Index = 0; Index < Total; Index++) {
                Weight[Index] = SmootherStep(P.Threshold - Half, P.Threshold + Half, Field[Index]);
            }
            break;
        }
        default:
            Weight.fill(1);
    }
    for (let Index = 0; Index < Total; Index++) {
        let Value = Full.Invert ? 1 - Weight[Index] : Weight[Index];
        Value = 1 + (Value - 1) * Full.Strength;
        Weight[Index] = Math.min(Math.max(Value, 0), 1);
    }
    return Weight;
}

