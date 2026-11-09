//============================================================================================================================================
//                                                          DDAYSTRUCTURE.JS
//============================================================================================================================================
// ⚔️ Dedicated "D-Day: Race to The Wall" ("dday") militarized gauntlet level geometry & combat unit shape library:
//    • 400-meter Beachhead-to-Fortress Gauntlet (X = -205 m Landing Craft -> X = +192 m THE WALL Breach Gate)
//    • Grounded 100% watertight 2-manifold fortifications: Reinforced Concrete Casemate Bunkers, Czech Hedgehogs,
//      Dragon's Teeth, Sandbag Chicanes, Steel Landing Craft (LCVP), Bailey Engineer Assault Ramps, and THE WALL + Bastions
//    • Dynamic Combat Unit Shapes: Armored Assault Tanks (Hull + Rotating Turret), Rotating Machine Gun Turrets,
//      Heavy Fortress Artillery Cannons, Attack Aircraft (Fuselage + Propeller), Aerial Bombs, Artillery Shells,
//      Landmines, Tracer Bolts, and Expanding 3D Explosion Fireballs.

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitTranslatedBox, EmitSlopedApronBox } from "./CityPursuitStructure.js";
import { EmitConstructionDrumFacets } from "./SignageBuilder.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                      FORTIFICATIONS, BARRICADES & THE WALL (WATERTIGHT 2-MANIFOLD SOLIDS)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Reinforced Concrete Casemate Pillbox Bunker (grounded at Z = 0.0):
//    Sloped concrete base apron + armored casemate walls framing a dark horizontal firing embrasure + overhanging blast visor + cupola.
export function EmitDDayBunkerFacets()
{
    const Out = [];
    const G = 0.018;
    // ① Grounded concrete foundation slab (Z = 0.00 .. 0.34 m)
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.00, 8.60, 7.60, 0.34, CourseMaterial.TunnelConcrete));
    // ② Lower armored glacis wall (front sloped apron + main lower block, Z = 0.358 .. 1.58 m)
    Out.push(...EmitTranslatedBox(-0.25, 0.0, 0.34 + G, 7.50, 6.80, 1.22, CourseMaterial.Concrete));
    Out.push(...EmitSlopedApronBox(3.92, 0.0, 0.34 + G, 0.80, 6.60, 1.22, 0.42, CourseMaterial.TunnelConcrete));

    // ③ Embrasure Firing Layer (Z = 1.60 .. 2.28 m): dark recessed firing chamber + Left/Right/Rear thick concrete cheeks!
    const EmbZ = 1.58 + G;
    const EmbH = 0.68;
    Out.push(...EmitTranslatedBox(-0.95,  0.00, EmbZ, 5.40, 4.20, EmbH, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 2.25,  2.45, EmbZ, 2.20, 1.85, EmbH, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox( 2.25, -2.45, EmbZ, 2.20, 1.85, EmbH, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox(-2.90,  0.00, EmbZ, 1.50, 6.70, EmbH, CourseMaterial.Concrete));

    // ④ Heavy Overhanging Blast-Visor Roof Slab (Z = 2.30 .. 3.22 m)
    const RoofZ = EmbZ + EmbH + G;
    Out.push(...EmitTranslatedBox(0.15, 0.0, RoofZ, 8.20, 7.20, 0.92, CourseMaterial.TunnelConcrete));
    // ⑤ Armored Turret Ring Pedestal + Rear Blast Door Frame
    Out.push(...EmitTranslatedBox( 0.20, 0.0, RoofZ + 0.92 + G, 3.10, 3.10, 0.36, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-4.12, 0.0, 0.36, 0.24, 1.65, 1.95, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Anti-Tank Steel "Czech Hedgehog" Obstacle (3 orthogonal structural steel I-beams + center gusset box, grounded Z = 0.0)
export function EmitCzechHedgehogFacets()
{
    const Out = [];
    // Grounded steel foot pads + 3 crossed structural steel members (disjoint by >= 16 mm for strict 2-manifold integrity!)
    Out.push(...EmitTranslatedBox( 0.00,  0.00, 0.00, 1.90, 0.26, 0.24, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 0.00,  0.00, 0.26, 0.30, 1.90, 0.24, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 0.00,  0.00, 0.52, 0.38, 0.38, 0.38, CourseMaterial.KerbRed));
    Out.push(...EmitSlopedApronBox(-0.46,  0.00, 0.52, 0.50, 0.24, 0.92, 0.42, CourseMaterial.SteelDark));
    Out.push(...EmitSlopedApronBox( 0.46,  0.00, 0.52, 0.50, 0.24, 0.42, 0.92, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 0.00,  0.58, 0.52, 0.24, 0.72, 0.78, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 0.00, -0.58, 0.52, 0.24, 0.72, 0.78, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Reinforced Concrete Anti-Tank "Dragon's Teeth" Barrier Strip (4 pyramidal teeth on a sunken concrete mat)
export function EmitDragonsTeethFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.00, 2.40, 7.60, 0.20, CourseMaterial.TunnelConcrete));
    for (const Y of [-2.70, -0.90, 0.90, 2.70])
    {
        Out.push(...EmitSlopedApronBox(-0.42, Y, 0.22, 0.80, 1.24, 0.32, 1.18, CourseMaterial.Concrete));
        Out.push(...EmitSlopedApronBox( 0.42, Y, 0.22, 0.80, 1.24, 1.18, 0.38, CourseMaterial.Concrete));
    }
    return Out;
}

// 📝 Stacked Earthen Sandbag & Steel Chevron Combat Barricade
export function EmitSandbagBarricadeFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.00, 1.35, 5.40, 0.42, CourseMaterial.Sand));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.44, 1.12, 4.90, 0.38, CourseMaterial.Dirt));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.84, 0.88, 4.20, 0.34, CourseMaterial.Sand));
    // High-contrast crimson/white steel hazard board on front face
    Out.push(...EmitTranslatedBox(-0.74,  1.20, 0.30, 0.10, 1.80, 0.46, CourseMaterial.KerbRed));
    Out.push(...EmitTranslatedBox(-0.74, -1.20, 0.30, 0.10, 1.80, 0.46, CourseMaterial.PaintWhite));
    return Out;
}

