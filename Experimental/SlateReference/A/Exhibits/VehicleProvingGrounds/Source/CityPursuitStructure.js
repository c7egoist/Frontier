//============================================================================================================================================
//                                                        CITYPURSUITSTRUCTURE.JS
//============================================================================================================================================
// 🧩 Dedicated "City Pursuit & AI Lab" ("city") level geometry & police pursuit shape library:
//    • 4 Grounded Architectural Downtown Superblocks subdivided by 11 m-wide cross-shaped paved escape alleys + overhead skybridge cover
//    • Sloped Alley Driveway Apron Ramps (visual + C¹ physics surfaces) & ADA Pedestrian Sidewalk Curb Ramps with tactile warning pads
//    • Watertight 2-manifold architectural buildings (glazed lobby canopies + multi-tier recessed glass window bands + penthouses),
//      Police Helicopter (body + rotors), and Police Interceptor Drones
//    • Police Cruiser livery & roof Red/Blue lightbar + PIT push-bumper built directly onto the exact ControlVehicle body
//    • Analytical speed-limit zones (60 km/h City, 40 km/h Alleys, 110 km/h Highway) & road centerline query for fast RL self-training.

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitBoxFacets, EmitQuad } from "./CourseStructure.js";
import { ResolveCoMAuthoredZ } from "./VehicleSpecification.js";
import { EmitConstructionDrumFacets } from "./SignageBuilder.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                          WATERTIGHT 2-MANIFOLD PRIMITIVE HELPERS (GROUNDED Z = BottomZ)
//------------------------------------------------------------------------------------------------------------------------

// 📝 EmitBoxFacets spans X ∈ [-SX/2..+SX/2], Y ∈ [-SY/2..+SY/2], Z ∈ [0..SZ].
//    BottomZ is the exact bottom elevation of the box (NO +0.5*SZ offset — grounded buildings sit at BottomZ = 0.0!).
export function EmitTranslatedBox(CX, CY, BottomZ, SX, SY, SZ, Material)
{
    const Raw = EmitBoxFacets(SX, SY, SZ, Material);
    return Raw.map((F) => ({
        Family:  F.Family,
        Corners: F.Corners.map((P) => [P[0] + CX, P[1] + CY, P[2] + BottomZ])
    }));
}

// 📝 Watertight 6-face sloped trapezoidal prism / ramp block along +X:
//    At X = CX - SX/2 height is H0 (above BottomZ); at X = CX + SX/2 height is H1 (above BottomZ). Both H0, H1 > 0.015 m.
export function EmitSlopedApronBox(CX, CY, BottomZ, SX, SY, H0, H1, Material)
{
    const X0 = CX - 0.5 * SX, X1 = CX + 0.5 * SX;
    const Y0 = CY - 0.5 * SY, Y1 = CY + 0.5 * SY;
    const ZB = BottomZ;
    const Z0 = BottomZ + H0;
    const Z1 = BottomZ + H1;
    const Facets = [];
    // Top sloped quad (+Z outward normal)
    EmitQuad(Facets, [X0, Y0, Z0], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z0], Material);
    // Bottom quad (-Z outward normal)
    EmitQuad(Facets, [X0, Y1, ZB], [X1, Y1, ZB], [X1, Y0, ZB], [X0, Y0, ZB], Material);
    // Front (+X) face
    EmitQuad(Facets, [X1, Y0, ZB], [X1, Y1, ZB], [X1, Y1, Z1], [X1, Y0, Z1], Material);
    // Back (-X) face
    EmitQuad(Facets, [X0, Y1, ZB], [X0, Y0, ZB], [X0, Y0, Z0], [X0, Y1, Z0], Material);
    // Left (+Y) face
    EmitQuad(Facets, [X1, Y1, ZB], [X0, Y1, ZB], [X0, Y1, Z0], [X1, Y1, Z1], Material);
    // Right (-Y) face
    EmitQuad(Facets, [X0, Y0, ZB], [X1, Y0, ZB], [X1, Y0, Z1], [X0, Y0, Z0], Material);
    return Facets;
}

