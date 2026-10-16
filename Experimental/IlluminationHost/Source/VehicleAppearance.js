//============================================================================================================================================
//                                                         VEHICLEAPPEARANCE.JS
//============================================================================================================================================
// 🧩 Live vehicle materials shared by the cabin Garage HMI and the editor inspector.

import { CourseMaterial } from "./MaterialSpecification.js";

// These match the paint and wheel swatches in Experimental/interactive-vehicle-hmi-configurator.
export const VehiclePaintOptions = Object.freeze([
    { Id: "silver",  Name: "Nebula Silver",  Hex: "#c2c8d0", Metallic: true },
    { Id: "black",   Name: "Obsidian Black", Hex: "#17191d", Metallic: true },
    { Id: "red",     Name: "Command Red",    Hex: "#8a1a1d", Metallic: true },
    { Id: "blue",    Name: "Tactical Blue",  Hex: "#1c3f73", Metallic: true },
    { Id: "sand",    Name: "Moab Sand",      Hex: "#b2946a", Metallic: false },
    { Id: "green",   Name: "Recon Green",    Hex: "#33442f", Metallic: false },
    { Id: "white",   Name: "Arctic White",   Hex: "#e7ebef", Metallic: true },
    { Id: "copper",  Name: "Copper Bronze",  Hex: "#8c5a2e", Metallic: true }
]);

// The prototype's authored rim mesh is fixed; these change its live surface material only.
export const VehicleWheelOptions = Object.freeze([
    { Id: "trail",    Name: "Trail Beadlock", Hex: "#2b2e33", Roughness: 0.38 },
    { Id: "sport",    Name: "Machined Sport", Hex: "#c9ced4", Roughness: 0.22 },
    { Id: "blackout", Name: "Blackout Mesh",  Hex: "#0e0f11", Roughness: 0.32 },
    { Id: "bronze",   Name: "Bronze Forged",  Hex: "#9a6a2f", Roughness: 0.25 }
]);

export const VehicleAppearanceDefaults = Object.freeze({ PaintId: "silver", Finish: "gloss", WheelId: "trail" });
export const VehicleViewModes = Object.freeze(["solid", "ghost", "wireframe"]);

export function FindVehiclePaint(Id)
{
    return VehiclePaintOptions.find((Option) => Option.Id === Id) || VehiclePaintOptions[0];
}

export function FindVehicleWheel(Id)
{
    return VehicleWheelOptions.find((Option) => Option.Id === Id) || VehicleWheelOptions[0];
}

// UI swatches are authored as sRGB hex; the renderer's MaterialRecord albedo is linear Rec.709.
export function HexToLinearRgb(Hex)
{
    const Match = /^#?([0-9a-f]{6})$/i.exec(String(Hex));
    if (!Match)
        throw new Error(`Expected a six-digit sRGB colour, got ${Hex}`);
    const Channels = [0, 2, 4].map((Offset) => parseInt(Match[1].slice(Offset, Offset + 2), 16) / 255.0);
    return Channels.map((Value) => Value <= 0.04045 ? Value / 12.92 : Math.pow((Value + 0.055) / 1.055, 2.4));
}

function ConstructBaseMaterial(Hex, Roughness, Metalness, CoatWeight, CoatRoughness, SpecularLevel)
{
    return {
        Albedo: HexToLinearRgb(Hex),
        Roughness,
        Metalness,
        Emission: [0.0, 0.0, 0.0],
        CoatWeight,
        CoatRoughness,
        SpecularLevel,
        Transmission: 0.0
    };
}

export function ConstructVehiclePaintMaterial(PaintId, Finish)
{
    const Paint = FindVehiclePaint(PaintId);
    const Gloss = Finish !== "matte";
    // A metallic base under a clear coat, or a diffuse non-metallic solid colour. Matte reduces both coat and sheen.
    return ConstructBaseMaterial(Paint.Hex,
        Gloss ? 0.105 : 0.62,
        Paint.Metallic ? 0.68 : 0.02,
        Gloss ? 1.0 : 0.10,
        Gloss ? 0.035 : 0.42,
        Paint.Metallic ? 0.06 : 0.04);
}

export function ConstructVehicleWheelMaterial(WheelId)
{
    const Wheel = FindVehicleWheel(WheelId);
    return ConstructBaseMaterial(Wheel.Hex, Wheel.Roughness, 0.94, 0.35, 0.12, 0.05);
}

export function ApplyVehicleAppearanceToMaterials(Materials, Appearance)
{
    Materials[CourseMaterial.BodyCoat] = ConstructVehiclePaintMaterial(Appearance.PaintId, Appearance.Finish);
    Materials[CourseMaterial.Hub] = ConstructVehicleWheelMaterial(Appearance.WheelId);
    return Materials;
}
