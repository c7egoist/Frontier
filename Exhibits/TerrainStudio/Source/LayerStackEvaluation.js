//============================================================================================================================================
//                                                              LAYERSTACKEVALUATION.JS
//============================================================================================================================================
// 🧩 The non-destructive layer stack: formation layers raise the land, erosion layers spend it, surface
//    layers dress it. Every layer carries its own seed, strength, blend operation and channel mask.
//
// 📝 Evaluation is cached per layer, so editing the snowline never re-runs the rivers. Masking and
//    strength are applied uniformly — each layer computes its result, then the stack mixes previous →
//    result through strength × mask weight. A layer can therefore be masked by the water it will one
//    day stand beside: paint the Water channel, point a layer's mask at it, rebuild.

import { Resolution, TexelSize, WorldExtent, LatticeNoise, MaskWeight, SlopeAt } from "./ReliefField.js";
import { HydraulicErosion, ThermalErosion, FluvialIncision, GlacialPolish, AeolianSettle, SnowAccumulation } from "./ErosionSequence.js";

async function YieldBriefly()
{
    await new Promise((Resolve) => setTimeout(Resolve, 0));
}

const Param = (Key, Label, Min, Max, Step, Default, Unit) =>
    ({ Key, Label, Control: "Slider", Min, Max, Step, Default, Unit: Unit || "" });

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  FORMATION FIELDS
//--------------------------------------------------------------------------------------------------------------------------------------------

async function BuildContinentalMass(Field, Layer, Out, Report, Cancel)
{
    const P      = Layer.Params;
    const Noise  = new LatticeNoise(Layer.Seed);
    const N      = Resolution;
    const Scale  = TexelSize / P.Wavelength;          // texel → noise space
    const WarpScale = TexelSize / (P.Wavelength * 2.3);
    const WarpTexels = P.Warp / TexelSize;
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const WarpX = Noise.Fractal(X * WarpScale + 31.7, Z * WarpScale + 11.3, 3, 2.0, 0.5) * WarpTexels;
            const WarpZ = Noise.Fractal(X * WarpScale + 7.9,  Z * WarpScale + 47.1, 3, 2.0, 0.5) * WarpTexels;
            const Raw = Noise.Fractal((X + WarpX) * Scale, (Z + WarpZ) * Scale, Math.round(P.Octaves), 2.02, P.Gain);
            let Unit = Raw * 0.5 + 0.5;
            // Plateau shaping: at strength 1 the curve's derivative dies at the top — flat uplands.
            const PlateauCurve = 1.0 - Math.pow(1.0 - Unit, 3.0);
            Unit = Unit + (PlateauCurve - Unit) * P.Plateau;
            Out[Z * N + X] = Unit;
            if (Unit < Lo) Lo = Unit;
            if (Unit > Hi) Hi = Unit;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    // A 2 km frame holds only a few base-octave features, so stretch the realised range onto the
    // promised amplitude — the seed chooses the shape, the slider chooses the size.
    const Span = Math.max(Hi - Lo, 0.0001);
    const TiltRadians = P.TiltAngle * Math.PI / 180.0;
    const TiltX = Math.cos(TiltRadians);
    const TiltZ = Math.sin(TiltRadians);
    for (let Index = 0; Index < Out.length; Index++)
    {
        const Tx = Index % N;
        const Tz = (Index / N) | 0;
        const Along = (Tx / N - 0.5) * TiltX + (Tz / N - 0.5) * TiltZ;
        Out[Index] = P.BaseElevation + ((Out[Index] - Lo) / Span) * P.Amplitude + P.Tilt * Along;
    }
}

