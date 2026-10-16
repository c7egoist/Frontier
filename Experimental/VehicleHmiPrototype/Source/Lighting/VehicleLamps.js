//============================================================================================================================================
//                                                        VEHICLELAMPS.JS
//============================================================================================================================================
// 🧩 The ControlVehicle's lamps: low and high beam, fog lamps and the roof flood bar. The lamps are attached to the body, so they
//    follow the car; their light is the clustered light set, and their lenses glow with the lamp state.

import { MakeLight, LightType } from "./ClusteredLightStore.js";
import { ProfileIds } from "./IesProfiles.js";
import { TransformPoint, TransformDirection } from "../TransformProjection.js";

// 📝 Beam states in the order the I key steps through them: off, low beam, high beam, back to off.
export const BeamStates = Object.freeze(["Off", "Low", "High"]);

// 📝 Lamp technologies: a colour temperature and an efficacy scale on the photometric values. Choosing a technology sets both,
//    as swapping the bulbs does; the sliders then refine each value.
export const LampTechnologies = Object.freeze({
    Halogen: Object.freeze({ Label: "Halogen", Kelvin: 3200, Scale: 0.8 }),
    Xenon:   Object.freeze({ Label: "Xenon",   Kelvin: 4300, Scale: 1.3 }),
    LED:     Object.freeze({ Label: "LED",     Kelvin: 5700, Scale: 1.6 })
});

// 📐 Body coordinates (metres; +X forward, +Y left, +Z up). The headlamp lenses are the front faces of the body's headlight
//    housings (the authored Headlight family spans y 0.2–1.2 m, z 0.27–0.58 m); the fog lamps sit below them.
export const VehicleLampLayout = Object.freeze({
    HeadlampX: 3.13,  HeadlampY: 0.70,  HeadlampZ: 0.43,
    FogX: 3.12,       FogY: 0.85,       FogZ: 0.20
});

// 📐 The authored lens emission (MaterialSpecification.js) is scaled by the lamp state: a parked car's lenses still show a dim glow.
export const LensScaleOff = Object.freeze({ Headlight: 0.30, FogLens: 0.04, FloodLens: 0.02 });

// 📝 The lamp settings. Photometric values are scene candelas (see ClusteredLightStore.js for the units).
export function ConstructLampSettings()
{
    return {
        Beam: 0,                  // [-] index into BeamStates
        Fog: false,               // [-] the fog lamps
        RoofFlood: false,         // [-] the roof flood bar
        Technology: "LED",        // [-] a LampTechnologies key
        Kelvin: LampTechnologies.LED.Kelvin,
        Low:     { Intensity: 420, CutoffDegrees: -0.6, RightRise: 0.8, AimDegrees: 0.0, Reach: 70 },
        High:    { Intensity: 1100, Spread: 1.0, AimDegrees: 0.0, Reach: 120 },
        FogLamp: { Intensity: 260, CutoffDegrees: -2.5, Reach: 40 },
        Flood:   { Intensity: 900, Width: 40, Height: 22, AimDegrees: -4.0, Reach: 90 },
        Street:  { Intensity: 170, Reach: 22, Kelvin: 3000, Profile: "Built-in" },   // [-] "Built-in" or "Imported" (an LM-63 file)
        Strips:  { Gain: 1.0 }
    };
}

// 📝 A keyboard action for the lamps, or null. I steps the beam; Shift+I toggles the fog lamps; L toggles the roof flood bar. The
//    Ctrl, Alt and Meta modifiers are left to the browser, and auto-repeat is ignored.
export function ResolveLampAction(Event)
{
    if (Event.ctrlKey || Event.altKey || Event.metaKey || Event.repeat)
        return null;
    if (Event.code === "KeyI")
        return Event.shiftKey ? "Fog" : "Beam";
    if (Event.code === "KeyL")
        return "RoofFlood";
    return null;
}

// 📝 Applies one lamp action to the lamp settings and returns the description for the notice.
export function ApplyLampAction(Lamps, Action)
{
    if (Action === "Beam")
        Lamps.Beam = (Lamps.Beam + 1) % BeamStates.length;
    else if (Action === "Fog")
        Lamps.Fog = !Lamps.Fog;
    else if (Action === "RoofFlood")
        Lamps.RoofFlood = !Lamps.RoofFlood;
    return DescribeLamps(Lamps);
}

