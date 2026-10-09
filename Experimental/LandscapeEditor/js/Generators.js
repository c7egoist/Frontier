// 📦 Generator catalogue — each base-shape and modulation generator declares its parameters and samples a normalised field.

import { CreatePermutation, Perlin2, Simplex2, Worley2, FractalSum, HybridMultifractal, RidgedMultifractal } from "./Noise.js";

/// in    Key      [-]  parameter identifier
/// in    Label    [-]  inspector caption
/// in    Unit     [-]  unit caption, empty when dimensionless
/// in    Min      [-]  lower slider bound
/// in    Max      [-]  upper slider bound
/// in    Step     [-]  slider increment
/// in    Default  [-]  value used by new layers
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

/// in    Overrides  [-]  per-generator defaults keyed by parameter key
/// out   List       [-]  shared noise parameters: scale, octaves, lacunarity, gain, warp
function NoiseParams(Overrides = {}) {
    const Defaults = {
        Scale: 3000,
        Octaves: 6,
        Lacunarity: 2.0,
        Gain: 0.5,
        Warp: 0,
        ...Overrides,
    };
    return [
        NumberParam("Scale", "Feature wavelength", "m", 200, 12000, 50, Defaults.Scale),
        NumberParam("Octaves", "Octaves", "", 1, 10, 1, Defaults.Octaves),
        NumberParam("Lacunarity", "Lacunarity", "×", 1.4, 3.2, 0.05, Defaults.Lacunarity),
        NumberParam("Gain", "Gain / roughness", "", 0.2, 0.8, 0.01, Defaults.Gain),
        NumberParam("Warp", "Domain warp", "", 0, 2, 0.01, Defaults.Warp),
    ];
}

/// in    Value  [-]  input sample
/// in    Low    [-]  lower edge
/// in    High   [-]  upper edge
/// out   Smooth [-]  Hermite smoothstep in [0, 1]
export function SmoothStep(Low, High, Value) {
    if (High === Low) {
        return Value < Low ? 0 : 1;
    }
    const T = Math.min(Math.max((Value - Low) / (High - Low), 0), 1);
    return T * T * (3 - 2 * T);
}

/// in    Low    [-]  lower edge
/// in    High   [-]  upper edge
/// in    Value  [-]  input sample
/// out   Smooth [-]  Perlin smootherstep in [0, 1]; zero second derivative at both edges
export function SmootherStep(Low, High, Value) {
    if (High === Low) {
        return Value < Low ? 0 : 1;
    }
    const T = Math.min(Math.max((Value - Low) / (High - Low), 0), 1);
    return T * T * T * (T * (T * 6 - 15) + 10);
}

/// in    Ctx       [-]  { Table, Scale, Warp } noise context
/// in    X, Y      [-]  noise-space coordinates
/// out   Point     [-]  warped [X, Y] pair; the warp is low-frequency so folds stay coherent
function WarpPoint(Table, X, Y, Warp) {
    if (Warp <= 0) {
        return [X, Y];
    }
    const Dx = Perlin2(Table, X * 0.55 + 17.3, Y * 0.55 + 3.1);
    const Dy = Perlin2(Table, X * 0.55 - 5.7, Y * 0.55 + 11.9);
    return [X + Warp * 1.6 * Dx, Y + Warp * 1.6 * Dy];
}

/// in    Table     [-]  permutation table
/// in    Sample    [-]  function (X, Y, Octave) returning a signed sample
/// in    Params    [-]  parameter record with Octaves, Lacunarity, Gain, Warp, Scale
/// out   Sampler   [-]  function (X, Y) returning an unnormalised fractal sample
function Fractal(Table, Sample, Params) {
    return (X, Y) => {
        const [WX, WY] = WarpPoint(Table, X, Y, Params.Warp);
        return FractalSum(Sample, WX, WY, Params.Octaves, Params.Lacunarity, Params.Gain);
    };
}

/// in    Table   [-]  permutation table
/// in    Params  [-]  parameter record
/// out   Sample  [-]  function (X, Y) returning a signed Perlin fBm sample
function PerlinSample(Table, Params) {
    return Fractal(Table, (X, Y) => Perlin2(Table, X, Y), Params);
}