// 📝 Beachhead Steel Landing Craft (LCVP Higgins-Style Assault Craft) behind spawn at X = -208 m!
export function EmitLandingCraftFacets()
{
    const Out = [];
    // Hull floor + lowered steel bow assault ramp + armored port/starboard gunwales + coxswain stern shield
    Out.push(...EmitTranslatedBox(-4.50,  0.00, 0.00, 11.00, 4.60, 0.38, CourseMaterial.SteelDark));
    Out.push(...EmitSlopedApronBox( 2.65,  0.00, 0.00,  3.20, 4.20, 0.38, 0.03, CourseMaterial.Aluminium));
    Out.push(...EmitTranslatedBox(-4.50,  2.52, 0.00, 11.00, 0.38, 2.15, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-4.50, -2.52, 0.00, 11.00, 0.38, 2.15, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-9.80,  0.00, 0.40,  1.80, 4.50, 2.45, CourseMaterial.TunnelConcrete));
    return Out;
}

// 📝 Smooth Double-Sloped Steel Engineer Assault Ramp (launches or bridges craters along the gauntlet!)
export function EmitDDayAssaultRampFacets()
{
    const Out = [];
    // Approach ramp up (-6.0 .. -0.02 m, Z: 0.03 -> 1.15 m), flat deck, descent ramp (+0.02 .. +6.0 m, Z: 1.15 -> 0.03 m)
    Out.push(...EmitSlopedApronBox(-3.02, 0.0, 0.0, 5.96, 6.80, 0.03, 1.15, CourseMaterial.SteelDark));
    Out.push(...EmitSlopedApronBox( 3.02, 0.0, 0.0, 5.96, 6.80, 1.15, 0.03, CourseMaterial.SteelDark));
    for (const SY of [-3.58, 3.58])
    {
        Out.push(...EmitTranslatedBox(0.0, SY, 0.00, 9.60, 0.28, 1.38, CourseMaterial.BannerAmber));
    }
    return Out;
}

