//============================================================================================================================================
//                                                        STREETLIGHTING.JS
//============================================================================================================================================
// 🧩 The course's own lights: lampposts (IES street downlights), tunnel and hangar strips, gantry lamps and the LED building's strip
//    rows (rectangular area lights). Built from the same placements the geometry is, so a light cannot drift from its fixture.

import { MakeLight, LightType } from "./ClusteredLightStore.js";
import { ProfileIds } from "./IesProfiles.js";
import { ResolveLampHeadLens, ResolveLedStripRows } from "../LightFixtureStructure.js";
import { ResolveLampColour } from "./VehicleLamps.js";
import { CourseMaterial } from "../MaterialSpecification.js";

// 📝 Shapes whose placements carry a light, and what kind of light each one is.
const StripShapes = new Set(["TunnelLamp", "LampStrip", "GantryLamp"]);

// 📝 The static lights of the course for one set of lamp settings. Placements are ResolveLevelPlacements()'s list; Materials
//    supplies the authored emission of the strips so the lights carry the colour of their fixtures.
export function BuildStreetLights(Placements, Materials, Lamps)
{
    const Lights = [];
    const Street = ResolveLampColour(Lamps.Street.Kelvin);
    const StreetScale = Lamps.Street.Intensity;
    const Gain = Lamps.Strips.Gain;
    for (const Placement of Placements)
    {
        const [X, Y, Z] = Placement.Position;
        if (Placement.Shape === "LampHead")
        {
            // 📐 A luminaire's placement is its arm's tip; its lens is the rectangle the street downlight leaves from.
            const Lens = ResolveLampHeadLens(X, Y, Placement.Yaw);
            Lights.push(MakeLight({
                Type: LightType.Spot, Position: Lens.Position, Forward: Lens.Forward, Up: Lens.Up,
                Colour: Street.map((Channel) => Channel * StreetScale), Reach: Lamps.Street.Reach,
                Profile: Lamps.Street.Profile === "Imported" ? ProfileIds.Imported : ProfileIds.Street, Shadow: false
            }));
        }
        else if (StripShapes.has(Placement.Shape))
        {
            const Shape = Placement.Shape;
            // 📐 Each strip is a box hanging from its placement: the emitting face is its underside, facing down.
            const Half = Shape === "TunnelLamp" ? [1.5, 0.06] : Shape === "LampStrip" ? [12.0, 0.125] : [10.0, 0.11];
            const Emission = Materials[Placement.Material >= 0 ? Placement.Material : CourseMaterial.LampCool].Emission;
            Lights.push(MakeLight({
                Type: LightType.Rect,
                Position: [X, Y, Z - 0.004],
                Forward: [0, 0, -1], Up: [0, 1, 0],
                Colour: Emission.map((Channel) => Channel * Gain),
                Reach: Shape === "TunnelLamp" ? 9 : 16,
                HalfSize: Half,
                Shadow: false
            }));
        }
        else if (Placement.Shape === "LedBuilding")
            for (const Row of ResolveLedStripRows())
            {
                // 📐 The row's frame is the building's local frame turned by its yaw and moved to its placement.
                const C = Math.cos(Placement.Yaw), S = Math.sin(Placement.Yaw);
                const Local = Row.Centre;
                const Centre = [X + C * Local[0] - S * Local[1], Y + S * Local[0] + C * Local[1], Z + Local[2]];
                const Emission = Materials[CourseMaterial.LedStrip].Emission;
                Lights.push(MakeLight({
                    Type: LightType.Rect,
                    Position: Centre,
                    Forward: [C, S, 0], Up: [0, 0, 1],
                    Colour: Emission.map((Channel) => Channel * Gain),
                    Reach: 18,
                    HalfSize: Row.HalfSize,
                    Shadow: false
                }));
            }
    }
    return Lights;
}

