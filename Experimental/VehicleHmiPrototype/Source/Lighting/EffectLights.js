//============================================================================================================================================
//                                                         EFFECTLIGHTS.JS
//============================================================================================================================================
// 🧩 The light that sparks and derez cubes throw: sparks are gathered into a bounded number of spatial bins, each a point light
//    whose colour is the bin's summed blackbody radiance; each derez emitter is one point light at its shell. They join the clustered
//    set like any other light, so the surface cache and the GI see them too.

import { MakeLight, LightType } from "./ClusteredLightStore.js";
import { ResolveSparkRadiance, ResolveSparkGain } from "../SparkSequence.js";

export const EffectLightLimits = Object.freeze({
    SparkBins: 12,         // [-] spark light sources per frame
    SparkBinSize: 1.5,     // [m] the spatial bin edge sparks are gathered into
    SparkReach: 4.0,       // [m]
    Emitters: 8,           // [-] derez / rez emitter lights per frame
    EmitterReach: 9.0,     // [m]
    // 📝 Whole-set budget: the summed luminance of every effect light is held to this, so a shower of sparks cannot
    //    out-light the sun on the course.
    LuminanceBudget: 100.0
});

const Luma = (RGB) => RGB[0] * 0.2126 + RGB[1] * 0.7152 + RGB[2] * 0.0722;

// 📝 The effect lights for this frame: at most SparkBins spark lights and Emitters derez lights, budgeted as one set.
export function BuildEffectLights(Sparks, Effects)
{
    const Lights = [];
    if (Sparks && Sparks.Settings.Enabled)
        Lights.push(...SparkLights(Sparks));
    if (Effects)
        Lights.push(...EmitterLights(Effects));
    const Budget = Lights.reduce((Sum, Light) => Sum + Luma(Light.Colour), 0);
    const Scale = Math.min(1, EffectLightLimits.LuminanceBudget / Math.max(Budget, 1.0e-3));
    for (const Light of Lights)
        Light.Colour = Light.Colour.map((Channel) => Channel * Scale);
    return Lights;
}

function SparkLights(Sparks)
{
    const Bins = new Map();
    for (const Spark of Sparks.Particles)
    {
        const Gain = ResolveSparkGain(Spark);
        const Radiance = ResolveSparkRadiance(Spark.Kelvin).map((Channel) => Channel * Sparks.Settings.Brightness * Spark.Size * Spark.Size * Gain * 0.012);
        const Energy = Luma(Radiance);
        if (!(Energy > 0))
            continue;
        const Key = Spark.Position.map((Value) => Math.floor(Value / EffectLightLimits.SparkBinSize)).join(",");
        const Bin = Bins.get(Key) || { Energy: 0, Weighted: [0, 0, 0], Colour: [0, 0, 0], Position: [0, 0, 0] };
        Bin.Energy += Energy;
        for (let Axis = 0; Axis < 3; ++Axis)
        {
            Bin.Position[Axis] += Spark.Position[Axis] * Energy;
            Bin.Colour[Axis] += Radiance[Axis];
        }
        Bins.set(Key, Bin);
    }
    return [...Bins.values()]
        .sort((A, B) => B.Energy - A.Energy)
        .slice(0, EffectLightLimits.SparkBins)
        .map((Bin) =>
        {
            // 📐 A bin's light is its summed radiance, held to a per-bin energy so one dense burst cannot dominate the set.
            const Clamp = Math.min(1, 20 / Math.max(Bin.Energy, 1.0e-6));
            return MakeLight({
                Type: LightType.Point,
                Position: Bin.Position.map((Value) => Value / Bin.Energy),
                Forward: [0, 0, -1], Up: [1, 0, 0],
                Colour: Bin.Colour.map((Channel) => Channel * Clamp),
                Reach: EffectLightLimits.SparkReach,
                Shadow: false
            });
        });
}

// 📝 The derez shell's glow: the emitter's envelope (rise, hold, fade) times the configured strength, at its drifting centre.
function EmitterLights(Effects)
{
    const Settings = Effects.Settings;
    const Lights = [];
    for (const Emitter of Effects.Emitters)
    {
        if (!Emitter || Emitter.Kind === 4 || Effects.Clock < Emitter.Start || Effects.Clock >= Emitter.End)
            continue;
        const Age = Effects.Clock - Emitter.Start;
        const Duration = Emitter.End - Emitter.Start;
        const Envelope = Math.min(1, Age / 0.12) * Math.min(1, (Duration - Age) / 0.65)
            * Math.exp(-Math.max(0, Age - ((Settings.HoldOffset || 0) + (Settings.Wave || 1))) / 0.8);
        const Power = Math.min(35, Math.max(0, Settings.Intensity * (Settings.Faces ? Settings.GlowStrength : 6))) * Envelope;
        if (!(Power > 0))
            continue;
        const Centre = Emitter.Centre, Matrix = Emitter.Transform;
        const Drift = Emitter.Kind % 2 === 0 ? (1 - Math.exp(-Settings.Drag * Age)) / Math.max(Settings.Drag, 0.001) : 0;
        const Position = [0, 1, 2].map((Axis) => Matrix[12 + Axis] + Matrix[Axis] * Centre[0] + Matrix[4 + Axis] * Centre[1]
                                                  + Matrix[8 + Axis] * Centre[2] + Emitter.Velocity[Axis] * Drift);
        // 📐 The light sits above the emitting shell, so the shell does not shadow its own glow.
        const Top = Emitter.Kind < 2 ? (Effects.Bounds?.Maximum?.[2] ?? 1.35) : (Emitter.Extent?.[2] ?? 0.35);
        Position[2] += Top + 0.15;
        const Colour = Settings.Faces ? (Effects.LightAlbedo || [0.45, 0.65, 0.5]) : LinearHex(Settings.Glow);
        Lights.push(MakeLight({
            Type: LightType.Point,
            Position,
            Forward: [0, 0, -1], Up: [1, 0, 0],
            Colour: Colour.map((Channel) => Channel * Power),
            Reach: EffectLightLimits.EmitterReach,
            Shadow: false
        }));
        if (Lights.length >= EffectLightLimits.Emitters)
            break;
    }
    return Lights;
}

// 📝 A #rrggbb colour as linear RGB (sRGB decoded).
function LinearHex(Hex)
{
    return [1, 3, 5].map((Start) =>
    {
        const C = parseInt(Hex.slice(Start, Start + 2), 16) / 255;
        return C <= 0.04045 ? C / 12.92 : ((C + 0.055) / 1.055) ** 2.4;
    });
}