//------------------------------------------------------------------------------------------------------------------------
//                  GROUNDED MULTI-TIER ARCHITECTURAL CITY BUILDINGS (WATERTIGHT 2-MANIFOLD)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Grounded architectural block building with:
//    • Flush Z = 0.0 granite foundation pad + glazed ground-floor storefront core + 4 structural corner piers + illuminated entrance canopies
//    • Multi-tier stepped floors with recessed reflective dark-glass ribbon windows & projecting spandrel sunshades (all disjoint by >= 14 mm)
//    • Crown accent cornice + rooftop mechanical penthouse + HVAC chillers + red aviation warning beacon.
function EmitBlockBuildingFacets(WidthX, DepthY, TierCount, FacadeMat, AccentMat, RoofMat = CourseMaterial.SteelDark)
{
    const Out = [];
    const Gap = 0.016; // 16 mm separation guarantees strict disjoint 2-manifold watertightness

    // ① Grounded Granite Sidewalk Plinth Pad (Z = 0.00 .. 0.22 m)
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.00, WidthX + 0.40, DepthY + 0.40, 0.22, CourseMaterial.Concrete));

    // ② Ground-Floor Glazed Retail / Lobby Core + 4 Structural Corner Piers (Z = 0.236 .. 3.95 m)
    const LobbyZ  = 0.22 + Gap;
    const LobbyH  = 3.72;
    const PierW   = 3.10;
    Out.push(...EmitTranslatedBox(0.0, 0.0, LobbyZ, WidthX - 2.0 * PierW - 0.12, DepthY - 0.48, LobbyH, CourseMaterial.VehicleGlass));

    const PX = 0.5 * (WidthX - PierW);
    const PY = 0.5 * (DepthY - PierW);
    for (const SX of [-1, 1])
    {
        for (const SY of [-1, 1])
            Out.push(...EmitTranslatedBox(SX * PX, SY * PY, LobbyZ, PierW, PierW, LobbyH, CourseMaterial.SteelDark));
    }

    // Projecting Street-Front Entrance Canopies + Warm Illuminated Soffit Strips on +Y and -Y facades
    for (const SY of [-1, 1])
    {
        const CanopyY = SY * (0.5 * DepthY + 0.62);
        Out.push(...EmitTranslatedBox(0.0, CanopyY, 3.32, 8.40, 1.12, 0.26, CourseMaterial.SteelDark));
        Out.push(...EmitTranslatedBox(0.0, CanopyY, 3.08, 7.60, 0.78, 0.16, CourseMaterial.LampWarm));
    }

    // Lobby Upper Stone Fascia Ledge
    let CursorZ = LobbyZ + LobbyH + Gap;
    Out.push(...EmitTranslatedBox(0.0, 0.0, CursorZ, WidthX, DepthY, 0.88, CourseMaterial.SteelDark));
    CursorZ += 0.88 + Gap;

    // ③ Multi-Story Stepped Facade Tiers (Recessed Dark-Glass Window Ribbon + 4 Corner Mullion Columns + Projecting Floor Spandrel)
    const GlassH    = 2.15;
    const SpandrelH = 1.18;
    const ColW      = 2.35;
    for (let Tier = 0; Tier < TierCount; ++Tier)
    {
        // Subtle architectural setback on upper half of tall towers
        const Setback = Tier >= 4 ? 1.40 : 0.0;
        const W = WidthX - Setback;
        const D = DepthY - Setback;

        // Recessed reflective window band core
        Out.push(...EmitTranslatedBox(0.0, 0.0, CursorZ, W - 2.0 * ColW - 0.12, D - 0.60, GlassH, CourseMaterial.VehicleGlass));
        // 4 Structural Facade Corner Columns framing the glass
        const CX = 0.5 * (W - ColW);
        const CY = 0.5 * (D - ColW);
        for (const SX of [-1, 1])
        {
            for (const SY of [-1, 1])
                Out.push(...EmitTranslatedBox(SX * CX, SY * CY, CursorZ, ColW, ColW, GlassH, FacadeMat));
        }
        CursorZ += GlassH + Gap;

        // Projecting Horizontal Floor Spandrel Slab
        Out.push(...EmitTranslatedBox(0.0, 0.0, CursorZ, W + 0.14, D + 0.14, SpandrelH, FacadeMat));
        CursorZ += SpandrelH + Gap;
    }

    // ④ Signature Colored Crown Cornice Band
    const TopSetback = TierCount >= 5 ? 1.40 : 0.0;
    Out.push(...EmitTranslatedBox(0.0, 0.0, CursorZ, WidthX - TopSetback + 0.28, DepthY - TopSetback + 0.28, 0.78, AccentMat));
    CursorZ += 0.78 + Gap;

    // ⑤ Rooftop Parapet Coping + Stepped Mechanical Penthouse + Twin HVAC Chillers + Red Aviation Beacon
    Out.push(...EmitTranslatedBox(0.0, 0.0, CursorZ, (WidthX - TopSetback) * 0.52, (DepthY - TopSetback) * 0.52, 2.10, RoofMat));
    Out.push(...EmitTranslatedBox(-4.8, 3.4, CursorZ, 2.40, 1.80, 1.15, CourseMaterial.Aluminium));
    Out.push(...EmitTranslatedBox( 4.8,-3.4, CursorZ, 2.40, 1.80, 1.15, CourseMaterial.Aluminium));
    CursorZ += 2.10 + Gap;
    Out.push(...EmitTranslatedBox(0.0, 0.0, CursorZ, 0.65, 0.65, 0.55, CourseMaterial.TrafficRed));

    return Out;
}

// 📝 Overhead alley skybridge spanning between adjacent block buildings (provides helicopter LOS cover inside alleys!).
function EmitAlleySkybridgeFacets()
{
    const Out = [];
    // Spans Y across an 11 m alley at Z = 5.45 m .. 7.65 m (plenty of clearance for cars & police drones underneath!)
    Out.push(...EmitTranslatedBox(0.0, 0.0, 5.45, 5.4, 10.6, 0.34, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 5.81, 5.0, 10.6, 1.52, CourseMaterial.VehicleGlass));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 7.35, 5.6, 10.6, 0.32, CourseMaterial.TunnelConcrete));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//             SLOPED ALLEY DRIVEWAY APRON RAMPS, PAVED ALLEYS & PEDESTRIAN SIDEWALK CURB RAMPS
//------------------------------------------------------------------------------------------------------------------------

