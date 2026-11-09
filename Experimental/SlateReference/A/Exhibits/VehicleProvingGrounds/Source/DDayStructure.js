//============================================================================================================================================
//                                                          DDAYSTRUCTURE.JS
//============================================================================================================================================
// ⚔️ Dedicated "D-Day · Race to The Wall" ("dday") militarized gauntlet level:
//    • True 3D Uneven Shell-Cratered Battlefield Terrain (Coastal Beachhead Shingle Rise -> Rolling Ridges -> 26 Sculpted Bomb Craters
//      with raised earthen blast rims -> Elevated Fortress Glacis at THE WALL), shared between GPU terrain mesh & 480 Hz tyre physics!
//    • High-Detail Sculpted 100% Watertight 2-Manifold Military & Fortification Assets:
//      - Allied Assault Tanks: 12 cylindrical roadwheels, track pontoons, sloped glacis, mine-plow, fuel drums, cast hexagonal turret
//        & 12-sided cylindrical 105mm rifled cannon with bore evacuator & muzzle brake
//      - Atlantic-Wall Octagonal Reinforced Concrete Casemate Bunkers with armored cupola domes & recessed embrasure hoods
//      - Rotating Twin-Barrel Perforated Bunker MG Turrets & 155mm Coastal Artillery Gunhouses with hydraulic recoil cylinders
//      - Tapered Fighter-Bomber Attack Aircraft with radial cowlings, dihedral D-Day Invasion-Stripe wings, bomb racks & 4-blade props
//      - True Tilted 3-Axis Steel Czech Hedgehogs, Truncated-Pyramid Concrete Dragon's Teeth, Curved Sandbag Emplacements,
//        Tapered Higgins LCVP Landing Craft, Round Teller Landmines, and THE WALL Fortress Bastions & Central Breach Gate!

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitQuad, EmitSphereFacets } from "./CourseStructure.js";
import { EmitTranslatedBox, EmitSlopedApronBox } from "./CityPursuitStructure.js";
import { EmitConstructionDrumFacets } from "./SignageBuilder.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                      SCULPTED WATERTIGHT 2-MANIFOLD GEOMETRY PRIMITIVES (ZERO OPEN EDGES)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Closed 2-manifold tapered frustum / cylinder along Axis ("X" | "Y" | "Z") centered at [CX, CY, CZ] with span Length.
export function EmitTaperedCylinder(CX, CY, CZ, Axis, R0, R1, Length, Sides, SideMat, Cap0Mat = SideMat, Cap1Mat = SideMat)
{
    const Facets = [];
    const Half = 0.5 * Length;
    const MakePt = (S, U, V) =>
    {
        if (Axis === "X") return [CX + S, CY + U, CZ + V];
        if (Axis === "Y") return [CX + V, CY + S, CZ + U];
        return [CX + U, CY + V, CZ + S];
    };
    const C0 = MakePt(-Half, 0.0, 0.0);
    const C1 = MakePt( Half, 0.0, 0.0);

    for (let I = 0; I < Sides; ++I)
    {
        const A0 = (2.0 * Math.PI * I) / Sides;
        const A1 = (2.0 * Math.PI * (I + 1)) / Sides;
        const Cos0 = Math.cos(A0), Sin0 = Math.sin(A0);
        const Cos1 = Math.cos(A1), Sin1 = Math.sin(A1);

        const P00 = MakePt(-Half, R0 * Cos0, R0 * Sin0);
        const P10 = MakePt(-Half, R0 * Cos1, R0 * Sin1);
        const P11 = MakePt( Half, R1 * Cos1, R1 * Sin1);
        const P01 = MakePt( Half, R1 * Cos0, R1 * Sin0);

        // Outward CCW side quad & both end-cap triangles (verified right-handed for X, Y, and Z permutations!)
        EmitQuad(Facets, P00, P10, P11, P01, SideMat);
        Facets.push({ Family: Cap1Mat, Corners: [C1, P01, P11] });
        Facets.push({ Family: Cap0Mat, Corners: [C0, P10, P00] });
    }
    return Facets;
}

// 📝 Closed 2-manifold vertical extrusion of any counter-clockwise 2D polygon [[x,y], ...] from BottomZ to BottomZ + Height.
export function EmitExtrudedPolygonZ(CX, CY, BottomZ, Height, PolyCCW, SideMat, TopMat = SideMat)
{
    const Facets = [];
    const N = PolyCCW.length;
    const Z0 = BottomZ, Z1 = BottomZ + Height;
    // Centroid fan works cleanly for all star-convex fortification / turret / hull polygons
    let AvgX = 0.0, AvgY = 0.0;
    for (const [PX, PY] of PolyCCW) { AvgX += PX; AvgY += PY; }
    AvgX = CX + AvgX / N;
    AvgY = CY + AvgY / N;

    for (let I = 0; I < N; ++I)
    {
        const [X0, Y0] = PolyCCW[I];
        const [X1, Y1] = PolyCCW[(I + 1) % N];
        const B0 = [CX + X0, CY + Y0, Z0];
        const B1 = [CX + X1, CY + Y1, Z0];
        const T1 = [CX + X1, CY + Y1, Z1];
        const T0 = [CX + X0, CY + Y0, Z1];
        EmitQuad(Facets, B0, B1, T1, T0, SideMat);
        Facets.push({ Family: TopMat,  Corners: [[AvgX, AvgY, Z1], T0, T1] });
        Facets.push({ Family: SideMat, Corners: [[AvgX, AvgY, Z0], B1, B0] });
    }
    return Facets;
}

// 📝 Closed 2-manifold 6-face rectangular beam oriented along an arbitrary 3D unit/non-unit direction vector Dir = [DX, DY, DZ].
export function EmitOrientedBeam(CX, CY, CZ, Dir, Length, WidthU, ThickV, Material)
{
    const DL = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1.0;
    const F  = [Dir[0] / DL, Dir[1] / DL, Dir[2] / DL];
    // Orthonormal frame (F, U, V) with det = +1
    const Ref = Math.abs(F[2]) < 0.85 ? [0.0, 0.0, 1.0] : [1.0, 0.0, 0.0];
    let UX = Ref[1] * F[2] - Ref[2] * F[1];
    let UY = Ref[2] * F[0] - Ref[0] * F[2];
    let UZ = Ref[0] * F[1] - Ref[1] * F[0];
    const UL = Math.hypot(UX, UY, UZ) || 1.0;
    UX /= UL; UY /= UL; UZ /= UL;
    const VX = F[1] * UZ - F[2] * UY;
    const VY = F[2] * UX - F[0] * UZ;
    const VZ = F[0] * UY - F[1] * UX;

    const HL = 0.5 * Length, HU = 0.5 * WidthU, HV = 0.5 * ThickV;
    const Pt = (S, A, B) => [
        CX + F[0] * S + UX * A + VX * B,
        CY + F[1] * S + UY * A + VY * B,
        CZ + F[2] * S + UZ * A + VZ * B
    ];
    const Facets = [];
    // Map (S, A, B) -> (X, Y, Z) right-handed (F × U = -V? Wait: Ref × F = U -> F × U = V? Let's verify:
    // F=(1,0,0), Ref=(0,0,1) -> U = Ref × F = (0,1,0); V = F × U = (0,0,1)! YES, det([F, U, V]) = +1!)
    EmitQuad(Facets, Pt(-HL, -HU,  HV), Pt( HL, -HU,  HV), Pt( HL,  HU,  HV), Pt(-HL,  HU,  HV), Material); // +V
    EmitQuad(Facets, Pt(-HL,  HU, -HV), Pt( HL,  HU, -HV), Pt( HL, -HU, -HV), Pt(-HL, -HU, -HV), Material); // -V
    EmitQuad(Facets, Pt( HL, -HU, -HV), Pt( HL,  HU, -HV), Pt( HL,  HU,  HV), Pt( HL, -HU,  HV), Material); // +F
    EmitQuad(Facets, Pt(-HL,  HU, -HV), Pt(-HL, -HU, -HV), Pt(-HL, -HU,  HV), Pt(-HL,  HU,  HV), Material); // -F
    EmitQuad(Facets, Pt( HL,  HU, -HV), Pt(-HL,  HU, -HV), Pt(-HL,  HU,  HV), Pt( HL,  HU,  HV), Material); // +U
    EmitQuad(Facets, Pt(-HL, -HU, -HV), Pt( HL, -HU, -HV), Pt( HL, -HU,  HV), Pt(-HL, -HU,  HV), Material); // -U
    return Facets;
}