// 📝 THE WALL — Massive 14.5 m-Tall Reinforced Concrete Fortress Curtain Segment (44 m wide along Y)
export function EmitTheWallSegmentFacets()
{
    const Out = [];
    const G = 0.02;
    // Grounded sloped concrete glacis toe + 13.5 m main fortress wall + crenellated battlement parapet + crimson banners
    Out.push(...EmitSlopedApronBox(-3.80, 0.0, 0.00, 2.60, 43.80, 0.35, 3.60, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTranslatedBox( 0.00, 0.0, 0.00, 4.80, 43.80, 13.40, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox(-2.10, 0.0, 13.40 + G, 1.20, 43.80, 1.25, CourseMaterial.SteelDark));
    for (const Y of [-15.0, -5.0, 5.0, 15.0])
        Out.push(...EmitTranslatedBox(-2.55, Y, 6.20, 0.28, 2.20, 5.40, CourseMaterial.KerbRed));
    return Out;
}

// 📝 THE WALL — Twin Armored Bastion Tower & Illuminated Victory Breach Gate!
export function EmitTheWallBreachGateFacets()
{
    const Out = [];
    const G = 0.02;
    // Left (+Y = +15.5) & Right (-Y = -15.5) 17.5 m Armored Fortress Bastions framing a 22 m-wide Breach Gateway!
    for (const SY of [-1, 1])
    {
        const BY = SY * 15.8;
        Out.push(...EmitTranslatedBox(0.0, BY, 0.00, 7.60, 9.20, 16.20, CourseMaterial.TunnelConcrete));
        Out.push(...EmitTranslatedBox(-3.95, BY, 0.00, 0.26, 5.20, 14.80, CourseMaterial.SteelDark));
        // Warm searchlight beacon crown atop each bastion
        Out.push(...EmitTranslatedBox(-2.80, BY, 16.20 + G, 2.20, 3.40, 1.10, CourseMaterial.LampWarm));
        // Emerald breach guide pylon at ground level
        Out.push(...EmitTranslatedBox(-3.95, SY * 10.6, 0.00, 0.65, 0.65, 6.80, CourseMaterial.TrafficGreen));
    }
    // High Overhead Arch Lintel spanning Y ∈ [-20..+20] at Z = 9.20 .. 14.40 m (9.2 m vertical clearance!)
    Out.push(...EmitTranslatedBox( 0.00, 0.0,  9.20, 6.80, 22.00, 5.20, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox(-3.55, 0.0,  9.80, 0.24, 18.50, 1.15, CourseMaterial.TrafficGreen));
    // Illuminated Victory Threshold Strip on Ground
    Out.push(...EmitTranslatedBox(-2.00, 0.0,  0.00, 2.40, 20.80, 0.045, CourseMaterial.TrafficGreen));
    return Out;
}

// 📝 Minefield Skull/Hazard Marker Post (warns drivers where mine belts begin!)
export function EmitMinefieldMarkerFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.00, 0.16, 0.16, 1.55, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 1.57, 0.12, 0.92, 0.62, CourseMaterial.KerbRed));
    Out.push(...EmitTranslatedBox(-0.08, 0.0, 1.72, 0.03, 0.56, 0.32, CourseMaterial.PaintWhite));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                      DYNAMIC COMBAT UNIT SOLIDS (TANKS, TURRETS, CANNONS, AIRCRAFT, MINES, BLASTS)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Heavy Assault Tank Hull (6.8 m long × 3.56 m wide × 1.52 m tall — massive solid mobile cover!)
export function EmitDDayTankHullFacets()
{
    const Out = [];
    const G = 0.016;
    // ① Left & Right Heavy Track Pontoons (Z = 0.00 .. 1.08 m)
    for (const SY of [-1.36, 1.36])
    {
        Out.push(...EmitTranslatedBox(0.0, SY, 0.00, 6.50, 0.78, 1.06, CourseMaterial.Rubber));
        Out.push(...EmitTranslatedBox(0.0, SY, 1.06 + G, 6.70, 0.84, 0.18, CourseMaterial.SteelDark));
    }
    // ② Central Armored Lower & Upper Glacis Hull (Olive/Bronze tactical armor + white Allied recognition stripe!)
    Out.push(...EmitTranslatedBox(-0.10, 0.0, 0.36, 5.90, 1.88, 1.12, CourseMaterial.Barrier));
    Out.push(...EmitSlopedApronBox( 3.16, 0.0, 0.44, 0.58, 1.84, 1.02, 0.38, CourseMaterial.Barrier));
    // Front Heavy Steel Mine-Plow / Dozer Shield + Headlights
    Out.push(...EmitSlopedApronBox( 3.56, 0.0, 0.12, 0.18, 3.40, 0.58, 0.18, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 2.88,  0.76, 1.50, 0.22, 0.26, 0.18, CourseMaterial.Headlight));
    Out.push(...EmitTranslatedBox( 2.88, -0.76, 1.50, 0.22, 0.26, 0.18, CourseMaterial.Headlight));
    // Rear Engine Louvers & Twin Fuel Drums + White Recognition Chevron (“COVER ME!”)
    Out.push(...EmitTranslatedBox(-2.20,  0.00, 1.50, 1.45, 1.56, 0.14, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-3.22,  0.65, 0.78, 0.46, 0.92, 0.46, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTranslatedBox(-3.22, -0.65, 0.78, 0.46, 0.92, 0.46, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTranslatedBox(-3.10,  0.00, 1.28, 0.08, 1.40, 0.18, CourseMaterial.TrafficGreen));
    return Out;
}

// 📝 Heavy Assault Tank Rotating Turret + 105mm Main Gun Barrel (attaches at Z = +1.52 m, blows sky-high when tank explodes!)
export function EmitDDayTankTurretFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(-0.15, 0.0, 0.00, 2.75, 2.18, 0.78, CourseMaterial.Barrier));
    Out.push(...EmitTranslatedBox( 1.38, 0.0, 0.14, 0.28, 0.96, 0.52, CourseMaterial.SteelDark));
    // 4.1 m Long 105mm Gun Barrel + Muzzle Brake
    Out.push(...EmitTranslatedBox( 3.42, 0.0, 0.30, 3.74, 0.20, 0.20, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 5.42, 0.0, 0.26, 0.22, 0.34, 0.28, CourseMaterial.PaintWhite));
    // Commander Cupola + White Star / Tactical Stripe
    Out.push(...EmitTranslatedBox(-0.65, 0.48, 0.80, 0.76, 0.76, 0.28, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-0.20, 0.00, 0.80, 0.65, 0.65, 0.04, CourseMaterial.PaintWhite));
    return Out;
}

// 📝 Rotating Twin-Barrel Bunker Machine Gun Turret
export function EmitDDayMgTurretFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.00,  0.00, 0.00, 1.55, 1.48, 0.68, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.84,  0.00, 0.16, 0.12, 0.88, 0.38, CourseMaterial.KerbRed));
    Out.push(...EmitTranslatedBox(1.78,  0.26, 0.28, 1.72, 0.10, 0.10, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(1.78, -0.26, 0.28, 1.72, 0.10, 0.10, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Heavy Fortress 155mm Coastal Artillery Cannon Turret
export function EmitDDayHeavyCannonFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(-0.30, 0.0, 0.00, 3.30, 2.85, 1.32, CourseMaterial.SteelDark));
    Out.push(...EmitSlopedApronBox(1.62, 0.0, 0.10, 0.50, 2.65, 1.18, 0.55, CourseMaterial.TunnelConcrete));
    // Massive 5.8 m Artillery Barrel + Glowing Muzzle Ring
    Out.push(...EmitTranslatedBox( 4.45, 0.0, 0.56, 5.10, 0.38, 0.38, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 7.12, 0.0, 0.50, 0.20, 0.54, 0.50, CourseMaterial.KerbRed));
    return Out;
}

// 📝 Twin-Boom / Swept-Wing Attack Fighter-Bomber Aircraft (9.4 m wingspan × 8.2 m fuselage)
export function EmitDDayAircraftFacets()
{
    const Out = [];
    // Fuselage + bubble canopy + cowling intake
    Out.push(...EmitTranslatedBox(-0.30, 0.0, 0.00, 7.60, 1.18, 1.16, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 0.55, 0.0, 1.18, 2.25, 0.88, 0.56, CourseMaterial.VehicleGlass));
    Out.push(...EmitTranslatedBox( 3.65, 0.0, 0.18, 0.26, 0.92, 0.84, CourseMaterial.KerbRed));
    // Main wings + wingtip invasion stripes & bomb pylons
    Out.push(...EmitTranslatedBox( 0.40,  3.05, 0.36, 2.15, 4.85, 0.18, CourseMaterial.Aluminium));
    Out.push(...EmitTranslatedBox( 0.40, -3.05, 0.36, 2.15, 4.85, 0.18, CourseMaterial.Aluminium));
    Out.push(...EmitTranslatedBox( 0.40,  2.60, 0.56, 2.10, 0.95, 0.03, CourseMaterial.PaintWhite));
    Out.push(...EmitTranslatedBox( 0.40, -2.60, 0.56, 2.10, 0.95, 0.03, CourseMaterial.PaintWhite));
    // Tailplane + Vertical Rudder Fin
    Out.push(...EmitTranslatedBox(-3.75,  0.00, 0.54, 1.15, 3.40, 0.14, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-3.75,  0.00, 0.70, 1.25, 0.18, 1.65, CourseMaterial.KerbRed));
    return Out;
}

export function EmitDDayPropellerFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.14, 0.28, 0.28, 0.28, CourseMaterial.KerbRed));
    Out.push(...EmitTranslatedBox(0.18, 0.0, -0.06, 0.06, 2.75, 0.18, CourseMaterial.PaintWhite));
    Out.push(...EmitTranslatedBox(0.26, 0.0, -1.38, 0.06, 0.18, 2.75, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Armed Anti-Tank Landmine (heavy olive steel disc + glowing crimson pressure fuze!)
export function EmitDDayLandmineFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.00, 1.38, 1.38, 0.18, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.20, 0.88, 0.88, 0.10, CourseMaterial.KerbRed));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 0.32, 0.34, 0.34, 0.09, CourseMaterial.TrafficRed));
    return Out;
}

