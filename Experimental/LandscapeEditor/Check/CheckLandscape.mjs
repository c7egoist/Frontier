// 📦 Landscape checks — headless verification of every generator, mask, erosion type, preset and satmap mode.
// Run with: node Check/CheckLandscape.mjs

import { GeneratorCatalogue, GenerateField } from "../js/Generators.js";
import { MaskCatalogue, BuildMaskWeight, DefaultMaskParams } from "../js/Masks.js";
import { ErosionCatalogue, ApplyErosion, DefaultErosionParams } from "../js/Erosion.js";
import { EvaluateProject } from "../js/Pipeline.js";
import { Presets, PresetProject } from "../js/Presets.js";
import { SatmapModes, ComposeSatmap, ComposeHillshade } from "../js/Satmap.js";

const Failures = [];
const Passes = [];

/// in    Name     [-]  check label
/// in    Ok       [-]  condition result
/// in    Detail   [-]  text shown with the result
/// out   None     [-]  records the result
function Expect(Name, Ok, Detail = "") {
    (Ok ? Passes : Failures).push(`${Ok ? "PASS" : "FAIL"}  ${Name}${Detail ? `  (${Detail})` : ""}`);
}

/// in    Field    [-]  numeric array
/// out   Range    [-]  { Low, High, Finite } over every sample
function RangeOf(Field) {
    let Low = Infinity;
    let High = -Infinity;
    let Finite = true;
    for (const Value of Field) {
        if (!Number.isFinite(Value)) {
            Finite = false;
            continue;
        }
        Low = Math.min(Low, Value);
        High = Math.max(High, Value);
    }
    return { Low, High, Finite };
}

const N = 64;
const Cell = 4096 / N;
const World = 4096;

for (const [Type, Entry] of Object.entries(GeneratorCatalogue)) {
    const Field = GenerateField({ Type, Seed: 3, Params: {} }, { N, Cell, World, Normalize: true });
    const { Low, High, Finite } = RangeOf(Field);
    Expect(`generator ${Type} finite and in [0,1]`, Finite && Low >= -1e-6 && High <= 1 + 1e-6, `${Low.toFixed(3)}..${High.toFixed(3)}`);
    if (Type !== "Constant") {
        Expect(`generator ${Type} has variation`, High - Low > 1e-3, Entry.Name);
    }
}

const Base = GenerateField({ Type: "Perlin", Seed: 9, Params: {} }, { N, Cell, World, Normalize: true });
const Heights = Float32Array.from(Base, (Value) => (Value - 0.5) * 1600 + 300);
for (const Kind of Object.keys(MaskCatalogue)) {
    const Spec = { Kind, Seed: 4, Params: DefaultMaskParams(Kind), Invert: false, Strength: 1 };
    if (MaskCatalogue[Kind].Generator) {
        Spec.Generator = { Type: "Simplex", Seed: 4, Params: {} };
    }
    const Weight = BuildMaskWeight(Spec, { N, Cell, World, Sea: 0, Heights });
    const { Low, High, Finite } = RangeOf(Weight);
    Expect(`mask ${Kind} finite and in [0,1]`, Finite && Low >= -1e-6 && High <= 1 + 1e-6, `${Low.toFixed(3)}..${High.toFixed(3)}`);
}

for (const Type of Object.keys(ErosionCatalogue)) {
    const Params = DefaultErosionParams(Type);
    const Eroded = ApplyErosion(Type, Params, { N, Cell, Sea: 0, World, Heights, Erodibility: new Float32Array(N * N).fill(1), Seed: 5 });
    const Change = RangeOf(Eroded.map((Value, Index) => Value - Heights[Index]));
    const Own = RangeOf(Eroded);
    Expect(`erosion ${Type} finite`, Own.Finite && Change.Finite);
    Expect(`erosion ${Type} change bounded`, Math.abs(Change.Low) < 2500 && Math.abs(Change.High) < 2500, `${Change.Low.toFixed(0)}..${Change.High.toFixed(0)} m`);
}

const StartPresets = Date.now();
for (const Preset of Presets) {
    const Project = PresetProject(Preset.Id);
    Project.Resolution = 128;
    const Result = EvaluateProject(Project, new Map(), {});
    const Range = RangeOf(Result.Heights);
    const Extreme = Math.max(Math.abs(Range.Low), Math.abs(Range.High));
    Expect(`preset ${Preset.Id} finite`, Range.Finite);
    Expect(`preset ${Preset.Id} heights bounded`, Extreme < 6000, `${Range.Low.toFixed(0)}..${Range.High.toFixed(0)} m`);
    Expect(`preset ${Preset.Id} land fraction sensible`, Result.Stats.LandFraction >= 0.5 && Result.Stats.LandFraction <= 1, `${(Result.Stats.LandFraction * 100).toFixed(0)}%`);
    for (const Mode of SatmapModes) {
        const Pixels = ComposeSatmap(Result, Mode.Id, Project.Palette);
        if (Pixels.length !== Result.N * Result.N * 4) {
            Expect(`preset ${Preset.Id} satmap ${Mode.Id} size`, false);
        }
    }
    Expect(`preset ${Preset.Id} satmap modes`, SatmapModes.every((Mode) => ComposeSatmap(Result, Mode.Id, Project.Palette).length === Result.N * Result.N * 4));
    Expect(`preset ${Preset.Id} hillshade size`, ComposeHillshade(Result).length === Result.N * Result.N * 4);
}
const PresetMs = Date.now() - StartPresets;

{
    const Project = PresetProject("Himalayan");
    Project.Resolution = 128;
    const Cache = new Map();
    const First = EvaluateProject(Project, Cache, {});
    const Second = EvaluateProject(Project, Cache, {});
    Expect("evaluation is deterministic", First.Heights.every((Value, Index) => Value === Second.Heights[Index]));
    Expect("second evaluation reuses every stage", Second.Stages.every((Stage) => Stage.Cached));
}

console.log(Passes.join("\n"));
console.log(Failures.join("\n"));
console.log(`\n${Passes.length} passed, ${Failures.length} failed, presets evaluated in ${PresetMs} ms`);
process.exitCode = Failures.length ? 1 : 0;