export function DescribeLamps(Lamps)
{
    const Parts = [Lamps.Beam === 0 ? "Lights off" : `${BeamStates[Lamps.Beam]} beam`];
    if (Lamps.Fog) Parts.push("fog");
    if (Lamps.RoofFlood) Parts.push("roof flood");
    return Parts.join(" · ");
}

// 📐 Linear RGB of a colour temperature: a blackbody's sRGB by Tanner Helland's fit (1000–6600 K), decoded and normalised to unit
//    luminance, so the intensity settings carry all of the brightness.
export function ResolveLampColour(Kelvin)
{
    const T = Math.max(1000, Math.min(6600, Kelvin)) / 100;
    const Green = Math.max(0, Math.min(255, 99.4708025861 * Math.log(T) - 161.1195681661));
    const Blue = T <= 19 ? 0 : Math.max(0, Math.min(255, 138.5177312231 * Math.log(T - 10) - 305.0447927307));
    const RGB = [255, Green, Blue].map((Channel) => Math.pow(Channel / 255, 2.2));
    const Luminance = RGB[0] * 0.2126 + RGB[1] * 0.7152 + RGB[2] * 0.0722;
    return RGB.map((Channel) => Channel / Math.max(Luminance, 1.0e-6));
}

// 📝 The lens emission scales for the lamp state: the headlamp lenses brighten with the beam, the fog and flood lenses with their lamps.
export function ResolveLensScales(Lamps)
{
    return {
        Headlight: Lamps.Beam > 0 ? 1.0 : LensScaleOff.Headlight,
        FogLens: Lamps.Fog ? 1.0 : LensScaleOff.FogLens,
        FloodLens: Lamps.RoofFlood ? 1.0 : LensScaleOff.FloodLens
    };
}

// 📝 The vehicle's lights for this frame, in world space: headlamps (the active beam), fog lamps, roof flood. Body is the body's
//    world transform (a column-major 4 × 4); RoofLens is the flood bar's emitting face in body coordinates.
export function BuildVehicleLights(Lamps, Body, RoofLens)
{
    const Lights = [];
    const Forward = TransformDirection(Body, [1.0, 0.0, 0.0]);
    const Up = TransformDirection(Body, [0.0, 0.0, 1.0]);
    const Technology = LampTechnologies[Lamps.Technology] || LampTechnologies.LED;
    const Colour = (Intensity) => ResolveLampColour(Lamps.Kelvin).map((Channel) => Channel * Intensity * Technology.Scale);

    if (Lamps.Beam > 0)
    {
        const High = BeamStates[Lamps.Beam] === "High";
        const Spec = High ? Lamps.High : Lamps.Low;
        for (const Side of [-1, 1])
            Lights.push(MakeLight({
                Type: LightType.Spot,
                Position: TransformPoint(Body, [VehicleLampLayout.HeadlampX, Side * VehicleLampLayout.HeadlampY, VehicleLampLayout.HeadlampZ]),
                Forward, Up,
                Colour: Colour(Spec.Intensity),
                Reach: Spec.Reach,
                Profile: High ? ProfileIds.HighBeam : ProfileIds.LowBeam,
                Shadow: true
            }));
    }
    if (Lamps.Fog)
        for (const Side of [-1, 1])
            Lights.push(MakeLight({
                Type: LightType.Spot,
                Position: TransformPoint(Body, [VehicleLampLayout.FogX, Side * VehicleLampLayout.FogY, VehicleLampLayout.FogZ]),
                Forward, Up,
                Colour: Colour(Lamps.FogLamp.Intensity),
                Reach: Lamps.FogLamp.Reach,
                Profile: ProfileIds.Fog,
                Shadow: true
            }));
    if (Lamps.RoofFlood && RoofLens)
        Lights.push(MakeLight({
            Type: LightType.Spot,
            Position: TransformPoint(Body, RoofLens.Position),
            Forward: TransformDirection(Body, RoofLens.Forward),
            Up: TransformDirection(Body, RoofLens.Up),
            Colour: Colour(Lamps.Flood.Intensity),
            Reach: Lamps.Flood.Reach,
            Profile: ProfileIds.Flood,
            Shadow: true
        }));
    return Lights;
}