// 📝 500-lb Aerial Bomb (steel casing + tail fins + crimson nose fuze)
export function EmitDDayAerialBombFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox( 0.00, 0.0, 0.00, 1.65, 0.44, 0.44, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 0.92, 0.0, 0.08, 0.16, 0.28, 0.28, CourseMaterial.TrafficRed));
    Out.push(...EmitTranslatedBox(-0.94, 0.0, -0.10, 0.20, 0.68, 0.64, CourseMaterial.BannerAmber));
    return Out;
}

// 📝 Glowing 155mm Artillery Shell
export function EmitDDayArtilleryShellFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(-0.20, 0.0, 0.00, 1.10, 0.32, 0.32, CourseMaterial.BannerAmber));
    Out.push(...EmitTranslatedBox( 0.48, 0.0, 0.04, 0.22, 0.24, 0.24, CourseMaterial.Headlight));
    return Out;
}

// 📝 High-Velocity Machine Gun Tracer Bolt
export function EmitDDayTracerBoltFacets()
{
    return EmitTranslatedBox(0.0, 0.0, 0.0, 2.20, 0.11, 0.11, CourseMaterial.LampWarm);
}

// 📝 3D Expanding Multi-Core Explosion Fireball (scaled dynamically during blasts!)
export function EmitDDayExplosionFireballFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox( 0.00,  0.00, 0.20, 3.80, 3.80, 3.20, CourseMaterial.BannerAmber));
    Out.push(...EmitTranslatedBox( 0.00,  0.00, 3.44, 2.40, 2.40, 1.65, CourseMaterial.TrafficRed));
    Out.push(...EmitTranslatedBox( 1.94,  0.00, 0.85, 0.95, 2.20, 1.90, CourseMaterial.LampWarm));
    Out.push(...EmitTranslatedBox(-1.94,  0.00, 0.85, 0.95, 2.20, 1.90, CourseMaterial.LampWarm));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  D-DAY SHAPE CATALOGS & ASSAULT RAMP SURFACES