/// in    Table      [-]  permutation table
/// in    Params     [-]  parameter record
/// out   Sample     [-]  function (X, Y) returning a sample in [0, 1]
function BillowSample(Table, Params) {
    return (X, Y) => {
        const [WX, WY] = WarpPoint(Table, X, Y, Params.Warp);
        let Amplitude = 1;
        let Frequency = 1;
        let Sum = 0;
        let Norm = 0;
        for (let Octave = 0; Octave < Params.Octaves; Octave++) {
            Sum += Amplitude * (2 * Math.abs(Perlin2(Table, WX * Frequency, WY * Frequency)) - 1);
            Norm += Amplitude;
            Amplitude *= Params.Gain;
            Frequency *= Params.Lacunarity;
        }
        return Sum / Norm;
    };
}

/// in    Params       [-]  parameter record with Sharpness, Octaves and noise controls
/// in    Table        [-]  permutation table
/// out   Sample       [-]  function (X, Y) returning a ridged multifractal sample
function RidgedSample(Table, Params) {
    return (X, Y) => {
        const [WX, WY] = WarpPoint(Table, X, Y, Params.Warp);
        return RidgedMultifractal((A, B) => Perlin2(Table, A, B), WX, WY, Params.Octaves, Params.Lacunarity, Params.Gain, Params.Sharpness);
    };
}

/// in    Table   [-]  permutation table
/// in    Params  [-]  parameter record
/// out   Sample  [-]  function (X, Y) returning a hybrid multifractal sample
function HybridSample(Table, Params) {
    return (X, Y) => {
        const [WX, WY] = WarpPoint(Table, X, Y, Params.Warp);
        return HybridMultifractal((A, B) => Perlin2(Table, A, B), WX, WY, Params.Octaves, Params.Lacunarity, Params.Gain, Params.Offset);
    };
}

/// in    Table   [-]  permutation table
/// in    Params  [-]  parameter record
/// out   Sample  [-]  function (X, Y) returning a mountain-massif sample, peaks concentrated by Peak Bias
function MountainSample(Table, Params) {
    const Ridged = RidgedSample(Table, Params);
    return (X, Y) => {
        const Crest = Ridged(X, Y);
        const Base = 0.5 + 0.5 * FractalSum((A, B) => Perlin2(Table, A, B), X * 0.33, Y * 0.33, 3, 2, 0.5) * 1.4;
        const Mixed = Base + (Crest - Base) * Params.RidgeShare;
        return Math.pow(Math.max(Mixed, 0), Params.PeakBias);
    };
}

/// in    Table   [-]  permutation table
/// in    Params  [-]  parameter record
/// out   Sample  [-]  function (X, Y) returning a cellular sample: cell mounds, cell edges or flat plates
function CellularSample(Table, Params) {
    return (X, Y) => {
        const { F1, F2 } = Worley2(Params.Seed, X, Y);
        let Value;
        if (Params.Mode === "Edges") {
            Value = Math.pow(1 - Math.min((F2 - F1) * 2.4, 1), 3);
        } else if (Params.Mode === "Plates") {
            Value = SmootherStep(0.15, 0.85, F1);
        } else {
            Value = 1 - Math.min(F1, 1.4);
        }
        const Rough = Perlin2(Table, X * 2.3, Y * 2.3);
        return Value + Params.Roughness * 0.35 * Rough;
    };
}