//------------------------------------------------------------------------------------------------------------------------
//                  ANALYTICAL 3D UNEVEN SHELL-CRATERED BATTLEFIELD TERRAIN (SHARED WITH 480 HZ PHYSICS!)
//------------------------------------------------------------------------------------------------------------------------

export const DDayShellCraters = Object.freeze([
    // [X, Y, Radius, DepthScale] — 26 sculpted bomb & 155mm shell craters across the gauntlet!
    [-142.0, -14.0,  7.5, 0.55], [-134.0,  12.5,  6.8, 0.50], [-118.0,  -4.5,  6.2, 0.44],
    [-104.0,  18.0,  8.2, 0.62], [ -92.0, -16.5,  7.4, 0.56], [ -78.0,   4.0,  6.5, 0.46],
    [ -64.0, -12.0,  8.0, 0.60], [ -52.0,  15.0,  7.6, 0.58], [ -38.0,  -3.5,  6.4, 0.45],
    [ -24.0,  19.5,  8.5, 0.65], [ -12.0, -17.0,  7.8, 0.58], [   4.0,   6.5,  6.8, 0.48],
    [  18.0, -11.5,  8.2, 0.62], [  30.0,  16.0,  7.5, 0.55], [  44.0,  -2.0,  6.2, 0.42],
    [  58.0, -18.5,  8.6, 0.66], [  72.0,  13.5,  7.8, 0.58], [  86.0,  -6.5,  6.6, 0.48],
    [ 100.0,  17.5,  8.4, 0.64], [ 114.0, -14.0,  7.6, 0.56], [ 126.0,   4.5,  6.4, 0.45],
    [ 140.0, -16.5,  8.0, 0.60], [ 152.0,  14.5,  7.4, 0.54], [ 164.0,  -5.0,  6.0, 0.40],
    [ -85.0,  36.0,  9.5, 0.72], [  22.0, -38.0,  9.5, 0.72]
]);

function SmoothStep(Edge0, Edge1, X)
{
    const T = Math.max(0.0, Math.min(1.0, (X - Edge0) / (Edge1 - Edge0)));
    return T * T * (3.0 - 2.0 * T);
}

// 📝 Smooth C² uneven battlefield elevation Z(X, Y) >= 0.04 m everywhere:
//    • X <= -216 m: tidal surf (0.04 m)
//    • X ∈ [-216 .. -150 m]: gently rising wet-sand landing beachhead -> shingle seawall bluff (+1.65 m)
//    • X ∈ [-150 .. +180 m]: undulating multi-octave earthen ridges, flanking dunes, and 26 concave bomb craters with raised blast rims!
//    • X >= +180 m: elevated Fortress Glacis plateau (+1.62 m) with smooth stone apron through THE WALL Breach Gate!
export function QueryDDayTerrainHeight(X, Y)
{
    if (X <= -222.0)
        return 0.04;

    // ① Coastal rise from Landing Craft ramp (-204 m -> 0.22 m) up the shingle bluff (-152 m -> 1.62 m)
    const BeachRise  = 0.22 * SmoothStep(-222.0, -192.0, X) + 1.40 * SmoothStep(-184.0, -148.0, X);

    // ② Multi-octave rolling battlefield ridges & flanking valley berm (softened right on the Beachhead & Breach Gate apron)
    const MidEnvelope = SmoothStep(-176.0, -138.0, X) * (1.0 - 0.82 * SmoothStep(172.0, 192.0, X));
    const Ridge1 = 0.46 * Math.sin(0.046 * X + 0.35) * Math.cos(0.038 * Y);
    const Ridge2 = 0.28 * Math.sin(0.088 * X - 0.052 * Y + 1.1);
    const Ridge3 = 0.20 * Math.cos(0.031 * X + 0.078 * Y - 0.6);
    // Flanking hillside embankments rise outside |Y| > 26 m to frame the combat valley naturally!
    const FlankBerm = 1.35 * SmoothStep(24.0, 62.0, Math.abs(Y)) * SmoothStep(-175.0, -125.0, X);

    let H = 0.04 + BeachRise + MidEnvelope * (Ridge1 + Ridge2 + Ridge3) + FlankBerm;

    // ③ 26 Sculpted Shell & Bomb Craters (raised earthen rim + depressed bowl)
    if (X > -158.0 && X < 178.0 && Math.abs(Y) < 55.0)
    {
        for (let I = 0; I < DDayShellCraters.length; ++I)
        {
            const [CX, CY, R, D] = DDayShellCraters[I];
            const DX = X - CX, DY = Y - CY;
            const DistSq = DX * DX + DY * DY;
            const CutR = R * 1.65;
            if (DistSq > CutR * CutR)
                continue;
            const UOuter = DistSq / (R * R * 0.88);
            const UInner = DistSq / (R * R * 0.34);
            // Mexican-hat crater profile: +0.38*D raised blast berm at rim, -1.05*D sunken bowl at center!
            H += D * (0.95 * Math.exp(-UOuter) - 1.95 * Math.exp(-UInner));
        }
    }

    return Math.max(0.05, H);
}