// 📝 Smooth double-sloped Alley Driveway Apron Ramp bridging across the +0.165 m sidewalk curb between Street & Alley!
//    Local +X runs from Street Asphalt (-2.1 m) -> Sidewalk Curb Crown (0.0 m, Z = 0.175 m) -> Alley Floor (+2.1 m); Y spans 8.2 m lane + pedestrian wings.
export function EmitAlleyDrivewayRampFacets()
{
    const Out = [];
    // Street-side asphalt/concrete ramp up (+X: -2.10 .. -0.01 m, height 0.02 -> 0.175 m)
    Out.push(...EmitSlopedApronBox(-1.055, 0.0, 0.0, 2.09, 8.20, 0.022, 0.175, CourseMaterial.AsphaltPatch));
    // Alley-side ramp down (+X: +0.01 .. +2.10 m, height 0.175 -> 0.022 m)
    Out.push(...EmitSlopedApronBox( 1.055, 0.0, 0.0, 2.09, 8.20, 0.175, 0.022, CourseMaterial.AsphaltPatch));

    // Flared Concrete Curb Cheeks + Pedestrian Walkway Curb-Cuts on Left (+Y) & Right (-Y) so pedestrians walk smoothly across the alley mouth!
    for (const SY of [-1, 1])
    {
        const WingY = SY * 4.85;
        Out.push(...EmitSlopedApronBox(-1.055, WingY, 0.0, 2.09, 1.42, 0.025, 0.175, CourseMaterial.Concrete));
        Out.push(...EmitSlopedApronBox( 1.055, WingY, 0.0, 2.09, 1.42, 0.175, 0.150, CourseMaterial.Concrete));
        // Tactile amber pedestrian warning strip along both edges of the alley crossing
        Out.push(...EmitTranslatedBox(0.0, WingY - SY * 0.42, 0.178, 1.20, 0.48, 0.020, CourseMaterial.BannerAmber));
    }
    return Out;
}

// 📝 Paved Alley Corridor Segment (24 m long along X × 10.6 m wide): dark asphalt center lane + raised +0.15 m pedestrian paving sidewalks
//    on both sides with sloped pedestrian end-ramps so people can walk along every alley too!
export function EmitAlleyPavedCorridorFacets()
{
    const Out = [];
    // Central paved alley asphalt crown strip
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.0, 23.6, 7.80, 0.026, CourseMaterial.AsphaltFine));
    // Left & right raised pedestrian paving walkways + sloped pedestrian end-ramps at both ends!
    for (const SY of [-1, 1])
    {
        const WalkY = SY * 4.65;
        Out.push(...EmitTranslatedBox(0.0, WalkY, 0.0, 19.80, 1.32, 0.150, CourseMaterial.Concrete));
        // Sloped pedestrian walkway ramps at -X and +X ends (0.02 m -> 0.15 m)
        Out.push(...EmitSlopedApronBox(-10.86, WalkY, 0.0, 1.88, 1.32, 0.022, 0.150, CourseMaterial.Concrete));
        Out.push(...EmitSlopedApronBox( 10.86, WalkY, 0.0, 1.88, 1.32, 0.150, 0.022, CourseMaterial.Concrete));
        Out.push(...EmitTranslatedBox(-11.45, WalkY, 0.055, 0.42, 1.18, 0.028, CourseMaterial.BannerAmber));
        Out.push(...EmitTranslatedBox( 11.45, WalkY, 0.055, 0.42, 1.18, 0.028, CourseMaterial.BannerAmber));
    }
    return Out;
}

// 📝 ADA Pedestrian Sidewalk Curb Ramp ("that part that allows people to walk"):
//    Slopes smoothly from street crosswalk asphalt (X = -1.05 m, Z = 0.02 m) up onto the +0.17 m granite sidewalk (X = +1.05 m),
//    complete with flared side cheeks and a high-contrast yellow tactile blister warning pad!
export function EmitPedestrianCurbRampFacets()
{
    const Out = [];
    // Main sloped concrete pedestrian ramp
    Out.push(...EmitSlopedApronBox(0.0, 0.0, 0.0, 2.10, 2.10, 0.020, 0.172, CourseMaterial.Concrete));
    // Flared concrete side wings
    for (const SY of [-1, 1])
        Out.push(...EmitSlopedApronBox(0.18, SY * 1.36, 0.0, 1.74, 0.56, 0.024, 0.172, CourseMaterial.Concrete));
    // Yellow tactile blister warning strip near crosswalk bottom lip
    Out.push(...EmitTranslatedBox(-0.62, 0.0, 0.062, 0.48, 1.92, 0.024, CourseMaterial.BannerAmber));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                      POLICE HELICOPTER & POLICE INTERCEPTOR DRONE 2-MANIFOLD SOLIDS
//------------------------------------------------------------------------------------------------------------------------

export function EmitPoliceHelicopterBodyFacets()
{
    const Out = [];
    // ① Twin tubular landing skids & struts (disjoint by >= 14 mm)
    for (const Side of [-0.78, 0.78])
    {
        Out.push(...EmitTranslatedBox( 0.10, Side,        0.00, 3.20, 0.10, 0.10, CourseMaterial.SteelDark));
        Out.push(...EmitTranslatedBox( 0.85, Side * 0.82, 0.12, 0.12, 0.10, 0.44, CourseMaterial.SteelDark));
        Out.push(...EmitTranslatedBox(-0.75, Side * 0.82, 0.12, 0.12, 0.10, 0.44, CourseMaterial.SteelDark));
    }
    // ② Law-enforcement white-and-midnight fuselage cabin + glazed nose cockpit
    Out.push(...EmitTranslatedBox( 0.15, 0.0, 0.58, 3.30, 1.48, 1.18, CourseMaterial.PaintWhite));
    Out.push(...EmitTranslatedBox( 1.98, 0.0, 0.72, 0.78, 1.24, 0.82, CourseMaterial.VehicleGlass));
    Out.push(...EmitTranslatedBox( 0.10, 0.0, 1.78, 1.85, 0.92, 0.36, CourseMaterial.WallCobalt));
    // ③ Under-nose high-intensity gimbal searchlight pod + red/blue belly beacons
    Out.push(...EmitTranslatedBox( 1.95, 0.0,   0.26, 0.38, 0.34, 0.28, CourseMaterial.Headlight));
    Out.push(...EmitTranslatedBox(-0.45,  0.52, 0.44, 0.30, 0.18, 0.10, CourseMaterial.TrafficRed));
    Out.push(...EmitTranslatedBox(-0.45, -0.52, 0.44, 0.30, 0.18, 0.10, CourseMaterial.DerezGlow));
    // ④ Tail boom & swept vertical stabilizer fin
    Out.push(...EmitTranslatedBox(-2.85, 0.0, 1.14, 2.62, 0.38, 0.38, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-4.18, 0.0, 1.10, 0.56, 0.14, 1.28, CourseMaterial.PaintWhite));
    return Out;
}

export function EmitPoliceHelicopterMainRotorFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.00, 0.36, 0.36, 0.18, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.20, 7.60, 0.26, 0.05, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.27, 0.26, 7.60, 0.05, CourseMaterial.PaintWhite));
    return Out;
}

export function EmitPoliceHelicopterTailRotorFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0,  -0.68, 1.36, 0.06, 0.16, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.0, 0.08, -0.68, 0.16, 0.06, 1.36, CourseMaterial.KerbRed));
    return Out;
}

export function EmitPoliceInterceptorDroneFacets()
{
    const Out = [];
    // Armored tactical quad-interceptor chassis + gimbal sensor eye + red/blue pursuit strobes + 4 rotor shrouds
    Out.push(...EmitTranslatedBox(0.0,  0.0,  0.08, 0.84, 0.60, 0.22, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.18,  0.18, 0.32, 0.28, 0.16, 0.08, CourseMaterial.TrafficRed));
    Out.push(...EmitTranslatedBox(0.18, -0.18, 0.32, 0.28, 0.16, 0.08, CourseMaterial.DerezGlow));
    Out.push(...EmitTranslatedBox(0.46,  0.0,  0.12, 0.14, 0.24, 0.14, CourseMaterial.Headlight));
    for (const [DX, DY] of [[0.50, 0.48], [0.50, -0.48], [-0.50, 0.48], [-0.50, -0.48]])
        Out.push(...EmitTranslatedBox(DX, DY, 0.14, 0.38, 0.38, 0.08, CourseMaterial.PaintWhite));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                      POLICE CRUISER LIVERY & LIGHTBAR ON EXACT CONTROLVEHICLE BODY
//------------------------------------------------------------------------------------------------------------------------

export function ConstructPoliceVehicleBodyFacets(ProjectedBodyFacets)
{
    const CoMZ = ResolveCoMAuthoredZ();
    // Classic Black-and-White Interceptor Livery: white doors & roof, midnight-black front/rear fenders & hood!
    const LiveryBody = ProjectedBodyFacets.map((Facet) =>
    {
        if (Facet.Family !== CourseMaterial.BodyCoat)
            return Facet;
        const AvgX = (Facet.Corners[0][0] + Facet.Corners[1][0] + Facet.Corners[2][0]) / 3.0;
        const AvgZ = (Facet.Corners[0][2] + Facet.Corners[1][2] + Facet.Corners[2][2]) / 3.0;
        const IsWhiteDoorOrRoof = (AvgX > -0.78 && AvgX < 0.72) || (AvgZ > (1.28 - CoMZ));
        return {
            ...Facet,
            Family: IsWhiteDoorOrRoof ? CourseMaterial.PaintWhite : CourseMaterial.SteelDark
        };
    });

    const RoofZ = 1.56 - CoMZ;
    // Roof Lightbar Bridge: center steel mount + Left Crimson Red strobe pod + Right Electric Cyan-Blue strobe pod!
    LiveryBody.push(...EmitTranslatedBox(-0.12,  0.00, RoofZ - 0.02, 0.26, 0.26, 0.07, CourseMaterial.SteelDark));
    LiveryBody.push(...EmitTranslatedBox(-0.12,  0.34, RoofZ + 0.06, 0.24, 0.42, 0.09, CourseMaterial.TrafficRed));
    LiveryBody.push(...EmitTranslatedBox(-0.12, -0.34, RoofZ + 0.06, 0.24, 0.42, 0.09, CourseMaterial.DerezGlow));
    // Front Steel PIT Push-Bumper Bar
    const BumperZ = 0.44 - CoMZ;
    LiveryBody.push(...EmitTranslatedBox( 2.34,  0.00, BumperZ,        0.10, 0.96, 0.10, CourseMaterial.SteelDark));
    LiveryBody.push(...EmitTranslatedBox( 2.34,  0.34, BumperZ - 0.16, 0.12, 0.08, 0.42, CourseMaterial.SteelDark));
    LiveryBody.push(...EmitTranslatedBox( 2.34, -0.34, BumperZ - 0.16, 0.12, 0.08, 0.42, CourseMaterial.SteelDark));

    return LiveryBody;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  CITY PURSUIT SHAPE CATALOG & ANALYTICAL ZONES
//------------------------------------------------------------------------------------------------------------------------

export const PolicePursuitShapes = Object.freeze({
    PoliceHelicopterBody:      { Emit: EmitPoliceHelicopterBodyFacets,      Voxel: 0.0, Cards: 0, Distance: false },
    PoliceHelicopterMainRotor: { Emit: EmitPoliceHelicopterMainRotorFacets, Voxel: 0.0, Cards: 0, Distance: false },
    PoliceHelicopterTailRotor: { Emit: EmitPoliceHelicopterTailRotorFacets, Voxel: 0.0, Cards: 0, Distance: false },
    PoliceInterceptorDrone:    { Emit: EmitPoliceInterceptorDroneFacets,    Voxel: 0.0, Cards: 0, Distance: false }
});

export const CityPursuitShapes = Object.freeze({
    CityBlockLow:            { Emit: () => EmitBlockBuildingFacets(31.0, 25.0, 3, CourseMaterial.Concrete,       CourseMaterial.BannerTeal),  Voxel: 0.35, Cards: 4 },
    CityBlockMid:            { Emit: () => EmitBlockBuildingFacets(31.0, 25.0, 4, CourseMaterial.PaintWhite,     CourseMaterial.WallCobalt),  Voxel: 0.35, Cards: 4 },
    CityBlockTall:           { Emit: () => EmitBlockBuildingFacets(31.0, 25.0, 5, CourseMaterial.TunnelConcrete, CourseMaterial.BannerAmber), Voxel: 0.40, Cards: 4 },
    CityBlockTower:          { Emit: () => EmitBlockBuildingFacets(31.0, 25.0, 6, CourseMaterial.PaintWhite,     CourseMaterial.KerbRed),     Voxel: 0.42, Cards: 4 },
    CityAlleySkybridge:      { Emit: EmitAlleySkybridgeFacets,      Voxel: 0.25, Cards: 4 },
    CityAlleyDrivewayRamp:   { Emit: EmitAlleyDrivewayRampFacets,   Voxel: 0.0,  Cards: 0, Distance: false },
    CityAlleyPavedCorridor:  { Emit: EmitAlleyPavedCorridorFacets,  Voxel: 0.0,  Cards: 0, Distance: false },
    CityPedestrianCurbRamp:  { Emit: EmitPedestrianCurbRampFacets,  Voxel: 0.0,  Cards: 0, Distance: false },
    ConstructionDrum:        { Emit: EmitConstructionDrumFacets,    Voxel: 0.06, Cards: 6 }
});

//------------------------------------------------------------------------------------------------------------------------
//                           ANALYTICAL HELICOPTER LOS OCCLUSION & CITY SPEED LIMITS
//------------------------------------------------------------------------------------------------------------------------

const AlleyCorridors = [
    // East-West covered alleys through NW, NE, SW, SE superblocks
    { MinX: -138.0, MaxX: -67.0, MinY:  41.5, MaxY:  52.5 },
    { MinX:  -43.0, MaxX:  28.0, MinY:  41.5, MaxY:  52.5 },
    { MinX: -138.0, MaxX: -67.0, MinY: -52.5, MaxY: -41.5 },
    { MinX:  -43.0, MaxX:  28.0, MinY: -52.5, MaxY: -41.5 },
    // North-South narrow alleys
    { MinX: -108.0, MaxX: -97.0, MinY:   9.0, MaxY:  84.0 },
    { MinX:  -13.0, MaxX:  -2.0, MinY:   9.0, MaxY:  84.0 },
    { MinX: -108.0, MaxX: -97.0, MinY: -84.0, MaxY:  -9.0 },
    { MinX:  -13.0, MaxX:  -2.0, MinY: -84.0, MaxY:  -9.0 },
    // Under the +6.4 m Highway Viaduct on Central Avenue
    { MinX:   94.0, MaxX: 116.0, MinY: -18.0, MaxY:  18.0, MaxZ: 4.5 }
];

export function IsPointOccludedFromHelicopter(Position)
{
    const [X, Y, Z] = Position;
    for (const A of AlleyCorridors)
    {
        if (X >= A.MinX && X <= A.MaxX && Y >= A.MinY && Y <= A.MaxY && Z <= (A.MaxZ ?? 5.2))
            return true;
    }
    return false;
}

export function QueryCitySpeedLimitKmh(Position)
{
    const [X, Y, Z] = Position;
    if (Z > 2.2 || X > 68.0)
        return 110;
    if (IsPointOccludedFromHelicopter(Position))
        return 40;
    return 60;
}

const CityRoadSegments = [
    [-150.0,  90.0,   40.0,  90.0],
    [-150.0,   0.0,  165.0,   0.0],
    [-150.0, -90.0,   40.0, -90.0],
    [-150.0, -90.0, -150.0,  90.0],
    [ -55.0, -90.0,  -55.0,  90.0],
    [  40.0, -90.0,   40.0,  90.0],
    [-142.0,  47.0,   32.0,  47.0],
    [-142.0, -47.0,   32.0, -47.0],
    [-102.5, -82.0, -102.5,  82.0],
    [  -7.5, -82.0,   -7.5,  82.0],
    [ 105.0,-136.0,  105.0, 136.0],
    [  40.0,  90.0,  105.0, 136.0],
    [  40.0, -90.0,  105.0,-136.0],
    [ 105.0, 136.0,  165.0,   0.0],
    [ 165.0,   0.0,  105.0,-136.0]
];

export function QueryNearestCityRoadFrame(X, Y)
{
    let BestDistSq = Infinity;
    let BestTangent = [1.0, 0.0];
    let BestLat = 0.0;
    for (const [AX, AY, BX, BY] of CityRoadSegments)
    {
        const DX = BX - AX, DY = BY - AY;
        const LenSq = DX * DX + DY * DY;
        const T = Math.max(0.0, Math.min(1.0, ((X - AX) * DX + (Y - AY) * DY) / LenSq));
        const PX = AX + DX * T, PY = AY + DY * T;
        const EX = X - PX, EY = Y - PY;
        const D2 = EX * EX + EY * EY;
        if (D2 < BestDistSq)
        {
            BestDistSq = D2;
            const L = Math.hypot(DX, DY) || 1.0;
            BestTangent = [DX / L, DY / L];
            BestLat = (-BestTangent[1]) * EX + BestTangent[0] * EY;
        }
    }
    return {
        Distance:      Math.sqrt(BestDistSq),
        LateralOffset: BestLat,
        Tangent:       BestTangent
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                    SMOOTH C¹ ALLEY DRIVEWAY APRON PHYSICS SURFACES (ZERO CURB SNAG!)
//------------------------------------------------------------------------------------------------------------------------

const AlleyDrivewaySpecs = [
    // N-S Alley mouths (X = -102.5 and X = -7.5) crossing North Blvd (Y = +85.5), Central Ave (Y = ±8.4), South Blvd (Y = -85.5)
    ...[-102.5, -7.5].flatMap((AX) => [
        { CX: AX, CY:  85.5, Axis: "Y", HalfRun: 2.3, HalfWidth: 4.8, PeakZ: 0.176 },
        { CX: AX, CY:   8.4, Axis: "Y", HalfRun: 2.4, HalfWidth: 4.8, PeakZ: 0.176 },
        { CX: AX, CY:  -8.4, Axis: "Y", HalfRun: 2.4, HalfWidth: 4.8, PeakZ: 0.176 },
        { CX: AX, CY: -85.5, Axis: "Y", HalfRun: 2.3, HalfWidth: 4.8, PeakZ: 0.176 }
    ]),
    // E-W Alley mouths (Y = +47.0 and Y = -47.0) crossing West Ave (X = -145.5), Midtown St (X = -59.5, -50.5), Frontage Rd (X = +35.5)
    ...[47.0, -47.0].flatMap((AY) => [
        { CX: -145.5, CY: AY, Axis: "X", HalfRun: 2.3, HalfWidth: 4.8, PeakZ: 0.176 },
        { CX:  -59.5, CY: AY, Axis: "X", HalfRun: 2.3, HalfWidth: 4.8, PeakZ: 0.176 },
        { CX:  -50.5, CY: AY, Axis: "X", HalfRun: 2.3, HalfWidth: 4.8, PeakZ: 0.176 },
        { CX:   35.5, CY: AY, Axis: "X", HalfRun: 2.3, HalfWidth: 4.8, PeakZ: 0.176 }
    ])
];

function CreateSmoothApronSurface(Spec, Index)
{
    const AlongX = Spec.Axis === "X";
    const HX = AlongX ? Spec.HalfRun : Spec.HalfWidth;
    const HY = AlongX ? Spec.HalfWidth : Spec.HalfRun;
    const MinX = Spec.CX - HX, MaxX = Spec.CX + HX;
    const MinY = Spec.CY - HY, MaxY = Spec.CY + HY;

    return {
        Key:          `city_alley_ramp_${Index}`,
        Category:     SurfaceCategory.SplineRoad,
        Origin:       [0.0, 0.0, 0.0],
        CosineYaw:    1.0,
        SineYaw:      0.0,
        Yaw:          0.0,
        Friction:     1.04,
        WorldMinimum: [MinX, MinY, -0.10],
        WorldMaximum: [MaxX, MaxY, Spec.PeakZ + 0.30],
        Bounds:       { Minimum: [MinX, MinY, -0.10], Maximum: [MaxX, MaxY, Spec.PeakZ + 0.30] },
        CastRay(RayOrigin, RayDir, MaxTravel)
        {
            if (Math.abs(RayDir[2]) < 1.0e-5)
                return null;
            const MidX = RayOrigin[0] + RayDir[0] * 0.5 * MaxTravel;
            const MidY = RayOrigin[1] + RayDir[1] * 0.5 * MaxTravel;
            if (MidX < MinX - 0.5 || MidX > MaxX + 0.5 || MidY < MinY - 0.5 || MidY > MaxY + 0.5)
                return null;

            const U = AlongX ? ((MidX - Spec.CX) / Spec.HalfRun) : ((MidY - Spec.CY) / Spec.HalfRun);
            const V = AlongX ? ((MidY - Spec.CY) / Spec.HalfWidth) : ((MidX - Spec.CX) / Spec.HalfWidth);
            if (Math.abs(U) > 1.0 || Math.abs(V) > 1.0)
                return null;

            // Smooth C¹ raised-cosine apron: 0 at street & alley ends, PeakZ right over sidewalk curb!
            const Height = 0.015 + 0.5 * Spec.PeakZ * (1.0 + Math.cos(Math.PI * U));
            const T = (Height - RayOrigin[2]) / RayDir[2];
            if (T < 0.0 || T > MaxTravel)
                return null;

            const Slope = -0.5 * Spec.PeakZ * (Math.PI / Spec.HalfRun) * Math.sin(Math.PI * U);
            const NX = AlongX ? -Slope : 0.0;
            const NY = AlongX ? 0.0 : -Slope;
            const NL = Math.hypot(NX, NY, 1.0);
            return {
                Travel:      T,
                LocalPoint:  [RayOrigin[0] + RayDir[0] * T, RayOrigin[1] + RayDir[1] * T, Height],
                LocalNormal: [NX / NL, NY / NL, 1.0 / NL]
            };
        }
    };
}

export function ResolveCitySurfaces()
{
    return AlleyDrivewaySpecs.map((Spec, I) => CreateSmoothApronSurface(Spec, I));
}

//------------------------------------------------------------------------------------------------------------------------
//                           CITY PURSUIT PLACEMENTS, BREAKABLES & SPAWN CONFIGURATION
//------------------------------------------------------------------------------------------------------------------------

export function ResolveCityPlacements()
{
    const Placements = [];
    const Superblocks = [
        { Prefix: "NW Block", CX: -102.5, CY:  47.0, Shapes: ["CityBlockMid",  "CityBlockTall", "CityBlockLow",   "CityBlockTower"] },
        { Prefix: "NE Block", CX:   -7.5, CY:  47.0, Shapes: ["CityBlockTall", "CityBlockLow",  "CityBlockTower", "CityBlockMid"] },
        { Prefix: "SW Block", CX: -102.5, CY: -47.0, Shapes: ["CityBlockLow",  "CityBlockMid",  "CityBlockTower", "CityBlockTall"] },
        { Prefix: "SE Block", CX:   -7.5, CY: -47.0, Shapes: ["CityBlockTower","CityBlockTall", "CityBlockMid",   "CityBlockLow"] }
    ];

    // 4 quadrant buildings per superblock leaving an 11 m-wide N-S alley & 11 m-wide E-W alley right through the middle!
    const QuadOffsets = [[-21.5, 18.5], [21.5, 18.5], [-21.5, -18.5], [21.5, -18.5]];
    for (const Block of Superblocks)
    {
        for (let Q = 0; Q < 4; ++Q)
        {
            const [OX, OY] = QuadOffsets[Q];
            Placements.push({
                Name:     `${Block.Prefix} Building ${Q + 1}`,
                Shape:    Block.Shapes[Q],
                Position: [Block.CX + OX, Block.CY + OY, 0.0],
                Yaw:      0.0,
                Collider: true
            });
        }

        // Paved Alley Corridors + Raised Pedestrian Alley Walkways & End-Ramps inside each 4-arm Superblock Alley!
        for (const OX of [-22.0, 22.0])
        {
            Placements.push({
                Name:     `${Block.Prefix} E-W Alley Pavement ${OX < 0 ? "West" : "East"}`,
                Shape:    "CityAlleyPavedCorridor",
                Position: [Block.CX + OX, Block.CY, 0.0],
                Yaw:      0.0,
                Collider: false
            });
        }
        for (const OY of [-20.0, 20.0])
        {
            Placements.push({
                Name:     `${Block.Prefix} N-S Alley Pavement ${OY < 0 ? "South" : "North"}`,
                Shape:    "CityAlleyPavedCorridor",
                Position: [Block.CX, Block.CY + OY, 0.0],
                Yaw:      Math.PI * 0.5,
                Collider: false
            });
        }

        // Overhead alley skybridges across the East-West alley (creates true covered alley chases!)
        Placements.push({
            Name:     `${Block.Prefix} West Alley Skybridge`,
            Shape:    "CityAlleySkybridge",
            Position: [Block.CX - 21.5, Block.CY, 0.0],
            Yaw:      0.0,
            Collider: false
        });
        Placements.push({
            Name:     `${Block.Prefix} East Alley Skybridge`,
            Shape:    "CityAlleySkybridge",
            Position: [Block.CX + 21.5, Block.CY, 0.0],
            Yaw:      0.0,
            Collider: false
        });
    }

    // 16 Sloped Alley Driveway Apron Ramps bridging smoothly over the street sidewalk curbs into every alley mouth!
    AlleyDrivewaySpecs.forEach((Spec, Idx) =>
    {
        Placements.push({
            Name:     `Alley Driveway Ramp ${Idx + 1}`,
            Shape:    "CityAlleyDrivewayRamp",
            Position: [Spec.CX, Spec.CY, 0.0],
            Yaw:      Spec.Axis === "X" ? 0.0 : Math.PI * 0.5,
            Collider: false
        });
    });

    // ADA Pedestrian Sidewalk Curb Ramps ("that part that allows people to walk") at all 9 Downtown Intersections!
    const GridXs = [-150.0, -55.0, 40.0];
    const GridYs = [  90.0,   0.0,-90.0];
    let CurbIdx = 1;
    for (const IX of GridXs)
    {
        for (const IY of GridYs)
        {
            const HalfY = (IY === 0.0) ? 8.4 : 4.5;
            const HalfX = 4.5;
            for (const SX of [-1, 1])
            {
                for (const SY of [-1, 1])
                {
                    // Crosswalk ramp facing across N-S street (sloping along X)
                    Placements.push({
                        Name:     `Pedestrian Curb Ramp ${CurbIdx++}`,
                        Shape:    "CityPedestrianCurbRamp",
                        Position: [IX + SX * (HalfX + 0.35), IY + SY * (HalfY + 2.2), 0.0],
                        Yaw:      SX > 0 ? 0.0 : Math.PI,
                        Collider: false
                    });
                    // Crosswalk ramp facing across E-W street (sloping along Y)
                    Placements.push({
                        Name:     `Pedestrian Curb Ramp ${CurbIdx++}`,
                        Shape:    "CityPedestrianCurbRamp",
                        Position: [IX + SX * (HalfX + 2.2), IY + SY * (HalfY + 0.35), 0.0],
                        Yaw:      SY > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
                        Collider: false
                    });
                }
            }
        }
    }

    // Grounded Perimeter Skyline Towers outside the West, North & South avenues
    const Skyline = [
        [-192.0,  64.0, "CityBlockTower"],
        [-192.0,   0.0, "CityBlockTall"],
        [-192.0, -64.0, "CityBlockMid"],
        [-102.5, 128.0, "CityBlockMid"],
        [  -7.5, 128.0, "CityBlockTall"],
        [-102.5,-128.0, "CityBlockTall"],
        [  -7.5,-128.0, "CityBlockLow"]
    ];
    Skyline.forEach(([X, Y, Shape], Idx) =>
    {
        Placements.push({
            Name:     `Skyline Tower ${Idx + 1}`,
            Shape,
            Position: [X, Y, 0.0],
            Yaw:      0.0,
            Collider: true
        });
    });

    return Placements;
}

export function ResolveCityCones()
{
    const Cones = [];
    const Spots = [
        [-118.0,  47.0], [ -86.0,  45.5], [ -24.0,  48.2], [  10.0,  46.0],
        [-118.0, -47.0], [ -86.0, -45.5], [ -24.0, -48.2], [  10.0, -46.0],
        [-102.5,  28.0], [-102.5, -28.0], [  -7.5,  28.0], [  -7.5, -28.0]
    ];
    Spots.forEach(([X, Y], I) =>
    {
        Cones.push({
            Name:     `Alley Drum ${I + 1}`,
            Group:    "lone",
            Shape:    (I & 1) === 0 ? "ConstructionDrum" : "Cone",
            Position: [X, Y, 0.04],
            Yaw:      I * 0.7
        });
    });
    return Cones;
}

export function ResolveCityBreakables()
{
    const Crates = [
        { Name: "NW Alley Crate", Pos: [-94.0,  48.2] },
        { Name: "NE Alley Crate", Pos: [  2.0,  45.8] },
        { Name: "SW Alley Crate", Pos: [-94.0, -48.2] },
        { Name: "SE Alley Crate", Pos: [  2.0, -45.8] }
    ];
    return Crates.map((C, I) => ({
        Name:     C.Name,
        Material: "wood",
        Mode:     "baked",
        Shape:    { Kind: "box", Extent: [1.25, 1.25, 1.15] },
        Position: [C.Pos[0], C.Pos[1], 0.03],
        Yaw:      0.22 * (I + 1),
        Approach: [1.0, 0.0, 0.0],
        Capacity: 10,
        Energy:   4200,
        Seed:     9101 + I * 37
    }));
}

export function ResolveCityTrafficLights()
{
    return [
        { Id: "tl_city_cw", Name: "West & Central Signal",      Anchor: [-150.0,   0.0, 4.55], Yaw: 0.0,            PhaseOffset: 0.0 },
        { Id: "tl_city_cm", Name: "Midtown Central Plaza",      Anchor: [ -55.0,   0.0, 4.55], Yaw: 0.0,            PhaseOffset: 3.8 },
        { Id: "tl_city_ce", Name: "Frontage & Central Signal",  Anchor: [  40.0,   0.0, 4.55], Yaw: 0.0,            PhaseOffset: 7.4 },
        { Id: "tl_city_nm", Name: "Midtown & North Blvd",       Anchor: [ -55.0,  90.0, 4.55], Yaw: Math.PI * 0.5,  PhaseOffset: 2.2 },
        { Id: "tl_city_sm", Name: "Midtown & South Blvd",       Anchor: [ -55.0, -90.0, 4.55], Yaw: Math.PI * 0.5,  PhaseOffset: 5.9 },
        { Id: "tl_city_ne", Name: "Frontage & North Ramp",      Anchor: [  40.0,  90.0, 4.55], Yaw: 0.0,            PhaseOffset: 9.1 }
    ];
}

export function EmitCityGroundFacets()
{
    const Extent = 900.0;
    const Inner  = 240.0;
    const Facets = [];
    const Quad = (X0, Y0, X1, Y1, Z, Family) =>
    {
        Facets.push(
            { Family, Corners: [[X0, Y0, Z], [X1, Y0, Z], [X1, Y1, Z]] },
            { Family, Corners: [[X0, Y0, Z], [X1, Y1, Z], [X0, Y1, Z]] }
        );
    };
    Quad(-Inner, -Inner, Inner, Inner, 0.0, CourseMaterial.AsphaltPatch);
    Quad(-Extent, -Extent, -Inner,  Extent, 0.0, CourseMaterial.Grass);
    Quad( Inner,  -Extent,  Extent, Extent, 0.0, CourseMaterial.Grass);
    Quad(-Inner,  -Extent,  Inner, -Inner,  0.0, CourseMaterial.Grass);
    Quad(-Inner,   Inner,   Inner,  Extent, 0.0, CourseMaterial.Grass);
    return Facets;
}

export const CityPursuitSpawn = Object.freeze({
    Position: [-122.0, 0.0, 0.63],
    Yaw:      0.0
});

export const CityPursuitZones = Object.freeze([
    { Name: "Central Ave · Downtown",   Position: [-122.0,   0.0], Yaw:   0.0, Note: "60 km/h boulevard & patrol" },
    { Name: "NW Covered Escape Alley",  Position: [-132.0,  47.0], Yaw:   0.0, Note: "40 km/h skybridge LOS cover" },
    { Name: "Highway North Ramp",       Position: [  52.0,  96.0], Yaw:  35.0, Note: "Merge to +6.4 m overpass" },
    { Name: "Elevated Highway Viaduct", Position: [ 105.0,  38.0], Yaw: -90.0, Note: "110 km/h steel bridge span" },
    { Name: "East Beltway Clover",      Position: [ 162.0,  12.0], Yaw: -95.0, Note: "High-speed pursuit loop" },
    { Name: "SE Alley Ambush",          Position: [ -38.0, -47.0], Yaw:   0.0, Note: "Driveway ramp & crate alley" }
]);

export const CityClearZones = Object.freeze([
    [-60.0, -14.0,  60.0,  14.0],
    [-60.0, -60.0, -42.0,  60.0],
    [ 27.0, -60.0,  53.0,  60.0],
    [-60.0,  40.0,  60.0,  54.0],
    [-60.0, -54.0,  60.0, -40.0],
    [-14.0, -60.0,   0.0,  60.0]
]);
