//============================================================================================================================================
//                                                       LIGHTFIXTURESTRUCTURE.JS
//============================================================================================================================================
// 🧩 Facet geometry for the lit fixtures: street lampposts (pole, arm, luminaire), the LED light building and the roof flood bar
//    the ControlVehicle carries. Every shape is authored in its own local frame; placements turn it into the world.

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitBoxFacets } from "./CourseStructure.js";

//------------------------------------------------------------------------------------------------------------------------
//                                                    FACET HELPERS
//------------------------------------------------------------------------------------------------------------------------

const Subtract = (A, B) => [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
const Cross = (A, B) => [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
const Dot = (A, B) => A[0] * B[0] + A[1] * B[1] + A[2] * B[2];

// 📝 A quad whose outward normal is the one asked for: the winding is chosen from the geometry, not from the corner order.
export function EmitQuadFacing(Facets, A, B, C, D, Family, Normal)
{
    const Geometric = Cross(Subtract(B, A), Subtract(C, A));
    const [P, Q, R, S] = Dot(Geometric, Normal) >= 0 ? [A, B, C, D] : [A, D, C, B];
    Facets.push({ Corners: [P, Q, R], Family });
    Facets.push({ Corners: [P, R, S], Family });
}

// 📝 A frustum (truncated cone or cylinder) standing on z = 0, with both caps. Radii are at the bottom and the top.
export function EmitFrustumFacets(BottomRadius, TopRadius, Height, Sides, Family)
{
    const Facets = [];
    const Ring = (Radius, Z, Index) => { const Angle = 2 * Math.PI * Index / Sides; return [Radius * Math.cos(Angle), Radius * Math.sin(Angle), Z]; };
    const Slope = (BottomRadius - TopRadius) / Math.max(Height, 1.0e-6);
    for (let Side = 0; Side < Sides; ++Side)
    {
        const Mid = 2 * Math.PI * (Side + 0.5) / Sides;
        const Normal = [Math.cos(Mid), Math.sin(Mid), Slope];
        EmitQuadFacing(Facets, Ring(BottomRadius, 0, Side), Ring(BottomRadius, 0, Side + 1), Ring(TopRadius, Height, Side + 1),
                       Ring(TopRadius, Height, Side), Family, Normal);
    }
    const Centre = [0, 0, 0], Top = [0, 0, Height];
    for (let Side = 0; Side < Sides; ++Side)
    {
        Facets.push({ Corners: [Centre, Ring(BottomRadius, 0, Side + 1), Ring(BottomRadius, 0, Side)], Family });
        if (TopRadius > 0)
            Facets.push({ Corners: [Top, Ring(TopRadius, Height, Side), Ring(TopRadius, Height, Side + 1)], Family });
    }
    if (TopRadius <= 0)
        for (let Side = 0; Side < Sides; ++Side)
            Facets.push({ Corners: [Top, Ring(BottomRadius, 0, Side), Ring(BottomRadius, 0, Side + 1)], Family });
    return Facets;
}

// 📝 Translates facets; Yaw turns them about the vertical axis first (the rotation keeps the winding).
export function PlaceFacets(Facets, Position, Yaw = 0.0)
{
    const C = Math.cos(Yaw), S = Math.sin(Yaw);
    const Move = (P) => [C * P[0] - S * P[1] + Position[0], S * P[0] + C * P[1] + Position[1], P[2] + Position[2]];
    return Facets.map((Facet) => ({ ...Facet, Corners: Facet.Corners.map(Move) }));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     LAMPPOST
//------------------------------------------------------------------------------------------------------------------------

// 📐 The street lamp in its own frame: the pole's foot at the origin, the arm running along +X from the pole top, and the
//    luminaire hung from the arm's tip. The shape is split in three so that only the pole is a collider (the arm is at 9 m).
const PoleHeight = 9.4, ArmDrop = 0.09, HeadDrop = 0.12;
export const LampPostLayout = Object.freeze({
    PoleHeight,                          // [m] pole top
    ArmLength:  1.5,                     // [m] from the pole axis to the luminaire
    ArmDrop,                             // [m] the arm is a 9 cm square section whose underside is at ArmBottom
    HeadDrop,                            // [m] the luminaire hangs this far below the arm's underside
    ArmBottom:  PoleHeight - ArmDrop,    // [m] the luminaire's mount: the arm's underside
    LensZ:      PoleHeight - ArmDrop - HeadDrop - 0.005,   // [m] the lens face, just under the housing
    LensWidth:  0.50,                    // [m] along the arm's cross axis
    LensDepth:  0.22                     // [m] across the road
});

// 📝 Pole: a tapered steel shaft, a plinth at its foot. Collider-sized (0.3 m across at the foot).
export function EmitLampPoleFacets()
{
    const Facets = EmitFrustumFacets(0.15, 0.085, LampPostLayout.PoleHeight, 10, CourseMaterial.SteelDark);
    return [...Facets, ...EmitBoxFacets(0.6, 0.6, 0.45, CourseMaterial.ConcreteInterior)];
}

// 📝 Arm: a box from the pole top along +X, the same steel. Rastered only: it is far above the car.
export function EmitLampArmFacets()
{
    return PlaceFacets(EmitBoxFacets(LampPostLayout.ArmLength, LampPostLayout.ArmDrop, LampPostLayout.ArmDrop, CourseMaterial.SteelDark),
                       [0.5 * LampPostLayout.ArmLength, 0.0, LampPostLayout.ArmBottom]);
}

// 📝 Luminaire: a dark housing hung from the arm's tip, with an emissive lens on its underside (the LED's light leaves here).
export function EmitLampHeadFacets()
{
    const Facets = PlaceFacets(EmitBoxFacets(0.56, 0.28, LampPostLayout.HeadDrop, CourseMaterial.LampHousing), [0.0, 0.0, -LampPostLayout.HeadDrop]);
    const W = 0.5 * LampPostLayout.LensWidth, D = 0.5 * LampPostLayout.LensDepth, Z = -LampPostLayout.HeadDrop - 0.005;
    EmitQuadFacing(Facets, [-W, -D, Z], [W, -D, Z], [W, D, Z], [-W, D, Z], CourseMaterial.StreetLens, [0.0, 0.0, -1.0]);
    return Facets;
}

// 📐 The lens of a luminaire whose placement (the arm's tip, at ArmBottom) faces Yaw: its centre, the direction it emits (down),
//    the up axis of its face (along the arm) and the face's half extents.
export function ResolveLampHeadLens(TipX, TipY, Yaw)
{
    const C = Math.cos(Yaw), S = Math.sin(Yaw);
    return {
        Position: [TipX, TipY, LampPostLayout.LensZ],
        Forward: [0.0, 0.0, -1.0],
        Up: [C, S, 0.0],
        HalfSize: [0.5 * LampPostLayout.LensWidth, 0.5 * LampPostLayout.LensDepth]
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    LED BUILDING
//------------------------------------------------------------------------------------------------------------------------

// 📐 The LED building's site: west of the pad, on the grass, its LED facade turned to face the start line.
export const LedBuildingPlacement = Object.freeze({ Position: [-84.0, 0.0, 0.0], Yaw: 0.0 });

// 📐 An LED light building in its local frame: the origin at the centre of its footprint at ground level, its LED facade on
//    the +X side. Three rows of LED strips run the facade's width; each is a rectangular area light.
export const LedBuildingLayout = Object.freeze({
    Length: 14.0,                      // [m] along X
    Width:  8.0,                       // [m] along Y
    Height: 7.0,                       // [m]
    StripRows: Object.freeze([1.8, 3.6, 5.4]),   // [m] bottom of each strip
    StripHeight: 0.28,                 // [m]
    StripSpan: 11.0,                   // [m] along Y, centred
    StripProud: 0.03                   // [m] how far the strips stand off the facade
});

export function EmitLedBuildingFacets()
{
    const L = LedBuildingLayout;
    const Facets = EmitBoxFacets(L.Length, L.Width, L.Height, CourseMaterial.LedWallPanel);
    for (const Row of L.StripRows)
    {
        const X = 0.5 * L.Length + L.StripProud, Y0 = -0.5 * L.StripSpan, Y1 = 0.5 * L.StripSpan;
        const Z0 = Row, Z1 = Row + L.StripHeight;
        EmitQuadFacing(Facets, [X, Y0, Z0], [X, Y1, Z0], [X, Y1, Z1], [X, Y0, Z1], CourseMaterial.LedStrip, [1.0, 0.0, 0.0]);
    }
    return Facets;
}

// 📐 The emitting face of one LED strip row in the building's local frame.
export function ResolveLedStripRows()
{
    const L = LedBuildingLayout;
    return L.StripRows.map((Row) => ({
        Centre: [0.5 * L.Length + L.StripProud + 0.01, 0.0, Row + 0.5 * L.StripHeight],
        Forward: [1.0, 0.0, 0.0],
        Up: [0.0, 0.0, 1.0],
        HalfSize: [0.5 * L.StripSpan, 0.5 * L.StripHeight]
    }));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    ROOF FLOOD BAR
//------------------------------------------------------------------------------------------------------------------------

// 📐 The roof bar in body coordinates (metres, the car's forward axis is +X): centred over the roof, 1.2 m long.
// 📐 The authored roof is flat at 1.239 m between x = −0.5 and 0.5 m (the windscreen falls away behind, the rear edge in front);
//    the bar spans the flat part.
export const RoofBarLayout = Object.freeze({
    CentreX: -0.05,     // [m]
    Length:  1.00,
    Width:   0.16,
    Height:  0.10,
    LensProud: 0.006
});

// 📝 Roof height at the bar's footprint, read from the body's own facets so the bar sits on the authored roof.
export function ResolveRoofHeight(BodyFacets)
{
    let Top = -Infinity;
    for (const Facet of BodyFacets)
        for (const Corner of Facet.Corners)
            if (Math.abs(Corner[0] - RoofBarLayout.CentreX) < 0.35 * RoofBarLayout.Length && Math.abs(Corner[1]) < 0.5 * RoofBarLayout.Width * 4)
                Top = Math.max(Top, Corner[2]);
    return Number.isFinite(Top) ? Top : 1.24;
}

// 📝 The bar: a dark housing on the roof and a lens across its forward face, the light's emitting face.
export function EmitRoofBarFacets(BodyFacets)
{
    const R = RoofBarLayout;
    const Base = ResolveRoofHeight(BodyFacets) - 0.02;
    const Facets = PlaceFacets(EmitBoxFacets(R.Length, R.Width, R.Height, CourseMaterial.RoofBarHousing), [R.CentreX, 0.0, Base]);
    const X = R.CentreX + 0.5 * R.Length + R.LensProud, Y = 0.5 * R.Width - 0.02, Z0 = Base + 0.02, Z1 = Base + R.Height - 0.02;
    EmitQuadFacing(Facets, [X, -Y, Z0], [X, Y, Z0], [X, Y, Z1], [X, -Y, Z1], CourseMaterial.FloodLens, [1.0, 0.0, 0.0]);
    return Facets;
}

// 📐 The roof flood's emitting face, in body coordinates: centre, forward axis (slightly down), up axis, half sizes.
export function ResolveRoofBarLens(BodyFacets)
{
    const R = RoofBarLayout;
    const Base = ResolveRoofHeight(BodyFacets) - 0.02;
    return {
        Position: [R.CentreX + 0.5 * R.Length + R.LensProud, 0.0, Base + 0.5 * R.Height],
        Forward: [1.0, 0.0, -0.05],
        Up: [0.0, 0.0, 1.0],
        Size: [0.5 * R.Length, 0.5 * (R.Height - 0.04)]
    };
}