/// in    Table   [-]  permutation table
/// in    Params  [-]  parameter record with WindAngle, Elongation, Asymmetry, Ripple and Breakup
/// out   Sample  [-]  function (X, Y) in metres returning a dune-field sample; crests are asymmetric
function DuneSample(Table, Params) {
    const Angle = (Params.WindAngle * Math.PI) / 180;
    const UX = Math.cos(Angle);
    const UY = Math.sin(Angle);
    const VX = -UY;
    const VY = UX;
    const Asymmetry = Math.min(Math.max(Params.Asymmetry, 0.5), 0.97);
    return (X, Y) => {
        const Along = X * UX + Y * UY;
        const Across = X * VX + Y * VY;
        const U = Along / Params.Scale;
        const V = Across / (Params.Scale * Params.Elongation);
        const Wobble = Params.Breakup * Perlin2(Table, U * 0.4 + 9.1, V * 0.4);
        const Phase = U + 0.22 * Wobble;
        const S = Phase - Math.floor(Phase);
        const Profile = S < Asymmetry ? S / Asymmetry : (1 - S) / (1 - Asymmetry);
        const Crest = SmootherStep(0, 1, Math.min(Math.max(Profile, 0), 1));
        const Height = 0.55 + 0.45 * (0.5 + 0.5 * Perlin2(Table, U * 0.25 + 3, V * 0.7 - 7));
        const Ripple = Params.Ripple * 0.12 * Math.sin((2 * Math.PI * Along) / (Params.Scale * 0.12));
        return Crest * Height + Ripple;
    };
}

/// in    Table   [-]  permutation table
/// in    Params  [-]  parameter record with Steps and Sharpness
/// out   Sample  [-]  function (X, Y) returning a stepped plateau sample with riser width set by Sharpness
function TerraceSample(Table, Params) {
    const Base = PerlinSample(Table, Params);
    const Width = 0.5 * (1 - Params.Sharpness) + 0.002;
    return (X, Y) => {
        const Level = (Base(X, Y) * 0.5 + 0.5) * Params.Steps;
        const Whole = Math.floor(Level);
        const Fraction = Level - Whole;
        return (Whole + SmootherStep(0.5 - Width, 0.5 + Width, Fraction)) / Params.Steps;
    };
}

/// in    Table   [-]  permutation table
/// in    Params  [-]  parameter record with Radius, Falloff and CoastNoise
/// in    World   [-]  world edge length in metres
/// out   Sample  [-]  function (X, Y) returning a radial island sample with a noisy coastline
function IslandSample(Table, Params, World) {
    const Centre = World / 2;
    const Reach = Math.max(Params.Radius, 0.05) * (World / 2);
    const Coast = Fractal(Table, (A, B) => Perlin2(Table, A, B), { ...Params, Octaves: 5, Lacunarity: 2.1, Gain: 0.5, Warp: 0.4 });
    return (X, Y) => {
        const Distance = Math.hypot(X - Centre, Y - Centre) / Reach;
        const Shape = 1 - Math.pow(Math.min(Distance, 2), Params.Falloff);
        return Shape + Params.CoastNoise * 0.35 * Coast(X / Params.Scale, Y / Params.Scale);
    };
}