//------------------------------------------------------------------------------------------------------------------------
//                  HIGH-EFFORT SCULPTED FORTIFICATIONS & BARRICADES (100% WATERTIGHT 2-MANIFOLDS)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Atlantic-Wall Octagonal Reinforced Concrete Casemate Bunker (Regelbau-style):
//    Embedded concrete foundation skirt (-0.45 m .. +0.32 m so hillside slopes never gap!) + chamfered octagonal concrete walls +
//    stepped blast-deflecting embrasure hood + armored steel rear blast door + spherical armored observation cupola!
export function EmitDDayBunkerFacets()
{
    const Out = [];
    const G = 0.018;
    const OctBase = [
        [ 4.40, -2.40], [ 4.40,  2.40], [ 2.40,  4.10], [-3.80,  4.10],
        [-4.50,  2.80], [-4.50, -2.80], [-3.80, -4.10], [ 2.40, -4.10]
    ];
    // ① Deep hillside-anchored foundation plinth (Z = -0.55 .. +0.32 m)
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, -0.55, 0.87, OctBase, CourseMaterial.TunnelConcrete));

    // ② Lower sloped glacis casemate body (Z = 0.338 .. 1.62 m)
    const OctMid = OctBase.map(([X, Y]) => [X * 0.94, Y * 0.94]);
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, 0.32 + G, 1.28, OctMid, CourseMaterial.Concrete));
    Out.push(...EmitSlopedApronBox(4.32, 0.0, 0.32 + G, 0.72, 4.30, 1.18, 0.34, CourseMaterial.TunnelConcrete));

    // ③ Embrasure Firing Tier (Z = 1.64 .. 2.38 m): dark armored interior + thick concrete flank cheeks + rear wall
    const EmbZ = 1.60 + 2.0 * G, EmbH = 0.74;
    Out.push(...EmitTranslatedBox(-0.85,  0.00, EmbZ, 4.90, 3.80, EmbH, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 2.15,  2.55, EmbZ, 2.50, 2.25, EmbH, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox( 2.15, -2.55, EmbZ, 2.50, 2.25, EmbH, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox(-2.95,  0.00, EmbZ, 2.15, 7.20, EmbH, CourseMaterial.Concrete));

    // ④ Overhanging Stepped Concrete Blast-Visor Roof (Z = 2.40 .. 3.42 m)
    const RoofZ = EmbZ + EmbH + G;
    const OctRoof = OctBase.map(([X, Y]) => [X * 1.02 + 0.22, Y * 0.98]);
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, RoofZ, 0.96, OctRoof, CourseMaterial.TunnelConcrete, CourseMaterial.Concrete));

    // ⑤ Cylindrical Armored Turret Ring + Spherical Steel Observation Cupola Dome + Rear Blast Door & Periscope Vent!
    const TopZ = RoofZ + 0.96 + G;
    Out.push(...EmitTaperedCylinder( 0.25,  0.00, TopZ + 0.21, "Z", 1.52, 1.38, 0.42, 12, CourseMaterial.SteelDark));
    const Dome = EmitSphereFacets(0.72, 8, 12, CourseMaterial.SteelDark).map((F) => ({
        Family:  F.Family,
        Corners: F.Corners.map((P) => [P[0] - 2.35, P[1] + 2.10, P[2] + TopZ])
    }));
    Out.push(...Dome);
    Out.push(...EmitTaperedCylinder(-2.35, -2.10, TopZ + 0.42, "Z", 0.14, 0.14, 0.84, 8, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-4.36, 0.0, 0.36, 0.22, 1.55, 1.88, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Authentic 3-Axis Tilted Crossed Steel I-Beam "Czech Hedgehog" Anti-Tank Obstacle!
export function EmitCzechHedgehogFacets()
{
    const Out = [];
    // 3 diagonal steel beams crossing at Z = 0.82 m with disjoint gusset offsets (>= 18 mm apart for 2-manifold purity!)
    Out.push(...EmitOrientedBeam( 0.00,  0.00, 0.82, [ 0.82,  0.00, 0.82], 2.25, 0.20, 0.20, CourseMaterial.SteelDark));
    Out.push(...EmitOrientedBeam( 0.00,  0.24, 0.82, [-0.62,  0.56, 0.82], 2.25, 0.20, 0.20, CourseMaterial.SteelDark));
    Out.push(...EmitOrientedBeam( 0.00, -0.24, 0.82, [-0.62, -0.56, 0.82], 2.25, 0.20, 0.20, CourseMaterial.SteelDark));
    // Central riveted gusset collar + crimson hazard paint tip
    Out.push(...EmitTranslatedBox(0.0, 0.0, 1.58, 0.34, 0.34, 0.16, CourseMaterial.KerbRed));
    return Out;
}

// 📝 Reinforced Concrete "Dragon's Teeth" Anti-Tank Line (2 staggered rows of 4-sided truncated concrete pyramids!)
export function EmitDragonsTeethFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.35, 3.10, 8.20, 0.56, CourseMaterial.TunnelConcrete));
    for (const Y of [-2.85, -0.95, 0.95, 2.85])
        Out.push(...EmitTaperedCylinder(-0.58, Y, 0.82, "Z", 0.78, 0.28, 1.18, 4, CourseMaterial.Concrete));
    for (const Y of [-1.90, 0.00, 1.90])
        Out.push(...EmitTaperedCylinder( 0.62, Y, 0.94, "Z", 0.82, 0.28, 1.42, 4, CourseMaterial.TunnelConcrete));
    return Out;
}

// 📝 Curved Multi-Course Sandbag & Timber/Barbed-Post Combat Emplacement
export function EmitSandbagBarricadeFacets()
{
    const Out = [];
    // Curved 3-segment sandbag wall + timber revetment stakes + steel hazard chevron
    const Segs = [
        [ 0.00,  0.00,  0.00, 2.20],
        [ 0.28,  2.05,  0.24, 2.00],
        [ 0.28, -2.05, -0.24, 2.00]
    ];
    for (const [SX, SY, Ang, Len] of Segs)
    {
        const Dir = [-Math.sin(Ang), Math.cos(Ang), 0.0];
        Out.push(...EmitOrientedBeam(SX, SY, 0.14, Dir, Len, 1.15, 0.56, CourseMaterial.Sand));
        Out.push(...EmitOrientedBeam(SX, SY, 0.68, Dir, Len * 0.92, 0.92, 0.44, CourseMaterial.Dirt));
        Out.push(...EmitOrientedBeam(SX, SY, 1.10, Dir, Len * 0.80, 0.72, 0.34, CourseMaterial.Sand));
    }
    for (const Y of [-2.4, -0.8, 0.8, 2.4])
        Out.push(...EmitTaperedCylinder(0.68, Y, 0.55, "Z", 0.09, 0.08, 1.45, 6, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-0.66, 0.0, 0.44, 0.08, 1.85, 0.42, CourseMaterial.KerbRed));
    return Out;
}