//------------------------------------------------------------------------------------------------------------------------

export const DDayStaticShapes = Object.freeze({
    DDayBunker:           { Emit: EmitDDayBunkerFacets,           Voxel: 0.24, Cards: 4 },
    DDayCzechHedgehog:    { Emit: EmitCzechHedgehogFacets,        Voxel: 0.12, Cards: 4 },
    DDayDragonsTeeth:     { Emit: EmitDragonsTeethFacets,         Voxel: 0.18, Cards: 4 },
    DDaySandbagBarricade: { Emit: EmitSandbagBarricadeFacets,     Voxel: 0.14, Cards: 4 },
    DDayLandingCraft:     { Emit: EmitLandingCraftFacets,         Voxel: 0.25, Cards: 4 },
    DDayAssaultRamp:      { Emit: EmitDDayAssaultRampFacets,      Voxel: 0.0,  Cards: 0, Distance: false },
    DDayWallSegment:      { Emit: EmitTheWallSegmentFacets,       Voxel: 0.40, Cards: 4 },
    DDayWallBreachGate:   { Emit: EmitTheWallBreachGateFacets,    Voxel: 0.35, Cards: 4 },
    DDayMineMarker:       { Emit: EmitMinefieldMarkerFacets,      Voxel: 0.0,  Cards: 0, Distance: false },
    ConstructionDrum:     { Emit: EmitConstructionDrumFacets,     Voxel: 0.06, Cards: 6 }
});

export const DDayCombatShapes = Object.freeze({
    DDayTankHull:          { Emit: EmitDDayTankHullFacets,          Voxel: 0.0, Cards: 0, Distance: false },
    DDayTankTurret:        { Emit: EmitDDayTankTurretFacets,        Voxel: 0.0, Cards: 0, Distance: false },
    DDayMgTurret:          { Emit: EmitDDayMgTurretFacets,          Voxel: 0.0, Cards: 0, Distance: false },
    DDayHeavyCannon:       { Emit: EmitDDayHeavyCannonFacets,       Voxel: 0.0, Cards: 0, Distance: false },
    DDayAircraft:          { Emit: EmitDDayAircraftFacets,          Voxel: 0.0, Cards: 0, Distance: false },
    DDayPropeller:         { Emit: EmitDDayPropellerFacets,         Voxel: 0.0, Cards: 0, Distance: false },
    DDayLandmine:          { Emit: EmitDDayLandmineFacets,          Voxel: 0.0, Cards: 0, Distance: false },
    DDayAerialBomb:        { Emit: EmitDDayAerialBombFacets,        Voxel: 0.0, Cards: 0, Distance: false },
    DDayArtilleryShell:    { Emit: EmitDDayArtilleryShellFacets,    Voxel: 0.0, Cards: 0, Distance: false },
    DDayTracerBolt:        { Emit: EmitDDayTracerBoltFacets,        Voxel: 0.0, Cards: 0, Distance: false },
    DDayExplosionFireball: { Emit: EmitDDayExplosionFireballFacets, Voxel: 0.0, Cards: 0, Distance: false }
});

//------------------------------------------------------------------------------------------------------------------------
//                           FIXED EMPLACEMENT COORDINATES & ASSAULT RAMP PHYSICS SURFACES
//------------------------------------------------------------------------------------------------------------------------

export const DDayWallGoalX = 188.0;

export const DDayBunkerSites = Object.freeze([
    { Pos: [ -95.0, -28.0, 0.0], Yaw:  Math.PI - 0.24, HasMg: true,  HasCannon: false },
    { Pos: [ -95.0,  28.0, 0.0], Yaw: -Math.PI + 0.24, HasMg: true,  HasCannon: false },
    { Pos: [ -18.0, -30.0, 0.0], Yaw:  Math.PI - 0.20, HasMg: true,  HasCannon: false },
    { Pos: [ -18.0,  30.0, 0.0], Yaw: -Math.PI + 0.20, HasMg: true,  HasCannon: false },
    { Pos: [  66.0, -27.0, 0.0], Yaw:  Math.PI - 0.22, HasMg: true,  HasCannon: false },
    { Pos: [  66.0,  27.0, 0.0], Yaw: -Math.PI + 0.22, HasMg: true,  HasCannon: false },
    { Pos: [  66.0, -44.0, 0.0], Yaw:  Math.PI - 0.30, HasMg: false, HasCannon: true  },
    { Pos: [  66.0,  44.0, 0.0], Yaw: -Math.PI + 0.30, HasMg: false, HasCannon: true  },
    { Pos: [ 138.0, -31.0, 0.0], Yaw:  Math.PI - 0.22, HasMg: false, HasCannon: true  },
    { Pos: [ 138.0,  31.0, 0.0], Yaw: -Math.PI + 0.22, HasMg: false, HasCannon: true  }
]);