async function BuildRidgeUplift(Field, Layer, Out, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x51AB);
    const N     = Resolution;
    const Scale = TexelSize / P.Wavelength;
    const WarpScale = TexelSize / (P.Wavelength * 2.6);
    const WarpTexels = P.Warp / TexelSize;
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const WarpX = Noise.Fractal(X * WarpScale + 3.1, Z * WarpScale + 17.7, 3, 2.0, 0.5) * WarpTexels;
            const WarpZ = Noise.Fractal(X * WarpScale + 23.9, Z * WarpScale + 5.5, 3, 2.0, 0.5) * WarpTexels;
            let Ridge = Noise.Ridged((X + WarpX) * Scale, (Z + WarpZ) * Scale, Math.round(P.Octaves), 2.05, 0.52, P.Sharpness);
            Ridge = Math.pow(Ridge, 1.45);   // thin the feet so valleys stay valleys
            // A soft continental envelope stops every crest reaching full height at once.
            const Envelope = 0.30 + 0.70 * (Noise.Fractal(X * Scale * 0.33 + 9.2, Z * Scale * 0.33 + 4.4, 3, 2.0, 0.5) * 0.5 + 0.5);
            const Raised = Ridge * Envelope;
            Out[Z * N + X] = Raised;
            if (Raised < Lo) Lo = Raised;
            if (Raised > Hi) Hi = Raised;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    const Span = Math.max(Hi - Lo, 0.0001);
    for (let Index = 0; Index < Out.length; Index++)
    {
        // Clamp before the fractional power: Lo/Hi are tracked in double precision while Out is
        // Float32, so the minimum cell can round a hair below Lo — and pow(negative, 1.2) is NaN.
        const Unit = Math.min(Math.max((Out[Index] - Lo) / Span, 0.0), 1.0);
        Out[Index] = Math.pow(Unit, 1.2) * P.Amplitude;
    }
}

async function BuildTectonicFront(Field, Layer, Out, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x77C3);
    const N     = Resolution;
    const Radians = P.Angle * Math.PI / 180.0;
    const CosA = Math.cos(Radians);
    const SinA = Math.sin(Radians);
    const AlongScale = 1.0 / P.Waviness;               // per metre along the front
    const CrestScale = TexelSize / P.CrestWavelength;
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const WorldX = (X + 0.5) * TexelSize - WorldExtent * 0.5;
            const WorldZ = (Z + 0.5) * TexelSize - WorldExtent * 0.5;
            const Along  = WorldX * CosA - WorldZ * SinA;
            const Across = WorldX * SinA + WorldZ * CosA;
            const Meander = Noise.Fractal(Along * AlongScale + 13.0, 4.7, 3, 2.0, 0.5) * P.Meander;
            const Distance = Across - P.Offset - Meander;
            const Width = Distance > 0.0 ? P.Width : P.Width * (1.0 - P.Asymmetry * 0.72);
            const Profile = Math.exp(-(Distance * Distance) / (Width * Width));
            const Crest = 0.35 + 0.65 * Noise.Ridged(Along * CrestScale * 0.5 + 2.2, Distance * CrestScale * 0.5, 5, 2.05, 0.52, 1.7);
            const Raised = Profile * Crest;
            Out[Z * N + X] = Raised;
            if (Raised < Lo) Lo = Raised;
            if (Raised > Hi) Hi = Raised;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    const Span = Math.max(Hi - Lo, 0.0001);
    for (let Index = 0; Index < Out.length; Index++)
        Out[Index] = ((Out[Index] - Lo) / Span) * P.Amplitude;
}