export const GeneratorCatalogue = {
    Perlin: {
        Name: "Perlin fBm",
        Group: "Classic",
        Summary: "Gradient noise summed over octaves. Soft, isotropic rolling relief — the workhorse for broad uplands.",
        Params: NoiseParams({ Scale: 3000, Octaves: 6 }),
    },
    Simplex: {
        Name: "Simplex fBm",
        Group: "Classic",
        Summary: "Simplex gradient noise, fewer directional artefacts than Perlin. Good for isotropic highlands.",
        Params: NoiseParams({ Scale: 2600, Octaves: 6 }),
    },
    Billow: {
        Name: "Billow",
        Group: "Classic",
        Summary: "Absolute-value noise giving rounded cushion hills and soft domes.",
        Params: NoiseParams({ Scale: 2200, Octaves: 5, Gain: 0.45 }),
    },
    Ridged: {
        Name: "Ridged multifractal",
        Group: "Multifractal",
        Summary: "Musgrave ridged multifractal: crests where noise crosses zero. Sharp ridgelines and spines.",
        Params: [
            ...NoiseParams({ Scale: 2400, Octaves: 7, Gain: 0.55 }),
            NumberParam("Sharpness", "Ridge sharpness", "×", 0.5, 3, 0.05, 1.6),
        ],
    },
    Hybrid: {
        Name: "Hybrid multifractal",
        Group: "Multifractal",
        Summary: "Musgrave hybrid multifractal: smooth lowlands that roughen with altitude — natural erosion-free texture.",
        Params: [
            ...NoiseParams({ Scale: 2800, Octaves: 7, Gain: 0.25 }),
            NumberParam("Offset", "Signal offset", "", 0, 2, 0.01, 0.7),
        ],
    },
    Mountain: {
        Name: "Mountain noise",
        Group: "Multifractal",
        Summary: "Ridged massif blended over a broad base, with peaks concentrated by a bias curve. Built for ranges.",
        Params: [
            ...NoiseParams({ Scale: 5200, Octaves: 8, Gain: 0.52, Warp: 0.9 }),
            NumberParam("Sharpness", "Ridge sharpness", "×", 0.5, 3, 0.05, 1.8),
            NumberParam("RidgeShare", "Ridge share", "", 0, 1, 0.01, 0.75),
            NumberParam("PeakBias", "Peak bias", "×", 0.6, 3, 0.05, 1.5),
        ],
    },
    Warped: {
        Name: "Domain-warped fBm",
        Group: "Multifractal",
        Summary: "fBm whose coordinates are themselves warped by noise — folded, flowing strata-like relief.",
        Params: NoiseParams({ Scale: 3600, Octaves: 6, Warp: 1.2 }),
    },
    Cellular: {
        Name: "Cellular",
        Group: "Structural",
        Summary: "Worley cells: mounds, crack-edge ridges or flat-topped plates, depending on Mode.",
        Params: [
            NumberParam("Scale", "Cell size", "m", 300, 6000, 50, 1600),
            ChoiceParam("Mode", "Pattern", [
                { Id: "Cells", Label: "Cells" },
                { Id: "Edges", Label: "Edges" },
                { Id: "Plates", Label: "Plates" },
            ], "Edges"),
            NumberParam("Roughness", "Edge roughness", "", 0, 1, 0.01, 0.3),
            NumberParam("Seed", "Cell seed", "", 0, 9999, 1, 7),
        ],
    },
    Dunes: {
        Name: "Dune field",
        Group: "Aeolian",
        Summary: "Asymmetric crests with a gentle stoss slope and a steep lee face, aligned to a wind angle.",
        Params: [
            NumberParam("Scale", "Dune spacing", "m", 150, 2000, 10, 520),
            NumberParam("WindAngle", "Wind angle", "deg", 0, 359, 1, 35),
            NumberParam("Elongation", "Crest elongation", "×", 1, 12, 0.1, 4.5),
            NumberParam("Asymmetry", "Stoss length", "", 0.5, 0.97, 0.01, 0.82),
            NumberParam("Ripple", "Ripple amount", "", 0, 1, 0.01, 0.15),
            NumberParam("Breakup", "Crest breakup", "", 0, 1, 0.01, 0.45),
        ],
    },
    Terrace: {
        Name: "Terraced plateau",
        Group: "Structural",
        Summary: "Quantised fBm into steps — mesas and benches with an adjustable riser sharpness.",
        Params: [
            ...NoiseParams({ Scale: 5000, Octaves: 5, Gain: 0.45 }),
            NumberParam("Steps", "Terrace count", "", 2, 16, 1, 6),
            NumberParam("Sharpness", "Riser sharpness", "", 0, 1, 0.01, 0.7),
        ],
    },
    Island: {
        Name: "Island falloff",
        Group: "Structural",
        Summary: "Radial mass that falls off to sea at the edges, with a fractal coastline. Use as a base shell.",
        Params: [
            NumberParam("Radius", "Radius", "×", 0.2, 1, 0.01, 0.78),
            NumberParam("Falloff", "Falloff", "×", 0.5, 4, 0.05, 1.6),
            NumberParam("CoastNoise", "Coastline jitter", "", 0, 1, 0.01, 0.6),
            NumberParam("Scale", "Coastline wavelength", "m", 300, 6000, 50, 1800),
            NumberParam("Octaves", "Octaves", "", 1, 8, 1, 6),
        ],
    },
    Gradient: {
        Name: "Linear slope",
        Group: "Structural",
        Summary: "A plane tilted by an angle. Useful for regional dip under a stack of erosion.",
        Params: [NumberParam("Angle", "Direction", "deg", 0, 359, 1, 90)],
    },
    Constant: {
        Name: "Constant level",
        Group: "Structural",
        Summary: "A flat level. Combine with Add or Replace to lift or drop a region.",
        Params: [NumberParam("Level", "Level", "", 0, 1, 0.01, 0.5)],
    },
};