// 6 Heavy Cannons total: 4 atop Heavy Casemate Bunkers + 2 mounted high on The Wall flanks!
export const DDayCannonMounts = Object.freeze([
    [ 66.2, -44.0, 3.62],
    [ 66.2,  44.0, 3.62],
    [138.2, -31.0, 3.62],
    [138.2,  31.0, 3.62],
    [194.0, -28.0, 13.45],
    [194.0,  28.0, 13.45]
]);

export const DDayMgMounts = Object.freeze([
    [-94.8, -28.0, 3.62],
    [-94.8,  28.0, 3.62],
    [-17.8, -30.0, 3.62],
    [-17.8,  30.0, 3.62],
    [ 66.2, -27.0, 3.62],
    [ 66.2,  27.0, 3.62]
]);

// 28 Tactical Landmine Coordinates across Beachhead, No-Man's-Land, Kill-Zone & Breach Approach
export const DDayMineCoordinates = Object.freeze([
    [-148.0, -11.5], [-142.0,   5.2], [-132.0,  14.0], [-124.0,  -4.8],
    [-112.0, -16.0], [-104.0,   9.8], [ -86.0,  -8.5], [ -78.0,  15.5],
    [ -64.0,   1.8], [ -54.0, -13.2], [ -42.0,  11.0], [ -30.0,  -5.6],
    [ -12.0,  16.2], [  -2.0,  -9.4], [  12.0,   4.6], [  24.0, -14.5],
    [  36.0,  12.8], [  48.0,  -3.2], [  60.0,   9.2], [  78.0, -11.8],
    [  92.0,   6.0], [ 106.0, -15.0], [ 118.0,  13.2], [ 128.0,  -2.6],
    [ 144.0,   8.8], [ 156.0,  -9.5], [ 166.0,   4.2], [ 174.0,  -4.4]
]);

const AssaultRampSpecs = [
    { CX: -118.0, CY:   0.0, HalfRun: 6.0, HalfWidth: 3.4, PeakZ: 1.15 },
    { CX:  -46.0, CY: -12.0, HalfRun: 6.0, HalfWidth: 3.4, PeakZ: 1.15 },
    { CX:   32.0, CY:  12.0, HalfRun: 6.0, HalfWidth: 3.4, PeakZ: 1.15 },
    { CX:  112.0, CY:   0.0, HalfRun: 6.0, HalfWidth: 3.4, PeakZ: 1.15 }
];

export function ResolveDDaySurfaces()
{
    return AssaultRampSpecs.map((Spec, Index) =>
    {
        const MinX = Spec.CX - Spec.HalfRun,   MaxX = Spec.CX + Spec.HalfRun;
        const MinY = Spec.CY - Spec.HalfWidth, MaxY = Spec.CY + Spec.HalfWidth;
        return {
            Key:          `dday_assault_ramp_${Index}`,
            Category:     SurfaceCategory.SplineRoad,
            Origin:       [0.0, 0.0, 0.0],
            CosineYaw:    1.0,
            SineYaw:      0.0,
            Yaw:          0.0,
            Friction:     1.06,
            WorldMinimum: [MinX, MinY, -0.10],
            WorldMaximum: [MaxX, MaxY, Spec.PeakZ + 0.40],
            Bounds:       { Minimum: [MinX, MinY, -0.10], Maximum: [MaxX, MaxY, Spec.PeakZ + 0.40] },
            CastRay(RayOrigin, RayDir, MaxTravel)
            {
                if (Math.abs(RayDir[2]) < 1.0e-5)
                    return null;
                const MidX = RayOrigin[0] + RayDir[0] * 0.5 * MaxTravel;
                const MidY = RayOrigin[1] + RayDir[1] * 0.5 * MaxTravel;
                if (MidX < MinX || MidX > MaxX || MidY < MinY || MidY > MaxY)
                    return null;
                const U = (MidX - Spec.CX) / Spec.HalfRun;
                const Height = 0.03 + 0.5 * Spec.PeakZ * (1.0 + Math.cos(Math.PI * U));
                const T = (Height - RayOrigin[2]) / RayDir[2];
                if (T < 0.0 || T > MaxTravel)
                    return null;
                const Slope = -0.5 * Spec.PeakZ * (Math.PI / Spec.HalfRun) * Math.sin(Math.PI * U);
                const NL = Math.hypot(-Slope, 1.0);
                return {
                    Travel:      T,
                    LocalPoint:  [RayOrigin[0] + RayDir[0] * T, RayOrigin[1] + RayDir[1] * T, Height],
                    LocalNormal: [-Slope / NL, 0.0, 1.0 / NL]
                };
            }
        };
    });
}