async function BuildCellularPlateau(Field, Layer, Out, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x2E91);
    const N     = Resolution;
    const Scale = TexelSize / P.CellSize;
    const Edge  = Math.max(P.EdgeWidth, 0.02);
    const HeightVariance = (P.HeightVariance !== undefined) ? P.HeightVariance : 0.65;
    let Lo = Infinity, Hi = -Infinity;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const Warp = Noise.Fractal(X * Scale * 0.6 + 8.8, Z * Scale * 0.6 + 1.9, 2, 2.0, 0.5);
            const [Cell, Identity] = Noise.CellularWithIdentity((X + Warp * 70.0) * Scale, (Z - Warp * 70.0) * Scale);
            let Top = (Cell - 0.06) / Edge;
            Top = Top < 0.0 ? 0.0 : Top > 1.0 ? 1.0 : Top;
            Top = Top * Top * (3.0 - 2.0 * Top);
            // Every remnant stands at its own level. Without the per-cell level all mesa tops
            // saturate to one elevation and the field reads as stacked cakes, not eroded plateau.
            const Level = 1.0 - HeightVariance * (1.0 - Identity);
            const Detail = Noise.Fractal(X * TexelSize / 260.0, Z * TexelSize / 260.0, 4, 2.0, 0.5);
            const Raised = (0.18 + 0.82 * Top * Level) + Detail * 0.07;
            Out[Z * N + X] = Raised;
            if (Raised < Lo) Lo = Raised;
            if (Raised > Hi) Hi = Raised;
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    const Span = Math.max(Hi - Lo, 0.0001);
    for (let Index = 0; Index < Out.length; Index++)
        Out[Index] = P.BaseElevation + ((Out[Index] - Lo) / Span) * P.Amplitude;
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  MODIFIER FIELDS
//--------------------------------------------------------------------------------------------------------------------------------------------

