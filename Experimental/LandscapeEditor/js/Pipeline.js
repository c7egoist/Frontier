// 📦 Layer-stack evaluator — folds generator and erosion layers bottom-up, gated by masks, and caches every prefix of the stack.

import { GenerateField, CompleteGeneratorSpec, SmootherStep } from "./Generators.js";
import { BuildMaskWeight, CompleteMaskSpec } from "./Masks.js";
import { ApplyErosion, DefaultErosionParams } from "./Erosion.js";
import { AnalyseTerrain } from "./Analysis.js";

const ErosionKeys = {
    Hydraulic: true,
    StreamPower: true,
    Thermal: true,
    Glacial: true,
    Aeolian: true,
    WaveCut: true,
    Stratified: true,
};

export const BlendModes = [
    { Id: "Add", Label: "Add" },
    { Id: "Subtract", Label: "Subtract" },
    { Id: "Replace", Label: "Replace" },
    { Id: "Multiply", Label: "Multiply" },
    { Id: "Max", Label: "Maximum" },
    { Id: "Min", Label: "Minimum" },
];

/// in    Raw      [-]  partial layer record from storage or a preset
/// in    Index    [-]  fallback numeric identifier
/// out   Layer    [-]  complete layer record with defaults and sanitised fields
export function CompleteLayer(Raw, Index) {
    const Kind = Raw.Kind === "Erosion" ? "Erosion" : "Generator";
    const Layer = {
        Id: Raw.Id ?? `Layer${Index}`,
        Name: Raw.Name ?? (Kind === "Erosion" ? "Erosion" : "Generator"),
        Kind,
        Visible: Raw.Visible !== false,
        Opacity: clamp(Raw.Opacity ?? 1, 0, 1),
        Blend: BlendModes.some((Mode) => Mode.Id === Raw.Blend) ? Raw.Blend : Kind === "Erosion" ? "Replace" : "Add",
        Amplitude: Raw.Amplitude ?? 800,
        Offset: Raw.Offset ?? 0,
        Masks: (Raw.Masks ?? []).map((Mask, MaskIndex) => ({
            ...CompleteMaskSpec(Mask),
            Id: Mask.Id ?? `Layer${Index}Mask${MaskIndex}`,
            Enabled: Mask.Enabled !== false,
        })),
    };
    if (Kind === "Generator") {
        Layer.Source = CompleteGeneratorSpec(Raw.Source ?? { Type: "Perlin", Seed: 1 });
    } else {
        const Type = Object.prototype.hasOwnProperty.call(ErosionKeys, Raw.Erosion?.Type) ? Raw.Erosion.Type : "Hydraulic";
        Layer.Erosion = {
            Type,
            Params: { ...DefaultErosionParams(Type), ...(Raw.Erosion?.Params ?? {}) },
        };
        Layer.Modulation = {
            Enabled: Boolean(Raw.Modulation?.Enabled),
            Influence: clamp(Raw.Modulation?.Influence ?? 0.5, 0, 1),
            Source: CompleteGeneratorSpec(Raw.Modulation?.Source ?? { Type: "Simplex", Seed: 5, Params: { Scale: 1400, Octaves: 4 } }),
        };
        Layer.Seed = Math.round(Raw.Seed ?? 11);
    }
    return Layer;
}

/// in    Value    [-]  number to clamp
/// in    Low      [-]  lower bound
/// in    High     [-]  upper bound
/// out   Clamped  [-]  value restricted to [Low, High]
export function clamp(Value, Low, High) {
    return Math.min(Math.max(Value, Low), High);
}

/// in    Project  [-]  project record
/// out   Project  [-]  project with defaults filled and layer records completed
export function CompleteProject(Project = {}) {
    const Resolution = [128, 192, 256, 384, 512].includes(Project.Resolution) ? Project.Resolution : 256;
    return {
        Name: Project.Name ?? "Untitled landscape",
        Resolution,
        WorldSize: clamp(Project.WorldSize ?? 4096, 512, 32768),
        SeaLevel: Project.SeaLevel ?? 300,
        Seed: Math.round(Project.Seed ?? 1),
        Palette: Project.Palette ?? "Temperate",
        Layers: (Project.Layers ?? []).map((Layer, Index) => CompleteLayer(Layer, Index)),
    };
}

/// in    Layers     [-]  layers from bottom to top, including the layer being keyed
/// in    Context    [-]  world-level numbers that change the output
/// out   Key        [-]  string key identifying the exact content of the prefix
function PrefixKey(Layers, Context) {
    return JSON.stringify([Context, Layers]);
}