//------------------------------------------------------------------------------------------------------------------------
//                           D-DAY STATIC PLACEMENTS, GROUND, BREAKABLES & TELEPORT ZONES
//------------------------------------------------------------------------------------------------------------------------

export function ResolveDDayPlacements()
{
    const P = [];

    // ① 3 Beachhead Assault Landing Craft (LCVP) behind the player spawn!
    for (const [Idx, LY] of [-18.0, 0.0, 18.0].entries())
    {
        P.push({
            Name:     `Landing Craft LCVP-${Idx + 1}`,
            Shape:    "DDayLandingCraft",
            Position: [-209.0, LY, 0.0],
            Yaw:      0.0,
            Collider: true
        });
    }

    // ② 10 Reinforced Concrete Casemate Bunkers flanking the Gauntlet
    DDayBunkerSites.forEach((Site, Idx) =>
    {
        P.push({
            Name:     `Casemate Bunker ${Idx + 1}`,
            Shape:    "DDayBunker",
            Position: Site.Pos,
            Yaw:      Site.Yaw,
            Collider: true
        });
    });

    // ③ 4 Engineer Bailey Steel Assault Ramps
    AssaultRampSpecs.forEach((Spec, Idx) =>
    {
        P.push({
            Name:     `Engineer Assault Ramp ${Idx + 1}`,
            Shape:    "DDayAssaultRamp",
            Position: [Spec.CX, Spec.CY, 0.0],
            Yaw:      0.0,
            Collider: false
        });
    });

    // ④ Czech Hedgehogs (Anti-Tank Crossed Steel Obstacles) across Beachhead & Gauntlet
    const Hedgehogs = [
        [-168.0, -14.0], [-166.0,  14.0], [-156.0,  -6.5], [-154.0,   7.5],
        [-128.0, -18.5], [-126.0,  18.5], [ -88.0, -15.5], [ -88.0,  15.5],
        [ -60.0,   8.2], [ -58.0, -19.0], [ -24.0, -14.0], [ -24.0,  14.0],
        [   6.0, -18.0], [   8.0,  18.0], [  42.0,  -7.5], [  44.0,  19.5],
        [  84.0, -16.5], [  84.0,  16.5], [ 122.0, -16.0], [ 122.0,  16.0],
        [ 160.0, -14.5], [ 160.0,  14.5]
    ];
    Hedgehogs.forEach(([X, Y], Idx) =>
    {
        P.push({
            Name:     `Czech Hedgehog ${Idx + 1}`,
            Shape:    "DDayCzechHedgehog",
            Position: [X, Y, 0.0],
            Yaw:      Idx * 0.42,
            Collider: true
        });
    });

    // ⑤ Reinforced Concrete Dragon's Teeth Wing Barriers channeling vehicles into the Gauntlet
    const TeethPositions = [
        [-140.0, -28.0], [-140.0,  28.0], [ -72.0, -28.0], [ -72.0,  28.0],
        [   0.0, -28.0], [   0.0,  28.0], [  96.0, -28.0], [  96.0,  28.0],
        [ 168.0, -24.0], [ 168.0,  24.0]
    ];
    TeethPositions.forEach(([X, Y], Idx) =>
    {
        P.push({
            Name:     `Dragon's Teeth Line ${Idx + 1}`,
            Shape:    "DDayDragonsTeeth",
            Position: [X, Y, 0.0],
            Yaw:      0.0,
            Collider: true
        });
    });

    // ⑥ Sandbag & Chevron Slalom Chicanes (cover from low MG tracers, or smash around at speed!)
    const Sandbags = [
        [-136.0,   0.0], [ -98.0, -11.0], [ -98.0,  11.0], [ -68.0,  -7.0],
        [ -34.0,   7.5], [   2.0,  -8.0], [  26.0,  -6.5], [  56.0,  11.5],
        [  88.0,   0.0], [ 132.0, -11.5], [ 132.0,  11.5], [ 172.0, -12.5],
        [ 172.0,  12.5]
    ];
    Sandbags.forEach(([X, Y], Idx) =>
    {
        P.push({
            Name:     `Sandbag Barricade ${Idx + 1}`,
            Shape:    "DDaySandbagBarricade",
            Position: [X, Y, 0.0],
            Yaw:      (Idx % 2 === 0 ? 0.08 : -0.08),
            Collider: true
        });
    });

    // ⑦ Minefield Warning Signposts flanking mine belts
    for (const [Idx, MX] of [-150.0, -82.0, -8.0, 74.0, 142.0].entries())
    {
        for (const SY of [-22.5, 22.5])
        {
            P.push({
                Name:     `Minefield Warning Sign ${Idx * 2 + (SY > 0 ? 2 : 1)}`,
                Shape:    "DDayMineMarker",
                Position: [MX, SY, 0.0],
                Yaw:      0.0,
                Collider: false
            });
        }
    }

    // ⑧ THE WALL — Colossal 260-meter-wide Fortress Curtain + Central Illuminated Breach Gate at X = +194 m!
    P.push({
        Name:     "The Wall — Central Breach Gate",
        Shape:    "DDayWallBreachGate",
        Position: [194.0, 0.0, 0.0],
        Yaw:      0.0,
        Collider: false // Central 20 m gateway is open so players race right through The Wall!
    });
    // Solid bastion colliders left & right of the 20 m open gate + fortress wall curtain wings!
    for (const WallY of [-106.0, -62.0, -39.5, 39.5, 62.0, 106.0])
    {
        P.push({
            Name:     `The Wall Fortress Curtain Y=${WallY}`,
            Shape:    "DDayWallSegment",
            Position: [195.5, WallY, 0.0],
            Yaw:      0.0,
            Collider: true
        });
    }

    return P;
}