// 📝 Higgins LCVP Steel/Plywood Assault Landing Craft (tapered hull, ribbed bow ramp, armored gunwales, stern engine house & twin MG shields)
export function EmitLandingCraftFacets()
{
    const Out = [];
    const HullPoly = [
        [ 1.20, -2.15], [ 1.20,  2.15], [-9.80,  2.35],
        [-10.9,  1.85], [-10.9, -1.85], [-9.80, -2.35]
    ];
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, -0.30, 0.68, HullPoly, CourseMaterial.SteelDark, CourseMaterial.AsphaltFine));
    // Lowered ribbed steel bow assault ramp (+X: 1.22 .. 4.90 m)
    Out.push(...EmitSlopedApronBox(3.06, 0.0, -0.10, 3.64, 4.10, 0.48, 0.12, CourseMaterial.Aluminium));
    // Port & Starboard armored bulwarks + ramp winch chains
    for (const SY of [-1, 1])
    {
        Out.push(...EmitTranslatedBox(-4.60, SY * 2.38, 0.40, 11.40, 0.36, 1.95, CourseMaterial.SteelDark));
        Out.push(...EmitOrientedBeam( 1.85, SY * 2.18, 1.38, [0.88, 0.0, -0.48], 3.10, 0.08, 0.08, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(-7.80, SY * 1.95, 2.68, "Z", 0.52, 0.52, 0.58, 10, CourseMaterial.TunnelConcrete));
    }
    // Stern armored coxswain shield & twin exhaust stacks
    Out.push(...EmitTranslatedBox(-9.60, 0.0, 0.40, 2.20, 4.30, 2.18, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTaperedCylinder(-11.10,  0.95, 1.45, "Z", 0.16, 0.14, 2.10, 8, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(-11.10, -0.95, 1.45, "Z", 0.16, 0.14, 2.10, 8, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Bailey Truss Steel Engineer Assault Ramp (bridging craters & launching vehicles!)
export function EmitDDayAssaultRampFacets()
{
    const Out = [];
    Out.push(...EmitSlopedApronBox(-3.22, 0.0, -0.25, 6.40, 7.20, 0.28, 1.42, CourseMaterial.SteelDark));
    Out.push(...EmitSlopedApronBox( 3.22, 0.0, -0.25, 6.40, 7.20, 1.42, 0.28, CourseMaterial.SteelDark));
    for (const SY of [-3.78, 3.78])
    {
        Out.push(...EmitTranslatedBox(0.0, SY, -0.20, 10.60, 0.26, 1.72, CourseMaterial.BannerAmber));
        Out.push(...EmitOrientedBeam(-2.8, SY, 1.68, [ 0.92, 0, 0.38], 4.2, 0.14, 0.14, CourseMaterial.SteelDark));
        Out.push(...EmitOrientedBeam( 2.8, SY, 1.68, [-0.92, 0, 0.38], 4.2, 0.14, 0.14, CourseMaterial.SteelDark));
    }
    return Out;
}

// 📝 THE WALL — Battered Reinforced Concrete Fortress Curtain with Sloped Buttresses & Anti-Tank Ditch Toe
export function EmitTheWallSegmentFacets()
{
    const Out = [];
    const G = 0.02;
    Out.push(...EmitSlopedApronBox(-4.22, 0.0, -1.18, 3.20, 43.40, 1.55, 5.20, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTranslatedBox( 0.00, 0.0, -1.20, 5.20, 43.80, 15.20, CourseMaterial.Concrete));
    // 4 Tapered Fortress Buttress Piers + Crenellated Battlement Merlons + Crimson Regimental Banners
    for (const Y of [-16.5, -5.5, 5.5, 16.5])
    {
        Out.push(...EmitSlopedApronBox(-3.45, Y, 4.05, 1.65, 2.80, 2.20, 9.80, CourseMaterial.TunnelConcrete));
        Out.push(...EmitTranslatedBox(-2.20, Y, 14.02 + G, 1.40, 6.20, 1.45, CourseMaterial.SteelDark));
        Out.push(...EmitTranslatedBox(-2.78, Y + 5.2, 6.80, 0.24, 2.10, 5.60, CourseMaterial.KerbRed));
    }
    return Out;
}

// 📝 THE WALL — Twin Octagonal Fortress Bastion Towers, Searchlight Crowns & Illuminated Central Breach Archway!
export function EmitTheWallBreachGateFacets()
{
    const Out = [];
    const BastionPoly = [
        [ 4.6, -3.2], [ 4.6,  3.2], [ 2.4,  5.2], [-2.8,  5.2],
        [-4.8,  3.2], [-4.8, -3.2], [-2.8, -5.2], [ 2.4, -5.2]
    ];
    for (const SY of [-1, 1])
    {
        const BY = SY * 16.2;
        Out.push(...EmitExtrudedPolygonZ(0.0, BY, -1.20, 18.40, BastionPoly, CourseMaterial.TunnelConcrete, CourseMaterial.Concrete));
        Out.push(...EmitTaperedCylinder(-1.80, BY, 17.85, "Z", 2.40, 2.65, 1.20, 10, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(-2.10, BY, 19.15, "X", 0.95, 1.15, 0.90, 12, CourseMaterial.SteelDark, CourseMaterial.LampWarm, CourseMaterial.SteelDark));
        // Illuminated Emerald Breach Guidance Pylon
        Out.push(...EmitTaperedCylinder(-4.40, SY * 10.6, 3.20, "Z", 0.42, 0.34, 6.80, 8, CourseMaterial.TrafficGreen));
    }
    // Monumental Overhead Fortress Arch Lintel (9.4 m clear height × 21.6 m clear width!)
    Out.push(...EmitTranslatedBox( 0.00, 0.0,  9.40, 7.40, 22.00, 5.80, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox(-3.85, 0.0, 10.10, 0.26, 19.20, 1.10, CourseMaterial.TrafficGreen));
    Out.push(...EmitTranslatedBox(-2.20, 0.0, -0.25, 2.80, 21.00, 0.30, CourseMaterial.TrafficGreen));
    return Out;
}

export function EmitMinefieldMarkerFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.72, "Z", 0.07, 0.06, 1.75, 6, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-0.09, 0.0, 1.28, 0.08, 0.96, 0.64, CourseMaterial.KerbRed));
    Out.push(...EmitTranslatedBox(-0.15, 0.0, 1.44, 0.03, 0.58, 0.32, CourseMaterial.PaintWhite));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                  HIGH-EFFORT SCULPTED DYNAMIC COMBAT VEHICLES, WEAPONS & AIRCRAFT (2-MANIFOLD)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Allied Heavy Assault Tank Hull (M4A3E8 / Centurion-inspired):
//    • 12 cylindrical roadwheels (6 per side) + front drive sprockets & rear idlers inside sculpted armored track pontoons
//    • Multi-plane sloped upper/lower glacis hull + front toothed steel mine-plow dozer blade
//    • Rear engine radiator louvers, twin cylindrical jettison fuel drums, headlights & Allied white/green cover chevron!
export function EmitDDayTankHullFacets()
{
    const Out = [];
    // ① Left & Right Track Runs + 6 Cylindrical Roadwheels + Drive Sprocket + Idler per side!
    for (const SY of [-1, 1])
    {
        const TrackY = SY * 1.42;
        // Upper & lower track belt runs + armored mudguard skirt (disjoint by >= 18 mm from roadwheels!)
        Out.push(...EmitTranslatedBox(0.0, TrackY, 0.00, 5.40, 0.62, 0.14, CourseMaterial.Rubber));
        Out.push(...EmitTranslatedBox(0.0, TrackY, 0.96, 6.45, 0.66, 0.14, CourseMaterial.Rubber));
        Out.push(...EmitTranslatedBox(0.0, TrackY, 1.12, 6.75, 0.78, 0.16, CourseMaterial.SteelDark));

        const WheelXs = [-2.15, -1.29, -0.43, 0.43, 1.29, 2.15];
        for (const WX of WheelXs)
            Out.push(...EmitTaperedCylinder(WX, TrackY, 0.54, "Y", 0.37, 0.37, 0.56, 10, CourseMaterial.Rubber, CourseMaterial.SteelDark, CourseMaterial.SteelDark));
        // Raised front drive sprocket & rear idler wheel
        Out.push(...EmitTaperedCylinder( 2.92, TrackY, 0.72, "Y", 0.33, 0.33, 0.54, 10, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(-2.92, TrackY, 0.72, "Y", 0.31, 0.31, 0.54, 10, CourseMaterial.SteelDark));
    }

    // ② Central Sloped Armored Hull + Front Glacis + Front Steel Mine-Plow Dozer Blade
    Out.push(...EmitTranslatedBox(-0.18, 0.0, 0.38, 5.75, 1.98, 1.08, CourseMaterial.Barrier));
    Out.push(...EmitSlopedApronBox( 3.06, 0.0, 0.46, 0.68, 1.94, 0.98, 0.32, CourseMaterial.Barrier));
    Out.push(...EmitSlopedApronBox( 3.64, 0.0, 0.16, 0.36, 3.46, 0.62, 0.18, CourseMaterial.SteelDark));

    // ③ Armored Bow Headlight Guards + Allied White Star Panel + Rear Cylindrical Fuel Drums & Cover Beacon
    Out.push(...EmitTaperedCylinder( 2.86,  0.76, 1.56, "X", 0.12, 0.14, 0.24, 8, CourseMaterial.SteelDark, CourseMaterial.SteelDark, CourseMaterial.Headlight));
    Out.push(...EmitTaperedCylinder( 2.86, -0.76, 1.56, "X", 0.12, 0.14, 0.24, 8, CourseMaterial.SteelDark, CourseMaterial.SteelDark, CourseMaterial.Headlight));
    Out.push(...EmitTranslatedBox(-2.10,  0.00, 1.48, 1.55, 1.65, 0.12, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(-3.34,  0.62, 0.96, "Y", 0.26, 0.26, 0.86, 10, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTaperedCylinder(-3.34, -0.62, 0.96, "Y", 0.26, 0.26, 0.86, 10, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTranslatedBox(-3.08,  0.00, 1.24, 0.08, 1.52, 0.20, CourseMaterial.TrafficGreen));
    return Out;
}

// 📝 Cast Hexagonal Assault Tank Turret + Cylindrical 105mm Rifled Barrel, Bore Evacuator, Muzzle Brake & Pintle .50-Cal MG!
export function EmitDDayTankTurretFacets()
{
    const Out = [];
    const TurretPoly = [
        [ 1.38, -0.82], [ 1.38,  0.82], [ 0.35,  1.16], [-1.35,  1.06],
        [-1.78,  0.68], [-1.78, -0.68], [-1.35, -1.06], [ 0.35, -1.16]
    ];
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, 0.00, 0.82, TurretPoly, CourseMaterial.Barrier, CourseMaterial.Barrier));
    // Rounded Gun Mantlet Cylinder + 12-sided Rifled 105mm Main Gun + Bore Evacuator + Double-Baffle Muzzle Brake
    Out.push(...EmitTaperedCylinder(1.56, 0.0, 0.42, "Y", 0.28, 0.28, 1.12, 10, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(3.45, 0.0, 0.42, "X", 0.11, 0.09, 3.28, 12, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(3.85, 0.0, 0.42, "X", 0.16, 0.15, 0.58, 12, CourseMaterial.Barrier));
    Out.push(...EmitTaperedCylinder(5.26, 0.0, 0.42, "X", 0.15, 0.18, 0.30, 10, CourseMaterial.SteelDark));
    // Commander Cylindrical Cupola + Pintle .50-Cal Anti-Aircraft Machine Gun + Bustle Stowage Box
    Out.push(...EmitTaperedCylinder(-0.58,  0.52, 0.98, "Z", 0.40, 0.38, 0.28, 10, CourseMaterial.SteelDark, CourseMaterial.PaintWhite, CourseMaterial.PaintWhite));
    Out.push(...EmitTaperedCylinder(-0.10, -0.52, 1.02, "X", 0.04, 0.04, 1.05,  8, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-2.06, 0.0, 0.18, 0.48, 1.24, 0.52, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Rotating Armored Cupola Twin-Barrel Heavy MG Turret (cylindrical ammo drums + perforated barrels)
export function EmitDDayMgTurretFacets()
{
    const Out = [];
    const ShieldPoly = [
        [ 0.92, -0.58], [ 0.92,  0.58], [ 0.20,  0.88],
        [-0.86,  0.76], [-0.86, -0.76], [ 0.20, -0.88]
    ];
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, 0.00, 0.72, ShieldPoly, CourseMaterial.SteelDark, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTranslatedBox(0.98, 0.0, 0.18, 0.08, 0.92, 0.42, CourseMaterial.KerbRed));
    for (const SY of [-0.28, 0.28])
    {
        Out.push(...EmitTaperedCylinder(1.38, SY, 0.38, "X", 0.09, 0.09, 0.65, 8, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(2.22, SY, 0.38, "X", 0.045, 0.038, 0.98, 8, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(0.45, SY * 2.3, 0.42, "Y", 0.22, 0.22, 0.24, 10, CourseMaterial.BannerAmber));
    }
    return Out;
}

// 📝 Heavy 155mm Fortress Coastal Artillery Gunhouse (chamfered turret + twin hydraulic recoil cylinders + 6 m rifled barrel!)
export function EmitDDayHeavyCannonFacets()
{
    const Out = [];
    const GunhousePoly = [
        [ 1.85, -1.15], [ 1.85,  1.15], [ 0.45,  1.65], [-1.95,  1.52],
        [-2.45,  1.05], [-2.45, -1.05], [-1.95, -1.52], [ 0.45, -1.65]
    ];
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, 0.00, 1.42, GunhousePoly, CourseMaterial.SteelDark, CourseMaterial.TunnelConcrete));
    // Twin hydraulic recoil recuperator cylinders above & below main breech
    Out.push(...EmitTaperedCylinder(2.55, 0.0, 1.06, "X", 0.16, 0.14, 1.25, 10, CourseMaterial.Aluminium));
    Out.push(...EmitTaperedCylinder(2.45, 0.0, 0.42, "X", 0.16, 0.14, 1.15, 10, CourseMaterial.Aluminium));
    // Stepped 12-sided 155mm Coastal Gun Barrel + Heavy Muzzle Brake
    Out.push(...EmitTaperedCylinder(3.15, 0.0, 0.74, "X", 0.26, 0.22, 2.40, 12, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(5.65, 0.0, 0.74, "X", 0.20, 0.16, 2.52, 12, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(7.12, 0.0, 0.74, "X", 0.24, 0.26, 0.36, 12, CourseMaterial.KerbRed));
    return Out;
}

// 📝 Sculpted P-47 / Typhoon-Style Fighter-Bomber Attack Aircraft (radial engine cowling, tapered fuselage, bubble canopy,
//    dihedral swept wings with black-and-white D-Day Invasion Stripes, underwing bomb racks & tail empennage!)
export function EmitDDayAircraftFacets()
{
    const Out = [];
    // ① Tapered Cylindrical Fuselage (3 smooth frustum sections) + Crimson Radial Engine Cowling + Chin Scoop
    Out.push(...EmitTaperedCylinder( 3.25, 0.0, 0.58, "X", 0.62, 0.52, 1.10, 12, CourseMaterial.KerbRed, CourseMaterial.SteelDark, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder( 0.85, 0.0, 0.58, "X", 0.66, 0.64, 3.62, 12, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(-2.45, 0.0, 0.62, "X", 0.62, 0.26, 2.92, 12, CourseMaterial.SteelDark));
    // Teardrop Bubble Glass Cockpit Canopy
    Out.push(...EmitTaperedCylinder( 0.65, 0.0, 1.24, "X", 0.38, 0.24, 2.15, 10, CourseMaterial.VehicleGlass));

    // ② Dihedral Main Wings + Black-and-White D-Day Invasion Stripes + Underwing Bomb Pylons & Wing-Mounted 20mm Autocannons!
    for (const SY of [-1, 1])
    {
        Out.push(...EmitOrientedBeam(0.55, SY * 2.85, 0.52, [0.0, SY * 0.992, 0.12], 4.85, 1.95, 0.18, CourseMaterial.Aluminium));
        // Iconic White D-Day Invasion Stripes on upper/lower wing panels
        Out.push(...EmitOrientedBeam(0.55, SY * 2.15, 0.54, [0.0, SY * 0.992, 0.12], 1.10, 1.98, 0.21, CourseMaterial.PaintWhite));
        Out.push(...EmitOrientedBeam(0.55, SY * 3.45, 0.69, [0.0, SY * 0.992, 0.12], 0.85, 1.82, 0.21, CourseMaterial.PaintWhite));
        // Underwing Bomb Pylon + 20mm Wing Cannon Barrel
        Out.push(...EmitTranslatedBox(0.65, SY * 1.85, 0.14, 0.95, 0.14, 0.26, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(1.85, SY * 2.45, 0.52, "X", 0.045, 0.035, 0.95, 8, CourseMaterial.SteelDark));
    }

    // ③ Horizontal Tailplane + Swept Dorsal Rudder Fin
    Out.push(...EmitTranslatedBox(-3.65, 0.0, 0.64, 1.05, 3.35, 0.14, CourseMaterial.Aluminium));
    Out.push(...EmitExtrudedPolygonZ(-3.55, -0.07, 0.78, 0.01, [[-0.6, 0], [0.6, 0], [0.2, 0.14], [-0.5, 0.14]], CourseMaterial.KerbRed));
    Out.push(...EmitSlopedApronBox(-3.55, 0.0, 0.80, 1.25, 0.16, 1.55, 0.48, CourseMaterial.KerbRed));
    return Out;
}

export function EmitDDayPropellerFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.14, 0.0, 0.0, "X", 0.24, 0.08, 0.42, 10, CourseMaterial.KerbRed));
    Out.push(...EmitTranslatedBox(-0.02, 0.0, -0.09, 0.05, 2.88, 0.18, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox( 0.05, 0.0, -1.44, 0.05, 0.18, 2.88, CourseMaterial.PaintWhite));
    return Out;
}

// 📝 Detailed Round Steel Teller Anti-Tank Landmine (14-sided cylindrical body + fluted pressure plate + crimson fuze!)
export function EmitDDayLandmineFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.08, "Z", 0.68, 0.62, 0.18, 14, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.22, "Z", 0.46, 0.42, 0.07, 12, CourseMaterial.KerbRed));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.30, "Z", 0.16, 0.12, 0.07, 10, CourseMaterial.TrafficRed));
    return Out;
}

// 📝 Finned 500-lb General-Purpose Aerial Bomb (cylindrical body + tapered nosecone + cruciform box tail fins!)
export function EmitDDayAerialBombFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder( 0.05, 0.0, 0.22, "X", 0.22, 0.22, 1.05, 12, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder( 0.78, 0.0, 0.22, "X", 0.21, 0.06, 0.38, 12, CourseMaterial.BannerAmber));
    Out.push(...EmitTaperedCylinder(-0.68, 0.0, 0.22, "X", 0.21, 0.10, 0.38, 12, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-0.82, 0.0,  0.22 - 0.34, 0.28, 0.06, 0.68, CourseMaterial.BannerAmber));
    Out.push(...EmitTranslatedBox(-0.82, 0.0,  0.19,        0.28, 0.68, 0.06, CourseMaterial.KerbRed));
    return Out;
}

// 📝 Ogive 155mm High-Explosive Artillery Shell (copper driving band + glowing hot ogive nose!)
export function EmitDDayArtilleryShellFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(-0.18, 0.0, 0.16, "X", 0.15, 0.15, 0.72, 10, CourseMaterial.BannerAmber));
    Out.push(...EmitTaperedCylinder( 0.38, 0.0, 0.16, "X", 0.145, 0.04, 0.38, 10, CourseMaterial.Headlight));
    return Out;
}

// 📝 Incandescent Tracer Round
export function EmitDDayTracerBoltFacets()
{
    return EmitTaperedCylinder(0.0, 0.0, 0.06, "X", 0.055, 0.035, 2.15, 6, CourseMaterial.LampWarm);
}

//------------------------------------------------------------------------------------------------------------------------
//                                  D-DAY SHAPE CATALOGS & ASSAULT RAMP SURFACES
//------------------------------------------------------------------------------------------------------------------------

export const DDayStaticShapes = Object.freeze({
    DDayBunker:           { Emit: EmitDDayBunkerFacets,           Voxel: 0.22, Cards: 4 },
    DDayCzechHedgehog:    { Emit: EmitCzechHedgehogFacets,        Voxel: 0.12, Cards: 4 },
    DDayDragonsTeeth:     { Emit: EmitDragonsTeethFacets,         Voxel: 0.16, Cards: 4 },
    DDaySandbagBarricade: { Emit: EmitSandbagBarricadeFacets,     Voxel: 0.14, Cards: 4 },
    DDayLandingCraft:     { Emit: EmitLandingCraftFacets,         Voxel: 0.24, Cards: 4 },
    DDayAssaultRamp:      { Emit: EmitDDayAssaultRampFacets,      Voxel: 0.0,  Cards: 0, Distance: false },
    DDayWallSegment:      { Emit: EmitTheWallSegmentFacets,       Voxel: 0.38, Cards: 4 },
    DDayWallBreachGate:   { Emit: EmitTheWallBreachGateFacets,    Voxel: 0.34, Cards: 4 },
    DDayMineMarker:       { Emit: EmitMinefieldMarkerFacets,      Voxel: 0.0,  Cards: 0, Distance: false },
    ConstructionDrum:     { Emit: EmitConstructionDrumFacets,     Voxel: 0.06, Cards: 6 }
});

export const DDayCombatShapes = Object.freeze({
    DDayTankHull:       { Emit: EmitDDayTankHullFacets,       Voxel: 0.0, Cards: 0, Distance: false },
    DDayTankTurret:     { Emit: EmitDDayTankTurretFacets,     Voxel: 0.0, Cards: 0, Distance: false },
    DDayMgTurret:       { Emit: EmitDDayMgTurretFacets,       Voxel: 0.0, Cards: 0, Distance: false },
    DDayHeavyCannon:    { Emit: EmitDDayHeavyCannonFacets,    Voxel: 0.0, Cards: 0, Distance: false },
    DDayAircraft:       { Emit: EmitDDayAircraftFacets,       Voxel: 0.0, Cards: 0, Distance: false },
    DDayPropeller:      { Emit: EmitDDayPropellerFacets,      Voxel: 0.0, Cards: 0, Distance: false },
    DDayLandmine:       { Emit: EmitDDayLandmineFacets,       Voxel: 0.0, Cards: 0, Distance: false },
    DDayAerialBomb:     { Emit: EmitDDayAerialBombFacets,     Voxel: 0.0, Cards: 0, Distance: false },
    DDayArtilleryShell: { Emit: EmitDDayArtilleryShellFacets, Voxel: 0.0, Cards: 0, Distance: false },
    DDayTracerBolt:     { Emit: EmitDDayTracerBoltFacets,     Voxel: 0.0, Cards: 0, Distance: false }
});

//------------------------------------------------------------------------------------------------------------------------
//                      TERRAIN-GROUNDED EMPLACEMENT COORDINATES & ASSAULT RAMP PHYSICS SURFACES
//------------------------------------------------------------------------------------------------------------------------

export const DDayBounds = Object.freeze({
    Minimum: [-265.0, -165.0],
    Maximum: [ 285.0,  165.0]
});

export const DDayWallGoalX = 188.0;

const RawBunkerXY = [
    { X: -96.0, Y: -30.0, Yaw:  Math.PI - 0.24 },
    { X: -96.0, Y:  30.0, Yaw: -Math.PI + 0.24 },
    { X: -18.0, Y: -32.0, Yaw:  Math.PI - 0.20 },
    { X: -18.0, Y:  32.0, Yaw: -Math.PI + 0.20 },
    { X:  66.0, Y: -29.0, Yaw:  Math.PI - 0.22 },
    { X:  66.0, Y:  29.0, Yaw: -Math.PI + 0.22 },
    { X:  66.0, Y: -46.0, Yaw:  Math.PI - 0.30 },
    { X:  66.0, Y:  46.0, Yaw: -Math.PI + 0.30 },
    { X: 138.0, Y: -32.0, Yaw:  Math.PI - 0.22 },
    { X: 138.0, Y:  32.0, Yaw: -Math.PI + 0.22 }
];

export const DDayBunkerSites = Object.freeze(RawBunkerXY.map((B) => ({
    Pos: [B.X, B.Y, QueryDDayTerrainHeight(B.X, B.Y)],
    Yaw: B.Yaw
})));

// 6 Bunker MG Turrets & 6 Heavy 155mm Cannons seated flush atop their exact terrain-grounded Bunker / Wall pedestals!
export const DDayMgMounts = Object.freeze([0, 1, 2, 3, 4, 5].map((Idx) =>
{
    const B = DDayBunkerSites[Idx];
    return [B.Pos[0] + Math.cos(B.Yaw) * 0.25, B.Pos[1] + Math.sin(B.Yaw) * 0.25, B.Pos[2] + 3.78];
}));

export const DDayCannonMounts = Object.freeze([
    ...[6, 7, 8, 9].map((Idx) =>
    {
        const B = DDayBunkerSites[Idx];
        return [B.Pos[0] + Math.cos(B.Yaw) * 0.25, B.Pos[1] + Math.sin(B.Yaw) * 0.25, B.Pos[2] + 3.78];
    }),
    [194.0, -28.0, QueryDDayTerrainHeight(194.0, -28.0) + 14.05],
    [194.0,  28.0, QueryDDayTerrainHeight(194.0,  28.0) + 14.05]
]);

// 28 Tactical Landmine Coordinates (placed outside the Tank cover lanes so Tanks clear some & players read the field!)
export const DDayMineCoordinates = Object.freeze([
    [-148.0, -13.5], [-140.0,   4.8], [-130.0,  14.5], [-122.0,  -5.2],
    [-110.0, -17.5], [-102.0,  11.5], [ -86.0,  -8.5], [ -76.0,  16.2],
    [ -62.0,   3.2], [ -52.0, -14.2], [ -40.0,  12.4], [ -28.0,  -4.8],
    [ -12.0,  17.0], [  -2.0, -11.5], [  12.0,   4.8], [  24.0, -15.5],
    [  36.0,  13.2], [  48.0,  -4.2], [  60.0,  11.2], [  78.0, -12.8],
    [  92.0,   5.4], [ 106.0, -15.5], [ 118.0,  13.8], [ 128.0,  -3.6],
    [ 144.0,  10.8], [ 156.0, -10.5], [ 166.0,   5.2], [ 174.0,  -5.4]
]);

const AssaultRampSpecs = [
    { CX: -118.0, CY:  -4.5, HalfRun: 6.4, HalfWidth: 3.6, LiftZ: 1.38 },
    { CX:  -38.0, CY:  -3.5, HalfRun: 6.4, HalfWidth: 3.6, LiftZ: 1.38 },
    { CX:   44.0, CY:  -2.0, HalfRun: 6.4, HalfWidth: 3.6, LiftZ: 1.38 },
    { CX:  126.0, CY:   4.5, HalfRun: 6.4, HalfWidth: 3.6, LiftZ: 1.38 }
];

export function ResolveDDaySurfaces()
{
    return AssaultRampSpecs.map((Spec, Index) =>
    {
        const BaseZ = QueryDDayTerrainHeight(Spec.CX, Spec.CY);
        const MinX  = Spec.CX - Spec.HalfRun,   MaxX = Spec.CX + Spec.HalfRun;
        const MinY  = Spec.CY - Spec.HalfWidth, MaxY = Spec.CY + Spec.HalfWidth;
        return {
            Key:          `dday_assault_ramp_${Index}`,
            Category:     SurfaceCategory.SplineRoad,
            Origin:       [0.0, 0.0, 0.0],
            CosineYaw:    1.0,
            SineYaw:      0.0,
            Yaw:          0.0,
            Friction:     1.08,
            WorldMinimum: [MinX, MinY, -0.50],
            WorldMaximum: [MaxX, MaxY, BaseZ + Spec.LiftZ + 1.20],
            Bounds:       { Minimum: [MinX, MinY, -0.50], Maximum: [MaxX, MaxY, BaseZ + Spec.LiftZ + 1.20] },
            CastRay(RayOrigin, RayDir, MaxTravel)
            {
                if (Math.abs(RayDir[2]) < 1.0e-5)
                    return null;
                const MidX = RayOrigin[0] + RayDir[0] * 0.5 * MaxTravel;
                const MidY = RayOrigin[1] + RayDir[1] * 0.5 * MaxTravel;
                if (MidX < MinX || MidX > MaxX || MidY < MinY || MidY > MaxY)
                    return null;
                const U = (MidX - Spec.CX) / Spec.HalfRun;
                const EndA = QueryDDayTerrainHeight(MinX, MidY);
                const EndB = QueryDDayTerrainHeight(MaxX, MidY);
                const Baseline = 0.5 * (EndA + EndB) + 0.5 * (EndB - EndA) * U;
                const Height = Baseline + 0.5 * Spec.LiftZ * (1.0 + Math.cos(Math.PI * U));
                const T = (Height - RayOrigin[2]) / RayDir[2];
                if (T < 0.0 || T > MaxTravel)
                    return null;
                const Slope = 0.5 * (EndB - EndA) / Spec.HalfRun - 0.5 * Spec.LiftZ * (Math.PI / Spec.HalfRun) * Math.sin(Math.PI * U);
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
//                  D-DAY PLACEMENTS & HIGH-RESOLUTION 3D UNEVEN TERRAIN MESH
//------------------------------------------------------------------------------------------------------------------------

export function ResolveDDayPlacements()
{
    const P = [];
    const GroundAt = (X, Y, Offset = 0.0) => [X, Y, QueryDDayTerrainHeight(X, Y) + Offset];

    // ① 3 Higgins LCVP Steel Landing Craft on the Beachhead Surf
    for (const [Idx, LY] of [-18.0, 0.0, 18.0].entries())
    {
        P.push({
            Name:     `Landing Craft LCVP-${Idx + 1}`,
            Shape:    "DDayLandingCraft",
            Position: GroundAt(-210.0, LY, -0.02),
            Yaw:      0.0,
            Collider: true
        });
    }

    // ② 10 Atlantic-Wall Octagonal Casemate Bunkers
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

    // ③ 4 Bailey Truss Steel Engineer Assault Ramps bridging major shell craters
    AssaultRampSpecs.forEach((Spec, Idx) =>
    {
        P.push({
            Name:     `Engineer Assault Ramp ${Idx + 1}`,
            Shape:    "DDayAssaultRamp",
            Position: GroundAt(Spec.CX, Spec.CY, 0.0),
            Yaw:      0.0,
            Collider: false
        });
    });

    // ④ 22 Tilted 3-Axis Steel Czech Hedgehogs (wide clear lanes left for Tank columns & weaving cars!)
    const Hedgehogs = [
        [-168.0, -16.5], [-166.0,  16.5], [-152.0, -22.5], [-150.0,  22.5],
        [-128.0, -21.5], [-126.0,  21.5], [ -88.0, -19.5], [ -88.0,  19.5],
        [ -60.0,  21.0], [ -58.0, -21.0], [ -24.0, -18.5], [ -24.0,  18.5],
        [   6.0, -21.5], [   8.0,  21.5], [  42.0, -19.5], [  44.0,  21.5],
        [  84.0, -19.5], [  84.0,  19.5], [ 122.0, -19.5], [ 122.0,  19.5],
        [ 160.0, -16.5], [ 160.0,  16.5]
    ];
    Hedgehogs.forEach(([X, Y], Idx) =>
    {
        P.push({
            Name:     `Czech Hedgehog ${Idx + 1}`,
            Shape:    "DDayCzechHedgehog",
            Position: GroundAt(X, Y, -0.06),
            Yaw:      Idx * 0.55,
            Collider: true
        });
    });

    // ⑤ Truncated-Pyramid Concrete Dragon's Teeth Wing Lines
    const TeethPositions = [
        [-140.0, -30.0], [-140.0,  30.0], [ -72.0, -30.0], [ -72.0,  30.0],
        [   0.0, -30.0], [   0.0,  30.0], [  96.0, -30.0], [  96.0,  30.0],
        [ 168.0, -26.0], [ 168.0,  26.0]
    ];
    TeethPositions.forEach(([X, Y], Idx) =>
    {
        P.push({
            Name:     `Dragon's Teeth Line ${Idx + 1}`,
            Shape:    "DDayDragonsTeeth",
            Position: GroundAt(X, Y, 0.0),
            Yaw:      0.0,
            Collider: true
        });
    });

    // ⑥ Curved Sandbag Emplacements (staggered outside Tank tracks so Tanks advance cleanly!)
    const Sandbags = [
        [-136.0,  -4.0], [ -98.0, -13.5], [ -98.0,  13.5], [ -68.0, -13.0],
        [ -34.0,  13.5], [   2.0, -13.0], [  28.0,  13.5], [  58.0, -13.0],
        [  90.0,  -4.0], [ 132.0, -13.5], [ 132.0,  13.5], [ 172.0, -14.0],
        [ 172.0,  14.0]
    ];
    Sandbags.forEach(([X, Y], Idx) =>
    {
        P.push({
            Name:     `Sandbag Emplacement ${Idx + 1}`,
            Shape:    "DDaySandbagBarricade",
            Position: GroundAt(X, Y, -0.08),
            Yaw:      (Idx % 2 === 0 ? 0.10 : -0.10),
            Collider: true
        });
    });

    // ⑦ Minefield Warning Signposts
    for (const [Idx, MX] of [-150.0, -82.0, -8.0, 74.0, 142.0].entries())
    {
        for (const SY of [-24.5, 24.5])
        {
            P.push({
                Name:     `Minefield Warning Sign ${Idx * 2 + (SY > 0 ? 2 : 1)}`,
                Shape:    "DDayMineMarker",
                Position: GroundAt(MX, SY, -0.05),
                Yaw:      0.0,
                Collider: false
            });
        }
    }

    // ⑧ THE WALL — Monumental Fortress Curtain + Illuminated Central Breach Gate atop the +1.62 m Glacis!
    P.push({
        Name:     "The Wall — Central Breach Gate",
        Shape:    "DDayWallBreachGate",
        Position: GroundAt(194.0, 0.0, 0.0),
        Yaw:      0.0,
        Collider: false
    });
    for (const WallY of [-106.0, -62.0, -39.5, 39.5, 62.0, 106.0])
    {
        P.push({
            Name:     `The Wall Fortress Curtain Y=${WallY}`,
            Shape:    "DDayWallSegment",
            Position: GroundAt(195.5, WallY, 0.0),
            Yaw:      0.0,
            Collider: true
        });
    }

    return P;
}

export function ResolveDDayBreakables()
{
    const Spots = [
        [-162.0,   3.5], [-108.0,  -4.2], [ -52.0,   4.0], [ -10.0,   3.2],
        [  38.0,  -3.5], [  74.0,   4.0], [ 118.0,  -4.8], [ 152.0,   3.5]
    ];
    return Spots.map(([X, Y], I) => ({
        Name:     `Munitions Supply Crate ${I + 1}`,
        Material: (I & 1) === 0 ? "wood" : "concrete",
        Mode:     "baked",
        Shape:    { Kind: "box", Extent: [1.35, 1.35, 1.20] },
        Position: [X, Y, QueryDDayTerrainHeight(X, Y) + 0.02],
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
        [-178.0, -8.5], [-178.0,  8.5], [-118.0, -8.6], [-118.0, -0.4],
        [  44.0, -6.2], [  44.0,  2.2], [ 126.0,  0.4], [ 126.0,  8.6],
        [ 184.0, -9.5], [ 184.0,  9.5]
    ];
    return Drums.map(([X, Y], I) => ({
        Name:     `Combat Drum ${I + 1}`,
        Group:    "lone",
        Shape:    "ConstructionDrum",
        Position: [X, Y, QueryDDayTerrainHeight(X, Y) + 0.03],
        Yaw:      I * 0.5
    }));
}

// 📝 High-Resolution 3D Triangulated Uneven Terrain Mesh matching QueryDDayTerrainHeight(X, Y) 1-for-1!
export function EmitDDayGroundFacets()
{
    const Facets = [];
    const MinX = -228.0, MaxX = 236.0, NX = 148; // ~3.1 m longitudinal cells
    const MinY = -88.0,  MaxY =  88.0, NY =  72; // ~2.4 m lateral cells (captures crater rims & bowls crisply!)
    const DX = (MaxX - MinX) / NX;
    const DY = (MaxY - MinY) / NY;

    // Precompute vertex heights & smooth terrain normals so ridges & craters shade with rich 3D relief!
    const ZGrid = new Float32Array((NX + 1) * (NY + 1));
    const NGrid = new Array((NX + 1) * (NY + 1));
    for (let IX = 0; IX <= NX; ++IX)
    {
        const X = MinX + IX * DX;
        for (let IY = 0; IY <= NY; ++IY)
        {
            const Y = MinY + IY * DY;
            const Idx = IX * (NY + 1) + IY;
            ZGrid[Idx] = QueryDDayTerrainHeight(X, Y);
            const SX = (QueryDDayTerrainHeight(X + 0.35, Y) - QueryDDayTerrainHeight(X - 0.35, Y)) / 0.70;
            const SY = (QueryDDayTerrainHeight(X, Y + 0.35) - QueryDDayTerrainHeight(X, Y - 0.35)) / 0.70;
            const NL = Math.hypot(SX, SY, 1.0);
            NGrid[Idx] = [-SX / NL, -SY / NL, 1.0 / NL];
        }
    }

    const PickMaterial = (X, Y, Z) =>
    {
        if (X < -215.0) return CourseMaterial.WallCobalt;
        if (X < -158.0) return CourseMaterial.Sand;
        // Scorched crater interiors read as dark churned earth; tank-track lanes read as compacted gravel/asphalt; ridges as olive turf!
        if (Z < 1.18 && X < 176.0) return CourseMaterial.Dirt;
        if (Math.abs(Y) < 3.2 || Math.abs(Math.abs(Y) - 9.0) < 2.6 || Math.abs(Math.abs(Y) - 18.0) < 2.6)
            return CourseMaterial.AsphaltPatch;
        if (Math.abs(Y) > 34.0)
            return CourseMaterial.Grass;
        return CourseMaterial.Dirt;
    };

    for (let IX = 0; IX < NX; ++IX)
    {
        const X0 = MinX + IX * DX, X1 = X0 + DX;
        for (let IY = 0; IY < NY; ++IY)
        {
            const Y0 = MinY + IY * DY, Y1 = Y0 + DY;
            const I00 = IX * (NY + 1) + IY;
            const I10 = (IX + 1) * (NY + 1) + IY;
            const I11 = (IX + 1) * (NY + 1) + (IY + 1);
            const I01 = IX * (NY + 1) + (IY + 1);

            const P00 = [X0, Y0, ZGrid[I00]], P10 = [X1, Y0, ZGrid[I10]];
            const P11 = [X1, Y1, ZGrid[I11]], P01 = [X0, Y1, ZGrid[I01]];
            const AvgZ = 0.25 * (ZGrid[I00] + ZGrid[I10] + ZGrid[I11] + ZGrid[I01]);
            const Family = PickMaterial(0.5 * (X0 + X1), 0.5 * (Y0 + Y1), AvgZ);

            Facets.push({
                Family,
                Corners: [P00, P10, P11],
                Normals: [NGrid[I00], NGrid[I10], NGrid[I11]]
            });
            Facets.push({
                Family,
                Corners: [P00, P11, P01],
                Normals: [NGrid[I00], NGrid[I11], NGrid[I01]]
            });
        }
    }

    // Outer Horizon Skirts matching edge heights cleanly out to ±900 m
    const Quad = (X0, Y0, Z00, X1, Y1, Z10, Z11, Z01, Family) =>
    {
        Facets.push(
            { Family, Corners: [[X0, Y0, Z00], [X1, Y0, Z10], [X1, Y1, Z11]] },
            { Family, Corners: [[X0, Y0, Z00], [X1, Y1, Z11], [X0, Y1, Z01]] }
        );
    };
    Quad(-900.0, -900.0, 0.04, MinX,  900.0, 0.04, 0.04, 0.04, CourseMaterial.WallCobalt);
    Quad( MaxX,  -900.0, 1.62, 900.0, 900.0, 1.62, 1.62, 1.62, CourseMaterial.Grass);
    Quad( MinX,  -900.0, 1.60, MaxX,   MinY, 1.60, 2.80, 2.80, CourseMaterial.Grass);
    Quad( MinX,    MaxY, 2.80, MaxX,  900.0, 2.80, 1.60, 1.60, CourseMaterial.Grass);
    return Facets;
}

export const DDaySpawn = Object.freeze({
    Position: [-194.0, 0.0, QueryDDayTerrainHeight(-194.0, 0.0) + 0.63],
    Yaw:      0.0
});

export const DDayZones = Object.freeze([
    { Name: "Beachhead Landing Craft", Position: [-194.0,   0.0], Yaw:  0.0, Note: "Wet sand ramp & Tank column" },
    { Name: "Sector 1 · Crater Ridge", Position: [-110.0,   0.0], Yaw:  0.0, Note: "Shell craters, bunkers & mines" },
    { Name: "Sector 2 · Tank Spearhead",Position:[ -15.0,  -8.5], Yaw:  0.0, Note: "Ride in Allied Tank cover!" },
    { Name: "Sector 3 · Artillery Valley",Position:[ 78.0,  0.0], Yaw:  0.0, Note: "155mm coastal cannon barrage" },
    { Name: "THE WALL · Breach Gate",  Position: [ 178.0,   0.0], Yaw:  0.0, Note: "Fortress glacis & victory arch" }
]);