async function ApplyDomainWarp(Field, Layer, Report, Cancel)
{
    const P     = Layer.Params;
    const Noise = new LatticeNoise(Layer.Seed ^ 0x09D4);
    const N     = Resolution;
    const Source = new Float32Array(Field.Heights);
    const Scale = TexelSize / P.Wavelength;
    const Texels = P.StrengthMetres / TexelSize;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const OffsetX = Noise.Fractal(X * Scale + 41.2, Z * Scale + 3.3, 3, 2.0, 0.5) * Texels;
            const OffsetZ = Noise.Fractal(X * Scale + 9.6,  Z * Scale + 27.5, 3, 2.0, 0.5) * Texels;
            Field.Heights[Z * N + X] = Field.SampleBilinear(Source, (X + OffsetX + 0.5) * TexelSize - WorldExtent * 0.5,
                                                                    (Z + OffsetZ + 0.5) * TexelSize - WorldExtent * 0.5);
        }
        if ((Z & 63) === 0)
        {
            Report(Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
}

async function ApplyStrataTerrace(Field, Layer, Report, Cancel)
{
    const P        = Layer.Params;
    const Heights  = Field.Heights;
    const Hardness = Field.ChannelSamples("Hardness");
    const N        = Resolution;
    const Band     = Math.max(P.BandMetres, 2.0);
    const Riser    = Math.min(Math.max(P.RiserWidth, 0.05), 0.9);
    const Tread    = 1.0 - Riser;
    const Strength = P.TerraceStrength;
    for (let Index = 0; Index < Heights.length; Index++)
    {
        const Height = Heights[Index];
        const BandT  = Height / Band;
        const BandIndex = Math.floor(BandT);
        const Frac = BandT - BandIndex;
        let Stepped;
        if (Frac <= Tread)
            Stepped = Frac * 0.18 / Math.max(Tread, 0.05);       // treads keep a whisper of slope
        else
        {
            let RiserT = (Frac - Tread) / Riser;
            RiserT = RiserT * RiserT * (3.0 - 2.0 * RiserT);
            Stepped = 0.18 + RiserT * 0.82;
        }
        const Terraced = (BandIndex + Stepped) * Band;
        Heights[Index] = Height + (Terraced - Height) * Strength;
        // Alternating hard/soft beds: the differential that makes canyon walls step instead of slump.
        const Bed = ((BandIndex % 2) + 2) % 2;
        const Target = Bed === 0 ? 0.5 + P.HardContrast * 0.5 : 0.5 - P.HardContrast * 0.5;
        Hardness[Index] = Hardness[Index] + (Target - Hardness[Index]) * Strength;
        if ((Index & 262143) === 0)
            Report(Index / Heights.length);
    }
    Cancel.ThrowIfRequested();
    await YieldBriefly();
    Report(1.0);
}

function ApplySculptDelta(Field)
{
    const Heights = Field.Heights;
    const Delta   = Field.SculptDelta;
    for (let Index = 0; Index < Heights.length; Index++)
        Heights[Index] += Delta[Index];
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  LAYER TYPE REGISTRY
//--------------------------------------------------------------------------------------------------------------------------------------------

export const LayerTypes =
[
    {
        Id: "ContinentalMass", Label: "Continental mass", Group: "Formation", Glyph: "massif",
        Blurb: "Warped fractal landmass. Plateau shaping flattens the uplands.",
        Params:
        [
            Param("Amplitude",     "Relief amplitude",  10, 1600, 5,   420, "m"),
            Param("BaseElevation", "Base elevation",    -400, 800, 5,  0,   "m"),
            Param("Wavelength",    "Feature wavelength", 180, 2400, 10, 900, "m"),
            Param("Octaves",       "Octaves",            1, 9, 1,      6,   ""),
            Param("Gain",          "Octave gain",        0.3, 0.75, 0.01, 0.52, ""),
            Param("Warp",          "Domain warp",        0, 400, 5,    140, "m"),
            Param("Plateau",       "Plateau shaping",    0, 1, 0.01,   0.15, ""),
            Param("Tilt",          "Regional tilt",      -500, 500, 5,  0,   "m"),
            Param("TiltAngle",     "Tilt bearing",       0, 360, 1,     35,  "°"),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildContinentalMass(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "RidgeUplift", Label: "Ridge uplift", Group: "Formation", Glyph: "ridge",
        Blurb: "Ridged multifractal crests under a soft continental envelope.",
        Params:
        [
            Param("Amplitude",  "Crest amplitude",    10, 1800, 5,   560, "m"),
            Param("Wavelength", "Feature wavelength", 150, 1800, 10, 640, "m"),
            Param("Octaves",    "Octaves",            1, 9, 1,       6,   ""),
            Param("Sharpness",  "Crest sharpness",    0.6, 3.2, 0.05, 1.6, ""),
            Param("Warp",       "Domain warp",        0, 400, 5,     120, "m"),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildRidgeUplift(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "TectonicFront", Label: "Tectonic front", Group: "Formation", Glyph: "front",
        Blurb: "A meandering plate boundary: one great uplifted arc with a ridged crest.",
        Params:
        [
            Param("Amplitude",      "Uplift amplitude", 10, 2000, 5,   900, "m"),
            Param("Angle",          "Front bearing",    0, 360, 1,     115, "°"),
            Param("Offset",         "Front offset",     -900, 900, 5,  -120, "m"),
            Param("Width",          "Uplift width",     60, 900, 5,    330, "m"),
            Param("Asymmetry",      "Front asymmetry",  0, 1, 0.01,    0.55, ""),
            Param("Meander",        "Front meander",    0, 500, 5,     210, "m"),
            Param("Waviness",       "Meander wavelength", 300, 2400, 10, 1100, "m"),
            Param("CrestWavelength","Crest wavelength", 120, 1200, 10, 420, "m"),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildTectonicFront(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "CellularPlateau", Label: "Cellular plateau", Group: "Formation", Glyph: "mesa",
        Blurb: "Worley-cell mesas with creased borders — inselberg country.",
        Params:
        [
            Param("Amplitude",     "Mesa amplitude",  10, 900, 5,    190, "m"),
            Param("BaseElevation", "Base elevation",   -200, 600, 5,  0,   "m"),
            Param("CellSize",      "Cell size",        120, 900, 5,   380, "m"),
            Param("EdgeWidth",     "Edge softness",    0.05, 0.9, 0.01, 0.4, ""),
            Param("HeightVariance", "Remnant height variance", 0, 0.95, 0.01, 0.65, ""),
        ],
        Build: (Field, Layer, Out, Report, Cancel) => BuildCellularPlateau(Field, Layer, Out, Report, Cancel),
    },
    {
        Id: "DomainWarp", Label: "Domain warp", Group: "Formation", Glyph: "warp",
        Blurb: "Re-samples everything beneath through a swirling offset field.",
        Params:
        [
            Param("StrengthMetres", "Warp displacement", 0, 500, 5,  150, "m"),
            Param("Wavelength",     "Warp wavelength",   200, 2000, 10, 800, "m"),
        ],
        Modify: (Field, Layer, Report, Cancel) => ApplyDomainWarp(Field, Layer, Report, Cancel),
    },
    {
        Id: "StrataTerrace", Label: "Strata terrace", Group: "Formation", Glyph: "strata",
        Blurb: "Sedimentary bedding: treads, risers, and alternating hard/soft beds.",
        Params:
        [
            Param("BandMetres",      "Band thickness",   4, 120, 1,     26,  "m"),
            Param("RiserWidth",      "Riser share",      0.08, 0.8, 0.01, 0.4, ""),
            Param("TerraceStrength", "Terrace strength", 0, 1, 0.01,    0.85, ""),
            Param("HardContrast",    "Bed hardness contrast", 0, 1, 0.01, 0.8, ""),
        ],
        Modify: (Field, Layer, Report, Cancel) => ApplyStrataTerrace(Field, Layer, Report, Cancel),
    },
    {
        Id: "FluvialIncision", Label: "River erosion", Group: "Erosion", Glyph: "river",
        Blurb: "Drainage solution + stream-power incision with downstream sediment transport: what the river cannot carry it lays down as floodplains, fans and deltas. Writes Flow, Water, Deposition.",
        Params:
        [
            Param("Strength",      "Incision strength",  0, 3, 0.05,   1.0,  ""),
            Param("Iterations",    "Incision iterations", 1, 6, 1,     2,    ""),
            Param("Sedimentation", "Sedimentation",       0, 1, 0.01,   0.55, ""),
            Param("Capacity",      "Sediment capacity",   0.2, 3, 0.05, 1.0,  "x"),
        ],
        Modify: (Field, Layer, Report, Cancel) => FluvialIncision(Field, Layer.Params, Report, Cancel),
    },
    {
        Id: "HydraulicErosion", Label: "Hydraulic erosion", Group: "Erosion", Glyph: "droplet",
        Blurb: "Droplet sediment transport. Writes Wear and Deposition.",
        Params:
        [
            Param("Droplets",    "Droplets",        5000, 600000, 5000, 160000, ""),
            Param("Inertia",     "Droplet inertia", 0, 0.9, 0.01,       0.28,   ""),
            Param("Capacity",    "Sediment capacity", 1, 12, 0.1,        4.5,    ""),
            Param("ErodeRate",   "Erosion rate",    0.05, 0.9, 0.01,     0.32,   ""),
            Param("DepositRate", "Deposition rate", 0.05, 0.9, 0.01,     0.30,   ""),
            Param("Radius",      "Erosion radius",  1, 4, 1,             2,      "texels"),
        ],
        Modify: (Field, Layer, Report, Cancel) =>
            HydraulicErosion(Field, { ...Layer.Params, Seed: Layer.Seed }, Report, Cancel),
    },
    {
        Id: "GlacialPolish", Label: "Glacial polish", Group: "Erosion", Glyph: "glacier",
        Blurb: "Widens trunk valleys into U troughs where Flow runs high.",
        Params:
        [
            Param("Strength",     "Polish strength", 0, 1, 0.01,    0.6,  ""),
            Param("WidthTexels",  "Trough half-width", 2, 40, 1,    12,   "texels"),
            Param("ScourMetres",  "Centreline scour", 0, 40, 0.5,   8,    "m"),
        ],
        Modify: (Field, Layer, Report, Cancel) => GlacialPolish(Field, Layer.Params, Report, Cancel),
    },
    {
        Id: "ThermalErosion", Label: "Thermal erosion", Group: "Erosion", Glyph: "talus",
        Blurb: "Talus relaxation: nothing rests steeper than its angle of repose. Where strata hardness varies, hard beds stand at the cliff angle and soft beds bench below them.",
        Params:
        [
            Param("Iterations", "Iterations",   1, 240, 1,      60,   ""),
            Param("TalusAngle", "Talus angle (soft beds)",  15, 60, 0.5,    34,   "°"),
            Param("CliffAngle", "Cliff angle (hard beds)",  20, 85, 0.5,    68,   "°"),
            Param("Rate",       "Relaxation rate", 0.05, 0.5, 0.01, 0.5, ""),
        ],
        Modify: (Field, Layer, Report, Cancel) => ThermalErosion(Field, Layer.Params, Report, Cancel),
    },
    {
        Id: "AeolianSettle", Label: "Aeolian settle", Group: "Erosion", Glyph: "wind",
        Blurb: "Saltation slabs: sand lifts, hops, and settles in wind shadow.",
        Params:
        [
            Param("WindAngle", "Wind bearing", 0, 360, 1,      35,     "°"),
            Param("Slabs",     "Sand slabs",   5000, 600000, 5000, 140000, ""),
        ],
        Modify: (Field, Layer, Report, Cancel) =>
            AeolianSettle(Field, { ...Layer.Params, Seed: Layer.Seed }, Report, Cancel),
    },
    {
        Id: "SnowAccumulation", Label: "Snow accumulation", Group: "Surface", Glyph: "snow",
        Blurb: "Altitude- and slope-gated snowpack with hollow drift. Writes Snow.",
        Params:
        [
            Param("Snowline",   "Snowline",        -200, 1800, 5,   620, "m"),
            Param("Band",       "Transition band", 10, 400, 5,      120, "m"),
            Param("SlopeLimit", "Holding slope",   15, 75, 1,       48,  "°"),
            Param("Depth",      "Pack depth",      0, 12, 0.1,      2.5, "m"),
        ],
        Modify: (Field, Layer, Report, Cancel) =>
            SnowAccumulation(Field, Layer.Params, new LatticeNoise(Layer.Seed ^ 0x3F77), Report, Cancel),
    },
    {
        Id: "SculptDelta", Label: "Sculpt strokes", Group: "Sculpt", Glyph: "sculpt",
        Blurb: "Everything the sculpt brush has raised or carved, as one layer.",
        Params: [],
        Modify: async (Field, Layer, Report) => { ApplySculptDelta(Field); Report(1.0); },
    },
];

export function LayerTypeById(Id)
{
    return LayerTypes.find((Type) => Type.Id === Id) || null;
}

let NextLayerSerial = 1;

export function ConstructLayer(TypeId, Overrides)
{
    const Type = LayerTypeById(TypeId);
    const Params = {};
    for (const Definition of Type.Params)
        Params[Definition.Key] = Definition.Default;
    const Layer =
    {
        Serial       : NextLayerSerial++,
        TypeId       : TypeId,
        Label        : Type.Label,
        Enabled      : true,
        Blend        : Type.Build ? "Add" : "Replace",
        Strength     : 1.0,
        MaskChannel  : "",
        MaskLow      : 0.0,
        MaskHigh     : 1.0,
        MaskInvert   : false,
        Seed         : 1234 + NextLayerSerial * 777,
        Params       : Params,
    };
    if (Overrides)
    {
        const { Params: ParamOverrides, ...Rest } = Overrides;
        Object.assign(Layer, Rest);
        if (ParamOverrides)
            Object.assign(Layer.Params, ParamOverrides);
    }
    return Layer;
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  EVALUATION
//--------------------------------------------------------------------------------------------------------------------------------------------

export class LayerStackEvaluation
{
    constructor(Field)
    {
        this.Field  = Field;
        this.Cache  = [];        // relief snapshot after each layer index
        this.Scratch = new Float32Array(Resolution * Resolution);
    }

    InvalidateFrom(Index)
    {
        this.Cache.length = Math.min(this.Cache.length, Index);
    }

    BuildMaskWeights(Layer)
    {
        const Field = this.Field;
        if (!Layer.MaskChannel)
            return null;
        const Weights = new Float32Array(Resolution * Resolution);
        if (Layer.MaskChannel === "Height")
        {
            Field.MeasureRange();   // mask against the relief as it stands now, not last build's range
            const Range = Math.max(Field.Maximum - Field.Minimum, 1.0);
            for (let Index = 0; Index < Weights.length; Index++)
                Weights[Index] = MaskWeight((Field.Heights[Index] - Field.Minimum) / Range, Layer.MaskLow, Layer.MaskHigh, Layer.MaskInvert);
        }
        else if (Layer.MaskChannel === "Slope")
        {
            for (let Z = 0; Z < Resolution; Z++)
            {
                for (let X = 0; X < Resolution; X++)
                {
                    const Slope = SlopeAt(Field.Heights, X, Z);
                    Weights[Z * Resolution + X] = MaskWeight(Slope / (Slope + 0.9), Layer.MaskLow, Layer.MaskHigh, Layer.MaskInvert);
                }
            }
        }
        else
        {
            const Samples = Field.ChannelSamples(Layer.MaskChannel);
            if (!Samples)
                return null;
            for (let Index = 0; Index < Weights.length; Index++)
                Weights[Index] = MaskWeight(Samples[Index], Layer.MaskLow, Layer.MaskHigh, Layer.MaskInvert);
        }
        return Weights;
    }

    // 📝 Runs the stack from FromIndex (or the first uncached layer) to the top.
    //    Report receives (StageLabel, OverallFraction).
    async Evaluate(Layers, FromIndex, Report, Cancel)
    {
        const Field   = this.Field;
        const Heights = Field.Heights;
        const Start   = Math.max(0, Math.min(FromIndex, this.Cache.length));

        if (Start === 0)
        {
            Heights.fill(0.0);
            Field.ClearDerivedChannels();
        }
        else if (this.Cache[Start - 1])
        {
            Heights.set(this.Cache[Start - 1]);
        }

        for (let Index = Start; Index < Layers.length; Index++)
        {
            const Layer = Layers[Index];
            const Type  = LayerTypeById(Layer.TypeId);
            const Overall = (Fraction) => Report(Type.Label, (Index + Fraction) / Math.max(Layers.length, 1));

            if (Layer.Enabled)
            {
                const Before = new Float32Array(Heights);
                if (Type.Build)
                {
                    const Generated = new Float32Array(Resolution * Resolution);
                    await Type.Build(Field, Layer, Generated, Overall, Cancel);
                    for (let Texel = 0; Texel < Heights.length; Texel++)
                    {
                        const Under = Heights[Texel];
                        const Over  = Generated[Texel];
                        switch (Layer.Blend)
                        {
                            case "Subtract": Heights[Texel] = Under - Over; break;
                            case "Replace":  Heights[Texel] = Over; break;
                            case "Maximum":  Heights[Texel] = Math.max(Under, Over); break;
                            case "Minimum":  Heights[Texel] = Math.min(Under, Over); break;
                            default:         Heights[Texel] = Under + Over; break;
                        }
                    }
                }
                else if (Type.Modify)
                {
                    await Type.Modify(Field, Layer, Overall, Cancel);
                }

                // Uniform strength × mask mixing against the incoming relief.
                const Strength = Layer.Strength;
                if (Strength < 1.0 || Layer.MaskChannel)
                {
                    const Weights = Layer.MaskChannel ? this.BuildMaskWeights(Layer) : null;
                    for (let Texel = 0; Texel < Heights.length; Texel++)
                    {
                        const Mix = Strength * (Weights ? Weights[Texel] : 1.0);
                        if (Mix < 1.0)
                            Heights[Texel] = Before[Texel] + (Heights[Texel] - Before[Texel]) * Mix;
                    }
                }
            }

            if (!this.Cache[Index])
                this.Cache[Index] = new Float32Array(Resolution * Resolution);
            this.Cache[Index].set(Heights);
            Overall(1.0);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }

        Field.MeasureRange();
        Field.DeriveMoisture();
    }
}