/// in    Type     [-]  catalogue key
/// out   Params   [-]  object of default values for every parameter the generator declares
export function DefaultGeneratorParams(Type) {
    const Descriptor = GeneratorCatalogue[Type] ?? GeneratorCatalogue.Perlin;
    const Result = {};
    for (const Param of Descriptor.Params) {
        Result[Param.Key] = Param.Default;
    }
    return Result;
}

/// in    Spec     [-]  { Type, Seed, Params } generator specification, possibly partial
/// out   Spec     [-]  complete specification with every missing parameter filled from defaults
export function CompleteGeneratorSpec(Spec = {}) {
    const Type = GeneratorCatalogue[Spec.Type] ? Spec.Type : "Perlin";
    return {
        Type,
        Seed: Math.round(Spec.Seed ?? 1),
        Params: { ...DefaultGeneratorParams(Type), ...(Spec.Params ?? {}) },
    };
}

/// in    Spec     [-]  { Type, Seed, Params } completed generator specification
/// in    Ctx      [-]  { N, Cell, World, Normalize } grid, cell size [m], world size [m], normalisation flag
/// out   Field    [-]  Float32Array of N×N samples, normalised to [0, 1] unless Normalize is false
export function GenerateField(Spec, Ctx) {
    const Full = CompleteGeneratorSpec(Spec);
    const { N, Cell, World } = Ctx;
    const Params = { ...Full.Params, Seed: Full.Seed };
    const Table = CreatePermutation(Full.Seed + 1);
    const Field = new Float32Array(N * N);
    const Sampler = BuildSampler(Full.Type, Table, Params, World);
    let Minimum = Infinity;
    let Maximum = -Infinity;
    for (let J = 0; J < N; J++) {
        for (let I = 0; I < N; I++) {
            const Value = Sampler((I + 0.5) * Cell, (J + 0.5) * Cell);
            Field[J * N + I] = Value;
            if (Value < Minimum) {
                Minimum = Value;
            }
            if (Value > Maximum) {
                Maximum = Value;
            }
        }
    }
    const Normalize = Ctx.Normalize !== false && Full.Type !== "Constant";
    if (!Normalize) {
        return Field;
    }
    const Span = Maximum - Minimum;
    for (let Index = 0; Index < Field.length; Index++) {
        Field[Index] = Span > 1e-9 ? (Field[Index] - Minimum) / Span : 0.5;
    }
    return Field;
}

/// in    Type     [-]  catalogue key
/// in    Table    [-]  permutation table
/// in    Params   [-]  parameter record with Seed
/// in    World    [-]  world edge length [m]
/// out   Sampler  [-]  function (X, Y) in metres returning an unnormalised sample
function BuildSampler(Type, Table, Params, World) {
    const Scale = Params.Scale ?? 1000;
    const Scaled = (Sample) => (X, Y) => Sample(X / Scale, Y / Scale);
    switch (Type) {
        case "Simplex":
            return Scaled(Fractal(Table, (A, B) => Simplex2(Table, A, B), Params));
        case "Billow":
            return Scaled(BillowSample(Table, Params));
        case "Ridged":
            return Scaled(RidgedSample(Table, Params));
        case "Hybrid":
            return Scaled(HybridSample(Table, Params));
        case "Mountain":
            return Scaled(MountainSample(Table, Params));
        case "Warped":
            return Scaled(Fractal(Table, (A, B) => Perlin2(Table, A, B), Params));
        case "Cellular":
            return Scaled(CellularSample(Table, Params));
        case "Dunes":
            return DuneSample(Table, Params);
        case "Terrace":
            return Scaled(TerraceSample(Table, Params));
        case "Island":
            return IslandSample(Table, Params, World);
        case "Gradient": {
            const Angle = (Params.Angle * Math.PI) / 180;
            const DX = Math.cos(Angle);
            const DY = Math.sin(Angle);
            return (X, Y) => (X / World - 0.5) * DX + (Y / World - 0.5) * DY;
        }
        case "Constant":
            return () => Params.Level;
        case "Perlin":
        default:
            return Scaled(PerlinSample(Table, Params));
    }
}