export function ResolveDDayBreakables()
{
    const Spots = [
        [-160.0,   2.5], [-108.0,  -4.0], [ -52.0,   3.5], [ -10.0,   2.0],
        [  38.0,  -2.5], [  74.0,   3.5], [ 118.0,  -5.5], [ 152.0,   2.5]
    ];
    return Spots.map(([X, Y], I) => ({
        Name:     `Ammo Supply Crate ${I + 1}`,
        Material: (I & 1) === 0 ? "wood" : "concrete",
        Mode:     "baked",
        Shape:    { Kind: "box", Extent: [1.35, 1.35, 1.20] },
        Position: [X, Y, 0.03],
        Yaw:      0.31 * I,
        Approach: [1.0, 0.0, 0.0],
        Capacity: 10,
        Energy:   4000,
        Seed:     7701 + I * 43
    }));
}

export function ResolveDDayCones()
{
    const Drums = [
        [-178.0, -8.0], [-178.0,  8.0], [-118.0, -5.2], [-118.0,  5.2],
        [  32.0,  6.8], [  32.0, 17.2], [ 112.0, -5.2], [ 112.0,  5.2],
        [ 184.0, -9.2], [ 184.0,  9.2]
    ];
    return Drums.map(([X, Y], I) => ({
        Name:     `Combat Drum ${I + 1}`,
        Group:    "lone",
        Shape:    "ConstructionDrum",
        Position: [X, Y, 0.04],
        Yaw:      I * 0.5
    }));
}

export function EmitDDayGroundFacets()
{
    const Facets = [];
    const Quad = (X0, Y0, X1, Y1, Z, Family) =>
    {
        Facets.push(
            { Family, Corners: [[X0, Y0, Z], [X1, Y0, Z], [X1, Y1, Z]] },
            { Family, Corners: [[X0, Y0, Z], [X1, Y1, Z], [X0, Y1, Z]] }
        );
    };
    // Western Ocean Surf (-900 .. -218 m)
    Quad(-900.0, -900.0, -218.0, 900.0, 0.0, CourseMaterial.WallCobalt);
    // Landing Beachhead Sand (-218 .. -145 m)
    Quad(-218.0, -900.0, -145.0, 900.0, 0.0, CourseMaterial.Sand);
    // Central Armored Assault Causeway (-145 .. +235 m, Y ∈ [-22..+22])
    Quad(-145.0,  -22.0,  235.0,  22.0, 0.0, CourseMaterial.AsphaltPatch);
    // Shell-Scarred No-Man's-Land Earthen Flanks
    Quad(-145.0, -220.0,  235.0, -22.0, 0.0, CourseMaterial.Dirt);
    Quad(-145.0,   22.0,  235.0, 220.0, 0.0, CourseMaterial.Dirt);
    // Outer Battlefield Perimeter & Safe Zone Behind The Wall (+235 .. +900 m)
    Quad(-145.0, -900.0,  900.0,-220.0, 0.0, CourseMaterial.Grass);
    Quad(-145.0,  220.0,  900.0, 900.0, 0.0, CourseMaterial.Grass);
    Quad( 235.0, -220.0,  900.0, 220.0, 0.0, CourseMaterial.Grass);
    return Facets;
}

export const DDaySpawn = Object.freeze({
    Position: [-194.0, 0.0, 0.63],
    Yaw:      0.0
});

export const DDayZones = Object.freeze([
    { Name: "Beachhead Landing Craft", Position: [-194.0,   0.0], Yaw:  0.0, Note: "Start of Race to The Wall" },
    { Name: "Sector 1 · Mine Belt",    Position: [-110.0,   0.0], Yaw:  0.0, Note: "Bunkers, MG fire & mines" },
    { Name: "Sector 2 · Tank Column",  Position: [ -15.0,  -6.0], Yaw:  0.0, Note: "Advance behind Tank cover!" },
    { Name: "Sector 3 · Kill-Zone",    Position: [  78.0,   0.0], Yaw:  0.0, Note: "Heavy 155mm cannon barrage" },
    { Name: "THE WALL · Breach Gate",  Position: [ 178.0,   0.0], Yaw:  0.0, Note: "Final sprint through gate!" }
]);