/// in    Masks      [-]  layer masks, possibly disabled
/// in    Ctx        [-]  mask context
/// out   Weight     [-]  product of every enabled mask weight, Float32Array
function CombineMasks(Masks, Ctx) {
    const Weight = new Float32Array(Ctx.N * Ctx.N).fill(1);
    for (const Mask of Masks) {
        if (!Mask.Enabled) {
            continue;
        }
        const Single = BuildMaskWeight(Mask, Ctx);
        for (let Index = 0; Index < Weight.length; Index++) {
            Weight[Index] *= Single[Index];
        }
    }
    return Weight;
}

/// in    Field    [-]  signed or unsigned field
/// out   Image    [-]  Uint8Array greyscale, min-max stretched; signed fields keep zero at mid-grey
function ToPreview(Field, Signed) {
    const Image = new Uint8Array(Field.length);
    let Low = Infinity;
    let High = -Infinity;
    for (let Index = 0; Index < Field.length; Index++) {
        Low = Math.min(Low, Field[Index]);
        High = Math.max(High, Field[Index]);
    }
    if (Signed) {
        const Extent = Math.max(Math.abs(Low), Math.abs(High), 1e-6);
        for (let Index = 0; Index < Field.length; Index++) {
            Image[Index] = clamp(Math.round(128 + (127 * Field[Index]) / Extent), 0, 255);
        }
        return Image;
    }
    const Span = Math.max(High - Low, 1e-6);
    for (let Index = 0; Index < Field.length; Index++) {
        Image[Index] = clamp(Math.round(((Field[Index] - Low) / Span) * 255), 0, 255);
    }
    return Image;
}

/// in    Cache      [-]  Map from prefix key to computed stage
export function PruneCache(Cache, Limit = 64) {
    while (Cache.size > Limit) {
        const Oldest = Cache.keys().next().value;
        Cache.delete(Oldest);
    }
}

/// in    Raw       [-]  project record (complete or partial)
/// in    Cache     [-]  Map surviving between evaluations
/// in    Options   [-]  { OnStage(record), Selected } progress hook and layer id whose preview to keep
/// out   Result    [-]  { Heights, Sediment, Erosion, Analysis, Stats, Previews, Stages, N, Cell, Sea, World, Seed, Layers }
export function EvaluateProject(Raw, Cache = new Map(), Options = {}) {
    const Project = CompleteProject(Raw);
    const N = Project.Resolution;
    const Total = N * N;
    const Cell = Project.WorldSize / N;
    const Sea = Project.SeaLevel;
    const World = Project.WorldSize;
    const Context = { N, Cell, World, Sea, Seed: Project.Seed };
    const Visible = Project.Layers.map((Layer, Index) => ({ Layer, Index })).filter((Entry) => Entry.Layer.Visible);
    let Heights = new Float32Array(Total);
    let Sediment = new Float32Array(Total);
    let Erosion = new Float32Array(Total);
    const Stages = [];
    const Started = performance.now();
    for (let Position = 0; Position < Visible.length; Position++) {
        const { Layer } = Visible[Position];
        const Stack = Project.Layers.slice(0, Visible[Position].Index + 1);
        const Key = PrefixKey(Stack, Context);
        let Stage = Cache.get(Key);
        const Cached = Boolean(Stage);
        const Timer = performance.now();
        if (!Stage) {
            Stage = ComputeStage(Layer, Heights, Sediment, Erosion, Context);
            Cache.set(Key, Stage);
        }
        Heights = Stage.Heights;
        Sediment = Stage.Sediment;
        Erosion = Stage.Erosion;
        const Record = {
            Id: Layer.Id,
            Name: Layer.Name,
            Kind: Layer.Kind,
            Position,
            Cached,
            Ms: Cached ? 0 : performance.now() - Timer,
            Output: Stage.Output,
            Mask: Stage.Mask,
        };
        Stages.push(Record);
        if (typeof Options.OnStage === "function") {
            Options.OnStage({ Position, Total: Visible.length, Name: Layer.Name, Cached });
        }
    }
    PruneCache(Cache);
    const Analysis = AnalyseTerrain(Heights, N, Cell, Sea);
    const Stats = Summarise(Heights, Analysis, Sea, Cell, N, Started);
    const Previews = {};
    for (const Stage of Stages) {
        if (Stage.Id === Options.Selected) {
            Previews.Output = Stage.Output;
            Previews.Mask = Stage.Mask;
            Previews.Kind = Stage.Kind;
        }
    }
    return { Heights, Sediment, Erosion, Analysis, Stats, Previews, Stages: Stages.map(({ Output, Mask, ...Rest }) => Rest), N, Cell, Sea, World, Seed: Project.Seed, Layers: Project.Layers, Project };
}

/// in    Layer     [-]  layer being evaluated
/// in    Heights   [m]  input surface from the layer below
/// in    Sediment  [m]  accumulated deposition up to the layer below
/// in    Erosion   [m]  accumulated removal up to the layer below
/// in    Context   [-]  { N, Cell, World, Sea, Seed }
/// out   Stage     [-]  { Heights, Sediment, Erosion, Output, Mask } after the layer
function ComputeStage(Layer, Heights, Sediment, Erosion, Context) {
    const { N, Cell, World, Sea, Seed } = Context;
    const Total = N * N;
    const Mask = CombineMasks(Layer.Masks, { N, Cell, World, Sea, Heights, Seed });
    const Next = new Float32Array(Total);
    const Sediments = new Float32Array(Sediment);
    const Erosions = new Float32Array(Erosion);
    let Output;
    if (Layer.Kind === "Generator") {
        const Field = GenerateField(Layer.Source, { N, Cell, World, Normalize: true });
        const Amplitude = Layer.Amplitude;
        const Offset = Layer.Offset;
        for (let Index = 0; Index < Total; Index++) {
            const Weight = Layer.Opacity * Mask[Index];
            const Previous = Heights[Index];
            const Scaled = Field[Index] * Amplitude + Offset;
            let Value;
            switch (Layer.Blend) {
                case "Subtract":
                    Value = Previous - Scaled;
                    break;
                case "Replace":
                    Value = Scaled;
                    break;
                case "Multiply":
                    Value = Previous * Field[Index];
                    break;
                case "Max":
                    Value = Math.max(Previous, Scaled);
                    break;
                case "Min":
                    Value = Math.min(Previous, Scaled);
                    break;
                default:
                    Value = Previous + Scaled;
            }
            Next[Index] = Previous + Weight * (Value - Previous);
        }
        Output = ToPreview(Field, false);
    } else {
        const Erodibility = new Float32Array(Total).fill(1);
        if (Layer.Modulation.Enabled) {
            const Hardness = GenerateField(Layer.Modulation.Source, { N, Cell, World, Normalize: true });
            for (let Index = 0; Index < Total; Index++) {
                Erodibility[Index] = 1 - Layer.Modulation.Influence * SmootherStep(0.3, 0.7, Hardness[Index]);
            }
        }
        const Eroded = ApplyErosion(Layer.Erosion.Type, Layer.Erosion.Params, {
            N,
            Cell,
            World,
            Sea,
            Heights,
            Erodibility,
            Seed: Seed * 7919 + Layer.Seed,
        });
        const Delta = new Float32Array(Total);
        for (let Index = 0; Index < Total; Index++) {
            const Weight = Layer.Opacity * Mask[Index];
            const Change = (Eroded[Index] - Heights[Index]) * Weight;
            Next[Index] = Heights[Index] + Change;
            Delta[Index] = Change;
            if (Change > 0) {
                Sediments[Index] += Change;
            } else {
                Erosions[Index] -= Change;
            }
        }
        Output = ToPreview(Delta, true);
    }
    return { Heights: Next, Sediment: Sediments, Erosion: Erosions, Output, Mask: ToPreview(Mask, false) };
}

/// in    Heights    [m]   final surface
/// in    Analysis   [-]   AnalyseTerrain output
/// in    Sea        [m]   sea level
/// in    Cell       [m]   cell edge
/// in    N          [-]   grid edge
/// in    Started    [ms]  performance.now() at the start of evaluation
/// out   Stats      [-]   summary numbers for the viewport footer and tests
function Summarise(Heights, Analysis, Sea, Cell, N, Started) {
    let Minimum = Infinity;
    let Maximum = -Infinity;
    let Land = 0;
    for (let Index = 0; Index < Heights.length; Index++) {
        Minimum = Math.min(Minimum, Heights[Index]);
        Maximum = Math.max(Maximum, Heights[Index]);
        if (Heights[Index] > Sea) {
            Land++;
        }
    }
    let RiverCells = 0;
    for (let Index = 0; Index < Analysis.River.length; Index++) {
        if (Analysis.River[Index] > 0.15) {
            RiverCells++;
        }
    }
    return {
        Minimum,
        Maximum,
        LandFraction: Land / Heights.length,
        RiverLengthKm: (RiverCells * Cell) / 1000,
        Cell,
        N,
        ComputeMs: performance.now() - Started,
    };
}
